import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { RoomModel } from '../../../core/model/RoomModel';
import { CameraModel } from '../../../core/model/CameraModel';
import { CameraManager } from '../../../core/model/CameraManager';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { ROOM_MODEL } from '../../../core/types';
import { App } from '../../../core';

/**
 * 3D display object for a RoomModel.
 * Manages a THREE.Group that contains child face display objects
 * (the ground and ceiling faces of the room).
 *
 * Listens to the active camera and toggles face visibility:
 *   - Hides the ceiling face when the camera is above the room (looking down).
 *   - Hides the ground face when the camera is below the room (looking up).
 */
export class Room extends DisplayObject3D<RoomModel> {
    private childDisplays: Map<string, DisplayObject3D>;
    private cameraManager: CameraManager | null = null;
    private activeCamera: CameraModel | null = null;
    private readonly onActiveCameraChange: () => void;
    private readonly onCameraManagerChange: () => void;

    constructor(model: RoomModel) {
        super(model, new THREE.Group());
        this.childDisplays = new Map();

        this.onActiveCameraChange = this.updateFaceVisibility.bind(this);
        this.onCameraManagerChange = this.bindActiveCamera.bind(this);

        // Defer camera binding to a microtask so the App singleton finishes
        // construction before we call App.getInstance(). The Room display is
        // built during SceneModel construction, which runs inside the App
        // constructor; calling App.getInstance() synchronously here would
        // recurse infinitely because App.instance is not yet assigned.
        Promise.resolve().then(() => this.attachToCameraManager());

        // Refresh visibility whenever a child face display is attached, since
        // face children are created after the Room display in the RoomModel
        // constructor order.
        this.model.addEventListener('addChild', this.onActiveCameraChange);
    }

    /**
     * Gets the underlying THREE.Group
     */
    get group(): THREE.Group {
        return this.node as THREE.Group;
    }

    /**
     * Resolves the camera manager from the App singleton and starts listening
     * to preset switches and the active camera.
     */
    private attachToCameraManager(): void {
        if (this.cameraManager) return;
        const cameraManager = App.getInstance().getCameraManager();
        if (!cameraManager) return;
        this.cameraManager = cameraManager;
        this.cameraManager.addEventListener('change', this.onCameraManagerChange);
        this.bindActiveCamera();
    }

    /**
     * Subscribes to the currently active camera, replacing any previous
     * subscription, and immediately refreshes face visibility.
     */
    private bindActiveCamera(): void {
        if (this.activeCamera) {
            this.activeCamera.removeEventListener('change', this.onActiveCameraChange);
        }
        this.activeCamera = this.cameraManager?.getActiveCamera() ?? null;
        if (this.activeCamera) {
            this.activeCamera.addEventListener('change', this.onActiveCameraChange);
        }
        this.updateFaceVisibility();
    }

    /**
     * Toggles ground/ceiling face visibility based on the active camera's
     * vertical position relative to the room. Uses Three.js world Y because
     * the architectural Z axis (height) maps to Three.js Y in the render
     * coordinate system.
     */
    private updateFaceVisibility(): void {
        if (!this.activeCamera) return;

        const cameraY = this.activeCamera.position.y;
        const ceilingY = this.model.height;
        const groundY = 0;
        
        const groundDisplay = DisplayObject3D.get(this.model.groundFace.id);
        const ceilingDisplay = DisplayObject3D.get(this.model.ceilingFace.id);

        if (ceilingDisplay) {
            ceilingDisplay.node.visible = cameraY <= ceilingY;
        }
        if (groundDisplay) {
            groundDisplay.node.visible = cameraY >= groundY;
        }
    }

    /**
     * Dispose this room and all child display objects
     */
    dispose(): void {
        if (this.cameraManager) {
            this.cameraManager.removeEventListener('change', this.onCameraManagerChange);
            this.cameraManager = null;
        }
        if (this.activeCamera) {
            this.activeCamera.removeEventListener('change', this.onActiveCameraChange);
            this.activeCamera = null;
        }
        this.model.removeEventListener('addChild', this.onActiveCameraChange);

        for (const [id, display] of this.childDisplays) {
            display.dispose();
        }
        this.childDisplays.clear();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(ROOM_MODEL, Room);
