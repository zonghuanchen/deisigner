import * as THREE from 'three';
import { SelectionManager } from '../../core';
import { DisplayObject3D } from './display/DisplayObject3D';
import { Scene } from './display/Scene';

/**
 * Device handles canvas interaction: raycasting, picking, and selection.
 * Drag-to-move logic is handled by MoveModelCommand, activated via
 * SelectionManager 'select' events on pointerdown.
 */
export class Device {
    private raycaster = new THREE.Raycaster();
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;
    private selectionManager: SelectionManager;

    constructor(
        camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        selectionManager: SelectionManager,
    ) {
        this.camera = camera;
        this.domElement = domElement;
        this.selectionManager = selectionManager;

        this.setupPicking();
    }

    private setupPicking() {
        // Select on pointerdown so MoveModelCommand can capture the initial
        // pointer position and handle drag on subsequent pointermove events.
        this.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
            const model = this.raycast(e);
            if (model) {
                const alreadySelected = this.selectionManager.isSelected(model);
                this.selectionManager.select(model);
                // When the model is already selected, SelectionManager.select()
                // returns early without dispatching 'select'.  Re-dispatch it
                // so MoveModelCommand is (re-)activated for the new drag gesture.
                if (alreadySelected) {
                    this.selectionManager.dispatchEvent({ type: 'select', model });
                }
            }
        });

        // Clear selection on pointerup over empty space.
        // If a model was selected on pointerdown, MoveModelCommand is already
        // active and will complete itself on pointerup via its own handler.
        this.domElement.addEventListener('pointerup', (e: PointerEvent) => {
            const model = this.raycast(e);
            if (!model) {
                this.selectionManager.clear();
            }
        });
    }

    /**
     * Casts a ray from the camera through the pointer position and returns
     * the model associated with the first visible mesh hit, or null.
     */
    private raycast(event: PointerEvent): import('../../core/model/BaseModel').BaseModel | null {
        const rect = this.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, this.camera);

        const pickables: THREE.Object3D[] = [];
        for (const display of DisplayObject3D.getAll()) {
            if (!(display instanceof Scene) && display.node.visible) {
                pickables.push(display.node);
            }
        }

        const intersects = this.raycaster.intersectObjects(pickables, true)
            .filter(hit => this.isVisible(hit.object));
        if (intersects.length === 0) return null;

        const display = this.findDisplayObject(intersects[0].object);
        return display ? display.modelRef : null;
    }

    /** Walks up the scene graph to find the DisplayObject3D that owns the given object */
    private findDisplayObject(object: THREE.Object3D): DisplayObject3D | undefined {
        let current: THREE.Object3D | null = object;
        while (current) {
            for (const display of DisplayObject3D.getAll()) {
                if (display.node === current) return display;
            }
            current = current.parent;
        }
        return undefined;
    }

    /** Returns false if the object or any ancestor is invisible */
    private isVisible(object: THREE.Object3D): boolean {
        let current: THREE.Object3D | null = object;
        while (current) {
            if (!current.visible) return false;
            current = current.parent;
        }
        return true;
    }
}
