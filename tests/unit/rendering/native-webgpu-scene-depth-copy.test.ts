import { describe, expect, it, vi } from "vitest";
import { BaseRenderPass } from "../../../packages/rendering/src/RenderPass";
import { RenderGraph } from "../../../packages/rendering/src/RenderGraph";
import { MockRenderDevice, type RenderTarget, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { SceneDepthCopyPass, ensureSceneDepthCopyTarget } from "../../../packages/rendering/src/renderer/SceneDepthCopyPass";
import { createRendererFrameHooks } from "../../../packages/rendering/src/renderer/FrameGraph";
import { sceneDepthCopyTexture } from "../../../packages/rendering/src/vfx/SceneDepthAdapter";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

/** Records native calls made by the real device; it does not simulate pixels. */
async function fixture(options: { render?: boolean; fence?: Promise<void> } = {}) {
  const textures: { descriptor: { label?: string; format: string; sampleCount?: number; usage?: number }; destroy: ReturnType<typeof vi.fn>; createView(descriptor?: object): unknown }[] = [];
  const buffers: { descriptor: { label?: string; size: number }; destroy: ReturnType<typeof vi.fn> }[] = [];
  const writes: { buffer: unknown; bytes: Uint8Array }[] = [];
  const modules: { label?: string; code: string }[] = [];
  const layouts: { entries: readonly { binding: number; texture?: { sampleType: string; viewDimension: string; multisampled?: boolean }; sampler?: unknown }[] }[] = [];
  const groups: { entries: readonly { binding: number; resource: unknown }[] }[] = [];
  const pipelines: { depthStencil?: { format: string; depthWriteEnabled: boolean; depthCompare: string }; fragment?: { targets: readonly { format: string }[] } }[] = [];
  const passes: { colorAttachments: readonly { view: unknown }[]; depthStencilAttachment?: { view: unknown } }[] = [];
  let failSubmit = false;
  const native = {
    queue: { writeBuffer(buffer: unknown, _offset: number, data: ArrayBuffer | ArrayBufferView) {
      const bytes = ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
      writes.push({ buffer, bytes: bytes.slice() });
    }, writeTexture() {}, submit: vi.fn(() => { if (failSubmit) { failSubmit = false; throw new Error("injected submit failure"); } }), onSubmittedWorkDone: () => options.fence ?? Promise.resolve() },
    createBuffer(descriptor: { label?: string; size: number }) { const buffer = { descriptor, destroy: vi.fn() }; buffers.push(buffer); return buffer; },
    createTexture(descriptor: { label?: string; format: string; sampleCount?: number; usage?: number }) {
      const texture = { descriptor, destroy: vi.fn(), createView: (view?: object) => ({ texture, view }) };
      textures.push(texture); return texture;
    },
    createShaderModule(descriptor: { label?: string; code: string }) { modules.push(descriptor); return descriptor; },
    createSampler: () => ({}),
    ...(options.render === false ? {} : {
      createBindGroupLayout(descriptor: typeof layouts[number]) { layouts.push(descriptor); return descriptor; },
      createPipelineLayout: (descriptor: object) => descriptor,
      createRenderPipeline(descriptor: typeof pipelines[number]) { pipelines.push(descriptor); return { getBindGroupLayout: (index: number) => ({ index }) }; },
      createBindGroup(group: typeof groups[number]) { groups.push(group); return group; },
      createCommandEncoder: () => ({
        beginRenderPass(pass: typeof passes[number]) {
          passes.push(pass); return { setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setViewport() {}, setScissorRect() {}, draw() {}, end() {} };
        }, finish: () => ({})
      })
    }),
    destroy() {}
  };
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike } });
  return { device, native, textures, buffers, writes, modules, layouts, groups, pipelines, passes, failNextSubmit: () => { failSubmit = true; } };
}

