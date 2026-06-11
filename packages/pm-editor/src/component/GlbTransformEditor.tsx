import { useCallback } from 'react';
import { ConstraintSystem } from '@designer/pm-engine';
import type { BindingMap, VariableMap } from '@designer/pm-engine';
import { TRANSFORM_AXES } from './constants';
import { SliderRow } from './SliderRow';
import { BindButton, BindingInput } from './BindingInput';
import type { GlbModelItem } from './types';

export function GlbTransformEditor({
    model,
    onChange,
    variables,
    cs,
    bindings,
    onBindingsChange,
}: {
    model: GlbModelItem;
    onChange: (update: Partial<GlbModelItem>) => void;
    variables: VariableMap;
    cs: ConstraintSystem;
    /** 当前模型的绑定映射（从 constraints 数据中获取） */
    bindings: BindingMap;
    /** 绑定变化时回调，更新 constraints 数据 */
    onBindingsChange: (newBindings: BindingMap) => void;
}) {
    const setAxis = useCallback(
        (key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number) => {
            const cur = { ...model[key] };
            cur[axis] = val;
            onChange({ [key]: cur });
        },
        [model, onChange],
    );

    // 切换某个参数的绑定状态
    const toggleBinding = useCallback((path: string) => {
        const newBindings = { ...bindings };
        if (path in newBindings) {
            delete newBindings[path];
        } else {
            // 默认表达式为当前值
            const [key, axis] = path.split('.');
            const curVal = (model as any)[key]?.[axis];
            newBindings[path] = String(curVal ?? 1);
        }
        onBindingsChange(newBindings);
    }, [model, bindings, onBindingsChange]);

    // 更新绑定表达式
    const updateBinding = useCallback((path: string, expr: string) => {
        onBindingsChange({ ...bindings, [path]: expr });
    }, [bindings, onBindingsChange]);

    // 求值表达式用于预览
    const evalExpr = useCallback((expr: string): string => {
        const result = cs.evaluate(expr);
        return result.error ? `❗ ${result.error}` : `= ${result.value.toFixed(3)}`;
    }, [cs]);

    // 滑块范围配置
    const rangeConfig = {
        position: { min: -20, max: 20, step: 0.1 },
        rotation: { min: -Math.PI, max: Math.PI, step: 0.01 },
        scale:    { min: 0.05, max: 10, step: 0.05 },
    } as const;

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">变换</span>

            {(['position', 'rotation', 'scale'] as const).map(section => (
                <div key={section} className="flex flex-col gap-0.5">
                    <span className={`text-[11px] font-mono ${
                        section === 'position' ? 'text-emerald-400/70'
                            : section === 'rotation' ? 'text-purple-400/70'
                            : 'text-amber-400/70'
                    }`}>
                        {section === 'position' ? '位置' : section === 'rotation' ? '旋转' : '缩放'}
                    </span>
                    {TRANSFORM_AXES.map(axis => {
                        const path = `${section}.${axis}`;
                        const isBound = path in bindings;
                        const value = model[section][axis];
                        const { min, max, step } = rangeConfig[section];
                        return (
                            <div key={axis} className="flex items-center gap-1">
                                {isBound ? (
                                    <BindingInput
                                        path={path}
                                        expr={bindings[path]}
                                        preview={evalExpr(bindings[path])}
                                        onChange={e => updateBinding(path, e)}
                                        onUnbind={() => toggleBinding(path)}
                                        label={axis.toUpperCase()}
                                    />
                                ) : (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <SliderRow
                                                label={axis.toUpperCase()}
                                                value={value}
                                                min={min} max={max} step={step}
                                                onChange={v => setAxis(section, axis, v)}
                                            />
                                        </div>
                                        <BindButton onClick={() => toggleBinding(path)} />
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
