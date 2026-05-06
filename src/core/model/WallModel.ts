import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { FaceModel } from './FaceModel';
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

export interface WallEventMap {
    change: WallChangeEvent;
}

/**
  * Represents a wall in a building.
  * Defined by a start point (from), end point (to), width (thickness), and height.
  */
export class WallModel extends BaseModel {
    private _from: THREE.Vector2;
    private _to: THREE.Vector2;
    private _width: number;
    private _height: number;
    private _faces: Map<WallFacePosition, FaceModel> = new Map();
    private _holes: WallHole[] = [];
    private _holeRevealFaces: FaceModel[] = [];

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
      * Triggers a change event to notify listeners that the wall has been modified
      */
    dirty(): void {
        this._isDirty = true;
        this.updateFaces();
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

        const epsilon = 1e-4;
        const thicknessShrink = Math.max(0, 1 - epsilon / halfWidth);

        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            const rawLeft = hole.position - hole.width / 2;
            const rawRight = hole.position + hole.width / 2;
            const rawBottom = hole.sillHeight;
            const rawTop = hole.sillHeight + hole.height;

            // Shrink bounds slightly so inner contours never touch outer contours
            const capBottomZ = Math.max(epsilon, Math.min(this._height - epsilon, bounds.bottomZ));
            const capTopZ = Math.max(epsilon, Math.min(this._height - epsilon, bounds.topZ));

            // Front end cap hole (at from-end)
            if (rawLeft <= 0 && capTopZ > capBottomZ) {
                frontCapHoles.push([
                    new THREE.Vector3(from.x - offset.x * thicknessShrink, from.y - offset.y * thicknessShrink, capBottomZ),
                    new THREE.Vector3(from.x - offset.x * thicknessShrink, from.y - offset.y * thicknessShrink, capTopZ),
                    new THREE.Vector3(from.x + offset.x * thicknessShrink, from.y + offset.y * thicknessShrink, capTopZ),
                    new THREE.Vector3(from.x + offset.x * thicknessShrink, from.y + offset.y * thicknessShrink, capBottomZ),
                ]);
            }

            // Back end cap hole (at to-end)
            if (rawRight >= wallLength && capTopZ > capBottomZ) {
                backCapHoles.push([
                    new THREE.Vector3(to.x + offset.x * thicknessShrink, to.y + offset.y * thicknessShrink, capBottomZ),
                    new THREE.Vector3(to.x + offset.x * thicknessShrink, to.y + offset.y * thicknessShrink, capTopZ),
                    new THREE.Vector3(to.x - offset.x * thicknessShrink, to.y - offset.y * thicknessShrink, capTopZ),
                    new THREE.Vector3(to.x - offset.x * thicknessShrink, to.y - offset.y * thicknessShrink, capBottomZ),
                ]);
            }

            const topBottomLeft = Math.max(epsilon, Math.min(wallLength - epsilon, bounds.leftDist));
            const topBottomRight = Math.max(epsilon, Math.min(wallLength - epsilon, bounds.rightDist));

            // Bottom face hole
            if (rawBottom <= 0 && topBottomRight > topBottomLeft) {
                const pLeft = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(topBottomLeft)
                );
                const pRight = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(topBottomRight)
                );
                bottomFaceHoles.push([
                    new THREE.Vector3(pLeft.x + offset.x * thicknessShrink, pLeft.y + offset.y * thicknessShrink, 0),
                    new THREE.Vector3(pLeft.x - offset.x * thicknessShrink, pLeft.y - offset.y * thicknessShrink, 0),
                    new THREE.Vector3(pRight.x - offset.x * thicknessShrink, pRight.y - offset.y * thicknessShrink, 0),
                    new THREE.Vector3(pRight.x + offset.x * thicknessShrink, pRight.y + offset.y * thicknessShrink, 0),
                ]);
            }

            // Top face hole
            if (rawTop >= height && topBottomRight > topBottomLeft) {
                const pLeft = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(topBottomLeft)
                );
                const pRight = new THREE.Vector2().copy(from).add(
                    new THREE.Vector2().copy(dir).multiplyScalar(topBottomRight)
                );
                topFaceHoles.push([
                    new THREE.Vector3(pLeft.x + offset.x * thicknessShrink, pLeft.y + offset.y * thicknessShrink, height),
                    new THREE.Vector3(pRight.x + offset.x * thicknessShrink, pRight.y + offset.y * thicknessShrink, height),
                    new THREE.Vector3(pRight.x - offset.x * thicknessShrink, pRight.y - offset.y * thicknessShrink, height),
                    new THREE.Vector3(pLeft.x - offset.x * thicknessShrink, pLeft.y - offset.y * thicknessShrink, height),
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
      * Holes are clamped to the wall bounds and shrunk by a small epsilon
      * to avoid touching the outer contour, which prevents triangulation errors.
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
        const epsilon = 1e-4;

        for (const hole of this._holes) {
            const bounds = this.clampHoleBounds(hole, wallLength);
            if (!bounds) continue;

            // Shrink hole slightly so it never touches the outer contour
            const leftDist = Math.max(epsilon, Math.min(wallLength - epsilon, bounds.leftDist));
            const rightDist = Math.max(epsilon, Math.min(wallLength - epsilon, bounds.rightDist));
            const bottomZ = Math.max(epsilon, Math.min(this._height - epsilon, bounds.bottomZ));
            const topZ = Math.max(epsilon, Math.min(this._height - epsilon, bounds.topZ));

            if (rightDist <= leftDist || topZ <= bottomZ) continue;

            const pLeft = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(leftDist)
            );
            const pRight = new THREE.Vector2().copy(this._from).add(
                new THREE.Vector2().copy(dir).multiplyScalar(rightDist)
            );

            const bl = new THREE.Vector3(pLeft.x + faceOffset.x, pLeft.y + faceOffset.y, bottomZ);
            const br = new THREE.Vector3(pRight.x + faceOffset.x, pRight.y + faceOffset.y, bottomZ);
            const tr = new THREE.Vector3(pRight.x + faceOffset.x, pRight.y + faceOffset.y, topZ);
            const tl = new THREE.Vector3(pLeft.x + faceOffset.x, pLeft.y + faceOffset.y, topZ);

            // Hole wound opposite to outer face for proper CSG behavior
            if (isBack) {
                contours.push([bl, br, tr, tl]);
            } else {
                contours.push([bl, tl, tr, br]);
            }
        }

        return contours;
    }
}

// Register the model
ModelRegistry.getInstance().register(WALL_MODEL, WallModel);
