import { describe, expect, it, vi } from "vitest";
import { WebGL2Device, webGL2MaxTextureSize, type WebGL2RenderTarget } from "../../../packages/rendering/src/WebGL2Device";
import type { RenderCommandState } from "../../../packages/rendering/src/RenderDevice";

/** A WebGL-shaped recorder. These tests verify calls and ownership, not pixels. */
function makeDevice(options: { canvasStencil?: boolean; externalStencil?: boolean } = {}) {
  const constants = new Map<string, number>([["NO_ERROR", 0], ["NONE", 0], ["COLOR_BUFFER_BIT", 0x4000], ["DEPTH_BUFFER_BIT", 0x0100], ["STENCIL_BUFFER_BIT", 0x0400]]);
  const c = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  type Call = { name: string; args: unknown[] };
  const calls: Call[] = [];
  const deleted: Record<string, unknown[]> = { Texture: [], Framebuffer: [], Renderbuffer: [], Buffer: [] };
  const enabled = new Set<number>();
  const textureBindings = new Map<number, unknown>();
  let id = 0, activeTexture = c("TEXTURE0"), mask = 0xff, stencilClear = 0;
  let framebuffer: unknown = null, readFramebuffer: unknown = null, renderbuffer: unknown = null;
  let contextOptions: WebGLContextAttributes | undefined;
  let failCheck = false;
  let failFramebufferAllocation = false;
  const record = (name: string) => (...args: unknown[]) => calls.push({ name, args });
  const overrides: Record<string, unknown> = {
    getError: () => 0,
    fenceSync: () => ({ id: ++id, kind: "Sync" }), clientWaitSync: () => c("ALREADY_SIGNALED"), flush: () => {}, deleteSync: () => {},
    getContextAttributes: () => ({ stencil: options.canvasStencil !== false }),
    getExtension: () => null,
    getParameter: (name: number) => {
      if (name === c("MAX_SAMPLES")) return 4;
      if (name === c("MAX_VERTEX_ATTRIBS")) return 16;
      if (name === c("STENCIL_BITS")) return options.externalStencil ? 8 : 0;
      if (name === c("ACTIVE_TEXTURE")) return activeTexture;
      if (name === c("TEXTURE_BINDING_2D")) return textureBindings.get(c("TEXTURE_2D")) ?? null;
      if (name === c("TEXTURE_BINDING_CUBE_MAP")) return textureBindings.get(c("TEXTURE_CUBE_MAP")) ?? null;
      if (name === c("TEXTURE_BINDING_2D_ARRAY")) return textureBindings.get(c("TEXTURE_2D_ARRAY")) ?? null;
      if (name === c("FRAMEBUFFER_BINDING") || name === c("DRAW_FRAMEBUFFER_BINDING")) return framebuffer;
      if (name === c("READ_FRAMEBUFFER_BINDING")) return readFramebuffer;
      if (name === c("RENDERBUFFER_BINDING")) return renderbuffer;
      return 0;
    },
    createFramebuffer: () => failFramebufferAllocation ? null : { id: ++id, kind: "Framebuffer" },
    checkFramebufferStatus: () => failCheck ? 0 : c("FRAMEBUFFER_COMPLETE"),
    bindFramebuffer: (target: number, value: unknown) => {
      calls.push({ name: "bindFramebuffer", args: [target, value] });
      if (target === c("FRAMEBUFFER")) framebuffer = readFramebuffer = value;
      else if (target === c("DRAW_FRAMEBUFFER")) framebuffer = value;
      else if (target === c("READ_FRAMEBUFFER")) readFramebuffer = value;
    },
    bindRenderbuffer: (_target: number, value: unknown) => { renderbuffer = value; },
    bindTexture: (target: number, value: unknown) => { textureBindings.set(target, value); },
    activeTexture: (value: number) => { activeTexture = value; },
    enable: (cap: number) => { enabled.add(cap); calls.push({ name: "enable", args: [cap] }); },
    disable: (cap: number) => { enabled.delete(cap); calls.push({ name: "disable", args: [cap] }); },
    isEnabled: (cap: number) => enabled.has(cap),
    stencilMask: (value: number) => { mask = value; calls.push({ name: "stencilMask", args: [value] }); },
    clearStencil: (value: number) => { stencilClear = value; calls.push({ name: "clearStencil", args: [value] }); },
    clear: (bits: number) => calls.push({ name: "clear", args: [bits, framebuffer, mask, stencilClear, enabled.has(c("SCISSOR_TEST"))] }),
    renderbufferStorage: record("renderbufferStorage"),
    renderbufferStorageMultisample: record("renderbufferStorageMultisample"),
    framebufferRenderbuffer: record("framebufferRenderbuffer"),
    framebufferTexture2D: record("framebufferTexture2D"),
    framebufferTextureLayer: record("framebufferTextureLayer"),
    texImage2D: record("texImage2D"),
    texImage3D: record("texImage3D"),
    texStorage2D: record("texStorage2D"),
    stencilFunc: record("stencilFunc"),
    stencilOp: record("stencilOp"),
    clearBufferfv: record("clearBufferfv"),
    blitFramebuffer: record("blitFramebuffer")
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in overrides) return overrides[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    if (name.startsWith("create")) return () => ({ id: ++id, kind: name.slice(6) });
    if (name.startsWith("delete")) return (value: unknown) => { deleted[name.slice(6)]?.push(value); };
    return () => undefined;
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: (_type: string, attributes: WebGLContextAttributes) => { contextOptions = attributes; return gl; }, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  return { device, gl, c, calls, deleted, getContextOptions: () => contextOptions,
    failFramebufferCheck: () => { failCheck = true; }, failFramebufferCreation: () => { failFramebufferAllocation = true; },
    binding: () => ({ framebuffer, readFramebuffer, renderbuffer, activeTexture,
      textures: [textureBindings.get(c("TEXTURE_2D")) ?? null, textureBindings.get(c("TEXTURE_CUBE_MAP")) ?? null, textureBindings.get(c("TEXTURE_2D_ARRAY")) ?? null] }) };
}

const base: RenderCommandState = { depthTest: false, depthWrite: false, cullMode: "none", blend: false, depthCompare: "always" };
const drainRetirements = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("WebGL2 stencil-capable render targets", () => {
  it("reports persistent viewport or external framebuffer overrides without issuing GL calls", () => {
    const { device, calls } = makeDevice();
    device.beginFrame(16, 16);
    expect(device.hasDefaultOutputOverride()).toBe(false);
    device.setViewport(0, 0, 8, 8);
    expect(device.hasDefaultOutputOverride()).toBe(false);
    device.setViewport(0, 0, 8, 8, { persistent: true });
    const before = calls.length;
    expect(device.hasDefaultOutputOverride()).toBe(true);
    expect(calls).toHaveLength(before);
    device.resetViewport();
    expect(device.hasDefaultOutputOverride()).toBe(false);
    device.setExternalFramebuffer({} as WebGLFramebuffer, 16, 16);
    expect(device.hasDefaultOutputOverride()).toBe(true);
    device.setExternalFramebuffer(null, 16, 16);
    expect(device.hasDefaultOutputOverride()).toBe(false);
    device.endFrame(); device.dispose();
  });

  it("requests a stencil canvas and initializes a new packed renderbuffer exactly once", () => {
    const { device, gl, c, calls, getContextOptions } = makeDevice();
    expect(getContextOptions()?.stencil).toBe(true);
    const target = device.createRenderTarget({ width: 64, height: 64, format: "rgba8", depth: true }) as WebGL2RenderTarget;
    expect(target.hasStencil).toBe(true);
    expect(calls).toContainEqual({ name: "renderbufferStorage", args: [gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, 64, 64] });
    expect(calls).toContainEqual({ name: "framebufferRenderbuffer", args: [gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, target.depthHandle] });
    device.beginFrame(64, 64);
    device.setScissor(0, 0, 2, 2); device.setScissorTest(true);
    device.setRenderTarget(target);
    const initialized = calls.filter((call) => call.name === "clear" && call.args[0] === c("STENCIL_BUFFER_BIT"));
    expect(initialized).toEqual([{ name: "clear", args: [c("STENCIL_BUFFER_BIT"), target.drawFramebuffer, 0xffffffff, 0, false] }]);
    device.setRenderTarget(null); device.setRenderTarget(target);
    expect(calls.filter((call) => call.name === "clear" && call.args[0] === c("STENCIL_BUFFER_BIT"))).toHaveLength(1);
    device.endFrame(); device.dispose();
  });

  it("applies actual stencil state, clears every stencil bit through a masked draw, and restores the draw mask", () => {
    const { device, gl, calls } = makeDevice();
    const target = device.createRenderTarget({ width: 8, height: 8, depth: true });
    const vertexBuffer = device.createBuffer("vertex", 24);
    const stencil = { compare: "always", reference: 3, readMask: 0x38, writeMask: 0x05, fail: "zero", depthFail: "invert", depthPass: "replace" } as const;
    const draw = () => device.draw({ topology: "triangles", vertexBuffer, vertexCount: 3, renderState: { ...base, stencil, scissor: { x: 0, y: 0, width: 4, height: 8 } } });
    device.beginFrame(8, 8); device.setRenderTarget(target); draw();
    expect(calls).toContainEqual({ name: "stencilFunc", args: [gl.ALWAYS, 3, 0x38] });
    expect(calls).toContainEqual({ name: "stencilOp", args: [gl.ZERO, gl.INVERT, gl.REPLACE] });
    device.clear([0, 0, 0, 1]);
    const clear = calls.filter((call) => call.name === "clear").at(-1)!;
    expect(clear.args).toEqual([gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT, (target as WebGL2RenderTarget).drawFramebuffer, 0xffffffff, 0, true]);
    draw();
    expect(calls.filter((call) => call.name === "stencilMask").map((call) => call.args[0])).toEqual([0xffffffff, 0x05, 0xffffffff, 0x05]);
    device.endFrame(); device.dispose();
  });

  it("keeps attachment-specific MRT clears color-only and full clears reset stencil", () => {
    const { device, gl, calls } = makeDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }] });
    device.beginFrame(4, 4); device.setRenderTarget(target);
    const before = calls.filter((call) => call.name === "clear").length;
    device.clearRenderTarget([0.25, 0.5, 0.75, 1], 1);
    expect(calls.filter((call) => call.name === "clear")).toHaveLength(before);
    expect(calls.find((call) => call.name === "clearBufferfv")?.args.slice(0, 2)).toEqual([gl.COLOR, 1]);
    device.clearRenderTarget([0, 0, 0, 1]);
    expect(calls.filter((call) => call.name === "clear").at(-1)?.args[0]).toBe(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    device.endFrame(); device.dispose();
  });

  it("maps the supported comparisons and operations to the corresponding WebGL enums", () => {
    const { device, gl, calls } = makeDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, depth: true });
    const vertexBuffer = device.createBuffer("vertex", 24);
    const cases = [
      ["never", gl.NEVER, "keep", gl.KEEP], ["less", gl.LESS, "zero", gl.ZERO],
      ["less-equal", gl.LEQUAL, "replace", gl.REPLACE], ["greater", gl.GREATER, "increment", gl.INCR],
      ["greater-equal", gl.GEQUAL, "decrement", gl.DECR], ["equal", gl.EQUAL, "invert", gl.INVERT],
      ["not-equal", gl.NOTEQUAL, "increment-wrap", gl.INCR_WRAP], ["always", gl.ALWAYS, "decrement-wrap", gl.DECR_WRAP]
    ] as const;
    device.beginFrame(4, 4); device.setRenderTarget(target);
    for (const [compare, compareEnum, operation, operationEnum] of cases) {
      device.draw({ topology: "triangles", vertexBuffer, vertexCount: 3,
        renderState: { ...base, stencil: { compare, reference: 3, fail: operation, depthFail: operation, depthPass: operation } } });
      expect(calls.filter((call) => call.name === "stencilFunc").at(-1)?.args).toEqual([compareEnum, 3, 0xff]);
      expect(calls.filter((call) => call.name === "stencilOp").at(-1)?.args).toEqual([operationEnum, operationEnum, operationEnum]);
    }
    device.endFrame(); device.dispose();
  });

  it("requests stencil even when the texture-size probe creates the canvas context first", () => {
    vi.stubGlobal("WebGL2RenderingContext", { MAX_TEXTURE_SIZE: 0x0d33 });
    try {
      let attributes: WebGLContextAttributes | undefined;
      const canvas = { getContext: (_type: string, options: WebGLContextAttributes) => {
        attributes = options;
        return { getParameter: () => 4096 };
      } } as unknown as HTMLCanvasElement;
      expect(webGL2MaxTextureSize(canvas)).toBe(4096);
      expect(attributes?.stencil).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports missing stencil for color-only, canvas, and external framebuffers", () => {
    const { device, gl, calls } = makeDevice({ canvasStencil: false, externalStencil: false });
    const vertexBuffer = device.createBuffer("vertex", 24);
    const command = { topology: "triangles", vertexBuffer, vertexCount: 3, renderState: { ...base, stencil: {} } } as const;
    const draw = () => device.draw(command);
    const colorOnly = device.createRenderTarget({ width: 4, height: 4, depth: false });
    device.beginFrame(4, 4);
    for (const target of [colorOnly, null]) {
      device.setRenderTarget(target);
      const before = calls.length;
      device.clear([0, 0, 0, 1]);
      expect(calls.slice(before).filter((call) => call.name === "clear").at(-1)?.args[0]).toBe(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      expect(() => draw()).toThrow(/requires a stencil attachment/);
      expect(() => device.multiDrawElementsInstanced([command])).toThrow(/requires a stencil attachment/);
    }
    device.setExternalFramebuffer({} as WebGLFramebuffer, 4, 4);
    expect(() => draw()).toThrow(/requires a stencil attachment/);
    // A canvas without stencil still supports independently allocated packed targets.
    const packed = device.createRenderTarget({ width: 4, height: 4, depth: true });
    device.setRenderTarget(packed);
    expect(() => draw()).not.toThrow();
    expect(() => device.multiDrawElementsInstanced([command])).not.toThrow();
    device.endFrame(); device.dispose();
  });

  it("uses a matching sampleable packed depth format for shadow targets and depth copies", async () => {
    const { device, gl, calls } = makeDevice();
    const shadow = device.createRenderTarget({ width: 4, height: 4, depthOnly: true, depthCompare: true }) as WebGL2RenderTarget;
    const color = device.createRenderTarget({ width: 4, height: 4, depth: "texture" }) as WebGL2RenderTarget;
    expect(shadow.depthTexture?.format).toBe("depth24");
    expect(shadow.hasStencil).toBe(true);
    expect(calls).toContainEqual({ name: "texImage2D", args: [gl.TEXTURE_2D, 0, gl.DEPTH24_STENCIL8, 4, 4, 0, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null] });
    expect(calls).toContainEqual({ name: "framebufferTexture2D", args: [gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.TEXTURE_2D, shadow.depthTextureHandle, 0] });
    await device.copyRenderTarget({ source: shadow, destination: color, aspect: "depth" });
    expect(calls.filter((call) => call.name === "blitFramebuffer").at(-1)?.args[8]).toBe(gl.DEPTH_BUFFER_BIT);
    device.dispose();
  });

  it("checks the actual external framebuffer rather than the canvas context attributes", () => {
    const { device } = makeDevice({ canvasStencil: false, externalStencil: true });
    const vertexBuffer = device.createBuffer("vertex", 24);
    device.setExternalFramebuffer({} as WebGLFramebuffer, 4, 4);
    device.beginFrame(4, 4);
    expect(() => device.draw({ topology: "triangles", vertexBuffer, vertexCount: 3, renderState: { ...base, stencil: {} } })).not.toThrow();
    device.endFrame(); device.dispose();
  });

  it("uses matching packed formats for multisample depth textures, retains the draw binding, and releases owned handles once", async () => {
    const { device, gl, calls, deleted } = makeDevice();
    const target = device.createRenderTarget({ width: 8, height: 6, depth: "texture", sampleCount: 4 }) as WebGL2RenderTarget;
    expect(target.depthTexture?.format).toBe("depth24");
    expect(calls).toContainEqual({ name: "texImage2D", args: [gl.TEXTURE_2D, 0, gl.DEPTH24_STENCIL8, 8, 6, 0, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null] });
    expect(calls).toContainEqual({ name: "renderbufferStorageMultisample", args: [gl.RENDERBUFFER, 4, gl.DEPTH24_STENCIL8, 8, 6] });
    device.setRenderTarget(target); device.beginFrame(8, 6);
    expect(calls.filter((call) => call.name === "bindFramebuffer").at(-1)?.args).toEqual([gl.FRAMEBUFFER, target.drawFramebuffer]);
    device.clear([0, 0, 0, 1]); device.setRenderTarget(null); device.endFrame();
    expect(calls.filter((call) => call.name === "blitFramebuffer").at(-1)?.args[8]).toBe(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    target.dispose(); target.dispose();
    expect(deleted.Texture).not.toContain(target.depthTextureHandle);
    await drainRetirements();
    expect(deleted.Texture.filter((handle) => handle === target.depthTextureHandle)).toHaveLength(1);
    expect(deleted.Renderbuffer.filter((handle) => handle === target.depthHandle)).toHaveLength(1);
    const replacement = device.createRenderTarget({ width: 16, height: 12, depth: true }) as WebGL2RenderTarget;
    expect(calls).toContainEqual({ name: "renderbufferStorage", args: [gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, 16, 12] });
    expect(replacement.depthHandle).not.toBe(target.depthHandle);
    device.dispose();
  });

  it("resolves a multisample color attachment after an attachment-specific clear", () => {
    const { device, gl, calls } = makeDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, sampleCount: 4, depth: false });
    device.beginFrame(4, 4); device.setRenderTarget(target);
    device.clearRenderTarget([0.2, 0.4, 0.6, 1], 0);
    device.setRenderTarget(null); device.endFrame();
    expect(calls.filter((call) => call.name === "blitFramebuffer").at(-1)?.args[8]).toBe(gl.COLOR_BUFFER_BIT);
    device.dispose();
  });

  it.each(["cube", "2d-array"] as const)("initializes each %s layer once and keeps its shared attachment owned by the parent", async (dimension) => {
    const { device, gl, calls, deleted } = makeDevice();
    const target = device.createRenderTarget({ width: 4, height: 4, dimension, ...(dimension === "2d-array" ? { layers: 2 } : {}) }) as WebGL2RenderTarget;
    const layers = target.layerTargets!;
    expect(layers.length).toBe(dimension === "cube" ? 6 : 2);
    expect(target.hasStencil).toBe(true);
    if (dimension === "cube") expect(calls).toContainEqual({ name: "texStorage2D", args: [gl.TEXTURE_CUBE_MAP, 1, gl.DEPTH24_STENCIL8, 4, 4] });
    else expect(calls).toContainEqual({ name: "texImage3D", args: [gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH24_STENCIL8, 4, 4, 2, 0, gl.DEPTH_STENCIL, gl.UNSIGNED_INT_24_8, null] });
    device.beginFrame(4, 4);
    device.setRenderTarget(target); device.setRenderTarget(layers[0]!); device.setRenderTarget(layers[1]!);
    expect(calls.filter((call) => call.name === "clear" && call.args[0] === gl.STENCIL_BUFFER_BIT)).toHaveLength(2);
    layers[1]!.dispose();
    expect(deleted.Texture).not.toContain(target.depthTextureHandle);
    target.dispose(); target.dispose();
    expect(deleted.Texture).not.toContain(target.depthTextureHandle);
    await drainRetirements();
    expect(deleted.Texture.filter((handle) => handle === target.depthTextureHandle)).toHaveLength(1);
    device.endFrame(); device.dispose();
  });

  it("fails unsupported framebuffer configurations without leaking resources or bindings", async () => {
    const { device, gl, calls, deleted, binding, failFramebufferCheck } = makeDevice();
    const previousFramebuffer = {}, previousRenderbuffer = {}, previousTexture = {};
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer as WebGLFramebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer as WebGLRenderbuffer);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture as WebGLTexture);
    const before = binding();
    failFramebufferCheck();
    expect(() => device.createRenderTarget({ width: 4, height: 4, colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }] })).toThrow(/framebuffer status is invalid/);
    expect(binding()).toEqual(before);
    expect(deleted.Framebuffer).toHaveLength(1);
    expect(deleted.Renderbuffer).toHaveLength(1);
    expect(deleted.Texture).toHaveLength(0);
    await drainRetirements();
    expect(deleted.Texture).toHaveLength(2);
    expect(calls.some((call) => call.name === "renderbufferStorage" && call.args[1] === gl.DEPTH24_STENCIL8)).toBe(true);
    device.dispose();
  });

  it("cleans up when framebuffer allocation fails after a feature target's renderbuffer allocation", async () => {
    const { device, deleted, failFramebufferCreation } = makeDevice();
    failFramebufferCreation();
    expect(() => device.createRenderTarget({ width: 4, height: 4, colorAttachments: [{ format: "rgba8" }, { format: "rgba8" }] })).toThrow(/Failed to allocate/);
    expect(deleted.Renderbuffer).toHaveLength(1);
    expect(deleted.Texture).toHaveLength(0);
    await drainRetirements();
    expect(deleted.Texture).toHaveLength(2);
    device.dispose();
  });

  it("releases both multisample and resolve resources if the packed framebuffer is unsupported", async () => {
    const { device, gl, deleted, binding, failFramebufferCheck } = makeDevice();
    const previousFramebuffer = {}, previousRenderbuffer = {}, previousTexture = {};
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer as WebGLFramebuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer as WebGLRenderbuffer);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture as WebGLTexture);
    const before = binding();
    failFramebufferCheck();
    expect(() => device.createRenderTarget({ width: 4, height: 4, sampleCount: 4, depth: "texture" })).toThrow(/framebuffer status is invalid/);
    expect(binding()).toEqual(before);
    expect(deleted.Framebuffer).toHaveLength(2);
    expect(deleted.Renderbuffer).toHaveLength(2);
    expect(deleted.Texture).toHaveLength(0);
    await drainRetirements();
    expect(deleted.Texture).toHaveLength(2);
    device.dispose();
  });
});
