/**
 * Lane prd03 barrel — owned by lane 03 (CONTRACTS.md §3.8). `provide()` calls
 * for lane 03's real implementations live here; the barrel is loaded through
 * `packages/rendering/src/index.ts` (`export * from "./lanes/index.js"`), so
 * registration happens at module evaluation. Every real stays behind its
 * contract flag at `get(flags)` time — providing never changes flag-off
 * behaviour.
 */

import { postPipelineSlot, PostGraph } from "../post/PostGraph.js";
import { provideVelocityHistory } from "../forward/Velocity.js";
import { registerShaderChunk, registerShaderFeature } from "../contracts/program.js";
import { registerIndirectFractionShader } from "../post/chunks/indirectFraction.glsl.js";
import { registerVelocityShader } from "../post/chunks/velocity.glsl.js";

// C-13: v2 post graph (thin real — plans stages, execute() throws
// POST_GRAPH_V2_PENDING until Phase 2 wires the GPU chain).
postPipelineSlot.provide(new PostGraph());

// C-14: camera-level temporal history + velocity-MRT uniform binder
// (`bindVelocityUniforms` seam in ForwardPass; armed no-op until a velocity
// frame is prepared).
provideVelocityHistory();

// Phase 3 (§6.3): the `prd03.indirectFraction` C-02 feature — writes f_ind
// into color0.a on forward HDR draws when the lane-01 generator is real.
// Registered unconditionally; selection is flag-gated (`A3D_QR_POST_AO`).
registerIndirectFractionShader(registerShaderChunk, registerShaderFeature);

// Phase 4 (§8.6): the `prd03.velocity` C-14 MRT feature — per-object motion
// vectors on the location-1/2 attachments. Selection is opt-in
// (`A3D_QR_POST_VELOCITY_MRT`) until Q-01-2 wires the MRT target.
registerVelocityShader(registerShaderChunk, registerShaderFeature);

export { postPipelineSlot, PostGraph, planPostGraph, resolvePostGraph, type PostGraphLike, type PostGraphFrame } from "../post/PostGraph.js";
export { velocityHistorySlot, VelocityHistory, postVelocityCoverage, type VelocitySurface, type VelocityUniformBinder, bindVelocityUniforms } from "../forward/Velocity.js";
export { PostTimer } from "../post/PostTimer.js";
export { applyToneOperator, POST_TONE_OPERATORS, acesFilmicToneMapping, agxToneMapping, neutralToneMapping, reinhardToneMapping, linearToneMapping, cineonToneMapping, type AuraToneOperator, type Vec3 } from "../post/ToneOperators.js";
export { MSAA_PIXEL_GUARD, resolvePostAntiAlias, type PostAntiAliasAuthoredMode, type PostAntiAliasInput, type PostAntiAliasResolution } from "../post/PostAntiAlias.js";
// Phase 5 (§6.8): C-27 → post tier mapping. Pure table data like
// `resolvePostAntiAlias` — stays on the critical path.
export { resolvePostTier, type PostTierContext, type PostTierResolution } from "../post/PostQualityTiers.js";
// Phase 2: graph descriptors + concrete option types (the §6.1 table is the
// contract real's own data — it stays on the critical path with PostGraph).
export {
  POST_STAGE_DESCRIPTORS,
  POST_INSERT_ANCHORS,
  type PostStageDescriptor,
  type PostStageInput,
  type PostTargetFormat,
  type GtaoOptions,
  type BloomOptionsV2,
  type TaaOptions,
  type DofOptions,
  type MotionBlurOptions,
  type GodRayOptions,
  type ColorGradeOptionsV2,
  type LutTexture3D,
  type AutoExposureOptionsV2,
  type Rgb
} from "../post/PostGraph.js";
// Phase-2 GPU modules (post/shaders/*, PostResources, CubeLut,
// bloomNormalization) deliberately do NOT export here: the v2 bundle gate
// requires `post/` GPU code to be reachable only through the deferred
// `import("../post/v2Entry.js")` in PostprocessExecution.
