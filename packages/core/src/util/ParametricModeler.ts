import { booleans, primitives, transforms } from '@jscad/modeling';
import type { Material } from '../material/Material';

/**
 * Parametric shape definition without boolean operations
 */
export type ShapeDef = {
    type: keyof typeof primitives;
    params: Record<string, any>;
};

/**
 * Boolean operation definition
 */
export type BooleanOp = {
    type: 'union' | 'subtract' | 'intersect';
    shape: ShapeDef;
};

/**
 * Complete parametric definition with optional boolean operations
 */
export type ParametricDef = {
    type: keyof typeof primitives;
    params: Record<string, any>;
    bool?: BooleanOp[];
};

/**
 * Result type from parametric model building.
 * Contains the JSCAD geometry and the model's RTS (rotation, translation, scale).
 */
export type ParametricResult = {
    geometries: any[];
    materials: (Material | null)[];
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
};

/**
 * Parametric Modeler using @jscad/modeling
 * Pure JavaScript - no WASM compilation lag
 */
export class ParametricModeler {

    /**
     * Initialize (no-op for JSCAD, kept for API compatibility)
     */
    static async initialize(): Promise<void> {
        // JSCAD doesn't need initialization
        return Promise.resolve();
    }

    /**
     * Build a parametric model from a definition array
     * @param definitions Array of parametric shape definitions with optional boolean operations
     * @returns The resulting geometry (Geom2 or Geom3)
     */
    static buildParametricModel(definitions: ParametricDef[]): any[] {
        if (!definitions || definitions.length === 0) {
            return [];
        }

        return definitions.map(def => {
            let result = this.buildShape(def);
            if (def.bool && def.bool.length > 0) {
                result = this.applyBooleans(result, def.bool);
            }
            return result;
        });
    }

    /**
     * Build a single shape from definition
     * @param def Shape definition
     * @returns The created geometry
     */
    private static buildShape(def: ShapeDef): any {
        const { type, params } = def;
        
        if (!(type in primitives)) {
            throw new Error(`Unknown primitive type: ${type}`);
        }

        const primitiveFn = (primitives as any)[type];
        return primitiveFn(params || {});
    }

    /**
     * Apply boolean operations to a base geometry
     * @param base The base geometry to operate on
     * @param boolOps Array of boolean operations to apply
     * @returns The resulting geometry after all boolean operations
     */
    private static applyBooleans(base: any, boolOps: BooleanOp[]): any {
        let result = base;

        for (const op of boolOps) {
            const operand = this.buildShape(op.shape);

            switch (op.type) {
                case 'union':
                    result = booleans.union(result, operand);
                    break;
                case 'subtract':
                    result = booleans.subtract(result, operand);
                    break;
                case 'intersect':
                    result = booleans.intersect(result, operand);
                    break;
                default:
                    throw new Error(`Unknown boolean operation: ${op.type}`);
            }
        }

        return result;
    }
}
