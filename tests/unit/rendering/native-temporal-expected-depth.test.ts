import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import type { PostPassDescriptor, PostPipelineOptions } from "../../../packages/rendering/src/contracts/post";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { consumeTaaHistoryWritten } from "../../../packages/rendering/src/renderer/postSkipped";
import { TemporalHistory, assertExpectedPreviousDepthBindingsCurrent, type TemporalFrameOptions, type TemporalGpuBindings } from "../../../packages/rendering/src/TemporalHistory";
import { temporalDepthAccepted } from "../../../packages/rendering/src/TemporalMath";
import { disposeNativePostEffects, runV2HdrStages, type PostFrameContextBag } from "../../../packages/rendering/src/post/v2Stages";
import { VELOCITY_DILATE_GLSL } from "../../../packages/rendering/src/post/shaders/velocityDilate.glsl";
import type { Texture } from "../../../packages/rendering/src/Texture";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const pipeline: PostPipelineOptions = { antiAliasing: "taa", depthRange: { near: 0.1, far: 100, projection: "perspective" }, exposure: 1, toneMapping: "aces", dither: false };
const camera = { near: 0.1, far: 100, projection: "perspective", viewProjectionMatrix: identity(), previousViewProjectionMatrix: null,
  viewMatrix: identity(), projectionMatrix: identity(), position: [0, 0, 0] } as const;
const TEXTURE0 = 33984;

type GlTarget = RenderTarget & { colorHandle: WebGLTexture; framebuffer: WebGLFramebuffer; depthTextureHandle: WebGLTexture | null };
interface Draw { source: string; target?: GlTarget; textures: Map<number, unknown>; uniforms: Map<string, readonly number[]> }
interface Fixture {
  device: MockRenderDevice; owner: TemporalHistory; host: WebGL2DeviceHost; draws: Draw[]; source: GlTarget; velocity: GlTarget;
  reactive: GlTarget; frame: PostFrameContextBag; targets: GlTarget[]; uniformsHook?: (name: string, value: number) => void;
}
const fixtures: Fixture[] = [];

