import type { PrimitiveTopology, RenderCommandState } from "../RenderDevice";
import { resolveBlendMode, validateRenderCommandState, type BlendComponent, type BlendFactor } from "../contracts/blend";
import type { VertexAttribute, VertexFormat } from "../VertexFormat";

/** Errors are raised before pipeline creation or any render-pass mutation. */
export class NativeRenderStateError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "NativeRenderStateError";
  }
}

export interface NativeVertexAttribute {
  readonly shaderLocation: number;
  readonly offset: number;
  readonly format: string;
}
export interface NativeVertexBufferLayout {
  readonly arrayStride: number;
  readonly stepMode?: "vertex" | "instance";
  readonly attributes: readonly NativeVertexAttribute[];
}
export interface NativeVertexLimits {
  readonly maxVertexBuffers?: number;
  readonly maxVertexAttributes?: number;
  readonly maxVertexBufferArrayStride?: number;
}
export interface NativeColorLimits {
  readonly maxColorAttachments?: number;
  readonly maxColorAttachmentBytesPerSample?: number;
}
export interface NativeRenderStateInput {
  readonly state: RenderCommandState;
  readonly topology: PrimitiveTopology;
  /** Ordered fragment output locations. Null denotes an unused attachment slot. */
  readonly colorFormats: readonly (string | null)[];
  readonly depthStencilFormat?: string | null;
  readonly sampleCount: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  /** Change these identities when the device, target, shader variant, or bind-group layout is replaced. */
  readonly deviceGeneration: number;
  /** Stable target identity, such as `canvas` or the owned render-target ID. */
  readonly targetKey: string;
  readonly targetGeneration: number;
  readonly shaderKey: string;
  readonly layoutKey: string;
  readonly vertexLayouts?: readonly (NativeVertexBufferLayout | null)[];
  readonly vertexLimits?: NativeVertexLimits;
  readonly colorLimits?: NativeColorLimits;
  /** Actual enabled device features, not merely adapter-supported features. */
  readonly features?: { readonly has: (feature: string) => boolean };
  /** Opt in when the device was requested in WebGPU compatibility mode. */
  readonly compatibilityMode?: boolean;
}
export interface NativeBlendComponent {
  readonly operation: string;
  readonly srcFactor: string;
  readonly dstFactor: string;
}
export interface NativeColorTarget {
  readonly format: string;
  readonly writeMask: number;
  readonly blend?: { readonly color: NativeBlendComponent; readonly alpha: NativeBlendComponent };
}
export interface NativeStencilFace {
  readonly compare: string;
  readonly failOp: string;
  readonly depthFailOp: string;
  readonly passOp: string;
}
export interface NativeDepthStencil {
  readonly format: string;
  readonly depthWriteEnabled: boolean;
  readonly depthCompare: string;
  readonly depthBias?: number;
  readonly depthBiasSlopeScale?: number;
  readonly depthBiasClamp?: number;
  readonly stencilFront?: NativeStencilFace;
  readonly stencilBack?: NativeStencilFace;
  readonly stencilReadMask?: number;
  readonly stencilWriteMask?: number;
}
export interface NativeRenderDynamicState {
  /** Top-left WebGPU scissor, clipped to the target; null retains the pass's view scissor. */
  readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly blendConstant: readonly [number, number, number, number] | null;
  readonly stencilReference: number | null;
}
export interface NativeRenderState {
  readonly primitive: { readonly topology: "triangle-list" | "line-list" | "point-list"; readonly cullMode: "none" | "front" | "back"; readonly frontFace: "ccw" | "cw" };
  readonly colorTargets: readonly (NativeColorTarget | null)[];
  readonly depthStencil?: NativeDepthStencil;
  readonly multisample: { readonly count: number; readonly mask: number; readonly alphaToCoverageEnabled: boolean };
  readonly vertexLayouts: readonly (NativeVertexBufferLayout | null)[];
  readonly dynamic: NativeRenderDynamicState;
  /** Complete, non-hashed canonical pipeline identity; dynamic state is deliberately excluded. */
  readonly pipelineKey: string;
}

