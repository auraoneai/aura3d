import { afterEach, describe, expect, it, vi } from "vitest";
import { TextureResidencyController, type TextureResidencySource } from "../../../packages/assets/src/TextureResidencyController";
import { Texture, type TextureFormat } from "../../../packages/rendering/src/Texture";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { acquireTextureBudgetLimit, reserveTextureBudget, resetTextureBudgetLedger, textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";
import type { WebGL2ResidencyMip } from "../../../packages/rendering/src/webgl2/TextureResidencyAdapter";

/** Strict WebGL-shaped fake: unsupported calls fail instead of silently succeeding. */
function makeDevice(options: { maxBytes?: number; compressed?: boolean; floatLinear?: boolean } = {}) {
  const constants = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0]]);
  const c = (name: string) => { if (!constants.has(name)) constants.set(name, 0x1000 + constants.size); return constants.get(name)!; };
  const calls: { name: string; args: unknown[] }[] = [];
  const listeners = new Map<string, EventListener>();
  let id = 0, active = c("TEXTURE0"), binding: unknown = null, error = 0;
  let drawFramebuffer: unknown = null, readFramebuffer: unknown = null, depthMask = true, depthClear = 1;
  const enabled = new Set<number>();
  let wait = c("ALREADY_SIGNALED"), noFence = false, failCreate = false, failUpload = false, failDelete = false, failFramebuffer = false, lost = false;
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const methods: Record<string, unknown> = {
    getError: () => { const value = error; error = 0; return value; },
    isContextLost: () => lost,
    getParameter: (name: number) => name === c("MAX_VERTEX_ATTRIBS") ? 16 : name === c("MAX_TEXTURE_IMAGE_UNITS") ? 16 : name === c("MAX_SAMPLES") ? 4 : name === c("ACTIVE_TEXTURE") ? active : name === c("TEXTURE_BINDING_2D") ? binding : name === c("DRAW_FRAMEBUFFER_BINDING") ? drawFramebuffer : name === c("READ_FRAMEBUFFER_BINDING") ? readFramebuffer : name === c("DEPTH_WRITEMASK") ? depthMask : name === c("DEPTH_CLEAR_VALUE") ? depthClear : 0,
    getExtension: (name: string) => options.compressed && name === "WEBGL_compressed_texture_s3tc" ? { COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGB_S3TC_DXT1_EXT: 0x83f0 } : options.floatLinear && name === "OES_texture_float_linear" ? {} : null,
    createTexture: () => failCreate ? null : { id: ++id },
    createFramebuffer: () => ({ id: ++id, kind: "framebuffer" }),
    deleteFramebuffer: record("deleteFramebuffer"),
    bindFramebuffer: (target: number, value: unknown) => {
      if (target === c("FRAMEBUFFER")) drawFramebuffer = readFramebuffer = value;
      else if (target === c("DRAW_FRAMEBUFFER")) drawFramebuffer = value;
      else if (target === c("READ_FRAMEBUFFER")) readFramebuffer = value;
      calls.push({ name: "bindFramebuffer", args: [target, value] });
    },
    framebufferTexture2D: record("framebufferTexture2D"), framebufferTextureLayer: record("framebufferTextureLayer"),
    checkFramebufferStatus: () => failFramebuffer ? 0 : c("FRAMEBUFFER_COMPLETE"), drawBuffers: record("drawBuffers"), readBuffer: record("readBuffer"),
    isEnabled: (cap: number) => enabled.has(cap), enable: (cap: number) => { enabled.add(cap); }, disable: (cap: number) => { enabled.delete(cap); },
    depthMask: (value: boolean) => { depthMask = value; }, clearDepth: (value: number) => { depthClear = value; calls.push({ name: "clearDepth", args: [value] }); },
    clear: (...args: unknown[]) => calls.push({ name: "clear", args }),
    deleteTexture: (handle: unknown) => { calls.push({ name: "deleteTexture", args: [handle] }); if (failDelete) error = 0x502; },
    bindTexture: (target: number, value: unknown) => { binding = value; calls.push({ name: "bindTexture", args: [target, value] }); },
    activeTexture: (value: number) => { active = value; },
    texImage2D: (...args: unknown[]) => { calls.push({ name: "texImage2D", args: [binding, ...args] }); if (failUpload) error = 0x505; },
    texImage3D: (...args: unknown[]) => { calls.push({ name: "texImage3D", args: [binding, ...args] }); if (failUpload) error = 0x505; },
    compressedTexImage2D: (...args: unknown[]) => { calls.push({ name: "compressedTexImage2D", args: [binding, ...args] }); if (failUpload) error = 0x505; },
    texParameteri: record("texParameteri"), pixelStorei: record("pixelStorei"), bindBuffer: record("bindBuffer"),
    createSampler: () => ({ id: ++id }), samplerParameteri: record("samplerParameteri"), samplerParameterf: record("samplerParameterf"),
    bindSampler: record("bindSampler"), uniform1i: record("uniform1i"), deleteSampler: record("deleteSampler"),
    fenceSync: (...args: unknown[]) => { calls.push({ name: "fenceSync", args }); return noFence ? null : { id: ++id }; },
    flush: record("flush"), clientWaitSync: (...args: unknown[]) => { calls.push({ name: "clientWaitSync", args }); return wait; }, deleteSync: record("deleteSync"),
    deleteProgram: record("deleteProgram"), deleteVertexArray: record("deleteVertexArray"), deleteBuffer: record("deleteBuffer"),
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in methods) return methods[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    throw new Error(`Unexpected WebGL call: ${name}`);
  } }) as WebGL2RenderingContext;
  const canvas = {
    getContext: () => gl,
    addEventListener: (name: string, listener: EventListener) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name)
  } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas, ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const host = (device as unknown as { host: WebGL2DeviceHost }).host;
  return { device, host, gl, calls, c,
    setWait: (name: string) => { wait = c(name); }, setNoFence: (value: boolean) => { noFence = value; },
    failCreate: (value: boolean) => { failCreate = value; }, failUpload: (value: boolean) => { failUpload = value; }, failDelete: (value: boolean) => { failDelete = value; }, failFramebuffer: (value: boolean) => { failFramebuffer = value; },
    lose: () => { lost = true; listeners.get("webglcontextlost")?.({ preventDefault() {} } as Event); },
    restore: () => { lost = false; listeners.get("webglcontextrestored")?.({} as Event); }
  };
}

