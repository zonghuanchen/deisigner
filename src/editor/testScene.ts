import * as THREE from 'three';
import { SceneModel, WallModel, FurnitureModel, ParametricModel, Material } from '../core';
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
    wall.addLink({ wall: wall2 });
    wall2.addLink({ wall });

    const wall3 = new WallModel(
        new THREE.Vector2(5, -5),
        new THREE.Vector2(-5, -5),
        0.24,
        2.8
    );
    floor.addWall(wall3);

    wall2.addLink({ wall: wall3 });
    wall3.addLink({ wall: wall2 });

    const wall4 = new WallModel(
        new THREE.Vector2(-5, -5),
        new THREE.Vector2(-5, 5),
        0.24,
        2.8
    );
    floor.addWall(wall4);
    wall3.addLink({ wall: wall4 });
    wall4.addLink({ wall: wall3 });

    wall4.addLink({ wall });
    wall.addLink({ wall: wall4 });

    // Internal partition wall — should create a hole in the floor contour
    const internalWall = new WallModel(
        new THREE.Vector2(-3, 0),
        new THREE.Vector2(5, 0),
        0.24,
        2.8
    );
    floor.addWall(internalWall);
    // Link internal wall to outer walls at T-junctions
    internalWall.addLink({ wall: wall4 });
    wall4.addLink({ wall: internalWall });

    // Build rooms from walls
    const rooms = RoomBuilder.build(scene);
    for (const room of rooms) {
        scene.addRoom(room);
    }
    
    // Defer material assignment to ensure Face display objects have registered their listeners
    Promise.resolve().then(() => {
        for (const room of rooms) {
            const material = room.groundFace.material;
            const texture = new THREE.TextureLoader().load('/assets/material-1.jpg');
            // Set texture repeat to control how many times the texture tiles across the floor
            // Adjust these values based on your texture size and desired appearance
            texture.repeat.set(2, 2);  // Tile 2x2 times across the floor
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            material.map = texture;
        }
    });
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
        // Add a parametric cuboid model with a hole
        const parametricParams: ParametricDef[] = [
            {
                type: 'cuboid',
                params: {
                    size: [1, 1, 2.8]
                },
                bool: [
                    {
                        type: 'subtract',
                        shape: {
                            type: 'cuboid',
                            params: {
                                size: [0.4, 0.4, 2.8]
                            }
                        }
                    }
                ]
            }
        ];
        const texture = new THREE.TextureLoader().load('/assets/material-3.jpg');
        texture.repeat.set(2, 2);  // Tile 2x2 times across the floor
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const material = new Material({
            map: texture
        });
        const parametricModel = new ParametricModel(
            parametricParams,
            [material],
            new THREE.Vector3(2, 1, 1.4),
            new THREE.Euler(0, 0, 0),
            new THREE.Vector3(1, 1, 1)
        );
        floor.addParametric(parametricModel);
        
    });


}