const COLOR_FORMATS = new Set(["rgba8unorm", "rgba8unorm-srgb", "bgra8unorm", "bgra8unorm-srgb", "rgba16float", "rgba32float"]);
const DEPTH_FORMATS = new Set(["depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "stencil8"]);
const UINT32_MAX = 0xffffffff;

function fail(code: string, message: string): never { throw new NativeRenderStateError(code, message); }
function nonnegativeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > UINT32_MAX) fail("WEBGPU_STATE_INVALID", `${name} must be an unsigned 32-bit integer`);
}
function positiveLimit(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) fail("WEBGPU_VERTEX_LIMIT_INVALID", `${name} must be a positive integer`);
}

/** Map the engine's real typed/interleaved/multi-stream format to native buffer layouts. */
export function resolveNativeVertexLayouts(format: VertexFormat, limits: NativeVertexLimits = {}): readonly (NativeVertexBufferLayout | null)[] {
  const layouts: (NativeVertexBufferLayout | null)[] = [];
  for (const stream of format.streams) {
    if (stream.stepMode === "instance" && stream.divisor !== 1) fail("WEBGPU_VERTEX_DIVISOR_UNSUPPORTED", `stream ${stream.slot} instance divisor must be one`);
    while (layouts.length <= stream.slot) layouts.push(null);
    layouts[stream.slot] = {
      arrayStride: stream.stride,
      stepMode: stream.stepMode,
      attributes: format.attributes.filter((attribute) => attribute.bufferSlot === stream.slot).map((attribute) => ({
        shaderLocation: attribute.shaderLocation,
        offset: attribute.offset,
        format: nativeVertexFormat(attribute)
      }))
    };
  }
  return validateNativeVertexLayouts(layouts, limits);
}

function nativeVertexFormat(attribute: VertexAttribute): string {
  const { type, components, normalized, integer } = attribute;
  if (type === "float32") return components === 1 ? "float32" : `float32x${components}`;
  if (type === "int32" || type === "uint32") {
    if (!integer || normalized) fail("WEBGPU_VERTEX_FORMAT_UNSUPPORTED", `${type} cannot be converted to a floating vertex input`);
    const prefix = type === "int32" ? "sint32" : "uint32";
    return components === 1 ? prefix : `${prefix}x${components}`;
  }
  if (components !== 1 && components !== 2 && components !== 4) fail("WEBGPU_VERTEX_FORMAT_UNSUPPORTED", `${type} attributes require one, two or four components`);
  if (!integer && !normalized) fail("WEBGPU_VERTEX_FORMAT_UNSUPPORTED", `${type} requires either normalized or integer input`);
  const width = type.endsWith("8") ? "8" : "16";
  const prefix = normalized ? (type.startsWith("uint") ? "unorm" : "snorm") : (type.startsWith("uint") ? "uint" : "sint");
  return `${prefix}${width}${components === 1 ? "" : `x${components}`}`;
}

function vertexFormatSize(format: string): number {
  const match = /^(float32|uint32|sint32)(?:x([234]))?$|^(uint8|sint8|unorm8|snorm8|uint16|sint16|unorm16|snorm16)(?:x([24]))?$/.exec(format);
  if (!match) fail("WEBGPU_VERTEX_FORMAT_UNSUPPORTED", `unsupported native vertex format ${String(format)}`);
  return match[1] ? 4 * Number(match[2] ?? 1) : (match[3]!.endsWith("8") ? 1 : 2) * Number(match[4] ?? 1);
}

