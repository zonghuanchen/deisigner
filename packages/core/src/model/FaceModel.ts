import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { FACE_MODEL } from '../types';
import { Material } from '../material/Material';
import type { Path3D, PaveBuildResult } from '../pave/Pattern';

/**
 * Result of face UV plane computation.
 * Contains the plane basis and 2D projections of all contour points,
 * computed in architectural coordinate space (XY ground, Z up).
 */
export interface FaceUVData {
    /** First point of the outer contour, used as the plane origin */
    origin: THREE.Vector3;
    /** Unit vector along the first edge of the outer contour (u-axis) */
    uAxis: THREE.Vector3;
    /** Unit vector perpendicular to uAxis on the face plane (v-axis) */
    vAxis: THREE.Vector3;
    /** Unit normal vector of the face plane */
    normal: THREE.Vector3;
    /** Outer contour points projected onto the u-v plane */
    outerProjected: THREE.Vector2[];
    /** Inner contour points projected onto the u-v plane */
    innerProjected: THREE.Vector2[][];
}

export interface FaceChangeEvent {
    type: 'change';
    face: FaceModel;
}

export type FaceChangeListener = (event: FaceChangeEvent) => void;

export interface FaceEventMap {
    change: FaceChangeEvent;
}

/**
 * A single paving element produced by FaceModel.getGraphData().
 * - `tile`   : a filled tile polygon using the face/region material
 * - `gap`    : a gap polygon using the gap material
 * - `face`   : the entire face polygon (used when no paving regions exist)
 */
export interface FaceGraphItem {
    type: 'tile' | 'gap' | 'face';
    /** Closed 3D polygon path for this element */
    path: THREE.Vector3[];
    /** Material to apply (face material for tiles/face, gap material for gaps) */
    material: Material;
}

/**
 * Result of FaceModel.getGraphData(): a list of graphical elements
 * (tiles, gaps, or a single face) ready for the display layer to consume.
 */
export interface FaceGraphData {
    items: FaceGraphItem[];
}

export class FaceModel extends BaseModel {
    private _outerContour: THREE.Vector3[] =[];
    private _innerContours: THREE.Vector3[][] = [];
    private _material: Material = new Material();
    private _onMaterialChange = () => this.dirty();

    constructor(
        outerContour: THREE.Vector3[] = [],
        innerContours: THREE.Vector3[][] = [],
        material: Material = new Material(),
        id?: string
    ) {
        super(id);
        this._outerContour = outerContour.map(point => point.clone());
        this._innerContours = innerContours.map(contour =>
            contour.map(point => point.clone())
        );
        this.setMaterial(material);
        this.dirty();
    }

    get outerContour(): THREE.Vector3[] {
        return this._outerContour;
    }

    set outerContour(value: THREE.Vector3[]) {
        this._outerContour = value.map(point => point.clone());
        this.dirty();
    }

    get innerContours(): THREE.Vector3[][] {
        return this._innerContours;
    }

    set innerContours(value: THREE.Vector3[][]) {
        this._innerContours = value.map(contour =>
            contour.map(point => point.clone())
        );
        this.dirty();
    }

    /**
      * Adds a point to the outer contour
      * @param point - The point to add
      */
    addContourPoint(point: THREE.Vector3): void {
        this._outerContour.push(point.clone());
        this.dirty();
    }

    /**
      * Removes a point from the outer contour by index
      * @param index - The index of the point to remove
      */
    removeContourPoint(index: number): void {
        if (index >= 0 && index < this._outerContour.length) {
            this._outerContour.splice(index, 1);
            this.dirty();
        }
    }

    /**
      * Updates a point in the outer contour by index
      * @param index - The index of the point to update
      * @param point - The new point value
      */
    updateContourPoint(index: number, point: THREE.Vector3): void {
        if (index >= 0 && index < this._outerContour.length) {
            this._outerContour[index].copy(point);
            this.dirty();
        }
    }

