import { describe, expect, it, vi } from "vitest";
import { normalizeSceneSnapshot, scene, StubTimeController } from "../../../packages/engine/src";
import { createGameImplWithGameApp, type GameImplementationBindings } from "../../../packages/game/src/createGameCore";

type Backend = "webgl2" | "webgpu" | "canvas2d" | "headless";
type ReadyOutcome =
  | { readonly state: "ready"; readonly stage: "renderer" | "first-frame"; readonly backend: "webgl2" | "webgpu" }
  | { readonly state: "failed"; readonly code: string; readonly message: string }
  | { readonly state: "cancelled" | "disposed" };
type Termination =
  | { readonly state: "failed"; readonly revision: number; readonly code: string; readonly message: string }
  | { readonly state: "device-lost" | "superseded" | "disposed"; readonly revision: number };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Flush promise continuations without advancing a timer or presenting a frame. */
async function flush() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

const bindings: GameImplementationBindings = {
  normalizeSceneSnapshot,
  StubTimeController,
  createGameAudio: (() => { throw new Error("unexpected audio creation"); }) as GameImplementationBindings["createGameAudio"],
  bindFeelSound: (() => { throw new Error("unexpected sound binding"); }) as GameImplementationBindings["bindFeelSound"]
};

/**
 * The real game/session are exercised with a deterministic app/runtime seam.
 * A blank submitted frame and a frame with a draw are deliberately distinct.
 */
