import { describe, expect, it, vi } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { MockRenderDevice, type DrawCommand, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { NativePointQuadArena, NATIVE_POINT_CORNER, NATIVE_POINT_CORNER_LOCATION, assertNativePointQuadSubmission, withNativePointQuadLease, type NativePointQuadLease } from "../../../packages/rendering/src/webgpu/NativePointQuads";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";

const LIMITS = { maxCpuBytes: 1_000_000, maxGpuBytes: 1_000_000, maxStreamBytes: 1_000_000 };
const CORNERS = [[0, 0], [0, 1], [1, 0], [1, 0], [0, 1], [1, 1]];

interface Fence {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

class PointDevice extends MockRenderDevice {
  generation = 1;
  maxBufferSize = 1_000_000;
  maxVertexBuffers = 8;
  readonly fences = new Map<RenderBuffer, Fence>();
  readonly invalidationListeners = new Set<() => void>();
  readonly stamps = new WeakMap<object, { readonly buffer: RenderBuffer; readonly epoch: number }>();
  readonly epochs = new WeakMap<RenderBuffer, number>();

  getNativePointLimits() { return { generation: this.generation, maxBufferSize: this.maxBufferSize, maxVertexBuffers: this.maxVertexBuffers }; }
  createNativePointBuffer(bytes: ArrayBufferView):
    | { readonly ok: true; readonly buffer: RenderBuffer; readonly stamp: object }
    | { readonly ok: false; readonly error: unknown; readonly cleanup: Promise<void> } {
    try {
      const buffer = this.createBuffer("vertex", bytes.byteLength, bytes);
      const stamp = Object.freeze({});
      this.epochs.set(buffer, 0);
      this.stamps.set(stamp, { buffer, epoch: 0 });
      return { ok: true, buffer, stamp };
    } catch (error) { return { ok: false, error, cleanup: Promise.resolve() }; }
  }
  assertNativePointBufferStamp(buffer: RenderBuffer, stamp: object): void {
    const proof = this.stamps.get(stamp);
    if (!proof || proof.buffer !== buffer || buffer.disposed || this.epochs.get(buffer) !== proof.epoch) {
      throw new Error("point buffer stamp is stale or foreign");
    }
  }
  override updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.epochs.set(buffer, (this.epochs.get(buffer) ?? 0) + 1);
    super.updateBuffer(buffer, byteOffset, data);
  }
  onNativePointInvalidated(listener: () => void): () => void {
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }
  retireNativePointBuffer(buffer: RenderBuffer): Promise<void> {
    const existing = this.fences.get(buffer);
    if (existing) return existing.promise;
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    this.fences.set(buffer, { promise, resolve, reject });
    return promise;
  }
  completeAll(): void { for (const fence of this.fences.values()) fence.resolve(); }
  failAll(): void {
    for (const fence of this.fences.values()) fence.reject(new Error("fence failed"));
    this.fences.clear();
  }
  invalidate(): void {
    this.contextLost = true;
    this.completeAll();
    for (const listener of [...this.invalidationListeners]) listener();
  }
}

function pointGeometry(indexed = false): Geometry {
  const format = new VertexFormat([
    { semantic: "position", components: 3, offset: 0 },
    { semantic: "color", components: 4, offset: 12, type: "uint8", normalized: true }
  ], 16);
  const vertices = new VertexBuffer(format, 3);
  [[1, 2, 3], [-4, 5, 6], [7, 8, -9]].forEach((position, i) => vertices.setAttribute(i, "position", position));
  [[255, 0, 0, 255], [0, 128, 0, 64], [0, 0, 255, 128]].forEach((color, i) => vertices.setAttribute(i, "color", color));
  return new Geometry(vertices, indexed ? new IndexBuffer([2, 0, 2, 1], 3) : null, "points");
}

function expectPoint(lease: NativePointQuadLease, point: number, center: readonly number[], color: readonly number[]): void {
  for (let corner = 0; corner < 6; corner += 1) {
    const vertex = point * 6 + corner;
    expect(lease.readAttribute(vertex, "position")).toEqual(center);
    expect(lease.readAttribute(vertex, "color")).toEqual(color);
    expect(lease.readAttribute(vertex, NATIVE_POINT_CORNER)).toEqual(CORNERS[corner]);
  }
}

function pointCommand(lease: NativePointQuadLease, buffers: readonly (RenderBuffer | undefined)[]): DrawCommand {
  return { topology: "triangles", vertexBuffer: buffers[0]!, vertexBuffers: buffers, vertexFormat: lease.vertexFormat, vertexCount: lease.vertexCount };
}

describe("staged native point snapshot leases", () => {
  it("keeps different ranges and same-sized source revisions independent before submission", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry(true);
    const firstRange = { start: 0, count: 1 };
    const first = arena.acquire(source, firstRange);
    firstRange.start = 1;
    const second = arena.acquire(source, { start: 1, count: 1 });
    source.vertexBuffer.setAttribute(2, "position", [10, 20, 30]);
    const third = arena.acquire(source, { start: 0, count: 1 });
    expect(first.source).toBe(source);
    expect(first.sourceRange).toEqual({ start: 0, count: 1 });
    expect(first.vertexCount).toBe(6);
    expect(first.vertexFormat).toBe(second.vertexFormat);
    expect(second.vertexFormat).toBe(third.vertexFormat);
    expect(first.vertexFormat.getAttribute(NATIVE_POINT_CORNER)).toMatchObject({ shaderLocation: NATIVE_POINT_CORNER_LOCATION, components: 2, type: "float32" });
    expectPoint(first, 0, [7, 8, -9], [0, 0, 255, 128]);
    expectPoint(second, 0, [1, 2, 3], [255, 0, 0, 255]);
    expectPoint(third, 0, [10, 20, 30], [0, 0, 255, 128]);
    expect(source.vertexBuffer.uploadedBuffer).toBeNull();
    expect(source.indexBuffer!.uploadedBuffer).toBeNull();
    expect(arena.reservedCpuBytes).toBe(876);
    expect(arena.reservedGpuBytes).toBe(432);
    await Promise.all([first.release(), second.release(), third.release()]);
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("takes fresh raw CPU and index snapshots even for unmarked direct writes", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry(true);
    const first = arena.acquire(source, { start: 0, count: 1 });
    source.indexBuffer!.data[0] = 0;
    source.vertexBuffer.floats[0] = 42;
    const next = arena.acquire(source, { start: 0, count: 1 });
    expectPoint(first, 0, [7, 8, -9], [0, 0, 255, 128]);
    expectPoint(next, 0, [42, 2, 3], [255, 0, 0, 255]);
    await Promise.all([first.release(), next.release()]);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("preserves independent vertex streams and exact normalized storage", async () => {
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, bufferSlot: 2, type: "uint8", normalized: true }
    ], 12, [{ slot: 2, stride: 4 }]);
    const positions = new VertexBuffer(format, 2);
    const colors = new VertexBuffer(format, 2, 2);
    positions.setAttribute(0, "position", [0, 1, 2]);
    positions.setAttribute(1, "position", [3, 4, 5]);
    colors.setAttribute(0, "color", [10, 20, 30, 40]);
    colors.setAttribute(1, "color", [50, 60, 70, 80]);
    const source = new Geometry(positions, null, "points", undefined, [colors]);
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const snapshot = arena.acquire(source, { start: 1, count: 1 });
    expect(snapshot.vertexFormat.getAttribute("color")).toMatchObject({ bufferSlot: 2, normalized: true, type: "uint8" });
    expect(snapshot.vertexFormat.getAttribute(NATIVE_POINT_CORNER).bufferSlot).toBe(1);
    expectPoint(snapshot, 0, [3, 4, 5], [50, 60, 70, 80]);
    await snapshot.release();
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("pins distinct uploaded snapshots and budgets until their own retirement fences complete", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, { ...LIMITS, maxCpuBytes: 584, maxGpuBytes: 288 });
    const source = pointGeometry(true);
    const first = arena.acquire(source, { start: 0, count: 1 });
    const firstBuffers = first.upload();
    source.indexBuffer!.setIndices(0, [0]);
    const second = arena.acquire(source, { start: 0, count: 1 });
    const secondBuffers = second.upload();
    expect(firstBuffers[0]).not.toBe(secondBuffers[0]);
    expectPoint(first, 0, [7, 8, -9], [0, 0, 255, 128]);
    expectPoint(second, 0, [1, 2, 3], [255, 0, 0, 255]);
    expect(() => arena.acquire(source, { start: 0, count: 1 })).toThrow(/budget exceeded/i);
    const retiring = first.release();
    expect(arena.reservedCpuBytes).toBe(584);
    expect(arena.reservedGpuBytes).toBe(288);
    for (const buffer of firstBuffers) if (buffer) device.fences.get(buffer)!.resolve();
    await retiring;
    expect(arena.reservedCpuBytes).toBe(292);
    expect(firstBuffers.every(buffer => !buffer || buffer.disposed)).toBe(true);
    expect(secondBuffers.every(buffer => !buffer || !buffer.disposed)).toBe(true);
    expect((first as unknown as { geometry?: unknown }).geometry).toBeUndefined();
    expect((first as unknown as { uploaded?: unknown }).uploaded).toBeUndefined();
    expect(() => first.readAttribute(0, "position")).toThrow(/released/i);
    const last = second.release();
    device.completeAll();
    await last;
    expect(arena.reservedCpuBytes).toBe(0);
    expect(arena.reservedGpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("brands submission evidence to the exact source, range, slots, layout and write stamps", async () => {
    const device = new PointDevice();
    const other = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry(true);
    const range = { start: 0, count: 1 };
    const lease = arena.acquire(source, range);
    const buffers = lease.upload();
    const command = pointCommand(lease, buffers);
    expect(Object.isFrozen(lease.vertexFormat)).toBe(true);
    expect(Object.isFrozen(buffers)).toBe(true);
    expect(() => assertNativePointQuadSubmission(lease, device, command, source, range)).not.toThrow();
    expect(() => assertNativePointQuadSubmission({}, device, command, source, range)).toThrow(/lease does not match/i);
    expect(() => assertNativePointQuadSubmission(lease, other, command, source, range)).toThrow(/lease does not match/i);
    expect(() => assertNativePointQuadSubmission(lease, device, command, source, { start: 1, count: 1 })).toThrow(/lease does not match/i);
    expect(() => assertNativePointQuadSubmission(lease, device, { ...command, vertexCount: 5 }, source, range)).toThrow(/command does not match/i);
    expect(() => assertNativePointQuadSubmission(lease, device, { ...command, instanceCount: 2 }, source, range)).toThrow(/command does not match/i);
    expect(() => assertNativePointQuadSubmission(lease, device, { ...command, vertexBuffer: buffers[1]! }, source, range)).toThrow(/different primary buffer/i);
    const changed = [...buffers];
    changed[1] = buffers[0];
    expect(() => assertNativePointQuadSubmission(lease, device, { ...command, vertexBuffers: changed }, source, range)).toThrow(/different vertex buffer/i);
    expect(() => device.updateBuffer(buffers[0]!, buffers[0]!.byteLength, new Uint8Array(4))).toThrow(/out of bounds/i);
    expect(() => assertNativePointQuadSubmission(lease, device, command, source, range)).toThrow(/stamp is stale/i);
    const retired = lease.release();
    expect(() => assertNativePointQuadSubmission(lease, device, command, source, range)).toThrow(/lease does not match/i);
    device.completeAll();
    await retired;
    await arena.dispose();
    source.dispose();
    device.dispose();
    other.dispose();
  });

  it("rejects source revisions, unmarked writes, replacement and later upload at submission", async () => {
    const device = new PointDevice();
    const other = new PointDevice();
    const source = pointGeometry(true);
    const arena = new NativePointQuadArena(device, LIMITS);
    const range = { start: 0, count: 1 };
    const lease = arena.acquire(source, range);
    const command = pointCommand(lease, lease.upload());
    const check = () => assertNativePointQuadSubmission(lease, device, command, source, range);
    expect(check).not.toThrow();

    source.vertexBuffer.floats[8] = 42;
    expect(check).toThrow(/vertex bytes changed/i);
    source.vertexBuffer.floats[8] = 7;
    source.indexBuffer!.data[0] = 0;
    expect(check).toThrow(/indices changed/i);
    source.indexBuffer!.data[0] = 2;
    expect(check).not.toThrow();

    const original = source.vertexBuffer;
    source.vertexBuffer = new VertexBuffer(original.format, original.vertexCount);
    expect(check).toThrow(/geometry or buffer generation changed/i);
    source.vertexBuffer.dispose();
    source.vertexBuffer = original;
    source.vertexBuffer.setAttribute(2, "position", [7, 8, -9]);
    expect(check).toThrow(/geometry or buffer generation changed/i);
    const newer = arena.acquire(source, range);
    const newerCommand = pointCommand(newer, newer.upload());
    source.indexBuffer!.upload(other);
    expect(() => assertNativePointQuadSubmission(newer, device, newerCommand, source, range)).toThrow(/CPU authority/i);

    const closing = arena.dispose();
    device.completeAll();
    await closing;
    source.dispose();
    device.dispose();
    other.dispose();
  });

  it("defers retirement until a pinned submission returns or throws", async () => {
    const device = new PointDevice();
    const source = pointGeometry();
    const arena = new NativePointQuadArena(device, LIMITS);
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const buffers = lease.upload();
    let released!: Promise<void>;
    expect(() => withNativePointQuadLease(lease, () => {
      released = lease.release();
      expect(device.fences.size).toBe(0);
      expect(buffers.every(buffer => !buffer?.disposed)).toBe(true);
      throw new Error("queue may have accepted work");
    })).toThrow(/accepted work/i);
    expect(lease.status).toBe("retiring");
    expect(device.fences.size).toBe(2);
    let settled = false;
    void released.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    device.completeAll();
    await released;
    expect(buffers.every(buffer => !buffer || buffer.disposed)).toBe(true);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("refunds a failed upload only after both its cleanup receipt and earlier buffer fences", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const originalCreate = device.createNativePointBuffer.bind(device);
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
    let calls = 0;
    vi.spyOn(device, "createNativePointBuffer").mockImplementation(bytes => {
      calls += 1;
      return calls === 2 ? { ok: false, error: new Error("allocation rejected"), cleanup } : originalCreate(bytes);
    });
    expect(() => lease.upload()).toThrow(/allocation rejected/i);
    expect(lease.status).toBe("retiring");
    expect(device.fences.size).toBe(1);
    let released = false;
    void lease.whenReleased.then(() => { released = true; });
    device.completeAll();
    await Promise.resolve(); await Promise.resolve();
    expect(released).toBe(false);
    expect(arena.reservedCpuBytes).toBe(288);
    finishCleanup();
    await lease.whenReleased;
    expect(arena.reservedCpuBytes).toBe(0);
    expect(arena.reservedGpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("keeps a failed fence charged, retries safely and survives source disposal", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 1, count: 1 });
    const buffers = lease.upload();
    source.dispose();
    expectPoint(lease, 0, [-4, 5, 6], [0, 128, 0, 64]);
    const first = lease.release();
    device.failAll();
    await expect(first).rejects.toThrow(/fence failed/i);
    expect(lease.status).toBe("retirement-failed");
    expect(arena.reservedCpuBytes).toBe(288);
    expect(buffers.every(buffer => !buffer || !buffer.disposed)).toBe(true);
    const retry = lease.release();
    device.completeAll();
    await retry;
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    device.dispose();
  });

  it("pins a partial or throw-after-upload failure until verified device invalidation", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const originalCreate = device.createNativePointBuffer.bind(device);
    let calls = 0;
    vi.spyOn(device, "createNativePointBuffer").mockImplementation((bytes) => {
      calls += 1;
      if (calls === 2) throw new Error("possibly submitted allocation failed");
      return originalCreate(bytes);
    });
    expect(() => lease.upload()).toThrow(/possibly submitted/i);
    expect(lease.status).toBe("uncertain-upload");
    let released = false;
    void lease.whenReleased.then(() => { released = true; });
    void lease.release();
    device.completeAll();
    await Promise.resolve();
    await Promise.resolve();
    expect(released).toBe(false);
    expect(arena.reservedCpuBytes).toBe(288);
    device.invalidate();
    await lease.whenReleased;
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("retains an upload after a submit attempt throws until retirement completes", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    lease.upload();
    let retiring!: Promise<void>;
    expect(() => {
      try { throw new Error("submit may have queued work"); }
      finally { retiring = lease.release(); }
    }).toThrow(/queued work/i);
    expect(arena.reservedCpuBytes).toBe(288);
    expect(lease.status).toBe("retiring");
    device.completeAll();
    await retiring;
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("keeps upload ownership when a device callback disposes the arena during allocation", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const originalCreate = device.createBuffer.bind(device);
    let closing: Promise<void> | undefined;
    vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      closing ??= arena.dispose();
      return originalCreate(...args);
    });
    expect(() => lease.upload()).toThrow(/arena is disposed/i);
    expect(lease.status).toBe("retiring");
    expect(arena.reservedCpuBytes).toBe(288);
    device.completeAll();
    await closing;
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    source.dispose();
    device.dispose();
  });

  it("honors a reentrant lease release during allocation and retires the returned buffer", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const originalCreate = device.createNativePointBuffer.bind(device);
    let released!: Promise<void>;
    let calls = 0;
    vi.spyOn(device, "createNativePointBuffer").mockImplementation(bytes => {
      calls += 1;
      const result = originalCreate(bytes);
      released = lease.release();
      return result;
    });

    expect(() => lease.upload()).toThrow(/released during upload/i);
    expect(calls).toBe(1);
    expect(lease.status).toBe("retiring");
    expect(device.fences.size).toBe(1);
    expect(arena.reservedCpuBytes).toBe(288);
    let settled = false;
    void released.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    device.completeAll();
    await released;
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    expect(arena.reservedGpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("keeps a reentrant release pending if allocation throws without a cleanup receipt", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    let released!: Promise<void>;
    vi.spyOn(device, "createNativePointBuffer").mockImplementation(() => {
      released = lease.release();
      throw new Error("allocation has no receipt");
    });

    expect(() => lease.upload()).toThrow(/no receipt/i);
    expect(lease.status).toBe("uncertain-upload");
    let settled = false;
    void released.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(arena.reservedGpuBytes).toBe(144);
    device.invalidate();
    await released;
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    expect(arena.reservedGpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("defers invalidation cleanup until a reentrant upload has unwound", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    const originalCreate = device.createBuffer.bind(device);
    let created: RenderBuffer | undefined;
    vi.spyOn(device, "createBuffer").mockImplementation((...args) => {
      created = originalCreate(...args);
      device.invalidate();
      return created;
    });
    expect(() => lease.upload()).toThrow(/lost|invalidat/i);
    expect(created?.disposed).toBe(true);
    expect(lease.status).toBe("released");
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("does not treat disposing a borrowed device as a native completion", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry();
    const lease = arena.acquire(source, { start: 0, count: 1 });
    lease.upload();
    const retiring = lease.release();
    device.disposed = true;
    expect(arena.reservedCpuBytes).toBe(288);
    expect(lease.status).toBe("retiring");
    device.completeAll();
    await retiring;
    expect(arena.reservedCpuBytes).toBe(0);
    await arena.dispose();
    source.dispose();
    device.dispose();
  });

  it("uses the real WebGPU device retirement seam with a controlled, non-GPU queue", async () => {
    let finish!: () => void;
    const fence = new Promise<void>(resolve => { finish = resolve; });
    const handles: { size: number; usage: number; destroy: ReturnType<typeof vi.fn> }[] = [];
    const native = {
      limits: { maxBufferSize: 4096, maxVertexBuffers: 8 },
      queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: () => fence },
      createBuffer({ size, usage }: { size: number; usage: number }) {
        const handle = { size, usage, destroy: vi.fn() };
        handles.push(handle);
        return handle;
      }
    } as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry(true);
    const first = arena.acquire(source, { start: 0, count: 1 });
    const second = arena.acquire(source, { start: 1, count: 1 });
    first.upload();
    second.upload();
    const closing = arena.dispose();
    device.dispose();
    expect(arena.reservedCpuBytes).toBe(584);
    expect(handles.every(handle => handle.destroy.mock.calls.length === 0)).toBe(true);
    finish();
    await closing;
    expect(arena.reservedCpuBytes).toBe(0);
    expect(handles.every(handle => handle.destroy.mock.calls.length === 1)).toBe(true);
    source.dispose();
  });

  it("requires an unuploaded live source on every stream and never uploads indices", async () => {
    const device = new PointDevice();
    const other = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    const source = pointGeometry(true);
    const first = arena.acquire(source, { start: 0, count: 1 });
    expect(source.indexBuffer!.uploadedBuffer).toBeNull();
    source.indexBuffer!.upload(other);
    expect(() => arena.acquire(source, { start: 0, count: 1 })).toThrow(/CPU authority/i);
    expectPoint(first, 0, [7, 8, -9], [0, 0, 255, 128]);
    const vertexSource = pointGeometry();
    vertexSource.vertexBuffer.upload(other);
    expect(() => arena.acquire(vertexSource, { start: 0, count: 1 })).toThrow(/CPU authority/i);
    const disposedIndex = pointGeometry(true);
    disposedIndex.indexBuffer!.dispose();
    expect(() => arena.acquire(disposedIndex, { start: 0, count: 1 })).toThrow(/disposed/i);
    await first.release();
    await arena.dispose();
    source.dispose();
    vertexSource.dispose();
    disposedIndex.dispose();
    device.dispose();
    other.dispose();
  });

  it("records failed, lost, successful, multi-device and disposed upload attempts monotonically", async () => {
    const source = pointGeometry(true);
    const firstDevice = new PointDevice();
    const secondDevice = new PointDevice();
    expect(source.vertexBuffer.hasAttemptedUpload).toBe(false);
    expect(source.indexBuffer!.hasAttemptedUpload).toBe(false);
    const vertexRevision = source.vertexBuffer.revision;
    const indexRevision = source.indexBuffer!.revision;
    const vertexDirty = source.vertexBuffer.getDirtyRange();
    const indexDirty = source.indexBuffer!.getDirtyRange();
    const failCreate = vi.spyOn(firstDevice, "createBuffer").mockImplementation(() => { throw new Error("allocation failed"); });
    expect(() => source.vertexBuffer.upload(firstDevice)).toThrow(/allocation failed/i);
    expect(() => source.indexBuffer!.upload(firstDevice)).toThrow(/allocation failed/i);
    expect(source.vertexBuffer.uploadedBuffer).toBeNull();
    expect(source.indexBuffer!.uploadedBuffer).toBeNull();
    expect(source.vertexBuffer.hasAttemptedUpload).toBe(true);
    expect(source.indexBuffer!.hasAttemptedUpload).toBe(true);
    (source.vertexBuffer as unknown as { uploadAttempted: boolean }).uploadAttempted = false;
    (source.indexBuffer! as unknown as { uploadAttempted: boolean }).uploadAttempted = false;
    expect(source.vertexBuffer.hasAttemptedUpload).toBe(true);
    expect(source.indexBuffer!.hasAttemptedUpload).toBe(true);
    expect(source.vertexBuffer.revision).toBe(vertexRevision);
    expect(source.indexBuffer!.revision).toBe(indexRevision);
    expect(source.vertexBuffer.getDirtyRange()).toEqual(vertexDirty);
    expect(source.indexBuffer!.getDirtyRange()).toEqual(indexDirty);
    failCreate.mockRestore();
    const firstVertex = source.vertexBuffer.upload(firstDevice);
    const firstIndex = source.indexBuffer!.upload(firstDevice);
    const secondVertex = source.vertexBuffer.upload(secondDevice);
    const secondIndex = source.indexBuffer!.upload(secondDevice);
    expect(firstVertex).not.toBe(secondVertex);
    expect(firstIndex).not.toBe(secondIndex);
    expect(source.vertexBuffer.hasAttemptedUpload).toBe(true);
    expect(source.indexBuffer!.hasAttemptedUpload).toBe(true);

    const lostSource = pointGeometry(true);
    firstDevice.contextLost = true;
    expect(() => lostSource.vertexBuffer.upload(firstDevice)).toThrow(/context is lost/i);
    expect(() => lostSource.indexBuffer!.upload(firstDevice)).toThrow(/context is lost/i);
    expect(lostSource.vertexBuffer.hasAttemptedUpload).toBe(true);
    expect(lostSource.indexBuffer!.hasAttemptedUpload).toBe(true);
    expect(lostSource.vertexBuffer.uploadedBuffer).toBeNull();
    expect(lostSource.indexBuffer!.uploadedBuffer).toBeNull();
    const arena = new NativePointQuadArena(secondDevice, LIMITS);
    expect(() => arena.acquire(lostSource, { start: 0, count: 1 })).toThrow(/CPU authority/i);
    firstDevice.contextLost = false;
    lostSource.vertexBuffer.upload(firstDevice);
    lostSource.indexBuffer!.upload(firstDevice);
    expect(lostSource.vertexBuffer.hasAttemptedUpload).toBe(true);
    expect(lostSource.indexBuffer!.hasAttemptedUpload).toBe(true);

    const disposed = pointGeometry(true);
    // 5.0 Geometry: a closed geometry no longer exposes its released buffers
    // (`Geometry.vertexBuffer`/`indexBuffer` getters assert alive), so the
    // owned buffers are held directly to observe their disposed upload attempts.
    const disposedVertex = disposed.vertexBuffer;
    const disposedIndex = disposed.indexBuffer!;
    disposed.dispose();
    expect(() => disposed.vertexBuffer).toThrow(/Geometry is disposed/);
    expect(() => disposedVertex.upload(firstDevice)).toThrow(/disposed/i);
    expect(() => disposedIndex.upload(firstDevice)).toThrow(/disposed/i);
    expect(disposedVertex.hasAttemptedUpload).toBe(true);
    expect(disposedIndex.hasAttemptedUpload).toBe(true);
    await arena.dispose();
    source.dispose();
    lostSource.dispose();
    firstDevice.dispose();
    secondDevice.dispose();
  });

  it("fails closed on geometry and buffer subclasses or upload overrides", async () => {
    const device = new PointDevice();
    const arena = new NativePointQuadArena(device, LIMITS);
    class DerivedVertex extends VertexBuffer {}
    class DerivedIndex extends IndexBuffer {}
    class DerivedGeometry extends Geometry {}
    const vertex = new DerivedVertex(VertexFormat.P3, 1);
    const vertexSource = new Geometry(vertex, null, "points");
    const indexSource = new Geometry(new VertexBuffer(VertexFormat.P3, 1), new DerivedIndex([0], 1), "points");
    const geometrySource = new DerivedGeometry(new VertexBuffer(VertexFormat.P3, 1), null, "points");
    const overridden = pointGeometry();
    vi.spyOn(overridden.vertexBuffer, "upload");
    expect(() => arena.acquire(vertexSource, { start: 0, count: 1 })).toThrow(/overrides lack CPU authority/i);
    expect(() => arena.acquire(indexSource, { start: 0, count: 1 })).toThrow(/overrides lack CPU authority/i);
    expect(() => arena.acquire(geometrySource, { start: 0, count: 1 })).toThrow(/overrides lack CPU authority/i);
    expect(() => arena.acquire(overridden, { start: 0, count: 1 })).toThrow(/overrides lack CPU authority/i);
    await arena.dispose();
    vertexSource.dispose();
    indexSource.dispose();
    geometrySource.dispose();
    overridden.dispose();
    device.dispose();
  });

  it("rejects budget, device-slot and overflow admissions before reading or allocating streams", async () => {
    const device = new PointDevice();
    const source = pointGeometry(true);
    const read = vi.spyOn(source.vertexBuffer, "readBytes");
    const create = vi.spyOn(device, "createBuffer");
    const arena = new NativePointQuadArena(device, { ...LIMITS, maxCpuBytes: 287 });
    expect(() => arena.acquire(source, { start: 0, count: 1 })).toThrow(/budget exceeded/i);
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(source.indexBuffer!.uploadedBuffer).toBeNull();
    await arena.dispose();

    const gpuBudget = new NativePointQuadArena(device, { ...LIMITS, maxGpuBytes: 143 });
    expect(() => gpuBudget.acquire(source, { start: 0, count: 1 })).toThrow(/budget exceeded/i);
    expect(create).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    await gpuBudget.dispose();

    const streamBudget = new NativePointQuadArena(device, { ...LIMITS, maxStreamBytes: 95 });
    expect(() => streamBudget.acquire(source, { start: 0, count: 1 })).toThrow(/CPU stream limit/i);
    await streamBudget.dispose();

    const limited = new PointDevice();
    limited.maxBufferSize = 95;
    const limitedArena = new NativePointQuadArena(limited, LIMITS);
    expect(() => limitedArena.acquire(source, { start: 0, count: 1 })).toThrow(/device buffer limit/i);
    await limitedArena.dispose();
    limited.maxBufferSize = 1_000_000;
    limited.maxVertexBuffers = 1;
    const slotArena = new NativePointQuadArena(limited, LIMITS);
    expect(() => slotArena.acquire(source, { start: 0, count: 1 })).toThrow(/slot limit/i);
    await slotArena.dispose();

    const max = Number.MAX_SAFE_INTEGER;
    const stride = Math.ceil((max / 6 + 1) / 4) * 4;
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 }], stride);
    const fake = { topology: "points", vertexBuffer: { format, vertexCount: 1 }, indexBuffer: null } as unknown as Geometry;
    const largeDevice = new PointDevice();
    largeDevice.maxBufferSize = max;
    const largeArena = new NativePointQuadArena(largeDevice, { maxCpuBytes: max, maxGpuBytes: max, maxStreamBytes: max });
    expect(() => largeArena.acquire(fake, { start: 0, count: 1 })).toThrow(/byte length overflows/i);
    const cumulativeStride = Math.floor(max / 8 / 4) * 4;
    const cumulativeFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "color", components: 4, offset: 0, bufferSlot: 1 }
    ], cumulativeStride, [{ slot: 1, stride: cumulativeStride }]);
    const cumulative = { topology: "points", vertexBuffer: { format: cumulativeFormat, vertexCount: 1 }, indexBuffer: null } as unknown as Geometry;
    expect(() => largeArena.acquire(cumulative, { start: 0, count: 1 })).toThrow(/total byte length overflows/i);
    await largeArena.dispose();
    source.dispose();
    device.dispose();
    limited.dispose();
    largeDevice.dispose();
  });

  it("rejects invalid ranges, layouts and stale device generations without disturbing existing leases", async () => {
    const device = new PointDevice();
    const source = pointGeometry(true);
    const arena = new NativePointQuadArena(device, LIMITS);
    const first = arena.acquire(source, { start: 0, count: 1 });
    expect(() => arena.acquire(source, { start: 3, count: 2 })).toThrow(/range is invalid/i);
    source.indexBuffer!.setIndices(3, [5]);
    expect(() => arena.acquire(source, { start: 3, count: 1 })).toThrow(/outside a source vertex stream/i);
    expectPoint(first, 0, [7, 8, -9], [0, 0, 255, 128]);
    const conflictFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 },
      { semantic: "tangent", components: 4, offset: 12 }
    ], 28);
    const conflict = new Geometry(new VertexBuffer(conflictFormat, 1), null, "points");
    expect(() => arena.acquire(conflict, { start: 0, count: 1 })).toThrow(/collides/i);
    device.generation += 1;
    expect(() => first.upload()).toThrow(/generation changed/i);
    expect(() => arena.acquire(source, { start: 0, count: 1 })).toThrow(/generation changed/i);
    await first.release();
    await arena.dispose();
    source.dispose();
    conflict.dispose();
    device.dispose();
  });
});
