import { useState } from 'react';
import type { VariableMap, ParametricDef } from '@designer/pm-engine';
import type { ConstraintEntry, GlbModelItem } from './types';


type Binding = ConstraintEntry['bindings'][number];

/** Build a readable label for an entity */
function entityLabel(defs: ParametricDef[], glbModels: GlbModelItem[], b: Binding): string {
    if (b.def !== undefined) {
        const d = defs[b.def];
        return d ? `#${b.def} ${d.type}` : `#${b.def}`;
    }
    if (b.model !== undefined) {
        const m = glbModels[b.model];
        return m ? `GLB:${m.label}` : `GLB#${b.model}`;
    }
    return '?';
}

/** Collect all bindable paths for a ParametricDef */
function defBindablePaths(def: ParametricDef): string[] {
    const paths: string[] = [];
    for (const [key, value] of Object.entries(def.params ?? {})) {
        if (typeof value === 'number') {
            paths.push(key);
        } else if (Array.isArray(value) && value.every((v: any) => typeof v === 'number')) {
            value.forEach((_: any, i: number) => paths.push(`${key}.${i}`));
        }
    }
    return paths;
}

const GLB_BINDABLE_PATHS = [
    'position.x', 'position.y', 'position.z',
    'rotation.x', 'rotation.y', 'rotation.z',
    'scale.x', 'scale.y', 'scale.z',
];

