import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice, type RenderDevice, type RenderTarget, type RenderTargetDescriptor } from "../../../packages/rendering/src/RenderDevice";
import { resourceDisposalPending } from "../../../packages/rendering/src/ResourceLifecycle";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { renderTargetPoolSlot } from "../../../packages/rendering/src/contracts/device";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";
import { acquireTargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";

const desc = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;
const flagsOff = { values: {}, on: () => false };

function makeDevice(): RenderDevice {
  let id = 0;
  return {
    disposed: false,
    contextLost: false,
    createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
      return {
        id: ++id,
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label ?? "target",
        colorTexture: { format: descriptor.format ?? "rgba8" },
        sampleCount: descriptor.sampleCount ?? 1,
        disposed: false,
        dispose() { this.disposed = true; }
      } as unknown as RenderTarget;
    }
  } as unknown as RenderDevice;
}

function caughtError(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  return undefined;
}

describe("stub render-target retirement", () => {
  it("retains an explicit lease after a reentrant failed disposal, even if disposed was set", () => {
    const pool = renderTargetPoolSlot.stub(makeDevice());
    const lease = acquireTargetPoolLease(pool, desc);
    const target = lease.target;
    const original = target.dispose.bind(target);
    const failure = new Error("stub target failed");
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => {
        lease.release();
        pool.release(target);
        (target as { disposed: boolean }).disposed = true;
        throw failure;
      })
      .mockImplementation(original);

    expect(() => lease.release()).toThrow(failure);
    pool.release(target); // A target-only borrower cannot release an explicit lease.
    expect(dispose).toHaveBeenCalledTimes(1);
    lease.release();
    lease.release();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(target.disposed).toBe(true);
  });

  it("retains a legacy acquisition for a later release retry without recursive disposal", () => {
    const pool = renderTargetPoolSlot.stub(makeDevice());
    const target = pool.acquire(desc);
    const original = target.dispose.bind(target);
    const failure = new Error("stub legacy target failed");
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => {
        pool.release(target);
        throw failure;
      })
      .mockImplementation(original);

    expect(() => pool.release(target)).toThrow(failure);
    pool.release(target);
    pool.release(target);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(target.disposed).toBe(true);
  });

  it("does not release another stub pool's legacy or explicit acquisitions", () => {
    const first = renderTargetPoolSlot.stub(makeDevice());
    const peer = renderTargetPoolSlot.stub(makeDevice());
    const legacy = peer.acquire(desc);
    const explicit = acquireTargetPoolLease(peer, desc);

    first.release(legacy);
    first.release(explicit.target);
    expect(legacy.disposed).toBe(false);
    expect(explicit.target.disposed).toBe(false);
    peer.release(legacy);
    explicit.release();
    expect(legacy.disposed).toBe(true);
    expect(explicit.target.disposed).toBe(true);
  });

  it("rejects a factory reissuing an exposed target to protect stale releases", () => {
    const device = makeDevice();
    const pool = renderTargetPoolSlot.stub(device);
    const old = pool.acquire(desc);
    pool.release(old);
    (old as { disposed: boolean }).disposed = false;
    vi.spyOn(device, "createRenderTarget").mockReturnValue(old);

    expect(() => pool.acquire(desc)).toThrow(/new live render target/i);
    pool.release(old);
    expect(old.disposed).toBe(false);
  });

  it("lets a post owner retry only its failed backing lease", () => {
    const resources = new PostResources(makeDevice(), flagsOff);
    const failed = resources.acquireLease(desc);
    const sibling = resources.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("backing target failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");

    const error = caughtError(() => resources.dispose());
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    resources.dispose();
    failed.release();
    sibling.release();
    resources.dispose();
    expect(failedDispose).toHaveBeenCalledTimes(2);
    expect(failed.target.disposed).toBe(true);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
  });
});

