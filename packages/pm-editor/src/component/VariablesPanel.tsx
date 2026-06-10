import { useState } from 'react';
import type { VariableMap } from '@designer/pm-engine';
import type { ConstraintEntry } from './types';
import { SliderRow } from './SliderRow';

export function VariablesPanel({
    constraints,
    variables,
    onVariableChange,
    onConstraintRemove,
    onResetAll,
}: {
    constraints: ConstraintEntry[];
    variables: VariableMap;
    onVariableChange: (vars: VariableMap) => void;
    onConstraintRemove: (name: string) => void;
    onResetAll: () => void;
}) {
    const [open, setOpen] = useState(true);
    const [newName, setNewName] = useState('');

    const handleAdd = () => {
        const name = newName.trim();
        if (!name || /^[0-9]/.test(name) || /[^a-zA-Z0-9_]/.test(name)) return;
        if (name in variables) return;
        onVariableChange({ ...variables, [name]: 1 });
        setNewName('');
    };

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
                        return (
                            <div key={c.name} className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                    <input
                                        className="bg-gray-800 text-orange-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-gray-700 focus:border-orange-500/60 outline-none w-20 shrink-0"
                                        value={c.name}
                                        readOnly
                                    />
                                    <input
                                        type="number"
                                        className="bg-gray-800 text-gray-200 text-[11px] font-mono rounded px-1.5 py-0.5 border border-gray-700 focus:border-orange-500/60 outline-none flex-1 min-w-0"
                                        value={value}
                                        step={0.1}
                                        onChange={e => {
                                            const v = parseFloat(e.target.value);
                                            if (!isNaN(v)) onVariableChange({ ...variables, [c.name]: v });
                                        }}
                                    />
                                    {value !== c.value && (
                                        <button
                                            className="text-[11px] text-orange-400/70 hover:text-orange-300 transition-colors px-0.5 shrink-0"
                                            onClick={() => onVariableChange({ ...variables, [c.name]: c.value })}
                                            title={`重置为原始值 ${c.value}`}
                                        >↺</button>
                                    )}
                                    <button
                                        className="text-[11px] text-red-400/50 hover:text-red-300 transition-colors px-0.5 shrink-0"
                                        onClick={() => onConstraintRemove(c.name)}
                                        title="删除变量"
                                    >✕</button>
                                </div>
                                {/* 描述 */}
                                {c.description && (
                                    <span className="text-[10px] text-gray-600 pl-1 leading-snug">{c.description}</span>
                                )}
                                {/* 滑块 */}
                                <SliderRow
                                    label=""
                                    value={value}
                                    min={0.1} max={20} step={0.1}
                                    onChange={v => onVariableChange({ ...variables, [c.name]: v })}
                                />
                            </div>
                        );
                    })}
                    {/* 添加新变量 */}
                    <div className="flex items-center gap-2 mt-1">
                        <input
                            className="bg-gray-800 text-gray-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-gray-700 focus:border-orange-500/60 outline-none flex-1 min-w-0"
                            placeholder="变量名 (如 width)"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        />
                        <button
                            className="text-[11px] text-orange-400/70 hover:text-orange-300 transition-colors px-1.5 py-0.5 border border-orange-500/30 rounded hover:bg-orange-600/20"
                            onClick={handleAdd}
                        >+ 添加</button>
                    </div>
                    <p className="text-[10px] text-gray-600 leading-snug">
                        在参数输入框中点击🔗绑定表达式，如 <code className="text-orange-400/70">width * 2</code>
                    </p>
                </div>
            )}
        </div>
    );
}
