/**
 * PRD-03 Phase 2 — v2 post-graph render-target pool.
 *
 * A thin cache in front of the C-28 `renderTargetPoolSlot` pool (whose PR 0a
 * stub allocates on every acquire). Entries are keyed by
 * `(width, height, format, samples, depth)`; `releaseAll()` returns live
 * target-only acquisitions to the free list so the next frame reuses them.
 * Explicit leases remain owned until released. `resize(width, height)` releases every pooled entry whose key
 * no longer matches the new render size, so a canvas resize cannot serve a
 * stale target back.
 *
 * The pool never owns GPU resources beyond the device lifetime: `dispose()`
 * releases everything and `trim(frames)` forwards to the underlying pool so
 * idle capacity still shrinks once C-28 is real.
 */

import { RenderDeviceError, type RenderDevice, type RenderTarget } from "../RenderDevice";
import type { RenderTargetPoolLike } from "../contracts/device";
import { renderTargetPoolSlot } from "../contracts/device";
import type { QrFlags } from "../contracts/core";
import { acquireTargetPoolLease, type TargetPoolLease } from "../resources/RenderTargetPoolLease";
import { registerEncodedPostLease } from "../output/EncodedDisplaySurface";

export interface PostTargetKey {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly samples: 1 | 4;
  readonly depth: boolean;
}

/** An acquisition-specific postprocessing target handle. */
export interface PostTargetLease {
  readonly target: RenderTarget;
  release(): void;
}

type ActivePostLease = { readonly token: symbol; readonly kind: "legacy" | "token" };
type Cleanup = { readonly attempted: Set<RenderTarget>; readonly errors: unknown[]; unsubscribeAttempted: boolean };

function keyOf(key: PostTargetKey): string {
  return `${key.width}x${key.height}:${key.format}:${key.samples}:${key.depth ? 1 : 0}`;
}

export class PostResources {
  private readonly free = new Map<string, RenderTarget[]>();
  private readonly live = new Map<RenderTarget, ActivePostLease>();
  private readonly backingLeases = new Map<RenderTarget, TargetPoolLease>();
  private readonly retiredBacking = new Set<RenderTarget>();
  private readonly releasingBacking = new Set<RenderTarget>();
  private readonly failedReleaseTokens = new Map<RenderTarget, ActivePostLease>();
  private readonly leaseBackedTargets = new WeakSet<RenderTarget>();
  private readonly explicitLeases = new WeakMap<PostTargetLease, { readonly target: RenderTarget; readonly token: symbol }>();
  private readonly encodedLeaseRevokers = new Map<symbol, () => void>();
  private allocations = 0;
  private generation = 0;
  private disposed = false;
  private cleanup?: Cleanup;
  private unsubscribed = false;
  private readonly backingPool: RenderTargetPoolLike;
  private readonly unsubscribeLoss?: () => void;

  constructor(
    private readonly device: RenderDevice,
    flags: QrFlags
  ) {
    // Keep the pool that created the leases even if a caller later changes
    // flags. Re-resolving the factory on release can return a different pool.
    this.backingPool = renderTargetPoolSlot.get(flags)(device);
    const lifecycle = device as RenderDevice & { onDeviceLost?: (listener: () => void) => () => void };
    this.unsubscribeLoss = lifecycle.onDeviceLost?.(() => {
      // Context-loss deletion is best effort, but every lease is detached.
      try { this.retireCached(); } catch { /* The backing context is already lost. */ }
    });
  }

  private pool(): RenderTargetPoolLike {
    return this.backingPool;
  }

  /** Total underlying allocations — the leak-detection counter tests assert on. */
  get allocationCount(): number {
    return this.allocations;
  }

  /** Target-only compatibility API. Use acquireLease when release can be delayed. */
  acquire(key: PostTargetKey): RenderTarget {
    return this.acquireTracked(key, "legacy").target;
  }

  /** A lease cannot release a later acquisition of the same cached target. */
  acquireLease(key: PostTargetKey): PostTargetLease {
    const { target, token } = this.acquireTracked(key, "token");
    return this.createLease(target, token);
  }

