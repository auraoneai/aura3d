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
export {
  buildGpuTargetInventory,
  GPU_TARGET_BUDGET_BYTES,
  resolveGpuTargetOwner,
  spreadGpuTargetInventory
} from "./RenderDevice";
export type { GpuTargetInventory, GpuTargetInventoryEntry, GpuTargetKind, GpuTargetOwner } from "./RenderDevice";
export { createRenderDevice } from "./RenderBackend";
export type { RenderBackendOptions } from "./RenderBackend";
export { WebGL2Device } from "./WebGL2Device";
export type { WebGL2BloomDiagnostics, WebGL2DeviceOptions } from "./WebGL2Device";
export { WebGL2StateCache } from "./WebGL2StateCache";
export type { WebGL2StateCacheDescriptor, WebGL2StateCacheSnapshot, WebGL2StateCacheStats } from "./WebGL2StateCache";
export { MAX_WEBGPU_SKINNING_JOINTS, decideSkinningPalettePath } from "./WebGPUSkinningLimits";
export type { SkinningCpuFallbackReason, SkinningPaletteDecision } from "./WebGPUSkinningLimits";
/*
 * WS-2.2 — TYPE-ONLY. The value moved to `./webgpu` (`@aura3d/engine/rendering/webgpu`).
 *
 * A value re-export here is a static graph edge, so every consumer of this barrel downloaded the
 * ~74 KB WebGPU device even when it only ever asked for `webgl2` — silently undoing the deliberate
 * `await import("./WebGPUDevice")` in `createRenderDevice` one file away. Measured on a one-cube
 * scene: an 18,689-byte gzip chunk on the critical path. A type-only export erases at build time.
 */
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
export type { Bounds3, CapsuleGeometryOptions, CylinderGeometryOptions, ScreenSpaceLineSegment, UVSphereGeometryOptions } from "./Geometry";
export { applyMorphTargets, computeMorphTargetEnvelopeBounds, computeMorphTargetWeightedBounds } from "./MorphTarget";
export type { MorphTargetDelta } from "./MorphTarget";
export { computeAnimatedSkinnedBoundsUnion, computeSkinnedGeometryBounds, computeSkinnedMorphTargetEnvelopeBounds, computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
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
  convolveEnvironmentIrradiance,
  evaluateShIrradiance,
  prefilterGgxEnvironmentLevels,
  projectEnvironmentIrradianceSh,
  specularPrefilterLevelRoughness
} from "./SpecularPrefilter";
export type {
  GgxPrefilteredEnvironmentLevel,
  GgxSpecularPrefilterOptions,
  LinearHdrEnvironmentMapOutput,
  ShIrradianceCoefficients
} from "./SpecularPrefilter";
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
  resolveVolumetricFog,
  resolveVolumetricQuality,
  selectVolumetricLight,
  volumetricLightDirection
} from "./VolumetricFog";
export type {
  VolumetricFogEffectParams,
  VolumetricFogQuality,
  VolumetricFogResolution,
  VolumetricQualityResolution
} from "./VolumetricFog";
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
export {
  bloomPyramidCompositeGain,
  normalizeBloomQualityPreset,
  resolveBloomPyramidPlan,
} from "./postprocess/NativeBloomPyramid";
export type {
  BloomPyramidMip,
  BloomPyramidPlan,
  BloomQualityPreset,
} from "./postprocess/NativeBloomPyramid";
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
export { DEFAULT_SAMPLER_ANISOTROPY, resolveSamplerAnisotropy, SAMPLER_ANISOTROPY_STEPS, Sampler } from "./Sampler";
export type { SamplerAnisotropyRequest, SamplerAnisotropyResolution, SamplerDescriptor, TextureAddressMode, TextureFilter, TextureMagFilter, TextureMinFilter } from "./Sampler";
export { UniformLayout } from "./UniformLayout";
export type { UniformFieldDescriptor, UniformFieldLayout, UniformFieldType } from "./UniformLayout";
export { isTextureBinding, TextureBinding } from "./TextureBinding";
export type { TextureBindingDescriptor, TextureBindingValidation, TextureTransformDescriptor } from "./TextureBinding";
/*
 * WS-3.4 — `./threejs-compatibility` is deleted, not re-exported from somewhere else.
 *
 * 49 files / 1,033 lines of bookkeeping objects that reported success without touching a GPU. It had no
 * device, no context and no draw call, and three of its outputs were fabricated:
 *
 *   SceneRenderer.ts:19-33   returned a hardcoded { meshes: 72, instances: 12000, skinnedMeshes: 4 }
 *   ThreeCompatRenderer:44   captureScreenshot() returned a URI string — there was never an image
 *   ThreeCompatRenderer:48   handleDeviceLost() set lost = true then immediately false, so it ALWAYS
 *                            reported { recovered: true }
 *
 * Its unit test asserted `canClaimRendererBreadth === true` and `instances >= 10000` against those
 * constants: a test that could not fail. Ten 4-line facade apps existed to give it a consumer, which is how
 * it satisfied the "parity requires a consumer" rule.
 *
 * `packages/three-compat/` is a DIFFERENT thing and is real — it is the migration on-ramp and stays.
 * `packages/animation/src/threejs-compatibility/` is also different and also real: it holds
 * `AnimationMixerThreeCompat`, `SkeletonThreeCompat` and `MorphTargetMixerThreeCompat`, the symbols WS-1.6
 * found the parity generator was failing to grep. Only the rendering one was fabricated.
 *
 * Retrievable from git history; recorded in `docs/architecture/2.0-removals.md`.
 */
