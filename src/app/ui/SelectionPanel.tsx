import { useCallback, useState } from 'react';
import * as THREE from 'three';
import { App as CoreApp } from '../../core';
import { useModelListener } from './util/useModelListener';
import { ParametricModel } from '../../core/model/ParametricModel';
import type { ParametricDef, BooleanOp } from '../../core/util/ParametricModeler';

const TYPE_LABELS: Record<string, string> = {
    WallModel: '墙体',
    RoomModel: '房间',
    FloorModel: '楼层',
    FurnitureModel: '家具',
    ParametricModel: '参数化模型',
    FaceModel: '面',
    GroundModel: '地面',
    CeilingModel: '天花板',
    SceneModel: '场景',
    CameraModel: '相机',
};

function getModelType(obj: Record<string, any>): string {
    // Try to infer type from known keys
    if (obj.from && obj.to) return 'WallModel';
    if (obj.outerContour && obj.height !== undefined && obj.groundFace) return 'RoomModel';
    if (obj.outerContour && obj.material) return 'FaceModel';
    if (obj.floorNumber !== undefined) return 'FloorModel';
    if (obj.gltfPath !== undefined) return 'FurnitureModel';
    if (obj.params !== undefined) return 'ParametricModel';
    if (obj.floors !== undefined) return 'SceneModel';
    if (obj.cameraType !== undefined) return 'CameraModel';
    return 'Unknown';
}

function formatValue(v: any): string {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return Math.round(v * 100) / 100 + '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? '是' : '否';
    if (Array.isArray(v)) {
        if (v.length === 0) return '[]';
        if (typeof v[0] === 'object') return `[ ${v.length} 项 ]`;
        return v.map(formatValue).join(', ');
    }
    if (typeof v === 'object') {
        const keys = Object.keys(v);
        if (keys.length <= 3) {
            return keys.map(k => `${k}: ${formatValue(v[k])}`).join('  ');
        }
        return `{ ${keys.length} 属性 }`;
    }
    return String(v);
}

interface SliderRowProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, onChange }: SliderRowProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 w-4 text-right font-mono">{label}</span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                className="flex-1 h-1 accent-blue-500 cursor-pointer"
                onChange={e => onChange(parseFloat(e.target.value))}
            />
            <span className="text-xs text-gray-300 w-12 text-right font-mono tabular-nums">
                {Math.round(value * 100) / 100}
            </span>
        </div>
    );
}

const BOOL_LABELS: Record<string, string> = {
    union: '并集',
    subtract: '差集',
    intersect: '交集',
};

const SIZE_AXIS_LABELS = ['X', 'Y', 'Z'];

function isSizeParam(key: string, value: any): value is number[] {
    return key === 'size' && Array.isArray(value) && value.every(v => typeof v === 'number');
}

function ParamEntry({ name, value }: { name: string; value: any }) {
    return (
        <div className="flex items-baseline gap-1.5 pl-2 border-l border-gray-700/40">
            <span className="text-[11px] text-gray-500 font-mono shrink-0">{name}</span>
            <span className="text-xs text-gray-200 font-mono break-all">{formatValue(value)}</span>
        </div>
    );
}

interface SizeSliderProps {
    model: ParametricModel;
    defIndex: number;
    boolIndex?: number;
    values: number[];
    max?: number;
}

function SizeSliders({ model, defIndex, boolIndex, values, max = 10 }: SizeSliderProps) {
    const handleChange = useCallback(
        (axis: number, v: number) => {
            const currentParams = model.params;
            if (!currentParams) return;
            const newParams = currentParams.map((def, di) => {
                if (di !== defIndex) return def;
                const copy = { ...def };
                if (boolIndex !== undefined && def.bool) {
                    copy.bool = def.bool.map((b, bi) => {
                        if (bi !== boolIndex) return b;
                        return { ...b, shape: { ...b.shape, params: { ...b.shape.params, size: [...values].map((s, si) => si === axis ? v : s) } } };
                    });
                } else {
                    copy.params = { ...copy.params, size: [...values].map((s, si) => si === axis ? v : s) };
                }
                return copy;
            });
            model.params = newParams;
        },
        [model, defIndex, boolIndex, values],
    );

    return (
        <div className="flex flex-col gap-0.5 pl-2 border-l border-amber-500/20">
            <span className="text-[11px] text-gray-500 font-mono">size</span>
            {values.map((val, i) => (
                <SliderRow
                    key={i}
                    label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                    value={val}
                    min={0.05}
                    max={max}
                    step={0.05}
                    onChange={v => handleChange(i, v)}
                />
            ))}
        </div>
    );
}

