import { BaseModel } from './BaseModel';
import { WallModel } from './WallModel';
import { ModelRegistry } from '../ModelRegistry';
import { SCENE_MODEL } from '../types';

export interface SceneChangeEvent {
  type: 'change';
  scene: SceneModel;
}

export type SceneChangeListener = (event: SceneChangeEvent) => void;

export interface SceneEventMap {
  change: SceneChangeEvent;
}

/**
 * Represents the entire building scene.
 * Contains walls and other architectural elements as child models.
 */
export class SceneModel extends BaseModel {
  private _name: string;

  constructor(
    name: string = 'Untitled Scene',
    id?: string
  ) {
    super(id);
    this._name = name;
  }

  /**
   * Gets the scene name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Sets the scene name
   */
  set name(value: string) {
    if (this._name !== value) {
      this._name = value;
      this.dirty();
    }
  }

  /**
   * Gets all wall models in the scene
   */
  get walls(): WallModel[] {
    return this._children.filter(child => child instanceof WallModel) as WallModel[];
  }

  /**
   * Adds a wall to the scene
   */
  addWall(wall: WallModel): void {
    this.addChild(wall);
  }

  /**
   * Removes a wall from the scene by instance or id
   */
  removeWall(wall: WallModel | string): void {
    this.removeChild(wall);
  }

  /**
   * Triggers a change event to notify listeners that the scene has been modified
   */
  dirty(): void {
    this._isDirty = true;
    this.dispatchEvent({ type: 'change', scene: this });
  }
}

// Register the model
ModelRegistry.getInstance().register(SCENE_MODEL, SceneModel);
