import { type VertexFormat } from "./VertexFormat";
import { isTextureBinding, type TextureBinding } from "./TextureBinding";
import { Texture, claimRenderTargetTextureOwner, getRenderTargetTextureOwner, type TextureFormat } from "./Texture";
import { reflectShaderSources, type ShaderReflection } from "./ShaderReflection";
import type { RendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";
import type { NativePostEffect } from "./post/NativeEffectShaders";
import type { GeneratedProgramDescriptor } from "./contracts/program";
import type { AutoExposureOptionsV2, DofOptions } from "./post/PostGraph";
import type { WebGPULinearDepthCoverage, WebGPULinearDepthProjection } from "./post/WebGPULinearDepth";
import type { PostDiagnosticToken } from "./renderer/PostDiagnosticsScope";
import { hasAttachmentRenderOverrides, validateRenderCommandState } from "./contracts/blend";
import type { ShaderDataType } from "./webgpu/ShaderDataLayout";

export type { ShaderAttributeReflection, ShaderReflection, ShaderUniformReflection } from "./ShaderReflection";

export type RenderBackendKind = "mock" | "webgl2" | "webgpu";

export type BufferUsage = "vertex" | "index" | "uniform" | "storage" | "readback";

export type IndexType = "uint16" | "uint32";

export type PrimitiveTopology = "triangles" | "lines" | "points";

export interface DisposableResource {
  readonly disposed: boolean;
  dispose(): void;
}

export interface RenderBuffer extends DisposableResource {
  readonly id: number;
  readonly usage: BufferUsage;
  readonly byteLength: number;
}

/** A native WGSL storage declaration. Groups start at 1; group 0 is reserved
 * for the portable draw layout. Visibility and access describe the actual
 * declaration and stage use, and are validated by the native backend. */
export type NativeShaderStorageLayout = {
  readonly group: number;
  readonly binding: number;
  readonly visibility: "vertex" | "fragment" | "vertex-fragment";
} & (
  | { readonly kind: "storage-buffer"; readonly access: "read" | "read_write" }
  | { readonly kind: "storage-texture"; readonly access: "read" | "write" | "read_write"; readonly format: string; readonly viewDimension?: "2d" }
);

export interface NativeShaderStages {
  readonly vertex: string;
  readonly fragment: string;
  readonly storageBindings?: readonly NativeShaderStorageLayout[];
}

export interface ShaderSources {
  readonly label: string;
  readonly vertex: string;
  readonly fragment: string;
  readonly marker: string;
  /** Resolved generated-program semantics for native backends. */
  readonly generatedProgram?: GeneratedProgramDescriptor;
  /** Native WGSL stages for a public portable shader. GLSL remains the reflection source. */
  readonly webgpu?: NativeShaderStages;
  /** Schema used to build and bind a portable WebGPU draw group. */
  readonly portableBindings?: readonly PortableShaderBinding[];
}

export type PortableShaderBindingKind = "float" | "i32" | "u32" | "bool" | "vec2" | "vec3" | "vec4" | "mat4" | "data" | "texture2d" | "texture2d-array" | "texture3d" | "texture-cube" | "depth2d" | "depth2d-multisampled";

export interface PortableShaderBinding {
  readonly name: string;
  readonly kind: PortableShaderBindingKind;
  readonly required?: boolean;
  /** Fixed-length array of this numeric element type. Textures cannot be arrays here. */
  readonly arrayLength?: number;
  readonly dataType?: ShaderDataType;
}

export interface RenderShaderProgram extends DisposableResource {
  readonly id: number;
  readonly label: string;
  readonly marker: string;
  readonly reflection: ShaderReflection;
}

export interface ShaderCompilationDiagnostic {
  readonly stage: "vertex" | "fragment";
  readonly severity: "error" | "warning" | "info";
  readonly message: string;
  readonly line?: number;
  readonly column?: number;
}

export interface RenderTargetDescriptor {
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly format?: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">;
  readonly depth?: boolean | "renderbuffer" | "texture";
  readonly sampleCount?: number;
  /** Number of allocated color mip levels, including level zero (default 1). */
  readonly mipLevelCount?: number;
  /**
   * PR 0a (CONTRACTS §3.4): texture dimensionality. "cube" renders 6 faces;
   * "2d-array" renders `layers` slices; "3d" renders each of `layers` depth
   * slices of one volume texture (color only: `depth: false`, single-sample,
   * one mip, no MRT), sampled afterwards as a 3D texture.
   */
  readonly dimension?: "2d" | "cube" | "2d-array" | "3d";
  /** Layer count for "2d-array", or the volume depth (slice count) for "3d"; cube targets always have 6 faces. */
  readonly layers?: number;
  /** PR 0a (C-11, lane 02 Q-01-5): depth-only target — no color attachment; `colorTexture` is an unallocated placeholder, `depthTexture` is the sampleable surface. */
  readonly depthOnly?: boolean;
  /** Comparison-sampler depth texture (TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE) for shadow mapping. */
  readonly depthCompare?: boolean;
  /** PR 0a (lane 03 Q-01-2): MRT color attachments; attachment 0 is `colorTexture`. `drawBuffers` bound on setRenderTarget. */
  readonly colorAttachments?: readonly { format: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f"> }[];
  /**
   * Depth storage class (default "fixed"). "float" allocates 32-bit float depth
   * (WebGL2 DEPTH32F_STENCIL8 / DEPTH_COMPONENT32F; WebGPU depth32float or
   * depth32float-stencil8) when the device reports `floatDepth`; a device
   * that must fall back keeps fixed depth and reports it in `depthStorage`.
   * The sampled depth texture keeps the generic "depth24" depth format class.
   */
  readonly depthPrecision?: import("./DepthConvention").DepthStorage;
  /**
   * Whether the depth attachment needs a stencil aspect (default true). Only a
   * float request uses it: false permits a depth-only float format.
   */
  readonly stencil?: boolean;
}

export interface RenderTarget extends DisposableResource {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly colorTexture: Texture;
  readonly depthTexture?: Texture;
  /** Native multisampled depth attachment, distinct from any resolved depth texture. */
  readonly multisampledDepthTexture?: Texture;
  readonly sampleCount?: number;
  /** Texture dimensionality (default "2d"). */
  readonly dimension?: "2d" | "cube" | "2d-array" | "3d";
  /** Cube faces (6), 2d-array layers or 3D depth slices. */
  readonly layers?: number;
  /** MRT targets: every color attachment (attachment 0 === `colorTexture`). */
  readonly colorTextures?: readonly Texture[];
  /** Cube/array/3D targets: one child target per face/layer/depth slice; callers render into `layerTargets[i]`. */
  readonly layerTargets?: readonly RenderTarget[];
  readonly depthOnly?: boolean;
  /** Storage class of the depth attachment; absent means fixed point. */
  readonly depthStorage?: import("./DepthConvention").DepthStorage;
  /** Subresource represented by a per-layer/mip target view. */
  readonly attachmentLayer?: number;
  readonly attachmentMipLevel?: number;
}

/** Unscaled color-copy rectangle in bottom-left target coordinates. */
export interface RenderTargetColorRegion {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly width: number;
  readonly height: number;
}

export type RenderOutputColorSpace = "srgb" | "display-p3";
export interface RenderOutputColorSpaceNegotiation {
  readonly requested: RenderOutputColorSpace;
  readonly active: RenderOutputColorSpace;
  readonly supported: readonly RenderOutputColorSpace[];
  readonly fallbackReason?: string;
}

/** A concrete attachment view, including the subresource and sample count. */
export interface RenderAttachmentIdentity {
  readonly texture: Texture;
  readonly aspect: "color" | "depth";
  readonly format: TextureFormat;
  readonly mipLevel: number;
  readonly layer: number;
  readonly sampleCount: number;
}

/** Ownership stays with the device; cancellation never disposes either target. */
export interface RenderResourceCopyOptions {
  readonly source: RenderTarget;
  readonly destination: RenderTarget;
  readonly aspect?: "color" | "depth";
  readonly sourceAttachment?: number;
  readonly destinationAttachment?: number;
  readonly signal?: AbortSignal;
}

/** Attachment-specific transfer. Results are caller-owned; abort discards staging/results. */
export interface RenderResourceReadbackOptions {
  readonly target: RenderTarget;
  readonly attachment?: number;
  readonly signal?: AbortSignal;
}

/** Validate backend-independent target constraints before allocating GPU objects. */
export function validateRenderTargetDescriptor(descriptor: RenderTargetDescriptor): void {
  if (!Number.isInteger(descriptor.width) || descriptor.width < 1 || !Number.isInteger(descriptor.height) || descriptor.height < 1) {
    throw new RenderDeviceError("Render target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE");
  }
  const dimension = descriptor.dimension ?? "2d";
  if (!["2d", "cube", "2d-array", "3d"].includes(dimension)) throw new RenderDeviceError("Unsupported render target dimension", "INVALID_RENDER_TARGET_SIZE", { dimension });
  if (dimension === "cube" && descriptor.width !== descriptor.height) throw new RenderDeviceError("Cube render targets must be square", "INVALID_RENDER_TARGET_SIZE");
  if (descriptor.layers !== undefined && ((dimension !== "2d-array" && dimension !== "3d") || !Number.isInteger(descriptor.layers) || descriptor.layers < 1)) {
    throw new RenderDeviceError("Render target layers require a positive 2d-array layer count or 3d depth", "INVALID_RENDER_TARGET_SIZE");
  }
  if (dimension === "3d") validateVolumeRenderTargetDescriptor(descriptor);
  if (!Number.isInteger(descriptor.sampleCount ?? 1) || (descriptor.sampleCount ?? 1) < 1) throw new RenderDeviceError("Render target sampleCount must be a positive integer", "INVALID_RENDER_TARGET_SAMPLE_COUNT");
  const mipLevelCount = descriptor.mipLevelCount ?? 1;
  const maxMipLevels = Math.floor(Math.log2(Math.max(descriptor.width, descriptor.height))) + 1;
  if (!Number.isSafeInteger(mipLevelCount) || mipLevelCount < 1 || mipLevelCount > maxMipLevels) {
    throw new RenderDeviceError("Render target mipLevelCount exceeds its dimensions", "INVALID_RENDER_TARGET_MIP_COUNT", { mipLevelCount, maxMipLevels });
  }
  if (descriptor.depthOnly && ((descriptor.colorAttachments?.length ?? 0) > 0 || descriptor.depth === false)) {
    throw new RenderDeviceError("Depth-only targets require depth and cannot have color attachments", "INVALID_RENDER_TARGET_SIZE");
  }
  const formats = [descriptor.format, ...(descriptor.colorAttachments ?? []).map((entry) => entry.format)].filter((format) => format !== undefined);
  if (formats.some((format) => format !== "rgba8" && format !== "rgba16f" && format !== "rgba32f")) throw new RenderDeviceError("Unsupported render target color format", "INVALID_RENDER_TARGET_FORMAT");
  if (descriptor.depthPrecision !== undefined && descriptor.depthPrecision !== "fixed" && descriptor.depthPrecision !== "float") {
    throw new RenderDeviceError("Render target depthPrecision must be \"fixed\" or \"float\"", "INVALID_RENDER_TARGET_FORMAT", { depthPrecision: descriptor.depthPrecision });
  }
  if (descriptor.stencil !== undefined && typeof descriptor.stencil !== "boolean") {
    throw new RenderDeviceError("Render target stencil must be a boolean", "INVALID_RENDER_TARGET_FORMAT");
  }
}

/**
 * 3D targets render one depth slice at a time into a color volume. Depth,
 * multisampling, MRT and mip chains have no portable per-slice meaning on
 * both native backends, so they are refused instead of silently dropped.
 */
function validateVolumeRenderTargetDescriptor(descriptor: RenderTargetDescriptor): void {
  if (descriptor.layers === undefined) throw new RenderDeviceError("3d render targets require `layers` (the volume depth)", "INVALID_RENDER_TARGET_SIZE");
  if (descriptor.depth !== false || descriptor.depthOnly || descriptor.depthCompare) {
    throw new RenderDeviceError("3d render targets are color-only; pass depth: false", "UNSUPPORTED_RENDER_TARGET_FEATURE", { dimension: "3d" });
  }
  if ((descriptor.sampleCount ?? 1) !== 1 || (descriptor.mipLevelCount ?? 1) !== 1 || (descriptor.colorAttachments?.length ?? 0) > 1) {
    throw new RenderDeviceError("3d render targets must be single-sample, single-mip and single-attachment", "UNSUPPORTED_RENDER_TARGET_FEATURE", { dimension: "3d" });
  }
}

export function getRenderAttachmentIdentity(target: RenderTarget, aspect: "color" | "depth" = "color", attachment = 0): RenderAttachmentIdentity {
  if (target.disposed) throw new RenderDeviceError("Cannot access a disposed render target", "DISPOSED_RESOURCE", { targetId: target.id });
  if (!Number.isInteger(attachment) || attachment < 0) throw new RenderDeviceError("Attachment index must be a non-negative integer", "INVALID_RENDER_ATTACHMENT");
  const texture = aspect === "depth" ? (attachment === 0 ? target.depthTexture : undefined) : target.depthOnly ? undefined : (target.colorTextures ?? [target.colorTexture])[attachment];
  if (!texture || texture.disposed) throw new RenderDeviceError(`Render target has no live ${aspect} attachment ${attachment}`, "INVALID_RENDER_ATTACHMENT");
  const mipLevel = target.attachmentMipLevel ?? 0;
  const layer = target.attachmentLayer ?? 0;
  const layerCount = texture.dimension === "cube" ? 6 : texture.dimension === "2d-array" ? texture.layers : texture.dimension === "3d" ? Math.max(1, Math.floor(texture.depth / 2 ** mipLevel)) : 1;
  const sampleCount = target.sampleCount ?? 1;
  if (!Number.isInteger(mipLevel) || mipLevel < 0 || mipLevel >= texture.mipLevelCount || !Number.isInteger(layer) || layer < 0 || layer >= layerCount || !Number.isInteger(sampleCount) || sampleCount < 1) {
    throw new RenderDeviceError("Invalid attachment mip, layer or sample count", "INVALID_RENDER_ATTACHMENT", { mipLevel, layer, sampleCount });
  }
  if ((aspect === "depth") !== (texture.format === "depth24")) throw new RenderDeviceError("Attachment format does not match its aspect", "INVALID_RENDER_ATTACHMENT");
  if (!texture.usage.includes("render-attachment")) throw new RenderDeviceError("Attachment texture lacks render-attachment usage", "INVALID_RENDER_ATTACHMENT");
  if (target.width !== Math.max(1, Math.floor(texture.width / 2 ** mipLevel)) || target.height !== Math.max(1, Math.floor(texture.height / 2 ** mipLevel))) {
    throw new RenderDeviceError("Attachment dimensions do not match the target mip", "INVALID_RENDER_ATTACHMENT");
  }
  return { texture, format: texture.format, aspect, mipLevel, layer, sampleCount };
}

/** Reject conflicting access to the same attachment subresource in one pass. */
export function validateRenderAttachmentAccess(reads: readonly RenderAttachmentIdentity[], writes: readonly RenderAttachmentIdentity[]): void {
  for (let i = 0; i < writes.length; i += 1) {
    const write = writes[i]!;
    for (const other of [...reads, ...writes.slice(0, i)]) {
      if (write.texture === other.texture && write.mipLevel === other.mipLevel && write.layer === other.layer && write.aspect === other.aspect) {
        throw new RenderDeviceError("Render pass has overlapping attachment read/write or write/write access", "RENDER_ATTACHMENT_HAZARD");
      }
    }
  }
}

export type LdrPostprocessPassName = "bloom" | "tone-mapping" | "color-grade" | "depth-of-field" | "motion-blur" | "ssao" | "ssr" | "taa" | "outline" | "fxaa";

export interface LdrPostprocessPassDescriptor {
  readonly name: LdrPostprocessPassName;
  readonly options: Readonly<Record<string, unknown>>;
}

/**
 * Renderer-supplied inputs for a device-tracked native DoF frame. The device
 * must establish the color/depth/coverage relationship from actual frame
 * clears and draws; these fields are not evidence by themselves.
 */
export interface NativeWebGPUDofFrameDescriptor {
  readonly source: RenderTarget;
  readonly coverage: WebGPULinearDepthCoverage;
  readonly projection: WebGPULinearDepthProjection;
  readonly maxGeometryDepthMeters: number;
  readonly skyDepthMeters: number;
  readonly alpha: "opaque";
  readonly depthModel: "single-surface";
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly frameId: number;
}

/** Device-issued, frame-scoped token. Structural lookalikes are not proof. */
export interface NativeWebGPUDofFrame extends NativeWebGPUDofFrameDescriptor {
  readonly deviceGeneration: number;
  isCurrent(): boolean;
}

export interface NativeWebGPUDofRequest {
  readonly options: Partial<DofOptions>;
  readonly frame: NativeWebGPUDofFrame;
}

/** Submission state retained by the issuing device for one exact DoF frame. */
export interface NativeWebGPUDofFrameSubmission {
  readonly depthSubmitted: boolean;
  readonly effectSubmitted: boolean;
}

export interface LdrPostprocessPresentationOptions {
  readonly passes: readonly LdrPostprocessPassDescriptor[];
  readonly outputTarget?: RenderTarget;
  readonly toneMappingDefaults?: Readonly<Record<string, unknown>>;
  /** Absent disables auto exposure; an empty object selects its defaults. */
  readonly autoExposure?: Partial<AutoExposureOptionsV2>;
  /** Native HDR DoF before exposure, bloom and output conversion. */
  readonly nativeDepthOfField?: NativeWebGPUDofRequest;
  /** Ordered native display effects; texture inputs remain borrowed. */
  readonly nativeEffects?: readonly NativePostEffect[];
  /** Stable scope/view identity for temporal effects and explicit camera cuts. */
  readonly postFrameContext?: {
    readonly scopeId: object;
    readonly viewId: string | number;
    readonly frameId: number;
    readonly cameraCut?: boolean;
    /** Monotonic renderer frame time in seconds; required by auto exposure. */
    readonly timeSeconds?: number;
    readonly diagnosticToken?: PostDiagnosticToken;
  };
  /**
   * Camera depth range used to linearize sampleable depth for the native
   * SSR/depth-of-field programs (muse3jsparity-PRD A3). Raw GL depth is
   * nonlinear: with the engine default 0.1/1000 range the whole play area
   * sits past 0.97, which blinded every depth-gated pass. Omitted or invalid
   * ranges fall back to the engine perspective defaults (0.1/1000).
   */
  readonly depthRange?: { readonly near: number; readonly far: number };
}

export interface DrawCommand<TUniform extends RecursiveUniformValue = UniformValue> {
  readonly label?: string;
  readonly topology: PrimitiveTopology;
  readonly renderState?: RenderCommandState;
  readonly vertexBuffer: RenderBuffer;
  /** Multiple vertex streams; absent slot zero falls back to vertexBuffer. */
  readonly vertexBuffers?: readonly (RenderBuffer | undefined)[];
  readonly vertexFormat?: VertexFormat;
  readonly vertexCount: number;
  readonly firstVertex?: number;
  readonly instanceCount?: number;
  readonly instanceAttributes?: readonly InstanceVertexAttribute[];
  readonly indexBuffer?: RenderBuffer;
  readonly indexType?: IndexType;
  readonly indexCount?: number;
  readonly firstIndex?: number;
  readonly shader?: RenderShaderProgram;
  readonly uniforms?: ReadonlyMap<string, TUniform>;
  /** Device-owned storage resources; this command borrows them until submitted work completes. */
  readonly nativeStorageBindings?: readonly NativeStorageBinding[];
}

export type NativeStorageBinding = {
  readonly name: string;
  readonly group: number;
  readonly binding: number;
} & (
  | { readonly kind: "storage-buffer"; readonly buffer: RenderBuffer; readonly offset?: number; readonly size?: number }
  | { readonly kind: "storage-texture"; readonly texture: Texture; readonly format?: string }
);

export interface InstanceVertexAttribute {
  readonly buffer: RenderBuffer;
  readonly shaderName: string;
  readonly components: 1 | 2 | 3 | 4;
  readonly offset: number;
  readonly stride: number;
  readonly normalized?: boolean;
  readonly divisor?: number;
}

export type UniformDataValue = number | boolean | Float32Array | Int32Array | Uint32Array
  | readonly UniformDataValue[] | { readonly [name: string]: UniformDataValue };
export type UniformValue = number | readonly number[] | Float32Array | Int32Array | Uint32Array | TextureBinding;
export type RecursiveUniformValue = UniformValue | UniformDataValue;

/** Overrides for one color attachment; omitted fields inherit the draw state. */
export interface RenderColorAttachmentState {
  readonly colorWrite?: readonly [boolean, boolean, boolean, boolean];
  readonly blendMode?: import("./contracts/blend").BlendMode;
}

export interface RenderCommandState {
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: "none" | "back" | "front";
  readonly frontFace?: "ccw" | "cw";
  readonly blend: boolean;
  readonly depthCompare: "always" | "less-equal";
  /** C-04 (PR 0a): named blend state; wins over `blend` when set. */
  readonly blendMode?: import("./contracts/blend").BlendMode;
  /** C-04 (PR 0a): full depth-compare vocabulary; wins over `depthCompare` when set. */
  readonly depthCompareV2?: import("./contracts/blend").DepthCompare;
  /**
   * Depth comparison and polygon offset are authored in standard-depth terms
   * unless this is true. Under an active reversed frame convention a device
   * flips ordering compares and the offset direction of every other state.
   */
  readonly depthConventionApplied?: boolean;
  /** PR 0a (PRD 04): MSAA alpha-to-coverage. */
  readonly alphaToCoverage?: boolean;
  readonly sampleMask?: number;
  readonly blendConstant?: readonly [number, number, number, number];
  readonly blendedDepthWrite?: "allow";
  readonly colorWrite?: readonly [boolean, boolean, boolean, boolean];
  /** Per-color-attachment overrides. Entries and fields omitted here inherit the global draw state. */
  readonly colorAttachments?: readonly (RenderColorAttachmentState | undefined)[];
  readonly scissor?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly polygonOffset?: {
    readonly factor: number;
    readonly units: number;
    readonly clamp?: number;
  } | null;
  readonly stencil?: {
    readonly compare?: "never" | "less" | "less-equal" | "greater" | "greater-equal" | "equal" | "not-equal" | "always";
    readonly reference?: number;
    readonly readMask?: number;
    readonly writeMask?: number;
    readonly fail?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
    readonly depthFail?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
    readonly depthPass?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
  } | null;
}

export type RenderDeviceCapability =
  | "buffers"
  | "buffer-readback"
  | "shader-validation"
  | "render-targets"
  | "pixel-readback"
  | "postprocess-presentation"
  | "draw-validation"
  | "rasterization"
  | "native-render-pipeline"
  | "native-sampled-textures"
  | "native-texture-readback"
  | "canvas-surface"
  | "hdr-render-targets"
  /** Blending into floating-point color attachments is available. */
  | "float-blending"
  | "float-readback"
  | "depth-render-targets"
  | "depth-textures"
  | "contact-shadows"
  | "spot-shadow-maps"
  | "point-shadow-maps"
  | "hdr-image-based-lighting"
  | "anisotropic-texture-filtering"
  | "production-pbr-parity"
  | "gpu-timing"
  | "webgpu-compute";

export interface RenderDeviceInfo {
  readonly backend: RenderBackendKind;
  readonly vendor: string;
  readonly renderer: string;
  /** Reported per-fragment-stage sampled texture-unit limit, when known. */
  readonly maxFragmentTextureUnits?: number;
  readonly capabilities?: readonly RenderDeviceCapability[];
  readonly limitations?: readonly string[];
}

export interface RenderDeviceDiagnostics {
  readonly drawCalls: number;
  readonly drawingPath?: {
    readonly requested: "forward" | "deferred" | "meshlet" | "visibility";
    readonly active: "forward" | "deferred" | "meshlet" | "visibility";
    readonly fallbackReason?: string;
    readonly drawCalls?: number;
    readonly triangles?: number;
    readonly trianglesAreUpperBound?: boolean;
    readonly computeDispatches?: number;
    readonly submittedMeshlets?: number;
    readonly culledMeshlets?: number;
  };
  /** Primitives submitted through `draw` and `multiDrawElementsInstanced` since the frame began: index (or vertex) count / 3 per triangle draw, times the instance count. */
  readonly triangles?: number;
  /** Same count for `lines` draws (count / 2) and `points` draws (count). */
  readonly lines?: number;
  readonly points?: number;
  readonly buffers: number;
  readonly shaders: number;
  /** C-28 (PR 0a): native program compiles this session. */
  readonly programCompileCount?: number;
  /** C-28 (PR 0a): readPixels calls this session. */
  readonly readPixelsCalls?: number;
  readonly renderTargets?: number;
  readonly textures?: number;
  readonly bufferBytes?: number;
  readonly textureBytes?: number;
  readonly approximateGpuMemoryBytes?: number;
  readonly disposedBuffers?: number;
  readonly disposedShaders?: number;
  readonly disposedRenderTargets?: number;
  readonly disposedTextures?: number;
  readonly compressedTextures?: number;
  readonly compressedTextureBytes?: number;
  readonly textureFallbacks?: number;
  readonly textureFallbackBytes?: number;
  readonly nativeSubmissions?: number;
  /** Native GPU render pipelines created by this device (cache misses, not draw calls). */
  readonly nativeRenderPipelinesCreated?: number;
  /** Native GPU render passes begun, including renderer-owned clear passes. */
  readonly nativeRenderPasses?: number;
  /** Native queue.writeTexture uploads, counted per uploaded mip/texture. */
  readonly nativeTextureUploads?: number;
  /** Successful native texture-to-buffer mapped readbacks. */
  readonly nativeTextureReadbacks?: number;
  readonly nativeTextureBindings?: number;
  readonly nativeGeneratedBasicSubmissions?: number;
  readonly nativeGeneratedTextureSubmissions?: number;
  readonly nativePassthroughSubmissions?: number;
  readonly nativePbrSubmissions?: number;
  readonly nativeInstancedSubmissions?: number;
  readonly nativeSkinnedSubmissions?: number;
  readonly nativeMorphSubmissions?: number;
  /** Most recent native bloom execution (muse3jsparity-PRD A1); null until a native bloom pass runs. */
  readonly bloom?: {
    readonly quality: "performance" | "balanced" | "cinematic";
    readonly mipCount: number;
    readonly targetCount: number;
    readonly targetBytes: number;
    readonly compositeGain: number;
    readonly threshold: number;
    readonly intensity: number;
    readonly softKnee: number;
    readonly shoulder: number;
    readonly halfFloat: boolean;
  } | null;
  readonly nativeEnvironmentBindings?: number;
  readonly nativeShadowMapBindings?: number;
  /** Cumulative native WebGPU fullscreen bloom passes (muse3jsparity-PRD J2). */
  readonly nativeBloomPasses?: number;
  /** Actual native temporal submissions and resource bindings observed by the device. */
  readonly nativeTemporalPasses?: number;
  readonly nativeTemporalBindings?: number;
  /** Cumulative native WebGPU fullscreen color-grade passes (muse3jsparity-PRD J2). */
  readonly nativeColorGradePasses?: number;
  /** Cumulative native WebGPU fullscreen FXAA passes (muse3jsparity-PRD J2). */
  readonly nativeFxaaPasses?: number;
  /**
   * Cumulative count of shadow depth render targets this device allocated. Live
   * `renderTargets` cannot answer "was a shadow map rendered?" because a shadow
   * pass may allocate and release its target within a frame, leaving zero live
   * targets behind.
   */
  readonly shadowRenderTargetsAllocated?: number;
  readonly samplerAnisotropyUploads?: number;
  readonly maxTextureAnisotropy?: number;
  readonly stateCacheIssued?: number;
  readonly stateCacheSkipped?: number;
  readonly stateCacheProgramSwitches?: number;
  readonly stateCacheTextureBinds?: number;
  readonly stateCacheBufferBinds?: number;
  readonly stateCacheVertexArrayBinds?: number;
  readonly stateCacheSamplerBinds?: number;
  readonly submittedObjects?: number;
  readonly visibleObjects?: number;
  readonly culledObjects?: number;
  readonly frustumTestedObjects?: number;
  readonly postprocessPasses?: number;
  readonly postprocessPassNames?: readonly string[];
  readonly postprocessTargetFormat?: "rgba8" | "rgba16f" | "rgba32f";
  readonly postprocessRenderTargets?: number;
  readonly postprocessTextures?: number;
  readonly postprocessTargetWidth?: number;
  readonly postprocessTargetHeight?: number;
  readonly maxRenderTargetSampleCount?: number;
  readonly postprocessPlan?: RendererPostprocessPlanDiagnostics;
  /** Frame-scoped native DoF submission; this does not establish rendered pixels. */
  readonly nativeDepthOfField?: {
    readonly requested: true;
    readonly depthPreparation: "submitted" | "not-observed";
    readonly effect: "submitted" | "not-observed";
    readonly pixelValidation: "not-established";
  };
  /**
   * PART U: live GPU target inventory — every render target, pyramid mip,
   * ping-pong pair, LUT, and history/scratch texture with bytes + lane owner,
   * populated by the mock, WebGL2, and WebGPU devices.
   */
  readonly gpuTargets?: readonly GpuTargetInventoryEntry[];
  readonly gpuTargetBytes?: number;
  readonly gpuTargetOverBudget?: boolean;
  readonly gpuTargetWarnings?: readonly string[];
  readonly lastError: string | null;
  readonly contextLost: boolean;
}

/**
 * PART U (muse3jsparity-PRD): lane owner of a live GPU allocation.
 *
 * Every render target, bloom-pyramid mip, ping-pong pair, lookup texture, and
 * history/scratch texture a lane adds must resolve to exactly one owner so the
 * lifecycle registry can answer "who allocated this and how many bytes does it
 * hold?" Labels are the device-side signal; {@link resolveGpuTargetOwner} is
 * the single mapping from label to owner.
 */
export type GpuTargetOwner =
  | "a1-bloom"
  | "a5-volumetric"
  | "b1-shadow"
  | "b4-reflection"
  | "c4-decal"
  | "g1-text"
  | "post"
  | "scene"
  | "unknown";

export type GpuTargetKind =
  | "render-target"
  | "pyramid-mip"
  | "pyramid-accumulator"
  | "ping-pong"
  | "lut"
  | "history"
  | "scratch";

export interface GpuTargetInventoryEntry {
  readonly label: string;
  readonly kind: GpuTargetKind;
  readonly bytes: number;
  readonly owner: GpuTargetOwner;
}

/**
 * Map a GPU allocation label to its lane owner (case-insensitive substring
 * match, most-specific first). Labels that carry no lane signal resolve to
 * `"scene"` when they look like an app/scene target and `"unknown"`
 * otherwise — never silently to a lane that did not allocate them.
 */
export function resolveGpuTargetOwner(label: string): GpuTargetOwner {
  const text = label.toLowerCase();
  if (text.includes("bloom")) return "a1-bloom";
  if (text.includes("volumetric")) return "a5-volumetric";
  if (text.includes("shadow")) return "b1-shadow";
  if (
    text.includes("mirror") ||
    text.includes("scene-color") ||
    text.includes("refraction") ||
    text.includes("reflection") ||
    text.includes("reflector") ||
    text.includes("refractor") ||
    text.includes("glass") ||
    text.includes("water")
  ) {
    return "b4-reflection";
  }
  if (text.includes("decal")) return "c4-decal";
  if (text.includes("sdf") || text.includes("glyph") || text.includes("text-atlas")) return "g1-text";
  if (
    text.includes("postprocess") ||
    text.includes("post-process") ||
    text.includes("tonemap") ||
    text.includes("tone-map") ||
    text.includes("fxaa") ||
    text.includes("outline") ||
    text.includes("ldr") ||
    text.includes("present") ||
    text.includes("dof") ||
    text.includes("depth-of-field") ||
    text.includes("motion-blur") ||
    text.includes("taa") ||
    text.includes("ssao") ||
    text.includes("ssr")
  ) {
    return "post";
  }
  if (text.includes("render-target") || text.includes("scene")) return "scene";
  return "unknown";
}

/**
 * Over-budget policy (same family as B5/D1 atlas and scatter budgets): warn
 * through data, never throw. 128 MiB holds a 4K HDR scene target (~66 MiB at
 * RGBA16F) plus a full cinematic bloom pyramid with headroom; anything past
 * it is a real excess worth surfacing, not a normal frame.
 */
export const GPU_TARGET_BUDGET_BYTES = 128 * 1024 * 1024;

export interface GpuTargetInventory {
  readonly targets: readonly GpuTargetInventoryEntry[];
  readonly totalBytes: number;
  readonly overBudget: boolean;
  readonly warnings: readonly string[];
}

/**
 * Spread a target list into the {@link RenderDeviceDiagnostics} inventory
 * fields so every device reports the same shape from one call.
 */
export function spreadGpuTargetInventory(entries: readonly GpuTargetInventoryEntry[]): {
  readonly gpuTargets: readonly GpuTargetInventoryEntry[];
  readonly gpuTargetBytes: number;
  readonly gpuTargetOverBudget: boolean;
  readonly gpuTargetWarnings: readonly string[];
} {
  const inventory = buildGpuTargetInventory(entries);
  return {
    gpuTargets: inventory.targets,
    gpuTargetBytes: inventory.totalBytes,
    gpuTargetOverBudget: inventory.overBudget,
    gpuTargetWarnings: inventory.warnings
  };
}

export function buildGpuTargetInventory(entries: readonly GpuTargetInventoryEntry[]): GpuTargetInventory {
  const targets = [...entries];
  const totalBytes = targets.reduce((total, entry) => total + entry.bytes, 0);
  const overBudget = totalBytes > GPU_TARGET_BUDGET_BYTES;
  const warnings: string[] = [];
  if (overBudget) {
    const owners = [...new Set(targets.map((entry) => entry.owner))].sort().join(",");
    warnings.push(
      `GPU target budget exceeded: ${totalBytes} bytes across ${targets.length} live targets (owners: ${owners}); budget is ${GPU_TARGET_BUDGET_BYTES}.`
    );
  }
  return { targets, totalBytes, overBudget, warnings };
}

export interface RenderDevice {
  readonly kind: RenderBackendKind;
  readonly info: RenderDeviceInfo;
  readonly disposed: boolean;
  readonly contextLost: boolean;
  /** Identity of the current successful frame; absent on devices without this capability. */
  readonly activeFrameToken?: object | null;
  /** Increments when the native context/device and all its resources change. */
  readonly generation?: number;
  /** Listener registration returns a function which removes that listener. */
  onDeviceLost?(listener: () => void): () => void;
  onDeviceRestored?(listener: () => void): () => void;
  /** Select an output color space when supported, otherwise report the active fallback. */
  negotiateOutputColorSpace?(requested?: RenderOutputColorSpace): RenderOutputColorSpaceNegotiation;
  /** Select verified sRGB for a presentation route that cannot encode the requested gamut. */
  negotiateSrgbOutputFallback?(requested: "display-p3", reason: string): RenderOutputColorSpaceNegotiation;
  /** Inspect the last negotiation without changing the output context. */
  getOutputColorSpaceNegotiation?(): RenderOutputColorSpaceNegotiation | undefined;
  /** Alpha association of the presentation surface, if verified by the backend. */
  getPresentationAlphaMode?(): "opaque" | "straight" | "premultiplied" | undefined;
  /** Present only after the backend implements native DoF and its frame proof. */
  canPresentNativeDepthOfField?(): boolean;
  beginNativeDepthOfFieldFrame?(descriptor: NativeWebGPUDofFrameDescriptor): NativeWebGPUDofFrame;
  sealNativeDepthOfFieldFrame?(frame: NativeWebGPUDofFrame): void;
  cancelNativeDepthOfFieldFrame?(frame: NativeWebGPUDofFrame): void;
  /** Validate the device-issued token, tracked frame and native source identity. */
  validateNativeDepthOfFieldFrame?(frame: NativeWebGPUDofFrame, source: RenderTarget): boolean;
  /** Read this device's submission state for the exact issued frame, including after cancellation. */
  getNativeDepthOfFieldFrameSubmission?(frame: NativeWebGPUDofFrame): NativeWebGPUDofFrameSubmission | undefined;
  /** Set the convention for subsequently encoded scene/shadow passes. */
  setDepthConvention?(convention: import("./DepthConvention").DepthConvention): void;
  getDepthConvention?(): import("./DepthConvention").DepthConvention;
  /** Reversed-Z precision the device can deliver (clip range and float depth support). */
  getDepthPrecisionSupport?(): import("./DepthConvention").DepthPrecisionSupport;

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer;
  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void;
  /** C-08 (PRD 01): bind a `"uniform"` buffer to a UBO binding point (gl.bindBufferBase). */
  bindUniformBuffer?(buffer: RenderBuffer, binding: number): void;
  readBuffer(buffer: RenderBuffer, byteOffset?: number, byteLength?: number): Uint8Array;
  createShaderProgram(sources: ShaderSources): RenderShaderProgram;
  /** Optional native asynchronous validation, currently implemented by WebGPU. */
  getShaderCompilationDiagnostics?(sources: ShaderSources): Promise<readonly ShaderCompilationDiagnostic[]>;
  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  /** Generate the target's allocated color mips after level zero has been written. */
  generateRenderTargetMipmaps?(target: RenderTarget): void;
  /** Draw a transmission copy, verifying backend submission where supported. */
  drawTransmissionCapture?(command: DrawCommand): void;
  /** Draw and verify that the backend accepted a real submission. */
  drawChecked?(command: DrawCommand): void;
  /** Optional portable-schema draw. Unsupported backends must omit this capability. */
  drawPortable?(command: DrawCommand<RecursiveUniformValue>, checked?: boolean): void;
  /** Internal, forward-only point-quad submission; unsupported backends omit it. */
  drawNativePointQuads?(command: DrawCommand, context: import("./webgpu/NativePointQuads").NativePointQuadSubmission): void;
  /** Synchronous, same-device 2D single-sample color copy; does not alter target state. */
  copyRenderTargetColorRegion?(source: RenderTarget, destination: RenderTarget, region: RenderTargetColorRegion): void;
  /** Async transfers retain device ownership of inputs; abort discards staging/results. */
  copyRenderTarget?(options: RenderResourceCopyOptions): Promise<void>;
  resolveRenderTarget?(options: RenderResourceCopyOptions): Promise<void>;
  /** Read a single-sample RGBA8 attachment without changing the active target. */
  readRenderTarget?(options: RenderResourceReadbackOptions): Promise<Uint8Array>;
  /**
   * Read a resolved rgba16f/rgba32f color attachment without changing the
   * active target. Rows are bottom-to-top, as in readFloatPixels. The target
   * must be an owned, live 2D target or a concrete layer view. Cancellation
   * discards the result, not the target or already submitted GPU work.
   */
  readFloatRenderTarget?(options: RenderResourceReadbackOptions): Promise<Float32Array>;
  setRenderTarget(target: RenderTarget | null): void;
  /** The currently bound render target, or null for the default framebuffer.
   *  Optional (PRD-07 P6-T4): offscreen mini-passes that divert mid-frame need
   *  it to restore the caller's binding; when absent they must stay off. */
  getRenderTarget?(): RenderTarget | null;
  /**
   * threejs-parity L7/SC-01 (P2, Array/Stereo cameras): raster viewport rect
   * in target pixels, origin bottom-left. By default it is frame-scoped:
   * `beginFrame` resets it to the full frame and it only applies while the
   * target it was set on stays bound. With `{ persistent: true }` (XR) it is
   * scoped to the default (canvas / external) framebuffer instead and survives
   * `beginFrame` and the post/present passes until `resetViewport()`.
   * Optional — devices without it keep full-frame rasterization.
   */
  setViewport?(x: number, y: number, width: number, height: number, options?: RenderDeviceViewportOptions): void;
  /**
   * Clears the persistent viewport and any frame-scoped viewport override
   * (XR session end, or a caller handing the device back).
   */
  resetViewport?(): void;
  /**
   * XR: frames draw into `framebuffer` (e.g. an `XRWebGLLayer` framebuffer,
   * `width` x `height` pixels) instead of the canvas until this is called with
   * `null`. Optional — devices without it can only draw to the canvas.
   */
  setExternalFramebuffer?(framebuffer: unknown | null, width: number, height: number): void;
  /** True when a retained viewport or external framebuffer overrides default output. */
  hasDefaultOutputOverride?(): boolean;
  /** threejs-parity L7/SC-01 (P2): scissor rect in target pixels; gated by `setScissorTest`. */
  setScissor?(x: number, y: number, width: number, height: number): void;
  /** threejs-parity L7/SC-01 (P2): enables/disables scissor clipping (three's `setScissorTest`). */
  setScissorTest?(enabled: boolean): void;
  writeRenderTargetPixels?(target: RenderTarget, pixels: Uint8Array): void;
  presentRenderTarget?(source: RenderTarget): void;
  presentLdrPostprocess?(source: RenderTarget, options: LdrPostprocessPresentationOptions): void;
  /** Release one view's native temporal-effect history when its owner retires. */
  releaseNativePostEffectView?(scopeId: object, viewId: string | number): void;
  /** Release all native temporal-effect histories for one renderer scope. */
  releaseNativePostEffectScope?(scopeId: object): void;
  readPixels(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array;
  readPixelsAsync?(x: number, y: number, width: number, height: number): Promise<Uint8Array>;
  /** Resolve only when all previously submitted native GPU work has completed. */
  waitForSubmittedWork?(): Promise<void>;
  /**
   * Read the active target in bottom-left coordinates, returning bottom-to-top
   * RGBA rows. Attachment defaults to 0; rgba8 values are normalized. Real
   * WebGPU only supports the asynchronous variant.
   */
  readFloatPixels(x: number, y: number, width: number, height: number, attachment?: number): Float32Array;
  readFloatPixelsAsync?(x: number, y: number, width: number, height: number, attachment?: number): Promise<Float32Array>;
  readDepthPixels?(x: number, y: number, width: number, height: number): Float32Array;
  beginFrame(width: number, height: number): void;
  clear(color: readonly [number, number, number, number]): void;
  /** Clear the active render target; `attachment` (MRT) clears only that draw buffer via clearBufferfv. */
  clearRenderTarget?(color: readonly [number, number, number, number], attachment?: number): void;
  draw(command: DrawCommand): void;
  endFrame(): void;
  captureState(): ReadonlyMap<string, string | number | boolean | null>;
  getDiagnostics(): RenderDeviceDiagnostics;
  /**
   * Live, undisposed texture handles this device currently holds (uploaded
   * textures plus live render-target attachments). Read-only inventory for
   * inspectors; it never uploads, allocates or reads back pixels.
   */
  getLiveTextures?(): readonly Texture[];
  dispose(): void;
  /**
   * Observe the current device disposal attempt, including native retirement.
   * This does not initiate disposal or retry failed cleanup. Devices without
   * asynchronous retirement may omit it.
   */
  whenDisposed?(): Promise<void>;
  /** C-13 (PR 0a): run a post graph natively; undefined until PRD 03 provides it. */
  executePostGraph?(graph: unknown): void;
  /** C-28 (PR 0a): device capability probe. */
  readonly probe?: import("./contracts/device").DeviceProbe;
  /**
   * C-28 (PR 0a): frame counters — measured, never estimated.
   *
   * Per-frame fields (`drawCalls`, `bufferCreates`, `textureUploads`,
   * `readbacks`, `renderTargetsCreated`, `programCompiles`) accumulate between
   * `resetFrameCounters()` calls, i.e. they describe "this frame so far".
   * Live gauges (`liveBuffers`, `liveVertexArrays`, `textureBytes`,
   * `renderTargetBytes`) are instantaneous device state and are never reset.
   */
  counters?(): import("./contracts/device").DeviceCounters;
  /**
   * Zeroes the per-frame counter fields only; live gauges are unaffected.
   * Called once per render frame by the `A3D_QR_TIERS` frame contributor at
   * `collect`, before `FrameStats.begin`.
   */
  resetFrameCounters?(): void;
  /** C-02 (PR 0a): asynchronous shader compile when the backend supports it. */
  compileAsync?(sources: ShaderSources): Promise<RenderShaderProgram>;
  /** PR 0a (PRD 06/09): instanced multi-draw when the backend supports it. */
  multiDrawElementsInstanced?(draws: readonly unknown[]): void;
}

export class RenderDeviceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = "RenderDeviceError";
  }
}

const SHADER_LOG_MAX_LINES = 6;
const SHADER_LOG_MAX_CHARS = 900;

/**
 * Message for a failed shader compile: the first lines of the driver info log
 * go in the text (a thrown error shows "ERROR: 0:12: 'u_time' : redefinition"
 * instead of only "WebGL shader compile failed"). The full log stays on
 * `RenderDeviceError.details.log`.
 */
export function shaderCompileFailureMessage(log: string, context: { readonly label?: string; readonly stage?: string } = {}): string {
  const lines = log.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
  const where = [context.label, context.stage].filter((part): part is string => typeof part === "string" && part.length > 0).join(", ");
  const head = `WebGL shader compile failed${where ? ` (${where})` : ""}`;
  if (lines.length === 0) return head;
  let body = lines.slice(0, SHADER_LOG_MAX_LINES).join("\n");
  const truncated = lines.length > SHADER_LOG_MAX_LINES || body.length > SHADER_LOG_MAX_CHARS;
  if (body.length > SHADER_LOG_MAX_CHARS) body = body.slice(0, SHADER_LOG_MAX_CHARS);
  return `${head}:\n${body}${truncated ? "\n…" : ""}`;
}

export class MockRenderBuffer implements RenderBuffer {
  public disposed = false;
  public readonly bytes: Uint8Array;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    initialData?: ArrayBufferView
  ) {
    this.bytes = new Uint8Array(byteLength);
    if (initialData) {
      if (initialData.byteLength > byteLength) {
        throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", {
          byteLength,
          dataByteLength: initialData.byteLength
        });
      }
      this.bytes.set(viewBytes(initialData), 0);
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}

