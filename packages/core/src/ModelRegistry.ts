import * as THREE from 'three';

/**
  * Registry class for data models in the core system.
  * Provides a centralized way to register and retrieve model classes.
  */
export class ModelRegistry extends THREE.EventDispatcher<any> {
    private static instance: ModelRegistry;
    private models: Map<string, any> = new Map();
    private display3dModels: Map<string, any> = new Map();
    private display2dModels: Map<string, any> = new Map();

    private constructor() {
        super();
        this.addEventListener('createModel', this.onCreateModel.bind(this));
    }

    /**
      * Gets the singleton instance of ModelRegistry
      */
    static getInstance(): ModelRegistry {
        if (!ModelRegistry.instance) {
            ModelRegistry.instance = new ModelRegistry();
        }
        return ModelRegistry.instance;
    }

    private onCreateModel(event: any): void {
        const model = event.model;
        if (!model) return;

        for (const [key, ModelClass] of this.models.entries()) {
            if (model instanceof ModelClass) {
                if (this.display3dModels.has(key)) {
                    new (this.display3dModels.get(key))(model);
                }
                if (this.display2dModels.has(key)) {
                    new (this.display2dModels.get(key))(model);
                }
                break;
            }
        }
    }

    /**
      * Registers a model class with a specific key
      * @param key - The unique identifier for the model
      * @param modelClass - The model class to register
      */
    register(key: string, modelClass: any): void {
        if (this.models.has(key)) {
            console.warn(`Model with key '${key}' is already registered. Overwriting.`);
        }
        this.models.set(key, modelClass);
    }

    registerDisplay3d(key: string, displayClass: any): void {
        if (this.display3dModels.has(key)) {
            console.warn(`Model with key '${key}' is already registered. Overwriting.`);
        }
        this.display3dModels.set(key, displayClass);
    }

    registerDisplay2d(key: string, displayClass: any): void {
        if (this.display2dModels.has(key)) {
            console.warn(`Model with key '${key}' is already registered. Overwriting.`);
        }
        this.display2dModels.set(key, displayClass);
    }

    /**
      * Retrieves a registered model class by key
      * @param key - The unique identifier for the model
      * @returns The model class or undefined if not found
      */
    get<T = any>(key: string): T | undefined {
        return this.models.get(key) as T | undefined;
    }

    /**
      * Checks if a model is registered with the given key
      * @param key - The unique identifier to check
      * @returns true if the model is registered, false otherwise
      */
    has(key: string): boolean {
        return this.models.has(key);
    }

    /**
      * Gets all registered model keys
      * @returns Array of registered model keys
      */
    getAllKeys(): string[] {
        return Array.from(this.models.keys());
    }

    /**
      * Clears all registered models
      */
    clear(): void {
        this.models.clear();
    }
}
