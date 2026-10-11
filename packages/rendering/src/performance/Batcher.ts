/**
 * @deprecated PRD-11 Wave D: `performance/Batcher` is a forwarding shim kept so
 * existing deep imports keep working unchanged. Static batching lives in
 * `batching/StaticMergePlanner` (`planBatches`); the legacy
 * `batchStaticRenderItems` helper lives in `SceneOptimization`. Import from
 * those modules directly — this file will be removed with the PRD-11 flag.
 */
/** @deprecated Import `planBatches` from `batching/StaticMergePlanner`. */
export { planBatches } from "../batching/StaticMergePlanner";
export type { BatchPlan, PlanBatchesOptions } from "../batching/StaticMergePlanner";
/** @deprecated Import `batchStaticRenderItems` from `SceneOptimization`. */
export { batchStaticRenderItems } from "../SceneOptimization";
export type { StaticBatchInput, StaticBatchOptions, StaticBatchResult } from "../SceneOptimization";
