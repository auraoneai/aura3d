import { describe, expect, it } from "vitest";
import { WebGL2Device, type WebGL2RenderTarget } from "../../../packages/rendering/src/WebGL2Device";

/** A stateful WebGL double; no browser or GPU is started by these tests. */
function makeDevice(options: { floatBlend?: boolean } = {}) {
  const constants = new Map<string, number>();
  const c = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  let id = 0;
  let read: unknown = null, draw: unknown = null, renderbuffer: unknown = null;
  let viewport = [0, 0, 1, 1], scissor = [0, 0, 1, 1], colorMask = [true, true, true, true], depthMask = true;
  let activeTexture = c("TEXTURE0"), program: unknown = null, vao: unknown = null;
  const textures = new Map<number, unknown>(), samplers = new Map<number, unknown>(), enabled = new Set<number>();
  const deletedTextures: unknown[] = [], deletedRenderbuffers: unknown[] = [], deletedPrograms: unknown[] = [], deletedVaos: unknown[] = [];
  const calls: { name: string; args: unknown[] }[] = [];
  const shaderSources: string[] = [];
  const events = new Map<string, (event: Event) => void>();
  let incompleteIn = 0;
  const state = () => ({ read, draw, viewport: [...viewport], scissor: [...scissor], colorMask: [...colorMask], depthMask,
    activeTexture, program, vao, enabled: [...enabled].sort((a, b) => a - b), texture0: textures.get(c("TEXTURE0")) ?? null, sampler0: samplers.get(0) ?? null });
  const overrides: Record<string, unknown> = {
    NO_ERROR: 0, NONE: 0, INVALID_INDEX: 0xffffffff,
    getError: () => 0,
    getExtension: (name: string) => name === "EXT_float_blend" && options.floatBlend === false ? null : {},
    getParameter: (name: number) => {
      if (name === c("MAX_SAMPLES")) return 4;
      if (name === c("MAX_VERTEX_ATTRIBS")) return 16;
      if (name === c("READ_FRAMEBUFFER_BINDING")) return read;
      if (name === c("DRAW_FRAMEBUFFER_BINDING") || name === c("FRAMEBUFFER_BINDING")) return draw;
      if (name === c("RENDERBUFFER_BINDING")) return renderbuffer;
      if (name === c("VIEWPORT")) return [...viewport];
      if (name === c("SCISSOR_BOX")) return [...scissor];
      if (name === c("COLOR_WRITEMASK")) return [...colorMask];
      if (name === c("DEPTH_WRITEMASK")) return depthMask;
      if (name === c("CURRENT_PROGRAM")) return program;
      if (name === c("VERTEX_ARRAY_BINDING")) return vao;
      if (name === c("ACTIVE_TEXTURE")) return activeTexture;
      if (name === c("TEXTURE_BINDING_2D")) return textures.get(activeTexture) ?? null;
      if (name === c("SAMPLER_BINDING")) return samplers.get(activeTexture - c("TEXTURE0")) ?? null;
      return 0;
    },
    bindFramebuffer: (target: number, value: unknown) => {
      calls.push({ name: "bindFramebuffer", args: [target, value] });
      if (target === c("FRAMEBUFFER")) read = draw = value;
      else if (target === c("READ_FRAMEBUFFER")) read = value;
      else if (target === c("DRAW_FRAMEBUFFER")) draw = value;
    },
    bindRenderbuffer: (_target: number, value: unknown) => { renderbuffer = value; },
    framebufferRenderbuffer: (...args: unknown[]) => calls.push({ name: "framebufferRenderbuffer", args }),
    framebufferTexture2D: (...args: unknown[]) => calls.push({ name: "framebufferTexture2D", args }),
    checkFramebufferStatus: () => incompleteIn > 0 && --incompleteIn === 0 ? 0 : c("FRAMEBUFFER_COMPLETE"),
    activeTexture: (value: number) => { activeTexture = value; },
    bindTexture: (_target: number, value: unknown) => { textures.set(activeTexture, value); },
    bindSampler: (index: number, value: unknown) => { samplers.set(index, value); },
    viewport: (...args: number[]) => { viewport = args; },
    scissor: (...args: number[]) => { scissor = args; },
    colorMask: (...args: boolean[]) => { colorMask = args; },
    depthMask: (value: boolean) => { depthMask = value; },
    enable: (cap: number) => { enabled.add(cap); },
    disable: (cap: number) => { enabled.delete(cap); },
    isEnabled: (cap: number) => enabled.has(cap),
    useProgram: (value: unknown) => { program = value; },
    bindVertexArray: (value: unknown) => { vao = value; },
    shaderSource: (_shader: unknown, source: string) => shaderSources.push(source),
    getShaderParameter: () => true,
    getProgramParameter: (_program: unknown, property: number) => property === c("LINK_STATUS") ? true : 0,
    getUniformBlockIndex: () => 0xffffffff,
    getUniformLocation: (_program: unknown, name: string) => name,
    uniform1i: (name: string, value: number) => calls.push({ name: "uniform1i", args: [name, value] }),
    drawArrays: (...args: unknown[]) => calls.push({ name: "drawArrays", args: [state(), ...args] }),
    deleteTexture: (value: unknown) => deletedTextures.push(value),
    deleteRenderbuffer: (value: unknown) => deletedRenderbuffers.push(value),
    deleteProgram: (value: unknown) => deletedPrograms.push(value),
    deleteVertexArray: (value: unknown) => deletedVaos.push(value)
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in overrides) return overrides[name];
    if (/^[A-Z0-9_]+$/.test(name)) return c(name);
    if (name.startsWith("create")) return () => ({ id: ++id, kind: name });
    return () => undefined;
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: () => gl, addEventListener: (name: string, listener: (event: Event) => void) => events.set(name, listener), removeEventListener: (name: string) => events.delete(name) } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  return { device, gl, c, calls, state, shaderSources, deletedTextures, deletedRenderbuffers, deletedPrograms, deletedVaos, events,
    failFramebufferCheckIn: (checks: number) => { incompleteIn = checks; } };
}

