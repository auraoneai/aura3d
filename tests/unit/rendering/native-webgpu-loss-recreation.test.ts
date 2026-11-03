import { describe, expect, it } from "vitest";
import { createComputeSurface } from "../../../packages/engine/src/agent-api/nodes/compute";
import { ResourceLifecycle } from "../../../packages/rendering/src/ResourceLifecycle";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const WGSL = "@compute @workgroup_size(1) fn main() {}";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const flush = async () => { for (let index = 0; index < 16; index += 1) await Promise.resolve(); };

/** One native device generation: its own queue fence and loss signal. Does not execute WGSL. */
function nativeGeneration() {
  const fence = deferred();
  const lost = deferred<{ reason: string; message: string }>();
  const buffers: { label?: string; size: number; usage: number; destroyed: number }[] = [];
  let submissions = 0;
  const native = {
    features: new Set<string>(),
    lost: lost.promise,
    queue: {
      submit() { submissions += 1; }, writeBuffer() {}, writeTexture() {},
      onSubmittedWorkDone: () => fence.promise
    },
    createBuffer({ label, size, usage }: { label?: string; size: number; usage: number }) {
      const bytes = new ArrayBuffer(size);
      const allocation = { label, size, usage, destroyed: 0, destroy() { allocation.destroyed += 1; }, mapAsync: async () => {}, getMappedRange: () => bytes, unmap() {} };
      buffers.push(allocation);
      return allocation;
    },
    createTexture: () => ({ createView: () => ({}), destroy() {} }),
    createSampler: () => ({}),
    createShaderModule: () => ({}),
    createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createRenderPipeline: () => ({ getBindGroupLayout: () => ({}) }),
    createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createBindGroup: () => ({}),
    createCommandEncoder: () => ({
      beginComputePass: () => ({ setPipeline() {}, setBindGroup() {}, dispatchWorkgroups() {}, end() {} }),
      beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }),
      copyBufferToBuffer() {}, finish: () => ({})
    }),
    destroy() {}
  };
  return {
    native: native as unknown as WebGPUDeviceLike, fence, lost, buffers,
    get submissions() { return submissions; },
    /** `borrowed`: the app does not own (and cannot destroy) the native device; only its fence or loss releases leases. */
    create: (borrowed = false) => WebGPUDevice.create({ adapter: { requestDevice: async () => native as unknown as WebGPUDeviceLike },
      ...(borrowed ? { device: native as unknown as WebGPUDeviceLike } : {}) })
  };
}

describe("WebGPU device loss, recreation and late fences", () => {
  it.each(["resolves", "rejects"] as const)(
    "completes the lost generation on loss and keeps a late fence that %s away from the recreated generation",
    async (late) => {
      const first = nativeGeneration();
      const second = nativeGeneration();
      const lost = await first.create(true);
      let selected: WebGPUDevice = lost;
      const surface = createComputeSurface(() => "webgpu", () => selected);
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(lost);
      let recreated: WebGPUDevice | undefined;
      try {
        // Generation N: a shared compute/render buffer used on the queue, then disposed.
        const pipeline = surface.pipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage" }] });
        const old = surface.buffer({ size: 16, data: new Float32Array(4) });
        surface.dispatch({ pipeline, bindings: { 0: old }, workgroups: [1] });
        const oldNative = old.native as unknown as { destroyed: number };
        old.dispose();
        expect(oldNative.destroyed).toBe(0);
        // The borrowed device stays pending while its retirement fence waits.
        expect(() => lifecycle.dispose()).toThrow();
        expect(lifecycle.disposed).toBe(false);
        expect(oldNative.destroyed).toBe(0);

        // Confirmed loss invalidates generation N: every lease is destroyed once.
        first.lost.resolve({ reason: "unknown", message: "lost" });
        await flush();
        expect(lost.contextLost).toBe(true);
        expect(oldNative.destroyed).toBe(1);
        expect(first.buffers.every(buffer => buffer.destroyed <= 1)).toBe(true);
        expect(surface.available).toBe(false);
        lifecycle.dispose();
        expect(lifecycle.disposed).toBe(true);

        // Recreation: root compute rebinds to generation N+1 on the new device.
        recreated = await second.create();
        selected = recreated;
        expect(recreated.generation).toBeGreaterThan(lost.generation);
        expect(surface.available).toBe(true);
        expect(() => surface.dispatch({ pipeline, bindings: { 0: old }, workgroups: [1] })).toThrow(/disposed|context|generation/i);
        const nextPipeline = surface.pipeline({ wgsl: WGSL, bindings: [{ binding: 0, type: "storage" }] });
        const next = surface.buffer({ size: 16, data: new Float32Array(4) });
        const nextNative = next.native as unknown as { destroyed: number };
        expect(second.buffers).toContain(nextNative);
        expect(first.buffers).not.toContain(nextNative);
        const nextRender = next.asRenderBuffer();
        expect(recreated.getNativeStorageBuffer(nextRender)).toBe(nextNative);
        expect(() => lost.getNativeStorageBuffer(nextRender)).toThrow();
        const submitted = second.submissions;
        surface.dispatch({ pipeline: nextPipeline, bindings: { 0: next }, workgroups: [1] });
        expect(second.submissions).toBe(submitted + 1);
        const live = recreated.resourceInterop.liveResources;
        const secondDestroyed = second.buffers.map(buffer => buffer.destroyed);

        // The lost generation's fence settles late. It must neither repeat the
        // old destruction, report a failure, nor touch the new generation.
        if (late === "resolves") first.fence.resolve();
        else first.fence.reject(new Error("late fence after loss"));
        await flush();
        expect(oldNative.destroyed).toBe(1);
        expect(first.buffers.every(buffer => buffer.destroyed <= 1)).toBe(true);
        expect(lost.resourceInterop.retirementFenceErrors).toEqual([]);
        expect(lifecycle.disposed).toBe(true);
        expect(next.disposed).toBe(false);
        expect(nextNative.destroyed).toBe(0);
        expect(second.buffers.map(buffer => buffer.destroyed)).toEqual(secondDestroyed);
        expect(recreated.resourceInterop.liveResources).toBe(live);
        expect(recreated.getNativeStorageBuffer(nextRender)).toBe(nextNative);

        // The new generation still follows the strict contract: pending -> its own fence -> destroyed once.
        next.dispose();
        expect(nextNative.destroyed).toBe(0);
        second.fence.resolve();
        await flush();
        expect(nextNative.destroyed).toBe(1);
      } finally {
        surface.dispose();
        recreated?.dispose();
      }
    }
  );
});
