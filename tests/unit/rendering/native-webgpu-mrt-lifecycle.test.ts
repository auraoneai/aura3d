import { describe, expect, it } from "vitest";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike, type WebGPURenderPipelineDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { resolveNativeRenderState } from "../../../packages/rendering/src/webgpu/NativeRenderState";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { GENERATED_PROGRAM_MARKER, generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import type { DrawCommand, RenderTarget, UniformValue } from "../../../packages/rendering/src/RenderDevice";

// This mock records real device descriptors and submission ordering. It does
// not compile WGSL, execute GPU work, or claim pixel correctness.
async function fixture(options: { readonly maxBytes?: number; readonly maxAttachments?: number; readonly maxColorBytes?: number; readonly failTextureAt?: number } = {}) {
  const textures: Array<{ label: string; format: string; destroyed: number; createView(): object; destroy(): void }> = [];
  const pipelines: WebGPURenderPipelineDescriptorLike[] = [];
  const passes: WebGPURenderPassDescriptorLike[] = [];
  const events: string[] = [];
  const fences: Array<() => void> = [];
  let inSubmit = false;
  let onSubmit: (() => void) | undefined;
  let onDraw: (() => void) | undefined;
  let createCount = 0;
  let lose!: () => void;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = () => resolve({ reason: "destroyed" }); });
  const native = {
    features: new Set<string>(), lost,
    limits: { maxColorAttachments: options.maxAttachments ?? 4, maxColorAttachmentBytesPerSample: options.maxColorBytes ?? 32, maxTextureDimension2D: 1024 },
    queue: {
      writeBuffer() {},
      submit(commands: readonly unknown[]) {
        if (!commands.length) return;
        inSubmit = true; events.push("submit-start");
        try { onSubmit?.(); events.push("queued"); }
        finally { inSubmit = false; events.push("submit-end"); }
      },
      onSubmittedWorkDone() {
        events.push(inSubmit ? "fence-during-submit" : "fence-after-submit");
        return new Promise<void>((resolve) => fences.push(resolve));
      }
    },
    createBuffer() { return { destroy() {} }; },
    createTexture(descriptor: { readonly label?: string; readonly format: string }) {
      createCount += 1;
      if (createCount === options.failTextureAt) throw new Error("injected texture allocation failure");
      const texture = { label: descriptor.label ?? "", format: descriptor.format, destroyed: 0,
        createView() { return { texture }; }, destroy() { texture.destroyed += 1; } };
      textures.push(texture); return texture;
    },
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline(descriptor: WebGPURenderPipelineDescriptorLike) { pipelines.push(descriptor); return { getBindGroupLayout: () => ({}) }; },
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}),
    createCommandEncoder() {
      return {
        beginRenderPass(descriptor: WebGPURenderPassDescriptorLike) {
          passes.push(descriptor);
          return { setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, setBlendConstant() {},
            draw() { onDraw?.(); }, end() {} };
        },
        finish: () => ({})
      };
    },
    destroy() {}
  } as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native,
    ...(options.maxBytes === undefined ? {} : { textureBudgetPolicy: { maxBytes: options.maxBytes } }) });
  const finishFences = async () => { for (const resolve of fences.splice(0)) resolve(); await Promise.resolve(); await Promise.resolve(); };
  return { device, textures, pipelines, passes, events, finishFences, lose,
    onSubmit(callback?: () => void) { onSubmit = callback; }, onDraw(callback?: () => void) { onDraw = callback; },
    get createCount() { return createCount; },
    async close() { onSubmit = undefined; onDraw = undefined; await finishFences(); if (!device.disposed) device.dispose(); await finishFences(); } };
}

function multiTarget(device: WebGPUDevice): RenderTarget {
  return device.createRenderTarget({ label: "mrt", width: 2, height: 2, depth: "texture",
    colorAttachments: [{ format: "rgba16f" }, { format: "rgba8" }] });
}

