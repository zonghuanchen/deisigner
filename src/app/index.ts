import * as THREE from 'three';
import { App, BaseModel } from '../core';
import { Scene2D } from './2d';
import { Scene3D } from './3d';
import { VIEWER_2D, VIEWER_3D, ViewerType } from './types';
import { RenderTimer } from './timer';
import { computeDragPosition } from './3d/util/dragHelper';
import { DisplayObject3D } from './3d/display/DisplayObject3D';
import { Scene } from './3d/display/Scene';

export { VIEWER_2D, VIEWER_3D } from './types';
export type { ViewerType } from './types';
export { RenderTimer } from './timer';

export interface AppViewerOptions {
    defaultPrimary?: ViewerType;
}

export class AppViewer {
    private app: App;
    private primary: ViewerType;
    private scene2d: Scene2D | null = null;
    private scene3d: Scene3D | null = null;
    private primaryContainer: HTMLElement | null = null;
    private secondaryContainer: HTMLElement | null = null;
    private renderTimer: RenderTimer;

    /** Last recorded pointer position (viewport-relative clientX/clientY) */
    private lastPointerPosition: { clientX: number; clientY: number } | null = null;
    private boundPointerMove: (e: PointerEvent) => void;
    private boundPointerDown: (e: PointerEvent) => void;

    constructor(options: AppViewerOptions = {}) {
        this.app = App.getInstance();
        this.primary = options.defaultPrimary ?? VIEWER_3D;
        this.renderTimer = new RenderTimer();
        this.boundPointerMove = this.trackPointer.bind(this);
        this.boundPointerDown = this.trackPointer.bind(this);
    }

    async init(primaryContainer: HTMLElement, secondaryContainer: HTMLElement): Promise<void> {
        this.primaryContainer = primaryContainer;
        this.secondaryContainer = secondaryContainer;
        await this.mount();
        this.renderTimer.start();
    }

    /** Returns the last recorded pointer position (viewport-relative). */
    getLastPointerPosition(): { clientX: number; clientY: number } | null {
        return this.lastPointerPosition;
    }

    private trackPointer(e: PointerEvent): void {
        this.lastPointerPosition = { clientX: e.clientX, clientY: e.clientY };
    }

    private attachPointerTracking(): void {
        const canvas = this.scene3d?.getSceneManager().getRenderer().domElement;
        if (canvas) {
            // Use capture phase to ensure tracking fires before Device handlers
            canvas.addEventListener('pointerdown', this.boundPointerDown, true);
            canvas.addEventListener('pointermove', this.boundPointerMove, true);
        }
    }

    private detachPointerTracking(): void {
        const canvas = this.scene3d?.getSceneManager().getRenderer().domElement;
        if (canvas) {
            canvas.removeEventListener('pointerdown', this.boundPointerDown, true);
            canvas.removeEventListener('pointermove', this.boundPointerMove, true);
        }
    }

    private clearContainers(): void {
        if (this.primaryContainer) {
            this.primaryContainer.innerHTML = '';
        }
        if (this.secondaryContainer) {
            this.secondaryContainer.innerHTML = '';
        }
    }

    private async mount(): Promise<void> {
        if (!this.primaryContainer || !this.secondaryContainer) {
            throw new Error('Containers not initialized. Call init() first.');
        }

        this.clearContainers();

        // 3D is always primary (full screen), 2D is always secondary (floating window)
        const container3d = this.primaryContainer;
        const container2d = this.secondaryContainer;

        this.scene2d = Scene2D.getInstance();
        await this.scene2d.init(container2d, this.renderTimer);

        this.scene3d = new Scene3D(container3d, this.renderTimer);
        this.attachPointerTracking();
    }

    async switchPrimary(): Promise<void> {
        this.detachPointerTracking();
        this.primary = this.primary === VIEWER_2D ? VIEWER_3D : VIEWER_2D;
        await this.mount();
    }

    setPrimary(type: ViewerType): Promise<void> | undefined {
        if (this.primary !== type) {
            return this.switchPrimary();
        }
    }

    getPrimary(): ViewerType {
        return this.primary;
    }

    getSecondary(): ViewerType {
        return this.primary === VIEWER_2D ? VIEWER_3D : VIEWER_2D;
    }

    getScene2d(): Scene2D | null {
        return this.scene2d;
    }

    getScene3d(): Scene3D | null {
        return this.scene3d;
    }

    render(): void {
        this.scene3d?.render();
    }

    
    /**
     * Computes a model position in architectural coordinates (Z-up) by casting
     * a ray from the camera through the given screen coordinates and
     * intersecting it with the horizontal plane at the specified Z height.
     *
     * Useful when adding a new model to the scene at a specific screen location.
     *
     * @param clientX  Mouse X in screen pixels (viewport-relative, e.g. from a MouseEvent)
     * @param clientY  Mouse Y in screen pixels (viewport-relative, e.g. from a MouseEvent)
     * @param modelZ   Desired Z height in architectural coordinates (default 0 = ground)
     * @returns        Position in architectural coordinates, or `null` if the ray
     *                 does not intersect the horizontal plane
     */
    getModelPosition(clientX: number, clientY: number, modelZ: number = 0): THREE.Vector3 | null {
        if (!this.scene3d) return null;

        const sceneManager = this.scene3d.getSceneManager();
        const camera = sceneManager.getCamera();
        const canvas = sceneManager.getRenderer().domElement;

        // Convert viewport-relative clientX/clientY to canvas-relative coordinates
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        // Use a temporary position at the desired Z height for plane intersection
        const tempPosition = new THREE.Vector3(0, 0, modelZ);
        const result = computeDragPosition(
            tempPosition,
            x, y,
            canvas.clientWidth, canvas.clientHeight,
            camera,
        );

        return result ? result.position : null;
    }

    /**
     * Picks the model whose mesh is under the given screen coordinates.
     *
     * Casts a ray from the camera through (clientX, clientY) and returns
     * the model associated with the first visible mesh hit.
     *
     * @param clientX  Mouse X in screen pixels (viewport-relative, e.g. from a MouseEvent)
     * @param clientY  Mouse Y in screen pixels (viewport-relative, e.g. from a MouseEvent)
     * @returns        The BaseModel under the pointer, or `null` if nothing was hit
     */
    pickModel(clientX: number, clientY: number): BaseModel | null {
        if (!this.scene3d) return null;

        const sceneManager = this.scene3d.getSceneManager();
        const camera = sceneManager.getCamera();
        const canvas = sceneManager.getRenderer().domElement;

        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1,
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);

        // Collect pickable nodes (exclude Scene root and invisible nodes)
        const pickables: THREE.Object3D[] = [];
        for (const display of DisplayObject3D.getAll()) {
            if (!(display instanceof Scene) && display.node.visible) {
                pickables.push(display.node);
            }
        }

        const intersects = raycaster.intersectObjects(pickables, true)
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

export { Scene2D, Scene3D };
