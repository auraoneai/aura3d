import { describe, expect, it, vi } from "vitest";
import {
  installWorkerPoolHandler,
  WorkerPool,
  type WorkerPoolHandlerPort,
  type WorkerPoolWorker
} from "../../../packages/addons/src/utils/WorkerPool.js";

/** A worker-shaped transport; postMessage uses real structured-clone transfer semantics. */
class TestWorker {
  readonly sent: { data: any; transfer: readonly Transferable[] }[] = [];
  readonly listeners = new Map<string, Set<(event: any) => void>>();
  terminated = 0;
  throwOnSend = false;

  postMessage(data: unknown, transfer: Transferable[] = []): void {
    if (this.throwOnSend) throw new Error("clone failed");
    const cloned = structuredClone(data, { transfer });
    this.sent.push({ data: cloned, transfer });
  }
  addEventListener(type: string, listener: (event: any) => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }
  terminate(): void { this.terminated++; }
  emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
  asWorker(): WorkerPoolWorker { return this as unknown as WorkerPoolWorker; }
  listenerCount(): number { return [...this.listeners.values()].reduce((n, set) => n + set.size, 0); }
}

class TestHandlerPort implements WorkerPoolHandlerPort {
  readonly sent: { data: any; transfer: readonly Transferable[] }[] = [];
  readonly listeners = new Set<(event: MessageEvent) => void>();
  postMessage(data: unknown, transfer: Transferable[]): void {
    this.sent.push({ data: structuredClone(data, { transfer }), transfer });
  }
  addEventListener(_type: "message", listener: (event: MessageEvent) => void): void { this.listeners.add(listener); }
  removeEventListener(_type: "message", listener: (event: MessageEvent) => void): void { this.listeners.delete(listener); }
  emit(data: unknown): void { for (const listener of [...this.listeners]) listener({ data } as MessageEvent); }
}

