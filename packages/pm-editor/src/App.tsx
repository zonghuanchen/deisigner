import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene3D } from './Scene3D';
import { ParametricModeler, ConstraintSystem, applyDefTransform, createThreeMaterial, updateThreeMaterial, jscadToBufferGeometry } from '@designer/pm-engine';
import type { ParametricDef, BooleanOp, MaterialData, BuildStep, BindingMap, VariableMap } from '@designer/pm-engine';
import * as THREE from 'three';
import { AddModelCommand } from './command';

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

/**
 * 约束定义：描述一个命名变量及其对实体参数的绑定关系
 * 存放在 demo.json 的 constraint 字段中
 */
interface ConstraintEntry {
    name: string;           // 变量名（如 "width"）
    description: string;    // 变量描述
    value: number;          // 当前数值
    bindings: Array<{       // 该变量驱动的参数绑定
        def: number;        // 实体索引（对应 params 数组下标）
        path: string;       // 参数路径（如 "size.0"）
        expr: string;       // 表达式（如 "width * 2"）
    }>;
}

interface DemoData {
    params: ParametricDef[];
    constraint: ConstraintEntry[];
}

const DEMO_DATA: DemoData = require('./demo.json');
const INITIAL_DEFS: ParametricDef[] = DEMO_DATA.params;
const INITIAL_CONSTRAINTS: ConstraintEntry[] = DEMO_DATA.constraint;

/**
 * 根据约束定义，为某个实体生成 BindingMap
 * 从所有约束中筛选 def 索引匹配的绑定，汇总为 path → expr 的映射
 */
function getBindingsForDef(defIndex: number, constraints: ConstraintEntry[]): BindingMap {
    const bindings: BindingMap = {};
    for (const c of constraints) {
        for (const b of c.bindings) {
            if (b.def === defIndex) {
                bindings[b.path] = b.expr;
            }
        }
    }
    return bindings;
}

// ─── Scene singleton ──────────────────────────────────────────────────────────

