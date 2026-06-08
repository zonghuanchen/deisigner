import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene3D } from './Scene3D';
import { jscadToBufferGeometry } from './jscadToThree';
import { ParametricModeler } from '@designer/pm-engine';
import type { ParametricDef, BooleanOp, MaterialData, BuildStep } from '@designer/pm-engine';
import * as THREE from 'three';

// 材质纹理贴图
import matTex0 from '@designer/assets/material-0.jpg';
import matTex1 from '@designer/assets/material-1.jpg';
import matTex2 from '@designer/assets/material-2.jpg';
import matTex3 from '@designer/assets/material-3.jpg';
import matTex4 from '@designer/assets/material-4.jpg';
import matTex5 from '@designer/assets/material-5.jpg';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TextureOption {
    label: string;
    url: string;
}

const TEXTURE_OPTIONS: TextureOption[] = [
    { label: '纹理 0', url: matTex0 },
    { label: '纹理 1', url: matTex1 },
    { label: '纹理 2', url: matTex2 },
    { label: '纹理 3', url: matTex3 },
    { label: '纹理 4', url: matTex4 },
    { label: '纹理 5', url: matTex5 },
];

// 纹理缓存，避免重复加载
const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();
function loadTexture(url: string): THREE.Texture {
    let tex = textureCache.get(url);
    if (!tex) {
        tex = textureLoader.load(url);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        textureCache.set(url, tex);
    }
    return tex;
}

interface DefGroup {
    group: THREE.Group;
    threeMat: THREE.MeshStandardMaterial;
}

// ─── Demo data ────────────────────────────────────────────────────────────────

const INITIAL_MATERIALS: MaterialData[] = [
    { color: '#6c8ebf', roughness: 0.6, metalness: 0.1 },
    { color: '#6ebf7a', roughness: 0.4, metalness: 0.2 },
    { color: '#bf8a6c', roughness: 0.5, metalness: 0.0 },
];

const INITIAL_DEFS: ParametricDef[] = [
    {
        type: 'cuboid',
        params: { size: [2, 2, 2], center: [0, 0, 1] },
        bool: [
            {
                type: 'subtract',
                shape: {
                    type: 'cylinder',
                    params: { radius: 0.5, height: 3, center: [0, 0, 1] },
                },
                rotation: { x: Math.PI / 4, y: 0, z: 0 },
            },
        ],
        material: INITIAL_MATERIALS[0],
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    },
    {
        type: 'sphere',
        params: { radius: 1, center: [4, 0, 1] },
        material: INITIAL_MATERIALS[1],
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    },
    {
        type: 'cylinder',
        params: { radius: 0.8, height: 2.5, center: [-4, 0, 1.25] },
        material: INITIAL_MATERIALS[2],
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
    },
];

// ─── Scene singleton ──────────────────────────────────────────────────────────

