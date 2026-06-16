import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { DisplayObject3D } from './DisplayObject3D';
import { FaceModel, FaceGraphItem } from '@designer/core/model/FaceModel';
import { ModelRegistry } from '@designer/core/ModelRegistry';
import { FACE_MODEL } from '@designer/core/types';
import { archToThreeJS } from '../util/archToThreeJS';

// Suppress the maxLeafTris deprecation warning from three-mesh-bvh
// This is an internal library warning that doesn't affect functionality
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
    if (args[0]?.includes?.('maxLeafTris')) return;
    originalWarn.apply(console, args);
};
/**
 * 3D display object for a FaceModel.
 * Renders a flat mesh from outer and inner contours using CSG subtraction
 * via three-bvh-csg when holes are present; falls back to ShapeGeometry
 * for a solid face without holes.
 */
export class Face extends DisplayObject3D<FaceModel> {
    private mesh: THREE.Mesh;
    private material: THREE.MeshStandardMaterial;
    private static evaluator = new Evaluator();

    constructor(model: FaceModel) {
        const material = new THREE.MeshStandardMaterial();
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        super(model, mesh);
        this.mesh = mesh;
        this.material = material;

        // Listen to model changes
        this.model.addEventListener('change', this.onModelChange.bind(this));
        Promise.resolve().then(() => {
            // Listen to material changes
            this.model.material.addEventListener('change', this.onMaterialChange.bind(this));
        });
    }

    private onModelChange(): void {
        this.updateGeometry();
        this.updateMaterial();
    }

    private onMaterialChange(): void {
        this.updateMaterial();
        // Rebuild geometry when regions change (adding/removing/modifying regions)
        this.updateGeometry();
    }

    private updateMaterial(): void {
        // Update the THREE material from the model's material
        const newMaterial = this.model.material.toThreeMaterial();
        newMaterial.side = THREE.DoubleSide;
        
        // Ensure texture colors are displayed correctly without color filtering
        // Set color to white so the texture shows its original colors
        if (newMaterial.map) {
            newMaterial.color.set(0xffffff);
            // Enable proper color space for texture display
            newMaterial.map.colorSpace = THREE.SRGBColorSpace;
        }
        
        // Dispose old material
        this.material.dispose();
        
        // Apply new material
        this.material = newMaterial;
        this.mesh.material = newMaterial;
    }

    private updateGeometry(): void {
        const outer = this.model.outerContour;
        if (!outer || outer.length < 3) {
            this.mesh.visible = false;
            return;
        }

        // Compute UV plane basis and projected contours in architectural coords
        const archUVData = this.model.computeUVData();
        if (!archUVData) {
            this.mesh.visible = false;
            return;
        }

        // Convert all model data from architectural (Z-up) to Three.js (Y-up) upfront
        const origin = archUVData.origin.clone();
        origin.applyMatrix4(archToThreeJS);
        const u = archUVData.uAxis.clone();
        u.applyMatrix4(archToThreeJS);
        const v = archUVData.vAxis.clone();
        v.applyMatrix4(archToThreeJS);
        const normal = archUVData.normal.clone();
        normal.applyMatrix4(archToThreeJS);

        // Align mesh with the target plane
        const basisMatrix = new THREE.Matrix4();
        basisMatrix.makeBasis(u, v, normal);
        this.mesh.position.copy(origin);
        this.mesh.quaternion.setFromRotationMatrix(basisMatrix);

        // Dispose existing child meshes/lines from previous region builds
        this.disposeChildren();

        // Use getGraphData() to check for paving regions
        const graphData = this.model.getGraphData();
        for (const item of graphData.items) {
            item.path = item.path.map(p => {
                const v3 = p.clone();
                v3.applyMatrix4(archToThreeJS);
                return v3;
            });
        }
        const hasRegions = graphData.items.some(i => i.type !== 'face');

        if (!hasRegions) {
            // ── No regions: build single face geometry (original path) ──────
            const shape = new THREE.Shape(archUVData.outerProjected);
            let geometry: THREE.BufferGeometry;

            if (archUVData.innerProjected.length === 0) {
                geometry = new THREE.ShapeGeometry(shape);
                geometry.computeVertexNormals();
            } else {
                const depth = 0.001;
                const extrudeSettings: THREE.ExtrudeGeometryOptions = {
                    depth,
                    bevelEnabled: false,
                };
                const outerGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
                outerGeometry.translate(0, 0, -depth / 2);

                let resultBrush = new Brush(outerGeometry, this.material);

                for (let i = 0; i < this.model.innerContours.length; i++) {
                    if (this.model.innerContours[i].length >= 3 && archUVData.innerProjected[i]) {
                        const holeShape = new THREE.Shape(archUVData.innerProjected[i]);
                        const holeGeometry = new THREE.ExtrudeGeometry(holeShape, extrudeSettings);
                        holeGeometry.translate(0, 0, -depth / 2);
                        const holeBrush = new Brush(holeGeometry, this.material);
                        resultBrush = Face.evaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
                    }
                }

                geometry = resultBrush.geometry;
                geometry.computeVertexNormals();
            }

            // Assign UV coordinates using the model's plane basis
            const threeJSUVData = { origin, uAxis: u, vAxis: v, normal, outerProjected: archUVData.outerProjected, innerProjected: archUVData.innerProjected };
            this.model.assignUVsToGeometry(geometry, threeJSUVData, this.mesh.quaternion, this.mesh.position);

            this.mesh.geometry.dispose();
            this.mesh.geometry = geometry;
            this.mesh.geometry.computeBoundingSphere();
            this.mesh.visible = true;
        } else {
            // ── Regional paving: build tile and gap child meshes ────────────
            this.mesh.geometry.dispose();
            this.mesh.geometry = new THREE.BufferGeometry();

            for (const item of graphData.items) {
                if (item.type === 'tile') {
                    const child = this.buildTileMesh(item, origin, u, v, normal);
                    this.mesh.add(child);
                } else if (item.type === 'gap') {
                    const child = this.buildGapMesh(item, origin, u, v, normal);
                    this.mesh.add(child);
                }
            }

            this.mesh.visible = true;
        }
    }

