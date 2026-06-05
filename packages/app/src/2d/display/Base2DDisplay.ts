import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { Scene2D } from '../index';

/**
 * Base class for all 2D display objects.
 * Provides common functionality like coordinate transformation and z-index management.
 */
export abstract class Base2DDisplay extends THREE.EventDispatcher<any> {
    protected scene2D!: Scene2D;
    
    // Default pixels per unit for coordinate transformation
    protected readonly PIXELS_PER_UNIT = 25;

    constructor() {
        super();
        // Get Scene2D instance (auto-creates if not exists)
        this.scene2D = Scene2D.getInstance();
    }

    /**
     * Convert world coordinates to screen coordinates
     * @param worldX - X coordinate in world space
     * @param worldY - Y coordinate in world space
     * @returns Screen coordinates { x, y }
     */
    protected worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
        // Return stage-local coordinates. The stage applies panOffset (including
        // canvas center) and zoomScale, so children only need the PPU conversion.
        return {
            x: worldX * this.PIXELS_PER_UNIT,
            y: -worldY * this.PIXELS_PER_UNIT,
        };
    }

    /**
     * Update z-index based on model position.z
     * @param graphics - The PIXI.Graphics object to update
     * @param positionZ - The z position value
     */
    protected updateDisplayZIndex(graphics: PIXI.Graphics, positionZ: number): void {
        this.scene2D.updateDisplayZIndex(graphics, positionZ);
    }

    /**
     * Wait for Scene2D to be initialized before creating visuals
     * @param callback - The callback to execute when Scene2D is ready
     */
    protected waitForSceneInit(callback: () => void): void {
        if (this.scene2D.isInitialized()) {
            // Already initialized, execute immediately
            callback();
        } else {
            // Wait for initialization
            this.scene2D.addEventListener('initialized', () => {
                callback();
            });
        }
    }
}
