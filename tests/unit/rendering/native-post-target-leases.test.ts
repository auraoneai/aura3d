import { describe, expect, it, vi } from "vitest";

import { MockRenderDevice, type RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import type { RenderTargetPoolLike } from "../../../packages/rendering/src/contracts/device";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { prd11RenderTargetPoolFor } from "../../../packages/rendering/src/lanes/prd11";
import { PostResources } from "../../../packages/rendering/src/post/PostResources";
import { releaseV2Target } from "../../../packages/rendering/src/post/v2Stages";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { acquireTargetPoolLease, type TargetPoolLease } from "../../../packages/rendering/src/resources/RenderTargetPoolLease";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

const flags: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };
const key = { width: 8, height: 8, format: "rgba8", samples: 1, depth: false } as const;

describe("post target acquisition ownership", () => {
  it("keeps a new lease live when an older lease and target-only borrower release late", () => {
    const device = new MockRenderDevice();
    const resources = new PostResources(device, flags);
    const old = resources.acquireLease(key);
    old.release();
    const current = resources.acquireLease(key);
    expect(current.target).toBe(old.target);
    old.release();
    resources.release(old.target);
    resources.releaseAll();
    const concurrent = resources.acquireLease(key);
    expect(concurrent.target).not.toBe(current.target);
    expect(resources.allocationCount).toBe(2);
    concurrent.release();
    current.release();
    resources.dispose();
    device.dispose();
  });

  it("transfers a target-only acquisition to one explicit lease", () => {
    const device = new MockRenderDevice();
    const resources = new PostResources(device, flags);
    const target = resources.acquire(key);
    const claimed = resources.claimLease(target);
    expect(() => resources.claimLease(target)).toThrow(/not a live target-only acquisition/);
    resources.release(target);
    const concurrent = resources.acquire(key);
    expect(concurrent).not.toBe(target);
    claimed.release();
    const reused = resources.acquire(key);
    expect(reused).toBe(target);
    claimed.release();
    const stillConcurrent = resources.acquire(key);
    expect(stillConcurrent).not.toBe(reused);
    resources.release(concurrent);
    resources.release(reused);
    resources.release(stillConcurrent);
    resources.dispose();
    device.dispose();
  });

  it("revokes the old callback when transferring a lease to a target-only owner", () => {
    const device = new MockRenderDevice();
    const resources = new PostResources(device, flags);
    const lease = resources.acquireLease(key);
    const target = resources.transferLeaseToLegacy(lease);
    expect(target).toBe(lease.target);
    lease.release();
    const concurrent = resources.acquireLease(key);
    expect(concurrent.target).not.toBe(target);
    expect(() => resources.transferLeaseToLegacy(lease)).toThrow(/stale or foreign/);
    resources.release(target);
    const reused = resources.acquireLease(key);
    expect(reused.target).toBe(target);
    lease.release();
    const stillConcurrent = resources.acquireLease(key);
    expect(stillConcurrent.target).not.toBe(reused.target);
    stillConcurrent.release();
    concurrent.release();
    reused.release();
    resources.dispose();
    device.dispose();
  });

  it("does not let a retired post owner release the same target from the backing pool's newer owner", () => {
    const device = new MockRenderDevice();
    const pool = prd11RenderTargetPoolFor(device);
    const first = new PostResources(device, flags);
    const old = first.acquireLease(key);
    first.dispose();
    const second = new PostResources(device, flags);
    const current = second.acquireLease(key);
    expect(current.target).toBe(old.target);
    old.release();
    pool.release(old.target);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });
    const concurrent = pool.acquireLease(key);
    expect(concurrent.target).not.toBe(current.target);
    concurrent.release();
    current.release();
    second.dispose();
    pool.dispose();
    device.dispose();
  });

  it("invalidates a resized lease without letting its late release affect a new backing borrower", () => {
    const device = new MockRenderDevice();
    const pool = prd11RenderTargetPoolFor(device);
    const resources = new PostResources(device, flags);
    const old = resources.acquireLease(key);
    resources.resize(4, 4);
    const current = pool.acquireLease(key);
    expect(current.target).toBe(old.target);
    old.release();
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });
    current.release();
    resources.dispose();
    pool.dispose();
    device.dispose();
  });

  it("wraps a legacy pool with an idempotent owner callback", () => {
    const target = {} as RenderTarget;
    const release = vi.fn();
    const legacy = { acquire: () => target, release, trim: () => undefined } satisfies RenderTargetPoolLike;
    const old = acquireTargetPoolLease(legacy, key);
    old.release();
    const current = acquireTargetPoolLease(legacy, key);
    old.release();
    expect(release).toHaveBeenCalledTimes(1);
    current.release();
    expect(release).toHaveBeenCalledTimes(2);
  });

  it("keeps a captured chain lease from releasing a newer pool borrower", () => {
    const device = new MockRenderDevice();
    setRendererQrFlags(flags, device);
    const pool = prd11RenderTargetPoolFor(device);
    const pipeline = new RendererPostprocessPipeline({ device, width: 8, height: 8 } as never) as unknown as {
      chainTarget(label: string, owned: RenderTarget[], pooled: TargetPoolLease[]): RenderTarget;
      releaseChainTargets(pooled: TargetPoolLease[]): void;
    };
    const pooled: TargetPoolLease[] = [];
    const oldTarget = pipeline.chainTarget("intermediate", [], pooled);
    const oldLease = pooled[0]!;
    pipeline.releaseChainTargets(pooled);
    const current = pool.acquireLease(key);
    expect(current.target).toBe(oldTarget);
    oldLease.release();
    pool.release(oldTarget);
    expect(pool.poolStats()).toEqual({ idle: 0, inUse: 1, created: 1 });
    current.release();
    pool.dispose();
    device.dispose();
  });

  it("retains failed chain leases and does not repeat successful sibling releases", () => {
    const device = new MockRenderDevice();
    const pipeline = new RendererPostprocessPipeline({ device } as never) as unknown as {
      releaseChainTargets(pooled: TargetPoolLease[]): void;
      retryChainTargets(): void;
    };
    const failure = new Error("release failed");
    let fail = true;
    const retryable = vi.fn(() => { if (fail) throw failure; });
    const afterFailure = vi.fn();
    const pooled: TargetPoolLease[] = [
      { target: {} as RenderTarget, release: retryable },
      { target: {} as RenderTarget, release: afterFailure }
    ];
    expect(() => pipeline.releaseChainTargets(pooled)).toThrow(failure);
    expect(afterFailure).toHaveBeenCalledTimes(1);
    expect(pooled).toEqual([]);
    fail = false;
    pipeline.retryChainTargets();
    pipeline.retryChainTargets();
    expect(retryable).toHaveBeenCalledTimes(2);
    expect(afterFailure).toHaveBeenCalledTimes(1);
    device.dispose();
  });

  it("does not create v2 host state for a target-only release when none exists", () => {
    const host = {} as WebGL2DeviceHost;
    expect(() => releaseV2Target(host, {} as RenderTarget)).not.toThrow();
  });
});
