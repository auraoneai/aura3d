import { describe, expect, it, vi } from "vitest";
import type { DrawCommand } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { textureBudgetReport } from "../../../packages/rendering/src/textures/TextureBudget";

function makeDevice(options: { maxBytes?: number; floatColor?: boolean; floatLinear?: boolean } = {}) {
  const values = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0]]);
  const c = (name: string) => { if (!values.has(name)) values.set(name, 0x2000 + values.size); return values.get(name)!; };
  const calls: { name: string; args: unknown[] }[] = [];
  const bindings = new Map<number, unknown>();
  const listeners = new Map<string, EventListener>();
  let id = 0, active = c("TEXTURE0"), framebuffer: unknown = null, renderbuffer: unknown = null, error = 0, failGenerate = false, failUpload = false;
  let lost = false;
  let waitStatus = c("ALREADY_SIGNALED"), noFence = false;
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const methods: Record<string, unknown> = {
    getError: () => { const result = error; error = 0; return result; },
    getExtension: (name: string) => name === "EXT_color_buffer_float" && options.floatColor || name === "OES_texture_float_linear" && options.floatLinear ? {} : null,
    getParameter: (name: number) => {
      if (name === c("MAX_SAMPLES")) return 4;
      if (name === c("MAX_VERTEX_ATTRIBS") || name === c("MAX_TEXTURE_IMAGE_UNITS")) return 16;
      if (name === c("ACTIVE_TEXTURE")) return active;
      if (name === c("TEXTURE_BINDING_2D")) return bindings.get(active) ?? null;
      if (name === c("FRAMEBUFFER_BINDING")) return framebuffer;
      if (name === c("RENDERBUFFER_BINDING")) return renderbuffer;
      return 0;
    },
    isContextLost: () => lost,
    createTexture: () => ({ id: ++id, kind: "texture" }), createFramebuffer: () => ({ id: ++id, kind: "framebuffer" }),
    createRenderbuffer: () => ({ id: ++id, kind: "renderbuffer" }),
    fenceSync: () => noFence ? null : ({ id: ++id, kind: "sync" }), clientWaitSync: () => waitStatus, flush: () => {}, deleteSync: () => {},
    deleteTexture: record("deleteTexture"), deleteFramebuffer: record("deleteFramebuffer"), deleteRenderbuffer: record("deleteRenderbuffer"),
    bindTexture: (target: number, handle: unknown) => { bindings.set(active, handle); calls.push({ name: "bindTexture", args: [active, target, handle] }); },
    activeTexture: (unit: number) => { active = unit; },
    bindFramebuffer: (_target: number, handle: unknown) => { framebuffer = handle; },
    bindRenderbuffer: (_target: number, handle: unknown) => { renderbuffer = handle; },
    texParameteri: record("texParameteri"),
    texStorage2D: record("texStorage2D"), texStorage3D: record("texStorage3D"), texImage3D: record("texImage3D"), drawBuffers: record("drawBuffers"), readBuffer: record("readBuffer"),
    texImage2D: (...args: unknown[]) => { calls.push({ name: "texImage2D", args }); if (failUpload) error = 0x505; },
    framebufferTexture2D: record("framebufferTexture2D"), framebufferRenderbuffer: record("framebufferRenderbuffer"),
    renderbufferStorage: record("renderbufferStorage"), checkFramebufferStatus: () => c("FRAMEBUFFER_COMPLETE"),
    generateMipmap: (...args: unknown[]) => { calls.push({ name: "generateMipmap", args: [bindings.get(active), ...args] }); if (failGenerate) error = 0x502; },
    deleteProgram: record("deleteProgram"), deleteVertexArray: record("deleteVertexArray"), deleteSampler: record("deleteSampler")
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in methods) return methods[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    throw new Error(`Unexpected WebGL call: ${name}`);
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: () => gl, addEventListener(name: string, listener: EventListener) { listeners.set(name, listener); }, removeEventListener(name: string) { listeners.delete(name); } } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas, ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  return { gl, device, calls, setGenerateFailure: (fail: boolean) => { failGenerate = fail; }, setUploadFailure: (fail: boolean) => { failUpload = fail; }, setError: (value: number) => { error = value; }, getActive: () => active, getBinding: (unit: number) => bindings.get(unit) ?? null,
    setWait: (name: string) => { waitStatus = c(name); }, setNoFence: (value: boolean) => { noFence = value; },
    lose: () => { lost = true; listeners.get("webglcontextlost")?.({ preventDefault() {} } as Event); },
    restore: () => { lost = false; listeners.get("webglcontextrestored")?.({} as Event); } };
}

