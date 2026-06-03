import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CameraModel } from '../../core';
import { toThreeJS, fromThreeJS } from './util/archToThreeJS';

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

    // Custom keyboard state for Q/E orbit rotation
    private readonly pressedKeys = new Set<string>();
    private readonly onKeyDown: (e: KeyboardEvent) => void;
    private readonly onKeyUp: (e: KeyboardEvent) => void;
    /** Orbit rotation speed in radians per frame when Q/E is held */
    private rotateSpeed = 0.10;

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

        // Enable keyboard controls: WASD = pan (same as arrow keys)
        this.controls.keys = {
            LEFT: 'KeyA',
            UP: 'KeyW',
            RIGHT: 'KeyD',
            BOTTOM: 'KeyS',
        };
        this.controls.listenToKeyEvents(window);
        this.controls.keyPanSpeed = 30.0;

        // Q/E orbit rotation around vertical axis
        this.onKeyDown = (e: KeyboardEvent) => {
            const key = e.code;
            if (key === 'KeyQ' || key === 'KeyE') {
                e.preventDefault();
                this.pressedKeys.add(key);
            }
        };
        this.onKeyUp = (e: KeyboardEvent) => {
            this.pressedKeys.delete(e.code);
        };
        window.addEventListener('keydown', this.onKeyDown);
        window.addEventListener('keyup', this.onKeyUp);

        // Propagate user-driven orbit changes back into the model
        this.controls.addEventListener('change', () => {
            if (this.isSyncingFromModel) return;
            this.isWritingToModel = true;
            // Convert from Three.js coordinates (Y-up) to architectural coordinates (Z-up)
            this.cameraModel.position = fromThreeJS(this.proxyCamera.position);
            this.cameraModel.target = fromThreeJS(this.controls.target);
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
        // Convert from architectural coordinates (Z-up) to Three.js coordinates (Y-up)
        this.proxyCamera.position.copy(toThreeJS(m.position));
        this.proxyCamera.up.copy(toThreeJS(m.up));
        this.proxyCamera.fov = m.fov;
        this.proxyCamera.aspect = m.aspect;
        this.proxyCamera.near = m.near;
        this.proxyCamera.far = m.far;
        this.proxyCamera.zoom = m.zoom;
        this.proxyCamera.updateProjectionMatrix();
        const target = toThreeJS(m.target);
        this.controls.target.copy(target);
        this.proxyCamera.lookAt(target);
        this.isSyncingFromModel = false;
    }

    update(): void {
        // Apply Q/E orbit rotation around vertical (Y) axis through the target
        if (this.pressedKeys.size > 0 && !this.isSyncingFromModel) {
            const target = this.controls.target;
            const offset = this.proxyCamera.position.clone().sub(target);
            const spherical = new THREE.Spherical().setFromVector3(offset);
            if (this.pressedKeys.has('KeyQ')) {
                spherical.theta -= this.rotateSpeed;
            }
            if (this.pressedKeys.has('KeyE')) {
                spherical.theta += this.rotateSpeed;
            }
            offset.setFromSpherical(spherical);
            this.proxyCamera.position.copy(target).add(offset);
            this.proxyCamera.lookAt(target);
            // Write rotation back to model
            this.isWritingToModel = true;
            this.cameraModel.position = fromThreeJS(this.proxyCamera.position);
            this.cameraModel.target = fromThreeJS(target);
            this.isWritingToModel = false;
        }
        this.controls.update();
    }

    dispose(): void {
        this.cameraModel.removeEventListener('change', this.onModelChange);
        this.controls.stopListenToKeyEvents();
        window.removeEventListener('keydown', this.onKeyDown);
        window.removeEventListener('keyup', this.onKeyUp);
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

    /** Pan speed multiplier when using arrow keys (default: 7.0) */
    get keyPanSpeed(): number { return this.controls.keyPanSpeed; }
    set keyPanSpeed(v: number) { this.controls.keyPanSpeed = v; }

    /** Access the underlying raw OrbitControls for advanced use-cases */
    get raw(): OrbitControls { return this.controls; }
}