    /**
     * Build a tile mesh from a FaceGraphItem.
     * Projects 3D path points onto the face u-v basis to create a 2D Shape,
     * then positions the mesh on the face plane.
     */
    private buildTileMesh(
        item: FaceGraphItem,
        origin: THREE.Vector3,
        u: THREE.Vector3,
        v: THREE.Vector3,
        _normal: THREE.Vector3,
    ): THREE.Mesh {
        const projected = this.projectPath(item.path, origin, u, v);
        if (projected.length < 3) {
            return new THREE.Mesh();
        }

        const shape = new THREE.Shape(projected);
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.computeVertexNormals();

        const mat = item.material.toThreeMaterial();
        mat.side = THREE.DoubleSide;
        if (mat.map) {
            mat.color.set(0xffffff);
            mat.map.colorSpace = THREE.SRGBColorSpace;
        }

        const mesh = new THREE.Mesh(geometry, mat);
        // Child is in parent-local space. Parent mesh already has position=origin and
        // quaternion=basisMatrix(u,v,normal), so child geometry (in face-plane 2D coords)
        // needs no extra rotation — identity quaternion lets the parent handle orientation.

        // Assign UVs: prefer per-tile UVs computed by the pattern (0..1 per brick);
        // fall back to face-wide UV projection when no tile UVs are available.
        if (item.uvs && item.uvs.length === geometry.attributes.position.count) {
            const uvArray: number[] = [];
            for (const uv of item.uvs) {
                uvArray.push(uv.x, uv.y);
            }
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
        } else {
            const uvData = { origin, uAxis: u, vAxis: v, normal: _normal,
                outerProjected: projected, innerProjected: [] as THREE.Vector2[][] };
            this.model.assignUVsToGeometry(geometry, uvData, this.mesh.quaternion, this.mesh.position);
        }

        return mesh;
    }

    /**
     * Build a gap mesh (grout line) from a FaceGraphItem.
     * Gaps are rendered as thin filled polygons using the gap material.
     */
    private buildGapMesh(
        item: FaceGraphItem,
        origin: THREE.Vector3,
        u: THREE.Vector3,
        v: THREE.Vector3,
        normal: THREE.Vector3,
    ): THREE.Mesh {
        const projected = this.projectPath(item.path, origin, u, v);
        if (projected.length < 3) {
            return new THREE.Mesh();
        }

        const shape = new THREE.Shape(projected);
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.computeVertexNormals();

        const mat = item.material.toThreeMaterial();
        mat.side = THREE.DoubleSide;

        const mesh = new THREE.Mesh(geometry, mat);
        // Child is in parent-local space. Parent mesh already has position=origin and
        // quaternion=basisMatrix(u,v,normal), so child geometry (in face-plane 2D coords)
        // needs no extra rotation — identity quaternion.

        return mesh;
    }

    /**
     * Project a 3D path (in Three.js coords) onto the face u-v basis
     * to produce 2D coordinates for Shape construction.
     */
    private projectPath(
        path3d: THREE.Vector3[],
        origin: THREE.Vector3,
        u: THREE.Vector3,
        v: THREE.Vector3,
    ): THREE.Vector2[] {
        return path3d.map(p => {
            const d = p.clone().sub(origin);
            return new THREE.Vector2(d.dot(u), d.dot(v));
        });
    }

    /**
     * Dispose all child meshes/lines added for region paving.
     */
    private disposeChildren(): void {
        const toRemove: THREE.Object3D[] = [];
        this.mesh.traverse(child => {
            if (child !== this.mesh) {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (child.material instanceof THREE.Material) {
                        child.material.dispose();
                    }
                }
                toRemove.push(child);
            }
        });
        for (const child of toRemove) {
            child.parent?.remove(child);
        }
    }

    /**
     * Dispose this face display object
     */
    dispose(): void {
        this.disposeChildren();
        this.mesh.geometry.dispose();
        // Dispose all textures on the material
        for (const key of Object.keys(this.material)) {
            const value = (this.material as any)[key];
            if (value && value instanceof THREE.Texture) {
                value.dispose();
            }
        }
        this.material.dispose();
        // Remove mesh from the scene graph so it stops rendering
        this.mesh.parent?.remove(this.mesh);
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(FACE_MODEL, Face);
