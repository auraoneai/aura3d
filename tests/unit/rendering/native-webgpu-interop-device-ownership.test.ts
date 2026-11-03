import { describe, expect, it, vi } from "vitest";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { Texture } from "../../../packages/rendering/src/Texture";
import {
  WebGPUDevice,
  type WebGPUDeviceLike,
  type WebGPUResidencyAllocation,
  type WebGPUResidencySource
} from "../../../packages/rendering/src/WebGPUDevice";

// Queue-shaped doubles exercise the real device and accounting paths; they
// do not establish physical GPU/driver behavior.
async function fixture(borrowed = true) {
  let finish!: () => void;
  let rejectFence!: (error: unknown) => void;
  let lose!: (info: { reason: string; message: string }) => void;
  const fence = new Promise<void>((resolve, reject) => { finish = resolve; rejectFence = reject; });
  const lost = new Promise<{ reason: string; message: string }>(resolve => { lose = resolve; });
  const textures: { label: string; destroy: ReturnType<typeof vi.fn>; createView(): object }[] = [];
  const buffers: { label: string; destroy: ReturnType<typeof vi.fn> }[] = [];
  const native = {
    lost,
    limits: { maxBufferSize: 1024, maxVertexBuffers: 8 },
    queue: {
      submit: vi.fn(),
      writeBuffer: vi.fn(),
      writeTexture: vi.fn(),
      onSubmittedWorkDone: vi.fn(() => fence)
    },
    createTexture: vi.fn(({ label }: { label?: string }) => {
      const texture = { label: label ?? "", destroy: vi.fn(), createView: () => ({}) };
      textures.push(texture);
      return texture;
    }),
    createBuffer: vi.fn(({ label }: { label?: string }) => {
      const buffer = { label: label ?? "", destroy: vi.fn() };
      buffers.push(buffer);
      return buffer;
    }),
    destroy: vi.fn()
  };
  const injected = native as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({
    adapter: { requestDevice: async () => injected },
    ...(borrowed ? { device: injected } : {})
  });
  return { device, native, textures, buffers, finish, rejectFence, lose };
}

function streamingSource(): WebGPUResidencySource {
  const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
  return { texture, identity: {}, fallback: [0, 0, 0, 255], levels: [{ width: 1, height: 1, bytes: 4 }] };
}

const upload = [{ level: 0, value: { data: new Uint8Array(4) } }];
const options = () => ({ maxBytes: 32, signal: new AbortController().signal });

async function flush(): Promise<void> {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
}

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

