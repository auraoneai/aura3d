import { describe, expect, it, vi } from "vitest";
import { ResourceLifecycle, resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { WebGPUResourceInterop, type WebGPUInteropQueue } from "../../../packages/rendering/src/webgpu/ResourceInterop";

// These queue-shaped recorders exercise lifecycle ownership, not a GPU driver.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
}

function capture(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

function leaves(error: unknown): unknown[] {
  return error instanceof AggregateError ? error.errors.flatMap(leaves) : [error];
}

async function fixture() {
  const fence = deferred<void>();
  const lost = deferred<{ reason: string; message: string }>();
  const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const textures: { destroy: ReturnType<typeof vi.fn>; createView(): object }[] = [];
  const queue: WebGPUInteropQueue & { writeBuffer(): void } = {
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    onSubmittedWorkDone: vi.fn(() => fence.promise)
  };
  const native = {
    lost: lost.promise,
    queue,
    createBuffer: vi.fn(() => {
      const buffer = { destroy: vi.fn() };
      buffers.push(buffer);
      return buffer;
    }),
    createTexture: vi.fn(() => {
      const texture = { destroy: vi.fn(), createView: () => ({}) };
      textures.push(texture);
      return texture;
    }),
    destroy: vi.fn()
  };
  const injected = native as unknown as WebGPUDeviceLike;
  const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => injected }, device: injected });
  return { device, native, queue, buffers, textures, fence, lost };
}