/** Validate already-resolved layouts too, including legacy separate instance streams. */
export function validateNativeVertexLayouts(layouts: readonly (NativeVertexBufferLayout | null)[], limits: NativeVertexLimits = {}): readonly (NativeVertexBufferLayout | null)[] {
  const maxBuffers = limits.maxVertexBuffers ?? 8;
  const maxAttributes = limits.maxVertexAttributes ?? 16;
  const maxStride = limits.maxVertexBufferArrayStride ?? 2048;
  positiveLimit(maxBuffers, "maxVertexBuffers"); positiveLimit(maxAttributes, "maxVertexAttributes"); positiveLimit(maxStride, "maxVertexBufferArrayStride");
  if (layouts.length > maxBuffers) fail("WEBGPU_VERTEX_BUFFER_LIMIT", `vertex layouts require ${layouts.length} slots, limit is ${maxBuffers}`);
  const locations = new Set<number>();
  const resolved = layouts.map((layout, slot) => {
    if (layout === null) return null;
    if (!Number.isSafeInteger(layout.arrayStride) || layout.arrayStride < 0 || layout.arrayStride > maxStride || layout.arrayStride % 4 !== 0) {
      fail("WEBGPU_VERTEX_STRIDE_INVALID", `stream ${slot} stride must be four-byte aligned and at most ${maxStride}`);
    }
    const stepMode = layout.stepMode ?? "vertex";
    if (stepMode !== "vertex" && stepMode !== "instance") fail("WEBGPU_VERTEX_LAYOUT_INVALID", `stream ${slot} has an invalid step mode`);
    const attributes = layout.attributes.map((attribute) => {
      nonnegativeInteger(attribute.shaderLocation, "shader location");
      if (attribute.shaderLocation >= maxAttributes) fail("WEBGPU_VERTEX_ATTRIBUTE_LIMIT", `shader location ${attribute.shaderLocation} exceeds the device limit ${maxAttributes}`);
      if (locations.has(attribute.shaderLocation)) fail("WEBGPU_VERTEX_LOCATION_CONFLICT", `shader location ${attribute.shaderLocation} is used more than once`);
      locations.add(attribute.shaderLocation);
      const size = vertexFormatSize(attribute.format);
      const alignment = Math.min(4, size);
      if (!Number.isSafeInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % alignment !== 0 ||
          (layout.arrayStride !== 0 && attribute.offset + size > layout.arrayStride) || attribute.offset + size > maxStride) {
        fail("WEBGPU_VERTEX_OFFSET_INVALID", `stream ${slot} attribute ${attribute.shaderLocation} does not fit or align`);
      }
      return { shaderLocation: attribute.shaderLocation, offset: attribute.offset, format: attribute.format };
    }).sort((a, b) => a.shaderLocation - b.shaderLocation);
    return { arrayStride: layout.arrayStride, stepMode, attributes };
  });
  if (locations.size > maxAttributes) fail("WEBGPU_VERTEX_ATTRIBUTE_LIMIT", `vertex attributes exceed the device limit ${maxAttributes}`);
  // Trailing null slots are semantically absent; interior nulls preserve the actual buffer slot.
  while (resolved.length && resolved[resolved.length - 1] === null) resolved.pop();
  return resolved;
}

function blendFactor(factor: BlendFactor): string {
  switch (factor) {
    case "src-color": return "src";
    case "one-minus-src-color": return "one-minus-src";
    case "dst-color": return "dst";
    case "one-minus-dst-color": return "one-minus-dst";
    default: return factor;
  }
}
function blendComponent(component: BlendComponent): NativeBlendComponent {
  const ignoresFactors = component.equation === "min" || component.equation === "max";
  return { operation: component.equation, srcFactor: ignoresFactors ? "one" : blendFactor(component.src), dstFactor: ignoresFactors ? "one" : blendFactor(component.dst) };
}
function stencilOperation(value: string | undefined): string {
  return value === "increment" ? "increment-clamp" : value === "decrement" ? "decrement-clamp" : value ?? "keep";
}
function safeScissor(state: RenderCommandState, width: number, height: number): NativeRenderDynamicState["scissor"] {
  const rect = state.scissor;
  if (!rect) return null;
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) || !Number.isSafeInteger(rect.x + rect.width) || !Number.isSafeInteger(rect.y + rect.height)) {
    fail("WEBGPU_SCISSOR_INVALID", "scissor coordinates and extents must be safe integers");
  }
  const x0 = Math.max(0, Math.min(width, rect.x));
  const x1 = Math.max(x0, Math.min(width, rect.x + rect.width));
  const y0 = Math.max(0, Math.min(height, rect.y));
  const y1 = Math.max(y0, Math.min(height, rect.y + rect.height));
  return { x: x0, y: height - y1, width: x1 - x0, height: y1 - y0 };
}

