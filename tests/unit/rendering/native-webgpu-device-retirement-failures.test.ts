import { describe, expect, it, vi } from "vitest";
import { WebGPUDevice, type WebGPUDeviceLike, type WebGPUResidencyAllocation } from "../../../packages/rendering/src/WebGPUDevice";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { RenderBuffer } from "../../../packages/rendering/src/RenderDevice";
import type { NativeVertexConversionPlan } from "../../../packages/rendering/src/webgpu/NativeVertexAttributeConversion";

// Queue and resource recorders only. These tests do not execute GPU work or
// establish that a browser or driver physically released an allocation.
async function fixture(borrowed = true) {
  let finish!: () => void;
  let lose!: (info: { reason: string; message: string }) => void;
  let rejectLoss!: (error: Error) => void;
  const fence = new Promise<void>(resolve => { finish = resolve; });
  const lost = new Promise<{ reason: string; message: string }>((resolve, reject) => { lose = resolve; rejectLoss = reject; });
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
  return { device, native, textures, buffers, finish, lose, rejectLoss };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function causes(error: unknown): unknown[] {
  return error instanceof AggregateError ? [error, ...error.errors.flatMap(causes)] : [error];
}

type StreamingInternals = {
  readonly nativeStreamingAllocations: Set<WebGPUResidencyAllocation>;
  registerStreamingAllocation(texture: Texture, native: { destroy(): void; createView(): object },
    view: object, bytes: number, release: () => void): WebGPUResidencyAllocation;
};

describe("WebGPUDevice native retirement failures", () => {
  it("keeps a failed native target owned and charged, propagates the error, and leaves peers alone", async () => {
    const owner = await fixture(), peer = await fixture();
    const failed = owner.device.createRenderTarget({ width: 2, height: 2, depth: false, label: "failed" });
    const healthy = owner.device.createRenderTarget({ width: 1, height: 1, depth: false, label: "healthy" });
    const other = peer.device.createRenderTarget({ width: 1, height: 1, depth: false, label: "other" });
    const bad = owner.textures[0]!, good = owner.textures[1]!, foreign = peer.textures[0]!;
    const error = new Error("ambiguous native destruction");
    let nativeSideEffects = 0;
    bad.destroy.mockImplementationOnce(() => { nativeSideEffects += 1; throw error; });

    failed.dispose();
    healthy.dispose();
    expect(owner.device.getDiagnostics().textureBytes).toBe(20);
    expect(bad.destroy).not.toHaveBeenCalled();
    owner.finish();
    await flush();

    expect(bad.destroy).toHaveBeenCalledOnce();
    expect(good.destroy).toHaveBeenCalledOnce();
    expect(nativeSideEffects).toBe(1);
    expect(owner.device.resourceInterop.owns(bad)).toBe(true);
    expect(owner.device.resourceInterop.owns(good)).toBe(false);
    expect(owner.device.getDiagnostics().textureBytes).toBe(16);
    expect(owner.device.getDiagnostics().lastError).toContain(error.message);
    expect((failed as typeof failed & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
    expect(capture(() => failed.dispose())).toBe(error);
    expect(foreign.destroy).not.toHaveBeenCalled();
    expect(peer.device.getDiagnostics().textureBytes).toBe(4);
    expect(() => peer.device.resourceInterop.register(bad, () => bad.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");

    const lifecycle = new ResourceLifecycle();
    lifecycle.track(owner.device);
    expect(causes(capture(() => lifecycle.dispose()))).toContain(error);
    expect(owner.device[resourceDisposalPending]).toBe(true);
    expect(lifecycle.leakCount()).toBe(1);
    await flush();
    expect(causes(capture(() => lifecycle.dispose()))).toContain(error);
    expect(bad.destroy).toHaveBeenCalledOnce();
    expect(owner.device.getDiagnostics().textureBytes).toBe(16);

    other.dispose();
    peer.finish();
    await flush();
    expect(foreign.destroy).toHaveBeenCalledOnce();
    expect(peer.device.getDiagnostics().textureBytes).toBe(0);
    peer.device.dispose();
  });

  it.each(["before", "after"] as const)(
    "does not replay an accounting callback that throws %s its debit",
    async when => {
      const f = await fixture();
      const texture = new Texture({ width: 1, height: 1 });
      const native = f.native.createTexture({ label: "stream" });
      const internal = f.device as unknown as StreamingInternals;
      const failure = new Error(`accounting failed ${when} debit`);
      let charge = 4;
      const release = vi.fn(() => {
        if (when === "before") throw failure;
        charge -= 4;
        throw failure;
      });
      const allocation = internal.registerStreamingAllocation(texture, native, {}, 4, release);
      const adapter = f.device.createTextureResidencyAdapter();
      const first = adapter.retire(allocation);
      expect(native.destroy).not.toHaveBeenCalled();
      expect(charge).toBe(4);
      f.finish();
      await expect(first).rejects.toBe(failure);
      await flush();
      expect(charge).toBe(when === "before" ? 4 : 0);
      expect(internal.nativeStreamingAllocations.has(allocation)).toBe(true);
      expect(f.device.resourceInterop.owns(native)).toBe(true);

      const retry = adapter.retire(allocation);
      expect(retry).not.toBe(first);
      await expect(retry).rejects.toBe(failure);
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(charge).toBe(when === "before" ? 4 : 0);
      expect(causes(capture(() => f.device.dispose()))).toContain(failure);
      expect(f.device[resourceDisposalPending]).toBe(true);
    }
  );

  it("retries only idempotent bookkeeping after native destruction and one debit", async () => {
    const f = await fixture();
    const texture = new Texture({ width: 1, height: 1 });
    const native = f.native.createTexture({ label: "retryable-bookkeeping" });
    const internal = f.device as unknown as StreamingInternals;
    let charge = 4;
    const release = vi.fn(() => { charge -= 4; });
    const allocation = internal.registerStreamingAllocation(texture, native, {}, 4, release);
    const deleteAllocation = internal.nativeStreamingAllocations.delete.bind(internal.nativeStreamingAllocations);
    const failure = new Error("post-debit bookkeeping failed");
    const remove = vi.spyOn(internal.nativeStreamingAllocations, "delete")
      .mockImplementationOnce(value => { deleteAllocation(value); throw failure; })
      .mockImplementation(value => deleteAllocation(value));
    const adapter = f.device.createTextureResidencyAdapter();

    const first = adapter.retire(allocation);
    f.finish();
    await expect(first).rejects.toBe(failure);
    await flush();
    expect(charge).toBe(0);
    expect(f.device.resourceInterop.owns(native)).toBe(true);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();

    const retry = adapter.retire(allocation);
    await expect(retry).resolves.toBeUndefined();
    expect(adapter.retire(allocation)).toBe(retry);
    expect(f.device.resourceInterop.owns(native)).toBe(false);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(charge).toBe(0);
    f.device.dispose();
    remove.mockRestore();
  });

  it("does not double-debit sampled-texture retirement when its budget callback throws after release", async () => {
    const f = await fixture();
    const texture = new Texture({ width: 1, height: 1, data: new Uint8Array(4), generateMipmaps: false });
    const native = f.device.getNativeTexture(texture);
    const internal = f.device as unknown as { nativeBudgetRetirement: WeakMap<object, () => void> };
    const failure = new Error("sampled budget callback threw after debit");
    texture.dispose();
    const release = internal.nativeBudgetRetirement.get(native)!;
    const wrapped = vi.fn(() => { release(); throw failure; });
    internal.nativeBudgetRetirement.set(native, wrapped);
    expect(f.device.getDiagnostics().textureBytes).toBe(4);
    f.finish();
    await flush();
    expect(f.device.getDiagnostics().textureBytes).toBe(0);
    expect(f.device.resourceInterop.owns(native)).toBe(true);
    expect(wrapped).toHaveBeenCalledOnce();
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    await flush();
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    expect(wrapped).toHaveBeenCalledOnce();
    expect(f.device.getDiagnostics().textureBytes).toBe(0);
  });

  it("does not debit conversion bytes twice when a later counter throws after mutation", async () => {
    const f = await fixture(), peer = await fixture();
    const source = f.device.createBuffer("vertex", 4, new Uint8Array(4));
    const internal = f.device as unknown as {
      vertexConversionBytes: number;
      vertexConversionCount: number;
      convertedVertexBuffer(source: RenderBuffer, slot: number, plan: NativeVertexConversionPlan, count: number): object;
    };
    const plan: NativeVertexConversionPlan = {
      arrayStride: 4, attributes: [], fields: [], sourceStride: 4, sourceEnd: 4, key: "cleanup-test"
    };
    const conversion = internal.convertedVertexBuffer(source, 0, plan, 1);
    const native = f.buffers.find(buffer => buffer.label.startsWith("aura3d-vertex-conversion"))!;
    expect(internal.vertexConversionBytes).toBe(4);
    expect(internal.vertexConversionCount).toBe(1);
    let count = internal.vertexConversionCount;
    const failure = new Error("conversion counter threw after its debit");
    Object.defineProperty(internal, "vertexConversionCount", {
      configurable: true,
      get: () => count,
      set(value: number) { count = value; throw failure; }
    });
    const peerBuffer = peer.device.createBuffer("vertex", 4);
    source.dispose();
    f.finish();
    await flush();
    expect(internal.vertexConversionBytes).toBe(0);
    expect(count).toBe(0);
    expect(f.device.resourceInterop.owns(conversion)).toBe(true);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(peer.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    await flush();
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    expect(internal.vertexConversionBytes).toBe(0);
    expect(count).toBe(0);
    expect(native.destroy).toHaveBeenCalledOnce();
    peerBuffer.dispose();
    peer.finish();
    await flush();
    expect(peer.buffers[0]!.destroy).toHaveBeenCalledOnce();
    peer.device.dispose();
  });

  it("rejects point-buffer cleanup and keeps its buffer retryable and owned", async () => {
    const f = await fixture();
    const point = f.device.createNativePointBuffer(new Uint8Array(4));
    expect(point.ok).toBe(true);
    if (!point.ok) throw point.error;
    const native = f.buffers[0]!;
    const failure = new Error("point-buffer native destroy failed");
    native.destroy.mockImplementationOnce(() => { throw failure; });
    const completion = f.device.retireNativePointBuffer(point.buffer);
    f.finish();
    await expect(completion).rejects.toBe(failure);
    await flush();
    expect((point.buffer as RenderBuffer & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
    expect(f.device.resourceInterop.owns(native)).toBe(true);
    expect(capture(() => { void f.device.retireNativePointBuffer(point.buffer); })).toBe(failure);
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("retains the upload error while reporting an unreturned point-buffer cleanup failure", async () => {
    const f = await fixture();
    const uploadFailure = new Error("point upload failed");
    const cleanupFailure = new Error("point cleanup failed");
    const native = { label: "point-upload", destroy: vi.fn(() => { throw cleanupFailure; }) };
    f.native.createBuffer.mockReturnValueOnce(native);
    f.native.queue.writeBuffer.mockImplementationOnce(() => { throw uploadFailure; });
    const result = f.device.createNativePointBuffer(new Uint8Array(4));
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failed allocation");
    expect(result.error).toBe(uploadFailure);
    f.finish();
    await expect(result.cleanup).rejects.toBe(cleanupFailure);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(f.device.resourceInterop.owns(native)).toBe(true);
  });

  it("evicts a rejected device-wide retirement and retries only on explicit disposal", async () => {
    const f = await fixture();
    const failure = new Error("first safe bookkeeping attempt failed");
    const resource = { destroy: vi.fn() };
    const cleanup = vi.fn(() => { throw failure; });
    const retry = vi.fn(() => resource.destroy());
    f.device.resourceInterop.register(resource, cleanup, { retryDestroy: retry });
    const internal = f.device as unknown as { interopRetirement: Promise<void> | null };
    const residencyLoss = vi.fn(), unrelatedLoss = vi.fn();
    f.device.createTextureResidencyAdapter().onDeviceLost(residencyLoss);
    f.device.onDeviceLost(unrelatedLoss);

    f.device.dispose();
    const first = internal.interopRetirement!;
    f.device.dispose();
    expect(internal.interopRetirement).toBe(first);
    f.finish();
    await expect(first).rejects.toBe(failure);
    await flush();
    expect(f.device.resourceInterop.owns(resource)).toBe(true);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.device.getDiagnostics().lastError).toContain(failure.message);
    expect(retry).not.toHaveBeenCalled();
    expect(residencyLoss).not.toHaveBeenCalled();
    expect(unrelatedLoss).not.toHaveBeenCalled();

    f.device.dispose();
    await flush();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledOnce();
    expect(resource.destroy).toHaveBeenCalledOnce();
    expect(f.device.resourceInterop.owns(resource)).toBe(false);
    expect(f.device[resourceDisposalPending]).toBe(false);
    expect(residencyLoss).toHaveBeenCalledOnce();
    expect(unrelatedLoss).not.toHaveBeenCalled();
  });

  it("joins reentrant disposal to the existing retirement without double destruction or debit", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 2, height: 2, depth: false });
    const native = f.textures[0]!;
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(target);
    let nested: unknown, nestedLifecycle: unknown;
    native.destroy.mockImplementation(() => {
      nestedLifecycle = capture(() => lifecycle.dispose());
      expect((target as typeof target & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
      nested = capture(() => f.device.dispose());
      expect(f.device[resourceDisposalPending]).toBe(true);
    });
    target.dispose();
    f.finish();
    await flush();
    expect(nested).toBeUndefined();
    expect(causes(nestedLifecycle).some(error =>
      error instanceof Error && error.message === "Resource disposal did not complete.")).toBe(true);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(f.device.getDiagnostics().textureBytes).toBe(0);
    expect(f.device.resourceInterop.owns(native)).toBe(false);
    expect(f.device[resourceDisposalPending]).toBe(false);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    f.device.dispose();
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("does not report streaming loss from a rejected loss promise until retirement succeeds", async () => {
    const f = await fixture();
    const streamingLoss = vi.fn(), deviceLoss = vi.fn();
    f.device.createTextureResidencyAdapter().onDeviceLost(streamingLoss);
    f.device.onDeviceLost(deviceLoss);
    const resource = { destroy: vi.fn() };
    const failure = new Error("loss-path cleanup failed");
    f.device.resourceInterop.register(resource, () => { throw failure; }, { retryDestroy: () => resource.destroy() });
    f.rejectLoss(new Error("loss promise rejected"));
    await flush();
    expect(deviceLoss).toHaveBeenCalledOnce();
    expect(streamingLoss).not.toHaveBeenCalled();
    f.finish();
    await flush();
    expect(f.device.resourceInterop.owns(resource)).toBe(true);
    expect(streamingLoss).not.toHaveBeenCalled();
    expect(f.device.getDiagnostics().lastError).toContain(failure.message);
    f.device.dispose();
    await flush();
    expect(resource.destroy).toHaveBeenCalledOnce();
    expect(streamingLoss).toHaveBeenCalledOnce();
  });

  it("handles fire-and-forget retirement rejections without hiding them from disposal", async () => {
    const f = await fixture();
    const target = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const failure = new Error("fire-and-forget cleanup failed");
    f.textures[0]!.destroy.mockImplementationOnce(() => { throw failure; });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      target.dispose();
      f.finish();
      await flush();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(f.device.getDiagnostics().lastError).toContain(failure.message);
      expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("never destroys a foreign native texture when registration fails", async () => {
    const owner = await fixture(), other = await fixture();
    const target = owner.device.createRenderTarget({ width: 1, height: 1, depth: false });
    const foreign = owner.textures[0]!;
    other.native.createTexture.mockReturnValueOnce(foreign);
    expect(() => other.device.createRenderTarget({ width: 1, height: 1, depth: false })).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(foreign.destroy).not.toHaveBeenCalled();
    expect(() => owner.device.resourceInterop.assertUsable(foreign)).not.toThrow();
    expect(other.device.getDiagnostics().textureBytes).toBe(4);
    expect(causes(capture(() => other.device.dispose())).some(error =>
      error instanceof Error && error.message === "WEBGPU_INTEROP_RESOURCE_OWNED")).toBe(true);
    expect(other.device[resourceDisposalPending]).toBe(true);
    target.dispose();
    owner.finish();
    await flush();
    expect(foreign.destroy).toHaveBeenCalledOnce();
    owner.device.dispose();
  });

  it("does not repeat an ambiguous injected device destroy; confirmed loss permits invalidation", async () => {
    const f = await fixture(false);
    const failure = new Error("device destroy may already have happened");
    let callsWithSideEffects = 0;
    f.native.destroy.mockImplementationOnce(() => { callsWithSideEffects += 1; throw failure; });
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    expect(causes(capture(() => f.device.dispose()))).toContain(failure);
    expect(callsWithSideEffects).toBe(1);
    expect(f.native.destroy).toHaveBeenCalledOnce();
    expect(f.device[resourceDisposalPending]).toBe(true);
    f.lose({ reason: "destroyed", message: "confirmed" });
    await flush();
    expect(f.native.destroy).toHaveBeenCalledOnce();
    expect(f.device[resourceDisposalPending]).toBe(false);
  });
});
