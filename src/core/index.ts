import { CameraManager } from './model/CameraManager';

export interface IModelManager {
  getCameraManager(): CameraManager;
}

export class ModelManager implements IModelManager {
  private cameraManager: CameraManager;

  constructor() {
    // 默认创建相机管理对象
    this.cameraManager = new CameraManager();
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
export * from './types';
export { ModelRegistry } from './ModelRegistry';
