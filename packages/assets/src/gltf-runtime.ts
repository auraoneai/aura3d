/** Narrow browser runtime used by typed GLB actors without the inspection/fixture barrel. */
export { createGLTFSceneAnimationRuntime } from "./GLTFAnimationRuntime.js";
export type {
  GLTFootPlantingApplyResult,
  GLTFootPlantingConfig,
  GLTFootPlantingLegConfig,
  GLTFSceneAnimationApplyResult,
  GLTFSceneAnimationMaterialSink,
  GLTFSceneAnimationRuntime,
  GLTFSceneAnimationRuntimeOptions,
  GLTFSceneAnimationRuntimeSnapshot,
  GLTFScenePose
} from "./GLTFAnimationRuntime.js";
export { loadProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
export type { ProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
