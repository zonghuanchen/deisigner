import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { CAMERA_MODEL } from '../types';

export type CameraType = 'orthographic' | 'perspective';
export type CameraMode = 'roaming' | '3d';

export interface CameraChangeEvent {
    type: 'change';
    camera: CameraModel;
}

export type CameraChangeListener = (event: CameraChangeEvent) => void;

export interface CameraEventMap {
    change: CameraChangeEvent;
}

export interface CameraOptions {
    /** Vertical field of view in degrees (perspective only) */
    fov?: number;
    /** Aspect ratio (perspective only) */
    aspect?: number;
    /** Near clipping plane */
    near?: number;
    /** Far clipping plane */
    far?: number;
    /** Camera zoom factor */
    zoom?: number;
    /** Camera up direction */
    up?: THREE.Vector3;
    /** Orthographic frustum left */
    left?: number;
    /** Orthographic frustum right */
    right?: number;
    /** Orthographic frustum top */
    top?: number;
    /** Orthographic frustum bottom */
    bottom?: number;
}

export class CameraModel extends BaseModel {
    private _cameraType: CameraType;
    private _position: THREE.Vector3;
    private _target: THREE.Vector3;
    private _mode: CameraMode;

    // Perspective-specific
    private _fov: number;
    private _aspect: number;

    // Shared clipping / zoom
    private _near: number;
    private _far: number;
    private _zoom: number;
    private _up: THREE.Vector3;

    // Orthographic-specific
    private _left: number;
    private _right: number;
    private _top: number;
    private _bottom: number;

    constructor(
        type: CameraType = 'perspective',
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 5),
        target: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        mode: CameraMode = '3d',
        options: CameraOptions = {},
        id?: string
    ) {
        super(id, false);
        this._cameraType = type;
        this._position = position.clone();
        this._target = target.clone();
        this._mode = mode;

        this._fov = options.fov ?? 75;
        this._aspect = options.aspect ?? 1;
        this._near = options.near ?? 0.1;
        this._far = options.far ?? 1000;
        this._zoom = options.zoom ?? 1;
        // In architectural coordinates (Z-up), the up vector is (0, 0, 1)
        this._up = (options.up ?? new THREE.Vector3(0, 0, 1)).clone();
        this._left = options.left ?? -1;
        this._right = options.right ?? 1;
        this._top = options.top ?? 1;
        this._bottom = options.bottom ?? -1;
        this.dispatchCreateModel();
    }

    get type(): CameraType {
        return this._cameraType;
    }

    set type(value: CameraType) {
        if (this._cameraType !== value) {
            this._cameraType = value;
            this.dirty();
        }
    }

    get position(): THREE.Vector3 {
        return this._position;
    }

    set position(value: THREE.Vector3) {
        if (!this._position.equals(value)) {
            this._position.copy(value);
            this.dirty();
        }
    }

    get target(): THREE.Vector3 {
        return this._target;
    }

    set target(value: THREE.Vector3) {
        if (!this._target.equals(value)) {
            this._target.copy(value);
            this.dirty();
        }
    }

    get mode(): CameraMode {
        return this._mode;
    }

    set mode(value: CameraMode) {
        if (this._mode !== value) {
            this._mode = value;
            this.dirty();
        }
    }

    get fov(): number {
        return this._fov;
    }

    set fov(value: number) {
        if (this._fov !== value) {
            this._fov = value;
            this.dirty();
        }
    }

    get aspect(): number {
        return this._aspect;
    }

    set aspect(value: number) {
        if (this._aspect !== value) {
            this._aspect = value;
            this.dirty();
        }
    }

    get near(): number {
        return this._near;
    }

    set near(value: number) {
        if (this._near !== value) {
            this._near = value;
            this.dirty();
        }
    }

    get far(): number {
        return this._far;
    }

    set far(value: number) {
        if (this._far !== value) {
            this._far = value;
            this.dirty();
        }
    }

    get zoom(): number {
        return this._zoom;
    }

    set zoom(value: number) {
        if (this._zoom !== value) {
            this._zoom = value;
            this.dirty();
        }
    }

    get up(): THREE.Vector3 {
        return this._up;
    }

    set up(value: THREE.Vector3) {
        if (!this._up.equals(value)) {
            this._up.copy(value);
            this.dirty();
        }
    }

    get left(): number {
        return this._left;
    }

    set left(value: number) {
        if (this._left !== value) {
            this._left = value;
            this.dirty();
        }
    }

    get right(): number {
        return this._right;
    }

    set right(value: number) {
        if (this._right !== value) {
            this._right = value;
            this.dirty();
        }
    }

    get top(): number {
        return this._top;
    }

    set top(value: number) {
        if (this._top !== value) {
            this._top = value;
            this.dirty();
        }
    }

    get bottom(): number {
        return this._bottom;
    }

    set bottom(value: number) {
        if (this._bottom !== value) {
            this._bottom = value;
            this.dirty();
        }
    }

    /**
      * Triggers a change event to notify listeners that the camera has been modified
      */
    dirty(): void {
        this._isDirty = true;
        this.dispatchEvent({ type: 'change', camera: this });
    }

    getUI(): Record<string, any> {
        return {
            id: this._id,
            cameraType: this._cameraType,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            target: { x: this._target.x, y: this._target.y, z: this._target.z },
            mode: this._mode,
            fov: this._fov,
            aspect: this._aspect,
            near: this._near,
            far: this._far,
            zoom: this._zoom,
            up: { x: this._up.x, y: this._up.y, z: this._up.z },
            left: this._left,
            right: this._right,
            top: this._top,
            bottom: this._bottom,
        };
    }
}

// Register the model
ModelRegistry.getInstance().register(CAMERA_MODEL, CameraModel);
