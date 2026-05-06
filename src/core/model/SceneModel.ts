import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { WallModel } from './WallModel';
import { FloorModel } from './FloorModel';
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
        // 默认创建一个楼层
        const floor = new FloorModel(1, 2.8);
        this.addChild(floor);
        // 默认创建一堵墙：从 (0,0) 到 (0,1)，宽 0.24，高 2.8
        floor.addWall(new WallModel(
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0, 10),
            0.24,
            2.8
        ));
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
      * Gets all floor models in the scene
      */
    get floors(): FloorModel[] {
        return this._children.filter(child => child instanceof FloorModel) as FloorModel[];
    }

    /**
      * Gets the default (first) floor model
      */
    get defaultFloor(): FloorModel | undefined {
        return this.floors[0];
    }

    /**
      * Gets all wall models in the scene (across all floors)
      */
    get walls(): WallModel[] {
        return this.floors.flatMap(floor => floor.walls);
    }

    /**
      * Adds a wall to the default floor
      */
    addWall(wall: WallModel): void {
        const floor = this.defaultFloor;
        if (floor) {
            floor.addWall(wall);
        }
    }

    /**
      * Removes a wall from the scene by instance or id
      */
    removeWall(wall: WallModel | string): void {
        const wallId = typeof wall === 'string' ? wall : wall.id;
        for (const floor of this.floors) {
            const target = floor.walls.find(w => w.id === wallId);
            if (target) {
                floor.removeWall(target);
                return;
            }
        }
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
