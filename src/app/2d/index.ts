import { Application } from 'pixi.js';
import { RenderTimer } from '../timer';

// Import 2D display modules to trigger their registration
import './display/Camera';

export class Scene2D {
    private static instance: Scene2D | null = null;
    private app: Application;
    private renderTimer: RenderTimer | null = null;
    private initialized: boolean = false;

    constructor() {
        this.app = new Application();
        Scene2D.instance = this;
    }

    /**
     * Get the singleton instance of Scene2D
     * Creates a new instance if one doesn't exist
     */
    static getInstance(): Scene2D {
        if (!Scene2D.instance) {
            Scene2D.instance = new Scene2D();
        }
        return Scene2D.instance;
    }

    async init(container: HTMLElement, renderTimer?: RenderTimer) {
        await this.app.init({
            resizeTo: container,
            backgroundColor: 0xf5f5f5,
        });
        container.appendChild(this.app.canvas);
        this.initialized = true;

        // Register render callback to timer if provided
        if (renderTimer) {
            this.renderTimer = renderTimer;
            renderTimer.register(() => this.render());
        }
    }

    render() {
        // Pixi.js automatically renders in the ticker loop
        // This method can be used for manual rendering if needed
        this.app.render();
    }

    /**
     * Get the underlying PixiJS canvas element
     */
    getCanvas(): HTMLCanvasElement | null {
        return this.initialized ? this.app.canvas : null;
    }

    /**
     * Check if Scene2D has been initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get the PixiJS stage container
     */
    getStage(): import('pixi.js').Container {
        return this.app.stage;
    }
}
