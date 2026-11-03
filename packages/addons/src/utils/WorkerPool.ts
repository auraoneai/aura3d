/** The messages understood by an Aura3D worker-pool task endpoint. */
export type WorkerPoolRequest<Task> =
  | { readonly type: "task"; readonly id: number; readonly payload: Task }
  | { readonly type: "cancel"; readonly id: number };

export interface WorkerPoolSerializedError {
  readonly name: string;
  readonly message: string;
}

export type WorkerPoolResponse<Result> =
  | { readonly type: "result"; readonly id: number; readonly value: Result }
  | { readonly type: "error"; readonly id: number; readonly error: WorkerPoolSerializedError };

/** A browser Worker, or an equivalent adapter with the same lifecycle. */
export type WorkerPoolWorker = Pick<Worker, "postMessage" | "addEventListener" | "removeEventListener" | "terminate">;

export interface WorkerPoolOptions {
  /** A new, independently owned worker on each call. Workers are created lazily. */
  readonly createWorker: () => WorkerPoolWorker;
  /** Maximum workers and concurrently executing tasks. */
  readonly size: number;
  /** Maximum waiting tasks, excluding the tasks currently executing. Defaults to 64. */
  readonly maxQueue?: number;
}

export interface WorkerPoolRunOptions {
  readonly signal?: AbortSignal;
  /** Transferred only when this task is dispatched, never while it waits in the queue. */
  readonly transfer?: readonly Transferable[];
}

export type WorkerPoolErrorCode = "disposed" | "queue-full" | "worker-failed" | "invalid-response";

export class WorkerPoolError extends Error {
  constructor(readonly code: WorkerPoolErrorCode, message: string) {
    super(message);
    this.name = "WorkerPoolError";
  }
}

interface PendingTask<Task, Result> {
  readonly id: number;
  readonly payload: Task;
  readonly transfer: Transferable[];
  readonly resolve: (result: Result) => void;
  readonly reject: (reason: unknown) => void;
  readonly signal?: AbortSignal;
  abort?: () => void;
  settled: boolean;
}

interface WorkerSlot<Task, Result> {
  readonly worker: WorkerPoolWorker;
  readonly message: (event: MessageEvent) => void;
  readonly error: (event: ErrorEvent) => void;
  readonly messageError: (event: MessageEvent) => void;
  active?: PendingTask<Task, Result>;
  retired: boolean;
}

/**
 * Bounded, opt-in processing pool. Exactly one task is sent to each worker at a
 * time. Cancelling an executing task terminates its worker, so CPU-bound work
 * that cannot process a cancel message cannot retain a slot indefinitely. A new
 * worker is created for the next task. Queued tasks are removed without sending
 * or transferring their payloads.
 */
export class WorkerPool<Task, Result> {
  private readonly createWorker: () => WorkerPoolWorker;
  private readonly size: number;
  private readonly maxQueue: number;
  private readonly workers = new Set<WorkerSlot<Task, Result>>();
  private readonly queue: PendingTask<Task, Result>[] = [];
  private nextId = 1;
  private disposed = false;
  private creating = 0;
  private draining = false;

  constructor(options: WorkerPoolOptions) {
    if (!Number.isSafeInteger(options.size) || options.size < 1) {
      throw new RangeError("WorkerPool size must be a positive safe integer");
    }
    const maxQueue = options.maxQueue ?? 64;
    if (!Number.isSafeInteger(maxQueue) || maxQueue < 0) {
      throw new RangeError("WorkerPool maxQueue must be a non-negative safe integer");
    }
    if (typeof options.createWorker !== "function") throw new TypeError("WorkerPool requires a worker factory");
    this.createWorker = options.createWorker;
    this.size = options.size;
    this.maxQueue = maxQueue;
  }

  get workerCount(): number { return this.workers.size; }
  get pendingCount(): number { return this.queue.length; }
  get activeCount(): number {
    let count = 0;
    for (const slot of this.workers) if (slot.active) count++;
    return count;
  }

  run(payload: Task, options: WorkerPoolRunOptions = {}): Promise<Result> {
    if (this.disposed) return Promise.reject(disposedError());
    if (options.signal?.aborted) return Promise.reject(abortError());
    if (this.nextId > Number.MAX_SAFE_INTEGER) return Promise.reject(new RangeError("WorkerPool request IDs exhausted"));
    // Waiting tasks reserve either an available execution slot or a queue slot.
    // Counting the queue is essential while a factory is running: it may call
    // run() synchronously, before drain() can open the remaining workers.
    const outstanding = this.activeCount + this.creating + this.queue.length;
    if (outstanding >= this.size + this.maxQueue) {
      return Promise.reject(new WorkerPoolError("queue-full", "WorkerPool waiting queue is full"));
    }
    return new Promise<Result>((resolve, reject) => {
      const task: PendingTask<Task, Result> = {
        id: this.nextId++, payload, transfer: [...(options.transfer ?? [])], resolve, reject,
        signal: options.signal, settled: false
      };
      if (task.signal) {
        task.abort = () => this.cancel(task);
        task.signal.addEventListener("abort", task.abort, { once: true });
      }
      this.queue.push(task);
      if (task.signal?.aborted) this.cancel(task);
      else this.drain();
    });
  }