describe("scene depth snapshot", () => {
  it("submits a real native depth binding and writes a same-size depth attachment", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ label: "opaque-depth", width: 7, height: 3, depth: "texture" });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 7, 3);
    const previous = f.device.createRenderTarget({ label: "previous", width: 7, height: 3, depth: false });
    expect(copy.depthOnly).not.toBe(true);
    expect(copy.depthTexture?.format).toBe("depth24");
    expect(sceneDepthCopyTexture(copy)).toBe(copy.depthTexture);
    f.device.beginFrame(7, 3);
    // Initialize both attachments before measuring the copy submission.
    f.device.setRenderTarget(source);
    f.device.clear([0, 0, 0, 1]);
    f.device.setRenderTarget(previous);
    f.device.setRenderTarget(null);
    f.device.setRenderTarget(previous);
    const before = f.native.queue.submit.mock.calls.length;
    new SceneDepthCopyPass(source, copy).execute({ device: f.device, width: 7, height: 3 });
    expect(f.device.getRenderTarget()).toBe(previous);
    expect(f.native.queue.submit.mock.calls.length - before).toBe(1);

    const sourceDepth = f.textures.find(texture => texture.descriptor.label === "opaque-depth-depth")!;
    const copyDepth = f.textures.find(texture => texture.descriptor.label === "aura.scene.depth.copy-depth")!;
    expect(sourceDepth.descriptor.format).toBe("depth24plus-stencil8");
    expect(copyDepth.descriptor.format).toBe("depth24plus-stencil8");
    expect(f.layouts.some(layout => layout.entries.some(entry => entry.binding === 1 && entry.texture?.sampleType === "depth" && entry.texture.viewDimension === "2d"))).toBe(true);
    expect(f.layouts.flatMap(layout => layout.entries).some(entry => entry.sampler)).toBe(false);
    expect(f.groups.at(-1)?.entries.find(entry => entry.binding === 1)?.resource).toEqual({ texture: sourceDepth, view: { aspect: "depth-only" } });
    expect(f.passes.at(-1)?.depthStencilAttachment?.view).toEqual({ texture: copyDepth, view: undefined });
    expect(f.pipelines.at(-1)?.depthStencil).toMatchObject({ format: "depth24plus-stencil8", depthWriteEnabled: true, depthCompare: "always" });
    expect(f.pipelines.at(-1)?.fragment?.targets).toMatchObject([{ format: "rgba8unorm" }]);
    const fragment = f.modules.find(module => module.label?.includes("scene-depth-copy-fragment"))?.code;
    expect(fragment).toContain("var u_depthTexture: texture_depth_2d");
    expect(fragment).toContain("textureLoad(u_depthTexture, vec2<i32>(position.xy), 0)");
    expect(fragment).toContain("@builtin(frag_depth)");
    expect(fragment).not.toContain("@aura3d-bindings");

    // New graph passes reuse the device's draw resources, instead of leaking a
    // new shader and geometry each frame. These assertions do not claim pixels.
    const moduleCount = f.modules.length, bufferCount = f.buffers.filter(buffer => buffer.descriptor.label?.includes("vertex")).length;
    expect(bufferCount).toBe(1);
    new SceneDepthCopyPass(source, copy).execute({ device: f.device, width: 7, height: 3 });
    expect(f.modules).toHaveLength(moduleCount);
    expect(f.buffers.filter(buffer => buffer.descriptor.label?.includes("vertex"))).toHaveLength(bufferCount);
    f.device.endFrame();
    f.device.dispose();
    await Promise.resolve();
    await Promise.resolve();
    expect(f.buffers.find(buffer => buffer.descriptor.label?.includes("vertex"))?.destroy).toHaveBeenCalledOnce();
  });

  it("resolves all four native depth samples with the negotiated nearest-surface rule", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ label: "opaque-msaa", width: 7, height: 3, sampleCount: 4, depth: true });
    const single = f.device.createRenderTarget({ label: "opaque-single", width: 7, height: 3, depth: "texture" });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 7, 3);
    expect(source.depthTexture).toBeUndefined();
    expect(source.multisampledDepthTexture?.format).toBe("depth24");
    expect(sceneDepthCopyTexture(source)).toBeNull();
    f.device.beginFrame(7, 3); f.device.setRenderTarget(source);
    const pass = new SceneDepthCopyPass(source, copy);
    pass.execute({ device: f.device, width: 7, height: 3 });
    expect(f.device.getRenderTarget()).toBe(source);
    const depth = f.textures.find(texture => texture.descriptor.label === "opaque-msaa-depth")!;
    expect(depth.descriptor).toMatchObject({ format: "depth24plus-stencil8", sampleCount: 4 });
    // WebGPU TEXTURE_BINDING (0x04) and RENDER_ATTACHMENT (0x10).
    expect((depth.descriptor.usage ?? 0) & 0x14).toBe(0x14);
    expect(f.layouts.some(layout => layout.entries.some(entry => entry.binding === 1 && entry.texture?.sampleType === "depth" && entry.texture.multisampled === true))).toBe(true);
    expect(f.groups.at(-1)?.entries.find(entry => entry.binding === 1)?.resource).toEqual({ texture: depth, view: { aspect: "depth-only" } });
    const fragment = f.modules.find(module => module.label?.includes("scene-depth-resolve-fragment"))?.code;
    expect(fragment).toContain("var u_depthTexture: texture_depth_multisampled_2d");
    expect(fragment).toContain("var nearest = textureLoad(u_depthTexture, pixel, 0)");
    expect(fragment).toContain("sampleIndex: i32 = 1; sampleIndex < 4; sampleIndex += 1");
    expect(fragment).toContain("textureLoad(u_depthTexture, pixel, sampleIndex)");
    expect(fragment).toContain("nearest = min(nearest, depth)");
    expect(fragment).toContain("nearest = max(nearest, depth)");
    expect(fragment).toContain("@builtin(frag_depth)");
    const uniformForLastResolve = () => {
      const buffer = f.buffers.filter(entry => entry.descriptor.label === "prd01-scene-depth-resolve-portable-uniforms").at(-1)!;
      const bytes = f.writes.find(entry => entry.buffer === buffer)!.bytes;
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
    };
    expect(f.device.getDepthConvention().mode).toBe("standard");
    expect(uniformForLastResolve()).toBe(0);

    // WebGPU now accepts a negotiated reversed frame convention (and still
    // rejects inconsistent clear/compare values); the resolve follows it.
    const standard = f.device.getDepthConvention();
    const reversed = { ...standard, requestedMode: "reversed" as const, mode: "reversed" as const, clearValue: 0 as const, compare: "greater-equal" as const, biasSign: -1 as const };
    expect(() => f.device.setDepthConvention({ ...reversed, clearValue: 1 as never })).toThrow(/depth/i);
    f.device.setDepthConvention(reversed);
    expect(f.device.getDepthConvention()).toMatchObject({ mode: "reversed", clearValue: 0, compare: "greater-equal" });
    pass.execute({ device: f.device, width: 7, height: 3 });
    expect(uniformForLastResolve()).toBe(1);
    f.device.setDepthConvention(standard);

    // Both variants stay cached if adjacent views use different sample counts.
    new SceneDepthCopyPass(single, copy).execute({ device: f.device, width: 7, height: 3 });
    const moduleCount = f.modules.length;
    pass.execute({ device: f.device, width: 7, height: 3 });
    expect(f.modules).toHaveLength(moduleCount);
    f.device.endFrame(); f.device.dispose();
  });

  it("rejects unknown conventions and sample-count/binding mismatches without publishing a copy", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 2, height: 2, sampleCount: 4, depth: true });
    const single = f.device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 2, 2);
    const revoke = vi.fn();
    const run = (input: RenderTarget) => new SceneDepthCopyPass(input, copy, [], revoke).execute({ device: f.device, width: 2, height: 2 });
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source);
    const standard = f.device.getDepthConvention();
    Object.defineProperty(f.device, "getDepthConvention", { value: () => ({ ...standard, mode: "logarithmic" }), configurable: true });
    expect(() => run(source)).toThrow(/depth convention/);
    Object.defineProperty(f.device, "getDepthConvention", { value: () => ({ ...standard, clearValue: 0 }), configurable: true });
    expect(() => run(source)).toThrow(/depth convention/);
    Object.defineProperty(f.device, "getDepthConvention", { value: () => ({ ...standard, mode: "reversed", clearValue: 1, compare: "greater-equal" }), configurable: true });
    expect(() => run(source)).toThrow(/depth convention/);
    Object.defineProperty(f.device, "getDepthConvention", { value: () => ({ ...standard, clipRange: "minus-one-to-one" }), configurable: true });
    expect(() => run(source)).toThrow(/depth convention/);
    Object.defineProperty(f.device, "getDepthConvention", { value: undefined, configurable: true });
    expect(() => run(source)).toThrow(/depth convention/);
    delete (f.device as unknown as { getDepthConvention?: unknown }).getDepthConvention;
    // Deliberately misdeclare each target's count while retaining the device's
    // real texture identity: the native binding must reject both directions.
    const wrongFour = { ...single, sampleCount: 4, multisampledDepthTexture: single.depthTexture } as RenderTarget;
    const wrongOne = { ...source, sampleCount: 1, depthTexture: source.multisampledDepthTexture } as RenderTarget;
    expect(() => run(wrongFour)).toThrow(/depth|sample/i);
    expect(() => run(wrongOne)).toThrow(/depth|sample/i);
    expect(revoke).toHaveBeenCalledTimes(7);
    expect(f.device.getRenderTarget()).toBe(source);
    f.device.endFrame(); f.device.dispose();
  });

  it("rejects a foreign or disposed multisampled depth attachment", async () => {
    const a = await fixture(), b = await fixture();
    const foreign = a.device.createRenderTarget({ width: 2, height: 2, sampleCount: 4, depth: true });
    const source = b.device.createRenderTarget({ width: 2, height: 2, sampleCount: 4, depth: true });
    const copy = ensureSceneDepthCopyTarget(b.device, null, 2, 2);
    const revoke = vi.fn();
    const run = (input: RenderTarget) => new SceneDepthCopyPass(input, copy, [], revoke).execute({ device: b.device, width: 2, height: 2 });
    b.device.beginFrame(2, 2); b.device.setRenderTarget(source);
    expect(() => run(foreign)).toThrow(/depth|sample/i);
    const disposed = { ...source, multisampledDepthTexture: source.multisampledDepthTexture } as RenderTarget;
    source.multisampledDepthTexture!.dispose();
    expect(() => run(disposed)).toThrow(/live 2D depth/);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(b.device.getRenderTarget()).toBe(source);
    b.device.endFrame(); a.device.dispose(); b.device.dispose();
  });

  it("retires both single and multisample draw variants on device loss", async () => {
    const f = await fixture();
    const listeners = new Set<() => void>();
    f.device.onDeviceLost = listener => { listeners.add(listener); return () => { listeners.delete(listener); }; };
    const compile = vi.spyOn(f.device, "createShaderProgram");
    const single = f.device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
    const multi = f.device.createRenderTarget({ width: 2, height: 2, sampleCount: 4, depth: true });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 2, 2);
    f.device.beginFrame(2, 2); f.device.setRenderTarget(single);
    new SceneDepthCopyPass(single, copy).execute({ device: f.device, width: 2, height: 2 });
    new SceneDepthCopyPass(multi, copy).execute({ device: f.device, width: 2, height: 2 });
    const programs = compile.mock.results.map(result => result.value);
    expect(programs).toHaveLength(2);
    expect(listeners.size).toBe(2);
    for (const listener of [...listeners]) listener();
    expect(programs.every(program => program.disposed)).toBe(true);
    expect(listeners.size).toBe(0);
    new SceneDepthCopyPass(multi, copy).execute({ device: f.device, width: 2, height: 2 });
    expect(compile).toHaveBeenCalledTimes(3);
    f.device.endFrame(); f.device.dispose();
  });

  it.each([1, 4])("keeps submitted %s× depth attachments and temporary uniforms alive until queue completion", async (samples) => {
    let complete!: () => void;
    const fence = new Promise<void>(resolve => { complete = resolve; });
    const f = await fixture({ fence });
    const source = f.device.createRenderTarget({ label: "leased-source", width: 2, height: 2, depth: samples === 1 ? "texture" : true, sampleCount: samples });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 2, 2);
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source);
    new SceneDepthCopyPass(source, copy).execute({ device: f.device, width: 2, height: 2 });
    f.device.endFrame();
    const uniform = f.buffers.find(buffer => buffer.descriptor.label === `prd01-scene-depth-${samples === 1 ? "copy" : "resolve"}-portable-uniforms`)!;
    const sourceDepth = f.textures.find(texture => texture.descriptor.label === "leased-source-depth")!;
    const copyDepth = f.textures.find(texture => texture.descriptor.label === "aura.scene.depth.copy-depth")!;
    source.dispose(); copy.dispose();
    expect(uniform.destroy).not.toHaveBeenCalled();
    expect(sourceDepth.destroy).not.toHaveBeenCalled();
    expect(copyDepth.destroy).not.toHaveBeenCalled();
    complete();
    await Promise.resolve(); await Promise.resolve();
    expect(uniform.destroy).toHaveBeenCalledOnce();
    expect(sourceDepth.destroy).toHaveBeenCalledOnce();
    expect(copyDepth.destroy).toHaveBeenCalledOnce();
    f.device.dispose();
  });

  it.each([1, 4])("restores the caller's target and prevents graph consumers after a failed or skipped %s× submission", async (samples) => {
    for (const render of [true, false]) {
      const f = await fixture({ render });
      const source = f.device.createRenderTarget({ width: 4, height: 4, depth: samples === 1 ? "texture" : true, sampleCount: samples });
      const copy = ensureSceneDepthCopyTarget(f.device, null, 4, 4);
      const previous = f.device.createRenderTarget({ width: 4, height: 4, depth: false });
      const consumer = vi.fn();
      const graph = new RenderGraph();
      const hooks = createRendererFrameHooks({ device: f.device, source: [], width: 4, height: 4, camera: null });
      hooks.setForwardTarget(source);
      hooks.setSceneDepthCopy(copy);
      // A contributor may retain its frame context from graph construction.
      const blackboard = hooks.frameContext([]).blackboard;
      class Pass extends BaseRenderPass {
        constructor(name: string, reads: string[], writes: string[], private action: () => void) { super(name, reads, writes); }
        execute(): void { this.action(); }
      }
      graph.addPass(new Pass("opaque", [], ["opaque"], () => {}));
      graph.addPass(new SceneDepthCopyPass(source, copy, ["opaque"], () => hooks.setSceneDepthCopy(null)));
      graph.addPass(new Pass("consumer", ["aura.scene.depth.copy"], ["result"], consumer));
      f.device.beginFrame(4, 4);
      f.device.setRenderTarget(source);
      f.device.clear([0, 0, 0, 1]);
      f.device.setRenderTarget(previous);
      f.device.setRenderTarget(null);
      f.device.setRenderTarget(previous);
      if (render) f.failNextSubmit();
      expect(() => graph.execute({ device: f.device, width: 4, height: 4 })).toThrow(render ? /injected submit/ : /could not be submitted/i);
      expect(f.device.getRenderTarget()).toBe(previous);
      expect(blackboard.has("aura.scene.depth.copy")).toBe(false);
      expect(consumer).not.toHaveBeenCalled();
      if (render) {
        hooks.setSceneDepthCopy(copy);
        graph.execute({ device: f.device, width: 4, height: 4 });
        expect(blackboard.get("aura.scene.depth.copy")).toBe(copy);
        expect(consumer).toHaveBeenCalledOnce();
      }
      f.device.endFrame(); f.device.dispose();
    }
  });

  it("rejects missing depth, mismatched dimensions, feedback and unsupported multisample before drawing", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 4, height: 2, depth: "texture" });
    const noDepth = f.device.createRenderTarget({ width: 4, height: 2, depth: false });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 4, 2);
    const wrongSize = ensureSceneDepthCopyTarget(f.device, null, 4, 3);
    f.device.beginFrame(4, 2); f.device.setRenderTarget(source);
    const run = (input: RenderTarget, destination: RenderTarget) => new SceneDepthCopyPass(input, destination).execute({ device: f.device, width: 4, height: 2 });
    expect(() => run(noDepth, copy)).toThrow(/live 2D depth/);
    const revoke = vi.fn();
    expect(() => new SceneDepthCopyPass(noDepth, copy, [], revoke).execute({ device: f.device, width: 4, height: 2 })).toThrow(/live 2D depth/);
    expect(revoke).toHaveBeenCalledOnce();
    expect(() => run(source, wrongSize)).toThrow(/sizes must match/);
    expect(() => run(source, source)).toThrow(/distinct/);
    expect(() => run({ ...source, sampleCount: 2 } as RenderTarget, copy)).toThrow(/only supports single-sample and WebGPU 4x/);
    expect(() => run({ ...source, sampleCount: 4 } as RenderTarget, copy)).toThrow(/live 2D depth/);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    expect(f.device.getRenderTarget()).toBe(source);
    f.device.endFrame(); f.device.dispose();
  });

  it("requires checked native submission and a way to restore target state", async () => {
    const f = await fixture();
    const source = f.device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
    const copy = ensureSceneDepthCopyTarget(f.device, null, 2, 2);
    const revoke = vi.fn();
    const run = () => new SceneDepthCopyPass(source, copy, [], revoke).execute({ device: f.device, width: 2, height: 2 });
    f.device.beginFrame(2, 2); f.device.setRenderTarget(source);
    Object.defineProperty(f.device, "drawChecked", { value: undefined, configurable: true });
    expect(run).toThrow(/checked draw submission/);
    delete (f.device as unknown as { drawChecked?: unknown }).drawChecked;
    Object.defineProperty(f.device, "getRenderTarget", { value: undefined, configurable: true });
    expect(run).toThrow(/state restoration/);
    delete (f.device as unknown as { getRenderTarget?: unknown }).getRenderTarget;
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(f.device.getRenderTarget()).toBe(source);
    expect(f.native.queue.submit).not.toHaveBeenCalled();
    f.device.endFrame(); f.device.dispose();
  });

  it("reuses, resizes and replaces only targets owned by the same live device generation", () => {
    const a = new MockRenderDevice(), b = new MockRenderDevice();
    let generation = 1;
    Object.defineProperty(a, "generation", { get: () => generation });
    const first = ensureSceneDepthCopyTarget(a, null, 4, 2);
    expect(first.depthOnly).toBe(true);
    expect(ensureSceneDepthCopyTarget(a, first, 4, 2)).toBe(first);
    const resized = ensureSceneDepthCopyTarget(a, first, 3, 2);
    expect(first.disposed).toBe(true);
    const create = a.createRenderTarget.bind(a);
    a.createRenderTarget = () => { throw new Error("allocation failed"); };
    expect(() => ensureSceneDepthCopyTarget(a, resized, 5, 2)).toThrow("allocation failed");
    expect(resized.disposed).toBe(false);
    a.createRenderTarget = create;
    const other = ensureSceneDepthCopyTarget(b, resized, 3, 2);
    expect(resized.disposed).toBe(false);
    const source = a.createRenderTarget({ width: 3, height: 2, depth: "texture" });
    expect(() => new SceneDepthCopyPass(source, other).execute({ device: a, width: 3, height: 2 })).toThrow(/different device generation/);
    generation++;
    expect(() => new SceneDepthCopyPass(source, resized).execute({ device: a, width: 3, height: 2 })).toThrow(/different device generation/);
    const replacement = ensureSceneDepthCopyTarget(a, resized, 3, 2);
    expect(resized.disposed).toBe(true);
    expect(replacement).not.toBe(resized);
    expect(() => ensureSceneDepthCopyTarget(a, replacement, NaN, 2)).toThrow(/positive and finite/);
    expect(replacement.disposed).toBe(false);
    a.contextLost = true;
    expect(() => ensureSceneDepthCopyTarget(a, replacement, 3, 2)).toThrow(/device is unavailable/);
    a.contextLost = false;
    other.dispose(); a.dispose(); b.dispose();
  });

  it("retires device-owned draw resources on loss and recompiles for a new generation", () => {
    const device = new MockRenderDevice();
    let generation = 1;
    const loss: { current?: () => void } = {};
    Object.defineProperty(device, "generation", { get: () => generation });
    Object.assign(device, { onDeviceLost: (listener: () => void) => { loss.current = listener; return () => { loss.current = undefined; }; } });
    const sources: ShaderSources[] = [];
    const create = device.createShaderProgram.bind(device);
    device.createShaderProgram = (source) => { sources.push(source); return create(source); };
    const source = device.createRenderTarget({ width: 2, height: 2, depth: "texture" });
    let copy = ensureSceneDepthCopyTarget(device, null, 2, 2);
    device.beginFrame(2, 2); device.setRenderTarget(source);
    new SceneDepthCopyPass(source, copy).execute({ device, width: 2, height: 2 });
    const first = device.drawCommands.at(-1)!;
    expect(first.vertexBuffer.disposed).toBe(false);
    loss.current?.();
    expect(first.vertexBuffer.disposed).toBe(true);
    expect(first.shader?.disposed).toBe(true);
    generation++;
    copy = ensureSceneDepthCopyTarget(device, copy, 2, 2);
    new SceneDepthCopyPass(source, copy).execute({ device, width: 2, height: 2 });
    expect(device.drawCommands.at(-1)!.shader).not.toBe(first.shader);
    expect(sources).toHaveLength(2);
    device.endFrame(); device.dispose();
  });
});
