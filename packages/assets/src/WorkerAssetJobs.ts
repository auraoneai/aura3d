import { redactAssetMessage } from "./AssetLoader";
import { redactImportCause, type ImportPipeline } from "./ImportPipeline";

export interface WorkerAssetJob<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly input: TInput;
  readonly url: string;
  readonly signal?: AbortSignal;
}

/**
 * The optional hooks describe ownership across the worker boundary. `cancel`
 * must resolve only after the job has stopped and its worker-side resources
 * have been released. `dispose` must do the same for the whole runner.
 */
export interface WorkerAssetJobRunner {
  run<TInput, TOutput>(job: WorkerAssetJob<TInput, TOutput>): Promise<TOutput>;
  cancel?(id: string): Promise<void>;
  dispose?(): Promise<void> | void;
  disposeResult?(value: unknown): Promise<void> | void;
}

export interface WorkerAssetJobsOptions {
  /** Maximum simultaneously running jobs (default 4). */
  readonly maxConcurrent?: number;
  /** Maximum jobs waiting for a worker (default 64). */
  readonly maxQueued?: number;
  /** Maximum time to wait for worker cancellation or teardown (default 5000 ms). */
  readonly cleanupTimeoutMs?: number;
}

interface PendingJob {
  readonly job: WorkerAssetJob;
  readonly controller: AbortController;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
  readonly released: Promise<void>;
  readonly markReleased: () => void;
  readonly markReleaseFailed: (reason: unknown) => void;
  abortListener?: () => void;
  resultCleanup?: Promise<void>;
  cleanupFailed?: boolean;
  cancelAck?: Promise<boolean>;
  acknowledgeTeardown?: () => void;
  running: boolean;
  settled: boolean;
  releasedSlot: boolean;
}

/** Bounded FIFO queue with separate caller settlement and worker ownership. */
export class WorkerAssetJobs {
  private readonly queue: PendingJob[] = [];
  private readonly jobs = new Map<string, PendingJob>();
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly cleanupTimeoutMs: number;
  private active = 0;
  private disposed = false;
  private disposing?: Promise<void>;
  private cleanupFailures = 0;
  private lastCleanupError?: string;

  constructor(
    private readonly pipeline: ImportPipeline,
    private readonly worker?: WorkerAssetJobRunner,
    options: WorkerAssetJobsOptions = {}
  ) {
    this.maxConcurrent = checkedLimit(options.maxConcurrent ?? 4, "maxConcurrent", 1, 64);
    this.maxQueued = checkedLimit(options.maxQueued ?? 64, "maxQueued", 0, 1024);
    this.cleanupTimeoutMs = checkedLimit(options.cleanupTimeoutMs ?? 5000, "cleanupTimeoutMs", 1, 60_000);
  }

  run<TInput, TOutput = unknown>(job: WorkerAssetJob<TInput, TOutput>): Promise<TOutput> {
    if (this.disposed) return Promise.reject(new Error("Worker asset jobs are disposed"));
    if (job.signal?.aborted) return Promise.reject(abortError(job));
    if (this.jobs.has(job.id)) return Promise.reject(new Error(`Worker asset job already exists: ${diagnosticJobId(job)}`));
    if (this.active >= this.maxConcurrent && this.queue.length >= this.maxQueued) {
      return Promise.reject(new Error(`Worker asset job queue is full: ${diagnosticJobId(job)}`));
    }

    return new Promise<TOutput>((resolve, reject) => {
      let markReleased!: () => void;
      let markReleaseFailed!: (reason: unknown) => void;
      const released = new Promise<void>((done, fail) => { markReleased = done; markReleaseFailed = fail; });
      // Cleanup can fail before dispose() starts waiting on this acknowledgement.
      void released.catch(() => {});
      const entry: PendingJob = {
        job, controller: new AbortController(), resolve: (value) => resolve(value as TOutput), reject,
        released, markReleased, markReleaseFailed, running: false, settled: false, releasedSlot: false
      };
      entry.abortListener = () => this.abort(entry);
      job.signal?.addEventListener("abort", entry.abortListener, { once: true });
      this.jobs.set(job.id, entry);
      this.queue.push(entry);
      // Handle a signal that raced listener installation.
      if (job.signal?.aborted) this.abort(entry);
      else this.pump();
    });
  }

