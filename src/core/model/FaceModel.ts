import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { FACE_MODEL } from '../types';
import { Material } from '../material/Material';

export interface FaceChangeEvent {
  type: 'change';
  face: FaceModel;
}

export type FaceChangeListener = (event: FaceChangeEvent) => void;

export interface FaceEventMap {
  change: FaceChangeEvent;
}

export class FaceModel extends BaseModel {
  private _outerContour: THREE.Vector3[];
  private _material: Material;

  constructor(
    outerContour: THREE.Vector3[] = [],
    material: Material = new Material(),
    id?: string
  ) {
    super(id);
    this._outerContour = outerContour.map(point => point.clone());
    this._material = material;
  }

  get outerContour(): THREE.Vector3[] {
    return this._outerContour;
  }

  set outerContour(value: THREE.Vector3[]) {
    this._outerContour = value.map(point => point.clone());
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
    this._material = value;
    this.dirty();
  }

  /**
   * Triggers a change event to notify listeners that the face has been modified
   */
  dirty(): void {
    this._isDirty = true;
    this.dispatchEvent({ type: 'change', face: this });
  }
}

// Register the model
ModelRegistry.getInstance().register(FACE_MODEL, FaceModel);
