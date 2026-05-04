import * as THREE from 'three';
import { RenderTimer } from '../timer';
import { Scene3DManager } from './Scene3DManager';

export class Scene3D {
  private sceneManager: Scene3DManager;
  private renderTimer: RenderTimer | null = null;

  constructor(container: HTMLElement, renderTimer?: RenderTimer) {
    // Initialize scene using Scene3DManager (now includes camera logic)
    this.sceneManager = new Scene3DManager();
    
    // Set up renderer container
    this.sceneManager.setRendererContainer(container);
    
    // Register render callback to timer if provided
    if (renderTimer) {
      this.renderTimer = renderTimer;
      renderTimer.register(() => this.render());
    }
  }

  getScene(): THREE.Scene {
    return this.sceneManager.getScene();
  }

  add(object: THREE.Object3D): void {
    this.sceneManager.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.sceneManager.remove(object);
  }

  render() {
    this.sceneManager.render();
  }
}
