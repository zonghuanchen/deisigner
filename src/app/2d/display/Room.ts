import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { RoomModel } from '../../../core/model/RoomModel';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { ROOM_MODEL } from '../../../core/types';

/**
 * 2D display object for a RoomModel.
 * Renders room ground as a filled polygon based on outerContour with gray color.
 */
export class Room2D extends THREE.EventDispatcher<any> {
    private roomGraphics!: PIXI.Graphics;
    private roomModel: RoomModel;
    private scene2D!: Scene2D;
    private boundOnRoomChange: () => void;
    
    // Visual configuration
    private readonly GROUND_COLOR = 0xcccccc; // Light gray for ground
    private readonly BORDER_COLOR = 0x666666; // Darker gray for border
    private readonly BORDER_WIDTH = 2; // Border width
    private readonly PIXELS_PER_UNIT = 25; // 25 pixels = 1 unit in world space

    constructor(roomModel: RoomModel) {
        super();
        this.roomModel = roomModel;
        this.boundOnRoomChange = this.onRoomChange.bind(this);
        
        // Get Scene2D instance (auto-creates if not exists)
        this.scene2D = Scene2D.getInstance();
        
        // Wait for Scene2D to be fully initialized before creating visuals
        if (this.scene2D.isInitialized()) {
            // Already initialized, create visuals immediately
            this.initializeVisuals();
        } else {
            // Wait for initialization
            this.scene2D.addEventListener('initialized', () => {
                this.initializeVisuals();
            });
        }
    }
    
    /**
     * Initialize visual elements after Scene2D is ready
     */
    private initializeVisuals(): void {
        // Create room graphics
        this.roomGraphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.roomGraphics);
        
        // Set initial z-index based on model position
        this.updateZIndex();
        
        // Initial render
        this.update();
        
        // Listen for room changes
        this.roomModel.addEventListener('change', this.boundOnRoomChange);
    }
    
    /**
     * Update the visual representation based on room model state
     */
    update(): void {
        this.roomGraphics.clear();
        
        // Check if room has valid outer contour
        if (!this.roomModel.outerContour || this.roomModel.outerContour.length < 3) {
            console.warn('RoomModel outerContour is invalid or has less than 3 points');
            return;
        }
        
        // Convert world coordinates to screen coordinates
        const screenPoints = this.roomModel.outerContour.map(point => 
            this.worldToScreen(point.x, point.y)
        );
        
        // Draw ground fill (gray)
        this.roomGraphics.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (let i = 1; i < screenPoints.length; i++) {
            this.roomGraphics.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
        this.roomGraphics.closePath();
        this.roomGraphics.fill({ color: this.GROUND_COLOR });
        
        // Draw border (darker gray)
        this.roomGraphics.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (let i = 1; i < screenPoints.length; i++) {
            this.roomGraphics.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
        this.roomGraphics.closePath();
        this.roomGraphics.stroke({ 
            color: this.BORDER_COLOR, 
            width: this.BORDER_WIDTH 
        });
        
        // Update z-index based on model position
        this.updateZIndex();
    }
    
    /**
     * Update z-index based on model position.z
     */
    private updateZIndex(): void {
        // For RoomModel, we need to check if it has a position property
        // Since RoomModel extends BaseModel which doesn't have position,
        // we'll use a default z value or check if the model has been extended
        const positionZ = (this.roomModel as any).position?.z || 0;
        this.scene2D.updateDisplayZIndex(this.roomGraphics, positionZ);
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
        
        // Get current zoom and pan from Scene2D
        const zoomScale = this.scene2D.getZoomScale();
        const panOffset = this.scene2D.getPanOffset();
        
        // Convert world coordinates to screen coordinates
        // Account for: zoom scale, pan offset, and PIXELS_PER_UNIT
        const screenX = worldX * this.PIXELS_PER_UNIT * zoomScale + panOffset.x + rect.width / 2;
        const screenY = -worldY * this.PIXELS_PER_UNIT * zoomScale + panOffset.y + rect.height / 2;
        
        return { x: screenX, y: screenY };
    }
    
    /**
     * Handle room model change events
     */
    private onRoomChange(): void {
        this.update();
    }
    
    /**
     * Dispose this 2D room display
     */
    dispose(): void {
        this.roomModel.removeEventListener('change', this.boundOnRoomChange);
        
        if (this.roomGraphics.parent) {
            this.roomGraphics.parent.removeChild(this.roomGraphics);
        }
        
        this.roomGraphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(ROOM_MODEL, Room2D);
