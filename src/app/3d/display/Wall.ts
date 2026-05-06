import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { WallModel } from '../../../core/model/WallModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { WALL_MODEL } from '../../../core/types';

/**
 * 3D display object for a WallModel.
 * Manages a THREE.Group that contains child face display objects.
 * The actual visual representation is rendered by Face display objects.
 */
export class Wall extends DisplayObject3D<WallModel> {
    private childDisplays: Map<string, DisplayObject3D>;

    constructor(model: WallModel) {
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
     * Dispose this wall and all child display objects
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
ModelRegistry.getInstance().registerDisplay3d(WALL_MODEL, Wall);
