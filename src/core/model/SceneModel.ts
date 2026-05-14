import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { WallModel } from './WallModel';
import { FloorModel } from './FloorModel';
import { RoomModel } from './RoomModel';
import { FurnitureModel } from './FurnitureModel';
import { ParametricModel } from './ParametricModel';
import { ParametricDef } from '../util/ParametricModeler';
import { ModelRegistry } from '../ModelRegistry';
import { SCENE_MODEL } from '../types';
import { RoomBuilder } from '../util';

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

        // 测试代码
        // 默认创建一堵墙：从 (0,0) 到 (0,10)，宽 0.24，高 2.8
        const wall = new WallModel(
            new THREE.Vector2(-5, 5),
            new THREE.Vector2(5, 5),
            0.24,
            2.8
        );
        wall.addHole({
            id: 'window-01',
            position: 5,
            width: 1.5,
            height: 1.5,
            sillHeight: 0.9,
        });
        floor.addWall(wall);
        const wall2 = new WallModel(
            new THREE.Vector2(5, 5),
            new THREE.Vector2(5, -5),
            0.24,
            2.8
        );
        wall2.addHole({
            id: 'window-01',
            position: 5,
            width: 1.5,
            height: 2.3,
            sillHeight: 0,
        });
        floor.addWall(wall2);

        // Link the walls at their junction point (5, 5)
        wall.addLink({ wall: wall2, end: 'to' });
        wall2.addLink({ wall: wall, end: 'from' });


        const wall3 = new WallModel(
            new THREE.Vector2(5, -5),
            new THREE.Vector2(-5, -5),
            0.24,
            2.8
        );
        floor.addWall(wall3);

        wall2.addLink({ wall: wall3, end: 'to' });
        wall3.addLink({ wall: wall2, end: 'from' });

        const wall4 = new WallModel(
            new THREE.Vector2(-5, -5),
            new THREE.Vector2(-5, 5),
            0.24,
            2.8
        );
        floor.addWall(wall4);
        wall3.addLink({ wall: wall4, end: 'to' });
        wall4.addLink({ wall: wall3, end: 'from' });

        wall4.addLink({ wall: wall, end: 'to' });
        wall.addLink({ wall: wall4, end: 'from' });

        const rooms = RoomBuilder.build(this);
        for (const room of rooms) {
            this.addRoom(room);
        }

        // Defer furniture creation to avoid triggering display object creation during construction
        // This prevents infinite loop issues when ModelRegistry creates display objects
        Promise.resolve().then(() => {
            // Iterate through all walls and place furniture at each hole
            for (const wall of floor.walls) {
                const holes = wall.holes;
                if (holes.length === 0) continue;

                // Calculate wall direction and offset
                const from = wall.from;
                const to = wall.to;
                const direction = new THREE.Vector2().subVectors(to, from);
                const wallLength = direction.length();
                if (wallLength === 0) continue;

                const dir = direction.clone().normalize();
                const perp = new THREE.Vector2(-dir.y, dir.x);
                const halfWidth = wall.width / 2;
                const offset = perp.clone().multiplyScalar(halfWidth);

                // Place furniture at each hole
                for (const hole of holes) {
                    // Calculate hole center position along the wall
                    const holeCenterDist = hole.position;
                    const holeCenter2D = new THREE.Vector2().copy(from).add(
                        new THREE.Vector2().copy(dir).multiplyScalar(holeCenterDist)
                    );

                    // Calculate the 3D position at the bottom center of the hole's front face
                    const holeCenterZ = hole.sillHeight;
                    const position3D = new THREE.Vector3(
                        holeCenter2D.x + offset.x,
                        holeCenter2D.y + offset.y,
                        holeCenterZ
                    );

                    // Calculate rotation to align furniture with wall direction
                    const wallAngle = Math.atan2(dir.y, dir.x);
                    const rotation = new THREE.Euler(0, 0, wallAngle);
                    
                    // Scale furniture to match hole dimensions
                    const scale = new THREE.Vector3(
                        hole.width,
                        hole.height,
                        1
                    );
                    
                    const furniture = new FurnitureModel(
                        '/assets/door-model.glb',
                        position3D,
                        rotation,
                        scale
                    );
                    floor.addFurniture(furniture);
                }
            }
        });
        
        // Add a parametric cylinder model
        const parametricParams: ParametricDef[] = [
            {
                type: 'cylinder',
                params: {
                    start: [0, 0, 0],
                    end: [3, 3, 10],
                    radius: 1
                }
            }
        ];
        const parametricModel = new ParametricModel(
            parametricParams,
            new THREE.Vector3(0, 0, 0),
            new THREE.Euler(0, 0, 0),
            new THREE.Vector3(1, 1, 1)
        );
        floor.addParametric(parametricModel);
        
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
      * Gets all room models directly attached to the scene
      */
    get rooms(): RoomModel[] {
        return this._children.filter(child => child instanceof RoomModel) as RoomModel[];
    }

    /**
      * Adds a room as a child of the scene
      */
    addRoom(room: RoomModel): void {
        this.addChild(room);
    }

    /**
      * Removes a room from the scene by instance or id
      */
    removeRoom(room: RoomModel | string): void {
        this.removeChild(room);
    }

    /**
      * Removes all rooms currently attached to the scene
      */
    clearRooms(): void {
        for (const room of this.rooms) {
            this.removeChild(room);
        }
    }

    /**
      * Rebuilds rooms by scanning walls for closed contours.
      * Existing rooms are removed before the new ones are added.
      */
    rebuildRooms(): RoomModel[] {
        this.clearRooms();
        const rooms = RoomBuilder.build(this);
        for (const room of rooms) {
            this.addRoom(room);
        }
        return rooms;
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
