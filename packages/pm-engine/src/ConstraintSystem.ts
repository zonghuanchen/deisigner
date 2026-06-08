import type { ParametricDef, BindingMap } from './ParametricModeler';

/**
 * 命名变量集合：key 为变量名，value 为数值
 */
export type VariableMap = Record<string, number>;

/**
 * 参数绑定集合：key 为参数路径（如 "size.0"、"radius"），value 为表达式字符串
 * 类型定义在 ParametricModeler.ts 中
 */

/**
 * 表达式求值结果
 */
export interface EvalResult {
    value: number;
    error?: string;
}

/**
 * 参数约束系统
 *
 * 管理命名变量和参数绑定表达式，将表达式解析为具体数值后注入到 ParametricDef.params 中。
 *
 * 用法：
 *   const cs = new ConstraintSystem();
 *   cs.setVariable('width', 10);
 *   cs.setVariable('height', 5);
 *   // 表达式引用变量
 *   const resolved = cs.resolveDef(def, { 'size.0': 'width * 2', 'size.1': 'height' });
 */
export class ConstraintSystem {

    /** 全局变量集合 */
    private _variables: VariableMap = {};

    /** 安全的数学函数白名单 */
    private static readonly MATH_FUNCS: Record<string, (...args: number[]) => number> = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        abs: Math.abs,
        sqrt: Math.sqrt,
        pow: Math.pow,
        min: Math.min,
        max: Math.max,
        floor: Math.floor,
        ceil: Math.ceil,
        round: Math.round,
        log: Math.log,
    };

    /** 数学常量 */
    private static readonly MATH_CONSTS: Record<string, number> = {
        PI: Math.PI,
        E: Math.E,
    };

    // ─── Variable management ────────────────────────────────────────────────

    get variables(): VariableMap {
        return { ...this._variables };
    }

    getVariable(name: string): number | undefined {
        return this._variables[name];
    }

    setVariable(name: string, value: number): void {
        this._variables[name] = value;
    }

    removeVariable(name: string): void {
        delete this._variables[name];
    }

    setVariables(vars: VariableMap): void {
        this._variables = { ...vars };
    }

    // ─── Expression evaluation ──────────────────────────────────────────────

    /**
     * 安全求值表达式
     *
     * 支持变量引用、四则运算、括号和数学函数。
     * 不使用 eval()，通过 new Function 限定作用域。
     */
    evaluate(expr: string, extraVars?: VariableMap): EvalResult {
        try {
            const vars = { ...this._variables, ...extraVars };
            const value = ConstraintSystem.safeEval(expr, vars);
            if (!isFinite(value)) {
                return { value: 0, error: '结果非有限数值' };
            }
            return { value };
        } catch (e: any) {
            return { value: 0, error: e.message ?? '表达式错误' };
        }
    }

    /**
     * 安全表达式求值引擎
     * 将变量和数学函数作为参数传入 Function，避免全局作用域污染
     */
    private static safeEval(expr: string, vars: VariableMap): number {
        // 构造参数名和值列表
        const varNames = Object.keys(vars);
        const varValues = varNames.map(k => vars[k]);

        // 注入数学函数和常量
        const funcNames = Object.keys(this.MATH_FUNCS);
        const funcValues = funcNames.map(k => this.MATH_FUNCS[k]);
        const constNames = Object.keys(this.MATH_CONSTS);
        const constValues = constNames.map(k => this.MATH_CONSTS[k]);

        const allNames = [...constNames, ...funcNames, ...varNames];
        const allValues = [...constValues, ...funcValues, ...varValues];

        // 校验：仅允许安全字符（字母、数字、运算符、括号、小数点、空格、逗号）
        if (!/^[a-zA-Z0-9\s+\-*/().,%^]+$/.test(expr)) {
            throw new Error(`表达式含非法字符: ${expr}`);
        }

        // 将 ^ 替换为 ** (幂运算)
        const normalizedExpr = expr.replace(/\^/g, '**');

        const fn = new Function(...allNames, `"use strict"; return (${normalizedExpr});`);
        return fn(...allValues) as number;
    }

    // ─── Def resolution ─────────────────────────────────────────────────────

    /**
     * 解析绑定表达式并将结果写入 def.params 的对应位置
     *
     * @param def 原始 ParametricDef（不会被修改）
     * @param bindings 参数绑定映射（path → expression）
     * @param extraVars 额外变量（可选，会覆盖同名全局变量）
     * @returns 新的 ParametricDef，params 中对应路径已替换为求值结果
     */
    resolveDef(def: ParametricDef, bindings?: BindingMap, extraVars?: VariableMap): ParametricDef {
        const effectiveBindings: BindingMap = bindings ?? (def as any).bindings;
        if (!effectiveBindings || Object.keys(effectiveBindings).length === 0) {
            return def;
        }

        const newParams = JSON.parse(JSON.stringify(def.params));

        for (const [path, expr] of Object.entries(effectiveBindings) as [string, string][]) {
            const result = this.evaluate(expr, extraVars);
            if (result.error) {
                console.warn(`[ConstraintSystem] 绑定 "${path}" 表达式 "${expr}" 求值失败: ${result.error}`);
                continue;
            }
            this.setByPath(newParams, path, result.value);
        }

        return { ...def, params: newParams };
    }

    /**
     * 批量解析多个 ParametricDef
     */
    resolveDefs(defs: ParametricDef[]): ParametricDef[] {
        return defs.map(def => this.resolveDef(def));
    }

    // ─── Path helpers ────────────────────────────────────────────────────────

    /**
     * 通过点分路径设置对象属性值
     * 支持 "radius"、"size.0"、"center.2" 等路径
     */
    private setByPath(obj: any, path: string, value: number): void {
        const keys = path.split('.');
        let current = obj;
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] === undefined || current[key] === null) return;
            current = current[key];
        }
        const lastKey = keys[keys.length - 1];
        if (Array.isArray(current)) {
            const idx = parseInt(lastKey, 10);
            if (!isNaN(idx)) current[idx] = value;
        } else {
            current[lastKey] = value;
        }
    }

    /**
     * 通过点分路径读取对象属性值
     */
    static getByPath(obj: any, path: string): any {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current === undefined || current === null) return undefined;
            current = current[key];
        }
        return current;
    }

    /**
     * 提取 ParametricDef 中所有可绑定的数值参数路径
     * 返回如 ["size.0", "size.1", "size.2", "center.0", ...]
     */
    static extractBindablePaths(params: Record<string, any>): string[] {
        const paths: string[] = [];
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'number') {
                paths.push(key);
            } else if (Array.isArray(value) && value.every(v => typeof v === 'number')) {
                value.forEach((_, i) => paths.push(`${key}.${i}`));
            }
        }
        return paths;
    }
}
