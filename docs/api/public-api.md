# Aura3D Public API Reference

This file is generated from every non-private package entrypoint under `packages/*/src/index.ts`.
It documents the public export surface that package consumers can import today.

Regenerate and verify it with:

```sh
pnpm verify:api-docs
```

## Packages

| Package | Version | Entrypoint | Export declarations |
|---|---:|---|---:|
| `@aura3d/animation` | `1.0.5` | `packages/animation/src/index.ts` | 38 |
| `@aura3d/apps` | `1.0.5` | `packages/apps/src/index.ts` | 10 |
| `@aura3d/asset-index` | `1.0.5` | `packages/asset-index/src/index.ts` | 26 |
| `@aura3d/assets` | `1.0.5` | `packages/assets/src/index.ts` | 81 |
| `@aura3d/audio` | `1.0.5` | `packages/audio/src/index.ts` | 24 |
| `@aura3d/cli` | `1.0.5` | `packages/aura3d-cli/src/index.ts` | 56 |
| `@aura3d/controls` | `1.0.5` | `packages/controls/src/index.ts` | 20 |
| `@aura3d/core` | `1.0.5` | `packages/core/src/index.ts` | 14 |
| `create-aura3d` | `1.1.0` | `packages/create-aura3d/src/index.ts` | 6 |
| `@aura3d/debug` | `1.0.5` | `packages/debug/src/index.ts` | 30 |
| `@aura3d/ecs` | `1.0.5` | `packages/ecs/src/index.ts` | 21 |
| `@aura3d/editor` | `1.0.5` | `packages/editor/src/index.ts` | 1 |
| `@aura3d/editor-runtime` | `1.0.5` | `packages/editor-runtime/src/index.ts` | 48 |
| `@aura3d/engine` | `1.0.5` | `packages/engine/src/index.ts` | 35 |
| `@aura3d/environments` | `1.0.5` | `packages/environments/src/index.ts` | 10 |
| `@aura3d/input` | `1.0.5` | `packages/input/src/index.ts` | 46 |
| `@aura3d/materials` | `1.0.5` | `packages/materials/src/index.ts` | 10 |
| `@aura3d/math` | `1.0.5` | `packages/math/src/index.ts` | 18 |
| `@aura3d/physics` | `1.0.5` | `packages/physics/src/index.ts` | 28 |
| `@aura3d/product-studio` | `1.0.5` | `packages/product-studio/src/index.ts` | 12 |
| `@aura3d/react` | `1.0.5` | `packages/react/src/index.ts` | 14 |
| `@aura3d/rendering` | `1.0.5` | `packages/rendering/src/index.ts` | 259 |
| `@aura3d/scene` | `1.0.5` | `packages/scene/src/index.ts` | 20 |
| `@aura3d/scripting` | `1.0.5` | `packages/scripting/src/index.ts` | 50 |
| `@aura3d/three-compat` | `1.0.5` | `packages/three-compat/src/index.ts` | 31 |
| `@aura3d/workflows` | `1.0.5` | `packages/workflows/src/index.ts` | 12 |

## @aura3d/animation

- Version: `1.1.0`
- Package manifest: `packages/animation/package.json`
- Public entrypoint: `packages/animation/src/index.ts`

### Export Declarations

```ts
export * from "./Keyframe.js";
export * from "./AnimationTrack.js";
export * from "./AnimationClip.js";
export * from "./AnimationEvents.js";
export * from "./AnimationAction.js";
export * from "./AnimationMixer.js";
export * from "./AnimationLayer.js";
export * from "./Bone.js";
export * from "./Skeleton.js";
export * from "./Skinning.js";
export * from "./BlendTree.js";
export * from "./AnimationStateMachine.js";
export * from "./RootMotion.js";
export * from "./MotionQuality.js";
export * from "./LocomotionController.js";
export * from "./SceneAnimationBridge.js";
export * from "./ECSAnimationBridge.js";
export * from "./IK.js";
export * from "./MotionMatchingFixtures.js";
export * from "./SecondaryAnimationFixtures.js";
export * from "./CrowdAnimation.js";
export * from "./Retargeting.js";
export * from "./AnimationClipEvents.js";
export { AnimationClipRegistry } from "./AnimationClipRegistry.js";
export type { AnimationClipDefinition, AnimationClipId, AnimationClipManifest, AnimationClipRegistryDiagnostic, AnimationClipRegistryDiagnosticSeverity, AnimationClipRegistryOptions, AnimationClipSampleContext, AnimationClipSampler, AnimationKeyframe, AnimationTrack as AnimationClipTrack, AnimationTrackTarget, RegisteredAnimationClip } from "./AnimationClipRegistry.js";
export * from "./AnimationController.js";
export * from "./HumanoidRetargeting.js";
export { AnimationClipThreeCompat } from "./threejs-compatibility/AnimationClip.js";
export type { ThreeCompatKeyframeTrack, ThreeCompatLoopMode } from "./threejs-compatibility/AnimationClip.js";
export { AnimationActionThreeCompat } from "./threejs-compatibility/AnimationAction.js";
export { AnimationMixerThreeCompat } from "./threejs-compatibility/AnimationMixer.js";
export { SkeletonThreeCompat } from "./threejs-compatibility/Skeleton.js";
export type { ThreeCompatBone } from "./threejs-compatibility/Skeleton.js";
export { SkinnedMeshThreeCompat } from "./threejs-compatibility/SkinnedMesh.js";
export { MorphTargetMixerThreeCompat } from "./threejs-compatibility/MorphTargetMixer.js";
export type { ThreeCompatMorphTargetWeight } from "./threejs-compatibility/MorphTargetMixer.js";
export { createThreeCompatAnimationDiagnostics, inspectThreeCompatAnimatedAssets, THREE_COMPAT_ANIMATED_GLTF_ASSETS } from "./threejs-compatibility/AnimationDiagnostics.js";
export type { ThreeCompatAnimatedAssetDiagnostic } from "./threejs-compatibility/AnimationDiagnostics.js";
```

## @aura3d/apps

- Version: `1.1.0`
- Package manifest: `packages/apps/package.json`
- Public entrypoint: `packages/apps/src/index.ts`

### Export Declarations

```ts
export type A3DAppQualityPreset = "draft" | "balanced" | "production";
export type A3DAppWorkflowPreset = "asset-viewer" | "product-configurator" | "material-studio" | "scene-showcase" | "interactive-scene";
export interface A3DAppQualitySettings { readonly preset: A3DAppQualityPreset;
export interface A3DAppOptions { readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
export interface A3DAppRendererLike { render(source: A3DWorkflowResult["source"], camera?: A3DWorkflowResult["camera"]): RenderDeviceDiagnostics;
export interface A3DAppDiagnostics { readonly appState: "ready" | "disposed";
export interface A3DApp { readonly engine: Engine;
export const A3D_APP_WORKFLOW_PRESETS: readonly A3DAppWorkflowPreset[] = [
export function resolveA3DAppQualityPreset(preset: A3DAppQualityPreset = "balanced", overrides: Pick<A3DAppOptions, "width" | "height"> = {}): A3DAppQualitySettings { const base = preset === "production" ? { width: 1600, height: 1000, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const } : preset === "draft" ? { width: 960, height: 540, antialias: false, preserveDrawingBuffer: false, targetFormat: "rgba8" as const } : { width: 1280, height: 720, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const };
export async function createA3DApp(options: A3DAppOptions = {}): Promise<A3DApp> { const quality = resolveA3DAppQualityPreset(options.quality, options);
```

## @aura3d/asset-index

- Version: `1.1.0`
- Package manifest: `packages/asset-index/package.json`
- Public entrypoint: `packages/asset-index/src/index.ts`

### Export Declarations

```ts
export type { AuraCanonicalAsset, AuraAssetLicense, AuraAssetLicenseSpdx, AuraAssetFormat, AuraAssetAccess, AuraAssetBounds, } from "./CanonicalAsset.js";
export { isAutoPullable, normalizeLicense } from "./CanonicalAsset.js";
export type { SourceAdapter, AdapterContext, AdapterRefreshResult, FetchJson, ResolveQuery, ResolveConstraints, } from "./SourceAdapter.js";
export { defaultFetchJson } from "./SourceAdapter.js";
export { scoreAsset, matchesConstraints } from "./ranking.js";
export type { ResolveCandidate, ResolveResult, FederatedResolverOptions, } from "./federate.js";
export { FederatedResolver } from "./federate.js";
export { createKhronosAdapter } from "./adapters/khronos.js";
export { createOS3AAdapter } from "./adapters/os3a.js";
export { createPolyHavenAdapter } from "./adapters/poly-haven.js";
export { createPolyPizzaAdapter } from "./adapters/poly-pizza.js";
export type { PolyPizzaAdapterOptions } from "./adapters/poly-pizza.js";
export { createSketchfabAdapter } from "./adapters/sketchfab.js";
export type { SketchfabAdapterOptions } from "./adapters/sketchfab.js";
export { createMarketplaceDeepLinkAdapter } from "./adapters/marketplace.js";
export { createJsDelivrMirrorAdapter } from "./adapters/jsdelivr-mirror.js";
export type { JsDelivrMirrorOptions } from "./adapters/jsdelivr-mirror.js";
export { createAuraIndexAdapter } from "./adapters/aura-index.js";
export type { AuraIndexAdapterOptions } from "./adapters/aura-index.js";
export { IndexStore, INDEX_STORE_SCHEMA } from "./IndexStore.js";
export type { IndexStoreFile } from "./IndexStore.js";
export { refreshIndex } from "./refresh.js";
export type { RefreshResult, RefreshOptions, WritableAssetIndex } from "./refresh.js";
export { LocalHashEmbedding, cosineSimilarity, assetEmbeddingText, embeddingRanker, DEFAULT_EMBEDDING_DIMS, } from "./embedding.js";
export type { EmbeddingProvider } from "./embedding.js";
export function defaultAdapters(): SourceAdapter[] { return [ createKhronosAdapter(), createOS3AAdapter(), createPolyHavenAdapter(), createJsDelivrMirrorAdapter(), ];
```

## @aura3d/assets

- Version: `1.1.0`
- Package manifest: `packages/assets/package.json`
- Public entrypoint: `packages/assets/src/index.ts`

### Export Declarations

