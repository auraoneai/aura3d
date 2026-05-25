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
  V4_TEXTURE_COLOR_POLICY,
  convertColorSpace,
  createColorConversionSamples,
  createV4ColorManagementPolicy,
  linearToSrgbChannel,
  srgbToLinearChannel,
  validateTextureColorSpace
} from "./ColorManagement";
export type {
  G3DColorConversionSample,
  G3DColorManagementPolicy,
  G3DColorSpace,
  G3DTextureColorSpaceValidation,
  G3DTextureSemantic
} from "./ColorManagement";
export {
  applyV4ToneMappingPreset,
  createV4ToneMappingPolicy,
  listV4ToneMappingPresets,
  toneMapV4HdrPixels,
  toneMapV4Pixels
} from "./ToneMapping";
export type {
  V4ToneMappingIntent,
  V4ToneMappingPolicy
} from "./ToneMapping";
export {
  analyzeV4Exposure,
  createV4ExposurePolicy
} from "./Exposure";
export type {
  V4ExposureAnalysis,
  V4ExposurePolicy
} from "./Exposure";
export {
  createV4HdrPipeline,
  executeV4ToneMapPass
} from "./HDRRenderPipeline";
export type {
  V4HdrPipeline,
  V4HdrPipelineDescriptor,
  V4HdrPipelineMode,
  V4HdrRenderTargetFormat
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
  V4_REQUIRED_DEBUG_VIEWS,
  createV4DebugView,
  createV4DebugViewSet,
  encodeLinearDebugColor
} from "./RenderDebugViews";
export type {
  V4DebugViewInput,
  V4DebugViewResult,
  V4RenderDebugView
} from "./RenderDebugViews";
export {
  createV4BrdfLut
} from "./BRDFLut";
export type { V4BrdfLut } from "./BRDFLut";
export {
  createV4Pmrem
} from "./PMREM";
export type { V4Pmrem, V4PmremLevel } from "./PMREM";
export {
  createV4IblResources
} from "./IBL";
export type { V4IblOptions, V4IblResourceSet } from "./IBL";
export {
  createV4EnvironmentPipeline,
  listV4EnvironmentTargets
} from "./EnvironmentPipeline";
export type {
  V4EnvironmentPipeline,
  V4EnvironmentPipelineOptions,
  V4EnvironmentTarget
} from "./EnvironmentPipeline";
export {
  V4_MATERIAL_EXTENSION_SUPPORT,
  createV4MaterialExtensionDiagnostics,
  getV4MaterialExtensionState
} from "./materials/MaterialExtensions";
export type {
  V4MaterialExtension,
  V4MaterialExtensionState
} from "./materials/MaterialExtensions";
export {
  V4_PHYSICAL_MATERIAL_MATRIX,
  V4PhysicalMaterial,
  analyzeV4MaterialMatrix,
  createV4PhysicalMaterial
} from "./materials/PhysicalMaterial";
export type {
  V4MaterialKind,
  V4PhysicalMaterialAnalysis,
  V4PhysicalMaterialDescriptor
} from "./materials/PhysicalMaterial";
export {
  sortV4AlphaItems
} from "./materials/AlphaSorting";
export type { V4AlphaSortItem } from "./materials/AlphaSorting";
export {
  evaluateV4Transmission
} from "./materials/TransmissionPass";
export type {
  V4TransmissionResult,
  V4TransmissionSample
} from "./materials/TransmissionPass";
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
export { createV4RendererStats } from "./performance/RendererStats";
export type { V4RendererStats, V4RendererStatsInput } from "./performance/RendererStats";
export { evaluateV4ResourceBudget } from "./performance/ResourceBudget";
export type { V4ResourceBudget, V4ResourceBudgetReport, V4ResourceBudgetUsage } from "./performance/ResourceBudget";
export { sortV4RenderItems, sortRenderQueueItems } from "./performance/RenderItemSorting";
export type {
  V4SortableRenderItem,
  RenderQueueBucket,
  RenderQueuePlan,
  RenderQueueSortDiagnostics,
  RenderQueueSortItem,
  RenderQueueSortOptions
} from "./performance/RenderItemSorting";
export { createV4DefaultLodLevels, selectV4LodLevel } from "./performance/LOD";
export type { V4LodLevel } from "./performance/LOD";
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
  RendererV5,
  createRendererV5,
  summarizeV5RendererDiagnostics,
  V5_REQUIRED_RENDERER_FEATURES
} from "./threejs-compatibility";
export type {
  V5InstancingSystemStatus,
  V5LightDescriptor,
  V5LightKind,
  V5MaterialMode,
  V5RenderTargetDescriptor,
  V5RendererBackend,
  V5RendererDiagnostics,
  V5RendererFeatureStatus,
  V5RendererOptions,
  V5RendererSupportState,
  V5SceneRenderPlan,
  V5ShadowSystemStatus,
  V5TextureCapability,
  V5TransparencySystemStatus
} from "./threejs-compatibility";
export * from "./threejs-compatibility/postprocess";
export * from "./threejs-compatibility/shaders";
export * from "./threejs-compatibility/vfx";
export * from "./threejs-compatibility/performance";
export {
  ProductionWebGL2Renderer,
  ProductionWebGPURenderer,
  analyzePixels,
  createV6OrbitControlPreset,
  createV6EnvironmentLightingResources,
  createV6EffectsRenderSource,
  createV6PbrHdrPipelineFromRadiance,
  createV6ToneMappingPolicy,
  createV6WebGPUReport,
  loadV6HdrEnvironment,
  parseV6RadianceHDR,
  summarizeV6AnimationWorkflow,
  summarizeV6EffectsProof,
  summarizeV6ProductionProof,
  summarizeV6WebGL2Proof
} from "./production-runtime";
export type {
  V6EffectsOptions,
  V6EffectsSummary,
  V6AnimationMetadataInput,
  V6AnimationWorkflowSummary,
  V6OrbitControlPreset,
  V6EnvironmentLightingResources,
  V6HdrEnvironmentLoaderOptions,
  V6LoadedHdrEnvironment,
  V6ImportedAssetRenderMetadata,
  V6PbrHdrPipeline,
  V6PbrHdrPipelineOptions,
  V6PixelMetrics,
  V6ProductionRenderer,
  V6RadianceHDR,
  V6RenderProof,
  V6RendererBackend,
  V6RendererFeature,
  V6RendererFeatureState,
  V6RendererInput,
  V7FrameRenderResult,
  V6ToneMappingOperator,
  V6ToneMappingPolicy,
  V6WebGPUAdapterLike,
  V6WebGPULike,
  V6WebGPUReport,
  V6WebGPUStatus,
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
export type { CameraLike, RendererAnimationLoop, RendererCameraPolicy, RendererFrameCapture, RendererInput, RendererOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
export { assertRendererFeatures, createRendererFeatureReport, rendererFeatureCatalog } from "./RendererFeatureGates";
export type { RendererFeature, RendererFeatureReport, RendererFeatureStatus } from "./RendererFeatureGates";
export {
  createV4EnvironmentLighting,
  createV4DirectionalShadowEvidence,
  createV4FlagshipRenderPresetEvidence,
  createV4GeneratedEnvironmentMapSource,
  createV4GeneratedHdrEnvironmentMapSource,
  createV4RenderPresetEvidence,
  sampleV4LdrPostprocessReadback,
  v4ActiveFeature,
  v4BlockedFeature,
  v4UnsupportedFeature
} from "./V4RenderPreset";
export type {
  V4EnvironmentLightingBundle,
  V4EnvironmentPreset,
  V4DirectionalShadowEvidence,
  V4LdrPostprocessSummary,
  V4ReadbackDevice,
  V4RenderPresetEvidence,
  V4RenderPresetEvidenceOptions,
  V4RenderPresetFeature,
  V4RenderPresetFeatureStatus
} from "./V4RenderPreset";
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
