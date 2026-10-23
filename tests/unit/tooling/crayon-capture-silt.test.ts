import vm from "node:vm";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SILT_POLICY, HOOK_SOURCE, IDLE_SILT_INPUT, SILT_FRAME_MS, TRACE_COLUMNS, compareTraces, deriveTolerance, expandSegments, keysFor, pageRunnerSource,
  runLengthEncode, siltPolicy, summarizeTrace, validateReport, type SiltInput, type SiltPolicyView, type SiltTraceRow
} from "../../../tools/crayon-capture/silt-and-signal-lib";
import { DEFAULT_POLICY, autopilot } from "../../../examples/silt-and-signal-port/autopilot";
import { createSim, objectiveOf, stepSim, targetOf } from "../../../examples/silt-and-signal-port/sim";

const input = (over: Partial<SiltInput> = {}): SiltInput => ({ ...IDLE_SILT_INPUT, ...over });

describe("input script encoding", () => {
  it("run-length encodes and expands losslessly", () => {
    const seq = [input({ throttle: 1 }), input({ throttle: 1 }), input({ throttle: 1, steer: -1 }), input({ throttle: 1, steer: -1 }), input(), input({ lift: 1, boost: true })];
    const segs = runLengthEncode(seq);
    expect(segs.map((s) => s.steps)).toEqual([2, 2, 1, 1]);
    expect(expandSegments(segs)).toEqual(seq);
  });

  it("maps inputs to the keys the game reads", () => {
    expect(keysFor(input({ throttle: 1, steer: 1, lift: -1, boost: true }))).toEqual(["KeyW", "KeyD", "KeyQ", "ShiftLeft"]);
    expect(keysFor(input({ throttle: -1, steer: -1, lift: 1, brake: true, interact: true }))).toEqual(["KeyS", "KeyA", "KeyE", "KeyB", "KeyF"]);
    expect(keysFor(IDLE_SILT_INPUT)).toEqual([]);
  });
});

describe("keyboard policy", () => {
  const view = (over: Partial<SiltPolicyView> = {}): SiltPolicyView => ({ x: 0, y: 9, z: 0, yaw: 0, target: { x: 0, y: 4, z: -100 }, kind: "ride", speed: 20, atLastPoint: false, distance: 100, ...over });

  it("steers toward the target with the game's sign convention (yaw decreases with steer)", () => {
    expect(siltPolicy(view({ target: { x: 0, y: 4, z: -100 } }), DEFAULT_SILT_POLICY).steer).toBe(0);
    // target to the +x side needs yaw < 0: D (steer +1)
    expect(siltPolicy(view({ target: { x: 50, y: 4, z: -100 } }), DEFAULT_SILT_POLICY).steer).toBe(1);
    expect(siltPolicy(view({ target: { x: -50, y: 4, z: -100 } }), DEFAULT_SILT_POLICY).steer).toBe(-1);
  });

  it("holds the cruise altitude with a deadband and brakes + interacts at a hold objective's last point", () => {
    expect(siltPolicy(view({ y: 3 }), DEFAULT_SILT_POLICY).lift).toBe(1);
    expect(siltPolicy(view({ y: 20 }), DEFAULT_SILT_POLICY).lift).toBe(-1);
    expect(siltPolicy(view({ y: 9 }), DEFAULT_SILT_POLICY).lift).toBe(0);
    const approaching = siltPolicy(view({ kind: "care", atLastPoint: true, speed: 30, distance: 60 }), DEFAULT_SILT_POLICY);
    expect(approaching).toMatchObject({ throttle: 1, brake: false, interact: false });
    const braking = siltPolicy(view({ kind: "care", atLastPoint: true, speed: 30, distance: 15 }), DEFAULT_SILT_POLICY);
    expect(braking).toMatchObject({ throttle: 0, brake: true, interact: false });
    const holding = siltPolicy(view({ kind: "care", atLastPoint: true, speed: 2, distance: 10 }), DEFAULT_SILT_POLICY);
    expect(holding).toMatchObject({ throttle: 0, brake: true, interact: true });
    const ride = siltPolicy(view({ kind: "ride", atLastPoint: true, speed: 2, distance: 5 }), DEFAULT_SILT_POLICY);
    expect(ride).toMatchObject({ throttle: 1, brake: false, interact: false });
  });

  it("the port's autopilot makes the same decisions as the capture policy along a whole ride", () => {
    const sim = createSim(0, 2);
    let compared = 0;
    for (let i = 0; i < 900; i++) {
      const o = sim.state;
      const obj = objectiveOf(o);
      const tg = targetOf(o);
      const lib = siltPolicy({ x: o.x, y: o.y, z: o.z, yaw: o.yaw, target: tg, kind: obj.kind, speed: sim.flight.speed, atLastPoint: o.point === obj.points.length - 1, distance: Math.hypot(tg.x - o.x, tg.z - o.z) }, DEFAULT_SILT_POLICY);
      const a = autopilot(sim, DEFAULT_POLICY);
      expect(a).toEqual(lib);
      compared++;
      stepSim(sim, a);
      if (o.objective !== 2) break;
    }
    expect(compared).toBeGreaterThan(100);
  });
});

