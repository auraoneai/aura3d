import { describe, expect, it } from "vitest";
import { WebGL2Device, type WebGL2RenderTarget } from "../../../packages/rendering/src/WebGL2Device";

/** WebGL-shaped state recorder: exercises source behavior, not real GPU pixels. */
function fixture() {
  const constants = new Map<string, number>([
    ["NO_ERROR", 0], ["NONE", 0], ["COLOR_ATTACHMENT0", 0x8ce0], ["DRAW_BUFFER0", 0x8825],
    ["COLOR_BUFFER_BIT", 0x4000], ["DEPTH_BUFFER_BIT", 0x0100], ["STENCIL_BUFFER_BIT", 0x0400]
  ]);
  const constant = (name: string): number => {
    if (!constants.has(name)) constants.set(name, 0x1000 + constants.size);
    return constants.get(name)!;
  };
  type Handle = { id: number; kind: string };
  type Call = { name: string; args: unknown[] };
  const calls: Call[] = [];
  const deleted: Record<string, unknown[]> = { Texture: [], Renderbuffer: [], Framebuffer: [] };
  const draws = new Map<unknown, number[]>();
  const reads = new Map<unknown, number>();
  const textureBindings = new Map<number, unknown>();
  const enabled = new Set<number>();
  let nextId = 0;
  let drawFramebuffer: unknown = null;
  let readFramebuffer: unknown = null;
  let renderbuffer: unknown = null;
  let activeTexture = constant("TEXTURE0");
  let framebufferChecks = 0;
  let failFramebufferCheck = 0;
  let renderbufferAllocations = 0;
  let failRenderbufferAllocation = 0;
  let failBlitAt = 0;
  let blitCalls = 0;
  const create = (kind: string): Handle => ({ id: ++nextId, kind });
  const record = (name: string) => (...args: unknown[]) => { calls.push({ name, args }); };
  const overrides: Record<string, unknown> = {
    getError: () => 0,
    isContextLost: () => false,
    createRenderbuffer: () => ++renderbufferAllocations === failRenderbufferAllocation ? null : create("Renderbuffer"),
    getExtension: (name: string) => name === "EXT_color_buffer_float" ? {} : null,
    getContextAttributes: () => ({ stencil: true }),
    fenceSync: () => create("Sync"), clientWaitSync: () => constant("ALREADY_SIGNALED"), flush: () => {}, deleteSync: () => {},
    getParameter: (name: number) => {
      if (name === constant("MAX_SAMPLES")) return 4;
      if (name === constant("MAX_VERTEX_ATTRIBS")) return 16;
      if (name === constant("MAX_COLOR_ATTACHMENTS") || name === constant("MAX_DRAW_BUFFERS")) return 4;
      if (name === constant("ACTIVE_TEXTURE")) return activeTexture;
      if (name === constant("TEXTURE_BINDING_2D")) return textureBindings.get(constant("TEXTURE_2D")) ?? null;
      if (name === constant("TEXTURE_BINDING_CUBE_MAP")) return textureBindings.get(constant("TEXTURE_CUBE_MAP")) ?? null;
      if (name === constant("TEXTURE_BINDING_2D_ARRAY")) return textureBindings.get(constant("TEXTURE_2D_ARRAY")) ?? null;
      if (name === constant("FRAMEBUFFER_BINDING") || name === constant("DRAW_FRAMEBUFFER_BINDING")) return drawFramebuffer;
      if (name === constant("READ_FRAMEBUFFER_BINDING")) return readFramebuffer;
      if (name === constant("RENDERBUFFER_BINDING")) return renderbuffer;
      if (name === constant("READ_BUFFER")) return reads.get(readFramebuffer) ?? constant("COLOR_ATTACHMENT0");
      if (name >= constant("DRAW_BUFFER0") && name < constant("DRAW_BUFFER0") + 8) {
        return (draws.get(drawFramebuffer) ?? [constant("COLOR_ATTACHMENT0")])[name - constant("DRAW_BUFFER0")] ?? constant("NONE");
      }
      return 0;
    },
    bindFramebuffer: (target: number, value: unknown) => {
      calls.push({ name: "bindFramebuffer", args: [target, value] });
      if (target === constant("FRAMEBUFFER")) readFramebuffer = drawFramebuffer = value;
      else if (target === constant("READ_FRAMEBUFFER")) readFramebuffer = value;
      else if (target === constant("DRAW_FRAMEBUFFER")) drawFramebuffer = value;
    },
    bindRenderbuffer: (_target: number, value: unknown) => { renderbuffer = value; },
    bindTexture: (target: number, value: unknown) => { textureBindings.set(target, value); calls.push({ name: "bindTexture", args: [target, value] }); },
    activeTexture: (value: number) => { activeTexture = value; },
    drawBuffers: (values: number[]) => { draws.set(drawFramebuffer, [...values]); calls.push({ name: "drawBuffers", args: [drawFramebuffer, [...values]] }); },
    readBuffer: (value: number) => { reads.set(readFramebuffer, value); calls.push({ name: "readBuffer", args: [readFramebuffer, value] }); },
    enable: (capability: number) => { enabled.add(capability); },
    disable: (capability: number) => { enabled.delete(capability); },
    isEnabled: (capability: number) => enabled.has(capability),
    checkFramebufferStatus: () => ++framebufferChecks === failFramebufferCheck ? 0 : constant("FRAMEBUFFER_COMPLETE"),
    renderbufferStorageMultisample: (...args: unknown[]) => calls.push({ name: "storage", args: [renderbuffer, ...args] }),
    framebufferRenderbuffer: (...args: unknown[]) => calls.push({ name: "attach", args: [drawFramebuffer, ...args] }),
    blitFramebuffer: (...args: unknown[]) => {
      blitCalls += 1;
      calls.push({ name: "blit", args: [readFramebuffer, drawFramebuffer, reads.get(readFramebuffer), draws.get(drawFramebuffer), enabled.has(constant("SCISSOR_TEST")), ...args] });
      if (blitCalls === failBlitAt) throw new Error("injected blit failure");
    }
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in overrides) return overrides[name];
    if (/^[A-Z0-9_]+$/.test(name)) return constant(name);
    if (name.startsWith("create")) return () => create(name.slice(6));
    if (name.startsWith("delete")) return (value: unknown) => { deleted[name.slice(6)]?.push(value); };
    return record(name);
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: () => gl, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  return { device, gl, calls, deleted, draws, reads,
    setFailure: (check: number) => { failFramebufferCheck = framebufferChecks + check; },
    failRenderbufferAt: (offset: number) => { failRenderbufferAllocation = renderbufferAllocations + offset; },
    setBlitFailure: (offset: number) => { failBlitAt = blitCalls + offset; },
    bindings: () => ({ readFramebuffer, drawFramebuffer, renderbuffer, activeTexture }),
    resolve: (target: WebGL2RenderTarget) => (device as unknown as { resolveMultisampleTarget(target: WebGL2RenderTarget): void }).resolveMultisampleTarget(target)
  };
}

