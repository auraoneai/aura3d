/** A queue shared by native compute, copy and render work. */
export interface WebGPUInteropQueue {
  submit(commands: readonly unknown[]): void;
  onSubmittedWorkDone?(): Promise<void>;
}

export type WebGPUResourceAccessMode = "read" | "write" | "readwrite";
export interface WebGPUResourceAccess {
  readonly resource: object;
  readonly mode: WebGPUResourceAccessMode;
}

interface ResourceRecord {
  readonly destroy: () => void;
  readonly retryDestroy?: () => void;
  retired: boolean;
  destroying: boolean;
  fencePassed: boolean;
  fence?: RetirementFence;
  failure?: { readonly error: unknown };
  completion?: RetirementCompletion;
}

interface RetirementFence {
  state: "requesting" | "waiting" | "unavailable" | "failed" | "passed";
  error?: unknown;
}

interface RetirementCompletion {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
  state: "pending" | "resolved" | "rejected";
}

function retirementCompletion(): RetirementCompletion {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  // Several existing owners intentionally fire-and-forget retire(). Mark the
  // original promise handled without changing its rejected state for callers
  // that do await it; disposal/invalidation also reports retained failures.
  void promise.catch(() => {});
  return { promise, resolve, reject, state: "pending" };
}

// A native resource can be leased by only one device generation. Sharing a
// resource between compute and rendering means sharing that lease, not moving
// the handle between unrelated devices.
const owners = new WeakMap<object, WebGPUResourceInterop>();
// A destroyed native handle cannot be resurrected on this or another device.
// Weak keys avoid retaining a resource or its former device after retirement.
const destroyedResources = new WeakSet<object>();

/**
 * Manages native resources shared between compute and rendering on one queue.
 * WebGPU orders queue submissions and inserts the required transitions between
 * passes; there is no public manual barrier. `submit` validates leases before
 * enqueueing. `retire` makes a lease unusable immediately but waits for the
 * queue fence before destroying it, including earlier submissions made directly
 * on that same native queue. On device loss, `invalidate` attempts to release
 * all leases; failed destruction remains owned and is reported to the caller.
 */
export class WebGPUResourceInterop {
  private readonly resources = new Map<object, ResourceRecord>();
  private active = true;
  private invalidated = false;
  private destroying = 0;
  private sweeping = 0;
  private disposal?: Promise<void>;
  private disposalFailure?: { readonly error: unknown };
  private readonly settlementObservers = new Set<RetirementCompletion>();
  private readonly resourceSettlementObservers = new Map<object, Set<RetirementCompletion>>();
  private serial = 0;
  private submissionsInFlight = 0;
  private readonly deferredRetirements = new Set<object>();

  constructor(readonly queue: WebGPUInteropQueue, readonly generation: number) {
    if (!Number.isInteger(generation) || generation < 1) throw new Error("WEBGPU_INTEROP_INVALID_GENERATION");
  }

  get submissionSerial(): number { return this.serial; }
  get disposed(): boolean { return !this.active; }
  get liveResources(): number { return this.resources.size; }

  /**
   * A waiting fence has an interop-owned completion path. In contrast, a
   * fence still being requested, unavailable, or failed cannot yet release
   * its lease. Do not infer this from the queue's current method: it may have
   * changed since retirement, or the originally returned promise may reject.
   */
  get hasUnfencedRetirements(): boolean {
    if (this.invalidated) return false;
    for (const resource of this.resources.keys()) {
      if (this.hasUnfencedRetirement(resource)) return true;
    }
    return false;
  }

  hasUnfencedRetirement(resource: object): boolean {
    const record = this.resources.get(resource);
    return !this.invalidated && record !== undefined && record.retired && !record.fencePassed
      && record.fence?.state !== "waiting";
  }

  retirementFenceFailure(resource: object): { readonly error: unknown } | undefined {
    const fence = this.resources.get(resource)?.fence;
    return !this.invalidated && fence?.state === "failed" ? { error: fence.error } : undefined;
  }

  /** Actual fence failures, while their leases still await invalidation. */
  get retirementFenceErrors(): readonly unknown[] {
    if (this.invalidated) return [];
    const errors: unknown[] = [];
    for (const record of this.resources.values()) {
      if (record.fence?.state === "failed") errors.push(record.fence.error);
    }
    return errors;
  }

  /** Includes externally registered leases, not just device-owned wrappers. */
  get hasIncompleteDestruction(): boolean {
    if (this.destroying || (this.disposalFailure && this.resources.size > 0)) return true;
    for (const record of this.resources.values()) {
      if (record.failure) return true;
    }
    return false;
  }

