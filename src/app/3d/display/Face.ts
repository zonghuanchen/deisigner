import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { FaceModel } from '../../../core/model/FaceModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { FACE_MODEL } from '../../../core/types';

/**
 * 3D display object for a FaceModel.
 * Renders a flat mesh from outer and inner contours using ShapeGeometry.
 */
export class Face extends DisplayObject3D<FaceModel> {
    private mesh: THREE.Mesh;
    private material: THREE.MeshStandardMaterial;

    constructor(model: FaceModel) {
        const material = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        super(model, mesh);
        this.mesh = mesh;
        this.material = material;

        this.updateGeometry();

        this.model.addEventListener('change', this.onModelChange.bind(this));
    }

    private onModelChange(): void {
        this.updateGeometry();
    }

    private updateGeometry(): void {
        const outer = this.model.outerContour;
        if (outer.length < 3) {
            this.mesh.visible = false;
            return;
        }

        // Find the first non-collinear triplet to compute the plane normal
        let normal: THREE.Vector3 | null = null;
        let u: THREE.Vector3 | null = null;

        for (let i = 1; i < outer.length - 1; i++) {
            const e1 = new THREE.Vector3().subVectors(outer[i], outer[0]);
            const e2 = new THREE.Vector3().subVectors(outer[i + 1], outer[0]);
            const n = new THREE.Vector3().crossVectors(e1, e2);
            if (n.lengthSq() > 1e-10) {
                normal = n.normalize();
                u = e1.normalize();
                break;
            }
        }

        if (!normal || !u) {
            this.mesh.visible = false;
            return;
        }

        const v = new THREE.Vector3().crossVectors(normal, u).normalize();
        const origin = outer[0];

        const to2D = (point: THREE.Vector3): [number, number] => {
            const diff = new THREE.Vector3().subVectors(point, origin);
            return [diff.dot(u), diff.dot(v)];
        };

        // Build outer shape
        const shape = new THREE.Shape();
        const outer2D = outer.map(to2D);
        shape.moveTo(outer2D[0][0], outer2D[0][1]);
        for (let i = 1; i < outer2D.length; i++) {
            shape.lineTo(outer2D[i][0], outer2D[i][1]);
        }

        // Add inner holes
        for (const inner of this.model.innerContours) {
            if (inner.length < 3) continue;
            const hole = new THREE.Path();
            const inner2D = inner.map(to2D);
            hole.moveTo(inner2D[0][0], inner2D[0][1]);
            for (let i = 1; i < inner2D.length; i++) {
                hole.lineTo(inner2D[i][0], inner2D[i][1]);
            }
            shape.holes.push(hole);
        }

        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.ShapeGeometry(shape);

        // Orient mesh to the face plane
        const rotationMatrix = new THREE.Matrix4();
        rotationMatrix.makeBasis(u, v, normal);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromRotationMatrix(rotationMatrix);
        this.mesh.quaternion.copy(quaternion);
        this.mesh.position.copy(origin);

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