describe("WebGPU failed-fence lifecycle visibility", () => {
  it("retains an owner and its original error after a rejected fence until confirmed loss", async () => {
    const f = await fixture();
    const failure = new Error("actual fence rejection");
    const buffer = f.device.createBuffer("vertex", 4);
    buffer.dispose();
    const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
    let settled = false;
    void retirement.then(() => { settled = true; }, () => { settled = true; });
    f.fence.reject(failure);
    await flush();

    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    const error = capture(() => lifecycle.dispose());
    expect(lifecycle.disposed).toBe(false);
    expect(lifecycle.leakCount()).toBe(1);
    expect(leaves(error)).toContain(failure);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.device.resourceInterop.hasUnfencedRetirements).toBe(true);
    expect(f.device.resourceInterop.retirementFenceErrors).toEqual([failure]);
    expect(f.device.getDiagnostics().lastError).toContain(failure.message);
    expect(settled).toBe(false);
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(leaves(capture(() => lifecycle.dispose()))).toContain(failure);

    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await retirement;
    await flush();
    expect(f.device.resourceInterop.hasUnfencedRetirements).toBe(false);
    expect(f.device.resourceInterop.retirementFenceErrors).toEqual([]);
    expect(f.device[resourceDisposalPending]).toBe(false);
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(f.native.destroy).not.toHaveBeenCalled();
  });

  it.each(["method", "getter", "then getter"] as const)(
    "exposes a synchronously throwing fence %s without destroying queued resources",
    async mode => {
      const f = await fixture();
      const failure = new Error(`fence ${mode} failed`);
      if (mode === "method") {
        f.queue.onSubmittedWorkDone = () => { throw failure; };
      } else if (mode === "getter") {
        Object.defineProperty(f.queue, "onSubmittedWorkDone", { configurable: true, get() { throw failure; } });
      } else {
        const broken = Object.defineProperty({}, "then", { get() { throw failure; } }) as Promise<void>;
        f.queue.onSubmittedWorkDone = () => broken;
      }
      const buffer = f.device.createBuffer("vertex", 4);
      expect(() => buffer.dispose()).not.toThrow();
      const laterFence = vi.fn(() => Promise.resolve());
      if (mode === "getter") {
        Object.defineProperty(f.queue, "onSubmittedWorkDone", { configurable: true, value: laterFence });
      }
      const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(f.device);
      expect(leaves(capture(() => lifecycle.dispose()))).toContain(failure);
      expect(f.device[resourceDisposalPending]).toBe(true);
      expect(f.device.resourceInterop.retirementFenceErrors).toEqual([failure]);
      expect(laterFence).not.toHaveBeenCalled();
      expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
      expect(leaves(capture(() => lifecycle.dispose()))).toContain(failure);

      f.lost.resolve({ reason: "destroyed", message: "confirmed" });
      await retirement;
      await flush();
      expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
      expect(f.device.resourceInterop.retirementFenceErrors).toEqual([]);
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
    }
  );

  it("retains disposed buffer and target owners after their shared fence fails", async () => {
    const f = await fixture();
    const failure = new Error("shared fence failed");
    const buffer = f.device.createBuffer("vertex", 4);
    const target = f.device.createRenderTarget({ width: 1, height: 1, depth: false });
    buffer.dispose();
    target.dispose();
    f.fence.reject(failure);
    await flush();
    const bufferOwner = new ResourceLifecycle(), targetOwner = new ResourceLifecycle();
    bufferOwner.track(buffer);
    targetOwner.track(target);
    expect(leaves(capture(() => bufferOwner.dispose()))).toContain(failure);
    expect(leaves(capture(() => targetOwner.dispose()))).toContain(failure);
    expect(bufferOwner.leakCount()).toBe(1);
    expect(targetOwner.leakCount()).toBe(1);
    expect((buffer as typeof buffer & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
    expect((target as typeof target & { readonly [resourceDisposalPending]: boolean })[resourceDisposalPending]).toBe(true);
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(f.textures[0]!.destroy).not.toHaveBeenCalled();

    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await flush();
    bufferOwner.dispose();
    targetOwner.dispose();
    expect(bufferOwner.disposed).toBe(true);
    expect(targetOwner.disposed).toBe(true);
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
    expect(f.textures[0]!.destroy).toHaveBeenCalledOnce();
    f.device.dispose();
  });

  it.each(["missing", "non-promise"] as const)(
    "retains a %s fence lease even if the queue subsequently gains a fence",
    async mode => {
      const f = await fixture();
      f.queue.onSubmittedWorkDone = mode === "missing" ? undefined : () => undefined as unknown as Promise<void>;
      const buffer = f.device.createBuffer("vertex", 4);
      buffer.dispose();
      const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
      const laterFence = vi.fn(() => Promise.resolve());
      f.queue.onSubmittedWorkDone = laterFence;
      const lifecycle = new ResourceLifecycle();
      lifecycle.track(f.device);
      expect(capture(() => lifecycle.dispose())).toBeInstanceOf(AggregateError);
      expect(lifecycle.leakCount()).toBe(1);
      expect(f.device[resourceDisposalPending]).toBe(true);
      expect(f.device.resourceInterop.hasUnfencedRetirements).toBe(true);
      expect(f.device.resourceInterop.retirementFenceErrors).toEqual([]);
      expect(laterFence).not.toHaveBeenCalled();
      expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();

      f.lost.resolve({ reason: "destroyed", message: "confirmed" });
      await retirement;
      await flush();
      lifecycle.dispose();
      expect(lifecycle.disposed).toBe(true);
      expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
      expect(laterFence).not.toHaveBeenCalled();
    }
  );

  it.each(["rejection", "throw"] as const)("preserves an undefined fence %s as the actual error", async mode => {
    const f = await fixture();
    f.queue.onSubmittedWorkDone = mode === "rejection"
      ? () => Promise.reject(undefined)
      : () => { throw undefined; };
    const buffer = f.device.createBuffer("vertex", 4);
    buffer.dispose();
    const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
    await flush();
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    const result = capture(() => lifecycle.dispose());
    expect(result).toBeInstanceOf(AggregateError);
    expect(leaves(result)).toContain(undefined);
    expect(f.device.resourceInterop.retirementFenceErrors).toEqual([undefined]);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await retirement;
    await flush();
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("still transfers a genuinely waiting fence to interop and retires once after it passes", async () => {
    const f = await fixture();
    const buffer = f.device.createBuffer("vertex", 4);
    buffer.dispose();
    const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(f.device[resourceDisposalPending]).toBe(false);
    expect(f.device.resourceInterop.hasUnfencedRetirements).toBe(false);
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    f.fence.resolve();
    await retirement;
    await flush();
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
    lifecycle.dispose();
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("exposes a later rejection on the device even if an earlier waiting-fence transfer already completed", async () => {
    const f = await fixture();
    const failure = new Error("fence failed after transfer");
    const buffer = f.device.createBuffer("vertex", 4);
    buffer.dispose();
    const retirement = f.device.resourceInterop.retire(f.buffers[0]!);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    f.fence.reject(failure);
    await flush();
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.device.resourceInterop.retirementFenceErrors).toEqual([failure]);
    // A synchronous owner that already transferred its lease cannot be
    // re-enrolled retroactively by this interop receipt.
    expect(lifecycle.disposed).toBe(true);
    expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await retirement;
    await flush();
    expect(f.device[resourceDisposalPending]).toBe(false);
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("reports independent failed fences without repeating successful sibling cleanup", async () => {
    const f = await fixture();
    const first = deferred<void>(), passed = deferred<void>(), last = deferred<void>();
    const firstFailure = new Error("first fence failed"), lastFailure = new Error("last fence failed");
    const request = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(passed.promise).mockReturnValueOnce(last.promise);
    f.queue.onSubmittedWorkDone = request;
    const buffers = [f.device.createBuffer("vertex", 4), f.device.createBuffer("vertex", 4), f.device.createBuffer("vertex", 4)];
    for (const buffer of buffers) buffer.dispose();
    const retirements = f.buffers.map(buffer => f.device.resourceInterop.retire(buffer));
    first.reject(firstFailure);
    passed.resolve();
    last.reject(lastFailure);
    await flush();
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    expect(f.buffers[1]!.destroy).toHaveBeenCalledOnce();
    expect(f.buffers[2]!.destroy).not.toHaveBeenCalled();
    expect(f.device.resourceInterop.retirementFenceErrors).toEqual([firstFailure, lastFailure]);

    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    const failure = leaves(capture(() => lifecycle.dispose()));
    expect(failure).toContain(firstFailure);
    expect(failure).toContain(lastFailure);
    expect(leaves(capture(() => lifecycle.dispose()))).toEqual(expect.arrayContaining([firstFailure, lastFailure]));
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
    expect(f.buffers[1]!.destroy).toHaveBeenCalledOnce();

    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await Promise.all(retirements);
    await flush();
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    for (const buffer of f.buffers) expect(buffer.destroy).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("publishes fence acquisition during a reentrant getter and joins the same retirement", async () => {
    const fence = deferred<void>();
    const resource = { destroy: vi.fn() };
    let owner!: WebGPUResourceInterop;
    let nested!: Promise<void>;
    let blockedDuringGetter = false;
    const queue = {
      submit() {},
      get onSubmittedWorkDone() {
        blockedDuringGetter = owner.hasUnfencedRetirements;
        nested = owner.retire(resource);
        return () => fence.promise;
      }
    };
    owner = new WebGPUResourceInterop(queue, 1);
    owner.register(resource, () => resource.destroy());
    const retirement = owner.retire(resource);
    expect(nested).toBe(retirement);
    expect(blockedDuringGetter).toBe(true);
    expect(owner.hasUnfencedRetirements).toBe(false);
    fence.resolve();
    await retirement;
    expect(resource.destroy).toHaveBeenCalledOnce();
  });

  it("retains a lifecycle when a fence getter reenters device disposal before failing", async () => {
    const f = await fixture();
    const failure = new Error("reentrant fence failed");
    const buffer = f.device.createBuffer("vertex", 4);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    let nested: unknown;
    let entered = false;
    const request = vi.fn(() => { throw failure; });
    Object.defineProperty(f.queue, "onSubmittedWorkDone", {
      configurable: true,
      get() {
        if (!entered) {
          entered = true;
          nested = capture(() => lifecycle.dispose());
        }
        return request;
      }
    });
    buffer.dispose();
    expect(nested).toBeInstanceOf(AggregateError);
    expect(lifecycle.leakCount()).toBe(1);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(leaves(capture(() => lifecycle.dispose()))).toContain(failure);
    expect(request).toHaveBeenCalledOnce();
    expect(f.buffers[0]!.destroy).not.toHaveBeenCalled();
    f.lost.resolve({ reason: "destroyed", message: "confirmed" });
    await flush();
    lifecycle.dispose();
    expect(lifecycle.disposed).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(f.buffers[0]!.destroy).toHaveBeenCalledOnce();
  });

  it("does not request a fence after a getter reentrantly invalidates the lease", async () => {
    const fence = deferred<void>();
    const resource = { destroy: vi.fn() };
    let owner!: WebGPUResourceInterop;
    let getterReads = 0;
    const request = vi.fn(() => fence.promise);
    const queue = {
      submit() {},
      get onSubmittedWorkDone() {
        getterReads += 1;
        owner.invalidate();
        return request;
      }
    };
    owner = new WebGPUResourceInterop(queue, 1);
    owner.register(resource, () => resource.destroy());
    const retirement = owner.retire(resource);
    await retirement;
    expect(owner.hasUnfencedRetirements).toBe(false);
    expect(owner.retirementFenceErrors).toEqual([]);
    expect(resource.destroy).toHaveBeenCalledOnce();
    expect(getterReads).toBe(1);
    expect(request).not.toHaveBeenCalled();
  });

  it("observes a stale rejected fence returned after reentrant invalidation", async () => {
    const fence = deferred<void>();
    const resource = { destroy: vi.fn() };
    const unhandled = vi.fn();
    let owner!: WebGPUResourceInterop;
    const request = vi.fn(() => { owner.invalidate(); return fence.promise; });
    owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: request }, 1);
    owner.register(resource, () => resource.destroy());
    process.on("unhandledRejection", unhandled);
    try {
      const retirement = owner.retire(resource);
      await retirement;
      fence.reject(new Error("stale fence rejected"));
      await flush();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      expect(owner.hasUnfencedRetirements).toBe(false);
      expect(owner.retirementFenceErrors).toEqual([]);
      expect(resource.destroy).toHaveBeenCalledOnce();
      expect(request).toHaveBeenCalledOnce();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("does not resurrect fence failures from callbacks after confirmed invalidation", async () => {
    const fence = deferred<void>();
    const failure = new Error("late fence rejection");
    const resource = { destroy: vi.fn() };
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
    owner.register(resource, () => resource.destroy());
    const retirement = owner.retire(resource);
    owner.invalidate();
    await retirement;
    fence.reject(failure);
    await flush();
    expect(owner.hasUnfencedRetirements).toBe(false);
    expect(owner.retirementFenceErrors).toEqual([]);
    expect(owner.liveResources).toBe(0);
    expect(resource.destroy).toHaveBeenCalledOnce();
  });

  it.each(["resolve", "reject"] as const)(
    "ignores an older %s fence after failed invalidation and retries only idempotent bookkeeping",
    async outcome => {
      const fence = deferred<void>();
      const failure = new Error("bookkeeping failed after deletion");
      const stale = new Error("stale fence rejected");
      const resource = { destroy: vi.fn() };
      const entries = new Set([resource]);
      const retry = vi.fn(() => { entries.delete(resource); });
      const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => fence.promise }, 1);
      owner.register(resource, () => {
        resource.destroy();
        entries.delete(resource);
        throw failure;
      }, { retryDestroy: retry });
      const retirement = owner.retire(resource);
      expect(leaves(capture(() => owner.invalidate()))).toContain(failure);
      await expect(retirement).rejects.toBe(failure);
      if (outcome === "resolve") fence.resolve();
      else fence.reject(stale);
      await flush();
      expect(owner.retirementFenceErrors).toEqual([]);
      expect(owner.owns(resource)).toBe(true);
      expect(resource.destroy).toHaveBeenCalledOnce();
      await owner.retire(resource);
      expect(retry).toHaveBeenCalledOnce();
      expect(entries.size).toBe(0);
      expect(owner.liveResources).toBe(0);
      expect(resource.destroy).toHaveBeenCalledOnce();
    }
  );

  it.each(["before", "after"] as const)(
    "clears an older failed sweep when a safe retry runs %s its rejection observer and another fence is waiting",
    async timing => {
      const f = await fixture();
      const firstFence = deferred<void>(), otherFence = deferred<void>();
      const failure = new Error("first bookkeeping failed");
      const first = { destroy: vi.fn() }, other = { destroy: vi.fn() };
      const entries = new Set([first]);
      const request = vi.fn().mockReturnValueOnce(firstFence.promise).mockReturnValueOnce(otherFence.promise);
      f.queue.onSubmittedWorkDone = request;
      f.device.resourceInterop.register(first, () => {
        first.destroy();
        entries.delete(first);
        throw failure;
      }, { retryDestroy: () => { entries.delete(first); } });
      f.device.resourceInterop.register(other, () => other.destroy());
      f.device.dispose();
      firstFence.resolve();
      await Promise.resolve();
      expect(f.device.resourceInterop.retirementDestructionErrors).toEqual([failure]);
      if (timing === "after") await flush();
      await f.device.resourceInterop.retire(first);
      await flush();
      expect(f.device.resourceInterop.owns(first)).toBe(false);
      expect(f.device.resourceInterop.owns(other)).toBe(true);
      expect(f.device[resourceDisposalPending]).toBe(false);
      expect(() => f.device.dispose()).not.toThrow();
      expect(first.destroy).toHaveBeenCalledOnce();
      expect(other.destroy).not.toHaveBeenCalled();
      otherFence.resolve();
      await flush();
      expect(other.destroy).toHaveBeenCalledOnce();
      expect(first.destroy).toHaveBeenCalledOnce();
      expect(f.device.resourceInterop.liveResources).toBe(0);
    }
  );

  it("retains an unexpected synchronous sweep failure until an explicit sweep retry", async () => {
    const f = await fixture();
    const failure = new Error("interop sweep failed before retirement");
    const resource = { destroy: vi.fn() };
    f.device.resourceInterop.register(resource, () => resource.destroy());
    const retire = f.device.resourceInterop.retire.bind(f.device.resourceInterop);
    const spy = vi.spyOn(f.device.resourceInterop, "retire")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(retire);
    try {
      expect(leaves(capture(() => f.device.dispose()))).toContain(failure);
      expect(f.device.resourceInterop.retirementDestructionErrors).toEqual([failure]);
      expect(f.device[resourceDisposalPending]).toBe(true);
      await flush();
      f.device.dispose();
      expect(f.device.resourceInterop.retirementDestructionErrors).toEqual([]);
      expect(f.device[resourceDisposalPending]).toBe(false);
      expect(resource.destroy).not.toHaveBeenCalled();
      f.fence.resolve();
      await flush();
      expect(resource.destroy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
    }
  });

  it("handles a synchronous nonconforming thenable only once and preserves its first failure", async () => {
    const failure = new Error("first thenable failure");
    const resource = { destroy: vi.fn() };
    const pending = {
      then(resolve: () => void, reject: (error: unknown) => void) {
        reject(failure);
        resolve();
        throw new Error("late thenable throw");
      }
    } as unknown as Promise<void>;
    const owner = new WebGPUResourceInterop({ submit() {}, onSubmittedWorkDone: () => pending }, 1);
    owner.register(resource, () => resource.destroy());
    const retirement = owner.retire(resource);
    expect(owner.hasUnfencedRetirements).toBe(true);
    expect(owner.retirementFenceErrors).toEqual([failure]);
    expect(owner.retire(resource)).toBe(retirement);
    expect(resource.destroy).not.toHaveBeenCalled();
    owner.invalidate();
    await retirement;
    expect(owner.retirementFenceErrors).toEqual([]);
    expect(resource.destroy).toHaveBeenCalledOnce();
  });

  it("retains a resource if an externally registered destruction already failed", async () => {
    const f = await fixture();
    const failure = new Error("external interop destruction failed");
    const resource = { destroy: vi.fn(() => { throw failure; }) };
    f.device.resourceInterop.register(resource, () => resource.destroy());
    const retirement = f.device.resourceInterop.retire(resource);
    f.fence.resolve();
    await expect(retirement).rejects.toBe(failure);
    const lifecycle = new ResourceLifecycle();
    lifecycle.track(f.device);
    const result = capture(() => lifecycle.dispose());
    expect(leaves(result)).toContain(failure);
    expect(lifecycle.disposed).toBe(false);
    expect(f.device[resourceDisposalPending]).toBe(true);
    expect(f.device.resourceInterop.owns(resource)).toBe(true);
    expect(resource.destroy).toHaveBeenCalledOnce();
    expect(leaves(capture(() => lifecycle.dispose()))).toContain(failure);
    expect(resource.destroy).toHaveBeenCalledOnce();
  });
});
