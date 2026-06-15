import * as THREE from 'three';
import { SceneModel, WallModel, FurnitureModel, ParametricModel, Material,ParametricModelV2, PresetRegion } from '@designer/core';
import { ParametricDef } from '@designer/core/util';
import { RoomBuilder } from '@designer/core/util';
import { FurnitureType } from '@designer/core/types';

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
    
    // Defer paving region setup to ensure Face display objects have registered their listeners
    Promise.resolve().then(() => {
        for (const room of rooms) {
            const face = room.groundFace;
            const material = face.material;

            // Project 3D face contours to 2D using the face UV basis
            const uvData = face.computeUVData();
            if (!uvData) continue;

            const { origin, uAxis, vAxis, outerProjected, innerProjected } = uvData;

            // Convert 2D projected paths back to 3D for the paving region
            const to3D = (p: { x: number; y: number }) =>
                origin.clone()
                    .add(uAxis.clone().multiplyScalar(p.x))
                    .add(vAxis.clone().multiplyScalar(p.y));

            // Create a straight paving (直铺) region covering the entire ground face
            const region = new PresetRegion(
                outerProjected.map(to3D),
                innerProjected.map(inner => inner.map(to3D)),
                'zhipu',
            );
            region.pattern!.tileWidth  = 0.6;
            region.pattern!.tileHeight = 0.6;
            region.pattern!.gap        = 0.003;

            material.regions = [region];
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
                linkWall: wall,
                type: FurnitureType.Window
            },{
                position: new THREE.Vector3(5, 0, 0),
                rotation: new THREE.Euler(0, 0, -Math.PI / 2),
                scale: new THREE.Vector3(1, 1, 1),
                linkWall: wall2,
                type: FurnitureType.Door
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
            furniture.modelType = furnitureData.type;
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

    const closetJSON = require('@designer/assets/closet.json');
    const closet = new ParametricModelV2(closetJSON);
    closet.position = new THREE.Vector3(-0.1, 0.6, 0);
    closet.rotation = new THREE.Euler(0, 0, Math.PI);
    floor.addParametricV2(closet);
}
