import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import { createRenderDevice } from "../../../packages/rendering/src";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import type { WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";
import { negotiateDepthConvention } from "../../../packages/rendering/src/DepthConvention";
import type { RenderDevice, RenderShaderProgram, RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import type { WebGPUDevice, WebGPURenderPipelineWarmRequest } from "../../../packages/rendering/src/WebGPUDevice";
import { ComputeContext } from "../../../packages/rendering/src/compute/ComputeContext";
import type { ComputeGPUDeviceLike } from "../../../packages/rendering/src/compute/types";
import { createProofWebGPU } from "./webgpu-rtt-mock";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async (): Promise<void> => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

type Pipeline = { readonly label?: string; getBindGroupLayout(): object };

/** Proof mock plus an async pipeline entry point; `hold` keeps each compile pending until released. */
async function webgpuFixture(options: { readonly hold?: boolean } = {}) {
  const mock = createProofWebGPU();
  const native = mock.native as unknown as Record<string, unknown> & { createRenderPipeline(descriptor: Record<string, unknown>): Pipeline };
  const lost = deferred<{ reason: string; message: string }>();
  Object.defineProperty(native, "lost", { configurable: true, value: lost.promise });
  const sync = vi.spyOn(native, "createRenderPipeline");
  const pending: { readonly descriptor: Record<string, unknown>; readonly job: ReturnType<typeof deferred<Pipeline>> }[] = [];
  const asyncCreate = vi.fn((descriptor: Record<string, unknown>): Promise<Pipeline> => {
    const pipeline: Pipeline = { label: descriptor.label as string, getBindGroupLayout: () => ({}) };
    if (!options.hold) return Promise.resolve(pipeline);
    const job = deferred<Pipeline>();
    pending.push({ descriptor, job });
    return job.promise;
  });
  native.createRenderPipelineAsync = asyncCreate;
  const device = await createRenderDevice({ backend: "webgpu", webgpu: mock.webgpu }) as RenderDevice & WebGPUDevice;
  const shader = device.createShaderProgram({
    label: "warm-shader", marker: "@aura3d-shader:wp03-warm",
    vertex: "// @aura3d-shader:wp03-warm\nin vec3 position;\nvoid main() { gl_Position = vec4(position, 1.0); }",
    fragment: "// @aura3d-shader:wp03-warm\nuniform vec4 u_color;\nout vec4 outColor;\nvoid main() { outColor = u_color; }",
    portableBindings: [{ name: "u_color", kind: "vec4", required: true }],
    webgpu: {
      vertex: "/* @aura3d-bindings */\n@vertex fn vs_main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(position, 1.0); }",
      fragment: "/* @aura3d-bindings */\n@fragment fn fs_main() -> @location(0) vec4<f32> { return aura.u_color; }"
    }
  });
  const target = device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: "texture" });
  const request = (change: Partial<WebGPURenderPipelineWarmRequest> = {}): WebGPURenderPipelineWarmRequest => ({
    shader, vertexFormat: VertexFormat.P3, topology: "triangles", target,
    renderState: { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" }, ...change
  });
  const created = (): number => device.getDiagnostics().nativeRenderPipelinesCreated ?? 0;
  return { mock, native, device, shader, target, request, sync, asyncCreate, pending, lost, created };
}

function drawTriangle(device: RenderDevice, shader: RenderShaderProgram, target: RenderTarget): void {
  const vertices = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);
  const buffer = device.createBuffer("vertex", vertices.byteLength, vertices);
  device.setRenderTarget(target);
  device.beginFrame(8, 8);
  device.draw({ label: "warm-draw", topology: "triangles", vertexBuffer: buffer, vertexFormat: VertexFormat.P3, vertexCount: 3, shader,
    renderState: { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" },
    uniforms: new Map([["u_color", [1, 0, 0, 1]]]) });
  device.endFrame();
  device.setRenderTarget(null);
  buffer.dispose();
}

describe("WP-03 native render pipeline warmup", () => {
  it("creates the pipeline asynchronously without presenting, and the first matching draw is a cache hit", async () => {
    const f = await webgpuFixture();
    try {
      const encoders = vi.spyOn(f.native as unknown as { createCommandEncoder(): unknown }, "createCommandEncoder");
      await expect(f.device.warmRenderPipelines([f.request(), f.request()])).resolves.toEqual({ created: 1, cached: 0, skipped: 0 });
      expect(f.asyncCreate).toHaveBeenCalledTimes(1);
      expect(f.sync).not.toHaveBeenCalled();
      expect(encoders).not.toHaveBeenCalled();
      expect(f.mock.events).toEqual([]);
      expect(f.created()).toBe(1);
      drawTriangle(f.device, f.shader, f.target);
      expect(f.mock.events).toContain("triangle");
      // The draw resolved the same identity and reused the warmed pipeline.
      expect(f.sync).not.toHaveBeenCalled();
      expect(f.created()).toBe(1);
      await expect(f.device.warmRenderPipelines([f.request()])).resolves.toEqual({ created: 0, cached: 1, skipped: 0 });
    } finally { f.target.dispose(); f.device.dispose(); }
  });

  it("keys the cache by target formats, sample count, vertex layout, draw state and depth convention", async () => {
    const f = await webgpuFixture();
    const hdr = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: "texture" });
    const msaa = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: "renderbuffer", sampleCount: 4 });
    const noDepth = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    try {
      await f.device.warmRenderPipelines([f.request()]);
      const variants = [
        f.request({ target: hdr }), f.request({ target: msaa }), f.request({ target: noDepth }),
        f.request({ vertexFormat: VertexFormat.P3N3 }),
        f.request({ renderState: { depthTest: true, depthWrite: false, cullMode: "back", blend: false, depthCompare: "less-equal" } })
      ];
      await expect(f.device.warmRenderPipelines(variants)).resolves.toEqual({ created: variants.length, cached: 0, skipped: 0 });
      const formats = f.asyncCreate.mock.calls.map(([descriptor]) => (descriptor.fragment as { targets: { format: string }[] }).targets[0]!.format);
      expect(formats).toEqual(["rgba8unorm", "rgba16float", "rgba8unorm", "rgba8unorm", "rgba8unorm", "rgba8unorm"]);
      expect(f.asyncCreate.mock.calls[2]![0].multisample).toMatchObject({ count: 4 });
      expect(f.asyncCreate.mock.calls[3]![0].depthStencil).toBeUndefined();
      expect((f.asyncCreate.mock.calls[4]![0].vertex as { buffers: { arrayStride: number }[] }).buffers[0]!.arrayStride).toBe(24);
      // Reversed-Z flips the compare: the standard pipeline must not be reused.
      f.device.setDepthConvention!(negotiateDepthConvention({ mode: "reversed" }, { clipRange: "zero-to-one", reversed: true, logarithmic: false }));
      await expect(f.device.warmRenderPipelines([f.request()])).resolves.toEqual({ created: 1, cached: 0, skipped: 0 });
      expect(f.asyncCreate.mock.calls.at(-1)![0].depthStencil).toMatchObject({ depthCompare: "greater-equal" });
      await expect(f.device.warmRenderPipelines([f.request()])).resolves.toEqual({ created: 0, cached: 1, skipped: 0 });
    } finally { for (const target of [hdr, msaa, noDepth, f.target]) target.dispose(); f.device.dispose(); }
  });

  it("stops further creation on cancellation and rejects with a stable abort result", async () => {
    const f = await webgpuFixture({ hold: true });
    const other = f.device.createRenderTarget({ width: 8, height: 8, format: "rgba16f", depth: "texture" });
    try {
      const controller = new AbortController();
      const warm = f.device.warmRenderPipelines([f.request(), f.request({ target: other }), f.request({ vertexFormat: VertexFormat.P3N3 })], { signal: controller.signal });
      await flush();
      expect(f.asyncCreate).toHaveBeenCalledTimes(1);
      controller.abort();
      await expect(warm).rejects.toMatchObject({ name: "AbortError" });
      // The issued compile settles later; nothing further is created or published.
      f.pending[0]!.job.resolve({ getBindGroupLayout: () => ({}) });
      await flush();
      expect(f.asyncCreate).toHaveBeenCalledTimes(1);
      expect(f.created()).toBe(0);
      // An already-aborted signal is rejected before any work.
      await expect(f.device.warmRenderPipelines([f.request()], { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
      expect(f.asyncCreate).toHaveBeenCalledTimes(1);
    } finally { other.dispose(); f.target.dispose(); f.device.dispose(); }
  });

  it("rejects stale warmups on device loss and never reuses them on a new device generation", async () => {
    const f = await webgpuFixture({ hold: true });
    const warm = f.device.warmRenderPipelines([f.request(), f.request({ vertexFormat: VertexFormat.P3N3 })]);
    await flush();
    expect(f.asyncCreate).toHaveBeenCalledTimes(1);
    f.lost.resolve({ reason: "unknown", message: "test loss" });
    await expect(warm).rejects.toMatchObject({ code: "DEVICE_LOST" });
    f.pending[0]!.job.resolve({ getBindGroupLayout: () => ({}) });
    await flush();
    expect(f.asyncCreate).toHaveBeenCalledTimes(1);
    expect(f.created()).toBe(0);
    await expect(f.device.warmRenderPipelines([f.request()])).rejects.toThrow();

    const next = await webgpuFixture();
    try {
      expect(next.device.generation).not.toBe(f.device.generation);
      // The previous generation's program is foreign here; its request is skipped, not reused.
      await expect(next.device.warmRenderPipelines([{ ...next.request(), shader: f.shader }])).resolves.toEqual({ created: 0, cached: 0, skipped: 1 });
      await expect(next.device.warmRenderPipelines([next.request()])).resolves.toEqual({ created: 1, cached: 0, skipped: 0 });
    } finally { next.target.dispose(); next.device.dispose(); }
    try { f.target.dispose(); f.device.dispose(); } catch { /* lost device teardown is covered elsewhere */ }
  });
});

/** Canvas-backed native mock: records pipeline creation and submitted render passes only. */
function canvasNative() {
  const submits: string[] = [];
  const pipeline = () => ({ getBindGroupLayout: (index: number) => ({ index }) });
  const native = {
    lost: new Promise<never>(() => {}),
    features: new Set<string>(),
    limits: { maxBufferSize: 1_000_000, maxVertexBuffers: 8 },
    queue: {
      writeBuffer() {}, writeTexture() {},
      submit(commands: readonly { labels: readonly string[] }[]) { for (const command of commands) submits.push(...command.labels); },
      onSubmittedWorkDone: () => Promise.resolve()
    },
    pushErrorScope: vi.fn(), popErrorScope: vi.fn(() => Promise.resolve(null)),
    createBuffer: (descriptor: { size: number }) => ({ bytes: new Uint8Array(descriptor.size), destroy: vi.fn() }),
    createTexture: () => { const handle = { createView: () => ({ texture: handle }), destroy() {} }; return handle; },
    createSampler: () => ({}),
    createShaderModule: (descriptor: object) => descriptor,
    createRenderPipeline: vi.fn(pipeline),
    createRenderPipelineAsync: vi.fn(async () => pipeline()),
    createBindGroup: (descriptor: object) => descriptor,
    createCommandEncoder() {
      const labels: string[] = [];
      return {
        copyTextureToBuffer() {},
        beginRenderPass(descriptor: { label?: string }) {
          labels.push(descriptor.label ?? "");
          return { setPipeline() {}, setVertexBuffer() {}, setIndexBuffer() {}, setBindGroup() {}, setViewport() {}, setScissorRect() {},
            setBlendConstant() {}, setStencilReference() {}, draw() {}, drawIndexed() {}, end() {} };
        },
        finish: () => ({ labels })
      };
    },
    destroy: vi.fn()
  };
  const gpu = { requestAdapter: async () => ({ requestDevice: async () => native }), getPreferredCanvasFormat: () => "bgra8unorm" } as unknown as WebGPULike;
  const context = { configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) };
  const canvas = { width: 8, height: 8, getContext: () => context } as unknown as HTMLCanvasElement;
  return { native, gpu, canvas, submits };
}

