import { describe, expect, it } from "vitest";
import {
  CAPTURE_SCHEMA,
  DEFAULT_POLICY_PARAMS,
  HOOK_SOURCE,
  SIM_STEP,
  TOLERANCE_SAFETY,
  checkpointOrder,
  compareRuns,
  cruisePolicy,
  encodeInputScript,
  expandSegments,
  pageRunnerSource,
  parseInputScript,
  quantizeSteer,
  runLengthEncode,
  summarizeVariance,
  toleranceFrom,
  totalSteps,
  validateReport,
  assembleReport,
  parseMarkerBlocks,
  type SessionRecord,
  type PolicyState,
  type RunOutput,
  type RunPayload,
  type RunResult,
  type StepInput
} from "../../../tools/crayon-capture/lib";

// Phase A (R-20): pure logic of the Strange Orbit reference capture. The in-page
// sources are plain JS strings, so the code under test is what the browser runs;
// the fake game below only mirrors the shape of the game's `__orbit` QA hooks.

const input = (over: Partial<StepInput> = {}): StepInput => ({ pedal: true, brake: false, steer: 0, boost: false, jump: false, gravity: false, ...over });
const state = (over: Partial<PolicyState> = {}): PolicyState => ({ s: 500, route: "main", lane: 0, heading: 0, energy: 55, edgeWarning: false, gravityCharges: 3, air: false, loop: false, flight: false, ...over });

describe("input script encoding", () => {
  it("quantizes steer to 1/20 and never returns -0", () => {
    expect(quantizeSteer(0.26)).toBe(0.25);
    expect(quantizeSteer(-0.012)).toBe(0);
    expect(Object.is(quantizeSteer(-0.012), -0)).toBe(false);
    expect(quantizeSteer(7)).toBe(1);
    expect(quantizeSteer(-7)).toBe(-1);
  });

  it("run-length encodes equal consecutive steps and expands back exactly", () => {
    const steps = [input(), input(), input({ steer: 0.25 }), input({ steer: 0.25, boost: true }), input({ steer: 0.25, boost: true })];
    const segs = runLengthEncode(steps);
    expect(segs.map((s) => s.steps)).toEqual([2, 1, 2]);
    expect(expandSegments(segs)).toEqual(steps);
    expect(totalSteps(segs)).toBe(5);
  });

  it("round-trips through the text form", () => {
    const segs = runLengthEncode([input(), input({ steer: -0.5, gravity: true }), input({ pedal: false, brake: true }), input({ jump: true, boost: true })]);
    const text = encodeInputScript(segs);
    expect(text.split("\n")).toHaveLength(4);
    expect(parseInputScript(text)).toEqual(segs);
  });

  it("parses comments and blank lines, and rejects malformed lines", () => {
    expect(parseInputScript("# header\n\n3xP s=0.25  # drift\n")).toEqual([{ steps: 3, input: input({ steer: 0.25 }) }]);
    expect(() => parseInputScript("0xP s=0.00")).toThrow(/positive integer/);
    expect(() => parseInputScript("3xP s=1.50")).toThrow(/outside/);
    expect(() => parseInputScript("3xPP s=0.00")).toThrow(/duplicate/);
    expect(() => parseInputScript("3xQ s=0.00")).toThrow(/cannot parse/);
    expect(() => parseInputScript("three steps")).toThrow(/cannot parse/);
  });

  it("encodes an all-false step with '-'", () => {
    expect(encodeInputScript([{ steps: 2, input: input({ pedal: false }) }])).toBe("2x- s=0.00");
    expect(parseInputScript("2x- s=0.00")[0]?.input.pedal).toBe(false);
  });
});