function ShapeBlock({ def, index, label, model }: { def: ParametricDef; index: number; label: string; model: ParametricModel }) {
    const [open, setOpen] = useState(true);
    const paramEntries = Object.entries(def.params ?? {});

    return (
        <div className="flex flex-col gap-0.5">
            <button
                className="flex items-center gap-1.5 text-left group"
                onClick={() => setOpen(o => !o)}
            >
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? '▾' : '▸'}
                </span>
                <span className="text-[11px] font-semibold text-amber-400/80">{label}</span>
                <span className="text-[11px] text-gray-400 font-mono">{def.type}</span>
            </button>
            {open && (
                <div className="flex flex-col gap-0.5 ml-1">
                    {paramEntries.map(([k, v]) =>
                        isSizeParam(k, v) ? (
                            <SizeSliders key={k} model={model} defIndex={index} values={v} />
                        ) : (
                            <ParamEntry key={k} name={k} value={v} />
                        ),
                    )}
                    {def.bool && def.bool.length > 0 && (
                        <div className="flex flex-col gap-1 mt-1 pl-2 border-l-2 border-rose-500/20">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider">布尔运算</span>
                            {def.bool.map((b, bi) => (
                                <BoolBlock key={bi} op={b} index={bi} defIndex={index} model={model} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BoolBlock({ op, index, defIndex, model }: { op: BooleanOp; index: number; defIndex: number; model: ParametricModel }) {
    const [open, setOpen] = useState(true);
    const paramEntries = Object.entries(op.shape.params ?? {});
    const boolLabel = BOOL_LABELS[op.type] ?? op.type;

    return (
        <div className="flex flex-col gap-0.5">
            <button
                className="flex items-center gap-1.5 text-left group"
                onClick={() => setOpen(o => !o)}
            >
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? '▾' : '▸'}
                </span>
                <span className="text-[11px] font-semibold text-rose-400/80">{boolLabel}</span>
                <span className="text-[11px] text-gray-400 font-mono">{op.shape.type}</span>
            </button>
            {open && (
                <div className="flex flex-col gap-0.5 ml-1">
                    {paramEntries.map(([k, v]) =>
                        isSizeParam(k, v) ? (
                            <SizeSliders key={k} model={model} defIndex={defIndex} boolIndex={index} values={v} max={5} />
                        ) : (
                            <ParamEntry key={k} name={k} value={v} />
                        ),
                    )}
                </div>
            )}
        </div>
    );
}

function ParamsSection({ model }: { model: ParametricModel }) {
    const [open, setOpen] = useState(true);
    // Re-render when params change (dirty event)
    useModelListener(model, 'dirty');
    const params = model.params ?? [];

    return (
        <div className="flex flex-col gap-1 border-b border-gray-700/60 pb-3">
            <button
                className="flex items-center gap-1.5 text-left group"
                onClick={() => setOpen(o => !o)}
            >
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? '▾' : '▸'}
                </span>
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">参数定义</span>
                <span className="text-[11px] text-gray-500 font-mono">{params.length} 个形状</span>
            </button>
            {open && (
                <div className="flex flex-col gap-2 ml-1">
                    {params.map((def, i) => (
                        <ShapeBlock key={i} def={def} index={i} label={`形状 ${i + 1}`} model={model} />
                    ))}
                </div>
            )}
        </div>
    );
}

interface TransformSectionProps {
    model: ParametricModel;
}

function TransformSection({ model }: TransformSectionProps) {
    // Listen to transformChange to re-render sliders
    useModelListener(model, 'transformChange');

    const pos = model.position;
    const rot = model.rotation;
    const scl = model.scale;

    const setPos = useCallback(
        (axis: 'x' | 'y' | 'z', v: number) => {
            const p = model.position.clone();
            p[axis] = v;
            model.position = p;
        },
        [model],
    );

    const setRot = useCallback(
        (axis: 'x' | 'y' | 'z', v: number) => {
            const r = new THREE.Euler(model.rotation.x, model.rotation.y, model.rotation.z);
            r[axis] = v;
            model.rotation = r;
        },
        [model],
    );

    const setScl = useCallback(
        (axis: 'x' | 'y' | 'z', v: number) => {
            const s = model.scale.clone();
            s[axis] = v;
            model.scale = s;
        },
        [model],
    );

    const sectionTitle = (title: string) => (
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-2 first:mt-0">{title}</span>
    );

    return (
        <div className="flex flex-col gap-1 border-b border-gray-700/60 pb-3">
            {sectionTitle('位置')}
            <SliderRow label="X" value={pos.x} min={-20} max={20} step={0.1} onChange={v => setPos('x', v)} />
            <SliderRow label="Y" value={pos.y} min={-20} max={20} step={0.1} onChange={v => setPos('y', v)} />
            <SliderRow label="Z" value={pos.z} min={-20} max={20} step={0.1} onChange={v => setPos('z', v)} />

            {sectionTitle('旋转')}
            <SliderRow label="X" value={rot.x} min={-Math.PI} max={Math.PI} step={0.01} onChange={v => setRot('x', v)} />
            <SliderRow label="Y" value={rot.y} min={-Math.PI} max={Math.PI} step={0.01} onChange={v => setRot('y', v)} />
            <SliderRow label="Z" value={rot.z} min={-Math.PI} max={Math.PI} step={0.01} onChange={v => setRot('z', v)} />

            {sectionTitle('缩放')}
            <SliderRow label="X" value={scl.x} min={0.1} max={10} step={0.1} onChange={v => setScl('x', v)} />
            <SliderRow label="Y" value={scl.y} min={0.1} max={10} step={0.1} onChange={v => setScl('y', v)} />
            <SliderRow label="Z" value={scl.z} min={0.1} max={10} step={0.1} onChange={v => setScl('z', v)} />
        </div>
    );
}

export function SelectionPanel() {
    const selectionManager = CoreApp.getInstance().getSelectionManager();
    const data = useModelListener(selectionManager);

    const count = data.count ?? 0;
    const first = data.first ?? null;
    const firstModel = selectionManager.getFirst();

    if (count === 0 || !first) return null;

    const typeKey = getModelType(first);
    const label = TYPE_LABELS[typeKey] ?? typeKey;

    const isParametric = firstModel instanceof ParametricModel;

    // For parametric models, exclude transform and params from the read-only list
    const excludeKeys = new Set(['id']);
    if (isParametric) {
        excludeKeys.add('position');
        excludeKeys.add('rotation');
        excludeKeys.add('scale');
        excludeKeys.add('params');
    }
    const props = Object.entries(first).filter(([k]) => !excludeKeys.has(k));

    return (
        <div
            className="absolute left-0 top-0 bottom-0 w-72 bg-gray-900/90 border-r border-gray-700 pointer-events-auto overflow-y-auto flex flex-col"
            style={{ backdropFilter: 'blur(8px)' }}
        >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">属性面板</span>
                    {count > 1 && (
                        <span className="text-xs bg-blue-600 text-white rounded px-1.5 py-0.5">{count}</span>
                    )}
                </div>
                <button
                    className="text-gray-400 hover:text-white text-xs"
                    onClick={() => selectionManager.clear()}
                >
                    取消选择
                </button>
            </div>

            {/* Model type */}
            <div className="px-4 py-3 border-b border-gray-700/60">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-400" />
                    <span className="text-sm font-medium text-white">{label}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500 font-mono truncate">{first.id}</p>
            </div>

            {/* Transform sliders for ParametricModel */}
            {isParametric && (
                <div className="px-4 py-3">
                    <TransformSection model={firstModel} />
                </div>
            )}

            {/* Structured params for ParametricModel */}
            {isParametric && firstModel instanceof ParametricModel && (
                <div className="px-4 py-3">
                    <ParamsSection model={firstModel} />
                </div>
            )}

            {/* Properties */}
            <div className="px-4 py-3 flex flex-col gap-2 flex-1">
                {props.map(([key, value]) => (
                    <div key={key} className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 font-medium">{key}</span>
                        <span className="text-sm text-gray-100 break-all leading-relaxed">{formatValue(value)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
