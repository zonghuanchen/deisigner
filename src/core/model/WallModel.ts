import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { FaceModel } from './FaceModel';
import { ModelRegistry } from '../ModelRegistry';
import { WALL_MODEL } from '../types';

export type WallFacePosition = 'left' | 'right' | 'top' | 'bottom' | 'front' | 'back';

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

        const faceConfigs: { position: WallFacePosition; vertices: THREE.Vector3[] }[] = [
            { position: 'left',   vertices: [blf, brf, trf, tlf] },
            { position: 'right',  vertices: [brb, blb, tlb, trb] },
            { position: 'front',  vertices: [blb, blf, tlf, tlb] },
            { position: 'back',   vertices: [brf, brb, trb, trf] },
            { position: 'top',    vertices: [tlf, tlb, trb, trf] },
            { position: 'bottom', vertices: [blf, brf, brb, blb] },
        ];

        for (const config of faceConfigs) {
            let face = this._faces.get(config.position);
            if (face) {
                face.outerContour = config.vertices;
            } else {
                face = new FaceModel(config.vertices);
                this._faces.set(config.position, face);
                this.addChild(face);
            }
        }
    }
}

// Register the model
ModelRegistry.getInstance().register(WALL_MODEL, WallModel);
