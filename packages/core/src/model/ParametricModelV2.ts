import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { PARAMETRIC_MODEL_V2 } from '../types';
import {
    ParametricModeler,
    ConstraintSystem,
} from '@designer/pm-engine';
import type {
    ParametricDef,
    GeometryData,
    MaterialData,
    BindingMap,
    VariableMap,
} from '@designer/pm-engine';

// ─── JSON schema produced by pm-editor ─────────────────────────────────────────

/**
 * A single binding entry within a ConstraintEntryJson.
 * Mirrors pm-editor's `ConstraintEntry.bindings[n]` structure.
 */
export interface BindingEntryJson {
    /** ParametricDef index (mutually exclusive with `model`) */
    def?: number;
    /** GLB model index (mutually exclusive with `def`) */
    model?: number;
    /** Parameter path (e.g. "size.0", "position.x") */
    path: string;
    /** Expression string (e.g. "width * 2") */
    expr: string;
}

/**
 * Constraint entry as serialized by pm-editor.
 * Mirrors pm-editor's `ConstraintEntry` structure.
 */
export interface ConstraintEntryJson {
    name: string;
    description?: string;
    value: number;
    /** Slider minimum (optional) */
    min?: number;
    /** Slider maximum (optional) */
    max?: number;
    /** Slider step increment (optional) */
    step?: number;
    /** Optional condition expression: binding only applies when truthy */
    condition?: string;
    /** Binding entries driven by this variable */
    bindings: BindingEntryJson[];
}

/**
 * GLB model item as serialized by pm-editor (kept for completeness; not built here).
 */
export interface GlbModelJson {
    glb: string;
    label: string;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
}

/**
 * The full JSON document produced by pm-editor and consumed by ParametricModelV2.
 */
export interface PmEditorJson {
    params: ParametricDef[];
    constraint?: ConstraintEntryJson[];
    models?: GlbModelJson[];
}

// ─── GraphData output types ────────────────────────────────────────────────────

/**
 * One geometry entry in the resulting graph, with its own local transform.
 */
export interface GeometryItem {
    /** JSCAD geometry (geom2 or geom3) */
    geometry: any;
    /** Pre-computed UV coordinates */
    uvs: Float64Array;
    /** Material definition (null if none) */
    material: MaterialData | null;
    /** Local position (from ParametricDef, before global RTS) */
    position: { x: number; y: number; z: number };
    /** Local Euler rotation (radians, from ParametricDef) */
    rotation: { x: number; y: number; z: number };
    /** Local scale (from ParametricDef) */
    scale: { x: number; y: number; z: number };
}

/**
 * Metadata for a single constraint variable, extracted from ConstraintEntryJson.
 * Carries UI hints (description, slider range) so downstream consumers can
 * render appropriate controls without re-parsing the original JSON.
 */
export interface ConstraintVariableMeta {
    /** Variable name (key into VariableMap) */
    name: string;
    /** Human-readable description */
    description: string;
    /** Initial / default value */
    value: number;
    /** Slider minimum */
    min?: number;
    /** Slider maximum */
    max?: number;
    /** Slider step increment */
    step?: number;
    /** Condition expression (binding active only when truthy) */
    condition?: string;
}

/**
 * Resolved transform for a GLB model item after constraint evaluation.
 */
export interface GlbModelTransform {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
}

/**
 * Result of building a ParametricModelV2 from a pm-editor JSON document.
 * Global RTS is stored separately; each item keeps only its local transform.
 */
export interface GraphData {
    items: GeometryItem[];
    /** Original variables resolved from constraints */
    variables: VariableMap;
    /** Per-variable metadata (description, range, step) for UI rendering */
    constraintVariables: ConstraintVariableMeta[];
    /** Resolved GLB model transforms (after constraint evaluation) */
    models: GlbModelTransform[];
    /** Global position applied to the whole group */
    position: { x: number; y: number; z: number };
    /** Global Euler rotation (radians) applied to the whole group */
    rotation: { x: number; y: number; z: number };
    /** Global scale applied to the whole group */
    scale: { x: number; y: number; z: number };
}

// ─── Events ────────────────────────────────────────────────────────────────────

export interface ParametricV2ChangeEvent {
    type: 'change';
    model: ParametricModelV2;
}

export interface ParametricV2DirtyEvent {
    type: 'dirty';
    model: ParametricModelV2;
}

export interface ParametricV2DirtyTransformEvent {
    type: 'dirtyTransform';
    model: ParametricModelV2;
}

export type ParametricV2EventListener = (
    event: ParametricV2ChangeEvent | ParametricV2DirtyEvent | ParametricV2DirtyTransformEvent,
) => void;

// ─── Model class ───────────────────────────────────────────────────────────────

const DEFAULT_VEC3 = { x: 0, y: 0, z: 0 };
const DEFAULT_SCALE = { x: 1, y: 1, z: 1 };

/**
 * ParametricModelV2
 *
 * Consumes the JSON document exported by pm-editor and produces a `GraphData`
 * where each geometry keeps its local transform, and the global RTS
 * (position / rotation / scale) is stored separately on the GraphData.
 *
 * The 3D display layer applies the global RTS to the group node and the
 * local RTS to each individual mesh.
 */
