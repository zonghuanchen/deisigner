import { Environment } from './Environment';
import { NormalEnvironment } from './NormalEnvironment';

/**
 * 环境管理器。
 * 维护一组已注册的环境对象，并在它们之间切换。
 * 切换时：先调用当前环境的 unmount()，再调用目标环境的 mount()。
 * 默认激活的环境是 "normal"。
 */
export class EnvironmentManager {
    private static instance: EnvironmentManager | null = null;

    /** name → Environment 注册表 */
    private readonly registry = new Map<string, Environment>();

    /** 当前激活的环境 */
    private current: Environment | null = null;

    private constructor() {
        // 注册并激活默认环境
        const normal = new NormalEnvironment();
        this.register(normal);
        this.switchTo(normal.name);
    }

    static getInstance(): EnvironmentManager {
        if (!EnvironmentManager.instance) {
            EnvironmentManager.instance = new EnvironmentManager();
        }
        return EnvironmentManager.instance;
    }

    /**
     * 注册一个环境。同名环境会被覆盖。
     */
    register(env: Environment): void {
        this.registry.set(env.name, env);
    }

    /**
     * 切换到指定环境。
     * 若目标环境未注册或已是当前环境，则跳过。
     */
    switchTo(name: string): void {
        if (this.current?.name === name) return;

        const next = this.registry.get(name);
        if (!next) {
            console.warn(`[EnvironmentManager] 环境 "${name}" 未注册`);
            return;
        }

        // 卸载当前环境
        this.current?.unmount();

        // 挂载新环境
        this.current = next;
        next.mount();
    }

    /**
     * 获取当前激活的环境名称，若无激活环境则返回 null。
     */
    get currentName(): string | null {
        return this.current?.name ?? null;
    }

    /**
     * 获取当前激活的环境实例。
     */
    get currentEnvironment(): Environment | null {
        return this.current;
    }

    /**
     * 获取指定名称的环境实例。
     */
    getEnvironment(name: string): Environment | undefined {
        return this.registry.get(name);
    }

    /**
     * 列出所有已注册的环境名称。
     */
    get registeredNames(): string[] {
        return Array.from(this.registry.keys());
    }
}