```ts
export { AssetCache } from "./AssetCache";
export type { AssetCacheSnapshot } from "./AssetCache";
export { createAssetBundleCacheEvidence } from "./AssetBundleCacheFixtures";
export type { AssetBundleCacheEvictionPolicy, AssetBundleCacheEvidence, AssetBundleCacheInput, AssetBundleManifestEvidenceEntry } from "./AssetBundleCacheFixtures";
export { createGLTFSceneAnalysisEvidence } from "./SceneAnalysisFixtures";
export type { GLTFComputerVisionBoundingBox, GLTFObjectDetectionEvidence, GLTFObjectTrackEvidence, GLTFPoseEvidence, GLTFPoseKeypointEvidence, GLTFSceneAnalysisEvidence, GLTFSceneAnalysisOptions, GLTFSemanticSegment } from "./SceneAnalysisFixtures";
export { AssetDependencyGraph } from "./AssetDependencyGraph";
export { inspectGLTFAsset } from "./AssetInspection";
export type { GLTFAnimationInspection, GLTFAssetInspectionReport, GLTFDependencyInspection, GLTFMaterialInspection, GLTFMaterialTextureSlotInspection, GLTFMeshInspection, GLTFMorphTargetInspection, GLTFSceneHierarchyNodeInspection, GLTFSkinInspection, GLTFTextureInspection } from "./AssetInspection";
export { GLTF_DECODER_REQUIRED_EXTENSION_NAMES, GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES, GLTF_EXTENSION_SUPPORT_MATRIX, GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES, GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES, GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES, GLTF_SUPPORTED_EXTENSION_NAMES, evaluateGLTFExtensionSupport, getGLTFExtensionSupport } from "./GLTFExtensionSupport";
export type { GLTFExtensionSupportEntry, GLTFExtensionSupportEvaluation, GLTFExtensionSupportFamily, GLTFExtensionSupportStatus } from "./GLTFExtensionSupport";
export { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime, GLTFImportedSkeletonIKController, GLTFSceneAnimationCloneSampler, GLTFSceneAnimationMixerBinding, GLTFSceneAnimationRuntime, GLTFSceneMorphTargetController } from "./GLTFAnimationRuntime";
export type { GLTFImportedSkeletonIKControllerOptions, GLTFImportedSkeletonIKControllerSnapshot, GLTFImportedSkeletonIKOptions, GLTFImportedSkeletonIKResult, GLTFSceneAnimationApplyResult, GLTFSceneAnimationActionSnapshot, GLTFSceneAnimationCloneSample, GLTFSceneAnimationCloneSampleResult, GLTFSceneAnimationCloneSamplerSnapshot, GLTFSceneAnimationClipBindingDiagnostics, GLTFSceneAnimationMixerOptions, GLTFSceneAnimationPlayOptions, GLTFSceneAnimationMixerSnapshot, GLTFSceneAnimationMixerUpdateResult, GLTFSceneAnimationRuntimeOptions, GLTFSceneAnimationRuntimeSnapshot, GLTFSceneMorphTargetControllerOptions, GLTFSceneMorphTargetControllerSnapshot } from "./GLTFAnimationRuntime";
export { AssetHandle } from "./AssetHandle";
export type { AssetHandleOptions, AssetHandleStatus } from "./AssetHandle";
export { AssetLoadError } from "./AssetLoader";
export type { AssetLoader, AssetLoadProgress, AssetLoadRequest } from "./AssetLoader";
export { AssetManager } from "./AssetManager";
export type { AssetLoadOptions, AssetManagerOptions } from "./AssetManager";
export { AssetRegistry } from "./AssetRegistry";
export { createAssetImportPreflightReport, detectAssetImportFormat } from "./AssetImportPreflight";
export type { AssetImportPreflightFormat, AssetImportPreflightOptions, AssetImportPreflightProfile, AssetImportPreflightReport, AssetImportPreflightSettings, AssetImportPreflightStatus } from "./AssetImportPreflight";
export { createAssetCompatibilityReport } from "./AssetCompatibility";
export type { AssetCompatibilityLoaderName, AssetCompatibilityReport, AssetCompatibilityReportAsset, AssetCompatibilityReportOptions, AssetCompatibilityStatus, AssetLoaderCompatibilityResult, BlenderExportCompatibilityResult, ExternalAssetLoaderCompatibilityResult } from "./AssetCompatibility";
export { summarizeExternalParityGLTFCorpus, summarizeExternalParityCorpus, validateExternalParityGLTFCorpusManifest, validateExternalParityCorpusManifest } from "./ExternalParityGLTFCorpus";
export type { ExternalParityGLTFCorpusAsset, ExternalParityGLTFCorpusManifest, ExternalParityGLTFCorpusSummary, ExternalParityCorpusAsset, ExternalParityCorpusManifest, ExternalParityCorpusSummary } from "./ExternalParityGLTFCorpus";
export { loadThreeCompatAssetManifest, loadThreeCompatAssetRegistry, summarizeThreeCompatAssetRegistry } from "./threejs-compatibility/ThreeCompatAssetRegistry";
export { createThreeCompatAssetProvenance } from "./threejs-compatibility/ThreeCompatAssetProvenance";
export type { ThreeCompatAssetManifest, ThreeCompatAssetRegistrySummary } from "./threejs-compatibility/ThreeCompatAssetRegistry";
export type { ThreeCompatAssetProvenance, ThreeCompatSourceAsset, ThreeCompatTrackedAssetInput } from "./threejs-compatibility/ThreeCompatAssetProvenance";
export { createProductionGLTFRenderMetadata, createProductionAssetCorpusSummary, inspectProductionGlb, loadProductionGLTFRenderPipeline, loadProductionAssetManifest } from "./asset-corpus";
export type { ProductionAssetClass, ProductionAssetCorpusRequirements, ProductionAssetCorpusSummary, ProductionAssetManifest, ProductionAssetManifestEntry, ProductionAssetReadinessEntry, ProductionGLTFRenderMetadata, ProductionGLTFRenderWarning, ProductionGLTFRenderPipeline, ProductionGLTFRenderPipelineOptions, ProductionGlbInspection } from "./asset-corpus";
export { createAdvancedAssetCorpusSummary, inspectCurrentRoutesGlb, loadCurrentRoutesAssetManifest, writeAdvancedAssetCorpusReport } from "./AdvancedAssetCorpus";
export type { CurrentRoutesAssetClass, AdvancedAssetCorpusSummary, CurrentRoutesAssetManifest, CurrentRoutesAssetManifestEntry, CurrentRoutesAssetReadinessEntry, CurrentRoutesAssetRequirement, CurrentRoutesEnvironmentManifestEntry, CurrentRoutesEnvironmentReadinessEntry, CurrentRoutesGlbInspection } from "./AdvancedAssetCorpus";
export * from "./loaders";
export { DEFAULT_ASSET_IMPORT_SETTINGS, assertValidGLTFCorpusManifest, createGLTFCorpusReport, normalizeAssetImportSettings, validateGLTFCorpusManifest } from "./AssetCorpus";
export type { AssetDiagnostic, AssetDiagnosticSeverity, AssetImportSettings, GLTFCorpusAsset, GLTFCorpusAssetFormat, GLTFCorpusAssetReport, GLTFCorpusExpectedStatus, GLTFCorpusManifest, GLTFCorpusReport, GLTFCorpusSchemaVersion, GLTFCorpusSource, GLTFCorpusValidationResult } from "./AssetCorpus";
export { AudioLoader } from "./AudioLoader";
export type { AudioAsset, AudioDecodeContext } from "./AudioLoader";
export { assertValidBlenderExportFixtureManifest, createBlenderExportValidationReport } from "./BlenderExportValidation";
export type { BlenderExportFixture, BlenderExportFixtureInput, BlenderExportFixtureManifest, BlenderExportValidationDiagnostic, BlenderExportValidationFixtureResult, BlenderExportValidationReport, BlenderExportValidationStatus } from "./BlenderExportValidation";
export { createDracoDecoder, createMeshoptDecoder } from "./GLTFCompressionDecoders";
export type { GLTFDracoAttribute, GLTFDracoDecoderBuffer, GLTFDracoDecoderInstance, GLTFDracoDecoderModule, GLTFDracoMesh, GLTFDracoNumericArray, GLTFDracoStatus, GLTFMeshoptDecoderModule } from "./GLTFCompressionDecoders";
export { applyCarConceptMaterialStability, carConceptMaterialVisualRole, carConceptMaterialRenderStateOverrides } from "./CarConceptMaterialStability";
export type { CarConceptMaterialBaseline, CarConceptMaterialVisualRole, CarConceptMaterialStabilityOptions, CarConceptMaterialStabilityProfile } from "./CarConceptMaterialStability";
export { ImageLoader } from "./ImageLoader";
export type { ImageAsset } from "./ImageLoader";
export { GLTFLoader } from "./GLTFLoader";
export type { GLTFAsset, GLTFCameraAsset, GLTFClearcoatMaterialExtension, GLTFDracoDecodeDescriptor, GLTFDracoDecodedPrimitive, GLTFDracoDecoder, GLTFGeometryAsset, GLTFImageAsset, GLTFLightAsset, GLTFLoaderOptions, GLTFLoaderDiagnostics, GLTFMaterialAsset, GLTFMaterialVariantAsset, GLTFMaterialVariantMappingAsset, GLTFMeshAsset, GLTFMeshoptDecodeDescriptor, GLTFMeshoptDecoder, GLTFPBRSpecularGlossinessMaterialExtension, GLTFResolvedTextureInfo, GLTFSamplerAsset, GLTFSceneAsset, GLTFSceneCreateOptions, GLTFSheenMaterialExtension, GLTFSkinAsset, GLTFSpecularMaterialExtension, GLTFTextureAsset, GLTFTransmissionMaterialExtension, GLTFVolumeMaterialExtension, SerializedGLTFAsset } from "./GLTFLoader";
export { OBJLoader } from "./OBJLoader";
export { DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING, DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS, DEFAULT_GLTF_STUDIO_PREVIEW_FRAME, DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING, DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS, createDefaultGLTFHdrStudioPreviewEnvironmentLighting, createGLTFRenderResourceDiagnostics, createGLTFRenderResources, createGLTFRenderSource } from "./GLTFRenderResources";
export type { DecodedGLTFImage, GLTFImageDecoder, GLTFMaterialRenderStateOverride, GLTFMaterialOverrideQuery, GLTFMaterialOverrideTarget, GLTFRenderableBinding, GLTFRenderResourceDiagnostics, GLTFRenderResourceDiagnosticsOptions, GLTFRenderResourceTextureSlotDiagnostic, GLTFRenderQualityPreset, GLTFRendererInput, GLTFRendererInputOptions, GLTFRenderResourceOptions, GLTFRenderSourceOptions, GLTFRenderResources } from "./GLTFRenderResources";
export { createAssetRenderDefaults, DEFAULT_ASSET_RENDER_VIEWPORT } from "./AssetRenderDefaults";
export type { AssetRenderDefaults, AssetRenderLightingPreset } from "./AssetRenderDefaults";
export { loadRenderableAsset } from "./loadRenderableAsset";
export type { LoadRenderableAssetOptions, RenderableAsset, RenderableAssetKind } from "./loadRenderableAsset";
export { createRenderableScene } from "./createRenderableScene";
export type { CreateRenderableSceneOptions, RenderableScene } from "./createRenderableScene";
export { transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder";
export type { KTX2BasisTargetFormat, KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";
export { ImportPipeline, ImportPipelineError } from "./ImportPipeline";
export type { ImportPipelineContext, ImportPipelineProgressEvent, ImportPipelineProgressStatus, ImportStage } from "./ImportPipeline";
export { LoadContext } from "./LoadContext";
export type { LoadContextOptions } from "./LoadContext";
export { MaterialLoader, createMaterialFromDescriptor } from "./MaterialLoader";
export type { MaterialDescriptorAsset } from "./MaterialLoader";
export { createMeshOptimizationStage, optimizeIndexedMesh } from "./MeshOptimization";
export type { MeshAttributeValue, MeshOptimizationInput, MeshOptimizationResult, MeshOptimizationStageOptions } from "./MeshOptimization";
export { SceneLoader } from "./SceneLoader";
export type { NativeSceneAsset, NativeSceneNodeDescriptor } from "./SceneLoader";
export { ShaderLoader } from "./ShaderLoader";
export type { ShaderSourceAsset } from "./ShaderLoader";
export { createTextureMipGenerationStage, generateTextureMipChain } from "./TexturePipeline";
export type { TextureMipGenerationInput, TextureMipGenerationResult, TextureMipGenerationStageOptions, TextureMipLevel } from "./TexturePipeline";
export { TextureLoader } from "./TextureLoader";
export type { TextureDescriptorAsset } from "./TextureLoader";
export { WorkerAssetJobs } from "./WorkerAssetJobs";
export type { WorkerAssetJob, WorkerAssetJobRunner } from "./WorkerAssetJobs";
export * from "./HDRLoader.js";
export * from "./EXRLoader.js";
export * from "./TextureStreaming.js";
```

## @aura3d/audio

- Version: `1.1.0`
- Package manifest: `packages/audio/package.json`
- Public entrypoint: `packages/audio/src/index.ts`

### Export Declarations

```ts
export { AudioBus } from "./AudioBus";
export { AudioClip } from "./AudioClip";
export type { AudioClipOptions } from "./AudioClip";
export { sampleAudioEffectsAnalysisFixture } from "./AudioEffectsAnalysisFixtures";
export type { AudioChorusPreset, AudioCompressorPreset, AudioDelayPreset, AudioDistortionCurve, AudioEffectsAnalysisFixture, AudioEffectsAnalysisFixtureOptions, AudioEqBandFixture, AudioSpectrumBandFixture } from "./AudioEffectsAnalysisFixtures";
export { sampleAdaptiveMusicFixture } from "./AdaptiveMusicFixtures";
export type { AdaptiveMusicCrossfadeCurve, AdaptiveMusicFixture, AdaptiveMusicFixtureOptions, AdaptiveMusicFixtureState, AdaptiveMusicLayerMix } from "./AdaptiveMusicFixtures";
export { sampleAudioEnvironmentFixture } from "./SpatialAudioFixtures";
export type { AudioEnvironmentFixture, AudioEnvironmentFixtureOptions, AudioOcclusionLevel } from "./SpatialAudioFixtures";
export { AudioContextManager } from "./AudioContextManager";
export type { AudioContextLike, AudioContextManagerOptions, AudioContextState } from "./AudioContextManager";
export type { AudioEffect } from "./AudioEffect";
export { AudioListener } from "./AudioListener";
export type { Vec3Like } from "./AudioListener";
export { AudioMixer } from "./AudioMixer";
export { AudioSource } from "./AudioSource";
export type { AudioSourceOptions, AudioSourceState } from "./AudioSource";
export { AudioSystem } from "./AudioSystem";
export { SceneAudioBridge } from "./SceneAudioBridge";
export type { SceneAudioSourceBinding } from "./SceneAudioBridge";
export { SpatialAudio } from "./SpatialAudio";
export type { SpatialAudioOptions } from "./SpatialAudio";
export { FilterEffect } from "./effects/Filter";
export { ReverbEffect } from "./effects/Reverb";
```

## @aura3d/cli

- Version: `1.1.0`
- Package manifest: `packages/aura3d-cli/package.json`
- Public entrypoint: `packages/aura3d-cli/src/index.ts`

### Export Declarations

```ts
export type AuraCliAssetType = "model" | "texture" | "environment" | "audio";
export type AuraCliHumanoidStatus = "humanoid" | "non-humanoid" | "unknown";
export type AuraCliHumanoidConfidence = "high" | "medium" | "low";
export interface AuraCliAnimationInspection { readonly clipCount: number;
export interface AuraCliAnimationClipInspection { readonly index: number;
export interface AuraCliSkeletonInspection { readonly skinCount: number;
export interface AuraCliSkeletonSkinInspection { readonly index: number;
export interface AuraCliMorphTargetInspection { readonly targetCount: number;
export interface AuraCliMorphTargetMeshInspection { readonly index: number;
export interface AuraCliAssetBoundsInspection { readonly min: readonly [number, number, number];
export interface AuraCliMaterialInspection { readonly name: string;
export interface AuraCliOrientationInspection { readonly source: "gltf-extras" | "unknown";
export interface AuraCliHumanoidInspection { readonly humanoid: boolean;
export interface AuraCliAssetProvenance { readonly sourcePath: string;
export interface AuraCliAssetManifest { readonly schema: "aura3d.assets/1.0";
export interface AuraCliAssetEntry { readonly id: string;
export interface AddAssetOptions { readonly projectDir?: string;
export interface AssetCliResult { readonly ok: boolean;
export interface AssetValidationResult extends AssetCliResult { readonly failures: readonly string[];
export interface AssetValidationOptions { readonly projectDir?: string;
export type AuraAssetReadinessProfile = "game" | "cartoon";
export type AuraAssetReadinessStatus = "passed" | "failed";
export interface AssetReadinessOptions { readonly projectDir?: string;
export interface AssetReadinessReport { readonly schema: "aura3d.asset-readiness/1.0";
export interface AssetReadinessValidatorEvidence { readonly id: "aura-clash-game-assets" | "aura-voice-cartoon-assets";
export interface AssetReadinessValidationContract { readonly id: string;
export interface AssetReadinessArtifacts { readonly evidencePath?: string;
export interface AssetReadinessAssetArtifacts { readonly id: string;
export interface AssetReadinessAnimationMetadata { readonly clipCount: number;
export interface AssetReadinessAnimationClipMetadata { readonly index: number;
export interface AssetReadinessAssetReport { readonly id: string;
export interface AssetInspectionReport { readonly ok: boolean;
export interface InspectAssetOptions { readonly projectDir?: string;
export interface CharacterAssemblyPlanOptions { readonly projectDir?: string;
export interface CharacterAssemblyPartInput { readonly slot: string;
export interface CharacterAssemblyPlanResult { readonly ok: boolean;
export interface CharacterAssemblyResolvedPart { readonly slot: string;
export const DEFAULT_AURA_ASSET_MANIFEST = "aura.assets.json";
export const DEFAULT_AURA_ASSET_OUTPUT_DIR = "public/aura-assets";
export const DEFAULT_AURA_ASSET_PUBLIC_PATH = "/aura-assets/";
export const DEFAULT_AURA_ASSET_TYPEGEN = "src/aura-assets.ts";
export function addAsset(options: AddAssetOptions): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function scanAssets(options: { readonly projectDir?: string; readonly directory: string }): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function inspectAsset(options: InspectAssetOptions): AssetInspectionReport { const projectDir = resolve(options.projectDir ?? process.cwd());
export function validateAssets(options: AssetValidationOptions = {}): AssetValidationResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function writeTypedAssets(projectDir: string, manifest = readAssetManifest(projectDir)): string { const path = resolve(projectDir, manifest.typegen);
export function listAssets(options: { readonly projectDir?: string } = {}): readonly AuraCliAssetEntry[] { return readAssetManifest(resolve(options.projectDir ?? process.cwd())).assets;
export function createAssetThumbnails(options: { readonly projectDir?: string } = {}): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function doctor(options: { readonly projectDir?: string } = {}): AssetValidationResult { const validation = validateAssets(options);
export function checkDeploy(options: { readonly projectDir?: string; readonly distDir?: string } = {}): AssetValidationResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function validateGameAssets(options: AssetReadinessOptions = {}): AssetReadinessReport { return validateAssetReadiness("game", options);
export function validateCartoonAssets(options: AssetReadinessOptions = {}): AssetReadinessReport { return validateAssetReadiness("cartoon", options);
export function createCharacterAssemblyPlan(options: CharacterAssemblyPlanOptions): CharacterAssemblyPlanResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function initAgentFiles(options: { readonly projectDir?: string; readonly agent: "claude" | "cursor" | "copilot" | "generic" | "all" }): readonly string[] { const projectDir = resolve(options.projectDir ?? process.cwd());
export function readAssetManifest(projectDir: string): AuraCliAssetManifest { const manifestPath = resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST);
export function writeAssetManifest(projectDir: string, manifest: AuraCliAssetManifest): void { writeFileSync(resolve(projectDir, DEFAULT_AURA_ASSET_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
```

