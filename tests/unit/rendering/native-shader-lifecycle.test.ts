import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { describeCompileError, ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { programDegradationLog } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import { runV2LdrTail } from "../../../packages/rendering/src/post/v2Stages";
import * as postV2 from "../../../packages/rendering/src/post/v2Entry";
import { executePostGraphWebGL2 } from "../../../packages/rendering/src/webgl2/LegacyPost";
import type { WebGL2DeviceOptions } from "../../../packages/rendering/src/WebGL2Device";

const features = (dir: 0 | 1 | 2 | 4) => normalizeProgramFeatures({
  lighting: "lit", pass: "forward",
  lights: { dir, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false }
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

class DeferredDevice extends MockRenderDevice {
  readonly jobs: ReturnType<typeof deferred<RenderShaderProgram>>[] = [];
  readonly lostListeners = new Set<() => void>();
  compileAsync(_sources: ShaderSources): Promise<RenderShaderProgram> {
    const job = deferred<RenderShaderProgram>();
    this.jobs.push(job);
    return job.promise;
  }
  onDeviceLost(listener: () => void): () => void {
    this.lostListeners.add(listener);
    return () => this.lostListeners.delete(listener);
  }
  lose(): void {
    this.contextLost = true;
    for (const listener of [...this.lostListeners]) listener();
  }
  restore(): void { this.contextLost = false; }
}

function program() {
  return { dispose: vi.fn() } as unknown as RenderShaderProgram & { dispose: ReturnType<typeof vi.fn> };
}

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("program cache lifecycle", () => {
  it("settles warmup and held handles on disposal, and deletes a late success exactly once", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    const handle = cache.acquire(features(0));
    const warm = cache.precompile([features(0)]);
    cache.dispose();
    cache.dispose();
    await expect(warm).rejects.toMatchObject({ code: "DISPOSED_PROGRAM_CACHE" });
    expect(handle).toMatchObject({ status: "failed", error: "DISPOSED_PROGRAM_CACHE" });
    expect(() => cache.acquire(features(0))).toThrowError(/disposed/i);
    expect(device.lostListeners.size).toBe(0);
    const late = program();
    device.jobs[0]!.resolve(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(handle.status).toBe("failed");
  });

  it("invalidates the old generation, settles its waiters, and retries after restoration", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    const old = cache.acquire(features(0));
    const warm = cache.precompile([features(0)]);
    device.lose();
    await expect(warm).rejects.toMatchObject({ code: "DEVICE_LOST" });
    expect(old).toMatchObject({ status: "failed", error: "DEVICE_LOST" });
    expect(() => cache.acquire(features(0))).toThrowError(/lost/i);
    device.restore();
    const next = cache.acquire(features(0));
    const current = program();
    device.jobs[1]!.resolve(current);
    await Promise.resolve();
    expect(next.status).toBe("ready");
    const late = program();
    device.jobs[0]!.resolve(late);
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(next.program).toBe(current);
    cache.dispose();
    expect(current.dispose).toHaveBeenCalledTimes(1);
  });

  it("settles a late rejection without resurrecting a disposed cache", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = cache.acquire(features(0));
    cache.dispose();
    device.jobs[0]!.reject(new Error("late driver failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(handle).toMatchObject({ status: "failed", error: "DISPOSED_PROGRAM_CACHE" });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("settles a failed warmup even when the rejected value has hostile properties", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warm = cache.precompile([features(0)]);
    const hostile = new Proxy({}, { has() { throw new Error("denied"); }, getPrototypeOf() { throw new Error("denied"); } });
    device.jobs[0]!.reject(hostile);
    await expect(warm).rejects.toMatchObject({ code: "PROGRAM_COMPILE_FAILED" });
    expect(cache.stats()).toMatchObject({ pending: 0, failed: 1 });
    cache.dispose();
  });

  it("continues disposing the other programs and settles waiters when a program disposer throws", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    const first = cache.acquire(features(0));
    cache.acquire(features(1));
    const warm = cache.precompile([features(2)]);
    const broken = program();
    broken.dispose.mockImplementation(() => { throw new Error("release failed"); });
    const other = program();
    device.jobs[0]!.resolve(broken);
    device.jobs[1]!.resolve(other);
    await Promise.resolve();
    expect(first.status).toBe("ready");
    expect(() => cache.dispose()).toThrowError(/shader programs/i);
    await expect(warm).rejects.toMatchObject({ code: "DISPOSED_PROGRAM_CACHE" });
    expect(broken.dispose).toHaveBeenCalledTimes(1);
    expect(other.dispose).toHaveBeenCalledTimes(1);
    expect(first.status).toBe("failed");
    // 5.0 retirement contract: the receipt-less failed program stays owned and
    // reported; each explicit dispose() retries it until its disposer returns.
    expect(() => cache.dispose()).toThrowError(/shader programs/i);
    expect(broken.dispose).toHaveBeenCalledTimes(2);
    broken.dispose.mockImplementation(() => undefined);
    expect(() => cache.dispose()).not.toThrow();
    expect(broken.dispose).toHaveBeenCalledTimes(3);
    expect(() => cache.dispose()).not.toThrow();
    expect(broken.dispose).toHaveBeenCalledTimes(3);
    expect(other.dispose).toHaveBeenCalledTimes(1);
    expect(ProgramCache.disposalFailures(device).every((failure) => failure.resolved)).toBe(true);
  });

  it("retains and retries a late program whose disposer throws after the cache was disposed", async () => {
    const device = new DeferredDevice();
    const cache = new ProgramCache(device, { parallelCompile: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handle = cache.acquire(features(0));
    cache.dispose();
    const late = program();
    late.dispose.mockImplementation(() => { throw new Error("late release failed"); });
    device.jobs[0]!.resolve(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.dispose).toHaveBeenCalledTimes(1);
    expect(handle).toMatchObject({ status: "failed", error: "DISPOSED_PROGRAM_CACHE" });
    expect(ProgramCache.staleDisposalFailures(device)).toHaveLength(1);
    expect(ProgramCache.disposalFailures(device)).toEqual([expect.objectContaining({ origin: "stale", resolved: false })]);
    expect(() => cache.dispose()).toThrowError(/shader programs/i);
    expect(late.dispose).toHaveBeenCalledTimes(2);
    late.dispose.mockImplementation(() => undefined);
    expect(() => cache.dispose()).not.toThrow();
    expect(late.dispose).toHaveBeenCalledTimes(3);
    // History keeps both thrown errors, now resolved by the confirmed retry.
    expect(ProgramCache.disposalFailures(device)).toEqual([
      expect.objectContaining({ origin: "stale", resolved: true }), expect.objectContaining({ origin: "stale", resolved: true })
    ]);
    expect(() => cache.dispose()).not.toThrow();
    expect(late.dispose).toHaveBeenCalledTimes(3);
  });

  it("reports actual compile failures and compiles all synchronous warmup entries despite the frame budget", async () => {
    const failing = new DeferredDevice();
    const cache = new ProgramCache(failing, { parallelCompile: true });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warm = cache.precompile([features(0)]);
    failing.jobs[0]!.reject(new Error("bad shader"));
    await expect(warm).rejects.toMatchObject({ code: "PROGRAM_COMPILE_FAILED" });
    expect(cache.stats().failed).toBe(1);

    const sync = new ProgramCache(new MockRenderDevice(), { parallelCompile: false, maxSyncCompilesPerFrame: 1 });
    await sync.precompile([features(0), features(1), features(2), features(4)]);
    expect(sync.stats()).toMatchObject({ compiled: 4, pending: 0, failed: 0 });
  });

  it("bounds and redacts error text without invoking hostile object conversions", () => {
    const error = Object.assign(new Error("https://example.com/a?token=private"), {
      details: { log: "Authorization: Bearer private\n" + "x".repeat(5000) }
    });
    const result = describeCompileError(error);
    expect(result).not.toContain("private");
    expect(result.length).toBeLessThanOrEqual(1300);
    expect(describeCompileError({ toString() { throw new Error("must not call"); } })).toBe("Unknown shader compile error");
    const unusual = new Error("failed");
    Object.defineProperty(unusual, "details", { get() { throw new Error("unreadable"); } });
    expect(describeCompileError(unusual)).toBe("Unknown shader compile error");
  });

  it("keeps failures with their owning cache's diagnostic sink", async () => {
    const first = new DeferredDevice();
    const second = new DeferredDevice();
    const firstSink = vi.fn();
    const secondSink = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cache1 = new ProgramCache(first, { parallelCompile: true, onDegradation: firstSink });
    const cache2 = new ProgramCache(second, { parallelCompile: true, onDegradation: secondSink });
    const globalCount = programDegradationLog.length;
    const warm1 = cache1.precompile([features(0)]);
    const warm2 = cache2.precompile([features(0)]);
    first.jobs[0]!.reject(new Error("first-only"));
    second.jobs[0]!.reject(new Error("second-only"));
    await expect(warm1).rejects.toThrow(/first-only/);
    await expect(warm2).rejects.toThrow(/second-only/);
    expect(firstSink).toHaveBeenCalledTimes(1);
    expect(secondSink).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(firstSink.mock.calls)).not.toContain("second-only");
    expect(JSON.stringify(secondSink.mock.calls)).not.toContain("first-only");
    expect(programDegradationLog.length).toBe(globalCount);
  });
});

const sources: ShaderSources = { label: "lifecycle", marker: "MARK", vertex: "MARK vertex", fragment: "MARK fragment" };

function fakeWebGL(options: Partial<WebGL2DeviceOptions> = {}, extensions: readonly string[] = [], fences = false,
  presentation?: { readonly alphaMode: "straight" | "premultiplied" }) {
  const constants = new Map<string, number>();
  const value = (name: string) => {
    if (!constants.has(name)) constants.set(name, constants.size + 1);
    return constants.get(name)!;
  };
  const listeners = new Map<string, EventListener>();
  const deletedShaders: unknown[] = [];
  const deletedPrograms: unknown[] = [];
  const deletedTextures: unknown[] = [];
  const multiDraws: unknown[][] = [];
  const uniforms: Array<[string, number]> = [];
  const blits: unknown[][] = [];
  const state = { shaderAllocations: 0, failShaderAt: 0, failProgram: false, shaderOk: true, linkOk: true, complete: false, fenceSignaled: false, contextLost: false, failFramebufferBind: false, failMultiDraw: false, currentProgram: null as unknown,
    readFramebuffer: null as unknown, drawFramebuffer: null as unknown, readBuffer: value("COLOR_ATTACHMENT0"), drawBuffer: value("COLOR_ATTACHMENT0") };
  let nextId = 0;
  const glProperties: Record<string, unknown> = presentation ? { drawingBufferColorSpace: "srgb" } : {};
  const gl = new Proxy(glProperties, {
    get(target, property) {
      const name = String(property);
      if (name === "drawingBufferColorSpace" && Object.hasOwn(target, property)) return Reflect.get(target, property);
      if (name === "getContextAttributes" && presentation) return () => ({ alpha: true, premultipliedAlpha: presentation.alphaMode === "premultiplied" });
      if (name === "NO_ERROR") return 0;
      if (name === "getError") return () => 0;
      if (name === "getParameter") return (parameter: number) => {
        if (parameter === value("CURRENT_PROGRAM")) return state.currentProgram;
        if (parameter === value("READ_FRAMEBUFFER_BINDING")) return state.readFramebuffer;
        if (parameter === value("DRAW_FRAMEBUFFER_BINDING") || parameter === value("FRAMEBUFFER_BINDING")) return state.drawFramebuffer;
        if (parameter === value("READ_BUFFER")) return state.readBuffer;
        if (parameter === value("DRAW_BUFFER0")) return state.drawBuffer;
        return 8;
      };
      if (name === "useProgram") return (handle: unknown) => { state.currentProgram = handle; };
      if (name === "bindFramebuffer") return (target: number, handle: unknown) => {
        if (state.failFramebufferBind) throw new Error("framebuffer bind failed");
        if (target === value("READ_FRAMEBUFFER") || target === value("FRAMEBUFFER")) state.readFramebuffer = handle;
        if (target === value("DRAW_FRAMEBUFFER") || target === value("FRAMEBUFFER")) state.drawFramebuffer = handle;
      };
      if (name === "readBuffer") return (buffer: number) => { state.readBuffer = buffer; };
      if (name === "drawBuffers") return (buffers: number[]) => { state.drawBuffer = buffers[0]!; };
      if (name === "blitFramebuffer") return (...args: unknown[]) => { blits.push(args); };
      if (name === "readPixels") return (...args: unknown[]) => { (args[6] as Uint8Array).fill(17); };
      if (name === "checkFramebufferStatus") return () => value("FRAMEBUFFER_COMPLETE");
      if (name === "getExtension") return (extension: string) => extension === "KHR_parallel_shader_compile" ? { COMPLETION_STATUS_KHR: value("COMPLETION_STATUS_KHR") }
        : extension === "WEBGL_multi_draw" && extensions.includes(extension) ? { multiDrawElementsInstancedWEBGL: (...args: unknown[]) => {
          multiDraws.push(args);
          if (state.failMultiDraw) throw new Error("native multi-draw failed after attempt");
        } }
          : extensions.includes(extension) ? {} : null;
      if (name === "createShader") return () => ++state.shaderAllocations === state.failShaderAt ? null : { id: ++nextId };
      if (name === "createProgram") return () => state.failProgram ? null : { id: ++nextId };
      if (name === "deleteShader") return (shader: unknown) => deletedShaders.push(shader);
      if (name === "deleteProgram") return (p: unknown) => deletedPrograms.push(p);
      if (name === "deleteTexture") return (texture: unknown) => deletedTextures.push(texture);
      if (name === "fenceSync") return () => fences ? {} : null;
      if (name === "clientWaitSync") return () => state.fenceSignaled ? value("ALREADY_SIGNALED") : value("TIMEOUT_EXPIRED");
      if (name === "getShaderParameter") return () => state.shaderOk;
      if (name === "getShaderInfoLog") return () => "shader error";
      if (name === "getUniformLocation") return (_program: unknown, uniform: string) => uniform;
      if (name === "uniform1i") return (uniform: string, scalar: number) => { uniforms.push([uniform, scalar]); };
      if (name === "getProgramInfoLog") return () => "link error";
      if (name === "getProgramParameter") return (_program: unknown, parameter: number) => {
        if (parameter === value("COMPLETION_STATUS_KHR")) return state.complete;
        if (parameter === value("LINK_STATUS")) return state.linkOk;
        return 0;
      };
      if (name === "getUniformBlockIndex") return () => value("INVALID_INDEX");
      if (name === "isContextLost") return () => state.contextLost;
      if (/^[A-Z0-9_]+$/.test(name)) return value(name);
      if (name.startsWith("create")) return () => ({ id: ++nextId });
      return () => undefined;
    }
  }) as unknown as WebGL2RenderingContext;
  const getContext = vi.fn(() => gl);
  const canvas = {
    getContext,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name)
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ ...options, canvas });
  const dispatch = (name: string) => listeners.get(name)?.({ preventDefault() {} } as Event);
  return { device, state, deletedShaders, deletedPrograms, deletedTextures, blits, dispatch, getContext, uniforms, multiDraws };
}

describe("WebGL active frame identity", () => {
  it("creates a fresh token only for successful frames and keeps it through rejected reentry", () => {
    const { device } = fakeWebGL();
    expect(device.activeFrameToken).toBeNull();
    expect(() => device.beginFrame(0, 4)).toThrow();
    expect(device.activeFrameToken).toBeNull();
    device.beginFrame(4, 4);
    const first = device.activeFrameToken;
    expect(first).not.toBeNull();
    expect(device.activeFrameToken).toBe(first);
    expect(() => device.beginFrame(4, 4)).toThrow(/already active/);
    expect(device.activeFrameToken).toBe(first);
    device.endFrame();
    expect(device.activeFrameToken).toBeNull();
    device.beginFrame(4, 4);
    expect(device.activeFrameToken).not.toBeNull();
    expect(device.activeFrameToken).not.toBe(first);
    device.dispose();
    expect(device.activeFrameToken).toBeNull();
  });

  it("invalidates before loss observers, including a native loss reported before its event", () => {
    const { device, state, dispatch } = fakeWebGL();
    const observed: Array<object | null> = [];
    device.onDeviceLost(() => observed.push(device.activeFrameToken));
    device.beginFrame(4, 4);
    const first = device.activeFrameToken;
    expect(first).not.toBeNull();
    state.contextLost = true;
    expect(device.activeFrameToken).toBeNull();
    state.contextLost = false;
    expect(device.activeFrameToken).toBeNull();
    dispatch("webglcontextlost");
    expect(observed).toEqual([null]);
    expect(device.activeFrameToken).toBeNull();
    dispatch("webglcontextrestored");
    expect(device.activeFrameToken).toBeNull();
    device.beginFrame(4, 4);
    const restored = device.activeFrameToken;
    expect(restored).not.toBeNull();
    expect(restored).not.toBe(first);
    dispatch("webglcontextlost");
    expect(observed).toEqual([null, null]);
    dispatch("webglcontextrestored");
    device.dispose();
    expect(device.activeFrameToken).toBeNull();
  });

  it("does not create a token when native frame setup throws", () => {
    const { device, state } = fakeWebGL();
    state.failFramebufferBind = true;
    expect(() => device.beginFrame(4, 4)).toThrow(/framebuffer bind failed/);
    expect(device.activeFrameToken).toBeNull();
    state.failFramebufferBind = false;
    device.dispose();
  });
});

describe("WebGL public multi-draw fallback", () => {
  it("rechecks actual extension availability across context restoration", () => {
    const extensions = ["WEBGL_multi_draw"];
    const { device, dispatch } = fakeWebGL({}, extensions);
    expect(device.supportsMultiDrawElementsInstanced()).toBe(true);
    expect(device.probe.multiDraw).toBe(true);
    dispatch("webglcontextlost");
    expect(device.supportsMultiDrawElementsInstanced()).toBe(false);
    extensions.length = 0;
    dispatch("webglcontextrestored");
    // The construction-time probe remains historical; the live query must
    // follow the extension reacquired for the restored context.
    expect(device.probe.multiDraw).toBe(true);
    expect(device.supportsMultiDrawElementsInstanced()).toBe(false);
    device.dispose();
  });

  it("never replays extension-only draws when combined submission is unavailable", () => {
    const { device, multiDraws } = fakeWebGL();
    const draw = vi.fn();
    device.draw = draw;
    device.beginFrame(4, 4);
    expect(device.tryMultiDrawElementsInstanced([])).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(multiDraws).toHaveLength(0);
    device.endFrame();
    device.dispose();
  });

  it("submits a compatible run once and does not replay an attempted failure", () => {
    const { device, state, multiDraws } = fakeWebGL({}, ["WEBGL_multi_draw"]);
    const shader = device.createShaderProgram({ ...sources,
      vertex: "#version 300 es\n#extension GL_ANGLE_multi_draw : require\n// MARK\nvoid main() { gl_Position = vec4(float(gl_DrawID), 0.0, 0.0, 1.0); }",
      fragment: "#version 300 es\n// MARK\nprecision mediump float; out vec4 color; void main() { color = vec4(1.0); }" });
    const vertexBuffer = device.createBuffer("vertex", 72);
    const indexBuffer = device.createBuffer("index", 12);
    const uniforms = new Map();
    const first: DrawCommand = { topology: "triangles", shader, vertexBuffer, vertexFormat: VertexFormat.P3N3, vertexCount: 3,
      indexBuffer, indexType: "uint16", indexCount: 3, firstIndex: 0, uniforms };
    const second = { ...first, firstIndex: 3 };
    const draw = vi.fn();
    device.draw = draw;
    device.beginFrame(4, 4);
    expect(device.tryMultiDrawElementsInstanced([first, { ...second, topology: "lines" }])).toBe(false);
    expect(multiDraws).toHaveLength(0);
    expect(device.tryMultiDrawElementsInstanced([first, second])).toBe(true);
    expect([...multiDraws[0]![1] as Int32Array]).toEqual([3, 3]);
    expect([...multiDraws[0]![4] as Int32Array]).toEqual([0, 6]);
    expect(device.getDiagnostics()).toMatchObject({ drawCalls: 1, triangles: 2 });
    state.failMultiDraw = true;
    expect(() => device.tryMultiDrawElementsInstanced([first, second])).toThrow("native multi-draw failed after attempt");
    expect(multiDraws).toHaveLength(2);
    expect(draw).not.toHaveBeenCalled();
    device.endFrame();
    device.dispose();
  });

  it.each([false, true])("uses the current public draw for each incompatible member (extension: %s)", (extension) => {
    const { device, multiDraws } = fakeWebGL({}, extension ? ["WEBGL_multi_draw"] : []);
    const vertexBuffer = device.createBuffer("vertex", 72);
    const originalDraw = device.draw.bind(device);
    const calls: string[] = [];
    const toJSON = vi.fn(() => { throw new Error("unexpected state inspection"); });
    const renderState = { depthTest: true, depthWrite: true, cullMode: "back" as const, blend: false, depthCompare: "less-equal" as const, toJSON };
    device.draw = (command) => {
      calls.push(`first:${command.label}`);
      originalDraw(command);
      device.draw = (next) => { calls.push(`next:${next.label}`); originalDraw(next); };
    };
    const commands: DrawCommand[] = [
      { label: "a", topology: "triangles", vertexBuffer, vertexCount: 3, renderState },
      { label: "b", topology: "triangles", vertexBuffer, vertexCount: 6, renderState }
    ];
    device.beginFrame(4, 4);
    device.multiDrawElementsInstanced(commands);
    expect(calls).toEqual(["first:a", "next:b"]);
    expect(toJSON).not.toHaveBeenCalled();
    expect(multiDraws).toHaveLength(0);
    expect(device.getDiagnostics()).toMatchObject({ drawCalls: 2, triangles: 3 });
    device.endFrame();
    device.dispose();
  });

  it("keeps an explicitly compatible extension batch as one native multi-draw", () => {
    const { device, multiDraws } = fakeWebGL({}, ["WEBGL_multi_draw"]);
    const shader = device.createShaderProgram({ ...sources,
      vertex: "#version 300 es\n#extension GL_ANGLE_multi_draw : require\n// MARK\nvoid main() { gl_Position = vec4(float(gl_DrawID), 0.0, 0.0, 1.0); }",
      fragment: "#version 300 es\n// MARK\nprecision mediump float; out vec4 color; void main() { color = vec4(1.0); }" });
    const vertexBuffer = device.createBuffer("vertex", 72);
    const indexBuffer = device.createBuffer("index", 12);
    const uniforms = new Map();
    const first: DrawCommand = { topology: "triangles", shader, vertexBuffer, vertexFormat: VertexFormat.P3N3, vertexCount: 3,
      indexBuffer, indexType: "uint16", indexCount: 3, firstIndex: 0, uniforms };
    const publicDraw = vi.fn();
    device.draw = publicDraw;
    device.beginFrame(4, 4);
    device.multiDrawElementsInstanced([first, { ...first, firstIndex: 3 }]);
    expect(publicDraw).not.toHaveBeenCalled();
    expect(multiDraws).toHaveLength(1);
    expect([...multiDraws[0]![1] as Int32Array]).toEqual([3, 3]);
    expect([...multiDraws[0]![4] as Int32Array]).toEqual([0, 6]);
    expect(device.getDiagnostics()).toMatchObject({ drawCalls: 1, triangles: 2 });
    device.endFrame();
    device.dispose();
  });

  it("preserves earlier successful fallback draws when a later public draw throws", () => {
    const { device } = fakeWebGL();
    const vertexBuffer = device.createBuffer("vertex", 36);
    const originalDraw = device.draw.bind(device);
    device.draw = (command) => {
      if (command.label === "b") throw new Error("second draw failed");
      originalDraw(command);
    };
    device.beginFrame(4, 4);
    expect(() => device.multiDrawElementsInstanced([
      { label: "a", topology: "triangles", vertexBuffer, vertexCount: 3 },
      { label: "b", topology: "triangles", vertexBuffer, vertexCount: 3 }
    ])).toThrow(/second draw failed/);
    expect(device.getDiagnostics()).toMatchObject({ drawCalls: 1, triangles: 1 });
    device.endFrame();
    device.dispose();
  });

  it("validates every attachment before attempting a fallback draw", () => {
    const { device } = fakeWebGL();
    const publicDraw = vi.fn();
    device.draw = publicDraw;
    device.beginFrame(4, 4);
    expect(() => device.multiDrawElementsInstanced([
      { vertexBuffer: {} as never, vertexCount: 3, topology: "triangles" },
      { vertexBuffer: {} as never, vertexCount: 3, topology: "triangles", get renderState() { throw new Error("invalid attachment state"); } }
    ])).toThrow(/invalid attachment state/);
    expect(publicDraw).not.toHaveBeenCalled();
    device.endFrame();
    device.dispose();
  });
});

describe("WebGL shader allocations", () => {
  it("requests canvas alpha association before creating the device", () => {
    const straight = fakeWebGL({ presentationAlphaMode: "straight" });
    expect(straight.getContext).toHaveBeenCalledWith("webgl2", expect.objectContaining({ alpha: true, premultipliedAlpha: false }));
    straight.device.dispose();
    const premultiplied = fakeWebGL({ presentationAlphaMode: "premultiplied" });
    expect(premultiplied.getContext).toHaveBeenCalledWith("webgl2", expect.objectContaining({ alpha: true, premultipliedAlpha: true }));
    premultiplied.device.dispose();
    expect(() => fakeWebGL({ presentationAlphaMode: "opaque", alpha: true })).toThrow(/disagree/);
  });

  it("retires real lazy post-effect targets on view release, context loss and device disposal", () => {
    const { device, dispatch, uniforms } = fakeWebGL();
    const host = webgl2DeviceHost(device)!;
    const created: ReturnType<typeof device.createRenderTarget>[] = [];
    const create = device.createRenderTarget.bind(device);
    vi.spyOn(device, "createRenderTarget").mockImplementation(descriptor => {
      const target = create(descriptor);
      created.push(target);
      return target;
    });
    const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba8" });
    const pipeline = { antiAliasing: "off", depthRange: { near: .1, far: 10, projection: "perspective" }, exposure: 1,
      toneMapping: "linear", dither: false, alphaMode: "premultiplied", nativeEffects: [{ kind: "afterimage", decay: .8 }] } as const;
    const scope = {}, other = {};
    const frame = (scopeId: object, viewId: string, frameId: number) => ({ scopeId, viewId, frameId, source: {}, items: [],
      sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false } } });
    runV2LdrTail(host, source, pipeline, undefined, frame(scope, "left", 1));
    runV2LdrTail(host, source, pipeline, undefined, frame(other, "right", 1));
    expect(uniforms.filter(([name]) => name === "u_outputAlphaMode").map(([, value]) => value)).toEqual([2, 2]);
    runV2LdrTail(host, source, { ...pipeline, antiAliasing: "fxaa", nativeEffects: [] }, undefined, frame(scope, "left", 1));
    expect(uniforms.filter(([name]) => name === "u_outputAlphaMode").at(-1)?.[1]).toBe(2);
    const histories = created.filter(target => target.label === "post-afterimage-history");
    expect(histories).toHaveLength(4);
    device.releaseNativePostEffectView(scope, "left");
    expect(histories.map(target => target.disposed)).toEqual([true, true, false, false]);
    dispatch("webglcontextlost");
    expect(histories.every(target => target.disposed)).toBe(true);
    dispatch("webglcontextrestored");
    const restoredSource = device.createRenderTarget({ width: 8, height: 8, format: "rgba8" });
    runV2LdrTail(host, restoredSource, pipeline, undefined, frame(scope, "left", 2));
    const recreated = created.filter(target => target.label === "post-afterimage-history").slice(4);
    expect(recreated).toHaveLength(2);
    device.dispose();
    device.dispose();
    expect(recreated.every(target => target.disposed)).toBe(true);
  });

  it("routes non-default post output policy into the actual OutputPass shader", () => {
    const { device } = fakeWebGL({}, ["EXT_color_buffer_float"], false, { alphaMode: "straight" });
    const host = webgl2DeviceHost(device)!;
    const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
    const compile = vi.spyOn(device, "createShaderProgram");
    device.beginFrame(8, 8);
    // This synthetic source is explicitly modeled as premultiplied linear opacity.
    executePostGraphWebGL2(host, source, { v2: postV2, passes: [],
      pipeline: { antiAliasing: "off", depthRange: { near: .1, far: 10, projection: "perspective" }, exposure: 1,
        toneMapping: "linear", dither: false, outputColorSpace: "display-p3", alphaMode: "straight", inputAlphaMode: "premultiplied" } });
    device.endFrame();
    expect(device.getOutputColorSpaceNegotiation()).toMatchObject({ requested: "display-p3", active: "display-p3" });
    const outputShader = compile.mock.calls.map(call => call[0].fragment).find(fragment => fragment.includes("#define OUTPUT_DISPLAY_P3"));
    expect(outputShader).toContain("#define OUTPUT_ALPHA_PRESERVE");
    expect(outputShader).not.toContain("#define OUTPUT_ALPHA_PREMULTIPLIED");
    device.dispose();
  });

  it("keeps intermediate effect colors straight and premultiplies only at the final output", () => {
    const { device, uniforms } = fakeWebGL({}, ["EXT_color_buffer_float"]);
    const host = webgl2DeviceHost(device)!;
    const source = device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: false });
    const output = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    const compile = vi.spyOn(device, "createShaderProgram");
    device.beginFrame(8, 8);
    // The pixelation effect is after OUT; the synthetic OUT input is premultiplied linear.
    executePostGraphWebGL2(host, source, { v2: postV2, outputTarget: output, passes: [],
      pipeline: { antiAliasing: "off", depthRange: { near: .1, far: 10, projection: "perspective" }, exposure: 1,
        toneMapping: "linear", dither: false, alphaMode: "premultiplied", inputAlphaMode: "premultiplied", nativeEffects: [{ kind: "pixelation", size: 2 }] } });
    device.endFrame();
    const outputShader = compile.mock.calls.map(call => call[0].fragment).find(fragment => fragment.includes("#define OUTPUT_ALPHA_PRESERVE"));
    expect(outputShader).toBeDefined();
    expect(outputShader).not.toContain("#define OUTPUT_ALPHA_PREMULTIPLIED");
    expect(uniforms.filter(([name]) => name === "u_outputAlphaMode").at(-1)?.[1]).toBe(2);
    device.dispose();
  });

  it("cleans partial allocations and failed links in synchronous and asynchronous paths", async () => {
    const partial = fakeWebGL();
    partial.state.failShaderAt = 2;
    expect(() => partial.device.createShaderProgram(sources)).toThrowError(/allocate/i);
    expect(partial.deletedShaders).toHaveLength(1);
    expect(partial.deletedPrograms).toHaveLength(0);

    const allocation = fakeWebGL();
    allocation.state.failProgram = true;
    await expect(allocation.device.compileAsync(sources)).rejects.toMatchObject({ code: "WEBGL_ALLOCATION_FAILED" });
    expect(allocation.deletedShaders).toHaveLength(2);
    expect(allocation.deletedPrograms).toHaveLength(0);

    const link = fakeWebGL();
    link.state.linkOk = false;
    expect(() => link.device.createShaderProgram(sources)).toThrowError(/link/i);
    expect(link.deletedShaders).toHaveLength(2);
    expect(link.deletedPrograms).toHaveLength(1);
  });

  it("cancels polling on context loss, then compiles on the restored generation", async () => {
    vi.useFakeTimers();
    const { device, state, deletedPrograms, deletedShaders, dispatch } = fakeWebGL();
    const pending = device.compileAsync(sources);
    expect(device.parallelCompilesPending).toBe(1);
    dispatch("webglcontextlost");
    await expect(pending).rejects.toMatchObject({ code: "DEVICE_LOST" });
    expect(device.generation).toBe(1);
    expect(device.parallelCompilesPending).toBe(0);
    expect(deletedShaders).toHaveLength(2);
    expect(deletedPrograms).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    dispatch("webglcontextrestored");
    state.complete = true;
    const retry = device.compileAsync(sources);
    await vi.runAllTimersAsync();
    const result = await retry;
    expect(device.parallelCompilesPending).toBe(0);
    result.dispose();
    device.dispose();
    device.dispose();
    expect(deletedShaders).toHaveLength(4);
    expect(deletedPrograms).toHaveLength(2);
  });

  it.each(["shader", "link"] as const)("cleans every allocation after async %s validation fails", async (failure) => {
    vi.useFakeTimers();
    const { device, state, deletedPrograms, deletedShaders } = fakeWebGL();
    state.complete = true;
    if (failure === "shader") state.shaderOk = false;
    else state.linkOk = false;
    const pending = device.compileAsync(sources);
    const rejected = expect(pending).rejects.toMatchObject({ code: failure === "shader" ? "SHADER_COMPILE_FAILED" : "SHADER_LINK_FAILED" });
    await vi.runAllTimersAsync();
    await rejected;
    expect(device.parallelCompilesPending).toBe(0);
    expect(deletedShaders).toHaveLength(2);
    expect(deletedPrograms).toHaveLength(1);
  });

  it("settles and cleans a pending compile immediately when the device is disposed", async () => {
    vi.useFakeTimers();
    const { device, deletedPrograms, deletedShaders } = fakeWebGL();
    const pending = device.compileAsync(sources);
    device.dispose();
    device.dispose();
    await expect(pending).rejects.toMatchObject({ code: "DEVICE_LOST" });
    expect(device.parallelCompilesPending).toBe(0);
    expect(deletedShaders).toHaveLength(2);
    expect(deletedPrograms).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("unsets a bound program before deleting it and keeps disposal idempotent", () => {
    const { device, state, deletedPrograms } = fakeWebGL();
    const shader = device.createShaderProgram(sources) as RenderShaderProgram & { readonly handle: unknown };
    state.currentProgram = shader.handle;
    shader.dispose();
    shader.dispose();
    expect(state.currentProgram).toBeNull();
    expect(deletedPrograms).toEqual([shader.handle]);
  });
});

