import { WEBGPU_EXTENSION_ATLAS_WGSL, webgpuExtensionAtlasUniforms } from "./WebGPUExtensionAtlas";
import {
  type BufferUsage,
  type DrawCommand,
  type RecursiveUniformValue,
  type NativeShaderStorageLayout,
  type PortableShaderBinding,
  type RenderBuffer,
  type RenderCommandState,
  type RenderDevice,
  RenderDeviceError,
  type RenderDeviceDiagnostics,
  type RenderDeviceInfo,
  type RenderResourceCopyOptions,
  type RenderResourceReadbackOptions,
  type RenderShaderProgram,
  type PrimitiveTopology,
  type RenderTarget,
  type RenderTargetColorRegion,
  type RenderTargetDescriptor,
  type LdrPostprocessPresentationOptions,
  type NativeWebGPUDofFrame,
  type NativeWebGPUDofFrameDescriptor,
  type ShaderReflection,
  type NativeAmbientOcclusionRequest,
  type NativeSceneDofRequest,
  type ShaderCompilationDiagnostic,
  type ShaderSources,
  type UniformValue,
  getRenderAttachmentIdentity,
  validateRenderAttachmentAccess,
  validateRenderTargetDescriptor,
  viewBytes,
  resolveGpuTargetOwner,
  spreadGpuTargetInventory
} from "./RenderDevice";
import { resourceDisposalInProgress, resourceDisposalPending } from "./ResourceLifecycle";
import { MAX_WEBGPU_SKINNING_JOINTS } from "./WebGPUSkinningLimits";
import { normalizeWebGPUTemporalOptions, WEBGPU_TAA_FRAGMENT, WEBGPU_TAA_OUTPUT_FRAGMENT, type WebGPUTemporalInputs } from "./webgpu/WebGPUTemporal";
import {
  resolveWebGPUVolumetricLight, webgpuGodRaysFragment, webgpuGodRaysUniforms, webgpuMotionReconstructFragment, webgpuMotionReconstructUniforms,
  webgpuMotionTileUniforms, webgpuMotionVelocityFragment, webgpuMotionVelocityUniforms, webgpuVolumetricLightFragment, webgpuVolumetricLightUniforms,
  WEBGPU_GODRAYS_COMPOSITE_FRAGMENT, WEBGPU_MOTION_NEIGHBOR_FRAGMENT, WEBGPU_MOTION_TILE_MAX_FRAGMENT,
  type WebGPUGodRaysRequest, type WebGPUMotionBlurRequest
} from "./webgpu/WebGPUDepthEffects";
import {
  defaultWebGPUBloomWeights,
  isWebGPUBloomV2,
  normalizeWebGPUColorGradeOptions,
  normalizeWebGPUBloomOptions,
  normalizeWebGPUBloomV2Options,
  WEBGPU_BLOOM_V2_ACCUMULATE_FRAGMENT,
  WEBGPU_BLOOM_V2_BLUR_FRAGMENT,
  WEBGPU_BLOOM_V2_COMPOSITE_FRAGMENT,
  WEBGPU_BLOOM_V2_DOWNSAMPLE_FRAGMENT,
  WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT,
  WEBGPU_HDR_GRADE_FRAGMENT,
  webgpuBlurFragment,
  webgpuBloomCompositeFragment,
  webgpuBrightExtractFragment,
  webgpuColorGradeFragment,
  WEBGPU_POST_VERTEX_WGSL,
  type WebGPUBloomDiagnostics,
  type WebGPUBloomOptions,
  type WebGPUColorGradeOptions
} from "./webgpu/WebGPUPostShaders";
import { DEFAULT_DEPTH_SHADER_MARKER } from "./ShaderLibraryCore";
import { resolveBloomPyramidPlan, resolveBloomPyramidV2Response } from "./postprocess/NativeBloomPyramid";
import { FXAA_NATIVE_INTERMEDIATE_WGSL } from "./post/shaders/fxaa.wgsl";
import { reflectShaderSources } from "./ShaderReflection";
import { clearPostSkipped, recordPostSkipped, recordPostStage } from "./renderer/postSkipped";
import type { PostDiagnosticToken } from "./renderer/PostDiagnosticsScope";
import { registeredPostPasses, type PostPassDescriptor } from "./contracts/post";
import { parseCubeLut } from "./post/CubeLut";
import type { LutTexture3D } from "./post/PostGraph";
import type { FrameContributorContext } from "./contracts/frameGraph";
import type { Sampler, TextureMagFilter, TextureMinFilter } from "./Sampler";
import { Texture, bytesPerPixel, claimRenderTargetTextureOwner, compressedTextureByteLength, getRenderTargetTextureOwner, isCompressedTextureFormat, type TextureCubeFace, type TextureFormat, type TexturePixelData } from "./Texture";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import { VertexFormat } from "./VertexFormat";
import { WebGPUResourceInterop } from "./webgpu/ResourceInterop";
import { convertNativeVertexRecords, needsNativeVertexConversion, planNativeVertexConversion,
  NATIVE_VERTEX_CONVERSION_MAX_BYTES, NATIVE_VERTEX_CONVERSION_MAX_INDICES, NATIVE_VERTEX_CONVERSION_MAX_OPERATIONS,
  type NativeVertexConversionPlan } from "./webgpu/NativeVertexAttributeConversion";
import { assertRgba8Level, filterNativeDataMip, planNativeDataMipmaps } from "./webgpu/NativeDataMipmaps";
import { negotiateDepthConvention, resolveDepthDrawState, type DepthConvention, type DepthPrecisionSupport, type DepthStorage } from "./DepthConvention";
import { deriveShaderDataLayout, type ShaderDataLayout, type ShaderDataType, type ShaderDataValue } from "./webgpu/ShaderDataLayout";
import { deriveUniformDataLayout, emitWgslStruct, writeUniformData, type UniformBlockLayout } from "./program/UniformLayout";
import { resolveNativeRenderState, applyNativeRenderDynamicState, validateNativeVertexLayouts } from "./webgpu/NativeRenderState";
import { warmNativePipelineVariants, type NativePipelineWarmupJob, type NativePipelineWarmupOutcome } from "./webgpu/NativePipelineWarmup";
import { PostViewHistory, type PostHistoryLease } from "./post/PostGraph";
import { WebGPUAutoExposure, normalizeWebGPUAutoExposure, type WebGPUExposureDraw, type WebGPUExposureResult } from "./post/WebGPUAutoExposure";
import { createOutputWgsl } from "./output/ToneMappingOperators.wgsl";
import { WebGPULinearDepth, linearizeWebGPUDepthSample, type WebGPULinearDepthDraw } from "./post/WebGPULinearDepth";
import { NATIVE_DOF_CA_WGSL, NATIVE_DOF_FINALIZE_WGSL, NATIVE_DOF_VIGNETTE_WGSL, nativeDofCustomAnchorPrecedesDof, type NativeDofDisplayStages } from "./webgpu/NativeDofDisplayStages";
import { WebGPUDepthOfField, nativeDofVertexColorSupported, validateWebGPUDepthOfFieldOptions, type WebGPUDepthOfFieldDraw } from "./post/WebGPUDepthOfField";
import { resolveWebGPUSsrOptions, validateWebGPUSsrFrame, webgpuSsrCompositeUniforms, webgpuSsrTraceUniforms } from "./post/WebGPUScreenSpaceReflections";
import { SSR_COMPOSITE_WGSL, SSR_TRACE_MSAA_WGSL, SSR_TRACE_WGSL } from "./post/shaders/ssr.wgsl";
import { validateNativePostEffect, type NativePostEffect } from "./post/NativeEffectShaders";
import { NATIVE_EFFECT_WGSL } from "./webgpu/NativeEffectShaders.wgsl";
import { invertMat4, type Mat4 } from "@aura3d/scene";
import { normalizeWebGPUGtaoOptions, normalizeWebGPUSsaoOptions, packWebGPUAoApplyUniforms, packWebGPUAoDenoiseUniforms, packWebGPUAoLinearDepthUniforms,
  packWebGPUGtaoUniforms, packWebGPUSsaoUniforms, webgpuGtaoFragment, WEBGPU_AO_APPLY_FRAGMENT, WEBGPU_AO_DENOISE_FRAGMENT, webgpuAoLinearDepthFragment,
  WEBGPU_AO_MINMAX_HALF_FRAGMENT, WEBGPU_SSAO_FRAGMENT } from "./webgpu/WebGPUAmbientOcclusion";
import { generateProgramImpl, GENERATED_PROGRAM_MARKER } from "./program/ProgramGenerator";
import { createGeneratedPbrProgram, packGeneratedPbrMaterialUniforms, validateGeneratedPbrTarget, validateGeneratedPhotometricPacket, type GeneratedPbrProgram } from "./webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram, packGeneratedUnlitMaterialUniforms, GENERATED_UNLIT_MATERIAL_OFFSETS, type GeneratedUnlitProgram } from "./webgpu/GeneratedUnlitProgram";
import { assertNativePointQuadSubmission, withNativePointQuadLease, type NativePointQuadSubmission } from "./webgpu/NativePointQuads";
import { validateNativePointRasterInputs } from "./webgpu/NativePointShader";
import { UnlitMaterial } from "./UnlitMaterial";
import { MaterialInstance } from "./MaterialInstance";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "./program/ProgramFeatures";
import { WebGPUGaussianSplatColorAdapter, type WebGPUSplatRegion, type WebGPUSplatSurface } from "./webgpu/GaussianSplatSurface";
import type { GaussianSplatColorAdapter } from "./GaussianSplatColorComposite";
import { acquireTextureBudgetLimit, applyTextureBudget, DEFAULT_TEXTURE_BUDGET_POLICY, releaseTextureBudget, reserveTextureBudget, retireTextureBudget, setTextureBudgetResidentBytes, textureBudgetReport, TextureBudgetExceededError, type TextureBudgetPolicy } from "./textures/TextureBudget";
import { NativeRenderBundleCache, type NativeRenderBundleCommand } from "./production-runtime/NativeRenderBundleCache";
import { ZERO_TO_ONE_PROJECTION_OVERRIDE, ZERO_TO_ONE_PROJECTION_WGSL, declaresZeroToOneProjectionOverride, rasterClipDepthWgsl } from "./webgpu/ProjectionClip";
import { consumeRendererPostAccess } from "./renderer/FrameGraph";

const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080
} as const;
const MAP_MODE = {
  READ: 0x0001
} as const;

const TEXTURE_USAGE = {
  RENDER_ATTACHMENT: 0x0010,
  COPY_SRC: 0x0001,
  COPY_DST: 0x0002,
  TEXTURE_BINDING: 0x0004,
  STORAGE_BINDING: 0x0008
} as const;
const DEPTH_TEXTURE_FORMAT = "depth24plus-stencil8";
const FLOAT_DEPTH_STENCIL_FEATURE = "depth32float-stencil8";
const NATIVE_MORPH_MAX_TARGETS = 4;
const NATIVE_MORPH_MAX_VERTICES = 64;
const NATIVE_MORPH_UNIFORM_FLOATS = 28 + NATIVE_MORPH_MAX_TARGETS * NATIVE_MORPH_MAX_VERTICES * 4;
let nextWebGPUGeneration = 1;
interface WebGPUCanvasOwner {
  readonly device: WebGPUDeviceLike;
}
// A native device can be borrowed by multiple legacy wrappers. Canvas
// configuration belongs to the particular wrapper, not just that device.
const canvasOwners = new WeakMap<WebGPUCanvasContextLike, WebGPUCanvasOwner>();

// Legacy WebGPUDevice callers may supersede one another, but not a managed
// renderer's reservation, including initialization and asynchronous retirement.
// A native device is never shared with a managed lease.
interface ManagedWebGPUCanvasLease {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  context?: WebGPUCanvasContextLike;
  device?: WebGPUDeviceLike;
  owner?: WebGPUDevice;
  recovering: boolean;
  uncertain: boolean;
}
const managedCanvases = new WeakMap<HTMLCanvasElement | OffscreenCanvas, ManagedWebGPUCanvasLease>();
const managedCanvasContexts = new WeakMap<WebGPUCanvasContextLike, ManagedWebGPUCanvasLease>();
const managedNativeDevices = new WeakMap<WebGPUDeviceLike, ManagedWebGPUCanvasLease>();
const nativeDeviceOwners = new WeakMap<WebGPUDeviceLike, Set<WebGPUDevice>>();
const canvasDeviceOwners = new WeakMap<WebGPUCanvasContextLike, Set<WebGPUDevice>>();

function releaseManagedCanvasLease(lease: ManagedWebGPUCanvasLease): void {
  if (managedCanvases.get(lease.canvas) === lease) managedCanvases.delete(lease.canvas);
  if (lease.context && managedCanvasContexts.get(lease.context) === lease) managedCanvasContexts.delete(lease.context);
  if (lease.device && managedNativeDevices.get(lease.device) === lease) managedNativeDevices.delete(lease.device);
}

function webGPUCanvasInUse(): RenderDeviceError {
  return new RenderDeviceError(
    "WEBGPU_CANVAS_IN_USE: The canvas is already owned by a WebGPU renderer; managed WebGPU apps cannot share a canvas.",
    "WEBGPU_CANVAS_IN_USE"
  );
}

function webGPUDeviceInUse(): RenderDeviceError {
  return new RenderDeviceError(
    "WEBGPU_DEVICE_IN_USE: The native WebGPU device is already owned; managed renderers cannot share it.",
    "WEBGPU_DEVICE_IN_USE"
  );
}

const WEBGPU_NATIVE_COPY_FRAGMENT = `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@fragment fn fs_copy(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
 let c = textureSample(source, linearSampler, clamp(uv, params.xy * 0.5, vec2<f32>(1.0) - params.xy * 0.5));
 let rgb = select(c.rgb, c.rgb * c.a, params.z > 0.5);
 let alpha = select(c.a, 1.0, params.w > 0.5);
 return vec4<f32>(rgb, alpha);
}`;
/** Detach the per-frame display-stage values from caller-owned objects. */
function snapshotNativeDofDisplay(stages: NativeDofDisplayStages): NativeDofDisplayStages {
  const values = [stages.chromaticAberration?.intensity, ...(stages.vignette ? [stages.vignette.intensity, stages.vignette.smoothness,
    stages.vignette.roundness, ...stages.vignette.color] : []), ...(stages.finalize ? Object.values(stages.finalize) : [])];
  if (values.some(value => value !== undefined && (typeof value !== "number" || !Number.isFinite(value)))) {
    throw new RenderDeviceError("Native depth-of-field display stages require finite values", "WEBGPU_DOF_INVALID");
  }
  return Object.freeze({
    ...(stages.chromaticAberration ? { chromaticAberration: Object.freeze({ intensity: stages.chromaticAberration.intensity }) } : {}),
    ...(stages.vignette ? { vignette: Object.freeze({ intensity: stages.vignette.intensity, smoothness: stages.vignette.smoothness,
      roundness: stages.vignette.roundness, color: Object.freeze([stages.vignette.color[0], stages.vignette.color[1], stages.vignette.color[2]] as const) }) } : {}),
    ...(stages.finalize ? { finalize: Object.freeze({ ...stages.finalize }) } : {})
  });
}
/**
 * Remove the custom passes anchored before native depth of field from the chain slots and return them by anchor,
 * each list keeping the slot order (ascending `order`, then registration).
 */
function takeNativeDofPrecedingCustoms(customAt: Map<number, PostPassDescriptor[]>): {
  readonly afterDepth: PostPassDescriptor[]; readonly beforeTaa: PostPassDescriptor[]; readonly afterTaa: PostPassDescriptor[];
} {
  const taken: PostPassDescriptor[] = [];
  for (const [position, list] of customAt) {
    const kept = list.filter(pass => !nativeDofCustomAnchorPrecedesDof(pass.insertAt));
    taken.push(...list.filter(pass => nativeDofCustomAnchorPrecedesDof(pass.insertAt)));
    if (kept.length) customAt.set(position, kept); else customAt.delete(position);
  }
  const order = (pass: PostPassDescriptor): number => typeof pass.order === "number" && Number.isFinite(pass.order) ? pass.order : Number.MAX_SAFE_INTEGER;
  const sorted = taken.sort((a, b) => order(a) - order(b));
  return { afterDepth: sorted.filter(pass => pass.insertAt === "after-depth"),
    beforeTaa: sorted.filter(pass => pass.insertAt === "before-taa"), afterTaa: sorted.filter(pass => pass.insertAt === "after-taa") };
}

/** Single-sample float copy of a (possibly 4x-resolved or rgba8) color source for the scene DoF kernel. */
const WEBGPU_SCENE_DOF_COLOR_FRAGMENT = /* wgsl */ `@group(0) @binding(2) var u_color: texture_2d<f32>;
@fragment fn fs_scene_dof_color(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  return textureLoad(u_color, vec2<i32>(position.xy), 0);
}
`;

/**
 * The WebGL2 S10b user-LUT fetch on display-referred colour: the `.cube` rows are lattice samples at i/(N-1), so the
 * coordinate gets the half-texel remap, and `bypass` (1 - intensity) keeps that much of the ungraded colour.
 */
const WEBGPU_DISPLAY_LUT_FRAGMENT = /* wgsl */ `struct LutParams { size: f32, bypass: f32, _pad: vec2<f32> };
@group(0) @binding(0) var<uniform> u_params: LutParams;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;
@group(0) @binding(3) var u_lut: texture_3d<f32>;
@fragment fn fs_display_lut(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let source = textureLoad(u_color, vec2<i32>(position.xy), 0);
  let n = u_params.size;
  let coord = clamp(source.rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * ((n - 1.0) / n) + vec3<f32>(0.5 / n);
  let graded = textureSampleLevel(u_lut, u_sampler, coord, 0.0).rgb;
  return vec4<f32>(mix(graded, source.rgb, u_params.bypass), source.a);
}
`;

/** One fragment for the 4x DoF producer resolve (see resolveNativeDofMultisampleProducer). */
function nativeDofMultisampleResolveWgsl(reversed: boolean, clearDepth: number): string {
  return `
@group(0) @binding(0) var colorTex: texture_2d<f32>;
@group(0) @binding(1) var coverageTex: texture_2d<f32>;
@group(0) @binding(2) var depthTex: texture_depth_multisampled_2d;
struct ResolveOut { @location(0) color: vec4<f32>, @location(1) coverage: vec4<f32>, @builtin(frag_depth) depth: f32 };
@fragment fn fs_dof_msaa_resolve(@builtin(position) position: vec4<f32>) -> ResolveOut {
  let p = vec2<i32>(floor(position.xy));
  var nearest = textureLoad(depthTex, p, 0);
  for (var i = 1; i < 4; i = i + 1) { nearest = ${reversed ? "max" : "min"}(nearest, textureLoad(depthTex, p, i)); }
  let covered = textureLoad(coverageTex, p, 0).r > 0.0;
  var out: ResolveOut;
  out.color = textureLoad(colorTex, p, 0);
  out.coverage = vec4<f32>(select(0.0, 1.0, covered), 0.0, 0.0, 0.0);
  out.depth = select(${clearDepth.toFixed(1)}, nearest, covered);
  return out;
}`;
}
// Area weights preserve all source texels when a mip dimension is odd.
const WEBGPU_MIP_AREA_FRAGMENT = `
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(2) var source: texture_2d<f32>;
@fragment fn fs_mip(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
 let sourceSize = vec2<f32>(textureDimensions(source));
 let pixel = floor(position.xy);
 let lo = pixel * sourceSize / params.xy;
 let hi = (pixel + vec2<f32>(1.0)) * sourceSize / params.xy;
 let first = vec2<i32>(floor(lo));
 var total = vec4<f32>(0.0);
 for (var y = 0; y < 3; y += 1) {
   for (var x = 0; x < 3; x += 1) {
     let p = first + vec2<i32>(x, y);
     let weight = max(0.0, min(hi.x, f32(p.x + 1)) - max(lo.x, f32(p.x)))
       * max(0.0, min(hi.y, f32(p.y + 1)) - max(lo.y, f32(p.y)));
     if (weight > 0.0) { total += textureLoad(source, p, 0) * weight; }
   }
 }
 return total / max((hi.x - lo.x) * (hi.y - lo.y), 0.000001);
}`;
// ACES is the WebGL2 output curve (ACES_FILMIC_GLSL): the 1/0.6 viewing scale, the ACES working-gamut rows, Hill's
// RRT+ODT fit and the display rows, so a WebGPU frame tone-maps like the default backend.
const WEBGPU_NATIVE_TONE_FRAGMENT = `
fn a3dNativeToneAces(color: vec3<f32>) -> vec3<f32> {
 let v = color / 0.6;
 let w = vec3<f32>(dot(vec3<f32>(0.59719, 0.35458, 0.04823), v), dot(vec3<f32>(0.07600, 0.90834, 0.01566), v), dot(vec3<f32>(0.02840, 0.13383, 0.83777), v));
 let f = ((w + vec3<f32>(0.0245786)) * w - vec3<f32>(0.000090537)) / ((0.983729 * w + vec3<f32>(0.432951)) * w + vec3<f32>(0.238081));
 return clamp(vec3<f32>(dot(vec3<f32>(1.60475, -0.53108, -0.07367), f), dot(vec3<f32>(-0.10208, 1.10813, -0.00605), f), dot(vec3<f32>(-0.00327, -0.07276, 1.07602), f)), vec3<f32>(0.0), vec3<f32>(1.0));
}
@group(0) @binding(0) var<uniform> params: vec4<f32>;
@group(0) @binding(1) var linearSampler: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;
@fragment fn fs_tone(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
 let sample = textureSample(source, linearSampler, uv);
 var c = max(sample.rgb * params.x / params.w, vec3<f32>(0.0));
 if (params.y > 5.5) { c = min(vec3<f32>(1.0), (c * (vec3<f32>(1.0) + c / 7.5)) / (vec3<f32>(1.0) + c)); }
 else if (params.y > 2.5) { let toe=max(c-vec3<f32>(0.004),vec3<f32>(0.0)); c=min((toe*(6.2*toe+vec3<f32>(0.5)))/(toe*(6.2*toe+vec3<f32>(1.7))+vec3<f32>(0.06)),c*1.08); }
 else if (params.y > 1.5) { c = a3dNativeToneAces(c); }
 else if (params.y > 0.5) { c = c / (vec3<f32>(1.0) + c); }
 if (params.z > 0.5) { c = select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), c * 12.92, c <= vec3<f32>(0.0031308)); }
 return vec4<f32>(c, sample.a);
}`;
// The matrix converts linear sRGB primaries to linear Display-P3. Both
// encodings then use the same nonlinear output transfer on unorm canvases.
const WEBGPU_NATIVE_TONE_P3_FRAGMENT = `
fn a3dLinearSrgbToDisplayP3(c: vec3<f32>) -> vec3<f32> {
 return vec3<f32>(dot(c, vec3<f32>(0.822461969, 0.177538031, 0.0)),
   dot(c, vec3<f32>(0.033194199, 0.966805801, 0.0)),
   dot(c, vec3<f32>(0.017082631, 0.072397441, 0.910519929)));
}
${WEBGPU_NATIVE_TONE_FRAGMENT.replace(" if (params.z > 0.5)", " c = a3dLinearSrgbToDisplayP3(c);\n if (params.z > 0.5)")}`;

/** Recognize only the existing independently generated opaque P3 output variant. */
function isNativeP3OutputSources(sources: ShaderSources): boolean {
  if (sources.marker !== "a3d.output" || !sources.label.startsWith("prd01-output-") || !sources.webgpu || !sources.portableBindings || sources.webgpu.storageBindings?.length) return false;
  const parts = sources.label.slice("prd01-output-".length).split("|");
  if (parts.length !== 7 || parts.slice(1, 5).some(value => value !== "0" && value !== "1") ||
      parts[2] !== "0" || parts[5] !== "display-p3" || parts[6] !== "opaque") return false;
  try {
    const expected = createOutputWgsl({ toneMapping: parts[0]!, backgroundCoverage: parts[1] === "1", overlay: false,
      vignette: parts[3] === "1", fullCoverage: parts[4] === "1", outputColorSpace: "display-p3", alphaMode: "opaque" });
    return sources.webgpu.vertex === expected.webgpu.vertex && sources.webgpu.fragment === expected.webgpu.fragment &&
      JSON.stringify(sources.portableBindings) === JSON.stringify(expected.portableBindings);
  } catch { return false; }
}

export interface WebGPULike {
  requestAdapter(): Promise<WebGPUAdapterLike | null>;
  getPreferredCanvasFormat?(): string;
  readonly wgslLanguageFeatures?: { has(feature: string): boolean };
}

export interface WebGPUAdapterLike {
  requestDevice(descriptor?: { readonly requiredFeatures?: readonly string[]; readonly requiredLimits?: Readonly<Record<string, number>> }): Promise<WebGPUDeviceLike>;
  readonly features?: { has(feature: string): boolean };
  readonly limits?: Readonly<Record<string, number>>;
  readonly name?: string;
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
}

export interface WebGPUDeviceLike {
  readonly queue: WebGPUQueueLike;
  readonly lost?: Promise<WebGPUDeviceLostInfoLike>;
  readonly features?: { has(feature: string): boolean };
  readonly limits?: Readonly<Record<string, number>>;
  createBuffer(descriptor: WebGPUBufferDescriptorLike): WebGPUBufferLike;
  createShaderModule?(descriptor: { readonly label?: string; readonly code: string }): WebGPUShaderModuleLike;
  createRenderPipeline?(descriptor: WebGPURenderPipelineDescriptorLike): WebGPURenderPipelineLike;
  createRenderPipelineAsync?(descriptor: WebGPURenderPipelineDescriptorLike): Promise<WebGPURenderPipelineLike>;
  createBindGroupLayout?(descriptor: WebGPUBindGroupLayoutDescriptorLike): unknown;
  createPipelineLayout?(descriptor: { readonly label?: string; readonly bindGroupLayouts: readonly unknown[] }): unknown;
  createBindGroup?(descriptor: WebGPUBindGroupDescriptorLike): WebGPUBindGroupLike;
  createTexture?(descriptor: WebGPUTextureDescriptorLike): WebGPUTextureLike;
  createSampler?(descriptor?: WebGPUSamplerDescriptorLike): WebGPUSamplerLike;
  createCommandEncoder?(descriptor?: { readonly label?: string }): WebGPUCommandEncoderLike;
  destroy?(): void;
}

export interface WebGPUDeviceLostInfoLike {
  readonly reason?: string;
  readonly message?: string;
}

export interface WebGPUShaderModuleLike {
  readonly [key: string]: unknown;
  getCompilationInfo?(): Promise<{
    readonly messages: readonly {
      readonly type: "error" | "warning" | "info";
      readonly message: string;
      readonly lineNum?: number;
      readonly linePos?: number;
    }[];
  }>;
}

export interface WebGPUQueueLike {
  writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void;
  writeTexture?(destination: WebGPUImageCopyTextureLike, data: ArrayBuffer | ArrayBufferView, dataLayout: WebGPUImageDataLayoutLike, size: WebGPUExtent3DLike): void;
  copyExternalImageToTexture?(source: WebGPUImageCopyExternalImageLike, destination: WebGPUImageCopyTextureLike, size: WebGPUExtent3DLike): void;
  submit(commands: readonly unknown[]): void;
  onSubmittedWorkDone?(): Promise<void>;
}

export interface WebGPUBufferDescriptorLike {
  readonly label?: string;
  readonly size: number;
  readonly usage: number;
  readonly mappedAtCreation?: boolean;
}

export interface WebGPUBufferLike {
  mapAsync?(mode: number): Promise<void>;
  getMappedRange?(): ArrayBuffer;
  unmap?(): void;
  destroy(): void;
}

export interface WebGPUTextureDescriptorLike {
  readonly label?: string;
  readonly size: readonly [number, number, number?] | { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number };
  readonly format: string;
  readonly usage: number;
  readonly mipLevelCount?: number;
  readonly sampleCount?: number;
  readonly dimension?: "1d" | "2d" | "3d";
}

export interface WebGPUTextureLike {
  /** Native GPUTexture metadata. Optional for injected test devices. */
  readonly format?: string;
  readonly usage?: number;
  readonly sampleCount?: number;
  readonly mipLevelCount?: number;
  createView(descriptor?: {
    readonly dimension?: string;
    readonly mipLevelCount?: number;
    readonly arrayLayerCount?: number;
    readonly baseMipLevel?: number;
    readonly baseArrayLayer?: number;
    readonly aspect?: "all" | "depth-only" | "stencil-only";
  }): unknown;
  destroy(): void;
}

export interface WebGPUSamplerDescriptorLike {
  readonly minFilter?: "nearest" | "linear";
  readonly magFilter?: "nearest" | "linear";
  readonly mipmapFilter?: "nearest" | "linear";
  readonly addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressModeW?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly maxAnisotropy?: number;
}

export interface WebGPUSamplerLike {}

export interface WebGPUCanvasContextLike {
  configure(configuration: WebGPUCanvasConfigurationLike): void;
  getCurrentTexture(): WebGPUTextureLike;
  getConfiguration?(): WebGPUCanvasConfigurationLike | null;
  unconfigure?(): void;
}

export interface WebGPUCanvasConfigurationLike {
  readonly device: WebGPUDeviceLike;
  readonly format: string;
  readonly alphaMode?: "opaque" | "premultiplied";
  readonly colorSpace?: "srgb" | "display-p3";
}

/**
 * WP-03: one scene draw's pipeline identity, known before a frame: the
 * program, its WP-05 vertex layout, WP-31 draw state (standard-depth sense;
 * the device applies the WP-30 frame convention) and the target it will draw
 * into. Legacy `instanceAttributes` streams are bound per draw and not warmed.
 */
export interface WebGPURenderPipelineWarmRequest {
  readonly shader: RenderShaderProgram;
  readonly vertexFormat?: VertexFormat;
  readonly topology: PrimitiveTopology;
  readonly renderState?: RenderCommandState;
  /** Render target the draw writes; omitted or null means the canvas. */
  readonly target?: RenderTarget | null;
  /** Canvas frame size the draw will begin with (default: the current viewport). */
  readonly canvasSize?: { readonly width: number; readonly height: number };
}

export interface WebGPURenderPipelineDescriptorLike {
  readonly label?: string;
  readonly layout: unknown;
  readonly vertex: {
    readonly module: unknown;
    readonly entryPoint: string;
    readonly buffers?: readonly (WebGPUVertexBufferLayoutLike | null)[];
  };
  readonly fragment?: {
    readonly module: unknown;
    readonly entryPoint: string;
    readonly constants?: Readonly<Record<string, number>>;
    readonly targets: readonly { readonly format: string; readonly writeMask?: number; readonly blend?: { readonly color: WebGPUBlendComponentLike; readonly alpha: WebGPUBlendComponentLike } }[];
  };
  readonly primitive: {
    readonly topology: "triangle-list" | "line-list" | "point-list";
    readonly cullMode?: "none" | "front" | "back";
    readonly frontFace?: "ccw" | "cw";
  };
  readonly depthStencil?: {
    readonly format: string;
    readonly depthWriteEnabled: boolean;
    readonly depthCompare: string;
    readonly depthBias?: number;
    readonly depthBiasSlopeScale?: number;
    readonly depthBiasClamp?: number;
    readonly stencilFront?: WebGPUStencilFaceLike;
    readonly stencilBack?: WebGPUStencilFaceLike;
    readonly stencilReadMask?: number;
    readonly stencilWriteMask?: number;
  };
  readonly multisample?: {
    readonly count: number;
    readonly mask?: number;
    readonly alphaToCoverageEnabled?: boolean;
  };
}

export interface WebGPUBlendComponentLike {
  readonly operation: string;
  readonly srcFactor: string;
  readonly dstFactor: string;
}

export interface WebGPUStencilFaceLike {
  readonly compare: string;
  readonly failOp: string;
  readonly depthFailOp: string;
  readonly passOp: string;
}

export interface WebGPUVertexBufferLayoutLike {
  readonly arrayStride: number;
  readonly stepMode?: "vertex" | "instance";
  readonly attributes: readonly WebGPUVertexAttributeLike[];
}

export interface WebGPUVertexAttributeLike {
  readonly shaderLocation: number;
  readonly offset: number;
  readonly format: string;
}

export interface WebGPUBindGroupDescriptorLike {
  readonly label?: string;
  readonly layout: unknown;
  readonly entries: readonly WebGPUBindGroupEntryLike[];
}

export interface WebGPUBindGroupEntryLike {
  readonly binding: number;
  readonly resource: unknown;
}

export interface WebGPUBindGroupLayoutDescriptorLike {
  readonly label?: string;
  readonly entries: readonly WebGPUBindGroupLayoutEntryLike[];
}

export interface WebGPUBindGroupLayoutEntryLike {
  readonly binding: number;
  readonly visibility: number;
  readonly buffer?: { readonly type: "uniform" | "storage" | "read-only-storage" };
  readonly sampler?: { readonly type: "filtering" | "non-filtering" };
  readonly texture?: { readonly sampleType: "float" | "unfilterable-float" | "depth"; readonly viewDimension: "2d" | "2d-array" | "3d" | "cube"; readonly multisampled?: boolean };
  readonly storageTexture?: { readonly access: "write-only" | "read-only"; readonly format: string; readonly viewDimension: "2d" };
}

export interface WebGPUBindGroupLike {}

export interface WebGPURenderPipelineLike {
  getBindGroupLayout?(index: number): unknown;
}

export interface WebGPUCommandEncoderLike {
  beginRenderPass(descriptor: WebGPURenderPassDescriptorLike): WebGPURenderPassEncoderLike;
  copyTextureToBuffer?(source: WebGPUImageCopyTextureLike, destination: WebGPUImageCopyBufferLike, size: WebGPUExtent3DLike): void;
  copyTextureToTexture?(source: WebGPUImageCopyTextureLike, destination: WebGPUImageCopyTextureLike, size: WebGPUExtent3DLike): void;
  finish(): unknown;
}

export interface WebGPUImageCopyTextureLike {
  readonly texture: WebGPUTextureLike;
  readonly mipLevel?: number;
  readonly origin?: {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
  };
}

export interface WebGPUImageCopyExternalImageLike {
  readonly source: TexImageSource;
  readonly origin?: {
    readonly x?: number;
    readonly y?: number;
  };
  readonly flipY?: boolean;
}

export interface WebGPUImageCopyBufferLike {
  readonly buffer: WebGPUBufferLike;
  readonly bytesPerRow: number;
  readonly rowsPerImage?: number;
}

export interface WebGPUImageDataLayoutLike {
  readonly offset?: number;
  readonly bytesPerRow: number;
  readonly rowsPerImage?: number;
}

export type WebGPUExtent3DLike =
  | readonly [number, number, number?]
  | {
    readonly width: number;
    readonly height: number;
    readonly depthOrArrayLayers?: number;
  };

export interface WebGPURenderPassDescriptorLike {
  readonly label?: string;
  readonly timestampWrites?: {
    readonly querySet: unknown;
    readonly beginningOfPassWriteIndex: number;
    readonly endOfPassWriteIndex: number;
  };
  readonly colorAttachments: readonly {
    readonly view: unknown;
    /** Required for a "3d" view: the depth slice this pass renders. */
    readonly depthSlice?: number;
    readonly resolveTarget?: unknown;
    readonly clearValue?: readonly [number, number, number, number];
    readonly loadOp: "clear" | "load";
    readonly storeOp: "store";
  }[];
  readonly depthStencilAttachment?: {
    readonly view: unknown;
    readonly depthClearValue?: number;
    readonly depthLoadOp: "clear" | "load";
    readonly depthStoreOp: "store";
    readonly stencilClearValue?: number;
    readonly stencilLoadOp?: "clear" | "load";
    readonly stencilStoreOp?: "store";
  };
}

/** A pass observer is owned by its caller and must use this renderer's native device. */
export interface WebGPUForwardPassTimer {
  readonly timestampWrites?: WebGPURenderPassDescriptorLike["timestampWrites"];
  end(encoder: unknown): void;
  cancel(): void;
}

export interface WebGPUForwardPassProfiler {
  readonly device: object;
  beginForwardPass(label: string): WebGPUForwardPassTimer;
  submitForwardPass(encoder: unknown, timer: WebGPUForwardPassTimer, submit: () => void): void;
}

export interface WebGPURenderPassEncoderLike {
  setPipeline(pipeline: WebGPURenderPipelineLike): void;
  /** SC-01: WebGPU viewport, origin top-left. */
  setViewport?(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void;
  /** SC-01: WebGPU scissor rect, origin top-left. */
  setScissorRect?(x: number, y: number, width: number, height: number): void;
  setBlendConstant?(color: readonly [number, number, number, number]): void;
  setStencilReference?(reference: number): void;
  setVertexBuffer(slot: number, buffer: WebGPUBufferLike): void;
  setBindGroup?(index: number, bindGroup: WebGPUBindGroupLike): void;
  setIndexBuffer?(buffer: WebGPUBufferLike, indexFormat: "uint16" | "uint32"): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
  drawIndexed?(indexCount: number, instanceCount?: number, firstIndex?: number): void;
  executeBundles?(bundles: readonly object[]): void;
  end(): void;
}

export interface WebGPUDeviceOptions {
  readonly gpu?: WebGPULike;
  readonly adapter?: WebGPUAdapterLike;
  readonly device?: WebGPUDeviceLike;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly presentationAlphaMode?: "opaque" | "straight" | "premultiplied";
  readonly presentationFormat?: string;
  readonly requiredFeatures?: readonly string[];
  readonly requiredLimits?: Readonly<Record<string, number>>;
  /** Require submission APIs instead of accepting a validation-only device. */
  readonly requireNativeRendering?: boolean;
  /** Injected devices are borrowed by default; requested devices are owned. */
  readonly ownsDevice?: boolean;
  /** Legacy devices may supersede one another, but cannot supersede a managed reservation. */
  readonly canvasOwnership?: "exclusive" | "legacy";
  readonly depthMode?: "standard" | "reversed" | "logarithmic";
  readonly allowDepthFallback?: boolean;
  /** Per-device admission limits for sampled textures. */
  readonly textureBudgetPolicy?: TextureBudgetPolicy;
}

/** Device-local streaming contract; kept structural to avoid an assets dependency. */
export interface WebGPUResidencyMip {
  readonly data: TexturePixelData;
  readonly fallbackData?: Uint8Array;
}
export interface WebGPUResidencySource {
  readonly texture: object;
  readonly identity: object;
  readonly label?: string;
  readonly fallback: readonly [number, number, number, number];
  readonly levels: readonly { readonly width: number; readonly height: number; readonly bytes: number }[];
}
export interface WebGPUResidencyAllocation {
  readonly texture: object;
  readonly native: WebGPUTextureLike;
  readonly view: unknown;
  readonly bytes: number;
  readonly generation: number;
}
interface WebGPUResidencyLease {
  readonly source: WebGPUResidencySource;
  readonly fallback: WebGPUResidencyAllocation;
  readonly colorSpace: Texture["colorSpace"];
  readonly revision: number;
  current: WebGPUResidencyAllocation | null;
  readonly removeDispose: () => void;
}
export interface WebGPUTextureResidencyAdapter {
  readonly device: object;
  generation(): number;
  isLost(): boolean;
  usageBytes(): number;
  acquireBudgetLimit(maxBytes: number): { setLimit(maxBytes: number): void; release(): void };
  prepare(source: WebGPUResidencySource, options: { readonly maxBytes: number; readonly generation: number }): void;
  unprepare(source: WebGPUResidencySource, generation: number): Promise<void> & { readonly retry?: () => Promise<void> };
  estimate(source: WebGPUResidencySource, levelCount: number): number;
  allocate(source: WebGPUResidencySource, levels: readonly { readonly level: number; readonly value: WebGPUResidencyMip }[], options: { readonly maxBytes: number; readonly signal: AbortSignal }): Promise<{ readonly allocation: WebGPUResidencyAllocation; readonly bytes: number }>;
  publish(texture: object, allocation: WebGPUResidencyAllocation | null, generation: number): void;
  retire(allocation: WebGPUResidencyAllocation): Promise<void>;
  onDeviceLost(listener: () => void): () => void;
  onDeviceRestored(listener: () => void): () => void;
}

/** Stable renderer-owned identity for native afterimage history. */
export interface WebGPUNativePostFrame {
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly frameId: number;
  readonly timeSeconds?: number;
  readonly cameraCut?: boolean;
  readonly diagnosticToken?: PostDiagnosticToken;
}

export interface WebGPUNativePostPresentationOptions extends LdrPostprocessPresentationOptions {
  readonly nativeEffects?: readonly NativePostEffect[];
  readonly postFrameContext?: WebGPUNativePostFrame;
}

interface WebGPUPostHistoryTransaction {
  readonly scopeId: object;
  readonly managed: boolean;
  readonly frameId: number;
  readonly generation: number;
  readonly views: Map<string | number, Map<number, PostHistoryLease<RenderTarget>>>;
  readonly invalidatedViews: Set<string | number>;
  invalid: boolean;
  pass?: {
    readonly viewId: string | number;
    readonly diagnosticToken: PostDiagnosticToken;
    readonly deviceFrameToken: object;
    presenting: boolean;
  };
}

/** Borrowed attachments valid only until this frame/target changes or one submission succeeds. */
export interface WebGPUNativeDeferredSurface {
  readonly colorView: unknown;
  readonly resolveView?: unknown;
  readonly depthAttachmentView: unknown;
  readonly depthSampleView: unknown;
  readonly colorFormat: string;
  readonly depthFormat: string;
  readonly width: number;
  readonly height: number;
  readonly sampleCount: number;
  readonly generation: number;
  readonly loadOp: "clear" | "load";
  readonly clearColor: readonly [number, number, number, number];
  readonly depthClearValue: number;
  readonly stencilClearValue: number;
  /** Submit exactly once on this device's queue; attachments remain borrowed. */
  submit(commands: readonly unknown[], readResources?: readonly object[]): void;
}

/** Borrowed probe resources remain owned and fence-retired by this device. */
export interface WebGPUNativeDeferredProbe {
  readonly device: WebGPUDeviceLike;
  readonly resource: WebGPUTextureLike;
  readonly view: unknown;
  readonly sampler: WebGPUSamplerLike;
  assertUsable(): void;
}

/** Scene raster state captured before a point pass switches targets. Coordinates use bottom-left origin. */
export interface WebGPUNativePointViewport {
  readonly generation: number;
  readonly frameToken: object;
  readonly target: RenderTarget | null;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
}

const nativeBufferHandles = new WeakMap<WebGPURenderBuffer, WebGPUBufferLike>();

function nativeBufferHandle(buffer: WebGPURenderBuffer): WebGPUBufferLike {
  const handle = nativeBufferHandles.get(buffer);
  if (!handle) throw new RenderDeviceError("Native buffer handle is unavailable", "WEBGPU_BUFFER_UNAVAILABLE", { bufferId: buffer.id });
  return handle;
}

/**
 * Per-wrapper release receipts installed by the owning device. A receipt
 * resolves only once interop has destroyed the native lease after its
 * retirement fence, and rejects on a failed fence or destructor.
 */
const nativeRetirementReceipts = new WeakMap<object, (resource: object) => Promise<void>>();

/** Observe a disposed buffer/target wrapper without starting or retrying cleanup. */
function observeNativeWrapperDisposal(owner: object, disposed: boolean, complete: boolean, handles: readonly (object | null)[]): Promise<void> {
  if (!disposed) return Promise.reject(new RenderDeviceError("WebGPU resource disposal has not started", "WEBGPU_DISPOSAL_NOT_STARTED"));
  if (!complete) return Promise.reject(new RenderDeviceError("WebGPU resource disposal failed; call dispose() again", "WEBGPU_DISPOSAL_INCOMPLETE"));
  const receipt = nativeRetirementReceipts.get(owner);
  if (!receipt) return Promise.resolve();
  return Promise.all(handles.filter((handle): handle is object => handle !== null).map(receipt)).then(() => undefined);
}

class WebGPURenderBuffer implements RenderBuffer {
  public disposed = false;
  private disposing = false;
  private disposalComplete = false;
  private nativeRetired = false;
  /** External native writers cannot update the renderer's CPU shadow. */
  public shadowValid = true;
  public readonly bytes: Uint8Array;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    public readonly nativeByteLength: number,
    handle: WebGPUBufferLike,
    private readonly retire: (handle: WebGPUBufferLike) => void,
    private readonly onDispose: (buffer: WebGPURenderBuffer) => void,
    initialData?: ArrayBufferView,
    private readonly beforeDispose?: (buffer: WebGPURenderBuffer) => void,
    private readonly onDisposalFailure?: (buffer: WebGPURenderBuffer, error: unknown) => void,
    private readonly onDisposalStateChange?: (buffer: WebGPURenderBuffer, active: boolean) => void,
    private readonly nativeRetirementPending?: (handle: WebGPUBufferLike) => boolean,
    private readonly retryNativeRetirement?: (handle: WebGPUBufferLike) => void,
    private readonly nativeCleanupActive?: (handle: WebGPUBufferLike) => boolean
  ) {
    nativeBufferHandles.set(this, handle);
    this.bytes = new Uint8Array(byteLength);
    if (initialData) this.bytes.set(viewBytes(initialData), 0);
  }

  dispose(): void {
    if (this.disposing) return;
    if (this.disposalComplete) {
      this.retryNativeRetirement?.(nativeBufferHandle(this));
      return;
    }
    this.disposing = true;
    try {
      this.onDisposalStateChange?.(this, true);
      if (!this.disposed) {
        this.beforeDispose?.(this);
        this.disposed = true;
      }
      if (!this.nativeRetired) {
        this.retire(nativeBufferHandle(this));
        this.nativeRetired = true;
      }
      this.onDispose(this);
      this.disposalComplete = true;
    } catch (error) {
      try { this.onDisposalFailure?.(this, error); } catch { /* Preserve the original disposal error. */ }
      throw error;
    } finally {
      this.disposing = false;
      this.onDisposalStateChange?.(this, false);
    }
  }

  get [resourceDisposalPending](): boolean {
    return this.disposed && (!this.disposalComplete || this.nativeRetirementPending?.(nativeBufferHandle(this)) === true);
  }

  get [resourceDisposalInProgress](): boolean {
    return this.disposing || this.nativeCleanupActive?.(nativeBufferHandle(this)) === true;
  }

  /** Release receipt: resolves after the native buffer's retirement fence and destruction. */
  whenDisposed(): Promise<void> {
    return observeNativeWrapperDisposal(this, this.disposed, this.disposalComplete, [nativeBufferHandle(this)]);
  }
}

type NativeUniformLayout =
  | "generated-basic"
  | "generated-texture"
  | "generated-program-ambient-pbr"
  | "generated-program-pbr"
  | "generated-program-unlit"
  | "generated-pbr"
  | "generated-atlas-pbr"
  | "generated-textured-pbr"
  | "generated-instanced-pbr"
  | "generated-skinned-unlit"
  | "generated-morph-unlit"
  | "portable"
  | "passthrough";

class WebGPUShaderProgram implements RenderShaderProgram {
  public disposed = false;
  public readonly renderPipelines = new Map<string, WebGPURenderPipelineLike>();
  public nativeColorDefaultModule: unknown;
  public readonly atlasVertexModules = new Map<string, unknown>();
  public readonly skinningVertexModules = new Map<string, unknown>();
  /** The vertex stage declares the `a3dZeroToOneProjection` pipeline override (zero-to-one reversed frames). */
  public projectionOverride = false;

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection,
    public readonly modules: readonly unknown[],
    public readonly entryPoints: readonly [string, string],
    public readonly nativeUniformLayout: NativeUniformLayout,
    public readonly portableBindings: readonly PortableShaderBinding[],
    public readonly storageBindings: readonly NativeShaderStorageLayout[] | undefined,
    public readonly nativeColorDefaultVertex?: string,
    public readonly nativeAtlasVertex?: string,
    public readonly generatedPbr?: GeneratedPbrProgram,
    public readonly generatedUnlit?: GeneratedUnlitProgram
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

interface NativeForwardBundleResources {
  readonly identity: readonly (object | string | number | null)[];
  readonly generation: number;
  readonly shader: WebGPUShaderProgram;
  readonly buffers: readonly WebGPURenderBuffer[];
  readonly uniform: WebGPUBufferLike;
  readonly frameUniform: WebGPUBufferLike;
  readonly materialGroup: WebGPUBindGroupLike;
  readonly frameGroup: WebGPUBindGroupLike;
  live: boolean;
}

interface WebGPUColorAttachment {
  readonly texture: Texture;
  readonly native: WebGPUTextureLike;
  readonly view: unknown;
  readonly sampledView: unknown;
  /** The renderable multisample image is separate from the sampled resolve. */
  readonly multisampleNative: WebGPUTextureLike | null;
  readonly multisampleView: unknown | null;
}

interface NativeDofFrameProof {
  readonly frame: NativeWebGPUDofFrame;
  /**
   * The target the producer draws into. A multisampled producer is replaced by
   * its single-sample `resolveTarget` when the frame is sealed.
   */
  target: WebGPURenderTarget;
  readonly frameToken: object;
  nativeColor: WebGPUTextureLike;
  nativeDepth: WebGPUTextureLike;
  nativeCoverage: WebGPUTextureLike;
  color: Texture;
  depth: Texture | undefined;
  coverage: Texture;
  /** Present while a 4x producer awaits its resolve into frame.source. */
  resolveTarget?: WebGPURenderTarget;
  phase: "recording" | "sealed" | "consumed" | "invalid";
  normalClear: boolean;
  coverageClear: boolean;
  depthSubmitted: boolean;
  effectSubmitted: boolean;
  serial: number;
}

/** Color-attachment subresource fields: a 3d target view renders exactly one depth slice per pass. */
function nativeColorSlice(target: WebGPURenderTarget | null | undefined): { readonly depthSlice?: number } {
  return target?.nativeDepthSlice === undefined ? {} : { depthSlice: target.nativeDepthSlice };
}

/** Native AO writes a target in its color source's renderable format. */
function nativeAmbientOcclusionFormat(format: string): "rgba8" | "rgba16f" | "rgba32f" {
  if (format === "rgba8" || format === "rgba16f" || format === "rgba32f") return format;
  throw new RenderDeviceError("Native WebGPU ambient occlusion requires an rgba8, rgba16f or rgba32f color source", "WEBGPU_POSTPROCESS_UNSUPPORTED", { format });
}

class WebGPURenderTarget implements RenderTarget {
  public disposed = false;
  private disposing = false;
  private disposalComplete = false;
  private readonly retiredNativeTextures = new Set<WebGPUTextureLike>();
  private readonly disposedAttachments = new Set<Texture>();
  private extraColors: readonly WebGPUColorAttachment[] = [];
  private allColors?: readonly Texture[];
  get colorTextures(): readonly Texture[] | undefined { return this.allColors; }
  private needsClear = true;
  public nativeMipsReady = false;
  get nativeNeedsClear(): boolean { return this.needsClear; }
  set nativeNeedsClear(value: boolean) {
    this.needsClear = value;
    if (!value && this.colorTexture.mipLevelCount > 1) this.nativeMipsReady = false;
  }
  public nativeClearColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  /** Native depth/stencil format; every pipeline drawing into this target must match it. */
  public nativeDepthFormat: string = DEPTH_TEXTURE_FORMAT;
  /** "float" for depth32float and depth32float-stencil8 attachments. */
  public depthStorage?: DepthStorage;
  /** Layered (cube / 2d-array / 3d) parents and their per-layer views. */
  public dimension?: "2d" | "cube" | "2d-array" | "3d";
  public layers?: number;
  public layerTargets?: readonly RenderTarget[];
  public attachmentLayer?: number;
  /** 3d targets: the volume slice every color attachment of this target renders (pass `depthSlice`). */
  public nativeDepthSlice?: number;
  /** No color attachment: passes carry only the depth/stencil attachment. */
  public depthOnly?: boolean;
  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture: Texture | undefined,
    public readonly multisampledDepthTexture: Texture | undefined,
    public readonly nativeTexture: WebGPUTextureLike | null,
    public readonly nativeView: unknown | null,
    public readonly nativeSampledView: unknown | null,
    public readonly nativeDepthTexture: WebGPUTextureLike | null,
    public readonly nativeDepthView: unknown | null,
    public readonly hasDepth: boolean,
    public readonly sampleCount: number,
    public readonly nativeMultisampleTexture: WebGPUTextureLike | null,
    public readonly nativeMultisampleView: unknown | null,
    private readonly retire: (texture: WebGPUTextureLike) => void,
    private readonly onDispose: (target: WebGPURenderTarget) => void,
    private readonly onDisposalFailure: (target: WebGPURenderTarget, error: unknown) => void,
    private readonly onDisposalAttempt: (target: WebGPURenderTarget) => void,
    private readonly onDisposalStateChange: (target: WebGPURenderTarget, active: boolean) => void,
    private readonly nativeRetirementPending: (texture: WebGPUTextureLike) => boolean,
    private readonly retryNativeRetirement: (texture: WebGPUTextureLike) => void,
    private readonly nativeCleanupActive: (texture: WebGPUTextureLike) => boolean,
    /** A per-layer view: it borrows the parent's native textures and attachments and never retires them. */
    private readonly layerChild = false
  ) {
  }

  /** Called exactly once before a new multi-attachment target is returned. */
  installExtraColors(colors: readonly WebGPUColorAttachment[]): void {
    if (this.disposed || this.extraColors.length || colors.length === 0) throw new Error("WEBGPU_MRT_TARGET_INVALID");
    this.extraColors = Object.freeze([...colors]);
    this.allColors = Object.freeze([this.colorTexture, ...colors.map((color) => color.texture)]);
  }

  get nativeExtraColors(): readonly WebGPUColorAttachment[] { return this.extraColors; }
  get nativeDisposalComplete(): boolean { return this.disposalComplete; }
  get nativeDisposalInProgress(): boolean { return this.disposing; }
  get [resourceDisposalPending](): boolean {
    return this.disposed && (!this.disposalComplete || this.nativeTextures().some(texture => texture !== null && this.nativeRetirementPending(texture)));
  }
  get [resourceDisposalInProgress](): boolean {
    return this.disposing || this.nativeTextures().some(texture => texture !== null && this.nativeCleanupActive(texture));
  }

  /** Release receipt: resolves after every native attachment's retirement fence and destruction. */
  whenDisposed(): Promise<void> {
    return observeNativeWrapperDisposal(this, this.disposed, this.disposalComplete, this.nativeTextures());
  }

  private nativeTextures(): (WebGPUTextureLike | null)[] {
    if (this.layerChild) return [];
    return [this.nativeTexture, ...this.extraColors.flatMap(color => [color.native, color.multisampleNative]),
      this.nativeDepthTexture, this.nativeMultisampleTexture];
  }

  /** Retry only failed native retirement after logical target cleanup completed. */
  retryNativeRetirements(): void {
    const failures: unknown[] = [];
    for (const texture of this.nativeTextures()) {
      if (!texture) continue;
      try { this.retryNativeRetirement(texture); } catch (error) { failures.push(error); }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length) throw new AggregateError(failures, "Failed to retry WebGPU render target retirement");
  }

  nativeColorFor(texture: Texture): WebGPUTextureLike | undefined {
    return this.colorTexture === texture ? this.nativeTexture ?? undefined : this.extraColors.find((color) => color.texture === texture)?.native;
  }

  nativeSampledViewFor(texture: Texture): unknown | undefined {
    return this.colorTexture === texture ? this.nativeSampledView ?? undefined : this.extraColors.find((color) => color.texture === texture)?.sampledView;
  }

  dispose(): void {
    this.onDisposalAttempt(this);
    if (this.disposing) return;
    if (this.disposalComplete) {
      this.retryNativeRetirements();
      return;
    }
    this.disposing = true;
    this.disposed = true;
    try {
      this.onDisposalStateChange(this, true);
      const failures: unknown[] = [];
      for (const texture of this.nativeTextures()) {
        if (!texture || this.retiredNativeTextures.has(texture)) continue;
        try { this.retire(texture); this.retiredNativeTextures.add(texture); } catch (error) { failures.push(error); }
      }
      const attachments = this.layerChild ? [] : [this.colorTexture, ...this.extraColors.map(color => color.texture), this.depthTexture, this.multisampledDepthTexture];
      for (const texture of attachments) {
        if (!texture || this.disposedAttachments.has(texture)) continue;
        try { texture.dispose(); this.disposedAttachments.add(texture); } catch (error) { failures.push(error); }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, "Failed to dispose WebGPU render target attachments");
      this.onDispose(this);
      this.disposalComplete = true;
      this.retiredNativeTextures.clear();
      this.disposedAttachments.clear();
    } catch (error) {
      try { this.onDisposalFailure(this, error); } catch { /* Preserve the original disposal error. */ }
      throw error;
    } finally {
      this.disposing = false;
      this.onDisposalStateChange(this, false);
    }
  }
}

export { MAX_WEBGPU_SKINNING_JOINTS } from "./WebGPUSkinningLimits";

/** Loss callbacks cannot throw to their caller, so retain nested cleanup causes in diagnostics. */
function describeNativeCleanupFailure(error: unknown): string {
  const pending = [error], seen = new Set<unknown>(), messages: string[] = [];
  while (pending.length && messages.length < 16) {
    const next = pending.shift();
    if (seen.has(next)) continue;
    seen.add(next);
    try { messages.push(next instanceof Error ? next.message : String(next)); } catch { messages.push("Unknown cleanup error"); }
    try {
      if (next instanceof AggregateError) {
        const errors: unknown = next.errors;
        if (Array.isArray(errors)) {
          for (let i = 0; i < Math.min(errors.length, 16 - messages.length); i++) pending.push(errors[i]);
        }
      }
    } catch { /* Error objects can expose throwing getters or proxies. */ }
  }
  return messages.join(": ");
}

interface NativeCleanupStep {
  readonly run: () => void;
  /** Only use for an operation whose repeated execution is itself harmless. */
  readonly retryable?: boolean;
}

interface WebGPUDisposalAttempt {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  state: "pending" | "resolved" | "rejected";
  observing: boolean;
}

function webGPUDisposalAttempt(): WebGPUDisposalAttempt {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  // dispose() is synchronous and many callers do not request the receipt.
  void promise.catch(() => {});
  return { promise, resolve, reject, state: "pending", observing: false };
}

/**
 * Native GPUBuffer/GPUTexture destruction is idempotent, but `WebGPU*Like`
 * can also be an injected wrapper; neither the device options nor structural
 * typing prove that its destroy method has native semantics. If it
 * throws, it may already have performed arbitrary side effects: do not call
 * it again or release its charge without a completion receipt. The same rule
 * applies to accounting callbacks. Completed phases are never repeated;
 * explicitly idempotent bookkeeping may be resumed after a later failure.
 */
function phasedNativeCleanup(resource: { destroy(): void }, bookkeeping: readonly NativeCleanupStep[]): () => void {
  const steps: readonly NativeCleanupStep[] = [{ run: () => resource.destroy() }, ...bookkeeping];
  let next = 0;
  let uncertain: { readonly error: unknown } | undefined;
  return () => {
    if (uncertain) throw uncertain.error;
    while (next < steps.length) {
      const step = steps[next]!;
      try {
        step.run();
        next += 1;
      } catch (error) {
        if (!step.retryable) uncertain = { error };
        throw error;
      }
    }
  };
}

export class WebGPUDevice implements RenderDevice {
  public readonly kind = "webgpu";
  public readonly info: RenderDeviceInfo;
  public disposed = false;
  public contextLost = false;
  public readonly generation = nextWebGPUGeneration++;
  public readonly resourceInterop: WebGPUResourceInterop;
  #depthConvention: DepthConvention;
  /** The renderer-selected frame convention; clears and pass loads use its clear value. */
  get depthConvention(): DepthConvention { return this.#depthConvention; }
  private nativeConfirmedLost = false;
  private nativeDestroyPending = false;
  private nativeDestroyFailure?: { readonly error: unknown };
  private nativeInteropInvalidationPending = false;
  private nativeCanvasUnconfigurePending = false;
  private deviceDisposing = false;
  private disposalAttempt?: WebGPUDisposalAttempt;
  private nativeRetirementsInFlight = 0;
  private nativeCleanupInFlight = 0;
  private readonly activeNativeCleanups = new Set<object>();
  private readonly nativeRetirementAttempts = new Map<object, Promise<void>>();
  private readonly nativeRetirementFailures = new Map<object, { readonly error: unknown }>();
  private readonly uncertainNativeAllocations = new Set<{
    readonly resource: object;
    readonly error: unknown;
    readonly release?: () => void;
  }>();
  private interopRetirementFailure?: { readonly error: unknown };
  private readonly nativeStreamingLossListeners = new Set<() => void>();
  private readonly pendingStreamingLossListeners = new Set<() => void>();
  private deviceTargetDisposalAttempts: Set<WebGPURenderTarget> | undefined;
  private deviceSweepRetirementAttempts: Set<WebGPUTextureLike> | undefined;
  private readonly pendingNativeSweepRetirements = new Set<WebGPUTextureLike>();
  private readonly activeNativeSweepRetirements = new Set<WebGPUTextureLike>();
  private readonly activeNativeSampledReleases = new Set<Texture>();
  private deviceBudgetedDisposalAttempts: Set<Texture> | undefined;
  private readonly pendingNativeBudgetedDisposals = new Map<Texture, { inFlight: boolean; uncertain: boolean; error?: unknown }>();
  /**
   * Strict teardown: disposal stays pending until every native lease is
   * released, including leases whose retirement fence is merely scheduled or
   * waiting (a scheduled fence is not a release receipt). Observed failures
   * compose with synchronous cleanup, and a failed attempt stays pending until
   * an explicit dispose() retry replaces its rejected receipt.
   */
  get [resourceDisposalPending](): boolean {
    return this.deviceDisposing || this.nativeRetirementsInFlight > 0 || this.nativeCleanupInFlight > 0
      // A rejected attempt must also be acknowledged by an explicit retry.
      // Otherwise a parent can forget this device after its fences settle,
      // leaving its rejected receipt and managed canvas reservation stranded.
      || (this.disposed && (this.disposalAttempt?.state === "rejected" || this.hasPendingNativeDisposal()));
  }
  get [resourceDisposalInProgress](): boolean { return this.deviceDisposing; }

  /** Observe this disposal attempt; it never starts or retries cleanup. */
  whenDisposed(): Promise<void> {
    return this.disposalAttempt?.promise
      ?? Promise.reject(new RenderDeviceError("WebGPU device disposal has not started", "WEBGPU_DISPOSAL_NOT_STARTED"));
  }

  private beginDisposalAttempt(): WebGPUDisposalAttempt {
    if (!this.disposalAttempt || this.disposalAttempt.state !== "pending") {
      this.disposalAttempt = webGPUDisposalAttempt();
    }
    return this.disposalAttempt;
  }

  private rejectDisposalAttempt(attempt: WebGPUDisposalAttempt, error: unknown): void {
    if (attempt.state !== "pending") return;
    attempt.state = "rejected";
    attempt.reject(error);
  }

  private rejectLateDisposalFailure(error: unknown): void {
    // An active child may fail after its callback reentered and returned from
    // device disposal. Preserve that error on the already-published receipt;
    // failures inside the device's own sweep are aggregated by that sweep.
    if (this.disposed && !this.deviceDisposing && this.disposalAttempt) {
      this.rejectDisposalAttempt(this.disposalAttempt, error);
    }
  }

  private resolveDisposalAttempt(attempt: WebGPUDisposalAttempt): void {
    if (attempt.state !== "pending") return;
    const owners = nativeDeviceOwners.get(this.device);
    owners?.delete(this);
    if (owners?.size === 0) nativeDeviceOwners.delete(this.device);
    if (this.canvasContext) {
      const canvasDevices = canvasDeviceOwners.get(this.canvasContext);
      canvasDevices?.delete(this);
      if (canvasDevices?.size === 0) canvasDeviceOwners.delete(this.canvasContext);
    }
    const lease = this.managedCanvasLease;
    if (lease?.owner === this) {
      if (managedNativeDevices.get(this.device) === lease) managedNativeDevices.delete(this.device);
      if (lease.device === this.device) lease.device = undefined;
      // Recovery retains the canvas/context reservation while replacing the
      // lost native device, so a competing app cannot win the handoff.
      if (!lease.recovering) {
        releaseManagedCanvasLease(lease);
        lease.owner = undefined;
      }
    }
    attempt.state = "resolved";
    attempt.resolve();
  }

  private observeDisposalAttempt(attempt: WebGPUDisposalAttempt): void {
    if (attempt.state !== "pending" || attempt.observing) return;
    attempt.observing = true;
    try {
      const settlement = this.resourceInterop.whenRetirementsSettled();
      void settlement.then(() => {
        if (attempt.state !== "pending") return;
        try {
          // Interop completion is necessary but is not a receipt for other
          // synchronous owners whose cleanup still needs an explicit retry.
          if (!this.disposed || this.hasPendingNativeDisposal()) {
            throw new RenderDeviceError("WebGPU device disposal is incomplete", "WEBGPU_DISPOSAL_INCOMPLETE");
          }
          this.resolveDisposalAttempt(attempt);
        } catch (error) { this.rejectDisposalAttempt(attempt, error); }
      }, (error: unknown) => {
        this.rejectDisposalAttempt(attempt, error);
        // Confirmed loss may have invalidated the leases after interop
        // rejected this observer, but before its promise callback ran. Preserve
        // this attempt's error while discharging the now-complete current
        // owner, just as the loss handler does for an already-rejected attempt.
        if (this.disposalAttempt === attempt && attempt.state === "rejected"
          && this.nativeConfirmedLost && this.disposed && !this.hasPendingNativeDisposal()) {
          this.resolveDisposalAttempt(this.beginDisposalAttempt());
        }
      });
    } catch (error) {
      this.rejectDisposalAttempt(attempt, error);
    }
  }

  private hasPendingNativeDisposal(): boolean {
    return this.nativeDestroyPending || this.nativeInteropInvalidationPending || this.nativeCanvasUnconfigurePending
      // A waiting fence can still reject; keep the owner until every native
      // lease is actually released or invalidated, not merely scheduled.
      || this.resourceInterop.liveResources > 0
      || this.resourceInterop.hasUnfencedRetirements
      || this.resourceInterop.hasIncompleteDestruction
      || [...this.nativeRetirementFailures.keys()].some(resource => this.resourceInterop.owns(resource))
      || this.hasCurrentInteropRetirementFailure()
      || this.uncertainNativeAllocations.size > 0
      || this.nativeStreamingLeases.size > 0 || this.nativeStreamingDetachInFlight.size > 0
      || this.nativeSampledTextures.size > 0 || this.pendingNativeSweepRetirements.size > 0
      || this.activeNativeSweepRetirements.size > 0 || this.activeNativeSampledReleases.size > 0 || this.pendingNativeBudgetedDisposals.size > 0
      || this.webgpuAutoExposure !== null || this.webgpuExposureUniformBuffers.size > 0
      || !this.nativeEffectHistoryDisposed || this.webgpuPostRetiredUniformBuffers.length > 0
      || this.webgpuPostUniformRetirementsInFlight.size > 0
      || this.pendingForwardBundleRetirements.size > 0 || this.nativeForwardBundleRetirements.size > 0
      || this.nativeForwardBundleRetirementsInFlight.size > 0 || this.nativeForwardBundleDisposalUncertain || this.nativeForwardBundleDisposalInFlight
      || this.gaussianSplatAdapters.size > 0 || this.activeGaussianSplatDisposals.size > 0 || this.uncertainGaussianSplatDisposals.size > 0
      || this.buffers.size > 0 || this.pendingShaderDisposals.size > 0 || this.pendingRenderTargetDisposals.size > 0
      || this.activeBufferDisposals.size > 0 || this.activeTargetDisposals.size > 0 || this.nativeRetirementsInFlight > 0 || this.nativeCleanupInFlight > 0
      || [...this.renderTargets].some(target => target[resourceDisposalPending]);
  }

  private hasCurrentInteropRetirementFailure(): boolean {
    if (!this.interopRetirementFailure) return false;
    if (this.resourceInterop.retirementDestructionErrors.includes(this.interopRetirementFailure.error)) return true;
    this.interopRetirementFailure = undefined;
    return false;
  }

  private activeColorSpace: "srgb" | "display-p3" = "srgb";
  private canvasColorUsable = true;
  private displayP3Verified = false;

  private nextId = 1;
  private frameActive = false;
  private frameToken: object | null = null;
  private nativeFrameEpoch = 0;
  private forwardPassProfiler: { observer: WebGPUForwardPassProfiler; drawLabel: string } | null = null;
  private forwardPassProfiledThisFrame = false;
  private drawCalls = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private canvasTargetGeneration = 0;
  /** SC-01: viewport/scissor override (origin bottom-left, three convention) and the target it was set on; applies only while that target is bound. */
  private viewStateTarget: WebGPURenderTarget | null = null;
  private viewportOverride: { x: number; y: number; width: number; height: number } | null = null;
  private scissorOverride: { x: number; y: number; width: number; height: number } | null = null;
  private scissorTestOn = false;
  /** XR/SC-01: viewport scoped to the default (canvas) target that survives `beginFrame`. */
  private persistentViewportRect: { x: number; y: number; width: number; height: number } | null = null;
  private clearColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  private lastError: string | null = null;
  private nativeSubmissions = 0;
  private nativeDrawSubmissions = 0;
  private readonly nativeDrawReceipts = new WeakMap<DrawCommand<RecursiveUniformValue>, number>();
  // These are owned by this exact native device generation. Each entry binds
  // one stable material buffer and the device's retained AuraFrame buffer.
  private nativeForwardBundles?: NativeRenderBundleCache;
  private readonly nativeForwardBundleResources = new Set<NativeForwardBundleResources>();
  private readonly pendingForwardBundleRetirements = new Map<NativeForwardBundleResources, {
    readonly cache: NativeRenderBundleCache | undefined;
    invalidationPending: boolean;
    uniformPending: boolean;
    frameUniformPending: boolean;
    inFlight: boolean;
  }>();
  private nativeForwardBundleDisposalUncertain = false;
  private nativeForwardBundleDisposalInFlight = false;
  private nativeForwardBundleDisposalError: unknown;
  private nativeForwardBundleExecutions = 0;
  private nativeForwardBundleActive = false;
  private readonly nativeForwardBundlePins = new Set<object>();
  private readonly nativeForwardBundleRetirements = new Set<{ destroy(): void }>();
  private readonly nativeForwardBundleRetirementsInFlight = new Set<{ destroy(): void }>();
  private nativeRenderPipelinesCreated = 0;
  private nativeRenderPasses = 0;
  private nativeTextureUploads = 0;
  private nativeTextureReadbacks = 0;
  private nativeTextureBindings = 0;
  private disposedBufferCount = 0;
  private disposedSampledTextures = 0;
  private disposedRenderTargets = 0;
  private disposedRenderTargetTextures = 0;
  private nativeGeneratedBasicSubmissions = 0;
  private nativeGeneratedTextureSubmissions = 0;
  private nativePassthroughSubmissions = 0;
  private nativePbrSubmissions = 0;
  private nativeInstancedSubmissions = 0;
  private nativeSkinnedSubmissions = 0;
  private nativeMorphSubmissions = 0;
  private nativeEnvironmentBindings = 0;
  private nativeShadowMapBindings = 0;
  private nativeBloomPasses = 0;
  private nativeColorGradePasses = 0;
  private nativeFxaaPasses = 0;
  private nativeSsaoPasses = 0;
  private nativeAmbientOcclusionPasses = 0;
  private nativeSsrPasses = 0;
  /** S10b user LUTs (one rgba8unorm 3-D texture per `.cube` source, LRU 4), valid for one device generation. */
  private readonly webgpuLuts = new Map<string, { readonly texture: WebGPUTextureLike & { destroy(): void }; readonly view: unknown; readonly size: number; readonly generation: number }>();
  private readonly webgpuLutFailed = new Set<string>();
  private nativeTaaPasses = 0;
  private nativeTemporalBindings = 0;
  /** Native S4 god-ray, S7 motion-blur and volumetric-light draws (`webgpu/WebGPUDepthEffects.ts`). */
  private nativeDepthStagePasses = 0;
  private readonly webgpuPostPipelines = new Map<string, WebGPURenderPipelineLike>();
  private webgpuPostLinearSampler: WebGPUSamplerLike | null = null;
  private webgpuDeferredProbeSampler: WebGPUSamplerLike | null = null;
  private lastWebGPUBloom: WebGPUBloomDiagnostics | null = null;
  /**
   * Uniform buffers referenced by submitted-but-maybe-unexecuted post
   * passes. Destroying them synchronously after submit races the GPU (the
   * reads happen later), so they retire here and are reclaimed at the start
   * of the next post run — after any intervening readback fence — or on
   * dispose.
   */
  private webgpuPostRetiredUniformBuffers: WebGPUBufferLike[] = [];
  private readonly webgpuPostUniformRetirementsInFlight = new Set<WebGPUBufferLike>();
  private readonly webgpuPostErrorScopePending = new Set<Promise<unknown>>();
  private readonly webgpuPostErrors = new Map<string, number>();
  private webgpuPostOtherErrors = 0;
  /** Exposure passes use queue-ordered writes, so one buffer per payload size is sufficient. */
  private readonly webgpuExposureUniformBuffers = new Map<number, WebGPUBufferLike>();
  private webgpuAutoExposure: WebGPUAutoExposure | null = null;
  private webgpuAutoExposureReleasing = false;
  private webgpuPostValidationFailure: (() => void) | null = null;
  private readonly nativeEffectHistory = new PostViewHistory<RenderTarget>();
  private nativeEffectHistoryDisposed = false;
  private nativeEffectHistoryReleasing = false;
  private nativePostCleanupDepth = 0;
  /** Post owners, not the generic render-target sweep, retry their failed targets. */
  private readonly nativePostOwnedTargets = new WeakSet<RenderTarget>();
  #nativePostOwners = new Set<object>();
  #nativePostTransactions = new Map<object, WebGPUPostHistoryTransaction>();
  private readonly nativeEffectViews = new Map<object, Set<string | number>>();
  private canvasSubmissions = 0;
  private readonly buffers = new Set<WebGPURenderBuffer>();
  private readonly activeBufferDisposals = new Set<WebGPURenderBuffer>();
  private readonly ownedBuffers = new WeakSet<WebGPURenderBuffer>();
  private readonly nativeExposedBuffers = new WeakSet<WebGPURenderBuffer>();
  // The budget includes cached and fence-retired conversions until destruction.
  private readonly vertexConversions = new Map<WebGPURenderBuffer, Map<string, { readonly handle: WebGPUBufferLike; readonly count: number; readonly size: number }>>();
  private vertexConversionBytes = 0;
  private vertexConversionCount = 0;
  private readonly vertexConversionPins = new Set<WebGPURenderBuffer>();
  private readonly vertexConversionHandles = new Set<WebGPUBufferLike>();
  private readonly vertexWritesActive = new Set<WebGPURenderBuffer>();
  private vertexConversionCheck: (() => void) | null = null;
  readonly #morphBufferEpochs = new WeakMap<WebGPURenderBuffer, object>();
  readonly #pointBufferEpochs = new WeakMap<WebGPURenderBuffer, object>();
  readonly #pointBufferStamps = new WeakMap<object, { readonly buffer: WebGPURenderBuffer; readonly generation: number; readonly epoch: object }>();
  readonly #pointBufferDestroyed = new WeakMap<WebGPURenderBuffer, () => boolean>();
  readonly #pointFrameWrites = new WeakMap<WebGPURenderBuffer, { readonly bytes: Uint8Array; readonly epoch: object }>();
  readonly #pointFrameWriteEpochs = new WeakMap<WebGPURenderBuffer, object>();
  readonly #pointShaders = new WeakMap<WebGPUShaderProgram, { readonly program: GeneratedUnlitProgram; readonly fingerprint: string; readonly modules: readonly unknown[]; readonly alphaMode: string; readonly vertexColors: boolean }>();
  readonly #mrtShaders = new WeakMap<WebGPUShaderProgram, { readonly pbr?: GeneratedPbrProgram; readonly unlit?: GeneratedUnlitProgram;
    readonly modules: readonly unknown[]; readonly entryPoints: readonly [string, string]; readonly layout: NativeUniformLayout; readonly coverage: boolean;
    readonly unlitFingerprint?: string }>();
  readonly #p3OutputShaders = new WeakMap<WebGPUShaderProgram, { readonly modules: readonly unknown[]; readonly entryPoints: readonly string[]; readonly bindings: string }>();
  readonly #pointPinnedHandles = new Set<object>();
  readonly #pointDeferredRetirements = new Set<{ destroy(): void }>();
  #pointSubmissionActive = false;
  readonly #mrtPinnedHandles = new Set<object>();
  readonly #mrtDeferredRetirements = new Set<{ destroy(): void }>();
  #mrtSubmissionActive = false;
  readonly #textureUploadPinnedHandles = new Set<WebGPUTextureLike>();
  readonly #textureUploadDeferredRetirements = new Set<WebGPUTextureLike>();
  private readonly pointBufferRetirements = new WeakMap<WebGPURenderBuffer, Promise<void>>();
  private readonly pointViewportSnapshots = new WeakMap<WebGPUNativePointViewport, WebGPUNativePointViewport>();
  private readonly pointInvalidationListeners = new Set<() => void>();
  private pointInvalidated = false;
  private interopRetirement: Promise<void> | null = null;
  private readonly uniformBufferBindings = new Map<number, WebGPURenderBuffer>();
  private readonly shaders = new Set<WebGPUShaderProgram>();
  private readonly pendingShaderDisposals = new Set<WebGPUShaderProgram>();
  private readonly renderTargets = new Set<WebGPURenderTarget>();
  private readonly pendingRenderTargetDisposals = new Set<WebGPURenderTarget>();
  private readonly activeTargetDisposals = new Set<WebGPURenderTarget>();
  /** Identities of the color resolve pair allocated for each native target. */
  readonly #p3ResolvedColors = new WeakMap<WebGPURenderTarget, {
    readonly color: Texture; readonly texture: WebGPUTextureLike | null; readonly view: unknown | null;
    readonly multisampleTexture: WebGPUTextureLike | null; readonly multisampleView: unknown | null;
    readonly sampleCount: number; readonly width: number; readonly height: number;
  }>();
  readonly #nativeDofProofs = new WeakMap<NativeWebGPUDofFrame, NativeDofFrameProof>();
  #nativeDofActive: NativeDofFrameProof | null = null;
  private readonly nativeSampledTextures = new Map<Texture, { readonly texture: WebGPUTextureLike; readonly view: unknown }>();
  private readonly nativeSampledPreparations = new Set<Texture>();
  private readonly validatedClusterPackets = new WeakMap<Texture, { readonly data: Texture; readonly indexRevision: number; readonly dataRevision: number; readonly gridWidth: number; readonly gridHeight: number; readonly rectLights: boolean }>();
  private readonly nativeStreamingLeases = new Map<Texture, WebGPUResidencyLease>();
  private readonly nativeStreamingDetachInFlight = new Set<WebGPUResidencyLease>();
  private readonly nativeStreamingAllocations = new Set<WebGPUResidencyAllocation>();
  private readonly nativeStreamingOwned = new WeakSet<WebGPUResidencyAllocation>();
  private readonly nativeStreamingRetirements = new WeakMap<WebGPUResidencyAllocation, Promise<void>>();
  private nativeStreamingAdapter: WebGPUTextureResidencyAdapter | null = null;
  private readonly nativeBudgetedTextures = new Map<Texture, Texture>();
  private readonly nativeBudgetRetirement = new WeakMap<WebGPUTextureLike, () => void>();
  /** Actual resident decoded bytes, retained even when the CPU fallback is invalidated by an edit. */
  private readonly nativeCompressedFallbackBytes = new Map<Texture, number>();
  /** Decoded fallback level data last written per texture, to detect a supplied replacement. */
  private readonly nativeCompressedFallbackData = new Map<Texture, readonly ArrayBufferView[]>();
  private readonly nativeFallbackTextures = new Map<string, { readonly texture: WebGPUTextureLike; readonly view: unknown }>();
  /**
   * threejs-parity ST-03 (L4): `Texture.revision` recorded at the last native
   * upload. A mismatch on a cached binding re-uploads the texture in place —
   * the same revision gate WebGL2 has in `webgl2/TextureUpload.ts` — so
   * canvas/video/data textures bound through `texture.*` handles refresh
   * on `needsUpdate` instead of staying frozen at the first upload.
   */
  private readonly nativeSampledTextureRevisions = new Map<Texture, number>();
  private readonly nativeSampledTextureGeneratedMips = new Map<Texture, boolean>();
  private readonly nativeSubresourceRevisions = new Map<Texture, Map<string, number>>();
  private readonly nativeSampledTextureSizes = new Map<Texture, readonly [number, number]>();
  private readonly nativeSampledTextureLayouts = new Map<Texture, string>();
  private readonly nativeSampledTextureDisposers = new Map<Texture, () => void>();
  private activeRenderTarget: WebGPURenderTarget | null = null;
  private readonly gaussianSplatAdapters = new Set<WebGPUGaussianSplatColorAdapter>();
  private readonly activeGaussianSplatDisposals = new Set<WebGPUGaussianSplatColorAdapter>();
  private readonly uncertainGaussianSplatDisposals = new Map<WebGPUGaussianSplatColorAdapter, unknown>();
  private readonly nativePostBlackboards = new WeakMap<PostDiagnosticToken, Map<string, unknown>>();
  private gaussianSplatBorrowedDepth: WebGPURenderTarget | null = null;
  private canvasDepthTexture: WebGPUTextureLike | null = null;
  private canvasDepthView: unknown | null = null;
  private canvasDepthWidth = 0;
  private canvasDepthHeight = 0;

  /** Identity only; it does not grant exclusive access to the device. */
  get activeFrameToken(): object | null {
    return this.frameActive && !this.disposed && !this.contextLost ? this.frameToken : null;
  }

  static create(options: WebGPUDeviceOptions = {}): Promise<WebGPUDevice> {
    return WebGPUDevice.createInternal(options);
  }

  private static async createInternal(
    options: WebGPUDeviceOptions,
    recovery?: { readonly lease: ManagedWebGPUCanvasLease; readonly previousDevice: WebGPUDeviceLike }
  ): Promise<WebGPUDevice> {
    if (options.presentationAlphaMode !== undefined && options.presentationAlphaMode !== "opaque" && options.presentationAlphaMode !== "premultiplied") {
      throw new RenderDeviceError("WebGPU canvas supports opaque or premultiplied alpha", "OUTPUT_ALPHA_MODE_UNAVAILABLE", { requested: options.presentationAlphaMode });
    }
    if (options.canvasOwnership !== undefined && options.canvasOwnership !== "exclusive" && options.canvasOwnership !== "legacy") {
      throw new RenderDeviceError("Invalid WebGPU canvas ownership mode", "WEBGPU_CANVAS_OWNERSHIP_INVALID");
    }
    const presentationAlphaMode = options.presentationAlphaMode === "premultiplied" ? "premultiplied" : "opaque";
    let lease: ManagedWebGPUCanvasLease | undefined;
    if (options.canvas && options.canvasOwnership !== "exclusive" && managedCanvases.has(options.canvas)) {
      throw webGPUCanvasInUse();
    }
    if (options.canvasOwnership === "exclusive" && options.canvas) {
      if (recovery) {
        if (options.canvas !== recovery.lease.canvas || managedCanvases.get(options.canvas) !== recovery.lease) {
          throw new RenderDeviceError("WEBGPU_RECOVERY_OWNERSHIP_LOST: The canvas reservation is no longer owned by this device", "WEBGPU_RECOVERY_OWNERSHIP_LOST");
        }
        lease = recovery.lease;
      } else {
        if (managedCanvases.has(options.canvas)) throw webGPUCanvasInUse();
        lease = { canvas: options.canvas, recovering: false, uncertain: false };
        // Reserve before awaiting an adapter or device, without acquiring a
        // context that would prevent a legitimate WebGL fallback.
        managedCanvases.set(options.canvas, lease);
      }
    }
    let device: WebGPUDeviceLike | undefined;
    let canvasOwner: WebGPUCanvasOwner | undefined;
    let canvasContext: WebGPUCanvasContextLike | null = null;
    let protectedDevice = false;
    let configurationAttempted = false;
    let constructorStarted = false;
    let transferred = false;
    let candidateDestroy: (() => void) | undefined;
    let candidateDestroyRead = false;
    let candidateDestroyReadFailure: { readonly error: unknown } | undefined;
    try {
      const gpu = options.gpu ?? readWebGPU(globalThis);
      const adapter = options.adapter ?? (await requestAdapter(gpu));
      if (!adapter) {
        throw new RenderDeviceError("WebGPU adapter request did not return a device owner", "WEBGPU_ADAPTER_MISSING");
      }
      const requiredFeatures = [...new Set(options.requiredFeatures ?? [])];
      if (requiredFeatures.some((feature) => typeof feature !== "string" || !feature)) {
        throw new RenderDeviceError("WebGPU feature names must be non-empty strings", "WEBGPU_INVALID_FEATURE");
      }
      const requiredLimits = options.requiredLimits ?? {};
      for (const [name, value] of Object.entries(requiredLimits)) {
        if (!name || !Number.isFinite(value) || value < 0) throw new RenderDeviceError("Invalid required WebGPU limit", "WEBGPU_INVALID_LIMIT", { name, value });
      }
      const featureOwner = options.device ?? adapter;
      const missingFeatures = requiredFeatures.filter((feature) => !featureOwner.features?.has(feature));
      if (missingFeatures.length) {
        throw new RenderDeviceError("Required WebGPU features are unavailable", "WEBGPU_FEATURES_UNAVAILABLE", { missingFeatures });
      }
      const limitOwner = options.device ?? adapter;
      const missingLimits = Object.entries(requiredLimits).filter(([name, value]) => (limitOwner.limits?.[name] ?? -1) < value).map(([name]) => name);
      if (missingLimits.length) throw new RenderDeviceError("Required WebGPU limits are unavailable", "WEBGPU_LIMITS_UNAVAILABLE", { missingLimits });
      // Reversed-Z frames need floating-point depth with a stencil aspect for
      // renderer-owned scene targets; request it whenever the adapter offers
      // it (an optional feature, never a creation requirement).
      const requestedFeatures = !options.device && adapter.features?.has(FLOAT_DEPTH_STENCIL_FEATURE) && !requiredFeatures.includes(FLOAT_DEPTH_STENCIL_FEATURE)
        ? [...requiredFeatures, FLOAT_DEPTH_STENCIL_FEATURE] : requiredFeatures;
      device = await requestDevice(adapter, options.device, requestedFeatures, requiredLimits);
      if (device && typeof device === "object") {
        const managedOwner = managedNativeDevices.get(device);
        if ((managedOwner && managedOwner !== lease) || (lease && nativeDeviceOwners.get(device)?.size) ||
            (recovery && device === recovery.previousDevice)) {
          // An adapter or injected test device can return an existing native
          // object. Never destroy it when rejecting the competing wrapper.
          protectedDevice = true;
          throw webGPUDeviceInUse();
        }
        if (lease) {
          managedNativeDevices.set(device, lease);
          lease.device = device;
        }
      }
      validateWebGPUDevice(device);
      canvasOwner = { device };
      const selectedDevice = device;
      const disabledFeatures = requiredFeatures.filter((feature) => selectedDevice.features && !selectedDevice.features.has(feature));
      if (disabledFeatures.length) throw new RenderDeviceError("Requested WebGPU features were not enabled on the device", "WEBGPU_FEATURES_UNAVAILABLE", { missingFeatures: disabledFeatures });
      if (options.requireNativeRendering && (!hasNativeRenderPipeline(device) || typeof device.createShaderModule !== "function")) {
        throw new RenderDeviceError("WebGPU device cannot submit render pipelines", "WEBGPU_RENDERING_UNAVAILABLE");
      }
      if (lease && (options.ownsDevice ?? !options.device)) {
        try {
          candidateDestroy = device.destroy;
          candidateDestroyRead = true;
        } catch (error) {
          // A structural getter may have side effects before it throws. Do
          // not read it again in initialization cleanup.
          candidateDestroyReadFailure = { error };
          throw error;
        }
        if (typeof candidateDestroy !== "function") {
          throw new RenderDeviceError("Managed WebGPU rendering requires a destroyable native device", "WEBGPU_DEVICE_OWNERSHIP_UNAVAILABLE");
        }
      }
      canvasContext = options.canvas ? acquireWebGPUCanvasContext(options.canvas) : null;
      const presentationFormat = options.presentationFormat ?? gpu?.getPreferredCanvasFormat?.() ?? "bgra8unorm";
      if (!lease && ((options.canvas && managedCanvases.has(options.canvas)) ||
          (canvasContext && managedCanvasContexts.has(canvasContext)))) {
        throw webGPUCanvasInUse();
      }
      if (canvasContext && lease) {
        const contextLease = managedCanvasContexts.get(canvasContext);
        const contextOwner = canvasOwners.get(canvasContext);
        if ((lease.context && lease.context !== canvasContext) || (contextLease && contextLease !== lease) ||
            contextOwner || canvasDeviceOwners.get(canvasContext)?.size) {
          if (contextOwner?.device === device) protectedDevice = true;
          throw webGPUCanvasInUse();
        }
        lease.context = canvasContext;
        managedCanvasContexts.set(canvasContext, lease);
        // Record the exact candidate before configure: even a throwing or
        // reentrant configure must not make its cleanup target a newer owner.
        canvasOwners.set(canvasContext, canvasOwner);
        configurationAttempted = true;
        canvasContext.configure({ device, format: presentationFormat, alphaMode: presentationAlphaMode, colorSpace: "srgb" });
      } else {
        canvasContext?.configure({ device, format: presentationFormat, alphaMode: presentationAlphaMode, colorSpace: "srgb" });
        if (canvasContext) canvasOwners.set(canvasContext, canvasOwner);
      }
      constructorStarted = true;
      const owner = new WebGPUDevice(adapter, device, canvasContext, presentationFormat, options, gpu, canvasOwner, lease);
      let owners = nativeDeviceOwners.get(device);
      if (!owners) nativeDeviceOwners.set(device, owners = new Set());
      owners.add(owner);
      if (canvasContext) {
        let canvasDevices = canvasDeviceOwners.get(canvasContext);
        if (!canvasDevices) canvasDeviceOwners.set(canvasContext, canvasDevices = new Set());
        canvasDevices.add(owner);
      }
      if (lease) lease.owner = owner;
      transferred = true;
      return owner;
    } catch (error) {
      if (!lease) {
        if (!protectedDevice && (options.ownsDevice ?? !options.device)) device?.destroy?.();
        throw error;
      }
      const cleanupFailures: unknown[] = [];
      if (configurationAttempted && canvasContext && canvasOwners.get(canvasContext) === canvasOwner) {
        try {
          if (!canvasContext.unconfigure) throw new Error("WebGPU canvas unconfiguration is unavailable");
          canvasContext.unconfigure();
          if (canvasOwners.get(canvasContext) === canvasOwner) canvasOwners.delete(canvasContext);
        } catch (cleanupError) { cleanupFailures.push(cleanupError); }
      }
      if (!protectedDevice && (options.ownsDevice ?? !options.device)) {
        if (candidateDestroyReadFailure) {
          cleanupFailures.push(candidateDestroyReadFailure.error);
        } else {
          try {
            if (candidateDestroyRead) candidateDestroy?.call(device);
            else device?.destroy?.();
          } catch (cleanupError) { cleanupFailures.push(cleanupError); }
        }
      } else if (!protectedDevice && constructorStarted) {
        // A borrowed device cannot be destroyed to certify a failed
        // constructor's capability probes and any partial allocations.
        cleanupFailures.push(new Error("Borrowed WebGPU device initialization cleanup is uncertain"));
      }
      if (cleanupFailures.length) {
        lease.uncertain = true;
        const failure = new RenderDeviceError(
          "WEBGPU_OWNERSHIP_CLEANUP_FAILED: WebGPU initialization failed and its canvas/device cleanup could not be confirmed",
          "WEBGPU_OWNERSHIP_CLEANUP_FAILED"
        );
        failure.cause = new AggregateError([error, ...cleanupFailures], "WebGPU initialization and cleanup failed");
        throw failure;
      }
      throw error;
    } finally {
      if (lease && !transferred && !lease.uncertain) releaseManagedCanvasLease(lease);
    }
  }

  /** The native `GPUDevice` this render device owns; used by `createComputeContext` (SH-04). */
  get nativeGpuDevice(): WebGPUDeviceLike {
    this.assertAlive();
    if (this.#nativeDofActive) this.#nativeDofActive.phase = "invalid";
    return this.device;
  }

  /** Opt into timing the first native forward draw with this exact label in each frame. */
  setForwardPassProfiler(observer: WebGPUForwardPassProfiler | null, options?: { readonly drawLabel: string }): void {
    this.assertAlive();
    if (this.frameActive) throw new RenderDeviceError("Forward pass profiling must be configured outside a frame", "FRAME_ALREADY_ACTIVE");
    if (!observer) { this.forwardPassProfiler = null; return; }
    const drawLabel = options?.drawLabel.trim();
    if (!drawLabel) throw new Error("A forward draw label is required for profiling");
    if (observer.device !== this.device) throw new Error("Forward pass profiler belongs to another WebGPU device");
    if (typeof observer.beginForwardPass !== "function" || typeof observer.submitForwardPass !== "function") throw new Error("Invalid forward pass profiler");
    this.forwardPassProfiler = { observer, drawLabel };
  }

  /** A controller owns this device-local adapter and supplies slot-appropriate fallback pixels. */
  createTextureResidencyAdapter(): WebGPUTextureResidencyAdapter {
    this.assertAlive();
    if (this.nativeStreamingAdapter) return this.nativeStreamingAdapter;
    const adapter: WebGPUTextureResidencyAdapter = {
      device: this,
      generation: () => this.generation,
      isLost: () => this.contextLost || this.disposed,
      usageBytes: () => textureBudgetReport(this).textureBytes,
      acquireBudgetLimit: (maxBytes) => acquireTextureBudgetLimit(maxBytes, this),
      prepare: (source, options) => this.prepareNativeStreamingTexture(source, options),
      unprepare: (source, generation) => this.unprepareNativeStreamingTexture(source, generation),
      estimate: (source, count) => this.estimateNativeStreamingTexture(source, count),
      allocate: (source, levels, options) => this.allocateNativeStreamingTexture(source, levels, options),
      publish: (texture, allocation, generation) => this.publishNativeStreamingTexture(texture, allocation, generation),
      retire: (allocation) => this.retireNativeStreamingAllocation(allocation),
      onDeviceLost: (listener) => {
        this.nativeStreamingLossListeners.add(listener);
        return () => {
          this.nativeStreamingLossListeners.delete(listener);
          this.pendingStreamingLossListeners.delete(listener);
        };
      },
      // WebGPU recovery constructs a different render device and controller.
      onDeviceRestored: () => () => {}
    };
    this.nativeStreamingAdapter = adapter;
    return adapter;
  }

  private streamingTexture(source: WebGPUResidencySource): Texture {
    const texture = source.texture;
    if (!(texture instanceof Texture) || texture.disposed || texture.dimension !== "2d" || !texture.usage.includes("sampled")
      || texture.usage.includes("storage") || texture.usage.includes("render-attachment") || texture.dynamic || texture.source
      || texture.format === "depth24" || getRenderTargetTextureOwner(texture) !== undefined) {
      throw new RenderDeviceError("Texture streaming requires a live, immutable 2D sampled texture", "WEBGPU_RESIDENCY_TEXTURE_UNSUPPORTED");
    }
    if (!source.identity || typeof source.identity !== "object" || !Array.isArray(source.fallback) || source.fallback.length !== 4
      || !source.fallback.every(value => Number.isInteger(value) && value >= 0 && value <= 255)
      || !source.levels.length || source.levels.length !== texture.mipLevelCount) {
      throw new RenderDeviceError("Texture streaming source or fallback is invalid", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    if (((texture.format === "bc1-rgb-unorm" || texture.format === "etc2-rgb8unorm") && source.fallback[3] !== 255)
      || (texture.format === "r32f" && (source.fallback[1] !== 0 || source.fallback[2] !== 0 || source.fallback[3] !== 255))) {
      throw new RenderDeviceError("Texture streaming fallback does not preserve the source channel semantics", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    for (const [index, level] of source.levels.entries()) {
      const previous = source.levels[index - 1];
      if (!Number.isSafeInteger(level.width) || !Number.isSafeInteger(level.height) || !Number.isSafeInteger(level.bytes)
        || level.width < 1 || level.height < 1 || level.bytes < 1
        || (index === 0 && (level.width !== texture.width || level.height !== texture.height))
        || (previous && (previous.width === 1 && previous.height === 1
          || level.width !== Math.max(1, Math.floor(previous.width / 2)) || level.height !== Math.max(1, Math.floor(previous.height / 2))))) {
        throw new RenderDeviceError("Texture streaming mip dimensions are invalid", "WEBGPU_RESIDENCY_SOURCE_INVALID");
      }
    }
    return texture;
  }

  private streamingBudgetLimit(maxBytes: number): number {
    const policy = this.options.textureBudgetPolicy;
    return Math.min(maxBytes, policy?.maxBytes ?? policy?.textureBudgetBytes ?? Infinity);
  }

  private registerNativeCleanup(resource: { destroy(): void }, bookkeeping: readonly NativeCleanupStep[]): void {
    const phases = phasedNativeCleanup(resource, bookkeeping);
    const cleanup = (): void => {
      this.nativeCleanupInFlight += 1;
      this.activeNativeCleanups.add(resource);
      try {
        phases();
        this.nativeRetirementFailures.delete(resource);
      } catch (error) {
        // Invalidation and already-passed fences can run destruction
        // synchronously. Record the failure before returning to an owner that
        // may query its disposal receipt, rather than waiting for a promise
        // rejection handler to run in a later microtask.
        this.nativeRetirementFailures.set(resource, { error });
        this.noteNativeRetirementFailure(error);
        throw error;
      } finally {
        this.activeNativeCleanups.delete(resource);
        this.nativeCleanupInFlight -= 1;
      }
    };
    // The retry callback resumes completed phases rather than replaying
    // native destruction or an accounting callback with an uncertain result.
    this.resourceInterop.register(resource, cleanup, { retryDestroy: cleanup });
  }

  private nativeRetirementPending(resource: object): boolean {
    // A scheduled fence is not a release receipt: it can still reject or its
    // destructor can fail. Retain the wrapper for as long as interop owns the
    // handle, including an otherwise healthy fence that is still in flight.
    return this.activeNativeCleanups.has(resource)
      || this.resourceInterop.owns(resource);
  }

  /** Receipt for one native lease: interop's failure-reporting retirement observer. */
  private nativeRetirementReceipt(resource: object): Promise<void> {
    if (this.resourceInterop.owns(resource)) return this.resourceInterop.whenRetired(resource);
    const failure = this.nativeRetirementFailures.get(resource);
    return failure ? Promise.reject(failure.error) : Promise.resolve();
  }

  private retryFailedNativeRetirement(resource: { destroy(): void }): void {
    const fenceFailure = this.resourceInterop.retirementFenceFailure(resource);
    // Retiring again cannot make a failed fence safe; report the original
    // error without retrying the fence or destroying work still in flight.
    if (fenceFailure) throw fenceFailure.error;
    const failure = this.nativeRetirementFailures.get(resource);
    if (!failure || !this.resourceInterop.owns(resource) || this.activeNativeCleanups.has(resource)) return;
    this.retireNative(resource);
    // An already-passed fence can finish a safe retry synchronously. Otherwise
    // retain and report the last failure until a completion receipt arrives.
    if (this.resourceInterop.owns(resource)) throw (this.nativeRetirementFailures.get(resource) ?? failure).error;
    this.nativeRetirementFailures.delete(resource);
  }

  /**
   * A returned but unregistered handle may alias a lease on this or another
   * device. Acquire ownership before destroying it; if that cannot be proven,
   * retain both the handle and its charge rather than damaging a peer.
   */
  private retireUnregisteredNative(resource: { destroy(): void }, release?: () => void, unsubmitted = false): void {
    let registered = false;
    try {
      this.registerNativeCleanup(resource, release ? [{ run: release }] : []);
      registered = true;
      // A handle allocated for a render target that was never created cannot
      // be referenced by queued GPU work, so it needs no retirement fence.
      if (unsubmitted) this.resourceInterop.markUnsubmitted(resource);
      this.retireNative(resource);
    } catch (error) {
      if (registered && this.resourceInterop.owns(resource)) {
        this.nativeRetirementFailures.set(resource, { error });
      } else {
        this.uncertainNativeAllocations.add({ resource, error, release });
      }
      this.noteNativeRetirementFailure(error);
    }
  }

  private registerStreamingAllocation(texture: Texture, native: WebGPUTextureLike, view: unknown, bytes: number, release: () => void): WebGPUResidencyAllocation {
    const allocation: WebGPUResidencyAllocation = { texture, native, view, bytes, generation: this.generation };
    this.registerNativeCleanup(native, [
      { run: release },
      { run: () => { this.nativeStreamingAllocations.delete(allocation); }, retryable: true }
    ]);
    this.nativeStreamingAllocations.add(allocation);
    this.nativeStreamingOwned.add(allocation);
    return allocation;
  }

  private prepareNativeStreamingTexture(source: WebGPUResidencySource, options: { readonly maxBytes: number; readonly generation: number }): void {
    this.assertAlive();
    if (options.generation !== this.generation) throw new RenderDeviceError("Texture streaming generation is stale", "WEBGPU_RESIDENCY_STALE");
    const texture = this.streamingTexture(source);
    if (this.nativeStreamingLeases.has(texture)) throw new RenderDeviceError("Texture already has a streaming registration", "WEBGPU_RESIDENCY_ALREADY_PREPARED");
    if (!this.device.createTexture || !this.device.queue.writeTexture) throw new RenderDeviceError("Texture streaming uploads are unavailable", "WEBGPU_RESIDENCY_UNAVAILABLE");
    const release = reserveTextureBudget(4, this.streamingBudgetLimit(options.maxBytes), this);
    const revision = texture.revision, colorSpace = texture.colorSpace;
    const assertSourceCurrent = (): void => {
      this.assertAlive();
      if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
      if (texture.revision !== revision || texture.colorSpace !== colorSpace) throw new RenderDeviceError("Texture changed during streaming preparation", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    };
    let native: WebGPUTextureLike | undefined;
    let allocation: WebGPUResidencyAllocation | undefined;
    let removeDispose: (() => void) | undefined;
    try {
      native = this.device.createTexture({ label: `${source.label ?? texture.label}-stream-fallback`, size: [1, 1],
        format: texture.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm", usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST });
      allocation = this.registerStreamingAllocation(texture, native, native.createView(), 4, release);
      assertSourceCurrent();
      if (this.nativeStreamingLeases.has(texture)) throw new RenderDeviceError("Texture already has a streaming registration", "WEBGPU_RESIDENCY_ALREADY_PREPARED");
      this.performNativeTextureUpload(native, () => this.device.queue.writeTexture!({ texture: native! }, new Uint8Array(source.fallback), { bytesPerRow: 4, rowsPerImage: 1 }, { width: 1, height: 1, depthOrArrayLayers: 1 }));
      this.nativeTextureUploads += 1;
      assertSourceCurrent();
      if (this.nativeStreamingLeases.has(texture)) throw new RenderDeviceError("Texture already has a streaming registration", "WEBGPU_RESIDENCY_ALREADY_PREPARED");
      const fallback = allocation;
      let disposalFired = false;
      removeDispose = texture.onDispose(() => {
        disposalFired = true;
        const lease = this.nativeStreamingLeases.get(texture);
        if (!lease || lease.fallback !== fallback) return;
        this.nativeStreamingLeases.delete(texture);
        if (lease.current) void this.retireNativeStreamingAllocation(lease.current);
        void this.retireNativeStreamingAllocation(lease.fallback);
      });
      if (disposalFired) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
      assertSourceCurrent();
      if (this.nativeStreamingLeases.has(texture)) throw new RenderDeviceError("Texture already has a streaming registration", "WEBGPU_RESIDENCY_ALREADY_PREPARED");
      this.nativeStreamingLeases.set(texture, { source, fallback, colorSpace: texture.colorSpace, revision: texture.revision, current: null, removeDispose });
      // Only switch after the replacement is fully allocated and registered.
      if (this.nativeSampledTextures.has(texture)) this.releaseNativeSampledTexture(texture);
      assertSourceCurrent();
      if (this.nativeStreamingLeases.get(texture)?.fallback !== fallback) throw new RenderDeviceError("Texture streaming preparation was interrupted", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    } catch (error) {
      const current = this.nativeStreamingLeases.get(texture);
      if (allocation && current?.fallback === allocation) { current.removeDispose(); this.nativeStreamingLeases.delete(texture); }
      else removeDispose?.();
      if (allocation) { void this.retireNativeStreamingAllocation(allocation); }
      else if (native) this.retireUnregisteredNative(native, release);
      else release();
      throw error;
    }
  }

  private unprepareNativeStreamingTexture(source: WebGPUResidencySource, generation: number): Promise<void> & { readonly retry?: () => Promise<void> } {
    if (generation !== this.generation) throw new RenderDeviceError("Texture streaming generation is stale", "WEBGPU_RESIDENCY_STALE");
    const lease = source.texture instanceof Texture ? this.nativeStreamingLeases.get(source.texture) : undefined;
    // A disposal callback can already have detached this registration while its
    // fallback is still fenced. Absence is not a retirement receipt.
    if (!lease) throw new RenderDeviceError("Texture streaming registration is missing; fallback retirement is unverified", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    if (lease.source.identity !== source.identity || lease.current) throw new RenderDeviceError("Texture streaming registration is still published", "WEBGPU_RESIDENCY_IN_USE");
    if (!this.detachNativeStreamingLease(source.texture as Texture, lease)) {
      throw new RenderDeviceError("Texture streaming registration is being detached", "WEBGPU_RESIDENCY_IN_USE");
    }
    // The registration may be replaced while this retirement is pending. Only
    // this allocation identity can join or safely retry the detached fallback.
    const retry = (): Promise<void> => this.retireNativeStreamingAllocation(lease.fallback);
    let completion: Promise<void>;
    try { completion = retry(); }
    catch (error) { completion = Promise.reject(error); }
    return Object.assign(completion.then(() => undefined), { retry });
  }

  private estimateNativeStreamingTexture(source: WebGPUResidencySource, count: number): number {
    const texture = this.streamingTexture(source);
    const lease = this.nativeStreamingLeases.get(texture);
    if (lease && (lease.colorSpace !== texture.colorSpace || lease.revision !== texture.revision || lease.source.identity !== source.identity)) {
      throw new RenderDeviceError("Texture changed after streaming preparation", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    if (!Number.isInteger(count) || count < 1 || count > source.levels.length) throw new RenderDeviceError("Invalid texture streaming mip count", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    const fallback = needsNativeCompressedFallback(texture.format, this.device.features);
    let bytes = 0;
    for (const level of source.levels.slice(-count)) {
      bytes += fallback ? level.width * level.height * 4 : isCompressedTextureFormat(texture.format)
        ? compressedTextureByteLength(level.width, level.height, texture.format) : level.width * level.height * bytesPerPixel(texture.format);
      if (!Number.isSafeInteger(bytes)) throw new TextureBudgetExceededError("Streamed texture allocation exceeds safe byte accounting.");
    }
    return bytes;
  }

  private async allocateNativeStreamingTexture(source: WebGPUResidencySource, levels: readonly { readonly level: number; readonly value: WebGPUResidencyMip }[], options: { readonly maxBytes: number; readonly signal: AbortSignal }): Promise<{ readonly allocation: WebGPUResidencyAllocation; readonly bytes: number }> {
    this.assertAlive();
    const texture = this.streamingTexture(source), lease = this.nativeStreamingLeases.get(texture);
    if (!lease || lease.colorSpace !== texture.colorSpace || lease.revision !== texture.revision || lease.source.identity !== source.identity || lease.source.levels.length !== source.levels.length
      || lease.source.levels.some((level, index) => level.width !== source.levels[index]?.width || level.height !== source.levels[index]?.height || level.bytes !== source.levels[index]?.bytes)) {
      throw new RenderDeviceError("Texture streaming source is not prepared", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    if (options.signal.aborted) throw options.signal.reason ?? new Error("Texture streaming upload aborted");
    const assertSourceCurrent = (): void => {
      this.assertAlive();
      if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
      if (this.nativeStreamingLeases.get(texture) !== lease || lease.revision !== texture.revision || lease.colorSpace !== texture.colorSpace) {
        throw new RenderDeviceError("Texture changed during streaming upload", "WEBGPU_RESIDENCY_SOURCE_INVALID");
      }
      if (options.signal.aborted) throw options.signal.reason ?? new Error("Texture streaming upload aborted");
    };
    if (!this.device.createTexture || !this.device.queue.writeTexture) throw new RenderDeviceError("Texture streaming uploads are unavailable", "WEBGPU_RESIDENCY_UNAVAILABLE");
    const bytes = this.estimateNativeStreamingTexture(source, levels.length);
    const firstIndex = source.levels.length - levels.length;
    const first = source.levels[firstIndex]!;
    const maxDimension = this.options.textureBudgetPolicy?.maxDimension ?? this.options.textureBudgetPolicy?.maxTextureSize ?? Infinity;
    const nativeLimit = this.device.limits?.maxTextureDimension2D ?? Infinity;
    if (first.width > Math.min(maxDimension, nativeLimit) || first.height > Math.min(maxDimension, nativeLimit)
      || levels.some((level, index) => level.level !== firstIndex + index)) {
      throw new RenderDeviceError("Texture streaming mip tail is invalid or exceeds device limits", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    const fallback = needsNativeCompressedFallback(texture.format, this.device.features);
    const format: TextureFormat = fallback ? "rgba8" : texture.format;
    for (const [index, level] of levels.entries()) {
      const metadata = source.levels[firstIndex + index]!;
      const data = fallback ? level.value.fallbackData : level.value.data;
      const expected = isCompressedTextureFormat(format) ? compressedTextureByteLength(metadata.width, metadata.height, format) : metadata.width * metadata.height * bytesPerPixel(format);
      if ((isCompressedTextureFormat(texture.format) && (!(level.value.data instanceof Uint8Array)
        || level.value.data.byteLength !== compressedTextureByteLength(metadata.width, metadata.height, texture.format)))
        || !data || data.byteLength !== expected || (format === "rgba16f" && !(data instanceof Uint16Array))
        || ((format === "rgba32f" || format === "r32f") && !(data instanceof Float32Array))
        || ((format === "rgba8" || isCompressedTextureFormat(format)) && !(data instanceof Uint8Array || data instanceof Uint8ClampedArray))) {
        throw new RenderDeviceError("Texture streaming mip payload does not match its selected format", "WEBGPU_RESIDENCY_MIP_INVALID", { level: level.level });
      }
      if (fallback && (texture.format === "bc1-rgb-unorm" || texture.format === "etc2-rgb8unorm")) {
        for (let alpha = 3; alpha < data.length; alpha += 4) {
          if (data[alpha] !== 255) throw new RenderDeviceError("Opaque RGB texture streaming fallback must have opaque alpha", "WEBGPU_RESIDENCY_MIP_INVALID", { level: level.level });
        }
      }
    }
    const release = reserveTextureBudget(bytes, this.streamingBudgetLimit(options.maxBytes), this);
    let native: WebGPUTextureLike | undefined;
    let allocation: WebGPUResidencyAllocation | undefined;
    try {
      native = this.device.createTexture({ label: `${source.label ?? texture.label}-stream`, size: [first.width, first.height],
        format: webgpuSampledTextureFormat(texture, format), usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST, mipLevelCount: levels.length });
      allocation = this.registerStreamingAllocation(texture, native, native.createView(), bytes, release);
      assertSourceCurrent();
      for (const [index, level] of levels.entries()) {
        assertSourceCurrent();
        const metadata = source.levels[firstIndex + index]!;
        const data = fallback ? level.value.fallbackData! : level.value.data;
        const compressed = isCompressedTextureFormat(format);
        const bytesPerRow = compressed ? Math.ceil(metadata.width / 4) * compressedBlockBytes(format) : metadata.width * bytesPerPixel(format);
        const rowsPerImage = compressed ? Math.ceil(metadata.height / 4) : metadata.height;
        this.performNativeTextureUpload(native, () => this.device.queue.writeTexture!({ texture: native!, mipLevel: index }, data, { bytesPerRow, rowsPerImage },
          { width: metadata.width, height: metadata.height, depthOrArrayLayers: 1 }));
        this.nativeTextureUploads += 1;
        assertSourceCurrent();
      }
      return { allocation, bytes };
    } catch (error) {
      try {
        if (allocation) await this.retireNativeStreamingAllocation(allocation);
        else if (native) this.retireUnregisteredNative(native, release);
        else release();
      } catch (cleanupError) {
        // Both the failed upload and its failed retirement are actionable.
        // The retained interop lease continues to own any unfinished cleanup.
        throw new AggregateError([error, cleanupError], "WebGPU streaming allocation and cleanup failed", { cause: error });
      }
      throw error;
    }
  }

  private publishNativeStreamingTexture(texture: object, allocation: WebGPUResidencyAllocation | null, generation: number): void {
    this.assertAlive();
    if (generation !== this.generation) throw new RenderDeviceError("Texture streaming generation is stale", "WEBGPU_RESIDENCY_STALE");
    const lease = texture instanceof Texture ? this.nativeStreamingLeases.get(texture) : undefined;
    if (!lease) throw new RenderDeviceError("Texture streaming source is not prepared", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    if (texture instanceof Texture && texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
    if (allocation && texture instanceof Texture && (lease.colorSpace !== texture.colorSpace || lease.revision !== texture.revision)) {
      throw new RenderDeviceError("Texture changed after streaming preparation", "WEBGPU_RESIDENCY_SOURCE_INVALID");
    }
    const selected = allocation ?? lease.fallback;
    if (!this.nativeStreamingOwned.has(selected) || selected.texture !== texture || selected.generation !== generation) {
      throw new RenderDeviceError("Texture streaming allocation belongs to another texture or device", "WEBGPU_RESIDENCY_FOREIGN");
    }
    this.resourceInterop.assertUsable(selected.native);
    lease.current = allocation;
  }

  private retireNativeStreamingAllocation(allocation: WebGPUResidencyAllocation): Promise<void> {
    if (!this.nativeStreamingOwned.has(allocation)) throw new RenderDeviceError("Texture streaming allocation is foreign", "WEBGPU_RESIDENCY_FOREIGN");
    const previous = this.nativeStreamingRetirements.get(allocation);
    if (previous) return previous;
    const lease = allocation.texture instanceof Texture ? this.nativeStreamingLeases.get(allocation.texture) : undefined;
    if (lease && (lease.current === allocation || lease.fallback === allocation)) throw new RenderDeviceError("Published texture streaming allocation is still in use", "WEBGPU_RESIDENCY_IN_USE");
    const completion = this.resourceInterop.owns(allocation.native) ? this.requestNativeRetirement(allocation.native) : Promise.resolve();
    this.nativeStreamingRetirements.set(allocation, completion);
    // Keep a successful receipt for idempotent repeated calls, but a rejected
    // receipt must not permanently prevent an explicit safe retry.
    void completion.then(() => {}, () => {
      if (this.nativeStreamingRetirements.get(allocation) === completion) this.nativeStreamingRetirements.delete(allocation);
    });
    return completion;
  }

  private detachNativeStreamingTextures(): void {
    const failures: unknown[] = [];
    for (const [texture, lease] of [...this.nativeStreamingLeases]) {
      try { this.detachNativeStreamingLease(texture, lease); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Failed to detach WebGPU streaming textures");
  }

  private detachNativeStreamingLease(texture: Texture, lease: WebGPUResidencyLease): boolean {
    if (this.nativeStreamingLeases.get(texture) !== lease) return true;
    if (this.nativeStreamingDetachInFlight.has(lease)) return false;
    this.nativeStreamingDetachInFlight.add(lease);
    try {
      lease.removeDispose();
      if (this.nativeStreamingLeases.get(texture) === lease) this.nativeStreamingLeases.delete(texture);
      return true;
    } finally { this.nativeStreamingDetachInFlight.delete(lease); }
  }

  private unconfigureNativeCanvas(): void {
    if (!this.nativeCanvasUnconfigurePending) return;
    const canvas = this.canvasContext;
    if (canvas && canvasOwners.get(canvas) === this.canvasOwner) {
      const unconfigure = canvas.unconfigure;
      // An exclusive reservation needs an actual unconfiguration receipt.
      if (this.managedCanvasLease && typeof unconfigure !== "function") {
        throw new Error("WebGPU canvas unconfiguration is unavailable");
      }
      unconfigure?.call(canvas);
      if (canvasOwners.get(canvas) === this.canvasOwner) canvasOwners.delete(canvas);
    }
    // A newer device can supersede us between attempts; its surface must not
    // be unconfigured by this stale owner.
    this.nativeCanvasUnconfigurePending = false;
  }

  /** Return an owned native buffer so compute and rendering share this queue. */
  getNativeBuffer(buffer: RenderBuffer): WebGPUBufferLike {
    this.assertAlive();
    const owned = this.requireBuffer(buffer);
    const handle = nativeBufferHandle(owned);
    this.assertVertexConversionUnpinned(owned);
    if (this.#pointPinnedHandles.has(handle)) throw new RenderDeviceError("Point buffers cannot be borrowed during submission", "WEBGPU_POINT_SUBMISSION_ACTIVE");
    if (this.#mrtPinnedHandles.has(handle)) throw new RenderDeviceError("Submission buffers cannot be borrowed while pinned", "WEBGPU_MRT_SUBMISSION_ACTIVE");
    if (this.nativeForwardBundlePins.has(handle)) throw new RenderDeviceError("Bundle resources cannot be borrowed during submission", "WEBGPU_BUNDLE_SUBMISSION_ACTIVE");
    this.resourceInterop.assertUsable(handle);
    // A borrowed handle may be written by compute or direct native work.
    this.retireVertexConversions(owned);
    this.nativeExposedBuffers.add(owned);
    this.invalidateNativeForwardBundlesForBuffer(owned);
    this.#pointFrameWrites.delete(owned);
    owned.shadowValid = false;
    return handle;
  }

  /** Validate the numeric metadata required by native storage/compute APIs. */
  getNativeStorageBuffer(buffer: RenderBuffer): WebGPUBufferLike & { readonly size: number; readonly usage: number } {
    const handle = this.getNativeBuffer(buffer) as WebGPUBufferLike & { size?: unknown; usage?: unknown };
    if (typeof handle.size !== "number" || typeof handle.usage !== "number" || (handle.usage & BUFFER_USAGE.STORAGE) === 0) {
      throw new RenderDeviceError("Buffer does not expose native storage usage", "WEBGPU_STORAGE_BUFFER_REQUIRED");
    }
    return handle as WebGPUBufferLike & { readonly size: number; readonly usage: number };
  }

  /** Verified limits for a generation-scoped point arena; injected devices must report them. */
  getNativePointLimits(): { readonly generation: number; readonly maxBufferSize: number; readonly maxVertexBuffers: number } {
    this.assertAlive();
    const maxBufferSize = this.device.limits?.maxBufferSize;
    const maxVertexBuffers = this.device.limits?.maxVertexBuffers;
    if (!Number.isSafeInteger(maxBufferSize) || maxBufferSize! <= 0 || !Number.isSafeInteger(maxVertexBuffers) || maxVertexBuffers! <= 0) {
      throw new RenderDeviceError("Native point expansion requires reported device buffer limits", "WEBGPU_POINT_LIMITS_UNAVAILABLE");
    }
    return { generation: this.generation, maxBufferSize: maxBufferSize!, maxVertexBuffers: maxVertexBuffers! };
  }

  /** Capture the current scene raster state before any depth-target switch. */
  getNativePointViewport(): WebGPUNativePointViewport {
    this.assertFrame();
    const frameToken = this.activeFrameToken;
    if (!frameToken) throw new RenderDeviceError("Point raster state requires a completed frame begin", "WEBGPU_POINT_VIEWPORT_UNAVAILABLE");
    const target = this.activeRenderTarget;
    if (target) {
      if (!target.nativeView) throw new RenderDeviceError("Point raster target is unavailable", "WEBGPU_POINT_VIEWPORT_UNAVAILABLE");
      this.requireRenderTarget(target);
      if (target.nativeTexture) this.resourceInterop.assertUsable(target.nativeTexture);
      if (target.nativeMultisampleTexture) this.resourceInterop.assertUsable(target.nativeMultisampleTexture);
    } else if (!this.canvasContext || canvasOwners.get(this.canvasContext) !== this.canvasOwner) {
      throw new RenderDeviceError("Point raster canvas is unavailable", "WEBGPU_POINT_VIEWPORT_UNAVAILABLE");
    }
    const targetWidth = target?.width ?? this.viewportWidth, targetHeight = target?.height ?? this.viewportHeight;
    const viewTarget = this.gaussianSplatBorrowedDepth ?? target;
    const viewport = (this.viewStateTarget === viewTarget ? this.viewportOverride : null)
      ?? (target === null ? this.persistentViewportRect : null) ?? { x: 0, y: 0, width: targetWidth, height: targetHeight };
    const scissor = this.viewStateTarget === viewTarget && this.scissorTestOn ? this.scissorOverride : null;
    const validRect = (value: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, integer: boolean): boolean =>
      [value.x, value.y, value.width, value.height, targetWidth, targetHeight].every(number => Number.isFinite(number) && Number.isFinite(Math.fround(number)))
      && (!integer || [value.x, value.y, value.width, value.height].every(Number.isSafeInteger))
      && value.x >= 0 && value.y >= 0 && (integer ? value.width >= 0 && value.height >= 0 : value.width > 0 && value.height > 0)
      && value.x + value.width <= targetWidth && value.y + value.height <= targetHeight;
    if (!validRect(viewport, false) || (scissor && !validRect(scissor, true))
      || !Number.isFinite(Math.fround(2 / Math.fround(viewport.width))) || !Number.isFinite(Math.fround(2 / Math.fround(viewport.height)))) {
      throw new RenderDeviceError("Point raster viewport or scissor is invalid", "WEBGPU_POINT_VIEWPORT_INVALID");
    }
    const snapshot: WebGPUNativePointViewport = { generation: this.generation, frameToken, target, targetWidth, targetHeight,
      x: viewport.x, y: viewport.y, width: viewport.width, height: viewport.height,
      scissor: scissor ? { x: scissor.x, y: scissor.y, width: scissor.width, height: scissor.height } : null };
    this.pointViewportSnapshots.set(snapshot, { ...snapshot, scissor: snapshot.scissor ? { ...snapshot.scissor } : null });
    return snapshot;
  }

  /** Validate identity/liveness; callers rendering to the scene target also require the current viewport. */
  assertNativePointViewport(snapshot: WebGPUNativePointViewport, requireCurrent = true): void {
    const recorded = this.pointViewportSnapshots.get(snapshot);
    const same = (a: WebGPUNativePointViewport, b: WebGPUNativePointViewport): boolean =>
      a.generation === b.generation && a.frameToken === b.frameToken && a.target === b.target
      && a.targetWidth === b.targetWidth && a.targetHeight === b.targetHeight && a.x === b.x && a.y === b.y
      && a.width === b.width && a.height === b.height && (a.scissor === null ? b.scissor === null
        : !!a.scissor && !!b.scissor && a.scissor.x === b.scissor.x && a.scissor.y === b.scissor.y
          && a.scissor.width === b.scissor.width && a.scissor.height === b.scissor.height);
    let valid = false;
    try {
      valid = Boolean(recorded && same(snapshot, recorded) && this.activeFrameToken === recorded.frameToken && this.generation === recorded.generation
        && (!recorded.target || !recorded.target.disposed));
      if (valid && recorded?.target) {
        const target = this.requireRenderTarget(recorded.target);
        if (target.nativeTexture) this.resourceInterop.assertUsable(target.nativeTexture);
        if (target.nativeMultisampleTexture) this.resourceInterop.assertUsable(target.nativeMultisampleTexture);
      }
      if (valid && requireCurrent) valid = same(this.getNativePointViewport(), recorded!);
    } catch { valid = false; }
    if (!valid) {
      throw new RenderDeviceError("Point raster viewport snapshot is stale", "WEBGPU_POINT_VIEWPORT_STALE");
    }
  }

  /** Native borrowing is permanent: a later CPU write cannot revoke a caller's retained handle. */
  assertNativePointBufferUnexposed(buffer: RenderBuffer): void {
    this.assertAlive();
    const owned = this.requireBuffer(buffer);
    if (this.nativeExposedBuffers.has(owned) || !owned.shadowValid) {
      throw new RenderDeviceError("A point buffer exposed to native writes cannot certify its CPU bytes", "WEBGPU_POINT_BUFFER_AUTHORITY_UNAVAILABLE", { bufferId: buffer.id });
    }
    this.resourceInterop.assertUsable(nativeBufferHandle(owned));
  }

  /**
   * Staged point allocation with an exact-buffer write stamp and a cleanup
   * receipt. This is not a certificate for injected native operations or an
   * authorization to draw point quads.
   */
  createNativePointBuffer(bytes: ArrayBufferView):
    | { readonly ok: true; readonly buffer: RenderBuffer; readonly stamp: object }
    | { readonly ok: false; readonly error: unknown; readonly cleanup: Promise<void> } {
    let byteLength: number, size: number;
    try {
      const limits = this.getNativePointLimits();
      if (!ArrayBuffer.isView(bytes) || bytes.byteLength <= 0 || !Number.isSafeInteger(bytes.byteLength)) {
        throw new RenderDeviceError("Point buffer bytes must be nonempty", "WEBGPU_POINT_BUFFER_INVALID");
      }
      byteLength = bytes.byteLength;
      size = alignTo(byteLength, 4);
      if (!Number.isSafeInteger(size) || size > limits.maxBufferSize) throw new RenderDeviceError("Point buffer exceeds the native size limit", "WEBGPU_POINT_BUFFER_INVALID");
    } catch (error) { return { ok: false, error, cleanup: Promise.resolve() }; }

    let handle: WebGPUBufferLike;
    try { handle = this.device.createBuffer({ label: `aura3d-point-${this.nextId}`, size, usage: bufferUsageFlags("vertex") }); }
    catch (error) { return { ok: false, error, cleanup: this.waitForNativePointInvalidation() }; }

    let registered = false;
    let destroyed = false;
    try {
      this.registerNativeCleanup(handle, [{ run: () => { destroyed = true; } }]);
      registered = true;
      if (bytes.byteLength !== byteLength) throw new RenderDeviceError("Point buffer source changed during allocation", "WEBGPU_POINT_BUFFER_INVALID");
      let disposalAccounted = false;
      const buffer = new WebGPURenderBuffer(this.nextId++, "vertex", byteLength, size, handle, resource => this.retireNative(resource), retired => {
        this.retireVertexConversions(retired);
        if (this.buffers.delete(retired) && !disposalAccounted) { disposalAccounted = true; this.disposedBufferCount += 1; }
      }, bytes, retired => this.assertVertexConversionUnpinned(retired), (retired, error) => {
        this.buffers.add(retired);
        this.rejectLateDisposalFailure(error);
      },
      (retired, active) => { if (active) this.activeBufferDisposals.add(retired); else this.activeBufferDisposals.delete(retired); },
      resource => this.nativeRetirementPending(resource), resource => this.retryFailedNativeRetirement(resource),
      resource => this.activeNativeCleanups.has(resource));
      writeAlignedQueueBuffer(this.device.queue, handle, 0, buffer.bytes, size);
      this.assertAlive();
      this.resourceInterop.assertUsable(handle);
      const epoch = {}, stamp = {};
      this.ownedBuffers.add(buffer);
      this.buffers.add(buffer);
      nativeRetirementReceipts.set(buffer, resource => this.nativeRetirementReceipt(resource));
      this.#pointBufferEpochs.set(buffer, epoch);
      this.#pointBufferDestroyed.set(buffer, () => destroyed);
      this.#pointBufferStamps.set(stamp, { buffer, generation: this.generation, epoch });
      return { ok: true, buffer, stamp };
    } catch (error) {
      // A failed registration may involve an aliased foreign handle. An
      // unreturned native allocation cannot be proven retired by this device.
      if (!registered) return { ok: false, error, cleanup: this.waitForNativePointInvalidation() };
      let cleanup: Promise<void>;
      try {
        cleanup = this.requestNativeRetirement(handle).then(
          () => destroyed ? undefined : this.waitForNativePointInvalidation()
        );
        // The allocation failure may be returned before its cleanup is
        // observed by the point owner; keep the rejection observable without
        // producing an unhandled rejection in the meantime.
        void cleanup.catch(() => {});
      } catch { cleanup = this.waitForNativePointInvalidation(); }
      return { ok: false, error, cleanup };
    }
  }

  /** Check CPU-write/storage-use attempts and native borrowing since creation. */
  assertNativePointBufferStamp(buffer: RenderBuffer, stamp: object): void {
    const recorded = this.#pointBufferStamps.get(stamp);
    if (!recorded || recorded.buffer !== buffer || recorded.generation !== this.generation
      || this.#pointBufferEpochs.get(recorded.buffer) !== recorded.epoch) {
      throw new RenderDeviceError("Point buffer stamp is stale or foreign", "WEBGPU_POINT_BUFFER_STALE");
    }
    this.assertNativePointBufferUnexposed(buffer);
  }

  private waitForNativePointInvalidation(): Promise<void> {
    if (this.pointInvalidated) return Promise.resolve();
    return new Promise(resolve => { this.onNativePointInvalidated(resolve); });
  }

  /** A point arena retains its reservation until actual fence completion or device loss. */
  retireNativePointBuffer(buffer: RenderBuffer): Promise<void> {
    if (!(buffer instanceof WebGPURenderBuffer) || !this.ownedBuffers.has(buffer)) {
      throw new RenderDeviceError("Buffer was not created by this WebGPU device", "FOREIGN_RESOURCE", { bufferId: buffer.id });
    }
    if (this.#pointPinnedHandles.has(nativeBufferHandle(buffer))) {
      throw new RenderDeviceError("Point buffers cannot be retired during submission", "WEBGPU_POINT_SUBMISSION_ACTIVE");
    }
    const existing = this.pointBufferRetirements.get(buffer);
    if (existing) return existing;
    if (!buffer.disposed || buffer[resourceDisposalPending]) buffer.dispose();
    const handle = nativeBufferHandle(buffer);
    const receipt = this.resourceInterop.owns(handle) ? this.requestNativeRetirement(handle) : Promise.resolve();
    // A failed or unavailable fence is not a release: the lease (and this
    // reservation) stays pending until genuine loss or owned-device
    // destruction invalidates it. Destruction failures still reject.
    const retired = receipt.catch((error: unknown) => {
      if (!this.resourceInterop.owns(handle)) return undefined;
      if (this.resourceInterop.hasUnfencedRetirement(handle)) return this.waitForNativePointInvalidation();
      throw error;
    });
    const destroyed = this.#pointBufferDestroyed.get(buffer);
    const completion = destroyed ? retired.then(() => destroyed() ? undefined : this.waitForNativePointInvalidation()) : retired;
    this.pointBufferRetirements.set(buffer, completion);
    void completion.then(() => {}, () => {
      if (this.pointBufferRetirements.get(buffer) === completion) this.pointBufferRetirements.delete(buffer);
    });
    return completion;
  }

  /** Notify only after genuine native loss or owned-device destruction. */
  onNativePointInvalidated(listener: () => void): () => void {
    if (this.pointInvalidated) { listener(); return () => {}; }
    this.pointInvalidationListeners.add(listener);
    return () => { this.pointInvalidationListeners.delete(listener); };
  }

  private notifyNativePointInvalidated(): void {
    if (this.pointInvalidated) return;
    this.pointInvalidated = true;
    const listeners = [...this.pointInvalidationListeners];
    this.pointInvalidationListeners.clear();
    for (const listener of listeners) { try { listener(); } catch { /* Notify the other arena owners. */ } }
  }

  private noteNativeRetirementFailure(error: unknown): void {
    this.lastError = `WebGPU native retirement failed: ${describeNativeCleanupFailure(error)}`;
  }

  /** Observe even fire-and-forget retirements without changing their rejection. */
  private requestNativeRetirement(resource: object): Promise<void> {
    const previous = this.nativeRetirementAttempts.get(resource);
    if (previous) return previous;
    const failureAtStart = this.nativeRetirementFailures.get(resource);
    this.resourceInterop.retire(resource);
    // A destructor can reenter this method before retire() returns. Join the
    // already-published attempt instead of replacing its receipt.
    const reentrant = this.nativeRetirementAttempts.get(resource);
    if (reentrant) return reentrant;
    // Unlike the underlying lease promise, this receipt reports fence failure
    // to owners (notably texture residency) while interop keeps the lease.
    const completion = this.resourceInterop.whenRetired(resource);
    // A retry can finish synchronously after a previously passed fence.
    if (!this.resourceInterop.owns(resource)) this.nativeRetirementFailures.delete(resource);
    this.nativeRetirementAttempts.set(resource, completion);
    void completion.then(() => {
      if (this.nativeRetirementAttempts.get(resource) !== completion) return;
      this.nativeRetirementAttempts.delete(resource);
      if (!this.resourceInterop.owns(resource)) this.nativeRetirementFailures.delete(resource);
    }, (error: unknown) => {
      if (this.nativeRetirementAttempts.get(resource) !== completion) return;
      this.nativeRetirementAttempts.delete(resource);
      if (this.resourceInterop.owns(resource)) {
        // A newer synchronous cleanup attempt may already have recorded a
        // different failure before this older promise rejection is observed.
        if (this.nativeRetirementFailures.get(resource) !== failureAtStart) return;
        this.nativeRetirementFailures.set(resource, { error });
        this.noteNativeRetirementFailure(error);
      }
    });
    return completion;
  }

  private notifyPendingStreamingLossListeners(): void {
    // Loss notification is also a ledger-cleanup receipt for residency
    // controllers. A failed or foreign/ambiguous allocation is not a receipt.
    if (this.resourceInterop.liveResources > 0 || this.uncertainNativeAllocations.size > 0) return;
    const listeners = [...this.pendingStreamingLossListeners];
    this.pendingStreamingLossListeners.clear();
    for (const listener of listeners) {
      try { listener(); } catch { /* Continue notifying other owners. */ }
    }
  }

  private retireInteropAfterFence(): Promise<void> {
    if (this.interopRetirement) return this.interopRetirement;
    const completion = this.resourceInterop.dispose();
    this.interopRetirement = completion;
    this.hasCurrentInteropRetirementFailure();
    void completion.then(() => {
      if (this.interopRetirement !== completion) return;
      this.interopRetirement = null;
      this.interopRetirementFailure = undefined;
      if (this.disposed || this.contextLost) this.notifyPendingStreamingLossListeners();
    }, (error: unknown) => {
      if (this.interopRetirement !== completion) return;
      this.interopRetirement = null;
      if (this.resourceInterop.liveResources === 0 || !this.resourceInterop.retirementDestructionErrors.includes(error)) {
        // A failed lease can complete an explicit safe retry before this older
        // rejection observer runs, even while other fences are still waiting.
        // Do not attribute that stale failure to those unrelated leases.
        this.interopRetirementFailure = undefined;
        if (this.resourceInterop.liveResources === 0 && (this.disposed || this.contextLost)) this.notifyPendingStreamingLossListeners();
        return;
      }
      this.interopRetirementFailure = { error };
      this.noteNativeRetirementFailure(error);
    });
    return completion;
  }

  /** Lost GPU handles cannot migrate; callers must rebuild scene resources. */
  async recover(): Promise<WebGPUDevice> {
    if (!this.contextLost) throw new RenderDeviceError("Device recovery requires a lost device", "WEBGPU_DEVICE_NOT_LOST");
    if (this.options.device) throw new RenderDeviceError("An injected device must be replaced by its owner", "WEBGPU_RECOVERY_REQUIRES_DEVICE");
    const options = { ...this.options, gpu: this.gpu, adapter: this.adapter };
    const lease = this.managedCanvasLease;
    if (!lease) {
      this.dispose();
      return WebGPUDevice.create(options);
    }
    if (lease.owner !== this || managedCanvases.get(lease.canvas) !== lease) {
      throw new RenderDeviceError("WEBGPU_RECOVERY_OWNERSHIP_LOST: The canvas reservation is no longer owned by this device", "WEBGPU_RECOVERY_OWNERSHIP_LOST");
    }
    if (lease.recovering) throw new RenderDeviceError("WebGPU device recovery is already in progress", "WEBGPU_RECOVERY_IN_PROGRESS");
    lease.recovering = true;
    try {
      this.dispose();
      await this.whenDisposed();
      return await WebGPUDevice.createInternal(options, { lease, previousDevice: this.device });
    } finally {
      lease.recovering = false;
      // A successful old teardown followed by a failed replacement must not
      // strand a clean reservation. Uncertain cleanup deliberately fails closed.
      if (lease.owner === this && this.disposalAttempt?.state === "resolved" && !lease.uncertain) {
        releaseManagedCanvasLease(lease);
        lease.owner = undefined;
      }
    }
  }

  private colorNegotiation: { requested: "srgb" | "display-p3"; active: "srgb" | "display-p3"; supported: readonly ("srgb" | "display-p3")[]; fallbackReason?: string } = { requested: "srgb", active: "srgb", supported: ["srgb"] };

  negotiateOutputColorSpace(requested: "srgb" | "display-p3" = "srgb"): { requested: "srgb" | "display-p3"; active: "srgb" | "display-p3"; supported: readonly ("srgb" | "display-p3")[]; fallbackReason?: string } {
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    if (requested !== "srgb" && requested !== "display-p3") throw new RenderDeviceError("Unknown output color space", "WEBGPU_INVALID_COLOR_SPACE", { requested });
    if (!this.canvasContext) return this.colorNegotiation = { requested, active: "srgb", supported: ["srgb"], ...(requested === "display-p3" ? { fallbackReason: "Canvas context is unavailable" } : {}) };
    const canvas = this.canvasContext;
    if (canvasOwners.get(canvas) !== this.canvasOwner) throw new RenderDeviceError("Canvas is owned by a newer device", "WEBGPU_CANVAS_SUPERSEDED");
    const alphaMode = this.options.presentationAlphaMode === "premultiplied" ? "premultiplied" : "opaque";
    const supported = (): readonly ("srgb" | "display-p3")[] => this.displayP3Verified ? ["srgb", "display-p3"] : ["srgb"];
    let p3Attempted = false;
    const matches = (configuration: WebGPUCanvasConfigurationLike | null | undefined, colorSpace: "srgb" | "display-p3"): boolean => Boolean(configuration &&
      configuration.device === this.device && configuration.format === this.presentationFormat && (configuration.alphaMode ?? "opaque") === alphaMode &&
      (configuration.colorSpace ?? "srgb") === colorSpace && (colorSpace !== "display-p3" || configuration.colorSpace === "display-p3"));
    const read = (): WebGPUCanvasConfigurationLike | null | undefined => { try { return canvas.getConfiguration?.(); } catch { return undefined; } };
    const restoreSrgb = (reason?: string): typeof this.colorNegotiation => {
      this.canvasTargetGeneration += 1;
      try { canvas.configure({ device: this.device, format: this.presentationFormat, alphaMode, colorSpace: "srgb" }); }
      catch (error) {
        this.canvasColorUsable = false;
        throw new RenderDeviceError("Unable to restore the sRGB canvas configuration", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED", { cause: String(error) });
      }
      const configuration = read();
      if (canvasOwners.get(canvas) !== this.canvasOwner || (configuration && !matches(configuration, "srgb")) ||
          (canvas.getConfiguration && configuration === null) || ((this.activeColorSpace === "display-p3" || p3Attempted) && !configuration)) {
        this.canvasColorUsable = false;
        throw new RenderDeviceError("The restored sRGB canvas configuration could not be verified", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
      }
      this.activeColorSpace = "srgb";
      this.canvasColorUsable = true;
      return this.colorNegotiation = { requested, active: "srgb", supported: supported(), ...(reason ? { fallbackReason: reason } : {}) };
    };
    if (requested === "srgb") {
      const configuration = read();
      if (this.canvasColorUsable && this.activeColorSpace === "srgb" && configuration !== null && (!configuration || matches(configuration, "srgb"))) {
        return this.colorNegotiation = { requested, active: "srgb", supported: supported() };
      }
      return restoreSrgb();
    }
    if (alphaMode !== "opaque" || (this.presentationFormat !== "rgba8unorm" && this.presentationFormat !== "bgra8unorm")) {
      this.displayP3Verified = false;
      return this.activeColorSpace === "srgb" && this.canvasColorUsable
        ? (this.colorNegotiation = { requested, active: "srgb", supported: supported(), fallbackReason: "Display-P3 requires an opaque unorm canvas" })
        : restoreSrgb("Display-P3 requires an opaque unorm canvas");
    }
    const previous = read();
    if (!canvas.getConfiguration || !previous) {
      this.displayP3Verified = false;
      if (previous === null) return restoreSrgb("Canvas color-space configuration is unavailable");
      if (this.activeColorSpace !== "srgb" || !this.canvasColorUsable) return restoreSrgb("Canvas color-space configuration is unavailable");
      return this.colorNegotiation = { requested, active: "srgb", supported: supported(), fallbackReason: "Canvas color-space configuration is unavailable" };
    }
    if (this.activeColorSpace === "display-p3" && this.canvasColorUsable && matches(previous, "display-p3")) {
      return this.colorNegotiation = { requested, active: "display-p3", supported: supported() };
    }
    this.canvasTargetGeneration += 1;
    p3Attempted = true;
    try {
      canvas.configure({ device: this.device, format: this.presentationFormat, alphaMode: "opaque", colorSpace: "display-p3" });
      const actual = read();
      if (canvasOwners.get(canvas) === this.canvasOwner && matches(actual, "display-p3")) {
        this.activeColorSpace = "display-p3";
        this.canvasColorUsable = true;
        this.displayP3Verified = true;
        return this.colorNegotiation = { requested, active: "display-p3", supported: supported() };
      }
    } catch { /* Restore the known sRGB path below. */ }
    this.displayP3Verified = false;
    return restoreSrgb("Display-P3 canvas configuration was not confirmed");
  }

  getOutputColorSpaceNegotiation(): typeof this.colorNegotiation {
    if (!this.canvasColorUsable) throw new RenderDeviceError("Canvas color configuration is unavailable", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
    if (this.canvasContext) this.assertActiveCanvasColor();
    return this.colorNegotiation;
  }

  private assertVerifiedP3Canvas(): WebGPUCanvasContextLike {
    this.assertAlive();
    const canvas = this.canvasContext;
    if (!this.canvasColorUsable || this.activeColorSpace !== "display-p3" || !canvas || canvasOwners.get(canvas) !== this.canvasOwner || !canvas.getConfiguration) {
      throw new RenderDeviceError("A verified Display-P3 canvas is unavailable", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
    }
    let configuration: WebGPUCanvasConfigurationLike | null;
    try { configuration = canvas.getConfiguration(); }
    catch { this.canvasColorUsable = false; this.displayP3Verified = false; throw new RenderDeviceError("Display-P3 canvas configuration is unavailable", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED"); }
    if (!configuration || configuration.device !== this.device || configuration.format !== this.presentationFormat ||
        configuration.colorSpace !== "display-p3" || (configuration.alphaMode ?? "opaque") !== "opaque") {
      this.canvasColorUsable = false;
      this.displayP3Verified = false;
      throw new RenderDeviceError("Display-P3 canvas configuration changed", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
    }
    return canvas;
  }

  private assertActiveCanvasColor(): void {
    if (this.activeColorSpace === "display-p3") { this.assertVerifiedP3Canvas(); return; }
    const canvas = this.canvasContext;
    if (!this.canvasColorUsable || !canvas || canvasOwners.get(canvas) !== this.canvasOwner) {
      throw new RenderDeviceError("Canvas color configuration is unavailable", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
    }
    if (!canvas.getConfiguration) return;
    let configuration: WebGPUCanvasConfigurationLike | null | undefined;
    try { configuration = canvas.getConfiguration(); } catch { return; }
    if (configuration === null || (configuration && ((configuration.device !== undefined && configuration.device !== this.device) ||
        (configuration.format !== undefined && configuration.format !== this.presentationFormat) ||
        (configuration.colorSpace !== undefined && configuration.colorSpace !== "srgb")))) {
      this.canvasColorUsable = false;
      throw new RenderDeviceError("Canvas color configuration changed", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
    }
  }

  private verifiedP3CanvasTexture(): { readonly canvas: WebGPUCanvasContextLike; readonly texture: WebGPUTextureLike; readonly view: unknown; readonly generation: number } {
    const canvas = this.assertVerifiedP3Canvas(), texture = canvas.getCurrentTexture();
    if (!texture || this.resourceInterop.owns(texture) || (texture.format !== undefined && texture.format !== this.presentationFormat) ||
        (texture.sampleCount !== undefined && texture.sampleCount !== 1) ||
        (texture.usage !== undefined && (texture.usage & TEXTURE_USAGE.RENDER_ATTACHMENT) === 0)) {
      throw new RenderDeviceError("Display-P3 canvas texture is unavailable or incompatible", "WEBGPU_SURFACE_UNAVAILABLE");
    }
    const view = texture.createView();
    if (!view) throw new RenderDeviceError("Display-P3 canvas view is unavailable", "WEBGPU_SURFACE_UNAVAILABLE");
    return { canvas, texture, view, generation: this.canvasTargetGeneration };
  }

  private assertP3CanvasTexture(surface: { readonly canvas: WebGPUCanvasContextLike; readonly texture: WebGPUTextureLike; readonly generation: number }): void {
    if (this.assertVerifiedP3Canvas() !== surface.canvas || this.canvasTargetGeneration !== surface.generation ||
        surface.canvas.getCurrentTexture() !== surface.texture) {
      throw new RenderDeviceError("Display-P3 canvas changed before submission", "WEBGPU_PRESENTATION_STALE");
    }
  }

  private prepareP3OutputDraw(command: DrawCommand, shader: WebGPUShaderProgram, surface: { readonly canvas: WebGPUCanvasContextLike; readonly texture: WebGPUTextureLike; readonly generation: number }): () => void {
    const identity = this.#p3OutputShaders.get(shader), state = command.renderState;
    const vertex = this.requireBuffer(command.vertexBuffer), scene = command.uniforms?.get("u_scene");
    const texture = isTextureBinding(scene) ? scene.texture : null;
    if (!identity || shader.nativeUniformLayout !== "portable" || !state || state.depthTest || state.depthWrite || state.blend ||
        (state.blendMode !== undefined && state.blendMode !== "opaque") || state.cullMode !== "none" || state.stencil || state.scissor ||
        state.alphaToCoverage || (state.sampleMask !== undefined && state.sampleMask !== 0xffffffff) ||
        (state.colorWrite !== undefined && (state.colorWrite.length !== 4 || state.colorWrite.some(value => !value))) ||
        (state.colorAttachments?.length ?? 0) !== 0 || command.topology !== "triangles" || command.vertexFormat !== VertexFormat.P3 ||
        command.vertexCount !== 3 || (command.firstVertex ?? 0) !== 0 || command.indexBuffer || (command.instanceCount ?? 1) !== 1 ||
        (command.instanceAttributes?.length ?? 0) !== 0 || (command.vertexBuffers?.length ?? 0) > 0 || (command.nativeStorageBindings?.length ?? 0) !== 0 ||
        vertex.byteLength < 36 || !vertex.shadowValid || this.nativeExposedBuffers.has(vertex) || !texture || texture.disposed || texture.colorSpace !== "linear" ||
        getRenderTargetTextureOwner(texture) !== this) {
      throw new RenderDeviceError("Display-P3 canvas requires the verified opaque full-screen output pass", "WEBGPU_P3_DIRECT_UNSUPPORTED");
    }
    const boundTextures = shader.portableBindings.filter(binding => isPortableTexture(binding.kind)).map(descriptor => {
      const binding = command.uniforms?.get(descriptor.name);
      const boundTexture = isTextureBinding(binding) ? binding.texture : null;
      const owner = boundTexture && [...this.renderTargets].find(candidate => !candidate.disposed && candidate.nativeColorFor(boundTexture) !== undefined);
      const native = boundTexture && owner?.nativeColorFor(boundTexture);
      if (descriptor.kind !== "texture2d" || !isTextureBinding(binding) || !boundTexture || boundTexture.disposed ||
          getRenderTargetTextureOwner(boundTexture) !== this || !owner || !native) {
        throw new RenderDeviceError("Display-P3 output requires live device-owned color textures", "WEBGPU_P3_SOURCE_UNSUPPORTED");
      }
      return { name: descriptor.name, binding, texture: boundTexture, owner, native };
    });
    const expected = [-1, -1, 0, 3, -1, 0, -1, 3, 0];
    const data = new DataView(vertex.bytes.buffer, vertex.bytes.byteOffset, vertex.bytes.byteLength);
    if (expected.some((value, index) => data.getFloat32(index * 4, true) !== value)) {
      throw new RenderDeviceError("Display-P3 output geometry is not a full-screen triangle", "WEBGPU_P3_DIRECT_UNSUPPORTED");
    }
    const frameToken = this.frameToken, stateKey = JSON.stringify(state), formatKey = JSON.stringify(command.vertexFormat);
    const check = (): void => {
      this.assertP3CanvasTexture(surface);
      if (!this.frameActive || this.frameToken !== frameToken || this.activeRenderTarget !== null || shader.disposed ||
          shader.nativeUniformLayout !== "portable" || shader.modules.length !== identity.modules.length ||
          shader.modules.some((module, index) => module !== identity.modules[index]) ||
          shader.entryPoints.length !== identity.entryPoints.length || shader.entryPoints.some((entry, index) => entry !== identity.entryPoints[index]) ||
          JSON.stringify(shader.portableBindings) !== identity.bindings || JSON.stringify(command.renderState) !== stateKey ||
          command.shader !== shader || command.topology !== "triangles" || command.vertexCount !== 3 || (command.firstVertex ?? 0) !== 0 ||
          command.indexBuffer || (command.instanceCount ?? 1) !== 1 || (command.instanceAttributes?.length ?? 0) !== 0 ||
          (command.vertexBuffers?.length ?? 0) > 0 || (command.nativeStorageBindings?.length ?? 0) !== 0 ||
          command.vertexFormat !== VertexFormat.P3 || JSON.stringify(command.vertexFormat) !== formatKey || this.requireBuffer(command.vertexBuffer) !== vertex ||
          !vertex.shadowValid || this.nativeExposedBuffers.has(vertex) || expected.some((value, index) => data.getFloat32(index * 4, true) !== value) ||
          command.uniforms?.get("u_scene") !== scene || !isTextureBinding(scene) || scene.texture !== texture || texture.disposed || texture.colorSpace !== "linear") {
        throw new RenderDeviceError("Display-P3 output changed before submission", "WEBGPU_PRESENTATION_STALE");
      }
      for (const bound of boundTextures) {
        if (command.uniforms?.get(bound.name) !== bound.binding || bound.binding.texture !== bound.texture || bound.texture.disposed ||
            bound.owner.disposed || !this.renderTargets.has(bound.owner) || bound.owner.nativeColorFor(bound.texture) !== bound.native) {
          throw new RenderDeviceError("Display-P3 input texture changed before submission", "WEBGPU_PRESENTATION_STALE");
        }
        this.resourceInterop.assertUsable(bound.native);
      }
      const viewport = this.viewStateTarget === null ? this.viewportOverride ?? this.persistentViewportRect : this.persistentViewportRect;
      const scissor = this.viewStateTarget === null && this.scissorTestOn ? this.scissorOverride : null;
      const full = (rect: typeof viewport): boolean => !rect || (rect.x === 0 && rect.y === 0 && rect.width === this.viewportWidth && rect.height === this.viewportHeight);
      if (!full(viewport) || !full(scissor)) throw new RenderDeviceError("Display-P3 output requires a full canvas viewport", "WEBGPU_P3_DIRECT_UNSUPPORTED");
    };
    check();
    return check;
  }

  getPresentationAlphaMode(): "opaque" | "premultiplied" | undefined {
    if (!this.canvasContext || canvasOwners.get(this.canvasContext) !== this.canvasOwner) return undefined;
    const configuration = this.canvasContext.getConfiguration?.();
    return configuration ? configuration.alphaMode ?? "opaque" : this.options.presentationAlphaMode === "premultiplied" ? "premultiplied" : "opaque";
  }

  get outputColorSpace(): "srgb" | "display-p3" {
    if (this.canvasContext) this.assertActiveCanvasColor();
    return this.activeColorSpace;
  }

  getDepthConvention(): DepthConvention { return this.depthConvention; }

  /**
   * WebGPU rasterizes zero-to-one. Standard and logarithmic frames hand their
   * WGSL programs the renderer's minus-one-to-one projection, which the
   * vertex stage remaps with (z + w) / 2. A reversed frame instead receives a
   * native zero-to-one projection (`projectionClipRange: "zero-to-one"`), and
   * every scene program that declares the `a3dZeroToOneProjection` override
   * is specialized to pass clip z through unchanged, so the floating-point
   * reversed-Z gain survives. depth32float is core; depth32float-stencil8 is
   * requested when the adapter offers it (or pass it in `requiredFeatures`).
   */
  getDepthPrecisionSupport(): DepthPrecisionSupport {
    return { standardClipRange: "zero-to-one", zeroToOneReversed: true, floatDepth: true,
      floatDepthStencil: this.device.features?.has("depth32float-stencil8") === true };
  }

  /**
   * A float request selects depth32float (no stencil need), else
   * depth32float-stencil8 when the feature is enabled, else falls back to
   * depth24plus-stencil8 (fixed storage, reported "reduced").
   */
  private selectDepthFormat(descriptor: RenderTargetDescriptor): { readonly format: string; readonly storage: DepthStorage } {
    if (descriptor.depthPrecision !== "float") return { format: DEPTH_TEXTURE_FORMAT, storage: "fixed" };
    if (descriptor.stencil === false) return { format: "depth32float", storage: "float" };
    if (this.device.features?.has("depth32float-stencil8") === true) return { format: "depth32float-stencil8", storage: "float" };
    return { format: DEPTH_TEXTURE_FORMAT, storage: "fixed" };
  }

  /**
   * Pipeline-key suffix for a scene program specialized to a native
   * zero-to-one projection: the active frame is reversed with
   * `projectionClipRange: "zero-to-one"` and the vertex stage declares the
   * `a3dZeroToOneProjection` override.
   */
  private zeroToOneProjectionKey(shader: WebGPUShaderProgram): "" | ":z01" {
    return shader.projectionOverride && this.#depthConvention.mode === "reversed" && this.#depthConvention.projectionClipRange === "zero-to-one" ? ":z01" : "";
  }

  /** Depth/stencil format of the attachment the next draw writes (canvas depth is fixed). */
  private activeDepthStencilFormat(): string {
    return (this.gaussianSplatBorrowedDepth ?? this.activeRenderTarget)?.nativeDepthFormat ?? DEPTH_TEXTURE_FORMAT;
  }

  setDepthConvention(convention: DepthConvention): void {
    this.assertAlive();
    // Scene WGSL programs remap a minus-one-to-one camera projection into
    // WebGPU's zero-to-one clip space, which preserves the reversed ordering
    // (near = 1, far = 0). A reversed frame negotiated with a zero-to-one
    // projection specializes them to skip that remap. In a logarithmic frame
    // they write ln(d / near) / ln(far / near) as @builtin(frag_depth).
    const reversed = convention.mode === "reversed";
    if ((convention.mode !== "standard" && !reversed && convention.mode !== "logarithmic") || convention.clipRange !== "zero-to-one"
      || (convention.projectionClipRange !== undefined && convention.projectionClipRange !== "minus-one-to-one" && !(reversed && convention.projectionClipRange === "zero-to-one"))
      || convention.clearValue !== (reversed ? 0 : 1) || convention.compare !== (reversed ? "greater-equal" : "less-equal") || convention.biasSign !== (reversed ? -1 : 1)) {
      throw new RenderDeviceError("Depth convention is unsupported by the active WebGPU pipeline", "DEPTH_MODE_UNSUPPORTED", { mode: convention.mode });
    }
    this.#depthConvention = Object.freeze({ ...convention });
  }

  private constructor(
    private readonly adapter: WebGPUAdapterLike,
    private readonly device: WebGPUDeviceLike,
    private readonly canvasContext: WebGPUCanvasContextLike | null,
    private readonly presentationFormat: string,
    private readonly options: WebGPUDeviceOptions,
    private readonly gpu: WebGPULike | undefined,
    private readonly canvasOwner: WebGPUCanvasOwner,
    private readonly managedCanvasLease?: ManagedWebGPUCanvasLease
  ) {
    this.resourceInterop = new WebGPUResourceInterop(device.queue, this.generation);
    // A compare/clear change alone is not reversed-depth support: the shadow,
    // shader and post paths must all use the same encoding first.
    this.#depthConvention = negotiateDepthConvention({ mode: options.depthMode, allowFallback: options.allowDepthFallback }, { clipRange: "zero-to-one", reversed: true, logarithmic: false });
    const supportsNativeRenderPipeline = hasNativeRenderPipeline(device);
    const supportsNativeTextureReadback = hasNativeTextureReadback(device);
    const supportsCanvasSurface = supportsNativeRenderPipeline && canvasContext !== null;
    this.info = {
      backend: "webgpu",
      vendor: adapter.info?.vendor ?? "webgpu",
      renderer: describeAdapter(adapter) ?? "webgpu-render-device",
      capabilities: [
        "buffers",
        "buffer-readback",
        "shader-validation",
        "render-targets",
        "pixel-readback",
        "postprocess-presentation",
        "hdr-render-targets",
        "float-readback",
        "draw-validation",
        "rasterization",
        "depth-render-targets",
        "spot-shadow-maps",
        "point-shadow-maps",
        "hdr-image-based-lighting",
        // Single-sample depth attachments carry TEXTURE_BINDING and are read
        // through depth-only views by the native SSAO/GTAO, depth-of-field
        // and deferred passes. Multisampled targets still reject `depth: "texture"`.
        ...(supportsNativeRenderPipeline ? ["depth-textures" as const] : []),
        ...(supportsNativeRenderPipeline ? ["native-render-pipeline" as const] : []),
        ...(hasNativeSampledTextureBinding(device) ? ["native-sampled-textures" as const] : []),
        ...(supportsNativeTextureReadback ? ["native-texture-readback" as const] : []),
        ...(supportsCanvasSurface ? ["canvas-surface" as const] : [])
      ],
      limitations: [
        "Synchronous readPixels/readFloatPixels throw WEBGPU_SYNC_READBACK_UNSUPPORTED; use readPixelsAsync/readFloatPixelsAsync for native texture-to-buffer readback.",
        "Sampleable WebGPU depth render-target textures are single-sample only and have no CPU depth readback.",
        "Display-P3 requires a confirmed opaque unorm canvas and a supported output pass or HDR tone route; offscreen P3, direct scene output, preserved alpha and additional post combinations are unavailable.",
        ...(supportsNativeRenderPipeline ? [] : ["native WebGPU render-pipeline submission requires createRenderPipeline, createTexture, and createCommandEncoder."]),
        ...(hasNativeSampledTextureBinding(device) ? [] : ["native WebGPU sampled texture binding requires createSampler, createTexture, and queue.writeTexture."]),
        ...(supportsNativeTextureReadback ? [] : ["native WebGPU texture readback requires copyTextureToBuffer plus mappable readback buffers."]),
        ...(canvasContext ? [] : ["Canvas presentation requires a canvas that exposes a webgpu context."])
      ]
    };
    this.observeDeviceLost();
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }
    if (initialData && initialData.byteLength > byteLength) {
      throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", {
        byteLength,
        dataByteLength: initialData.byteLength
      });
    }

    const handle = this.device.createBuffer({
      label: `aura3d-${usage}-${this.nextId}`,
      size: alignTo(byteLength, 4),
      usage: bufferUsageFlags(usage)
    });
    let registered = false;
    try {
      let disposalAccounted = false;
      const buffer = new WebGPURenderBuffer(this.nextId++, usage, byteLength, alignTo(byteLength, 4), handle, (resource) => this.retireNative(resource), (retired) => {
        this.retireVertexConversions(retired);
        this.invalidateNativeForwardBundlesForBuffer(retired);
        if (this.buffers.delete(retired) && !disposalAccounted) { disposalAccounted = true; this.disposedBufferCount += 1; }
      }, initialData, retired => this.assertVertexConversionUnpinned(retired), (retired, error) => {
        this.buffers.add(retired);
        this.rejectLateDisposalFailure(error);
      },
      (retired, active) => { if (active) this.activeBufferDisposals.add(retired); else this.activeBufferDisposals.delete(retired); },
      resource => this.nativeRetirementPending(resource), resource => this.retryFailedNativeRetirement(resource),
      resource => this.activeNativeCleanups.has(resource));
      this.registerNativeCleanup(handle, []);
      registered = true;
      if (initialData) writeAlignedQueueBuffer(this.device.queue, handle, 0, buffer.bytes.slice(0, initialData.byteLength), buffer.nativeByteLength);
      this.ownedBuffers.add(buffer);
      this.buffers.add(buffer);
      nativeRetirementReceipts.set(buffer, resource => this.nativeRetirementReceipt(resource));
      if (usage === "uniform" && byteLength >= 304) {
        const epoch = {};
        this.#pointFrameWriteEpochs.set(buffer, epoch);
        this.#pointFrameWrites.set(buffer, { bytes: buffer.bytes.slice(0, 304), epoch });
      }
      return buffer;
    } catch (error) {
      try {
        if (registered) this.retireNative(handle);
        else this.retireUnregisteredNative(handle);
      } catch { /* Keep the allocation or upload error as the reported failure. */ }
      throw error;
    }
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.assertAlive();
    const webgpuBuffer = this.requireBuffer(buffer);
    this.assertVertexConversionUnpinned(webgpuBuffer);
    if (this.vertexWritesActive.has(webgpuBuffer)) throw new RenderDeviceError("A buffer write is already in progress", "WEBGPU_BUFFER_WRITE_ACTIVE", { bufferId: buffer.id });
    if (this.#pointPinnedHandles.has(nativeBufferHandle(webgpuBuffer))) throw new RenderDeviceError("Point submission resources cannot be written while pinned", "WEBGPU_POINT_SUBMISSION_ACTIVE");
    if (this.#mrtPinnedHandles.has(nativeBufferHandle(webgpuBuffer))) throw new RenderDeviceError("Submission resources cannot be written while pinned", "WEBGPU_MRT_SUBMISSION_ACTIVE");
    if (this.nativeForwardBundlePins.has(nativeBufferHandle(webgpuBuffer))) throw new RenderDeviceError("Bundle resources cannot be written while pinned", "WEBGPU_BUNDLE_SUBMISSION_ACTIVE");
    this.#morphBufferEpochs.set(webgpuBuffer, {});
    const frameBefore = this.#pointFrameWrites.get(webgpuBuffer);
    const frameEpoch = {};
    if (webgpuBuffer.usage === "uniform" && webgpuBuffer.byteLength >= 304) {
      this.#pointFrameWriteEpochs.set(webgpuBuffer, frameEpoch);
      this.#pointFrameWrites.delete(webgpuBuffer);
    }
    if (this.#pointBufferEpochs.has(webgpuBuffer)) this.#pointBufferEpochs.set(webgpuBuffer, {});
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset + data.byteLength > webgpuBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: webgpuBuffer.byteLength
      });
    }
    // WebGPU writes are 4-byte aligned; include the unchanged neighboring
    // bytes from the CPU shadow rather than zeroing them in a padded write.
    const start = Math.floor(byteOffset / 4) * 4;
    const end = Math.min(alignTo(byteOffset + data.byteLength, 4), webgpuBuffer.byteLength);
    const fullReplacement = byteOffset === 0 && data.byteLength === webgpuBuffer.byteLength;
    if (!fullReplacement && !webgpuBuffer.shadowValid && (start !== byteOffset || end !== byteOffset + data.byteLength)) {
      throw new RenderDeviceError("Unaligned updates require a current CPU shadow after native buffer borrowing", "WEBGPU_BUFFER_SHADOW_STALE", { bufferId: buffer.id });
    }
    // A recorded draw may retain vertex/index handles, but never a stale
    // contents revision. Frame uniforms use private immutable snapshots.
    if (webgpuBuffer.usage === "vertex" || webgpuBuffer.usage === "index") {
      this.invalidateNativeForwardBundlesForBuffer(webgpuBuffer);
    }
    this.retireVertexConversions(webgpuBuffer);
    this.vertexWritesActive.add(webgpuBuffer);
    let written: Uint8Array;
    try {
      webgpuBuffer.bytes.set(viewBytes(data), byteOffset);
      written = webgpuBuffer.bytes.slice(start, end);
      writeAlignedQueueBuffer(this.device.queue, nativeBufferHandle(webgpuBuffer), start, written, webgpuBuffer.nativeByteLength);
      if (fullReplacement) webgpuBuffer.shadowValid = true;
    } catch (error) {
      // A failed queue write may have accepted some bytes; neither copy is authoritative.
      webgpuBuffer.shadowValid = false;
      throw error;
    } finally {
      this.vertexWritesActive.delete(webgpuBuffer);
    }
    if (webgpuBuffer.usage === "uniform" && webgpuBuffer.byteLength >= 304 && this.#pointFrameWriteEpochs.get(webgpuBuffer) === frameEpoch
      && (frameBefore || (start === 0 && end >= 304)) && !this.nativeExposedBuffers.has(webgpuBuffer)) {
      const bytes = frameBefore ? frameBefore.bytes.slice() : new Uint8Array(304);
      if (start < 304) bytes.set(written.subarray(0, Math.min(written.length, 304 - start)), start);
      this.#pointFrameWrites.set(webgpuBuffer, { bytes, epoch: frameEpoch });
    }
  }

  bindUniformBuffer(buffer: RenderBuffer, binding: number): void {
    this.assertAlive();
    const owned = this.requireBuffer(buffer);
    if (owned.usage !== "uniform") throw new RenderDeviceError("Buffer was not created with usage 'uniform'", "INVALID_BUFFER_USAGE", { bufferId: buffer.id });
    if (!Number.isSafeInteger(binding) || binding < 0) throw new RenderDeviceError("Uniform binding must be a non-negative integer", "INVALID_UNIFORM_BINDING", { binding });
    this.uniformBufferBindings.set(binding, owned);
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    const webgpuBuffer = this.requireBuffer(buffer);
    if (!webgpuBuffer.shadowValid) throw new RenderDeviceError("Native buffer writes can make the CPU shadow stale; use asynchronous GPU readback", "WEBGPU_BUFFER_SHADOW_STALE", { bufferId: buffer.id });
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > webgpuBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: webgpuBuffer.byteLength
      });
    }
    return webgpuBuffer.bytes.slice(byteOffset, byteOffset + byteLength);
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.assertAlive();
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
    const nativeSources = createNativeShaderSources(sources);
    const pointFeatures = nativeSources.generatedUnlit?.primitive === "points" && sources.generatedProgram
      ? { alphaMode: sources.generatedProgram.features.alphaMode, vertexColors: sources.generatedProgram.features.vertexColors } : undefined;
    if (nativeSources.uniformLayout === "portable") this.validatePortableResourceLimits(nativeSources.portableBindings ?? []);
    const modules = this.device.createShaderModule
      ? [
          this.device.createShaderModule({ label: `${sources.label}-vertex`, code: nativeSources.vertex }),
          this.device.createShaderModule({ label: `${sources.label}-fragment`, code: nativeSources.fragment })
        ]
      : [];
    const shader = new WebGPUShaderProgram(
      this.nextId++,
      sources.label,
      sources.marker,
      reflectShaderSources(sources),
      modules,
      nativeSources.entryPoints,
      nativeSources.uniformLayout,
      nativeSources.portableBindings ?? [],
      sources.webgpu?.storageBindings?.map(binding => ({ ...binding })),
      nativeSources.colorDefaultVertex,
      nativeSources.atlasVertex,
      nativeSources.generatedPbr,
      nativeSources.generatedUnlit
    );
    shader.projectionOverride = declaresZeroToOneProjectionOverride(nativeSources.vertex);
    this.shaders.add(shader);
    this.#mrtShaders.set(shader, { pbr: nativeSources.generatedPbr, unlit: nativeSources.generatedUnlit,
      modules: [...modules], entryPoints: [...nativeSources.entryPoints], layout: nativeSources.uniformLayout,
      coverage: nativeSources.generatedPbr?.writesDepthCoverage === true || nativeSources.generatedUnlit?.writesDepthCoverage === true,
      unlitFingerprint: nativeSources.generatedUnlit ? JSON.stringify(nativeSources.generatedUnlit) : undefined });
    if (isNativeP3OutputSources(sources)) this.#p3OutputShaders.set(shader, {
      modules: [...modules], entryPoints: [...nativeSources.entryPoints], bindings: JSON.stringify(nativeSources.portableBindings)
    });
    if (nativeSources.generatedUnlit?.primitive === "points" && pointFeatures) {
      this.#pointShaders.set(shader, { program: nativeSources.generatedUnlit, fingerprint: JSON.stringify(nativeSources.generatedUnlit),
        modules: [...modules], ...pointFeatures });
    }
    return shader;
  }

  private validatePortableResourceLimits(bindings: readonly PortableShaderBinding[]): void {
    const byteLength = deriveUniformDataLayout(portableUniformBlock(bindings), "wgsl-uniform").size;
    for (const name of ["maxBufferSize", "maxUniformBufferBindingSize"] as const) {
      const limit = this.device.limits?.[name] ?? (name === "maxUniformBufferBindingSize" ? 65536 : undefined);
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < byteLength)) {
        throw new RenderDeviceError("Portable uniforms exceed the WebGPU device limit", "WEBGPU_PORTABLE_UNIFORM_LIMIT", { name, limit, byteLength });
      }
    }
    const textures = bindings.filter((binding) => isPortableTexture(binding.kind));
    const sampledTextures = textures.length;
    const samplers = textures.filter((binding) => binding.kind !== "depth2d" && binding.kind !== "depth2d-multisampled").length;
    // Portable texture bindings currently have visibility in both shader stages.
    // WebGPU guarantees at least 16 of each resource when limits are omitted by
    // a device-shaped test double.
    const textureLimit = this.device.limits?.maxSampledTexturesPerShaderStage ?? 16;
    const samplerLimit = this.device.limits?.maxSamplersPerShaderStage ?? 16;
    if (sampledTextures > textureLimit || samplers > samplerLimit) {
      throw new RenderDeviceError("Portable shader exceeds WebGPU sampled-texture or sampler limits", "WEBGPU_PORTABLE_RESOURCE_LIMIT", {
        sampledTextures, samplers, textureLimit, samplerLimit
      });
    }
  }

  async getShaderCompilationDiagnostics(sources: ShaderSources): Promise<readonly ShaderCompilationDiagnostic[]> {
    this.assertAlive();
    if (!this.device.createShaderModule) return [];
    const native = createNativeShaderSources(sources);
    if (native.uniformLayout === "portable") this.validatePortableResourceLimits(native.portableBindings ?? []);
    const stages = [
      { stage: "vertex" as const, code: native.vertex },
      { stage: "fragment" as const, code: native.fragment }
    ];
    const diagnostics: ShaderCompilationDiagnostic[] = [];
    for (const candidate of stages) {
      const module = this.device.createShaderModule({ label: `${sources.label}-${candidate.stage}-diagnostics`, code: candidate.code });
      const info = await module.getCompilationInfo?.();
      for (const message of info?.messages ?? []) {
        diagnostics.push({
          stage: candidate.stage,
          severity: message.type,
          message: message.message,
          ...(message.lineNum === undefined ? {} : { line: message.lineNum }),
          ...(message.linePos === undefined ? {} : { column: message.linePos })
        });
      }
    }
    return diagnostics;
  }

  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    this.assertAlive();
    if (descriptor.colorAttachments !== undefined && !Array.isArray(descriptor.colorAttachments)) {
      throw new RenderDeviceError("Color attachments must be an array", "INVALID_RENDER_TARGET_FORMAT");
    }
    if ((descriptor.colorAttachments?.length ?? 0) > 1) return this.createMultipleColorRenderTarget(descriptor);
    if (descriptor.colorAttachments?.length === 1) {
      const format = descriptor.colorAttachments[0]?.format;
      if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") {
        throw new RenderDeviceError("Unsupported render target color format", "INVALID_RENDER_TARGET_FORMAT");
      }
      descriptor = { ...descriptor, format, colorAttachments: undefined };
    }
    if (descriptor.depthCompare !== true && (descriptor.dimension === "cube" || descriptor.dimension === "2d-array" || descriptor.dimension === "3d" || descriptor.depthOnly === true)) {
      return this.createLayeredRenderTarget(descriptor);
    }
    if ((descriptor.dimension !== undefined && descriptor.dimension !== "2d") || descriptor.layers !== undefined || descriptor.depthCompare === true) {
      // Comparison targets need a native comparison-sampler binding path.
      throw new RenderDeviceError("WebGPU depth-compare render targets are not yet implemented", "UNSUPPORTED_RENDER_TARGET_FEATURE", {
        label: descriptor.label, dimension: descriptor.dimension ?? "2d"
      });
    }
    if (
      !Number.isInteger(descriptor.width) ||
      descriptor.width <= 0 ||
      !Number.isInteger(descriptor.height) ||
      descriptor.height <= 0
    ) {
      throw new RenderDeviceError("Render target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    const requestedMipCount = descriptor.mipLevelCount ?? 1;
    const maxMipCount = Math.floor(Math.log2(Math.max(descriptor.width, descriptor.height))) + 1;
    if (!Number.isSafeInteger(requestedMipCount) || requestedMipCount < 1 || requestedMipCount > maxMipCount) {
      throw new RenderDeviceError("Invalid WebGPU render-target mip count", "INVALID_RENDER_TARGET_MIP_COUNT");
    }
    const sampleCount = descriptor.sampleCount ?? 1;
    if (sampleCount !== 1 && sampleCount !== 4) {
      throw new RenderDeviceError("WebGPU render-target sampleCount must be 1 or 4.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount,
        label: descriptor.label
      });
    }
    if (sampleCount !== 1 && requestedMipCount > 1) throw new RenderDeviceError("Mipmapped WebGPU render targets must be single-sampled", "INVALID_RENDER_TARGET_MIP_COUNT");
    if (sampleCount > 1 && descriptor.format === "rgba32f") {
      throw new RenderDeviceError("WebGPU rgba32float render targets cannot be multisampled", "WEBGPU_MULTISAMPLE_FORMAT_UNSUPPORTED");
    }
    if (sampleCount > 1 && descriptor.depth === "texture") {
      throw new RenderDeviceError("WebGPU multisampled targets cannot resolve depth into a sampleable texture.", "MULTISAMPLE_DEPTH_RESOLVE_UNSUPPORTED", {
        sampleCount,
        label: descriptor.label
      });
    }
    const textureFormat = webgpuTextureFormat(descriptor.format ?? "rgba8");
    const hasDepth = descriptor.depth !== false;
    const hasSampleableDepth = descriptor.depth === "texture";
    const depthSelection = this.selectDepthFormat(descriptor);
    let colorBytes = 0;
    for (let level = 0; level < requestedMipCount; level += 1) colorBytes += Math.max(1, Math.floor(descriptor.width / 2 ** level))
      * Math.max(1, Math.floor(descriptor.height / 2 ** level)) * bytesPerPixel(descriptor.format ?? "rgba8");
    // Account for the sampled resolve and the distinct multisampled color
    // attachment separately. Depth storage is implementation-defined and is
    // modeled as four bytes per sample.
    const multisampleColorBytes = sampleCount > 1 ? descriptor.width * descriptor.height * bytesPerPixel(descriptor.format ?? "rgba8") * sampleCount : 0;
    const depthBytes = hasDepth ? descriptor.width * descriptor.height * 4 * sampleCount : 0;
    if (![colorBytes, multisampleColorBytes, depthBytes].every(Number.isSafeInteger)) throw new TextureBudgetExceededError("Render target exceeds safe texture byte accounting.");
    const policy = this.options.textureBudgetPolicy;
    const limit = policy?.maxBytes ?? policy?.textureBudgetBytes;
    const releaseColor = this.device.createTexture ? reserveTextureBudget(colorBytes, limit, this) : () => {};
    let releaseMultisample: () => void = () => {};
    let releaseDepth: () => void = () => {};
    try {
      if (this.device.createTexture && sampleCount > 1) releaseMultisample = reserveTextureBudget(multisampleColorBytes, limit, this);
      if (this.device.createTexture && hasDepth) releaseDepth = reserveTextureBudget(depthBytes, limit, this);
    } catch (error) { releaseMultisample(); releaseColor(); throw error; }
    let nativeTexture: WebGPUTextureLike | null = null;
    let nativeMultisampleTexture: WebGPUTextureLike | null = null;
    let nativeDepthTexture: WebGPUTextureLike | null = null;
    let colorRegistered = false, multisampleRegistered = false, depthRegistered = false;
    try {
    nativeTexture = this.device.createTexture?.({
      label: descriptor.label ?? "aura3d-webgpu-render-target",
      size: [descriptor.width, descriptor.height],
      format: textureFormat,
      usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.TEXTURE_BINDING,
      ...(requestedMipCount > 1 ? { mipLevelCount: requestedMipCount } : {})
    }) ?? null;
    nativeMultisampleTexture = sampleCount > 1
      ? this.device.createTexture?.({
        label: `${descriptor.label ?? "aura3d-webgpu-render-target"}-multisample`,
        size: [descriptor.width, descriptor.height],
        format: textureFormat,
        usage: TEXTURE_USAGE.RENDER_ATTACHMENT,
        sampleCount
      }) ?? null
      : null;
    nativeDepthTexture = hasDepth
      ? this.device.createTexture?.({
        label: `${descriptor.label ?? "aura3d-webgpu-render-target"}-depth`,
        size: [descriptor.width, descriptor.height],
        format: depthSelection.format,
        // Internal deferred work may sample this same depth attachment; a
        // 4x attachment still does not expose a resolved public depth texture.
        usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.TEXTURE_BINDING,
        sampleCount
      }) ?? null
      : null;
    if (nativeTexture) {
      const held = nativeTexture;
      this.registerNativeCleanup(held, [{ run: releaseColor }]);
      colorRegistered = true;
    } else releaseColor();
    if (nativeDepthTexture) {
      const held = nativeDepthTexture;
      this.registerNativeCleanup(held, [{ run: releaseDepth }]);
      depthRegistered = true;
    } else releaseDepth();
    if (nativeMultisampleTexture) {
      const held = nativeMultisampleTexture;
      this.registerNativeCleanup(held, [{ run: releaseMultisample }]);
      multisampleRegistered = true;
    } else releaseMultisample();
    const depthTexture = hasSampleableDepth
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", renderAttachment: true, label: `${descriptor.label ?? "render-target"}-depth` })
      : undefined;
    // This alias names the actual 4x attachment, never a resolved depth
    // texture. Only the dedicated multisampled portable binding accepts it.
    const multisampledDepthTexture = nativeDepthTexture && hasDepth && sampleCount === 4
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", renderAttachment: true, label: `${descriptor.label ?? "render-target"}-multisampled-depth` })
      : undefined;
    const nativeView = nativeTexture?.createView(requestedMipCount > 1 ? { baseMipLevel: 0, mipLevelCount: 1 } : undefined) ?? null;
    let disposalAccounted = false;
    const target = new WebGPURenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, format: descriptor.format ?? "rgba8", mipLevelCount: requestedMipCount, renderAttachment: true, label: descriptor.label ?? "render-target-color" }),
      depthTexture,
      multisampledDepthTexture,
      nativeTexture,
      nativeView,
      requestedMipCount > 1 ? nativeTexture?.createView() ?? null : nativeView,
      nativeDepthTexture,
      nativeDepthTexture?.createView() ?? null,
      hasDepth,
      sampleCount,
      nativeMultisampleTexture,
      nativeMultisampleTexture?.createView() ?? null,
      (texture) => this.retireNative(texture),
      (disposedTarget) => {
        this.renderTargets.delete(disposedTarget);
        this.pendingRenderTargetDisposals.delete(disposedTarget);
        if (!disposalAccounted) {
          disposalAccounted = true;
          this.disposedRenderTargets += 1;
          this.disposedRenderTargetTextures += 1 + disposedTarget.nativeExtraColors.length + (disposedTarget.depthTexture || disposedTarget.multisampledDepthTexture ? 1 : 0);
        }
      },
      (failedTarget, error) => {
        this.renderTargets.add(failedTarget);
        if (this.disposed || this.deviceDisposing) {
          this.pendingRenderTargetDisposals.add(failedTarget);
        }
        this.rejectLateDisposalFailure(error);
      },
      (attemptedTarget) => { this.deviceTargetDisposalAttempts?.add(attemptedTarget); },
      (target, active) => { if (active) this.activeTargetDisposals.add(target); else this.activeTargetDisposals.delete(target); },
      resource => this.nativeRetirementPending(resource),
      resource => this.retryFailedNativeRetirement(resource),
      resource => this.activeNativeCleanups.has(resource)
    );
    target.nativeDepthFormat = depthSelection.format;
    if (hasDepth && depthSelection.storage === "float") target.depthStorage = "float";
    this.#p3ResolvedColors.set(target, {
      color: target.colorTexture, texture: target.nativeTexture, view: target.nativeView,
      multisampleTexture: target.nativeMultisampleTexture, multisampleView: target.nativeMultisampleView,
      sampleCount, width: descriptor.width, height: descriptor.height
    });
    claimRenderTargetTextureOwner(target.colorTexture, this);
    if (target.depthTexture) claimRenderTargetTextureOwner(target.depthTexture, this);
    if (target.multisampledDepthTexture) claimRenderTargetTextureOwner(target.multisampledDepthTexture, this);
    this.renderTargets.add(target);
    nativeRetirementReceipts.set(target, resource => this.nativeRetirementReceipt(resource));
    return target;
    } catch (error) {
      for (const { texture, registered, release } of [
        { texture: nativeTexture, registered: colorRegistered, release: releaseColor },
        { texture: nativeMultisampleTexture, registered: multisampleRegistered, release: releaseMultisample },
        { texture: nativeDepthTexture, registered: depthRegistered, release: releaseDepth }
      ]) {
        if (!texture) { release(); continue; }
        if (!registered) this.retireUnregisteredNative(texture, release, true);
        else {
          try { if (this.resourceInterop.owns(texture)) this.retireNative(texture); }
          catch (cleanupError) {
            this.nativeRetirementFailures.set(texture, { error: cleanupError });
            this.noteNativeRetirementFailure(cleanupError);
          }
        }
      }
      throw error;
    }
  }

  /** 2D MRT targets share dimensions, sample count, depth and one frame lifetime. */
  /**
   * Cube / 2d-array target: one native array texture (and depth array when
   * depth is requested), sampled through a cube or 2d-array view. Each
   * `layerTargets[i]` renders through a single-layer 2D view of the same
   * texture; the parent renders layer zero, as on WebGL2. Children borrow the
   * parent's leases: only the parent retires native textures, behind the
   * retirement fence. Single-sample, single-mip, single color attachment.
   * A 3d target is one color volume: every child shares the full 3d view and
   * selects its slice through the pass attachment's `depthSlice`. A depth-only
   * target (any dimension) has no color texture and renders depth alone.
   */
  private createLayeredRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    validateRenderTargetDescriptor(descriptor);
    const dimension = (descriptor.dimension ?? "2d") as "2d" | "cube" | "2d-array" | "3d";
    const depthOnly = descriptor.depthOnly === true, volume = dimension === "3d";
    if ((descriptor.sampleCount ?? 1) !== 1 || (descriptor.mipLevelCount ?? 1) !== 1) {
      throw new RenderDeviceError("WebGPU layered render targets must be single-sample with one mip", "UNSUPPORTED_RENDER_TARGET_FEATURE", { label: descriptor.label, dimension });
    }
    if (!this.device.createTexture) throw new RenderDeviceError("WebGPU layered render targets require native textures", "UNSUPPORTED_RENDER_TARGET_FEATURE", { label: descriptor.label });
    const layerCount = dimension === "cube" ? 6 : descriptor.layers ?? 1;
    const label = descriptor.label ?? "render-target";
    const format = descriptor.format ?? "rgba8";
    const hasDepth = descriptor.depth !== false;
    const depthSelection = this.selectDepthFormat(descriptor);
    const colorBytes = depthOnly ? 0 : descriptor.width * descriptor.height * bytesPerPixel(format) * layerCount;
    const depthBytes = hasDepth ? descriptor.width * descriptor.height * 4 * layerCount : 0;
    if (![colorBytes, depthBytes].every(Number.isSafeInteger)) throw new TextureBudgetExceededError("Render target exceeds safe texture byte accounting.");
    const policy = this.options.textureBudgetPolicy;
    const limit = policy?.maxBytes ?? policy?.textureBudgetBytes;
    const releaseColor = reserveTextureBudget(colorBytes, limit, this);
    let releaseDepth: () => void = () => {};
    try { if (hasDepth) releaseDepth = reserveTextureBudget(depthBytes, limit, this); } catch (error) { releaseColor(); throw error; }
    let nativeTexture: WebGPUTextureLike | null = null, nativeDepthTexture: WebGPUTextureLike | null = null;
    let colorRegistered = false, depthRegistered = false;
    try {
      if (depthOnly) { releaseColor(); colorRegistered = true; } else {
        nativeTexture = this.device.createTexture({
          label, size: [descriptor.width, descriptor.height, layerCount], format: webgpuTextureFormat(format),
          ...(volume ? { dimension: "3d" as const } : {}),
          usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.TEXTURE_BINDING
        });
        this.registerNativeCleanup(nativeTexture, [{ run: releaseColor }]);
        colorRegistered = true;
      }
      if (hasDepth) {
        nativeDepthTexture = this.device.createTexture({
          label: `${label}-depth`, size: [descriptor.width, descriptor.height, layerCount], format: depthSelection.format,
          usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.TEXTURE_BINDING
        });
        this.registerNativeCleanup(nativeDepthTexture, [{ run: releaseDepth }]);
        depthRegistered = true;
      } else releaseDepth();
      const color = nativeTexture, depth = nativeDepthTexture;
      const layerView = (texture: WebGPUTextureLike, layer: number): unknown =>
        texture.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 });
      // A 3d attachment view must be the whole one-mip volume; the pass picks the slice.
      const volumeView = volume && color ? color.createView({ dimension: "3d", baseMipLevel: 0, mipLevelCount: 1 }) : null;
      const colorView = (layer: number): unknown => !color ? null : volumeView ?? layerView(color, layer);
      const sampledView = volumeView ?? color?.createView({ dimension }) ?? null;
      const colorTexture = depthOnly
        ? new Texture({ width: descriptor.width, height: descriptor.height, format: "rgba8", label: `${label}-colorless`, dimension,
          ...(dimension === "2d-array" ? { layers: layerCount } : {}), renderAttachment: true })
        : new Texture({ width: descriptor.width, height: descriptor.height, format, label: descriptor.label ?? "render-target-color", dimension,
          ...(dimension === "2d-array" ? { layers: layerCount } : volume ? { depth: layerCount } : {}), renderAttachment: true });
      const depthTexture = hasDepth
        ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${label}-depth`, dimension,
          ...(dimension === "2d-array" ? { layers: layerCount } : {}), renderAttachment: true })
        : undefined;
      let children: WebGPURenderTarget[] = [];
      let disposalAccounted = false;
      const makeTarget = (layer: number, child: boolean): WebGPURenderTarget => new WebGPURenderTarget(
        this.nextId++, descriptor.width, descriptor.height, child ? `${label}-layer-${layer}` : label,
        colorTexture, depthTexture, undefined, color, colorView(layer), sampledView,
        depth, depth ? layerView(depth, layer) : null, hasDepth, 1, null, null,
        child ? () => {} : (texture) => this.retireNative(texture),
        child
          ? (disposed) => { this.renderTargets.delete(disposed); }
          : (disposed) => {
            this.renderTargets.delete(disposed);
            this.pendingRenderTargetDisposals.delete(disposed);
            for (const layerTarget of children) layerTarget.dispose();
            if (!disposalAccounted) {
              disposalAccounted = true;
              this.disposedRenderTargets += 1;
              this.disposedRenderTargetTextures += (depthOnly ? 0 : 1) + (disposed.depthTexture ? 1 : 0);
            }
          },
        child ? () => {} : (failed, error) => {
          this.renderTargets.add(failed);
          if (this.disposed || this.deviceDisposing) this.pendingRenderTargetDisposals.add(failed);
          this.rejectLateDisposalFailure(error);
        },
        child ? () => {} : (attempted) => { this.deviceTargetDisposalAttempts?.add(attempted); },
        child ? () => {} : (owner, active) => { if (active) this.activeTargetDisposals.add(owner); else this.activeTargetDisposals.delete(owner); },
        child ? () => false : resource => this.nativeRetirementPending(resource),
        child ? () => {} : resource => this.retryFailedNativeRetirement(resource),
        child ? () => false : resource => this.activeNativeCleanups.has(resource),
        child
      );
      const target = makeTarget(0, false);
      // A plain 2D depth-only target has no layers to address.
      children = dimension === "2d" ? [] : Array.from({ length: layerCount }, (_, layer) => makeTarget(layer, true));
      for (const owner of [target, ...children]) {
        owner.dimension = dimension;
        owner.nativeDepthFormat = depthSelection.format;
        if (hasDepth && depthSelection.storage === "float") owner.depthStorage = "float";
        if (depthOnly) owner.depthOnly = true;
      }
      if (volume) target.nativeDepthSlice = 0;
      if (dimension !== "2d") {
        target.layers = layerCount;
        // WebGPU zero-initializes textures; each layer clears through its own view.
        target.nativeNeedsClear = false;
        children.forEach((child, layer) => {
          child.layers = 1; child.attachmentLayer = layer;
          if (volume) child.nativeDepthSlice = layer;
        });
        target.layerTargets = Object.freeze([...children]);
      }
      claimRenderTargetTextureOwner(colorTexture, this);
      if (depthTexture) claimRenderTargetTextureOwner(depthTexture, this);
      for (const child of children) this.renderTargets.add(child);
      this.renderTargets.add(target);
      nativeRetirementReceipts.set(target, resource => this.nativeRetirementReceipt(resource));
      return target;
    } catch (error) {
      for (const { texture, registered, release } of [
        { texture: nativeTexture, registered: colorRegistered, release: releaseColor },
        { texture: nativeDepthTexture, registered: depthRegistered, release: releaseDepth }
      ]) {
        if (!texture) { if (!registered) release(); continue; }
        if (!registered) this.retireUnregisteredNative(texture, release, true);
        else {
          try { if (this.resourceInterop.owns(texture)) this.retireNative(texture); } catch { /* Preserve the allocation error. */ }
        }
      }
      throw error;
    }
  }

  private createMultipleColorRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    const formats = descriptor.colorAttachments!.map((entry) => entry?.format);
    if (formats.some((format) => format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f")) {
      throw new RenderDeviceError("Unsupported render target color format", "INVALID_RENDER_TARGET_FORMAT");
    }
    if ((descriptor.dimension !== undefined && descriptor.dimension !== "2d") || descriptor.layers !== undefined || descriptor.depthOnly || descriptor.depthCompare) {
      throw new RenderDeviceError("WebGPU MRT supports only ordinary 2D color/depth targets", "UNSUPPORTED_RENDER_TARGET_FEATURE");
    }
    const sampleCount = descriptor.sampleCount ?? 1;
    if (sampleCount !== 1 && sampleCount !== 4) {
      throw new RenderDeviceError("WebGPU render-target sampleCount must be 1 or 4.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", { sampleCount });
    }
    if ((descriptor.mipLevelCount ?? 1) !== 1) {
      throw new RenderDeviceError("WebGPU MRT currently requires one mip level", "WEBGPU_MRT_CONFIGURATION_UNSUPPORTED");
    }
    if (sampleCount > 1 && descriptor.depth === "texture") {
      throw new RenderDeviceError("WebGPU multisampled targets cannot resolve depth into a sampleable texture.", "MULTISAMPLE_DEPTH_RESOLVE_UNSUPPORTED", { sampleCount, label: descriptor.label });
    }
    if (!Number.isSafeInteger(descriptor.width) || descriptor.width < 1 || !Number.isSafeInteger(descriptor.height) || descriptor.height < 1) {
      throw new RenderDeviceError("Render target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE");
    }
    const maxDimension = this.device.limits?.maxTextureDimension2D;
    if (maxDimension !== undefined && (descriptor.width > maxDimension || descriptor.height > maxDimension)) {
      throw new RenderDeviceError("Render target exceeds the device texture dimension limit", "INVALID_RENDER_TARGET_SIZE");
    }
    if (!this.device.createTexture || !this.device.createCommandEncoder) {
      throw new RenderDeviceError("WebGPU MRT needs native texture and render-pass support", "WEBGPU_MRT_UNAVAILABLE");
    }
    // Validate all formats and both device attachment limits before allocation.
    resolveNativeRenderState({
      state: { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" },
      topology: "triangles", colorFormats: formats.map((format) => webgpuTextureFormat(format!)),
      depthStencilFormat: descriptor.depth === false ? null : this.selectDepthFormat(descriptor).format,
      sampleCount, targetWidth: descriptor.width, targetHeight: descriptor.height,
      deviceGeneration: this.generation, targetKey: "mrt-preflight", targetGeneration: 0,
      shaderKey: "mrt-preflight", layoutKey: "mrt-preflight", colorLimits: this.device.limits, features: this.device.features
    });
    type PendingColor = WebGPUColorAttachment & {
      readonly release: () => void;
      readonly releaseMultisample: () => void;
      registered: boolean;
      multisampleRegistered: boolean;
    };
    const pending: PendingColor[] = [];
    let target: WebGPURenderTarget | undefined;
    const label = descriptor.label ?? "aura3d-webgpu-render-target";
    const policy = this.options.textureBudgetPolicy;
    const limit = policy?.maxBytes ?? policy?.textureBudgetBytes;
    try {
      for (let index = 1; index < formats.length; index += 1) {
        const format = formats[index]!;
        const size = descriptor.width * descriptor.height * bytesPerPixel(format);
        if (!Number.isSafeInteger(size)) throw new TextureBudgetExceededError("Render target exceeds safe texture byte accounting.");
        const release = reserveTextureBudget(size, limit, this);
        let native: WebGPUTextureLike | undefined;
        let multisampleNative: WebGPUTextureLike | undefined;
        let releaseMultisample: () => void = () => {};
        try {
          native = this.device.createTexture({ label: `${label}-color-${index}`, size: [descriptor.width, descriptor.height],
            format: webgpuTextureFormat(format), usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.TEXTURE_BINDING });
          if (pending.some((color) => color.native === native || color.multisampleNative === native) || this.resourceInterop.owns(native)) {
            throw new RenderDeviceError("WebGPU MRT attachments must have distinct native textures", "WEBGPU_MRT_ATTACHMENT_ALIAS");
          }
          const view = native.createView();
          if (view === null || view === undefined) throw new RenderDeviceError("WebGPU MRT texture view is unavailable", "WEBGPU_MRT_UNAVAILABLE");
          let multisampleView: unknown | null = null;
          if (sampleCount > 1) {
            const multisampleBytes = size * sampleCount;
            if (!Number.isSafeInteger(multisampleBytes)) throw new TextureBudgetExceededError("Render target exceeds safe texture byte accounting.");
            releaseMultisample = reserveTextureBudget(multisampleBytes, limit, this);
            multisampleNative = this.device.createTexture({ label: `${label}-color-${index}-multisample`,
              size: [descriptor.width, descriptor.height], format: webgpuTextureFormat(format),
              usage: TEXTURE_USAGE.RENDER_ATTACHMENT, sampleCount });
            if (multisampleNative === native || pending.some((color) => color.native === multisampleNative || color.multisampleNative === multisampleNative)
              || this.resourceInterop.owns(multisampleNative)) {
              throw new RenderDeviceError("WebGPU MRT attachments must have distinct native textures", "WEBGPU_MRT_ATTACHMENT_ALIAS");
            }
            multisampleView = multisampleNative.createView();
            if (multisampleView === null || multisampleView === undefined) throw new RenderDeviceError("WebGPU MRT multisample texture view is unavailable", "WEBGPU_MRT_UNAVAILABLE");
          }
          const texture = new Texture({ width: descriptor.width, height: descriptor.height, format, renderAttachment: true, label: `${label}-color-${index}` });
          pending.push({ texture, native, view, sampledView: view, multisampleNative: multisampleNative ?? null, multisampleView,
            release, releaseMultisample, registered: false, multisampleRegistered: false });
        } catch (error) {
          const priorOwns = (candidate: WebGPUTextureLike): boolean => pending.some((color) => color.native === candidate || color.multisampleNative === candidate)
            || this.resourceInterop.owns(candidate);
          if (multisampleNative && multisampleNative !== native) {
            if (priorOwns(multisampleNative)) this.uncertainNativeAllocations.add({ resource: multisampleNative, error, release: releaseMultisample });
            else this.retireUnregisteredNative(multisampleNative, releaseMultisample, true);
          } else if (multisampleNative) this.uncertainNativeAllocations.add({ resource: multisampleNative, error, release: releaseMultisample });
          else releaseMultisample();
          if (native) {
            if (priorOwns(native)) this.uncertainNativeAllocations.add({ resource: native, error, release });
            else this.retireUnregisteredNative(native, release, true);
          } else release();
          throw error;
        }
      }
      target = this.createRenderTarget({ ...descriptor, format: formats[0], colorAttachments: undefined }) as WebGPURenderTarget;
      const primaryHandles = [target.nativeTexture, target.nativeMultisampleTexture, target.nativeDepthTexture]
        .filter((native): native is WebGPUTextureLike => native !== null);
      if (target.disposed || this.disposed || this.contextLost || !target.nativeTexture || !target.nativeView ||
        (sampleCount > 1 && (!target.nativeMultisampleTexture || !target.nativeMultisampleView)) ||
        new Set(primaryHandles).size !== primaryHandles.length ||
        pending.some((color) => primaryHandles.includes(color.native) || (color.multisampleNative !== null && primaryHandles.includes(color.multisampleNative)))) {
        throw new RenderDeviceError("WebGPU MRT target became unavailable or aliased during allocation", "WEBGPU_MRT_ATTACHMENT_ALIAS");
      }
      for (const color of pending) {
        this.registerNativeCleanup(color.native, [{ run: color.release }]);
        color.registered = true;
        if (color.multisampleNative) {
          const multisampleNative = color.multisampleNative;
          this.registerNativeCleanup(multisampleNative, [{ run: color.releaseMultisample }]);
          color.multisampleRegistered = true;
        }
        claimRenderTargetTextureOwner(color.texture, this);
      }
      target.installExtraColors(pending);
      return target;
    } catch (error) {
      target?.dispose();
      for (const color of pending) {
        color.texture.dispose();
        if (color.registered && this.resourceInterop.owns(color.native)) this.retireNative(color.native);
        else if (!color.registered) this.retireUnregisteredNative(color.native, color.release, true);
        if (color.multisampleNative) {
          if (color.multisampleRegistered && this.resourceInterop.owns(color.multisampleNative)) this.retireNative(color.multisampleNative);
          else if (!color.multisampleRegistered) this.retireUnregisteredNative(color.multisampleNative, color.releaseMultisample, true);
        }
      }
      throw error;
    }
  }

  canPresentNativeDepthOfField(): boolean {
    return !this.disposed && !this.contextLost && Boolean(this.device.createTexture && this.device.createShaderModule &&
      this.device.createRenderPipeline && this.device.createCommandEncoder && this.device.createBindGroupLayout &&
      this.device.createPipelineLayout && this.device.createBindGroup && this.device.createSampler && this.device.queue.onSubmittedWorkDone);
  }

  beginNativeDepthOfFieldFrame(descriptor: NativeWebGPUDofFrameDescriptor): NativeWebGPUDofFrame {
    this.assertFrame();
    if (this.#nativeDofActive && this.#nativeDofActive.phase !== "invalid") {
      throw new RenderDeviceError("A native depth-of-field frame is already active", "WEBGPU_DOF_FRAME_ACTIVE");
    }
    const target = this.requireRenderTarget(descriptor.source);
    // A 4x producer draws the frame; sealing resolves it into the single-sample source.
    const producer = descriptor.multisample === undefined ? target : this.requireRenderTarget(descriptor.multisample);
    if (this.activeRenderTarget !== producer || !this.frameToken || target.nativeExtraColors.length !== 1 ||
        !target.nativeTexture || !target.nativeDepthTexture || !target.nativeDepthView || !target.depthTexture ||
        target.sampleCount !== 1 || !["rgba16f", "rgba32f"].includes(target.colorTexture.format) ||
        target.nativeExtraColors[0]!.texture.format !== "rgba8" || descriptor.coverage?.target !== target ||
        descriptor.coverage.colorAttachment !== 1 || descriptor.coverage.encoding !== "depth-coverage-red8" ||
        descriptor.alpha !== "opaque" || descriptor.depthModel !== "single-surface" ||
        (producer !== target && !this.nativeDofMultisampleProducerMatches(producer, target))) {
      throw new RenderDeviceError("Native depth of field requires its active HDR/depth/coverage target", "WEBGPU_DOF_FRAME_UNSUPPORTED");
    }
    if (!descriptor.scopeId || typeof descriptor.scopeId !== "object" ||
        (typeof descriptor.viewId !== "string" && !Number.isSafeInteger(descriptor.viewId)) ||
        !Number.isSafeInteger(descriptor.frameId) || descriptor.frameId < 0 || !descriptor.projection ||
        descriptor.projection.mode !== this.depthConvention.mode || descriptor.projection.clearValue !== this.depthConvention.clearValue) {
      throw new RenderDeviceError("Native depth-of-field frame identity or depth convention is invalid", "WEBGPU_DOF_FRAME_UNSUPPORTED");
    }
    linearizeWebGPUDepthSample(0.5, descriptor.projection, descriptor.maxGeometryDepthMeters, descriptor.skyDepthMeters, 0);
    const inverseProjection = Object.freeze(Array.from(descriptor.projection.inverseProjection));
    const viewportDepthRange = Object.freeze([...descriptor.projection.viewportDepthRange]) as readonly [number, number];
    const projection = Object.freeze({ ...descriptor.projection, inverseProjection, viewportDepthRange });
    const coverage = Object.freeze({ target, colorAttachment: 1, encoding: "depth-coverage-red8" as const });
    let proof!: NativeDofFrameProof;
    const frame: NativeWebGPUDofFrame = Object.freeze({ source: target, coverage, projection,
      maxGeometryDepthMeters: descriptor.maxGeometryDepthMeters, skyDepthMeters: descriptor.skyDepthMeters,
      alpha: "opaque" as const, depthModel: "single-surface" as const, scopeId: descriptor.scopeId,
      viewId: descriptor.viewId, frameId: descriptor.frameId, deviceGeneration: this.generation,
      isCurrent: () => this.nativeDofProofCurrent(proof) });
    proof = { frame, target: producer, frameToken: this.frameToken, nativeColor: producer.nativeTexture!, nativeDepth: producer.nativeDepthTexture!,
      nativeCoverage: producer.nativeExtraColors[0]!.native, color: producer.colorTexture, depth: producer.depthTexture,
      coverage: producer.nativeExtraColors[0]!.texture, phase: "recording", normalClear: false, coverageClear: false,
      depthSubmitted: false, effectSubmitted: false, serial: 0, ...(producer !== target ? { resolveTarget: target } : {}) };
    this.#nativeDofProofs.set(frame, proof);
    this.#nativeDofActive = proof;
    return frame;
  }

  sealNativeDepthOfFieldFrame(frame: NativeWebGPUDofFrame): void {
    const proof = this.#nativeDofProofs.get(frame);
    if (!proof || proof.phase !== "recording" || !proof.normalClear || !proof.coverageClear || !this.nativeDofProofCurrent(proof)) {
      throw new RenderDeviceError("Native depth-of-field frame lacks a current color/depth and coverage clear", "WEBGPU_DOF_FRAME_STALE");
    }
    this.assertNativeDofViewport(proof.target);
    if (proof.resolveTarget) {
      try { this.resolveNativeDofMultisampleProducer(proof); }
      catch (error) { proof.phase = "invalid"; throw error; }
      if (!this.nativeDofProofCurrent(proof)) {
        proof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field resolve did not produce a current frame", "WEBGPU_DOF_FRAME_STALE");
      }
      this.assertNativeDofViewport(proof.target);
    }
    proof.serial = this.resourceInterop.submissionSerial;
    proof.phase = "sealed";
  }

  cancelNativeDepthOfFieldFrame(frame: NativeWebGPUDofFrame): void {
    const proof = this.#nativeDofProofs.get(frame);
    if (!proof) return;
    proof.phase = "invalid";
    if (this.#nativeDofActive === proof) this.#nativeDofActive = null;
  }

  /** A 4x producer pairs with its resolve target: same size and formats, a 4x depth and one 4x coverage plane. */
  private nativeDofMultisampleProducerMatches(producer: WebGPURenderTarget, target: WebGPURenderTarget): boolean {
    const coverage = producer.nativeExtraColors[0];
    return producer !== target && producer.sampleCount === 4 && producer.width === target.width && producer.height === target.height &&
      producer.colorTexture.format === target.colorTexture.format && producer.colorTexture.format === "rgba16f" &&
      Boolean(producer.nativeTexture && producer.nativeView && producer.nativeMultisampleTexture && producer.nativeDepthTexture &&
        producer.nativeDepthView && producer.multisampledDepthTexture) && !producer.depthTexture &&
      producer.nativeExtraColors.length === 1 && coverage!.texture.format === "rgba8" && Boolean(coverage!.multisampleNative && coverage!.view) &&
      producer.nativeDepthTexture !== target.nativeDepthTexture && producer.nativeTexture !== target.nativeTexture;
  }

  /**
   * Resolve a sealed-ready 4x producer into the frame's single-sample source in
   * one pass: the resolved HDR color, coverage 1 where any sample was covered,
   * and the nearest covered sample depth (the clear value where none was). The
   * proof then tracks the single-sample source; the producer is no longer read.
   */
  private resolveNativeDofMultisampleProducer(proof: NativeDofFrameProof): void {
    const producer = proof.target, target = proof.resolveTarget!;
    this.requireRenderTarget(target);
    if (!this.nativeDofMultisampleProducerMatches(producer, target) || target.disposed || target.nativeExtraColors.length !== 1 ||
        !target.nativeTexture || !target.nativeView || !target.nativeDepthTexture || !target.nativeDepthView || !target.depthTexture ||
        !this.device.createBindGroupLayout || !this.device.createPipelineLayout || !this.device.createShaderModule ||
        !this.device.createRenderPipeline || !this.device.createCommandEncoder || !this.device.createBindGroup) {
      throw new RenderDeviceError("Native depth-of-field multisample resolve is unavailable", "WEBGPU_DOF_FRAME_UNSUPPORTED");
    }
    if (producer.nativeNeedsClear) this.flushNativeRenderTargetClear(producer);
    const coverage = producer.nativeExtraColors[0]!;
    const reversed = this.depthConvention.mode === "reversed";
    const clearDepth = this.depthConvention.clearValue;
    const depthView = producer.nativeDepthTexture!.createView({ aspect: "depth-only" });
    const layoutEntries: WebGPUBindGroupLayoutEntryLike[] = [
      { binding: 0, visibility: 2, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
      { binding: 1, visibility: 2, texture: { sampleType: "unfilterable-float", viewDimension: "2d" } },
      { binding: 2, visibility: 2, texture: { sampleType: "depth", viewDimension: "2d", multisampled: true } }
    ];
    const depthFormat = target.nativeDepthFormat;
    const hasStencil = depthFormat.includes("stencil");
    const key = JSON.stringify(["native-dof-msaa-resolve", webgpuTextureFormat(target.colorTexture.format), depthFormat, reversed, clearDepth]);
    let pipeline = this.webgpuPostPipelines.get(key);
    if (!pipeline) {
      const bindLayout = this.device.createBindGroupLayout({ label: "native-dof-msaa-resolve-layout", entries: layoutEntries });
      const layout = this.device.createPipelineLayout({ label: "native-dof-msaa-resolve-pipeline-layout", bindGroupLayouts: [bindLayout] });
      const vertex = this.device.createShaderModule({ label: "native-dof-msaa-resolve-vs", code: WEBGPU_POST_VERTEX_WGSL });
      const fragment = this.device.createShaderModule({ label: "native-dof-msaa-resolve-fs", code: nativeDofMultisampleResolveWgsl(reversed, clearDepth) });
      pipeline = this.device.createRenderPipeline({ label: "native-dof-msaa-resolve-pipeline", layout,
        vertex: { module: vertex, entryPoint: "vs_post" },
        fragment: { module: fragment, entryPoint: "fs_dof_msaa_resolve", targets: [{ format: webgpuTextureFormat(target.colorTexture.format) }, { format: "rgba8unorm" }] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: "always" } } as WebGPURenderPipelineDescriptorLike);
      this.webgpuPostPipelines.set(key, pipeline);
      this.nativeRenderPipelinesCreated += 1;
    }
    const bindLayout = pipeline.getBindGroupLayout?.(0);
    if (!bindLayout) throw new RenderDeviceError("Native depth-of-field resolve layout is unavailable", "WEBGPU_DOF_HOST_UNAVAILABLE");
    const group = this.device.createBindGroup({ label: "native-dof-msaa-resolve-bind", layout: bindLayout, entries: [
      { binding: 0, resource: producer.nativeView }, { binding: 1, resource: coverage.view }, { binding: 2, resource: depthView }] });
    const encoder = this.device.createCommandEncoder({ label: "native-dof-msaa-resolve-encoder" });
    const pass = encoder.beginRenderPass({ label: "native-dof-msaa-resolve-pass",
      colorAttachments: [
        { view: target.nativeView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" },
        { view: target.nativeExtraColors[0]!.view, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: target.nativeDepthView, depthClearValue: clearDepth, depthLoadOp: "clear", depthStoreOp: "store",
        ...(hasStencil ? { stencilClearValue: 0, stencilLoadOp: "clear" as const, stencilStoreOp: "store" as const } : {}) } } as WebGPURenderPassDescriptorLike);
    if (!pass.setBindGroup) throw new RenderDeviceError("Native depth-of-field resolve cannot bind resources", "WEBGPU_DOF_HOST_UNAVAILABLE");
    pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3, 1, 0); pass.end();
    const finished = encoder.finish();
    const reads = [producer.nativeTexture!, coverage.native, producer.nativeDepthTexture!];
    const writes = [target.nativeTexture, target.nativeExtraColors[0]!.native, target.nativeDepthTexture];
    this.submitMrtAware([finished], [...reads.map(resource => ({ resource, mode: "read" as const })),
      ...writes.map(resource => ({ resource, mode: "write" as const }))], true);
    this.nativeRenderPasses += 1;
    this.nativeSubmissions += 1;
    target.nativeNeedsClear = false;
    target.nativeClearColor = producer.nativeClearColor;
    // The proof now tracks the single-sample source; drawing stops here.
    proof.target = target;
    proof.nativeColor = target.nativeTexture;
    proof.nativeDepth = target.nativeDepthTexture;
    proof.nativeCoverage = target.nativeExtraColors[0]!.native;
    proof.color = target.colorTexture;
    proof.depth = target.depthTexture;
    proof.coverage = target.nativeExtraColors[0]!.texture;
    delete proof.resolveTarget;
    this.setRenderTarget(target);
  }

  validateNativeDepthOfFieldFrame(frame: NativeWebGPUDofFrame, source: RenderTarget): boolean {
    const proof = this.#nativeDofProofs.get(frame);
    return Boolean(proof && proof.phase === "sealed" && proof.target === source && this.nativeDofProofCurrent(proof));
  }

  /** Per-issuance submission evidence; authored frame IDs and diagnostic tokens may be reused. */
  getNativeDepthOfFieldFrameSubmission(frame: NativeWebGPUDofFrame): Readonly<{ depthSubmitted: boolean; effectSubmitted: boolean }> | undefined {
    const proof = this.#nativeDofProofs.get(frame);
    return proof ? Object.freeze({ depthSubmitted: proof.depthSubmitted, effectSubmitted: proof.effectSubmitted }) : undefined;
  }

  private nativeDofProofCurrent(proof: NativeDofFrameProof): boolean {
    if (!proof || proof.phase === "invalid" || proof.phase === "consumed" || this.#nativeDofActive !== proof ||
        !this.frameActive || this.frameToken !== proof.frameToken || this.disposed || this.contextLost ||
        this.activeRenderTarget !== proof.target || proof.target.disposed || proof.target.colorTexture.disposed ||
        proof.target.depthTexture?.disposed || proof.target.nativeExtraColors[0]?.texture.disposed ||
        proof.target.nativeTexture !== proof.nativeColor || proof.target.nativeDepthTexture !== proof.nativeDepth ||
        proof.target.nativeExtraColors[0]?.native !== proof.nativeCoverage || proof.target.colorTexture !== proof.color ||
        proof.target.depthTexture !== proof.depth || proof.target.nativeExtraColors[0]?.texture !== proof.coverage ||
        (proof.phase === "sealed" && proof.serial !== this.resourceInterop.submissionSerial)) return false;
    try {
      this.requireRenderTarget(proof.target);
      this.assertNativeDofViewport(proof.target);
      this.resourceInterop.assertUsable(proof.target.nativeTexture!);
      this.resourceInterop.assertUsable(proof.target.nativeDepthTexture!);
      this.resourceInterop.assertUsable(proof.target.nativeExtraColors[0]!.native);
      return true;
    } catch { return false; }
  }

  private assertNativeDofViewport(target: WebGPURenderTarget): void {
    const viewport = this.viewStateTarget === target ? this.viewportOverride : null;
    const scissor = this.viewStateTarget === target && this.scissorTestOn ? this.scissorOverride : null;
    const full = (rect: typeof viewport): boolean => !rect || (rect.x === 0 && rect.y === 0 && rect.width === target.width && rect.height === target.height);
    if (!full(viewport) || !full(scissor)) throw new RenderDeviceError("Native depth of field requires a full target viewport and scissor", "WEBGPU_DOF_VIEWPORT_UNSUPPORTED");
  }

  private prepareNativeDofDraw(command: DrawCommand, shader: WebGPUShaderProgram, proof: NativeDofFrameProof): () => void {
    const program = shader.generatedUnlit, identity = this.#mrtShaders.get(shader);
    const frameBuffer = this.uniformBufferBindings.get(0);
    const frameWrite = frameBuffer && this.#pointFrameWrites.get(frameBuffer);
    const vertexFormat = command.vertexFormat;
    const formatFingerprint = JSON.stringify(vertexFormat);
    const vertexLocations = program?.requiredVertexLocations;
    const plain = vertexLocations?.length === 1 && vertexLocations[0] === 0;
    const colored = vertexLocations?.length === 2 && vertexLocations[0] === 0 && vertexLocations[1] === 4
      && nativeDofVertexColorSupported(vertexFormat);
    if (!program || !program.writesDepthCoverage || (program.primitive !== "triangles" && program.primitive !== "lines") || program.point || program.clipping ||
        program.fog !== "none" || program.packedLoopColor || program.resources.length || program.requiredInstanceLocations.length ||
        (!plain && !colored) || command.topology !== program.primitive || (command.instanceCount ?? 1) !== 1 || (command.instanceAttributes?.length ?? 0) ||
        (command.nativeStorageBindings?.length ?? 0) || command.renderState?.stencil || command.renderState?.scissor ||
        !identity?.unlitFingerprint || JSON.stringify(program) !== identity.unlitFingerprint ||
        !frameBuffer || !frameWrite || this.nativeExposedBuffers.has(frameBuffer) ||
        this.#pointFrameWriteEpochs.get(frameBuffer) !== frameWrite.epoch || proof.frame.projection.clipRange !== "minus-one-to-one") {
      throw new RenderDeviceError("Native depth-of-field draw requires a private generated opaque unlit frame", "WEBGPU_DOF_DRAW_UNSUPPORTED");
    }
    this.assertNativeDofViewport(proof.target);
    const bytes = new DataView(frameWrite.bytes.buffer, frameWrite.bytes.byteOffset, frameWrite.bytes.byteLength);
    const readMatrix = (offset: number): number[] => Array.from({ length: 16 }, (_, index) => bytes.getFloat32(offset + 4 * index, true));
    const view = readMatrix(0), projection = readMatrix(64), viewProjection = readMatrix(128);
    const inverse = Array.from(proof.frame.projection.inverseProjection);
    const product = (a: readonly number[], b: readonly number[], row: number, col: number): number =>
      a[row]! * b[col * 4]! + a[4 + row]! * b[col * 4 + 1]! + a[8 + row]! * b[col * 4 + 2]! + a[12 + row]! * b[col * 4 + 3]!;
    const close = (actual: number, expected: number): boolean => Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 0.0003 * Math.max(1, Math.abs(actual), Math.abs(expected));
    if (![...view, ...projection, ...viewProjection].every(Number.isFinite) || Array.from({ length: 16 }, (_, index) => {
      const row = index % 4, col = Math.floor(index / 4);
      return close(product(projection, inverse, row, col), row === col ? 1 : 0) && close(product(projection, view, row, col), viewProjection[index]!);
    }).some(valid => !valid)) {
      throw new RenderDeviceError("Depth-of-field projection does not match the private raster frame", "WEBGPU_DOF_PROJECTION_STALE");
    }
    const material = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map());
    const stateFingerprint = JSON.stringify(command.renderState);
    const data = new DataView(material.buffer, material.byteOffset, material.byteLength);
    const base = GENERATED_UNLIT_MATERIAL_OFFSETS.baseColor!, emissive = GENERATED_UNLIT_MATERIAL_OFFSETS.emissive!;
    const alphaCutoff = data.getFloat32(GENERATED_UNLIT_MATERIAL_OFFSETS.alphaControls!, true);
    if ([0, 1, 2].some(index => { const value = data.getFloat32(base + index * 4, true); return value < 0 || value > 1 || !Number.isFinite(value); }) ||
        data.getFloat32(base + 12, true) !== 1 || !Number.isFinite(alphaCutoff) || alphaCutoff < 0 || alphaCutoff > 1 ||
        [0, 1, 2].some(index => data.getFloat32(emissive + index * 4, true) !== 0)) {
      throw new RenderDeviceError("Native depth of field requires bounded opaque unlit color without emission", "WEBGPU_DOF_DRAW_UNSUPPORTED");
    }
    return () => {
      if (!this.nativeDofProofCurrent(proof) || proof.phase !== "recording" || !proof.coverageClear ||
          this.uniformBufferBindings.get(0) !== frameBuffer || this.#pointFrameWrites.get(frameBuffer) !== frameWrite ||
          this.#pointFrameWriteEpochs.get(frameBuffer) !== frameWrite.epoch || this.nativeExposedBuffers.has(frameBuffer) ||
          shader.generatedUnlit !== program || JSON.stringify(program) !== identity.unlitFingerprint || JSON.stringify(command.renderState) !== stateFingerprint ||
          command.vertexFormat !== vertexFormat || JSON.stringify(vertexFormat) !== formatFingerprint || command.topology !== program.primitive) {
        throw new RenderDeviceError("Native depth-of-field producer changed before submission", "WEBGPU_DOF_FRAME_STALE");
      }
      const now = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map());
      if (now.length !== material.length || now.some((value, index) => value !== material[index])) {
        throw new RenderDeviceError("Native depth-of-field material changed before submission", "WEBGPU_DOF_FRAME_STALE");
      }
      this.assertNativeDofViewport(proof.target);
    };
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    if (this.#nativeDofActive && target !== this.#nativeDofActive.target) this.#nativeDofActive.phase = "invalid";
    if (target !== null && (!(target instanceof WebGPURenderTarget) || !this.renderTargets.has(target) || target.disposed)) {
      throw new RenderDeviceError("Render target is not a live WebGPU resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    if (target && target instanceof WebGPURenderTarget && target.nativeExtraColors.length) this.requireRenderTarget(target);
    if (this.activeRenderTarget && target !== this.activeRenderTarget && this.activeRenderTarget.nativeNeedsClear) this.flushNativeRenderTargetClear(this.activeRenderTarget);
    this.activeRenderTarget = target as WebGPURenderTarget | null;
  }

  /** Generate each level from the immediately finer level in queue order. */
  generateRenderTargetMipmaps(target: RenderTarget): void {
    this.assertAlive();
    const owned = this.requireRenderTarget(target), texture = owned.nativeTexture;
    if (owned.colorTexture.mipLevelCount === 1) return;
    if (owned.sampleCount !== 1 || !texture || !owned.nativeView) throw new RenderDeviceError("WebGPU mip generation requires a live single-sample target", "WEBGPU_RENDER_TARGET_MIPS_UNAVAILABLE");
    if (owned.colorTexture.format === "rgba32f" && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("WebGPU rgba32f mip generation requires float32-filterable", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
    }
    this.flushNativeRenderTargetClear(owned);
    if (owned.nativeNeedsClear) throw new RenderDeviceError("WebGPU mip source could not be initialized", "WEBGPU_RENDER_TARGET_MIPS_UNAVAILABLE");
    this.resourceInterop.assertUsable(texture);
    for (let level = 1; level < owned.colorTexture.mipLevelCount; level += 1) {
      const width = Math.max(1, Math.floor(owned.width / 2 ** level));
      const height = Math.max(1, Math.floor(owned.height / 2 ** level));
      this.runWebGPUFullscreenPass({ label: "webgpu-render-target-mip", fragment: WEBGPU_MIP_AREA_FRAGMENT, entryPoint: "fs_mip",
        uniforms: new Float32Array([width, height, 0, 0]), exposureBindings: true,
        views: [texture.createView({ baseMipLevel: level - 1, mipLevelCount: 1 })],
        target: owned, targetViewOverride: texture.createView({ baseMipLevel: level, mipLevelCount: 1 }), reuseUniforms: true,
        accesses: [{ resource: texture, mode: "readwrite" }] });
    }
    owned.nativeMipsReady = true;
  }

  getRenderTarget(): RenderTarget | null { return this.activeRenderTarget; }

  /** Ordered, GPU-only color-region copy; coordinates use the renderer's bottom-left origin. */
  copyRenderTargetColorRegion(source: RenderTarget, destination: RenderTarget, region: RenderTargetColorRegion): void {
    this.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    const src = this.requireRenderTarget(source), dst = this.requireRenderTarget(destination);
    if (src === dst || src.sampleCount !== 1 || dst.sampleCount !== 1 || source.depthOnly || destination.depthOnly ||
      (source.dimension ?? "2d") !== "2d" || (destination.dimension ?? "2d") !== "2d" || src.colorTexture.format !== dst.colorTexture.format) {
      throw new RenderDeviceError("WebGPU color-region copy requires distinct single-sample 2D targets with matching formats", "INVALID_RESOURCE_COPY");
    }
    const { sourceX, sourceY, destinationX, destinationY, width, height } = region;
    if (![sourceX, sourceY, destinationX, destinationY, width, height].every(Number.isSafeInteger) ||
      sourceX < 0 || sourceY < 0 || destinationX < 0 || destinationY < 0 || width <= 0 || height <= 0 ||
      sourceX + width > src.width || sourceY + height > src.height || destinationX + width > dst.width || destinationY + height > dst.height) {
      throw new RenderDeviceError("WebGPU color-region copy lies outside its target bounds", "INVALID_RESOURCE_COPY");
    }
    if (!src.nativeTexture || !src.nativeView || !dst.nativeTexture || !dst.nativeView || !this.device.createCommandEncoder) {
      throw new RenderDeviceError("WebGPU color-region copy requires native color textures", "WEBGPU_COPY_UNAVAILABLE");
    }
    this.resourceInterop.assertUsable(src.nativeTexture);
    this.resourceInterop.assertUsable(dst.nativeTexture);
    const encoder = this.device.createCommandEncoder({ label: "render-target-color-region-copy" });
    if (!encoder.copyTextureToTexture) throw new RenderDeviceError("WebGPU texture-region copy is unavailable", "WEBGPU_COPY_UNAVAILABLE");
    if (src.nativeNeedsClear) this.flushNativeRenderTargetClear(src);
    if (dst.nativeNeedsClear) this.flushNativeRenderTargetClear(dst);
    if (src.nativeNeedsClear || dst.nativeNeedsClear) throw new RenderDeviceError("WebGPU target clear could not be submitted before copy", "WEBGPU_COPY_UNAVAILABLE");
    encoder.copyTextureToTexture(
      { texture: src.nativeTexture, origin: { x: sourceX, y: src.height - sourceY - height } },
      { texture: dst.nativeTexture, origin: { x: destinationX, y: dst.height - destinationY - height } },
      { width, height, depthOrArrayLayers: 1 }
    );
    this.submitMrtAware([encoder.finish()], [{ resource: src.nativeTexture, mode: "read" }, { resource: dst.nativeTexture, mode: "write" }],
      src.nativeExtraColors.length > 0 || dst.nativeExtraColors.length > 0);
    dst.nativeNeedsClear = false;
    this.nativeSubmissions += 1;
  }

  /** Internal adapter for ordered splat runs crossing the scene color space. */
  createGaussianSplatColorAdapter(): GaussianSplatColorAdapter {
    this.assertAlive();
    let removeLostListener = (): void => {};
    const adapter = new WebGPUGaussianSplatColorAdapter({
      device: this.device,
      interop: this.resourceInterop,
      requireScene: (target) => this.requireGaussianSplatScene(target),
      createScratch: (scene) => {
        const target = this.createRenderTarget({ width: scene.target.width, height: scene.target.height, format: "rgba32f", depth: false, sampleCount: 1, label: "gaussian-splat-color-scratch" }) as WebGPURenderTarget;
        if (!target.nativeTexture || !target.nativeView) {
          target.dispose();
          throw new RenderDeviceError("WebGPU Gaussian splat scratch is unavailable", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
        }
        return { target, texture: target.nativeTexture, view: target.nativeView, format: "rgba32float" };
      },
      prepareScene: (surface) => {
        const target = this.requireRenderTarget(surface.target);
        if (target.nativeNeedsClear) this.flushNativeRenderTargetClear(target);
        if (target.nativeNeedsClear) throw new RenderDeviceError("WebGPU scene clear could not be submitted", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
      },
      region: (surface) => this.gaussianSplatRegion(this.requireRenderTarget(surface.target)),
      markWritten: (surface) => { this.requireRenderTarget(surface.target).nativeNeedsClear = false; },
      borrowDepth: (scene, scratch, draw) => {
        this.assertOutsideGaussianSplatDraw();
        const source = this.requireRenderTarget(scene.target), destination = this.requireRenderTarget(scratch.target);
        if (this.activeRenderTarget !== source || source.nativeNeedsClear || destination.nativeNeedsClear) {
          throw new RenderDeviceError("Gaussian splat color and depth must be initialized before the draw", "GAUSSIAN_SPLAT_SCRATCH_INVALID");
        }
        this.activeRenderTarget = destination;
        this.gaussianSplatBorrowedDepth = source;
        try { draw(); } finally {
          this.gaussianSplatBorrowedDepth = null;
          this.activeRenderTarget = source;
        }
      },
      recordTransfer: () => { this.nativeRenderPasses += 1; this.nativeSubmissions += 1; this.drawCalls += 1; },
      onDispose: () => { removeLostListener(); this.gaussianSplatAdapters.delete(adapter); }
    });
    removeLostListener = this.onDeviceLost(() => this.disposeNativeGaussianSplatAdapter(adapter));
    this.gaussianSplatAdapters.add(adapter);
    return adapter;
  }

  private requireGaussianSplatScene(input: RenderTarget): WebGPUSplatSurface {
    this.assertFrame();
    if (!input || this.activeRenderTarget !== input) throw new RenderDeviceError("Gaussian splat compositing requires the active WebGPU render target", "GAUSSIAN_SPLAT_TARGET_UNSUPPORTED");
    const target = this.requireRenderTarget(input);
    if (target.nativeExtraColors.length) throw new RenderDeviceError("Gaussian splat compositing does not update all MRT attachments", "WEBGPU_MRT_SURFACE_UNSUPPORTED");
    if (target.sampleCount !== 1) throw new RenderDeviceError("WebGPU Gaussian splat compositing cannot preserve this multisample color attachment", "GAUSSIAN_SPLAT_MULTISAMPLE_UNSUPPORTED");
    if (target.colorTexture.format !== "rgba16f" && target.colorTexture.format !== "rgba32f") {
      throw new RenderDeviceError("Gaussian splat compositing requires a floating-point scene target", "GAUSSIAN_SPLAT_HDR_TARGET_REQUIRED");
    }
    if (!target.nativeDepthTexture || !target.nativeDepthView) throw new RenderDeviceError("Gaussian splat compositing requires the scene depth attachment", "GAUSSIAN_SPLAT_DEPTH_REQUIRED");
    const colorBytesLimit = this.device.limits?.maxColorAttachmentBytesPerSample;
    if (colorBytesLimit !== undefined && colorBytesLimit < 16) {
      throw new RenderDeviceError("WebGPU cannot render an RGBA32F Gaussian splat scratch target", "GAUSSIAN_SPLAT_FLOAT_BLEND_UNSUPPORTED", { colorBytesLimit });
    }
    if (!target.nativeTexture || !target.nativeView || !this.device.createCommandEncoder || !this.device.createBindGroup || !this.device.features?.has("float32-blendable")) {
      throw new RenderDeviceError("WebGPU Gaussian splat compositing requires native rendering and float32-blendable", "GAUSSIAN_SPLAT_FLOAT_BLEND_UNSUPPORTED");
    }
    this.resourceInterop.assertUsable(target.nativeTexture);
    this.resourceInterop.assertUsable(target.nativeDepthTexture);
    return { target, texture: target.nativeTexture, view: target.nativeView, format: target.colorTexture.format === "rgba16f" ? "rgba16float" : "rgba32float" };
  }

  /** Convert the current device view to an exact integer pixel region. */
  private gaussianSplatRegion(target: WebGPURenderTarget): WebGPUSplatRegion {
    const scoped = this.viewStateTarget === target;
    const v = scoped && this.viewportOverride ? this.viewportOverride : { x: 0, y: 0, width: target.width, height: target.height };
    if (![v.x, v.y, v.width, v.height].every(Number.isFinite) || v.x < 0 || v.y < 0 || v.width <= 0 || v.height <= 0 || v.x + v.width > target.width || v.y + v.height > target.height) {
      throw new RenderDeviceError("Gaussian splat viewport lies outside its target", "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
    }
    let left = Math.max(0, Math.ceil(v.x - 0.5)), bottom = Math.max(0, Math.ceil(v.y - 0.5));
    let right = Math.min(target.width, Math.ceil(v.x + v.width - 0.5)), top = Math.min(target.height, Math.ceil(v.y + v.height - 0.5));
    const s = scoped && this.scissorTestOn ? this.scissorOverride : null;
    if (s) {
      if (![s.x, s.y, s.width, s.height].every(Number.isInteger) || s.x < 0 || s.y < 0 || s.width < 0 || s.height < 0 || s.x + s.width > target.width || s.y + s.height > target.height) {
        throw new RenderDeviceError("Gaussian splat scissor lies outside its target", "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
      }
      left = Math.max(left, s.x); bottom = Math.max(bottom, s.y);
      right = Math.min(right, s.x + s.width); top = Math.min(top, s.y + s.height);
    }
    right = Math.max(left, right); top = Math.max(bottom, top);
    return [left, target.height - top, right - left, top - bottom];
  }

  private assertOutsideGaussianSplatDraw(): void {
    if (this.gaussianSplatBorrowedDepth) throw new RenderDeviceError("A Gaussian splat draw cannot change or clear its borrowed target", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
  }

  private disposeNativeGaussianSplatAdapter(adapter: WebGPUGaussianSplatColorAdapter): void {
    if (this.uncertainGaussianSplatDisposals.has(adapter)) throw this.uncertainGaussianSplatDisposals.get(adapter);
    if (this.activeGaussianSplatDisposals.has(adapter)) return;
    if (this.gaussianSplatBorrowedDepth) {
      throw new RenderDeviceError("Cannot dispose a Gaussian splat surface during its draw", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
    }
    this.activeGaussianSplatDisposals.add(adapter);
    try {
      adapter.dispose();
      if (this.gaussianSplatAdapters.has(adapter)) {
        throw new Error("Gaussian splat adapter disposal did not report completion.");
      }
    } catch (error) {
      // The adapter sets its retired flag before disposing scratches; after a
      // throw, a second call may silently skip the unfinished work.
      if (this.gaussianSplatAdapters.has(adapter)) this.uncertainGaussianSplatDisposals.set(adapter, error);
      throw error;
    } finally {
      this.activeGaussianSplatDisposals.delete(adapter);
    }
  }

  /** Whether the default output has a persistent viewport override. */
  hasDefaultOutputOverride(): boolean {
    this.assertAlive();
    return this.persistentViewportRect !== null;
  }

  /** Direct native paths cannot apply the device's retained viewport/scissor state. */
  hasNativeSurfaceViewOverride(target: RenderTarget | null = null): boolean {
    this.assertFrame();
    if (target) this.requireRenderTarget(target);
    return (target === null && this.persistentViewportRect !== null) ||
      (this.viewStateTarget === target && (this.viewportOverride !== null || (this.scissorTestOn && this.scissorOverride !== null)));
  }

  /** Frame-local output view. The returned handle must never outlive this frame. */
  getNativeRenderSurface(target: RenderTarget | null = null): { view: unknown; width: number; height: number; format: string; generation: number; sampleCount: number } {
    this.assertFrame();
    if (target) {
      const owned = this.requireRenderTarget(target);
      this.assertColorRenderTarget(owned, "getNativeRenderSurface");
      if (owned.nativeDepthSlice !== undefined) throw new RenderDeviceError("A 3d slice needs a pass depthSlice that a borrowed surface view cannot carry", "WEBGPU_SURFACE_3D_UNSUPPORTED", { label: owned.label });
      if (owned.nativeExtraColors.length) throw new RenderDeviceError("A single-view native surface cannot represent an MRT target", "WEBGPU_MRT_SURFACE_UNSUPPORTED");
      if (!owned.nativeView) throw new RenderDeviceError("Render target has no native surface", "WEBGPU_SURFACE_UNAVAILABLE");
      if (owned.sampleCount !== 1) throw new RenderDeviceError("Multisampled native surface requires an explicit resolve path", "WEBGPU_SURFACE_MULTISAMPLED");
      return { view: owned.nativeView, width: owned.width, height: owned.height, format: webgpuTextureFormat(owned.colorTexture.format), generation: this.generation, sampleCount: 1 };
    }
    if (this.activeColorSpace === "display-p3") throw new RenderDeviceError("Direct native canvas surfaces do not declare Display-P3 output", "WEBGPU_P3_DIRECT_UNSUPPORTED");
    const view = this.currentCanvasView();
    if (!view) throw new RenderDeviceError("Canvas surface is unavailable", "WEBGPU_SURFACE_UNAVAILABLE");
    return { view, width: this.viewportWidth, height: this.viewportHeight, format: this.presentationFormat, generation: this.generation, sampleCount: 1 };
  }

  /** Frame-scoped HDR color/depth attachment lease for a native deferred pass. */
  getNativeDeferredSurface(target: RenderTarget): WebGPUNativeDeferredSurface {
    this.assertFrame();
    const owned = this.requireRenderTarget(target);
    if (owned.nativeExtraColors.length) throw new RenderDeviceError("Deferred single-color surfaces cannot represent MRT targets", "WEBGPU_MRT_SURFACE_UNSUPPORTED");
    if (this.activeRenderTarget !== owned) throw new RenderDeviceError("Deferred surface must be the active target", "WEBGPU_DEFERRED_SURFACE_UNAVAILABLE");
    if (owned.colorTexture.format !== "rgba16f" && owned.colorTexture.format !== "rgba32f") {
      throw new RenderDeviceError("Deferred surface requires an HDR color target", "WEBGPU_DEFERRED_SURFACE_UNAVAILABLE");
    }
    if (!owned.nativeTexture || !owned.nativeView || !owned.nativeDepthTexture || !owned.nativeDepthView
      || (owned.sampleCount > 1 && (!owned.nativeMultisampleTexture || !owned.nativeMultisampleView))) {
      throw new RenderDeviceError("Deferred surface requires native color and depth attachments", "WEBGPU_DEFERRED_SURFACE_UNAVAILABLE");
    }
    const resources = [owned.nativeTexture, owned.nativeDepthTexture, ...(owned.nativeMultisampleTexture ? [owned.nativeMultisampleTexture] : [])];
    for (const resource of resources) this.resourceInterop.assertUsable(resource);
    const colorView = owned.nativeMultisampleView ?? owned.nativeView;
    const depthSampleView = owned.nativeDepthTexture.createView({ aspect: "depth-only" });
    const clearColor = [...owned.nativeClearColor] as [number, number, number, number];
    const needsClear = owned.nativeNeedsClear;
    const epoch = this.nativeFrameEpoch, serial = this.resourceInterop.submissionSerial;
    let submitted = false;
    return {
      colorView, ...(owned.nativeMultisampleView ? { resolveView: owned.nativeView } : {}),
      depthAttachmentView: owned.nativeDepthView, depthSampleView,
      colorFormat: webgpuTextureFormat(owned.colorTexture.format), depthFormat: owned.nativeDepthFormat,
      width: owned.width, height: owned.height, sampleCount: owned.sampleCount, generation: this.generation,
      loadOp: needsClear ? "clear" : "load", clearColor, depthClearValue: this.depthConvention.clearValue, stencilClearValue: 0,
      submit: (commands, readResources = []) => {
        this.assertFrame();
        if (submitted || epoch !== this.nativeFrameEpoch || this.activeRenderTarget !== owned || owned.disposed
          || needsClear !== owned.nativeNeedsClear || clearColor.some((value, index) => value !== owned.nativeClearColor[index])
          || serial !== this.resourceInterop.submissionSerial) {
          throw new RenderDeviceError("Deferred surface lease is stale", "WEBGPU_DEFERRED_SURFACE_STALE");
        }
        if (!Array.isArray(commands) || commands.length === 0) throw new RenderDeviceError("Deferred surface needs a command buffer", "WEBGPU_DEFERRED_SURFACE_INVALID");
        if (!Array.isArray(readResources) || readResources.some(resource => resources.includes(resource as WebGPUTextureLike))) {
          throw new RenderDeviceError("Deferred input cannot alias its output attachments", "WEBGPU_DEFERRED_SURFACE_INVALID");
        }
        this.resourceInterop.submit(commands, [...resources.map(resource => ({ resource, mode: needsClear ? "write" as const : "readwrite" as const })),
          ...readResources.map(resource => ({ resource, mode: "read" as const }))]);
        submitted = true;
        owned.nativeNeedsClear = false;
        this.nativeSubmissions += 1;
        this.drawCalls += 1;
      }
    };
  }

  /** Borrow an uploaded cube probe; submit its resource as a deferred read. */
  getNativeDeferredProbe(texture: Texture): WebGPUNativeDeferredProbe {
    this.assertAlive();
    if (!texture || texture.disposed || texture.dimension !== "cube" || texture.colorSpace !== "linear" || !texture.usage.includes("sampled")) {
      throw new RenderDeviceError("Deferred probe requires a live sampled linear cube texture", "WEBGPU_DEFERRED_PROBE_INVALID");
    }
    if (isFloat32Texture(texture) && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("Deferred float32 probe filtering requires float32-filterable", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
    }
    if (!this.device.createSampler) throw new RenderDeviceError("Deferred probe sampler is unavailable", "WEBGPU_DEFERRED_PROBE_UNAVAILABLE");
    const resource = this.getNativeSampledTexture(texture);
    const view = resource.createView({ dimension: "cube" });
    this.webgpuDeferredProbeSampler ??= this.device.createSampler({ minFilter: "linear", magFilter: "linear", mipmapFilter: "linear",
      addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge", addressModeW: "clamp-to-edge" });
    const sampler = this.webgpuDeferredProbeSampler;
    return { device: this.device, resource, view, sampler, assertUsable: () => {
      this.assertAlive();
      if (texture.disposed) throw new RenderDeviceError("Deferred probe texture is disposed", "DISPOSED_RESOURCE");
      this.resourceInterop.assertUsable(resource);
    } };
  }

  /** Record a successful external pipeline submission to a frame-local surface. */
  markNativeRenderSurfaceWritten(target: RenderTarget | null = null): void {
    this.assertFrame();
    if (target) {
      const owned = this.requireRenderTarget(target);
      if (owned.nativeExtraColors.length) throw new RenderDeviceError("A single-view native surface cannot represent an MRT target", "WEBGPU_MRT_SURFACE_UNSUPPORTED");
      if (!owned.nativeTexture || !owned.nativeView) throw new RenderDeviceError("Render target has no native surface", "WEBGPU_SURFACE_UNAVAILABLE");
      if (owned.sampleCount !== 1) throw new RenderDeviceError("Multisampled native surface requires an explicit resolve path", "WEBGPU_SURFACE_MULTISAMPLED");
      this.resourceInterop.assertUsable(owned.nativeTexture);
      owned.nativeNeedsClear = false;
    } else {
      if (this.activeColorSpace === "display-p3") throw new RenderDeviceError("Direct native canvas output does not declare Display-P3 conversion", "WEBGPU_P3_DIRECT_UNSUPPORTED");
      if (!this.canvasContext || canvasOwners.get(this.canvasContext) !== this.canvasOwner) {
        throw new RenderDeviceError("Canvas surface is unavailable", "WEBGPU_SURFACE_UNAVAILABLE");
      }
      this.canvasSubmissions += 1;
    }
    this.nativeSubmissions += 1;
    this.drawCalls += 1;
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.assertAlive();
    if (this.#nativeDofActive?.target === target) this.#nativeDofActive.phase = "invalid";
    const webgpuTarget = this.requireRenderTarget(target);
    this.assertColorRenderTarget(webgpuTarget, "writeRenderTargetPixels");
    if (webgpuTarget.nativeExtraColors.length) throw new RenderDeviceError("MRT targets require an attachment-specific upload", "WEBGPU_MRT_UPLOAD_UNSUPPORTED");
    const expectedLength = webgpuTarget.width * webgpuTarget.height * 4;
    if (pixels.length !== expectedLength) {
      throw new RenderDeviceError("Render target pixel upload length does not match target dimensions", "INVALID_RENDER_TARGET_PIXELS", {
        targetId: target.id,
        expectedLength,
        actualLength: pixels.length
      });
    }
    if (webgpuTarget.nativeTexture && webgpuTarget.colorTexture.format === "rgba8" && hasNativeTextureUpload(this.device)) {
      this.device.queue.writeTexture(
        { texture: webgpuTarget.nativeTexture },
        pixels,
        { bytesPerRow: webgpuTarget.width * 4, rowsPerImage: webgpuTarget.height },
        { width: webgpuTarget.width, height: webgpuTarget.height, depthOrArrayLayers: 1 }
      );
      this.nativeTextureUploads += 1;
      webgpuTarget.nativeNeedsClear = false;
    }
  }

  /**
   * On an opaque WebGPU canvas, copy the sampled source RGB unchanged and
   * force output alpha to one. Callers must supply final opaque RGB: this
   * operation neither composites a background nor infers alpha association.
   */
  presentRenderTarget(source: RenderTarget): void {
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    if (this.activeColorSpace === "display-p3") {
      throw new RenderDeviceError("RGBA8 target presentation has no Display-P3 source encoding contract", "WEBGPU_P3_SOURCE_UNSUPPORTED");
    }
    const target = this.requireRenderTarget(source);
    this.assertColorRenderTarget(target, "presentRenderTarget");
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("WebGPU backbuffer presentation currently requires rgba8 source pixels", "PRESENT_FORMAT_UNSUPPORTED", {
        source: source.label,
        format: target.colorTexture.format
      });
    }
    const canvas = this.canvasContext;
    if (!canvas || canvasOwners.get(canvas) !== this.canvasOwner) throw new RenderDeviceError("WebGPU canvas surface is unavailable", "WEBGPU_SURFACE_UNAVAILABLE");
    if (this.presentationFormat !== "rgba8unorm" && this.presentationFormat !== "bgra8unorm") {
      throw new RenderDeviceError("WebGPU presentation requires an unorm RGBA8 or BGRA8 canvas", "PRESENT_FORMAT_UNSUPPORTED", { format: this.presentationFormat });
    }
    const validateCanvas = (): void => {
      this.assertAlive();
      if (canvasOwners.get(canvas) !== this.canvasOwner) throw new RenderDeviceError("WebGPU canvas ownership changed", "WEBGPU_CANVAS_SUPERSEDED");
      const configuration = canvas.getConfiguration?.();
      if (canvas.getConfiguration && !configuration) throw new RenderDeviceError("WebGPU canvas is not configured", "WEBGPU_SURFACE_UNAVAILABLE");
      if (configuration && (configuration.device !== this.device || configuration.format !== this.presentationFormat ||
        (configuration.colorSpace !== undefined && configuration.colorSpace !== "srgb"))) {
        throw new RenderDeviceError("WebGPU canvas configuration does not match this presentation path", "WEBGPU_CANVAS_CONFIGURATION_UNSUPPORTED");
      }
      if ((configuration?.alphaMode ?? this.options.presentationAlphaMode ?? "opaque") !== "opaque") {
        throw new RenderDeviceError("Presentation requires an opaque canvas until the source alpha association is declared", "OUTPUT_ALPHA_MODE_UNAVAILABLE");
      }
    };
    validateCanvas();
    if (this.persistentViewportRect || (this.viewStateTarget === null && (this.viewportOverride || (this.scissorTestOn && this.scissorOverride)))) {
      throw new RenderDeviceError("Native presentation does not support a canvas viewport or scissor override", "WEBGPU_PRESENT_VIEWPORT_UNSUPPORTED");
    }
    if (!target.nativeTexture || !target.nativeView) throw new RenderDeviceError("Render target has no native color texture", "WEBGPU_SURFACE_UNAVAILABLE");
    if (this.activeRenderTarget && this.activeRenderTarget !== target && this.activeRenderTarget.nativeNeedsClear) this.flushNativeRenderTargetClear(this.activeRenderTarget);
    if (target.nativeNeedsClear) this.flushNativeRenderTargetClear(target);
    if (target.nativeNeedsClear || target.disposed || target.colorTexture.disposed) throw new RenderDeviceError("Render target could not be initialized for presentation", "WEBGPU_TARGET_CLEAR_UNAVAILABLE");
    this.resourceInterop.assertUsable(target.nativeTexture);
    const canvasTexture = canvas.getCurrentTexture();
    if (!canvasTexture || this.resourceInterop.owns(canvasTexture) || canvasTexture === target.nativeTexture || target.nativeExtraColors.some((color) => color.native === canvasTexture) ||
        (canvasTexture.format !== undefined && canvasTexture.format !== this.presentationFormat) ||
        (canvasTexture.sampleCount !== undefined && canvasTexture.sampleCount !== 1) ||
        (canvasTexture.usage !== undefined && (canvasTexture.usage & TEXTURE_USAGE.RENDER_ATTACHMENT) === 0)) {
      throw new RenderDeviceError("Canvas texture is unavailable, incompatible or aliases a device-owned resource", "WEBGPU_SURFACE_UNAVAILABLE");
    }
    const canvasView = canvasTexture.createView();
    if (!canvasView) throw new RenderDeviceError("WebGPU canvas view is unavailable", "WEBGPU_SURFACE_UNAVAILABLE");
    const activeTarget = this.activeRenderTarget, frameToken = this.frameToken, frameActive = this.frameActive, canvasGeneration = this.canvasTargetGeneration;
    this.reclaimWebGPUPostUniformBuffers();
    this.runWebGPUFullscreenPass({
      label: "webgpu-present-render-target", fragment: WEBGPU_NATIVE_COPY_FRAGMENT, entryPoint: "fs_copy",
      uniforms: new Float32Array([1 / target.width, 1 / target.height, 0, 1]),
      views: [target.nativeView], target: null, targetViewOverride: canvasView,
      accesses: [{ resource: target.nativeTexture, mode: "read" }], protectedSubmission: true,
      beforeSubmit: () => {
        validateCanvas();
        if (this.activeRenderTarget !== activeTarget || this.frameToken !== frameToken || this.frameActive !== frameActive ||
            this.canvasTargetGeneration !== canvasGeneration || target.disposed || target.colorTexture.disposed || target.nativeNeedsClear ||
            canvas.getCurrentTexture() !== canvasTexture) {
          throw new RenderDeviceError("Presentation source or canvas changed before submission", "WEBGPU_PRESENTATION_STALE");
        }
      }
    });
    this.activeRenderTarget = null;
    this.nativeSubmissions += 1;
    this.canvasSubmissions += 1;
  }

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    // PRD 11 Phase 1 freeze: the CPU-shadowed framebuffer is removed. Synchronous
    // byte readback never existed on real WebGPU — use `readPixelsAsync`
    // (native copyTextureToBuffer) or the MockRenderDevice CPU raster in tests.
    throw new RenderDeviceError(
      "Synchronous WebGPU readPixels is unsupported; use readPixelsAsync or MockRenderDevice",
      "WEBGPU_SYNC_READBACK_UNSUPPORTED",
      { x, y, width, height }
    );
  }

  private submitNativeReadbackCopy(target: WebGPURenderTarget, x: number, y: number, width: number, height: number, bytesPerRow: number, label: string,
    texture: Texture = target.colorTexture, requireActive = true, signal?: AbortSignal): WebGPUBufferLike {
    this.assertColorRenderTarget(target, "readback");
    const native = target.nativeColorFor(texture);
    if (!native) throw new RenderDeviceError("Native readback source is unavailable", "NATIVE_READBACK_TARGET_MISSING");
    const readback = this.device.createBuffer({ label, size: bytesPerRow * height, usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST });
    let registered = false;
    try {
      this.registerNativeCleanup(readback, []);
      registered = true;
      const assertCurrent = (): void => {
        this.assertAlive();
        throwIfWebGPUReadbackAborted(signal);
        this.requireRenderTarget(target);
        if ((requireActive && this.activeRenderTarget !== target) || texture.disposed || target.nativeColorFor(texture) !== native || target.nativeNeedsClear) {
          throw new RenderDeviceError("Readback source changed before submission", "WEBGPU_READBACK_STALE");
        }
        this.resourceInterop.assertUsable(native);
        this.resourceInterop.assertUsable(readback);
      };
      assertCurrent();
      const encoder = this.device.createCommandEncoder!({ label: `${label}-encoder` });
      assertCurrent();
      const copy = encoder.copyTextureToBuffer;
      if (!copy) throw new RenderDeviceError("WebGPU command encoder does not expose texture-to-buffer copy", "NATIVE_READBACK_UNSUPPORTED");
      // A 3d slice target reads its own volume slice.
      copy.call(encoder, { texture: native, origin: { x, y, z: target.nativeDepthSlice ?? 0 } }, { buffer: readback, bytesPerRow, rowsPerImage: height },
        { width, height, depthOrArrayLayers: 1 });
      assertCurrent();
      const command = encoder.finish();
      assertCurrent();
      this.submitMrtAware([command], [{ resource: native, mode: "read" }, { resource: readback, mode: "write" }], true);
      return readback;
    } catch (error) {
      try {
        if (registered) this.retireNative(readback);
        else this.retireUnregisteredNative(readback);
      } catch { /* Preserve the original copy or submission failure. */ }
      throw error;
    }
  }

  async readPixelsAsync(x: number, y: number, width: number, height: number): Promise<Uint8Array> {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (target) this.assertColorRenderTarget(target, "readPixelsAsync");
    if (!target || !target.nativeTexture) {
      throw new RenderDeviceError("Native WebGPU readback requires an active native render target", "NATIVE_READBACK_TARGET_MISSING", {
        x,
        y,
        width,
        height,
        renderTarget: target?.label ?? null
      });
    }
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("Native WebGPU readback currently supports rgba8 render targets", "NATIVE_READBACK_FORMAT_UNSUPPORTED", {
        format: target.colorTexture.format,
        renderTarget: target.label
      });
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    if (!hasNativeTextureReadback(this.device)) {
      throw new RenderDeviceError("WebGPU device does not expose native texture-to-buffer readback", "NATIVE_READBACK_UNSUPPORTED");
    }
    this.flushNativeRenderTargetClear(target);

    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const readback = this.submitNativeReadbackCopy(target, x, y, width, height, bytesPerRow, `${target.label}-native-readback`);

    try {
      const mapAsync = readback.mapAsync;
      const getMappedRange = readback.getMappedRange;
      const unmap = readback.unmap;
      if (!mapAsync || !getMappedRange || !unmap) {
        throw new RenderDeviceError("WebGPU readback buffer does not expose mapped readback APIs", "NATIVE_READBACK_UNSUPPORTED");
      }
      await mapAsync.call(readback, MAP_MODE.READ);
      const mapped = new Uint8Array(getMappedRange.call(readback));
      const output = new Uint8Array(width * height * bytesPerPixel);
      for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * bytesPerRow;
        const destOffset = (height - 1 - row) * unpaddedBytesPerRow;
        output.set(mapped.subarray(sourceOffset, sourceOffset + unpaddedBytesPerRow), destOffset);
      }
      unmap.call(readback);
      this.nativeTextureReadbacks += 1;
      return output;
    } finally {
      try { this.retireNative(readback); } catch { /* Preserve any readback failure. */ }
    }
  }

  async readFloatPixelsAsync(x: number, y: number, width: number, height: number, attachment?: number): Promise<Float32Array> {
    this.assertAlive();
    const target = this.activeRenderTarget;
    if (!target) {
      throw new RenderDeviceError("Native WebGPU float readback requires an active native render target", "NATIVE_READBACK_TARGET_MISSING", {
        x, y, width, height, renderTarget: null
      });
    }
    this.assertColorRenderTarget(target, "readFloatPixelsAsync");
    return this.readNativeFloatTarget(target, x, y, width, height, attachment ?? 0, true);
  }

  async readFloatRenderTarget(options: RenderResourceReadbackOptions): Promise<Float32Array> {
    this.assertAlive();
    throwIfWebGPUReadbackAborted(options.signal);
    const target = this.requireRenderTarget(options.target);
    const attachment = options.attachment ?? 0;
    const identity = getRenderAttachmentIdentity(target, "color", attachment);
    if (identity.format !== "rgba16f" && identity.format !== "rgba32f") {
      throw new RenderDeviceError("Float target readback requires an rgba16f or rgba32f color attachment", "INVALID_RESOURCE_READBACK");
    }
    return this.readNativeFloatTarget(target, 0, 0, target.width, target.height, attachment, false, options.signal);
  }

  private async readNativeFloatTarget(target: WebGPURenderTarget, x: number, y: number, width: number, height: number,
    attachment: number, requireActive: boolean, signal?: AbortSignal): Promise<Float32Array> {
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    throwIfWebGPUReadbackAborted(signal);
    this.requireRenderTarget(target);
    if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        !Number.isSafeInteger(width * height * 4)) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const identity = getRenderAttachmentIdentity(target, "color", attachment);
    const format = identity.format;
    if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") {
      throw new RenderDeviceError("Native WebGPU float readback does not support this format", "NATIVE_READBACK_FORMAT_UNSUPPORTED", { format });
    }
    if (identity.mipLevel !== 0 || identity.layer !== 0 || identity.texture.dimension !== "2d") {
      throw new RenderDeviceError("Native WebGPU float readback supports only 2D level-zero targets", "NATIVE_READBACK_TARGET_UNSUPPORTED");
    }
    if (width > target.width - x || height > target.height - y) {
      throw new RenderDeviceError("Float readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    if (!hasNativeTextureReadback(this.device)) {
      throw new RenderDeviceError("WebGPU device does not expose native texture-to-buffer readback", "NATIVE_READBACK_UNSUPPORTED");
    }
    throwIfWebGPUReadbackAborted(signal);
    this.flushNativeRenderTargetClear(target);

    const bytesPerPixel = format === "rgba32f" ? 16 : format === "rgba16f" ? 8 : 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const stagingBytes = bytesPerRow * height;
    if (!Number.isSafeInteger(stagingBytes) || (this.device.limits?.maxBufferSize !== undefined && stagingBytes > this.device.limits.maxBufferSize)) {
      throw new RenderDeviceError("WebGPU float readback exceeds the buffer size limit", "NATIVE_READBACK_SIZE_UNSUPPORTED", { stagingBytes });
    }
    // RenderDevice rectangles use bottom-left coordinates; WebGPU texture
    // copies use a top-left origin. Output rows are flipped back below.
    const copyY = target.height - y - height;
    const readback = this.submitNativeReadbackCopy(target, x, copyY, width, height, bytesPerRow,
      `${target.label}-native-float-readback`, identity.texture, requireActive, signal);

    let mappedSuccessfully = false;
    try {
      const mapAsync = readback.mapAsync;
      const getMappedRange = readback.getMappedRange;
      const unmap = readback.unmap;
      if (!mapAsync || !getMappedRange || !unmap) {
        throw new RenderDeviceError("WebGPU readback buffer does not expose mapped readback APIs", "NATIVE_READBACK_UNSUPPORTED");
      }
      await mapAsync.call(readback, MAP_MODE.READ);
      mappedSuccessfully = true;
      throwIfWebGPUReadbackAborted(signal);
      // The target may retire safely after submission; the legacy active-target
      // call still returns that submitted snapshot. A direct target transfer
      // instead refuses to publish a result after its source was disposed.
      if (!requireActive) {
        this.assertAlive();
        this.requireRenderTarget(target);
        if (identity.texture.disposed || target.nativeColorFor(identity.texture) === undefined) {
          throw new RenderDeviceError("Float readback source was disposed", "DISPOSED_RESOURCE", { targetId: target.id });
        }
      }
      const mapped = new Uint8Array(getMappedRange.call(readback));
      const view = new DataView(mapped.buffer, mapped.byteOffset, mapped.byteLength);
      const output = new Float32Array(width * height * 4);
      for (let row = 0; row < height; row += 1) {
        const destRow = height - 1 - row;
        for (let column = 0; column < width; column += 1) {
          const sourceOffset = row * bytesPerRow + column * bytesPerPixel;
          const destOffset = (destRow * width + column) * 4;
          if (format === "rgba32f") {
            output[destOffset] = view.getFloat32(sourceOffset, true);
            output[destOffset + 1] = view.getFloat32(sourceOffset + 4, true);
            output[destOffset + 2] = view.getFloat32(sourceOffset + 8, true);
            output[destOffset + 3] = view.getFloat32(sourceOffset + 12, true);
          } else if (format === "rgba16f") {
            output[destOffset] = halfFloatToNumber(view.getUint16(sourceOffset, true));
            output[destOffset + 1] = halfFloatToNumber(view.getUint16(sourceOffset + 2, true));
            output[destOffset + 2] = halfFloatToNumber(view.getUint16(sourceOffset + 4, true));
            output[destOffset + 3] = halfFloatToNumber(view.getUint16(sourceOffset + 6, true));
          } else {
            output[destOffset] = (mapped[sourceOffset] ?? 0) / 255;
            output[destOffset + 1] = (mapped[sourceOffset + 1] ?? 0) / 255;
            output[destOffset + 2] = (mapped[sourceOffset + 2] ?? 0) / 255;
            output[destOffset + 3] = (mapped[sourceOffset + 3] ?? 0) / 255;
          }
        }
      }
      this.nativeTextureReadbacks += 1;
      return output;
    } finally {
      if (mappedSuccessfully) {
        try { readback.unmap?.(); } catch { /* Preserve any readback failure. */ }
      }
      try { this.retireNative(readback); } catch { /* Preserve any readback failure. */ }
    }
  }

  /**
   * Asynchronous same-device color copy. Both targets stay device-owned; an
   * abort before submission leaves the destination untouched, and an abort
   * after submission only stops waiting (the copy itself is not undone).
   * Resolves after the copy's queue fence when the queue exposes one.
   */
  async copyRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    await this.transferNativeRenderTarget(options);
  }

  /**
   * Multisampled color resolve. Every WebGPU pass into a 4x target already
   * resolves into the target's single-sample texture, so this copies that
   * resolved image into the destination with the same ownership contract.
   */
  async resolveRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    if ((options.source.sampleCount ?? 1) <= 1 || (options.destination.sampleCount ?? 1) !== 1 || (options.aspect ?? "color") !== "color") {
      throw new RenderDeviceError("Resolve requires multisampled color source and single-sampled destination", "INVALID_RESOURCE_RESOLVE");
    }
    await this.transferNativeRenderTarget(options);
  }

  private async transferNativeRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    this.assertAlive();
    throwIfWebGPUReadbackAborted(options.signal);
    const source = this.requireRenderTarget(options.source);
    const destination = this.requireRenderTarget(options.destination);
    const aspect = options.aspect ?? "color";
    const read = getRenderAttachmentIdentity(source, aspect, options.sourceAttachment ?? 0);
    const write = getRenderAttachmentIdentity(destination, aspect, options.destinationAttachment ?? 0);
    if (source.width !== destination.width || source.height !== destination.height || read.format !== write.format) {
      throw new RenderDeviceError("Copy attachments must have identical size and format", "INVALID_RESOURCE_COPY");
    }
    if (aspect === "depth") {
      // depth24plus* cannot be copied and depth32float cannot be a copy
      // destination, so a WebGPU depth copy would need a depth-writing pass.
      throw new RenderDeviceError("WebGPU render-target depth copies are not supported; sample the depth texture instead", "WEBGPU_DEPTH_COPY_UNSUPPORTED");
    }
    if (write.sampleCount !== 1) throw new RenderDeviceError("WebGPU copies require a single-sample destination", "INVALID_RESOURCE_COPY");
    validateRenderAttachmentAccess([read], [write]);
    // Give an already scheduled abort a chance before anything is encoded.
    await Promise.resolve();
    throwIfWebGPUReadbackAborted(options.signal);
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    this.requireRenderTarget(source);
    this.requireRenderTarget(destination);
    const sourceNative = source.nativeColorFor(read.texture), destinationNative = destination.nativeColorFor(write.texture);
    if (read.texture.disposed || write.texture.disposed || !sourceNative || !destinationNative || !this.device.createCommandEncoder) {
      throw new RenderDeviceError("WebGPU target copy requires live native color textures", "WEBGPU_COPY_UNAVAILABLE");
    }
    this.resourceInterop.assertUsable(sourceNative);
    this.resourceInterop.assertUsable(destinationNative);
    if (source.nativeNeedsClear) this.flushNativeRenderTargetClear(source);
    if (destination.nativeNeedsClear) this.flushNativeRenderTargetClear(destination);
    if (source.nativeNeedsClear || destination.nativeNeedsClear) {
      throw new RenderDeviceError("WebGPU target clear could not be submitted before copy", "WEBGPU_COPY_UNAVAILABLE");
    }
    const encoder = this.device.createCommandEncoder({ label: `${source.label}-to-${destination.label}-copy` });
    if (!encoder.copyTextureToTexture) throw new RenderDeviceError("WebGPU texture copy is unavailable", "WEBGPU_COPY_UNAVAILABLE");
    encoder.copyTextureToTexture(
      { texture: sourceNative, mipLevel: read.mipLevel, origin: { x: 0, y: 0, z: read.layer } },
      { texture: destinationNative, mipLevel: write.mipLevel, origin: { x: 0, y: 0, z: write.layer } },
      { width: source.width, height: source.height, depthOrArrayLayers: 1 }
    );
    this.submitMrtAware([encoder.finish()], [{ resource: sourceNative, mode: "read" }, { resource: destinationNative, mode: "write" }],
      source.nativeExtraColors.length > 0 || destination.nativeExtraColors.length > 0);
    destination.nativeNeedsClear = false;
    this.nativeSubmissions += 1;
    const fence = this.device.queue.onSubmittedWorkDone?.();
    if (fence && typeof (fence as Promise<void>).then === "function") await fence;
    throwIfWebGPUReadbackAborted(options.signal);
  }

  /**
   * Read a single-sample rgba8 attachment of any owned 2D target without
   * changing the active target. Rows are bottom-to-top, as in readPixelsAsync.
   * The staging buffer is device-owned and retired on every path; abort
   * discards the result, not the target or already submitted GPU work.
   */
  async readRenderTarget(options: RenderResourceReadbackOptions): Promise<Uint8Array> {
    this.assertAlive();
    throwIfWebGPUReadbackAborted(options.signal);
    const target = this.requireRenderTarget(options.target);
    const identity = getRenderAttachmentIdentity(target, "color", options.attachment ?? 0);
    if (identity.format !== "rgba8" || identity.sampleCount !== 1) {
      throw new RenderDeviceError("Byte readback requires an rgba8 single-sampled attachment; resolve multisampled targets first", "INVALID_RESOURCE_READBACK");
    }
    if (identity.mipLevel !== 0 || identity.layer !== 0 || identity.texture.dimension !== "2d") {
      throw new RenderDeviceError("Native WebGPU byte readback supports only 2D level-zero targets", "NATIVE_READBACK_TARGET_UNSUPPORTED");
    }
    if (!hasNativeTextureReadback(this.device)) {
      throw new RenderDeviceError("WebGPU device does not expose native texture-to-buffer readback", "NATIVE_READBACK_UNSUPPORTED");
    }
    await Promise.resolve();
    throwIfWebGPUReadbackAborted(options.signal);
    this.assertAlive();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    this.requireRenderTarget(target);
    this.flushNativeRenderTargetClear(target);
    const { width, height } = target;
    const unpaddedBytesPerRow = width * 4;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const readback = this.submitNativeReadbackCopy(target, 0, 0, width, height, bytesPerRow, `${target.label}-native-byte-readback`,
      identity.texture, false, options.signal);
    let mapped = false;
    try {
      const { mapAsync, getMappedRange } = readback;
      if (!mapAsync || !getMappedRange || !readback.unmap) {
        throw new RenderDeviceError("WebGPU readback buffer does not expose mapped readback APIs", "NATIVE_READBACK_UNSUPPORTED");
      }
      await mapAsync.call(readback, MAP_MODE.READ);
      mapped = true;
      throwIfWebGPUReadbackAborted(options.signal);
      this.assertAlive();
      this.requireRenderTarget(target);
      if (identity.texture.disposed || target.nativeColorFor(identity.texture) === undefined) {
        throw new RenderDeviceError("Byte readback source was disposed", "DISPOSED_RESOURCE", { targetId: target.id });
      }
      const bytes = new Uint8Array(getMappedRange.call(readback));
      const output = new Uint8Array(width * height * 4);
      for (let row = 0; row < height; row += 1) {
        output.set(bytes.subarray(row * bytesPerRow, row * bytesPerRow + unpaddedBytesPerRow), (height - 1 - row) * unpaddedBytesPerRow);
      }
      this.nativeTextureReadbacks += 1;
      return output;
    } finally {
      if (mapped) {
        try { readback.unmap?.(); } catch { /* Preserve any readback failure. */ }
      }
      try { this.retireNative(readback); } catch { /* Preserve any readback failure. */ }
    }
  }

  readFloatPixels(x: number, y: number, width: number, height: number, attachment?: number): Float32Array {
    this.assertAlive();
    // PRD 11 Phase 1 freeze: same removal as `readPixels` — the float shadow was
    // a CPU-only convenience; use `readFloatPixelsAsync` for real WebGPU reads.
    throw new RenderDeviceError(
      "Synchronous WebGPU readFloatPixels is unsupported; use readFloatPixelsAsync or MockRenderDevice",
      "WEBGPU_SYNC_READBACK_UNSUPPORTED",
      { x, y, width, height, attachment }
    );
  }

  beginFrame(width: number, height: number): void {
    this.assertOutsideGaussianSplatDraw();
    this.assertAlive();
    if (this.frameActive) {
      throw new RenderDeviceError("Frame is already active", "FRAME_ALREADY_ACTIVE");
    }
    if (width <= 0 || height <= 0) {
      throw new RenderDeviceError("Frame dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.frameActive = true;
    try {
      this.pruneNativeForwardBundles();
      this.nativeFrameEpoch += 1;
      this.forwardPassProfiledThisFrame = false;
      this.drawCalls = 0;
      this.lastError = null;
      if (this.viewportWidth !== width || this.viewportHeight !== height) this.canvasTargetGeneration += 1;
      this.viewportWidth = width;
      this.viewportHeight = height;
      this.viewportOverride = null;
      this.scissorOverride = null;
      this.scissorTestOn = false;
      this.viewStateTarget = null;
      this.releaseDisposedNativeSampledTextures();
      this.ensureCanvasDepthAttachment(width, height);
      this.assertAlive();
      // The identity is the contract; allocating a new object does not rely on
      // a replaceable global helper or give callers a reusable token.
      this.frameToken = {};
    } catch (error) {
      this.frameToken = null;
      this.frameActive = false;
      throw error;
    }
  }

  /** threejs-parity L7/SC-01: raster viewport in target pixels, origin bottom-left; converted to WebGPU's top-left origin per draw pass. */
  setViewport(x: number, y: number, width: number, height: number, options?: { readonly persistent?: boolean }): void {
    this.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    if (!(width > 0) || !(height > 0)) {
      throw new RenderDeviceError("Viewport dimensions must be positive", "INVALID_VIEWPORT", { width, height });
    }
    if (options?.persistent) {
      this.persistentViewportRect = { x, y, width, height };
      return;
    }
    this.viewportOverride = { x, y, width, height };
    this.viewStateTarget = this.activeRenderTarget;
  }

  /** Clears the persistent viewport and the frame-scoped override. */
  resetViewport(): void {
    this.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    this.persistentViewportRect = null;
    this.viewportOverride = null;
    this.viewStateTarget = null;
  }

  setScissor(x: number, y: number, width: number, height: number): void {
    this.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    if (width < 0 || height < 0) {
      throw new RenderDeviceError("Scissor dimensions must be non-negative", "INVALID_SCISSOR", { width, height });
    }
    this.scissorOverride = { x, y, width, height };
    this.viewStateTarget = this.activeRenderTarget;
  }

  setScissorTest(enabled: boolean): void {
    this.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    this.scissorTestOn = enabled;
    this.viewStateTarget = this.activeRenderTarget;
  }

  /** Applies the live viewport/scissor override (if any) to a draw pass. Clears are full-attachment load ops and are never scissored. */
  private applyViewStateToPass(pass: WebGPURenderPassEncoderLike): void {
    const targetHeight = this.activeRenderTarget ? this.activeRenderTarget.height : this.viewportHeight;
    const viewTarget = this.gaussianSplatBorrowedDepth ?? this.activeRenderTarget;
    if (this.gaussianSplatBorrowedDepth && this.viewStateTarget === viewTarget) {
      if (this.viewportOverride && !pass.setViewport) throw new RenderDeviceError("WebGPU cannot preserve the Gaussian splat viewport", "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
      if (this.scissorTestOn && this.scissorOverride && !pass.setScissorRect) throw new RenderDeviceError("WebGPU cannot preserve the Gaussian splat scissor", "GAUSSIAN_SPLAT_VIEW_STATE_UNAVAILABLE");
    }
    if (this.viewStateTarget !== viewTarget || !this.viewportOverride) {
      const persistent = this.activeRenderTarget === null ? this.persistentViewportRect : null;
      if (persistent) pass.setViewport?.(persistent.x, targetHeight - persistent.y - persistent.height, persistent.width, persistent.height, 0, 1);
    }
    if (this.viewStateTarget !== viewTarget) return;
    if (this.viewportOverride) {
      const v = this.viewportOverride;
      pass.setViewport?.(v.x, targetHeight - v.y - v.height, v.width, v.height, 0, 1);
    }
    if (this.scissorTestOn && this.scissorOverride) {
      const r = this.scissorOverride;
      pass.setScissorRect?.(r.x, targetHeight - r.y - r.height, r.width, r.height);
    }
  }

  private normalizedTransmissionViewport(): readonly [number, number, number, number] {
    const target = this.activeRenderTarget, width = target?.width ?? this.viewportWidth, height = target?.height ?? this.viewportHeight;
    const viewTarget = this.gaussianSplatBorrowedDepth ?? target;
    const rect = (this.viewStateTarget === viewTarget ? this.viewportOverride : null) ?? (target === null ? this.persistentViewportRect : null);
    if (!rect) return [0, 0, 1, 1];
    if (![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite) || width <= 0 || height <= 0
      || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 || rect.x + rect.width > width || rect.y + rect.height > height) {
      throw new RenderDeviceError("Transmission viewport lies outside its capture target", "WEBGPU_TRANSMISSION_VIEWPORT_INVALID");
    }
    return [rect.x / width, rect.y / height, rect.width / width, rect.height / height];
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    const proof = this.#nativeDofActive;
    if (proof && proof.phase !== "invalid" && this.activeRenderTarget === proof.target) {
      if (proof.phase !== "recording" || color.length !== 4 || color[3] !== 1 || !color.every(Number.isFinite) || color.slice(0, 3).some(value => value < 0 || value > 1)) {
        proof.phase = "invalid";
        throw new RenderDeviceError("Native depth of field requires an opaque finite scene clear", "WEBGPU_DOF_FRAME_UNSUPPORTED");
      }
      proof.normalClear = true;
      proof.coverageClear = false;
    }
    this.clearColor = color;
    if (this.activeRenderTarget) {
      this.clearActiveRenderTarget(color);
    }
  }

  clearRenderTarget(color: readonly [number, number, number, number], attachment?: number): void {
    this.assertFrame();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    const proof = this.#nativeDofActive;
    if (proof && proof.phase !== "invalid" && this.activeRenderTarget === proof.target) {
      if (proof.phase !== "recording" || (attachment !== undefined && (attachment !== 1 || !proof.normalClear || color.some(value => value !== 0))) ||
          (attachment === undefined && (color[3] !== 1 || !color.every(Number.isFinite) || color.slice(0, 3).some(value => value < 0 || value > 1)))) {
        proof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field clear does not match its producer contract", "WEBGPU_DOF_FRAME_UNSUPPORTED");
      }
      if (attachment === undefined) { proof.normalClear = true; proof.coverageClear = false; }
    }
    if (!this.activeRenderTarget) {
      if (attachment !== undefined) throw new RenderDeviceError("Attachment-specific clear requires a render target", "INVALID_RENDER_ATTACHMENT");
      this.clearColor = color;
      return;
    }
    if (attachment !== undefined) {
      const target = this.requireRenderTarget(this.activeRenderTarget);
      const trackingProof = proof?.phase === "recording" && proof.target === target ? proof : undefined;
      const clearColor = [...color] as [number, number, number, number];
      if (trackingProof &&
          (!trackingProof.normalClear || target.nativeClearColor[3] !== 1 || !target.nativeClearColor.every(Number.isFinite) ||
            target.nativeClearColor.slice(0, 3).some(value => value < 0 || value > 1))) {
        trackingProof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field scene clear changed before submission", "WEBGPU_DOF_FRAME_STALE");
      }
      this.assertColorRenderTarget(target, "clearRenderTarget");
      const colors = [target.nativeTexture, ...target.nativeExtraColors.map((entry) => entry.native)];
      const views = [target.nativeMultisampleView ?? target.nativeView, ...target.nativeExtraColors.map((entry) => entry.multisampleView ?? entry.view)];
      const resolveViews = [target.nativeView, ...target.nativeExtraColors.map((entry) => entry.view)];
      if (!Number.isSafeInteger(attachment) || attachment < 0 || attachment >= views.length) {
        throw new RenderDeviceError("Render target has no color attachment at the requested index", "INVALID_RENDER_ATTACHMENT", { attachment, attachments: views.length });
      }
      if (!this.device.createCommandEncoder || views.some((view) => !view) || colors.some((native) => !native)) {
        throw new RenderDeviceError("Attachment-specific clear needs native render-pass support", "WEBGPU_MRT_UNAVAILABLE");
      }
      this.flushNativeRenderTargetClear(target);
      if (target.nativeNeedsClear) throw new RenderDeviceError("Render-target initialization could not be submitted", "WEBGPU_TARGET_CLEAR_UNAVAILABLE");
      const encoder = this.device.createCommandEncoder({ label: `${target.label}-color-${attachment}-clear` });
      const pass = encoder.beginRenderPass({ label: `${target.label}-color-${attachment}-clear-pass`, colorAttachments: views.map((view, index) => ({
        view, ...(index === 0 ? nativeColorSlice(target) : {}), ...(target.sampleCount > 1 ? { resolveTarget: resolveViews[index] } : {}),
        ...(index === attachment ? { clearValue: clearColor } : {}), loadOp: index === attachment ? "clear" as const : "load" as const, storeOp: "store" as const
      })) });
      pass.end();
      const resources = [...colors, target.nativeMultisampleTexture, ...target.nativeExtraColors.map((entry) => entry.multisampleNative)]
        .filter((resource): resource is WebGPUTextureLike => resource !== null);
      const finished = encoder.finish();
      if (trackingProof && (trackingProof.phase !== "recording" || !this.nativeDofProofCurrent(trackingProof) || color.some((value, index) => value !== clearColor[index]))) {
        trackingProof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field coverage clear changed before submission", "WEBGPU_DOF_FRAME_STALE");
      }
      this.submitMrtAware([finished], resources.map((resource) => ({ resource, mode: "readwrite" as const })), target.nativeExtraColors.length > 0);
      this.nativeRenderPasses += 1;
      target.nativeNeedsClear = false;
      if (trackingProof && trackingProof.phase === "recording" && attachment === 1) trackingProof.coverageClear = true;
      return;
    }
    this.clearActiveRenderTarget(color);
  }

  /** Schema-bearing values are admitted only by the portable WebGPU path. */
  drawPortable(command: DrawCommand<RecursiveUniformValue>, checked = false): void {
    const before = checked ? this.nativeDrawReceipts.get(command) ?? 0 : 0;
    this.draw(command);
    if (checked && (this.nativeDrawReceipts.get(command) ?? 0) === before) {
      throw new RenderDeviceError("WebGPU draw could not be submitted", "WEBGPU_DRAW_UNAVAILABLE");
    }
  }

  draw(command: DrawCommand): void;
  draw(command: DrawCommand<RecursiveUniformValue>): void;
  draw(command: DrawCommand<RecursiveUniformValue>): void {
    this.assertOutsideMrtSubmission();
    if (this.#pointSubmissionActive) throw new RenderDeviceError("Point submission cannot be reentered", "WEBGPU_POINT_SUBMISSION_ACTIVE");
    const structured = [...(command.uniforms?.entries() ?? [])].filter(([, value]) => !isLegacyUniformValue(value));
    if (structured.length) {
      const shader = command.shader ? this.requireShader(command.shader) : undefined;
      if (!shader || shader.nativeUniformLayout !== "portable") {
        throw new RenderDeviceError("Structured uniform data requires a portable WebGPU shader", "WEBGPU_PORTABLE_UNIFORM_VALUE_UNSUPPORTED");
      }
      for (const [name] of structured) {
        const binding = shader.portableBindings.find((candidate) => candidate.name === name);
        if (!binding || isPortableTexture(binding.kind)) {
          throw new RenderDeviceError("Structured uniform data needs a matching numeric portable binding", "WEBGPU_PORTABLE_UNIFORM_VALUE_UNSUPPORTED", { binding: name });
        }
      }
    }
    const proof = this.#nativeDofActive;
    if (proof && proof.phase !== "invalid") {
      if (proof.phase !== "recording" || this.activeRenderTarget !== proof.target || !proof.coverageClear || !this.nativeDofProofCurrent(proof)) {
        proof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field draw is outside its cleared frame", "WEBGPU_DOF_FRAME_STALE");
      }
    }
    const before = this.nativeSubmissions;
    try {
      this.drawInternal(command as DrawCommand);
      if (proof?.phase === "recording" && this.nativeSubmissions === before) throw new RenderDeviceError("Native depth-of-field draw was not submitted", "WEBGPU_DOF_FRAME_STALE");
    }
    catch (error) { if (proof) proof.phase = "invalid"; throw error; }
  }

  private drawInternal(command: DrawCommand, pointCheck?: () => void): void {
    this.assertFrame();
    if (this.nativeForwardBundleActive) throw new RenderDeviceError("Native bundle submission cannot be reentered", "WEBGPU_BUNDLE_SUBMISSION_ACTIVE");
    if (this.vertexConversionCheck) throw new RenderDeviceError("Vertex conversion submission cannot be reentered", "WEBGPU_VERTEX_CONVERSION_ACTIVE");
    if (this.activeRenderTarget?.nativeExtraColors.length) {
      this.requireRenderTarget(this.activeRenderTarget);
      if (!command.shader) throw new RenderDeviceError("MRT drawing requires an explicit native shader", "WEBGPU_MRT_SHADER_UNSUPPORTED");
    }
    if (this.gaussianSplatBorrowedDepth) {
      if (command.renderState?.depthWrite !== false || command.renderState.depthTest !== true) {
        throw new RenderDeviceError("A Gaussian splat draw must test and cannot write its borrowed depth attachment", "GAUSSIAN_SPLAT_DEPTH_WRITE_UNSUPPORTED");
      }
      if (command.renderState.scissor) throw new RenderDeviceError("A Gaussian splat draw cannot override its borrowed view scissor", "GAUSSIAN_SPLAT_SCISSOR_UNSUPPORTED");
      if (command.renderState.stencil) throw new RenderDeviceError("A Gaussian splat draw cannot modify its borrowed stencil attachment", "GAUSSIAN_SPLAT_STENCIL_UNSUPPORTED");
      if (!command.shader) throw new RenderDeviceError("Gaussian splat drawing requires a native shader", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
      const depth = this.gaussianSplatBorrowedDepth.depthTexture;
      if (depth && ([...(command.uniforms?.values() ?? [])].some((value) => isTextureBinding(value) && value.texture === depth)
        || (command.nativeStorageBindings ?? []).some((binding) => binding.kind === "storage-texture" && binding.texture === depth))) {
        throw new RenderDeviceError("A Gaussian splat draw cannot sample its borrowed depth attachment", "WEBGPU_ATTACHMENT_FEEDBACK");
      }
    }
    const sampledTextures = new Set([...(command.uniforms?.values() ?? [])].filter(isTextureBinding).map((binding) => binding.texture).filter((texture): texture is Texture => texture !== null));
    const storageTextures = new Set<Texture>();
    const storageBuffers = new Set<RenderBuffer>();
    for (const binding of command.nativeStorageBindings ?? []) {
      if (binding.kind === "storage-texture") {
        if (sampledTextures.has(binding.texture) || storageTextures.has(binding.texture)) {
          throw new RenderDeviceError("A draw cannot bind the same writable texture more than once", "WEBGPU_STORAGE_FEEDBACK", { name: binding.name });
        }
        storageTextures.add(binding.texture);
      } else {
        if (binding.buffer instanceof WebGPURenderBuffer) {
          this.#pointFrameWrites.delete(binding.buffer);
          this.#pointFrameWriteEpochs.set(binding.buffer, {});
        }
        if (binding.buffer instanceof WebGPURenderBuffer && this.#pointBufferEpochs.has(binding.buffer)) {
          // Conservatively invalidate even a rejected or read-only storage use.
          this.#pointBufferEpochs.set(binding.buffer, {});
        }
        if (storageBuffers.has(binding.buffer) || binding.buffer === command.vertexBuffer || binding.buffer === command.indexBuffer ||
          command.vertexBuffers?.includes(binding.buffer) || command.instanceAttributes?.some((attribute) => attribute.buffer === binding.buffer)) {
          throw new RenderDeviceError("A draw cannot combine writable storage and vertex or index access to the same buffer", "WEBGPU_STORAGE_FEEDBACK", { name: binding.name });
        }
        storageBuffers.add(binding.buffer);
      }
    }
    if (this.activeRenderTarget) {
      const target = this.activeRenderTarget;
      const readTextures = [
        ...[...(command.uniforms?.values() ?? [])].filter(isTextureBinding).map((binding) => binding.texture),
        ...(command.nativeStorageBindings ?? []).filter((binding) => binding.kind === "storage-texture").map((binding) => binding.texture)
      ];
      if (readTextures.some((texture) => texture && ((target.colorTextures ?? [target.colorTexture]).includes(texture) || texture === target.depthTexture || texture === target.multisampledDepthTexture))) {
        throw new RenderDeviceError("A draw cannot sample a texture attached for writing in the same pass", "WEBGPU_ATTACHMENT_FEEDBACK", { label: command.label });
      }
    }
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    if (vertexBuffer.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed vertex buffer", "DISPOSED_RESOURCE", {
        bufferId: command.vertexBuffer.id
      });
    }
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      if (indexBuffer.disposed) {
        throw new RenderDeviceError("Cannot draw with a disposed index buffer", "DISPOSED_RESOURCE", {
          bufferId: command.indexBuffer.id
        });
      }
    }
    for (const buffer of command.vertexBuffers ?? []) if (buffer) this.requireBuffer(buffer);
    for (const attribute of command.instanceAttributes ?? []) this.requireBuffer(attribute.buffer);
    if (command.shader) {
      const shader = this.requireShader(command.shader);
      if (shader.generatedUnlit?.primitive === "points" && !pointCheck) {
        throw new RenderDeviceError("Native point drawing requires a validated quad lease and depth path", "WEBGPU_POINT_LEASE_UNAVAILABLE");
      }
      if (shader.generatedUnlit && shader.generatedUnlit.primitive !== "points" && command.topology !== shader.generatedUnlit.primitive) {
        throw new RenderDeviceError("Generated unlit topology does not match its selected program", "WEBGPU_UNLIT_TOPOLOGY_MISMATCH", { expected: shader.generatedUnlit.primitive, actual: command.topology });
      }
    }
    if (!Number.isSafeInteger(command.vertexCount) || command.vertexCount <= 0 || command.vertexCount > 0xffffffff) {
      throw new RenderDeviceError("Draw command must have a positive vertex count", "INVALID_DRAW_COMMAND", {
        vertexCount: command.vertexCount,
        label: command.label
      });
    }
    if (command.firstVertex !== undefined && (!Number.isSafeInteger(command.firstVertex) || command.firstVertex < 0 || command.firstVertex > 0xffffffff)) {
      throw new RenderDeviceError("Draw command firstVertex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstVertex: command.firstVertex,
        label: command.label
      });
    }
    if (command.indexBuffer && (!Number.isSafeInteger(command.indexCount) || command.indexCount! <= 0 || command.indexCount! > 0xffffffff)) {
      throw new RenderDeviceError("Indexed draw command must have a positive index count", "INVALID_DRAW_COMMAND", {
        indexCount: command.indexCount,
        label: command.label
      });
    }
    if (command.firstIndex !== undefined && (!Number.isSafeInteger(command.firstIndex) || command.firstIndex < 0 || command.firstIndex > 0xffffffff)) {
      throw new RenderDeviceError("Draw command firstIndex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstIndex: command.firstIndex,
        label: command.label
      });
    }
    if (command.instanceCount !== undefined && (!Number.isSafeInteger(command.instanceCount) || command.instanceCount <= 0 || command.instanceCount > 0xffffffff)) {
      throw new RenderDeviceError("Draw command instanceCount must be a positive integer", "INVALID_DRAW_COMMAND", {
        instanceCount: command.instanceCount,
        label: command.label
      });
    }
    const submissionsBefore = this.nativeSubmissions;
    this.withVertexConversionPins(command, () => this.submitNativeRenderPass(command, vertexBuffer, pointCheck));
    if (this.gaussianSplatBorrowedDepth && this.nativeSubmissions === submissionsBefore) {
      throw new RenderDeviceError("WebGPU Gaussian splat draw could not be submitted", "GAUSSIAN_SPLAT_NATIVE_UNAVAILABLE");
    }
    this.drawCalls += 1;
  }

  /** Queue a checked forward point snapshot. Depth and shadow paths remain separate. */
  drawNativePointQuads(command: DrawCommand, context: NativePointQuadSubmission): void {
    if (this.#pointSubmissionActive) throw new RenderDeviceError("Point submission cannot be reentered", "WEBGPU_POINT_SUBMISSION_ACTIVE");
    withNativePointQuadLease(context.lease, () => {
      this.#pointSubmissionActive = true;
      try {
        const check = this.pointSubmissionCheck(command, context);
        check();
        for (const buffer of command.vertexBuffers ?? [command.vertexBuffer]) if (buffer) this.#pointPinnedHandles.add(nativeBufferHandle(this.requireBuffer(buffer)));
        this.#pointPinnedHandles.add(nativeBufferHandle(this.requireBuffer(command.vertexBuffer)));
        this.#pointPinnedHandles.add(nativeBufferHandle(this.uniformBufferBindings.get(0)!));
        const before = this.nativeDrawReceipts.get(command) ?? 0;
        this.drawInternal(command, check);
        if ((this.nativeDrawReceipts.get(command) ?? 0) === before) throw new RenderDeviceError("WebGPU point draw could not be submitted", "WEBGPU_DRAW_UNAVAILABLE");
      } finally {
        this.#pointPinnedHandles.clear();
        this.#pointSubmissionActive = false;
        const deferred = [...this.#pointDeferredRetirements];
        this.#pointDeferredRetirements.clear();
        for (const handle of deferred) this.retireNative(handle);
      }
    });
  }

  private pointSubmissionCheck(command: DrawCommand, context: NativePointQuadSubmission): () => void {
    this.assertFrame();
    const item = context.item, source = item.geometry, range = { ...context.range }, viewport = context.viewport;
    const shader = command.shader ? this.requireShader(command.shader) : undefined;
    const proof = shader && this.#pointShaders.get(shader);
    const material = item.material;
    const base = material instanceof MaterialInstance ? material.baseMaterial : material;
    if (!shader || !proof || !material || !base || Object.getPrototypeOf(base) !== UnlitMaterial.prototype
      || (material instanceof MaterialInstance && Object.getPrototypeOf(material) !== MaterialInstance.prototype)) {
      throw new RenderDeviceError("Point submission requires its generated shader and built-in unlit material", "WEBGPU_POINT_PROGRAM_INVALID");
    }
    const frame = this.uniformBufferBindings.get(0);
    const frameWrite = frame && this.#pointFrameWrites.get(frame);
    if (!frame || !frameWrite || this.#pointFrameWriteEpochs.get(frame) !== frameWrite.epoch || this.nativeExposedBuffers.has(frame)) {
      throw new RenderDeviceError("Point frame uniform lacks a successful private write", "WEBGPU_POINT_FRAME_STALE");
    }
    const frameHeight = new DataView(frameWrite.bytes.buffer, frameWrite.bytes.byteOffset, frameWrite.bytes.byteLength).getFloat32(276, true);
    const uniforms = command.uniforms;
    const packed = packGeneratedUnlitMaterialUniforms(uniforms ?? new Map(), proof.program.packedLoopColor);
    const state = JSON.stringify(command.renderState ?? null);
    const textures = proof.program.resources.map(resource => {
      const binding = uniforms?.get(resource.uniform);
      return { name: resource.uniform, binding, texture: isTextureBinding(binding) ? binding.texture : null,
        revision: isTextureBinding(binding) ? binding.texture?.revision : undefined };
    });
    const equal = (a: unknown, b: unknown): boolean => {
      if (a === b) return true;
      if ((Array.isArray(a) || ArrayBuffer.isView(a)) && (Array.isArray(b) || ArrayBuffer.isView(b)) && !(a instanceof DataView) && !(b instanceof DataView)) {
        const left = Array.from(a as ArrayLike<number>), right = Array.from(b as ArrayLike<number>);
        return left.length === right.length && left.every((value, index) => value === right[index]);
      }
      return false;
    };
    const check = (): void => {
      this.assertFrame();
      this.assertNativePointViewport(viewport);
      assertNativePointQuadSubmission(context.lease, this, command, source, range);
      if (context.item !== item || item.geometry !== source || item.material !== material || context.viewport !== viewport
        || context.range.start !== range.start || context.range.count !== range.count || source.morphTargets?.length
        || item.skinning || item.morphTargets || item.morphWeights || item.instanceTransforms || item.instanceColors || item.instanceAttributes
        || source.vertexBuffer.format.attributes.some(attribute => /joint|weight|morph/i.test(`${attribute.semantic}:${attribute.shaderName}`))
        || (item.instanceCount !== undefined && item.instanceCount !== 1)) {
        throw new RenderDeviceError("Point source uses unsupported deformation or instancing", "WEBGPU_POINT_SOURCE_UNSUPPORTED");
      }
      const available = source.indexBuffer?.count ?? source.vertexBuffer.vertexCount;
      const authored = source.drawRange;
      const start = authored ? Math.max(0, authored.start) : 0;
      const end = authored ? Math.min(available, Math.max(start, start + Math.max(0, authored.count))) : available;
      const selectedStart = item.drawRange ? Math.max(start, item.drawRange.start) : start;
      const selectedEnd = item.drawRange ? Math.min(end, item.drawRange.start + item.drawRange.count) : end;
      if ((item.drawRange && (!Number.isSafeInteger(item.drawRange.start) || !Number.isSafeInteger(item.drawRange.count)
          || item.drawRange.start < 0 || item.drawRange.count <= 0 || item.drawRange.start + item.drawRange.count > available))
        || !Number.isSafeInteger(selectedStart) || !Number.isSafeInteger(selectedEnd)
        || selectedStart !== range.start || selectedEnd - selectedStart !== range.count) {
        throw new RenderDeviceError("Point source draw range changed", "WEBGPU_POINT_RANGE_STALE");
      }
      if (command.shader !== shader || this.requireShader(shader) !== shader || shader.generatedUnlit !== proof.program
        || shader.nativeUniformLayout !== "generated-program-unlit" || shader.entryPoints[0] !== "vs_main" || shader.entryPoints[1] !== "fs_main"
        || shader.generatedPbr || shader.nativeColorDefaultVertex || shader.nativeAtlasVertex
        || JSON.stringify(proof.program) !== proof.fingerprint || shader.modules.length !== proof.modules.length
        || shader.modules.some((module, index) => module !== proof.modules[index])) {
        throw new RenderDeviceError("Point shader provenance changed", "WEBGPU_POINT_PROGRAM_INVALID");
      }
      if (this.uniformBufferBindings.get(0) !== frame || this.#pointFrameWrites.get(frame) !== frameWrite
        || this.#pointFrameWriteEpochs.get(frame) !== frameWrite.epoch || this.nativeExposedBuffers.has(frame)
        || this.requireBuffer(frame) !== frame || frameHeight !== Math.fround(viewport.targetHeight)) {
        throw new RenderDeviceError("Point frame uniform is stale or has the wrong target height", "WEBGPU_POINT_FRAME_STALE");
      }
      const point = proof.program.point!;
      const size = material.getParameter("u_pointSize"), attenuation = material.getParameter("u_pointSizeAttenuation"), round = material.getParameter("u_roundPoints");
      const map = material.getParameter("u_pointMap"), sprite = material.getParameter("u_spriteMode");
      const alpha = material.getParameter("u_alphaCutoff");
      const color = material.getParameter("u_baseColor");
      const uv = uniforms?.get("u_a3dPointViewport");
      const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      const matrixMatches = (name: string, value: readonly number[] | Float32Array | undefined): boolean => {
        const actual = uniforms?.get(name) ?? identity;
        if (!Array.isArray(actual) && !(actual instanceof Float32Array)) return false;
        const expected = value ?? identity;
        return actual.length === 16 && expected.length === 16
          && Array.from(actual).every((entry, index) => Number.isFinite(entry) && Math.fround(entry) === Math.fround(expected[index]!));
      };
      if (base.disposed || typeof size !== "number" || (attenuation !== 0 && attenuation !== 1) || (round !== 0 && round !== 1)
        || (sprite !== undefined && sprite !== 0) || point.attenuated !== (attenuation === 1) || point.round !== (round === 1)
        || point.mapped !== isTextureBinding(map) || !equal(uniforms?.get("u_pointSize"), size)
        || !equal(uniforms?.get("u_pointSizeAttenuation"), attenuation) || !equal(uniforms?.get("u_roundPoints"), round)
        || !equal(uniforms?.get("u_pointMap"), map) || !equal(uniforms?.get("u_alphaCutoff"), alpha) || !equal(uniforms?.get("u_baseColor"), color)
        || !equal(uv, [viewport.width, viewport.height]) || !matrixMatches("u_modelMatrix", item.modelMatrix)
        || !matrixMatches("u_geometryMatrix", item.geometryMatrix)
        || (point.mapped && (!isTextureBinding(map) || !map.texture || !map.validate().ok))) {
        throw new RenderDeviceError("Point material or raster uniforms do not match the selected shader", "WEBGPU_POINT_MATERIAL_STALE");
      }
      const blend = base.renderState.blend || (base.renderState.blendMode !== undefined && base.renderState.blendMode !== "opaque");
      const commandBlend = command.renderState?.blend === true || (command.renderState?.blendMode !== undefined && command.renderState.blendMode !== "opaque");
      const alphaMode = blend ? "blend" : typeof alpha === "number" && alpha > 0 ? "mask" : "opaque";
      const colorAttribute = source.vertexBuffer.format.attributes.some(attribute => attribute.shaderName === "a_color" || attribute.semantic === "color");
      if (proof.alphaMode !== alphaMode || commandBlend !== blend || proof.vertexColors !== (base.requiredAttributes.includes("a_color") && colorAttribute)
        || JSON.stringify(command.renderState ?? null) !== state
        || JSON.stringify({ ...base.renderState, cullMode: "none" }) !== state || command.renderState?.scissor) {
        throw new RenderDeviceError("Point material features or render state changed", "WEBGPU_POINT_MATERIAL_STALE");
      }
      validateNativePointRasterInputs({ size, targetHeight: viewport.targetHeight, viewportWidth: viewport.width, viewportHeight: viewport.height, attenuated: point.attenuated });
      const currentPacked = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map(), proof.program.packedLoopColor);
      if (currentPacked.length !== packed.length || currentPacked.some((byte, index) => byte !== packed[index])
        || textures.some(entry => command.uniforms?.get(entry.name) !== entry.binding || entry.texture?.disposed || entry.texture?.revision !== entry.revision)) {
        throw new RenderDeviceError("Point draw material changed during encoding", "WEBGPU_POINT_MATERIAL_STALE");
      }
    };
    return check;
  }

  /** Capture may publish its target only after this particular draw was queued. */
  drawTransmissionCapture(command: DrawCommand): void {
    this.drawChecked(command);
  }

  /** Verify the command itself was encoded and queued, not merely accepted. */
  drawChecked(command: DrawCommand): void {
    const before = this.nativeDrawReceipts.get(command) ?? 0;
    this.draw(command);
    if ((this.nativeDrawReceipts.get(command) ?? 0) === before) throw new RenderDeviceError("WebGPU draw could not be submitted", "WEBGPU_DRAW_UNAVAILABLE");
  }

  async waitForSubmittedWork(): Promise<void> {
    this.assertAlive();
    if (!this.device.queue.onSubmittedWorkDone) {
      throw new RenderDeviceError("Native GPU queue completion is unavailable", "GPU_COMPLETION_UNAVAILABLE");
    }
    await this.device.queue.onSubmittedWorkDone();
  }

  endFrame(): void {
    this.assertFrame();
    this.assertOutsideMrtSubmission();
    this.assertOutsideGaussianSplatDraw();
    if (this.#nativeDofActive) { this.#nativeDofActive.phase = "invalid"; this.#nativeDofActive = null; }
    this.frameToken = null;
    this.frameActive = false;
    this.resourceInterop.submit([]);
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["frameActive", this.frameActive],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["renderTarget", this.activeRenderTarget?.label ?? null],
      ["presentationFormat", this.presentationFormat],
      ["drawCalls", this.drawCalls],
      ["nativeSubmissions", this.nativeSubmissions],
      ["nativeRenderPipelinesCreated", this.nativeRenderPipelinesCreated],
      ["nativeRenderPasses", this.nativeRenderPasses],
      ["nativeForwardBundleExecutions", this.nativeForwardBundleExecutions],
      ["nativeTextureUploads", this.nativeTextureUploads],
      ["nativeTextureReadbacks", this.nativeTextureReadbacks],
      ["nativeTextureBindings", this.nativeTextureBindings],
      ["nativeGeneratedBasicSubmissions", this.nativeGeneratedBasicSubmissions],
      ["nativeGeneratedTextureSubmissions", this.nativeGeneratedTextureSubmissions],
      ["nativePassthroughSubmissions", this.nativePassthroughSubmissions],
      ["nativePbrSubmissions", this.nativePbrSubmissions],
      ["nativeInstancedSubmissions", this.nativeInstancedSubmissions],
      ["nativeSkinnedSubmissions", this.nativeSkinnedSubmissions],
      ["nativeMorphSubmissions", this.nativeMorphSubmissions],
      ["nativeEnvironmentBindings", this.nativeEnvironmentBindings],
      ["nativeShadowMapBindings", this.nativeShadowMapBindings],
      ["nativeBloomPasses", this.nativeBloomPasses],
      ["nativeColorGradePasses", this.nativeColorGradePasses],
      ["nativeFxaaPasses", this.nativeFxaaPasses],
      ["nativeSsaoPasses", this.nativeSsaoPasses],
      ["nativeAmbientOcclusionPasses", this.nativeAmbientOcclusionPasses],
      ["nativeSsrPasses", this.nativeSsrPasses],
      ["nativeTaaPasses", this.nativeTaaPasses],
      ["nativeTemporalBindings", this.nativeTemporalBindings],
      ["nativeDepthStagePasses", this.nativeDepthStagePasses],
      ["canvasSubmissions", this.canvasSubmissions]
    ]);
  }

  getLiveTextures(): readonly Texture[] {
    const live = new Set<Texture>();
    for (const target of this.renderTargets) {
      if (target.disposed) continue;
      const colors = target.colorTextures ?? [target.colorTexture];
      for (const texture of [...colors, target.depthTexture]) if (texture && !texture.disposed) live.add(texture);
    }
    for (const texture of this.nativeSampledTextures.keys()) if (!texture.disposed) live.add(texture);
    return [...live];
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const sampledTextures = [...this.nativeSampledTextures.keys()].filter((texture) => !texture.disposed);
    const fallbackCount = this.nativeFallbackTextures.size;
    const fallbackBytes = sampledTextures.reduce((total, texture) => total + (this.nativeCompressedFallbackBytes.get(texture) ?? 0), 0);
    // The ledger retains charges for fence-retired allocations until native
    // destruction, including a replacement coexisting with its predecessor.
    const textureBytes = textureBudgetReport(this).textureBytes;
    return {
      drawCalls: this.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      maxRenderTargetSampleCount: Math.max(1, ...liveRenderTargets.map((target) => target.sampleCount)),
      textures: liveRenderTargets.reduce((total, target) => total + (target.colorTextures?.length ?? 1), 0) + sampledTextures.length + fallbackCount,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: sampledTextures.filter((texture) => isCompressedTextureFormat(texture.format) && !this.nativeCompressedFallbackBytes.has(texture)).length,
      compressedTextureBytes: sampledTextures.filter((texture) => isCompressedTextureFormat(texture.format) && !this.nativeCompressedFallbackBytes.has(texture)).reduce((total, texture) => total + (this.nativeBudgetedTextures.get(texture) ?? texture).byteLength, 0),
      textureFallbacks: sampledTextures.filter((texture) => this.nativeCompressedFallbackBytes.has(texture)).length,
      textureFallbackBytes: fallbackBytes,
      disposedBuffers: this.disposedBufferCount,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: this.disposedRenderTargets,
      disposedTextures: this.disposedSampledTextures + this.disposedRenderTargetTextures,
      ...spreadGpuTargetInventory(
        liveRenderTargets.flatMap((target) => [...(target.colorTextures ?? [target.colorTexture]).map((color, index) => ({
          label: index === 0 ? target.label : `${target.label}-color-${index}`,
          kind: "render-target" as const,
          bytes: color.byteLength,
          owner: resolveGpuTargetOwner(target.label)
        })), ...(target.hasDepth ? [{
          label: `${target.label}-depth-estimate-4-bytes-per-sample`, kind: "render-target" as const,
          bytes: target.width * target.height * 4 * target.sampleCount,
          owner: resolveGpuTargetOwner(target.label)
        }] : []), ...(target.sampleCount > 1 ? (target.colorTextures ?? [target.colorTexture]).map((color, index) => ({
          label: index === 0 ? `${target.label}-multisample-color` : `${target.label}-color-${index}-multisample-color`,
          kind: "render-target" as const,
          bytes: target.width * target.height * bytesPerPixel(color.format) * target.sampleCount,
          owner: resolveGpuTargetOwner(target.label)
        })) : [])])
      ),
      nativeSubmissions: this.nativeSubmissions,
      nativeRenderPipelinesCreated: this.nativeRenderPipelinesCreated,
      nativeRenderPasses: this.nativeRenderPasses,
      nativeTextureUploads: this.nativeTextureUploads,
      nativeTextureReadbacks: this.nativeTextureReadbacks,
      nativeTextureBindings: this.nativeTextureBindings,
      nativeGeneratedBasicSubmissions: this.nativeGeneratedBasicSubmissions,
      nativeGeneratedTextureSubmissions: this.nativeGeneratedTextureSubmissions,
      nativePassthroughSubmissions: this.nativePassthroughSubmissions,
      nativePbrSubmissions: this.nativePbrSubmissions,
      nativeInstancedSubmissions: this.nativeInstancedSubmissions,
      nativeSkinnedSubmissions: this.nativeSkinnedSubmissions,
      nativeMorphSubmissions: this.nativeMorphSubmissions,
      nativeEnvironmentBindings: this.nativeEnvironmentBindings,
      nativeShadowMapBindings: this.nativeShadowMapBindings,
      nativeBloomPasses: this.nativeBloomPasses,
      nativeColorGradePasses: this.nativeColorGradePasses,
      nativeFxaaPasses: this.nativeFxaaPasses,
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  /**
   * muse3jsparity-PRD J2 — native WebGPU bloom pyramid.
   *
   * Renders bright-extract -> separable-blur mip pyramid -> composite over
   * the source, all as real WGSL fullscreen passes on this device. Returns a
   * fresh rgba16f target owned by the caller (dispose it); every intermediate
   * is disposed before return. Throws fail-closed when the native device
   * cannot run fullscreen passes.
   */
  /**
   * The WebGL2 v2 bloom (LegacyPost `executeNativeBloomPyramidPasses` / `executeNativeBloomPasses` with the `excess`
   * options) on native targets: full-resolution excess prefilter, then either the single-scale blur (performance) or
   * the box-downsampled pyramid with the §6.6 widening kernels and spread weights, summed at level-0 size, and the
   * HDR composite `scene + bloom × intensity`. Same math and pass order, so the halo matches the default backend.
   */
  private executeNativeWebGPUBloomV2(source: RenderTarget, options: Readonly<Record<string, unknown>>, protectP3Inputs: boolean): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const request = normalizeWebGPUBloomV2Options(options);
    const src = this.requireRenderTarget(source);
    const srcView = src.nativeView;
    if (!srcView) throw new RenderDeviceError("WebGPU bloom source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    const width = src.width, height = src.height;
    const owned: RenderTarget[] = [];
    const track = (target: RenderTarget): RenderTarget => { owned.push(target); return target; };
    const viewOf = (target: RenderTarget): unknown => {
      const view = this.requireRenderTarget(target).nativeView;
      if (!view) throw new RenderDeviceError("WebGPU bloom target has no native view", "NATIVE_POST_UNSUPPORTED", { label: target.label });
      return view;
    };
    const protectPass = (inputs: readonly RenderTarget[], output: RenderTarget) => {
      if (!protectP3Inputs) return {};
      const inputNatives = inputs.map(input => this.requireP3ResolvedColor(input, true));
      const outputNative = this.requireP3ResolvedColor(output, false);
      if (inputNatives.includes(outputNative)) throw new RenderDeviceError("Bloom input and output alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      return {
        accesses: [...inputNatives.map(resource => ({ resource, mode: "read" as const })), { resource: outputNative, mode: "write" as const }],
        protectedSubmission: true,
        beforeSubmit: () => {
          if (inputs.some((input, index) => this.requireP3ResolvedColor(input, true) !== inputNatives[index]) ||
              this.requireP3ResolvedColor(output, false) !== outputNative) {
            throw new RenderDeviceError("Display-P3 bloom resources changed before submission", "WEBGPU_PRESENTATION_STALE");
          }
        }
      };
    };
    const pass = (label: string, fragment: string, entryPoint: string, uniforms: Float32Array, inputs: readonly RenderTarget[], target: RenderTarget): void => {
      this.runWebGPUFullscreenPass({ label, fragment, entryPoint, uniforms, views: inputs.map(viewOf), target, ...protectPass(inputs, target) });
    };
    const blur = (input: RenderTarget, w: number, h: number, radius: number, label: string): RenderTarget => {
      const scratch = track(this.createRenderTarget({ width: w, height: h, format: "rgba16f", label: `${label}-h` }));
      const out = track(this.createRenderTarget({ width: w, height: h, format: "rgba16f", label: `${label}-v` }));
      pass(`${label}-h`, WEBGPU_BLOOM_V2_BLUR_FRAGMENT, "fs_bloom_blur", new Float32Array([1, 0, radius, 0]), [input], scratch);
      pass(`${label}-v`, WEBGPU_BLOOM_V2_BLUR_FRAGMENT, "fs_bloom_blur", new Float32Array([0, 1, radius, 0]), [scratch], out);
      return out;
    };
    try {
      const extracted = track(this.createRenderTarget({ width, height, format: "rgba16f", label: "a3d-webgpu-bloom-v2-extract" }));
      pass("webgpu-bloom-v2-prefilter", WEBGPU_BLOOM_V2_PREFILTER_FRAGMENT, "fs_bloom_prefilter",
        new Float32Array([request.threshold, request.softKnee, 0, 0]), [src], extracted);
      let bloom: RenderTarget;
      let mipCount = 1;
      let passes = 1;
      if (request.quality === "performance") {
        bloom = blur(extracted, width, height, request.radius, "webgpu-bloom-v2-blur");
        passes += 2;
      } else {
        const plan = resolveBloomPyramidPlan(width, height, request.quality, true);
        const response = resolveBloomPyramidV2Response(plan, request.spread);
        mipCount = plan.mips.length;
        const mips: RenderTarget[] = [];
        let previous = extracted, previousWidth = width, previousHeight = height;
        for (let level = 0; level < mipCount; level += 1) {
          const size = plan.mips[level]!;
          const down = track(this.createRenderTarget({ width: size.width, height: size.height, format: "rgba16f", label: `a3d-webgpu-bloom-v2-mip${level}` }));
          pass(`webgpu-bloom-v2-down${level}`, WEBGPU_BLOOM_V2_DOWNSAMPLE_FRAGMENT, "fs_bloom_downsample",
            new Float32Array([1 / previousWidth, 1 / previousHeight, size.width, size.height]), [previous], down);
          const blurred = blur(down, size.width, size.height, response.blurRadii[level]!, `webgpu-bloom-v2-mip${level}`);
          mips.push(blurred);
          previous = blurred; previousWidth = size.width; previousHeight = size.height;
          passes += 3;
        }
        const level0 = plan.mips[0]!;
        bloom = track(this.createRenderTarget({ width: level0.width, height: level0.height, format: "rgba16f", label: "a3d-webgpu-bloom-v2-sum" }));
        const weights = new Float32Array(8);
        for (let level = 0; level < 5; level += 1) weights[level] = level < mipCount ? response.weights[level]! : 0;
        pass("webgpu-bloom-v2-accumulate", WEBGPU_BLOOM_V2_ACCUMULATE_FRAGMENT, "fs_bloom_accumulate", weights,
          Array.from({ length: 5 }, (_, level) => mips[level < mipCount ? level : 0]!), bloom);
        passes += 1;
      }
      const composite = track(this.createRenderTarget({ width, height, format: "rgba16f", label: "a3d-webgpu-bloom-composite" }));
      pass("webgpu-bloom-v2-composite", WEBGPU_BLOOM_V2_COMPOSITE_FRAGMENT, "fs_bloom_composite",
        new Float32Array([request.intensity, 0, 0, 0]), [src, bloom], composite);
      passes += 1;
      this.lastWebGPUBloom = { mipCount, halfFloat: true, targetBytes: owned.reduce((total, target) => total + target.width * target.height * 8, 0),
        compositeGain: request.intensity, passes, executionMode: "webgpu-native-post" };
      this.nativeBloomPasses += passes;
      for (const target of owned) if (target !== composite) target.dispose();
      return composite;
    } catch (error) {
      for (const target of owned) target.dispose();
      throw error;
    }
  }

  executeWebGPUBloom(source: RenderTarget, options: WebGPUBloomOptions = {}): RenderTarget {
    return this.executeNativeWebGPUBloom(source, options, false);
  }

  private executeNativeWebGPUBloom(source: RenderTarget, options: WebGPUBloomOptions, protectP3Inputs: boolean): RenderTarget {
    // A v2-stamped pass (postprocess.v2) runs the WebGL2 v2 bloom: its option names (intensity, knee, spread) and
    // response differ from this J2 chain's (strength, knee width), which otherwise read as defaults (strength 0.6).
    if (isWebGPUBloomV2(options)) return this.executeNativeWebGPUBloomV2(source, options as unknown as Readonly<Record<string, unknown>>, protectP3Inputs);
    this.reclaimWebGPUPostUniformBuffers();
    const normalized = normalizeWebGPUBloomOptions(options);
    const src = this.requireRenderTarget(source);
    const srcView = src.nativeView;
    if (!srcView) {
      throw new RenderDeviceError("WebGPU bloom source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    }
    const width = src.width;
    const height = src.height;
    // Preserve HDR source energy even at performance quality. Bloom adds to
    // scene radiance before tone mapping, so its composite is always floating point.
    const halfFloat = normalized.halfFloat || src.colorTexture.format === "rgba16f" || src.colorTexture.format === "rgba32f";
    const mipFormat = halfFloat ? "rgba16f" : "rgba8";
    const owned: RenderTarget[] = [];
    const track = (target: RenderTarget): RenderTarget => {
      owned.push(target);
      return target;
    };
    const protectPass = (inputs: readonly RenderTarget[], output: RenderTarget) => {
      if (!protectP3Inputs) return {};
      const inputNatives = inputs.map(input => this.requireP3ResolvedColor(input, true));
      const outputNative = this.requireP3ResolvedColor(output, false);
      if (inputNatives.includes(outputNative)) throw new RenderDeviceError("Bloom input and output alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      return {
        accesses: [...inputNatives.map(resource => ({ resource, mode: "read" as const })), { resource: outputNative, mode: "write" as const }],
        protectedSubmission: true,
        beforeSubmit: () => {
          if (inputs.some((input, index) => this.requireP3ResolvedColor(input, true) !== inputNatives[index]) ||
              this.requireP3ResolvedColor(output, false) !== outputNative) {
            throw new RenderDeviceError("Display-P3 bloom resources changed before submission", "WEBGPU_PRESENTATION_STALE");
          }
        }
      };
    };
    try {
      const bright = track(this.createRenderTarget({ width, height, format: mipFormat, label: "a3d-webgpu-bloom-bright" }));
      this.runWebGPUFullscreenPass({
        label: "webgpu-bloom-bright",
        fragment: webgpuBrightExtractFragment(),
        entryPoint: "fs_bright",
        uniforms: new Float32Array([normalized.threshold, normalized.knee, normalized.strength, 0]),
        views: [srcView],
        target: bright,
        ...protectPass([src], bright)
      });
      const mips: RenderTarget[] = [];
      let level: RenderTarget = bright;
      let levelWidth = width;
      let levelHeight = height;
      for (let mip = 0; mip < normalized.mipCount; mip += 1) {
        levelWidth = Math.max(1, levelWidth >> 1);
        levelHeight = Math.max(1, levelHeight >> 1);
        const scratch = track(this.createRenderTarget({ width: levelWidth, height: levelHeight, format: mipFormat, label: `a3d-webgpu-bloom-mip${mip}-scratch` }));
        const mipTarget = track(this.createRenderTarget({ width: levelWidth, height: levelHeight, format: mipFormat, label: `a3d-webgpu-bloom-mip${mip}` }));
        const levelView = this.requireRenderTarget(level).nativeView;
        const scratchView = this.requireRenderTarget(scratch).nativeView;
        if (!levelView || !scratchView) {
          throw new RenderDeviceError("WebGPU bloom pyramid target has no native view", "NATIVE_POST_UNSUPPORTED", { mip });
        }
        this.runWebGPUFullscreenPass({
          label: `webgpu-bloom-mip${mip}-h`,
          fragment: webgpuBlurFragment(),
          entryPoint: "fs_blur",
          uniforms: new Float32Array([1, 0, 1 / levelWidth, 1 / levelHeight]),
          views: [levelView],
          target: scratch,
          ...protectPass([level], scratch)
        });
        this.runWebGPUFullscreenPass({
          label: `webgpu-bloom-mip${mip}-v`,
          fragment: webgpuBlurFragment(),
          entryPoint: "fs_blur",
          uniforms: new Float32Array([0, 1, 1 / levelWidth, 1 / levelHeight]),
          views: [scratchView],
          target: mipTarget,
          ...protectPass([scratch], mipTarget)
        });
        mips.push(mipTarget);
        level = mipTarget;
      }
      const weights = defaultWebGPUBloomWeights(normalized.mipCount);
      const composite = track(this.createRenderTarget({ width, height, format: "rgba16f", label: "a3d-webgpu-bloom-composite" }));
      const mipViews = mips.map((mipTarget) => {
        const view = this.requireRenderTarget(mipTarget).nativeView;
        if (!view) throw new RenderDeviceError("WebGPU bloom mip has no native view", "NATIVE_POST_UNSUPPORTED", {});
        return view;
      });
      this.runWebGPUFullscreenPass({
        label: "webgpu-bloom-composite",
        fragment: webgpuBloomCompositeFragment({ weights, strength: normalized.strength }),
        entryPoint: "fs_composite",
        uniforms: new Float32Array([normalized.strength, 0, 0, 0]),
        views: [srcView, ...mipViews],
        target: composite,
        ...protectPass([src, ...mips], composite)
      });
      const bytesPerPixel = halfFloat ? 8 : 4;
      const targetBytes = width * height * bytesPerPixel
        + mips.reduce((total, mipTarget) => total + mipTarget.width * mipTarget.height * bytesPerPixel * 2, 0)
        + width * height * 8;
      this.lastWebGPUBloom = {
        mipCount: normalized.mipCount,
        halfFloat,
        targetBytes,
        compositeGain: normalized.strength,
        passes: 1 + normalized.mipCount * 2 + 1,
        executionMode: "webgpu-native-post"
      };
      this.nativeBloomPasses += this.lastWebGPUBloom.passes;
      for (const target of owned) {
        if (target !== composite) target.dispose();
      }
      return composite;
    } catch (error) {
      for (const target of owned) target.dispose();
      throw error;
    }
  }

  /** Last native bloom run on this device (null before the first run). */
  getWebGPUBloomDiagnostics(): WebGPUBloomDiagnostics | null {
    return this.lastWebGPUBloom;
  }

  /**
   * Drains GPU validation errors observed by the native post passes.
   * Empty means every submitted post pass validated clean.
   */
  async drainWebGPUPostErrors(): Promise<readonly string[]> {
    await Promise.all([...this.webgpuPostErrorScopePending]);
    const errors = [...this.webgpuPostErrors].map(([message, count]) => count === 1 ? message : `${message} (${count} occurrences)`);
    if (this.webgpuPostOtherErrors) errors.push(`${this.webgpuPostOtherErrors} additional post validation errors`);
    this.webgpuPostErrors.clear();
    this.webgpuPostOtherErrors = 0;
    return errors;
  }

  /**
   * muse3jsparity-PRD J2 — native WebGPU color grade.
   * Exposure (stops) -> saturation around luma -> contrast around middle
   * gray, one WGSL fullscreen pass into a fresh caller-owned rgba8 target.
   */
  /** The v2 S10 linear grade on an HDR target (`WEBGPU_HDR_GRADE_FRAGMENT`); returns a caller-owned target of the source format. */
  private executeWebGPUHdrGrade(source: RenderTarget, grade: NonNullable<WebGPUNativePostPresentationOptions["nativeHdrGrade"]>): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(source);
    if (!src.nativeView) throw new RenderDeviceError("WebGPU HDR grade source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    const format = src.colorTexture.format === "rgba32f" ? "rgba32f" : src.colorTexture.format === "rgba8" ? "rgba8" : "rgba16f";
    const out = this.createRenderTarget({ width: src.width, height: src.height, format, label: "a3d-webgpu-hdr-grade" });
    const rows = [grade.whiteBalance, grade.lift, grade.gamma, grade.gain, grade.shadows, grade.midtones, grade.highlights];
    const uniforms = new Float32Array(28);
    rows.forEach((row, index) => uniforms.set([row[0], row[1], row[2], 0], index * 4));
    try {
      this.runWebGPUFullscreenPass({ label: "webgpu-hdr-grade", fragment: WEBGPU_HDR_GRADE_FRAGMENT, entryPoint: "fs_hdr_grade", uniforms, views: [src.nativeView], target: out });
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  executeWebGPUColorGrade(source: RenderTarget, options: WebGPUColorGradeOptions = {}): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const normalized = normalizeWebGPUColorGradeOptions(options);
    const src = this.requireRenderTarget(source);
    const srcView = src.nativeView;
    if (!srcView) {
      throw new RenderDeviceError("WebGPU color-grade source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    }
    const out = this.createRenderTarget({ width: src.width, height: src.height, format: "rgba8", label: "a3d-webgpu-color-grade" });
    try {
      this.runWebGPUFullscreenPass({
        label: "webgpu-color-grade",
        fragment: webgpuColorGradeFragment(),
        entryPoint: "fs_grade",
        uniforms: new Float32Array([normalized.exposure, normalized.contrast, normalized.saturation, 0]),
        views: [srcView],
        target: out
      });
      this.nativeColorGradePasses += 1;
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  /**
   * W3 — native WebGPU screen-space reflections (`post/shaders/ssr.wgsl.ts`):
   * a half-res trace against the source's sampleable depth attachment, then a
   * full-res additive composite into a fresh caller-owned target of the
   * source's format. `options.webgpuFrame` is the renderer-attached
   * `WebGPUSsrFrame`; the other fields follow the v2 S3 options.
   */
  executeWebGPUSsr(source: RenderTarget, options: Readonly<Record<string, unknown>> = {}, depthSource: RenderTarget = source): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(source);
    // `depthSource` is the scene target when an earlier native stage (S2 AO) already replaced the color with a depthless target.
    const dsrc = this.requireRenderTarget(depthSource);
    const frame = validateWebGPUSsrFrame(options.webgpuFrame);
    const ssr = resolveWebGPUSsrOptions(options);
    // A single-sample source exposes a sampleable depth texture; a 4x source keeps its multisampled attachment.
    const multisampled = (dsrc.sampleCount ?? 1) === 4;
    const depthAlias = multisampled ? dsrc.multisampledDepthTexture : dsrc.depthTexture;
    if (!src.nativeView || !dsrc.nativeDepthTexture || !depthAlias || depthAlias.disposed || ((dsrc.sampleCount ?? 1) !== 1 && !multisampled) ||
        dsrc.width !== src.width || dsrc.height !== src.height) {
      throw new RenderDeviceError("WebGPU SSR requires a source with a sampleable depth attachment", "WEBGPU_SSR_DEPTH_REQUIRED", { label: dsrc.label });
    }
    const format = src.colorTexture.format;
    if (format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f") {
      throw new RenderDeviceError("WebGPU SSR requires an rgba8, rgba16f or rgba32f source", "WEBGPU_SSR_SOURCE_UNSUPPORTED", { format });
    }
    if (format === "rgba32f" && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("WebGPU SSR of rgba32f requires float32-filterable", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
    }
    const depthView = dsrc.nativeDepthTexture.createView({ aspect: "depth-only" });
    const trace = this.createRenderTarget({ width: Math.max(1, Math.ceil(src.width / 2)), height: Math.max(1, Math.ceil(src.height / 2)),
      format: "rgba16f", depth: false, label: "a3d-webgpu-ssr-trace" });
    let out: RenderTarget | undefined;
    try {
      this.runWebGPUFullscreenPass({ label: `webgpu-ssr-trace-${ssr.steps}${multisampled ? "-msaa" : ""}`, fragment: multisampled ? SSR_TRACE_MSAA_WGSL : SSR_TRACE_WGSL, entryPoint: "fs_ssr_trace",
        uniforms: webgpuSsrTraceUniforms(frame, ssr, src.width, src.height), views: [src.nativeView, depthView], target: trace });
      out = this.createRenderTarget({ width: src.width, height: src.height, format, depth: false, label: "a3d-webgpu-ssr" });
      const traceView = this.requireRenderTarget(trace).nativeView;
      this.runWebGPUFullscreenPass({ label: "webgpu-ssr-composite", fragment: SSR_COMPOSITE_WGSL, entryPoint: "fs_ssr_composite",
        uniforms: webgpuSsrCompositeUniforms(ssr), views: [src.nativeView, traceView], target: out });
      this.nativeSsrPasses += 1;
      return out;
    } catch (error) {
      out?.dispose();
      throw error;
    } finally {
      trace.dispose();
    }
  }

  /**
   * muse3jsparity-PRD J2 — native WebGPU FXAA.
   * Compact FXAA 3.11 console core (luma neighborhood, one perpendicular
   * blend tap pair; flat neighborhoods pass through untouched). Temporal
   * antialiasing has a separate GPU history contract in executeWebGPUTaa.
   */
  executeWebGPUFxaa(source: RenderTarget): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(source);
    const srcView = src.nativeView;
    if (!srcView) {
      throw new RenderDeviceError("WebGPU FXAA source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    }
    const out = this.createRenderTarget({ width: src.width, height: src.height, format: "rgba8", label: "a3d-webgpu-fxaa" });
    try {
      this.runWebGPUFullscreenPass({
        label: "webgpu-fxaa",
        fragment: FXAA_NATIVE_INTERMEDIATE_WGSL,
        entryPoint: "fs_fxaa",
        uniforms: new Float32Array([1 / src.width, 1 / src.height, 0, 0]),
        views: [srcView],
        target: out
      });
      this.nativeFxaaPasses += 1;
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  /**
   * Depth-only view of a single-sample hardware depth attachment, for the
   * native ambient-occlusion passes, plus the attachment's encoding.
   */
  private nativeAmbientOcclusionDepth(depthSource: RenderTarget, pass: string, allowMultisampled = false): { readonly view: unknown; readonly reversed: boolean; readonly multisampled: boolean } {
    const target = this.requireRenderTarget(depthSource);
    // A 4x attachment carries TEXTURE_BINDING too; it is read as a multisampled depth texture.
    const multisampled = allowMultisampled && target.sampleCount === 4 && Boolean(target.multisampledDepthTexture && !target.multisampledDepthTexture.disposed);
    if (!target.nativeDepthTexture || (!multisampled && (target.sampleCount !== 1 || !target.depthTexture || target.depthTexture.disposed))) {
      throw new RenderDeviceError(`Native WebGPU ${pass} requires a single-sample sampleable depth attachment`, "WEBGPU_AO_DEPTH_UNAVAILABLE", { pass, label: target.label });
    }
    const mode = this.depthConvention.mode;
    if (mode !== "standard" && mode !== "reversed") {
      throw new RenderDeviceError(`Native WebGPU ${pass} does not decode ${mode} depth`, "WEBGPU_AO_DEPTH_ENCODING_UNSUPPORTED", { pass, mode });
    }
    return { view: target.nativeDepthTexture.createView({ aspect: "depth-only" }), reversed: mode === "reversed", multisampled };
  }

  /** The fused-chain `ssao` pass (WGSL twin of the WebGL2 kernel) on display-space color. */
  executeWebGPUSsao(source: RenderTarget, depthSource: RenderTarget, options: Readonly<Record<string, unknown>> = {}): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    let normalized: ReturnType<typeof normalizeWebGPUSsaoOptions>;
    try { normalized = normalizeWebGPUSsaoOptions(options); }
    catch (error) { throw new RenderDeviceError(error instanceof Error ? error.message : String(error), "INVALID_POSTPROCESS_OPTIONS"); }
    const src = this.requireRenderTarget(source);
    if (!src.nativeView) throw new RenderDeviceError("WebGPU SSAO source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    const depth = this.nativeAmbientOcclusionDepth(depthSource, "ssao");
    if (depthSource.width !== src.width || depthSource.height !== src.height) {
      throw new RenderDeviceError("WebGPU SSAO depth and color sizes differ", "WEBGPU_AO_DEPTH_UNAVAILABLE");
    }
    const out = this.createRenderTarget({ width: src.width, height: src.height, format: nativeAmbientOcclusionFormat(src.colorTexture.format), depth: false, label: "a3d-webgpu-ssao" });
    try {
      this.runWebGPUFullscreenPass({ label: "webgpu-ssao", fragment: WEBGPU_SSAO_FRAGMENT, entryPoint: "fs_ssao",
        uniforms: packWebGPUSsaoUniforms(src.width, src.height, normalized, depth.reversed),
        views: [src.nativeView, depth.view], target: out, textureLoadBindings: true });
      this.nativeSsaoPasses += 1;
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  /**
   * One display stage of the native depth-of-field chain (chromatic aberration
   * on HDR, vignette or finalize on display-referred color). Caller-owned output.
   */
  private executeNativeDofDisplayStage(source: RenderTarget, stage: "ca" | "vignette" | "finalize",
    stages: NativeDofDisplayStages, frameIndex: number): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(source);
    // `nativeView` is the single-sample (resolved) color of a multisampled target, as the other post stages sample it.
    if (!src.nativeView) {
      throw new RenderDeviceError("Native display stage needs a sampleable source", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    }
    this.flushNativeRenderTargetClear(src);
    const format = stage === "ca" && (src.colorTexture.format === "rgba16f" || src.colorTexture.format === "rgba32f") ? src.colorTexture.format : "rgba8";
    const out = this.createRenderTarget({ width: src.width, height: src.height, format, depth: false, label: `a3d-webgpu-dof-${stage}` });
    try {
      let fragment: string, entryPoint: string, uniforms: Float32Array;
      if (stage === "ca") {
        fragment = NATIVE_DOF_CA_WGSL; entryPoint = "fs_dof_ca";
        uniforms = new Float32Array([stages.chromaticAberration?.intensity ?? 0, 0, 0, 0]);
      } else if (stage === "vignette") {
        const v = stages.vignette!;
        fragment = NATIVE_DOF_VIGNETTE_WGSL; entryPoint = "fs_dof_vignette";
        uniforms = new Float32Array([v.intensity, v.smoothness, v.roundness, 0, v.color[0], v.color[1], v.color[2], 0, src.width, src.height, 0, 0]);
      } else {
        const f = stages.finalize!;
        fragment = NATIVE_DOF_FINALIZE_WGSL; entryPoint = "fs_dof_finalize";
        uniforms = new Float32Array([frameIndex, f.grainIntensity, f.grainSize, f.grainLuminanceResponse]);
      }
      this.runWebGPUFullscreenPass({ label: `webgpu-dof-${stage}`, fragment, entryPoint, uniforms, views: [src.nativeView], target: out });
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  /**
   * The v2 S2 GTAO stage on the linear source: linear depth, half-resolution
   * min/max depth, horizon AO, H/V bilateral denoise and the joint-bilateral
   * apply. Returns a caller-owned target in the source's format.
   */
  executeWebGPUAmbientOcclusion(source: RenderTarget, depthSource: RenderTarget, request: NativeAmbientOcclusionRequest,
    frameIndex = 0, diagnosticToken?: PostDiagnosticToken): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(source);
    if (!src.nativeView) throw new RenderDeviceError("WebGPU ambient occlusion source has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    if (depthSource.width !== src.width || depthSource.height !== src.height) {
      throw new RenderDeviceError("WebGPU ambient occlusion depth and color sizes differ", "WEBGPU_AO_DEPTH_UNAVAILABLE");
    }
    const camera = request.camera;
    const projection = Array.from({ length: 16 }, (_value, index) => Number(camera?.projectionMatrix?.[index]));
    if (!camera || projection.some(value => !Number.isFinite(value))) {
      throw new RenderDeviceError("WebGPU ambient occlusion requires the frame projection", "WEBGPU_AO_CAMERA_REQUIRED");
    }
    const inverse = camera.projectionMatrixInverse ? Array.from({ length: 16 }, (_value, index) => Number(camera.projectionMatrixInverse![index])) : invertMat4(projection as unknown as Mat4);
    const options = normalizeWebGPUGtaoOptions(request.options);
    const depth = this.nativeAmbientOcclusionDepth(depthSource, "ambient-occlusion", true);
    let linearUniforms: Float32Array, gtaoUniforms: Float32Array;
    try {
      linearUniforms = packWebGPUAoLinearDepthUniforms({ near: camera.near, far: camera.far, orthographic: camera.orthographic, reversed: depth.reversed });
      gtaoUniforms = packWebGPUGtaoUniforms({ projectionMatrix: projection, projectionMatrixInverse: inverse, orthographic: camera.orthographic }, options, frameIndex);
    } catch (error) {
      throw new RenderDeviceError(error instanceof Error ? error.message : String(error), "WEBGPU_AO_CAMERA_REQUIRED");
    }
    const w = src.width, h = src.height, hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    const scratch: RenderTarget[] = [];
    const scratchTarget = (width: number, height: number, format: "rgba32f" | "rgba8", label: string): WebGPURenderTarget => {
      const target = this.createRenderTarget({ width, height, format, depth: false, label });
      scratch.push(target);
      return this.requireRenderTarget(target);
    };
    const out = this.createRenderTarget({ width: w, height: h, format: nativeAmbientOcclusionFormat(src.colorTexture.format), depth: false, label: "a3d-webgpu-ao-apply" });
    try {
      const linear = scratchTarget(w, h, "rgba32f", "a3d-webgpu-ao-linear-depth");
      this.runWebGPUFullscreenPass({ label: "webgpu-ao-linear-depth", fragment: webgpuAoLinearDepthFragment(depth.multisampled), entryPoint: "fs_ao_linear_depth",
        uniforms: linearUniforms, views: [depth.view], target: linear, textureLoadBindings: true, ...(depth.multisampled ? { multisampledDepthViews: [0] } : {}) });
      const minmax = scratchTarget(hw, hh, "rgba32f", "a3d-webgpu-ao-minmax-half");
      this.runWebGPUFullscreenPass({ label: "webgpu-ao-minmax-half", fragment: WEBGPU_AO_MINMAX_HALF_FRAGMENT, entryPoint: "fs_ao_minmax_half",
        uniforms: new Float32Array(4), views: [linear.nativeView], target: minmax, textureLoadBindings: true });
      if (diagnosticToken) recordPostStage("S1:depth-prep", diagnosticToken);
      const aoRaw = scratchTarget(hw, hh, "rgba8", "a3d-webgpu-ao-raw");
      this.runWebGPUFullscreenPass({ label: `webgpu-gtao-${options.directions}x${options.steps}`, fragment: webgpuGtaoFragment(options.directions, options.steps), entryPoint: "fs_gtao",
        uniforms: gtaoUniforms, views: [minmax.nativeView], target: aoRaw, textureLoadBindings: true });
      const aoHalf = scratchTarget(hw, hh, "rgba8", "a3d-webgpu-ao-denoise");
      this.runWebGPUFullscreenPass({ label: "webgpu-ao-denoise-h", fragment: WEBGPU_AO_DENOISE_FRAGMENT, entryPoint: "fs_ao_denoise",
        uniforms: packWebGPUAoDenoiseUniforms(true), views: [aoRaw.nativeView, minmax.nativeView], target: aoHalf, textureLoadBindings: true });
      this.runWebGPUFullscreenPass({ label: "webgpu-ao-denoise-v", fragment: WEBGPU_AO_DENOISE_FRAGMENT, entryPoint: "fs_ao_denoise",
        uniforms: packWebGPUAoDenoiseUniforms(false), views: [aoHalf.nativeView, minmax.nativeView], target: aoRaw, textureLoadBindings: true });
      this.runWebGPUFullscreenPass({ label: "webgpu-ao-apply", fragment: WEBGPU_AO_APPLY_FRAGMENT, entryPoint: "fs_ao_apply",
        uniforms: packWebGPUAoApplyUniforms(camera.far, options),
        views: [src.nativeView, aoRaw.nativeView, linear.nativeView, minmax.nativeView], target: out, textureLoadBindings: true });
      if (diagnosticToken) recordPostStage(`S2:gtao-${options.directions}x${options.steps}`, diagnosticToken);
      this.nativeAmbientOcclusionPasses += 1;
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    } finally {
      for (const target of scratch) target.dispose();
    }
  }

  private preflightNativeDofPresentation(source: RenderTarget, options: WebGPUNativePostPresentationOptions): void {
    const request = options.nativeDepthOfField;
    if (!request) return;
    if (!this.canPresentNativeDepthOfField() || !this.validateNativeDepthOfFieldFrame(request.frame, source)) {
      throw new RenderDeviceError("Native depth of field requires a sealed device-issued frame", "WEBGPU_DOF_FRAME_STALE");
    }
    const context = options.postFrameContext;
    if (!context || context.scopeId !== request.frame.scopeId || context.viewId !== request.frame.viewId || context.frameId !== request.frame.frameId) {
      throw new RenderDeviceError("Native depth-of-field post identity does not match its frame", "WEBGPU_DOF_FRAME_STALE");
    }
    validateWebGPUDepthOfFieldOptions(request.options, request.frame.maxGeometryDepthMeters, request.frame.skyDepthMeters);
    const target = this.assertNativeDofTarget(source);
    if (target.colorTexture.format === "rgba32f" && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("Native depth-of-field presentation requires filterable rgba32f", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
    }
    // Registered passes anchored before S6 run ahead of depth of field (takeNativeDofPrecedingCustoms).
    if (options.nativeEffects?.length || options.passes.some(pass => pass.name === "taa")) {
      throw new RenderDeviceError("Native depth of field cannot combine with temporal passes or native effects", "WEBGPU_DOF_COMBINATION_UNSUPPORTED");
    }
    if (options.autoExposure !== undefined) normalizeWebGPUAutoExposure(options.autoExposure);
    let previousStage = -1;
    for (const pass of options.passes) {
      // SSR runs as the S3 stage before depth of field; a legacy ssao (no native S2 this frame) reads the frame depth in place.
      if (pass.name === "ssr" || pass.name === "ssao") continue;
      const stage = pass.name === "bloom" ? 0 : pass.name === "tone-mapping" ? 1 : pass.name === "color-grade" ? 2 : pass.name === "fxaa" ? 3 : -1;
      if (stage < previousStage || stage < 0) throw new RenderDeviceError("Native depth-of-field post stages are unsupported or out of order", "WEBGPU_DOF_COMBINATION_UNSUPPORTED");
      previousStage = stage;
      if (pass.name === "bloom") normalizeWebGPUBloomOptions(pass.options);
      if (pass.name === "color-grade") normalizeWebGPUColorGradeOptions(pass.options);
      if (pass.name === "tone-mapping") {
        const tone = { ...options.toneMappingDefaults, ...pass.options };
        const operator = tone.operator ?? "reinhard", exposure = typeof tone.exposure === "number" ? tone.exposure : 1;
        const whitePoint = typeof tone.whitePoint === "number" ? tone.whitePoint : 1;
        if (!["linear", "none", "reinhard", "aces", "aces-filmic", "filmic"].includes(String(operator)) ||
            !Number.isFinite(exposure) || exposure < 0 || !Number.isFinite(whitePoint) || whitePoint <= 0) {
          throw new RenderDeviceError("Native depth-of-field tone options are unsupported", "WEBGPU_POSTPROCESS_UNSUPPORTED");
        }
      }
    }
    if (options.outputTarget) {
      const output = this.assertNativeDofTarget(options.outputTarget);
      if (output === target || output.nativeTexture === target.nativeTexture || output.nativeTexture === target.nativeDepthTexture ||
          target.nativeExtraColors.some(color => color.native === output.nativeTexture) || output.nativeExtraColors.length) {
        throw new RenderDeviceError("Native depth-of-field output aliases its input", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
      }
    } else if (!this.canvasContext) throw new RenderDeviceError("Native depth-of-field presentation needs a canvas or output target", "WEBGPU_SURFACE_UNAVAILABLE");
    const alpha = options.toneMappingDefaults?.alphaMode;
    if (alpha !== undefined && alpha !== "opaque" && alpha !== "straight" && alpha !== "premultiplied") {
      throw new RenderDeviceError("Unsupported output alpha mode", "OUTPUT_ALPHA_MODE_UNSUPPORTED");
    }
    if (!options.outputTarget && alpha && this.getPresentationAlphaMode() !== alpha) {
      throw new RenderDeviceError("Output alpha mode does not match the canvas", "OUTPUT_ALPHA_MODE_UNAVAILABLE");
    }
  }

  /** Validate the allocation-time pair used to resolve multisampled color for sampling. */
  private requireP3ResolvedColor(target: RenderTarget, initialized: boolean): WebGPUTextureLike {
    const owned = this.requireRenderTarget(target);
    const allocation = this.#p3ResolvedColors.get(owned);
    const native = allocation?.texture;
    const msaa = allocation?.multisampleTexture;
    const format = webgpuTextureFormat(owned.colorTexture.format);
    if (!allocation || !native || !allocation.view || owned.colorTexture !== allocation.color || owned.colorTexture.disposed ||
        owned.nativeTexture !== native || owned.nativeView !== allocation.view || owned.width !== allocation.width || owned.height !== allocation.height ||
        owned.sampleCount !== allocation.sampleCount || (owned.sampleCount !== 1 && owned.sampleCount !== 4) ||
        owned.nativeMultisampleTexture !== msaa || owned.nativeMultisampleView !== allocation.multisampleView ||
        (native.format !== undefined && native.format !== format) || (native.sampleCount !== undefined && native.sampleCount !== 1) ||
        (native.usage !== undefined && (native.usage & TEXTURE_USAGE.TEXTURE_BINDING) === 0) ||
        (owned.sampleCount === 4 && (!msaa || !allocation.multisampleView || msaa === native ||
          (msaa.format !== undefined && msaa.format !== format) || (msaa.sampleCount !== undefined && msaa.sampleCount !== 4) ||
          (msaa.usage !== undefined && (msaa.usage & TEXTURE_USAGE.RENDER_ATTACHMENT) === 0))) ||
        (owned.sampleCount === 1 && (msaa !== null || allocation.multisampleView !== null)) ||
        (initialized && owned.nativeNeedsClear)) {
      throw new RenderDeviceError("Display-P3 color resolve is unavailable or stale", "WEBGPU_P3_SOURCE_UNSUPPORTED");
    }
    this.resourceInterop.assertUsable(native);
    if (msaa) this.resourceInterop.assertUsable(msaa);
    return native;
  }

  private preflightNativeColorPresentation(source: RenderTarget, options: WebGPUNativePostPresentationOptions): boolean {
    const declared = options.toneMappingDefaults?.outputColorSpace;
    const tones = options.passes.filter(pass => pass.name === "tone-mapping");
    if (options.outputTarget) {
      if (declared === "display-p3" || tones.some(pass => pass.options.outputColorSpace === "display-p3")) {
        throw new RenderDeviceError("Offscreen targets cannot represent Display-P3 encoding", "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED");
      }
      return false;
    }
    if (!this.canvasContext) return false; // Preserve the existing canvas-unavailable diagnostic.
    this.assertActiveCanvasColor();
    const active = this.activeColorSpace;
    if ((declared !== undefined && declared !== active) || tones.some(pass =>
      pass.options.outputColorSpace !== undefined && pass.options.outputColorSpace !== active)) {
      throw new RenderDeviceError("Tone output color space does not match the canvas", "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED");
    }
    if (active !== "display-p3") return false;
    this.assertVerifiedP3Canvas();
    const owned = this.requireRenderTarget(source);
    if ((owned.colorTexture.format !== "rgba16f" && owned.colorTexture.format !== "rgba32f") || owned.colorTexture.colorSpace !== "linear" ||
        (options.toneMappingDefaults?.alphaMode !== undefined && options.toneMappingDefaults.alphaMode !== "opaque") ||
        declared !== "display-p3" || tones.length !== 1 || options.passes.at(-1)?.name !== "tone-mapping" ||
        options.passes.some(pass => pass.name !== "bloom" && pass.name !== "tone-mapping") || options.nativeEffects?.length ||
        registeredPostPasses().some(pass => pass.postScopeMatches?.(options.postFrameContext?.scopeId) !== false)) {
      throw new RenderDeviceError("Display-P3 postprocessing requires opaque linear HDR, optional bloom, and one final tone pass", "WEBGPU_P3_POST_UNSUPPORTED");
    }
    this.requireP3ResolvedColor(owned, false);
    if (owned.colorTexture.format === "rgba32f" && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("Display-P3 postprocessing requires filterable rgba32f", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
    }
    const tone = { ...options.toneMappingDefaults, ...tones[0]!.options };
    const operator = tone.operator ?? "reinhard", exposure = typeof tone.exposure === "number" ? tone.exposure : 1;
    const whitePoint = typeof tone.whitePoint === "number" ? tone.whitePoint : 1;
    if (!["linear", "none", "reinhard", "aces", "aces-filmic", "filmic"].includes(String(operator)) ||
        !Number.isFinite(exposure) || exposure < 0 || !Number.isFinite(whitePoint) || whitePoint <= 0) {
      throw new RenderDeviceError("Display-P3 tone options are unsupported", "WEBGPU_POSTPROCESS_UNSUPPORTED");
    }
    for (const pass of options.passes) if (pass.name === "bloom") normalizeWebGPUBloomOptions(pass.options);
    if (options.autoExposure !== undefined) normalizeWebGPUAutoExposure(options.autoExposure);
    return true;
  }

  /** Internal renderer ownership; the capability is never part of a post frame. */
  registerNativePostRenderer(scopeId: object): void {
    this.assertAlive();
    if (!consumeRendererPostAccess(this, scopeId, "register") ||
        this.#nativePostOwners.has(scopeId) || this.#nativePostTransactions.has(scopeId)) {
      throw new RenderDeviceError("Native post scope already has an owner", "POSTPROCESS_HISTORY_SCOPE_BUSY");
    }
    this.#nativePostOwners.add(scopeId);
  }

  unregisterNativePostRenderer(scopeId: object): void {
    if (!consumeRendererPostAccess(this, scopeId, "unregister")) {
      throw new RenderDeviceError("Native post scope is not renderer-owned", "POSTPROCESS_HISTORY_SCOPE_BUSY");
    }
    if (!this.#nativePostOwners.has(scopeId)) return;
    const transaction = this.#nativePostTransactions.get(scopeId);
    if (transaction) this.finishNativePostTransaction(transaction, false);
    this.#nativePostOwners.delete(scopeId);
  }

  beginNativePostAuthoredFrame(scopeId: object, frameId: number): void {
    this.assertAlive();
    if (!consumeRendererPostAccess(this, scopeId, "begin", frameId) || !this.#nativePostOwners.has(scopeId) || this.#nativePostTransactions.has(scopeId) ||
        !Number.isSafeInteger(frameId) || frameId < 0) {
      throw new RenderDeviceError("Native post frame ownership is unavailable", "POSTPROCESS_HISTORY_FRAME_BUSY");
    }
    this.#nativePostTransactions.set(scopeId, {
      scopeId, managed: true, frameId, generation: this.generation, views: new Map(), invalidatedViews: new Set(), invalid: false
    });
  }

  beginNativePostRendererPass(scopeId: object, frameId: number, viewId: string | number,
    diagnosticToken: PostDiagnosticToken): void {
    const transaction = this.#nativePostTransactions.get(scopeId);
    const token = this.activeFrameToken;
    if (!consumeRendererPostAccess(this, scopeId, "begin-pass", frameId, viewId, diagnosticToken) ||
        !transaction || !transaction.managed || transaction.frameId !== frameId || transaction.invalid ||
        transaction.pass || transaction.generation !== this.generation || !token || this.contextLost || this.disposed) {
      throw new RenderDeviceError("Native post renderer pass is stale or busy", "POSTPROCESS_HISTORY_FRAME_STALE");
    }
    transaction.pass = { viewId, diagnosticToken, deviceFrameToken: token, presenting: false };
  }

  endNativePostRendererPass(scopeId: object, frameId: number): void {
    if (!consumeRendererPostAccess(this, scopeId, "end-pass", frameId)) {
      throw new RenderDeviceError("Native post pass is not renderer-owned", "POSTPROCESS_HISTORY_FRAME_STALE");
    }
    const transaction = this.#nativePostTransactions.get(scopeId);
    if (!transaction || !transaction.managed || transaction.frameId !== frameId) return;
    if (!transaction.pass || transaction.pass.presenting || transaction.pass.deviceFrameToken !== this.activeFrameToken ||
        transaction.generation !== this.generation || this.disposed || this.contextLost) transaction.invalid = true;
    transaction.pass = undefined;
  }

  finishNativePostAuthoredFrame(scopeId: object, frameId: number, completed: boolean): void {
    if (!consumeRendererPostAccess(this, scopeId, completed ? "finish" : "abort", frameId)) {
      throw new RenderDeviceError("Native post frame is not renderer-owned", "POSTPROCESS_HISTORY_FRAME_STALE");
    }
    const transaction = this.#nativePostTransactions.get(scopeId);
    if (!transaction || !transaction.managed || transaction.frameId !== frameId) {
      if (completed) throw new RenderDeviceError("Native post frame is stale", "POSTPROCESS_HISTORY_FRAME_STALE");
      return;
    }
    this.finishNativePostTransaction(transaction, completed);
  }

  private finishNativePostTransaction(transaction: WebGPUPostHistoryTransaction, completed: boolean): void {
    const current = this.#nativePostTransactions.get(transaction.scopeId) === transaction;
    const valid = current && !transaction.invalid && !transaction.pass && !this.disposed && !this.contextLost
      && transaction.generation === this.generation && (!transaction.managed || this.activeFrameToken === null);
    if (current) this.#nativePostTransactions.delete(transaction.scopeId);
    const leases = [...transaction.views.values()].flatMap(effects => [...effects.values()]);
    if (completed && valid) {
      try {
        for (const lease of leases) lease.commit();
        return;
      } catch (error) {
        for (const lease of leases) { try { lease.abort(); } catch {} }
        for (const viewId of transaction.views.keys()) {
          if (transaction.invalidatedViews.has(viewId)) continue;
          try { this.withNativePostOwnerOperation(() => this.nativeEffectHistory.resetView(transaction.scopeId, viewId)); } catch {}
        }
        throw error;
      }
    }
    for (const lease of leases) { try { lease.abort(); } catch {} }
    for (const viewId of transaction.views.keys()) {
      if (transaction.invalidatedViews.has(viewId)) continue;
      try { this.withNativePostOwnerOperation(() => this.nativeEffectHistory.resetView(transaction.scopeId, viewId)); } catch {}
    }
    if (completed) throw new RenderDeviceError("Native post frame changed before completion", "POSTPROCESS_HISTORY_FRAME_STALE");
  }

  /**
   * Standalone presentation commits after the final copy. Renderer-owned
   * presentation only stages writes; its authored-frame owner commits later.
   */
  presentLdrPostprocess(source: RenderTarget, options: WebGPUNativePostPresentationOptions): void {
    const frame = snapshotNativePostFrame(options.postFrameContext);
    const effects = snapshotNativePostEffects(options.nativeEffects ?? []);
    const hasAfterimage = effects.some(effect => effect.kind === "afterimage");
    let transaction: WebGPUPostHistoryTransaction | undefined;
    let standalone = false;
    if (hasAfterimage) {
      validateNativePostFrame(frame);
      transaction = this.#nativePostTransactions.get(frame.scopeId);
      if (this.#nativePostOwners.has(frame.scopeId)) {
        const pass = transaction?.pass;
        if (!transaction || !pass || transaction.invalid || pass.presenting || transaction.frameId !== frame.frameId ||
            pass.viewId !== frame.viewId || pass.diagnosticToken !== frame.diagnosticToken ||
            pass.deviceFrameToken !== this.activeFrameToken || transaction.generation !== this.generation) {
          throw new RenderDeviceError("Native post presentation is not owned by the current renderer pass", "POSTPROCESS_HISTORY_FRAME_STALE");
        }
        pass.presenting = true;
      } else {
        if (transaction) throw new RenderDeviceError("Native post scope is already presenting", "POSTPROCESS_HISTORY_FRAME_BUSY");
        transaction = { scopeId: frame.scopeId, managed: false, frameId: frame.frameId, generation: this.generation, views: new Map(), invalidatedViews: new Set(), invalid: false };
        this.#nativePostTransactions.set(frame.scopeId, transaction);
        standalone = true;
      }
    }
    try {
      this.presentLdrPostprocessTransaction(source, { ...options, nativeEffects: effects, ...(frame ? { postFrameContext: frame } : {}) }, transaction);
      if (standalone) this.finishNativePostTransaction(transaction!, true);
    } catch (error) {
      if (transaction) {
        transaction.invalid = true;
        if (standalone) this.finishNativePostTransaction(transaction, false);
      }
      throw error;
    } finally {
      if (!standalone && transaction?.pass) transaction.pass.presenting = false;
    }
  }

  /** Native target-to-target chain; Display-P3 inputs are final scene color. */
  private presentLdrPostprocessTransaction(source: RenderTarget, options: WebGPUNativePostPresentationOptions,
    transaction?: WebGPUPostHistoryTransaction): void {
    this.assertAlive();
    const displayP3 = this.preflightNativeColorPresentation(source, options);
    this.preflightNativeDofPresentation(source, options);
    if (options.nativeDepthOfField) {
      options = { ...options, passes: options.passes.map(pass => ({ ...pass, options: { ...pass.options } })),
        ...(options.toneMappingDefaults ? { toneMappingDefaults: { ...options.toneMappingDefaults } } : {}),
        ...(options.autoExposure ? { autoExposure: { ...options.autoExposure } } : {}),
        nativeDepthOfField: { frame: options.nativeDepthOfField.frame, options: { ...options.nativeDepthOfField.options } },
        ...(options.nativeDofDisplay ? { nativeDofDisplay: snapshotNativeDofDisplay(options.nativeDofDisplay) } : {}) };
    } else if (options.nativeDofDisplay) {
      options = { ...options, nativeDofDisplay: snapshotNativeDofDisplay(options.nativeDofDisplay) };
    }
    this.reclaimWebGPUPostUniformBuffers();
    const diagnosticToken = options.postFrameContext?.diagnosticToken;
    const authoredTime = options.postFrameContext?.timeSeconds;
    const authoredFrame = options.postFrameContext?.frameId;
    let blackboard = diagnosticToken ? this.nativePostBlackboards.get(diagnosticToken) : undefined;
    if (!blackboard) {
      blackboard = new Map<string, unknown>();
      if (diagnosticToken) this.nativePostBlackboards.set(diagnosticToken, blackboard);
    }
    const customFrame = {
      timeSeconds: typeof authoredTime === "number" && Number.isFinite(authoredTime) ? authoredTime : (typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000),
      frameIndex: Number.isSafeInteger(authoredFrame) && authoredFrame! >= 0 ? authoredFrame! : 0,
      postScopeId: options.postFrameContext?.scopeId,
      blackboard
    };
    const effects = options.nativeEffects ?? [];
    for (const effect of effects) validateNativePostEffect(effect);
    if (effects.some((effect) => effect.kind === "afterimage")) validateNativePostFrame(options.postFrameContext);
    let exposureFrame: (WebGPUNativePostFrame & { readonly timeSeconds: number }) | undefined;
    if (options.autoExposure !== undefined) {
      validateNativePostFrame(options.postFrameContext);
      const frame = options.postFrameContext;
      if (typeof frame.timeSeconds !== "number" || !Number.isFinite(frame.timeSeconds)) {
        throw new RenderDeviceError("Auto exposure requires the renderer's captured frame time", "WEBGPU_AUTO_EXPOSURE_TIME_REQUIRED");
      }
      this.requireRenderTarget(source);
      if ((source.colorTexture.format !== "rgba16f" && source.colorTexture.format !== "rgba32f") || (source.sampleCount ?? 1) !== 1) {
        throw new RenderDeviceError("WebGPU auto exposure requires a live, single-sample linear HDR color target", "WEBGPU_AUTO_EXPOSURE_HDR_REQUIRED");
      }
      // The exposure passes use textureLoad, but the following tone/copy
      // passes use a filtering sampler on the helper's same-format output.
      if (source.colorTexture.format === "rgba32f" && !this.device.features?.has("float32-filterable")) {
        throw new RenderDeviceError("Auto exposure presentation of rgba32f requires float32-filterable", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED");
      }
      if (!this.device.createBindGroupLayout || !this.device.createPipelineLayout) {
        throw new RenderDeviceError("Auto exposure requires explicit texture-load layouts", "WEBGPU_AUTO_EXPOSURE_LAYOUT_UNAVAILABLE");
      }
      if (!this.device.queue.onSubmittedWorkDone) {
        throw new RenderDeviceError("Auto exposure requires a queue completion fence for resource retirement", "WEBGPU_AUTO_EXPOSURE_FENCE_REQUIRED");
      }
      exposureFrame = { ...frame, timeSeconds: frame.timeSeconds };
    }
    const supported = new Set(["bloom", "tone-mapping", "color-grade", "fxaa", "taa", "ssao", "ssr", "volumetric-light"]);
    for (const pass of options.passes) {
      if (!supported.has(pass.name)) throw new RenderDeviceError(`Native WebGPU postprocess does not support ${pass.name}`, "WEBGPU_POSTPROCESS_UNSUPPORTED", { pass: pass.name });
      if (pass.name === "taa" && (pass.options.temporal as WebGPUTemporalInputs | undefined)?.v2) {
        throw new RenderDeviceError("WebGPU temporal reconstruction v2 is not connected to the native resolve", "WEBGPU_TEMPORAL_V2_UNSUPPORTED");
      }
    }
    // The native authored list may place TAA after tone mapping. Exposure
    // requires TAA first; refuse that ordering until it is explicitly routed.
    const firstPostTaaPass = options.passes.findIndex(pass => pass.name !== "taa");
    const exposurePosition = firstPostTaaPass < 0 ? options.passes.length : firstPostTaaPass;
    if (exposureFrame && (options.passes.filter(pass => pass.name === "taa").length > 1
      || options.passes.slice(exposurePosition).some(pass => pass.name === "taa"))) {
      throw new RenderDeviceError("Auto exposure requires TAA before bloom and tone mapping", "WEBGPU_AUTO_EXPOSURE_TAA_ORDER_UNSUPPORTED");
    }
    // A pending scene clear has not yet populated its single-sample color
    // resolve. Submit it before any post stage samples that color texture.
    const postSource = this.requireRenderTarget(source);
    if (!postSource.nativeTexture || !postSource.nativeView || postSource.colorTexture.disposed) {
      throw new RenderDeviceError("Native post source has no live color texture", "NATIVE_POST_UNSUPPORTED");
    }
    if (postSource.nativeNeedsClear) this.flushNativeRenderTargetClear(postSource);
    this.requireRenderTarget(postSource);
    if (postSource.nativeNeedsClear || postSource.colorTexture.disposed) {
      throw new RenderDeviceError("Native post source could not be initialized", "WEBGPU_TARGET_CLEAR_UNAVAILABLE");
    }
    this.resourceInterop.assertUsable(postSource.nativeTexture);
    if (displayP3) this.requireP3ResolvedColor(postSource, true);
    const owned: RenderTarget[] = [];
    let current = source;
    let exposure: WebGPUExposureResult | undefined;
    let linearDriver: WebGPULinearDepth | undefined, dofDriver: WebGPUDepthOfField | undefined;
    let linearResult: ReturnType<WebGPULinearDepth["execute"]> | undefined;
    let dofResult: ReturnType<WebGPUDepthOfField["execute"]> | undefined;
    let consumedProof: NativeDofFrameProof | undefined;
    let assertDofCurrent: (() => void) | undefined;
    const previousValidationFailure = this.webgpuPostValidationFailure;
    const track = (target: RenderTarget): void => { owned.push(target); current = target; };
    /*
     * threejs-parity SH-03/SH-06: C-13 custom passes registered via
     * `registerPostPass` (`app.post.addPostPass` / `effects.shaderPass`) run on
     * the native WebGPU chain too. Anchor resolution mirrors the v2 graph's
     * named slots onto this chain's pass order; a registered pass missing its
     * WGSL fragment is recorded `WGSL_PROGRAM_MISSING:<id>` and skipped — never
     * silently, never as a GLSL fallback.
     */
    const customAt = this.webgpuCustomPassPositions(options.passes, options.postFrameContext?.scopeId);
    // Native depth of field: passes anchored before S6 (after-depth, before-taa, after-taa) leave the chain slots and
    // run around the HDR depth stages in the v2 graph order instead (see the try block below).
    const anyNativeDof = !!(options.nativeDepthOfField || options.nativeSceneDepthOfField);
    const preDofCustoms = anyNativeDof ? takeNativeDofPrecedingCustoms(customAt) : undefined;
    // CA / vignette / finalize (the v2 display stages) run with or without native depth of field; without it a
    // Display-P3 chain omits them as before, with it P3 stays refused.
    if (anyNativeDof && options.nativeDofDisplay && displayP3) throw new RenderDeviceError("Native depth-of-field display stages are not admitted on Display-P3 output", "WEBGPU_DOF_COMBINATION_UNSUPPORTED");
    const dofDisplay = displayP3 ? undefined : options.nativeDofDisplay;
    const dofFrameIndex = Number.isSafeInteger(options.postFrameContext?.frameId) ? options.postFrameContext!.frameId : 0;
    let vignetteRun = false;
    const runDofVignette = (): void => {
      if (vignetteRun || !dofDisplay?.vignette) return;
      vignetteRun = true;
      track(this.executeNativeDofDisplayStage(current, "vignette", dofDisplay, dofFrameIndex));
      if (diagnosticToken) recordPostStage("S10b:display-grade:vignette", diagnosticToken);
    };
    let hdrGradeRun = false;
    // v2 S10: the linear grade follows S8 auto exposure (and the customs anchored there), before bloom and tone mapping.
    const runHdrGrade = (): void => {
      if (hdrGradeRun || !options.nativeHdrGrade) return;
      hdrGradeRun = true;
      if (displayP3) { recordPostSkipped("WEBGPU_HDR_GRADE_P3_UNSUPPORTED", diagnosticToken); return; }
      track(this.executeWebGPUHdrGrade(current, options.nativeHdrGrade));
      if (diagnosticToken) recordPostStage(exposureFrame ? "S10:hdr-grade:folded-s8" : "S10:hdr-grade", diagnosticToken);
    };
    let lutRun = false;
    const runLut = (): void => {
      if (lutRun || !options.nativeLut) return;
      lutRun = true;
      if (displayP3) { recordPostSkipped(`WEBGPU_LUT_P3_UNSUPPORTED:${options.nativeLut.source}`, diagnosticToken); return; }
      const out = this.executeWebGPUDisplayLut(current, options.nativeLut, diagnosticToken);
      if (out) { track(out); if (diagnosticToken) recordPostStage("S10b:display-grade:lut", diagnosticToken); }
    };
    let effectsRun = false;
    const runEffects = (): void => {
      if (effectsRun || effects.length === 0) return;
      effectsRun = true;
      track(this.executeWebGPUNativeEffectsTransaction(current, effects, options.postFrameContext, transaction));
    };
    const runCustoms = (customs: readonly PostPassDescriptor[]): void => {
      for (const custom of customs) {
        const out = this.executeWebGPUCustomPass(custom, current, diagnosticToken, customFrame);
        if (out) track(out);
      }
    };
    const runExposure = (): void => {
      const frame = exposureFrame;
      if (!frame) return;
      const helper = this.webgpuAutoExposure ??= new WebGPUAutoExposure({
        createTarget: descriptor => this.createNativePostTarget(descriptor),
        draw: pass => this.executeWebGPUExposurePass(pass),
        disposeTarget: target => this.releaseNativePostTarget(target)
      });
      exposure = this.withNativePostOwnerOperation(() => helper.execute(current, options.autoExposure!, { ...frame, deviceGeneration: this.generation }));
      current = exposure.target; // Borrowed from the view; never dispose as a transient.
      recordPostStage("S8:auto-exposure", diagnosticToken);
    };
    const runCustomsAt = (position: number): void => {
      const customs = customAt.get(position) ?? [];
      if ((exposureFrame || options.nativeHdrGrade) && position === exposurePosition) {
        // Multiple anchors can collapse to one numeric slot when TAA/bloom
        // are absent. Their graph semantics still straddle exposure and the
        // S10 grade (v2 order: after-taa customs -> S8 -> S10 -> before-tonemap).
        const before = customs.filter(custom => custom.insertAt === "after-depth" || custom.insertAt === "before-taa" || custom.insertAt === "after-taa");
        runCustoms(before);
        runExposure();
        runHdrGrade();
        runCustoms(customs.filter(custom => !before.includes(custom)));
      } else runCustoms(customs);
    };
    try {
      // Consume the sealed native DoF frame before any pre-DoF stage submits (a sealed proof is valid only until the
      // next submission); `assertDofCurrent` then guards the source through the whole chain.
      let dofProof: NativeDofFrameProof | undefined;
      if (options.nativeDepthOfField) {
        const frame = options.nativeDepthOfField.frame;
        const proof = this.#nativeDofProofs.get(frame);
        if (!proof || !this.validateNativeDepthOfFieldFrame(frame, source)) throw new RenderDeviceError("Native depth-of-field frame changed before execution", "WEBGPU_DOF_FRAME_STALE");
        proof.phase = "consumed";
        consumedProof = proof;
        const assertCurrent = (): void => {
          this.assertAlive();
          if (proof.phase !== "consumed" || this.#nativeDofActive !== proof || !this.frameActive || this.frameToken !== proof.frameToken || this.activeRenderTarget !== proof.target || proof.target.disposed ||
              proof.target.colorTexture.disposed || proof.target.depthTexture?.disposed || proof.target.nativeExtraColors[0]?.texture.disposed ||
              proof.target.nativeTexture !== proof.nativeColor || proof.target.nativeDepthTexture !== proof.nativeDepth ||
              proof.target.nativeExtraColors[0]?.native !== proof.nativeCoverage || proof.target.colorTexture !== proof.color ||
              proof.target.depthTexture !== proof.depth || proof.target.nativeExtraColors[0]?.texture !== proof.coverage) {
            throw new RenderDeviceError("Native depth-of-field source changed during postprocessing", "WEBGPU_DOF_FRAME_STALE");
          }
          this.assertNativeDofTarget(proof.target);
        };
        assertDofCurrent = assertCurrent;
        dofProof = proof;
      }
      if (preDofCustoms) runCustoms(preDofCustoms.afterDepth);
      // v2 S2: ambient occlusion composes in linear HDR, before SSR (S3), TAA, depth of field, bloom and tone.
      if (options.nativeAmbientOcclusion) {
        track(this.executeWebGPUAmbientOcclusion(current, source, options.nativeAmbientOcclusion, options.postFrameContext?.frameId ?? 0, diagnosticToken));
      }
      // W3: SSR composites onto the scene-linear source before bloom and tone
      // mapping (the v2 S3 position), reading the source's depth attachment.
      const ssrPass = options.passes.find(pass => pass.name === "ssr");
      if (ssrPass) {
        track(this.executeWebGPUSsr(current, ssrPass.options, source));
        if (diagnosticToken) recordPostStage(`S3:ssr-${resolveWebGPUSsrOptions(ssrPass.options).steps}`, diagnosticToken);
      }
      const depthStagesP3 = Boolean((options.nativeGodRays || options.nativeMotionBlur) && displayP3);
      if (depthStagesP3) recordPostSkipped("WEBGPU_DEPTH_STAGES_P3_UNSUPPORTED", diagnosticToken);
      // v2 S4: god rays precede TAA and depth of field.
      if (options.nativeGodRays && !depthStagesP3) {
        track(this.executeWebGPUGodRays(current, source, options.nativeGodRays));
        recordPostStage(`S4:god-rays-${options.nativeGodRays.samples}`, diagnosticToken);
      }
      if (preDofCustoms) { runCustoms(preDofCustoms.beforeTaa); runCustoms(preDofCustoms.afterTaa); }
      if (options.nativeDepthOfField && dofProof && assertDofCurrent) {
        const frame = options.nativeDepthOfField.frame;
        const proof = dofProof, assertCurrent = assertDofCurrent;
        assertCurrent();
        const generation = () => this.generation, isLost = () => this.disposed || this.contextLost;
        linearDriver = new WebGPULinearDepth({ createTarget: descriptor => this.createRenderTarget(descriptor),
          assertTargetOwned: target => { this.assertNativeDofTarget(target); },
          draw: pass => this.executeNativeLinearDepthPass(pass, assertCurrent), deviceGeneration: generation, isDeviceLost: isLost });
        linearResult = linearDriver.execute({ source, coverage: frame.coverage, projection: frame.projection,
          maxGeometryDepthMeters: frame.maxGeometryDepthMeters, skyDepthMeters: frame.skyDepthMeters });
        assertCurrent();
        proof.depthSubmitted = true;
        if (diagnosticToken) recordPostStage("S1:depth-prep", diagnosticToken);
        dofDriver = new WebGPUDepthOfField({ createTarget: descriptor => this.createRenderTarget(descriptor),
          draw: pass => this.executeNativeDofPass(pass, assertCurrent), deviceGeneration: generation, isDeviceLost: isLost });
        // The color is the HDR chain so far (S2 AO, S3 SSR, S4 god rays, pre-DoF customs); depth stays the frame's.
        dofResult = dofDriver.execute({ color: current, alpha: frame.alpha, depthModel: frame.depthModel,
          linearDepth: linearResult.target, depthEncoding: "linear-view-metres", maxGeometryDepthMeters: frame.maxGeometryDepthMeters,
          skyDepthMeters: frame.skyDepthMeters, options: options.nativeDepthOfField.options });
        assertCurrent();
        proof.effectSubmitted = true;
        if (diagnosticToken) recordPostStage("S6:dof", diagnosticToken);
        current = dofResult.target;
        linearResult.release(); linearResult = undefined;
      }
      if (options.nativeSceneDepthOfField && !options.nativeDepthOfField) {
        track(this.executeWebGPUSceneDepthOfField(current, source, options.nativeSceneDepthOfField));
        if (diagnosticToken) { recordPostStage("S1:depth-prep", diagnosticToken); recordPostStage("S6:dof", diagnosticToken); }
      }
      // v2 S7: motion blur follows depth of field, on HDR before bloom.
      if (options.nativeMotionBlur && !depthStagesP3) {
        track(this.executeWebGPUMotionBlur(current, source, options.nativeMotionBlur));
        recordPostStage(`S7:motion-blur-${options.nativeMotionBlur.samples}x${options.nativeMotionBlur.tileSize}`, diagnosticToken);
      }
      // The native DoF chain's chromatic aberration follows S7 (HDR, before bloom).
      if (dofDisplay?.chromaticAberration) {
        track(this.executeNativeDofDisplayStage(current, "ca", dofDisplay, dofFrameIndex));
        if (diagnosticToken) recordPostStage("CA:chromatic-aberration", diagnosticToken);
      }
      if (exposureFrame) {
        const { scopeId, viewId } = exposureFrame;
        this.webgpuPostValidationFailure = () => {
          // Validation arrives asynchronously; invalidate this view even if
          // its synchronously submitted history was already committed.
          try { this.releaseNativePostEffectView(scopeId, viewId); } catch { /* Preserve the validation diagnostic. */ }
        };
      }
      for (let passIndex = 0; passIndex < options.passes.length; passIndex += 1) {
        assertDofCurrent?.();
        runCustomsAt(passIndex);
        const pass = options.passes[passIndex]!;
        if (pass.name === "fxaa") { runDofVignette(); runEffects(); }
        if (pass.name === "bloom") track(this.executeNativeWebGPUBloom(current, pass.options, displayP3));
        else if (pass.name === "color-grade") { track(this.executeWebGPUColorGrade(current, pass.options)); runLut(); }
        else if (pass.name === "fxaa") track(this.executeWebGPUFxaa(current));
        else if (pass.name === "ssao") track(this.executeWebGPUSsao(current, source, pass.options));
        // The renderer offers legacy volumetric light only to this WebGPU chain (outside the shared LDR pass-name union).
        else if ((pass.name as string) === "volumetric-light") track(this.executeWebGPUVolumetricLight(current, source, pass.options, options.depthRange));
        else if (pass.name === "taa") {
          const temporal = pass.options.temporal as WebGPUTemporalInputs | undefined;
          if (!temporal) throw new RenderDeviceError("Native WebGPU TAA requires GPU temporal bindings", "TEMPORAL_NATIVE_REQUIRED");
          track(this.executeWebGPUTaa(current, { ...temporal, ...(typeof pass.options.blend === "number" ? { blend: pass.options.blend } : {}) }));
        } else if (pass.name === "tone-mapping") {
          const tone = { ...options.toneMappingDefaults, ...pass.options };
          const operator = tone.operator ?? "reinhard";
          const operatorId = operator === "linear" || operator === "none" ? 0 : operator === "reinhard" ? 1 : operator === "aces" || operator === "aces-filmic" ? 2 : operator === "filmic" ? 3 : operator === "neutral" ? 6 : -1;
          if (operatorId < 0) throw new RenderDeviceError(`Unsupported native WebGPU tone operator ${String(operator)}`, "WEBGPU_POSTPROCESS_UNSUPPORTED");
          const exposure = typeof tone.exposure === "number" ? tone.exposure : 1;
          const whitePoint = typeof tone.whitePoint === "number" ? tone.whitePoint : 1;
          if (!Number.isFinite(whitePoint) || whitePoint <= 0) throw new RenderDeviceError("Invalid tone white point", "WEBGPU_POSTPROCESS_UNSUPPORTED");
          if (!Number.isFinite(exposure) || exposure < 0) throw new RenderDeviceError("Invalid tone exposure", "WEBGPU_POSTPROCESS_UNSUPPORTED");
          const target = this.createRenderTarget({ width: source.width, height: source.height, format: "rgba8", label: "a3d-webgpu-tone" });
          owned.push(target);
          const toneSource = this.requireRenderTarget(current);
          const toneSourceNative = displayP3 ? this.requireP3ResolvedColor(toneSource, true) : undefined;
          const toneOutputNative = displayP3 ? this.requireP3ResolvedColor(target, false) : undefined;
          this.runWebGPUFullscreenPass({ label: "webgpu-tone", fragment: displayP3 ? WEBGPU_NATIVE_TONE_P3_FRAGMENT : WEBGPU_NATIVE_TONE_FRAGMENT, entryPoint: "fs_tone",
            uniforms: new Float32Array([exposure, operatorId, tone.outputColorSpace === "srgb" || displayP3 || (!options.outputTarget && tone.outputColorSpace === undefined) ? 1 : 0, whitePoint]),
            views: [toneSource.nativeView], target,
            ...(displayP3 ? { protectedSubmission: true,
              accesses: [{ resource: toneSourceNative!, mode: "read" as const }, { resource: toneOutputNative!, mode: "write" as const }],
              beforeSubmit: () => {
                if (this.requireP3ResolvedColor(toneSource, true) !== toneSourceNative || this.requireP3ResolvedColor(target, false) !== toneOutputNative) {
                  throw new RenderDeviceError("Display-P3 tone resources changed before submission", "WEBGPU_PRESENTATION_STALE");
                }
              } } : {}) });
          current = target;
          if (!options.passes.some(candidate => candidate.name === "color-grade")) runLut();
        }
        assertDofCurrent?.();
      }
      assertDofCurrent?.();
      runDofVignette();
      runCustomsAt(options.passes.length);
      runHdrGrade();
      runEffects();
      if (dofDisplay?.finalize) {
        track(this.executeNativeDofDisplayStage(current, "finalize", dofDisplay, dofFrameIndex));
        if (diagnosticToken) recordPostStage("S12:film-grain", diagnosticToken);
      }
      assertDofCurrent?.();
      const target = options.outputTarget ?? null;
      if (target === current) throw new RenderDeviceError("Native WebGPU presentation source/output alias", "INVALID_RESOURCE");
      const alphaMode = options.toneMappingDefaults?.alphaMode;
      if (alphaMode !== undefined && alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
        throw new RenderDeviceError("Unsupported output alpha mode", "OUTPUT_ALPHA_MODE_UNSUPPORTED", { alphaMode });
      }
      if (!target && alphaMode && this.getPresentationAlphaMode() !== alphaMode) {
        throw new RenderDeviceError("Output alpha mode does not match the canvas", "OUTPUT_ALPHA_MODE_UNAVAILABLE", { requested: alphaMode, active: this.getPresentationAlphaMode() });
      }
      const presentSource = this.requireRenderTarget(current);
      const p3Surface = displayP3 ? this.verifiedP3CanvasTexture() : undefined;
      this.runWebGPUFullscreenPass({ label: "webgpu-post-present", fragment: WEBGPU_NATIVE_COPY_FRAGMENT, entryPoint: "fs_copy",
        uniforms: new Float32Array([1 / source.width, 1 / source.height, alphaMode === "premultiplied" ? 1 : 0, alphaMode === "opaque" || displayP3 ? 1 : 0]),
        views: [presentSource.nativeView], target,
        ...(p3Surface ? { targetViewOverride: p3Surface.view, protectedSubmission: true,
          accesses: [{ resource: presentSource.nativeTexture!, mode: "read" as const }],
          beforeSubmit: () => this.assertP3CanvasTexture(p3Surface) } : {}) });
      assertDofCurrent?.();
      exposure?.commit();
      if (!target) { this.activeRenderTarget = null; this.canvasSubmissions += 1; }
    } catch (error) {
      try { exposure?.abort(); } catch { /* Preserve the original render failure. */ }
      // A later FXAA/custom/presentation failure means this authored frame
      // did not complete, even if its afterimage stage already submitted.
      if (effectsRun && options.postFrameContext && effects.some((effect) => effect.kind === "afterimage")) {
        try { this.releaseNativePostEffectView(options.postFrameContext.scopeId, options.postFrameContext.viewId); } catch { /* Preserve the original render failure. */ }
      }
      throw error;
    } finally {
      this.webgpuPostValidationFailure = previousValidationFailure;
      if (consumedProof && this.#nativeDofActive === consumedProof) { consumedProof.phase = "invalid"; this.#nativeDofActive = null; }
      for (const target of owned) target.dispose();
      dofResult?.release();
      linearResult?.release();
      dofDriver?.dispose();
      linearDriver?.dispose();
    }
  }

  /**
   * The general-scene S6 stage: linear depth from the frame's own depth attachment (a 4x attachment is read at sample
   * 0, like the native AO stage) with the clear value as sky, then the native six-pass DoF kernel on `color`. Returns
   * a caller-owned target in the color's float format.
   */
  private executeWebGPUSceneDepthOfField(color: RenderTarget, depthSource: RenderTarget, request: NativeSceneDofRequest): RenderTarget {
    this.reclaimWebGPUPostUniformBuffers();
    const src = this.requireRenderTarget(color);
    if (!src.nativeView) throw new RenderDeviceError("WebGPU depth of field source has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    if (depthSource.width !== src.width || depthSource.height !== src.height) {
      throw new RenderDeviceError("WebGPU depth of field depth and color sizes differ", "WEBGPU_DOF_DEPTH_UNSUPPORTED");
    }
    const depth = this.nativeAmbientOcclusionDepth(depthSource, "depth-of-field", true);
    let linearUniforms: Float32Array;
    try { linearUniforms = packWebGPUAoLinearDepthUniforms({ ...request.camera, reversed: depth.reversed }); }
    catch (error) { throw new RenderDeviceError(error instanceof Error ? error.message : String(error), "WEBGPU_DOF_DEPTH_UNSUPPORTED"); }
    const w = src.width, h = src.height;
    const scratch: RenderTarget[] = [];
    const generation = () => this.generation, isLost = () => this.disposed || this.contextLost;
    const driver = new WebGPUDepthOfField({ createTarget: descriptor => this.createRenderTarget(descriptor),
      draw: pass => this.executeNativeDofPass(pass, () => this.assertAlive()), deviceGeneration: generation, isDeviceLost: isLost });
    let succeeded = false;
    try {
      let input: RenderTarget = color;
      const format = src.colorTexture.format;
      if ((src.sampleCount ?? 1) !== 1 || (format !== "rgba16f" && format !== "rgba32f") || src.colorTexture.colorSpace !== "linear") {
        input = this.createRenderTarget({ width: w, height: h, format: "rgba16f", depth: false, label: "a3d-webgpu-scene-dof-color" });
        scratch.push(input);
        this.runWebGPUFullscreenPass({ label: "webgpu-scene-dof-color", fragment: WEBGPU_SCENE_DOF_COLOR_FRAGMENT, entryPoint: "fs_scene_dof_color",
          uniforms: new Float32Array(4), views: [src.nativeView], target: input, textureLoadBindings: true });
      }
      const linear = this.createRenderTarget({ width: w, height: h, format: "rgba32f", depth: false, label: "a3d-webgpu-scene-dof-linear-depth" });
      scratch.push(linear);
      this.runWebGPUFullscreenPass({ label: "webgpu-scene-dof-linear-depth", fragment: webgpuAoLinearDepthFragment(depth.multisampled), entryPoint: "fs_ao_linear_depth",
        uniforms: linearUniforms, views: [depth.view], target: linear, textureLoadBindings: true, ...(depth.multisampled ? { multisampledDepthViews: [0] } : {}) });
      const result = driver.execute({ color: input, alpha: "opaque", depthModel: "single-surface", linearDepth: linear, depthEncoding: "linear-view-metres",
        maxGeometryDepthMeters: request.maxGeometryDepthMeters, skyDepthMeters: request.skyDepthMeters, options: request.options });
      succeeded = true;
      // The driver is dropped without dispose: its output now belongs to the caller's chain.
      return result.target;
    } finally {
      for (const target of scratch) target.dispose();
      if (!succeeded) { try { driver.dispose(); } catch { /* Preserve the original failure. */ } }
    }
  }

  /** The S10b user LUT on the display-referred chain; null (recorded) when the `.cube` is not loaded or invalid. */
  private executeWebGPUDisplayLut(color: RenderTarget, lut: NonNullable<WebGPUNativePostPresentationOptions["nativeLut"]>,
    diagnosticToken?: PostDiagnosticToken): RenderTarget | null {
    const source = lut.source;
    if (typeof source !== "string" || (typeof lut.cube !== "string" && !lut.data) || this.webgpuLutFailed.has(source)) return null;
    let entry = this.webgpuLuts.get(source);
    if (entry && entry.generation !== this.generation) { this.webgpuLuts.delete(source); entry = undefined; }
    if (!entry) {
      if (!this.device.createTexture) return null;
      let parsed: LutTexture3D;
      try { parsed = lut.data ?? parseCubeLut(lut.cube!); } catch (error) {
        this.webgpuLutFailed.add(source);
        const code = error instanceof Error ? /^[A-Z0-9_]+/.exec(error.message)?.[0] ?? "LUT_UPLOAD_FAILED" : "LUT_UPLOAD_FAILED";
        recordPostSkipped(`LUT_INVALID:${source}:${code}`, diagnosticToken);
        return null;
      }
      const n = parsed.size;
      const bytes = new Uint8Array(n * n * n * 4);
      for (let i = 0; i < bytes.length; i += 1) {
        const v = parsed.data[i] ?? 1;
        bytes[i] = Math.round(Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0)) * 255);
      }
      const texture = this.device.createTexture({ label: "a3d-webgpu-display-lut", size: [n, n, n], dimension: "3d", format: "rgba8unorm",
        usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST }) as WebGPUTextureLike & { destroy(): void };
      this.registerNativeCleanup(texture, []);
      this.device.queue.writeTexture?.({ texture }, bytes, { bytesPerRow: n * 4, rowsPerImage: n }, [n, n, n]);
      entry = { texture, view: texture.createView({ dimension: "3d" }), size: n, generation: this.generation };
      this.webgpuLuts.set(source, entry);
      while (this.webgpuLuts.size > 4) {
        const [oldest, value] = this.webgpuLuts.entries().next().value!;
        this.webgpuLuts.delete(oldest);
        this.retireNative(value.texture);
      }
    } else { this.webgpuLuts.delete(source); this.webgpuLuts.set(source, entry); }
    const src = this.requireRenderTarget(color);
    if (!src.nativeView) return null;
    const size = entry.size;
    const intensity = typeof lut.intensity === "number" && Number.isFinite(lut.intensity) ? Math.min(1, Math.max(0, lut.intensity)) : 1;
    const out = this.createRenderTarget({ width: src.width, height: src.height, format: src.colorTexture.format === "rgba8" ? "rgba8" : "rgba16f", depth: false, label: "a3d-webgpu-display-lut-out" });
    try {
      this.runWebGPUFullscreenPass({ label: "webgpu-display-lut", fragment: WEBGPU_DISPLAY_LUT_FRAGMENT, entryPoint: "fs_display_lut",
        uniforms: new Float32Array([size, 1 - intensity, 0, 0]), views: [src.nativeView, entry.view], target: out });
    } catch (error) { out.dispose(); throw error; }
    return out;
  }

  private executeWebGPUExposurePass(pass: WebGPUExposureDraw): void {
    const target = this.requireRenderTarget(pass.target);
    const sources = pass.sources.map(source => this.requireRenderTarget(source));
    if (!target.nativeTexture || !target.nativeView || sources.some(source => !source.nativeTexture || !source.nativeView)) {
      throw new RenderDeviceError("Auto exposure requires native color targets", "WEBGPU_AUTO_EXPOSURE_TARGET_UNAVAILABLE");
    }
    if (sources.some(source => source === target || source.nativeTexture === target.nativeTexture)) {
      throw new RenderDeviceError("Auto exposure source/output alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
    }
    for (const source of sources) this.flushNativeRenderTargetClear(source);
    this.runWebGPUFullscreenPass({ label: pass.label, fragment: pass.fragment, entryPoint: pass.entryPoint,
      uniforms: pass.uniforms, views: sources.map(source => source.nativeView), target, exposureBindings: true,
      accesses: [...sources.map(source => ({ resource: source.nativeTexture!, mode: "read" as const })), { resource: target.nativeTexture, mode: "write" }] });
  }

  private assertNativeDofTarget(target: RenderTarget): WebGPURenderTarget {
    const owned = this.requireRenderTarget(target);
    if (!owned.nativeTexture || !owned.nativeView || owned.colorTexture.disposed) throw new RenderDeviceError("Native depth-of-field target is unavailable", "WEBGPU_DOF_TARGET_UNSUPPORTED");
    for (const native of [owned.nativeTexture, owned.nativeDepthTexture, ...owned.nativeExtraColors.map(color => color.native)]) {
      if (native) this.resourceInterop.assertUsable(native);
    }
    return owned;
  }

  private submitNativeDofPass(args: {
    readonly label: string; readonly fragment: string; readonly entryPoint: string; readonly target: RenderTarget;
    readonly inputs: readonly { readonly binding: number; readonly native: WebGPUTextureLike; readonly view: unknown; readonly sampleType: "depth" | "float" | "unfilterable-float" }[];
    readonly uniforms?: Uint8Array; readonly sampler?: boolean; readonly constants?: Readonly<Record<string, number>>;
  }, assertCurrent: () => void): void {
    this.assertAlive();
    if (!this.device.createBindGroupLayout || !this.device.createPipelineLayout || !this.device.createShaderModule ||
        !this.device.createRenderPipeline || !this.device.createCommandEncoder || !this.device.createBindGroup ||
        (args.sampler && !this.device.createSampler)) throw new RenderDeviceError("Native depth-of-field layouts are unavailable", "WEBGPU_DOF_HOST_UNAVAILABLE");
    const target = this.assertNativeDofTarget(args.target), output = target.nativeTexture!;
    if (target.nativeExtraColors.length || target.sampleCount !== 1 || args.inputs.some(input => input.native === output)) {
      throw new RenderDeviceError("Native depth-of-field input/output alias", "POSTPROCESS_INPUT_OUTPUT_ALIAS");
    }
    const check = (): void => {
      assertCurrent();
      this.assertNativeDofTarget(target);
      for (const input of args.inputs) this.resourceInterop.assertUsable(input.native);
    };
    check();
    const layoutEntries: WebGPUBindGroupLayoutEntryLike[] = [
      ...(args.uniforms ? [{ binding: 0, visibility: 2, buffer: { type: "uniform" as const } }] : []),
      ...args.inputs.map(input => ({ binding: input.binding, visibility: 2, texture: { sampleType: input.sampleType, viewDimension: "2d" as const } })),
      ...(args.sampler ? [{ binding: 4, visibility: 2, sampler: { type: "filtering" as const } }] : [])
    ];
    const key = JSON.stringify(["native-dof", args.label, args.entryPoint, webgpuTextureFormat(target.colorTexture.format),
      layoutEntries, args.constants ?? null, args.fragment]);
    let pipeline = this.webgpuPostPipelines.get(key);
    if (!pipeline) {
      const bindLayout = this.device.createBindGroupLayout({ label: `${args.label}-bind-layout`, entries: layoutEntries });
      const layout = this.device.createPipelineLayout({ label: `${args.label}-pipeline-layout`, bindGroupLayouts: [bindLayout] });
      const vertex = this.device.createShaderModule({ label: `${args.label}-vs`, code: WEBGPU_POST_VERTEX_WGSL });
      const fragment = this.device.createShaderModule({ label: `${args.label}-fs`, code: args.fragment });
      pipeline = this.device.createRenderPipeline({ label: `${args.label}-pipeline`, layout,
        vertex: { module: vertex, entryPoint: "vs_post" },
        fragment: { module: fragment, entryPoint: args.entryPoint, targets: [{ format: webgpuTextureFormat(target.colorTexture.format) }],
          ...(args.constants ? { constants: args.constants } : {}) }, primitive: { topology: "triangle-list" } });
      this.webgpuPostPipelines.set(key, pipeline);
      this.nativeRenderPipelinesCreated += 1;
    }
    check();
    let uniform: WebGPUBufferLike | undefined;
    let registered = false;
    try {
      if (args.uniforms) {
        uniform = this.device.createBuffer({ label: `${args.label}-uniforms`, size: args.uniforms.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
        const buffer = uniform;
        this.registerNativeCleanup(buffer, []);
        registered = true;
        if (this.#mrtSubmissionActive) throw new RenderDeviceError("Native depth-of-field upload cannot be reentered", "WEBGPU_MRT_SUBMISSION_ACTIVE");
        this.#mrtSubmissionActive = true;
        this.#mrtPinnedHandles.add(buffer);
        try { this.device.queue.writeBuffer(buffer, 0, args.uniforms); }
        finally {
          this.#mrtPinnedHandles.delete(buffer);
          this.#mrtSubmissionActive = false;
          const deferred = [...this.#mrtDeferredRetirements];
          this.#mrtDeferredRetirements.clear();
          for (const resource of deferred) this.retireNative(resource);
        }
      }
      check();
      const bindLayout = pipeline.getBindGroupLayout?.(0);
      if (!bindLayout) throw new RenderDeviceError("Native depth-of-field bind layout is unavailable", "WEBGPU_DOF_HOST_UNAVAILABLE");
      const sampler = args.sampler ? this.device.createSampler!({ minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" }) : undefined;
      const group = this.device.createBindGroup({ label: `${args.label}-bind`, layout: bindLayout,
        entries: [...(uniform ? [{ binding: 0, resource: { buffer: uniform } }] : []),
          ...args.inputs.map(input => ({ binding: input.binding, resource: input.view })), ...(sampler ? [{ binding: 4, resource: sampler }] : [])] });
      const encoder = this.device.createCommandEncoder({ label: `${args.label}-encoder` });
      const pass = encoder.beginRenderPass({ label: `${args.label}-pass`, colorAttachments: [{ view: target.nativeView, clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store" }] });
      if (!pass.setBindGroup) throw new RenderDeviceError("Native depth-of-field pass cannot bind resources", "WEBGPU_DOF_HOST_UNAVAILABLE");
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.draw(3, 1, 0); pass.end();
      const finished = encoder.finish();
      check();
      this.submitMrtAware([finished], [...args.inputs.map(input => ({ resource: input.native, mode: "read" as const })),
        { resource: output, mode: "write" as const }, ...(uniform ? [{ resource: uniform, mode: "read" as const }] : [])], true);
      target.nativeNeedsClear = false;
      this.nativeRenderPasses += 1;
      this.nativeSubmissions += 1;
    } finally {
      if (uniform) {
        if (registered) this.retireNative(uniform);
        else this.retireUnregisteredNative(uniform);
      }
    }
  }

  private executeNativeLinearDepthPass(pass: WebGPULinearDepthDraw, assertCurrent: () => void): void {
    const source = this.assertNativeDofTarget(pass.source), target = this.assertNativeDofTarget(pass.target);
    const depth = source.nativeDepthTexture;
    if (!depth || !source.depthTexture || pass.sourceAspect !== "depth-only") throw new RenderDeviceError("Native depth-of-field source has no depth attachment", "WEBGPU_DOF_TARGET_UNSUPPORTED");
    const depthView = depth.createView({ aspect: "depth-only" });
    const inputs: Array<{ binding: number; native: WebGPUTextureLike; view: unknown; sampleType: "depth" | "float" | "unfilterable-float" }> = [
      { binding: 1, native: depth, view: depthView, sampleType: "depth" }
    ];
    if (pass.coverage) {
      const coverage = this.assertNativeDofTarget(pass.coverage.target);
      const index = pass.coverage.colorAttachment;
      const texture = (coverage.colorTextures ?? [coverage.colorTexture])[index];
      const native = texture && coverage.nativeColorFor(texture), view = texture && coverage.nativeSampledViewFor(texture);
      if (!texture || texture.disposed || !native || !view || texture.format !== "rgba8") throw new RenderDeviceError("Native depth coverage attachment is unavailable", "WEBGPU_DOF_TARGET_UNSUPPORTED");
      inputs.push({ binding: 2, native, view, sampleType: "float" });
    }
    this.submitNativeDofPass({ label: pass.label, fragment: pass.fragment, entryPoint: pass.entryPoint, target,
      inputs, uniforms: pass.uniforms }, assertCurrent);
  }

  private executeNativeDofPass(pass: WebGPUDepthOfFieldDraw, assertCurrent: () => void): void {
    const inputs = pass.textures.map(binding => {
      const target = this.assertNativeDofTarget(binding.target);
      return { binding: binding.binding, native: target.nativeTexture!, view: target.nativeSampledView ?? target.nativeView!, sampleType: binding.sampleType };
    });
    this.submitNativeDofPass({ label: pass.label, fragment: pass.fragment, entryPoint: pass.entryPoint, target: pass.target,
      inputs, uniforms: pass.uniforms, sampler: Boolean(pass.sampler), constants: pass.constants }, assertCurrent);
  }

  /**
   * Execute the authored display-space effects in order. The returned target
   * is caller-owned; borrowed effect textures and history remain device-owned.
   */
  executeWebGPUNativeEffects(source: RenderTarget, effects: readonly NativePostEffect[], frame?: WebGPUNativePostFrame): RenderTarget {
    const capturedFrame = snapshotNativePostFrame(frame);
    const capturedEffects = snapshotNativePostEffects(effects);
    if (capturedFrame && (this.#nativePostOwners.has(capturedFrame.scopeId) || this.#nativePostTransactions.has(capturedFrame.scopeId))) {
      throw new RenderDeviceError("Native post scope belongs to another operation", "POSTPROCESS_HISTORY_FRAME_BUSY");
    }
    return this.executeWebGPUNativeEffectsTransaction(source, capturedEffects, capturedFrame);
  }

  private executeWebGPUNativeEffectsTransaction(source: RenderTarget, effects: readonly NativePostEffect[],
    frame?: WebGPUNativePostFrame, transaction?: WebGPUPostHistoryTransaction): RenderTarget {
    this.assertAlive();
    const diagnosticToken = frame?.diagnosticToken;
    const initial = this.requireRenderTarget(source);
    if (!initial.nativeTexture || !initial.nativeView || initial.colorTexture.format !== "rgba8" || initial.sampleCount !== 1) {
      throw new RenderDeviceError("Native display effects require a single-sample rgba8 source", "WEBGPU_NATIVE_EFFECT_SOURCE_UNSUPPORTED");
    }
    if (!Array.isArray(effects)) throw new RenderDeviceError("Native effects must be an array", "WEBGPU_NATIVE_EFFECTS_INVALID");
    for (const effect of effects) {
      validateNativePostEffect(effect);
      if ("texture" in effect && !effect.texture.usage.includes("sampled")) {
        throw new RenderDeviceError("Native effect texture requires sampled usage", "WEBGPU_SAMPLED_TEXTURE_REQUIRED", { effect: effect.kind });
      }
      if ("texture" in effect && getRenderTargetTextureOwner(effect.texture) !== undefined && getRenderTargetTextureOwner(effect.texture) !== this) {
        throw new RenderDeviceError("Native effect texture belongs to another device", "FOREIGN_RESOURCE", { effect: effect.kind });
      }
    }
    if (effects.some((effect) => effect.kind === "afterimage")) validateNativePostFrame(frame);
    if (!transaction && frame && effects.some(effect => effect.kind === "afterimage") &&
        (this.#nativePostOwners.has(frame.scopeId) || this.#nativePostTransactions.has(frame.scopeId))) {
      throw new RenderDeviceError("Native post scope belongs to another operation", "POSTPROCESS_HISTORY_FRAME_BUSY");
    }
    const assertTransaction = (): void => {
      if (transaction && (!frame || this.#nativePostTransactions.get(frame.scopeId) !== transaction || transaction.invalid ||
          transaction.frameId !== frame.frameId || transaction.generation !== this.generation || this.disposed || this.contextLost ||
          (transaction.managed && (!transaction.pass || !transaction.pass.presenting ||
            transaction.pass.viewId !== frame.viewId || transaction.pass.diagnosticToken !== frame.diagnosticToken ||
            transaction.pass.deviceFrameToken !== this.activeFrameToken)))) {
        throw new RenderDeviceError("Native post transaction changed during submission", "POSTPROCESS_HISTORY_FRAME_STALE");
      }
    };
    assertTransaction();
    this.reclaimWebGPUPostUniformBuffers();
    this.flushNativeRenderTargetClear(initial);
    let current = initial;
    let mask: Extract<NativePostEffect, { kind: "mask" }> | undefined;
    const transient = new Set<RenderTarget>();
    const histories: ReturnType<PostViewHistory<RenderTarget>["begin"]>[] = [];
    let output: RenderTarget | undefined;
    const allocate = (label: string): RenderTarget => {
      const target = this.createRenderTarget({ width: source.width, height: source.height, format: "rgba8", depth: false, label });
      transient.add(target);
      return target;
    };
    try {
      for (const [effectIndex, effect] of effects.entries()) {
        if (effect.kind === "mask") { mask = effect; continue; }
        if (effect.kind === "clear-mask") { mask = undefined; continue; }
        let history: ReturnType<PostViewHistory<RenderTarget>["begin"]> | undefined;
        if (effect.kind === "afterimage") {
          const identity = frame!;
          let views = this.nativeEffectViews.get(identity.scopeId);
          if (!views) { views = new Set(); this.nativeEffectViews.set(identity.scopeId, views); }
          views.add(identity.viewId);
          history = this.withNativePostOwnerOperation(() => this.nativeEffectHistory.begin({ ...identity, effectIndex, width: source.width, height: source.height, deviceGeneration: this.generation },
            (width, height) => this.createNativePostTarget({ width, height, format: "rgba8", depth: false, label: "webgpu-afterimage-history" }),
            (target) => this.releaseNativePostTarget(target)));
          histories.push(history);
          if (transaction) {
            let view = transaction.views.get(identity.viewId);
            if (!view) { view = new Map(); transaction.views.set(identity.viewId, view); }
            view.set(effectIndex, history);
          }
        }
        const target = history?.write ?? allocate(`webgpu-effect-${effectIndex}-${effect.kind}`);
        const destination = this.requireRenderTarget(target);
        const sourceNative = current.nativeTexture!;
        const auxiliary = effect.kind === "transition" || effect.kind === "lens-dirt"
          ? this.getNativeEffectTexture(effect.texture, effect.kind)
          : history?.read ? this.requireRenderTarget(history.read).nativeTexture! : sourceNative;
        const maskNative = mask ? this.getNativeEffectTexture(mask.texture, "mask") : sourceNative;
        if (!destination.nativeTexture || [sourceNative, auxiliary, maskNative].includes(destination.nativeTexture)) {
          throw new RenderDeviceError("Native post effect reads its output attachment", "POSTPROCESS_INPUT_OUTPUT_ALIAS", { effect: effect.kind });
        }
        const uniforms = nativeEffectUniforms(effect, source.width, source.height, frame?.frameId ?? 0, Boolean(history?.read), mask);
        this.runWebGPUFullscreenPass({ label: `webgpu-native-effect-${effectIndex}-${effect.kind}`, fragment: NATIVE_EFFECT_WGSL, entryPoint: "nativeEffect",
          uniforms, views: [sourceNative.createView(), auxiliary.createView(), maskNative.createView()], target,
          nativeEffectBindings: true,
          accesses: [{ resource: sourceNative, mode: "read" }, { resource: auxiliary, mode: "read" }, { resource: maskNative, mode: "read" }, { resource: destination.nativeTexture, mode: "write" }]
        });
        assertTransaction();
        recordPostStage(`native:${effect.kind}`, diagnosticToken);
        current = destination;
      }
      // Always return independent caller-owned output, including when the last
      // stage writes persistent history or the sequence contains only masks.
      output = allocate("webgpu-native-effects-output");
      const destination = this.requireRenderTarget(output);
      this.runWebGPUFullscreenPass({ label: "webgpu-native-effects-copy", fragment: WEBGPU_NATIVE_COPY_FRAGMENT, entryPoint: "fs_copy",
        uniforms: new Float32Array([1 / source.width, 1 / source.height, 0, 0]), views: [current.nativeView], target: output,
        accesses: [{ resource: current.nativeTexture!, mode: "read" }, { resource: destination.nativeTexture!, mode: "write" }] });
      assertTransaction();
      if (!transaction) for (const history of histories) history.commit();
      transient.delete(output);
      return output;
    } catch (error) {
      // A repeated pass can have overwritten a previously committed write in
      // this same frame. Abort every acquired lease, even if the failure came
      // from a later effect or the final copy. A stale lease must not replace
      // the original renderer error.
      for (const history of histories) {
        try { history.abort(); } catch { /* Preserve the original render failure. */ }
      }
      if (transaction) transaction.invalid = true;
      throw error;
    } finally {
      for (const target of transient) target.dispose();
    }
  }

  private getNativeEffectTexture(texture: Texture, effect: string): WebGPUTextureLike {
    if ((texture.format === "r32f" || texture.format === "rgba32f") && !this.device.features?.has("float32-filterable")) {
      throw new RenderDeviceError("Native effect float32 textures require float32-filterable", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED", { effect });
    }
    return this.getNativeSampledTexture(texture);
  }

  private createNativePostTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    const target = this.createRenderTarget(descriptor);
    this.nativePostOwnedTargets.add(target);
    return target;
  }

  private releaseNativePostTarget(target: RenderTarget): void {
    // A target can reenter device disposal from one of its attachment
    // callbacks. Do not invoke its potentially wrapped disposer a second time;
    // retain it independently in case the outer attempt subsequently fails.
    if (target instanceof WebGPURenderTarget && target.nativeDisposalInProgress) {
      this.deviceTargetDisposalAttempts?.add(target);
      this.pendingRenderTargetDisposals.add(target);
      return;
    }
    // The wrapper may have thrown after logical cleanup completed; retry only
    // native retirement rather than repeating its completed side effects.
    if (target instanceof WebGPURenderTarget && target.nativeDisposalComplete) {
      this.deviceTargetDisposalAttempts?.add(target);
      target.retryNativeRetirements();
    } else {
      target.dispose();
    }
  }

  /** A history acquisition or exposure resize may synchronously release targets. */
  private withNativePostOwnerOperation<T>(operation: () => T): T {
    this.nativePostCleanupDepth += 1;
    try { return operation(); } finally { this.nativePostCleanupDepth -= 1; }
  }

  releaseNativePostEffectView(scopeId: object, viewId: string | number): void {
    const transaction = this.#nativePostTransactions.get(scopeId);
    if (transaction?.views.has(viewId)) { transaction.invalid = true; transaction.invalidatedViews.add(viewId); }
    const views = this.nativeEffectViews.get(scopeId);
    const failures: unknown[] = [];
    this.nativePostCleanupDepth += 1;
    try {
      try { this.webgpuAutoExposure?.resetView(scopeId, viewId); } catch (error) { failures.push(error); }
      try { this.nativeEffectHistory.resetView(scopeId, viewId); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, "Failed to release native post view");
      views?.delete(viewId);
      if (views?.size === 0) this.nativeEffectViews.delete(scopeId);
    } finally {
      this.nativePostCleanupDepth -= 1;
    }
  }

  releaseNativePostEffectScope(scopeId: object): void {
    const transaction = this.#nativePostTransactions.get(scopeId);
    if (transaction?.views.size) {
      transaction.invalid = true;
      for (const viewId of transaction.views.keys()) transaction.invalidatedViews.add(viewId);
    }
    const failures: unknown[] = [];
    this.nativePostCleanupDepth += 1;
    try {
      try { this.webgpuAutoExposure?.resetScope(scopeId); } catch (error) { failures.push(error); }
      try { this.nativeEffectHistory.resetScope(scopeId); } catch (error) { failures.push(error); }
      if (failures.length) throw new AggregateError(failures, "Failed to release native post scope");
      this.nativeEffectViews.delete(scopeId);
    } finally {
      this.nativePostCleanupDepth -= 1;
    }
  }

  /**
   * The source's own depth attachment for the native depth stages. A 4x
   * attachment is read at sample 0; no public sampleable depth texture is
   * required, because the attachment is always created with texture binding.
   */
  private webgpuDepthStageDepth(depthSource: RenderTarget): { readonly view: unknown; readonly multisampled: boolean } {
    const owned = this.requireRenderTarget(depthSource);
    const depth = owned.nativeDepthTexture;
    if (!depth) throw new RenderDeviceError("Native depth post stages need the source depth attachment", "WEBGPU_DEPTH_STAGE_DEPTH_UNAVAILABLE", { label: owned.label });
    this.resourceInterop.assertUsable(depth);
    return { view: depth.createView({ aspect: "depth-only" }), multisampled: (owned.sampleCount ?? 1) > 1 };
  }

  private webgpuDepthStageColor(current: RenderTarget, format: "rgba16f" | "rgba8", stage: string): WebGPURenderTarget {
    const color = this.requireRenderTarget(current);
    if (!color.nativeView || color.colorTexture.disposed || color.colorTexture.format !== format) {
      throw new RenderDeviceError(`Native ${stage} requires a live ${format} source`, "WEBGPU_DEPTH_STAGE_SOURCE_UNSUPPORTED", { stage, format: color.colorTexture.format });
    }
    this.flushNativeRenderTargetClear(color);
    return color;
  }

  /** S4 god rays: half-res radial march from depth, then an additive full-res composite. Returns a caller-owned target. */
  private executeWebGPUGodRays(current: RenderTarget, depthSource: RenderTarget, request: WebGPUGodRaysRequest): RenderTarget {
    const color = this.webgpuDepthStageColor(current, "rgba16f", "god rays");
    const depth = this.webgpuDepthStageDepth(depthSource);
    const width = color.width, height = color.height;
    const halfWidth = Math.max(1, width >> 1), halfHeight = Math.max(1, height >> 1);
    const shafts = this.createRenderTarget({ width: halfWidth, height: halfHeight, format: "rgba16f", depth: false, label: "a3d-webgpu-godrays-half" });
    let out: RenderTarget | undefined;
    try {
      this.runWebGPUFullscreenPass({ label: depth.multisampled ? "webgpu-godrays-ms" : "webgpu-godrays", fragment: webgpuGodRaysFragment(depth.multisampled),
        entryPoint: "fs_godrays", uniforms: webgpuGodRaysUniforms(request, width, halfWidth, halfHeight), views: [color.nativeView, depth.view], target: shafts });
      out = this.createRenderTarget({ width, height, format: "rgba16f", depth: false, label: "a3d-webgpu-godrays" });
      this.runWebGPUFullscreenPass({ label: "webgpu-godrays-composite", fragment: WEBGPU_GODRAYS_COMPOSITE_FRAGMENT, entryPoint: "fs_godrays_composite",
        uniforms: new Float32Array([1 / width, 1 / height, 0, 0]), views: [color.nativeView, this.requireRenderTarget(shafts).nativeView], target: out });
      this.nativeDepthStagePasses += 2;
      return out;
    } catch (error) {
      out?.dispose();
      throw error;
    } finally {
      shafts.dispose();
    }
  }

  /** S7 camera motion blur: depth-reprojected velocity, tile max, 3x3 neighbour max, McGuire reconstruction. */
  private executeWebGPUMotionBlur(current: RenderTarget, depthSource: RenderTarget, request: WebGPUMotionBlurRequest): RenderTarget {
    const color = this.webgpuDepthStageColor(current, "rgba16f", "motion blur");
    const depth = this.webgpuDepthStageDepth(depthSource);
    const width = color.width, height = color.height;
    const depthOwner = this.requireRenderTarget(depthSource);
    if (depthOwner.width !== width || depthOwner.height !== height) {
      throw new RenderDeviceError("Native motion blur depth must match the color size", "WEBGPU_DEPTH_STAGE_SOURCE_UNSUPPORTED");
    }
    const tileWidth = Math.max(1, Math.ceil(width / request.tileSize)), tileHeight = Math.max(1, Math.ceil(height / request.tileSize));
    const scratch: RenderTarget[] = [];
    const make = (w: number, h: number, label: string): RenderTarget => {
      const target = this.createRenderTarget({ width: w, height: h, format: "rgba16f", depth: false, label });
      scratch.push(target);
      return target;
    };
    let out: RenderTarget | undefined;
    try {
      const velocity = make(width, height, "a3d-webgpu-motion-velocity");
      this.runWebGPUFullscreenPass({ label: depth.multisampled ? "webgpu-motion-velocity-ms" : "webgpu-motion-velocity", fragment: webgpuMotionVelocityFragment(depth.multisampled),
        entryPoint: "fs_motion_velocity", uniforms: webgpuMotionVelocityUniforms(request, width, height), views: [depth.view], target: velocity });
      const tiles = make(tileWidth, tileHeight, "a3d-webgpu-motion-tiles");
      this.runWebGPUFullscreenPass({ label: "webgpu-motion-tile", fragment: WEBGPU_MOTION_TILE_MAX_FRAGMENT, entryPoint: "fs_motion_tile",
        uniforms: webgpuMotionTileUniforms(request), views: [this.requireRenderTarget(velocity).nativeView], target: tiles });
      const neighbor = make(tileWidth, tileHeight, "a3d-webgpu-motion-neighbor");
      this.runWebGPUFullscreenPass({ label: "webgpu-motion-neighbor", fragment: WEBGPU_MOTION_NEIGHBOR_FRAGMENT, entryPoint: "fs_motion_neighbor",
        uniforms: webgpuMotionTileUniforms(request), views: [this.requireRenderTarget(tiles).nativeView], target: neighbor });
      out = this.createRenderTarget({ width, height, format: "rgba16f", depth: false, label: "a3d-webgpu-motion-blur" });
      this.runWebGPUFullscreenPass({ label: depth.multisampled ? "webgpu-motion-reconstruct-ms" : "webgpu-motion-reconstruct", fragment: webgpuMotionReconstructFragment(depth.multisampled),
        entryPoint: "fs_motion_reconstruct", uniforms: webgpuMotionReconstructUniforms(request),
        views: [color.nativeView, this.requireRenderTarget(neighbor).nativeView, depth.view], target: out });
      this.nativeDepthStagePasses += 4;
      return out;
    } catch (error) {
      out?.dispose();
      throw error;
    } finally {
      for (const target of scratch) target.dispose();
    }
  }

  /** Legacy `volumetric-light` on the display-space frame: a GPU port of the CPU radial kernel. */
  private executeWebGPUVolumetricLight(current: RenderTarget, depthSource: RenderTarget, options: Readonly<Record<string, unknown>>,
    depthRange?: { readonly near: number; readonly far: number }): RenderTarget {
    if (options.depth) throw new RenderDeviceError("Native volumetric light reads the frame depth; a caller depth binding is unsupported", "WEBGPU_POSTPROCESS_UNSUPPORTED", { pass: "volumetric-light" });
    const input = resolveWebGPUVolumetricLight(options);
    const color = this.webgpuDepthStageColor(current, "rgba8", "volumetric light");
    const depth = this.webgpuDepthStageDepth(depthSource);
    const near = depthRange && Number.isFinite(depthRange.near) && depthRange.near > 0 ? depthRange.near : 0.1;
    const far = depthRange && Number.isFinite(depthRange.far) && depthRange.far > near ? depthRange.far : 1000;
    const out = this.createRenderTarget({ width: color.width, height: color.height, format: "rgba8", depth: false, label: "a3d-webgpu-volumetric-light" });
    try {
      this.runWebGPUFullscreenPass({ label: depth.multisampled ? "webgpu-volumetric-light-ms" : "webgpu-volumetric-light", fragment: webgpuVolumetricLightFragment(depth.multisampled),
        entryPoint: "fs_volumetric_light", uniforms: webgpuVolumetricLightUniforms(input, color.width, color.height, { mode: this.depthConvention.mode, near, far }),
        views: [color.nativeView, depth.view], target: out });
      this.nativeDepthStagePasses += 1;
      return out;
    } catch (error) {
      out.dispose();
      throw error;
    }
  }

  /** Resolve GPU velocity/history into caller-owned historyOutput, returning scene-alpha color. */
  executeWebGPUTaa(source: RenderTarget, options: WebGPUTemporalInputs): RenderTarget {
    this.assertAlive();
    if (options.v2) throw new RenderDeviceError("WebGPU temporal reconstruction v2 is not connected to the native resolve", "WEBGPU_TEMPORAL_V2_UNSUPPORTED");
    const [blend, depthThreshold] = normalizeWebGPUTemporalOptions(options);
    const targets = [source, options.velocity, options.history, options.historyOutput];
    if (new Set(targets).size !== targets.length) throw new RenderDeviceError("TAA targets must not alias", "NATIVE_POST_UNSUPPORTED");
    const native = targets.map((target) => this.requireRenderTarget(target));
    if (native.some((target) => target.width !== source.width || target.height !== source.height || !target.nativeView)) {
      throw new RenderDeviceError("TAA requires same-size native source, velocity and history targets", "NATIVE_POST_UNSUPPORTED");
    }
    if (targets.slice(1).some((target) => target.colorTexture.format !== "rgba16f")) {
      throw new RenderDeviceError("TAA velocity/history targets require rgba16f", "NATIVE_POST_UNSUPPORTED");
    }
    const out = this.createRenderTarget({ width: source.width, height: source.height, format: "rgba16f", label: "a3d-webgpu-taa-color" });
    try {
      this.runWebGPUFullscreenPass({ label: "webgpu-taa", fragment: WEBGPU_TAA_FRAGMENT, entryPoint: "fs_taa",
        uniforms: new Float32Array([1 / source.width, 1 / source.height, blend, options.historyValid ? 1 : 0, depthThreshold, 0, 0, 0]),
        views: native.slice(0, 3).map((target) => target.nativeView), target: options.historyOutput });
      this.runWebGPUFullscreenPass({ label: "webgpu-taa-output", fragment: WEBGPU_TAA_OUTPUT_FRAGMENT, entryPoint: "fs_taa_output",
        uniforms: new Float32Array([1 / source.width, 1 / source.height, 0, 0]),
        views: [native[3]!.nativeView, native[0]!.nativeView], target: out });
      this.nativeTaaPasses += 2;
      this.nativeTemporalBindings += 3;
      return out;
    } catch (error) { out.dispose(); throw error; }
  }

  /**
   * SH-03: maps each registered custom pass's `insertAt` anchor onto a position
   * in this native chain — `position` runs BEFORE `options.passes[position]` and
   * `options.passes.length` runs after the last pass (before the present copy).
   * Deterministic fallbacks keep passes attached when their anchor stage is not
   * in the submitted chain. Passes sharing a position sort by `order` ascending
   * (stable — registration order preserved for omitted keys).
   */
  private webgpuCustomPassPositions(passes: readonly { readonly name: string }[], scopeId?: object): Map<number, PostPassDescriptor[]> {
    const positions = new Map<number, PostPassDescriptor[]>();
    const customs = registeredPostPasses().filter(pass => pass.postScopeMatches?.(scopeId) !== false);
    if (!customs.length) return positions;
    const indexOf = (...names: readonly string[]): number => passes.findIndex((pass) => names.includes(pass.name));
    const anchorPosition = (insertAt: PostPassDescriptor["insertAt"]): number => {
      switch (insertAt) {
        case "after-depth": return 0;
        case "before-taa": {
          const taa = indexOf("taa");
          if (taa >= 0) return taa;
          const bloom = indexOf("bloom");
          return bloom >= 0 ? bloom : 0;
        }
        case "after-taa": {
          const taa = indexOf("taa");
          if (taa >= 0) return taa + 1;
          // No TAA: the anchor still precedes bloom (v2 graph order is TAA → after-taa → bloom).
          const bloom = indexOf("bloom");
          return bloom >= 0 ? bloom : 0;
        }
        case "before-tonemap": {
          const tone = indexOf("tone-mapping");
          return tone >= 0 ? tone : passes.length;
        }
        case "after-tonemap": {
          const tone = indexOf("tone-mapping");
          const fxaa = indexOf("fxaa");
          return tone >= 0 ? tone + 1 : fxaa >= 0 ? fxaa : passes.length;
        }
        default: return passes.length;
      }
    };
    const orderKey = (pass: PostPassDescriptor): number =>
      typeof pass.order === "number" && Number.isFinite(pass.order) ? pass.order : Number.MAX_SAFE_INTEGER;
    for (const pass of [...customs].sort((a, b) => orderKey(a) - orderKey(b))) {
      const position = anchorPosition(pass.insertAt);
      const list = positions.get(position) ?? [];
      list.push(pass);
      positions.set(position, list);
    }
    return positions;
  }

  /**
   * SH-03/SH-06: one C-13 custom pass as a native WGSL fullscreen draw.
   *
   * Bind convention (fixed by runWebGPUFullscreenPass): binding 0 = uniform
   * buffer (`vec4f` array — `values[0]` is `vec4(texelSize, timeSeconds, 0)`,
   * declared uniforms follow in registration order, one vec4 each), binding 1 =
   * linear sampler, and binding 2 = `u_color`. Auxiliary inputs are not wired
   * into this custom-pass chain and must not be replaced with fabricated data.
   * The authored `fragment.wgsl` is a complete fragment stage; its `@fragment`
   * entry point is detected or defaults to `fs_main`.
   *
   * Returns null when disabled, missing WGSL, or requesting unavailable inputs;
   * the latter two cases are recorded in the post skipped-reasons channel.
   */
  private executeWebGPUCustomPass(pass: PostPassDescriptor, source: RenderTarget, diagnosticToken: PostDiagnosticToken | undefined,
    frame: { readonly timeSeconds: number; readonly frameIndex: number; readonly postScopeId?: object; readonly blackboard: Map<string, unknown> }): RenderTarget | null {
    const timeSeconds = frame.timeSeconds;
    const frameContext = {
      device: this,
      width: source.width,
      height: source.height,
      timeSeconds,
      frameIndex: frame.frameIndex,
      postScopeId: frame.postScopeId,
      blackboard: frame.blackboard
    } as unknown as FrameContributorContext;
    if (pass.enabled && !pass.enabled(frameContext)) return null;
    // Skip reasons persist per view, so withdraw inputs no longer requested by
    // a pass re-registered under the same ID.
    for (const input of ["depth", "velocity", "normal", "reactive"] as const) {
      if (!pass.inputs.includes(input)) clearPostSkipped(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:${input}`, diagnosticToken);
    }
    let missingInput = false;
    for (const input of pass.inputs) {
      if (input === "color") continue;
      recordPostSkipped(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:${input}`, diagnosticToken);
      missingInput = true;
    }
    const wgsl = pass.fragment.wgsl;
    if (typeof wgsl !== "string" || !wgsl.trim()) {
      recordPostSkipped(`WGSL_PROGRAM_MISSING:${pass.id}`, diagnosticToken);
      return null;
    }
    if (missingInput) return null;
    const src = this.requireRenderTarget(source);
    const srcView = src.nativeView;
    if (!srcView) {
      throw new RenderDeviceError("WebGPU custom pass source target has no native view", "NATIVE_POST_UNSUPPORTED", { label: src.label });
    }
    this.flushNativeRenderTargetClear(src);
    recordPostStage(`custom:${pass.id}@${pass.insertAt}`, diagnosticToken);
    const target = this.createRenderTarget({
      width: src.width,
      height: src.height,
      format: pass.space === "display" ? "rgba8" : "rgba16f",
      label: `a3d-webgpu-custom-${pass.id}`
    });
    const views: unknown[] = [srcView];
    const declared = pass.uniforms?.(frameContext) ?? {};
    const packed: number[] = [1 / src.width, 1 / src.height, timeSeconds, 0];
    for (const value of Object.values(declared)) {
      const scalars = Array.isArray(value) ? [...value] : [value];
      for (let offset = 0; offset < Math.max(1, scalars.length); offset += 4) {
        for (let lane = 0; lane < 4; lane += 1) packed.push(Number.isFinite(scalars[offset + lane]) ? scalars[offset + lane]! : 0);
      }
    }
    const entryPoint = wgsl.match(/@fragment\s*fn\s+([A-Za-z_]\w*)/)?.[1] ?? "fs_main";
    try {
      this.runWebGPUFullscreenPass({
        label: `webgpu-custom:${pass.id}`,
        fragment: wgsl,
        entryPoint,
        uniforms: new Float32Array(packed),
        views,
        target
      });
      return target;
    } catch (error) {
      target.dispose();
      throw error;
    }
  }

  private runWebGPUFullscreenPass(args: {
    readonly label: string;
    readonly fragment: string;
    readonly entryPoint: string;
    readonly uniforms: ArrayBufferView;
    readonly views: readonly unknown[];
    readonly target: RenderTarget | null;
    /** Internal one-mip attachment view for a mipmapped target. */
    readonly targetViewOverride?: unknown;
    readonly nativeEffectBindings?: boolean;
    readonly exposureBindings?: boolean;
    /** Explicit layout: uniforms at 0, 1-4 `unfilterable-float` textures from binding 2, no sampler. */
    readonly textureLoadBindings?: boolean;
    /** Per-view override for `textureLoadBindings`: a 4x depth attachment bound as `texture_depth_multisampled_2d`. */
    readonly multisampledDepthViews?: readonly number[];
    readonly reuseUniforms?: boolean;
    readonly accesses?: readonly { readonly resource: object; readonly mode: "read" | "write" | "readwrite" }[];
    /** Internal resource lease and frame validation for externally visible presentation. */
    readonly protectedSubmission?: boolean;
    readonly beforeSubmit?: () => void;
  }): void {
    // These target-to-target passes have their own encoders and may run after
    // the renderer frame has closed.
    this.assertAlive();
    const target = args.target ? this.requireRenderTarget(args.target) : null;
    if (target?.nativeExtraColors.length) throw new RenderDeviceError("This post pass supports only a single color attachment", "WEBGPU_MRT_SURFACE_UNSUPPORTED");
    const targetView = args.targetViewOverride ?? (target ? target.nativeView : this.canvasContext?.getCurrentTexture().createView());
    if (!targetView) {
      throw new RenderDeviceError("WebGPU post target has no native view", "NATIVE_POST_UNSUPPORTED", { label: target?.label ?? "canvas" });
    }
    const loadBindings = Boolean(args.exposureBindings || args.textureLoadBindings);
    if (!this.device.createShaderModule || !this.device.createRenderPipeline || !this.device.createCommandEncoder
      || (!loadBindings && !this.device.createSampler) || !this.device.createBuffer || !this.device.createBindGroup) {
      throw new RenderDeviceError("WebGPU fullscreen post requires shader/pipeline/buffer natives", "NATIVE_POST_UNSUPPORTED", { label: args.label });
    }
    if (args.exposureBindings && (!this.device.createBindGroupLayout || !this.device.createPipelineLayout || args.views.length < 1 || args.views.length > 2)) {
      throw new RenderDeviceError("Auto exposure requires explicit texture-load layouts", "WEBGPU_AUTO_EXPOSURE_LAYOUT_UNAVAILABLE");
    }
    if (args.textureLoadBindings && (!this.device.createBindGroupLayout || !this.device.createPipelineLayout || args.views.length < 1 || args.views.length > 4)) {
      throw new RenderDeviceError("This post pass requires explicit texture-load layouts", "WEBGPU_TEXTURE_LOAD_LAYOUT_UNAVAILABLE", { label: args.label });
    }
    const scopeDevice = this.device as unknown as {
      pushErrorScope?(scope: string): void;
      popErrorScope?(): Promise<{ readonly message: string } | null>;
    };
    const scopedErrors = Boolean(scopeDevice.pushErrorScope && scopeDevice.popErrorScope);
    const validationFailure = this.webgpuPostValidationFailure;
    if (scopedErrors) scopeDevice.pushErrorScope?.("validation");
    try {
      const format = target ? webgpuTextureFormat(target.colorTexture.format) : this.presentationFormat;
      // Bind convention and source count change the pipeline layout.
      const cacheKey = `${args.label}:${args.entryPoint}:${format}:${args.exposureBindings ? `exposure:${args.views.length}` : args.textureLoadBindings ? `load:${args.views.length}:${(args.multisampledDepthViews ?? []).join(",")}` : args.nativeEffectBindings ? "effect" : "sampled"}:${args.fragment}`;
      let pipeline = this.webgpuPostPipelines.get(cacheKey);
      if (!pipeline) {
        const vertexModule = this.device.createShaderModule({ label: `${args.label}-vs`, code: WEBGPU_POST_VERTEX_WGSL });
        const fragmentModule = this.device.createShaderModule({ label: `${args.label}-fs`, code: args.fragment });
        const layout = loadBindings
          ? this.device.createPipelineLayout!({ label: `${args.label}-pipeline-layout`, bindGroupLayouts: [this.device.createBindGroupLayout!({
            label: `${args.label}-texture-load-layout`, entries: [
              { binding: 0, visibility: 2, buffer: { type: "uniform" } },
              ...args.views.map((_view, index) => ({ binding: index + 2, visibility: 2, texture: args.multisampledDepthViews?.includes(index)
                ? { sampleType: "depth" as const, viewDimension: "2d" as const, multisampled: true }
                : { sampleType: "unfilterable-float" as const, viewDimension: "2d" as const } }))
            ]
          })] }) : "auto";
        pipeline = this.device.createRenderPipeline({
          label: `${args.label}-pipeline`, layout,
          vertex: { module: vertexModule, entryPoint: "vs_post" },
          fragment: { module: fragmentModule, entryPoint: args.entryPoint, targets: [{ format }] },
          primitive: { topology: "triangle-list" }
        });
        this.nativeRenderPipelinesCreated += 1;
        this.webgpuPostPipelines.set(cacheKey, pipeline);
      }
      if (!loadBindings && !this.webgpuPostLinearSampler) {
        this.webgpuPostLinearSampler = this.device.createSampler!({
          minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge"
        });
      }
      // The exposure chain submits immediately after each write. Reuse its
      // other post uniforms as well, including on devices without fences.
      const cacheUniform = Boolean(args.exposureBindings || args.reuseUniforms || this.webgpuPostValidationFailure);
      let uniformBuffer = cacheUniform ? this.webgpuExposureUniformBuffers.get(args.uniforms.byteLength) : undefined;
      if (!uniformBuffer) {
        const created = this.device.createBuffer({ label: `${args.label}-uniforms`, size: args.uniforms.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
        // Even one-shot uniforms can still be awaiting the GPU when a loss
        // occurs; register them now so loss can fence-retire or invalidate them.
        try { this.registerNativeCleanup(created, []); }
        catch (error) { this.retireUnregisteredNative(created); throw error; }
        uniformBuffer = created;
        if (cacheUniform) this.webgpuExposureUniformBuffers.set(args.uniforms.byteLength, created);
      }
      let submitted = false;
      try {
        this.device.queue.writeBuffer(uniformBuffer, 0, args.uniforms);
        const layout = pipeline.getBindGroupLayout?.(0);
        if (!layout) throw new RenderDeviceError("WebGPU post pipeline has no bind-group layout", "NATIVE_POST_UNSUPPORTED", { label: args.label });
        const group = this.device.createBindGroup({ label: `${args.label}-bind`, layout,
          entries: loadBindings
            ? [{ binding: 0, resource: { buffer: uniformBuffer } }, ...args.views.map((view, index) => ({ binding: index + 2, resource: view }))]
            : args.nativeEffectBindings
              ? [...args.views.map((view, index) => ({ binding: index, resource: view })),
                { binding: 3, resource: this.webgpuPostLinearSampler }, { binding: 4, resource: { buffer: uniformBuffer } }]
              : [{ binding: 0, resource: { buffer: uniformBuffer } }, { binding: 1, resource: this.webgpuPostLinearSampler },
                ...args.views.map((view, index) => ({ binding: 2 + index, resource: view }))]
        });
        const encoder = this.device.createCommandEncoder({ label: `${args.label}-encoder` });
        const pass = encoder.beginRenderPass({ label: `${args.label}-pass`, colorAttachments: [{ view: targetView,
          ...(args.targetViewOverride === undefined ? nativeColorSlice(target) : {}), loadOp: "load", storeOp: "store" }] });
        pass.setPipeline(pipeline);
        pass.setBindGroup?.(0, group);
        pass.draw(3, 1, 0);
        pass.end();
        const accesses = cacheUniform
          ? [...(args.accesses ?? []), { resource: uniformBuffer, mode: "read" as const }]
          : args.accesses;
        const finished = encoder.finish();
        args.beforeSubmit?.();
        this.submitMrtAware([finished], accesses ?? [], args.protectedSubmission === true);
        submitted = true;
        if (target) target.nativeNeedsClear = false;
        this.nativeRenderPasses += 1;
        if (!cacheUniform) this.webgpuPostRetiredUniformBuffers.push(uniformBuffer);
      } catch (error) {
        if (!submitted && !cacheUniform) {
          try { this.retireWebGPUPostUniform(uniformBuffer); } catch {
            // Retain the registered buffer for retry without replacing the submission error.
            if (!this.webgpuPostRetiredUniformBuffers.includes(uniformBuffer)) this.webgpuPostRetiredUniformBuffers.push(uniformBuffer);
          }
        }
        throw error;
      }
    } finally {
      if (scopedErrors && scopeDevice.popErrorScope) {
        const report = (message: string): void => {
          const detail = `[${args.label}] ${message}`;
          const count = this.webgpuPostErrors.get(detail);
          if (count !== undefined) this.webgpuPostErrors.set(detail, count + 1);
          else if (this.webgpuPostErrors.size < 64) this.webgpuPostErrors.set(detail, 1);
          else this.webgpuPostOtherErrors += 1;
          try { validationFailure?.(); } catch { /* Keep the validation error observable. */ }
        };
        try {
          const pending = scopeDevice.popErrorScope().then(info => {
            if (info?.message) report(info.message);
          }, error => report(`Validation scope failed: ${error instanceof Error ? error.message : String(error)}`));
          this.webgpuPostErrorScopePending.add(pending);
          void pending.finally(() => this.webgpuPostErrorScopePending.delete(pending));
        } catch (error) { report(`Validation scope failed: ${error instanceof Error ? error.message : String(error)}`); }
      }
    }
  }

  private retireWebGPUPostUniform(buffer: WebGPUBufferLike): void {
    this.webgpuPostUniformRetirementsInFlight.add(buffer);
    try { this.retireNative(buffer); } finally { this.webgpuPostUniformRetirementsInFlight.delete(buffer); }
  }

  private reclaimWebGPUPostUniformBuffers(): void {
    const buffers = this.webgpuPostRetiredUniformBuffers;
    this.webgpuPostRetiredUniformBuffers = [];
    const failures: unknown[] = [];
    for (const buffer of buffers) {
      try { this.retireWebGPUPostUniform(buffer); } catch (error) {
        if (!this.webgpuPostRetiredUniformBuffers.includes(buffer)) this.webgpuPostRetiredUniformBuffers.push(buffer);
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Failed to retire WebGPU post uniforms");
  }

  private releaseWebGPUAutoExposure(): void {
    if (this.webgpuAutoExposureReleasing) return;
    this.webgpuAutoExposureReleasing = true;
    this.nativePostCleanupDepth += 1;
    try {
      const helper = this.webgpuAutoExposure;
      const failures: unknown[] = [];
      try {
        helper?.dispose();
        if (this.webgpuAutoExposure === helper) this.webgpuAutoExposure = null;
      } catch (error) { failures.push(error); }
      for (const [size, buffer] of this.webgpuExposureUniformBuffers) {
        try {
          this.retireNative(buffer);
          if (this.webgpuExposureUniformBuffers.get(size) === buffer) this.webgpuExposureUniformBuffers.delete(size);
        } catch (error) { failures.push(error); }
      }
      if (failures.length) throw new AggregateError(failures, "Failed to release WebGPU auto exposure");
    } finally {
      this.nativePostCleanupDepth -= 1;
      this.webgpuAutoExposureReleasing = false;
    }
  }

  private releaseNativeEffectHistory(): void {
    if (this.nativeEffectHistoryDisposed || this.nativeEffectHistoryReleasing) return;
    this.nativeEffectHistoryReleasing = true;
    this.nativePostCleanupDepth += 1;
    try {
      this.nativeEffectHistory.dispose();
      this.nativeEffectHistoryDisposed = true;
    } finally {
      this.nativePostCleanupDepth -= 1;
      this.nativeEffectHistoryReleasing = false;
    }
  }

  dispose(): void {
    if (this.deviceDisposing) return;
    const retry = this.disposed;
    if (retry && !this.hasPendingNativeDisposal()) {
      // A completed cleanup may have reported an error, or a later confirmed
      // loss may have discharged it. An explicit retry replaces the old
      // rejected receipt; existing waiters retain that attempt's result.
      if (this.disposalAttempt?.state === "rejected") {
        const attempt = this.beginDisposalAttempt();
        this.resolveDisposalAttempt(attempt);
      }
      return;
    }
    const disposalAttempt = this.beginDisposalAttempt();
    try {
      if (!retry) {
        if (this.nativeForwardBundleActive) throw new RenderDeviceError("Device disposal cannot interrupt bundle submission", "WEBGPU_BUNDLE_SUBMISSION_ACTIVE");
        if (this.vertexConversionCheck) throw new RenderDeviceError("Device disposal cannot interrupt vertex conversion submission", "WEBGPU_VERTEX_CONVERSION_ACTIVE");
        if (this.#pointSubmissionActive) throw new RenderDeviceError("Device disposal cannot interrupt point submission", "WEBGPU_POINT_SUBMISSION_ACTIVE");
        if (this.#mrtSubmissionActive) throw new RenderDeviceError("Device disposal cannot interrupt MRT submission", "WEBGPU_MRT_SUBMISSION_ACTIVE");
        if (this.#textureUploadPinnedHandles.size) throw new RenderDeviceError("Device disposal cannot interrupt a texture upload", "WEBGPU_TEXTURE_UPLOAD_ACTIVE");
        this.assertOutsideGaussianSplatDraw();
      }
      if (this.nativePostCleanupDepth) throw new RenderDeviceError("Device disposal cannot interrupt native post cleanup", "WEBGPU_POST_CLEANUP_ACTIVE");
    } catch (error) {
      this.rejectDisposalAttempt(disposalAttempt, error);
      throw error;
    }
    this.deviceDisposing = true;
    const targetAttempts = this.deviceTargetDisposalAttempts = new Set();
    this.deviceSweepRetirementAttempts = new Set();
    this.deviceBudgetedDisposalAttempts = new Set();
    try {
      const failures: unknown[] = [];
      const attempt = (action: () => void): void => { try { action(); } catch (error) { failures.push(error); } };
      const attemptShader = (shader: WebGPUShaderProgram): void => {
        try {
          if (!shader.disposed) shader.dispose();
          if (shader.disposed) this.pendingShaderDisposals.delete(shader);
          else this.pendingShaderDisposals.add(shader);
        } catch (error) {
          if (!shader.disposed) this.pendingShaderDisposals.add(shader);
          else this.pendingShaderDisposals.delete(shader);
          failures.push(error);
        }
      };
      const attemptTarget = (target: WebGPURenderTarget): void => {
        if (target.nativeDisposalInProgress) {
          targetAttempts.add(target);
          this.pendingRenderTargetDisposals.add(target);
          return;
        }
        try {
          target.dispose();
          if (target.nativeDisposalComplete) this.pendingRenderTargetDisposals.delete(target);
          else this.pendingRenderTargetDisposals.add(target);
        } catch (error) {
          if (target.nativeDisposalComplete) this.pendingRenderTargetDisposals.delete(target);
          else this.pendingRenderTargetDisposals.add(target);
          failures.push(error);
        }
      };
      if (!retry) {
        this.frameToken = null;
        attempt(() => this.releaseNativeForwardBundles());
        for (const adapter of [...this.gaussianSplatAdapters]) attempt(() => this.disposeNativeGaussianSplatAdapter(adapter));
      }
      attempt(() => this.flushNativeForwardBundleRetirements());
      attempt(() => this.releaseWebGPUAutoExposure());
      attempt(() => this.releaseNativeEffectHistory());
      attempt(() => this.reclaimWebGPUPostUniformBuffers());
      for (const buffer of [...this.buffers]) {
        // The outer disposer still owns its callback and will restore the
        // buffer to this set if it fails. Avoid reentering wrapper side effects.
        if (!this.activeBufferDisposals.has(buffer)) attempt(() => buffer.dispose());
      }
      // Post helpers can observe an in-flight target's reentrant no-op as a
      // successful release. Keep the actual target independently until its
      // completion receipt says its attachments and callback are finished.
      for (const target of this.renderTargets) {
        if (target[resourceDisposalPending]) this.pendingRenderTargetDisposals.add(target);
      }
      if (!retry) {
        this.nativeEffectViews.clear();
        this.#nativePostTransactions.clear();
        this.#nativePostOwners.clear();
        this.uniformBufferBindings.clear();
        for (const shader of this.shaders) attemptShader(shader);
        // Post targets are attempted by their retryable owners above. Retrying
        // them here would both duplicate a failure in this call and let the
        // generic sweep obscure which owner still has cleanup pending.
        for (const target of [...this.renderTargets]) {
          if (!this.nativePostOwnedTargets.has(target)) attemptTarget(target);
        }
        for (const texture of [...this.nativeSampledTextures.keys()]) attempt(() => this.releaseNativeSampledTexture(texture));
        attempt(() => this.detachNativeStreamingTextures());
        for (const resource of this.nativeFallbackTextures.values()) attempt(() => this.retireNativeSweepTexture(resource.texture));
        this.nativeFallbackTextures.clear();
        if (this.canvasDepthTexture) attempt(() => this.retireNativeSweepTexture(this.canvasDepthTexture!));
        this.canvasDepthTexture = null;
        this.canvasDepthView = null;
        if (this.canvasContext && canvasOwners.get(this.canvasContext) === this.canvasOwner) {
          this.nativeCanvasUnconfigurePending = true;
          attempt(() => this.unconfigureNativeCanvas());
        }
        const streamingLossListeners = [...this.nativeStreamingLossListeners];
        this.nativeStreamingLossListeners.clear();
        let streamingCleanup: Promise<void> | undefined;
        let pointResourcesInvalidated = false;
        let destroyed = this.nativeConfirmedLost;
        if (!destroyed && (this.options.ownsDevice ?? !this.options.device)) {
          try {
            // Structural/injected devices can expose destroy through a getter.
            // Reading it is part of the uncertain operation and must happen
            // only once, under the same failure guard as the invocation.
            const destroy = this.device.destroy;
            if (destroy) { destroy.call(this.device); destroyed = true; }
          } catch (error) {
            // The structural device may be an injected wrapper whose destroy
            // already took effect. A throw alone is not a retry receipt.
            this.nativeDestroyPending = true;
            this.nativeDestroyFailure = { error };
            failures.push(error);
          }
        }
        if (destroyed) {
          this.nativeInteropInvalidationPending = true;
          attempt(() => { this.resourceInterop.invalidate(); this.nativeInteropInvalidationPending = false; pointResourcesInvalidated = true; });
        } else {
          // A borrowed device, or a device whose destruction failed or is not
          // available, may still be running work; fences release its leases.
          attempt(() => { streamingCleanup = this.retireInteropAfterFence(); });
        }
        this.frameActive = false;
        this.disposed = true;
        this.temporalLossListeners.clear();
        for (const listener of streamingLossListeners) this.pendingStreamingLossListeners.add(listener);
        // A failed borrowed-device retirement is not a loss notification:
        // the controller must retain its retiring allocations and charges.
        if (!streamingCleanup && pointResourcesInvalidated) this.notifyPendingStreamingLossListeners();
        // A fence over known resources cannot certify an unreturned allocation
        // after a failed point upload. Only genuine device invalidation does.
        if (pointResourcesInvalidated) this.notifyNativePointInvalidated();
      } else {
        for (const adapter of [...this.gaussianSplatAdapters]) attempt(() => this.disposeNativeGaussianSplatAdapter(adapter));
        for (const texture of [...this.nativeSampledTextures.keys()]) attempt(() => this.releaseNativeSampledTexture(texture));
        for (const texture of [...this.pendingNativeSweepRetirements]) attempt(() => this.retireNativeSweepTexture(texture));
        for (const texture of [...this.pendingNativeBudgetedDisposals.keys()]) attempt(() => this.disposeNativeBudgetedTexture(texture));
        attempt(() => this.detachNativeStreamingTextures());
        attempt(() => this.unconfigureNativeCanvas());
        attempt(() => this.releaseNativeForwardBundles());
        for (const shader of [...this.pendingShaderDisposals]) attemptShader(shader);
        for (const target of [...this.pendingRenderTargetDisposals]) {
          if (!targetAttempts.has(target)) attemptTarget(target);
        }
        if (this.nativeDestroyPending) {
          if (this.nativeConfirmedLost) {
            this.nativeDestroyPending = false;
            this.nativeDestroyFailure = undefined;
            this.nativeInteropInvalidationPending = true;
          } else {
            // No proof that repeating an injected device destructor is safe.
            failures.push(this.nativeDestroyFailure?.error);
          }
        }
        if (this.nativeInteropInvalidationPending) {
          attempt(() => {
            this.resourceInterop.invalidate();
            this.nativeInteropInvalidationPending = false;
            this.interopRetirementFailure = undefined;
            this.notifyPendingStreamingLossListeners();
            this.notifyNativePointInvalidated();
          });
        } else if (this.resourceInterop.liveResources > 0) {
          // A rejected sweep is evicted from the cache. This later explicit
          // disposal retries only callbacks supplied as safe by interop.
          attempt(() => { void this.retireInteropAfterFence(); });
        }
      }
      // A void disposer cannot throw at the time a fence later rejects. Retain
      // that failure for diagnostics and for the next explicit disposal attempt.
      for (const [resource, failure] of this.nativeRetirementFailures) {
        if (!this.resourceInterop.owns(resource)) this.nativeRetirementFailures.delete(resource);
        else if (!failures.includes(failure.error)) failures.push(failure.error);
      }
      for (const allocation of this.uncertainNativeAllocations) {
        if (!failures.includes(allocation.error)) failures.push(allocation.error);
      }
      for (const error of [...this.resourceInterop.retirementFenceErrors, ...this.resourceInterop.retirementDestructionErrors]) {
        if (!failures.includes(error)) failures.push(error);
        this.noteNativeRetirementFailure(error);
      }
      if (this.hasCurrentInteropRetirementFailure()) {
        const error = this.interopRetirementFailure!.error;
        if (!failures.includes(error)) failures.push(error);
      }
      if (failures.length) throw new AggregateError(failures, "Failed to dispose WebGPU device resources");
    } catch (error) {
      this.rejectDisposalAttempt(disposalAttempt, error);
      throw error;
    } finally {
      this.deviceTargetDisposalAttempts = undefined;
      this.deviceSweepRetirementAttempts = undefined;
      this.deviceBudgetedDisposalAttempts = undefined;
      this.deviceDisposing = false;
      this.observeDisposalAttempt(disposalAttempt);
    }
  }

  private assertAlive(): void {
    if (this.disposed || this.deviceDisposing) {
      throw new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
    }
    if (this.contextLost) {
      throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    }
  }

  private assertFrame(): void {
    this.assertAlive();
    if (!this.frameActive) {
      throw new RenderDeviceError("No active frame", "NO_ACTIVE_FRAME");
    }
  }

  private readonly temporalLossListeners = new Set<() => void>();
  onDeviceLost(listener: () => void): () => void { this.temporalLossListeners.add(listener); return () => this.temporalLossListeners.delete(listener); }

  private observeDeviceLost(): void {
    const lost = this.device.lost;
    if (!lost || typeof lost.then !== "function") return;
    void lost.then((info) => {
      this.nativeConfirmedLost = true;
      this.nativeDestroyPending = false;
      this.nativeDestroyFailure = undefined;
      this.contextLost = true;
      this.frameToken = null;
      if (this.disposed) {
        this.nativeInteropInvalidationPending = true;
        this.resourceInterop.invalidate();
        this.nativeInteropInvalidationPending = false;
        this.interopRetirementFailure = undefined;
        this.notifyPendingStreamingLossListeners();
        this.notifyNativePointInvalidated();
        // Confirmed loss can discharge a previously rejected native attempt
        // without an explicit retry, but only if no logical owner still needs
        // cleanup. Keep the original rejected promise for its existing waiters.
        if (this.disposalAttempt?.state === "rejected" && !this.hasPendingNativeDisposal()) {
          this.resolveDisposalAttempt(this.beginDisposalAttempt());
        }
        return;
      }
      // Cleanup and loss observers can reenter dispose(), which clears the
      // live listener set. Snapshot this loss event before invoking any of
      // them so one owner's teardown cannot suppress a peer notification.
      const temporalLossListeners = [...this.temporalLossListeners];
      const failures: unknown[] = [];
      const attempt = (action: () => void): void => { try { action(); } catch (error) { failures.push(error); } };
      attempt(() => this.releaseWebGPUAutoExposure());
      attempt(() => this.reclaimWebGPUPostUniformBuffers());
      // Detach budget identities before invalidation destroys native handles,
      // so each destruction callback can debit the in-flight reservation.
      for (const texture of [...this.nativeSampledTextures.keys()]) attempt(() => this.releaseNativeSampledTexture(texture));
      attempt(() => this.detachNativeStreamingTextures());
      for (const listener of this.nativeStreamingLossListeners) this.pendingStreamingLossListeners.add(listener);
      this.nativeStreamingLossListeners.clear();
      this.vertexConversions.clear();
      attempt(() => this.releaseNativeForwardBundles());
      this.nativeInteropInvalidationPending = true;
      attempt(() => {
        this.resourceInterop.invalidate();
        this.nativeInteropInvalidationPending = false;
        this.notifyNativePointInvalidated();
        this.notifyPendingStreamingLossListeners();
      });
      attempt(() => this.releaseNativeEffectHistory());
      this.nativeEffectViews.clear();
      this.#nativePostTransactions.clear();
      this.#nativePostOwners.clear();
      this.nativeFallbackTextures.clear();
      for (const listener of temporalLossListeners) { try { listener(); } catch { /* Continue notifying owners. */ } }
      const detail = [info.reason, info.message].filter(Boolean).join(": ");
      this.lastError = detail ? `WebGPU device lost: ${detail}` : "WebGPU device lost";
      if (failures.length) this.lastError += `; device-loss cleanup failed: ${failures.map(describeNativeCleanupFailure).join("; ")}`;
    }, (error: unknown) => {
      if (this.disposed) return;
      this.contextLost = true;
      this.frameToken = null;
      const temporalLossListeners = [...this.temporalLossListeners];
      const failures: unknown[] = [];
      const attempt = (action: () => void): void => { try { action(); } catch (failure) { failures.push(failure); } };
      attempt(() => this.releaseWebGPUAutoExposure());
      attempt(() => this.reclaimWebGPUPostUniformBuffers());
      for (const texture of [...this.nativeSampledTextures.keys()]) attempt(() => this.releaseNativeSampledTexture(texture));
      attempt(() => this.detachNativeStreamingTextures());
      this.vertexConversions.clear();
      attempt(() => this.releaseNativeForwardBundles());
      // A rejected loss promise is not proof that native work stopped.
      // Retain resources until a fence completes or the owner destroys the device.
      attempt(() => { void this.retireInteropAfterFence().catch(() => { /* No fence proof. */ }); });
      attempt(() => this.releaseNativeEffectHistory());
      this.nativeEffectViews.clear();
      this.#nativePostTransactions.clear();
      this.#nativePostOwners.clear();
      this.nativeFallbackTextures.clear();
      for (const listener of temporalLossListeners) { try { listener(); } catch { /* Continue notifying owners. */ } }
      // A rejected device-loss promise does not prove the native device lost
      // its resources. Notify residency owners only after the fence sweep.
      for (const listener of this.nativeStreamingLossListeners) this.pendingStreamingLossListeners.add(listener);
      this.nativeStreamingLossListeners.clear();
      this.lastError = `WebGPU device lost promise rejected: ${error instanceof Error ? error.message : String(error)}`;
      if (failures.length) this.lastError += `; device-loss cleanup failed: ${failures.map(describeNativeCleanupFailure).join("; ")}`;
    }).catch((error: unknown) => {
      if (this.nativeConfirmedLost) {
        // Do not silently repeat a failed invalidation. The lease remains
        // owned until the next explicit disposal attempt.
        this.nativeInteropInvalidationPending = true;
      }
      this.rejectLateDisposalFailure(error);
      this.lastError = `WebGPU device-loss cleanup failed: ${describeNativeCleanupFailure(error)}`;
    });
  }

  private retireNativeSweepTexture(texture: WebGPUTextureLike): void {
    this.pendingNativeSweepRetirements.add(texture);
    if (this.activeNativeSweepRetirements.has(texture) || this.deviceSweepRetirementAttempts?.has(texture)) return;
    this.deviceSweepRetirementAttempts?.add(texture);
    this.activeNativeSweepRetirements.add(texture);
    try {
      this.retireNative(texture);
      this.pendingNativeSweepRetirements.delete(texture);
    } finally {
      this.activeNativeSweepRetirements.delete(texture);
    }
  }

  private disposeNativeBudgetedTexture(texture: Texture): void {
    let pending = this.pendingNativeBudgetedDisposals.get(texture);
    if (!pending) {
      pending = { inFlight: false, uncertain: false };
      this.pendingNativeBudgetedDisposals.set(texture, pending);
    }
    if (pending.inFlight || this.deviceBudgetedDisposalAttempts?.has(texture)) return;
    this.deviceBudgetedDisposalAttempts?.add(texture);
    if (pending.uncertain) throw pending.error;
    pending.inFlight = true;
    try {
      texture.dispose();
      if (texture.disposed) this.pendingNativeBudgetedDisposals.delete(texture);
    } catch (error) {
      // Texture exposes no completion receipt after disposed becomes true.
      if (texture.disposed) { pending.uncertain = true; pending.error = error; }
      throw error;
    } finally {
      pending.inFlight = false;
    }
  }

  private retireNative(resource: { destroy(): void }): void {
    this.nativeRetirementsInFlight += 1;
    try {
      if (this.nativeForwardBundlePins.has(resource)) {
        this.nativeForwardBundleRetirements.add(resource);
        return;
      }
      if (this.#pointPinnedHandles.has(resource)) {
        this.#pointDeferredRetirements.add(resource);
        return;
      }
      if (this.#mrtPinnedHandles.has(resource)) {
        this.#mrtDeferredRetirements.add(resource);
        return;
      }
      if (this.#textureUploadPinnedHandles.has(resource as WebGPUTextureLike)) {
        this.#textureUploadDeferredRetirements.add(resource as WebGPUTextureLike);
        return;
      }
      if (!this.resourceInterop.owns(resource)) {
        if (this.contextLost || this.disposed) return;
        this.registerNativeCleanup(resource, []);
      }
      void this.requestNativeRetirement(resource);
    } finally {
      this.nativeRetirementsInFlight -= 1;
    }
  }

  /** A reentrant disposal must not fence a texture before its current queue write returns. */
  private performNativeTextureUpload(native: WebGPUTextureLike, upload: () => void): void {
    if (this.#textureUploadPinnedHandles.has(native)) throw new RenderDeviceError("Texture upload cannot be reentered", "WEBGPU_TEXTURE_UPLOAD_ACTIVE");
    this.#textureUploadPinnedHandles.add(native);
    try { upload(); }
    finally {
      this.#textureUploadPinnedHandles.delete(native);
      if (this.#textureUploadDeferredRetirements.delete(native)) this.retireNative(native);
    }
  }

  /** Keep native leases alive if an injected queue callback disposes an MRT during submit. */
  private submitMrtAware(commands: readonly unknown[], accesses: readonly { readonly resource: object; readonly mode: "read" | "write" | "readwrite" }[], mrt: boolean): void {
    if (this.#mrtSubmissionActive) throw new RenderDeviceError("MRT submission cannot be reentered", "WEBGPU_MRT_SUBMISSION_ACTIVE");
    if (!mrt) { this.resourceInterop.submit(commands, accesses); return; }
    this.#mrtSubmissionActive = true;
    for (const access of accesses) this.#mrtPinnedHandles.add(access.resource);
    try { this.resourceInterop.submit(commands, accesses); }
    finally {
      this.#mrtPinnedHandles.clear();
      this.#mrtSubmissionActive = false;
      const deferred = [...this.#mrtDeferredRetirements];
      this.#mrtDeferredRetirements.clear();
      for (const resource of deferred) this.retireNative(resource);
    }
  }

  private assertOutsideMrtSubmission(): void {
    if (this.#mrtSubmissionActive) throw new RenderDeviceError("MRT submission cannot be reentered", "WEBGPU_MRT_SUBMISSION_ACTIVE");
  }

  private requireBuffer(buffer: RenderBuffer): WebGPURenderBuffer {
    if (!(buffer instanceof WebGPURenderBuffer) || !this.ownedBuffers.has(buffer)) {
      throw new RenderDeviceError("Buffer was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        bufferId: buffer.id
      });
    }
    if (buffer.disposed) {
      throw new RenderDeviceError("Cannot use a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    return buffer;
  }

  private requireShader(shader: RenderShaderProgram): WebGPUShaderProgram {
    if (!(shader instanceof WebGPUShaderProgram) || !this.shaders.has(shader)) {
      throw new RenderDeviceError("Shader was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        shaderId: shader.id
      });
    }
    if (shader.disposed) {
      throw new RenderDeviceError("Cannot use a disposed shader", "DISPOSED_RESOURCE", { shaderId: shader.id });
    }
    return shader;
  }

  private requireRenderTarget(target: RenderTarget): WebGPURenderTarget {
    if (!(target instanceof WebGPURenderTarget) || getRenderTargetTextureOwner(target.colorTexture) !== this) {
      throw new RenderDeviceError("Render target was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        targetId: target.id
      });
    }
    if (target.disposed) {
      throw new RenderDeviceError("Cannot use a disposed render target", "DISPOSED_RESOURCE", { targetId: target.id });
    }
    if (target.nativeExtraColors.some((color) => color.texture.disposed) || (target.nativeExtraColors.length > 0 && target.colorTexture.disposed)) {
      throw new RenderDeviceError("Cannot use an MRT with a disposed color attachment", "DISPOSED_RESOURCE", { targetId: target.id });
    }
    if (!this.renderTargets.has(target)) throw new RenderDeviceError("Render target is unavailable", "FOREIGN_RESOURCE", { targetId: target.id });
    return target;
  }

  /** Color reads, writes, surfaces and presentation have nothing to address on a depth-only target. */
  private assertColorRenderTarget(target: WebGPURenderTarget, operation: string): void {
    if (target.depthOnly) {
      throw new RenderDeviceError("Depth-only render target has no color attachment", "RENDER_TARGET_DEPTH_ONLY", { targetId: target.id, label: target.label, operation });
    }
  }

  private validateGeneratedClusterPacket(uniforms: DrawCommand["uniforms"], rectLights: boolean): void {
    const dataBinding = uniformTextureBinding(uniforms, "u_clusterLightData");
    const indexBinding = uniformTextureBinding(uniforms, "u_clusterLightIndices");
    const data = dataBinding?.texture, indices = indexBinding?.texture;
    const grid = uniformVec2(uniforms?.get("u_clusterGridSize")), viewport = uniformVec2(uniforms?.get("u_clusterViewportSize"));
    const width = this.activeRenderTarget?.width ?? this.viewportWidth, height = this.activeRenderTarget?.height ?? this.viewportHeight;
    const activeViewport = (this.viewStateTarget === this.activeRenderTarget ? this.viewportOverride : null)
      ?? (this.activeRenderTarget === null ? this.persistentViewportRect : null);
    const validTexture = (binding: TextureBinding | null): boolean => {
      const texture = binding?.texture;
      return Boolean(texture && !texture.disposed && texture.dimension === "2d" && texture.format === "rgba32f" && texture.colorSpace === "linear"
        && texture.usage.includes("sampled") && texture.mipLevelCount === 1 && !this.nativeStreamingLeases.has(texture) && binding?.sampler.minFilter === "nearest"
        && binding.sampler.magFilter === "nearest" && binding.sampler.addressU === "clamp-to-edge" && binding.sampler.addressV === "clamp-to-edge"
        && binding.sampler.compare === undefined);
    };
    if (!validTexture(dataBinding) || !validTexture(indexBinding) || !data || !indices || !grid || !viewport
      || !grid.every(value => Number.isSafeInteger(value) && value > 0) || !viewport.every(value => Number.isSafeInteger(value) && value > 0)
      || viewport[0] !== width || viewport[1] !== height
      || (activeViewport !== null && (activeViewport.x !== 0 || activeViewport.y !== 0 || activeViewport.width !== width || activeViewport.height !== height))
      || grid[0] !== Math.ceil(viewport[0] / 64) || grid[1] !== Math.ceil(viewport[1] / 64)
      || data.width !== 6 || data.height < 1 || indices.width !== 64 || indices.height !== grid[0] * grid[1]) {
      throw new RenderDeviceError("Generated PBR clustered lighting requires matching live data and fixed-tile index textures", "WEBGPU_CLUSTER_LIGHTING_INVALID");
    }
    const dataPixels = data.getMipLevel(0)?.data, indexPixels = indices.getMipLevel(0)?.data;
    if (!(dataPixels instanceof Float32Array) || dataPixels.length !== data.width * data.height * 4
      || !(indexPixels instanceof Float32Array) || indexPixels.length !== indices.width * indices.height * 4) {
      throw new RenderDeviceError("Generated PBR clustered lighting requires CPU-backed rgba32f packets", "WEBGPU_CLUSTER_LIGHTING_INVALID");
    }
    const cached = this.validatedClusterPackets.get(indices);
    if (cached?.data === data && cached.indexRevision === indices.revision && cached.dataRevision === data.revision
      && cached.gridWidth === grid[0] && cached.gridHeight === grid[1] && cached.rectLights === rectLights) return;
    if (!dataPixels.every(Number.isFinite)) throw new RenderDeviceError("Clustered light data contains non-finite values", "WEBGPU_CLUSTER_LIGHTING_INVALID");
    for (let light = 0; light < data.height; light += 1) {
      const kind = dataPixels[light * 24 + 11]!;
      if (![0, 1, 2].includes(kind) && !(rectLights && kind === 3 && dataPixels[light * 24 + 14]! < 0.5)) {
        throw new RenderDeviceError("Clustered PBR light kind or rectangle shadow flag does not match the selected program", "WEBGPU_CLUSTER_LIGHTING_INVALID");
      }
    }
    for (let tile = 0; tile < indices.height; tile += 1) {
      const start = tile * 64 * 4, count = indexPixels[start + 1]!;
      if (!Number.isSafeInteger(count) || count < 0 || count > 64) throw new RenderDeviceError("Invalid clustered light count", "WEBGPU_CLUSTER_LIGHTING_INVALID");
      for (let index = 0; index < count; index += 1) {
        const light = indexPixels[start + index * 4]!;
        if (!Number.isSafeInteger(light) || light < 0 || light >= data.height) throw new RenderDeviceError("Clustered light index is outside the light texture", "WEBGPU_CLUSTER_LIGHTING_INVALID");
      }
    }
    this.validatedClusterPackets.set(indices, { data, indexRevision: indices.revision, dataRevision: data.revision, gridWidth: grid[0], gridHeight: grid[1], rectLights });
  }

  private validateGeneratedClippingPacket(uniforms: DrawCommand["uniforms"], selected: boolean): void {
    const rawCount = uniforms?.get("u_a3dClipGroupCount");
    if (rawCount === undefined && !selected) return;
    if (typeof rawCount !== "number" || !Number.isInteger(rawCount) || rawCount < 0 || rawCount > 2 || (!selected && rawCount > 0)) {
      throw new RenderDeviceError("Generated PBR clipping group count does not match the selected program", "WEBGPU_PBR_CLIPPING_INVALID");
    }
    if (rawCount === 0) return;
    const read = (name: string, length: number): number[] | null => {
      const value = uniforms?.get(name);
      if (!Array.isArray(value) && (!ArrayBuffer.isView(value) || value instanceof DataView)) return null;
      const result = Array.from(value as ArrayLike<number>);
      return result.length === length && result.every(number => Number.isFinite(number) && Number.isFinite(Math.fround(number))) ? result : null;
    };
    const planes = read("u_a3dClipPlanes", 32), groups = read("u_a3dClipGroups", 8);
    if (!planes || !groups) throw new RenderDeviceError("Generated PBR clipping requires finite plane and group packets", "WEBGPU_PBR_CLIPPING_INVALID");
    for (let group = 0; group < rawCount; group += 1) {
      const [offset, count, union, local] = groups.slice(group * 4, group * 4 + 4);
      if (!Number.isInteger(offset) || !Number.isInteger(count) || offset! < 0 || count! < 1 || offset! + count! > 8
        || (union !== 0 && union !== 1) || (local !== 0 && local !== 1)) {
        throw new RenderDeviceError("Generated PBR clipping group range or mode is invalid", "WEBGPU_PBR_CLIPPING_INVALID");
      }
      for (let plane = offset!; plane < offset! + count!; plane += 1) {
        if (Math.hypot(...planes.slice(plane * 4, plane * 4 + 3).map(Math.fround)) === 0) {
          throw new RenderDeviceError("Generated PBR clipping plane has no normal", "WEBGPU_PBR_CLIPPING_INVALID");
        }
      }
    }
  }

  private assertVertexConversionUnpinned(buffer: WebGPURenderBuffer): void {
    if (this.vertexConversionPins.has(buffer)) throw new RenderDeviceError("Vertex conversion source cannot change during submission", "WEBGPU_VERTEX_CONVERSION_ACTIVE", { bufferId: buffer.id });
  }

  private retireVertexConversions(buffer: WebGPURenderBuffer): void {
    const entries = this.vertexConversions.get(buffer);
    if (!entries) return;
    this.vertexConversions.delete(buffer);
    for (const entry of entries.values()) this.retireNative(entry.handle);
  }

  /** Lock the CPU sources and their authority until the queue has accepted the draw. */
  private withVertexConversionPins(command: DrawCommand, submit: () => void): void {
    const format = command.vertexFormat;
    if (!format?.attributes.some(needsNativeVertexConversion)) { submit(); return; }
    const maxBuffers = this.device.limits?.maxVertexBuffers ?? 8;
    const maxAttributes = this.device.limits?.maxVertexAttributes ?? 16;
    if (!Number.isSafeInteger(maxBuffers) || maxBuffers <= 0 || !Number.isSafeInteger(maxAttributes) || maxAttributes <= 0 ||
      format.streams.length > maxBuffers || format.attributes.length > maxAttributes ||
      format.streams.some(stream => !Number.isSafeInteger(stream.slot) || stream.slot < 0 || stream.slot >= maxBuffers)) {
      throw new RenderDeviceError("Vertex conversion layout exceeds device limits", "WEBGPU_VERTEX_CONVERSION_LIMIT");
    }
    const pinned = new Set<WebGPURenderBuffer>();
    for (const stream of format.streams) {
      if (!format.attributes.some(attribute => attribute.bufferSlot === stream.slot && needsNativeVertexConversion(attribute))) continue;
      const source = command.vertexBuffers?.[stream.slot] ?? (stream.slot === 0 ? command.vertexBuffer : undefined);
      if (!source) throw new RenderDeviceError("Vertex stream has no buffer", "WEBGPU_VERTEX_BUFFER_MISSING", { slot: stream.slot });
      const buffer = this.requireBuffer(source);
      if (!buffer.shadowValid || this.nativeExposedBuffers.has(buffer) || this.vertexWritesActive.has(buffer)) {
        throw new RenderDeviceError("Vertex conversion requires an authoritative CPU shadow", "WEBGPU_VERTEX_SHADOW_STALE", { bufferId: buffer.id });
      }
      pinned.add(buffer);
    }
    if (command.indexBuffer) {
      const index = this.requireBuffer(command.indexBuffer);
      if (!index.shadowValid || this.nativeExposedBuffers.has(index) || this.vertexWritesActive.has(index)) {
        throw new RenderDeviceError("Indexed vertex conversion requires an authoritative CPU index shadow", "WEBGPU_INDEX_SHADOW_STALE", { bufferId: index.id });
      }
      pinned.add(index);
    }
    const streams = [...(command.vertexBuffers ?? [])];
    const instanceBuffers = (command.instanceAttributes ?? []).map(attribute => attribute.buffer);
    const fingerprint = JSON.stringify([format, command.vertexCount, command.firstVertex, command.indexCount,
      command.firstIndex, command.indexType, command.instanceCount, (command.instanceAttributes ?? []).map(a =>
        [a.shaderName, a.components, a.offset, a.stride, a.normalized, a.divisor])]);
    const vertex = command.vertexBuffer, index = command.indexBuffer;
    const check = (): void => {
      this.assertAlive();
      if (command.vertexFormat !== format || command.vertexBuffer !== vertex || command.indexBuffer !== index ||
        streams.length !== (command.vertexBuffers?.length ?? 0) || streams.some((buffer, slot) => command.vertexBuffers?.[slot] !== buffer) ||
        instanceBuffers.length !== (command.instanceAttributes?.length ?? 0) || instanceBuffers.some((buffer, slot) => command.instanceAttributes?.[slot]?.buffer !== buffer) ||
        JSON.stringify([format, command.vertexCount, command.firstVertex, command.indexCount, command.firstIndex, command.indexType,
          command.instanceCount, (command.instanceAttributes ?? []).map(a => [a.shaderName, a.components, a.offset, a.stride, a.normalized, a.divisor])]) !== fingerprint ||
        [...pinned].some(buffer => buffer.disposed || !buffer.shadowValid || this.nativeExposedBuffers.has(buffer) || this.vertexWritesActive.has(buffer))) {
        throw new RenderDeviceError("Vertex conversion inputs changed during submission", "WEBGPU_VERTEX_CONVERSION_STALE");
      }
    };
    for (const buffer of pinned) this.vertexConversionPins.add(buffer);
    this.vertexConversionCheck = check;
    try { submit(); }
    finally {
      this.vertexConversionCheck = null;
      this.vertexConversionHandles.clear();
      for (const buffer of pinned) this.vertexConversionPins.delete(buffer);
    }
  }

  private convertedVertexBuffer(source: WebGPURenderBuffer, slot: number, plan: NativeVertexConversionPlan, count: number): WebGPUBufferLike {
    const key = `${slot}:${plan.key}`;
    let entries = this.vertexConversions.get(source);
    const cached = entries?.get(key);
    if (cached && cached.count >= count) {
      this.resourceInterop.assertUsable(cached.handle);
      // Refresh insertion order for bounded eviction.
      entries!.delete(key); entries!.set(key, cached);
      this.vertexConversionHandles.add(cached.handle);
      return cached.handle;
    }
    if (cached) { entries!.delete(key); this.retireNative(cached.handle); }
    const size = plan.arrayStride * count;
    const maxBytes = 64 * 1024 * 1024, maxAllocations = 64;
    if (this.vertexConversionBytes + size > maxBytes || this.vertexConversionCount >= maxAllocations) {
      // Retire unused cache entries. Charges remain until their fences actually complete.
      for (const [owner, ownerEntries] of this.vertexConversions) {
        for (const [oldKey, entry] of ownerEntries) {
          if (this.vertexConversionHandles.has(entry.handle)) continue;
          ownerEntries.delete(oldKey); this.retireNative(entry.handle);
        }
        if (!ownerEntries.size) this.vertexConversions.delete(owner);
      }
      throw new RenderDeviceError("Vertex conversion budget is occupied by live or in-flight buffers", "WEBGPU_VERTEX_CONVERSION_LIMIT");
    }
    const bytes = convertNativeVertexRecords(plan, source.bytes, count);
    this.vertexConversionBytes += size;
    this.vertexConversionCount += 1;
    let handle: WebGPUBufferLike | undefined, registered = false;
    try {
      handle = this.device.createBuffer({ label: `aura3d-vertex-conversion-${source.id}-${slot}`, size, usage: bufferUsageFlags("vertex") });
      this.registerNativeCleanup(handle, [
        { run: () => { this.vertexConversionBytes -= size; } },
        { run: () => { this.vertexConversionCount -= 1; } }
      ]);
      registered = true;
      this.device.queue.writeBuffer(handle, 0, bytes);
      this.vertexConversionCheck?.();
      entries = this.vertexConversions.get(source);
      if (!entries) { entries = new Map(); this.vertexConversions.set(source, entries); }
      entries.set(key, { handle, count, size });
      this.vertexConversionHandles.add(handle);
      return handle;
    } catch (error) {
      if (registered) this.retireNative(handle!);
      else if (!handle) { this.vertexConversionBytes -= size; this.vertexConversionCount -= 1; }
      // An unregistered returned handle may alias a foreign lease. Preserve the
      // charge and never destroy an allocation whose ownership is uncertain.
      else this.uncertainNativeAllocations.add({ resource: handle, error });
      throw error;
    }
  }

  /**
   * WP-03: create the native render pipelines matching draws would create,
   * without encoding, submitting or presenting, and store them in the same
   * per-shader cache the draw path reads, so a matching first draw is a cache
   * hit. Prefers `createRenderPipelineAsync`. Identity includes target color
   * and depth formats, sample count, vertex layout, draw state after the
   * active depth convention and this device generation. Requests that cannot
   * be resolved ahead of a frame, or whose speculative compile fails, are
   * skipped (the draw keeps its own validation and errors). Cancellation stops
   * further creation and rejects with the signal's reason; loss or disposal of
   * this device generation rejects with `DEVICE_LOST` and nothing compiled for
   * it is published.
   */
  async warmRenderPipelines(requests: readonly WebGPURenderPipelineWarmRequest[], options: { readonly signal?: AbortSignal } = {}): Promise<NativePipelineWarmupOutcome> {
    this.assertAlive();
    const lifetime = new AbortController();
    const lost = new RenderDeviceError("Device lost during pipeline warmup", "DEVICE_LOST");
    const assertCurrent = (): void => { if (this.disposed || this.contextLost) throw lost; };
    const removeLossListener = this.onDeviceLost(() => lifetime.abort(lost));
    try {
      const jobs: NativePipelineWarmupJob<WebGPURenderPipelineLike>[] = [];
      let unresolved = 0;
      for (const request of requests) {
        let job: NativePipelineWarmupJob<WebGPURenderPipelineLike> | null;
        try { job = this.nativeRenderPipelineWarmJob(request); } catch { job = null; }
        if (job) jobs.push(job); else unresolved += 1;
      }
      const outcome = await warmNativePipelineVariants(this.device, jobs, { signals: [lifetime.signal, options.signal], assertCurrent });
      return { ...outcome, skipped: outcome.skipped + unresolved };
    } finally {
      removeLossListener();
    }
  }

  private nativeRenderPipelineWarmJob(request: WebGPURenderPipelineWarmRequest): NativePipelineWarmupJob<WebGPURenderPipelineLike> | null {
    const shader = this.requireShader(request.shader);
    const create = this.device.createRenderPipeline;
    if (!create || shader.generatedUnlit?.primitive === "points") return null;
    // A portable layout with sampled textures or storage depends on per-draw bindings.
    if (shader.nativeUniformLayout === "portable" && (shader.storageBindings || shader.portableBindings.some((binding) => isPortableTexture(binding.kind)))) return null;
    if (shader.generatedUnlit && request.topology !== shader.generatedUnlit.primitive) return null;
    const format = request.vertexFormat;
    let jointKinds: readonly ("float" | "uint" | "sint")[] = [];
    if (shader.generatedPbr && (shader.nativeUniformLayout === "generated-program-ambient-pbr" || shader.nativeUniformLayout === "generated-program-pbr")) {
      const skinning = shader.generatedPbr.skinning ?? null;
      const locations = skinning === 8 ? [5, 8] : skinning ? [5] : [];
      const kinds: ("float" | "uint" | "sint")[] = [];
      for (const location of locations) {
        const attribute = format?.attributes.find(candidate => candidate.shaderLocation === location);
        if (!attribute) return null;
        kinds.push(!attribute.integer ? "float" : attribute.type.startsWith("uint") ? "uint" : "sint");
      }
      jointKinds = kinds;
    }
    const { variant, module: vertexModule } = this.nativeVertexModuleVariant(shader, format, jointKinds);
    const fragmentModule = shader.modules[1] ?? vertexModule;
    if (!vertexModule || !fragmentModule) return null;
    const target = request.target ? this.requireRenderTarget(request.target) : null;
    if (target?.disposed) return null;
    const targetFormats = target
      ? target.depthOnly ? [] : (target.colorTextures ?? [target.colorTexture]).map((texture) => webgpuTextureFormat(texture.format))
      : [this.presentationFormat];
    // beginFrame always (re)creates the canvas depth attachment.
    const hasDepthStencil = target ? target.nativeDepthView !== null && target.nativeDepthView !== undefined : Boolean(this.canvasContext && this.device.createTexture);
    const size = request.canvasSize;
    const canvasGeneration = this.canvasTargetGeneration + (size && (size.width !== this.viewportWidth || size.height !== this.viewportHeight) ? 1 : 0);
    const layouts: (WebGPUVertexBufferLayoutLike | null)[] = [];
    for (const stream of format?.streams ?? []) {
      if (stream.stepMode === "instance" && stream.divisor !== 1) return null;
      const { attributes, stride } = nativeFormatStreamLayout(format!, stream);
      while (layouts.length <= stream.slot) layouts.push(null);
      layouts[stream.slot] = { arrayStride: stride, stepMode: stream.stepMode, attributes };
    }
    validateNativeVertexLayouts(layouts, this.device.limits);
    const state: RenderCommandState = resolveDepthDrawState(request.renderState ?? { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" }, this.depthConvention);
    if ((shader.generatedPbr || shader.generatedUnlit) && state.alphaToCoverage) return null;
    const explicitLayout = this.generatedPbrDeformLayout(shader);
    const resolvedState = resolveNativeRenderState({
      state, topology: request.topology, colorFormats: targetFormats, depthStencilFormat: hasDepthStencil ? (target?.nativeDepthFormat ?? DEPTH_TEXTURE_FORMAT) : null,
      sampleCount: target?.sampleCount ?? 1, targetWidth: target?.width ?? size?.width ?? Math.max(1, this.viewportWidth),
      targetHeight: target?.height ?? size?.height ?? Math.max(1, this.viewportHeight),
      deviceGeneration: this.generation, targetKey: target ? `target:${target.id}` : "canvas",
      targetGeneration: target?.id ?? canvasGeneration,
      shaderKey: `${shader.id}:${variant}${this.zeroToOneProjectionKey(shader)}:${shader.entryPoints.join(":")}`,
      layoutKey: `${shader.nativeUniformLayout}:${explicitLayout?.key ?? "auto"}`,
      vertexLayouts: layouts, vertexLimits: this.device.limits, colorLimits: this.device.limits, features: this.device.features
    });
    const key = resolvedState.pipelineKey;
    return {
      key,
      isCached: () => shader.renderPipelines.has(key),
      create: () => {
        if (shader.disposed) throw new RenderDeviceError("Cannot warm a disposed shader", "DISPOSED_RESOURCE", { shaderId: shader.id });
        const descriptor = this.nativeRenderPipelineDescriptor(shader, explicitLayout, vertexModule, fragmentModule, resolvedState);
        const createAsync = this.device.createRenderPipelineAsync;
        return typeof createAsync === "function" ? createAsync.call(this.device, descriptor) : create.call(this.device, descriptor);
      },
      publish: (pipeline) => {
        if (shader.disposed) return;
        shader.renderPipelines.set(key, pipeline);
        this.nativeRenderPipelinesCreated += 1;
      }
    };
  }

  /** Native render-pipeline descriptor for a resolved state (shared by draw and pipeline warmup). */
  private nativeRenderPipelineDescriptor(
    shader: WebGPUShaderProgram,
    explicitLayout: { readonly groups: readonly (readonly WebGPUBindGroupLayoutEntryLike[])[] } | null,
    vertexModule: unknown,
    fragmentModule: unknown,
    resolvedState: ReturnType<typeof resolveNativeRenderState>
  ): WebGPURenderPipelineDescriptorLike {
    const layout = explicitLayout
      ? this.device.createPipelineLayout!({ label: `${shader.label}-portable-pipeline-layout`, bindGroupLayouts: explicitLayout.groups.map((entries, group) => this.device.createBindGroupLayout!({ label: `${shader.label}-portable-bind-layout-${group}`, entries })) })
      : "auto";
    return {
      label: `${shader.label}-pipeline`,
      layout,
      vertex: { module: vertexModule, entryPoint: shader.entryPoints[0], ...(resolvedState.vertexLayouts.length ? { buffers: resolvedState.vertexLayouts } : {}),
        // Zero-to-one reversed frames specialize the program to pass clip z through.
        ...(this.zeroToOneProjectionKey(shader) ? { constants: { [ZERO_TO_ONE_PROJECTION_OVERRIDE]: 1 } } : {}) },
      fragment: {
        module: fragmentModule,
        entryPoint: shader.entryPoints[1],
        targets: resolvedState.colorTargets.map((target) => {
          if (!target) throw new RenderDeviceError("Native render target has an unused color slot", "WEBGPU_MRT_CONFIGURATION_UNSUPPORTED");
          return target;
        })
      },
      primitive: resolvedState.primitive,
      multisample: resolvedState.multisample,
      ...(resolvedState.depthStencil ? { depthStencil: resolvedState.depthStencil } : {})
    };
  }

  /** Vertex module variant for a vertex layout (shared by draw and pipeline warmup). */
  private nativeVertexModuleVariant(shader: WebGPUShaderProgram, vertexFormat: VertexFormat | undefined, jointKinds: readonly ("float" | "uint" | "sint")[]): { readonly variant: string; readonly module: unknown } {
    // GL supplies an opaque white default for an absent vertex color. Native
    // WGSL inputs must instead match the actual vertex buffer layout.
    const useDefaultColor = shader.nativeColorDefaultVertex && !vertexFormat?.attributes.some(attribute => attribute.semantic === "color");
    let vertexVariant = useDefaultColor ? "default-color" : "default";
    if (useDefaultColor && !shader.nativeColorDefaultModule) {
      shader.nativeColorDefaultModule = this.device.createShaderModule?.({ label: `${shader.label}-vertex-default-color`, code: shader.nativeColorDefaultVertex! });
    }
    let vertexModule = useDefaultColor ? shader.nativeColorDefaultModule : shader.modules[0];
    if (shader.generatedPbr?.skinning && jointKinds.some(kind => kind !== "float")) {
      const key = jointKinds.join(":");
      vertexVariant = `skin:${key}`;
      if (!shader.skinningVertexModules.has(key)) {
        let source = shader.generatedPbr.vertex;
        for (const [index, kind] of jointKinds.entries()) {
          if (kind === "float") continue;
          const name = index === 0 ? "joints" : "joints1", location = index === 0 ? 5 : 8;
          source = source.replace(`@location(${location}) ${name}: vec4f`, `@location(${location}) ${name}: ${kind === "uint" ? "vec4u" : "vec4i"}`);
        }
        shader.skinningVertexModules.set(key, this.device.createShaderModule?.({ label: `${shader.label}-vertex-skin-${key}`, code: source }));
      }
      vertexModule = shader.skinningVertexModules.get(key);
    }
    if (shader.nativeAtlasVertex) {
      const hasColor = vertexFormat?.attributes.some(attribute => attribute.shaderLocation === 4) ?? false;
      const hasUv1 = vertexFormat?.attributes.some(attribute => attribute.shaderLocation === 7) ?? false;
      const key = `${hasColor}:${hasUv1}`;
      vertexVariant = `atlas:${key}`;
      if (!shader.atlasVertexModules.has(key)) {
        let source = shader.nativeAtlasVertex;
        if (!hasColor) source = source.replace(", @location(4) color: vec4<f32>", "").replace("output.color = color;", "output.color = vec4<f32>(1.0);");
        if (!hasUv1) source = source.replace(", @location(7) uv1: vec2<f32>", "").replace("output.uv1 = uv1;", "output.uv1 = vec2<f32>(0.0);");
        shader.atlasVertexModules.set(key, this.device.createShaderModule?.({ label: `${shader.label}-atlas-vertex-${key}`, code: source }));
      }
      vertexModule = shader.atlasVertexModules.get(key);
    }
    return { variant: vertexVariant, module: vertexModule };
  }

  private nativeVertexStreams(command: DrawCommand, shader: WebGPUShaderProgram): {
    layouts: (WebGPUVertexBufferLayoutLike | null)[];
    buffers: Map<number, WebGPUBufferLike>;
  } {
    const layouts: (WebGPUVertexBufferLayoutLike | null)[] = [];
    const sources = new Map<number, WebGPURenderBuffer>();
    const plans = new Map<number, NativeVertexConversionPlan>();
    const sourceEnds = new Map<number, number>();
    const sourceStrides = new Map<number, number>();
    const locations = new Set<number>();
    const format = command.vertexFormat;
    for (const stream of format?.streams ?? []) {
      if (stream.stepMode === "instance" && stream.divisor !== 1) throw new RenderDeviceError("WebGPU instance divisor must be one", "WEBGPU_VERTEX_DIVISOR_UNSUPPORTED", { slot: stream.slot, divisor: stream.divisor });
      const source = command.vertexBuffers?.[stream.slot] ?? (stream.slot === 0 ? command.vertexBuffer : undefined);
      if (!source) throw new RenderDeviceError("Vertex stream has no buffer", "WEBGPU_VERTEX_BUFFER_MISSING", { slot: stream.slot });
      const { attributes, stride, plan } = nativeFormatStreamLayout(format!, stream);
      if (plan) {
        plans.set(stream.slot, plan);
        sourceEnds.set(stream.slot, plan.sourceEnd); sourceStrides.set(stream.slot, stream.stride);
      }
      for (const attribute of attributes) locations.add(attribute.shaderLocation);
      while (layouts.length <= stream.slot) layouts.push(null);
      layouts[stream.slot] = { arrayStride: stride, stepMode: stream.stepMode, attributes };
      sources.set(stream.slot, this.requireBuffer(source));
    }
    if (!format) sources.set(0, this.requireBuffer(command.vertexBuffer));
    const groups: { buffer: RenderBuffer; stride: number; attributes: WebGPUVertexAttributeLike[] }[] = [];
    for (const attribute of command.instanceAttributes ?? []) {
      if ((attribute.divisor ?? 1) !== 1) throw new RenderDeviceError("WebGPU instance divisor must be one", "WEBGPU_VERTEX_DIVISOR_UNSUPPORTED", { attribute: attribute.shaderName });
      if (!Number.isInteger(attribute.stride) || attribute.stride <= 0 || attribute.stride % 4 !== 0 || !Number.isInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % 4 !== 0 || attribute.offset + attribute.components * 4 > attribute.stride) {
        throw new RenderDeviceError("Invalid instance attribute layout", "WEBGPU_VERTEX_LAYOUT_INVALID", { attribute: attribute.shaderName });
      }
      const location = shader.reflection.attributes.get(attribute.shaderName);
      if (location === undefined) throw new RenderDeviceError("Instance attribute is absent from shader", "WEBGPU_VERTEX_LOCATION_MISSING", { attribute: attribute.shaderName });
      if (locations.has(location)) throw new RenderDeviceError("Vertex shader location is used twice", "WEBGPU_VERTEX_LOCATION_CONFLICT", { location });
      locations.add(location);
      let group = groups.find(candidate => candidate.buffer === attribute.buffer && candidate.stride === attribute.stride);
      if (!group) { group = { buffer: attribute.buffer, stride: attribute.stride, attributes: [] }; groups.push(group); }
      group.attributes.push({ shaderLocation: location, offset: attribute.offset, format: attribute.components === 1 ? "float32" : `float32x${attribute.components}` });
    }
    for (const group of groups) {
      let slot = 1;
      while (layouts[slot] || sources.has(slot)) slot += 1;
      while (layouts.length <= slot) layouts.push(null);
      layouts[slot] = { arrayStride: group.stride, stepMode: "instance", attributes: group.attributes };
      sources.set(slot, this.requireBuffer(group.buffer));
    }
    validateNativeVertexLayouts(layouts, this.device.limits);
    let lastVertex = (command.firstVertex ?? 0) + command.vertexCount - 1;
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      if (plans.size && command.indexType !== undefined && command.indexType !== "uint16" && command.indexType !== "uint32") {
        throw new RenderDeviceError("Unsupported index type", "WEBGPU_INDEX_FORMAT_UNSUPPORTED");
      }
      if (plans.size && command.indexCount! > NATIVE_VERTEX_CONVERSION_MAX_INDICES) throw new RenderDeviceError("Vertex conversion index scan exceeds its work limit", "WEBGPU_VERTEX_CONVERSION_LIMIT");
      const bytesPerIndex = command.indexType === "uint32" ? 4 : 2;
      const end = ((command.firstIndex ?? 0) + command.indexCount!) * bytesPerIndex;
      if (!Number.isSafeInteger(end) || end > indexBuffer.byteLength) throw new RenderDeviceError("Index range exceeds its buffer", "WEBGPU_INDEX_BUFFER_TOO_SMALL", { end, byteLength: indexBuffer.byteLength });
      if (!indexBuffer.shadowValid || (plans.size > 0 && this.nativeExposedBuffers.has(indexBuffer))) {
        throw new RenderDeviceError("Indexed draw needs a current CPU index shadow to validate vertex bounds", "WEBGPU_INDEX_SHADOW_STALE", { bufferId: indexBuffer.id });
      }
      const view = new DataView(indexBuffer.bytes.buffer, indexBuffer.bytes.byteOffset, indexBuffer.bytes.byteLength);
      lastVertex = 0;
      for (let offset = (command.firstIndex ?? 0) * bytesPerIndex; offset < end; offset += bytesPerIndex) {
        lastVertex = Math.max(lastVertex, bytesPerIndex === 4 ? view.getUint32(offset, true) : view.getUint16(offset, true));
      }
    }
    let totalBytes = 0, totalOperations = 0;
    const counts = new Map<number, number>();
    for (const [slot, buffer] of sources) {
      const layout = layouts[slot];
      if (!layout || layout.attributes.length === 0) continue;
      const lastRecord = layout.stepMode === "instance" ? (command.instanceCount ?? 1) - 1 : lastVertex;
      const plan = plans.get(slot);
      const sourceEnd = plan ? sourceEnds.get(slot)! : Math.max(...layout.attributes.map(attribute => attribute.offset + nativeVertexFormatSize(attribute.format)));
      const required = lastRecord * (plan ? sourceStrides.get(slot)! : layout.arrayStride) + sourceEnd;
      if (!Number.isSafeInteger(required) || required > buffer.byteLength) throw new RenderDeviceError("Vertex stream is too small for the referenced records", "WEBGPU_VERTEX_BUFFER_TOO_SMALL", { slot, required, byteLength: buffer.byteLength });
      if (plan) {
        const count = lastRecord + 1, bytes = count * plan.arrayStride;
        totalBytes += bytes; totalOperations += count * plan.fields.length;
        const nativeLimit = this.device.limits?.maxBufferSize;
        if (!Number.isSafeInteger(count) || !Number.isSafeInteger(bytes) || bytes > NATIVE_VERTEX_CONVERSION_MAX_BYTES ||
          (nativeLimit !== undefined && (!Number.isSafeInteger(nativeLimit) || nativeLimit <= 0 || bytes > nativeLimit))) {
          throw new RenderDeviceError("Vertex conversion exceeds its buffer limit", "WEBGPU_VERTEX_CONVERSION_LIMIT", { slot, bytes, nativeLimit });
        }
        counts.set(slot, count);
      }
    }
    if (!Number.isSafeInteger(totalBytes) || totalBytes > NATIVE_VERTEX_CONVERSION_MAX_BYTES || !Number.isSafeInteger(totalOperations) || totalOperations > NATIVE_VERTEX_CONVERSION_MAX_OPERATIONS) {
      throw new RenderDeviceError("Vertex conversion exceeds its draw work limit", "WEBGPU_VERTEX_CONVERSION_LIMIT");
    }
    const buffers = new Map<number, WebGPUBufferLike>();
    for (const [slot, source] of sources) {
      const plan = plans.get(slot);
      buffers.set(slot, plan ? this.convertedVertexBuffer(source, slot, plan, counts.get(slot)!) : nativeBufferHandle(source));
    }
    return { layouts, buffers };
  }

  private portableTextureLayout(command: DrawCommand, shader: WebGPUShaderProgram): { readonly key: string; readonly groups: readonly (readonly WebGPUBindGroupLayoutEntryLike[])[] } | null {
    if (shader.nativeUniformLayout !== "portable") return null;
    const groupZero: WebGPUBindGroupLayoutEntryLike[] = [{ binding: 0, visibility: 3, buffer: { type: "uniform" } }];
    let bindingIndex = 1;
    for (const descriptor of shader.portableBindings) {
      if (!isPortableTexture(descriptor.kind)) continue;
      if (descriptor.kind === "depth2d" || descriptor.kind === "depth2d-multisampled") {
        groupZero.push({ binding: bindingIndex++, visibility: 3, texture: { sampleType: "depth", viewDimension: "2d", ...(descriptor.kind === "depth2d-multisampled" ? { multisampled: true } : {}) } });
        continue;
      }
      const binding = uniformTextureBinding(command.uniforms, descriptor.name);
      const texture = binding?.texture;
      const viewDimension = descriptor.kind === "texture3d" ? "3d" : descriptor.kind === "texture2d-array" ? "2d-array" : descriptor.kind === "texture-cube" ? "cube" : "2d";
      if (texture && texture.dimension !== viewDimension) {
        throw new RenderDeviceError("Texture dimension does not match shader binding", "WEBGPU_TEXTURE_DIMENSION_MISMATCH", { binding: descriptor.name });
      }
      const needsUnfilterable = Boolean(texture && isFloat32Texture(texture) && !this.device.features?.has("float32-filterable"));
      if (needsUnfilterable) assertNonFilteringSampler(binding!.sampler, descriptor.name);
      groupZero.push({ binding: bindingIndex++, visibility: 3, sampler: { type: needsUnfilterable ? "non-filtering" : "filtering" } });
      groupZero.push({ binding: bindingIndex++, visibility: 3, texture: { sampleType: needsUnfilterable ? "unfilterable-float" : "float", viewDimension } });
    }
    const resources = command.nativeStorageBindings ?? [];
    const declarations = shader.storageBindings;
    if (bindingIndex === 1 && !declarations) return null;
    if (resources.length && !declarations) {
      throw new RenderDeviceError("Portable texture bindings require explicit shader storage metadata", "WEBGPU_PORTABLE_STORAGE_GROUP_UNSUPPORTED");
    }
    if (!this.device.createBindGroupLayout || !this.device.createPipelineLayout) {
      throw new RenderDeviceError("Device cannot create the explicit layout required for portable texture bindings", "WEBGPU_PORTABLE_LAYOUT_UNAVAILABLE");
    }
    const groups: WebGPUBindGroupLayoutEntryLike[][] = [groupZero];
    const occupied = new Set<string>();
    const bindings = new Map(resources.map(binding => [`${binding.group}:${binding.binding}`, binding]));
    if (bindings.size !== resources.length) throw new RenderDeviceError("Duplicate storage binding", "WEBGPU_STORAGE_BINDING_DUPLICATE");
    const maxGroups = this.device.limits?.maxBindGroups ?? 4;
    const maxBindings = this.device.limits?.maxBindingsPerBindGroup ?? 1000;
    const formatSet = new Set(["rgba8unorm", "rgba16float", "rgba32float", "r32float", "r32uint", "r32sint"]);
    const counts = { vertexBuffers: 0, fragmentBuffers: 0, vertexTextures: 0, fragmentTextures: 0 };
    for (const declaration of declarations ?? []) {
      const { group, binding, visibility } = declaration;
      const key = `${group}:${binding}`;
      if (!Number.isSafeInteger(group) || group < 1 || group >= maxGroups || !Number.isSafeInteger(binding) || binding < 0 || binding >= maxBindings
        || !["vertex", "fragment", "vertex-fragment"].includes(visibility)) {
        throw new RenderDeviceError("Invalid shader storage layout slot or stage visibility", "WEBGPU_STORAGE_LAYOUT_INVALID", { group, binding, visibility });
      }
      if (occupied.has(key)) throw new RenderDeviceError("Duplicate shader storage layout slot", "WEBGPU_STORAGE_LAYOUT_INVALID", { group, binding });
      occupied.add(key);
      const resource = bindings.get(key);
      if (!resource || resource.kind !== declaration.kind) {
        throw new RenderDeviceError("Shader storage layout does not match draw resources", "WEBGPU_STORAGE_LAYOUT_MISMATCH", { group, binding });
      }
      const stages = visibility === "vertex" ? 1 : visibility === "fragment" ? 2 : 3;
      let entry: WebGPUBindGroupLayoutEntryLike;
      if (declaration.kind === "storage-buffer") {
        if (declaration.access !== "read" && declaration.access !== "read_write") throw new RenderDeviceError("Unsupported shader storage buffer access", "WEBGPU_STORAGE_LAYOUT_INVALID", { group, binding });
        if (declaration.access === "read_write" && (stages & 1) !== 0) {
          throw new RenderDeviceError("Writable storage buffers cannot be visible to a vertex stage", "WEBGPU_STORAGE_LAYOUT_UNSUPPORTED", { group, binding });
        }
        if (stages & 1) counts.vertexBuffers += 1;
        if (stages & 2) counts.fragmentBuffers += 1;
        entry = { binding, visibility: stages, buffer: { type: declaration.access === "read" ? "read-only-storage" : "storage" } };
      } else {
        if (resource.kind !== "storage-texture" || !["read", "write"].includes(declaration.access) || (declaration.access === "write" && visibility !== "fragment") || (declaration.viewDimension ?? "2d") !== "2d"
          || !formatSet.has(declaration.format) || resource.texture.dimension !== "2d") {
          throw new RenderDeviceError("Unsupported storage texture layout or access", "WEBGPU_STORAGE_LAYOUT_UNSUPPORTED", { group, binding });
        }
        if (declaration.access === "read" && !this.gpu?.wgslLanguageFeatures?.has("readonly_and_readwrite_storage_textures")) {
          throw new RenderDeviceError("Read-only storage textures require the WGSL readonly_and_readwrite_storage_textures feature", "WEBGPU_STORAGE_TEXTURE_ACCESS_UNAVAILABLE", { group, binding });
        }
        const actual = webgpuSampledTextureFormat(resource.texture, resource.texture.format);
        if (actual !== declaration.format || (resource.format !== undefined && resource.format !== declaration.format)) {
          throw new RenderDeviceError("Storage texture format does not match shader layout", "WEBGPU_STORAGE_TEXTURE_FORMAT_MISMATCH", { group, binding, expected: declaration.format, actual });
        }
        if (stages & 1) counts.vertexTextures += 1;
        if (stages & 2) counts.fragmentTextures += 1;
        entry = { binding, visibility: stages, storageTexture: { access: declaration.access === "read" ? "read-only" : "write-only", format: declaration.format, viewDimension: "2d" } };
      }
      while (groups.length <= group) groups.push([]);
      groups[group]!.push(entry);
    }
    if (occupied.size !== resources.length) throw new RenderDeviceError("Draw storage resources do not match shader layout", "WEBGPU_STORAGE_LAYOUT_MISMATCH");
    const maxBuffers = this.device.limits?.maxStorageBuffersPerShaderStage ?? 8;
    const maxTextures = this.device.limits?.maxStorageTexturesPerShaderStage ?? 4;
    if (counts.vertexBuffers > maxBuffers || counts.fragmentBuffers > maxBuffers || counts.vertexTextures > maxTextures || counts.fragmentTextures > maxTextures) {
      throw new RenderDeviceError("Shader storage resources exceed device stage limits", "WEBGPU_STORAGE_LAYOUT_LIMIT", { ...counts, maxBuffers, maxTextures });
    }
    for (const entries of groups) entries.sort((a, b) => a.binding - b.binding);
    return { key: JSON.stringify(groups), groups };
  }

  /** Load-only textures need explicit unfilterable layouts, including rgba32float. */
  private generatedPbrDeformLayout(shader: WebGPUShaderProgram): { readonly key: string; readonly groups: readonly (readonly WebGPUBindGroupLayoutEntryLike[])[] } | null {
    const program = shader.generatedPbr;
    if (!program || !program.resources.some(resource => resource.sampleType === "unfilterable-float")) return null;
    if (!this.device.createBindGroupLayout || !this.device.createPipelineLayout) {
      throw new RenderDeviceError("Generated PBR load-only textures require explicit texture layouts", "WEBGPU_GENERATED_PBR_LAYOUT_UNAVAILABLE");
    }
    const vertexStage = (uniform: string): boolean => uniform === "u_boneTexture" || uniform === "u_morphTexture" || uniform === "u_windNoise";
    const vertexTextures = program.resources.filter(resource => vertexStage(resource.uniform)).length;
    const fragmentTextures = program.resources.length - vertexTextures;
    const samplers = program.resources.filter(resource => "samplerBinding" in resource).length;
    const textureLimit = this.device.limits?.maxSampledTexturesPerShaderStage ?? 16;
    const samplerLimit = this.device.limits?.maxSamplersPerShaderStage ?? 16;
    if (vertexTextures > textureLimit || fragmentTextures > textureLimit || samplers > samplerLimit) {
      throw new RenderDeviceError("Generated PBR textures exceed device stage limits", "WEBGPU_PBR_TEXTURE_LIMIT", { vertexTextures, fragmentTextures, samplers, textureLimit, samplerLimit });
    }
    const material: WebGPUBindGroupLayoutEntryLike[] = [{ binding: 0, visibility: 3, buffer: { type: "uniform" } }];
    for (const resource of program.resources) {
      if ("samplerBinding" in resource) material.push({ binding: resource.samplerBinding, visibility: vertexStage(resource.uniform) ? 1 : 2, sampler: { type: "filtering" } });
      material.push({ binding: resource.textureBinding, visibility: vertexStage(resource.uniform) ? 1 : 2,
        texture: { sampleType: resource.sampleType === "unfilterable-float" ? "unfilterable-float" : "float", viewDimension: resource.dimension } });
    }
    material.sort((a, b) => a.binding - b.binding);
    const groups: readonly (readonly WebGPUBindGroupLayoutEntryLike[])[] = [material, [{ binding: 0, visibility: 3, buffer: { type: "uniform" } }]];
    return { key: JSON.stringify(groups), groups };
  }

  private retireNativeForwardBundle(entry: NativeForwardBundleResources): void {
    let pending = this.pendingForwardBundleRetirements.get(entry);
    if (!pending) {
      if (!entry.live) return;
      pending = { cache: this.nativeForwardBundles, invalidationPending: true, uniformPending: true, frameUniformPending: true, inFlight: false };
      this.pendingForwardBundleRetirements.set(entry, pending);
      entry.live = false;
      this.nativeForwardBundleResources.delete(entry);
    }
    if (pending.inFlight) return;
    pending.inFlight = true;
    const failures: unknown[] = [];
    try {
      if (pending.invalidationPending) {
        try { pending.cache?.invalidate(entry); pending.invalidationPending = false; } catch (error) { failures.push(error); }
      }
      if (pending.uniformPending) {
        try { this.retireNative(entry.uniform); pending.uniformPending = false; } catch (error) { failures.push(error); }
      }
      if (pending.frameUniformPending) {
        try { this.retireNative(entry.frameUniform); pending.frameUniformPending = false; } catch (error) { failures.push(error); }
      }
      if (!pending.invalidationPending && !pending.uniformPending && !pending.frameUniformPending) this.pendingForwardBundleRetirements.delete(entry);
    } finally { pending.inFlight = false; }
    if (failures.length) throw new AggregateError(failures, "Failed to retire WebGPU forward bundle");
  }

  private flushNativeForwardBundleRetirements(): void {
    const failures: unknown[] = [];
    for (const resource of [...this.nativeForwardBundleRetirements]) {
      if (this.nativeForwardBundlePins.has(resource) || this.nativeForwardBundleRetirementsInFlight.has(resource)) continue;
      this.nativeForwardBundleRetirementsInFlight.add(resource);
      try {
        this.retireNative(resource);
        if (!this.nativeForwardBundlePins.has(resource)) this.nativeForwardBundleRetirements.delete(resource);
      } catch (error) { failures.push(error); }
      finally { this.nativeForwardBundleRetirementsInFlight.delete(resource); }
    }
    if (failures.length) throw new AggregateError(failures, "Failed to retire deferred WebGPU bundle resources");
  }

  private invalidateNativeForwardBundlesForBuffer(buffer: WebGPURenderBuffer): void {
    for (const entry of [...this.nativeForwardBundleResources]) {
      if (entry.buffers.includes(buffer)) this.retireNativeForwardBundle(entry);
    }
  }

  private pruneNativeForwardBundles(): void {
    for (const entry of [...this.nativeForwardBundleResources]) {
      if (entry.generation !== this.generation || entry.shader.disposed || entry.buffers.some(buffer => buffer.disposed || this.nativeExposedBuffers.has(buffer))) {
        this.retireNativeForwardBundle(entry);
      }
    }
  }

  private releaseNativeForwardBundles(): void {
    const failures: unknown[] = [];
    for (const entry of new Set([...this.nativeForwardBundleResources, ...this.pendingForwardBundleRetirements.keys()])) {
      try { this.retireNativeForwardBundle(entry); } catch (error) { failures.push(error); }
    }
    if (this.nativeForwardBundleDisposalUncertain) {
      // The cache marks itself disposed before calling its unsubscribe hook,
      // and exposes no receipt to distinguish a completed hook from a throw.
      failures.push(this.nativeForwardBundleDisposalError);
    } else if (this.nativeForwardBundles && !this.nativeForwardBundleDisposalInFlight) {
      const cache = this.nativeForwardBundles;
      this.nativeForwardBundleDisposalInFlight = true;
      try {
        cache.dispose();
        if (this.nativeForwardBundles === cache) this.nativeForwardBundles = undefined;
      }
      catch (error) {
        this.nativeForwardBundleDisposalUncertain = true;
        this.nativeForwardBundleDisposalError = error;
        failures.push(error);
      }
      finally { this.nativeForwardBundleDisposalInFlight = false; }
    }
    if (failures.length) throw new AggregateError(failures, "Failed to retire WebGPU forward bundles");
  }

  /**
   * Capture only a self-contained untextured generated-unlit forward draw.
   * The pass and every referenced resource are issued by this device. Material
   * and frame values are immutable private snapshots; writes to vertex/index
   * buffers invalidate their entries. All other draws take the direct path.
   */
  private tryNativeForwardBundle(args: {
    readonly command: DrawCommand;
    readonly shader: WebGPUShaderProgram;
    readonly pipeline: WebGPURenderPipelineLike;
    readonly pipelineKey: string;
    readonly streams: { readonly buffers: Map<number, WebGPUBufferLike> };
    readonly frameBuffer: WebGPURenderBuffer | undefined;
    readonly targetFormats: readonly string[];
    readonly sampleCount: number;
    readonly nativeView: unknown;
    readonly resolveView: unknown;
    readonly depthView: unknown;
    readonly hasDepthStencil: boolean;
    readonly shouldClear: boolean;
    readonly resolvedState: ReturnType<typeof resolveNativeRenderState>;
    readonly pointCheck: (() => void) | undefined;
    readonly p3Surface: unknown;
    readonly generatedCoverage: boolean;
  }): boolean {
    const { command, shader, pipeline, pipelineKey, streams, frameBuffer, targetFormats, sampleCount,
      nativeView, resolveView, depthView, hasDepthStencil, shouldClear, resolvedState } = args;
    const native = this.device as WebGPUDeviceLike & {
      createRenderBundleEncoder?: unknown;
      pushErrorScope?: unknown;
      popErrorScope?: unknown;
    };
    const shaderIdentity = this.#mrtShaders.get(shader);
    if (typeof native.createRenderBundleEncoder !== "function" || typeof native.pushErrorScope !== "function" ||
        typeof native.popErrorScope !== "function" || !native.createCommandEncoder || !native.createBindGroup ||
        !pipeline.getBindGroupLayout || !frameBuffer || !frameBuffer.shadowValid || frameBuffer.byteLength < 304 || !shader.generatedUnlit ||
        !shaderIdentity?.unlitFingerprint || shaderIdentity.unlit !== shader.generatedUnlit ||
        JSON.stringify(shader.generatedUnlit) !== shaderIdentity.unlitFingerprint ||
        shader.modules.length !== shaderIdentity.modules.length || shader.modules.some((module, i) => module !== shaderIdentity.modules[i]) ||
        shader.entryPoints.some((point, i) => point !== shaderIdentity.entryPoints[i]) ||
        shader.nativeUniformLayout !== "generated-program-unlit" || shader.generatedUnlit.primitive !== "triangles" ||
        shader.generatedUnlit.resources.length !== 0 || shader.generatedUnlit.packedLoopColor ||
        command.topology !== "triangles" || (command.instanceCount ?? 1) !== 1 ||
        (command.instanceAttributes?.length ?? 0) !== 0 || (command.nativeStorageBindings?.length ?? 0) !== 0 ||
        command.vertexFormat?.streams.some(stream => stream.stepMode !== "vertex") ||
        command.vertexFormat?.attributes.some(needsNativeVertexConversion) ||
        [...(command.uniforms?.values() ?? [])].some(value => isTextureBinding(value) && value.texture !== null) ||
        resolvedState.colorTargets.some(target => target?.blend) ||
        args.pointCheck || args.p3Surface || args.generatedCoverage || this.#nativeDofActive ||
        this.activeRenderTarget?.nativeExtraColors.length || this.activeRenderTarget?.depthOnly || this.gaussianSplatBorrowedDepth || this.forwardPassProfiler) {
      return false;
    }
    // The admitted triangle template reads only this frame matrix. Refuse
    // future variants that reference other fields rather than caching a
    // snapshot that could omit a meaningful per-frame value.
    const frameUses = `${shader.generatedUnlit.vertex}\n${shader.generatedUnlit.fragment}`
      .replace(/@group\(1\)\s*@binding\(0\)\s*var<uniform>\s+frame\s*:\s*AuraFrame\s*;/g, "");
    if (/\bframe\b(?!\s*\.viewProjection\b)/.test(frameUses)) return false;

    const sources: WebGPURenderBuffer[] = [];
    const vertexBindings: [number, WebGPUBufferLike][] = [];
    for (const [slot, handle] of streams.buffers) {
      const source = command.vertexBuffers?.[slot] ?? (slot === 0 ? command.vertexBuffer : undefined);
      if (!source) return false;
      const buffer = this.requireBuffer(source);
      if (this.nativeExposedBuffers.has(buffer) || nativeBufferHandle(buffer) !== handle) return false;
      sources.push(buffer);
      vertexBindings.push([slot, handle]);
    }
    const index = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
    if ((index && this.nativeExposedBuffers.has(index)) || this.nativeExposedBuffers.has(frameBuffer)) return false;
    if (index) sources.push(index);
    sources.push(frameBuffer);
    const indexHandle = index ? nativeBufferHandle(index) : undefined;
    const frameSnapshot = new Uint8Array(304);
    frameSnapshot.set(frameBuffer.bytes.subarray(128, 192), 128);
    const packed = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map(), false);
    const generation = this.generation;
    const identity: (object | string | number | null)[] = [
      generation, shader, pipeline, pipelineKey, frameBuffer, index ?? null, indexHandle ?? null,
      command.indexType ?? "uint16", command.indexCount ?? 0, command.firstIndex ?? 0,
      command.vertexCount, command.firstVertex ?? 0, sampleCount, hasDepthStencil ? this.activeDepthStencilFormat() : "",
      ...targetFormats, ...vertexBindings.flatMap(([slot, handle]) => [slot, handle]),
      Array.from(frameSnapshot).join(","), Array.from(packed).join(",")
    ];
    const frameToken = this.frameToken;
    const target = this.activeRenderTarget;
    const frameEpoch = this.nativeFrameEpoch;
    const generated = shader.generatedUnlit;
    const originalVertex = command.vertexBuffer;
    const modules = [...shader.modules];
    const entryPoints = [...shader.entryPoints];
    const fingerprint = JSON.stringify([command.topology, command.vertexFormat, command.renderState,
      command.vertexCount, command.firstVertex, command.indexCount, command.firstIndex, command.indexType,
      command.instanceCount, this.viewportOverride, this.scissorOverride, this.scissorTestOn, this.persistentViewportRect,
      this.viewStateTarget?.id, target?.nativeNeedsClear, target?.nativeClearColor, this.clearColor]);
    let entry: NativeForwardBundleResources | undefined;
    const isCurrent = (): boolean => {
      try {
        if (this.disposed || this.contextLost || this.device !== native || this.generation !== generation ||
            !this.frameActive || this.frameToken !== frameToken ||
            this.nativeFrameEpoch !== frameEpoch || this.activeRenderTarget !== target || target?.disposed ||
            this.forwardPassProfiler || this.#nativeDofActive || this.gaussianSplatBorrowedDepth ||
            command.shader !== shader || shader.disposed || shader.generatedUnlit !== generated ||
            JSON.stringify(generated) !== shaderIdentity.unlitFingerprint || command.vertexBuffer !== originalVertex ||
            shader.nativeUniformLayout !== "generated-program-unlit" || shader.renderPipelines.get(pipelineKey) !== pipeline ||
            shader.modules.length !== modules.length || shader.modules.some((module, i) => module !== modules[i]) ||
            shader.entryPoints.length !== entryPoints.length || shader.entryPoints.some((point, i) => point !== entryPoints[i]) ||
            this.uniformBufferBindings.get(0) !== frameBuffer || !frameBuffer.shadowValid || (entry && !entry.live) ||
            command.indexBuffer !== index || sources.some(buffer => buffer.disposed || this.nativeExposedBuffers.has(buffer))) return false;
        if (JSON.stringify([command.topology, command.vertexFormat, command.renderState,
          command.vertexCount, command.firstVertex, command.indexCount, command.firstIndex, command.indexType,
          command.instanceCount, this.viewportOverride, this.scissorOverride, this.scissorTestOn, this.persistentViewportRect,
          this.viewStateTarget?.id, target?.nativeNeedsClear, target?.nativeClearColor, this.clearColor]) !== fingerprint) return false;
        if (vertexBindings.some(([slot, handle]) => {
          const source = command.vertexBuffers?.[slot] ?? (slot === 0 ? command.vertexBuffer : undefined);
          return !source || !(source instanceof WebGPURenderBuffer) || nativeBufferHandle(source) !== handle;
        })) return false;
        if ((command.nativeStorageBindings?.length ?? 0) || (command.instanceAttributes?.length ?? 0) ||
            [...(command.uniforms?.values() ?? [])].some(value => isTextureBinding(value) && value.texture !== null)) return false;
        const current = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map(), false);
        if (current.length !== packed.length || current.some((byte, i) => byte !== packed[i])) return false;
        if (frameBuffer.bytes.subarray(128, 192).some((byte, i) => byte !== frameSnapshot[128 + i])) return false;
        for (const buffer of sources) this.resourceInterop.assertUsable(nativeBufferHandle(buffer));
        if (entry) {
          this.resourceInterop.assertUsable(entry.uniform);
          this.resourceInterop.assertUsable(entry.frameUniform);
        }
        if (target) this.requireRenderTarget(target);
        return true;
      } catch { return false; }
    };
    const assertCurrent = (): void => {
      if (!isCurrent()) throw new RenderDeviceError("Native bundle draw resources changed before submission", "WEBGPU_BUNDLE_RESOURCE_STALE");
    };

    this.nativeForwardBundleActive = true;
    for (const buffer of sources) this.nativeForwardBundlePins.add(nativeBufferHandle(buffer));
    const attachments = target
      ? [target.nativeTexture, target.nativeMultisampleTexture, target.nativeDepthTexture]
      : [this.canvasDepthTexture];
    for (const attachment of attachments) if (attachment) this.nativeForwardBundlePins.add(attachment);
    let submissionFailed = false;
    try {
      assertCurrent();
      const encoder = native.createCommandEncoder({ label: `${command.label ?? "draw"}-encoder` });
      assertCurrent();
      const pass = encoder.beginRenderPass({
        label: `${command.label ?? "draw"}-pass`,
        colorAttachments: [{
          view: nativeView,
          ...nativeColorSlice(target),
          ...(sampleCount > 1 && resolveView ? { resolveTarget: resolveView } : {}),
          clearValue: target?.nativeClearColor ?? this.clearColor,
          loadOp: shouldClear ? "clear" : "load",
          storeOp: "store"
        }],
        ...(hasDepthStencil ? { depthStencilAttachment: {
          view: depthView, depthClearValue: this.depthConvention.clearValue,
          depthLoadOp: shouldClear ? "clear" as const : "load" as const, depthStoreOp: "store" as const,
          stencilClearValue: 0, stencilLoadOp: shouldClear ? "clear" as const : "load" as const, stencilStoreOp: "store" as const
        } } : {})
      });
      assertCurrent();
      if (!pass.executeBundles || !pass.setBindGroup || (index && (!pass.setIndexBuffer || !pass.drawIndexed))) {
        pass.end();
        assertCurrent();
        return false;
      }
      this.nativeRenderPasses += 1;
      entry = [...this.nativeForwardBundleResources].find(candidate =>
        candidate.live && candidate.identity.length === identity.length &&
        candidate.identity.every((part, i) => Object.is(part, identity[i])));
      if (entry) {
        this.nativeForwardBundleResources.delete(entry);
        this.nativeForwardBundleResources.add(entry);
      } else {
        while (this.nativeForwardBundleResources.size >= 64) {
          const oldest = this.nativeForwardBundleResources.values().next().value as NativeForwardBundleResources;
          this.retireNativeForwardBundle(oldest);
        }
        const allocated: { buffer: WebGPUBufferLike; registered: boolean }[] = [];
        try {
          const uniform = native.createBuffer({ label: `${command.label ?? "draw"}-generated-unlit-material`,
            size: packed.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
          allocated.push({ buffer: uniform, registered: false });
          this.registerNativeCleanup(uniform, []);
          allocated[0]!.registered = true;
          this.nativeForwardBundlePins.add(uniform);
          const frameUniform = native.createBuffer({ label: `${command.label ?? "draw"}-bundle-frame`,
            size: frameSnapshot.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
          allocated.push({ buffer: frameUniform, registered: false });
          this.registerNativeCleanup(frameUniform, []);
          allocated[1]!.registered = true;
          this.nativeForwardBundlePins.add(frameUniform);
          native.queue.writeBuffer(uniform, 0, packed);
          native.queue.writeBuffer(frameUniform, 0, frameSnapshot);
          assertCurrent();
          const materialGroup = native.createBindGroup({ label: `${command.label ?? "draw"}-draw-bind-group`,
            layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uniform } }] });
          assertCurrent();
          const frameGroup = native.createBindGroup({ label: `${command.label ?? "draw"}-frame-bind-group`,
            layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: frameUniform } }] });
          assertCurrent();
          entry = { identity, generation, shader, buffers: [...new Set(sources)], uniform, frameUniform, materialGroup, frameGroup, live: true };
          this.nativeForwardBundleResources.add(entry);
        } catch (error) {
          for (const { buffer, registered } of allocated) {
            try { if (registered) this.retireNative(buffer); else this.retireUnregisteredNative(buffer); } catch { /* Preserve the creation failure. */ }
          }
          throw error;
        }
      }
      this.nativeForwardBundlePins.add(entry.uniform);
      this.nativeForwardBundlePins.add(entry.frameUniform);
      assertCurrent();
      this.applyViewStateToPass(pass);
      applyNativeRenderDynamicState(pass, resolvedState.dynamic);
      const commands: NativeRenderBundleCommand[] = [
        { kind: "set-pipeline", pipeline },
        ...vertexBindings.map(([slot, buffer]) => ({ kind: "set-vertex-buffer" as const, slot, buffer })),
        { kind: "set-bind-group", slot: 0, group: entry.materialGroup },
        { kind: "set-bind-group", slot: 1, group: entry.frameGroup },
        ...(indexHandle
          ? [{ kind: "set-index-buffer" as const, buffer: indexHandle, format: command.indexType ?? "uint16" },
             { kind: "draw-indexed" as const, indexCount: command.indexCount!, instanceCount: 1, firstIndex: command.firstIndex ?? 0 }]
          : [{ kind: "draw" as const, vertexCount: command.vertexCount, instanceCount: 1, firstVertex: command.firstVertex ?? 0 }])
      ];
      if (!this.nativeForwardBundles) {
        const owner = this;
        // Do not use the public nativeGpuDevice getter: borrowing it invalidates
        // native DoF proofs, whereas this internal cache never exposes the device.
        this.nativeForwardBundles = new NativeRenderBundleCache({
          get nativeGpuDevice() { return owner.device; },
          get generation() { return owner.generation; },
          get disposed() { return owner.disposed; },
          get contextLost() { return owner.contextLost; },
          onDeviceLost: listener => owner.onDeviceLost(listener)
        });
      }
      const result = this.nativeForwardBundles.encode({
        key: entry, pass, passDevice: native,
        descriptor: { colorFormats: targetFormats, ...(hasDepthStencil ? { depthStencilFormat: this.activeDepthStencilFormat() } : {}), sampleCount },
        commands, cacheable: true, lifetime: { revision: entry, isValid: isCurrent }
      });
      assertCurrent();
      pass.end();
      const accesses: { resource: object; mode: "read" | "write" }[] = [
        ...vertexBindings.map(([, buffer]) => ({ resource: buffer, mode: "read" as const })),
        { resource: entry.frameUniform, mode: "read" },
        { resource: entry.uniform, mode: "read" },
        ...(indexHandle ? [{ resource: indexHandle, mode: "read" as const }] : []),
        ...attachments.filter((resource): resource is WebGPUTextureLike => Boolean(resource))
          .map(resource => ({ resource, mode: "write" as const }))
      ];
      const finished = encoder.finish();
      assertCurrent();
      this.resourceInterop.submit([finished], accesses);
      // Do not retry after submit or executeBundles: either may have accepted work.
      this.nativeDrawReceipts.set(command, (this.nativeDrawReceipts.get(command) ?? 0) + 1);
      if (target) target.nativeNeedsClear = false;
      this.nativeSubmissions += 1;
      this.nativeDrawSubmissions += 1;
      if (!target) this.canvasSubmissions += 1;
      if (result.mode === "bundle") this.nativeForwardBundleExecutions += 1;
      return true;
    } catch (error) {
      submissionFailed = true;
      if (entry) {
        try { this.retireNativeForwardBundle(entry); } catch { /* The retained cleanup must not replace the submission error. */ }
      }
      throw error;
    } finally {
      this.nativeForwardBundleActive = false;
      this.nativeForwardBundlePins.clear();
      try { this.flushNativeForwardBundleRetirements(); }
      catch (error) { if (!submissionFailed) throw error; }
    }
  }

  private submitNativeRenderPass(command: DrawCommand, vertexBuffer: WebGPURenderBuffer, pointCheck?: () => void): void {
    const mrtTarget = this.activeRenderTarget?.nativeExtraColors.length ? this.activeRenderTarget : null;
    const mrtFrame = this.frameToken;
    const mrtNeedsClear = mrtTarget?.nativeNeedsClear;
    const mrtClearColor = mrtTarget ? [...mrtTarget.nativeClearColor] : null;
    const assertMrtCurrent = (): void => {
      if (!mrtTarget) return;
      if (this.activeRenderTarget !== mrtTarget || this.frameToken !== mrtFrame || this.contextLost || this.disposed ||
          mrtTarget.nativeNeedsClear !== mrtNeedsClear || mrtClearColor!.some((value, index) => value !== mrtTarget.nativeClearColor[index])) {
        throw new RenderDeviceError("MRT frame or attachment state changed before submission", "WEBGPU_MRT_FRAME_STALE");
      }
      this.requireRenderTarget(mrtTarget);
    };
    assertMrtCurrent();
    const resolveView = this.activeRenderTarget?.nativeView ?? null;
    const p3Surface = !this.activeRenderTarget && this.activeColorSpace === "display-p3" ? this.verifiedP3CanvasTexture() : undefined;
    // A depth-only target draws with no color attachment, never into the canvas.
    const depthOnlyTarget = this.activeRenderTarget?.depthOnly === true;
    const nativeView = depthOnlyTarget ? null : this.activeRenderTarget?.nativeMultisampleView ?? resolveView ?? p3Surface?.view ?? this.currentCanvasView();
    if ((!nativeView && !depthOnlyTarget) || !command.shader) return;
    if (!hasNativeRenderPipeline(this.device)) {
      if (mrtTarget) throw new RenderDeviceError("MRT drawing requires native WebGPU pipeline submission", "WEBGPU_MRT_UNAVAILABLE");
      return;
    }
    const shader = this.requireShader(command.shader);
    if (this.#p3OutputShaders.has(shader) && !p3Surface) {
      throw new RenderDeviceError("Display-P3 output requires the verified canvas", "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED");
    }
    const checkP3Draw = p3Surface ? this.prepareP3OutputDraw(command, shader, p3Surface) : undefined;
    const identity = this.#mrtShaders.get(shader);
    const checkShaderIdentity = (): void => {
      if (!identity || shader.disposed || shader.generatedPbr !== identity.pbr || shader.generatedUnlit !== identity.unlit ||
          shader.nativeUniformLayout !== identity.layout || shader.modules.length !== identity.modules.length ||
          shader.modules.some((module, index) => module !== identity.modules[index]) ||
          shader.entryPoints.length !== 2 || shader.entryPoints.some((entry, index) => entry !== identity.entryPoints[index])) {
        throw new RenderDeviceError("MRT shader program or native stages changed after creation", "WEBGPU_MRT_SHADER_STALE");
      }
    };
    const generatedCoverage = identity?.coverage === true;
    const checkMrtShader = Boolean(mrtTarget || generatedCoverage || shader.generatedPbr?.writesDepthCoverage || shader.generatedUnlit?.writesDepthCoverage);
    if (checkMrtShader) checkShaderIdentity();
    if (this.activeRenderTarget?.nativeExtraColors.length && !generatedCoverage && shader.nativeUniformLayout !== "passthrough" && shader.nativeUniformLayout !== "portable") {
      throw new RenderDeviceError("This generated shader does not provide multiple color outputs", "WEBGPU_MRT_SHADER_UNSUPPORTED");
    }
    if (generatedCoverage && !this.activeRenderTarget?.nativeExtraColors.length) {
      throw new RenderDeviceError("Generated depth coverage requires its paired MRT target", "WEBGPU_DEPTH_COVERAGE_TARGET_UNSUPPORTED");
    }
    const activePbrMap = (name: string): boolean => {
      const enabled = command.uniforms?.get(`${name}Enabled`);
      if (enabled !== undefined) return uniformNumber(enabled, 0) > 0;
      const texture = uniformTextureBinding(command.uniforms, name)?.texture;
      return Boolean(texture && !texture.disposed);
    };
    if (shader.nativeUniformLayout.includes("pbr") && (
      (uniformNumber(command.uniforms?.get("u_diffuseTransmissionFactor"), 0) > 0 && !shader.generatedPbr?.diffuseTransmission) ||
      (activePbrMap("u_diffuseTransmissionTexture") && !shader.generatedPbr?.diffuseTransmissionMap) ||
      (activePbrMap("u_diffuseTransmissionColorTexture") && !shader.generatedPbr?.diffuseTransmissionColorMap)
    )) {
      throw new RenderDeviceError("WebGPU PBR does not yet support diffuse transmission", "WEBGPU_DIFFUSE_TRANSMISSION_UNSUPPORTED");
    }
    if (shader.nativeUniformLayout.includes("pbr") && uniformNumber(command.uniforms?.get("u_contactShadowMaskStrength"), 0) > 0 && !shader.generatedPbr?.contactShadow) {
      throw new RenderDeviceError("WebGPU PBR does not yet support contact shadow masks", "WEBGPU_CONTACT_SHADOW_UNSUPPORTED");
    }
    if (shader.nativeUniformLayout.includes("pbr") && (
      (uniformNumber(command.uniforms?.get("u_pointShadowMapEnabled"), 0) > 0 && !shader.generatedPbr?.pointShadow)
      || (uniformNumber(command.uniforms?.get("u_spotShadowMapEnabled"), 0) > 0 && !shader.generatedPbr?.spotShadow)
    )) {
      throw new RenderDeviceError("WebGPU PBR requires a selected standalone shadow receiver", "WEBGPU_PUNCTUAL_SHADOW_UNSUPPORTED");
    }
    if (shader.nativeUniformLayout.includes("pbr") && !shader.generatedPbr?.transmissionDegraded && (
      (activePbrMap("u_transmissionTexture") && !shader.generatedPbr?.transmissionMap)
      || (activePbrMap("u_volumeThicknessTexture") && !shader.generatedPbr?.thicknessMap)
      || (uniformNumber(command.uniforms?.get("u_volumeThicknessFactor"), 0) > 0 && !shader.generatedPbr?.materialVolume)
      || (uniformNumber(command.uniforms?.get("u_dispersion"), 0) > 0 && !shader.generatedPbr?.dispersion)
      || (uniformNumber(command.uniforms?.get("u_transmissionFactor"), 0) > 0 && !shader.generatedPbr?.transmission)
    )) {
      throw new RenderDeviceError("WebGPU PBR does not yet support refractive transmission", "WEBGPU_TRANSMISSION_UNSUPPORTED");
    }
    let frameBuffer: WebGPURenderBuffer | undefined;
    let jointKinds: readonly ("float" | "uint" | "sint")[] = [];
    if (shader.generatedUnlit) {
      const program = shader.generatedUnlit;
      if ((command.nativeStorageBindings?.length ?? 0) > 0) throw new RenderDeviceError("Generated unlit reserves group 1 for AuraFrame", "WEBGPU_STORAGE_BINDING_UNSUPPORTED");
      this.validateGeneratedClippingPacket(command.uniforms, program.clipping);
      if (program.fog !== "none") {
        const color = uniformVec3(command.uniforms?.get("u_fogColor"));
        const range = uniformVec2(command.uniforms?.get("u_fogRange"));
        const density = command.uniforms?.get("u_fogDensity");
        const height = command.uniforms?.get("u_fogHeightFalloff");
        const finite = (value: number): boolean => Number.isFinite(value) && Number.isFinite(Math.fround(value));
        const rangeValid = range !== null && range.every(finite) && Math.fround(range[1]) > Math.fround(range[0])
          && Number.isFinite(Math.fround(Math.fround(range[1]) - Math.fround(range[0])));
        if (!color || !color.every(finite) || (program.fog === "linear" ? !rangeValid : typeof density !== "number" || !finite(density) || density < 0)
          || (program.fog === "height" && (typeof height !== "number" || !finite(height) || height < 0))) {
          throw new RenderDeviceError("Generated unlit fog requires a finite color and valid parameters", "WEBGPU_GENERATED_FOG_INVALID", { fog: program.fog });
        }
      }
      const format = command.vertexFormat;
      if (program.requiredVertexLocations.some(location => !format?.attributes.some(attribute => attribute.shaderLocation === location && !attribute.integer
        && attribute.components === (location === 4 ? 4 : location === 2 || location === 3 || location === 7 ? 2 : 3)
        && format.streams.some(stream => stream.slot === attribute.bufferSlot && stream.stepMode === "vertex")))) {
        throw new RenderDeviceError("Generated unlit requires its selected position, color and UV attributes", "WEBGPU_VERTEX_LOCATION_MISSING", { required: program.requiredVertexLocations });
      }
      if (program.requiredInstanceLocations.some(location => !format?.attributes.some(attribute => attribute.shaderLocation === location && !attribute.integer && attribute.components === 4
        && format.streams.some(stream => stream.slot === attribute.bufferSlot && stream.stepMode === "instance"))
        && !(command.instanceAttributes ?? []).some(attribute => shader.reflection.attributes.get(attribute.shaderName) === location && attribute.components === 4 && (attribute.divisor ?? 1) === 1))) {
        throw new RenderDeviceError("Generated unlit requires its selected instance attributes", "WEBGPU_INSTANCE_LOCATION_MISSING", { required: program.requiredInstanceLocations });
      }
      const bound = this.uniformBufferBindings.get(0);
      if (!bound) throw new RenderDeviceError("Generated program requires AuraFrame at uniform binding 0", "WEBGPU_FRAME_UNIFORM_REQUIRED");
      frameBuffer = this.requireBuffer(bound);
      if (frameBuffer.byteLength < 304) throw new RenderDeviceError("AuraFrame uniform buffer is too small", "WEBGPU_FRAME_UNIFORM_REQUIRED", { byteLength: frameBuffer.byteLength });
      this.resourceInterop.assertUsable(nativeBufferHandle(frameBuffer));
    }
    if (shader.nativeUniformLayout === "generated-program-ambient-pbr" || shader.nativeUniformLayout === "generated-program-pbr") {
      if ((command.nativeStorageBindings?.length ?? 0) > 0) {
        throw new RenderDeviceError("This generated program has no storage bindings and reserves group 1 for AuraFrame", "WEBGPU_STORAGE_BINDING_UNSUPPORTED");
      }
      if (shader.generatedPbr) this.validateGeneratedClippingPacket(command.uniforms, shader.generatedPbr.clipping);
      if (shader.generatedPbr?.clustered) this.validateGeneratedClusterPacket(command.uniforms, shader.generatedPbr.rectLights);
      else if (shader.generatedPbr) {
        const count = uniformNumber(command.uniforms?.get("u_lightCount"), 0);
        const value = command.uniforms?.get("u_lightData");
        const data = Array.isArray(value) || (ArrayBuffer.isView(value) && !(value instanceof DataView)) ? value as ArrayLike<number> : [];
        if (!Number.isInteger(count) || count < 0 || count > 16 || count > shader.generatedPbr.directLightBound || data.length < count * 24) {
          throw new RenderDeviceError("Packed lights exceed the selected generated PBR program", "WEBGPU_PBR_LIGHT_LAYOUT_MISMATCH");
        }
        for (let index = 0; index < count; index += 1) {
          const kind = data[index * 24 + 11]!;
          if (![0, 1, 2].includes(kind) && !(shader.generatedPbr.rectLights && kind === 3 && data[index * 24 + 14]! < 0.5)) {
            throw new RenderDeviceError("Packed PBR light kind or rectangle shadow flag does not match the selected program", "WEBGPU_PBR_LIGHT_LAYOUT_MISMATCH");
          }
        }
      }
      const fog = shader.generatedPbr?.fog;
      if (fog && fog !== "none") {
        const color = uniformVec3(command.uniforms?.get("u_fogColor"));
        const range = uniformVec2(command.uniforms?.get("u_fogRange"));
        const density = command.uniforms?.get("u_fogDensity");
        const height = command.uniforms?.get("u_fogHeightFalloff");
        const finiteF32 = (value: number): boolean => Number.isFinite(value) && Number.isFinite(Math.fround(value));
        const rangeValid = range !== null && range.every(finiteF32) && Math.fround(range[1]) > Math.fround(range[0])
          && Number.isFinite(Math.fround(Math.fround(range[1]) - Math.fround(range[0])));
        const densityValid = typeof density === "number" && finiteF32(density) && density >= 0;
        const heightValid = typeof height === "number" && finiteF32(height) && height >= 0;
        if (!color || !color.every(finiteF32) || (fog === "linear" ? !rangeValid : !densityValid) || (fog === "height" && !heightValid)) {
          throw new RenderDeviceError("Generated PBR fog requires a finite color and valid parameters for its selected mode", "WEBGPU_GENERATED_FOG_INVALID", { fog });
        }
      }
      const attributes = command.vertexFormat?.attributes ?? [];
      const required = shader.generatedPbr?.requiredVertexLocations ?? [0, 2];
      const skinning = shader.generatedPbr?.skinning ?? null;
      const jointLocations = skinning === 8 ? [5, 8] : skinning ? [5] : [];
      if (required.some(location => !attributes.some(attribute => attribute.shaderLocation === location && (jointLocations.includes(location) || !attribute.integer)
        && attribute.components === ([3, 4, 5, 6, 8, 9].includes(location) ? 4 : location === 2 || location === 7 ? 2 : 3)
        && command.vertexFormat?.streams.some(stream => stream.slot === attribute.bufferSlot && stream.stepMode === "vertex")))) {
        throw new RenderDeviceError(shader.generatedPbr ? "Generated PBR requires its declared position, normal and UV attributes, and any selected color or deformation attributes" : "Generated PBR requires position at location 0 and UV at location 2", "WEBGPU_VERTEX_LOCATION_MISSING", { required });
      }
      jointKinds = jointLocations.map(location => {
        const attribute = attributes.find(candidate => candidate.shaderLocation === location)!;
        if (!attribute.integer) return "float";
        return attribute.type.startsWith("uint") ? "uint" : "sint";
      });
      if (jointKinds.some((kind, index) => shader.generatedPbr?.jointKinds[index] != null && shader.generatedPbr.jointKinds[index] !== kind)) {
        throw new RenderDeviceError("Generated PBR joint input types do not match the selected program", "WEBGPU_SKINNING_JOINT_TYPE_MISMATCH", { jointKinds, expected: shader.generatedPbr?.jointKinds });
      }
      const requiredInstances = shader.generatedPbr?.requiredInstanceLocations ?? [];
      if (requiredInstances.some(location => !attributes.some(attribute => attribute.shaderLocation === location && !attribute.integer && attribute.components === 4
        && command.vertexFormat?.streams.some(stream => stream.slot === attribute.bufferSlot && stream.stepMode === "instance"))
        && !(command.instanceAttributes ?? []).some(attribute => shader.reflection.attributes.get(attribute.shaderName) === location
          && attribute.components === 4 && (attribute.divisor ?? 1) === 1))) {
        throw new RenderDeviceError("Generated PBR requires its declared instance-rate matrix and color inputs", "WEBGPU_INSTANCE_LOCATION_MISSING", { required: requiredInstances });
      }
      const bound = this.uniformBufferBindings.get(0);
      if (!bound) throw new RenderDeviceError("Generated program requires AuraFrame at uniform binding 0", "WEBGPU_FRAME_UNIFORM_REQUIRED");
      frameBuffer = this.requireBuffer(bound);
      if (frameBuffer.byteLength < 304) throw new RenderDeviceError("AuraFrame uniform buffer is too small", "WEBGPU_FRAME_UNIFORM_REQUIRED", { byteLength: frameBuffer.byteLength });
      this.resourceInterop.assertUsable(nativeBufferHandle(frameBuffer));
    }
    const { variant: vertexVariant, module: vertexModule } = this.nativeVertexModuleVariant(shader, command.vertexFormat, jointKinds);
    const fragmentModule = shader.modules[1] ?? vertexModule;
    if (!vertexModule || !fragmentModule) return;
    const targetFormats = this.activeRenderTarget
      ? this.activeRenderTarget.depthOnly ? [] : (this.activeRenderTarget.colorTextures ?? [this.activeRenderTarget.colorTexture]).map((texture) => webgpuTextureFormat(texture.format))
      : [this.presentationFormat];
    const targetFormat = targetFormats[0]!;
    if (shader.generatedPbr) {
      const alpha = this.getPresentationAlphaMode();
      validateGeneratedPbrTarget(shader.generatedPbr, targetFormat, alpha !== undefined && alpha !== "opaque");
    }
    if (shader.generatedUnlit?.requiresFloatColorAttachment &&
      ((!new Set(["rgba16float", "rgba32float"]).has(targetFormat)) || (this.getPresentationAlphaMode() !== undefined && this.getPresentationAlphaMode() !== "opaque"))) {
      throw new RenderDeviceError("Generated indirect-fraction tags require a floating target without authored-alpha preservation", "WEBGPU_INDIRECT_FRACTION_TARGET_UNSUPPORTED", { format: targetFormat });
    }
    const streams = this.nativeVertexStreams(command, shader);
    const morphPacket = shader.nativeUniformLayout === "generated-morph-unlit" ? this.prepareNativeMorphUniforms(command) : undefined;
    const shouldClear = this.activeRenderTarget ? this.activeRenderTarget.nativeNeedsClear : this.drawCalls === 0;
    const depthView = this.gaussianSplatBorrowedDepth?.nativeDepthView ?? (this.activeRenderTarget ? this.activeRenderTarget.nativeDepthView : this.canvasDepthView);
    // Standard-sense states follow the renderer-selected frame convention.
    const state: RenderCommandState = resolveDepthDrawState(command.renderState ?? { depthTest: true, depthWrite: true, cullMode: "none", blend: false, depthCompare: "less-equal" }, this.depthConvention);
    // Generated programs support alpha-to-coverage only when their MASK
    // variant writes coverage to output alpha (`prd04.alphaToCoverage`).
    if ((shader.generatedPbr || shader.generatedUnlit) && state.alphaToCoverage && (shader.generatedPbr ?? shader.generatedUnlit)!.alphaToCoverage !== true) {
      throw new RenderDeviceError("Generated material alpha-to-coverage requires a MASK program variant that writes coverage", "WEBGPU_GENERATED_PBR_ALPHA_TO_COVERAGE_UNSUPPORTED");
    }
    const sampleCount = this.activeRenderTarget?.sampleCount ?? 1;
    // Attach depth even for an initial depth-disabled draw: its clear must not
    // be skipped before a later depth-enabled pass loads the same target.
    const hasDepthStencil = depthView !== null && depthView !== undefined;
    const explicitLayout = this.portableTextureLayout(command, shader) ?? this.generatedPbrDeformLayout(shader);
    const resolvedState = resolveNativeRenderState({
      state, topology: command.topology, colorFormats: targetFormats, depthStencilFormat: hasDepthStencil ? this.activeDepthStencilFormat() : null,
      sampleCount, targetWidth: this.activeRenderTarget?.width ?? this.viewportWidth, targetHeight: this.activeRenderTarget?.height ?? this.viewportHeight,
      deviceGeneration: this.generation, targetKey: this.activeRenderTarget ? `target:${this.activeRenderTarget.id}` : "canvas",
      targetGeneration: this.activeRenderTarget?.id ?? this.canvasTargetGeneration,
      shaderKey: `${shader.id}:${vertexVariant}${this.zeroToOneProjectionKey(shader)}:${shader.entryPoints.join(":")}`,
      layoutKey: `${shader.nativeUniformLayout}:${explicitLayout?.key ?? "auto"}`,
      vertexLayouts: streams.layouts, vertexLimits: this.device.limits, colorLimits: this.device.limits, features: this.device.features
    });
    if (generatedCoverage) {
      const target = this.activeRenderTarget;
      const [color, coverage] = resolvedState.colorTargets;
      const bias = state.polygonOffset;
      // A 4x coverage producer is admitted only as the active DoF frame's
      // producer, which sealing resolves into the single-sample source.
      const multisampleProducer = Boolean(target && this.#nativeDofActive?.phase === "recording" && this.#nativeDofActive.target === target &&
        this.#nativeDofActive.resolveTarget && target.sampleCount === 4 && target.multisampledDepthTexture);
      if (!target || targetFormats.length !== 2 || !["rgba16float", "rgba32float"].includes(targetFormats[0]!) || targetFormats[1] !== "rgba8unorm" ||
          (!multisampleProducer && (target.sampleCount !== 1 || !target.depthTexture)) || !target.nativeDepthTexture || !target.nativeDepthView ||
          !state.depthTest || !state.depthWrite || state.alphaToCoverage ||
          (bias && (bias.factor !== 0 || bias.units !== 0 || (bias.clamp ?? 0) !== 0)) ||
          !color || color.writeMask !== 15 || color.blend || !coverage || coverage.writeMask !== 1 || coverage.blend) {
        throw new RenderDeviceError("Generated depth coverage requires matching HDR/color/depth writes and an opaque red-only coverage attachment", "WEBGPU_DEPTH_COVERAGE_TARGET_UNSUPPORTED");
      }
    }
    const dofProof = this.#nativeDofActive;
    const checkDofDraw = dofProof?.phase === "recording" ? this.prepareNativeDofDraw(command, shader, dofProof) : undefined;
    const pipelineKey = resolvedState.pipelineKey;
    let pipeline = pointCheck ? undefined : shader.renderPipelines.get(pipelineKey);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline(this.nativeRenderPipelineDescriptor(shader, explicitLayout, vertexModule, fragmentModule, resolvedState));
      this.nativeRenderPipelinesCreated += 1;
      if (!pointCheck) shader.renderPipelines.set(pipelineKey, pipeline);
    }
    if (this.tryNativeForwardBundle({
      command, shader, pipeline, pipelineKey, streams, frameBuffer, targetFormats, sampleCount,
      nativeView, resolveView, depthView, hasDepthStencil, shouldClear, resolvedState,
      pointCheck, p3Surface, generatedCoverage
    })) return;
    const encoder = this.device.createCommandEncoder({ label: `${command.label ?? "draw"}-encoder` });
    const portableResources = shader.nativeUniformLayout === "portable"
      ? this.createNativePortableBindings(command, shader.portableBindings, explicitLayout !== null)
      : null;
    const generatedBaseBinding = shader.nativeUniformLayout === "generated-program-ambient-pbr" ? uniformTextureBinding(command.uniforms, "u_baseColorMap") : null;
    if (generatedBaseBinding?.texture && generatedBaseBinding.texture.dimension !== "2d") {
      throw new RenderDeviceError("Generated PBR base-color map must be a 2D texture", "WEBGPU_TEXTURE_DIMENSION_MISMATCH", { binding: "u_baseColorMap" });
    }
    const sampledTexture = shader.nativeUniformLayout === "generated-texture"
      ? this.createNativeSampledTextureBinding(uniformBaseColorTextureBinding(command.uniforms))
      : shader.nativeUniformLayout === "generated-program-ambient-pbr"
        ? this.createNativeSampledTextureBinding(generatedBaseBinding)
        : null;
    const generatedTextures = shader.generatedPbr?.resources.map(resource => {
      const binding = uniformTextureBinding(command.uniforms, resource.uniform);
      if ("colorSpace" in resource && resource.colorSpace === "linear" && binding?.texture && binding.texture.colorSpace !== "linear") {
        throw new RenderDeviceError("Generated PBR scalar data maps require linear textures", "WEBGPU_PBR_DATA_COLOR_SPACE_UNSUPPORTED", { binding: resource.uniform });
      }
      if (binding?.texture && binding.texture.dimension !== resource.dimension) {
        throw new RenderDeviceError("Generated PBR texture dimension does not match its binding", "WEBGPU_TEXTURE_DIMENSION_MISMATCH", { binding: resource.uniform, expected: resource.dimension });
      }
      if (resource.uniform === "u_clusterLightData" || resource.uniform === "u_clusterLightIndices") {
        const texture = binding?.texture;
        if (!texture) throw new RenderDeviceError("Generated PBR clustered light texture is unavailable", "WEBGPU_CLUSTER_LIGHTING_INVALID");
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 }), native };
      }
      if (resource.uniform === "u_a3dPhotometricAtlas") {
        const texture = binding?.texture;
        const mip = texture?.getMipLevel(0);
        const maxDimension = this.device.limits?.maxTextureDimension2D ?? 4096;
        if (!texture || texture.disposed || texture.dimension !== "2d" || texture.format !== "r32f" || texture.colorSpace !== "linear" ||
            texture.mipLevelCount !== 1 || texture.generateMipmaps || texture.dynamic || texture.revision !== 0 || texture.source !== null ||
            !texture.usage.includes("sampled") || !texture.usage.includes("copy-dst") || this.nativeStreamingLeases.has(texture) ||
            !Number.isSafeInteger(maxDimension) || maxDimension < 1 || !Number.isSafeInteger(texture.width) || !Number.isSafeInteger(texture.height) || texture.width < 1 || texture.height < 1 ||
            texture.width > Math.min(4096, maxDimension) || texture.height > Math.min(4096, maxDimension) ||
            !(texture.data instanceof Float32Array) || !mip || mip.data !== texture.data || texture.data.length !== texture.width * texture.height ||
            !binding?.validate().ok || binding.sampler.minFilter !== "nearest" || binding.sampler.magFilter !== "nearest" ||
            binding.sampler.addressU !== "clamp-to-edge" || binding.sampler.addressV !== "clamp-to-edge" || binding.sampler.addressW !== undefined ||
            binding.sampler.compare !== undefined || binding.sampler.mirror || binding.sampler.maxAnisotropy !== 1) {
          throw new RenderDeviceError("Generated PBR photometric profiles require an unchanged linear R32F load-only atlas", "WEBGPU_PHOTOMETRIC_ATLAS_INVALID");
        }
        const packet = validateGeneratedPhotometricPacket(command.uniforms ?? new Map(), texture.width * texture.height);
        const pixels = texture.data;
        for (let slot = 0; slot < 16; slot += 1) {
          const base = slot * 4, count = packet.offsets[base + 3]!;
          if (count === 0) continue;
          const vOffset = packet.offsets[base]!, hOffset = packet.offsets[base + 1]!, cOffset = packet.offsets[base + 2]!;
          const hCount = packet.meta[base]!, symmetry = packet.meta[base + 1]!, scale = packet.meta[base + 2]!;
          for (const [offset, length, max] of [[vOffset, count, 180], [hOffset, hCount, 360]] as const) {
            let previous = -Infinity;
            for (let index = 0; index < length; index += 1) {
              const angle = pixels[offset + index]!;
              if (!Number.isFinite(angle) || angle < 0 || angle > max || angle <= previous) {
                throw new RenderDeviceError("Invalid photometric atlas angle table", "WEBGPU_PHOTOMETRIC_ATLAS_INVALID");
              }
              previous = angle;
            }
          }
          const end = pixels[hOffset + hCount - 1]!;
          if (pixels[hOffset] !== 0 || (symmetry === 1 && end !== 90) || (symmetry === 2 && end !== 180) || (symmetry === 3 && end !== 360)) {
            throw new RenderDeviceError("Photometric atlas symmetry does not match its angles", "WEBGPU_PHOTOMETRIC_ATLAS_INVALID");
          }
          for (let index = 0; index < count * hCount; index += 1) {
            const candela = pixels[cOffset + index]!, scaled = Math.fround(candela * scale);
            if (!Number.isFinite(candela) || candela < 0 || !Number.isFinite(scaled) || (candela !== 0 && scale !== 0 && scaled === 0)) {
              throw new RenderDeviceError("Photometric atlas candelas exceed the supported float32 range", "WEBGPU_PHOTOMETRIC_ATLAS_INVALID");
            }
          }
        }
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 }), native };
      }
      if (resource.uniform === "u_boneTexture") {
        const texture = binding?.texture;
        const width = uniformNumber(command.uniforms?.get("u_boneTextureWidth"), 0);
        if (!texture || texture.disposed || texture.format !== "rgba32f" || texture.colorSpace !== "linear" || !texture.usage.includes("sampled")
          || !Number.isSafeInteger(width) || width < 4 || width % 4 !== 0 || width !== texture.width || texture.height < 1) {
          throw new RenderDeviceError("Generated PBR skinning requires a matching live linear rgba32f bone texture", "WEBGPU_BONE_TEXTURE_INVALID");
        }
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 }), native };
      }
      if (resource.uniform === "u_morphTexture") {
        const texture = binding?.texture, morph = shader.generatedPbr?.morph;
        const width = uniformNumber(command.uniforms?.get("u_morphTexWidth"), 0);
        const stride = uniformNumber(command.uniforms?.get("u_morphStride"), 0);
        const count = uniformNumber(command.uniforms?.get("u_morphActiveCount"), 0);
        const indicesValue = command.uniforms?.get("u_morphActiveIndex4"), weightsValue = command.uniforms?.get("u_morphActiveWeight4");
        const indices = Array.isArray(indicesValue) || ArrayBuffer.isView(indicesValue) ? Array.from(indicesValue as ArrayLike<number>) : [];
        const weights = Array.isArray(weightsValue) || ArrayBuffer.isView(weightsValue) ? Array.from(weightsValue as ArrayLike<number>) : [];
        let lastVertex = 0;
        for (const index of this.indicesFor(command)) lastVertex = Math.max(lastVertex, index);
        if (!morph || !texture || texture.disposed || !["rgba16f", "rgba32f"].includes(texture.format) || texture.colorSpace !== "linear" || !texture.usage.includes("sampled")
          || width !== texture.width || !Number.isSafeInteger(width) || width < 1 || stride !== (morph.tangents ? 3 : morph.normals ? 2 : 1)
          || texture.layers !== morph.bucket || texture.width * texture.height < (lastVertex + 1) * stride
          || !Number.isSafeInteger(count) || count < 0 || count > morph.maxActive || indices.length < count || weights.length < count
          || indices.length > morph.maxActive || weights.length > morph.maxActive || indices.length % 4 !== 0 || weights.length % 4 !== 0
          || !indices.every(Number.isFinite) || !weights.every(Number.isFinite)
          || indices.slice(0, count).some(index => !Number.isSafeInteger(index) || index < 0 || index >= texture.layers)) {
          throw new RenderDeviceError("Generated PBR morph texture or active weights are invalid", "WEBGPU_MORPH_TEXTURE_INVALID");
        }
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d-array", baseMipLevel: 0, mipLevelCount: 1 }), native };
      }
      if (resource.uniform === "u_a3dNativeProbeTexture" || resource.uniform === "u_a3dNativeVoxelTexture" || resource.uniform === "u_a3dNativeLightmapTexture") {
        const texture = binding?.texture;
        if (!texture || texture.disposed || texture.format !== "rgba32f" || texture.colorSpace !== "linear" || texture.mipLevelCount !== 1
          || !texture.usage.includes("sampled") || this.nativeStreamingLeases.has(texture) || !binding?.validate().ok
          || binding.sampler.minFilter !== "nearest" || binding.sampler.magFilter !== "nearest" || binding.sampler.compare !== undefined) {
          throw new RenderDeviceError("Advanced lighting requires a live linear rgba32f load-only texture", "WEBGPU_ADVANCED_LIGHTING_INVALID", { binding: resource.uniform });
        }
        const read = (name: string, length: number): number[] => {
          const value = command.uniforms?.get(name);
          const data = Array.isArray(value) || ArrayBuffer.isView(value) ? Array.from(value as ArrayLike<number>) : [];
          if (data.length !== length || !data.every(value => Number.isFinite(value) && Number.isFinite(Math.fround(value)))) throw new RenderDeviceError("Invalid advanced lighting packet", "WEBGPU_ADVANCED_LIGHTING_INVALID", { name });
          return data;
        };
        const prefix = resource.uniform === "u_a3dNativeProbeTexture" ? "u_a3dNativeProbe" : resource.uniform === "u_a3dNativeVoxelTexture" ? "u_a3dNativeVoxel" : "u_a3dNativeLightmap";
        const intensity = command.uniforms?.get(`${prefix}Intensity`);
        if (typeof intensity !== "number" || !Number.isFinite(Math.fround(intensity)) || intensity < 0) throw new RenderDeviceError("Invalid advanced lighting intensity", "WEBGPU_ADVANCED_LIGHTING_INVALID");
        if (resource.uniform !== "u_a3dNativeLightmapTexture") {
          const min = read(`${prefix}Min`, 4), max = read(`${prefix}Max`, 4);
          if (min.slice(0, 3).some((value, index) => !(Math.fround(max[index]! - value) > 0) || !Number.isFinite(Math.fround(max[index]! - value)))) {
            throw new RenderDeviceError("Invalid advanced lighting bounds", "WEBGPU_ADVANCED_LIGHTING_INVALID");
          }
          const grid = read(resource.uniform === "u_a3dNativeProbeTexture" ? `${prefix}Dimensions` : `${prefix}Resolution`, 4);
          const limit = resource.uniform === "u_a3dNativeProbeTexture" ? 32 : 64;
          if (grid.slice(0, 3).some(value => !Number.isSafeInteger(value) || value < 1 || value > limit)) throw new RenderDeviceError("Invalid advanced lighting dimensions", "WEBGPU_ADVANCED_LIGHTING_INVALID");
          if (resource.uniform === "u_a3dNativeProbeTexture") {
            const outside = command.uniforms?.get(`${prefix}Outside`);
            if ((outside !== 0 && outside !== 1) || texture.width !== grid[0]! * 9 || texture.height !== grid[1]! * grid[2]!) {
              throw new RenderDeviceError("Probe-grid texture does not match its metadata", "WEBGPU_ADVANCED_LIGHTING_INVALID");
            }
          } else {
            const config = read(`${prefix}Config`, 4), levels = read(`${prefix}Levels`, 28);
            const extents = min.slice(0, 3).map((value, axis) => Math.fround(Math.fround(max[axis]!) - Math.fround(value)));
            const cells = extents.map((extent, axis) => Math.fround(extent / grid[axis]!));
            const diagonal = Math.fround(Math.hypot(...extents));
            if (!Number.isInteger(config[0]) || config[0]! < 1 || config[0]! > 7 || !Number.isInteger(config[1]) || config[1]! < 1 || config[1]! > 128
              || ![1, 5, 9].includes(config[2]!) || config[3]! <= 0 || !Number.isFinite(diagonal) || !Number.isFinite(Math.fround(diagonal * 4))
              || config[3]! > diagonal * 4 || cells.some(cell => !(Math.fround(cell * 0.5) > 0) || !Number.isFinite(Math.fround(1 / cell)))) {
              throw new RenderDeviceError("Invalid voxel tracing configuration", "WEBGPU_ADVANCED_LIGHTING_INVALID");
            }
            let offset = 0;
            for (let index = 0; index < config[0]!; index += 1) {
              const dims = grid.slice(0, 3).map(value => Math.ceil(value / 2 ** index));
              if (dims.some((value, axis) => levels[index * 4 + axis] !== value) || levels[index * 4 + 3] !== offset) throw new RenderDeviceError("Invalid voxel pyramid metadata", "WEBGPU_ADVANCED_LIGHTING_INVALID");
              offset += dims[0]! * dims[1]! * dims[2]!;
            }
            const last = (config[0]! - 1) * 4;
            if (levels.slice(last, last + 3).some(value => value !== 1) || offset > texture.width * texture.height) throw new RenderDeviceError("Incomplete voxel pyramid texture", "WEBGPU_ADVANCED_LIGHTING_INVALID");
          }
        }
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 }), native };
      }
      if (resource.dimension === "2d-array") {
        const texture = binding?.texture;
        if (!texture || texture.disposed || texture.format !== "rgba16f" || !texture.usage.includes("sampled")) {
          throw new RenderDeviceError("Generated PBR irradiance volume requires a live sampled rgba16f array texture", "TEXTURE_BINDING_MISSING", { binding: resource.uniform });
        }
        const gridValue = command.uniforms?.get("u_prd02IrradianceGrid");
        const grid = Array.isArray(gridValue) || ArrayBuffer.isView(gridValue) ? Array.from(gridValue as ArrayLike<number>) : [];
        if (grid.length < 3 || !grid.slice(0, 3).every(value => Number.isSafeInteger(value) && value > 0)
          || texture.width !== grid[0] || texture.height !== grid[1] || texture.layers !== grid[2]) {
          throw new RenderDeviceError("Generated PBR irradiance texture dimensions must match the grid", "WEBGPU_PBR_IRRADIANCE_GRID_MISMATCH", { binding: resource.uniform, grid, width: texture.width, height: texture.height, layers: texture.layers });
        }
        const native = this.getNativeSampledTexture(texture);
        return { ...resource, view: native.createView({ dimension: "2d-array" }), native };
      }
      if (resource.uniform === "u_localShadowAtlas") {
        const paramsValue = command.uniforms?.get("u_localShadowParams");
        const params = Array.isArray(paramsValue) || ArrayBuffer.isView(paramsValue) ? Array.from(paramsValue as ArrayLike<number>) : [];
        if (params.length !== 4 || !params.every(Number.isFinite) || params[0]! < 0 || params[0]! > 1 || params.slice(1).some(value => value < 0)) {
          throw new RenderDeviceError("Generated PBR local shadow parameters are invalid", "WEBGPU_LOCAL_SHADOW_INVALID");
        }
        const texture = binding?.texture;
        const texelValue = command.uniforms?.get("u_localShadowAtlasTexel");
        const texel = Array.isArray(texelValue) || ArrayBuffer.isView(texelValue) ? Array.from(texelValue as ArrayLike<number>) : [];
        if (params[0]! > 0 && (!texture || texture.disposed || texture.format === "depth24" || !binding?.validate().ok
          || binding.sampler.compare !== undefined || binding.sampler.minFilter !== "nearest" || binding.sampler.magFilter !== "nearest"
          || binding.sampler.addressU !== "clamp-to-edge" || binding.sampler.addressV !== "clamp-to-edge"
          || texel.length !== 2 || !texel.every(value => Number.isFinite(value) && value > 0)
          || Math.abs(texel[0]! * texture.width - 1) > 1e-5 || Math.abs(texel[1]! * texture.height - 1) > 1e-5
          || ["u_localShadowMatrices", "u_localShadowRects", "u_localShadowTexelScale"].some(name => !command.uniforms?.has(name)))) {
          throw new RenderDeviceError("Generated PBR local shadows require a matching live nearest-sampled raw atlas and tile packet", "WEBGPU_LOCAL_SHADOW_INVALID");
        }
      }
      if (resource.uniform === "a3d_prd04_transmissionSampler") {
        const texture = binding?.texture;
        const sizeValue = command.uniforms?.get("a3d_prd04_transmissionSamplerSize");
        const size = Array.isArray(sizeValue) || ArrayBuffer.isView(sizeValue) ? Array.from(sizeValue as ArrayLike<number>) : [];
        const expectedLevels = texture ? Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1 : 0;
        const targetOwned = texture ? getRenderTargetTextureOwner(texture) === this : false;
        const supplied = texture && (targetOwned || (expectedLevels === 1 ? Boolean(texture.data || texture.source || texture.mipLevels.length === 1) : texture.mipLevels.length === expectedLevels));
        if (!texture || texture.disposed || !binding?.validate().ok || !texture.usage.includes("sampled") || this.nativeStreamingLeases.has(texture)
          || texture.mipLevelCount !== expectedLevels || !supplied || size.length !== 2 || size[0] !== texture.width || size[1] !== texture.height
          || binding.sampler.minFilter !== "linear-mipmap-linear" || binding.sampler.magFilter !== "linear"
          || binding.sampler.addressU !== "clamp-to-edge" || binding.sampler.addressV !== "clamp-to-edge" || binding.sampler.compare !== undefined) {
          throw new RenderDeviceError("Generated PBR transmission requires a complete, live trilinear scene-color capture", "WEBGPU_TRANSMISSION_CAPTURE_UNAVAILABLE");
        }
      }
      if (resource.uniform === "u_contactShadowMask") {
        const suppliedStrength = command.uniforms?.get("u_contactShadowMaskStrength");
        const strength = suppliedStrength === undefined ? 0 : suppliedStrength;
        const viewport = uniformVec2(command.uniforms?.get("u_contactShadowMaskViewport"));
        const lightIndex = uniformNumber(command.uniforms?.get("u_contactShadowLightIndex"), NaN);
        const clusterData = shader.generatedPbr?.clustered ? uniformTextureBinding(command.uniforms, "u_clusterLightData")?.texture : undefined;
        const lightCount = clusterData?.height ?? uniformNumber(command.uniforms?.get("u_lightCount"), 0);
        const lightData = clusterData ? clusterData.getMipLevel(0)?.data : command.uniforms?.get("u_lightData");
        const packed = Array.isArray(lightData) || (ArrayBuffer.isView(lightData) && !(lightData instanceof DataView))
          ? lightData as ArrayLike<number> : [];
        const compiledBound = clusterData ? clusterData.height : shader.generatedPbr?.directLightBound ?? 0;
        const validLight = Number.isInteger(lightIndex) && lightIndex >= 0 && lightIndex < lightCount && lightIndex < compiledBound
          && packed.length >= (lightIndex + 1) * 24 && packed[lightIndex * 24 + 11]! <= 0.5 && packed[lightIndex * 24 + 14]! >= 0.5;
        const width = this.activeRenderTarget?.width ?? this.viewportWidth;
        const height = this.activeRenderTarget?.height ?? this.viewportHeight;
        if (typeof strength !== "number" || !Number.isFinite(strength) || strength < 0 || strength > 1
          || (strength > 0 && (!validLight || !viewport || viewport[0] !== width || viewport[1] !== height
            || !binding?.texture || binding.texture === this.activeRenderTarget?.colorTexture
            || !binding.texture.usage.includes("sampled") || binding.texture.format !== "rgba8" || binding.texture.mipLevelCount !== 1
            || binding.sampler.minFilter !== "linear" || binding.sampler.magFilter !== "linear"
            || binding.sampler.addressU !== "clamp-to-edge" || binding.sampler.addressV !== "clamp-to-edge" || binding.sampler.compare !== undefined))) {
          throw new RenderDeviceError("Generated PBR contact shadow requires a matching live linear-clamp mask and viewport", "WEBGPU_CONTACT_SHADOW_INVALID");
        }
      }
      if (resource.uniform === "u_pointShadowMapTexture" || resource.uniform === "u_spotShadowMapTexture") {
        const point = resource.uniform === "u_pointShadowMapTexture";
        const prefix = point ? "u_pointShadow" : "u_spotShadow";
        const value = (suffix: string) => uniformNumber(command.uniforms?.get(`${prefix}${suffix}`), NaN);
        const vector = (suffix: string, length: number): number[] | null => {
          const data = command.uniforms?.get(`${prefix}${suffix}`);
          if (!Array.isArray(data) && (!ArrayBuffer.isView(data) || data instanceof DataView)) return null;
          const result = Array.from(data as ArrayLike<number>);
          return result.length === length && result.every(Number.isFinite) ? result : null;
        };
        const enabled = value("MapEnabled");
        if (enabled !== 0 && enabled !== 1) throw new RenderDeviceError("Standalone shadow enabled flag is invalid", "WEBGPU_PUNCTUAL_SHADOW_INVALID");
        if (enabled === 1) {
          const texel = vector("TexelSize", 2), position = vector("LightPosition", 3);
          const samples = vector("PcfSamples", 128), sampleCount = value("PcfSampleCount");
          const direction = point ? null : vector("LightDirection", 3);
          const cone = point ? null : vector("Cone", 2);
          const matrices = point ? vector("FaceMatrices", 96) : vector("Matrix", 16);
          const rects = point ? vector("FaceRects", 24) : null;
          const validRects = !point || (rects !== null && Array.from({ length: 6 }, (_, index) => rects.slice(index * 4, index * 4 + 4))
            .every(([x, y, w, h]) => x! >= 0 && y! >= 0 && w! > 0 && h! > 0 && x! + w! <= 1 + 1e-6 && y! + h! <= 1 + 1e-6));
          if (!binding?.texture || !binding.texture.usage.includes("sampled") || !texel || texel.some(component => component <= 0)
            || !position || !samples || !matrices || !validRects || !Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 32
            || !(value("Range") > 0) || !(value("Strength") >= 0 && value("Strength") <= 1) || !(value("Bias") >= 0) || !(value("SlopeBias") >= 0)
            || (!point && (!direction || Math.hypot(...direction) <= 0 || !cone || cone[0]! <= 0 || cone[0]! >= Math.PI / 2 || cone[1]! < 0 || cone[1]! > 1))) {
            throw new RenderDeviceError("Standalone shadow requires a live map and complete light and PCF packet", "WEBGPU_PUNCTUAL_SHADOW_INVALID", { binding: resource.uniform });
          }
        }
      }
      if (!("samplerBinding" in resource)) throw new RenderDeviceError("Generated PBR texture manifest is unsupported", "WEBGPU_TEXTURE_BINDING_UNAVAILABLE");
      let sampled: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean; readonly native?: WebGPUTextureLike } | null = this.createNativeSampledTextureBinding(binding);
      if (!sampled && resource.uniform === "u_shadowMapTexture" && uniformNumber(command.uniforms?.get("u_shadowMapEnabled"), 0) < 0.5) {
        sampled = this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
      }
      if (!sampled && resource.uniform === "u_localShadowAtlas") {
        const value = command.uniforms?.get("u_localShadowParams");
        const params = Array.isArray(value) || ArrayBuffer.isView(value) ? Array.from(value as ArrayLike<number>) : [];
        if (params[0] === 0) sampled = this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
      }
      if (!sampled && resource.uniform === "u_contactShadowMask" && uniformNumber(command.uniforms?.get("u_contactShadowMaskStrength"), 0) === 0) {
        sampled = this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
      }
      if (!sampled && (resource.uniform === "u_pointShadowMapTexture" || resource.uniform === "u_spotShadowMapTexture")
        && uniformNumber(command.uniforms?.get(resource.uniform.replace("Texture", "Enabled")), 0) === 0) {
        sampled = this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
      }
      if (!sampled && resource.optionalWhenWeightZero) {
        const weight = command.uniforms?.get(resource.optionalWhenWeightZero.uniform);
        const values = Array.isArray(weight) || ArrayBuffer.isView(weight) ? Array.from(weight as ArrayLike<number>) : [];
        const component = values[resource.optionalWhenWeightZero.component] ?? 0;
        if (component === 0) sampled = this.createNativeFallbackCubeBinding();
      }
      if (!sampled) throw new RenderDeviceError("Generated PBR requires a live sampled texture", "TEXTURE_BINDING_MISSING", { binding: resource.uniform });
      return { ...resource, ...sampled };
    }) ?? [];
    const generatedUnlitTextures = shader.generatedUnlit?.resources.map(resource => {
      const binding = uniformTextureBinding(command.uniforms, resource.uniform);
      if (!binding?.texture || binding.texture.dimension !== "2d") {
        throw new RenderDeviceError("Generated unlit requires its selected 2D texture", "TEXTURE_BINDING_MISSING", { binding: resource.uniform });
      }
      const sampled = this.createNativeSampledTextureBinding(binding);
      if (!sampled) throw new RenderDeviceError("Generated unlit requires a live sampled texture", "TEXTURE_BINDING_MISSING", { binding: resource.uniform });
      return { ...resource, ...sampled };
    }) ?? [];
    if (shader.nativeUniformLayout === "generated-program-ambient-pbr" && !sampledTexture) {
      throw new RenderDeviceError("Generated PBR requires a live base-color map", "TEXTURE_BINDING_MISSING", { binding: "u_baseColorMap" });
    }
    const uniformBuffer = shader.nativeUniformLayout === "generated-program-ambient-pbr"
      ? this.createNativeGeneratedAmbientUniformBuffer(command)
      : shader.nativeUniformLayout === "generated-program-pbr"
        ? this.createNativeGeneratedPbrUniformBuffer(command)
        : shader.nativeUniformLayout === "generated-program-unlit"
          ? this.createNativeGeneratedUnlitUniformBuffer(command)
        : morphPacket ? this.createNativeMorphUniformBuffer(command.label, morphPacket.data)
        : usesNativeDrawUniforms(shader.nativeUniformLayout) ? this.createNativeDrawUniformBuffer(command) : null;
    let atlasResources: ReturnType<WebGPUDevice["createNativeAtlasBindings"]> = null;
    let passTimer: WebGPUForwardPassTimer | null = null;
    try {
      const materialTextures = usesNativePbrTextureBindings(shader.nativeUniformLayout) ? this.createNativePbrTextureBindings(command) : null;
      atlasResources = shader.nativeUniformLayout === "generated-atlas-pbr" ? this.createNativeAtlasBindings(command) : null;
      if (shader.nativeUniformLayout === "generated-atlas-pbr" && !atlasResources) { if (uniformBuffer) this.retireNative(uniformBuffer); return; }
      if (shader.nativeUniformLayout === "generated-texture" && !sampledTexture) {
        if (uniformBuffer) this.retireNative(uniformBuffer);
        if (atlasResources) this.retireNative(atlasResources.buffer);
        return;
      }
      if (usesNativePbrTextureBindings(shader.nativeUniformLayout) && !materialTextures) {
        if (uniformBuffer) this.retireNative(uniformBuffer);
        if (atlasResources) this.retireNative(atlasResources.buffer);
        return;
      }
      if (shader.nativeUniformLayout === "portable" && !portableResources) return;
      const bindGroup = (uniformBuffer || portableResources) && pipeline.getBindGroupLayout && this.device.createBindGroup
        ? this.device.createBindGroup({
            label: `${command.label ?? "draw"}-draw-bind-group`,
            layout: pipeline.getBindGroupLayout(0),
            entries: portableResources?.entries ?? [
              { binding: 0, resource: { buffer: uniformBuffer! } },
              ...generatedTextures.flatMap(resource => [
                ...("samplerBinding" in resource ? [{ binding: resource.samplerBinding, resource: resource.sampler }] : []),
                { binding: resource.textureBinding, resource: resource.view }
              ]),
              ...generatedUnlitTextures.flatMap(resource => [
                { binding: resource.samplerBinding, resource: resource.sampler },
                { binding: resource.textureBinding, resource: resource.view }
              ]),
              ...(atlasResources?.entries ?? []),
              ...(sampledTexture ? [
                { binding: 1, resource: sampledTexture.sampler },
                { binding: 2, resource: sampledTexture.view }
              ] : []),
              ...(materialTextures ? [
                { binding: 1, resource: materialTextures.base.sampler },
                { binding: 2, resource: materialTextures.base.view },
                { binding: 3, resource: materialTextures.environment.sampler },
                { binding: 4, resource: materialTextures.environment.view },
                { binding: 5, resource: materialTextures.brdf.sampler },
                { binding: 6, resource: materialTextures.brdf.view },
                { binding: 7, resource: materialTextures.shadow.sampler },
                { binding: 8, resource: materialTextures.shadow.view },
                { binding: 9, resource: materialTextures.normal.sampler },
                { binding: 10, resource: materialTextures.normal.view },
                { binding: 11, resource: materialTextures.metallicRoughness.sampler },
                { binding: 12, resource: materialTextures.metallicRoughness.view },
                { binding: 13, resource: materialTextures.occlusion.sampler },
                { binding: 14, resource: materialTextures.occlusion.view },
                { binding: 15, resource: materialTextures.clusterLightData.view },
                { binding: 16, resource: materialTextures.clusterLightIndices.view },
                { binding: 17, resource: materialTextures.spotShadow.sampler },
                { binding: 18, resource: materialTextures.spotShadow.view }
              ] : [])
            ]
          })
        : null;
      if ((shader.nativeUniformLayout === "generated-program-ambient-pbr" || shader.nativeUniformLayout === "generated-program-pbr" || shader.nativeUniformLayout === "generated-program-unlit") && !bindGroup) {
        throw new RenderDeviceError("Generated program cannot bind its material", "WEBGPU_MATERIAL_BINDING_UNAVAILABLE");
      }
      if (shader.nativeUniformLayout === "portable" && !bindGroup) {
        throw new RenderDeviceError("Portable shader cannot bind its resources", "WEBGPU_PORTABLE_BINDING_UNAVAILABLE");
      }
      if (morphPacket && !bindGroup) {
        throw new RenderDeviceError("Native morph shader cannot bind its uniforms", "WEBGPU_MORPH_UNIFORM_UNAVAILABLE");
      }
      const storageGroups = this.createNativeStorageGroups(command, pipeline, shader.nativeUniformLayout === "portable" && shader.storageBindings !== undefined);
      const frameGroup = frameBuffer && pipeline.getBindGroupLayout && this.device.createBindGroup
        ? this.device.createBindGroup({ label: `${command.label ?? "draw"}-frame-bind-group`, layout: pipeline.getBindGroupLayout(1), entries: [{ binding: 0, resource: { buffer: nativeBufferHandle(frameBuffer) } }] })
        : null;
      if (frameBuffer && !frameGroup) {
        throw new RenderDeviceError("Generated program cannot bind AuraFrame", "WEBGPU_FRAME_UNIFORM_REQUIRED");
      }
      assertMrtCurrent();
      if (checkMrtShader) checkShaderIdentity();
      const profiling = this.forwardPassProfiler;
      if (profiling && !this.forwardPassProfiledThisFrame && command.label === profiling.drawLabel) {
        this.forwardPassProfiledThisFrame = true;
        passTimer = profiling.observer.beginForwardPass(`webgpu.forward-pass.g${this.generation}.frame${this.nativeFrameEpoch}.${profiling.drawLabel}`);
        this.assertAlive();
        assertMrtCurrent();
        if (checkMrtShader) checkShaderIdentity();
      }
      const pass = encoder.beginRenderPass({
        label: `${command.label ?? "draw"}-pass`,
        ...(passTimer?.timestampWrites ? { timestampWrites: passTimer.timestampWrites } : {}),
        colorAttachments: [...(nativeView ? [{
          view: nativeView,
          ...nativeColorSlice(this.activeRenderTarget),
          ...(sampleCount > 1 && resolveView ? { resolveTarget: resolveView } : {}),
          clearValue: this.activeRenderTarget?.nativeClearColor ?? this.clearColor,
          loadOp: shouldClear ? "clear" as const : "load" as const,
          storeOp: "store" as const
        }] : []), ...(this.activeRenderTarget?.nativeExtraColors.map((color) => ({
          view: color.multisampleView ?? color.view, ...(color.multisampleView ? { resolveTarget: color.view } : {}), clearValue: this.activeRenderTarget!.nativeClearColor,
          loadOp: shouldClear ? "clear" as const : "load" as const, storeOp: "store" as const
        })) ?? [])],
        ...(hasDepthStencil
          ? {
              depthStencilAttachment: {
                view: depthView,
                depthClearValue: this.depthConvention.clearValue,
                depthLoadOp: shouldClear ? "clear" as const : "load" as const,
                depthStoreOp: "store" as const,
                stencilClearValue: 0,
                stencilLoadOp: shouldClear ? "clear" as const : "load" as const,
                stencilStoreOp: "store" as const
              }
            }
          : {})
      });
      this.nativeRenderPasses += 1;
      pass.setPipeline(pipeline);
      if (pointCheck) {
        const viewport = this.getNativePointViewport();
        const customViewport = viewport.x !== 0 || viewport.y !== 0 || viewport.width !== viewport.targetWidth || viewport.height !== viewport.targetHeight;
        if ((customViewport && !pass.setViewport) || (viewport.scissor && !pass.setScissorRect)) {
          pass.end();
          throw new RenderDeviceError("Point draw cannot apply its viewport or scissor", "WEBGPU_POINT_VIEWPORT_UNAVAILABLE");
        }
      }
      if ((frameBuffer || shader.nativeUniformLayout === "portable" || morphPacket) && !pass.setBindGroup) {
        pass.end();
        throw new RenderDeviceError("WebGPU render pass cannot set its required bind group", "WEBGPU_PORTABLE_BINDING_UNAVAILABLE");
      }
      if (shader.generatedPbr?.transmission && !pass.setViewport && this.normalizedTransmissionViewport().some((value, index) => value !== [0, 0, 1, 1][index])) {
        pass.end();
        throw new RenderDeviceError("WebGPU transmission cannot apply its viewport", "WEBGPU_TRANSMISSION_VIEWPORT_INVALID");
      }
      this.applyViewStateToPass(pass);
      applyNativeRenderDynamicState(pass, resolvedState.dynamic);
      for (const [slot, buffer] of streams.buffers) pass.setVertexBuffer(slot, buffer);
      if (bindGroup) pass.setBindGroup?.(0, bindGroup);
      if (frameGroup) pass.setBindGroup?.(1, frameGroup);
      for (const [group, binding] of storageGroups) pass.setBindGroup?.(group, binding);
      if (command.indexBuffer) {
        if (!pass.setIndexBuffer || !pass.drawIndexed) {
          pass.end();
          passTimer?.cancel();
          if (uniformBuffer) this.retireNative(uniformBuffer);
          if (atlasResources) this.retireNative(atlasResources.buffer);
          if (portableResources) this.retireNative(portableResources.buffer);
          this.lastError = "Native WebGPU indexed draw skipped because the render-pass encoder does not expose indexed draw APIs.";
          return;
        }
        const indexBuffer = this.requireBuffer(command.indexBuffer);
        pass.setIndexBuffer(nativeBufferHandle(indexBuffer), command.indexType ?? "uint16");
        pass.drawIndexed(command.indexCount ?? this.indicesFor(command).length, command.instanceCount ?? 1, command.firstIndex ?? 0);
      } else {
        pass.draw(command.vertexCount, command.instanceCount ?? 1, command.firstVertex ?? 0);
      }
      pass.end();
      passTimer?.end(encoder);
      const accesses: { resource: object; mode: "read" | "write" | "readwrite" }[] = [];
      for (const buffer of streams.buffers.values()) accesses.push({ resource: buffer, mode: "read" });
      if (frameBuffer) accesses.push({ resource: nativeBufferHandle(frameBuffer), mode: "read" });
      if (command.indexBuffer) accesses.push({ resource: nativeBufferHandle(this.requireBuffer(command.indexBuffer)), mode: "read" });
      for (const binding of command.nativeStorageBindings ?? []) {
        const resource = binding.kind === "storage-buffer" ? nativeBufferHandle(this.requireBuffer(binding.buffer)) : this.getNativeTexture(binding.texture);
        accesses.push({ resource, mode: "readwrite" });
      }
      for (const value of command.uniforms?.values() ?? []) {
        if (!isTextureBinding(value) || !value.texture || value.texture.disposed) continue;
        const texture = value.texture;
        const target = [...this.renderTargets].find((candidate) => !candidate.disposed && (candidate.nativeColorFor(texture) !== undefined || candidate.depthTexture === texture || candidate.multisampledDepthTexture === texture));
        const streaming = this.nativeStreamingLeases.get(texture);
        const native = (streaming ? (streaming.current ?? streaming.fallback).native : undefined)
          ?? this.nativeSampledTextures.get(texture)?.texture ?? target?.nativeColorFor(texture) ?? target?.nativeDepthTexture;
        if (native) accesses.push({ resource: native, mode: "read" });
      }
      for (const resource of generatedTextures) if (resource.native) accesses.push({ resource: resource.native, mode: "read" });
      for (const resource of generatedUnlitTextures) accesses.push({ resource: resource.native, mode: "read" });
      if (this.activeRenderTarget) {
        for (const resource of [this.activeRenderTarget.nativeTexture, ...this.activeRenderTarget.nativeExtraColors.flatMap((color) => [color.native, color.multisampleNative]), this.activeRenderTarget.nativeMultisampleTexture, this.activeRenderTarget.nativeDepthTexture]) {
          if (resource) accesses.push({ resource, mode: "write" });
        }
      } else if (this.canvasDepthTexture) accesses.push({ resource: this.canvasDepthTexture, mode: "write" });
      if (this.gaussianSplatBorrowedDepth?.nativeDepthTexture) accesses.push({ resource: this.gaussianSplatBorrowedDepth.nativeDepthTexture, mode: "read" });
      const finished = encoder.finish();
      if (pointCheck) {
        pointCheck();
        for (const access of accesses) this.#pointPinnedHandles.add(access.resource);
      }
      assertMrtCurrent();
      if (checkMrtShader) checkShaderIdentity();
      checkDofDraw?.();
      checkP3Draw?.();
      morphPacket?.check();
      this.vertexConversionCheck?.();
      const submit = () => {
        this.vertexConversionCheck?.();
        return this.submitMrtAware([finished], accesses, Boolean(this.activeRenderTarget?.nativeExtraColors.length || p3Surface || morphPacket));
      };
      if (passTimer && profiling) {
        let submitted = false;
        let accepting = true;
        try {
          profiling.observer.submitForwardPass(encoder, passTimer, () => {
            if (!accepting || submitted) throw new Error("Forward pass submission must occur exactly once synchronously");
            submitted = true;
            submit();
          });
        } finally { accepting = false; }
        if (!submitted) throw new Error("Forward pass profiler did not submit the encoder");
      } else submit();
      this.nativeDrawReceipts.set(command, (this.nativeDrawReceipts.get(command) ?? 0) + 1);
      if (mrtTarget) mrtTarget.nativeNeedsClear = false;
      else if (this.activeRenderTarget) this.activeRenderTarget.nativeNeedsClear = false;
      if (uniformBuffer) this.retireNative(uniformBuffer);
      if (atlasResources) this.retireNative(atlasResources.buffer);
      if (portableResources) this.retireNative(portableResources.buffer);
      this.nativeSubmissions += 1;
      this.nativeDrawSubmissions += 1;
      if (sampledTexture) this.nativeTextureBindings += 1;
      this.nativeTextureBindings += generatedTextures.length;
      this.nativeTextureBindings += generatedUnlitTextures.length;
      if (shader.nativeUniformLayout === "generated-basic") this.nativeGeneratedBasicSubmissions += 1;
      if (shader.nativeUniformLayout === "generated-texture") this.nativeGeneratedTextureSubmissions += 1;
      if (shader.nativeUniformLayout === "passthrough") this.nativePassthroughSubmissions += 1;
      if (shader.nativeUniformLayout === "portable") {
        this.nativePassthroughSubmissions += 1;
        this.nativeTextureBindings += portableResources?.actualTextureCount ?? 0;
      }
      if (shader.nativeUniformLayout === "generated-pbr" || shader.nativeUniformLayout === "generated-atlas-pbr" || shader.nativeUniformLayout === "generated-textured-pbr" || shader.nativeUniformLayout === "generated-instanced-pbr" || shader.nativeUniformLayout === "generated-program-ambient-pbr" || shader.nativeUniformLayout === "generated-program-pbr") this.nativePbrSubmissions += 1;
      if (shader.nativeUniformLayout === "generated-instanced-pbr") this.nativeInstancedSubmissions += 1;
      if (shader.nativeUniformLayout === "generated-skinned-unlit") this.nativeSkinnedSubmissions += 1;
      if (shader.nativeUniformLayout === "generated-morph-unlit") this.nativeMorphSubmissions += 1;
      this.nativeTextureBindings += atlasResources?.actualTextureCount ?? 0;
      if (materialTextures?.actualBaseColor) this.nativeTextureBindings += 1;
      if (materialTextures?.actualNormal) this.nativeTextureBindings += 1;
      if (materialTextures?.actualMetallicRoughness) this.nativeTextureBindings += 1;
      if (materialTextures?.actualOcclusion) this.nativeTextureBindings += 1;
      if (materialTextures?.actualEnvironment) this.nativeEnvironmentBindings += 1;
      if (materialTextures?.actualBrdf) this.nativeEnvironmentBindings += 1;
      if (materialTextures?.actualShadow) this.nativeShadowMapBindings += 1;
      if (materialTextures?.actualSpotShadow) this.nativeShadowMapBindings += 1;
      if (!this.activeRenderTarget) this.canvasSubmissions += 1;
    } catch (error) {
      try { passTimer?.cancel(); } catch { /* Preserve the original draw error. */ }
      if (uniformBuffer) this.retireNative(uniformBuffer);
      if (atlasResources) this.retireNative(atlasResources.buffer);
      if (portableResources) this.retireNative(portableResources.buffer);
      throw error;
    }
  }

  private flushNativeRenderTargetClear(target: WebGPURenderTarget): void {
    this.requireRenderTarget(target);
    const drawView = target.nativeMultisampleView ?? target.nativeView;
    // A depth-only target clears through its depth attachment alone.
    if (!target.nativeNeedsClear || (!drawView && !(target.depthOnly && target.nativeDepthView)) || !this.device.createCommandEncoder) return;
    const clearColor = [...target.nativeClearColor] as [number, number, number, number];
    const proof = this.#nativeDofActive?.phase === "recording" && this.#nativeDofActive.target === target ? this.#nativeDofActive : undefined;
    const assertCurrent = (): void => {
      this.assertAlive();
      this.requireRenderTarget(target);
      if (target.colorTexture.disposed || !target.nativeNeedsClear) throw new RenderDeviceError("Render target changed before clear submission", "WEBGPU_TARGET_CLEAR_STALE");
      if (proof && (proof.phase !== "recording" || !this.nativeDofProofCurrent(proof) || target.nativeClearColor.some((value, index) => value !== clearColor[index]))) {
        proof.phase = "invalid";
        throw new RenderDeviceError("Native depth-of-field scene clear changed before submission", "WEBGPU_DOF_FRAME_STALE");
      }
    };
    assertCurrent();
    const encoder = this.device.createCommandEncoder({ label: `${target.label}-native-clear` });
    assertCurrent();
    const pass = encoder.beginRenderPass({
      label: `${target.label}-native-clear-pass`,
      colorAttachments: [...(drawView ? [{
        view: drawView,
        ...nativeColorSlice(target),
        ...(target.sampleCount > 1 && target.nativeView ? { resolveTarget: target.nativeView } : {}),
        clearValue: clearColor,
        loadOp: "clear" as const,
        storeOp: "store" as const
      }] : []), ...target.nativeExtraColors.map((color) => ({ view: color.multisampleView ?? color.view,
        ...(color.multisampleView ? { resolveTarget: color.view } : {}), clearValue: clearColor,
        loadOp: "clear" as const, storeOp: "store" as const }))],
      ...(target.nativeDepthView
        ? {
            depthStencilAttachment: {
              view: target.nativeDepthView,
              depthClearValue: this.depthConvention.clearValue,
              depthLoadOp: "clear" as const,
              depthStoreOp: "store" as const,
              stencilClearValue: 0,
              stencilLoadOp: "clear" as const,
              stencilStoreOp: "store" as const
            }
          }
        : {})
    });
    this.nativeRenderPasses += 1;
    pass.end();
    assertCurrent();
    const command = encoder.finish();
    assertCurrent();
    this.submitMrtAware([command], [target.nativeTexture, ...target.nativeExtraColors.flatMap((color) => [color.native, color.multisampleNative]), target.nativeMultisampleTexture, target.nativeDepthTexture]
      .filter((resource): resource is WebGPUTextureLike => resource !== null).map(resource => ({ resource, mode: "write" as const })), true);
    target.nativeNeedsClear = false;
  }

  private createNativeStorageGroups(command: DrawCommand, pipeline: WebGPURenderPipelineLike, explicitStorageLayout: boolean): Map<number, WebGPUBindGroupLike> {
    const groups = new Map<number, WebGPUBindGroupEntryLike[]>();
    const occupied = new Set<string>();
    for (const binding of command.nativeStorageBindings ?? []) {
      if (!Number.isSafeInteger(binding.group) || binding.group < 1 || !Number.isSafeInteger(binding.binding) || binding.binding < 0) {
        throw new RenderDeviceError("Storage bindings require a positive group and nonnegative binding", "WEBGPU_STORAGE_BINDING_INVALID", { name: binding.name });
      }
      const key = `${binding.group}:${binding.binding}`;
      if (occupied.has(key)) throw new RenderDeviceError("Duplicate storage binding", "WEBGPU_STORAGE_BINDING_DUPLICATE", { name: binding.name, group: binding.group, binding: binding.binding });
      occupied.add(key);
      let resource: unknown;
      if (binding.kind === "storage-buffer") {
        const native = this.getNativeStorageBuffer(binding.buffer);
        const offset = binding.offset ?? 0;
        const size = binding.size ?? binding.buffer.byteLength - offset;
        const alignment = this.device.limits?.minStorageBufferOffsetAlignment ?? 256;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset % alignment !== 0 || !Number.isSafeInteger(size) || size <= 0 || size % 4 !== 0 || offset + size > binding.buffer.byteLength) {
          throw new RenderDeviceError("Storage buffer range is invalid or unaligned", "WEBGPU_STORAGE_RANGE_INVALID", { name: binding.name, offset, size, alignment });
        }
        resource = { buffer: native, offset, size };
      } else {
        if (!binding.texture.usage.includes("storage")) throw new RenderDeviceError("Texture was not created for storage use", "WEBGPU_STORAGE_TEXTURE_REQUIRED", { name: binding.name });
        const actualFormat = webgpuSampledTextureFormat(binding.texture, binding.texture.format);
        if (binding.format && binding.format !== actualFormat) throw new RenderDeviceError("Storage texture format does not match", "WEBGPU_STORAGE_TEXTURE_FORMAT_MISMATCH", { name: binding.name, expected: binding.format, actual: actualFormat });
        resource = this.getNativeTexture(binding.texture).createView(explicitStorageLayout ? { dimension: "2d", baseMipLevel: 0, mipLevelCount: 1 } : undefined);
      }
      const entries = groups.get(binding.group) ?? [];
      entries.push({ binding: binding.binding, resource });
      groups.set(binding.group, entries);
    }
    const output = new Map<number, WebGPUBindGroupLike>();
    for (const [group, entries] of groups) {
      if (!pipeline.getBindGroupLayout || !this.device.createBindGroup) throw new RenderDeviceError("Storage bind groups are unavailable", "WEBGPU_STORAGE_BINDING_UNAVAILABLE");
      output.set(group, this.device.createBindGroup({ label: `${command.label ?? "draw"}-storage-${group}`, layout: pipeline.getBindGroupLayout(group), entries }));
    }
    return output;
  }

  private createNativeSampledTextureBinding(binding: TextureBinding | null, allowUnfilterable = false): { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean; readonly native: WebGPUTextureLike } | null {
    if (!binding?.texture || binding.texture.disposed || !binding.validate().ok || !this.device.createSampler) return null;
    const texture = binding.texture;
    if (!texture.usage.includes("sampled")) throw new RenderDeviceError("Texture was not created for sampling", "WEBGPU_SAMPLED_TEXTURE_REQUIRED", { label: texture.label });
    if (binding.sampler.compare) throw new RenderDeviceError("Comparison sampler requires a depth-comparison shader binding", "WEBGPU_SAMPLER_COMPARE_UNSUPPORTED", { label: texture.label });
    if (binding.sampler.mirror) throw new RenderDeviceError("Mirror-once sampler addressing is unavailable on WebGPU", "WEBGPU_SAMPLER_MIRROR_UNSUPPORTED", { label: texture.label });
    if (isFloat32Texture(texture) && !this.device.features?.has("float32-filterable")) {
      if (!allowUnfilterable) throw new RenderDeviceError("Float32 texture sampling requires float32-filterable with the active automatic pipeline layout", "WEBGPU_FLOAT32_FILTERABLE_REQUIRED", { label: texture.label, format: texture.format });
      assertNonFilteringSampler(binding.sampler, binding.name);
    }
    const native = this.getNativeSampledTexture(texture);
    const resource = this.nativeSampledTextures.get(texture);
    // Target color attachments can be sampled directly after their pass (or
    // the multisample resolve); no second allocation or readback is involved.
    const target = [...this.renderTargets].find((candidate) => !candidate.disposed && candidate.nativeColorFor(texture) !== undefined);
    const streaming = this.nativeStreamingLeases.get(texture);
    const view = (streaming ? (streaming.current ?? streaming.fallback).view : undefined) ?? resource?.view ?? target?.nativeSampledViewFor(texture);
    if (!view) throw new RenderDeviceError("Texture view cannot be sampled", "WEBGPU_TEXTURE_VIEW_UNAVAILABLE", { label: texture.label });
    this.resourceInterop.assertUsable(native);
    return {
      view,
      sampler: this.device.createSampler(webgpuSamplerDescriptor(binding.sampler)),
      actual: true,
      native
    };
  }

  /** Validate each decoded mip before allocating or writing its native texture. */
  private assertNativeCompressedFallbackLevel(texture: Texture,
    level: { readonly width: number; readonly height: number; readonly data: ArrayBufferView }, mipLevel: number): void {
    const width = Math.max(1, Math.floor(texture.width / 2 ** mipLevel));
    const height = Math.max(1, Math.floor(texture.height / 2 ** mipLevel));
    const layers = texture.dimension === "2d-array" ? texture.layers : 1;
    const byteLength = width * height * layers * 4;
    if (level.width !== width || level.height !== height || !(level.data instanceof Uint8Array) ||
        !Number.isSafeInteger(byteLength) || level.data.byteLength !== byteLength) {
      throw new RenderDeviceError("Compressed texture requires correctly sized decoded RGBA8 fallback mips", "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED", { format: texture.format, mipLevel });
    }
    if (texture.format === "bc1-rgb-unorm" || texture.format === "etc2-rgb8unorm") {
      for (let alpha = 3; alpha < level.data.length; alpha += 4) {
        if (level.data[alpha] !== 255) {
          throw new RenderDeviceError("Decoded RGB texture fallback must have opaque alpha", "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED", { format: texture.format, mipLevel });
        }
      }
    }
  }

  private validateNativeCompressedFallback(texture: Texture): void {
    const levels = texture.fallbackTextureLevels;
    const colorSpace: unknown = texture.colorSpace;
    if ((texture.dimension !== "2d" && texture.dimension !== "2d-array") ||
        !Number.isSafeInteger(texture.width) || texture.width < 1 || !Number.isSafeInteger(texture.height) || texture.height < 1 ||
        !Number.isSafeInteger(texture.layers) || texture.layers < 1 || !Number.isSafeInteger(texture.mipLevelCount) || texture.mipLevelCount < 1 ||
        texture.mipLevelCount > Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1 ||
        (colorSpace !== "linear" && colorSpace !== "srgb") ||
        levels.length !== texture.mipLevelCount) {
      throw new RenderDeviceError("Compressed texture requires a complete decoded RGBA8 fallback mip chain", "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED", { format: texture.format });
    }
    if (texture.dimension === "2d-array") {
      const dimensionLimit = this.device.limits?.maxTextureDimension2D, layerLimit = this.device.limits?.maxTextureArrayLayers;
      if ((dimensionLimit !== undefined && (!Number.isSafeInteger(dimensionLimit) || dimensionLimit < 1 || texture.width > dimensionLimit || texture.height > dimensionLimit)) ||
          (layerLimit !== undefined && (!Number.isSafeInteger(layerLimit) || layerLimit < 1 || texture.layers > layerLimit))) {
        throw new RenderDeviceError("Compressed texture array exceeds native device limits", "WEBGPU_TEXTURE_LIMIT_EXCEEDED", { width: texture.width, height: texture.height, layers: texture.layers });
      }
    }
    levels.forEach((level, mipLevel) => this.assertNativeCompressedFallbackLevel(texture, level, mipLevel));
  }

  /**
   * threejs-parity ST-01/ST-02/ST-03 (L4): allocate and upload the native
   * texture for a `Texture`. Source-backed textures prefer
   * `queue.copyExternalImageToTexture` (the level-0 external-image copy
   * replaces the draw-to-canvas readback entirely); when a mip chain is
   * requested — or the queue predates the copy — the canvas readback path
   * still produces real downsized levels so mipmap samplers stay complete.
   * `2d-array` textures upload every layer in a single writeTexture and cube
   * textures write all six faces at `origin.z = face`.
   */
  private createNativeSampledTextureResource(
    texture: Texture,
    assertCurrent: () => void,
    registerNative: (native: WebGPUTextureLike) => void
  ): { readonly texture: WebGPUTextureLike; readonly view: unknown } | null {
    assertCurrent();
    if (!this.device.createTexture) return null;
    if (texture.source) {
      const source = texture.source;
      const [width, height] = nativeTextureExtent(texture);
      const copyExternalImageToTexture = this.device.queue.copyExternalImageToTexture;
      const useExternalCopy = typeof copyExternalImageToTexture === "function" && !texture.generateMipmaps;
      const sourceLevels = useExternalCopy ? [] : nativeTextureSourceLevels(texture);
      assertCurrent();
      if (!useExternalCopy && sourceLevels.length === 0) return null;
      const nativeTexture = this.device.createTexture({
        label: texture.label,
        size: { width, height, depthOrArrayLayers: 1 },
        format: webgpuSampledTextureFormat(texture, "rgba8"),
        // copyExternalImageToTexture additionally requires RENDER_ATTACHMENT.
        usage: nativeTextureUsage(texture) | (useExternalCopy ? TEXTURE_USAGE.RENDER_ATTACHMENT : 0),
        mipLevelCount: useExternalCopy ? 1 : sourceLevels.length
      });
      registerNative(nativeTexture);
      assertCurrent();
      if (useExternalCopy) {
        this.performNativeTextureUpload(nativeTexture, () => copyExternalImageToTexture.call(
            this.device.queue,
            { source, flipY: texture.flipY },
            { texture: nativeTexture },
            { width, height, depthOrArrayLayers: 1 }
          ));
        this.nativeTextureUploads += 1;
        assertCurrent();
      } else {
        const writeTexture = this.device.queue.writeTexture;
        if (!writeTexture) return null;
        sourceLevels.forEach((level, mipLevel) => {
          assertCurrent();
          this.performNativeTextureUpload(nativeTexture, () => writeTexture.call(
            this.device.queue,
            { texture: nativeTexture, mipLevel },
            level.data,
            { bytesPerRow: level.bytesPerRow, rowsPerImage: level.height },
            { width: level.width, height: level.height, depthOrArrayLayers: 1 }
          ));
          this.nativeTextureUploads += 1;
          assertCurrent();
        });
      }
      const view = nativeTexture.createView();
      assertCurrent();
      return { texture: nativeTexture, view };
    }
    if (texture.format === "depth24") return null;
    const dataMipPlan = planNativeDataMipmaps(texture);
    let format = texture.format;
    let fallback = false;
    if (needsNativeCompressedFallback(format, this.device.features)) {
      this.validateNativeCompressedFallback(texture);
      format = "rgba8";
      fallback = true;
    }
    const depthOrArrayLayers = texture.dimension === "cube" ? 6 : texture.dimension === "2d-array" ? texture.layers : texture.dimension === "3d" ? texture.depth : 1;
    const nativeTexture = this.device.createTexture({
      label: texture.label,
      size: { width: texture.width, height: texture.height, depthOrArrayLayers },
      ...(texture.dimension === "3d" ? { dimension: "3d" as const } : {}),
      format: webgpuSampledTextureFormat(texture, format),
      usage: nativeTextureUsage(texture),
      mipLevelCount: dataMipPlan?.mipLevelCount ?? texture.mipLevelCount
    });
    registerNative(nativeTexture);
    assertCurrent();
    const uploaded = dataMipPlan
      ? this.writeNativeGeneratedDataMipmaps(texture, nativeTexture, dataMipPlan.mipLevelCount, assertCurrent)
      : fallback
      ? this.writeNativeTextureLevels(texture, nativeTexture, texture.fallbackTextureLevels, "rgba8", assertCurrent)
      : this.writeNativeTextureSubresources(texture, nativeTexture, true, assertCurrent);
    if (!uploaded) return null;
    const view = nativeTexture.createView(texture.dimension === "cube" ? { dimension: "cube" } : texture.dimension === "3d" ? { dimension: "3d" } : texture.dimension === "2d-array" ? { dimension: "2d-array" } : undefined);
    assertCurrent();
    return { texture: nativeTexture, view };
  }

  /**
   * Prepare a renderer-owned texture for compute on the same queue. A queued
   * target clear precedes every access, including write-only access: a shader
   * can update only part of the image and must not be overwritten by a later
   * deferred clear. The caller must still submit with the resource interop
   * lease, restrict its view to the declared mip range, and create a
   * depth-only view when sampling a depth attachment. Omit the range when
   * accessing all mips.
   */
  getNativeComputeTexture(texture: Texture, access: "read" | "write" | "readwrite",
    mips?: { readonly baseMipLevel: number; readonly mipLevelCount: number }): WebGPUTextureLike {
    this.assertAlive();
    if (access !== "read" && access !== "write" && access !== "readwrite") {
      throw new RenderDeviceError("Invalid compute texture access", "WEBGPU_COMPUTE_TEXTURE_ACCESS_INVALID", { access });
    }
    if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
    if (mips && (!Number.isSafeInteger(mips.baseMipLevel) || mips.baseMipLevel < 0 || !Number.isSafeInteger(mips.mipLevelCount)
      || mips.mipLevelCount < 1 || mips.baseMipLevel + mips.mipLevelCount > texture.mipLevelCount)) {
      throw new RenderDeviceError("Compute texture mip range is invalid", "WEBGPU_COMPUTE_TEXTURE_MIPS_INVALID", { label: texture.label });
    }
    const sampled = texture.usage.includes("sampled");
    const storage = texture.usage.includes("storage");
    if ((access === "read" && !sampled && !storage) || (access !== "read" && !storage)) {
      throw new RenderDeviceError("Texture usage does not permit compute access", "WEBGPU_COMPUTE_TEXTURE_USAGE_INVALID", { label: texture.label, access });
    }
    const targetNative = this.prepareNativeTargetTexture(texture, mips, true);
    if (!targetNative && texture.format === "depth24") {
      throw new RenderDeviceError("Compute depth sampling requires a same-device single-sampled depth attachment", "WEBGPU_COMPUTE_DEPTH_UNAVAILABLE", { label: texture.label });
    }
    if (storage) {
      const [width, height] = nativeTextureExtent(texture);
      if (width !== texture.width || height !== texture.height) {
        throw new RenderDeviceError("Storage texture source dimensions must match its declared extent", "WEBGPU_COMPUTE_TEXTURE_EXTENT_MISMATCH", { label: texture.label });
      }
    }
    // A target's clear can invalidate generated mips, so its selected range
    // is checked after the clear rather than through the full-chain getter.
    const native = targetNative ?? this.getNativeTexture(texture);
    const requiredUsage = (sampled ? TEXTURE_USAGE.TEXTURE_BINDING : 0) | (storage ? TEXTURE_USAGE.STORAGE_BINDING : 0);
    if (native.usage !== undefined && (native.usage & requiredUsage) !== requiredUsage) {
      throw new RenderDeviceError("Native texture usage does not match its compute usages", "WEBGPU_COMPUTE_TEXTURE_USAGE_INVALID", { label: texture.label });
    }
    if (native.sampleCount !== undefined && native.sampleCount !== 1) {
      throw new RenderDeviceError("Compute requires a single-sampled texture", "WEBGPU_COMPUTE_TEXTURE_MULTISAMPLED", { label: texture.label });
    }
    return native;
  }

  /** Prepare render-target contents only when a renderer really samples them. */
  private getNativeSampledTexture(texture: Texture): WebGPUTextureLike {
    this.assertAlive();
    if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
    return this.prepareNativeTargetTexture(texture) ?? this.getNativeTexture(texture);
  }

  /** Resolve a pending target clear without changing raw or write-only handle lookups. */
  private prepareNativeTargetTexture(texture: Texture,
    mips?: { readonly baseMipLevel: number; readonly mipLevelCount: number }, singleSampleDepth = false): WebGPUTextureLike | null {
    const targetOwner = getRenderTargetTextureOwner(texture);
    if (!targetOwner) return null;
    if (targetOwner !== this) throw new RenderDeviceError("Render-target texture belongs to another device", "FOREIGN_RESOURCE", { label: texture.label });
    const target = [...this.renderTargets].find((candidate) => !candidate.disposed &&
      (candidate.nativeColorFor(texture) !== undefined || candidate.depthTexture === texture || candidate.multisampledDepthTexture === texture));
    const native = target?.nativeColorFor(texture) ?? target?.nativeDepthTexture;
    if (!target || !native) throw new RenderDeviceError("Render-target texture is unavailable", "WEBGPU_TEXTURE_UNAVAILABLE", { label: texture.label });
    if (singleSampleDepth && texture.format === "depth24" && (target.depthTexture !== texture || target.sampleCount !== 1)) {
      throw new RenderDeviceError("Compute depth sampling requires a same-device single-sampled depth attachment", "WEBGPU_COMPUTE_DEPTH_UNAVAILABLE", { label: texture.label });
    }
    this.resourceInterop.assertUsable(native);
    if (target.nativeNeedsClear) {
      this.flushNativeRenderTargetClear(target);
      if (target.nativeNeedsClear) throw new RenderDeviceError("Render-target clear could not be submitted before texture access", "WEBGPU_TARGET_CLEAR_UNAVAILABLE", { label: texture.label });
    }
    if (target.disposed || texture.disposed) throw new RenderDeviceError("Render target was disposed while preparing its texture", "DISPOSED_RESOURCE", { label: texture.label });
    if (target.colorTexture === texture && texture.mipLevelCount > 1 && !target.nativeMipsReady &&
      !(mips?.baseMipLevel === 0 && mips.mipLevelCount === 1)) {
      throw new RenderDeviceError("Render-target mip chain has not been generated", "WEBGPU_RENDER_TARGET_MIPS_UNAVAILABLE", { label: texture.label });
    }
    return native;
  }

  /** Expose the device-owned native texture for same-device storage/compute. */
  getNativeTexture(texture: Texture): WebGPUTextureLike {
    this.assertAlive();
    const proof = this.#nativeDofActive;
    if (proof && (texture === proof.target.depthTexture || (proof.target.colorTextures ?? [proof.target.colorTexture]).includes(texture))) proof.phase = "invalid";
    if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
    const streaming = this.nativeStreamingLeases.get(texture);
    if (streaming) {
      if (streaming.colorSpace !== texture.colorSpace || streaming.revision !== texture.revision) throw new RenderDeviceError("Texture changed after streaming preparation", "WEBGPU_RESIDENCY_SOURCE_INVALID");
      const native = (streaming.current ?? streaming.fallback).native;
      this.resourceInterop.assertUsable(native);
      return native;
    }
    const targetOwner = getRenderTargetTextureOwner(texture);
    if (targetOwner && targetOwner !== this) throw new RenderDeviceError("Render-target texture belongs to another device", "FOREIGN_RESOURCE", { label: texture.label });
    if (targetOwner) {
      const target = [...this.renderTargets].find((candidate) => !candidate.disposed && (candidate.nativeColorFor(texture) !== undefined || candidate.depthTexture === texture || candidate.multisampledDepthTexture === texture));
      const native = target?.nativeColorFor(texture) ?? target?.nativeDepthTexture;
      if (!native) throw new RenderDeviceError("Render-target texture is unavailable", "WEBGPU_TEXTURE_UNAVAILABLE", { label: texture.label });
      if (target?.colorTexture === texture && texture.mipLevelCount > 1 && !target.nativeMipsReady) throw new RenderDeviceError("Render-target mip chain has not been generated", "WEBGPU_RENDER_TARGET_MIPS_UNAVAILABLE", { label: texture.label });
      this.resourceInterop.assertUsable(native);
      return native;
    }
    texture.pollContentRevision?.();
    if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
    const size = nativeTextureExtent(texture);
    const dataMipPlan = planNativeDataMipmaps(texture);
    if (dataMipPlan) {
      const maxDimension = this.device.limits?.maxTextureDimension2D;
      if (maxDimension !== undefined && (!Number.isSafeInteger(maxDimension) || maxDimension < 1 || size[0] > maxDimension || size[1] > maxDimension)) {
        throw new RenderDeviceError("Data mip texture exceeds the native device dimension limit", "WEBGPU_TEXTURE_LIMIT_EXCEEDED", { width: size[0], height: size[1] });
      }
    }
    const layout = nativeTextureLayoutKey(texture, size);
    let resource = this.nativeSampledTextures.get(texture);
    if (resource && (this.nativeSampledTextureLayouts.get(texture) !== layout ||
      (this.nativeBudgetedTextures.get(texture) !== texture && this.nativeSampledTextureRevisions.get(texture) !== texture.revision))) {
      this.releaseNativeSampledTexture(texture);
      resource = undefined;
    }
    if (!resource) {
      if (this.nativeSampledPreparations.has(texture)) throw new RenderDeviceError("Texture allocation cannot be reentered", "WEBGPU_TEXTURE_UPLOAD_ACTIVE");
      this.nativeSampledPreparations.add(texture);
      const policy = this.options.textureBudgetPolicy ?? DEFAULT_TEXTURE_BUDGET_POLICY;
      let budgeted: Texture | undefined;
      let allocatedNative: WebGPUTextureLike | undefined;
      let registered = false;
      const revision = texture.revision;
      const restoreDirty = texture.beginUploadAttempt();
      const arrayFallbackColorSpace = texture.dimension === "2d-array" && needsNativeCompressedFallback(texture.format, this.device.features)
        ? texture.colorSpace : undefined;
      const assertSourceCurrent = (): void => {
        this.assertAlive();
        if (texture.disposed || budgeted?.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
        if (texture.revision !== revision || (arrayFallbackColorSpace !== undefined && texture.colorSpace !== arrayFallbackColorSpace)) {
          throw new RenderDeviceError("Texture changed during native upload", "WEBGPU_TEXTURE_UPLOAD_STALE");
        }
      };
      try {
        budgeted = applyTextureBudget(texture, policy, this);
        assertSourceCurrent();
        if (dataMipPlan && budgeted !== texture) {
          throw new TextureBudgetExceededError(`Generated data texture ${texture.label} cannot be safely downscaled during admission.`);
        }
        if (texture.usage.includes("storage") && budgeted !== texture) {
          throw new TextureBudgetExceededError(`Storage texture ${texture.label} cannot be downscaled without changing compute coordinates.`);
        }
        const actualSize = nativeTextureExtent(budgeted);
        const maxDimension = policy.maxDimension ?? policy.maxTextureSize;
        if (maxDimension !== undefined && (actualSize[0] > maxDimension || actualSize[1] > maxDimension)) {
          throw new TextureBudgetExceededError(`Texture ${texture.label} exceeds the maximum texture dimension.`);
        }
        const fallback = needsNativeCompressedFallback(budgeted.format, this.device.features);
        if (fallback) this.validateNativeCompressedFallback(budgeted);
        const residentBytes = fallback ? budgeted.fallbackByteLength : nativeSampledResidentBytes(budgeted, actualSize);
        setTextureBudgetResidentBytes(texture, residentBytes, this);
        resource = this.createNativeSampledTextureResource(budgeted, assertSourceCurrent, (native) => {
          allocatedNative = native;
          this.assertAlive();
          this.registerNativeCleanup(native, [
            { run: () => { this.nativeBudgetRetirement.get(native)?.(); } },
            { run: () => { this.nativeBudgetRetirement.delete(native); }, retryable: true }
          ]);
          registered = true;
        }) ?? undefined;
        if (!resource) throw new RenderDeviceError("Texture cannot be allocated on this device", "WEBGPU_TEXTURE_UNAVAILABLE", { label: texture.label });
        assertSourceCurrent();
        this.nativeSampledTextures.set(texture, resource);
        this.nativeBudgetedTextures.set(texture, budgeted);
        if (fallback) {
          this.nativeCompressedFallbackBytes.set(texture, residentBytes);
          this.nativeCompressedFallbackData.set(texture, budgeted.fallbackTextureLevels.map((level) => level.data));
        }
        this.nativeSampledTextureSizes.set(texture, actualSize);
        this.nativeSampledTextureLayouts.set(texture, layout);
        this.nativeSampledTextureRevisions.set(texture, texture.revision);
        this.nativeSampledTextureGeneratedMips.set(texture, dataMipPlan !== null);
        let disposalFired = false;
        const removeDispose = texture.onDispose(() => { disposalFired = true; this.releaseNativeSampledTexture(texture); });
        if (disposalFired || this.nativeSampledTextures.get(texture) !== resource) {
          removeDispose();
          throw new RenderDeviceError("Texture was disposed during native upload", "DISPOSED_RESOURCE");
        }
        this.nativeSampledTextureDisposers.set(texture, removeDispose);
        assertSourceCurrent();
        texture.needsUpdate = false;
      } catch (error) {
        restoreDirty();
        this.nativeSampledTextureDisposers.get(texture)?.();
        this.nativeSampledTextureDisposers.delete(texture);
        this.nativeSampledTextures.delete(texture);
        this.nativeBudgetedTextures.delete(texture);
        this.nativeCompressedFallbackBytes.delete(texture);
        this.nativeCompressedFallbackData.delete(texture);
        this.nativeSampledTextureSizes.delete(texture);
        this.nativeSampledTextureLayouts.delete(texture);
        this.nativeSampledTextureRevisions.delete(texture);
        this.nativeSampledTextureGeneratedMips.delete(texture);
        if (budgeted) this.nativeSubresourceRevisions.delete(budgeted);
        if (allocatedNative && registered && this.resourceInterop.owns(allocatedNative)) {
          if (!this.nativeBudgetRetirement.has(allocatedNative)) this.nativeBudgetRetirement.set(allocatedNative, retireTextureBudget(texture, this));
          this.retireNative(allocatedNative);
        } else if (allocatedNative && !registered) {
          // The handle can belong to another device. Acquire the lease before
          // touching it and keep the detached budget charged if that fails.
          this.retireUnregisteredNative(allocatedNative, retireTextureBudget(texture, this));
        } else {
          releaseTextureBudget(texture, this);
        }
        if (budgeted && budgeted !== texture) budgeted.dispose();
        throw error;
      } finally {
        this.nativeSampledPreparations.delete(texture);
      }
    } else if (this.nativeSampledTextureRevisions.get(texture) !== texture.revision ||
      (dataMipPlan !== null && !this.nativeSampledTextureGeneratedMips.get(texture))) {
      if (this.nativeSampledPreparations.has(texture)) throw new RenderDeviceError("Texture upload cannot be reentered", "WEBGPU_TEXTURE_UPLOAD_ACTIVE");
      this.nativeSampledPreparations.add(texture);
      const expected = resource, revision = texture.revision;
      const restoreDirty = texture.beginUploadAttempt();
      const assertSourceCurrent = (): void => {
        this.assertAlive();
        if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE");
        if (this.nativeSampledTextures.get(texture) !== expected || texture.revision !== revision) throw new RenderDeviceError("Texture changed during native upload", "WEBGPU_TEXTURE_UPLOAD_STALE");
        this.resourceInterop.assertUsable(expected.texture);
      };
      try {
        if (!this.uploadNativeSampledTextureRevision(texture, resource.texture, assertSourceCurrent)) throw new RenderDeviceError("Texture update cannot be uploaded", "WEBGPU_TEXTURE_UPLOAD_UNAVAILABLE", { label: texture.label });
        assertSourceCurrent();
        this.nativeSampledTextureRevisions.set(texture, texture.revision);
        this.nativeSampledTextureGeneratedMips.set(texture, dataMipPlan !== null);
        texture.needsUpdate = false;
      } catch (error) {
        restoreDirty();
        throw error;
      } finally {
        this.nativeSampledPreparations.delete(texture);
      }
    }
    if (!dataMipPlan) this.nativeSampledTextureGeneratedMips.set(texture, false);
    this.resourceInterop.assertUsable(resource.texture);
    return resource.texture;
  }

  /**
   * Upload the full chain on each revision; no generated CPU data is retained.
   * Filtering is synchronous, so cancellation is observed between levels and
   * immediately after a queue callback, rather than during a pixel loop.
   */
  private writeNativeGeneratedDataMipmaps(texture: Texture, native: WebGPUTextureLike, mipLevelCount: number, assertCurrent: () => void): boolean {
    const write = this.device.queue.writeTexture;
    if (!write) return false;
    const colorSpace = texture.colorSpace;
    const assertGenerationCurrent = (): void => {
      assertCurrent();
      if (!texture.generateMipmaps || texture.colorSpace !== colorSpace) {
        throw new RenderDeviceError("Texture changed during data mip generation", "WEBGPU_TEXTURE_UPLOAD_STALE");
      }
    };
    let previous: ReturnType<Texture["getMipLevel"]> = null;
    for (let mip = 0; mip < mipLevelCount; mip += 1) {
      assertGenerationCurrent();
      const authored = mip < texture.mipLevelCount ? texture.getMipLevel(mip) : null;
      const level: ReturnType<Texture["getMipLevel"]> = authored ?? (previous ? filterNativeDataMip(previous, colorSpace) : null);
      if (!level) throw new RenderDeviceError("Data mip generation requires a base level", "WEBGPU_DATA_MIP_GENERATION_UNSUPPORTED");
      const width = Math.max(1, Math.floor(texture.width / 2 ** mip));
      const height = Math.max(1, Math.floor(texture.height / 2 ** mip));
      assertRgba8Level(level, width, height);
      assertGenerationCurrent();
      this.performNativeTextureUpload(native, () => write.call(this.device.queue, { texture: native, mipLevel: mip }, level.data,
        { bytesPerRow: width * 4, rowsPerImage: height }, { width, height, depthOrArrayLayers: 1 }));
      this.nativeTextureUploads += 1;
      assertGenerationCurrent();
      previous = level;
    }
    return true;
  }

  private writeNativeTextureSubresources(texture: Texture, native: WebGPUTextureLike, force: boolean, assertCurrent: () => void): boolean {
    const write = this.device.queue.writeTexture;
    const revisions = this.nativeSubresourceRevisions.get(texture) ?? new Map<string, number>();
    const faces: readonly (TextureCubeFace | undefined)[] = texture.dimension === "cube" ? ["px", "nx", "py", "ny", "pz", "nz"] : [undefined];
    let anyChanged = false;
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
      const face = faces[faceIndex];
      for (let mip = 0; mip < texture.mipLevelCount; mip += 1) {
        assertCurrent();
        const level = texture.getMipLevel(mip, face);
        if (!level) continue;
        if (!write) return false;
        const key = `${face ?? "texture"}:${mip}`;
        const revision = texture.getMipRevision(mip, face);
        if (!force && revisions.get(key) === revision) continue;
        const compressed = isCompressedTextureFormat(texture.format);
        const bytesPerRow = compressed ? Math.ceil(level.width / 4) * compressedBlockBytes(texture.format) : level.width * bytesPerPixel(texture.format);
        const rowsPerImage = compressed ? Math.ceil(level.height / 4) : level.height;
        this.performNativeTextureUpload(native, () => write.call(this.device.queue, { texture: native, mipLevel: mip, ...(face ? { origin: { z: faceIndex } } : {}) }, level.data,
          { bytesPerRow, rowsPerImage }, { width: level.width, height: level.height, depthOrArrayLayers: texture.dimension === "3d" ? level.depth ?? Math.max(1, texture.depth >> mip) : texture.dimension === "2d-array" ? texture.layers : 1 }));
        this.nativeTextureUploads += 1;
        assertCurrent();
        revisions.set(key, revision);
        anyChanged = true;
      }
    }
    assertCurrent();
    this.nativeSubresourceRevisions.set(texture, revisions);
    // A markNeedsUpdate without a subresource revision means caller-mutated
    // retained data; upload its populated mips once for this device.
    if (!force && !anyChanged && texture.revision !== this.nativeSampledTextureRevisions.get(texture)) return this.writeNativeTextureSubresources(texture, native, true, assertCurrent);
    return true;
  }

  /**
   * threejs-parity ST-01/ST-03 (L4): push every mip level of `levels` into
   * `nativeTexture`; for `2d-array` textures a single writeTexture covers all
   * `texture.layers` slices (the level data is stored layer-contiguous).
   */
  private writeNativeTextureLevels(
    texture: Texture,
    nativeTexture: WebGPUTextureLike,
    levels: readonly { readonly width: number; readonly height: number; readonly data: ArrayBufferView }[],
    format: TextureFormat,
    assertCurrent: () => void
  ): boolean {
    const writeTexture = this.device.queue.writeTexture;
    if (!writeTexture) return false;
    const levelBytesPerPixel = bytesPerPixel(format);
    for (const [mipLevel, level] of levels.entries()) {
      assertCurrent();
      const current = texture.fallbackTextureLevels[mipLevel];
      if (!current || current.data !== level.data || current.width !== level.width || current.height !== level.height) {
        throw new RenderDeviceError("Decoded texture fallback changed during native upload", "WEBGPU_TEXTURE_UPLOAD_STALE");
      }
      this.assertNativeCompressedFallbackLevel(texture, level, mipLevel);
      this.performNativeTextureUpload(nativeTexture, () => writeTexture.call(this.device.queue,
        { texture: nativeTexture, mipLevel, ...(texture.dimension === "2d-array" ? { origin: { z: 0 } } : {}) },
        level.data,
        { bytesPerRow: level.width * levelBytesPerPixel, rowsPerImage: level.height },
        { width: level.width, height: level.height, depthOrArrayLayers: texture.dimension === "2d-array" ? texture.layers : 1 }
      ));
      this.nativeTextureUploads += 1;
      assertCurrent();
    }
    return true;
  }

  /** threejs-parity ST-01 (L4): per-face per-level writeTexture for cube textures. */
  private writeNativeCubeFaceLevels(texture: Texture, nativeTexture: WebGPUTextureLike): boolean {
    if (!this.device.queue.writeTexture) return false;
    const faceOrder: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];
    const levelBytesPerPixel = bytesPerPixel(texture.format);
    for (const [faceIndex, face] of faceOrder.entries()) {
      const faceData = texture.cubeFaces.find((candidate) => candidate.face === face);
      if (!faceData) return false;
      for (const [mipLevel, level] of faceData.mipLevels.entries()) {
        this.device.queue.writeTexture(
          { texture: nativeTexture, mipLevel, origin: { z: faceIndex } },
          level.data,
          { bytesPerRow: level.width * levelBytesPerPixel, rowsPerImage: level.height },
          { width: level.width, height: level.height, depthOrArrayLayers: 1 }
        );
        this.nativeTextureUploads += 1;
      }
    }
    return true;
  }

  /**
   * threejs-parity ST-03 (L4): in-place re-upload for a revision-bumped
   * texture. Mirrors the create paths — external-image copy for source
   * textures (the video per-frame path), whole-chain writeTexture otherwise.
   * Returns false when the queue lacks the needed upload entry point so the
   * cached binding keeps its last-good content instead of corrupting it.
   */
  private uploadNativeSampledTextureRevision(texture: Texture, nativeTexture: WebGPUTextureLike, assertCurrent: () => void): boolean {
    assertCurrent();
    if (texture.source) {
      const source = texture.source;
      const [width, height] = nativeTextureExtent(texture);
      const copyExternalImageToTexture = this.device.queue.copyExternalImageToTexture;
      if (typeof copyExternalImageToTexture === "function" && !texture.generateMipmaps) {
        this.performNativeTextureUpload(nativeTexture, () => copyExternalImageToTexture.call(
          this.device.queue,
          { source, flipY: texture.flipY },
          { texture: nativeTexture },
          { width, height, depthOrArrayLayers: 1 }
        ));
        this.nativeTextureUploads += 1;
        assertCurrent();
        return true;
      }
      const sourceLevels = nativeTextureSourceLevels(texture);
      assertCurrent();
      if (sourceLevels.length === 0 || !this.device.queue.writeTexture) return false;
      sourceLevels.forEach((level, mipLevel) => {
        assertCurrent();
        this.performNativeTextureUpload(nativeTexture, () => this.device.queue.writeTexture!(
          { texture: nativeTexture, mipLevel },
          level.data,
          { bytesPerRow: level.bytesPerRow, rowsPerImage: level.height },
          { width: level.width, height: level.height, depthOrArrayLayers: 1 }
        ));
        this.nativeTextureUploads += 1;
        assertCurrent();
      });
      return true;
    }
    if (this.nativeCompressedFallbackBytes.has(texture)) {
      if (texture.fallbackTextureLevels.length === 0) {
        throw new RenderDeviceError("Updating compressed texture fallback requires replacement data", "WEBGPU_TEXTURE_FALLBACK_UPDATE_UNSUPPORTED", { format: texture.format });
      }
      this.validateNativeCompressedFallback(texture);
      // Metadata-only changes leave the decoded pixels and native allocation
      // intact. A replacement supplied after a compressed content edit has
      // the same extent and is written into the existing allocation.
      const levels = texture.fallbackTextureLevels;
      const written = this.nativeCompressedFallbackData.get(texture);
      if (!written || written.length !== levels.length || levels.some((level, index) => level.data !== written[index])) {
        this.writeNativeTextureLevels(texture, nativeTexture, levels, "rgba8", assertCurrent);
        this.nativeCompressedFallbackData.set(texture, levels.map((level) => level.data));
      }
      return true;
    }
    const dataMipPlan = planNativeDataMipmaps(texture);
    if (dataMipPlan) return this.writeNativeGeneratedDataMipmaps(texture, nativeTexture, dataMipPlan.mipLevelCount, assertCurrent);
    return this.writeNativeTextureSubresources(texture, nativeTexture, false, assertCurrent);
  }

  private releaseDisposedNativeSampledTextures(): void {
    for (const texture of this.nativeSampledTextures.keys()) if (texture.disposed) this.releaseNativeSampledTexture(texture);
  }

  private releaseNativeSampledTexture(texture: Texture): void {
    if (this.activeNativeSampledReleases.has(texture)) return;
    const resource = this.nativeSampledTextures.get(texture);
    if (!resource) return;
    this.activeNativeSampledReleases.add(texture);
    try {
      const budgeted = this.nativeBudgetedTextures.get(texture);
      this.nativeSampledTextureDisposers.get(texture)?.();
      this.nativeSampledTextureDisposers.delete(texture);
      this.nativeSampledTextures.delete(texture);
      this.nativeBudgetedTextures.delete(texture);
      this.nativeCompressedFallbackBytes.delete(texture);
      this.nativeCompressedFallbackData.delete(texture);
      this.nativeSampledTextureRevisions.delete(texture);
      this.nativeSampledTextureGeneratedMips.delete(texture);
      this.nativeSubresourceRevisions.delete(texture);
      if (budgeted && budgeted !== texture) this.nativeSubresourceRevisions.delete(budgeted);
      this.nativeSampledTextureSizes.delete(texture);
      this.nativeSampledTextureLayouts.delete(texture);
      if (texture.disposed) this.disposedSampledTextures += 1;
      const releaseBudget = retireTextureBudget(texture, this);
      const failures: unknown[] = [];
      try {
        if (this.resourceInterop.owns(resource.texture)) {
          this.nativeBudgetRetirement.set(resource.texture, releaseBudget);
          this.retireNativeSweepTexture(resource.texture);
        } else {
          releaseBudget();
        }
      } catch (error) { failures.push(error); }
      if (budgeted && budgeted !== texture) {
        try { this.disposeNativeBudgetedTexture(budgeted); } catch (error) { failures.push(error); }
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1) throw new AggregateError(failures, "Failed to release WebGPU sampled texture");
    } finally { this.activeNativeSampledReleases.delete(texture); }
  }

  private createNativePbrTextureBindings(command: DrawCommand): {
    readonly base: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly environment: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly brdf: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly shadow: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly spotShadow: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly normal: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly metallicRoughness: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly occlusion: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly clusterLightData: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly clusterLightIndices: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly actualBaseColor: boolean;
    readonly actualEnvironment: boolean;
    readonly actualBrdf: boolean;
    readonly actualShadow: boolean;
    readonly actualSpotShadow: boolean;
    readonly actualNormal: boolean;
    readonly actualMetallicRoughness: boolean;
    readonly actualOcclusion: boolean;
  } | null {
    if (!hasNativeSampledTextureBinding(this.device)) return null;
    const baseBinding = uniformBaseColorTextureBinding(command.uniforms);
    const environmentBinding = uniformTextureBinding(command.uniforms, "u_environmentMapTexture");
    const brdfBinding = uniformTextureBinding(command.uniforms, "u_environmentBrdfLutTexture");
    const shadowBinding = uniformTextureBinding(command.uniforms, "u_shadowMapTexture");
    const spotShadowBinding = uniformTextureBinding(command.uniforms, "u_spotShadowMapTexture");
    const normalBinding = uniformTextureBinding(command.uniforms, "u_normalTexture");
    const metallicRoughnessBinding = uniformTextureBinding(command.uniforms, "u_metallicRoughnessTexture");
    const occlusionBinding = uniformTextureBinding(command.uniforms, "u_occlusionTexture");
    const clusterLightDataBinding = uniformTextureBinding(command.uniforms, "u_clusterLightData");
    const clusterLightIndicesBinding = uniformTextureBinding(command.uniforms, "u_clusterLightIndices");
    const base = this.createNativeSampledTextureBinding(baseBinding) ?? this.createNativeFallbackSampledTextureBinding("white-srgb", [255, 255, 255, 255], "srgb");
    const environment = this.createNativeSampledTextureBinding(environmentBinding) ?? this.createNativeFallbackSampledTextureBinding("environment-srgb", [92, 116, 156, 255], "srgb");
    const brdf = this.createNativeSampledTextureBinding(brdfBinding) ?? this.createNativeFallbackSampledTextureBinding("brdf-linear", [180, 180, 255, 255], "linear");
    const shadow = this.createNativeSampledTextureBinding(shadowBinding) ?? this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
    const spotShadow = this.createNativeSampledTextureBinding(spotShadowBinding) ?? this.createNativeFallbackSampledTextureBinding("spot-shadow-lit-linear", [255, 255, 255, 255], "linear");
    const normal = this.createNativeSampledTextureBinding(normalBinding) ?? this.createNativeFallbackSampledTextureBinding("flat-normal-linear", [128, 128, 255, 255], "linear");
    const metallicRoughness = this.createNativeSampledTextureBinding(metallicRoughnessBinding) ?? this.createNativeFallbackSampledTextureBinding("metallic-roughness-linear", [255, 255, 255, 255], "linear");
    const occlusion = this.createNativeSampledTextureBinding(occlusionBinding) ?? this.createNativeFallbackSampledTextureBinding("occlusion-linear", [255, 255, 255, 255], "linear");
    const clusterLightData = this.createNativeSampledTextureBinding(clusterLightDataBinding) ?? this.createNativeFallbackSampledTextureBinding("cluster-light-data-linear", [0, 0, 0, 0], "linear");
    const clusterLightIndices = this.createNativeSampledTextureBinding(clusterLightIndicesBinding) ?? this.createNativeFallbackSampledTextureBinding("cluster-light-indices-linear", [0, 0, 0, 0], "linear");
    if (!base || !environment || !brdf || !shadow || !spotShadow || !normal || !metallicRoughness || !occlusion || !clusterLightData || !clusterLightIndices) return null;
    return {
      base,
      environment,
      brdf,
      shadow,
      spotShadow,
      normal,
      metallicRoughness,
      occlusion,
      clusterLightData,
      clusterLightIndices,
      actualBaseColor: baseBinding !== null && base.actual,
      actualEnvironment: environmentBinding !== null && environment.actual,
      actualBrdf: brdfBinding !== null && brdf.actual,
      actualShadow: shadowBinding !== null && shadow.actual,
      actualSpotShadow: spotShadowBinding !== null && spotShadow.actual,
      actualNormal: normalBinding !== null && normal.actual,
      actualMetallicRoughness: metallicRoughnessBinding !== null && metallicRoughness.actual,
      actualOcclusion: occlusionBinding !== null && occlusion.actual
    };
  }

  private createNativeFallbackSampledTextureBinding(key: string, rgba: readonly [number, number, number, number], colorSpace: Texture["colorSpace"]): { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean; readonly native: WebGPUTextureLike } | null {
    if (!hasNativeSampledTextureBinding(this.device)) return null;
    let resource = this.nativeFallbackTextures.get(key);
    if (!resource) {
      resource = this.createBudgetedNativeFallback(key, new Uint8Array(rgba), colorSpace, false);
    }
    return {
      view: resource.view,
      sampler: this.device.createSampler({
        minFilter: "nearest",
        magFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      }),
      actual: false,
      native: resource.texture
    };
  }

  /** A zero-weight local probe still needs a valid cube-typed binding. */
  private createNativeFallbackCubeBinding(): { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: false; readonly native: WebGPUTextureLike } | null {
    if (!hasNativeSampledTextureBinding(this.device)) return null;
    const key = "empty-probe-cube";
    let resource = this.nativeFallbackTextures.get(key);
    if (!resource) {
      resource = this.createBudgetedNativeFallback(key, new Uint8Array(24), "linear", true);
    }
    return { view: resource.view, sampler: this.device.createSampler({ minFilter: "linear", magFilter: "linear" }), actual: false, native: resource.texture };
  }

  private createBudgetedNativeFallback(key: string, data: Uint8Array, colorSpace: Texture["colorSpace"], cube: boolean): { readonly texture: WebGPUTextureLike; readonly view: unknown } {
    const policy = this.options.textureBudgetPolicy;
    const release = reserveTextureBudget(data.byteLength, policy?.maxBytes ?? policy?.textureBudgetBytes, this);
    let native: WebGPUTextureLike | undefined;
    let registered = false;
    try {
      native = this.device.createTexture!({ label: `aura3d-native-${key}`, size: { width: 1, height: 1, depthOrArrayLayers: cube ? 6 : 1 },
        format: colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm", usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST });
      const held = native;
      this.registerNativeCleanup(held, [{ run: release }]);
      registered = true;
      this.device.queue.writeTexture!({ texture: native }, data, { bytesPerRow: 4, rowsPerImage: 1 }, { width: 1, height: 1, depthOrArrayLayers: cube ? 6 : 1 });
      const resource = { texture: native, view: native.createView(cube ? { dimension: "cube" } : undefined) };
      this.nativeFallbackTextures.set(key, resource);
      this.nativeTextureUploads += 1;
      return resource;
    } catch (error) {
      if (native && registered) this.retireNative(native);
      else if (native) this.retireUnregisteredNative(native, release);
      else release();
      throw error;
    }
  }

  private createNativeGeneratedAmbientUniformBuffer(command: DrawCommand): WebGPUBufferLike {
    // Matches GeneratedAmbientMaterial in nativeGeneratedAmbientPbrShader.
    const data = new Float32Array(48);
    data.set(uniformMat4(command.uniforms?.get("u_modelMatrix")) ?? identityMatrix(), 0);
    data.set(uniformMat4(command.uniforms?.get("u_geometryMatrix")) ?? identityMatrix(), 16);
    data.set(uniformColor(command.uniforms), 32);
    data.set(uniformVec3(command.uniforms?.get("u_environmentColor")) ?? [0, 0, 0], 36);
    data[39] = uniformNumber(command.uniforms?.get("u_environmentIntensity"), 0);
    data.set(uniformVec3(command.uniforms?.get("u_emissiveColor")) ?? [0, 0, 0], 40);
    data[43] = uniformNumber(command.uniforms?.get("u_emissiveStrength"), 0);
    data[44] = uniformNumber(command.uniforms?.get("u_metallic"), 0);
    data[45] = uniformNumber(command.uniforms?.get("u_alphaCutoff"), 0);
    const buffer = this.device.createBuffer({ label: `${command.label ?? "draw"}-generated-material`, size: data.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    try {
      this.device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    } catch (error) {
      this.retireNative(buffer);
      throw error;
    }
  }

  private createNativeGeneratedPbrUniformBuffer(command: DrawCommand): WebGPUBufferLike {
    const uniforms = new Map(command.uniforms ?? []);
    if (command.shader && this.requireShader(command.shader).generatedPbr?.transmission) uniforms.set("u_webgpuTransmissionViewport", this.normalizedTransmissionViewport());
    const program = command.shader ? this.requireShader(command.shader).generatedPbr : undefined;
    const data = packGeneratedPbrMaterialUniforms(uniforms, Boolean(program?.packedLoopColor), Boolean(program?.photometricProfile));
    const buffer = this.device.createBuffer({ label: `${command.label ?? "draw"}-generated-pbr-material`, size: data.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    try {
      this.device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    } catch (error) {
      this.retireNative(buffer);
      throw error;
    }
  }

  private createNativeGeneratedUnlitUniformBuffer(command: DrawCommand): WebGPUBufferLike {
    const data = packGeneratedUnlitMaterialUniforms(command.uniforms ?? new Map(), Boolean(command.shader && this.requireShader(command.shader).generatedUnlit?.packedLoopColor));
    const buffer = this.device.createBuffer({ label: `${command.label ?? "draw"}-generated-unlit-material`, size: data.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    try {
      this.device.queue.writeBuffer(buffer, 0, data);
      return buffer;
    } catch (error) {
      this.retireNative(buffer);
      throw error;
    }
  }

  /** Snapshot the legacy uniform morph contract independently of PBR/skinning. */
  private prepareNativeMorphUniforms(command: DrawCommand): { readonly data: Float32Array; readonly check: () => void } {
    const byteLength = NATIVE_MORPH_UNIFORM_FLOATS * 4;
    for (const name of ["maxBufferSize", "maxUniformBufferBindingSize"] as const) {
      const limit = this.device.limits?.[name];
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < byteLength)) {
        throw new RenderDeviceError("Native morph uniforms exceed the device limit", "WEBGPU_MORPH_UNIFORM_LIMIT", { name, limit, byteLength });
      }
    }
    if (!this.device.createBindGroup) throw new RenderDeviceError("Native morph uniforms cannot be bound", "WEBGPU_MORPH_UNIFORM_UNAVAILABLE");
    const textureMode = command.uniforms?.get("u_morphUsesTexture") ?? 0;
    if (textureMode !== 0) throw new RenderDeviceError("Native uniform morphing does not support the texture mode", "WEBGPU_MORPH_TEXTURE_UNSUPPORTED");
    const count = command.uniforms?.get("u_morphTargetCount") ?? 0;
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > NATIVE_MORPH_MAX_TARGETS) {
      throw new RenderDeviceError("Native morph target count is invalid", "WEBGPU_MORPH_UNIFORM_INVALID");
    }
    const firstVertex = command.firstVertex ?? 0, vertexCount = command.vertexCount;
    const indexBuffer = command.indexBuffer, indexCount = command.indexCount, firstIndex = command.firstIndex ?? 0;
    const indexType = command.indexType ?? "uint16", shader = command.shader;
    let index: WebGPURenderBuffer | undefined, epoch: object | undefined;
    let lastVertex = firstVertex + vertexCount - 1;
    if (indexBuffer && indexType !== "uint16" && indexType !== "uint32") {
      throw new RenderDeviceError("Native morph index type is invalid", "WEBGPU_MORPH_VERTEX_RANGE");
    }
    if (count > 0 && indexBuffer) {
      index = this.requireBuffer(indexBuffer);
      if (!index.shadowValid || this.nativeExposedBuffers.has(index)) {
        throw new RenderDeviceError("Native morph indexing needs an authoritative index shadow", "WEBGPU_MORPH_VERTEX_RANGE");
      }
      const stride = indexType === "uint32" ? 4 : 2;
      if (indexCount === undefined || !Number.isSafeInteger(indexCount) || indexCount <= 0) {
        throw new RenderDeviceError("Native morph index count is invalid", "WEBGPU_MORPH_VERTEX_RANGE");
      }
      const end = (firstIndex + indexCount) * stride;
      if (!Number.isSafeInteger(end) || end > index.byteLength) {
        throw new RenderDeviceError("Native morph index range is invalid", "WEBGPU_MORPH_VERTEX_RANGE");
      }
      const view = new DataView(index.bytes.buffer, index.bytes.byteOffset, index.bytes.byteLength);
      lastVertex = 0;
      for (let offset = firstIndex * stride; offset < end; offset += stride) {
        lastVertex = Math.max(lastVertex, stride === 4 ? view.getUint32(offset, true) : view.getUint16(offset, true));
      }
      epoch = this.#morphBufferEpochs.get(index);
      if (!epoch) { epoch = {}; this.#morphBufferEpochs.set(index, epoch); }
    }
    if (count > 0 && (!Number.isSafeInteger(lastVertex) || lastVertex >= NATIVE_MORPH_MAX_VERTICES)) {
      throw new RenderDeviceError("Native uniform morphing addresses at most 64 vertices", "WEBGPU_MORPH_VERTEX_RANGE");
    }
    const data = new Float32Array(NATIVE_MORPH_UNIFORM_FLOATS);
    data.set(uniformMat4(command.uniforms?.get("u_modelViewProjection")) ?? identityMatrix(), 0);
    data.set(uniformColor(command.uniforms), 16);
    data[24] = count;
    if (count > 0) {
      const rawWeights = command.uniforms?.get("u_morphWeights"), rawDeltas = command.uniforms?.get("u_morphPositionDeltas");
      const required = ((count - 1) * NATIVE_MORPH_MAX_VERTICES + lastVertex + 1) * 4;
      if (!(rawWeights instanceof Float32Array || Array.isArray(rawWeights)) || rawWeights.length !== NATIVE_MORPH_MAX_TARGETS ||
          !(rawDeltas instanceof Float32Array || Array.isArray(rawDeltas)) || rawDeltas.length < required ||
          rawDeltas.length % 4 !== 0 ||
          rawDeltas.length > NATIVE_MORPH_MAX_TARGETS * NATIVE_MORPH_MAX_VERTICES * 4) {
        throw new RenderDeviceError("Native morph weights or target-major position deltas are invalid", "WEBGPU_MORPH_UNIFORM_INVALID");
      }
      const weights = Array.from(rawWeights), deltas = Array.from(rawDeltas);
      const finiteFloat = (value: number): boolean => typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value));
      if (!weights.every(finiteFloat) || !deltas.every(finiteFloat)) {
        throw new RenderDeviceError("Native morph weights or target-major position deltas are invalid", "WEBGPU_MORPH_UNIFORM_INVALID");
      }
      data.set(weights, 20);
      data.set(deltas, 28);
    }
    const check = (): void => {
      if (command.shader !== shader || command.vertexCount !== vertexCount || (command.firstVertex ?? 0) !== firstVertex ||
          command.indexBuffer !== indexBuffer || command.indexCount !== indexCount || (command.firstIndex ?? 0) !== firstIndex ||
          (command.indexType ?? "uint16") !== indexType ||
          (index && (this.requireBuffer(indexBuffer!) !== index || !index.shadowValid || this.nativeExposedBuffers.has(index) || this.#morphBufferEpochs.get(index) !== epoch))) {
        throw new RenderDeviceError("Native morph draw changed before submission", "WEBGPU_MORPH_DRAW_STALE");
      }
    };
    return { data, check };
  }

  private createNativeMorphUniformBuffer(label: string | undefined, data: Float32Array): WebGPUBufferLike {
    const buffer = this.device.createBuffer({ label: `${label ?? "draw"}-morph-uniforms`, size: data.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    try { this.device.queue.writeBuffer(buffer, 0, data); }
    catch (error) { this.retireNative(buffer); throw error; }
    return buffer;
  }

  private createNativeDrawUniformBuffer(command: DrawCommand): WebGPUBufferLike | null {
    if (!this.device.createBindGroup) return null;
    // 188 floats for the scalar/matrix fields + 96 joint matrices (16 floats each) appended at 188
    // + J2 native shadow projections (312 floats at 1724: directional matrix/params/PCF, then spot)
    // + model matrix (16 floats at 2036) for instanced world composition.
    const data = new Float32Array(2052);
    const baseColorBinding = uniformBaseColorTextureBinding(command.uniforms);
    const environmentBinding = uniformTextureBinding(command.uniforms, "u_environmentMapTexture");
    const normalBinding = uniformTextureBinding(command.uniforms, "u_normalTexture");
    const metallicRoughnessBinding = uniformTextureBinding(command.uniforms, "u_metallicRoughnessTexture");
    const occlusionBinding = uniformTextureBinding(command.uniforms, "u_occlusionTexture");
    data.set(uniformMat4(command.uniforms?.get("u_modelViewProjection")) ?? identityMatrix(), 0);
    data.set(uniformColor(command.uniforms), 16);
    data[20] = uniformNumber(command.uniforms?.get("u_metallic"), 0);
    data[21] = uniformNumber(command.uniforms?.get("u_roughness"), 0.5);
    data[22] = uniformNumber(command.uniforms?.get("u_environmentIntensity"), 0);
    data[23] = uniformNumber(command.uniforms?.get("u_environmentMapTextureIntensity"), 0);
    data[24] = uniformNumber(command.uniforms?.get("u_baseColorTextureEnabled"), baseColorBinding ? 1 : 0);
    data[25] = uniformNumber(command.uniforms?.get("u_shadowMapEnabled"), 0);
    data[26] = uniformNumber(command.uniforms?.get("u_shadowMapStrength"), 0.65);
    data[27] = uniformNumber(command.uniforms?.get("u_environmentMapTextureEnabled"), environmentBinding ? 1 : 0);
    data[30] = uniformNumber(command.uniforms?.get("u_environmentMapTextureMipCount"), 1);
    data[31] = uniformNumber(command.uniforms?.get("u_environmentMapTextureSpecularIntensity"), 0)
      * uniformNumber(command.uniforms?.get("u_materialEnvironmentSpecularScale"), 1);
    data[128] = uniformNumber(command.uniforms?.get("u_normalTextureEnabled"), normalBinding ? 1 : 0);
    data[129] = uniformNumber(command.uniforms?.get("u_normalScale"), 1);
    data[130] = uniformNumber(command.uniforms?.get("u_occlusionStrength"), 1);
    data[160] = uniformNumber(command.uniforms?.get("u_alphaCutoff"), 0);
    data[161] = uniformNumber(command.uniforms?.get("u_transmissionFactor"), 0);
    data[162] = uniformNumber(command.uniforms?.get("u_diffuseTransmissionFactor"), 0);
    data[163] = uniformVec2(command.uniforms?.get("u_clusterGridSize"))?.[0] ?? 1;
    data.set(uniformVec3(command.uniforms?.get("u_cameraPosition")) ?? [0, 0, 1], 164);
    data[167] = 1;
    data[168] = uniformNumber(command.uniforms?.get("u_metallicRoughnessTextureEnabled"), metallicRoughnessBinding ? 1 : 0);
    data[169] = uniformNumber(command.uniforms?.get("u_occlusionTextureEnabled"), occlusionBinding ? 1 : 0);
    data[170] = 0; // materialFlags.z was the product-colour smoothing flag — removed in the PRD 11 Phase 1 freeze
    data[171] = uniformNumber(command.uniforms?.get("u_clusteredLightEnabled"), 0);
    data.set(uniformMat4(command.uniforms?.get("u_normalMatrix")) ?? identityMatrix(), 172);
    const modelMatrix = uniformMat4(command.uniforms?.get("u_modelMatrix")) ?? identityMatrix();
    const instanceMatrixValue = command.uniforms?.get("u_instanceMatrices");
    const instanceMatrixNumbers = instanceMatrixValue instanceof Float32Array || Array.isArray(instanceMatrixValue) ? Array.from(instanceMatrixValue) : [];
    const hasInstanceMatrices = instanceMatrixNumbers.length >= 16 && instanceMatrixNumbers.slice(0, 16).every(Number.isFinite);
    const instanceMatrices = hasInstanceMatrices ? uniformMat4Array(instanceMatrixValue, 4) : [];
    for (let index = 0; index < 4; index += 1) {
      data.set(instanceMatrices[index] ?? (index === 0 ? modelMatrix : identityMatrix()), 32 + index * 16);
    }
    // Legacy 2-slot joint fields (offsets 96/112) kept as identity for layout stability.
    data.set(identityMatrix(), 96);
    data.set(identityMatrix(), 112);
    // Full 96-joint palette (WebGL2 parity), appended after normalMatrix at offset 188.
    const jointMatrices = uniformMat4Array(command.uniforms?.get("u_jointMatrices"), MAX_WEBGPU_SKINNING_JOINTS);
    for (let index = 0; index < MAX_WEBGPU_SKINNING_JOINTS; index += 1) {
      data.set(jointMatrices[index] ?? identityMatrix(), 188 + index * 16);
    }
    // J2 native shadow projections (WGSL parity with a3dForwardShadowFactor /
    // a3dSpotShadowFactor). Identity matrices + zero enabled flags keep every
    // shadow factor at exactly 1.0 (lit) when the ForwardPass gates stay shut.
    data.set(uniformMat4(command.uniforms?.get("u_shadowMapMatrix")) ?? identityMatrix(), 1724);
    const shadowTexel = uniformVec2(command.uniforms?.get("u_shadowMapTexelSize")) ?? [1, 1];
    data.set(
      [
        uniformNumber(command.uniforms?.get("u_shadowMapBias"), 0.001),
        uniformNumber(command.uniforms?.get("u_shadowMapSlopeBias"), 1),
        shadowTexel[0],
        shadowTexel[1]
      ],
      1740
    );
    data.set([uniformNumber(command.uniforms?.get("u_shadowPcfSampleCount"), 1), 0, 0, 0], 1744);
    setNativeShadowPcfSamples(data, command.uniforms?.get("u_shadowPcfSamples"), 1748);
    data.set(uniformMat4(command.uniforms?.get("u_spotShadowMatrix")) ?? identityMatrix(), 1876);
    const spotLightPosition = uniformVec3(command.uniforms?.get("u_spotShadowLightPosition")) ?? [0, 0, 0];
    data.set(
      [spotLightPosition[0], spotLightPosition[1], spotLightPosition[2], uniformNumber(command.uniforms?.get("u_spotShadowRange"), 1)],
      1892
    );
    const spotLightDirection = uniformVec3(command.uniforms?.get("u_spotShadowLightDirection")) ?? [0, -1, 0];
    data.set([spotLightDirection[0], spotLightDirection[1], spotLightDirection[2], 0], 1896);
    data.set(
      [
        uniformNumber(command.uniforms?.get("u_spotShadowMapEnabled"), 0),
        uniformNumber(command.uniforms?.get("u_spotShadowStrength"), 0.65),
        uniformNumber(command.uniforms?.get("u_spotShadowBias"), 0.001),
        uniformNumber(command.uniforms?.get("u_spotShadowSlopeBias"), 1)
      ],
      1900
    );
    const spotTexel = uniformVec2(command.uniforms?.get("u_spotShadowTexelSize")) ?? [1, 1];
    const spotCone = uniformVec2(command.uniforms?.get("u_spotShadowCone")) ?? [Math.PI / 4, 0];
    data.set(
      [spotTexel[0], spotTexel[1], uniformNumber(command.uniforms?.get("u_spotShadowPcfSampleCount"), 1), spotCone[0]],
      1904
    );
    setNativeShadowPcfSamples(data, command.uniforms?.get("u_spotShadowPcfSamples"), 1908);
    // Model matrix for the instanced vertex world composition
    // (u_modelMatrix * instanceMatrix * position, GLSL parity).
    data.set(modelMatrix, 2036);
    const buffer = this.device.createBuffer({
      label: `${command.label ?? "draw"}-draw-uniforms`,
      size: data.byteLength,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST
    });
    try { this.device.queue.writeBuffer(buffer, 0, data); }
    catch (error) { this.retireNative(buffer); throw error; }
    return buffer;
  }

  private createNativeAtlasBindings(command: DrawCommand): { buffer: WebGPUBufferLike; entries: WebGPUBindGroupEntryLike[]; actualTextureCount: number } | null {
    const definitions = [
      ["u_extensionScalarAtlas", 20, 0, "linear"],
      ["u_clearcoatNormalTexture", 22, 21, "linear"],
      ["u_sheenColorTexture", 24, 23, "srgb"],
      ["u_anisotropyTexture", 26, 25, "linear"],
      ["u_emissiveTexture", 28, 27, "srgb"]
    ] as const;
    const entries: WebGPUBindGroupEntryLike[] = [];
    let actualTextureCount = 0;
    for (const [name, textureIndex, samplerIndex, colorSpace] of definitions) {
      const actualTexture = this.createNativeSampledTextureBinding(uniformTextureBinding(command.uniforms, name));
      if (textureIndex === 20 && !actualTexture) throw new RenderDeviceError("Native extension atlas requires a resolved scalar atlas texture", "TEXTURE_BINDING_MISSING");
      const texture = actualTexture
        ?? this.createNativeFallbackSampledTextureBinding(`atlas-${name}`, name.includes("Normal") ? [128, 128, 255, 255] : [255, 255, 255, 255], colorSpace);
      if (!texture) return null;
      if (texture.actual) actualTextureCount += 1;
      entries.push({ binding: textureIndex, resource: texture.view });
      if (samplerIndex) entries.push({ binding: samplerIndex, resource: texture.sampler });
    }
    const data = webgpuExtensionAtlasUniforms(command.uniforms);
    const buffer = this.device.createBuffer({ label: "extension-atlas-uniforms", size: data.byteLength, usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST });
    try { this.device.queue.writeBuffer(buffer, 0, data); }
    catch (error) { this.retireNative(buffer); throw error; }
    entries.push({ binding: 19, resource: { buffer } });
    return { buffer, entries, actualTextureCount };
  }

  private createNativePortableBindings(
    command: DrawCommand,
    bindings: readonly PortableShaderBinding[],
    allowUnfilterable = false
  ): {
    readonly buffer: WebGPUBufferLike;
    readonly entries: readonly WebGPUBindGroupEntryLike[];
    readonly actualTextureCount: number;
  } | null {
    if (!this.device.createBindGroup) return null;
    const numericBindings = bindings.filter((binding) => !isPortableTexture(binding.kind));
    const block = portableUniformBlock(bindings);
    const layout = deriveUniformDataLayout(block, "wgsl-uniform");
    for (const name of ["maxBufferSize", "maxUniformBufferBindingSize"] as const) {
      const limit = this.device.limits?.[name] ?? (name === "maxUniformBufferBindingSize" ? 65536 : undefined);
      if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < layout.size)) {
        throw new RenderDeviceError("Portable uniforms exceed the WebGPU device limit", "WEBGPU_PORTABLE_UNIFORM_LIMIT", { name, limit, byteLength: layout.size });
      }
    }
    const values: Record<string, ShaderDataValue> = Object.create(null);
    if (!numericBindings.length) values.a3d_dummy = 0;
    for (const binding of numericBindings) {
      const value = command.uniforms?.get(binding.name);
      values[binding.name] = portableUniformValue(binding, value);
    }
    let bytes: Uint8Array;
    try {
      bytes = writeUniformData(block, "wgsl-uniform", values);
    } catch (error) {
      throw new RenderDeviceError(
        `Invalid portable uniform data: ${error instanceof Error ? error.message : String(error)}`,
        "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID"
      );
    }
    const buffer = this.device.createBuffer({
      label: `${command.label ?? "draw"}-portable-uniforms`,
      size: bytes.byteLength,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST
    });
    try {
      this.device.queue.writeBuffer(buffer, 0, bytes);
      const entries: WebGPUBindGroupEntryLike[] = [{ binding: 0, resource: { buffer } }];
      let bindingIndex = 1;
      let actualTextureCount = 0;
      for (const descriptor of bindings) {
        if (!isPortableTexture(descriptor.kind)) continue;
        const supplied = command.uniforms?.get(descriptor.name);
        if (isTextureBinding(supplied) && supplied.texture?.disposed) {
          throw new RenderDeviceError("Portable texture binding is disposed", "DISPOSED_RESOURCE", { binding: descriptor.name });
        }
        const binding = uniformTextureBinding(command.uniforms, descriptor.name);
        if (descriptor.kind === "depth2d" || descriptor.kind === "depth2d-multisampled") {
          const multisampled = descriptor.kind === "depth2d-multisampled";
          const target = [...this.renderTargets].find((candidate) => !candidate.disposed
            && (multisampled ? candidate.multisampledDepthTexture === binding?.texture : candidate.depthTexture === binding?.texture));
          if (!target?.nativeDepthTexture || target.sampleCount !== (multisampled ? 4 : 1)) {
            throw new RenderDeviceError("Matching same-device sampleable depth target is required", "WEBGPU_DEPTH_BINDING_REQUIRED", { binding: descriptor.name, multisampled });
          }
          this.resourceInterop.assertUsable(target.nativeDepthTexture);
          if (target.nativeNeedsClear) this.flushNativeRenderTargetClear(target);
          if (target.nativeNeedsClear) throw new RenderDeviceError("Sampleable depth target could not be initialized", "WEBGPU_DEPTH_BINDING_REQUIRED", { binding: descriptor.name });
          entries.push({ binding: bindingIndex++, resource: target.nativeDepthTexture.createView({ aspect: "depth-only" }) });
          actualTextureCount += 1;
          continue;
        }
        if (binding?.texture && binding.texture.dimension !== (descriptor.kind === "texture3d" ? "3d" : descriptor.kind === "texture2d-array" ? "2d-array" : descriptor.kind === "texture-cube" ? "cube" : "2d")) {
          throw new RenderDeviceError("Texture dimension does not match shader binding", "WEBGPU_TEXTURE_DIMENSION_MISMATCH", { binding: descriptor.name });
        }
        const actual = this.createNativeSampledTextureBinding(binding, allowUnfilterable);
        // Optional bindings the draw leaves empty get a 1x1 stand-in: white 2D,
        // or a zero cube (the environment background binds only the texture
        // its projection uses).
        const sampled = actual ?? (descriptor.required === false
          ? descriptor.kind === "texture2d"
            ? this.createNativeFallbackSampledTextureBinding("portable-white", [255, 255, 255, 255], "linear")
            : descriptor.kind === "texture-cube" ? this.createNativeFallbackCubeBinding() : null
          : null);
        if (!sampled) {
          throw new RenderDeviceError("Portable texture binding is unavailable", "WEBGPU_TEXTURE_BINDING_REQUIRED", { binding: descriptor.name });
        }
        if (actual?.actual) actualTextureCount += 1;
        entries.push({ binding: bindingIndex++, resource: sampled.sampler });
        entries.push({ binding: bindingIndex++, resource: sampled.view });
      }
      return { buffer, entries, actualTextureCount };
    } catch (error) {
      this.retireNative(buffer);
      throw error;
    }
  }

  private currentCanvasView(): unknown | null {
    if (!this.canvasContext) return null;
    if (canvasOwners.get(this.canvasContext) !== this.canvasOwner) throw new RenderDeviceError("Canvas is owned by a newer device", "WEBGPU_CANVAS_SUPERSEDED");
    this.assertActiveCanvasColor();
    return this.canvasContext.getCurrentTexture().createView();
  }

  private ensureCanvasDepthAttachment(width: number, height: number): void {
    if (!this.canvasContext || !this.device.createTexture) return;
    if (
      this.canvasDepthTexture &&
      this.canvasDepthView &&
      this.canvasDepthWidth === width &&
      this.canvasDepthHeight === height
    ) {
      return;
    }
    const next = this.device.createTexture({
      label: "aura3d-webgpu-canvas-depth",
      size: [width, height],
      format: DEPTH_TEXTURE_FORMAT,
      usage: TEXTURE_USAGE.RENDER_ATTACHMENT
    });
    let registered = false;
    let view: unknown;
    try {
      this.registerNativeCleanup(next, []);
      registered = true;
      view = next.createView();
    } catch (error) {
      try {
        if (registered) this.retireNative(next);
        else this.retireUnregisteredNative(next);
      } catch { /* Keep the setup failure as the reported error. */ }
      throw error;
    }
    const previous = this.canvasDepthTexture;
    this.canvasDepthTexture = next;
    this.canvasDepthView = view;
    this.canvasDepthWidth = width;
    this.canvasDepthHeight = height;
    if (previous) this.retireNative(previous);
  }

  private clearActiveRenderTarget(color: readonly [number, number, number, number]): void {
    if (!this.activeRenderTarget) return;
    // Phase 1 freeze: clears are native-load-op state only (no CPU shadow).
    this.activeRenderTarget.nativeNeedsClear = true;
    this.activeRenderTarget.nativeClearColor = color;
  }

  private indicesFor(command: DrawCommand): readonly number[] {
    if (!command.indexBuffer) {
      const firstVertex = command.firstVertex ?? 0;
      return Array.from({ length: command.vertexCount }, (_, index) => firstVertex + index);
    }
    const indexBuffer = this.requireBuffer(command.indexBuffer);
    const indexCount = command.indexCount ?? Math.floor(indexBuffer.byteLength / (command.indexType === "uint32" ? 4 : 2));
    const indices: number[] = [];
    const view = new DataView(indexBuffer.bytes.buffer, indexBuffer.bytes.byteOffset, indexBuffer.bytes.byteLength);
    const firstIndex = command.firstIndex ?? 0;
    for (let index = 0; index < indexCount; index += 1) {
      const byteOffset = (firstIndex + index) * (command.indexType === "uint32" ? 4 : 2);
      indices.push(command.indexType === "uint32" ? view.getUint32(byteOffset, true) : view.getUint16(byteOffset, true));
    }
    return indices;
  }
}

async function requestAdapter(gpu: WebGPULike | undefined): Promise<WebGPUAdapterLike | null> {
  if (!gpu) {
    throw new RenderDeviceError("WebGPU runtime is missing from the current environment", "WEBGPU_RUNTIME_MISSING");
  }
  return gpu.requestAdapter();
}

async function requestDevice(adapter: WebGPUAdapterLike, injectedDevice?: WebGPUDeviceLike, requiredFeatures: readonly string[] = [], requiredLimits: Readonly<Record<string, number>> = {}): Promise<WebGPUDeviceLike> {
  if (injectedDevice) {
    return injectedDevice;
  }
  try {
    return await adapter.requestDevice({ requiredFeatures, requiredLimits });
  } catch (error) {
    throw new RenderDeviceError("WebGPU adapter failed to create a device", "WEBGPU_DEVICE_REQUEST_FAILED", {
      adapter: describeAdapter(adapter),
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function validateWebGPUDevice(device: WebGPUDeviceLike): WebGPUDeviceLike {
  const missing: string[] = [];
  if (!device || typeof device !== "object") missing.push("device");
  if (typeof device?.createBuffer !== "function") missing.push("createBuffer");
  if (typeof device?.queue?.writeBuffer !== "function") missing.push("queue.writeBuffer");
  if (typeof device?.queue?.submit !== "function") missing.push("queue.submit");

  if (missing.length > 0) {
    throw new RenderDeviceError("WebGPU device is missing required render-device capabilities", "WEBGPU_DEVICE_INVALID", {
      missing
    });
  }
  return device;
}

function hasNativeRenderPipeline(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createBindGroup" | "createCommandEncoder" | "createRenderPipeline" | "createTexture">> {
  return typeof device.createCommandEncoder === "function" &&
    typeof device.createRenderPipeline === "function" &&
    typeof device.createBindGroup === "function" &&
    typeof device.createTexture === "function";
}

function hasNativeSampledTextureBinding(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createTexture" | "createSampler">> & { readonly queue: WebGPUQueueLike & Required<Pick<WebGPUQueueLike, "writeTexture">> } {
  return typeof device.createTexture === "function" &&
    typeof device.createSampler === "function" &&
    typeof device.queue.writeTexture === "function";
}

function hasNativeTextureUpload(device: WebGPUDeviceLike): device is WebGPUDeviceLike & { readonly queue: WebGPUQueueLike & Required<Pick<WebGPUQueueLike, "writeTexture">> } {
  return typeof device.queue.writeTexture === "function";
}

function hasNativeTextureReadback(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createCommandEncoder" | "createTexture">> {
  if (typeof device.createCommandEncoder !== "function" || typeof device.createTexture !== "function") return false;
  const probe = device.createBuffer({
    label: "aura3d-native-readback-capability-probe",
    size: 4,
    usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST
  });
  const supported = typeof probe.mapAsync === "function" &&
    typeof probe.getMappedRange === "function" &&
    typeof probe.unmap === "function" &&
    typeof device.createCommandEncoder({ label: "aura3d-native-readback-capability-probe" }).copyTextureToBuffer === "function";
  probe.destroy();
  return supported;
}

function throwIfWebGPUReadbackAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  const error = new Error("Resource readback was aborted");
  error.name = "AbortError";
  throw error;
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
}

function readWebGPU(globalScope: Pick<typeof globalThis, "navigator">): WebGPULike | undefined {
  return (globalScope.navigator as Navigator & { gpu?: WebGPULike } | undefined)?.gpu;
}

function acquireWebGPUCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGPUCanvasContextLike {
  const getContext = (canvas as HTMLCanvasElement & {
    getContext(type: "webgpu"): WebGPUCanvasContextLike | null;
  }).getContext;
  if (typeof getContext !== "function") {
    throw new RenderDeviceError("WebGPU canvas presentation requires getContext(\"webgpu\")", "WEBGPU_CANVAS_CONTEXT_MISSING");
  }
  const context = getContext.call(canvas, "webgpu");
  if (!context || typeof context.configure !== "function" || typeof context.getCurrentTexture !== "function") {
    throw new RenderDeviceError("Canvas did not provide a usable WebGPU presentation context", "WEBGPU_CANVAS_CONTEXT_INVALID");
  }
  return context;
}

function describeAdapter(adapter: WebGPUAdapterLike): string | undefined {
  if (adapter.name) return adapter.name;
  const parts = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.device, adapter.info?.description].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function bufferUsageFlags(usage: BufferUsage): number {
  if (usage === "vertex") return BUFFER_USAGE.VERTEX | BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  if (usage === "index") return BUFFER_USAGE.INDEX | BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  if (usage === "storage") return BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  if (usage === "uniform") return BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  return BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST;
}

/** Snapshot untrusted identity/effect data once before acquiring history. */
function snapshotNativePostFrame(frame: WebGPUNativePostFrame | undefined): WebGPUNativePostFrame | undefined {
  if (frame === undefined) return undefined;
  if (!frame || typeof frame !== "object") throw new RenderDeviceError("Invalid native post frame", "POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
  const captured: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of ["scopeId", "viewId", "frameId", "cameraCut", "timeSeconds", "diagnosticToken"]) {
    const descriptor = Object.getOwnPropertyDescriptor(frame, field);
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw new RenderDeviceError("Native post frame accessors are unsupported", "POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
    captured[field] = descriptor.value;
  }
  const result = captured as unknown as WebGPUNativePostFrame;
  validateNativePostFrame(result);
  return Object.freeze(result);
}

function snapshotNativePostEffects(effects: readonly NativePostEffect[]): readonly NativePostEffect[] {
  if (!Array.isArray(effects)) throw new RenderDeviceError("Native effects must be an array", "WEBGPU_NATIVE_EFFECTS_INVALID");
  const length = Object.getOwnPropertyDescriptor(effects, "length")?.value;
  if (!Number.isSafeInteger(length) || length < 0) throw new RenderDeviceError("Invalid native effect array", "WEBGPU_NATIVE_EFFECTS_INVALID");
  const result: NativePostEffect[] = [];
  for (let i = 0; i < length; i++) {
    const element = Object.getOwnPropertyDescriptor(effects, String(i));
    if (!element || !("value" in element) || !element.value || typeof element.value !== "object") {
      throw new RenderDeviceError("Native effect entries must be data objects", "WEBGPU_NATIVE_EFFECTS_INVALID");
    }
    const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const field of ["kind", "size", "angle", "strength", "intensity", "seed", "texture", "progress", "invert", "opacity", "decay"]) {
      const descriptor = Object.getOwnPropertyDescriptor(element.value, field);
      if (!descriptor) continue;
      if (!("value" in descriptor)) throw new RenderDeviceError("Native effect accessors are unsupported", "WEBGPU_NATIVE_EFFECTS_INVALID");
      copy[field] = descriptor.value;
    }
    const effect = copy as NativePostEffect;
    validateNativePostEffect(effect);
    result.push(Object.freeze(effect));
  }
  return Object.freeze(result);
}

function validateNativePostFrame(frame: WebGPUNativePostFrame | undefined): asserts frame is WebGPUNativePostFrame {
  if (!frame || !frame.scopeId || typeof frame.scopeId !== "object" ||
    (typeof frame.viewId !== "string" && (typeof frame.viewId !== "number" || !Number.isFinite(frame.viewId))) ||
    !Number.isSafeInteger(frame.frameId) || frame.frameId < 0 ||
    (frame.cameraCut !== undefined && typeof frame.cameraCut !== "boolean")) {
    throw new RenderDeviceError("Afterimage requires a stable scope, view and frame identity", "POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
  }
}

function nativeEffectUniforms(
  effect: Exclude<NativePostEffect, { kind: "mask" | "clear-mask" }>,
  width: number, height: number, frame: number, hasHistory: boolean,
  mask: Extract<NativePostEffect, { kind: "mask" }> | undefined
): Uint8Array {
  const data = new DataView(new ArrayBuffer(64));
  const kind = effect.kind === "pixelation" ? 1 : effect.kind === "halftone" ? 2 : effect.kind === "dot-screen" ? 3
    : effect.kind === "glitch" ? 4 : effect.kind === "transition" ? 5 : effect.kind === "lens-dirt" ? 6 : 7;
  data.setFloat32(0, width, true); data.setFloat32(4, height, true);
  data.setUint32(8, kind, true);
  data.setFloat32(12, "size" in effect ? effect.size : 1, true);
  data.setFloat32(16, "angle" in effect ? effect.angle : 0, true);
  data.setFloat32(20, "strength" in effect ? effect.strength : 0, true);
  data.setFloat32(24, "intensity" in effect ? effect.intensity : 0, true);
  data.setFloat32(28, "seed" in effect ? effect.seed : 0, true);
  data.setFloat32(32, frame, true);
  data.setFloat32(36, "progress" in effect ? effect.progress : 0, true);
  data.setFloat32(40, "decay" in effect ? effect.decay : 0, true);
  data.setUint32(44, hasHistory ? 1 : 0, true);
  data.setUint32(48, mask ? 1 : 0, true);
  data.setUint32(52, mask?.invert ? 1 : 0, true);
  data.setFloat32(56, mask?.opacity ?? 0, true);
  return new Uint8Array(data.buffer);
}

function webgpuTextureFormat(format: "rgba8" | "rgba16f" | "rgba32f" | string): string {
  if (format === "rgba16f") return "rgba16float";
  if (format === "rgba32f") return "rgba32float";
  return "rgba8unorm";
}

function nativeSampledTextureLevels(texture: Texture): { readonly levels: readonly { readonly width: number; readonly height: number; readonly data: ArrayBufferView }[]; readonly format: TextureFormat } | null {
  if (isCompressedTextureFormat(texture.format)) {
    const fallback = texture.fallbackTextureLevels;
    return fallback.length > 0 ? { levels: fallback, format: "rgba8" } : null;
  }
  if (texture.format === "depth24") return null;
  const levels = texture.textureLevels;
  return levels.length > 0 ? { levels, format: texture.format } : null;
}

function nativeTextureSourceLevels(texture: Texture): readonly {
  readonly width: number;
  readonly height: number;
  readonly bytesPerRow: number;
  readonly data: Uint8Array;
}[] {
  const source = texture.source;
  if (!source || typeof globalThis === "undefined") return [];
  const [width, height] = nativeTextureExtent(texture);
  const mipCount = texture.generateMipmaps ? Math.max(1, Math.floor(Math.log2(Math.max(width, height))) + 1) : 1;
  const levels: {
    readonly width: number;
    readonly height: number;
    readonly bytesPerRow: number;
    readonly data: Uint8Array;
  }[] = [];
  for (let level = 0; level < mipCount; level += 1) {
    const levelWidth = Math.max(1, width >> level);
    const levelHeight = Math.max(1, height >> level);
    const canvas = createTextureReadbackCanvas(levelWidth, levelHeight);
    // A partially generated chain cannot satisfy the requested mip layout.
    if (!canvas) return [];
    const context = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!context) return [];
    context.clearRect(0, 0, levelWidth, levelHeight);
    if (texture.flipY) {
      // threejs-parity ST-02 (L4): flip the source at draw time so the CPU
      // readback matches UNPACK_FLIP_Y / copyExternalImageToTexture flipY.
      context.save();
      context.translate(0, levelHeight);
      context.scale(1, -1);
      context.drawImage(source as CanvasImageSource, 0, 0, levelWidth, levelHeight);
      context.restore();
    } else {
      context.drawImage(source as CanvasImageSource, 0, 0, levelWidth, levelHeight);
    }
    const pixels = context.getImageData(0, 0, levelWidth, levelHeight).data;
    const sourceBytesPerRow = levelWidth * 4;
    const bytesPerRow = alignTo(sourceBytesPerRow, 256);
    if (bytesPerRow === sourceBytesPerRow) {
      levels.push({ width: levelWidth, height: levelHeight, bytesPerRow, data: new Uint8Array(pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength)) });
      continue;
    }
    const data = new Uint8Array(bytesPerRow * levelHeight);
    for (let row = 0; row < levelHeight; row += 1) {
      data.set(pixels.subarray(row * sourceBytesPerRow, (row + 1) * sourceBytesPerRow), row * bytesPerRow);
    }
    levels.push({ width: levelWidth, height: levelHeight, bytesPerRow, data });
  }
  return levels;
}

function nativeTextureExtent(texture: Texture): readonly [number, number] {
  const source = texture.source as unknown as { readonly videoWidth?: number; readonly videoHeight?: number; readonly naturalWidth?: number; readonly naturalHeight?: number; readonly displayWidth?: number; readonly displayHeight?: number; readonly width?: number; readonly height?: number } | null;
  const width = source?.videoWidth ?? source?.naturalWidth ?? source?.displayWidth ?? source?.width ?? texture.width;
  const height = source?.videoHeight ?? source?.naturalHeight ?? source?.displayHeight ?? source?.height ?? texture.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new RenderDeviceError("Texture source has no available image dimensions", "UNSUPPORTED_TEXTURE_FORMAT", { label: texture.label, width, height });
  }
  return [width, height];
}

function nativeTextureLayoutKey(texture: Texture, size: readonly [number, number]): string {
  // GPU texture storage is immutable. Reallocate if a live source changes
  // size, its transfer function changes, or the allocated mip count changes.
  return JSON.stringify([size[0], size[1], texture.colorSpace, texture.source ? texture.generateMipmaps : (planNativeDataMipmaps(texture)?.mipLevelCount ?? texture.mipLevelCount)]);
}

function nativeSampledResidentBytes(texture: Texture, size: readonly [number, number]): number {
  if (!texture.source) return planNativeDataMipmaps(texture)?.residentBytes ?? texture.byteLength;
  let [width, height] = size;
  let bytes = 0;
  for (;;) {
    bytes += width * height * 4;
    if (!texture.generateMipmaps || (width === 1 && height === 1)) break;
    width = Math.max(1, Math.floor(width / 2));
    height = Math.max(1, Math.floor(height / 2));
  }
  if (!Number.isSafeInteger(bytes)) throw new TextureBudgetExceededError("Sampled texture residency exceeds the supported byte range.");
  return bytes;
}

function createTextureReadbackCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement | null {
  const offscreenCanvas = (globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (offscreenCanvas) return new offscreenCanvas(width, height);
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function webgpuSampledTextureFormat(texture: Texture, format: TextureFormat): string {
  if (format === "rgba16f") return "rgba16float";
  if (format === "rgba32f") return "rgba32float";
  if (format === "r32f") return "r32float";
  if (format === "bc1-rgb-unorm") throw new RenderDeviceError("WebGPU BC1 RGB requires a decoded opaque RGBA8 fallback", "WEBGPU_TEXTURE_FORMAT_UNSUPPORTED", { format });
  if (isCompressedTextureFormat(format)) {
    const native = format === "astc-4x4-rgba-unorm" ? "astc-4x4-unorm" : format;
    return texture.colorSpace === "srgb" ? `${native}-srgb` : native;
  }
  return texture.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm";
}

function needsNativeCompressedFallback(format: TextureFormat, features: WebGPUDeviceLike["features"]): boolean {
  return isCompressedTextureFormat(format) && (format === "bc1-rgb-unorm" || !features?.has(compressedTextureFeature(format)));
}

function compressedTextureFeature(format: TextureFormat): string {
  if (format.startsWith("bc")) return "texture-compression-bc";
  if (format.startsWith("etc2")) return "texture-compression-etc2";
  return "texture-compression-astc";
}

function compressedBlockBytes(format: TextureFormat): number {
  return format === "bc1-rgba-unorm" || format === "etc2-rgb8unorm" ? 8 : 16;
}

function nativeTextureUsage(texture: Texture): number {
  let usage = texture.usage.includes("copy-dst") ? TEXTURE_USAGE.COPY_DST : 0;
  if (texture.usage.includes("sampled")) usage |= TEXTURE_USAGE.TEXTURE_BINDING;
  if (texture.usage.includes("storage")) usage |= TEXTURE_USAGE.STORAGE_BINDING;
  if (texture.usage.includes("render-attachment")) usage |= TEXTURE_USAGE.RENDER_ATTACHMENT;
  if (texture.usage.includes("copy-src")) usage |= TEXTURE_USAGE.COPY_SRC;
  return usage;
}

function webgpuMinFilter(filter: TextureMinFilter): TextureMagFilter {
  if (filter === "nearest" || filter === "nearest-mipmap-nearest" || filter === "nearest-mipmap-linear") return "nearest";
  return "linear";
}

function webgpuMagFilter(filter: TextureMagFilter): TextureMagFilter {
  return filter;
}

function webgpuMipmapFilter(filter: TextureMinFilter): TextureMagFilter | undefined {
  if (filter === "nearest-mipmap-nearest" || filter === "linear-mipmap-nearest") return "nearest";
  if (filter === "nearest-mipmap-linear" || filter === "linear-mipmap-linear") return "linear";
  return undefined;
}

function webgpuSamplerDescriptor(sampler: Sampler): WebGPUSamplerDescriptorLike {
  const minFilter = webgpuMinFilter(sampler.minFilter);
  const magFilter = webgpuMagFilter(sampler.magFilter);
  const mipmapFilter = webgpuMipmapFilter(sampler.minFilter);
  const descriptor: WebGPUSamplerDescriptorLike = {
    minFilter,
    magFilter,
    ...(mipmapFilter ? { mipmapFilter } : {}),
    addressModeU: sampler.addressU,
    addressModeV: sampler.addressV,
    ...(sampler.addressW ? { addressModeW: sampler.addressW } : {})
  };
  const maxAnisotropy = webgpuMaxAnisotropy(sampler.maxAnisotropy, minFilter, magFilter, mipmapFilter);
  return maxAnisotropy === undefined ? descriptor : { ...descriptor, maxAnisotropy };
}

function isFloat32Texture(texture: Texture): boolean {
  return texture.format === "r32f" || texture.format === "rgba32f";
}

function assertNonFilteringSampler(sampler: Sampler, binding: string): void {
  if (sampler.compare || sampler.mirror || sampler.maxAnisotropy > 1 ||
    webgpuMinFilter(sampler.minFilter) !== "nearest" || sampler.magFilter !== "nearest" ||
    webgpuMipmapFilter(sampler.minFilter) === "linear") {
    throw new RenderDeviceError("Unfilterable float32 textures require a nearest, non-comparison sampler without anisotropy", "WEBGPU_FLOAT32_FILTERING_UNSUPPORTED", { binding });
  }
}

function webgpuMaxAnisotropy(
  maxAnisotropy: number,
  minFilter: TextureMagFilter,
  magFilter: TextureMagFilter,
  mipmapFilter: TextureMagFilter | undefined
): number | undefined {
  if (maxAnisotropy <= 1) return undefined;
  if (minFilter !== "linear" || magFilter !== "linear" || mipmapFilter !== "linear") return undefined;
  return Math.min(16, Math.max(1, Math.floor(maxAnisotropy)));
}

function usesNativeDrawUniforms(layout: NativeUniformLayout): boolean {
  return layout !== "passthrough" && layout !== "portable";
}

function usesNativePbrTextureBindings(layout: NativeUniformLayout): boolean {
  return layout === "generated-pbr" ||
    layout === "generated-atlas-pbr" ||
    layout === "generated-textured-pbr" ||
    layout === "generated-instanced-pbr";
}

function writeAlignedQueueBuffer(
  queue: WebGPUQueueLike,
  buffer: WebGPUBufferLike,
  byteOffset: number,
  data: ArrayBufferView,
  nativeByteLength: number
): void {
  const bytes = viewBytes(data);
  if (byteOffset % 4 === 0 && bytes.byteLength % 4 === 0) {
    queue.writeBuffer(buffer, byteOffset, bytes);
    return;
  }
  const alignedOffset = Math.floor(byteOffset / 4) * 4;
  const alignedEnd = alignTo(byteOffset + bytes.byteLength, 4);
  if (alignedEnd > nativeByteLength) {
    throw new RenderDeviceError("Aligned WebGPU buffer write exceeds native buffer allocation", "BUFFER_RANGE_OUT_OF_BOUNDS", {
      byteOffset,
      dataByteLength: bytes.byteLength,
      alignedOffset,
      alignedEnd,
      nativeByteLength
    });
  }
  const padded = new Uint8Array(alignedEnd - alignedOffset);
  padded.set(bytes, byteOffset - alignedOffset);
  queue.writeBuffer(buffer, alignedOffset, padded);
}

function halfFloatToNumber(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

function uniformColor(uniforms: DrawCommand["uniforms"]): readonly [number, number, number, number] {
  const value = uniforms?.get("u_baseColor") ?? uniforms?.get("u_color") ?? uniforms?.get("color");
  const components = value instanceof Float32Array || Array.isArray(value) ? Array.from(value).slice(0, 4) : [];
  if (components.length >= 3 && components.every((component) => Number.isFinite(component))) {
    return [
      components[0] ?? 1,
      components[1] ?? 1,
      components[2] ?? 1,
      components[3] ?? 1
    ];
  }
  return [1, 1, 1, 1];
}

function uniformBaseColorTextureBinding(uniforms: DrawCommand["uniforms"]): TextureBinding | null {
  if (!uniforms) return null;
  const direct = uniforms.get("u_texture") ?? uniforms.get("u_baseColorTexture") ?? uniforms.get("baseColorTexture");
  if (isTextureBinding(direct) && direct.texture && !direct.texture.disposed && direct.validate().ok) {
    return direct;
  }
  return null;
}

function uniformTextureBinding(uniforms: DrawCommand["uniforms"], name: string): TextureBinding | null {
  const value = uniforms?.get(name);
  return isTextureBinding(value) && value.texture && !value.texture.disposed && value.validate().ok ? value : null;
}

function uniformNumber(value: UniformValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function uniformVec3(value: UniformValue | undefined): readonly [number, number, number] | null {
  const components = value instanceof Float32Array || Array.isArray(value) ? Array.from(value).slice(0, 3) : [];
  return components.length === 3 && components.every(Number.isFinite)
    ? [components[0]!, components[1]!, components[2]!]
    : null;
}

function uniformVec2(value: UniformValue | undefined): readonly [number, number] | null {
  const components = value instanceof Float32Array || Array.isArray(value) ? Array.from(value).slice(0, 2) : [];
  return components.length === 2 && components.every(Number.isFinite)
    ? [components[0]!, components[1]!]
    : null;
}

function setNativeShadowPcfSamples(data: Float32Array, value: UniformValue | undefined, offset: number): void {
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  for (let index = 0; index < 32; index += 1) {
    const quad = numbers.slice(index * 4, index * 4 + 4);
    // Default single center tap (weight 1) so an enabled shadow map without
    // an explicit kernel still occludes instead of dividing by zero weight.
    data.set(quad.length === 4 && quad.every(Number.isFinite) ? quad : [0, 0, 1, 0], offset + index * 4);
  }
}

function uniformMat4Array(value: UniformValue | undefined, count: number): readonly (readonly number[])[] {
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  return Array.from({ length: count }, (_, index) => {
    const start = index * 16;
    const matrix = numbers.slice(start, start + 16);
    return matrix.length === 16 && matrix.every(Number.isFinite) ? matrix : identityMatrix();
  });
}

function uniformMat4(value: UniformValue | undefined): readonly number[] | null {
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  return numbers.length === 16 && numbers.every(Number.isFinite) ? numbers : null;
}

function identityMatrix(): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function createNativeShaderSources(sources: ShaderSources): {
  readonly vertex: string;
  readonly fragment: string;
  readonly entryPoints: readonly [string, string];
  readonly uniformLayout: NativeUniformLayout;
  readonly portableBindings?: readonly PortableShaderBinding[];
  readonly colorDefaultVertex?: string;
  readonly atlasVertex?: string;
  readonly generatedPbr?: GeneratedPbrProgram;
  readonly generatedUnlit?: GeneratedUnlitProgram;
} {
  if (sources.webgpu && sources.portableBindings &&
    (sources.portableBindings.length > 0 || sources.webgpu.vertex.includes(PORTABLE_BINDINGS_MARKER) || sources.webgpu.fragment.includes(PORTABLE_BINDINGS_MARKER))) {
    const portableBindings = snapshotPortableBindings(sources.portableBindings);
    return {
      vertex: injectPortableBindings(sources.webgpu.vertex, portableBindings),
      fragment: injectPortableBindings(sources.webgpu.fragment, portableBindings),
      entryPoints: [inferWGSLVertexEntryPoint(sources.webgpu.vertex) ?? "vs_main", inferWGSLFragmentEntryPoint(sources.webgpu.fragment) ?? "fs_main"],
      uniformLayout: "portable",
      portableBindings
    };
  }
  if (sources.webgpu) {
    return {
      vertex: sources.webgpu.vertex,
      fragment: sources.webgpu.fragment,
      entryPoints: [inferWGSLVertexEntryPoint(sources.webgpu.vertex) ?? "vs_main", inferWGSLFragmentEntryPoint(sources.webgpu.fragment) ?? "fs_main"],
      uniformLayout: "passthrough"
    };
  }
  const vertexEntry = inferWGSLVertexEntryPoint(sources.vertex) ?? "vs_main";
  const fragmentEntry = inferWGSLFragmentEntryPoint(sources.fragment) ?? "fs_main";
  if (/\@(vertex|fragment|compute)\b/.test(sources.vertex) || /\@(vertex|fragment|compute)\b/.test(sources.fragment)) {
    // Generated descriptors use the native material/AuraFrame layouts, not
    // the unbound passthrough layout. Reflection currently parses GLSL only;
    // a raw WGSL pair cannot supply truthful generated attribute/uniform
    // reflection. ProgramCache supplies the matching GLSL reflection stages.
    if (sources.marker === GENERATED_PROGRAM_MARKER && sources.generatedProgram) {
      throw new RenderDeviceError(
        "Generated WGSL requires matching GLSL reflection stages and its generated descriptor; use ProgramCache",
        "WEBGPU_GENERATED_REFLECTION_REQUIRED",
        { label: sources.label }
      );
    }
    return { vertex: sources.vertex, fragment: sources.fragment, entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "passthrough" };
  }
  if (sources.marker === GENERATED_PROGRAM_MARKER) {
    if (sources.generatedProgram) {
      if (sources.generatedProgram.features.lighting === "unlit") {
        const generatedUnlit = createGeneratedUnlitProgram(sources.generatedProgram);
        return { vertex: generatedUnlit.vertex, fragment: generatedUnlit.fragment,
          entryPoints: [generatedUnlit.vertexEntryPoint, generatedUnlit.fragmentEntryPoint], uniformLayout: "generated-program-unlit", generatedUnlit };
      }
      const generatedPbr = createGeneratedPbrProgram(sources.generatedProgram);
      return { vertex: generatedPbr.vertex, fragment: generatedPbr.fragment,
        entryPoints: [generatedPbr.vertexEntryPoint, generatedPbr.fragmentEntryPoint], uniformLayout: "generated-program-pbr", generatedPbr };
    }
    const native = nativeGeneratedAmbientPbrShader(sources, vertexEntry, fragmentEntry);
    if (native) return { ...native, entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-program-ambient-pbr" };
  }
  if (sources.marker.includes("instanced-pbr")) {
    return { ...nativeInstancedPbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-instanced-pbr" };
  }
  if (sources.marker.includes("pbr-textured")) {
    const atlas = /uniform\s+sampler2D\s+u_extensionScalarAtlas/.test(sources.fragment);
    const native = nativeTexturedPbrShader(vertexEntry, fragmentEntry, sources.marker, nativeShaderUsesTangent(sources.vertex), atlas);
    return { ...native, ...(atlas ? { atlasVertex: native.vertex } : {}), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: atlas ? "generated-atlas-pbr" : "generated-textured-pbr" };
  }
  if (sources.marker.includes("pbr-direct")) {
    return sources.fragment.includes("u_baseColorTexture")
      ? { ...nativeTexturedPbrShader(vertexEntry, fragmentEntry, sources.marker, nativeShaderUsesTangent(sources.vertex)), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-textured-pbr" }
      : { ...nativePbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-pbr" };
  }
  if (sources.marker.includes("skinned-unlit")) {
    return { ...nativeSkinnedUnlitShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-skinned-unlit" };
  }
  if (sources.marker.includes("morph-unlit")) {
    return { ...nativeMorphUnlitShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-morph-unlit" };
  }
  // PRD 11 Phase 1 freeze: only the encoded-depth program keeps a generated
  // WGSL fallback (it is a real packed-depth shader, not a flat-colour stub).
  // Every other shader without a portable, passthrough, or marker WGSL program
  // throws at creation instead of silently rendering flat colour.
  if (!sources.marker.includes(DEFAULT_DEPTH_SHADER_MARKER)) {
    throw new RenderDeviceError("No WGSL program for shader", "WGSL_PROGRAM_MISSING", {
      marker: sources.marker,
      label: sources.label
    });
  }
  // Basic GLSL programs (including unlit primitives and particle sprites)
  // declare their color input explicitly. Preserve that location and component
  // count; RGB inputs use opaque alpha, while RGBA alpha modulates the material.
  // Depth programs intentionally do not consume material/vertex color.
  const colorInput = sources.marker.includes(DEFAULT_DEPTH_SHADER_MARKER) ? null
    : /layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*in\s+(?:lowp\s+|mediump\s+|highp\s+)?vec([34])\s+(?:a_color|color)\s*;/.exec(sources.vertex);
  const colorParameter = colorInput ? `, @location(${colorInput[1]}) vertexColor: vec${colorInput[2]}<f32>` : "";
  const vertexOutput = `struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  ${colorInput ? "@location(0) color: vec4<f32>," : ""}
};`;
  const drawUniforms = `struct DrawUniforms {
  modelViewProjection: mat4x4<f32>,
  color: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;`;
  const vertex = `// ${sources.marker}
${ZERO_TO_ONE_PROJECTION_WGSL}
${drawUniforms}
${vertexOutput}
@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>${colorParameter}) -> VertexOutput {
  var output: VertexOutput;
  let clipPosition = u_draw.modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clipPosition.x, clipPosition.y, ${rasterClipDepthWgsl("clipPosition")}, clipPosition.w);
  ${colorInput ? `output.color = ${colorInput[2] === "3" ? "vec4<f32>(vertexColor, 1.0)" : "vertexColor"};` : ""}
  return output;
}

`;
  return {
    vertex,
    colorDefaultVertex: colorInput ? vertex.replace(colorParameter, "").replace(
      /output\.color = [^;]+;/, "output.color = vec4<f32>(1.0);"
    ) : undefined,
    fragment: sources.marker.includes(DEFAULT_DEPTH_SHADER_MARKER)
      ? nativeDepthFragment(sources.marker, fragmentEntry)
      : `// ${sources.marker}
${drawUniforms}
${vertexOutput}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return u_draw.color${colorInput ? " * input.color" : ""};
}
`,
    entryPoints: [vertexEntry, fragmentEntry],
    uniformLayout: "generated-basic"
  };
}

/**
 * A deliberately bounded native translation of the generated forward PBR
 * program: base-color UV0, ambient light and emissive, with no direct lights,
 * environment map or feature/lobe hooks. A marker or a few #defines alone do
 * not identify a generated program's semantics: contributors can splice code
 * at any hook. Compare both complete stages with the current generator's
 * output before selecting this translation, ignoring only its key hash.
 * Other variants continue to fail with WGSL_PROGRAM_MISSING.
 */
function nativeGeneratedAmbientPbrShader(sources: ShaderSources, vertexEntry: string, fragmentEntry: string): { readonly vertex: string; readonly fragment: string } | null {
  const define = (name: string): string | undefined => new RegExp(`^#define ${name} ([^\\s]+)`, "m").exec(sources.fragment)?.[1];
  if (!define("A3D_LIT") || !define("USE_BASE_COLOR_MAP")) return null;
  const alphaMode = define("ALPHA_MASK") ? "mask" : define("ALPHA_BLEND") ? "blend" : "opaque";
  const outputSrgb = sources.fragment.includes("  a3dColor = a3dEncodeForCanvas(a3dColor);");
  const taps = Number(define("SHADOW_PCF_TAPS") ?? 1);
  if (taps !== 1 && taps !== 4 && taps !== 9) return null;
  const expected = generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit",
    maps: { baseColor: { uvSet: 0, transform: false } },
    alphaMode,
    doubleSided: Boolean(define("DOUBLE_SIDED")),
    specularAntialiasing: Boolean(define("SPECULAR_AA")),
    shadows: { cascades: 0, pcfTaps: taps, localShadows: 0, contact: false },
    features: outputSrgb ? { [PROGRAM_OUTPUT_SRGB_FEATURE]: true } : {}
  }));
  const withoutKeyHash = (source: string): string => source.replace(/a3d-generated-program:[0-9a-f]+/g, GENERATED_PROGRAM_MARKER);
  if (withoutKeyHash(sources.vertex) !== withoutKeyHash(expected.vertex) || withoutKeyHash(sources.fragment) !== withoutKeyHash(expected.fragment)) return null;
  const material = `struct GeneratedAmbientMaterial {
  model: mat4x4<f32>,
  geometry: mat4x4<f32>,
  baseColor: vec4<f32>,
  environment: vec4<f32>,
  emissive: vec4<f32>,
  parameters: vec4<f32>,
};
@group(0) @binding(0) var<uniform> material: GeneratedAmbientMaterial;`;
  return {
    vertex: `// ${sources.marker}
${material}
struct AuraFrame {
  view: mat4x4<f32>, projection: mat4x4<f32>, viewProjection: mat4x4<f32>, previousViewProjection: mat4x4<f32>,
  cameraPositionNear: vec4<f32>, resolutionFarTime: vec4<f32>, exposureFlags: vec4<f32>,
};
@group(1) @binding(0) var<uniform> frame: AuraFrame;
${ZERO_TO_ONE_PROJECTION_WGSL}
struct GeneratedVertexOutput { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, };
@vertex fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(2) uv: vec2<f32>) -> GeneratedVertexOutput {
  var output: GeneratedVertexOutput;
  let clip = frame.viewProjection * material.model * material.geometry * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clip.x, clip.y, ${rasterClipDepthWgsl("clip")}, clip.w);
  output.uv = uv;
  return output;
}`,
    fragment: `// ${sources.marker}
${material}
@group(0) @binding(1) var baseSampler: sampler;
@group(0) @binding(2) var baseTexture: texture_2d<f32>;
${outputSrgb ? `fn encodeGeneratedOutput(linear: vec3<f32>) -> vec3<f32> {
  let c = max(linear, vec3<f32>(0.0)) / 0.6;
  let working = vec3<f32>(dot(vec3<f32>(0.59719, 0.35458, 0.04823), c), dot(vec3<f32>(0.07600, 0.90834, 0.01566), c), dot(vec3<f32>(0.02840, 0.13383, 0.83777), c));
  let fitted = ((working + vec3<f32>(0.0245786)) * working - vec3<f32>(0.000090537)) / ((0.983729 * working + vec3<f32>(0.432951)) * working + vec3<f32>(0.238081));
  let display = clamp(vec3<f32>(dot(vec3<f32>(1.60475, -0.53108, -0.07367), fitted), dot(vec3<f32>(-0.10208, 1.10813, -0.00605), fitted), dot(vec3<f32>(-0.00327, -0.07276, 1.07602), fitted)), vec3<f32>(0.0), vec3<f32>(1.0));
  return select(display * 12.92, 1.055 * pow(display, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055), display >= vec3<f32>(0.0031308));
}` : ""}
@fragment fn ${fragmentEntry}(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let base = material.baseColor * textureSample(baseTexture, baseSampler, uv);
  ${alphaMode === "mask" ? "if (base.a < material.parameters.y) { discard; }" : ""}
  let diffuse = min(max(base.rgb, vec3<f32>(0.0)), vec3<f32>(1.0)) * (1.0 - clamp(material.parameters.x, 0.0, 1.0));
  let indirect = material.environment.rgb * material.environment.a * diffuse * 0.3183098861837907;
  let color = max(indirect + material.emissive.rgb * material.emissive.a, vec3<f32>(0.0));
  return vec4<f32>(${outputSrgb ? "encodeGeneratedOutput(color)" : "color"}, ${alphaMode === "blend" ? "base.a" : "1.0"});
}`
  };
}

function nativeDepthFragment(marker: string, fragmentEntry: string): string {
  // J2 native depth encoding: the GLSL depth program writes gl_FragCoord.z
  // into an rgba8 shadow target ("encoded-color-depth"). The framebuffer
  // depth @builtin(position).z is already 0..1 in WebGPU, so packing it
  // samples identically to the GL path through the projective PCF reader.
  return `// ${marker}\nstruct DrawUniforms {\n  modelViewProjection: mat4x4<f32>,\n  color: vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position: vec4<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;\n\n@fragment\nfn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {\n  return vec4<f32>(input.position.z, input.position.z, input.position.z, 1.0);\n}\n`;
}

const PORTABLE_BINDINGS_MARKER = "/* @aura3d-bindings */";

function injectPortableBindings(source: string, bindings: readonly PortableShaderBinding[]): string {
  if (!source.includes(PORTABLE_BINDINGS_MARKER)) {
    throw new RenderDeviceError(
      `Portable WGSL source must include ${PORTABLE_BINDINGS_MARKER}`,
      "PORTABLE_SHADER_BINDINGS_MARKER_MISSING"
    );
  }
  const block = portableUniformBlock(bindings);
  const lowered = lowerPortableUniformAccesses(source, deriveUniformDataLayout(block, "wgsl-uniform"));
  let textureBinding = 1;
  const textures = bindings
    .filter((binding) => isPortableTexture(binding.kind))
    .map((binding) => {
      if (binding.kind === "depth2d" || binding.kind === "depth2d-multisampled") return `@group(0) @binding(${textureBinding++}) var ${binding.name}Texture: ${binding.kind === "depth2d-multisampled" ? "texture_depth_multisampled_2d" : "texture_depth_2d"};`;
      const sampler = textureBinding++;
      const texture = textureBinding++;
      return `@group(0) @binding(${sampler}) var ${binding.name}Sampler: sampler;\n@group(0) @binding(${texture}) var ${binding.name}Texture: texture_${binding.kind === "texture3d" ? "3d" : binding.kind === "texture2d-array" ? "2d_array" : binding.kind === "texture-cube" ? "cube" : "2d"}<f32>;`;
    })
    .join("\n");
  return lowered.replace(
    PORTABLE_BINDINGS_MARKER,
    `${emitWgslStruct(block, "uniform", { variableName: "aura" })}\n${textures}`
  );
}

function isPortableTexture(kind: PortableShaderBinding["kind"]): boolean {
  return kind === "texture2d" || kind === "texture2d-array" || kind === "texture-cube" || kind === "texture3d" || kind === "depth2d" || kind === "depth2d-multisampled";
}

function portableShaderDataType(kind: PortableShaderBinding["kind"]): ShaderDataType {
  switch (kind) {
    case "float": return "f32";
    case "i32": return "i32";
    case "u32": return "u32";
    case "bool": return "bool";
    case "vec2": return { kind: "vector", element: "f32", length: 2 };
    case "vec3": return { kind: "vector", element: "f32", length: 3 };
    case "vec4": return { kind: "vector", element: "f32", length: 4 };
    case "mat4": return { kind: "matrix", columns: 4, rows: 4 };
    default: throw new RenderDeviceError("Unsupported portable uniform kind", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { kind });
  }
}

function portableBindingDataType(binding: PortableShaderBinding): ShaderDataType {
  if (binding.kind === "data") {
    if (binding.dataType === undefined || binding.arrayLength !== undefined) {
      throw new RenderDeviceError("Portable data bindings require dataType and cannot also specify arrayLength", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { binding: binding.name });
    }
    return binding.dataType;
  }
  if (binding.dataType !== undefined) {
    throw new RenderDeviceError("dataType is only valid for portable data bindings", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { binding: binding.name });
  }
  const type = portableShaderDataType(binding.kind);
  if (binding.arrayLength === undefined) return type;
  if (!Number.isSafeInteger(binding.arrayLength) || binding.arrayLength < 1) {
    throw new RenderDeviceError("Portable uniform arrays require a positive safe integer length", "WEBGPU_UNIFORM_ARRAY_UNSUPPORTED", { binding: binding.name });
  }
  return { kind: "array", element: type, length: binding.arrayLength };
}

const PORTABLE_WGSL_RESERVED = new Set([
  "alias", "break", "case", "const", "const_assert", "continue", "continuing", "default", "diagnostic",
  "discard", "else", "enable", "false", "fn", "for", "if", "let", "loop", "override", "requires",
  "return", "struct", "switch", "true", "var", "while", "_", "NULL", "Self", "abstract", "active",
  "alignas", "alignof", "as", "asm", "asm_fragment", "async", "attribute", "auto", "await", "become",
  "binding_array", "cast", "catch", "class", "co_await", "co_return", "co_yield", "coherent", "column_major",
  "common", "compile", "compile_fragment", "concept", "const_cast", "consteval", "constexpr", "constinit",
  "crate", "debug", "debugger", "decltype", "delete", "demote", "demote_to_helper", "do", "dynamic_cast",
  "enum", "explicit", "export", "extends", "extern", "external", "fallthrough", "filter", "final", "finally",
  "friend", "from", "fxgroup", "get", "goto", "groupshared", "highp", "impl", "implements", "import", "inline",
  "instance_of", "interface", "layout", "lowp", "macro", "match", "mat", "mediump", "meta", "mod", "module",
  "move", "mut", "mutable", "namespace", "new", "nil", "noinline", "nointerpolation", "noperspective", "null",
  "nullptr", "of", "operator", "package", "packoffset", "partition", "pass", "patch", "pixelfragment", "precise",
  "precision", "premerge", "priv", "protected", "pub", "public", "readonly", "ref", "regardless", "register",
  "reinterpret_cast", "require", "resource", "restrict", "self", "set", "shared", "sizeof", "smooth", "snorm",
  "static", "static_assert", "static_cast", "std", "stride", "subroutine", "super", "target", "template", "this",
  "thread_local", "throw", "trait", "try", "type", "typedef", "typeid", "typename", "typeof", "union", "unless",
  "unorm", "unsafe", "unsized", "use", "using", "varying", "virtual", "volatile", "wgsl", "where", "with",
  "writeonly", "yield"
]);

function validPortableIdentifier(name: unknown): name is string {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !name.startsWith("__") && !PORTABLE_WGSL_RESERVED.has(name);
}

function validatePortableDataIdentifiers(type: ShaderDataType): void {
  if (typeof type === "string") return;
  if (type.kind === "array") validatePortableDataIdentifiers(type.element);
  if (type.kind === "struct") {
    for (const field of type.fields) {
      if (!validPortableIdentifier(field.name)) {
        throw new RenderDeviceError("Portable data fields must be valid WGSL identifiers", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { field: field.name });
      }
      validatePortableDataIdentifiers(field.type);
    }
  }
}

function snapshotPortableBindings(bindings: readonly PortableShaderBinding[]): readonly PortableShaderBinding[] {
  const names = new Set<string>();
  return bindings.map((binding) => {
    if (!binding || !validPortableIdentifier(binding.name) || names.has(binding.name)
      || (binding.required !== undefined && typeof binding.required !== "boolean")) {
      throw new RenderDeviceError("Portable bindings require unique WGSL identifiers and boolean required flags", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { binding: binding?.name });
    }
    names.add(binding.name);
    if (isPortableTexture(binding.kind)) {
      if (binding.arrayLength !== undefined || binding.dataType !== undefined) {
        throw new RenderDeviceError("Portable texture bindings cannot declare numeric array or data layouts", "WEBGPU_PORTABLE_UNIFORM_SCHEMA_INVALID", { binding: binding.name });
      }
      return { ...binding };
    }
    const logical = deriveShaderDataLayout(portableBindingDataType(binding), "glsl-std430");
    validatePortableDataIdentifiers(logical.type);
    return binding.kind === "data" ? { ...binding, dataType: logical.type } : { ...binding };
  });
}

function portableUniformBlock(bindings: readonly PortableShaderBinding[]): UniformBlockLayout {
  const numeric = bindings.filter((binding) => !isPortableTexture(binding.kind));
  return {
    name: "Aura3DPortableUniforms",
    group: 0,
    binding: 0,
    members: numeric.length
      ? numeric.map((binding) => ({ name: binding.name, type: portableBindingDataType(binding) }))
      : [{ name: "a3d_dummy", type: "f32" }]
  };
}

function zeroPortableData(type: ShaderDataType): ShaderDataValue {
  if (typeof type === "string") return 0;
  switch (type.kind) {
    case "vector": return Array(type.length).fill(0);
    case "matrix": return Array(type.columns * type.rows).fill(0);
    case "array": return Array.from({ length: type.length }, () => zeroPortableData(type.element));
    case "struct": return Object.fromEntries(type.fields.map((field) => [field.name, zeroPortableData(field.type)]));
  }
}

function isLegacyUniformValue(value: RecursiveUniformValue): boolean {
  return typeof value === "number" || isTextureBinding(value)
    || value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array
    || (Array.isArray(value) && value.every((entry) => typeof entry === "number"));
}

function portableUniformValue(binding: PortableShaderBinding, value: RecursiveUniformValue | undefined): ShaderDataValue {
  const type = portableBindingDataType(binding);
  if (binding.kind === "data") {
    if (value === undefined) {
      if (binding.required !== false) {
        throw new RenderDeviceError("Required portable data value is missing", "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID", { binding: binding.name });
      }
      return zeroPortableData(type);
    }
    if (isTextureBinding(value)) {
      throw new RenderDeviceError("Portable data cannot contain a texture binding", "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID", { binding: binding.name });
    }
    return value as ShaderDataValue;
  }
  if (value === undefined) return zeroPortableData(type);
  if (isTextureBinding(value)) {
    throw new RenderDeviceError("Portable numeric uniform cannot contain a texture binding", "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID", { binding: binding.name });
  }
  const count = binding.kind === "vec2" ? 2 : binding.kind === "vec3" ? 3 : binding.kind === "vec4" ? 4 : binding.kind === "mat4" ? 16 : 1;
  if (binding.arrayLength !== undefined && count > 1 && Array.isArray(value)
    && value.some((element) => Array.isArray(element) || ArrayBuffer.isView(element))) {
    return value as ShaderDataValue;
  }
  let components: (number | boolean)[];
  if (typeof value === "number" || typeof value === "boolean") components = [value];
  else if (Array.isArray(value) || value instanceof Float32Array || value instanceof Int32Array || value instanceof Uint32Array) {
    components = Array.from(value as ArrayLike<number | boolean>);
  } else {
    throw new RenderDeviceError("Portable numeric uniform must be a scalar or numeric array", "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID", { binding: binding.name });
  }
  const expected = count * (binding.arrayLength ?? 1);
  // Array bindings follow the GL upload rule: a prefix of whole elements is
  // valid (e.g. 40 instance matrices into a 64-entry mat4 array) and the
  // remaining elements are zero-filled below.
  const partialArray = binding.arrayLength !== undefined && components.length <= expected && components.length % count === 0;
  if (components.some((component) => typeof component !== "number" && typeof component !== "boolean")
    || components.length > expected || (components.length !== expected && binding.required !== false && !partialArray)) {
    throw new RenderDeviceError("Portable numeric uniform has the wrong number or kind of components", "WEBGPU_PORTABLE_UNIFORM_VALUE_INVALID", { binding: binding.name, expected, actual: components.length });
  }
  if (components.length < expected) components = [...components, ...Array(expected - components.length).fill(0)];
  if (binding.arrayLength === undefined) return count === 1 ? components[0]! : components;
  if (count === 1) return components;
  return Array.from({ length: binding.arrayLength }, (_, index) => components.slice(index * count, (index + 1) * count));
}

function portableEmittedAlignment(layout: ShaderDataLayout): number {
  return typeof layout.type !== "string" && layout.type.kind === "array"
    ? portableEmittedAlignment(layout.element!)
    : layout.alignment;
}

function portableArrayNeedsWrapper(layout: ShaderDataLayout): boolean {
  if (typeof layout.type === "string" || layout.type.kind !== "array") return false;
  const alignment = portableEmittedAlignment(layout.element!);
  return Math.ceil(layout.element!.size / alignment) * alignment !== layout.stride;
}

function portableContainsWrapper(layout: ShaderDataLayout): boolean {
  if (typeof layout.type === "string") return false;
  if (layout.type.kind === "array") return portableArrayNeedsWrapper(layout) || portableContainsWrapper(layout.element!);
  return layout.type.kind === "struct" && layout.members!.some((member) => portableContainsWrapper(member.layout));
}

function lowerPortableUniformAccesses(source: string, root: ShaderDataLayout): string {
  if (!portableContainsWrapper(root)) return source;
  const tokens: { readonly text: string; readonly start: number; readonly end: number }[] = [];
  for (let index = 0; index < source.length;) {
    if (/\s/.test(source[index]!)) { index += 1; continue; }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < source.length && depth > 0) {
        if (source.startsWith("/*", index)) { depth += 1; index += 2; }
        else if (source.startsWith("*/", index)) { depth -= 1; index += 2; }
        else index += 1;
      }
      if (depth !== 0) throw new RenderDeviceError("Unterminated WGSL block comment", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED");
      continue;
    }
    const start = index;
    if (/[A-Za-z_]/.test(source[index]!)) {
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!)) index += 1;
    } else index += 1;
    tokens.push({ text: source.slice(start, index), start, end: index });
  }
  const insertions = new Set<number>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token.text !== "aura" || tokens[index - 1]?.text === ".") continue;
    if (tokens[index + 1]?.text === ":" || ["let", "var", "const", "override"].includes(tokens[index - 1]?.text ?? "")) {
      throw new RenderDeviceError("Portable WGSL cannot shadow the aura uniform binding", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED");
    }
    if (tokens[index + 1]?.text !== ".") {
      throw new RenderDeviceError("Padded portable uniforms cannot be used as a whole aggregate", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED");
    }
    const name = tokens[index + 2]?.text;
    const initial = root.members?.find((member) => member.name === name)?.layout;
    if (!initial) throw new RenderDeviceError("Portable WGSL references an unknown uniform", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED", { binding: name });
    let current: ShaderDataLayout = initial;
    let next = index + 3;
    while (typeof current.type !== "string") {
      if (current.type.kind === "struct" && tokens[next]?.text === ".") {
        const field = tokens[next + 1]?.text;
        const member: { readonly layout: ShaderDataLayout } | undefined = current.members?.find((candidate) => candidate.name === field);
        if (!member) throw new RenderDeviceError("Portable WGSL references an unknown data field", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED", { field });
        current = member.layout;
        next += 2;
        continue;
      }
      if (current.type.kind !== "array" || tokens[next]?.text !== "[") break;
      let depth = 1;
      let end = next + 1;
      while (end < tokens.length && depth > 0) {
        if (tokens[end]!.text === "[") depth += 1;
        else if (tokens[end]!.text === "]") depth -= 1;
        end += 1;
      }
      if (depth !== 0) throw new RenderDeviceError("Unclosed portable uniform array index", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED");
      if (portableArrayNeedsWrapper(current)) {
        if (tokens[end]?.text === "." && tokens[end + 1]?.text === "value") end += 2;
        else insertions.add(tokens[end - 1]!.end);
      }
      current = current.element!;
      next = end;
    }
    if (portableContainsWrapper(current)) {
      throw new RenderDeviceError("Padded portable uniform aggregates must be accessed through their indexed fields", "WEBGPU_PORTABLE_UNIFORM_ACCESS_UNSUPPORTED", { binding: name });
    }
  }
  let output = source;
  for (const position of [...insertions].sort((left, right) => right - left)) {
    output = `${output.slice(0, position)}.value${output.slice(position)}`;
  }
  return output;
}

function nativeUniformStruct(): string {
  return `struct DrawUniforms {
  modelViewProjection: mat4x4<f32>,
  color: vec4<f32>,
  params: vec4<f32>,
  flags: vec4<f32>,
  reserved0: vec4<f32>,
  instance0: mat4x4<f32>,
  instance1: mat4x4<f32>,
  instance2: mat4x4<f32>,
  instance3: mat4x4<f32>,
  joint0: mat4x4<f32>,
  joint1: mat4x4<f32>,
  morph0: vec4<f32>,
  // (joint palette appended at struct end below as \`joints\` for 96-joint WebGL2 parity)
  morph1: vec4<f32>,
  morph2: vec4<f32>,
  morph3: vec4<f32>,
  morph4: vec4<f32>,
  morph5: vec4<f32>,
  morph6: vec4<f32>,
  morph7: vec4<f32>,
  material: vec4<f32>,
  camera: vec4<f32>,
  materialFlags: vec4<f32>,
  normalMatrix: mat4x4<f32>,
  // 96-joint skinning palette (WebGL2 \`u_jointMatrices[96]\` parity). Appended at the struct end so
  // the existing field offsets are unchanged.
  joints: array<mat4x4<f32>, 96>,
  // J2 native shadow projections (float offsets 1724+, after the 96-joint
  // palette). Directional block mirrors GLSL \`a3dForwardShadowFactor\`;
  // spot block mirrors \`a3dSpotShadowFactor\` (cone/range pre-check inside
  // the helper). Appended here so no existing field offset moves.
  shadowMapMatrix: mat4x4<f32>,
  shadowParams0: vec4<f32>,
  shadowParams1: vec4<f32>,
  shadowPcf: array<vec4<f32>, 32>,
  spotShadowMatrix: mat4x4<f32>,
  spotShadowParams0: vec4<f32>,
  spotShadowParams1: vec4<f32>,
  spotShadowParams2: vec4<f32>,
  spotShadowParams3: vec4<f32>,
  spotShadowPcf: array<vec4<f32>, 32>,
  // Model matrix for GLSL-parity world composition on the instanced path
  // (\`u_modelMatrix * instanceMatrix * position\`; float offset 2036).
  modelMatrix: mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;

${ZERO_TO_ONE_PROJECTION_WGSL}
fn a3dWebGPUClipPosition(clipPosition: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clipPosition.x, clipPosition.y, ${rasterClipDepthWgsl("clipPosition")}, clipPosition.w);
}
`;
}

function nativeShaderUsesTangent(vertexSource: string): boolean {
  return /\ba_tangent\b/.test(vertexSource) || /layout\s*\(\s*location\s*=\s*3\s*\)\s*in\s+vec4/.test(vertexSource);
}

function nativePbrFragmentPrelude(marker: string, atlas = false): string {
  return `// ${marker}
${nativeUniformStruct()}
@group(0) @binding(1) var u_baseSampler: sampler;
@group(0) @binding(2) var u_baseTexture: texture_2d<f32>;
@group(0) @binding(3) var u_environmentSampler: sampler;
@group(0) @binding(4) var u_environmentTexture: texture_2d<f32>;
@group(0) @binding(5) var u_brdfSampler: sampler;
@group(0) @binding(6) var u_brdfTexture: texture_2d<f32>;
@group(0) @binding(7) var u_shadowSampler: sampler;
@group(0) @binding(8) var u_shadowTexture: texture_2d<f32>;
@group(0) @binding(9) var u_normalSampler: sampler;
@group(0) @binding(10) var u_normalTexture: texture_2d<f32>;
@group(0) @binding(11) var u_metallicRoughnessSampler: sampler;
@group(0) @binding(12) var u_metallicRoughnessTexture: texture_2d<f32>;
@group(0) @binding(13) var u_occlusionSampler: sampler;
@group(0) @binding(14) var u_occlusionTexture: texture_2d<f32>;
@group(0) @binding(15) var u_clusterLightData: texture_2d<f32>;
@group(0) @binding(16) var u_clusterLightIndices: texture_2d<f32>;
@group(0) @binding(17) var u_spotShadowSampler: sampler;
@group(0) @binding(18) var u_spotShadowTexture: texture_2d<f32>;

${atlas ? WEBGPU_EXTENSION_ATLAS_WGSL : ""}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
  @location(3) tangent: vec4<f32>,
  ${atlas ? "@location(4) uv1: vec2<f32>, @location(5) color: vec4<f32>," : ""}
};

fn fresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0, 1.0, 1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn fresnelSchlickRoughness(cosTheta: f32, f0: vec3<f32>, roughness: f32) -> vec3<f32> {
  let smoothness = 1.0 - clamp(roughness, 0.0, 1.0);
  return f0 + (max(vec3<f32>(smoothness, smoothness, smoothness), f0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn ggxDistribution(nDotH: f32, roughness: f32) -> f32 {
  let a = ${atlas ? "max(roughness, 0.045) * max(roughness, 0.045)" : "max(roughness * roughness, 0.045)"};
  let a2 = a * a;
  // At roughness .045 the true denominator before squaring is ~4.1e-6.
  // A .001/.00001 floor destroys the normalized low-roughness GGX lobe.
  let denom = max((nDotH * nDotH) * (a2 - 1.0) + 1.0, ${atlas ? "0.00000001" : "0.001"});
  return a2 / max(3.14159265 * denom * denom, ${atlas ? "0.0000000000000001" : "0.001"});
}

fn ggxVisibilitySmithCorrelated(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  let a = ${atlas ? "max(roughness, 0.045) * max(roughness, 0.045)" : "max(roughness * roughness, 0.045)"};
  let a2 = a * a;
  let lambdaV = nDotL * sqrt(max((nDotV - a2 * nDotV) * nDotV + a2, 0.00001));
  let lambdaL = nDotV * sqrt(max((nDotL - a2 * nDotL) * nDotL + a2, 0.00001));
  return 0.5 / max(lambdaV + lambdaL, 0.00001);
}

fn diffuseBurley(nDotV: f32, nDotL: f32, lDotH: f32, roughness: f32) -> f32 {
  let energyBias = mix(0.0, 0.5, roughness);
  let energyFactor = mix(1.0, 1.0 / 1.51, roughness);
  let fd90 = energyBias + 2.0 * lDotH * lDotH * roughness;
  let lightScatter = 1.0 + (fd90 - 1.0) * pow(clamp(1.0 - nDotL, 0.0, 1.0), 5.0);
  let viewScatter = 1.0 + (fd90 - 1.0) * pow(clamp(1.0 - nDotV, 0.0, 1.0), 5.0);
  return lightScatter * viewScatter * energyFactor;
}

fn encodePbrOutput(linearColor: vec3<f32>) -> vec3<f32> {
  let color = max(linearColor, vec3<f32>(0.0, 0.0, 0.0));
  let filmic = clamp((color * (2.51 * color + vec3<f32>(0.03, 0.03, 0.03))) / (color * (2.43 * color + vec3<f32>(0.59, 0.59, 0.59)) + vec3<f32>(0.14, 0.14, 0.14)), vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));
  return pow(filmic, vec3<f32>(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
}

fn perturbNormal(normalInput: vec3<f32>, tangentFrame: vec4<f32>, normalSample: vec3<f32>, normalScale: f32) -> vec3<f32> {
  let n = normalize(normalInput);
  let tangent = normalize(tangentFrame.xyz);
  let bitangent = normalize(cross(n, tangent) * tangentFrame.w);
  let mapped = vec3<f32>((normalSample.xy * 2.0 - vec2<f32>(1.0, 1.0)) * max(normalScale, 0.0), normalSample.z * 2.0 - 1.0);
  return normalize(tangent * mapped.x + bitangent * mapped.y + n * max(mapped.z, 0.001));
}

fn a3dNativeShadowFactor(worldPosition: vec3<f32>, normal: vec3<f32>, lightDirection: vec3<f32>, useSpot: bool, shadowSampler: sampler, shadowTexture: texture_2d<f32>) -> f32 {
  var shadowMatrix = u_draw.shadowMapMatrix;
  var bias = u_draw.shadowParams0.x;
  var slopeBias = u_draw.shadowParams0.y;
  var texelSize = u_draw.shadowParams0.zw;
  var strength = u_draw.flags.z;
  var sampleCount = i32(u_draw.shadowParams1.x + 0.5);
  var receiverLightDirection = lightDirection;
  if (useSpot) {
    if (u_draw.spotShadowParams2.x < 0.5) { return 1.0; }
    let toFragment = worldPosition - u_draw.spotShadowParams0.xyz;
    let distanceToLight = max(length(toFragment), 0.0001);
    if (distanceToLight > u_draw.spotShadowParams0.w) { return 1.0; }
    let coneAxis = u_draw.spotShadowParams1.xyz / max(length(u_draw.spotShadowParams1.xyz), 0.0001);
    if (dot(toFragment / distanceToLight, coneAxis) < cos(u_draw.spotShadowParams3.w)) { return 1.0; }
    receiverLightDirection = coneAxis * -1.0;
    shadowMatrix = u_draw.spotShadowMatrix;
    bias = u_draw.spotShadowParams2.z;
    slopeBias = u_draw.spotShadowParams2.w;
    texelSize = u_draw.spotShadowParams3.xy;
    strength = u_draw.spotShadowParams2.y;
    sampleCount = i32(u_draw.spotShadowParams3.z + 0.5);
  }
  let lightPosition = shadowMatrix * vec4<f32>(worldPosition, 1.0);
  let projected = lightPosition.xyz / max(lightPosition.w, 0.0001);
  let uv = projected.xy * 0.5 + vec2<f32>(0.5, 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 1.0; }
  // Native render targets store framebuffer row 0 at the top while the CPU
  // projection math addresses texels GL-style (row 0 at the bottom), so the
  // sample V must be mirrored to land on the texel the projection means.
  // Display and readback paths already account for the row order, which is
  // why screenshots and readPixels match GL while direct sampling does not.
  let sampleUv = vec2<f32>(uv.x, 1.0 - uv.y);
  let receiverNormal = normalize(normal);
  let shadowLightDirection = receiverLightDirection / max(length(receiverLightDirection), 0.0001);
  let normalDotLight = clamp(abs(dot(receiverNormal, shadowLightDirection)), 0.0, 1.0);
  // Shared bias-table policy (GLSL parity): per-sample tangent-scaled slope
  // bias — a centre-only bias under-compensates outer PCF taps on sloped
  // receivers, so each tap scales by its own texel distance.
  let slopeTangent = min(sqrt(max(1.0 - normalDotLight * normalDotLight, 0.0)) / max(normalDotLight, 0.05), 8.0);
  let slopeTexelBias = slopeTangent * slopeBias * max(texelSize.x, texelSize.y);
  let projectedDepth = clamp(projected.z * 0.5 + 0.5, 0.0, 1.0);
  var shadowed = 0.0;
  var totalWeight = 0.0;
  let taps = clamp(sampleCount, 1, 32);
  for (var i = 0; i < 32; i = i + 1) {
    if (i >= taps) { break; }
    var sampleData = u_draw.shadowPcf[i];
    if (useSpot) { sampleData = u_draw.spotShadowPcf[i]; }
    let weight = max(sampleData.z, 0.0);
    let offset = sampleData.xy * texelSize;
    let storedDepth = textureSampleLevel(shadowTexture, shadowSampler, sampleUv + offset, 0.0).r;
    let sampleTexelDistance = max(1.0, length(sampleData.xy));
    let receiverDepth = projectedDepth - bias - slopeTexelBias * sampleTexelDistance;
    shadowed = shadowed + select(0.0, 1.0, receiverDepth > storedDepth) * weight;
    totalWeight = totalWeight + weight;
  }
  let occlusion = select(0.0, shadowed / totalWeight, totalWeight > 0.0);
  return mix(1.0, 1.0 - occlusion, clamp(strength, 0.0, 1.0));
}

fn shadePbr(normalInput: vec3<f32>, tangentFrame: vec4<f32>, uv: vec2<f32>, worldPosition: vec3<f32>, fragmentPosition: vec2<f32>${atlas ? ", uv1: vec2<f32>, vertexColor: vec4<f32>" : ""}) -> vec4<f32> {
  var normal = normalize(normalInput);
  if (u_draw.morph0.x > 0.5) {
    normal = perturbNormal(normal, tangentFrame, textureSample(u_normalTexture, u_normalSampler, ${atlas ? "atlasUv(1u, uv, uv1)" : "uv"}).rgb, u_draw.morph0.y);
  }
  let viewDirection = normalize(u_draw.camera.xyz - worldPosition);
  let lightDirection = normalize(vec3<f32>(0.36, 0.52, 0.78));
  let halfVector = normalize(lightDirection + viewDirection);
  var baseColor = u_draw.color.rgb${atlas ? " * vertexColor.rgb" : ""};
  var materialAlpha = u_draw.color.a${atlas ? " * vertexColor.a" : ""};
  if (u_draw.flags.x > 0.5) {
    let baseSample = textureSample(u_baseTexture, u_baseSampler, ${atlas ? "atlasUv(0u, uv, uv1)" : "uv"});
    baseColor = baseColor * baseSample.rgb;
    materialAlpha = materialAlpha * baseSample.a;
  }
  ${atlas ? "" : "if (materialAlpha < u_draw.material.x) { discard; }"}
  let transmission = clamp(max(u_draw.material.y, u_draw.material.z), 0.0, 1.0);
  let metallicRoughnessSample = textureSample(u_metallicRoughnessTexture, u_metallicRoughnessSampler, ${atlas ? "atlasUv(2u, uv, uv1)" : "uv"});
  let metallicRoughnessEnabled = step(0.5, u_draw.materialFlags.x);
  let occlusionEnabled = step(0.5, u_draw.materialFlags.y);
  let sampledMetallic = clamp(u_draw.params.x * metallicRoughnessSample.b, 0.0, 1.0);
  let sampledRoughness = clamp(u_draw.params.y * metallicRoughnessSample.g, 0.045, 1.0);
  let sampledOcclusion = mix(1.0, textureSample(u_occlusionTexture, u_occlusionSampler, ${atlas ? "atlasUv(3u, uv, uv1)" : "uv"}).r, clamp(u_draw.morph0.z, 0.0, 1.0));
  let metallic = mix(clamp(u_draw.params.x, 0.0, 1.0), sampledMetallic, metallicRoughnessEnabled);
  let roughness = mix(clamp(u_draw.params.y, 0.045, 1.0), sampledRoughness, metallicRoughnessEnabled);
  let occlusion = mix(1.0, sampledOcclusion, occlusionEnabled);
  let nDotL = max(dot(normal, lightDirection), 0.0);
  let nDotV = max(dot(normal, viewDirection), 0.001);
  let nDotH = max(dot(normal, halfVector), 0.001);
  let vDotH = max(dot(viewDirection, halfVector), 0.001);
  let dielectricF0 = ${atlas ? "vec3<f32>(pow((u_atlas.substrate.x-1.0)/(u_atlas.substrate.x+1.0),2.0)) * clamp(u_atlas.specularColor.rgb,vec3<f32>(0.0),vec3<f32>(1.0)) * clamp(u_atlas.substrate.y,0.0,1.0)" : "vec3<f32>(0.04, 0.04, 0.04)"};
  let f0 = mix(dielectricF0, baseColor, metallic);
  let fresnel = fresnelSchlick(vDotH, f0);
  let distribution = ggxDistribution(nDotH, roughness);
  let visibility = ggxVisibilitySmithCorrelated(nDotV, nDotL, roughness);
  let lDotH = max(dot(lightDirection, halfVector), 0.0);
  ${atlas ? `// The film replaces the substrate Fresnel in the dielectric energy split.
  // Retaining the old kd while adding film specular creates or loses energy.
  let filmFresnel = atlasIridescenceFresnel(f0, vDotH, uv, uv1);
  let filmMaximum = max(max(filmFresnel.r, filmFresnel.g), filmFresnel.b);
  let diffuseFresnel = select(fresnel, vec3<f32>(filmMaximum), u_atlas.iridescence.y > 0.0);
  let kd = (vec3<f32>(1.0) - diffuseFresnel) * (1.0 - metallic);` : "let kd = (vec3<f32>(1.0, 1.0, 1.0) - fresnel) * (1.0 - metallic);"}
  let specular = fresnel * distribution * visibility;
  let diffuse = kd * baseColor * diffuseBurley(nDotV, nDotL, lDotH, roughness) / 3.14159265;
  var environment = baseColor * u_draw.params.z * (0.28 + 0.72 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0)) * occlusion;
  var environmentSpecularContribution = vec3<f32>(0.0, 0.0, 0.0);
  var environmentExtensionRadiance = vec3<f32>(0.0);
  if (u_draw.flags.w > 0.5) {
    let reflectionDirection = reflect(-viewDirection, normal);
    let diffuseUv = vec2<f32>(fract(atan2(normal.z, normal.x) / 6.2831853 + 0.5), acos(clamp(normal.y, -1.0, 1.0)) / 3.14159265);
    let specularUv = vec2<f32>(fract(atan2(reflectionDirection.z, reflectionDirection.x) / 6.2831853 + 0.5), acos(clamp(reflectionDirection.y, -1.0, 1.0)) / 3.14159265);
    let environmentMipCount = max(u_draw.reserved0.z, 1.0);
    let diffuseEnv = textureSampleLevel(u_environmentTexture, u_environmentSampler, diffuseUv, max(environmentMipCount - 1.0, 0.0)).rgb;
    let specularEnv = textureSampleLevel(u_environmentTexture, u_environmentSampler, specularUv, roughness * max(environmentMipCount - 1.0, 0.0)).rgb;
    let brdf = textureSampleLevel(u_brdfTexture, u_brdfSampler, vec2<f32>(nDotV, roughness), 0.0).rg;
    let environmentFresnel = fresnelSchlickRoughness(nDotV, f0, roughness);
    let environmentDiffuse = (vec3<f32>(1.0, 1.0, 1.0) - environmentFresnel) * (1.0 - metallic) * diffuseEnv * baseColor * u_draw.params.w * occlusion;
    ${atlas ? "let environmentF0 = atlasIridescenceEnvironmentF0(f0, nDotV, uv, uv1);" : "let environmentF0 = f0;"}
    let environmentSpecular = specularEnv * (environmentF0 * brdf.x + vec3<f32>(brdf.y, brdf.y, brdf.y)) * max(u_draw.reserved0.w, 0.0);
    environmentSpecularContribution = environmentSpecular;
    environmentExtensionRadiance = specularEnv * max(u_draw.reserved0.w, 0.0);
    environment = environment + environmentDiffuse + environmentSpecular;
  }
  // J2 native shadow projections: directional PCF mirrors GLSL
  // a3dForwardShadowFactor; spot PCF mirrors a3dSpotShadowFactor. Both
  // default to 1.0 (lit) when disabled or outside the shadow frustum.
  var shadow = 1.0;
  if (u_draw.flags.y > 0.5) {
    shadow = a3dNativeShadowFactor(worldPosition, normal, lightDirection, false, u_shadowSampler, u_shadowTexture);
  }
  shadow = shadow * a3dNativeShadowFactor(worldPosition, normal, lightDirection, true, u_spotShadowSampler, u_spotShadowTexture);
  var clusteredDirect = vec3<f32>(0.0, 0.0, 0.0);
  if (u_draw.materialFlags.w > 0.5) {
    let indexDimensions = textureDimensions(u_clusterLightIndices);
    let gridWidth = max(i32(u_draw.material.w), 1);
    let tileX = max(i32(fragmentPosition.x) / 64, 0);
    let tileY = max(i32(fragmentPosition.y) / 64, 0);
    let clusterIndex = clamp(tileY * gridWidth + tileX, 0, i32(indexDimensions.y) - 1);
    let clusterLightCount = min(i32(textureLoad(u_clusterLightIndices, vec2<i32>(0, clusterIndex), 0).g), 64);
    for (var clusteredIndex = 0; clusteredIndex < 64; clusteredIndex = clusteredIndex + 1) {
      if (clusteredIndex >= clusterLightCount) { break; }
      let lightIndex = i32(textureLoad(u_clusterLightIndices, vec2<i32>(clusteredIndex, clusterIndex), 0).r);
      let colorIntensity = textureLoad(u_clusterLightData, vec2<i32>(0, lightIndex), 0);
      let positionRange = textureLoad(u_clusterLightData, vec2<i32>(1, lightIndex), 0);
      let directionKind = textureLoad(u_clusterLightData, vec2<i32>(2, lightIndex), 0);
      var clusteredDirection = normalize(-directionKind.xyz);
      var attenuation = 1.0;
      if (directionKind.w > 0.5) {
        let toLight = positionRange.xyz - worldPosition;
        let distanceToLight = length(toLight);
        clusteredDirection = select(clusteredDirection, toLight / max(distanceToLight, 0.0001), distanceToLight > 0.0001);
        // range <= 0 means infinite (physical descriptors, PRD-02 §6.3).
        let rangeFalloff = select(clamp(1.0 - pow(distanceToLight / max(positionRange.w, 0.0001), 4.0), 0.0, 1.0), 1.0, positionRange.w <= 0.0);
        attenuation = rangeFalloff * rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
      }
      let clusteredNdotL = max(dot(normal, clusteredDirection), 0.0);
      clusteredDirect = clusteredDirect + baseColor * colorIntensity.rgb * colorIntensity.a * attenuation * clusteredNdotL;
    }
  }
  let legacyDirect = (diffuse + specular) * nDotL * 2.25 * shadow;
  let litOpaqueLinearColor = environment + select(legacyDirect, clusteredDirect, u_draw.materialFlags.w > 0.5)
    ${atlas ? "+ atlasExtensionLighting(normal, tangentFrame, viewDirection, lightDirection, uv, uv1, shadow, environmentExtensionRadiance, f0, roughness) + u_atlas.emissive.rgb * u_atlas.factors.y * mix(vec3<f32>(1.0), textureSample(u_emissiveTexture, u_emissiveSampler, atlasUv(4u, uv, uv1)).rgb, u_atlas.maps[4].control.z)" : ""};
  let opaqueLinearColor = litOpaqueLinearColor;
  let transmittedTint = baseColor * u_draw.params.w * (0.18 + 0.42 * clamp(1.0 - roughness, 0.0, 1.0)) + environmentSpecularContribution * 1.35;
  let linearColor = mix(opaqueLinearColor, opaqueLinearColor * 0.22 + transmittedTint, transmission);
  let outputAlpha = mix(materialAlpha, min(materialAlpha, 0.22), transmission);
  ${atlas ? "if (materialAlpha < u_draw.material.x) { discard; }" : ""}
  return vec4<f32>(encodePbrOutput(linearColor), outputAlpha);
}
`;
}

function nativePbrShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
  @location(3) tangent: vec4<f32>,
};

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = (u_draw.instance0 * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * vec4<f32>(position, 1.0));
  output.normal = normalize((u_draw.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  output.uv = vec2<f32>(0.5, 0.5);
  output.worldPosition = worldPosition;
  output.tangent = vec4<f32>(1.0, 0.0, 0.0, 1.0);
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.tangent, input.uv, input.worldPosition, input.position.xy);
}
`
  };
}

function nativeTexturedPbrShader(vertexEntry: string, fragmentEntry: string, marker: string, usesTangent: boolean, atlas = false): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
  @location(3) tangent: vec4<f32>,
  ${atlas ? "@location(4) uv1: vec2<f32>, @location(5) color: vec4<f32>," : ""}
};

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>${usesTangent ? ", @location(3) tangent: vec4<f32>" : ""}${atlas ? ", @location(4) color: vec4<f32>, @location(7) uv1: vec2<f32>" : ""}) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = (u_draw.instance0 * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * vec4<f32>(position, 1.0));
  output.normal = normalize((u_draw.normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  output.uv = uv;
  ${atlas ? "output.uv1 = uv1; output.color = color;" : ""}
  output.worldPosition = worldPosition;
  ${usesTangent ? "output.tangent = vec4<f32>(normalize((u_draw.normalMatrix * vec4<f32>(tangent.xyz, 0.0)).xyz), tangent.w);" : "output.tangent = vec4<f32>(1.0, 0.0, 0.0, 1.0);"}
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker, atlas)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.tangent, input.uv, input.worldPosition, input.position.xy${atlas ? ", input.uv1, input.color" : ""});
}
`
  };
}

function nativeInstancedPbrShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
  @location(3) tangent: vec4<f32>,
};

fn instanceMatrix(index: u32) -> mat4x4<f32> {
  if (index == 1u) { return u_draw.instance1; }
  if (index == 2u) { return u_draw.instance2; }
  if (index == 3u) { return u_draw.instance3; }
  return u_draw.instance0;
}

fn a3dInstanceNormalMatrix(model: mat4x4<f32>) -> mat3x3<f32> {
  // GLSL parity: v_normal = u_normalMatrix * transpose(inverse(mat3(instance))) * a_normal.
  let m = mat3x3<f32>(model[0].xyz, model[1].xyz, model[2].xyz);
  let adj0 = cross(m[1], m[2]);
  let adj1 = cross(m[2], m[0]);
  let adj2 = cross(m[0], m[1]);
  let det = dot(m[0], adj0);
  let safeDet = select(det, 1.0, abs(det) < 0.00001);
  return mat3x3<f32>(
    vec3<f32>(adj0.x, adj1.x, adj2.x) / safeDet,
    vec3<f32>(adj0.y, adj1.y, adj2.y) / safeDet,
    vec3<f32>(adj0.z, adj1.z, adj2.z) / safeDet);
}

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  let model = instanceMatrix(instanceIndex);
  let worldPosition = (u_draw.modelMatrix * model * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * model * vec4<f32>(position, 1.0));
  output.normal = normalize((u_draw.normalMatrix * vec4<f32>(a3dInstanceNormalMatrix(model) * normal, 0.0)).xyz);
  output.uv = vec2<f32>(0.5, 0.5);
  output.worldPosition = worldPosition;
  output.tangent = vec4<f32>(1.0, 0.0, 0.0, 1.0);
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.tangent, input.uv, input.worldPosition, input.position.xy);
}
`
  };
}

function nativeSkinnedUnlitShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

fn jointMatrix(index: f32) -> mat4x4<f32> {
  let i = clamp(i32(index + 0.5), 0, 95);
  return u_draw.joints[i];
}

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(5) joints: vec4<f32>, @location(6) weights: vec4<f32>) -> VertexOutput {
  var output: VertexOutput;
  let skin = jointMatrix(joints.x) * weights.x + jointMatrix(joints.y) * weights.y + jointMatrix(joints.z) * weights.z + jointMatrix(joints.w) * weights.w;
  let weightSum = weights.x + weights.y + weights.z + weights.w;
  let skinned = select(vec4<f32>(position, 1.0), skin * vec4<f32>(position, 1.0), weightSum > 0.0001);
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * skinned);
  return output;
}
`,
    fragment: `// ${marker}
${nativeUniformStruct()}
@fragment
fn ${fragmentEntry}() -> @location(0) vec4<f32> {
  return u_draw.color;
}
`
  };
}

function nativeMorphUnlitShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  const morphUniforms = `struct MorphUniforms {
  modelViewProjection: mat4x4<f32>,
  color: vec4<f32>,
  weights: vec4<f32>,
  params: vec4<f32>,
  deltas: array<vec4<f32>, ${NATIVE_MORPH_MAX_TARGETS * NATIVE_MORPH_MAX_VERTICES}>,
};
@group(0) @binding(0) var<uniform> u_morph: MorphUniforms;`;
  return {
    vertex: `// ${marker}
${morphUniforms}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

${ZERO_TO_ONE_PROJECTION_WGSL}
@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  var delta = vec3<f32>(0.0);
  if (vertexIndex < ${NATIVE_MORPH_MAX_VERTICES}u) {
    for (var target = 0u; target < u32(u_morph.params.x); target += 1u) {
      delta += u_morph.deltas[target * ${NATIVE_MORPH_MAX_VERTICES}u + vertexIndex].xyz * u_morph.weights[target];
    }
  }
  let clip = u_morph.modelViewProjection * vec4<f32>(position + delta, 1.0);
  output.position = vec4<f32>(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);
  return output;
}
`,
    fragment: `// ${marker}
${morphUniforms}
@fragment
fn ${fragmentEntry}() -> @location(0) vec4<f32> {
  return u_morph.color;
}
`
  };
}

function inferWGSLVertexEntryPoint(source: string): string | undefined {
  return /@vertex\s+fn\s+([A-Za-z_]\w*)/.exec(source)?.[1];
}

function inferWGSLFragmentEntryPoint(source: string): string | undefined {
  return /@fragment\s+fn\s+([A-Za-z_]\w*)/.exec(source)?.[1];
}

/** Native layout of one declared vertex stream (shared by draw and pipeline warmup). */
function nativeFormatStreamLayout(format: VertexFormat, stream: VertexFormat["streams"][number]): {
  readonly attributes: WebGPUVertexAttributeLike[];
  readonly stride: number;
  readonly plan?: NativeVertexConversionPlan;
} {
  const members = format.attributes.filter(attribute => attribute.bufferSlot === stream.slot);
  if (members.some(needsNativeVertexConversion)) {
    const plan = planNativeVertexConversion(members, stream.stride, vertexAttributeFormat, nativeVertexFormatSize);
    return { attributes: [...plan.attributes], stride: plan.arrayStride, plan };
  }
  if (stream.stride % 4 !== 0) throw new RenderDeviceError("WebGPU vertex stride must be four-byte aligned", "WEBGPU_VERTEX_STRIDE_INVALID", { slot: stream.slot, stride: stream.stride });
  const attributes = members.map(attribute => {
    const alignment = Math.min(4, attribute.byteLength);
    if (attribute.offset % alignment !== 0) throw new RenderDeviceError("WebGPU vertex attribute offset is not aligned to its format", "WEBGPU_VERTEX_OFFSET_INVALID", { slot: stream.slot, offset: attribute.offset, alignment });
    return { shaderLocation: attribute.shaderLocation, offset: attribute.offset, format: vertexAttributeFormat(attribute) };
  });
  return { attributes, stride: stream.stride };
}

function nativeVertexFormatSize(format: string): number {
  const match = /^(float32|uint32|sint32)(?:x([234]))?$|^(uint8|sint8|unorm8|snorm8|uint16|sint16|unorm16|snorm16)(?:x([24]))?$/.exec(format);
  if (!match) throw new RenderDeviceError("Unsupported native vertex format", "WEBGPU_VERTEX_FORMAT_UNSUPPORTED", { format });
  return match[1] ? 4 * Number(match[2] ?? 1) : (match[3]!.endsWith("8") ? 1 : 2) * Number(match[4] ?? 1);
}

function vertexAttributeFormat(attribute: VertexFormat["attributes"][number]): string {
  const { type, components, normalized, integer } = attribute;
  if (type === "float32") return components === 1 ? "float32" : `float32x${components}`;
  if (type === "int32" || type === "uint32") {
    if (!integer || normalized) throw new RenderDeviceError("WebGPU cannot convert 32-bit integer vertex inputs to floats", "WEBGPU_VERTEX_FORMAT_UNSUPPORTED", { type, components });
    const gpuType = type === "int32" ? "sint32" : "uint32";
    return components === 1 ? gpuType : `${gpuType}x${components}`;
  }
  if (components !== 1 && components !== 2 && components !== 4) throw new RenderDeviceError("WebGPU 8/16-bit vertex attributes need one, two or four components", "WEBGPU_VERTEX_FORMAT_UNSUPPORTED", { type, components });
  if (!integer && !normalized) throw new RenderDeviceError("WebGPU non-normalized integer attributes must target integer shader inputs", "WEBGPU_VERTEX_FORMAT_UNSUPPORTED", { type, components });
  const prefix = normalized ? (type.startsWith("uint") ? "unorm" : "snorm") : type.startsWith("uint") ? type : `s${type}`;
  const width = type.endsWith("8") ? "8" : "16";
  const format = `${prefix}${normalized ? width : ""}`;
  return components === 1 ? format : `${format}x${components}`;
}
