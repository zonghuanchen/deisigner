import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { FloorModel } from '../../../core/model/FloorModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { FLOOR_MODEL } from '../../../core/types';

/**
 * 3D display object for a FloorModel.
 * Manages a THREE.Group that contains all child display objects (walls, faces, etc.).
 */
export class Floor extends DisplayObject3D<FloorModel> {
    private childDisplays: Map<string, DisplayObject3D>;

    constructor(model: FloorModel) {
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
     * Dispose this floor and all child display objects
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
ModelRegistry.getInstance().registerDisplay3d(FLOOR_MODEL, Floor);