function drawCommand(device: WebGPUDevice): DrawCommand {
  const marker = "native-mrt-test";
  const shader = device.createShaderProgram({ label: marker, marker, vertex: `// ${marker}\nvoid main() {}`,
    fragment: `// ${marker}\nvoid main() {}`, webgpu: {
      vertex: "@vertex fn vs_main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p, 1.0); }",
      fragment: "struct Outputs { @location(0) color: vec4<f32>, @location(1) coverage: vec4<f32> }; @fragment fn fs_main() -> Outputs { return Outputs(vec4<f32>(1.0), vec4<f32>(1.0)); }"
    } });
  const vertices = device.createBuffer("vertex", 36, new Float32Array(9));
  return { topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
    renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: "none", blend: true,
      colorAttachments: [undefined, { blendMode: "opaque", colorWrite: [true, false, false, false] }] } };
}

describe("native WebGPU multiple-color attachment lifecycle", () => {
  it("allocates distinct owned color attachments, submits independent state, and retires after a fence", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      expect(target.colorTextures).toHaveLength(2);
      expect(target.colorTextures![0]).toBe(target.colorTexture);
      expect(target.colorTextures![1]).not.toBe(target.colorTexture);
      expect(f.device.getNativeTexture(target.colorTextures![0]!)).not.toBe(f.device.getNativeTexture(target.colorTextures![1]!));
      expect(f.device.getDiagnostics().textureBytes).toBe(64);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
      f.device.clear([0.2, 0.3, 0.4, 1]);
      f.device.clearRenderTarget([0, 0, 0, 0], 1);
      const command = drawCommand(f.device);
      f.device.draw(command);
      expect(f.passes).toHaveLength(3);
      expect(f.passes[0]!.colorAttachments.map((entry) => entry.loadOp)).toEqual(["clear", "clear"]);
      expect(f.passes[0]!.depthStencilAttachment?.depthLoadOp).toBe("clear");
      expect(f.passes[1]!.colorAttachments.map((entry) => entry.loadOp)).toEqual(["load", "clear"]);
      expect(f.passes[1]!.depthStencilAttachment).toBeUndefined();
      expect(f.passes[2]!.colorAttachments.map((entry) => entry.loadOp)).toEqual(["load", "load"]);
      const states = f.pipelines.at(-1)!.fragment!.targets;
      expect(states.map((entry) => entry.format)).toEqual(["rgba16float", "rgba8unorm"]);
      expect(states[0]!.blend).toBeDefined();
      expect(states[1]!.blend).toBeUndefined();
      expect(states[1]!.writeMask).toBe(1);
      expect(() => f.device.draw({ ...command, uniforms: new Map<string, UniformValue>([["feedback", new TextureBinding({ name: "feedback", texture: target.colorTextures![1]! })]]) })).toThrow(/attached for writing/i);
      f.device.endFrame(); target.dispose();
      expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 0)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(64);
      await f.finishFences();
      expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 1)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await f.close(); }
  });

  it("preflights limits and rejects configurations that are not implemented before allocation", async () => {
    const f = await fixture({ maxAttachments: 1 });
    try {
      expect(() => multiTarget(f.device)).toThrow(/attachment/i);
      expect(f.createCount).toBe(0);
    } finally { await f.close(); }
    const g = await fixture({ maxColorBytes: 8 });
    try {
      expect(() => multiTarget(g.device)).toThrow(/bytes per sample/i);
      expect(g.createCount).toBe(0);
    } finally { await g.close(); }
    const h = await fixture();
    try {
      const base = { width: 2, height: 2, colorAttachments: [{ format: "rgba8" as const }, { format: "rgba8" as const }] };
      expect(() => h.device.createRenderTarget({ ...base, sampleCount: 2 })).toThrow(/sampleCount must be 1 or 4/i);
      expect(() => h.device.createRenderTarget({ ...base, sampleCount: 4, depth: "texture" })).toThrow(/resolve depth/i);
      expect(() => h.device.createRenderTarget({ ...base, mipLevelCount: 2 })).toThrow(/one mip/i);
      expect(() => h.device.createRenderTarget({ ...base, dimension: "cube" })).toThrow(/2D/i);
      expect(() => h.device.createRenderTarget({ ...base, width: 2048 })).toThrow(/dimension/i);
      expect(h.createCount).toBe(0);
    } finally { await h.close(); }
  });

  it("releases unsubmitted extra allocations and budget if primary allocation fails", async () => {
    const f = await fixture({ failTextureAt: 2 });
    try {
      expect(() => multiTarget(f.device)).toThrow("injected texture allocation failure");
      expect(f.textures).toHaveLength(1);
      expect(f.textures[0]!.destroyed).toBe(1);
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await f.close(); }
    const budget = await fixture({ maxBytes: 20 });
    try {
      expect(() => multiTarget(budget.device)).toThrow(/budget/i);
      expect(budget.textures).toHaveLength(1);
      expect(budget.textures[0]!.destroyed).toBe(1);
      expect(budget.device.getDiagnostics().textureBytes).toBe(0);
    } finally { await budget.close(); }
  });

  it("defers retirement when a queue callback disposes the active target during submission", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
      const command = drawCommand(f.device);
      f.onSubmit(() => { f.onSubmit(undefined); target.dispose(); expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 0)).toBe(true); });
      f.device.draw(command);
      expect(f.events).not.toContain("fence-during-submit");
      expect(f.events.indexOf("submit-end")).toBeLessThan(f.events.indexOf("fence-after-submit"));
      await f.finishFences();
      expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 1)).toBe(true);
      f.device.endFrame();
    } finally { await f.close(); }
  });

  it("rejects reentrant frame mutations while a multiple-target submission is in flight", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
      const command = drawCommand(f.device);
      f.onSubmit(() => {
        f.onSubmit(undefined);
        expect(() => f.device.clear([1, 0, 0, 1])).toThrow(/cannot be reentered/i);
        expect(() => f.device.clearRenderTarget([0, 0, 0, 0], 1)).toThrow(/cannot be reentered/i);
        expect(() => f.device.setRenderTarget(null)).toThrow(/cannot be reentered/i);
        expect(() => f.device.endFrame()).toThrow(/cannot be reentered/i);
        expect(() => f.device.draw(command)).toThrow(/cannot be reentered/i);
      });
      f.device.draw(command);
      expect(f.device.getRenderTarget()).toBe(target);
      f.device.clear([0.5, 0.5, 0.5, 1]);
      f.device.clearRenderTarget([0, 0, 0, 0], 1);
      expect(f.passes.at(-2)!.colorAttachments.map((entry) => entry.loadOp)).toEqual(["clear", "clear"]);
      expect(f.passes.at(-1)!.colorAttachments.map((entry) => entry.loadOp)).toEqual(["load", "clear"]);
      f.device.endFrame(); target.dispose();
    } finally { await f.close(); }
  });

  it("rejects stale target changes before submitting a recorded draw", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
      f.device.clearRenderTarget([0, 0, 0, 0], 1);
      const before = f.events.filter((event) => event === "queued").length;
      f.onDraw(() => f.device.setRenderTarget(null));
      expect(() => f.device.draw(drawCommand(f.device))).toThrow(/changed before submission/i);
      expect(f.events.filter((event) => event === "queued")).toHaveLength(before);
      f.device.endFrame(); target.dispose();
    } finally { await f.close(); }
  });

  it("admits generated coverage only with the exact matching color, depth and attachment states", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true });
      const generated = generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", features: {
        "a3d.nativePrimitive": "triangles", "a3d.depthCoverage": true
      } }), { flags });
      const shader = f.device.createShaderProgram({ label: "coverage", marker: GENERATED_PROGRAM_MARKER,
        vertex: generated.vertex, fragment: generated.fragment, generatedProgram: generated.descriptor! });
      const vertices = f.device.createBuffer("vertex", 36, new Float32Array(9));
      const frame = f.device.createBuffer("uniform", 304, new Float32Array(76));
      const state = { depthTest: true, depthWrite: true, depthCompare: "less-equal" as const, cullMode: "none" as const, blend: false,
        colorAttachments: [undefined, { colorWrite: [true, false, false, false] as const, blendMode: "opaque" as const }] };
      const command: DrawCommand = { topology: "triangles", vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader, renderState: state };
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target); f.device.bindUniformBuffer(frame, 0);
      expect(() => f.device.draw({ ...command, renderState: { ...state, depthWrite: false } })).toThrow(/matching HDR\/color\/depth/i);
      expect(() => f.device.draw({ ...command, renderState: { ...state, colorAttachments: [undefined, { colorWrite: [true, true, true, true], blendMode: "opaque" }] } })).toThrow(/red-only/i);
      expect(() => f.device.draw({ ...command, renderState: { ...state, polygonOffset: { factor: 1, units: 1 } } })).toThrow(/matching HDR\/color\/depth/i);
      const mutable = shader as unknown as { generatedUnlit: Record<string, unknown>; modules: unknown[] };
      const originalProgram = mutable.generatedUnlit;
      mutable.generatedUnlit = { ...originalProgram };
      expect(() => f.device.draw(command)).toThrow(/shader program or native stages changed/i);
      mutable.generatedUnlit = originalProgram;
      const originalFragment = mutable.modules[1];
      f.onDraw(() => { mutable.modules[1] = {}; });
      expect(() => f.device.draw(command)).toThrow(/shader program or native stages changed/i);
      f.onDraw(undefined); mutable.modules[1] = originalFragment;
      expect(f.events.filter((event) => event === "queued")).toHaveLength(0);
      f.device.draw(command);
      expect(f.passes.at(-1)!.colorAttachments).toHaveLength(2);
      expect(f.pipelines.at(-1)!.fragment!.targets.map((entry) => entry.writeMask)).toEqual([15, 1]);
      const single = f.device.createRenderTarget({ width: 2, height: 2, format: "rgba16f", depth: "texture" });
      f.device.setRenderTarget(single);
      expect(() => f.device.draw(command)).toThrow(/paired MRT target/i);
      f.device.endFrame(); target.dispose(); single.dispose();
    } finally { await f.close(); }
  });

  it("invalidates every attachment on device loss even if its completion fence is pending", async () => {
    const f = await fixture();
    try {
      const target = multiTarget(f.device);
      f.device.beginFrame(2, 2); f.device.setRenderTarget(target);
      f.device.draw(drawCommand(f.device));
      target.dispose();
      expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 0)).toBe(true);
      f.lose();
      await Promise.resolve(); await Promise.resolve();
      expect(f.textures.filter((texture) => texture.label.startsWith("mrt")).every((texture) => texture.destroyed === 1)).toBe(true);
      expect(() => f.device.getNativeTexture(target.colorTextures![1]!)).toThrow();
    } finally { await f.close(); }
  });

  it("resolves per-attachment overrides into pipeline identity and dynamic blend constants", () => {
    const input = { state: { depthTest: false, depthWrite: false, depthCompare: "always" as const, cullMode: "none" as const, blend: false },
      topology: "triangles" as const, colorFormats: ["rgba16float", "rgba8unorm"], sampleCount: 1, targetWidth: 2, targetHeight: 2,
      deviceGeneration: 1, targetKey: "target", targetGeneration: 1, shaderKey: "shader", layoutKey: "layout" };
    const base = resolveNativeRenderState(input);
    const changed = resolveNativeRenderState({ ...input, state: { ...input.state, blendConstant: [0.1, 0.2, 0.3, 0.4], colorAttachments: [undefined, {
      colorWrite: [true, false, false, false], blendMode: { kind: "custom", color: { equation: "add", src: "constant", dst: "one" }, alpha: { equation: "add", src: "one", dst: "zero" } }
    }] } });
    expect(changed.pipelineKey).not.toBe(base.pipelineKey);
    expect(changed.colorTargets[1]!.writeMask).toBe(1);
    expect(changed.dynamic.blendConstant).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(() => resolveNativeRenderState({ ...input, colorFormats: ["rgba8unorm", null], state: { ...input.state, colorAttachments: [undefined, { blendMode: "opaque" }] } })).toThrow(/unused/i);
  });
});
