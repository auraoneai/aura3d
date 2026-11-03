import { afterEach, describe, expect, it, vi } from "vitest";
import { installGameTestHook } from "../../../packages/game/src/testHook";
import { domTransitionDriver, runTransition, type TransitionDriver, type TransitionWaitOptions } from "../../../packages/game/src/shell/transition";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

async function settleMicrotasks(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function cancellableWait(signal: AbortSignal | undefined, onCancel: () => void): Promise<void> {
  return new Promise<void>((_resolve, reject) => {
    const abort = () => { onCancel(); reject(signal?.reason ?? new DOMException("Cancelled", "AbortError")); };
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("transition presentation cleanup", () => {
  it("keeps the overlay opaque through presentation and cancels the losing timeout", async () => {
    const frame = deferred<void>();
    const overlay: Array<[number, number]> = [];
    let timeoutCancelled = 0;
    let frameSignal: AbortSignal | undefined;
    const driver: TransitionDriver = {
      setOverlay: (opacity, ms) => { overlay.push([opacity, ms]); },
      firstPresentedFrame: (options) => { frameSignal = options?.signal; return frame.promise; },
      sleep: (ms, options) => ms === 2000
        ? cancellableWait(options?.signal, () => { timeoutCancelled += 1; })
        : Promise.resolve()
    };
    const result = runTransition(driver, () => "scene", { kind: "fade", ms: 10 });
    await settleMicrotasks();
    expect(overlay.at(-1)).toEqual([1, 0]);
    frame.resolve();
    await expect(result).resolves.toBe("scene");
    expect(overlay).toEqual([[1, 10], [1, 0], [0, 12]]);
    expect(frameSignal?.aborted).toBe(true);
    expect(timeoutCancelled).toBe(1);
  });

  it("releases the overlay and cancels the timer when presentation rejects", async () => {
    const frame = deferred<void>();
    const error = new Error("presentation failed");
    const overlay: Array<[number, number]> = [];
    let timerCancelled = 0;
    const driver: TransitionDriver = {
      setOverlay: (opacity, ms) => { overlay.push([opacity, ms]); },
      firstPresentedFrame: () => frame.promise,
      sleep: (ms, options) => ms === 2000
        ? cancellableWait(options?.signal, () => { timerCancelled += 1; })
        : Promise.resolve()
    };
    const result = runTransition(driver, () => undefined, { kind: "fade", ms: 0 });
    await settleMicrotasks();
    frame.reject(error);
    await expect(result).rejects.toBe(error);
    expect(timerCancelled).toBe(1);
    expect(overlay.at(-1)).toEqual([0, 0]);
  });

  it("cancels the outstanding presentation waiter after a timeout", async () => {
    const overlay: Array<[number, number]> = [];
    let waiterCancelled = 0;
    const driver: TransitionDriver = {
      setOverlay: (opacity, ms) => { overlay.push([opacity, ms]); },
      firstPresentedFrame: (options) => cancellableWait(options?.signal, () => { waiterCancelled += 1; }),
      sleep: () => Promise.resolve()
    };
    await expect(runTransition(driver, () => undefined, { kind: "fade", ms: 0 }))
      .rejects.toThrow(/A3D_TRANSITION_NO_PRESENTED_FRAME/);
    expect(waiterCancelled).toBe(1);
    expect(overlay.at(-1)).toEqual([0, 0]);
  });

  it("cancels an already-created waiter when the timeout driver throws synchronously", async () => {
    const error = new Error("timer unavailable");
    const overlay: Array<[number, number]> = [];
    let waiterCancelled = 0;
    const driver: TransitionDriver = {
      setOverlay: (opacity, ms) => { overlay.push([opacity, ms]); },
      firstPresentedFrame: (options) => cancellableWait(options?.signal, () => { waiterCancelled += 1; }),
      sleep: (ms) => { if (ms === 2000) throw error; return Promise.resolve(); }
    };
    await expect(runTransition(driver, () => undefined, { kind: "fade", ms: 0 })).rejects.toBe(error);
    expect(waiterCancelled).toBe(1);
    expect(overlay.at(-1)).toEqual([0, 0]);
  });

  it("releases the overlay when scene replacement fails before presentation", async () => {
    const error = new Error("scene failed");
    const overlay: Array<[number, number]> = [];
    const firstPresentedFrame = vi.fn(() => Promise.resolve());
    const driver: TransitionDriver = {
      setOverlay: (opacity, ms) => { overlay.push([opacity, ms]); },
      firstPresentedFrame,
      sleep: () => Promise.resolve()
    };
    await expect(runTransition(driver, () => { throw error; }, { kind: "fade", ms: 0 })).rejects.toBe(error);
    expect(firstPresentedFrame).not.toHaveBeenCalled();
    expect(overlay.at(-1)).toEqual([0, 0]);
  });

  it("retains both the original failure and a failed overlay cleanup", async () => {
    const error = new Error("scene failed");
    const cleanup = new Error("overlay failed");
    const driver: TransitionDriver = {
      setOverlay: (opacity) => { if (opacity === 0) throw cleanup; },
      firstPresentedFrame: () => Promise.resolve(),
      sleep: () => Promise.resolve()
    };
    const caught = await runTransition(driver, () => { throw error; }, { kind: "fade", ms: 0 }).catch((item: unknown) => item);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([error, cleanup]);
    expect((caught as AggregateError & { cause?: unknown }).cause).toBe(error);
  });

  it("cancels the DOM fade and removes its opaque class on failure", async () => {
    const error = new Error("presentation failed");
    const overlay = { style: { opacity: "", transition: "", background: "" }, classList: { toggle: vi.fn() } };
    const driver = domTransitionDriver(overlay as never, {
      firstPresentedFrame: () => Promise.reject(error),
      sleep: (ms, options) => ms === 2000 ? cancellableWait(options?.signal, () => {}) : Promise.resolve()
    });
    await expect(runTransition(driver, () => undefined, { kind: "fade", ms: 10, color: "black" })).rejects.toBe(error);
    expect(overlay.style.opacity).toBe("0");
    expect(overlay.style.transition).toBe("none");
    expect(overlay.classList.toggle).toHaveBeenLastCalledWith("a3g-overlay-opaque", false);
  });

  it("clears the default DOM timer when a wait is aborted", async () => {
    vi.useFakeTimers();
    const overlay = { style: {}, classList: { toggle: vi.fn() } };
    const driver = domTransitionDriver(overlay as never, { firstPresentedFrame: () => Promise.resolve() });
    const controller = new AbortController();
    const wait = driver.sleep(1000, { signal: controller.signal });
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await expect(wait).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not create a DOM timer for an already aborted signal", async () => {
    vi.useFakeTimers();
    const overlay = { style: {}, classList: { toggle: vi.fn() } };
    const driver = domTransitionDriver(overlay as never, { firstPresentedFrame: () => Promise.resolve() });
    const controller = new AbortController();
    controller.abort();
    await expect(driver.sleep(1000, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("game presentation test hook cleanup", () => {
  function installGlobals() {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { querySelector: () => null });
    const report = vi.fn();
    vi.stubGlobal("reportError", report);
    return report;
  }

  it("consumes expected disposal rejection after the owning game becomes inactive", async () => {
    const report = installGlobals();
    const wait = deferred<number>();
    const firstPresentedFrame = vi.fn(() => wait.promise);
    let active = true;
    const hook = installGameTestHook({ stepper: { step: () => {}, firstPresentedFrame }, getSceneId: () => 3, isActive: () => active });
    active = false;
    const error = Object.assign(new Error("disposed"), { name: "AbortError", code: "A3D_GAME_RUNTIME_DISPOSED" });
    wait.reject(error);
    await settleMicrotasks();
    expect(firstPresentedFrame).toHaveBeenCalledTimes(1);
    expect(hook.presentLog).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it("reports unexpected waiter failures without silently rearming", async () => {
    const report = installGlobals();
    const wait = deferred<number>();
    const firstPresentedFrame = vi.fn(() => wait.promise);
    const error = new Error("unexpected presentation failure");
    installGameTestHook({ stepper: { step: () => {}, firstPresentedFrame }, getSceneId: () => 1 });
    wait.reject(error);
    await settleMicrotasks();
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(error);
    expect(firstPresentedFrame).toHaveBeenCalledTimes(1);
  });

  it("reports unexpected failures even if the owner has just become inactive", async () => {
    const report = installGlobals();
    const wait = deferred<number>();
    let active = true;
    const error = new Error("unexpected failure");
    installGameTestHook({ stepper: { step: () => {}, firstPresentedFrame: () => wait.promise }, getSceneId: () => 1, isActive: () => active });
    active = false;
    wait.reject(error);
    await settleMicrotasks();
    expect(report).toHaveBeenCalledWith(error);
  });

  it("does not log or rearm a late success after disposal", async () => {
    const report = installGlobals();
    const wait = deferred<number>();
    const firstPresentedFrame = vi.fn(() => wait.promise);
    let active = true;
    const hook = installGameTestHook({ stepper: { step: () => {}, firstPresentedFrame }, getSceneId: () => 4, isActive: () => active });
    active = false;
    wait.resolve(2);
    await settleMicrotasks();
    expect(hook.presentLog).toEqual([]);
    expect(firstPresentedFrame).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it("cancels a presentation waiter when stepping throws", async () => {
    installGlobals();
    const error = new Error("step failed");
    let stepSignal: AbortSignal | undefined;
    const stepper = {
      step: () => { throw error; },
      firstPresentedFrame(options?: TransitionWaitOptions): Promise<number> {
        if (!options) return new Promise(() => {});
        stepSignal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () => reject(options.signal?.reason), { once: true });
        });
      }
    };
    const hook = installGameTestHook({ stepper, getSceneId: () => 1 });
    await expect(hook.stepFrames(1)).rejects.toBe(error);
    expect(stepSignal?.aborted).toBe(true);
  });

  it("propagates a step presentation failure to the caller", async () => {
    installGlobals();
    const failure = new Error("frame failed");
    const stepper = {
      step: () => {},
      firstPresentedFrame(options?: TransitionWaitOptions): Promise<number> {
        return options ? Promise.reject(failure) : new Promise(() => {});
      }
    };
    const hook = installGameTestHook({ stepper, getSceneId: () => 1 });
    await expect(hook.stepFrames(1)).rejects.toBe(failure);
  });

  it("records a presented frame and rearms while active", async () => {
    const report = installGlobals();
    const first = deferred<number>();
    const next = deferred<number>();
    let active = true;
    const firstPresentedFrame = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(next.promise);
    const hook = installGameTestHook({ stepper: { step: () => {}, firstPresentedFrame }, getSceneId: () => 9, isActive: () => active });
    first.resolve(7);
    await settleMicrotasks();
    expect(hook.presentLog).toEqual([{ frame: 7, overlayOpacity: 0, sceneId: 9 }]);
    expect(firstPresentedFrame).toHaveBeenCalledTimes(2);
    active = false;
    next.reject(new DOMException("disposed", "AbortError"));
    await settleMicrotasks();
    expect(report).not.toHaveBeenCalled();
  });
});
