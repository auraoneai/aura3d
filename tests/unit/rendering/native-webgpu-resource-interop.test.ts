import { describe, expect, it, vi } from "vitest";
import { WebGPUResourceInterop, type WebGPUInteropQueue } from "../../../packages/rendering/src/webgpu/ResourceInterop";

// These are queue-shaped test doubles only; they do not execute GPU work.
function deferredFence() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolveFence, rejectFence) => {
    resolve = resolveFence;
    reject = rejectFence;
  });
  return { promise, resolve, reject };
}

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

describe("WebGPU resource interop leases", () => {
  it("validates its generation and accesses before submitting, and counts only successful submissions", () => {
    const queueFailure = new Error("mock submission failed");
    const submit = vi.fn().mockImplementationOnce(() => { throw queueFailure; }).mockImplementation(() => {});
    const queue = { submit };
    expect(() => new WebGPUResourceInterop(queue, 0)).toThrow("WEBGPU_INTEROP_INVALID_GENERATION");
    expect(() => new WebGPUResourceInterop(queue, 1.5)).toThrow("WEBGPU_INTEROP_INVALID_GENERATION");
    const owner = new WebGPUResourceInterop(queue, 1);
    const other = new WebGPUResourceInterop(queue, 2);
    const native = { destroy: vi.fn() };
    const foreign = { destroy: vi.fn() };
    owner.register(native, () => native.destroy());
    other.register(foreign, () => foreign.destroy());
    expect(() => owner.submit([], [{ resource: native, mode: "invalid" as "read" }])).toThrow("WEBGPU_INTEROP_INVALID_ACCESS");
    expect(() => owner.submit([], [{ resource: foreign, mode: "read" }])).toThrow("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    expect(submit).not.toHaveBeenCalled();
    expect(() => owner.submit(["failed"], [{ resource: native, mode: "readwrite" }])).toThrow(queueFailure);
    expect(owner.submissionSerial).toBe(0);
    expect(owner.submit(["ok"], [{ resource: native, mode: "readwrite" }])).toBe(1);
    owner.invalidate();
    other.invalidate();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(foreign.destroy).toHaveBeenCalledOnce();
  });

  it("orders submissions, blocks foreign and retired leases, and waits for a fence", async () => {
    const fence = deferredFence();
    const submit = vi.fn();
    const onSubmittedWorkDone = vi.fn(() => fence.promise);
    const native = { destroy: vi.fn() };
    const owner = new WebGPUResourceInterop({ submit, onSubmittedWorkDone }, 1);
    const other = new WebGPUResourceInterop({ submit: vi.fn() }, 2);

    expect(owner.register(native, () => native.destroy())).toBe(native);
    expect(() => other.register(native, () => native.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(() => other.assertUsable(native)).toThrow("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    expect(owner.submit(["compute"], [{ resource: native, mode: "write" }])).toBe(1);
    expect(owner.submit(["render"], [{ resource: native, mode: "read" }])).toBe(2);
    const retirement = owner.retire(native);
    expect(owner.retire(native)).toBe(retirement);
    expect(() => owner.submit([], [{ resource: native, mode: "read" }])).toThrow("WEBGPU_INTEROP_RETIRED_RESOURCE");
    expect(owner.submissionSerial).toBe(2);
    expect(submit.mock.calls).toEqual([[["compute"]], [["render"]]]);
    expect(onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(native.destroy).not.toHaveBeenCalled();

    fence.resolve();
    await retirement;
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(0);
    expect(owner.owns(native)).toBe(false);
    expect(() => owner.retire(native)).toThrow("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    expect(() => other.register(native, () => native.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_DESTROYED");
    await owner.dispose();
    other.invalidate();
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("does not overwrite a foreign lease or register after invalidation through a reentrant options getter", () => {
    const owner = new WebGPUResourceInterop({ submit() {} }, 1);
    const other = new WebGPUResourceInterop({ submit() {} }, 2);
    const native = { destroy: vi.fn() };
    let reads = 0;
    const options = {
      get retryDestroy() {
        reads += 1;
        other.register(native, () => native.destroy());
        return () => native.destroy();
      }
    };
    expect(() => owner.register(native, () => native.destroy(), options)).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(reads).toBe(1);
    expect(owner.liveResources).toBe(0);
    expect(other.owns(native)).toBe(true);
    other.invalidate();
    expect(native.destroy).toHaveBeenCalledOnce();

    const spare = { destroy: vi.fn() };
    const newOwner = new WebGPUResourceInterop({ submit() {} }, 3);
    expect(() => owner.register(spare, () => spare.destroy(), {
      get retryDestroy() { owner.invalidate(); return () => spare.destroy(); }
    })).toThrow("WEBGPU_INTEROP_DISPOSED");
    expect(owner.owns(spare)).toBe(false);
    newOwner.register(spare, () => spare.destroy());
    newOwner.invalidate();
    expect(spare.destroy).toHaveBeenCalledOnce();
  });

  it("keeps disposal pending until all fences settle, even when called repeatedly", async () => {
    const fence = deferredFence();
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    const a = { destroy: vi.fn() }, b = { destroy: vi.fn() };
    owner.register(a, () => a.destroy());
    owner.register(b, () => b.destroy());
    const disposal = owner.dispose();
    expect(owner.dispose()).toBe(disposal);
    expect(owner.disposed).toBe(true);
    expect(() => owner.submit([])).toThrow("WEBGPU_INTEROP_DISPOSED");
    expect(() => owner.register({}, () => {})).toThrow("WEBGPU_INTEROP_DISPOSED");
    let settled = false;
    void disposal.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(a.destroy).not.toHaveBeenCalled();
    expect(b.destroy).not.toHaveBeenCalled();

    fence.resolve();
    await disposal;
    expect(a.destroy).toHaveBeenCalledOnce();
    expect(b.destroy).toHaveBeenCalledOnce();
    await owner.dispose();
    owner.invalidate();
    expect(a.destroy).toHaveBeenCalledOnce();
    expect(b.destroy).toHaveBeenCalledOnce();
  });

  it.each(["absent", "rejected", "throws"] as const)(
    "retains a lease after an %s fence until explicit invalidation",
    async mode => {
      const fenceFailure = new Error("fence unavailable");
      const queue: WebGPUInteropQueue = {
        submit() {},
        ...(mode === "rejected" ? { onSubmittedWorkDone: () => Promise.reject(fenceFailure) } : {}),
        ...(mode === "throws" ? { onSubmittedWorkDone: () => { throw fenceFailure; } } : {})
      };
      const owner = new WebGPUResourceInterop(queue, 1);
      const native = { destroy: vi.fn() };
      owner.register(native, () => native.destroy());
      const retirement = owner.retire(native);
      let settled = false;
      void retirement.then(() => { settled = true; }, () => { settled = true; });
      await Promise.resolve();
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(owner.owns(native)).toBe(true);
      expect(native.destroy).not.toHaveBeenCalled();
      await expect(owner.wait()).rejects.toThrow(mode === "absent" ? "WEBGPU_INTEROP_FENCE_UNAVAILABLE" : "fence unavailable");

      owner.invalidate();
      await retirement;
      expect(native.destroy).toHaveBeenCalledOnce();
      expect(owner.liveResources).toBe(0);
      await expect(owner.wait()).rejects.toThrow("WEBGPU_INTEROP_DISPOSED");
    }
  );

  it("rejects asynchronous destruction failures and never silently retries unsafe cleanup", async () => {
    const fence = deferredFence();
    const failure = new Error("mock native destroy failed");
    const native = { destroy: vi.fn(() => { throw failure; }) };
    const finalize = vi.fn();
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    const other = new WebGPUResourceInterop({ submit() {} }, 2);
    const unrelated = { destroy: vi.fn() };
    owner.register(native, () => { try { native.destroy(); } finally { finalize(); } });
    other.register(unrelated, () => unrelated.destroy());

    const retirement = owner.retire(native);
    fence.resolve();
    await expect(retirement).rejects.toBe(failure);
    expect(owner.owns(native)).toBe(true);
    expect(owner.liveResources).toBe(1);
    expect(() => owner.assertUsable(native)).toThrow("WEBGPU_INTEROP_RETIRED_RESOURCE");
    expect(() => other.register(native, () => native.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(owner.retire(native)).toBe(retirement);
    await expect(owner.dispose()).rejects.toBe(failure);
    const invalidation = capture(() => owner.invalidate());
    expect(invalidation).toBeInstanceOf(AggregateError);
    expect((invalidation as AggregateError).errors).toEqual([failure]);
    await expect(owner.dispose()).rejects.toBe(failure);
    other.invalidate();
    expect(unrelated.destroy).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
    expect(owner.owns(native)).toBe(true);
  });

  it("retries a specifically supplied safe callback after a confirmed fence", async () => {
    const fence = deferredFence();
    const failure = new Error("first mock destroy failed");
    const native = { destroy: vi.fn().mockImplementationOnce(() => { throw failure; }).mockImplementation(() => {}) };
    const finalize = vi.fn();
    const retryDestroy = vi.fn(() => native.destroy());
    const onSubmittedWorkDone = vi.fn(() => fence.promise);
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone }, 1);
    owner.register(native, () => { try { native.destroy(); } finally { finalize(); } }, { retryDestroy });

    const first = owner.retire(native);
    fence.resolve();
    await expect(first).rejects.toBe(failure);
    const retry = owner.retire(native);
    expect(retry).not.toBe(first);
    await retry;
    expect(onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledTimes(2);
    expect(retryDestroy).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
    await expect(first).rejects.toBe(failure);
    expect(owner.liveResources).toBe(0);
    expect(() => owner.retire(native)).toThrow("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    expect(() => owner.register(native, () => native.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_DESTROYED");
    owner.invalidate();
    await expect(owner.dispose()).resolves.toBeUndefined();
    expect(native.destroy).toHaveBeenCalledTimes(2);
  });

  it("attempts every loss cleanup, aggregates failures, and retries only incomplete leases", async () => {
    const firstFailure = new Error("first resource failed");
    const secondFailure = new Error("second resource failed");
    const retryFailure = new Error("second retry failed");
    const a = { destroy: vi.fn().mockImplementationOnce(() => { throw firstFailure; }).mockImplementation(() => {}) };
    const b = { destroy: vi.fn().mockImplementationOnce(() => { throw secondFailure; })
      .mockImplementationOnce(() => { throw retryFailure; }).mockImplementation(() => {}) };
    const healthy = { destroy: vi.fn() };
    const owner = new WebGPUResourceInterop({ submit() {} }, 1);
    const other = new WebGPUResourceInterop({ submit() {} }, 2);
    owner.register(a, () => a.destroy(), { retryDestroy: () => a.destroy() });
    owner.register(healthy, () => healthy.destroy());
    owner.register(b, () => b.destroy(), { retryDestroy: () => b.destroy() });
    const pending = owner.retire(a);

    const first = capture(() => owner.invalidate());
    expect(first).toBeInstanceOf(AggregateError);
    expect((first as AggregateError).errors).toEqual([firstFailure, secondFailure]);
    await expect(pending).rejects.toBe(firstFailure);
    expect(healthy.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(2);
    expect(() => other.register(a, () => a.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");
    expect(() => other.register(b, () => b.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_OWNED");

    const second = capture(() => owner.invalidate());
    expect(second).toBeInstanceOf(AggregateError);
    expect((second as AggregateError).errors).toEqual([retryFailure]);
    expect(a.destroy).toHaveBeenCalledTimes(2);
    expect(b.destroy).toHaveBeenCalledTimes(2);
    expect(healthy.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(1);

    owner.invalidate();
    await owner.dispose();
    expect(a.destroy).toHaveBeenCalledTimes(2);
    expect(b.destroy).toHaveBeenCalledTimes(3);
    expect(healthy.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(0);
    expect(() => other.register(a, () => a.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_DESTROYED");
    other.invalidate();
  });

  it("reports disposal failure, retries after loss, and ignores a stale fence", async () => {
    const fence = deferredFence();
    const failure = new Error("mock destruction failed on loss");
    const native = { destroy: vi.fn().mockImplementationOnce(() => { throw failure; }).mockImplementation(() => {}) };
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    owner.register(native, () => native.destroy(), { retryDestroy: () => native.destroy() });
    const disposal = owner.dispose();
    const invalidation = capture(() => owner.invalidate());
    expect(invalidation).toBeInstanceOf(AggregateError);
    expect((invalidation as AggregateError).errors).toEqual([failure]);
    await expect(disposal).rejects.toBe(failure);
    expect(owner.owns(native)).toBe(true);

    fence.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(native.destroy).toHaveBeenCalledOnce();
    const retry = owner.dispose();
    expect(retry).not.toBe(disposal);
    await retry;
    expect(native.destroy).toHaveBeenCalledTimes(2);
    expect(owner.liveResources).toBe(0);
    owner.invalidate();
    await owner.dispose();
    expect(native.destroy).toHaveBeenCalledTimes(2);
  });

  it("retries a failed disposal after a fence without asking for another fence", async () => {
    const fence = deferredFence();
    const failure = new Error("mock destruction failed");
    const native = { destroy: vi.fn().mockImplementationOnce(() => { throw failure; }).mockImplementation(() => {}) };
    const onSubmittedWorkDone = vi.fn(() => fence.promise);
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone }, 1);
    owner.register(native, () => native.destroy(), { retryDestroy: () => native.destroy() });
    const first = owner.dispose();
    fence.resolve();
    await expect(first).rejects.toBe(failure);
    await expect(owner.dispose()).resolves.toBeUndefined();
    expect(onSubmittedWorkDone).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledTimes(2);
    expect(owner.liveResources).toBe(0);
  });

  it("preserves failure for fire-and-forget retirement and lets disposal observe it", async () => {
    const fence = deferredFence();
    const failure = new Error("unobserved mock destroy failed");
    const native = { destroy: vi.fn(() => { throw failure; }) };
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    owner.register(native, () => native.destroy());
    void owner.retire(native);
    fence.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await expect(owner.dispose()).rejects.toBe(failure);
    expect(owner.owns(native)).toBe(true);
    expect(native.destroy).toHaveBeenCalledOnce();
  });

  it("preserves a loss failure even if it occurred before anyone requested retirement", async () => {
    const native = { destroy: vi.fn(() => { throw undefined; }) };
    const owner = new WebGPUResourceInterop({ submit() {} }, 1);
    owner.register(native, () => native.destroy());
    const invalidation = capture(() => owner.invalidate());
    expect(invalidation).toBeInstanceOf(AggregateError);
    expect((invalidation as AggregateError).errors).toEqual([undefined]);
    const retirement = owner.retire(native);
    await expect(retirement).rejects.toBeUndefined();
    expect(owner.retire(native)).toBe(retirement);
    await expect(owner.dispose()).rejects.toBeUndefined();
    const repeated = capture(() => owner.invalidate());
    expect(repeated).toBeInstanceOf(AggregateError);
    expect((repeated as AggregateError).errors).toEqual([undefined]);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(1);
  });

  it("does not destroy twice when invalidation wins a fence race", async () => {
    const fence = deferredFence();
    const native = { destroy: vi.fn() };
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    const other = new WebGPUResourceInterop({ submit() {} }, 2);
    owner.register(native, () => native.destroy());
    const retirement = owner.retire(native);
    owner.invalidate();
    await retirement;
    expect(() => other.register(native, () => native.destroy())).toThrow("WEBGPU_INTEROP_RESOURCE_DESTROYED");
    fence.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(other.liveResources).toBe(0);
    other.invalidate();
  });

  it("joins a reentrant retirement to the in-progress destruction", async () => {
    const owner = new WebGPUResourceInterop({ submit() {} }, 1);
    const native = { destroy: vi.fn() };
    let first!: Promise<void>;
    let second!: Promise<void>;
    native.destroy.mockImplementation(() => {
      first = owner.retire(native);
      second = owner.retire(native);
    });
    owner.register(native, () => native.destroy());
    owner.invalidate();
    expect(first).toBe(second);
    await first;
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(0);
  });

  it("joins reentrant disposal to the pending disposal without duplicating cleanup", async () => {
    const fence = deferredFence();
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    const native = { destroy: vi.fn() };
    const peer = { destroy: vi.fn() };
    let nested!: Promise<void>;
    native.destroy.mockImplementation(() => { nested = owner.dispose(); });
    owner.register(native, () => native.destroy());
    owner.register(peer, () => peer.destroy());
    const disposal = owner.dispose();
    fence.resolve();
    await disposal;
    expect(nested).toBe(disposal);
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(peer.destroy).toHaveBeenCalledOnce();
    expect(owner.liveResources).toBe(0);
  });

  it("does not claim a reentrant invalidation completed while a destructor is running", async () => {
    const fence = deferredFence(), peerFence = deferredFence();
    const onSubmittedWorkDone = vi.fn().mockReturnValueOnce(fence.promise).mockReturnValueOnce(peerFence.promise);
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone }, 1);
    const native = { destroy: vi.fn() };
    const peer = { destroy: vi.fn() };
    let nested: unknown;
    native.destroy.mockImplementation(() => { nested = capture(() => owner.invalidate()); });
    owner.register(native, () => native.destroy());
    owner.register(peer, () => peer.destroy());
    const retirement = owner.retire(native);
    fence.resolve();
    await retirement;
    expect(nested).toBeInstanceOf(Error);
    expect((nested as Error).message).toBe("WEBGPU_INTEROP_DESTRUCTION_IN_PROGRESS");
    expect(owner.disposed).toBe(true);
    expect(owner.owns(peer)).toBe(true);
    expect(peer.destroy).not.toHaveBeenCalled();
    const disposal = owner.dispose();
    expect(peer.destroy).not.toHaveBeenCalled();
    peerFence.resolve();
    await disposal;
    expect(peer.destroy).toHaveBeenCalledOnce();
    expect(native.destroy).toHaveBeenCalledOnce();
  });
});
