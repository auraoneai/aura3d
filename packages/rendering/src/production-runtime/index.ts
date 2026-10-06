export {
  analyzePixels,
  summarizeProductionProductionProof,
  summarizeProductionWebGL2Proof,
  validateProductionRendererInput,
  rendererFeatureReport,
  rendererInteractiveFeatureReport,
  rendererShadowReport,
  rendererProofCapture
} from "./renderProofs";
export * from "./backendSelection";
// T2.6 — the `ProductionWebGL2Renderer` and `ProductionRuntimeRenderer` wrapper
// classes were deleted; both names now alias the C-29 `Renderer` (deprecated
// until Phase 8 prunes the public surface). The moved proof/feature/shadow
// reports live in `@aura3d/engine`'s agent-api devtools as
// `rendererProofCapture`/`rendererFeatureReport`/`rendererShadowReport`.
export { Renderer } from "../Renderer";
export { Renderer as ProductionWebGL2Renderer, Renderer as ProductionRuntimeRenderer } from "../Renderer";
export {
  bindTransmissionBackdropCapture,
  createSceneColorMipLevels,
  createTransmissionBackdropSource,
  normalizeTransmissionBackdropCapture
} from "./TransmissionBackdropCapture";
export type { TransmissionBackdropSource } from "./TransmissionBackdropCapture";
export type { ProductionWebGL2RendererOptions } from "./backendSelection";
export {
  createDualProbeEnvironmentLightingResources,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  createProductionToneMappingPolicy,
  parseProductionRadianceHDR
} from "./PBRHDRPipeline";
export {
  ProductionWebGPURenderer,
  createProductionWebGPUReport,
  createProductionWebGPUReadinessReport,
  describeWebGPULostDevice,
  screenWebGPURenderBundlePrototype,
  WEBGPU_PARITY_PLAN
} from "./ProductionWebGPURenderer";
export {
  createProductionOrbitControlPreset,
  summarizeProductionAnimationWorkflow
} from "./AnimationControlsPipeline";
export type {
  DualProbeEnvironmentLightingOptions,
  ProductionEnvironmentLightingResources,
  ProductionPbrHdrPipeline,
  ProductionPbrHdrPipelineOptions,
  ProductionRadianceHDR,
  ProductionToneMappingOperator,
  ProductionToneMappingPolicy
} from "./PBRHDRPipeline";
export type {
  ProductionWebGPUAdapterLike,
  ProductionWebGPULike,
  ProductionWebGPUReport,
  ProductionWebGPUStatus,
  ProductionWebGPUReadinessItem,
  ProductionWebGPUReadinessReport,
  ProductionWebGPURendererOptions,
  WebGPULostDeviceReport,
  WebGPUParityFeatureId,
  WebGPUParityFeatureRow,
  WebGPUParityFeatureStatus,
  WebGPURenderBundlePrototype
} from "./ProductionWebGPURenderer";
export type {
  ProductionAnimationMetadataInput,
  ProductionAnimationWorkflowSummary,
  ProductionOrbitControlPreset
} from "./AnimationControlsPipeline";
export {
  PRODUCTION_WEBGL2_REQUIRED_FEATURES,
  RUNTIME_PARITY_WEBGPU_REQUIRED_FEATURES
} from "./ProductionRendererTypes";
export type {
  RendererTimingDiagnostics,
  ProductionImportedAssetRenderMetadata,
  ProductionPixelMetrics,
  ProductionProductionRenderer,
  ProductionRenderProof,
  ProductionRendererBackend,
  ProductionRendererFeature,
  ProductionRendererFeatureState,
  ProductionRendererInput,
  RendererFrameResult,
  RuntimeParityTransmissionBackdropCaptureOptions,
  RuntimeParityTransmissionBackdropCaptureProof
} from "./ProductionRendererTypes";

export * from "./backends/RendererBackend";
export * from "./backends/WebGL2RendererBackend";
export * from "./backends/WebGPURendererBackend";
export * from "./framegraph/FrameGraph";
export * from "./framegraph/RenderPass";
export * from "./resources/GPUBuffer";
export * from "./resources/GPUTexture";
export * from "./resources/RenderTarget";
export * from "./resources/ResourceCache";
export * from "./scene/RenderableScene";
export * from "./scene/RenderableMesh";
export * from "./scene/RenderablePrimitive";
export * from "./scene/Camera";
export * from "./scene/Lights";
export * from "./materials/PBRMaterial";
export * from "./materials/PBRShaderFeatures";
export * from "./materials/MaterialCompiler";
export * from "./materials/MaterialTextureBindings";
export * from "./materials/GLTFMaterialAdapter";
export * from "./materials/GLTFPBRMaterialAdapter";
export * from "./shaders/ShaderProgramLibrary";
export * from "./environment/HDRLoader";
export * from "./environment/PMREMGenerator";
export * from "./environment/EnvironmentMap";
export * from "./geometry/ProjectedDecalGeometry";
export * from "./passes/DepthPrepass";
export * from "./passes/ShadowPass";
export * from "./passes/ContactShadowPass";
export * from "./passes/OpaquePass";
export * from "./passes/TransparentPass";
export * from "./passes/SkyboxPass";
export * from "./passes/ToneMappingPass";
export * from "./passes/FramegraphTopology";
export * from "./postprocess/ProductionEffectComposer";
export * from "./postprocess/ProductionPostProcessTypes";
export * from "./postprocess/BloomPass";
export * from "./postprocess/SSAOPass";
export * from "./postprocess/DOFPass";
export * from "./postprocess/FXAAPass";
export * from "./postprocess/ColorGradingPass";
export * from "./animation/SkinningRenderer";
export * from "./animation/MorphTargetRenderer";
export * from "./diagnostics/FrameCapture";
export * from "./diagnostics/RendererStats";
export * from "./diagnostics/GPUCapabilities";
export * from "./lights/LightManager";
export * from "./lights/ShadowMapRenderer";
export * from "./color/ColorManagement";
export * from "./color/ToneMapping";
export * from "./backends/webgl2/WebGL2Shader";
export * from "./backends/webgl2/WebGL2Buffer";
export * from "./backends/webgl2/WebGL2Texture";
export * from "./backends/webgl2/WebGL2RenderTarget";
export * from "./backends/webgl2/WebGL2StateCache";
export * from "./backends/webgl2/WebGL2Capabilities";
export * from "./backends/webgpu/WebGPUShader";
export * from "./backends/webgpu/WebGPUBuffer";
export * from "./backends/webgpu/WebGPUTexture";
export * from "./backends/webgpu/WebGPURenderTarget";
export * from "./backends/webgpu/WebGPUCapabilities";
export { createNativeFrameGraphBindings } from './framegraph/NativeFrameGraphBindings';
export type { NativeFrameGraphBindingsOptions } from './framegraph/NativeFrameGraphBindings';
