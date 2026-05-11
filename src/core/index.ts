import { CameraManager } from './model/CameraManager';
import { SceneModel } from './model/SceneModel';

export interface IApp {
    getScene(): SceneModel;
    getCameraManager(): CameraManager;
}

export class App implements IApp {
    private static instance: App | null = null;
    private scene: SceneModel;
    private cameraManager: CameraManager;

    private constructor() {
        // 默认创建场景和相机管理对象
        this.scene = new SceneModel();
        this.cameraManager = new CameraManager();
    }

    static getInstance(): App {
        if (!App.instance) {
            App.instance = new App();
        }
        return App.instance;
    }

    /**
      * 获取场景
      * @returns 场景实例
      */
    getScene(): SceneModel {
        return this.scene;
    }

    /**
      * 获取相机管理器
      * @returns 相机管理器实例
      */
    getCameraManager(): CameraManager {
        return this.cameraManager;
    }
}

export * from './model/index';
export * from './material/index';
export * from './util/index';
export * from './types';
export { ModelRegistry } from './ModelRegistry';
