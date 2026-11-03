/**
 * Device-local coordination for streamed sampled-texture allocations.
 *
 * Native allocation, sampled binding changes, and fenced retirement are
 * delegated to the owning device through the adapter contract below.
 */

export interface TextureResidencyMip {
  readonly width: number;
  readonly height: number;
  /** Source payload size; the adapter estimates the actual device allocation. */
  readonly bytes: number;
}

export interface TextureResidencyLoadedMip<Mip> {
  readonly value: Mip;
  /** Release the returned CPU resource, including any closeable image. */
  release(): void;
}

export interface TextureResidencySource<Mip> {
  /** Logical sampled-texture identity, shared by all of its consumers. */
  readonly texture: object;
  /** Identity of the content, format, loader and effective request/security context. */
  readonly identity: object;
  readonly label?: string;
  /** Slot-appropriate 1x1 fallback, RGBA bytes. */
  readonly fallback: readonly [number, number, number, number];
  /** Standard GPU order: largest level first and consecutive smaller levels after it. */
  readonly levels: readonly TextureResidencyMip[];
  loadMip(level: number, signal: AbortSignal): Promise<TextureResidencyLoadedMip<Mip>>;
}

export interface TextureResidencyAllocation<Allocation> {
  readonly allocation: Allocation;
  /** Actual bytes charged in the device ledger, including any format fallback. */
  readonly bytes: number;
}

/**
 * The adapter is the authority for native resources and the device budget.
 *
 * - `usageBytes` includes sampled textures, targets, internal fallbacks,
 *   reservations, and allocations awaiting a fence.
 * - `acquireBudgetLimit` installs a device-wide limit lease. Admissions use
 *   the lowest active limit and existing device policy. Lowering a limit
 *   never removes existing charges, but prevents new allocations until they
 *   fit. Releasing this lease does not change other owners' limits.
 * - `estimate` returns the exact allocation charge for the selected format and
 *   fallback, for the last `levelCount` levels. It must be stable throughout
 *   an allocation attempt.
 * - `prepare` synchronously installs a device-local fallback registration for
 *   the logical texture, reserving its actual bytes against `maxBytes`. A
 *   failure must leave no registration. If submitted native work may still
 *   use a partial allocation, the adapter retains its charge and fences its
 *   cleanup. It runs before acquisition returns, so a draw cannot upload the
 *   logical full texture while loading.
 * - `allocate` synchronously reserves that exact charge in the same ledger
 *   before returning its promise, atomically respecting `maxBytes`. It resolves
 *   only after real storage has been created and uploaded. On rejection it
 *   settles only after any partially created storage is safely destroyed and
 *   debited, including on device loss. If it ignores abort and later succeeds,
 *   the controller retires the returned allocation.
 * - `publish` atomically switches this device's binding for `texture`; null
 *   selects its safe fallback. A throw leaves the previous binding untouched.
 *   It must reject a stale or lost device generation.
 * - `retire` ends the allocation lease and resolves only after queued work is
 *   finished, native storage is destroyed and its charge is debited. Repeated
 *   calls must join or safely retry that same lease, never report success for
 *   an unretired allocation. A failed or unavailable fence must retain the
 *   charge until device invalidation or another proven-safe retirement.
 * - `unprepare` synchronously detaches the fallback registration after the
 *   final resident is retired, then resolves after its fallback is no longer
 *   in use and the fallback charge has been debited. Shared fallbacks require
 *   their own reference and fence accounting. On failure, retain the charge.
 *   An optional retry on its original receipt may only join or safely retry
 *   that same fallback; it must not depend on the detached registration.
 * - Loss listeners fire only after native invalidation and ledger cleanup.
 *   Restoration uses a new generation. Retiring an allocation that completed
 *   after invalidation must be safe and idempotent.
 *
 * A backend must preserve this contract for all callers sharing the ledger.
 * This controller is exclusive for its `device`, but other non-streaming
 * allocations may still compete for the same budget.
 */
export interface TextureResidencyAdapter<Mip, Allocation> {
  readonly device: object;
  generation(): number;
  isLost(): boolean;
  usageBytes(): number;
  acquireBudgetLimit(maxBytes: number): TextureResidencyBudgetLimit;
  estimate(source: TextureResidencySource<Mip>, levelCount: number): number;
  prepare(source: TextureResidencySource<Mip>, options: { readonly maxBytes: number; readonly generation: number }): void;
  allocate(
    source: TextureResidencySource<Mip>,
    levels: readonly { readonly level: number; readonly value: Mip }[],
    options: { readonly maxBytes: number; readonly signal: AbortSignal }
  ): Promise<TextureResidencyAllocation<Allocation>>;
  publish(texture: object, allocation: Allocation | null, generation: number): void;
  retire(allocation: Allocation): Promise<void>;
  unprepare(source: TextureResidencySource<Mip>, generation: number): TextureResidencyUnprepareReceipt;
  onDeviceLost(listener: () => void): () => void;
  onDeviceRestored(listener: () => void): () => void;
}

export type TextureResidencyUnprepareReceipt = Promise<void> & {
  readonly retry?: () => Promise<void>;
};

export interface TextureResidencyBudgetLimit {
  setLimit(maxBytes: number): void;
  release(): void;
}

export interface TextureResidencyDemand {
  readonly distanceMeters: number;
  readonly priority?: number;
}

export interface TextureResidencyLease {
  updateDemand(demand: TextureResidencyDemand): void;
  release(): void;
  /** Resolves when this released consumer can safely relinquish its source. */
  whenReleased(): Promise<void>;
}

export interface TextureResidencyEntrySnapshot {
  readonly texture: object;
  readonly label?: string;
  readonly consumers: number;
  readonly desiredLevels: number;
  readonly residentLevels: number;
  readonly residentBytes: number;
  readonly status: "lost" | "error" | "loading" | "resident" | "waiting-budget" | "evicted";
  readonly error?: unknown;
}

