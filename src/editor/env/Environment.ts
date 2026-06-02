/**
 * 环境对象接口。
 * 每个环境在激活时执行 mount()，在切走时执行 unmount()。
 */
export interface Environment {
    /** 环境唯一标识 */
    readonly name: string;

    /** 挂载环境：绑定事件、激活工具、显示专属 UI 等 */
    mount(): void;

    /** 卸载环境：解绑事件、停用工具、隐藏专属 UI 等 */
    unmount(): void;
}