  get retirementDestructionErrors(): readonly unknown[] {
    const errors: unknown[] = [];
    if (this.disposalFailure && this.resources.size > 0) errors.push(this.disposalFailure.error);
    for (const record of this.resources.values()) {
      if (record.failure) errors.push(record.failure.error);
    }
    return errors;
  }

  /**
   * Observe the current retirement sweep without changing any lease or
   * retrying a destructor. Individual retire() promises deliberately remain
   * pending after a failed fence, since only a later loss can make those
   * handles safe. A disposal observer must instead report that failure.
   */
  whenRetirementsSettled(): Promise<void> {
    const completion = retirementCompletion();
    this.settlementObservers.add(completion);
    this.notifySettlementObservers();
    return completion.promise;
  }

  /** A failure-reporting receipt for an individual lease without releasing it. */
  whenRetired(resource: object): Promise<void> {
    if (!this.resources.has(resource)) {
      return destroyedResources.has(resource)
        ? Promise.resolve()
        : Promise.reject(new Error("WEBGPU_INTEROP_FOREIGN_RESOURCE"));
    }
    const completion = retirementCompletion();
    let observers = this.resourceSettlementObservers.get(resource);
    if (!observers) {
      observers = new Set();
      this.resourceSettlementObservers.set(resource, observers);
    }
    observers.add(completion);
    this.notifySettlementObservers();
    return completion.promise;
  }

  owns(resource: object): boolean { return this.resources.has(resource); }

  /**
   * Register a device-owned resource; duplicate or cross-device leases fail.
   * `retryDestroy` is optional because a throwing destructor may have already
   * performed other, non-idempotent cleanup. It must complete all unfinished
   * cleanup safely after any partial failure, including a failed retry.
   */
  register<T extends object>(resource: T, destroy: () => void, options?: { readonly retryDestroy?: () => void }): T {
    this.assertActive();
    if (typeof destroy !== "function") throw new Error("WEBGPU_INTEROP_DESTROY_REQUIRED");
    const retryDestroy = options?.retryDestroy;
    if (retryDestroy !== undefined && typeof retryDestroy !== "function") {
      throw new Error("WEBGPU_INTEROP_RETRY_DESTROY_INVALID");
    }
    // Reading an options getter can reenter registration or invalidate this
    // owner. Check both invariants after reading it, before changing ownership.
    this.assertActive();
    if (owners.has(resource)) throw new Error("WEBGPU_INTEROP_RESOURCE_OWNED");
    if (destroyedResources.has(resource)) throw new Error("WEBGPU_INTEROP_RESOURCE_DESTROYED");
    owners.set(resource, this);
    this.resources.set(resource, {
      destroy, retryDestroy, retired: false, destroying: false, fencePassed: false
    });
    return resource;
  }

