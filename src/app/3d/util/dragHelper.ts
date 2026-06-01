import * as THREE from 'three';
import { CameraModel } from '../../../core';
import { toThreeJS, fromThreeJS } from './archToThreeJS';

/**
 * Result of a drag position computation.
 */
export interface DragPositionResult {
    /** New position in architectural coordinates (Z-up) */
    position: THREE.Vector3;
    /** World-space intersection point in Three.js coordinates (useful for computing drag offset) */
    worldPoint: THREE.Vector3;
}

// Reusable internals to avoid per-frame allocations
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _plane = new THREE.Plane();
const _intersection = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
/** Reusable proxy camera built from CameraModel data for raycasting */
const _proxyCamera = new THREE.PerspectiveCamera();

/** Threshold below which the view is considered too shallow for a horizontal plane */
const STEEPNESS_THRESHOLD = 0.3;

/**
 * Syncs the internal proxy PerspectiveCamera from a CameraModel.
 * Converts from architectural coordinates (Z-up) to Three.js coordinates (Y-up).
 */
function syncProxyCamera(cameraModel: CameraModel): void {
    _proxyCamera.position.copy(toThreeJS(cameraModel.position));
    _proxyCamera.up.copy(toThreeJS(cameraModel.up));
    _proxyCamera.fov = cameraModel.fov;
    _proxyCamera.aspect = cameraModel.aspect;
    _proxyCamera.near = cameraModel.near;
    _proxyCamera.far = cameraModel.far;
    _proxyCamera.zoom = cameraModel.zoom;
    _proxyCamera.lookAt(toThreeJS(cameraModel.target));
    _proxyCamera.updateProjectionMatrix();
}

/**
 * Sets up the drag plane adaptively based on the viewing angle.
 *
 * When the camera looks steeply down at the model the horizontal plane
 * gives natural ground-plane dragging.  When the camera is nearly at
 * the same height as the model the horizontal plane becomes unstable
 * (the ray barely intersects it, sending the intersection point to
 * infinity).  In that case a plane perpendicular to the camera
 * direction, passing through the model, is used instead.
 *
 * Must be called before `_raycaster.ray.intersectPlane(...)`.
 */
function setupDragPlane(
    modelWorldPos: THREE.Vector3,
    rayOrigin: THREE.Vector3,
): void {
    // Direction from camera to model
    _camDir.subVectors(modelWorldPos, rayOrigin).normalize();

    // |dot| ≈ 1  → looking steeply down/up  → horizontal plane is ideal
    // |dot| ≈ 0  → looking nearly sideways   → horizontal plane is unstable
    const steepness = Math.abs(_camDir.dot(_up));

    if (steepness > STEEPNESS_THRESHOLD) {
        // Steep enough – use the horizontal plane at the model's height
        _plane.set(_up, -modelWorldPos.y);
    } else {
        // Shallow view – use a plane perpendicular to the view direction,
        // passing through the model position.  This always gives a stable
        // intersection regardless of camera height.
        _plane.setFromNormalAndCoplanarPoint(_camDir, modelWorldPos);
    }
}

/**
 * Computes a new model position by casting a ray from the camera through the
 * given screen-space mouse coordinates and intersecting it with an adaptive
 * plane at the model's current position.
 *
 * The drag plane is chosen automatically:
 * - **Steep view** (camera well above/below model) → horizontal plane
 * - **Shallow view** (camera ≈ model height) → view-facing plane
 *
 * Model position is in **architectural coordinates** (XY ground, Z up).
 * Mouse coordinates are **screen pixels** relative to the renderer canvas.
 * The returned position is in **architectural coordinates**, ready to be
 * assigned back to `model.position`.
 *
 * @param modelPosition  Current model position in architectural coordinates
 * @param clientX        Mouse X in screen pixels (relative to canvas)
 * @param clientY        Mouse Y in screen pixels (relative to canvas)
 * @param canvasWidth    Width of the renderer canvas in pixels
 * @param canvasHeight   Height of the renderer canvas in pixels
 * @param cameraModel    The CameraModel (architectural coordinates, Z-up)
 * @returns              New position and the raw world intersection point,
 *                       or `null` if the ray does not intersect the plane
 */