  /** Number of retained worker slots and waiting jobs. */
  diagnostics(): { readonly active: number; readonly queued: number; readonly disposed: boolean; readonly cleanupFailures: number; readonly lastCleanupError?: string } {
    return { active: this.active, queued: this.queue.length, disposed: this.disposed, cleanupFailures: this.cleanupFailures, lastCleanupError: this.lastCleanupError };
  }

  /**
   * Reject queued jobs and cancel running jobs. The promise resolves only when
   * their runner has acknowledged cancellation or completed/been disposed.
   * A non-cooperative legacy runner makes disposal reject after the deadline;
   * its slot is never presented as reusable while work may still be running.
   */
  dispose(): Promise<void> {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    const entries = [...this.jobs.values()];
    for (const entry of entries) this.abort(entry);
    this.disposing = (async () => {
      try {
        if (this.worker?.dispose) {
          await withDeadline(Promise.resolve().then(() => this.worker!.dispose!()), this.cleanupTimeoutMs, "Worker asset runner teardown");
          await Promise.all(entries.map((entry) => entry.resultCleanup));
          for (const entry of entries) {
            entry.acknowledgeTeardown?.();
            this.settleError(entry, abortError(entry.job));
            this.release(entry);
          }
        } else {
          await withDeadline(Promise.all(entries.map((entry) => entry.released)).then(() => undefined), this.cleanupTimeoutMs, "Worker asset runner cleanup");
        }
        if (this.cleanupFailures) throw new Error(`Worker asset result cleanup failed: ${this.lastCleanupError}`);
      } catch (error) {
        throw redactImportCause(error, entries.map((entry) => entry.job.url));
      }
    })();
    return this.disposing;
  }

  private pump(): void {
    while (!this.disposed && this.active < this.maxConcurrent && this.queue.length) {
      const entry = this.queue.shift()!;
      if (entry.releasedSlot) continue;
      entry.running = true;
      this.active += 1;
      const job = { ...entry.job, signal: entry.controller.signal };
      let operation: Promise<unknown>;
      let localCleanup: Promise<void> | undefined;
      try {
        if (this.worker) {
          operation = Promise.resolve(this.worker.run(job));
        } else {
          const run = this.pipeline.start(job.input, { url: job.url, signal: job.signal });
          operation = run.result;
          localCleanup = run.settled;
        }
      } catch (error) {
        operation = Promise.reject(error);
      }
      void operation.then(
        async (value) => {
          if (localCleanup && !(await this.waitForLocalCleanup(entry, localCleanup))) return;
          if (entry.controller.signal.aborted || entry.settled) {
            entry.resultCleanup = withDeadline(this.discard(value), this.cleanupTimeoutMs, `Worker asset result cleanup: ${diagnosticJobId(entry.job)}`).catch((error) => {
              this.recordCleanupFailure(entry, error);
            });
            await entry.resultCleanup;
            if (entry.cleanupFailed) return;
            if (entry.cancelAck && !(await entry.cancelAck)) return;
            this.settleError(entry, abortError(entry.job));
          } else this.settleValue(entry, value);
          this.release(entry);
        },
        async (error) => {
          if (localCleanup) {
            // A cancellation rejects the caller immediately, but the stage may
            // still own resources. Reuse capacity only after rollback finishes.
            this.settleError(entry, entry.controller.signal.aborted ? abortError(entry.job) : error);
            if (await this.waitForLocalCleanup(entry, localCleanup)) this.release(entry);
            return;
          }
          if (entry.cancelAck && !(await entry.cancelAck)) return;
          this.settleError(entry, entry.controller.signal.aborted ? abortError(entry.job) : error);
          this.release(entry);
        }
      );
    }
  }

