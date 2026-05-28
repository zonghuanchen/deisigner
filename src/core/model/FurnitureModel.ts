import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { FURNITURE_MODEL } from '../types';

export interface FurnitureChangeEvent {
    type: 'change';
    furniture: FurnitureModel;
}

export type FurnitureChangeListener = (event: FurnitureChangeEvent) => void;

export interface FurnitureEventMap {
    change: FurnitureChangeEvent;
}

/**
 * Represents a furniture item in the scene.
 * Contains position, rotation, scale, and GLTF model path.
 */
export class FurnitureModel extends BaseModel {
    private _position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private _rotation: THREE.Euler = new THREE.Euler(0, 0, 0);
    private _scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
    private _size: THREE.Vector3 = new THREE.Vector3(1, 1, 1);
    private _gltfPath: string;

    constructor(
        gltfPath: string = '',
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        rotation: THREE.Euler = new THREE.Euler(0, 0, 0),
        scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
        size: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
        id?: string
    ) {
        super(id);
        this._gltfPath = gltfPath;
        this._position = position.clone();
        this._rotation = rotation.clone();
        this._scale = scale.clone();
        this._size = size.clone();
    }

    /**
     * Gets the position of the furniture
     */
    get position(): THREE.Vector3 {
        return this._position;
    }

    /**
     * Sets the position of the furniture
     */
    set position(value: THREE.Vector3) {
        this._position.copy(value);
        this.dirty();
    }

    /**
     * Gets the rotation of the furniture
     */
    get rotation(): THREE.Euler {
        return this._rotation;
    }

    /**
     * Sets the rotation of the furniture
     */
    set rotation(value: THREE.Euler) {
        this._rotation.copy(value);
        this.dirty();
    }

    /**
     * Gets the scale of the furniture
     */
    get scale(): THREE.Vector3 {
        return this._scale;
    }

    /**
     * Sets the scale of the furniture
     */
    set scale(value: THREE.Vector3) {
        this._scale.copy(value);
        this.dirty();
    }

    /**
     * Gets the size of the furniture (width, length, height)
     */
    get size(): THREE.Vector3 {
        return this._size;
    }

    /**
     * Sets the size of the furniture (width, length, height)
     */
    set size(value: THREE.Vector3) {
        this._size.copy(value);
        this.dirty();
    }

    /**
     * Gets the GLTF model path
     */
    get gltfPath(): string {
        return this._gltfPath;
    }

    /**
     * Sets the GLTF model path
     */
    set gltfPath(value: string) {
        this._gltfPath = value;
        this.dirty();
    }

    /**
     * Triggers a change event to notify listeners that the furniture has been modified
     */
    dirty(): void {
        this._isDirty = true;
        this.dispatchEvent({ type: 'change', furniture: this });
    }

    getUI(): Record<string, any> {
        return {
            id: this._id,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z },
            scale: { x: this._scale.x, y: this._scale.y, z: this._scale.z },
            size: { x: this._size.x, y: this._size.y, z: this._size.z },
            gltfPath: this._gltfPath,
        };
    }
}

// Register the model
ModelRegistry.getInstance().register(FURNITURE_MODEL, FurnitureModel);
