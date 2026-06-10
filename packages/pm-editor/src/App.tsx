import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene3D } from './Scene3D';
import {
    ParametricModeler,
    ConstraintSystem,
    applyDefTransform,
    updateThreeMaterial,
    jscadToBufferGeometry,
} from '@designer/pm-engine';
import type { ParametricDef, BindingMap, VariableMap, MaterialData } from '@designer/pm-engine';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AddModelCommand } from './command';

// Component imports
import {
    type ConstraintEntry,
    type GlbModelItem,
    type DemoData,
    type DefGroup,
    TEXTURE_OPTIONS,
    requireTexture,
    GLB_OPTIONS,
    requireGlb,
    PRIMITIVE_3D_PRESETS,
    loadTexture,
    buildGroup,
    getBindingsForDef,
    getGlbCurrentMaterial,
    TransformEditor,
    MaterialEditor,
    ParamsEditor,
    DefDataPanel,
    VariablesPanel,
    GlbTransformEditor,
} from './component';

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_DATA: DemoData = require('./demo.json');
const INITIAL_DEFS: ParametricDef[] = DEMO_DATA.params;
const INITIAL_CONSTRAINTS: ConstraintEntry[] = DEMO_DATA.constraint;
const INITIAL_GLB_MODELS: GlbModelItem[] = DEMO_DATA.models ?? [];

// GLB 模型注册表：label → 原始模块路径
const GLB_MODEL_REGISTRY: Record<string, string> = Object.fromEntries(
    GLB_OPTIONS.map(o => [o.label, o.glb]),
);

// ─── Scene singleton ──────────────────────────────────────────────────────────

let scene3d: Scene3D | null = null;
const container = document.querySelector('#editor-3d') as HTMLElement | null;
if (container) {
    scene3d = new Scene3D(container);
}

const gltfLoader = new GLTFLoader();

