import * as THREE from 'three';
import type { ParametricDef, MaterialData, GeometryData, GeometryUVs } from './ParametricModeler';

// ─── Coordinate conversion ──────────────────────────────────────────────────

/**
 * Rotation matrix: architectural coords (XY ground, Z up) → Three.js coords (XZ ground, Y up).
 * Equivalent to −90° rotation around X axis.
 */
const ARCH_TO_THREE = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Apply model-layer transforms (Z-up) to a THREE.Group (Y-up).
 * Coordinate conversion: model(x, y, z) → three(x, z, y)
 */
export function applyDefTransform(group: THREE.Group, def: Pick<ParametricDef, 'position' | 'rotation' | 'scale'>): void {
    const p = def.position;
    group.position.set(p?.x ?? 0, p?.z ?? 0, p?.y ?? 0);
    const r = def.rotation;
    group.rotation.set(r?.x ?? 0, r?.z ?? 0, r?.y ?? 0);
    const s = def.scale;
    group.scale.set(s?.x ?? 1, s?.z ?? 1, s?.y ?? 1);
}

// ─── Material ───────────────────────────────────────────────────────────────

/**
 * Create a THREE.MeshStandardMaterial from a MaterialData definition.
 * @param mat Material definition (color, roughness, metalness, map)
 * @param texture Optional pre-loaded THREE.Texture (caller is responsible for loading & caching)
 */
export function createThreeMaterial(mat: MaterialData, texture?: THREE.Texture | null): THREE.MeshStandardMaterial {
    const hasTexture = !!texture;
    const threeMat = new THREE.MeshStandardMaterial({
        color: hasTexture ? 0xffffff : mat.color,
        roughness: mat.roughness,
        metalness: mat.metalness,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(hasTexture ? 0x222222 : 0x000000),
    });
    if (hasTexture) {
        threeMat.map = texture!;
        threeMat.needsUpdate = true;
    }
    return threeMat;
}

/**
 * Apply partial MaterialData updates to an existing THREE.MeshStandardMaterial.
 * @param threeMat The material to update
 * @param update Partial material properties
 * @param baseColor The full material color (used when removing texture to restore color)
 * @param texture Pre-loaded texture if setting a map; `null` to clear; `undefined` = no change
 */
export function updateThreeMaterial(
    threeMat: THREE.MeshStandardMaterial,
    update: Partial<MaterialData>,
    baseColor?: string,
    texture?: THREE.Texture | null,
): void {
    if (update.color !== undefined) {
        threeMat.color.set(update.color);
    }
    if (update.roughness !== undefined) {
        threeMat.roughness = update.roughness;
    }
    if (update.metalness !== undefined) {
        threeMat.metalness = update.metalness;
    }
    if (texture !== undefined) {
        if (texture) {
            threeMat.map = texture;
            threeMat.color.set(0xffffff);
            threeMat.emissive.set(0x222222);
        } else {
            threeMat.map = null;
            threeMat.color.set(baseColor ?? 0xcccccc);
            threeMat.emissive.set(0x000000);
        }
        threeMat.needsUpdate = true;
    }
}

// ─── Geometry conversion (JSCAD → Three.js BufferGeometry) ──────────────────

/**
 * Converts a JSCAD geom3 to a Three.js BufferGeometry (with arch→Three coord transform).
 */
function geom3ToBuffer(jscadGeom: any, uvs?: GeometryUVs): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const polygons = jscadGeom.polygons || [];

    const positions: number[] = [];
    const indices: number[] = [];
    let offset = 0;

    for (const poly of polygons) {
        const verts = poly.vertices;
        if (!verts || verts.length < 3) continue;

        for (let i = 1; i < verts.length - 1; i++) {
            const v0 = verts[0], v1 = verts[i], v2 = verts[i + 1];
            if (!v0 || !v1 || !v2) continue;

            positions.push(v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2]);
            indices.push(offset, offset + 1, offset + 2);
            offset += 3;
        }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs && uvs.length > 0) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    geo.setIndex(indices);
    geo.applyMatrix4(ARCH_TO_THREE);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Converts a JSCAD geom2 to a Three.js BufferGeometry (flat on XY, then coord transform).
 */
function geom2ToBuffer(jscadGeom: any, uvs?: GeometryUVs): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const sides = jscadGeom.sides || [];

    const positions: number[] = [];
    const indices: number[] = [];
    let offset = 0;

    for (const outline of sides) {
        if (!outline || outline.length < 3) continue;
        for (let i = 1; i < outline.length - 1; i++) {
            const v0 = outline[0], v1 = outline[i], v2 = outline[i + 1];
            if (!v0 || !v1 || !v2) continue;

            positions.push(v0[0], v0[1], 0, v1[0], v1[1], 0, v2[0], v2[1], 0);
            indices.push(offset, offset + 1, offset + 2);
            offset += 3;
        }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (uvs && uvs.length > 0) {
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    }
    geo.setIndex(indices);
    geo.applyMatrix4(ARCH_TO_THREE);
    geo.computeVertexNormals();
    return geo;
}

/**
 * Converts a JSCAD geometry (geom2 or geom3) to a Three.js BufferGeometry.
 * Applies architectural (Z-up) → Three.js (Y-up) coordinate transform.
 * If `uvs` is provided (from pm-engine), applies them as the 'uv' attribute.
 */
export function jscadToBufferGeometry(jscadGeom: any, uvs?: GeometryUVs): THREE.BufferGeometry | null {
    if (!jscadGeom) return null;
    if (jscadGeom.polygons && Array.isArray(jscadGeom.polygons)) {
        return geom3ToBuffer(jscadGeom, uvs);
    }
    return geom2ToBuffer(jscadGeom, uvs);
}

/**
 * Build a THREE.Group from GeometryData[] with a given material.
 * Each geometry becomes a Mesh child of the group.
 */
export function buildMeshGroup(
    data: GeometryData[],
    material: THREE.Material = new THREE.MeshStandardMaterial({ color: 0x6c8ebf, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
): THREE.Group {
    const group = new THREE.Group();
    for (const item of data) {
        const bufGeo = jscadToBufferGeometry(item.geometry, item.uvs);
        if (!bufGeo) continue;
        group.add(new THREE.Mesh(bufGeo, material));
    }
    return group;
}
