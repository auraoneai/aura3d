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
export { COMPOSITE_GLSL, CA_PASS_GLSL } from "./shaders/composite.glsl";
export { DISPLAY_GRADE_GLSL, LUT_BAKE_GLSL } from "./shaders/displayGrade.glsl";
export { FINALIZE_GLSL, FINALIZE_FXAA_FUSED_GLSL } from "./shaders/finalize.glsl";
export { FXAA_185_FNS_GLSL } from "./shaders/fxaa.glsl";
export { PostResources, type PostTargetKey } from "./PostResources";
// Phase 3: S1/S2/S4 GPU stages + C-02 indirect-fraction chunk + the v2 LDR
// tail executor. `post/chunks/` stays source-only (the feature registers in
// lanes/prd03, not through this deferred barrel).
export { DEPTH_LINEARIZE_GLSL, DEPTH_MINMAX_HALF_GLSL, CAMERA_VELOCITY_GLSL } from "./shaders/depthDownsample.glsl";
export { GTAO_GLSL } from "./shaders/gtao.glsl";
export { GTAO_DENOISE_GLSL, GTAO_APPLY_GLSL } from "./shaders/gtaoDenoise.glsl";
export { GODRAYS_GLSL } from "./shaders/godrays.glsl";
export { runV2HdrStages, runV2LdrTail, v2NeedsLdrTail, releaseV2Target, acquireV2Target } from "./v2Stages";
export { DisplayLutCache, displayGradeKey, type DisplayGradeParams } from "./DisplayLutCache";
export { parseCubeLut } from "./CubeLut";
export { bloomNormalization } from "../postprocess/NativeBloomPyramid";
