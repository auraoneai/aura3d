import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { RenderTargetPool } from "../../../packages/rendering/src/resources/RenderTargetPool";

const descriptor = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;

describe("target-only render-target pool lifetime", () => {
  it("retires a legacy target so its stale release cannot release the next legacy borrower", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquire(descriptor);
    const disposeOld = vi.spyOn(old, "dispose");

    pool.release(old);
    expect(disposeOld).toHaveBeenCalledOnce();
    expect(old.disposed).toBe(true);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });

    const current = pool.acquire(descriptor);
    expect(current).not.toBe(old);
    pool.release(old);
    expect(disposeOld).toHaveBeenCalledOnce();
    expect(current.disposed).toBe(false);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });

    const concurrent = pool.acquire(descriptor);
    expect(concurrent).not.toBe(current);
    pool.release(current);
    pool.release(concurrent);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 3 });
    pool.dispose();
    device.dispose();
  });

  it("does not give a retired legacy target to a later token lease", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquire(descriptor);
    pool.release(old);

    const current = pool.acquireLease(descriptor);
    expect(current.target).not.toBe(old);
    pool.release(old);
    expect(current.target.disposed).toBe(false);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });

    current.release();
    const reused = pool.acquireLease(descriptor);
    expect(reused.target).toBe(current.target);
    current.release();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
    reused.release();
    pool.dispose();
    device.dispose();
  });

  it("never gives a token-idle target to a legacy borrower", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const earlier = pool.acquireLease(descriptor);
    earlier.release();
    const legacy = pool.acquire(descriptor);
    expect(legacy).not.toBe(earlier.target);

    earlier.release();
    pool.release(earlier.target);
    expect(legacy.disposed).toBe(false);
    expect(pool.poolStats()).toEqual({ idle: 1, inUse: 1, created: 2 });
    const later = pool.acquireLease(descriptor);
    expect(later.target).toBe(earlier.target);
    pool.release(earlier.target);
    expect(later.target.disposed).toBe(false);
    expect(legacy.disposed).toBe(false);
    pool.release(legacy);
    expect(legacy.disposed).toBe(true);
    pool.release(legacy);
    expect(later.target.disposed).toBe(false);
    later.release();
    pool.dispose();
    device.dispose();
  });

  it("detaches legacy ownership before a reentrant disposal callback", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquire(descriptor);
    const originalDispose = old.dispose.bind(old);
    let nested: ReturnType<RenderTargetPool["acquire"]> | undefined;
    const disposeOld = vi.spyOn(old, "dispose").mockImplementation(() => {
      pool.release(old);
      nested = pool.acquire(descriptor);
      originalDispose();
    });

    pool.release(old);
    expect(disposeOld).toHaveBeenCalledOnce();
    expect(nested).toBeDefined();
    expect(nested).not.toBe(old);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 2 });
    pool.release(nested!);
    disposeOld.mockRestore();
    pool.dispose();
    device.dispose();
  });

  it("does not reissue a legacy target even if its disposal fails and a device returns it again", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const old = pool.acquire(descriptor);
    const failure = new Error("retirement failed");
    const disposeOld = vi.spyOn(old, "dispose").mockImplementation(() => { throw failure; });

    expect(() => pool.release(old)).toThrow(failure);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    expect(() => pool.release(old)).toThrow(failure);
    expect(disposeOld).toHaveBeenCalledTimes(2);
    const create = vi.spyOn(device, "createRenderTarget").mockReturnValue(old);
    expect(() => pool.acquire(descriptor)).toThrow(/new live render target/);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });

    create.mockRestore();
    disposeOld.mockRestore();
    pool.release(old);
    expect(old.disposed).toBe(true);
    pool.dispose();
    device.dispose();
  });

  it("rejects a device that reissues a previously exposed token target as a fresh legacy target", () => {
    const device = new MockRenderDevice();
    const pool = new RenderTargetPool(device);
    const previous = pool.acquireLease(descriptor);
    const target = previous.target;
    target.dispose();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });

    // Model a faulty factory that resurrects and returns the same JS object.
    // The earlier borrower can still hold that object and call pool.release.
    (target as { disposed: boolean }).disposed = false;
    const create = vi.spyOn(device, "createRenderTarget").mockReturnValue(target);
    expect(() => pool.acquire(descriptor)).toThrow(/new live render target/);
    previous.release();
    pool.release(target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });

    create.mockRestore();
    target.dispose();
    pool.dispose();
    device.dispose();
  });

  it("ignores foreign and duplicate releases and retains device loss isolation", () => {
    const a = new MockRenderDevice();
    const b = new MockRenderDevice();
    const poolA = new RenderTargetPool(a);
    const poolB = new RenderTargetPool(b);
    const first = poolA.acquire(descriptor);
    const other = poolB.acquireLease(descriptor);

    poolA.release(other.target);
    expect(other.target.disposed).toBe(false);
    poolA.release(first);
    poolA.release(first);
    poolA.rebuildForRestore();
    expect(first.disposed).toBe(true);
    expect(other.target.disposed).toBe(false);
    expect(poolA.poolStats()).toEqual({ idle: 0, inUse: 0, created: 1 });
    expect(poolB.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });

    other.release();
    poolA.dispose();
    poolB.dispose();
    a.dispose();
    b.dispose();
  });
});