let scene3d: Scene3D | null = null;
const container = document.querySelector('#editor-3d') as HTMLElement | null;
if (container) {
    scene3d = new Scene3D(container);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGroup(def: ParametricDef, cs?: ConstraintSystem, bindings?: BindingMap): DefGroup {
    // 若有约束系统和绑定，先解析绑定表达式
    const resolvedDef = cs ? cs.resolveDef(def, bindings) : def;
    const geometryData = ParametricModeler.buildGeometries([resolvedDef]);
    const mat = resolvedDef.material!;
    const texture = mat.map ? loadTexture(mat.map) : null;
    const threeMat = createThreeMaterial(mat, texture);
    const group = new THREE.Group();
    for (const data of geometryData) {
        const bufGeo = jscadToBufferGeometry(data.geometry, data.uvs);
        if (!bufGeo) continue;
        group.add(new THREE.Mesh(bufGeo, threeMat));
    }
    applyDefTransform(group, resolvedDef);
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
// 3D Primitives 完整列表（用于底部面板添加实体 + 布尔运算形状选择）
const PRIMITIVE_3D_PRESETS: { type: string; label: string; params: Record<string, any> }[] = [
    { type: 'cube',             label: '正方体',     params: { size: 1, center: [0, 0, 0.5] } },
    { type: 'cuboid',           label: '长方体',     params: { size: [1, 1, 1], center: [0, 0, 0.5] } },
    { type: 'cylinder',         label: '圆柱',       params: { radius: 0.5, height: 1, center: [0, 0, 0.5] } },
    { type: 'cylinderElliptic', label: '椭圆柱',     params: { height: 1, startRadius: [0.5, 0.3], endRadius: [0.5, 0.3], center: [0, 0, 0.5] } },
    { type: 'ellipsoid',        label: '椭球',       params: { radius: [0.5, 0.4, 0.3], center: [0, 0, 0.5] } },
    { type: 'geodesicSphere',   label: '测地球',     params: { radius: 0.5, frequency: 6 } },
    { type: 'roundedCuboid',    label: '圆角方体',   params: { size: [1, 1, 1], roundRadius: 0.1, center: [0, 0, 0.5] } },
    { type: 'roundedCylinder',  label: '圆角圆柱',   params: { height: 1, radius: 0.5, roundRadius: 0.1, center: [0, 0, 0.5] } },
    { type: 'sphere',           label: '球体',       params: { radius: 0.5, center: [0, 0, 0.5] } },
    { type: 'torus',            label: '环体',       params: { innerRadius: 0.2, outerRadius: 0.5 } },
    { type: 'polyhedron',       label: '多面体',     params: {
        points: [[0,0,0],[1,0,0],[0.5,1,0],[0.5,0.5,1]],
        faces: [[0,1,2],[0,1,3],[1,2,3],[0,2,3]],
    } },
];

const SHAPE_PRESETS: Record<string, { label: string; params: Record<string, any> }> =
    Object.fromEntries(PRIMITIVE_3D_PRESETS.map(p => [p.type, { label: p.label, params: p.params }]));

const SHAPE_TYPES = Object.keys(SHAPE_PRESETS);

// ─── Binding UI helpers ─────────────────────────────────────────────────────

function BindButton({ onClick }: { onClick: () => void }) {
    return (
        <button
            className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-gray-600 hover:text-orange-400 hover:bg-orange-600/10 rounded transition-colors"
            onClick={onClick}
            title="绑定表达式"
        >🔗</button>
    );
}

function BindingInput({
    path, expr, preview, onChange, onUnbind, label,
}: {
    path: string;
    expr: string;
    preview: string;
    onChange: (expr: string) => void;
    onUnbind: () => void;
    label: string;
}) {
    return (
        <div className="flex items-center gap-1.5 flex-1 min-w-0 pl-2 border-l-2 border-orange-500/40">
            {label && <span className="text-[11px] text-gray-500 font-mono w-4 shrink-0">{label}</span>}
            <input
                className="bg-orange-950/40 text-orange-300 text-[11px] font-mono rounded px-1.5 py-0.5 border border-orange-500/30 focus:border-orange-400 outline-none flex-1 min-w-0"
                value={expr}
                onChange={e => onChange(e.target.value)}
                placeholder="表达式"
            />
            <span className="text-[10px] text-emerald-400/70 font-mono shrink-0 tabular-nums">{preview}</span>
            <button
                className="shrink-0 w-5 h-5 flex items-center justify-center text-[10px] text-orange-400 hover:text-gray-300 hover:bg-gray-700/40 rounded transition-colors"
                onClick={onUnbind}
                title="解除绑定"
            >✕</button>
        </div>
    );
}

function ParamsEditor({
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
    const evalExpr = useCallback((expr: string): string => {
        const result = cs.evaluate(expr);
        return result.error ? `❗ ${result.error}` : `= ${result.value.toFixed(3)}`;
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
                                return (
                                    <div key={i} className="flex items-center gap-1">
                                        {isBound ? (
                                            <BindingInput
                                                path={path}
                                                expr={bindings[path]}
                                                preview={evalExpr(bindings[path])}
                                                onChange={e => updateBinding(path, e)}
                                                onUnbind={() => toggleBinding(path)}
                                                label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                            />
                                        ) : (
                                            <>
                                                <div className="flex-1 min-w-0">
                                                    <SliderRow
                                                        label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                                        value={v} min={0.05} max={10} step={0.05}
                                                        onChange={val => handleSizeAxis(i, val)}
                                                    />
                                                </div>
                                                <BindButton onClick={() => toggleBinding(path)} />
                                            </>
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
                                return (
                                    <div key={i} className="flex items-center gap-1">
                                        {isBound ? (
                                            <BindingInput
                                                path={path}
                                                expr={bindings[path]}
                                                preview={evalExpr(bindings[path])}
                                                onChange={e => updateBinding(path, e)}
                                                onUnbind={() => toggleBinding(path)}
                                                label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                            />
                                        ) : (
                                            <>
                                                <div className="flex-1 min-w-0">
                                                    <SliderRow
                                                        label={SIZE_AXIS_LABELS[i] ?? `${i}`}
                                                        value={v} min={-10} max={10} step={0.1}
                                                        onChange={val => {
                                                            const c = [...(def.params.center as number[])];
                                                            c[i] = val;
                                                            handleNumericParam('center', c as any);
                                                        }}
                                                    />
                                                </div>
                                                <BindButton onClick={() => toggleBinding(path)} />
                                            </>
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
                    return (
                        <div key={key} className="flex flex-col gap-0.5">
                            <span className="text-[11px] text-gray-500 font-mono">{key}</span>
                            <div className="flex items-center gap-1">
                                {isBound ? (
                                    <BindingInput
                                        path={key}
                                        expr={bindings[key]}
                                        preview={evalExpr(bindings[key])}
                                        onChange={e => updateBinding(key, e)}
                                        onUnbind={() => toggleBinding(key)}
                                        label=""
                                    />
                                ) : (
                                    <>
                                        <div className="flex-1 min-w-0">
                                            <SliderRow
                                                label=""
                                                value={value}
                                                min={isRadius ? 0.05 : 0.05}
                                                max={isRadius ? 5 : 10}
                                                step={0.05}
                                                onChange={v => handleNumericParam(key, v)}
                                            />
                                        </div>
                                        <BindButton onClick={() => toggleBinding(key)} />
                                    </>
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
            style={{ maxHeight: 'calc(100vh - 220px)' }}
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

// ─── Variables panel (constraint system) ─────────────────────────────────────

function VariablesPanel({
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

// ─── App ──────────────────────────────────────────────────────────────────────

export function App() {
    const [defs, setDefs] = useState<ParametricDef[]>(INITIAL_DEFS);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    // 约束数据（从 demo.json 的 constraint 字段初始化）
    const [constraints, setConstraints] = useState<ConstraintEntry[]>(INITIAL_CONSTRAINTS);
    // 变量从 constraints 中直接提取
    const [variables, setVariables] = useState<VariableMap>(() => {
        const vars: VariableMap = {};
        for (const c of INITIAL_CONSTRAINTS) {
            vars[c.name] = c.value;
        }
        return vars;
    });

    // ConstraintSystem 实例（单例）
    const csRef = useRef<ConstraintSystem | null>(null);
    if (!csRef.current) csRef.current = new ConstraintSystem();
    const cs = csRef.current;

    // Stable refs for Three.js objects (not causing re-renders)
    const defGroupsRef = useRef<DefGroup[]>([]);
    const addCommandRef = useRef<AddModelCommand | null>(null);

    // 变量变化时同步到 ConstraintSystem 并重建所有有绑定的实体
    useEffect(() => {
        cs.setVariables(variables);
        // 重建所有包含绑定的实体
        defs.forEach((def, i) => {
            const bindings = getBindingsForDef(i, constraints);
            if (Object.keys(bindings).length === 0) return;
            const dg = defGroupsRef.current[i];
            if (!dg || !scene3d) return;

            const oldChildren = [...dg.group.children];
            oldChildren.forEach(child => {
                dg.group.remove(child);
                if (child instanceof THREE.Mesh) child.geometry.dispose();
            });

            const resolvedDef = cs.resolveDef(def, bindings);
            const geometryData = ParametricModeler.buildGeometries([resolvedDef]);
            for (const data of geometryData) {
                const bufGeo = jscadToBufferGeometry(data.geometry, data.uvs);
                if (!bufGeo) continue;
                dg.group.add(new THREE.Mesh(bufGeo, dg.threeMat));
            }
            applyDefTransform(dg.group, resolvedDef);
        });
    }, [variables, cs, constraints]);

    // Build all groups on mount and wire up selection callback
    useEffect(() => {
        if (!scene3d) return;
        cs.setVariables(variables);
        // Build groups
        const groups: DefGroup[] = INITIAL_DEFS.map((def, i) => {
            const bindings = getBindingsForDef(i, INITIAL_CONSTRAINTS);
            const dg = buildGroup(def, cs, bindings);
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
            addCommandRef.current?.onComplete();
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

        // 解析约束表达式后重建几何体
        const bindings = getBindingsForDef(index, constraints);
        const resolvedDef = cs.resolveDef(newDef, bindings);
        const geometryData = ParametricModeler.buildGeometries([resolvedDef]);
        for (const data of geometryData) {
            const bufGeo = jscadToBufferGeometry(data.geometry, data.uvs);
            if (!bufGeo) continue;
            dg.group.add(new THREE.Mesh(bufGeo, dg.threeMat));
        }
    }, [cs, constraints]);

    // 更新某个实体的绑定（同步到 constraints 状态）
    const handleBindingsChange = useCallback((defIndex: number, newBindings: BindingMap) => {
        setConstraints(prev => {
            // 先清除该 defIndex 的所有旧绑定，再写入新绑定
            const updated = prev.map(c => ({
                ...c,
                bindings: c.bindings.filter(b => b.def !== defIndex),
            }));

            // 将新绑定按表达式分组合并到约束条目中
            // 若该 defIndex 的绑定引用了某个变量，则添加到对应变量的 bindings 中
            for (const [path, expr] of Object.entries(newBindings)) {
                // 找到表达式引用的变量名（简化：取第一个匹配的变量）
                const varNames = Object.keys(variables);
                let targetConstraint = updated.find(c =>
                    varNames.includes(c.name) && expr.includes(c.name)
                );
                // 找不到则创建一个新的约束条目
                if (!targetConstraint) {
                    const newName = `var_${defIndex}_${path.replace(/\./g, '_')}`;
                    targetConstraint = { name: newName, description: '', value: 1, bindings: [] };
                    updated.push(targetConstraint);
                }
                targetConstraint.bindings.push({ def: defIndex, path, expr });
            }

            return updated;
        });
    }, [variables]);

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
                let tex: THREE.Texture | null | undefined;
                if ('map' in update) {
                    tex = update.map ? loadTexture(update.map) : null;
                }
                updateThreeMaterial(dg.threeMat, update, newMat.color, tex);
            }
            return newDefs;
        });
    }, []);

    // 添加实体：通过 AddModelCommand 交互式放置
    const handleAddEntity = useCallback((preset: typeof PRIMITIVE_3D_PRESETS[number]) => {
        if (!scene3d) return;

        // 完成当前正在执行的添加命令（如有）
        addCommandRef.current?.onComplete();

        const colors = ['#6c8ebf', '#6ebf7a', '#bf8a6c', '#9b6cbf', '#bf6c8a', '#8abf6c'];
        const color = colors[defGroupsRef.current.length % colors.length];

        // 构建用于预览的 ghost（半透明）
        const ghostDef: ParametricDef = {
            type: preset.type as ParametricDef['type'],
            params: { ...preset.params },
            material: { color, roughness: 0.5, metalness: 0.1 },
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
        };
        const ghost = buildGroup(ghostDef, cs);
        // 半透明效果
        ghost.threeMat.transparent = true;
        ghost.threeMat.opacity = 0.5;
        ghost.threeMat.depthWrite = false;

        const cmd = new AddModelCommand(scene3d);
        cmd.setGhost(ghost.group);
        cmd.onConfirm = (position: THREE.Vector3) => {
            addCommandRef.current = null;

            // 从最终位置反算 ParametricDef.position（Three.js Y-up → model Z-up）
            const newDef: ParametricDef = {
                type: preset.type as ParametricDef['type'],
                params: { ...preset.params },
                material: { color, roughness: 0.5, metalness: 0.1 },
                position: { x: position.x, y: position.z, z: position.y },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { x: 1, y: 1, z: 1 },
            };

            const dg = buildGroup(newDef, cs);
            const newIndex = defGroupsRef.current.length;
            scene3d.addDefGroup(dg.group, newIndex);
            defGroupsRef.current.push(dg);

            setDefs(prev => [...prev, newDef]);
            setSelectedIndex(newIndex);
            scene3d.selectByIndex(newIndex);
        };
        cmd.onCancel = () => {
            addCommandRef.current = null;
            // 清理 ghost 几何体
            ghost.group.traverse(child => {
                if (child instanceof THREE.Mesh) child.geometry.dispose();
            });
            ghost.threeMat.dispose();
        };

        cmd.onExecute();
        addCommandRef.current = cmd;
    }, [cs]);

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

            {/* Bottom panel: add 3D primitives */}
            <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/95 rounded-lg border border-gray-700 px-2 py-2">
                <div className="flex flex-wrap justify-center gap-1">
                    {PRIMITIVE_3D_PRESETS.map(p => (
                        <button
                            key={p.type}
                            className="w-[3.5rem] h-[2rem] bg-gray-800 hover:bg-blue-600/40 rounded text-[10px] leading-tight text-gray-300 hover:text-white transition-colors border border-gray-700/50 hover:border-blue-500/50 text-center flex items-center justify-center"
                            title={`添加 ${p.label} (${p.type})`}
                            onClick={() => handleAddEntity(p)}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Left panel */}
            <div
                className="pointer-events-auto absolute top-20 left-4 w-80 bg-gray-900/95 rounded-lg border border-gray-700 overflow-hidden flex flex-col"
                style={{ maxHeight: 'calc(100vh - 220px)' }}
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

                {/* 约束变量管理 */}
                <VariablesPanel
                    constraints={constraints}
                    variables={variables}
                    onVariableChange={setVariables}
                    onConstraintRemove={name => {
                        // 从 constraints 中删除该变量条目，并从 variables 中移除
                        setConstraints(prev => prev.filter(c => c.name !== name));
                        setVariables(prev => {
                            const next = { ...prev };
                            delete next[name];
                            return next;
                        });
                    }}
                    onResetAll={() => {
                        setVariables(prev => {
                            const next = { ...prev };
                            for (const c of constraints) {
                                next[c.name] = c.value;
                            }
                            return next;
                        });
                    }}
                />

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
                                    variables={variables}
                                    cs={cs}
                                    bindings={getBindingsForDef(selectedIndex!, constraints)}
                                    onBindingsChange={newBindings => handleBindingsChange(selectedIndex!, newBindings)}
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
