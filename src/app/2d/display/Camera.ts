import * as PIXI from 'pixi.js';
import { CameraModel } from '../../../core/model/CameraModel';
import { App } from '../../../core';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { CAMERA_MODEL } from '../../../core/types';

/**
 * 2D display object for a CameraModel.
 * Renders camera position and target as draggable points connected by a dashed line.
 * Dragging either point syncs changes back to the active CameraModel.
 */
export class Camera2D {
    private positionPoint!: PIXI.Graphics;
    private targetPoint!: PIXI.Graphics;
    private dashedLine!: PIXI.Graphics;
    private cameraModel: CameraModel;
    private scene2D!: Scene2D;
    private initialized: boolean = false;
    
    // Drag state
    private isDraggingPosition: boolean = false;
    private isDraggingTarget: boolean = false;
    
    // Visual configuration
    private readonly POINT_RADIUS = 8;
    private readonly POINT_COLOR_POSITION = 0x0066ff; // Blue for camera position
    private readonly POINT_COLOR_TARGET = 0xff6600; // Orange for target
    private readonly LINE_COLOR = 0x999999; // Gray for dashed line
    private readonly LINE_WIDTH = 2;
    private readonly DASH_LENGTH = 10;
    private readonly GAP_LENGTH = 5;

    constructor(cameraModel: CameraModel) {
        this.cameraModel = cameraModel;
        
        // Get Scene2D instance (auto-creates if not exists)
        this.scene2D = Scene2D.getInstance();
        
        // Wait for Scene2D to be fully initialized before creating visuals
        this.waitForScene2DReady();
    }
    
    /**
     * Wait for Scene2D to be initialized, then initialize visuals
     */
    private async waitForScene2DReady(): Promise<void> {
        // Poll until Scene2D is initialized
        while (!this.scene2D.isInitialized()) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Now safe to initialize visuals
        this.initializeVisuals();
    }
    
    /**
     * Initialize visual elements after Scene2D is ready
     */
    private initializeVisuals(): void {
        if (this.initialized) return;
        this.initialized = true;
        
        // Create dashed line
        this.dashedLine = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.dashedLine);
        
        // Create position point (camera location)
        this.positionPoint = new PIXI.Graphics();
        this.positionPoint.interactive = true;
        this.positionPoint.cursor = 'move';
        this.drawPoint(this.positionPoint, this.POINT_COLOR_POSITION);
        this.scene2D.getStage().addChild(this.positionPoint);
        
        // Create target point (camera look-at)
        this.targetPoint = new PIXI.Graphics();
        this.targetPoint.interactive = true;
        this.targetPoint.cursor = 'move';
        this.drawPoint(this.targetPoint, this.POINT_COLOR_TARGET);
        this.scene2D.getStage().addChild(this.targetPoint);
        
        // Setup drag interactions
        this.setupDragInteraction(this.positionPoint, 'position');
        this.setupDragInteraction(this.targetPoint, 'target');
        
        // Initial render
        this.update();
        