function makeGame(backend: Backend = "webgl2") {
  let revision = 1;
  let disposed = false;
  let lost = false;
  let loseDuringSubscribe = false;
  let drawCalls = 0;
  let strictReadyFailure: Error | undefined;
  let renderer: ReadyOutcome = { state: "ready", stage: "renderer", backend: backend === "webgpu" ? "webgpu" : "webgl2" };
  let firstFrame = deferred<ReadyOutcome>();
  let firstFrameSettled = false;
  let termination: Termination | undefined;
  const lossListeners = new Set<() => void>();
  const terminationListeners = new Set<(event: Termination) => void>();
  const frameListeners = new Set<(frame: { dt: number }) => void>();
  const waiters = new Set<{
    resolve: (frame: number) => void;
    reject: (error: unknown) => void;
    signal?: AbortSignal;
    abort?: () => void;
  }>();
  const evidence = { frame: 0 };

  const waitOutcome = (promise: Promise<ReadyOutcome>, signal?: AbortSignal): Promise<ReadyOutcome> => {
    if (!signal) return promise;
    if (signal.aborted) return Promise.resolve({ state: "cancelled" });
    return new Promise((resolve) => {
      let done = false;
      const finish = (value: ReadyOutcome) => {
        if (done) return;
        done = true;
        signal.removeEventListener("abort", abort);
        resolve(value);
      };
      const abort = () => finish({ state: "cancelled" });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      void promise.then(finish);
    });
  };
  const settleFirstFrame = (outcome: ReadyOutcome) => {
    if (firstFrameSettled) return;
    firstFrameSettled = true;
    firstFrame.resolve(outcome);
  };
  const emitDeviceLoss = () => {
    lost = true;
    termination = { state: "device-lost", revision };
    for (const listener of [...terminationListeners]) listener(termination);
    for (const listener of [...lossListeners]) listener();
  };
  const supersedeMount = () => {
    const oldRevision = revision;
    settleFirstFrame({ state: "cancelled" });
    revision += 1;
    termination = undefined;
    firstFrame = deferred<ReadyOutcome>();
    firstFrameSettled = false;
    drawCalls = 0;
    const event: Termination = { state: "superseded", revision: oldRevision };
    for (const listener of [...terminationListeners]) listener(event);
  };
  const releaseWaiter = (waiter: (typeof waiters extends Set<infer W> ? W : never)) => {
    waiters.delete(waiter);
    if (waiter.signal && waiter.abort) waiter.signal.removeEventListener("abort", waiter.abort);
  };
  const runtime = {
    running: false,
    paused: true,
    evidence,
    input: undefined,
    start: vi.fn(() => { runtime.running = true; runtime.paused = false; }),
    pause: vi.fn(() => { runtime.running = false; runtime.paused = true; }),
    resume: vi.fn(() => { runtime.running = true; runtime.paused = false; }),
    onFrame(callback: (frame: { dt: number }) => void) {
      frameListeners.add(callback);
      return () => { frameListeners.delete(callback); };
    },
    firstPresentedFrame(options?: { readonly signal?: AbortSignal }): Promise<number> {
      const signal = options?.signal;
      if (disposed || signal?.aborted) {
        return Promise.reject(signal?.reason ?? Object.assign(new Error("runtime disposed"), { name: "AbortError" }));
      }
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject, signal, abort: undefined as (() => void) | undefined };
        waiter.abort = () => {
          releaseWaiter(waiter);
          reject(signal?.reason ?? Object.assign(new Error("presentation cancelled"), { name: "AbortError" }));
        };
        waiters.add(waiter);
        signal?.addEventListener("abort", waiter.abort, { once: true });
        if (signal?.aborted) waiter.abort();
      });
    },
    dispose() {
      disposed = true;
      for (const waiter of [...waiters]) {
        releaseWaiter(waiter);
        waiter.reject(Object.assign(new Error("runtime disposed"), { name: "AbortError", code: "A3D_GAME_RUNTIME_DISPOSED" }));
      }
      frameListeners.clear();
    },
    app: undefined as unknown
  };
  const app = {
    get backend() { return backend; },
    nodes: { get: () => undefined },
    camera: {},
    diagnostics: () => ({ drawCalls }),
    ready: async () => { if (strictReadyFailure) throw strictReadyFailure; },
    readiness(options?: { readonly stage?: "renderer" | "first-frame"; readonly signal?: AbortSignal }) {
      if (disposed) return Promise.resolve({ state: "disposed" } as const);
      if (lost) return Promise.resolve({ state: "failed", code: "device-lost", message: "Synthetic device loss" } as const);
      const value = options?.stage === "first-frame" ? firstFrame.promise : Promise.resolve(renderer);
      return waitOutcome(value, options?.signal);
    },
    onDeviceLost(listener: () => void) {
      lossListeners.add(listener);
      if (loseDuringSubscribe) { loseDuringSubscribe = false; emitDeviceLoss(); }
      return () => { lossListeners.delete(listener); };
    },
    onDeviceRestored() { return () => {}; },
    deviceLost: () => lost,
    onRenderTermination(listener: (event: Termination) => void) {
      terminationListeners.add(listener);
      if (loseDuringSubscribe) { loseDuringSubscribe = false; emitDeviceLoss(); }
      return () => { terminationListeners.delete(listener); };
    },
    renderTermination: () => termination,
    setScene: async () => { supersedeMount(); },
    disposeAsync: async () => {}
  };
  runtime.app = app;
  const game = createGameImplWithGameApp(() => runtime as never, bindings, {
    id: "synthetic-ready", target: null, autoStart: false, scene: () => scene()
  });

  return {
    game,
    runtime,
    app,
    setRenderer(outcome: ReadyOutcome) {
      renderer = outcome;
      if (outcome.state !== "ready") settleFirstFrame(outcome);
    },
    setStrictReadyFailure(error?: Error) { strictReadyFailure = error; },
    loseDuringSubscription() { loseDuringSubscribe = true; },
    currentWaiters: () => waiters.size,
    currentListeners: () => lossListeners.size + terminationListeners.size,
    present(count: number) {
      drawCalls = count;
      evidence.frame += 1;
      settleFirstFrame({ state: "ready", stage: "first-frame", backend: backend === "webgpu" ? "webgpu" : "webgl2" });
      const current = [...waiters];
      for (const waiter of current) { releaseWaiter(waiter); waiter.resolve(evidence.frame); }
    },
    setDrawn(count: number) {
      drawCalls = count;
      if (count > 0) settleFirstFrame({ state: "ready", stage: "first-frame", backend: backend === "webgpu" ? "webgpu" : "webgl2" });
    },
    emitLoss: emitDeviceLoss,
    emitFailure(code = "frame-failed", message = "Synthetic terminal frame failure") {
      termination = { state: "failed", revision, code, message };
      for (const listener of [...terminationListeners]) listener(termination);
    },
    failFirstFrame(code = "first-frame-failed", message = "Synthetic first-frame failure") {
      settleFirstFrame({ state: "failed", code, message });
    },
    recover() {
      lost = false;
      termination = undefined;
      revision += 1;
      renderer = { state: "ready", stage: "renderer", backend: backend === "webgpu" ? "webgpu" : "webgl2" };
      firstFrame = deferred<ReadyOutcome>();
      firstFrameSettled = false;
      drawCalls = 0;
    },
    supersede: supersedeMount
  };
}