describe("cruisePolicy", () => {
  const p = DEFAULT_POLICY_PARAMS;

  it("holds the pedal and steers back toward lane 0", () => {
    expect(cruisePolicy(state({ lane: 0 }), p)).toEqual(input({ steer: 0 }));
    expect(cruisePolicy(state({ lane: 4, heading: 0 }), p).steer).toBeLessThan(0);
    expect(cruisePolicy(state({ lane: -4, heading: 0 }), p).steer).toBeGreaterThan(0);
  });

  it("damps the heading and clamps steer to [-1, 1]", () => {
    expect(cruisePolicy(state({ lane: 0, heading: 0.2 }), p).steer).toBeLessThan(0);
    expect(cruisePolicy(state({ lane: 50, heading: -3 }), p).steer).toBeGreaterThanOrEqual(-1);
    expect(cruisePolicy(state({ lane: -50, heading: 3 }), p).steer).toBeLessThanOrEqual(1);
  });

  it("fires gravity on a real edge emergency or in zero-G flight, never without charges", () => {
    expect(cruisePolicy(state({ lane: 12, edgeWarning: true }), p).gravity).toBe(true);
    expect(cruisePolicy(state({ lane: 12, edgeWarning: false }), p).gravity).toBe(false);
    expect(cruisePolicy(state({ lane: 12, edgeWarning: true, gravityCharges: 0 }), p).gravity).toBe(false);
    expect(cruisePolicy(state({ lane: 12, edgeWarning: true, loop: true }), p).gravity).toBe(false);
    expect(cruisePolicy(state({ lane: 5, edgeWarning: true }), p).gravity).toBe(false);
    expect(cruisePolicy(state({ flight: true }), p).gravity).toBe(true);
    expect(cruisePolicy(state({ flight: true, gravityCharges: 0 }), p).gravity).toBe(false);
  });

  it("holds the bypass lane only on the main road inside the split window, every lap", () => {
    const inside = { s: p.bypassFrom + 10, lane: 0 };
    expect(cruisePolicy(state(inside), p).steer).toBeGreaterThan(0);
    expect(cruisePolicy(state({ ...inside, s: inside.s + 3 * p.lapLength }), p).steer).toBeGreaterThan(0);
    expect(cruisePolicy(state({ ...inside, route: "bypass" }), p).steer).toBe(0);
    expect(cruisePolicy(state({ ...inside, s: p.bypassFrom - 50 }), p).steer).toBe(0);
    expect(cruisePolicy(state({ ...inside, s: p.bypassTo + 1 }), p).steer).toBe(0);
    expect(cruisePolicy(state({ ...inside, lane: p.bypassLane }), p).steer).toBe(0);
    expect(cruisePolicy(state({ ...inside, lane: 12 }), p).steer).toBeLessThan(0);
  });

  it("boosts only when enabled, charged and grounded", () => {
    expect(cruisePolicy(state({ energy: 90 }), p).boost).toBe(false);
    const b = { ...p, boost: true };
    expect(cruisePolicy(state({ energy: 90 }), b).boost).toBe(true);
    expect(cruisePolicy(state({ energy: 10 }), b).boost).toBe(false);
    expect(cruisePolicy(state({ energy: 90, air: true }), b).boost).toBe(false);
  });

  it("is self-contained so toString() can inject it into the page", () => {
    const rebuilt = new Function(`return (${cruisePolicy.toString()})`)() as typeof cruisePolicy;
    expect(rebuilt(state({ lane: 4 }), p)).toEqual(cruisePolicy(state({ lane: 4 }), p));
  });
});

describe("browser hook", () => {
  function run(protocol: string, search = "") {
    const calls: unknown[] = [];
    const win: Record<string, unknown> = {
      URLSearchParams,
      requestAnimationFrame: (cb: (t: number) => void) => { calls.push("raf"); cb(16); return 1; }
    };
    new Function("window", "location", HOOK_SOURCE)(win, { protocol, search });
    return { win, calls };
  }

  it("turns on the game's qa flag only in the about:srcdoc frame", () => {
    const frame = run("about:").win.URLSearchParams as typeof URLSearchParams;
    expect(new frame("").has("qa")).toBe(true);
    const page = run("https:").win.URLSearchParams as typeof URLSearchParams;
    expect(new page("").has("qa")).toBe(false);
  });

  it("leaves other query strings intact", () => {
    const sp = run("about:").win.URLSearchParams as typeof URLSearchParams;
    expect(new sp("a=1").has("qa")).toBe(false);
    expect(new sp("a=1").get("a")).toBe("1");
  });

  it("runs frames until frozen, then drops them", () => {
    const { win } = run("about:");
    const cap = win.__a3dCap as { freeze: boolean; dropped: number };
    const raf = win.requestAnimationFrame as (cb: (t: number) => void) => number;
    let ran = 0;
    raf(() => ran++);
    expect(ran).toBe(1);
    cap.freeze = true;
    raf(() => ran++);
    raf(() => ran++);
    expect(ran).toBe(1);
    expect(cap.dropped).toBe(2);
  });

  it("is idempotent", () => {
    const { win } = run("about:");
    const first = win.requestAnimationFrame;
    new Function("window", "location", HOOK_SOURCE)(win, { protocol: "about:", search: "" });
    expect(win.requestAnimationFrame).toBe(first);
  });
});

