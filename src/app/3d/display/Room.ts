import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { RoomModel } from '../../../core/model/RoomModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { ROOM_MODEL } from '../../../core/types';

/**
 * 3D display object for a RoomModel.
 * Manages a THREE.Group that contains child face display objects
 * (the ground and ceiling faces of the room).
 */
export class Room extends DisplayObject3D<RoomModel> {
    private childDisplays: Map<string, DisplayObject3D>;

    constructor(model: RoomModel) {
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
     * Dispose this room and all child display objects
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
ModelRegistry.getInstance().registerDisplay3d(ROOM_MODEL, Room);
