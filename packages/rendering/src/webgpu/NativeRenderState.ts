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
