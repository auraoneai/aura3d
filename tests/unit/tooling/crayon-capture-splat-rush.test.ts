import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  BASE_MS,
  DEFAULT_POLICY_PARAMS,
  IDLE_INPUT,
  STEER_GAIN,
  STEP_MS,
  TRACE_FIELDS,
  applySteer,
  compareTraces,
  deriveTolerance,
  encodeInputScript,
  expandSegments,
  mulberry32,
  parseInputScript,
  runLengthEncode,
  steerPolicy,
  validateReport,
  virtualNow,
  vtHookSource,
  type CaptureReport,
  type PolicyView,
  type StepInput,
  type TraceRow
} from "../../../tools/crayon-capture/splat-rush-lib";

const step = (over: Partial<StepInput> = {}): StepInput => ({ ...IDLE_INPUT, ...over });

describe("splat-rush capture: PRNG and virtual clock", () => {
  it("mulberry32 is deterministic, in [0,1) and seed-dependent", () => {
    const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs.slice(0, 5));
  });

  it("virtual now is base + n * (1000/60)", () => {
    expect(virtualNow(0)).toBe(BASE_MS);
    expect(virtualNow(60)).toBeCloseTo(BASE_MS + 1000, 9);
    expect(STEP_MS).toBe(1000 / 60);
  });
});

describe("splat-rush capture: input script text", () => {
  it("round-trips flags, run-length merges unflagged steps and never merges flagged steps", () => {
    const inputs = [step({ start: true }), step({ down: true }), step({ dx: 3 }), step({ dx: 3 }), step({ dx: 3 }), step(), step(), step({ up: true })];
    const segs = runLengthEncode(inputs);
    expect(segs.map((s) => s.steps)).toEqual([1, 1, 3, 2, 1]);
    const text = encodeInputScript(segs);
    expect(text).toBe("1xS dx=0\n1xD dx=0\n3x- dx=3\n2x- dx=0\n1xU dx=0");
    expect(expandSegments(parseInputScript(text))).toEqual(inputs);
  });

  it("two consecutive flagged steps stay separate", () => {
    const segs = runLengthEncode([step({ down: true }), step({ down: true })]);
    expect(segs.map((s) => s.steps)).toEqual([1, 1]);
  });

  it("parses comments and rejects malformed lines", () => {
    expect(parseInputScript("# note\n2x- dx=-4 # trailing\n")).toHaveLength(1);
    expect(() => parseInputScript("garbage")).toThrow(/cannot parse/);
    expect(() => parseInputScript("0x- dx=1")).toThrow(/step count/);
  });
});

