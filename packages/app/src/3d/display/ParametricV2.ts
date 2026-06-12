import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DisplayObject3D } from './DisplayObject3D';
import { ParametricModelV2 } from '@designer/core/model/ParametricModelV2';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { PARAMETRIC_MODEL_V2 } from '@designer/core/types';
import { jscadToThreeGeometry } from '../util/jscadToThree';
import { toThreeJS } from '../util/archToThreeJS';
import { createThreeMaterial } from '@designer/pm-engine';

/**
 * 3D display object for a ParametricModelV2.
 *
 * Unlike Parametric (V1) which applies a single transform to the whole group,
 * V2 places each geometry item with its own independent position / rotation / scale.
 *
 * Listens to:
 *  - 'change'         → full geometry rebuild
 *  - 'dirtyTransform' → update mesh transforms only (no geometry rebuild)
 */
export class ParametricV2 extends DisplayObject3D<ParametricModelV2> {
    private meshes: THREE.Mesh[] = [];
    private defaultMaterial: THREE.Material;
    private threeMaterials: THREE.Material[] = [];
    private glbGroups: THREE.Group[] = [];
    private gltfLoader = new GLTFLoader();

    constructor(model: ParametricModelV2) {
        super(model, new THREE.Group());

        this.defaultMaterial = new THREE.MeshStandardMaterial({
            color: 0x888888,
            roughness: 0.7,
            metalness: 0.1,
        });

        // Initial build
        this.updateGeometry();

        // Listen for model events
        this.model.addEventListener('change', this.onModelChange.bind(this));
        this.model.addEventListener('dirtyTransform', this.onModelDirtyTransform.bind(this));
    }

    /** Gets the underlying THREE.Group */
    get group(): THREE.Group {
        return this.node as THREE.Group;
    }

    /** Gets the mesh array */
    getMeshes(): THREE.Mesh[] {
        return this.meshes;
    }

    // ─── Event handlers ────────────────────────────────────────────────────────

    private onModelChange(_event: any): void {
        this.updateGeometry();
    }

    private onModelDirtyTransform(_event: any): void {
        this.updateTransforms();
    }

    // ─── Geometry rebuild ──────────────────────────────────────────────────────

