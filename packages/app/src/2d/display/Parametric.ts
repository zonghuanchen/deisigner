import * as PIXI from 'pixi.js';
import { extrusions } from '@jscad/modeling';
import { ParametricModel } from '@designer/core/model/ParametricModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { PARAMETRIC_MODEL } from '@designer/core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a ParametricModel.
 * Projects the 3D JSCAD geometry onto the ground plane (xy) and draws edge outlines.
 */
export class Parametric2D extends Base2DDisplay {
    private graphics!: PIXI.Graphics;
    private model: ParametricModel;
    private boundOnDirty: () => void;
    private boundOnTransformChange: () => void;

    // Visual configuration
    private readonly FILL_COLOR = 0x999999;
    private readonly STROKE_COLOR = 0x666666;
    private readonly STROKE_WIDTH = 1;

    constructor(model: ParametricModel) {
        super();
        this.model = model;
        this.boundOnDirty = this.onDirty.bind(this);
        this.boundOnTransformChange = this.onTransformChange.bind(this);

        this.waitForSceneInit(() => {
            this.initializeVisuals();
        });
    }

    private initializeVisuals(): void {
        this.graphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.graphics);

        this.update();

        this.model.addEventListener('dirty', this.boundOnDirty);
        this.model.addEventListener('transformChange', this.boundOnTransformChange);
    }

    private onDirty(): void {
        this.update();
    }

    private onTransformChange(): void {
        this.update();
    }

    /**
     * Rebuilds the 2D projection from the model's JSCAD geometry.
     * Uses @jscad/modeling extrusions.project() to project the 3D solid
     * onto the XY ground plane, then draws the resulting geom2 sides.
     */
    update(): void {
        this.graphics.clear();

        const graphData = this.model.getGraphData();
        if (!graphData || graphData.geometries.length === 0) return;

        // Extract RTS for 2D ground-plane transform
        const { position, rotation, scale } = graphData;
        const cosR = Math.cos(rotation.z);
        const sinR = Math.sin(rotation.z);

        // Apply scale → rotate (Z) → translate to a 2D point
        const transformPoint = (x: number, y: number): [number, number] => {
            const sx = x * scale.x;
            const sy = y * scale.y;
            return [
                sx * cosR - sy * sinR + position.x,
                sx * sinR + sy * cosR + position.y,
            ];
        };

        // Process each geometry independently
        for (const geom of graphData.geometries) {
            let projected: any;
            try {
                projected = extrusions.project({ axis: [0, 0, 1], origin: [0, 0, 0] }, geom);
            } catch {
                continue;
            }
            if (!projected || !projected.sides) continue;

            const sides: Array<[[number, number], [number, number]]> = projected.sides;
            if (sides.length === 0) continue;

            const polygons = this.chainSides(sides);

            // Draw each polygon: fill first, then stroke
            for (const polygon of polygons) {
                if (polygon.length < 3) continue;
                const [tx0, ty0] = transformPoint(polygon[0][0], polygon[0][1]);
                const p0 = this.worldToScreen(tx0, ty0);
                this.graphics.moveTo(p0.x, p0.y);
                for (let i = 1; i < polygon.length; i++) {
                    const [tx, ty] = transformPoint(polygon[i][0], polygon[i][1]);
                    const p = this.worldToScreen(tx, ty);
                    this.graphics.lineTo(p.x, p.y);
                }
                this.graphics.closePath();
            }
            this.graphics.fill({ color: this.FILL_COLOR });

            for (const polygon of polygons) {
                if (polygon.length < 3) continue;
                const [tx0, ty0] = transformPoint(polygon[0][0], polygon[0][1]);
                const p0 = this.worldToScreen(tx0, ty0);
                this.graphics.moveTo(p0.x, p0.y);
                for (let i = 1; i < polygon.length; i++) {
                    const [tx, ty] = transformPoint(polygon[i][0], polygon[i][1]);
                    const p = this.worldToScreen(tx, ty);
                    this.graphics.lineTo(p.x, p.y);
                }
                this.graphics.closePath();
            }
            this.graphics.stroke({ color: this.STROKE_COLOR, width: this.STROKE_WIDTH });
        }

        // Update z-index
        const positionZ = position.z || 0;
        this.updateDisplayZIndex(this.graphics, positionZ);
    }

    /**
     * Chain ordered sides into closed polygon(s).
     * Each side is [[x1,y1],[x2,y2]]. Sides sharing endpoints are merged into loops.
     */
    private chainSides(sides: Array<[[number, number], [number, number]]>): Array<Array<[number, number]>> {
        const polygons: Array<Array<[number, number]>> = [];
        const used = new Array(sides.length).fill(false);

        const ptKey = (p: [number, number]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;

        // Build adjacency: endpoint -> side indices
        const adj = new Map<string, number[]>();
        for (let i = 0; i < sides.length; i++) {
            const k0 = ptKey(sides[i][0]);
            const k1 = ptKey(sides[i][1]);
            if (!adj.has(k0)) adj.set(k0, []);
            if (!adj.has(k1)) adj.set(k1, []);
            adj.get(k0)!.push(i);
            adj.get(k1)!.push(i);
        }

        for (let start = 0; start < sides.length; start++) {
            if (used[start]) continue;

            const polygon: Array<[number, number]> = [];
            let edgeIdx = start;
            let current = sides[start][0];

            while (true) {
                used[edgeIdx] = true;
                const [a, b] = sides[edgeIdx];
                const keyA = ptKey(a), keyB = ptKey(b);
                const keyCur = ptKey(current);

                let next: [number, number];
                if (keyA === keyCur) {
                    polygon.push(a);
                    next = b;
                } else {
                    polygon.push(b);
                    next = a;
                }

                // Find next unused side connected to 'next'
                const candidates = adj.get(ptKey(next)) || [];
                let found = -1;
                for (const ci of candidates) {
                    if (!used[ci]) { found = ci; break; }
                }
                if (found === -1) break;
                current = next;
                edgeIdx = found;
            }

            if (polygon.length >= 3) {
                polygons.push(polygon);
            }
        }

        return polygons;
    }

    dispose(): void {
        this.model.removeEventListener('dirty', this.boundOnDirty);
        this.model.removeEventListener('transformChange', this.boundOnTransformChange);

        if (this.graphics.parent) {
            this.graphics.parent.removeChild(this.graphics);
        }
        this.graphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(PARAMETRIC_MODEL, Parametric2D);