describe("WebGPUDevice interop teardown ownership", () => {
  it("transfers scheduled borrowed-device cleanup to interop until its fence completes", async () => {
    const owner = await fixture(), peer = await fixture();
    const target = owner.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const buffer = owner.device.createBuffer("vertex", 4);
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(owner.device);
    target.dispose();
    buffer.dispose();

    lifecycle.dispose();
    // The synchronous wrapper has handed cleanup to interop; its pending
    // receipt is for failed/in-progress wrapper cleanup, not the GPU fence.
    expect(lifecycle.disposed).toBe(true);
    expect(owner.device.resourceInterop.liveResources).toBe(2);
    expect(owner.device.resourceInterop.owns(owner.textures[0]!)).toBe(true);
    expect(owner.device.resourceInterop.owns(owner.buffers[0]!)).toBe(true);
    expect(owner.device.getDiagnostics().textureBytes).toBe(16);
    expect(owner.textures[0]!.destroy).not.toHaveBeenCalled();
    expect(owner.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(peer.textures[0]!.destroy).not.toHaveBeenCalled();

    owner.finish();
    await flush();
    expect(owner.device[resourceDisposalPending]).toBe(false);
    expect(owner.device.getDiagnostics().textureBytes).toBe(0);
    expect(owner.textures[0]!.destroy).toHaveBeenCalledOnce();
    expect(owner.buffers[0]!.destroy).toHaveBeenCalledOnce();
    expect(peer.device.getDiagnostics().textureBytes).toBe(4);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    other.dispose();
    peer.finish();
    await flush();
    peer.device.dispose();
  });

  it("retains a failed fence without an unhandled rejection until confirmed loss invalidates the lease", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const streamingLoss = vi.fn();
    f.device.createTextureResidencyAdapter().onDeviceLost(streamingLoss);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      target.dispose();
      f.device.dispose();
      f.rejectFence(new Error("fence rejected"));
      await flush();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(f.device.resourceInterop.owns(f.textures[0]!)).toBe(true);
      expect(f.device.getDiagnostics().textureBytes).toBe(4);
      expect(f.textures[0]!.destroy).not.toHaveBeenCalled();
      expect(streamingLoss).not.toHaveBeenCalled();

      f.lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      expect(f.textures[0]!.destroy).toHaveBeenCalledOnce();
      expect(f.device.getDiagnostics().textureBytes).toBe(0);
      expect(f.device[resourceDisposalPending]).toBe(false);
      expect(streamingLoss).toHaveBeenCalledOnce();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("keeps lifecycle ownership when the borrowed queue cannot provide a fence", async () => {
    const f = await fixture();
    (f.native.queue as { onSubmittedWorkDone?: () => Promise<void> }).onSubmittedWorkDone = undefined;
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    target.dispose();
    expect(leaves(capture(() => lifecycle.dispose())).some(error =>
      error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
    expect(lifecycle.leakCount()).toBe(1);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.device.resourceInterop.owns(f.textures[0]!)).toBe(true);
    expect(f.device.getDiagnostics().textureBytes).toBe(16);
    f.lose({ reason: "destroyed", message: "confirmed" });
    await flush();
    expect(f.textures[0]!.destroy).toHaveBeenCalledOnce();
    expect(f.device[resourceDisposalPending]).toBe(false);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
  });

  it("fails closed when an injected queue's fence getter reenters the disposal receipt", async () => {
    const f = await fixture();
    let nested = false;
    Object.defineProperty(f.native.queue, "onSubmittedWorkDone", {
      configurable: true,
      get() { nested = f.device[resourceDisposalPending]; return undefined; }
    });
    const target = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    target.dispose();
    f.device.dispose();
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(nested).toBe(true);
    expect(f.device.resourceInterop.owns(f.textures[0]!)).toBe(true);
    f.lose({ reason: "destroyed", message: "confirmed" });
    await flush();
    expect(f.device[resourceDisposalPending]).toBe(false);
    expect(f.textures[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("publishes a synchronous invalidation failure before promise observers run", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const native = f.textures[0]!;
    const failure = new Error("invalidation failed after an ambiguous side effect");
    native.destroy.mockImplementationOnce(() => { throw failure; });
    target.dispose();

    expect(leaves(capture(() => f.device.resourceInterop.invalidate()))).toContain(failure);
    expect((target as typeof target & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
    expect(f.device.getDiagnostics().lastError).toContain(failure.message);
    expect(capture(() => target.dispose())).toBe(failure);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(f.device.resourceInterop.owns(native)).toBe(true);
    expect(f.device.getDiagnostics().textureBytes).toBe(16);
    await flush();
    expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
    expect(f.device[resourceDisposalPending]).toBe(true);
  });

  it.each([true, false])("withholds residency and point-loss receipts on failed invalidation (borrowed=%s)", async borrowed => {
    const f = await fixture(borrowed), peer = await fixture();
    const adapter = f.device.createTextureResidencyAdapter();
    const source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const failed = f.textures[0]!;
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const failure = new Error("streaming native destroy is ambiguous");
    failed.destroy.mockImplementationOnce(() => { throw failure; });
    const streamingLoss = vi.fn(), pointLoss = vi.fn(), deviceLoss = vi.fn();
    adapter.onDeviceLost(streamingLoss);
    f.device.onNativePointInvalidated(pointLoss);
    f.device.onDeviceLost(deviceLoss);

    if (borrowed) {
      f.lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      expect(deviceLoss).toHaveBeenCalledOnce();
      expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
    } else {
      expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
      expect(f.native.destroy).toHaveBeenCalledOnce();
    }
    expect(streamingLoss).not.toHaveBeenCalled();
    expect(pointLoss).not.toHaveBeenCalled();
    expect(f.device.resourceInterop.owns(failed)).toBe(true);
    expect(f.device.getDiagnostics().textureBytes).toBe(4);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
    expect(failed.destroy).toHaveBeenCalledOnce();
    f.finish();
    await flush();
    expect(failed.destroy).toHaveBeenCalledOnce();
    expect(streamingLoss).not.toHaveBeenCalled();
    expect(pointLoss).not.toHaveBeenCalled();
    expect(peer.textures[0]!.destroy).not.toHaveBeenCalled();
    expect(peer.device.getDiagnostics().textureBytes).toBe(4);
    other.dispose();
    peer.finish();
    await flush();
    peer.device.dispose();
  });

  it("delivers loss receipts only after an explicit safe retry finishes the real streaming allocation", async () => {
    const f = await fixture();
    const adapter = f.device.createTextureResidencyAdapter(), source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const native = f.textures[0]!;
    const internal = f.device as unknown as { nativeStreamingAllocations: Set<WebGPUResidencyAllocation> };
    const originalDelete = internal.nativeStreamingAllocations.delete.bind(internal.nativeStreamingAllocations);
    const failure = new Error("retryable allocation bookkeeping failed");
    const remove = vi.spyOn(internal.nativeStreamingAllocations, "delete")
      .mockImplementationOnce(value => { originalDelete(value); throw failure; })
      .mockImplementation(value => originalDelete(value));
    const streamingLoss = vi.fn(), pointLoss = vi.fn(), deviceLoss = vi.fn();
    adapter.onDeviceLost(streamingLoss);
    f.device.onNativePointInvalidated(pointLoss);
    f.device.onDeviceLost(deviceLoss);
    try {
      f.lose({ reason: "destroyed", message: "confirmed" });
      await flush();
      expect(deviceLoss).toHaveBeenCalledOnce();
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(adapter.usageBytes()).toBe(0);
      expect(f.device.resourceInterop.owns(native)).toBe(true);
      expect(streamingLoss).not.toHaveBeenCalled();
      expect(pointLoss).not.toHaveBeenCalled();
      f.device.dispose();
      expect(f.device.resourceInterop.owns(native)).toBe(false);
      expect(f.device[resourceDisposalPending]).toBe(false);
      expect(remove).toHaveBeenCalledTimes(2);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(streamingLoss).toHaveBeenCalledOnce();
      expect(pointLoss).toHaveBeenCalledOnce();
      f.finish();
      await flush();
      expect(streamingLoss).toHaveBeenCalledOnce();
      expect(pointLoss).toHaveBeenCalledOnce();
    } finally {
      remove.mockRestore();
    }
  });

  it("notifies every loss observer if a point invalidation callback reenters device disposal", async () => {
    const f = await fixture(), peer = await fixture();
    const adapter = f.device.createTextureResidencyAdapter(), source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const streamingLoss = vi.fn(), first = vi.fn(), second = vi.fn();
    const pointLoss = vi.fn(() => { f.device.dispose(); });
    adapter.onDeviceLost(streamingLoss);
    f.device.onNativePointInvalidated(pointLoss);
    f.device.onDeviceLost(first);
    f.device.onDeviceLost(second);
    f.lose({ reason: "destroyed", message: "confirmed" });
    await flush();
    expect(pointLoss).toHaveBeenCalledOnce();
    expect(streamingLoss).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(f.device.disposed).toBe(true);
    expect(f.device.resourceInterop.liveResources).toBe(0);
    expect(f.textures[0]!.destroy).toHaveBeenCalledOnce();
    expect(peer.textures[0]!.destroy).not.toHaveBeenCalled();
    other.dispose();
    peer.finish();
    await flush();
    peer.device.dispose();
  });

  it("observes fire-and-forget point cleanup failures while preserving their rejected receipts", async () => {
    const f = await fixture();
    const uploadFailure = new Error("point upload failed");
    const failedUploadCleanup = new Error("unreturned point cleanup failed");
    const failedRetirement = new Error("point retirement failed");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      f.native.queue.writeBuffer.mockImplementationOnce(() => { throw uploadFailure; });
      const uploadResult = f.device.createNativePointBuffer(new Uint8Array(4));
      if (uploadResult.ok) throw new Error("expected point upload failure");
      expect(uploadResult.error).toBe(uploadFailure);
      f.buffers[0]!.destroy.mockImplementationOnce(() => { throw failedUploadCleanup; });
      const point = f.device.createNativePointBuffer(new Uint8Array(4));
      if (!point.ok) throw point.error;
      f.buffers[1]!.destroy.mockImplementationOnce(() => { throw failedRetirement; });
      const retirement = f.device.retireNativePointBuffer(point.buffer);
      // Intentionally do not observe either returned receipt until after the
      // queue callback and the unhandled-rejection event-loop checkpoint.
      f.finish();
      await flush();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      await expect(uploadResult.cleanup).rejects.toBe(failedUploadCleanup);
      await expect(retirement).rejects.toBe(failedRetirement);
      expect(f.device.resourceInterop.owns(f.buffers[0]!)).toBe(true);
      expect(f.device.resourceInterop.owns(f.buffers[1]!)).toBe(true);
      const errors = leaves(capture(() => f.device.dispose()));
      expect(errors).toContain(failedUploadCleanup);
      expect(errors).toContain(failedRetirement);
      expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
      expect(f.buffers[1]!.destroy).toHaveBeenCalledOnce();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("retries only idempotent streaming bookkeeping, including reentrancy, after one native destruction and debit", async () => {
    const f = await fixture(), peer = await fixture();
    const adapter = f.device.createTextureResidencyAdapter();
    const source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const allocation = (await adapter.allocate(source, upload, options())).allocation;
    const native = f.textures[1]!;
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const internal = f.device as unknown as { nativeStreamingAllocations: Set<WebGPUResidencyAllocation> };
    const originalDelete = internal.nativeStreamingAllocations.delete.bind(internal.nativeStreamingAllocations);
    const firstFailure = new Error("first bookkeeping failure"), secondFailure = new Error("retry bookkeeping failure");
    let attempts = 0, nested: Promise<void> | undefined;
    const remove = vi.spyOn(internal.nativeStreamingAllocations, "delete").mockImplementation(value => {
      const result = originalDelete(value);
      if (value !== allocation) return result;
      attempts += 1;
      if (attempts === 1) throw firstFailure;
      if (attempts === 2) { nested = adapter.retire(allocation); throw secondFailure; }
      return result;
    });
    try {
      const first = adapter.retire(allocation);
      expect(adapter.usageBytes()).toBe(8);
      f.finish();
      await expect(first).rejects.toBe(firstFailure);
      await flush();
      expect(adapter.usageBytes()).toBe(4);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(f.device.resourceInterop.owns(native)).toBe(true);
      const retry = adapter.retire(allocation);
      expect(nested).toBe(retry);
      await expect(retry).rejects.toBe(secondFailure);
      await flush();
      expect(f.device.getDiagnostics().lastError).toContain(secondFailure.message);
      await expect(adapter.retire(allocation)).resolves.toBeUndefined();
      expect(attempts).toBe(3);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(adapter.usageBytes()).toBe(4);
      expect(f.device.resourceInterop.owns(native)).toBe(false);
      expect(peer.textures[0]!.destroy).not.toHaveBeenCalled();
      await adapter.unprepare(source, adapter.generation());
      expect(adapter.usageBytes()).toBe(0);
      f.device.dispose();
      other.dispose();
      peer.finish();
      await flush();
      peer.device.dispose();
    } finally {
      remove.mockRestore();
    }
  });

  it("does not let an older retirement rejection overwrite a later synchronous retry failure", async () => {
    const f = await fixture();
    const adapter = f.device.createTextureResidencyAdapter(), source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const allocation = (await adapter.allocate(source, upload, options())).allocation;
    const native = f.textures[1]!;
    const internal = f.device as unknown as {
      nativeStreamingAllocations: Set<WebGPUResidencyAllocation>;
      nativeRetirementFailures: Map<object, { error: unknown }>;
    };
    const originalDelete = internal.nativeStreamingAllocations.delete.bind(internal.nativeStreamingAllocations);
    const first = new Error("first synchronous cleanup failed"), second = new Error("later synchronous cleanup failed");
    let attempts = 0;
    const remove = vi.spyOn(internal.nativeStreamingAllocations, "delete").mockImplementation(value => {
      const result = originalDelete(value);
      if (value === allocation) {
        attempts += 1;
        if (attempts === 1) throw first;
        if (attempts === 2) throw second;
      }
      return result;
    });
    try {
      const retirement = adapter.retire(allocation);
      expect(leaves(capture(() => f.device.resourceInterop.invalidate()))).toContain(first);
      const retry = f.device.resourceInterop.retire(native);
      expect(internal.nativeRetirementFailures.get(native)?.error).toBe(second);
      await expect(retirement).rejects.toBe(first);
      await expect(retry).rejects.toBe(second);
      await flush();
      expect(internal.nativeRetirementFailures.get(native)?.error).toBe(second);
      expect(f.device.getDiagnostics().lastError).toContain(second.message);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(adapter.usageBytes()).toBe(0);
      await expect(adapter.retire(allocation)).resolves.toBeUndefined();
      expect(attempts).toBe(3);
      expect(native.destroy).toHaveBeenCalledOnce();
      await adapter.unprepare(source, adapter.generation());
      f.device.dispose();
    } finally {
      remove.mockRestore();
    }
  });

  it("preserves both the real streaming upload failure and its failed native retirement", async () => {
    const f = await fixture();
    const adapter = f.device.createTextureResidencyAdapter();
    const source = streamingSource();
    adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 });
    const uploadFailure = new Error("upload failed");
    const cleanupFailure = new Error("destroy failed after upload");
    const native = { label: "failed-upload", destroy: vi.fn(() => { throw cleanupFailure; }), createView: () => ({}) };
    f.native.createTexture.mockReturnValueOnce(native);
    f.native.queue.writeTexture.mockImplementationOnce(() => { throw uploadFailure; });
    const result = adapter.allocate(source, upload, options()).then(() => undefined, error => error);
    expect(adapter.usageBytes()).toBe(8);
    f.finish();
    const error = await result;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([uploadFailure, cleanupFailure]);
    expect(error.cause).toBe(uploadFailure);
    expect(f.device.resourceInterop.owns(native)).toBe(true);
    expect(f.device.getDiagnostics().lastError).toContain(cleanupFailure.message);
    expect(adapter.usageBytes()).toBe(8);
    expect(leaves(capture(() => f.device.dispose()))).toContain(cleanupFailure);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(f.device[resourceDisposalPending]).toBe(true);
  });

  it("does not publish a cleanup receipt for an unregistered foreign native alias", async () => {
    const owner = await fixture(), peer = await fixture();
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const foreign = peer.textures[0]!;
    const adapter = owner.device.createTextureResidencyAdapter(), source = streamingSource();
    const streamingLoss = vi.fn();
    adapter.onDeviceLost(streamingLoss);
    owner.native.createTexture.mockReturnValueOnce(foreign);
    expect(() => adapter.prepare(source, { generation: adapter.generation(), maxBytes: 32 })).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(adapter.usageBytes()).toBe(4);
    expect(leaves(capture(() => owner.device.dispose())).some(error =>
      error instanceof Error && error.message === "WEBGPU_INTEROP_RESOURCE_OWNED")).toBe(true);
    await flush();
    expect(streamingLoss).not.toHaveBeenCalled();
    expect(owner.device[resourceDisposalPending]).toBe(true);
    expect(foreign.destroy).not.toHaveBeenCalled();
    expect(peer.device.getDiagnostics().textureBytes).toBe(4);
    other.dispose();
    peer.finish();
    await flush();
    expect(foreign.destroy).toHaveBeenCalledOnce();
    peer.device.dispose();
  });
});
