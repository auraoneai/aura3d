import { describe, expect, it, vi } from "vitest";
import type { RenderCommandState } from "../../../packages/rendering/src/RenderDevice";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import {
  applyNativeRenderDynamicState,
  resolveNativeRenderState,
  resolveNativeVertexLayouts,
  validateNativeVertexLayouts,
  type NativeBlendComponent,
  type NativeRenderStateInput
} from "../../../packages/rendering/src/webgpu/NativeRenderState";

const state: RenderCommandState = { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" };
const base: NativeRenderStateInput = {
  state, topology: "triangles", colorFormats: ["bgra8unorm"], depthStencilFormat: "depth24plus-stencil8", sampleCount: 1,
  targetWidth: 8, targetHeight: 6, deviceGeneration: 1, targetKey: "target:main", targetGeneration: 2, shaderKey: "shader:main", layoutKey: "auto"
};
const resolve = (change: Partial<NativeRenderStateInput> = {}) => resolveNativeRenderState({ ...base, ...change });
const withState = (change: Partial<RenderCommandState>) => resolve({ state: { ...state, ...change } });

it("uses a fresh active-frame identity and never revives a lost one", () => {
  const device = new MockRenderDevice();
  expect(device.activeFrameToken).toBeNull();
  expect(() => device.beginFrame(0, 4)).toThrow();
  expect(device.activeFrameToken).toBeNull();
  device.beginFrame(4, 4);
  const first = device.activeFrameToken;
  expect(first).toBeTruthy();
  expect(() => device.beginFrame(4, 4)).toThrow();
  expect(device.activeFrameToken).toBe(first);
  device.contextLost = true;
  expect(device.activeFrameToken).toBeNull();
  device.contextLost = false;
  expect(device.activeFrameToken).toBeNull();
  device.endFrame();
  device.beginFrame(4, 4);
  expect(device.activeFrameToken).toBeTruthy();
  expect(device.activeFrameToken).not.toBe(first);
  device.endFrame();
  expect(device.activeFrameToken).toBeNull();
  device.beginFrame(4, 4);
  device.dispose();
  expect(device.activeFrameToken).toBeNull();
});

/** CPU oracle for the RGB equations emitted to the native pipeline. */
function evaluateBlend(component: NativeBlendComponent, src: readonly number[], dst: readonly number[], constant: readonly number[]): number[] {
  const factor = (name: string, channel: number): number => {
    switch (name) {
      case "zero": return 0;
      case "one": return 1;
      case "src": return src[channel]!;
      case "one-minus-src": return 1 - src[channel]!;
      case "dst": return dst[channel]!;
      case "one-minus-dst": return 1 - dst[channel]!;
      case "src-alpha": return src[3]!;
      case "one-minus-src-alpha": return 1 - src[3]!;
      case "dst-alpha": return dst[3]!;
      case "one-minus-dst-alpha": return 1 - dst[3]!;
      case "constant": return constant[channel]!;
      case "one-minus-constant": return 1 - constant[channel]!;
      case "src-alpha-saturated": return Math.min(src[3]!, 1 - dst[3]!);
      default: throw new Error(`unexpected blend factor ${name}`);
    }
  };
  return [0, 1, 2].map((i) => {
    const source = src[i]! * factor(component.srcFactor, i);
    const destination = dst[i]! * factor(component.dstFactor, i);
    switch (component.operation) {
      case "add": return source + destination;
      case "subtract": return source - destination;
      case "reverse-subtract": return destination - source;
      case "min": return Math.min(src[i]!, dst[i]!);
      case "max": return Math.max(src[i]!, dst[i]!);
      default: throw new Error(`unexpected blend operation ${component.operation}`);
    }
  });
}

describe("native WebGPU pipeline and dynamic render state", () => {
  it("resolves the default engine state and a depthless draw", () => {
    const result = resolve();
    expect(result.primitive).toEqual({ topology: "triangle-list", cullMode: "back", frontFace: "ccw" });
    expect(result.colorTargets).toEqual([{ format: "bgra8unorm", writeMask: 15 }]);
    expect(result.depthStencil).toEqual({ format: "depth24plus-stencil8", depthWriteEnabled: true, depthCompare: "less-equal" });
    expect(result.multisample).toEqual({ count: 1, mask: 0xffffffff, alphaToCoverageEnabled: false });
    expect(result.dynamic).toEqual({ scissor: null, blendConstant: null, stencilReference: null });
    expect(resolve({ colorFormats: ["rgba8unorm"], depthStencilFormat: null }).depthStencil).toBeUndefined();
    expect(withState({ depthTest: false, depthWrite: true }).depthStencil).toMatchObject({ depthWriteEnabled: false, depthCompare: "always" });
  });

  it.each(["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"] as const)("maps depth comparison %s", (compare) => {
    expect(withState({ depthCompareV2: compare }).depthStencil?.depthCompare).toBe(compare);
  });

  it.each([
    ["keep", "keep"], ["zero", "zero"], ["replace", "replace"], ["increment", "increment-clamp"],
    ["decrement", "decrement-clamp"], ["invert", "invert"], ["increment-wrap", "increment-wrap"], ["decrement-wrap", "decrement-wrap"]
  ] as const)("maps stencil operation %s on both faces", (operation, native) => {
    const result = withState({ stencil: { compare: "greater-equal", fail: operation, depthFail: operation, depthPass: operation, readMask: 0x38, writeMask: 0x73, reference: 9 } });
    expect(result.depthStencil).toMatchObject({ stencilReadMask: 0x38, stencilWriteMask: 0x73, stencilFront: { compare: "greater-equal", failOp: native, depthFailOp: native, passOp: native }, stencilBack: { compare: "greater-equal", failOp: native, depthFailOp: native, passOp: native } });
    expect(result.dynamic.stencilReference).toBe(9);
  });

  it("maps every color mask to its numeric RGBA bit pattern", () => {
    for (let bits = 0; bits < 16; bits += 1) {
      const mask = [0, 1, 2, 3].map((i) => Boolean(bits & (1 << i))) as [boolean, boolean, boolean, boolean];
      expect(withState({ colorWrite: mask }).colorTargets[0]?.writeMask).toBe(bits);
    }
  });

  it.each([
    ["alpha", "src-alpha", "one-minus-src-alpha", "one", "one-minus-src-alpha"],
    ["premultiplied", "one", "one-minus-src-alpha", "one", "one-minus-src-alpha"],
    ["additive", "src-alpha", "one", "one", "one"],
    ["multiply", "dst", "one-minus-src-alpha", "one", "one"]
  ] as const)("maps the %s blend convention", (mode, src, dst, alphaSrc, alphaDst) => {
    const result = withState({ blendMode: mode });
    expect(result.colorTargets[0]?.blend).toEqual({ color: { operation: "add", srcFactor: src, dstFactor: dst }, alpha: { operation: "add", srcFactor: alphaSrc, dstFactor: alphaDst } });
  });

  it("maps custom equations and factors, including min/max and constant semantics", () => {
    const custom = { kind: "custom", color: { equation: "reverse-subtract", src: "constant", dst: "one-minus-src-color" }, alpha: { equation: "max", src: "zero", dst: "dst-alpha" } } as const;
    const result = resolve({ state: { ...state, blendMode: custom, blendConstant: [0.1, 0.2, 0.3, 0.4] }, colorFormats: ["rgba16float"] });
    expect(result.colorTargets[0]?.blend).toEqual({ color: { operation: "reverse-subtract", srcFactor: "constant", dstFactor: "one-minus-src" }, alpha: { operation: "max", srcFactor: "one", dstFactor: "one" } });
    expect(result.dynamic.blendConstant).toEqual([0.1, 0.2, 0.3, 0.4]);
    // The emitted component evaluates to dst*(1-src)-src*constant.
    const src = [0.2, 0.4, 0.6, 0.7], dst = [0.8, 0.5, 0.25, 0.5], constant = [0.1, 0.2, 0.3, 0.4];
    const evaluated = evaluateBlend(result.colorTargets[0]!.blend!.color, src, dst, constant);
    for (const [i, expected] of [0.62, 0.22, -0.08].entries()) expect(evaluated[i]).toBeCloseTo(expected, 12);
    const maxOnly = withState({ blendMode: { kind: "custom", color: { equation: "min", src: "constant", dst: "zero" }, alpha: { equation: "max", src: "constant", dst: "one" } } });
    expect(maxOnly.dynamic.blendConstant).toBeNull();
    expect(maxOnly.colorTargets[0]?.blend?.color).toEqual({ operation: "min", srcFactor: "one", dstFactor: "one" });
  });

  it.each(["src-color", "one-minus-src-color", "dst-color", "one-minus-dst-color", "src-alpha", "one-minus-src-alpha", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "zero", "one", "constant", "one-minus-constant"] as const)("maps custom source factor %s", (factor) => {
    const result = withState({ blendMode: { kind: "custom", color: { equation: "subtract", src: factor, dst: "one" }, alpha: { equation: "add", src: "one", dst: "zero" } } });
    const expected = ({ "src-color": "src", "one-minus-src-color": "one-minus-src", "dst-color": "dst", "one-minus-dst-color": "one-minus-dst" } as Record<string, string>)[factor] ?? factor;
    expect(result.colorTargets[0]?.blend?.color).toEqual({ operation: "subtract", srcFactor: expected, dstFactor: "one" });
  });

  it("maps culling, winding, topology, sample mask, bias, multiple attachments and depth-only targets", () => {
    const result = resolve({ state: { ...state, cullMode: "front", frontFace: "cw", sampleMask: 5, alphaToCoverage: true, polygonOffset: { factor: 1.5, units: -2, clamp: 0.25 } }, sampleCount: 4, colorFormats: ["rgba8unorm", null, "rgba16float"] });
    expect(result.primitive).toEqual({ topology: "triangle-list", cullMode: "front", frontFace: "cw" });
    expect(result.multisample).toEqual({ count: 4, mask: 5, alphaToCoverageEnabled: true });
    expect(result.depthStencil).toMatchObject({ depthBias: -2, depthBiasSlopeScale: 1.5, depthBiasClamp: 0.25 });
    expect(result.colorTargets).toEqual([{ format: "rgba8unorm", writeMask: 15 }, null, { format: "rgba16float", writeMask: 15 }]);
    expect(resolve({ topology: "lines" }).primitive.topology).toBe("line-list");
    expect(resolve({ topology: "points" }).primitive.topology).toBe("point-list");
    expect(resolve({ colorFormats: [] }).colorTargets).toEqual([]);
  });

  it("converts bottom-left scissor coordinates to a clipped top-left rectangle", () => {
    const examples: [NonNullable<RenderCommandState["scissor"]>, [number, number, number, number]][] = [
      [{ x: -2, y: 1, width: 6, height: 4 }, [0, 1, 4, 4]],
      [{ x: 6, y: -2, width: 8, height: 5 }, [6, 3, 2, 3]],
      [{ x: 10, y: 10, width: 2, height: 2 }, [8, 0, 0, 0]],
      [{ x: -10, y: -10, width: 2, height: 2 }, [0, 6, 0, 0]]
    ];
    for (const [scissor, expected] of examples) {
      const rect = withState({ scissor }).dynamic.scissor!;
      expect([rect.x, rect.y, rect.width, rect.height]).toEqual(expected);
    }
  });

  it("applies validated dynamic state to a mock pass, changing dynamic values without rebuilding the pipeline", () => {
    const first = withState({ blendMode: { kind: "custom", color: { equation: "add", src: "constant", dst: "one-minus-constant" }, alpha: { equation: "add", src: "one", dst: "zero" } }, scissor: { x: -2, y: 1, width: 6, height: 4 }, blendConstant: [0.1, 0.2, 0.3, 0.4], stencil: { reference: 7 } });
    const second = resolve({ state: { ...state, blendMode: { kind: "custom", color: { equation: "add", src: "constant", dst: "one-minus-constant" }, alpha: { equation: "add", src: "one", dst: "zero" } }, scissor: { x: 0, y: 0, width: 2, height: 2 }, blendConstant: [0.9, 0.8, 0.7, 0.6], stencil: { reference: 8 } } });
    expect(first.pipelineKey).toBe(second.pipelineKey);
    const pass = { setScissorRect: vi.fn(), setBlendConstant: vi.fn(), setStencilReference: vi.fn() };
    applyNativeRenderDynamicState(pass, first.dynamic); applyNativeRenderDynamicState(pass, second.dynamic);
    expect(pass.setScissorRect.mock.calls).toEqual([[0, 1, 4, 4], [0, 4, 2, 2]]);
    expect(pass.setBlendConstant.mock.calls).toEqual([[[0.1, 0.2, 0.3, 0.4]], [[0.9, 0.8, 0.7, 0.6]]]);
    expect(pass.setStencilReference.mock.calls).toEqual([[7], [8]]);
    const partial = { setScissorRect: vi.fn() };
    expect(() => applyNativeRenderDynamicState(partial, first.dynamic)).toThrow("WEBGPU_BLEND_CONSTANT_UNAVAILABLE");
    expect(partial.setScissorRect).not.toHaveBeenCalled();
  });

  it("keys all fixed pipeline fields and resource generations without delimiter collisions", () => {
    const reference = resolve().pipelineKey;
    const changes: Partial<NativeRenderStateInput>[] = [
      { state: { ...state, depthTest: false } }, { state: { ...state, depthWrite: false } }, { state: { ...state, depthCompareV2: "greater" } },
      { state: { ...state, cullMode: "front" } }, { state: { ...state, frontFace: "cw" } }, { state: { ...state, blend: true } },
      { state: { ...state, colorWrite: [true, false, true, true] } }, { state: { ...state, sampleMask: 7 } },
      { state: { ...state, polygonOffset: { factor: 1, units: 1 } } }, { state: { ...state, stencil: { reference: 4 } } },
      { topology: "lines" }, { colorFormats: ["rgba8unorm"] }, { colorFormats: ["bgra8unorm", "rgba8unorm"] },
      { depthStencilFormat: "depth32float" }, { depthStencilFormat: null }, { sampleCount: 4 },
      { deviceGeneration: 2 }, { targetKey: "target:other" }, { targetGeneration: 3 }, { shaderKey: "shader:alternate" }, { layoutKey: "explicit" },
      { vertexLayouts: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] }] }
    ];
    for (const change of changes) expect(resolve(change).pipelineKey).not.toBe(reference);
    expect(resolve({ shaderKey: "a:b", layoutKey: "c" }).pipelineKey).not.toBe(resolve({ shaderKey: "a", layoutKey: "b:c" }).pipelineKey);
    expect(resolve({ targetWidth: 100, targetHeight: 25 }).pipelineKey).toBe(reference);
    expect(resolve({ state: { ...state, blendMode: "opaque", frontFace: "ccw", colorWrite: [true, true, true, true], sampleMask: 0xffffffff } }).pipelineKey).toBe(reference);
  });

  it("distinguishes each independent stencil, blend and multisample field in the cache", () => {
    const initial: RenderCommandState = {
      ...state,
      blendMode: { kind: "custom", color: { equation: "add", src: "src-alpha", dst: "one" }, alpha: { equation: "add", src: "one", dst: "one" } },
      stencil: { compare: "always", readMask: 3, writeMask: 5, fail: "keep", depthFail: "keep", depthPass: "keep" }
    };
    const key = resolve({ state: initial, sampleCount: 4 }).pipelineKey;
    const stencil = initial.stencil!;
    const changes: Partial<RenderCommandState>[] = [
      { stencil: { ...stencil, compare: "never" } }, { stencil: { ...stencil, readMask: 7 } }, { stencil: { ...stencil, writeMask: 9 } },
      { stencil: { ...stencil, fail: "zero" } }, { stencil: { ...stencil, depthFail: "zero" } }, { stencil: { ...stencil, depthPass: "zero" } },
      { blendMode: "premultiplied" }, { sampleMask: 3 }, { alphaToCoverage: true }, { polygonOffset: { units: 0, factor: 1 } }
    ];
    for (const change of changes) expect(resolve({ state: { ...initial, ...change }, sampleCount: 4 }).pipelineKey).not.toBe(key);
    expect(resolve({ state: { ...initial, stencil: { ...stencil, reference: 99 } }, sampleCount: 4 }).pipelineKey).toBe(key);
  });

  it("validates ordered attachment count and byte budgets using the actual device limits", () => {
    expect(() => resolve({ colorFormats: ["rgba8unorm", null, "rgba16float"], colorLimits: { maxColorAttachments: 2 } })).toThrow(/COLOR_ATTACHMENT_LIMIT/);
    expect(() => resolve({ colorFormats: ["rgba32float", "rgba16float", "rgba16float", "rgba8unorm"] })).toThrow(/COLOR_ATTACHMENT_BYTES_LIMIT/);
    expect(resolve({ colorFormats: ["rgba32float", "rgba16float", "rgba16float", "rgba8unorm"], colorLimits: { maxColorAttachmentBytesPerSample: 40 } }).colorTargets).toHaveLength(4);
    expect(resolve({ colorFormats: Array(4).fill("rgba8unorm") }).colorTargets).toHaveLength(4);
    expect(() => resolve({ colorFormats: Array(5).fill("rgba8unorm") })).toThrow(/COLOR_ATTACHMENT_BYTES_LIMIT/);
  });

  it("fails unsupported combinations before any pass can be touched", () => {
    const constant = { kind: "custom", color: { equation: "add", src: "src-alpha-saturated", dst: "src-alpha-saturated" }, alpha: { equation: "add", src: "one", dst: "zero" } } as const;
    const invalid: [Partial<NativeRenderStateInput>, RegExp][] = [
      [{ sampleCount: 2 }, /WEBGPU_SAMPLE_COUNT_UNSUPPORTED/], [{ state: { ...state, alphaToCoverage: true } }, /MULTISAMPLING/],
      [{ state: { ...state, stencil: {} }, depthStencilFormat: "depth32float" }, /STENCIL_ATTACHMENT_REQUIRED/],
      [{ state: { ...state, stencil: {} }, depthStencilFormat: null }, /STENCIL_ATTACHMENT_REQUIRED/],
      [{ depthStencilFormat: "stencil8" }, /DEPTH_ATTACHMENT_REQUIRED/],
      [{ state: { ...state, polygonOffset: { units: 1.5, factor: 1 } } }, /DEPTH_BIAS_UNSUPPORTED/],
      [{ state: { ...state, polygonOffset: { units: 1, factor: 1e100 } } }, /DEPTH_BIAS_UNSUPPORTED/],
      [{ state: { ...state, polygonOffset: { units: 1, factor: 1 } }, topology: "lines" }, /DEPTH_BIAS_UNSUPPORTED/],
      [{ state: { ...state, polygonOffset: { units: 1, factor: 1 } }, depthStencilFormat: null }, /DEPTH_ATTACHMENT_REQUIRED/],
      [{ state: { ...state, polygonOffset: { units: 1, factor: 1, clamp: 0.5 } }, compatibilityMode: true }, /DEPTH_BIAS_UNSUPPORTED/],
      [{ colorFormats: ["rgba32float"], state: { ...state, blend: true } }, /FLOAT_BLEND_UNSUPPORTED/],
      [{ colorFormats: ["rgba32float"], sampleCount: 4 }, /MULTISAMPLE_FORMAT_UNSUPPORTED/],
      [{ colorFormats: ["rgba16float"], sampleCount: 4, compatibilityMode: true }, /MULTISAMPLE_FORMAT_UNSUPPORTED/],
      [{ colorFormats: ["bgra8unorm-srgb"], compatibilityMode: true }, /COLOR_FORMAT_UNSUPPORTED/],
      [{ colorFormats: [], depthStencilFormat: null }, /ATTACHMENT_REQUIRED/],
      [{ colorFormats: [null, "rgba8unorm"], sampleCount: 4, state: { ...state, alphaToCoverage: true } }, /ALPHA_TO_COVERAGE_ATTACHMENT_REQUIRED/],
      [{ colorFormats: ["not-a-format"] }, /COLOR_FORMAT_UNSUPPORTED/], [{ depthStencilFormat: "invalid" }, /DEPTH_FORMAT_UNSUPPORTED/],
      [{ depthStencilFormat: "depth32float-stencil8" }, /DEPTH_FORMAT_UNSUPPORTED/],
      [{ state: { ...state, blendMode: constant } }, /src-alpha-saturated/],
      [{ targetWidth: 0 }, /TARGET_INVALID/], [{ targetGeneration: -1 }, /STATE_INVALID/], [{ shaderKey: "" }, /IDENTITY_INVALID/],
      [{ state: { ...state, scissor: { x: Number.MAX_SAFE_INTEGER, y: 0, width: 1, height: 1 } } }, /SCISSOR_INVALID/]
    ];
    for (const [change, message] of invalid) expect(() => resolve(change)).toThrow(message);
    expect(resolve({ colorFormats: ["rgba32float"], state: { ...state, blend: true }, features: new Set(["float32-blendable"]) }).colorTargets[0]?.blend).toBeDefined();
    expect(resolve({ depthStencilFormat: "depth32float-stencil8", features: new Set(["depth32float-stencil8"]) }).depthStencil?.format).toBe("depth32float-stencil8");
  });
});

