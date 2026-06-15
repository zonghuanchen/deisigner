import { CameraManager } from './model/CameraManager';
import { SceneModel } from './model/SceneModel';
import { SelectionManager } from './selection/SelectionManager';

export interface IApp {
    getScene(): SceneModel;
    getCameraManager(): CameraManager;
    getSelectionManager(): SelectionManager;
}

export class App implements IApp {
    private static instance: App | null = null;
    private scene: SceneModel;
    private cameraManager: CameraManager;
    private selectionManager: SelectionManager;

    private constructor() {
        // 默认创建场景、相机管理对象和选择管理对象
        this.scene = new SceneModel();
        this.cameraManager = new CameraManager();
        this.selectionManager = SelectionManager.getInstance();
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

    /**
      * 获取选择管理器
      * @returns 选择管理器实例
      */
    getSelectionManager(): SelectionManager {
        return this.selectionManager;
    }
}

export * from './model/index';
export * from './material/index';
export * from './selection/index';
export * from './util/index';
export * from './pave/index';
export * from './types';
export { ModelRegistry } from './ModelRegistry';
