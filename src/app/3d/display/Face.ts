import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { FaceModel } from '../../../core/model/FaceModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { FACE_MODEL } from '../../../core/types';
import { toThreeJS } from '../util/archToThreeJS';
/**
 * 3D display object for a FaceModel.
 * Renders a flat mesh from outer and inner contours using ShapeGeometry.
 */
export class Face extends DisplayObject3D<FaceModel> {
    private mesh: THREE.Mesh;
    private material: THREE.MeshStandardMaterial;

    constructor(model: FaceModel) {
        const material = new THREE.MeshStandardMaterial({
            color: 0xdddddd,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        super(model, mesh);
        this.mesh = mesh;
        this.material = material;

        this.model.addEventListener('change', this.onModelChange.bind(this));
    }

    private onModelChange(): void {
        this.updateGeometry();
    }

    private updateGeometry(): void {
        const outer = this.model.outerContour;
        const inners = this.model.innerContours;
        if (!outer || outer.length < 3) {
            this.mesh.visible = false;
            return;
        }

        // Transform from architectural coords (XY ground, Z up) to Three.js coords (XZ ground, Y up)
        const outer3js = outer.map(toThreeJS);
        const inners3js = inners.map(inner => inner.map(toThreeJS));

        // Compute plane normal and local basis from 3D vertices
        const normal = this.computeNormal(outer3js);
        if (!normal) {
            this.mesh.visible = false;
            return;
        }

        const origin = outer3js[0];
        const u = new THREE.Vector3().subVectors(outer3js[1], origin).normalize();
        const v = new THREE.Vector3().crossVectors(normal, u).normalize();

        // Project 3D points onto the local 2D basis
        const project2D = (p: THREE.Vector3): THREE.Vector2 => {
            const d = new THREE.Vector3().subVectors(p, origin);
            return new THREE.Vector2(d.dot(u), d.dot(v));
        };

        // Build THREE.Shape from projected outer contour
        const shape = new THREE.Shape(outer3js.map(project2D));

        // Add inner contours as holes
        for (const inner of inners3js) {
            if (inner.length >= 3) {
                shape.holes.push(new THREE.Path(inner.map(project2D)));
            }
        }

        // Create ShapeGeometry in the XY plane
        const geometry = new THREE.ShapeGeometry(shape);
        geometry.computeVertexNormals();

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
