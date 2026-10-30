# Aura3D Public API Reference

This file is generated from every non-private package entrypoint under `packages/*/src/index.ts`.
It documents the public export surface that package consumers can import today.

**Agents: do not read this file whole.** It is the exhaustive declaration dump (roughly 40k tokens) kept for gates and diffs. For `@aura3d/engine` start at [`root-exports.md`](root-exports.md) (generated from the real root entry `packages/engine/src/public/index.ts`; the `@aura3d/engine` section below lists a legacy entry file). For tasks, use `docs/agents/api-surface.md`.

Regenerate and verify it with:

```sh
pnpm verify:api-docs
```

## Packages

| Package | Version | Entrypoint | Export declarations |
|---|---:|---|---:|
| `@aura3d/animation` | `4.6.1` | `packages/animation/src/index.ts` | 49 |
| `@aura3d/apps` | `4.6.1` | `packages/apps/src/index.ts` | 10 |
| `@aura3d/asset-index` | `4.6.1` | `packages/asset-index/src/index.ts` | 29 |
| `@aura3d/assets` | `4.6.1` | `packages/assets/src/index.ts` | 93 |
| `@aura3d/assets/gltf-runtime` | `4.6.1` | `packages/assets/src/gltf-runtime.ts` | 6 |
| `@aura3d/audio` | `4.6.1` | `packages/audio/src/index.ts` | 50 |
| `@aura3d/cli` | `4.6.1` | `packages/aura3d-cli/src/index.ts` | 48 |
| `@aura3d/controls` | `4.6.1` | `packages/controls/src/index.ts` | 46 |
| `@aura3d/core` | `4.6.1` | `packages/core/src/index.ts` | 14 |
| `create-aura3d` | `4.6.1` | `packages/create-aura3d/src/index.ts` | 18 |
| `@aura3d/debug` | `4.6.1` | `packages/debug/src/index.ts` | 32 |
| `@aura3d/ecs` | `4.6.1` | `packages/ecs/src/index.ts` | 25 |
| `@aura3d/editor-runtime` | `4.6.1` | `packages/editor-runtime/src/index.ts` | 82 |
| `@aura3d/engine` | `4.6.1` | `packages/engine/src/index.ts` | 23 |
| `@aura3d/input` | `4.6.1` | `packages/input/src/index.ts` | 34 |
| `@aura3d/math` | `4.6.1` | `packages/math/src/index.ts` | 30 |
| `@aura3d/navigation-recast` | `4.6.1` | `packages/navigation-recast/src/index.ts` | 16 |
| `@aura3d/physics` | `4.6.1` | `packages/physics/src/index.ts` | 25 |
| `@aura3d/physics-rapier` | `4.6.1` | `packages/physics-rapier/src/index.ts` | 27 |
| `@aura3d/physics/solverless` | `4.6.1` | `packages/physics/src/solverless.ts` | 13 |
| `@aura3d/physics/world` | `4.6.1` | `packages/physics/src/world.ts` | 3 |
| `@aura3d/product-studio` | `4.6.1` | `packages/product-studio/src/index.ts` | 12 |
| `@aura3d/react` | `4.6.1` | `packages/react/src/index.ts` | 42 |
| `@aura3d/rendering` | `4.6.1` | `packages/rendering/src/index.ts` | 426 |
| `@aura3d/rendering/extension-scalar-atlas` | `4.6.1` | `packages/rendering/src/extension-scalar-atlas.ts` | 2 |
| `@aura3d/rendering/reflection-surfaces` | `4.6.1` | `packages/rendering/src/reflection-surfaces.ts` | 4 |
| `@aura3d/rendering/webgpu` | `4.6.1` | `packages/rendering/src/webgpu.ts` | 8 |
| `@aura3d/scene` | `4.6.1` | `packages/scene/src/index.ts` | 21 |
| `@aura3d/scripting` | `4.6.1` | `packages/scripting/src/index.ts` | 39 |
| `@aura3d/workflows` | `4.6.1` | `packages/workflows/src/index.ts` | 12 |

## @aura3d/animation

- Version: `4.6.1`
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
export * from "./Inertialization.js";
export * from "./AnimationStateMachine.js";
export * from "./AnimationStateGraph.js";
export * from "./LocomotionKit.js";
export * from "./FighterAnimationAdapter.js";
export * from "./RootMotion.js";
export * from "./LocomotionEvidence.js";
export * from "./MotionQuality.js";
export * from "./LocomotionController.js";
export * from "./SceneAnimationBridge.js";
export * from "./PropertyBinding.js";
export * from "./AnimationObjectGroup.js";
export { AnimationUtils, arraySlice, convertArray, isTypedArray, getKeyframeOrder, sortedArray, subclip, optimize, merge, makeClipAdditive, isClipAdditive, type AdditiveReference } from "./AnimationUtils.js";
export * from "./ECSAnimationBridge.js";
export * from "./IK.js";
export * from "./FootIk.js";
export * from "./SpringBones.js";
export * from "./experimental/CrowdAnimation.js";
export * from "./AnimationClipEvents.js";
export { AnimationClipRegistry, createAnimationClipRegistry, validateAnimationClipMap, validateAnimationStudioClipMap } from "./AnimationClipRegistry.js";
export type { AnimationClipDefinition, AnimationClipId, AnimationClipManifest, AnimationClipRegistryDiagnostic, AnimationClipRegistryDiagnosticSeverity, AnimationClipRegistryOptions, AnimationClipSampleContext, AnimationClipSampler, AnimationKeyframe, AnimationTrack as AnimationClipTrack, AnimationTrackTarget, AnimationClipMapReadiness, AnimationClipMapReadinessOptions, RegisteredAnimationClip } from "./AnimationClipRegistry.js";
export * from "./AnimationController.js";
export * from "./HumanoidRetargeting.js";
export * from "./HumanoidBoneInference.js";
export * from "./RigQuality.js";
export * from "./library/standardHumanoidClips.js";
export * from "./library/performanceStateGraph.js";
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

- Version: `4.6.1`
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

- Version: `4.6.1`
- Package manifest: `packages/asset-index/package.json`
- Public entrypoint: `packages/asset-index/src/index.ts`

### Export Declarations

```ts
export type { AuraCanonicalAsset, AuraAssetLicense, AuraAssetLicenseSpdx, AuraAssetFormat, AuraAssetAccess, AuraAssetBounds, AuraAssetIntendedRole, } from "./CanonicalAsset.js";
export { isAutoPullable, normalizeLicense } from "./CanonicalAsset.js";
export type { SourceAdapter, AdapterContext, AdapterRefreshResult, FetchJson, ResolveQuery, ResolveConstraints, } from "./SourceAdapter.js";
export { defaultFetchJson } from "./SourceAdapter.js";
export { scoreAsset, matchesConstraints, SCREENED_HERO_RANK_BONUS } from "./ranking.js";
export { evaluateGameAssetProfile, gameAssetProfileDefinitions, getGameAssetProfileDefinition } from "./game-profile.js";
export type { GameAssetProfile, GameAssetProfileDefinition, GameAssetProfileEvaluation, GameAssetProfileScoringRules } from "./game-profile.js";
export { animationAssetProfiles, evaluateAnimationAssetProfile, isAnimationAssetProfile, } from "./animation-profile.js";
export type { AnimationAssetCategory, AnimationAssetProfile, AnimationAssetProfileEvaluation, } from "./animation-profile.js";
export { animationStarterPack, animationStarterPackAssets, animationStarterPackSummary, createAnimationStarterPackAdapter, } from "./animation-starter-pack.js";
export type { AnimationStarterPackEntry, AnimationStarterPackKind, AnimationStarterPackRole, } from "./animation-starter-pack.js";
export type { ResolveCandidate, ResolveResult, FederatedResolverOptions, } from "./federate.js";
export { FederatedResolver } from "./federate.js";
export { createKhronosAdapter } from "./adapters/khronos.js";
export { createOS3AAdapter } from "./adapters/os3a.js";
export { createPolyHavenAdapter } from "./adapters/poly-haven.js";
export { createAmbientCgAdapter } from "./adapters/ambientcg.js";
export { createAuraLibraryAdapter } from "./adapters/aura-library.js";
export type { AuraLibraryAdapterOptions, AuraLibraryEntryShape, AuraLibraryManifestShape } from "./adapters/aura-library.js";
export { createPolyPizzaAdapter } from "./adapters/poly-pizza.js";
export type { PolyPizzaAdapterOptions } from "./adapters/poly-pizza.js";
export { createSketchfabAdapter } from "./adapters/sketchfab.js";
export type { SketchfabAdapterOptions } from "./adapters/sketchfab.js";
export { createMarketplaceDeepLinkAdapter } from "./adapters/marketplace.js";
export { createJsDelivrMirrorAdapter } from "./adapters/jsdelivr-mirror.js";
export type { JsDelivrMirrorOptions } from "./adapters/jsdelivr-mirror.js";
export { LocalHashEmbedding, cosineSimilarity, assetEmbeddingText, embeddingRanker, DEFAULT_EMBEDDING_DIMS, } from "./embedding.js";
export type { EmbeddingProvider } from "./embedding.js";
export function defaultAdapters(): SourceAdapter[] { return [ createAnimationStarterPackAdapter(), createKhronosAdapter(), createOS3AAdapter(), createPolyHavenAdapter(), createAmbientCgAdapter(), createJsDelivrMirrorAdapter(), ];
```

## @aura3d/assets

- Version: `4.6.1`
- Package manifest: `packages/assets/package.json`
- Public entrypoint: `packages/assets/src/index.ts`

### Export Declarations

```ts
export { AssetCache } from "./AssetCache";
export type { AssetCacheSnapshot } from "./AssetCache";
export { AssetDependencyGraph } from "./AssetDependencyGraph";
export { inspectGLTFAsset } from "./AssetInspection";
export type { GLTFAnimationInspection, GLTFAssetInspectionReport, GLTFDependencyInspection, GLTFMaterialInspection, GLTFMaterialTextureSlotInspection, GLTFMeshInspection, GLTFMorphTargetInspection, GLTFSceneHierarchyNodeInspection, GLTFSkinInspection, GLTFTextureInspection } from "./AssetInspection";
export { GLTF_DECODER_REQUIRED_EXTENSION_NAMES, GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES, GLTF_EXTENSION_SUPPORT_MATRIX, GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES, GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES, GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES, GLTF_SUPPORTED_EXTENSION_NAMES, evaluateGLTFExtensionSupport, getGLTFExtensionSupport } from "./GLTFExtensionSupport";
export type { GLTFExtensionSupportEntry, GLTFExtensionSupportEvaluation, GLTFExtensionSupportFamily, GLTFExtensionSupportStatus } from "./GLTFExtensionSupport";
export { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime, GLTFImportedSkeletonIKController, GLTFSceneAnimationCloneSampler, GLTFSceneAnimationMixerBinding, GLTFSceneAnimationRuntime, GLTFSceneMorphTargetController, resolveGLTFClipName } from "./GLTFAnimationRuntime";
export type { GLTFImportedSkeletonIKControllerOptions, GLTFImportedSkeletonIKControllerSnapshot, GLTFImportedSkeletonIKOptions, GLTFImportedSkeletonIKResult, GLTFSceneAnimationApplyResult, GLTFSceneAnimationClipSample, GLTFSceneAnimationClipBoneMask, GLTFSceneAnimationActionSnapshot, GLTFSceneAnimationCloneSample, GLTFSceneAnimationCloneSampleResult, GLTFSceneAnimationCloneSamplerSnapshot, GLTFSceneAnimationClipBindingDiagnostics, GLTFootPlantingApplyResult, GLTFootPlantingConfig, GLTFootPlantingLegConfig, GLTFSceneAnimationMaterialSink, GLTFSceneAnimationMixerOptions, GLTFSceneAnimationPlayOptions, GLTFSceneAnimationMixerSnapshot, GLTFSceneAnimationMixerUpdateResult, GLTFSceneAnimationRuntimeOptions, GLTFSceneAnimationRuntimeSnapshot, GLTFSceneMorphTargetControllerOptions, GLTFSceneMorphTargetControllerSnapshot, GLTFScenePose, GLTFScenePoseBoneTransform } from "./GLTFAnimationRuntime";
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
export { fetchGltfBytesShared, GLTFLoader, normalizeSkinWeights, parseGlbDocument, parseMaterialVariantSelection, resolveAnimationPointerBinding, serializeMaterialVariantSelection } from "./GLTFLoader";
export type { GLBDocumentInspection } from "./GLTFLoader";
export { autoFitGLTFScene, computeAutoFitTransform } from "./GLTFAutoFit";
export type { AutoFitOptions, AutoFitTransform, GLTFUpAxis } from "./GLTFAutoFit";
export type { GLTFAsset, GLTFAnimationPointerBinding, GLTFCameraAsset, GLTFClearcoatMaterialExtension, GLTFDracoDecodeDescriptor, GLTFDracoDecodedPrimitive, GLTFDracoDecoder, GLTFGeometryAsset, GLTFImageAsset, GLTFLightAsset, GLTFJson, GLTFLoaderOptions, GLTFLoaderDiagnostics, GLTFMaterialVariantSceneState, SkinWeightNormalizationStats, GLTFMaterialAsset, GLTFMaterialVariantAsset, GLTFMaterialVariantMappingAsset, GLTFMeshAsset, GLTFMeshoptDecodeDescriptor, GLTFMeshoptDecoder, GLTFPBRSpecularGlossinessMaterialExtension, GLTFResolvedTextureInfo, GLTFSamplerAsset, GLTFSceneAsset, GLTFSceneCreateOptions, GLTFSheenMaterialExtension, GLTFSkinAsset, GLTFSpecularMaterialExtension, GLTFTextureAsset, GLTFTransmissionMaterialExtension, GLTFVolumeMaterialExtension, SerializedGLTFAsset } from "./GLTFLoader";
export { OBJLoader } from "./OBJLoader";
export { DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING, DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS, DEFAULT_GLTF_STUDIO_PREVIEW_FRAME, DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING, DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS, createDefaultGLTFHdrStudioPreviewEnvironmentLighting, createGLTFRenderResourceDiagnostics, createGLTFRenderResources, createGLTFRenderSource, renderStateForGLTFMaterial } from "./GLTFRenderResources";
export type { DecodedGLTFImage, GLTFImageDecoder, GLTFMaterialRenderStateOverride, GLTFMaterialOverrideQuery, GLTFMaterialOverrideTarget, GLTFRenderableBinding, GLTFRenderResourceDiagnostics, GLTFRenderResourceDiagnosticsOptions, GLTFRenderResourceTextureSlotDiagnostic, GLTFRenderQualityPreset, GLTFRendererInput, GLTFRendererInputOptions, GLTFRenderResourceOptions, GLTFRenderSourceOptions, GLTFRenderResources } from "./GLTFRenderResources";
export { createAssetRenderDefaults, DEFAULT_ASSET_RENDER_VIEWPORT } from "./AssetRenderDefaults";
export type { AssetRenderDefaults, AssetRenderLightingPreset } from "./AssetRenderDefaults";
export { loadRenderableAsset } from "./loadRenderableAsset";
export type { LoadRenderableAssetOptions, RenderableAsset, RenderableAssetKind } from "./loadRenderableAsset";
export { createRenderableScene } from "./createRenderableScene";
export type { CreateRenderableSceneOptions, RenderableScene } from "./createRenderableScene";
export { ensureCompressedTextureSupport, transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder";
export type { CompressedTextureDecoderProbes, CompressedTextureDecoderStatus, CompressedTextureSupportDiagnostics, CompressedTextureSupportRequest, KTX2BasisTargetFormat, KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";
export { selectKTX2TargetFormat } from "./KTX2TargetSelection";
export { AssetDecoderUnavailable, createAssetDecoderRegistry, probeKTX2Header } from "./AssetDecoderRegistry";
export type { AssetDecoderId, AssetDecoderRegistry, AssetDecoderRegistryDiagnostics, AssetDecoderRegistryOptions, AuraAssetDecoderSet } from "./AssetDecoderRegistry";
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
export { createTextureMipGenerationStage, generateTextureMipChain, resolveAnisotropyRequest } from "./TexturePipeline";
export type { AnisotropyRequest, AnisotropyResolution, TextureMipGenerationInput, TextureMipGenerationResult, TextureMipGenerationStageOptions, TextureMipLevel } from "./TexturePipeline";
export { TextureLoader } from "./TextureLoader";
export type { TextureDescriptorAsset } from "./TextureLoader";
export { FileLoader } from "./FileLoader";
export type { FileLoaderResponseType } from "./FileLoader";
export { ImageBitmapLoader } from "./ImageBitmapLoader";
export type { ImageBitmapLoaderOptions } from "./ImageBitmapLoader";
export { DataTextureLoader } from "./DataTextureLoader";
export { EXRLoader, EXRLoaderThreeCompat, parseEXR } from "./EXRLoader";
export type { AuraEXRDataType, AuraEXROutputFormat, AuraEXRParseOptions, AuraEXRTextureData } from "./EXRLoader";
export { fetchBytes } from "./LoaderFetch";
export type { AuraLoaderProgress } from "./LoaderFetch";
export { WorkerAssetJobs } from "./WorkerAssetJobs";
export type { WorkerAssetJob, WorkerAssetJobRunner } from "./WorkerAssetJobs";
export * from "./HDRLoader.js";
export * from "./TextureStreaming.js";
export { GLTFSharedTextureCache } from "./GLTFSharedTextureCache.js";
export type { GLTFSharedTextureLease } from "./GLTFSharedTextureCache.js";
```

## @aura3d/assets/gltf-runtime

- Version: `4.6.1`
- Package manifest: `packages/assets/package.json`
- Public entrypoint: `packages/assets/src/gltf-runtime.ts`

### Export Declarations

```ts
export { createGLTFSceneAnimationRuntime } from "./GLTFAnimationRuntime.js";
export type { AddClipsFromRuntimeOptions, GLTFootPlantingApplyResult, GLTFootPlantingConfig, GLTFootPlantingLegConfig, GLTFSceneAnimationApplyResult, GLTFSceneAnimationMaterialSink, GLTFPoseConstraint, GLTFSceneAnimationRuntime, GLTFSceneAnimationRuntimeOptions, GLTFSceneAnimationRuntimeSnapshot, GLTFScenePose } from "./GLTFAnimationRuntime.js";
export { loadProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
export type { ProductionGLTFRenderPipeline } from "./asset-corpus/ProductionGLTFRenderPipeline.js";
export { GLTFSharedTextureCache } from "./GLTFSharedTextureCache.js";
export type { GLTFSharedTextureLease } from "./GLTFSharedTextureCache.js";
```