export function computeDragPosition(
    modelPosition: THREE.Vector3,
    clientX: number,
    clientY: number,
    canvasWidth: number,
    canvasHeight: number,
    cameraModel: CameraModel,
): DragPositionResult | null {
    // Convert screen pixels to NDC (-1 to +1)
    _mouse.set(
        (clientX / canvasWidth) * 2 - 1,
        -(clientY / canvasHeight) * 2 + 1,
    );

    syncProxyCamera(cameraModel);
    _raycaster.setFromCamera(_mouse, _proxyCamera);

    // Convert model position to Three.js world space for plane setup
    const threePos = toThreeJS(modelPosition);
    setupDragPlane(threePos, _raycaster.ray.origin);

    if (!_raycaster.ray.intersectPlane(_plane, _intersection)) {
        return null;
    }

    // Convert the intersection back to architectural coordinates
    const archPosition = fromThreeJS(_intersection.clone());

    return {
        position: archPosition,
        worldPoint: _intersection.clone(),
    };
}

/**
 * Computes the drag offset between the initial pick point and the model's
 * origin. Call this once on pointer-down; then on each pointer-move, subtract
 * this offset from the new `worldPoint` to get the final model position.
 *
 * @param modelPosition  Current model position in architectural coordinates
 * @param clientX        Mouse X in screen pixels at pointer-down
 * @param clientY        Mouse Y in screen pixels at pointer-down
 * @param canvasWidth    Width of the renderer canvas in pixels
 * @param canvasHeight   Height of the renderer canvas in pixels
 * @param cameraModel    The CameraModel (architectural coordinates, Z-up)
 * @returns              Offset vector in architectural coordinates,
 *                       or `null` if the ray does not hit the plane
 */
export function computeDragOffset(
    modelPosition: THREE.Vector3,
    clientX: number,
    clientY: number,
    canvasWidth: number,
    canvasHeight: number,
    cameraModel: CameraModel,
): THREE.Vector3 | null {
    const result = computeDragPosition(
        modelPosition,
        clientX, clientY,
        canvasWidth, canvasHeight,
        cameraModel,
    );
    if (!result) return null;

    // offset = pickPoint - modelPosition (both in architectural coords)
    return result.position.clone().sub(modelPosition);
}

/**
 * Computes the final model position during a drag, given the current mouse
 * position and a pre-computed drag offset (from `computeDragOffset`).
 *
 * @param offset         Offset from `computeDragOffset` (architectural coords)
 * @param modelPosition  Current model position in architectural coordinates
 * @param clientX        Current mouse X in screen pixels
 * @param clientY        Current mouse Y in screen pixels
 * @param canvasWidth    Width of the renderer canvas in pixels
 * @param canvasHeight   Height of the renderer canvas in pixels
 * @param cameraModel    The CameraModel (architectural coordinates, Z-up)
 * @returns              New model position in architectural coordinates,
 *                       or `null` if the ray does not hit the plane
 */
export function computeDragPositionWithOffset(
    offset: THREE.Vector3,
    modelPosition: THREE.Vector3,
    clientX: number,
    clientY: number,
    canvasWidth: number,
    canvasHeight: number,
    cameraModel: CameraModel,
): THREE.Vector3 | null {
    // Convert screen pixels to NDC
    _mouse.set(
        (clientX / canvasWidth) * 2 - 1,
        -(clientY / canvasHeight) * 2 + 1,
    );

    syncProxyCamera(cameraModel);
    _raycaster.setFromCamera(_mouse, _proxyCamera);

    // Use the model's full position (not just Z) for adaptive plane setup
    const threePos = toThreeJS(modelPosition);
    setupDragPlane(threePos, _raycaster.ray.origin);

    if (!_raycaster.ray.intersectPlane(_plane, _intersection)) {
        return null;
    }

    // Convert to architectural and subtract the pick offset
    const archPoint = fromThreeJS(_intersection.clone());
    return archPoint.sub(offset);
}
