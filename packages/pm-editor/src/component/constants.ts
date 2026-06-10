import type { TextureOption } from './types';

// 静态 require 映射 —— webpack 可在编译期解析每个字面量路径
const TEXTURE_REQUIRE_MAP: Record<string, string> = {
    '@designer/assets/material-0.jpg': require('@designer/assets/material-0.jpg'),
    '@designer/assets/material-1.jpg': require('@designer/assets/material-1.jpg'),
    '@designer/assets/material-2.jpg': require('@designer/assets/material-2.jpg'),
    '@designer/assets/material-3.jpg': require('@designer/assets/material-3.jpg'),
    '@designer/assets/material-4.jpg': require('@designer/assets/material-4.jpg'),
    '@designer/assets/material-5.jpg': require('@designer/assets/material-5.jpg'),
};

// 材质纹理贴图 —— url 存储原始模块路径，可在 editor / pm-editor 间共享
export const TEXTURE_OPTIONS: TextureOption[] = [
    { label: '纹理 0', url: '@designer/assets/material-0.jpg' },
    { label: '纹理 1', url: '@designer/assets/material-1.jpg' },
    { label: '纹理 2', url: '@designer/assets/material-2.jpg' },
    { label: '纹理 3', url: '@designer/assets/material-3.jpg' },
    { label: '纹理 4', url: '@designer/assets/material-4.jpg' },
    { label: '纹理 5', url: '@designer/assets/material-5.jpg' },
];

/** 将原始模块路径解析为 webpack 资源 URL（通过静态映射） */
export function requireTexture(rawPath: string): string {
    const resolved = TEXTURE_REQUIRE_MAP[rawPath];
    if (!resolved) throw new Error(`requireTexture: unknown path "${rawPath}"`);
    return resolved;
}

// GLB 模型静态 require 映射
const GLB_REQUIRE_MAP: Record<string, string> = {
    '@designer/assets/WoodPlanks.glb': require('@designer/assets/WoodPlanks.glb'),
    '@designer/assets/WoodenPlank.glb': require('@designer/assets/WoodenPlank.glb'),
    '@designer/assets/WoodPlanksBlock.glb': require('@designer/assets/WoodPlanksBlock.glb'),
};

// GLB 模型选项 —— glb 字段存储原始模块路径
export const GLB_OPTIONS = [
    { label: '木板',     glb: '@designer/assets/WoodPlanks.glb' },
    { label: '单块木板', glb: '@designer/assets/WoodenPlank.glb' },
    { label: '木板块',   glb: '@designer/assets/WoodPlanksBlock.glb' },
];

/** 将 GLB 原始模块路径解析为 webpack 资源 URL */
export function requireGlb(rawPath: string): string {
    const resolved = GLB_REQUIRE_MAP[rawPath];
    if (!resolved) throw new Error(`requireGlb: unknown path "${rawPath}"`);
    return resolved;
}

export const SIZE_AXIS_LABELS = ['X', 'Y', 'Z'];

export const TRANSFORM_AXES = ['x', 'y', 'z'] as const;

export const BOOL_TYPE_LABELS: Record<string, string> = {
    subtract: '差集',
    union: '并集',
    intersect: '交集',
};

// 可选的 JSCAD 基本形状类型及默认参数
// 3D Primitives 完整列表（用于底部面板添加实体 + 布尔运算形状选择）
export const PRIMITIVE_3D_PRESETS: { type: string; label: string; params: Record<string, any> }[] = [
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

export const SHAPE_PRESETS: Record<string, { label: string; params: Record<string, any> }> =
    Object.fromEntries(PRIMITIVE_3D_PRESETS.map(p => [p.type, { label: p.label, params: p.params }]));

export const SHAPE_TYPES = Object.keys(SHAPE_PRESETS);

export const BUILD_STEP_COLORS = ['#6c8ebf', '#e8a838', '#8b5cf6', '#22c55e', '#ef4444'];
