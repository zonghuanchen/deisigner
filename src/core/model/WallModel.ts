import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { FaceModel } from './FaceModel';
import { FurnitureModel } from './FurnitureModel';
import { ModelRegistry } from '../ModelRegistry';
import { WALL_MODEL } from '../types';

export type WallFacePosition = 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back';

/**
  * Represents an opening (hole) in a wall, such as a window or door.
  */
export interface WallHole {
    id: string;
    /** Distance from the wall start (from) to the hole center, along the wall direction */
    position: number;
    /** Width of the hole along the wall direction */
    width: number;
    /** Height of the hole */
    height: number;
    /** Height from the ground to the bottom of the hole (sill height) */
    sillHeight: number;
}

export interface WallChangeEvent {
    type: 'change';
    wall: WallModel;
}

export type WallChangeListener = (event: WallChangeEvent) => void;

/**
 * Represents a link to an adjacent wall connection.
 */
export interface WallLink {
    wall: WallModel;
    end: 'from' | 'to';
}

export interface WallEventMap {
    change: WallChangeEvent;
}

/**
  * Represents a wall in a building.
  * Defined by a start point (from), end point (to), width (thickness), and height.
  */
export class WallModel extends BaseModel {
    private _from: THREE.Vector2 = new THREE.Vector2();
    private _to: THREE.Vector2 = new THREE.Vector2();
    private _width: number = 0.2;
    private _height: number = 2.8;
    private _faces: Map<WallFacePosition, FaceModel> = new Map();
    private _holes: WallHole[] = [];
    private _holeRevealFaces: FaceModel[] = [];
    private _links: WallLink[] = [];
    private _miterEndCaps: FaceModel[] = [];

    constructor(
        from: THREE.Vector2 = new THREE.Vector2(),
        to: THREE.Vector2 = new THREE.Vector2(),
        width: number = 0.2,
        height: number = 2.8,
        id?: string
    ) {
        super(id);
        this._from = from.clone();
        this._to = to.clone();
        this._width = width;
        this._height = height;
        this.updateFaces();
    }

    /**
      * Gets the start point of the wall
      */
    get from(): THREE.Vector2 {
        return this._from;
    }

    /**
      * Sets the start point of the wall
      */
    set from(value: THREE.Vector2) {
        if (!this._from.equals(value)) {
            this._from.copy(value);
            this.dirty();
        }
    }

    /**
      * Gets the end point of the wall
      */
    get to(): THREE.Vector2 {
        return this._to;
    }

    /**
      * Sets the end point of the wall
      */
    set to(value: THREE.Vector2) {
        if (!this._to.equals(value)) {
            this._to.copy(value);
            this.dirty();
        }
    }

    /**
      * Gets the wall thickness (width)
      */
    get width(): number {
        return this._width;
    }

    /**
      * Sets the wall thickness (width)
      */
    set width(value: number) {
        if (this._width !== value) {
            this._width = value;
            this.dirty();
        }
    }

    /**
      * Gets the wall height
      */
    get height(): number {
        return this._height;
    }

    /**
      * Sets the wall height
      */
    set height(value: number) {
        if (this._height !== value) {
            this._height = value;
            this.dirty();
        }
    }

    /**
      * Gets all face models that make up this wall
      */
    get faces(): FaceModel[] {
        return Array.from(this._faces.values());
    }

    /**
      * Gets a face by its position
      */
    getFace(position: WallFacePosition): FaceModel | undefined {
        return this._faces.get(position);
    }

    /**
      * Gets the left face of the wall
      */
    get leftFace(): FaceModel | undefined {
        return this._faces.get('left');
    }

    /**
      * Gets the right face of the wall
      */
    get rightFace(): FaceModel | undefined {
        return this._faces.get('right');
    }

    /**
      * Gets the top face of the wall
      */
    get topFace(): FaceModel | undefined {
        return this._faces.get('top');
    }

    /**
      * Gets the bottom face of the wall
      */
    get bottomFace(): FaceModel | undefined {
        return this._faces.get('bottom');
    }

    /**
      * Gets the front face of the wall
      */
    get frontFace(): FaceModel | undefined {
        return this._faces.get('front');
    }

    /**
      * Gets the back face of the wall
      */
    get backFace(): FaceModel | undefined {
        return this._faces.get('back');
    }