        // Listen for camera changes
        this.cameraModel.addEventListener('change', this.onCameraChange.bind(this));
    }
    
    /**
     * Draw a circular point with the specified color
     */
    private drawPoint(graphics: PIXI.Graphics, color: number): void {
        graphics.clear();
        graphics.circle(0, 0, this.POINT_RADIUS);
        graphics.fill({ color });
        graphics.stroke({ color: 0xffffff, width: 2 });
    }
    
    /**
     * Setup drag interaction for a point
     */
    private setupDragInteraction(point: PIXI.Graphics, type: 'position' | 'target'): void {
        point.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
            if (type === 'position') {
                this.isDraggingPosition = true;
            } else {
                this.isDraggingTarget = true;
            }
        });
        
        point.on('globalpointermove', (event: PIXI.FederatedPointerEvent) => {
            if ((type === 'position' && this.isDraggingPosition) ||
                (type === 'target' && this.isDraggingTarget)) {
                const globalPos = event.global;
                
                // Convert screen coordinates to world coordinates (2D xy plane)
                const worldPos = this.screenToWorld(globalPos.x, globalPos.y);
                
                // Update camera model
                if (type === 'position') {
                    this.cameraModel.position.set(worldPos.x, worldPos.y, this.cameraModel.position.z);
                } else {
                    this.cameraModel.target.set(worldPos.x, worldPos.y, this.cameraModel.target.z);
                }
            }
        });
        
        const endDrag = () => {
            this.isDraggingPosition = false;
            this.isDraggingTarget = false;
        };
        
        point.on('pointerup', endDrag);
        point.on('pointerupoutside', endDrag);
    }
    
    /**
     * Convert screen coordinates to world coordinates
     * This assumes a top-down 2D view where the camera is looking at the xy plane
     */
    private screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
        // Get the PixiJS application canvas
        const canvas = this.scene2D.getCanvas();
        if (!canvas) {
            return { x: 0, y: 0 };
        }
        const rect = canvas.getBoundingClientRect();
        
        // Normalize to canvas coordinates
        const canvasX = screenX - rect.left;
        const canvasY = screenY - rect.top;
        
        // Apply a simple scale factor (adjust based on your viewport/camera zoom)
        // This is a basic implementation - you may need to integrate with your actual camera/view transform
        const scale = 0.01; // 100 pixels = 1 unit
        const worldX = (canvasX - rect.width / 2) * scale;
        const worldY = -(canvasY - rect.height / 2) * scale; // Invert Y axis
        
        return { x: worldX, y: worldY };
    }
    
    /**
     * Convert world coordinates to screen coordinates
     */
    private worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        const canvas = this.scene2D.getCanvas();
        if (!canvas) {
            return { x: 0, y: 0 };
        }
        const rect = canvas.getBoundingClientRect();
        
        const scale = 0.01;
        const screenX = worldX / scale + rect.width / 2;
        const screenY = -worldY / scale + rect.height / 2;
        
        return { x: screenX, y: screenY };
    }
    
    /**
     * Update the visual representation based on camera model state
     */
    update(): void {
        if (!this.initialized) return;
        
        // Update position point
        const posScreen = this.worldToScreen(this.cameraModel.position.x, this.cameraModel.position.y);
        this.positionPoint.position.set(posScreen.x, posScreen.y);
        
        // Update target point
        const targetScreen = this.worldToScreen(this.cameraModel.target.x, this.cameraModel.target.y);
        this.targetPoint.position.set(targetScreen.x, targetScreen.y);
        
        // Update dashed line
        this.drawDashedLine(posScreen, targetScreen);
    }
    
    /**
     * Draw a dashed line between two points
     */
    private drawDashedLine(start: { x: number; y: number }, end: { x: number; y: number }): void {
        this.dashedLine.clear();
        
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 1) return;
        
        const segments = Math.floor(distance / (this.DASH_LENGTH + this.GAP_LENGTH));
        
        for (let i = 0; i <= segments; i++) {
            const t1 = i * (this.DASH_LENGTH + this.GAP_LENGTH) / distance;
            const t2 = Math.min((i * (this.DASH_LENGTH + this.GAP_LENGTH) + this.DASH_LENGTH) / distance, 1);
            
            const x1 = start.x + dx * t1;
            const y1 = start.y + dy * t1;
            const x2 = start.x + dx * t2;
            const y2 = start.y + dy * t2;
            
            this.dashedLine.moveTo(x1, y1);
            this.dashedLine.lineTo(x2, y2);
        }
        
        this.dashedLine.stroke({ color: this.LINE_COLOR, width: this.LINE_WIDTH });
    }
    
    /**
     * Handle camera model change events
     */
    private onCameraChange(): void {
        this.update();
    }
    
    /**
     * Dispose this 2D camera display
     */
    dispose(): void {
        if (!this.initialized) return;
        
        this.cameraModel.removeEventListener('change', this.onCameraChange.bind(this));
        
        this.scene2D.getStage().removeChild(this.positionPoint);
        this.scene2D.getStage().removeChild(this.targetPoint);
        this.scene2D.getStage().removeChild(this.dashedLine);
        
        this.positionPoint.destroy();
        this.targetPoint.destroy();
        this.dashedLine.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(CAMERA_MODEL, Camera2D);
