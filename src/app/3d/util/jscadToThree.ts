import * as THREE from 'three';

/**
 * Calculate normal vector for a polygon using cross product
 * @param polygon The JSCAD polygon
 * @returns Normal vector as [x, y, z] array
 */
function calculateNormal(polygon: any): [number, number, number] {
    // If polygon already has plane equation, use it directly
    if (polygon.plane) {
        const normal = polygon.plane.normal;
        return [normal[0], normal[1], normal[2]];
    }

    // Otherwise calculate via cross product
    const vertices = polygon.vertices;
    if (vertices.length < 3) {
        return [0, 0, 1]; // Default normal pointing up
    }

    const v0 = vertices[0];
    const v1 = vertices[1];
    const v2 = vertices[2];

    // Vector BA = v1 - v0
    const bax = v1[0] - v0[0];
    const bay = v1[1] - v0[1];
    const baz = v1[2] - v0[2];

    // Vector CA = v2 - v0
    const cax = v2[0] - v0[0];
    const cay = v2[1] - v0[1];
    const caz = v2[2] - v0[2];

    // Cross product: normal = BA × CA
    const nx = bay * caz - baz * cay;
    const ny = baz * cax - bax * caz;
    const nz = bax * cay - bay * cax;

    // Normalize
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length === 0) {
        return [0, 0, 1]; // Default normal if cross product is zero
    }

    return [nx / length, ny / length, nz / length];
}

/**
 * Converts a JSCAD geom3 geometry to a Three.js BufferGeometry
 * @param jscadGeometry The JSCAD geom3 geometry
 * @returns Three.js BufferGeometry
 */
export function jscadGeom3ToThreeGeometry(jscadGeometry: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    // Get polygons from geom3
    const polygons = jscadGeometry.polygons || [];
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let indexOffset = 0;
    
    for (const polygon of polygons) {
        const polyVertices = polygon.vertices;
        
        // Skip if polygon has no vertices
        if (!polyVertices || polyVertices.length < 3) {
            console.warn('Skipping invalid polygon with insufficient vertices:', polygon);
            continue;
        }
        
        // Calculate or extract normal
        const normal = calculateNormal(polygon);
        
        // For each polygon, create triangles (fan triangulation)
        for (let i = 1; i < polyVertices.length - 1; i++) {
            const v0 = polyVertices[0];
            const v1 = polyVertices[i];
            const v2 = polyVertices[i + 1];
            
            // Skip if any vertex is undefined
            if (!v0 || !v1 || !v2) {
                console.warn('Skipping triangle with undefined vertices');
                continue;
            }
            
            // Add vertices (JSCAD uses [x, y, z] arrays)
            vertices.push(v0[0], v0[1], v0[2]);
            vertices.push(v1[0], v1[1], v1[2]);
            vertices.push(v2[0], v2[1], v2[2]);
            
            // Add normals
            normals.push(normal[0], normal[1], normal[2]);
            normals.push(normal[0], normal[1], normal[2]);
            normals.push(normal[0], normal[1], normal[2]);
            
            // Add indices
            indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
            indexOffset += 3;
        }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

/**
 * Converts a JSCAD geom2 geometry to a Three.js BufferGeometry (as a flat shape on XY plane)
 * @param jscadGeometry The JSCAD geom2 geometry
 * @returns Three.js BufferGeometry
 */
export function jscadGeom2ToThreeGeometry(jscadGeometry: any): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    
    // Get outlines from geom2
    const outlines = jscadGeometry.sides || [];
    
    const vertices: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    let indexOffset = 0;
    
    for (const outline of outlines) {
        // Skip if outline has insufficient vertices
        if (!outline || outline.length < 3) {
            console.warn('Skipping invalid outline:', outline);
            continue;
        }
        
        // Create a fan triangulation from the first vertex
        for (let i = 1; i < outline.length - 1; i++) {
            const v0 = outline[0];
            const v1 = outline[i];
            const v2 = outline[i + 1];
            
            // Skip if any vertex is undefined
            if (!v0 || !v1 || !v2) {
                console.warn('Skipping triangle with undefined vertices');
                continue;
            }
            
            // Add vertices (geom2 uses [x, y] arrays, we add z=0)
            vertices.push(v0[0], v0[1], 0);
            vertices.push(v1[0], v1[1], 0);
            vertices.push(v2[0], v2[1], 0);
            
            // Add normals (pointing up in Z)
            normals.push(0, 0, 1);
            normals.push(0, 0, 1);
            normals.push(0, 0, 1);
            
            // Add indices
            indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
            indexOffset += 3;
        }
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

/**
 * Converts JSCAD geometry to Three.js BufferGeometry
 * Automatically detects whether it's geom2 or geom3
 * @param jscadGeometry The JSCAD geometry (geom2 or geom3)
 * @returns Three.js BufferGeometry or null if geometry is invalid
 */
export function jscadToThreeGeometry(jscadGeometry: any): THREE.BufferGeometry | null {
    if (!jscadGeometry) {
        return null;
    }
    
    // Check if it's a geom3 by checking for polygons property
    if (jscadGeometry.polygons && Array.isArray(jscadGeometry.polygons)) {
        try {
            return jscadGeom3ToThreeGeometry(jscadGeometry);
        } catch (e) {
            console.warn('Failed to convert as geom3, trying geom2:', e);
            try {
                return jscadGeom2ToThreeGeometry(jscadGeometry);
            } catch (e2) {
                console.error('Failed to convert JSCAD geometry to Three.js:', e2);
                return null;
            }
        }
    }
    
    // Assume it's geom2
    return jscadGeom2ToThreeGeometry(jscadGeometry);
}

/**
 * Converts JSCAD geometry to Three.js Mesh
 * @param jscadGeometry The JSCAD geometry (geom2 or geom3)
 * @param material The Three.js material to use
 * @returns Three.js Mesh or null if geometry is invalid
 */
export function jscadToThreeMesh(
    jscadGeometry: any,
    material: THREE.Material = new THREE.MeshStandardMaterial({ color: 0x888888 })
): THREE.Mesh | null {
    const geometry = jscadToThreeGeometry(jscadGeometry);
    if (!geometry) {
        return null;
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
}