const drainRetirements = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const descriptor = { width: 8, height: 6, sampleCount: 4, depth: "texture", colorAttachments: [{ format: "rgba8" }, { format: "rgba16f" }] } as const;

describe("WebGL2 multisampled multiple-color targets", () => {
  it("allocates matching multisample attachments, resolves each once, and preserves state", async () => {
    const f = fixture();
    const { gl, device } = f;
    const beforeRead = {} as WebGLFramebuffer, beforeDraw = {} as WebGLFramebuffer;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, beforeRead); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, beforeDraw);
    const target = device.createRenderTarget(descriptor) as WebGL2RenderTarget;
    expect(f.bindings()).toMatchObject({ readFramebuffer: beforeRead, drawFramebuffer: beforeDraw });
    expect(target.sampleCount).toBe(4);
    expect(target.colorTextures?.map((texture) => texture.format)).toEqual(["rgba8", "rgba16f"]);
    expect(target.drawFramebuffer).not.toBe(target.framebuffer);
    const colorAttachments = f.calls.filter((call) => call.name === "attach" && call.args[0] === target.drawFramebuffer && [gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1].includes(call.args[2] as number));
    expect(colorAttachments).toHaveLength(2);
    expect(colorAttachments[0]!.args[4]).not.toBe(colorAttachments[1]!.args[4]);
    expect(f.calls.filter((call) => call.name === "storage").map((call) => call.args.slice(2, 5))).toEqual([
      [4, gl.DEPTH24_STENCIL8, 8], [4, gl.RGBA8, 8], [4, gl.RGBA16F, 8]
    ]);
    device.beginFrame(8, 6); device.setRenderTarget(target);
    device.clearRenderTarget([0.2, 0.3, 0.4, 1], 1);
    expect(target.needsResolve).toBe(true);
    gl.enable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, beforeRead); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, beforeDraw);
    f.resolve(target);
    const blits = f.calls.filter((call) => call.name === "blit");
    expect(blits).toHaveLength(2);
    expect(blits.map((call) => call.args.slice(0, 5))).toEqual([
      [target.drawFramebuffer, target.framebuffer, gl.COLOR_ATTACHMENT0, [gl.COLOR_ATTACHMENT0, gl.NONE], false],
      [target.drawFramebuffer, target.framebuffer, gl.COLOR_ATTACHMENT0 + 1, [gl.NONE, gl.COLOR_ATTACHMENT0 + 1], false]
    ]);
    expect(blits.map((call) => call.args[13])).toEqual([gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.COLOR_BUFFER_BIT]);
    expect(f.draws.get(target.framebuffer)).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1]);
    expect(f.reads.get(target.drawFramebuffer)).toBe(gl.COLOR_ATTACHMENT0);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
    expect(f.bindings()).toMatchObject({ readFramebuffer: beforeRead, drawFramebuffer: beforeDraw });
    expect(target.needsResolve).toBe(false);
    device.endFrame();
    const owned = [target.depthHandle, ...colorAttachments.map((call) => call.args[4])];
    target.dispose(); target.dispose();
    expect(owned.map((handle) => f.deleted.Renderbuffer.filter((item) => item === handle).length)).toEqual([1, 1, 1]);
    expect(f.deleted.Framebuffer.filter((item) => item === target.framebuffer || item === target.drawFramebuffer)).toHaveLength(2);
    await drainRetirements();
    expect(f.deleted.Texture).toHaveLength(3);
    device.dispose();
  });

  it("cleans every allocated handle and restores separate bindings after incomplete multisample storage", async () => {
    const f = fixture();
    const read = {} as WebGLFramebuffer, draw = {} as WebGLFramebuffer;
    f.gl.bindFramebuffer(f.gl.READ_FRAMEBUFFER, read); f.gl.bindFramebuffer(f.gl.DRAW_FRAMEBUFFER, draw);
    const previous = f.bindings();
    f.setFailure(2);
    expect(() => f.device.createRenderTarget(descriptor)).toThrow(/framebuffer status is invalid/);
    expect(f.bindings()).toEqual(previous);
    expect(f.deleted.Framebuffer).toHaveLength(2);
    expect(f.deleted.Renderbuffer).toHaveLength(3);
    await drainRetirements();
    expect(f.deleted.Texture).toHaveLength(3);
    f.device.dispose();
  });

  it("cleans partial allocations if a later color renderbuffer cannot be created", async () => {
    const f = fixture();
    f.failRenderbufferAt(2);
    expect(() => f.device.createRenderTarget({ ...descriptor, depth: false })).toThrow(/Failed to allocate/);
    expect(f.deleted.Framebuffer).toHaveLength(2);
    expect(f.deleted.Renderbuffer).toHaveLength(1);
    await drainRetirements();
    expect(f.deleted.Texture).toHaveLength(2);
    f.device.dispose();
  });

  it("supports resize by replacing the target and releases both sets of native resources", async () => {
    const f = fixture();
    const first = f.device.createRenderTarget({ ...descriptor, depth: false }) as WebGL2RenderTarget;
    const replacement = f.device.createRenderTarget({ ...descriptor, depth: false, width: 12, height: 10 }) as WebGL2RenderTarget;
    expect(replacement.drawFramebuffer).not.toBe(first.drawFramebuffer);
    expect(replacement.colorTextures?.map((texture) => [texture.width, texture.height])).toEqual([[12, 10], [12, 10]]);
    expect(f.calls.filter((call) => call.name === "storage").slice(-2).map((call) => call.args.slice(-2))).toEqual([[12, 10], [12, 10]]);
    first.dispose(); replacement.dispose();
    expect(f.deleted.Framebuffer).toHaveLength(4);
    expect(f.deleted.Renderbuffer).toHaveLength(4);
    await drainRetirements();
    expect(f.deleted.Texture).toHaveLength(4);
    f.device.dispose();
  });

  it("accounts for every resolved attachment and multisample renderbuffer without charging texture budget twice", () => {
    const f = fixture();
    const target = f.device.createRenderTarget(descriptor) as WebGL2RenderTarget;
    const diagnostics = f.device.getDiagnostics();
    expect(diagnostics.gpuTargets?.find((entry) => entry.label === target.label)?.bytes).toBe(3840);
    expect(diagnostics.textureBytes).toBe(768);
    target.dispose();
    expect(f.device.getDiagnostics().gpuTargets?.find((entry) => entry.label === target.label)).toBeUndefined();
    f.device.dispose();
  });

  it("accounts for shared layered target storage once in the target inventory", () => {
    const f = fixture();
    const target = f.device.createRenderTarget({ width: 4, height: 4, dimension: "2d-array", layers: 2, depth: "texture", label: "layered-target" }) as WebGL2RenderTarget;
    const entries = f.device.getDiagnostics().gpuTargets!.filter((entry) => entry.label.startsWith("layered-target"));
    expect(target.layerTargets).toHaveLength(2);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.bytes).toBe(4 * 4 * 2 * (4 + 4));
    f.device.dispose();
  });

  it("restores source, destination and scissor state after a failed resolve and allows retry", () => {
    const f = fixture();
    const { gl, device } = f;
    const target = device.createRenderTarget({ ...descriptor, depth: false }) as WebGL2RenderTarget;
    device.beginFrame(8, 6); device.setRenderTarget(target); device.clearRenderTarget([0, 0, 0, 1], 0);
    gl.enable(gl.SCISSOR_TEST);
    const read = {} as WebGLFramebuffer, draw = {} as WebGLFramebuffer;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw);
    f.setBlitFailure(2);
    expect(() => f.resolve(target)).toThrow(/injected blit failure/);
    expect(target.needsResolve).toBe(true);
    expect(f.bindings()).toMatchObject({ readFramebuffer: read, drawFramebuffer: draw });
    expect(f.draws.get(target.framebuffer)).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1]);
    expect(f.reads.get(target.drawFramebuffer)).toBe(gl.COLOR_ATTACHMENT0);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
    f.resolve(target);
    expect(target.needsResolve).toBe(false);
    device.endFrame(); device.dispose();
  });

  it("rejects multisample uploads before GL mutation and preserves every pending resolve", () => {
    const f = fixture();
    const { device } = f;
    const target = device.createRenderTarget(descriptor) as WebGL2RenderTarget;
    device.beginFrame(8, 6); device.setRenderTarget(target);
    device.clearRenderTarget([0.1, 0.2, 0.3, 1], 1);
    expect(target.needsResolve).toBe(true);
    const beforeCalls = f.calls.length;
    const beforeBindings = f.bindings();
    expect(() => device.writeRenderTargetPixels(target, new Uint8Array(8 * 6 * 4))).toThrow(/multisampled.*unsupported/);
    expect(f.calls).toHaveLength(beforeCalls);
    expect(f.bindings()).toEqual(beforeBindings);
    expect(target.needsResolve).toBe(true);
    device.setRenderTarget(null);
    expect(f.calls.filter((call) => call.name === "blit")).toHaveLength(2);
    expect(target.needsResolve).toBe(false);
    device.endFrame(); device.dispose();
  });

  it("still uploads a single-sampled color target", () => {
    const f = fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false }) as WebGL2RenderTarget;
    f.device.writeRenderTargetPixels(target, new Uint8Array(2 * 2 * 4));
    expect(f.calls.filter((call) => call.name === "texSubImage2D")).toHaveLength(1);
    f.device.dispose();
  });

  it("resolves on target switch with renderbuffer depth and supports a selected attachment copy", async () => {
    const f = fixture();
    const { gl, device } = f;
    const source = device.createRenderTarget({ ...descriptor, depth: true }) as WebGL2RenderTarget;
    const destination = device.createRenderTarget({ ...descriptor, depth: false, sampleCount: 1 }) as WebGL2RenderTarget;
    const depthAttachments = f.calls.filter((call) => call.name === "attach" && call.args[2] === gl.DEPTH_STENCIL_ATTACHMENT);
    expect(depthAttachments.map((call) => call.args[0])).toEqual([source.drawFramebuffer]);
    device.beginFrame(8, 6); device.setRenderTarget(source);
    device.clearRenderTarget([0.1, 0.2, 0.3, 1], 1);
    device.setRenderTarget(null);
    const automaticBlits = f.calls.filter((call) => call.name === "blit");
    expect(automaticBlits).toHaveLength(2);
    expect(automaticBlits.map((call) => call.args[13])).toEqual([gl.COLOR_BUFFER_BIT, gl.COLOR_BUFFER_BIT]);
    expect(source.needsResolve).toBe(false);
    gl.enable(gl.SCISSOR_TEST);
    await device.copyRenderTarget({ source, destination, sourceAttachment: 1, destinationAttachment: 1 });
    const selectedCopy = f.calls.filter((call) => call.name === "blit").at(-1)!;
    expect(selectedCopy.args.slice(0, 4)).toEqual([source.drawFramebuffer, destination.drawFramebuffer, gl.COLOR_ATTACHMENT0 + 1, [gl.NONE, gl.COLOR_ATTACHMENT0 + 1]]);
    expect(selectedCopy.args[4]).toBe(false);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);
    expect(f.draws.get(destination.drawFramebuffer)).toEqual([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1]);
    device.endFrame(); device.dispose();
  });

  it("continues rejecting unsupported layered and depth-only multisample descriptors", () => {
    const { device } = fixture();
    expect(() => device.createRenderTarget({ ...descriptor, dimension: "2d-array", layers: 1 })).toThrow(/layered/);
    expect(() => device.createRenderTarget({ width: 4, height: 4, depthOnly: true, sampleCount: 4 })).toThrow(/depth-only/);
    expect(() => device.createRenderTarget({ ...descriptor, sampleCount: 8 })).toThrow(/sampleCount/);
    expect(() => device.createRenderTarget({ ...descriptor, colorAttachments: Array.from({ length: 5 }, () => ({ format: "rgba8" as const })) })).toThrow(/attachment count/);
    device.dispose();
  });
});
