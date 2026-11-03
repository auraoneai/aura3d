import { describe, expect, it, vi } from "vitest";
import { createGameApp, createGameAppRuntime, lights, primitives, scene, game } from "../../../packages/engine/src";
import { StubTimeController } from "../../../packages/engine/src/contracts/time";
import type { AuraAppFrame, AuraAppFrameCallback, AuraAppHandle } from "../../../packages/engine/src/agent-api/AuraAppHandle";

const runtimeScene = () =>
  scene()
    .add(primitives.box({ name: "prd09 runtime probe" }).runtime(game.runtimeNode("probe")))
    .add(lights.studio());

function pendingProbe(promise: Promise<number>, ms = 30): Promise<"resolved" | "pending"> {
  let settled = false;
  void promise.then(() => { settled = true; });
  return new Promise((resolve) => setTimeout(() => resolve(settled ? "resolved" : "pending"), ms));
}

function presentationHarness() {
  const state = { frame: 0, time: 0, paused: false };
  let callback: AuraAppFrameCallback | undefined;
  const emit = (source: AuraAppFrame["source"], frame: number): void => {
    state.frame = frame;
    callback?.({ dt: 1 / 60, fixedDt: 1 / 60, time: state.time, frame, alpha: 0,
      paused: state.paused, source, substep: 1, substeps: 1 });
  };
  const app = {
    runtime: state,
    onFrame(listener: AuraAppFrameCallback) { callback = listener; return () => { callback = undefined; }; },
    advance(dt: number) { state.time += dt; emit("manual", state.frame + 1); },
    step(dt: number) { state.time += dt; emit("manual", state.frame + 1); },
    pause() { state.paused = true; },
    resume() { state.paused = false; },
    evidence() { return {}; },
    dispose() {}
  } as unknown as AuraAppHandle;
  const runtime = createGameAppRuntime(app, { autoStart: false, loop: { useRaf: false, fixedDt: 1 / 60 } });
  return { runtime, emitRaf: (frame: number) => emit("raf", frame) };
}

