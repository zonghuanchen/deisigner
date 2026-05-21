import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { WallModel } from '../../../core/model/WallModel';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { WALL_MODEL } from '../../../core/types';

/**
 * 2D display object for a WallModel.
 * Renders wall as a thick line from 'from' to 'to' with gray fill and black stroke.
 */
export class Wall2D extends THREE.EventDispatcher<any> {
    private wallGraphics!: PIXI.Graphics;
    private wallModel: WallModel;
    private scene2D!: Scene2D;
    private boundOnWallChange: () => void;
    
    // Visual configuration
    private readonly WALL_LINE_WIDTH = 4; // Wall thickness in pixels
    private readonly WALL_COLOR = 0x999999; // Gray for wall body
    private readonly STROKE_COLOR = 0x000000; // Black for wall edges
    private readonly STROKE_WIDTH = 1; // Edge stroke width
    private readonly PIXELS_PER_UNIT = 25; // 25 pixels = 1 unit in world space

    constructor(wallModel: WallModel) {
        super();
        this.wallModel = wallModel;
        this.boundOnWallChange = this.onWallChange.bind(this);
        
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
        // Create wall graphics
        this.wallGraphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.wallGraphics);
        
        // Set initial z-index based on model position
        this.updateZIndex();
        
        // Initial render
        this.update();
        
        // Listen for wall changes
        this.wallModel.addEventListener('change', this.boundOnWallChange);
    }
    
    /**
     * Update the visual representation based on wall model state
     */
    update(): void {
        this.wallGraphics.clear();
        
        // Check if wall model has valid from and to
        if (!this.wallModel.from || !this.wallModel.to) {
            console.warn('WallModel from or to is undefined');
            return;
        }
        
        // Convert world coordinates to screen coordinates
        const fromScreen = this.worldToScreen(this.wallModel.from.x, this.wallModel.from.y);
        const toScreen = this.worldToScreen(this.wallModel.to.x, this.wallModel.to.y);
        
        // Draw wall body (gray)
        this.wallGraphics.moveTo(fromScreen.x, fromScreen.y);
        this.wallGraphics.lineTo(toScreen.x, toScreen.y);
        this.wallGraphics.stroke({ 
            color: this.WALL_COLOR, 
            width: this.WALL_LINE_WIDTH,
            alignment: 0.5 // Center the stroke on the line
        });
        
        // Draw wall edges (black)
        this.wallGraphics.moveTo(fromScreen.x, fromScreen.y);
        this.wallGraphics.lineTo(toScreen.x, toScreen.y);
        this.wallGraphics.stroke({ 
            color: this.STROKE_COLOR, 
            width: this.WALL_LINE_WIDTH + this.STROKE_WIDTH * 2,
            alignment: 0.5
        });
        
        // Redraw the gray line on top to create the edge effect
        this.wallGraphics.moveTo(fromScreen.x, fromScreen.y);
        this.wallGraphics.lineTo(toScreen.x, toScreen.y);
        this.wallGraphics.stroke({ 
            color: this.WALL_COLOR, 
            width: this.WALL_LINE_WIDTH,
            alignment: 0.5
        });
        
        // Update z-index based on model position
        this.updateZIndex();
    }
    
    /**
     * Update z-index based on model position.z
     */
    private updateZIndex(): void {
        // WallModel uses architectural coordinates, position is on xy plane
        // We'll use a default z value for walls
        const positionZ = (this.wallModel as any).position?.z || 0;
        this.scene2D.updateDisplayZIndex(this.wallGraphics, positionZ);
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