describe("trace comparison and tolerance", () => {
  const row = (x: number, objective = 2): SiltTraceRow => [x, 9, -3, 0.1, 20, 0, 0, 0, 1, objective, 0, 0, 0];

  it("summarizes the completion step and impacts", () => {
    const s = summarizeTrace([row(0), row(1), row(2, 3), row(3, 3)], 2);
    expect(s).toMatchObject({ steps: 4, completed: true, completedAtStep: 3, finalObjective: 3, impacts: 0 });
    expect(summarizeTrace([row(0), row(1)], 2).completed).toBe(false);
  });

  it("reports the per-column maximum difference and the first divergent step", () => {
    const a = [row(0), row(1), row(2)];
    const b = [row(0), row(1.5), row(2)];
    const c = compareTraces(a, b, 1e-6);
    expect(c.maxAbs[TRACE_COLUMNS.indexOf("x")]).toBeCloseTo(0.5, 12);
    expect(c.firstDivergence).toBe(1);
    expect(c.lengthMatch).toBe(true);
    expect(compareTraces(a, a).firstDivergence).toBeNull();
  });

  it("derives a tolerance from measured variance with a float32 floor", () => {
    const t = deriveTolerance([{ position: 0, yaw: 0, completionSteps: 0 }]);
    expect(t.position).toBe(1e-6);
    expect(t.completionSteps).toBe(1);
    const wide = deriveTolerance([{ position: 0.01, yaw: 0.002, completionSteps: 2 }, { position: 0.003, yaw: 0, completionSteps: 0 }]);
    expect(wide.position).toBeCloseTo(0.1, 12);
    expect(wide.yaw).toBeCloseTo(0.02, 12);
    expect(wide.completionSteps).toBe(2);
  });

  it("validates a report's required parts", () => {
    expect(validateReport({})).not.toEqual([]);
    expect(validateReport({ schema: "a3d-crayon-capture/1", game: "silt-and-signal", reference: { segments: [], trace: [row(0)], tolerance: {} } })).toEqual([]);
  });
});

