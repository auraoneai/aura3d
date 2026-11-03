import { temporalAccumulationWeight } from "./TemporalMath";
import { resourceDisposalPending } from "./ResourceLifecycle";
import { negotiateDepthConvention, type DepthConvention, type DepthPrecisionSupport } from "./DepthConvention";

/** EXT_clip_control (WebGL2): glClipControl(origin, depth mode). */
interface ClipControlExtension {
  readonly LOWER_LEFT_EXT: GLenum;
  readonly NEGATIVE_ONE_TO_ONE_EXT: GLenum;
  readonly ZERO_TO_ONE_EXT: GLenum;
  clipControlEXT(origin: GLenum, depth: GLenum): void;
}

/** Depth/stencil storage of a WebGL2 render target; fixed targets keep one packed format. */
function webgl2DepthStorageFormat(gl: WebGL2RenderingContext, float: boolean, stencil: boolean): {
  readonly internalFormat: GLenum; readonly format: GLenum; readonly type: GLenum; readonly attachment: GLenum; readonly stencil: boolean;
} {
  if (!float) return { internalFormat: gl.DEPTH24_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.UNSIGNED_INT_24_8, attachment: gl.DEPTH_STENCIL_ATTACHMENT, stencil: true };
  return stencil
    ? { internalFormat: gl.DEPTH32F_STENCIL8, format: gl.DEPTH_STENCIL, type: gl.FLOAT_32_UNSIGNED_INT_24_8_REV, attachment: gl.DEPTH_STENCIL_ATTACHMENT, stencil: true }
    : { internalFormat: gl.DEPTH_COMPONENT32F, format: gl.DEPTH_COMPONENT, type: gl.FLOAT, attachment: gl.DEPTH_ATTACHMENT, stencil: false };
}
import { invertSsrProjection } from "./ProjectionMath";
import type { TemporalGpuBindings } from "./TemporalHistory";
import {
  type BufferUsage,
  type DrawCommand,
  type GpuTargetInventoryEntry,
  type InstanceVertexAttribute,
  type LdrPostprocessPassDescriptor,
  type LdrPostprocessPresentationOptions,
  type RenderBuffer,
  type RenderDevice,
  RenderDeviceError,
  type RenderDeviceDiagnostics,
  type RenderDeviceInfo,
  type RenderOutputColorSpace,
  type RenderOutputColorSpaceNegotiation,
  type RenderResourceCopyOptions,
  type RenderResourceReadbackOptions,
  type RenderShaderProgram,
  type RenderTarget,
  type RenderTargetDescriptor,
  type ShaderReflection,
  type ShaderSources,
  resolveGpuTargetOwner,
  getRenderAttachmentIdentity,
  shaderCompileFailureMessage,
  spreadGpuTargetInventory,
  validateRenderAttachmentAccess,
  validateRenderTargetDescriptor,
} from "./RenderDevice";
import { Texture, claimRenderTargetTextureOwner, getRenderTargetTextureOwner, isCompressedTextureFormat, isFloatColorTextureFormat, type TextureCompressedFormat, type TextureCubeFace, type TextureFormat, type TexturePixelData } from "./Texture";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import type { Sampler, TextureMagFilter, TextureMinFilter } from "./Sampler";
import { type VertexAttribute, type VertexFormat } from "./VertexFormat";
import { WebGL2StateCache } from "./WebGL2StateCache";
import {
  BLOOM_BRIGHT_LUT_HEIGHT,
  BLOOM_BRIGHT_LUT_WIDTH,
  BLOOM_COMPOSITE_LUT_SIZE,
  OUTLINE_BLEND_LUT_WIDTH,
  OUTLINE_LIMB_RADIX,
  createOutlineBlendLut,
  createOutlineGradientBound,
  createBloomBrightThresholdLut,
  createBloomCompositeLut
} from "./postprocess/NativeLdrEffectLuts";
import {
  normalizeBloomQualityPreset,
  resolveBloomPyramidBlurRadii,
  resolveBloomPyramidPlan,
  resolveBloomPyramidResponseGain,
  type BloomPyramidPlan,
  type BloomQualityPreset,
} from "./postprocess/NativeBloomPyramid";
import { WebGL2Counters } from "./webgl2/Counters";
import { createWebGL2DeviceProbe } from "./webgl2/Probe";
import type { DeviceCounters, DeviceProbe } from "./contracts/device";
import type { WebGL2DeviceHost } from "./webgl2/DeviceHost";
import { WebGL2ContextLifecycle } from "./webgl2/ContextLifecycle";
import { WebGL2TextureRegistry } from "./webgl2/TextureUpload";
import { reserveTextureBudget, textureBudgetResidentBytes, textureBudgetUsage } from "./textures/TextureBudget";
import { WebGL2TextureResidencyAdapter } from "./webgl2/TextureResidencyAdapter";
import { WebGL2SamplerRegistry } from "./webgl2/Samplers";
import { canMultiDraw, WebGL2DrawCallBinder, type StaticUnlitPairUniformPlan, type GeneratedStaticUnlitPairUniformPlan } from "./webgl2/MultiDraw";
import { AURA_FRAME_BINDING, AURA_LIGHTS_BINDING } from "./resources/UniformBlock";
import { WebGL2ReadbackProbe } from "./webgl2/Probe";
import { WebGL2LegacyPostPipeline } from "./webgl2/LegacyPost";
import { DEFAULT_BLOOM_FUSION, type BloomFusionConfig } from "./webgl2/BloomFusion";
import { cubeFaceTarget, rgba8TextureInternalFormat, textureUploadFormat, resolveRenderTargetFormat, renderTargetSampleFilter, resolveCompressedTextureFormat, magFilter, minFilter, addressMode } from "./webgl2/TextureFormats";
import { disposeNativePostEffectsForHost, registerNativePostEffectLifecycle, releaseNativePostEffectScopeForHost, releaseNativePostEffectViewForHost } from "./renderer/postSkipped";
import { reflectShaderSources } from "./ShaderReflection";
import { WebGL2GaussianSplatColorAdapter } from "./webgl2/GaussianSplatSurface";
import { DEFAULT_UNLIT_SHADER_NAME, ShaderLibrary, registerLeanUnlitShader } from "./ShaderLibraryCore";
import { deriveStaticBatchUnlitShaderSource, inspectStaticBatchUnlitProgram } from "./webgl2/StaticBatchUnlitShader";
import { WebGLBatchSubmissionState } from "./webgl2/BatchExecutionCapability";
import { planStaticUnlitPair, type StaticUnlitPairPlanInput, type StaticUnlitPairRect } from "./renderer/StaticUnlitPairPlan";
import { planStaticGeneratedUnlitPair, type StaticGeneratedUnlitPairPlanInput } from "./renderer/StaticGeneratedUnlitPairPlan";
import { deriveStaticGeneratedUnlitPairSource, getRecordedStaticGeneratedUnlitSources, inspectStaticGeneratedUnlitPairProgram } from "./webgl2/StaticGeneratedUnlitShader";
import { computeProgramKey, type ProgramFeatures } from "./contracts/program";
import type { GaussianSplatColorAdapter } from "./GaussianSplatColorComposite";
import { deriveShaderDataLayout } from "./webgpu/ShaderDataLayout";

export interface TextureFilterAnisotropicExtension {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
}

export const WEBGL_CUBE_FACES: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

const COMPLETION_POLL_INTERVAL_MS = 8;
const COMPLETION_POLL_TIMEOUT_MS = 30_000;
const COMPLETION_POLL_LIMIT = COMPLETION_POLL_TIMEOUT_MS / COMPLETION_POLL_INTERVAL_MS;

// The opt-in two-draw path needs bounds for the bytes actually uploaded, not
// for a CPU view that might have been edited without marking it dirty. These
// caps bound its auxiliary memory independently of the device's GPU budget.
export const STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
export const STATIC_UNLIT_PAIR_MAX_MIRROR_BYTES = 32 * 1024 * 1024;
// Frame-block mirrors have their own much smaller budget. A buffer outside this
// budget remains fully usable for ordinary rendering.
export const STATIC_GENERATED_UNLIT_MAX_UNIFORM_BUFFER_BYTES = 64 * 1024;
export const STATIC_GENERATED_UNLIT_MAX_UNIFORM_MIRROR_BYTES = 1024 * 1024;
const AURA_FRAME_VIEW_PROJECTION_OFFSET = 128;
const AURA_FRAME_BLOCK_BYTES = 304;
const STATIC_GENERATED_UNLIT_MAX_PAIR_PROGRAMS = 32;

export interface StaticUnlitBufferSnapshot {
  readonly generation: number;
  readonly revision: number;
  /** An independent copy; mutating it cannot change the device's mirror. */
  readonly bytes: Uint8Array;
}

declare const staticUnlitPairTicketBrand: unique symbol;
/** Opaque, device-owned authority for one already-prepared pair. */
export interface StaticUnlitPairTicket { readonly [staticUnlitPairTicketBrand]: true; }

interface StaticUnlitPairEvidence {
  readonly frame: object;
  readonly generation: number;
  readonly target: WebGL2RenderTarget | null;
  readonly framebuffer: WebGLFramebuffer | null;
  readonly shader: RenderShaderProgram;
  readonly format: VertexFormat;
  readonly state: NonNullable<DrawCommand["renderState"]>;
  readonly vertex: RenderBuffer;
  readonly index: RenderBuffer;
  readonly vertexRevision: number;
  readonly indexRevision: number;
  readonly signature: string;
  readonly uniforms: StaticUnlitPairUniformPlan;
}

interface StaticUnlitPairRecord extends StaticUnlitPairEvidence {
  readonly first: DrawCommand;
  readonly second: DrawCommand;
  readonly pairShader: RenderShaderProgram;
}

function sameStaticUnlitEvidence(a: StaticUnlitPairEvidence, b: StaticUnlitPairEvidence): boolean {
  const equal = (left: Float32Array, right: Float32Array): boolean => left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  return a.frame === b.frame && a.generation === b.generation && a.target === b.target && a.framebuffer === b.framebuffer
    && a.shader === b.shader && a.format === b.format && a.state === b.state
    && a.vertex === b.vertex && a.index === b.index && a.vertexRevision === b.vertexRevision && a.indexRevision === b.indexRevision
    && a.signature === b.signature && equal(a.uniforms.effectiveMvpPair, b.uniforms.effectiveMvpPair)
    && equal(a.uniforms.baseColor, b.uniforms.baseColor) && Object.is(a.uniforms.pointSize, b.uniforms.pointSize)
    && Object.is(a.uniforms.alphaCutoff, b.uniforms.alphaCutoff) && Object.is(a.uniforms.roundPoints, b.uniforms.roundPoints);
}

const staticUnlitEndianProbe = new Uint32Array([0x01020304]);
const STATIC_UNLIT_BYTE_ORDER = new Uint8Array(staticUnlitEndianProbe.buffer)[0] === 4 ? "little-endian" : "big-endian";

function staticUnlitRect(value: unknown): StaticUnlitPairRect | undefined {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || (value as ArrayLike<number>).length !== 4) return undefined;
  const [x, y, width, height] = Array.from(value as ArrayLike<number>);
  return [x, y, width, height].every(Number.isSafeInteger) ? { x: x!, y: y!, width: width!, height: height! } : undefined;
}

/** Copy only finite, ordinary uniform data; reject textures and accessors. */
function staticUnlitUniformSignature(uniforms: DrawCommand["uniforms"]): string | undefined {
  if (!(uniforms instanceof Map) || Object.getPrototypeOf(uniforms) !== Map.prototype) return undefined;
  const values: (string | number)[] = [];
  const appendNumber = (value: unknown): boolean => {
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) return false;
    values.push(Object.is(value, -0) ? "-0" : value);
    return true;
  };
  for (const [name, value] of uniforms) {
    if (typeof name !== "string") return undefined;
    values.push(name);
    if (typeof value === "number") {
      values.push("scalar");
      if (!appendNumber(value)) return undefined;
      continue;
    }
    const array = Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype ? value
      : value instanceof Float32Array && Object.getPrototypeOf(value) === Float32Array.prototype && copyStaticUnlitUpload(value) ? value : undefined;
    if (!array || array.length > 1024) return undefined;
    values.push("array", array.length);
    for (let index = 0; index < array.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(array, index);
      if (!descriptor || !("value" in descriptor) || !appendNumber(descriptor.value)) return undefined;
    }
  }
  return JSON.stringify(values);
}

declare const staticGeneratedUnlitPairTicketBrand: unique symbol;
export interface StaticGeneratedUnlitPairTicket { readonly [staticGeneratedUnlitPairTicketBrand]: true; }
export interface StaticGeneratedUnlitPairOptions {
  readonly features: ProgramFeatures;
  readonly auraFrameBuffer: RenderBuffer;
}
export interface StaticGeneratedUnlitPairHooks {
  readonly onAttempt: () => void;
  readonly onSubmitted: () => void;
}

interface StaticGeneratedReflectionProof {
  readonly reflection: ShaderReflection;
  readonly attributes: ShaderReflection["attributes"];
  readonly uniforms: ShaderReflection["uniforms"];
  readonly attributeDetails: ShaderReflection["attributeDetails"];
  readonly uniformDetails: ShaderReflection["uniformDetails"];
  readonly attributeEntries: readonly (readonly [string, number])[];
  readonly uniformEntries: readonly string[];
  readonly attributeDetailEntries: readonly (readonly [string, object, readonly (readonly [PropertyKey, unknown])[]])[];
  readonly uniformDetailEntries: readonly (readonly [string, object, readonly (readonly [PropertyKey, unknown])[]])[];
  readonly handle: WebGLProgram;
  readonly id: number;
  readonly label: string;
  readonly marker: string;
}

function staticGeneratedDetailSnapshot(value: object): readonly (readonly [PropertyKey, unknown])[] | undefined {
  if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.length > 8) return undefined;
  const result: (readonly [PropertyKey, unknown])[] = [];
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !("value" in property) || (typeof property.value !== "string" && typeof property.value !== "number" && property.value !== null)) return undefined;
    result.push([key, property.value]);
  }
  return result;
}

/** Called only on reflection just constructed by this device's own linker. */
function captureStaticGeneratedReflection(shader: WebGL2ShaderProgram): StaticGeneratedReflectionProof | undefined {
  try {
    const reflection = shader.reflection;
    const { attributes, uniforms, attributeDetails, uniformDetails } = reflection;
    if (Object.getPrototypeOf(reflection) !== Object.prototype || Object.getPrototypeOf(attributes) !== Map.prototype
      || Object.getPrototypeOf(uniforms) !== Set.prototype || Object.getPrototypeOf(attributeDetails) !== Map.prototype
      || Object.getPrototypeOf(uniformDetails) !== Map.prototype || attributes.size > 64 || uniforms.size > 128
      || attributeDetails.size > 64 || uniformDetails.size > 128) return undefined;
    const captureDetails = (map: ReadonlyMap<string, object>): (readonly [string, object, readonly (readonly [PropertyKey, unknown])[]])[] | undefined => {
      const entries: (readonly [string, object, readonly (readonly [PropertyKey, unknown])[]])[] = [];
      for (const [name, detail] of map) {
        const snapshot = staticGeneratedDetailSnapshot(detail);
        if (!snapshot) return undefined;
        entries.push([name, detail, snapshot]);
      }
      return entries;
    };
    const attributeDetailEntries = captureDetails(attributeDetails), uniformDetailEntries = captureDetails(uniformDetails);
    if (!attributeDetailEntries || !uniformDetailEntries) return undefined;
    return { reflection, attributes, uniforms, attributeDetails, uniformDetails, attributeEntries: [...attributes],
      uniformEntries: [...uniforms], attributeDetailEntries, uniformDetailEntries,
      handle: shader.handle, id: shader.id, label: shader.label, marker: shader.marker };
  } catch { return undefined; }
}

/** Reject changed reflection before speculative material binding can invoke it. */
function staticGeneratedReflectionCurrent(shader: RenderShaderProgram, proof: StaticGeneratedReflectionProof): boolean {
  try {
    if (!(shader instanceof WebGL2ShaderProgram) || Object.getPrototypeOf(shader) !== WebGL2ShaderProgram.prototype) return false;
    const own = (object: object, key: PropertyKey, expected: unknown): boolean => {
      const property = Object.getOwnPropertyDescriptor(object, key);
      return !!property && "value" in property && Object.is(property.value, expected);
    };
    if (!own(shader, "reflection", proof.reflection) || !own(shader, "handle", proof.handle) || !own(shader, "disposed", false)
      || !own(shader, "id", proof.id) || !own(shader, "label", proof.label) || !own(shader, "marker", proof.marker)
      || Object.getPrototypeOf(proof.reflection) !== Object.prototype
      || !own(proof.reflection, "attributes", proof.attributes) || !own(proof.reflection, "uniforms", proof.uniforms)
      || !own(proof.reflection, "attributeDetails", proof.attributeDetails) || !own(proof.reflection, "uniformDetails", proof.uniformDetails)) return false;
    for (const [value, prototype] of [[proof.attributes, Map.prototype], [proof.uniforms, Set.prototype],
      [proof.attributeDetails, Map.prototype], [proof.uniformDetails, Map.prototype]] as const) {
      if (Object.getPrototypeOf(value) !== prototype || Reflect.ownKeys(value).length !== 0) return false;
    }
    const attributes = [...Map.prototype.entries.call(proof.attributes) as IterableIterator<[string, number]>];
    const uniforms = [...Set.prototype.values.call(proof.uniforms) as IterableIterator<string>];
    if (attributes.length !== proof.attributeEntries.length || uniforms.length !== proof.uniformEntries.length
      || attributes.some(([name, location], index) => name !== proof.attributeEntries[index]?.[0] || location !== proof.attributeEntries[index]?.[1])
      || uniforms.some((name, index) => name !== proof.uniformEntries[index])) return false;
    const sameDetails = (map: ReadonlyMap<string, object>, expected: StaticGeneratedReflectionProof["uniformDetailEntries"]): boolean => {
      const actual = [...Map.prototype.entries.call(map) as IterableIterator<[string, object]>];
      if (actual.length !== expected.length) return false;
      return actual.every(([name, detail], index) => {
        const snapshot = expected[index];
        if (!snapshot || name !== snapshot[0] || detail !== snapshot[1] || Object.getPrototypeOf(detail) !== Object.prototype) return false;
        const keys = Reflect.ownKeys(detail);
        return keys.length === snapshot[2].length && keys.every((key, i) => key === snapshot[2][i]?.[0] && own(detail, key, snapshot[2][i]?.[1]));
      });
    };
    return sameDetails(proof.attributeDetails, proof.attributeDetailEntries) && sameDetails(proof.uniformDetails, proof.uniformDetailEntries);
  } catch { return false; }
}

interface StaticGeneratedFrameSnapshot {
  readonly buffer: WebGL2Buffer;
  readonly generation: number;
  readonly revision: number;
  readonly bindingRevision: number;
  readonly viewProjection: Float32Array;
}
interface StaticGeneratedUnlitPairEvidence {
  readonly frame: object;
  readonly generation: number;
  readonly target: WebGL2RenderTarget | null;
  readonly framebuffer: WebGLFramebuffer | null;
  readonly shader: RenderShaderProgram;
  readonly format: VertexFormat;
  readonly state: NonNullable<DrawCommand["renderState"]>;
  readonly vertex: RenderBuffer;
  readonly index: RenderBuffer;
  readonly vertexRevision: number;
  readonly indexRevision: number;
  readonly frameBlock: StaticGeneratedFrameSnapshot;
  readonly signature: string;
  readonly uniforms: GeneratedStaticUnlitPairUniformPlan;
}
interface StaticGeneratedUnlitPairRecord extends StaticGeneratedUnlitPairEvidence {
  readonly first: DrawCommand;
  readonly second: DrawCommand;
  readonly options: StaticGeneratedUnlitPairOptions;
  readonly pairShader: RenderShaderProgram;
}

function sameStaticGeneratedUnlitEvidence(a: StaticGeneratedUnlitPairEvidence, b: StaticGeneratedUnlitPairEvidence): boolean {
  const equal = (left: Float32Array, right: Float32Array): boolean => left.length === right.length
    && left.every((value, index) => Object.is(value, right[index]));
  if (a.frame !== b.frame || a.generation !== b.generation || a.target !== b.target || a.framebuffer !== b.framebuffer
    || a.shader !== b.shader || a.format !== b.format || a.state !== b.state || a.vertex !== b.vertex || a.index !== b.index
    || a.vertexRevision !== b.vertexRevision || a.indexRevision !== b.indexRevision || a.signature !== b.signature
    || a.frameBlock.buffer !== b.frameBlock.buffer || a.frameBlock.generation !== b.frameBlock.generation
    || a.frameBlock.revision !== b.frameBlock.revision || a.frameBlock.bindingRevision !== b.frameBlock.bindingRevision
    || !equal(a.frameBlock.viewProjection, b.frameBlock.viewProjection)
    || !equal(a.uniforms.effectiveModelPair, b.uniforms.effectiveModelPair)
    || !equal(a.uniforms.effectiveGeometryMatrix, b.uniforms.effectiveGeometryMatrix)
    || !equal(a.uniforms.frameViewProjection, b.uniforms.frameViewProjection)
    || a.uniforms.commonUniforms.size !== b.uniforms.commonUniforms.size) return false;
  for (const [name, value] of a.uniforms.commonUniforms) {
    const other = b.uniforms.commonUniforms.get(name);
    if (typeof value === "number") {
      if (typeof other !== "number" || !Object.is(value, other)) return false;
    } else if (!(other instanceof Float32Array) || !equal(value, other)) return false;
  }
  return true;
}

interface StaticUnlitBufferMirror {
  readonly generation: number;
  revision: number;
  readonly bytes: Uint8Array;
}

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const typedArrayByteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const dataViewBuffer = Object.getOwnPropertyDescriptor(DataView.prototype, "buffer")!.get!;
const dataViewByteOffset = Object.getOwnPropertyDescriptor(DataView.prototype, "byteOffset")!.get!;
const dataViewByteLength = Object.getOwnPropertyDescriptor(DataView.prototype, "byteLength")!.get!;
const arrayBufferByteLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength")!.get!;

// Store the actual preprocessed ordinary source that device compilation sees.
// Labels and linked reflection alone cannot establish which source was used.
let staticUnlitSources: { readonly ordinary: ShaderSources; readonly pair: ShaderSources } | null | undefined;
function getStaticUnlitSources(): { readonly ordinary: ShaderSources; readonly pair: ShaderSources } | undefined {
  if (staticUnlitSources === undefined) {
    try {
      const library = new ShaderLibrary();
      registerLeanUnlitShader(library);
      staticUnlitSources = { ordinary: library.compileSource(DEFAULT_UNLIT_SHADER_NAME), pair: deriveStaticBatchUnlitShaderSource(library.get(DEFAULT_UNLIT_SHADER_NAME)) };
    } catch {
      // A changed source disables this optional optimization, not the device.
      staticUnlitSources = null;
    }
  }
  return staticUnlitSources ?? undefined;
}

/** Copy the actual view range without invoking user-defined accessors. Shared
 * backing stores are excluded because they can change during the GL call. */
function copyStaticUnlitUpload(data: ArrayBufferView): Uint8Array | undefined {
  if (!ArrayBuffer.isView(data)) return undefined;
  try {
    let buffer: unknown, offset: number, length: number;
    try {
      buffer = Reflect.apply(typedArrayBuffer, data, []);
      offset = Reflect.apply(typedArrayByteOffset, data, []) as number;
      length = Reflect.apply(typedArrayByteLength, data, []) as number;
    } catch {
      buffer = Reflect.apply(dataViewBuffer, data, []);
      offset = Reflect.apply(dataViewByteOffset, data, []) as number;
      length = Reflect.apply(dataViewByteLength, data, []) as number;
    }
    // The native ArrayBuffer getter rejects SharedArrayBuffer and detached data.
    Reflect.apply(arrayBufferByteLength, buffer, []);
    return new Uint8Array(buffer as ArrayBuffer, offset, length).slice();
  } catch {
    return undefined;
  }
}

interface WebGLCompletionFenceApi {
  readonly fenceSync: WebGL2RenderingContext["fenceSync"];
  readonly flush: WebGL2RenderingContext["flush"];
  readonly clientWaitSync: WebGL2RenderingContext["clientWaitSync"];
  readonly deleteSync: WebGL2RenderingContext["deleteSync"];
  readonly condition: number;
  readonly alreadySignaled: number;
  readonly conditionSatisfied: number;
  readonly timeoutExpired: number;
  readonly waitFailed: number;
}

/** Presence check only; it does not authenticate a mutable, shared GL context. */
function webGLCompletionFenceApi(gl: WebGL2RenderingContext): WebGLCompletionFenceApi | undefined {
  try {
    const { fenceSync, flush, clientWaitSync, deleteSync, SYNC_GPU_COMMANDS_COMPLETE,
      ALREADY_SIGNALED, CONDITION_SATISFIED, TIMEOUT_EXPIRED, WAIT_FAILED } = gl;
    if (typeof fenceSync !== "function" || typeof flush !== "function" ||
        typeof clientWaitSync !== "function" || typeof deleteSync !== "function") return undefined;
    const statuses = [ALREADY_SIGNALED, CONDITION_SATISFIED, TIMEOUT_EXPIRED, WAIT_FAILED];
    if (!Number.isInteger(SYNC_GPU_COMMANDS_COMPLETE) || !statuses.every(Number.isInteger) || new Set(statuses).size !== statuses.length) return undefined;
    return { fenceSync, flush, clientWaitSync, deleteSync, condition: SYNC_GPU_COMMANDS_COMPLETE,
      alreadySignaled: ALREADY_SIGNALED, conditionSatisfied: CONDITION_SATISFIED,
      timeoutExpired: TIMEOUT_EXPIRED, waitFailed: WAIT_FAILED };
  } catch {
    return undefined;
  }
}

