import * as THREE from 'three';
import { ModelRegistry } from '../ModelRegistry';

/**
  * Base class for all data models in the core/model directory.
  * Provides common functionality like event dispatching and dirty tracking.
  */
export abstract class BaseModel extends THREE.EventDispatcher<any> {
    protected _id: string;

    protected _isDirty: boolean;

    protected _children: BaseModel[];

    constructor(id?: string) {
        super();
        this._id = id || this.generateId();
        this._isDirty = false;
        this._children = [];
        ModelRegistry.getInstance().dispatchEvent({ type: 'createModel', model: this });
    }

    /**
      * Gets the unique identifier for this model
      */
    get id(): string {
        return this._id;
    }

    /**
      * Gets the child models of this model
      */
    get children(): BaseModel[] {
        return this._children;
    }

    /**
      * Gets whether the model has been modified since last clean state
      */
    get isDirty(): boolean {
        return this._isDirty;
    }

    /**
      * Adds a child model and dispatches an addChild event
      */
    addChild(child: BaseModel): void {
        if (this._children.find(c => c.id === child.id)) {
            console.warn(`Child with id '${child.id}' is already added.`);
            return;
        }
        this._children.push(child);
        this.dispatchEvent({ type: 'addChild', child, parent: this });
    }

    /**
      * Removes a child model by instance or id, dispatches a dispose event on the child,
      * and then dispatches a removeChild event
      */
    removeChild(child: BaseModel | string): void {
        const childId = typeof child === 'string' ? child : child.id;
        const index = this._children.findIndex(c => c.id === childId);
        if (index === -1) {
            console.warn(`Child with id '${childId}' is not found.`);
            return;
        }
        const target = this._children[index];
        this._children.splice(index, 1);
        target.dispose();
        this.dispatchEvent({ type: 'removeChild', child: target, parent: this });
    }

    /**
      * Dispatches a dispose event to notify listeners that this model is being disposed
      */
    dispose(): void {
        this.dispatchEvent({ type: 'dispose', target: this });
    }

    /**
      * Marks the model as dirty and dispatches a change event
      */
    protected markDirty(): void {
        this._isDirty = true;
        this.dispatchEvent({ type: 'change', target: this });
    }

    /**
      * Marks the model as clean (no pending changes)
      */
    clean(): void {
        this._isDirty = false;
    }

    /**
      * Generates a unique ID for the model
      */
    private generateId(): string {
        return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
