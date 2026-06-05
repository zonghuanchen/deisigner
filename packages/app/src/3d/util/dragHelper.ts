import * as THREE from 'three';
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
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Computes a new model position by casting a ray from the camera through the
 * given screen-space mouse coordinates and intersecting it with the
 * horizontal plane (XY) at the model's current height.
 *
 * @param modelPosition  Current model position in architectural coordinates
 * @param clientX        Mouse X in screen pixels (relative to canvas)
 * @param clientY        Mouse Y in screen pixels (relative to canvas)
 * @param canvasWidth    Width of the renderer canvas in pixels
 * @param canvasHeight   Height of the renderer canvas in pixels
 * @param camera         The actual Three.js PerspectiveCamera (Y-up, world coords)
 * @returns              New position and the raw world intersection point,
 *                       or `null` if the ray does not intersect the plane
 */
export function computeDragPosition(
    modelPosition: THREE.Vector3,
    clientX: number,
    clientY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: THREE.PerspectiveCamera,
): DragPositionResult | null {
    // Convert screen pixels to NDC (-1 to +1)
    _mouse.set(
        (clientX / canvasWidth) * 2 - 1,
        -(clientY / canvasHeight) * 2 + 1,
    );

    _raycaster.setFromCamera(_mouse, camera);

    // Set up horizontal plane (XY) at the model's Y height (Three.js coords)
    const threePos = toThreeJS(modelPosition);
    _plane.set(_up, -threePos.y);

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
 * @param camera         The actual Three.js PerspectiveCamera (Y-up, world coords)
 * @returns              Offset vector in architectural coordinates,
 *                       or `null` if the ray does not hit the plane
 */
export function computeDragOffset(
    modelPosition: THREE.Vector3,
    clientX: number,
    clientY: number,
    canvasWidth: number,
    canvasHeight: number,
    camera: THREE.PerspectiveCamera,
): THREE.Vector3 | null {
    const result = computeDragPosition(
        modelPosition,
        clientX, clientY,
        canvasWidth, canvasHeight,
        camera,
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
 * @param camera         The actual Three.js PerspectiveCamera (Y-up, world coords)
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
    camera: THREE.PerspectiveCamera,
): THREE.Vector3 | null {
    // Convert screen pixels to NDC
    _mouse.set(
        (clientX / canvasWidth) * 2 - 1,
        -(clientY / canvasHeight) * 2 + 1,
    );

    _raycaster.setFromCamera(_mouse, camera);

    // Set up horizontal plane (XY) at the model's Y height (Three.js coords)
    const threePos = toThreeJS(modelPosition);
    _plane.set(_up, -threePos.y);

    if (!_raycaster.ray.intersectPlane(_plane, _intersection)) {
        return null;
    }

    // Convert to architectural and subtract the pick offset
    const archPoint = fromThreeJS(_intersection.clone());
    return archPoint.sub(offset);
}
