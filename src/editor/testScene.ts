import * as THREE from 'three';
import { SceneModel, FloorModel, WallModel, RoomModel, FurnitureModel, ParametricModel } from '../core';
import { ParametricDef } from '../core/util';
import { RoomBuilder } from '../core/util';

/**
 * Test scene setup with walls, rooms, furniture, and parametric models
 * This is demo/test code for development purposes
 */
export function setupTestScene(scene: SceneModel): void {
    const floor = scene.defaultFloor;
    if (!floor) return;

    // Create walls forming a room
    const wall = new WallModel(
        new THREE.Vector2(-5, 5),
        new THREE.Vector2(5, 5),
        0.24,
        2.8
    );
    floor.addWall(wall);

    const wall2 = new WallModel(
        new THREE.Vector2(5, 5),
        new THREE.Vector2(5, -5),
        0.24,
        2.8
    );
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

    // Build rooms from walls
    const rooms = RoomBuilder.build(scene);
    for (const room of rooms) {
        scene.addRoom(room);
    }

    // Defer furniture creation to avoid triggering display object creation during construction
    // This prevents infinite loop issues when ModelRegistry creates display objects
    Promise.resolve().then(() => {
        const furnituresData = [
            {
                position: new THREE.Vector3(0, 5, 0.9),
                rotation: new THREE.Euler(0, 0, 0),
                scale: new THREE.Vector3(0.5, 0.5, 0.5),
                linkWall: wall
            },{
                position: new THREE.Vector3(5, 0, 0),
                rotation: new THREE.Euler(0, 0, -Math.PI / 2),
                scale: new THREE.Vector3(1, 1, 1),
                linkWall: wall2
            }
        ];

        // Place furniture at each hole
        for (const furnitureData of furnituresData) {                
            const furniture = new FurnitureModel(
                '/assets/door-model.glb',
                furnitureData.position,
                furnitureData.rotation,
                furnitureData.scale
            );
            furniture.size = new THREE.Vector3(
                1.15 * furnitureData.scale.x, 
                0.296 * furnitureData.scale.y, 
                2.522 * furnitureData.scale.z
            );
            floor.addFurniture(furniture);
            const hole = furnitureData.linkWall.checkFurnitureOverlap(furniture);
            if (hole) {
                furnitureData.linkWall.addHole(hole);
            }
        }
    });
    
    // Defer parametric model creation to avoid triggering display object creation during construction
    // This prevents infinite loop issues when ModelRegistry creates display objects
    Promise.resolve().then(() => {
        // Add a parametric cylinder model with a hole
        const parametricParams: ParametricDef[] = [
            {
                type: 'cylinder',
                params: {
                    radius: 0.5,
                    height: 3
                },
                bool: [
                    {
                        type: 'subtract',
                        shape: {
                            type: 'cylinder',
                            params: {
                                radius: 0.2,
                                height: 3
                            }
                        }
                    }
                ]
            }
        ];
        const parametricModel = new ParametricModel(
            parametricParams,
            new THREE.Vector3(0, 0, 1),
            new THREE.Euler(0, 0, 0),
            new THREE.Vector3(1, 1, 1)
        );
        floor.addParametric(parametricModel);
    });
}
