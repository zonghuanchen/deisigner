import * as THREE from 'three';

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

export class CameraModel extends THREE.EventDispatcher<CameraEventMap> {
  private _cameraType: CameraType;
  private _position: THREE.Vector3;
  private _target: THREE.Vector3;
  private _mode: CameraMode;

  constructor(
    type: CameraType = 'perspective',
    position: THREE.Vector3 = new THREE.Vector3(0, 0, 5),
    target: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
    mode: CameraMode = '3d'
  ) {
    super();
    this._cameraType = type;
    this._position = position.clone();
    this._target = target.clone();
    this._mode = mode;
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

  /**
   * Triggers a change event to notify listeners that the camera has been modified
   */
  dirty(): void {
    this.dispatchEvent({ type: 'change', camera: this });
  }
}