function source(format: TextureFormat = "rgba8", options: { srgb?: boolean; fallback?: readonly [number, number, number, number] } = {}): TextureResidencySource<WebGL2ResidencyMip> & { texture: Texture } {
  const compressed = format.startsWith("bc") || format.startsWith("etc") || format.startsWith("astc");
  const texture = new Texture({ width: 4, height: 4, mipLevelCount: 3, format, colorSpace: options.srgb ? "srgb" : "linear", ...(compressed ? { data: new Uint8Array(8) } : {}) });
  const dimensions = [4, 2, 1];
  return {
    texture, identity: {}, fallback: options.fallback ?? [128, 128, 255, 255],
    levels: dimensions.map((size) => ({ width: size, height: size, bytes: compressed ? 8 : size * size * 4 })),
    async loadMip(level) {
      const size = dimensions[level]!;
      const fallbackData = new Uint8Array(size * size * 4).fill(7);
      for (let offset = 3; offset < fallbackData.length; offset += 4) fallbackData[offset] = 255;
      return { value: { data: new Uint8Array(compressed ? 8 : size * size * 4).fill(level + 1), ...(compressed ? { fallbackData } : {}) }, release() {} };
    }
  };
}

async function mipLevels(src: TextureResidencySource<WebGL2ResidencyMip>, count: number) {
  const output = [];
  for (let level = src.levels.length - count; level < src.levels.length; level++) output.push({ level, value: (await src.loadMip(level, new AbortController().signal)).value });
  return output;
}

const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

