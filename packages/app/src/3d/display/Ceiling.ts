import { Face } from './Face';
import { CeilingModel } from '@designer/core/model/CeilingModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { CEILING_MODEL } from '@designer/core/types';

/**
 * 3D display object for a CeilingModel.
 * Inherits from Face to distinguish ceiling from other faces
 */
export class Ceiling extends Face {
    constructor(model: CeilingModel) {
        super(model);
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(CEILING_MODEL, Ceiling);