    /**
      * Gets all holes in the wall
      */
    get holes(): WallHole[] {
        return this._holes.map(h => ({ ...h }));
    }

    /**
      * Adds a hole to the wall
      */
    addHole(hole: WallHole): void {
        if (this._holes.find(h => h.id === hole.id)) {
            console.warn(`Hole with id '${hole.id}' already exists.`);
            return;
        }
        this._holes.push({ ...hole });
        this.dirty();
    }

    /**
      * Removes a hole from the wall by id
      */
    removeHole(holeId: string): void {
        const index = this._holes.findIndex(h => h.id === holeId);
        if (index === -1) {
            console.warn(`Hole with id '${holeId}' not found.`);
            return;
        }
        this._holes.splice(index, 1);
        this.dirty();
    }

    /**
      * Updates an existing hole by id
      */
    updateHole(holeId: string, updates: Partial<Omit<WallHole, 'id'>>): void {
        const hole = this._holes.find(h => h.id === holeId);
        if (!hole) {
            console.warn(`Hole with id '${holeId}' not found.`);
            return;
        }
        if (updates.position !== undefined) hole.position = updates.position;
        if (updates.width !== undefined) hole.width = updates.width;
        if (updates.height !== undefined) hole.height = updates.height;
        if (updates.sillHeight !== undefined) hole.sillHeight = updates.sillHeight;
        this.dirty();
    }

    /**
      * Clears all holes from the wall
      */
    clearHoles(): void {
        if (this._holes.length > 0) {
            this._holes = [];
            this.dirty();
        }
    }

    /**
      * Gets all linked walls
      */
    get links(): WallLink[] {
        return [...this._links];
    }

    /**
      * Links this wall to an adjacent wall at a specific end
      */
    addLink(link: WallLink): void {
        const existing = this._links.find(
            l => l.wall.id === link.wall.id && l.end === link.end
        );
        if (existing) {
            console.warn(`Link to wall '${link.wall.id}' at '${link.end}' already exists.`);
            return;
        }
        this._links.push({ ...link });
        this.dirty();
    }

    /**
      * Removes a link to an adjacent wall
      */
    removeLink(wallId: string, end: 'from' | 'to'): void {
        const index = this._links.findIndex(
            l => l.wall.id === wallId && l.end === end
        );
        if (index === -1) {
            console.warn(`Link to wall '${wallId}' at '${end}' not found.`);
            return;
        }
        this._links.splice(index, 1);
        this.dirty();
    }

    /**
      * Clears all links from this wall
      */
    clearLinks(): void {
        if (this._links.length > 0) {
            this._links = [];
            this.dirty();
        }
    }

    /**
      * Triggers a change event to notify listeners that the wall has been modified
      */
    dirty(): void {
        this._isDirty = true;
        this.clearMiterEndCaps();
        this.updateFaces();
        this.updateMiterJoints();
        this.dispatchEvent({ type: 'change', wall: this });
    }

    private updateFaces(): void {
        const from = this._from;
        const to = this._to;
        const halfWidth = this._width / 2;
        const height = this._height;

        const direction = new THREE.Vector2().subVectors(to, from);
        const length = direction.length();

        if (length === 0 || height === 0 || this._width === 0) {
            // Clear faces if wall has no valid dimensions
            for (const [position, face] of this._faces) {
                this.removeChild(face);
            }
            this._faces.clear();
            this.clearHoleRevealFaces();
            return;
        }

        const dir = direction.clone().normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x);
        const offset = perp.clone().multiplyScalar(halfWidth);

        // Bottom vertices (z = 0)
        const blf = new THREE.Vector3(from.x + offset.x, from.y + offset.y, 0);
        const blb = new THREE.Vector3(from.x - offset.x, from.y - offset.y, 0);
        const brb = new THREE.Vector3(to.x - offset.x, to.y - offset.y, 0);
        const brf = new THREE.Vector3(to.x + offset.x, to.y + offset.y, 0);

        // Top vertices (z = height)
        const tlf = new THREE.Vector3(from.x + offset.x, from.y + offset.y, height);
        const tlb = new THREE.Vector3(from.x - offset.x, from.y - offset.y, height);
        const trb = new THREE.Vector3(to.x - offset.x, to.y - offset.y, height);
        const trf = new THREE.Vector3(to.x + offset.x, to.y + offset.y, height);

        const wallLength = this._from.distanceTo(this._to);

