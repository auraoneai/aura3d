import { describe, expect, it } from "vitest";
import { GPUProfiler } from "../../../packages/debug/src/GPUProfiler";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPURenderPassDescriptorLike } from "../../../packages/rendering/src/WebGPUDevice";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";

function fakeNative(supported = true) {
  const events: string[] = [];
  const descriptors: WebGPURenderPassDescriptorLike[] = [];
  const destroyed: string[] = [];
  const readbacks: { complete(): void }[] = [];
  let lose!: (info: { reason: string }) => void;
  let finishFence!: () => void;
  let failNextSubmission = false;
  const lost = new Promise<{ reason: string }>((resolve) => { lose = resolve; });
  const fence = new Promise<void>((resolve) => { finishFence = resolve; });
  const native = {
    features: new Set(supported ? ["timestamp-query"] : []), lost,
    queue: {
      writeBuffer() {},
      submit(commands: readonly unknown[]) {
        events.push(`submit:${(commands[0] as { label?: string } | undefined)?.label ?? ""}`);
        if (failNextSubmission) { failNextSubmission = false; throw new Error("queue failed after enqueue"); }
      },
      onSubmittedWorkDone: () => fence
    },
    createBuffer({ label, size, usage }: { label?: string; size: number; usage: number }) {
      let complete!: () => void;
      const mapped = new Promise<void>((resolve) => { complete = resolve; });
      // The renderer separately probes MAP_READ support with a labeled,
      // four-byte buffer. Track the profiler's actual two timestamp buffers.
      const isProfilerBuffer = label === undefined && size === 16;
      const isResolve = isProfilerBuffer && usage === (0x0200 | 0x0004);
      const isReadback = isProfilerBuffer && usage === (0x0001 | 0x0008);
      if (isReadback) readbacks.push({ complete });
      return {
        label: "", size, usage, mapState: "unmapped" as const,
        mapAsync() { events.push("map"); return mapped; },
        getMappedRange() { return new BigUint64Array([1_000_000n, 3_500_000n]).buffer; },
        unmap() { events.push("unmap"); },
        destroy() { if (isResolve || isReadback) destroyed.push(isResolve ? "resolve" : "readback"); }
      };
    },
    createQuerySet: () => ({ label: "", type: "timestamp" as const, count: 2, destroy() { destroyed.push("query"); } }),
    createShaderModule: () => ({}),
    createBindGroup: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createCommandEncoder: (descriptor?: { label?: string }) => ({
      beginRenderPass(pass: WebGPURenderPassDescriptorLike) {
        descriptors.push(pass);
        events.push(`pass:${pass.label}`);
        return { setPipeline() {}, setVertexBuffer() {}, setBindGroup() {}, draw() {}, end() { events.push("end"); } };
      },
      resolveQuerySet() { events.push("resolve"); },
      copyBufferToBuffer() { events.push("copy"); },
      finish() { events.push("finish"); return { label: descriptor?.label ?? "" }; }
    }),
    destroy() {}
  };
  return { native, events, descriptors, destroyed, readbacks, finishFence, lose,
    failSubmission: () => { failNextSubmission = true; } };
}

async function setup(supported = true) {
  const gpu = fakeNative(supported);
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => gpu.native as unknown as WebGPUDeviceLike } });
  const profiler = GPUProfiler.fromWebGPUDevice(device.nativeGpuDevice);
  const target = device.createRenderTarget({ width: 8, height: 6, depth: false });
  const shader = device.createShaderProgram({ label: "profile-fixture", marker: "profile-fixture",
    vertex: "// profile-fixture\nlayout(location=0) in vec3 a_position; void main(){}",
    fragment: "// profile-fixture\nvoid main(){}", portableBindings: [],
    webgpu: {
      vertex: "/* @aura3d-bindings */ @vertex fn main(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> { return vec4<f32>(p,1.0); }",
      fragment: "/* @aura3d-bindings */ @fragment fn main() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }"
    }
  });
  const vertices = device.createBuffer("vertex", 36);
  const draw = { topology: "triangles" as const, vertexBuffer: vertices, vertexFormat: VertexFormat.P3, vertexCount: 3, shader };
  const begin = () => { device.beginFrame(8, 6); device.setRenderTarget(target); };
  const cleanup = () => { profiler.dispose(); vertices.dispose(); shader.dispose(); target.dispose(); device.dispose(); gpu.finishFence(); };
  return { gpu, device, profiler, draw, begin, cleanup };
}

