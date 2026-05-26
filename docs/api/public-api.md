# Galileo3D Public API Reference

This file is generated from every non-private package entrypoint under `packages/*/src/index.ts`.
It documents the public export surface that package consumers can import today.

Regenerate and verify it with:

```sh
pnpm verify:api-docs
```

## Packages

| Package | Version | Entrypoint | Export declarations |
|---|---:|---|---:|
| `@galileo3d/animation` | `1.0.0` | `packages/animation/src/index.ts` | 23 |
| `@galileo3d/apps` | `1.0.0` | `packages/apps/src/index.ts` | 10 |
| `@galileo3d/assets` | `1.0.0` | `packages/assets/src/index.ts` | 81 |
| `@galileo3d/audio` | `1.0.0` | `packages/audio/src/index.ts` | 24 |
| `@galileo3d/controls` | `1.0.0` | `packages/controls/src/index.ts` | 20 |
| `@galileo3d/core` | `1.0.0` | `packages/core/src/index.ts` | 14 |
| `@galileo3d/create-g3d` | `1.0.0` | `packages/create-g3d/src/index.ts` | 5 |
| `@galileo3d/debug` | `1.0.0` | `packages/debug/src/index.ts` | 30 |
| `@galileo3d/ecs` | `1.0.0` | `packages/ecs/src/index.ts` | 21 |
| `@galileo3d/editor` | `1.0.0` | `packages/editor/src/index.ts` | 1 |
| `@galileo3d/editor-runtime` | `1.0.0` | `packages/editor-runtime/src/index.ts` | 46 |
| `@galileo3d/engine-runtime` | `1.0.0` | `packages/engine/src/index.ts` | 28 |
| `@galileo3d/environments` | `1.0.0` | `packages/environments/src/index.ts` | 10 |
| `@galileo3d/input` | `1.0.0` | `packages/input/src/index.ts` | 46 |
| `@galileo3d/materials` | `1.0.0` | `packages/materials/src/index.ts` | 10 |
| `@galileo3d/math` | `1.0.0` | `packages/math/src/index.ts` | 18 |
| `@galileo3d/physics` | `1.0.0` | `packages/physics/src/index.ts` | 24 |
| `@galileo3d/product-studio` | `1.0.0` | `packages/product-studio/src/index.ts` | 12 |
| `@galileo3d/rendering` | `1.0.0` | `packages/rendering/src/index.ts` | 259 |
| `@galileo3d/scene` | `1.0.0` | `packages/scene/src/index.ts` | 20 |
| `@galileo3d/scripting` | `1.0.0` | `packages/scripting/src/index.ts` | 49 |
| `@galileo3d/three-compat` | `1.0.0` | `packages/three-compat/src/index.ts` | 31 |
| `@galileo3d/workflows` | `1.0.0` | `packages/workflows/src/index.ts` | 12 |

## @galileo3d/animation