## @aura3d/controls

- Version: `1.1.0`
- Package manifest: `packages/controls/package.json`
- Public entrypoint: `packages/controls/src/index.ts`

### Export Declarations

```ts
export { OrbitControls } from "./OrbitControls";
export { TrackballControls } from "./TrackballControls";
export { FlyControls } from "./FlyControls";
export { FirstPersonControls } from "./FirstPersonControls";
export { MapControls } from "./MapControls";
export { PointerLockControls } from "./PointerLockControls";
export { DragControls } from "./DragControls";
export { TransformControls } from "./TransformControls";
export type { TransformControlMode } from "./TransformControls";
export { SelectionManager } from "./SelectionManager";
export { InteractionControls } from "./InteractionControls";
export type { HotspotHandler, InteractionControlMode, InteractionControlsEvent, InteractionControlsEventType, InteractionControlsListener, InteractionControlsOptions, InteractionControlsUpdate, InteractionRay, InteractionRayProvider, InteractionRootProvider } from "./InteractionControls";
export { Picking } from "./Picking";
export type { PickingDiagnostics, PickingOptions, PickingReport, ThreeCompatPickResult } from "./Picking";
export { annotationFromPickHit, createDistrictPickingAnnotations, createEntityPickingAnnotations, createImportedGlbHotspotAnnotations, createPickingAnnotationObject, createPickingAnnotationRoot, createRobotPickingAnnotations, pickAnnotation, pickScreenSpaceAnnotation } from "./PickingAnnotations";
export type { BuildingPickingDescriptor, DistrictPickingDescriptor, EntityPickingDescriptor, ImportedGlbHotspotDescriptor, PickingAnnotation, PickingAnnotationHitPolicy, PickingAnnotationKind, PickingAnnotationObject, PickingAnnotationOptions, PickingAnnotationReport, PickingAnnotationRoot, PickingAnnotationSource, ScreenPickingAnnotation, ScreenPickingHit, ScreenPickingOptions, ScreenPickingReport } from "./PickingAnnotations";
export { ControlVector3 } from "./NativeControlTypes";
export type { ControlObject3DLike, ControlPickMetadata, Vector3Like } from "./NativeControlTypes";
export { createDefaultControlState } from "./ControlState";
export type { ThreeCompatControlEvent, ThreeCompatControlState } from "./ControlState";
```

## @aura3d/core

- Version: `1.1.0`
- Package manifest: `packages/core/package.json`
- Public entrypoint: `packages/core/src/index.ts`

### Export Declarations

```ts
export * from "./Engine.js";
export * from "./EngineConfig.js";
export * from "./EngineLoop.js";
export * from "./Time.js";
export * from "./FixedStepAccumulator.js";
export * from "./EventBus.js";
export * from "./Scheduler.js";
export * from "./TaskQueue.js";
export * from "./Logger.js";
export * from "./Diagnostics.js";
export * from "./Errors.js";
export * from "./Disposable.js";
export * from "./ResourceScope.js";
export * from "./VersionedSerialization.js";
```

## create-aura3d

- Version: `1.1.0`
- Package manifest: `packages/create-aura3d/package.json`
- Public entrypoint: `packages/create-aura3d/src/index.ts`

### Export Declarations

```ts
export const CREATE_AURA3D_TEMPLATES = [
export type CreateA3DTemplate = (typeof CREATE_AURA3D_TEMPLATES)[number];
export interface CreateA3DProjectOptions { readonly targetDir: string;
export interface CreateA3DProjectResult { readonly targetDir: string;
export function createA3DProject(options: CreateA3DProjectOptions): CreateA3DProjectResult { const template = options.template ?? "product-viewer";
export function writeCreateA3DReport(path: string, result: CreateA3DProjectResult): void { mkdirSync(dirname(resolve(path)), { recursive: true });
```

## @aura3d/debug

- Version: `1.1.0`
- Package manifest: `packages/debug/package.json`
- Public entrypoint: `packages/debug/src/index.ts`

### Export Declarations

```ts
export { DrawCallTracker } from "./DrawCallTracker.js";
export type { DrawCallRecord, DrawCallSnapshot } from "./DrawCallTracker.js";
export { RenderStateInspector, RenderStateLeakError } from "./RenderStateInspector.js";
export type { RenderStateDiff, RenderStateSnapshot, RenderStateValue } from "./RenderStateInspector.js";
export { ShaderDiagnosticError, ShaderDiagnostics } from "./ShaderDiagnostics.js";
export type { ShaderDiagnosticReport } from "./ShaderDiagnostics.js";
export { MaterialDiagnosticError, MaterialDiagnostics } from "./MaterialDiagnostics.js";
export type { MaterialDiagnosticReport } from "./MaterialDiagnostics.js";
export { PhysicsDebugAdapter } from "./PhysicsDebugAdapter.js";
export type { PhysicsDebugSnapshot, PhysicsStackEvidence } from "./PhysicsDebugAdapter.js";
export { AnimationInspector } from "./AnimationInspector.js";
export type { AnimationDebugSnapshot, AnimationVisualEvidence, SkeletonDebugSnapshot } from "./AnimationInspector.js";
export { Profiler } from "./Profiler.js";
export type { ProfilerMarker, ProfilerSnapshot } from "./Profiler.js";
export { GPUProfiler } from "./GPUProfiler.js";
export type { GPUProfilerSnapshot, GPUSample, GPUProfilerTimer } from "./GPUProfiler.js";
export { ChromeTraceExporter } from "./ChromeTraceExporter.js";
export type { ChromeTrace, ChromeTraceEvent, ChromeTraceExportOptions } from "./ChromeTraceExporter.js";
export { ResourceLeakError, ResourceTracker } from "./ResourceTracker.js";
export type { ResourceLeakReport, TrackedResource } from "./ResourceTracker.js";
export { ECSInspector } from "./ECSInspector.js";
export type { ECSInspectorSnapshot, ECSWorldLike } from "./ECSInspector.js";
export { DebugOverlay } from "./DebugOverlay.js";
export type { DebugOverlayRow, DebugOverlaySection, DebugOverlaySnapshot } from "./DebugOverlay.js";
export { DebugLineCanvasRenderer } from "./DebugLineCanvasRenderer.js";
export type { DebugLineCanvasRendererOptions, DebugLineCanvasRenderResult, DebugRenderLine } from "./DebugLineCanvasRenderer.js";
export { buildAxesHelper, buildBoundsHelper, buildCameraFrustumHelper, buildDirectionalLightHelper, buildGridHelper, buildSkeletonHelper } from "./SceneHelpers.js";
export type { AxesHelperOptions, BoundsHelperOptions, CameraFrustumHelperOptions, DebugColor, DebugVec3, DirectionalLightHelperOptions, GridHelperOptions, SkeletonHelperJoint } from "./SceneHelpers.js";
export { ReportExporter } from "./ReportExporter.js";
export type { DebugReport } from "./ReportExporter.js";
```

## @aura3d/ecs

- Version: `1.1.0`
- Package manifest: `packages/ecs/package.json`
- Public entrypoint: `packages/ecs/src/index.ts`

### Export Declarations

```ts
export * from "./Entity.js";
export * from "./EntityManager.js";
export * from "./Component.js";
export * from "./ComponentRegistry.js";
export * from "./SparseSet.js";
export * from "./Bitset.js";
export * from "./ComponentStore.js";
export * from "./Archetype.js";
export * from "./Query.js";
export * from "./CommandBuffer.js";
export * from "./System.js";
export * from "./SystemScheduler.js";
export * from "./World.js";
export * from "./ECSSerializer.js";
export * from "./ECSProfiler.js";
export * from "./components/TransformComponent.js";
export * from "./components/NameComponent.js";
export * from "./components/TagComponent.js";
export * from "./components/ActiveComponent.js";
export * from "./components/HierarchyComponent.js";
export * from "./systems/index.js";
```

## @aura3d/editor

- Version: `1.1.0`
- Package manifest: `packages/editor/package.json`
- Public entrypoint: `packages/editor/src/index.ts`

### Export Declarations

```ts
export * from "@aura3d/editor-runtime";
```

## @aura3d/editor-runtime

- Version: `1.1.0`
- Package manifest: `packages/editor-runtime/package.json`
- Public entrypoint: `packages/editor-runtime/src/index.ts`

### Export Declarations

```ts
export type { Command, CommandContext } from "./Command";
export { CommandHistory, CommandTransactionError } from "./CommandHistory";
export { DiagnosticsOverlayModel } from "./DiagnosticsOverlayModel";
export type { EditorDiagnosticsInput, EditorDiagnosticsResource, EditorDiagnosticsSnapshot } from "./DiagnosticsOverlayModel";
export { EditorRuntime } from "./EditorRuntime";
export type { EditorMode, EditorRuntimeSnapshot } from "./EditorRuntime";
export { EditorStateModel, createMemoryEditorStateStorage } from "./EditorStateModel";
export type { EditorGridSnapSettings, EditorStateChange, EditorStateSnapshot, EditorStateStorage, EditorViewportSettings } from "./EditorStateModel";
export { EditorPluginHost } from "./EditorPluginHost";
export type { EditorImporterContribution, EditorPanelContribution, EditorPlugin, EditorPluginSnapshot, EditorScriptingNodeContribution, EditorToolContribution } from "./EditorPluginHost";
export { Gizmo } from "./Gizmo";
export { DEFAULT_GIZMO_SETTINGS, normalizeGizmoSettings } from "./Gizmo";
export type { GizmoAxis, GizmoDrag, GizmoHandle, GizmoHit, GizmoPivotMode, GizmoPlaneAxis, GizmoSettings, GizmoSpaceMode } from "./Gizmo";
export { HierarchyModel } from "./HierarchyModel";
export type { HierarchyLikeNode, HierarchyNodeDescriptor } from "./HierarchyModel";
export { InspectorModel } from "./InspectorModel";
export type { InspectorEditableValue, InspectorProperty } from "./InspectorModel";
export { sampleLocalizationAccessibilityFixture } from "./LocalizationAccessibilityFixtures";
export type { EditorAccessibilityElementSample, EditorAccessibilityRole, EditorLocalizationAccessibilityFixture, EditorLocalizedStringSample, EditorLocaleDescriptor, EditorLocaleDirection, EditorPluralCategory } from "./LocalizationAccessibilityFixtures";
export { MaterialVariantWorkflow } from "./MaterialVariantWorkflow";
export type { MaterialVariantRenderOptions, MaterialVariantState } from "./MaterialVariantWorkflow";
export { PickingService } from "./PickingService";
export type { EditorPickHit, EditorPickTarget, EditorPickingColorId, EditorPickingEvidenceSnapshot } from "./PickingService";
export { PlayModeBridge } from "./PlayModeBridge";
export type { SnapshotAdapter } from "./PlayModeBridge";
export { PrefabRegistry, validatePrefab } from "./PrefabRegistry";
export type { CreatePrefabOptions, EditorPrefab, EditorPrefabNodeBase, EditorPrefabSchemaVersion, InstantiatePrefabOptions } from "./PrefabRegistry";
export { RotateGizmo } from "./RotateGizmo";
export { ScaleGizmo } from "./ScaleGizmo";
export { Selection } from "./Selection";
export type { SelectionChange, SelectionId, SelectionListener } from "./Selection";
export { createOldBranchShaderGraphFixture } from "./ShaderGraphModel";
export type { ShaderGraphDiagnostic, ShaderGraphEdge, ShaderGraphFixture, ShaderGraphNode, ShaderGraphPort, ShaderGraphValueType } from "./ShaderGraphModel";
export { createStaticExportHtml, createStaticExportRuntime } from "./StaticExportRuntime";
export type { StaticExportHtmlOptions, StaticExportRuntimeOptions } from "./StaticExportRuntime";
export * from "./ProjectSerializer.js";
export { TimelineRuntimeBridge, createTimelineRuntimeBridge } from "./TimelineRuntimeBridge";
export type { TimelineRuntimeAnimationApplication, TimelineRuntimeBindingConfig, TimelineRuntimeBridgeConfig, TimelineRuntimeBridgeSnapshot, TimelineRuntimeSignalDispatch, TimelineRuntimeTarget, TimelineRuntimeTargetSnapshot } from "./TimelineRuntimeBridge";
export { TranslateGizmo } from "./TranslateGizmo";
export { TimelineClip, TimelineModel, TimelineTrack } from "./TimelineModel";
export type { TimelineActiveClipSnapshot, TimelineClipBlendMode, TimelineClipConfig, TimelineEasingName, TimelineLoopMode, TimelineModelConfig, TimelineSignalEventSnapshot, TimelineSnapshot, TimelineTrackConfig, TimelineTrackSnapshot } from "./TimelineModel";
export { CreateNodeCommand } from "./commands/CreateNodeCommand";
export type { NodeContainer } from "./commands/CreateNodeCommand";
export { DeleteNodeCommand } from "./commands/DeleteNodeCommand";
export { ReparentNodeCommand } from "./commands/ReparentNodeCommand";
export { SetPropertyCommand } from "./commands/SetPropertyCommand";
export { TransformCommand } from "./commands/TransformCommand";
export type { SceneTransformTargetLike, TransformLike, TransformTarget } from "./commands/TransformCommand";
```