export interface TextureResidencySnapshot {
  readonly budgetBytes: number;
  /** Authoritative device-ledger bytes, not the planner's requested bytes. */
  readonly usedBytes: number;
  readonly residentBytes: number;
  readonly retiringBytes: number;
  readonly entries: readonly TextureResidencyEntrySnapshot[];
  readonly error?: unknown;
}

interface Consumer {
  demand: TextureResidencyDemand;
  removeAbort?: () => void;
  released: boolean;
  outcome?: { readonly error?: unknown; readonly failed: boolean };
  readonly waiters: Set<{ readonly resolve: () => void; readonly reject: (error: unknown) => void }>;
}

interface Resident<Allocation> {
  readonly allocation: Allocation;
  readonly levels: number;
  readonly bytes: number;
}

interface Operation {
  readonly target: number;
  readonly generation: number;
  readonly abort: AbortController;
  reservedBytes: number;
}

interface Entry<Mip, Allocation> {
  readonly source: TextureResidencySource<Mip>;
  readonly levels: readonly TextureResidencyMip[];
  readonly serial: number;
  readonly consumers: Set<Consumer>;
  readonly releasing: Set<Consumer>;
  target: number;
  preparedGeneration?: number;
  pendingRetirements: number;
  pendingOperations: number;
  pendingUnpreparations: number;
  readonly sourceCleanupFailures: { readonly mip: TextureResidencyLoadedMip<Mip>; readonly error: unknown }[];
  readonly consumerCleanupFailures: unknown[];
  publicationFailure?: { readonly error: unknown };
  unpublishing?: boolean;
  unprepareFailure?: { readonly error: unknown };
  unpreparing?: boolean;
  readonly unpreparationFailures: UnpreparationFailure[];
  /** Target to rebuild after making room by retiring an older allocation. */
  resumeLevels?: number;
  current?: Resident<Allocation>;
  operation?: Operation;
  failed: boolean;
  error?: unknown;
}

interface Retirement<Mip, Allocation> {
  readonly bytes: number;
  readonly entry: Entry<Mip, Allocation>;
  pending: boolean;
  failure?: { readonly error: unknown };
}

interface Unpreparation<Mip, Allocation> {
  readonly entry: Entry<Mip, Allocation>;
  active: boolean;
}

interface UnpreparationFailure {
  error: unknown;
  readonly retry?: () => Promise<void>;
  pending?: boolean;
}

const deviceControllers = new WeakMap<object, object>();

/**
 * Coordinates one device's consumers and real backend allocations. Calling
 * `reconcile` schedules work; it does not wait for a possibly missing fence.
 * `whenSettled` is an optional, abortable wait for all outstanding work.
 */
export class TextureResidencyController<Mip, Allocation extends object> {
  private readonly entries = new Map<object, Entry<Mip, Allocation>>();
  private readonly retirements = new Map<Allocation, Retirement<Mip, Allocation>>();
  private readonly operations = new Set<Operation>();
  private readonly unpreparations = new Set<Unpreparation<Mip, Allocation>>();
  private readonly waiters = new Set<() => void>();
  private readonly disposalWaiters = new Set<() => void>();
  private readonly changeListeners = new Set<() => void>();
  private readonly unsubscribeLoss: () => void;
  private readonly unsubscribeRestore: () => void;
  private readonly budgetLimit: TextureResidencyBudgetLimit;
  private readonly terminalCleanupFailures: unknown[] = [];
  private budgetLimitReleaseAttempted = false;
  private budgetLimitReleased = false;
  private subscriptionsCleanupAttempted = false;
  private nextSerial = 0;
  private scheduled = false;
  private planDirty = true;
  private disposed = false;
  private disposing = false;
  private rebalanceFailure?: { readonly error: unknown };
  private error: unknown;
  private budgetBytes: number;

  constructor(private readonly adapter: TextureResidencyAdapter<Mip, Allocation>, options: { readonly budgetBytes: number }) {
    assertObject(adapter.device, "device");
    this.budgetBytes = checkedBytes(options.budgetBytes, "budgetBytes");
    if (deviceControllers.has(adapter.device)) throw new Error("A texture residency controller already owns this device");
    deviceControllers.set(adapter.device, this);
    let unsubscribeLoss: (() => void) | undefined;
    let budgetLimit: TextureResidencyBudgetLimit | undefined;
    try {
      budgetLimit = adapter.acquireBudgetLimit(this.budgetBytes);
      this.budgetLimit = budgetLimit;
      unsubscribeLoss = adapter.onDeviceLost(() => this.handleDeviceLoss());
      this.unsubscribeRestore = adapter.onDeviceRestored(() => this.handleDeviceRestore());
      this.unsubscribeLoss = unsubscribeLoss;
    } catch (error) {
      try { unsubscribeLoss?.(); } catch { /* Preserve the registration error. */ }
      try { budgetLimit?.release(); } catch { /* Preserve the registration error. */ }
      deviceControllers.delete(adapter.device);
      throw error;
    }
  }

