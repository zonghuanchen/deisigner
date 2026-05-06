import { Application } from 'pixi.js';
import { RenderTimer } from '../timer';

export class Scene2D {
    private app: Application;
    private renderTimer: RenderTimer | null = null;

    constructor() {
        this.app = new Application();
    }

    async init(container: HTMLElement, renderTimer?: RenderTimer) {
        await this.app.init({
            resizeTo: container,
            backgroundColor: 0xf5f5f5,
        });
        container.appendChild(this.app.canvas);

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
}