export class MockShaderProgram implements RenderShaderProgram {
  public disposed = false;

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

export class MockRenderTarget implements RenderTarget {
  public disposed = false;
  public readonly colorPixels: Uint8Array;
  public readonly colorFloatPixels: Float32Array | null;
  public readonly depthPixels: Float32Array | null;
  public readonly dimension: "2d" | "cube" | "2d-array" | "3d";
  public readonly layers?: number;
  public readonly colorTextures?: readonly Texture[];
  public layerTargets?: readonly RenderTarget[];
  public readonly attachmentLayer: number;
  public readonly attachmentMipLevel = 0;
  public readonly depthOnly: boolean;
  /** MRT attachments 1..n (attachment 0 lives in colorPixels/colorFloatPixels). */
  public readonly attachmentPixels: readonly Uint8Array[];
  public readonly attachmentFloatPixels: readonly (Float32Array | null)[];
  private readonly layerChild: boolean;
  /** Set by the mock when a float depth request is honored. */
  public depthStorage?: import("./DepthConvention").DepthStorage;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture?: Texture,
    public readonly sampleCount = 1,
    options: {
      readonly dimension?: "2d" | "cube" | "2d-array" | "3d";
      readonly layers?: number;
      readonly colorTextures?: readonly Texture[];
      readonly colorPixels?: Uint8Array;
      readonly colorFloatPixels?: Float32Array | null;
      readonly depthPixels?: Float32Array | null;
      readonly attachmentPixels?: readonly Uint8Array[];
      readonly attachmentFloatPixels?: readonly (Float32Array | null)[];
      readonly layerChild?: boolean;
      readonly attachmentLayer?: number;
      readonly depthOnly?: boolean;
    } = {}
  ) {
    this.colorPixels = options.colorPixels ?? new Uint8Array(width * height * 4);
    this.colorFloatPixels = options.colorFloatPixels !== undefined ? options.colorFloatPixels
      : colorTexture.format === "rgba16f" || colorTexture.format === "rgba32f"
        ? new Float32Array(width * height * 4) : null;
    this.depthPixels = options.depthPixels !== undefined ? options.depthPixels
      : depthTexture ? new Float32Array(width * height).fill(1) : null;
    this.dimension = options.dimension ?? "2d";
    this.layers = options.layers;
    this.colorTextures = options.colorTextures;
    const extras = (options.colorTextures ?? []).slice(1);
    this.attachmentPixels = options.attachmentPixels ?? extras.map(() => new Uint8Array(width * height * 4));
    this.attachmentFloatPixels = options.attachmentFloatPixels ?? extras.map((texture) =>
      texture.format === "rgba16f" || texture.format === "rgba32f" ? new Float32Array(width * height * 4) : null);
    this.layerChild = options.layerChild === true;
    this.attachmentLayer = options.attachmentLayer ?? 0;
    this.depthOnly = options.depthOnly === true;
  }

