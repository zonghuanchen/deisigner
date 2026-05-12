import * as THREE from 'three';
import { ParametricModeler } from '../../core/util';
import type { OpenCascadeInstance } from 'opencascade.js/dist/opencascade.full';
import type { Scene3D } from './index';

/**
 * Tessellate an OpenCascade shape into per-face THREE.BufferGeometry list.
 * Port of opencascade.js-examples/src/common/visualize.js
 */
function visualize(oc: OpenCascadeInstance, shape: any): THREE.BufferGeometry[] {
    const ocAny = oc as any;
    const geometries: THREE.BufferGeometry[] = [];

    const ExpFace = new ocAny.TopExp_Explorer_1();
    for (
        ExpFace.Init(shape, ocAny.TopAbs_ShapeEnum.TopAbs_FACE, ocAny.TopAbs_ShapeEnum.TopAbs_SHAPE);
        ExpFace.More();
        ExpFace.Next()
    ) {
        const myShape = ExpFace.Current();
        const myFace = ocAny.TopoDS.Face_1(myShape);
        let inc: any;
        try {
            // in case some of the faces can not be visualized
            inc = new ocAny.BRepMesh_IncrementalMesh_2(myFace, 0.1, false, 0.5, false);
        } catch (e) {
            console.error('face visualizing failed');
            continue;
        }

        const aLocation = new ocAny.TopLoc_Location_1();
        const myT = ocAny.BRep_Tool.Triangulation(myFace, aLocation, 0 /* Poly_MeshPurpose_NONE */);
        if (myT.IsNull()) {
            continue;
        }

        const pc = new ocAny.Poly_Connect_2(myT);
        const triangulation = myT.get();

        const vertices = new Float32Array(triangulation.NbNodes() * 3);

        // write vertex buffer
        for (let i = 1; i <= triangulation.NbNodes(); i++) {
            const t1 = aLocation.Transformation();
            const p = triangulation.Node(i);
            const p1 = p.Transformed(t1);
            vertices[3 * (i - 1)] = p1.X();
            vertices[3 * (i - 1) + 1] = p1.Y();
            vertices[3 * (i - 1) + 2] = p1.Z();
            p.delete();
            t1.delete();
            p1.delete();
        }

        // write normal buffer
        const myNormal = new ocAny.TColgp_Array1OfDir_2(1, triangulation.NbNodes());
        ocAny.StdPrs_ToolTriangulatedShape.Normal(myFace, pc, myNormal);

        const normals = new Float32Array(myNormal.Length() * 3);
        for (let i = myNormal.Lower(); i <= myNormal.Upper(); i++) {
            const t1 = aLocation.Transformation();
            const d1 = myNormal.Value(i);
            const d = d1.Transformed(t1);

            normals[3 * (i - 1)] = d.X();
            normals[3 * (i - 1) + 1] = d.Y();
            normals[3 * (i - 1) + 2] = d.Z();

            t1.delete();
            d1.delete();
            d.delete();
        }

        myNormal.delete();

        // write triangle buffer
        const orient = myFace.Orientation_1();
        const triangles = myT.get().Triangles();
        const triLength = triangles.Length() * 3;
        const indices: Uint16Array | Uint32Array = triLength > 65535
            ? new Uint32Array(triLength)
            : new Uint16Array(triLength);

        for (let nt = 1; nt <= myT.get().NbTriangles(); nt++) {
            const t = triangles.Value(nt);
            let n1 = t.Value(1);
            let n2 = t.Value(2);
            const n3 = t.Value(3);
            if (orient !== ocAny.TopAbs_Orientation.TopAbs_FORWARD) {
                const tmp = n1;
                n1 = n2;
                n2 = tmp;
            }
            indices[3 * (nt - 1)] = n1 - 1;
            indices[3 * (nt - 1) + 1] = n2 - 1;
            indices[3 * (nt - 1) + 2] = n3 - 1;
            t.delete();
        }
        triangles.delete();

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometries.push(geometry);

        pc.delete();
        aLocation.delete();
        myT.delete();
        inc.delete();
        myFace.delete();
        myShape.delete();
    }
    ExpFace.delete();
    return geometries;
}

/**
 * Convert an OpenCascade shape into a THREE.Group containing one Mesh per face.
 */
function convertOcShapeToThreeGroup(
    oc: OpenCascadeInstance,
    shape: any,
    color: string = '#4a90d9'
): THREE.Group | null {
    try {
        const geometries = visualize(oc, shape);
        if (geometries.length === 0) {
            console.warn('No geometries extracted from shape');
            return null;
        }

        const material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.7,
            metalness: 0.1,
        });

        const group = new THREE.Group();
        geometries.forEach(geometry => {
            group.add(new THREE.Mesh(geometry, material));
        });
        return group;
    } catch (error) {
        console.error('Error converting OC shape to Three.js group:', error);
        return null;
    }
}

/**
 * Parametric Demo - showcases OpenCascade.js bottle modeling
 */
export class ParametricDemo {
    private static scene3D: Scene3D | null = null;

    static setScene3D(scene3D: Scene3D) {
        this.scene3D = scene3D;
    }

    /**
     * Create and visualize a parametric bottle
     * (Reference: opencascade.js-examples/src/demos/bottle - basic)
     */
    static async createAndShowBottle() {
        console.log('Creating parametric bottle...');

        const bottleShape = await ParametricModeler.makeBottle(0.5, 0.7, 0.3);
        const oc = await ParametricModeler.initialize();
        const group = convertOcShapeToThreeGroup(oc, bottleShape, '#8aa6c2');

        if (group && this.scene3D) {
            // Bottle is modeled in z-up; rotate to match three.js y-up display
            group.rotation.x = -Math.PI / 2;
            this.scene3D.getScene().add(group);
            console.log('Bottle added to scene');
            return group;
        }

        console.log('Bottle created (not visualized - no scene set)');
        return bottleShape;
    }
}