## @aura3d/engine

- Version: `1.1.0`
- Package manifest: `package.json`
- Public entrypoint: `packages/engine/src/index.ts`

### Export Declarations

```ts
export { A3D_APP_WORKFLOW_PRESETS, createA3DApp, resolveA3DAppQualityPreset } from "@aura3d/apps";
export type { A3DApp, A3DAppDiagnostics, A3DAppOptions, A3DAppQualityPreset, A3DAppQualitySettings, A3DAppWorkflowPreset } from "@aura3d/apps";
export { Engine } from "@aura3d/core";
export { Renderer, createExternalParityEnvironmentPipeline, listExternalParityEnvironmentTargets } from "@aura3d/rendering";
export { GLTFLoader, createAssetCompatibilityReport, inspectGLTFAsset, loadRenderableAsset, summarizeExternalParityGLTFCorpus } from "@aura3d/assets";
export { loadProductAsset } from "@aura3d/product-studio";
export { createAnimationLabWorkflow, createAssetViewerWorkflow, createComparisonWorkflow, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createSceneShowcaseWorkflow } from "@aura3d/workflows";
export { A3DRenderer, A3DScene, A3DAppLifecycle } from "./advanced-runtime/index.js";
export * from "./agent-api/index.js";
export * from "./devtools/AuraDiagnosticsOverlay.js";
export * from "./devtools/AuraAssetPanel.js";
export * from "./devtools/AuraPerformancePanel.js";
export * from "./testing/screenshot.js";
export * from "./testing/routeHealth.js";
export type { A3DAppLifecycleSnapshot, A3DDisposable, A3DRendererOptions, A3DSceneMeshOptions, A3DSceneRenderSourceOptions } from "./advanced-runtime/index.js";
export const workflows = { assetViewer: createAssetViewerWorkflow, productConfigurator: createProductConfiguratorWorkflow, materialStudio: createMaterialStudioWorkflow, sceneShowcase: createSceneShowcaseWorkflow, interactiveScene: createInteractiveSceneWorkflow, animationLab: createAnimationLabWorkflow, comparison: createComparisonWorkflow } as const;
export type A3DWorkflowApi = typeof workflows;
export type A3DEnvironmentOptions = ExternalParityEnvironmentPipelineOptions;
export type A3DEnvironment = ExternalParityEnvironmentPipeline;
export function createEnvironment(options: A3DEnvironmentOptions): A3DEnvironment { return createExternalParityEnvironmentPipeline(options);
export async function loadAsset(urlOrAsset: string | RenderableAsset, options: LoadRenderableAssetOptions = {}): Promise<RenderableAsset> { return await loadRenderableAsset(urlOrAsset, options);
export async function loadProductAssetLazy(options: ProductAssetLoadOptions): Promise<ProductAsset> { markAuraLazySystemRequested("product-gltf-loader", "loadProductAssetLazy");
export async function createPostProcessComposerLazy(options: PostProcessComposerOptions): Promise<PostProcessComposer> { markAuraLazySystemRequested("postprocess", "createPostProcessComposerLazy");
export interface A3DMaterialVariantController<TVariantId extends string = string> { readonly current: TVariantId;
export function createMaterialVariantController<TVariantId extends string>(
export interface A3DScreenshotCapture { readonly mimeType: "image/png";
export function captureScreenshot(target: HTMLCanvasElement | OffscreenCanvas | A3DApp): A3DScreenshotCapture { const canvas = isA3DApp(target) ? findCanvasFromRenderer(target.renderer) : target;
export function inspectAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport { return inspectGLTFAsset(asset, resources);
export function createCompatibilityReport(manifest: GLTFCorpusManifest): AssetCompatibilityReport { return createAssetCompatibilityReport(manifest);
export interface A3DAssetDiagnostics { readonly kind: RenderableAsset["kind"];
export function createAssetDiagnostics(asset: RenderableAsset): A3DAssetDiagnostics { const gltf = asset.gltf;
export interface A3DRenderDiagnostics { readonly drawCalls: number;
export function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): A3DRenderDiagnostics { return { drawCalls: diagnostics?.drawCalls ?? 0, buffers: diagnostics?.buffers ?? 0, shaders: diagnostics?.shaders ?? 0, textureCount: diagnostics?.textures, warnings: diagnostics ? [] : ["No render diagnostics have been recorded yet."] };
export interface A3DDiagnosticsPanel { readonly kind: "a3d-diagnostics-panel";
export function createDiagnosticsPanel(initial: { readonly render?: RenderDeviceDiagnostics; readonly asset?: A3DAssetDiagnostics } = {}): A3DDiagnosticsPanel { let render = createRenderDiagnostics(initial.render);
```

## @aura3d/environments

- Version: `1.1.0`
- Package manifest: `packages/environments/package.json`
- Public entrypoint: `packages/environments/src/index.ts`

### Export Declarations

```ts
export { findThreeCompatEnvironmentPreset, listThreeCompatEnvironmentPresets, loadThreeCompatEnvironmentManifest, createThreeCompatEnvironmentGalleryModel, summarizeThreeCompatEnvironmentLibrary } from "./EnvironmentRegistry";
export type { ThreeCompatEnvironmentLibrarySummary, ThreeCompatEnvironmentManifest } from "./EnvironmentRegistry";
export { createThreeCompatEnvironmentDiagnostics, verifyThreeCompatHdriFile } from "./HDRIEnvironment";
export type { ThreeCompatEnvironmentDiagnostics, ThreeCompatEnvironmentKind, ThreeCompatEnvironmentProbeType, ThreeCompatHDRIEnvironmentPreset } from "./HDRIEnvironment";
export { createThreeCompatPMREMDiagnostics } from "./PMREMPreset";
export type { ThreeCompatPMREMDiagnostics, ThreeCompatPMREMPreset } from "./PMREMPreset";
export { createThreeCompatEnvironmentProbePreviews } from "./EnvironmentPreview";
export type { ThreeCompatEnvironmentProbePreview } from "./EnvironmentPreview";
export { createProductionEnvironmentCorpusSummary, inspectProductionHDR, loadProductionEnvironmentManifest } from "./production-runtime/ProductionEnvironmentCorpus";
export type { ProductionHDREnvironment, ProductionHDRInspection, ProductionEnvironmentCorpusSummary, ProductionEnvironmentManifest, ProductionEnvironmentProbeType, ProductionEnvironmentReadinessEntry, ProductionEnvironmentRequirements, ProductionPMREMPreset } from "./production-runtime/ProductionEnvironmentCorpus";
```

## @aura3d/input

- Version: `1.1.0`
- Package manifest: `packages/input/package.json`
- Public entrypoint: `packages/input/src/index.ts`

### Export Declarations

```ts
export { ActionMap } from "./ActionMap";
export type { ActionBinding, AxisBinding } from "./ActionMap";
export { GamepadDevice } from "./GamepadDevice";
export type { GamepadButtonLike, GamepadLike } from "./GamepadDevice";
export { sampleGestureHapticsFixture } from "./GestureHapticsFixtures";
export type { GestureHapticsFixture, GestureHapticsFixtureOptions, GestureHapticsGestureType, GestureHapticsPatternName } from "./GestureHapticsFixtures";
export { GestureRecognizer } from "./GestureRecognizer";
export type { Gesture } from "./GestureRecognizer";
export { processInputValue, sampleInputActionBindingFixture } from "./InputActionBindingFixtures";
export type { InputActionBindingFixture, InputValueProcessor } from "./InputActionBindingFixtures";
export { InputSnapshot } from "./InputSnapshot";
export type { ButtonState, GamepadSnapshot, InputSnapshotOptions, PointerSnapshot, PointerTouch } from "./InputSnapshot";
export { InputPlayback, InputRecorder, parseInputRecording } from "./InputReplay";
export type { InputPlaybackOptions, InputPlaybackSnapshot, InputRecording, InputRecordingMetadata, InputReplayEvent, InputReplayEventType } from "./InputReplay";
export { InputSystem } from "./InputSystem";
export type { InputEventTargetLike } from "./InputSystem";
export { InteractionSystem } from "./InteractionSystem";
export type { InteractionBounds, InteractionEvent, InteractionEventType, InteractionHit, InteractionListener, InteractionRayProvider, InteractionTarget, InteractionTargetProvider } from "./InteractionSystem";
export { KeyboardDevice } from "./KeyboardDevice";
export type { KeyboardEventLike } from "./KeyboardDevice";
export { pickingRayFromCamera } from "./PickingRay";
export type { PickingRayViewport } from "./PickingRay";
export { PointerDevice } from "./PointerDevice";
export type { PointerEventLike, WheelEventLike } from "./PointerDevice";
export { VirtualTouchJoystick, sampleVirtualTouchJoystickFixture } from "./VirtualTouchControls";
export type { VirtualJoystickConfig, VirtualTouchJoystickSnapshot, VirtualTouchPoint } from "./VirtualTouchControls";
export { sampleXRRuntimeFixture } from "./XRFixtures";
export type { XRFixtureLodLevel, XRFixtureOptions, XRFixtureSessionMode, XRRuntimeFixture } from "./XRFixtures";
export { WebXRSessionController } from "./WebXRSessionController";
export type { A3DXRFrameLike, A3DXRHandedness, A3DXRHitTestResultLike, A3DXRInputSourceLike, A3DXRPoseLike, A3DXRReferenceSpaceLike, A3DXRReferenceSpaceType, A3DXRSessionInit, A3DXRSessionLike, A3DXRSessionMode, A3DXRSystemLike, WebXRControllerSample, WebXRFrameSample, WebXRHitTestSample, WebXRSessionControllerOptions, WebXRSessionStartResult } from "./WebXRSessionController";
export * from "./GamepadInput.js";
export * from "./GestureControls.js";
export * from "./controls/PointerLockControls.js";
export { CameraRig } from "./controls/CameraRig";
export type { CameraRigState } from "./controls/CameraRig";
export type { CameraTransformLike, EulerLike, Vec3Like } from "./controls/ControlTypes";
export { createSceneCameraControlAdapter } from "./controls/SceneCameraAdapter";
export type { SceneCameraControlAdapter } from "./controls/SceneCameraAdapter";
export { EditorFlyControls } from "./controls/EditorFlyControls";
export type { EditorFlyControlsOptions } from "./controls/EditorFlyControls";
export { FirstPersonControls } from "./controls/FirstPersonControls";
export type { FirstPersonControlsOptions } from "./controls/FirstPersonControls";
export { DEFAULT_ORBIT_MAX_POLAR, OrbitControls } from "./controls/OrbitControls";
export type { OrbitControlsOptions } from "./controls/OrbitControls";
export { ThirdPersonFollowControls } from "./controls/ThirdPersonFollowControls";
export type { ThirdPersonFollowControlsOptions } from "./controls/ThirdPersonFollowControls";
```

## @aura3d/materials

- Version: `1.1.0`
- Package manifest: `packages/materials/package.json`
- Public entrypoint: `packages/materials/src/index.ts`

### Export Declarations

```ts
export { findThreeCompatPbrMaterial, listThreeCompatMaterialProofChannels, listThreeCompatPbrMaterials, THREE_COMPAT_PBR_MATERIAL_LIBRARY, THREE_COMPAT_REQUIRED_MATERIAL_CLASSES } from "./PBRMaterialLibrary";
export { findThreeCompatTextureSet, THREE_COMPAT_TEXTURE_SETS } from "./TextureSet";
export { summarizeThreeCompatMaterialLibrary } from "./MaterialValidation";
export { createThreeCompatMaterialPreviewScene, createThreeCompatMaterialPreviewTile } from "./MaterialPreviewScene";
export type { ThreeCompatMaterialClass, ThreeCompatMaterialParameters, ThreeCompatMaterialPreset, ThreeCompatMaterialProofChannel } from "./MaterialPreset";
export type { ThreeCompatTextureMapReference, ThreeCompatTextureSemantic, ThreeCompatTextureSet } from "./TextureSet";
export type { ThreeCompatMaterialLibrarySummary } from "./MaterialValidation";
export type { ThreeCompatMaterialPreviewTile } from "./MaterialPreviewScene";
export * from "./MaterialPresets.js";
export * from "./NodeMaterial.js";
```

## @aura3d/math

- Version: `1.1.0`
- Package manifest: `packages/math/package.json`
- Public entrypoint: `packages/math/src/index.ts`

### Export Declarations

```ts
export * from "./Vector2.js";
export * from "./Vector3.js";
export * from "./Vector4.js";
export * from "./Matrix3.js";
export * from "./Matrix4.js";
export * from "./Quaternion.js";
export * from "./Euler.js";
export * from "./Color.js";
export * from "./Ray.js";
export * from "./Plane.js";
export * from "./Box3.js";
export * from "./Sphere.js";
export * from "./Frustum.js";
export * from "./Transform.js";
export * from "./Interpolation.js";
export * from "./Easing.js";
export * from "./Random.js";
export * from "./Curves.js";
```