  /** Rejects all work, removes listeners and terminates every owned worker. Idempotent. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const task of this.queue.splice(0)) this.reject(task, disposedError());
    for (const slot of [...this.workers]) {
      if (slot.active) this.reject(slot.active, disposedError());
      this.retire(slot);
    }
  }

  private drain(): void {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.disposed && this.queue.length > 0) {
        let slot = [...this.workers].find((candidate) => !candidate.active);
        if (!slot && this.workers.size + this.creating >= this.size) return;
        const task = this.queue.shift()!;
        if (!slot) {
          this.creating++;
          try {
            slot = this.openWorker();
          } catch (error) {
            this.reject(task, workerError("WorkerPool could not create a worker", error));
            continue;
          } finally {
            this.creating--;
          }
        }
        if (this.disposed || task.settled) {
          // A supplied factory can synchronously dispose the pool or abort work.
          if (this.disposed) {
            this.reject(task, disposedError());
            this.retire(slot);
          }
          continue;
        }
        slot.active = task;
        try {
          slot.worker.postMessage({ type: "task", id: task.id, payload: task.payload } satisfies WorkerPoolRequest<Task>, task.transfer);
        } catch (error) {
          // postMessage can fail, for example if a payload cannot be cloned.
          if (slot.active === task) {
            this.reject(task, workerError("WorkerPool could not send a task", error));
            this.retire(slot);
          }
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private openWorker(): WorkerSlot<Task, Result> {
    const worker = this.createWorker();
    const slot: WorkerSlot<Task, Result> = {
      worker,
      message: (event) => this.receive(slot, event.data),
      error: (event) => {
        if (typeof event.preventDefault === "function") event.preventDefault();
        this.failWorker(slot, event.message || "WorkerPool worker failed");
      },
      messageError: () => this.failWorker(slot, "WorkerPool could not deserialize a worker response"),
      retired: false
    };
    try {
      worker.addEventListener("message", slot.message);
      worker.addEventListener("error", slot.error);
      worker.addEventListener("messageerror", slot.messageError);
      this.workers.add(slot);
      return slot;
    } catch (error) {
      // Partially installed listeners and the newly created worker are ours too.
      this.retire(slot);
      throw error;
    }
  }

  private receive(slot: WorkerSlot<Task, Result>, value: unknown): void {
    if (slot.retired || !slot.active || typeof value !== "object" || value === null) return;
    const message = value as Record<string, unknown>;
    // Ignore stale replies and unrelated messages; IDs are never reused.
    if (message.id !== slot.active.id) return;
    const task = slot.active;
    slot.active = undefined;
    if (message.type === "result" && "value" in message) {
      this.resolve(task, message.value as Result);
    } else if (message.type === "error" && isSerializedError(message.error)) {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      this.reject(task, error);
    } else {
      this.reject(task, new WorkerPoolError("invalid-response", "WorkerPool received an invalid task response"));
      this.retire(slot);
    }
    this.drain();
  }

  private cancel(task: PendingTask<Task, Result>): void {
    if (task.settled) return;
    const index = this.queue.indexOf(task);
    if (index !== -1) this.queue.splice(index, 1);
    const slot = [...this.workers].find((candidate) => candidate.active === task);
    this.reject(task, abortError());
    if (slot) {
      // Retire the slot before sending cancel: a synchronous adapter response
      // must not dispatch a queued task to a worker we are about to terminate.
      this.retire(slot, task.id);
    }
    this.drain();
  }

  private failWorker(slot: WorkerSlot<Task, Result>, message: string): void {
    if (slot.retired) return;
    if (slot.active) this.reject(slot.active, new WorkerPoolError("worker-failed", message));
    this.retire(slot);
    this.drain();
  }

  private retire(slot: WorkerSlot<Task, Result>, cancelId?: number): void {
    if (slot.retired) return;
    slot.retired = true;
    slot.active = undefined;
    this.workers.delete(slot);
    // Attempt every cleanup even when an adapter has a faulty disposer.
    try { slot.worker.removeEventListener("message", slot.message); } catch { /* continue cleanup */ }
    try { slot.worker.removeEventListener("error", slot.error); } catch { /* continue cleanup */ }
    try { slot.worker.removeEventListener("messageerror", slot.messageError); } catch { /* continue cleanup */ }
    if (cancelId !== undefined) {
      // Cancellation is best effort; termination also stops a synchronous
      // handler that cannot receive this message.
      try { slot.worker.postMessage({ type: "cancel", id: cancelId } satisfies WorkerPoolRequest<Task>, []); } catch { /* terminate below */ }
    }
    try { slot.worker.terminate(); } catch { /* no further owned resources */ }
  }

  private resolve(task: PendingTask<Task, Result>, value: Result): void {
    if (task.settled) return;
    this.finish(task);
    task.resolve(value);
  }

  private reject(task: PendingTask<Task, Result>, error: unknown): void {
    if (task.settled) return;
    this.finish(task);
    task.reject(error);
  }

  private finish(task: PendingTask<Task, Result>): void {
    task.settled = true;
    if (task.signal && task.abort) task.signal.removeEventListener("abort", task.abort);
    task.abort = undefined;
  }
}

