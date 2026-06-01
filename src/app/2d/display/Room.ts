import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { RoomModel } from '../../../core/model/RoomModel';
import { FaceUVData } from '../../../core/model/FaceModel';
import { Scene2D } from '../index';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { ROOM_MODEL } from '../../../core/types';
import { Base2DDisplay } from './Base2DDisplay';

/**
 * 2D display object for a RoomModel.
 * Renders the ground face using material color and texture (via UV data)
 * as a filled polygon, with a border stroke.
 */
export class Room2D extends Base2DDisplay {
    private roomGraphics!: PIXI.Graphics;
    private roomModel: RoomModel;
    private boundOnRoomChange: () => void;
    private boundOnGroundChange: () => void;
    private boundOnMaterialChange: () => void;

    private pixiTexture: PIXI.Texture | null = null;

    // Visual configuration
    private readonly BORDER_COLOR = 0x666666;
    private readonly BORDER_WIDTH = 1;

    constructor(roomModel: RoomModel) {
        super();
        this.roomModel = roomModel;
        this.boundOnRoomChange = this.onRoomChange.bind(this);
        this.boundOnGroundChange = this.onGroundChange.bind(this);
        this.boundOnMaterialChange = this.onMaterialChange.bind(this);

        this.waitForSceneInit(() => {
            this.initializeVisuals();
        });
    }

    /**
     * Initialize visual elements after Scene2D is ready
     */
    private initializeVisuals(): void {
        this.roomGraphics = new PIXI.Graphics();
        this.scene2D.getStage().addChild(this.roomGraphics);

        this.updateZIndex();
        this.buildPixiTexture();
        this.update();

        this.roomModel.addEventListener('change', this.boundOnRoomChange);
        this.roomModel.groundFace.addEventListener('change', this.boundOnGroundChange);

        // Defer material listener to next microtask so Face display objects register first
        Promise.resolve().then(() => {
            this.roomModel.groundFace.material.addEventListener('change', this.boundOnMaterialChange);
        });
    }

    /**
     * Build a PIXI texture from the ground face material's THREE.Texture map.
     * THREE.TextureLoader loads images async — texture.image is null until ready,
     * so we poll via requestAnimationFrame and retry once the image appears.
     */
    private buildPixiTexture(): void {
        // Dispose previous PIXI texture
        if (this.pixiTexture) {
            this.pixiTexture.destroy(false);
            this.pixiTexture = null;
        }
        const threeMap = this.roomModel.groundFace.material.map;
        if (!threeMap) return;
        const image = threeMap.source.data;

        // Image not yet loaded (THREE.js sets texture.image asynchronously)
        // or source.data is not yet available — poll until ready
        if (!image || (image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0))) {
            this.pollForTexture(120);
            return;
        }

