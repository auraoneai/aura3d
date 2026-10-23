/**
 * SH-04 / L1-12 — public WebGPU-only compute surface (WGSL required).
 * Driven by a fake `GPUDevice`: real-GPU execution is NOT covered here (the
 * remote runner's headless SwiftShader WebGPU cannot present or run it, R-22).
 */

import { describe, expect, it } from "vitest";
import { ComputeContext, ComputeError, createComputeContext, COMPUTE_BUFFER_USAGE } from "../../../packages/rendering/src/compute/index";
import type { ComputeGPUDeviceLike } from "../../../packages/rendering/src/compute/index";
import { AuraRuntimeError } from "../../../packages/engine/src/agent-api/compiler/errors";
import { compute, createAuraApp, createComputeSurface, scene } from "../../../packages/engine/src/agent-api/index";
import { compute as publicCompute } from "../../../packages/engine/src/public/index";

class FakeBuffer {
  destroyed = 0;
  mapped = false;
  readonly data: Uint8Array;
  constructor(readonly descriptor: { label?: string; size: number; usage: number }, private readonly failMap: () => boolean) {
    this.data = new Uint8Array(descriptor.size);
  }
  get size(): number { return this.descriptor.size; }
  destroy(): void { this.destroyed += 1; }
  async mapAsync(): Promise<void> {
    if (this.failMap()) throw new Error("map failed");
    this.mapped = true;
  }
  getMappedRange(): ArrayBuffer { return this.data.buffer as ArrayBuffer; }
  unmap(): void { this.mapped = false; }
}

interface Recorded {
  shaderModules: { label?: string; code: string }[];
  pipelines: { label?: string; layout: unknown; compute: { module: unknown; entryPoint: string } }[];
  bindGroups: { layout: unknown; entries: { binding: number; resource: { buffer: FakeBuffer } }[] }[];
  passes: { pipeline: unknown; bindGroup: unknown; dispatch: [number, number | undefined, number | undefined] | null; ended: boolean }[];
  submits: number;
  buffers: FakeBuffer[];
  writes: { buffer: FakeBuffer; offset: number; bytes: number }[];
}

function fakeDevice(options: { limits?: Record<string, number>; failMap?: boolean } = {}) {
  const log: Recorded = { shaderModules: [], pipelines: [], bindGroups: [], passes: [], submits: 0, buffers: [], writes: [] };
  const state = { failMap: options.failMap ?? false };
  const device: ComputeGPUDeviceLike = {
    limits: options.limits,
    queue: {
      submit: () => { log.submits += 1; },
      writeBuffer: (buffer, offset, data) => {
        const target = buffer as FakeBuffer;
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        target.data.set(bytes, offset);
        log.writes.push({ buffer: target, offset, bytes: bytes.byteLength });
      },
      onSubmittedWorkDone: async () => undefined
    },
    createShaderModule: (descriptor) => { log.shaderModules.push(descriptor); return { module: log.shaderModules.length }; },
    createComputePipeline: (descriptor) => {
      log.pipelines.push(descriptor as Recorded["pipelines"][number]);
      return { getBindGroupLayout: (index: number) => ({ layoutFor: log.pipelines.length, index }) };
    },
    createBuffer: (descriptor) => {
      const buffer = new FakeBuffer(descriptor, () => state.failMap);
      log.buffers.push(buffer);
      return buffer;
    },
    createBindGroup: (descriptor) => { log.bindGroups.push(descriptor as Recorded["bindGroups"][number]); return { bindGroup: log.bindGroups.length }; },
    createCommandEncoder: () => {
      const pass: Recorded["passes"][number] = { pipeline: null, bindGroup: null, dispatch: null, ended: false };
      return {
        beginComputePass: () => {
          log.passes.push(pass);
          return {
            setPipeline: (pipeline: unknown) => { pass.pipeline = pipeline; },
            setBindGroup: (_index: number, group: unknown) => { pass.bindGroup = group; },
            dispatchWorkgroups: (x: number, y?: number, z?: number) => { pass.dispatch = [x, y, z]; },
            end: () => { pass.ended = true; }
          };
        },
        copyBufferToBuffer: (source: unknown, sourceOffset: number, destination: unknown, destinationOffset: number, size: number) => {
          (destination as FakeBuffer).data.set((source as FakeBuffer).data.subarray(sourceOffset, sourceOffset + size), destinationOffset);
        },
        finish: () => ({ commandBuffer: true })
      };
    }
  };
  return { device, log, state };
}

