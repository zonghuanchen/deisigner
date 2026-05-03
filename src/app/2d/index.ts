import { Application } from 'pixi.js';

export class Scene2D {
  private app: Application;

  constructor() {
    this.app = new Application();
  }

  async init(container: HTMLElement) {
    await this.app.init({
      resizeTo: container,
      backgroundColor: 0xf5f5f5,
    });
    container.appendChild(this.app.canvas);
  }
}