/**
 * Whether a render target is a shadow depth target, for the `shadowRenderTargetsAllocated` counter that
 * `diagnostics().renderer.shadows.mapRendered` reads. Legacy maps carry "shadow" in their label, legacy cascades
 * `renderer-csm-cascade-*`, and the PRD-02 sun cascades `prd02-cascade-*` (DD-10: before this the PRD-02 path counted 0 targets,
 * so the renderer row reported `enabled: false, mapRendered: false` on a game whose shadows were drawing).
 */
function isShadowRenderTargetLabel(label: string | undefined): boolean {
  return /shadow|(?:^|-)csm(?:-|$)|^prd02-cascade-/i.test(label ?? "");
}

/**
 * #621 (01-RTARRAY): immutable storage (`texStorage2D/3D`) only accepts SIZED
 * internal formats. `resolveRenderTargetFormat("rgba8")` returns unsized
 * `gl.RGBA`, which is valid for the `texImage2D` 2d path but makes
 * texStorage raise INVALID_ENUM and allocate nothing, so cube/array colour
 * framebuffers come out incomplete (GPU run 38143556299: "array: WebGL render
 * target framebuffer status is invalid"). Float formats are already sized.
 */
export function renderTargetStorageFormat(gl: Pick<WebGL2RenderingContext, "RGBA" | "RGBA8">, internalFormat: GLenum): GLenum {
  return internalFormat === gl.RGBA ? gl.RGBA8 : internalFormat;
}

/**
 * Attachment-0 color format of a single-attachment 2d target: an explicit
 * `colorAttachments[0].format` wins over the legacy `format` field.
 */
export function renderTargetColorFormat(descriptor: Pick<RenderTargetDescriptor, "format" | "colorAttachments">): Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f"> {
  return descriptor.colorAttachments?.[0]?.format ?? descriptor.format ?? "rgba8";
}

/** Physical sampled attachments only; multisample renderbuffers are not textures. */
function renderTargetTextureBytes(descriptor: RenderTargetDescriptor): number {
  const dimension = descriptor.dimension ?? "2d";
  const planes = dimension === "cube" ? 6 : dimension === "2d-array" ? descriptor.layers ?? 1 : 1;
  const feature = dimension !== "2d" || descriptor.layers !== undefined || descriptor.depthOnly === true || descriptor.depthCompare === true || (descriptor.colorAttachments?.length ?? 0) > 1;
  const colors = descriptor.depthOnly ? [] : feature && descriptor.colorAttachments
    ? descriptor.colorAttachments.map((attachment) => attachment.format)
    : [renderTargetColorFormat(descriptor)];
  const depthTexture = descriptor.depthOnly === true || descriptor.depth === "texture" || descriptor.depthCompare === true || (planes > 1 && descriptor.depth !== false);
  // DEPTH32F_STENCIL8 occupies 8 bytes per texel (32-bit float + padded stencil).
  const depthTexelBytes = descriptor.depthPrecision === "float" && descriptor.stencil !== false ? 8 : 4;
  let total = depthTexture ? descriptor.width * descriptor.height * planes * depthTexelBytes : 0;
  for (const format of colors) {
    const pixelBytes = format === "rgba8" ? 4 : format === "rgba16f" ? 8 : 16;
    for (let level = 0; level < (descriptor.mipLevelCount ?? 1); level += 1) {
      total += Math.max(1, Math.floor(descriptor.width / 2 ** level)) * Math.max(1, Math.floor(descriptor.height / 2 ** level)) * planes * pixelBytes;
    }
  }
  if (!Number.isSafeInteger(total)) throw new Error("Render target texture residency exceeds safe integer byte accounting");
  return total;
}

/**
 * MAX_TEXTURE_SIZE of the canvas's WebGL2 context (4096 when unavailable).
 * Lives in the device owner file so callers never touch getContext
 * themselves (single-renderer gate). Moved from the engine's deleted
 * safe-basic webglRuntime in Live Fix E6.
 */
export function webGL2MaxTextureSize(canvas: HTMLCanvasElement): number {
  // If this probe creates the context before the device does, it must not
  // lock the canvas into the browser's default stencil:false configuration.
  return Number(canvas.getContext("webgl2", { stencil: true })?.getParameter(WebGL2RenderingContext.MAX_TEXTURE_SIZE) ?? 4096);
}

/** C-08 named uniform-block → binding-point assignment applied post-link (T0-02). */
const NAMED_UNIFORM_BLOCK_BINDINGS: ReadonlyArray<readonly [blockName: string, binding: number]> = [
  ["AuraFrame", AURA_FRAME_BINDING],
  ["AuraLights", AURA_LIGHTS_BINDING]
];

export interface WebGL2DeviceOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly presentationAlphaMode?: "opaque" | "straight" | "premultiplied";
  readonly preserveDrawingBuffer?: boolean;
  /** §6.9 (lane 01): forwarded to getContext when set; absent = browser default. */
  readonly powerPreference?: WebGLPowerPreference;
  readonly errorCheckMode?: WebGL2ErrorCheckMode;
  /** Opt-in sampled-texture admission limits. */
  readonly textureBudgetPolicy?: import("./textures/TextureBudget").TextureBudgetPolicy;
}

/**
 * `strict`: `gl.getError()` after every uniform upload, vertex-format bind and draw (debugging only).
 * `frame`: one `getError` per frame.
 * `sampled` (default): `getError` on the first 30 frames after the device is created or restored, on any frame in which a
 * GPU resource or program was created or released, every 60th frame, and on every frame while an error is outstanding.
 */
export type WebGL2ErrorCheckMode = "strict" | "frame" | "sampled";

export class WebGL2Buffer implements RenderBuffer {
  public disposed = false;
  /** PRD-01 Phase 6 (CONTRACTS §6.1): device-side cleanup hook — VAO eviction. */
  public onDispose?: () => void;
  private disposing = false;
  private retirementStarted = false;
  private evictionComplete = false;
  private nativeDeleteComplete = false;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    public readonly target: GLenum,
    public readonly handle: WebGLBuffer,
    private readonly gl: WebGL2RenderingContext,
    private onRetirementStart?: (buffer: WebGL2Buffer) => void,
    private onRetirementComplete?: (buffer: WebGL2Buffer) => void
  ) {}

  /** Used by device teardown to leave an already-running retirement alone. */
  get retirementInProgress(): boolean {
    return this.disposing;
  }

  dispose(): void {
    if (this.disposed) return;
    // A nested geometry owner must not treat a no-op as successful release.
    if (this.disposing) throw new Error("WebGL buffer disposal is in progress");
    this.disposing = true;
    try {
      if (!this.retirementStarted) {
        this.onRetirementStart?.(this);
        this.retirementStarted = true;
        this.onRetirementStart = undefined;
      }
      if (!this.evictionComplete) {
        // A failed eviction must retain both the VAO and the buffer for retry.
        this.onDispose?.();
        this.evictionComplete = true;
        this.onDispose = undefined;
      }
      if (!this.nativeDeleteComplete) {
        this.gl.deleteBuffer(this.handle);
        this.nativeDeleteComplete = true;
      }
      this.onRetirementComplete?.(this);
      this.onRetirementComplete = undefined;
      this.disposed = true;
    } finally {
      this.disposing = false;
    }
  }
}

export class WebGL2ShaderProgram implements RenderShaderProgram {
  public disposed = false;
  /** A lost context has already reclaimed this program's native name. */
  public nativeInvalid = false;
  /** Device-side cleanup of the active-program shadow before GL deletion. */
  public onDispose?: () => void;
  private disposing = false;
  private callbackComplete = false;
  private nativeDeleteComplete = false;

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection,
    public readonly handle: WebGLProgram,
    private readonly gl: WebGL2RenderingContext
  ) {}

  get [resourceDisposalPending](): boolean {
    return this.disposing || (this.disposed && (!this.callbackComplete || !this.nativeDeleteComplete));
  }

  dispose(): void {
    if (this.disposing || (this.disposed && !this[resourceDisposalPending])) return;
    this.disposed = true;
    this.disposing = true;
    const errors: unknown[] = [];
    try {
      if (!this.callbackComplete) {
        try { this.onDispose?.(); this.callbackComplete = true; this.onDispose = undefined; } catch (error) { errors.push(error); }
      }
      if (!this.nativeDeleteComplete) {
        try { if (!this.nativeInvalid) this.gl.deleteProgram(this.handle); this.nativeDeleteComplete = true; } catch (error) { errors.push(error); }
      }
    } finally {
      this.disposing = false;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "WebGL shader disposal failed.");
  }
}

export interface WebGL2RenderTargetOptions {
  readonly dimension?: "2d" | "cube" | "2d-array";
  readonly layers?: number;
  readonly colorTextures?: readonly Texture[];
  readonly extraColorHandles?: readonly WebGLTexture[];
  /** Additional multisample renderbuffers owned by a multiple-color target. */
  readonly extraMultisampleColorHandles?: readonly WebGLRenderbuffer[];
  readonly layerFramebuffers?: readonly WebGLFramebuffer[];
  readonly layerTargets?: readonly RenderTarget[];
  /** Layer children share the parent's GL resources; dispose only marks them. */
  readonly layerChild?: boolean;
  readonly depthOnly?: boolean;
  readonly attachmentLayer?: number;
  readonly attachmentMipLevel?: number;
  /** Whether the draw framebuffer owns a stencil attachment. */
  readonly hasStencil?: boolean;
  /** Float when the depth attachment is DEPTH32F_STENCIL8 or DEPTH_COMPONENT32F. */
  readonly depthStorage?: import("./DepthConvention").DepthStorage;
}

export class WebGL2RenderTarget implements RenderTarget {
  public disposed = false;
  public needsResolve = false;
  /** Native names from a lost context cannot be deleted after restoration. */
  public nativeInvalid = false;
  /** Removes owned handles from the device registry before releasing them. */
  public onDispose?: () => void;
  /** Called once after the target's native objects have been released. */
  public onFreed?: () => void;
  /** Device-owned sampled attachments may remain alive while GPU work drains. */
  public retireTextures?: (handles: readonly WebGLTexture[], release: () => void) => void;
  public readonly dimension: "2d" | "cube" | "2d-array";
  public readonly layers?: number;
  public readonly colorTextures?: readonly Texture[];
  public readonly depthOnly: boolean;
  public readonly hasStencil: boolean;
  public readonly depthStorage?: import("./DepthConvention").DepthStorage;
  public readonly attachmentLayer?: number;
  public readonly attachmentMipLevel?: number;
  public layerTargets?: readonly RenderTarget[];
  private readonly extraColorHandles: readonly WebGLTexture[];
  // Mutable only through installSelectiveMultisample (4.7.x selective bloom MSAA promotion).
  private extraMultisampleColorHandles: readonly WebGLRenderbuffer[] = [];
  private readonly layerFramebuffers: readonly WebGLFramebuffer[];
  private readonly layerChild: boolean;
  private disposing = false;
  private freeing = false;
  private detachComplete = false;
  private retirementComplete = false;
  private retirementObserved = false;
  private freedComplete = false;
  private childDisposals?: Set<() => void>;
  private nativeDisposals?: Set<() => void>;
  private textureDisposals?: Set<() => void>;
  private nativeTextureDisposals?: Set<() => void>;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture: Texture | undefined,
    public readonly framebuffer: WebGLFramebuffer,
    public readonly colorHandle: WebGLTexture,
    public depthHandle: WebGLRenderbuffer | null,
    public readonly depthTextureHandle: WebGLTexture | null,
    public sampleCount: number,
    public drawFramebuffer: WebGLFramebuffer,
    public multisampleColorHandle: WebGLRenderbuffer | null,
    private readonly gl: WebGL2RenderingContext,
    options: WebGL2RenderTargetOptions = {}
  ) {
    this.dimension = options.dimension ?? "2d";
    this.layers = options.layers;
    this.colorTextures = options.colorTextures;
    this.layerTargets = options.layerTargets;
    this.extraColorHandles = options.extraColorHandles ?? [];
    this.extraMultisampleColorHandles = options.extraMultisampleColorHandles ?? [];
    this.layerFramebuffers = options.layerFramebuffers ?? [];
    this.layerChild = options.layerChild === true;
    this.depthOnly = options.depthOnly === true;
    this.hasStencil = options.hasStencil === true;
    if (options.depthStorage !== undefined) this.depthStorage = options.depthStorage;
    this.attachmentLayer = options.attachmentLayer;
    this.attachmentMipLevel = options.attachmentMipLevel;
  }

  /** Take ownership only after both multisample attachments are complete. */
  installSelectiveMultisample(
    sampleCount: number,
    framebuffer: WebGLFramebuffer,
    colors: readonly [WebGLRenderbuffer, WebGLRenderbuffer],
    depth: WebGLRenderbuffer
  ): void {
    this.sampleCount = sampleCount;
    this.drawFramebuffer = framebuffer;
    this.multisampleColorHandle = colors[0];
    this.extraMultisampleColorHandles = [colors[1]];
    this.depthHandle = depth;
  }

  get selectiveMultisampleAttachments(): boolean {
    return this.sampleCount > 1 && this.extraMultisampleColorHandles.length === 1;
  }

  get [resourceDisposalPending](): boolean {
    return this.disposing || this.freeing || (this.disposed && !this.layerChild &&
      (!this.retirementComplete || (this.textureDisposals?.size ?? 0) > 0 || (this.retirementObserved && !this.freedComplete)));
  }

  /** The retirement callback is also a receipt that the native names are gone. */
  private readonly finishTextureRetirement = (): void => {
    this.retirementObserved = true;
    if (this.freedComplete) return;
    if (this.freeing) throw new Error("WebGL render target retirement release is in progress");
    this.freeing = true;
    try {
      this.onFreed?.();
      this.freedComplete = true;
      this.onFreed = undefined;
    } finally {
      this.freeing = false;
    }
  };

  dispose(): void {
    // A nested owner must not mistake a no-op for successful release.
    if (this.disposing || this.freeing) throw new Error("WebGL render target disposal is in progress");
    if (this.disposed && !this[resourceDisposalPending]) return;
    this.disposed = true;
    if (this.layerChild) return;
    this.disposing = true;
    const errors: unknown[] = [];
    try {
      if (!this.nativeDisposals) {
        this.childDisposals = new Set();
        this.nativeDisposals = new Set();
        // Layer views share the parent's names; close them before any callback
        // or native deletion can reenter and attempt to use those aliases.
        for (const child of new Set(this.layerTargets ?? [])) this.childDisposals.add(() => { (child as WebGL2RenderTarget).disposed = true; });
        for (const framebuffer of new Set([...this.layerFramebuffers, this.framebuffer, this.drawFramebuffer])) {
          this.nativeDisposals.add(() => { if (!this.nativeInvalid) this.gl.deleteFramebuffer(framebuffer); });
        }
        for (const handle of new Set([this.depthHandle, this.multisampleColorHandle, ...this.extraMultisampleColorHandles])) {
          if (handle) this.nativeDisposals.add(() => { if (!this.nativeInvalid) this.gl.deleteRenderbuffer(handle); });
        }
      }
      for (const action of this.childDisposals ?? []) {
        try { action(); this.childDisposals!.delete(action); } catch (error) { errors.push(error); }
      }
      if (!this.detachComplete) {
        try { this.onDispose?.(); this.detachComplete = true; this.onDispose = undefined; } catch (error) { errors.push(error); }
      }
      for (const action of this.nativeDisposals) {
        try { action(); this.nativeDisposals.delete(action); } catch (error) { errors.push(error); }
      }
      // Detach before closing logical textures: otherwise the registry can
      // observe a disposed alias and retire the same native name separately.
      if (this.detachComplete) {
        if (!this.textureDisposals) {
          this.textureDisposals = new Set();
          for (const texture of new Set([this.colorTexture, ...(this.colorTextures ?? []), this.depthTexture])) {
            if (texture) this.textureDisposals.add(() => { if (!texture.disposed) texture.dispose(); });
          }
        }
        for (const action of this.textureDisposals) {
          try { action(); this.textureDisposals.delete(action); } catch (error) { errors.push(error); }
        }
        // Failed framebuffers still hold attachments; do not debit or retire
        // their native textures until those framebuffer deletions complete.
        if (this.nativeDisposals.size === 0 && (this.childDisposals?.size ?? 0) === 0 &&
          (!this.retirementComplete || (this.retirementObserved && !this.freedComplete))) {
          const handles = [...new Set([this.colorHandle, ...this.extraColorHandles, ...(this.depthTextureHandle ? [this.depthTextureHandle] : [])])];
          if (!this.retireTextures && !this.nativeTextureDisposals) {
            this.nativeTextureDisposals = new Set(handles.map(handle => () => { if (!this.nativeInvalid) this.gl.deleteTexture(handle); }));
          }
          for (const action of this.nativeTextureDisposals ?? []) {
            try { action(); this.nativeTextureDisposals!.delete(action); } catch (error) { errors.push(error); }
          }
          if ((this.nativeTextureDisposals?.size ?? 0) === 0) {
            try {
              // If the release callback already ran, the native names are gone;
              // retry only a failed debit rather than registering retirement twice.
              if (this.retirementObserved || this.nativeInvalid || !this.retireTextures) this.finishTextureRetirement();
              else this.retireTextures(handles, this.finishTextureRetirement);
              this.retirementComplete = true;
            } catch (error) {
              // A callback may complete and its caller then throw. Keep that
              // original error, but do not repeat the successful native release.
              if (this.freedComplete) this.retirementComplete = true;
              errors.push(error);
            }
          }
        }
      }
    } finally {
      this.disposing = false;
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, "WebGL render target disposal failed.");
  }
}















export interface WebGL2BloomDiagnostics {
  readonly quality: BloomQualityPreset;
  readonly mipCount: number;
  readonly targetCount: number;
  readonly targetBytes: number;
  readonly compositeGain: number;
  readonly threshold: number;
  readonly intensity: number;
  readonly softKnee: number;
  readonly shoulder: number;
  readonly halfFloat: boolean;
}













export class WebGL2Device implements RenderDevice {
  private currentFrameToken: object | null = null;

  /** Opaque identity of the active frame, invalidated by end, loss, or disposal. */
  get activeFrameToken(): object | null {
    if (this.host.disposed || !this.host.lifecycle.frameActive || this.host.lifecycle.isDeviceLost()) {
      this.currentFrameToken = null;
    }
    return this.currentFrameToken;
  }

  public readonly kind = "webgl2";
  public readonly info: RenderDeviceInfo;
  private readonly gl: WebGL2RenderingContext;
  private nextId = 1;



  private buffers = new Set<WebGL2Buffer>();
  /** Closed buffers remain owned until VAO eviction and native deletion succeed. */
  private readonly retiringBuffers = new Set<WebGL2Buffer>();
  private disposingDevice = false;
  private nativePostDisposalPending = false;
  private nativeRetirementDrainReady = false;
  private nativeRetirementDrainRegistered = false;
  private deviceDisposalActions?: Set<() => boolean | void>;
  private readonly deviceTargetDisposalActions = new Map<WebGL2RenderTarget, () => boolean>();
  private readonly staticUnlitBufferMirrors = new Map<WebGL2Buffer, StaticUnlitBufferMirror>();
  private staticUnlitMirrorBytes = 0;
  private staticUnlitMirrorRevision = 0;
  private staticUnlitOrdinaryPrograms = new WeakMap<RenderShaderProgram, number>();
  private staticUnlitPairProgram: { readonly generation: number; readonly shader: RenderShaderProgram } | undefined;
  private staticUnlitPairFailureGeneration: number | undefined;
  private staticUnlitPairTickets = new WeakMap<StaticUnlitPairTicket, StaticUnlitPairRecord>();
  private readonly staticGeneratedUniformMirrors = new Map<WebGL2Buffer, StaticUnlitBufferMirror>();
  private staticGeneratedUniformMirrorBytes = 0;
  private staticGeneratedUniformMirrorRevision = 0;
  private staticGeneratedFrameBinding: { readonly buffer: WebGL2Buffer; readonly generation: number; readonly revision: number } | undefined;
  private staticGeneratedFrameBindingRevision = 0;
  private staticGeneratedOrdinaryPrograms = new WeakMap<RenderShaderProgram, { readonly generation: number; readonly sources: ShaderSources; readonly reflection: StaticGeneratedReflectionProof }>();
  private readonly staticGeneratedPairPrograms = new Map<RenderShaderProgram, { readonly generation: number; readonly shader: RenderShaderProgram; readonly featureKey: string } | null>();
  private staticGeneratedPairTickets = new WeakMap<StaticGeneratedUnlitPairTicket, StaticGeneratedUnlitPairRecord>();
  private disposedBufferCount = 0;
  private shaders = new Set<WebGL2ShaderProgram>();
  private renderTargets = new Set<WebGL2RenderTarget>();
  /** Framebuffers can have multiple target views; initialize each physical stencil surface once. */
  private readonly initializedStencilFramebuffers = new WeakSet<WebGLFramebuffer>();
  private shaderGeneration = 0;
  private readonly cancelParallelCompiles = new Set<() => void>();
  private readonly cancelCompletionWaits = new Set<(reason: "CONTEXT_LOST" | "DISPOSED_DEVICE") => void>();
  private readonly gaussianSplatAdapters = new Set<WebGL2GaussianSplatColorAdapter>();
  private gaussianSplatBorrowedDepth: { readonly scene: WebGL2RenderTarget; readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null } | null = null;
  private outputColorSpaceNegotiation?: RenderOutputColorSpaceNegotiation;
  private displayOutputScope?: { readonly negotiation: RenderOutputColorSpaceNegotiation; readonly frameToken: object; readonly generation: number };
  private displayP3Verified = false;
  private activeDepthConvention: DepthConvention = negotiateDepthConvention({}, { clipRange: "minus-one-to-one", reversed: false, logarithmic: false });

  /** Changes whenever the context loses all of its GPU objects. */
  get generation(): number { return this.shaderGeneration; }

  get depthConvention(): DepthConvention { return this.activeDepthConvention; }

  getDepthConvention(): DepthConvention { return this.activeDepthConvention; }

  setDepthConvention(convention: DepthConvention): void {
    this.host.lifecycle.assertAlive();
    const mode = convention.mode;
    const reversed = mode === "reversed";
    // Zero-to-one is EXT_clip_control state, admitted only for reversed frames
    // (the renderer rebuilds their projection to match).
    const clipValid = convention.clipRange === "minus-one-to-one"
      || (convention.clipRange === "zero-to-one" && reversed && this.clipControlExtension() !== null);
    if (!clipValid || !["standard", "reversed", "logarithmic"].includes(mode)) {
      throw new RenderDeviceError("Depth convention does not match the WebGL2 clip range", "INVALID_DEPTH_CONVENTION", { clipRange: convention.clipRange, mode });
    }
    if (convention.clearValue !== (reversed ? 0 : 1) || convention.compare !== (reversed ? "greater-equal" : "less-equal") || convention.biasSign !== (reversed ? -1 : 1)) {
      throw new RenderDeviceError("Depth convention has inconsistent clear, comparison or bias values", "INVALID_DEPTH_CONVENTION");
    }
    this.activeDepthConvention = Object.freeze({ ...convention });
    this.syncClipControl();
  }

  /**
   * Reversed-Z precision on WebGL2: zero-to-one reversed rasterization needs
   * EXT_clip_control; DEPTH32F_STENCIL8 and DEPTH_COMPONENT32F are core.
   */
  getDepthPrecisionSupport(): DepthPrecisionSupport {
    return { standardClipRange: "minus-one-to-one", zeroToOneReversed: this.clipControlExtension() !== null, floatDepth: true, floatDepthStencil: true };
  }

  private clipControlCache: { readonly generation: number; readonly extension: ClipControlExtension | null } | null = null;
  /** GL clip-control state this device last set, per context generation (loss resets it). */
  private clipControlState: { readonly generation: number; readonly zeroToOne: boolean } | null = null;

  private clipControlExtension(): ClipControlExtension | null {
    if (this.clipControlCache?.generation === this.shaderGeneration) return this.clipControlCache.extension;
    // A lost context reports no extensions; query again once it is restored.
    if (this.host.contextLost) return null;
    let extension: ClipControlExtension | null = null;
    try {
      const candidate = this.gl.getExtension("EXT_clip_control") as Partial<ClipControlExtension> | null;
      if (candidate && typeof candidate.clipControlEXT === "function" && typeof candidate.LOWER_LEFT_EXT === "number"
        && typeof candidate.ZERO_TO_ONE_EXT === "number" && typeof candidate.NEGATIVE_ONE_TO_ONE_EXT === "number") extension = candidate as ClipControlExtension;
    } catch {
      extension = null;
    }
    this.clipControlCache = { generation: this.shaderGeneration, extension };
    return extension;
  }

  /** Make GL clip control match the active convention (standard and log frames reset it). */
  private syncClipControl(): void {
    const zeroToOne = this.activeDepthConvention.clipRange === "zero-to-one";
    const known = this.clipControlState?.generation === this.shaderGeneration ? this.clipControlState.zeroToOne : false;
    if (known === zeroToOne || this.host.contextLost) return;
    const extension = this.clipControlExtension();
    if (!extension) {
      if (zeroToOne) throw new RenderDeviceError("EXT_clip_control is unavailable for a zero-to-one depth convention", "INVALID_DEPTH_CONVENTION");
      return;
    }
    extension.clipControlEXT(extension.LOWER_LEFT_EXT, zeroToOne ? extension.ZERO_TO_ONE_EXT : extension.NEGATIVE_ONE_TO_ONE_EXT);
    this.clipControlState = { generation: this.shaderGeneration, zeroToOne };
  }




































  private readonly stateCache = new WebGL2StateCache({ label: "webgl2-device-state-cache" });






















