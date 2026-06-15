import * as THREE from 'three';
import type { BaseRegion } from '../pave/Region';

/**
 * Paving pattern types
 */
export type PavePattern = 'straight' | 'brick' | 'herringbone' | 'diagonal';

/**
 * Pave data describing tile-paving layout on a surface.
 */
export interface PaveData {
    /** Whether paving is enabled */
    enabled: boolean;
    /** Tile width in world units */
    tileWidth: number;
    /** Tile height in world units */
    tileHeight: number;
    /** Gap (grout line) between tiles in world units */
    gap: number;
    /** Paving pattern */
    pattern: PavePattern;
    /** Rotation of the paving pattern in radians */
    rotation: number;
    /** U offset of the paving origin in world units */
    offsetU: number;
    /** V offset of the paving origin in world units */
    offsetV: number;
}

/** Default pave settings */
export const DEFAULT_PAVE: PaveData = {
    enabled: false,
    tileWidth: 0.6,
    tileHeight: 0.6,
    gap: 0.002,
    pattern: 'straight',
    rotation: 0,
    offsetU: 0,
    offsetV: 0,
};

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
    protected _map: THREE.Texture | null;
    protected _normalMap: THREE.Texture | null;
    protected _roughnessMap: THREE.Texture | null;
    protected _metalnessMap: THREE.Texture | null;
    protected _isDirty: boolean;
    protected _pave: PaveData;
    protected _regions: BaseRegion[] = [];

    constructor(options?: {
        id?: string;
        name?: string;
        color?: THREE.Color | string | number;
        metalness?: number;
        roughness?: number;
        transparent?: boolean;
        opacity?: number;
        map?: THREE.Texture | null;
        normalMap?: THREE.Texture | null;
        roughnessMap?: THREE.Texture | null;
        metalnessMap?: THREE.Texture | null;
        pave?: Partial<PaveData>;
    }) {
        super();
        
        this._id = options?.id || this.generateId();
        this._name = options?.name || 'Default Material';
        this._color = new THREE.Color(options?.color || 0xcccccc);
        this._metalness = options?.metalness ?? 0.0;
        this._roughness = options?.roughness ?? 0.5;
        this._transparent = options?.transparent ?? false;
        this._opacity = options?.opacity ?? 1.0;
        this._map = options?.map ?? null;
        this._normalMap = options?.normalMap ?? null;
        this._roughnessMap = options?.roughnessMap ?? null;
        this._metalnessMap = options?.metalnessMap ?? null;
        this._isDirty = false;
        this._pave = { ...DEFAULT_PAVE, ...options?.pave };
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
      * Gets or sets the main texture map (albedo/diffuse)
      */
    get map(): THREE.Texture | null {
        return this._map;
    }

    set map(value: THREE.Texture | null) {
        if (this._map !== value) {
            this._map = value;
            this.markDirty();
        }
    }

    /**
      * Gets or sets the normal map texture
      */
    get normalMap(): THREE.Texture | null {
        return this._normalMap;
    }

    set normalMap(value: THREE.Texture | null) {
        if (this._normalMap !== value) {
            this._normalMap = value;
            this.markDirty();
        }
    }

    /**
      * Gets or sets the roughness map texture
      */
    get roughnessMap(): THREE.Texture | null {
        return this._roughnessMap;
    }

    set roughnessMap(value: THREE.Texture | null) {
        if (this._roughnessMap !== value) {
            this._roughnessMap = value;
            this.markDirty();
        }
    }

    /**
      * Gets or sets the metalness map texture
      */
    get metalnessMap(): THREE.Texture | null {
        return this._metalnessMap;
    }

    set metalnessMap(value: THREE.Texture | null) {
        if (this._metalnessMap !== value) {
            this._metalnessMap = value;
            this.markDirty();
        }
    }

    /**
      * Gets or sets the pave (tiling layout) data
      */
    get pave(): PaveData {
        return this._pave;
    }

    set pave(value: Partial<PaveData>) {
        this._pave = { ...this._pave, ...value };
        this.markDirty();
    }

    /**
     * Gets or sets the paving regions for this material.
     * Each region defines a sub-area with its own tile pattern.
     * When regions.length > 0 the face uses regional paving;
     * when empty, the entire face uses the default material.
     */
    get regions(): BaseRegion[] {
        return this._regions;
    }

    set regions(value: BaseRegion[]) {
        this._regions = value;
        this.markDirty();
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
            map: this._map,
            normalMap: this._normalMap,
            roughnessMap: this._roughnessMap,
            metalnessMap: this._metalnessMap,
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
            this._map = material.map ?? null;
            this._normalMap = material.normalMap ?? null;
            this._roughnessMap = material.roughnessMap ?? null;
            this._metalnessMap = material.metalnessMap ?? null;
            this.markDirty();
        }
    }

    /**
      * Generates a unique ID for the material
      */
    private generateId(): string {
        return `material_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Serializes a THREE.Texture to a UI-friendly object.
     * Returns null if the texture is not set.
     */
    private serializeTexture(texture: THREE.Texture | null): Record<string, any> | null {
        if (!texture) return null;
        const result: Record<string, any> = {
            name: texture.name || null,
            uuid: texture.uuid,
        };
        // Extract image source if available
        if (texture.image instanceof HTMLImageElement) {
            result.src = texture.image.src;
        } else if (texture.image instanceof HTMLCanvasElement) {
            result.src = texture.image.toDataURL();
        }
        return result;
    }

    getUI(): Record<string, any> {
        return {
            id: this._id,
            name: this._name,
            color: '#' + this._color.getHexString(),
            metalness: this._metalness,
            roughness: this._roughness,
            transparent: this._transparent,
            opacity: this._opacity,
            map: this.serializeTexture(this._map),
            pave: { ...this._pave },
        };
    }
}