export {
  ProductionWebGL2Renderer,
  ProductionRuntimeRenderer,
  ProductionWebGPURenderer,
  analyzePixels,
  bindTransmissionBackdropCapture,
  createSceneColorMipLevels,
  createTransmissionBackdropSource,
  createContactShadowPass,
  createProductionOrbitControlPreset,
  createDualProbeEnvironmentLightingResources,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  createProductionToneMappingPolicy,
  createProductionWebGPUReport,
  describeWebGPULostDevice,
  resolveProductionRuntimeRendererBackend,
  screenWebGPURenderBundlePrototype,
  WEBGPU_PARITY_PLAN,
  loadProductionHdrEnvironmentFile,
  loadProductionHdrEnvironment,
  normalizeTransmissionBackdropCapture,
  parseProductionRadianceHDR,
  rendererFeatureReport,
  rendererInteractiveFeatureReport,
  rendererProofCapture,
  rendererShadowReport,
  validateProductionRendererInput,
  summarizeProductionAnimationWorkflow,
  summarizeProductionProductionProof,
  summarizeProductionWebGL2Proof
} from "./production-runtime";
export type {
  ProductionAnimationMetadataInput,
  ProductionAnimationWorkflowSummary,
  DualProbeEnvironmentLightingOptions,
  ProductionOrbitControlPreset,
  ProductionEnvironmentLightingResources,
  ProductionHdrEnvironmentLoaderOptions,
  ProductionHdrEnvironmentFileLoaderOptions,
  ProductionHdrEnvironmentFileSource,
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
  RendererTimingDiagnostics,
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
  ProductionWebGPURendererOptions,
  WebGPULostDeviceReport,
  WebGPUParityFeatureId,
  WebGPUParityFeatureRow,
  WebGPUParityFeatureStatus,
  WebGPURenderBundlePrototype,
  RuntimeParityTransmissionBackdropCaptureOptions,
  RuntimeParityTransmissionBackdropCaptureProof,
  TransmissionBackdropSource
} from "./production-runtime";

