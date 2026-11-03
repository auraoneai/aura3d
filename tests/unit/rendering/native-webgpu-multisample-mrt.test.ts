import { describe, expect, it } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { DrawCommand } from "../../../packages/rendering/src/RenderDevice";

// Descriptor and lifetime evidence only: this mock never executes GPU work.
async function fixture(options: { failTextureAt?: number; maxBytes?: number } = {}) {
  const textures: Array<{ label: string; sampleCount: number; format: string; destroyed: number; createView(): object; destroy(): void }> = [];
  const passes: WebGPURenderPassDescriptorLike[] = [];
  const pipelines: WebGPURenderPipelineDescriptorLike[] = [];
  const fences: Array<() => void> = [];
  let createCount = 0;
  let onSubmit: (() => void) | undefined;
  const native = {
    features: new Set<string>(),
    limits: { maxColorAttachments: 4, maxColorAttachmentBytesPerSample: 32, maxTextureDimension2D: 1024 },
    queue: {
      writeBuffer() {},
      submit() { onSubmit?.(); },
      onSubmittedWorkDone() { return new Promise<void>((resolve) => fences.push(resolve)); }
    },
    createBuffer() { return { destroy() {} }; },
    createTexture(descriptor: { label?: string; format: string; sampleCount?: number }) {
      createCount += 1;
      if (createCount === options.failTextureAt) throw new Error("injected allocation failure");
      const texture = { label: descriptor.label ?? "", format: descriptor.format, sampleCount: descriptor.sampleCount ?? 1,
        destroyed: 0, createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture);
      return texture;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}),
    createCommandEncoder() {
      return { beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
        passes.push(descriptor);
        return { setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, setBlendConstant() {}, draw() {}, end() {} };
      }, finish: () => ({}) };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native,
    ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, textures, passes, pipelines, finishFences, onSubmit(callback?: () => void) { onSubmit = callback; },
    get createCount() { return createCount; },
    async close() { onSubmit = undefined; await finishFences(); if (!device.disposed) device.dispose(); await finishFences(); } };
}

function target(device: WebGPUDevice) {
  return device.createRenderTarget({ label: "mrt4", width: 2, height: 2, sampleCount: 4,
    colorAttachments: [{ format: "rgba16f" }, { format: "rgba8" }] });
}
function draw(device: WebGPUDevice): DrawCommand {
  const marker = "native-multisample-mrt";
  const shader = device.createShaderProgram({ label: marker, marker, vertex: `// ${marker}\nvoid main() {}`,
    fragment: `// ${marker}\nvoid main() {}`, webgpu: {
      vertex: "@vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }",
      fragment: "struct Outputs { @location(0) a: vec4<f32>, @location(1) b: vec4<f32> }; @fragment fn fs_main() -> Outputs { return Outputs(vec4<f32>(1.0), vec4<f32>(1.0)); }"
    } });
  return { topology: "triangles", vertexBuffer: device.createBuffer("vertex", 36, new Float32Array(9)), vertexFormat: VertexFormat.P3,
    vertexCount: 3, shader, renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: false } };
}

function viewTexture(view: unknown): { label: string; sampleCount: number } {
  return (view as { texture: { label: string; sampleCount: number } }).texture;
}

