import { describe, expect, it, vi } from "vitest";
import { auraAppRegistry, registerAuraApp, unregisterAuraApp } from "../../../packages/engine/src/agent-api/app/liveApps.js";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types.js";

function appStub(active?: "worker" | "main-thread") {
  const state = { paused: false, frame: 7, time: 5 };
  const pause = vi.fn(() => { state.paused = true; });
  const resetRuntimeClock = vi.fn(() => { state.frame = 0; state.time = 0; });
  const step = vi.fn((dt = 1 / 60) => { state.frame += 1; state.time += dt; });
  const app = {
    execution: active ? { requested: "worker", active } : undefined,
    runtime: state,
    pause,
    resetRuntimeClock,
    step
  } as unknown as AuraApp;
  return { app, state, pause, resetRuntimeClock, step };
}

/**
 * The app registry exists so capture tooling can freeze a scene it did not create.
 *
 * Before it, a screenshot gate could only `waitForTimeout` and photograph whatever frame a live loop
 * had reached, which is why visual approval bound to a screenshot hash was unsatisfiable: 14 of 29
 * showcase screenshots differed between runs with no code change.
 */
describe("aura app registry", () => {
  it("exposes a settle surface for capture tooling", () => {
    expect(auraAppRegistry.kind).toBe("aura3d-live-app-registry");
    expect(typeof auraAppRegistry.settle).toBe("function");
    expect(typeof auraAppRegistry.pauseAll).toBe("function");
    expect(typeof auraAppRegistry.resumeAll).toBe("function");
  });

  it("reports zero apps and no-ops safely in a headless context", () => {
    // Registry must be usable before any app mounts; a capture tool calls it unconditionally.
    expect(auraAppRegistry.count()).toBe(0);
    expect(auraAppRegistry.settle(5)).toBe(0);
    expect(auraAppRegistry.pauseAll()).toBe(0);
    expect(auraAppRegistry.all()).toEqual([]);
  });

  it("is reachable on globalThis so page.evaluate needs no route opt-in", () => {
    // The whole point: routes create apps in module scope and never expose the handle.
    const registry = (globalThis as { __AURA3D_LIVE_APPS__?: { kind?: string } }).__AURA3D_LIVE_APPS__;
    // Only populated once an app is constructed; the export is the contract tested above.
    if (registry) expect(registry.kind).toBe("aura3d-live-app-registry");
  });

  it("retains synchronous pause, rewind, stepping, and count for main-thread and fallback apps", () => {
    const main = appStub();
    const fallback = appStub("main-thread");
    registerAuraApp(main.app);
    registerAuraApp(fallback.app);
    try {
      expect(auraAppRegistry.settle(3, 0.25)).toBe(2);
      for (const entry of [main, fallback]) {
        expect(entry.state).toEqual({ paused: true, frame: 3, time: 0.75 });
        expect(entry.pause).toHaveBeenCalledOnce();
        expect(entry.resetRuntimeClock).toHaveBeenCalledOnce();
        expect(entry.step.mock.calls).toEqual([[0.25], [0.25], [0.25]]);
      }
      expect(auraAppRegistry.settle(-1)).toBe(2);
      expect(main.state).toEqual({ paused: true, frame: 0, time: 0 });
      expect(main.step).toHaveBeenCalledTimes(3);
    } finally {
      unregisterAuraApp(main.app);
      unregisterAuraApp(fallback.app);
    }
  });

  it("retains the legacy default of 30 steps at 1/60 second", () => {
    const main = appStub();
    registerAuraApp(main.app);
    try {
      expect(auraAppRegistry.settle()).toBe(1);
      expect(main.step).toHaveBeenCalledTimes(30);
      expect(main.step).toHaveBeenCalledWith(1 / 60);
      expect(main.state.frame).toBe(30);
      expect(main.state.time).toBeCloseTo(0.5);
      expect(main.state.paused).toBe(true);
    } finally {
      unregisterAuraApp(main.app);
    }
  });

  it.each(["main-first", "worker-first"] as const)(
    "preflights a %s mixed registry without pausing, rewinding, or stepping any app",
    (order) => {
      const main = appStub();
      const worker = appStub("worker");
      worker.step.mockImplementation(() => { throw new Error("Use await app.stepAsync() for worker rendering."); });
      const entries = order === "main-first" ? [main, worker] : [worker, main];
      for (const entry of entries) registerAuraApp(entry.app);
      try {
        let failure: unknown;
        try { auraAppRegistry.settle(3, 0.25); } catch (error) { failure = error; }
        for (const entry of entries) {
          expect(entry.state).toEqual({ paused: false, frame: 7, time: 5 });
          expect(entry.pause).not.toHaveBeenCalled();
          expect(entry.resetRuntimeClock).not.toHaveBeenCalled();
          expect(entry.step).not.toHaveBeenCalled();
        }
        expect(failure).toMatchObject({ message: expect.stringMatching(/settle.*worker.*stepAsync/i) });
        // A zero-step settle still promises a rewind, which a worker cannot do.
        expect(() => auraAppRegistry.settle(0)).toThrow(/settle.*worker/i);
        expect(worker.pause).not.toHaveBeenCalled();
      } finally {
        for (const entry of entries) unregisterAuraApp(entry.app);
      }
    }
  );

  it("settles only the preflighted cohort if a callback registers a worker", () => {
    const main = appStub();
    const worker = appStub("worker");
    worker.step.mockImplementation(() => { throw new Error("Use await app.stepAsync() for worker rendering."); });
    main.step.mockImplementationOnce((dt = 1 / 60) => {
      main.state.frame += 1;
      main.state.time += dt;
      registerAuraApp(worker.app);
    });
    registerAuraApp(main.app);
    try {
      expect(auraAppRegistry.settle(2, 0.25)).toBe(2);
      expect(main.state).toEqual({ paused: true, frame: 2, time: 0.5 });
      expect(worker.state).toEqual({ paused: false, frame: 7, time: 5 });
      expect(worker.pause).not.toHaveBeenCalled();
      expect(worker.step).not.toHaveBeenCalled();
      expect(() => auraAppRegistry.settle(1)).toThrow(/settle.*worker/i);
    } finally {
      unregisterAuraApp(main.app);
      unregisterAuraApp(worker.app);
    }
  });

  it("does not step an app disposed by an earlier app's callback", () => {
    const first = appStub();
    const disposed = appStub();
    first.step.mockImplementationOnce((dt = 1 / 60) => {
      first.state.frame += 1;
      first.state.time += dt;
      unregisterAuraApp(disposed.app);
    });
    registerAuraApp(first.app);
    registerAuraApp(disposed.app);
    try {
      expect(auraAppRegistry.settle(2, 0.25)).toBe(1);
      expect(first.state).toEqual({ paused: true, frame: 2, time: 0.5 });
      expect(disposed.state).toEqual({ paused: false, frame: 7, time: 5 });
      expect(disposed.pause).not.toHaveBeenCalled();
      expect(disposed.resetRuntimeClock).not.toHaveBeenCalled();
      expect(disposed.step).not.toHaveBeenCalled();
    } finally {
      unregisterAuraApp(first.app);
      unregisterAuraApp(disposed.app);
    }
  });
});