- Version: `1.0.0`
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
export * from "./threejs-compatibility";
```

## @galileo3d/apps

- Version: `1.0.0`
- Package manifest: `packages/apps/package.json`
- Public entrypoint: `packages/apps/src/index.ts`

### Export Declarations

```ts
export type G3DAppQualityPreset = "draft" | "balanced" | "production";
export type G3DAppWorkflowPreset = "asset-viewer" | "product-configurator" | "material-studio" | "scene-showcase" | "interactive-scene";
export interface G3DAppQualitySettings { readonly preset: G3DAppQualityPreset;
export interface G3DAppOptions { readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
export interface G3DAppRendererLike { render(source: G3DWorkflowResult["source"], camera?: G3DWorkflowResult["camera"]): RenderDeviceDiagnostics;
export interface G3DAppDiagnostics { readonly appState: "ready" | "disposed";
export interface G3DApp { readonly engine: Engine;
export const G3D_APP_WORKFLOW_PRESETS: readonly G3DAppWorkflowPreset[] = [
export function resolveG3DAppQualityPreset(preset: G3DAppQualityPreset = "balanced", overrides: Pick<G3DAppOptions, "width" | "height"> = {}): G3DAppQualitySettings { const base = preset === "production" ? { width: 1600, height: 1000, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const } : preset === "draft" ? { width: 960, height: 540, antialias: false, preserveDrawingBuffer: false, targetFormat: "rgba8" as const } : { width: 1280, height: 720, antialias: true, preserveDrawingBuffer: true, targetFormat: "rgba16f" as const };
export async function createG3DApp(options: G3DAppOptions = {}): Promise<G3DApp> { const quality = resolveG3DAppQualityPreset(options.quality, options);
```

## @galileo3d/assets

- Version: `1.0.0`
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
export { summarizeV4Corpus, validateV4CorpusManifest } from "./V4Corpus";
export type { V4CorpusAsset, V4CorpusManifest, V4CorpusSummary } from "./V4Corpus";
export { loadV5AssetManifest, loadV5AssetRegistry, summarizeV5AssetRegistry } from "./threejs-compatibility/V5AssetRegistry";
export { createV5AssetProvenance } from "./threejs-compatibility/V5AssetProvenance";
export type { V5AssetManifest, V5AssetRegistrySummary } from "./threejs-compatibility/V5AssetRegistry";
export type { V5AssetProvenance, V5SourceAsset, V5TrackedAssetInput } from "./threejs-compatibility/V5AssetProvenance";
export { createV6GLTFRenderMetadata, createV6AssetCorpusSummary, inspectV6Glb, loadV6GLTFRenderPipeline, loadV6AssetManifest } from "./asset-corpus";
export type { V6AssetClass, V6AssetCorpusRequirements, V6AssetCorpusSummary, V6AssetManifest, V6AssetManifestEntry, V6AssetReadinessEntry, V6GLTFRenderMetadata, V6GLTFRenderWarning, V6GLTFRenderPipeline, V6GLTFRenderPipelineOptions, V6GlbInspection } from "./asset-corpus";
export { createV8AssetCorpusSummary, inspectV8Glb, loadV8AssetManifest, writeV8AssetCorpusReport } from "./V8AssetCorpus";
export type { V8AssetClass, V8AssetCorpusSummary, V8AssetManifest, V8AssetManifestEntry, V8AssetReadinessEntry, V8AssetRequirement, V8EnvironmentManifestEntry, V8EnvironmentReadinessEntry, V8GlbInspection } from "./V8AssetCorpus";
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

## @galileo3d/audio

- Version: `1.0.0`
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

## @galileo3d/controls

- Version: `1.0.0`
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
export type { PickingDiagnostics, PickingOptions, PickingReport, V5PickResult } from "./Picking";
export { annotationFromPickHit, createDistrictPickingAnnotations, createEntityPickingAnnotations, createImportedGlbHotspotAnnotations, createPickingAnnotationObject, createPickingAnnotationRoot, createRobotPickingAnnotations, pickAnnotation, pickScreenSpaceAnnotation } from "./PickingAnnotations";
export type { BuildingPickingDescriptor, DistrictPickingDescriptor, EntityPickingDescriptor, ImportedGlbHotspotDescriptor, PickingAnnotation, PickingAnnotationHitPolicy, PickingAnnotationKind, PickingAnnotationObject, PickingAnnotationOptions, PickingAnnotationReport, PickingAnnotationRoot, PickingAnnotationSource, ScreenPickingAnnotation, ScreenPickingHit, ScreenPickingOptions, ScreenPickingReport } from "./PickingAnnotations";
export { ControlVector3 } from "./NativeControlTypes";
export type { ControlObject3DLike, ControlPickMetadata, Vector3Like } from "./NativeControlTypes";
export { createDefaultControlState } from "./ControlState";
export type { V5ControlEvent, V5ControlState } from "./ControlState";
```

## @galileo3d/core

- Version: `1.0.0`
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

## @galileo3d/create-g3d

- Version: `1.0.0`
- Package manifest: `packages/create-g3d/package.json`
- Public entrypoint: `packages/create-g3d/src/index.ts`

### Export Declarations

```ts
export type CreateG3DTemplate =
export interface CreateG3DProjectOptions { readonly targetDir: string;
export interface CreateG3DProjectResult { readonly targetDir: string;
export function createG3DProject(options: CreateG3DProjectOptions): CreateG3DProjectResult { const template = options.template ?? "external-parity-product-viewer";
export function writeCreateG3DReport(path: string, result: CreateG3DProjectResult): void { mkdirSync(dirname(resolve(path)), { recursive: true });
```

## @galileo3d/debug

- Version: `1.0.0`
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

## @galileo3d/ecs

- Version: `1.0.0`
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

## @galileo3d/editor

- Version: `1.0.0`
- Package manifest: `packages/editor/package.json`
- Public entrypoint: `packages/editor/src/index.ts`

### Export Declarations

```ts
export * from "@galileo3d/editor-runtime";
```

## @galileo3d/editor-runtime

- Version: `1.0.0`
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
export { TranslateGizmo } from "./TranslateGizmo";
export { TimelineClip, TimelineModel, TimelineTrack } from "./TimelineModel";
export type { TimelineActiveClipSnapshot, TimelineClipBlendMode, TimelineClipConfig, TimelineEasingName, TimelineLoopMode, TimelineModelConfig, TimelineSnapshot, TimelineTrackConfig, TimelineTrackSnapshot } from "./TimelineModel";
export { CreateNodeCommand } from "./commands/CreateNodeCommand";
export type { NodeContainer } from "./commands/CreateNodeCommand";
export { DeleteNodeCommand } from "./commands/DeleteNodeCommand";
export { ReparentNodeCommand } from "./commands/ReparentNodeCommand";
export { SetPropertyCommand } from "./commands/SetPropertyCommand";
export { TransformCommand } from "./commands/TransformCommand";
export type { SceneTransformTargetLike, TransformLike, TransformTarget } from "./commands/TransformCommand";
```

## @galileo3d/engine-runtime

- Version: `1.0.0`
- Package manifest: `packages/engine/package.json`
- Public entrypoint: `packages/engine/src/index.ts`

### Export Declarations

```ts
export { G3D_APP_WORKFLOW_PRESETS, createG3DApp, resolveG3DAppQualityPreset } from "@galileo3d/apps";
export type { G3DApp, G3DAppDiagnostics, G3DAppOptions, G3DAppQualityPreset, G3DAppQualitySettings, G3DAppWorkflowPreset } from "@galileo3d/apps";
export { Engine } from "@galileo3d/core";
export { Renderer, createV4EnvironmentPipeline, listV4EnvironmentTargets } from "@galileo3d/rendering";
export { GLTFLoader, createAssetCompatibilityReport, inspectGLTFAsset, loadRenderableAsset, summarizeV4Corpus } from "@galileo3d/assets";
export { loadProductAsset } from "@galileo3d/product-studio";
export { createAnimationLabWorkflow, createAssetViewerWorkflow, createComparisonWorkflow, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createSceneShowcaseWorkflow } from "@galileo3d/workflows";
export * as v9 from "./advanced-runtime/index.js";
export { G3DRenderer, G3DScene, G3DAppLifecycle } from "./advanced-runtime/index.js";
export type { G3DAppLifecycleSnapshot, G3DDisposable, G3DRendererOptions, G3DSceneMeshOptions, G3DSceneRenderSourceOptions } from "./advanced-runtime/index.js";
export const workflows = { assetViewer: createAssetViewerWorkflow, productConfigurator: createProductConfiguratorWorkflow, materialStudio: createMaterialStudioWorkflow, sceneShowcase: createSceneShowcaseWorkflow, interactiveScene: createInteractiveSceneWorkflow, animationLab: createAnimationLabWorkflow, comparison: createComparisonWorkflow } as const;
export type G3DWorkflowApi = typeof workflows;
export type G3DEnvironmentOptions = V4EnvironmentPipelineOptions;
export type G3DEnvironment = V4EnvironmentPipeline;
export function createEnvironment(options: G3DEnvironmentOptions): G3DEnvironment { return createV4EnvironmentPipeline(options);
export async function loadAsset(urlOrAsset: string | RenderableAsset, options: LoadRenderableAssetOptions = {}): Promise<RenderableAsset> { return await loadRenderableAsset(urlOrAsset, options);
export interface G3DMaterialVariantController<TVariantId extends string = string> { readonly current: TVariantId;
export function createMaterialVariantController<TVariantId extends string>(
export interface G3DScreenshotCapture { readonly mimeType: "image/png";
export function captureScreenshot(target: HTMLCanvasElement | OffscreenCanvas | G3DApp): G3DScreenshotCapture { const canvas = isG3DApp(target) ? findCanvasFromRenderer(target.renderer) : target;
export function inspectAsset(asset: GLTFAsset, resources?: GLTFRenderResources): GLTFAssetInspectionReport { return inspectGLTFAsset(asset, resources);
export function createCompatibilityReport(manifest: GLTFCorpusManifest): AssetCompatibilityReport { return createAssetCompatibilityReport(manifest);
export interface G3DAssetDiagnostics { readonly kind: RenderableAsset["kind"];
export function createAssetDiagnostics(asset: RenderableAsset): G3DAssetDiagnostics { const gltf = asset.gltf;
export interface G3DRenderDiagnostics { readonly drawCalls: number;
export function createRenderDiagnostics(diagnostics?: RenderDeviceDiagnostics): G3DRenderDiagnostics { return { drawCalls: diagnostics?.drawCalls ?? 0, buffers: diagnostics?.buffers ?? 0, shaders: diagnostics?.shaders ?? 0, textureCount: diagnostics?.textures, warnings: diagnostics ? [] : ["No render diagnostics have been recorded yet."] };
export interface G3DDiagnosticsPanel { readonly kind: "g3d-diagnostics-panel";
export function createDiagnosticsPanel(initial: { readonly render?: RenderDeviceDiagnostics; readonly asset?: G3DAssetDiagnostics } = {}): G3DDiagnosticsPanel { let render = createRenderDiagnostics(initial.render);
```

## @galileo3d/environments

- Version: `1.0.0`
- Package manifest: `packages/environments/package.json`
- Public entrypoint: `packages/environments/src/index.ts`

### Export Declarations

```ts
export { findV5EnvironmentPreset, listV5EnvironmentPresets, loadV5EnvironmentManifest, createV5EnvironmentGalleryModel, summarizeV5EnvironmentLibrary } from "./EnvironmentRegistry";
export type { V5EnvironmentLibrarySummary, V5EnvironmentManifest } from "./EnvironmentRegistry";
export { createV5EnvironmentDiagnostics, verifyV5HdriFile } from "./HDRIEnvironment";
export type { V5EnvironmentDiagnostics, V5EnvironmentKind, V5EnvironmentProbeType, V5HDRIEnvironmentPreset } from "./HDRIEnvironment";
export { createV5PMREMDiagnostics } from "./PMREMPreset";
export type { V5PMREMDiagnostics, V5PMREMPreset } from "./PMREMPreset";
export { createV5EnvironmentProbePreviews } from "./EnvironmentPreview";
export type { V5EnvironmentProbePreview } from "./EnvironmentPreview";
export { createV6EnvironmentCorpusSummary, inspectV6HDR, loadV6EnvironmentManifest } from "./production-runtime/V6EnvironmentCorpus";
export type { V6HDREnvironment, V6HDRInspection, V6EnvironmentCorpusSummary, V6EnvironmentManifest, V6EnvironmentProbeType, V6EnvironmentReadinessEntry, V6EnvironmentRequirements, V6PMREMPreset } from "./production-runtime/V6EnvironmentCorpus";
```

## @galileo3d/input

- Version: `1.0.0`
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
export type { G3DXRFrameLike, G3DXRHandedness, G3DXRHitTestResultLike, G3DXRInputSourceLike, G3DXRPoseLike, G3DXRReferenceSpaceLike, G3DXRReferenceSpaceType, G3DXRSessionInit, G3DXRSessionLike, G3DXRSessionMode, G3DXRSystemLike, WebXRControllerSample, WebXRFrameSample, WebXRHitTestSample, WebXRSessionControllerOptions, WebXRSessionStartResult } from "./WebXRSessionController";
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

## @galileo3d/materials

- Version: `1.0.0`
- Package manifest: `packages/materials/package.json`
- Public entrypoint: `packages/materials/src/index.ts`

### Export Declarations

```ts
export { findV5PbrMaterial, listV5MaterialProofChannels, listV5PbrMaterials, V5_PBR_MATERIAL_LIBRARY, V5_REQUIRED_MATERIAL_CLASSES } from "./PBRMaterialLibrary";
export { findV5TextureSet, V5_TEXTURE_SETS } from "./TextureSet";
export { summarizeV5MaterialLibrary } from "./MaterialValidation";
export { createV5MaterialPreviewScene, createV5MaterialPreviewTile } from "./MaterialPreviewScene";
export type { V5MaterialClass, V5MaterialParameters, V5MaterialPreset, V5MaterialProofChannel } from "./MaterialPreset";
export type { V5TextureMapReference, V5TextureSemantic, V5TextureSet } from "./TextureSet";
export type { V5MaterialLibrarySummary } from "./MaterialValidation";
export type { V5MaterialPreviewTile } from "./MaterialPreviewScene";
export * from "./MaterialPresets.js";
export * from "./NodeMaterial.js";
```

## @galileo3d/math

- Version: `1.0.0`
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

## @galileo3d/physics

- Version: `1.0.0`
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
```

## @galileo3d/product-studio

- Version: `1.0.0`
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

## @galileo3d/rendering

- Version: `1.0.0`
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
export { RendererV9 } from "./advanced-runtime";
export type { RendererV9Options, RendererV9Source } from "./advanced-runtime";
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
export { V4_TEXTURE_COLOR_POLICY, convertColorSpace, createColorConversionSamples, createV4ColorManagementPolicy, linearToSrgbChannel, srgbToLinearChannel, validateTextureColorSpace } from "./ColorManagement";
export type { G3DColorConversionSample, G3DColorManagementPolicy, G3DColorSpace, G3DTextureColorSpaceValidation, G3DTextureSemantic } from "./ColorManagement";
export { applyV4ToneMappingPreset, createV4ToneMappingPolicy, listV4ToneMappingPresets, toneMapV4HdrPixels, toneMapV4Pixels } from "./ToneMapping";
export type { V4ToneMappingIntent, V4ToneMappingPolicy } from "./ToneMapping";
export { analyzeV4Exposure, createV4ExposurePolicy } from "./Exposure";
export type { V4ExposureAnalysis, V4ExposurePolicy } from "./Exposure";
export { createV4HdrPipeline, executeV4ToneMapPass } from "./HDRRenderPipeline";
export type { V4HdrPipeline, V4HdrPipelineDescriptor, V4HdrPipelineMode, V4HdrRenderTargetFormat } from "./HDRRenderPipeline";
export { createRendererVisualPipelineReport, evaluateRendererCanvasBacking, evaluateRendererCaptureQuality, evaluateRendererFrameCadence, evaluateRendererScreenshotConsistency } from "./RendererVisualPipelineReport";
export type { RendererCanvasBackingInput, RendererCanvasBackingReport, RendererCaptureQualityInput, RendererCaptureQualityReport, RendererFrameCadenceInput, RendererFrameCadenceReport, RendererScreenshotConsistencyInput, RendererScreenshotConsistencyReport, RendererUnsupportedVisualCapability, RendererVisualColorReport, RendererVisualHdrTargetReport, RendererVisualPipelineReport, RendererVisualPipelineReportOptions, RendererVisualPipelineStatus, RendererVisualPostprocessDescriptor, RendererVisualPostprocessPassName, RendererVisualPostprocessReport, RendererVisualTargetFormat, RendererVisualToneMappingReport } from "./RendererVisualPipelineReport";
export { V4_REQUIRED_DEBUG_VIEWS, createV4DebugView, createV4DebugViewSet, encodeLinearDebugColor } from "./RenderDebugViews";
export type { V4DebugViewInput, V4DebugViewResult, V4RenderDebugView } from "./RenderDebugViews";
export { createV4BrdfLut } from "./BRDFLut";
export type { V4BrdfLut } from "./BRDFLut";
export { createV4Pmrem } from "./PMREM";
export type { V4Pmrem, V4PmremLevel } from "./PMREM";
export { createV4IblResources } from "./IBL";
export type { V4IblOptions, V4IblResourceSet } from "./IBL";
export { createV4EnvironmentPipeline, listV4EnvironmentTargets } from "./EnvironmentPipeline";
export type { V4EnvironmentPipeline, V4EnvironmentPipelineOptions, V4EnvironmentTarget } from "./EnvironmentPipeline";
export { V4_MATERIAL_EXTENSION_SUPPORT, createV4MaterialExtensionDiagnostics, getV4MaterialExtensionState } from "./materials/MaterialExtensions";
export type { V4MaterialExtension, V4MaterialExtensionState } from "./materials/MaterialExtensions";
export { V4_PHYSICAL_MATERIAL_MATRIX, V4PhysicalMaterial, analyzeV4MaterialMatrix, createV4PhysicalMaterial } from "./materials/PhysicalMaterial";
export type { V4MaterialKind, V4PhysicalMaterialAnalysis, V4PhysicalMaterialDescriptor } from "./materials/PhysicalMaterial";
export { sortV4AlphaItems } from "./materials/AlphaSorting";
export type { V4AlphaSortItem } from "./materials/AlphaSorting";
export { evaluateV4Transmission } from "./materials/TransmissionPass";
export type { V4TransmissionResult, V4TransmissionSample } from "./materials/TransmissionPass";
export { createV4ContactShadow } from "./shadows/ContactShadows";
export type { V4ContactShadow, V4ContactShadowOptions } from "./shadows/ContactShadows";
export { createV4CascadedShadowPipeline } from "./shadows/CascadedShadowPipeline";
export type { V4CascadeDescriptor, V4CascadedShadowPipeline } from "./shadows/CascadedShadowPipeline";
export { createV4ShadowDebugViews } from "./shadows/ShadowDebugViews";
export type { V4ShadowDebugView } from "./shadows/ShadowDebugViews";
export { createV4BloomEvidence, runV4Bloom } from "./postprocess/BloomPass";
export type { V4BloomEvidence } from "./postprocess/BloomPass";
export { createV4DepthBinding, runV4SSAO } from "./postprocess/SSAOPass";
export { runV4DepthOfField } from "./postprocess/DepthOfFieldPass";
export { runV4ColorGrade } from "./postprocess/ColorGradingPass";
export type { V4ColorGradePreset } from "./postprocess/ColorGradingPass";
export { PostProcessComposer, createPostProcessCapabilityReport } from "./postprocess/EffectComposer";
export type { PostProcessCapabilityReport, PostProcessComposerDiagnostics, PostProcessComposerOptions, PostProcessComposerPass, PostProcessComposerRenderOptions, PostProcessUnsupportedEffect } from "./postprocess/EffectComposer";
export { CINEMATIC_POSTPROCESS_EFFECT_IDS, analyzeCinematicPostprocessClarity, createCinematicDiagnosticsReport } from "./postprocess/CinematicDiagnostics";
export type { CinematicCapabilityArea, CinematicCapabilityEntry, CinematicCapabilityStatus, CinematicDiagnosticId, CinematicDiagnosticsBackendInfo, CinematicDiagnosticsReport, CinematicPostprocessClarityFinding, CinematicPostprocessClarityFindingId, CinematicPostprocessClarityInput, CinematicPostprocessClarityReport, CinematicPostprocessClaritySeverity, CinematicPostprocessClarityStatus, CinematicPostprocessFrameMetrics, CinematicPostprocessPipelineDescriptor, CinematicPostProcessEffectId } from "./postprocess/CinematicDiagnostics";
export { createV4RendererStats } from "./performance/RendererStats";
export type { V4RendererStats, V4RendererStatsInput } from "./performance/RendererStats";
export { evaluateV4ResourceBudget } from "./performance/ResourceBudget";
export type { V4ResourceBudget, V4ResourceBudgetReport, V4ResourceBudgetUsage } from "./performance/ResourceBudget";
export { sortV4RenderItems, sortRenderQueueItems } from "./performance/RenderItemSorting";
export type { V4SortableRenderItem, RenderQueueBucket, RenderQueuePlan, RenderQueueSortDiagnostics, RenderQueueSortItem, RenderQueueSortOptions } from "./performance/RenderItemSorting";
export { createV4DefaultLodLevels, selectV4LodLevel } from "./performance/LOD";
export type { V4LodLevel } from "./performance/LOD";
export type { BrdfLutDescriptor, DiffuseIrradianceGenerationOptions, EnvironmentColorSpace, EnvironmentHdrEncodeOptions, EnvironmentInputEncoding, EnvironmentMapResourceInput, EnvironmentMapResourceSet, EnvironmentMipGenerationOptions, EnvironmentResourceSetOptions, EnvironmentToneMappingOperator, LinearHdrEnvironmentMapSource, Rgba8EnvironmentMapSource, RgbeEnvironmentMapSource } from "./EnvironmentMapResources";
export { Sampler } from "./Sampler";
export type { SamplerDescriptor, TextureAddressMode, TextureFilter, TextureMagFilter, TextureMinFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
export { RendererV5, createRendererV5, summarizeV5RendererDiagnostics, V5_REQUIRED_RENDERER_FEATURES } from "./threejs-compatibility";
export type { V5InstancingSystemStatus, V5LightDescriptor, V5LightKind, V5MaterialMode, V5RenderTargetDescriptor, V5RendererBackend, V5RendererDiagnostics, V5RendererFeatureStatus, V5RendererOptions, V5RendererSupportState, V5SceneRenderPlan, V5ShadowSystemStatus, V5TextureCapability, V5TransparencySystemStatus } from "./threejs-compatibility";
export * from "./threejs-compatibility/postprocess";
export * from "./threejs-compatibility/shaders";
export * from "./threejs-compatibility/vfx";
export * from "./threejs-compatibility/performance";
export { ProductionWebGL2Renderer, ProductionWebGPURenderer, analyzePixels, createV6OrbitControlPreset, createV6EnvironmentLightingResources, createV6EffectsRenderSource, createV6PbrHdrPipelineFromRadiance, createV6ToneMappingPolicy, createV6WebGPUReport, loadV6HdrEnvironment, parseV6RadianceHDR, summarizeV6AnimationWorkflow, summarizeV6EffectsProof, summarizeV6ProductionProof, summarizeV6WebGL2Proof } from "./production-runtime";
export type { V6EffectsOptions, V6EffectsSummary, V6AnimationMetadataInput, V6AnimationWorkflowSummary, V6OrbitControlPreset, V6EnvironmentLightingResources, V6HdrEnvironmentLoaderOptions, V6LoadedHdrEnvironment, V6ImportedAssetRenderMetadata, V6PbrHdrPipeline, V6PbrHdrPipelineOptions, V6PixelMetrics, V6ProductionRenderer, V6RadianceHDR, V6RenderProof, V6RendererBackend, V6RendererFeature, V6RendererFeatureState, V6RendererInput, V7FrameRenderResult, V6ToneMappingOperator, V6ToneMappingPolicy, V6WebGPUAdapterLike, V6WebGPULike, V6WebGPUReport, V6WebGPUStatus, ProductionWebGL2RendererOptions, ProductionWebGPURendererOptions } from "./production-runtime";
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
export type { CameraLike, RendererAnimationLoop, RendererCameraPolicy, RendererFrameCapture, RendererInput, RendererOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
export { assertRendererFeatures, createRendererFeatureReport, rendererFeatureCatalog } from "./RendererFeatureGates";
export type { RendererFeature, RendererFeatureReport, RendererFeatureStatus } from "./RendererFeatureGates";
export { createV4EnvironmentLighting, createV4DirectionalShadowEvidence, createV4FlagshipRenderPresetEvidence, createV4GeneratedEnvironmentMapSource, createV4GeneratedHdrEnvironmentMapSource, createV4RenderPresetEvidence, sampleV4LdrPostprocessReadback, v4ActiveFeature, v4BlockedFeature, v4UnsupportedFeature } from "./V4RenderPreset";
export type { V4EnvironmentLightingBundle, V4EnvironmentPreset, V4DirectionalShadowEvidence, V4LdrPostprocessSummary, V4ReadbackDevice, V4RenderPresetEvidence, V4RenderPresetEvidenceOptions, V4RenderPresetFeature, V4RenderPresetFeatureStatus } from "./V4RenderPreset";
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
export * from "./webgpu/WebGPUCompute.js";
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

## @galileo3d/scene

- Version: `1.0.0`
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

## @galileo3d/scripting

- Version: `1.0.0`
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
export { createVisualNode, getVisualNodeDefinition, listVisualNodeDefinitions } from "./VisualNodeCatalog";
export type { VisualNodeCategory, VisualNodeDefinition } from "./VisualNodeCatalog";
export { validateNode } from "./VisualNode";
export type { VisualNode, VisualPort, VisualPortDirection, VisualPortType } from "./VisualNode";
```

## @galileo3d/three-compat

- Version: `1.0.0`
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
export { BoxGeometryCompat, BufferGeometryCompat, CircleGeometryCompat, ConeGeometryCompat, CylinderGeometryCompat, InstancedBufferGeometryCompat, PlaneGeometryCompat, SphereGeometryCompat, TorusGeometryCompat, V5_COMPAT_GEOMETRY_TYPES } from "./geometries";
export type { BufferAttributeCompat } from "./geometries";
export { LineBasicMaterialCompat, MaterialCompat, MeshBasicMaterialCompat, MeshLambertMaterialCompat, MeshPhongMaterialCompat, MeshPhysicalMaterialCompat, MeshStandardMaterialCompat, PointsMaterialCompat, ShaderMaterialCompat, SpriteMaterialCompat, V5_COMPAT_MATERIAL_TYPES } from "./materials";
export type { MaterialCompatParameters } from "./materials";
export { TextureCompat, TextureLoaderCompat, V5_COMPAT_TEXTURE_SETTINGS } from "./textures";
export type { TextureFilterCompat, TextureWrapCompat } from "./textures";
export { WebGLMultipleRenderTargetsCompat, WebGLRenderTargetCompat } from "./render-targets";
export { CubeTextureLoaderCompat, EXRLoaderCompat, GLTFLoaderCompat, HDRLoaderCompat, KTX2LoaderCompat, MTLLoaderCompat, OBJLoaderCompat, ThreeCompatTextureLoader } from "./loaders";
export { DragControls, FirstPersonControls, FlyControls, MapControls, OrbitControls, Picking, PointerLockControls, SelectionManager, TrackballControls, TransformControls } from "./controls";
export type { TransformControlMode, V5ControlState, V5PickResult } from "./controls";
export { AnimationActionCompat, AnimationClipCompat, AnimationMixerCompat, MorphTargetMixerCompat, SkeletonCompat, SkinnedMeshCompat } from "./animation";
export { ColorGradingPassCompat, DepthOfFieldPassCompat, EffectComposerCompat, FXAAPassCompat, OutlinePassCompat, RenderPassCompat, ShaderPassCompat, SMAAPassCompat, SSAOPassCompat, TAAPassCompat, UnrealBloomPassCompat, VignettePassCompat } from "./postprocessing";
export { NodeMaterialCompat, RawShaderMaterialCompat, CustomShaderMaterialCompat, UniformsCompat, SHADER_CHUNKS_V5, diagnoseV5Shader } from "./shaders";
export { V5_THREE_IMPORT_MAP } from "./migration/ImportMap";
export { migrateThreeToG3D } from "./migration/ThreeToG3DAdapter";
export type { V5MigrationResult } from "./migration/ThreeToG3DAdapter";
export { createV5CompatibilityWarnings } from "./migration/CompatibilityWarnings";
export type { V5CompatibilityWarning } from "./migration/CompatibilityWarnings";
export { AmbientLightCompat, DirectionalLightCompat, HemisphereLightCompat, LightCompat, PointLightCompat, RectAreaLightCompat, SpotLightCompat } from "./lights";
export { AxesHelperCompat, BoxHelperCompat, CameraHelperCompat, DirectionalLightHelperCompat, GridHelperCompat, HelperLineSegmentsCompat, SkeletonHelperCompat } from "./helpers";
export { V5_COMPATIBILITY_THRESHOLDS, buildInitialCompatibilityMatrix, supportedOrPartial } from "./ThreeCompatibilityMatrix";
export type { ThreeApiCategory, ThreeApiInventory, ThreeApiInventoryEntry } from "./ThreeApiInventory";
export type { ThreeCompatibilityEntry, ThreeCompatibilityMatrix, ThreeCompatibilityStatus, ThreeCompatibilityThreshold } from "./ThreeCompatibilityMatrix";
```

## @galileo3d/workflows

- Version: `1.0.0`
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
export { workflows as v4Workflows } from "./workflow-foundation/index";
export { V6_WORKFLOWS, createV6AssetPreflight, createV6ProductionRendererDefaults, createV6VisualQAResult, createV6WorkflowPlan, listV6WorkflowDefinitions, runV6Example } from "./production-runtime";
export type { V6AssetPreflightInput, V6AssetPreflightResult, V6ExampleAsset, V6ExampleDefinition, V6ExampleEnvironment, V6ExampleRuntime, V6ExampleRuntimeMetrics, V6ProductionRendererDefaults, V6VisualQAInput, V6VisualQAResult, V6WorkflowDefinition, V6WorkflowId, V6WorkflowPlan } from "./production-runtime";
export type * from "./WorkflowTypes";
```
