import * as THREE from 'three';
import type { GeometryData, GeometryUVs } from '@designer/pm-engine';

/**
 * Rotation matrix: architectural coords (XY ground, Z up) → Three.js coords (XZ ground, Y up).
 * Equivalent to −90° rotation around X axis.
 */
const ARCH_TO_THREE = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

/**
 * Converts a JSCAD geom3 to a Three.js BufferGeometry (with arch→Three coord transform).
 * If `uvs` is provided, applies them as the 'uv' attribute.
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
    // 由 Three.js 根据面片几何自动计算顶点法线，确保光照正确
    geo.computeVertexNormals();
    return geo;
}

/**
 * Converts a JSCAD geom2 to a Three.js BufferGeometry (flat on XY, then coord transform).
 * If `uvs` is provided, applies them as the 'uv' attribute.
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
 * Builds a Three.js Group from GeometryData[] (from ParametricModeler.buildGeometries).
 * Each geometry becomes a Mesh with the provided material and UVs.
 */
export function buildMeshGroup(
    data: GeometryData[],
    material: THREE.Material = new THREE.MeshStandardMaterial({ color: 0x6c8ebf, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
): THREE.Group {
    const group = new THREE.Group();
    for (const item of data) {
        const bufGeo = jscadToBufferGeometry(item.geometry, item.uvs);
        if (!bufGeo) continue;
        const mesh = new THREE.Mesh(bufGeo, material);
        group.add(mesh);
    }
    return group;
}
