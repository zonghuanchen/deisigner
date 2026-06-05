import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { CameraModel } from '@designer/core/model/CameraModel';
import { CameraManager } from '@designer/core/model/CameraManager';
import { App } from '@designer/core';
import { Scene2D } from '../index';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { CAMERA_MODEL } from '@designer/core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a CameraModel.
 * Renders camera position and target as draggable points connected by a dashed line.
 * Dragging either point syncs changes back to the active CameraModel.
 */
export class Camera2D extends Base2DDisplay{
    private positionPoint!: PIXI.Graphics;
    private targetPoint!: PIXI.Graphics;
    private dashedLine!: PIXI.Graphics;
    private cameraModel: CameraModel;
    private cameraManager!: CameraManager;
    private boundOnCameraChange: () => void;
    private boundOnManagerChange: () => void;
    private isVisible: boolean = false;
    
    // Drag state
    private isDraggingPosition: boolean = false;
    private isDraggingTarget: boolean = false;
    private dragStartPosition: { x: number; y: number } | null = null;
    private dragStartCameraPos: THREE.Vector3 | null = null;
    private dragStartCameraTarget: THREE.Vector3 | null = null;
    
    // Visual configuration
    private readonly POINT_RADIUS = 8;
    private readonly POINT_COLOR_POSITION = 0x0066ff; // Blue for camera position
    private readonly POINT_COLOR_TARGET = 0xff6600; // Orange for target
    private readonly LINE_COLOR = 0x999999; // Gray for dashed line
    private readonly LINE_WIDTH = 2;
    private readonly DASH_LENGTH = 10;
    private readonly GAP_LENGTH = 5;

    constructor(cameraModel: CameraModel) {
        super();
        this.cameraModel = cameraModel;
        this.boundOnCameraChange = this.onCameraChange.bind(this);
        this.boundOnManagerChange = this.onManagerChange.bind(this);
        
        // Wait for Scene2D to be fully initialized before creating visuals
        this.waitForSceneInit(() => {
            this.initializeVisuals();
            // Defer CameraManager access to avoid circular dependency during construction
            // Use microtask to ensure CameraModel construction is complete
            queueMicrotask(() => {
                this.cameraManager = App.getInstance().getCameraManager();
                this.cameraManager.addEventListener('change', this.boundOnManagerChange);
                this.updateVisibility();
            });
        });
    }
    