/** Resolve all supported pipeline and dynamic state before issuing GPU commands. */
export function resolveNativeRenderState(input: NativeRenderStateInput): NativeRenderState {
  const { state } = input;
  validateRenderCommandState(state, input.colorFormats.length);
  nonnegativeInteger(input.deviceGeneration, "device generation"); nonnegativeInteger(input.targetGeneration, "target generation");
  nonnegativeInteger(input.targetWidth, "target width"); nonnegativeInteger(input.targetHeight, "target height");
  if (input.targetWidth === 0 || input.targetHeight === 0) fail("WEBGPU_TARGET_INVALID", "target dimensions must be positive");
  if (typeof input.targetKey !== "string" || input.targetKey.length === 0 || typeof input.shaderKey !== "string" || input.shaderKey.length === 0 || typeof input.layoutKey !== "string" || input.layoutKey.length === 0) {
    fail("WEBGPU_PIPELINE_IDENTITY_INVALID", "target, shader and binding-layout identities must be non-empty strings");
  }
  if (input.sampleCount !== 1 && input.sampleCount !== 4) fail("WEBGPU_SAMPLE_COUNT_UNSUPPORTED", "sample count must be one or four");
  if (state.alphaToCoverage && input.sampleCount === 1) fail("WEBGPU_ALPHA_TO_COVERAGE_REQUIRES_MULTISAMPLING", "alpha-to-coverage requires multisampling");
  const maxColorAttachments = input.colorLimits?.maxColorAttachments ?? 8;
  const maxColorBytes = input.colorLimits?.maxColorAttachmentBytesPerSample ?? 32;
  positiveLimit(maxColorAttachments, "maxColorAttachments"); positiveLimit(maxColorBytes, "maxColorAttachmentBytesPerSample");
  if (input.colorFormats.length > maxColorAttachments) fail("WEBGPU_COLOR_ATTACHMENT_LIMIT", `color attachments exceed the device limit ${maxColorAttachments}`);
  const inheritedBlend = resolveBlendMode(state);
  let usesConstant = false;
  let colorBytes = 0;
  const colorTargets = input.colorFormats.map((format, index): NativeColorTarget | null => {
    const override = state.colorAttachments?.[index];
    if (format === null) {
      if (override?.blendMode !== undefined || override?.colorWrite !== undefined) fail("WEBGPU_COLOR_ATTACHMENT_STATE_INVALID", `color attachment ${index} is unused`);
      return null;
    }
    const blend = override?.blendMode === undefined ? inheritedBlend : resolveBlendMode({ blend: false, blendMode: override.blendMode });
    const nativeBlend = blend === "opaque" ? undefined : { color: blendComponent(blend.color), alpha: blendComponent(blend.alpha) };
    const writeMask = (override?.colorWrite ?? state.colorWrite ?? [true, true, true, true]).reduce((mask, enabled, component) => enabled ? mask | (1 << component) : mask, 0);
    if (blend !== "opaque" && [blend.color, blend.alpha].some((component) => component.equation !== "min" && component.equation !== "max" && [component.src, component.dst].some((factor) => factor === "constant" || factor === "one-minus-constant"))) usesConstant = true;
    if (!COLOR_FORMATS.has(format)) fail("WEBGPU_COLOR_FORMAT_UNSUPPORTED", `unsupported color attachment format ${String(format)}`);
    if (format === "bgra8unorm-srgb" && input.compatibilityMode) fail("WEBGPU_COLOR_FORMAT_UNSUPPORTED", "bgra8unorm-srgb requires core features and limits");
    if (input.sampleCount > 1 && (format === "rgba32float" || (format === "rgba16float" && input.compatibilityMode))) {
      fail("WEBGPU_MULTISAMPLE_FORMAT_UNSUPPORTED", `${format} does not support the requested multisampling`);
    }
    if (format === "rgba32float" && nativeBlend && !input.features?.has("float32-blendable")) fail("WEBGPU_FLOAT_BLEND_UNSUPPORTED", "rgba32float blending requires float32-blendable");
    const alignment = format === "rgba32float" ? 4 : format === "rgba16float" ? 2 : 1;
    // The WebGPU render-target pixel cost of RGBA8 is 8, despite its 4-byte texel footprint.
    const bytes = format === "rgba32float" ? 16 : 8;
    colorBytes = Math.ceil(colorBytes / alignment) * alignment + bytes;
    return { format, writeMask, ...(nativeBlend ? { blend: nativeBlend } : {}) };
  });
  if (colorBytes > maxColorBytes) fail("WEBGPU_COLOR_ATTACHMENT_BYTES_LIMIT", `color attachments require ${colorBytes} bytes per sample, limit is ${maxColorBytes}`);
  const format = input.depthStencilFormat ?? null;
  if (format !== null && !DEPTH_FORMATS.has(format)) fail("WEBGPU_DEPTH_FORMAT_UNSUPPORTED", `unsupported depth/stencil format ${String(format)}`);
  if (format === "depth32float-stencil8" && !input.features?.has("depth32float-stencil8")) fail("WEBGPU_DEPTH_FORMAT_UNSUPPORTED", "depth32float-stencil8 requires the matching device feature");
  if (!colorTargets.some((target) => target !== null) && format === null) fail("WEBGPU_ATTACHMENT_REQUIRED", "a color or depth/stencil attachment is required");
  if (state.alphaToCoverage && !colorTargets[0]) fail("WEBGPU_ALPHA_TO_COVERAGE_ATTACHMENT_REQUIRED", "alpha-to-coverage requires color attachment zero");
  const hasDepth = format !== null && format !== "stencil8";
  const hasStencil = format === "stencil8" || format === "depth24plus-stencil8" || format === "depth32float-stencil8";
  if (state.stencil && !hasStencil) fail("WEBGPU_STENCIL_ATTACHMENT_REQUIRED", "stencil state requires a stencil attachment");
  if (format === "stencil8" && state.depthTest) fail("WEBGPU_DEPTH_ATTACHMENT_REQUIRED", "depth testing requires a depth component in the attachment");
  const offset = state.polygonOffset;
  if (offset && (!Number.isInteger(offset.units) || offset.units < -2147483648 || offset.units > 2147483647)) fail("WEBGPU_DEPTH_BIAS_UNSUPPORTED", "depth bias units must be a signed 32-bit integer");
  if (offset && (!Number.isFinite(Math.fround(offset.factor)) || !Number.isFinite(Math.fround(offset.clamp ?? 0)))) fail("WEBGPU_DEPTH_BIAS_UNSUPPORTED", "depth bias slope and clamp must be finite float32 values");
  if (offset && (offset.factor !== 0 || offset.units !== 0 || (offset.clamp ?? 0) !== 0)) {
    if (!hasDepth) fail("WEBGPU_DEPTH_ATTACHMENT_REQUIRED", "polygon offset requires a depth attachment");
    if (input.topology !== "triangles") fail("WEBGPU_DEPTH_BIAS_UNSUPPORTED", "depth bias requires triangle topology");
    if ((offset.clamp ?? 0) !== 0 && input.compatibilityMode) fail("WEBGPU_DEPTH_BIAS_UNSUPPORTED", "nonzero depth-bias clamp requires core features and limits");
  }
  let topology: NativeRenderState["primitive"]["topology"];
  switch (input.topology) {
    case "triangles": topology = "triangle-list"; break;
    case "lines": topology = "line-list"; break;
    case "points": topology = "point-list"; break;
    default: return fail("WEBGPU_TOPOLOGY_UNSUPPORTED", `unsupported topology ${String(input.topology)}`);
  }
  const stencil = state.stencil;
  const face: NativeStencilFace | undefined = stencil ? {
    compare: stencil.compare ?? "always", failOp: stencilOperation(stencil.fail), depthFailOp: stencilOperation(stencil.depthFail), passOp: stencilOperation(stencil.depthPass)
  } : undefined;
  const depthStencil: NativeDepthStencil | undefined = format === null ? undefined : {
    format,
    depthWriteEnabled: hasDepth && state.depthTest && state.depthWrite,
    depthCompare: hasDepth && state.depthTest ? (state.depthCompareV2 ?? state.depthCompare) : "always",
    ...(offset ? { depthBias: offset.units, depthBiasSlopeScale: offset.factor, depthBiasClamp: offset.clamp ?? 0 } : {}),
    ...(face ? { stencilFront: face, stencilBack: { ...face }, stencilReadMask: stencil!.readMask ?? UINT32_MAX, stencilWriteMask: stencil!.writeMask ?? UINT32_MAX } : {})
  };
  const primitive = { topology, cullMode: state.cullMode, frontFace: state.frontFace ?? "ccw" } as const;
  const multisample = { count: input.sampleCount, mask: state.sampleMask ?? UINT32_MAX, alphaToCoverageEnabled: state.alphaToCoverage ?? false };
  const vertexLayouts = validateNativeVertexLayouts(input.vertexLayouts ?? [], input.vertexLimits);
  const dynamic: NativeRenderDynamicState = {
    scissor: safeScissor(state, input.targetWidth, input.targetHeight),
    blendConstant: usesConstant ? [...(state.blendConstant ?? [0, 0, 0, 0])] as [number, number, number, number] : null,
    stencilReference: stencil ? stencil.reference ?? 0 : null
  };
  // JSON arrays/objects provide unambiguous string escaping and canonical field order.
  const pipelineKey = JSON.stringify(["aura3d-webgpu-pipeline/1", input.deviceGeneration, input.targetKey, input.targetGeneration, input.shaderKey, input.layoutKey, primitive, colorTargets, depthStencil ?? null, multisample, vertexLayouts]);
  return { primitive, colorTargets, ...(depthStencil ? { depthStencil } : {}), multisample, vertexLayouts, dynamic, pipelineKey };
}

