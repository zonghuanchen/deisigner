/**
 * 命令对象接口。
 * onExecute 在命令被触发时执行，onComplete 在命令结束时执行。
 */
export interface Command {
    /** 命令唯一标识 */
    readonly name: string;

    /** 执行命令：绑定事件、激活工具、显示专属 UI 等 */
    onExecute(): void;

    /** 命令完成回调：解绑事件、停用工具、隐藏专属 UI 等 */
    onComplete(): void;
}
