import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ParametricModeler, ParametricDef, ParametricResult } from '../util/ParametricModeler';
import { Material } from '../material/Material';
import { ModelRegistry } from '../ModelRegistry';
import { PARAMETRIC_MODEL } from '../types';

export interface ParametricChangeEvent {
    type: 'change';
    model: ParametricModel;
}

export interface ParametricDirtyEvent {
    type: 'dirty';
    model: ParametricModel;
}

export interface ParametricTransformEvent {
    type: 'transformChange';
    model: ParametricModel;
}

export type ParametricEventListener = (event: ParametricChangeEvent | ParametricDirtyEvent | ParametricTransformEvent) => void;

export interface ParametricEventMap {
    change: ParametricChangeEvent;
    dirty: ParametricDirtyEvent;
    transformChange: ParametricTransformEvent;
}

/**
 * Represents a parametric model that can be built from parameter definitions.
 * Supports position, rotation, scale transformations and dirty tracking for geometry rebuild.
 */
export class ParametricModel extends BaseModel {
    private _params: ParametricDef[] | null;
    private _materials: (Material | null)[] = [];
    private _position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private _rotation: THREE.Euler = new THREE.Euler(0, 0, 0);
    private _scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);

    constructor(
        params: ParametricDef[] | null = null,
        materials: (Material | null)[] = [],
        position: THREE.Vector3 = new THREE.Vector3(0, 0, 0),
        rotation: THREE.Euler = new THREE.Euler(0, 0, 0),
        scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1),
        id?: string
    ) {
        super(id, false);
        this._params = params;
        this._materials = materials;
        this._position = position.clone();
        this._rotation = rotation.clone();
        this._scale = scale.clone();
        this.bindMaterialListeners();
        this.dispatchCreateModel();
    }

    /**
     * Gets the parameter definitions used to build the parametric model
     */
    get params(): ParametricDef[] | null {
        return this._params;
    }

    /**
     * Sets the parameter definitions and triggers dirty event
     */
    set params(value: ParametricDef[] | null) {
        this._params = value;
        this.dispatchEvent({ type: 'dirty', model: this });
    }

    /**
     * Gets the materials array, one per param/geometry
     */
    get materials(): (Material | null)[] {
        return this._materials;
    }

    /**
     * Sets the materials array and triggers dirty event
     */
    set materials(value: (Material | null)[]) {
        this.unbindMaterialListeners();
        this._materials = value;
        this.bindMaterialListeners();
        this.dispatchEvent({ type: 'dirty', model: this });
    }

    /**
     * Bind change listeners on each material so changes propagate as dirty events
     */
    private _onMaterialChange = () => {
        this.dispatchEvent({ type: 'dirty', model: this });
    };

    private bindMaterialListeners(): void {
        for (const mat of this._materials) {
            if (mat) {
                mat.addEventListener('change', this._onMaterialChange);
            }
        }
    }

    private unbindMaterialListeners(): void {
        for (const mat of this._materials) {
            if (mat) {
                mat.removeEventListener('change', this._onMaterialChange);
            }
        }
    }

    /**
     * Gets the position of the parametric model
     */
    get position(): THREE.Vector3 {
        return this._position;
    }

    /**
     * Sets the position and triggers transformChange event
     */
    set position(value: THREE.Vector3) {
        if (!this._position.equals(value)) {
            this._position.copy(value);
            this.dispatchEvent({ type: 'transformChange', model: this });
        }
    }

    /**
     * Gets the rotation of the parametric model
     */
    get rotation(): THREE.Euler {
        return this._rotation;
    }

    /**
     * Sets the rotation and triggers transformChange event
     */
    set rotation(value: THREE.Euler) {
        if (this._rotation.x !== value.x || this._rotation.y !== value.y || this._rotation.z !== value.z) {
            this._rotation.copy(value);
            this.dispatchEvent({ type: 'transformChange', model: this });
        }
    }

    /**
     * Gets the scale of the parametric model
     */
    get scale(): THREE.Vector3 {
        return this._scale;
    }

    /**
     * Sets the scale and triggers transformChange event
     */
    set scale(value: THREE.Vector3) {
        if (!this._scale.equals(value)) {
            this._scale.copy(value);
            this.dispatchEvent({ type: 'transformChange', model: this });
        }
    }

    /**
     * Builds and returns the parametric geometry from the current params
     * @returns The resulting JSCAD geometry or null if params are not set
     */
    getGraphData(): ParametricResult | null {
        if (!this._params || this._params.length === 0) {
            return null;
        }
        const geometries = ParametricModeler.buildParametricModel(this._params);
        if (!geometries || geometries.length === 0) {
            return null;
        }
        return {
            geometries,
            materials: this._materials,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z },
            scale: { x: this._scale.x, y: this._scale.y, z: this._scale.z },
        };
    }

    getUI(): Record<string, any> {
        return {
            id: this._id,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z },
            scale: { x: this._scale.x, y: this._scale.y, z: this._scale.z },
            params: this._params?.map(p => ({ type: p.type, params: p.params, bool: p.bool })) ?? [],
            materials: this._materials.map(m => m?.getUI() ?? null),
        };
    }
}

// Register the model
ModelRegistry.getInstance().register(PARAMETRIC_MODEL, ParametricModel);