const WGSL = `
@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: vec4<f32>;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) { data[id.x] = data[id.x] * params.x; }
`;
const BINDINGS = [
  { binding: 0, type: "storage" as const },
  { binding: 1, type: "uniform" as const }
];

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
};

describe("SH-04 compute: pipeline validation", () => {
  it("rejects a device that is not a WebGPU GPUDevice", () => {
    expect(codeOf(() => createComputeContext({} as ComputeGPUDeviceLike))).toBe("compute-invalid-spec");
    expect(codeOf(() => createComputeContext({ createShaderModule() {}, createComputePipeline() {}, createBuffer() {}, createBindGroup() {}, createCommandEncoder() {}, queue: {} } as unknown as ComputeGPUDeviceLike))).toBe("compute-invalid-spec");
  });

  it("requires WGSL: missing, empty and GLSL-looking sources fail with compute-wgsl-required", () => {
    const ctx = createComputeContext(fakeDevice().device);
    expect(codeOf(() => ctx.createPipeline({} as never))).toBe("compute-wgsl-required");
    expect(codeOf(() => ctx.createPipeline({ wgsl: "   " }))).toBe("compute-wgsl-required");
    expect(codeOf(() => ctx.createPipeline({ wgsl: "#version 300 es\nvoid main() {}" }))).toBe("compute-wgsl-required");
    expect(codeOf(() => ctx.createPipeline({ wgsl: "precision highp float; void main() {}" }))).toBe("compute-wgsl-required");
  });

  it("requires an @compute entry point whose name matches `entryPoint`", () => {
    const ctx = createComputeContext(fakeDevice().device);
    expect(codeOf(() => ctx.createPipeline({ wgsl: "fn main() {}" }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createPipeline({ wgsl: WGSL, entryPoint: "missing" }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createPipeline({ wgsl: WGSL, entryPoint: "bad name" }))).toBe("compute-invalid-spec");
    const custom = ctx.createPipeline({ wgsl: WGSL.replace("fn main", "fn simulate"), entryPoint: "simulate", bindings: BINDINGS });
    expect(custom.entryPoint).toBe("simulate");
  });

  it("reads @workgroup_size from the WGSL and rejects a contradicting `workgroupSize`", () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const pipeline = ctx.createPipeline({ wgsl: WGSL, bindings: BINDINGS });
    expect(pipeline.workgroupSize).toEqual([64, 1, 1]);
    expect(log.pipelines[0]).toMatchObject({ layout: "auto", compute: { entryPoint: "main" } });
    expect(log.shaderModules[0]!.code).toBe(WGSL);
    expect(codeOf(() => ctx.createPipeline({ wgsl: WGSL, workgroupSize: [32] }))).toBe("compute-invalid-spec");
    expect(ctx.createPipeline({ wgsl: WGSL, workgroupSize: [64] }).workgroupSize).toEqual([64, 1, 1]);
    const threeD = ctx.createPipeline({ wgsl: "@compute @workgroup_size(8, 4, 2) fn main() {}" });
    expect(threeD.workgroupSize).toEqual([8, 4, 2]);
    const reversed = ctx.createPipeline({ wgsl: "@workgroup_size(16, 16) @compute fn main() {}" });
    expect(reversed.workgroupSize).toEqual([16, 16, 1]);
  });

  it("uses the requested workgroupSize when the shader size is not a literal, defaulting to 64", () => {
    const ctx = createComputeContext(fakeDevice().device);
    const overridden = ctx.createPipeline({ wgsl: "override wg: u32 = 32; @compute @workgroup_size(wg) fn main() {}", workgroupSize: [32] });
    expect(overridden.workgroupSize).toEqual([32, 1, 1]);
    const plain = ctx.createPipeline({ wgsl: "override wg: u32 = 32; @compute @workgroup_size(wg) fn main() {}" });
    expect(plain.workgroupSize).toEqual([64, 1, 1]);
  });

  it("enforces workgroup size and invocation limits (device limits override the defaults)", () => {
    const ctx = createComputeContext(fakeDevice().device);
    expect(codeOf(() => ctx.createPipeline({ wgsl: "@compute @workgroup_size(512) fn main() {}" }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createPipeline({ wgsl: "@compute @workgroup_size(1, 1, 128) fn main() {}" }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createPipeline({ wgsl: "@compute @workgroup_size(16, 16, 2) fn main() {}" }))).toBe("compute-invalid-spec");
    const roomy = createComputeContext(fakeDevice({ limits: { maxComputeWorkgroupSizeX: 1024, maxComputeInvocationsPerWorkgroup: 1024 } }).device);
    expect(roomy.createPipeline({ wgsl: "@compute @workgroup_size(1024) fn main() {}" }).workgroupSize).toEqual([1024, 1, 1]);
  });

  it("validates bindings: indices, types, duplicates and per-stage limits", () => {
    const ctx = createComputeContext(fakeDevice().device);
    const make = (bindings: unknown) => () => ctx.createPipeline({ wgsl: WGSL, bindings: bindings as never });
    expect(codeOf(make("nope"))).toBe("compute-invalid-spec");
    expect(codeOf(make([{ binding: -1, type: "storage" }]))).toBe("compute-invalid-spec");
    expect(codeOf(make([{ binding: 0, type: "texture" }]))).toBe("compute-invalid-spec");
    expect(codeOf(make([{ binding: 0, type: "storage" }, { binding: 0, type: "uniform" }]))).toBe("compute-invalid-spec");
    const nine = Array.from({ length: 9 }, (_, binding) => ({ binding, type: "storage" as const }));
    expect(codeOf(make(nine))).toBe("compute-invalid-spec");
    const thirteen = Array.from({ length: 13 }, (_, binding) => ({ binding, type: "uniform" as const }));
    expect(codeOf(make(thirteen))).toBe("compute-invalid-spec");
    const eightStorage = Array.from({ length: 8 }, (_, binding) => ({ binding, type: "read-only-storage" as const }));
    expect(ctx.createPipeline({ wgsl: WGSL, bindings: eightStorage }).bindings).toHaveLength(8);
  });
});

describe("SH-04 compute: buffers", () => {
  it("creates storage and uniform buffers with the right usage flags and 4-byte rounding", () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const storage = ctx.createBuffer({ size: 10 });
    expect(storage.size).toBe(12);
    expect(storage.usage).toBe("storage");
    expect(log.buffers[0]!.descriptor.usage).toBe(COMPUTE_BUFFER_USAGE.STORAGE | COMPUTE_BUFFER_USAGE.COPY_SRC | COMPUTE_BUFFER_USAGE.COPY_DST);
    const uniform = ctx.createBuffer({ size: 16, usage: "uniform" });
    expect(log.buffers[1]!.descriptor.usage).toBe(COMPUTE_BUFFER_USAGE.UNIFORM | COMPUTE_BUFFER_USAGE.COPY_SRC | COMPUTE_BUFFER_USAGE.COPY_DST);
    expect(uniform.usage).toBe("uniform");
  });

  it("uploads initial data (padded to 4 bytes) and validates specs and limits", () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const buffer = ctx.createBuffer({ data: new Float32Array([1, 2, 3]) });
    expect(buffer.size).toBe(12);
    expect([...new Float32Array(log.buffers[0]!.data.buffer)]).toEqual([1, 2, 3]);
    const padded = ctx.createBuffer({ data: new Uint8Array([1, 2, 3]) });
    expect(padded.size).toBe(4);
    expect([...log.buffers[1]!.data]).toEqual([1, 2, 3, 0]);
    const fromArrayBuffer = ctx.createBuffer({ data: new Float32Array([5]).buffer });
    expect(fromArrayBuffer.size).toBe(4);
    expect(codeOf(() => ctx.createBuffer({}))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 0 }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 1.5 }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 8, usage: "vertex" as never }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 4, data: new Float32Array(4) }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 65540, usage: "uniform" }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.createBuffer({ size: 134217732 }))).toBe("compute-invalid-spec");
  });

  it("write(): aligned offsets only, bounds-checked, uploads through the queue", () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const buffer = ctx.createBuffer({ size: 16 });
    buffer.write(new Float32Array([7, 8]), 8);
    expect(log.writes.at(-1)).toMatchObject({ offset: 8, bytes: 8 });
    expect(codeOf(() => buffer.write(new Float32Array(1), 2))).toBe("compute-invalid-spec");
    expect(codeOf(() => buffer.write(new Uint8Array(3)))).toBe("compute-invalid-spec");
    expect(codeOf(() => buffer.write(new Float32Array(2), 12))).toBe("compute-invalid-spec");
  });

  it("read(): copies through a MAP_READ staging buffer, returns a detached copy, destroys the staging buffer", async () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const buffer = ctx.createBuffer({ data: new Float32Array([1.5, 2.5, 3.5, 4.5]) });
    const submitsBefore = log.submits;
    const bytes = await buffer.read();
    const staging = log.buffers[1]!;
    expect(staging.descriptor.usage).toBe(COMPUTE_BUFFER_USAGE.MAP_READ | COMPUTE_BUFFER_USAGE.COPY_DST);
    expect(staging.descriptor.size).toBe(16);
    expect(staging.destroyed).toBe(1);
    expect(staging.mapped).toBe(false);
    expect(log.submits).toBe(submitsBefore + 1);
    expect([...new Float32Array(bytes)]).toEqual([1.5, 2.5, 3.5, 4.5]);
    staging.data.fill(0);
    expect([...new Float32Array(bytes)]).toEqual([1.5, 2.5, 3.5, 4.5]);
  });

  it("read(): a failed map rejects with compute-read-failed and still destroys the staging buffer", async () => {
    const { device, log } = fakeDevice({ failMap: true });
    const ctx = createComputeContext(device);
    const buffer = ctx.createBuffer({ size: 8 });
    await expect(buffer.read()).rejects.toMatchObject({ code: "compute-read-failed" });
    expect(log.buffers[1]!.destroyed).toBe(1);
  });

  it("dispose() is idempotent and a disposed buffer cannot be written, read or bound", async () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const buffer = ctx.createBuffer({ size: 8 });
    buffer.dispose();
    buffer.dispose();
    expect(log.buffers[0]!.destroyed).toBe(1);
    expect(buffer.disposed).toBe(true);
    expect(codeOf(() => buffer.write(new Float32Array(2)))).toBe("compute-disposed");
    await expect(buffer.read()).rejects.toBeInstanceOf(ComputeError);
    await expect(buffer.read()).rejects.toMatchObject({ code: "compute-disposed" });
  });
});