function fixture(): Fixture {
  const device = new MockRenderDevice(), owner = new TemporalHistory(), draws: Draw[] = [], targets: GlTarget[] = [];
  Object.defineProperty(device, "generation", { value: 1, writable: true });
  setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), device);
  const registry = new Map<Texture, WebGLTexture>(), byFramebuffer = new Map<unknown, GlTarget>();
  const create = device.createRenderTarget.bind(device);
  device.createRenderTarget = descriptor => {
    const target = Object.assign(create(descriptor), { framebuffer: {} as WebGLFramebuffer, colorHandle: {} as WebGLTexture,
      depthTextureHandle: descriptor.depth === "texture" ? {} as WebGLTexture : null }) as GlTarget;
    registry.set(target.colorTexture, target.colorHandle); byFramebuffer.set(target.framebuffer, target); targets.push(target);
    return target;
  };
  let unit = 0, framebuffer: unknown;
  let current: { shaders: { source?: string }[] } | undefined;
  const textures = new Map<number, unknown>();
  let uniforms = new Map<string, readonly number[]>();
  let currentFixture: Fixture;
  const functions: Record<string, (...args: any[]) => unknown> = {
    createVertexArray: () => ({}), createTexture: () => ({}), createShader: () => ({}), createProgram: () => ({ shaders: [] }),
    shaderSource: (shader, source) => { shader.source = source; }, attachShader: (program, shader) => { program.shaders.push(shader); },
    useProgram: program => { current = program; uniforms = new Map(); }, getShaderParameter: () => true, getProgramParameter: () => true,
    activeTexture: texture => { unit = texture - TEXTURE0; }, bindTexture: (_kind, handle) => { textures.set(unit, handle); },
    bindFramebuffer: (_kind, handle) => { framebuffer = handle; }, getUniformLocation: (_program, name) => name,
    uniform1i: (name, value) => { uniforms.set(name, [value]); currentFixture?.uniformsHook?.(name, value); },
    uniform1f: (name, value) => { uniforms.set(name, [value]); },
    drawArrays: () => { draws.push({ source: current?.shaders.map(shader => shader.source ?? "").join("\n") ?? "",
      target: byFramebuffer.get(framebuffer), textures: new Map(textures), uniforms: new Map(uniforms) }); }
  };
  const gl = new Proxy(functions as Record<string | symbol, unknown>, { get(target, property) {
    if (property in target) return target[property];
    if (property === "TEXTURE0") return TEXTURE0;
    if (typeof property === "string" && /^[A-Z][A-Z0-9_]*$/.test(property)) return property.length * 7 + 3;
    return (..._args: unknown[]) => undefined;
  } }) as unknown as WebGL2RenderingContext;
  const host = { gl, device, textureRegistry: { textures: registry }, stateCache: { invalidate() {} },
    resolveMultisampleTarget() {}, lifecycle: { bindOutput() {} }, activeRenderTarget: null } as unknown as WebGL2DeviceHost;
  const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: "texture" }) as GlTarget;
  const velocity = device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false }) as GlTarget;
  const reactive = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false }) as GlTarget;
  device.beginFrame(8, 8);
  const frame: PostFrameContextBag = { source: {}, items: [], scopeId: {}, viewId: "view", frameId: 1, deviceGeneration: 1,
    sceneDepth: { texture: null, available: false, linearize: { near: 0.1, far: 100, orthographic: false } } };
  currentFixture = { device, owner, host, draws, source, velocity, reactive, frame, targets };
  fixtures.push(currentFixture);
  return currentFixture;
}
function opts(f: Fixture, frameId = 1): TemporalFrameOptions {
  return { viewId: "view", frameId, depthNear: 0.1, velocity: f.velocity, reactive: f.reactive, expectedPreviousDepth: "velocity-alpha" };
}
function prepare(f: Fixture, options: TemporalFrameOptions = opts(f)): TemporalGpuBindings {
  return f.owner.prepare(f.device, 8, 8, [], identity(), options);
}
function advance(f: Fixture): void { f.device.endFrame(); f.device.beginFrame(8, 8); }
function run(f: Fixture, bindings: TemporalGpuBindings, overrides: Partial<PostPipelineOptions> = {}) {
  return runV2HdrStages(f.host, f.source, { ...pipeline, ...overrides }, camera, bindings, f.frame, { retainOutputLease: true });
}
afterEach(() => {
  while (fixtures.length) {
    const f = fixtures.pop()!;
    disposeNativePostEffects(f.host); f.owner.dispose(); f.device.dispose();
  }
});