describe("native WebGPU multisampled MRT", () => {
  it("allocates separate 4x attachments and resolves each output after clear and draw", async () => {
    const f = await fixture();
    try {
      const output = target(f.device);
      expect(output.colorTextures).toHaveLength(2);
      expect(output.sampleCount).toBe(4);
      expect(f.device.getDiagnostics().textureBytes).toBe(304);
      expect(f.device.getDiagnostics().gpuTargetBytes).toBe(304);
      expect(f.device.getDiagnostics().gpuTargets).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "mrt4-color-1-multisample-color", bytes: 64 })
      ]));
      expect(f.textures.map((texture) => [texture.label, texture.sampleCount])).toEqual([
        ["mrt4-color-1", 1], ["mrt4-color-1-multisample", 4], ["mrt4", 1], ["mrt4-multisample", 4], ["mrt4-depth", 4]
      ]);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(output);
      f.device.clear([0.2, 0.3, 0.4, 1]);
      f.device.clearRenderTarget([0, 0, 0, 0], 1);
      f.device.draw(draw(f.device));
      expect(f.passes).toHaveLength(3);
      expect(f.passes.map((pass) => pass.colorAttachments.map((entry) => entry.loadOp))).toEqual([
        ["clear", "clear"], ["load", "clear"], ["load", "load"]
      ]);
      for (const pass of f.passes) {
        expect(pass.colorAttachments.map((entry) => viewTexture(entry.view).label)).toEqual(["mrt4-multisample", "mrt4-color-1-multisample"]);
        expect(pass.colorAttachments.map((entry) => viewTexture(entry.resolveTarget).label)).toEqual(["mrt4", "mrt4-color-1"]);
        expect(pass.colorAttachments.every((entry) => viewTexture(entry.view).sampleCount === 4 && viewTexture(entry.resolveTarget).sampleCount === 1)).toBe(true);
      }
      expect(f.pipelines.at(-1)!.multisample?.count).toBe(4);
      expect(f.pipelines.at(-1)!.fragment!.targets.map((entry) => entry.format)).toEqual(["rgba16float", "rgba8unorm"]);
      f.device.endFrame(); output.dispose();
      expect(f.textures.every((texture) => texture.destroyed === 0)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(304);
      expect(f.device.getDiagnostics().gpuTargetBytes).toBe(0);
      await f.finishFences();
      expect(f.textures.every((texture) => texture.destroyed === 1)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await f.close(); }
  });

  it("rejects unsupported formats, depth resolves, mipmaps, and sample counts before allocating", async () => {
    const f = await fixture();
    try {
      const base = { width: 2, height: 2, colorAttachments: [{ format: "rgba8" as const }, { format: "rgba8" as const }] };
      expect(() => f.device.createRenderTarget({ ...base, sampleCount: 2 })).toThrow(/sampleCount/);
      expect(() => f.device.createRenderTarget({ ...base, sampleCount: 4, depth: "texture" })).toThrow(/resolve depth/);
      expect(() => f.device.createRenderTarget({ ...base, sampleCount: 4, mipLevelCount: 2 })).toThrow(/one mip/);
      expect(() => f.device.createRenderTarget({ ...base, sampleCount: 4, colorAttachments: [{ format: "rgba8" }, { format: "rgba32f" }] })).toThrow(/multisampl/i);
      expect(f.createCount).toBe(0);
    } finally { await f.close(); }
  });

  it("cleans up both extra images and their budgets when a later allocation fails", async () => {
    for (const failTextureAt of [2, 3, 4, 5]) {
      const f = await fixture({ failTextureAt });
      try {
        expect(() => target(f.device)).toThrow(/injected allocation failure/);
        await f.finishFences();
        expect(f.textures.every((texture) => texture.destroyed === 1)).toBe(true);
        expect(f.device.getDiagnostics().textureBytes).toBe(0);
      } finally { await f.close(); }
    }
    const f = await fixture({ maxBytes: 100 });
    try {
      expect(() => target(f.device)).toThrow(/budget/i);
      await f.finishFences();
      expect(f.textures.every((texture) => texture.destroyed === 1)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await f.close(); }
  });

  it("keeps all multisample images alive when disposal occurs during submission", async () => {
    const f = await fixture();
    try {
      const output = target(f.device);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(output);
      f.onSubmit(() => { f.onSubmit(undefined); output.dispose(); expect(f.textures.every((texture) => texture.destroyed === 0)).toBe(true); });
      f.device.draw(draw(f.device));
      expect(f.textures.every((texture) => texture.destroyed === 0)).toBe(true);
      f.device.endFrame();
      await f.finishFences();
      expect(f.textures.every((texture) => texture.destroyed === 1)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await f.close(); }
  });
});