        // Compute inner contours for all faces based on holes
        const frontHoles = this._holes.length > 0
            ? this.computeHoleContours(dir, offset, false)
            : undefined;
        const backHoles = this._holes.length > 0
            ? this.computeHoleContours(dir, offset, true)
            : undefined;

        const frontCapHoles: THREE.Vector3[][] = [];
        const backCapHoles: THREE.Vector3[][] = [];
        const topFaceHoles: THREE.Vector3[][] = [];
        const bottomFaceHoles: THREE.Vector3[][] = [];

        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            const rawLeft = hole.position - hole.width / 2;
            const rawRight = hole.position + hole.width / 2;
            const rawBottom = hole.sillHeight;
            const rawTop = hole.sillHeight + hole.height;

            // Front end cap hole (at from-end)
            if (rawLeft <= 0 && bounds.topZ > bounds.bottomZ) {
                frontCapHoles.push([
                    new THREE.Vector3(from.x - offset.x, from.y - offset.y, bounds.bottomZ),
                    new THREE.Vector3(from.x - offset.x, from.y - offset.y, bounds.topZ),
                    new THREE.Vector3(from.x + offset.x, from.y + offset.y, bounds.topZ),
                    new THREE.Vector3(from.x + offset.x, from.y + offset.y, bounds.bottomZ),
                ]);
            }

            // Back end cap hole (at to-end)
            if (rawRight >= wallLength && bounds.topZ > bounds.bottomZ) {
                backCapHoles.push([
                    new THREE.Vector3(to.x + offset.x, to.y + offset.y, bounds.bottomZ),
                    new THREE.Vector3(to.x + offset.x, to.y + offset.y, bounds.topZ),
                    new THREE.Vector3(to.x - offset.x, to.y - offset.y, bounds.topZ),
                    new THREE.Vector3(to.x - offset.x, to.y - offset.y, bounds.bottomZ),
                ]);
            }

