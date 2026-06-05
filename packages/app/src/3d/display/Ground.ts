import { Face } from './Face';
import { GroundModel } from '@designer/core/model/GroundModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { GROUND_MODEL } from '@designer/core/types';

/**
 * 3D display object for a GroundModel.
 * Inherits from Face to distinguish ground from other faces
 */
export class Ground extends Face {
    constructor(model: GroundModel) {
        super(model);
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(GROUND_MODEL, Ground);
