import * as THREE from 'three';
import {
    ParametricModeler,
    ConstraintSystem,
    applyDefTransform,
    createThreeMaterial,
    jscadToBufferGeometry,
    TEXTURE_OPTIONS,
    requireTexture,
} from '@designer/pm-engine';
import type { ParametricDef, BindingMap } from '@designer/pm-engine';
import type { ConstraintEntry, DefGroup } from './types';

// 纹理缓存，避免重复加载
const textureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

export function loadTexture(url: string): THREE.Texture {
    let tex = textureCache.get(url);
    if (!tex) {
        tex = textureLoader.load(requireTexture(url));
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        textureCache.set(url, tex);
    }
    return tex;
}

export function formatValue(v: any): string {
    if (v === null || v === undefined) return '-';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}

export function buildGroup(def: ParametricDef, cs?: ConstraintSystem, bindings?: BindingMap): DefGroup {
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

/**
 * 根据约束定义，为某个实体生成 BindingMap
 * 从所有约束中筛选 def 索引匹配的绑定，汇总为 path → expr 的映射
 */
export function getBindingsForDef(defIndex: number, constraints: ConstraintEntry[]): BindingMap {
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

/**
 * 根据约束定义，为某个 GLB 模型生成 BindingMap
 * 从所有约束中筛选 model 索引匹配的绑定，汇总为 path → expr 的映射
 */
export function getBindingsForModel(modelIndex: number, constraints: ConstraintEntry[]): BindingMap {
    const bindings: BindingMap = {};
    for (const c of constraints) {
        for (const b of c.bindings) {
            if (b.model === modelIndex) {
                bindings[b.path] = b.expr;
            }
        }
    }
    return bindings;
}

/** resolved URL → raw path 反向映射，延迟构建 */
let resolvedToRawMap: Map<string, string> | null = null;
function getResolvedToRaw(): Map<string, string> {
    if (!resolvedToRawMap) {
        resolvedToRawMap = new Map();
        for (const opt of TEXTURE_OPTIONS) {
            try { resolvedToRawMap.set(requireTexture(opt.url), opt.url); } catch { /* skip */ }
        }
    }
    return resolvedToRawMap;
}

/** 从 GLB 模型组中提取第一个 MeshStandardMaterial 的属性作为默认值 */
export function getGlbCurrentMaterial(group: THREE.Group): import('@designer/pm-engine').MaterialData {
    let found: THREE.MeshStandardMaterial | null = null;
    group.traverse(child => {
        if (!found && child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
            found = child.material;
        }
    });
    if (found) {
        const mat = found as THREE.MeshStandardMaterial;
        let mapUrl: string | undefined;
        if (mat.map) {
            const resolved = (mat.map.image as HTMLImageElement)?.src;
            mapUrl = resolved ? getResolvedToRaw().get(resolved) : undefined;
        }
        return {
            color: '#' + mat.color.getHexString(),
            roughness: mat.roughness,
            metalness: mat.metalness,
            ...(mapUrl ? { map: mapUrl } : {}),
        };
    }
    return { color: '#cccccc', roughness: 0.5, metalness: 0.0 };
}
