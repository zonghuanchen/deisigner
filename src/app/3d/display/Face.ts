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
        const inners = this.model.innerContours;
        if (!outer || outer.length < 3) {
            this.mesh.visible = false;
            return;
        }

        // Transform from architectural coords (XY ground, Z up) to Three.js coords (XZ ground, Y up)
        const outer3js = outer.map((p: THREE.Vector3) => toThreeJS(p));
        const inners3js = inners.map(inner => inner.map((p: THREE.Vector3) => toThreeJS(p)));

        // Compute plane normal and local basis from 3D vertices
        const normal = this.computeNormal(outer3js);
        if (!normal) {
            this.mesh.visible = false;
            return;
        }

        const origin = outer3js[0];
        const u = new THREE.Vector3().subVectors(outer3js[1], origin).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u).normalize();

        // Project 3D points onto the local 2D basis (this becomes UV coordinates)
        const project2D = (p: THREE.Vector3): THREE.Vector2 => {
            const d = new THREE.Vector3().subVectors(p, origin);
            return new THREE.Vector2(d.dot(u), d.dot(v));
        };

        // Build THREE.Shape from projected outer contour
        const shape = new THREE.Shape(outer3js.map(project2D));

        let geometry: THREE.BufferGeometry;

        if (inners3js.length === 0) {
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

            for (const inner of inners3js) {
                if (inner.length >= 3) {
                    const holeShape = new THREE.Shape(inner.map(project2D));
                    const holeGeometry = new THREE.ExtrudeGeometry(holeShape, extrudeSettings);
                    holeGeometry.translate(0, 0, -depth / 2);
                    const holeBrush = new Brush(holeGeometry, this.material);
                    resultBrush = Face.evaluator.evaluate(resultBrush, holeBrush, SUBTRACTION);
                }
            }

            geometry = resultBrush.geometry;
            geometry.computeVertexNormals();
        }

        // Set UV coordinates based on world-space projected positions
        // This ensures textures align properly regardless of mesh origin
        this.assignUVs(geometry, outer3js, u, v, origin);

        // Align mesh with the target plane
        const basisMatrix = new THREE.Matrix4();
        basisMatrix.makeBasis(u, v, normal);
        this.mesh.position.copy(origin);
        this.mesh.quaternion.setFromRotationMatrix(basisMatrix);

        this.mesh.geometry.dispose();
        this.mesh.geometry = geometry;
        this.mesh.geometry.computeBoundingSphere();
        this.mesh.visible = true;
    }

    private assignUVs(
        geometry: THREE.BufferGeometry,
        vertices: THREE.Vector3[],
        u: THREE.Vector3,
        v: THREE.Vector3,
        origin: THREE.Vector3
    ): void {
        const position = geometry.attributes.position;
        const uvArray: number[] = [];

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);

            // Vertex is already in local space (mesh has been rotated by quaternion)
            // We need to transform it back to world space to calculate UVs correctly
            const localVertex = new THREE.Vector3(x, y, z);
            const worldVertex = localVertex.applyQuaternion(this.mesh.quaternion).add(this.mesh.position);

            // Project world vertex onto u-v basis to get UV coordinates
            const d = new THREE.Vector3().subVectors(worldVertex, origin);
            const uvU = d.dot(u);
            const uvV = d.dot(v);

            uvArray.push(uvU, uvV);
        }
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
    }

    private computeNormal(points: THREE.Vector3[]): THREE.Vector3 | null {
        for (let i = 2; i < points.length; i++) {
            const a = new THREE.Vector3().subVectors(points[1], points[0]);
            const b = new THREE.Vector3().subVectors(points[i], points[0]);
            const n = new THREE.Vector3().crossVectors(a, b);
            if (n.lengthSq() > 1e-10) {
                return n.normalize();
            }
        }
        return null;
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