const flush = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe("bounded WorkerPool", () => {
  it("dispatches FIFO within its bounds and transfers queued resources only on dispatch", async () => {
    const workers: TestWorker[] = [];
    const pool = new WorkerPool<ArrayBuffer, number>({
      size: 2, maxQueue: 1,
      createWorker: () => { const worker = new TestWorker(); workers.push(worker); return worker.asWorker(); }
    });
    expect(pool.workerCount).toBe(0);
    const firstBuffer = new ArrayBuffer(4);
    const secondBuffer = new ArrayBuffer(8);
    const thirdBuffer = new ArrayBuffer(12);
    const first = pool.run(firstBuffer, { transfer: [firstBuffer] });
    const second = pool.run(secondBuffer, { transfer: [secondBuffer] });
    const third = pool.run(thirdBuffer, { transfer: [thirdBuffer] });
    await expect(pool.run(new ArrayBuffer(1))).rejects.toMatchObject({ code: "queue-full" });
    expect([pool.workerCount, pool.activeCount, pool.pendingCount]).toEqual([2, 2, 1]);
    expect([firstBuffer.byteLength, secondBuffer.byteLength, thirdBuffer.byteLength]).toEqual([0, 0, 12]);
    expect(workers.map((worker) => worker.sent[0].data.id)).toEqual([1, 2]);

    workers[0].emit("message", { data: { type: "result", id: 1, value: 4 } });
    expect(await first).toBe(4);
    expect(thirdBuffer.byteLength).toBe(0);
    expect(workers[0].sent[1].data).toMatchObject({ type: "task", id: 3 });
    workers[1].emit("message", { data: { type: "result", id: 2, value: 8 } });
    workers[0].emit("message", { data: { type: "result", id: 3, value: 12 } });
    expect(await Promise.all([second, third])).toEqual([8, 12]);
    pool.dispose();
    pool.dispose();
    expect(workers.map((worker) => [worker.terminated, worker.listenerCount()])).toEqual([[1, 0], [1, 0]]);
    await expect(pool.run(new ArrayBuffer(1))).rejects.toMatchObject({ code: "disposed" });
  });

  it("removes queued cancellations without transferring and replaces a cancelled running worker", async () => {
    const workers: TestWorker[] = [];
    const pool = new WorkerPool<ArrayBuffer, string>({
      size: 1, maxQueue: 2,
      createWorker: () => { const worker = new TestWorker(); workers.push(worker); return worker.asWorker(); }
    });
    const runningController = new AbortController();
    const queuedController = new AbortController();
    const running = pool.run(new ArrayBuffer(1), { signal: runningController.signal });
    const queuedBuffer = new ArrayBuffer(9);
    const queued = pool.run(queuedBuffer, { signal: queuedController.signal, transfer: [queuedBuffer] });
    const runningRejected = expect(running).rejects.toMatchObject({ name: "AbortError" });
    const queuedRejected = expect(queued).rejects.toMatchObject({ name: "AbortError" });
    queuedController.abort();
    expect(queuedBuffer.byteLength).toBe(9);
    expect(pool.pendingCount).toBe(0);
    const next = pool.run(new ArrayBuffer(1));
    runningController.abort();
    await Promise.all([runningRejected, queuedRejected]);
    expect(workers[0].sent.map(({ data }) => data.type)).toEqual(["task", "cancel"]);
    expect([workers[0].terminated, workers[0].listenerCount(), workers.length]).toEqual([1, 0, 2]);
    workers[0].emit("message", { data: { type: "result", id: 1, value: "late" } });
    workers[1].emit("message", { data: { type: "result", id: 3, value: "ok" } });
    expect(await next).toBe("ok");
    pool.dispose();
  });

  it("does not reuse a cancelling worker when an adapter replies synchronously", async () => {
    const workers: TestWorker[] = [];
    const pool = new WorkerPool<number, number>({
      size: 1, maxQueue: 1,
      createWorker: () => {
        const worker = new TestWorker();
        workers.push(worker);
        const postMessage = worker.postMessage.bind(worker);
        vi.spyOn(worker, "postMessage").mockImplementation((data, transfer) => {
          postMessage(data, transfer);
          const request = data as { type: string; id: number };
          if (request.type === "cancel") {
            worker.emit("message", { data: { type: "result", id: request.id, value: -1 } });
          }
        });
        return worker.asWorker();
      }
    });
    const controller = new AbortController();
    const running = pool.run(1, { signal: controller.signal });
    const cancelled = expect(running).rejects.toMatchObject({ name: "AbortError" });
    const next = pool.run(2);
    controller.abort();
    await cancelled;
    expect([workers.length, workers[0].terminated, pool.activeCount, pool.pendingCount]).toEqual([2, 1, 1, 0]);
    expect(workers[0].sent.map(({ data }) => data.type)).toEqual(["task", "cancel"]);
    workers[1].emit("message", { data: { type: "result", id: 2, value: 4 } });
    expect(await next).toBe(4);
    pool.dispose();
  });

  it("recovers from worker faults, malformed matching responses and task errors", async () => {
    const workers: TestWorker[] = [];
    const pool = new WorkerPool<number, number>({
      size: 1, maxQueue: 2,
      createWorker: () => { const worker = new TestWorker(); workers.push(worker); return worker.asWorker(); }
    });
    const first = pool.run(1);
    const firstRejected = expect(first).rejects.toMatchObject({ code: "worker-failed" });
    const second = pool.run(2);
    const preventDefault = vi.fn();
    workers[0].emit("error", { message: "worker crashed", preventDefault });
    await firstRejected;
    expect(preventDefault).toHaveBeenCalledOnce();
    expect([workers[0].terminated, workers[0].listenerCount(), workers.length]).toEqual([1, 0, 2]);
    workers[1].emit("message", { data: { type: "result", id: 1, value: 100 } }); // stale ID
    expect(pool.activeCount).toBe(1);
    workers[1].emit("message", { data: { type: "error", id: 2, error: { name: "RangeError", message: "bad task" } } });
    await expect(second).rejects.toMatchObject({ name: "RangeError", message: "bad task" });
    const third = pool.run(3);
    const thirdRejected = expect(third).rejects.toMatchObject({ code: "invalid-response" });
    workers[1].emit("message", { data: { type: "result", id: 3 } });
    await thirdRejected;
    expect(workers[1].terminated).toBe(1);
    const fourth = pool.run(4);
    workers[2].emit("message", { data: { type: "result", id: 4, value: 16 } });
    expect(await fourth).toBe(16);
    pool.dispose();
  });

  it("rejects creation, postMessage and disposal failures without retaining work", async () => {
    expect(() => new WorkerPool({ size: 0, createWorker: () => new TestWorker().asWorker() })).toThrow(RangeError);
    expect(() => new WorkerPool({ size: 1, maxQueue: -1, createWorker: () => new TestWorker().asWorker() })).toThrow(RangeError);
    const neverCreated = vi.fn(() => { throw new Error("unsupported"); });
    const failed = new WorkerPool({ size: 1, createWorker: neverCreated });
    await expect(failed.run(1)).rejects.toMatchObject({ code: "worker-failed", message: expect.stringContaining("unsupported") });
    expect(failed.workerCount).toBe(0);
    failed.dispose();

    const bad = new TestWorker();
    bad.throwOnSend = true;
    const pool = new WorkerPool<number, number>({ size: 1, createWorker: () => bad.asWorker() });
    await expect(pool.run(1)).rejects.toMatchObject({ code: "worker-failed" });
    expect([bad.terminated, bad.listenerCount()]).toEqual([1, 0]);
    pool.dispose();

    const worker = new TestWorker();
    const pending = new WorkerPool<number, number>({ size: 1, maxQueue: 1, createWorker: () => worker.asWorker() });
    const first = pending.run(1);
    const second = pending.run(2);
    const checks = [expect(first).rejects.toMatchObject({ code: "disposed" }), expect(second).rejects.toMatchObject({ code: "disposed" })];
    pending.dispose();
    await Promise.all(checks);
    worker.emit("message", { data: { type: "result", id: 1, value: 4 } });
    expect([pending.workerCount, pending.activeCount, pending.pendingCount, worker.listenerCount()]).toEqual([0, 0, 0, 0]);
  });

  it("bounds reentrant factories and settles an in-flight factory if disposed", async () => {
    let pool!: WorkerPool<number, number>;
    let reentrant: Promise<number> | undefined;
    const worker = new TestWorker();
    pool = new WorkerPool({
      size: 1, maxQueue: 0,
      createWorker: () => { reentrant = pool.run(2); return worker.asWorker(); }
    });
    const first = pool.run(1);
    await expect(reentrant).rejects.toMatchObject({ code: "queue-full" });
    expect(pool.workerCount).toBe(1);
    worker.emit("message", { data: { type: "result", id: 1, value: 1 } });
    expect(await first).toBe(1);
    pool.dispose();

    let disposed!: WorkerPool<number, number>;
    const other = new TestWorker();
    disposed = new WorkerPool({ size: 1, createWorker: () => { disposed.dispose(); return other.asWorker(); } });
    await expect(disposed.run(1)).rejects.toMatchObject({ code: "disposed" });
    expect([other.terminated, other.listenerCount()]).toEqual([1, 0]);
  });

  it("reserves capacity for tasks queued by a reentrant worker factory", async () => {
    let pool!: WorkerPool<number, number>;
    const workers: TestWorker[] = [];
    const reentrant: Promise<number>[] = [];
    pool = new WorkerPool({
      size: 2, maxQueue: 1,
      createWorker: () => {
        const worker = new TestWorker();
        workers.push(worker);
        if (workers.length === 1) {
          reentrant.push(pool.run(2), pool.run(3), pool.run(4));
        }
        return worker.asWorker();
      }
    });
    const first = pool.run(1);
    expect([pool.activeCount, pool.pendingCount, workers.length]).toEqual([2, 1, 2]);
    await expect(reentrant[2]).rejects.toMatchObject({ code: "queue-full" });
    workers[0].emit("message", { data: { type: "result", id: 1, value: 1 } });
    expect(workers[0].sent[1].data).toMatchObject({ type: "task", id: 3, payload: 3 });
    workers[1].emit("message", { data: { type: "result", id: 2, value: 2 } });
    workers[0].emit("message", { data: { type: "result", id: 3, value: 3 } });
    expect(await Promise.all([first, reentrant[0], reentrant[1]])).toEqual([1, 2, 3]);
    pool.dispose();
    expect(workers.map((worker) => [worker.terminated, worker.listenerCount()])).toEqual([[1, 0], [1, 0]]);
  });
});

