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
export function toThreeJS(point: THREE.Vector3): THREE.Vector3;
/**
 * Converts Euler angles from architectural coordinates (Z-up) to Three.js coordinates (Y-up).
 * Applies a -90° rotation around X axis to the rotation.
 */
export function toThreeJS(euler: THREE.Euler): THREE.Euler;
export function toThreeJS(input: THREE.Vector3 | THREE.Euler): THREE.Vector3 | THREE.Euler {
    if (input instanceof THREE.Vector3) {
        return input.clone().applyMatrix4(archToThreeJS);
    } else if (input instanceof THREE.Euler) {
        // Convert Euler angles by applying the coordinate transformation
        // Create a quaternion from the Euler, transform it, then extract new Euler
        const quaternion = new THREE.Quaternion().setFromEuler(input);
        const transformQuaternion = new THREE.Quaternion().setFromRotationMatrix(archToThreeJS);
        
        // Apply coordinate transformation: q' = T * q * T^-1
        const resultQuaternion = new THREE.Quaternion()
            .copy(transformQuaternion)
            .multiply(quaternion)
            .multiply(transformQuaternion.clone().invert());
        
        const resultEuler = new THREE.Euler().setFromQuaternion(resultQuaternion, input.order);
        return resultEuler;
    }
    throw new Error('Unsupported input type. Expected Vector3 or Euler.');
}

/**
 * Converts a single point from Three.js coordinates back to architectural coordinates.
 */
export function fromThreeJS(point: THREE.Vector3): THREE.Vector3;
/**
 * Converts Euler angles from Three.js coordinates (Y-up) back to architectural coordinates (Z-up).
 * Applies a +90° rotation around X axis to the rotation.
 */
export function fromThreeJS(euler: THREE.Euler): THREE.Euler;
export function fromThreeJS(input: THREE.Vector3 | THREE.Euler): THREE.Vector3 | THREE.Euler {
    if (input instanceof THREE.Vector3) {
        return input.clone().applyMatrix4(threeJSToArch);
    } else if (input instanceof THREE.Euler) {
        // Convert Euler angles by applying the inverse coordinate transformation
        const quaternion = new THREE.Quaternion().setFromEuler(input);
        const transformQuaternion = new THREE.Quaternion().setFromRotationMatrix(threeJSToArch);
        
        // Apply inverse coordinate transformation: q' = T^-1 * q * T
        const resultQuaternion = new THREE.Quaternion()
            .copy(transformQuaternion)
            .multiply(quaternion)
            .multiply(transformQuaternion.clone().invert());
        
        const resultEuler = new THREE.Euler().setFromQuaternion(resultQuaternion, input.order);
        return resultEuler;
    }
    throw new Error('Unsupported input type. Expected Vector3 or Euler.');
}