export class ParametricModelV2 extends BaseModel {
    private _json: PmEditorJson | null = null;
    private _constraintSystem: ConstraintSystem = new ConstraintSystem();
    private _graphData: GraphData | null = null;
    /** Per-variable metadata extracted from constraint entries */
    private _constraintMeta: ConstraintVariableMeta[] = [];

    // Overall transform applied to the group (not composed into individual items)
    private _position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private _rotation: THREE.Euler = new THREE.Euler(0, 0, 0);
    private _scale: THREE.Vector3 = new THREE.Vector3(1, 1, 1);

    constructor(json?: PmEditorJson, id?: string) {
        super(id, false);
        if (json) {
            this.loadJson(json);
        }
        this.dispatchCreateModel();
    }

    // ─── Public API ──────────────────────────────────────────────────────────

    /**
     * Load (or replace) the pm-editor JSON and rebuild the graph.
     */
    loadJson(json: PmEditorJson): void {
        this._json = json;
        this._initVariables(json.constraint);
        this._rebuild();
    }

    /**
     * The raw pm-editor JSON currently loaded.
     */
    get json(): PmEditorJson | null {
        return this._json;
    }

    /**
     * The ConstraintSystem used to resolve bindings.
     * Exposed so callers can inspect or mutate variables.
     */
    get constraintSystem(): ConstraintSystem {
        return this._constraintSystem;
    }

    /**
     * Resolved variable map (read-only snapshot).
     */
    get variables(): VariableMap {
        return this._constraintSystem.variables;
    }

    /**
     * Per-variable metadata (description, range, step) for UI rendering.
     */
    get constraintVariables(): ConstraintVariableMeta[] {
        return this._constraintMeta;
    }

    /**
     * Update one or more variables and rebuild the graph.
     */
    setVariables(vars: VariableMap): void {
        this._constraintSystem.setVariables(vars);
        this._rebuild();
    }

    /**
     * The latest GraphData produced from the loaded JSON.
     * Global RTS is stored on the GraphData; items keep local transforms only.
     */
    get graphData(): GraphData | null {
        return this._graphData;
    }

    /**
     * Alias kept for symmetry with ParametricModel.getGraphData().
     */
    getGraphData(): GraphData | null {
        return this._graphData;
    }

    /**
     * The resolved ParametricDef array (after binding evaluation).
     */
    get resolvedDefs(): ParametricDef[] | null {
        if (!this._json?.params) return null;
        return this._resolveDefs(this._json.params, this._json.constraint);
    }

    // ─── Overall transform ────────────────────────────────────────────────────

    /** Overall position applied on top of each geometry's local transform. */
    get position(): THREE.Vector3 { return this._position; }
    set position(value: THREE.Vector3) {
        if (!this._position.equals(value)) {
            this._position.copy(value);
            this._applyGlobalTransform();
        }
    }

    /** Overall Euler rotation (radians) applied on top of each geometry's local transform. */
    get rotation(): THREE.Euler { return this._rotation; }
    set rotation(value: THREE.Euler) {
        if (this._rotation.x !== value.x || this._rotation.y !== value.y || this._rotation.z !== value.z) {
            this._rotation.copy(value);
            this._applyGlobalTransform();
        }
    }

    /** Overall scale applied on top of each geometry's local transform. */
    get scale(): THREE.Vector3 { return this._scale; }
    set scale(value: THREE.Vector3) {
        if (!this._scale.equals(value)) {
            this._scale.copy(value);
            this._applyGlobalTransform();
        }
    }

    // ─── Overrides ──────────────────────────────────────────────────────────

