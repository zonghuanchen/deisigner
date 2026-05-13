import * as THREE from 'three';
import { ParametricModeler } from '../../core/util';
import { geometries, maths } from '@jscad/modeling';
import type { Scene3D } from './index';

/**
 * Convert JSCAD geometry to THREE.BufferGeometry
 * JSCAD uses simpler polygon-based geometry
 */
function convertJscadToThree(geometry: any, color: string = '#4a90d9'): THREE.BufferGeometry | null {
    try {
        // Get polygons from JSCAD geometry
        const polygons = geometry.polygons || [];
        
        if (polygons.length === 0) {
            console.warn('No polygons in JSCAD geometry');
            return null;
        }

        const vertices: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];
        let vertexIndex = 0;

        // Extract vertices and faces from polygons
        for (const polygon of polygons) {
            const polygonVertices = polygon.vertices || [];
            
            if (polygonVertices.length < 3) continue;

            // Calculate face normal using cross product
            const v0 = [polygonVertices[0][0], polygonVertices[0][1], polygonVertices[0][2]] as [number, number, number];
            const v1 = [polygonVertices[1][0], polygonVertices[1][1], polygonVertices[1][2]] as [number, number, number];
            const v2 = [polygonVertices[2][0], polygonVertices[2][1], polygonVertices[2][2]] as [number, number, number];
            
            // Create edge vectors
            const vec1: [number, number, number] = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
            const vec2: [number, number, number] = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
            
            // Cross product
            const cross: [number, number, number] = [
                vec1[1] * vec2[2] - vec1[2] * vec2[1],
                vec1[2] * vec2[0] - vec1[0] * vec2[2],
                vec1[0] * vec2[1] - vec1[1] * vec2[0]
            ];
            
            // Normalize
            const length = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);
            const normal: [number, number, number] = length > 0 
                ? [cross[0] / length, cross[1] / length, cross[2] / length]
                : [0, 0, 1];

            // Add vertices (triangulate if more than 3 vertices)
            for (let i = 1; i < polygonVertices.length - 1; i++) {
                // First vertex of triangle
                vertices.push(polygonVertices[0][0], polygonVertices[0][1], polygonVertices[0][2]);
                normals.push(normal[0], normal[1], normal[2]);
                
                // Second vertex
                vertices.push(polygonVertices[i][0], polygonVertices[i][1], polygonVertices[i][2]);
                normals.push(normal[0], normal[1], normal[2]);
                
                // Third vertex
                vertices.push(polygonVertices[i + 1][0], polygonVertices[i + 1][1], polygonVertices[i + 1][2]);
                normals.push(normal[0], normal[1], normal[2]);
                
                // Add indices
                indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
                vertexIndex += 3;
            }
        }

        const bufferGeometry = new THREE.BufferGeometry();
        bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        bufferGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        bufferGeometry.setIndex(indices);
        
        return bufferGeometry;
    } catch (error) {
        console.error('Error converting JSCAD geometry to Three.js:', error);
        return null;
    }
}

/**
 * Convert JSCAD geometry to THREE.Group
 */
function convertJscadToThreeGroup(
    jscadGeometry: any,
    color: string = '#4a90d9'
): THREE.Group | null {
    try {
        const bufferGeometry = convertJscadToThree(jscadGeometry, color);
        if (!bufferGeometry) {
            console.warn('No geometry converted');
            return null;
        }

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.7,
            metalness: 0.1,
        });

        const group = new THREE.Group();
        group.add(new THREE.Mesh(bufferGeometry, material));
        return group;
    } catch (error) {
        console.error('Error converting JSCAD geometry to Three.js group:', error);
        return null;
    }
}

/**
 * Parametric Demo - showcases @jscad/modeling bottle modeling
 * No WASM compilation - pure JavaScript, no lag!
 */
export class ParametricDemo {
    private static scene3D: Scene3D | null = null;

    static setScene3D(scene3D: Scene3D) {
        this.scene3D = scene3D;
    }

    /**
     * Create and visualize a parametric bottle
     * Uses @jscad/modeling instead of OpenCascade.js
     */
    static async createAndShowBottle() {
        console.log('Creating parametric bottle with JSCAD...');

        const bottleGeometry = await ParametricModeler.makeBottle(0.5, 0.7, 0.3);
        const group = convertJscadToThreeGroup(bottleGeometry, '#8aa6c2');

        if (group && this.scene3D) {
            // Bottle is modeled in z-up; rotate to match three.js y-up display
            group.rotation.x = -Math.PI / 2;
            this.scene3D.getScene().add(group);
            console.log('Bottle added to scene');
            return group;
        }

        console.log('Bottle created (not visualized - no scene set)');
        return bottleGeometry;
    }

    /**
     * Create and visualize a cylinder with holes
     * Showcases CSG subtraction capabilities
     */
    static async createAndShowCylinderWithHoles() {
        console.log('Creating cylinder with holes using JSCAD...');

        // Create cylinder with multiple holes
        const cylinderGeometry = await ParametricModeler.makeCylinderWithHoles(
            2,      // radius
            3,      // height
            [
                // Vertical hole through center
                { radius: 0.5, position: [0, 0, 0], direction: [0, 0, 1] },
                // Horizontal hole along X axis
                { radius: 0.3, position: [0, 0, 1.5], direction: [1, 0, 0] },
                // Horizontal hole along Y axis
                { radius: 0.3, position: [0, 0, 1.5], direction: [0, 1, 0] },
                // Angled hole
                { radius: 0.2, position: [1, 0, 0.5], direction: [1, 1, 0] }
            ],
            32      // segments for smoothness
        );

        const group = convertJscadToThreeGroup(cylinderGeometry, '#ff6b6b');

        if (group && this.scene3D) {
            // Cylinder is modeled in z-up; rotate to match three.js y-up display
            group.rotation.x = -Math.PI / 2;
            this.scene3D.getScene().add(group);
            console.log('Cylinder with holes added to scene');
            return group;
        }

        console.log('Cylinder with holes created (not visualized - no scene set)');
        return cylinderGeometry;
    }
}
