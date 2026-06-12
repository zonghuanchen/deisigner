import type { MaterialData, ParametricDef, TextureOption } from '@designer/pm-engine';
import type * as THREE from 'three';

export type { TextureOption };

export interface DefGroup {
    group: THREE.Group;
    threeMat: THREE.MeshStandardMaterial;
}

/**
 * 约束定义：描述一个命名变量及其对实体参数的绑定关系
 * 存放在 demo.json 的 constraint 字段中
 */
export interface ConstraintEntry {
    name: string;           // 变量名（如 "width"）
    description: string;    // 变量描述
    value: number;          // 当前数值
    /** Slider minimum (optional) */
    min?: number;
    /** Slider maximum (optional) */
    max?: number;
    /** Slider step increment (optional) */
    step?: number;
    condition?: string;     // 条件表达式（如 "width > 10"），满足时绑定才生效
    bindings: Array<{       // 该变量驱动的参数绑定
        def?: number;       // 实体索引（对应 params 数组下标，与 model 互斥）
        model?: number;     // GLB 模型索引（对应 models 数组下标，与 def 互斥）
        path: string;       // 参数路径（如 "size.0" 或 "position.x"）
        expr: string;       // 表达式（如 "width * 2"）
    }>;
}

export interface Vec3Data { x: number; y: number; z: number }

export interface GlbModelItem {
    glb: string;        // GLB 文件 URL（webpack 解析后的路径）
    label: string;      // 模型显示名称
    position: Vec3Data;
    rotation: Vec3Data;
    scale: Vec3Data;
    material?: MaterialData;  // 可选材质覆盖（未设置时使用 GLB 内嵌材质）
}

export interface DemoData {
    params: ParametricDef[];
    constraint: ConstraintEntry[];
    models: GlbModelItem[];
}