  dispose(): void {
    this.disposed = true;
    if (!this.layerChild) {
      this.colorTexture.dispose();
      for (const texture of this.colorTextures ?? []) {
        if (texture !== this.colorTexture) texture.dispose();
      }
      this.depthTexture?.dispose();
      for (const child of this.layerTargets ?? []) {
        (child as MockRenderTarget).disposed = true;
      }
    }
  }
}

export interface MockViewportCall {
  readonly call: "viewport" | "scissor" | "scissorTest" | "resetViewport" | "externalFramebuffer";
  readonly args: readonly (number | boolean)[];
  /** `viewport` only: true when set with `{ persistent: true }`. */
  readonly persistent?: boolean;
}

export interface MockDrawViewState {
  readonly viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  /** XR external framebuffer handle the draw went to (null for the canvas or a render target). */
  readonly framebuffer: unknown | null;
  readonly destination: "canvas" | "external" | "render-target";
}

export interface RenderDeviceViewportOptions {
  /** XR: scope to the default (canvas / external) framebuffer and survive `beginFrame` and post/present passes until `resetViewport()`. */
  readonly persistent?: boolean;
}

export class MockRenderDevice implements RenderDevice {
  public readonly kind = "mock";
  public readonly info: RenderDeviceInfo = {
    backend: "mock",
    vendor: "aura3d",
    renderer: "mock-render-device",
    capabilities: ["buffers", "buffer-readback", "shader-validation", "render-targets", "pixel-readback", "postprocess-presentation", "draw-validation", "spot-shadow-maps", "depth-render-targets", "depth-textures"],
    limitations: ["Mock render device validates commands and readback contracts but does not rasterize geometry."]
  };

