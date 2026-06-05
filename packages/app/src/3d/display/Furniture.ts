import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DisplayObject3D } from './DisplayObject3D';
import { FurnitureModel } from '@designer/core/model/FurnitureModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { FURNITURE_MODEL } from '@designer/core/types';
import { toThreeJS } from '../util/archToThreeJS';

/**
 * 3D display object for a FurnitureModel.
 * Loads and displays a GLTF model based on the furniture model's properties.
 */
export class Furniture extends DisplayObject3D<FurnitureModel> {
    private group: THREE.Group;
    private loader: GLTFLoader;
    private currentModel: THREE.Object3D | null = null;
    private loaded: boolean = false;

    constructor(model: FurnitureModel) {
        super(model, new THREE.Group());
        this.group = this.node as THREE.Group;
        this.loader = new GLTFLoader();

        // Apply initial transform (defer to avoid issues during model construction)
        Promise.resolve().then(() => {
            this.updateTransform();
            this.loadModel();
        });

        // Defer change event listener registration to avoid triggering during construction
        Promise.resolve().then(() => {
            this.model.addEventListener('change', this.onModelChange.bind(this));
        });
    }

    /**
     * Gets the underlying THREE.Group
     */
    get groupNode(): THREE.Group {
        return this.group;
    }

    /**
     * Handles model change events
     */
    private onModelChange(event: any): void {
        if (event.furniture === this.model) {
            this.updateTransform();
            
            // Only load once to prevent infinite loop
            if (!this.loaded) {
                this.loadModel();
            }
        }
    }

    /**
     * Updates the transform (position, rotation, scale) of the furniture
     * Converts from architectural coordinates (Z-up) to Three.js coordinates (Y-up)
     */
    private updateTransform(): void {
        // Convert position from architectural (Z-up) to Three.js (Y-up)
        const position = toThreeJS(this.model.position);
        this.group.position.copy(position);
        
        // Convert rotation from architectural to Three.js
        // Apply the same X-axis rotation to align the coordinate systems
        this.group.rotation.copy(toThreeJS(this.model.rotation));
        
        this.group.scale.copy(toThreeJS(this.model.scale));
    }

    /**
     * Loads the GLTF model from the specified path
     */
    private loadModel(): void {
        const gltfPath = this.model.gltfPath;
        
        if (!gltfPath) {
            console.warn('FurnitureModel has no gltfPath specified');
            return;
        }

        // Remove current model if exists
        if (this.currentModel) {
            this.group.remove(this.currentModel);
            this.currentModel = null;
        }
        // Mark as loaded to prevent infinite loop
        this.loaded = true;
        // Load new GLTF model
        this.loader.load(
            gltfPath,
            (gltf: any) => {
                const model = gltf.scene;
                
                // Configure model for performance (no shadows as per project spec)
                model.traverse((child: any) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                });

                this.currentModel = model;
                this.group.add(model);
                
                
            },
            (progress: any) => {
                // Optional: handle loading progress
                if (progress.lengthComputable) {
                    const percent = (progress.loaded / progress.total) * 100;
                    console.log(`Furniture loading: ${percent.toFixed(2)}%`);
                }
            },
            (error: any) => {
                console.error(`Error loading furniture model from ${gltfPath}:`, error);
            }
        );
    }

    /**
     * Dispose this furniture display object
     */
    dispose(): void {
        // Remove the loaded model
        if (this.currentModel) {
            this.group.remove(this.currentModel);
            this.currentModel = null;
        }

        // Dispose the loader
        this.loader = null as any;

        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(FURNITURE_MODEL, Furniture);