  acquire(source: TextureResidencySource<Mip>, demand: TextureResidencyDemand, signal?: AbortSignal): TextureResidencyLease {
    this.assertOpen();
    if (signal?.aborted) throw abortReason(signal);
    assertObject(source.texture, "texture");
    assertObject(source.identity, "identity");
    const levels = validateLevels(source.levels);
    const fallback = validateFallback(source.fallback);
    const normalized = validateDemand(demand);
    let entry = this.entries.get(source.texture);
    if (entry) {
      if (entry.source.identity !== source.identity || !sameLevels(entry.levels, levels) || !sameFallback(entry.source.fallback, fallback)) {
        throw new Error("Texture residency source identity, fallback or mip metadata differs for an existing texture");
      }
    } else {
      const stableSource: TextureResidencySource<Mip> = {
        texture: source.texture, identity: source.identity,
        ...(source.label === undefined ? {} : { label: source.label }),
        levels, fallback, loadMip: (level, abort) => source.loadMip(level, abort)
      };
      entry = {
        source: stableSource, levels, serial: this.nextSerial++, consumers: new Set(), releasing: new Set(),
        target: 0, pendingRetirements: 0, pendingOperations: 0, pendingUnpreparations: 0,
        sourceCleanupFailures: [], consumerCleanupFailures: [], unpreparationFailures: [], failed: false
      };
      if (!this.adapter.isLost()) this.prepare(entry);
      this.entries.set(source.texture, entry);
    }
    if (!this.adapter.isLost() && entry.preparedGeneration === undefined) this.prepare(entry);
    const held = entry;
    const consumer: Consumer = { demand: normalized, released: false, waiters: new Set() };
    held.consumers.add(consumer);
    // A new holder takes responsibility for the shared source, so earlier
    // released consumers need not wait for that source's device resources.
    this.rejectReleasingOnCleanupError(held);
    this.resolveReleasing(held);
    const release = (): void => {
      this.releaseConsumer(held, consumer);
    };
    if (signal) {
      signal.addEventListener("abort", release, { once: true });
      consumer.removeAbort = () => signal.removeEventListener("abort", release);
      if (signal.aborted) release();
    }
    this.clearFailure(held);
    this.schedule();
    return {
      updateDemand: (next) => {
        if (consumer.released || this.disposed) throw new Error("Texture residency lease has been released");
        const normalizedDemand = validateDemand(next);
        if (sameDemand(consumer.demand, normalizedDemand)) return;
        consumer.demand = normalizedDemand;
        if (held.preparedGeneration !== undefined) this.clearFailure(held);
        this.schedule();
      },
      release,
      whenReleased: () => waitForConsumer(consumer)
    };
  }

  setBudget(bytes: number): void {
    this.assertOpen();
    const next = checkedBytes(bytes, "budgetBytes");
    this.budgetLimit.setLimit(next);
    this.budgetBytes = next;
    this.reconcile();
  }

  /** Observe actual binding changes and device transitions, not planner output. */
  onChange(listener: () => void): () => void {
    this.assertOpen();
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  /** Retry failed work and re-read external device budget usage. */
  reconcile(): void {
    this.assertOpen();
    this.error = undefined;
    for (const entry of this.entries.values()) {
      this.clearFailure(entry);
      if (!this.adapter.isLost() && entry.consumers.size > 0 && entry.preparedGeneration === undefined) {
        try { this.prepare(entry); } catch (error) { entry.failed = true; entry.error = error; }
      }
    }
    this.retryFailedUnpreparations();
    this.schedule();
  }

  snapshot(): TextureResidencySnapshot {
    const usedBytes = checkedBytes(this.adapter.usageBytes(), "device usage");
    const lost = this.adapter.isLost();
    const failures = this.cleanupFailures();
    const error = failures.length ? combineFailures(failures, "Texture residency cleanup failed") : this.error;
    const entries = [...this.entries.values()].map((entry): TextureResidencyEntrySnapshot => ({
      texture: entry.source.texture,
      ...(entry.source.label === undefined ? {} : { label: entry.source.label }),
      consumers: entry.consumers.size,
      desiredLevels: entry.target,
      residentLevels: entry.current?.levels ?? 0,
      residentBytes: entry.current?.bytes ?? 0,
      status: lost ? "lost" : entry.failed ? "error" : entry.operation ? "loading" : entry.current ? "resident" : entry.target ? "waiting-budget" : "evicted",
      ...(entry.error === undefined ? {} : { error: entry.error })
    }));
    return {
      budgetBytes: this.budgetBytes,
      usedBytes,
      residentBytes: entries.reduce((sum, entry) => sum + entry.residentBytes, 0),
      retiringBytes: [...this.retirements.values()].reduce((sum, retirement) => sum + retirement.bytes, 0),
      entries,
      ...(error === undefined ? {} : { error })
    };
  }

  /** Wait for pending loads, uploads and retirement fences. A blocked budget is settled. */
  whenSettled(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    if (this.isSettled()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const done = (): void => { cleanup(); resolve(); };
      const abort = (): void => { cleanup(); reject(abortReason(signal!)); };
      const cleanup = (): void => { this.waiters.delete(done); signal?.removeEventListener("abort", abort); };
      this.waiters.add(done);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      else this.notifyWaiters();
    });
  }

  /**
   * Observe this controller's disposal without waiting behind unrelated
   * retirements after one cleanup has failed. A successful result proves that
   * every owned source and allocation, including fallback fences, is retired.
   */
  whenDisposed(): Promise<void> {
    if (!this.disposed) return Promise.reject(new Error("Texture residency controller is not disposed"));
    return new Promise<void>((resolve, reject) => {
      const check = (): void => {
        const failures = this.cleanupFailures();
        if (failures.length) {
          this.disposalWaiters.delete(check);
          reject(combineFailures(failures, "Texture residency cleanup failed"));
        } else if (this.disposalComplete()) {
          this.disposalWaiters.delete(check);
          resolve();
        }
      };
      this.disposalWaiters.add(check);
      check();
    });
  }