let scene3d: Scene3D | null = null;
const container = document.querySelector('#editor-3d') as HTMLElement | null;
if (container) {
    scene3d = new Scene3D(container);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Apply model-layer transforms (Z-up) to a THREE.Group (Y-up).
 * Coordinate conversion: model(x, y, z) → three(x, z, y)
 */
function applyDefTransform(group: THREE.Group, def: ParametricDef): void {
    const p = def.position;
    group.position.set(p?.x ?? 0, p?.z ?? 0, p?.y ?? 0);
    const r = def.rotation;
    group.rotation.set(r?.x ?? 0, r?.z ?? 0, r?.y ?? 0);
    const s = def.scale;
    group.scale.set(s?.x ?? 1, s?.z ?? 1, s?.y ?? 1);
}

function buildGroup(def: ParametricDef): DefGroup {
    const geometryData = ParametricModeler.buildGeometries([def]);
    const mat = def.material!;
    const hasTexture = !!mat.map;
    const threeMat = new THREE.MeshStandardMaterial({
        color: hasTexture ? 0xffffff : mat.color,
        roughness: mat.roughness,
        metalness: mat.metalness,
        side: THREE.DoubleSide,
        emissive: new THREE.Color(hasTexture ? 0x222222 : 0x000000),
    });
    if (hasTexture) {
        threeMat.map = loadTexture(mat.map!);
        threeMat.needsUpdate = true;
    }
    const group = new THREE.Group();
    for (const data of geometryData) {
        const bufGeo = jscadToBufferGeometry(data.geometry, data.uvs);
        if (!bufGeo) continue;
        group.add(new THREE.Mesh(bufGeo, threeMat));
    }
    applyDefTransform(group, def);
    return { group, threeMat };
}

const SIZE_AXIS_LABELS = ['X', 'Y', 'Z'];

function formatValue(v: any): string {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

// ─── Param slider row ─────────────────────────────────────────────────────────

function SliderRow({
    label, value, min, max, step, onChange,
}: {
    label: string; value: number; min: number; max: number; step: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="flex items-center gap-2 pl-2">
            <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0">{label}</span>
            <input
                type="range"
                min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="flex-1 accent-blue-500 h-1"
            />
            <span className="text-[11px] text-gray-300 font-mono w-10 text-right tabular-nums">
                {value.toFixed(2)}
            </span>
        </div>
    );
}

// ─── Transform editor (position / rotation / scale sliders) ─────────────────

const TRANSFORM_AXES = ['x', 'y', 'z'] as const;

function TransformEditor({
    def,
    onChange,
}: {
    def: ParametricDef;
    onChange: (newDef: ParametricDef) => void;
}) {
    const pos = def.position ?? { x: 0, y: 0, z: 0 };
    const rot = def.rotation ?? { x: 0, y: 0, z: 0 };
    const scl = def.scale ?? { x: 1, y: 1, z: 1 };

    const setVec = useCallback(
        (key: 'position' | 'rotation' | 'scale', axis: 'x' | 'y' | 'z', val: number) => {
            const cur = { ...(def[key] ?? (key === 'scale' ? { x: 1, y: 1, z: 1 } : { x: 0, y: 0, z: 0 })) };
            cur[axis] = val;
            onChange({ ...def, [key]: cur });
        },
        [def, onChange],
    );

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">变换</span>

            {/* Position */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-emerald-400/70 font-mono">位置</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={pos[axis]}
                        min={-10} max={10} step={0.1}
                        onChange={v => setVec('position', axis, v)}
                    />
                ))}
            </div>

            {/* Rotation */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-purple-400/70 font-mono">旋转</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={rot[axis]}
                        min={-Math.PI} max={Math.PI} step={0.01}
                        onChange={v => setVec('rotation', axis, v)}
                    />
                ))}
            </div>

            {/* Scale */}
            <div className="flex flex-col gap-0.5">
                <span className="text-[11px] text-amber-400/70 font-mono">缩放</span>
                {TRANSFORM_AXES.map(axis => (
                    <SliderRow
                        key={axis}
                        label={axis.toUpperCase()}
                        value={scl[axis]}
                        min={0.05} max={5} step={0.05}
                        onChange={v => setVec('scale', axis, v)}
                    />
                ))}
            </div>
        </div>
    );
}

// ─── Properties section (type + params + bool) ────────────────────────────────

const BOOL_TYPE_LABELS: Record<string, string> = {
    subtract: '差集',
    union: '并集',
    intersect: '交集',
};

// 可选的 JSCAD 基本形状类型及默认参数
const SHAPE_PRESETS: Record<string, { label: string; params: Record<string, any> }> = {
    cuboid:   { label: '长方体', params: { size: [1, 1, 1], center: [0, 0, 0.5] } },
    sphere:   { label: '球体',   params: { radius: 0.5, center: [0, 0, 0.5] } },
    cylinder: { label: '圆柱',   params: { radius: 0.5, height: 1, center: [0, 0, 0.5] } },
};

const SHAPE_TYPES = Object.keys(SHAPE_PRESETS);