export function VariablesPanel({
    constraints,
    variables,
    defs,
    glbModels,
    onVariableChange,
    onConstraintAdd,
    onConstraintRemove,
    onConstraintUpdate,
    onBindingAdd,
    onBindingRemove,
    onResetAll,
}: {
    constraints: ConstraintEntry[];
    variables: VariableMap;
    defs: ParametricDef[];
    glbModels: GlbModelItem[];
    onVariableChange: (vars: VariableMap) => void;
    onConstraintAdd: (entry: ConstraintEntry) => void;
    onConstraintRemove: (name: string) => void;
    onConstraintUpdate: (name: string, patch: Partial<ConstraintEntry>) => void;
    onBindingAdd: (constraintName: string, binding: Binding) => void;
    onBindingRemove: (constraintName: string, bindingIndex: number) => void;
    onResetAll: () => void;
}) {
    const [open, setOpen] = useState(true);
    const [newName, setNewName] = useState('');
    const [addError, setAddError] = useState('');
    // Local text editing state for decimal input support
    const [editingVar, setEditingVar] = useState<{ name: string; text: string } | null>(null);
    // Which constraint is currently expanding its "add binding" form
    const [addingFor, setAddingFor] = useState<string | null>(null);
    // Form state for adding a binding
    const [addTarget, setAddTarget] = useState<'def' | 'model'>('def');
    const [addEntityIndex, setAddEntityIndex] = useState(0);
    const [addPath, setAddPath] = useState('');
    const [addExpr, setAddExpr] = useState('');
    // Which constraint is currently expanding its condition edit form
    const [editingCondition, setEditingCondition] = useState<{ name: string; text: string } | null>(null);
    // Which constraint is currently expanding its description edit form
    const [editingDesc, setEditingDesc] = useState<{ name: string; text: string } | null>(null);

    const handleAdd = () => {
        const name = newName.trim();
        if (!name) {
            setAddError('请输入变量名');
            return;
        }
        if (/^[0-9]/.test(name)) {
            setAddError('变量名不能以数字开头');
            return;
        }
        if (/[^a-zA-Z0-9_]/.test(name)) {
            setAddError('变量名只能包含字母、数字和下划线');
            return;
        }
        // 检查 constraints 和 variables 中是否已存在
        if (name in variables || constraints.some(c => c.name === name)) {
            setAddError(`变量 "${name}" 已存在`);
            return;
        }
        setAddError('');
        onVariableChange({ ...variables, [name]: 1 });
        onConstraintAdd({ name, value: 1, description: '', bindings: [] });
        setNewName('');
    };

    const openAddBinding = (constraintName: string, varName: string) => {
        setAddingFor(constraintName);
        setAddTarget('def');
        setAddEntityIndex(0);
        // Default path & expr
        const firstDef = defs[0];
        if (firstDef) {
            const paths = defBindablePaths(firstDef);
            setAddPath(paths[0] ?? '');
        } else {
            setAddPath('');
        }
        setAddExpr(varName);
    };

    const handleAddBinding = (constraintName: string) => {
        if (!addPath || !addExpr) return;
        const binding: Binding = addTarget === 'def'
            ? { def: addEntityIndex, path: addPath, expr: addExpr }
            : { model: addEntityIndex, path: addPath, expr: addExpr };
        onBindingAdd(constraintName, binding);
        setAddingFor(null);
    };

    // Available paths based on target type & entity
    const availablePaths = addTarget === 'def'
        ? (defs[addEntityIndex] ? defBindablePaths(defs[addEntityIndex]) : [])
        : GLB_BINDABLE_PATHS;

    // Entity options for dropdown
    const entityOptions = addTarget === 'def'
        ? defs.map((d, i) => ({ value: i, label: `#${i} ${d.type}` }))
        : glbModels.map((m, i) => ({ value: i, label: `M${i} ${m.label}` }));

    // 是否有变量偏离了原始值
    const hasModified = constraints.some(c => {
        const cur = variables[c.name] ?? c.value;
        return cur !== c.value;
    });

    return (
        <div className="flex flex-col gap-1 border-b border-gray-700/60 pb-3">
            <div className="flex items-center gap-1.5 px-4 pt-3">
                <button
                    className="flex items-center gap-1.5 text-left group flex-1 min-w-0"
                    onClick={() => setOpen(o => !o)}
                >
                    <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                        {open ? '▾' : '▸'}
                    </span>
                    <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">约束变量</span>
                    <span className="text-[11px] text-gray-500 font-mono">{constraints.length} 个</span>
                </button>
                {hasModified && (
                    <button
                        className="shrink-0 text-[10px] text-orange-400/70 hover:text-orange-300 transition-colors px-1.5 py-0.5 border border-orange-500/30 rounded hover:bg-orange-600/20"
                        onClick={onResetAll}
                        title="重置所有变量为原始值"
                    >↺ 全部重置</button>
                )}
            </div>
            {open && (
                <div className="flex flex-col gap-1.5 px-4">
                    {constraints.map(c => {
                        const value = variables[c.name] ?? c.value;
                        const isAdding = addingFor === c.name;
                        return (
                            <div key={c.name} className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <input
                                        className="bg-gray-800 text-orange-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-gray-700 focus:border-orange-500/60 outline-none w-20 shrink-0"
                                        value={c.name}
                                        readOnly
                                    />
                                    <div className="flex items-center flex-1 min-w-0 rounded border border-gray-700 focus-within:border-orange-500/60 overflow-hidden bg-gray-800">
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className="bg-transparent text-gray-200 text-[11px] font-mono px-1.5 py-0.5 outline-none flex-1 min-w-0 tabular-nums"
                                            value={editingVar?.name === c.name ? editingVar.text : value}
                                            onChange={e => {
                                                const raw = e.target.value;
                                                if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
                                                    setEditingVar({ name: c.name, text: raw });
                                                }
                                            }}
                                            onBlur={() => {
                                                if (editingVar?.name === c.name) {
                                                    const v = parseFloat(editingVar.text);
                                                    if (!isNaN(v)) onVariableChange({ ...variables, [c.name]: v });
                                                    setEditingVar(null);
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    if (editingVar?.name === c.name) {
                                                        const v = parseFloat(editingVar.text);
                                                        if (!isNaN(v)) onVariableChange({ ...variables, [c.name]: v });
                                                        setEditingVar(null);
                                                    }
                                                    (e.target as HTMLInputElement).blur();
                                                }
                                            }}
                                        />
                                        <div className="flex flex-col shrink-0 border-l border-gray-700">
                                            <button
                                                className="w-5 h-3.5 flex items-center justify-center text-gray-500 hover:text-orange-400 hover:bg-orange-600/15 transition-colors"
                                                onClick={() => onVariableChange({ ...variables, [c.name]: +(value + 0.1).toFixed(2) })}
                                                title="+0.1"
                                            ><svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 4L4 1L7 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                                            <div className="h-px bg-gray-700" />
                                            <button
                                                className="w-5 h-3.5 flex items-center justify-center text-gray-500 hover:text-orange-400 hover:bg-orange-600/15 transition-colors"
                                                onClick={() => onVariableChange({ ...variables, [c.name]: +Math.max(0, value - 0.1).toFixed(2) })}
                                                title="-0.1"
                                            ><svg width="8" height="5" viewBox="0 0 8 5" fill="none"><path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
                                        </div>
                                    </div>
                                    {value !== c.value && (
                                        <button
                                            className="text-[11px] text-orange-400/70 hover:text-orange-300 transition-colors px-0.5 shrink-0"
                                            onClick={() => onVariableChange({ ...variables, [c.name]: c.value })}
                                            title={`重置为原始值 ${c.value}`}
                                        >↺</button>
                                    )}
                                    <button
                                        className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-gray-600 hover:text-orange-400 hover:bg-orange-600/10 rounded transition-colors"
                                        onClick={() => openAddBinding(c.name, c.name)}
                                        title="添加绑定"
                                    >🔗</button>
                                    <button
                                        className="text-[11px] text-red-400/50 hover:text-red-300 transition-colors px-0.5 shrink-0"
                                        onClick={() => onConstraintRemove(c.name)}
                                        title="删除变量"
                                    >✕</button>
                                </div>
                                {/* 描述 */}
                                <div className="flex items-center gap-1.5 pl-1 mt-0.5">
                                    <span className="text-[10px] text-gray-600 shrink-0">描述:</span>
                                    {editingDesc?.name === c.name ? (
                                        <input
                                            className="bg-gray-800 text-gray-300 text-[10px] rounded px-1.5 py-0.5 border border-gray-600 focus:border-gray-500 outline-none flex-1 min-w-0"
                                            value={editingDesc.text}
                                            placeholder="变量描述（可选）"
                                            autoFocus
                                            onChange={e => setEditingDesc({ name: c.name, text: e.target.value })}
                                            onBlur={() => {
                                                onConstraintUpdate(c.name, { description: editingDesc.text.trim() });
                                                setEditingDesc(null);
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    onConstraintUpdate(c.name, { description: editingDesc.text.trim() });
                                                    setEditingDesc(null);
                                                    (e.target as HTMLInputElement).blur();
                                                } else if (e.key === 'Escape') {
                                                    setEditingDesc(null);
                                                }
                                            }}
                                        />
                                    ) : (
                                        <button
                                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors flex-1 min-w-0 text-left truncate ${
                                                c.description
                                                    ? 'bg-gray-800/80 text-gray-400 border-gray-700 hover:bg-gray-700/60 hover:text-gray-300'
                                                    : 'bg-gray-800/40 text-gray-600 border-gray-700/60 hover:text-gray-400 hover:border-gray-600'
                                            }`}
                                            onClick={() => setEditingDesc({ name: c.name, text: c.description ?? '' })}
                                            title="点击编辑描述"
                                        >{c.description || '无描述'}</button>
                                    )}
                                </div>

                                {/* 条件表达式 */}
                                <div className="flex items-center gap-1.5 pl-1 mt-0.5">
                                    <span className="text-[10px] text-gray-600 shrink-0">条件:</span>
                                    {editingCondition?.name === c.name ? (
                                        <div className="flex items-center gap-1 flex-1 min-w-0">
                                            <input
                                                className="bg-gray-800 text-purple-300 text-[10px] font-mono rounded px-1.5 py-0.5 border border-purple-500/50 focus:border-purple-400 outline-none flex-1 min-w-0"
                                                value={editingCondition.text}
                                                placeholder="如 width > 10"
                                                autoFocus
                                                onChange={e => setEditingCondition({ name: c.name, text: e.target.value })}
                                                onBlur={() => {
                                                    onConstraintUpdate(c.name, { condition: editingCondition.text.trim() || undefined });
                                                    setEditingCondition(null);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') {
                                                        onConstraintUpdate(c.name, { condition: editingCondition.text.trim() || undefined });
                                                        setEditingCondition(null);
                                                        (e.target as HTMLInputElement).blur();
                                                    } else if (e.key === 'Escape') {
                                                        setEditingCondition(null);
                                                    }
                                                }}
                                            />
                                            {c.condition && (
                                                <button
                                                    className="shrink-0 text-[10px] text-red-400/50 hover:text-red-300 transition-colors px-0.5"
                                                    onClick={() => {
                                                        onConstraintUpdate(c.name, { condition: undefined });
                                                        setEditingCondition(null);
                                                    }}
                                                    title="清除条件"
                                                >✕</button>
                                            )}
                                        </div>
                                    ) : (
                                        <button
                                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors flex-1 min-w-0 text-left truncate ${
                                                c.condition
                                                    ? 'bg-purple-900/30 text-purple-300 border-purple-500/40 hover:bg-purple-800/40'
                                                    : 'bg-gray-800/60 text-gray-600 border-gray-700 hover:text-gray-400 hover:border-gray-600'
                                            }`}
                                            onClick={() => setEditingCondition({ name: c.name, text: c.condition ?? '' })}
                                            title="点击编辑条件表达式"
                                        >{c.condition || '无条件（始终生效）'}</button>
                                    )}
                                </div>

                                {/* 已有绑定列表 */}
                                {c.bindings.length > 0 && (
                                    <div className="flex flex-col gap-0.5 pl-2 border-l-2 border-orange-500/30 mt-0.5">
                                        {c.bindings.map((b, bi) => (
                                            <div key={bi} className="flex items-center gap-1.5 text-[10px]">
                                                <span className="text-blue-300/80 font-mono shrink-0">
                                                    {entityLabel(defs, glbModels, b)}
                                                </span>
                                                <span className="text-gray-500 font-mono">{b.path}</span>
                                                <span className="text-gray-600 font-mono">=</span>
                                                <span className="text-orange-300/80 font-mono truncate">{b.expr}</span>
                                                <button
                                                    className="shrink-0 ml-auto text-red-400/40 hover:text-red-300 transition-colors"
                                                    onClick={() => onBindingRemove(c.name, bi)}
                                                    title="移除此绑定"
                                                >✕</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {/* 添加绑定表单 */}
                                {isAdding && (
                                    <div className="flex flex-col gap-1 pl-2 border-l-2 border-orange-500/40 mt-0.5 pb-1">
                                        {/* Target type toggle */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                                    addTarget === 'def'
                                                        ? 'bg-blue-600/30 text-blue-300 border-blue-500/40'
                                                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                                                }`}
                                                onClick={() => {
                                                    setAddTarget('def');
                                                    setAddEntityIndex(0);
                                                    const d = defs[0];
                                                    if (d) {
                                                        const p = defBindablePaths(d);
                                                        setAddPath(p[0] ?? '');
                                                    }
                                                }}
                                            >实体</button>
                                            <button
                                                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                                                    addTarget === 'model'
                                                        ? 'bg-blue-600/30 text-blue-300 border-blue-500/40'
                                                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300'
                                                }`}
                                                onClick={() => {
                                                    setAddTarget('model');
                                                    setAddEntityIndex(0);
                                                    setAddPath(GLB_BINDABLE_PATHS[0]);
                                                }}
                                            >GLB</button>
                                        </div>
                                        {/* Entity selector */}
                                        {entityOptions.length > 0 ? (
                                            <>
                                                <select
                                                    className="bg-gray-800 text-gray-300 text-[10px] font-mono rounded px-1 py-0.5 border border-gray-700 outline-none"
                                                    value={addEntityIndex}
                                                    onChange={e => {
                                                        const idx = Number(e.target.value);
                                                        setAddEntityIndex(idx);
                                                        if (addTarget === 'def') {
                                                            const d = defs[idx];
                                                            if (d) {
                                                                const p = defBindablePaths(d);
                                                                setAddPath(p[0] ?? '');
                                                            }
                                                        }
                                                    }}
                                                >
                                                    {entityOptions.map(o => (
                                                        <option key={o.value} value={o.value}>{o.label}</option>
                                                    ))}
                                                </select>
                                                {/* Path selector */}
                                                <select
                                                    className="bg-gray-800 text-gray-300 text-[10px] font-mono rounded px-1 py-0.5 border border-gray-700 outline-none"
                                                    value={addPath}
                                                    onChange={e => setAddPath(e.target.value)}
                                                >
                                                    {availablePaths.map(p => (
                                                        <option key={p} value={p}>{p}</option>
                                                    ))}
                                                </select>
                                                {/* Expression input */}
                                                <div className="flex items-center gap-1">
                                                    <input
                                                        className="bg-orange-950/40 text-orange-300 text-[10px] font-mono rounded px-1.5 py-0.5 border border-orange-500/30 focus:border-orange-400 outline-none flex-1 min-w-0"
                                                        value={addExpr}
                                                        onChange={e => setAddExpr(e.target.value)}
                                                        placeholder="表达式"
                                                        onKeyDown={e => e.key === 'Enter' && handleAddBinding(c.name)}
                                                    />
                                                    <button
                                                        className="text-[10px] text-orange-400 hover:text-orange-300 px-1.5 py-0.5 border border-orange-500/30 rounded hover:bg-orange-600/20"
                                                        onClick={() => handleAddBinding(c.name)}
                                                    >确定</button>
                                                    <button
                                                        className="text-[10px] text-gray-500 hover:text-gray-300 px-1"
                                                        onClick={() => setAddingFor(null)}
                                                    >取消</button>
                                                </div>
                                            </>
                                        ) : (
                                            <span className="text-[10px] text-gray-600">
                                                {addTarget === 'def' ? '暂无实体' : '暂无GLB模型'}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {/* 添加新变量 */}
                    <div className="flex flex-col gap-0.5 mt-1">
                        <div className="flex items-center gap-2">
                            <input
                                className={`bg-gray-800 text-gray-300 text-[11px] font-mono rounded px-1.5 py-0.5 border ${
                                    addError ? 'border-red-500/60' : 'border-gray-700 focus:border-orange-500/60'
                                } outline-none flex-1 min-w-0`}
                                placeholder="变量名 (如 width)"
                                value={newName}
                                onChange={e => { setNewName(e.target.value); if (addError) setAddError(''); }}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                            <button
                                className="shrink-0 text-[11px] text-orange-400/70 hover:text-orange-300 transition-colors px-1.5 py-0.5 border border-orange-500/30 rounded hover:bg-orange-600/20"
                                onClick={handleAdd}
                            >+ 添加</button>
                        </div>
                        {addError && (
                            <span className="text-[10px] text-red-400 pl-1">{addError}</span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-600 leading-snug">
                        点击🔗为变量绑定多个实体属性，或在参数输入框中绑定表达式
                    </p>
                </div>
            )}
        </div>
    );
}