describe("SH-04 compute: dispatch", () => {
  function setup() {
    const harness = fakeDevice();
    const ctx = createComputeContext(harness.device);
    const pipeline = ctx.createPipeline({ wgsl: WGSL, bindings: BINDINGS });
    const data = ctx.createBuffer({ data: new Float32Array(256) });
    const params = ctx.createBuffer({ data: new Float32Array([2, 0, 0, 0]), usage: "uniform" });
    return { ...harness, ctx, pipeline, data, params };
  }

  it("encodes one compute pass with the pipeline, the layout-derived bind group and the exact workgroup counts", () => {
    const { ctx, log, pipeline, data, params } = setup();
    const result = ctx.dispatch({ pipeline, bindings: { 0: data, 1: params }, workgroups: [4] });
    expect(result).toEqual({ workgroups: [4, 1, 1], invocations: 256 });
    expect(log.passes).toHaveLength(1);
    expect(log.passes[0]).toMatchObject({ dispatch: [4, 1, 1], ended: true });
    expect(log.passes[0]!.pipeline).toBe(pipeline.native);
    expect(log.bindGroups).toHaveLength(1);
    expect(log.bindGroups[0]!.layout).toEqual({ layoutFor: 1, index: 0 });
    expect(log.bindGroups[0]!.entries.map((entry) => [entry.binding, entry.resource.buffer])).toEqual([
      [0, data.native],
      [1, params.native]
    ]);
    expect(log.submits).toBeGreaterThanOrEqual(1);
  });

  it("accepts binding pairs and 3D workgroups, and converts `items` with ceil(items / workgroupSize)", () => {
    const { ctx, log, pipeline, data, params } = setup();
    const pairs = [{ binding: 1, buffer: params }, { binding: 0, buffer: data }];
    expect(ctx.dispatch({ pipeline, bindings: pairs, workgroups: [2, 3, 4] })).toEqual({ workgroups: [2, 3, 4], invocations: 2 * 3 * 4 * 64 });
    expect(log.passes.at(-1)!.dispatch).toEqual([2, 3, 4]);
    const items = ctx.dispatch({ pipeline, bindings: { 0: data, 1: params }, items: [1000] });
    expect(items.workgroups).toEqual([16, 1, 1]);
    expect(log.passes.at(-1)!.dispatch).toEqual([16, 1, 1]);
  });

  it("rejects missing, undeclared, duplicated and wrong-kind bindings", () => {
    const { ctx, pipeline, data, params } = setup();
    const other = ctx.createBuffer({ size: 16 });
    const run = (bindings: unknown) => () => ctx.dispatch({ pipeline, bindings: bindings as never, workgroups: [1] });
    expect(codeOf(run({ 0: data }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ 0: data, 1: params, 2: other }))).toBe("compute-invalid-spec");
    expect(codeOf(run([{ binding: 0, buffer: data }, { binding: 0, buffer: data }, { binding: 1, buffer: params }]))).toBe("compute-invalid-spec");
    expect(codeOf(run({ 0: params, 1: data }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ 0: data, 1: { native: {} } }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ "-1": data, 1: params }))).toBe("compute-invalid-spec");
  });

  it("rejects bad workgroup counts and ambiguous or missing sizes", () => {
    const { ctx, pipeline, data, params } = setup();
    const bindings = { 0: data, 1: params };
    const run = (extra: object) => () => ctx.dispatch({ pipeline, bindings, ...extra } as never);
    expect(codeOf(run({}))).toBe("compute-invalid-spec");
    expect(codeOf(run({ workgroups: [1], items: [64] }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ workgroups: [0] }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ workgroups: [1.5] }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ workgroups: [1, 2, 3, 4] }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ workgroups: [65536] }))).toBe("compute-invalid-spec");
    expect(codeOf(run({ items: [64 * 65536] }))).toBe("compute-invalid-spec");
    expect(ctx.dispatch({ pipeline, bindings, workgroups: [65535] }).workgroups).toEqual([65535, 1, 1]);
  });

  it("rejects pipelines and buffers from another context, and disposed handles", () => {
    const { ctx, pipeline, data, params } = setup();
    const foreign = createComputeContext(fakeDevice().device);
    const foreignBuffer = foreign.createBuffer({ size: 16 });
    const foreignPipeline = foreign.createPipeline({ wgsl: WGSL, bindings: BINDINGS });
    expect(codeOf(() => ctx.dispatch({ pipeline: foreignPipeline, bindings: { 0: data, 1: params }, workgroups: [1] }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.dispatch({ pipeline, bindings: { 0: foreignBuffer, 1: params }, workgroups: [1] }))).toBe("compute-invalid-spec");
    expect(codeOf(() => ctx.dispatch({ pipeline: {} as never, bindings: {}, workgroups: [1] }))).toBe("compute-invalid-spec");
    data.dispose();
    expect(codeOf(() => ctx.dispatch({ pipeline, bindings: { 0: data, 1: params }, workgroups: [1] }))).toBe("compute-disposed");
    pipeline.dispose();
    pipeline.dispose();
    expect(pipeline.disposed).toBe(true);
    expect(codeOf(() => ctx.dispatch({ pipeline, bindings: { 0: data, 1: params }, workgroups: [1] }))).toBe("compute-disposed");
  });

  it("round trips: write, dispatch, read through the fake queue", async () => {
    const { ctx, pipeline, data, params } = setup();
    data.write(new Float32Array([1, 2, 3, 4]));
    ctx.dispatch({ pipeline, bindings: { 0: data, 1: params }, items: [4] });
    await ctx.onIdle();
    expect([...new Float32Array(await data.read(), 0, 4)]).toEqual([1, 2, 3, 4]);
  });
});

