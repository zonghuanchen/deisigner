import * as THREE from 'three';
import { BaseModel } from './BaseModel';
import { FaceModel } from './FaceModel';
import { WallModel } from './WallModel';
import { ModelRegistry } from '../ModelRegistry';
import { ROOM_MODEL } from '../types';

export interface RoomChangeEvent {
    type: 'change';
    room: RoomModel;
}

export type RoomChangeListener = (event: RoomChangeEvent) => void;

export interface RoomEventMap {
    change: RoomChangeEvent;
}

/**
  * Represents a room in a building.
  * A room is defined by a closed 2D outer contour and a height, and contains
  * a ground face (at z = 0) and a ceiling face (at z = height). Both faces are
  * FaceModel instances and are managed as child models of this room.
  */
export class RoomModel extends BaseModel {
    private _outerContour: THREE.Vector2[] = [];
    private _innerContours: THREE.Vector2[][] = [];
    private _height: number;
    private _groundFace!: FaceModel;
    private _ceilingFace!: FaceModel;
    private _linkWalls: WallModel[] = [];

    constructor(
        outerContour: THREE.Vector2[] = [],
        height: number = 2.8,
        innerContours: THREE.Vector2[][] = [],
        linkWalls: WallModel[] = [],
        id?: string
    ) {
        // Don't dispatch create event in super() - we'll do it after setting properties
        super(id, false);
        
        // Now set all properties
        this._outerContour = outerContour.map(p => p.clone());
        this._innerContours = innerContours.map(contour =>
            contour.map(p => p.clone())
        );
        this._height = height;
        this._linkWalls = [...linkWalls];

        this._groundFace = new FaceModel();
        this._ceilingFace = new FaceModel();
        this.addChild(this._groundFace);
        this.addChild(this._ceilingFace);

        this.updateFaces();
        
        // Now dispatch the create event so ModelRegistry can create display objects
        this.dispatchCreateModel();
    }

    /**
      * Gets the room's outer contour (in XY plane)
      */
    get outerContour(): THREE.Vector2[] {
        return this._outerContour;
    }

    /**
      * Sets the room's outer contour
      */
    set outerContour(value: THREE.Vector2[]) {
        this._outerContour = value.map(p => p.clone());
        this.dirty();
    }

    /**
      * Gets the room's inner contours (holes in the floor/ceiling)
      */
    get innerContours(): THREE.Vector2[][] {
        return this._innerContours;
    }

    /**
      * Sets the room's inner contours
      */
    set innerContours(value: THREE.Vector2[][]) {
        this._innerContours = value.map(contour =>
            contour.map(p => p.clone())
        );
        this.dirty();
    }

    /**
      * Gets the room height (ceiling elevation relative to the ground)
      */
    get height(): number {
        return this._height;
    }

    /**
      * Sets the room height
      */
    set height(value: number) {
        if (this._height !== value) {
            this._height = value;
            this.dirty();
        }
    }

    /**
      * Gets the ground face (floor surface at z = 0)
      */
    get groundFace(): FaceModel {
        return this._groundFace;
    }

    /**
      * Gets the ceiling face (top surface at z = height)
      */
    get ceilingFace(): FaceModel {
        return this._ceilingFace;
    }

    /**
      * Gets the walls that enclose this room.
      * Returns a shallow copy so callers cannot mutate the internal list.
      */
    get linkWalls(): WallModel[] {
        return [...this._linkWalls];
    }

    /**
      * Replaces the set of walls that enclose this room.
      * Duplicates (by id) are removed.
      */
    set linkWalls(value: WallModel[]) {
        const seen = new Set<string>();
        const unique: WallModel[] = [];
        for (const wall of value) {
            if (seen.has(wall.id)) continue;
            seen.add(wall.id);
            unique.push(wall);
        }
        this._linkWalls = unique;
        this.dirty();
    }

    /**
      * Adds a wall to the enclosing set. No-op if the wall is already linked.
      */
    addLinkWall(wall: WallModel): void {
        if (this._linkWalls.some(w => w.id === wall.id)) return;
        this._linkWalls.push(wall);
        this.dirty();
    }

    /**
      * Removes a wall from the enclosing set by instance or id.
      */
    removeLinkWall(wall: WallModel | string): void {
        const wallId = typeof wall === 'string' ? wall : wall.id;
        const index = this._linkWalls.findIndex(w => w.id === wallId);
        if (index === -1) return;
        this._linkWalls.splice(index, 1);
        this.dirty();
    }

    /**
      * Checks whether the given wall (by instance or id) is part of the
      * enclosing wall set of this room.
      */
    hasLinkWall(wall: WallModel | string): boolean {
        const wallId = typeof wall === 'string' ? wall : wall.id;
        return this._linkWalls.some(w => w.id === wallId);
    }

    /**
      * Clears all linked walls from this room.
      */
    clearLinkWalls(): void {
        if (this._linkWalls.length === 0) return;
        this._linkWalls = [];
        this.dirty();
    }

    /**
      * Triggers a change event and rebuilds the ground/ceiling faces
      */
    dirty(): void {
        this._isDirty = true;
        this.updateFaces();
        this.dispatchEvent({ type: 'change', room: this });
    }

    /**
      * Rebuilds the 3D outer/inner contours of the ground and ceiling faces
      * from the room's 2D outer contour and height.
      */
    private updateFaces(): void {
        const groundOuter = this._outerContour.map(
            p => new THREE.Vector3(p.x, p.y, 0)
        );
        const ceilingOuter = this._outerContour
            .slice()
            .reverse()
            .map(p => new THREE.Vector3(p.x, p.y, this._height));

        const groundInner = this._innerContours.map(contour =>
            contour.map(p => new THREE.Vector3(p.x, p.y, 0))
        );
        const ceilingInner = this._innerContours.map(contour =>
            contour
                .slice()
                .reverse()
                .map(p => new THREE.Vector3(p.x, p.y, this._height))
        );

        this._groundFace.outerContour = groundOuter;
        this._groundFace.innerContours = groundInner;
        this._ceilingFace.outerContour = ceilingOuter;
        this._ceilingFace.innerContours = ceilingInner;
    }
}

// Register the model
ModelRegistry.getInstance().register(ROOM_MODEL, RoomModel);
