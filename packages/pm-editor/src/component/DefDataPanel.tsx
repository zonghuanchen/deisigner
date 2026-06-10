import { useState } from 'react';
import { ParametricModeler } from '@designer/pm-engine';
import type { ParametricDef, BuildStep } from '@designer/pm-engine';
import { BUILD_STEP_COLORS } from './constants';
import { formatValue } from './utils';
import type { ConstraintEntry, GlbModelItem } from './types';

export function DefDataPanel({
    defs,
    selectedIndex,
    constraints,
    glbModels,
}: {
    defs: ParametricDef[];
    selectedIndex: number | null;
    constraints: ConstraintEntry[];
    glbModels: GlbModelItem[];
}) {
    const [collapsed, setCollapsed] = useState(false);
    const [activeTab, setActiveTab] = useState<'params' | 'constraint' | 'models'>('params');
    const [copied, setCopied] = useState(false);
    const selectedDef = selectedIndex !== null ? defs[selectedIndex] : null;
    const buildSteps = selectedDef ? ParametricModeler.buildSteps(selectedDef) : [];

    const getAllJson = () => JSON.stringify({
        params: selectedDef ?? defs,
        constraint: constraints,
        models: glbModels,
    }, null, 2);
    const handleCopy = () => {
        navigator.clipboard.writeText(getAllJson()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <div
            className="pointer-events-auto absolute top-20 right-4 w-96 bg-gray-900/95 rounded-lg border border-gray-700 overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 220px)' }}
        >
            <div
                className="px-4 py-2 border-b border-gray-700/60 flex items-center justify-between cursor-pointer select-none"
                onClick={() => setCollapsed(c => !c)}
            >
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {activeTab === 'params'
                        ? (selectedDef ? `实体 #${selectedIndex} 构建过程` : 'ParametricDef 数据')
                        : activeTab === 'constraint' ? '约束 Constraint' : '模型 Models'}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                    {collapsed ? '▶' : '▼'}
                </span>
            </div>
            {!collapsed && (
                <>
                    {/* Tab bar */}
                    <div className="flex items-center gap-1 px-4 pt-2 pb-1 border-b border-gray-700/40">
                        {(['params', 'constraint', 'models'] as const).map(tab => (
                            <button
                                key={tab}
                                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                                    activeTab === tab
                                        ? 'text-white bg-blue-600/40 border border-blue-500/50'
                                        : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 border border-transparent'
                                }`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab === 'params' ? 'Params' : tab === 'constraint' ? 'Constraint' : 'Models'}
                            </button>
                        ))}
                        <button
                            className="ml-auto px-2 py-1 text-[11px] font-medium rounded transition-colors text-gray-500 hover:text-green-300 hover:bg-green-600/10 border border-transparent hover:border-green-500/30"
                            onClick={handleCopy}
                            title="复制完整 JSON（params + constraint + models）"
                        >
                            {copied ? '✓ 已复制' : '📋 复制'}
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                        {/* ── Params tab ── */}
                        {activeTab === 'params' && (
                            buildSteps.length > 0 ? (
                                <div className="px-4 py-3 flex flex-col gap-2">
                                    {buildSteps.map((step: BuildStep) => {
                                        const color = BUILD_STEP_COLORS[step.index % BUILD_STEP_COLORS.length];
                                        return (
                                            <div key={step.index} className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                        style={{ backgroundColor: color }}
                                                    >
                                                        {step.index}
                                                    </span>
                                                    <span className="text-xs font-mono text-gray-200">{step.label}</span>
                                                </div>
                                                {step.index === 0 && selectedDef && (
                                                    <pre className="pl-7 text-[10px] leading-snug font-mono text-gray-400 whitespace-pre-wrap break-all">
                                                        {JSON.stringify(selectedDef.params, null, 2)}
                                                    </pre>
                                                )}
                                                {step.index > 0 && selectedDef?.bool?.[step.index - 1] && (
                                                    <pre className="pl-7 text-[10px] leading-snug font-mono text-gray-400 whitespace-pre-wrap break-all">
                                                        {JSON.stringify(selectedDef.bool[step.index - 1].shape, null, 2)}
                                                    </pre>
                                                )}
                                                {step.index < buildSteps.length - 1 && (
                                                    <div className="pl-2.5 text-gray-600 text-xs">↓</div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    <div className="mt-2 pt-2 border-t border-gray-700/40">
                                        <span className="text-[10px] text-gray-500 uppercase">完整定义</span>
                                        <pre className="mt-1 text-[10px] leading-snug font-mono text-green-300/80 whitespace-pre-wrap break-all">
                                            {JSON.stringify(selectedDef, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            ) : (
                                <pre className="px-4 py-3 text-[11px] leading-relaxed font-mono text-green-300/90 whitespace-pre-wrap break-words">
                                    {JSON.stringify(defs, null, 2)}
                                </pre>
                            )
                        )}

                        {/* ── Constraint tab ── */}
                        {activeTab === 'constraint' && (
                            <div className="px-4 py-3 flex flex-col gap-3">
                                {constraints.length === 0 ? (
                                    <p className="text-xs text-gray-500">暂无约束数据</p>
                                ) : (
                                    constraints.map((c, i) => (
                                        <div key={c.name} className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                    style={{ backgroundColor: BUILD_STEP_COLORS[i % BUILD_STEP_COLORS.length] }}
                                                >
                                                    {i}
                                                </span>
                                                <span className="text-xs font-mono text-blue-300">{c.name}</span>
                                                <span className="text-[10px] text-gray-500 ml-auto">= {formatValue(c.value)}</span>
                                            </div>
                                            {c.description && (
                                                <p className="pl-7 text-[10px] text-gray-500 leading-snug">{c.description}</p>
                                            )}
                                            {c.bindings.length > 0 && (
                                                <div className="pl-7 flex flex-col gap-0.5">
                                                    {c.bindings.map((b, bi) => (
                                                        <div key={bi} className="text-[10px] font-mono text-gray-400">
                                                            <span className="text-gray-600">def[{b.def}].</span>
                                                            <span className="text-amber-400">{b.path}</span>
                                                            <span className="text-gray-600"> = </span>
                                                            <span className="text-orange-300">{b.expr}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                                {/* Raw JSON */}
                                <div className="mt-2 pt-2 border-t border-gray-700/40">
                                    <span className="text-[10px] text-gray-500 uppercase">原始 JSON</span>
                                    <pre className="mt-1 text-[10px] leading-snug font-mono text-green-300/80 whitespace-pre-wrap break-all">
                                        {JSON.stringify(constraints, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}

                        {/* ── Models tab ── */}
                        {activeTab === 'models' && (
                            <div className="px-4 py-3 flex flex-col gap-3">
                                {glbModels.length === 0 ? (
                                    <p className="text-xs text-gray-500">暂无模型数据</p>
                                ) : (
                                    glbModels.map((m, i) => (
                                        <div key={i} className="flex flex-col gap-1.5">
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                    style={{ backgroundColor: BUILD_STEP_COLORS[i % BUILD_STEP_COLORS.length] }}
                                                >
                                                    {i}
                                                </span>
                                                <span className="text-xs font-mono text-amber-300">{m.label}</span>
                                            </div>
                                            <div className="pl-7 flex flex-col gap-0.5 text-[10px] font-mono text-gray-400">
                                                <div><span className="text-gray-600">glb: </span><span className="text-gray-300 truncate">{m.glb}</span></div>
                                                <div><span className="text-gray-600">pos: </span>({formatValue(m.position.x)}, {formatValue(m.position.y)}, {formatValue(m.position.z)})</div>
                                                <div><span className="text-gray-600">rot: </span>({formatValue(m.rotation.x)}, {formatValue(m.rotation.y)}, {formatValue(m.rotation.z)})</div>
                                                <div><span className="text-gray-600">scl: </span>({formatValue(m.scale.x)}, {formatValue(m.scale.y)}, {formatValue(m.scale.z)})</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                                {/* Raw JSON */}
                                <div className="mt-2 pt-2 border-t border-gray-700/40">
                                    <span className="text-[10px] text-gray-500 uppercase">原始 JSON</span>
                                    <pre className="mt-1 text-[10px] leading-snug font-mono text-green-300/80 whitespace-pre-wrap break-all">
                                        {JSON.stringify(glbModels, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