describe("public game readiness failure and lifetime", () => {
  it("rejects a non-strict GPU mount failure instead of waiting for a frame", async () => {
    const h = makeGame();
    h.setRenderer({ state: "failed", code: "mount-failed", message: "Synthetic mount failure" });
    try {
      const result = h.game.ready();
      await expect(result).rejects.toMatchObject({ code: "mount-failed", message: "Synthetic mount failure" });
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("preserves a strict mount rejection and does not enter playing", async () => {
    const h = makeGame("webgpu");
    const failure = Object.assign(new Error("Synthetic strict failure"), { code: "strict-mount" });
    h.setStrictReadyFailure(failure);
    try {
      await expect(h.game.ready()).rejects.toMatchObject({ code: "strict-mount", message: "Synthetic strict failure" });
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("keeps a healthy manual game pending through a blank frame until a draw is presented", async () => {
    const h = makeGame();
    try {
      const observer = vi.fn();
      const ready = h.game.ready();
      void ready.then(observer, observer);
      await flush();
      expect(h.runtime.start).not.toHaveBeenCalled();
      expect(observer).not.toHaveBeenCalled();
      h.present(0);
      await flush();
      expect(observer).not.toHaveBeenCalled();
      expect(h.game.session.state).not.toBe("playing");
      h.present(2);
      await expect(ready).resolves.toBeUndefined();
      expect(h.game.session.state).toBe("playing");
      expect(h.runtime.start).not.toHaveBeenCalled();
    } finally { await h.game.dispose(); }
  });

  it("rejects a terminal render error after a blank submitted frame and removes readiness waiters", async () => {
    const h = makeGame();
    try {
      const ready = h.game.ready();
      const rejected = expect(ready).rejects.toMatchObject({ code: "frame-failed", message: "Synthetic terminal frame failure" });
      await flush();
      h.present(0);
      await flush();
      expect(h.game.session.state).not.toBe("playing");
      h.emitFailure();
      await rejected;
      await flush();
      expect(h.currentListeners()).toBe(0);
      expect(h.currentWaiters()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("rejects a structured first-frame failure before any draw", async () => {
    const h = makeGame();
    try {
      const rejected = expect(h.game.ready()).rejects.toMatchObject({ code: "first-frame-failed", message: "Synthetic first-frame failure" });
      await flush();
      h.failFirstFrame();
      await rejected;
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("rejects device loss while awaiting a draw and removes readiness listeners", async () => {
    const h = makeGame();
    try {
      const rejected = expect(h.game.ready()).rejects.toMatchObject({ code: "device-lost" });
      await flush();
      h.emitLoss();
      await rejected;
      await flush();
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
      // One independent first-frame beacon waiter may still exist.
      expect(h.currentWaiters()).toBeLessThanOrEqual(1);
    } finally { await h.game.dispose(); }
  });

  it("observes an already-lost device before waiting for a frame", async () => {
    const h = makeGame();
    h.emitLoss();
    try {
      await expect(h.game.ready()).rejects.toMatchObject({ code: "device-lost" });
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("rechecks device loss after a draw resolves but before entering playing", async () => {
    const h = makeGame();
    try {
      const rejected = expect(h.game.ready()).rejects.toMatchObject({ code: "device-lost" });
      await flush();
      h.present(1);
      h.emitLoss();
      await rejected;
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("observes an already-recorded terminal frame failure", async () => {
    const h = makeGame();
    h.emitFailure();
    try {
      await expect(h.game.ready()).rejects.toMatchObject({ code: "frame-failed" });
      expect(h.game.session.state).not.toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("handles a device loss reentered during subscription without leaving listeners", async () => {
    const h = makeGame();
    h.loseDuringSubscription();
    try {
      await expect(h.game.ready()).rejects.toMatchObject({ code: "device-lost" });
      await flush();
      expect(h.currentListeners()).toBe(0);
      expect(h.game.session.state).not.toBe("playing");
    } finally { await h.game.dispose(); }
  });

  it("rejects disposal and cancels the pending presented-frame subscription", async () => {
    const h = makeGame();
    const result = expect(h.game.ready()).rejects.toThrow(/GAME_DISPOSED_V1/);
    await flush();
    await h.game.dispose();
    await result;
    expect(h.currentWaiters()).toBe(0);
    expect(h.currentListeners()).toBe(0);
    expect(h.game.session.state).toBe("disposed");
  });

  it("rearms the same pending readiness after a mount is superseded", async () => {
    const h = makeGame();
    try {
      const observer = vi.fn();
      const ready = h.game.ready();
      void ready.then(observer, observer);
      await flush();
      h.supersede();
      await flush();
      expect(observer).not.toHaveBeenCalled();
      h.present(3);
      await expect(ready).resolves.toBeUndefined();
      expect(h.game.session.state).toBe("playing");
      expect(h.currentListeners()).toBe(0);
    } finally { await h.game.dispose(); }
  });

  it("allows an explicit retry after a failed mount is recovered", async () => {
    const h = makeGame();
    h.setRenderer({ state: "failed", code: "mount-failed", message: "Synthetic mount failure" });
    try {
      const failed = h.game.ready();
      await expect(failed).rejects.toMatchObject({ code: "mount-failed" });
      h.recover();
      const retried = h.game.ready();
      expect(retried).not.toBe(failed);
      await flush();
      h.present(1);
      await expect(retried).resolves.toBeUndefined();
      expect(h.game.session.state).toBe("playing");
    } finally { await h.game.dispose(); }
  });

  it("rechecks readiness after the game applies a new scene", async () => {
    const h = makeGame();
    try {
      h.setDrawn(1);
      h.game.start();
      await h.game.ready();
      await h.game.setScene(scene() as never);
      const observer = vi.fn();
      const ready = h.game.ready();
      void ready.then(observer, observer);
      await flush();
      expect(observer).not.toHaveBeenCalled();
      h.present(1);
      await expect(ready).resolves.toBeUndefined();
    } finally { await h.game.dispose(); }
  });

  it("does not resume an already-paused game when ready is called again", async () => {
    const h = makeGame();
    try {
      h.setDrawn(1);
      h.game.start();
      await h.game.ready();
      h.game.session.pause("user");
      expect(h.game.session.state).toBe("paused");
      expect(h.runtime.running).toBe(false);
      await h.game.ready();
      expect(h.game.session.state).toBe("paused");
      expect(h.runtime.resume).not.toHaveBeenCalled();
    } finally { await h.game.dispose(); }
  });

  it.each(["results", "title"] as const)("restarts from %s after an earlier successful readiness", async (state) => {
    const h = makeGame();
    try {
      h.setDrawn(1);
      h.game.start();
      await h.game.ready();
      h.game.sessionImpl.transition(state);
      h.game.start();
      await h.game.ready();
      expect(h.game.session.state).toBe("playing");
    } finally { await h.game.dispose(); }
  });

  it.each(["headless", "canvas2d"] as const)("preserves manually presented %s games", async (backend) => {
    const h = makeGame(backend);
    h.setRenderer({ state: "failed", code: "renderer-unavailable", message: "No GPU renderer" });
    try {
      const observer = vi.fn();
      const ready = h.game.ready();
      void ready.then(observer, observer);
      await flush();
      expect(observer).not.toHaveBeenCalled();
      h.present(0);
      await flush();
      expect(observer).not.toHaveBeenCalled();
      h.present(1);
      await expect(ready).resolves.toBeUndefined();
      expect(h.game.session.state).toBe("playing");
    } finally { await h.game.dispose(); }
  });
});