describe("real render-target retirement", () => {
  it("quarantines a pending idle target on acquisition without reissuing or losing it", () => {
    const pool = new RenderTargetPool(makeDevice());
    const peer = new RenderTargetPool(makeDevice());
    const idle = pool.acquireLease(desc);
    const other = peer.acquireLease(desc);
    let pending = false;
    Object.defineProperty(idle.target, resourceDisposalPending, { configurable: true, get: () => pending });
    const dispose = vi.spyOn(idle.target, "dispose").mockImplementation(() => { pending = false; });
    idle.release();
    (idle.target as { disposed: boolean }).disposed = true;
    pending = true;

    const current = pool.acquireLease(desc);
    expect(current.target).not.toBe(idle.target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
    expect(dispose).not.toHaveBeenCalled();
    idle.release(); // The former borrower is stale; trim owns idle retirement.
    pool.trim(100);
    pool.trim(100);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(current.target.disposed).toBe(false);
    expect(other.target.disposed).toBe(false);
    current.release();
    other.release();
    pool.dispose();
    peer.dispose();
  });

  it("keeps an active pending target's lease retryable after statistics are read", () => {
    const pool = new RenderTargetPool(makeDevice());
    const lease = pool.acquireLease(desc);
    let pending = true;
    Object.defineProperty(lease.target, resourceDisposalPending, { configurable: true, get: () => pending });
    (lease.target as { disposed: boolean }).disposed = true;
    const dispose = vi.spyOn(lease.target, "dispose").mockImplementation(() => { pending = false; });

    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    expect(dispose).not.toHaveBeenCalled();
    lease.release();
    lease.release();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(pending).toBe(false);
    pool.dispose();
  });

  it("retains a target whose disposer returns before pending cleanup finishes", () => {
    const pool = new RenderTargetPool(makeDevice());
    const target = pool.acquire(desc);
    let pending = false;
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, get: () => pending });
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => { (target as { disposed: boolean }).disposed = true; pending = true; })
      .mockImplementation(() => { pending = false; });

    expect(() => pool.release(target)).toThrow(/disposal.*complete/i);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    pool.release(target);
    pool.release(target);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(pending).toBe(false);
    pool.dispose();
  });

  it("reports pending pool close to the device owner and retries without re-disposing siblings", () => {
    const device = new MockRenderDevice();
    const nativeDispose = vi.fn(() => { device.disposed = true; });
    device.dispose = nativeDispose;
    const pool = prd11RenderTargetPoolFor(device);
    const failed = pool.acquireLease(desc);
    const sibling = pool.acquireLease(desc);
    let pending = false;
    Object.defineProperty(failed.target, resourceDisposalPending, { configurable: true, get: () => pending });
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { (failed.target as { disposed: boolean }).disposed = true; pending = true; })
      .mockImplementation(() => { pending = false; });
    const siblingDispose = vi.spyOn(sibling.target, "dispose");
    try {
      const error = caughtError(() => device.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect(String((error as AggregateError).errors[0])).toMatch(/disposal.*complete/i);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(failedDispose).toHaveBeenCalledTimes(1);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
      device.dispose();
      device.dispose();
      expect(pending).toBe(false);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(failedDispose).toHaveBeenCalledTimes(2);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
    } finally {
      pending = false;
      failedDispose.mockRestore();
      siblingDispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it.each(["trim", "legacy release"] as const)("keeps a lane-owned pool retryable when device close reenters a pending %s", (operation) => {
    const device = new MockRenderDevice();
    const nativeDispose = vi.fn(() => { device.disposed = true; });
    device.dispose = nativeDispose;
    const pool = prd11RenderTargetPoolFor(device);
    let target: RenderTarget;
    if (operation === "trim") {
      const lease = pool.acquireLease(desc);
      target = lease.target;
      lease.release();
    } else {
      target = pool.acquire(desc);
    }
    let pending = false;
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, get: () => pending });
    const failure = new Error("outer target cleanup failed");
    let nestedFailure: unknown;
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => {
        (target as { disposed: boolean }).disposed = true;
        pending = true;
        nestedFailure = caughtError(() => device.dispose());
        throw failure;
      })
      .mockImplementation(() => { pending = false; });
    try {
      const error = caughtError(() => operation === "trim" ? pool.trim(0) : pool.release(target));
      if (operation === "trim") {
        expect(error).toBeInstanceOf(AggregateError);
        expect((error as AggregateError).errors).toEqual([failure]);
      } else {
        expect(error).toBe(failure);
      }
      expect(nestedFailure).toBeInstanceOf(AggregateError);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(pending).toBe(true);
      device.dispose();
      device.dispose();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(nativeDispose).toHaveBeenCalledTimes(1);
      expect(pending).toBe(false);
    } finally {
      pending = false;
      dispose.mockRestore();
      pool.dispose();
      device.dispose();
    }
  });

  it.each(["token", "legacy"] as const)("does not complete a reentrant %s release while its target is pending", (kind) => {
    const pool = new RenderTargetPool(makeDevice());
    const lease = kind === "token" ? pool.acquireLease(desc) : undefined;
    const target = lease?.target ?? pool.acquire(desc);
    const release = () => lease ? lease.release() : pool.release(target);
    let pending = false;
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, get: () => pending });
    const failure = new Error("outer target cleanup failed");
    let nestedFailure: unknown;
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => {
        (target as { disposed: boolean }).disposed = true;
        pending = true;
        nestedFailure = caughtError(release);
        throw failure;
      })
      .mockImplementation(() => { pending = false; });
    try {
      const error = caughtError(() => pool.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(nestedFailure).toEqual(expect.objectContaining({ message: expect.stringMatching(/disposal.*in progress/i) }));
      expect(dispose).toHaveBeenCalledTimes(1);
      release();
      release();
      expect(dispose).toHaveBeenCalledTimes(2);
      expect(pending).toBe(false);
    } finally {
      pending = false;
      dispose.mockRestore();
      pool.dispose();
    }
  });

  it("retains a post owner's backing lease when its disposal reenters target retirement", () => {
    const device = makeDevice();
    const pool = new RenderTargetPool(device);
    const getPool = vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flagsOff);
    const lease = resources.acquireLease(desc);
    let pending = false;
    Object.defineProperty(lease.target, resourceDisposalPending, { configurable: true, get: () => pending });
    const failure = new Error("outer target cleanup failed");
    let nestedFailure: unknown;
    const dispose = vi.spyOn(lease.target, "dispose")
      .mockImplementationOnce(() => {
        (lease.target as { disposed: boolean }).disposed = true;
        pending = true;
        nestedFailure = caughtError(() => resources.dispose());
        throw failure;
      })
      .mockImplementation(() => { pending = false; });
    try {
      const error = caughtError(() => pool.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(nestedFailure).toBeInstanceOf(AggregateError);
      expect(String((nestedFailure as AggregateError).errors[0])).toMatch(/disposal.*in progress/i);
      expect(dispose).toHaveBeenCalledTimes(1);
      resources.dispose();
      resources.dispose();
      pool.dispose();
      expect(pending).toBe(false);
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      pending = false;
      dispose.mockRestore();
      getPool.mockRestore();
      resources.dispose();
      pool.dispose();
    }
  });

  it("does not repeat a completed target cleanup that reported a later error", () => {
    const pool = new RenderTargetPool(makeDevice());
    const target = pool.acquire(desc);
    const failure = new Error("notification after cleanup");
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, get: () => false });
    const dispose = vi.spyOn(target, "dispose").mockImplementation(() => {
      (target as { disposed: boolean }).disposed = true;
      throw failure;
    });

    expect(() => pool.release(target)).toThrow(failure);
    pool.release(target);
    pool.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps the legacy retry when a target's optional completion signal is undefined", () => {
    const pool = new RenderTargetPool(makeDevice());
    const target = pool.acquire(desc);
    const original = target.dispose.bind(target);
    const failure = new Error("target cleanup failed without a receipt");
    Object.defineProperty(target, resourceDisposalPending, { configurable: true, value: undefined });
    const dispose = vi.spyOn(target, "dispose")
      .mockImplementationOnce(() => { (target as { disposed: boolean }).disposed = true; throw failure; })
      .mockImplementation(original);

    expect(() => pool.release(target)).toThrow(failure);
    pool.release(target);
    pool.release(target);
    expect(dispose).toHaveBeenCalledTimes(2);
    pool.dispose();
  });

  it("honors the WebGPU target completion receipt when external disposal failed", () => {
    const pool = new RenderTargetPool(makeDevice());
    const target = pool.acquire(desc);
    let completed = false;
    Object.defineProperty(target, "nativeDisposalComplete", { configurable: true, get: () => completed });
    (target as { disposed: boolean }).disposed = true;
    const dispose = vi.spyOn(target, "dispose").mockImplementation(() => { completed = true; });

    pool.release(target);
    pool.release(target);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(completed).toBe(true);
    pool.dispose();
  });

  it("retries a real WebGPU target after external disposal fails without retiring its texture twice", async () => {
    const makeNative = (): WebGPUDeviceLike => ({
      createBuffer: () => ({ destroy() {} }),
      createTexture: () => ({ createView: () => ({}), destroy() {} }),
      queue: { writeBuffer() {}, submit() {}, onSubmittedWorkDone: () => Promise.resolve() }
    }) as unknown as WebGPUDeviceLike;
    const native = makeNative(), peerNative = makeNative();
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native } });
    const peerDevice = await WebGPUDevice.create({ adapter: { requestDevice: async () => peerNative } });
    const pool = new RenderTargetPool(device);
    const peerPool = new RenderTargetPool(peerDevice);
    const target = pool.acquire(desc);
    const sibling = pool.acquireLease(desc);
    const peer = peerPool.acquireLease(desc);
    const completion = target as RenderTarget & { readonly nativeDisposalComplete: boolean; readonly nativeTexture: object };
    const original = target.colorTexture.dispose.bind(target.colorTexture);
    const failure = new Error("WebGPU texture cleanup failed");
    const textureDispose = vi.spyOn(target.colorTexture, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const targetDispose = vi.spyOn(target, "dispose");
    const peerDispose = vi.spyOn(peer.target, "dispose");
    const owner = device as unknown as { retireNative(resource: object): void };
    const retire = vi.spyOn(owner, "retireNative");
    try {
      expect(() => target.dispose()).toThrow(failure);
      expect(target.disposed).toBe(true);
      expect(completion.nativeDisposalComplete).toBe(false);
      pool.release(target);
      pool.release(target);
      expect(completion.nativeDisposalComplete).toBe(true);
      expect(targetDispose).toHaveBeenCalledTimes(2);
      expect(textureDispose).toHaveBeenCalledTimes(2);
      expect(retire.mock.calls.filter(([resource]) => resource === completion.nativeTexture)).toHaveLength(1);
      expect(sibling.target.disposed).toBe(false);
      expect(peer.target.disposed).toBe(false);
      expect(peerDispose).not.toHaveBeenCalled();
    } finally {
      textureDispose.mockRestore();
      targetDispose.mockRestore();
      peerDispose.mockRestore();
      retire.mockRestore();
      pool.dispose();
      peerPool.dispose();
      device.dispose();
      peerDevice.dispose();
    }
  });

  it("quarantines a failed legacy retirement and retries it through the same release", () => {
    const pool = new RenderTargetPool(makeDevice());
    const old = pool.acquire(desc);
    const original = old.dispose.bind(old);
    const failure = new Error("legacy target failed");
    const dispose = vi.spyOn(old, "dispose")
      .mockImplementationOnce(() => {
        pool.release(old);
        throw failure;
      })
      .mockImplementation(original);

    expect(() => pool.release(old)).toThrow(failure);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    const current = pool.acquireLease(desc);
    expect(current.target).not.toBe(old);
    pool.release(old);
    pool.release(old);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(old.disposed).toBe(true);
    expect(current.target.disposed).toBe(false);
    current.release();
    pool.dispose();
  });

  it("retries a failed trim independent of idle age without repeating successful siblings", () => {
    const pool = new RenderTargetPool(makeDevice());
    const failed = pool.acquireLease(desc);
    const sibling = pool.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("trim target failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => {
        pool.trim(0);
        (failed.target as { disposed: boolean }).disposed = true;
        throw failure;
      })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");
    failed.release();
    sibling.release();

    const error = caughtError(() => pool.trim(0));
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    const current = pool.acquireLease(desc);
    expect(current.target).not.toBe(failed.target);
    failed.release();
    pool.trim(100);
    pool.trim(100);
    expect(failedDispose).toHaveBeenCalledTimes(2);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(current.target.disposed).toBe(false);
    current.release();
    pool.dispose();
  });

  it("retries a closed pool's failures without re-disposing siblings or reviving leases", () => {
    const pool = new RenderTargetPool(makeDevice());
    const failed = pool.acquireLease(desc);
    const sibling = pool.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("pool target failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => {
        pool.dispose();
        failed.release();
        (failed.target as { disposed: boolean }).disposed = true;
        throw failure;
      })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");
    sibling.release();

    const error = caughtError(() => pool.dispose());
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    expect(() => pool.acquireLease(desc)).toThrow(/disposed/i);
    pool.dispose();
    failed.release();
    pool.dispose();
    expect(failedDispose).toHaveBeenCalledTimes(2);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
  });

  it("lets a post owner retry its real backing lease after device shutdown fails", () => {
    const device = makeDevice();
    const pool = new RenderTargetPool(device);
    const getPool = vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flagsOff);
    const failed = resources.acquireLease(desc);
    const sibling = resources.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("device shutdown target failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");

    try {
      (device as { disposed: boolean }).disposed = true;
      expect(() => resources.dispose()).toThrow(AggregateError);
      expect(failedDispose).toHaveBeenCalledTimes(1);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
      resources.dispose();
      resources.dispose();
      failed.release();
      sibling.release();
      expect(failedDispose).toHaveBeenCalledTimes(2);
      expect(failed.target.disposed).toBe(true);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
    } finally {
      getPool.mockRestore();
      failedDispose.mockRestore();
      pool.dispose();
    }
  });

  it("reports a failed loss-triggered release to its post owner for retry", () => {
    const device = makeDevice();
    const pool = new RenderTargetPool(device);
    const getPool = vi.spyOn(renderTargetPoolSlot, "get").mockReturnValue(() => pool);
    const resources = new PostResources(device, flagsOff);
    const failed = resources.acquireLease(desc);
    const sibling = resources.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("loss-triggered release failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");

    try {
      (device as { contextLost: boolean }).contextLost = true;
      const error = caughtError(() => resources.dispose());
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
      expect(failedDispose).toHaveBeenCalledTimes(1);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
      (device as { contextLost: boolean }).contextLost = false;
      resources.dispose();
      failed.release();
      sibling.release();
      expect(failedDispose).toHaveBeenCalledTimes(2);
      expect(failed.target.disposed).toBe(true);
      expect(siblingDispose).toHaveBeenCalledTimes(1);
    } finally {
      getPool.mockRestore();
      failedDispose.mockRestore();
      resources.dispose();
      pool.dispose();
    }
  });

  it("retries a failed loss unsubscribe without repeating reentrant target cleanup", () => {
    const device = makeDevice();
    const failure = new Error("loss unsubscribe failed");
    let pool: RenderTargetPool;
    let fail = true;
    const unsubscribe = vi.fn(() => {
      pool.dispose();
      if (fail) throw failure;
    });
    (device as RenderDevice & { onDeviceLost: (listener: () => void) => () => void }).onDeviceLost = () => unsubscribe;
    pool = new RenderTargetPool(device);
    const lease = pool.acquireLease(desc);
    const dispose = vi.spyOn(lease.target, "dispose");

    const error = caughtError(() => pool.dispose());
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    fail = false;
    pool.dispose();
    pool.dispose();
    lease.release();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it.each(["lease", "trim"] as const)("retries failed loss cleanup through %s without affecting a newer or peer lease", (retry) => {
    const pool = new RenderTargetPool(makeDevice());
    const peer = new RenderTargetPool(makeDevice());
    const failed = pool.acquireLease(desc);
    const sibling = pool.acquireLease(desc);
    const peerLease = peer.acquireLease(desc);
    const original = failed.target.dispose.bind(failed.target);
    const failure = new Error("lost target failed");
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(original);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");
    sibling.release();

    expect(() => pool.rebuildForRestore()).not.toThrow();
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    const current = pool.acquireLease(desc);
    expect(current.target).not.toBe(failed.target);
    pool.release(peerLease.target);
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(current.target.disposed).toBe(false);
    expect(peerLease.target.disposed).toBe(false);
    if (retry === "lease") failed.release();
    else pool.trim(100);
    failed.release();
    pool.trim(100);
    expect(failedDispose).toHaveBeenCalledTimes(2);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(current.target.disposed).toBe(false);
    expect(peerLease.target.disposed).toBe(false);
    current.release();
    peerLease.release();
    pool.dispose();
    peer.dispose();
  });

  it("attempts a reentrant pool close's failing sibling once in the outer cleanup", () => {
    const pool = new RenderTargetPool(makeDevice());
    const first = pool.acquireLease(desc);
    const failed = pool.acquireLease(desc);
    const sibling = pool.acquireLease(desc);
    const firstOriginal = first.target.dispose.bind(first.target);
    const failedOriginal = failed.target.dispose.bind(failed.target);
    const failure = new Error("nested sibling failed");
    const firstDispose = vi.spyOn(first.target, "dispose").mockImplementation(() => {
      pool.dispose();
      firstOriginal();
    });
    const failedDispose = vi.spyOn(failed.target, "dispose")
      .mockImplementationOnce(() => { throw failure; })
      .mockImplementation(failedOriginal);
    const siblingDispose = vi.spyOn(sibling.target, "dispose");
    first.release();

    const error = caughtError(() => pool.trim(0));
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toEqual([failure]);
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(failedDispose).toHaveBeenCalledTimes(1);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
    expect(() => pool.acquireLease(desc)).toThrow(/disposed/i);
    pool.dispose();
    pool.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(failedDispose).toHaveBeenCalledTimes(2);
    expect(siblingDispose).toHaveBeenCalledTimes(1);
  });
});
