import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

interface MockTexture {
  readonly label: string;
  readonly descriptor: Record<string, unknown>;
  destroyed: number;
  createView(): { texture: MockTexture };
  destroy(): void;
}
interface MockPass {
  readonly descriptor: Record<string, any>;
  pipeline?: { descriptor: Record<string, any> };
  group?: { entries: readonly { binding: number; resource: unknown }[] };
  viewport?: number[];
  scissor?: number[];
  draws: number;
}

/** Records native submissions and attachment identity without a browser or GPU. */
async function makeDevice(floatBlend = true) {
  const textures: MockTexture[] = [], passes: MockPass[] = [], layouts: Record<string, any>[] = [], modules: string[] = [];
  let submissions = 0;
  let lose!: (value: { reason: string }) => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = resolve; });
  const native = {
    features: new Set(floatBlend ? ["float32-blendable"] : []), lost,
    queue: { submit() { submissions += 1; }, writeBuffer() {}, onSubmittedWorkDone: async () => {} },
    createBuffer: ({ size, usage }: { size: number; usage: number }) => ({ size, usage, destroy() {} }),
    createTexture: (descriptor: Record<string, unknown>): MockTexture => {
      const texture: MockTexture = { label: String(descriptor.label), descriptor, destroyed: 0,
        createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createShaderModule: ({ code }: { code: string }) => { modules.push(code); return { code }; },
    createBindGroupLayout: (descriptor: Record<string, any>) => { layouts.push(descriptor); return { descriptor }; },
    createPipelineLayout: (descriptor: unknown) => ({ descriptor }),
    createRenderPipeline: (descriptor: Record<string, any>) => ({ descriptor, getBindGroupLayout: () => ({}) }),
    createBindGroup: ({ entries }: { entries: readonly { binding: number; resource: unknown }[] }) => ({ entries }),
    createCommandEncoder: () => ({
      beginRenderPass(descriptor: Record<string, any>) {
        const pass: MockPass = { descriptor, draws: 0 }; passes.push(pass);
        return {
          setPipeline(pipeline: MockPass["pipeline"]) { pass.pipeline = pipeline; },
          setBindGroup(_index: number, group: MockPass["group"]) { pass.group = group; },
          setViewport(...args: number[]) { pass.viewport = args; },
          setScissorRect(...args: number[]) { pass.scissor = args; },
          setVertexBuffer() {}, setBlendConstant() {}, setStencilReference() {},
          draw() { pass.draws += 1; }, end() {}
        };
      },
      finish: () => ({})
    })
  };
  const adapter = { requestDevice: async () => native as unknown as WebGPUDeviceLike };
  const device = await WebGPUDevice.create({ adapter, device: native as unknown as WebGPUDeviceLike });
  return { device, native, textures, passes, layouts, modules, submissions: () => submissions, lose };
}

function createScene(device: WebGPUDevice, options: { format?: "rgba8" | "rgba16f" | "rgba32f"; depth?: boolean | "texture"; sampleCount?: number } = {}) {
  return device.createRenderTarget({ width: 16, height: 12, label: "scene", format: options.format ?? "rgba16f", depth: options.depth ?? true, sampleCount: options.sampleCount ?? 1 });
}

function makeSplatDraw(device: WebGPUDevice) {
  const buffer = device.createBuffer("vertex", 24, new Float32Array(6));
  const shader = device.createShaderProgram({
    label: "splat-test", marker: "splat-test", vertex: "// splat-test\nvoid main() {}", fragment: "// splat-test\nvoid main() {}",
    webgpu: { vertex: "@vertex fn vs_main(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i), 0, 0, 1); }",
      fragment: "@fragment fn fs_main() -> @location(0) vec4f { return vec4f(1); }" }
  });
  const draw = () => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
    renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true, blendMode: "alpha" } });
  return { buffer, shader, draw };
}