    /**
     * Dispose old meshes and rebuild from the latest GraphData.
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
        // Remove old GLB groups
        for (const g of this.glbGroups) {
            group.remove(g);
        }
        this.meshes = [];
        this.threeMaterials = [];
        this.glbGroups = [];

        // Build JSCAD parametric geometry (if any)
        const graphData = this.model.getGraphData();
        if (graphData && graphData.items.length > 0) {
            for (const item of graphData.items) {
                const geometry = jscadToThreeGeometry(item.geometry);
                if (!geometry) continue;
                geometry.computeBoundingSphere();

                const mat = item.material ? createThreeMaterial(item.material) : this.defaultMaterial;
                if (item.material) {
                    this.threeMaterials.push(mat);
                }

                const mesh = new THREE.Mesh(geometry, mat);
                group.add(mesh);
                this.meshes.push(mesh);
            }
        }

        // Always apply transforms (global on group + per-item on meshes)
        this.updateTransforms();

        // Load GLB models (if any)
        this.loadGlbModels();
    }

    // ─── GLB model loading ─────────────────────────────────────────────────────

    /**
     * Load GLB models referenced in the JSON `models` array.
     * Each model gets its own position / rotation / scale converted from
     * architectural (Z-up) to Three.js (Y-up) coordinates.
     */
    private loadGlbModels(): void {
        const models = this.model.json?.models;
        if (!models || models.length === 0) return;

        const group = this.node as THREE.Group;

        for (const modelDef of models) {
            // Resolve asset path: strip '@designer/assets/' prefix → use '/assets/' URL
            const glbPath = modelDef.glb.replace(/^@designer\/assets\//, '/assets/');

            this.gltfLoader.load(
                glbPath,
                (gltf: any) => {
                    const glbScene = gltf.scene as THREE.Group;

                    // Disable shadows per project spec
                    glbScene.traverse((child: any) => {
                        if (child instanceof THREE.Mesh) {
                            child.castShadow = false;
                            child.receiveShadow = false;
                        }
                    });

                    group.add(glbScene);
                    this.glbGroups.push(glbScene);

                    // Apply current transforms (global on group + local on GLB)
                    this.updateTransforms();
                },
                undefined,
                (error: any) => {
                    console.error(`ParametricV2: failed to load GLB '${glbPath}':`, error);
                },
            );
        }
    }

    // ─── Per-item transform update ─────────────────────────────────────────────

    /**
     * Apply the global RTS from the model directly to the group node,
     * and per-item local RTS to each mesh / GLB group.
     * All coordinates are converted from architectural (Z-up) to Three.js (Y-up).
     */
    private updateTransforms(): void {
        const group = this.node as THREE.Group;
    
        // ── Global RTS → group node (read directly from model) ───────────────
        const modelPos = this.model.position;
        group.position.copy(toThreeJS(new THREE.Vector3(modelPos.x, modelPos.y, modelPos.z)));
    
        const modelRot = this.model.rotation;
        group.rotation.copy(toThreeJS(new THREE.Euler(modelRot.x, modelRot.y, modelRot.z)));
    
        const modelScl = this.model.scale;
        group.scale.set(modelScl.x, modelScl.z, modelScl.y); // swap Y↔Z for coordinate conversion
    
        // ── Per-item local RTS → JSCAD geometry meshes ───────────────────────
        const graphData = this.model.getGraphData();
        if (graphData) {
            const items = graphData.items;
            for (let i = 0; i < this.meshes.length && i < items.length; i++) {
                const mesh = this.meshes[i];
                const item = items[i];

                // Convert architectural position → Three.js position
                const pos = toThreeJS(
                    new THREE.Vector3(item.position.x, item.position.y, item.position.z),
                );
                mesh.position.copy(pos);

                // Convert architectural Euler rotation → Three.js Euler rotation
                const rot = toThreeJS(
                    new THREE.Euler(item.rotation.x, item.rotation.y, item.rotation.z),
                );
                mesh.rotation.copy(rot);

                // Scale is axis-independent, swap Y↔Z for coordinate system change
                mesh.scale.set(item.scale.x, item.scale.z, item.scale.y);
            }
        }

        // ── Per-item local RTS → GLB model groups ────────────────────────────
        // Use resolved transforms from graphData (constraint-evaluated),
        // fall back to raw JSON definitions if graphData not yet available.
        const resolvedModels = graphData?.models;
        const models = this.model.json?.models;

        if (this.glbGroups.length > 0) {
            for (let i = 0; i < this.glbGroups.length; i++) {
                const glbScene = this.glbGroups[i];
                const resolved = resolvedModels?.[i];
                const modelDef = models?.[i];

                if (resolved) {
                    // Use constraint-resolved transforms
                    glbScene.position.copy(
                        toThreeJS(new THREE.Vector3(resolved.position.x, resolved.position.y, resolved.position.z)),
                    );
                    glbScene.rotation.copy(
                        toThreeJS(new THREE.Euler(resolved.rotation.x, resolved.rotation.y, resolved.rotation.z)),
                    );
                    glbScene.scale.set(resolved.scale.x, resolved.scale.z, resolved.scale.y);
                } else if (modelDef) {
                    // Fall back to raw JSON
                    if (modelDef.position) {
                        glbScene.position.copy(
                            toThreeJS(new THREE.Vector3(modelDef.position.x, modelDef.position.y, modelDef.position.z)),
                        );
                    } else {
                        glbScene.position.set(0, 0, 0);
                    }
                    if (modelDef.rotation) {
                        glbScene.rotation.copy(
                            toThreeJS(new THREE.Euler(modelDef.rotation.x, modelDef.rotation.y, modelDef.rotation.z)),
                        );
                    } else {
                        glbScene.rotation.set(0, 0, 0);
                    }
                    if (modelDef.scale) {
                        glbScene.scale.set(modelDef.scale.x, modelDef.scale.z, modelDef.scale.y);
                    } else {
                        glbScene.scale.set(1, 1, 1);
                    }
                } else {
                    glbScene.position.set(0, 0, 0);
                    glbScene.rotation.set(0, 0, 0);
                    glbScene.scale.set(1, 1, 1);
                }
            }
        }
    }

    // ─── Dispose ───────────────────────────────────────────────────────────────

    dispose(): void {
        for (const mesh of this.meshes) {
            mesh.geometry.dispose();
        }
        for (const mat of this.threeMaterials) {
            mat.dispose();
        }
        for (const g of this.glbGroups) {
            g.traverse((child: any) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach((m: THREE.Material) => m.dispose());
                    } else {
                        (child.material as THREE.Material).dispose();
                    }
                }
            });
        }
        this.defaultMaterial.dispose();
        super.dispose();
    }
}

// Register the 3D display for ParametricModelV2
ModelRegistry.getInstance().registerDisplay3d(PARAMETRIC_MODEL_V2, ParametricV2);