// ---- fake game mirroring __orbit.{begin, race, advance, state} -------------------------

const LAP = 1450;

interface FakeRace {
  phase: string; countdown: number; time: number; s: number; lane: number; heading: number; speed: number; energy: number;
  lap: number; laps: number; lapStart: number; lapTimes: number[]; bestLap: number; events: { type: string; gate?: number; text?: string }[];
  gatesPassed: number; hits: number; respawns: number; nearMisses: number; dust: number; tricks: number; stunts: number; loops: number;
  score: number; edgeWarning: boolean; gravityCharges: number; air: null; loop: null; flight: null; route: string; mode: string; difficulty: string;
  vehicle: string; rider: number; courseId: string; equipment: string; rivals: unknown[]; end: { time: number; place: number; medal: string } | null; place: number;
}

function makeFakeGame(opts: { failBegin?: boolean; laps?: number; drift?: boolean } = {}) {
  let race: FakeRace | null = null;
  const gates = [150, 600, 1120];
  const elements = new Map<string, { textContent: string }>();
  const el = (id: string): { textContent: string } => {
    let e = elements.get(id);
    if (!e) { e = { textContent: "" }; elements.set(id, e); }
    return e;
  };
  const pp = (r: FakeRace, inp: StepInput, dt: number): void => {
    r.events.length = 0;
    if (r.phase === "countdown") {
      r.countdown -= dt;
      if (r.countdown <= 0) { r.phase = "racing"; r.events.push({ type: "go" }); }
      return;
    }
    if (r.phase !== "racing") return;
    const before = r.s;
    r.time += dt;
    r.speed += ((inp.pedal ? 40 : 0) - r.speed) * 0.55 * dt;
    r.heading += inp.steer * dt;
    r.lane += opts.drift ? 0.01 : Math.sin(r.heading) * r.speed * dt;
    r.s += r.speed * dt;
    for (const g of gates) {
      const at = Math.floor(before / LAP) * LAP + g;
      if (before < at && r.s >= at) { r.gatesPassed++; r.events.push({ type: "gate", gate: g, text: `GATE ${g} · +10 stardust` }); }
    }
    if (Math.floor(r.s / LAP) > Math.floor(before / LAP) && Math.floor(r.s / LAP) >= r.lap) {
      const lt = r.time - r.lapStart; r.lapTimes.push(lt); r.bestLap = Math.min(r.bestLap, lt); r.lapStart = r.time; r.lap = Math.floor(r.s / LAP) + 1;
      r.events.push({ type: "lap" });
    }
    if (r.s >= r.laps * LAP) { r.s = r.laps * LAP; r.phase = "finished"; r.end = { time: r.time, place: 2, medal: "silver" }; r.events.push({ type: "finish" }); }
  };
  const orbit = {
    get race() { return race as FakeRace; },
    get state() { return { ready: true, standings: [{ name: "YOU", gap: "+3m" }] }; },
    async begin() {
      if (opts.failBegin) throw new Error("audio init failed");
      race = {
        phase: "countdown", countdown: 3.2, time: 0, s: 0, lane: 0, heading: 0, speed: 0, energy: 55, lap: 1, laps: opts.laps ?? 7, lapStart: 0, lapTimes: [], bestLap: Infinity,
        events: [], gatesPassed: 0, hits: 0, respawns: 0, nearMisses: 0, dust: 0, tricks: 0, stunts: 0, loops: 0, score: 0, edgeWarning: false, gravityCharges: 3,
        air: null, loop: null, flight: null, route: "main", mode: "cup", difficulty: "racer", vehicle: "bike", rider: 0, courseId: "painted", equipment: "balanced",
        rivals: [1, 2, 3, 4, 5], end: null, place: 6
      };
    },
    advance(seconds: number, inp: StepInput) {
      for (let n = 0; n < seconds; n += 1 / 60) pp(race as FakeRace, inp, 1 / 60);
      el("place").textContent = String((race as FakeRace).place);
      el("lap").textContent = `Orbit ${(race as FakeRace).lap} / ${(race as FakeRace).laps}`;
      el("timer").textContent = (race as FakeRace).time.toFixed(2);
    }
  };
  const document = { getElementById: (id: string) => elements.get(id) ?? null };
  elements.set("route-name", { textContent: "Around the impossible" });
  return { window: { __orbit: orbit }, document };
}