describe("GameAppRuntime time seam (PRD-09)", () => {
  it("setTimeScale clamps to [0,4], throws on NaN, and backs timeScale", () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.setTimeScale(0.5);
    expect(runtime.timeScale).toBe(0.5);
    runtime.setTimeScale(9);
    expect(runtime.timeScale).toBe(4);
    runtime.setTimeScale(-2);
    expect(runtime.timeScale).toBe(0);
    expect(() => runtime.setTimeScale(Number.NaN)).toThrow(/AURA_GAME_TIMESCALE_NAN/);
    runtime.dispose();
  });

  it("writes through to a mounted C-23 app.time controller", () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    const controller = new StubTimeController();
    (runtime.app as { time?: StubTimeController }).time = controller;
    runtime.setTimeScale(0.25);
    expect(controller.scale).toBe(0.25);
    expect(runtime.timeScale).toBe(0.25);
    runtime.dispose();
  });

  it("firstPresentedFrame does not resolve on advance() but resolves once after step()", async () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.start();
    const first = runtime.firstPresentedFrame();
    // advance() simulates without presenting — the promise must stay pending.
    runtime.app.advance(1 / 60);
    expect(await pendingProbe(first)).toBe("pending");
    runtime.step(1 / 60);
    await expect(first).resolves.toBe(2);
    runtime.dispose();
  });

  it("resolves presentation waiters when the scheduled loop renders via app.step", async () => {
    let tick: ((time: number) => void) | undefined;
    const runtime = createGameApp(null, {
      autoStart: false,
      scene: runtimeScene(),
      loop: { now: () => 0, requestFrame: (callback) => { tick = callback; return 1; }, cancelFrame: () => {} }
    });
    try {
      runtime.start();
      const first = runtime.firstPresentedFrame();
      expect(tick).toBeDefined();
      tick!(34);
      await expect(first).resolves.toBeGreaterThan(0);
    } finally {
      runtime.dispose();
    }
  });

  it("re-arms: a fresh firstPresentedFrame() call resolves on the next presented frame", async () => {
    const runtime = createGameApp(null, { autoStart: false, scene: runtimeScene() });
    runtime.start();
    runtime.step(1 / 60);
    const first = runtime.firstPresentedFrame();
    runtime.step(1 / 60);
    await expect(first).resolves.toBe(2);
    const second = runtime.firstPresentedFrame();
    expect(await pendingProbe(second)).toBe("pending");
    runtime.step(1 / 60);
    await expect(second).resolves.toBe(3);
    runtime.dispose();
  });

  it("cancels only the requested waiter and detaches its abort listener", async () => {
    const { runtime } = presentationHarness();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const reason = new Error("cancel this waiter");
    const cancelled = runtime.firstPresentedFrame({ signal: controller.signal }).catch((error: unknown) => error);
    const active = runtime.firstPresentedFrame();
    controller.abort(reason);
    expect(await cancelled).toBe(reason);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    runtime.step(1 / 60);
    await expect(active).resolves.toBe(1);
    runtime.dispose();
  });

  it("rejects an already-aborted waiter without registering a listener", async () => {
    const { runtime } = presentationHarness();
    const controller = new AbortController();
    const reason = new Error("already cancelled");
    controller.abort(reason);
    const add = vi.spyOn(controller.signal, "addEventListener");
    await expect(runtime.firstPresentedFrame({ signal: controller.signal })).rejects.toBe(reason);
    expect(add).not.toHaveBeenCalled();
    runtime.dispose();
  });

  it("detaches the abort listener after a successful presentation", async () => {
    const { runtime } = presentationHarness();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const frame = runtime.firstPresentedFrame({ signal: controller.signal });
    runtime.step(1 / 60);
    await expect(frame).resolves.toBe(1);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    await expect(frame).resolves.toBe(1);
    runtime.dispose();
  });

  it("keeps RAF waiters bound to their own frame rather than later registrations", async () => {
    const callbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return callbacks.length; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const { runtime, emitRaf } = presentationHarness();
    try {
      const first = runtime.firstPresentedFrame();
      emitRaf(10);
      let secondResolved = false;
      const second = runtime.firstPresentedFrame().then((frame) => { secondResolved = true; return frame; });
      void second.catch(() => undefined);
      expect(callbacks).toHaveLength(1);
      callbacks.shift()!(16);
      await expect(first).resolves.toBe(10);
      await Promise.resolve();
      expect(secondResolved).toBe(false);
      emitRaf(11);
      callbacks.shift()!(32);
      await expect(second).resolves.toBe(11);
    } finally {
      runtime.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("drops canceled RAF waiters and cancels the callback when none remain", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return 81; });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { runtime, emitRaf } = presentationHarness();
    try {
      const firstController = new AbortController();
      const secondController = new AbortController();
      const firstReason = new Error("first canceled");
      const secondReason = new Error("second canceled");
      const first = runtime.firstPresentedFrame({ signal: firstController.signal }).catch((error: unknown) => error);
      const second = runtime.firstPresentedFrame({ signal: secondController.signal }).catch((error: unknown) => error);
      emitRaf(4);
      firstController.abort(firstReason);
      expect(await first).toBe(firstReason);
      expect(cancel).not.toHaveBeenCalled();
      secondController.abort(secondReason);
      expect(await second).toBe(secondReason);
      expect(cancel).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledWith(81);

      const later = runtime.firstPresentedFrame();
      let laterResolved = false;
      void later.then(() => { laterResolved = true; }, () => undefined);
      callbacks[0]!(16); // A canceled host callback may still run.
      await Promise.resolve();
      expect(laterResolved).toBe(false);
      emitRaf(5);
      callbacks[1]!(32);
      await expect(later).resolves.toBe(5);
    } finally {
      runtime.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("does not resolve a waiter registered during a frame from that frame", async () => {
    const { runtime } = presentationHarness();
    let later: Promise<number> | undefined;
    let laterResolved = false;
    runtime.onFrame((frame) => {
      if (frame.frame === 1) later = runtime.firstPresentedFrame().then((value) => { laterResolved = true; return value; });
    });
    const first = runtime.firstPresentedFrame();
    runtime.step(1 / 60);
    await expect(first).resolves.toBe(1);
    await Promise.resolve();
    expect(laterResolved).toBe(false);
    runtime.step(1 / 60);
    await expect(later).resolves.toBe(2);
    runtime.dispose();
  });

  it("does not report a presentation when a manual step emits no render", async () => {
    const { runtime } = presentationHarness();
    let resolved = false;
    const frame = runtime.firstPresentedFrame().then((value) => { resolved = true; return value; });
    runtime.step(0);
    await Promise.resolve();
    expect(resolved).toBe(false);
    runtime.step(1 / 60);
    await expect(frame).resolves.toBe(1);
    runtime.dispose();
  });

  it("rejects pending and frame-claimed waiters on disposal and cancels its RAF", async () => {
    const callbacks: FrameRequestCallback[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.push(callback); return 73; });
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const { runtime, emitRaf } = presentationHarness();
    try {
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      const claimed = runtime.firstPresentedFrame({ signal: controller.signal }).catch((error: unknown) => error);
      emitRaf(5);
      const pending = runtime.firstPresentedFrame().catch((error: unknown) => error);
      runtime.dispose();
      expect(await claimed).toMatchObject({ name: "AbortError", code: "A3D_GAME_RUNTIME_DISPOSED" });
      expect(await pending).toMatchObject({ name: "AbortError", code: "A3D_GAME_RUNTIME_DISPOSED" });
      expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
      expect(cancel).toHaveBeenCalledWith(73);
      callbacks[0]!(16);
      expect(() => runtime.firstPresentedFrame()).toThrow(/after dispose/);
    } finally {
      runtime.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("keeps frame numbers distinct for a reentrant manual step", async () => {
    const { runtime } = presentationHarness();
    let nested: Promise<number> | undefined;
    let entered = false;
    runtime.onFrame(() => {
      if (entered) return;
      entered = true;
      nested = runtime.firstPresentedFrame();
      runtime.step(1 / 60);
    });
    const outer = runtime.firstPresentedFrame();
    runtime.step(1 / 60);
    await expect(outer).resolves.toBe(1);
    await expect(nested).resolves.toBe(2);
    runtime.dispose();
  });
});
