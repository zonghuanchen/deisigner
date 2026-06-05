import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { SceneModel } from '@designer/core/model/SceneModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { SCENE_MODEL } from '@designer/core/types';

/**
 * 3D display object for a SceneModel.
 * Manages a THREE.Group that contains all child display objects (walls, etc.).
 */
export class Scene extends DisplayObject3D<SceneModel> {
    private childDisplays: Map<string, DisplayObject3D>;

    constructor(model: SceneModel) {
        super(model, new THREE.Group());
        this.childDisplays = new Map();
    }

    /**
     * Gets the underlying THREE.Group
     */
    get group(): THREE.Group {
        return this.node as THREE.Group;
    }

    /**
     * Dispose this scene and all child display objects
     */
    dispose(): void {
        for (const [id, display] of this.childDisplays) {
            display.dispose();
        }
        this.childDisplays.clear();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(SCENE_MODEL, Scene);
