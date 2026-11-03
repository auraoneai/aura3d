import { describe, expect, it, vi } from "vitest";

import { RenderTargetPool } from "../../../../packages/rendering/src/resources/RenderTargetPool";
import type { RenderDevice, RenderTarget, RenderTargetDescriptor } from "../../../../packages/rendering/src/RenderDevice";

let nextId = 0;

function makeTarget(desc: RenderTargetDescriptor): RenderTarget {
  return {
    id: ++nextId,
    width: desc.width,
    height: desc.height,
    label: desc.label ?? "fake",
    colorTexture: { format: desc.format ?? "rgba8" } as RenderTarget["colorTexture"],
    depthTexture: desc.depth === "texture" ? ({} as RenderTarget["depthTexture"]) : undefined,
    sampleCount: desc.sampleCount,
    disposed: false,
    dispose() { this.disposed = true; }
  } as RenderTarget & { disposed: boolean };
}

function makeDevice() {
  const descriptors: RenderTargetDescriptor[] = [];
  const device = {
    createRenderTarget(desc: RenderTargetDescriptor): RenderTarget {
      descriptors.push(desc);
      return makeTarget(desc);
    }
  } as unknown as RenderDevice;
  return { device, descriptors };
}

const desc = { width: 320, height: 180, format: "rgba8", samples: 1, depth: false } as const;