function ParamsEditor({
    def,
    onChange,
}: {
    def: ParametricDef;
    onChange: (newDef: ParametricDef) => void;
}) {
    const paramEntries = Object.entries(def.params ?? {});

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
                            {(value as number[]).map((v, i) => (
                                <SliderRow
                                    key={i}
                                    label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                    value={v} min={0.05} max={10} step={0.05}
                                    onChange={val => handleSizeAxis(i, val)}
                                />
                            ))}
                        </div>
                    );
                }
                // center: array of numbers → per-axis sliders (allow negative)
                if (key === 'center' && Array.isArray(value) && value.every((v: any) => typeof v === 'number')) {
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            {(value as number[]).map((v, i) => (
                                <SliderRow
                                    key={i}
                                    label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                    value={v} min={-10} max={10} step={0.1}
                                    onChange={val => {
                                        const c = [...(def.params.center as number[])];
                                        c[i] = val;
                                        handleNumericParam('center', c as any);
                                    }}
                                />
                            ))}
                        </div>
                    );
                }
                // Single number → slider
                if (typeof value === 'number') {
                    const isRadius = key === 'radius';
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            <SliderRow
                                label=""
                                value={value}
                                min={isRadius ? 0.05 : 0.05}
                                max={isRadius ? 5 : 10}
                                step={0.05}
                                onChange={v => handleNumericParam(key, v)}
                            />
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
                    <div className="grid grid-cols-3 gap-1">
                        {(['subtract', 'union', 'intersect'] as const).map(opType => (
                            <div key={opType} className="flex flex-col gap-1">
                                <span className="text-[10px] text-gray-500 font-mono text-center">
                                    {BOOL_TYPE_LABELS[opType]}
                                </span>
                                <div className="flex gap-0.5">
                                    {SHAPE_TYPES.map(st => (
                                        <button
                                            key={st}
                                            className="flex-1 px-1 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] text-gray-400 hover:text-gray-200 transition-colors border border-gray-700/50 hover:border-gray-600"
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

// ─── Material section ─────────────────────────────────────────────────────────

function MaterialEditor({
    material,
    onChange,
}: {
    material: MaterialData;
    onChange: (update: Partial<MaterialData>) => void;
}) {
    const colorHex = material.color;
    const textureUrl = material.map ?? null;
    const hasTexture = !!material.map;

    const handleColor = useCallback((hex: string) => {
        onChange({ color: hex });
    }, [onChange]);

    const handleRoughness = useCallback((v: number) => {
        onChange({ roughness: v });
    }, [onChange]);

    const handleMetalness = useCallback((v: number) => {
        onChange({ metalness: v });
    }, [onChange]);

    const handleTexture = useCallback((url: string | undefined) => {
        onChange({ map: url });
    }, [onChange]);

    return (
        <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">外观</span>

            {/* Material picker: color + textures */}
            <div className="flex items-start gap-3">
                {/* Left: label */}
                <span className="text-[11px] text-gray-500 font-mono shrink-0 mt-1">材质</span>
                {/* Right: texture grid + color picker at bottom-right */}
                <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
                    {TEXTURE_OPTIONS.map(opt => (
                        <button
                            key={opt.url}
                            onClick={() => handleTexture(opt.url)}
                            className={`relative w-full aspect-square rounded overflow-hidden transition-colors ${
                                textureUrl === opt.url
                                    ? 'ring-2 ring-blue-500'
                                    : 'hover:opacity-80'
                            }`}
                            title={opt.label}
                        >
                            <img
                                src={opt.url}
                                alt={opt.label}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                    {/* Spacer */}
                    <div />
                    {/* 无贴图 */}
                    <button
                        onClick={() => handleTexture(undefined)}
                        className={`w-full aspect-square rounded text-[11px] text-gray-400 flex items-center justify-center transition-colors ${
                            !hasTexture
                                ? 'bg-blue-600/20 ring-2 ring-blue-500'
                                : 'bg-gray-800 hover:bg-gray-700'
                        }`}
                    >
                        无
                    </button>
                    {/* Color picker - bottom right */}
                    <div className="relative w-full aspect-square">
                        <button
                            className="w-full h-full rounded flex flex-col items-center justify-center gap-0.5 text-[10px] text-gray-400 bg-gray-800 hover:bg-gray-700 transition-colors"
                            title="拾色器"
                        >
                            <span className="w-4 h-4 rounded-sm border border-gray-600" style={{ backgroundColor: colorHex }} />
                            {colorHex}
                        </button>
                        <input
                            type="color"
                            value={colorHex}
                            onChange={e => {
                                handleTexture(undefined);
                                handleColor(e.target.value);
                            }}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                    </div>
                </div>
            </div>

            {/* Roughness */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono w-8 shrink-0">粗糙度</span>
                <div className="flex-1 min-w-0">
                    <SliderRow label="" value={material.roughness} min={0} max={1} step={0.01} onChange={handleRoughness} />
                </div>
            </div>

            {/* Metalness */}
            <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-500 font-mono w-8 shrink-0">金属度</span>
                <div className="flex-1 min-w-0">
                    <SliderRow label="" value={material.metalness} min={0} max={1} step={0.01} onChange={handleMetalness} />
                </div>
            </div>
        </div>
    );
}

// ─── Def Data Viewer (top-right panel) ────────────────────────────────────────

const BUILD_STEP_COLORS = ['#6c8ebf', '#e8a838', '#8b5cf6', '#22c55e', '#ef4444'];

function DefDataPanel({
    defs,
    selectedIndex,
}: {
    defs: ParametricDef[];
    selectedIndex: number | null;
}) {
    const [collapsed, setCollapsed] = useState(false);
    const selectedDef = selectedIndex !== null ? defs[selectedIndex] : null;
    const buildSteps = selectedDef ? ParametricModeler.buildSteps(selectedDef) : [];

    return (
        <div
            className="pointer-events-auto absolute top-20 right-4 w-96 bg-gray-900/95 rounded-lg border border-gray-700 overflow-hidden flex flex-col"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
        >
            <div
                className="px-4 py-2 border-b border-gray-700/60 flex items-center justify-between cursor-pointer select-none"
                onClick={() => setCollapsed(c => !c)}
            >
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {selectedDef ? `实体 #${selectedIndex} 构建过程` : 'ParametricDef 数据'}
                </span>
                <span className="text-[11px] text-gray-500 font-mono">
                    {collapsed ? '▶' : '▼'}
                </span>
            </div>
            {!collapsed && (
                <div className="flex-1 overflow-auto">
                    {/* Build steps */}
                    {buildSteps.length > 0 ? (
                        <div className="px-4 py-3 flex flex-col gap-2">
                            {buildSteps.map((step) => {
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
                                        {/* Show params for base shape */}
                                        {step.index === 0 && selectedDef && (
                                            <pre className="pl-7 text-[10px] leading-snug font-mono text-gray-400 whitespace-pre-wrap break-all">
                                                {JSON.stringify(selectedDef.params, null, 2)}
                                            </pre>
                                        )}
                                        {/* Show bool op params */}
                                        {step.index > 0 && selectedDef?.bool?.[step.index - 1] && (
                                            <pre className="pl-7 text-[10px] leading-snug font-mono text-gray-400 whitespace-pre-wrap break-all">
                                                {JSON.stringify(selectedDef.bool[step.index - 1].shape, null, 2)}
                                            </pre>
                                        )}
                                        {/* Arrow between steps */}
                                        {step.index < buildSteps.length - 1 && (
                                            <div className="pl-2.5 text-gray-600 text-xs">↓</div>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Final result summary */}
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
                    )}
                </div>
            )}
        </div>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
    const [defs, setDefs] = useState<ParametricDef[]>(INITIAL_DEFS);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    // Stable refs for Three.js objects (not causing re-renders)
    const defGroupsRef = useRef<DefGroup[]>([]);

    // Build all groups on mount and wire up selection callback
    useEffect(() => {
        if (!scene3d) return;
        // Build groups
        const groups: DefGroup[] = INITIAL_DEFS.map((def, i) => {
            const dg = buildGroup(def);
            scene3d!.addDefGroup(dg.group, i);
            return dg;
        });
        defGroupsRef.current = groups;

        // Focus camera on all groups combined
        const wrapper = new THREE.Group();
        groups.forEach(dg => wrapper.add(dg.group.clone()));
        scene3d.focusOn(wrapper);

        // Wire selection callback
        scene3d.onSelect = (idx) => setSelectedIndex(idx);

        // Wire move callback: sync ParametricDef position when dragged in 3D
        // Coordinate conversion (Three.js Y-up → model Z-up):
        //   def.x = group.x, def.y = group.z, def.z = group.y
        scene3d.onMove = (index, position) => {
            setDefs(prev => prev.map((d, i) => {
                if (i !== index) return d;
                return {
                    ...d,
                    position: { x: position.x, y: position.z, z: position.y },
                };
            }));
        };

        return () => {
            scene3d!.onSelect = null;
            scene3d!.onMove = null;
            groups.forEach(dg => scene3d!.removeDefGroup(dg.group));
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Show build process when selection changes
    useEffect(() => {
        if (!scene3d) return;
        scene3d.clearBuildProcess();
        if (selectedIndex === null) return;

        const def = defs[selectedIndex];
        const dg = defGroupsRef.current[selectedIndex];
        if (!def || !dg) return;

        const steps = ParametricModeler.buildSteps(def);
        scene3d.showBuildProcess(steps, dg.group);
    }, [selectedIndex, defs]);

    // When a def changes → rebuild that group's geometry (keep same material)
    const handleDefChange = useCallback((index: number, newDef: ParametricDef) => {
        setDefs(prev => prev.map((d, i) => (i === index ? newDef : d)));

        const dg = defGroupsRef.current[index];
        if (!dg || !scene3d) return;

        // Remove old meshes from group (keep the group container for selection)
        const oldChildren = [...dg.group.children];
        oldChildren.forEach(child => {
            dg.group.remove(child);
            if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
            }
        });

        // Rebuild geometry with the existing material
        const geometryData = ParametricModeler.buildGeometries([newDef]);
        for (const data of geometryData) {
            const bufGeo = jscadToBufferGeometry(data.geometry, data.uvs);
            if (!bufGeo) continue;
            dg.group.add(new THREE.Mesh(bufGeo, dg.threeMat));
        }
    }, []);

    // 删除实体
    const handleDeleteDef = useCallback((index: number) => {
        if (!scene3d) return;

        // Remove the 3D group from scene
        const dg = defGroupsRef.current[index];
        if (dg) {
            scene3d.removeDefGroup(dg.group);
        }

        // Remove from array
        defGroupsRef.current.splice(index, 1);

        // Re-register remaining groups with new indices (for picking)
        defGroupsRef.current.forEach((g, i) => {
            scene3d.addDefGroup(g.group, i);
        });

        // Adjust selection
        setSelectedIndex(prev => {
            if (prev === null) return null;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
        });

        setDefs(prev => prev.filter((_, i) => i !== index));
    }, []);

    // 仅更新变换（不重建几何体）
    const handleTransformChange = useCallback((index: number, newDef: ParametricDef) => {
        setDefs(prev => prev.map((d, i) => (i === index ? newDef : d)));

        const dg = defGroupsRef.current[index];
        if (dg) {
            applyDefTransform(dg.group, newDef);
        }
    }, []);

    // 更新材质（不重建几何体）
    const handleMaterialChange = useCallback((index: number, update: Partial<MaterialData>) => {
        setDefs(prev => {
            const def = prev[index];
            if (!def) return prev;
            const newMat = { ...def.material!, ...update };
            // map: undefined 表示清除贴图
            if (update.map === undefined && 'map' in update) {
                delete newMat.map;
            }
            const newDefs = prev.map((d, i) => i === index ? { ...d, material: newMat } : d);

            // 同步更新 Three.js 材质
            const dg = defGroupsRef.current[index];
            if (dg) {
                const threeMat = dg.threeMat;
                if (update.color !== undefined) {
                    threeMat.color.set(update.color);
                }
                if (update.roughness !== undefined) {
                    threeMat.roughness = update.roughness;
                }
                if (update.metalness !== undefined) {
                    threeMat.metalness = update.metalness;
                }
                if ('map' in update) {
                    if (update.map) {
                        threeMat.map = loadTexture(update.map);
                        threeMat.color.set(0xffffff);
                        threeMat.emissive.set(0x222222);
                    } else {
                        threeMat.map = null;
                        threeMat.color.set(newMat.color);
                        threeMat.emissive.set(0x000000);
                    }
                    threeMat.needsUpdate = true;
                }
            }
            return newDefs;
        });
    }, []);

    const selectedDef = selectedIndex !== null ? defs[selectedIndex] : null;
    const selectedDg = selectedIndex !== null ? defGroupsRef.current[selectedIndex] : null;

    return (
        <div className="pointer-events-none w-full h-full flex flex-col">
            {/* Header */}
            <div className="pointer-events-auto p-4 flex items-start justify-between">
                <div>
                    <h1 className="text-xl font-bold text-white">Parametric Model Editor</h1>
                    <p className="text-sm text-gray-400">点击 3D 场景中的实体以选中 · 左侧面板查看属性与材质</p>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                    共 {defs.length} 个实体
                </div>
            </div>

            {/* Right panel: live ParametricDef data */}
            <DefDataPanel defs={defs} selectedIndex={selectedIndex} />

            {/* Left panel */}
            <div
                className="pointer-events-auto absolute top-20 left-4 w-80 bg-gray-900/95 rounded-lg border border-gray-700 overflow-hidden flex flex-col"
                style={{ maxHeight: 'calc(100vh - 120px)' }}
            >
                {/* Selection list */}
                <div className="px-4 py-3 border-b border-gray-700/60">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">实体列表</span>
                    <div className="flex flex-col gap-1 mt-2">
                        {defs.map((def, i) => (
                            <div
                                key={i}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                    setSelectedIndex(i);
                                    scene3d?.selectByIndex(i);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setSelectedIndex(i);
                                        scene3d?.selectByIndex(i);
                                    }
                                }}
                                className={`flex items-start gap-2 px-2 py-1.5 rounded text-left transition-colors cursor-pointer ${
                                    selectedIndex === i
                                        ? 'bg-blue-600/30 border border-blue-500/40'
                                        : 'bg-gray-800/60 border border-transparent hover:bg-gray-700/60'
                                }`}
                            >
                                {/* Appearance preview */}
                                <span
                                    className="w-5 h-5 rounded-sm shrink-0 overflow-hidden mt-0.5"
                                    style={def.material?.map
                                        ? { backgroundImage: `url(${def.material.map})`, backgroundSize: 'cover' }
                                        : { backgroundColor: def.material?.color ?? '#cccccc' }
                                    }
                                />
                                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-gray-200">{def.type}</span>
                                        <div className="flex items-center gap-1 ml-auto shrink-0">
                                            <span className="text-[11px] text-gray-500">#{i}</span>
                                            <button
                                                className="text-[11px] text-red-400/50 hover:text-red-300 transition-colors px-0.5"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteDef(i);
                                                }}
                                                title="删除实体"
                                            >✕</button>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                                        {def.material?.map
                                            ? <span className="text-amber-400/80">
                                                {TEXTURE_OPTIONS.find(t => t.url === def.material?.map)?.label ?? '贴图'}
                                              </span>
                                            : <span>{def.material?.color ?? '#cccccc'}</span>
                                        }
                                        <span>粗糙 {def.material?.roughness.toFixed(2) ?? '-'}</span>
                                        <span>金属 {def.material?.metalness.toFixed(2) ?? '-'}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Selected entity details */}
                {selectedDef && selectedDg ? (
                    <div className="flex-1 overflow-y-auto">
                        {/* Transform (position / rotation / scale) */}
                        <div className="px-4 py-3 border-b border-gray-700/60">
                            <TransformEditor
                                def={selectedDef}
                                onChange={newDef => handleTransformChange(selectedIndex!, newDef)}
                            />
                        </div>

                        {/* Material / Appearance */}
                        <div className="px-4 py-3 border-b border-gray-700/60">
                            <MaterialEditor
                                material={selectedDef.material!}
                                onChange={(update) => handleMaterialChange(selectedIndex!, update)}
                            />
                        </div>

                        {/* Properties */}
                        <div className="px-4 py-3">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">属性</span>
                            <div className="mt-2">
                                <ParamsEditor
                                    def={selectedDef}
                                    onChange={newDef => handleDefChange(selectedIndex!, newDef)}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="px-4 py-6 text-center">
                        <p className="text-sm text-gray-500">未选中任何实体</p>
                        <p className="text-xs text-gray-600 mt-1">在 3D 场景中点击以选中</p>
                    </div>
                )}
            </div>
        </div>
    );
}