describe("WebGL render target ownership and transfers", () => {
  it("stores the negotiated per-pass depth convention and rejects inconsistent or wrong-clip-range data", () => {
    const { device } = fakeWebGL();
    expect(device.getDepthConvention()).toMatchObject({ mode: "standard", clearValue: 1, compare: "less-equal" });
    const reversed = negotiateDepthConvention({ mode: "reversed" }, { clipRange: "minus-one-to-one", reversed: true, logarithmic: false });
    device.setDepthConvention(reversed);
    expect(device.getDepthConvention()).toMatchObject({ mode: "reversed", clearValue: 0, compare: "greater-equal", biasSign: -1 });
    expect(() => device.setDepthConvention({ ...reversed, clearValue: 1 })).toThrowError(/inconsistent/i);
    expect(() => device.setDepthConvention({ ...reversed, clipRange: "zero-to-one" })).toThrowError(/clip range/i);
    device.dispose();
  });

  it("rejects WebGL storage and oversized initial data before allocating buffers", () => {
    const { device } = fakeWebGL();
    expect(() => device.createBuffer("storage", 8)).toThrowError(/Storage buffers/);
    expect(() => device.createBuffer("vertex", 2, new Uint8Array(3))).toThrowError(/exceeds buffer size/);
    device.dispose();
  });

  it("retires a target-owned texture after its fence and does not delete it a second time during device teardown", async () => {
    vi.useFakeTimers();
    const { device, deletedTextures, state } = fakeWebGL({}, [], true);
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    expect(device.getDiagnostics().textureBytes).toBe(16);
    target.dispose();
    target.dispose();
    expect(deletedTextures).toHaveLength(0);
    expect(device.getDiagnostics().textureBytes).toBe(16);
    await vi.advanceTimersByTimeAsync(0);
    expect(deletedTextures).toHaveLength(0);
    expect(device.getDiagnostics().textureBytes).toBe(16);
    state.fenceSignaled = true;
    await vi.advanceTimersByTimeAsync(8);
    expect(deletedTextures).toHaveLength(1);
    expect(device.getDiagnostics().textureBytes).toBe(0);
    device.dispose();
    expect(deletedTextures).toHaveLength(1);
  });

  it("rejects sampling the active render attachment before issuing a draw", () => {
    const { device } = fakeWebGL();
    const target = device.createRenderTarget({ width: 2, height: 2, depth: false });
    device.beginFrame(2, 2);
    device.setRenderTarget(target);
    expect(() => device.draw({
      topology: "triangles", vertexBuffer: {} as never, vertexCount: 3,
      shader: { reflection: { uniforms: new Set(["image"]) } } as never,
      uniforms: new Map([["image", new TextureBinding({ name: "image", texture: target.colorTexture })]])
    })).toThrowError(/cannot sample a texture attached/i);
    device.endFrame();
    device.dispose();
  });

  it("copies and reads caller-owned bytes while rejecting overlap and aborted operations", async () => {
    const { device, blits, state } = fakeWebGL();
    const source = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const destination = device.createRenderTarget({ width: 2, height: 2, depth: false });
    const oldRead = state.readFramebuffer;
    const oldDraw = state.drawFramebuffer;
    await device.copyRenderTarget({ source, destination });
    expect(blits).toHaveLength(1);
    expect(state.readFramebuffer).toBe(oldRead);
    expect(state.drawFramebuffer).toBe(oldDraw);
    const bytes = await device.readRenderTarget({ target: destination });
    expect([...bytes]).toEqual(Array(16).fill(17));
    await expect(device.copyRenderTarget({ source, destination: source })).rejects.toMatchObject({ code: "RENDER_ATTACHMENT_HAZARD" });
    const controller = new AbortController();
    const pending = device.copyRenderTarget({ source, destination, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(blits).toHaveLength(1);
    device.dispose();
  });
});
