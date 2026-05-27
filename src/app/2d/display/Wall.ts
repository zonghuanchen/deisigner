import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { WallModel } from '../../../core/model/WallModel';
import { FaceModel } from '../../../core/model/FaceModel';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { WALL_MODEL } from '../../../core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a WallModel.
 * Projects all wall faces onto the ground plane (xy) and draws their outlines with stroke.
 */
export class Wall2D extends Base2DDisplay {
    private wallGraphics!: PIXI.Graphics;
    private wallModel: WallModel;
    private boundOnWallChange: () => void;
    
    // Visual configuration
    private readonly FILL_COLOR = 0xCCCCCC; // Light gray fill for projection
    private readonly FILL_ALPHA = 0.3; // Semi-transparent fill
    private readonly STROKE_COLOR = 0x333333; // Dark gray stroke
    private readonly STROKE_WIDTH = 1; // Stroke width in pixels

    constructor(wallModel: WallModel) {
        super();
        this.wallModel = wallModel;
        this.boundOnWallChange = this.onWallChange.bind(this);
        
        // Wait for Scene2D to be fully initialized before creating visuals
        this.waitForSceneInit(() => {
            this.initializeVisuals();
        });
    }
    
    /**
     * Initialize visual elements after Scene2D is ready
     */
    private initializeVisuals(): void {
        this.wallGraphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.wallGraphics);
        
        this.updateZIndex();
        this.update();
        
        this.wallModel.addEventListener('change', this.boundOnWallChange);
    }
    
    /**
     * Draw the ground projection of a single face's contour (outer or inner).
     * Projects 3D vertices to 2D by dropping the z coordinate.
     */
    private drawContour(contour: THREE.Vector3[]): { x: number; y: number }[] {
        if (contour.length < 2) return [];
        const points: { x: number; y: number }[] = [];
        for (const v of contour) {
            points.push(this.worldToScreen(v.x, v.y));
        }
        return points;
    }

    /**
     * Draw a closed polygon from screen points with optional fill and stroke.
     */
    private drawPolygon(
        points: { x: number; y: number }[],
        fill: boolean,
        stroke: boolean
    ): void {
        if (points.length < 2) return;
        this.wallGraphics.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.wallGraphics.lineTo(points[i].x, points[i].y);
        }
        this.wallGraphics.closePath();
        if (fill) {
            this.wallGraphics.fill({ color: this.FILL_COLOR, alpha: this.FILL_ALPHA });
        }
        if (stroke) {
            this.wallGraphics.stroke({
                color: this.STROKE_COLOR,
                width: this.STROKE_WIDTH,
            });
        }
    }

    /**
     * Project a face onto the ground and draw its outline.
     * Handles both outer contour and inner contours (holes).
     */
    private drawFaceProjection(face: FaceModel): void {
        // Draw outer contour
        const outerPoints = this.drawContour(face.outerContour);
        if (outerPoints.length >= 2) {
            this.drawPolygon(outerPoints, true, true);
        }

        // Draw inner contours (holes) - stroke only, no fill
        for (const inner of face.innerContours) {
            const innerPoints = this.drawContour(inner);
            if (innerPoints.length >= 2) {
                this.drawPolygon(innerPoints, false, true);
            }
        }
    }

    /**
     * Update the visual representation by projecting all wall faces to the ground plane.
     */
    update(): void {
        this.wallGraphics.clear();
        
        if (!this.wallModel.from || !this.wallModel.to) {
            return;
        }
        
        // Draw all named faces (left, right, top, bottom, front, back)
        for (const face of this.wallModel.faces) {
            this.drawFaceProjection(face);
        }

        // Draw miter end cap faces and hole reveal faces (children that are FaceModel but not in named faces)
        const namedFaceIds = new Set(this.wallModel.faces.map(f => f.id));
        for (const child of this.wallModel.children) {
            if (child instanceof FaceModel && !namedFaceIds.has(child.id)) {
                this.drawFaceProjection(child);
            }
        }
        
        this.updateZIndex();
    }
    
    /**
     * Update z-index based on model position.z
     */
    private updateZIndex(): void {
        const positionZ = (this.wallModel as any).position?.z || 0;
        this.updateDisplayZIndex(this.wallGraphics, positionZ);
    }
    
    /**
     * Handle wall model change events
     */
    private onWallChange(): void {
        this.update();
    }
    
    /**
     * Dispose this 2D wall display
     */
    dispose(): void {
        this.wallModel.removeEventListener('change', this.boundOnWallChange);
        
        if (this.wallGraphics.parent) {
            this.wallGraphics.parent.removeChild(this.wallGraphics);
        }
        
        this.wallGraphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(WALL_MODEL, Wall2D);