  assertUsable(resource: object): void {
    this.assertActive();
    const record = this.resources.get(resource);
    if (!record || owners.get(resource) !== this) throw new Error("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    if (record.retired) throw new Error("WEBGPU_INTEROP_RETIRED_RESOURCE");
  }

  /** Submit in queue order; accesses must belong to this live generation. */
  submit(commands: readonly unknown[], accesses: readonly WebGPUResourceAccess[] = []): number {
    this.assertActive();
    this.submissionsInFlight += 1;
    try {
      const resources: object[] = [];
      for (const access of accesses) {
        const mode = access.mode;
        if (mode !== "read" && mode !== "write" && mode !== "readwrite") {
          throw new Error("WEBGPU_INTEROP_INVALID_ACCESS");
        }
        const resource = access.resource;
        this.assertUsable(resource);
        resources.push(resource);
      }
      const submit = this.queue.submit;
      // Access and queue getters can reenter disposal after an earlier check.
      this.assertActive();
      for (const resource of resources) this.assertUsable(resource);
      Reflect.apply(submit, this.queue, [commands]);
      this.serial += 1;
      return this.serial;
    } finally {
      this.submissionsInFlight -= 1;
      if (!this.submissionsInFlight) {
        for (const resource of this.deferredRetirements) {
          this.deferredRetirements.delete(resource);
          const record = this.resources.get(resource);
          const completion = record?.completion;
          if (record && completion?.state === "pending" && !record.fence && !this.invalidated) {
            this.requestRetirementFence(resource, record, completion);
          }
        }
      }
    }
  }

  /** Wait until work submitted before this call has completed. */
  async wait(): Promise<void> {
    this.assertActive();
    if (!this.queue.onSubmittedWorkDone) throw new Error("WEBGPU_INTEROP_FENCE_UNAVAILABLE");
    await this.queue.onSubmittedWorkDone();
    this.assertActive();
  }

  /**
   * End a lease after a queue fence. Repeated retirement while pending returns
   * the same completion. A destruction failure rejects that completion and
   * retains the lease; a subsequent call retries only with `retryDestroy`.
   * Without a fence, retain the resource until invalidation rather than racing
   * queued GPU work.
   */
  retire(resource: object): Promise<void> {
    const record = this.resources.get(resource);
    if (!record || owners.get(resource) !== this) throw new Error("WEBGPU_INTEROP_FOREIGN_RESOURCE");
    if (record.completion?.state === "pending") return record.completion.promise;
    if (record.failure && !record.retryDestroy) {
      const completion = record.completion ?? retirementCompletion();
      record.completion = completion;
      this.rejectCompletion(completion, record.failure.error);
      return completion.promise;
    }
    record.retired = true;
    const completion = record.completion = retirementCompletion();
    // A reentrant retirement during the destructor observes that attempt,
    // rather than recursively destroying the same native handle.
    if (record.destroying) return completion.promise;
    if (record.fencePassed || this.invalidated) {
      try { this.destroyRecord(resource, record); } catch { /* Reported by completion. */ }
      return completion.promise;
    }
    // A structural queue can reenter disposal before its current submission
    // reaches the queue. A fence acquired on that stack would miss the work.
    if (this.submissionsInFlight) {
      this.deferredRetirements.add(resource);
      return completion.promise;
    }
    this.requestRetirementFence(resource, record, completion);
    return completion.promise;
  }

  private requestRetirementFence(resource: object, record: ResourceRecord, completion: RetirementCompletion): void {
    // Publish acquisition before touching an injected getter or method, either
    // of which can reenter retirement, disposal or invalidation.
    const fence: RetirementFence = { state: "requesting" };
    record.fence = fence;
    const current = (): boolean => !this.invalidated && this.resources.get(resource) === record
      && owners.get(resource) === this && record.completion === completion && completion.state === "pending"
      && record.fence === fence;
    let settled = false;
    const failFence = (error: unknown): void => {
      if (settled) return;
      settled = true;
      if (!current()) return;
      fence.state = "failed";
      fence.error = error;
      this.notifySettlementObservers();
    };
    const passFence = (): void => {
      if (settled) return;
      settled = true;
      // Invalidation may already have settled this attempt. A late fence
      // must not alter its state, retry a failure, or destroy a completed lease.
      if (!current()) return;
      fence.state = "passed";
      record.fencePassed = true;
      try { this.destroyRecord(resource, record); } catch { /* Reported by completion. */ }
    };
    try {
      const request = this.queue.onSubmittedWorkDone;
      if (!current()) return;
      if (typeof request !== "function") {
        fence.state = "unavailable";
        fence.error = new Error("WEBGPU_INTEROP_FENCE_UNAVAILABLE");
        this.notifySettlementObservers();
        return;
      }
      const pending = request.call(this.queue);
      const then = pending?.then;
      if (typeof then !== "function") {
        if (current()) {
          fence.state = "unavailable";
          fence.error = new Error("WEBGPU_INTEROP_FENCE_UNAVAILABLE");
          this.notifySettlementObservers();
        }
        return;
      }
      // Even if the request reentered invalidation, subscribe so a later
      // rejection of the returned promise is handled; both callbacks are
      // identity-checked and cannot resurrect stale state.
      const observer = then.call(pending, passFence, failFence);
      if (!settled && current()) fence.state = "waiting";
      // Native Promise handlers above cannot throw, but a structural thenable
      // can return an independently rejected promise. Do not leak it.
      try { void observer?.catch?.(() => {}); } catch { /* The fence itself is already observed. */ }
    } catch (error) {
      // A failed fence does not prove queued work has stopped. Keep the
      // original retirement pending until genuine device invalidation.
      failFence(error);
    }
  }

  /** Retire all leases, reporting failures; a later call can retry safe cleanup. */
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.active = false;
    this.disposalFailure = undefined;
    const completion = retirementCompletion();
    this.disposal = completion.promise;
    void completion.promise.then(
      () => { if (this.disposal === completion.promise) this.disposal = undefined; },
      () => { if (this.disposal === completion.promise) this.disposal = undefined; }
    );
    this.sweeping += 1;
    try {
      const pending: Promise<void>[] = [];
      for (const [resource, record] of [...this.resources]) {
        // A synchronous retry may reenter cleanup and finish another record.
        if (this.resources.get(resource) === record) pending.push(this.retire(resource));
      }
      void Promise.all(pending).then(
        () => { completion.state = "resolved"; completion.resolve(); },
        (error: unknown) => this.rejectCompletion(completion, error)
      );
    } catch (error) {
      // Preserve an unexpected sweep error separately from per-resource
      // destruction failures, so a later observer can distinguish it from
      // a stale rejection whose failed resource has already been retried.
      this.disposalFailure = { error };
      this.rejectCompletion(completion, error);
    } finally {
      this.sweeping -= 1;
      this.notifySettlementObservers();
    }
    return completion.promise;
  }