## @aura3d/physics

- Version: `1.1.0`
- Package manifest: `packages/physics/package.json`
- Public entrypoint: `packages/physics/src/index.ts`

### Export Declarations

```ts
export * from "./Shape.js";
export * from "./RigidBody.js";
export * from "./Collider.js";
export * from "./CollisionEvents.js";
export * from "./Constraint.js";
export * from "./Constraints.js";
export * from "./Raycast.js";
export * from "./PhysicsWorld.js";
export * from "./PhysicsStepper.js";
export * from "./ScenePhysicsBridge.js";
export * from "./ECSPhysicsBridge.js";
export * from "./PhysicsDebugDraw.js";
export * from "./CharacterController.js";
export * from "./Navigation.js";
export * from "./Steering.js";
export * from "./Crowd.js";
export * from "./VehicleDynamics.js";
export * from "./PlatformerFixtures.js";
export * from "./PhysicsSandboxFixtures.js";
export * from "./ClothFixtures.js";
export * from "./SoftBodyFixtures.js";
export * from "./FractureFixtures.js";
export * from "./FluidFixtures.js";
export * from "./FireSmokeFixtures.js";
export * from "./CollisionVolumes.js";
export * from "./KinematicBody.js";
export * from "./KinematicWorld.js";
export * from "./HitboxWorld.js";
```

## @aura3d/product-studio

- Version: `1.1.0`
- Package manifest: `packages/product-studio/package.json`
- Public entrypoint: `packages/product-studio/src/index.ts`

### Export Declarations

```ts
export { loadProductAsset } from "./ProductAssetLoader";
export { createProductCameraFrame, validateProductCameraFrame } from "./ProductCamera";
export { createProductDiagnostics } from "./ProductDiagnostics";
export { exportProductRender, exportProductSceneManifest } from "./ProductExport";
export { createProductFloor } from "./ProductFloor";
export { createProductLightingPreset } from "./ProductLighting";
export { applyProductMaterialMode, createProductMaterialMode } from "./ProductMaterials";
export { createProductRenderScene, updateProductRenderScene } from "./ProductRenderScene";
export { createProductShowcaseLayout } from "./ProductShowcaseLayout";
export { createProductStudio } from "./ProductStudio";
export type * from "./ProductTypes";
export type * from "./ProductShowcaseLayout";
```

## @aura3d/react

- Version: `1.1.0`
- Package manifest: `packages/react/package.json`
- Public entrypoint: `packages/react/src/index.ts`

### Export Declarations

```ts
export interface AuraCanvasProps { readonly children?: ReactNode;
export interface SceneProps { readonly children?: ReactNode;
export interface ModelProps extends AuraModelOptions { readonly asset: AuraAssetRef<"model">;
export interface CameraProps extends Omit<AuraCameraSpec, "mode"> { readonly mode?: AuraCameraSpec["mode"];
export interface LightsProps { readonly preset?: "studio";
export interface EffectProps extends Omit<AuraEffectNode, "kind" | "effect"> { readonly type: AuraEffectNode["effect"];
export function AuraCanvas(props: AuraCanvasProps): ReactElement { const ref = useRef<HTMLCanvasElement | null>(null);
export function Scene(_props: SceneProps): null { return null;
export function Model(_props: ModelProps): null { return null;
export function Camera(_props: CameraProps): null { return null;
export function Lights(_props: LightsProps): null { return null;
export function Effect(_props: EffectProps): null { return null;
export function buildSceneFromChildren(children: ReactNode): AuraSceneBuilder { let builder = scene();
export function productViewerScene(asset: AuraAssetRef<"model">, material?: AuraMaterialSpec): AuraSceneBuilder { return scene() .background("#08111f") .add(model(asset, { material }).position(0, 0, 0).scale(1)) .add(lights.studio({ intensity: 1.1 })) .camera(camera.orbit({ distance: 4 })) .diagnostics(true);
```

## @aura3d/rendering