function scene(device: WebGL2Device, options: { sampleCount?: number; depth?: boolean | "texture"; format?: "rgba8" | "rgba16f" | "rgba32f" } = {}): WebGL2RenderTarget {
  return device.createRenderTarget({ width: 16, height: 12, format: options.format ?? "rgba16f", depth: options.depth ?? true, sampleCount: options.sampleCount ?? 1 }) as WebGL2RenderTarget;
}

describe("WebGL2 Gaussian splat color surfaces", () => {
  it("transfers exact texels inside the current view and restores GL state", () => {
    const { device, gl, c, calls, state, shaderSources, deletedPrograms, deletedVaos } = makeDevice();
    const target = scene(device);
    device.beginFrame(16, 12);
    device.setRenderTarget(target);
    device.setViewport(2, 1, 10, 8);
    device.setScissor(4, 0, 5, 5);
    device.setScissorTest(true);
    // A previous material draw may have left a different actual GL scissor.
    // The next splat uses the device view scissor regardless of that state.
    gl.scissor(0, 0, 1, 1);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.colorMask(false, true, false, true);
    gl.depthMask(true);
    const original = state();
    const adapter = device.createGaussianSplatColorAdapter();
    const scratch = adapter.createScratch(target);
    expect(scratch.byteLength).toBe(16 * 12 * 16);
    expect(state()).toEqual(original);
    adapter.transfer(target, scratch, true, "linear-to-srgb", "premultiplied");
    expect(state()).toEqual(original);
    const first = calls.filter((call) => call.name === "drawArrays").at(-1)!;
    const drawState = first.args[0] as ReturnType<typeof state>;
    expect(drawState.draw).not.toBe(target.framebuffer);
    expect(drawState.viewport).toEqual([0, 0, 16, 12]);
    expect(drawState.scissor).toEqual([4, 1, 5, 4]);
    expect(drawState.enabled).toContain(c("SCISSOR_TEST"));
    expect(drawState.enabled).not.toContain(c("BLEND"));
    expect(drawState.enabled).not.toContain(c("DEPTH_TEST"));
    expect(drawState.texture0).toBe(target.colorHandle);
    expect(calls).toContainEqual({ name: "uniform1i", args: ["u_encode", 1] });
    expect(calls).toContainEqual({ name: "uniform1i", args: ["u_premultiplied", 1] });
    expect(shaderSources.join("\n")).toContain("texelFetch(u_source, ivec2(gl_FragCoord.xy), 0)");
    adapter.transfer(target, scratch, false, "srgb-to-linear", "independent");
    expect(state()).toEqual(original);
    expect(calls).toContainEqual({ name: "uniform1i", args: ["u_encode", 0] });
    expect(calls).toContainEqual({ name: "uniform1i", args: ["u_premultiplied", 0] });
    scratch.dispose(); adapter.dispose();
    expect(deletedPrograms).toHaveLength(1);
    expect(deletedVaos).toHaveLength(1);
    device.endFrame(); device.dispose();
  });

  it("borrows and detaches the original depth, retains the raster view, and restores on exceptions", () => {
    for (const depth of [true, "texture"] as const) {
      const { device, c, calls, state, deletedRenderbuffers, deletedTextures } = makeDevice();
      const target = scene(device, { depth });
      device.beginFrame(16, 12); device.setRenderTarget(target);
      device.setViewport(2, 3, 8, 7); device.setScissor(3, 4, 5, 4); device.setScissorTest(true);
      const adapter = device.createGaussianSplatColorAdapter();
      const scratch = adapter.createScratch(target);
      const before = state();
      const depthHandle = target.depthHandle ?? target.depthTextureHandle;
      const vertexBuffer = device.createBuffer("vertex", 24);
      adapter.drawToScratch(target, scratch, () => {
        device.draw({ topology: "triangles", vertexBuffer, vertexCount: 3, renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true } });
      });
      const nativeDraw = calls.filter((call) => call.name === "drawArrays").at(-1)!;
      expect((nativeDraw.args[0] as ReturnType<typeof state>).depthMask).toBe(false);
      expect((nativeDraw.args[0] as ReturnType<typeof state>).enabled).toContain(c("DEPTH_TEST"));
      expect((nativeDraw.args[0] as ReturnType<typeof state>).enabled).toContain(c("SCISSOR_TEST"));
      expect((nativeDraw.args[0] as ReturnType<typeof state>).scissor).toEqual([3, 4, 5, 4]);
      const sentinel = new Error("draw failed");
      expect(() => adapter.drawToScratch(target, scratch, () => {
        expect(device.getRenderTarget()).not.toBe(target);
        expect(state().viewport).toEqual(before.viewport);
        expect(state().scissor).toEqual(before.scissor);
        expect(() => device.clear([0, 0, 0, 0])).toThrow(/borrowed target/);
        expect(() => device.setRenderTarget(target)).toThrow(/borrowed target/);
        expect(() => device.setViewport(0, 0, 1, 1)).toThrow(/borrowed target/);
        expect(() => scratch.dispose()).toThrow(/during its draw/);
        expect(() => device.draw({ topology: "triangles", vertexBuffer, vertexCount: 3, renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: false } })).toThrow(/cannot write/);
        throw sentinel;
      })).toThrow(sentinel);
      expect(device.getRenderTarget()).toBe(target);
      expect(state().read).toBe(before.read);
      expect(state().draw).toBe(before.draw);
      expect(state().viewport).toEqual(before.viewport);
      expect(state().scissor).toEqual(before.scissor);
      const attachmentCalls = calls.filter((call) => call.name === (depth === true ? "framebufferRenderbuffer" : "framebufferTexture2D") && call.args[1] === c("DEPTH_ATTACHMENT"));
      expect(attachmentCalls.some((call) => call.args[3] === depthHandle)).toBe(true);
      expect(attachmentCalls.at(-1)?.args[3]).toBeNull();
      scratch.dispose(); adapter.dispose();
      expect(deletedRenderbuffers).not.toContain(depthHandle);
      expect(deletedTextures).not.toContain(depthHandle);
      expect(target.disposed).toBe(false);
      vertexBuffer.dispose();
      device.endFrame(); device.dispose();
    }
  });

  it("fails before drawing on unsupported target, sample count, float blending or stale scratch", () => {
    const { device, calls } = makeDevice({ floatBlend: false });
    const target = scene(device), multisample = scene(device, { sampleCount: 4 }), ldr = scene(device, { format: "rgba8" }), noDepth = scene(device, { depth: false });
    device.beginFrame(16, 12); device.setRenderTarget(target);
    const adapter = device.createGaussianSplatColorAdapter();
    expect(() => adapter.createScratch(target)).toThrow(/renderable and blendable RGBA32F/);
    device.setRenderTarget(multisample);
    expect(() => adapter.createScratch(multisample)).toThrow(/multisample/);
    device.setRenderTarget(ldr);
    expect(() => adapter.createScratch(ldr)).toThrow(/floating-point/);
    device.setRenderTarget(noDepth);
    expect(() => adapter.createScratch(noDepth)).toThrow(/depth attachment/);
    device.setRenderTarget(null);
    expect(() => adapter.createScratch(null as never)).toThrow(/active, live/);
    expect(calls.filter((call) => call.name === "drawArrays")).toHaveLength(0);
    adapter.dispose(); device.endFrame(); device.dispose();

    const next = makeDevice(), first = scene(next.device), other = scene(next.device);
    next.device.beginFrame(16, 12); next.device.setRenderTarget(first);
    const secondAdapter = next.device.createGaussianSplatColorAdapter(), scratch = secondAdapter.createScratch(first);
    next.device.setRenderTarget(other);
    expect(() => secondAdapter.transfer(other, scratch, true, "linear-to-srgb", "independent")).toThrow(/not live for this scene/);
    scratch.dispose(); next.device.setRenderTarget(first);
    expect(() => secondAdapter.transfer(first, scratch, true, "linear-to-srgb", "independent")).toThrow(/not live for this scene/);
    secondAdapter.dispose(); next.device.endFrame(); next.device.dispose();
  });

  it("cleans failed framebuffer allocations and retires resources on context loss", () => {
    const { device, state, failFramebufferCheckIn, deletedTextures, events } = makeDevice();
    const target = scene(device);
    device.beginFrame(16, 12); device.setRenderTarget(target);
    const adapter = device.createGaussianSplatColorAdapter();
    const before = state();
    // Scratch color allocation is complete; attaching the borrowed depth fails.
    failFramebufferCheckIn(2);
    expect(() => adapter.createScratch(target)).toThrow(/color and borrowed depth attachments are incompatible/);
    expect(state().draw).toBe(before.draw);
    expect(deletedTextures).not.toContain(target.colorHandle);
    const scratch = adapter.createScratch(target);
    events.get("webglcontextlost")!({ preventDefault() {} } as Event);
    expect(scratch.disposed).toBe(true);
    expect(target.disposed).toBe(false);
    adapter.dispose(); device.dispose();
  });
});
