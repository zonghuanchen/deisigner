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
  private _outerContour: THREE.Vector3[] =[];
  private _innerContours: THREE.Vector3[][] = [];
  private _material: Material;

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
    this._material = material;
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