            // Bottom face hole
            if (rawBottom <= 0 && bounds.rightDist > bounds.leftDist) {
                const pLeft = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(bounds.leftDist)
                );
                const pRight = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(bounds.rightDist)
                );
                bottomFaceHoles.push([
                    new THREE.Vector3(pLeft.x + offset.x, pLeft.y + offset.y, 0),
                    new THREE.Vector3(pLeft.x - offset.x, pLeft.y - offset.y, 0),
                    new THREE.Vector3(pRight.x - offset.x, pRight.y - offset.y, 0),
                    new THREE.Vector3(pRight.x + offset.x, pRight.y + offset.y, 0),
                ]);
            }

            // Top face hole
            if (rawTop >= height && bounds.rightDist > bounds.leftDist) {
                const pLeft = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(bounds.leftDist)
                );
                const pRight = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(bounds.rightDist)
                );
                topFaceHoles.push([
                    new THREE.Vector3(pLeft.x + offset.x, pLeft.y + offset.y, height),
                    new THREE.Vector3(pRight.x + offset.x, pRight.y + offset.y, height),
                    new THREE.Vector3(pRight.x - offset.x, pRight.y - offset.y, height),
                    new THREE.Vector3(pLeft.x - offset.x, pLeft.y - offset.y, height),
                ]);
            }
        }

        const faceConfigs: { position: WallFacePosition; vertices: THREE.Vector3[]; innerContours?: THREE.Vector3[][] }[] = [
            { position: 'left',   vertices: [blf, brf, trf, tlf], innerContours: frontHoles },
            { position: 'right',  vertices: [brb, blb, tlb, trb], innerContours: backHoles },
            { position: 'front',  vertices: [blb, blf, tlf, tlb], innerContours: frontCapHoles.length > 0 ? frontCapHoles : undefined },
            { position: 'back',   vertices: [brf, brb, trb, trf], innerContours: backCapHoles.length > 0 ? backCapHoles : undefined },
            { position: 'top',    vertices: [tlf, tlb, trb, trf], innerContours: topFaceHoles.length > 0 ? topFaceHoles : undefined },
            { position: 'bottom', vertices: [blf, brf, brb, blb], innerContours: bottomFaceHoles.length > 0 ? bottomFaceHoles : undefined },
        ];

        for (const config of faceConfigs) {
            let face = this._faces.get(config.position);
            if (face) {
                face.outerContour = config.vertices;
                face.innerContours = config.innerContours || [];
            } else {
                face = new FaceModel(config.vertices, config.innerContours || []);
                this._faces.set(config.position, face);
                this.addChild(face);
            }
        }

        // Update hole reveal faces (the sides of each opening)
        this.updateHoleRevealFaces(dir, offset);
    }

    /**
      * Clears all miter end cap faces.
      */
    private clearMiterEndCaps(): void {
        for (const face of this._miterEndCaps) {
            this.removeChild(face);
        }
        this._miterEndCaps = [];
    }

    /**
      * Updates miter joint geometry at wall connections.
      * Computes miter line intersections with wall edge lines, updates
      * left/right/top/bottom face vertices at the linked end, removes
      * the corresponding end cap face, and creates a miter face that
      * perfectly closes the joint.
      */
    private updateMiterJoints(): void {
        const from = this._from;
        const to = this._to;
        const halfWidth = this._width / 2;
        const height = this._height;

        const direction = new THREE.Vector2().subVectors(to, from);
        const length = direction.length();
        if (length === 0) return;

        const dir = direction.clone().normalize();
        const perp = new THREE.Vector2(-dir.y, dir.x);
        const offset = perp.clone().multiplyScalar(halfWidth);

        for (const link of this._links) {
            const otherWall = link.wall;
            const otherFrom = otherWall.from;
            const otherTo = otherWall.to;

            const otherDir = new THREE.Vector2().subVectors(otherTo, otherFrom).normalize();

            const isAtFromEnd = link.end === 'from';
            const jointPoint = isAtFromEnd ? from : to;

            // Determine which end of the other wall connects to this joint
            const tolerance = 0.01;
            let otherEndDir: THREE.Vector2;

            if (otherFrom.distanceTo(jointPoint) < tolerance) {
                otherEndDir = otherDir.clone();
            } else if (otherTo.distanceTo(jointPoint) < tolerance) {
                otherEndDir = otherDir.clone().negate();
            } else {
                continue;
            }

            // Calculate the bisector direction for the miter angle
            const myDir = isAtFromEnd ? dir.clone().negate() : dir.clone();
            const bisectorVec = new THREE.Vector2().addVectors(myDir, otherEndDir);
            if (bisectorVec.lengthSq() < 1e-10) continue;
            const bisector = bisectorVec.normalize();
            const miterPerp = new THREE.Vector2(-bisector.y, bisector.x);

            // Find intersections of miter line with the wall's +offset and -offset edge lines
            const frontIntersect = this.findMiterEdgeIntersection(
                dir, offset, jointPoint, miterPerp, true
            );
            const backIntersect = this.findMiterEdgeIntersection(
                dir, offset, jointPoint, miterPerp, false
            );

            if (!frontIntersect || !backIntersect) continue;

            // Update left/right/top/bottom face vertices at the linked end
            this.updateFacesAtMiterEnd(isAtFromEnd, frontIntersect, backIntersect, height);

            // Remove the end cap face at the linked end
            const endCapPosition = isAtFromEnd ? 'front' : 'back';
            const endCapFace = this._faces.get(endCapPosition);
            if (endCapFace) {
                this.removeChild(endCapFace);
                this._faces.delete(endCapPosition);
            }

            // Compute hole contours that extend to the miter-linked end
            const miterHoleContours = this.computeMiterHoleContours(
                isAtFromEnd, miterPerp, dir, perp
            );

            // Create miter face using the intersection points
            const p1 = new THREE.Vector3(frontIntersect.x, frontIntersect.y, 0);
            const p2 = new THREE.Vector3(backIntersect.x, backIntersect.y, 0);
            const p3 = new THREE.Vector3(backIntersect.x, backIntersect.y, height);
            const p4 = new THREE.Vector3(frontIntersect.x, frontIntersect.y, height);

            const miterFace = new FaceModel([p1, p2, p3, p4], miterHoleContours);
            this._miterEndCaps.push(miterFace);
            this.addChild(miterFace);
        }
    }

    /**
      * Finds the intersection of the miter line with one of the wall's edge lines.
      * @param dir - Normalized wall direction
      * @param offset - Perpendicular offset vector (half thickness)
      * @param jointPoint - The junction point
      * @param miterPerp - Perpendicular to the miter bisector
      * @param isFrontSide - true for +offset side, false for -offset side
      */
    private findMiterEdgeIntersection(
        dir: THREE.Vector2,
        offset: THREE.Vector2,
        jointPoint: THREE.Vector2,
        miterPerp: THREE.Vector2,
        isFrontSide: boolean
    ): THREE.Vector2 | null {
        const sign = isFrontSide ? 1 : -1;
        const edgeOrigin = new THREE.Vector2().copy(this._from).addScaledVector(offset, sign);

        const dx = edgeOrigin.x - jointPoint.x;
        const dy = edgeOrigin.y - jointPoint.y;
        const denom = dir.x * miterPerp.y - dir.y * miterPerp.x;

        if (Math.abs(denom) < 1e-10) return null;

        const t = -(dx * miterPerp.y - dy * miterPerp.x) / denom;

        return new THREE.Vector2(
            edgeOrigin.x + t * dir.x,
            edgeOrigin.y + t * dir.y
        );
    }

    /**
      * Updates left/right/top/bottom face vertices at the miter-linked end.
      */
    private updateFacesAtMiterEnd(
        isAtFromEnd: boolean,
        frontIntersect: THREE.Vector2,
        backIntersect: THREE.Vector2,
        height: number
    ): void {
        const fi = frontIntersect;
        const bi = backIntersect;

        // left face (+offset side): [blf, brf, trf, tlf]
        const leftFace = this._faces.get('left');
        if (leftFace) {
            const verts = leftFace.outerContour;
            if (isAtFromEnd) {
                verts[0] = new THREE.Vector3(fi.x, fi.y, 0);
                verts[3] = new THREE.Vector3(fi.x, fi.y, height);
            } else {
                verts[1] = new THREE.Vector3(fi.x, fi.y, 0);
                verts[2] = new THREE.Vector3(fi.x, fi.y, height);
            }
            leftFace.outerContour = verts;
        }

        // right face (-offset side): [brb, blb, tlb, trb]
        const rightFace = this._faces.get('right');
        if (rightFace) {
            const verts = rightFace.outerContour;
            if (isAtFromEnd) {
                verts[1] = new THREE.Vector3(bi.x, bi.y, 0);
                verts[2] = new THREE.Vector3(bi.x, bi.y, height);
            } else {
                verts[0] = new THREE.Vector3(bi.x, bi.y, 0);
                verts[3] = new THREE.Vector3(bi.x, bi.y, height);
            }
            rightFace.outerContour = verts;
        }

        // top face: [tlf, tlb, trb, trf]
        const topFace = this._faces.get('top');
        if (topFace) {
            const verts = topFace.outerContour;
            if (isAtFromEnd) {
                verts[0] = new THREE.Vector3(fi.x, fi.y, height);
                verts[1] = new THREE.Vector3(bi.x, bi.y, height);
            } else {
                verts[2] = new THREE.Vector3(bi.x, bi.y, height);
                verts[3] = new THREE.Vector3(fi.x, fi.y, height);
            }
            topFace.outerContour = verts;
        }

        // bottom face: [blf, brf, brb, blb]
        const bottomFace = this._faces.get('bottom');
        if (bottomFace) {
            const verts = bottomFace.outerContour;
            if (isAtFromEnd) {
                verts[0] = new THREE.Vector3(fi.x, fi.y, 0);
                verts[3] = new THREE.Vector3(bi.x, bi.y, 0);
            } else {
                verts[1] = new THREE.Vector3(fi.x, fi.y, 0);
                verts[2] = new THREE.Vector3(bi.x, bi.y, 0);
            }
            bottomFace.outerContour = verts;
        }
    }

    /**
      * Computes hole contours on the miter face for holes that extend
      * to the linked end of the wall.
      * @param isAtFromEnd - Whether the link is at the from-end
      * @param miterPerp - Perpendicular to the miter bisector
      * @param dir - Normalized wall direction
      * @param perp - Perpendicular to wall direction
      * @returns Array of hole contours on the miter face
      */
    private computeMiterHoleContours(
        isAtFromEnd: boolean,
        miterPerp: THREE.Vector2,
        dir: THREE.Vector2,
        perp: THREE.Vector2
    ): THREE.Vector3[][] {
        const contours: THREE.Vector3[][] = [];
        const wallLength = this._from.distanceTo(this._to);
        const halfW = this._width / 2;

        // Convert miterPerp to wall-local coordinates
        const miterPerpLocal = new THREE.Vector2(
            miterPerp.dot(dir),
            miterPerp.dot(perp)
        );

        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            const rawLeft = hole.position - hole.width / 2;
            const rawRight = hole.position + hole.width / 2;

            const extendsToEnd = isAtFromEnd ? (rawLeft <= 0) : (rawRight >= wallLength);
            if (!extendsToEnd) continue;

            // Hole rectangle in wall-local coordinates (x along dir, y along perp)
            const holeNearX = isAtFromEnd ? bounds.rightDist : bounds.leftDist;
            const holeFarX = isAtFromEnd ? 0 : wallLength;
            const holeYMin = -halfW;
            const holeYMax = halfW;

            // Miter line in local coords: P = (holeFarX, 0) + t * miterPerpLocal
            const tValues: number[] = [0];

            // Intersection with the holeNearX boundary
            if (Math.abs(miterPerpLocal.x) > 1e-10) {
                const t = (holeNearX - holeFarX) / miterPerpLocal.x;
                const y = t * miterPerpLocal.y;
                if (y >= holeYMin && y <= holeYMax) {
                    tValues.push(t);
                }
            }

            // Intersection with the y = ±halfW boundaries
            if (Math.abs(miterPerpLocal.y) > 1e-10) {
                const t1 = halfW / miterPerpLocal.y;
                const x1 = holeFarX + t1 * miterPerpLocal.x;
                if (
                    isAtFromEnd
                        ? (x1 <= holeNearX && x1 >= holeFarX)
                        : (x1 >= holeNearX && x1 <= holeFarX)
                ) {
                    tValues.push(t1);
                }

                const t2 = -halfW / miterPerpLocal.y;
                const x2 = holeFarX + t2 * miterPerpLocal.x;
                if (
                    isAtFromEnd
                        ? (x2 <= holeNearX && x2 >= holeFarX)
                        : (x2 >= holeNearX && x2 <= holeFarX)
                ) {
                    tValues.push(t2);
                }
            }

            if (tValues.length < 2) continue;

            const tMin = Math.min(...tValues);
            const tMax = Math.max(...tValues);

            // Convert local intersection points to global coordinates
            const jointPoint = isAtFromEnd ? this._from : this._to;
            const pEnter = new THREE.Vector2().copy(jointPoint).addScaledVector(miterPerp, tMin);
            const pExit = new THREE.Vector2().copy(jointPoint).addScaledVector(miterPerp, tMax);

            // Wound opposite to outer contour for CSG subtraction
            contours.push([
                new THREE.Vector3(pEnter.x, pEnter.y, bounds.bottomZ),
                new THREE.Vector3(pExit.x, pExit.y, bounds.bottomZ),
                new THREE.Vector3(pExit.x, pExit.y, bounds.topZ),
                new THREE.Vector3(pEnter.x, pEnter.y, bounds.topZ),
            ]);
        }

        return contours;
    }

    /**
      * Clears and disposes all hole reveal faces.
      */
    private clearHoleRevealFaces(): void {
        for (const face of this._holeRevealFaces) {
            this.removeChild(face);
        }
        this._holeRevealFaces = [];
    }

    /**
      * Creates reveal faces around each hole to show wall thickness.
      * Each hole generates up to 4 quads: left, right, top, and bottom reveals.
      * Reveals at the wall boundary are skipped to avoid overlapping with end caps.
      */
    private updateHoleRevealFaces(
        dir: THREE.Vector2,
        offset: THREE.Vector2
    ): void {
        this.clearHoleRevealFaces();
        const wallLength = this._from.distanceTo(this._to);

        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            const pLeft = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(bounds.leftDist)
            );
            const pRight = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(bounds.rightDist)
            );

            // Front (+offset) and back (-offset) hole corners
            const fbl = new THREE.Vector3(pLeft.x + offset.x, pLeft.y + offset.y, bounds.bottomZ);
            const fbr = new THREE.Vector3(pRight.x + offset.x, pRight.y + offset.y, bounds.bottomZ);
            const ftr = new THREE.Vector3(pRight.x + offset.x, pRight.y + offset.y, bounds.topZ);
            const ftl = new THREE.Vector3(pLeft.x + offset.x, pLeft.y + offset.y, bounds.topZ);

            const bbl = new THREE.Vector3(pLeft.x - offset.x, pLeft.y - offset.y, bounds.bottomZ);
            const bbr = new THREE.Vector3(pRight.x - offset.x, pRight.y - offset.y, bounds.bottomZ);
            const btr = new THREE.Vector3(pRight.x - offset.x, pRight.y - offset.y, bounds.topZ);
            const btl = new THREE.Vector3(pLeft.x - offset.x, pLeft.y - offset.y, bounds.topZ);

            const revealConfigs: { vertices: THREE.Vector3[] }[] = [];

            // Left reveal: only if hole does not touch the from-end of the wall
            if (bounds.leftDist > 0) {
                revealConfigs.push({ vertices: [fbl, bbl, btl, ftl] });
            }
            // Right reveal: only if hole does not touch the to-end of the wall
            if (bounds.rightDist < wallLength) {
                revealConfigs.push({ vertices: [fbr, ftr, btr, bbr] });
            }
            // Bottom reveal: only if hole does not touch the ground
            if (bounds.bottomZ > 0) {
                revealConfigs.push({ vertices: [fbl, fbr, bbr, bbl] });
            }
            // Top reveal: only if hole does not touch the wall top
            if (bounds.topZ < this._height) {
                revealConfigs.push({ vertices: [ftl, ftr, btr, btl] });
            }

            for (const cfg of revealConfigs) {
                const face = new FaceModel(cfg.vertices);
                this._holeRevealFaces.push(face);
                this.addChild(face);
            }
        }
    }

    /**
      * Clamps a hole to the wall bounds and returns the clamped dimensions.
      * Returns null if the hole is completely outside the wall.
      */
    private clampHoleBounds(
        hole: WallHole,
        wallLength: number
    ): { leftDist: number; rightDist: number; bottomZ: number; topZ: number } | null {
        const halfHoleWidth = hole.width / 2;
        const rawLeft = hole.position - halfHoleWidth;
        const rawRight = hole.position + halfHoleWidth;
        const rawBottom = hole.sillHeight;
        const rawTop = hole.sillHeight + hole.height;

        const leftDist = Math.max(0, rawLeft);
        const rightDist = Math.min(wallLength, rawRight);
        const bottomZ = Math.max(0, rawBottom);
        const topZ = Math.min(this._height, rawTop);

        if (rightDist <= leftDist || topZ <= bottomZ) {
            return null;
        }

        return { leftDist, rightDist, bottomZ, topZ };
    }

    /**
      * Computes 3D hole contours for the front or back face of the wall.
      * Holes are clamped to the wall bounds.
      * @param dir - Normalized wall direction vector
      * @param offset - Perpendicular offset vector (half thickness)
      * @param isBack - Whether to compute for the back face (uses -offset)
      * @returns Array of hole contours, each as an array of 3D vertices
      */
    private computeHoleContours(
        dir: THREE.Vector2,
        offset: THREE.Vector2,
        isBack: boolean
    ): THREE.Vector3[][] {
        const faceOffset = isBack ? offset.clone().negate() : offset;
        const contours: THREE.Vector3[][] = [];
        const wallLength = this._from.distanceTo(this._to);
        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            if (bounds.rightDist <= bounds.leftDist || bounds.topZ <= bounds.bottomZ) continue;

            const pLeft = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(bounds.leftDist)
            );
            const pRight = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(bounds.rightDist)
            );

            const bl = new THREE.Vector3(pLeft.x + faceOffset.x, pLeft.y + faceOffset.y, bounds.bottomZ);
            const br = new THREE.Vector3(pRight.x + faceOffset.x, pRight.y + faceOffset.y, bounds.bottomZ);
            const tr = new THREE.Vector3(pRight.x + faceOffset.x, pRight.y + faceOffset.y, bounds.topZ);
            const tl = new THREE.Vector3(pLeft.x + faceOffset.x, pLeft.y + faceOffset.y, bounds.topZ);

            // Hole wound opposite to outer face for proper CSG behavior
            if (isBack) {
                contours.push([bl, br, tr, tl]);
            } else {
                contours.push([bl, tl, tr, br]);
            }
        }

        return contours;
    }

    /**
      * Checks if a furniture model overlaps with this wall and returns hole information if it does.
      * @param furniture - The furniture model to check for overlap
      * @returns WallHole object if there's overlap, null otherwise
      */
    checkFurnitureOverlap(furniture: FurnitureModel): WallHole | null {
        // Get furniture bounding box in world space
        const furniturePos = furniture.position;
        const furnitureSize = furniture.size;
        const furnitureRot = furniture.rotation;

        // Calculate the furniture's bounding box considering rotation
        // position is the left side of the bottom face (x=0 at left edge, centered in y)
        const halfSize = new THREE.Vector3(
            furnitureSize.x, // full width in x (from left edge)
            furnitureSize.y / 2, // half width in y (centered)
            0 // z starts from 0 (bottom), not centered
        );

        // Create a rotation matrix from the furniture's rotation
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(furnitureRot);

        // Calculate the 4 corners of the furniture bottom face
        // x ranges from 0 to furnitureSize.x (left to right)
        // y ranges from -furnitureSize.y/2 to +furnitureSize.y/2 (centered)
        const bottomCorners: THREE.Vector3[] = [];
        for (let x = 0; x <= 1; x += 1) {
            for (let y = -1; y <= 1; y += 2) {
                const corner = new THREE.Vector3(
                    x * halfSize.x,
                    y * halfSize.y,
                    0
                );
                corner.applyMatrix4(rotationMatrix);
                corner.add(furniturePos);
                bottomCorners.push(corner);
            }
        }

        // Calculate the 4 corners of the furniture top face
        const topCorners: THREE.Vector3[] = [];
        for (let x = 0; x <= 1; x += 1) {
            for (let y = -1; y <= 1; y += 2) {
                const corner = new THREE.Vector3(
                    x * halfSize.x,
                    y * halfSize.y,
                    furnitureSize.z
                );
                corner.applyMatrix4(rotationMatrix);
                corner.add(furniturePos);
                topCorners.push(corner);
            }
        }

        // Combine all corners
        const corners = [...bottomCorners, ...topCorners];

        // Get wall direction and properties
        const wallFrom = this._from;
        const wallTo = this._to;
        const wallDirection = new THREE.Vector2().subVectors(wallTo, wallFrom);
        const wallLength = wallDirection.length();
        
        if (wallLength === 0) return null;

        const wallDir = wallDirection.clone().normalize();
        const wallPerp = new THREE.Vector2(-wallDir.y, wallDir.x);
        const halfWallWidth = this._width / 2;

        // Project furniture corners onto wall's local coordinate system
        let minProj = Infinity;
        let maxProj = -Infinity;
        let minPerp = Infinity;
        let maxPerp = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        for (const corner of corners) {
            // Project corner onto wall direction
            const corner2D = new THREE.Vector2(corner.x, corner.y);
            const toCorner = new THREE.Vector2().subVectors(corner2D, wallFrom);
            
            const proj = toCorner.dot(wallDir); // Distance along wall
            const perp = toCorner.dot(wallPerp); // Distance perpendicular to wall
            
            minProj = Math.min(minProj, proj);
            maxProj = Math.max(maxProj, proj);
            minPerp = Math.min(minPerp, perp);
            maxPerp = Math.max(maxPerp, perp);
            minZ = Math.min(minZ, corner.z);
            maxZ = Math.max(maxZ, corner.z);
        }

        // Check if furniture overlaps with wall in all dimensions
        const overlapsAlongWall = maxProj >= 0 && minProj <= wallLength;
        const overlapsPerpendicular = minPerp <= halfWallWidth && maxPerp >= -halfWallWidth;
        const overlapsVertical = maxZ >= 0 && minZ <= this._height;

        if (!overlapsAlongWall || !overlapsPerpendicular || !overlapsVertical) {
            return null;
        }

        // Calculate hole parameters based on actual overlap with wall
        // Clamp the furniture projection to wall bounds
        const overlapStart = Math.max(0, minProj);
        const overlapEnd = Math.min(wallLength, maxProj);
        const overlapWidth = overlapEnd - overlapStart;
        
        const overlapBottom = Math.max(0, minZ);
        const overlapTop = Math.min(this._height, maxZ);
        const overlapHeight = overlapTop - overlapBottom;

        // Only create hole if there's significant overlap
        if (overlapWidth <= 0.01 || overlapHeight <= 0.01) {
            return null;
        }

        // Hole position is the center of the overlap region along the wall
        const holeCenterPos = (overlapStart + overlapEnd) / 2;

        return {
            id: `furniture_hole_${furniture.id}_${Date.now()}`,
            position: holeCenterPos,
            width: overlapWidth,
            height: overlapHeight,
            sillHeight: overlapBottom
        };
    }
}

// Register the model
ModelRegistry.getInstance().register(WALL_MODEL, WallModel);
