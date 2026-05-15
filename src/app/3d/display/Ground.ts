import { Face } from './Face';
import { GroundModel } from '../../../core/model/GroundModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { GROUND_MODEL } from '../../../core/types';

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
