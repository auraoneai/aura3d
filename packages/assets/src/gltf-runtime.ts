/** Narrow browser runtime used by typed GLB actors without the inspection/fixture barrel. */
export { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime, GLTFSceneAnimationMixerBinding } from "./GLTFAnimationRuntime.js";
export {
  createGLTFSceneAssetResolver,
  createGLTFSceneSerializationAdapter,
  GLTF_SCENE_SERIALIZATION_ADAPTER_ID,
  loadVerifiedGLTFSceneAsset
} from "./GLTFSceneSerialization.js";
export type {
  GLTFSceneAnimationCallbacks,
  GLTFSceneAssetIdentity,
  GLTFSceneCallbackRebindContext,
  GLTFSceneSerializationActor,
  GLTFSceneSerializationOptions,
  RestoredGLTFScene,
  RestoredGLTFSceneActor,
  VerifiedGLTFSceneAsset
} from "./GLTFSceneSerialization.js";
export { parseGLTFRuntimeMaterialKey } from "./GLTFLoader.js";
export type {
  AddClipsFromRuntimeOptions,
  GLTFootPlantingApplyResult,
  GLTFootPlantingConfig,
  GLTFootPlantingLegConfig,
  GLTFSceneAnimationApplyResult,
  GLTFSceneAnimationMaterialApplyStatus,
  GLTFSceneAnimationMaterialBindingFailure,
  GLTFSceneAnimationMaterialBindingIssue,
  GLTFSceneAnimationMaterialBindingStatus,
  GLTFSceneAnimationMaterialSink,
  GLTFPoseConstraint,
  GLTFSceneAnimationRuntime,
  GLTFSceneAnimationRuntimeOptions,
  GLTFSceneAnimationMixerOptions,
  GLTFSceneAnimationMixerSerializedState,
  GLTFSceneAnimationRuntimeSnapshot,
  GLTFScenePose
} from "./GLTFAnimationRuntime.js";
export { loadProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
export type { ProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
export { GLTFSharedTextureCache } from "./GLTFSharedTextureCache.js";
export type { GLTFSharedTextureLease } from "./GLTFSharedTextureCache.js";
export { requestIdentity, requestIdentityDetails } from "./AssetLoader.js";
export type { AssetRequestIdentity, AssetRequestOptions, AssetIntegrity } from "./AssetLoader.js";
export { TextureResidencyController } from "./TextureResidencyController.js";
export type { TextureResidencyAdapter, TextureResidencyDemand, TextureResidencyLease, TextureResidencySnapshot, TextureResidencySource } from "./TextureResidencyController.js";
export type { GLTFTextureResidencyMip } from "./gltf/GLTFTextureResidency.js";
