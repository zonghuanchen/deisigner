import * as THREE from 'three';
import { BaseModel } from '../../../core/model/BaseModel';

/**
  * Abstract base class for all 3D display objects.
  * Manages a static registry mapping model ids to their corresponding DisplayObject3D instances.
  */
export abstract class DisplayObject3D<TModel extends BaseModel = BaseModel> {
    private static readonly displayMap = new Map<string, DisplayObject3D>();

    protected model: TModel;
    protected _node: THREE.Object3D;

    constructor(model: TModel, node: THREE.Object3D) {
        this.model = model;
        this._node = node;
        DisplayObject3D.add(this.model.id, this);

        // Sync existing child models to this display node
        this.syncChildren();

        // Listen for child model additions/removals
        this.model.addEventListener('addChild', this.onModelAddChild.bind(this));
        this.model.addEventListener('removeChild', this.onModelRemoveChild.bind(this));
    }

    private syncChildren(): void {
        for (const child of this.model.children) {
            const childDisplay = DisplayObject3D.get(child.id);
            if (childDisplay) {
                this._node.add(childDisplay.node);
            }
        }
    }

    private onModelAddChild(event: any): void {
        const childDisplay = DisplayObject3D.get(event.child.id);
        if (childDisplay) {
            this._node.add(childDisplay.node);
        }
    }

    private onModelRemoveChild(event: any): void {
        const childDisplay = DisplayObject3D.get(event.child.id);
        if (childDisplay) {
            this._node.remove(childDisplay.node);
        }
    }

    /** The concrete Three.js node (Mesh, Group, etc.) representing this display object */
    get node(): THREE.Object3D {
        return this._node;
    }

    /**
      * Add a display object to the static map
      */
    static add(id: string, displayObject: DisplayObject3D): void {
        if (DisplayObject3D.displayMap.has(id)) {
            console.warn(`DisplayObject3D with id '${id}' is already added.`);
            return;
        }
        DisplayObject3D.displayMap.set(id, displayObject);
    }

    /**
      * Remove a display object from the static map by id
      */
    static remove(id: string): void {
        if (!DisplayObject3D.displayMap.has(id)) {
            console.warn(`DisplayObject3D with id '${id}' is not found.`);
            return;
        }
        DisplayObject3D.displayMap.delete(id);
    }

    /**
      * Get a display object from the static map by id
      */
    static get(id: string): DisplayObject3D | undefined {
        return DisplayObject3D.displayMap.get(id);
    }

    /**
      * Check if a display object exists in the static map
      */
    static has(id: string): boolean {
        return DisplayObject3D.displayMap.has(id);
    }

    /**
      * Get all ids in the static map
      */
    static getAllIds(): string[] {
        return Array.from(DisplayObject3D.displayMap.keys());
    }

    /**
      * Get all display objects in the static map
      */
    static getAll(): DisplayObject3D[] {
        return Array.from(DisplayObject3D.displayMap.values());
    }

    /**
      * Dispose this display object, removing it from the map
      */
    dispose(): void {
        DisplayObject3D.remove(this.model.id);
    }
}
