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
        id: 'window-02',
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

    // Build rooms from walls
    const rooms = RoomBuilder.build(scene);
    for (const room of rooms) {
        scene.addRoom(room);
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