  /** Transfer the current target-only acquisition to a single explicit owner. */
  claimLease(target: RenderTarget): PostTargetLease {
    const lease = this.claimLeaseIfOwned(target);
    if (!lease) {
      throw new RenderDeviceError("Cannot claim a post target that is not a live target-only acquisition", "INVALID_RESOURCE");
    }
    return lease;
  }

  /** Claim a locally owned target, or leave a borrowed external target alone. */
  claimLeaseIfOwned(target: RenderTarget): PostTargetLease | undefined {
    const current = this.live.get(target);
    if (!current) return undefined;
    if (current.kind !== "legacy") {
      throw new RenderDeviceError("Cannot claim a post target that is not a live target-only acquisition", "INVALID_RESOURCE");
    }
    this.live.set(target, { token: current.token, kind: "token" });
    return this.createLease(target, current.token);
  }

  /** Transfer this exact live lease to the target-only compatibility API. */
  transferLeaseToLegacy(lease: PostTargetLease): RenderTarget {
    const owned = this.explicitLeases.get(lease);
    const current = owned && this.live.get(owned.target);
    if (!owned || current?.kind !== "token" || current.token !== owned.token) {
      throw new RenderDeviceError("Cannot transfer a stale or foreign post target lease", "INVALID_RESOURCE");
    }
    this.revokeEncodedLease(owned.token);
    this.explicitLeases.delete(lease);
    // Revoke the old callback when transferring ownership: it must never
    // release the target-only consumer or any later acquisition.
    this.live.set(owned.target, { token: Symbol("post-target-legacy"), kind: "legacy" });
    return owned.target;
  }

  private createLease(target: RenderTarget, token: symbol): PostTargetLease {
    const lease: PostTargetLease = { target, release: () => this.releaseToken(target, token) };
    this.explicitLeases.set(lease, { target, token });
    // A local wrapper over a target-only backing pool cannot distinguish a
    // stale raw release from a newer borrower. It remains valid for existing
    // postprocessing, but cannot attest an encoded display surface.
    if (this.leaseBackedTargets.has(target)) {
      const revoke = registerEncodedPostLease(lease, this.device, target, () => {
        const current = this.live.get(target);
        return !this.disposed && current?.kind === "token" && current.token === token;
      });
      this.encodedLeaseRevokers.set(token, revoke);
    }
    return lease;
  }

  private acquireTracked(key: PostTargetKey, kind: ActivePostLease["kind"]): { target: RenderTarget; token: symbol } {
    if (this.disposed || this.device.disposed) {
      throw new RenderDeviceError("Cannot acquire post resources from a disposed owner or device", "DISPOSED_DEVICE");
    }
    const lifecycle = this.device as RenderDevice & { isDeviceLost?: () => boolean };
    if (this.device.contextLost || lifecycle.isDeviceLost?.() === true) {
      this.retireCached();
      throw new RenderDeviceError("Cannot acquire post resources while the device is lost", "CONTEXT_LOST");
    }
    const generation = this.generation;
    const id = keyOf(key);
    const cached = this.free.get(id);
    while (cached && cached.length > 0) {
      const candidate = cached.pop()!;
      if ((candidate as { disposed?: boolean }).disposed) {
        this.releaseBacking(candidate);
        const failure = this.acquisitionFailure(generation);
        if (failure) throw failure;
        continue;
      }
      const failure = this.acquisitionFailure(generation);
      if (failure) throw failure;
      const token = Symbol("post-target-lease");
      this.live.set(candidate, { token, kind });
      return { target: candidate, token };
    }
    const failure = this.acquisitionFailure(generation);
    if (failure) throw failure;
    const pool = this.pool();
    const acquireExplicit = (pool as RenderTargetPoolLike & {
      acquireLease?: (descriptor: Parameters<RenderTargetPoolLike["acquire"]>[0]) => TargetPoolLease;
    }).acquireLease;
    const descriptor = {
      width: key.width,
      height: key.height,
      format: key.format as never,
      samples: key.samples,
      depth: key.depth
    };
    // Use the same captured method that determines whether this is a real
    // backing lease; an accessor cannot switch us to the legacy path between
    // the provenance check and acquisition.
    const backing = typeof acquireExplicit === "function"
      ? acquireExplicit.call(pool, descriptor)
      : acquireTargetPoolLease(pool, descriptor);
    const target = backing.target;
    this.allocations += 1;
    this.backingLeases.set(target, backing);
    const allocationFailure = this.acquisitionFailure(generation);
    if (allocationFailure) {
      // The pool may have synchronously retired this owner while allocating.
      // Keep a failed rollback owned, but preserve the acquisition error.
      try { this.releaseBacking(target); } catch { /* Retried by resize/dispose. */ }
      throw allocationFailure;
    }
    if (typeof acquireExplicit === "function") this.leaseBackedTargets.add(target);
    const token = Symbol("post-target-lease");
    this.live.set(target, { token, kind });
    return { target, token };
  }

