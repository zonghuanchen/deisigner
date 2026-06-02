import * as THREE from 'three';
import { App, CameraModel, SelectionManager } from '../../core';
import { FurnitureModel } from '../../core/model/FurnitureModel';
import { ParametricModel } from '../../core/model/ParametricModel';
import { DisplayObject3D } from './display/DisplayObject3D';
import { Scene } from './display/Scene';
import { Scene3DManager } from './Scene3DManager';
import { computeDragOffset, computeDragPositionWithOffset } from './util/dragHelper';

/**
 * Device handles canvas interaction: raycasting, picking, and selection.
 */
/** Model types that support drag-to-move */
type DraggableModel = FurnitureModel | ParametricModel;

function isDraggable(model: any): model is DraggableModel {
    return model instanceof FurnitureModel || model instanceof ParametricModel;
}

export class Device {
    private raycaster = new THREE.Raycaster();
    private pointerDown = new THREE.Vector2();
    private isDragging = false;
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;
    private selectionManager: SelectionManager;

    // Drag state
    private dragModel: DraggableModel | null = null;
    private dragOffset: THREE.Vector3 | null = null;
    private cameraModel: CameraModel | null = null;

    constructor(
        camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        selectionManager: SelectionManager,
    ) {
        this.camera = camera;
        this.domElement = domElement;
        this.selectionManager = selectionManager;

        // Get the active CameraModel for drag computations
        const cameraManager = App.getInstance().getCameraManager();
        if (cameraManager) {
            this.cameraModel = cameraManager.getActiveCamera();
        }

        this.setupPicking();
    }

    private setupPicking() {
        this.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
            this.pointerDown.set(e.clientX, e.clientY);
            this.isDragging = false;
            this.tryStartDrag(e);
        });
        this.domElement.addEventListener('pointermove', (e: PointerEvent) => {
            if (Math.abs(e.clientX - this.pointerDown.x) > 3 || Math.abs(e.clientY - this.pointerDown.y) > 3) {
                this.isDragging = true;
            }
            this.updateDrag(e);
        });
        this.domElement.addEventListener('pointerup', (e: PointerEvent) => {
            const wasDragging = this.endDrag();
            if (this.isDragging || wasDragging) return;
            this.onPointerClick(e);
        });
    }

    /**
     * If the pointer-down hits a draggable model, select it and prepare for dragging.
     * Orbit controls are disabled immediately on pointer-down over a draggable model
     * to prevent camera movement from causing a position jump.
     */
    private tryStartDrag(e: PointerEvent): void {
        if (!this.cameraModel) return;

        const rect = this.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
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
        if (intersects.length === 0) return;

        const display = this.findDisplayObject(intersects[0].object);
        if (!display) return;

        const model = display.modelRef;
        if (!isDraggable(model)) return;

        // Select the model immediately on pointer-down so first-drag works
        if (!this.selectionManager.isSelected(model)) {
            this.selectionManager.select(model);
        }

        // Disable orbit controls immediately to prevent camera movement during drag
        const controls = Scene3DManager.getInstance().getControls();
        if (controls) {
            controls.raw.enabled = false;
        }

        const offset = computeDragOffset(
            model.position,
            e.clientX - rect.left,
            e.clientY - rect.top,
            rect.width,
            rect.height,
            this.cameraModel,
        );
        if (!offset) return;

        this.dragModel = model;
        this.dragOffset = offset;
    }

    /**
     * While dragging, update the model position based on the current pointer position.
     */
    private updateDrag(e: PointerEvent): void {
        if (!this.dragModel || !this.dragOffset || !this.cameraModel) return;

        const rect = this.domElement.getBoundingClientRect();
        const newPos = computeDragPositionWithOffset(
            this.dragOffset,
            this.dragModel.position,
            e.clientX - rect.left,
            e.clientY - rect.top,
            rect.width,
            rect.height,
            this.cameraModel,
        );
        if (newPos) {
            this.dragModel.position = newPos;
        }
    }

    /**
     * End the current drag operation and re-enable orbit controls.
     * @returns true if a drag was in progress
     */
    private endDrag(): boolean {
        const wasDragging = this.dragModel !== null;
        if (wasDragging) {
            this.dragModel = null;
            this.dragOffset = null;
        }

        // Always re-enable orbit controls when pointer is released over a draggable
        const controls = Scene3DManager.getInstance().getControls();
        if (controls) {
            controls.raw.enabled = true;
        }
        return wasDragging;
    }

    private onPointerClick(event: PointerEvent) {
        const rect = this.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        this.raycaster.setFromCamera(mouse, this.camera);

        // Collect all pickable objects (exclude Scene root and invisible nodes)
        const pickables: THREE.Object3D[] = [];
        for (const display of DisplayObject3D.getAll()) {
            if (!(display instanceof Scene) && display.node.visible) {
                pickables.push(display.node);
            }
        }

        const intersects = this.raycaster.intersectObjects(pickables, true)
            .filter(hit => this.isVisible(hit.object));
        if (intersects.length > 0) {
            const display = this.findDisplayObject(intersects[0].object);
            if (display) {
                this.selectionManager.select(display.modelRef);
                return;
            }
        }
        // Clicked empty space — clear selection
        this.selectionManager.clear();
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