describe("splat-rush capture: steering policy", () => {
  const gate = (z: number, laneX: number, colorIndex: number, passed = false) => ({ z, laneX, colorIndex, passed });
  const view = (over: Partial<PolicyView> = {}): PolicyView => ({
    phase: "playing",
    playerColorIndex: 1,
    rainbow: false,
    laneOffset: 0,
    ye: 0,
    gates: [gate(-10, -2.3, 0), gate(-10, 0, 1), gate(-10, 2.3, 2), gate(-25, -2.3, 1), gate(-25, 0, 3), gate(-25, 2.3, 0)],
    rowsPassed: 0,
    ...over
  });

  it("steers toward the matching gate of the nearest unpassed row", () => {
    expect(steerPolicy(view({ ye: 2 }), DEFAULT_POLICY_PARAMS)).toBeLessThan(0); // matching lane 0 is left of ye=2
    expect(steerPolicy(view({ ye: -2 }), DEFAULT_POLICY_PARAMS)).toBeGreaterThan(0);
    expect(steerPolicy(view({ ye: 0 }), DEFAULT_POLICY_PARAMS)).toBe(0);
  });

  it("uses the next row once the nearest one is passed", () => {
    const g = [gate(-1, -2.3, 0, true), gate(-1, 0, 1, true), gate(-1, 2.3, 2, true), gate(-14, -2.3, 1), gate(-14, 0, 3), gate(-14, 2.3, 0)];
    expect(steerPolicy(view({ gates: g, ye: 0 }), DEFAULT_POLICY_PARAMS)).toBeLessThan(0); // matching colour 1 is the left gate
  });

  it("clamps |dx| to maxDx and applies the game's steer gain", () => {
    expect(Math.abs(steerPolicy(view({ ye: 3 }), { ...DEFAULT_POLICY_PARAMS, maxDx: 5 }))).toBe(5);
    const dx = steerPolicy(view({ ye: -0.5, gates: [gate(-10, 0, 1)] }), { ...DEFAULT_POLICY_PARAMS, maxDx: 100 });
    expect(dx).toBe(Math.round(0.5 / STEER_GAIN));
  });

  it("steers to a non-matching lane on mistake rows, nearest lane when rainbow, and idles outside play", () => {
    const mistake = steerPolicy(view({ ye: 0 }), { ...DEFAULT_POLICY_PARAMS, mistakeRows: [0] });
    expect(mistake).not.toBe(0);
    const rainbow = steerPolicy(view({ rainbow: true, laneOffset: 2.2, ye: 2.2 }), DEFAULT_POLICY_PARAMS);
    expect(rainbow).toBeGreaterThanOrEqual(0); // nearest gate lane is +2.3
    expect(steerPolicy(view({ phase: "gameOver" }), DEFAULT_POLICY_PARAMS)).toBe(0);
    expect(steerPolicy(view({ phase: "splash" }), DEFAULT_POLICY_PARAMS)).toBe(0);
    expect(steerPolicy(view({ gates: [] }), DEFAULT_POLICY_PARAMS)).toBe(0);
  });

  it("is self-contained: Function.toString() evaluates standalone", () => {
    const standalone = (0, eval)(`(${steerPolicy.toString()})`) as typeof steerPolicy;
    expect(standalone(view({ ye: 2 }), DEFAULT_POLICY_PARAMS)).toBe(steerPolicy(view({ ye: 2 }), DEFAULT_POLICY_PARAMS));
  });

  it("applySteer mirrors `ye += 0.012 * dx * (10 / 6)` clamped to the lane", () => {
    expect(applySteer(0, 10)).toBe(0 + 0.012 * 10 * (10 / 6));
    expect(applySteer(2.9, 100)).toBe(3);
    expect(applySteer(-2.9, -100)).toBe(-3);
  });
});

describe("splat-rush capture: trace comparison and report validation", () => {
  const row = (n: number, score: number): TraceRow => {
    const r = TRACE_FIELDS.map(() => 0);
    r[0] = n;
    r[1] = score;
    return r;
  };

  it("reports bit-identical traces as exact and finds the first divergence", () => {
    const a = [row(0, 0), row(1, 1), row(2, 2)];
    expect(compareTraces(a, a.map((r) => [...r])).exact).toBe(true);
    const b = [row(0, 0), row(1, 1), row(2, 2.5)];
    const d = compareTraces(a, b);
    expect(d.exact).toBe(false);
    expect(d.firstDivergence).toBe(2);
    expect(d.maxAbs.score).toBe(0.5);
    expect(deriveTolerance([compareTraces(a, a)])).toBe(0);
    expect(deriveTolerance([d])).toBe(0.75);
  });

  it("treats a length mismatch as divergence", () => {
    expect(compareTraces([row(0, 0)], [row(0, 0), row(1, 1)]).firstDivergence).toBe(1);
  });

  const good = (): CaptureReport => ({
    schema: "a3d-crayon-capture/1",
    game: "splat-rush",
    capturedAt: "2026-10-23T00:00:00Z",
    url: "https://example.invalid",
    setup: {},
    script: "1xS dx=0\n1xD dx=0\n98x- dx=0",
    traceFields: TRACE_FIELDS,
    reference: { trace: Array.from({ length: 100 }, (_, i) => row(i, i + 1)), events: [], gates: [], hud: [] },
    sessions: [{ ok: true }, { ok: true }],
    variance: {},
    tolerance: 0,
    limitations: []
  });

  it("accepts a finished repeatable report and rejects incomplete ones", () => {
    expect(() => validateReport(good())).not.toThrow();
    expect(() => validateReport({ ...good(), sessions: [{ ok: true }] })).toThrow(/independent sessions/);
    expect(() => validateReport({ ...good(), reference: { ...good().reference, trace: [row(0, 1)] } })).toThrow(/too short/);
    expect(() => validateReport({ ...good(), script: "nonsense" })).toThrow(/unparseable/);
    expect(() => validateReport({ ...good(), schema: "x" })).toThrow(/bad schema/);
  });
});

