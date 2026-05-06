import * as THREE from 'three';

/**
 * Transforms coordinates from the architectural system (XY ground, Z up)
 * to the Three.js rendering system (XZ ground, Y up).
 *
 * This is a −90° rotation around the X axis.
 */
export const archToThreeJS = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/**
 * Transforms coordinates from the Three.js rendering system (XZ ground, Y up)
 * back to the architectural system (XY ground, Z up).
 *
 * This is a +90° rotation around the X axis.
 */
export const threeJSToArch = new THREE.Matrix4().makeRotationX(Math.PI / 2);

/**
 * Converts a single point from architectural coordinates to Three.js coordinates.
 */
export function toThreeJS(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().applyMatrix4(archToThreeJS);
}

/**
 * Converts a single point from Three.js coordinates back to architectural coordinates.
 */
export function fromThreeJS(point: THREE.Vector3): THREE.Vector3 {
    return point.clone().applyMatrix4(threeJSToArch);
}