export interface NativeDynamicPass {
  setScissorRect?(x: number, y: number, width: number, height: number): void;
  setBlendConstant?(color: readonly [number, number, number, number]): void;
  setStencilReference?(reference: number): void;
}
/** Apply to a fresh pass, or restore its view scissor first when reusing a pass. */
export function applyNativeRenderDynamicState(pass: NativeDynamicPass, state: NativeRenderDynamicState): void {
  if (state.scissor && !pass.setScissorRect) fail("WEBGPU_SCISSOR_UNAVAILABLE", "render pass cannot set the requested scissor");
  if (state.blendConstant && !pass.setBlendConstant) fail("WEBGPU_BLEND_CONSTANT_UNAVAILABLE", "render pass cannot set the requested blend constant");
  if (state.stencilReference !== null && !pass.setStencilReference) fail("WEBGPU_STENCIL_REFERENCE_UNAVAILABLE", "render pass cannot set the stencil reference");
  if (state.scissor) pass.setScissorRect!(state.scissor.x, state.scissor.y, state.scissor.width, state.scissor.height);
  if (state.blendConstant) pass.setBlendConstant!(state.blendConstant);
  if (state.stencilReference !== null) pass.setStencilReference!(state.stencilReference);
}

const NOT_PLAIN = Symbol("not plain");
/**
 * A deep copy of plain data (plain objects, arrays, primitives other than symbols and functions), or NOT_PLAIN when it
 * holds anything else. With `references`, the named top-level keys may hold other objects, kept by reference (the
 * device's limit and feature objects, which do not change).
 */