describe("RenderTargetPool (C-28 real)", () => {
  it("creates on first lease and reuses its target after release", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const first = pool.acquireLease(desc);
    first.release();
    const second = pool.acquireLease(desc);
    expect(second.target).toBe(first.target);
    expect(descriptors).toHaveLength(1);
  });

  it("does not share targets across different keys", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquireLease(desc);
    a.release();
    const b = pool.acquireLease({ ...desc, format: "rgba16f" });
    const c = pool.acquireLease({ ...desc, depth: true });
    const d = pool.acquireLease({ ...desc, samples: 4 });
    expect(b.target).not.toBe(a.target);
    expect(c.target).not.toBe(a.target);
    expect(d.target).not.toBe(a.target);
    expect(descriptors).toHaveLength(4);
  });

  it("requests a sampleable depth texture for depth:true, none otherwise", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    pool.acquire({ ...desc, depth: true });
    pool.acquire(desc);
    expect(descriptors[0].depth).toBe("texture");
    expect(descriptors[1].depth).toBe(false);
  });

  it("acquires concurrently-in-use targets separately", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquireLease(desc);
    const b = pool.acquireLease(desc);
    expect(b.target).not.toBe(a.target);
    expect(descriptors).toHaveLength(2);
  });

  it("retires each legacy target and ignores stale or duplicate releases", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const first = pool.acquire(desc);
    pool.release(first);
    pool.release(first);
    expect(first.disposed).toBe(true);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    const next = pool.acquire(desc);
    const concurrent = pool.acquire(desc);
    expect(next).not.toBe(first);
    expect(concurrent).not.toBe(first);
    expect(concurrent).not.toBe(next);
    pool.release(first);
    expect(next.disposed).toBe(false);
    expect(concurrent.disposed).toBe(false);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 2, created: 3 });
    pool.release(next);
    pool.release(concurrent);
    expect(next.disposed).toBe(true);
    expect(concurrent.disposed).toBe(true);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 3 });
  });

  it("protects a reassigned target against stale token and target-only releases", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const oldLease = pool.acquireLease(desc);
    oldLease.release();
    const currentLease = pool.acquireLease(desc);
    expect(currentLease.target).toBe(oldLease.target);
    oldLease.release();
    pool.release(oldLease.target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });
    const concurrent = pool.acquireLease(desc);
    expect(concurrent.target).not.toBe(currentLease.target);
    currentLease.release();
    currentLease.release();
    concurrent.release();
    expect(pool.poolStats()).toEqual({ idle: 2, inUse: 0, created: 2 });
  });

  it("does not lend a token-exposed target to a later legacy borrower", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquireLease(desc);
    old.release();
    const current = pool.acquire(desc);
    expect(current).not.toBe(old.target);
    old.release();
    pool.release(old.target);
    expect(current.disposed).toBe(false);
    expect(pool.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
    pool.release(current);
    expect(current.disposed).toBe(true);
    expect(pool.poolStats()).toEqual({ idle: 1, inUse: 0, created: 2 });
    const next = pool.acquireLease(desc);
    expect(next.target).toBe(old.target);
    expect(next.target.disposed).toBe(false);
  });

  it("ignores foreign targets on release (does not dispose them)", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const foreign = makeTarget({ width: 8, height: 8 });
    pool.release(foreign);
    expect((foreign as { disposed: boolean }).disposed).toBe(false);
    expect(pool.poolStats().idle).toBe(0);
  });

  it("trim disposes targets idle longer than maxIdleFrames", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const lease = pool.acquireLease(desc);
    const a = lease.target;
    lease.release();
    pool.trim(1); // generation 1: idleSince 0 → kept (1 gen)
    expect((a as unknown as { disposed: boolean }).disposed).toBe(false);
    pool.trim(1); // generation 2: idle for 2 gens > 1 → disposed
    expect((a as unknown as { disposed: boolean }).disposed).toBe(true);
    expect(pool.poolStats().idle).toBe(0);
  });

  it("reacquire clears idle state so trim keeps live targets", () => {
    const { device, descriptors } = makeDevice();
    const pool = new RenderTargetPool(device);
    const first = pool.acquireLease(desc);
    first.release();
    const second = pool.acquireLease(desc);
    const b = second.target;
    expect(b).toBe(first.target);
    pool.trim(1);
    second.release();
    pool.trim(1);
    expect((b as unknown as { disposed: boolean }).disposed).toBe(false);
    expect(descriptors).toHaveLength(1);
  });

  it("trim(0) disposes every idle target", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const lease = pool.acquireLease(desc);
    const a = lease.target;
    lease.release();
    pool.trim(0);
    expect((a as unknown as { disposed: boolean }).disposed).toBe(true);
  });

  it("removes externally disposed targets from idle and leased accounting", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const idle = pool.acquireLease(desc);
    const live = pool.acquireLease(desc);
    idle.release();
    idle.target.dispose();
    live.target.dispose();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    live.release();
    expect(pool.acquireLease(desc).target).not.toBe(idle.target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 3 });
  });

  it("retires idle and outstanding targets exactly once on restore", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const outstanding = pool.acquireLease(desc);
    const idle = pool.acquireLease(desc);
    const oldDispose = vi.spyOn(outstanding.target, "dispose");
    const idleDispose = vi.spyOn(idle.target, "dispose");
    idle.release();
    pool.rebuildForRestore();
    pool.rebuildForRestore();
    outstanding.release();
    idle.release();
    pool.release(idle.target);
    expect(oldDispose).toHaveBeenCalledTimes(1);
    expect(idleDispose).toHaveBeenCalledTimes(1);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    const fresh = pool.acquireLease(desc);
    outstanding.release();
    expect(fresh.target).not.toBe(outstanding.target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 3 });
  });

  it("does not reuse a target while the context is lost", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquireLease(desc);
    old.release();
    (device as { contextLost: boolean }).contextLost = true;
    expect(() => pool.acquire(desc)).toThrowError(/context is lost/i);
    expect(old.target.disposed).toBe(true);
    (device as { contextLost: boolean }).contextLost = false;
    expect(pool.acquireLease(desc).target).not.toBe(old.target);
  });

  it("subscribes to loss before restore and unsubscribes on disposal", () => {
    const { device } = makeDevice();
    const listeners = new Set<() => void>();
    (device as RenderDevice & { onDeviceLost: (listener: () => void) => () => void }).onDeviceLost = (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    };
    const pool = new RenderTargetPool(device);
    const old = pool.acquireLease(desc);
    old.release();
    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener();
    expect(old.target.disposed).toBe(true);
    expect(pool.acquireLease(desc).target).not.toBe(old.target);
    pool.dispose();
    expect(listeners.size).toBe(0);
  });

  it("detects loss before its event when the device exposes synchronous loss state", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquireLease(desc);
    old.release();
    (device as RenderDevice & { isDeviceLost: () => boolean }).isDeviceLost = () => true;
    expect(() => pool.acquire(desc)).toThrow(/context is lost/i);
    expect(old.target.disposed).toBe(true);
  });

  it("keeps another device's targets live when one device loses its context", () => {
    function deviceWithLoss() {
      const { device } = makeDevice();
      const listeners = new Set<() => void>();
      (device as RenderDevice & { onDeviceLost: (listener: () => void) => () => void }).onDeviceLost = (listener) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
      };
      return { device, lose: () => { for (const listener of listeners) listener(); } };
    }
    const a = deviceWithLoss();
    const b = deviceWithLoss();
    const poolA = new RenderTargetPool(a.device);
    const poolB = new RenderTargetPool(b.device);
    const targetA = poolA.acquireLease(desc);
    const targetB = poolB.acquireLease(desc);
    a.lose();
    expect(targetA.target.disposed).toBe(true);
    expect(targetB.target.disposed).toBe(false);
    expect(poolB.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });
    targetB.release();
    expect(poolB.acquireLease(desc).target).toBe(targetB.target);
    poolA.dispose();
    poolB.dispose();
  });

  it("retires a returned target during loss and ignores later restore cleanup", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const lease = pool.acquireLease(desc);
    const other = pool.acquireLease(desc);
    const dispose = vi.spyOn(lease.target, "dispose");
    const otherDispose = vi.spyOn(other.target, "dispose");
    (device as { contextLost: boolean }).contextLost = true;
    lease.release();
    pool.rebuildForRestore();
    lease.release();
    expect(dispose).toHaveBeenCalledOnce();
    expect(otherDispose).toHaveBeenCalledOnce();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
  });

  it("rejects reentrant acquisition while a restore is retiring old targets", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const target = pool.acquire(desc);
    vi.spyOn(target, "dispose").mockImplementation(() => {
      expect(() => pool.acquire(desc)).toThrow(/rebuilding/i);
      (target as { disposed: boolean }).disposed = true;
    });
    pool.rebuildForRestore();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    expect(pool.acquire(desc)).not.toBe(target);
  });

  it("closes and retires outstanding targets if the device is disposed", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const outstanding = pool.acquireLease(desc);
    (device as { disposed: boolean }).disposed = true;
    expect(() => pool.acquire(desc)).toThrow(/disposed/i);
    expect(outstanding.target.disposed).toBe(true);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    outstanding.release();
  });

  it("continues trimming after a disposal failure and reports all errors", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const a = pool.acquireLease(desc);
    const b = pool.acquireLease(desc);
    const failure = new Error("failed to destroy target");
    const disposeA = vi.spyOn(a.target, "dispose").mockImplementation(() => { throw failure; });
    const disposeB = vi.spyOn(b.target, "dispose");
    a.release();
    b.release();
    try {
      pool.trim(0);
      throw new Error("expected trim to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
    }
    expect(disposeB).toHaveBeenCalledOnce();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    expect(() => pool.trim(0)).toThrow(AggregateError);
    expect(disposeA).toHaveBeenCalledTimes(2);
    expect(disposeB).toHaveBeenCalledOnce();
    disposeA.mockRestore();
    pool.trim(0);
    expect(a.target.disposed).toBe(true);
    expect(disposeB).toHaveBeenCalledOnce();
  });

  it("disposes a closed pool once and rejects subsequent acquisition", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const leased = pool.acquireLease(desc);
    const idle = pool.acquireLease(desc);
    const disposeLeased = vi.spyOn(leased.target, "dispose");
    const disposeIdle = vi.spyOn(idle.target, "dispose");
    idle.release();
    pool.dispose();
    pool.dispose();
    leased.release();
    expect(disposeLeased).toHaveBeenCalledOnce();
    expect(disposeIdle).toHaveBeenCalledOnce();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
    expect(() => pool.acquire(desc)).toThrowError(/disposed/i);
  });

  it("reports disposal failures after retiring all targets, even on repeated close", () => {
    const { device } = makeDevice();
    const pool = new RenderTargetPool(device);
    const bad = pool.acquire(desc);
    const good = pool.acquire(desc);
    const failure = new Error("target disposal failed");
    const badDispose = vi.spyOn(bad, "dispose").mockImplementation(() => { throw failure; });
    const goodDispose = vi.spyOn(good, "dispose");
    try {
      pool.dispose();
      throw new Error("expected pool disposal to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual([failure]);
    }
    expect(goodDispose).toHaveBeenCalledOnce();
    expect(() => pool.dispose()).toThrow(AggregateError);
    expect(badDispose).toHaveBeenCalledTimes(2);
    badDispose.mockRestore();
    pool.dispose();
    pool.dispose();
    expect(bad.disposed).toBe(true);
    expect(goodDispose).toHaveBeenCalledOnce();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 2 });
  });
});