async function runPage(payload: RunPayload, game = makeFakeGame()): Promise<RunOutput> {
  const src = pageRunnerSource(cruisePolicy.toString(), payload);
  const raw = (await (new Function("window", "document", `return ${src}`)(game.window, game.document) as Promise<string>));
  return JSON.parse(raw) as RunOutput;
}

describe("in-page runner (fake game)", () => {
  const base: RunPayload = { mode: "policy", params: DEFAULT_POLICY_PARAMS, maxSteps: 60 * 600 };

  it("plays 7 laps and records laps, checkpoints, finish and HUD frames", async () => {
    const { result } = await runPage(base);
    expect(result.outcome).toBe("finished");
    expect(result.lapTimes).toHaveLength(7);
    expect(result.finishTime).toBeGreaterThan(0);
    expect(Math.abs(result.lapTimes.reduce((a, b) => a + b, 0) - (result.finishTime as number))).toBeLessThan(2 * SIM_STEP);
    expect(result.checkpoints).toHaveLength(21);
    expect(result.checkpoints.slice(0, 3).map((c) => c.name)).toEqual(["GATE 150", "GATE 600", "GATE 1120"]);
    expect(result.checkpoints.map((c) => c.lap)).toEqual(Array.from({ length: 21 }, (_, i) => Math.floor(i / 3) + 1));
    expect(result.setup).toMatchObject({ mode: "cup", laps: 7, courseId: "painted", rivals: 5 });
    expect(result.routeEvents).toEqual([]);
    expect(result.place).toBe(2);
    expect(result.medal).toBe("silver");
    const events = result.hudFrames.map((f) => f.event);
    expect(events[0]).toBe("go");
    expect(events.filter((e) => e === "lap")).toHaveLength(7);
    expect(events[events.length - 1]).toBe("finish");
    expect(result.hudFrames[0]?.hud.route).toBe("Around the impossible");
    expect(result.trace.length).toBeGreaterThan(10);
  });

  it("records a script that replays to a bit-identical result", async () => {
    const first = await runPage(base);
    expect(totalSteps(first.segments)).toBe(first.result.steps);
    const replay = await runPage({ mode: "script", segments: first.segments, maxSteps: 60 * 600 });
    const cmp = compareRuns(first.result, replay.result);
    expect(cmp.identical).toBe(true);
    expect(cmp.finishTimeDelta).toBe(0);
    expect(replay.segments).toEqual(first.segments);
  });

  it("delays the script when a lead-in is added, keeping checkpoint order", async () => {
    const first = await runPage(base);
    const shifted = await runPage({ mode: "script", segments: first.segments, leadIn: 3, maxSteps: 60 * 600 });
    const cmp = compareRuns(first.result, shifted.result);
    expect(shifted.result.outcome).toBe("finished");
    expect(cmp.checkpointOrderEqual).toBe(true);
    expect(cmp.lapCountEqual).toBe(true);
    expect(cmp.finishTimeDelta as number).toBeLessThan(0.5);
  });

  it("feeds the controller state from `observationDelay` steps ago", async () => {
    const live = await runPage(base, makeFakeGame({ drift: true }));
    const lagged = await runPage({ ...base, observationDelay: 5 }, makeFakeGame({ drift: true }));
    expect(live.result.outcome).toBe("finished");
    expect(lagged.result.outcome).toBe("finished");
    expect(totalSteps(lagged.segments)).toBe(lagged.result.steps);
    expect(encodeInputScript(lagged.segments)).not.toBe(encodeInputScript(live.segments));
    const zero = await runPage({ ...base, observationDelay: 0 }, makeFakeGame({ drift: true }));
    expect(encodeInputScript(zero.segments)).toBe(encodeInputScript(live.segments));
  });

  it("reports timeout when the race cannot finish in maxSteps", async () => {
    const { result } = await runPage({ ...base, maxSteps: 600 });
    expect(result.outcome).toBe("timeout");
    expect(result.finishTime).toBeNull();
  });

  it("reports an error instead of throwing when begin() fails or hooks are missing", async () => {
    const failed = await runPage(base, makeFakeGame({ failBegin: true }));
    expect(failed.result.outcome).toBe("error");
    expect(failed.result.error).toMatch(/begin\(\) threw: audio init failed/);
    const raw = await (new Function("window", "document", `return ${pageRunnerSource(cruisePolicy.toString(), base)}`)({}, { getElementById: () => null }) as Promise<string>);
    const missing = JSON.parse(raw) as RunOutput;
    expect(missing.result.outcome).toBe("error");
    expect(missing.result.error).toBe("qa hooks missing");
  });
});

