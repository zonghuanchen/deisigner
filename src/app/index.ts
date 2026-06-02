import * as THREE from 'three';
import { App } from '../core';
import { Scene2D } from './2d';
import { Scene3D } from './3d';
import { VIEWER_2D, VIEWER_3D, ViewerType } from './types';
import { RenderTimer } from './timer';
import { computeDragPosition } from './3d/util/dragHelper';

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

    constructor(options: AppViewerOptions = {}) {
        this.app = App.getInstance();
        this.primary = options.defaultPrimary ?? VIEWER_3D;
        this.renderTimer = new RenderTimer();
    }

    async init(primaryContainer: HTMLElement, secondaryContainer: HTMLElement): Promise<void> {
        this.primaryContainer = primaryContainer;
        this.secondaryContainer = secondaryContainer;
        await this.mount();
        this.renderTimer.start();
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
    }

    async switchPrimary(): Promise<void> {
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
}

export { Scene2D, Scene3D };
