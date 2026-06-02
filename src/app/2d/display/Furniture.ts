import * as THREE from 'three';
import * as PIXI from 'pixi.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FurnitureModel } from '../../../core/model/FurnitureModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { FURNITURE_MODEL } from '../../../core/types';
import { Base2DDisplay } from './Base2DDisplay';
import { toThreeJS } from '../../3d/util/archToThreeJS';

/**
 * 2D display object for a FurnitureModel.
 * Loads the GLTF model and computes a 2D bounding box (top-down view) for performance,
 * instead of extracting the full top-view silhouette.
 */
export class Furniture2D extends Base2DDisplay {
    private graphics!: PIXI.Graphics;
    private model: FurnitureModel;
    private loader: GLTFLoader;
    private boundOnChange: () => void;
    private gltfScene: THREE.Object3D | null = null;

    // Cached 2D AABB in architectural world space [minX, minY, maxX, maxY]
    private bounds2D: [number, number, number, number] | null = null;

    // Visual configuration
    private readonly DEFAULT_FILL_COLOR = 0x999999;
    private readonly STROKE_COLOR = 0x666666;
    private readonly STROKE_WIDTH = 1;

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
     * Load the GLTF and compute the 2D bounding box using the same transform chain
     * as the 3D display (toThreeJS for position/rotation/scale), then project to architectural XY.
     */
    private loadAndComputeBounds(): void {
        const gltfPath = this.model.gltfPath;
        if (!gltfPath) return;

        this.loader.load(
            gltfPath,
            (gltf: any) => {
                this.gltfScene = gltf.scene;
                this.computeBounds2D();
            },
            undefined,
            (error: any) => {
                console.error(`Furniture2D: Error loading ${gltfPath}:`, error);
            }
        );
    }

    /**
     * Compute the 2D AABB by applying the exact same Three.js world transform as the 3D display,
     * then projecting world-space corners to architectural XY (world_x = three_x, world_y = -three_z).
     */
    private computeBounds2D(): void {
        if (!this.gltfScene) return;

        const { position, rotation, scale } = this.model;

        // Build a temporary group with the same transform as the 3D display
        const tmpGroup = new THREE.Group();
        tmpGroup.position.copy(toThreeJS(position));
        tmpGroup.rotation.copy(toThreeJS(rotation));
        tmpGroup.scale.copy(toThreeJS(scale));
        tmpGroup.add(this.gltfScene);
        tmpGroup.updateMatrixWorld(true);

        // Get the world-space bounding box of the GLTF under this transform
        const worldBox = new THREE.Box3().setFromObject(this.gltfScene);

        // Clean up
        tmpGroup.remove(this.gltfScene);

        // Project 8 corners of the Three.js world AABB to architectural XY
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const x of [worldBox.min.x, worldBox.max.x]) {
            for (const z of [worldBox.min.z, worldBox.max.z]) {
                // Three.js (x, _, z) → architectural (x, -z)
                const ax = x;
                const ay = -z;
                if (ax < minX) minX = ax;
                if (ax > maxX) maxX = ax;
                if (ay < minY) minY = ay;
                if (ay > maxY) maxY = ay;
            }
        }
        this.bounds2D = [minX, minY, maxX, maxY];
        this.renderBounds();
    }

    /**
     * Render the cached 2D AABB to the PIXI graphics.
     */
    private renderBounds(): void {
        this.graphics.clear();
        if (!this.bounds2D) return;

        const [minX, minY, maxX, maxY] = this.bounds2D;
        const corners = [
            this.worldToScreen(minX, minY),
            this.worldToScreen(maxX, minY),
            this.worldToScreen(maxX, maxY),
            this.worldToScreen(minX, maxY),
        ];

        // Draw filled rectangle
        this.graphics.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            this.graphics.lineTo(corners[i].x, corners[i].y);
        }
        this.graphics.closePath();
        this.graphics.fill({ color: this.DEFAULT_FILL_COLOR });

        // Draw stroke outline
        this.graphics.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            this.graphics.lineTo(corners[i].x, corners[i].y);
        }
        this.graphics.closePath();
        this.graphics.stroke({ color: this.STROKE_COLOR, width: this.STROKE_WIDTH });

        // Update z-index using model position
        this.updateDisplayZIndex(this.graphics, this.model.position.z);
    }

    private onModelChange(): void {
        this.computeBounds2D();
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