describe("opt-in expected previous depth", () => {
  it("requires the exact successful device-frame completion for a delayed commit", () => {
    const unproven = fixture(), old = prepare(unproven);
    unproven.device.endFrame();
    expect(() => assertExpectedPreviousDepthBindingsCurrent(old, unproven.device, 8, 8)).toThrow(/stale/i);
    expect(() => unproven.owner.commit("view", 1)).toThrow(/proof/i);

    const f = fixture(), first = prepare(f);
    f.owner.endDeviceFrame(f.device, "view", 1, true);
    // A commit receipt never authorizes a draw after the device frame ended.
    expect(() => assertExpectedPreviousDepthBindingsCurrent(first, f.device, 8, 8)).toThrow(/stale/i);
    expect(() => f.owner.commit("view", 1)).not.toThrow();
    f.device.beginFrame(8, 8);
    const next = prepare(f, opts(f, 2));
    expect(next.historyValid).toBe(true);
    expect(next.history).toBe(first.historyOutput);
    expect(next.v2!.linZ).toBe(first.v2!.linZOutput);
    expect(f.velocity.disposed).toBe(false);
    expect(f.reactive.disposed).toBe(false);
  });

  it("does not seal an endFrame that throws, even if it already closed the token", () => {
    const f = fixture();
    prepare(f);
    const end = f.device.endFrame.bind(f.device);
    const failedEnd = vi.spyOn(f.device, "endFrame").mockImplementationOnce(() => { end(); throw new Error("end failed"); });
    expect(() => f.owner.endDeviceFrame(f.device, "view", 1, true)).toThrow("end failed");
    failedEnd.mockRestore();
    expect(() => f.owner.commit("view", 1)).toThrow(/proof/i);
    f.device.beginFrame(8, 8);
    expect(prepare(f, opts(f, 2)).historyValid).toBe(false);
    expect(f.velocity.disposed).toBe(false);
  });

  it("does not end a replacement device frame or accept its token as the old frame", () => {
    const f = fixture(), bindings = prepare(f);
    f.device.endFrame(); f.device.beginFrame(8, 8);
    const foreignToken = f.device.activeFrameToken;
    expect(() => f.owner.endDeviceFrame(f.device, "view", 1, true)).toThrow(/stale/i);
    expect(f.device.activeFrameToken).toBe(foreignToken);
    expect(() => assertExpectedPreviousDepthBindingsCurrent(bindings, f.device, 8, 8)).toThrow(/stale/i);
    expect(() => f.owner.commit("view", 1)).toThrow(/proof/i);
  });

  it("revokes a completed pass when a later pass fails or changes its borrowed input", () => {
    const f = fixture();
    prepare(f);
    f.owner.endDeviceFrame(f.device, "view", 1, true);
    f.device.beginFrame(8, 8);
    prepare(f);
    f.owner.endDeviceFrame(f.device, "view", 1, false);
    expect(() => f.owner.commit("view", 1)).toThrow(/proof/i);
    f.owner.reset("explicit-reset", "view");
    f.device.beginFrame(8, 8);
    prepare(f, opts(f, 2));
    f.velocity.colorHandle = {} as WebGLTexture;
    expect(() => f.owner.endDeviceFrame(f.device, "view", 2, true)).toThrow(/stale/i);
    expect(f.device.activeFrameToken).toBeNull();
    expect(() => f.owner.commit("view", 2)).toThrow(/proof/i);
    expect(f.velocity.disposed).toBe(false);
  });

  it("rejects a reset that reenters the device's endFrame", () => {
    const f = fixture();
    prepare(f);
    const end = f.device.endFrame.bind(f.device);
    vi.spyOn(f.device, "endFrame").mockImplementationOnce(() => { f.owner.reset("explicit-reset", "view"); end(); });
    expect(() => f.owner.endDeviceFrame(f.device, "view", 1, true)).toThrow(/stale/i);
    f.owner.commit("view", 1);
    f.device.beginFrame(8, 8);
    expect(prepare(f, opts(f, 2)).historyValid).toBe(false);
  });

  it("rebinds repeated authored passes to their own device tokens and swaps once", () => {
    const f = fixture(), first = prepare(f);
    f.owner.endDeviceFrame(f.device, "view", 1, true);
    f.device.beginFrame(8, 8);
    const second = prepare(f);
    expect(second).not.toBe(first);
    expect(second.history).toBe(first.history);
    expect(second.historyOutput).toBe(first.historyOutput);
    expect(() => assertExpectedPreviousDepthBindingsCurrent(first, f.device, 8, 8)).toThrow(/stale/i);
    expect(assertExpectedPreviousDepthBindingsCurrent(second, f.device, 8, 8, { viewId: "view", frameId: 1 })).toBe(true);
    f.owner.endDeviceFrame(f.device, "view", 1, true);
    f.owner.commit("view", 1); f.owner.commit("view", 1);
    f.device.beginFrame(8, 8);
    const next = prepare(f, opts(f, 2));
    expect(next.historyValid).toBe(true);
    expect(next.history).toBe(first.historyOutput);
    expect(next.v2!.linZ).toBe(first.v2!.linZOutput);
  });

  it("keeps completed proofs independent by view and revokes them on cancellation", () => {
    const f = fixture();
    const leftOptions = { ...opts(f), viewId: "left" }, rightOptions = { ...opts(f), viewId: "right" };
    const left = prepare(f, leftOptions);
    f.owner.endDeviceFrame(f.device, "left", 1, true);
    f.device.beginFrame(8, 8);
    const right = prepare(f, rightOptions);
    f.owner.endDeviceFrame(f.device, "right", 1, true);
    f.owner.reset("explicit-reset", "left");
    f.owner.commit("left", 1);
    f.owner.commit("right", 1);
    f.device.beginFrame(8, 8);
    expect(prepare(f, { ...leftOptions, frameId: 2 }).historyValid).toBe(false);
    const nextRight = prepare(f, { ...rightOptions, frameId: 2 });
    expect(nextRight.historyValid).toBe(true);
    expect(nextRight.history).toBe(right.historyOutput);
    expect(left.historyOutput.disposed).toBe(false);
    expect(f.velocity.disposed).toBe(false);
  });

  it.each(["input handle", "reactive", "owned output", "flags", "generation", "loss"] as const)(
    "rejects %s changes between device completion and promotion", kind => {
      const f = fixture();
      let loss: (() => void) | undefined;
      let unsubscribed = false;
      Object.defineProperty(f.device, "onDeviceLost", { configurable: true, value: (listener: () => void) => {
        loss = listener; return () => { unsubscribed = true; };
      } });
      const bindings = prepare(f);
      f.owner.endDeviceFrame(f.device, "view", 1, true);
      if (kind === "input handle") f.velocity.colorHandle = {} as WebGLTexture;
      if (kind === "reactive") f.reactive.colorTexture.colorSpace = "srgb";
      if (kind === "owned output") bindings.historyOutput.colorTexture.dispose();
      if (kind === "flags") setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), f.device);
      if (kind === "generation") (f.device as unknown as { generation: number }).generation++;
      if (kind === "loss") loss!();
      expect(() => f.owner.commit("view", 1)).toThrow(/stale|generation/i);
      f.owner.reset("explicit-reset", "view");
      expect(unsubscribed).toBe(true);
      expect(f.velocity.disposed).toBe(false);
      expect(f.reactive.disposed).toBe(false);
    }
  );

  it("retains valid color and depth history and does not reinterpret legacy velocity alpha", () => {
    const f = fixture();
    const seedOptions = { viewId: "view", frameId: 1, depthNear: 0.1, velocity: f.velocity, reactive: f.reactive };
    const seed = prepare(f, seedOptions);
    expect(seed.v2?.expectedPreviousDepth).toBeUndefined();
    expect(seed.v2?.unsupportedMotion).toContain("previous-depth-approximation");
    expect(assertExpectedPreviousDepthBindingsCurrent(seed, f.device, 8, 8)).toBe(false);
    f.owner.commit("view", 1); advance(f);
    const nextOptions = opts(f, 2), next = prepare(f, nextOptions);
    expect(next.historyValid).toBe(true);
    expect(next.history).toBe(seed.historyOutput);
    expect(next.v2?.linZ).toBe(seed.v2?.linZOutput);
    expect(next.v2).toMatchObject({ expectedPreviousDepth: "velocity-alpha", motionSource: "object" });
    expect(next.v2?.unsupportedMotion).not.toContain("previous-depth-approximation");
    expect(assertExpectedPreviousDepthBindingsCurrent(next, f.device, 8, 8, { viewId: "view", frameId: 2 })).toBe(true);
    expect(prepare(f, nextOptions)).toBe(next);
    f.owner.commit("view", 2); advance(f);
    const legacy = prepare(f, { ...seedOptions, frameId: 3 });
    expect(legacy.history).toBe(next.historyOutput);
    expect(legacy.v2?.expectedPreviousDepth).toBeUndefined();
    expect(legacy.v2?.unsupportedMotion).toContain("previous-depth-approximation");
    expect(f.velocity.disposed).toBe(false);
  });

  it("rejects invalid inputs and MRT before touching history or a pending plan", () => {
    const f = fixture(), seed = prepare(f, { viewId: "view", frameId: 1, depthNear: 0.1 });
    f.owner.commit("view", 1); advance(f);
    const options = opts(f, 2), plan = f.owner.planFrame(f.device, 8, 8, identity(), options);
    const low = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
    const multisample = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", sampleCount: 4, depth: false });
    const mrt = f.device.createRenderTarget({ width: 8, height: 8, colorAttachments: [{ format: "rgba32f" }, { format: "rgba8" }], depth: false });
    const foreign = new MockRenderDevice(), foreignTarget = foreign.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const badCases: TemporalFrameOptions[] = [
      { ...options, expectedPreviousDepth: "unknown" as never }, { ...options, velocity: undefined },
      { ...options, velocity: low }, { ...options, velocity: multisample }, { ...options, velocity: mrt },
      { ...options, velocity: foreignTarget }, { ...options, velocity: seed.history }, { ...options, reactive: f.velocity },
      { ...options, velocityMrtWritable: true }, { ...options, reconstruction: "temporal", reactive: undefined },
      { ...options, frameTime: NaN }, { ...options, depthNear: Infinity }, { ...options, reconstruction: "wrong" as never }
    ];
    try {
      for (const invalid of badCases) {
        const allocations = f.targets.length;
        expect(() => prepare(f, invalid)).toThrow();
        expect(f.targets).toHaveLength(allocations);
        expect(() => f.owner.assertPlanCurrent(plan, f.device, 8, 8, identity(), options)).not.toThrow();
        expect(seed.historyOutput.disposed).toBe(false);
      }
      const current = f.owner.preparePlanned(plan, f.device, 8, 8, [], identity(), options);
      expect(current.historyValid).toBe(true);
      expect(current.history).toBe(seed.historyOutput);
    } finally { foreign.dispose(); }
  });

  it("keeps plan and same-frame identity across conflicts, then rejects tampering and stale frames", () => {
    const f = fixture(), options = opts(f), other = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba32f", depth: false });
    const plan = f.owner.planFrame(f.device, 8, 8, identity(), options);
    expect(f.owner.planFrame(f.device, 8, 8, identity(), { ...options })).toBe(plan);
    expect(() => f.owner.planFrame(f.device, 8, 8, identity(), { ...options, velocity: other })).toThrow(/same frame/i);
    expect(() => f.owner.preparePlanned(plan, f.device, 8, 8, [], identity(), { ...options, velocity: other })).toThrow(/stale/i);
    expect(() => f.owner.assertPlanCurrent(plan, f.device, 8, 8, identity(), options)).not.toThrow();
    const frame = f.owner.preparePlanned(plan, f.device, 8, 8, [], identity(), options);
    expect(() => f.owner.assertPreparedPlanCurrent(plan, frame)).not.toThrow();
    for (const changed of [{ ...options, expectedPreviousDepth: undefined }, { ...options, velocity: other }, { ...options, frameTime: 1 / 30 }, { ...options, reset: true }]) {
      expect(() => prepare(f, changed)).toThrow(/changed/i);
      expect(() => f.owner.assertPreparedPlanCurrent(plan, frame)).not.toThrow();
    }
    (frame.v2!.jittered as Float32Array)[0] = 2;
    expect(() => f.owner.assertPreparedPlanCurrent(plan, frame)).toThrow(/stale/i);
    expect(() => f.owner.commit("view", 1)).toThrow(/stale/i);
    expect(f.velocity.disposed).toBe(false);
  });

  it("does not publish frames after borrowed metadata, device generation or frame identity changes", () => {
    const f = fixture(), options = opts(f), plan = f.owner.planFrame(f.device, 8, 8, identity(), options);
    f.velocity.colorTexture.colorSpace = "srgb";
    expect(() => f.owner.assertPlanCurrent(plan, f.device, 8, 8, identity(), options)).toThrow(/stale/i);
    f.velocity.colorTexture.colorSpace = "linear";
    expect(() => f.owner.assertPlanCurrent(plan, f.device, 8, 8, identity(), options)).not.toThrow();
    const bindings = f.owner.preparePlanned(plan, f.device, 8, 8, [], identity(), options);
    f.reactive.colorTexture.colorSpace = "srgb";
    expect(() => assertExpectedPreviousDepthBindingsCurrent(bindings, f.device, 8, 8)).toThrow(/stale/i);
    f.reactive.colorTexture.colorSpace = "linear";
    (f.device as unknown as { generation: number }).generation++;
    expect(() => f.owner.commit("view", 1)).toThrow(/stale/i);
    (f.device as unknown as { generation: number }).generation--;
    advance(f);
    expect(() => assertExpectedPreviousDepthBindingsCurrent(bindings, f.device, 8, 8)).toThrow(/stale/i);
    expect(f.velocity.disposed).toBe(false);
  });

  it("rejects wrong backend, disabled post, malformed extents and attachments before allocating history", () => {
    const f = fixture(), options = opts(f);
    const mutations: [object, string, unknown][] = [
      [f.device, "kind", "webgpu"], [f.velocity, "width", 7], [f.velocity, "sampleCount", 4],
      [f.velocity, "attachmentMipLevel", 1], [f.velocity, "attachmentLayer", 1], [f.velocity, "dimension", "cube"],
      [f.velocity.colorTexture, "format", "rgba16f"], [f.velocity.colorTexture, "width", 7],
      [f.reactive.colorTexture, "format", "depth24"]
    ];
    for (const [object, key, value] of mutations) {
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      Object.defineProperty(object, key, { ...descriptor, value });
      const before = f.targets.length;
      expect(() => prepare(f, options)).toThrow();
      expect(f.targets).toHaveLength(before);
      Object.defineProperty(object, key, descriptor);
    }
    const allocations = f.targets.length;
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: false }), f.device);
    expect(() => prepare(f, options)).toThrow();
    expect(f.targets).toHaveLength(allocations);
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_POST: true }), f.device);
    expect(prepare(f, options).historyValid).toBe(false);
  });

  it("detects mutation during item inspection without consuming the pending plan", () => {
    const f = fixture(), options = opts(f), plan = f.owner.planFrame(f.device, 8, 8, identity(), options);
    const item = { get geometry() { f.velocity.colorTexture.colorSpace = "srgb"; return undefined; } };
    const allocations = f.targets.length;
    expect(() => f.owner.prepare(f.device, 8, 8, [item] as never, identity(), options)).toThrow(/changed/i);
    expect(f.targets).toHaveLength(allocations);
    f.velocity.colorTexture.colorSpace = "linear";
    expect(() => f.owner.assertPlanCurrent(plan, f.device, 8, 8, identity(), options)).not.toThrow();
    expect(f.owner.preparePlanned(plan, f.device, 8, 8, [], identity(), options).historyValid).toBe(false);
  });

  it("records the real WebGL pass bindings and preserves the full-range sentinel format", () => {
    const f = fixture(), first = prepare(f);
    const seed = run(f, first);
    const dilation = f.draws.find(draw => draw.source.includes("vec4 selfVelocity"));
    const resolve = f.draws.find(draw => draw.source.includes("uniform highp sampler2D u_velocityDilate"));
    expect(dilation?.target?.colorTexture.format).toBe("rgba32f");
    expect(dilation?.textures.get(0)).toBe(f.velocity.colorHandle);
    expect(dilation?.uniforms.get("u_hasExpectedDepth")).toEqual([1]);
    expect(dilation?.uniforms.get("u_depthNear")).toEqual([0.1]);
    expect(resolve?.target).toBe(first.historyOutput);
    expect(resolve?.textures.get(2)).toBe(dilation?.target?.colorHandle);
    expect(resolve?.uniforms.get("u_hasExpectedDepth")).toEqual([1]);
    expect(resolve?.uniforms.get("u_hasHistory")).toEqual([0]);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(true);
    seed.outputLease?.release(); f.owner.commit("view", 1); advance(f);
    (f.frame as { frameId: number }).frameId = 2;
    f.draws.length = 0;
    const second = prepare(f, opts(f, 2)), result = run(f, second);
    expect(f.draws.find(draw => draw.source.includes("uniform highp sampler2D u_velocityDilate"))?.uniforms.get("u_hasHistory")).toEqual([1]);
    result.outputLease?.release(); f.owner.commit("view", 2); advance(f);
    (f.frame as { frameId: number }).frameId = 3;
    f.draws.length = 0;
    const fallback = prepare(f, { viewId: "view", frameId: 3, depthNear: 0.1 });
    const oldPath = run(f, fallback);
    const legacyDilation = f.draws.find(draw => draw.source.includes("vec4 selfVelocity"));
    expect(legacyDilation?.uniforms.get("u_hasExpectedDepth")).toEqual([0]);
    expect(legacyDilation?.uniforms.has("u_depthNear")).toBe(false);
    expect(legacyDilation?.target?.colorTexture.format).toBe("rgba16f");
    oldPath.outputLease?.release();
  });

  it("keeps the legacy camera-only pass and velocity-alpha behavior unchanged", () => {
    const f = fixture(), legacy = prepare(f, { viewId: "view", frameId: 1, depthNear: 0.1 });
    const result = run(f, legacy);
    const dilation = f.draws.find(draw => draw.source.includes("vec4 selfVelocity"));
    const resolve = f.draws.find(draw => draw.source.includes("uniform highp sampler2D u_velocityDilate"));
    expect(f.draws.some(draw => draw.source.includes("u_prevViewProjection"))).toBe(true);
    expect(dilation?.target?.colorTexture.format).toBe("rgba16f");
    expect(dilation?.uniforms.get("u_hasExpectedDepth")).toEqual([0]);
    expect(dilation?.uniforms.has("u_depthNear")).toBe(false);
    expect(resolve?.uniforms.get("u_hasExpectedDepth")).toEqual([0]);
    expect(legacy.v2?.unsupportedMotion).toContain("previous-depth-approximation");
    result.outputLease?.release();
  });

  it("catches callback and in-draw target changes before submitting or committing the affected pass", () => {
    const f = fixture(), bindings = prepare(f), originalHandle = f.velocity.colorHandle;
    const pass: PostPassDescriptor = { id: "expected-depth-reentry", owner: "prd03", flag: "A3D_QR_POST", insertAt: "before-taa",
      space: "linear-hdr", inputs: ["color"], gpuOnly: true, fragment: { glsl: "void main() {}" },
      enabled: () => { f.velocity.colorHandle = {} as WebGLTexture; return false; } };
    expect(() => run(f, bindings, { customPasses: [pass] })).toThrow(/stale/i);
    expect(f.draws.some(draw => draw.source.includes("uniform highp sampler2D u_velocityDilate"))).toBe(false);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    f.velocity.colorHandle = originalHandle;
    f.draws.length = 0;
    f.uniformsHook = (name, value) => { if (name === "u_hasExpectedDepth" && value === 1) f.velocity.colorHandle = {} as WebGLTexture; };
    expect(() => run(f, bindings)).toThrow(/stale/i);
    expect(f.draws.some(draw => draw.source.includes("vec4 selfVelocity"))).toBe(false);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    expect(f.velocity.disposed).toBe(false);
    f.velocity.colorHandle = originalHandle;
  });

  it("rejects a native-handle alias before any post pass is submitted", () => {
    const f = fixture(), bindings = prepare(f), original = f.source.colorHandle, allocations = f.targets.length;
    f.source.colorHandle = f.velocity.colorHandle;
    expect(() => run(f, bindings)).toThrow(/stale/i);
    expect(f.draws).toHaveLength(0);
    expect(f.targets).toHaveLength(allocations);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    f.source.colorHandle = original;
  });

  it("withholds history after a declining late or deferred callback changes the input", () => {
    const f = fixture(), bindings = prepare(f), original = f.velocity.colorHandle;
    const pass: PostPassDescriptor = { id: "late-expected-depth", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-taa",
      space: "linear-hdr", inputs: ["color"], gpuOnly: true, fragment: { glsl: "void main() {}" },
      enabled: () => { f.velocity.colorHandle = {} as WebGLTexture; return false; } };
    expect(() => run(f, bindings, { customPasses: [pass] })).toThrow(/stale/i);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    f.velocity.colorHandle = original;
    const deferred = runV2HdrStages(f.host, f.source, { ...pipeline, customPasses: [{ ...pass, insertAt: "before-tonemap" }] },
      camera, bindings, f.frame, { deferBeforeTonemap: true, retainOutputLease: true });
    expect(deferred.afterBloom).toBeDefined();
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    expect(() => deferred.afterBloom!.run(f.source)).toThrow(/stale/i);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    expect(f.velocity.disposed).toBe(false);
    f.velocity.colorHandle = original;
    deferred.afterBloom!.release(); deferred.outputLease?.release();
  });

  it("publishes the history marker only after deferred post work succeeds", () => {
    const f = fixture(), bindings = prepare(f);
    const pass: PostPassDescriptor = { id: "deferred-expected-depth", owner: "prd03", flag: "A3D_QR_POST", insertAt: "before-tonemap",
      space: "linear-hdr", inputs: ["color"], gpuOnly: true, fragment: { glsl: "void main() {}" }, enabled: () => false };
    const deferred = runV2HdrStages(f.host, f.source, { ...pipeline, customPasses: [pass] }, camera, bindings, f.frame,
      { deferBeforeTonemap: true, retainOutputLease: true });
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(false);
    expect(deferred.afterBloom?.run(f.source)).toBe(f.source);
    expect(consumeTaaHistoryWritten(f.frame.scopeId, "view", 1)).toBe(true);
    f.owner.commit("view", 1);
    deferred.afterBloom?.release(); deferred.outputLease?.release();
  });

  it("requires the same foreground velocity/depth tap and rejects independently calculated disocclusions", () => {
    expect(VELOCITY_DILATE_GLSL).toContain("nearestVelocity = texelFetch(u_velocity, tap, 0)");
    expect(VELOCITY_DILATE_GLSL).toContain("selfHasPrevious && nearestHasPrevious ? nearestVelocity.a : 3.0e38");
    expect(VELOCITY_DILATE_GLSL).toContain("vec4(nearestVelocity.rg, zSelf, expectedPrevious)");
    // With near=0.1, expected depth 5 has tolerance 0.49; 5.2 is valid but 10 is not.
    expect(temporalDepthAccepted(5, [5.2], 0.1, 0.001, 0.1)).toBe(true);
    expect(temporalDepthAccepted(10, [5.2], 0.1, 0.001, 0.1)).toBe(false);
    expect(temporalDepthAccepted(5, [10], 0.1, 0.001, 0.1)).toBe(false);
    expect(temporalDepthAccepted(10, [10], 0.1, 0.001, 0.1)).toBe(true);
    expect(temporalDepthAccepted(3e38, [5], 0.1, 0.001, 0.1)).toBe(false);
    expect(temporalDepthAccepted(-1, [-0.9], 0.1, 0.001, -2)).toBe(true);
  });
});
