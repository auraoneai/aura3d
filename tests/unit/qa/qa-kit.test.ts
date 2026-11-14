import { describe, expect, it, vi } from "vitest";
import {
  analyzeQaAudioSamples,
  createCountedRng,
  createFixedStepLoop,
  createQaOfflineAudio,
  createQaRunMonitor,
  findNonFinitePaths,
  fixedStepLoop,
  hashQaPixels,
  installQaHooks,
  installQaTelemetryHooks,
  installVirtualGamepads,
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

  it("keeps getter extras live and lets a getter replace a standard hook", () => {
    const target: Record<string, unknown> = {};
    let ready = false;
    let frames = 0;
    const { hooks } = installQaHooks("getters", {
      target,
      ready: () => ready,
      state: () => 1,
      extras: {
        get ready() { return ready; },
        get frames() { return frames; }
      }
    });
    const api = hooks as unknown as { ready: boolean; frames: number };
    expect(api.ready).toBe(false);
    expect(api.frames).toBe(0);
    ready = true;
    frames = 7;
    expect(api.ready).toBe(true);
    expect(api.frames).toBe(7);
    expect(hooks.state()).toBe(1);
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

  it("keeps extras getters live instead of freezing them at install time", () => {
    const target: Record<string, unknown> = {};
    let ready = false;
    const { hooks } = installQaHooks("live", {
      target,
      ready: () => false,
      state: () => 1,
      extras: {
        get ready() {
          return ready;
        }
      }
    });
    expect((hooks as unknown as { ready: boolean }).ready).toBe(false);
    ready = true;
    expect((target.__AURA_LIVE__ as { ready: boolean }).ready).toBe(true);
  });

  it("tracks step timing, first-seen non-finite state paths, and resets telemetry on reset()", () => {
    const target: Record<string, unknown> = {};
    let nowMs = 100;
    let vx = 1;
    let step = 0;
    const { hooks } = installQaTelemetryHooks("telemetry-demo", {
      target,
      ready: () => true,
      state: () => ({ step, player: { vel: { x: vx, y: 0 } } }),
      stepFrames: (n) => {
        step += n;
        nowMs += n * 2;
      },
      reset: () => {
        step = 0;
        vx = 1;
      },
      telemetry: { now: () => nowMs }
    });

    hooks.stepFrames(3, { move: 1 });
    vx = Number.NaN;
    hooks.stepFrames(2);
    // Repeated NaN on the same path is deduplicated to its first-seen step.
    hooks.stepFrames(1);

    const snap = hooks.telemetry();
    expect(snap.steps).toBe(6);
    expect(snap.inputs).toBe(1);
    expect(snap.stepTiming.steps).toBe(6);
    expect(snap.stepTiming.meanMs).toBeCloseTo(2, 5);
    expect(snap.stepTiming.maxMs).toBeCloseTo(2, 5);
    expect(snap.nonFinite).toEqual([{ step: 5, path: "player.vel.x", value: "NaN" }]);
    expect(hooks.checkState()).toEqual([{ step: 5, path: "player.vel.x", value: "NaN" }]);

    hooks.reset();
    expect(hooks.telemetry().steps).toBe(0);
    expect(hooks.telemetry().nonFinite).toEqual([]);
  });
});

describe("QA telemetry helpers (findNonFinitePaths, hashQaPixels, createQaRunMonitor)", () => {
  it("walks nested objects and arrays safely (including cycles) and respects maxDepth", () => {
    const cyclic: Record<string, unknown> = { ok: 4, bad: Number.POSITIVE_INFINITY };
    cyclic.self = cyclic;
    const state = {
      score: 10,
      items: [{ x: 0 }, { x: Number.NEGATIVE_INFINITY }],
      actor: cyclic,
      tooDeep: { l1: { l2: { l3: { l4: Number.NaN } } } }
    };
    expect(findNonFinitePaths(state, { maxDepth: 4 })).toEqual([
      { path: "items[1].x", value: "-Infinity" },
      { path: "actor.bad", value: "Infinity" }
    ]);
    expect(findNonFinitePaths(state, { maxDepth: 6 })).toContainEqual({
      path: "tooDeep.l1.l2.l3.l4",
      value: "NaN"
    });
  });

  it("hashes RGBA buffers deterministically and distinguishes uniform blank vs drawn frames", () => {
    const blank = hashQaPixels({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([12, 34, 56, 255, 12, 34, 56, 255])
    });
    const drawn = hashQaPixels({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([12, 34, 56, 255, 99, 34, 56, 255])
    });
    expect(blank.blank).toBe(true);
    expect(drawn.blank).toBe(false);
    expect(drawn.hash).not.toBe(blank.hash);
    expect(drawn.hash).toHaveLength(8);
  });

  it("flags visual stuck only when frame hash stays unchanged across stuckAfterSteps while inputs arrive", async () => {
    let clock = 0;
    const monitor = createQaRunMonitor({ stuckAfterSteps: 10, now: () => clock });
    let pixelByte = 20;
    const samplePixels = () => ({
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([pixelByte, 0, 0, 255, 0, 50, 0, 255])
    });

    await monitor.measurePixels(async () => {
      clock += 20;
      return samplePixels();
    });
    // 12 steps with NO input -> idle screen, NOT stuck.
    monitor.recordSteps(12, false, () => {
      clock += 6;
    });
    await monitor.measurePixels(async () => {
      clock += 55;
      return samplePixels();
    });
    expect(monitor.snapshot().stuck.stuck).toBe(false);

    // Now feed input while pixels still fail to change across >= 10 steps -> stuck!
    monitor.recordSteps(10, true, () => {
      clock += 5;
    });
    await monitor.measurePixels(async () => samplePixels());
    const stuckSnap = monitor.snapshot();
    expect(stuckSnap.stuck.stuck).toBe(true);
    expect(stuckSnap.frameTiming.frames).toBe(3);
    expect(stuckSnap.frameTiming.over16Ms).toBe(2);
    expect(stuckSnap.frameTiming.over50Ms).toBe(1);

    // Once pixels change, stuck clears immediately.
    pixelByte = 180;
    await monitor.measurePixels(async () => samplePixels());
    expect(monitor.snapshot().stuck.stuck).toBe(false);
  });
});

describe("QA offline audio probe and PCM analyzer", () => {
  it("analyzes silence, peak/RMS dBFS, clipping, and distinct sound onsets", () => {
    const sampleRate = 10000;
    const silent = analyzeQaAudioSamples([new Float32Array(sampleRate)], sampleRate);
    expect(silent.silent).toBe(true);
    expect(silent.peakDb).toBe(Number.NEGATIVE_INFINITY);
    expect(silent.silentWindowRatio).toBe(1);
    expect(silent.soundCount).toBe(0);

    // 1.0 s buffer with two 20 ms bursts separated by 200 ms, second burst clipped at 1.0.
    const pcm = new Float32Array(sampleRate);
    for (let i = 1000; i < 1200; i++) pcm[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    for (let i = 3500; i < 3700; i++) pcm[i] = i % 2 === 0 ? 1.0 : -0.8;
    const active = analyzeQaAudioSamples([pcm], sampleRate);
    expect(active.silent).toBe(false);
    expect(active.peakDb).toBeCloseTo(0, 3);
    expect(active.clippedSamples).toBe(100);
    expect(active.soundCount).toBe(2);
    expect(active.silentWindowRatio).toBeGreaterThan(0.5);
    expect(active.silentWindowRatio).toBeLessThan(1);
  });

  it("locks currentTime to the step clock and schedules AudioParam.value writes via setValueAtTime", async () => {
    const scheduled: Array<{ value: number; time: number }> = [];
    const probe = createQaOfflineAudio({
      maxDurationSeconds: 1,
      sampleRate: 8000,
      channels: 1,
      createOfflineContext: (_channels, length, sampleRate) => {
        const buf = new Float32Array(length);
        for (let i = 800; i < 1200; i++) buf[i] = 0.25;
        return {
          currentTime: 0,
          state: "suspended",
          destination: {} as AudioDestinationNode,
          createGain() {
            const gainParam = {
              value: 1,
              setValueAtTime(v: number, t: number) {
                scheduled.push({ value: v, time: t });
              }
            };
            return {
              gain: gainParam,
              connect: () => ({})
            } as unknown as GainNode;
          },
          async startRendering() {
            return {
              numberOfChannels: 1,
              length,
              sampleRate,
              getChannelData: () => buf
            };
          }
        };
      }
    });

    expect(probe.context.state).toBe("running");
    expect(probe.context.currentTime).toBe(0);
    const gainNode = probe.context.createGain!();
    probe.advance(0.5);
    expect(probe.context.currentTime).toBeCloseTo(0.5, 6);

    gainNode.gain.value = 0;
    expect(gainNode.gain.value).toBe(0);
    expect(scheduled).toEqual([{ value: 0, time: 0.5 }]);

    probe.advance(0.5);
    const report = await probe.render();
    expect(report.durationSeconds).toBeCloseTo(1, 5);
    expect(report.silent).toBe(false);
    expect(report.soundCount).toBe(1);
  });
});

describe("installVirtualGamepads", () => {
  it("lazy-connects slots on first input, maps tokens/axes, emits connection events, and restores navigator on uninstall", () => {
    const originalGetGamepads = () => [];
    const navTarget: Record<string, unknown> = { getGamepads: originalGetGamepads };
    const events: Array<{ type: string; index: number }> = [];
    const eventTarget = {
      dispatchEvent(ev: Event) {
        const gp = (ev as unknown as { gamepad?: { index: number } }).gamepad;
        events.push({ type: ev.type, index: gp?.index ?? -1 });
        return true;
      }
    };
    let clockMs = 42;
    const pads = installVirtualGamepads({
      navigatorTarget: navTarget,
      eventTarget,
      nowMs: () => clockMs
    });

    expect((navTarget.getGamepads as () => unknown[])()).toEqual([null, null, null, null]);
    expect(pads.applyToken("InvalidToken", true)).toBe(false);
    expect(pads.applyToken("Pad1A", true)).toBe(true);
    expect(pads.applyToken("Pad1Right", true)).toBe(true);
    expect(pads.applyToken("Pad2TurnL", true)).toBe(true);

    const snap = (navTarget.getGamepads as typeof pads.snapshot)();
    expect(events).toEqual([
      { type: "gamepadconnected", index: 0 },
      { type: "gamepadconnected", index: 1 }
    ]);
    expect(snap[0]?.buttons[0]?.pressed).toBe(true);
    expect(snap[0]?.buttons[15]?.pressed).toBe(true);
    expect(snap[0]?.axes).toEqual([1, 0, 0, 0]);
    expect(snap[0]?.timestamp).toBe(42);
    expect(snap[1]?.axes).toEqual([0, 0, -1, 0]);

    clockMs = 99;
    pads.setAxis(0, 1, -0.75);
    expect(pads.snapshot()[0]?.axes[1]).toBeCloseTo(-0.75, 5);
    expect(pads.snapshot()[0]?.timestamp).toBe(99);

    pads.releaseAll();
    expect(pads.snapshot()[0]?.buttons[0]?.pressed).toBe(false);
    expect(pads.snapshot()[0]?.axes).toEqual([0, 0, 0, 0]);

    pads.disconnect(1);
    expect(pads.snapshot()[1]).toBeNull();
    expect(events.at(-1)).toEqual({ type: "gamepaddisconnected", index: 1 });

    pads.uninstall();
    expect(navTarget.getGamepads).toBe(originalGetGamepads);
  });
});
