import * as THREE from 'three';
import { Command } from './Command';

/**
 * 命令管理器。
 * 继承 THREE.EventDispatcher，通过 execute 触发命令，命令结束时调用 onComplete。
 * 触发新命令时，会自动完成当前正在执行的命令。
 */
export class CommandManager extends THREE.EventDispatcher<any> {
    private static instance: CommandManager | null = null;

    /** name → Command 注册表 */
    private readonly registry = new Map<string, Command>();

    /** 当前正在执行的命令 */
    private current: Command | null = null;

    private constructor() {
        super();
    }

    static getInstance(): CommandManager {
        if (!CommandManager.instance) {
            CommandManager.instance = new CommandManager();
        }
        return CommandManager.instance;
    }

    /**
     * 注册一个命令。同名命令会被覆盖。
     */
    register(cmd: Command): void {
        this.registry.set(cmd.name, cmd);
    }

    /**
     * 执行指定命令。
     * 若当前有正在执行的命令，会先调用其 onComplete。
     */
    execute(name: string): void {
        const cmd = this.registry.get(name);
        if (!cmd) {
            console.warn(`[CommandManager] 命令 "${name}" 未注册`);
            return;
        }

        // 完成当前命令
        if (this.current) {
            this.current.onComplete();
        }

        // 执行新命令
        this.current = cmd;
        cmd.onExecute();
        this.dispatchEvent({ type: 'execute', command: cmd });
    }

    /**
     * 完成当前正在执行的命令。
     */
    completeCurrent(): void {
        if (this.current) {
            const cmd = this.current;
            cmd.onComplete();
            this.current = null;
            this.dispatchEvent({ type: 'complete', command: cmd });
        }
    }

    /**
     * 获取当前正在执行的命令名称，若无执行中的命令则返回 null。
     */
    get currentName(): string | null {
        return this.current?.name ?? null;
    }

    /**
     * 获取当前正在执行的命令实例。
     */
    get currentCommand(): Command | null {
        return this.current;
    }

    /**
     * 获取指定名称的命令实例。
     */
    getCommand(name: string): Command | undefined {
        return this.registry.get(name);
    }

    /**
     * 列出所有已注册的命令名称。
     */
    get registeredNames(): string[] {
        return Array.from(this.registry.keys());
    }
}
