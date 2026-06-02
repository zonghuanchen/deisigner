import { Environment } from './Environment';

/**
 * 默认环境：常规编辑模式。
 * mount/unmount 留空，供后续扩展（如绑定全局快捷键、设置相机模式等）。
 */
export class NormalEnvironment implements Environment {
    readonly name = 'normal';

    mount(): void {
        // 默认环境暂无特殊挂载逻辑
    }

    unmount(): void {
        // 默认环境暂无特殊卸载逻辑
    }
}