  /** Cancel subscriptions and safely retire committed allocations. Idempotent. */
  dispose(): void {
    if (this.disposing) return;
    if (this.disposed && !this.hasRetryableFailures()) return;
    this.disposing = true;
    try {
      if (!this.disposed) {
        this.disposed = true;
        this.changeListeners.clear();
        for (const entry of this.entries.values()) {
          for (const consumer of entry.consumers) {
            consumer.released = true;
            try { consumer.removeAbort?.(); } catch (error) { entry.consumerCleanupFailures.push(error); }
            entry.releasing.add(consumer);
          }
          entry.consumers.clear();
          this.cancelOperation(entry);
          this.clearFailure(entry);
          this.rejectReleasingOnCleanupError(entry);
        }
      } else {
        // Only a failed binding switch is repeated. Successful switches and
        // in-flight allocations/fences remain untouched.
        for (const entry of this.entries.values()) {
          if (entry.publicationFailure) this.clearFailure(entry);
        }
      }
      this.retryFailedRetirements();
      this.retryFailedUnpreparations();
      // Unpublish synchronously before an app tears down its device; fence
      // waits and late work continue independently in the background.
      this.planDirty = true;
      this.rebalanceSafely();
      if (!this.budgetLimitReleaseAttempted) {
        this.budgetLimitReleaseAttempted = true;
        try {
          this.budgetLimit.release();
          this.budgetLimitReleased = true;
        } catch (error) {
          // This one-shot lease has no retry contract if release throws.
          this.terminalCleanupFailures.push(error);
        }
      }
      this.schedule();
    } finally {
      this.disposing = false;
      this.notifyWaiters();
    }
  }

  private releaseConsumer(entry: Entry<Mip, Allocation>, consumer: Consumer): void {
    if (consumer.released) return;
    consumer.released = true;
    try { consumer.removeAbort?.(); } catch (error) { entry.consumerCleanupFailures.push(error); }
    entry.consumers.delete(consumer);
    if (entry.consumers.size > 0) {
      const failures = this.entryCleanupFailures(entry);
      if (failures.length) settleConsumer(consumer, combineFailures(failures, "Texture residency cleanup failed"));
      else settleConsumer(consumer);
    } else {
      entry.releasing.add(consumer);
      this.cancelOperation(entry);
      this.clearFailure(entry);
      // Prevent a still-mounted draw from retaining the actor's old texture
      // while its final release waits on GPU work.
      if (!this.adapter.isLost()) this.unpublish(entry);
      this.rejectReleasingOnCleanupError(entry);
    }
    this.schedule();
  }

  private resolveReleasing(entry: Entry<Mip, Allocation>): void {
    for (const consumer of entry.releasing) settleConsumer(consumer);
    entry.releasing.clear();
  }

  private rejectReleasingOnCleanupError(entry: Entry<Mip, Allocation>): void {
    const failures = this.entryCleanupFailures(entry);
    if (!failures.length) return;
    const error = combineFailures(failures, "Texture residency cleanup failed");
    for (const consumer of entry.releasing) settleConsumer(consumer, error);
    entry.releasing.clear();
  }

  private schedule(): void {
    this.planDirty = true;
    if (this.scheduled) return;
    this.scheduled = true;
    void Promise.resolve().then(() => {
      this.scheduled = false;
      this.rebalanceSafely();
      this.notifyWaiters();
    });
  }

  private rebalanceSafely(): void {
    const previous = this.rebalanceFailure;
    try {
      this.rebalance();
      this.rebalanceFailure = undefined;
      if (previous && Object.is(this.error, previous.error)) this.error = undefined;
    } catch (error) {
      this.error = error;
      if (this.disposed) this.rebalanceFailure = { error };
    }
  }

  private rebalance(): void {
    if (this.adapter.isLost()) {
      this.finishReleasedEntries();
      return;
    }
    this.updateTargets();
    // Free lower-priority or oversized representations before admitting new ones.
    const work = [...this.entries.values()].sort((a, b) => {
      const aDrop = (a.current?.levels ?? 0) > a.target ? 0 : 1;
      const bDrop = (b.current?.levels ?? 0) > b.target ? 0 : 1;
      return aDrop - bDrop || a.serial - b.serial;
    });
    for (const entry of work) {
      if (entry.operation || entry.failed || (entry.current?.levels ?? 0) === entry.target) continue;
      if (entry.target === 0) {
        entry.resumeLevels = undefined;
        this.unpublish(entry);
      } else {
        const currentLevels = entry.current?.levels ?? 0;
        const nextLevels = currentLevels === 0 && entry.resumeLevels !== undefined
          ? Math.min(entry.resumeLevels, entry.target)
          : currentLevels < entry.target ? currentLevels + 1 : entry.target;
        // Give every funded consumer a coarse representation before refining
        // another one. An unsupported or failed entry does not block the rest.
        if (nextLevels > 1 && currentLevels < entry.target && [...this.entries.values()].some((other) =>
          other !== entry && other.target > 0 && !other.current && !other.failed &&
          (currentLevels > 0 || other.serial < entry.serial)
        )) continue;
        const estimate = this.estimate(entry, nextLevels);
        const currentUsage = checkedBytes(this.adapter.usageBytes(), "device usage");
        if (estimate > this.budgetBytes - currentUsage) {
          if (entry.current) { entry.resumeLevels = nextLevels; this.unpublish(entry); }
          continue;
        }
        this.startOperation(entry, nextLevels);
      }
    }
    this.finishReleasedEntries();
    this.cleanupDisposed();
  }

  private finishReleasedEntries(): void {
    for (const [texture, entry] of this.entries) {
      if (entry.consumers.size || entry.current || entry.operation || entry.pendingRetirements || entry.pendingOperations) continue;
      // A lost flag alone is not proof that the backend has invalidated this
      // generation; its loss callback is the confirmed cleanup boundary.
      if (this.adapter.isLost() && entry.preparedGeneration !== undefined) continue;
      if (entry.unprepareFailure || entry.unpreparing) continue;
      if (entry.preparedGeneration !== undefined && !this.adapter.isLost() && !this.unprepare(entry)) continue;
      // Adapter callbacks may acquire or release a new consumer reentrantly.
      if (entry.consumers.size || entry.current || entry.operation || entry.preparedGeneration !== undefined ||
          entry.pendingRetirements || entry.pendingOperations || entry.pendingUnpreparations) continue;
      this.rejectReleasingOnCleanupError(entry);
      // Keep failed CPU/fallback cleanup owned even if no work is currently
      // running. A rejected fence is not evidence that its source is safe.
      if (this.entryCleanupFailures(entry).length) continue;
      this.resolveReleasing(entry);
      this.entries.delete(texture);
    }
    this.cleanupDisposed();
  }