  public disposed = false;
  private contextLostValue = false;
  private frameToken: object | null = null;
  get contextLost(): boolean { return this.contextLostValue; }
  set contextLost(value: boolean) {
    this.contextLostValue = value;
    if (value) this.frameToken = null;
  }
  get activeFrameToken(): object | null {
    return this.frameActive && !this.disposed && !this.contextLost ? this.frameToken : null;
  }
  public readonly drawCommands: DrawCommand[] = [];
  private nextId = 1;
  private buffers = new Set<MockRenderBuffer>();
  private shaders = new Set<MockShaderProgram>();
  private renderTargets = new Set<MockRenderTarget>();
  private activeRenderTarget: MockRenderTarget | null = null;
  private backbufferPixels: Uint8Array | null = null;
  private backbufferWidth = 0;
  private backbufferHeight = 0;
  private lastError: string | null = null;
  private frameActive = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  /** threejs-parity L7/SC-01: per-frame viewport/scissor rects (target pixels). */
  private viewportRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private scissorRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } = { x: 0, y: 0, width: 0, height: 0 };
  private scissorTestEnabled = false;
  /** SC-01: render target the viewport/scissor override was set on (null = default framebuffer); the override only applies while it is bound. */
  private viewStateTarget: MockRenderTarget | null = null;
  /** XR: persistent viewport for the default framebuffer; survives `beginFrame`. */
  private persistentViewportRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null = null;
  /** XR: framebuffer frames draw into instead of the canvas. */
  private externalFramebuffer: { readonly handle: unknown; readonly width: number; readonly height: number } | null = null;
  /** True once a frame-scoped `setViewport` ran this frame (cleared by `beginFrame` / `resetViewport`). */
  private frameViewportSet = false;
  private viewportCallLog: Array<MockViewportCall> = [];
  private drawViewStateLog: MockDrawViewState[] = [];
  private clearColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  /** C-28 (PRD 11): per-frame fields; zeroed by resetFrameCounters(). Live gauges come from getDiagnostics(). */
  private frameCounters = { drawCalls: 0, bufferCreates: 0, textureUploads: 0, readbacks: 0, renderTargetsCreated: 0, programCompiles: 0 };
  public readonly uniformBufferBindings: { bufferId: number; binding: number }[] = [];
  private outputColorSpaceNegotiation: RenderOutputColorSpaceNegotiation | undefined;

  negotiateOutputColorSpace(requested: RenderOutputColorSpace = "srgb"): RenderOutputColorSpaceNegotiation {
    const result: RenderOutputColorSpaceNegotiation = requested === "srgb"
      ? { requested, active: "srgb", supported: ["srgb"] }
      : { requested, active: "srgb", supported: ["srgb"], fallbackReason: "Mock device supports sRGB only" };
    this.outputColorSpaceNegotiation = result;
    return result;
  }

  getOutputColorSpaceNegotiation(): RenderOutputColorSpaceNegotiation | undefined {
    return this.outputColorSpaceNegotiation;
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }
    const buffer = new MockRenderBuffer(this.nextId++, usage, byteLength, initialData);
    this.buffers.add(buffer);
    this.frameCounters.bufferCreates += 1;
    return buffer;
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.assertAlive();
    const mockBuffer = this.requireMockBuffer(buffer);
    if (mockBuffer.disposed) {
      throw new RenderDeviceError("Cannot update a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset + data.byteLength > mockBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: mockBuffer.byteLength
      });
    }
    mockBuffer.bytes.set(viewBytes(data), byteOffset);
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    const mockBuffer = this.requireMockBuffer(buffer);
    if (mockBuffer.disposed) {
      throw new RenderDeviceError("Cannot read a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > mockBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: mockBuffer.byteLength
      });
    }
    return mockBuffer.bytes.slice(byteOffset, byteOffset + byteLength);
  }

  bindUniformBuffer(buffer: RenderBuffer, binding: number): void {
    this.assertAlive();
    const mockBuffer = this.requireMockBuffer(buffer);
    if (mockBuffer.disposed) {
      throw new RenderDeviceError("Cannot bind a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    if (mockBuffer.usage !== "uniform") {
      throw new RenderDeviceError("Buffer was not created with usage 'uniform'", "INVALID_BUFFER_USAGE", { bufferId: buffer.id });
    }
    this.uniformBufferBindings.push({ bufferId: buffer.id, binding });
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.assertAlive();
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
    const program = new MockShaderProgram(this.nextId++, sources.label, sources.marker, reflectShaderSources(sources));
    this.shaders.add(program);
    this.frameCounters.programCompiles += 1;
    return program;
  }

  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    this.assertAlive();
    validateRenderTargetDescriptor(descriptor);
    if ((descriptor.mipLevelCount ?? 1) > 1) throw new RenderDeviceError("Mock render targets do not support mip generation", "RENDER_TARGET_MIPMAP_UNSUPPORTED");
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
    const label = descriptor.label ?? "render-target";
    const dimension = descriptor.dimension ?? "2d";
    if (!Number.isInteger(descriptor.sampleCount ?? 1) || (descriptor.sampleCount ?? 1) < 1) {
      throw new RenderDeviceError("Render target sampleCount must be a positive integer", "INVALID_RENDER_TARGET_SAMPLE_COUNT");
    }
    if (descriptor.layers !== undefined && (!Number.isInteger(descriptor.layers) || descriptor.layers < 1)) {
      throw new RenderDeviceError("Render target layer count must be a positive integer", "INVALID_RENDER_TARGET_SIZE", {
        layers: descriptor.layers,
        label
      });
    }
    if (descriptor.layers !== undefined && dimension !== "2d-array" && dimension !== "3d") {
      throw new RenderDeviceError("Render target `layers` only applies to dimension \"2d-array\" or \"3d\"", "INVALID_RENDER_TARGET_SIZE", {
        dimension,
        layers: descriptor.layers,
        label
      });
    }
    const depthOnly = descriptor.depthOnly === true;
    if (depthOnly && (descriptor.colorAttachments?.length ?? 0) > 0) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `colorAttachments`", "INVALID_RENDER_TARGET_SIZE", {
        label
      });
    }
    if (depthOnly && descriptor.depth === false) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `depth: false`", "INVALID_RENDER_TARGET_SIZE", {
        label
      });
    }
    const layerCount = dimension === "cube" ? 6 : dimension === "2d-array" || dimension === "3d" ? descriptor.layers ?? 1 : 1;
    const colorAttachmentCount = depthOnly ? 0 : Math.max(1, descriptor.colorAttachments?.length ?? 1);
    const volume = dimension === "3d" ? { depth: layerCount } : { layers: layerCount > 1 ? layerCount : undefined };
    const colorTextures: Texture[] = [];
    const attachmentPixels: Uint8Array[] = [];
    for (let attachment = 0; attachment < colorAttachmentCount; attachment += 1) {
      const format = descriptor.colorAttachments?.[attachment]?.format ?? descriptor.format ?? "rgba8";
      const textureLabel = colorAttachmentCount > 1 ? `${label}-color-${attachment}` : descriptor.label ?? "render-target-color";
      colorTextures.push(new Texture({ width: descriptor.width, height: descriptor.height, format, label: textureLabel, dimension, ...volume, renderAttachment: true }));
      if (attachment > 0) attachmentPixels.push(new Uint8Array(descriptor.width * descriptor.height * 4));
    }
    const colorTexture = colorTextures[0] ?? new Texture({ width: descriptor.width, height: descriptor.height, format: "rgba8", label: `${label}-colorless`, dimension, renderAttachment: true });
    const depthTexture = depthOnly || descriptor.depth === "texture" || descriptor.depthCompare
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${label}-depth`, dimension, layers: layerCount > 1 ? layerCount : undefined, renderAttachment: true })
      : undefined;
    const target = new MockRenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      label,
      colorTexture,
      depthTexture,
      descriptor.sampleCount ?? 1,
      {
        dimension,
        layers: layerCount > 1 ? layerCount : undefined,
        colorTextures: colorTextures.length > 1 ? colorTextures : undefined,
        attachmentPixels,
        depthOnly
      }
    );
    if (descriptor.depthPrecision === "float" && descriptor.depth !== false && this.depthPrecisionSupport.floatDepth
      && (descriptor.stencil === false || this.depthPrecisionSupport.floatDepthStencil)) target.depthStorage = "float";
    // Children below share these same attachment identities with the parent.
    for (const texture of new Set([target.colorTexture, ...(target.colorTextures ?? []), ...(target.depthTexture ? [target.depthTexture] : [])])) {
      claimRenderTargetTextureOwner(texture, this);
    }
    if (layerCount > 1) {
      const children: RenderTarget[] = [];
      for (let layer = 0; layer < layerCount; layer += 1) {
        const child = new MockRenderTarget(
          this.nextId++,
          descriptor.width,
          descriptor.height,
          `${label}-layer-${layer}`,
          colorTexture,
          depthTexture,
          descriptor.sampleCount ?? 1,
          {
            dimension, layers: 1, colorTextures: target.colorTextures, layerChild: true, attachmentLayer: layer, depthOnly,
            // The parent framebuffer represents layer zero, just like WebGL.
            ...(layer === 0 ? {
              colorPixels: target.colorPixels, colorFloatPixels: target.colorFloatPixels, depthPixels: target.depthPixels,
              attachmentPixels: target.attachmentPixels, attachmentFloatPixels: target.attachmentFloatPixels
            } : {})
          }
        );
        children.push(child);
        this.renderTargets.add(child);
      }
      target.layerTargets = children;
    }
    this.renderTargets.add(target);
    this.frameCounters.renderTargetsCreated += 1;
    return target;
  }

  copyRenderTargetColorRegion(sourceTarget: RenderTarget, destinationTarget: RenderTarget, region: RenderTargetColorRegion): void {
    this.assertAlive();
    const source = this.requireMockRenderTarget(sourceTarget);
    const destination = this.requireMockRenderTarget(destinationTarget);
    const { sourceX, sourceY, destinationX, destinationY, width, height } = region;
    if (![sourceX, sourceY, destinationX, destinationY, width, height].every(Number.isSafeInteger)
      || sourceX < 0 || sourceY < 0 || destinationX < 0 || destinationY < 0 || width <= 0 || height <= 0
      || sourceX > source.width || sourceY > source.height || destinationX > destination.width || destinationY > destination.height
      || width > source.width - sourceX || height > source.height - sourceY
      || width > destination.width - destinationX || height > destination.height - destinationY) {
      throw new RenderDeviceError("Color-copy rectangle is invalid or out of bounds", "INVALID_RESOURCE_COPY", { region });
    }
    if (source === destination || source.colorTexture === destination.colorTexture || source.depthOnly || destination.depthOnly
      || source.colorTexture.disposed || destination.colorTexture.disposed
      || source.dimension !== "2d" || destination.dimension !== "2d" || source.sampleCount !== 1 || destination.sampleCount !== 1
      || source.colorTexture.format !== destination.colorTexture.format) {
      throw new RenderDeviceError("Color-copy targets must be distinct, live, single-sampled 2D attachments of equal format", "INVALID_RESOURCE_COPY");
    }
    for (let row = 0; row < height; row += 1) {
      const src = ((sourceY + row) * source.width + sourceX) * 4;
      const dst = ((destinationY + row) * destination.width + destinationX) * 4;
      destination.colorPixels.set(source.colorPixels.subarray(src, src + width * 4), dst);
      if (source.colorFloatPixels && destination.colorFloatPixels) {
        destination.colorFloatPixels.set(source.colorFloatPixels.subarray(src, src + width * 4), dst);
      }
    }
  }

  async copyRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    this.assertAlive();
    throwIfResourceTransferAborted(options.signal);
    const source = this.requireMockRenderTarget(options.source);
    const destination = this.requireMockRenderTarget(options.destination);
    const aspect = options.aspect ?? "color";
    const srcIdentity = getRenderAttachmentIdentity(source, aspect, options.sourceAttachment ?? 0);
    const dstIdentity = getRenderAttachmentIdentity(destination, aspect, options.destinationAttachment ?? 0);
    if (source.width !== destination.width || source.height !== destination.height || srcIdentity.format !== dstIdentity.format) {
      throw new RenderDeviceError("Copy attachments must have identical size and format", "INVALID_RESOURCE_COPY");
    }
    if (dstIdentity.sampleCount !== 1 || (srcIdentity.sampleCount > 1 && aspect !== "color")) {
      throw new RenderDeviceError("Copy requires a single-sample destination and can resolve only multisampled color", "INVALID_RESOURCE_COPY");
    }
    validateRenderAttachmentAccess([srcIdentity], [dstIdentity]);
    // Yield before taking the copy so an aborted call cannot alter destination.
    await Promise.resolve();
    throwIfResourceTransferAborted(options.signal);
    this.assertAlive();
    this.requireMockRenderTarget(source);
    this.requireMockRenderTarget(destination);
    if (aspect === "depth") {
      if (!source.depthPixels || !destination.depthPixels) throw new RenderDeviceError("Depth copy requires depth textures", "INVALID_RESOURCE_COPY");
      destination.depthPixels.set(source.depthPixels);
    } else {
      const src = mockAttachmentPixels(source, options.sourceAttachment ?? 0);
      const dst = mockAttachmentPixels(destination, options.destinationAttachment ?? 0);
      dst.set(src);
      const srcFloat = mockAttachmentFloatPixels(source, options.sourceAttachment ?? 0);
      const dstFloat = mockAttachmentFloatPixels(destination, options.destinationAttachment ?? 0);
      if (srcFloat && dstFloat) dstFloat.set(srcFloat);
    }
  }

  async resolveRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    if ((options.source.sampleCount ?? 1) <= 1 || (options.destination.sampleCount ?? 1) !== 1 || (options.aspect ?? "color") !== "color") {
      throw new RenderDeviceError("Resolve requires multisampled color source and single-sampled destination", "INVALID_RESOURCE_RESOLVE");
    }
    await this.copyRenderTarget(options);
  }

  async readRenderTarget(options: RenderResourceReadbackOptions): Promise<Uint8Array> {
    this.assertAlive();
    throwIfResourceTransferAborted(options.signal);
    const target = this.requireMockRenderTarget(options.target);
    const identity = getRenderAttachmentIdentity(target, "color", options.attachment ?? 0);
    if (identity.format !== "rgba8") throw new RenderDeviceError("Byte readback requires rgba8; use float readback for float targets", "INVALID_RESOURCE_READBACK");
    if ((target.sampleCount ?? 1) !== 1) throw new RenderDeviceError("Resolve multisampled targets before readback", "INVALID_RESOURCE_READBACK");
    await Promise.resolve();
    throwIfResourceTransferAborted(options.signal);
    this.assertAlive();
    this.requireMockRenderTarget(target);
    this.frameCounters.readbacks += 1;
    return mockAttachmentPixels(target, options.attachment ?? 0).slice();
  }

  async readFloatRenderTarget(options: RenderResourceReadbackOptions): Promise<Float32Array> {
    this.assertAlive();
    throwIfResourceTransferAborted(options.signal);
    const target = this.requireMockRenderTarget(options.target);
    const attachment = options.attachment ?? 0;
    const identity = getRenderAttachmentIdentity(target, "color", attachment);
    if (identity.format !== "rgba16f" && identity.format !== "rgba32f") {
      throw new RenderDeviceError("Float target readback requires an rgba16f or rgba32f color attachment", "INVALID_RESOURCE_READBACK");
    }
    if (target.layerTargets?.length) {
      throw new RenderDeviceError("Select a concrete render-target layer before readback", "INVALID_RESOURCE_READBACK");
    }
    await Promise.resolve();
    throwIfResourceTransferAborted(options.signal);
    this.assertAlive();
    this.requireMockRenderTarget(target);
    getRenderAttachmentIdentity(target, "color", attachment);
    this.frameCounters.readbacks += 1;
    return this.readFloatPixelsImpl(target, 0, 0, target.width, target.height, attachment);
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.assertAlive();
    if (target === null) {
      this.activeRenderTarget = null;
      return;
    }
    if (!(target instanceof MockRenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.activeRenderTarget = target;
  }

  getRenderTarget(): RenderTarget | null {
    return this.activeRenderTarget;
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.assertAlive();
    const mockTarget = this.requireMockRenderTarget(target);
    if (pixels.length !== mockTarget.width * mockTarget.height * 4) {
      throw new RenderDeviceError("Render-target pixel upload must contain width * height * 4 bytes", "INVALID_PIXEL_UPLOAD_SIZE", {
        targetId: target.id,
        byteLength: pixels.length,
        expectedByteLength: mockTarget.width * mockTarget.height * 4
      });
    }
    mockTarget.colorPixels.set(pixels);
    this.frameCounters.textureUploads += 1;
    if (mockTarget.colorFloatPixels) {
      for (let index = 0; index < pixels.length; index += 4) {
        mockTarget.colorFloatPixels[index] = (pixels[index] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 1] = (pixels[index + 1] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 2] = (pixels[index + 2] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 3] = (pixels[index + 3] ?? 0) / 255;
      }
    }
  }

  presentRenderTarget(source: RenderTarget): void {
    this.assertAlive();
    const mockSource = this.requireMockRenderTarget(source);
    this.backbufferPixels = new Uint8Array(mockSource.colorPixels);
    this.backbufferWidth = mockSource.width;
    this.backbufferHeight = mockSource.height;
    this.activeRenderTarget = null;
  }

  readPixels(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array {
    this.frameCounters.readbacks += 1;
    return this.readPixelsImpl(x, y, width, height, attachment);
  }

  private readPixelsImpl(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const output = new Uint8Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (target && attachment !== undefined) {
      const pixels = attachment === 0 ? target.colorPixels : target.attachmentPixels[attachment - 1];
      if (!pixels) {
        throw new RenderDeviceError("Render target has no color attachment at the requested index", "INVALID_RENDER_TARGET_SIZE", {
          attachment,
          attachments: target.attachmentPixels.length + 1
        });
      }
      for (let row = 0; row < height; row += 1) {
        const sourceOffset = ((y + row) * target.width + x) * 4;
        output.set(pixels.subarray(sourceOffset, sourceOffset + width * 4), row * width * 4);
      }
      return output;
    }
    if (!target) {
      if (this.backbufferPixels) {
        if (x + width > this.backbufferWidth || y + height > this.backbufferHeight) {
          throw new RenderDeviceError("Readback rectangle exceeds backbuffer bounds", "READBACK_OUT_OF_BOUNDS", {
            x,
            y,
            width,
            height,
            boundsWidth: this.backbufferWidth,
            boundsHeight: this.backbufferHeight
          });
        }
        for (let row = 0; row < height; row += 1) {
          const sourceOffset = ((y + row) * this.backbufferWidth + x) * 4;
          const destOffset = row * width * 4;
          output.set(this.backbufferPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
        }
        return output;
      }
      const bytes = rgbaBytes(this.clearColor);
      for (let i = 0; i < output.length; i += 4) output.set(bytes, i);
      return output;
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
    }
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = ((y + row) * target.width + x) * 4;
      const destOffset = row * width * 4;
      output.set(target.colorPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
    }
    return output;
  }

  readFloatPixels(x: number, y: number, width: number, height: number, attachment?: number): Float32Array {
    this.frameCounters.readbacks += 1;
    this.assertAlive();
    return this.readFloatPixelsImpl(this.activeRenderTarget, x, y, width, height, attachment);
  }

  private readFloatPixelsImpl(target: MockRenderTarget | null, x: number, y: number, width: number, height: number, attachment?: number): Float32Array {
    if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0 ||
        !Number.isSafeInteger(width * height * 4)) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    if (!target) {
      if (attachment !== undefined) throw new RenderDeviceError("Attachment readback requires an active render target", "INVALID_RENDER_ATTACHMENT", { attachment });
      if (this.backbufferPixels) {
        if (width > this.backbufferWidth - x || height > this.backbufferHeight - y) {
          throw new RenderDeviceError("Float readback rectangle exceeds backbuffer bounds", "READBACK_OUT_OF_BOUNDS", {
            x,
            y,
            width,
            height,
            boundsWidth: this.backbufferWidth,
            boundsHeight: this.backbufferHeight
          });
        }
        const output = new Float32Array(width * height * 4);
        for (let row = 0; row < height; row += 1) {
          const sourceOffset = ((y + row) * this.backbufferWidth + x) * 4;
          const destOffset = row * width * 4;
          for (let column = 0; column < width * 4; column += 1) {
            output[destOffset + column] = (this.backbufferPixels[sourceOffset + column] ?? 0) / 255;
          }
        }
        return output;
      }
      const output = new Float32Array(width * height * 4);
      for (let index = 0; index < output.length; index += 4) {
        output[index] = this.clearColor[0];
        output[index + 1] = this.clearColor[1];
        output[index + 2] = this.clearColor[2];
        output[index + 3] = this.clearColor[3];
      }
      return output;
    }
    this.requireMockRenderTarget(target);
    const index = attachment ?? 0;
    getRenderAttachmentIdentity(target, "color", index);
    if (width > target.width - x || height > target.height - y) {
      throw new RenderDeviceError("Float readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
    }
    const output = new Float32Array(width * height * 4);
    const floats = mockAttachmentFloatPixels(target, index);
    const bytes = floats ? null : mockAttachmentPixels(target, index);
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = ((y + row) * target.width + x) * 4;
      const destOffset = row * width * 4;
      if (floats) {
        output.set(floats.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
      } else if (bytes) {
        for (let column = 0; column < width * 4; column += 1) output[destOffset + column] = bytes[sourceOffset + column]! / 255;
      }
    }
    return output;
  }

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.frameCounters.readbacks += 1;
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Depth readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (!target || !target.depthPixels) {
      throw new RenderDeviceError("Depth readback requires an active render target with a sampleable depth texture.", "DEPTH_READBACK_UNAVAILABLE");
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Depth readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
    }
    const output = new Float32Array(width * height);
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = (y + row) * target.width + x;
      const destOffset = row * width;
      output.set(target.depthPixels.subarray(sourceOffset, sourceOffset + width), destOffset);
    }
    return output;
  }

  beginFrame(width: number, height: number): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new RenderDeviceError("Frame is already active", "FRAME_ALREADY_ACTIVE");
    }
    if (width <= 0 || height <= 0) {
      throw new RenderDeviceError("Frame dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.frameActive = true;
    this.frameToken = {};
    this.viewportWidth = width;
    this.viewportHeight = height;
    // threejs-parity L7/SC-01: viewport/scissor state is per-frame —
    // `beginFrame` resets it to the full frame rect, scissor test off.
    this.viewportRect = { x: 0, y: 0, width, height };
    this.scissorRect = { x: 0, y: 0, width, height };
    this.scissorTestEnabled = false;
    this.viewStateTarget = null;
    this.frameViewportSet = false;
    this.viewportCallLog = [];
    this.drawViewStateLog = [];
    this.drawCommands.length = 0;
  }

  /** threejs-parity L7/SC-01 (P2): raster viewport override, target pixels. */
  setViewport(x: number, y: number, width: number, height: number, options?: RenderDeviceViewportOptions): void {
    this.assertAlive();
    if (width <= 0 || height <= 0) {
      throw new RenderDeviceError("Viewport dimensions must be positive", "INVALID_VIEWPORT", { width, height });
    }
    if (options?.persistent) {
      this.persistentViewportRect = { x, y, width, height };
    } else {
      this.viewportRect = { x, y, width, height };
      this.viewStateTarget = this.activeRenderTarget;
      this.frameViewportSet = true;
    }
    this.viewportCallLog.push({ call: "viewport", args: [x, y, width, height], persistent: options?.persistent === true });
  }

  /** Clears the persistent viewport and the frame-scoped override. */
  resetViewport(): void {
    this.assertAlive();
    this.persistentViewportRect = null;
    this.viewportRect = this.externalFramebuffer
      ? { x: 0, y: 0, width: this.externalFramebuffer.width, height: this.externalFramebuffer.height }
      : { x: 0, y: 0, width: this.viewportWidth, height: this.viewportHeight };
    this.viewStateTarget = null;
    this.frameViewportSet = false;
    this.viewportCallLog.push({ call: "resetViewport", args: [] });
  }

  /** XR: frames draw into `framebuffer` (size `width` x `height`) instead of the canvas until called with null. */
  setExternalFramebuffer(framebuffer: unknown | null, width: number, height: number): void {
    this.assertAlive();
    if (framebuffer !== null && (!(width > 0) || !(height > 0))) {
      throw new RenderDeviceError("External framebuffer dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.externalFramebuffer = framebuffer === null ? null : { handle: framebuffer, width, height };
    this.viewportCallLog.push({ call: "externalFramebuffer", args: framebuffer === null ? [] : [width, height] });
  }

  /** The XR framebuffer currently standing in for the canvas, or null. */
  getExternalFramebuffer(): { readonly handle: unknown; readonly width: number; readonly height: number } | null {
    return this.externalFramebuffer;
  }

  hasDefaultOutputOverride(): boolean {
    return this.persistentViewportRect !== null || this.externalFramebuffer !== null;
  }

  /** threejs-parity L7/SC-01 (P2): scissor rect, target pixels. */
  setScissor(x: number, y: number, width: number, height: number): void {
    this.assertAlive();
    if (width < 0 || height < 0) {
      throw new RenderDeviceError("Scissor dimensions must be non-negative", "INVALID_SCISSOR", { width, height });
    }
    this.scissorRect = { x, y, width, height };
    this.viewStateTarget = this.activeRenderTarget;
    this.viewportCallLog.push({ call: "scissor", args: [x, y, width, height] });
  }

  /** threejs-parity L7/SC-01 (P2): scissor-test toggle. */
  setScissorTest(enabled: boolean): void {
    this.assertAlive();
    this.scissorTestEnabled = enabled;
    this.viewStateTarget = this.activeRenderTarget;
    this.viewportCallLog.push({ call: "scissorTest", args: [enabled] });
  }

  /** SC-01: ordered record of viewport/scissor API calls this frame (cleared by `beginFrame`). */
  getViewportCalls(): ReadonlyArray<MockViewportCall> {
    return this.viewportCallLog;
  }

  /** SC-01: the effective viewport/scissor each draw this frame was issued under, aligned with the draw order. */
  getDrawViewStates(): readonly MockDrawViewState[] {
    return this.drawViewStateLog;
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertAlive();
    this.assertFrame();
    this.clearColor = color;
    if (this.activeRenderTarget) {
      const bytes = rgbaBytes(color);
      for (let i = 0; i < this.activeRenderTarget.colorPixels.length; i += 4) {
        this.activeRenderTarget.colorPixels.set(bytes, i);
      }
      if (this.activeRenderTarget.colorFloatPixels) {
        for (let i = 0; i < this.activeRenderTarget.colorFloatPixels.length; i += 4) {
          this.activeRenderTarget.colorFloatPixels[i] = color[0];
          this.activeRenderTarget.colorFloatPixels[i + 1] = color[1];
          this.activeRenderTarget.colorFloatPixels[i + 2] = color[2];
          this.activeRenderTarget.colorFloatPixels[i + 3] = color[3];
        }
      }
      for (const attachmentPixels of this.activeRenderTarget.attachmentPixels) {
        for (let i = 0; i < attachmentPixels.length; i += 4) {
          attachmentPixels.set(bytes, i);
        }
      }
      for (const floats of this.activeRenderTarget.attachmentFloatPixels) {
        if (floats) for (let i = 0; i < floats.length; i += 4) floats.set(color, i);
      }
      this.activeRenderTarget.depthPixels?.fill(this.mockDepthConvention.clearValue);
    }
  }

  private mockDepthConvention: import("./DepthConvention").DepthConvention = Object.freeze({
    requestedMode: "standard", mode: "standard", clipRange: "minus-one-to-one", clearValue: 1, compare: "less-equal", biasSign: 1
  });

  /**
   * Reversed-Z precision the mock advertises. Tests may replace it to model a
   * device with zero-to-one reversed rasterization and float depth.
   */
  depthPrecisionSupport: import("./DepthConvention").DepthPrecisionSupport = Object.freeze({
    standardClipRange: "minus-one-to-one", zeroToOneReversed: false, floatDepth: false, floatDepthStencil: false
  });

  getDepthPrecisionSupport(): import("./DepthConvention").DepthPrecisionSupport { return this.depthPrecisionSupport; }

  /** The mock follows the same clear-value contract as the GPU devices. */
  getDepthConvention(): import("./DepthConvention").DepthConvention { return this.mockDepthConvention; }

  setDepthConvention(convention: import("./DepthConvention").DepthConvention): void {
    this.assertAlive();
    const reversed = convention.mode === "reversed";
    const clipRangeValid = convention.clipRange === "minus-one-to-one"
      || (convention.clipRange === "zero-to-one" && reversed && this.depthPrecisionSupport.zeroToOneReversed);
    if (!clipRangeValid || !["standard", "reversed", "logarithmic"].includes(convention.mode)
      || convention.clearValue !== (reversed ? 0 : 1) || convention.compare !== (reversed ? "greater-equal" : "less-equal") || convention.biasSign !== (reversed ? -1 : 1)) {
      throw new RenderDeviceError("Depth convention is invalid for the mock device", "INVALID_DEPTH_CONVENTION");
    }
    this.mockDepthConvention = Object.freeze({ ...convention });
  }

  clearRenderTarget(color: readonly [number, number, number, number], attachment?: number): void {
    this.assertAlive();
    this.assertFrame();
    const previous = this.clearColor;
    if (attachment !== undefined && this.activeRenderTarget) {
      this.requireMockRenderTarget(this.activeRenderTarget);
      getRenderAttachmentIdentity(this.activeRenderTarget, "color", attachment);
      const bytes = rgbaBytes(color);
      const pixels = attachment === 0 ? this.activeRenderTarget.colorPixels : this.activeRenderTarget.attachmentPixels[attachment - 1];
      if (!pixels) {
        throw new RenderDeviceError("Render target has no color attachment at the requested index", "INVALID_RENDER_TARGET_SIZE", {
          attachment,
          attachments: this.activeRenderTarget.attachmentPixels.length + 1
        });
      }
      for (let i = 0; i < pixels.length; i += 4) {
        pixels.set(bytes, i);
      }
      const floats = mockAttachmentFloatPixels(this.activeRenderTarget, attachment);
      if (floats) for (let i = 0; i < floats.length; i += 4) floats.set(color, i);
      return;
    }
    this.clear(color);
    this.clearColor = previous;
  }

  draw(command: DrawCommand): void {
    this.assertAlive();
    this.assertFrame();
    if (command.renderState?.colorAttachments !== undefined) {
      const target = this.activeRenderTarget;
      const count = target?.depthOnly ? 0 : target ? (target.colorTextures?.length ?? 1) : 1;
      validateRenderCommandState(command.renderState, count);
      // The mock records draws but does not implement independent attachment
      // blend/write behavior; it must not present an override as executed.
      if (hasAttachmentRenderOverrides(command.renderState)) {
        throw new RenderDeviceError("Mock rendering cannot apply independent color attachment state", "UNSUPPORTED_RENDER_STATE");
      }
    }
    const validateTextureOwner = (texture: Texture): void => {
      const owner = getRenderTargetTextureOwner(texture);
      if (owner !== undefined && owner !== this) {
        throw new RenderDeviceError("Render-target texture belongs to another device", "FOREIGN_RESOURCE", { label: texture.label });
      }
      if (texture.disposed) throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
    };
    for (const value of command.uniforms?.values() ?? []) {
      if (isTextureBinding(value) && value.texture) validateTextureOwner(value.texture);
    }
    for (const binding of command.nativeStorageBindings ?? []) {
      if (binding.kind === "storage-texture") validateTextureOwner(binding.texture);
    }
    if (this.activeRenderTarget) {
      const attached = new Set<Texture>([
        ...(this.activeRenderTarget.depthOnly ? [] : this.activeRenderTarget.colorTextures ?? [this.activeRenderTarget.colorTexture]),
        ...(this.activeRenderTarget.depthTexture ? [this.activeRenderTarget.depthTexture] : [])
      ]);
      for (const value of command.uniforms?.values() ?? []) {
        if (isTextureBinding(value) && value.texture && attached.has(value.texture)) {
          throw new RenderDeviceError("A draw cannot sample an active render attachment", "RENDER_ATTACHMENT_HAZARD");
        }
      }
      for (const binding of command.nativeStorageBindings ?? []) {
        if (binding.kind === "storage-texture" && attached.has(binding.texture)) {
          throw new RenderDeviceError("A draw cannot use an active render attachment as storage", "RENDER_ATTACHMENT_HAZARD");
        }
      }
    }
    if (command.vertexBuffer.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed vertex buffer", "DISPOSED_RESOURCE", {
        bufferId: command.vertexBuffer.id
      });
    }
    if (command.indexBuffer?.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed index buffer", "DISPOSED_RESOURCE", {
        bufferId: command.indexBuffer.id
      });
    }
    for (const attribute of command.instanceAttributes ?? []) {
      if (attribute.buffer.disposed) {
        throw new RenderDeviceError("Cannot draw with a disposed instance attribute buffer", "DISPOSED_RESOURCE", {
          bufferId: attribute.buffer.id,
          attribute: attribute.shaderName
        });
      }
      validateInstanceVertexAttribute(attribute);
    }
    if (command.vertexCount <= 0) {
      throw new RenderDeviceError("Draw command must have a positive vertex count", "INVALID_DRAW_COMMAND", {
        vertexCount: command.vertexCount,
        label: command.label
      });
    }
    if (command.firstVertex !== undefined && (!Number.isInteger(command.firstVertex) || command.firstVertex < 0)) {
      throw new RenderDeviceError("Draw command firstVertex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstVertex: command.firstVertex,
        label: command.label
      });
    }
    if (command.indexBuffer && (command.indexCount === undefined || command.indexCount <= 0)) {
      throw new RenderDeviceError("Indexed draw command must have a positive index count", "INVALID_DRAW_COMMAND", {
        indexCount: command.indexCount,
        label: command.label
      });
    }
    if (command.firstIndex !== undefined && (!Number.isInteger(command.firstIndex) || command.firstIndex < 0)) {
      throw new RenderDeviceError("Draw command firstIndex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstIndex: command.firstIndex,
        label: command.label
      });
    }
    if (command.instanceCount !== undefined && (!Number.isInteger(command.instanceCount) || command.instanceCount <= 0)) {
      throw new RenderDeviceError("Draw command instanceCount must be a positive integer", "INVALID_DRAW_COMMAND", {
        instanceCount: command.instanceCount,
        label: command.label
      });
    }
    this.drawCommands.push(command);
    this.drawViewStateLog.push(this.effectiveViewState());
    this.frameCounters.drawCalls += 1;
  }

  /** Viewport/scissor in force for the bound target: the override while its target is bound, else the full target. */
  private effectiveViewState(): MockDrawViewState {
    const live = this.viewStateTarget === this.activeRenderTarget;
    const toCanvas = this.activeRenderTarget === null;
    const full = this.activeRenderTarget
      ? { x: 0, y: 0, width: this.activeRenderTarget.width, height: this.activeRenderTarget.height }
      : this.externalFramebuffer
        ? { x: 0, y: 0, width: this.externalFramebuffer.width, height: this.externalFramebuffer.height }
        : { x: 0, y: 0, width: this.viewportWidth, height: this.viewportHeight };
    const persistent = toCanvas ? this.persistentViewportRect : null;
    return {
      viewport: live && this.frameViewportSet ? { ...this.viewportRect } : persistent ? { ...persistent } : full,
      scissor: live && this.scissorTestEnabled ? { ...this.scissorRect } : null,
      framebuffer: toCanvas ? this.externalFramebuffer?.handle ?? null : null,
      destination: !toCanvas ? "render-target" : this.externalFramebuffer ? "external" : "canvas"
    };
  }

  endFrame(): void {
    this.assertAlive();
    this.assertFrame();
    this.frameActive = false;
    this.frameToken = null;
  }

  /** C-28 (PRD 11): native measured counters. Per-frame fields describe the frame in progress; live gauges come from diagnostics. */
  counters(): import("./contracts/device").DeviceCounters {
    const diag = this.getDiagnostics();
    return {
      drawCalls: this.frameCounters.drawCalls,
      bufferCreates: this.frameCounters.bufferCreates,
      textureUploads: this.frameCounters.textureUploads,
      readbacks: this.frameCounters.readbacks,
      renderTargetsCreated: this.frameCounters.renderTargetsCreated,
      programCompiles: this.frameCounters.programCompiles,
      liveBuffers: diag.buffers,
      // The mock has no vertex-array concept; C-28 types this `number` so there
      // is no "unmeasured" sentinel available.
      liveVertexArrays: 0,
      textureBytes: diag.textureBytes ?? 0,
      renderTargetBytes: diag.gpuTargetBytes ?? 0
    };
  }

  /** Zeroes the per-frame counter fields only; live gauges are unaffected. */
  resetFrameCounters(): void {
    this.frameCounters = { drawCalls: 0, bufferCreates: 0, textureUploads: 0, readbacks: 0, renderTargetsCreated: 0, programCompiles: 0 };
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["frameActive", this.frameActive],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["viewport", `${this.viewportRect.x},${this.viewportRect.y},${this.viewportRect.width},${this.viewportRect.height}`],
      ["scissor", `${this.scissorRect.x},${this.scissorRect.y},${this.scissorRect.width},${this.scissorRect.height}`],
      ["scissorTest", this.scissorTestEnabled],
      ["clearR", this.clearColor[0]],
      ["clearG", this.clearColor[1]],
      ["clearB", this.clearColor[2]],
      ["clearA", this.clearColor[3]],
      ["drawCalls", this.drawCommands.length]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const liveTextures = liveRenderTargets.flatMap((target) => target.depthTexture ? [target.colorTexture, target.depthTexture] : [target.colorTexture]);
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const textureBytes = liveTextures.reduce((total, texture) => total + texture.byteLength, 0);
    return {
      drawCalls: this.drawCommands.length,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      maxRenderTargetSampleCount: Math.max(1, ...liveRenderTargets.map((target) => target.sampleCount ?? 1)),
      textures: liveTextures.length,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: liveTextures.filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24").length,
      compressedTextureBytes: liveTextures
        .filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24")
        .reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: 0,
      textureFallbackBytes: 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].reduce((total, target) => total + (target.colorTexture.disposed ? 1 : 0) + (target.depthTexture?.disposed ? 1 : 0), 0),
      ...spreadGpuTargetInventory(
        liveRenderTargets.map((target) => ({
          label: target.label,
          kind: "render-target" as const,
          bytes: target.colorTexture.byteLength + (target.depthTexture?.byteLength ?? 0),
          owner: resolveGpuTargetOwner(target.label)
        }))
      ),
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  dispose(): void {
    for (const buffer of this.buffers) {
      buffer.dispose();
    }
    for (const shader of this.shaders) {
      shader.dispose();
    }
    for (const target of this.renderTargets) {
      target.dispose();
    }
    this.frameActive = false;
    this.frameToken = null;
    this.disposed = true;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
    }
    if (this.contextLost) {
      throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    }
  }

  private assertFrame(): void {
    if (!this.frameActive) {
      throw new RenderDeviceError("No active frame", "NO_ACTIVE_FRAME");
    }
  }

  private requireMockBuffer(buffer: RenderBuffer): MockRenderBuffer {
    if (!(buffer instanceof MockRenderBuffer) || !this.buffers.has(buffer)) {
      throw new RenderDeviceError("Buffer was not created by this device", "FOREIGN_RESOURCE", { bufferId: buffer.id });
    }
    return buffer;
  }

  private requireMockRenderTarget(target: RenderTarget): MockRenderTarget {
    if (!(target instanceof MockRenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    return target;
  }
}

function mockAttachmentPixels(target: MockRenderTarget, attachment: number): Uint8Array {
  const pixels = attachment === 0 ? target.colorPixels : target.attachmentPixels[attachment - 1];
  if (!pixels) throw new RenderDeviceError("Render target has no such color attachment", "INVALID_RENDER_ATTACHMENT");
  return pixels;
}

function mockAttachmentFloatPixels(target: MockRenderTarget, attachment: number): Float32Array | null {
  return attachment === 0 ? target.colorFloatPixels : target.attachmentFloatPixels[attachment - 1] ?? null;
}

function throwIfResourceTransferAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    if (signal.reason !== undefined) throw signal.reason;
    const error = new Error("Resource transfer was aborted");
    error.name = "AbortError";
    throw error;
  }
}

function validateInstanceVertexAttribute(attribute: InstanceVertexAttribute): void {
  if (!attribute.shaderName || typeof attribute.shaderName !== "string") {
    throw new RenderDeviceError("Instance vertex attribute shaderName must be a non-empty string", "INVALID_DRAW_COMMAND");
  }
  if (![1, 2, 3, 4].includes(attribute.components)) {
    throw new RenderDeviceError("Instance vertex attribute components must be 1, 2, 3, or 4", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      components: attribute.components
    });
  }
  if (!Number.isInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % 4 !== 0) {
    throw new RenderDeviceError("Instance vertex attribute offset must be non-negative and 4-byte aligned", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      offset: attribute.offset
    });
  }
  if (!Number.isInteger(attribute.stride) || attribute.stride <= 0 || attribute.stride % 4 !== 0) {
    throw new RenderDeviceError("Instance vertex attribute stride must be positive and 4-byte aligned", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      stride: attribute.stride
    });
  }
  if (attribute.offset + attribute.components * 4 > attribute.stride) {
    throw new RenderDeviceError("Instance vertex attribute range must fit inside its stride", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      offset: attribute.offset,
      components: attribute.components,
      stride: attribute.stride
    });
  }
  const divisor = attribute.divisor ?? 1;
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new RenderDeviceError("Instance vertex attribute divisor must be a positive integer", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      divisor
    });
  }
}

export function viewBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function rgbaBytes(color: readonly [number, number, number, number]): Uint8Array {
  return new Uint8Array(color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255)));
}
