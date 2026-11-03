import { describe, expect, it, vi } from "vitest";
import {
  assertNativeGpuSortDevice,
  createNativeGpuSort,
  NativeGpuSortError,
  type NativeGpuSortBuffer,
  type NativeGpuSortDevice,
} from "../../../packages/rendering/src/webgpu/NativeGpuSort";
import type { GaussianSplatGpuOrderDevice } from "../../../packages/rendering/src/webgpu/GaussianSplatGpuOrder";
import { GaussianSplatRenderer, type GaussianSplatCloud } from "../../../packages/rendering/src/GaussianSplatRenderer";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";

const STORAGE = 0x80;

type BufferDouble = NativeGpuSortBuffer & {
  readonly data: ArrayBuffer;
  readonly label: string;
  readonly destroy: ReturnType<typeof vi.fn>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
};

type Entry = { binding: number; resource: { buffer: BufferDouble; offset?: number; size?: number } };
type Group = { entries: Entry[] };
type Pipeline = { entryPoint: string; getBindGroupLayout(index: number): unknown };
type Command = { pipeline: Pipeline; group: Group; workgroups: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function makeBuffer(size: number, usage = STORAGE, label = "caller"): BufferDouble {
  const data = new ArrayBuffer(size);
  return { size, usage, label, data, destroy: vi.fn(), getMappedRange: () => data, unmap: vi.fn() };
}

/** Interprets each submitted compute pass with a separate CPU representation.
 * This checks orchestration and the sorting network, not native WGSL execution. */
function fixture(limits: Record<string, number> = {}) {
  const allocations: BufferDouble[] = [];
  const submitted: Command[][] = [];
  const lost = deferred<{ reason?: string; message?: string }>();
  let fence: Promise<void> = Promise.resolve();
  let validation: Promise<{ message: string } | null> = Promise.resolve(null);
  let compileErrors: { type: string; message: string; lineNum?: number; linePos?: number }[] = [];
  let shaderCode = "";

  function execute(command: Command): void {
    const get = (binding: number): Entry["resource"] => {
      const entry = command.group.entries.find((value) => value.binding === binding);
      if (!entry) throw new Error(`missing binding ${binding}`);
      return entry.resource;
    };
    const param = get(2);
    const values = new DataView(param.buffer.data, param.offset ?? 0, 32);
    const count = values.getUint32(0, true);
    const padded = values.getUint32(4, true);
    const block = values.getUint32(8, true);
    const stride = values.getUint32(12, true);
    const descending = values.getUint32(16, true) !== 0;
    const records = new DataView(get(1).buffer.data);
    type Pair = { bits: number; index: number; valid: number };
    const read = (i: number): Pair => ({ bits: records.getUint32(i * 16, true), index: records.getUint32(i * 16 + 4, true), valid: records.getUint32(i * 16 + 8, true) });
    const write = (i: number, pair: Pair): void => { records.setUint32(i * 16, pair.bits, true); records.setUint32(i * 16 + 4, pair.index, true); records.setUint32(i * 16 + 8, pair.valid, true); };
    const after = (a: Pair, b: Pair): boolean => {
      if (a.valid !== b.valid) return a.valid === 0;
      if (!a.valid) return a.index > b.index;
      const nan = (bits: number): boolean => (bits & 0x7f800000) === 0x7f800000 && (bits & 0x007fffff) !== 0;
      const an = nan(a.bits), bn = nan(b.bits);
      if (an !== bn) return an;
      if (an || a.bits === b.bits || ((a.bits | b.bits) & 0x7fffffff) === 0) return a.index > b.index;
      const ordered = (bits: number): number => ((bits & 0x80000000) !== 0 ? ~bits : bits ^ 0x80000000) >>> 0;
      return descending ? ordered(a.bits) < ordered(b.bits) : ordered(a.bits) > ordered(b.bits);
    };
    if (command.pipeline.entryPoint === "initialize") {
      const keys = new Uint32Array(get(0).buffer.data);
      for (let i = 0; i < padded; i++) write(i, { bits: i < count ? keys[i] : 0, index: i, valid: i < count ? 1 : 0 });
    } else if (command.pipeline.entryPoint === "compare_exchange") {
      for (let i = 0; i < padded; i++) {
        const other = i ^ stride;
        if (other <= i || other >= padded) continue;
        const a = read(i), b = read(other), reverse = (i & block) !== 0;
        if ((!reverse && after(a, b)) || (reverse && after(b, a))) { write(i, b); write(other, a); }
      }
    } else if (command.pipeline.entryPoint === "write_indices") {
      const out = new Uint32Array(get(3).buffer.data);
      for (let i = 0; i < count; i++) out[i] = read(i).index;
    } else throw new Error("unexpected pipeline");
  }

  const device: NativeGpuSortDevice = {
    limits,
    lost: lost.promise,
    queue: {
      submit(commands) {
        for (const command of commands as Command[][]) {
          submitted.push(command);
          for (const pass of command) execute(pass);
        }
      },
      onSubmittedWorkDone: vi.fn(() => fence),
    },
    createShaderModule({ code }) {
      shaderCode = code;
      return { getCompilationInfo: async () => ({ messages: compileErrors }) };
    },
    createComputePipeline(descriptor) {
      const entryPoint = (descriptor as { compute: { entryPoint: string } }).compute.entryPoint;
      return { entryPoint, getBindGroupLayout: () => ({ entryPoint }) } as Pipeline;
    },
    createBuffer({ size, usage, label }) {
      const buffer = makeBuffer(size, usage, label);
      allocations.push(buffer);
      return buffer;
    },
    createBindGroup(descriptor) { return descriptor; },
    createCommandEncoder() {
      const commands: Command[] = [];
      return {
        beginComputePass() {
          let pipeline!: Pipeline;
          let group!: Group;
          let workgroups = 0;
          return {
            setPipeline(value) { pipeline = value as Pipeline; },
            setBindGroup(_index, value) { group = value as Group; },
            dispatchWorkgroups(value) { workgroups = value; },
            end() { commands.push({ pipeline, group, workgroups }); },
          };
        },
        finish: () => commands,
      };
    },
    pushErrorScope: vi.fn(),
    popErrorScope: vi.fn(() => validation),
  };
  return {
    device, allocations, submitted, lost,
    get shaderCode() { return shaderCode; },
    setFence(value: Promise<void>) { fence = value; },
    setValidation(value: Promise<{ message: string } | null>) { validation = value; },
    setCompileErrors(value: typeof compileErrors) { compileErrors = value; },
  };
}

function input(values: number[]) {
  const keys = makeBuffer(values.length * 4);
  new Float32Array(keys.data).set(values);
  const indices = makeBuffer(values.length * 4);
  return { keys, indices, result: () => [...new Uint32Array(indices.data)] };
}

function code(code: string) {
  return (value: unknown): boolean => value instanceof NativeGpuSortError && value.code === code;
}

describe("native GPU stable index sort", () => {
  it("submits ordered network stages and produces stable ascending and descending indices", async () => {
    const f = fixture();
    const sorter = await createNativeGpuSort(f.device);
    const ascending = input([3, -Infinity, -0, 0, 1, 3, NaN, Infinity, 1]);
    const first = sorter.sort({ ...ascending, count: 9 });
    await first.completion;
    expect(ascending.result()).toEqual([1, 2, 3, 4, 8, 0, 5, 7, 6]);
    const descending = input([3, -Infinity, -0, 0, 1, 3, NaN, Infinity, 1]);
    const second = sorter.sort({ ...descending, count: 9, direction: "descending" });
    await second.completion;
    expect(descending.result()).toEqual([7, 0, 5, 4, 8, 2, 3, 1, 6]);
    expect(f.submitted[0].map((pass) => pass.pipeline.entryPoint)).toEqual([
      "initialize", ...Array(10).fill("compare_exchange"), "write_indices",
    ]);
    expect(f.submitted[0].every((pass) => pass.workgroups === 1)).toBe(true);
    const offsets = f.submitted[0].map((pass) => pass.group.entries.find((entry) => entry.binding === 2)!.resource.offset);
    expect(offsets).toEqual(Array.from({ length: 12 }, (_, i) => i * 256));
    expect(new Set(offsets).size).toBe(12);
    expect(f.shaderCode).toContain("fn compare_exchange");
    expect(f.shaderCode).toContain("let other = i ^ params.distance");
    expect(f.allocations).toHaveLength(4);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(ascending.keys.destroy).not.toHaveBeenCalled();
    expect(ascending.indices.destroy).not.toHaveBeenCalled();
  });

  it("handles padding, duplicates, all NaNs, singleton, and empty inputs", async () => {
    const f = fixture({ maxComputeWorkgroupSizeX: 8, maxComputeInvocationsPerWorkgroup: 8 });
    const sorter = await createNativeGpuSort(f.device, { maxItems: 128 });
    for (const count of [1, 2, 3, 5, 9, 31, 64, 99]) {
      const values = Array.from({ length: count }, (_, i) => i % 7 === 0 ? NaN : ((i * 19) % 11) - 5);
      const buffers = input(values);
      const expected = values.map((key, index) => ({ key, index })).sort((a, b) => {
        if (Number.isNaN(a.key)) return Number.isNaN(b.key) ? a.index - b.index : 1;
        if (Number.isNaN(b.key)) return -1;
        return a.key - b.key || a.index - b.index;
      }).map(({ index }) => index);
      const submission = sorter.sort({ ...buffers, count });
      await submission.completion;
      expect(buffers.result()).toEqual(expected);
    }
    const allNaN = input([NaN, NaN, NaN]);
    new Uint32Array(allNaN.keys.data).set([0x7fc01234, 0xff800001, 0x7f800001]);
    await sorter.sort({ ...allNaN, count: 3, direction: "descending" }).completion;
    expect(allNaN.result()).toEqual([0, 1, 2]);
    const countBefore = f.submitted.length;
    const empty = input([]);
    await sorter.sort({ ...empty, count: 0 }).completion;
    expect(f.submitted).toHaveLength(countBefore);
  });

  it("matches independently ordered float bit patterns, including subnormals", async () => {
    const f = fixture();
    const sorter = await createNativeGpuSort(f.device);
    let seed = 0x749af163;
    const bits = Array.from({ length: 257 }, () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; });
    bits.splice(0, 8, 0x00000001, 0x80000001, 0x7f800000, 0xff800000, 0, 0x80000000, 0x7fc01001, 0xff801234);
    const values = new Float32Array(new Uint32Array(bits).buffer);
    for (const direction of ["ascending", "descending"] as const) {
      const buffers = input(Array.from(values));
      new Uint32Array(buffers.keys.data).set(bits);
      const expected = Array.from(values, (key, index) => ({ key, index })).sort((a, b) => {
        const an = Number.isNaN(a.key), bn = Number.isNaN(b.key);
        if (an !== bn) return an ? 1 : -1;
        if (an || a.key === b.key) return a.index - b.index;
        const ascending = a.key < b.key ? -1 : 1;
        return direction === "ascending" ? ascending : -ascending;
      }).map(({ index }) => index);
      await sorter.sort({ ...buffers, count: values.length, direction }).completion;
      expect(buffers.result()).toEqual(expected);
    }
  });

  it("enforces capability, buffer, count, and device limits before allocating", async () => {
    expect(() => assertNativeGpuSortDevice({})).toThrow(/createShaderModule/);
    const f = fixture({ maxStorageBufferBindingSize: 64 });
    const sorter = await createNativeGpuSort(f.device, { maxItems: 8 });
    const buffers = input([1, 2, 3, 4, 5]);
    expect(() => sorter.sort({ ...buffers, count: 5 })).toThrow(/exceeds the device/);
    expect(() => sorter.sort({ ...buffers, count: 9 })).toThrow(/count/);
    expect(() => sorter.sort({ ...buffers, keys: makeBuffer(20, 0), count: 2 })).toThrow(/STORAGE/);
    expect(() => sorter.sort({ ...buffers, indices: makeBuffer(4), count: 2 })).toThrow(/at least 8 bytes/);
    expect(f.allocations).toHaveLength(0);
    await expect(createNativeGpuSort(f.device, { maxItems: 2 ** 24 + 1 })).rejects.toMatchObject({ code: "sort-invalid-spec" });
    const badFence = { ...f.device, queue: { submit() {} } };
    await expect(createNativeGpuSort(badFence)).rejects.toMatchObject({ code: "sort-unsupported" });
  });

  it("keeps scratch and caller buffers alive through the fence and rejects overlapping writes", async () => {
    const f = fixture();
    const wait = deferred<void>();
    f.setFence(wait.promise);
    const sorter = await createNativeGpuSort(f.device, { maxConcurrent: 2 });
    const first = input([2, 1]);
    const second = { keys: first.keys, indices: makeBuffer(8) };
    const a = sorter.sort({ ...first, count: 2 });
    const b = sorter.sort({ ...second, count: 2 });
    expect(() => sorter.sort({ ...first, count: 2 })).toThrow(/pending/);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 0)).toBe(true);
    const disposal = sorter.dispose();
    expect(() => sorter.sort({ ...first, count: 2 })).toThrow(/disposed/);
    wait.resolve();
    await Promise.all([a.completion, b.completion, disposal]);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(first.keys.destroy).not.toHaveBeenCalled();
    expect(first.indices.destroy).not.toHaveBeenCalled();
    await sorter.dispose();
  });

  it("rejects conflicting buffer use across distinct sorters on the same device", async () => {
    const f = fixture();
    const wait = deferred<void>();
    f.setFence(wait.promise);
    const firstSorter = await createNativeGpuSort(f.device);
    const secondSorter = await createNativeGpuSort(f.device);
    const buffers = input([4, 3, 2, 1]);
    const first = firstSorter.sort({ ...buffers, count: 4 });
    expect(() => secondSorter.sort({ ...buffers, count: 4 })).toThrow(/pending/);
    wait.resolve();
    await first.safeToRelease;
    await secondSorter.sort({ ...buffers, count: 4 }).completion;
    await Promise.all([firstSorter.dispose(), secondSorter.dispose()]);
  });

  it("waits for a submitted abort and reports device loss without destroying caller buffers", async () => {
    const f = fixture();
    const wait = deferred<void>();
    f.setFence(wait.promise);
    const sorter = await createNativeGpuSort(f.device);
    const buffers = input([2, 1]);
    const controller = new AbortController();
    const submission = sorter.sort({ ...buffers, count: 2, signal: controller.signal });
    controller.abort();
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 0)).toBe(true);
    wait.resolve();
    await expect(submission.completion).rejects.toSatisfy(code("sort-aborted"));
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(() => sorter.sort({ ...buffers, count: 2, signal: controller.signal })).toThrow(/before submission/);

    const lostFixture = fixture();
    const never = deferred<void>();
    lostFixture.setFence(never.promise);
    const lostSorter = await createNativeGpuSort(lostFixture.device);
    const next = input([1, 2]);
    const pending = lostSorter.sort({ ...next, count: 2 });
    lostFixture.lost.resolve({ message: "adapter reset" });
    await expect(pending.completion).rejects.toSatisfy(code("sort-device-lost"));
    expect(lostFixture.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    expect(next.keys.destroy).not.toHaveBeenCalled();
    expect(() => lostSorter.sort({ ...next, count: 2 })).toThrow(/device lost/);
    await lostSorter.dispose();
  });

  it("does not treat a rejected loss notification as confirmed loss", async () => {
    const f = fixture();
    const wait = deferred<void>();
    f.setFence(wait.promise);
    const sorter = await createNativeGpuSort(f.device);
    const buffers = input([3, 1, 2]);
    const submission = sorter.sort({ ...buffers, count: 3 });
    f.lost.reject(new Error("loss notification unavailable"));
    for (let i = 0; i < 16; i += 1) await Promise.resolve();
    // Submitted work may still be running: scratch stays owned and the sorter stays live.
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 0)).toBe(true);
    wait.resolve();
    await submission.completion;
    await submission.safeToRelease;
    expect(buffers.result()).toEqual([1, 2, 0]);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    f.setFence(Promise.resolve());
    const next = input([2, 1]);
    await sorter.sort({ ...next, count: 2 }).completion;
    expect(next.result()).toEqual([1, 0]);
    await sorter.dispose();
  });

  it("reports shader and validation failures and retains scratch until a failed fence is recovered", async () => {
    const bad = fixture();
    bad.setCompileErrors([{ type: "error", lineNum: 3, linePos: 5, message: "invalid expression" }]);
    await expect(createNativeGpuSort(bad.device)).rejects.toThrow(/3:5 invalid expression/);
    const f = fixture();
    const sorter = await createNativeGpuSort(f.device);
    f.setValidation(Promise.resolve({ message: "invalid binding" }));
    const buffers = input([1, 2]);
    await expect(sorter.sort({ ...buffers, count: 2 }).completion).rejects.toThrow(/invalid binding/);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    f.setValidation(Promise.resolve(null));
    f.setFence(Promise.reject(new Error("temporary failure")));
    const failed = sorter.sort({ ...buffers, count: 2 });
    await expect(failed.completion).rejects.toSatisfy(code("sort-fence-failed"));
    let released = false;
    void failed.safeToRelease.then(() => { released = true; });
    await Promise.resolve();
    expect(released).toBe(false);
    expect(f.allocations.slice(-2).every((buffer) => buffer.destroy.mock.calls.length === 0)).toBe(true);
    expect(() => sorter.sort({ ...buffers, count: 2 })).toThrow(/pending/);
    f.setFence(Promise.resolve());
    await sorter.onIdle();
    await failed.safeToRelease;
    expect(released).toBe(true);
    expect(f.allocations.slice(-2).every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
    await sorter.sort({ ...buffers, count: 2 }).completion;
  });

  it("drains correctly when a retry fence finishes before a delayed validation scope", async () => {
    const f = fixture();
    const sorter = await createNativeGpuSort(f.device);
    const validation = deferred<{ message: string } | null>();
    f.setValidation(validation.promise);
    f.setFence(Promise.reject(new Error("first fence failed")));
    const buffers = input([2, 1]);
    const submission = sorter.sort({ ...buffers, count: 2 });
    f.setFence(Promise.resolve());
    const disposal = sorter.dispose();
    await Promise.resolve();
    validation.resolve(null);
    await expect(submission.completion).rejects.toSatisfy(code("sort-fence-failed"));
    await Promise.all([disposal, submission.safeToRelease]);
    expect(f.allocations.every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);
  });

  it("orders Gaussian splats with the GPU sorter and falls back to the CPU sort on a GPU failure", async () => {
    const f = fixture();
    const sorter = await createNativeGpuSort(f.device);
    const copies: (() => void)[] = [];
    // Key upload and index readback around the sorter's own submissions.
    const orderDevice: GaussianSplatGpuOrderDevice = {
      queue: {
        submit(commands) {
          const rest = (commands as unknown[]).filter((command) => command !== "copy");
          if (rest.length) f.device.queue.submit(rest);
          if (rest.length !== commands.length) copies.splice(0).forEach((copy) => copy());
        },
        onSubmittedWorkDone: () => f.device.queue.onSubmittedWorkDone(),
        writeBuffer(buffer, offset, data) {
          new Uint8Array((buffer as BufferDouble).data).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), offset);
        },
      },
      createBuffer(descriptor) {
        const buffer = f.device.createBuffer(descriptor) as BufferDouble & { mapAsync?: () => Promise<void> };
        buffer.mapAsync = async () => undefined;
        return buffer;
      },
      createCommandEncoder: () => ({
        copyBufferToBuffer(source, sourceOffset, destination, destinationOffset, size) {
          copies.push(() => new Uint8Array((destination as BufferDouble).data).set(new Uint8Array((source as BufferDouble).data, sourceOffset, size), destinationOffset));
        },
        finish: () => "copy",
      }),
    };
    const z = [-0.5, -0.75, 0.25, -0.25, 0.5];
    const data: GaussianSplatCloud = {
      count: z.length, positions: new Float32Array(z.flatMap((value) => [0, 0, value])),
      scales: new Float32Array(z.flatMap(() => [0.1, 0.1, 0.1])), rotations: new Float32Array(z.flatMap(() => [0, 0, 0, 1])),
      colors: new Float32Array(z.flatMap(() => [1, 0, 0])), opacities: new Float32Array(z.map(() => 0.5)), shDegree: 0,
      metadata: { colorSpace: "lin_rec709_display", coordinateSystem: "RUB" },
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const input = { viewMatrix: identity, projectionMatrix: identity, viewport: [100, 100] as const, cameraPosition: [0, 0, 2] as const };
    const device = new MockRenderDevice();
    const renderer = new GaussianSplatRenderer(device, data);
    const cpu = renderer.prepare(input);
    const gpu = await renderer.prepareAsync(input, { gpuSort: { device: orderDevice, sorter } });
    expect(gpu.sortBackend).toBe("gpu");
    expect([...gpu.order]).toEqual([1, 0, 3, 2, 4]);
    expect([...gpu.order]).toEqual([...cpu.order]);
    expect(gpu.distanceAt(0)).toBe(cpu.distanceAt(0));
    await Promise.resolve();
    expect(f.allocations.filter((buffer) => buffer.label.startsWith("aura3d-splat-sort")).every((buffer) => buffer.destroy.mock.calls.length === 1)).toBe(true);

    const failedFence = Promise.reject(new Error("fence failed"));
    failedFence.catch(() => undefined);
    f.setFence(failedFence);
    const fallback = await renderer.prepareAsync(input, { gpuSort: { device: orderDevice, sorter } });
    expect(fallback.sortBackend).toBe("cpu");
    expect(fallback.sortFallbackReason).toMatch(/fence/);
    expect([...fallback.order]).toEqual([...cpu.order]);
    renderer.dispose(); device.dispose();
  });
});