  /** Recompute targets before asynchronous completions may publish. */
  private updateTargets(): void {
    if (!this.planDirty) return;
    const usage = checkedBytes(this.adapter.usageBytes(), "device usage");
    const currentBytes = [...this.entries.values()].reduce((sum, entry) => sum + (entry.current?.bytes ?? 0), 0);
    const retiringBytes = [...this.retirements.values()].reduce((sum, retirement) => sum + retirement.bytes, 0);
    const reservedBytes = [...this.operations].reduce((sum, operation) => sum + operation.reservedBytes, 0);
    const otherBytes = Math.max(0, usage - currentBytes - retiringBytes - reservedBytes);
    const available = Math.max(0, this.budgetBytes - otherBytes);
    const entries = [...this.entries.values()].filter((entry) => entry.consumers.size > 0);
    for (const entry of entries) {
      if (entry.preparedGeneration !== this.adapter.generation()) {
        entry.failed = true;
        entry.error ??= new Error("Texture residency fallback is not prepared for this device generation");
      }
    }
    entries.sort(compareEntries);
    const desired = new Map<Entry<Mip, Allocation>, number>(entries.map((entry) => [entry, entry.failed ? entry.current?.levels ?? 0 : 0]));
    // A failed replacement keeps its previously published allocation. Count
    // that allocation while planning other entries until an explicit retry.
    let planned = entries.reduce((sum, entry) => sum + (entry.failed ? entry.current?.bytes ?? 0 : 0), 0);
    const maxLevels = entries.reduce((maximum, entry) => Math.max(maximum, entry.levels.length), 0);
    for (let count = 1; count <= maxLevels; count += 1) {
      for (const entry of entries) {
        if (entry.failed || count > entry.levels.length || desired.get(entry) !== count - 1) continue;
        try {
          const bytes = this.estimate(entry, count);
          const previous = count === 1 ? 0 : this.estimate(entry, count - 1);
          if (bytes < previous) throw new Error("Texture residency estimates must be monotonic");
          if (planned + bytes - previous <= available) {
            planned += bytes - previous;
            desired.set(entry, count);
          }
        } catch (error) { entry.failed = true; entry.error = error; }
      }
    }
    for (const entry of this.entries.values()) {
      const target = desired.get(entry) ?? 0;
      if (entry.operation && !operationFits(entry, entry.operation, target)) this.cancelOperation(entry);
      entry.target = target;
    }
    this.planDirty = false;
  }

  private startOperation(entry: Entry<Mip, Allocation>, target: number): void {
    const operation: Operation = { target, generation: this.adapter.generation(), abort: new AbortController(), reservedBytes: 0 };
    entry.operation = operation;
    entry.pendingOperations += 1;
    this.operations.add(operation);
    void this.runOperation(entry, operation).finally(() => {
      this.operations.delete(operation);
      entry.pendingOperations -= 1;
      if (entry.operation === operation) entry.operation = undefined;
      this.schedule();
    });
  }

  private async runOperation(entry: Entry<Mip, Allocation>, operation: Operation): Promise<void> {
    const loaded: { readonly level: number; readonly mip: TextureResidencyLoadedMip<Mip> }[] = [];
    let allocated: TextureResidencyAllocation<Allocation> | undefined;
    try {
      // Fetch coarse first but hand the backend the standard finest-first tail.
      for (let level = entry.levels.length - 1; level >= entry.levels.length - operation.target; level -= 1) {
        const mip = await entry.source.loadMip(level, operation.abort.signal);
        loaded.push({ level, mip });
        if (!this.operationIsCurrent(entry, operation)) return;
      }
      const estimate = this.estimate(entry, operation.target);
      if (checkedBytes(this.adapter.usageBytes(), "device usage") + estimate > this.budgetBytes) return;
      operation.reservedBytes = estimate;
      const levels = loaded.slice().reverse().map(({ level, mip }) => ({ level, value: mip.value }));
      allocated = await this.adapter.allocate(entry.source, levels, { maxBytes: this.budgetBytes, signal: operation.abort.signal });
      operation.reservedBytes = 0;
      const actualBytes = checkedBytes(allocated.bytes, "allocation bytes");
      if (actualBytes !== estimate) throw new Error("Texture residency allocation charge differs from its estimate");
      if (!this.operationIsCurrent(entry, operation)) return;
      this.adapter.publish(entry.source.texture, allocated.allocation, operation.generation);
      // A backend callback may synchronously lose the device during publish.
      // Never install a resource from that invalidated generation.
      if (this.adapter.isLost() || operation.generation !== this.adapter.generation()) return;
      const previous = entry.current;
      entry.current = { allocation: allocated.allocation, bytes: actualBytes, levels: operation.target };
      entry.resumeLevels = undefined;
      allocated = undefined;
      if (previous) this.retire(previous, entry);
      // A synchronous adapter callback may have released the final consumer
      // during publication. Remove the new binding before leaving this turn.
      if (this.disposed || entry.consumers.size === 0) this.unpublish(entry);
      else this.emitChange();
    } catch (error) {
      if (this.operationIsCurrent(entry, operation)) { entry.failed = true; entry.error = error; }
    } finally {
      operation.reservedBytes = 0;
      if (allocated) this.retire({ allocation: allocated.allocation, bytes: allocated.bytes, levels: operation.target }, entry);
      for (const item of loaded) {
        try { item.mip.release(); } catch (error) {
          // release() is a one-shot source callback with no retry contract.
          // Retain the actual resource as well as the original failure.
          entry.sourceCleanupFailures.push({ mip: item.mip, error });
          this.rejectReleasingOnCleanupError(entry);
          this.notifyWaiters();
        }
      }
    }
  }