## @aura3d/audio

- Version: `4.6.1`
- Package manifest: `packages/audio/package.json`
- Public entrypoint: `packages/audio/src/index.ts`

### Export Declarations

```ts
export { AudioBus } from "./AudioBus";
export { AudioClip } from "./AudioClip";
export type { AudioClipOptions } from "./AudioClip";
export { AudioFileManager, validateEpisodeAudioAssets } from "./AudioFileManager";
export type { AudioDecodeContextLike, EpisodeAudioAssetDiagnostic, EpisodeAudioAssetReadiness, EpisodeAudioAssetRequirement, AudioFileAssetLike, AudioFileFetchResponseLike, AudioFileInput, AudioFileManagerOptions, AudioCodecCandidate, AudioFileRequest, ResolvedAudioFileRequest } from "./AudioFileManager";
export { createAudioTimelineMixSnapshot, defaultAudioTimelineBusForRole, validateAudioCaptionSync, AudioTimelineTrack } from "./AudioTimelineTrack";
export type { AudioCaptionCue, AudioCaptionSyncIssue, AudioCaptionSyncReport, AudioTimelineBusMix, AudioTimelineClip, AudioTimelineClipOptions, AudioTimelineEnvelopePoint, AudioTimelineMixOptions, AudioTimelineMixSnapshot, AudioTimelineSample, AudioTimelineTrackOptions, AudioTimelineTrackRole } from "./AudioTimelineTrack";
export { audioWaveformPeakRange, createAudioWaveform, createAudioWaveformPath, createAudioWaveformReviewData, sampleAudioWaveformAtTime } from "./AudioWaveform";
export type { AudioWaveformData, AudioWaveformInput, AudioWaveformOptions, AudioWaveformPathOptions, AudioWaveformPathPoint, AudioWaveformPeak, AudioWaveformReviewData, AudioWaveformReviewStem, AudioWaveformReviewStemView } from "./AudioWaveform";
export { AudioContextManager } from "./AudioContextManager";
export type { AudioContextLike, AudioContextManagerOptions, AudioContextState } from "./AudioContextManager";
export type { AudioEffect } from "./AudioEffect";
export { AudioListener } from "./AudioListener";
export type { AudioListenerOptions, Vec3Like } from "./AudioListener";
export { AudioAnalyser, createAudioAnalyser } from "./AudioAnalyser";
export type { AudioAnalyserOptions } from "./AudioAnalyser";
export { AudioMixer, createAudioMixerEvidence, createAnimationAudioMixer } from "./AudioMixer";
export type { AudioMixerBusEvidence, AudioMixerEvidence, AnimationAudioMixer, AnimationAudioMixerOptions } from "./AudioMixer";
export { AudioSource } from "./AudioSource";
export type { AudioSourceOptions, AudioSourceState } from "./AudioSource";
export { PositionalEmitter, applyOcclusionToGain, computeConeGain, computeDistanceAttenuation, computeDopplerShift, occlusionLowpassFrequency, resolveOcclusion } from "./PositionalEmitter";
export type { ConeOptions, DistanceAttenuationModel, DistanceAttenuationOptions, DopplerOptions, OcclusionHook, PositionalEmitterEvidence, PositionalEmitterOptions } from "./PositionalEmitter";
export { attachFocusPolicy, createGameMixer, focusHandlersForMixer } from "./GameMixer";
export type { FocusEventTargetLike, FocusMutePolicy, FocusPolicyHandlers, GameMixer, GameMixerBusLevel, GameMixerEvidence, GameMixerOptions } from "./GameMixer";
export { FootstepPlayer } from "./Footsteps";
export type { FootId, FootPlantEvent, FootstepEvidence, FootstepPlayerOptions } from "./Footsteps";
export { AudioSystem } from "./AudioSystem";
export { SceneAudioBridge } from "./SceneAudioBridge";
export type { SceneAudioSourceBinding } from "./SceneAudioBridge";
export { SpatialAudio } from "./SpatialAudio";
export type { SpatialAudioOptions } from "./SpatialAudio";
export { FilterEffect } from "./effects/Filter";
export { ReverbEffect } from "./effects/Reverb";
export { createGameSoundEngine } from "./game-sound/GameSoundEngine";
export { createGameSoundEngine as createStubGameSoundEngine } from "./contracts/gameSound";
export type { GameSoundOptions, SoundCueSpec, AudioAssetRef, EngineLoopSpec, GameBusId } from "./game-sound/GameSoundEngine";
export type { SoundGraphContext } from "./game-sound/types";
export { createMasterChain, safetyClipCurve } from "./game-sound/MasterChain";
export { createSpatialNode, occlusionHz } from "./game-sound/SpatialVoice";
export { createEngineLoop, gainsForRpm } from "./game-sound/EngineLoop";
export { MusicControllerImpl } from "./game-sound/MusicController";
export { createReverbSend, IR_BUDGET_SECONDS, PRESET_IR_SECONDS } from "./game-sound/ReverbSend";
export { probeFormat, formatExtension } from "./game-sound/formatProbe";
export { measureLoudness, gainForTarget, MASTERING_TARGETS } from "./game-sound/loudness";
export type { LoudnessInput, LoudnessMeasurement, SfxMasteringClass } from "./game-sound/loudness";
export { VoicePool } from "./game-sound/Voice";
export type { VoiceCueSpec, VoiceRecord, VoicePriority } from "./game-sound/Voice";
export { syncListener } from "./game-sound/listenerSync";
export type { ListenerLike } from "./game-sound/listenerSync";
export * from "./synth";
```

## @aura3d/cli

- Version: `4.6.1`
- Package manifest: `packages/aura3d-cli/package.json`
- Public entrypoint: `packages/aura3d-cli/src/index.ts`

### Export Declarations

```ts
export { animationCliAssetProfiles, getAnimationAssetProfileDefinition } from "./animation-asset-profiles.js";
export { validateAnimationAssets, parseAnimationClipMap, DEFAULT_ANIMATION_ACTIONS } from "./animation-asset-validator.js";
export { analyzeSkin, DEFAULT_SKIN_THRESHOLDS, findHumanoidLegs, SKIN_BIND_MISMATCH, SKIN_FLAP, SKIN_JOINT_RANGE, SKIN_STRETCH, SKIN_WEIGHT_DISTANT, SKIN_WEIGHT_SUM } from "./skin/analysis.js";
export type { SkinAnalysisOptions, SkinCode, SkinFinding, SkinReport, SkinThresholds } from "./skin/analysis.js";
export { repairSkin } from "./skin/repair.js";
export type { RepairSkinOptions, RepairSkinReport } from "./skin/repair.js";
export { rebuildLimbs, RebuildLimbsUnsupported } from "./skin/rebuildLimbs.js";
export type { RebuildLimbsOptions, RebuildLimbsReport } from "./skin/rebuildLimbs.js";
export { refitSkeleton, RefitUnsupported } from "./skin/refitSkeleton.js";
export type { RefitSkeletonOptions, RefitSkeletonReport } from "./skin/refitSkeleton.js";
export { checkProjectSkins, checkAssetSkin, readSkinAllowlist, SKIN_ALLOW_FILE } from "./skin/command.js";
export { parseGlb, readGlbFile, writeGlbFile } from "./skin/gltf.js";
export type { AnimationAssetValidationOptions, AnimationAssetValidationReport } from "./animation-asset-validator.js";
export type { AuraCliAnimationAssetProfile, AuraCliAnimationAssetProfileDefinition } from "./animation-asset-profiles.js";
export { formatScreeningReport, screenAssetCandidates } from "./asset-screening-pipeline.js";
export { createRetainedRenderProbe, createScreeningEffects, hashStagedFile, inspectGlbGeometry } from "./asset-screening-effects.js";
export type { ScreeningEffectsOptions } from "./asset-screening-effects.js";
export type { ScreeningCandidate, ScreeningCandidateOutcome, ScreeningEffects, ScreeningOptions, ScreeningPullResult, ScreeningRenderCost, ScreeningReport, ScreeningStage } from "./asset-screening-pipeline.js";
export { admissionRequirementForIntent, licensesForPolicy, licenseSatisfiesPolicy, searchQueriesForIntent, validateAssetIntent, MIN_INTENT_HERO_AZIMUTHS } from "./asset-intent.js";
export type { AssetCameraExpectation, AssetGeometryBudget, AssetIntent, FallbackPolicy, LicensePolicy, NormalizationPolicy, OrientationRequirement, RequiredVisibleFeature } from "./asset-intent.js";
export { admitAssetForRole, rankAssetCandidatesForRole, HERO_MIN_RENDERED_AZIMUTHS, HERO_MIN_TRIANGLES, MIN_VEHICLE_WHEEL_CORNERS } from "./asset-role-admission.js";
export type { AssetAdmissionCheck, AssetAdmissionInput, AssetAdmissionReport, AssetAdmissionRole, AssetAdmissionVerdict, AssetGeometryFacts, AssetProvenanceFacts, AssetRenderedFacts, AssetRoleRequirement } from "./asset-role-admission.js";
export { DEFAULT_AURA_ASSET_MANIFEST, DEFAULT_AURA_ASSET_OUTPUT_DIR, DEFAULT_AURA_ASSET_PUBLIC_PATH, DEFAULT_AURA_ASSET_TYPEGEN } from "./asset-constants.js";
export { listAssets, readAssetManifest, writeAssetManifest, writeTypedAssets } from "./asset-manifest.js";
export type { AddAssetOptions, AssetCliResult, AssetSourceTypedAssetUsage, AssetSourceValidationReport, AssetValidationOptions, AssetValidationResult, AuraAssetQuality, AuraCliAssetEntry, AuraCliAssetManifest, AuraCliAssetProvenance, AuraCliAudioMetadata, AuraCliGeneratedAssetProvenance, AuraCliAssetRole, AuraCliAssetType, AuraCliRenderedProbe, AuraCliRenderedProbeForegroundBounds, AuraCliRenderedProbeKind, AuraCliResolveCandidateProvenance, BindGameRouteEvidenceOptions, BindGameRouteEvidenceResult, CertifyGameGeometryOptions, CheckDeployOptions, GameGeometryCertificationResult, ReadRenderedProbeMetadataOptions } from "./asset-core-types.js";
export { importMeshyAsset } from "./meshy/import.js";
export { createMeshyAdmissionReport, inferMeshyAssetProfile, inspectMeshyTextureDimensions } from "./meshy/admission.js";
export type { MeshyAdmissionCheck, MeshyAdmissionReport, MeshyAdmissionVerdict, MeshyAssetProfile } from "./meshy/admission.js";
export type { ImportMeshyOptions, ImportMeshyResult } from "./meshy/import.js";
export type { AssetInspectionReport, AuraCliAnimationClipInspection, AuraCliAnimationInspection, AuraCliAssetBoundsInspection, AuraCliHumanoidConfidence, AuraCliHumanoidInspection, AuraCliHumanoidStatus, AuraCliMaterialInspection, AuraCliMorphTargetInspection, AuraCliMorphTargetMeshInspection, AuraCliOrientationInspection, AuraCliSceneHierarchyInspection, AuraCliSkeletonInspection, AuraCliSkeletonSkinInspection, InspectAssetOptions } from "./asset-inspection-types.js";
export type { AnimationEpisodeAssetReadiness, AnimationEpisodeAssetRole, AnimationEpisodeMouthReadinessMode, AnimationEpisodeReadinessReport, AssetReadinessAnimationClipMetadata, AssetReadinessAnimationMetadata, AssetReadinessAssetArtifacts, AssetReadinessAssetReport, AssetReadinessArtifacts, AssetReadinessOptions, AssetReadinessReport, AssetReadinessValidationContract, AssetReadinessValidatorEvidence, AuraAssetReadinessProfile, AuraAssetReadinessStatus, AuraGameAssetReadinessProfile } from "./asset-readiness-types.js";
export type { CharacterAssemblyPartInput, CharacterAssemblyPlanOptions, CharacterAssemblyPlanResult, CharacterAssemblyResolvedPart } from "./character-assembly-types.js";
export function readRenderedProbeMetadata(options: ReadRenderedProbeMetadataOptions): AuraCliRenderedProbe { const projectDir = resolve(options.projectDir ?? process.cwd());
export function addAsset(options: AddAssetOptions): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function bindGameRouteEvidence(options: BindGameRouteEvidenceOptions): BindGameRouteEvidenceResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export async function certifyGameGeometry(options: CertifyGameGeometryOptions): Promise<GameGeometryCertificationResult> { const { probeShowcaseGameGeometry } = await import("create-aura3d");
export function scanAssets(options: { readonly projectDir?: string; readonly directory: string }): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function inspectAsset(options: InspectAssetOptions): AssetInspectionReport { const projectDir = resolve(options.projectDir ?? process.cwd());
export function validateAssets(options: AssetValidationOptions = {}): AssetValidationResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function createAssetThumbnails(options: { readonly projectDir?: string } = {}): AssetCliResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function doctor(options: { readonly projectDir?: string } = {}): AssetValidationResult { const validation = validateAssets(options);
export function checkDeploy(options: CheckDeployOptions = {}): AssetValidationResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function validateGameAssets(options: AssetReadinessOptions = {}): AssetReadinessReport { return validateAssetReadiness("game", options);
export function validateAnimationStudioAssets(options: AssetReadinessOptions = {}): AssetReadinessReport { return validateAssetReadiness("animation", options);
export function createCharacterAssemblyPlan(options: CharacterAssemblyPlanOptions): CharacterAssemblyPlanResult { const projectDir = resolve(options.projectDir ?? process.cwd());
export function initAgentFiles(options: { readonly projectDir?: string;
export function initAgentSetup(options: { readonly projectDir?: string;
export function deadAssetUrlWarnings(distRoot: string, distLabel = "dist"): string[] { if (!existsSync(distRoot)) return [];
```

## @aura3d/controls

- Version: `4.6.1`
- Package manifest: `packages/controls/package.json`
- Public entrypoint: `packages/controls/src/index.ts`

### Export Declarations

```ts
export { OrbitControls } from "./OrbitControls";
export type { OrbitCameraLike, OrbitControlsOptions } from "./OrbitControls";
export { ArcballControls } from "./ArcballControls";
export type { ArcballCameraLike, ArcballControlsOptions } from "./ArcballControls";
export { TrackballControls } from "./TrackballControls";
export { FlyControls } from "./FlyControls";
export type { FlyCameraLike, FlyControlsOptions } from "./FlyControls";
export { FirstPersonControls } from "./FirstPersonControls";
export type { FirstPersonControlsOptions } from "./FirstPersonControls";
export { MapControls } from "./MapControls";
export { PointerLockControls } from "./PointerLockControls";
export { DRAG_CONTROLS_DEPRECATION, DragControls } from "./DragControls";
export type { DragControlsDeprecation, DragControlsOptions } from "./DragControls";
export { TransformControls } from "./TransformControls";
export type { TransformControlDragUpdate, TransformControlHandle, TransformControlHandleGeometry, TransformControlMode, TransformControlPick, TransformControlRay, TransformControlSnapSettings, TransformControlSpace, TransformControlsOptions } from "./TransformControls";
export { SelectionManager } from "./SelectionManager";
export type { SelectionManagerChange, SelectionManagerListener } from "./SelectionManager";
export { HoverOutline } from "./HoverOutline";
export type { HoverOutlineEntry, HoverOutlineOptions, HoverOutlineStyle, HoverOutlineTone } from "./HoverOutline";
export { frameSelection, frameTarget } from "./FocusFrame";
export type { FocusFrameOptions, FocusFrameResult, FocusFrameTarget } from "./FocusFrame";
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
export { CameraRig } from "./engine/CameraRig";
export type { CameraRigState } from "./engine/CameraRig";
export { clamp } from "./engine/ControlTypes";
export type { CameraTransformLike, EulerLike, Vec3Like } from "./engine/ControlTypes";
export { EditorFlyControls } from "./engine/EditorFlyControls";
export type { EditorFlyControlsOptions } from "./engine/EditorFlyControls";
export { createSceneCameraControlAdapter } from "./engine/SceneCameraAdapter";
export type { SceneCameraControlAdapter } from "./engine/SceneCameraAdapter";
export { ThirdPersonFollowControls } from "./engine/ThirdPersonFollowControls";
export type { ThirdPersonFollowControlsOptions } from "./engine/ThirdPersonFollowControls";
export { DEFAULT_ORBIT_MAX_POLAR } from "./engine/OrbitControls";
export { OrbitControls as OrbitControlsEngine } from "./engine/OrbitControls";
export type { OrbitCameraTransformLike } from "./engine/OrbitControls";
export { FirstPersonControls as FirstPersonControlsEngine } from "./engine/FirstPersonControls";
export { PointerLockControls as PointerLockControlsEngine } from "./engine/PointerLockControls";
```

## @aura3d/core

- Version: `4.6.1`
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

- Version: `4.6.1`
- Package manifest: `packages/create-aura3d/package.json`
- Public entrypoint: `packages/create-aura3d/src/index.ts`

### Export Declarations