// ---- comparison, tolerance, validation ---------------------------------------------------

const cp = (lap: number, gate: number): { step: number; t: number; lap: number; gate: number; name: string } => ({ step: 0, t: 0, lap, gate, name: `G${gate}` });

function result(over: Partial<RunResult> = {}): RunResult {
  return {
    outcome: "finished", steps: 18000, finishTime: 300, lapTimes: [40, 40, 40, 40, 40, 50, 50], bestLap: 40,
    checkpoints: [cp(1, 150), cp(1, 600), cp(2, 150)], routeEvents: [], gatesPassed: 3, hits: 0, respawns: 0, nearMisses: 0, dust: 0, tricks: 0, stunts: 0, loops: 0,
    score: 0, place: 2, medal: "silver", standings: null, hudFrames: [], trace: [], setup: { laps: 7 }, ...over
  };
}

describe("run comparison and tolerance", () => {
  it("identical runs compare exactly", () => {
    const cmp = compareRuns(result(), result());
    expect(cmp).toMatchObject({ identical: true, finishTimeDelta: 0, maxLapTimeDelta: 0, checkpointOrderEqual: true });
    expect(summarizeVariance([cmp]).exact).toBe(true);
  });

  it("detects differences in time, lap count and checkpoint order", () => {
    const slower = compareRuns(result(), result({ finishTime: 300.5, lapTimes: [40, 40, 40, 40, 40, 50, 50.5] }));
    expect(slower.identical).toBe(false);
    expect(slower.finishTimeDelta).toBeCloseTo(0.5, 9);
    expect(slower.maxLapTimeDelta).toBeCloseTo(0.5, 9);
    expect(compareRuns(result(), result({ lapTimes: [40, 40] })).lapCountEqual).toBe(false);
    expect(compareRuns(result(), result({ checkpoints: [cp(1, 600), cp(1, 150), cp(2, 150)] })).checkpointOrderEqual).toBe(false);
    expect(compareRuns(result(), result({ outcome: "lost", finishTime: null })).outcomeEqual).toBe(false);
  });

  it("lists checkpoint order as lap:gate:name keys", () => {
    expect(checkpointOrder(result())).toEqual(["1:150:G150", "1:600:G600", "2:150:G150"]);
  });

  it("summarizes the worst case across comparisons", () => {
    const v = summarizeVariance([
      compareRuns(result(), result()),
      compareRuns(result(), result({ finishTime: 300.1, lapTimes: [40, 40, 40, 40, 40, 50, 50.1] })),
      compareRuns(result(), result({ finishTime: 299.9, lapTimes: [40.2, 40, 40, 40, 40, 50, 49.8] }))
    ]);
    expect(v.exact).toBe(false);
    expect(v.comparisons).toBe(3);
    expect(v.maxFinishTimeDelta).toBeCloseTo(0.1, 9);
    expect(v.maxLapTimeDelta).toBeCloseTo(0.2, 9);
    expect(v.allCheckpointOrdersEqual).toBe(true);
  });

  it("counts outcome changes separately and flags the script as step-exact", () => {
    const lost = compareRuns(result(), result({ outcome: "lost", finishTime: null, lapTimes: [40] }));
    const v = summarizeVariance([compareRuns(result(), result()), lost]);
    expect(v.outcomeMismatches).toBe(1);
    expect(v.exact).toBe(false);
    const zero = summarizeVariance([compareRuns(result(), result())]);
    const tol = toleranceFrom(zero, v, zero);
    expect(tol.openLoopStepExact).toBe(true);
    expect(tol.basis).toMatch(/replayed step-exactly/);
    expect(toleranceFrom(zero, zero, zero).openLoopStepExact).toBe(false);
    const closed = toleranceFrom(zero, zero, v);
    expect(closed.openLoopStepExact).toBe(false);
    expect(closed.basis).toMatch(/closed-loop latency run\(s\) changed outcome/);
  });

  it("never reports exact for an empty comparison set", () => {
    expect(summarizeVariance([]).exact).toBe(false);
  });

  it("tolerance floors at one sim step and scales the observed spread", () => {
    const zero = summarizeVariance([compareRuns(result(), result())]);
    expect(toleranceFrom(zero, zero, zero).finishTimeSec).toBeCloseTo(SIM_STEP, 4);
    const wide = summarizeVariance([compareRuns(result(), result({ finishTime: 301, lapTimes: [40, 40, 40, 40, 40, 50, 51] }))]);
    const tol = toleranceFrom(zero, zero, wide);
    expect(tol.finishTimeSec).toBeCloseTo(TOLERANCE_SAFETY * 1, 4);
    expect(tol.lapTimeSec).toBeCloseTo(TOLERANCE_SAFETY * 1, 4);
    expect(tol.basis).toContain("1 sim step");
    expect(toleranceFrom(zero, wide, zero).finishTimeSec).toBeCloseTo(SIM_STEP, 4);
  });
});

