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

    // Clipping plane adjustment
    private isCameraInside = false;
    private savedNear = 0;
    private savedFar = 0;
    private clippingInitialized = false;
    private roomDiagonal = 0;

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
        this.model.addEventListener('dispose', this.dispose);
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
        this.updateClippingPlanes();
    }

    /**
     * Toggles ground/ceiling face visibility based on the active camera's
     * vertical position relative to the room. Uses Three.js world Y because
     * the architectural Z axis (height) maps to Three.js Y in the render
     * coordinate system.
     */
    private updateFaceVisibility(): void {
        if (!this.activeCamera) return;

        // CameraModel uses architectural coordinates (Z-up)
        const cameraZ = this.activeCamera.position.z;
        const ceilingZ = this.model.height;
        const groundZ = 0;
        
        const groundDisplay = DisplayObject3D.get(this.model.groundFace.id);
        const ceilingDisplay = DisplayObject3D.get(this.model.ceilingFace.id);

        if (ceilingDisplay) {
            ceilingDisplay.node.visible = cameraZ <= ceilingZ;
        }
        if (groundDisplay) {
            groundDisplay.node.visible = cameraZ >= groundZ;
        }
    }

    // ── Clipping Plane Adjustment ──────────────────────────────────────────

    /**
     * Adjusts camera near/far clipping planes when the camera enters or exits
     * the room. Inside the room the planes are tightened to reduce z-fighting
     * with nearby walls and ceiling; outside they are restored to defaults.
     */
    private updateClippingPlanes(): void {
        if (!this.activeCamera) return;

        // Compute room diagonal lazily (only once)
        if (!this.clippingInitialized) {
            this.roomDiagonal = this.computeRoomDiagonal();
            this.clippingInitialized = true;
        }

        const inside = this.isCameraInsideRoom();

        if (inside && !this.isCameraInside) {
            // Entering the room — save original clipping and apply tight values
            this.savedNear = this.activeCamera.near;
            this.savedFar = this.activeCamera.far;
            this.activeCamera.near = 0.01;
            this.activeCamera.far = Math.max(this.roomDiagonal * 2, 20);
            this.isCameraInside = true;
        } else if (!inside && this.isCameraInside) {
            // Exiting the room — restore original clipping
            this.activeCamera.near = this.savedNear;
            this.activeCamera.far = this.savedFar;
            this.isCameraInside = false;
        }
    }

    /**
     * Tests whether the active camera is inside this room's volume:
     * XY within the outer contour AND Z between ground (0) and ceiling (height).
     */
    private isCameraInsideRoom(): boolean {
        if (!this.activeCamera) return false;

        const pos = this.activeCamera.position;
        const height = this.model.height;

        // Quick Z-range check (architectural Z-up)
        if (pos.z < 0 || pos.z > height) return false;

        // Point-in-polygon test on XY plane
        const contour = this.model.outerContour;
        if (contour.length < 3) return false;
        return Room.pointInPolygon(pos.x, pos.y, contour);
    }

    /**
     * Ray-casting point-in-polygon test.
     */
    private static pointInPolygon(
        px: number, py: number,
        polygon: THREE.Vector2[],
    ): boolean {
        let inside = false;
        const n = polygon.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            if ((yi > py) !== (yj > py) &&
                px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Computes the room's spatial diagonal from the bounding box of the
     * outer contour and the room height.
     */
    private computeRoomDiagonal(): number {
        const contour = this.model.outerContour;
        if (contour.length === 0) return 10;

        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;
        for (const p of contour) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const dx = maxX - minX;
        const dy = maxY - minY;
        const dz = this.model.height;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Dispose this room and all child display objects
     */
    dispose = () => {
        if (this.cameraManager) {
            this.cameraManager.removeEventListener('change', this.onCameraManagerChange);
            this.cameraManager = null;
        }
        if (this.activeCamera) {
            // Restore clipping planes if camera was inside when disposed
            if (this.isCameraInside) {
                this.activeCamera.near = this.savedNear;
                this.activeCamera.far = this.savedFar;
            }
            this.activeCamera.removeEventListener('change', this.onActiveCameraChange);
            this.activeCamera = null;
        }
        this.model.removeEventListener('addChild', this.onActiveCameraChange);
        this.model.removeEventListener('dispose', this.dispose);

        for (const [id, display] of this.childDisplays) {
            display.dispose();
        }
        this.childDisplays.clear();

        // Dispose all Three.js GPU resources in the group hierarchy
        this.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                const materials = Array.isArray(child.material) ? child.material : [child.material];
                for (const mat of materials) {
                    if (mat) {
                        for (const key of Object.keys(mat)) {
                            const value = (mat as any)[key];
                            if (value && value instanceof THREE.Texture) {
                                value.dispose();
                            }
                        }
                        mat.dispose();
                    }
                }
            }
        });

        // Remove the group from its parent in the scene graph
        this.group.parent?.remove(this.group);

        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(ROOM_MODEL, Room);