    /**
      * Clears all points from the outer contour
      */
    clearContour(): void {
        this._outerContour = [];
        this.dirty();
    }

    /**
      * Gets the number of points in the outer contour
      */
    get contourPointCount(): number {
        return this._outerContour.length;
    }

    /**
      * Adds an inner contour (hole)
      * @param contour - The inner contour points to add
      */
    addInnerContour(contour: THREE.Vector3[]): void {
        this._innerContours.push(contour.map(point => point.clone()));
        this.dirty();
    }

    /**
      * Removes an inner contour by index
      * @param index - The index of the inner contour to remove
      */
    removeInnerContour(index: number): void {
        if (index >= 0 && index < this._innerContours.length) {
            this._innerContours.splice(index, 1);
            this.dirty();
        }
    }

    /**
      * Gets an inner contour by index
      * @param index - The index of the inner contour
      */
    getInnerContour(index: number): THREE.Vector3[] | undefined {
        if (index >= 0 && index < this._innerContours.length) {
            return this._innerContours[index];
        }
        return undefined;
    }

    /**
      * Updates a point in an inner contour
      * @param contourIndex - The index of the inner contour
      * @param pointIndex - The index of the point in the inner contour
      * @param point - The new point value
      */
    updateInnerContourPoint(contourIndex: number, pointIndex: number, point: THREE.Vector3): void {
        if (
            contourIndex >= 0 &&
            contourIndex < this._innerContours.length &&
            pointIndex >= 0 &&
            pointIndex < this._innerContours[contourIndex].length
        ) {
            this._innerContours[contourIndex][pointIndex].copy(point);
            this.dirty();
        }
    }

    /**
      * Clears all inner contours
      */
    clearInnerContours(): void {
        this._innerContours = [];
        this.dirty();
    }

    /**
      * Gets the number of inner contours
      */
    get innerContourCount(): number {
        return this._innerContours.length;
    }

    /**
      * Gets the material of the face
      */
    get material(): Material {
        return this._material;
    }

    /**
      * Sets the material of the face
      * @param value - The new material
      */
    set material(value: Material) {
        this.setMaterial(value);
        this.dirty();
    }

    /**
     * Internal helper: unsubscribe from old material, subscribe to new material
     * so that any material change (including regions) triggers face dirty.
     */
    private setMaterial(value: Material): void {
        if (this._material) {
            this._material.removeEventListener('change', this._onMaterialChange);
        }
        this._material = value;
        if (this._material) {
            this._material.addEventListener('change', this._onMaterialChange);
        }
    }

    /**
      * Triggers a change event to notify listeners that the face has been modified
      */
    dirty(): void {
        this._isDirty = true;
        this.dispatchEvent({ type: 'change', face: this });
    }

    /**
     * Compute the UV plane basis and projects all contour points onto it.
     *
     * Builds a local 2D coordinate system on the face plane using the outer contour:
     * - origin: first point of outer contour
     * - uAxis: along the first edge
     * - vAxis: perpendicular to uAxis on the plane
     * - normal: face plane normal
     *
     * All contour points are projected onto this u-v basis to produce 2D coordinates
     * suitable for Shape construction and UV mapping.
     *
     * @returns FaceUVData with plane basis and projected contours, or null if degenerate
     */
    computeUVData(): FaceUVData | null {
        const outer = this._outerContour;
        if (outer.length < 3) return null;

        // Compute face normal
        const normal = FaceModel.computeNormal(outer);
        if (!normal) return null;

        // Build local 2D basis on the face plane
        const origin = outer[0].clone();
        const uAxis = new THREE.Vector3().subVectors(outer[1], origin).normalize();
        const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

        // Project 3D points onto the u-v basis
        const project = (p: THREE.Vector3): THREE.Vector2 => {
            const d = new THREE.Vector3().subVectors(p, origin);
            return new THREE.Vector2(d.dot(uAxis), d.dot(vAxis));
        };

        const outerProjected = outer.map(project);
        const innerProjected = this._innerContours.map(inner => inner.map(project));

        return { origin, uAxis, vAxis, normal, outerProjected, innerProjected };
    }