export { ShaderModule } from "./ShaderModule";
export { PortableShaderCompilationError, PortableShaderMaterial } from "./PortableShaderMaterial";
export type {
  PortableShaderCompilationResult,
  PortableShaderMaterialOptions,
  PortableShaderSources,
  PortableShaderStagePair,
  PortableShaderUniform
} from "./PortableShaderMaterial";
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
  DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER,
  DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_MARKER,
  DEFAULT_SKINNED_LIT_EIGHT_INFLUENCE_SHADER_NAME,
  DEFAULT_SKINNED_LIT_SHADER_NAME,
  DEFAULT_SKINNED_UNLIT_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_MARKER,
  DEFAULT_SKINNED_UNLIT_EIGHT_INFLUENCE_SHADER_NAME,
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
export { MAX_UNIFORM_SKINNING_JOINTS, SHADER_CHUNKS, validateShaderChunks } from "./ShaderChunks";
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
export { ForwardPass, SkinningPaletteUploadManager, applyForwardSpotShadowMapUniforms } from "./ForwardPass";
export { MAX_GPU_INSTANCES, MAX_GPU_MORPH_TARGETS, MAX_GPU_MORPH_VERTICES, MAX_SKINNING_JOINTS } from "./ForwardPass";
export {
  createSpotShadowProjection,
  defaultSpotShadowKernel,
  projectSpotShadowUv,
  resolveSpotShadowFactor,
  selectSpotShadowAtlasTier,
} from "./shadows/SpotShadowMaps";
export type { ForwardSpotShadowMapOptions, SpotShadowAtlasTier, SpotShadowFactorInput, SpotShadowProjection } from "./shadows/SpotShadowMaps";
export {
  computeShimmerScore,
  createCascadeBiasTable,
  selectCascadeWithHysteresis,
} from "./shadows/CascadeHysteresis";
export type { CascadeBiasTableEntry, CascadeHysteresisInput, HysteresisCascadeSplit, ShimmerSample, ShimmerScore } from "./shadows/CascadeHysteresis";
export { createShadowAtlasPlan } from "./ShadowMap";
export type { ShadowAtlasFallback, ShadowAtlasPlan, ShadowAtlasPlanRequest } from "./ShadowMap";
export {
  createContactTelemetryFrame,
  resolveContactDarkening,
  resolveDepthAwareContactRadius,
} from "./shadows/ContactShadows";
export type { ContactDarkeningSample, ContactOccluder, ContactReceiverSample, ContactTelemetryFrame } from "./shadows/ContactShadows";
export {
  computeObliqueClipProjection,
  computePlanarMirrorCamera,
  computePlanarViewMatrix,
  createPlanarProjectionMatrix,
  createSsrPassDescriptor,
  GlassRefractionCapture,
  multiplyPlanarMatrices,
  PlanarReflectionCapture,
  resolveGlassRefractionParams,
  resolveWaterReflectionRefraction,
} from "./PlanarReflection";
export type {
  GlassRefractionCaptureOptions,
  GlassRefractionCaptureResult,
  GlassRefractionParams,
  GlassRefractionSceneRenderer,
  ObliqueClipProjection,
  PlanarMirrorCamera,
  PlanarReflectionCaptureOptions,
  PlanarReflectionCaptureResult,
  PlanarReflectionFrame,
  PlanarReflectionSceneRenderer,
  SsrPassDescriptor,
  WaterReflectionRefractionParams
} from "./PlanarReflection";
export {
  consolidateBatchedMeshes,
  instancingPathMatrix,
  resetInstancingFallbackWarnings,
  warnOnInstancingFallback,
} from "./InstancingDiagnostics";
export type { BatchedMeshResult, BatchedMeshTelemetry, InstancingFallbackReason, InstancingFallbackReport, InstancingPathEntry, InstancingPathSupport } from "./InstancingDiagnostics";
export {
  auditRenderOrder,
  createTerrainTileGrid,
  enforceFrameBudget,
  planScatterInstances,
  queryTerrainHeight,
  resolveTerrainSlopeBlend,
  scatterWindOffset,
} from "./TerrainTiles";
export type { FrameBudgetDecision, FrameBudgetInput, RenderOrderAuditEntry, ScatterPlan, ScatterPlanOptions, ScatterWindOffset, TerrainBlendLayer, TerrainTileGridOptions, TerrainTileKey, TerrainTilePlan } from "./TerrainTiles";
export {
  createBeamDescriptor,
  resolveBillboardCorners,
  resolveFlipbookUv,
} from "./SpriteFlipbook";
export type { BeamDescriptor, BillboardCorners, BillboardMode, BillboardOptions, FlipbookFrame } from "./SpriteFlipbook";
export {
  createMorphTargetPlan,
  planMorphTargets,
  resolveWrinkleMapStrength,
  DEFAULT_MORPH_DEVICE_LIMITS,
  MORPH_UNIFORM_MAX_TARGETS,
  MORPH_UNIFORM_MAX_VERTICES
} from "./MorphTargetPlan";
export type { MorphDeviceLimits, MorphPlanDecision, MorphPlanMode, MorphTargetPlan, WrinkleMapBinding, WrinkleMapHook } from "./MorphTargetPlan";
export type { EnvironmentLightingOptions, ForwardEnvironmentFogMode, ForwardEnvironmentFogOptions, ForwardPassOptions, ForwardShadowMapOptions, RenderItem, RenderItemDrawRange, RenderMaterial, SkinningPaletteBinding, SkinningPaletteDecisionRecord, SkinningPaletteDiagnostics, SkinningPalettePath } from "./ForwardPass";
export { batchStaticRenderItems, buildStaticBoundsBvh, queryStaticBoundsBvh, raycastStaticBoundsBvh, selectLodLevel, updateStaticBoundsBvh } from "./SceneOptimization";
export { consolidateStaticMeshes, deindexGeometryToNonIndexed } from "./MeshConsolidation";
export type { MeshConsolidationInput, MeshConsolidationOptions, MeshConsolidationResult } from "./MeshConsolidation";
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
export { computeOrthographicCameraFrame, computeOrthographicCameraView, computePerspectiveCameraFrame } from "./CameraFraming";
export type { CameraFrameBounds, CameraFrameViewport, OrthographicCameraFrame, OrthographicCameraFrameFitMode, OrthographicCameraFrameOptions, OrthographicCameraViewOptions, PerspectiveCameraFrame, PerspectiveCameraFrameOptions } from "./CameraFraming";
export {
  SDF_FONT_SCOPE_NOTE,
  SDF_OCCLUDED_OPACITY,
  SDF_SUPPORTED_GLYPHS,
  applySdfTextOcclusion,
  createSdfFontAtlas,
  createSdfTextQuadMesh,
  describeSdfTextPixelBacking,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
  resolveSdfTextFrameOpacity,
  sampleSdfCoverage,
  sdfTextLodFade,
  summarizeTextSurfaces
} from "./SdfText";
export type {
  SdfFontAtlas,
  SdfFontAtlasOptions,
  SdfGlyphMetrics,
  SdfPixelBacking,
  SdfPixelBackingInput,
  SdfTextFrameOpacity,
  SdfTextFrameOpacityInput,
  SdfTextLayout,
  SdfTextLayoutOptions,
  SdfTextOcclusionPolicy,
  SdfTextQuad,
  SdfTextQuadMesh,
  SdfTextRasterImage,
  SdfTextRasterOptions,
  SdfTextResolvedStyle,
  SdfTextRgba,
  SdfTextStyle,
  TextSurfaceSummary
} from "./SdfText";
export { createStereoCameraRig } from "./StereoCameraRig";
export type { StereoCameraRig, StereoCameraRigOptions, StereoEye, StereoEyeView, StereoLayout, StereoViewport } from "./StereoCameraRig";
export { createAnaglyphCompositePlan, createAnaglyphPixelComposite, createParallaxBarrierInterleavePlan, createParallaxBarrierPixelComposite, createStereoEffectPlan } from "./StereoEffects";
export { createCinematicDepthCompositionPlan, createCinematicLightingRig, createCinematicMaterialPreset, createCinematicPBRMaterial, createCinematicPostProcessStack, createDomOverlayEvidenceFlag, createEmissivePracticalLightSystem, createFogVolumeSystem, createGlowCardSystem, createRainParticleSystem, createRendererOwnedEvidenceFlag, createWetReflectionApproximation, listCinematicLightingRigs, listCinematicMaterialPresets, resolveCinematicMaterialPresetId, selectCinematicLightingRig, validateRendererOwnedCinematicEvidence } from "./cinematic/index";
export type { CinematicEvidenceFeature, CinematicRendererEvidenceFlag, CinematicRendererEvidenceValidation, CinematicRuntimeLight } from "./cinematic/index";
export type { AnaglyphCompositePlan, AnaglyphPixelComposite, AnaglyphPixelCompositeOptions, ParallaxBarrierInterleavePlan, ParallaxBarrierPixelComposite, ParallaxBarrierPixelCompositeOptions, StereoEffectMode, StereoEffectPlan, StereoEffectPlanOptions } from "./StereoEffects";
export { analyzeRgbaFrameMotionRegions, analyzeRgbaFrameVisualMetrics, evaluateFrameVisualQuality } from "./FrameVisualMetrics";
export type {
  FrameVisualBounds,
  FrameVisualMetrics,
  FrameVisualMetricsOptions,
  FrameMotionRegion,
  FrameMotionRegionMetrics,
  FrameVisualQualityResult,
  FrameVisualQualityThresholds
} from "./FrameVisualMetrics";
export { LightCollector } from "./LightCollector";
export type { CollectedLight, CollectedLightKind, LightCollectorOptions } from "./LightCollector";
export { LightUniforms, MAX_DIRECT_LIGHTS } from "./LightUniforms";
export type { PackedLightUniforms } from "./LightUniforms";
export { CLUSTER_TILE_SIZE, MAX_LIGHTS_PER_CLUSTER, createClusteredForwardLighting, resetClusteredForwardLightingWarnings } from "./ClusteredForwardLighting";
export type { ClusteredForwardFallbackPolicy, ClusteredForwardLightingDiagnostics, ClusteredForwardLightingOptions, ClusteredForwardLightingResources } from "./ClusteredForwardLighting";
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
  volumetricLightPixels,
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
  ToneMappingResult,
  VolumetricLightOptions,
  VolumetricLightResult
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
export { createArchitecturalLightingState } from "./ArchitecturalLighting";
export type {
  ArchitectureInteriorLight,
  ArchitecturalLightingState,
  ArchitecturalLightingOptions,
  ArchitectureLightingPreset,
  ArchitectureLightKind,
  ArchitectureRgb,
  ArchitectureVector3
} from "./ArchitecturalLighting";
export { createArchitecturalMeasurementSet } from "./ArchitecturalMeasurement";
export type {
  ArchitecturalMeasurementSet,
  ArchitecturalMeasurementOptions,
  ArchitecturalMeasurementResult,
  ArchitecturalMeasurementType,
  ArchitecturalMeasurementUnit,
  ArchitecturalPoint3
} from "./ArchitecturalMeasurement";
export {
  createProceduralTexture,
  createProceduralTextureFixture,
  createProceduralTextureFixtureManifest,
  hashRgba8,
  normalFromHeightMap,
  proceduralTextureFixtureKinds
} from "./ProceduralTexture";
export type { ProceduralTextureFixture, ProceduralTextureFixtureKind, ProceduralTextureFixtureOptions } from "./ProceduralTexture";
export { createProductTurntableFixture, createProductTurntableRenderKit } from "./ProductTurntable";
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
} from "./ProductTurntable";
export { createCanonicalProductSceneRenderKit } from "./CanonicalProductScene";
export type { CanonicalProductSceneFixture, CanonicalProductSceneRenderKit } from "./CanonicalProductScene";
export { createLightingDefault } from "./LightingDefaults";
export type { LightingDefault, LightingDefaultPreset } from "./LightingDefaults";
export { auditPrimitiveSubmission, formatPrimitiveSubmissionAudit } from "./PrimitiveSubmissionAudit";
export type {
  PrimitiveFrustumVerdict,
  PrimitiveSubmissionAudit,
  PrimitiveSubmissionAuditOptions,
  PrimitiveSubmissionBlocker,
  PrimitiveSubmissionRecord
} from "./PrimitiveSubmissionAudit";
export { arenaShowdown, cinematicNight, createLightingRig, listLightingRigPresets, productHero, resolveSubjectRimPlacement } from "./LightingRig";
export type {
  LightingRig,
  LightingRigDiagnostics,
  LightingRigSubject,
  SubjectRimPlacement,
  SubjectRimPlacementOptions,
  LightingRigLightDescriptor,
  LightingRigOptions,
  LightingRigPreset,
  LightingRigUnsupportedFeature
} from "./LightingRig";
export { createTerrainHeightfieldFixture, createTerrainHeightfieldGeometry, sampleTerrainHeightfield } from "./TerrainHeightfield";
export type {
  TerrainFixtureBiome,
  TerrainHeightfieldColliderDescriptor,
  TerrainHeightfieldFixture,
  TerrainHeightfieldFixtureOptions,
  TerrainHeightfieldGeometry,
  TerrainHeightfieldGeometryOptions,
  TerrainHeightfieldSample
} from "./TerrainHeightfield";
export { createWeatherState } from "./Weather";
export type { WeatherOptions, WeatherState, WeatherType, WeatherPuddlePatch, WeatherVisualDrop } from "./Weather";
export { sampleVegetationFixture } from "./VegetationScatter";
export type { VegetationFixtureInstance, VegetationFixtureLayer, VegetationFixtureLod, VegetationFixtureOptions, VegetationFixtureSample, VegetationLSystemBranchSegment, VegetationLSystemFixture } from "./VegetationScatter";
export { createVoxelWorld } from "./VoxelWorld";
export type {
  VoxelBlockDescriptor,
  VoxelBlockType,
  VoxelLod,
  VoxelWorldOptions,
  VoxelVisibleBlock,
  VoxelWorldState
} from "./VoxelWorld";
export { sampleOceanFixture } from "./OceanSurface";
export { createDayNightSky, sampleCloudNoise, DAY_NIGHT_SKY_CLAIM_BOUNDARY } from "./DayNightSky";
export type {
  DayNightSkyCloudCell,
  DayNightSkyDisc,
  DayNightSkyOptions,
  DayNightSkyStar,
  DayNightSkyState
} from "./DayNightSky";
export {
  applyWetnessToColor,
  applyWetnessToRoughness,
  describeWetMaterial,
  sampleLightningFlash,
  samplePuddleMask
} from "./AtmosphereWetness";
export type { LightningFlashSample, WetnessMaterialResponse, WetnessProbe } from "./AtmosphereWetness";
export {
  createWaterSurface,
  WATER_SURFACE_CLAIM_BOUNDARY,
  WATER_SURFACE_PLANAR_DEPENDENCY
} from "./WaterSurface";
export type {
  WaterDepthBand,
  WaterFoamMask,
  WaterSurfaceBoat,
  WaterSurfaceOptions,
  WaterSurfacePreset,
  WaterSurfaceState,
  WaterWakeSegment
} from "./WaterSurface";
export { WaterReflectionRefractionCapture } from "./OceanSurface";
export type {
  OceanBuoyancySample,
  OceanFixtureOptions,
  OceanFixturePreset,
  OceanFixtureSample,
  OceanFoamPatch,
  OceanWaveDescriptor,
  OceanWaveSample,
  WaterCaptureFrame,
  WaterReflectionRefractionOptions,
  WaterReflectionRefractionResult,
  WaterReflectionSceneRenderer,
  WaterRefractionSceneRenderer
} from "./OceanSurface";
export { createSpaceEnvironment } from "./SpaceEnvironment";
export type {
  SpaceEnvironmentDustParticle,
  SpaceEnvironmentState,
  SpaceEnvironmentNebula,
  SpaceEnvironmentStar
} from "./SpaceEnvironment";
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
export type { CameraLike, RendererAnimationLoop, RendererCameraFrameOptions, RendererCameraPolicy, RendererCameraProjection, RendererFrameCapture, RendererFrameCaptureDiagnosticsSummary, RendererFrameCaptureMetadata, RendererFrameCapturePixelDigest, RendererFrameCapturePixelStats, RendererFrameCaptureRenderSize, RendererFrameCaptureWithMetadata, RendererInput, RendererOptions, RendererPostProcessOptions, RendererShadowOptions, RenderSource, ResizeToDisplayOptions, ResizeToDisplayResult, ScenePickHit, ScenePickOptions } from "./Renderer";
export { createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
export type { RendererPostProcessPassName, RendererPostProcessPassPlan, RendererPostprocessChainCostEstimate, RendererPostprocessExecutionMode, RendererPostprocessPassDiagnostics, RendererPostprocessPlanContext, RendererPostprocessPlanDiagnostics, RendererPostprocessPlannedVsActual, RendererPostprocessPlanOptions, RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
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
export {
  AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK,
  applyPresetPackExposure,
  meanLinearLuma
} from "./EnvironmentPresetPack";
export type {
  EnvironmentPresetPack,
  EnvironmentPresetPackEntry,
  EnvironmentPresetPackSlot
} from "./EnvironmentPresetPack";
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
  pbrAnisotropicDistribution,
  pbrCausticsConformanceSuite,
  pbrCausticsTransmissionResponse,
  pbrCharlieSheen,
  pbrDiffuseBurley,
  pbrDirectLight,
  pbrDistributionGgx,
  pbrEncodeOutput,
  pbrEnvironmentFogFactor,
  pbrEnvironmentLight,
  pbrEnvironmentLightSplitSum,
  pbrF0,
  pbrFresnelSchlick,
  pbrFresnelSchlickRoughness,
  pbrFresnelSchlickRoughnessSpecular,
  pbrFresnelSchlickSpecular,
  pbrGeometrySmithGgxCorrelated,
  pbrIridescenceColor,
  pbrLinearToSrgbChannel,
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
  PbrFogFactorInput,
  PbrPhotometricConformanceCategory,
  PbrPhotometricConformanceCheck,
  PbrPhotometricConformanceReport,
  PbrPhotometricConformanceSample,
  PbrSplitSumEnvironmentInput,
  PbrTransmissionVolumeConformanceReport,
  PbrTransmissionVolumeInput,
  PbrTransmissionVolumeResponse,
  Vec3
} from "./PbrReference";
export { createProjectedDecalGeometry, createRaycastProjectedDecalGeometry } from "./production-runtime/geometry/ProjectedDecalGeometry";
export type { ProjectedDecalBox, ProjectedDecalRaycastOptions, ProjectedDecalTriangleMesh } from "./production-runtime/geometry/ProjectedDecalGeometry";
// T5.3: "./DecalGeometry.js" names had no importers — removed from the barrel.
// T5.3: "./GeometryPrimitives.js" names had no importers — removed from the barrel.
// T5.3: "./Instancing.js" names had no importers — removed from the barrel.
// T5.3: "./LineGeometry.js" names had no importers — removed from the barrel.
// T5.3: "./SpriteGeometry.js" names had no importers — removed from the barrel.
// T5.3: "./Raycaster.js" names had no importers — removed from the barrel.
export { CubeCameraReflectionCapture } from "./ReflectionProbe.js";
export { createReflectionSurface } from "./ReflectionSurfaces.js";
// T5.3: "./RenderQueue.js" names had no importers — removed from the barrel.
// T5.3: "./RenderState.js" names had no importers — removed from the barrel.
// T5.3: "./ResourceLifecycle.js" names had no importers — removed from the barrel.
// T5.3: "./UniformBinder.js" names had no importers — removed from the barrel.
// T5.3: "./performance/FrustumCuller.js" names had no importers — removed from the barrel.
// T5.3: "./performance/BVH.js" names had no importers — removed from the barrel.
// T5.3: "./performance/Octree.js" names had no importers — removed from the barrel.
// T5.3: "./performance/Batcher.js" names had no importers — removed from the barrel.
// T5.3: "./webgpu/WebGPUBuffer.js" names had no importers — removed from the barrel.
// T5.3: "./webgpu/WebGPUPipelineCache.js" names had no importers — removed from the barrel.
// T5.3: "./webgpu/WebGPUPostProcess.js" names had no importers — removed from the barrel.
// T5.3: "./webgpu/WebGPUTexture.js" names had no importers — removed from the barrel.
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


// T5.3: "./effects/ResidentGPUParticleRenderer.js" names had no importers — removed from the barrel.

// Aura3D Quality Rebuild contract surface (CONTRACTS.md §3.8).
export * from "./contracts/index.js";
export * from "./lanes/index.js";

// PRD-15 T5.4 restore — names dropped by the §6.1 curation that the
// deprecated-subpath contract (pre-collapse surface until 4.0.0) requires.
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
export type { AnimationMaterialTreatment } from "./animation/AnimationMaterialStyle.js";
export type { AnimationToonMaterialOptions, AnimationToonShaderRegistrar, ToonShadeInputs } from "./animation/AnimationToonMaterial.js";
export type { AnimationRenderPresetLightingDescriptor, ApplyAnimationRenderPresetFrame, ApplyAnimationRenderPresetOptions, ApplyAnimationRenderPresetResult } from "./animation/applyAnimationRenderPreset.js";
export type { CinematicBloomPass } from "./cinematic/BloomPass.js";
export type { CinematicDepthCompositionPlan } from "./cinematic/CinematicDepthComposition.js";
export type { CinematicDomOverlayRejection } from "./cinematic/CinematicEvidence.js";
export type { CinematicLightRole, CinematicLightType, CinematicLightingRig, CinematicLightingRigId } from "./cinematic/CinematicLightingRig.js";
export type { CinematicMaterialPreset, CinematicMaterialPresetId } from "./cinematic/CinematicMaterialPresets.js";
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
export type { ProjectedDecalBasis, ProjectedDecalGeometryResult, ProjectedDecalRay, ProjectedDecalRaycastHit, ProjectedDecalRaycastResult, ProjectedDecalShape } from "./production-runtime/geometry/ProjectedDecalGeometry.js";