  private acquisitionFailure(generation: number): RenderDeviceError | undefined {
    if (this.disposed || this.device.disposed) {
      return new RenderDeviceError("Cannot acquire post resources from a disposed owner or device", "DISPOSED_DEVICE");
    }
    const lifecycle = this.device as RenderDevice & { isDeviceLost?: () => boolean };
    if (this.device.contextLost || lifecycle.isDeviceLost?.() === true) {
      return new RenderDeviceError("Cannot acquire post resources while the device is lost", "CONTEXT_LOST");
    }
    if (generation !== this.generation) {
      return new RenderDeviceError("Cannot acquire post resources after the owner was invalidated", "INVALID_RESOURCE");
    }
    return undefined;
  }

  /** Release a target-only acquisition. A stale target-only release is ambiguous after reuse. */
  release(target: RenderTarget): void {
    const current = this.live.get(target);
    if (current?.kind === "legacy") this.releaseToken(target, current.token);
    else if (this.failedReleaseTokens.get(target)?.kind === "legacy") this.releaseBacking(target);
  }

  private releaseToken(target: RenderTarget, token: symbol): void {
    const current = this.live.get(target);
    if (current?.token !== token) {
      if (this.failedReleaseTokens.get(target)?.token === token) this.releaseBacking(target);
      return;
    }
    this.revokeEncodedLease(token);
    this.live.delete(target);
    if ((target as { disposed?: boolean }).disposed) {
      this.failedReleaseTokens.set(target, current);
      this.releaseBacking(target);
      return;
    }
    const key = this.keyForTarget(target);
    const list = this.free.get(key) ?? [];
    list.push(target);
    this.free.set(key, list);
  }

  /** End-of-frame: target-only acquisitions return; explicit leases retain ownership. */
  releaseAll(): void {
    const live = [...this.live];
    const pending = [...this.failedReleaseTokens];
    this.withCleanup("Post resource release failed", cleanup => {
      for (const [target, current] of live) {
        if (current.kind !== "legacy") continue;
        try { this.releaseToken(target, current.token); } catch (error) { cleanup.errors.push(error); }
      }
      for (const [target, current] of pending) {
        if (current.kind === "legacy" && this.failedReleaseTokens.get(target)?.token === current.token) {
          this.attemptBacking(cleanup, target);
        }
      }
    });
  }

  /**
   * Releases every pooled entry whose (w,h) does not match the new render
   * size — a resize can never hand back a stale target.
   */
  resize(width: number, height: number): void {
    this.generation += 1;
    const retired = new Set<RenderTarget>();
    for (const [key, list] of this.free) {
      const [w, h] = key.split(":")[0]!.split("x").map(Number);
      if (w !== width || h !== height) {
        this.free.delete(key);
        for (const target of list) retired.add(target);
      }
    }
    for (const [target, current] of [...this.live]) {
      const [w, h] = this.keyForTarget(target).split(":")[0]!.split("x").map(Number);
      if (w !== width || h !== height) {
        this.revokeEncodedLease(current.token);
        this.live.delete(target);
        retired.add(target);
      }
    }
    for (const target of this.retiredBacking) {
      if (target.width !== width || target.height !== height) retired.add(target);
    }
    for (const target of retired) {
      this.failedReleaseTokens.delete(target);
      this.retiredBacking.add(target);
    }
    this.withCleanup("Post resource resize failed", cleanup => {
      for (const target of retired) this.attemptBacking(cleanup, target);
    });
  }

