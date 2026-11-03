/** Reusable, device-owned render targets for the postprocessing pipeline. */

import { RenderDeviceError, type RenderDevice, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import { resourceDisposalPending } from "../ResourceLifecycle";
import type { TextureFormat } from "../Texture";
import type { RenderTargetPoolLike } from "../contracts/device";
import type { WebGPUResourceInterop } from "../webgpu/ResourceInterop";

export type RenderTargetPoolDesc = {
  readonly width: number;
  readonly height: number;
  readonly format: TextureFormat;
  readonly samples: 1 | 4;
  readonly depth: boolean;
};

/** A single acquisition. Releasing an old lease cannot release a newer one. */
export interface RenderTargetLease {
  readonly target: RenderTarget;
  release(): void;
}

interface PooledEntry {
  readonly target: RenderTarget;
  readonly key: string;
  readonly deviceGeneration: number;
  idleSince: number;
}

interface ActiveLease {
  readonly token: symbol;
  readonly kind: "legacy" | "token";
}

interface PoolCleanup {
  readonly attempted: Set<RenderTarget>;
  readonly errors: unknown[];
  unsubscribeAttempted: boolean;
}

type TargetDisposalStatus = RenderTarget & {
  readonly [resourceDisposalPending]?: boolean;
  /** This is the target's synchronous cleanup receipt, not its fence receipt. */
  readonly nativeDisposalComplete?: boolean;
  readonly nativeDisposalInProgress?: boolean;
  readonly nativeTexture?: object | null;
  readonly nativeDepthTexture?: object | null;
  readonly nativeMultisampleTexture?: object | null;
  readonly nativeExtraColors?: readonly { readonly native: object; readonly multisampleNative: object | null }[];
};

interface NativeRetirementReceipt {
  failure?: { readonly error: unknown };
}

interface PoolDisposalAttempt {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  state: "pending" | "resolved" | "rejected";
}

function poolDisposalAttempt(): PoolDisposalAttempt {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((accept, fail) => { resolve = accept; reject = fail; });
  // A synchronous disposer can be used without requesting its async receipt.
  void promise.catch(() => {});
  return { promise, resolve, reject, state: "pending" };
}

function disposalPending(target: RenderTarget): boolean {
  const status = target as TargetDisposalStatus;
  return status[resourceDisposalPending] === true || (target.disposed && status.nativeDisposalComplete === false);
}

function hasDisposalStatus(target: RenderTarget): boolean {
  const status = target as TargetDisposalStatus;
  return typeof status[resourceDisposalPending] === "boolean" || typeof status.nativeDisposalComplete === "boolean";
}

function poolKey(desc: RenderTargetPoolDesc): string {
  return `${desc.width}x${desc.height}:${desc.format}:s${desc.samples}:d${desc.depth ? 1 : 0}`;
}

function toRenderTargetDescriptor(desc: RenderTargetPoolDesc): RenderTargetDescriptor {
  return {
    width: desc.width,
    height: desc.height,
    label: "render-target-pool",
    format: desc.format as RenderTargetDescriptor["format"],
    sampleCount: desc.samples === 4 ? 4 : undefined,
    depth: desc.depth ? "texture" : false
  };
}

export class RenderTargetPool implements RenderTargetPoolLike {
  private readonly idle = new Map<string, PooledEntry[]>();
  private readonly owned = new Map<RenderTarget, PooledEntry>();
  private readonly leased = new Map<RenderTarget, ActiveLease>();
  // Retired targets are unavailable for reuse but remain owned until disposal
  // actually succeeds. Their old lease may retry only that same retirement.
  private readonly retired = new Set<RenderTarget>();
  private readonly retiredLeases = new Map<RenderTarget, ActiveLease>();
  private readonly failedRetirements = new Map<RenderTarget, unknown>();
  // Observe each native attachment separately: another target's failed fence
  // must not make a healthy, still-waiting target run its disposer again.
  private readonly nativeRetirements = new WeakMap<RenderTarget, Map<object, NativeRetirementReceipt>>();
  // A target-only release carries no acquisition identity. A device factory
  // must not hand back any target object previously exposed by this pool,
  // even after a failed disposal or context restoration. Safe token reuse
  // occurs only through the pool's own tracked idle bucket.
  private readonly exposedTargets = new WeakSet<RenderTarget>();
  private trimGeneration = 0;
  private deviceGeneration = 0;
  private createdCount = 0;
  private disposed = false;
  private rebuilding = false;
  private cleanup: PoolCleanup | undefined;
  private unsubscribed = false;
  private readonly unsubscribeLoss: (() => void) | undefined;
  private disposalAttempt?: PoolDisposalAttempt;

  constructor(private readonly device: RenderDevice) {
    // Invalidate immediately on loss. Waiting until a restore callback can
    // expose dead targets after the device clears its contextLost flag.
    const lifecycle = device as RenderDevice & { onDeviceLost?: (listener: () => void) => () => void };
    this.unsubscribeLoss = lifecycle.onDeviceLost?.(() => this.rebuildForRestore());
  }

  /** A closed pool retains its targets until their native retirement completes. */
  get [resourceDisposalPending](): boolean {
    return this.disposed && (this.cleanup !== undefined || !this.unsubscribed || this.owned.size > 0
      || this.disposalAttempt?.state === "rejected");
  }

  /** Observe the current close attempt without initiating or retrying cleanup. */
  whenDisposed(): Promise<void> {
    return this.disposalAttempt?.promise
      ?? Promise.reject(new RenderDeviceError("Render target pool disposal has not started.", "DISPOSAL_NOT_STARTED"));
  }

  /**
   * Legacy target-only API. Every acquisition creates a fresh target and its
   * release retires it: a target-only release cannot identify an acquisition.
   * Use acquireLease to reuse targets while retaining acquisition identity.
   */
  acquire(desc: RenderTargetPoolDesc): RenderTarget {
    return this.acquireEntry(desc, "legacy").target;
  }

  /** Token-backed acquisition for asynchronous and independently owned users. */
  acquireLease(desc: RenderTargetPoolDesc): RenderTargetLease {
    const { target, token } = this.acquireEntry(desc, "token");
    return { target, release: () => this.releaseToken(target, token) };
  }

  /** Release or retry a legacy acquisition. Foreign and idle targets are ignored.
   * Token leases can only be released by their own release callback. */
  release(target: RenderTarget): void {
    const lease = this.leased.get(target) ?? this.retiredLeases.get(target);
    if (lease?.kind === "legacy") this.releaseToken(target, lease.token);
  }

  private acquireEntry(desc: RenderTargetPoolDesc, kind: ActiveLease["kind"]): { target: RenderTarget; token: symbol } {
    if (this.device.disposed && !this.disposed) this.dispose();
    if (this.disposed) {
      throw new RenderDeviceError("Cannot acquire a target from a disposed pool or device.", "DISPOSED_DEVICE");
    }
    if (this.rebuilding) {
      throw new RenderDeviceError("Cannot acquire a target while the pool is rebuilding.", "CONTEXT_LOST");
    }
    if (this.deviceIsLost()) {
      // An old framebuffer must never be returned during a context-loss race.
      this.rebuildForRestore();
      throw new RenderDeviceError("Cannot acquire a target while the device context is lost.", "CONTEXT_LOST");
    }
    const key = poolKey(desc);
    // A stale target-only release can also come from a former token holder who
    // retained the target reference. Never lend a token-idle object to legacy.
    const bucket = kind === "token" ? this.idle.get(key) : undefined;
    let entry: PooledEntry | undefined;
    while (bucket && bucket.length > 0) {
      const candidate = bucket.pop()!;
      const pending = disposalPending(candidate.target);
      if (candidate.deviceGeneration !== this.deviceGeneration || candidate.target.disposed || pending) {
        if (pending || !candidate.target.disposed) this.queueRetirement(candidate.target);
        else this.owned.delete(candidate.target);
        continue;
      }
      entry = candidate;
      break;
    }
    if (bucket?.length === 0) this.idle.delete(key);
    if (!entry) {
      const target = this.device.createRenderTarget(toRenderTargetDescriptor(desc));
      if (target.disposed || disposalPending(target) || this.owned.has(target) || this.exposedTargets.has(target)) {
        throw new RenderDeviceError("Device did not create a new live render target.", "INVALID_RESOURCE");
      }
      entry = { target, key, deviceGeneration: this.deviceGeneration, idleSince: this.trimGeneration };
      this.owned.set(target, entry);
      this.createdCount += 1;
    }
    const token = Symbol("render-target-lease");
    this.exposedTargets.add(entry.target);
    this.leased.set(entry.target, { token, kind });
    return { target: entry.target, token };
  }

  private releaseToken(target: RenderTarget, token: symbol): void {
    const lease = this.leased.get(target);
    if (!lease || lease.token !== token) {
      if (this.retiredLeases.get(target)?.token === token) {
        this.retireForLease(target);
      }
      return;
    }
    if (this.deviceIsLost()) {
      // Retire every target, not just the returned one, as soon as a loss is
      // observed. No old lease or idle entry may cross a device generation.
      const nested = this.cleanup !== undefined;
      this.rebuildForRestore();
      // A standalone restore is best effort, but a releasing owner must know
      // its own target failed so it can retain and retry the backing lease.
      if (!nested && this.failedRetirements.has(target)) throw this.failedRetirements.get(target);
      return;
    }
    if (this.device.disposed) {
      this.dispose();
      return;
    }
    const entry = this.owned.get(target);
    if (!entry) {
      this.leased.delete(target);
      return;
    }
    if (lease.kind === "legacy" || this.disposed || entry.deviceGeneration !== this.deviceGeneration || target.disposed || disposalPending(target)) {
      // Retire a legacy-exposed object instead of allowing a stale target-only
      // release to affect a subsequent owner. Device disposal owns any GPU
      // fence/retirement required for this target.
      this.queueRetirement(target);
      this.retireForLease(target);
      return;
    }
    this.leased.delete(target);
    entry.idleSince = this.trimGeneration;
    const bucket = this.idle.get(entry.key) ?? [];
    bucket.push(entry);
    this.idle.set(entry.key, bucket);
  }

  private retireForLease(target: RenderTarget): void {
    const nested = this.cleanup !== undefined;
    this.withCleanup((cleanup) => this.attemptRetirement(cleanup, target), true);
    // A nested release cannot promise completion while an outer disposer is
    // still running; the lease owner must retain its own retry path.
    if (nested && this.retired.has(target) && disposalPending(target)) {
      throw new Error("Render target disposal is in progress.");
    }
  }

  /** Retire old idle entries and retry prior failed retirements, regardless of age. */
  trim(maxIdleFrames: number): void {
    this.trimGeneration += 1;
    for (const [key, bucket] of this.idle) {
      const kept: PooledEntry[] = [];
      for (const entry of bucket) {
        if (!entry.target.disposed && !disposalPending(entry.target) && this.trimGeneration - entry.idleSince <= maxIdleFrames) {
          kept.push(entry);
        } else {
          this.queueRetirement(entry.target);
        }
      }
      if (kept.length) this.idle.set(key, kept);
      else this.idle.delete(key);
    }
    this.withCleanup((cleanup) => {
      for (const target of [...this.retired]) this.attemptRetirement(cleanup, target);
    });
  }

  /** Retire all targets, including outstanding leases, on device restoration. */
  rebuildForRestore(): void {
    if (this.rebuilding || this.disposed) return;
    this.rebuilding = true;
    this.deviceGeneration += 1;
    for (const target of this.owned.keys()) this.queueRetirement(target);
    this.idle.clear();
    // A dead context can reject deletion; disposal must not prevent restoration.
    try {
      this.withCleanup((cleanup) => {
        for (const target of [...this.retired]) this.attemptRetirement(cleanup, target);
      });
    } catch { /* Context-loss cleanup is best effort; failures remain owned. */ }
    finally { this.rebuilding = false; }
  }

  /** Permanently close the pool; subsequent calls retry any failed cleanup. */
  dispose(options?: { readonly deviceDisposalAttempted?: boolean }): void {
    const nested = this.cleanup !== undefined;
    if (!this.disposalAttempt || this.disposalAttempt.state === "rejected") {
      this.disposalAttempt = poolDisposalAttempt();
    }
    const attempt = this.disposalAttempt;
    this.disposed = true;
    try {
      for (const target of this.owned.keys()) this.queueRetirement(target);
      this.idle.clear();
      this.withCleanup((cleanup) => {
        if (!this.unsubscribed && !cleanup.unsubscribeAttempted) {
          cleanup.unsubscribeAttempted = true;
          try { this.unsubscribeLoss?.(); this.unsubscribed = true; } catch (error) { cleanup.errors.push(error); }
        }
        for (const target of [...this.retired]) this.attemptRetirement(cleanup, target, options?.deviceDisposalAttempted === true);
      });
      // An outer trim, release, or restore may still be executing a target's
      // disposer. A nested close must not look complete to the device wrapper,
      // which would otherwise forget the pool before that outer call returns.
      if (nested && [...this.retired].some(disposalPending)) {
        throw new Error("Render target pool disposal is still in progress.");
      }
    } catch (error) {
      this.rejectDisposalAttempt(error, attempt);
      throw error;
    } finally {
      this.resolveDisposalAttempt();
    }
  }

  private queueRetirement(target: RenderTarget): void {
    if (!this.owned.has(target)) return;
    const lease = this.leased.get(target);
    if (lease) {
      this.retiredLeases.set(target, lease);
      this.leased.delete(target);
    }
    this.retired.add(target);
  }

  private attemptRetirement(cleanup: PoolCleanup, target: RenderTarget, deviceDisposalAttempted = false): void {
    if (!this.retired.has(target) || cleanup.attempted.has(target)) return;
    cleanup.attempted.add(target);
    try {
      // A completion receipt distinguishes a closed target from one whose
      // failed or reentrant cleanup still needs its original owner.
      const status = target as TargetDisposalStatus;
      const pending = disposalPending(target);
      let attempt = !target.disposed || pending || (this.failedRetirements.has(target) && !hasDisposalStatus(target));
      let nativeReceipts: Map<object, NativeRetirementReceipt> | undefined;
      const nativeDisposalInFlight = this.device.kind === "webgpu"
        && status.nativeDisposalComplete === false && status.nativeDisposalInProgress === true;
      if (nativeDisposalInFlight || (deviceDisposalAttempted && this.device.kind === "webgpu" && this.device.disposed
        && typeof status.nativeDisposalComplete === "boolean")) {
        // An external target disposer is still on the stack, or the device
        // sweep already attempted it. Keep ownership without reentering it or
        // duplicating a native retirement retry in the same device close.
        attempt = false;
      } else if (pending && status.nativeDisposalComplete === true) {
        nativeReceipts = this.observeNativeRetirements(target);
        if (nativeReceipts) {
          // The logical target is already closed. Only a failed native receipt
          // needs an explicit retry; a healthy fence is still owned, not done.
          attempt = [...nativeReceipts.values()].some((receipt) => receipt.failure !== undefined);
          if (attempt) {
            for (const [resource, receipt] of nativeReceipts) {
              if (receipt.failure !== undefined) nativeReceipts.delete(resource);
            }
          }
        }
      }
      if (attempt) {
        try {
          target.dispose();
        } finally {
          if (nativeReceipts) {
            try { this.observeNativeRetirements(target); } catch { /* Preserve any disposal error. */ }
          }
        }
      }
      if (!target.disposed || disposalPending(target)) {
        if (target.disposed && status.nativeDisposalComplete === true) {
          const receipts = this.observeNativeRetirements(target);
          const interop = (this.device as RenderDevice & { readonly resourceInterop?: WebGPUResourceInterop }).resourceInterop;
          const failure = receipts && [...receipts.values()].find((receipt) => receipt.failure !== undefined)?.failure;
          if (failure) throw failure.error;
          if (receipts && interop && [...receipts.keys()].some((resource) => interop.owns(resource))) {
            // Logical cleanup succeeded; a failure-reporting interop receipt,
            // not this synchronous call, now owns the remaining fence wait.
            // Keep the target and its lease quarantined until that receipt.
            this.failedRetirements.delete(target);
            return;
          }
        }
        throw new Error("Render target disposal did not complete.");
      }
      // An earlier rejected receipt may have been discharged by an external
      // retry or confirmed device loss. This explicit attempt acknowledges it;
      // pending receipts must still settle so their failures cannot be lost.
      const receipts = this.nativeRetirements.get(target);
      const interop = (this.device as RenderDevice & { readonly resourceInterop?: WebGPUResourceInterop }).resourceInterop;
      if (receipts && interop) {
        for (const [resource, receipt] of receipts) {
          if (receipt.failure !== undefined && !interop.owns(resource)) receipts.delete(resource);
        }
      }
      this.failedRetirements.delete(target);
      this.completeRetirement(target);
    } catch (error) {
      if ((target as TargetDisposalStatus).nativeDisposalComplete === true) {
        try { this.observeNativeRetirements(target); } catch { /* Preserve the disposal error. */ }
      }
      this.failedRetirements.set(target, error);
      cleanup.errors.push(error);
    }
  }

  private observeNativeRetirements(target: RenderTarget): Map<object, NativeRetirementReceipt> | undefined {
    if (this.device.kind !== "webgpu") return undefined;
    const interop = (this.device as RenderDevice & { readonly resourceInterop?: WebGPUResourceInterop }).resourceInterop;
    const status = target as TargetDisposalStatus;
    if (!interop || typeof interop.whenRetired !== "function" || !("nativeTexture" in status)) return undefined;
    const textures = [
      status.nativeTexture, status.nativeDepthTexture, status.nativeMultisampleTexture,
      ...(status.nativeExtraColors ?? []).flatMap((color) => [color.native, color.multisampleNative])
    ];
    const held = new Set(textures.filter((texture): texture is object => texture != null && interop.owns(texture)));
    let receipts = this.nativeRetirements.get(target);
    if (!held.size) return receipts;
    if (!receipts) {
      receipts = new Map();
      this.nativeRetirements.set(target, receipts);
    }
    for (const resource of held) {
      const fenceFailure = typeof interop.retirementFenceFailure === "function"
        ? interop.retirementFenceFailure(resource)
        : undefined;
      const existing = receipts.get(resource);
      if (existing) {
        if (fenceFailure) existing.failure = fenceFailure;
        continue;
      }
      const receipt: NativeRetirementReceipt = {};
      if (fenceFailure) receipt.failure = fenceFailure;
      receipts.set(resource, receipt);
      const current = receipts;
      try {
        void interop.whenRetired(resource).then(() => {
          if (current.get(resource) !== receipt) return;
          current.delete(resource);
          try { this.completeRetirement(target); } catch (error) { this.recordAsyncRetirementFailure(target, error); }
        }, (error: unknown) => {
          if (current.get(resource) !== receipt) return;
          receipt.failure = { error };
          this.recordAsyncRetirementFailure(target, error);
        });
      } catch (error) {
        receipt.failure = { error };
      }
    }
    return receipts;
  }

  private completeRetirement(target: RenderTarget): void {
    if (!this.retired.has(target) || this.failedRetirements.has(target) || !target.disposed || disposalPending(target)
      || (this.nativeRetirements.get(target)?.size ?? 0) > 0) return;
    this.retired.delete(target);
    this.retiredLeases.delete(target);
    this.owned.delete(target);
    this.nativeRetirements.delete(target);
    this.resolveDisposalAttempt();
  }

  private recordAsyncRetirementFailure(target: RenderTarget, error: unknown): void {
    if (!this.retired.has(target)) return;
    this.failedRetirements.set(target, error);
    this.rejectDisposalAttempt(error);
  }

  private rejectDisposalAttempt(error: unknown, attempt = this.disposalAttempt): void {
    if (!attempt || attempt.state !== "pending") return;
    attempt.state = "rejected";
    attempt.reject(error);
  }

  private resolveDisposalAttempt(): void {
    const attempt = this.disposalAttempt;
    if (!attempt || attempt.state !== "pending" || !this.disposed || this.cleanup || !this.unsubscribed || this.owned.size) return;
    attempt.state = "resolved";
    attempt.resolve();
  }

  private withCleanup(action: (cleanup: PoolCleanup) => void, singleError = false): void {
    const outermost = !this.cleanup;
    const cleanup = this.cleanup ?? { attempted: new Set<RenderTarget>(), errors: [] as unknown[], unsubscribeAttempted: false };
    this.cleanup = cleanup;
    try { action(cleanup); } catch (error) {
      if (outermost && this.disposed) this.rejectDisposalAttempt(error);
      throw error;
    } finally { if (outermost) this.cleanup = undefined; }
    if (!outermost) return;
    if (cleanup.errors.length) {
      const error = singleError && cleanup.errors.length === 1
        ? cleanup.errors[0]
        : new AggregateError(cleanup.errors, "Render target pool disposal failed.");
      if (this.disposed) this.rejectDisposalAttempt(error);
      throw error;
    }
    this.resolveDisposalAttempt();
  }

  private deviceIsLost(): boolean {
    const lifecycle = this.device as RenderDevice & { isDeviceLost?: () => boolean };
    return this.device.contextLost || lifecycle.isDeviceLost?.() === true;
  }

  /** Counts reusable and leased live targets, excluding quarantined retirements. */
  poolStats(): { readonly idle: number; readonly inUse: number; readonly created: number } {
    for (const [target] of this.owned) {
      if (!this.retired.has(target)) {
        if (disposalPending(target)) {
          this.queueRetirement(target);
        } else if (target.disposed) {
          this.owned.delete(target);
          this.leased.delete(target);
        }
      }
    }
    let idle = 0;
    for (const [key, bucket] of this.idle) {
      const live = bucket.filter((entry) => this.owned.has(entry.target) && !this.retired.has(entry.target));
      if (live.length) this.idle.set(key, live);
      else this.idle.delete(key);
      idle += live.length;
    }
    return { idle, inUse: this.leased.size, created: this.createdCount };
  }
}
