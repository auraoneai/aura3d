import { afterEach, describe, expect, it, vi } from "vitest";
import { bakeClipsInWorker, RETARGET_WORKER_TIMEOUT_MS } from "../../../packages/animation/src/pose/RetargetWorker";

/**
 * anim-phys-09: a retarget worker that never replied (or whose reply could not be deserialized)
 * left `bakeClipsInWorker` pending forever, so `addClipsFrom` hung instead of falling back to
 * the in-process bake. The promise now always settles and terminates the worker.
 */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = 0;
  posted: unknown[] = [];
  constructor(private readonly throwOnPost = false) {}
  postMessage(message: unknown) {
    if (this.throwOnPost) throw new Error("DataCloneError");
    this.posted.push(message);
  }
  terminate() {
    this.terminated += 1;
  }
}

const request = { sourceSkeleton: {} as never, targetSkeleton: {} as never, clips: new Map() };

afterEach(() => {
  vi.useRealTimers();
});

describe("bakeClipsInWorker always settles", () => {
  it("rejects and terminates when the worker never replies", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const pending = bakeClipsInWorker(worker as unknown as Worker, request);
    const settled = pending.then(() => "resolved", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(RETARGET_WORKER_TIMEOUT_MS + 1);
    await expect(settled).resolves.toMatch(/did not reply within/);
    expect(worker.terminated).toBe(1);
  });

  it("rejects on messageerror", async () => {
    const worker = new FakeWorker();
    const pending = bakeClipsInWorker(worker as unknown as Worker, request, 0);
    worker.onmessageerror!({} as MessageEvent);
    await expect(pending).rejects.toThrow(/could not be deserialized/);
    expect(worker.terminated).toBe(1);
  });

  it("rejects when the request cannot be posted", async () => {
    const worker = new FakeWorker(true);
    await expect(bakeClipsInWorker(worker as unknown as Worker, request)).rejects.toThrow(/DataCloneError/);
    expect(worker.terminated).toBe(1);
  });

  it("still resolves a normal reply and settles once", async () => {
    const worker = new FakeWorker();
    const pending = bakeClipsInWorker(worker as unknown as Worker, request);
    const { requestId } = worker.posted[0] as { requestId: number };
    const clips = new Map();
    worker.onmessage!({ data: { kind: "baked", requestId, clips } } as MessageEvent);
    await expect(pending).resolves.toBe(clips);
    expect(worker.terminated).toBe(1);
  });

  it("the caller's catch runs the fallback bake", async () => {
    vi.useFakeTimers();
    const fallback = new Map([["Walk", {}]]);
    const result = bakeClipsInWorker(new FakeWorker() as unknown as Worker, request, 50).catch(() => fallback);
    await vi.advanceTimersByTimeAsync(60);
    await expect(result).resolves.toBe(fallback);
  });
});
