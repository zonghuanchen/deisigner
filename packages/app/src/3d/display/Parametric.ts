import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { ParametricModel } from '@designer/core/model/ParametricModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { PARAMETRIC_MODEL } from '@designer/core/types';
import { jscadToThreeGeometry } from '../util/jscadToThree';
import { toThreeJS } from '../util/archToThreeJS';

/**
 * 3D display object for a ParametricModel.
 * Listens to dirty events to rebuild geometry and transformChange events to update mesh transform.
 */
export class Parametric extends DisplayObject3D<ParametricModel> {
    private meshes: THREE.Mesh[] = [];
    private defaultMaterial: THREE.Material;
    private threeMaterials: THREE.Material[] = [];

    constructor(model: ParametricModel) {
        super(model, new THREE.Group());
        
        // Create default material
        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
            metalness: 0.1
        });
        
        // Initial geometry build
        this.updateGeometry();
        this.updateTransform();
        
        // Listen for dirty events to rebuild geometry
        this.model.addEventListener('dirty', this.onModelDirty.bind(this));
        
        // Listen for transformChange events to update mesh transform
        this.model.addEventListener('transformChange', this.onModelTransformChange.bind(this));
    }

    /**
     * Gets the underlying THREE.Group
     */
    get group(): THREE.Group {
        return this.node as THREE.Group;
    }

    /**
     * Gets the underlying THREE.Mesh array
     */
    getMeshes(): THREE.Mesh[] {
        return this.meshes;
    }

    /**
     * Handles dirty event from model - rebuilds geometry
     */
    private onModelDirty(event: any): void {
        this.updateGeometry();
    }

    /**
     * Handles transformChange event from model - updates mesh position, rotation, scale
     */
    private onModelTransformChange(event: any): void {
        this.updateTransform();
    }

    /**
     * Updates the mesh geometry from the model's parametric data
     */
    private updateGeometry(): void {
        const group = this.node as THREE.Group;

        // Dispose old meshes and materials
        for (const mesh of this.meshes) {
            mesh.geometry.dispose();
            group.remove(mesh);
        }
        for (const mat of this.threeMaterials) {
            mat.dispose();
        }
        this.meshes = [];
        this.threeMaterials = [];

        const graphData = this.model.getGraphData();
        if (!graphData || graphData.geometries.length === 0) {
            return;
        }

        const materials = graphData.materials;
        for (let i = 0; i < graphData.geometries.length; i++) {
            const geom = graphData.geometries[i];
            const geometry = jscadToThreeGeometry(geom);
            if (!geometry) continue;
            geometry.computeBoundingSphere();

            // Use per-geometry material if available, otherwise fallback to default
            const mat = materials[i]?.toThreeMaterial() ?? this.defaultMaterial;
            if (materials[i]) {
                this.threeMaterials.push(mat);
            }

            const mesh = new THREE.Mesh(geometry, mat);
            group.add(mesh);
            this.meshes.push(mesh);
        }

        this.updateTransform();
    }

    /**
     * Updates the mesh transform (position, rotation, scale) from the model
     */
    private updateTransform(): void {
        // Convert from architectural coordinates (Z-up) to Three.js coordinates (Y-up)
        const position = toThreeJS(this.model.position.clone());
        const rotation = toThreeJS(this.model.rotation.clone());
        const scale = toThreeJS(this.model.scale.clone());
        
        // Apply the same transform to all meshes
        for (const mesh of this.meshes) {
            mesh.position.copy(position);
            mesh.rotation.copy(rotation);
            mesh.scale.copy(scale);
        }
    }

    /**
     * Dispose this parametric display object
     */
    dispose(): void {
        for (const mesh of this.meshes) {
            mesh.geometry.dispose();
        }
        for (const mat of this.threeMaterials) {
            mat.dispose();
        }
        this.defaultMaterial.dispose();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(PARAMETRIC_MODEL, Parametric);