  /**
   * Device loss/destruction guarantees queued work can no longer use handles.
   * Attempt every lease, then throw all failures without releasing failed ones.
   */
  invalidate(): void {
    this.active = false;
    if (this.destroying) throw new Error("WEBGPU_INTEROP_DESTRUCTION_IN_PROGRESS");
    this.invalidated = true;
    const failures: unknown[] = [];
    this.sweeping += 1;
    try {
      for (const [resource, record] of [...this.resources]) {
        if (this.resources.get(resource) !== record) continue;
        record.retired = true;
        try { this.destroyRecord(resource, record); } catch (error) { failures.push(error); }
      }
    } finally {
      this.sweeping -= 1;
      this.notifySettlementObservers();
    }
    if (failures.length) throw new AggregateError(failures, "Failed to destroy WebGPU interop resources");
  }

  private destroyRecord(resource: object, record: ResourceRecord): void {
    if (this.resources.get(resource) !== record || owners.get(resource) !== this || record.destroying) return;
    const destroy = record.failure ? record.retryDestroy : record.destroy;
    if (!destroy) throw record.failure!.error;
    record.failure = undefined;
    record.destroying = true;
    this.destroying += 1;
    try {
      destroy();
      this.resources.delete(resource);
      owners.delete(resource);
      destroyedResources.add(resource);
      if (record.completion?.state === "pending") {
        record.completion.state = "resolved";
        record.completion.resolve();
      }
    } catch (error) {
      record.failure = { error };
      if (record.completion) this.rejectCompletion(record.completion, error);
      throw error;
    } finally {
      record.destroying = false;
      this.destroying -= 1;
      this.notifySettlementObservers();
    }
  }

  private notifySettlementObservers(): void {
    for (const [resource, observers] of this.resourceSettlementObservers) {
      const record = this.resources.get(resource);
      let failed = false;
      let error: unknown;
      if (record?.failure) {
        failed = true;
        error = record.failure.error;
      } else if (!this.invalidated && (record?.fence?.state === "failed" || record?.fence?.state === "unavailable")) {
        failed = true;
        error = record.fence.error;
      }
      if (record && !failed) continue;
      this.resourceSettlementObservers.delete(resource);
      for (const completion of observers) {
        if (failed) this.rejectCompletion(completion, error);
        else {
          completion.state = "resolved";
          completion.resolve();
        }
      }
    }
    if (!this.settlementObservers.size) return;
    const errors: unknown[] = [];
    const add = (error: unknown): void => {
      if (!errors.some(existing => Object.is(existing, error))) errors.push(error);
    };
    if (this.disposalFailure) add(this.disposalFailure.error);
    for (const record of this.resources.values()) {
      if (record.failure) add(record.failure.error);
      if (!this.invalidated && (record.fence?.state === "failed" || record.fence?.state === "unavailable")) {
        add(record.fence.error);
      }
    }
    if (!errors.length && (this.active || this.sweeping || this.destroying || this.resources.size)) return;
    const failure = errors.length === 1 ? errors[0]
      : errors.length > 1 ? new AggregateError(errors, "WebGPU retirement failed", { cause: errors[0] })
        : undefined;
    for (const completion of this.settlementObservers) {
      this.settlementObservers.delete(completion);
      if (errors.length) this.rejectCompletion(completion, failure);
      else {
        completion.state = "resolved";
        completion.resolve();
      }
    }
  }

  private rejectCompletion(completion: RetirementCompletion, error: unknown): void {
    if (completion.state !== "pending") return;
    completion.state = "rejected";
    completion.reject(error);
  }

  private assertActive(): void {
    if (!this.active) throw new Error("WEBGPU_INTEROP_DISPOSED");
  }
}
