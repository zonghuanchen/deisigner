import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import { DisplayObject3D } from './DisplayObject3D';
import { FaceModel } from '../../../core/model/FaceModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { FACE_MODEL } from '../../../core/types';
import { toThreeJS } from '../util/archToThreeJS';

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
        const uvData = this.model.computeUVData();
        if (!uvData) {
            this.mesh.visible = false;
            return;
        }

        // Convert plane basis from architectural coords to Three.js coords
        const origin = toThreeJS(uvData.origin);
        const u = toThreeJS(uvData.uAxis);
        const v = toThreeJS(uvData.vAxis);
        const normal = toThreeJS(uvData.normal);

        // Build THREE.Shape from projected contours (2D coords are basis-relative, coord-system independent)
        const shape = new THREE.Shape(uvData.outerProjected);
        const inners3js = this.model.innerContours.map(inner =>
            inner.map((p: THREE.Vector3) => toThreeJS(p))
        );

        let geometry: THREE.BufferGeometry;

        if (uvData.innerProjected.length === 0) {
            // Fast path: no holes, use simple ShapeGeometry
            geometry = new THREE.ShapeGeometry(shape);
            geometry.computeVertexNormals();
        } else {
            // CSG path: use three-bvh-csg to subtract holes from a thin plate
            const depth = 0.001;
            const extrudeSettings: THREE.ExtrudeGeometryOptions = {
                depth,
                bevelEnabled: false,
            };

            const outerGeometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
            outerGeometry.translate(0, 0, -depth / 2);

            let resultBrush = new Brush(outerGeometry, this.material);

            for (let i = 0; i < inners3js.length; i++) {
                const inner = inners3js[i];
                if (inner.length >= 3 && uvData.innerProjected[i]) {
                    const holeShape = new THREE.Shape(uvData.innerProjected[i]);
                    const holeGeometry = new THREE.ExtrudeGeometry(holeShape, extrudeSettings);
                    holeGeometry.translate(0, 0, -depth / 2);
                    const holeBrush = new Brush(holeGeometry, this.material);
                    resultBrush = Face.evaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
                }
            }

            geometry = resultBrush.geometry;
            geometry.computeVertexNormals();
        }

        // Align mesh with the target plane
        const basisMatrix = new THREE.Matrix4();
        basisMatrix.makeBasis(u, v, normal);
        this.mesh.position.copy(origin);
        this.mesh.quaternion.setFromRotationMatrix(basisMatrix);

        // Assign UV coordinates using the model's plane basis
        const threeJSUVData = { origin, uAxis: u, vAxis: v, normal, outerProjected: uvData.outerProjected, innerProjected: uvData.innerProjected };
        this.model.assignUVsToGeometry(geometry, threeJSUVData, this.mesh.quaternion, this.mesh.position);

        this.mesh.geometry.dispose();
        this.mesh.geometry = geometry;
        this.mesh.geometry.computeBoundingSphere();
        this.mesh.visible = true;
    }

    /**
     * Dispose this face display object
     */
    dispose(): void {
        this.mesh.geometry.dispose();
        this.material.dispose();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(FACE_MODEL, Face);
