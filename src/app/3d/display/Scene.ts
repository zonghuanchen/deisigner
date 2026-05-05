import * as THREE from 'three';
import { DisplayObject3D } from './DisplayObject3D';
import { SceneModel } from '../../../core/model/SceneModel';
import { WallModel } from '../../../core/model/WallModel';
import { ModelRegistry } from '../../../core/ModelRegistry';
import { SCENE_MODEL } from '../../../core/types';

/**
 * 3D display object for a SceneModel.
 * Manages a THREE.Group that contains all child display objects (walls, etc.).
 */
export class Scene extends DisplayObject3D<SceneModel> {
    private childDisplays: Map<string, DisplayObject3D>;

    constructor(model: SceneModel) {
        super(model, new THREE.Group());
        this.childDisplays = new Map();

        // Listen for child model additions/removals
        this.model.addEventListener('addChild', this.onAddChild.bind(this));
        this.model.addEventListener('removeChild', this.onRemoveChild.bind(this));

        // Initialize existing children
        for (const child of this.model.children) {
            this.createChildDisplay(child);
        }
    }

    private onAddChild(event: any): void {
        this.createChildDisplay(event.child);
    }

    private onRemoveChild(event: any): void {
        this.removeChildDisplay(event.child.id);
    }

    private createChildDisplay(childModel: any): void {
        if (childModel instanceof WallModel) {
            // TODO: Create Wall3D display object when available
            console.warn('Wall3D display object not yet implemented for wall:', childModel.id);
            return;
        }
        console.warn('Unsupported child model type in Scene:', childModel.constructor.name);
    }

    private removeChildDisplay(childId: string): void {
        const display = this.childDisplays.get(childId);
        if (display) {
            (this.node as THREE.Group).remove(display.node);
            display.dispose();
            this.childDisplays.delete(childId);
        }
    }

    /**
     * Gets the underlying THREE.Group
     */
    get group(): THREE.Group {
        return this.node as THREE.Group;
    }

    /**
     * Dispose this scene and all child display objects
     */
    dispose(): void {
        for (const [id, display] of this.childDisplays) {
            display.dispose();
        }
        this.childDisplays.clear();
        super.dispose();
    }
}

// Register the 3D display model
ModelRegistry.getInstance().registerDisplay3d(SCENE_MODEL, Scene);
