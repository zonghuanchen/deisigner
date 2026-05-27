import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { RoomModel } from '../../../core/model/RoomModel';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { ROOM_MODEL } from '../../../core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a RoomModel.
 * Renders room ground face as a filled polygon based on groundFace.outerContour.
 */
export class Room2D extends Base2DDisplay {
    private roomGraphics!: PIXI.Graphics;
    private roomModel: RoomModel;
    private boundOnRoomChange: () => void;
    private boundOnGroundChange: () => void;
    
    // Visual configuration
    private readonly GROUND_COLOR = 0xcccccc; // Light gray for ground
    private readonly BORDER_COLOR = 0x666666; // Darker gray for border
    private readonly BORDER_WIDTH = 2; // Border width

    constructor(roomModel: RoomModel) {
        super();
        this.roomModel = roomModel;
        this.boundOnRoomChange = this.onRoomChange.bind(this);
        this.boundOnGroundChange = this.onGroundChange.bind(this);
        
        // Wait for Scene2D to be fully initialized before creating visuals
        this.waitForSceneInit(() => {
            this.initializeVisuals();
        });
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
        
        // Listen for ground face changes
        this.roomModel.groundFace.addEventListener('change', this.boundOnGroundChange);
    }
    
    /**
     * Update the visual representation based on room ground face state
     */
    update(): void {
        this.roomGraphics.clear();
        
        // Get ground face from room model
        const groundFace = this.roomModel.groundFace;
        
        // Check if ground face has valid outer contour
        if (!groundFace.outerContour || groundFace.outerContour.length < 3) {
            console.warn('RoomModel groundFace outerContour is invalid or has less than 3 points');
            return;
        }
        
        // Convert world coordinates to screen coordinates (use x,y from Vector3)
        const screenPoints = groundFace.outerContour.map(point => 
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
        this.updateDisplayZIndex(this.roomGraphics, positionZ);
    }
    
    /**
     * Handle room model change events
     */
    private onRoomChange(): void {
        this.update();
    }
    
    /**
     * Handle ground face change events
     */
    private onGroundChange(): void {
        this.update();
    }
    
    /**
     * Dispose this 2D room display
     */
    dispose(): void {
        this.roomModel.removeEventListener('change', this.boundOnRoomChange);
        this.roomModel.groundFace.removeEventListener('change', this.boundOnGroundChange);
        
        if (this.roomGraphics.parent) {
            this.roomGraphics.parent.removeChild(this.roomGraphics);
        }
        
        this.roomGraphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(ROOM_MODEL, Room2D);