function plainCopy(value: unknown, references?: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    const copy = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i += 1) { const item = plainCopy(value[i]); if (item === NOT_PLAIN) return NOT_PLAIN; copy[i] = item; }
    return copy;
  }
  if (value !== null && typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) return NOT_PLAIN;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const item = (value as Record<string, unknown>)[key];
      const copied = references?.has(key) && item !== null && typeof item === "object" && Object.getPrototypeOf(item) !== Object.prototype ? item : plainCopy(item);
      if (copied === NOT_PLAIN) return NOT_PLAIN;
      copy[key] = copied;
    }
    return copy;
  }
  return typeof value === "function" || typeof value === "symbol" ? NOT_PLAIN : value;
}
const DEVICE_REFERENCES: ReadonlySet<string> = new Set(["vertexLimits", "colorLimits", "features"]);

/** True when `value` has the same plain structure as `copy` (from plainCopy); non-plain objects compare by identity. */
function samePlain(value: unknown, copy: unknown): boolean {
  if (value === copy) return typeof value !== "number" || value !== 0 || 1 / value === 1 / (copy as number);
  if (Array.isArray(value)) {
    if (!Array.isArray(copy) || value.length !== copy.length) return false;
    for (let i = 0; i < value.length; i += 1) if (!samePlain(value[i], copy[i])) return false;
    return true;
  }
  if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype
    || copy === null || typeof copy !== "object" || Array.isArray(copy)) return false;
  const keys = Object.keys(value);
  if (keys.length !== Object.keys(copy).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(copy, key) || !samePlain((value as Record<string, unknown>)[key], (copy as Record<string, unknown>)[key])) return false;
  }
  return true;
}

