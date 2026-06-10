/**
 * @designer/pm-engine — Node-graph parametric modeling engine
 * Built on @designer/core and @jscad/modeling
 */
export const VERSION = '1.0.0';

export { ParametricModeler } from './ParametricModeler';
export type { ParametricDef, MaterialData, TransformData, ShapeDef, BooleanOp, ParametricResult, GeometryData, GeometryUVs, BuildStep, BindingMap } from './ParametricModeler';
export { applyDefTransform, createThreeMaterial, updateThreeMaterial, jscadToBufferGeometry, buildMeshGroup } from './ThreeHelper';
export { ConstraintSystem } from './ConstraintSystem';
export type { VariableMap, EvalResult } from './ConstraintSystem';

// Asset Registry
export { TEXTURE_OPTIONS, GLB_OPTIONS, registerAssetResolvers, requireTexture, requireGlb } from './AssetRegistry';
export type { TextureOption, GlbOption } from './AssetRegistry';