describe("splat-rush capture: injected virtual-time hook", () => {
  function sandbox(protocol = "about:") {
    const ctx: Record<string, unknown> = { location: { protocol }, performance: { now: () => 12345 } };
    const context = vm.createContext(ctx);
    vm.runInContext("var window = globalThis; window.AudioContext = function A(){}; window.webkitAudioContext = function B(){};", context);
    vm.runInContext(vtHookSource(1234), context);
    return {
      context,
      run: <T>(code: string): T => vm.runInContext(code, context) as T,
      /** Run as the game's own blob module so the draw counts as a GAME draw. */
      game: <T>(code: string): T => vm.runInContext(code, context, { filename: "blob:null/00000000-game" }) as T,
      /** Run as three.js (a CDN URL) so the draw counts as a LIB draw. */
      lib: <T>(code: string): T => vm.runInContext(code, context, { filename: "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js" }) as T
    };
  }

  it("serves GAME-caller draws from a mulberry32 stream and counts only them", () => {
    const { game, lib, run } = sandbox();
    const ref = mulberry32(1234);
    for (let i = 0; i < 20; i++) expect(game<number>("Math.random()")).toBe(ref());
    expect(run<number>("__a3dVt.rngCount()")).toBe(20);
    // library draws interleaved in between do not perturb the game stream or its count
    lib("Math.random(); Math.random();");
    expect(run<number>("__a3dVt.rngCount()")).toBe(20);
    expect(game<number>("Math.random()")).toBe(ref());
    expect(run<number>("__a3dVt.rngCount()")).toBe(21);
  });

  it("serves every non-game caller (three.js UUID draws, the boot runtime) from a separate LIB stream", () => {
    const { lib, run } = sandbox();
    const libRef = mulberry32((1234 ^ 0x9e3779b9) >>> 0);
    for (let i = 0; i < 12; i++) expect(lib<number>("Math.random()")).toBe(libRef());
    expect(run<number>("__a3dVt.libDraws()")).toBe(12);
    expect(run<number>("__a3dVt.rngCount()")).toBe(0);
    // an unnamed caller (the default vm filename) is also LIB
    run("Math.random()");
    expect(run<number>("__a3dVt.libDraws()")).toBe(13);
  });

  it("virtualises performance.now and requestAnimationFrame: callbacks run only when stepped", () => {
    const { run } = sandbox();
    expect(run<number>("performance.now()")).toBe(BASE_MS);
    run("var seen = []; requestAnimationFrame(function (t) { seen.push(t); requestAnimationFrame(function (t2) { seen.push(t2); }); });");
    expect(run<number>("seen.length")).toBe(0);
    run("__a3dVt.step()");
    expect(run<number[]>("seen")).toEqual([virtualNow(1)]);
    run("__a3dVt.step()");
    expect(run<number[]>("seen")).toEqual([virtualNow(1), virtualNow(2)]);
    expect(run<number>("performance.now()")).toBe(virtualNow(2));
  });

  it("cancelAnimationFrame removes a queued callback and a throwing callback is recorded, not fatal", () => {
    const { run } = sandbox();
    run("var hit = 0; var id = requestAnimationFrame(function () { hit++; }); cancelAnimationFrame(id); requestAnimationFrame(function () { throw new Error('boom'); });");
    run("__a3dVt.step()");
    expect(run<number>("hit")).toBe(0);
    expect(run<string[]>("__a3dVtErrors")[0]).toMatch(/boom/);
  });

  it("removes AudioContext and records the GAME draw count when __getGameState is first assigned", () => {
    const { run, game, lib } = sandbox();
    expect(run<string>("typeof window.AudioContext")).toBe("undefined");
    expect(run<string>("typeof window.webkitAudioContext")).toBe("undefined");
    game("Math.random(); Math.random(); Math.random();");
    lib("Math.random(); Math.random();");
    run("window.__getGameState = function () { return {}; };");
    game("Math.random();");
    expect(run<number>("__a3dVt.preGameDraws()")).toBe(3);
    expect(run<string>("typeof window.__getGameState")).toBe("function");
  });

  it("does nothing outside an about: frame (the parent page keeps real timers)", () => {
    const { run } = sandbox("https:");
    expect(run<string>("typeof window.__a3dVt")).toBe("undefined");
    expect(run<number>("performance.now()")).toBe(12345);
  });
});