describe("WebGL streamed texture residency", () => {
  it("composes mutable device-wide budget leases without debiting live or retiring allocations", () => {
    const ctx = makeDevice();
    const first = acquireTextureBudgetLimit(20, ctx.device);
    const second = acquireTextureBudgetLimit(12, ctx.device);
    const a = reserveTextureBudget(8, undefined, ctx.device);
    expect(() => reserveTextureBudget(5, undefined, ctx.device)).toThrow(/budget/);
    second.setLimit(30);
    const b = reserveTextureBudget(12, undefined, ctx.device);
    first.setLimit(4);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(20);
    expect(() => reserveTextureBudget(1, undefined, ctx.device)).toThrow(/budget/);
    first.release(); first.release();
    const c = reserveTextureBudget(10, undefined, ctx.device);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(30);
    b(); c(); a();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    resetTextureBudgetLedger(ctx.device);
    const current = acquireTextureBudgetLimit(4, ctx.device);
    second.release(); // a late release from a reset must not alter this lease
    expect(() => reserveTextureBudget(5, undefined, ctx.device)).toThrow(/budget/);
    current.release(); ctx.device.dispose();
  });

  it("applies the streaming lease to ordinary uploads and releases admission only when the lease ends", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const limit = adapter.acquireBudgetLimit(20);
    const first = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    ctx.host.textureRegistry.getTextureHandle(first);
    const streamed = source();
    adapter.prepare(streamed, { maxBytes: 20, generation: adapter.generation() });
    const next = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    expect(() => ctx.host.textureRegistry.getTextureHandle(next)).toThrow(/budget/);
    limit.setLimit(24);
    ctx.host.textureRegistry.getTextureHandle(next);
    limit.setLimit(3);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(24);
    expect(() => reserveTextureBudget(1, undefined, ctx.device)).toThrow(/budget/);
    limit.release();
    first.dispose(); next.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    const fallback = adapter.unprepare(streamed, adapter.generation());
    await vi.runAllTimersAsync(); await fallback;
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });

  it("rejects ordinary textures that would only fit by silently downscaling under the streaming ceiling", () => {
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const limit = adapter.acquireBudgetLimit(20);
    const texture = new Texture({ width: 4, height: 4, data: new Uint8Array(64), generateMipmaps: false });
    expect(() => ctx.host.textureRegistry.getTextureHandle(texture)).toThrow(/without downscaling/);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.calls.filter((call) => call.name === "texImage2D")).toHaveLength(0);
    limit.release(); ctx.device.dispose();
  });

  it("keeps the controller's changing ceiling active for unrelated ordinary allocations", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const controller = new TextureResidencyController(adapter, { budgetBytes: 20 });
    const ordinary = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    ctx.host.textureRegistry.getTextureHandle(ordinary);
    const lease = controller.acquire(source(), { distanceMeters: 1 });
    const another = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    expect(() => ctx.host.textureRegistry.getTextureHandle(another)).toThrow(/budget/);
    controller.setBudget(24);
    ctx.host.textureRegistry.getTextureHandle(another);
    expect(adapter.usageBytes()).toBe(24);
    lease.release(); controller.dispose();
    ordinary.dispose(); another.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    ctx.device.dispose();
  });

  it("charges ordinary fallback textures and releases the charge with native storage", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const fallback = ctx.host.textureRegistry.getFallbackTextureHandle();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(4);
    expect(ctx.host.textureRegistry.getFallbackTextureHandle()).toBe(fallback);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(4);
    ctx.host.textureRegistry.disposeFallbackTextures();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(4);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(0);
    await vi.runAllTimersAsync();
    expect(ctx.calls.filter((call) => call.name === "deleteTexture").map((call) => call.args[0])).toEqual([fallback]);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });

  it("keeps a failed internal fallback upload charged until cleanup completes", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice({ maxBytes: 4 });
    ctx.failUpload(true);
    expect(() => ctx.host.textureRegistry.getFallbackTextureHandle()).toThrow(/upload failed/);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(4);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(0);
    ctx.failUpload(false);
    expect(() => ctx.host.textureRegistry.getFallbackTextureHandle()).toThrow(/budget/);
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(1);
    ctx.host.textureRegistry.getFallbackTextureHandle();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(4);
    ctx.host.textureRegistry.disposeFallbackTextures();
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });

  it("uses real explicit fallback and mip uploads, device-local lookup and actual sampler binds", async () => {
    vi.useFakeTimers();
    const a = makeDevice(), b = makeDevice();
    const src = source("rgba8", { srgb: true });
    const aa = a.device.createTextureResidencyAdapter(), bb = b.device.createTextureResidencyAdapter();
    aa.prepare(src, { maxBytes: 200, generation: aa.generation() });
    bb.prepare(src, { maxBytes: 200, generation: bb.generation() });
    const first = a.host.textureRegistry.getTextureHandle(src.texture);
    expect(first).not.toBe(b.host.textureRegistry.getTextureHandle(src.texture));
    const fallbackUpload = a.calls.find((call) => call.name === "texImage2D")!;
    expect(fallbackUpload.args.slice(3, 7)).toEqual([a.gl.SRGB8_ALPHA8, 1, 1, 0]);
    expect([...fallbackUpload.args[9] as Uint8Array]).toEqual([128, 128, 255, 255]);
    const levels = await mipLevels(src, 2);
    const pending = aa.allocate(src, levels, { maxBytes: 200, signal: signal() });
    expect(aa.usageBytes()).toBe(24); // 4 byte fallback + 2x2 and 1x1 mip storage
    expect(a.device.getDiagnostics().textureBytes).toBe(24);
    const resident = await pending;
    expect(resident.bytes).toBe(20);
    expect(a.calls.filter((call) => call.name === "texImage2D").slice(1).map((call) => [call.args[2], call.args[4], call.args[5]])).toEqual([[0, 2, 2], [1, 1, 1]]);
    aa.publish(src.texture, resident.allocation, aa.generation());
    a.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "baseColor", texture: src.texture }), 0, "sampler2D");
    expect(a.calls.filter((call) => call.name === "bindTexture").at(-1)?.args[1]).toBe(resident.allocation.handle);
    expect(b.host.textureRegistry.getTextureHandle(src.texture)).not.toBe(resident.allocation.handle);
    aa.publish(src.texture, null, aa.generation());
    expect(a.host.textureRegistry.getTextureHandle(src.texture)).toBe(first);
    const retirement = aa.retire(resident.allocation);
    expect(aa.usageBytes()).toBe(24);
    await vi.runAllTimersAsync(); await retirement;
    expect(aa.usageBytes()).toBe(4);
    const fallbackRetirement = aa.unprepare(src, aa.generation());
    await vi.runAllTimersAsync(); await fallbackRetirement;
    expect(aa.usageBytes()).toBe(0);
    const bRetirement = bb.unprepare(src, bb.generation());
    await vi.runAllTimersAsync(); await bRetirement;
    a.device.dispose(); b.device.dispose();
  });

  it("rejects incompatible provided shadow and comparison bindings before changing GL state", async () => {
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const src = source();
    adapter.prepare(src, { maxBytes: 100, generation: adapter.generation() });
    const compare = new Sampler({ compare: "less-equal" });
    const color = new TextureBinding({ name: "color", texture: src.texture, sampler: compare });
    const before = ctx.calls.length;
    expect(() => ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, color, 2, "sampler2DShadow")).toThrow(/depth texture/);
    expect(ctx.calls).toHaveLength(before);
    const depth = new Texture({ width: 1, height: 1, format: "depth24", renderAttachment: true });
    ctx.host.textureRegistry.textures.set(depth, {} as WebGLTexture);
    ctx.host.textureRegistry.textureUploadModes.set(depth, "depth-render-target");
    const raw = new TextureBinding({ name: "depth", texture: depth });
    const comparison = new TextureBinding({ name: "depth", texture: depth, sampler: compare });
    expect(() => ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, raw, 0, "sampler2DShadow")).toThrow(/comparison mode/);
    expect(() => ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, comparison, 0, "sampler2D")).toThrow(/comparison mode/);
    expect(ctx.calls).toHaveLength(before);
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, raw, 0, "sampler2D");
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, comparison, 0, "sampler2DShadow");
    expect(ctx.calls.some((call) => call.name === "samplerParameteri" && call.args[1] === ctx.gl.TEXTURE_COMPARE_MODE && call.args[2] === ctx.gl.COMPARE_REF_TO_TEXTURE)).toBe(true);
    ctx.device.dispose();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it("creates accounted depth fallbacks for absent shadow samplers and restores framebuffer and depth state", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), gl = ctx.gl;
    const previousDraw = {} as WebGLFramebuffer, previousRead = {} as WebGLFramebuffer;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDraw); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousRead);
    gl.enable(gl.SCISSOR_TEST); gl.enable(gl.RASTERIZER_DISCARD);
    gl.depthMask(false); gl.clearDepth(0.25);
    const fallback = new TextureBinding({ name: "missing shadow", required: false });
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, fallback, 1, "sampler2DShadow");
    expect(ctx.calls.filter((call) => call.name === "texImage2D").at(-1)?.args.slice(2, 7)).toEqual([0, gl.DEPTH_COMPONENT16, 1, 1, 0]);
    expect(ctx.calls.some((call) => call.name === "framebufferTexture2D" && call.args[1] === gl.DEPTH_ATTACHMENT)).toBe(true);
    expect(ctx.calls.some((call) => call.name === "clearDepth" && call.args[0] === 1)).toBe(true);
    expect(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)).toBe(previousDraw);
    expect(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)).toBe(previousRead);
    expect(gl.getParameter(gl.DEPTH_WRITEMASK)).toBe(false);
    expect(gl.getParameter(gl.DEPTH_CLEAR_VALUE)).toBe(0.25);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
    expect(gl.isEnabled(gl.RASTERIZER_DISCARD)).toBe(true);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(2);
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, fallback, 1, "35682");
    expect(ctx.calls.filter((call) => call.name === "texImage2D")).toHaveLength(1);
    const reverse = new TextureBinding({ name: "reverse shadow", sampler: new Sampler({ compare: "greater-equal" }) });
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, reverse, 2, "sampler2DShadow");
    expect(ctx.calls.some((call) => call.name === "clearDepth" && call.args[0] === 0)).toBe(true);
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "cube shadow" }), 3, "samplerCubeShadow");
    ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "array shadow" }), 4, "36292");
    expect(ctx.calls.filter((call) => call.name === "texImage2D")).toHaveLength(8);
    expect(ctx.calls.filter((call) => call.name === "texImage3D")).toHaveLength(1);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(18);
    ctx.device.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(18);
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
  });

  it("fences failed shadow-fallback storage and restores state when its framebuffer is incomplete", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), gl = ctx.gl;
    const previous = {} as WebGLFramebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
    gl.enable(gl.SCISSOR_TEST); gl.depthMask(false); gl.clearDepth(0.4);
    ctx.failFramebuffer(true);
    expect(() => ctx.host.samplers.uploadTextureUniform({} as WebGLUniformLocation, new TextureBinding({ name: "missing" }), 0, "sampler2DShadow")).toThrow(/incomplete/);
    expect(gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING)).toBe(previous);
    expect(gl.getParameter(gl.READ_FRAMEBUFFER_BINDING)).toBe(previous);
    expect(gl.getParameter(gl.DEPTH_WRITEMASK)).toBe(false);
    expect(gl.getParameter(gl.DEPTH_CLEAR_VALUE)).toBe(0.4);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(2);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(0);
    ctx.failFramebuffer(false);
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(1);
    ctx.device.dispose();
  });

  it("shares one logical allocation for consumers, enforces ordinary resources and changes budget without pinning old limits", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const adapter = ctx.device.createTextureResidencyAdapter();
    const ordinary = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    ctx.host.textureRegistry.getTextureHandle(ordinary);
    const src = source();
    const controller = new TextureResidencyController(adapter, { budgetBytes: 40 });
    const first = controller.acquire(src, { distanceMeters: 1 });
    const second = controller.acquire(src, { distanceMeters: 2 });
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(controller.snapshot()).toMatchObject({ usedBytes: 40, residentBytes: 20, entries: [{ consumers: 2, residentLevels: 2 }] });
    first.release();
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(controller.snapshot().entries[0]!.consumers).toBe(1);
    controller.setBudget(128);
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(controller.snapshot()).toMatchObject({ usedBytes: 104, residentBytes: 84, entries: [{ residentLevels: 3 }] });
    controller.setBudget(24);
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(controller.snapshot().residentBytes).toBe(4);
    controller.setBudget(128);
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(controller.snapshot().residentBytes).toBe(84);
    second.release();
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    ordinary.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    controller.dispose(); ctx.device.dispose();
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
  });

  it("holds failed or unavailable fences without blocking another retirement, and cleans before loss observers", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const a = source(), b = source();
    adapter.prepare(a, { maxBytes: 100, generation: adapter.generation() });
    adapter.prepare(b, { maxBytes: 100, generation: adapter.generation() });
    const x = await adapter.allocate(a, await mipLevels(a, 1), { maxBytes: 100, signal: signal() });
    const y = await adapter.allocate(b, await mipLevels(b, 1), { maxBytes: 100, signal: signal() });
    ctx.setNoFence(true);
    let completed = false;
    void adapter.retire(x.allocation).then(() => { completed = true; });
    ctx.setNoFence(false);
    const done = adapter.retire(y.allocation);
    await vi.runAllTimersAsync(); await done;
    expect(completed).toBe(false);
    expect(adapter.usageBytes()).toBe(12); // two fallbacks plus failed fence
    let seen = -1;
    adapter.onDeviceLost(() => { seen = adapter.usageBytes(); });
    ctx.lose();
    await Promise.resolve();
    expect(completed).toBe(true);
    expect(seen).toBe(0);
    ctx.restore();
    expect(() => ctx.host.textureRegistry.getTextureHandle(a.texture)).toThrow(/prepared again/);
    expect(() => adapter.publish(a.texture, x.allocation, 0)).toThrow(/stale|lost/);
    ctx.failUpload(true);
    expect(() => adapter.prepare(a, { maxBytes: 100, generation: adapter.generation() })).toThrow(/upload failed/);
    expect(adapter.usageBytes()).toBe(4);
    await vi.runAllTimersAsync();
    expect(adapter.usageBytes()).toBe(0);
    expect(() => ctx.host.textureRegistry.getTextureHandle(a.texture)).toThrow(/prepared again/);
    ctx.failUpload(false);
    adapter.prepare(a, { maxBytes: 100, generation: adapter.generation() });
    expect(ctx.host.textureRegistry.getTextureHandle(a.texture)).not.toBe(x.allocation.handle);
    ctx.device.dispose();
  });

  it("keeps ordinary texture bytes after a failed fence and after dispose until actual context loss", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const first = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    const firstHandle = ctx.host.textureRegistry.getTextureHandle(first);
    ctx.setWait("TIMEOUT_EXPIRED");
    first.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    await vi.advanceTimersByTimeAsync(0);
    ctx.setWait("WAIT_FAILED");
    await vi.advanceTimersByTimeAsync(8);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    const second = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const secondHandle = ctx.host.textureRegistry.getTextureHandle(second);
    ctx.setWait("ALREADY_SIGNALED");
    second.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture").map((call) => call.args[0])).toContain(secondHandle);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture").map((call) => call.args[0])).not.toContain(firstHandle);
    ctx.device.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    ctx.lose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
  });

  it("does not treat device disposal as completion of active streamed work", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter(), src = source();
    adapter.prepare(src, { maxBytes: 100, generation: adapter.generation() });
    const resident = await adapter.allocate(src, await mipLevels(src, 1), { maxBytes: 100, signal: signal() });
    adapter.publish(src.texture, resident.allocation, adapter.generation());
    let lossNotices = 0;
    adapter.onDeviceLost(() => { expect(adapter.usageBytes()).toBe(0); lossNotices += 1; });
    ctx.setWait("TIMEOUT_EXPIRED");
    ctx.device.dispose();
    expect(adapter.usageBytes()).toBe(8);
    expect(lossNotices).toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    ctx.setWait("ALREADY_SIGNALED");
    await vi.advanceTimersByTimeAsync(8);
    await Promise.resolve();
    expect(adapter.usageBytes()).toBe(0);
    expect(lossNotices).toBe(1);
  });

  it("keeps a controller lease unreleased until device-disposal fences actually finish", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const controller = new TextureResidencyController(adapter, { budgetBytes: 200 });
    const lease = controller.acquire(source(), { distanceMeters: 1 });
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(88);
    ctx.setWait("TIMEOUT_EXPIRED");
    ctx.device.dispose();
    lease.release();
    let released = false;
    const completion = lease.whenReleased().then(() => { released = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(released).toBe(false);
    expect(adapter.usageBytes()).toBe(88);
    ctx.setWait("ALREADY_SIGNALED");
    await vi.advanceTimersByTimeAsync(8); await completion;
    expect(released).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose();
  });

  it("retains the charge when native deletion reports a GL error after a signaled fence", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice();
    const texture = new Texture({ width: 2, height: 2, data: new Uint8Array(16), generateMipmaps: false });
    ctx.host.textureRegistry.getTextureHandle(texture);
    ctx.failDelete(true);
    texture.dispose(); ctx.host.textureRegistry.releaseDisposedTextureHandles();
    await vi.runAllTimersAsync();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    ctx.failDelete(false);
    ctx.device.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(16);
    ctx.lose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
  });

  it("delays a failed uploaded allocation's rejection until its cleanup fence or loss", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const first = source(), second = source();
    adapter.prepare(first, { maxBytes: 100, generation: adapter.generation() });
    adapter.prepare(second, { maxBytes: 100, generation: adapter.generation() });
    ctx.setNoFence(true); ctx.failUpload(true);
    let rejected = false;
    const failed = adapter.allocate(first, await mipLevels(first, 1), { maxBytes: 100, signal: signal() })
      .catch(() => { rejected = true; });
    await Promise.resolve();
    expect(rejected).toBe(false);
    expect(adapter.usageBytes()).toBe(12); // two fallbacks and partially uploaded storage
    ctx.setNoFence(false); ctx.failUpload(false);
    const other = await adapter.allocate(second, await mipLevels(second, 1), { maxBytes: 100, signal: signal() });
    const retired = adapter.retire(other.allocation);
    await vi.runAllTimersAsync(); await retired;
    expect(rejected).toBe(false);
    expect(adapter.usageBytes()).toBe(12);
    ctx.lose(); await failed;
    expect(rejected).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
    ctx.device.dispose();
  });

  it("keeps a WAIT_FAILED charge until context loss while another fence completes", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const a = source(), b = source();
    adapter.prepare(a, { maxBytes: 100, generation: adapter.generation() });
    adapter.prepare(b, { maxBytes: 100, generation: adapter.generation() });
    const one = await adapter.allocate(a, await mipLevels(a, 1), { maxBytes: 100, signal: signal() });
    const two = await adapter.allocate(b, await mipLevels(b, 1), { maxBytes: 100, signal: signal() });
    ctx.setWait("WAIT_FAILED");
    let settled = false;
    void adapter.retire(one.allocation).then(() => { settled = true; });
    await vi.runAllTimersAsync();
    expect(settled).toBe(false);
    ctx.setWait("ALREADY_SIGNALED");
    const other = adapter.retire(two.allocation);
    await vi.runAllTimersAsync(); await other;
    expect(adapter.usageBytes()).toBe(12);
    ctx.lose(); await Promise.resolve();
    expect(settled).toBe(true);
    expect(adapter.usageBytes()).toBe(0);
    ctx.device.dispose();
  });

  it("uses explicitly chosen fallback components in the logical sample format", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice({ floatLinear: true }), adapter = ctx.device.createTextureResidencyAdapter();
    const red = source("r32f", { fallback: [128, 0, 0, 255] });
    const half = source("rgba16f", { fallback: [0, 128, 255, 255] });
    const invalidRed = source("r32f", { fallback: [128, 128, 0, 255] });
    expect(() => adapter.prepare(invalidRed, { maxBytes: 100, generation: adapter.generation() })).toThrow(/zero green and blue/);
    adapter.prepare(red, { maxBytes: 100, generation: adapter.generation() });
    adapter.prepare(half, { maxBytes: 100, generation: adapter.generation() });
    const uploads = ctx.calls.filter((call) => call.name === "texImage2D");
    expect(uploads[0]!.args[3]).toBe(ctx.gl.R32F);
    expect(Array.from(uploads[0]!.args[9] as Float32Array)[0]).toBeCloseTo(128 / 255);
    expect(uploads[1]!.args[3]).toBe(ctx.gl.RGBA16F);
    expect([...uploads[1]!.args[9] as Uint16Array]).toEqual([0, 0x3804, 0x3c00, 0x3c00]);
    expect(adapter.usageBytes()).toBe(12);
    const a = adapter.unprepare(red, adapter.generation()), b = adapter.unprepare(half, adapter.generation());
    await vi.runAllTimersAsync(); await Promise.all([a, b]);
    expect(adapter.usageBytes()).toBe(0);
    ctx.device.dispose();
  });

  it("continues other consumers when a cancelled mip loader ignores abort", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const slowBase = source(), fast = source();
    let finish: ((result: { value: WebGL2ResidencyMip; release(): void }) => void) | undefined;
    const slow = { ...slowBase, loadMip: () => new Promise<{ value: WebGL2ResidencyMip; release(): void }>((resolve) => { finish = resolve; }) };
    const controller = new TextureResidencyController(adapter, { budgetBytes: 200 });
    const slowLease = controller.acquire(slow, { distanceMeters: 1 });
    const fastLease = controller.acquire(fast, { distanceMeters: 2 });
    await vi.runAllTimersAsync();
    expect(finish).toBeDefined();
    slowLease.release();
    await vi.runAllTimersAsync();
    expect(controller.snapshot().entries.find((entry) => entry.texture === fast.texture)?.residentLevels).toBe(3);
    finish!({ value: { data: new Uint8Array(4) }, release() {} });
    await vi.runAllTimersAsync();
    fastLease.release();
    await vi.runAllTimersAsync(); await controller.whenSettled();
    expect(adapter.usageBytes()).toBe(0);
    controller.dispose(); ctx.device.dispose();
  });

  it("rejects stale sampled content while still allowing its native leases to retire", async () => {
    vi.useFakeTimers();
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const src = source();
    adapter.prepare(src, { maxBytes: 100, generation: adapter.generation() });
    const resident = await adapter.allocate(src, await mipLevels(src, 1), { maxBytes: 100, signal: signal() });
    adapter.publish(src.texture, resident.allocation, adapter.generation());
    src.texture.updateMip(0, new Uint8Array(64));
    expect(() => ctx.host.textureRegistry.getTextureHandle(src.texture)).toThrow(/content changes/);
    expect(() => adapter.estimate(src, 1)).toThrow(/content/);
    adapter.publish(src.texture, null, adapter.generation());
    const retired = adapter.retire(resident.allocation);
    await vi.runAllTimersAsync(); await retired;
    const fallback = adapter.unprepare(src, adapter.generation());
    await vi.runAllTimersAsync(); await fallback;
    expect(adapter.usageBytes()).toBe(0);
    ctx.device.dispose();
  });

  it("reserves exact compressed fallback bytes, rejects malformed data and rolls back native failures", async () => {
    const ctx = makeDevice({ compressed: true });
    const adapter = ctx.device.createTextureResidencyAdapter();
    const rgb = source("bc1-rgb-unorm");
    adapter.prepare(rgb, { maxBytes: 200, generation: adapter.generation() });
    expect(adapter.estimate(rgb, 2)).toBe(20); // BC1 RGB always uses decoded RGBA here.
    const selected = await adapter.allocate(rgb, await mipLevels(rgb, 2), { maxBytes: 24, signal: signal() });
    expect(selected.bytes).toBe(20);
    adapter.publish(rgb.texture, selected.allocation, adapter.generation());
    expect(ctx.device.getDiagnostics()).toMatchObject({ textures: 1, textureBytes: 24, textureFallbacks: 1, textureFallbackBytes: 20 });
    adapter.publish(rgb.texture, null, adapter.generation());
    expect(ctx.calls.filter((call) => call.name === "compressedTexImage2D")).toHaveLength(0);
    expect(await adapter.allocate(rgb, [{ level: 2, value: { data: new Uint8Array(8) } }], { maxBytes: 200, signal: signal() }).then(() => false, () => true)).toBe(true);
    ctx.failUpload(true);
    await expect(adapter.allocate(rgb, await mipLevels(rgb, 1), { maxBytes: 200, signal: signal() })).rejects.toThrow(/upload failed/);
    expect(adapter.usageBytes()).toBe(24);
    ctx.failUpload(false);
    const rgba = source("bc1-rgba-unorm");
    adapter.prepare(rgba, { maxBytes: 200, generation: adapter.generation() });
    expect(adapter.estimate(rgba, 2)).toBe(16);
    const native = await adapter.allocate(rgba, await mipLevels(rgba, 2), { maxBytes: 200, signal: signal() });
    expect(ctx.calls.filter((call) => call.name === "compressedTexImage2D")).toHaveLength(2);
    expect(native.bytes).toBe(16);
    ctx.device.dispose();
    expect(adapter.usageBytes()).toBe(44);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(adapter.usageBytes()).toBe(0);
  });

  it("rejects already uploaded, unsupported, aborted and over-budget work without replacing a binding", async () => {
    const ctx = makeDevice(), adapter = ctx.device.createTextureResidencyAdapter();
    const src = source();
    ctx.host.textureRegistry.getTextureHandle(src.texture);
    expect(() => adapter.prepare(src, { maxBytes: 300, generation: adapter.generation() })).toThrow(/ordinary WebGL upload/);
    expect(adapter.usageBytes()).toBe(84);
    const other = source();
    expect(() => adapter.prepare(other, { maxBytes: 86, generation: adapter.generation() })).toThrow(/budget/);
    expect(adapter.usageBytes()).toBe(84);
    adapter.prepare(other, { maxBytes: 100, generation: adapter.generation() });
    const fallback = ctx.host.textureRegistry.getTextureHandle(other.texture);
    const aborted = new AbortController(); aborted.abort();
    await expect(adapter.allocate(other, await mipLevels(other, 1), { maxBytes: 100, signal: aborted.signal })).rejects.toBeDefined();
    await expect(adapter.allocate(other, await mipLevels(other, 2), { maxBytes: 100, signal: signal() })).rejects.toThrow(/budget/);
    expect(ctx.host.textureRegistry.getTextureHandle(other.texture)).toBe(fallback);
    expect(adapter.usageBytes()).toBe(88);
    const array = { ...source(), texture: new Texture({ width: 4, height: 4, dimension: "2d-array", layers: 2, mipLevelCount: 3 }) };
    expect(() => adapter.prepare(array, { maxBytes: 500, generation: adapter.generation() })).toThrow(/sampled 2D/);
    ctx.device.dispose();
  });
});