  private readonly maxVertexAttributes: number;
  private readonly anisotropicFilteringExtension: TextureFilterAnisotropicExtension | null;
  private readonly maxTextureAnisotropy: number;
  /**
   * WS-2.6 — subscribers for context loss and restoration.
   *
   * The device has tracked `contextLost` since before 1.6 and acted on it internally, but nothing
   * could *observe* it: there was no callback, so a consumer could only poll `diagnostics()`. That is
   * why the parity table listed context-loss recovery as a gap while the listeners existed — the
   * device layer was never the gap, the absence of a public signal was.
   */






  private readonly host: WebGL2DeviceHost;
  private textureResidencyAdapter?: WebGL2TextureResidencyAdapter;
  private readonly targetTextureCharges = new Map<WebGL2RenderTarget, () => void>();
  private readonly targetGenerations = new WeakMap<WebGL2RenderTarget, number>();
  private renderTargetGeneration = 0;
  /** C-28: device capability probe, filled from extension detection in the ctor. */
  readonly probe: DeviceProbe;
  /**
   * Look-neutral bloom pass fusion (single-pass 2-D blur for small mips, one-pass mip sum, upsample folded into the
   * composite). Off by default; the engine turns it on for `quality: "auto"` / `"cinematic"` only, so `"production"`
   * keeps the original pass sequence.
   */
  bloomFusedPasses = false;
  /** Which fusions run when `bloomFusedPasses` is on (see `webgl2/BloomFusion.ts`). */
  bloomFusion: BloomFusionConfig = DEFAULT_BLOOM_FUSION;