describe("worker-side task handler", () => {
  it("executes real pool requests through the matching worker endpoint", async () => {
    const worker = new TestWorker();
    const port = new TestHandlerPort();
    vi.spyOn(worker, "postMessage").mockImplementation((data, transfer = []) => {
      const copy = structuredClone(data, { transfer });
      queueMicrotask(() => port.emit(copy));
    });
    vi.spyOn(port, "postMessage").mockImplementation((data, transfer) => {
      const copy = structuredClone(data, { transfer });
      queueMicrotask(() => worker.emit("message", { data: copy }));
    });
    const stop = installWorkerPoolHandler<ArrayBuffer, ArrayBuffer>(port, (input) => {
      const bytes = new Uint8Array(input);
      for (let i = 0; i < bytes.length; i++) bytes[i] += 1;
      return { value: input, transfer: [input] };
    });
    const pool = new WorkerPool<ArrayBuffer, ArrayBuffer>({ size: 1, createWorker: () => worker.asWorker() });
    const input = Uint8Array.from([1, 4, 9]).buffer;
    const result = pool.run(input, { transfer: [input] });
    expect(input.byteLength).toBe(0);
    expect([...new Uint8Array(await result)]).toEqual([2, 5, 10]);
    pool.dispose();
    stop();
    expect([worker.terminated, worker.listenerCount(), port.listeners.size]).toEqual([1, 0, 0]);
  });

  it("returns transferred results and serializes task failures", async () => {
    const port = new TestHandlerPort();
    const output = new ArrayBuffer(5);
    const stop = installWorkerPoolHandler<number, ArrayBuffer>(port, (value) => {
      if (value < 0) throw new RangeError("negative");
      return { value: output, transfer: [output] };
    });
    port.emit({ type: "task", id: 1, payload: 4 });
    await flush();
    expect(output.byteLength).toBe(0);
    expect(port.sent[0].data).toMatchObject({ type: "result", id: 1 });
    expect(port.sent[0].data.value.byteLength).toBe(5);
    port.emit({ type: "task", id: 2, payload: -1 });
    await flush();
    expect(port.sent[1].data).toEqual({ type: "error", id: 2, error: { name: "RangeError", message: "negative" } });
    stop();
    stop();
    expect(port.listeners.size).toBe(0);
  });

  it("reports an uncloneable result as a worker error", async () => {
    const port = new TestHandlerPort();
    const stop = installWorkerPoolHandler(port, () => ({ value: () => "cannot clone" }));
    port.emit({ type: "task", id: 5, payload: null });
    await flush();
    expect(port.sent).toHaveLength(1);
    expect(port.sent[0].data).toMatchObject({ type: "error", id: 5, error: { name: "DataCloneError" } });
    stop();
  });

  it("signals cancellation and disposal and never emits late handler results", async () => {
    const port = new TestHandlerPort();
    const signals: AbortSignal[] = [];
    const finish: ((value: { value: string }) => void)[] = [];
    const handler = vi.fn((_payload: number, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<{ value: string }>((resolve) => finish.push(resolve));
    });
    const stop = installWorkerPoolHandler(port, handler);
    port.emit({ type: "task", id: 1, payload: 1 });
    await flush();
    port.emit({ type: "cancel", id: 1 });
    expect(signals[0].aborted).toBe(true);
    finish[0]({ value: "late" });
    port.emit({ type: "task", id: 2, payload: 2 });
    await flush();
    stop();
    expect(signals[1].aborted).toBe(true);
    finish[1]({ value: "also late" });
    await flush();
    expect(port.sent).toEqual([]);
    expect(port.listeners.size).toBe(0);
    port.emit({ type: "task", id: 3, payload: 3 });
    await flush();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("cancels a task before its handler starts and rejects duplicate IDs", async () => {
    const port = new TestHandlerPort();
    const handler = vi.fn(() => ({ value: 1 }));
    const stop = installWorkerPoolHandler(port, handler);
    port.emit({ type: "task", id: 1, payload: 1 });
    port.emit({ type: "cancel", id: 1 });
    port.emit({ type: "task", id: 2, payload: 2 });
    port.emit({ type: "task", id: 2, payload: 3 });
    await flush();
    expect(handler).not.toHaveBeenCalled();
    expect(port.sent).toEqual([{ data: { type: "error", id: 2, error: { name: "Error", message: "Duplicate WorkerPool task ID" } }, transfer: [] }]);
    stop();
  });
});
