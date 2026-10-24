import { describe, expect, it, vi } from "vitest";
import {
  createCountedRng,
  createFixedStepLoop,
  fixedStepLoop,
  installQaHooks,
  qaErrorGlobalName,
  qaHookGlobalName,
  readQaParams
} from "../../../packages/engine/src/qa/index.js";

describe("createCountedRng", () => {
  it("is deterministic per seed and counts draws", () => {
    const a = createCountedRng(7);
    const b = createCountedRng(7);
    const seq = [a.next(), a.next(), a.next()];
    expect(seq).toEqual([b.next(), b.next(), b.next()]);
    expect(a.count).toBe(3);
    expect(seq.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it("matches the mulberry32 stream the ports record (seed 1, first draws)", () => {
    const rng = createCountedRng(1);
    expect(rng.next()).toBeCloseTo(0.6270739405881613, 15);
    expect(rng.next()).toBeCloseTo(0.002735721180215478, 15);
  });

  it("reset restarts the stream and zeroes the counter, optionally re-seeding", () => {
    const rng = createCountedRng(3);
    const first = rng.next();
    rng.next();
    rng.reset();
    expect(rng.count).toBe(0);
    expect(rng.next()).toBe(first);
    rng.reset(9);
    expect(rng.seed).toBe(9);
    expect(rng.next()).not.toBe(first);
  });

  it("range and int stay inside their bounds and validate arguments", () => {
    const rng = createCountedRng(11);
    for (let i = 0; i < 200; i++) {
      const r = rng.range(-2, 5);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(5);
      const n = rng.int(3, 8);
      expect(Number.isInteger(n) && n >= 3 && n < 8).toBe(true);
    }
    expect(() => rng.range(2, 1)).toThrow(RangeError);
    expect(() => rng.int(1, 1)).toThrow(RangeError);
  });
});

describe("readQaParams", () => {
  const schema = {
    manual: { type: "flag" },
    autostart: { type: "flag" },
    warmup: { type: "int", default: 30 },
    speed: { type: "number", default: 1 },
    quality: { type: "enum", values: ["high", "low"], default: "high" },
    script: { type: "string" }
  } as const;

  it("returns defaults for an empty query", () => {
    expect(readQaParams(schema, "")).toEqual({ manual: false, autostart: false, warmup: 30, speed: 1, quality: "high", script: undefined });
  });

  it("parses flags, numbers, enums and strings", () => {
    const v = readQaParams(schema, "?manual=1&autostart=true&warmup=12.9&speed=2.5&quality=low&script=abc");
    expect(v).toEqual({ manual: true, autostart: true, warmup: 12, speed: 2.5, quality: "low", script: "abc" });
  });

  it("treats a bare key as a flag and falls back on bad numbers and enum values", () => {
    const v = readQaParams(schema, "?manual&warmup=nope&speed=&quality=ultra");
    expect(v.manual).toBe(true);
    expect(v.warmup).toBe(30);
    expect(v.speed).toBe(1);
    expect(v.quality).toBe("high");
  });

  it("treats 0 and other values as a false flag", () => {
    expect(readQaParams(schema, "?manual=0").manual).toBe(false);
  });
});

function manualScheduler() {
  let pending: ((now: number) => void) | null = null;
  let id = 0;
  return {
    schedule(cb: (now: number) => void) {
      pending = cb;
      return ++id;
    },
    cancel() {
      pending = null;
    },
    fire(now: number) {
      const cb = pending;
      pending = null;
      cb?.(now);
    },
    get armed() {
      return pending !== null;
    }
  };
}

describe("createFixedStepLoop", () => {
  it("exports the fixedStepLoop alias", () => {
    expect(fixedStepLoop).toBe(createFixedStepLoop);
  });

  it("runs fixed steps from variable frame times and renders once per frame", () => {
    const step = vi.fn();
    const render = vi.fn();
    const loop = createFixedStepLoop({ step, render, now: () => 0 });
    expect(loop.tick(1000 / 30)).toBe(2); // 33.3 ms since the clock origin -> 2 fixed steps
    expect(render).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith(expect.closeTo(1 / 30, 9));
    expect(loop.tick(1000 / 30 + 20)).toBe(1); // a 20 ms frame covers one 16.7 ms step
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("accumulates fractional time across frames", () => {
    const step = vi.fn();
    const loop = createFixedStepLoop({ step });
    loop.tick(0);
    // 10 ms frames: 1 step after the second frame (20 ms >= 16.67), another after the 4th
    const counts = [10, 20, 30, 40].map((t) => loop.tick(t));
    expect(counts).toEqual([0, 1, 0, 1]);
    expect(loop.steps).toBe(2);
    expect(step).toHaveBeenCalledWith(1 / 60, 0);
    expect(step).toHaveBeenLastCalledWith(1 / 60, 1);
  });

  it("resetAccumulator drops carried time without touching the step count", () => {
    const loop = createFixedStepLoop({ step: vi.fn() });
    loop.tick(0);
    loop.tick(10);
    expect(loop.accumulator).toBeCloseTo(0.011, 9); // 1 ms minimum frame on tick(0) plus 10 ms
    loop.resetAccumulator();
    expect(loop.accumulator).toBe(0);
    expect(loop.tick(20)).toBe(0); // 10 ms alone is not a step
    expect(loop.steps).toBe(0);
  });

  it("clamps long frames and caps catch-up steps", () => {
    const step = vi.fn();
    const loop = createFixedStepLoop({ step });
    loop.tick(0);
    expect(loop.tick(60_000)).toBe(6); // clamped to 0.1 s -> 6 steps
    expect(loop.accumulator).toBeLessThan(1 / 60);
    const capped = createFixedStepLoop({ step: vi.fn(), maxCatchUpSteps: 2, maxFrameSeconds: 1 });
    capped.tick(0);
    expect(capped.tick(1000)).toBe(2);
    expect(capped.accumulator).toBe(0); // the remaining backlog is dropped, not replayed
  });

  it("manual mode never advances on its own; advance(n) runs exactly n steps and renders once", () => {
    const step = vi.fn();
    const render = vi.fn();
    const loop = createFixedStepLoop({ step, render, manual: true });
    loop.tick(0);
    expect(loop.tick(5000)).toBe(0);
    expect(step).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    const before = vi.fn();
    expect(loop.advance(5, before)).toBe(5);
    expect(step).toHaveBeenCalledTimes(5);
    expect(before.mock.calls.map((c) => c[0])).toEqual([0, 1, 2, 3, 4]);
    expect(render).toHaveBeenCalledTimes(1);
    expect(loop.steps).toBe(5);
    loop.manual = false;
    loop.tick(5100);
    expect(step.mock.calls.length).toBeGreaterThan(5);
  });

  it("isActive=false pauses stepping and rendering but keeps the clock", () => {
    let active = false;
    const step = vi.fn();
    const render = vi.fn();
    const loop = createFixedStepLoop({ step, render, isActive: () => active });
    loop.tick(0);
    loop.tick(100);
    expect(step).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    active = true;
    expect(loop.tick(116)).toBe(0); // only 16 ms since the paused tick: below one step
    expect(loop.tick(200)).toBeGreaterThan(0);
  });

  it("start schedules frames, stop cancels them, and start is idempotent", () => {
    const s = manualScheduler();
    const step = vi.fn();
    const loop = createFixedStepLoop({ step, schedule: s.schedule, cancel: s.cancel, now: () => 0 });
    loop.start();
    loop.start();
    expect(loop.running).toBe(true);
    expect(s.armed).toBe(true);
    s.fire(100); // 0.1 s => 6 steps
    expect(step).toHaveBeenCalledTimes(6);
    expect(s.armed).toBe(true); // re-armed for the next frame
    loop.stop();
    expect(loop.running).toBe(false);
    expect(s.armed).toBe(false);
  });

  it("rejects a non-positive step length", () => {
    expect(() => createFixedStepLoop({ step: () => {}, stepSeconds: 0 })).toThrow(RangeError);
  });
});

describe("installQaHooks", () => {
  it("derives global names", () => {
    expect(qaHookGlobalName("splat-rush")).toBe("__AURA_SPLAT_RUSH__");
    expect(qaHookGlobalName(" Last Train ")).toBe("__AURA_LAST_TRAIN__");
    expect(qaErrorGlobalName("wind")).toBe("__AURA_WIND_ERROR__");
  });

  it("installs the standard hooks on the target and merges extras", () => {
    const target: Record<string, unknown> = {};
    let n = 0;
    const installed = installQaHooks<{ n: number }, { dx: number }, { custom: () => string }>("demo-game", {
      target,
      ready: () => true,
      state: () => ({ n }),
      stepFrames: (count, input) => {
        n += count + (input?.dx ?? 0);
      },
      reset: (seed) => {
        n = seed ?? 0;
      },
      seed: 5,
      traceColumns: ["n"],
      traceRow: () => [n],
      nodeCount: () => 3,
      extras: { custom: () => "x" }
    });
    const hooks = target.__AURA_DEMO_GAME__ as typeof installed.hooks;
    expect(hooks).toBe(installed.hooks);
    expect(hooks.ready()).toBe(true);
    expect(hooks.seed).toBe(5);
    expect(hooks.stepFrames(4, { dx: 1 })).toEqual({ n: 5 });
    hooks.reset(2);
    expect(hooks.state()).toEqual({ n: 2 });
    expect(hooks.traceColumns).toEqual(["n"]);
    expect(hooks.traceRow()).toEqual([2]);
    expect(hooks.nodeCount()).toBe(3);
    expect(hooks.custom()).toBe("x");
    expect(hooks.info()).toBeNull();
    expect(hooks.diagnostics()).toBeNull();
    expect(hooks.routeHealth()).toBeNull();
  });

  it("extras win over standard hooks on name clashes", () => {
    const target: Record<string, unknown> = {};
    const { hooks } = installQaHooks("clash", { target, ready: () => false, state: () => 1, extras: { state: () => 99 } });
    expect(hooks.state()).toBe(99);
  });

  it("throws a clear error for replay when the game did not provide one", () => {
    const target: Record<string, unknown> = {};
    const { hooks } = installQaHooks("norep", { target, ready: () => true, state: () => 0 });
    expect(() => hooks.replay("x")).toThrow(/replay is not supported/);
  });

  it("resolves the app lazily for info and diagnostics", () => {
    const target: Record<string, unknown> = {};
    let app: { info(): unknown; diagnostics(): unknown } | undefined;
    const { hooks } = installQaHooks("lazy", { target, ready: () => true, state: () => 0, app: () => app });
    expect(hooks.info()).toBeNull();
    app = { info: () => ({ backend: "webgl2" }), diagnostics: () => ({ drawCalls: 9 }) };
    expect(hooks.info()).toEqual({ backend: "webgl2" });
    expect(hooks.diagnostics()).toEqual({ drawCalls: 9 });
  });

  it("info accepts either a getter function or the info object itself", () => {
    const target: Record<string, unknown> = {};
    const object = installQaHooks("infoobj", { target, ready: () => true, state: () => 0, app: { info: { calls: 3 } } });
    expect(object.hooks.info()).toEqual({ calls: 3 });
    const fn = installQaHooks("infofn", { target, ready: () => true, state: () => 0, app: { info: () => ({ calls: 4 }) } });
    expect(fn.hooks.info()).toEqual({ calls: 4 });
  });

  it("frame and pixels fail with a named error until an app with capture() is mounted", async () => {
    const target: Record<string, unknown> = {};
    const { hooks } = installQaHooks("cap", { target, ready: () => true, state: () => 0 });
    await expect(hooks.frame()).rejects.toThrow(/__AURA_CAP__: no app with capture/);
    await expect(hooks.pixels()).rejects.toThrow(/no app with capture/);
  });

  it("reportError keeps the first error and uninstall removes both globals", () => {
    const target: Record<string, unknown> = {};
    const installed = installQaHooks("err", { target, ready: () => true, state: () => 0 });
    installed.reportError(new Error("first"));
    installed.reportError(new Error("second"));
    expect(String(target.__AURA_ERR_ERROR__)).toContain("first");
    expect(String(target.__AURA_ERR_ERROR__)).not.toContain("second");
    installed.uninstall();
    expect(target.__AURA_ERR__).toBeUndefined();
    expect(target.__AURA_ERR_ERROR__).toBeUndefined();
  });
});
