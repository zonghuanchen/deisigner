import { useCallback } from 'react';
import { ConstraintSystem } from '@designer/pm-engine';
import type { ParametricDef, BooleanOp, BindingMap, VariableMap } from '@designer/pm-engine';
import { SIZE_AXIS_LABELS, BOOL_TYPE_LABELS, SHAPE_PRESETS, SHAPE_TYPES } from './constants';
import { formatValue } from './utils';
import { SliderRow } from './SliderRow';
import { BindButton } from './BindingInput';

export function ParamsEditor({
    def,
    onChange,
    variables,
    cs,
    bindings,
    onBindingsChange,
}: {
    def: ParametricDef;
    onChange: (newDef: ParametricDef) => void;
    variables: VariableMap;
    cs: ConstraintSystem;
    /** 当前实体的绑定映射（从 constraints 数据中获取） */
    bindings: BindingMap;
    /** 绑定变化时回调，更新 constraints 数据 */
    onBindingsChange: (newBindings: BindingMap) => void;
}) {
    const paramEntries = Object.entries(def.params ?? {});

    // 切换某个参数的绑定状态
    const toggleBinding = useCallback((path: string) => {
        const newBindings = { ...bindings };
        if (path in newBindings) {
            delete newBindings[path];
        } else {
            // 默认表达式为当前值
            const curVal = ConstraintSystem.getByPath(def.params, path);
            newBindings[path] = String(curVal ?? 1);
        }
        onBindingsChange(newBindings);
    }, [def, bindings, onBindingsChange]);

    // 更新绑定表达式
    const updateBinding = useCallback((path: string, expr: string) => {
        onBindingsChange({ ...bindings, [path]: expr });
    }, [bindings, onBindingsChange]);

    // 求值表达式用于预览
    const evalExpr = useCallback((expr: string): number => {
        const result = cs.evaluate(expr);
        return result.error ? 0 : result.value;
    }, [cs]);

    const handleNumericParam = useCallback(
        (key: string, v: number) => {
            onChange({ ...def, params: { ...def.params, [key]: v } });
        },
        [def, onChange],
    );

    const handleSizeAxis = useCallback(
        (axis: number, v: number) => {
            const sz = [...(def.params.size as number[])];
            sz[axis] = v;
            onChange({ ...def, params: { ...def.params, size: sz } });
        },
        [def, onChange],
    );

    return (
        <div className="flex flex-col gap-1.5">
            {/* Type badge */}
            <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] text-gray-500 uppercase">类型</span>
                <span className="px-1.5 py-0.5 bg-blue-600/30 text-blue-300 rounded text-xs font-mono">
                    {def.type}
                </span>
            </div>

            {/* Params */}
            {paramEntries.map(([key, value]) => {
                // size: array of numbers → per-axis sliders
                if (key === 'size' && Array.isArray(value) && value.every((v: any) => typeof v === 'number')) {
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            {(value as number[]).map((v, i) => {
                                const path = `size.${i}`;
                                const isBound = path in bindings;
                                const boundVal = isBound ? evalExpr(bindings[path]) : v;
                                return (
                                    <div key={i} className="flex items-center gap-1">
                                        <div className="flex-1 min-w-0">
                                            <SliderRow
                                                label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                                value={boundVal} min={0.05} max={10} step={0.05}
                                                onChange={val => {
                                                    if (isBound) {
                                                        updateBinding(path, String(val));
                                                    } else {
                                                        handleSizeAxis(i, val);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {isBound ? (
                                            <button
                                                className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-orange-400 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors"
                                                onClick={() => toggleBinding(path)}
                                                title="解除绑定"
                                            >✕</button>
                                        ) : (
                                            <BindButton onClick={() => toggleBinding(path)} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }
                // center: array of numbers → per-axis sliders (allow negative)
                if (key === 'center' && Array.isArray(value) && value.every((v: any) => typeof v === 'number')) {
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            {(value as number[]).map((v, i) => {
                                const path = `center.${i}`;
                                const isBound = path in bindings;
                                const boundVal = isBound ? evalExpr(bindings[path]) : v;
                                return (
                                    <div key={i} className="flex items-center gap-1">
                                        <div className="flex-1 min-w-0">
                                            <SliderRow
                                                label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                                value={boundVal} min={-10} max={10} step={0.1}
                                                onChange={val => {
                                                    if (isBound) {
                                                        updateBinding(path, String(val));
                                                    } else {
                                                        const c = [...(def.params.center as number[])];
                                                        c[i] = val;
                                                        handleNumericParam('center', c as any);
                                                    }
                                                }}
                                            />
                                        </div>
                                        {isBound ? (
                                            <button
                                                className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-orange-400 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors"
                                                onClick={() => toggleBinding(path)}
                                                title="解除绑定"
                                            >✕</button>
                                        ) : (
                                            <BindButton onClick={() => toggleBinding(path)} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                }
                // Single number → slider
                if (typeof value === 'number') {
                    const isRadius = key === 'radius';
                    const isBound = key in bindings;
                    const boundVal = isBound ? evalExpr(bindings[key]) : value;
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            <div className="flex items-center gap-1">
                                <div className="flex-1 min-w-0">
                                    <SliderRow
                                        label=""
                                        value={boundVal}
                                        min={isRadius ? 0.05 : 0.05}
                                        max={isRadius ? 5 : 10}
                                        step={0.05}
                                        onChange={v => {
                                            if (isBound) {
                                                updateBinding(key, String(v));
                                            } else {
                                                handleNumericParam(key, v);
                                            }
                                        }}
                                    />
                                </div>
                                {isBound ? (
                                    <button
                                        className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-orange-400 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors"
                                        onClick={() => toggleBinding(key)}
                                        title="解除绑定"
                                    >✕</button>
                                ) : (
                                    <BindButton onClick={() => toggleBinding(key)} />
                                )}
                            </div>
                        </div>
                    );
                }
                // Fallback: read-only
                return (
                    <div key={key} className="flex items-baseline gap-1.5 pl-2 border-l border-gray-700/40">
                        <span className="text-[11px] text-gray-500 font-mono shrink-0">{key}</span>
                        <span className="text-xs text-gray-200 font-mono break-all">{formatValue(value)}</span>
                    </div>
                );
            })}

            {/* Boolean operations */}
            <div className="flex flex-col gap-1 mt-2">
                <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wide">布尔运算</span>
                </div>

                {/* Existing bool ops */}
                {def.bool && def.bool.length > 0 && def.bool.map((b: BooleanOp, bi: number) => (
                    <div key={bi} className="pl-2 border-l border-amber-500/30 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                            <select
                                className="bg-amber-600/20 text-amber-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-transparent focus:border-gray-500 outline-none cursor-pointer"
                                value={b.type}
                                onChange={e => {
                                    const newBool = [...(def.bool ?? [])];
                                    newBool[bi] = { ...newBool[bi], type: e.target.value as BooleanOp['type'] };
                                    onChange({ ...def, bool: newBool });
                                }}
                            >
                                {Object.entries(BOOL_TYPE_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                            <select
                                className="bg-gray-800 text-gray-300 text-[11px] font-mono rounded px-1 py-0.5 border border-gray-700 focus:border-gray-500 outline-none cursor-pointer"
                                value={b.shape.type as string}
                                onChange={e => {
                                    const newType = e.target.value;
                                    const preset = SHAPE_PRESETS[newType];
                                    if (!preset) return;
                                    const newBool = [...(def.bool ?? [])];
                                    newBool[bi] = {
                                        ...newBool[bi],
                                        shape: { type: newType as any, params: { ...preset.params } },
                                    };
                                    onChange({ ...def, bool: newBool });
                                }}
                            >
                                {SHAPE_TYPES.map(st => (
                                    <option key={st} value={st}>{SHAPE_PRESETS[st].label}</option>
                                ))}
                            </select>
                            <button
                                className="ml-auto text-[11px] text-red-400/70 hover:text-red-300 transition-colors"
                                onClick={() => {
                                    const newBool = [...(def.bool ?? [])];
                                    newBool.splice(bi, 1);
                                    onChange({ ...def, bool: newBool.length > 0 ? newBool : undefined });
                                }}
                                title="删除"
                            >✕</button>
                        </div>
                        {Object.entries(b.shape.params ?? {}).map(([k, v]) => {
                            // size array → per-axis sliders
                            if (k === 'size' && Array.isArray(v) && v.every((x: any) => typeof x === 'number')) {
                                return (
                                    <div key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[11px] text-gray-600 font-mono">{k}</span>
                                        {(v as number[]).map((sv, si) => (
                                            <SliderRow
                                                key={si}
                                                label={SIZE_AXIS_LABELS[si] ?? `${si}`}
                                                value={sv} min={0.05} max={10} step={0.05}
                                                onChange={val => {
                                                    const newBool = [...(def.bool ?? [])];
                                                    const newShape = { ...newBool[bi].shape, params: { ...newBool[bi].shape.params } };
                                                    const sz = [...(newShape.params.size as number[])];
                                                    sz[si] = val;
                                                    newShape.params.size = sz;
                                                    newBool[bi] = { ...newBool[bi], shape: newShape };
                                                    onChange({ ...def, bool: newBool });
                                                }}
                                            />
                                        ))}
                                    </div>
                                );
                            }
                            // center array → per-axis sliders
                            if (k === 'center' && Array.isArray(v) && v.every((x: any) => typeof x === 'number')) {
                                return (
                                    <div key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[11px] text-gray-600 font-mono">{k}</span>
                                        {(v as number[]).map((sv, si) => (
                                            <SliderRow
                                                key={si}
                                                label={SIZE_AXIS_LABELS[si] ?? `${si}`}
                                                value={sv} min={-10} max={10} step={0.1}
                                                onChange={val => {
                                                    const newBool = [...(def.bool ?? [])];
                                                    const newShape = { ...newBool[bi].shape, params: { ...newBool[bi].shape.params } };
                                                    const c = [...(newShape.params.center as number[])];
                                                    c[si] = val;
                                                    newShape.params.center = c;
                                                    newBool[bi] = { ...newBool[bi], shape: newShape };
                                                    onChange({ ...def, bool: newBool });
                                                }}
                                            />
                                        ))}
                                    </div>
                                );
                            }
                            // single number → slider
                            if (typeof v === 'number') {
                                const isRadius = k === 'radius';
                                return (
                                    <div key={k} className="flex flex-col gap-0.5">
                                        <span className="text-[11px] text-gray-600 font-mono">{k}</span>
                                        <SliderRow
                                            label=""
                                            value={v}
                                            min={isRadius ? 0.05 : 0.05}
                                            max={isRadius ? 5 : 10}
                                            step={0.05}
                                            onChange={val => {
                                                const newBool = [...(def.bool ?? [])];
                                                const newShape = { ...newBool[bi].shape, params: { ...newBool[bi].shape.params } };
                                                newShape.params[k] = val;
                                                newBool[bi] = { ...newBool[bi], shape: newShape };
                                                onChange({ ...def, bool: newBool });
                                            }}
                                        />
                                    </div>
                                );
                            }
                            // fallback: read-only
                            return (
                                <div key={k} className="flex items-baseline gap-1 pl-2">
                                    <span className="text-[11px] text-gray-600 font-mono shrink-0">{k}</span>
                                    <span className="text-[11px] text-gray-400 font-mono break-all">{formatValue(v)}</span>
                                </div>
                            );
                        })}
                        {/* Rotation */}
                        <div className="flex flex-col gap-0.5 mt-1 pl-2 border-l border-purple-500/20">
                            <span className="text-[11px] text-purple-400/70 font-mono">旋转</span>
                            {(['x', 'y', 'z'] as const).map(axis => (
                                <SliderRow
                                    key={axis}
                                    label={axis.toUpperCase()}
                                    value={b.rotation?.[axis] ?? 0}
                                    min={-Math.PI} max={Math.PI} step={0.01}
                                    onChange={val => {
                                        const newBool = [...(def.bool ?? [])];
                                        const cur = newBool[bi].rotation ?? { x: 0, y: 0, z: 0 };
                                        newBool[bi] = { ...newBool[bi], rotation: { ...cur, [axis]: val } };
                                        onChange({ ...def, bool: newBool });
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* Add boolean operation buttons */}
                <div className="flex flex-col gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">添加布尔运算</span>
                    <div className="flex flex-col gap-2">
                        {(['subtract', 'union', 'intersect'] as const).map(opType => (
                            <div key={opType} className="flex flex-col gap-1">
                                <span className="text-[10px] text-gray-500 font-mono">
                                    {BOOL_TYPE_LABELS[opType]}
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {SHAPE_TYPES.map(st => (
                                        <button
                                            key={st}
                                            className="w-[3.5rem] h-[2rem] bg-gray-800 hover:bg-gray-700 rounded text-[10px] leading-tight text-gray-400 hover:text-gray-200 transition-colors border border-gray-700/50 hover:border-gray-600 text-center flex items-center justify-center"
                                            title={`${BOOL_TYPE_LABELS[opType]} ${SHAPE_PRESETS[st].label}`}
                                            onClick={() => {
                                                const newOp: BooleanOp = {
                                                    type: opType,
                                                    shape: {
                                                        type: st as any,
                                                        params: { ...SHAPE_PRESETS[st].params },
                                                    },
                                                };
                                                onChange({ ...def, bool: [...(def.bool ?? []), newOp] });
                                            }}
                                        >
                                            {SHAPE_PRESETS[st].label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