describe("SH-04 compute: context lifecycle", () => {
  it("dispose() destroys every buffer once, is idempotent, and later calls throw compute-disposed", () => {
    const { device, log } = fakeDevice();
    const ctx = createComputeContext(device);
    const pipeline = ctx.createPipeline({ wgsl: WGSL, bindings: BINDINGS });
    ctx.createBuffer({ size: 8 });
    ctx.createBuffer({ size: 8, usage: "uniform" });
    ctx.dispose();
    ctx.dispose();
    expect(log.buffers.map((buffer) => buffer.destroyed)).toEqual([1, 1]);
    expect(ctx.disposed).toBe(true);
    expect(pipeline.disposed).toBe(true);
    expect(codeOf(() => ctx.createBuffer({ size: 8 }))).toBe("compute-disposed");
    expect(codeOf(() => ctx.createPipeline({ wgsl: WGSL }))).toBe("compute-disposed");
    expect(ctx).toBeInstanceOf(ComputeContext);
  });
});

describe("SH-04 compute: engine surface (WebGPU-only, never a silent no-op)", () => {
  it("every working call fails with compute-requires-webgpu until a WebGPU device is bound", async () => {
    const surface = createComputeSurface(() => "webgl2");
    expect(surface.available).toBe(false);
    for (const call of [
      () => surface.pipeline({ wgsl: WGSL }),
      () => surface.buffer({ size: 4 }),
      () => surface.dispatch({ pipeline: {}, bindings: {}, workgroups: [1] })
    ]) {
      let error: unknown;
      try { call(); } catch (e) { error = e; }
      expect(error).toBeInstanceOf(AuraRuntimeError);
      expect((error as AuraRuntimeError).code).toBe("compute-requires-webgpu");
      expect((error as AuraRuntimeError).message).toContain('Renderer.create({ backend: "webgpu" })');
      expect((error as AuraRuntimeError).message).toContain('"webgl2"');
    }
    await expect(surface.idle()).rejects.toMatchObject({ code: "compute-requires-webgpu" });
    expect(() => surface.dispose()).not.toThrow();
  });

  it("bind() rejects devices that cannot compute (a WebGL2 render device) with compute-requires-webgpu", () => {
    const surface = createComputeSurface();
    expect(codeOf(() => surface.bind({ info: { backend: "webgl2" } } as never))).toBe("compute-requires-webgpu");
    expect(codeOf(() => surface.bind(null as never))).toBe("compute-requires-webgpu");
    expect(surface.available).toBe(false);
  });

  it("works after binding a GPUDevice or a render device that owns one (nativeGpuDevice)", async () => {
    const { device, log } = fakeDevice();
    const surface = createComputeSurface();
    surface.bind({ nativeGpuDevice: device });
    expect(surface.available).toBe(true);
    const pipeline = surface.pipeline({ wgsl: WGSL, bindings: BINDINGS });
    const data = surface.buffer({ data: new Float32Array(64) });
    const params = surface.buffer({ data: new Float32Array(4), usage: "uniform" });
    const result = surface.dispatch({ pipeline, bindings: { 0: data, 1: params }, items: [64] });
    expect(result.workgroups).toEqual([1, 1, 1]);
    expect(log.passes).toHaveLength(1);
    await surface.idle();
    expect((await data.read()).byteLength).toBe(256);
    const direct = createComputeSurface();
    direct.bind(fakeDevice().device);
    expect(direct.available).toBe(true);
  });

  it("maps malformed input to AuraRuntimeError invalid-compute-spec and keeps the cause", () => {
    const surface = createComputeSurface();
    surface.bind(fakeDevice().device);
    let error: unknown;
    try { surface.pipeline({ wgsl: "#version 300 es\nvoid main() {}" }); } catch (e) { error = e; }
    expect(error).toBeInstanceOf(AuraRuntimeError);
    expect((error as AuraRuntimeError).code).toBe("invalid-compute-spec");
    expect((error as AuraRuntimeError).cause).toBeInstanceOf(ComputeError);
  });

  it("rebinding disposes the previous context's buffers; dispose() returns the surface to unavailable", () => {
    const first = fakeDevice();
    const second = fakeDevice();
    const surface = createComputeSurface();
    surface.bind(first.device);
    surface.buffer({ size: 8 });
    surface.bind(second.device);
    expect(first.log.buffers[0]!.destroyed).toBe(1);
    surface.buffer({ size: 8 });
    surface.dispose();
    expect(second.log.buffers[0]!.destroyed).toBe(1);
    expect(surface.available).toBe(false);
    expect(codeOf(() => surface.buffer({ size: 8 }))).toBe("compute-requires-webgpu");
  });

  it("is public: `compute` from the root, `app.compute` on a createAuraApp app (WebGL2/headless fails closed)", () => {
    expect(publicCompute).toBe(compute);
    for (const name of ["bind", "pipeline", "buffer", "dispatch", "idle", "dispose"] as const) {
      expect(typeof compute[name]).toBe("function");
    }
    const app = createAuraApp(null, { autoStart: false, scene: scene() });
    expect(app.compute.available).toBe(false);
    let error: unknown;
    try { app.compute.pipeline({ wgsl: WGSL }); } catch (e) { error = e; }
    expect((error as AuraRuntimeError).code).toBe("compute-requires-webgpu");
    expect((error as AuraRuntimeError).message).toContain(`"${app.backend}"`);
    app.compute.bind(fakeDevice().device);
    expect(app.compute.available).toBe(true);
    expect(app.compute.pipeline({ wgsl: WGSL, bindings: BINDINGS }).entryPoint).toBe("main");
    app.compute.dispose();
  });
});
