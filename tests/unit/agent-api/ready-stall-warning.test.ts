import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AURA_READY_STALLED,
  READY_STALL_MESSAGE,
  READY_STALL_WARNING_MS,
  resetReadyStallWarningForTests,
  watchReadyStall
} from "../../../packages/engine/src/agent-api/app/readyStallWarning.js";

describe("app.ready() stall warning (AURA_READY_STALLED)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetReadyStallWarningForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetReadyStallWarningForTests();
  });

  it("logs once with the code, cause and fix when ready() is pending 15 s on a visible page; never settles the promise", async () => {
    const report = vi.fn();
    const pending = new Promise<void>(() => undefined);
    const watched = watchReadyStall(pending, { report, isVisible: () => true });
    expect(watched).toBe(pending);
    let settled = false;
    void watched.then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS - 1);
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(report).toHaveBeenCalledTimes(1);
    const message = report.mock.calls[0]![0] as string;
    expect(message).toBe(READY_STALL_MESSAGE);
    expect(message).toContain(AURA_READY_STALLED);
    expect(message).toMatch(/top-level `await app\.ready\(\)`/);
    expect(message).toContain("void app.ready().then(");
    expect(message).toMatch(/hint, not a failure/);
    expect(READY_STALL_WARNING_MS).toBe(15_000);
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS * 5);
    expect(report).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    // Once per realm: a second stalled ready() does not log again.
    watchReadyStall(new Promise<void>(() => undefined), { report, isVisible: () => true });
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS * 2);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("stays silent when ready() resolves or rejects before the deadline, and passes the outcome through", async () => {
    const report = vi.fn();
    await expect(watchReadyStall(Promise.resolve(7), { report, isVisible: () => true })).resolves.toBe(7);
    let rejectIt!: (error: Error) => void;
    const failing = watchReadyStall(new Promise<void>((_resolve, reject) => { rejectIt = reject; }), { report, isVisible: () => true });
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS / 2);
    rejectIt(new Error("mount failed"));
    await expect(failing).rejects.toThrow("mount failed");
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS * 3);
    expect(report).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not count time while the page is hidden", async () => {
    const report = vi.fn();
    let visible = false;
    watchReadyStall(new Promise<void>(() => undefined), { report, isVisible: () => visible });
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS * 3);
    expect(report).not.toHaveBeenCalled();
    visible = true;
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("treats asset progress as a live mount: each event restarts the quiet interval, and it unsubscribes on settle", async () => {
    const report = vi.fn();
    let onActivity: (() => void) | undefined;
    const unsubscribe = vi.fn(() => { onActivity = undefined; });
    let resolveIt!: () => void;
    const pending = new Promise<void>((resolve) => { resolveIt = resolve; });
    watchReadyStall(pending, { report, isVisible: () => true, subscribeActivity: (listener) => { onActivity = listener; return unsubscribe; } });
    // A slow download reporting progress every 5 s for a minute never trips the hint.
    for (let i = 0; i < 12; i += 1) {
      await vi.advanceTimersByTimeAsync(5_000);
      onActivity?.();
    }
    expect(report).not.toHaveBeenCalled();
    resolveIt();
    await vi.advanceTimersByTimeAsync(0);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS * 2);
    expect(report).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports once progress stops for a full quiet interval", async () => {
    const report = vi.fn();
    let onActivity: (() => void) | undefined;
    watchReadyStall(new Promise<void>(() => undefined), { report, isVisible: () => true, subscribeActivity: (listener) => { onActivity = listener; return () => undefined; } });
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS - 1_000);
    onActivity?.();
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS - 1);
    expect(report).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("defaults to console.error", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    watchReadyStall(new Promise<void>(() => undefined));
    await vi.advanceTimersByTimeAsync(READY_STALL_WARNING_MS);
    expect(error).toHaveBeenCalledWith(READY_STALL_MESSAGE);
  });
});