const MEMO_ENTRIES_PER_KEY = 16;
interface ResolvedRenderStateEntry { readonly input: unknown; readonly result: NativeRenderState }

/** A non-negative-zero number for a memo key; null when the value is not one (-0 included, which a key would merge with 0). */
function keyNumber(value: unknown): string | null {
  return typeof value === "number" && (value !== 0 || 1 / value > 0) ? String(value) : null;
}
const KEY_WORD = /^[A-Za-z0-9_-]+$/;
/** An unambiguous key for vertex layouts of plain numbers and simple words; null for anything else. */
function vertexLayoutsKey(layouts: readonly (NativeVertexBufferLayout | null)[] | undefined): string | null {
  if (layouts === undefined) return "u";
  if (!Array.isArray(layouts)) return null;
  let key = "";
  for (const layout of layouts) {
    if (layout === null) { key += "n;"; continue; }
    if (typeof layout !== "object" || Object.getPrototypeOf(layout) !== Object.prototype) return null;
    const keys = Object.keys(layout);
    if (keys.some((name) => name !== "arrayStride" && name !== "stepMode" && name !== "attributes")) return null;
    const stride = keyNumber(layout.arrayStride);
    const step = layout.stepMode;
    if (stride === null || (step !== undefined && (typeof step !== "string" || !KEY_WORD.test(step))) || !Array.isArray(layout.attributes)) return null;
    key += `${stride},${step === undefined ? "" : step}${"stepMode" in layout ? "" : "!"}[`;
    for (const attribute of layout.attributes) {
      if (attribute === null || typeof attribute !== "object" || Object.getPrototypeOf(attribute) !== Object.prototype || Object.keys(attribute).length !== 3) return null;
      const location = keyNumber(attribute.shaderLocation), offset = keyNumber(attribute.offset), format = attribute.format;
      if (location === null || offset === null || typeof format !== "string" || !KEY_WORD.test(format)) return null;
      key += `${location}:${offset}:${format},`;
    }
    key += "];";
  }
  return key;
}

