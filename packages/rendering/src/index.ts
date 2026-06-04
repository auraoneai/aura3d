export type {
  BufferUsage,
  DrawCommand,
  IndexType,
  PrimitiveTopology,
  RenderBackendKind,
  RenderBuffer,
  RenderDeviceCapability,
  RenderDevice,
  RenderDeviceDiagnostics,
  RenderDeviceInfo,
  RenderTarget,
  RenderTargetDescriptor,
  RenderShaderProgram,
  ShaderAttributeReflection,
  ShaderReflection,
  ShaderUniformReflection,
  ShaderSources,
  UniformValue
} from "./RenderDevice";
export { MockRenderBuffer, MockRenderDevice, MockShaderProgram, RenderDeviceError } from "./RenderDevice";
export { createRenderDevice } from "./RenderBackend";
export type { RenderBackendOptions } from "./RenderBackend";
export { WebGL2Device } from "./WebGL2Device";
export type { WebGL2DeviceOptions } from "./WebGL2Device";
export { WebGL2StateCache } from "./WebGL2StateCache";
export type { WebGL2StateCacheDescriptor, WebGL2StateCacheSnapshot, WebGL2StateCacheStats } from "./WebGL2StateCache";
export { WebGPUDevice } from "./WebGPUDevice";
export type {
  WebGPUAdapterLike,
  WebGPUBufferDescriptorLike,
  WebGPUBufferLike,
  WebGPUDeviceLike,
  WebGPUDeviceOptions,
  WebGPULike,
  WebGPUQueueLike,
  WebGPUSamplerDescriptorLike
} from "./WebGPUDevice";
export {
  isWebGPURenderTarget,
  runWebGPURenderToTextureProof
} from "./WebGPURenderToTextureProof";
export type {
  WebGPURenderToTextureProof,
  WebGPURenderToTextureProofOptions
} from "./WebGPURenderToTextureProof";
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
export {
  createEnvironmentMapResourceSet,
  decodeRgba8EnvironmentToLinear,
  decodeRgbeEnvironmentMap,
  encodeLinearHdrEnvironmentToRgba8,
  encodeLinearHdrEnvironmentToRgba16f,
  generateApproximateBrdfLutPixels,
  generateDiffuseIrradianceRgba8,
  generateRgba8EnvironmentMipLevels,
  generateRgba16fEnvironmentMipLevels,
  generateRgba16fDiffuseIrradianceMipLevel,
  generateRgba16fSpecularPrefilterMipLevels,
  generateSpecularPrefilterMipLevels,
  linearChannelToSrgb,
  srgbChannelToLinear
} from "./EnvironmentMapResources";
export {
  createEnvironmentCapabilityReport,
  createEnvironmentFogProfile,
  createEnvironmentPreset,
  createEnvironmentStage,
  createEnvironmentUnsupportedRequestDisclosures,
  createInfiniteGroundGrid,
  applyEnvironmentFogToColor,
  createProceduralSkyDome,
  listEnvironmentCapabilities,
  sampleEnvironmentFogFactor
} from "./EnvironmentPlatform";
export type {
  EnvironmentCapability,
  EnvironmentCapabilityId,
  EnvironmentCapabilityReport,
  EnvironmentCapabilityStatus,
  EnvironmentFeatureRequest,
  EnvironmentFogInput,
  EnvironmentFogMode,
  EnvironmentFogOptions,
  EnvironmentFogPresetId,
  EnvironmentFogProfile,
  EnvironmentFogTelemetry,
  EnvironmentFogUniforms,
  EnvironmentPreset,
  EnvironmentPresetBackground,
  EnvironmentPresetGround,
  EnvironmentPresetLighting,
  EnvironmentPresetOptions,
  EnvironmentPresetType,
  EnvironmentStage,
  EnvironmentStageOptions,
  EnvironmentStagePresetId,
  EnvironmentUnsupportedRequestDisclosure,
  EnvironmentUnsupportedRequestDisclosureOptions
} from "./EnvironmentPlatform";
export {
  createEnvironmentPresetReport,
  createNamedEnvironmentPreset,
  listNamedEnvironmentPresets
} from "./EnvironmentPreset";
export type {
  EnvironmentPresetReport,
  NamedEnvironmentPresetDescriptor,
  NamedEnvironmentPresetId
} from "./EnvironmentPreset";
export {
  composeEnvironmentLighting
} from "./EnvironmentLighting";
export type {
  EnvironmentLightingCompositionOptions
} from "./EnvironmentLighting";
export {
  EXTERNAL_PARITY_TEXTURE_COLOR_POLICY,
  convertColorSpace,
  createColorConversionSamples,
  createExternalParityColorManagementPolicy,
  linearToSrgbChannel,
  srgbToLinearChannel,
  validateTextureColorSpace
} from "./ColorManagement";
export type {
  A3DColorConversionSample,
  A3DColorManagementPolicy,
  A3DColorSpace,
  A3DTextureColorSpaceValidation,
  A3DTextureSemantic
} from "./ColorManagement";
export {
  applyExternalParityToneMappingPreset,
  createExternalParityToneMappingPolicy,
  listExternalParityToneMappingPresets,
  toneMapExternalParityHdrPixels,
  toneMapExternalParityPixels
} from "./ToneMapping";
export type {
  ExternalParityToneMappingIntent,
  ExternalParityToneMappingPolicy
} from "./ToneMapping";
export {
  analyzeExternalParityExposure,
  createExternalParityExposurePolicy
} from "./Exposure";
export type {
  ExternalParityExposureAnalysis,
  ExternalParityExposurePolicy
} from "./Exposure";
export {
  createExternalParityHdrPipeline,
  executeExternalParityToneMapPass
} from "./HDRRenderPipeline";
export type {
  ExternalParityHdrPipeline,
  ExternalParityHdrPipelineDescriptor,
  ExternalParityHdrPipelineMode,
  ExternalParityHdrRenderTargetFormat
} from "./HDRRenderPipeline";
export {
  createRendererVisualPipelineReport,
  evaluateRendererCanvasBacking,
  evaluateRendererCaptureQuality,
  evaluateRendererFrameCadence,
  evaluateRendererScreenshotConsistency
} from "./RendererVisualPipelineReport";
export type {
  RendererCanvasBackingInput,
  RendererCanvasBackingReport,
  RendererCaptureQualityInput,
  RendererCaptureQualityReport,
  RendererFrameCadenceInput,
  RendererFrameCadenceReport,
  RendererScreenshotConsistencyInput,
  RendererScreenshotConsistencyReport,
  RendererUnsupportedVisualCapability,
  RendererVisualColorReport,
  RendererVisualHdrTargetReport,
  RendererVisualPipelineReport,
  RendererVisualPipelineReportOptions,
  RendererVisualPipelineStatus,
  RendererVisualPostprocessDescriptor,
  RendererVisualPostprocessPassName,
  RendererVisualPostprocessReport,
  RendererVisualTargetFormat,
  RendererVisualToneMappingReport
} from "./RendererVisualPipelineReport";
export {
  EXTERNAL_PARITY_REQUIRED_DEBUG_VIEWS,
  createExternalParityDebugView,
  createExternalParityDebugViewSet,
  encodeLinearDebugColor
} from "./RenderDebugViews";
export type {
  ExternalParityDebugViewInput,
  ExternalParityDebugViewResult,
  ExternalParityRenderDebugView
} from "./RenderDebugViews";
export {
  createExternalParityBrdfLut
} from "./BRDFLut";
export type { ExternalParityBrdfLut } from "./BRDFLut";
export {
  createExternalParityPmrem
} from "./PMREM";
export type { ExternalParityPmrem, ExternalParityPmremLevel } from "./PMREM";
export {
  createExternalParityIblResources
} from "./IBL";
export type { ExternalParityIblOptions, ExternalParityIblResourceSet } from "./IBL";
export {
  createExternalParityEnvironmentPipeline,
  listExternalParityEnvironmentTargets
} from "./EnvironmentPipeline";
export type {
  ExternalParityEnvironmentPipeline,
  ExternalParityEnvironmentPipelineOptions,
  ExternalParityEnvironmentTarget
} from "./EnvironmentPipeline";
export {
  EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT,
  createExternalParityMaterialExtensionDiagnostics,
  getExternalParityMaterialExtensionState
} from "./materials/MaterialExtensions";
export type {
  ExternalParityMaterialExtension,
  ExternalParityMaterialExtensionState
} from "./materials/MaterialExtensions";
export {
  EXTERNAL_PARITY_PHYSICAL_MATERIAL_MATRIX,
  ExternalParityPhysicalMaterial,
  analyzeExternalParityMaterialMatrix,
  createExternalParityPhysicalMaterial
} from "./materials/PhysicalMaterial";
export type {
  ExternalParityMaterialKind,
  ExternalParityPhysicalMaterialAnalysis,
  ExternalParityPhysicalMaterialDescriptor
} from "./materials/PhysicalMaterial";
export {
  sortExternalParityAlphaItems
} from "./materials/AlphaSorting";
export type { ExternalParityAlphaSortItem } from "./materials/AlphaSorting";
export {
  evaluateExternalParityTransmission
} from "./materials/TransmissionPass";
export type {
  ExternalParityTransmissionResult,
  ExternalParityTransmissionSample
} from "./materials/TransmissionPass";
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
export type {
  PostProcessCapabilityReport,
  PostProcessComposerDiagnostics,
  PostProcessComposerOptions,
  PostProcessComposerPass,
  PostProcessComposerRenderOptions,
  PostProcessUnsupportedEffect
} from "./postprocess/EffectComposer";
export { CINEMATIC_POSTPROCESS_EFFECT_IDS, analyzeCinematicPostprocessClarity, createCinematicDiagnosticsReport } from "./postprocess/CinematicDiagnostics";
export type {
  CinematicCapabilityArea,
  CinematicCapabilityEntry,
  CinematicCapabilityStatus,
  CinematicDiagnosticId,
  CinematicDiagnosticsBackendInfo,
  CinematicDiagnosticsReport,
  CinematicPostprocessClarityFinding,
  CinematicPostprocessClarityFindingId,
  CinematicPostprocessClarityInput,
  CinematicPostprocessClarityReport,
  CinematicPostprocessClaritySeverity,
  CinematicPostprocessClarityStatus,
  CinematicPostprocessFrameMetrics,
  CinematicPostprocessPipelineDescriptor,
  CinematicPostProcessEffectId
} from "./postprocess/CinematicDiagnostics";
export { createRendererStats } from "./performance/RendererStats";
export type { RendererStats, RendererStatsInput } from "./performance/RendererStats";
export { evaluateResourceBudget } from "./performance/ResourceBudget";
export type { ResourceBudget, ResourceBudgetReport, ResourceBudgetUsage } from "./performance/ResourceBudget";
export { sortRenderItems, sortRenderQueueItems } from "./performance/RenderItemSorting";
export type {
  SortableRenderItem,
  RenderQueueBucket,
  RenderQueuePlan,
  RenderQueueSortDiagnostics,
  RenderQueueSortItem,
  RenderQueueSortOptions
} from "./performance/RenderItemSorting";
export { createDefaultPerformanceLodLevels, selectPerformanceLodLevel } from "./performance/LOD";
export type { PerformanceLodLevel } from "./performance/LOD";
export type {
  BrdfLutDescriptor,
  DiffuseIrradianceGenerationOptions,
  EnvironmentColorSpace,
  EnvironmentHdrEncodeOptions,
  EnvironmentInputEncoding,
  EnvironmentMapResourceInput,
  EnvironmentMapResourceSet,
  EnvironmentMipGenerationOptions,
  EnvironmentResourceSetOptions,
  EnvironmentToneMappingOperator,
  LinearHdrEnvironmentMapSource,
  Rgba8EnvironmentMapSource,
  RgbeEnvironmentMapSource
} from "./EnvironmentMapResources";
export { Sampler } from "./Sampler";
export type { SamplerDescriptor, TextureAddressMode, TextureFilter, TextureMagFilter, TextureMinFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
export {
  ThreeCompatRenderer,
  createThreeCompatRenderer,
  summarizeThreeCompatRendererDiagnostics,
  THREE_COMPAT_REQUIRED_RENDERER_FEATURES
} from "./threejs-compatibility";
export type {
  ThreeCompatInstancingSystemStatus,
  ThreeCompatLightDescriptor,
  ThreeCompatLightKind,
  ThreeCompatMaterialMode,
  ThreeCompatRenderTargetDescriptor,
  ThreeCompatRendererBackend,
  ThreeCompatRendererDiagnostics,
  ThreeCompatRendererFeatureStatus,
  ThreeCompatRendererOptions,
  ThreeCompatRendererSupportState,
  ThreeCompatSceneRenderPlan,
  ThreeCompatShadowSystemStatus,
  ThreeCompatTextureCapability,
  ThreeCompatTransparencySystemStatus
} from "./threejs-compatibility";
export * from "./threejs-compatibility/postprocess";
export * from "./threejs-compatibility/shaders";
export * from "./threejs-compatibility/vfx";
export * from "./threejs-compatibility/performance";
export {
  ProductionWebGL2Renderer,
  ProductionRuntimeRenderer,
  ProductionWebGPURenderer,
  analyzePixels,
  createContactShadowPass,
  createProductionOrbitControlPreset,
  createProductionEnvironmentLightingResources,
  createProductionEffectsRenderSource,
  createProductionPbrHdrPipelineFromRadiance,
  createProductionToneMappingPolicy,
  createProductionWebGPUReport,
  resolveProductionRuntimeRendererBackend,
  loadProductionHdrEnvironment,
  parseProductionRadianceHDR,
  summarizeProductionAnimationWorkflow,
  summarizeProductionEffectsProof,
  summarizeProductionProductionProof,
  summarizeProductionWebGL2Proof
} from "./production-runtime";
export type {
  ProductionEffectsOptions,
  ProductionEffectsSummary,
  ProductionAnimationMetadataInput,
  ProductionAnimationWorkflowSummary,
  ProductionOrbitControlPreset,
  ProductionEnvironmentLightingResources,
  ProductionHdrEnvironmentLoaderOptions,
  ProductionLoadedHdrEnvironment,
  ProductionImportedAssetRenderMetadata,
  ProductionPbrHdrPipeline,
  ProductionPbrHdrPipelineOptions,
  ProductionPixelMetrics,
  ProductionProductionRenderer,
  ProductionRadianceHDR,
  ProductionRenderProof,
  ProductionRendererBackend,
  ProductionRendererFeature,
  ProductionRendererFeatureState,
  ProductionRendererInput,
  RuntimeParityFrameRenderResult,
  ProductionToneMappingOperator,
  ProductionToneMappingPolicy,
  ProductionWebGPUAdapterLike,
  ProductionWebGPULike,
  ProductionWebGPUReport,
  ProductionWebGPUStatus,
  ContactShadowPassDiagnostics,
  ProductionRuntimeRendererBackendPreference,
  ProductionRuntimeRendererBackendSelection,
  ProductionRuntimeRendererOptions,
  ProductionWebGL2RendererOptions,
  ProductionWebGPURendererOptions
} from "./production-runtime";

export { ShaderModule } from "./ShaderModule";
export { RenderPipeline } from "./RenderPipeline";
export type { PipelineDrawDescriptor, RenderPipelineDescriptor } from "./RenderPipeline";
export { ShaderPreprocessor } from "./ShaderPreprocessor";
export type { ShaderPreprocessOptions, ShaderPreprocessResult, ShaderSourceMapEntry } from "./ShaderPreprocessor";
export {
  DEFAULT_DEPTH_SHADER_MARKER,
  DEFAULT_DEPTH_SHADER_NAME,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_MARKER,
  DEFAULT_ENVIRONMENT_BACKGROUND_SHADER_NAME,
  DEFAULT_INSTANCED_PBR_SHADER_MARKER,
  DEFAULT_INSTANCED_PBR_SHADER_NAME,
  DEFAULT_INSTANCED_UNLIT_SHADER_MARKER,
  DEFAULT_INSTANCED_UNLIT_SHADER_NAME,
  DEFAULT_MORPH_UNLIT_SHADER_MARKER,
  DEFAULT_MORPH_UNLIT_SHADER_NAME,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_MARKER,
  DEFAULT_NORMAL_MAPPED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_SPECULAR_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_CLEARCOAT_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SHADER_MARKER,
  DEFAULT_TEXTURED_PBR_SHADER_NAME,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_IRIDESCENCE_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_SPECULAR_SHEEN_ANISOTROPY_TEXTURES_VARIANT,
  DEFAULT_TEXTURED_PBR_TRANSMISSION_VOLUME_TEXTURES_VARIANT,
  DEFAULT_SKINNED_LIT_SHADER_MARKER,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_SHADER_NAME,
  DEFAULT_TEXTURED_UNLIT_SHADER_MARKER,
  DEFAULT_TEXTURED_UNLIT_SHADER_NAME,
  DEFAULT_UNLIT_SHADER_MARKER,
  DEFAULT_UNLIT_SHADER_NAME,
  ShaderLibrary,
  createDefaultShaderLibrary
} from "./ShaderLibrary";
export type { CompiledShaderSource, ShaderSourcePair } from "./ShaderLibrary";
export type { ShaderVariantDescriptor } from "./ShaderLibrary";
export { SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
export type { ShaderChunk } from "./ShaderChunks";

export { DEFAULT_RENDER_STATE, Material, validateRenderState } from "./Material";
export type {
  CullMode,
  DepthCompare,
  MaterialDescriptor,
  MaterialUniformDescriptor,
  MaterialUniformKind,
  RenderState
} from "./Material";
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
export {
  TexturedPBRMaterial,
  isTexturedPbrTextureSlotShaderActive,
  texturedPbrShaderActiveTextureSlots
} from "./TexturedPBRMaterial";
export type { TexturedPBRMaterialOptions, TexturedPBRTextureSlot } from "./TexturedPBRMaterial";
export {
  MaterialPresetRegistry,
  createPhysicalMaterialPreset,
  defaultMaterialPresets,
  listPhysicalMaterialPresets,
  physicalMaterialPresetDescriptor
} from "./MaterialPresets";
export type {
  MaterialFactory,
  MaterialPresetDescriptor,
  MaterialPresetKind,
  MaterialPresetOptions,
  PhysicalMaterialPresetDescriptor,
  PhysicalMaterialPresetName
} from "./MaterialPresets";

export { BaseRenderPass } from "./RenderPass";
export type { RenderPass, RenderPassContext } from "./RenderPass";
export { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, EnvironmentBackgroundPass, createEnvironmentBackgroundUniforms } from "./EnvironmentBackgroundPass";
export type { EnvironmentBackgroundEncoding, EnvironmentBackgroundOptions, EnvironmentBackgroundProjection } from "./EnvironmentBackgroundPass";
export {
  ENVIRONMENT_BACKGROUND_CUBE_FACES,
  createCubemapEnvironmentBackgroundOptions,
  createEquirectEnvironmentBackgroundOptions,
  validateEnvironmentBackgroundResourceOptions
} from "./EnvironmentBackgroundResources";
export type {
  CubemapEnvironmentBackgroundFacePixels,
  CubemapEnvironmentBackgroundResourceOptions,
  EnvironmentBackgroundPixelFormat,
  EnvironmentBackgroundResourceOptions,
  EquirectEnvironmentBackgroundResourceOptions
} from "./EnvironmentBackgroundResources";
export { RenderGraph } from "./RenderGraph";
export type { RenderGraphPlan, RenderGraphResourceLifetime } from "./RenderGraph";
export { buildRenderDebugOverlaySnapshot, captureRenderDebugIssue, formatRenderDebugIssue } from "./RendererDebugOverlay";
export type { RenderDebugIssue, RenderDebugIssueKind, RenderDebugOverlaySnapshot } from "./RendererDebugOverlay";
export { RendererTimingCollector, createCpuFallbackGpuTimingBackend, createImmediateGpuTimingBackend, createWebGL2GpuTimingBackend } from "./RendererTiming";
export type {
  RendererGpuTimingBackend,
  RendererGpuTimingResult,
  RendererGpuTimingToken,
  RendererTimingCollectorOptions,
  RendererTimingSample,
  RendererTimingSampleSource,
  RendererTimingSnapshot
} from "./RendererTiming";
export { ForwardPass } from "./ForwardPass";
export { MAX_GPU_INSTANCES, MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES } from "./ForwardPass";
export type { EnvironmentLightingOptions, ForwardEnvironmentFogMode, ForwardEnvironmentFogOptions, ForwardPassOptions, ForwardShadowMapOptions, RenderItem, RenderItemDrawRange, RenderMaterial, SkinningPaletteBinding } from "./ForwardPass";
export { batchStaticRenderItems, buildStaticBoundsBvh, queryStaticBoundsBvh, raycastStaticBoundsBvh, selectLodLevel, updateStaticBoundsBvh } from "./SceneOptimization";
export type {
  LodLevel,
  LodSelection,
  LodSelectionInput,
  StaticBatchInput,
  StaticBatchOptions,
  StaticBatchResult,
  StaticBoundsBvh,
  StaticBoundsBvhBuildDiagnostics,
  StaticBoundsBvhNode,
  StaticBoundsBvhOptions,
  StaticBoundsBvhQueryOptions,
  StaticBoundsBvhQueryResult,
  StaticBoundsBvhRaycastDiagnostics,
  StaticBoundsBvhRaycastHit,
  StaticBoundsBvhRaycastResult,
  StaticBoundsBvhTraversalDiagnostics,
  StaticBoundsBvhUpdateResult,
  StaticBoundsIntersector,
  StaticSpatialBounds,
  StaticSpatialItem
} from "./SceneOptimization";
export { computePerspectiveCameraFrame } from "./CameraFraming";
export type { CameraFrameBounds, CameraFrameViewport, PerspectiveCameraFrame, PerspectiveCameraFrameOptions } from "./CameraFraming";
export { createStereoCameraRig } from "./StereoCameraRig";
export type { StereoCameraRig, StereoCameraRigOptions, StereoEye, StereoEyeView, StereoLayout, StereoViewport } from "./StereoCameraRig";
export { createAnaglyphCompositePlan, createAnaglyphPixelComposite, createParallaxBarrierInterleavePlan, createParallaxBarrierPixelComposite, createStereoEffectPlan } from "./StereoEffects";
export * from "./cinematic/index";
export type { AnaglyphCompositePlan, AnaglyphPixelComposite, AnaglyphPixelCompositeOptions, ParallaxBarrierInterleavePlan, ParallaxBarrierPixelComposite, ParallaxBarrierPixelCompositeOptions, StereoEffectMode, StereoEffectPlan, StereoEffectPlanOptions } from "./StereoEffects";
export { analyzeRgbaFrameVisualMetrics, evaluateFrameVisualQuality } from "./FrameVisualMetrics";
export type {
  FrameVisualBounds,
  FrameVisualMetrics,
  FrameVisualMetricsOptions,
  FrameVisualQualityResult,
  FrameVisualQualityThresholds
} from "./FrameVisualMetrics";
export { LightCollector } from "./LightCollector";
export type { CollectedLight, CollectedLightKind, LightCollectorOptions } from "./LightCollector";
export { LightUniforms, MAX_DIRECT_LIGHTS } from "./LightUniforms";
export type { PackedLightUniforms } from "./LightUniforms";
export { DepthMaterial, DepthPass } from "./DepthPass";
export type { DepthPassOptions } from "./DepthPass";
export { ShadowMap, computeShadowDepthBias, createPoissonDiskShadowKernel, createShadowAtlasLayout, createShadowFilterKernel } from "./ShadowMap";
export type {
  ShadowAtlasAllocation,
  ShadowAtlasLayout,
  ShadowAtlasRequest,
  ShadowFilterDistribution,
  ShadowFilterKernel,
  ShadowFilterMode,
  ShadowFilterSample,
  ShadowMapOptions
} from "./ShadowMap";
export { ShadowPass } from "./ShadowPass";
export type { ShadowPassOptions, ShadowPassReason, ShadowPassResult, ShadowTextureKind } from "./ShadowPass";
export { ShadowProjectionBuilder } from "./ShadowProjection";
export type { ShadowProjection, ShadowProjectionOptions, Vec3Tuple } from "./ShadowProjection";
export {
  BloomPass,
  DepthVisualizationPass,
  FXAAPass,
  ToneMappingPass,
  applyToneMappingPreset,
  bloomFloatPixels,
  bloomPixels,
  chromaticAberrationPixels,
  colorGradePixels,
  contactShadowPixels,
  computeAutoExposureFromHistogram,
  computeExposureHistogramFromPixels,
  createDepthTextureBinding,
  createToneMappingCalibration,
  depthTextureStats,
  depthOfFieldPixels,
  filmGrainPixels,
  fxaaPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  toneMapFloatPixels,
  toneMapPixels,
  toneMappingPresets,
  resolveToneMappingPreset,
  visualizeDepthTexture
} from "./PostProcessPass";
export type {
  AutoExposureOptions,
  AutoExposureResult,
  BloomOptions,
  BloomPassOptions,
  BloomResult,
  ChromaticAberrationOptions,
  ChromaticAberrationResult,
  ColorGradeOptions,
  ColorGradeResult,
  ContactShadowPostProcessOptions,
  ContactShadowPostProcessResult,
  DepthTextureBinding,
  DepthTextureFormat,
  DepthTextureStats,
  DepthVisualizationPassOptions,
  DepthVisualizationResult,
  DepthOfFieldOptions,
  DepthOfFieldResult,
  FilmGrainOptions,
  FilmGrainResult,
  FXAAOptions,
  FXAAPassOptions,
  FXAAResult,
  HdrToneMappingResult,
  ExposureHistogram,
  ExposureHistogramOptions,
  MotionBlurOptions,
  MotionBlurResult,
  OutlineOptions,
  OutlineResult,
  PostProcessColorSpace,
  SSAOOptions,
  SSAOResult,
  SSROptions,
  SSRResult,
  TAAOptions,
  TAAResult,
  ToneMappingCalibration,
  ToneMappingCalibrationSample,
  ToneMappingOperator,
  ToneMappingOptions,
  ToneMappingPassOptions,
  ToneMappingPreset,
  ToneMappingPresetName,
  ToneMappingPresetResult,
  ToneMappingResult
} from "./PostProcessPass";
export {
  architecturalMaterialCatalogSummary,
  architecturalMaterialDescriptor,
  createArchitecturalMaterial,
  createArchitecturalMaterialCatalog
} from "./ArchitecturalMaterialCatalog";
export type {
  ArchitecturalMaterialCatalogSummary,
  ArchitecturalMaterialCategory,
  ArchitecturalMaterialDescriptor
} from "./ArchitecturalMaterialCatalog";
export { createArchitecturalLightingFixture } from "./ArchitecturalLightingFixtures";
export type {
  ArchitecturalInteriorLight,
  ArchitecturalLightingFixture,
  ArchitecturalLightingFixtureOptions,
  ArchitecturalLightingPresetId,
  ArchitecturalLightType,
  ArchitecturalRgb,
  ArchitecturalVector3
} from "./ArchitecturalLightingFixtures";
export { createArchitecturalMeasurementFixture } from "./ArchitecturalMeasurementFixtures";
export type {
  ArchitecturalMeasurementFixture,
  ArchitecturalMeasurementOptions,
  ArchitecturalMeasurementResult,
  ArchitecturalMeasurementType,
  ArchitecturalMeasurementUnit,
  ArchitecturalPoint3
} from "./ArchitecturalMeasurementFixtures";
export {
  createProceduralTexture,
  createProceduralTextureFixture,
  createProceduralTextureFixtureManifest,
  hashRgba8,
  normalFromHeightMap,
  proceduralTextureFixtureKinds
} from "./ProceduralTextureFixtures";
export type { ProceduralTextureFixture, ProceduralTextureFixtureKind, ProceduralTextureFixtureOptions } from "./ProceduralTextureFixtures";
export { createProductTurntableFixture, createProductTurntableRenderKit } from "./ProductTurntableFixtures";
export type {
  ProductTurntableBatchTaskKind,
  ProductTurntableCaptureFormat,
  ProductTurntableCapturePlan,
  ProductTurntableDirection,
  ProductTurntableFixture,
  ProductTurntableFixtureOptions,
  ProductTurntableHotspot,
  ProductTurntableLighting,
  ProductTurntableLightingPreset,
  ProductTurntableRenderKit,
  ProductTurntableRenderKitOptions
} from "./ProductTurntableFixtures";
export { createCanonicalProductSceneRenderKit } from "./CanonicalSceneFixtures";
export type { CanonicalProductSceneFixture, CanonicalProductSceneRenderKit } from "./CanonicalSceneFixtures";
export { createLightingDefault } from "./LightingDefaults";
export type { LightingDefault, LightingDefaultPreset } from "./LightingDefaults";
export { createLightingRig, listLightingRigPresets } from "./LightingRig";
export type {
  LightingRig,
  LightingRigDiagnostics,
  LightingRigLightDescriptor,
  LightingRigOptions,
  LightingRigPreset,
  LightingRigUnsupportedFeature
} from "./LightingRig";
export { createTerrainHeightfieldFixture, sampleTerrainHeightfield } from "./TerrainFixtures";
export type { TerrainFixtureBiome, TerrainHeightfieldFixture, TerrainHeightfieldFixtureOptions, TerrainHeightfieldSample } from "./TerrainFixtures";
export { sampleWeatherFixture } from "./WeatherFixtures";
export type { WeatherFixtureOptions, WeatherFixtureSample, WeatherFixtureType, WeatherPuddlePatch, WeatherVisualDrop } from "./WeatherFixtures";
export { sampleVegetationFixture } from "./VegetationFixtures";
export type { VegetationFixtureInstance, VegetationFixtureLayer, VegetationFixtureLod, VegetationFixtureOptions, VegetationFixtureSample, VegetationLSystemBranchSegment, VegetationLSystemFixture } from "./VegetationFixtures";
export { sampleVoxelWorldFixture } from "./VoxelWorldFixtures";
export type {
  VoxelBlockDescriptor,
  VoxelFixtureBlockType,
  VoxelFixtureLod,
  VoxelFixtureOptions,
  VoxelVisibleBlock,
  VoxelWorldFixture
} from "./VoxelWorldFixtures";
export { sampleOceanFixture } from "./OceanFixtures";
export type {
  OceanBuoyancySample,
  OceanFixtureOptions,
  OceanFixturePreset,
  OceanFixtureSample,
  OceanFoamPatch,
  OceanWaveDescriptor,
  OceanWaveSample
} from "./OceanFixtures";
export { sampleCullingFixture } from "./CullingFixtures";
export type {
  CullingBvhTelemetry,
  CullingFeatureEvidence,
  CullingFixture,
  CullingFixtureObject,
  CullingFixtureOptions,
  CullingFrustumTelemetry,
  CullingHiZTelemetry
} from "./CullingFixtures";
export { sampleSpaceEnvironmentFixture } from "./SpaceEnvironmentFixtures";
export type {
  SpaceEnvironmentDustParticle,
  SpaceEnvironmentFixture,
  SpaceEnvironmentNebula,
  SpaceEnvironmentStar
} from "./SpaceEnvironmentFixtures";
export { LightingDebug } from "./LightingDebug";
export type { DebugLine } from "./LightingDebug";
export { CascadedShadowMaps, CascadedShadowPass, supportsCascadedShadowLight } from "./CascadedShadowMaps";
export type {
  CascadedShadowMapsOptions,
  CascadedShadowPassOptions,
  CascadedShadowPassResult,
  CascadeShadowPassResult,
  CascadeSplit,
  CascadeSplitOptions,
  ShadowCascade
} from "./CascadedShadowMaps";
export { DEFAULT_RENDERER_AUTO_FRAME_OPTIONS, DEFAULT_RENDERER_DIRECT_LIGHTING, DEFAULT_RENDERER_ENVIRONMENT_LIGHTING, Renderer } from "./Renderer";
export { pickSceneRenderableHits, pickSceneRenderables } from "./Renderer";
export type { CameraLike, RendererAnimationLoop, RendererCameraPolicy, RendererFrameCapture, RendererFrameCaptureDiagnosticsSummary, RendererFrameCaptureMetadata, RendererFrameCapturePixelDigest, RendererFrameCapturePixelStats, RendererFrameCaptureRenderSize, RendererFrameCaptureWithMetadata, RendererInput, RendererOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
export { assertRendererFeatures, createRendererFeatureReport, rendererFeatureCatalog } from "./RendererFeatureGates";
export type { RendererFeature, RendererFeatureReport, RendererFeatureStatus } from "./RendererFeatureGates";
export {
  createExternalParityEnvironmentLighting,
  createExternalParityDirectionalShadowEvidence,
  createExternalParityFlagshipRenderPresetEvidence,
  createExternalParityGeneratedEnvironmentMapSource,
  createExternalParityGeneratedHdrEnvironmentMapSource,
  createExternalParityRenderPresetEvidence,
  sampleExternalParityLdrPostprocessReadback,
  externalParityActiveFeature,
  externalParityBlockedFeature,
  externalParityUnsupportedFeature
} from "./ExternalParityRenderPreset";
export type {
  ExternalParityEnvironmentLightingBundle,
  ExternalParityEnvironmentPreset,
  ExternalParityDirectionalShadowEvidence,
  ExternalParityLdrPostprocessSummary,
  ExternalParityReadbackDevice,
  ExternalParityRenderPresetEvidence,
  ExternalParityRenderPresetEvidenceOptions,
  ExternalParityRenderPresetFeature,
  ExternalParityRenderPresetFeatureStatus
} from "./ExternalParityRenderPreset";
export {
  PBR_REFERENCE_EPSILON,
  PBR_REFERENCE_INV_PI,
  PBR_REFERENCE_MIN_ROUGHNESS,
  PBR_REFERENCE_PI,
  pbrCausticsConformanceSuite,
  pbrCausticsTransmissionResponse,
  pbrDiffuseBurley,
  pbrDirectLight,
  pbrDistributionGgx,
  pbrEnvironmentLight,
  pbrF0,
  pbrFresnelSchlick,
  pbrFresnelSchlickRoughness,
  pbrFresnelSchlickRoughnessSpecular,
  pbrFresnelSchlickSpecular,
  pbrGeometrySmithGgxCorrelated,
  pbrPhotometricConformanceSuite,
  pbrReferenceFinite,
  pbrReferenceLuminance,
  pbrSaturate,
  pbrTransmissionVolumeConformanceSuite,
  pbrTransmissionVolumeResponse
} from "./PbrReference";
export type {
  PbrDirectLightInput,
  PbrEnvironmentLightInput,
  PbrCausticsConformanceReport,
  PbrCausticsTransmissionInput,
  PbrCausticsTransmissionResponse,
  PbrPhotometricConformanceCategory,
  PbrPhotometricConformanceCheck,
  PbrPhotometricConformanceReport,
  PbrPhotometricConformanceSample,
  PbrTransmissionVolumeConformanceReport,
  PbrTransmissionVolumeInput,
  PbrTransmissionVolumeResponse,
  Vec3
} from "./PbrReference";
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
