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

// C-13: v2 post graph (thin real — plans stages, execute() throws
// POST_GRAPH_V2_PENDING until Phase 2 wires the GPU chain).
postPipelineSlot.provide(new PostGraph());

// C-14: camera-level temporal history + velocity-MRT uniform binder
// (`bindVelocityUniforms` seam in ForwardPass; armed no-op until a velocity
// frame is prepared).
provideVelocityHistory();

export { postPipelineSlot, PostGraph, planPostGraph, resolvePostGraph, type PostGraphLike, type PostGraphFrame } from "../post/PostGraph.js";
export { velocityHistorySlot, VelocityHistory, type VelocitySurface, type VelocityUniformBinder, bindVelocityUniforms } from "../forward/Velocity.js";
export { PostTimer } from "../post/PostTimer.js";
export { applyToneOperator, POST_TONE_OPERATORS, acesFilmicToneMapping, agxToneMapping, neutralToneMapping, reinhardToneMapping, linearToneMapping, cineonToneMapping, type AuraToneOperator, type Vec3 } from "../post/ToneOperators.js";