  private abort(entry: PendingJob): void {
    if (entry.releasedSlot || entry.controller.signal.aborted) return;
    entry.controller.abort(entry.job.signal?.reason);
    if (!entry.running) {
      this.settleError(entry, abortError(entry.job));
      this.release(entry);
      return;
    }
    if (!this.worker?.cancel) {
      // Compatibility for existing runners: notify their signal and reject the
      // subscriber promptly, but reserve the slot until work actually settles.
      this.settleError(entry, abortError(entry.job));
      return;
    }
    const cancellation = Promise.resolve().then(() => {
      const acknowledgement = this.worker!.cancel!(entry.job.id);
      if (!acknowledgement || typeof acknowledgement.then !== "function") {
        throw new Error(`Worker asset job cancellation was not acknowledged: ${diagnosticJobId(entry.job)}`);
      }
      return acknowledgement;
    });
    entry.cancelAck = new Promise<boolean>((resolve) => {
      let complete = false;
      const finish = (acknowledged: boolean, error?: unknown): void => {
        if (complete) return;
        complete = true;
        clearTimeout(timeout);
        entry.acknowledgeTeardown = undefined;
        // A missing acknowledgement is an error, not permission to reuse a slot.
        if (!acknowledged) this.settleError(entry, error);
        resolve(acknowledged);
      };
      const timeout = setTimeout(() => finish(false, new Error(`Worker asset job cancellation: ${diagnosticJobId(entry.job)} timed out after ${this.cleanupTimeoutMs}ms`)), this.cleanupTimeoutMs);
      entry.acknowledgeTeardown = () => finish(true);
      cancellation.then(() => finish(true), (error) => finish(false, error));
    });
    void entry.cancelAck.then(async (acknowledged) => {
      if (acknowledged) {
        await entry.resultCleanup;
        if (entry.cleanupFailed) return;
        this.settleError(entry, abortError(entry.job));
        this.release(entry);
      }
    });
  }

  private settleValue(entry: PendingJob, value: unknown): void {
    if (!entry.settled) { entry.settled = true; entry.resolve(value); }
  }

  private settleError(entry: PendingJob, error: unknown): void {
    if (!entry.settled) { entry.settled = true; entry.reject(redactImportCause(error, [entry.job.url])); }
  }

  private async waitForLocalCleanup(entry: PendingJob, cleanup: Promise<void>): Promise<boolean> {
    try {
      await cleanup;
      return true;
    } catch (error) {
      this.recordCleanupFailure(entry, error);
      return false;
    }
  }

  private recordCleanupFailure(entry: PendingJob, error: unknown): void {
    if (entry.cleanupFailed) return;
    entry.cleanupFailed = true;
    this.cleanupFailures += 1;
    let message: string;
    try {
      const detail = error instanceof Error ? error.message :
        error === null || error === undefined || typeof error === "string" || typeof error === "number" ||
        typeof error === "boolean" || typeof error === "bigint" ? String(error) : "[non-Error cleanup failure]";
      message = typeof detail === "string" ? detail : "[cleanup error details unavailable]";
    } catch {
      message = "[cleanup error details unavailable]";
    }
    this.lastCleanupError = redactAssetMessage(message, entry.job.url);
    const failure = new Error(`Worker asset result cleanup failed: ${this.lastCleanupError}`);
    this.settleError(entry, failure);
    // Fail disposal promptly without declaring the still-owned slot reusable.
    entry.markReleaseFailed(failure);
  }

  private release(entry: PendingJob): void {
    if (entry.releasedSlot) return;
    entry.releasedSlot = true;
    entry.job.signal?.removeEventListener("abort", entry.abortListener!);
    if (entry.running) this.active -= 1;
    else {
      const index = this.queue.indexOf(entry);
      if (index !== -1) this.queue.splice(index, 1);
    }
    if (this.jobs.get(entry.job.id) === entry) this.jobs.delete(entry.job.id);
    entry.markReleased();
    this.pump();
  }

  private async discard(value: unknown): Promise<void> {
    if (this.worker?.disposeResult) { await this.worker.disposeResult(value); return; }
    if (value && typeof value === "object") {
      const owned = value as { dispose?: () => void | Promise<void>; close?: () => void | Promise<void> };
      if (typeof owned.dispose === "function") await owned.dispose();
      else if (typeof owned.close === "function") await owned.close();
    }
  }
}

function checkedLimit(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function diagnosticJobId(job: Pick<WorkerAssetJob, "id" | "url">): string {
  return redactAssetMessage(job.id, job.url);
}

function abortError(job: Pick<WorkerAssetJob, "id" | "url">): Error {
  const error = new Error(`Worker asset job aborted: ${diagnosticJobId(job)}`);
  error.name = "AbortError";
  return error;
}

function withDeadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); }
    );
  });
}