  trim(maxIdleFrames: number): void {
    this.pool().trim(maxIdleFrames);
  }

  dispose(): void {
    this.disposed = true;
    this.withCleanup("Post resources disposal failed", cleanup => {
      // Revoke every acquisition before calling even the unsubscribe hook:
      // that callback can reenter and attempt to transfer an old lease.
      const targets = this.detachCached();
      if (!this.unsubscribed && !cleanup.unsubscribeAttempted) {
        cleanup.unsubscribeAttempted = true;
        try { this.unsubscribeLoss?.(); this.unsubscribed = true; } catch (error) { cleanup.errors.push(error); }
      }
      for (const target of targets) this.attemptBacking(cleanup, target);
    });
  }

  private retireCached(): void {
    this.withCleanup("Post resource release failed", cleanup => this.retireCachedInto(cleanup));
  }

  private retireCachedInto(cleanup: Cleanup): void {
    const targets = this.detachCached();
    for (const target of targets) this.attemptBacking(cleanup, target);
  }

  private detachCached(): RenderTarget[] {
    this.generation += 1;
    const targets = [...this.backingLeases.keys()];
    for (const revoke of this.encodedLeaseRevokers.values()) revoke();
    this.encodedLeaseRevokers.clear();
    this.free.clear();
    this.live.clear();
    for (const target of targets) {
      this.failedReleaseTokens.delete(target);
      this.retiredBacking.add(target);
    }
    return targets;
  }

  private attemptBacking(cleanup: Cleanup, target: RenderTarget): void {
    try { this.releaseBacking(target); } catch (error) { cleanup.errors.push(error); }
  }

  private releaseBacking(target: RenderTarget): void {
    const lease = this.backingLeases.get(target);
    if (!lease || this.cleanup?.attempted.has(target)) return;
    this.cleanup?.attempted.add(target);
    if (this.releasingBacking.has(target)) return;
    this.retiredBacking.add(target);
    this.releasingBacking.add(target);
    try {
      lease.release();
      if (this.backingLeases.get(target) === lease) {
        this.backingLeases.delete(target);
        this.leaseBackedTargets.delete(target);
        this.retiredBacking.delete(target);
        this.failedReleaseTokens.delete(target);
      }
    } finally {
      this.releasingBacking.delete(target);
    }
  }

  private withCleanup(message: string, action: (cleanup: Cleanup) => void): void {
    const outermost = !this.cleanup;
    const cleanup = this.cleanup ?? { attempted: new Set<RenderTarget>(), errors: [] as unknown[], unsubscribeAttempted: false };
    this.cleanup = cleanup;
    try { action(cleanup); } finally { if (outermost) this.cleanup = undefined; }
    if (outermost && cleanup.errors.length) throw new AggregateError(cleanup.errors, message);
  }

  private revokeEncodedLease(token: symbol): void {
    const revoke = this.encodedLeaseRevokers.get(token);
    if (!revoke) return;
    this.encodedLeaseRevokers.delete(token);
    revoke();
  }

  private keyForTarget(target: RenderTarget): string {
    const samples = ((target as { sampleCount?: number }).sampleCount ?? 1) as 1 | 4;
    const hasDepth = (target as { depthTexture?: unknown }).depthTexture !== undefined
      || (target as { depthTextureHandle?: unknown }).depthTextureHandle != null
      || (target as { depthHandle?: unknown }).depthHandle != null;
    return keyOf({
      width: target.width,
      height: target.height,
      format: target.colorTexture.format,
      samples,
      depth: hasDepth
    });
  }
}