```ts
export const CREATE_AURA3D_TEMPLATES = [
export type CreateA3DTemplate = (typeof CREATE_AURA3D_TEMPLATES)[number];
export const TEMPLATE_ALIASES = Object.freeze({ "three-compat-premium-product-viewer": "premium-product-viewer", "three-compat-architecture-interior": "architecture-interior", "three-compat-material-authoring": "material-authoring", "three-compat-asset-inspector": "asset-inspector", "three-compat-character-viewer": "character-viewer", "three-compat-postprocess-scene": "postprocess-scene", "three-compat-custom-threejs-migration": "custom-scene", "three-compat-large-scene": "large-scene" } as const satisfies Record<string, CreateA3DTemplate>);
export type CreateA3DTemplateAlias = keyof typeof TEMPLATE_ALIASES;
export interface ResolvedTemplateName { readonly template: CreateA3DTemplate;
export function resolveTemplateAlias(name: string): ResolvedTemplateName | null { if ((CREATE_AURA3D_TEMPLATES as readonly string[]).includes(name)) { return { template: name as CreateA3DTemplate, deprecated: null };
export function templateAliasWarning(resolved: ResolvedTemplateName): string | null { if (!resolved.deprecated) return null;
export interface CreateA3DProjectOptions { readonly targetDir: string;
export interface CreateA3DProjectResult { readonly targetDir: string;
export function createA3DProject(options: CreateA3DProjectOptions): CreateA3DProjectResult { const template = options.template ?? "product-viewer";
export async function fetchMissingTemplateAssets( result: CreateA3DProjectResult, options: { readonly version: string } & Pick<FetchTemplateAssetsOptions, "bases" | "fetch" | "log"> ): Promise<FetchTemplateAssetsResult> { return fetchTemplateAssets({ projectDir: result.targetDir, template: result.template, entries: result.missingAssets, ...options });
export function writeCreateA3DReport(path: string, result: CreateA3DProjectResult): void { mkdirSync(dirname(resolve(path)), { recursive: true });
export { probeShowcaseGameGeometry, type ShowcaseGameGeometryCategory, type ShowcaseGameGeometryProbeResult } from "./showcase-spec-game-geometry-probe.js";
export type { ExtractOptions as ShowcaseGameGeometryExtractOptions, GeometryExtractionFailure as ShowcaseGameGeometryExtractionFailure, GeometryExtractionResult as ShowcaseGameGeometryExtractionResult, GeometryExtractionSuccess as ShowcaseGameGeometryExtractionSuccess } from "./showcase-spec-game-geometry-extractor.js";
export type { ShowcasePlatformerPlayableSurfaceMap, ShowcaseRacingTrackTopology } from "./showcase-spec-types.js";
export { SHOWCASE_ASSET_PAIR_COMPOSITION_THRESHOLDS, validateShowcaseAssetPairComposition, validateShowcaseAssetPairCompositionFromDisk, type ShowcaseAssetPairCompositionCategory, type ShowcaseAssetPairCompositionCheck, type ShowcaseAssetPairCompositionInput, type ShowcaseAssetPairCompositionReport, type ValidateShowcaseAssetPairCompositionFromDiskOptions } from "./showcase-spec-asset-pair-composition.js";
export { DEFAULT_TEMPLATE_ASSET_BASES, TEMPLATE_ASSET_MANIFEST, buildTemplateAssetManifest, fetchTemplateAssets, missingTemplateAssets, readTemplateAssetManifest, templateAssetBases, type FetchTemplateAssetsOptions, type FetchTemplateAssetsResult, type TemplateAssetEntry, type TemplateAssetManifest } from "./template-assets.js";
export { AURA_AGENT_CLIENTS, AURA_SKILLS_LEDGER, findBundledSkillsDir, readSkillsManifest, selectSkills, writeAgentSkills, type AuraAgentClient, type AuraAgentTarget, type AuraSkillMode, type AuraSkillsManifest, type WriteAgentSkillsOptions, type WriteAgentSkillsResult } from "./agent-skills.js";
```

## @aura3d/debug

- Version: `4.6.1`
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
export { DEFAULT_HEAL_LADDER, DEFAULT_HEAL_STORAGE_KEY, QR_HEAL_LADDER, createBlackFrameWatch, createFrameErrorBoundary, formatEngineSection, formatGpuProbe, healParams, healRungName, healStage, installBlackFrameGuard, installDiagnosticsPanel, installFrameTap, installSafetyNet, isBlackFrame, probeGpu, qrHealRungName, qrHealStage, qrHealUrl, resolveQualitySwitches } from "./safety/index.js";
export type { BlackFrameGuardOptions, BlackFrameWatch, BlackFrameWatchOptions, DiagnosticsAppLike, DiagnosticsPanelHandle, DiagnosticsPanelOptions, FrameErrorBoundary, FrameErrorBoundaryOptions, FrameErrorInfo, FrameErrorStats, FrameTap, FrameTapOptions, GpuProbe, HealGlobal, HealRung, QualitySwitches, ResolveQualitySwitchesOptions, SafetyNet, SafetyNetOptions, SafetyReport, SafetySettings } from "./safety/index.js";
```

## @aura3d/ecs

- Version: `4.6.1`
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
export * from "./components/WorldTransformComponent.js";
export * from "./components/CameraComponent.js";
export * from "./components/LightComponent.js";
export * from "./components/MeshComponent.js";
export * from "./components/NameComponent.js";
export * from "./components/TagComponent.js";
export * from "./components/ActiveComponent.js";
export * from "./components/HierarchyComponent.js";
export * from "./systems/index.js";
```

## @aura3d/editor-runtime

- Version: `4.6.1`
- Package manifest: `packages/editor-runtime/package.json`
- Public entrypoint: `packages/editor-runtime/src/index.ts`

### Export Declarations

```ts
export type { Command, CommandContext } from "./Command";
export { CommandHistory, CommandTransactionError } from "./CommandHistory";
export { AssetDropZone, readAssetFromDataTransfer, serializeAssetForDrag } from "./AssetDropZone";
export type { AssetDropPlacement, AssetDropResult, AssetDropZoneOptions, AnimationAssetCategory, AnimationEditorAssetReference } from "./AssetDropZone";
export { CameraPathEditor, createCameraPathEditor, readCameraPathKeyframes } from "./CameraPathEditor";
export type { EditorCameraPathEvidence, EditorCameraPathKeyframe, EditorCameraPathSample, EditorCameraVector3 } from "./CameraPathEditor";
export { AnimationSceneEditor, createAnimationSceneNode } from "./AnimationSceneEditor";
export type { AnimationSceneEditorOptions, AnimationSceneEditorSnapshot, AnimationSceneEpisodeSnapshot, AnimationSceneEpisodeState, AnimationSceneNode, AnimationSceneTransform } from "./AnimationSceneEditor";
export { CurveEditor } from "./CurveEditor";
export type { TimelineCurveEvidence, TimelineCurvePoint, TimelineCurveSample } from "./CurveEditor";
export { DiagnosticsOverlayModel } from "./DiagnosticsOverlayModel";
export type { EditorDiagnosticsInput, EditorDiagnosticsResource, EditorDiagnosticsSnapshot } from "./DiagnosticsOverlayModel";
export { EditorRuntime } from "./EditorRuntime";
export type { EditorMode, EditorRuntimeSnapshot } from "./EditorRuntime";
export { EventTrackEditor, createEventTrackEditor } from "./EventTrackEditor";
export type { AddEventMarkerOptions, EventMarkerView, EventTrackEditorOptions, EventTrackLane } from "./EventTrackEditor";
export { EpisodeReviewPanel, createEpisodeReviewPanel } from "./EpisodeReviewPanel";
export type { EpisodeReviewManualVisemeEdit, EpisodeReviewNote, EpisodeReviewPanelSnapshot, EpisodeReviewPanelState, EpisodeReviewRejectedFrame, EpisodeReviewStatus, EpisodeReviewWaveformLane } from "./EpisodeReviewPanel";
export { EditorStateModel, createMemoryEditorStateStorage } from "./EditorStateModel";
export type { EditorGridSnapSettings, EditorStateChange, EditorStateSnapshot, EditorStateStorage, EditorViewportSettings } from "./EditorStateModel";
export { EditorPluginHost } from "./EditorPluginHost";
export type { EditorImporterContribution, EditorPanelContribution, EditorPlugin, EditorPluginSnapshot, EditorScriptingNodeContribution, EditorToolContribution } from "./EditorPluginHost";
export { Gizmo } from "./Gizmo";
export { DEFAULT_GIZMO_SETTINGS, normalizeGizmoSettings } from "./Gizmo";
export type { GizmoAxis, GizmoDrag, GizmoHandle, GizmoHit, GizmoPivotMode, GizmoPlaneAxis, GizmoSettings, GizmoSpaceMode } from "./Gizmo";
export { InteractiveTransformGizmo } from "./InteractiveTransformGizmo";
export type { GizmoDragUpdate, GizmoHandleGeometry, GizmoPickResult, InteractiveGizmoMode, InteractiveGizmoState, InteractiveTransformGizmoOptions } from "./InteractiveTransformGizmo";
export { HierarchyModel } from "./HierarchyModel";
export type { HierarchyLikeNode, HierarchyNodeDescriptor } from "./HierarchyModel";
export { InspectorModel } from "./InspectorModel";
export type { InspectorEditableValue, InspectorProperty } from "./InspectorModel";
export { KeyframeEditor, encodeTimelineKeyframes, readTimelineKeyframes, timelineKeyframesByProperty } from "./KeyframeEditor";
export type { CreateTimelineKeyframeOptions, PasteTimelineKeyframesOptions, TimelineBezierHandle, TimelineKeyframe, TimelineKeyframeInterpolation, TimelineKeyframeValue } from "./KeyframeEditor";
export { MaterialVariantWorkflow } from "./MaterialVariantWorkflow";
export type { MaterialVariantRenderOptions, MaterialVariantState } from "./MaterialVariantWorkflow";
export { MultiUserReviewWorkflow, createMultiUserReviewWorkflow } from "./MultiUserReviewWorkflow";
export type { MultiUserReviewWorkflowSnapshot, MultiUserReviewWorkflowState, ReviewDecision, ReviewDecisionStatus, ReviewParticipant, ReviewParticipantRole, ReviewThread, ReviewWorkflowStatus } from "./MultiUserReviewWorkflow";
export { NonlinearAnimationEditor, createNonlinearAnimationEditor } from "./NonlinearAnimationEditor";
export type { NonlinearAnimationEditorSnapshot, NonlinearAnimationEditorState, NonlinearBinAsset, NonlinearBinAssetKind, NonlinearSequenceConfig, NonlinearSequenceSnapshot } from "./NonlinearAnimationEditor";
export { PickingService } from "./PickingService";
export type { EditorPickHit, EditorPickTarget, EditorPickingColorId, EditorPickingEvidenceSnapshot } from "./PickingService";
export { PlayModeBridge } from "./PlayModeBridge";
export type { SnapshotAdapter } from "./PlayModeBridge";
export { PrefabRegistry, validatePrefab } from "./PrefabRegistry";
export type { CreatePrefabOptions, EditorPrefab, EditorPrefabNodeBase, EditorPrefabSchemaVersion, InstantiatePrefabOptions } from "./PrefabRegistry";
export { PropertyPanel } from "./PropertyPanel";
export type { PropertyPanelField, PropertyPanelOptions } from "./PropertyPanel";
export { RotateGizmo } from "./RotateGizmo";
export { RenderQueuePanel, createRenderQueuePanel } from "./RenderQueuePanel";
export type { RenderQueuePanelItem, RenderQueuePanelItemStatus, RenderQueuePanelSnapshot } from "./RenderQueuePanel";
export { ScaleGizmo } from "./ScaleGizmo";
export { SceneOutliner } from "./SceneOutliner";
export type { SceneOutlinerItem, SceneOutlinerOptions } from "./SceneOutliner";
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
export { TimelineEditorController } from "./TimelineEditorController";
export type { TimelineEditorClipboard, TimelineEditorControllerOptions, TimelineEditorSnapshot, TimelineRoutePlaybackBinding } from "./TimelineEditorController";
export { TimelineClip, TimelineModel, TimelineTrack } from "./TimelineModel";
export type { TimelineActiveClipSnapshot, TimelineClipBlendMode, TimelineClipConfig, TimelineEasingName, TimelineLoopMode, TimelineModelConfig, TimelineSignalEventSnapshot, TimelineSnapshot, TimelineTrackConfig, TimelineTrackSnapshot } from "./TimelineModel";
export { TIMELINE_TRACK_TYPES, createTimelineTrackConfig, timelineTrackKindFromConfig, timelineTrackTypeDefinition } from "./TimelineTrackTypes";
export type { CreateTimelineTrackConfigOptions, TimelineEditorTrackKind, TimelineTrackTypeDefinition } from "./TimelineTrackTypes";
export { TimelineUI, renderTimelineUI } from "./TimelineUI";
export type { TimelineUIOptions, TimelineUIRenderResult } from "./TimelineUI";
export { VisualReviewDashboard, createVisualReviewDashboard } from "./VisualReviewDashboard";
export type { VisualReviewDashboardPackage, VisualReviewDashboardSnapshot } from "./VisualReviewDashboard";
export { createRootEditorSurface } from "./RootEditorSurface";
export type { RootEditorGizmoHandle, RootEditorGizmoKind, RootEditorSurface, RootEditorSurfaceOptions } from "./RootEditorSurface";
export { CreateNodeCommand } from "./commands/CreateNodeCommand";
export type { NodeContainer } from "./commands/CreateNodeCommand";
export { DeleteNodeCommand } from "./commands/DeleteNodeCommand";
export { ReparentNodeCommand } from "./commands/ReparentNodeCommand";
export { SetPropertyCommand } from "./commands/SetPropertyCommand";
export { TransformCommand } from "./commands/TransformCommand";
export type { SceneTransformTargetLike, TransformLike, TransformTarget } from "./commands/TransformCommand";
```

## @aura3d/engine

- Version: `4.6.1`
- Package manifest: `package.json`
- Public entrypoint: `packages/engine/src/index.ts`

### Export Declarations

```ts
export { A3D_APP_WORKFLOW_PRESETS, createA3DApp, resolveA3DAppQualityPreset } from "@aura3d/apps";
export type { A3DApp, A3DAppDiagnostics, A3DAppOptions, A3DAppQualityPreset, A3DAppQualitySettings, A3DAppWorkflowPreset } from "@aura3d/apps";
export { Engine } from "@aura3d/core";
export { Renderer, analyzeRgbaFrameMotionRegions, createAnimationMaterialStyle, createAnimationRenderPreset, createAnimationVisualQualityReport, createExternalParityEnvironmentPipeline, listExternalParityEnvironmentTargets } from "@aura3d/rendering";
export type { AnimationFrameVisualInput, AnimationFrameVisualQuality, AnimationMaterialStyle, AnimationMaterialStyleOptions, FrameMotionRegion, FrameMotionRegionMetrics, AnimationRenderPresetEvidence, AnimationRenderPresetOptions, AnimationVisualQualityOptions, AnimationVisualQualityReport } from "@aura3d/rendering";
export { GLTFLoader, createAssetCompatibilityReport, inspectGLTFAsset, loadRenderableAsset, summarizeExternalParityGLTFCorpus } from "@aura3d/assets/browser";
export { loadProductAsset } from "@aura3d/product-studio";
export { createAnimationLabWorkflow, createAssetViewerWorkflow, createComparisonWorkflow, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createSceneShowcaseWorkflow } from "@aura3d/workflows";
export { A3DRenderer, A3DScene, A3DAppLifecycle } from "./advanced-runtime/index.js";
export * from "./agent-api/index.js";
export * from "./runtime/index.js";
export * from "./game/index.js";
export * from "./ecs/ECSRenderSource.js";
export * from "./devtools/AuraDiagnosticsOverlay.js";
export * from "./devtools/AuraAssetPanel.js";
export * from "./devtools/AuraPerformancePanel.js";
export * from "./testing/screenshot.js";
export * from "./testing/routeHealth.js";
export * from "./qa/index.js";
export type { A3DAppLifecycleSnapshot, A3DDisposable, A3DRendererOptions, A3DSceneMeshOptions, A3DSceneRenderSourceOptions } from "./advanced-runtime/index.js";
export * from "./contracts/index.js";
export * from "./lanes/index.js";
export { CAMERA_DEFAULT_POSE, cameraQuatFromAxisAngle, cameraQuatFromEulerXYZ, cameraQuatMultiply, cameraQuatNormalize, cameraQuatRotateVec3, cameraQuatSlerp, cameraQuatToEulerXYZ } from "./lanes/prd08.js";
```

## @aura3d/input

- Version: `4.6.1`
- Package manifest: `packages/input/package.json`
- Public entrypoint: `packages/input/src/index.ts`

### Export Declarations

```ts
export { ActionMap } from "./ActionMap";
export type { ActionBinding, ActionConflict, AxisBinding, SerializedActionBindings } from "./ActionMap";
export { ComboDetector } from "./ComboDetector";
export type { ComboDefinition, ComboEvent, ComboFrameInput } from "./ComboDetector";
export { playHaptic, probeHaptics } from "./Haptics";
export type { GamepadRumbleActuatorLike, HapticRequest, HapticResult, HapticsCapability, HapticProbeInput, NavigatorVibrateLike } from "./Haptics";
export { TOUCH_LAYOUT_GENRES, createTouchLayoutPreset } from "./TouchLayouts";
export type { TouchLayoutButtonBinding, TouchLayoutGenre, TouchLayoutPreset, TouchLayoutPresetOptions, TouchLayoutRect } from "./TouchLayouts";
export { GamepadDevice } from "./GamepadDevice";
export type { GamepadButtonLike, GamepadLike } from "./GamepadDevice";
export { GestureRecognizer } from "./GestureRecognizer";
export type { Gesture } from "./GestureRecognizer";
export { InputSnapshot } from "./InputSnapshot";
export type { ButtonState, GamepadSnapshot, InputSnapshotOptions, PointerSnapshot, PointerTouch } from "./InputSnapshot";
export { processInputValue } from "./InputValueProcessors";
export type { InputValueProcessor } from "./InputValueProcessors";
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
export { WebXRSessionController } from "./WebXRSessionController";
export type { A3DXRFrameLike, A3DXRHandedness, A3DXRHandLike, A3DXRHitTestResultLike, A3DXRInputSourceLike, A3DXRJointSample, A3DXRPoseLike, A3DXRReferenceSpaceLike, A3DXRReferenceSpaceType, A3DXRSessionInit, A3DXRSessionLike, A3DXRSessionMode, A3DXRSystemLike, A3DXRViewerPoseLike, A3DXRViewLike, A3DXRViewportLike, A3DXRWebGLLayerLike, WebXRCameraSample, WebXRCapabilityReport, WebXRControllerSample, WebXRFrameSample, WebXRHandSample, WebXRHitTestSample, WebXRJointSample, WebXRSessionControllerOptions, WebXRSessionStartResult } from "./WebXRSessionController";
export * from "./GamepadInput.js";
export * from "./GestureControls.js";
```

## @aura3d/math

