/**
 * PRD-03 Phase 2 — deferred v2 post-graph module barrel.
 *
 * Everything the v2 GPU chain needs that flag-off renderers must never pay
 * for: the §6.1 shader sources, the render-target pool, the `.cube` LUT
 * parser, and the additive bloom normalization. The ONLY import of this
 * module is `import("../post/v2Entry.js")` inside `PostprocessExecution`'s
 * v2 branch — the esbuild split point the post-bundle-split test asserts.
 * Never import it statically from a barrel or a device file.
 */

export { BLOOM_PREFILTER_GLSL, BLOOM_DOWNSAMPLE_GLSL, BLOOM_UPSAMPLE_GLSL } from "./shaders/bloom.glsl";
export { COMPOSITE_GLSL } from "./shaders/composite.glsl";
export { DISPLAY_GRADE_GLSL, LUT_BAKE_GLSL } from "./shaders/displayGrade.glsl";
export { FINALIZE_GLSL, FINALIZE_FXAA_FUSED_GLSL } from "./shaders/finalize.glsl";
export { FXAA_185_FNS_GLSL } from "./shaders/fxaa.glsl";
export { PostResources, type PostTargetKey } from "./PostResources";
export { DisplayLutCache, displayGradeKey, type DisplayGradeParams } from "./DisplayLutCache";
export { parseCubeLut } from "./CubeLut";
export { bloomNormalization } from "../postprocess/NativeBloomPyramid";
