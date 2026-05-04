import * as THREE from 'three';

/**
 * Material class for managing 3D material data.
 * Extends THREE.EventDispatcher to provide event handling capabilities.
 */
export class Material extends THREE.EventDispatcher<any> {
  protected _id: string;
  protected _name: string;
  protected _color: THREE.Color;
  protected _metalness: number;
  protected _roughness: number;
  protected _transparent: boolean;
  protected _opacity: number;
  protected _isDirty: boolean;

  constructor(options?: {
    id?: string;
    name?: string;
    color?: THREE.Color | string | number;
    metalness?: number;
    roughness?: number;
    transparent?: boolean;
    opacity?: number;
  }) {
    super();
    
    this._id = options?.id || this.generateId();
    this._name = options?.name || 'Default Material';
    this._color = new THREE.Color(options?.color || 0xcccccc);
    this._metalness = options?.metalness ?? 0.0;
    this._roughness = options?.roughness ?? 0.5;
    this._transparent = options?.transparent ?? false;
    this._opacity = options?.opacity ?? 1.0;
    this._isDirty = false;
  }

  /**
   * Gets the unique identifier for this material
   */
  get id(): string {
    return this._id;
  }

  /**
   * Gets or sets the material name
   */
  get name(): string {
    return this._name;
  }

  set name(value: string) {
    if (this._name !== value) {
      this._name = value;
      this.markDirty();
    }
  }

  /**
   * Gets or sets the material color
   */
  get color(): THREE.Color {
    return this._color;
  }

  set color(value: THREE.Color | string | number) {
    this._color.set(value);
    this.markDirty();
  }

  /**
   * Gets or sets the metalness property (0-1)
   */
  get metalness(): number {
    return this._metalness;
  }

  set metalness(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    if (this._metalness !== clampedValue) {
      this._metalness = clampedValue;
      this.markDirty();
    }
  }

  /**
   * Gets or sets the roughness property (0-1)
   */
  get roughness(): number {
    return this._roughness;
  }

  set roughness(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    if (this._roughness !== clampedValue) {
      this._roughness = clampedValue;
      this.markDirty();
    }
  }

  /**
   * Gets or sets whether the material is transparent
   */
  get transparent(): boolean {
    return this._transparent;
  }

  set transparent(value: boolean) {
    if (this._transparent !== value) {
      this._transparent = value;
      this.markDirty();
    }
  }

  /**
   * Gets or sets the opacity (0-1)
   */
  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    const clampedValue = Math.max(0, Math.min(1, value));
    if (this._opacity !== clampedValue) {
      this._opacity = clampedValue;
      this.markDirty();
    }
  }

  /**
   * Gets whether the material has been modified since last clean state
   */
  get isDirty(): boolean {
    return this._isDirty;
  }

  /**
   * Marks the material as dirty and dispatches a change event
   */
  protected markDirty(): void {
    this._isDirty = true;
    this.dispatchEvent({ type: 'change', target: this });
  }

  /**
   * Marks the material as clean (no pending changes)
   */
  clean(): void {
    this._isDirty = false;
  }

  /**
   * Creates a THREE.Material instance from this material's properties
   */
  toThreeMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: this._color.clone(),
      metalness: this._metalness,
      roughness: this._roughness,
      transparent: this._transparent,
      opacity: this._opacity,
    });
  }

  /**
   * Updates this material's properties from a THREE.Material instance
   */
  fromThreeMaterial(material: THREE.Material): void {
    if (material instanceof THREE.MeshStandardMaterial) {
      this._color.copy(material.color);
      this._metalness = material.metalness;
      this._roughness = material.roughness;
      this._transparent = material.transparent;
      this._opacity = material.opacity;
      this.markDirty();
    }
  }

  /**
   * Generates a unique ID for the material
   */
  private generateId(): string {
    return `material_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