/** Worker-side message endpoint, such as a DedicatedWorkerGlobalScope. */
export interface WorkerPoolHandlerPort {
  postMessage(message: unknown, transfer: Transferable[]): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

export interface WorkerPoolTaskResult<Result> {
  readonly value: Result;
  readonly transfer?: readonly Transferable[];
}

/**
 * Install a task handler in a worker. The returned disposer removes its listener,
 * aborts outstanding handlers and suppresses late results. Output transferables
 * are supplied explicitly with the result.
 */
export function installWorkerPoolHandler<Task, Result>(
  port: WorkerPoolHandlerPort,
  handler: (payload: Task, signal: AbortSignal) => WorkerPoolTaskResult<Result> | Promise<WorkerPoolTaskResult<Result>>
): () => void {
  const active = new Map<number, AbortController>();
  let disposed = false;
  const sendError = (id: number, error: unknown): void => {
    const serialized = serializeError(error);
    try { port.postMessage({ type: "error", id, error: serialized } satisfies WorkerPoolResponse<Result>, []); } catch { /* transport is gone */ }
  };
  const onMessage = (event: MessageEvent): void => {
    const data: unknown = event.data;
    if (disposed || typeof data !== "object" || data === null) return;
    const request = data as Record<string, unknown>;
    if (!Number.isSafeInteger(request.id) || (request.id as number) < 1) return;
    const id = request.id as number;
    if (request.type === "cancel") {
      active.get(id)?.abort();
      active.delete(id);
      return;
    }
    if (request.type !== "task" || !("payload" in request)) return;
    if (active.has(id)) {
      active.get(id)?.abort();
      active.delete(id);
      sendError(id, new Error("Duplicate WorkerPool task ID"));
      return;
    }
    const controller = new AbortController();
    active.set(id, controller);
    void (async () => {
      // Do not start a handler when a cancel or dispose arrived in this turn.
      await Promise.resolve();
      if (disposed || active.get(id) !== controller || controller.signal.aborted) return;
      try {
        const result = await handler(request.payload as Task, controller.signal);
        if (disposed || active.get(id) !== controller || controller.signal.aborted) return;
        active.delete(id);
        port.postMessage({ type: "result", id, value: result.value } satisfies WorkerPoolResponse<Result>, [...(result.transfer ?? [])]);
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        // A postMessage clone error occurs after removal from active.
        if (active.get(id) === controller) active.delete(id);
        sendError(id, error);
      }
    })();
  };
  port.addEventListener("message", onMessage);
  return () => {
    if (disposed) return;
    disposed = true;
    try { port.removeEventListener("message", onMessage); } finally {
      for (const controller of active.values()) controller.abort();
      active.clear();
    }
  };
}

function isSerializedError(value: unknown): value is WorkerPoolSerializedError {
  if (typeof value !== "object" || value === null) return false;
  const error = value as Record<string, unknown>;
  return typeof error.name === "string" && typeof error.message === "string";
}

function serializeError(value: unknown): WorkerPoolSerializedError {
  return value instanceof Error
    ? { name: value.name, message: value.message }
    : { name: "Error", message: String(value) };
}

function abortError(): Error {
  const error = new Error("WorkerPool task cancelled");
  error.name = "AbortError";
  return error;
}

function disposedError(): WorkerPoolError {
  return new WorkerPoolError("disposed", "WorkerPool has been disposed");
}

function workerError(message: string, error: unknown): WorkerPoolError {
  return new WorkerPoolError("worker-failed", `${message}: ${error instanceof Error ? error.message : String(error)}`);
}