    /**
     * Assigns UV coordinates to a BufferGeometry based on a face plane basis.
     *
     * Each vertex in the geometry is transformed to world space using the provided
     * quaternion and position, then projected onto the u-v plane to produce UVs.
     * This ensures textures align correctly regardless of mesh orientation.
     *
     * @param geometry - The BufferGeometry to assign UVs to
     * @param uvData - The face plane basis from computeUVData()
     * @param quaternion - Mesh rotation in world space
     * @param position - Mesh position in world space
     */
    assignUVsToGeometry(
        geometry: THREE.BufferGeometry,
        uvData: FaceUVData,
        quaternion: THREE.Quaternion,
        position: THREE.Vector3
    ): void {
        const posAttr = geometry.attributes.position;
        if (!posAttr) return;

        const { origin, uAxis, vAxis } = uvData;
        const uvArray: number[] = [];

        for (let i = 0; i < posAttr.count; i++) {
            // Transform local vertex to world space
            const worldVertex = new THREE.Vector3(
                posAttr.getX(i),
                posAttr.getY(i),
                posAttr.getZ(i)
            ).applyQuaternion(quaternion).add(position);

            // Project onto u-v basis
            const d = new THREE.Vector3().subVectors(worldVertex, origin);
            uvArray.push(d.dot(uAxis), d.dot(vAxis));
        }

        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
    }

    /**
     * Computes the unit normal of a polygon from its vertices.
     * Returns null if the polygon is degenerate (collinear or fewer than 3 points).
     */
    static computeNormal(points: THREE.Vector3[]): THREE.Vector3 | null {
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

    getUI(): Record<string, any> {
        return {
            id: this._id,
            outerContour: this._outerContour.map(p => ({ x: p.x, y: p.y, z: p.z })),
            innerContours: this._innerContours.map(c => c.map(p => ({ x: p.x, y: p.y, z: p.z }))),
            material: this._material.getUI(),
        };
    }

    // ─── Paving Graph Data ──────────────────────────────────────────────────

    /**
     * Generate graphical elements for the face based on its material's paving regions.
     *
     * - If material.regions.length > 0: each region is rebuilt and the resulting
     *   tile/gap 3D paths are returned directly (patterns project to 3D internally).
     * - If material.regions.length == 0: the entire face outer contour is returned
     *   as a single `face` item with the face material.
     *
     * The display layer consumes these items to build meshes and lines.
     */
    getGraphData(): FaceGraphData {
        const uvData = this.computeUVData();
        if (!uvData) return { items: [] };

        const { origin, uAxis, vAxis } = uvData;
        const regions = this._material.regions;

        // ── No paving regions: return the full face as one item ──────────
        if (regions.length === 0) {
            return {
                items: [{
                    type: 'face',
                    path: this._outerContour.map(p => p.clone()),
                    material: this._material,
                }],
            };
        }

        // ── Regional paving: set plane and rebuild each region ───────────
        const items: FaceGraphItem[] = [];

        for (const region of regions) {
            // Set plane basis on pattern so it can project 3D↔2D internally
            if (region.pattern) {
                region.pattern.setPlane(origin, uAxis, vAxis);
            }
            const result: PaveBuildResult = region.rebuild();

            // Tile paths → already 3D, use the face material
            for (const tilePath of result.tilePaths) {
                items.push({
                    type: 'tile',
                    path: tilePath,
                    material: this._material,
                });
            }

            // Gap paths → already 3D, use the gap material from the region's pattern (or face material as fallback)
            const gapMat = region.pattern?.gapMaterial ?? this._material;
            for (const gapPath of result.gapPaths) {
                items.push({
                    type: 'gap',
                    path: gapPath,
                    material: gapMat,
                });
            }
        }

        return { items };
    }
}

// Register the model
ModelRegistry.getInstance().register(FACE_MODEL, FaceModel);
