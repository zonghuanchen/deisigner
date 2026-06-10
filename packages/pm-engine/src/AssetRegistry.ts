/**
 * Asset Registry — 共享资源选项与运行时解析
 *
 * pm-engine 只保存资源选项元数据和通用解析函数，
 * require() 等 webpack 特定的路径解析由消费方 (pm-editor / editor)
 * 在启动时通过 registerAssetResolvers 注册。
 */

// ────────────────────────────── Types ──────────────────────────────
export interface TextureOption {
    label: string;
    url: string;
}

export interface GlbOption {
    label: string;
    glb: string;
}

// ────────────────────────────── Options (静态元数据) ──────────────────────────────
export const TEXTURE_OPTIONS: TextureOption[] = [
    { label: '纹理 0', url: '@designer/assets/material-0.jpg' },
    { label: '纹理 1', url: '@designer/assets/material-1.jpg' },
    { label: '纹理 2', url: '@designer/assets/material-2.jpg' },
    { label: '纹理 3', url: '@designer/assets/material-3.jpg' },
    { label: '纹理 4', url: '@designer/assets/material-4.jpg' },
    { label: '纹理 5', url: '@designer/assets/material-5.jpg' },
];

export const GLB_OPTIONS: GlbOption[] = [
    { label: '木板',     glb: '@designer/assets/WoodPlanks.glb' },
    { label: '单块木板', glb: '@designer/assets/WoodenPlank.glb' },
    { label: '木板块',   glb: '@designer/assets/WoodPlanksBlock.glb' },
];

// ────────────────────────────── Resolver registry ──────────────────────────────
type ResolverMap = Record<string, string>;

let _textureResolvers: ResolverMap = {};
let _glbResolvers: ResolverMap = {};

/**
 * 消费方在启动时调用，注册 webpack require() 解析后的资源 URL 映射。
 *
 * @example
 * ```ts
 * registerAssetResolvers({
 *   textures: {
 *     '@designer/assets/material-0.jpg': require('@designer/assets/material-0.jpg'),
 *     // ...
 *   },
 *   glbs: {
 *     '@designer/assets/WoodPlanks.glb': require('@designer/assets/WoodPlanks.glb'),
 *     // ...
 *   },
 * });
 * ```
 */
export function registerAssetResolvers(opts: {
    textures?: ResolverMap;
    glbs?: ResolverMap;
}): void {
    if (opts.textures) _textureResolvers = { ..._textureResolvers, ...opts.textures };
    if (opts.glbs)     _glbResolvers     = { ..._glbResolvers,     ...opts.glbs };
}

/** 将纹理原始模块路径解析为运行时资源 URL */
export function requireTexture(rawPath: string): string {
    const resolved = _textureResolvers[rawPath];
    if (!resolved) throw new Error(`requireTexture: unknown path "${rawPath}"`);
    return resolved;
}

/** 将 GLB 原始模块路径解析为运行时资源 URL */
export function requireGlb(rawPath: string): string {
    const resolved = _glbResolvers[rawPath];
    if (!resolved) throw new Error(`requireGlb: unknown path "${rawPath}"`);
    return resolved;
}