describe("pre-boot hook (executed in a Node sandbox standing in for the game frame)", () => {
  function sandbox(href: string) {
    class FakeSearchParams {
      private m = new Map<string, string>();
      constructor(init?: string) { for (const kv of String(init ?? "").replace(/^\?/, "").split("&")) { if (kv) { const [k, v] = kv.split("="); this.m.set(k!, v ?? ""); } } }
      has(k: string) { return this.m.has(k); }
      set(k: string, v: string) { this.m.set(k, v); }
      get(k: string) { return this.m.get(k) ?? null; }
    }
    const calls: string[] = [];
    class GL { drawElements() { calls.push("drawElements"); } drawArrays() { calls.push("drawArrays"); } }
    const win: Record<string, unknown> = {
      URLSearchParams: FakeSearchParams, WebGL2RenderingContext: GL, WebGLRenderingContext: undefined,
      setInterval: () => 7, clearInterval: () => undefined
    };
    const ctx = vm.createContext({
      window: win, location: { href, search: "" }, performance: { now: () => 123456 }, Date: { now: () => 1_800_000_000_000 }, Math: Object.create(Math),
      setInterval: win.setInterval, clearInterval: win.clearInterval, URLSearchParams: FakeSearchParams, WebGL2RenderingContext: GL, WebGLRenderingContext: undefined
    });
    (ctx as Record<string, unknown>).window = Object.assign(win, ctx);
    vm.runInContext(HOOK_SOURCE, ctx);
    return { ctx, win, GL, calls };
  }

  it("leaves the outer Crayon page completely untouched", () => {
    const { win, ctx } = sandbox("https://app.usecrayon.ai/play/x");
    expect(win.__a3dSilt).toBeUndefined();
    expect((ctx as { performance: { now(): number } }).performance.now()).toBe(123456);
  });

  it("gives the srcdoc game frame an exact 1/60 s manual clock", () => {
    const { win, ctx } = sandbox("about:srcdoc");
    const S = win.__a3dSilt as { t: number; pump(): void; stopFree(): void; frame: number; base: number };
    const raf = win.requestAnimationFrame as (cb: (t: number) => void) => number;
    const seen: number[] = [];
    const tick = (t: number): void => { seen.push(t); raf(tick); };
    raf(tick);
    for (let i = 0; i < 5; i++) S.pump();
    expect(seen).toHaveLength(5);
    for (let i = 0; i < 5; i++) expect(seen[i]).toBeCloseTo((i + 1) * SILT_FRAME_MS, 9);
    expect((ctx as { performance: { now(): number } }).performance.now()).toBeCloseTo(5 * SILT_FRAME_MS, 9);
    expect((ctx as { Date: { now(): number } }).Date.now()).toBeCloseTo(S.base + 5 * SILT_FRAME_MS, 6);
    expect(S.base).toBe(1_800_000_000_000);
  });

  it("seeds Math.random identically on every load", () => {
    const a = sandbox("about:srcdoc"), b = sandbox("about:srcdoc");
    const ra = (a.ctx as { Math: { random(): number } }).Math.random;
    const rb = (b.ctx as { Math: { random(): number } }).Math.random;
    const xs = [ra(), ra(), ra()], ys = [rb(), rb(), rb()];
    expect(xs).toEqual(ys);
    expect(new Set(xs).size).toBe(3);
  });

  it("turns on the game's QA API through URLSearchParams and skips GL draws only while stepping", () => {
    const { win, ctx, GL, calls } = sandbox("about:srcdoc");
    void ctx;
    const P = win.URLSearchParams as new (s: string) => { has(k: string): boolean };
    expect(new P("").has("qa")).toBe(true);
    expect(new P("?a=1").has("qa")).toBe(false);
    const gl = new (ctx as { WebGL2RenderingContext: typeof GL }).WebGL2RenderingContext();
    gl.drawElements();
    expect(calls).toEqual(["drawElements"]);
    (win.__a3dSilt as { noDraw: boolean }).noDraw = true;
    gl.drawElements(); gl.drawArrays();
    expect(calls).toEqual(["drawElements"]);
  });
});

describe("in-page runner source", () => {
  it("is syntactically valid JavaScript and embeds the payload and policy", () => {
    const src = pageRunnerSource(siltPolicy.toString(), { mode: "policy", chapter: 0, objective: 2, params: DEFAULT_SILT_POLICY, maxSteps: 10 });
    expect(() => new vm.Script(src)).not.toThrow();
    expect(src).toContain('"chapter":0');
    expect(src).toContain("silt.qa.chapter");
    expect(src).toContain("silt.qa.pose");
  });
});

import { assemble, parseSessions } from "../../../tools/crayon-capture/silt-and-signal-assemble";