describe("WP-03 renderer precompile builds forward pipelines", () => {
  it("creates the generated program's canvas pipeline during precompile so the first frame creates none", async () => {
    const f = canvasNative();
    const renderer = await Renderer.create({ backend: "webgpu", canvas: f.canvas, webgpu: f.gpu, width: 8, height: 8,
      qrFlags: createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: false }) });
    const geometry = Geometry.triangle();
    const material = new UnlitMaterial();
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, shadow: { enabled: false }, renderItems: [{ label: "warm", geometry, material }] };
    const begin = vi.spyOn(renderer.device, "beginFrame");
    try {
      await renderer.precompile(source);
      expect(f.native.createRenderPipelineAsync).toHaveBeenCalled();
      expect(f.native.createRenderPipeline).not.toHaveBeenCalled();
      expect(begin).not.toHaveBeenCalled();
      expect(f.submits).toEqual([]);
      const warmed = renderer.device.getDiagnostics().nativeRenderPipelinesCreated;
      expect(warmed).toBeGreaterThan(0);
      renderer.render(source);
      expect(f.submits.length).toBeGreaterThan(0);
      expect(f.native.createRenderPipeline).not.toHaveBeenCalled();
      expect(renderer.device.getDiagnostics().nativeRenderPipelinesCreated).toBe(warmed);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); }
  });
});