- Version: `4.6.1`
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
export * as MathUtils from "./MathUtils.js";
export { generateUUID, euclideanModulo, mapLinear, damp, pingpong, smootherstep, randInt, randFloat, randFloatSpread, seededRandom, degToRad, radToDeg, isPowerOfTwo, ceilPowerOfTwo, floorPowerOfTwo } from "./MathUtils.js";
export * from "./Line3.js";
export * from "./Triangle.js";
export * from "./Spherical.js";
export * from "./Cylindrical.js";
export * from "./Ray.js";
export * from "./Plane.js";
export * from "./Box3.js";
export * from "./Sphere.js";
export * from "./Frustum.js";
export * from "./ShapeUtils.js";
export * from "./SphericalHarmonics3.js";
export * from "./OBB.js";
export * from "./Capsule.js";
export * from "./ConvexHull.js";
export * from "./Octree.js";
export * from "./Transform.js";
export * from "./Interpolation.js";
export * from "./Easing.js";
export * from "./Random.js";
export * from "./Curves.js";
```

## @aura3d/navigation-recast

- Version: `4.6.1`
- Package manifest: `packages/navigation-recast/package.json`
- Public entrypoint: `packages/navigation-recast/src/index.ts`

### Export Declarations

```ts
export type NavigationVec3 = readonly [number, number, number];
export type RecastModule = typeof import("recast-navigation");
export type RecastGenerators = typeof import("recast-navigation/generators");
export interface NavigationTriangleSoup { readonly positions: readonly number[] | Float32Array;
export interface RecastNavigationOptions { readonly moduleLoader?: () => Promise<RecastModule>;
export interface NavigationPathResult { readonly success: boolean;
export interface NavigationAssetRef { readonly kind: "aura-asset-ref";
export interface NavigationAssetFetchResponse { readonly ok: boolean;
export interface ImportNavigationAssetOptions { readonly fetch?: (url: string) => Promise<NavigationAssetFetchResponse>;
export interface NavigationCrowdAgentOptions { readonly radius?: number;
export class RecastNavMeshHandle { readonly #module: RecastModule;
export interface RecastCrowdAgentState { readonly position: NavigationVec3;
export class RecastCrowdHandle { readonly #crowd: Recast.Crowd;
export class RecastTileCacheHandle { readonly navMesh: RecastNavMeshHandle;
export class RecastNavigation { readonly #module: RecastModule;
export async function createRecastNavigation(options: RecastNavigationOptions = {}): Promise<RecastNavigation> { let module: RecastModule;
```

## @aura3d/physics

- Version: `4.6.1`
- Package manifest: `packages/physics/package.json`
- Public entrypoint: `packages/physics/src/index.ts`

### Export Declarations

```ts
export { ensurePhysics, physicsInitMode } from "./ensure.js";
export * from "./Shape.js";
export * from "./RigidBody.js";
export * from "./Collider.js";
export * from "./CollisionEvents.js";
export * from "./CollisionVolumes.js";
export * from "./Constraint.js";
export * from "./Constraints.js";
export * from "./Raycast.js";
export * from "./TimeOfImpact.js";
export * from "./MeshBVH.js";
export * from "./SurfaceQuery.js";
export * from "./PhysicalCharacterController.js";
export * from "./ArcadeCharacterController.js";
export * from "./FightingCharacterController.js";
export * from "./KinematicBody.js";
export * from "./KinematicWorld.js";
export * from "./HitboxWorld.js";
export * from "./PhysicalVehicleController.js";
export * from "./ArcadeVehicleTelemetry.js";
export * from "./PhysicsWorld.js";
export * from "./PhysicsStepper.js";
export * from "./ScenePhysicsBridge.js";
export * from "./ECSPhysicsBridge.js";
export * from "./PhysicsDebugDraw.js";
```

## @aura3d/physics-rapier

- Version: `4.6.1`
- Package manifest: `packages/physics-rapier/package.json`
- Public entrypoint: `packages/physics-rapier/src/index.ts`

### Export Declarations

```ts
export { ensureRapier as ensurePhysics, rapierInitMode as physicsInitMode };
export type RapierModule = typeof import("@dimforge/rapier3d-compat");
export type PhysicsVec3 = readonly [number, number, number];
export type RapierShapeSpec =
export interface RapierRigidBodySpec { readonly type?: "dynamic" | "fixed" | "kinematic-position" | "kinematic-velocity";
export interface RapierColliderSpec { readonly shape: RapierShapeSpec;
export interface RapierBodySpec extends RapierRigidBodySpec, RapierColliderSpec {}
export type RapierJointSpec = { /** * `revolute` is the Rapier-native name for `hinge`; `prismatic` is the * Rapier-native name for `slider`. Both spellings are accepted and build the * same native joint — the alias exists so H1's fixed/revolute/prismatic * promotion reads identically at the adapter and at root. */ readonly type: "fixed" | "hinge" | "revolute" | "slider" | "prismatic" | "spring" | "ball-socket" | "motorised-hinge";
export interface RapierPhysicsOptions { readonly gravity?: PhysicsVec3;
export class RapierBodyHandle { readonly #body: Rapier.RigidBody;
export class RapierColliderHandle { readonly #collider: Rapier.Collider;
export class RapierJointHandle { readonly #joint: Rapier.ImpulseJoint;
export interface RapierRayHit { readonly body: RapierBodyHandle;
export interface RapierCharacterMovement { readonly requested: PhysicsVec3;
export class RapierCharacterControllerHandle { readonly #world: RapierPhysicsWorld;
export interface RapierWheelTuning { readonly suspensionStiffness?: number;
export interface RapierWheelSpec extends RapierWheelTuning { readonly connection: PhysicsVec3;
export interface RapierWheelCommand { readonly engineForce?: number;
export interface RapierWheelState { readonly index: number;
export class RapierVehicleControllerHandle { readonly #world: RapierPhysicsWorld;
export class RapierPhysicsWorld { readonly #module: RapierModule;
export async function createRapierPhysics(options: RapierPhysicsOptions = {}): Promise<RapierPhysicsWorld> { const module = await (options.moduleLoader ?? (() => import("@dimforge/rapier3d-compat")))() .catch((error: unknown) => { if ((error as { code?: string })?.code === "ERR_MODULE_NOT_FOUND") { throw new Error( "@aura3d/engine physics requires the optional peer @dimforge/rapier3d-compat — install it (npm i @dimforge/rapier3d-compat) to use Rapier physics." );
export function createRapierPhysicsSync(options: Omit<RapierPhysicsOptions, "moduleLoader"> = {}): RapierPhysicsWorld { return new RapierPhysicsWorld(requireRapierModule(), options.gravity ?? [0, -9.81, 0]);
export interface ColliderSidecarTransform { readonly position?: PhysicsVec3;
export interface ColliderSidecarOptions extends ColliderSidecarTransform { readonly body?: RapierBodyHandle;
export interface ColliderSidecarResult { readonly body: RapierBodyHandle;
export async function createCollidersFromSidecar( world: RapierPhysicsWorld, source: string | Uint8Array, options: ColliderSidecarOptions = {} ): Promise<ColliderSidecarResult> { const bytes = typeof source === "string" ? new Uint8Array(await (await fetch(source)).arrayBuffer()) : source;
```

## @aura3d/physics/solverless

- Version: `4.6.1`
- Package manifest: `packages/physics/package.json`
- Public entrypoint: `packages/physics/src/solverless.ts`

### Export Declarations

```ts
export { Shape } from "./Shape.js";
export type { BoxShape, Bounds, CapsuleShape, ConvexHullShape, HeightfieldShape, MeshShape, PhysicsShape, PlaneShape, SphereShape, Vec3 } from "./Shape.js";
export { EPSILON, vec3 } from "./Shape.js";
export { PhysicsStepper } from "./PhysicsStepper.js";
export type { PhysicsStepperResult } from "./PhysicsStepper.js";
export { ScenePhysicsBridge } from "./ScenePhysicsBridge.js";
export type { ScenePhysicsBinding, ScenePhysicsNode } from "./ScenePhysicsBridge.js";
export { PhysicsDebugDraw } from "./PhysicsDebugDraw.js";
export type { DebugLine, DebugLineCategory, PhysicsDebugDrawBudgetedResult, PhysicsDebugDrawOptions, PhysicsDebugDrawTelemetry } from "./PhysicsDebugDraw.js";
export { buildMeshBVH, raycastMesh, raycastMeshBruteForce } from "./MeshBVH.js";
export type { MeshBVH, MeshBVHBuildOptions, MeshRayHit, RaycastMeshOptions } from "./MeshBVH.js";
export { createMeshSurfaceQuery } from "./SurfaceQuery.js";
export type { MeshSurfaceQuery, MeshSurfaceQueryOptions, SurfaceSample } from "./SurfaceQuery.js";
```

## @aura3d/physics/world

- Version: `4.6.1`
- Package manifest: `packages/physics/package.json`
- Public entrypoint: `packages/physics/src/world.ts`

### Export Declarations

```ts
export { PhysicsWorld } from "./PhysicsWorld.js";
export { ensurePhysics, physicsInitMode } from "./ensure.js";
export type { PhysicsBackend, PhysicsBackendPreference, PhysicsBackendSelection, PhysicsContinuousCollisionDescriptor, PhysicsContinuousCollisionSelection, PhysicsSnapshot, PhysicsStepStats, PhysicsWorldDescriptor } from "./PhysicsWorld.js";
```

## @aura3d/product-studio

- Version: `4.6.1`
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

- Version: `4.6.1`
- Package manifest: `packages/react/package.json`
- Public entrypoint: `packages/react/src/index.ts`

### Export Declarations

```ts
export interface AuraFrameInfo { readonly dt: number;
export type AuraFrameCallback = (frame: AuraFrameInfo) => void;
export interface AuraTimelineSpec { readonly mode: "loop" | "once";
export interface AuraCanvasProps { readonly children?: ReactNode;
export interface SceneProps { readonly children?: ReactNode;
export interface ModelProps extends AuraModelOptions { readonly asset: AuraAssetRef<"model">;
export interface CameraProps extends Omit<AuraCameraSpec, "mode"> { readonly mode?: AuraCameraSpec["mode"];
export interface LightsProps { readonly preset?: "studio";
export interface EffectProps extends Omit<AuraEffectNode, "kind" | "effect"> { readonly type: AuraEffectNode["effect"];
export const AuraAppContext = createContext<AuraApp | undefined>(undefined);
export function useAuraApp(): AuraApp | undefined { return useContext(AuraAppContext);
export interface FrameSubscriberHost { onFrame(callback: AuraFrameCallback): () => void;
export interface FrameScheduler { subscribe(callback: AuraFrameCallback, priority?: number): () => void;
export function createFrameScheduler(host: FrameSubscriberHost): FrameScheduler { const entries: { readonly callback: AuraFrameCallback; readonly priority: number; readonly order: number }[] = [];
export function useAuraFrame(callback: AuraFrameCallback, priority = 0): void { const app = useAuraApp();
export interface AuraCanvasEventHandlers { readonly onPointerDown?: (event: PointerEvent) => void;
export function eventInteractionNodes(target?: string) { return [ interactions.pointer(target ? { target } : {}), interactions.hover(target ? { target } : {}) ] as const;
export function sceneMountKey(builder: AuraSceneBuilder): string { try { return JSON.stringify(builder.toJSON());
export function sceneChildrenKey(children: ReactNode): string { const parts: string[] = [];
export function applySceneChange(
export function AuraCanvas(props: AuraCanvasProps): ReactElement { const ref = useRef<HTMLCanvasElement | null>(null);
export function Scene(_props: SceneProps): null { return null;
export function Model(props: ModelProps): ReactElement | null { if (!props.suspendOnLoad || props.suspendOnLoad.length === 0) return null;
export function Camera(_props: CameraProps): null { return null;
export function Lights(_props: LightsProps): null { return null;
export function Effect(_props: EffectProps): null { return null;
export interface AuraAssetDescriptor { readonly id: string;
export interface AuraAssetPreloadEvidence { readonly ok: boolean;
export type AuraAssetPreloadFn = (
export interface AuraAssetResource { preload(): Promise<AuraAssetPreloadEvidence>;
export function createAuraAssetResource(
export function resourceForDescriptors(
export function useAuraAsset(resource: AuraAssetResource): AuraAssetPreloadEvidence { return resource.read();
export type SceneRecipe = (builder: AuraSceneBuilder) => AuraSceneBuilder;
export function cameraControlsRecipe(options: { readonly distance?: number; readonly target?: string } = {}): SceneRecipe { return (builder) => builder .camera(camera.orbit(options.distance !== undefined ? { distance: options.distance } : {})) .add(interactions.orbit(options.target ? { target: options.target } : {}));
export function environmentPresetRecipe(
export function transformGizmoRecipe(target: string): SceneRecipe { if (!target) throw new Error("Aura3D transform gizmo recipe requires a target node name.");
export interface R3FMigrationRow { /** The idiomatic R3F / drei surface. */ readonly r3f: string;
export const R3F_TO_AURA_MIGRATION_TABLE: readonly R3FMigrationRow[] = [
export const R3F_MIGRATION_NOT_PARITY =
export function buildSceneFromChildren(children: ReactNode): AuraSceneBuilder { let builder = scene();
export function productViewerScene(asset: AuraAssetRef<"model">, material?: AuraMaterialSpec): AuraSceneBuilder { return scene() .background("#08111f") .add(model(asset, { material }).position(0, 0, 0).scale(1)) .add(lights.studio({ intensity: 1.1 })) .camera(camera.orbit({ distance: 4 })) .diagnostics(true);
```

## @aura3d/rendering

- Version: `4.6.1`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/index.ts`

### Export Declarations

```ts
export type { BufferUsage, DrawCommand, IndexType, PrimitiveTopology, RenderBackendKind, RenderBuffer, RenderDeviceCapability, RenderDevice, RenderDeviceDiagnostics, RenderDeviceInfo, RenderTarget, RenderTargetDescriptor, RenderShaderProgram, ShaderAttributeReflection, ShaderReflection, ShaderUniformReflection, ShaderSources, UniformValue } from "./RenderDevice";
export { MockRenderBuffer, MockRenderDevice, MockRenderTarget, MockShaderProgram, RenderDeviceError } from "./RenderDevice";
export { buildGpuTargetInventory, GPU_TARGET_BUDGET_BYTES, resolveGpuTargetOwner, spreadGpuTargetInventory } from "./RenderDevice";
export type { GpuTargetInventory, GpuTargetInventoryEntry, GpuTargetKind, GpuTargetOwner } from "./RenderDevice";
export { createRenderDevice } from "./RenderBackend";
export type { RenderBackendOptions } from "./RenderBackend";
export { WebGL2Device, webGL2MaxTextureSize } from "./WebGL2Device";
export type { WebGL2BloomDiagnostics, WebGL2DeviceOptions } from "./WebGL2Device";
export { WebGL2StateCache } from "./WebGL2StateCache";
export type { WebGL2StateCacheDescriptor, WebGL2StateCacheSnapshot, WebGL2StateCacheStats } from "./WebGL2StateCache";
export { MAX_WEBGPU_SKINNING_JOINTS, decideSkinningPalettePath } from "./WebGPUSkinningLimits";
export type { SkinningCpuFallbackReason, SkinningPaletteDecision } from "./WebGPUSkinningLimits";
export type { WebGPUAdapterLike, WebGPUBufferDescriptorLike, WebGPUBufferLike, WebGPUDeviceLike, WebGPUDeviceOptions, WebGPULike, WebGPUQueueLike, WebGPUSamplerDescriptorLike } from "./WebGPUDevice";
export { isWebGPURenderTarget, runWebGPURenderToTextureProof } from "./WebGPURenderToTextureProof";
export type { WebGPURenderToTextureProof, WebGPURenderToTextureProofOptions } from "./WebGPURenderToTextureProof";
export type { AdvancedRendererSource } from "./advanced-runtime";
export { VertexAttribute, VertexFormat } from "./VertexFormat";
export type { VertexAttributeDescriptor, VertexAttributeSemantic, VertexAttributeType } from "./VertexFormat";
export { CUSTOM_ATTRIBUTE_LOCATION_POOL, assignCustomAttributeLocations, customAttributeSemantic, isCustomAttributeSemantic } from "./VertexFormat";
export { VertexBuffer } from "./VertexBuffer";
export { IndexBuffer } from "./IndexBuffer";
export { Geometry, computeBounds } from "./Geometry";
export type { Bounds3, BoxGeometryOptions, CapsuleGeometryOptions, CylinderGeometryOptions, GeometryDrawRange, GeometryGroup, GeometryMorphTarget, PlaneGeometryOptions, ScreenSpaceLineSegment, TorusGeometryOptions, UVSphereGeometryOptions } from "./Geometry";
export { createPrimitiveGeometry, clearPrimitiveGeometryCache, primitiveGeometryCacheSize } from "./geometry/Primitives";
export type { AuraPrimitiveKind, AuraParityPrimitiveParams } from "./geometry/Primitives";
export { parityMeshToGeometry, resolveCurve3, resolveShape2D, triangulateShape, isClockWise, shapeArea, earcut, Curve3Adapter, computeVertexNormals, computeParityBounds } from "./geometry/Support";
export type { ParityMesh, ParityBounds, ResolvedShape2D } from "./geometry/Support";
export { coneParityMesh, cylinderParityMesh } from "./geometry/Cone";
export type { ConeParityParams, CylinderParityParams } from "./geometry/Cone";
export { circleParityMesh } from "./geometry/Circle";
export type { CircleParityParams } from "./geometry/Circle";
export { ringParityMesh } from "./geometry/Ring";
export type { RingParityParams } from "./geometry/Ring";
export { torusKnotParityMesh } from "./geometry/TorusKnot";
export type { TorusKnotParityParams } from "./geometry/TorusKnot";
export { polyhedronParityMesh, polyhedronParityMeshFromBase } from "./geometry/Polyhedron";
export type { PolyhedronParityParams, PolyhedronVariant } from "./geometry/Polyhedron";
export { roundedBoxParityMesh, boxParityMesh, meshToNonIndexed } from "./geometry/RoundedBox";
export type { RoundedBoxParityParams } from "./geometry/RoundedBox";
export { tubeParityMesh } from "./geometry/Tube";
export type { TubeParityParams } from "./geometry/Tube";
export { latheParityMesh } from "./geometry/Lathe";
export type { LatheParityParams } from "./geometry/Lathe";
export { extrudeParityMesh } from "./geometry/Extrude";
export type { ExtrudeParityParams } from "./geometry/Extrude";
export { shapeParityMesh } from "./geometry/Shape";
export type { ShapeParityParams } from "./geometry/Shape";
export { convexParityMesh } from "./geometry/Convex";
export type { ConvexParityParams, ConvexPointInput } from "./geometry/Convex";
export { edgesParityMesh } from "./geometry/Edges";
export type { EdgesInput } from "./geometry/Edges";
export { wireframeParityMesh } from "./geometry/Wireframe";
export type { WireframeInput } from "./geometry/Wireframe";
export { InstanceBuffer } from "./resources/InstanceBuffer";
export { UniformBlock, FrameUniforms, layoutStd140, uniformBlockGlsl, AURA_FRAME_BINDING, AURA_LIGHTS_BINDING } from "./resources/UniformBlock";
export type { Std140Field, Std140Layout } from "./resources/UniformBlock";
export { normalizeProgramFeatures, DEFAULT_PROGRAM_FEATURES, totalLightCount } from "./program/ProgramFeatures";
export { programKey } from "./program/ProgramKey";
export { generateProgramImpl, registerProgramWgslEmitter, programDegradationLog, GENERATED_PROGRAM_MARKER } from "./program/ProgramGenerator";
export type { ProgramDegradation, GenerateProgramOptions } from "./program/ProgramGenerator";
export { ProgramCache } from "./program/ProgramCache";
export { ProgramWarmup, collectWarmupFeatures } from "./program/ProgramWarmup";
export type { WarmupInput, WarmupResult } from "./program/ProgramWarmup";
export { defaultProgramFeatures, materialFeatureWarning, materialUsesGeneratedProgram, ALLOWLIST_PROGRAM_SHADERS } from "./program/MaterialFeatures";
export { qrCoreGeneratorOn, qrCoreOutputOn, qrE3CompilerLightingOn, rendererProgramCache, rendererProgramCachePeek, rendererAuraFrame, rendererOutputPass, setRendererProgramDegradationSink } from "./renderer/qrSubFlags";
export { createPrd06ProgramCacheWarmup, type Prd06ShaderWarmupOptions } from "./renderer/Prd06ShaderWarmup";
export { OutputPass } from "./output/OutputPass";
export { createHdrTarget, ensureHdrTarget, type HdrTargetOptions } from "./output/HdrTarget";
export { OUTPUT_VERTEX_GLSL, OUTPUT_FRAGMENT_PROLOGUE_GLSL, OUTPUT_FRAGMENT_EPILOGUE_GLSL, TONE_MAPPING_OPERATORS_GLSL, TONE_MAP_OPERATOR_FUNCTIONS, outputFragmentGlsl } from "./output/ToneMappingOperators.glsl";
export { InterleavedTransparentPass, mergeTransparentSegments, type TransparentEngineItem } from "./renderer/InterleavedTransparentPass";
export { SceneDepthCopyPass, ensureSceneDepthCopyTarget } from "./renderer/SceneDepthCopyPass";
export { blendQueueForState, blendStateIsTransparent, blendModeDefaultDepthWrite, blendEquationName, QUEUE_BY_MODE } from "./BlendModes";
export type { BlendQueue } from "./BlendModes";
export { ResolutionGovernor, RESOLUTION_GOVERNOR_STEP, RESOLUTION_GOVERNOR_DOWN_FACTOR, RESOLUTION_GOVERNOR_UP_FACTOR } from "./ResolutionGovernor";
export type { ResolutionGovernorOptions } from "./ResolutionGovernor";
export { resolveCanvasPixelRatio, resolveCanvasContextAttributes, watchDevicePixelRatio } from "./renderer/PixelRatio";
export type { AuraResolutionOptions, AuraCanvasContextAttributes } from "./renderer/PixelRatio";
export { applyMorphTargets, computeMorphTargetEnvelopeBounds, computeMorphTargetWeightedBounds } from "./MorphTarget";
export type { MorphTargetDelta } from "./MorphTarget";
export { computeAnimatedSkinnedBoundsUnion, computeSkinnedGeometryBounds, computeSkinnedMorphTargetEnvelopeBounds, computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
export type { SkinningBoundsPalette } from "./SkinningBounds";
export { Texture, bytesPerPixel, compressedBlockByteLength, compressedTextureByteLength, isCompressedTextureFormat } from "./Texture";
export type { TextureColorSpace, TextureCompressedFormat, TextureCubeFace, TextureCubeFaceDescriptor, TextureCubeFaceLevel, TextureDescriptor, TextureDimension, TextureFormat, TextureMipLevel, TextureMipLevelDescriptor, TexturePixelData } from "./Texture";
export { createEnvironmentMapResourceSet, decodeRgba8EnvironmentToLinear, decodeRgbeEnvironmentMap, encodeLinearHdrEnvironmentToRgba8, encodeLinearHdrEnvironmentToRgba16f, generateApproximateBrdfLutPixels, generateDiffuseIrradianceRgba8, generateRgba8EnvironmentMipLevels, generateRgba16fEnvironmentMipLevels, generateRgba16fDiffuseIrradianceMipLevel, generateRgba16fSpecularPrefilterMipLevels, generateSpecularPrefilterMipLevels, linearChannelToSrgb, srgbChannelToLinear } from "./EnvironmentMapResources";
export { convolveEnvironmentIrradiance, evaluateShIrradiance, prefilterGgxEnvironmentLevels, projectEnvironmentIrradianceSh, specularPrefilterLevelRoughness } from "./SpecularPrefilter";
export type { GgxPrefilteredEnvironmentLevel, GgxSpecularPrefilterOptions, LinearHdrEnvironmentMapOutput, ShIrradianceCoefficients } from "./SpecularPrefilter";
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
export { resolveVolumetricFog, resolveVolumetricQuality, selectVolumetricLight, volumetricLightDirection } from "./VolumetricFog";
export type { VolumetricFogEffectParams, VolumetricFogQuality, VolumetricFogResolution, VolumetricQualityResolution } from "./VolumetricFog";
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
export { bloomPyramidCompositeGain, normalizeBloomQualityPreset, resolveBloomPyramidPlan, } from "./postprocess/NativeBloomPyramid";
export type { BloomPyramidMip, BloomPyramidPlan, BloomQualityPreset, } from "./postprocess/NativeBloomPyramid";
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
export { auraWrapMode, DEFAULT_SAMPLER_ANISOTROPY, resolveSamplerAnisotropy, SAMPLER_ANISOTROPY_STEPS, Sampler, threeToMagFilter, threeToMinFilter, threeToWrapMode } from "./Sampler";
export type { SamplerAnisotropyRequest, SamplerAnisotropyResolution, SamplerDescriptor, TextureAddressMode, TextureFilter, TextureMagFilter, TextureMinFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { isTextureBinding, TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
export { ProductionWebGL2Renderer, ProductionRuntimeRenderer, ProductionWebGPURenderer, analyzePixels, bindTransmissionBackdropCapture, createSceneColorMipLevels, createTransmissionBackdropSource, createContactShadowPass, createProductionOrbitControlPreset, createDualProbeEnvironmentLightingResources, createProductionEnvironmentLightingResources, createProductionPbrHdrPipelineFromRadiance, createProductionToneMappingPolicy, createProductionWebGPUReport, describeWebGPULostDevice, resolveProductionRuntimeRendererBackend, screenWebGPURenderBundlePrototype, WEBGPU_PARITY_PLAN, loadProductionHdrEnvironmentFile, loadProductionHdrEnvironment, normalizeTransmissionBackdropCapture, parseProductionRadianceHDR, rendererFeatureReport, rendererInteractiveFeatureReport, rendererProofCapture, rendererShadowReport, validateProductionRendererInput, summarizeProductionAnimationWorkflow, summarizeProductionProductionProof, summarizeProductionWebGL2Proof } from "./production-runtime";
export type { ProductionAnimationMetadataInput, ProductionAnimationWorkflowSummary, DualProbeEnvironmentLightingOptions, ProductionOrbitControlPreset, ProductionEnvironmentLightingResources, ProductionHdrEnvironmentLoaderOptions, ProductionHdrEnvironmentFileLoaderOptions, ProductionHdrEnvironmentFileSource, ProductionLoadedHdrEnvironment, ProductionImportedAssetRenderMetadata, ProductionPbrHdrPipeline, ProductionPbrHdrPipelineOptions, ProductionPixelMetrics, ProductionProductionRenderer, ProductionRadianceHDR, ProductionRenderProof, ProductionRendererBackend, ProductionRendererFeature, ProductionRendererFeatureState, ProductionRendererInput, RendererTimingDiagnostics, ProductionToneMappingOperator, ProductionToneMappingPolicy, ProductionWebGPUAdapterLike, ProductionWebGPULike, ProductionWebGPUReport, ProductionWebGPUStatus, ContactShadowPassDiagnostics, ProductionRuntimeRendererBackendPreference, ProductionRuntimeRendererBackendSelection, ProductionRuntimeRendererOptions, ProductionWebGL2RendererOptions, ProductionWebGPURendererOptions, WebGPULostDeviceReport, WebGPUParityFeatureId, WebGPUParityFeatureRow, WebGPUParityFeatureStatus, WebGPURenderBundlePrototype, RuntimeParityTransmissionBackdropCaptureOptions, RuntimeParityTransmissionBackdropCaptureProof, TransmissionBackdropSource } from "./production-runtime";
export { ShaderModule } from "./ShaderModule";
export { PortableShaderCompilationError, PortableShaderMaterial } from "./PortableShaderMaterial";
export type { PortableShaderCompilationResult, PortableShaderMaterialOptions, PortableShaderSources, PortableShaderStagePair, PortableShaderUniform } from "./PortableShaderMaterial";
export { RenderPipeline } from "./RenderPipeline";
export type { PipelineDrawDescriptor, RenderPipelineDescriptor } from "./RenderPipeline";
export { ShaderPreprocessor } from "./ShaderPreprocessor";
export type { ShaderPreprocessOptions, ShaderPreprocessResult, ShaderSourceMapEntry } from "./ShaderPreprocessor";
export { DEFAULT_DEPTH_SHADER_MARKER, DEFAULT_DEPTH_SHADER_NAME, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER, DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME, DEFAULT_INSTANCED_PBR_SHADER_MARKER, DEFAULT_INSTANCED_PBR_SHADER_NAME, DEFAULT_INSTANCED_UNLIT_SHADER_MARKER, DEFAULT_INSTANCED_UNLIT_SHADER_NAME, DEFAULT_MORPH_UNLIT_SHADER_MARKER, DEFAULT_MORPH_UNLIT_SHADER_NAME, DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER, DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_SHADER_MARKER, DEFAULT_TEXTURED_PBR_SHADER_NAME, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT, DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT, DEFAULT_SKINNED_LIT_SHADER_MARKER, DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME, DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER, DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME, DEFAULT_SKINNED_LIT_SHADER_NAME, DEFAULT_SKINNED_UNLIT_SHADER_MARKER, DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER, DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME, DEFAULT_SKINNED_UNLIT_SHADER_NAME, DEFAULT_TEXTURED_UNLIT_SHADER_MARKER, DEFAULT_TEXTURED_UNLIT_SHADER_NAME, DEFAULT_UNLIT_SHADER_MARKER, DEFAULT_UNLIT_SHADER_NAME, ShaderLibrary, createDefaultShaderLibrary, registerShaderChunk, globalShaderChunkRevision, globalShaderChunkNames, registerGlobalShaderSource, unregisterGlobalShaderSource, globalShaderSource, globalShaderChunkEntries, globalShaderWgslChunkSource } from "./ShaderLibrary";
export type { CompiledShaderSource, ShaderSourcePair } from "./ShaderLibrary";
export type { ShaderVariantDescriptor } from "./ShaderLibrary";
export { MAX_UNIFORM_SKINNING_JOINTS, SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
export type { ShaderChunk } from "./ShaderChunks";
export { A3D_AUTHOR_GLSL_CHUNKS, A3D_AUTHOR_GLSL_CHUNK_NAMES, type A3dAuthorGlslChunk } from "./shaders/chunks/author";
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
export { ScreenSpaceLineMaterial } from "./ScreenSpaceLineMaterial";
export type { ScreenSpaceLineCap, ScreenSpaceLineMaterialOptions } from "./ScreenSpaceLineMaterial";
export { MAX_DATA_TEXTURE_SKINNING_JOINTS, SkinnedUnlitMaterial } from "./SkinnedUnlitMaterial";
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
export { authoredLineOffset, buildShaderFailure, describeShaderFailure, reportShaderFailure, clearShaderFailures, formatShaderFailure, getShaderFailures, isShaderFailureError, parseShaderLog, recordShaderFailure, resolveShaderFailureMode, setShaderFailureMode, sourceWindow, type ShaderFailureCode, type ShaderFailureLocation, type ShaderFailureMode, type ShaderFailureRecord, type ShaderFailureSourceLine, type ShaderFailureSources } from "./ShaderFailures";
export { ForwardPass, SkinningPaletteUploadManager, applyForwardSpotShadowMapUniforms, forwardPassFeatureAxes, splitForwardItems, forwardItemBucket, type ForwardBucket } from "./ForwardPass";
export { MAX_GPU_INSTANCES, MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES, MAX_SKINNING_JOINTS } from "./ForwardPass";
export { ensureMorphTargetTexture, releaseMorphScratchGeometry, releaseMorphTargetTexture, morphTextureDiagnostics } from "./ForwardPass";
export { createSpotShadowProjection, defaultSpotShadowKernel, projectSpotShadowUv, resolveSpotShadowFactor, selectSpotShadowAtlasTier, } from "./shadows/SpotShadowMaps";
export type { ForwardSpotShadowMapOptions, SpotShadowAtlasTier, SpotShadowFactorInput, SpotShadowProjection } from "./shadows/SpotShadowMaps";
export { computeShimmerScore, createCascadeBiasTable, selectCascadeWithHysteresis, } from "./shadows/CascadeHysteresis";
export type { CascadeBiasTableEntry, CascadeHysteresisInput, HysteresisCascadeSplit, ShimmerSample, ShimmerScore } from "./shadows/CascadeHysteresis";
export { createShadowAtlasPlan } from "./ShadowMap";
export type { ShadowAtlasFallback, ShadowAtlasPlan, ShadowAtlasPlanRequest } from "./ShadowMap";
export { createContactTelemetryFrame, resolveContactDarkening, resolveDepthAwareContactRadius, } from "./shadows/ContactShadows";
export type { ContactDarkeningSample, ContactOccluder, ContactReceiverSample, ContactTelemetryFrame } from "./shadows/ContactShadows";
export { computeObliqueClipProjection, computePlanarMirrorCamera, computePlanarViewMatrix, createPlanarProjectionMatrix, createSsrPassDescriptor, GlassRefractionCapture, multiplyPlanarMatrices, PlanarReflectionCapture, resolveGlassRefractionParams, resolveWaterReflectionRefraction, } from "./PlanarReflection";
export type { GlassRefractionCaptureOptions, GlassRefractionCaptureResult, GlassRefractionParams, GlassRefractionSceneRenderer, ObliqueClipProjection, PlanarMirrorCamera, PlanarReflectionCaptureOptions, PlanarReflectionCaptureResult, PlanarReflectionFrame, PlanarReflectionSceneRenderer, SsrPassDescriptor, WaterReflectionRefractionParams } from "./PlanarReflection";
export { consolidateBatchedMeshes, instancingPathMatrix, resetInstancingFallbackWarnings, warnOnInstancingFallback, } from "./InstancingDiagnostics";
export type { BatchedMeshResult, BatchedMeshTelemetry, InstancingFallbackReason, InstancingFallbackReport, InstancingPathEntry, InstancingPathSupport } from "./InstancingDiagnostics";
export { auditRenderOrder, createTerrainTileGrid, enforceFrameBudget, planScatterInstances, queryTerrainHeight, resolveTerrainSlopeBlend, scatterWindOffset, } from "./TerrainTiles";
export type { FrameBudgetDecision, FrameBudgetInput, RenderOrderAuditEntry, ScatterPlan, ScatterPlanOptions, ScatterWindOffset, TerrainBlendLayer } from "./TerrainTiles";
export { toHeightTexture } from "./TerrainHeightfield";
export type { TerrainHeightTexture } from "./TerrainHeightfield";
export { createBeamDescriptor, resolveBillboardCorners, resolveFlipbookUv, } from "./SpriteFlipbook";
export type { BeamDescriptor, BillboardCorners, BillboardMode, BillboardOptions, FlipbookFrame } from "./SpriteFlipbook";
export { createMorphTargetPlan, planMorphTargets, resolveWrinkleMapStrength, DEFAULT_MORPH_DEVICE_LIMITS, MORPH_UNIFORM_MAX_TARGETS, MORPH_UNIFORM_MAX_VERTICES } from "./MorphTargetPlan";
export type { MorphDeviceLimits, MorphPlanDecision, MorphPlanMode, MorphTargetPlan, WrinkleMapBinding, WrinkleMapHook } from "./MorphTargetPlan";
export type { EnvironmentLightingOptions, ForwardEnvironmentFogMode, ForwardEnvironmentFogOptions, ForwardPassOptions, ForwardShadowMapOptions, RenderItem, RenderItemDrawRange, RenderMaterial, SkinningPaletteBinding, SkinningPaletteDecisionRecord, SkinningPaletteDiagnostics, SkinningPalettePath } from "./ForwardPass";
export { batchStaticRenderItems, buildStaticBoundsBvh, queryStaticBoundsBvh, raycastStaticBoundsBvh, selectLodLevel, updateStaticBoundsBvh } from "./SceneOptimization";
export { consolidateStaticMeshes, deindexGeometryToNonIndexed } from "./MeshConsolidation";
export type { MeshConsolidationInput, MeshConsolidationOptions, MeshConsolidationResult } from "./MeshConsolidation";
export type { LodLevel, LodSelection, LodSelectionInput, StaticBatchInput, StaticBatchOptions, StaticBatchResult, StaticBoundsBvh, StaticBoundsBvhBuildDiagnostics, StaticBoundsBvhNode, StaticBoundsBvhOptions, StaticBoundsBvhQueryOptions, StaticBoundsBvhQueryResult, StaticBoundsBvhRaycastDiagnostics, StaticBoundsBvhRaycastHit, StaticBoundsBvhRaycastResult, StaticBoundsBvhTraversalDiagnostics, StaticBoundsBvhUpdateResult, StaticBoundsIntersector, StaticSpatialBounds, StaticSpatialItem } from "./SceneOptimization";
export { computeOrthographicCameraFrame, computeOrthographicCameraView, computePerspectiveCameraFrame } from "./CameraFraming";
export type { CameraFrameBounds, CameraFrameViewport, OrthographicCameraFrame, OrthographicCameraFrameFitMode, OrthographicCameraFrameOptions, OrthographicCameraViewOptions, PerspectiveCameraFrame, PerspectiveCameraFrameOptions } from "./CameraFraming";
export { SDF_FONT_SCOPE_NOTE, SDF_OCCLUDED_OPACITY, SDF_SUPPORTED_GLYPHS, applySdfTextOcclusion, createSdfFontAtlas, createSdfTextQuadMesh, describeSdfTextPixelBacking, layoutSdfText, rasterizeSdfTextLabelImage, resolveSdfTextFrameOpacity, sampleSdfCoverage, sdfTextLodFade, summarizeTextSurfaces } from "./SdfText";
export type { SdfFontAtlas, SdfFontAtlasOptions, SdfGlyphMetrics, SdfPixelBacking, SdfPixelBackingInput, SdfTextFrameOpacity, SdfTextFrameOpacityInput, SdfTextLayout, SdfTextLayoutOptions, SdfTextOcclusionPolicy, SdfTextQuad, SdfTextQuadMesh, SdfTextRasterImage, SdfTextRasterOptions, SdfTextResolvedStyle, SdfTextRgba, SdfTextStyle, TextSurfaceSummary } from "./SdfText";
export { createStereoCameraRig } from "./StereoCameraRig";
export type { StereoCameraRig, StereoCameraRigOptions, StereoEye, StereoEyeView, StereoLayout, StereoViewport } from "./StereoCameraRig";
export { createAnaglyphCompositePlan, createAnaglyphPixelComposite, createParallaxBarrierInterleavePlan, createParallaxBarrierPixelComposite, createStereoEffectPlan } from "./StereoEffects";
export { createCinematicDepthCompositionPlan, createCinematicLightingRig, createCinematicMaterialPreset, createCinematicPBRMaterial, createCinematicPostProcessStack, createDomOverlayEvidenceFlag, createEmissivePracticalLightSystem, createFogVolumeSystem, createGlowCardSystem, createRainParticleSystem, createRendererOwnedEvidenceFlag, createWetReflectionApproximation, listCinematicLightingRigs, listCinematicMaterialPresets, resolveCinematicMaterialPresetId, selectCinematicLightingRig, validateRendererOwnedCinematicEvidence } from "./cinematic/index";
export type { CinematicEvidenceFeature, CinematicRendererEvidenceFlag, CinematicRendererEvidenceValidation, CinematicRuntimeLight } from "./cinematic/index";
export type { AnaglyphCompositePlan, AnaglyphPixelComposite, AnaglyphPixelCompositeOptions, ParallaxBarrierInterleavePlan, ParallaxBarrierPixelComposite, ParallaxBarrierPixelCompositeOptions, StereoEffectMode, StereoEffectPlan, StereoEffectPlanOptions } from "./StereoEffects";
export { analyzeRgbaFrameMotionRegions, analyzeRgbaFrameVisualMetrics, evaluateFrameVisualQuality } from "./FrameVisualMetrics";
export type { FrameVisualBounds, FrameVisualMetrics, FrameVisualMetricsOptions, FrameMotionRegion, FrameMotionRegionMetrics, FrameVisualQualityResult, FrameVisualQualityThresholds } from "./FrameVisualMetrics";
export { LightCollector, collectLight } from "./LightCollector";
export type { CollectedLight, CollectedLightKind, LightCollectorOptions } from "./LightCollector";
export { LightUniforms, MAX_DIRECT_LIGHTS } from "./LightUniforms";
export type { PackedLightUniforms } from "./LightUniforms";
export { CLUSTER_TILE_SIZE, MAX_LIGHTS_PER_CLUSTER, createClusteredForwardLighting, resetClusteredForwardLightingWarnings } from "./ClusteredForwardLighting";
export type { ClusteredForwardFallbackPolicy, ClusteredForwardLightingDiagnostics, ClusteredForwardLightingOptions, ClusteredForwardLightingResources } from "./ClusteredForwardLighting";
export { DepthMaterial, DepthPass } from "./DepthPass";
export type { DepthPassOptions } from "./DepthPass";
export { DENSE_SHADOW_CASTER_INSTANCES, QUALITY_TIER_SHADOW_PCF_TAPS, SHADOW_PCF_TAP_TIERS, applyShadowPcfTapTier, isShadowPcfTapTier, resolveShadowPcfTapTier } from "./shadows/ShadowFilterTier";
export type { ShadowPcfTapTier, ShadowPcfTapTierDecision, ShadowPcfTapTierReason } from "./shadows/ShadowFilterTier";
export { ShadowMap, computeShadowDepthBias, createPoissonDiskShadowKernel, createShadowAtlasLayout, createShadowFilterKernel } from "./ShadowMap";
export type { ShadowAtlasAllocation, ShadowAtlasLayout, ShadowAtlasRequest, ShadowFilterDistribution, ShadowFilterKernel, ShadowFilterMode, ShadowFilterSample, ShadowMapOptions } from "./ShadowMap";
export { ShadowPass } from "./ShadowPass";
export type { ShadowPassOptions, ShadowPassReason, ShadowPassResult, ShadowTextureKind } from "./ShadowPass";
export { ShadowProjectionBuilder } from "./ShadowProjection";
export type { ShadowProjection, ShadowProjectionOptions, Vec3Tuple } from "./ShadowProjection";
export { BloomPass, DepthVisualizationPass, FXAAPass, ToneMappingPass, applyToneMappingPreset, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, computeAutoExposureFromHistogram, computeExposureHistogramFromPixels, createDepthTextureBinding, createToneMappingCalibration, depthTextureStats, depthOfFieldPixels, filmGrainPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, toneMappingPresets, volumetricLightPixels, resolveToneMappingPreset, visualizeDepthTexture } from "./PostProcessPass";
export type { AutoExposureOptions, AutoExposureResult, BloomOptions, BloomPassOptions, BloomResult, ChromaticAberrationOptions, ChromaticAberrationResult, ColorGradeOptions, ColorGradeResult, ContactShadowPostProcessOptions, ContactShadowPostProcessResult, DepthTextureBinding, DepthTextureFormat, DepthTextureStats, DepthVisualizationPassOptions, DepthVisualizationResult, DepthOfFieldOptions, DepthOfFieldResult, FilmGrainOptions, FilmGrainResult, FXAAOptions, FXAAPassOptions, FXAAResult, HdrToneMappingResult, ExposureHistogram, ExposureHistogramOptions, MotionBlurOptions, MotionBlurResult, OutlineOptions, OutlineResult, PostProcessColorSpace, SSAOOptions, SSAOResult, SSROptions, SSRResult, TAAOptions, TAAResult, ToneMappingCalibration, ToneMappingCalibrationSample, ToneMappingOperator, ToneMappingOptions, ToneMappingPassOptions, ToneMappingPreset, ToneMappingPresetName, ToneMappingPresetResult, ToneMappingResult, VolumetricLightOptions, VolumetricLightResult } from "./PostProcessPass";
export { architecturalMaterialCatalogSummary, architecturalMaterialDescriptor, createArchitecturalMaterial, createArchitecturalMaterialCatalog } from "./MaterialPresets";
export type { ArchitecturalMaterialCatalogSummary, ArchitecturalMaterialCategory, ArchitecturalMaterialDescriptor } from "./MaterialPresets";
export { createArchitecturalLightingState } from "./ArchitecturalLighting";
export type { ArchitectureInteriorLight, ArchitecturalLightingState, ArchitecturalLightingOptions, ArchitectureLightingPreset, ArchitectureLightKind, ArchitectureRgb, ArchitectureVector3 } from "./ArchitecturalLighting";
export { createArchitecturalMeasurementSet } from "./ArchitecturalMeasurement";
export type { ArchitecturalMeasurementSet, ArchitecturalMeasurementOptions, ArchitecturalMeasurementResult, ArchitecturalMeasurementType, ArchitecturalMeasurementUnit, ArchitecturalPoint3 } from "./ArchitecturalMeasurement";
export { createProceduralTexture, createProceduralTextureFixture, createProceduralTextureFixtureManifest, hashRgba8, normalFromHeightMap, proceduralTextureFixtureKinds } from "./ProceduralTexture";
export type { ProceduralTextureFixture, ProceduralTextureFixtureKind, ProceduralTextureFixtureOptions } from "./ProceduralTexture";
export { createProductTurntableFixture, createProductTurntableRenderKit } from "./ProductTurntable";
export type { ProductTurntableBatchTaskKind, ProductTurntableCaptureFormat, ProductTurntableCapturePlan, ProductTurntableDirection, ProductTurntableFixture, ProductTurntableFixtureOptions, ProductTurntableHotspot, ProductTurntableLighting, ProductTurntableLightingPreset, ProductTurntableRenderKit, ProductTurntableRenderKitOptions } from "./ProductTurntable";
export { createCanonicalProductSceneRenderKit } from "./CanonicalProductScene";
export type { CanonicalProductSceneFixture, CanonicalProductSceneRenderKit } from "./CanonicalProductScene";
export { createLightingDefault } from "./LightingDefaults";
export type { LightingDefault, LightingDefaultPreset } from "./LightingDefaults";
export { auditPrimitiveSubmission, formatPrimitiveSubmissionAudit } from "./PrimitiveSubmissionAudit";
export type { PrimitiveFrustumVerdict, PrimitiveSubmissionAudit, PrimitiveSubmissionAuditOptions, PrimitiveSubmissionBlocker, PrimitiveSubmissionRecord } from "./PrimitiveSubmissionAudit";
export { arenaShowdown, cinematicNight, createLightingRig, listLightingRigPresets, productHero, resolveSubjectRimPlacement } from "./LightingRig";
export type { LightingRig, LightingRigDiagnostics, LightingRigSubject, SubjectRimPlacement, SubjectRimPlacementOptions, LightingRigLightDescriptor, LightingRigOptions, LightingRigPreset, LightingRigUnsupportedFeature } from "./LightingRig";
export { createTerrainHeightfieldFixture, createTerrainHeightfieldGeometry, sampleTerrainHeightfield } from "./TerrainHeightfield";
export type { TerrainFixtureBiome, TerrainHeightfieldColliderDescriptor, TerrainHeightfieldFixture, TerrainHeightfieldFixtureOptions, TerrainHeightfieldGeometry, TerrainHeightfieldGeometryOptions, TerrainHeightfieldSample } from "./TerrainHeightfield";
export { createWeatherState } from "./Weather";
export type { WeatherOptions, WeatherState, WeatherType, WeatherPuddlePatch, WeatherVisualDrop } from "./Weather";
export { sampleVegetationFixture } from "./VegetationScatter";
export type { VegetationFixtureInstance, VegetationFixtureLayer, VegetationFixtureLod, VegetationFixtureOptions, VegetationFixtureSample, VegetationLSystemBranchSegment, VegetationLSystemFixture } from "./VegetationScatter";
export { createVoxelWorld } from "./VoxelWorld";
export type { VoxelBlockDescriptor, VoxelBlockType, VoxelLod, VoxelWorldOptions, VoxelVisibleBlock, VoxelWorldState } from "./VoxelWorld";
export { sampleOceanFixture } from "./OceanSurface";
export { createDayNightSky, sampleCloudNoise, DAY_NIGHT_SKY_CLAIM_BOUNDARY } from "./DayNightSky";
export type { DayNightSkyCloudCell, DayNightSkyDisc, DayNightSkyOptions, DayNightSkyStar, DayNightSkyState } from "./DayNightSky";
export { applyWetnessToColor, applyWetnessToRoughness, describeWetMaterial, sampleLightningFlash, samplePuddleMask } from "./AtmosphereWetness";
export type { LightningFlashSample, WetnessMaterialResponse, WetnessProbe } from "./AtmosphereWetness";
export { createWaterSurface, WATER_SURFACE_CLAIM_BOUNDARY, WATER_SURFACE_PLANAR_DEPENDENCY } from "./WaterSurface";
export type { WaterDepthBand, WaterFoamMask, WaterSurfaceBoat, WaterSurfaceOptions, WaterSurfacePreset, WaterSurfaceState, WaterWakeSegment } from "./WaterSurface";
export { WaterReflectionRefractionCapture } from "./OceanSurface";
export type { OceanBuoyancySample, OceanFixtureOptions, OceanFixturePreset, OceanFixtureSample, OceanFoamPatch, OceanWaveDescriptor, OceanWaveSample, WaterCaptureFrame, WaterReflectionRefractionOptions, WaterReflectionRefractionResult, WaterReflectionSceneRenderer, WaterRefractionSceneRenderer } from "./OceanSurface";
export { createSpaceEnvironment } from "./SpaceEnvironment";
export type { SpaceEnvironmentDustParticle, SpaceEnvironmentState, SpaceEnvironmentNebula, SpaceEnvironmentStar } from "./SpaceEnvironment";
export { LightingDebug } from "./LightingDebug";
export type { DebugLine } from "./LightingDebug";
export { CascadedShadowMaps, CascadedShadowPass, supportsCascadedShadowLight } from "./CascadedShadowMaps";
export type { CascadedShadowMapsOptions, CascadedShadowPassOptions, CascadedShadowPassResult, CascadeShadowPassResult, CascadeSplit, CascadeSplitOptions, ShadowCascade } from "./CascadedShadowMaps";
export { DEFAULT_RENDERER_AUTO_FRAME_OPTIONS, DEFAULT_RENDERER_DIRECT_LIGHTING, DEFAULT_RENDERER_ENVIRONMENT_LIGHTING, Renderer } from "./Renderer";
export { pickSceneRenderableHits, pickSceneRenderables } from "./Renderer";
export type { CameraLike, RendererAnimationLoop, RendererCameraFrameOptions, RendererCameraPolicy, RendererCameraProjection, RendererFrameCapture, RendererFrameCaptureDiagnosticsSummary, RendererFrameCaptureMetadata, RendererFrameCapturePixelDigest, RendererFrameCapturePixelStats, RendererFrameCaptureRenderSize, RendererFrameCaptureWithMetadata, RendererAppliedOutput, RendererInput, RendererRect, RendererView, RendererOptions, RendererOutputOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessChainCostEstimate, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlannedVsActual, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
export { assertRendererFeatures, createRendererFeatureReport, rendererFeatureCatalog } from "./RendererFeatureGates";
export type { RendererFeature, RendererFeatureReport, RendererFeatureStatus } from "./RendererFeatureGates";
export { createExternalParityEnvironmentLighting, createExternalParityDirectionalShadowEvidence, createExternalParityFlagshipRenderPresetEvidence, createExternalParityGeneratedEnvironmentMapSource, createExternalParityGeneratedHdrEnvironmentMapSource, createExternalParityRenderPresetEvidence, sampleExternalParityLdrPostprocessReadback, externalParityActiveFeature, externalParityBlockedFeature, externalParityUnsupportedFeature } from "./ExternalParityRenderPreset";
export { AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK, applyPresetPackExposure, meanLinearLuma } from "./EnvironmentPresetPack";
export type { EnvironmentPresetPack, EnvironmentPresetPackEntry, EnvironmentPresetPackSlot } from "./EnvironmentPresetPack";
export type { ExternalParityEnvironmentLightingBundle, ExternalParityEnvironmentPreset, ExternalParityDirectionalShadowEvidence, ExternalParityLdrPostprocessSummary, ExternalParityReadbackDevice, ExternalParityRenderPresetEvidence, ExternalParityRenderPresetEvidenceOptions, ExternalParityRenderPresetFeature, ExternalParityRenderPresetFeatureStatus } from "./ExternalParityRenderPreset";
export { PBR_REFERENCE_EPSILON, PBR_REFERENCE_INV_PI, PBR_REFERENCE_MIN_ROUGHNESS, PBR_REFERENCE_PI, pbrAnisotropicDistribution, pbrCausticsConformanceSuite, pbrCausticsTransmissionResponse, pbrCharlieSheen, pbrDiffuseBurley, pbrDirectLight, pbrDistributionGgx, pbrEncodeOutput, pbrEnvironmentFogFactor, pbrEnvironmentLight, pbrEnvironmentLightSplitSum, pbrF0, pbrFresnelSchlick, pbrFresnelSchlickRoughness, pbrFresnelSchlickRoughnessSpecular, pbrFresnelSchlickSpecular, pbrGeometrySmithGgxCorrelated, pbrIridescenceColor, pbrLinearToSrgbChannel, pbrPhotometricConformanceSuite, pbrReferenceFinite, pbrReferenceLuminance, pbrSaturate, pbrTransmissionVolumeConformanceSuite, pbrTransmissionVolumeResponse } from "./PbrReference";
export type { PbrDirectLightInput, PbrEnvironmentLightInput, PbrCausticsConformanceReport, PbrCausticsTransmissionInput, PbrCausticsTransmissionResponse, PbrFogFactorInput, PbrPhotometricConformanceCategory, PbrPhotometricConformanceCheck, PbrPhotometricConformanceReport, PbrPhotometricConformanceSample, PbrSplitSumEnvironmentInput, PbrTransmissionVolumeConformanceReport, PbrTransmissionVolumeInput, PbrTransmissionVolumeResponse, Vec3 } from "./PbrReference";
export { createProjectedDecalGeometry, createRaycastProjectedDecalGeometry } from "./production-runtime/geometry/ProjectedDecalGeometry";
export type { ProjectedDecalBox, ProjectedDecalRaycastOptions, ProjectedDecalTriangleMesh } from "./production-runtime/geometry/ProjectedDecalGeometry";
export { CubeCameraReflectionCapture } from "./ReflectionProbe.js";
export { createReflectionSurface } from "./ReflectionSurfaces.js";
export { createParticle } from "./effects/Particle.js";
export type { Particle } from "./effects/Particle.js";
export { ParticleEmitter } from "./effects/ParticleEmitter.js";
export type { ParticleModule, ParticleUpdateContext } from "./effects/ParticleModule.js";
export { VelocityModule } from "./effects/VelocityModule.js";
export { ColorModule } from "./effects/ColorModule.js";
export { SizeModule } from "./effects/SizeModule.js";
export { ForceModule, WindModule } from "./effects/ForceModule.js";
export { CollisionModule } from "./effects/CollisionModule.js";
export { TrailModule, buildTrailRibbon, decodeTrailRingBuffer, encodeTrailCaptureDepth } from "./effects/TrailModule.js";
export type { TrailPoint } from "./effects/TrailModule.js";
export { TurbulenceModule, createCurlNoiseLUT, sampleCurlNoiseLUT } from "./effects/TurbulenceModule.js";
export { HeightfieldModule, HeightfieldSampler, createSineHeightfield, resolveHeightfieldContact } from "./effects/HeightfieldModule.js";
export { LightingModule, computeLitParticleColor } from "./effects/LightingModule.js";
export { SubEmitterModule } from "./effects/SubEmitterModule.js";
export { ParticleRenderer, SOFT_PARTICLE_WGSL, computeSoftParticleFade } from "./effects/ParticleRenderer.js";
export type { ParticleRenderBatch, ParticleSortMode } from "./effects/ParticleRenderer.js";
export { ParticleRenderPass } from "./effects/ParticleRenderPass.js";
export { GPU_PARTICLE_EFFECT_HEIGHTFIELD, GPU_PARTICLE_EFFECT_LIFE_CURVES, GPU_PARTICLE_EFFECT_LIGHTING, GPU_PARTICLE_EFFECT_PLANES, GPU_PARTICLE_EFFECT_SIZE_CURVES, GPU_PARTICLE_EFFECT_SUB_EMITTERS, GPU_PARTICLE_EFFECT_TRAILS, GPU_PARTICLE_EFFECT_TURBULENCE, GPU_PARTICLE_EFFECT_WIND, GPU_PARTICLE_UNIFORM_BYTE_LENGTH, UnsupportedGPUParticleBackend, WebGPUParticleBackend, createBaseAttributeSnapshot, createEffectsParticleComputeShader, createTrailRingInit, encodeGPUParticleEffects, queryGPUParticleBackendCapabilities } from "./effects/GPUParticleBackend.js";
export type { GPUParticleBackend, GPUParticleEffectsInput, GPUParticleSpawnInput, GPUParticleUpdateInput } from "./effects/GPUParticleBackend.js";
export { ParticleSystem, collectGPUParticleEffects } from "./effects/ParticleSystem.js";
export { createParticleEffectPreset } from "./effects/ParticleEffectPresets.js";
export { createLayeredParticleBudgetPlan, createParticleBatchDiagnostics, summarizeParticleBatchDiagnostics } from "./effects/ParticleDiagnostics.js";
export { ANIMATION_TOON_SHADER_MARKER, ANIMATION_TOON_SHADER_NAME, AnimationToonMaterial, applyAnimationRenderPreset, createAnimationMaterialStyle, createAnimationRenderPreset, createAnimationVisualQualityReport, quantizeToonBand, toonDiffuseRamp, toonRimTerm, toonShadeColor } from "./animation/index.js";
export type { AnimationFrameVisualInput, AnimationFrameVisualQuality, AnimationMaterialStyle, AnimationMaterialStyleOptions, AnimationRenderPresetEvidence, AnimationRenderPresetOptions, AnimationVisualQualityOptions, AnimationVisualQualityReport } from "./animation/index.js";
export { RESIDENT_PARTICLE_CAMERA, ResidentGPUParticleRenderer, residentLifecycleShader } from "./effects/ResidentGPUParticleRenderer.js";
export type { ResidentGPUParticleOptions, ResidentParticleCPUPhases, ResidentParticleFrame, ResidentParticlePacingControl } from "./effects/ResidentGPUParticleRenderer.js";
export * from "./contracts/index.js";
export * from "./lanes/index.js";
export { geometryContentKey, materialSpecKey, materialKeyExcludesParameter, REASONS_NOT_BATCHED, planBatches, BatchedGeometryPool, DRAW_DATA_TEXELS_PER_DRAW, DRAW_DATA_VISIBLE_BIT, DRAW_DATA_GEOMETRY_ID_SHIFT, DrawDataTexture, drawDataBindingFor, packDrawDataFlags, unpackDrawDataFlags, buildMultiDrawBatch, multiDrawCommands, refreshMultiDrawBatch, synthesizeMultiDrawItems, submitMultiDrawBatch, PRD11_DRAWID_CHUNK, PRD11_DRAWID_DEPTH_FEATURE, PRD11_DRAWID_FEATURE, registerPrd11DrawIdShader, PRD11_INSTANCE_EMISSIVE_FEATURE, PRD11_INSTANCE_EMISSIVE_FRAG_CHUNK, PRD11_INSTANCE_EMISSIVE_VTX_CHUNK, registerPrd11InstanceEmissiveShader } from "./batching/index.js";
export type { BatchPlan, InstancedBatch, InstancedBatchChunk, MultiDrawGroup, NotBatchedReason, PlanBatchesOptions, PackedGeometryEntry, DrawDataEntry, MultiDrawBatch, PackedDrawCommand, Prd11MultiDrawItem, SynthesizeMultiDrawItemsOptions } from "./batching/index.js";
export { createDecalGeometry } from "./DecalGeometry.js";
export type { DecalBasis, DecalBox, DecalGeometryResult, DecalRay, DecalRaycastHit, DecalRaycastOptions, DecalRaycastResult, DecalShape, DecalTriangleMesh } from "./DecalGeometry.js";
export { createMatrixInstanceAttribute } from "./Instancing.js";
export { Raycaster } from "./Raycaster.js";
export { createReflectionProbe } from "./ReflectionProbe.js";
export { createReflectiveFloorSurface, listReflectionSurfaceKinds } from "./ReflectionSurfaces.js";
export { ResourceLifecycle } from "./ResourceLifecycle.js";
export { createSpriteQuadGeometry } from "./SpriteGeometry.js";
export { UniformBinder } from "./UniformBinder.js";
export { ANIMATION_TOON_FRAGMENT_SOURCE, ANIMATION_TOON_MAX_BANDS, ANIMATION_TOON_MIN_BANDS, ANIMATION_TOON_VERTEX_SOURCE, registerAnimationToonShader } from "./animation/AnimationToonMaterial.js";
export { defaultAnimationVisualQualityThresholds } from "./animation/AnimationVisualQuality.js";
export { createCinematicBloomPass } from "./cinematic/BloomPass.js";
export { createCinematicDepthHazePass } from "./cinematic/DepthHazePass.js";
export { createCinematicFilmGrainPass } from "./cinematic/FilmGrainPass.js";
export { createCinematicVignettePass } from "./cinematic/VignettePass.js";
export { gravityForce } from "./effects/ForceModule.js";
export { createGPUParticleBackend, detectGPUParticleBackend } from "./effects/GPUParticleBackend.js";
export { addScaledVector3, cloneColor, cloneVector3, createColor, createVector3, normalizedParticleAge, setVector3 } from "./effects/Particle.js";
export { applyParticleModules } from "./effects/ParticleModule.js";
export { constantVelocity } from "./effects/VelocityModule.js";
export { cullStaticItems } from "./performance/FrustumCuller.js";
export { createFlatOctree } from "./performance/Octree.js";
export { raycastProjectedDecalMesh } from "./production-runtime/geometry/ProjectedDecalGeometry.js";
export type { WebGPUParticleBackendOptions } from "./webgpu/WebGPUCompute.js";
export type { WideLineSegment } from "./Geometry.js";
export type { InstanceAttributePlan } from "./Instancing.js";
export type { ColorWriteMask, PolygonOffsetState, ScissorRect, StencilCompare, StencilOperation, StencilState } from "./Material.js";
export type { RaycastHit, RaycastTarget } from "./Raycaster.js";
export type { CubeCameraReflectionCaptureOptions, CubeCameraReflectionCaptureResult, CubeCameraReflectionFace, CubeCameraReflectionFaceRenderer, ReflectionProbe } from "./ReflectionProbe.js";
export type { ReflectionSurface, ReflectionSurfaceKind, ReflectionSurfaceOptions, ReflectionSurfaceReport, ReflectionSurfaceSupportStatus } from "./ReflectionSurfaces.js";
export type { AnimationMaterialTreatment } from "./MaterialPresets.js";
export type { AnimationToonMaterialOptions, AnimationToonShaderRegistrar, ToonShadeInputs } from "./animation/AnimationToonMaterial.js";
export type { AnimationRenderPresetLightingDescriptor, ApplyAnimationRenderPresetFrame, ApplyAnimationRenderPresetOptions, ApplyAnimationRenderPresetResult } from "./animation/applyAnimationRenderPreset.js";
export type { CinematicBloomPass } from "./cinematic/BloomPass.js";
export type { CinematicDepthCompositionPlan } from "./cinematic/CinematicDepthComposition.js";
export type { CinematicDomOverlayRejection } from "./cinematic/CinematicEvidence.js";
export type { CinematicLightRole, CinematicLightType, CinematicLightingRig, CinematicLightingRigId } from "./cinematic/CinematicLightingRig.js";
export type { CinematicMaterialPreset, CinematicMaterialPresetId } from "./MaterialPresets.js";
export type { CinematicColorGradePreset, CinematicPostProcessStack } from "./cinematic/CinematicPostProcess.js";
export type { CinematicDepthHazePass } from "./cinematic/DepthHazePass.js";
export type { CinematicEmissivePractical, CinematicEmissivePracticalLightSystem } from "./cinematic/EmissivePracticalLightSystem.js";
export type { CinematicFilmGrainPass } from "./cinematic/FilmGrainPass.js";
export type { CinematicFogVolumeSystem } from "./cinematic/FogVolumeSystem.js";
export type { CinematicGlowCard, CinematicGlowCardSystem } from "./cinematic/GlowCardSystem.js";
export type { CinematicRainParticleSystem } from "./cinematic/RainParticleSystem.js";
export type { CinematicVignettePass } from "./cinematic/VignettePass.js";
export type { CinematicWetReflectionApproximation } from "./cinematic/WetReflectionApproximation.js";
export type { CollisionPlane } from "./effects/CollisionModule.js";
export type { ColorKeyframe } from "./effects/ColorModule.js";
export type { GPUParticleBackendCapabilities, GPUParticleSpawnResult, GPUParticleUpdateResult } from "./effects/GPUParticleBackend.js";
export type { ColorLike, ParticleInitialState, Vector3Like } from "./effects/Particle.js";
export type { LayeredParticleBudgetOptions, LayeredParticleBudgetPlan, ParticleBatchDiagnostics, ParticleBatchDiagnosticsInput, ParticleBatchDiagnosticsOptions, ParticleDensityTier, ParticleLayerBudget, ParticleLayerBudgetInput } from "./effects/ParticleDiagnostics.js";
export type { ParticleEffectPresetName, ParticleEffectPresetOptions } from "./effects/ParticleEffectPresets.js";
export type { EmissionResult, ParticleBurst, ParticleEmitterOptions, ParticleEmitterShape } from "./effects/ParticleEmitter.js";
export type { ParticleRenderPassOptions, ParticleRenderPassUpdateMode, ParticleRenderPassUpdateOptions } from "./effects/ParticleRenderPass.js";
export type { ParticleBatchBounds, ParticleDrawTarget, ParticleRenderOptions, ParticleSprite } from "./effects/ParticleRenderer.js";
export type { ParticleSystemOptions, ParticleSystemStats } from "./effects/ParticleSystem.js";
export type { SizeKeyframe } from "./effects/SizeModule.js";
export type { TrailModuleOptions } from "./effects/TrailModule.js";
export type { VectorKeyframe } from "./effects/VelocityModule.js";
export type { OctreeNode } from "./performance/Octree.js";
export { COMPUTE_BUFFER_USAGE, ComputeBuffer, ComputeContext, ComputeError, ComputeLimits, ComputePipeline, createComputeContext } from "./compute/index.js";
export type { ComputeBindingSpec, ComputeBindingType, ComputeBufferSpec, ComputeBufferUsage, ComputeDispatchInput, ComputeDispatchResult, ComputeErrorCode, ComputeGPUBufferLike, ComputeGPUDeviceLike, ComputePipelineSpec, ComputeWorkgroups, ComputeWorkgroupSize } from "./compute/index.js";
export type { ProjectedDecalBasis, ProjectedDecalGeometryResult, ProjectedDecalRay, ProjectedDecalRaycastHit, ProjectedDecalRaycastResult, ProjectedDecalShape } from "./production-runtime/geometry/ProjectedDecalGeometry.js";
export { QUALITY_MODES, directPathItemBlockers, isQualityMode, resolveRenderPath, withDirectPath } from "./quality/DirectPath.js";
export type { AuraQualityMode, AuraRenderPath, DirectPathItemLike, RenderPathDecision, RenderPathInput } from "./quality/DirectPath.js";
export { FUSED_2D_BLOOM_FUSION, SEPARABLE_BLOOM_FUSION, bloomLevelBlursIn2d, resolveBloomFusionConfig } from "./webgl2/BloomFusion.js";
export type { BloomFusionConfig } from "./webgl2/BloomFusion.js";
```

## @aura3d/rendering/extension-scalar-atlas

- Version: `4.6.1`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/extension-scalar-atlas.ts`

### Export Declarations

```ts
export { EXTENSION_SCALAR_ATLAS_SLOTS, createExtensionScalarAtlas } from "./ExtensionScalarAtlas";
export type { ExtensionScalarAtlas, ExtensionScalarAtlasSlot, ExtensionScalarPixels } from "./ExtensionScalarAtlas";
```

## @aura3d/rendering/reflection-surfaces

- Version: `4.6.1`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/reflection-surfaces.ts`

### Export Declarations

```ts
export { ScreenSpaceReflectionPass, invertSsrProjection } from "./ScreenSpaceReflectionPass";
export type { ReflectionSurfaceSsrInputs, ReflectionSurfaceSsrResult } from "./ScreenSpaceReflectionPass";
export { createReflectionSurface, createReflectiveFloorSurface, listReflectionSurfaceKinds, } from "./ReflectionSurfaces";
export type { ReflectionSurface, ReflectionSurfaceKind, ReflectionSurfaceOptions, ReflectionSurfaceReport, ReflectionSurfaceSupportStatus, } from "./ReflectionSurfaces";
```

## @aura3d/rendering/webgpu

- Version: `4.6.1`
- Package manifest: `packages/rendering/package.json`
- Public entrypoint: `packages/rendering/src/webgpu.ts`

### Export Declarations

```ts
export { WebGPUDevice } from "./WebGPUDevice";
export type { WebGPUAdapterLike, WebGPUBufferDescriptorLike, WebGPUBufferLike, WebGPUDeviceLike, WebGPUDeviceOptions, WebGPULike, WebGPUQueueLike, WebGPUSamplerDescriptorLike } from "./WebGPUDevice";
export { normalizeWebGPUTemporalOptions, WEBGPU_TAA_FRAGMENT, WEBGPU_TAA_OUTPUT_FRAGMENT } from "./webgpu/WebGPUTemporal";
export type { WebGPUTemporalInputs } from "./webgpu/WebGPUTemporal";
export { defaultWebGPUBloomWeights, normalizeWebGPUColorGradeOptions, normalizeWebGPUBloomOptions, normalizeWebGPUBloomQuality, webgpuBloomCompositeFragment, webgpuBlurFragment, webgpuBrightExtractFragment, webgpuColorGradeFragment, webgpuFxaaFragment, webgpuSoftKneeWeight, WEBGPU_BLOOM_MAX_MIPS, WEBGPU_BLOOM_QUALITY_TABLE, WEBGPU_POST_VERTEX_WGSL, } from "./webgpu/WebGPUPostShaders";
export type { NormalizedWebGPUColorGrade, NormalizedWebGPUBloom, WebGPUBloomDiagnostics, WebGPUBloomOptions, WebGPUBloomQuality, WebGPUColorGradeOptions, WebGPUCompositeParams, WebGPUFxaaOptions, } from "./webgpu/WebGPUPostShaders";
export { WebGPUPipelineCache } from "./webgpu/WebGPUPipelineCache";
export { Texture } from "./Texture";
```

## @aura3d/scene

- Version: `4.6.1`
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
export * from "./RectAreaLight.js";
export * from "./Layers.js";
export * from "./Lights.js";
export * from "./Renderable.js";
export * from "./SceneQuery.js";
export * from "./SceneMetadata.js";
export * from "./Scene.js";
export * from "./SceneSerializer.js";
```

## @aura3d/scripting

- Version: `4.6.1`
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
export type { VisualAnimationControllerState, VisualAnimationEvent, VisualCameraState, VisualCollisionEvent, VisualCombatEvent, VisualAiPlanner, VisualAiSnapshot, VisualGameScoreState, VisualGraphDiagnostic, VisualGraphExecutionContext, VisualGraphSideEffect, VisualGraphValidationOptions, VisualObjectiveState, VisualStateMachineState, VisualTimerState, VisualInputSet, VisualInputSnapshot, VisualOverlapResult, VisualPhysicsBodyState, VisualRaycastHit, VisualRuntimeNodeState, VisualStateCollection, VisualVector3 } from "./VisualGraphContext";
export { createVisualNode, getVisualNodeDefinition, listVisualNodeDefinitions } from "./VisualNodeCatalog";
export type { VisualNodeCategory, VisualNodeDefinition } from "./VisualNodeCatalog";
export { applyVisualGameplaySideEffects, attachVisualScriptingGraph, createVisualGameplayState, createVisualNodeForGraph, createVisualScriptingGraph, listVisualScriptingNodeCatalog, roundTripVisualScriptingGraph, serializeVisualNodeCatalog } from "./VisualScriptingRoot";
export type { SerializedVisualNodeCatalog, SerializedVisualNodeCatalogEntry, VisualGameplayState, VisualGameplayTimer, VisualScriptingCatalogGroup, VisualScriptingGraphHandle, VisualScriptingGraphSpec, VisualScriptingRoundTrip } from "./VisualScriptingRoot";
export { animationNodeCategories } from "./AnimationNodeCategories";
export type { AnimationNodeCategory } from "./AnimationNodeCategories";
export { animationVisualNodeDefinitions } from "./AnimationVisualNodes";
export { validateNode } from "./VisualNode";
export type { VisualNode, VisualPort, VisualPortDirection, VisualPortType } from "./VisualNode";
```

## @aura3d/workflows

- Version: `4.6.1`
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

---

## Three.js parity surface

**Status legend.** This appendix is hand-maintained for the parity workstream
and appended verbatim by `tools/api-docs` — edit this file, then regenerate
with `pnpm exec tsx --tsconfig tsconfig.base.json tools/api-docs/index.ts --write`.
Verdicts: **LIVE** — a real value export on the named surface today, verified
against the source barrels and exercised by a `tests/unit/parity/*` fixture —
and **NOT YET** — the remaining gaps, listed in "Not yet" below.
Lane-by-lane verdicts live in `docs/workflows/threejs-parity-gaps.md`; the
fixture suite lives in `tests/unit/parity/` (each file header names the parity
IDs it covers).

Unless a row names another surface, exports resolve from the published
`@aura3d/engine` "." barrel (`packages/engine/src/public/index.ts`). Math,
audio, and animation parity ship from their own packages: `@aura3d/math`,
`@aura3d/audio`, `@aura3d/animation`.

### Math breadth — SM-01/03/04, AD-14 (lane L3 — LIVE)

```ts
// @aura3d/math
Vector2, Vector3, Vector4, Matrix3, Matrix4, Quaternion, Color,
Ray, Plane, Sphere, Box3, Frustum, Line3, Triangle,
Spherical, Cylindrical, SphericalHarmonics3, OBB, Capsule,
ConvexHull, Octree, ShapeUtils, Transform, Interpolation, Easing, Random
MathUtils                                   // namespace export; the
  // non-colliding helpers are also top-level: generateUUID, euclideanModulo,
  // mapLinear, damp, pingpong, smootherstep, randInt, randFloat,
  // randFloatSpread, seededRandom, degToRad, radToDeg, isPowerOfTwo,
  // ceilPowerOfTwo, floorPowerOfTwo
Euler — all six orders: "XYZ" | "YXZ" | "ZXY" | "ZYX" | "YZX" | "XZY"
Color.setHSL / getHSL / offsetHSL / lerpHSL
```

Fixture: `tests/unit/parity/math.test.ts`.

### Curve family — SM-02 (lane L3 — LIVE)

```ts
// @aura3d/math — real classes (Curves.ts), not a facade namespace.
abstract class Curve<V>          // CurveBase: getPoint / getPointAt /
                                 //   getTangent / getTangentAt / getLength /
                                 //   getLengths / getUtoTmapping /
                                 //   updateArcLengths / getPoints /
                                 //   getSpacedPoints / computeFrenetFrames
CatmullRomCurve3(points, closed?, curveType?, tension?)
CubicBezierCurve3, QuadraticBezierCurve3, LineCurve3
LineCurve, QuadraticBezierCurve, CubicBezierCurve, SplineCurve   // 2D
EllipseCurve, ArcCurve                          // ArcCurve extends EllipseCurve
CurvePath<V>   // closePath, getCurveLengths, cacheLengths
Path           // moveTo, lineTo, quadraticCurveTo, bezierCurveTo,
               // splineThru, arc/absarc, ellipse/absellipse, setFromPoints
Shape extends Path                            // holes, getPointsHoles
```

`primitives.tube`/`extrude`/`lathe`/`shape` consume frozen `Curve`/`Shape`
instances through `options.params.path` / `.points` / `.shape`.
Fixture: `tests/unit/parity/curves.test.ts`.

### Textures — ST-01/02/03/05/06/07, AD-03 (lane L4 — LIVE)

```ts
// @aura3d/engine — `texture` namespace + `TextureHandle` are "." exports.
texture.load(url, options?: AuraTextureLoadOptions): Promise<TextureHandle>
texture.data({ width, height, data, format?, colorSpace? })
texture.canvas({ canvas, colorSpace?, flipY? })
texture.video({ video, colorSpace? })
texture.compressed({ mipmaps: [{ data, width, height }], format })
texture.depth({ width, height })
texture.cube({ faces, colorSpace? })
texture.dataArray({ width, height, depth, data, format? })

class TextureHandle implements AuraTextureRef
  // live, mutable write-through fields: wrapS, wrapT, repeat, offset,
  // rotation, center, anisotropy, minFilter, magFilter, generateMipmaps,
  // colorSpace, flipY, needsUpdate; plus dispose()
```

`texture.load` routes through `@aura3d/assets` and decodes `.exr` (AD-03);
per-item progress/failures surface via `createAuraApp({ onAssetProgress,
onAssetError })` (ST-06). `AuraTextureRef` and every `AuraTexture*Options`
type are exported from ".". GLTF decoder plumbing (draco/ktx2/meshopt) is
covered by ST-05.
Fixtures: `tests/unit/parity/texture.test.ts`, `exr.test.ts`,
`gltf-decoders.test.ts`.

### Lines, points, sprites, helpers — SG-06/07/08, AD-08, SC-03 (lane L6 — LIVE)

```ts
// @aura3d/engine — scene-node factories returning AuraNodeBuilder
// (.runtime({ id }) binds a live AuraRuntimeNodeHandle).
lines.line({ points|positions, colors?, material?, dashed?, dashSize?,
             gapSize?, dashOffset?, ...transforms })
lines.loop({...})  lines.segments({...})
lines.fat({ ...lineOptions, width?, worldUnits? })   // instanced ribbon mesh;
                                                     // worldUnits ⨯ dashed
// top-level aliases: line, loop, segments, fat
computeLineDistances(positions, "line" | "loop" | "segments")  // AD-08

points({ points|positions, colors?, size?, sizeAttenuation?, map?,
         alphaTest?, transparent?, material?, ...transforms })  // SG-07

sprites.sprite({ map?, center?, rotation?, sizeAttenuation?, color? })  // SG-08
// `sprite` is also a top-level export; `sprites` = { sprite }

helpers.axes / grid / polarGrid / box / box3 / arrow / camera /
        directionalLight / spotLight / pointLight / skeleton      // SC-03 —
        // each emits a real line-segment node builder
```

Fixture: `tests/unit/parity/lines.test.ts`.

### Instancing and batching — SG-01/02 (lane L5 — LIVE)

```ts
// @aura3d/engine
instances.mesh(geometry, material, count): AuraInstancedMeshHandle
  // geometry: @aura3d/rendering Geometry | builtin primitive name |
  //           AuraCustomGeometrySpec
  // handle: setMatrixAt / getMatrixAt / setColorAt / getColorAt / count /
  //         capacity / needsUpdate / instanceMatrix / instanceColor /
  //         computeBoundingSphere / computeBoundingBox / dispose
instances.box / sphere / plane / cylinder / capsule / torus / cone / circle /
          ring / tube / lathe / extrude / shape / torusKnot / polyhedron /
          roundedBox / model / custom    // pre-existing factories — the L2
                                         // kinds share primitives.* params

batched.mesh({ maxInstances, maxVertices?, maxIndices?, material?,
               multiDraw?: "auto" | "multi-draw" | "loop" | "instanced",
               name?, geometries? }): AuraBatchedMeshHandle
  // handle: addGeometry(geo) → geometryId, addInstance(geometryId) → index,
  //         setMatrixAt / getMatrixAt / setColorAt / getColorAt /
  //         setVisibleAt / deleteInstance / count / needsUpdate /
  //         computeBoundingSphere
```

The `batched.mesh` API and dense store are live today — `"auto"` packs a
multi-draw where the generated path supports it and falls back to
per-geometry instancing otherwise. Promotion of the SG-02 row to ● stays
probe-gated on P-2 (see "Not yet").
Fixture: `tests/unit/parity/instancing.test.ts`.

### Surfaces, cameras, scene backgrounds — SC-01, AD-15, SG-10 (lane L7 — LIVE)

```ts
// @aura3d/engine
surfaces.mirror({ name?, size?, resolution?, tint?, position?, runtime? })
  // horizontal Reflector plane at position[1]; captures via the renderer's
  // planar-reflection target
cameras.cube({ name?, resolution?, near?, far?, updateEvery?, position?,
               runtime? })
  // cube-camera node; rendered via Renderer.renderProbeFace once per
  // `updateEvery` frames — consume via material envMap: { cubeCamera: name }

scene().background(color | { texture, intensity?, rotation? } |
                   { cube: { faces: [6], intensity? } })          // SG-10 —
                   // color, image, or cubemap backdrop; never enables IBL
```

Fixture: `tests/unit/parity/runtime.test.ts`.

### Custom materials and shader passes — SH-02/03, SH-10 (lane L1 — LIVE)

```ts
// @aura3d/engine
material.custom({
  glsl: { vertex?, fragment },     // fragment required — WebGL2 is the live
                                   // backend; a WGSL-only spec fails validate
  wgsl?: { vertex?, fragment? },   // used only on the WebGPU backend
  uniforms?, defines?, transparent?, depthWrite?, depthTest?,
  side?, blending?, fog?           // AuraCustomMaterialSpec
}): AuraMaterialSpec

effects.shaderPass({
  name?, glsl? | fragment?: { glsl?, wgsl? }, wgsl?,
  uniforms?,                                    // numeric uniforms by name
  inputs?: ("color" | "depth" | "velocity")[],
  insertAt?: "after-depth" | "before-taa" | "after-taa" |
             "before-tonemap" | "after-tonemap",     // v2 graph anchor
  order?: "before-bloom" | "after-bloom" | "before-tonemap" |
          "after-tonemap" | number,                  // named slot → anchor
  enabled?
}): AuraCustomPostPass

app.addPostPass(pass)                            // registers a custom pass
app.setPassUniform(passName, key, value)         // mutate without rebuild
handle.setUniform(name, value)                   // material.custom uniform
                                                 // write, no recompile

// @aura3d/engine/renderer
registerShaderChunk(name, glsl)    // SH-10 registry — resolves #include in
                                   // material.custom / effects.shaderPass
```

Fixtures: `tests/unit/parity/shader-material.test.ts`,
`shader-pass-order.test.ts`.

### Geometry breadth and authoring — SG-03/04/05 (lane L2 — LIVE)

```ts
// @aura3d/engine — AuraBuiltinPrimitive union is fully generated.
primitives.cone / circle / ring / tube / lathe / extrude / shape /
           torusKnot / polyhedron / roundedBox        // (options.params:
                                                     //  AuraPrimitiveParams)
geometry.dynamic(spec: AuraDynamicGeometrySpec)      // typed-array attributes;
  // validated + tagged so handle.setGeometry / updateAttribute rewrite the
  // live buffers in place (no realloc while vertex count is stable)
geometry.edges(source: AuraCustomGeometrySpec, thresholdAngle = 1)
  // three's EdgesGeometry → a "lines"-topology spec
geometry.wireframe(source: AuraCustomGeometrySpec)
  // three's WireframeGeometry → a "lines"-topology spec
geometry.merge(specs: readonly AuraCustomGeometrySpec[])
  // BufferGeometryUtils.mergeGeometries over specs
```

**Scatter planning and static merge (4.1.0, root exports, pure TypeScript).** Deterministic placement and baking
utilities extracted from the Crayon ports; full reference in `docs/api/scatter-merge.md`.

```ts
createScatterRandom(seed?: number): () => number
scatterAlongPath(options: AuraScatterAlongPathOptions): AuraScatterPoint[]
scatterInArea(options: AuraScatterInAreaOptions): AuraScatterPoint[]
splitScatterByDistance(points: readonly AuraScatterPoint[], origin: readonly [number, number], radii: readonly number[]): AuraScatterPoint[][]
scatterTransforms(points: readonly AuraScatterPoint[], options?: { kind?: number; baseScale?: number | AuraVec3 }): AuraTransformSpec[]
mergeStatic(parts: readonly AuraStaticPart[], options?: AuraMergeStaticOptions): AuraCustomGeometrySpec | undefined
mergeStaticByKey(parts: readonly (AuraStaticPart & { key: K })[], options?: AuraMergeStaticOptions): Map<K, AuraCustomGeometrySpec>
```

Built-in author chunks for `material.custom` (`#include <a3d_math>`, `<a3d_noise>`, `<a3d_sky>`, `<a3d_fog>`, `<a3d_triplanar>`, `<a3d_toon>`, `<a3d_shadow>`, `<colorspace_decode>`, `<colorspace_encode>`) are listed in [`glsl-chunks.md`](./glsl-chunks.md).


`geometry.toNonIndexed` does not exist as a public member — the equivalent
`auraGeometryToNonIndexed` helper is internal-only (parity-tested, but not
re-exported through either barrel). The public `geometry` namespace ships
`define / custom / dynamic / edges / wireframe / merge`.
Fixtures: `tests/unit/parity/geometry-counts.test.ts`,
`geometry-dynamic.test.ts`.

### Runtime surface — SG-09, SR-03/04/05/06/07, SH-05/06 (lane L7 — LIVE)

```ts
// @aura3d/engine — AuraRuntimeNodeHandle members (type exported from "."):
renderOrder: number                 // draw-order override, default 0
frustumCulled: boolean              // default true
layers: AuraLayerMask               // mask/set/enable/enableAll/disable/
                                    // disableAll/toggle/test/isEnabled
userData: Record<string, unknown>
traverse(cb)                        // depth-first, self included
getWorldPosition / getWorldQuaternion / getWorldScale
attach(child)                       // re-parent preserving world transform
setUniform(name, value)             // SH-02 write path
setGeometry(spec) / updateAttribute(name, { array, offset? })   // SG-05
morphTargetDictionary(): Record<string, number>                 // SA-05
// plus pre-existing morphInfluence / setMorphTarget(s)

// AuraApp members:
app.info: AuraRendererInfo          // render{calls,triangles,points,lines,
                                    // frame} + memory{geometries,textures,
                                    // renderTargets?,programs?} +
                                    // approximateGpuMemoryBytes?
app.setPixelRatio(ratio)            // applies on the next frame
app.setClearColor(color, alpha?)
app.precompile(snapshot?): Promise<{ compiledPrograms, durationMs }>

new Clock({ now?, autoStart? })     // SR-06 — getDelta / getElapsedTime /
                                    // start / stop / running / elapsedTime

raycast(input, options?)            // SR-03 — input is a world ray
  // { origin, direction, maxDistance? } or an NDC pick { camera, ndc };
  // options: targets? | nodes?, firstHitOnly?, recursive?, layers?,
  //          near?, far? → hits nearest-first (AABB targets)
raycastFirst(input, options?)       // nearest-hit shorthand

// SH-06 — @aura3d/engine/renderer: RenderTarget (type) +
renderer.render({ source, camera?, target? })   // render into a target at
                                                // its own dimensions
```

`AuraToneMappingOperator` is `"none" | "linear" | "reinhard" | "aces" |
"agx" | "neutral" | "cineon"` — all six operators map to shipped GLSL
chunks, including Cineon (landed L7).
Fixture: `tests/unit/parity/runtime.test.ts`.

### Animation — SA-01/02/03/04/05/06, SM-03 (lane L8 — LIVE)

```ts
// @aura3d/animation
AnimationMixer + AnimationAction + AnimationClip + AnimationTrack
  // mixer depth: per-action loop/timeScale/weight, "loop"/"finished"
  // events (AnimationMixerLoopEvent / AnimationMixerFinishedEvent)
AnimationObjectGroup                                   // SA-02
PropertyBinding, parseTrackName, findNode, sanitizeNodeName
  // SA-03 — node.prop[index] and morphTargetInfluences[name] binding paths
BooleanKeyframeTrack, ColorKeyframeTrack, NumberKeyframeTrack,
  QuaternionKeyframeTrack, StringKeyframeTrack, VectorKeyframeTrack  // SM-03
AnimationUtils (+ named: subclip, optimize, merge,
                makeClipAdditive, isClipAdditive)                    // SA-06
SceneAnimationBridge                                  // runtime bridge

// @aura3d/engine
cloneSkinned(source, count?)                          // SA-04 —
  // SkeletonUtils.clone argument order; returns typed skeleton/skinning
  // evidence
characters.clone                                      // namespace twin
```

Morph-target depth: `handle.morphTargetDictionary()`,
`handle.morphInfluence(name, weight?)`, `setMorphTarget(s)` — unclamped
weights supported (SA-05).
Fixture: `tests/unit/parity/animation.test.ts`.

### Audio — AU-01/02/03 (lane L9 — LIVE)

```ts
// @aura3d/audio
new AudioListener(ctx?)        // AU-03 — binds and writes into
                               // ctx.listener
new PositionalEmitter(...)     // AU-01/02 — panner distanceModel +
                               // distance params and cone
                               // (innerAngle/outerAngle/outerGain) map to a
                               // real PannerNode; distance/cone attenuation
                               // is applied exactly once (no double
                               // attenuation)
createAudioAnalyser(node, fftSize?) / new AudioAnalyser(...)
  // wraps a real AnalyserNode: frequency + time-domain data,
  // getAverageFrequency, disconnect
```

Coverage: `tests/unit/audio/*` (no dedicated parity fixture — L9 merged the
attenuation fix, listener wiring, and analyser together).

### Not yet — the only remaining gaps

```ts
// batched.mesh promotion to ● — probe-gated on P-2 (native multi-draw/
//   GPU-residency probe). The API and per-geometry-instancing path are
//   LIVE today; the ● verdict waits on the probe.
// cameras.array / cameras.stereo (P2) — need viewport/scissor support in
//   the frame graph.
// SH-01 TSL subset — three's WebGPU node-material language; P2 /
//   probe-gated.
// SH-04 compute — behind the A3D_QR_WEBGPU backend.
// material.custom `patch` (SH-09) — the field is typed on
//   AuraCustomMaterialSpec and the compiler include-bakes named chunks,
//   but promotion to public parity is intentionally deferred; treat patch
//   as not-yet.
// SG-11 mixed-child LOD — `distanceLod` ships root LOD (one primitive or
//   geometry per level); three's LOD object with mixed child sets per
//   level is not yet.
// SC-04 XR controller buttons.
// AD-16 rectArea/LightProbe — `lights.rectArea` (alias of lights.rect)
//   ships and compiles to a real "rect-area" render light; three's
//   RectAreaLight uniforms-lib fidelity and LightProbe (spherical-
//   harmonics probe) are not yet.
```

Dev gates: the parity lanes sit behind `A3D_PARITY_SHADING`,
`A3D_PARITY_GEOMETRY`, `A3D_PARITY_TEXTURES`, `A3D_PARITY_BATCHING`,
`A3D_PARITY_LINES`, `A3D_PARITY_RUNTIME` (or the `parity.<area>` short form —
`?a3d-qr=parity.lines`). Fixture: `tests/unit/parity/l0-flags.test.ts`.

### Excluded by contract — never lands

```ts
// AD-04 loaders: FBXLoader MMDLoader PLYLoader STLLoader USDZLoader
//   ThreeMFLoader VOXLoader ColladaLoader TDSLoader AMFLoader IFCLoader
// AD-05 exporters: GLTFExporter OBJExporter PLYExporter STLExporter
//   USDZExporter DRACOExporter ColladaExporter
// AD-09 effects/*, AD-10 modifiers (bake offline),
// AD-11 GPUComputationRenderer (waits on SH-04 WebGPU compute),
// AD-13 webxr/inspector/transpiler/libs/offscreen
```