describe("report validation", () => {
  const segs = [{ steps: 100, input: input() }];
  const good = (): Record<string, unknown> => ({
    schema: CAPTURE_SCHEMA, game: "strange-orbit", url: "https://example.test/play/x", capturedAt: "2026-10-22T00:00:00Z", setup: {},
    policy: { name: "cruise", params: DEFAULT_POLICY_PARAMS }, script: { encoding: "rle", steps: 100, text: encodeInputScript(segs) },
    reference: result({ finishTime: 300, lapTimes: [40, 40, 40, 40, 40, 50, 50] }), sessions: [{}, {}],
    variance: { repeat: {}, openLoopShift: {}, closedLoopLatency: {} }, tolerance: { finishTimeSec: 0.0167, lapTimeSec: 0.0167, openLoopStepExact: false, basis: "" }
  });

  it("accepts a complete report", () => {
    expect(validateReport(good())).toEqual([]);
  });

  it("rejects wrong schema, unfinished reference and bad lap data", () => {
    expect(validateReport({ ...good(), schema: "nope" })).toContain(`schema must be ${CAPTURE_SCHEMA}`);
    expect(validateReport({ ...good(), reference: result({ outcome: "lost" }) }).join("\n")).toMatch(/expected finished/);
    expect(validateReport({ ...good(), reference: result({ lapTimes: [40, 40, 40] }) }).join("\n")).toMatch(/expected 7/);
    expect(validateReport({ ...good(), reference: result({ finishTime: 100 }) }).join("\n")).toMatch(/lap times sum/);
    expect(validateReport({ ...good(), reference: result({ checkpoints: [] }) }).join("\n")).toMatch(/no checkpoints/);
  });

  it("rejects a script that does not parse or has the wrong step count", () => {
    expect(validateReport({ ...good(), script: { encoding: "rle", steps: 100, text: "garbage" } }).join("\n")).toMatch(/does not parse/);
    expect(validateReport({ ...good(), script: { encoding: "rle", steps: 99, text: encodeInputScript(segs) } }).join("\n")).toMatch(/!= parsed 100/);
  });

  it("requires at least two independent sessions", () => {
    expect(validateReport({ ...good(), sessions: [{}] }).join("\n")).toMatch(/at least 2 independent sessions/);
    expect(validateReport(null)).toEqual(["report is not an object"]);
  });
});