const drainRetirements = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("WebGL transmission capture mip storage", () => {
  it("allocates each requested level, charges it exactly, and generates while restoring the caller's bindings", async () => {
    const { device, gl, calls, getActive, getBinding } = makeDevice();
    const target = device.createRenderTarget({ width: 8, height: 4, depth: false, mipLevelCount: 3 });
    expect(target.colorTexture.mipLevelCount).toBe(3);
    expect(textureBudgetReport(device).textureBytes).toBe(168);
    expect(calls.filter((call) => call.name === "texImage2D").map((call) => [call.args[1], call.args[3], call.args[4]])).toEqual([[0, 8, 4], [1, 4, 2], [2, 2, 1]]);
    expect(calls).toContainEqual({ name: "texParameteri", args: [gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 2] });
    const previous0 = {} as WebGLTexture, previous2 = {} as WebGLTexture;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, previous0);
    gl.activeTexture(gl.TEXTURE0 + 2); gl.bindTexture(gl.TEXTURE_2D, previous2);
    device.generateRenderTargetMipmaps(target);
    expect(calls.filter((call) => call.name === "generateMipmap").at(-1)?.args).toEqual([(target as unknown as { colorHandle: WebGLTexture }).colorHandle, gl.TEXTURE_2D]);
    expect(getActive()).toBe(gl.TEXTURE0 + 2);
    expect(getBinding(gl.TEXTURE0)).toBe(previous0);
    expect(getBinding(gl.TEXTURE0 + 2)).toBe(previous2);
    target.dispose();
    expect(textureBudgetReport(device).textureBytes).toBe(168);
    await drainRetirements();
    expect(textureBudgetReport(device).textureBytes).toBe(0);
    device.dispose();
  });

  it("rejects unsupported requests and never submits native storage past the device budget", () => {
    const ctx = makeDevice({ maxBytes: 80 });
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 })).toThrow(/budget/);
    expect(ctx.calls.some((call) => call.name === "texImage2D")).toBe(false);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 4 })).toThrow(/mipLevelCount/);
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 2, sampleCount: 4 })).toThrow(/single-sample/);
    const float = makeDevice({ floatColor: true });
    expect(() => float.device.createRenderTarget({ width: 4, height: 4, depth: false, format: "rgba32f", mipLevelCount: 2 })).toThrow(/OES_texture_float_linear/);
    float.device.dispose(); ctx.device.dispose();
  });

  it("accounts ordinary color, layered, MRT and sampleable depth textures in the shared ledger", async () => {
    const ctx = makeDevice({ floatColor: true });
    const plain = ctx.device.createRenderTarget({ width: 4, height: 4, depth: "texture" });
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(128);
    const cube = ctx.device.createRenderTarget({ width: 2, height: 2, dimension: "cube", depth: "texture" });
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(128 + 192);
    const mrt = ctx.device.createRenderTarget({ width: 2, height: 2, depth: "texture", colorAttachments: [{ format: "rgba8" }, { format: "rgba16f" }] });
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(128 + 192 + 64);
    plain.dispose(); cube.dispose(); mrt.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(384);
    await drainRetirements();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.device.dispose();
  });

  it("enforces an active streaming admission ceiling on render-target allocations", async () => {
    const ctx = makeDevice();
    const limit = ctx.device.createTextureResidencyAdapter().acquireBudgetLimit(80);
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 })).toThrow(/budget/);
    expect(ctx.calls.filter((call) => call.name === "texImage2D")).toHaveLength(0);
    limit.setLimit(84);
    const target = ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 });
    limit.setLimit(4);
    target.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(84);
    await drainRetirements();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    limit.release(); ctx.device.dispose();
  });

  it("retains previous bindings and reports upload, generation and capture errors", async () => {
    const ctx = makeDevice();
    ctx.setUploadFailure(true);
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 })).toThrow(/framebuffer status is invalid/);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(84);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(0);
    ctx.setUploadFailure(false);
    await drainRetirements();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(1);
    const target = ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 });
    const previous = {} as WebGLTexture;
    ctx.gl.activeTexture(ctx.gl.TEXTURE0); ctx.gl.bindTexture(ctx.gl.TEXTURE_2D, previous);
    ctx.setGenerateFailure(true);
    expect(() => ctx.device.generateRenderTargetMipmaps(target)).toThrow(/generation failed/);
    expect(ctx.getBinding(ctx.gl.TEXTURE0)).toBe(previous);
    vi.spyOn(ctx.device, "draw").mockImplementation(() => {});
    ctx.setError(0x502);
    expect(() => ctx.device.drawTransmissionCapture({} as DrawCommand)).toThrow(/capture draw failed/);
    target.dispose(); ctx.device.dispose();
  });

  it("rejects generation on a different device, an active target, or a target with no mip storage", () => {
    const a = makeDevice(), b = makeDevice();
    const target = a.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 2 });
    const plain = a.device.createRenderTarget({ width: 4, height: 4, depth: false });
    expect(() => b.device.generateRenderTargetMipmaps(target)).toThrow(/another device/);
    expect(() => a.device.generateRenderTargetMipmaps(plain)).toThrow(/cannot generate/);
    target.dispose(); plain.dispose(); a.device.dispose(); b.device.dispose();
  });

  it("invalidates target charges and refuses old-generation mip storage after a context loss", () => {
    const ctx = makeDevice();
    const old = ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 });
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(84);
    ctx.lose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    ctx.restore();
    expect(() => ctx.device.generateRenderTargetMipmaps(old)).toThrow(/another device/);
    const current = ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 });
    ctx.device.generateRenderTargetMipmaps(current);
    old.dispose(); current.dispose(); ctx.device.dispose();
  });

  it("retains target attachment charges through device disposal when a fence is unavailable", () => {
    const ctx = makeDevice();
    const target = ctx.device.createRenderTarget({ width: 4, height: 4, depth: "texture" });
    const initialDeletes = ctx.calls.filter((call) => call.name === "deleteTexture").length;
    ctx.setNoFence(true);
    target.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(128);
    ctx.device.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(128);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(initialDeletes);
    ctx.lose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(initialDeletes);
  });

  it("keeps a failed target allocation charged if its cleanup fence is unavailable", () => {
    const ctx = makeDevice({ maxBytes: 84 });
    ctx.setNoFence(true); ctx.setUploadFailure(true);
    expect(() => ctx.device.createRenderTarget({ width: 4, height: 4, depth: false, mipLevelCount: 3 })).toThrow(/framebuffer status is invalid/);
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(84);
    ctx.setUploadFailure(false);
    expect(() => ctx.device.createRenderTarget({ width: 1, height: 1, depth: false })).toThrow(/budget/);
    expect(ctx.calls.filter((call) => call.name === "deleteTexture")).toHaveLength(0);
    ctx.device.dispose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(84);
    ctx.lose();
    expect(textureBudgetReport(ctx.device).textureBytes).toBe(0);
  });
});