- Version: `1.1.0`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/index.ts`

### Export Declarations

```ts
export type { BufferUsage, DrawCommand, IndexType, PrimitiveTopology, RenderBackendKind, RenderBuffer, RenderDeviceCapability, RenderDevice, RenderDeviceDiagnostics, RenderDeviceInfo, RenderTarget, RenderTargetDescriptor, RenderShaderProgram, ShaderAttributeReflection, ShaderReflection, ShaderUniformReflection, ShaderSources, UniformValue } from "./RenderDevice";
export { MockRenderBuffer, MockRenderDevice, MockShaderProgram, RenderDeviceError } from "./RenderDevice";
export { createRenderDevice } from "./RenderBackend";
export type { RenderBackendOptions } from "./RenderBackend";
export { WebGL2Device } from "./WebGL2Device";
export type { WebGL2DeviceOptions } from "./WebGL2Device";
export { WebGL2StateCache } from "./WebGL2StateCache";
export type { WebGL2StateCacheDescriptor, WebGL2StateCacheSnapshot, WebGL2StateCacheStats } from "./WebGL2StateCache";
export { WebGPUDevice } from "./WebGPUDevice";
export type { WebGPUAdapterLike, WebGPUBufferDescriptorLike, WebGPUBufferLike, WebGPUDeviceLike, WebGPUDeviceOptions, WebGPULike, WebGPUQueueLike, WebGPUSamplerDescriptorLike } from "./WebGPUDevice";
export { isWebGPURenderTarget, runWebGPURenderToTextureProof } from "./WebGPURenderToTextureProof";
export type { WebGPURenderToTextureProof, WebGPURenderToTextureProofOptions } from "./WebGPURenderToTextureProof";
export { AdvancedRenderer } from "./advanced-runtime";
export type { AdvancedRendererOptions, AdvancedRendererSource } from "./advanced-runtime";
export { VertexAttribute, VertexFormat } from "./VertexFormat";
export type { VertexAttributeDescriptor, VertexAttributeSemantic, VertexAttributeType } from "./VertexFormat";
export { VertexBuffer } from "./VertexBuffer";
export { IndexBuffer } from "./IndexBuffer";
export { Geometry, computeBounds } from "./Geometry";
export type { Bounds3, CapsuleGeometryOptions, CylinderGeometryOptions, UVSphereGeometryOptions } from "./Geometry";
export { applyMorphTargets, computeMorphTargetEnvelopeBounds, computeMorphTargetWeightedBounds } from "./MorphTarget";
export type { MorphTargetDelta } from "./MorphTarget";
export { computeSkinnedGeometryBounds, computeSkinnedMorphTargetEnvelopeBounds, computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
export type { SkinningBoundsPalette } from "./SkinningBounds";
export { Texture, bytesPerPixel, compressedBlockByteLength, compressedTextureByteLength, isCompressedTextureFormat } from "./Texture";
export type { TextureColorSpace, TextureCompressedFormat, TextureCubeFace, TextureCubeFaceDescriptor, TextureCubeFaceLevel, TextureDescriptor, TextureDimension, TextureFormat, TextureMipLevel, TextureMipLevelDescriptor, TexturePixelData } from "./Texture";
export { createEnvironmentMapResourceSet, decodeRgba8EnvironmentToLinear, decodeRgbeEnvironmentMap, encodeLinearHdrEnvironmentToRgba8, encodeLinearHdrEnvironmentToRgba16f, generateApproximateBrdfLutPixels, generateDiffuseIrradianceRgba8, generateRgba8EnvironmentMipLevels, generateRgba16fEnvironmentMipLevels, generateRgba16fDiffuseIrradianceMipLevel, generateRgba16fSpecularPrefilterMipLevels, generateSpecularPrefilterMipLevels, linearChannelToSrgb, srgbChannelToLinear } from "./EnvironmentMapResources";
export { createEnvironmentCapabilityReport, createEnvironmentFogProfile, createEnvironmentPreset, createEnvironmentStage, createEnvironmentUnsupportedRequestDisclosures, createInfiniteGroundGrid, applyEnvironmentFogToColor, createProceduralSkyDome, listEnvironmentCapabilities, sampleEnvironmentFogFactor } from "./EnvironmentPlatform";
export type { EnvironmentCapability, EnvironmentCapabilityId, EnvironmentCapabilityReport, EnvironmentCapabilityStatus, EnvironmentFeatureRequest, EnvironmentFogInput, EnvironmentFogMode, EnvironmentFogOptions, EnvironmentFogPresetId, EnvironmentFogProfile, EnvironmentFogTelemetry, EnvironmentFogUniforms, EnvironmentPreset, EnvironmentPresetBackground, EnvironmentPresetGround, EnvironmentPresetLighting, EnvironmentPresetOptions, EnvironmentPresetType, EnvironmentStage, EnvironmentStageOptions, EnvironmentStagePresetId, EnvironmentUnsupportedRequestDisclosure, EnvironmentUnsupportedRequestDisclosureOptions } from "./EnvironmentPlatform";
export { createEnvironmentPresetReport, createNamedEnvironmentPreset, listNamedEnvironmentPresets } from "./EnvironmentPreset";
export type { EnvironmentPresetReport, NamedEnvironmentPresetDescriptor, NamedEnvironmentPresetId } from "./EnvironmentPreset";
export { composeEnvironmentLighting } from "./EnvironmentLighting";
export type { EnvironmentLightingCompositionOptions } from "./EnvironmentLighting";
export { EXTERNAL_PARITY_TEXTURE_COLOR_POLICY, convertColorSpace, createColorConversionSamples, createExternalParityColorManagementPolicy, linearToSrgbChannel, srgbToLinearChannel, validateTextureColorSpace } from "./ColorManagement";
export type { A3DColorConversionSample, A3DColorManagementPolicy, A3DColorSpace, A3DTextureColorSpaceValidation, A3DTextureSemantic } from "./ColorManagement";
export { applyExternalParityToneMappingPreset, createExternalParityToneMappingPolicy, listExternalParityToneMappingPresets, toneMapExternalParityHdrPixels, toneMapExternalParityPixels } from "./ToneMapping";
export type { ExternalParityToneMappingIntent, ExternalParityToneMappingPolicy } from "./ToneMapping";
export { analyzeExternalParityExposure, createExternalParityExposurePolicy } from "./Exposure";
export type { ExternalParityExposureAnalysis, ExternalParityExposurePolicy } from "./Exposure";
export { createExternalParityHdrPipeline, executeExternalParityToneMapPass } from "./HDRRenderPipeline";
export type { ExternalParityHdrPipeline, ExternalParityHdrPipelineDescriptor, ExternalParityHdrPipelineMode, ExternalParityHdrRenderTargetFormat } from "./HDRRenderPipeline";
export { createRendererVisualPipelineReport, evaluateRendererCanvasBacking, evaluateRendererCaptureQuality, evaluateRendererFrameCadence, evaluateRendererScreenshotConsistency } from "./RendererVisualPipelineReport";
export type { RendererCanvasBackingInput, RendererCanvasBackingReport, RendererCaptureQualityInput, RendererCaptureQualityReport, RendererFrameCadenceInput, RendererFrameCadenceReport, RendererScreenshotConsistencyInput, RendererScreenshotConsistencyReport, RendererUnsupportedVisualCapability, RendererVisualColorReport, RendererVisualHdrTargetReport, RendererVisualPipelineReport, RendererVisualPipelineReportOptions, RendererVisualPipelineStatus, RendererVisualPostprocessDescriptor, RendererVisualPostprocessPassName, RendererVisualPostprocessReport, RendererVisualTargetFormat, RendererVisualToneMappingReport } from "./RendererVisualPipelineReport";
export { EXTERNAL_PARITY_REQUIRED_DEBUG_VIEWS, createExternalParityDebugView, createExternalParityDebugViewSet, encodeLinearDebugColor } from "./RenderDebugViews";
export type { ExternalParityDebugViewInput, ExternalParityDebugViewResult, ExternalParityRenderDebugView } from "./RenderDebugViews";
export { createExternalParityBrdfLut } from "./BRDFLut";
export type { ExternalParityBrdfLut } from "./BRDFLut";
export { createExternalParityPmrem } from "./PMREM";
export type { ExternalParityPmrem, ExternalParityPmremLevel } from "./PMREM";
export { createExternalParityIblResources } from "./IBL";
export type { ExternalParityIblOptions, ExternalParityIblResourceSet } from "./IBL";
export { createExternalParityEnvironmentPipeline, listExternalParityEnvironmentTargets } from "./EnvironmentPipeline";
export type { ExternalParityEnvironmentPipeline, ExternalParityEnvironmentPipelineOptions, ExternalParityEnvironmentTarget } from "./EnvironmentPipeline";
export { EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT, createExternalParityMaterialExtensionDiagnostics, getExternalParityMaterialExtensionState } from "./materials/MaterialExtensions";
export type { ExternalParityMaterialExtension, ExternalParityMaterialExtensionState } from "./materials/MaterialExtensions";
export { EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX, ExternalParityPhysicalMaterial, analyzeExternalParityMaterialMatrix, createExternalParityPhysicalMaterial } from "./materials/PhysicalMaterial";
export type { ExternalParityMaterialKind, ExternalParityPhysicalMaterialAnalysis, ExternalParityPhysicalMaterialDescriptor } from "./materials/PhysicalMaterial";
export { sortExternalParityAlphaItems } from "./materials/AlphaSorting";
export type { ExternalParityAlphaSortItem } from "./materials/AlphaSorting";
export { evaluateExternalParityTransmission } from "./materials/TransmissionPass";
export type { ExternalParityTransmissionResult, ExternalParityTransmissionSample } from "./materials/TransmissionPass";
export { createExternalParityContactShadow } from "./shadows/ContactShadows";
export type { ExternalParityContactShadow, ExternalParityContactShadowOptions } from "./shadows/ContactShadows";
export { createExternalParityCascadedShadowPipeline } from "./shadows/CascadedShadowPipeline";
export type { ExternalParityCascadeDescriptor, ExternalParityCascadedShadowPipeline } from "./shadows/CascadedShadowPipeline";
export { createExternalParityShadowDebugViews } from "./shadows/ShadowDebugViews";
export type { ExternalParityShadowDebugView } from "./shadows/ShadowDebugViews";
export { createExternalParityBloomEvidence, runExternalParityBloom } from "./postprocess/BloomPass";
export type { ExternalParityBloomEvidence } from "./postprocess/BloomPass";
export { createExternalParityDepthBinding, runExternalParitySSAO } from "./postprocess/SSAOPass";
export { runExternalParityDepthOfField } from "./postprocess/DepthOfFieldPass";
export { runExternalParityColorGrade } from "./postprocess/ColorGradingPass";
export type { ExternalParityColorGradePreset } from "./postprocess/ColorGradingPass";
export { PostProcessComposer, createPostProcessCapabilityReport } from "./postprocess/EffectComposer";
export type { PostProcessCapabilityReport, PostProcessComposerDiagnostics, PostProcessComposerOptions, PostProcessComposerPass, PostProcessComposerRenderOptions, PostProcessUnsupportedEffect } from "./postprocess/EffectComposer";
export { CINEMATIC_POSTPROCESS_EFFECT_IDS, analyzeCinematicPostprocessClarity, createCinematicDiagnosticsReport } from "./postprocess/CinematicDiagnostics";
export type { CinematicCapabilityArea, CinematicCapabilityEntry, CinematicCapabilityStatus, CinematicDiagnosticId, CinematicDiagnosticsBackendInfo, CinematicDiagnosticsReport, CinematicPostprocessClarityFinding, CinematicPostprocessClarityFindingId, CinematicPostprocessClarityInput, CinematicPostprocessClarityReport, CinematicPostprocessClaritySeverity, CinematicPostprocessClarityStatus, CinematicPostprocessFrameMetrics, CinematicPostprocessPipelineDescriptor, CinematicPostProcessEffectId } from "./postprocess/CinematicDiagnostics";
export { createRendererStats } from "./performance/RendererStats";
export type { RendererStats, RendererStatsInput } from "./performance/RendererStats";
export { evaluateResourceBudget } from "./performance/ResourceBudget";
export type { ResourceBudget, ResourceBudgetReport, ResourceBudgetUsage } from "./performance/ResourceBudget";
export { sortRenderItems, sortRenderQueueItems } from "./performance/RenderItemSorting";
export type { SortableRenderItem, RenderQueueBucket, RenderQueuePlan, RenderQueueSortDiagnostics, RenderQueueSortItem, RenderQueueSortOptions } from "./performance/RenderItemSorting";
export { createDefaultPerformanceLodLevels, selectPerformanceLodLevel } from "./performance/LOD";
export type { PerformanceLodLevel } from "./performance/LOD";
export type { BrdfLutDescriptor, DiffuseIrradianceGenerationOptions, EnvironmentColorSpace, EnvironmentHdrEncodeOptions, EnvironmentInputEncoding, EnvironmentMapResourceInput, EnvironmentMapResourceSet, EnvironmentMipGenerationOptions, EnvironmentResourceSetOptions, EnvironmentToneMappingOperator, LinearHdrEnvironmentMapSource, Rgba8EnvironmentMapSource, RgbeEnvironmentMapSource } from "./EnvironmentMapResources";
export { Sampler } from "./Sampler";
export type { SamplerDescriptor, TextureAddressMode, TextureFilter, TextureMagFilter, TextureMinFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
export { ThreeCompatRenderer, createThreeCompatRenderer, summarizeThreeCompatRendererDiagnostics, THREE_COMPAT_REQUIRED_RENDERER_FEATURES } from "./threejs-compatibility";
export type { ThreeCompatInstancingSystemStatus, ThreeCompatLightDescriptor, ThreeCompatLightKind, ThreeCompatMaterialMode, ThreeCompatRenderTargetDescriptor, ThreeCompatRendererBackend, ThreeCompatRendererDiagnostics, ThreeCompatRendererFeatureStatus, ThreeCompatRendererOptions, ThreeCompatRendererSupportState, ThreeCompatSceneRenderPlan, ThreeCompatShadowSystemStatus, ThreeCompatTextureCapability, ThreeCompatTransparencySystemStatus } from "./threejs-compatibility";
export * from "./threejs-compatibility/postprocess";
export * from "./threejs-compatibility/shaders";
export * from "./threejs-compatibility/vfx";
export * from "./threejs-compatibility/performance";
export { ProductionWebGL2Renderer, ProductionRuntimeRenderer, ProductionWebGPURenderer, analyzePixels, createContactShadowPass, createProductionOrbitControlPreset, createProductionEnvironmentLightingResources, createProductionEffectsRenderSource, createProductionPbrHdrPipelineFromRadiance, createProductionToneMappingPolicy, createProductionWebGPUReport, resolveProductionRuntimeRendererBackend, loadProductionHdrEnvironment, parseProductionRadianceHDR, summarizeProductionAnimationWorkflow, summarizeProductionEffectsProof, summarizeProductionProductionProof, summarizeProductionWebGL2Proof } from "./production-runtime";
export type { ProductionEffectsOptions, ProductionEffectsSummary, ProductionAnimationMetadataInput, ProductionAnimationWorkflowSummary, ProductionOrbitControlPreset, ProductionEnvironmentLightingResources, ProductionHdrEnvironmentLoaderOptions, ProductionLoadedHdrEnvironment, ProductionImportedAssetRenderMetadata, ProductionPbrHdrPipeline, ProductionPbrHdrPipelineOptions, ProductionPixelMetrics, ProductionProductionRenderer, ProductionRadianceHDR, ProductionRenderProof, ProductionRendererBackend, ProductionRendererFeature, ProductionRendererFeatureState, ProductionRendererInput, RuntimeParityFrameRenderResult, ProductionToneMappingOperator, ProductionToneMappingPolicy, ProductionWebGPUAdapterLike, ProductionWebGPULike, ProductionWebGPUReport, ProductionWebGPUStatus, ContactShadowPassDiagnostics, ProductionRuntimeRendererBackendPreference, ProductionRuntimeRendererBackendSelection, ProductionRuntimeRendererOptions, ProductionWebGL2RendererOptions, ProductionWebGPURendererOptions } from "./production-runtime";
export { ShaderModule } from "./ShaderModule";
export { RenderPipeline } from "./RenderPipeline";
export type { PipelineDrawDescriptor, RenderPipelineDescriptor } from "./RenderPipeline";
export { ShaderPreprocessor } from "./ShaderPreprocessor";
export type { ShaderPreprocessOptions, ShaderPreprocessResult, ShaderSourceMapEntry } from "./ShaderPreprocessor";
export { DEFAULT_DEPTH_SHADER_MARKER, DEFAULT_DEPTH_SHADER_NAME, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_MARKER, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_MARKER, DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_MORPH_UNLIT_SHADER_MARKER, DEFAULT_MORPH_UNLIT_SHADER_NAME, DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER, DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_SHADER_MARKER, DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT, DEFAULT_SKINNED_LIT_SHADER_MARKER, DEFAULT_SKINNED_LIT_SHADER_NAME, DEFAULT_SKINNED_UNLIT_SHADER_MARKER, DEFAULT_SKINNED_UNLIT_SHADER_NAME, DEFAULT_TEXTURED_UNLIT_SHADER_MARKER, DEFAULT_TEXTURED_UNLIT_SHADER_NAME, DEFAULT_UNLIT_SHADER_MARKER, DEFAULT_UNLIT_SHADER_NAME, ShaderLibrary, createDefaultShaderLibrary } from "./ShaderLibrary";
export type { CompiledShaderSource, ShaderSourcePair } from "./ShaderLibrary";
export type { ShaderVariantDescriptor } from "./ShaderLibrary";
export { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
export type { ShaderChunk } from "./ShaderChunks";
export { DEFAULT_RENDER_STATE, Material, validateRenderState } from "./Material";
export type { CullMode, DepthCompare, MaterialDescriptor, MaterialUniformDescriptor, MaterialUniformKind, RenderState } from "./Material";
export { MaterialInstance } from "./MaterialInstance";
export { MaterialBinding, MaterialBindingError } from "./MaterialBinding";
export type { MaterialBindingResult } from "./MaterialBinding";
export { UnlitMaterial } from "./UnlitMaterial";
export type { UnlitMaterialOptions } from "./UnlitMaterial";
export { InstancedUnlitMaterial, MAX_INSTANCED_UNLIT_INSTANCES } from "./InstancedUnlitMaterial";
export type { InstancedUnlitMaterialOptions } from "./InstancedUnlitMaterial";
export { InstancedPBRMaterial, MAX_INSTANCED_PBR_INSTANCES } from "./InstancedPBRMaterial";
export type { InstancedPBRMaterialOptions } from "./InstancedPBRMaterial";
export { TexturedUnlitMaterial } from "./TexturedUnlitMaterial";
export type { TexturedUnlitMaterialOptions } from "./TexturedUnlitMaterial";
export { SkinnedUnlitMaterial } from "./SkinnedUnlitMaterial";
export type { SkinnedUnlitMaterialOptions } from "./SkinnedUnlitMaterial";
export { SkinnedLitMaterial } from "./SkinnedLitMaterial";
export type { SkinnedLitMaterialOptions } from "./SkinnedLitMaterial";
export { MorphUnlitMaterial } from "./MorphUnlitMaterial";
export type { MorphUnlitMaterialOptions } from "./MorphUnlitMaterial";
export { DEFAULT_PBR_SHADER_MARKER, DEFAULT_PBR_SHADER_NAME, PBRMaterial } from "./PBRMaterial";
export type { PBRMaterialOptions } from "./PBRMaterial";
export { DEFAULT_PBR_ENVIRONMENT_INTENSITY, DEFAULT_PBR_PROCEDURAL_ENVIRONMENT_MAP } from "./PBRLightingDefaults";
export { NormalMappedPBRMaterial } from "./NormalMappedPBRMaterial";
export type { NormalMappedPBRMaterialOptions } from "./NormalMappedPBRMaterial";
export { TexturedPBRMaterial, isTexturedPbrTextureSlotShaderActive, texturedPbrShaderActiveTextureSlots } from "./TexturedPBRMaterial";
export type { TexturedPBRMaterialOptions, TexturedPBRTextureSlot } from "./TexturedPBRMaterial";
export { MaterialPresetRegistry, createPhysicalMaterialPreset, defaultMaterialPresets, listPhysicalMaterialPresets, physicalMaterialPresetDescriptor } from "./MaterialPresets";
export type { MaterialFactory, MaterialPresetDescriptor, MaterialPresetKind, MaterialPresetOptions, PhysicalMaterialPresetDescriptor, PhysicalMaterialPresetName } from "./MaterialPresets";
export { BaseRenderPass } from "./RenderPass";
export type { RenderPass, RenderPassContext } from "./RenderPass";
export { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, EnvironmentBackgroundPass, createEnvironmentBackgroundUniforms } from "./EnvironmentBackgroundPass";
export type { EnvironmentBackgroundEncoding, EnvironmentBackgroundOptions, EnvironmentBackgroundProjection } from "./EnvironmentBackgroundPass";
export { ENVIRONMENT_BACKGROUND_CUBE_FACES, createCubemapEnvironmentBackgroundOptions, createEquirectEnvironmentBackgroundOptions, validateEnvironmentBackgroundResourceOptions } from "./EnvironmentBackgroundResources";
export type { CubemapEnvironmentBackgroundFacePixels, CubemapEnvironmentBackgroundResourceOptions, EnvironmentBackgroundPixelFormat, EnvironmentBackgroundResourceOptions, EquirectEnvironmentBackgroundResourceOptions } from "./EnvironmentBackgroundResources";
export { RenderGraph } from "./RenderGraph";
export type { RenderGraphPlan, RenderGraphResourceLifetime } from "./RenderGraph";
export { buildRenderDebugOverlaySnapshot, captureRenderDebugIssue, formatRenderDebugIssue } from "./RendererDebugOverlay";
export type { RenderDebugIssue, RenderDebugIssueKind, RenderDebugOverlaySnapshot } from "./RendererDebugOverlay";
export { RendererTimingCollector, createCpuFallbackGpuTimingBackend, createImmediateGpuTimingBackend, createWebGL2GpuTimingBackend } from "./RendererTiming";
export type { RendererGpuTimingBackend, RendererGpuTimingResult, RendererGpuTimingToken, RendererTimingCollectorOptions, RendererTimingSample, RendererTimingSampleSource, RendererTimingSnapshot } from "./RendererTiming";
export { ForwardPass } from "./ForwardPass";
export { MAX_GPU_INSTANCES, MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES } from "./ForwardPass";
export type { EnvironmentLightingOptions, ForwardEnvironmentFogMode, ForwardEnvironmentFogOptions, ForwardPassOptions, ForwardShadowMapOptions, RenderItem, RenderItemDrawRange, RenderMaterial, SkinningPaletteBinding } from "./ForwardPass";
export { batchStaticRenderItems, buildStaticBoundsBvh, queryStaticBoundsBvh, raycastStaticBoundsBvh, selectLodLevel, updateStaticBoundsBvh } from "./SceneOptimization";
export type { LodLevel, LodSelection, LodSelectionInput, StaticBatchInput, StaticBatchOptions, StaticBatchResult, StaticBoundsBvh, StaticBoundsBvhBuildDiagnostics, StaticBoundsBvhNode, StaticBoundsBvhOptions, StaticBoundsBvhQueryOptions, StaticBoundsBvhQueryResult, StaticBoundsBvhRaycastDiagnostics, StaticBoundsBvhRaycastHit, StaticBoundsBvhRaycastResult, StaticBoundsBvhTraversalDiagnostics, StaticBoundsBvhUpdateResult, StaticBoundsIntersector, StaticSpatialBounds, StaticSpatialItem } from "./SceneOptimization";
export { computePerspectiveCameraFrame } from "./CameraFraming";
export type { CameraFrameBounds, CameraFrameViewport, PerspectiveCameraFrame, PerspectiveCameraFrameOptions } from "./CameraFraming";
export { createStereoCameraRig } from "./StereoCameraRig";
export type { StereoCameraRig, StereoCameraRigOptions, StereoEye, StereoEyeView, StereoLayout, StereoViewport } from "./StereoCameraRig";
export { createAnaglyphCompositePlan, createAnaglyphPixelComposite, createParallaxBarrierInterleavePlan, createParallaxBarrierPixelComposite, createStereoEffectPlan } from "./StereoEffects";
export * from "./cinematic/index";
export type { AnaglyphCompositePlan, AnaglyphPixelComposite, AnaglyphPixelCompositeOptions, ParallaxBarrierInterleavePlan, ParallaxBarrierPixelComposite, ParallaxBarrierPixelCompositeOptions, StereoEffectMode, StereoEffectPlan, StereoEffectPlanOptions } from "./StereoEffects";
export { analyzeRgbaFrameVisualMetrics, evaluateFrameVisualQuality } from "./FrameVisualMetrics";
export type { FrameVisualBounds, FrameVisualMetrics, FrameVisualMetricsOptions, FrameVisualQualityResult, FrameVisualQualityThresholds } from "./FrameVisualMetrics";
export { LightCollector } from "./LightCollector";
export type { CollectedLight, CollectedLightKind, LightCollectorOptions } from "./LightCollector";
export { LightUniforms, MAX_DIRECT_LIGHTS } from "./LightUniforms";
export type { PackedLightUniforms } from "./LightUniforms";
export { DepthMaterial, DepthPass } from "./DepthPass";
export type { DepthPassOptions } from "./DepthPass";
export { ShadowMap, computeShadowDepthBias, createPoissonDiskShadowKernel, createShadowAtlasLayout, createShadowFilterKernel } from "./ShadowMap";
export type { ShadowAtlasAllocation, ShadowAtlasLayout, ShadowAtlasRequest, ShadowFilterDistribution, ShadowFilterKernel, ShadowFilterMode, ShadowFilterSample, ShadowMapOptions } from "./ShadowMap";
export { ShadowPass } from "./ShadowPass";
export type { ShadowPassOptions, ShadowPassReason, ShadowPassResult, ShadowTextureKind } from "./ShadowPass";
export { ShadowProjectionBuilder } from "./ShadowProjection";
export type { ShadowProjection, ShadowProjectionOptions, Vec3Tuple } from "./ShadowProjection";
export { BloomPass, DepthVisualizationPass, FXAAPass, ToneMappingPass, applyToneMappingPreset, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, computeAutoExposureFromHistogram, computeExposureHistogramFromPixels, createDepthTextureBinding, createToneMappingCalibration, depthTextureStats, depthOfFieldPixels, filmGrainPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, toneMappingPresets, resolveToneMappingPreset, visualizeDepthTexture } from "./PostProcessPass";
export type { AutoExposureOptions, AutoExposureResult, BloomOptions, BloomPassOptions, BloomResult, ChromaticAberrationOptions, ChromaticAberrationResult, ColorGradeOptions, ColorGradeResult, ContactShadowPostProcessOptions, ContactShadowPostProcessResult, DepthTextureBinding, DepthTextureFormat, DepthTextureStats, DepthVisualizationPassOptions, DepthVisualizationResult, DepthOfFieldOptions, DepthOfFieldResult, FilmGrainOptions, FilmGrainResult, FXAAOptions, FXAAPassOptions, FXAAResult, HdrToneMappingResult, ExposureHistogram, ExposureHistogramOptions, MotionBlurOptions, MotionBlurResult, OutlineOptions, OutlineResult, PostProcessColorSpace, SSAOOptions, SSAOResult, SSROptions, SSRResult, TAAOptions, TAAResult, ToneMappingCalibration, ToneMappingCalibrationSample, ToneMappingOperator, ToneMappingOptions, ToneMappingPassOptions, ToneMappingPreset, ToneMappingPresetName, ToneMappingPresetResult, ToneMappingResult } from "./PostProcessPass";
export { architecturalMaterialCatalogSummary, architecturalMaterialDescriptor, createArchitecturalMaterial, createArchitecturalMaterialCatalog } from "./ArchitecturalMaterialCatalog";
export type { ArchitecturalMaterialCatalogSummary, ArchitecturalMaterialCategory, ArchitecturalMaterialDescriptor } from "./ArchitecturalMaterialCatalog";
export { createArchitecturalLightingFixture } from "./ArchitecturalLightingFixtures";
export type { ArchitecturalInteriorLight, ArchitecturalLightingFixture, ArchitecturalLightingFixtureOptions, ArchitecturalLightingPresetId, ArchitecturalLightType, ArchitecturalRgb, ArchitecturalVector3 } from "./ArchitecturalLightingFixtures";
export { createArchitecturalMeasurementFixture } from "./ArchitecturalMeasurementFixtures";
export type { ArchitecturalMeasurementFixture, ArchitecturalMeasurementOptions, ArchitecturalMeasurementResult, ArchitecturalMeasurementType, ArchitecturalMeasurementUnit, ArchitecturalPoint3 } from "./ArchitecturalMeasurementFixtures";
export { createProceduralTexture, createProceduralTextureFixture, createProceduralTextureFixtureManifest, hashRgba8, normalFromHeightMap, proceduralTextureFixtureKinds } from "./ProceduralTextureFixtures";
export type { ProceduralTextureFixture, ProceduralTextureFixtureKind, ProceduralTextureFixtureOptions } from "./ProceduralTextureFixtures";
export { createProductTurntableFixture, createProductTurntableRenderKit } from "./ProductTurntableFixtures";
export type { ProductTurntableBatchTaskKind, ProductTurntableCaptureFormat, ProductTurntableCapturePlan, ProductTurntableDirection, ProductTurntableFixture, ProductTurntableFixtureOptions, ProductTurntableHotspot, ProductTurntableLighting, ProductTurntableLightingPreset, ProductTurntableRenderKit, ProductTurntableRenderKitOptions } from "./ProductTurntableFixtures";
export { createCanonicalProductSceneRenderKit } from "./CanonicalSceneFixtures";
export type { CanonicalProductSceneFixture, CanonicalProductSceneRenderKit } from "./CanonicalSceneFixtures";
export { createLightingDefault } from "./LightingDefaults";
export type { LightingDefault, LightingDefaultPreset } from "./LightingDefaults";
export { createLightingRig, listLightingRigPresets } from "./LightingRig";
export type { LightingRig, LightingRigDiagnostics, LightingRigLightDescriptor, LightingRigOptions, LightingRigPreset, LightingRigUnsupportedFeature } from "./LightingRig";
export { createTerrainHeightfieldFixture, sampleTerrainHeightfield } from "./TerrainFixtures";
export type { TerrainFixtureBiome, TerrainHeightfieldFixture, TerrainHeightfieldFixtureOptions, TerrainHeightfieldSample } from "./TerrainFixtures";
export { sampleWeatherFixture } from "./WeatherFixtures";
export type { WeatherFixtureOptions, WeatherFixtureSample, WeatherFixtureType, WeatherPuddlePatch, WeatherVisualDrop } from "./WeatherFixtures";
export { sampleVegetationFixture } from "./VegetationFixtures";
export type { VegetationFixtureInstance, VegetationFixtureLayer, VegetationFixtureLod, VegetationFixtureOptions, VegetationFixtureSample, VegetationLSystemBranchSegment, VegetationLSystemFixture } from "./VegetationFixtures";
export { sampleVoxelWorldFixture } from "./VoxelWorldFixtures";
export type { VoxelBlockDescriptor, VoxelFixtureBlockType, VoxelFixtureLod, VoxelFixtureOptions, VoxelVisibleBlock, VoxelWorldFixture } from "./VoxelWorldFixtures";
export { sampleOceanFixture } from "./OceanFixtures";
export type { OceanBuoyancySample, OceanFixtureOptions, OceanFixturePreset, OceanFixtureSample, OceanFoamPatch, OceanWaveDescriptor, OceanWaveSample } from "./OceanFixtures";
export { sampleCullingFixture } from "./CullingFixtures";
export type { CullingBvhTelemetry, CullingFeatureEvidence, CullingFixture, CullingFixtureObject, CullingFixtureOptions, CullingFrustumTelemetry, CullingHiZTelemetry } from "./CullingFixtures";
export { sampleSpaceEnvironmentFixture } from "./SpaceEnvironmentFixtures";
export type { SpaceEnvironmentDustParticle, SpaceEnvironmentFixture, SpaceEnvironmentNebula, SpaceEnvironmentStar } from "./SpaceEnvironmentFixtures";
export { LightingDebug } from "./LightingDebug";
export type { DebugLine } from "./LightingDebug";
export { CascadedShadowMaps, CascadedShadowPass, supportsCascadedShadowLight } from "./CascadedShadowMaps";
export type { CascadedShadowMapsOptions, CascadedShadowPassOptions, CascadedShadowPassResult, CascadeShadowPassResult, CascadeSplit, CascadeSplitOptions, ShadowCascade } from "./CascadedShadowMaps";
export { DEFAULT_RENDERER_AUTO_FRAME_OPTIONS, DEFAULT_RENDERER_DIRECT_LIGHTING, DEFAULT_RENDERER_ENVIRONMENT_LIGHTING, Renderer } from "./Renderer";
export { pickSceneRenderableHits, pickSceneRenderables } from "./Renderer";
export type { CameraLike, RendererAnimationLoop, RendererCameraPolicy, RendererFrameCapture, RendererFrameCaptureDiagnosticsSummary, RendererFrameCaptureMetadata, RendererFrameCapturePixelDigest, RendererFrameCapturePixelStats, RendererFrameCaptureRenderSize, RendererFrameCaptureWithMetadata, RendererInput, RendererOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
export { assertRendererFeatures, createRendererFeatureReport, rendererFeatureCatalog } from "./RendererFeatureGates";
export type { RendererFeature, RendererFeatureReport, RendererFeatureStatus } from "./RendererFeatureGates";
export { createExternalParityEnvironmentLighting, createExternalParityDirectionalShadowEvidence, createExternalParityFlagshipRenderPresetEvidence, createExternalParityGeneratedEnvironmentMapSource, createExternalParityGeneratedHdrEnvironmentMapSource, createExternalParityRenderPresetEvidence, sampleExternalParityLdrPostprocessReadback, externalParityActiveFeature, externalParityBlockedFeature, externalParityUnsupportedFeature } from "./ExternalParityRenderPreset";
export type { ExternalParityEnvironmentLightingBundle, ExternalParityEnvironmentPreset, ExternalParityDirectionalShadowEvidence, ExternalParityLdrPostprocessSummary, ExternalParityReadbackDevice, ExternalParityRenderPresetEvidence, ExternalParityRenderPresetEvidenceOptions, ExternalParityRenderPresetFeature, ExternalParityRenderPresetFeatureStatus } from "./ExternalParityRenderPreset";
export { PBR_REFERENCE_EPSILON, PBR_REFERENCE_INV_PI, PBR_REFERENCE_MIN_ROUGHNESS, PBR_REFERENCE_PI, pbrCausticsConformanceSuite, pbrCausticsTransmissionResponse, pbrDiffuseBurley, pbrDirectLight, pbrDistributionGgx, pbrEnvironmentLight, pbrF0, pbrFresnelSchlick, pbrFresnelSchlickRoughness, pbrFresnelSchlickRoughnessSpecular, pbrFresnelSchlickSpecular, pbrGeometrySmithGgxCorrelated, pbrPhotometricConformanceSuite, pbrReferenceFinite, pbrReferenceLuminance, pbrSaturate, pbrTransmissionVolumeConformanceSuite, pbrTransmissionVolumeResponse } from "./PbrReference";
export type { PbrDirectLightInput, PbrEnvironmentLightInput, PbrCausticsConformanceReport, PbrCausticsTransmissionInput, PbrCausticsTransmissionResponse, PbrPhotometricConformanceCategory, PbrPhotometricConformanceCheck, PbrPhotometricConformanceReport, PbrPhotometricConformanceSample, PbrTransmissionVolumeConformanceReport, PbrTransmissionVolumeInput, PbrTransmissionVolumeResponse, Vec3 } from "./PbrReference";
export * from "./production-runtime/geometry/ProjectedDecalGeometry";
export * from "./DecalGeometry.js";
export * from "./GeometryPrimitives.js";
export * from "./Instancing.js";
export * from "./LineGeometry.js";
export * from "./SpriteGeometry.js";
export * from "./Raycaster.js";
export * from "./ReflectionProbe.js";
export * from "./ReflectionSurfaces.js";
export * from "./RenderQueue.js";
export * from "./RenderState.js";
export * from "./ResourceLifecycle.js";
export * from "./UniformBinder.js";
export * from "./performance/FrustumCuller.js";
export * from "./performance/BVH.js";
export * from "./performance/Octree.js";
export * from "./performance/Batcher.js";
export * from "./webgpu/WebGPUBuffer.js";
export * from "./webgpu/WebGPUPipelineCache.js";
export * from "./webgpu/WebGPUPostProcess.js";
export * from "./webgpu/WebGPUTexture.js";
export * from "./effects/Particle.js";
export * from "./effects/ParticleEmitter.js";
export * from "./effects/ParticleModule.js";
export * from "./effects/VelocityModule.js";
export * from "./effects/ColorModule.js";
export * from "./effects/SizeModule.js";
export * from "./effects/ForceModule.js";
export * from "./effects/CollisionModule.js";
export * from "./effects/TrailModule.js";
export * from "./effects/ParticleRenderer.js";
export * from "./effects/ParticleRenderPass.js";
export * from "./effects/GPUParticleBackend.js";
export * from "./effects/ParticleSystem.js";
export * from "./effects/ParticleEffectPresets.js";
export * from "./effects/ParticleDiagnostics.js";
```

## @aura3d/scene

- Version: `1.1.0`
- Package manifest: `packages/scene/package.json`
- Public entrypoint: `packages/scene/src/index.ts`

### Export Declarations

```ts
export * from "./MathTypes.js";
export * from "./TransformNode.js";
export * from "./Bounds.js";
export * from "./SceneNode.js";
export * from "./Object3D.js";
export * from "./Hierarchy.js";
export * from "./Camera.js";
export * from "./PerspectiveCamera.js";
export * from "./OrthographicCamera.js";
export * from "./Light.js";
export * from "./DirectionalLight.js";
export * from "./PointLight.js";
export * from "./SpotLight.js";
export * from "./Layers.js";
export * from "./Lights.js";
export * from "./Renderable.js";
export * from "./SceneQuery.js";
export * from "./SceneMetadata.js";
export * from "./Scene.js";
export * from "./SceneSerializer.js";
```

## @aura3d/scripting

- Version: `1.1.0`
- Package manifest: `packages/scripting/package.json`
- Public entrypoint: `packages/scripting/src/index.ts`

### Export Declarations

```ts
export type { Behavior, BehaviorPhase } from "./Behavior";
export { BehaviorAction, BehaviorCondition, BehaviorSelector, BehaviorSequence, BehaviorTree, BehaviorTreeNode, Blackboard } from "./BehaviorTree";
export type { BehaviorTreeContext, BehaviorTreeStatus, BehaviorTreeTickResult, BlackboardChange, BlackboardValue } from "./BehaviorTree";
export { PerceptionSensor } from "./Perception";
export type { PerceptionHit, PerceptionMemory, PerceptionPoint, PerceptionSensorOptions, PerceptionSnapshot, PerceptionTarget } from "./Perception";
export { UtilityAI, UtilityAction, UtilityConsideration } from "./UtilityAI";
export type { UtilityActionOptions, UtilityActionScore, UtilityConsiderationOptions, UtilityContext, UtilityCurve, UtilityScoring } from "./UtilityAI";
export { State, StateMachine } from "./StateMachine";
export type { StateMachineSnapshot, StateTransition, StateTransitionCondition } from "./StateMachine";
export { GOAPAction, GOAPPlanner, WorldState } from "./GOAP";
export type { GOAPActionOptions, GOAPPlan, GOAPPlannerOptions, GOAPStateShape, GOAPValue } from "./GOAP";
export { HTNPlanner, HTNTask } from "./HTN";
export type { HTNCompoundTaskOptions, HTNPlan, HTNPlannerOptions, HTNPrimitiveTaskOptions, HTNTaskMethod, HTNTaskResult, HTNTaskType } from "./HTN";
export { DecisionTree } from "./DecisionTree";
export type { DecisionAction, DecisionCondition, DecisionTreeContext, DecisionTreeDecision, DecisionTreeNode, DecisionTreeNodeType, DecisionTreeStats } from "./DecisionTree";
export { sampleAdaptiveDifficultyFixture } from "./AdaptiveDifficultyFixtures";
export type { AdaptiveDifficultyAdjustment, AdaptiveDifficultyChangeType, AdaptiveDifficultyFixture, AdaptiveDifficultyFixtureOptions, AdaptiveDifficultyMetricSummary, AdaptiveDifficultyMetricType, AdaptiveDifficultyStrategy, AdaptiveDifficultyTriggeredRule } from "./AdaptiveDifficultyFixtures";
export { sampleAnalyticsPrivacyFixture } from "./AnalyticsPrivacyFixtures";
export type { AnalyticsConsentCategory, AnalyticsPrivacyFixture, AnalyticsPrivacyFixtureOptions, AnalyticsProviderMode } from "./AnalyticsPrivacyFixtures";
export { sampleCulturalBehaviorFixture } from "./CulturalBehaviorFixtures";
export type { CulturalBehaviorFixture, CulturalBehaviorFixtureOptions, CulturalCommunicationStyle, CulturalEntityFixture, CulturalPersonalSpace, CulturalRelationship, CultureDescriptor, ProxemicZone } from "./CulturalBehaviorFixtures";
export { sampleCloudServiceFixture } from "./CloudServiceFixtures";
export type { CloudFixtureServiceStatus, CloudServiceFixture, CloudServiceFixtureOptions } from "./CloudServiceFixtures";
export { sampleLearningAgentFixture } from "./LearningAgentFixtures";
export type { LearningAgentFixture, LearningAgentFixtureOptions } from "./LearningAgentFixtures";
export { sampleNetworkReplicationFixture } from "./NetworkReplicationFixtures";
export type { NetworkDeltaSummary, NetworkEntityState, NetworkInputFrame, NetworkInterestSummary, NetworkInterpolationSummary, NetworkPredictionSummary, NetworkReplicationFixture, NetworkReplicationFixtureOptions, NetworkReplicationMode } from "./NetworkReplicationFixtures";
export { samplePlayerBehaviorTelemetryFixture } from "./PlayerBehaviorTelemetryFixtures";
export type { PlayerBehaviorPatternTelemetry, PlayerBehaviorTelemetryFixture, PlayerBehaviorTelemetryOptions, PlayerEngagementLevel, PlayerEventCategory, PlayerEventSeverity, PlayerPlaystyle, PlayerSkillAssessmentTelemetry, PlayerSkillLevel } from "./PlayerBehaviorTelemetryFixtures";
export { sampleProceduralContentAdaptationFixture } from "./ProceduralContentAdaptationFixtures";
export type { AdaptiveAiStrategy, GeneratedContentDifficulty, GeneratedContentTelemetry, GeneratedContentType, ProceduralContentAdaptationFixture, ProceduralContentAdaptationOptions } from "./ProceduralContentAdaptationFixtures";
export { sampleFpsEnemyTactics, sampleFpsHudOverlay, sampleFpsLevelLayout, sampleFpsWeaponCycle, samplePowerUpEffect, sampleSpaceShooterWave, sampleWeaponBurst } from "./WeaponSystem";
export type { FpsEnemyTacticalState, FpsEnemyTacticsInput, FpsEnemyTacticsSample, FpsFiringMode, FpsHudOverlayInput, FpsHudOverlaySample, FpsLevelCorridor, FpsLevelLayoutInput, FpsLevelLayoutSample, FpsLevelPickup, FpsLevelPoint, FpsLevelRoom, FpsPickupType, FpsWeaponCycleInput, FpsWeaponCycleSample, FpsWeaponType, PowerUpEffectInput, PowerUpEffectSample, SpaceShooterEnemyType, SpaceShooterFormation, SpaceShooterPowerUpType, SpaceShooterSpawn, SpaceShooterWaveInput, SpaceShooterWaveSample, WeaponBurst, WeaponBurstInput, WeaponKind, WeaponProjectile } from "./WeaponSystem";
export { BehaviorHost } from "./BehaviorHost";
export type { BehaviorHostOptions } from "./BehaviorHost";
export { BehaviorRegistry } from "./BehaviorRegistry";
export type { BehaviorFactory } from "./BehaviorRegistry";
export { BehaviorSystem } from "./BehaviorSystem";
export type { BehaviorError, BehaviorSystemUpdateOptions } from "./BehaviorSystem";
export { ScriptContext } from "./ScriptContext";
export type { ScriptContextOptions } from "./ScriptContext";
export { deserializeGraph, serializeGraph, validateGraph } from "./VisualGraph";
export type { SerializedVisualGraph, VisualEdge, VisualGraph } from "./VisualGraph";
export { VisualGraphExecutor } from "./VisualGraphExecutor";
export type { VisualExecutionResult } from "./VisualGraphExecutor";
export type { VisualAnimationControllerState, VisualAnimationEvent, VisualCameraState, VisualCollisionEvent, VisualCombatEvent, VisualGraphDiagnostic, VisualGraphExecutionContext, VisualGraphSideEffect, VisualGraphValidationOptions, VisualInputSet, VisualInputSnapshot, VisualOverlapResult, VisualPhysicsBodyState, VisualRaycastHit, VisualRuntimeNodeState, VisualStateCollection, VisualVector3 } from "./VisualGraphContext";
export { createVisualNode, getVisualNodeDefinition, listVisualNodeDefinitions } from "./VisualNodeCatalog";
export type { VisualNodeCategory, VisualNodeDefinition } from "./VisualNodeCatalog";
export { validateNode } from "./VisualNode";
export type { VisualNode, VisualPort, VisualPortDirection, VisualPortType } from "./VisualNode";
```

## @aura3d/three-compat

- Version: `1.1.0`
- Package manifest: `packages/three-compat/package.json`
- Public entrypoint: `packages/three-compat/src/index.ts`

### Export Declarations

```ts
export { REQUIRED_THREE_API_CATEGORIES, THREE_EXAMPLES_INVENTORY, buildThreeApiInventory, categorizeThreeExport } from "./ThreeApiInventory";
export { GroupCompat, LineSegmentsCompat, MeshCompat, Object3DCompat, PointsCompat, SpriteBatchCompat, SpriteCompat } from "./core/Object3DCompat";
export type { SpriteBatchInstanceCompat } from "./core/Object3DCompat";
export { SceneCompat } from "./core/SceneCompat";
export { RaycasterCompat } from "./core/RaycasterCompat";
export type { RaycasterCompatIntersection } from "./core/RaycasterCompat";
export { ColorCompat, Matrix4Compat, QuaternionCompat, Vector3Compat } from "./math";
export { CameraCompat, OrthographicCameraCompat, PerspectiveCameraCompat } from "./cameras";
export { BoxGeometryCompat, BufferGeometryCompat, CircleGeometryCompat, ConeGeometryCompat, CylinderGeometryCompat, InstancedBufferGeometryCompat, PlaneGeometryCompat, SphereGeometryCompat, TorusGeometryCompat, THREE_COMPAT_COMPAT_GEOMETRY_TYPES } from "./geometries";
export type { BufferAttributeCompat } from "./geometries";
export { LineBasicMaterialCompat, MaterialCompat, MeshBasicMaterialCompat, MeshLambertMaterialCompat, MeshPhongMaterialCompat, MeshPhysicalMaterialCompat, MeshStandardMaterialCompat, PointsMaterialCompat, ShaderMaterialCompat, SpriteMaterialCompat, THREE_COMPAT_COMPAT_MATERIAL_TYPES } from "./materials";
export type { MaterialCompatParameters } from "./materials";
export { TextureCompat, TextureLoaderCompat, THREE_COMPAT_COMPAT_TEXTURE_SETTINGS } from "./textures";
export type { TextureFilterCompat, TextureWrapCompat } from "./textures";
export { WebGLMultipleRenderTargetsCompat, WebGLRenderTargetCompat } from "./render-targets";
export { CubeTextureLoaderCompat, EXRLoaderCompat, GLTFLoaderCompat, HDRLoaderCompat, KTX2LoaderCompat, MTLLoaderCompat, OBJLoaderCompat, ThreeCompatTextureLoader } from "./loaders";
export { DragControls, FirstPersonControls, FlyControls, MapControls, OrbitControls, Picking, PointerLockControls, SelectionManager, TrackballControls, TransformControls } from "./controls";
export type { TransformControlMode, ThreeCompatControlState, ThreeCompatPickResult } from "./controls";
export { AnimationActionCompat, AnimationClipCompat, AnimationMixerCompat, MorphTargetMixerCompat, SkeletonCompat, SkinnedMeshCompat } from "./animation";
export { ColorGradingPassCompat, DepthOfFieldPassCompat, EffectComposerCompat, FXAAPassCompat, OutlinePassCompat, RenderPassCompat, ShaderPassCompat, SMAAPassCompat, SSAOPassCompat, TAAPassCompat, UnrealBloomPassCompat, VignettePassCompat } from "./postprocessing";
export { NodeMaterialCompat, RawShaderMaterialCompat, CustomShaderMaterialCompat, UniformsCompat, SHADER_CHUNKS_THREE_COMPAT, diagnoseThreeCompatShader } from "./shaders";
export { THREE_COMPAT_THREE_IMPORT_MAP } from "./migration/ImportMap";
export { migrateThreeToA3D } from "./migration/ThreeToA3DAdapter";
export type { ThreeCompatMigrationResult } from "./migration/ThreeToA3DAdapter";
export { createThreeCompatCompatibilityWarnings } from "./migration/CompatibilityWarnings";
export type { ThreeCompatCompatibilityWarning } from "./migration/CompatibilityWarnings";
export { AmbientLightCompat, DirectionalLightCompat, HemisphereLightCompat, LightCompat, PointLightCompat, RectAreaLightCompat, SpotLightCompat } from "./lights";
export { AxesHelperCompat, BoxHelperCompat, CameraHelperCompat, DirectionalLightHelperCompat, GridHelperCompat, HelperLineSegmentsCompat, SkeletonHelperCompat } from "./helpers";
export { THREE_COMPAT_COMPATIBILITY_THRESHOLDS, buildInitialCompatibilityMatrix, supportedOrPartial } from "./ThreeCompatibilityMatrix";
export type { ThreeApiCategory, ThreeApiInventory, ThreeApiInventoryEntry } from "./ThreeApiInventory";
export type { ThreeCompatibilityEntry, ThreeCompatibilityMatrix, ThreeCompatibilityStatus, ThreeCompatibilityThreshold } from "./ThreeCompatibilityMatrix";
```

## @aura3d/workflows

- Version: `1.1.0`
- Package manifest: `packages/workflows/package.json`
- Public entrypoint: `packages/workflows/src/index.ts`

### Export Declarations

```ts
export { createAssetViewerWorkflow } from "./AssetViewerWorkflow";
export { createProductConfiguratorWorkflow } from "./ProductConfiguratorWorkflow";
export { createMaterialStudioWorkflow } from "./MaterialStudioWorkflow";
export { createSceneShowcaseWorkflow } from "./SceneShowcaseWorkflow";
export { createInteractiveSceneWorkflow } from "./InteractiveSceneWorkflow";
export { createAnimationLabWorkflow } from "./AnimationLabWorkflow";
export { createComparisonWorkflow } from "./ComparisonWorkflow";
export { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
export { workflows as externalParityWorkflows } from "./workflow-foundation/index";
export { PRODUCTION_WORKFLOWS, createProductionAssetPreflight, createProductionRendererDefaults, createProductionVisualQAResult, createProductionWorkflowPlan, listProductionWorkflowDefinitions, runProductionExample } from "./production-runtime";
export type { ProductionAssetPreflightInput, ProductionAssetPreflightResult, ProductionExampleAsset, ProductionExampleDefinition, ProductionExampleEnvironment, ProductionExampleRuntime, ProductionExampleRuntimeMetrics, ProductionRendererDefaults, ProductionVisualQAInput, ProductionVisualQAResult, ProductionWorkflowDefinition, ProductionWorkflowId, ProductionWorkflowPlan } from "./production-runtime";
export type * from "./WorkflowTypes";
```
