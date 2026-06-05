import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FurnitureModel } from '@designer/core/model/FurnitureModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { FURNITURE_MODEL } from '@designer/core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a FurnitureModel.
 * Loads the GLTF model, computes its 2D bounding box in local space, and renders
 * as an oriented outline (OBB) that rotates with the model.
 */
export class Furniture2D extends Base2DDisplay {
    private graphics!: PIXI.Graphics;
    private model: FurnitureModel;
    private loader: GLTFLoader;
    private boundOnChange: () => void;

    // 4 corners of the 2D bounding box in GLTF local architectural XY space
    private localCorners: Array<[number, number]> = [];

    // Visual configuration
    private readonly STROKE_COLOR = 0x666666;
    private readonly STROKE_WIDTH = 1;
    private readonly FILL_COLOR = 0x999999;
    

    constructor(model: FurnitureModel) {
        super();
        this.model = model;
        this.loader = new GLTFLoader();
        this.boundOnChange = this.onModelChange.bind(this);

        this.waitForSceneInit(() => {
            Promise.resolve().then(() => {
                this.initializeVisuals();
            });
        });
    }

    private initializeVisuals(): void {
        this.graphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.graphics);

        this.model.addEventListener('change', this.boundOnChange);
        this.loadAndComputeBounds();
    }

    /**
     * Load the GLTF and compute its 2D bounding box in local architectural XY space.
     * Three.js (x, y, z) → architectural (x, -z) for top-down projection.
     */
    private loadAndComputeBounds(): void {
        const gltfPath = this.model.gltfPath;
        if (!gltfPath) return;

        this.loader.load(
            gltfPath,
            (gltf: any) => {
                const box = new THREE.Box3().setFromObject(gltf.scene);
                // Extract 4 corners of the 2D footprint in local architectural XY
                // arch_x = three_x, arch_y = -three_z
                this.localCorners = [
                    [box.min.x, -box.max.z],
                    [box.max.x, -box.max.z],
                    [box.max.x, -box.min.z],
                    [box.min.x, -box.min.z],
                ];
                this.renderBounds();
            },
            undefined,
            (error: any) => {
                console.error(`Furniture2D: Error loading ${gltfPath}:`, error);
            }
        );
    }

    /**
     * Render the oriented 2D bounding box (OBB).
     * Applies scale → rotate (Z) → translate to the cached local corners,
     * so the outline rotates with the model.
     */
    private renderBounds(): void {
        this.graphics.clear();
        if (this.localCorners.length === 0) return;

        const { position, rotation, scale } = this.model;
        const cosR = Math.cos(rotation.z);
        const sinR = Math.sin(rotation.z);

        // Transform each local corner: scale → rotate Z → translate
        const transformed = this.localCorners.map(([lx, ly]): { x: number; y: number } => {
            const sx = lx * scale.x;
            const sy = ly * scale.y;
            const wx = sx * cosR - sy * sinR + position.x;
            const wy = sx * sinR + sy * cosR + position.y;
            return this.worldToScreen(wx, wy);
        });

        // Draw outline
        this.graphics.moveTo(transformed[0].x, transformed[0].y);
        for (let i = 1; i < transformed.length; i++) {
            this.graphics.lineTo(transformed[i].x, transformed[i].y);
        }
        this.graphics.closePath();
        this.graphics.stroke({ color: this.STROKE_COLOR, width: this.STROKE_WIDTH });
        this.graphics.fill({ color: this.FILL_COLOR });

        // Update z-index using model position
        this.updateDisplayZIndex(this.graphics, position.z);
    }

    private onModelChange(): void {
        this.renderBounds();
    }

    dispose(): void {
        this.model.removeEventListener('change', this.boundOnChange);

        if (this.graphics.parent) {
            this.graphics.parent.removeChild(this.graphics);
        }
        this.graphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(FURNITURE_MODEL, Furniture2D);
