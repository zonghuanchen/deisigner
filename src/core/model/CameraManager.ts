import * as THREE from 'three';
import { CameraModel, CameraType, CameraMode, CameraChangeEvent, CameraChangeListener } from './CameraModel';

export type CameraPreset = 'orthographic' | '3d' | 'roaming';

export interface CameraManagerEventMap {
  change: CameraChangeEvent;
}

export class CameraManager extends THREE.EventDispatcher<CameraManagerEventMap> {
  private cameras: Map<CameraPreset, CameraModel>;
  private activeCamera: CameraModel | null;
  private currentPreset: CameraPreset | null;

  constructor() {
    super();
    this.cameras = new Map();
    this.activeCamera = null;
    this.currentPreset = null;

    this.initializeCameras();
  }

  private initializeCameras(): void {
    // 正交相机 - type: 正交, position: (0,0,1), target: (0, 0, 0)
    const orthographicCamera = new CameraModel(
      'orthographic',
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      '3d'
    );

    // 3d透视相机 - type: 透视, position: (0,5,5), target: (0, 0, 0), mode: 3d模式
    const perspective3DCamera = new CameraModel(
      'perspective',
      new THREE.Vector3(0, 5, 5),
      new THREE.Vector3(0, 0, 0),
      '3d'
    );

    // 漫游透视相机 - type: 漫游, position: (0, 1, 0), target: (0, 0, 0), mode: 漫游模式
    const roamingPerspectiveCamera = new CameraModel(
      'perspective',
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      'roaming'
    );

    this.cameras.set('orthographic', orthographicCamera);
    this.cameras.set('3d', perspective3DCamera);
    this.cameras.set('roaming', roamingPerspectiveCamera);

    // Set default active camera to 3D perspective
    this.switch('3d');
  }

  /**
   * Switch to a specific camera preset
   * @param preset - The camera preset to switch to
   */
  switch(preset: CameraPreset): void {
    const camera = this.cameras.get(preset);
    if (!camera) {
      throw new Error(`Camera preset '${preset}' not found`);
    }

    this.activeCamera = camera;
    this.currentPreset = preset;

    // Dispatch change event
    this.dispatchEvent({ type: 'change', camera: this.activeCamera });
  }

  /**
   * Get the currently active camera
   * @returns The active camera model or null if none is active
   */
  getActiveCamera(): CameraModel | null {
    return this.activeCamera;
  }

  /**
   * Get the current camera preset
   * @returns The current preset or null if none is active
   */
  getCurrentPreset(): CameraPreset | null {
    return this.currentPreset;
  }

  /**
   * Get a specific camera by preset
   * @param preset - The camera preset to retrieve
   * @returns The camera model for the given preset
   */
  getCamera(preset: CameraPreset): CameraModel | undefined {
    return this.cameras.get(preset);
  }

  /**
   * Get all available camera presets
   * @returns Array of available camera presets
   */
  getAvailablePresets(): CameraPreset[] {
    return Array.from(this.cameras.keys());
  }
}
