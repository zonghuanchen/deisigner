import { App } from '../core';
import { Scene2D } from './2d';
import { Scene3D } from './3d';
import { VIEWER_2D, VIEWER_3D, ViewerType } from './types';
import { RenderTimer } from './timer';

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

        this.scene2d = new Scene2D();
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
}

export { Scene2D, Scene3D };