describe("assemble (log parsing, variance, tolerance)", () => {
  const mkRow = (x: number, objective = 2): SiltTraceRow => [x, 4, -325 + x, 0, 10, 0, 0, 0, 1, objective, 0, 0, 0];
  const trace = (dx = 0): SiltTraceRow[] => [mkRow(0 + dx), mkRow(1 + dx), mkRow(2 + dx, 3)];
  const segments = [{ steps: 3, input: input({ throttle: 1 }) }];
  const run = (dx = 0, mode = "play") => ({
    chapter: 0,
    objective: 2,
    primary: { segments, trace: trace(dx), summary: summarizeTrace(trace(dx), 2), start: { x: 0, y: 4, z: -325, yaw: 0, mode: "play", time: 10 }, mode, errors: [] as string[], world: { colliders: [1, 2, 3] } },
    primaryWallMs: 1,
    replay: { trace: trace(dx), summary: summarizeTrace(trace(dx), 2), errors: [] as string[], wallMs: 1 }
  });
  const block = (n: number, session: unknown, eol = "\n") => `@@CRAYON_CAPTURE_BEGIN:${n}${eol}${JSON.stringify(session)}${eol}@@CRAYON_CAPTURE_END:${n}${eol}`;
  const sess = (n: number, runs: unknown[], extra: Record<string, unknown> = {}) => ({ schema: "a3d-crayon-capture-session/1", session: n, startedAt: "2026-10-23T00:00:00Z", browser: "chromium", viewport: [640, 360], runs, ...extra });

  it("parses CRLF logs and keeps the last cumulative block of a session", () => {
    const log = block(1, sess(1, [run()], { partial: true }), "\r\n") + "noise\r\n" + block(1, sess(1, [run(), run()], { partial: false }), "\r\n");
    const sessions = parseSessions(log, "a.log");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.runs).toHaveLength(2);
  });

  it("merges sessions from several logs, renumbers them, and measures zero variance for identical rides", () => {
    const a = parseSessions(block(1, sess(1, [run()])), "a.log");
    const b = parseSessions(block(1, sess(1, [run()])), "b.log");
    const report = assemble([...a, ...b], ["a.log", "b.log"]) as { rides: { sessions: number; comparisons: { kind: string; position: number; session: number }[]; tolerance: { position: number } }[]; reference: { tolerance: { position: number } } };
    const ride = report.rides[0]!;
    expect(ride.sessions).toBe(2);
    expect(ride.comparisons.map((c) => c.kind).sort()).toEqual(["in-page-replay-vs-own-primary", "in-page-replay-vs-own-primary", "primary-vs-session-1-primary"]);
    expect(ride.comparisons.every((c) => c.position === 0)).toBe(true);
    expect(ride.tolerance.position).toBe(1e-6);
    expect(report.reference.tolerance.position).toBe(1e-6);
  });

  it("derives a wider tolerance from a measured difference between sessions", () => {
    const a = parseSessions(block(1, sess(1, [run()])), "a.log");
    const b = parseSessions(block(1, sess(1, [run(0.002)])), "b.log");
    const report = assemble([...a, ...b], ["a.log", "b.log"]) as { rides: { tolerance: { position: number } }[] };
    expect(report.rides[0]!.tolerance.position).toBeGreaterThan(0.01);
  });

  it("treats a ride that ends in a scene as completed", () => {
    const sceneRun = run(0, "scene");
    sceneRun.primary.trace = [mkRow(0), mkRow(1)];
    sceneRun.primary.summary = summarizeTrace(sceneRun.primary.trace, 2);
    const report = assemble(parseSessions(block(1, sess(1, [sceneRun])), "a.log"), ["a.log"]) as { rides: { summary: { completed: boolean; completedAtStep: number } }[] };
    expect(report.rides[0]!.summary).toMatchObject({ completed: true, completedAtStep: 2 });
  });

  it("refuses to assemble when no session has data", () => {
    const failed = parseSessions(block(1, { schema: "x", session: 1, error: "game frame with window.silt.qa not found" }), "a.log");
    expect(() => assemble(failed, ["a.log"])).toThrow(/no usable session/);
  });

  it("records collision-limited and incomplete rides as limits, not parity references", () => {
    const colliding = run();
    colliding.primary.trace = [[0, 1.4, -325, 0, 10, 0, 0, 0, 1, 2, 0, 0, 7]];
    colliding.primary.summary = summarizeTrace(colliding.primary.trace, 1);
    const good = { ...run(), objective: 3 };
    const sessions = parseSessions(block(1, sess(1, [colliding, good])), "a.log");
    const report = assemble(sessions, ["a.log"]) as { rides: { objective: number }[]; limitRides: { objective: number; impacts: number; reason: string }[] };
    expect(report.rides.map((r) => r.objective)).toEqual([3]);
    expect(report.limitRides).toHaveLength(1);
    expect(report.limitRides[0]).toMatchObject({ objective: 2, impacts: 7 });
    expect(report.limitRides[0]!.reason).toMatch(/collides/);
  });
});
