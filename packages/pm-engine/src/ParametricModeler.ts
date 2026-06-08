import { booleans, primitives, transforms } from '@jscad/modeling';

/**
 * 纯 JSON 材质描述，便于序列化与跨层集成
 */
export interface MaterialData {
    color: string;
    roughness: number;
    metalness: number;
    map?: string; // 纹理贴图 URL
}

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
    /** Optional Euler rotation (radians) applied to the operand before the boolean */
    rotation?: { x: number; y: number; z: number };
};

/**
 * 3D transform data for position, rotation, scale
 */
export interface TransformData {
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
}

/**
 * Complete parametric definition with optional boolean operations and material
 */
export type ParametricDef = {
    type: keyof typeof primitives;
    params: Record<string, any>;
    bool?: BooleanOp[];
    material?: MaterialData;
    position?: { x: number; y: number; z: number };
    rotation?: { x: number; y: number; z: number };
    scale?: { x: number; y: number; z: number };
};

/**
 * UV coordinate data for one geometry.
 * `uvs[i]` is [u, v] for the i-th triangulated vertex (same order as positions).
 */
export type GeometryUVs = Float64Array;

/**
 * Result of building a single definition: JSCAD geometry + pre-computed UVs.
 */
export type GeometryData = {
    geometry: any;
    uvs: GeometryUVs;
};

/**
 * Result type from parametric model building.
 * Contains the JSCAD geometries and associated materials / transforms.
 */
export type ParametricResult = {
    geometries: any[];
    materials: any[];
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
};

/**
 * One step in the parametric build process.
 */
export type BuildStep = {
    /** Step index (0 = base shape, 1..N = after each boolean op) */
    index: number;
    /** Human-readable label */
    label: string;
    /** The JSCAD geometry at this step */
    geometry: any;
    /** For boolean steps: the operand shape geometry */
    operand?: any;
};

/**
 * Parametric Modeler using @jscad/modeling
 * Pure JavaScript - no WASM compilation lag.
 *
 * Takes an array of ParametricDef and produces JSCAD geometries.
 */
export class ParametricModeler {