describe("WebGPU Gaussian splat color surfaces", () => {
  it("queues exact texture loads, a borrowed-depth draw and inverse transfer in order", async () => {
    const { device, passes, textures, layouts, modules } = await makeDevice();
    const target = createScene(device);
    device.beginFrame(16, 12); device.setRenderTarget(target);
    device.setViewport(2, 1, 10, 8); device.setScissor(4, 0, 5, 5); device.setScissorTest(true);
    device.clear([0.4, 0.2, 0.1, 0.5]);
    const adapter = device.createGaussianSplatColorAdapter();
    const scratch = adapter.createScratch(target);
    const { buffer, shader, draw } = makeSplatDraw(device);
    expect(scratch.byteLength).toBe(16 * 12 * 16);
    adapter.transfer(target, scratch, true, "linear-to-srgb", "independent");
    adapter.drawToScratch(target, scratch, () => {
      expect(device.getRenderTarget()).not.toBe(target);
      expect(() => device.clear([0, 0, 0, 0])).toThrow(/borrowed target/);
      expect(() => device.setRenderTarget(target)).toThrow(/borrowed target/);
      expect(() => scratch.dispose()).toThrow(/during its draw/);
      expect(() => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
        renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: false } })).toThrow(/cannot write/);
      draw();
    });
    expect(device.getRenderTarget()).toBe(target);
    adapter.transfer(target, scratch, false, "srgb-to-linear", "premultiplied");
    expect(passes).toHaveLength(4);
    const [clear, encode, splat, decode] = passes;
    const sceneColor = textures.find((t) => t.label === "scene")!;
    const sceneDepth = textures.find((t) => t.label === "scene-depth")!;
    const scratchColor = textures.find((t) => t.label === "gaussian-splat-color-scratch")!;
    expect(clear!.descriptor.colorAttachments[0].loadOp).toBe("clear");
    expect(clear!.descriptor.depthStencilAttachment.view.texture).toBe(sceneDepth);
    expect(encode!.descriptor.colorAttachments[0].view.texture).toBe(scratchColor);
    expect(encode!.group!.entries[0]!.resource).toMatchObject({ texture: sceneColor });
    expect(encode!.scissor).toEqual([4, 7, 5, 4]);
    expect(encode!.descriptor.depthStencilAttachment).toBeUndefined();
    expect(splat!.descriptor.colorAttachments[0].view.texture).toBe(scratchColor);
    expect(splat!.descriptor.colorAttachments[0].loadOp).toBe("load");
    expect(splat!.descriptor.depthStencilAttachment.view.texture).toBe(sceneDepth);
    expect(splat!.descriptor.depthStencilAttachment.depthLoadOp).toBe("load");
    expect(splat!.pipeline!.descriptor.depthStencil.depthWriteEnabled).toBe(false);
    expect(splat!.viewport).toEqual([2, 3, 10, 8, 0, 1]);
    expect(splat!.scissor).toEqual([4, 7, 5, 5]);
    expect(decode!.descriptor.colorAttachments[0].view.texture).toBe(sceneColor);
    expect(decode!.group!.entries[0]!.resource).toMatchObject({ texture: scratchColor });
    expect(decode!.scissor).toEqual([4, 7, 5, 4]);
    expect(layouts.some((l) => l.entries[0].texture.sampleType === "unfilterable-float")).toBe(true);
    expect(modules.some((code) => code.includes("textureLoad(source, vec2i(position.xy), 0), true, false"))).toBe(true);
    expect(modules.some((code) => code.includes("textureLoad(source, vec2i(position.xy), 0), false, true"))).toBe(true);
    scratch.dispose(); adapter.dispose();
    await Promise.resolve(); await Promise.resolve();
    expect(scratchColor.destroyed).toBe(1);
    expect(sceneDepth.destroyed).toBe(0);
    buffer.dispose(); shader.dispose(); device.endFrame(); device.dispose();
  });

  it("restores the scene and borrowed-depth guard when the callback throws", async () => {
    const { device } = await makeDevice();
    const target = createScene(device, { depth: "texture" });
    device.beginFrame(16, 12); device.setRenderTarget(target);
    const adapter = device.createGaussianSplatColorAdapter(), scratch = adapter.createScratch(target);
    const { buffer, shader } = makeSplatDraw(device);
    adapter.transfer(target, scratch, true, "linear-to-srgb", "independent");
    expect(() => adapter.drawToScratch(target, scratch, () => {
      expect(() => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
        renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true, stencil: { depthPass: "replace" } } })).toThrow(/borrowed stencil/);
      expect(() => device.draw({ topology: "triangles", vertexBuffer: buffer, vertexCount: 3, shader,
        renderState: { depthTest: true, depthWrite: false, depthCompare: "less-equal", cullMode: "none", blend: true },
        uniforms: new Map([["u_depth", new TextureBinding({ name: "u_depth", texture: target.depthTexture! })]]) })).toThrow(/cannot sample/);
      throw new Error("draw failed");
    })).toThrow("draw failed");
    expect(device.getRenderTarget()).toBe(target);
    expect(() => device.setScissorTest(false)).not.toThrow();
    scratch.dispose(); adapter.dispose(); buffer.dispose(); shader.dispose(); device.endFrame(); device.dispose();
  });

  it("fails closed on multisample, byte targets, missing depth and missing float32 blending", async () => {
    const { device, passes } = await makeDevice(false);
    const hdr = createScene(device), msaa = createScene(device, { sampleCount: 4 }), ldr = createScene(device, { format: "rgba8" }), noDepth = createScene(device, { depth: false });
    device.beginFrame(16, 12); device.setRenderTarget(hdr);
    const adapter = device.createGaussianSplatColorAdapter();
    expect(() => adapter.createScratch(hdr)).toThrow(/float32-blendable/);
    device.setRenderTarget(msaa);
    expect(() => adapter.createScratch(msaa)).toThrow(/multisample/);
    device.setRenderTarget(ldr);
    expect(() => adapter.createScratch(ldr)).toThrow(/floating-point/);
    device.setRenderTarget(noDepth);
    expect(() => adapter.createScratch(noDepth)).toThrow(/depth attachment/);
    device.setRenderTarget(null);
    expect(() => adapter.createScratch(null as never)).toThrow(/active WebGPU/);
    expect(passes.every((pass) => pass.draws === 0)).toBe(true);
    adapter.dispose(); device.endFrame(); device.dispose();
  });

  it("retires its scratch and adapter when the WebGPU device is lost", async () => {
    const { device, textures, lose } = await makeDevice();
    const target = createScene(device);
    device.beginFrame(16, 12); device.setRenderTarget(target);
    const adapter = device.createGaussianSplatColorAdapter(), scratch = adapter.createScratch(target);
    adapter.transfer(target, scratch, true, "linear-to-srgb", "independent");
    lose({ reason: "destroyed" });
    await Promise.resolve(); await Promise.resolve();
    expect(device.contextLost).toBe(true);
    expect(scratch.disposed).toBe(true);
    expect(textures.find((t) => t.label === "gaussian-splat-color-scratch")!.destroyed).toBe(1);
    expect(() => adapter.transfer(target, scratch, false, "srgb-to-linear", "independent")).toThrow(/disposed/);
    adapter.dispose(); device.dispose();
  });
});