    /**
     * Initialize visual elements after Scene2D is ready
     */
    private initializeVisuals(): void {
        // Create dashed line
        this.dashedLine = new PIXI.Graphics();
        this.dashedLine.visible = false;
        this.scene2D.getStage().addChild(this.dashedLine);
        
        // Create position point (camera location)
        this.positionPoint = new PIXI.Graphics();
        this.positionPoint.interactive = true;
        this.positionPoint.cursor = 'move';
        this.positionPoint.visible = false;
        this.drawPoint(this.positionPoint, this.POINT_COLOR_POSITION);
        this.scene2D.getStage().addChild(this.positionPoint);
        
        // Create target point (camera look-at)
        this.targetPoint = new PIXI.Graphics();
        this.targetPoint.interactive = true;
        this.targetPoint.cursor = 'move';
        this.targetPoint.visible = false;
        this.drawPoint(this.targetPoint, this.POINT_COLOR_TARGET);
        this.scene2D.getStage().addChild(this.targetPoint);
        
        // Set initial z-index based on model position
        this.updateZIndex();
        
        // Setup drag interactions
        this.setupDragInteraction(this.positionPoint, 'position');
        this.setupDragInteraction(this.targetPoint, 'target');
        
        // Listen for camera changes
        this.cameraModel.addEventListener('change', this.boundOnCameraChange);
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
            // Stop event propagation to prevent canvas pan
            event.stopPropagation();
            event.preventDefault();
            
            // Notify Scene2D that we're dragging a camera point
            this.scene2D.setDraggingCameraPoint(true);
            
            // Record the start position
            this.dragStartPosition = { x: event.global.x, y: event.global.y };
            this.dragStartCameraPos = this.cameraModel.position.clone();
            this.dragStartCameraTarget = this.cameraModel.target.clone();
            
            if (type === 'position') {
                this.isDraggingPosition = true;
            } else {
                this.isDraggingTarget = true;
            }
        });
        
        point.on('globalpointermove', (event: PIXI.FederatedPointerEvent) => {
            if ((type === 'position' && this.isDraggingPosition) ||
                (type === 'target' && this.isDraggingTarget)) {
                // Stop event propagation to prevent canvas pan
                event.stopPropagation();
                
                if (!this.dragStartPosition || !this.dragStartCameraPos || !this.dragStartCameraTarget) return;
                
                const currentGlobalPos = event.global;
                
                // Calculate delta in screen coordinates
                const deltaX = currentGlobalPos.x - this.dragStartPosition.x;
                const deltaY = currentGlobalPos.y - this.dragStartPosition.y;
                
                // Convert delta from screen pixels to world coordinates
                // worldToScreen applies PPU * zoomScale, so invert both here
                const zoomScale = this.scene2D.getZoomScale();
                const worldDeltaX = deltaX / (this.PIXELS_PER_UNIT * zoomScale);
                const worldDeltaY = -deltaY / (this.PIXELS_PER_UNIT * zoomScale); // Invert Y axis
                
                // Apply delta to the start position
                if (type === 'position') {
                    this.cameraModel.position = new THREE.Vector3(
                        this.dragStartCameraPos.x + worldDeltaX,
                        this.dragStartCameraPos.y + worldDeltaY,
                        this.dragStartCameraPos.z
                    );
                } else {
                    this.cameraModel.target = new THREE.Vector3(
                        this.dragStartCameraTarget.x + worldDeltaX,
                        this.dragStartCameraTarget.y + worldDeltaY,
                        this.dragStartCameraTarget.z
                    );
                }
            }
        });
        
        const endDrag = () => {
            this.isDraggingPosition = false;
            this.isDraggingTarget = false;
            this.dragStartPosition = null;
            this.dragStartCameraPos = null;
            this.dragStartCameraTarget = null;
            
            // Notify Scene2D that we're no longer dragging
            this.scene2D.setDraggingCameraPoint(false);
        };
        
        point.on('pointerup', endDrag);
        point.on('pointerupoutside', endDrag);
    }
    

    
    /**
     * Update the visual representation based on camera model state
     */
    update(): void {
        
        // Update position point
        const posScreen = this.worldToScreen(this.cameraModel.position.x, this.cameraModel.position.y);
        this.positionPoint.position.set(posScreen.x, posScreen.y);
        
        // Update target point
        const targetScreen = this.worldToScreen(this.cameraModel.target.x, this.cameraModel.target.y);
        this.targetPoint.position.set(targetScreen.x, targetScreen.y);
        
        // Update dashed line
        this.drawDashedLine(posScreen, targetScreen);
        
        // Update z-index based on model position
        this.updateZIndex();
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
        if (this.isVisible) {
            this.update();
        }
    }
    
    /**
     * Handle camera manager change events (camera switching)
     */
    private onManagerChange(): void {
        this.updateVisibility();
    }
    
    /**
     * Update visibility based on whether this camera is the active one
     */
    private updateVisibility(): void {
        const activeCamera = this.cameraManager.getActiveCamera();
        const shouldBeVisible = activeCamera === this.cameraModel;
        
        if (shouldBeVisible && !this.isVisible) {
            // Show visuals
            this.positionPoint.visible = true;
            this.targetPoint.visible = true;
            this.dashedLine.visible = true;
            this.isVisible = true;
            this.update();
        } else if (!shouldBeVisible && this.isVisible) {
            // Hide visuals
            this.positionPoint.visible = false;
            this.targetPoint.visible = false;
            this.dashedLine.visible = false;
            this.isVisible = false;
        }
    }
    
    /**
     * Dispose this 2D camera display
     */
    dispose(): void {
        this.cameraModel.removeEventListener('change', this.boundOnCameraChange);
        this.cameraManager.removeEventListener('change', this.boundOnManagerChange);
        
        if (this.positionPoint.parent) {
            this.positionPoint.parent.removeChild(this.positionPoint);
        }
        if (this.targetPoint.parent) {
            this.targetPoint.parent.removeChild(this.targetPoint);
        }
        if (this.dashedLine.parent) {
            this.dashedLine.parent.removeChild(this.dashedLine);
        }
        
        this.positionPoint.destroy();
        this.targetPoint.destroy();
        this.dashedLine.destroy();
    }
    
    /**
     * Update z-index based on model position.z
     */
    private updateZIndex(): void {
        // CameraModel has position property (THREE.Vector3)
        const positionZ = this.cameraModel.position.z;
        this.scene2D.updateDisplayZIndex(this.positionPoint, positionZ);
        this.scene2D.updateDisplayZIndex(this.targetPoint, positionZ);
        this.scene2D.updateDisplayZIndex(this.dashedLine, positionZ);
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(CAMERA_MODEL, Camera2D);