export function App() {
    const [defs, setDefs] = useState<ParametricDef[]>(INITIAL_DEFS);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [bottomTab, setBottomTab] = useState<'shapes' | 'models'>('shapes');
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
    const [glbModels, setGlbModels] = useState<GlbModelItem[]>([]);
    const glbGroupsRef = useRef<THREE.Group[]>([]);
    const [selectedGlbIndex, setSelectedGlbIndex] = useState<number | null>(null);

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

        // Wire selection callback — supports both parametric defs (≥0) and GLB models (<0)
        scene3d.onSelect = (idx) => {
            if (idx === null) {
                setSelectedIndex(null);
                setSelectedGlbIndex(null);
            } else if (idx >= 0) {
                setSelectedIndex(idx);
                setSelectedGlbIndex(null);
            } else {
                setSelectedIndex(null);
                setSelectedGlbIndex(-(idx + 1));
            }
        };

        // Wire move callback: sync position when dragged in 3D
        // Position is in Z-up local space (root group handles Z-up → Y-up conversion)
        scene3d.onMove = (index, position) => {
            if (index >= 0) {
                setDefs(prev => prev.map((d, i) => {
                    if (i !== index) return d;
                    return { ...d, position: { x: position.x, y: position.y, z: position.z } };
                }));
            } else {
                const gi = -(index + 1);
                setGlbModels(prev => prev.map((m, i) => {
                    if (i !== gi) return m;
                    return { ...m, position: { x: position.x, y: position.y, z: position.z } };
                }));
            }
        };

        // Load initial GLB models from demo.json
        INITIAL_GLB_MODELS.forEach((modelData) => {
            loadGlbModelToScene(modelData);
        });

        return () => {
            scene3d!.onSelect = null;
            scene3d!.onMove = null;
            addCommandRef.current?.onComplete();
            groups.forEach(dg => scene3d!.removeDefGroup(dg.group));
            glbGroupsRef.current.forEach(g => scene3d!.removeDefGroup(g));
            glbGroupsRef.current = [];
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
            for (const [path, expr] of Object.entries(newBindings) as [string, string][]) {
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

            // 从最终位置反算 ParametricDef.position（已在 Z-up 本地空间）
            const newDef: ParametricDef = {
                type: preset.type as ParametricDef['type'],
                params: { ...preset.params },
                material: { color, roughness: 0.5, metalness: 0.1 },
                position: { x: position.x, y: position.y, z: position.z },
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

    // 加载 GLB 模型到场景并跟踪数据
    const loadGlbModelToScene = useCallback((modelData: GlbModelItem) => {
        if (!scene3d) return;
        gltfLoader.load(requireGlb(modelData.glb), (gltf) => {
            // GLB geometry is Y-up; add counter-rotation so it renders correctly under Z-up root
            const inner = new THREE.Group();
            inner.rotation.x = Math.PI / 2;
            inner.add(gltf.scene);

            const group = new THREE.Group();
            group.add(inner);
            group.position.set(modelData.position.x, modelData.position.y, modelData.position.z);
            group.rotation.set(modelData.rotation.x, modelData.rotation.y, modelData.rotation.z);
            group.scale.set(modelData.scale.x, modelData.scale.y, modelData.scale.z);

            const gi = glbGroupsRef.current.length;
            const negIndex = -(gi + 1);
            scene3d!.addDefGroup(group, negIndex);
            glbGroupsRef.current.push(group);
            setGlbModels(prev => [...prev, modelData]);
        });
    }, []);

    // 添加 GLB 模型：通过 AddModelCommand 交互式放置
    const handleAddGlbModel = useCallback((glbUrl: string, label: string) => {
        if (!scene3d) return;
        addCommandRef.current?.onComplete();

        gltfLoader.load(requireGlb(glbUrl), (gltf) => {
            // 创建半透明 ghost 预览
            const ghost = gltf.scene.clone(true);
            ghost.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const srcMat = child.material as THREE.MeshStandardMaterial;
                    child.material = new THREE.MeshStandardMaterial({
                        color: srcMat.color?.clone() ?? new THREE.Color(0xffffff),
                        transparent: true,
                        opacity: 0.5,
                        depthWrite: false,
                    });
                }
            });
            // GLB is Y-up; add counter-rotation so ghost renders correctly under Z-up root
            const ghostInner = new THREE.Group();
            ghostInner.rotation.x = Math.PI / 2;
            ghostInner.add(ghost);
            const ghostGroup = new THREE.Group();
            ghostGroup.add(ghostInner);

            const cmd = new AddModelCommand(scene3d);
            cmd.setGhost(ghostGroup);
            cmd.onConfirm = (position: THREE.Vector3) => {
                addCommandRef.current = null;
                // 加载实际模型并放置到场景中
                gltfLoader.load(requireGlb(glbUrl), (gltf2) => {
                    const inner = new THREE.Group();
                    inner.rotation.x = Math.PI / 2;
                    inner.add(gltf2.scene);

                    const group = new THREE.Group();
                    group.add(inner);
                    group.position.copy(position);

                    const gi = glbGroupsRef.current.length;
                    const negIndex = -(gi + 1);
                    scene3d!.addDefGroup(group, negIndex);
                    glbGroupsRef.current.push(group);

                    const newModel: GlbModelItem = {
                        glb: glbUrl,
                        label,
                        position: { x: position.x, y: position.y, z: position.z },
                        rotation: { x: 0, y: 0, z: 0 },
                        scale: { x: 1, y: 1, z: 1 },
                    };
                    setGlbModels(prev => [...prev, newModel]);
                    setSelectedGlbIndex(gi);
                    setSelectedIndex(null);
                    scene3d!.selectByIndex(negIndex);
                });
            };
            cmd.onCancel = () => {
                addCommandRef.current = null;
            };
            cmd.onExecute();
            addCommandRef.current = cmd;
        });
    }, []);

    // GLB 模型变换同步
    const handleGlbTransformChange = useCallback((index: number, update: Partial<GlbModelItem>) => {
        setGlbModels(prev => prev.map((m, i) => {
            if (i !== index) return m;
            return { ...m, ...update };
        }));
        const group = glbGroupsRef.current[index];
        if (group) {
            if (update.position) group.position.set(update.position.x, update.position.y, update.position.z);
            if (update.rotation) group.rotation.set(update.rotation.x, update.rotation.y, update.rotation.z);
            if (update.scale) group.scale.set(update.scale.x, update.scale.y, update.scale.z);
        }
    }, []);

    // GLB 模型材质更新：遍历所有 mesh 应用材质变更
    const handleGlbMaterialChange = useCallback((index: number, update: Partial<MaterialData>) => {
        setGlbModels(prev => prev.map((m, i) => {
            if (i !== index) return m;
            const current = m.material ?? getGlbCurrentMaterial(glbGroupsRef.current[i]);
            const newMat = { ...current, ...update };
            if (update.map === undefined && 'map' in update) {
                delete newMat.map;
            }
            return { ...m, material: newMat };
        }));
        const group = glbGroupsRef.current[index];
        if (!group) return;
        let tex: THREE.Texture | null | undefined;
        if ('map' in update) {
            tex = update.map ? loadTexture(update.map!) : null;
        }
        group.traverse(child => {
            if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
                updateThreeMaterial(child.material, update, update.color, tex);
            }
        });
    }, []);

    // 删除 GLB 模型
    const handleDeleteGlbModel = useCallback((index: number) => {
        if (!scene3d) return;
        const group = glbGroupsRef.current[index];
        if (group) scene3d.removeDefGroup(group);
        glbGroupsRef.current.splice(index, 1);
        // Re-register remaining GLB groups with new negative indices
        glbGroupsRef.current.forEach((g, i) => {
            scene3d!.addDefGroup(g, -(i + 1));
        });
        setSelectedGlbIndex(prev => {
            if (prev === null) return null;
            if (prev === index) return null;
            if (prev > index) return prev - 1;
            return prev;
        });
        setGlbModels(prev => prev.filter((_, i) => i !== index));
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
            <DefDataPanel defs={defs} selectedIndex={selectedIndex} constraints={constraints} glbModels={glbModels} />

            {/* Bottom panel */}
            <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-900/95 rounded-lg border border-gray-700 px-2 py-2 w-[680px]">
                {/* Tabs */}
                <div className="flex items-center gap-1 mb-2 border-b border-gray-700/60 pb-1.5">
                    <button
                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                            bottomTab === 'shapes'
                                ? 'text-white bg-blue-600/40 border border-blue-500/50'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 border border-transparent'
                        }`}
                        onClick={() => setBottomTab('shapes')}
                    >
                        形状
                    </button>
                    <button
                        className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                            bottomTab === 'models'
                                ? 'text-white bg-blue-600/40 border border-blue-500/50'
                                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 border border-transparent'
                        }`}
                        onClick={() => setBottomTab('models')}
                    >
                        模型
                    </button>
                </div>
                {/* Tab content */}
                {bottomTab === 'shapes' && (
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
                )}
                {bottomTab === 'models' && (
                    <div className="flex flex-wrap justify-center gap-1">
                        <button
                            className="h-[2rem] px-3 bg-gray-800 hover:bg-blue-600/40 rounded text-[10px] leading-tight text-gray-300 hover:text-white transition-colors border border-gray-700/50 hover:border-blue-500/50 flex items-center justify-center gap-1"
                            title="添加木板模型"
                            onClick={() => handleAddGlbModel(GLB_OPTIONS[0].glb, '木板')}
                        >
                            木板
                        </button>
                        <button
                            className="h-[2rem] px-3 bg-gray-800 hover:bg-blue-600/40 rounded text-[10px] leading-tight text-gray-300 hover:text-white transition-colors border border-gray-700/50 hover:border-blue-500/50 flex items-center justify-center gap-1"
                            title="添加单块木板模型"
                            onClick={() => handleAddGlbModel(GLB_OPTIONS[1].glb, '单块木板')}
                        >
                            单块木板
                        </button>
                        <button
                            className="h-[2rem] px-3 bg-gray-800 hover:bg-blue-600/40 rounded text-[10px] leading-tight text-gray-300 hover:text-white transition-colors border border-gray-700/50 hover:border-blue-500/50 flex items-center justify-center gap-1"
                            title="添加木板块模型"
                            onClick={() => handleAddGlbModel(GLB_OPTIONS[2].glb, '木板块')}
                        >
                            木板块
                        </button>
                    </div>
                )}
            </div>

            {/* Left panel */}
            <div
                className="pointer-events-auto absolute top-20 left-4 w-80 bg-gray-900/95 rounded-lg border border-gray-700 overflow-hidden flex flex-col"
                style={{ maxHeight: 'calc(100vh - 220px)' }}
            >
                {/* Scrollable list area: entity list + GLB model list */}
                <div className="overflow-y-auto shrink-0" style={{ maxHeight: '30vh' }}>
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
                                    setSelectedGlbIndex(null);
                                    scene3d?.selectByIndex(i);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        setSelectedIndex(i);
                                        setSelectedGlbIndex(null);
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
                
                {/* GLB 模型列表 */}
                {glbModels.length > 0 && (
                    <div className="px-4 py-3 border-b border-gray-700/60">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">模型列表</span>
                        <div className="flex flex-col gap-1 mt-2">
                            {glbModels.map((model, i) => (
                                <div
                                    key={i}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        setSelectedGlbIndex(i);
                                        setSelectedIndex(null);
                                        scene3d?.selectByIndex(-(i + 1));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            setSelectedGlbIndex(i);
                                            setSelectedIndex(null);
                                            scene3d?.selectByIndex(-(i + 1));
                                        }
                                    }}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors cursor-pointer ${
                                        selectedGlbIndex === i
                                            ? 'bg-blue-600/30 border border-blue-500/40'
                                            : 'bg-gray-800/60 border border-transparent hover:bg-gray-700/60'
                                    }`}
                                >
                                    <span
                                        className="w-5 h-5 rounded-sm shrink-0 overflow-hidden"
                                        style={(() => {
                                            const mat = model.material;
                                            if (mat?.map) return { backgroundImage: `url(${requireTexture(mat.map)})`, backgroundSize: 'cover' };
                                            if (mat?.color) return { backgroundColor: mat.color };
                                            return { backgroundColor: '#8b6914' };
                                        })()}
                                    />
                                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-gray-200">{model.label}</span>
                                            <div className="flex items-center gap-1 ml-auto shrink-0">
                                                <span className="text-[11px] text-gray-500">M{i}</span>
                                                <button
                                                    className="text-[11px] text-red-400/50 hover:text-red-300 transition-colors px-0.5"
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteGlbModel(i); }}
                                                    title="删除模型"
                                                >✕</button>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                                            {(() => {
                                                const mat = model.material;
                                                if (mat?.map) return <span className="text-amber-400/80">{TEXTURE_OPTIONS.find(t => t.url === mat.map)?.label ?? '贴图'}</span>;
                                                return <span>{mat?.color ?? '默认'}</span>;
                                            })()}
                                            <span>粗糙 {model.material?.roughness.toFixed(2) ?? '-'}</span>
                                            <span>金属 {model.material?.metalness.toFixed(2) ?? '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                </div>
                {/* end scrollable list area */}

                {/* 约束变量管理 */}
                <div className="shrink-0 overflow-y-auto" style={{ maxHeight: '20vh' }}>
                <VariablesPanel
                    constraints={constraints}
                    variables={variables}
                    onVariableChange={setVariables}
                    onConstraintRemove={name => {
                        // 从 constraints 中删除该变量条目，并从 variables 中移除
                        setConstraints(prev => prev.filter(c => c.name !== name));
                        setVariables((prev: VariableMap) => {
                            const next = { ...prev };
                            delete next[name];
                            return next;
                        });
                    }}
                    onResetAll={() => {
                        setVariables((prev: VariableMap) => {
                            const next = { ...prev };
                            for (const c of constraints) {
                                next[c.name] = c.value;
                            }
                            return next;
                        });
                    }}
                />
                </div>

                {/* Selected entity details */}
                {selectedDef && selectedDg ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
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
                ) : selectedGlbIndex !== null && glbModels[selectedGlbIndex] ? (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                        {/* GLB 模型变换编辑 */}
                        <div className="px-4 py-3 border-b border-gray-700/60">
                            <GlbTransformEditor
                                model={glbModels[selectedGlbIndex]}
                                onChange={update => handleGlbTransformChange(selectedGlbIndex!, update)}
                            />
                        </div>
                        {/* GLB 模型材质编辑 */}
                        <div className="px-4 py-3 border-b border-gray-700/60">
                            <MaterialEditor
                                material={
                                    glbModels[selectedGlbIndex].material ??
                                    (glbGroupsRef.current[selectedGlbIndex!]
                                        ? getGlbCurrentMaterial(glbGroupsRef.current[selectedGlbIndex!])
                                        : { color: '#cccccc', roughness: 0.5, metalness: 0.0 })
                                }
                                onChange={update => handleGlbMaterialChange(selectedGlbIndex!, update)}
                            />
                        </div>
                        <div className="px-4 py-3">
                            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">模型信息</span>
                            <div className="mt-2 flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-500 font-mono w-12">名称</span>
                                    <span className="text-xs text-gray-200 font-mono">{glbModels[selectedGlbIndex].label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-500 font-mono w-12">文件</span>
                                    <span className="text-[10px] text-gray-400 font-mono truncate">{glbModels[selectedGlbIndex].glb}</span>
                                </div>
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