  private unpublish(entry: Entry<Mip, Allocation>): void {
    if (!entry.current || entry.unpublishing) return;
    entry.unpublishing = true;
    try {
      const previous = entry.current;
      const generation = this.adapter.generation();
      // A reentrant observer belongs to this attempt, not the old failure.
      entry.publicationFailure = undefined;
      this.adapter.publish(entry.source.texture, null, generation);
      if (this.adapter.isLost() || generation !== this.adapter.generation() || entry.current !== previous) return;
      entry.current = undefined;
      entry.publicationFailure = undefined;
      this.retire(previous, entry);
      this.emitChange();
    } catch (error) {
      entry.failed = true; entry.error = error; entry.publicationFailure = { error };
      this.rejectReleasingOnCleanupError(entry);
      this.notifyWaiters();
    } finally {
      entry.unpublishing = false;
      this.notifyWaiters();
    }
  }

  private retire(resident: Resident<Allocation>, entry: Entry<Mip, Allocation>): void {
    if (this.retirements.has(resident.allocation)) return;
    const retirement: Retirement<Mip, Allocation> = { bytes: resident.bytes, entry, pending: false };
    this.retirements.set(resident.allocation, retirement);
    entry.pendingRetirements += 1;
    this.startRetirement(resident.allocation, retirement);
  }

  private retryFailedRetirements(): void {
    for (const [allocation, retirement] of [...this.retirements]) {
      if (!retirement.pending && retirement.failure) this.startRetirement(allocation, retirement);
    }
  }

  private startRetirement(allocation: Allocation, retirement: Retirement<Mip, Allocation>): void {
    if (retirement.pending || this.retirements.get(allocation) !== retirement) return;
    const { entry } = retirement;
    retirement.pending = true;
    retirement.failure = undefined;
    let pending: Promise<void>;
    try { pending = this.adapter.retire(allocation); }
    catch (error) {
      retirement.pending = false;
      retirement.failure = { error };
      this.rejectReleasingOnCleanupError(entry);
      this.notifyWaiters();
      return;
    }
    void Promise.resolve(pending).then(() => {
      if (this.retirements.get(allocation) !== retirement) return;
      this.retirements.delete(allocation);
      entry.pendingRetirements -= 1;
      this.schedule();
    }, (error: unknown) => {
      if (this.retirements.get(allocation) !== retirement) return;
      // Failure proves no release. The adapter must preserve the charge and
      // supply a safe receipt if an explicit retry can finish this allocation.
      retirement.pending = false;
      retirement.failure = { error };
      this.rejectReleasingOnCleanupError(entry);
      this.notifyWaiters();
    });
  }

  private operationIsCurrent(entry: Entry<Mip, Allocation>, operation: Operation): boolean {
    const active = !this.disposed && !this.adapter.isLost() && !operation.abort.signal.aborted &&
      this.entries.get(entry.source.texture) === entry && entry.operation === operation &&
      entry.consumers.size > 0 && entry.preparedGeneration === operation.generation && operation.generation === this.adapter.generation();
    if (!active) return false;
    try { this.updateTargets(); }
    catch (error) { this.error = error; return false; }
    return entry.operation === operation && operationFits(entry, operation, entry.target);
  }

  private cancelOperation(entry: Entry<Mip, Allocation>): void {
    const operation = entry.operation;
    if (!operation) return;
    entry.operation = undefined;
    operation.abort.abort();
  }

  private handleDeviceLoss(): void {
    for (const entry of this.entries.values()) {
      this.cancelOperation(entry);
      entry.current = undefined;
      entry.resumeLevels = undefined;
      entry.preparedGeneration = undefined;
      entry.pendingRetirements = 0;
      entry.publicationFailure = undefined;
      entry.unprepareFailure = undefined;
      entry.unpreparationFailures.length = 0;
      this.clearFailure(entry);
    }
    for (const operation of this.operations) operation.reservedBytes = 0;
    this.retirements.clear();
    for (const token of this.unpreparations) {
      token.active = false;
      token.entry.pendingUnpreparations -= 1;
    }
    this.unpreparations.clear();
    this.error = undefined;
    this.emitChange();
    this.schedule();
    this.notifyWaiters();
  }

  private handleDeviceRestore(): void {
    if (this.disposed) return;
    for (const entry of this.entries.values()) {
      this.clearFailure(entry);
      if (entry.consumers.size > 0) {
        try { this.prepare(entry); } catch (error) { entry.failed = true; entry.error = error; }
      }
    }
    this.emitChange();
    this.schedule();
  }

  private prepare(entry: Entry<Mip, Allocation>): void {
    const generation = this.adapter.generation();
    this.adapter.prepare(entry.source, { maxBytes: this.budgetBytes, generation });
    entry.preparedGeneration = generation;
  }

