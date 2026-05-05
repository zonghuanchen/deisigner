import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { FaceModel } from './FaceModel';
import { ModelRegistry } from '../ModelRegistry';
import { WALL_MODEL } from '../types';

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
  private _from: THREE.Vector3;
  private _to: THREE.Vector3;
  private _width: number;
  private _height: number;

  constructor(
    from: THREE.Vector3 = new THREE.Vector3(),
    to: THREE.Vector3 = new THREE.Vector3(),
    width: number = 0.2,
    height: number = 2.8,
    id?: string
  ) {
    super(id);
    this._from = from.clone();
    this._to = to.clone();
    this._width = width;
    this._height = height;
  }

  /**
   * Gets the start point of the wall
   */
  get from(): THREE.Vector3 {
    return this._from;
  }

  /**
   * Sets the start point of the wall
   */
  set from(value: THREE.Vector3) {
    if (!this._from.equals(value)) {
      this._from.copy(value);
      this.dirty();
    }
  }

  /**
   * Gets the end point of the wall
   */
  get to(): THREE.Vector3 {
    return this._to;
  }

  /**
   * Sets the end point of the wall
   */
  set to(value: THREE.Vector3) {
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
    return this._children.filter(child => child instanceof FaceModel) as FaceModel[];
  }

  /**
   * Adds a face to the wall
   */
  addFace(face: FaceModel): void {
    this.addChild(face);
  }

  /**
   * Removes a face from the wall by instance or id
   */
  removeFace(face: FaceModel | string): void {
    this.removeChild(face);
  }

  /**
   * Triggers a change event to notify listeners that the wall has been modified
   */
  dirty(): void {
    this._isDirty = true;
    this.dispatchEvent({ type: 'change', wall: this });
  }
}

// Register the model
ModelRegistry.getInstance().register(WALL_MODEL, WallModel);