  static create(options: WebGL2DeviceOptions): WebGL2Device {
    const alphaMode = options.presentationAlphaMode;
    if (alphaMode !== undefined && alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
      throw new RenderDeviceError("Unsupported canvas alpha mode", "OUTPUT_ALPHA_MODE_UNSUPPORTED", { alphaMode });
    }
    if (alphaMode !== undefined && options.alpha !== undefined && options.alpha !== (alphaMode !== "opaque")) {
      throw new RenderDeviceError("Canvas alpha and presentation mode disagree", "OUTPUT_ALPHA_MODE_UNAVAILABLE", { alpha: options.alpha, alphaMode });
    }
    const gl = options.canvas.getContext("webgl2", {
      antialias: options.antialias ?? true,
      alpha: alphaMode === undefined ? options.alpha ?? false : alphaMode !== "opaque",
      // Browsers default this to false. A previously acquired context can still
      // lack stencil, so draws validate the actual attachment before using it.
      stencil: true,
      ...(alphaMode === undefined ? {} : { premultipliedAlpha: alphaMode === "premultiplied" }),
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      ...(options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : {})
    });
    if (!gl) {
      throw new RenderDeviceError("WebGL2 is not available for the provided canvas", "WEBGL2_UNAVAILABLE");
    }
    // Default to frame-level error checking.
    //
    // `strict` calls `gl.getError()` after every uniform upload, vertex-format
    // bind, and draw. `gl.getError()` forces a synchronous CPU/GPU sync, so on a
    // scene with a few dozen draws and many uniforms per draw it dominates frame
    // time: profiling Aura Clash attributed ~93% of frame time to `getError`,
    // holding the route at ~11 FPS on an Apple M4 Max. Frame-level checking still
    // reports real WebGL errors (read once in `endFrame` and surfaced through
    // `lastError`); callers that need per-operation attribution can still opt into
    // `strict` explicitly.
    return new WebGL2Device(gl as WebGL2RenderingContext, options.canvas, options.errorCheckMode ?? "sampled", options.textureBudgetPolicy);
  }

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly errorCheckMode: WebGL2ErrorCheckMode,
    textureBudgetPolicy?: import("./textures/TextureBudget").TextureBudgetPolicy
  ) {
    this.gl = gl;
    // A browser returns the same WebGL2 context object after `webglcontextrestored`.
    // The controller that owned it before the loss is disposed before a replacement
    // device mounts, and Chromium can leave an INVALID_OPERATION from that stale
    // resource teardown in the context's error queue. A fresh device must establish
    // its own error boundary; otherwise its first valid uniform upload or presentation
    // is blamed for an error produced by the previous owner.
    for (let index = 0; index < 16 && gl.getError() !== gl.NO_ERROR; index += 1) {
      // Drain only errors that predate this device. Normal frame/strict checks still
      // report every error generated after construction.
    }
    this.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    this.anisotropicFilteringExtension = gl.getExtension("EXT_texture_filter_anisotropic") as TextureFilterAnisotropicExtension | null;
    this.maxTextureAnisotropy = this.anisotropicFilteringExtension
      ? Math.max(1, gl.getParameter(this.anisotropicFilteringExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 1;
    const fragmentTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    this.info = {
      backend: "webgl2",
      vendor: gl.getParameter(gl.VENDOR) as string,
      renderer: gl.getParameter(gl.RENDERER) as string,
      ...(typeof fragmentTextureUnits === "number" && Number.isSafeInteger(fragmentTextureUnits) && fragmentTextureUnits >= 0
        ? { maxFragmentTextureUnits: fragmentTextureUnits } : {}),
      capabilities: [
        "buffers",
        "buffer-readback",
        "shader-validation",
        "render-targets",
        "pixel-readback",
        "postprocess-presentation",
        "draw-validation",
        "rasterization",
        "depth-render-targets",
        "depth-textures",
        "spot-shadow-maps",
        "point-shadow-maps",
        "hdr-image-based-lighting",
        ...(gl.getExtension("EXT_float_blend") ? ["float-blending" as const] : []),
        ...(this.anisotropicFilteringExtension ? ["anisotropic-texture-filtering" as const] : []),
        ...(gl.getExtension("EXT_color_buffer_float") ? ["hdr-render-targets" as const, "float-readback" as const] : [])
      ]
    };

    const host = {
      gl,
      stateCache: this.stateCache,
      counters: new WebGL2Counters(),
      buffers: this.buffers,
      shaders: this.shaders,
      renderTargets: this.renderTargets,
      activeRenderTarget: null,
      disposed: false,
      contextLost: false,
      errorCheckMode: this.errorCheckMode,
      anisotropicFilteringExtension: this.anisotropicFilteringExtension,
      maxTextureAnisotropy: this.maxTextureAnisotropy,
      maxVertexAttributes: this.maxVertexAttributes,
      textureBudgetPolicy,
      resolveMultisampleTarget: (target: WebGL2RenderTarget) => this.resolveMultisampleTarget(target),
      device: this
    } as unknown as WebGL2DeviceHost;
    host.lifecycle = new WebGL2ContextLifecycle(host, canvas);
    host.textureRegistry = new WebGL2TextureRegistry(host);
    host.samplers = new WebGL2SamplerRegistry(host);
    host.drawBinder = new WebGL2DrawCallBinder(host);
    // #94 (Q-01-1): the C-29 restore hook (`renderer/DeviceLifecycle.ts`)
    // calls `host.invalidateGpuObjects?.()` before the registry rebuild.
    (host as WebGL2DeviceHost & { invalidateGpuObjects: () => void }).invalidateGpuObjects = () => this.invalidateGpuObjects();
    host.probe = new WebGL2ReadbackProbe(host);
    host.post = new WebGL2LegacyPostPipeline(host);
    this.host = host;
    host.lifecycle.onDeviceLost(() => {
      this.currentFrameToken = null;
      this.clearStaticUnlitBufferMirrors();
      this.staticUnlitOrdinaryPrograms = new WeakMap();
      this.staticUnlitPairProgram = undefined;
      this.staticUnlitPairFailureGeneration = undefined;
      this.staticUnlitPairTickets = new WeakMap();
      // Standalone devices need to forget the old extension even without a
      // renderer-installed restore hook. The next live query reacquires it.
      host.drawBinder.invalidateMultiDrawExtension();
      for (const cancel of [...this.cancelCompletionWaits]) cancel("CONTEXT_LOST");
      // GPU names and their charges are invalid before observers replan work.
      host.textureRegistry.invalidateTextureHandles();
      this.renderTargetGeneration += 1;
      for (const target of this.renderTargets) target.nativeInvalid = true;
      for (const shader of this.shaders) shader.nativeInvalid = true;
      for (const release of this.targetTextureCharges.values()) release();
      this.targetTextureCharges.clear();
      this.textureResidencyAdapter?.invalidate(true);
      this.shaderGeneration += 1;
      this.outputColorSpaceNegotiation = undefined;
      this.displayP3Verified = false;
      for (const cancel of [...this.cancelParallelCompiles]) cancel();
      disposeNativePostEffectsForHost(host);
    });
    host.lifecycle.onDeviceRestored(() => this.textureResidencyAdapter?.restore());
    this.probe = createWebGL2DeviceProbe(gl);

  }

  /**
   * Subscribe to WebGL context loss. Returns an unsubscribe function.
   *
   * A lost context is not an error a caller can prevent — the browser reclaims GPU resources under
   * memory pressure, on driver reset, or when a tab is backgrounded too long. What a caller can do is
   * be told, so it can recreate resources rather than render nothing.
   */




  get disposed(): boolean {
    return this.host.disposed;
  }

  /** The device closes immediately, but incomplete cleanup remains owned for retry. */
  get [resourceDisposalPending](): boolean {
    return this.disposingDevice || (this.host.disposed &&
      (this.nativePostDisposalPending || (this.deviceDisposalActions?.size ?? 0) > 0 || this.buffers.size > 0
        || this.retiringBuffers.size > 0 || this.host.drawBinder.vertexArrayCache.size > 0
        || [...this.renderTargets].some(target => target[resourceDisposalPending])));
  }

  set disposed(value: boolean) {
    this.host.disposed = value;
  }

  get contextLost(): boolean {
    return this.host.contextLost;
  }

  set contextLost(value: boolean) {
    this.host.contextLost = value;
  }

  onDeviceLost(listener: () => void): () => void {
    return this.host.lifecycle.onDeviceLost(listener);
  }

  onDeviceRestored(listener: () => void): () => void {
    return this.host.lifecycle.onDeviceRestored(listener);
  }

  isDeviceLost(): boolean {
    return this.host.lifecycle.isDeviceLost();
  }

  /** Check API presence, not successful allocation, progress, or context authenticity. */
  supportsSubmittedWorkCompletion(): boolean {
    try {
      const generation = this.shaderGeneration;
      if (this.host.disposed || this.isDeviceLost()) return false;
      const api = webGLCompletionFenceApi(this.gl);
      return api !== undefined && !this.host.disposed && !this.host.contextLost && this.shaderGeneration === generation;
    } catch {
      return false;
    }
  }

  /**
   * Fence the commands already issued on this context. Each call owns its own
   * sync and polls asynchronously with a zero GPU timeout. A rejection is not
   * proof of completion and must not be used to retire in-flight resources.
   */
  waitForSubmittedWork(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const gl = this.gl;
      const generation = this.shaderGeneration;
      let api: WebGLCompletionFenceApi | undefined;
      let sync: WebGLSync | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      let polls = 0;
      const started = Date.now();

      const stateError = (): RenderDeviceError | undefined => {
        if (this.host.disposed) return new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
        const lost = this.isDeviceLost();
        if (this.host.disposed) return new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
        if (lost || this.host.contextLost || this.shaderGeneration !== generation) return new RenderDeviceError("Render context was lost while waiting for GPU completion", "CONTEXT_LOST");
        return undefined;
      };
      const failed = (stage: string, detail?: unknown): RenderDeviceError =>
        new RenderDeviceError("WebGL2 GPU completion could not be verified", "GPU_COMPLETION_FAILED", { stage, ...(detail === undefined ? {} : { detail }) });

      // A lost context has already invalidated its sync objects. A disposed but
      // still live context must delete the sync even though work may be pending.
      const deleteOwnedSync = (): unknown => {
        const owned = sync;
        sync = null;
        if (!owned || !api) return undefined;
        try {
          if (!this.isDeviceLost() && this.shaderGeneration === generation) api.deleteSync.call(gl, owned);
          return undefined;
        } catch (error) {
          return error;
        }
      };
      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
        this.cancelCompletionWaits.delete(cancel);
        const cleanupError = deleteOwnedSync();
        if (error === undefined) {
          try { error = stateError(); } catch (stateFailure) { error = failed("context-state", stateFailure); }
          if (error === undefined && cleanupError !== undefined) error = failed("deleteSync", cleanupError);
        }
        if (error === undefined) resolve();
        else reject(error);
      };
      const cancel = (reason: "CONTEXT_LOST" | "DISPOSED_DEVICE"): void => finish(
        reason === "CONTEXT_LOST"
          ? new RenderDeviceError("Render context was lost while waiting for GPU completion", reason)
          : new RenderDeviceError("Render device was disposed while waiting for GPU completion", reason)
      );
      const schedule = (poll: () => void, delay: number): void => {
        timer = setTimeout(poll, delay);
        (timer as unknown as { unref?: () => void }).unref?.();
      };

      try {
        const initialError = stateError();
        if (initialError) { finish(initialError); return; }
        api = webGLCompletionFenceApi(gl);
        if (!api) {
          finish(new RenderDeviceError("WebGL2 fence completion APIs are unavailable", "GPU_COMPLETION_UNAVAILABLE"));
          return;
        }
        const afterProbe = stateError();
        if (afterProbe) { finish(afterProbe); return; }
        // Register before crossing into GL: a context loss or disposal can be
        // delivered reentrantly while the sync is being created or flushed.
        this.cancelCompletionWaits.add(cancel);
        const created = api.fenceSync.call(gl, api.condition, 0);
        if (settled) {
          sync = created;
          deleteOwnedSync();
          return;
        }
        sync = created;
        const afterCreate = stateError();
        if (afterCreate) { finish(afterCreate); return; }
        if (!sync) { finish(failed("fenceSync")); return; }
        api.flush.call(gl);
        if (settled) return;
        const afterFlush = stateError();
        if (afterFlush) { finish(afterFlush); return; }

        const poll = (): void => {
          timer = undefined;
          if (settled) return;
          try {
            const beforePoll = stateError();
            if (beforePoll) { finish(beforePoll); return; }
            const status = api!.clientWaitSync.call(gl, sync!, 0, 0);
            if (settled) return;
            const afterPoll = stateError();
            if (afterPoll) { finish(afterPoll); return; }
            if (status === api!.alreadySignaled || status === api!.conditionSatisfied) { finish(); return; }
            if (status !== api!.timeoutExpired) {
              finish(failed(status === api!.waitFailed ? "clientWaitSync" : "clientWaitSync-status", status));
              return;
            }
            polls += 1;
            if (polls >= COMPLETION_POLL_LIMIT || Date.now() - started >= COMPLETION_POLL_TIMEOUT_MS) {
              finish(new RenderDeviceError("WebGL2 GPU completion timed out", "GPU_COMPLETION_TIMEOUT", { polls }));
              return;
            }
            schedule(poll, COMPLETION_POLL_INTERVAL_MS);
          } catch (error) {
            finish(failed("clientWaitSync", error));
          }
        };
        schedule(poll, 0);
      } catch (error) {
        finish(failed("fenceSync-or-flush", error));
      }
    });
  }

  /** Device-local bridge for the opt-in streamed-texture controller. */
  createTextureResidencyAdapter(): WebGL2TextureResidencyAdapter {
    this.host.lifecycle.assertAlive();
    return this.textureResidencyAdapter ??= new WebGL2TextureResidencyAdapter(this.host);
  }

  /** Release only the persistent native-effect surfaces for this view. */
  releaseNativePostEffectView(scopeId: object, viewId: string | number): void {
    releaseNativePostEffectViewForHost(this.host, scopeId, viewId);
  }

  /** Release the native-effect surfaces owned by one renderer. */
  releaseNativePostEffectScope(scopeId: object): void {
    releaseNativePostEffectScopeForHost(this.host, scopeId);
  }

  /** Negotiate presentation on this context and report only values it accepts. */
  negotiateOutputColorSpace(requested: RenderOutputColorSpace = "srgb"): RenderOutputColorSpaceNegotiation {
    this.host.lifecycle.assertAlive();
    if (requested !== "srgb" && requested !== "display-p3") {
      throw new RenderDeviceError("Unsupported output color space", "INVALID_OUTPUT_COLOR_SPACE", { requested });
    }
    if (this.displayOutputScope && requested !== this.displayOutputScope.negotiation.active) {
      throw new RenderDeviceError("A display postprocess output is being presented", "OUTPUT_COLOR_SPACE_BUSY");
    }
    const gl = this.gl as WebGL2RenderingContext & { drawingBufferColorSpace?: string };
    let active: RenderOutputColorSpace = "srgb";
    let fallbackReason: string | undefined;
    if (!("drawingBufferColorSpace" in gl)) {
      if (requested !== "srgb") fallbackReason = "Drawing buffer color-space selection is unavailable";
    } else {
      const fallbackToSrgb = (): void => {
        if (gl.drawingBufferColorSpace !== "srgb") gl.drawingBufferColorSpace = "srgb";
        if (gl.drawingBufferColorSpace !== "srgb") {
          throw new RenderDeviceError("Unable to verify the drawing buffer color space", "OUTPUT_COLOR_SPACE_UNVERIFIED");
        }
      };
      try {
        gl.drawingBufferColorSpace = requested;
        const selected = gl.drawingBufferColorSpace;
        if (selected === requested) {
          active = requested;
          if (requested === "display-p3") this.displayP3Verified = true;
        } else {
          fallbackReason = `Drawing buffer did not accept ${requested}`;
          fallbackToSrgb();
        }
      } catch (error) {
        if (error instanceof RenderDeviceError && error.code === "OUTPUT_COLOR_SPACE_UNVERIFIED") throw error;
        try {
          fallbackToSrgb();
        } catch {
          throw new RenderDeviceError("Unable to verify the drawing buffer color space", "OUTPUT_COLOR_SPACE_UNVERIFIED");
        }
        if (requested !== "srgb") fallbackReason = `Drawing buffer did not accept ${requested}`;
      }
    }
    const supported: RenderOutputColorSpace[] = this.displayP3Verified ? ["srgb", "display-p3"] : ["srgb"];
    const result: RenderOutputColorSpaceNegotiation = { requested, active, supported, ...(fallbackReason ? { fallbackReason } : {}) };
    // A nested same-space query must not erase the frame's original request.
    if (!this.displayOutputScope) this.outputColorSpaceNegotiation = result;
    return result;
  }

  /** Use the verified sRGB drawing buffer while retaining the caller's P3 request. */
  negotiateSrgbOutputFallback(requested: "display-p3", reason: string): RenderOutputColorSpaceNegotiation {
    if (requested !== "display-p3" || typeof reason !== "string" || !reason.trim()) {
      throw new RenderDeviceError("Invalid output color-space fallback", "INVALID_OUTPUT_COLOR_SPACE", { requested });
    }
    if (this.displayOutputScope) {
      throw new RenderDeviceError("A display postprocess output is being presented", "OUTPUT_COLOR_SPACE_BUSY");
    }
    const fallback = this.negotiateOutputColorSpace("srgb");
    if (fallback.active !== "srgb") {
      throw new RenderDeviceError("Unable to verify the sRGB drawing buffer", "OUTPUT_COLOR_SPACE_UNVERIFIED");
    }
    const result: RenderOutputColorSpaceNegotiation = Object.freeze({
      requested,
      active: "srgb",
      supported: Object.freeze([...fallback.supported]),
      fallbackReason: reason
    });
    this.outputColorSpaceNegotiation = result;
    return result;
  }

  /** Keep a P3-requested, sRGB-encoded post tail bound to its selected canvas space. */
  beginSrgbOutputFallbackScope(reason: string): { readonly negotiation: RenderOutputColorSpaceNegotiation; assertCurrent(): void; release(): void } {
    this.assertCanBeginDisplayOutputScope();
    const negotiation = this.negotiateSrgbOutputFallback("display-p3", reason);
    return this.openDisplayOutputScope(negotiation);
  }

  /** Negotiate P3 for a supported post tail, or retain the device's sRGB fallback. */
  beginP3DisplayOutputScope(): { readonly negotiation: RenderOutputColorSpaceNegotiation; assertCurrent(): void; release(): void } {
    this.assertCanBeginDisplayOutputScope();
    const selected = this.negotiateOutputColorSpace("display-p3");
    const negotiation: RenderOutputColorSpaceNegotiation = Object.freeze({ ...selected, supported: Object.freeze([...selected.supported]) });
    this.outputColorSpaceNegotiation = negotiation;
    return this.openDisplayOutputScope(negotiation);
  }

  private assertCanBeginDisplayOutputScope(): void {
    this.host.lifecycle.assertAlive();
    if (this.displayOutputScope) throw new RenderDeviceError("A display postprocess output is being presented", "OUTPUT_COLOR_SPACE_BUSY");
    if (!this.activeFrameToken) throw new RenderDeviceError("Display postprocessing requires an active frame", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
  }

  private openDisplayOutputScope(negotiation: RenderOutputColorSpaceNegotiation): { readonly negotiation: RenderOutputColorSpaceNegotiation; assertCurrent(): void; release(): void } {
    const frameToken = this.activeFrameToken;
    if (!frameToken) throw new RenderDeviceError("Display postprocessing requires an active frame", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
    const scope = { negotiation, frameToken, generation: this.generation };
    this.displayOutputScope = scope;
    let released = false;
    return {
      negotiation,
      assertCurrent: () => {
        if (released || this.displayOutputScope !== scope) {
          throw new RenderDeviceError("The output fallback scope is no longer current", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
        }
        this.assertDisplayOutputScope();
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.displayOutputScope === scope) this.displayOutputScope = undefined;
      }
    };
  }

  /** Reject a changed canvas or frame before the scoped tail submits a draw. */
  assertDisplayOutputScope(expected?: RenderOutputColorSpace): void {
    const scope = this.displayOutputScope;
    if (!scope) {
      if (expected) throw new RenderDeviceError("A verified display output scope is required", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
      return;
    }
    this.host.lifecycle.assertAlive();
    if ((expected && scope.negotiation.active !== expected) || this.activeFrameToken !== scope.frameToken || this.generation !== scope.generation) {
      throw new RenderDeviceError("The display output scope no longer matches the active frame", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
    }
    const gl = this.gl as WebGL2RenderingContext & { drawingBufferColorSpace?: string };
    try {
      if (!("drawingBufferColorSpace" in gl)) {
        if (scope.negotiation.active === "srgb") return;
        this.outputColorSpaceNegotiation = undefined;
      } else {
        if (gl.drawingBufferColorSpace === scope.negotiation.active) return;
        gl.drawingBufferColorSpace = scope.negotiation.active;
        if (gl.drawingBufferColorSpace !== scope.negotiation.active) this.outputColorSpaceNegotiation = undefined;
      }
    } catch {
      this.outputColorSpaceNegotiation = undefined;
    }
    throw new RenderDeviceError("The drawing buffer color space changed during postprocessing", "OUTPUT_COLOR_SPACE_UNAVAILABLE");
  }

  /** Backward-compatible internal alias for the scoped sRGB fallback. */
  assertSrgbOutputFallbackScope(): void { this.assertDisplayOutputScope(); }

  /** @internal Validate the exact raw attachment owned by a private display lease. */
  assertEncodedDisplayTarget(target: RenderTarget): void {
    this.host.lifecycle.assertAlive();
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed || target.nativeInvalid
        || this.targetGenerations.get(target) !== this.renderTargetGeneration || this.host.lifecycle.isDeviceLost()
        || target.depthOnly || target.dimension !== "2d" || target.sampleCount !== 1
        || (target.attachmentLayer ?? 0) !== 0 || (target.attachmentMipLevel ?? 0) !== 0
        || (target.colorTextures?.length ?? 1) !== 1 || target.colorTexture.disposed
        || target.colorTexture.format !== "rgba8" || target.colorTexture.colorSpace !== "linear"
        || target.colorTexture.dimension !== "2d" || target.colorTexture.mipLevelCount !== 1
        || target.framebuffer !== target.drawFramebuffer || !target.framebuffer || !target.colorHandle
        || getRenderTargetTextureOwner(target.colorTexture) !== this
        || this.host.textureRegistry.textures.get(target.colorTexture) !== target.colorHandle) {
      throw new RenderDeviceError("Encoded display output requires a live device-owned raw RGBA8 attachment", "INVALID_RENDER_TARGET");
    }
  }

  getOutputColorSpaceNegotiation(): RenderOutputColorSpaceNegotiation | undefined {
    return this.outputColorSpaceNegotiation;
  }

  getPresentationAlphaMode(): "opaque" | "straight" | "premultiplied" | undefined {
    try {
      const attributes = this.gl.getContextAttributes?.();
      if (!attributes || typeof attributes.alpha !== "boolean") return undefined;
      if (!attributes.alpha) return "opaque";
      if (typeof attributes.premultipliedAlpha !== "boolean") return undefined;
      return attributes.premultipliedAlpha ? "premultiplied" : "straight";
    } catch {
      return undefined;
    }
  }

  beginFrame(width: number, height: number): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.beginFrame(width, height);
    // A restored context starts with default clip control; re-assert the frame's.
    this.syncClipControl();
    this.primitiveCounts = { triangles: 0, lines: 0, points: 0 };
    this.currentFrameToken = this.host.lifecycle.frameActive && !this.host.contextLost ? {} : null;
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.clear(color, this.activeDepthConvention.clearValue);
  }

  clearRenderTarget(color: readonly [number, number, number, number], attachment?: number): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.clearRenderTarget(color, attachment, this.activeDepthConvention.clearValue);
  }

  endFrame(): void {
    this.assertOutsideGaussianSplatDraw();
    try {
      this.host.lifecycle.endFrame();
    } finally {
      if (!this.host.lifecycle.frameActive) this.currentFrameToken = null;
    }
  }

  draw(command: DrawCommand): void {
    this.host.lifecycle.assertFrame();
    let effectiveCommand = command;
    if (this.gaussianSplatBorrowedDepth) {
      if (command.renderState?.stencil) {
        throw new RenderDeviceError("A Gaussian splat draw cannot use borrowed stencil", "GAUSSIAN_SPLAT_STENCIL_UNSUPPORTED");
      }
      if (command.renderState?.depthWrite !== false || command.renderState.depthTest !== true) {
        throw new RenderDeviceError("A Gaussian splat draw must test and cannot write its borrowed depth attachment", "GAUSSIAN_SPLAT_DEPTH_WRITE_UNSUPPORTED");
      }
      if (command.renderState.scissor) throw new RenderDeviceError("A Gaussian splat draw cannot override its borrowed view scissor", "GAUSSIAN_SPLAT_SCISSOR_UNSUPPORTED");
      for (const value of command.uniforms?.values() ?? []) {
        if (isTextureBinding(value) && value.texture && value.texture === this.gaussianSplatBorrowedDepth.scene.depthTexture) {
          throw new RenderDeviceError("A Gaussian splat draw cannot sample its borrowed depth attachment", "RENDER_ATTACHMENT_HAZARD");
        }
      }
      if (this.gaussianSplatBorrowedDepth.scissor) {
        effectiveCommand = { ...command, renderState: { ...command.renderState, scissor: this.gaussianSplatBorrowedDepth.scissor } };
      }
    }
    this.validateStencilAttachment(command);
    this.validateDrawAttachmentHazards(effectiveCommand);
    this.host.drawBinder.draw(effectiveCommand);
    this.countPrimitives(effectiveCommand);
  }

  /** Capture must observe a GL draw failure before publishing its copied image. */
  drawTransmissionCapture(command: DrawCommand): void {
    this.draw(command);
    const error = this.host.lifecycle.readError();
    if (error || this.host.lifecycle.isDeviceLost()) throw new RenderDeviceError("WebGL transmission capture draw failed", "TRANSMISSION_CAPTURE_FAILED", { error });
  }

  private validateDrawAttachmentHazards(command: DrawCommand): void {
    const target = this.host.activeRenderTarget;
    if (!target || !command.shader || !command.uniforms) return;
    for (const [name, value] of command.uniforms) {
      if (!isTextureBinding(value) || !value.texture) continue;
      if (!command.shader.reflection.uniforms.has(name)) continue;
      // A sampler may address any mip or layer, so without an explicit view
      // its whole texture must differ from each framebuffer attachment.
      if ((!target.depthOnly && (target.colorTextures ?? [target.colorTexture]).includes(value.texture)) || target.depthTexture === value.texture) {
        throw new RenderDeviceError("A draw cannot sample a texture attached to its active render target", "RENDER_ATTACHMENT_HAZARD", { uniform: name, targetId: target.id });
      }
    }
  }

  private validateStencilAttachment(command: DrawCommand): void {
    if (command.renderState?.stencil && !this.host.lifecycle.hasStencilAttachment()) {
      throw new RenderDeviceError("Stencil state requires a stencil attachment on the active framebuffer", "STENCIL_ATTACHMENT_REQUIRED");
    }
  }

  /** Per-frame primitive totals for `getDiagnostics()` (`info().render.triangles`); reset in `beginFrame` and `resetFrameCounters`. */
  private primitiveCounts = { triangles: 0, lines: 0, points: 0 };

  private countPrimitives(command: DrawCommand): void {
    const elements = command.indexBuffer ? command.indexCount ?? 0 : command.vertexCount;
    const instances = Math.max(1, command.instanceCount ?? 1);
    if (command.topology === "lines") this.primitiveCounts.lines += Math.floor(elements / 2) * instances;
    else if (command.topology === "points") this.primitiveCounts.points += elements * instances;
    else this.primitiveCounts.triangles += Math.floor(elements / 3) * instances;
  }

  readPixels(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array {
    return this.host.probe.readPixels(x, y, width, height, attachment);
  }

  readFloatPixels(x: number, y: number, width: number, height: number, attachment?: number): Float32Array {
    return this.host.probe.readFloatPixels(x, y, width, height, attachment);
  }

  async readFloatRenderTarget(options: RenderResourceReadbackOptions): Promise<Float32Array> {
    this.host.lifecycle.assertAlive();
    throwIfWebGLResourceTransferAborted(options.signal);
    const target = this.requireTransferTarget(options.target);
    const attachment = options.attachment ?? 0;
    const identity = getRenderAttachmentIdentity(target, "color", attachment);
    if (identity.format !== "rgba16f" && identity.format !== "rgba32f") {
      throw new RenderDeviceError("Float target readback requires an rgba16f or rgba32f color attachment", "INVALID_RESOURCE_READBACK");
    }
    if (target.layerTargets?.length) {
      throw new RenderDeviceError("Select a concrete render-target layer before readback", "INVALID_RESOURCE_READBACK");
    }
    await Promise.resolve();
    throwIfWebGLResourceTransferAborted(options.signal);
    this.host.lifecycle.assertAlive();
    this.requireTransferTarget(target);
    const pixels = this.host.probe.readFloatTarget(target, 0, 0, target.width, target.height, attachment);
    throwIfWebGLResourceTransferAborted(options.signal);
    return pixels;
  }

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    return this.host.probe.readDepthPixels(x, y, width, height);
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.host.probe.writeRenderTargetPixels(target, pixels);
  }

  presentRenderTarget(source: RenderTarget): void {
    this.host.post.presentRenderTarget(source);
  }

  presentLdrPostprocess(source: RenderTarget, options: LdrPostprocessPresentationOptions): void {
    this.host.post.presentLdrPostprocess(source, options);
  }

  executeReflectionSurfaceSsr(source: RenderTarget, normalMask: RenderTarget, output: RenderTarget,
    options: { projection: Float32Array; inverseProjection: Float32Array; maxSteps: number; maxDistance: number; thickness: number; intensity: number }): void {
    this.host.post.executeReflectionSurfaceSsr(source, normalMask, output, options);
  }

  getBloomDiagnostics(): WebGL2BloomDiagnostics | null {
    return this.host.post.getBloomDiagnostics();
  }

  /** C-28: partial counters from existing diagnostics and the wrapped counter fields. */
  counters(): DeviceCounters {
    const diagnostics = this.getDiagnostics();
    return {
      drawCalls: this.host.counters.drawCalls,
      bufferCreates: diagnostics.buffers,
      textureUploads: diagnostics.textures ?? 0,
      readbacks: this.host.counters.readbacks,
      renderTargetsCreated: diagnostics.renderTargets ?? 0,
      programCompiles: this.host.counters.programCompiles,
      liveBuffers: diagnostics.buffers,
      liveVertexArrays: this.host.drawBinder.vertexArrayCache.size,
      textureBytes: diagnostics.textureBytes ?? 0,
      renderTargetBytes: 0
    };
  }

  resetFrameCounters(): void {
    this.host.counters.drawCalls = 0;
    this.primitiveCounts = { triangles: 0, lines: 0, points: 0 };
    this.host.counters.readbacks = 0;
  }

  /**
   * PRD-01 §6.4 / 01-S7: with `KHR_parallel_shader_compile`, compile and
   * link are issued without querying status, and the promise resolves once
   * `COMPLETION_STATUS_KHR` reports done (polled per animation frame), so
   * the caller's frame is not blocked. Without the extension this is the
   * synchronous `createShaderProgram` wrapped in a resolved promise.
   */
  compileAsync(sources: ShaderSources): Promise<RenderShaderProgram> {
    let vertexShader: WebGLShader | undefined;
    let fragmentShader: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    try {
      this.host.lifecycle.assertAlive();
      this.assertShaderMarker(sources);
      this.assertPortableShaderBindingsSupported(sources);
      const ext = this.parallelShaderCompileExtension();
      if (!ext) return Promise.resolve(this.createShaderProgram(sources));
      const compiledVertex = sources.vertex;
      vertexShader = this.issueShaderCompile(this.gl.VERTEX_SHADER, compiledVertex, sources.label);
      const compiledFragment = sources.fragment;
      fragmentShader = this.issueShaderCompile(this.gl.FRAGMENT_SHADER, compiledFragment, sources.label);
      const recorded = getRecordedStaticGeneratedUnlitSources(sources);
      const generatedSources = recorded && recorded.vertex === compiledVertex && recorded.fragment === compiledFragment ? recorded : undefined;
      program = this.gl.createProgram() ?? undefined;
      if (!program) throw new RenderDeviceError("Failed to allocate WebGL shader program", "WEBGL_ALLOCATION_FAILED");
      this.host.counters.shaderProgramCreateCount += 1;
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);
      this.host.counters.programCompiles += 1;

      const vertex = vertexShader;
      const fragment = fragmentShader;
      const linkedProgram = program;
      const generation = this.shaderGeneration;
      this.parallelCompilesPending += 1;
      return new Promise<RenderShaderProgram>((resolve, reject) => {
        let settled = false;
        let cancelScheduled: (() => void) | undefined;
        const finish = (error?: unknown, result?: RenderShaderProgram): void => {
          if (settled) return;
          settled = true;
          cancelScheduled?.();
          this.cancelParallelCompiles.delete(cancel);
          this.parallelCompilesPending -= 1;
          // A broken/losing context must not prevent the other releases or
          // strand the promise after the pending count has been decremented.
          try { this.gl.deleteShader(vertex); } catch { /* context already unavailable */ }
          try { this.gl.deleteShader(fragment); } catch { /* context already unavailable */ }
          if (!result) {
            try { this.gl.deleteProgram(linkedProgram); } catch { /* context already unavailable */ }
          }
          if (result) resolve(result);
          else reject(error);
        };
        const cancel = (): void => finish(new RenderDeviceError("Device lost during parallel shader compile", "DEVICE_LOST", { label: sources.label }));
        const poll = (): void => {
          cancelScheduled = undefined;
          if (settled) return;
          if (this.host.disposed || this.isDeviceLost() || generation !== this.shaderGeneration) {
            cancel();
            return;
          }
          try {
            if (this.gl.getProgramParameter(linkedProgram, ext.COMPLETION_STATUS_KHR) !== true) {
              cancelScheduled = scheduleParallelCompilePoll(poll);
              return;
            }
            for (const [shader, type] of [[vertex, "vertex"], [fragment, "fragment"]] as const) {
              if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
                const log = this.gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
                throw new RenderDeviceError(shaderCompileFailureMessage(log, { label: sources.label, stage: type }), "SHADER_COMPILE_FAILED", { label: sources.label, log, stage: type });
              }
            }
            const result = this.finalizeLinkedProgram(linkedProgram, sources);
            const reflection = generatedSources && staticUnlitDeviceMethodsCurrent(this) && result instanceof WebGL2ShaderProgram
              ? captureStaticGeneratedReflection(result) : undefined;
            if (generatedSources && reflection && generation === this.shaderGeneration && !this.host.contextLost && !this.host.disposed
              && result.marker === generatedSources.marker && result.label === generatedSources.label) {
              this.staticGeneratedOrdinaryPrograms.set(result, { generation, sources: generatedSources, reflection });
            }
            finish(undefined, result);
          } catch (error) {
            finish(error);
          }
        };
        this.cancelParallelCompiles.add(cancel);
        try { cancelScheduled = scheduleParallelCompilePoll(poll); } catch (error) { finish(error); }
      });
    } catch (error) {
      if (vertexShader) this.gl.deleteShader(vertexShader);
      if (fragmentShader) this.gl.deleteShader(fragmentShader);
      if (program) this.gl.deleteProgram(program);
      return Promise.reject(error);
    }
  }

  /** Programs issued through `compileAsync`'s parallel path that have not completed yet. */
  parallelCompilesPending = 0;

  private parallelCompileExt: { readonly COMPLETION_STATUS_KHR: GLenum } | null | undefined;

  private parallelShaderCompileExtension(): { readonly COMPLETION_STATUS_KHR: GLenum } | null {
    if (this.parallelCompileExt === undefined) {
      this.parallelCompileExt = (this.gl.getExtension("KHR_parallel_shader_compile") as { readonly COMPLETION_STATUS_KHR: GLenum } | null) ?? null;
    }
    return this.parallelCompileExt;
  }

  private issueShaderCompile(type: GLenum, source: string, label: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new RenderDeviceError("Failed to allocate WebGL shader", "WEBGL_ALLOCATION_FAILED", { label });
    }
    try {
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      return shader;
    } catch (error) {
      this.gl.deleteShader(shader);
      throw error;
    }
  }

  private assertShaderMarker(sources: ShaderSources): void {
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
  }

  private assertPortableShaderBindingsSupported(sources: ShaderSources): void {
    const multisampledDepth = sources.portableBindings?.find((binding) => binding.kind === "depth2d-multisampled");
    if (multisampledDepth) {
      throw new RenderDeviceError("WebGL2 does not support multisampled depth texture bindings", "WEBGL_MULTISAMPLED_DEPTH_UNSUPPORTED", {
        label: sources.label,
        binding: multisampledDepth.name
      });
    }
    // S5-WP05-03: well-formed data schemas are lowered by the render passes to
    // GL leaf uniforms (webgl2/UniformDataFlatten.ts) and uploaded with the
    // declared type's setter. Reject only malformed metadata before compiling:
    // a data binding without a schema, or a schema on a non-data binding.
    const data = sources.portableBindings?.find((binding) => {
      if ((binding.kind === "data") !== (binding.dataType !== undefined)) return true;
      if (binding.dataType === undefined) return false;
      try { deriveShaderDataLayout(binding.dataType, "glsl-std430"); return false; } catch { return true; }
    });
    if (data) {
      throw new RenderDeviceError(
        `WebGL2 cannot bind portable uniform ${data.name}: data uniforms need exactly one valid dataType schema`,
        "WEBGL_PORTABLE_UNIFORM_DATA_UNSUPPORTED",
        { label: sources.label, binding: data.name, kind: data.kind }
      );
    }
  }

  multiDrawElementsInstanced(draws: readonly unknown[]): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.assertFrame();
    for (const command of draws as readonly DrawCommand[]) {
      this.validateStencilAttachment(command);
      this.validateDrawAttachmentHazards(command);
    }
    const combined = this.host.drawBinder.multiDrawElementsInstanced(draws, (command) => this.draw(command));
    // The public draw path counts each fallback submission itself, including
    // any overridden draw behavior. Count here only for a single native call.
    if (combined) for (const command of draws as readonly DrawCommand[]) this.countPrimitives(command);
  }

  /**
   * Query the current context generation rather than the constructor's probe.
   * This establishes entry-point availability only; callers remain responsible
   * for validating draw compatibility, callbacks and resource lifetimes.
   */
  supportsMultiDrawElementsInstanced(): boolean {
    try {
      const generation = this.shaderGeneration;
      if (this.host.disposed || this.isDeviceLost()) return false;
      const supported = this.host.drawBinder.supportsMultiDrawElementsInstanced();
      return supported && !this.host.disposed && !this.host.contextLost && generation === this.shaderGeneration;
    } catch {
      return false;
    }
  }

  /**
   * Attempt a combined native submission without a per-draw fallback. This is
   * needed by shaders whose per-member data is indexed by gl_DrawID: replaying
   * those commands as ordinary draws would select row zero for every member.
   * False means no draw was attempted. Errors during native submission escape
   * to the caller, which must not replay an already attempted draw.
   */
  tryMultiDrawElementsInstanced(draws: readonly DrawCommand[]): boolean {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.assertFrame();
    if (!this.supportsMultiDrawElementsInstanced() || !canMultiDraw(draws)) return false;
    for (const command of draws) {
      this.validateStencilAttachment(command);
      this.validateDrawAttachmentHazards(command);
    }
    const combined = this.host.drawBinder.tryMultiDrawElementsInstanced(draws);
    if (combined) for (const command of draws) this.countPrimitives(command);
    return combined;
  }

  /**
   * #94 (Q-01-1, C-28/C-29): forget every GL object name and uploaded value
   * cached against the lost context — VAOs, uniform locations, last-value
   * uniform snapshots, the GL state shadow and texture-unit bindings — so
   * they recreate lazily on the next draw after `webglcontextrestored`.
   * `counters().liveVertexArrays` reads 0 afterwards. Buffers, textures and
   * programs are recreated by the C-29 ResourceRegistry rebuild that runs
   * right after this in the restore hook.
   */
  invalidateGpuObjects(): void {
    this.clearStaticUnlitBufferMirrors();
    this.staticUnlitOrdinaryPrograms = new WeakMap();
    this.staticUnlitPairProgram = undefined;
    this.staticUnlitPairFailureGeneration = undefined;
    this.staticUnlitPairTickets = new WeakMap();
    this.host.drawBinder.invalidateGpuObjects();
    this.host.textureRegistry.invalidateTextureHandles();
    // Also resets the sampler registry's unit shadow (registered dependent of the state cache).
    this.host.stateCache.invalidate();
  }

  private clearStaticUnlitBufferMirrors(): void {
    this.staticUnlitBufferMirrors.clear();
    this.staticUnlitMirrorBytes = 0;
    this.staticGeneratedUniformMirrors.clear();
    this.staticGeneratedUniformMirrorBytes = 0;
    this.staticGeneratedFrameBinding = undefined;
    this.staticGeneratedFrameBindingRevision += 1;
    this.staticGeneratedOrdinaryPrograms = new WeakMap();
    for (const cached of this.staticGeneratedPairPrograms.values()) {
      if (cached && !cached.shader.disposed) {
        try { cached.shader.dispose(); } catch { /* Lost contexts may reject native cleanup. */ }
      }
    }
    this.staticGeneratedPairPrograms.clear();
    this.staticGeneratedPairTickets = new WeakMap();
  }

  private forgetStaticGeneratedUniformMirror(buffer: WebGL2Buffer, retiring = false): void {
    const previous = this.staticGeneratedUniformMirrors.get(buffer);
    if (previous) {
      this.staticGeneratedUniformMirrors.delete(buffer);
      this.staticGeneratedUniformMirrorBytes -= previous.bytes.byteLength;
    }
    if (this.staticGeneratedFrameBinding?.buffer === buffer && (retiring || buffer.disposed)) {
      this.staticGeneratedFrameBinding = undefined;
      this.staticGeneratedFrameBindingRevision += 1;
    }
  }

  private canMirrorStaticGeneratedUniform(usage: BufferUsage, byteLength: number): boolean {
    return usage === "uniform" && byteLength <= STATIC_GENERATED_UNLIT_MAX_UNIFORM_BUFFER_BYTES
      && this.staticGeneratedUniformMirrorBytes + byteLength <= STATIC_GENERATED_UNLIT_MAX_UNIFORM_MIRROR_BYTES;
  }

  private forgetStaticUnlitBufferMirror(buffer: WebGL2Buffer): void {
    const previous = this.staticUnlitBufferMirrors.get(buffer);
    if (!previous) return;
    this.staticUnlitBufferMirrors.delete(buffer);
    this.staticUnlitMirrorBytes -= previous.bytes.byteLength;
  }

  private canMirrorStaticUnlitBuffer(usage: BufferUsage, byteLength: number): boolean {
    return (usage === "vertex" || usage === "index") && byteLength <= STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES
      && this.staticUnlitMirrorBytes + byteLength <= STATIC_UNLIT_PAIR_MAX_MIRROR_BYTES;
  }

  /** Internal pair-planner input; undefined means ordinary draws must be used. */
  snapshotStaticUnlitBuffer(buffer: RenderBuffer): StaticUnlitBufferSnapshot | undefined {
    if (!staticUnlitDeviceMethodsCurrent(this) || !(buffer instanceof WebGL2Buffer) || !this.buffers.has(buffer)
      || buffer.disposed || this.host.disposed || this.host.contextLost) return undefined;
    const mirror = this.staticUnlitBufferMirrors.get(buffer);
    if (!mirror || mirror.generation !== this.shaderGeneration || this.isDeviceLost()) return undefined;
    return { generation: mirror.generation, revision: mirror.revision, bytes: mirror.bytes.slice() };
  }

  /** Non-allocating preflight for already-resident forward geometry. */
  hasStaticUnlitPairBuffers(vertexBuffers: readonly (RenderBuffer | undefined)[], indexBuffer: RenderBuffer): boolean {
    if (!staticUnlitDeviceMethodsCurrent(this) || this.host.disposed || this.host.contextLost || this.isDeviceLost() || vertexBuffers.length === 0) return false;
    const current = (buffer: RenderBuffer | undefined, usage: BufferUsage): boolean => {
      if (!(buffer instanceof WebGL2Buffer) || buffer.usage !== usage || !this.buffers.has(buffer) || buffer.disposed) return false;
      const mirror = this.staticUnlitBufferMirrors.get(buffer);
      return mirror !== undefined && mirror.generation === this.shaderGeneration && mirror.bytes.byteLength === buffer.byteLength;
    };
    for (let index = 0; index < vertexBuffers.length; index += 1) {
      if (!Object.hasOwn(vertexBuffers, index) || !current(vertexBuffers[index], "vertex")) return false;
    }
    return current(indexBuffer, "index");
  }

  /** Capture only facts that can be rechecked without executing either draw. */
  private staticUnlitPairEvidence(first: DrawCommand, second: DrawCommand): StaticUnlitPairEvidence | undefined {
    try {
      if (!staticUnlitDeviceMethodsCurrent(this) || this.host.disposed || this.host.contextLost || this.isDeviceLost()
        || !this.host.lifecycle.frameActive || this.gaussianSplatBorrowedDepth || this.host.errorCheckMode === "strict") return undefined;
      const frame = this.activeFrameToken;
      if (!frame || first.topology !== "triangles" || second.topology !== "triangles"
        || !first.shader || first.shader !== second.shader || first.shader.disposed
        || this.staticUnlitOrdinaryPrograms.get(first.shader) !== this.shaderGeneration
        || !this.host.shaders.has(first.shader as WebGL2ShaderProgram)
        || !first.indexBuffer || first.indexBuffer !== second.indexBuffer
        || first.vertexBuffer !== second.vertexBuffer || first.vertexFormat !== second.vertexFormat || !first.vertexFormat
        || (first.indexType !== "uint16" && first.indexType !== "uint32") || first.indexType !== second.indexType
        || first.indexCount !== second.indexCount || (first.firstIndex ?? 0) !== (second.firstIndex ?? 0)
        || first.vertexCount !== second.vertexCount || (first.firstVertex ?? 0) !== (second.firstVertex ?? 0)
        || (first.instanceCount ?? 1) !== 1 || (second.instanceCount ?? 1) !== 1
        || first.instanceAttributes?.length || second.instanceAttributes?.length
        || first.nativeStorageBindings?.length || second.nativeStorageBindings?.length) return undefined;

      const state = first.renderState;
      if (!state || state !== second.renderState || Object.getPrototypeOf(state) !== Object.prototype
        || state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque")
        || state.stencil || state.polygonOffset || state.alphaToCoverage || state.colorAttachments !== undefined
        || (state.sampleMask !== undefined && state.sampleMask !== 0xffffffff)) return undefined;
      for (const key of Reflect.ownKeys(state)) {
        const descriptor = Object.getOwnPropertyDescriptor(state, key);
        if (typeof key !== "string" || !descriptor || !("value" in descriptor) || typeof descriptor.value === "function") return undefined;
      }
      const format = first.vertexFormat;
      if (format.streams.length !== 1 || format.streams[0]?.slot !== 0 || format.streams[0].stepMode !== "vertex"
        || (first.vertexBuffers && (first.vertexBuffers.length !== 1 || first.vertexBuffers[0] !== first.vertexBuffer))
        || (second.vertexBuffers && (second.vertexBuffers.length !== 1 || second.vertexBuffers[0] !== second.vertexBuffer))) return undefined;
      const positions = format.attributes.filter((attribute) => attribute.shaderName === "a_position");
      const position = positions[0];
      if (positions.length !== 1 || !position || position.type !== "float32" || position.components !== 3
        || position.integer || position.normalized || position.bufferSlot !== 0) return undefined;
      if (!this.hasStaticUnlitPairBuffers([first.vertexBuffer], first.indexBuffer)) return undefined;
      const vertex = this.snapshotStaticUnlitBuffer(first.vertexBuffer);
      const index = this.snapshotStaticUnlitBuffer(first.indexBuffer);
      if (!vertex || !index) return undefined;
      const firstUniforms = staticUnlitUniformSignature(first.uniforms);
      const secondUniforms = staticUnlitUniformSignature(second.uniforms);
      if (firstUniforms === undefined || secondUniforms === undefined) return undefined;
      const uniforms = this.host.drawBinder.inspectStaticUnlitPair(first, second);
      // gl_PointCoord has no defined triangle meaning. The ordinary source
      // reads it only when this branch is enabled.
      if (!uniforms || uniforms.roundPoints > 0.5) return undefined;

      const gl = this.gl;
      if (gl.isEnabled(gl.RASTERIZER_DISCARD) || gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE) !== false) return undefined;
      for (const target of [gl.ANY_SAMPLES_PASSED, gl.ANY_SAMPLES_PASSED_CONSERVATIVE, gl.TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN]) {
        if (gl.getQuery(target, gl.CURRENT_QUERY) !== null) return undefined;
      }
      const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { readonly TIME_ELAPSED_EXT?: number } | null;
      if (timer?.TIME_ELAPSED_EXT !== undefined && gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) !== null) return undefined;
      const viewport = staticUnlitRect(gl.getParameter(gl.VIEWPORT));
      const rawScissor = state.scissor ?? this.host.lifecycle.effectiveScissor();
      const scissor = rawScissor ? { x: rawScissor.x, y: rawScissor.y, width: rawScissor.width, height: rawScissor.height } : null;
      const precision = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
      const subpixelBits: unknown = gl.getParameter(gl.SUBPIXEL_BITS);
      const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const target = this.host.activeRenderTarget;
      if (!viewport || !precision || typeof subpixelBits !== "number" || target?.disposed || target?.nativeInvalid) return undefined;
      const plan: StaticUnlitPairPlanInput = {
        positions: vertex.bytes, indices: index.bytes, byteOrder: STATIC_UNLIT_BYTE_ORDER,
        positionLayout: { byteOffset: position.offset, byteStride: format.streams[0].stride, vertexCount: first.vertexCount },
        indexType: first.indexType, indexByteOffset: (first.firstIndex ?? 0) * (first.indexType === "uint32" ? 4 : 2),
        indexCount: first.indexCount ?? 0, effectiveMvpPair: uniforms.effectiveMvpPair,
        viewport, scissor, vertexPrecision: { precision: precision.precision, rangeMin: precision.rangeMin, rangeMax: precision.rangeMax }, subpixelBits
      };
      if (planStaticUnlitPair(plan).kind !== "disjoint") return undefined;
      const signature = JSON.stringify({ firstUniforms, secondUniforms, viewport, scissor,
        state, vertexCount: first.vertexCount, firstVertex: first.firstVertex ?? 0,
        indexType: first.indexType, firstIndex: first.firstIndex ?? 0, indexCount: first.indexCount,
        attributes: format.attributes.map((attribute) => [attribute.shaderName, attribute.semantic, attribute.type, attribute.components,
          attribute.offset, attribute.bufferSlot, attribute.normalized, attribute.integer, attribute.shaderLocation]),
        streams: format.streams.map((stream) => [stream.slot, stream.stride, stream.stepMode, stream.divisor]),
        precision: [precision.precision, precision.rangeMin, precision.rangeMax, subpixelBits]
      });
      if (frame !== this.activeFrameToken || this.host.contextLost || this.isDeviceLost()) return undefined;
      return { frame, generation: this.shaderGeneration, target, framebuffer, shader: first.shader, format, state, vertex: first.vertexBuffer,
        index: first.indexBuffer, vertexRevision: vertex.revision, indexRevision: index.revision, signature, uniforms };
    } catch {
      // Read-only eligibility failures preserve the ordinary draw path.
      return undefined;
    }
  }

  /** Prepare only two already-sorted, final ordinary draw commands. */
  prepareStaticUnlitPair(commands: readonly [DrawCommand, DrawCommand]): StaticUnlitPairTicket | undefined {
    const [first, second] = commands;
    const evidence = this.staticUnlitPairEvidence(first, second);
    if (!evidence) return undefined;
    let cached = this.staticUnlitPairProgram;
    if (!cached || cached.generation !== evidence.generation || cached.shader.disposed) {
      if (this.staticUnlitPairFailureGeneration === evidence.generation) return undefined;
      const sources = getStaticUnlitSources();
      if (!sources) return undefined;
      let shader: RenderShaderProgram | undefined;
      try {
        shader = this.createShaderProgram(sources.pair);
        const native = this.host.drawBinder.requireShader(shader);
        if (!inspectStaticBatchUnlitProgram(this.gl, native.handle).compatible) {
          shader.dispose();
          this.staticUnlitPairFailureGeneration = evidence.generation;
          return undefined;
        }
        cached = { generation: evidence.generation, shader };
        this.staticUnlitPairProgram = cached;
      } catch {
        if (shader && !shader.disposed) shader.dispose();
        this.staticUnlitPairFailureGeneration = evidence.generation;
        return undefined;
      }
      // Prewarm once on an opted-in frame and keep its ordinary draw order.
      this.host.drawBinder.prewarmStaticUnlitPairVao(first, cached.shader);
      return undefined;
    }
    if (!this.host.drawBinder.prewarmStaticUnlitPairVao(first, cached.shader)) return undefined;
    const current = this.staticUnlitPairEvidence(first, second);
    if (!current || !sameStaticUnlitEvidence(evidence, current)) return undefined;
    const ticket = Object.freeze({}) as unknown as StaticUnlitPairTicket;
    this.staticUnlitPairTickets.set(ticket, { ...current, first, second, pairShader: cached.shader });
    return ticket;
  }

  /** Consume a ticket once; never retry after entering native submission. */
  submitStaticUnlitPair(ticket: StaticUnlitPairTicket): "submitted" | "declined" {
    const prepared = this.staticUnlitPairTickets.get(ticket);
    if (!prepared) return "declined";
    this.staticUnlitPairTickets.delete(ticket);
    const current = this.staticUnlitPairEvidence(prepared.first, prepared.second);
    if (!current || !sameStaticUnlitEvidence(prepared, current)
      || this.staticUnlitPairProgram?.shader !== prepared.pairShader || prepared.pairShader.disposed) return "declined";
    const submission = new WebGLBatchSubmissionState(prepared.frame, prepared.generation);
    // Binder exceptions propagate, including exceptions after native entry.
    if (!this.host.drawBinder.tryDrawStaticUnlitPair(prepared.first, prepared.second, prepared.pairShader, prepared.uniforms, submission, () => {
      this.countPrimitives(prepared.first);
      this.countPrimitives(prepared.second);
    })) return "declined";
    return "submitted";
  }

  /** GPU-allocation-free preflight before the renderer binds captured material packets. */
  hasStaticGeneratedUnlitProgram(shader: RenderShaderProgram, _features: ProgramFeatures): boolean {
    if (!staticUnlitDeviceMethodsCurrent(this)) return false;
    const recorded = this.staticGeneratedOrdinaryPrograms.get(shader);
    return !!recorded && recorded.generation === this.shaderGeneration && !this.host.disposed && !this.host.contextLost
      && this.host.shaders.has(shader as WebGL2ShaderProgram) && staticGeneratedReflectionCurrent(shader, recorded.reflection);
  }

  /** Snapshot the live, full AuraFrame binding and the bytes actually uploaded by Aura. */
  private staticGeneratedFrameSnapshot(buffer: RenderBuffer): StaticGeneratedFrameSnapshot | undefined {
    const binding = this.staticGeneratedFrameBinding;
    if (!(buffer instanceof WebGL2Buffer) || buffer.usage !== "uniform" || buffer.disposed || !this.buffers.has(buffer)
      || !binding || binding.buffer !== buffer || binding.generation !== this.shaderGeneration) return undefined;
    const mirror = this.staticGeneratedUniformMirrors.get(buffer);
    if (!mirror || mirror.generation !== this.shaderGeneration || mirror.bytes.byteLength !== buffer.byteLength
      || buffer.byteLength < AURA_FRAME_BLOCK_BYTES) return undefined;
    const gl = this.gl;
    if (gl.getIndexedParameter(gl.UNIFORM_BUFFER_BINDING, AURA_FRAME_BINDING) !== buffer.handle
      || gl.getIndexedParameter(gl.UNIFORM_BUFFER_START, AURA_FRAME_BINDING) !== 0
      || gl.getIndexedParameter(gl.UNIFORM_BUFFER_SIZE, AURA_FRAME_BINDING) !== buffer.byteLength
      || !gl.isBuffer(buffer.handle)) return undefined;
    const view = new DataView(mirror.bytes.buffer, mirror.bytes.byteOffset, mirror.bytes.byteLength);
    const viewProjection = new Float32Array(16);
    for (let index = 0; index < 16; index += 1) {
      const value = view.getFloat32(AURA_FRAME_VIEW_PROJECTION_OFFSET + index * 4, STATIC_UNLIT_BYTE_ORDER === "little-endian");
      if (!Number.isFinite(value)) return undefined;
      viewProjection[index] = value;
    }
    return { buffer, generation: mirror.generation, revision: mirror.revision, bindingRevision: binding.revision, viewProjection };
  }

  private staticGeneratedUnlitPairEvidence(first: DrawCommand, second: DrawCommand,
    options: StaticGeneratedUnlitPairOptions): StaticGeneratedUnlitPairEvidence | undefined {
    try {
      if (!staticUnlitDeviceMethodsCurrent(this) || this.host.disposed || this.host.contextLost || this.isDeviceLost()
        || !this.host.lifecycle.frameActive || this.gaussianSplatBorrowedDepth || this.host.errorCheckMode === "strict") return undefined;
      const frame = this.activeFrameToken;
      const ordinary = first.shader ? this.staticGeneratedOrdinaryPrograms.get(first.shader) : undefined;
      const recordedFeatures = ordinary?.sources.generatedProgram?.features;
      if (!frame || !ordinary || ordinary.generation !== this.shaderGeneration || !recordedFeatures
        || !this.hasStaticGeneratedUnlitProgram(first.shader!, options.features)
        || computeProgramKey(recordedFeatures) !== computeProgramKey(options.features)
        || first.topology !== "triangles" || second.topology !== "triangles"
        || !first.shader || first.shader !== second.shader || first.shader.disposed
        || !this.host.shaders.has(first.shader as WebGL2ShaderProgram)
        || !first.indexBuffer || first.indexBuffer !== second.indexBuffer
        || first.vertexBuffer !== second.vertexBuffer || first.vertexFormat !== second.vertexFormat || !first.vertexFormat
        || (first.indexType !== "uint16" && first.indexType !== "uint32") || first.indexType !== second.indexType
        || first.indexCount !== second.indexCount || (first.firstIndex ?? 0) !== (second.firstIndex ?? 0)
        || first.vertexCount !== second.vertexCount || (first.firstVertex ?? 0) !== (second.firstVertex ?? 0)
        || (first.instanceCount ?? 1) !== 1 || (second.instanceCount ?? 1) !== 1
        || first.instanceAttributes?.length || second.instanceAttributes?.length
        || first.nativeStorageBindings?.length || second.nativeStorageBindings?.length) return undefined;

      const state = first.renderState;
      if (!state || state !== second.renderState || Object.getPrototypeOf(state) !== Object.prototype
        || state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque")
        || state.stencil || state.polygonOffset || state.alphaToCoverage || state.colorAttachments !== undefined
        || (state.sampleMask !== undefined && state.sampleMask !== 0xffffffff)) return undefined;
      for (const key of Reflect.ownKeys(state)) {
        const descriptor = Object.getOwnPropertyDescriptor(state, key);
        if (typeof key !== "string" || !descriptor || !("value" in descriptor) || typeof descriptor.value === "function") return undefined;
      }
      const format = first.vertexFormat;
      if (format.streams.length !== 1 || format.streams[0]?.slot !== 0 || format.streams[0].stepMode !== "vertex"
        || (first.vertexBuffers && (first.vertexBuffers.length !== 1 || first.vertexBuffers[0] !== first.vertexBuffer))
        || (second.vertexBuffers && (second.vertexBuffers.length !== 1 || second.vertexBuffers[0] !== second.vertexBuffer))) return undefined;
      const positions = format.attributes.filter((attribute) => attribute.shaderName === "a_position");
      const position = positions[0];
      if (positions.length !== 1 || !position || position.type !== "float32" || position.components !== 3
        || position.integer || position.normalized || position.bufferSlot !== 0) return undefined;
      if (!this.hasStaticUnlitPairBuffers([first.vertexBuffer], first.indexBuffer)) return undefined;
      const vertex = this.snapshotStaticUnlitBuffer(first.vertexBuffer);
      const index = this.snapshotStaticUnlitBuffer(first.indexBuffer);
      const frameBlock = this.staticGeneratedFrameSnapshot(options.auraFrameBuffer);
      if (!vertex || !index || !frameBlock) return undefined;
      const firstUniforms = staticUnlitUniformSignature(first.uniforms);
      const secondUniforms = staticUnlitUniformSignature(second.uniforms);
      if (firstUniforms === undefined || secondUniforms === undefined) return undefined;
      const uniforms = this.host.drawBinder.inspectGeneratedStaticUnlitPair(first, second, frameBlock.viewProjection);
      if (!uniforms) return undefined;

      const gl = this.gl;
      if (gl.isEnabled(gl.RASTERIZER_DISCARD) || gl.getParameter(gl.TRANSFORM_FEEDBACK_ACTIVE) !== false) return undefined;
      for (const target of [gl.ANY_SAMPLES_PASSED, gl.ANY_SAMPLES_PASSED_CONSERVATIVE, gl.TRANSFORM_FEEDBACK_PRIMITIVES_WRITTEN]) {
        if (gl.getQuery(target, gl.CURRENT_QUERY) !== null) return undefined;
      }
      const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2") as { readonly TIME_ELAPSED_EXT?: number } | null;
      if (timer?.TIME_ELAPSED_EXT !== undefined && gl.getQuery(timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) !== null) return undefined;
      const viewport = staticUnlitRect(gl.getParameter(gl.VIEWPORT));
      const rawScissor = state.scissor ?? this.host.lifecycle.effectiveScissor();
      const scissor = rawScissor ? { x: rawScissor.x, y: rawScissor.y, width: rawScissor.width, height: rawScissor.height } : null;
      const precision = gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);
      const subpixelBits: unknown = gl.getParameter(gl.SUBPIXEL_BITS);
      const framebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
      const target = this.host.activeRenderTarget;
      if (!viewport || !precision || typeof subpixelBits !== "number" || target?.disposed || target?.nativeInvalid) return undefined;
      const plan: StaticGeneratedUnlitPairPlanInput = {
        positions: vertex.bytes, indices: index.bytes, byteOrder: STATIC_UNLIT_BYTE_ORDER,
        positionLayout: { byteOffset: position.offset, byteStride: format.streams[0].stride, vertexCount: first.vertexCount },
        indexType: first.indexType, indexByteOffset: (first.firstIndex ?? 0) * (first.indexType === "uint32" ? 4 : 2),
        indexCount: first.indexCount ?? 0, geometryMatrix: uniforms.effectiveGeometryMatrix,
        modelMatrixPair: uniforms.effectiveModelPair, viewProjectionMatrix: uniforms.frameViewProjection,
        viewport, scissor, vertexPrecision: { precision: precision.precision, rangeMin: precision.rangeMin, rangeMax: precision.rangeMax }, subpixelBits
      };
      if (planStaticGeneratedUnlitPair(plan).kind !== "disjoint") return undefined;
      const signature = JSON.stringify({ firstUniforms, secondUniforms, viewport, scissor, featureKey: computeProgramKey(options.features),
        state, vertexCount: first.vertexCount, firstVertex: first.firstVertex ?? 0,
        indexType: first.indexType, firstIndex: first.firstIndex ?? 0, indexCount: first.indexCount,
        attributes: format.attributes.map((attribute) => [attribute.shaderName, attribute.semantic, attribute.type, attribute.components,
          attribute.offset, attribute.bufferSlot, attribute.normalized, attribute.integer, attribute.shaderLocation]),
        streams: format.streams.map((stream) => [stream.slot, stream.stride, stream.stepMode, stream.divisor]),
        precision: [precision.precision, precision.rangeMin, precision.rangeMax, subpixelBits]
      });
      if (frame !== this.activeFrameToken || this.host.contextLost || this.isDeviceLost()) return undefined;
      return { frame, generation: this.shaderGeneration, target, framebuffer, shader: first.shader, format, state, vertex: first.vertexBuffer,
        index: first.indexBuffer, vertexRevision: vertex.revision, indexRevision: index.revision, frameBlock, signature, uniforms };
    } catch {
      return undefined;
    }
  }

  private staticGeneratedPairProgramReady(ordinary: RenderShaderProgram, pair: RenderShaderProgram): boolean {
    try {
      if (!(ordinary instanceof WebGL2ShaderProgram) || !(pair instanceof WebGL2ShaderProgram)
        || ordinary.disposed || pair.disposed || !this.shaders.has(ordinary) || !this.shaders.has(pair)) return false;
      const extension = this.parallelShaderCompileExtension();
      if (extension && (this.gl.getProgramParameter(ordinary.handle, extension.COMPLETION_STATUS_KHR) !== true
        || this.gl.getProgramParameter(pair.handle, extension.COMPLETION_STATUS_KHR) !== true)) return false;
      return inspectStaticGeneratedUnlitPairProgram(this.gl, ordinary.handle, pair.handle).compatible;
    } catch { return false; }
  }

  /** Prepare an already captured pair; a first eligible frame warms its exact generated variant. */
  prepareStaticGeneratedUnlitPair(commands: readonly [DrawCommand, DrawCommand], options: StaticGeneratedUnlitPairOptions): StaticGeneratedUnlitPairTicket | undefined {
    const [first, second] = commands;
    const evidence = this.staticGeneratedUnlitPairEvidence(first, second, options);
    if (!evidence) return undefined;
    let cached = this.staticGeneratedPairPrograms.get(evidence.shader);
    if (cached === null) return undefined;
    if (!cached || cached.generation !== evidence.generation || cached.shader.disposed) {
      if (!cached && this.staticGeneratedPairPrograms.size >= STATIC_GENERATED_UNLIT_MAX_PAIR_PROGRAMS) return undefined;
      const source = this.staticGeneratedOrdinaryPrograms.get(evidence.shader)?.sources;
      if (!source) return undefined;
      let shader: RenderShaderProgram | undefined;
      try {
        const pairSource = deriveStaticGeneratedUnlitPairSource(source);
        shader = this.createShaderProgram(pairSource);
        cached = { generation: evidence.generation, shader, featureKey: computeProgramKey(options.features) };
        this.staticGeneratedPairPrograms.set(evidence.shader, cached);
      } catch {
        if (shader && !shader.disposed) shader.dispose();
        this.staticGeneratedPairPrograms.set(evidence.shader, null);
        return undefined;
      }
      if (this.staticGeneratedPairProgramReady(evidence.shader, cached.shader)) {
        this.host.drawBinder.prewarmGeneratedStaticUnlitPairVao(first, cached.shader);
      }
      return undefined;
    }
    if (cached.featureKey !== computeProgramKey(options.features) || !this.staticGeneratedPairProgramReady(evidence.shader, cached.shader)
      || !this.host.drawBinder.prewarmGeneratedStaticUnlitPairVao(first, cached.shader)) return undefined;
    const current = this.staticGeneratedUnlitPairEvidence(first, second, options);
    if (!current || !sameStaticGeneratedUnlitEvidence(evidence, current)) return undefined;
    const ticket = Object.freeze({}) as unknown as StaticGeneratedUnlitPairTicket;
    this.staticGeneratedPairTickets.set(ticket, { ...current, first, second, options, pairShader: cached.shader });
    return ticket;
  }

  /** Consume once. After binder preparation begins, errors propagate and neither draw is replayed. */
  submitStaticGeneratedUnlitPair(ticket: StaticGeneratedUnlitPairTicket, hooks: StaticGeneratedUnlitPairHooks): "submitted" | "declined" {
    const prepared = this.staticGeneratedPairTickets.get(ticket);
    if (!prepared) return "declined";
    this.staticGeneratedPairTickets.delete(ticket);
    const current = this.staticGeneratedUnlitPairEvidence(prepared.first, prepared.second, prepared.options);
    const cached = this.staticGeneratedPairPrograms.get(prepared.shader);
    if (!current || !sameStaticGeneratedUnlitEvidence(prepared, current) || !cached
      || cached.generation !== prepared.generation || cached.shader !== prepared.pairShader
      || cached.featureKey !== computeProgramKey(prepared.options.features)
      || !this.staticGeneratedPairProgramReady(prepared.shader, prepared.pairShader)) return "declined";
    const submission = new WebGLBatchSubmissionState(prepared.frame, prepared.generation);
    const submitted = this.host.drawBinder.tryDrawGeneratedStaticUnlitPair(prepared.first, prepared.second, prepared.pairShader,
      prepared.uniforms, submission, () => {
        const frameBlock = this.staticGeneratedFrameSnapshot(prepared.options.auraFrameBuffer);
        if (!frameBlock || frameBlock.buffer !== prepared.frameBlock.buffer || frameBlock.generation !== prepared.frameBlock.generation
          || frameBlock.revision !== prepared.frameBlock.revision || frameBlock.bindingRevision !== prepared.frameBlock.bindingRevision
          || frameBlock.viewProjection.some((value, index) => !Object.is(value, prepared.frameBlock.viewProjection[index]))) {
          throw new RenderDeviceError("AuraFrame changed before generated static batch submission", "STATIC_BATCH_INVALIDATED");
        }
        hooks.onAttempt();
        // The accounting hook is supplied by the renderer, but still recheck
        // its boundary: any synchronous invalidation must propagate without replay.
        const afterHook = this.staticGeneratedFrameSnapshot(prepared.options.auraFrameBuffer);
        if (!afterHook || afterHook.generation !== prepared.frameBlock.generation || afterHook.revision !== prepared.frameBlock.revision
          || afterHook.bindingRevision !== prepared.frameBlock.bindingRevision || this.activeFrameToken !== prepared.frame
          || this.shaderGeneration !== prepared.generation || this.host.contextLost || this.isDeviceLost()) {
          throw new RenderDeviceError("AuraFrame changed during generated static batch submission", "STATIC_BATCH_INVALIDATED");
        }
      }, () => {
        this.countPrimitives(prepared.first);
        this.countPrimitives(prepared.second);
        hooks.onSubmitted();
      });
    return submitted ? "submitted" : "declined";
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.host.lifecycle.assertAlive();
    if (usage === "storage") {
      throw new RenderDeviceError("Storage buffers are unavailable on WebGL2", "UNSUPPORTED_BUFFER_USAGE", { usage });
    }
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }
    if (initialData && initialData.byteLength > byteLength) {
      throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", { byteLength, dataByteLength: initialData.byteLength });
    }

    const generation = this.shaderGeneration;
    let mirrorBytes: Uint8Array | undefined;
    if (this.canMirrorStaticUnlitBuffer(usage, byteLength)) {
      try {
        const copied = initialData === undefined ? undefined : copyStaticUnlitUpload(initialData);
        if (initialData === undefined || (copied !== undefined && copied.byteLength <= byteLength)) {
          mirrorBytes = new Uint8Array(byteLength);
          if (copied) mirrorBytes.set(copied);
        }
      } catch { /* A mirror is optional and must never break an ordinary upload. */ }
    }

    let uniformMirrorBytes: Uint8Array | undefined;
    if (this.canMirrorStaticGeneratedUniform(usage, byteLength)) {
      try {
        const copied = initialData === undefined ? undefined : copyStaticUnlitUpload(initialData);
        if (initialData === undefined || (copied !== undefined && copied.byteLength <= byteLength)) {
          uniformMirrorBytes = new Uint8Array(byteLength);
          if (copied) uniformMirrorBytes.set(copied);
        }
      } catch { /* Optional evidence must not interfere with ordinary uploads. */ }
    }

    const handle = this.gl.createBuffer();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL buffer", "WEBGL_ALLOCATION_FAILED");
    }

    const target = usage === "index"
      ? this.gl.ELEMENT_ARRAY_BUFFER
      : usage === "uniform"
        ? this.gl.UNIFORM_BUFFER
        : this.gl.ARRAY_BUFFER;
    try {
      this.host.drawBinder.bindNoVertexArray();
      this.stateCache.bindBuffer(target, handle, () => this.gl.bindBuffer(target, handle));
      this.gl.bufferData(target, byteLength, this.gl.DYNAMIC_DRAW);
      if (initialData) this.gl.bufferSubData(target, 0, initialData);
    } catch (error) {
      this.gl.deleteBuffer(handle);
      this.stateCache.invalidate();
      throw error;
    }

    const buffer = new WebGL2Buffer(
      this.nextId++, usage, byteLength, target, handle, this.gl,
      (retiring) => {
        // It is unusable immediately, but the device must retain failed work.
        this.retiringBuffers.add(retiring);
        this.buffers.delete(retiring);
        this.forgetStaticUnlitBufferMirror(retiring);
        this.forgetStaticGeneratedUniformMirror(retiring, true);
      },
      (retired) => {
        this.retiringBuffers.delete(retired);
        this.disposedBufferCount += 1;
      }
    );
    buffer.onDispose = () => {
      // §6.1: cached VAOs key on buffer ids and must retire before the buffer.
      this.host.drawBinder.evictVertexArraysForBuffer(buffer.id);
    };
    this.buffers.add(buffer);
    if (mirrorBytes && generation === this.shaderGeneration && !this.host.contextLost && !this.host.disposed) {
      this.staticUnlitBufferMirrors.set(buffer, { generation, revision: ++this.staticUnlitMirrorRevision, bytes: mirrorBytes });
      this.staticUnlitMirrorBytes += mirrorBytes.byteLength;
    }
    if (uniformMirrorBytes && generation === this.shaderGeneration && !this.host.contextLost && !this.host.disposed) {
      this.staticGeneratedUniformMirrors.set(buffer, { generation, revision: ++this.staticGeneratedUniformMirrorRevision, bytes: uniformMirrorBytes });
      this.staticGeneratedUniformMirrorBytes += uniformMirrorBytes.byteLength;
    }
    return buffer;
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.host.lifecycle.assertAlive();
    const webglBuffer = this.host.drawBinder.requireBuffer(buffer);
    if (!Number.isSafeInteger(byteOffset) || byteOffset < 0 || byteOffset + data.byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: webglBuffer.byteLength
      });
    }
    const generation = this.shaderGeneration;
    const previousMirror = this.staticUnlitBufferMirrors.get(webglBuffer);
    const previousUniformMirror = this.staticGeneratedUniformMirrors.get(webglBuffer);
    let copied: Uint8Array | undefined;
    if (previousMirror || previousUniformMirror || (byteOffset === 0 && (this.canMirrorStaticUnlitBuffer(webglBuffer.usage, webglBuffer.byteLength)
      || this.canMirrorStaticGeneratedUniform(webglBuffer.usage, webglBuffer.byteLength)))) {
      try { copied = copyStaticUnlitUpload(data); } catch { /* The normal upload still proceeds. */ }
    }
    this.host.drawBinder.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    try {
      this.gl.bufferSubData(webglBuffer.target, byteOffset, data);
    } catch (error) {
      // A throwing upload may have modified the native buffer before throwing.
      this.forgetStaticUnlitBufferMirror(webglBuffer);
      this.forgetStaticGeneratedUniformMirror(webglBuffer);
      throw error;
    }
    // Native upload callbacks can retire the buffer. Retirement removes it
    // from the live set before a failed native delete can set `disposed`.
    // Never recreate either mirror without current same-device ownership.
    const bufferIsLive = this.buffers.has(webglBuffer) && !webglBuffer.disposed;
    if (generation !== this.shaderGeneration || this.host.contextLost || this.host.disposed || !bufferIsLive || !copied
      || byteOffset + copied.byteLength > webglBuffer.byteLength) {
      this.forgetStaticUnlitBufferMirror(webglBuffer);
    } else if (previousMirror && previousMirror === this.staticUnlitBufferMirrors.get(webglBuffer)) {
      previousMirror.bytes.set(copied, byteOffset);
      previousMirror.revision = ++this.staticUnlitMirrorRevision;
    } else if (byteOffset === 0 && copied.byteLength === webglBuffer.byteLength
      && this.canMirrorStaticUnlitBuffer(webglBuffer.usage, webglBuffer.byteLength)) {
      this.staticUnlitBufferMirrors.set(webglBuffer, { generation, revision: ++this.staticUnlitMirrorRevision, bytes: copied });
      this.staticUnlitMirrorBytes += copied.byteLength;
    }
    if (generation !== this.shaderGeneration || this.host.contextLost || this.host.disposed || !bufferIsLive || !copied
      || byteOffset + copied.byteLength > webglBuffer.byteLength) {
      this.forgetStaticGeneratedUniformMirror(webglBuffer);
    } else if (previousUniformMirror && previousUniformMirror === this.staticGeneratedUniformMirrors.get(webglBuffer)) {
      previousUniformMirror.bytes.set(copied, byteOffset);
      previousUniformMirror.revision = ++this.staticGeneratedUniformMirrorRevision;
    } else if (byteOffset === 0 && copied.byteLength === webglBuffer.byteLength
      && this.canMirrorStaticGeneratedUniform(webglBuffer.usage, webglBuffer.byteLength)) {
      this.staticGeneratedUniformMirrors.set(webglBuffer, { generation, revision: ++this.staticGeneratedUniformMirrorRevision, bytes: copied });
      this.staticGeneratedUniformMirrorBytes += copied.byteLength;
    }
    this.host.counters.bufferUpdateCount += 1;
  }

  bindUniformBuffer(buffer: RenderBuffer, binding: number): void {
    this.host.lifecycle.assertAlive();
    const webglBuffer = this.host.drawBinder.requireBuffer(buffer);
    if (webglBuffer.target !== this.gl.UNIFORM_BUFFER) {
      throw new RenderDeviceError("Buffer was not created with usage 'uniform'", "INVALID_BUFFER_USAGE", { bufferId: buffer.id });
    }
    try {
      this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, binding, webglBuffer.handle);
      // bindBufferBase also changes the generic UNIFORM_BUFFER binding. Keep
      // the cache in step so a later upload cannot target a different buffer.
      this.stateCache.bindBuffer(this.gl.UNIFORM_BUFFER, webglBuffer.handle,
        () => this.gl.bindBuffer(this.gl.UNIFORM_BUFFER, webglBuffer.handle));
    } catch (error) {
      this.stateCache.invalidate();
      if (binding === AURA_FRAME_BINDING) {
        this.staticGeneratedFrameBinding = undefined;
        this.staticGeneratedFrameBindingRevision += 1;
      }
      throw error;
    }
    if (binding === AURA_FRAME_BINDING) {
      this.staticGeneratedFrameBinding = { buffer: webglBuffer, generation: this.shaderGeneration, revision: ++this.staticGeneratedFrameBindingRevision };
    }
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.host.lifecycle.assertAlive();
    const webglBuffer = this.host.drawBinder.requireBuffer(buffer);
    if (!Number.isSafeInteger(byteOffset) || !Number.isSafeInteger(byteLength) || byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: webglBuffer.byteLength
      });
    }
    const output = new Uint8Array(byteLength);
    this.host.drawBinder.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    this.gl.getBufferSubData(webglBuffer.target, byteOffset, output);
    return output;
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.host.lifecycle.assertAlive();
    this.assertShaderMarker(sources);
    this.assertPortableShaderBindingsSupported(sources);
    const generation = this.shaderGeneration;
    let vertexShader: WebGLShader | undefined;
    let fragmentShader: WebGLShader | undefined;
    let program: WebGLProgram | undefined;
    try {
      const compiledVertex = sources.vertex;
      vertexShader = this.compileShader(this.gl.VERTEX_SHADER, compiledVertex, sources.label);
      const compiledFragment = sources.fragment;
      fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, compiledFragment, sources.label);
      const recorded = getRecordedStaticGeneratedUnlitSources(sources);
      const generatedSources = recorded && recorded.vertex === compiledVertex && recorded.fragment === compiledFragment ? recorded : undefined;
      program = this.gl.createProgram() ?? undefined;
      if (!program) throw new RenderDeviceError("Failed to allocate WebGL shader program", "WEBGL_ALLOCATION_FAILED");
      this.host.counters.shaderProgramCreateCount += 1;
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);
      this.host.counters.programCompiles += 1;
      const result = this.finalizeLinkedProgram(program, sources);
      const generatedReflection = generatedSources && staticUnlitDeviceMethodsCurrent(this) && result instanceof WebGL2ShaderProgram
        ? captureStaticGeneratedReflection(result) : undefined;
      if (generatedSources && generatedReflection && generation === this.shaderGeneration && !this.host.contextLost && !this.host.disposed
        && result.marker === generatedSources.marker && result.label === generatedSources.label) {
        this.staticGeneratedOrdinaryPrograms.set(result, { generation, sources: generatedSources, reflection: generatedReflection });
      }
      if (sources.label === DEFAULT_UNLIT_SHADER_NAME && sources.webgpu === undefined && sources.portableBindings === undefined && sources.generatedProgram === undefined) {
        const canonical = getStaticUnlitSources()?.ordinary;
        if (canonical && sources.marker === canonical.marker && sources.vertex === canonical.vertex && sources.fragment === canonical.fragment) {
          this.staticUnlitOrdinaryPrograms.set(result, this.shaderGeneration);
        }
      }
      program = undefined; // Ownership transferred to the returned wrapper.
      return result;
    } finally {
      if (vertexShader) this.gl.deleteShader(vertexShader);
      if (fragmentShader) this.gl.deleteShader(fragmentShader);
      if (program) this.gl.deleteProgram(program);
    }
  }

  /** LINK_STATUS check, named-block bindings and reflection for a linked program. */
  private finalizeLinkedProgram(program: WebGLProgram, sources: ShaderSources): RenderShaderProgram {
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "Unknown shader link error";
      throw new RenderDeviceError("WebGL shader link failed", "SHADER_LINK_FAILED", { label: sources.label, log });
    }

    // T0-02/C-08: generated blocks declare `layout(std140)` with no baked
    // `binding=`; the named-block → binding-point assignment is fixed here so
    // every linked program gets AuraFrame→0 and AuraLights→1 regardless of
    // declaration order. Programs that do not declare a block are skipped.
    for (const [blockName, binding] of NAMED_UNIFORM_BLOCK_BINDINGS) {
      const index = this.gl.getUniformBlockIndex(program, blockName);
      if (index !== this.gl.INVALID_INDEX) {
        this.gl.uniformBlockBinding(program, index, binding);
      }
    }

    const reflection = this.reflectProgram(program);
    this.validateActiveSamplerLimits(sources, reflection);
    const shader = new WebGL2ShaderProgram(
      this.nextId++,
      sources.label,
      sources.marker,
      reflection,
      program,
      this.gl
    );
    shader.onDispose = () => {
      try {
        if (this.gl.getParameter(this.gl.CURRENT_PROGRAM) === program) this.gl.useProgram(null);
      } finally {
        this.stateCache.invalidate();
      }
    };
    this.shaders.add(shader);
    return shader;
  }

  private validateActiveSamplerLimits(sources: ShaderSources, reflection: ShaderReflection): void {
    const gl = this.gl;
    const samplerTypes = new Set([
      gl.SAMPLER_2D, gl.SAMPLER_3D, gl.SAMPLER_CUBE, gl.SAMPLER_2D_SHADOW, gl.SAMPLER_2D_ARRAY,
      gl.SAMPLER_2D_ARRAY_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.INT_SAMPLER_2D, gl.INT_SAMPLER_3D,
      gl.INT_SAMPLER_CUBE, gl.INT_SAMPLER_2D_ARRAY, gl.UNSIGNED_INT_SAMPLER_2D, gl.UNSIGNED_INT_SAMPLER_3D,
      gl.UNSIGNED_INT_SAMPLER_CUBE, gl.UNSIGNED_INT_SAMPLER_2D_ARRAY
    ].filter((value) => typeof value === "number").map(String));
    const vertexUniforms = reflectShaderSources({ ...sources, fragment: "" }).uniforms;
    const fragmentUniforms = reflectShaderSources({ ...sources, vertex: "" }).uniforms;
    let vertex = 0, fragment = 0;
    for (const detail of reflection.uniformDetails.values()) {
      if (!samplerTypes.has(detail.type)) continue;
      const count = detail.arraySize ?? 1;
      const inVertex = vertexUniforms.has(detail.name), inFragment = fragmentUniforms.has(detail.name);
      // Linked reflection exposes active samplers but not their individual stage
      // usage. Declarations in both stages are conservatively counted in both.
      if (inVertex || !inFragment) vertex += count;
      if (inFragment || !inVertex) fragment += count;
    }
    if (vertex === 0 && fragment === 0) return;
    const vertexLimit = Number(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS));
    const fragmentLimit = Number(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS));
    const combinedLimit = Number(gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS));
    if (![vertexLimit, fragmentLimit, combinedLimit].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new RenderDeviceError("WebGL sampler limits are unavailable", "WEBGL_PORTABLE_RESOURCE_LIMIT");
    }
    if (vertex > vertexLimit || fragment > fragmentLimit || vertex + fragment > combinedLimit) {
      throw new RenderDeviceError("Shader exceeds WebGL texture-unit limits", "WEBGL_PORTABLE_RESOURCE_LIMIT", {
        vertex, fragment, vertexLimit, fragmentLimit, combinedLimit
      });
    }
  }

  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    this.host.lifecycle.assertAlive();
    validateRenderTargetDescriptor(descriptor);
    const policy = this.host.textureBudgetPolicy;
    const release = reserveTextureBudget(renderTargetTextureBytes(descriptor), policy?.maxBytes ?? policy?.textureBudgetBytes, this);
    let deferredRelease = false;
    const retireFailedStorage = (handles: readonly WebGLTexture[]): void => {
      deferredRelease = true;
      void this.host.textureRegistry.retireNativeTextures(handles, release);
    };
    let created: WebGL2RenderTarget | undefined;
    try {
      const target = created = this.createRenderTargetStorage(descriptor, retireFailedStorage) as WebGL2RenderTarget;
      this.targetTextureCharges.set(target, release);
      this.targetGenerations.set(target, this.renderTargetGeneration);
      target.onFreed = () => {
        this.targetTextureCharges.delete(target);
        release();
      };
      target.retireTextures = (handles, debit) => { void this.host.textureRegistry.retireNativeTextures(handles, debit); };
      // Feature targets and layer views reuse these identities. Claim only
      // after their native storage and framebuffer construction succeeded.
      for (const texture of new Set([target.colorTexture, ...(target.colorTextures ?? []), ...(target.depthTexture ? [target.depthTexture] : [])])) {
        claimRenderTargetTextureOwner(texture, this);
      }
      return target;
    } catch (error) {
      if (created && !created.disposed) {
        // A failed post-allocation claim must retire, not orphan, native names.
        deferredRelease = true;
        try { created.dispose(); } catch { /* Keep the charge without a retirement receipt. */ }
      }
      if (!deferredRelease) release();
      throw error;
    }
  }

  private createRenderTargetStorage(descriptor: RenderTargetDescriptor, retireFailedStorage: (handles: readonly WebGLTexture[]) => void): RenderTarget {
    this.host.lifecycle.assertAlive();
    validateRenderTargetDescriptor(descriptor);
    const mipLevelCount = descriptor.mipLevelCount ?? 1;
    if (mipLevelCount > 1) {
      if ((descriptor.dimension ?? "2d") !== "2d" || descriptor.layers !== undefined || descriptor.depthOnly || descriptor.depthCompare || (descriptor.colorAttachments?.length ?? 0) > 1 || (descriptor.sampleCount ?? 1) !== 1) {
        throw new RenderDeviceError("Mipmapped WebGL render targets require one 2D single-sample color attachment", "RENDER_TARGET_MIPMAP_UNSUPPORTED");
      }
      const format = renderTargetColorFormat(descriptor);
      resolveRenderTargetFormat(this.gl, format);
      if (format === "rgba32f" && !this.gl.getExtension("OES_texture_float_linear")) {
        throw new RenderDeviceError("RGBA32F render-target mipmaps require OES_texture_float_linear", "RENDER_TARGET_MIPMAP_UNSUPPORTED");
      }
    }
    if (
      (descriptor.dimension !== undefined && descriptor.dimension !== "2d") ||
      descriptor.layers !== undefined ||
      descriptor.depthOnly === true ||
      descriptor.depthCompare === true ||
      (descriptor.colorAttachments?.length ?? 0) > 1
    ) {
      return this.createFeatureRenderTarget(descriptor, retireFailedStorage);
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
    const requestedSampleCount = descriptor.sampleCount ?? 1;
    const maxSamples = Number(this.gl.getParameter(this.gl.MAX_SAMPLES) ?? 1);
    if (!Number.isInteger(requestedSampleCount) || requestedSampleCount < 1 || requestedSampleCount > maxSamples) {
      throw new RenderDeviceError("WebGL2 render-target sampleCount must be an integer supported by MAX_SAMPLES.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount: requestedSampleCount,
        maxSamples,
        label: descriptor.label
      });
    }
    const sampleCount = requestedSampleCount;
    const format = renderTargetColorFormat(descriptor);
    const textureFormat = resolveRenderTargetFormat(this.gl, format);
    const depthMode = descriptor.depth === "texture" ? "texture" : descriptor.depth === false ? "none" : "renderbuffer";
    // Fixed targets keep one packed DEPTH24_STENCIL8 so depth copies stay
    // compatible; a float request uses DEPTH32F_STENCIL8 (or DEPTH_COMPONENT32F
    // when the caller declares no stencil need).
    const floatDepth = descriptor.depthPrecision === "float" && depthMode !== "none";
    const depthStorage = webgl2DepthStorageFormat(this.gl, floatDepth, !floatDepth || descriptor.stencil !== false);
    const { colorHandle, framebuffer, drawFramebuffer, multisampleColorHandle, depthHandle, multisampleDepthHandle, depthTextureHandle } = (() => {
      let colorHandle: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null, drawFramebuffer: WebGLFramebuffer | null = null;
      let multisampleColorHandle: WebGLRenderbuffer | null = null, depthHandle: WebGLRenderbuffer | null = null, multisampleDepthHandle: WebGLRenderbuffer | null = null;
      let depthTextureHandle: WebGLTexture | null = null;
      try {
        colorHandle = this.gl.createTexture();
        framebuffer = this.gl.createFramebuffer();
        drawFramebuffer = sampleCount > 1 ? this.gl.createFramebuffer() : framebuffer;
        multisampleColorHandle = sampleCount > 1 ? this.gl.createRenderbuffer() : null;
        depthHandle = depthMode === "renderbuffer" ? this.gl.createRenderbuffer() : null;
        multisampleDepthHandle = sampleCount > 1 && depthMode !== "none" ? (depthHandle ?? this.gl.createRenderbuffer()) : depthHandle;
        depthTextureHandle = depthMode === "texture" ? this.gl.createTexture() : null;
        return { colorHandle, framebuffer, drawFramebuffer, multisampleColorHandle, depthHandle, multisampleDepthHandle, depthTextureHandle };
      } catch (error) {
        if (colorHandle) this.gl.deleteTexture(colorHandle);
        if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
        if (drawFramebuffer && drawFramebuffer !== framebuffer) this.gl.deleteFramebuffer(drawFramebuffer);
        if (multisampleColorHandle) this.gl.deleteRenderbuffer(multisampleColorHandle);
        if (multisampleDepthHandle) this.gl.deleteRenderbuffer(multisampleDepthHandle);
        else if (depthHandle) this.gl.deleteRenderbuffer(depthHandle);
        if (depthTextureHandle) this.gl.deleteTexture(depthTextureHandle);
        throw error;
      }
    })();
    if (
      !colorHandle
      || !framebuffer
      || !drawFramebuffer
      || (sampleCount > 1 && !multisampleColorHandle)
      || ((depthMode === "renderbuffer" || (sampleCount > 1 && depthMode !== "none")) && !multisampleDepthHandle)
      || (depthMode === "texture" && !depthTextureHandle)
    ) {
      if (colorHandle) this.gl.deleteTexture(colorHandle);
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      if (drawFramebuffer && drawFramebuffer !== framebuffer) this.gl.deleteFramebuffer(drawFramebuffer);
      if (multisampleColorHandle) this.gl.deleteRenderbuffer(multisampleColorHandle);
      if (multisampleDepthHandle) this.gl.deleteRenderbuffer(multisampleDepthHandle);
      if (depthTextureHandle) this.gl.deleteTexture(depthTextureHandle);
      throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    const previousActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE) as GLenum;
    this.gl.activeTexture(this.gl.TEXTURE0);
    const previousTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousFramebuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousRenderbuffer = this.gl.getParameter(this.gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
    let submittedStorage = false;
    const cleanup = (): void => {
      const textureHandles = [colorHandle, ...(depthTextureHandle ? [depthTextureHandle] : [])];
      if (submittedStorage) retireFailedStorage(textureHandles);
      else for (const handle of textureHandles) this.gl.deleteTexture(handle);
      this.gl.deleteFramebuffer(framebuffer);
      if (drawFramebuffer !== framebuffer) this.gl.deleteFramebuffer(drawFramebuffer);
      if (multisampleColorHandle) this.gl.deleteRenderbuffer(multisampleColorHandle);
      if (multisampleDepthHandle) this.gl.deleteRenderbuffer(multisampleDepthHandle);
    };
    let resolveStatus = 0;
    let drawStatus = 0;
    let mipUploadError: string | null = null;
    try {
      this.gl.bindTexture(this.gl.TEXTURE_2D, colorHandle);
      const colorFilter = renderTargetSampleFilter(this.gl, renderTargetColorFormat(descriptor));
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, colorFilter);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, colorFilter);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      // A single `colorAttachments` entry is the attachment-0 format (CONTRACTS
      // §3.4) and wins over the legacy `format` field. Before this, the 2d path
      // ignored it, so `createHdrTarget` ({ format: "rgba8", colorAttachments:
      // [{ format: "rgba16f" }] }) without coverage allocated an RGBA8 "HDR"
      // scene target: linear radiance clamped at 1.0 and 8-bit dark banding
      // before tone mapping (GPU run 38190015020: device ACES of 4.0 = 226 vs
      // three 250; tonemap-ramp dark swatches ΔE2000 13-30).
      submittedStorage = true;
      for (let level = 0; level < mipLevelCount; level += 1) {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          level,
          textureFormat.internalFormat,
          Math.max(1, Math.floor(descriptor.width / 2 ** level)),
          Math.max(1, Math.floor(descriptor.height / 2 ** level)),
          0,
          this.gl.RGBA,
          textureFormat.type,
          null
        );
      }
      if (mipLevelCount > 1) {
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, mipLevelCount - 1);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR_MIPMAP_LINEAR);
      }

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, colorHandle, 0);
      if (depthHandle && sampleCount === 1) {
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, depthHandle);
        this.gl.renderbufferStorage(this.gl.RENDERBUFFER, depthStorage.internalFormat, descriptor.width, descriptor.height);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, depthStorage.attachment, this.gl.RENDERBUFFER, depthHandle);
      }
      if (depthTextureHandle) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, depthTextureHandle);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          depthStorage.internalFormat,
          descriptor.width,
          descriptor.height,
          0,
          depthStorage.format,
          depthStorage.type,
          null
        );
        this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, depthStorage.attachment, this.gl.TEXTURE_2D, depthTextureHandle, 0);
      }
      resolveStatus = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
      drawStatus = resolveStatus;
      if (sampleCount > 1 && multisampleColorHandle) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, drawFramebuffer);
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, multisampleColorHandle);
        const multisampleColorFormat = format === "rgba8" ? this.gl.RGBA8 : textureFormat.internalFormat;
        this.gl.renderbufferStorageMultisample(this.gl.RENDERBUFFER, sampleCount, multisampleColorFormat, descriptor.width, descriptor.height);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.RENDERBUFFER, multisampleColorHandle);
        if (multisampleDepthHandle) {
          this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, multisampleDepthHandle);
          this.gl.renderbufferStorageMultisample(this.gl.RENDERBUFFER, sampleCount, depthStorage.internalFormat, descriptor.width, descriptor.height);
          this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, depthStorage.attachment, this.gl.RENDERBUFFER, multisampleDepthHandle);
        }
        drawStatus = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
      }
      mipUploadError = mipLevelCount > 1 ? this.host.lifecycle.readError() : null;
    } catch (error) {
      cleanup();
      throw error;
    } finally {
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, previousRenderbuffer);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
      this.gl.bindTexture(this.gl.TEXTURE_2D, previousTexture);
      this.gl.activeTexture(previousActiveTexture);
      this.stateCache.invalidate();
    }
    if (resolveStatus !== this.gl.FRAMEBUFFER_COMPLETE || drawStatus !== this.gl.FRAMEBUFFER_COMPLETE || mipUploadError || this.host.lifecycle.isDeviceLost()) {
      cleanup();
      throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { resolveStatus, drawStatus, mipUploadError });
    }

    const depthTexture = depthTextureHandle
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${descriptor.label ?? "render-target"}-depth`, renderAttachment: true })
      : undefined;
    const target = new WebGL2RenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, format, mipLevelCount, label: descriptor.label ?? "render-target-color", renderAttachment: true }),
      depthTexture,
      framebuffer,
      colorHandle,
      multisampleDepthHandle,
      depthTextureHandle,
      sampleCount,
      drawFramebuffer,
      multisampleColorHandle,
      this.gl,
      { hasStencil: depthMode !== "none" && depthStorage.stencil, ...(floatDepth ? { depthStorage: "float" as const } : {}) }
    );
    target.onDispose = () => this.forgetRenderTargetTextures(target);
    this.renderTargets.add(target);
    // Shadow passes label their depth target after the shadow map texture, so the
    // label is the device-side signal that a shadow depth target was allocated.
    // Cascaded maps use the established renderer-csm-cascade-* labels, and the
    // PRD-02 sun cascades use prd02-cascade-*. Count their actual allocation too,
    // including the first shadow frame.
    if (isShadowRenderTargetLabel(descriptor.label)) this.host.counters.shadowRenderTargetsAllocated += 1;
    this.host.textureRegistry.textures.set(target.colorTexture, colorHandle);
    this.host.textureRegistry.textureUploadModes.set(target.colorTexture, "rgba8");
    if (depthTexture && depthTextureHandle) {
      this.host.textureRegistry.textures.set(depthTexture, depthTextureHandle);
      this.host.textureRegistry.textureUploadModes.set(depthTexture, "depth-render-target");
    }
    return target;
  }

  /** Generate only the already allocated color levels, preserving GL bindings. */
  generateRenderTargetMipmaps(target: RenderTarget): void {
    this.host.lifecycle.assertAlive();
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed || this.targetGenerations.get(target) !== this.renderTargetGeneration || this.host.lifecycle.isDeviceLost()) {
      throw new RenderDeviceError("Render target is disposed or belongs to another device", "INVALID_RENDER_TARGET");
    }
    if (target.dimension !== "2d" || target.depthOnly || target.sampleCount !== 1 || (target.colorTextures?.length ?? 1) !== 1 || target.colorTexture.mipLevelCount < 2 || this.host.activeRenderTarget === target) {
      throw new RenderDeviceError("Render target cannot generate color mipmaps in its current state", "RENDER_TARGET_MIPMAP_UNSUPPORTED");
    }
    if (target.colorTexture.format === "rgba32f" && !this.gl.getExtension("OES_texture_float_linear")) {
      throw new RenderDeviceError("RGBA32F render-target mipmaps require OES_texture_float_linear", "RENDER_TARGET_MIPMAP_UNSUPPORTED");
    }
    const gl = this.gl;
    const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as GLenum;
    gl.activeTexture(gl.TEXTURE0);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    try {
      gl.bindTexture(gl.TEXTURE_2D, target.colorHandle);
      gl.generateMipmap(gl.TEXTURE_2D);
      const error = this.host.lifecycle.readError();
      if (error || this.host.lifecycle.isDeviceLost()) throw new RenderDeviceError("WebGL render target mip generation failed", "RENDER_TARGET_MIPMAP_FAILED", { error });
    } finally {
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.activeTexture(previousActiveTexture);
      this.stateCache.invalidate();
    }
  }

  /**
   * PR 0a render-target fields (CONTRACTS §3.4): `dimension`/`layers` (cube +
   * 2d-array layered targets rendered through `layerTargets`), `depthOnly`
   * (no color attachment), `depthCompare` (comparison-sampler depth texture)
   * and `colorAttachments` (MRT, per-layer `drawBuffers` state).
   */
  private createFeatureRenderTarget(descriptor: RenderTargetDescriptor, retireFailedStorage: (handles: readonly WebGLTexture[]) => void): RenderTarget {
    const gl = this.gl;
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
    const dimension = descriptor.dimension ?? "2d";
    if (descriptor.layers !== undefined && (!Number.isInteger(descriptor.layers) || descriptor.layers < 1)) {
      throw new RenderDeviceError("Render target layer count must be a positive integer", "INVALID_RENDER_TARGET_SIZE", {
        layers: descriptor.layers,
        label: descriptor.label
      });
    }
    if (descriptor.layers !== undefined && dimension !== "2d-array") {
      throw new RenderDeviceError("Render target `layers` only applies to dimension \"2d-array\"", "INVALID_RENDER_TARGET_SIZE", {
        dimension,
        layers: descriptor.layers,
        label: descriptor.label
      });
    }
    const layerCount = dimension === "cube" ? 6 : dimension === "2d-array" ? descriptor.layers ?? 1 : 1;
    const depthOnly = descriptor.depthOnly === true;
    if (depthOnly && (descriptor.colorAttachments?.length ?? 0) > 0) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `colorAttachments`", "INVALID_RENDER_TARGET_SIZE", {
        label: descriptor.label
      });
    }
    if (depthOnly && descriptor.depth === false) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `depth: false`", "INVALID_RENDER_TARGET_SIZE", {
        label: descriptor.label
      });
    }
    if (descriptor.depthCompare && descriptor.depth === false) {
      throw new RenderDeviceError("A comparison depth texture requires a depth attachment", "INVALID_RENDER_TARGET_SIZE", { label: descriptor.label });
    }
    const sampleCount = descriptor.sampleCount ?? 1;
    const colorAttachmentCount = depthOnly ? 0 : Math.max(1, descriptor.colorAttachments?.length ?? 1);
    if (sampleCount > 1 && (depthOnly || descriptor.depthCompare === true || dimension !== "2d")) {
      throw new RenderDeviceError("Multisample render targets do not support layered, depth-only or compare descriptors", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount,
        label: descriptor.label
      });
    }
    const maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES) ?? 1);
    if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > maxSamples) {
      throw new RenderDeviceError("WebGL2 render-target sampleCount must be an integer supported by MAX_SAMPLES.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount,
        maxSamples,
        label: descriptor.label
      });
    }
    if (sampleCount > 1) {
      const maxColorAttachments = Number(gl.getParameter(gl.MAX_COLOR_ATTACHMENTS));
      const maxDrawBuffers = Number(gl.getParameter(gl.MAX_DRAW_BUFFERS));
      if (!Number.isInteger(maxColorAttachments) || !Number.isInteger(maxDrawBuffers)
          || colorAttachmentCount > maxColorAttachments || colorAttachmentCount > maxDrawBuffers) {
        throw new RenderDeviceError("Multisample color attachment count exceeds WebGL2 limits", "INVALID_RENDER_TARGET_SIZE", {
          colorAttachmentCount, maxColorAttachments, maxDrawBuffers, label: descriptor.label
        });
      }
    }

    const label = descriptor.label ?? "render-target";
    const textureTarget = dimension === "cube" ? gl.TEXTURE_CUBE_MAP : dimension === "2d-array" ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const depthMode = depthOnly || descriptor.depth === "texture" || descriptor.depthCompare === true || (layerCount > 1 && descriptor.depth !== false) ? "texture" : descriptor.depth === false ? "none" : "renderbuffer";
    const depthCompare = descriptor.depthCompare === true;
    // A single packed depth/stencil format keeps depth copies compatible
    // between shadow, color, multisample and per-layer targets. Its depth
    // component remains sampleable as the public depth24 texture. A float
    // request (reversed-Z scene depth) uses DEPTH32F_STENCIL8 instead, or
    // DEPTH_COMPONENT32F when the caller declares no stencil need.
    const floatDepth = descriptor.depthPrecision === "float" && depthMode !== "none";
    const depthStorage = webgl2DepthStorageFormat(gl, floatDepth, !floatDepth || descriptor.stencil !== false);
    const hasStencil = depthMode !== "none" && depthStorage.stencil;

    const colorFormats: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">[] = depthOnly
      ? []
      : colorAttachmentCount === 1 && !descriptor.colorAttachments
        ? [descriptor.format ?? "rgba8"]
        : (descriptor.colorAttachments ?? [{ format: descriptor.format ?? "rgba8" }]).map((attachment) => attachment.format);
    const colorHandles: WebGLTexture[] = [];
    const colorTextures: Texture[] = [];
    let depthTextureHandle: WebGLTexture | null = null;
    let depthRenderbufferHandle: WebGLRenderbuffer | null = null;
    let placeholderHandle: WebGLTexture | null = null;
    let multisampleFramebuffer: WebGLFramebuffer | null = null;
    const multisampleColorHandles: WebGLRenderbuffer[] = [];
    let submittedStorage = false;
    const layerFramebuffers: WebGLFramebuffer[] = [];

    const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as GLenum;
    gl.activeTexture(gl.TEXTURE0);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousCubeTexture = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture | null;
    const previousArrayTexture = gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY) as WebGLTexture | null;
    const previousDrawFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousReadFramebuffer = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
    const restoreBindings = (): void => {
      gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousReadFramebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDrawFramebuffer);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, previousCubeTexture);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, previousArrayTexture);
      gl.activeTexture(previousActiveTexture);
      this.stateCache.invalidate();
    };
    const cleanup = (): void => {
      const textureHandles = [...colorHandles, ...(placeholderHandle ? [placeholderHandle] : []), ...(depthTextureHandle ? [depthTextureHandle] : [])];
      if (submittedStorage) retireFailedStorage(textureHandles);
      else for (const handle of textureHandles) gl.deleteTexture(handle);
      if (depthRenderbufferHandle) gl.deleteRenderbuffer(depthRenderbufferHandle);
      for (const handle of multisampleColorHandles) gl.deleteRenderbuffer(handle);
      if (multisampleFramebuffer) gl.deleteFramebuffer(multisampleFramebuffer);
      for (const framebuffer of layerFramebuffers) gl.deleteFramebuffer(framebuffer);
      restoreBindings();
    };

    try {
      for (let attachment = 0; attachment < colorFormats.length; attachment += 1) {
        const format = colorFormats[attachment];
        const textureFormat = resolveRenderTargetFormat(gl, format);
        const handle = gl.createTexture();
        if (!handle) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        colorHandles.push(handle);
        colorTextures.push(
          new Texture({ width: descriptor.width, height: descriptor.height, format, label: colorAttachmentCount > 1 ? `${label}-color-${attachment}` : descriptor.label ?? "render-target-color", dimension, layers: dimension === "2d" ? undefined : layerCount, renderAttachment: true })
        );
        gl.bindTexture(textureTarget, handle);
        const colorFilter = renderTargetSampleFilter(gl, format);
        gl.texParameteri(textureTarget, gl.TEXTURE_MIN_FILTER, colorFilter);
        gl.texParameteri(textureTarget, gl.TEXTURE_MAG_FILTER, colorFilter);
        gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        submittedStorage = true;
        if (dimension === "2d") {
          gl.texImage2D(textureTarget, 0, textureFormat.internalFormat, descriptor.width, descriptor.height, 0, gl.RGBA, textureFormat.type, null);
        } else if (dimension === "cube") {
          gl.texStorage2D(textureTarget, 1, renderTargetStorageFormat(gl, textureFormat.internalFormat), descriptor.width, descriptor.height);
        } else {
          gl.texStorage3D(textureTarget, 1, renderTargetStorageFormat(gl, textureFormat.internalFormat), descriptor.width, descriptor.height, layerCount);
        }
      }

      let depthTexture: Texture | undefined;
      if (depthMode === "texture") {
        depthTextureHandle = gl.createTexture();
        if (!depthTextureHandle) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        depthTexture = new Texture({
          width: descriptor.width,
          height: descriptor.height,
          format: "depth24",
          label: `${label}-depth`,
          dimension,
          layers: dimension === "2d" ? undefined : layerCount,
          renderAttachment: true
        });
        gl.bindTexture(textureTarget, depthTextureHandle);
        gl.texParameteri(textureTarget, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(textureTarget, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (depthCompare) {
          gl.texParameteri(textureTarget, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
          gl.texParameteri(textureTarget, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        }
        const internalFormat = floatDepth ? depthStorage.internalFormat : hasStencil ? gl.DEPTH24_STENCIL8 : gl.DEPTH_COMPONENT24;
        const pixelFormat = floatDepth ? depthStorage.format : hasStencil ? gl.DEPTH_STENCIL : gl.DEPTH_COMPONENT;
        const pixelType = floatDepth ? depthStorage.type : hasStencil ? gl.UNSIGNED_INT_24_8 : gl.UNSIGNED_INT;
        submittedStorage = true;
        if (dimension === "2d-array") {
          gl.texImage3D(textureTarget, 0, internalFormat, descriptor.width, descriptor.height, layerCount, 0, pixelFormat, pixelType, null);
        } else if (dimension === "cube") {
          gl.texStorage2D(textureTarget, 1, internalFormat, descriptor.width, descriptor.height);
        } else {
          gl.texImage2D(textureTarget, 0, internalFormat, descriptor.width, descriptor.height, 0, pixelFormat, pixelType, null);
        }
      }

      if (depthMode === "renderbuffer" || (sampleCount > 1 && depthMode === "texture")) {
        depthRenderbufferHandle = gl.createRenderbuffer();
        if (!depthRenderbufferHandle) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbufferHandle);
        if (sampleCount > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount, depthStorage.internalFormat, descriptor.width, descriptor.height);
        else gl.renderbufferStorage(gl.RENDERBUFFER, depthStorage.internalFormat, descriptor.width, descriptor.height);
        gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
      }

      const drawBuffers = depthOnly
        ? [gl.NONE]
        : colorFormats.map((_, attachment) => gl.COLOR_ATTACHMENT0 + attachment);
      const attachLayer = (framebuffer: WebGLFramebuffer, layer: number): boolean => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        if (depthOnly) {
          gl.drawBuffers([gl.NONE]);
          gl.readBuffer(gl.NONE);
        } else if (drawBuffers.length > 1) {
          gl.drawBuffers(drawBuffers);
        }
        for (let attachment = 0; attachment < colorHandles.length; attachment += 1) {
          if (dimension === "cube") {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, colorHandles[attachment], 0);
          } else if (dimension === "2d-array") {
            gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, colorHandles[attachment], 0, layer);
          } else {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, gl.TEXTURE_2D, colorHandles[attachment], 0);
          }
        }
        if (depthTextureHandle) {
          const depthAttachment = hasStencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;
          if (dimension === "cube") {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, depthAttachment, gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, depthTextureHandle, 0);
          } else if (dimension === "2d-array") {
            gl.framebufferTextureLayer(gl.FRAMEBUFFER, depthAttachment, depthTextureHandle, 0, layer);
          } else {
            gl.framebufferTexture2D(gl.FRAMEBUFFER, depthAttachment, gl.TEXTURE_2D, depthTextureHandle, 0);
          }
        }
        if (depthRenderbufferHandle && sampleCount === 1) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, depthStorage.attachment, gl.RENDERBUFFER, depthRenderbufferHandle);
        }
        return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      };

      for (let layer = 0; layer < layerCount; layer += 1) {
        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        layerFramebuffers.push(framebuffer);
        if (!attachLayer(framebuffer, layer)) {
          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { status, layer, label });
        }
      }

      if (sampleCount > 1) {
        multisampleFramebuffer = gl.createFramebuffer();
        if (!multisampleFramebuffer) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, multisampleFramebuffer);
        gl.drawBuffers(drawBuffers);
        for (let attachment = 0; attachment < colorFormats.length; attachment += 1) {
          const handle = gl.createRenderbuffer();
          if (!handle) {
            throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
          }
          multisampleColorHandles.push(handle);
          gl.bindRenderbuffer(gl.RENDERBUFFER, handle);
          const format = resolveRenderTargetFormat(gl, colorFormats[attachment]);
          gl.renderbufferStorageMultisample(gl.RENDERBUFFER, sampleCount,
            renderTargetStorageFormat(gl, format.internalFormat), descriptor.width, descriptor.height);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, gl.RENDERBUFFER, handle);
        }
        if (depthRenderbufferHandle) {
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, depthStorage.attachment, gl.RENDERBUFFER, depthRenderbufferHandle);
        }
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE || this.host.lifecycle.isDeviceLost()) {
          throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { status, label });
        }
      }

      restoreBindings();

      const colorTexture = colorTextures[0] ?? new Texture({ width: descriptor.width, height: descriptor.height, format: "rgba8", label: `${label}-colorless`, dimension, renderAttachment: true });
      let parentColorHandle = colorHandles[0];
      if (!parentColorHandle) {
        // Depth-only targets keep a placeholder Texture in `colorTexture`; give it a
        // real (never-attached, never-registered) GL handle so dispose stays sound.
        parentColorHandle = gl.createTexture();
        if (!parentColorHandle) {
          throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
        }
        placeholderHandle = parentColorHandle;
      }
      const target = new WebGL2RenderTarget(
        this.nextId++,
        descriptor.width,
        descriptor.height,
        label,
        colorTexture,
        depthTexture,
        layerFramebuffers[0],
        parentColorHandle,
        depthRenderbufferHandle,
        depthTextureHandle,
        sampleCount,
        multisampleFramebuffer ?? layerFramebuffers[0],
        multisampleColorHandles[0] ?? null,
        gl,
        {
          dimension,
          layers: layerCount > 1 ? layerCount : undefined,
          depthOnly: descriptor.depthOnly,
          colorTextures: colorTextures.length > 1 ? colorTextures : undefined,
          extraColorHandles: colorHandles.slice(1),
          extraMultisampleColorHandles: multisampleColorHandles.slice(1),
          layerFramebuffers,
          layerChild: false,
          hasStencil,
          ...(floatDepth ? { depthStorage: "float" as const } : {})
        }
      );
      target.onDispose = () => this.forgetRenderTargetTextures(target);
      if (layerCount > 1) {
        const children: RenderTarget[] = layerFramebuffers.map(
          (framebuffer, layer) =>
            new WebGL2RenderTarget(
              this.nextId++,
              descriptor.width,
              descriptor.height,
              `${label}-layer-${layer}`,
              colorTexture,
              depthTexture,
              framebuffer,
              colorHandles[0],
              null,
              depthTextureHandle,
              1,
              framebuffer,
              null,
              gl,
              { dimension, layers: 1, colorTextures: target.colorTextures, layerChild: true, depthOnly: descriptor.depthOnly, attachmentLayer: layer, attachmentMipLevel: 0, hasStencil, ...(floatDepth ? { depthStorage: "float" as const } : {}) }
            )
        );
        // layerTargets shares parent GL resources; children only mark dispose.
        target.layerTargets = children;
        for (const child of children) {
          this.renderTargets.add(child as WebGL2RenderTarget);
        }
      }
      this.renderTargets.add(target);
      if (isShadowRenderTargetLabel(label)) this.host.counters.shadowRenderTargetsAllocated += 1;
      for (let attachment = 0; attachment < colorHandles.length; attachment += 1) {
        this.host.textureRegistry.textures.set(colorTextures[attachment], colorHandles[attachment]);
        this.host.textureRegistry.textureUploadModes.set(colorTextures[attachment], colorFormats[attachment]);
      }
      if (depthTexture && depthTextureHandle) {
        this.host.textureRegistry.textures.set(depthTexture, depthTextureHandle);
        this.host.textureRegistry.textureUploadModes.set(depthTexture, "depth-render-target");
      }
      return target;
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  /**
   * Promote the renderer-owned, two-color selective target to an MSAA draw
   * framebuffer. Its existing texture framebuffer remains the resolve target.
   * This deliberately does not extend the public generic MRT contract.
   */
  promoteSelectiveBloomMultisample(target: RenderTarget, samples: number): boolean {
    const gl = this.gl;
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed ||
        target.sampleCount !== 1 || target.depthHandle || target.colorTextures?.length !== 2 ||
        target.colorTextures[0] !== target.colorTexture ||
        target.colorTextures[1]?.format !== target.colorTexture.format ||
        !Number.isInteger(samples) || samples <= 1) return false;
    const format = target.colorTexture.format;
    if (format !== "rgba16f" && format !== "rgba32f") return false;
    const internal = resolveRenderTargetFormat(gl, format).internalFormat;
    const supports = (value: GLenum): boolean => {
      const counts = gl.getInternalformatParameter(gl.RENDERBUFFER, value, gl.SAMPLES) as Int32Array | null;
      return counts !== null && Array.from(counts).includes(samples);
    };
    // Match the target's depth precision so the promoted frame keeps it.
    const depthInternal = target.depthStorage === "float" ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT24;
    if (!supports(internal) || !supports(depthInternal)) return false;
    const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
    let framebuffer: WebGLFramebuffer | null = null;
    const colors: WebGLRenderbuffer[] = [];
    let depth: WebGLRenderbuffer | null = null;
    let committed = false;
    try {
      framebuffer = gl.createFramebuffer();
      if (!framebuffer) return false;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      for (let i = 0; i < 2; i += 1) {
        const color = gl.createRenderbuffer();
        if (!color) return false;
        colors.push(color);
        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, internal, target.width, target.height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.RENDERBUFFER, color);
      }
      depth = gl.createRenderbuffer();
      if (!depth) return false;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, depthInternal, target.width, target.height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return false;
      target.installSelectiveMultisample(samples, framebuffer, [colors[0]!, colors[1]!], depth);
      committed = true;
      return true;
    } finally {
      if (!committed) {
        if (framebuffer) gl.deleteFramebuffer(framebuffer);
        for (const color of colors) gl.deleteRenderbuffer(color);
        if (depth) gl.deleteRenderbuffer(depth);
      }
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
      this.stateCache.invalidate();
    }
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.host.lifecycle.assertAlive();
    this.assertOutsideGaussianSplatDraw();
    if (this.host.activeRenderTarget?.disposed) {
      this.host.activeRenderTarget = null;
    }
    if (this.host.activeRenderTarget && this.host.activeRenderTarget !== target) {
      this.resolveMultisampleTarget(this.host.activeRenderTarget);
    }
    if (target === null) {
      this.host.activeRenderTarget = null;
      const defaultFramebuffer = this.host.lifecycle.defaultFramebuffer();
      this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, defaultFramebuffer, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, defaultFramebuffer));
      this.host.lifecycle.applyViewState();
      return;
    }
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.host.activeRenderTarget = target;
    this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, target.drawFramebuffer, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.drawFramebuffer));
    this.host.lifecycle.applyViewState();
    if (target.hasStencil && !this.initializedStencilFramebuffers.has(target.drawFramebuffer)) {
      this.host.lifecycle.initializeStencil();
      this.initializedStencilFramebuffers.add(target.drawFramebuffer);
    }
  }

  /**
   * threejs-parity L7/SC-01: raster viewport in target pixels, origin bottom-left.
   * Default: frame-scoped — applies while the current target stays bound and
   * resets at `beginFrame`. `{ persistent: true }` (XR): scoped to the default
   * (canvas/external) framebuffer and survives `beginFrame` and the post/present
   * passes until `resetViewport()`.
   */
  setViewport(x: number, y: number, width: number, height: number, options?: { readonly persistent?: boolean }): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.setViewport(x, y, width, height, options);
  }

  resetViewport(): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.resetViewport();
  }

  /** Whether XR or another caller overrides the default framebuffer output. */
  hasDefaultOutputOverride(): boolean {
    return this.host.lifecycle.persistentViewport() !== null || this.host.lifecycle.defaultFramebuffer() !== null;
  }

  /** XR: frames draw into `framebuffer` instead of the canvas until this is called with null. */
  setExternalFramebuffer(framebuffer: unknown | null, width: number, height: number): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.setExternalFramebuffer(framebuffer as WebGLFramebuffer | null, width, height);
  }

  /** threejs-parity L7/SC-01: scissor rect; clipping is gated by `setScissorTest`. */
  setScissor(x: number, y: number, width: number, height: number): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.setScissor(x, y, width, height);
  }

  setScissorTest(enabled: boolean): void {
    this.assertOutsideGaussianSplatDraw();
    this.host.lifecycle.setScissorTest(enabled);
  }

  /** Internal adapter used by ordered Gaussian splat color-space transitions. */
  createGaussianSplatColorAdapter(): GaussianSplatColorAdapter {
    this.host.lifecycle.assertAlive();
    const adapter = new WebGL2GaussianSplatColorAdapter(this.host, (target, scissor, draw) => {
      this.assertOutsideGaussianSplatDraw();
      this.gaussianSplatBorrowedDepth = { scene: target, scissor };
      try { draw(); } finally { this.gaussianSplatBorrowedDepth = null; }
    }, () => this.gaussianSplatAdapters.delete(adapter));
    this.gaussianSplatAdapters.add(adapter);
    return adapter;
  }

  private assertOutsideGaussianSplatDraw(): void {
    if (this.gaussianSplatBorrowedDepth) {
      throw new RenderDeviceError("A Gaussian splat draw cannot change or clear its borrowed target", "GAUSSIAN_SPLAT_BORROWED_TARGET_IN_USE");
    }
  }

  getRenderTarget(): RenderTarget | null {
    this.host.lifecycle.assertAlive();
    if (this.host.activeRenderTarget?.disposed) {
      this.host.activeRenderTarget = null;
    }
    return this.host.activeRenderTarget;
  }

  async copyRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    this.host.lifecycle.assertAlive();
    throwIfWebGLResourceTransferAborted(options.signal);
    const source = this.requireTransferTarget(options.source);
    const destination = this.requireTransferTarget(options.destination);
    const aspect = options.aspect ?? "color";
    const sourceAttachment = options.sourceAttachment ?? 0;
    const destinationAttachment = options.destinationAttachment ?? 0;
    const read = getRenderAttachmentIdentity(source, aspect, sourceAttachment);
    const write = getRenderAttachmentIdentity(destination, aspect, destinationAttachment);
    if (source.width !== destination.width || source.height !== destination.height || read.format !== write.format
      || (aspect === "depth" && ((source.depthStorage ?? "fixed") !== (destination.depthStorage ?? "fixed") || source.hasStencil !== destination.hasStencil))) {
      throw new RenderDeviceError("Copy attachments must have identical size and format", "INVALID_RESOURCE_COPY");
    }
    if (write.sampleCount !== 1 || (read.sampleCount > 1 && aspect !== "color")) {
      throw new RenderDeviceError("WebGL2 copies require a single-sample destination and resolve only multisampled color", "INVALID_RESOURCE_COPY");
    }
    validateRenderAttachmentAccess([read], [write]);
    // Give an already scheduled abort a chance before issuing the atomic GL blit.
    await Promise.resolve();
    throwIfWebGLResourceTransferAborted(options.signal);
    this.host.lifecycle.assertAlive();
    this.requireTransferTarget(source);
    this.requireTransferTarget(destination);

    const gl = this.gl;
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    let sourceReadBuffer: GLenum | undefined;
    let destinationDrawBuffers: GLenum[] | undefined;
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.sampleCount > 1 ? source.drawFramebuffer : source.framebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destination.drawFramebuffer);
      if (aspect === "color") {
        sourceReadBuffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
        const count = destination.colorTextures?.length ?? 1;
        destinationDrawBuffers = Array.from({ length: count }, (_, index) => gl.getParameter(gl.DRAW_BUFFER0 + index) as GLenum);
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + sourceAttachment);
        gl.drawBuffers(Array.from({ length: Math.max(count, destinationAttachment + 1) }, (_, index) => index === destinationAttachment ? gl.COLOR_ATTACHMENT0 + index : gl.NONE));
      }
      if (scissorEnabled) gl.disable(gl.SCISSOR_TEST);
      gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, destination.width, destination.height,
        aspect === "color" ? gl.COLOR_BUFFER_BIT : gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    } finally {
      if (sourceReadBuffer !== undefined) gl.readBuffer(sourceReadBuffer);
      if (destinationDrawBuffers) gl.drawBuffers(destinationDrawBuffers);
      if (scissorEnabled) gl.enable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
      this.stateCache.invalidate();
    }
  }

  async resolveRenderTarget(options: RenderResourceCopyOptions): Promise<void> {
    if ((options.source.sampleCount ?? 1) <= 1 || (options.destination.sampleCount ?? 1) !== 1 || (options.aspect ?? "color") !== "color") {
      throw new RenderDeviceError("Resolve requires multisampled color source and single-sampled destination", "INVALID_RESOURCE_RESOLVE");
    }
    await this.copyRenderTarget(options);
  }

  async readRenderTarget(options: RenderResourceReadbackOptions): Promise<Uint8Array> {
    this.host.lifecycle.assertAlive();
    throwIfWebGLResourceTransferAborted(options.signal);
    const target = this.requireTransferTarget(options.target);
    const attachment = options.attachment ?? 0;
    const identity = getRenderAttachmentIdentity(target, "color", attachment);
    if (identity.format !== "rgba8" || identity.sampleCount !== 1) {
      throw new RenderDeviceError("Byte readback requires an rgba8 single-sampled attachment", "INVALID_RESOURCE_READBACK");
    }
    await Promise.resolve();
    throwIfWebGLResourceTransferAborted(options.signal);
    this.host.lifecycle.assertAlive();
    this.requireTransferTarget(target);
    const gl = this.gl;
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    let previousBuffer: GLenum | undefined;
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
      previousBuffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + attachment);
      const pixels = new Uint8Array(target.width * target.height * 4);
      gl.readPixels(0, 0, target.width, target.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      this.host.counters.readbacks += 1;
      return pixels;
    } finally {
      if (previousBuffer !== undefined) gl.readBuffer(previousBuffer);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      this.stateCache.invalidate();
    }
  }

  private requireTransferTarget(target: RenderTarget): WebGL2RenderTarget {
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", { targetId: target.id });
    }
    return target;
  }

  private forgetRenderTargetTextures(target: WebGL2RenderTarget): void {
    for (const texture of [...(target.colorTextures ?? [target.colorTexture]), target.depthTexture]) {
      if (!texture) continue;
      this.host.textureRegistry.textures.delete(texture);
      this.host.textureRegistry.textureUploadModes.delete(texture);
    }
  }

  private resolveMultisampleTarget(target: WebGL2RenderTarget): void {
    if (target.sampleCount <= 1 || !target.needsResolve) return;
    const gl = this.gl;
    const previousRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST);
    const attachmentCount = target.colorTextures?.length ?? 1;
    let sourceReadBuffer: GLenum | undefined;
    let destinationDrawBuffers: GLenum[] | undefined;
    try {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.drawFramebuffer);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.framebuffer);
      sourceReadBuffer = gl.getParameter(gl.READ_BUFFER) as GLenum;
      destinationDrawBuffers = Array.from({ length: attachmentCount }, (_, index) => gl.getParameter(gl.DRAW_BUFFER0 + index) as GLenum);
      // A blit copies the selected read buffer to every enabled draw buffer.
      // Resolve each attachment with exactly one corresponding destination.
      if (scissorEnabled) gl.disable(gl.SCISSOR_TEST);
      for (let attachment = 0; attachment < attachmentCount; attachment += 1) {
        gl.readBuffer(gl.COLOR_ATTACHMENT0 + attachment);
        gl.drawBuffers(Array.from({ length: attachmentCount }, (_, index) => index === attachment ? gl.COLOR_ATTACHMENT0 + index : gl.NONE));
        let mask = gl.COLOR_BUFFER_BIT;
        if (attachment === 0 && target.depthTextureHandle) mask |= gl.DEPTH_BUFFER_BIT;
        gl.blitFramebuffer(0, 0, target.width, target.height, 0, 0, target.width, target.height, mask, gl.NEAREST);
      }
      target.needsResolve = false;
    } finally {
      if (sourceReadBuffer !== undefined) gl.readBuffer(sourceReadBuffer);
      if (destinationDrawBuffers) gl.drawBuffers(destinationDrawBuffers);
      if (scissorEnabled) gl.enable(gl.SCISSOR_TEST);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw);
      this.stateCache.invalidate();
    }
  }
























  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    const viewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array | readonly number[];
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.host.disposed],
      ["contextLost", this.host.contextLost],
      ["frameActive", this.host.lifecycle.frameActive],
      ["depthTest", this.gl.isEnabled(this.gl.DEPTH_TEST)],
      ["blend", this.gl.isEnabled(this.gl.BLEND)],
      ["cullFace", this.gl.isEnabled(this.gl.CULL_FACE)],
      ["program", this.gl.getParameter(this.gl.CURRENT_PROGRAM) ? "bound" : null],
      ["arrayBuffer", this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["elementArrayBuffer", this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["viewportWidth", this.host.lifecycle.viewportWidth],
      ["viewportHeight", this.host.lifecycle.viewportHeight],
      ["actualViewportWidth", viewport[2] ?? 0],
      ["actualViewportHeight", viewport[3] ?? 0],
      ["renderTarget", this.host.activeRenderTarget?.label ?? null],
      ["drawCalls", this.host.counters.drawCalls],
      ["nativeTemporalPasses", this.host.counters.nativeTemporalPasses],
      ["nativeTemporalBindings", this.host.counters.nativeTemporalBindings],
      ["shaderProgramCreates", this.host.counters.shaderProgramCreateCount],
      ["uniformLocationLookups", this.host.counters.uniformLocationLookupCount],
      ["bufferUpdates", this.host.counters.bufferUpdateCount],
      ["textureBinds", this.host.counters.textureBindCount],
      ["samplerParameterUploads", this.host.counters.samplerParameterUploadCount],
      ["vertexArrayCreates", this.host.counters.vertexArrayCreateCount],
      ["samplerObjects", this.host.samplers.samplerObjectCache.size],
      ["samplerAnisotropyUploads", this.host.counters.samplerAnisotropyUploadCount],
      ["maxTextureAnisotropy", this.maxTextureAnisotropy],
      ["nativeEnvironmentBindings", this.host.counters.nativeEnvironmentBindings],
      ["nativeShadowMapBindings", this.host.counters.nativeShadowMapBindings],
      ["nativeInstancedSubmissions", this.host.counters.nativeInstancedSubmissions],
      ["stateCacheIssued", this.stateCache.stats().issued],
      ["stateCacheSkipped", this.stateCache.stats().skipped]
    ]);
  }

  getLiveTextures(): readonly Texture[] {
    const live = new Set<Texture>();
    for (const target of this.renderTargets) {
      if (target.disposed) continue;
      const colors = target.depthOnly ? [] : target.colorTextures ?? [target.colorTexture];
      for (const texture of [...colors, target.depthTexture]) if (texture && !texture.disposed) live.add(texture);
    }
    for (const texture of this.host.textureRegistry.textures.keys()) if (!texture.disposed) live.add(texture);
    return [...live];
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    this.host.textureRegistry.releaseDisposedTextureHandles();
    // Single passes over the live sets (this runs at least twice a frame): no spread copies, no per-field filter chains.
    const liveRenderTargets: WebGL2RenderTarget[] = [];
    let disposedRenderTargets = 0;
    let disposedRenderTargetTextures = 0;
    let maxRenderTargetSampleCount = 1;
    for (const target of this.renderTargets) {
      if (target.disposed) disposedRenderTargets += 1;
      else {
        liveRenderTargets.push(target);
        if (target.sampleCount > maxRenderTargetSampleCount) maxRenderTargetSampleCount = target.sampleCount;
      }
      if (target.colorTexture.disposed) disposedRenderTargetTextures += 1;
    }
    const liveTextures = new Set<Texture>();
    for (const target of liveRenderTargets) liveTextures.add(target.colorTexture);
    for (const texture of this.host.textureRegistry.textures.keys()) if (!texture.disposed) liveTextures.add(texture);
    let compressedTextureCount = 0;
    let compressedTextureBytes = 0;
    let fallbackTextureCount = 0;
    let fallbackTextureBytes = 0;
    const textureBytes = textureBudgetUsage(this);
    for (const texture of liveTextures) {
      const residentBytes = textureBudgetResidentBytes(texture, this) ?? texture.byteLength;
      const fallback = this.host.textureRegistry.textureUploadModes.get(texture) === "fallback";
      if (isCompressedTextureFormat(texture.format) && !fallback) {
        compressedTextureCount += 1;
        compressedTextureBytes += residentBytes;
      }
      if (fallback) {
        fallbackTextureCount += 1;
        fallbackTextureBytes += residentBytes;
      }
    }
    const streamedDiagnostics = this.textureResidencyAdapter?.diagnostics();
    compressedTextureCount += streamedDiagnostics?.compressedTextures ?? 0;
    compressedTextureBytes += streamedDiagnostics?.compressedTextureBytes ?? 0;
    fallbackTextureCount += streamedDiagnostics?.textureFallbacks ?? 0;
    fallbackTextureBytes += streamedDiagnostics?.textureFallbackBytes ?? 0;
    const stateCacheTotals = this.stateCache.totals();
    let liveBuffers = 0;
    let bufferBytes = 0;
    let disposedBuffers = 0;
    for (const buffer of this.buffers) {
      if (buffer.disposed) disposedBuffers += 1;
      else {
        liveBuffers += 1;
        bufferBytes += buffer.byteLength;
      }
    }
    for (const buffer of this.retiringBuffers) {
      if (!buffer.disposed) {
        liveBuffers += 1;
        bufferBytes += buffer.byteLength;
      }
    }
    let liveShaders = 0;
    let disposedShaders = 0;
    for (const shader of this.shaders) {
      if (shader.disposed) disposedShaders += 1;
      else liveShaders += 1;
    }
    const gpuTargetEntries = this.host.post.describeGpuTargetInventory(liveRenderTargets);
    return {
      drawCalls: this.host.counters.drawCalls,
      triangles: this.primitiveCounts.triangles,
      lines: this.primitiveCounts.lines,
      points: this.primitiveCounts.points,
      buffers: liveBuffers,
      shaders: liveShaders,
      renderTargets: liveRenderTargets.length,
      maxRenderTargetSampleCount,
      textures: liveTextures.size + (streamedDiagnostics?.textures ?? 0),
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: compressedTextureCount,
      compressedTextureBytes,
      textureFallbacks: fallbackTextureCount,
      textureFallbackBytes: fallbackTextureBytes,
      nativeEnvironmentBindings: this.host.counters.nativeEnvironmentBindings,
      nativeShadowMapBindings: this.host.counters.nativeShadowMapBindings,
      shadowRenderTargetsAllocated: this.host.counters.shadowRenderTargetsAllocated,
      nativeInstancedSubmissions: this.host.counters.nativeInstancedSubmissions,
      bloom: this.host.post.lastBloomDiagnostics,
      nativeTemporalPasses: this.host.counters.nativeTemporalPasses,
      nativeTemporalBindings: this.host.counters.nativeTemporalBindings,
      samplerAnisotropyUploads: this.host.counters.samplerAnisotropyUploadCount,
      maxTextureAnisotropy: this.maxTextureAnisotropy,
      stateCacheIssued: stateCacheTotals.issued,
      stateCacheSkipped: stateCacheTotals.skipped,
      stateCacheProgramSwitches: this.stateCache.issuedCount("useProgram"),
      stateCacheTextureBinds: this.stateCache.issuedCount("bindTexture"),
      stateCacheBufferBinds: this.stateCache.issuedCount("bindBuffer"),
      stateCacheVertexArrayBinds: this.stateCache.issuedCount("bindVertexArray"),
      stateCacheSamplerBinds: this.stateCache.issuedCount("bindSampler"),
      disposedBuffers: this.disposedBufferCount + disposedBuffers,
      disposedShaders,
      disposedRenderTargets,
      disposedTextures: disposedRenderTargetTextures + this.host.counters.releasedTextureHandles,
      ...spreadGpuTargetInventory(gpuTargetEntries),
      programCompileCount: this.host.counters.programCompiles,
      readPixelsCalls: this.host.counters.readbacks,
      lastError: [this.host.lifecycle.restoreError, this.host.lifecycle.lastError].filter(Boolean).join("; ") || null,
      contextLost: this.host.contextLost
    };
  }

  private disposeBuffers(): unknown[] {
    const errors: unknown[] = [];
    for (const buffer of new Set([...this.buffers, ...this.retiringBuffers])) {
      if (buffer.retirementInProgress) continue;
      try { buffer.dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  }

  private disposeRemainingVertexArrays(errors: unknown[]): void {
    // Pending buffer retirements still need the binder's cache and index.
    if (this.retiringBuffers.size > 0) return;
    for (const [key, entry] of [...this.host.drawBinder.vertexArrayCache]) {
      try {
        this.gl.deleteVertexArray(entry.handle);
        this.host.drawBinder.vertexArrayCache.delete(key);
      } catch (error) {
        errors.push(error);
      }
    }
  }

  private disposeNativePostEffects(errors: unknown[]): void {
    if (!this.nativePostDisposalPending) return;
    // A reentrant registry disposal is intentionally a no-op. A unique,
    // resource-free witness distinguishes that case from a completed pass,
    // so an outer lifecycle cannot forget this device while cleanup is active.
    let witnessed = false;
    try {
      registerNativePostEffectLifecycle(this.host, {
        releaseView() {},
        releaseScope() {},
        dispose() { witnessed = true; }
      });
      disposeNativePostEffectsForHost(this.host);
      if (witnessed) this.nativePostDisposalPending = false;
    } catch (error) {
      errors.push(error);
    }
  }

  private finishDisposalAfterNativeRetirements(): void {
    if (!this.nativeRetirementDrainReady || this.nativePostDisposalPending || (this.deviceDisposalActions?.size ?? 0) > 0 || this.nativeRetirementDrainRegistered) return;
    this.nativeRetirementDrainRegistered = true;
    // A retained owner may register a fence after dispose returns. Post cleanup
    // may also register one on retry, so wait until it succeeds before asking
    // the registry to detach the context-loss listener when retirements drain.
    this.host.textureRegistry.onNativeRetirementsDrained(() => {
      this.host.lifecycle.deviceLostListeners.clear();
      this.host.lifecycle.deviceRestoredListeners.clear();
      if ("removeEventListener" in this.host.lifecycle.canvas) {
        if (this.host.lifecycle.contextLostListener) this.host.lifecycle.canvas.removeEventListener("webglcontextlost", this.host.lifecycle.contextLostListener);
        if (this.host.lifecycle.contextRestoredListener) this.host.lifecycle.canvas.removeEventListener("webglcontextrestored", this.host.lifecycle.contextRestoredListener);
      }
    });
  }

  dispose(): void {
    if (this.disposingDevice) return;
    this.disposingDevice = true;
    try {
      this.disposeResources();
    } finally {
      this.disposingDevice = false;
    }
  }

  private disposeResources(): void {
    if (this.host.disposed) {
      const errors: unknown[] = [];
      this.disposeNativePostEffects(errors);
      errors.push(...this.disposeBuffers());
      this.disposeDeviceOwnedResources(errors);
      this.disposeRemainingVertexArrays(errors);
      this.finishDisposalAfterNativeRetirements();
      if (errors.length) throw new AggregateError(errors, "WebGL resource disposal failed.");
      return;
    }
    this.assertOutsideGaussianSplatDraw();
    for (const adapter of [...this.gaussianSplatAdapters]) adapter.dispose();
    this.host.disposed = true;
    this.nativePostDisposalPending = true;
    this.clearStaticUnlitBufferMirrors();
    this.staticUnlitPairTickets = new WeakMap();
    this.staticUnlitPairProgram = undefined;
    this.staticUnlitOrdinaryPrograms = new WeakMap();
    for (const cancel of [...this.cancelCompletionWaits]) cancel("DISPOSED_DEVICE");
    this.currentFrameToken = null;
    const postDisposalErrors: unknown[] = [];
    // Owners close immediately, but may retain this device's context-loss
    // listener until outstanding frames have registered their retirements.
    try { this.host.textureRegistry.disposeNativeTextureOwners(); } catch (error) { postDisposalErrors.push(error); }
    this.disposeNativePostEffects(postDisposalErrors);
    postDisposalErrors.push(...this.disposeBuffers());
    this.disposeDeviceOwnedResources(postDisposalErrors);
    this.disposeRemainingVertexArrays(postDisposalErrors);
    this.finishDisposalAfterNativeRetirements();
    if (postDisposalErrors.length) throw new AggregateError(postDisposalErrors, "WebGL resource disposal failed.");
  }

  private disposeDeviceOwnedResources(disposalErrors: unknown[]): void {
    if (!this.deviceDisposalActions) this.initializeDeviceDisposalActions();
    const actions = this.deviceDisposalActions!;
    // A deferred retirement callback may fail after its initial action left
    // the queue. Re-enlist the same action without repeating completed work.
    for (const [target, action] of this.deviceTargetDisposalActions) {
      if (target[resourceDisposalPending]) actions.add(action);
    }
    for (const action of [...actions]) {
      try { if (action() !== false) actions.delete(action); } catch (error) { disposalErrors.push(error); }
    }
  }

  private initializeDeviceDisposalActions(): void {
    const actions = this.deviceDisposalActions = new Set<() => boolean | void>();
    const add = (action: () => boolean | void): void => { actions.add(action); };
    const generation = this.shaderGeneration;
    const nativeValid = (): boolean => generation === this.shaderGeneration && !this.host.contextLost;
    for (const cancel of [...this.cancelParallelCompiles]) add(cancel);
    for (const shader of this.shaders) add(() => {
      if (!nativeValid()) shader.nativeInvalid = true;
      shader.dispose();
      return !shader[resourceDisposalPending];
    });
    for (const target of this.renderTargets) {
      const action = (): boolean => { target.dispose(); return !target[resourceDisposalPending]; };
      this.deviceTargetDisposalActions.set(target, action);
      add(action);
    }
    const samplers = new Map<WebGLSampler, string[]>();
    for (const [key, sampler] of this.host.samplers.samplerObjectCache) {
      const keys = samplers.get(sampler) ?? [];
      keys.push(key);
      samplers.set(sampler, keys);
    }
    for (const [sampler, keys] of samplers) {
      add(() => {
        if (nativeValid()) this.gl.deleteSampler(sampler);
        for (const key of keys) if (this.host.samplers.samplerObjectCache.get(key) === sampler) this.host.samplers.samplerObjectCache.delete(key);
      });
    }
    let textureHandlesDone = false, fallbacksDone = false;
    add(() => {
      // Targets must detach their own attachments before the registry retires
      // ordinary textures, otherwise a failed target can retire a name twice.
      if ([...this.renderTargets].some(target => !target.disposed || target[resourceDisposalPending])) return false;
      this.host.textureRegistry.disposeTextureHandles();
      this.host.textureRegistry.textureUploadModes.clear();
      textureHandlesDone = true;
      return true;
    });
    add(() => { this.host.textureRegistry.disposeFallbackTextures(); fallbacksDone = true; });
    add(() => {
      if (!textureHandlesDone || !fallbacksDone) return false;
      this.host.textureRegistry.disposeBudgetEntries();
      return true;
    });
    add(() => this.textureResidencyAdapter?.invalidate(false));

    const post = this.host.post;
    const programs = new Map<WebGLProgram, (() => void)[]>();
    const textures = new Map<WebGLTexture, (() => void)[]>();
    const framebuffers = new Map<WebGLFramebuffer, (() => void)[]>();
    const record = <T>(map: Map<T, (() => void)[]>, handle: T, clear: () => void): void => {
      const callbacks = map.get(handle) ?? [];
      callbacks.push(clear);
      map.set(handle, callbacks);
    };
    for (const key of [
      "presentationProgram", "bloomBrightExtractProgram", "bloomBlurProgram", "bloomCompositeProgram",
      "bloomDownsampleProgram", "bloomAccumulateProgram", "bloomBlur2dProgram", "bloomFusedAccumulateProgram",
      "bloomFusedCompositeProgram", "bloomPrefilterDownsampleProgram",
      // 4.7.x selective-bloom twins.
      "bloomBrightExtractSelectiveProgram", "bloomPrefilterDownsampleSelectiveProgram", "outlineProgram", "ssaoProgram", "ssrProgram",
      "depthOfFieldProgram", "motionBlurProgram", "taaProgram", "taaPresentationProgram", "nativeFxaaFinalizeProgram"
    ] as const) {
      const program = post[key];
      if (program) record(programs, program, () => { if (post[key] === program) post[key] = null; });
    }
    for (const [key, program] of post.ldrPostprocessPrograms) {
      record(programs, program, () => { if (post.ldrPostprocessPrograms.get(key) === program) post.ldrPostprocessPrograms.delete(key); });
    }
    const depthProgram = this.host.probe.depthReadbackProgram;
    if (depthProgram) record(programs, depthProgram, () => { if (this.host.probe.depthReadbackProgram === depthProgram) this.host.probe.depthReadbackProgram = null; });
    for (const [key, clearExtra] of [
      ["motionBlurVelocityTexture", () => { post.motionBlurVelocitySize = null; }],
      ["taaHistoryTexture", () => { post.taaHistorySize = null; }],
      ["bloomBrightLutTexture", () => { post.bloomBrightLutThreshold = null; }],
      ["bloomCompositeLutTexture", () => { post.bloomCompositeLutIntensity = null; post.bloomCompositeLutShoulder = null; }],
      ["outlineBlendLutTexture", () => { post.outlineBlendLutKey = null; }]
    ] as const) {
      const texture = post[key];
      if (texture) record(textures, texture, () => { if (post[key] === texture) { post[key] = null; clearExtra(); } });
    }
    const ping = post.bloomPingPongResources;
    if (ping) {
      const ts = new Set(ping.textures), fs = new Set(ping.framebuffers);
      let remaining = ts.size + fs.size;
      const clear = (): void => { if (--remaining === 0 && post.bloomPingPongResources === ping) post.bloomPingPongResources = null; };
      for (const texture of ts) record(textures, texture, clear);
      for (const framebuffer of fs) record(framebuffers, framebuffer, clear);
    }
    const pyramid = post.bloomPyramidResources;
    if (pyramid) {
      const ts = new Set([...pyramid.textures, pyramid.accumulatorTextureA, pyramid.accumulatorTextureB]);
      const fs = new Set([...pyramid.framebuffers, pyramid.accumulatorFramebufferA, pyramid.accumulatorFramebufferB]);
      let remaining = ts.size + fs.size;
      const clear = (): void => { if (--remaining === 0 && post.bloomPyramidResources === pyramid) post.bloomPyramidResources = null; };
      for (const texture of ts) record(textures, texture, clear);
      for (const framebuffer of fs) record(framebuffers, framebuffer, clear);
    }
    for (const [program, clear] of programs) add(() => { if (nativeValid()) this.gl.deleteProgram(program); for (const callback of clear) callback(); });
    for (const [texture, clear] of textures) add(() => { if (nativeValid()) this.gl.deleteTexture(texture); for (const callback of clear) callback(); });
    for (const [framebuffer, clear] of framebuffers) add(() => { if (nativeValid()) this.gl.deleteFramebuffer(framebuffer); for (const callback of clear) callback(); });
    const vao = post.presentationVertexArray;
    if (vao) add(() => { if (nativeValid()) this.gl.deleteVertexArray(vao); if (post.presentationVertexArray === vao) post.presentationVertexArray = null; });

    this.nativeRetirementDrainReady = true;
    this.host.activeRenderTarget = null;
    this.host.lifecycle.frameActive = false;
  }































































































  compileShader(type: GLenum, source: string, label: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) throw new RenderDeviceError("Failed to allocate WebGL shader", "WEBGL_ALLOCATION_FAILED", { label });
    try {
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const log = this.gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
        throw new RenderDeviceError(shaderCompileFailureMessage(log, { label }), "SHADER_COMPILE_FAILED", { label, log, stage: type === this.gl.VERTEX_SHADER ? "vertex" : "fragment" });
      }
      return shader;
    } catch (error) {
      this.gl.deleteShader(shader);
      throw error;
    }
  }

  private reflectProgram(program: WebGLProgram): ShaderReflection {
    const attributes = new Map<string, number>();
    const uniforms = new Set<string>();
    const attributeDetails = new Map<string, ShaderReflection["attributeDetails"] extends ReadonlyMap<string, infer T> ? T : never>();
    const uniformDetails = new Map<string, ShaderReflection["uniformDetails"] extends ReadonlyMap<string, infer T> ? T : never>();
    const activeAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES) as number;
    const activeUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS) as number;

    for (let i = 0; i < activeAttributes; i += 1) {
      const info = this.gl.getActiveAttrib(program, i);
      if (info) {
        const location = this.gl.getAttribLocation(program, info.name);
        attributes.set(info.name, location);
        attributeDetails.set(info.name, { name: info.name, type: String(info.type), location, source: "vertex", line: 0 });
      }
    }
    for (let i = 0; i < activeUniforms; i += 1) {
      const info = this.gl.getActiveUniform(program, i);
      if (info) {
        const name = info.name.replace(/\[0\]$/, "");
        uniforms.add(name);
        uniformDetails.set(name, { name, type: String(info.type), arraySize: info.size > 1 ? info.size : null, source: "fragment", line: 0 });
      }
    }
    return { attributes, uniforms, attributeDetails, uniformDetails };
  }


















































































}









/**
 * Camera depth range for linearizing sampleable GL depth in the native
 * SSR/depth-of-field programs (muse3jsparity-PRD A3). Missing or invalid
 * ranges fall back to the engine perspective defaults (0.1/1000) rather than
 * failing the frame: the range is a calibration hint, and every engine camera
 * builder defaults to exactly 0.1/1000. The CPU byte kernels intentionally
 * keep fixture-unit depth semantics (deterministic reference); the native
 * programs document their GL-depth contract in-shader.
 */


































/** Next animation frame when available (browser), else a macrotask. */
// Capture the actual Aura entry points when this module initializes. A caller
// can still use overrides, but the opted-in pair path then declines so those
// overrides observe the original logical draws.
const staticUnlitDeviceMethodDescriptors: readonly (readonly [string, PropertyDescriptor])[] = [
  "draw", "createShaderProgram", "createBuffer", "updateBuffer", "isDeviceLost", "disposed", "contextLost", "activeFrameToken", "generation",
  "snapshotStaticUnlitBuffer", "hasStaticUnlitPairBuffers", "prepareStaticUnlitPair", "submitStaticUnlitPair",
  "bindUniformBuffer", "hasStaticGeneratedUnlitProgram", "prepareStaticGeneratedUnlitPair", "submitStaticGeneratedUnlitPair",
  "compileAsync", "issueShaderCompile", "compileShader", "finalizeLinkedProgram", "reflectProgram",
  "staticGeneratedFrameSnapshot", "staticGeneratedUnlitPairEvidence", "staticGeneratedPairProgramReady", "staticUnlitPairEvidence"
].map((name) => [name, Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name)!] as const);

function staticUnlitDeviceMethodsCurrent(device: WebGL2Device): boolean {
  if (Object.getPrototypeOf(device) !== WebGL2Device.prototype) return false;
  for (const [name, descriptor] of staticUnlitDeviceMethodDescriptors) {
    if (Object.hasOwn(device, name)) return false;
    const current = Object.getOwnPropertyDescriptor(WebGL2Device.prototype, name);
    if (!current || current.value !== descriptor.value || current.get !== descriptor.get || current.set !== descriptor.set) return false;
  }
  return true;
}

function scheduleParallelCompilePoll(poll: () => void): () => void {
  const raf = globalThis.requestAnimationFrame;
  if (typeof raf === "function") {
    const id = raf(poll);
    return () => globalThis.cancelAnimationFrame?.(id);
  }
  const id = setTimeout(poll, 0);
  return () => clearTimeout(id);
}

function throwIfWebGLResourceTransferAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason !== undefined) throw signal.reason;
  const error = new Error("Resource transfer was aborted");
  error.name = "AbortError";
  throw error;
}