  private unprepare(entry: Entry<Mip, Allocation>): boolean {
    const generation = entry.preparedGeneration;
    if (generation === undefined) return true;
    if (entry.unpreparing) return false;
    entry.unpreparing = true;
    // Publish the in-flight operation before an adapter callback can reenter
    // acquisition, disposal or confirmed loss. A new consumer must prepare a
    // new fallback rather than relying on the one being detached.
    entry.preparedGeneration = undefined;
    const token: Unpreparation<Mip, Allocation> = { entry, active: true };
    entry.pendingUnpreparations += 1;
    this.unpreparations.add(token);
    let completion: TextureResidencyUnprepareReceipt;
    try { completion = this.adapter.unprepare(entry.source, generation); }
    catch (error) {
      if (token.active) {
        token.active = false;
        this.unpreparations.delete(token);
        entry.pendingUnpreparations -= 1;
      }
      // A throw may happen after detachment. There is no fallback allocation
      // handle in this contract with which to prove a safe retry. Even if loss
      // reentered, the throw may report a separate one-shot cleanup failure.
      entry.failed = true; entry.error = error; entry.unprepareFailure = { error };
      this.rejectReleasingOnCleanupError(entry);
      this.notifyWaiters();
      return false;
    } finally {
      entry.unpreparing = false;
    }
    let retry: (() => Promise<void>) | undefined;
    let receiptFailure: { readonly error: unknown } | undefined;
    try {
      const method = completion.retry;
      if (typeof method === "function") retry = () => method.call(completion);
    } catch (error) {
      receiptFailure = { error };
    }
    if (!token.active) {
      // A confirmed loss invalidated this operation while the adapter ran.
      void Promise.resolve(completion).catch(() => undefined);
      return true;
    }
    void Promise.resolve(completion).then(() => {
      if (!token.active) return;
      token.active = false;
      this.unpreparations.delete(token);
      entry.pendingUnpreparations -= 1;
      this.schedule();
    }, (error: unknown) => {
      if (!token.active) return;
      token.active = false;
      this.unpreparations.delete(token);
      entry.pendingUnpreparations -= 1;
      // Never repeat unprepare() against a potentially replaced registration.
      // Only the original receipt can identify a safe retry of this fallback.
      entry.unpreparationFailures.push({ error, retry });
      if (receiptFailure) entry.unpreparationFailures.push(receiptFailure);
      this.rejectReleasingOnCleanupError(entry);
      this.schedule();
      this.notifyWaiters();
    });
    return true;
  }

  private retryFailedUnpreparations(): void {
    for (const entry of [...this.entries.values()]) {
      for (const failure of [...entry.unpreparationFailures]) {
        const retry = failure.retry;
        if (!retry || failure.pending || !entry.unpreparationFailures.includes(failure)) continue;
        // Publish this attempt before the receipt can reenter disposal or loss.
        failure.pending = true;
        const token: Unpreparation<Mip, Allocation> = { entry, active: true };
        entry.pendingUnpreparations += 1;
        this.unpreparations.add(token);
        const failed = (error: unknown): void => {
          if (!token.active) return;
          token.active = false;
          this.unpreparations.delete(token);
          entry.pendingUnpreparations -= 1;
          failure.pending = false;
          failure.error = error;
          this.rejectReleasingOnCleanupError(entry);
          this.schedule();
          this.notifyWaiters();
        };
        let completion: Promise<void>;
        try { completion = retry(); }
        catch (error) { failed(error); continue; }
        void Promise.resolve(completion).then(() => {
          if (!token.active) return;
          token.active = false;
          this.unpreparations.delete(token);
          entry.pendingUnpreparations -= 1;
          const index = entry.unpreparationFailures.indexOf(failure);
          if (index !== -1) entry.unpreparationFailures.splice(index, 1);
          this.schedule();
        }, failed);
      }
    }
  }

  private estimate(entry: Entry<Mip, Allocation>, levels: number): number {
    const bytes = checkedBytes(this.adapter.estimate(entry.source, levels), "allocation estimate");
    if (bytes === 0) throw new Error("Texture residency allocation estimate must be positive");
    return bytes;
  }

  private clearFailure(entry: Entry<Mip, Allocation>): void { entry.failed = false; entry.error = undefined; }

  private emitChange(): void {
    if (this.disposed) return;
    for (const listener of [...this.changeListeners]) {
      try { listener(); } catch { /* One observer cannot interrupt device cleanup. */ }
    }
  }

  private entryCleanupFailures(entry: Entry<Mip, Allocation>): unknown[] {
    const failures: unknown[] = [];
    for (const failure of entry.sourceCleanupFailures) appendFailure(failures, failure.error);
    for (const failure of entry.consumerCleanupFailures) appendFailure(failures, failure);
    if (entry.publicationFailure) appendFailure(failures, entry.publicationFailure.error);
    if (entry.unprepareFailure) appendFailure(failures, entry.unprepareFailure.error);
    for (const failure of entry.unpreparationFailures) if (!failure.pending) appendFailure(failures, failure.error);
    for (const retirement of this.retirements.values()) {
      if (retirement.entry === entry && retirement.failure) appendFailure(failures, retirement.failure.error);
    }
    return failures;
  }

  private cleanupFailures(): unknown[] {
    const failures: unknown[] = [];
    for (const error of this.terminalCleanupFailures) appendFailure(failures, error);
    if (this.rebalanceFailure) appendFailure(failures, this.rebalanceFailure.error);
    for (const entry of this.entries.values()) {
      for (const error of this.entryCleanupFailures(entry)) appendFailure(failures, error);
    }
    return failures;
  }

  private hasRetryableFailures(): boolean {
    return !!this.rebalanceFailure ||
      [...this.entries.values()].some((entry) => !!entry.publicationFailure ||
        entry.unpreparationFailures.some((failure) => !!failure.retry && !failure.pending)) ||
      [...this.retirements.values()].some((retirement) => !retirement.pending && !!retirement.failure);
  }

  private cleanupDisposed(): void {
    if (!this.disposed || this.entries.size !== 0 || !this.budgetLimitReleased ||
        this.terminalCleanupFailures.length || this.subscriptionsCleanupAttempted ||
        deviceControllers.get(this.adapter.device) !== this) return;
    // Unsubscription callbacks, like the limit release, have no retry
    // contract after a partial throw. Do not repeat successful siblings.
    this.subscriptionsCleanupAttempted = true;
    try { this.unsubscribeLoss(); } catch (error) { this.terminalCleanupFailures.push(error); }
    try { this.unsubscribeRestore(); } catch (error) { this.terminalCleanupFailures.push(error); }
    if (this.terminalCleanupFailures.length) return;
    deviceControllers.delete(this.adapter.device);
  }

