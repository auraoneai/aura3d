export { AssetCache, AssetCacheKeyError } from "./AssetCache";
export type { AssetCacheSnapshot } from "./AssetCache";
export { AssetDependencyGraph } from "./AssetDependencyGraph";
export { inspectGLTFAsset } from "./AssetInspection";
export type {
  GLTFAnimationInspection,
  GLTFAssetInspectionReport,
  GLTFDependencyInspection,
  GLTFMaterialInspection,
  GLTFMaterialTextureSlotInspection,
  GLTFMeshInspection,
  GLTFMorphTargetInspection,
  GLTFSceneHierarchyNodeInspection,
  GLTFSkinInspection,
  GLTFTextureInspection
} from "./AssetInspection";
export {
  GLTF_DECODER_REQUIRED_EXTENSION_NAMES,
  GLTF_DIAGNOSTIC_ONLY_EXTENSION_NAMES,
  GLTF_EXTENSION_SUPPORT_MATRIX,
  GLTF_PARSED_WITH_LIMITS_EXTENSION_NAMES,
  GLTF_REQUIRED_ACCEPTED_EXTENSION_NAMES,
  GLTF_RUNTIME_SUPPORTED_EXTENSION_NAMES,
  GLTF_SUPPORTED_EXTENSION_NAMES,
  evaluateGLTFExtensionSupport,
  getGLTFExtensionSupport
} from "./GLTFExtensionSupport";
export type {
  GLTFExtensionSupportEntry,
  GLTFExtensionSupportEvaluation,
  GLTFExtensionSupportFamily,
  GLTFExtensionSupportStatus
} from "./GLTFExtensionSupport";
export { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime, GLTFImportedSkeletonIKController, GLTFSceneAnimationCloneSampler, GLTFSceneAnimationMixerBinding, GLTFSceneAnimationRuntime, GLTFSceneMorphTargetController, resolveGLTFClipName } from "./GLTFAnimationRuntime";
export type {
  GLTFImportedSkeletonIKControllerOptions,
  GLTFImportedSkeletonIKControllerSnapshot,
  GLTFImportedSkeletonIKOptions,
  GLTFImportedSkeletonIKResult,
  GLTFSceneAnimationApplyResult,
  GLTFSceneAnimationClipSample,
  GLTFSceneAnimationClipBoneMask,
  GLTFSceneAnimationActionSnapshot,
  GLTFSceneAnimationCloneSample,
  GLTFSceneAnimationCloneSampleResult,
  GLTFSceneAnimationCloneSamplerSnapshot,
  GLTFSceneAnimationClipBindingDiagnostics,
  GLTFootPlantingApplyResult,
  GLTFootPlantingConfig,
  GLTFootPlantingLegConfig,
  GLTFSceneAnimationMaterialApplyStatus,
  GLTFSceneAnimationMaterialBindingFailure,
  GLTFSceneAnimationMaterialBindingIssue,
  GLTFSceneAnimationMaterialBindingStatus,
  GLTFSceneAnimationMaterialSink,
  GLTFSceneAnimationMixerOptions,
  GLTFSceneAnimationPlayOptions,
  GLTFSceneAnimationMixerSnapshot,
  GLTFSceneAnimationMixerUpdateResult,
  GLTFSceneAnimationRuntimeOptions,
  GLTFSceneAnimationRuntimeSnapshot,
  GLTFSceneMorphTargetControllerOptions,
  GLTFSceneMorphTargetControllerSnapshot,
  GLTFScenePose,
  GLTFScenePoseBoneTransform
} from "./GLTFAnimationRuntime";
export { AssetHandle } from "./AssetHandle";
export type { AssetHandleOptions, AssetHandleStatus } from "./AssetHandle";
export { AssetLoadError, mergeAssetRequestOptions, requestIdentity, requestIdentityDetails, redactAssetUrl } from "./AssetLoader";
export type { AssetLoader, AssetLoadProgress, AssetLoadRequest, AssetRequestOptions, AssetRequestIdentity, AssetIntegrity } from "./AssetLoader";
export { AssetManager } from "./AssetManager";
export type { AssetLoadOptions, AssetManagerOptions } from "./AssetManager";
export { AssetRegistry } from "./AssetRegistry";
export { inspectNRRDDataReference } from "./NRRDHeader";
export { createAssetImportPreflightReport, detectAssetImportFormat } from "./AssetImportPreflight";
export type {
  AssetImportPreflightFormat,
  AssetImportPreflightOptions,
  AssetImportPreflightProfile,
  AssetImportPreflightReport,
  AssetImportPreflightSettings,
  AssetImportPreflightStatus
} from "./AssetImportPreflight";
export {
  createAssetCompatibilityReport
} from "./AssetCompatibility";
export type {
  AssetCompatibilityLoaderName,
  AssetCompatibilityReport,
  AssetCompatibilityReportAsset,
  AssetCompatibilityReportOptions,
  AssetCompatibilityStatus,
  AssetLoaderCompatibilityResult,
  BlenderExportCompatibilityResult,
  ExternalAssetLoaderCompatibilityResult
} from "./AssetCompatibility";
export {
  summarizeExternalParityGLTFCorpus,
  summarizeExternalParityCorpus,
  validateExternalParityGLTFCorpusManifest,
  validateExternalParityCorpusManifest
} from "./ExternalParityGLTFCorpus";
export type {
  ExternalParityGLTFCorpusAsset,
  ExternalParityGLTFCorpusManifest,
  ExternalParityGLTFCorpusSummary,
  ExternalParityCorpusAsset,
  ExternalParityCorpusManifest,
  ExternalParityCorpusSummary
} from "./ExternalParityGLTFCorpus";
export {
  loadThreeCompatAssetManifest,
  loadThreeCompatAssetRegistry,
  summarizeThreeCompatAssetRegistry
} from "./threejs-compatibility/ThreeCompatAssetRegistry";
export {
  createThreeCompatAssetProvenance
} from "./threejs-compatibility/ThreeCompatAssetProvenance";
export type {
  ThreeCompatAssetManifest,
  ThreeCompatAssetRegistrySummary
} from "./threejs-compatibility/ThreeCompatAssetRegistry";
export type {
  ThreeCompatAssetProvenance,
  ThreeCompatSourceAsset,
  ThreeCompatTrackedAssetInput
} from "./threejs-compatibility/ThreeCompatAssetProvenance";
export {
  createProductionGLTFRenderMetadata,
  createProductionAssetCorpusSummary,
  inspectProductionGlb,
  loadProductionGLTFRenderPipeline,
  loadProductionAssetManifest
} from "./asset-corpus";
export type {
  ProductionAssetClass,
  ProductionAssetCorpusRequirements,
  ProductionAssetCorpusSummary,
  ProductionAssetManifest,
  ProductionAssetManifestEntry,
  ProductionAssetReadinessEntry,
  ProductionGLTFRenderMetadata,
  ProductionGLTFRenderWarning,
  ProductionGLTFRenderPipeline,
  ProductionGLTFRenderPipelineOptions,
  ProductionGlbInspection
} from "./asset-corpus";
export {
  createAdvancedAssetCorpusSummary,
  inspectCurrentRoutesGlb,
  loadCurrentRoutesAssetManifest,
  writeAdvancedAssetCorpusReport
} from "./AdvancedAssetCorpus";
export type {
  CurrentRoutesAssetClass,
  AdvancedAssetCorpusSummary,
  CurrentRoutesAssetManifest,
  CurrentRoutesAssetManifestEntry,
  CurrentRoutesAssetReadinessEntry,
  CurrentRoutesAssetRequirement,
  CurrentRoutesEnvironmentManifestEntry,
  CurrentRoutesEnvironmentReadinessEntry,
  CurrentRoutesGlbInspection
} from "./AdvancedAssetCorpus";
export * from "./loaders";
export {
  DEFAULT_ASSET_IMPORT_SETTINGS,
  assertValidGLTFCorpusManifest,
  createGLTFCorpusReport,
  normalizeAssetImportSettings,
  validateGLTFCorpusManifest
} from "./AssetCorpus";
export type {
  AssetDiagnostic,
  AssetDiagnosticSeverity,
  AssetImportSettings,
  GLTFCorpusAsset,
  GLTFCorpusAssetFormat,
  GLTFCorpusAssetReport,
  GLTFCorpusExpectedStatus,
  GLTFCorpusManifest,
  GLTFCorpusReport,
  GLTFCorpusSchemaVersion,
  GLTFCorpusSource,
  GLTFCorpusValidationResult
} from "./AssetCorpus";
export { AudioLoader } from "./AudioLoader";
export type { AudioAsset, AudioDecodeContext } from "./AudioLoader";
export { assertValidBlenderExportFixtureManifest, createBlenderExportValidationReport } from "./BlenderExportValidation";
export type {
  BlenderExportFixture,
  BlenderExportFixtureInput,
  BlenderExportFixtureManifest,
  BlenderExportValidationDiagnostic,
  BlenderExportValidationFixtureResult,
  BlenderExportValidationReport,
  BlenderExportValidationStatus
} from "./BlenderExportValidation";
export { createDracoDecoder, createMeshoptDecoder } from "./GLTFCompressionDecoders";
export type {
  GLTFDracoAttribute,
  GLTFDracoDecoderBuffer,
  GLTFDracoDecoderInstance,
  GLTFDracoDecoderModule,
  GLTFDracoMesh,
  GLTFDracoNumericArray,
  GLTFDracoStatus,
  GLTFMeshoptDecoderModule
} from "./GLTFCompressionDecoders";
export {
  applyCarConceptMaterialStability,
  carConceptMaterialVisualRole,
  carConceptMaterialRenderStateOverrides
} from "./CarConceptMaterialStability";
export type {
  CarConceptMaterialBaseline,
  CarConceptMaterialVisualRole,
  CarConceptMaterialStabilityOptions,
  CarConceptMaterialStabilityProfile
} from "./CarConceptMaterialStability";
export { ImageLoader } from "./ImageLoader";
export type { ImageAsset } from "./ImageLoader";
export { fetchGltfBytesShared, GLTFLoader, normalizeSkinWeights, parseGlbDocument, parseMaterialVariantSelection, resolveAnimationPointerBinding, serializeMaterialVariantSelection } from "./GLTFLoader";
export type { GLBDocumentInspection } from "./GLTFLoader";
export { autoFitGLTFScene, computeAutoFitTransform } from "./GLTFAutoFit";
export type { AutoFitOptions, AutoFitTransform, GLTFUpAxis } from "./GLTFAutoFit";
export type {
  GLTFAsset,
  GLTFAnimationPointerBinding,
  GLTFCameraAsset,
  GLTFClearcoatMaterialExtension,
  GLTFDracoDecodeDescriptor,
  GLTFDracoDecodedPrimitive,
  GLTFDracoDecoder,
  GLTFGeometryAsset,
  GLTFImageAsset,
  GLTFLightAsset,
  GLTFJson,
  GLTFLoaderOptions,
  GLTFLoaderDiagnostics,
  GLTFMaterialVariantSceneState,
  SkinWeightNormalizationStats,
  GLTFMaterialAsset,
  GLTFMaterialVariantAsset,
  GLTFMaterialVariantMappingAsset,
  GLTFMeshAsset,
  GLTFMeshoptDecodeDescriptor,
  GLTFMeshoptDecoder,
  GLTFPBRSpecularGlossinessMaterialExtension,
  GLTFResolvedTextureInfo,
  GLTFSamplerAsset,
  GLTFSceneAsset,
  GLTFSceneCreateOptions,
  GLTFSheenMaterialExtension,
  GLTFSkinAsset,
  GLTFSpecularMaterialExtension,
  GLTFTextureAsset,
  GLTFTransmissionMaterialExtension,
  GLTFVolumeMaterialExtension,
  SerializedGLTFAsset
} from "./GLTFLoader";
export { OBJLoader } from "./OBJLoader";
export {
  DEFAULT_GLTF_RENDER_ENVIRONMENT_LIGHTING,
  DEFAULT_GLTF_HDR_STUDIO_PREVIEW_POSTPROCESS,
  DEFAULT_GLTF_STUDIO_PREVIEW_FRAME,
  DEFAULT_GLTF_STUDIO_PREVIEW_ENVIRONMENT_LIGHTING,
  DEFAULT_GLTF_STUDIO_PREVIEW_POSTPROCESS,
  GLTFTextureLoadError,
  createDefaultGLTFHdrStudioPreviewEnvironmentLighting,
  createGLTFRenderResourceDiagnostics,
  createGLTFRenderResources,
  createGLTFRenderSource,
  renderStateForGLTFMaterial
} from "./GLTFRenderResources";
export type {
  DecodedGLTFImage,
  GLTFImageDecodeContext,
  GLTFImageDecoder,
  GLTFMaterialRenderStateOverride,
  GLTFMaterialOverrideQuery,
  GLTFMaterialOverrideTarget,
  GLTFRenderableBinding,
  GLTFRenderResourceDiagnostics,
  GLTFRenderResourceDiagnosticsOptions,
  GLTFRenderResourceLoadIssue,
  GLTFRenderResourceTextureSlotDiagnostic,
  GLTFRenderQualityPreset,
  GLTFRendererInput,
  GLTFRendererInputOptions,
  GLTFRenderResourceOptions,
  GLTFRenderSourceOptions,
  GLTFRenderResources
} from "./GLTFRenderResources";
export { createAssetRenderDefaults, DEFAULT_ASSET_RENDER_VIEWPORT } from "./AssetRenderDefaults";
export type { AssetRenderDefaults, AssetRenderLightingPreset } from "./AssetRenderDefaults";
export { loadRenderableAsset } from "./loadRenderableAsset";
export type { LoadRenderableAssetOptions, RenderableAsset, RenderableAssetKind } from "./loadRenderableAsset";
export { createRenderableScene } from "./createRenderableScene";
export type { CreateRenderableSceneOptions, RenderableScene } from "./createRenderableScene";
export { ensureCompressedTextureSupport, transcodeKTX2BasisTexture } from "./KTX2BasisTextureTranscoder";
export type { CompressedTextureDecoderProbes, CompressedTextureDecoderStatus, CompressedTextureSupportDiagnostics, CompressedTextureSupportRequest, KTX2BasisTargetFormat, KTX2BasisTextureTranscoderOptions } from "./KTX2BasisTextureTranscoder";
export { selectKTX2TargetFormat } from "./KTX2TargetSelection";
export { AssetDecoderDisposeTimeout, AssetDecoderUnavailable, createAssetDecoderRegistry, probeKTX2Header } from "./AssetDecoderRegistry";
export type { AssetDecoderId, AssetDecoderRegistry, AssetDecoderRegistryDiagnostics, AssetDecoderRegistryOptions, AuraAssetDecoderSet } from "./AssetDecoderRegistry";
export { ImportPipeline, ImportPipelineError } from "./ImportPipeline";
export type { ImportPipelineContext, ImportPipelineProgressEvent, ImportPipelineProgressStatus, ImportPipelineRun, ImportStage } from "./ImportPipeline";
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
// threejs-parity ST-04/AD-03 (lane L4): three-signature real loaders.
export { FileLoader } from "./FileLoader";
export type { FileLoaderResponseType, FileLoaderOptions } from "./FileLoader";
export { ImageBitmapLoader } from "./ImageBitmapLoader";
export type { ImageBitmapLoaderOptions, ImageBitmapLoadRequest } from "./ImageBitmapLoader";
export { DataTextureLoader } from "./DataTextureLoader";
export { EXRLoader, EXRLoaderThreeCompat, parseEXR, parseDeepEXR, compositeDeepEXR } from "./EXRLoader";
export type { AuraEXRDataType, AuraEXROutputFormat, AuraEXRParseOptions, AuraEXRTextureData, AuraEXRDeepChannel, AuraEXRDeepData, AuraEXRDeepOptions } from "./EXRLoader";
export { fetchBytes, verifyAssetBytes, AssetIntegrityError, AssetPolicyError, AssetSizeError, isNonRetryableAssetError } from "./LoaderFetch";
export type { AuraLoaderProgress } from "./LoaderFetch";
export { WorkerAssetJobs } from "./WorkerAssetJobs";
export type { WorkerAssetJob, WorkerAssetJobRunner, WorkerAssetJobsOptions } from "./WorkerAssetJobs";
export * from "./HDRLoader.js";
export * from "./TextureStreaming.js";
export { GLTFSharedTextureCache } from "./GLTFSharedTextureCache.js";
export type { GLTFSharedTextureLease } from "./GLTFSharedTextureCache.js";
export { IESLoader, parseIES, sampleIESProfile } from "./IESLoader.js";
export type { IESProfile, IESParseOptions } from "./IESLoader.js";
export { GaussianSplatLoader, parseGaussianSplat, validateGaussianSplat } from "./loaders/GaussianSplatLoader.js";
export type { GaussianSplatData, GaussianSplatFormat, GaussianSplatDegree, GaussianSplatColorSpace, GaussianSplatParseOptions, GaussianSplatCodec } from "./loaders/GaussianSplatLoader.js";
export { PLYLoader, STLLoader, parsePLY, parseSTL } from "./loaders/MeshFormatLoaders.js";
export type { MeshImportLimits, NativeMeshData, PlyMeshData, StlMeshData } from "./loaders/MeshFormatLoaders.js";
export { Model3MFLoader, parseModel3MF, read3MFPackageEntries } from "./loaders/Model3MFLoader.js";
export type { Model3MFLimits, Model3MFArchiveLimits, Model3MFAsset } from "./loaders/Model3MFLoader.js";
export { exportOBJ } from "./exporters/OBJExporter.js";
export type { OBJExportOptions } from "./exporters/OBJExporter.js";
export { exportSTL } from "./exporters/STLExporter.js";
export type { STLExportOptions } from "./exporters/STLExporter.js";
export { FormatRegistry, createDefaultFormatRegistry, createGLTFFormatAdapter } from "./FormatRegistry.js";
export type { FormatAdapter, RegisteredFormatAsset, FormatMetadata, FormatSelection } from "./FormatRegistry.js";
