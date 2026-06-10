import * as THREE from 'three';
import { SelectionManager } from '@designer/core';
import { DisplayObject3D } from './display/DisplayObject3D';
import { Scene } from './display/Scene';

/** Click detection thresholds */
const CLICK_MAX_TIME_MS = 300;
const CLICK_MAX_DISTANCE_MM = 10; // world-space 10mm
/** Drag threshold in screen pixels – once exceeded, fire dragstart */
const DRAG_THRESHOLD_PX = 3;

/**
 * Device handles canvas interaction: raycasting, picking, and selection.
 * Uses a deferred-selection pattern: pointerdown raycasts and stores the hit,
 * pointerup only triggers selection if time < 300ms and 2D world-space
 * distance < 10mm (prevents accidental selection during orbit / drag).
 * Drag-to-move is handled by MoveModelCommand, activated via selection
 * dispatch on pointermove once the click threshold is exceeded.
 */
export class Device {
    private raycaster = new THREE.Raycaster();
    private camera: THREE.PerspectiveCamera;
    private domElement: HTMLElement;
    private selectionManager: SelectionManager;

    // Deferred-selection state
    private pendingHit: import('@designer/core/model/BaseModel').BaseModel | null = null;
    private pointerDownTime = 0;
    private pointerDownClientX = 0;
    private pointerDownClientY = 0;
    private pointerDownNdcX = 0;
    private pointerDownNdcY = 0;
    private dragInitiated = false;

    constructor(
        camera: THREE.PerspectiveCamera,
        domElement: HTMLElement,
        selectionManager: SelectionManager,
    ) {
        this.camera = camera;
        this.domElement = domElement;
        this.selectionManager = selectionManager;

        // ESC to clear selection
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.selectionManager.clear();
            }
        });

        this.setupPicking();
    }

    private setupPicking() {
        this.domElement.addEventListener('pointerdown', (e: PointerEvent) => {
            this.pendingHit = this.raycast(e);
            this.pointerDownTime = performance.now();
            this.pointerDownClientX = e.clientX;
            this.pointerDownClientY = e.clientY;
            const ndc = this.clientToNdc(e);
            this.pointerDownNdcX = ndc.x;
            this.pointerDownNdcY = ndc.y;
            this.dragInitiated = false;
        });

        this.domElement.addEventListener('pointermove', (e: PointerEvent) => {
            if (!this.pendingHit || this.dragInitiated) return;
            // Detect drag: pointer is down and moved beyond threshold
            if (
                Math.abs(e.clientX - this.pointerDownClientX) > DRAG_THRESHOLD_PX ||
                Math.abs(e.clientY - this.pointerDownClientY) > DRAG_THRESHOLD_PX
            ) {
                this.dragInitiated = true;
                // Select the model immediately so drag handler can proceed
                // this.selectionManager.select(this.pendingHit);
                this.domElement.dispatchEvent(new CustomEvent('dragstart', {
                    detail: {
                        model: this.pendingHit,
                        clientX: e.clientX,
                        clientY: e.clientY,
                    },
                }));
            }
        });

        this.domElement.addEventListener('pointerup', (e: PointerEvent) => {
            if (this.dragInitiated) {
                // Drag was handled by MoveModelCommand's own pointerup
                this.pendingHit = null;
                this.dragInitiated = false;
                return;
            }

            if (this.pendingHit && this.isClick(e)) {
                const alreadySelected = this.selectionManager.isSelected(this.pendingHit);
                this.selectionManager.select(this.pendingHit);
                if (alreadySelected) {
                    this.selectionManager.dispatchEvent({ type: 'select', model: this.pendingHit });
                }
            } else if (!this.pendingHit) {
                // pointerdown missed – check pointerup too, clear if still empty
                const model = this.raycast(e);
                if (!model) {
                    this.selectionManager.clear();
                }
            }

            this.pendingHit = null;
            this.dragInitiated = false;
        });
    }

    /** Returns true if the pointer event is within click thresholds (time & distance). */
    private isClick(e: PointerEvent): boolean {
        const dt = performance.now() - this.pointerDownTime;
        if (dt > CLICK_MAX_TIME_MS) return false;
        const worldDist = this.screenDistanceToWorld(e);
        return worldDist < CLICK_MAX_DISTANCE_MM;
    }

    /** Converts client coords to NDC */
    private clientToNdc(e: PointerEvent): { x: number; y: number } {
        const rect = this.domElement.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
            y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
        };
    }

    /**
     * Returns the world-space distance (in mm) between the stored pointerdown
     * position and the current pointer event, projected onto the camera near plane.
     */
    private screenDistanceToWorld(e: PointerEvent): number {
        const ndc = this.clientToNdc(e);
        const near = this.camera.near;
        const v1 = new THREE.Vector3(this.pointerDownNdcX, this.pointerDownNdcY, 0).unproject(this.camera);
        const v2 = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(this.camera);
        const dir1 = v1.sub(this.camera.position).normalize();
        const dir2 = v2.sub(this.camera.position).normalize();
        const p1 = this.camera.position.clone().add(dir1.multiplyScalar(near));
        const p2 = this.camera.position.clone().add(dir2.multiplyScalar(near));
        return p1.distanceTo(p2) * 1000; // meters → mm
    }

    /**
     * Casts a ray from the camera through the pointer position and returns
     * the model associated with the first visible mesh hit, or null.
     */
    private raycast(event: PointerEvent): import('@designer/core/model/BaseModel').BaseModel | null {
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