    /**
     * Initialize (no-op for JSCAD, kept for API compatibility)
     */
    static async initialize(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Build parametric geometry data from a definition array.
     * Each ParametricDef produces one JSCAD geometry with pre-computed UVs.
     * @param definitions Array of parametric shape definitions with optional boolean operations
     * @returns Array of GeometryData (geometry + uvs)
     */
    static buildGeometries(definitions: ParametricDef[]): GeometryData[] {
        if (!definitions || definitions.length === 0) {
            return [];
        }

        return definitions.map(def => {
            let result = this.buildShape(def);
            if (def.bool && def.bool.length > 0) {
                result = this.applyBooleans(result, def.bool);
            }
            const uvs = this.generateUVs(result);
            return { geometry: result, uvs };
        });
    }

    /**
     * Convenience: build only raw JSCAD geometries (no UVs).
     */
    static buildRawGeometries(definitions: ParametricDef[]): any[] {
        return this.buildGeometries(definitions).map(d => d.geometry);
    }

    /**
     * Alias kept for backward-compatibility
     * @deprecated Use buildGeometries instead
     */
    static buildParametricModel(definitions: ParametricDef[]): any[] {
        return this.buildRawGeometries(definitions);
    }

    /**
     * Build intermediate steps for a single ParametricDef.
     * Returns an array of BuildStep showing the progressive construction:
     *   step 0: base shape
     *   step 1..N: result after each boolean operation (with operand geometry)
     */
    static buildSteps(def: ParametricDef): BuildStep[] {
        const steps: BuildStep[] = [];

        // Step 0: base shape
        const base = this.buildShape(def);
        steps.push({ index: 0, label: `基础形状: ${def.type}`, geometry: base });

        // Boolean operations
        if (def.bool && def.bool.length > 0) {
            let result = base;
            for (let i = 0; i < def.bool.length; i++) {
                const op = def.bool[i];
                const operand = this.buildBoolOperand(op);
                const opLabel = op.type === 'subtract' ? '差集'
                    : op.type === 'union' ? '并集'
                    : op.type === 'intersect' ? '交集' : op.type;

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

                steps.push({
                    index: i + 1,
                    label: `${opLabel}: ${op.shape.type}`,
                    geometry: result,
                    operand,
                });
            }
        }

        return steps;
    }

    /**
     * Build a single shape from definition
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
     * Build the operand geometry for a boolean operation,
     * applying optional rotation around the shape's center.
     */
    private static buildBoolOperand(op: BooleanOp): any {
        let operand = this.buildShape(op.shape);
        if (op.rotation) {
            const { x, y, z } = op.rotation;
            if (x !== 0 || y !== 0 || z !== 0) {
                // Rotate around the shape center (from its params)
                const center = (op.shape.params?.center ?? [0, 0, 0]) as number[];
                const cx = center[0] ?? 0, cy = center[1] ?? 0, cz = center[2] ?? 0;
                // Translate to origin → rotate → translate back
                operand = transforms.translate([-cx, -cy, -cz], operand);
                if (z !== 0) operand = transforms.rotateZ(z, operand);
                if (y !== 0) operand = transforms.rotateY(y, operand);
                if (x !== 0) operand = transforms.rotateX(x, operand);
                operand = transforms.translate([cx, cy, cz], operand);
            }
        }
        return operand;
    }

    /**
     * Apply boolean operations to a base geometry
     */
    private static applyBooleans(base: any, boolOps: BooleanOp[]): any {
        let result = base;

        for (const op of boolOps) {
            const operand = this.buildBoolOperand(op);

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

    // ─── UV Generation ───────────────────────────────────────────────────────

    /**
     * Generate UV coordinates for a JSCAD geometry.
     * Dispatches to geom3 or geom2 UV generation.
     */
    private static generateUVs(jscadGeom: any): GeometryUVs {
        if (!jscadGeom) return new Float64Array(0);
        if (jscadGeom.polygons && Array.isArray(jscadGeom.polygons)) {
            return this.generateUVsGeom3(jscadGeom);
        }
        return this.generateUVsGeom2(jscadGeom);
    }

    /**
     * Generate UVs for geom3 by projecting each polygon onto its dominant plane,
     * then normalizing using the geometry's bounding box.
     */
    private static generateUVsGeom3(jscadGeom: any): GeometryUVs {
        const polygons = jscadGeom.polygons || [];

        // Compute bounding box from all polygon vertices
        const bbox = this.computeBBox3D(polygons);
        const sizeX = bbox.maxX - bbox.minX || 1;
        const sizeY = bbox.maxY - bbox.minY || 1;
        const sizeZ = bbox.maxZ - bbox.minZ || 1;

        // Count total triangulated vertices
        let totalVerts = 0;
        for (const poly of polygons) {
            const v = poly.vertices;
            if (!v || v.length < 3) continue;
            totalVerts += (v.length - 2) * 3;
        }

        const uvs = new Float64Array(totalVerts * 2);
        let idx = 0;

        for (const poly of polygons) {
            const verts = poly.vertices;
            if (!verts || verts.length < 3) continue;

            // Determine dominant projection plane from polygon normal
            const normal = this.polyNormal(poly);
            const ax = Math.abs(normal[0]), ay = Math.abs(normal[1]), az = Math.abs(normal[2]);

            // Pick the two axes for UV projection (drop the dominant normal axis)
            let uAxis: number, vAxis: number, uSize: number, vSize: number, uMin: number, vMin: number;
            if (az >= ax && az >= ay) {
                // Project onto XY plane
                uAxis = 0; vAxis = 1; uSize = sizeX; vSize = sizeY; uMin = bbox.minX; vMin = bbox.minY;
            } else if (ay >= ax) {
                // Project onto XZ plane
                uAxis = 0; vAxis = 2; uSize = sizeX; vSize = sizeZ; uMin = bbox.minX; vMin = bbox.minZ;
            } else {
                // Project onto YZ plane
                uAxis = 1; vAxis = 2; uSize = sizeY; vSize = sizeZ; uMin = bbox.minY; vMin = bbox.minZ;
            }

            for (let i = 1; i < verts.length - 1; i++) {
                const v0 = verts[0], v1 = verts[i], v2 = verts[i + 1];
                if (!v0 || !v1 || !v2) continue;
                for (const v of [v0, v1, v2]) {
                    uvs[idx++] = (v[uAxis] - uMin) / uSize;
                    uvs[idx++] = (v[vAxis] - vMin) / vSize;
                }
            }
        }

        return uvs;
    }

    /**
     * Generate UVs for geom2 by normalizing XY coordinates using bounding box.
     */
    private static generateUVsGeom2(jscadGeom: any): GeometryUVs {
        const sides = jscadGeom.sides || [];

        // Compute bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const outline of sides) {
            if (!outline) continue;
            for (const pt of outline) {
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
            }
        }
        const sizeX = maxX - minX || 1;
        const sizeY = maxY - minY || 1;

        // Count total triangulated vertices
        let totalVerts = 0;
        for (const outline of sides) {
            if (!outline || outline.length < 3) continue;
            totalVerts += (outline.length - 2) * 3;
        }

        const uvs = new Float64Array(totalVerts * 2);
        let idx = 0;

        for (const outline of sides) {
            if (!outline || outline.length < 3) continue;
            for (let i = 1; i < outline.length - 1; i++) {
                const v0 = outline[0], v1 = outline[i], v2 = outline[i + 1];
                if (!v0 || !v1 || !v2) continue;
                for (const v of [v0, v1, v2]) {
                    uvs[idx++] = (v[0] - minX) / sizeX;
                    uvs[idx++] = (v[1] - minY) / sizeY;
                }
            }
        }

        return uvs;
    }

    /**
     * Compute axis-aligned bounding box from geom3 polygons.
     */
    private static computeBBox3D(polygons: any[]): { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number } {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (const poly of polygons) {
            for (const v of poly.vertices || []) {
                if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
                if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
                if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
            }
        }
        if (!isFinite(minX)) { minX = minY = minZ = maxX = maxY = maxZ = 0; }
        return { minX, minY, minZ, maxX, maxY, maxZ };
    }

    /**
     * Compute polygon normal from plane or vertex cross product.
     */
    private static polyNormal(polygon: any): [number, number, number] {
        if (polygon.plane) {
            const n = polygon.plane;
            return [n[0], n[1], n[2]];
        }
        const verts = polygon.vertices;
        if (!verts || verts.length < 3) return [0, 0, 1];
        const v0 = verts[0], v1 = verts[1], v2 = verts[2];
        const bax = v1[0] - v0[0], bay = v1[1] - v0[1], baz = v1[2] - v0[2];
        const cax = v2[0] - v0[0], cay = v2[1] - v0[1], caz = v2[2] - v0[2];
        const nx = bay * caz - baz * cay;
        const ny = baz * cax - bax * caz;
        const nz = bax * cay - bay * cax;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len === 0) return [0, 0, 1];
        return [nx / len, ny / len, nz / len];
    }
}
