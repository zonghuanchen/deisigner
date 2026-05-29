import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { ParametricModel } from '../../../core/model/ParametricModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { PARAMETRIC_MODEL } from '../../../core/types';
import { jscadToThreeGeometry } from '../util/jscadToThree';
import { toThreeJS } from '../util/archToThreeJS';

/**
 * 3D display object for a ParametricModel.
 * Listens to dirty events to rebuild geometry and transformChange events to update mesh transform.
 */
export class Parametric extends DisplayObject3D<ParametricModel> {
    private mesh: THREE.Mesh;
    private material: THREE.Material;

    constructor(model: ParametricModel) {
        super(model, new THREE.Group());
        
        // Create default material
        this.material = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
            metalness: 0.1
        });
        
        // Create initial mesh
        this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
        (this.node as THREE.Group).add(this.mesh);
        
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
     * Gets the underlying THREE.Mesh
     */
    getMesh(): THREE.Mesh {
        return this.mesh;
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
        const graphData = this.model.getGraphData();
        if (!graphData) {
            this.mesh.visible = false;
            return;
        }
        
        // Convert JSCAD geometry to Three.js geometry
        const geometry = jscadToThreeGeometry(graphData.geometry);
        
        if (!geometry) {
            this.mesh.visible = false;
            return;
        }
        
        // Dispose old geometry
        this.mesh.geometry.dispose();
        
        // Set new geometry
        this.mesh.geometry = geometry;
        this.mesh.geometry.computeBoundingSphere();
        this.mesh.visible = true;
    }

    /**
     * Updates the mesh transform (position, rotation, scale) from the model
     */
    private updateTransform(): void {
        // Convert from architectural coordinates (Z-up) to Three.js coordinates (Y-up)
        const position = toThreeJS(this.model.position.clone());
        const rotation = toThreeJS(this.model.rotation.clone());
        const scale = toThreeJS(this.model.scale.clone());
        
        this.mesh.position.copy(position);
        this.mesh.rotation.copy(rotation);
        this.mesh.scale.copy(scale);
    }

    /**
     * Dispose this parametric display object
     */
    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(PARAMETRIC_MODEL, Parametric);