describe("assembling sessions", () => {
  const segs = runLengthEncode([input(), input(), input({ steer: 0.25 })]);
  const session = (n: number, over: Partial<SessionRecord> = {}, primary: Partial<RunResult> = {}): SessionRecord => ({
    schema: "a3d-crayon-capture-session/1", session: n, startedAt: "2026-10-22T00:00:00Z", url: "https://example.test/play/x", browser: "chromium",
    params: DEFAULT_POLICY_PARAMS, primary: { result: result(primary), segments: segs }, replay: result(primary),
    perturbations: [{ leadIn: 1, result: result({ ...primary, finishTime: (primary.finishTime ?? 300) + 0.0167 }) }],
    closedLoop: [{ delay: 2, result: result({ ...primary, finishTime: (primary.finishTime ?? 300) + 2 }) }], ...over
  });
  const meta = { game: "strange-orbit", url: "https://example.test/play/x", capturedAt: "2026-10-22T00:00:00Z", policyName: "cruise" };

  it("builds a valid report from two exact sessions", () => {
    const report = assembleReport([session(1), session(2)], meta);
    expect(validateReport(report)).toEqual([]);
    expect(report.variance.repeat.exact).toBe(true);
    expect(report.variance.openLoopShift.exact).toBe(false);
    expect(report.variance.openLoopShift.maxFinishTimeDelta).toBeCloseTo(0.0167, 4);
    expect(report.variance.closedLoopLatency.maxFinishTimeDelta).toBeCloseTo(2, 9);
    expect(report.tolerance.finishTimeSec).toBeCloseTo(TOLERANCE_SAFETY * 2, 3);
    expect(report.tolerance.openLoopStepExact).toBe(false);
    expect((report.sessions[0] as { closedLoopLatency: unknown[] }).closedLoopLatency).toHaveLength(1);
    expect(report.script.steps).toBe(3);
    expect(report.sessions).toHaveLength(2);
  });

  it("flags a session whose script or result differs from the reference", () => {
    const other = session(2, { primary: { result: result({ finishTime: 301, lapTimes: [40, 40, 40, 40, 40, 50, 51] }), segments: runLengthEncode([input({ steer: 0.5 })]) } });
    const report = assembleReport([session(1), other], meta);
    expect(report.variance.repeat.exact).toBe(false);
    expect(report.variance.repeat.maxFinishTimeDelta).toBeCloseTo(1, 9);
    const summary = report.sessions[1] as { scriptMatchesReference: boolean; replayIdentical: boolean };
    expect(summary.scriptMatchesReference).toBe(false);
    expect(summary.replayIdentical).toBe(false);
  });

  it("refuses an empty session list", () => {
    expect(() => assembleReport([], meta)).toThrow(/no sessions/);
  });

  it("extracts marker blocks from a noisy ACR log and tolerates bad JSON", () => {
    const log = ["noise", "@@CRAYON_CAPTURE_BEGIN:1", JSON.stringify({ session: 1 }), "@@CRAYON_CAPTURE_END:1", "more noise", "@@CRAYON_CAPTURE_BEGIN:2", "{oops", "@@CRAYON_CAPTURE_END:2"].join("\n");
    const blocks = parseMarkerBlocks(log) as { session?: number; error?: string }[];
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.session).toBe(1);
    expect(blocks[1]?.error).toMatch(/not valid JSON/);
  });
});