  private disposalComplete(): boolean {
    return !this.scheduled && this.entries.size === 0 && this.operations.size === 0 &&
      this.retirements.size === 0 && this.unpreparations.size === 0 && this.budgetLimitReleased &&
      deviceControllers.get(this.adapter.device) !== this;
  }

  private isSettled(): boolean {
    return !this.scheduled && this.operations.size === 0 && this.unpreparations.size === 0 &&
      ![...this.entries.values()].some((entry) => entry.unpublishing || entry.unpreparing) &&
      ![...this.retirements.values()].some((retirement) => retirement.pending);
  }

  private notifyWaiters(): void {
    for (const waiter of [...this.disposalWaiters]) waiter();
    if (this.isSettled()) for (const waiter of [...this.waiters]) waiter();
  }

  private assertOpen(): void { if (this.disposed) throw new Error("Texture residency controller is disposed"); }
}

function assertObject(value: unknown, name: string): asserts value is object {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) throw new Error(`Texture residency ${name} must be an object`);
}

function checkedBytes(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Texture residency ${name} must be a non-negative safe integer`);
  return value;
}

function validateDemand(demand: TextureResidencyDemand): TextureResidencyDemand {
  if (!Number.isFinite(demand.distanceMeters) || demand.distanceMeters < 0 || !Number.isFinite(demand.priority ?? 0)) {
    throw new Error("Texture residency demand requires a non-negative finite distance and finite priority");
  }
  return { distanceMeters: demand.distanceMeters, priority: demand.priority ?? 0 };
}

function validateLevels(input: readonly TextureResidencyMip[]): readonly TextureResidencyMip[] {
  if (!input.length) throw new Error("Texture residency requires at least one mip level");
  const levels = input.map((level) => ({ width: level.width, height: level.height, bytes: level.bytes }));
  for (let i = 0; i < levels.length; i += 1) {
    const level = levels[i]!;
    if (!Number.isSafeInteger(level.width) || level.width <= 0 || !Number.isSafeInteger(level.height) || level.height <= 0 || checkedBytes(level.bytes, "mip bytes") === 0) {
      throw new Error("Texture residency mip dimensions and bytes must be positive safe integers");
    }
    if (i > 0) {
      const previous = levels[i - 1]!;
      if ((previous.width === 1 && previous.height === 1) || level.width !== Math.max(1, Math.floor(previous.width / 2)) || level.height !== Math.max(1, Math.floor(previous.height / 2))) {
        throw new Error("Texture residency mips must be consecutive and ordered finest to coarsest");
      }
    }
  }
  return Object.freeze(levels.map((level) => Object.freeze(level)));
}

function sameLevels(a: readonly TextureResidencyMip[], b: readonly TextureResidencyMip[]): boolean {
  return a.length === b.length && a.every((level, i) => level.width === b[i]!.width && level.height === b[i]!.height && level.bytes === b[i]!.bytes);
}

function validateFallback(input: readonly [number, number, number, number]): readonly [number, number, number, number] {
  if (!Array.isArray(input) || input.length !== 4 || input.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new Error("Texture residency fallback must contain four RGBA bytes");
  }
  return Object.freeze([input[0], input[1], input[2], input[3]] as const);
}

function sameFallback(a: readonly number[], b: readonly number[]): boolean {
  return a.every((value, index) => value === b[index]);
}

function compareEntries<Mip, Allocation>(a: Entry<Mip, Allocation>, b: Entry<Mip, Allocation>): number {
  const left = bestDemand(a)!, right = bestDemand(b)!;
  return (right.priority ?? 0) - (left.priority ?? 0) || left.distanceMeters - right.distanceMeters || a.serial - b.serial;
}

function bestDemand<Mip, Allocation>(entry: Entry<Mip, Allocation>): TextureResidencyDemand | undefined {
  return [...entry.consumers].map((consumer) => consumer.demand)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.distanceMeters - right.distanceMeters)[0];
}

function sameDemand(left: TextureResidencyDemand | undefined, right: TextureResidencyDemand | undefined): boolean {
  return left === right || (!!left && !!right && left.distanceMeters === right.distanceMeters && left.priority === right.priority);
}

function operationFits<Mip, Allocation>(entry: Entry<Mip, Allocation>, operation: Operation, target: number): boolean {
  const currentLevels = entry.current?.levels ?? 0;
  return operation.target > currentLevels ? operation.target <= target : operation.target === target;
}

function settleConsumer(consumer: Consumer, ...failure: [] | [unknown]): void {
  if (consumer.outcome) return;
  consumer.outcome = failure.length ? { failed: true, error: failure[0] } : { failed: false };
  for (const waiter of consumer.waiters) {
    if (consumer.outcome.failed) waiter.reject(consumer.outcome.error);
    else waiter.resolve();
  }
  consumer.waiters.clear();
}

function waitForConsumer(consumer: Consumer): Promise<void> {
  if (consumer.outcome) return consumer.outcome.failed ? Promise.reject(consumer.outcome.error) : Promise.resolve();
  return new Promise<void>((resolve, reject) => { consumer.waiters.add({ resolve, reject }); });
}

function appendFailure(failures: unknown[], error: unknown): void {
  if (!failures.some((failure) => Object.is(failure, error))) failures.push(error);
}

function combineFailures(failures: readonly unknown[], message: string): unknown {
  return failures.length === 1 ? failures[0] : new AggregateError(failures, message, { cause: failures[0] });
}

function abortReason(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("Texture residency wait aborted");
  error.name = "AbortError";
  return error;
}
