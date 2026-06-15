import { useCallback, useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { App as CoreApp } from '@designer/core';
import { useModelListener } from './util/useModelListener';
import { ParametricModel } from '@designer/core/model/ParametricModel';
import { ParametricModelV2 } from '@designer/core/model/ParametricModelV2';
import { FurnitureModel } from '@designer/core/model/FurnitureModel';
import { GroundModel } from '@designer/core/model/GroundModel';
import { CeilingModel } from '@designer/core/model/CeilingModel';
import { Material } from '@designer/core/material/Material';
import type { ParametricDef, BooleanOp } from '@designer/pm-engine';
import type { ConstraintVariableMeta } from '@designer/core/model/ParametricModelV2';

const TYPE_LABELS: Record<string, string> = {
    WallModel: '墙体',
    RoomModel: '房间',
    FloorModel: '楼层',
    FurnitureModel: '家具',
    ParametricModel: '参数化模型',
    ParametricModelV2: '参数化模型V2',
    FaceModel: '面',
    GroundModel: '地面',
    CeilingModel: '顶面',
    SceneModel: '场景',
    CameraModel: '相机',
};

function getModelType(obj: Record<string, any>, model?: any): string {
    // Use instanceof checks for precise type identification
    if (model instanceof GroundModel) return 'GroundModel';
    if (model instanceof CeilingModel) return 'CeilingModel';
    // Try to infer type from known keys
    if (obj.from && obj.to) return 'WallModel';
    if (obj.outerContour && obj.height !== undefined && obj.groundFace) return 'RoomModel';
    if (obj.outerContour && obj.material) return 'FaceModel';
    if (obj.floorNumber !== undefined) return 'FloorModel';
    if (obj.gltfPath !== undefined) return 'FurnitureModel';
    if (obj.defCount !== undefined && obj.items !== undefined) return 'ParametricModelV2';
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
                    copy.bool = def.bool.map((b: BooleanOp, bi: number) => {
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

function BoolRotationSliders({ model, defIndex, boolIndex, rotation }: {
    model: ParametricModel;
    defIndex: number;
    boolIndex: number;
    rotation: { x: number; y: number; z: number };
}) {
    const handleChange = useCallback(
        (axis: 'x' | 'y' | 'z', v: number) => {
            const currentParams = model.params;
            if (!currentParams) return;
            const newParams = currentParams.map((def, di) => {
                if (di !== defIndex) return def;
                const copy = { ...def };
                if (def.bool) {
                    copy.bool = def.bool.map((b: BooleanOp, bi: number) => {
                        if (bi !== boolIndex) return b;
                        return { ...b, rotation: { ...rotation, [axis]: v } };
                    });
                }
                return copy;
            });
            model.params = newParams;
        },
        [model, defIndex, boolIndex, rotation],
    );

    return (
        <div className="flex flex-col gap-0.5 pl-2 border-l border-purple-500/20">
            <span className="text-[11px] text-purple-400/70 font-mono">旋转</span>
            {(['x', 'y', 'z'] as const).map(axis => (
                <SliderRow
                    key={axis}
                    label={axis.toUpperCase()}
                    value={rotation[axis]}
                    min={-Math.PI} max={Math.PI} step={0.01}
                    onChange={v => handleChange(axis, v)}
                />
            ))}
        </div>
    );
}

function BoolBlock({ op, index, defIndex, model }: { op: BooleanOp; index: number; defIndex: number; model: ParametricModel }) {
    const [open, setOpen] = useState(true);
    const paramEntries = Object.entries(op.shape.params ?? {});
    const boolLabel = BOOL_LABELS[op.type] ?? op.type;
    const boolRotation = op.rotation ?? { x: 0, y: 0, z: 0 };

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
                    <BoolRotationSliders model={model} defIndex={defIndex} boolIndex={index} rotation={boolRotation} />
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

/** Slider defaults when constraint meta doesn't specify range */
const VAR_DEFAULT_MIN = 0;
const VAR_DEFAULT_MAX = 100;
const VAR_DEFAULT_STEP = 1;

function ConstraintVariablesSection({ model }: { model: ParametricModelV2 }) {
    const [open, setOpen] = useState(true);
    // Re-render when model rebuilds (variables may change)
    useModelListener(model, 'change');

    const meta = model.constraintVariables;
    const vars = model.variables;

    // Local text-editing state for decimal input support
    const [editingVar, setEditingVar] = useState<{ name: string; text: string } | null>(null);

    const handleChange = useCallback(
        (name: string, v: number) => {
            model.setVariables({ ...vars, [name]: v });
        },
        [model, vars],
    );

    const handleTextFocus = useCallback(
        (name: string, currentValue: number) => {
            setEditingVar({ name, text: String(currentValue) });
        },
        [],
    );

    const handleTextCommit = useCallback(
        (name: string) => {
            if (!editingVar || editingVar.name !== name) return;
            const parsed = parseFloat(editingVar.text);
            if (isFinite(parsed)) {
                handleChange(name, parsed);
            }
            setEditingVar(null);
        },
        [editingVar, handleChange],
    );

    if (!meta || meta.length === 0) return null;

    return (
        <div className="flex flex-col gap-1 border-b border-gray-700/60 pb-3">
            <button
                className="flex items-center gap-1.5 text-left group"
                onClick={() => setOpen(o => !o)}
            >
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? '▾' : '▸'}
                </span>
                <span className="text-xs font-semibold text-cyan-400/80 uppercase tracking-wide">约束变量</span>
                <span className="text-[11px] text-gray-500 font-mono">{meta.length}</span>
            </button>
            {open && (
                <div className="flex flex-col gap-2 ml-1">
                    {meta.map((m) => {
                        const min = m.min ?? VAR_DEFAULT_MIN;
                        const max = m.max ?? VAR_DEFAULT_MAX;
                        const step = m.step ?? VAR_DEFAULT_STEP;
                        const currentValue = vars[m.name] ?? m.value;
                        const isEditing = editingVar?.name === m.name;

                        return (
                            <div key={m.name} className="flex flex-col gap-0.5">
                                {/* Variable name + description */}
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-[11px] font-semibold text-cyan-300/80 font-mono">{m.name}</span>
                                    {m.description && (
                                        <span className="text-[10px] text-gray-500 truncate">{m.description}</span>
                                    )}
                                </div>
                                {/* Slider + value */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min={min}
                                        max={max}
                                        step={step}
                                        value={currentValue}
                                        className="flex-1 h-1 accent-cyan-500 cursor-pointer"
                                        onChange={e => handleChange(m.name, parseFloat(e.target.value))}
                                    />
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            className="w-14 text-xs text-gray-200 bg-gray-800 border border-gray-600 rounded px-1 py-0.5 font-mono text-right tabular-nums"
                                            value={editingVar.text}
                                            autoFocus
                                            onChange={e => setEditingVar({ name: m.name, text: e.target.value })}
                                            onBlur={() => handleTextCommit(m.name)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleTextCommit(m.name);
                                                if (e.key === 'Escape') setEditingVar(null);
                                            }}
                                        />
                                    ) : (
                                        <span
                                            className="text-xs text-gray-300 w-14 text-right font-mono tabular-nums cursor-text hover:text-white transition-colors"
                                            onClick={() => handleTextFocus(m.name, currentValue)}
                                            title="点击编辑精确值"
                                        >
                                            {Math.round(currentValue * 100) / 100}
                                        </span>
                                    )}
                                </div>
                                {/* Range hint */}
                                {(m.min !== undefined || m.max !== undefined) && (
                                    <div className="flex justify-between text-[9px] text-gray-600 font-mono px-0.5">
                                        <span>{min}</span>
                                        <span>{max}</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

interface TransformSectionProps {
    model: ParametricModel | ParametricModelV2 | FurnitureModel;
    event?: string;
}

function TransformSection({ model, event = 'transformChange' }: TransformSectionProps) {
    // Listen to transform event to re-render sliders
    useModelListener(model, event);

    const pos = model.position;
    const rot = model.rotation;
    const scl = model.scale;

    // Model layer uses architectural coordinates (XY ground, Z-up)
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

const MATERIAL_LABELS: Record<string, string> = {
    name: '名称',
    color: '颜色',
    metalness: '金属度',
    roughness: '粗糙度',
    transparent: '透明',
    opacity: '不透明度',
    map: '贴图',
};

const TEXTURE_OPTIONS = Array.from({ length: 6 }, (_, i) => `/assets/material-${i}.jpg`);
const TEXTURE_KEYS = new Set(['map']);

const textureLoader = new THREE.TextureLoader();

function TexturePicker({
    currentSrc,
    onSelect,
    onClose,
}: {
    currentSrc: string | null;
    onSelect: (src: string) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div
            ref={ref}
            className="absolute z-50 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-2 grid grid-cols-3 gap-1.5"
            style={{ minWidth: 140 }}
        >
            {TEXTURE_OPTIONS.map(src => (
                <button
                    key={src}
                    className={`w-10 h-10 rounded border-2 overflow-hidden hover:border-blue-400 transition-colors ${
                        currentSrc === src ? 'border-blue-500' : 'border-gray-600'
                    }`}
                    onClick={() => {
                        onSelect(src);
                        onClose();
                    }}
                    title={src}
                >
                    <img src={src} alt={src} className="w-full h-full object-cover" />
                </button>
            ))}
            <button
                className="w-10 h-10 rounded border-2 border-gray-600 hover:border-red-400 transition-colors flex items-center justify-center text-gray-500 hover:text-red-400 text-xs"
                onClick={() => {
                    onSelect('');
                    onClose();
                }}
                title="清除贴图"
            >
                ✕
            </button>
        </div>
    );
}

function MaterialItem({ materialModel, label, defaultOpen = false }: { materialModel: Material; label: string; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    const materialData = useModelListener(materialModel, 'change');
    const [pickerKey, setPickerKey] = useState<string | null>(null);
    const entries = Object.entries(materialData).filter(([k]) => k !== 'id');

    const handleTextureSelect = useCallback(
        (key: string, src: string) => {
            if (!src) {
                (materialModel as any)[key] = null;
                return;
            }
            textureLoader.load(src, (texture) => {
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.name = src.split('/').pop() ?? src;
                texture.repeat.set(2, 2);
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                (materialModel as any)[key] = texture;
            });
        },
        [materialModel],
    );

    const handleColorChange = useCallback(
        (hex: string) => {
            materialModel.color = hex;
        },
        [materialModel],
    );

    const handleNumericChange = useCallback(
        (key: string, v: number) => {
            (materialModel as any)[key] = v;
        },
        [materialModel],
    );

    const handleBoolChange = useCallback(
        (key: string, v: boolean) => {
            (materialModel as any)[key] = v;
        },
        [materialModel],
    );

    return (
        <div className="flex flex-col gap-1">
            <button
                className="flex items-center gap-1.5 text-left group"
                onClick={() => setOpen(o => !o)}
            >
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                    {open ? '▾' : '▸'}
                </span>
                <span className="text-[11px] font-semibold text-emerald-400/80">{label}</span>
                {materialData.color && (
                    <span
                        className="inline-block w-2.5 h-2.5 rounded-sm border border-gray-600"
                        style={{ backgroundColor: materialData.color }}
                    />
                )}
                {materialData.map?.src && (
                    <img
                        src={materialData.map.src}
                        alt=""
                        className="w-3 h-3 rounded-sm border border-gray-600 object-cover"
                    />
                )}
            </button>
            {open && (
                <div className="flex flex-col gap-1.5 ml-1 pl-2 border-l border-gray-700/40">
                    {entries.map(([key, value]) => (
                        <div key={key} className="flex items-start gap-2">
                            <span className="text-[11px] text-gray-500 font-mono shrink-0 w-20">
                                {MATERIAL_LABELS[key] ?? key}
                            </span>
                            {key === 'color' ? (
                                <div className="flex items-center gap-1.5">
                                    <input
                                        type="color"
                                        value={value ?? '#cccccc'}
                                        className="w-5 h-5 rounded-sm border border-gray-600 cursor-pointer bg-transparent p-0"
                                        onChange={e => handleColorChange(e.target.value)}
                                    />
                                    <span className="text-xs text-gray-200 font-mono">{value}</span>
                                </div>
                            ) : key === 'metalness' || key === 'roughness' || key === 'opacity' ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <input
                                        type="range"
                                        min={0}
                                        max={1}
                                        step={0.01}
                                        value={value ?? 0}
                                        className="flex-1 h-1 accent-emerald-500 cursor-pointer"
                                        onChange={e => handleNumericChange(key, parseFloat(e.target.value))}
                                    />
                                    <span className="text-xs text-gray-300 font-mono tabular-nums w-8 text-right">
                                        {Math.round((value ?? 0) * 100) / 100}
                                    </span>
                                </div>
                            ) : TEXTURE_KEYS.has(key) ? (
                                <div className="relative">
                                    <button
                                        className="flex flex-col gap-0.5 cursor-pointer group/tex hover:opacity-80 transition-opacity"
                                        onClick={() => setPickerKey(pickerKey === key ? null : key)}
                                    >
                                        {value ? (
                                            <>
                                                {value.src && (
                                                    <img
                                                        src={value.src}
                                                        alt={value.name ?? key}
                                                        className="w-10 h-10 object-cover rounded border border-gray-600 group-hover/tex:border-blue-400 transition-colors"
                                                    />
                                                )}
                                                {value.name && (
                                                    <span className="text-xs text-gray-300 font-mono truncate max-w-32">
                                                        {value.name}
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="w-10 h-10 rounded border border-dashed border-gray-600 group-hover/tex:border-blue-400 flex items-center justify-center text-gray-600 group-hover/tex:text-blue-400 text-lg transition-colors">
                                                +
                                            </span>
                                        )}
                                    </button>
                                    {pickerKey === key && (
                                        <TexturePicker
                                            currentSrc={value?.src ?? null}
                                            onSelect={(src) => handleTextureSelect(key, src)}
                                            onClose={() => setPickerKey(null)}
                                        />
                                    )}
                                </div>
                            ) : typeof value === 'boolean' ? (
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={value}
                                        className="accent-emerald-500"
                                        onChange={e => handleBoolChange(key, e.target.checked)}
                                    />
                                    <span className={`text-xs font-mono ${value ? 'text-green-400' : 'text-gray-500'}`}>
                                        {value ? '是' : '否'}
                                    </span>
                                </label>
                            ) : (
                                <span className="text-xs text-gray-200 font-mono">{formatValue(value)}</span>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}


export function SelectionPanel() {
    const selectionManager = CoreApp.getInstance().getSelectionManager();
    const data = useModelListener(selectionManager);

    const count = data.count ?? 0;
    const first = data.first ?? null;
    const firstModel = selectionManager.getFirst();

    // Derive material model before early return to satisfy hooks rules
    const materialModel = (firstModel && 'material' in firstModel && firstModel.material instanceof Material)
        ? firstModel.material
        : null;
    // Reactive material data - triggers re-render on material change (hooks must be before early return)
    useModelListener(materialModel, 'change');

    // Listen to V2 material changes so the materials section re-renders
    const v2ModelForListener = firstModel instanceof ParametricModelV2 ? firstModel : null;
    useModelListener(v2ModelForListener, 'dirtyMaterial');

    if (count === 0 || !first) return null;

    const typeKey = getModelType(first, firstModel);
    const label = TYPE_LABELS[typeKey] ?? typeKey;

    const isParametric = firstModel instanceof ParametricModel;
    const isParametricV2 = firstModel instanceof ParametricModelV2;
    const isFurniture = firstModel instanceof FurnitureModel;
    const hasTransform = isParametric || isParametricV2 || isFurniture;
    const parametricMaterials = isParametric ? (firstModel as ParametricModel).materials : [];
    const parametricV2Materials = isParametricV2 ? (firstModel as ParametricModelV2).materials : [];
    const v2JscadCount = isParametricV2 ? ((firstModel as ParametricModelV2).graphData?.items.length ?? 0) : 0;
    const v2ModelLabels = isParametricV2 ? ((firstModel as ParametricModelV2).json?.models ?? []).map(m => m.label) : [];

    const excludeKeys = new Set(['id', 'outerContour', 'innerContours', 'material']);
    if (hasTransform) {
        excludeKeys.add('position');
        excludeKeys.add('rotation');
        excludeKeys.add('scale');
    }
    if (isParametric) {
        excludeKeys.add('params');
        excludeKeys.add('materials');
    }
    if (isParametricV2) {
        excludeKeys.add('defCount');
        excludeKeys.add('variables');
        excludeKeys.add('constraintVariables');
        excludeKeys.add('items');
        excludeKeys.add('materials');
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

            {/* Transform sliders for ParametricModel and FurnitureModel */}
            {hasTransform && (
                <div className="px-4 py-3">
                    <TransformSection
                        model={firstModel as ParametricModel | ParametricModelV2 | FurnitureModel}
                        event={isParametric ? 'transformChange' : isParametricV2 ? 'dirtyTransform' : 'change'}
                    />
                </div>
            )}

            {/* Structured params for ParametricModel */}
            {isParametric && firstModel instanceof ParametricModel && (
                <div className="px-4 py-3">
                    <ParamsSection model={firstModel} />
                </div>
            )}

            {/* Constraint variables for ParametricModelV2 */}
            {isParametricV2 && firstModel instanceof ParametricModelV2 && (
                <div className="px-4 py-3">
                    <ConstraintVariablesSection model={firstModel} />
                </div>
            )}

            {/* Materials for ParametricModelV2 */}
            {isParametricV2 && parametricV2Materials.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-700/60">
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">材质</span>
                        <span className="text-[11px] text-gray-500 font-mono">{parametricV2Materials.length} 个材质</span>
                        <div className="flex flex-col gap-2 ml-1">
                            {parametricV2Materials.map((mat, i) => {
                                const isGlb = i >= v2JscadCount;
                                const label = isGlb
                                    ? (v2ModelLabels[i - v2JscadCount] ?? `模型 ${i - v2JscadCount + 1}`)
                                    : `形状 ${i + 1}`;
                                return mat ? (
                                    <MaterialItem key={mat.id ?? i} materialModel={mat} label={label} />
                                ) : (
                                    <div key={`null-${i}`} className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-semibold text-emerald-400/80">{label}</span>
                                        <span className="text-[11px] text-gray-500 font-mono">原始材质</span>
                                        <button
                                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors ml-auto px-1"
                                            onClick={() => {
                                                (firstModel as ParametricModelV2).setMaterial(i, new Material());
                                            }}
                                        >
                                            + 添加
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Structured materials for ParametricModel */}
            {isParametric && parametricMaterials.length > 0 && (
                <div className="px-4 py-3 border-b border-gray-700/60">
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">材质</span>
                        <span className="text-[11px] text-gray-500 font-mono">{parametricMaterials.length} 个材质</span>
                        <div className="flex flex-col gap-2 ml-1">
                            {parametricMaterials.map((mat, i) =>
                                mat ? (
                                    <MaterialItem key={mat.id ?? i} materialModel={mat} label={`形状 ${i + 1}`} />
                                ) : (
                                    <div key={`null-${i}`} className="flex items-center gap-1.5">
                                        <span className="text-[11px] font-semibold text-emerald-400/80">形状 {i + 1}</span>
                                        <span className="text-[11px] text-gray-500 font-mono">无材质</span>
                                        <button
                                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors ml-auto px-1"
                                            onClick={() => {
                                                const pm = firstModel as ParametricModel;
                                                const mats = [...pm.materials];
                                                mats[i] = new Material();
                                                pm.materials = mats;
                                            }}
                                        >
                                            + 添加
                                        </button>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Material section for non-parametric models (Wall, Floor, Face, etc.) */}
            {materialModel && (
                <div className="px-4 py-3 border-b border-gray-700/60">
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">材质</span>
                        <div className="flex flex-col gap-2 ml-1">
                            <MaterialItem materialModel={materialModel} label="材质" defaultOpen />
                        </div>
                    </div>
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