        if (image instanceof HTMLImageElement) {
            this.pixiTexture = PIXI.Texture.from(image);
        } else if (image instanceof ImageBitmap) {
            this.pixiTexture = PIXI.Texture.from(image as any);
        } else if (image instanceof HTMLCanvasElement) {
            this.pixiTexture = PIXI.Texture.from(image);
        }
    }

    /**
     * Poll for texture readiness when source data is not yet available.
     * THREE.js TextureLoader sets texture.image asynchronously without
     * dispatching any event, so we must poll via rAF.
     */
    private pollForTexture(retries: number): void {
        if (retries <= 0) return;
        requestAnimationFrame(() => {
            const threeMap = this.roomModel.groundFace.material.map;
            if (!threeMap) return;
            const image = threeMap.source.data;

            if (!image || (image instanceof HTMLImageElement && (!image.complete || image.naturalWidth === 0))) {
                this.pollForTexture(retries - 1);
                return;
            }

            if (image instanceof HTMLImageElement) {
                this.pixiTexture = PIXI.Texture.from(image);
            } else if (image instanceof ImageBitmap) {
                this.pixiTexture = PIXI.Texture.from(image as any);
            } else if (image instanceof HTMLCanvasElement) {
                this.pixiTexture = PIXI.Texture.from(image);
            }

            if (this.pixiTexture) {
                this.update();
            }
        });
    }

    /**
     * Handle material property changes (color, texture, etc.)
     */
    private onMaterialChange(): void {
        this.buildPixiTexture();
        this.update();
    }

    /**
     * Update the visual representation using groundFace UV data and material
     */
    update(): void {
        this.roomGraphics.clear();

        const groundFace = this.roomModel.groundFace;
        const uvData = groundFace.computeUVData();
        if (!uvData || uvData.outerProjected.length < 3) {
            console.warn('RoomModel groundFace outerContour is invalid or has less than 3 points');
            return;
        }

        // Convert outer contour to screen coordinates (x, y from Vector3)
        const screenPoints = groundFace.outerContour.map(point =>
            this.worldToScreen(point.x, point.y)
        );

        // Draw outer polygon path
        this.roomGraphics.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (let i = 1; i < screenPoints.length; i++) {
            this.roomGraphics.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
        this.roomGraphics.closePath();

        // Draw inner contour holes (for even-odd fill rule)
        for (const inner of groundFace.innerContours) {
            if (inner.length < 3) continue;
            const innerScreen = inner.map(p => this.worldToScreen(p.x, p.y));
            this.roomGraphics.moveTo(innerScreen[0].x, innerScreen[0].y);
            for (let i = 1; i < innerScreen.length; i++) {
                this.roomGraphics.lineTo(innerScreen[i].x, innerScreen[i].y);
            }
            this.roomGraphics.closePath();
        }
        // Fill with material texture or solid color
        const material = groundFace.material;
        const color = material.color.getHex();
        if (this.pixiTexture) {
            const matrix = this.computeTextureMatrix(uvData, material.map!);
            this.roomGraphics.fill({
                color,
                texture: this.pixiTexture,
                matrix,
            });
        } else {
            this.roomGraphics.fill({ color });
        }

        // Draw border stroke
        this.roomGraphics.moveTo(screenPoints[0].x, screenPoints[0].y);
        for (let i = 1; i < screenPoints.length; i++) {
            this.roomGraphics.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
        this.roomGraphics.closePath();
        this.roomGraphics.stroke({
            color: this.BORDER_COLOR,
            width: this.BORDER_WIDTH,
        });

        this.updateZIndex();
    }

    /**
     * Compute a PIXI texture matrix that maps the PIXI texture onto the
     * ground polygon in screen space using the face UV basis.
     *
     * The matrix transforms screen coordinates → texture UV [0,1]:
     *   screen → world (inverse of worldToScreen)
     *   world  → UV-world (dot-product projection onto u/v axes)
     *   UV-world → texture UV (scaled by THREE.Texture.repeat)
     */
    private computeTextureMatrix(
        uvData: FaceUVData,
        threeTexture: THREE.Texture
    ): PIXI.Matrix {
        const { origin, uAxis, vAxis } = uvData;
        const PPU = this.PIXELS_PER_UNIT;
        const repeatX = threeTexture.repeat.x;
        const repeatY = threeTexture.repeat.y;

        // UV projection: world (x, y, z=0) → UV-world (u, v)
        //   u = (wx - ox) * ux + (wy - oy) * uy
        //   v = (wx - ox) * vx + (wy - oy) * vy
        const uvMat = new PIXI.Matrix(
            uAxis.x, vAxis.x,
            uAxis.y, vAxis.y,
            -(origin.x * uAxis.x + origin.y * uAxis.y),
            -(origin.x * vAxis.x + origin.y * vAxis.y)
        );

        // Repeat scale: UV-world → texture UV [0,1]
        const repeatMat = new PIXI.Matrix(
            repeatX, 0,
            0, repeatY,
            0, 0
        );

        // Inverse of worldToScreen: screen → world
        //   worldToScreen: worldX * PPU, -worldY * PPU
        //   inverse:       screenX / PPU, -screenY / PPU
        const invW2S = new PIXI.Matrix(
            1 / PPU, 0,
            0, -1 / PPU,
            0, 0
        );

        // Combined: result = repeatMat * uvMat * invW2S
        // PIXI multiply: A.multiply(B) → A = A * B
        const result = new PIXI.Matrix(
            repeatMat.a, repeatMat.b,
            repeatMat.c, repeatMat.d,
            repeatMat.tx, repeatMat.ty
        );
        result.append(uvMat);
        result.append(invW2S);

        return result;
    }

    /**
     * Update z-index based on model position.z
     */
    private updateZIndex(): void {
        const positionZ = (this.roomModel as any).position?.z || 0;
        this.updateDisplayZIndex(this.roomGraphics, positionZ);
    }

    private onRoomChange(): void {
        this.update();
    }

    private onGroundChange(): void {
        this.update();
    }

    /**
     * Dispose this 2D room display
     */
    dispose(): void {
        this.roomModel.removeEventListener('change', this.boundOnRoomChange);
        this.roomModel.groundFace.removeEventListener('change', this.boundOnGroundChange);
        this.roomModel.groundFace.material.removeEventListener('change', this.boundOnMaterialChange);

        if (this.pixiTexture) {
            this.pixiTexture.destroy(false);
            this.pixiTexture = null;
        }

        if (this.roomGraphics.parent) {
            this.roomGraphics.parent.removeChild(this.roomGraphics);
        }

        this.roomGraphics.destroy();
    }
}

// Register the 2D display model
ModelRegistry.getInstance().registerDisplay2d(ROOM_MODEL, Room2D);
