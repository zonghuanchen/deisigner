import { FaceModel } from './FaceModel';
import { ModelRegistry } from '../ModelRegistry';
import { CEILING_MODEL } from '../types';
import * as THREE from 'three';
import { Material } from '../material/Material';

/**
 * CeilingModel - Represents the ceiling face in a room
 * Inherits from FaceModel to distinguish ceiling from other faces
 */
export class CeilingModel extends FaceModel {
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
ModelRegistry.getInstance().register(CEILING_MODEL, CeilingModel);
