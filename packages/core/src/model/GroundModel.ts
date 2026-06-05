import { FaceModel } from './FaceModel';
import { ModelRegistry } from '../ModelRegistry';
import { GROUND_MODEL } from '../types';
import * as THREE from 'three';
import { Material } from '../material/Material';

/**
 * GroundModel - Represents the ground/floor face in a room
 * Inherits from FaceModel to distinguish ground from other faces
 */
export class GroundModel extends FaceModel {
    constructor(
        outerContour: THREE.Vector3[] = [],
        innerContours: THREE.Vector3[][] = [],
        material: Material = new Material(),
        id?: string
    ) {
        super(outerContour, innerContours, material, id);
    }
}

// Register the model
ModelRegistry.getInstance().register(GROUND_MODEL, GroundModel);