describe("WP-03 coordinated compute variant warmup", () => {
  const wgsl = (size: number) => `@group(0) @binding(0) var<storage, read_write> data: array<f32>;\n@compute @workgroup_size(${size}) fn main(@builtin(global_invocation_id) id: vec3<u32>) { data[id.x] = 1.0; }`;
  const bindings = [{ binding: 0, type: "storage" as const }];

  function computeFixture() {
    const lost = deferred<unknown>();
    const pending: ReturnType<typeof deferred<{ getBindGroupLayout(index: number): unknown }>>[] = [];
    let hold = false;
    const createComputePipelineAsync = vi.fn((_descriptor: object) => {
      if (!hold) return Promise.resolve({ getBindGroupLayout: () => ({}) });
      const job = deferred<{ getBindGroupLayout(index: number): unknown }>();
      pending.push(job);
      return job.promise;
    });
    const device = {
      lost: lost.promise,
      queue: { submit: vi.fn(), writeBuffer: vi.fn() },
      createShaderModule: vi.fn(() => ({})),
      createComputePipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createComputePipelineAsync,
      createBuffer: vi.fn(),
      createBindGroup: vi.fn(),
      createCommandEncoder: vi.fn()
    } as unknown as ComputeGPUDeviceLike;
    return { context: new ComputeContext(device), device, lost, pending, createComputePipelineAsync, hold: () => { hold = true; } };
  }

  it("warms variants once by layout identity and keeps distinct layouts distinct", async () => {
    const f = computeFixture();
    const [a, b] = await f.context.warmPipelineVariants([{ wgsl: wgsl(64), bindings }, { wgsl: wgsl(32), bindings }]);
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(2);
    expect(a).not.toBe(b);
    const [again, other] = await f.context.warmPipelineVariants([{ wgsl: wgsl(64), bindings: [{ type: "storage", binding: 0 }] }, { wgsl: wgsl(64), bindings: [{ binding: 0, type: "read-only-storage" }] }]);
    expect(again).toBe(a);
    expect(other).not.toBe(a);
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(3);
    expect(f.device.queue.submit).not.toHaveBeenCalled();
    // A retired variant is compiled again rather than returned.
    a!.dispose();
    const [fresh] = await f.context.warmPipelineVariants([{ wgsl: wgsl(64), bindings }]);
    expect(fresh).not.toBe(a);
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(4);
    f.context.dispose();
  });

  it("cancels remaining variants with the abort reason and rejects stale generations", async () => {
    const f = computeFixture();
    f.hold();
    const controller = new AbortController();
    const reason = new Error("stop warming");
    const warm = f.context.warmPipelineVariants([{ wgsl: wgsl(64), bindings }, { wgsl: wgsl(32), bindings }], { signal: controller.signal });
    await flush();
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(1);
    controller.abort(reason);
    await expect(warm).rejects.toBe(reason);
    f.pending[0]!.resolve({ getBindGroupLayout: () => ({}) });
    await flush();
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(1);

    const lossWarm = f.context.warmPipelineVariants([{ wgsl: wgsl(16), bindings }]);
    await flush();
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(2);
    f.lost.resolve({ reason: "destroyed" });
    await expect(lossWarm).rejects.toMatchObject({ code: "compute-disposed" });
    f.pending[1]!.resolve({ getBindGroupLayout: () => ({}) });
    await flush();
    await expect(f.context.warmPipelineVariants([{ wgsl: wgsl(16), bindings }])).rejects.toMatchObject({ code: "compute-disposed" });
    expect(f.createComputePipelineAsync).toHaveBeenCalledTimes(2);
    f.context.dispose();
  });
});
