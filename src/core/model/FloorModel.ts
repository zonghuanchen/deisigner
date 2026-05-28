import { BaseModel } from './BaseModel';
import { WallModel } from './WallModel';
import { FurnitureModel } from './FurnitureModel';
import { ParametricModel } from './ParametricModel';
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
      * Gets all wall models on this floor
      */
    get walls(): WallModel[] {
        return this._children.filter(child => child instanceof WallModel) as WallModel[];
    }

    /**
      * Gets all furniture models on this floor
      */
    get furnitures(): FurnitureModel[] {
        return this._children.filter(child => child instanceof FurnitureModel) as FurnitureModel[];
    }

    /**
      * Gets all parametric models on this floor
      */
    get parametrics(): ParametricModel[] {
        return this._children.filter(child => child instanceof ParametricModel) as ParametricModel[];
    }

    /**
      * Adds a wall to this floor
      */
    addWall(wall: WallModel): void {
        this.addChild(wall);
    }

    /**
      * Removes a wall from this floor by instance or id
      */
    removeWall(wall: WallModel | string): void {
        this.removeChild(wall);
    }

    /**
      * Adds a furniture to this floor
      */
    addFurniture(furniture: FurnitureModel): void {
        this.addChild(furniture);
    }

    /**
      * Removes a furniture from this floor by instance or id
      */
    removeFurniture(furniture: FurnitureModel | string): void {
        this.removeChild(furniture);
    }

    /**
      * Adds a parametric model to this floor
      */
    addParametric(parametric: ParametricModel): void {
        this.addChild(parametric);
    }

    /**
      * Removes a parametric model from this floor by instance or id
      */
    removeParametric(parametric: ParametricModel | string): void {
        this.removeChild(parametric);
    }

    /**
      * Triggers a change event to notify listeners that the floor has been modified
      */
    dirty(): void {
        this._isDirty = true;
        this.dispatchEvent({ type: 'change', floor: this });
    }

    getUI(): Record<string, any> {
        return {
            id: this._id,
            floorNumber: this._floorNumber,
            height: this._height,
            walls: this.walls.map(w => w.id),
            furnitures: this.furnitures.map(f => f.id),
            parametrics: this.parametrics.map(p => p.id),
        };
    }
}

// Register the model
ModelRegistry.getInstance().register(FLOOR_MODEL, FloorModel);