describe("native WebGPU forward pass profiler integration", () => {
  it("profiles only the selected first draw per frame through the resource-aware queue", async () => {
    const { gpu, device, profiler, draw, begin, cleanup } = await setup();
    device.setForwardPassProfiler(profiler.createWebGPUForwardPassProfiler(), { drawLabel: "selected" });
    begin();
    const serial = device.resourceInterop.submissionSerial;
    device.draw({ ...draw, label: "other" });
    device.draw({ ...draw, label: "selected" });
    device.draw({ ...draw, label: "selected" });
    expect(device.resourceInterop.submissionSerial).toBe(serial + 3);
    const passes = gpu.descriptors.filter((descriptor) => descriptor.label === "other-pass" || descriptor.label === "selected-pass");
    expect(passes).toHaveLength(3);
    expect(passes.map((pass) => Boolean(pass.timestampWrites))).toEqual([false, true, false]);
    expect(gpu.events.indexOf("resolve")).toBeLessThan(gpu.events.indexOf("copy"));
    expect(gpu.events.indexOf("copy")).toBeLessThan(gpu.events.indexOf("map"));
    expect(gpu.events.indexOf("submit:selected-encoder")).toBeLessThan(gpu.events.indexOf("map"));
    expect(profiler.snapshot()).toMatchObject({ pendingCount: 1, sampleCount: 0, cpuSampleCount: 1 });
    expect(gpu.readbacks).toHaveLength(1);
    gpu.readbacks[0]!.complete();
    await Promise.resolve();
    expect(profiler.snapshot().samples).toEqual([{ label: expect.stringMatching(/^webgpu\.forward-pass\.g\d+\.frame1\.selected$/), durationMs: 2.5 }]);
    device.endFrame();
    begin();
    device.draw({ ...draw, label: "selected" });
    expect(gpu.descriptors.filter((pass) => pass.timestampWrites)).toHaveLength(2);
    expect(gpu.readbacks).toHaveLength(2);
    gpu.readbacks[1]!.complete();
    await Promise.resolve();
    expect(profiler.snapshot().samples[1]).toEqual({ label: expect.stringMatching(/\.frame2\.selected$/), durationMs: 2.5 });
    device.endFrame();
    cleanup();
  });

  it("records CPU-only unsupported passes and rejects a profiler from another device", async () => {
    const { gpu, device, profiler, draw, begin, cleanup } = await setup(false);
    const other = fakeNative();
    const foreign = GPUProfiler.fromWebGPUDevice(other.native).createWebGPUForwardPassProfiler();
    expect(() => device.setForwardPassProfiler(foreign, { drawLabel: "selected" })).toThrow(/another WebGPU device/);
    device.setForwardPassProfiler(profiler.createWebGPUForwardPassProfiler(), { drawLabel: "selected" });
    begin();
    expect(() => device.setForwardPassProfiler(null)).toThrow(/outside a frame/);
    device.draw({ ...draw, label: "selected" });
    expect(gpu.descriptors.find((pass) => pass.label === "selected-pass")?.timestampWrites).toBeUndefined();
    expect(profiler.snapshot()).toMatchObject({ supported: false, sampleCount: 0, cpuSampleCount: 1,
      measurements: [{ label: expect.stringContaining("forward-pass"), gpuStatus: "unsupported" }] });
    device.endFrame();
    cleanup();
  });

  it("does not map a failed queue submission or release its timestamp resources before the fence", async () => {
    const { gpu, device, profiler, draw, begin, cleanup } = await setup();
    device.setForwardPassProfiler(profiler.createWebGPUForwardPassProfiler(), { drawLabel: "selected" });
    begin();
    const serial = device.resourceInterop.submissionSerial;
    gpu.failSubmission();
    expect(() => device.draw({ ...draw, label: "selected" })).toThrow("queue failed after enqueue");
    expect(device.resourceInterop.submissionSerial).toBe(serial);
    expect(gpu.events).not.toContain("map");
    expect(gpu.readbacks).toHaveLength(1);
    expect(gpu.destroyed).toEqual([]);
    expect(profiler.snapshot()).toMatchObject({ sampleCount: 0, pendingCount: 0, measurements: [{ gpuStatus: "query-failed" }] });
    gpu.finishFence();
    await Promise.resolve();
    expect(gpu.destroyed).toEqual(["query", "resolve", "readback"]);
    device.endFrame();
    cleanup();
  });

  it("discards an in-flight pass on device loss and ignores late readback", async () => {
    const { gpu, device, profiler, draw, begin, cleanup } = await setup();
    device.setForwardPassProfiler(profiler.createWebGPUForwardPassProfiler(), { drawLabel: "selected" });
    begin();
    device.draw({ ...draw, label: "selected" });
    expect(gpu.readbacks).toHaveLength(1);
    gpu.lose({ reason: "unknown" });
    await Promise.resolve();
    expect(profiler.snapshot()).toMatchObject({ supported: false, pendingCount: 0, sampleCount: 0, measurements: [{ gpuStatus: "device-lost" }] });
    gpu.readbacks[0]!.complete();
    await Promise.resolve();
    expect(profiler.snapshot().sampleCount).toBe(0);
    expect(gpu.destroyed).toEqual(["query", "resolve", "readback"]);
    cleanup();
  });
});
