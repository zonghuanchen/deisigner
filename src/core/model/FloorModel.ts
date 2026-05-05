import { BaseModel } from './BaseModel';
import { ModelRegistry } from '../ModelRegistry';
import { FLOOR_MODEL } from '../types';

export interface FloorChangeEvent {
  type: 'change';
  floor: FloorModel;
}

export type FloorChangeListener = (event: FloorChangeEvent) => void;

export interface FloorEventMap {
  change: FloorChangeEvent;
}

/**
 * Represents a floor level in a building.
 * A floor contains child models such as faces, walls, and other architectural elements.
 */
export class FloorModel extends BaseModel {
  private _floorNumber: number;
  private _height: number;

  constructor(
    floorNumber: number = 1,
    height: number = 2.8,
    id?: string
  ) {
    super(id);
    this._floorNumber = floorNumber;
    this._height = height;
  }

  /**
   * Gets the floor number
   */
  get floorNumber(): number {
    return this._floorNumber;
  }

  /**
   * Sets the floor number
   */
  set floorNumber(value: number) {
    if (this._floorNumber !== value) {
      this._floorNumber = value;
      this.dirty();
    }
  }

  /**
   * Gets the floor height (elevation relative to ground)
   */
  get height(): number {
    return this._height;
  }

  /**
   * Sets the floor height
   */
  set height(value: number) {
    if (this._height !== value) {
      this._height = value;
      this.dirty();
    }
  }

  /**
   * Triggers a change event to notify listeners that the floor has been modified
   */
  dirty(): void {
    this._isDirty = true;
    this.dispatchEvent({ type: 'change', floor: this });
  }
}

// Register the model
ModelRegistry.getInstance().register(FLOOR_MODEL, FloorModel);