/** `samePlain` for a render-state input, skipping `vertexLayouts` (compared through its key). */
function sameInputExceptLayouts(input: NativeRenderStateInput, copy: unknown): boolean {
  const record = input as unknown as Record<string, unknown>, stored = copy as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== Object.keys(stored).length) return false;
  for (const key of keys) {
    if (key === "vertexLayouts") { if (!Object.prototype.hasOwnProperty.call(stored, key)) return false; continue; }
    if (!Object.prototype.hasOwnProperty.call(stored, key) || !samePlain(record[key], stored[key])) return false;
  }
  return true;
}

/**
 * `resolveNativeRenderState` and `validateNativeVertexLayouts`, remembering their results for inputs seen before. Both
 * are pure functions of plain data (plus the device limit and feature objects, compared by identity), so an input with
 * the same structure and values returns the earlier result (or the earlier validated layouts) without redoing the
 * checks and the pipeline-key serialization. An input that fails is never remembered, so it throws again. Results are
 * shared: callers must treat them as read-only.
 */
export class NativeRenderStateMemo {
  readonly #resolved = new Map<string, ResolvedRenderStateEntry[]>();
  readonly #layouts = new Map<string, { readonly limits: unknown; readonly result: readonly (NativeVertexBufferLayout | null)[] }>();
  /**
   * The key of the layouts array most recently passed to `validateLayouts`, so the `resolve` that follows for the same
   * (unchanged) array does not rebuild it. The device builds a fresh layouts array per draw and never edits it.
   */
  #lastLayouts: unknown = null;
  #lastLayoutsKey: string | null = null;

  resolve(input: NativeRenderStateInput): NativeRenderState {
    const layoutsKey = input.vertexLayouts !== undefined && input.vertexLayouts === this.#lastLayouts ? this.#lastLayoutsKey : vertexLayoutsKey(input.vertexLayouts);
    if (layoutsKey === null || typeof input.shaderKey !== "string" || typeof input.layoutKey !== "string") return resolveNativeRenderState(input);
    const key = `${input.shaderKey}\u0000${input.layoutKey}\u0000${layoutsKey}`;
    const entries = this.#resolved.get(key);
    if (entries) {
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]!;
        if (sameInputExceptLayouts(input, entry.input)) {
          if (index > 0) { entries.splice(index, 1); entries.unshift(entry); }
          return entry.result;
        }
      }
    }
    const result = resolveNativeRenderState(input);
    const copy = plainCopy({ ...input, vertexLayouts: undefined }, DEVICE_REFERENCES);
    if (copy === NOT_PLAIN) return result;
    const list = entries ?? [];
    if (!entries) {
      if (this.#resolved.size >= 4096) this.#resolved.clear();
      this.#resolved.set(key, list);
    }
    list.unshift({ input: copy, result });
    if (list.length > MEMO_ENTRIES_PER_KEY) list.pop();
    return result;
  }

  validateLayouts(layouts: readonly (NativeVertexBufferLayout | null)[], limits?: NativeVertexLimits): readonly (NativeVertexBufferLayout | null)[] {
    const key = vertexLayoutsKey(layouts);
    this.#lastLayouts = layouts; this.#lastLayoutsKey = key;
    // A plain limits object could change in place; only the device's own (immutable) limits object is remembered.
    if (key === null || (limits !== undefined && Object.getPrototypeOf(limits) === Object.prototype)) return validateNativeVertexLayouts(layouts, limits);
    const known = this.#layouts.get(key);
    if (known && known.limits === limits) return known.result;
    const result = validateNativeVertexLayouts(layouts, limits);
    if (this.#layouts.size >= 1024) this.#layouts.clear();
    this.#layouts.set(key, { limits, result });
    return result;
  }
}