    getUI(): Record<string, any> {
        const defs = this._json?.params ?? [];
        return {
            id: this._id,
            defCount: defs.length,
            variables: this.variables,
            constraintVariables: this._constraintMeta,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z },
            scale: { x: this._scale.x, y: this._scale.y, z: this._scale.z },
            items: this._graphData?.items.map(item => ({
                position: item.position,
                rotation: item.rotation,
                scale: item.scale,
                material: item.material,
            })) ?? [],
        };
    }

    // ─── Internal ────────────────────────────────────────────────────────────

    /**
     * Initialise ConstraintSystem variables and extract metadata from constraint entries.
     */
    private _initVariables(constraints?: ConstraintEntryJson[]): void {
        const vars: VariableMap = {};
        const meta: ConstraintVariableMeta[] = [];
        if (constraints) {
            for (const c of constraints) {
                vars[c.name] = c.value;
                meta.push({
                    name: c.name,
                    description: c.description ?? '',
                    value: c.value,
                    min: c.min,
                    max: c.max,
                    step: c.step,
                    condition: c.condition,
                });
            }
        }
        this._constraintSystem.setVariables(vars);
        this._constraintMeta = meta;
    }

    /**
     * Resolve bindings for all defs using the ConstraintSystem.
     * Reads the array-based `bindings` from each ConstraintEntryJson
     * (same structure as pm-editor's ConstraintEntry).
     */
    private _resolveDefs(
        defs: ParametricDef[],
        constraints?: ConstraintEntryJson[],
    ): ParametricDef[] {
        if (!constraints || constraints.length === 0) {
            return defs;
        }

        // Build a defIndex → BindingMap lookup from constraints.
        // Skip constraint entries whose condition evaluates to false.
        const bindingsByDef = new Map<number, BindingMap>();
        for (const c of constraints) {
            if (c.condition && !this._constraintSystem.evaluateCondition(c.condition)) {
                continue;
            }
            for (const b of c.bindings) {
                if (b.def === undefined) continue;
                const existing = bindingsByDef.get(b.def) ?? {};
                existing[b.path] = b.expr;
                bindingsByDef.set(b.def, existing);
            }
        }

        return defs.map((def, i) => {
            const bindings = bindingsByDef.get(i) ?? def.bindings;
            if (!bindings || Object.keys(bindings).length === 0) return def;
            return this._constraintSystem.resolveDef(def, bindings);
        });
    }

    /**
     * Extract GLB model bindings from constraints for a given model index.
     */
    private _getBindingsForModel(
        modelIndex: number,
        constraints?: ConstraintEntryJson[],
    ): BindingMap {
        const bindings: BindingMap = {};
        if (!constraints) return bindings;
        for (const c of constraints) {
            if (c.condition && !this._constraintSystem.evaluateCondition(c.condition)) {
                continue;
            }
            for (const b of c.bindings) {
                if (b.model === modelIndex) {
                    bindings[b.path] = b.expr;
                }
            }
        }
        return bindings;
    }

    /**
     * Set a value on a GlbModelTransform by dot-path.
     * Supports paths like "position.x", "rotation.z", "scale.y".
     */
    private _setVec3ByPath(
        obj: GlbModelTransform,
        path: string,
        value: number,
    ): void {
        const parts = path.split('.');
        if (parts.length !== 2) return;
        const [vec, axis] = parts as [keyof GlbModelTransform, 'x' | 'y' | 'z'];
        if (obj[vec] && axis in obj[vec]) {
            (obj[vec] as any)[axis] = value;
        }
    }

    /**
     * Rebuild the GraphData from the current JSON + resolved variables.
     * Each ParametricDef becomes one GeometryItem with its own transform.
     * GLB model transforms are resolved from constraint bindings.
     */
    private _rebuild(): void {
        if (!this._json) {
            this._graphData = null;
            this.dispatchEvent({ type: 'dirty', model: this });
            return;
        }

        // ── JSCAD parametric geometry ──────────────────────────────────────
        const params = this._json.params ?? [];
        let items: GeometryItem[] = [];

        if (params.length > 0) {
            const resolvedDefs = this._resolveDefs(params, this._json.constraint);
            const geometryData: GeometryData[] = ParametricModeler.buildGeometries(resolvedDefs);

            items = geometryData.map((gd, i) => {
                const def = resolvedDefs[i];
                return {
                    geometry: gd.geometry,
                    uvs: gd.uvs,
                    material: def.material ?? null,
                    position: { ...(def.position ?? DEFAULT_VEC3) },
                    rotation: { ...(def.rotation ?? DEFAULT_VEC3) },
                    scale: { ...(def.scale ?? DEFAULT_SCALE) },
                };
            });
        }

        // ── GLB model transforms (resolved from constraints) ───────────────
        const models = this._json.models ?? [];
        const resolvedModels: GlbModelTransform[] = models.map((m, i) => {
            const bindings = this._getBindingsForModel(i, this._json!.constraint);
            const base = {
                position: { ...(m.position ?? DEFAULT_VEC3) },
                rotation: { ...(m.rotation ?? DEFAULT_VEC3) },
                scale: { ...(m.scale ?? DEFAULT_SCALE) },
            };
            // Evaluate binding expressions and override base values
            for (const [path, expr] of Object.entries(bindings)) {
                const result = this._constraintSystem.evaluate(expr);
                if (result.error) continue;
                this._setVec3ByPath(base, path, result.value);
            }
            return base;
        });

        this._graphData = {
            items,
            variables: this._constraintSystem.variables,
            constraintVariables: this._constraintMeta,
            models: resolvedModels,
            position: { x: this._position.x, y: this._position.y, z: this._position.z },
            rotation: { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z },
            scale: { x: this._scale.x, y: this._scale.y, z: this._scale.z },
        };

        this.dispatchEvent({ type: 'change', model: this });
    }

    /**
     * Dispatch dirtyTransform event so the 3D display re-reads the model's
     * position / rotation / scale and applies them to the group node.
     * Also syncs graphData for data consistency.
     */
    private _applyGlobalTransform(): void {
        if (this._graphData) {
            this._graphData.position = { x: this._position.x, y: this._position.y, z: this._position.z };
            this._graphData.rotation = { x: this._rotation.x, y: this._rotation.y, z: this._rotation.z };
            this._graphData.scale = { x: this._scale.x, y: this._scale.y, z: this._scale.z };
        }

        this.dispatchEvent({ type: 'dirtyTransform', model: this });
    }
}

// Register the model
ModelRegistry.getInstance().register(PARAMETRIC_MODEL_V2, ParametricModelV2);
