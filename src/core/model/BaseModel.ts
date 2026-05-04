import * as THREE from 'three';


/**
 * Base class for all data models in the core/model directory.
 * Provides common functionality like event dispatching and dirty tracking.
 */
export abstract class BaseModel extends THREE.EventDispatcher<any> {
  protected _id: string;

  protected _isDirty: boolean;

  constructor(id?: string) {
    super();
    this._id = id || this.generateId();
    this._isDirty = false;
  }

  /**
   * Gets the unique identifier for this model
   */
  get id(): string {
    return this._id;
  }



  /**
   * Gets whether the model has been modified since last clean state
   */
  get isDirty(): boolean {
    return this._isDirty;
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