describe("native WebGPU vertex layouts", () => {
  it("maps typed integer, normalized, interleaved and separate instance streams", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "custom:color", components: 4, offset: 12, type: "uint8", normalized: true, shaderLocation: 1 },
      { semantic: "custom:joints", components: 2, offset: 0, type: "uint16", integer: true, bufferSlot: 2, shaderLocation: 2 },
      { semantic: "custom:weights", components: 2, offset: 4, type: "int16", normalized: true, bufferSlot: 2, shaderLocation: 3 },
      { semantic: "custom:instance", components: 4, offset: 0, bufferSlot: 3, shaderLocation: 4 }
    ], 16, [{ slot: 2, stride: 8 }, { slot: 3, stride: 16, stepMode: "instance" }]);
    const layouts = resolveNativeVertexLayouts(format);
    expect(layouts).toEqual([
      { arrayStride: 16, stepMode: "vertex", attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }, { shaderLocation: 1, offset: 12, format: "unorm8x4" }] },
      null,
      { arrayStride: 8, stepMode: "vertex", attributes: [{ shaderLocation: 2, offset: 0, format: "uint16x2" }, { shaderLocation: 3, offset: 4, format: "snorm16x2" }] },
      { arrayStride: 16, stepMode: "instance", attributes: [{ shaderLocation: 4, offset: 0, format: "float32x4" }] }
    ]);
    const first = resolve({ vertexLayouts: layouts }).pipelineKey;
    expect(resolve({ vertexLayouts: [...layouts.slice(0, 3), { ...layouts[3]!, stepMode: "vertex" }] }).pipelineKey).not.toBe(first);
  });

  it.each([
    ["uint8", false, true, 1, "uint8"], ["int8", false, true, 1, "sint8"],
    ["uint8", true, false, 1, "unorm8"], ["int8", true, false, 1, "snorm8"],
    ["uint16", false, true, 1, "uint16"], ["int16", false, true, 1, "sint16"],
    ["uint16", true, false, 1, "unorm16"], ["int16", true, false, 1, "snorm16"],
    ["int8", true, false, 2, "snorm8x2"], ["uint8", false, true, 4, "uint8x4"],
    ["int16", false, true, 2, "sint16x2"], ["uint16", true, false, 4, "unorm16x4"],
    ["int32", false, true, 1, "sint32"], ["uint32", false, true, 3, "uint32x3"]
  ] as const)("maps %s storage with normalized=%s integer=%s", (type, normalized, integer, components, expected) => {
    const byteWidth = type.endsWith("8") ? 1 : type.endsWith("16") ? 2 : 4;
    const stride = Math.ceil(byteWidth * components / 4) * 4;
    const format = new VertexFormat([{ semantic: "position", components, offset: 0, type, normalized, integer }], stride);
    expect(resolveNativeVertexLayouts(format)[0]?.attributes[0]?.format).toBe(expected);
  });

  it("keeps scalar packed formats within their streams and distinguishes shader input types", () => {
    const format = new VertexFormat([
      { semantic: "custom:alpha", shaderLocation: 1, components: 1, offset: 3, type: "uint8", normalized: true },
      { semantic: "custom:id", shaderLocation: 2, components: 1, offset: 2, type: "int16", integer: true, bufferSlot: 1 }
    ], 4, [{ slot: 1, stride: 4, stepMode: "instance" }]);
    expect(resolveNativeVertexLayouts(format)).toEqual([
      { arrayStride: 4, stepMode: "vertex", attributes: [{ shaderLocation: 1, offset: 3, format: "unorm8" }] },
      { arrayStride: 4, stepMode: "instance", attributes: [{ shaderLocation: 2, offset: 2, format: "sint16" }] }
    ]);

    const normalized = new VertexFormat([{ semantic: "position", components: 1, offset: 0, type: "uint8", normalized: true }], 4);
    const integer = new VertexFormat([{ semantic: "position", components: 1, offset: 0, type: "uint8", integer: true }], 4);
    expect(resolve({ vertexLayouts: resolveNativeVertexLayouts(normalized) }).pipelineKey)
      .not.toBe(resolve({ vertexLayouts: resolveNativeVertexLayouts(integer) }).pipelineKey);

    expect(() => validateNativeVertexLayouts([{ arrayStride: 2, attributes: [{ shaderLocation: 0, offset: 0, format: "uint16" }] }])).toThrow(/STRIDE_INVALID/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 1, format: "uint16" }] }])).toThrow(/OFFSET_INVALID/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 4, format: "uint8" }] }])).toThrow(/OFFSET_INVALID/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 4, format: "uint16" }] }])).toThrow(/OFFSET_INVALID/);
  });

  it("interprets the emitted normalized and integer layouts against real interleaved bytes", () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "custom:color", components: 4, offset: 12, type: "uint8", normalized: true, shaderLocation: 1 },
      { semantic: "custom:joints", components: 2, offset: 0, type: "uint16", integer: true, bufferSlot: 1, shaderLocation: 2 },
      { semantic: "custom:weights", components: 2, offset: 4, type: "int16", normalized: true, bufferSlot: 1, shaderLocation: 3 }
    ], 16, [{ slot: 1, stride: 8 }]);
    const layouts = resolveNativeVertexLayouts(format);
    const packedVertices = new DataView(new ArrayBuffer(32));
    const packedSkin = new DataView(new ArrayBuffer(16));
    for (const [i, value] of [12.5, -2, 4].entries()) packedVertices.setFloat32(16 + i * 4, value, true);
    for (const [i, value] of [0, 128, 255, 64].entries()) packedVertices.setUint8(16 + 12 + i, value);
    packedSkin.setUint16(8, 65535, true); packedSkin.setUint16(10, 1024, true);
    packedSkin.setInt16(12, -32768, true); packedSkin.setInt16(14, 16384, true);
    const fetch = (location: number): number[] => {
      const slot = layouts.findIndex((layout) => layout?.attributes.some((attribute) => attribute.shaderLocation === location));
      const layout = layouts[slot]!;
      const attribute = layout.attributes.find((candidate) => candidate.shaderLocation === location)!;
      const bytes = slot === 0 ? packedVertices : packedSkin;
      const start = layout.arrayStride + attribute.offset; // vertex index 1
      switch (attribute.format) {
        case "float32x3": return [0, 1, 2].map((i) => bytes.getFloat32(start + i * 4, true));
        case "unorm8x4": return [0, 1, 2, 3].map((i) => bytes.getUint8(start + i) / 255);
        case "uint16x2": return [0, 1].map((i) => bytes.getUint16(start + i * 2, true));
        case "snorm16x2": return [0, 1].map((i) => Math.max(-1, bytes.getInt16(start + i * 2, true) / 32767));
        default: throw new Error(`unexpected format ${attribute.format}`);
      }
    };
    expect(fetch(0)).toEqual([12.5, -2, 4]);
    expect(fetch(1)).toEqual([0, 128 / 255, 1, 64 / 255]);
    expect(fetch(2)).toEqual([65535, 1024]);
    expect(fetch(3)).toEqual([-1, 16384 / 32767]);
  });

  it("normalizes equivalent layouts and rejects invalid stride, offsets, formats, locations, and device limits", () => {
    const attributes = [{ shaderLocation: 1, offset: 4, format: "float32" }, { shaderLocation: 0, offset: 0, format: "float32" }];
    const unordered = [{ arrayStride: 8, attributes }, null];
    const ordered = [{ arrayStride: 8, stepMode: "vertex" as const, attributes: [...attributes].reverse() }];
    expect(resolve({ vertexLayouts: unordered }).pipelineKey).toBe(resolve({ vertexLayouts: ordered }).pipelineKey);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 6, attributes: [] }])).toThrow(/STRIDE_INVALID/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 2, format: "float32" }] }])).toThrow(/OFFSET_INVALID/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 0, offset: 0, format: "unorm8x3" }] }])).toThrow(/FORMAT_UNSUPPORTED/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: "float32" }, { shaderLocation: 0, offset: 4, format: "float32" }] }])).toThrow(/LOCATION_CONFLICT/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 4, attributes: [{ shaderLocation: 16, offset: 0, format: "float32" }] }])).toThrow(/ATTRIBUTE_LIMIT/);
    expect(() => validateNativeVertexLayouts([null, null, { arrayStride: 4, attributes: [] }], { maxVertexBuffers: 2 })).toThrow(/BUFFER_LIMIT/);
    expect(() => validateNativeVertexLayouts([{ arrayStride: 12, attributes: [] }], { maxVertexBufferArrayStride: 8 })).toThrow(/STRIDE_INVALID/);
    expect(validateNativeVertexLayouts([{ arrayStride: 0, attributes: [{ shaderLocation: 0, offset: 0, format: "float32" }] }])[0]?.arrayStride).toBe(0);
  });

  it("rejects unrepresentable integer-to-float formats, odd packed widths, and instance divisors", () => {
    const make = (type: "uint8" | "int32", components: 1 | 2, integer = false) => new VertexFormat([{ semantic: "position", components, offset: 0, type, integer }], type === "uint8" ? 4 : 8);
    expect(() => resolveNativeVertexLayouts(make("uint8", 1))).toThrow(/FORMAT_UNSUPPORTED/);
    expect(() => resolveNativeVertexLayouts(make("uint8", 2))).toThrow(/FORMAT_UNSUPPORTED/);
    expect(() => resolveNativeVertexLayouts(make("int32", 1))).toThrow(/FORMAT_UNSUPPORTED/);
    const three8 = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "uint8", integer: true }], 4);
    const three16 = new VertexFormat([{ semantic: "position", components: 3, offset: 0, type: "int16", normalized: true }], 8);
    expect(() => resolveNativeVertexLayouts(three8)).toThrow(/FORMAT_UNSUPPORTED/);
    expect(() => resolveNativeVertexLayouts(three16)).toThrow(/FORMAT_UNSUPPORTED/);
    const instanced = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }, { semantic: "custom:instance", components: 4, offset: 0, bufferSlot: 1, shaderLocation: 1 }], 12, [{ slot: 1, stride: 16, stepMode: "instance", divisor: 2 }]);
    expect(() => resolveNativeVertexLayouts(instanced)).toThrow(/DIVISOR_UNSUPPORTED/);
  });
});
