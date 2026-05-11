import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraModel } from '../../core';

/**
 * OrbitControls variant that operates on a CameraModel instead of a
 * THREE.Camera directly. User interactions (orbit/pan/zoom) are written
 * back to the CameraModel, and external CameraModel changes are mirrored
 * into the internal proxy camera used by the underlying OrbitControls.
 */
export class CameraModelOrbitControls {
    private readonly cameraModel: CameraModel;
    private readonly proxyCamera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly onModelChange: () => void;

    private isSyncingFromModel = false;
    private isWritingToModel = false;

    constructor(cameraModel: CameraModel, domElement: HTMLElement) {
        this.cameraModel = cameraModel;

        this.proxyCamera = new THREE.PerspectiveCamera(
            cameraModel.fov,
            cameraModel.aspect,
            cameraModel.near,
            cameraModel.far,
        );

        this.controls = new OrbitControls(this.proxyCamera, domElement);
        this.syncFromModel();

        // Propagate user-driven orbit changes back into the model
        this.controls.addEventListener('change', () => {
            if (this.isSyncingFromModel) return;
            this.isWritingToModel = true;
            this.cameraModel.position = this.proxyCamera.position.clone();
            this.cameraModel.target = this.controls.target.clone();
            this.isWritingToModel = false;
        });

        // Mirror external CameraModel changes into the proxy camera
        this.onModelChange = () => this.syncFromModel();
        this.cameraModel.addEventListener('change', this.onModelChange);
    }

    private syncFromModel(): void {
        if (this.isWritingToModel) return;
        this.isSyncingFromModel = true;
        const m = this.cameraModel;
        this.proxyCamera.position.copy(m.position);
        this.proxyCamera.up.copy(m.up);
        this.proxyCamera.fov = m.fov;
        this.proxyCamera.aspect = m.aspect;
        this.proxyCamera.near = m.near;
        this.proxyCamera.far = m.far;
        this.proxyCamera.zoom = m.zoom;
        this.proxyCamera.updateProjectionMatrix();
        this.controls.target.copy(m.target);
        this.proxyCamera.lookAt(m.target);
        this.isSyncingFromModel = false;
    }

    update(): void {
        this.controls.update();
    }

    dispose(): void {
        this.cameraModel.removeEventListener('change', this.onModelChange);
        this.controls.dispose();
    }

    get enableDamping(): boolean { return this.controls.enableDamping; }
    set enableDamping(v: boolean) { this.controls.enableDamping = v; }

    get dampingFactor(): number { return this.controls.dampingFactor; }
    set dampingFactor(v: number) { this.controls.dampingFactor = v; }

    get minDistance(): number { return this.controls.minDistance; }
    set minDistance(v: number) { this.controls.minDistance = v; }

    get maxDistance(): number { return this.controls.maxDistance; }
    set maxDistance(v: number) { this.controls.maxDistance = v; }

    /** Access the underlying raw OrbitControls for advanced use-cases */
    get raw(): OrbitControls { return this.controls; }
}
