/**
 * tools/crayon-capture/lib — pure logic for the Strange Orbit reference capture (Phase A, R-20).
 *
 * No Playwright, no I/O: input-script encoding, the cruise policy, the in-page
 * runner source, result comparison, tolerance and report validation. The
 * runner (`strange-orbit.ts`) injects `HOOK_SOURCE` and `pageRunnerSource()`
 * into the game frame; everything here is unit-tested without a browser.
 */

export const CAPTURE_SCHEMA = "a3d-crayon-capture/1";
export const SIM_STEP = 1 / 60;
export const STEER_QUANTUM = 1 / 20;

export interface StepInput {
  pedal: boolean;
  brake: boolean;
  steer: number;
  boost: boolean;
  jump: boolean;
  gravity: boolean;
}

export interface ScriptSegment {
  steps: number;
  input: StepInput;
}

export interface PolicyParams {
  laneGain: number;
  maxHeading: number;
  headingGain: number;
  rescueLane: number;
  boost: boolean;
  boostEnergy: number;
  lapLength: number;
  bypassFrom: number;
  bypassTo: number;
  bypassLane: number;
}

export interface PolicyState {
  s: number;
  route: string;
  lane: number;
  heading: number;
  energy: number;
  edgeWarning: boolean;
  gravityCharges: number;
  air: boolean;
  loop: boolean;
  flight: boolean;
}

export const DEFAULT_POLICY_PARAMS: PolicyParams = {
  laneGain: 0.06,
  maxHeading: 0.3,
  headingGain: 5,
  rescueLane: 11,
  boost: false,
  boostEnergy: 40,
  lapLength: 1450,
  // Chosen by the remote parameter sweep (ACR run cc1cc): fewest hits among the controllers
  // that finish 7 laps and still finish when the controller sees state 1 and 2 steps late.
  // The game announces "OPAL STEPS" at s=1137.2 and switches to the bypass at s=1165.5.
  bypassFrom: 1100,
  bypassTo: 1190,
  bypassLane: 4.5
};

export const IDLE_INPUT: StepInput = { pedal: false, brake: false, steer: 0, boost: false, jump: false, gravity: false };

export function quantizeSteer(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x));
  const q = Math.round(clamped / STEER_QUANTUM) * STEER_QUANTUM;
  return q === 0 ? 0 : Math.round(q * 1e6) / 1e6;
}

/**
 * Closed-loop controller: hold the pedal and keep the rider on lane 0, except at the opal
 * split ("left to jump / right to bypass") where it holds `bypassLane` on the main road so the
 * game routes it onto the bypass instead of the platform route. Gravity fires on an edge
 * emergency, or whenever the rider is in zero-G flight (that is the rescue sling back to the
 * track). Self-contained (no outer references) so `Function.prototype.toString()` can inject it.
 */
export function cruisePolicy(r: PolicyState, p: PolicyParams): StepInput {
  const lapS = ((r.s % p.lapLength) + p.lapLength) % p.lapLength;
  const bypassing = r.route === "main" && lapS >= p.bypassFrom && lapS < p.bypassTo;
  const laneTarget = bypassing ? p.bypassLane : 0;
  const target = Math.max(-p.maxHeading, Math.min(p.maxHeading, -p.laneGain * (r.lane - laneTarget)));
  const steer = Math.max(-1, Math.min(1, p.headingGain * (target - r.heading))) + 0;
  const edge = r.edgeWarning && Math.abs(r.lane) > p.rescueLane && !r.loop;
  const gravity = r.gravityCharges > 0 && (r.flight || edge);
  const boost = p.boost ? r.energy > p.boostEnergy && !r.air : false;
  return { pedal: true, brake: false, steer, boost, jump: false, gravity: !!gravity };
}

// ---- input script text: "<steps>x[PBOJG] s=<steer>" per line ---------------------------

const FLAG_ORDER: readonly (readonly [string, keyof StepInput])[] = [
  ["P", "pedal"],
  ["B", "brake"],
  ["O", "boost"],
  ["J", "jump"],
  ["G", "gravity"]
];

const sameInput = (a: StepInput, b: StepInput): boolean =>
  a.pedal === b.pedal && a.brake === b.brake && a.boost === b.boost && a.jump === b.jump && a.gravity === b.gravity && a.steer === b.steer;

export function runLengthEncode(inputs: readonly StepInput[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const input of inputs) {
    const last = out[out.length - 1];
    if (last && sameInput(last.input, input)) last.steps++;
    else out.push({ steps: 1, input: { ...input } });
  }
  return out;
}

export function expandSegments(segments: readonly ScriptSegment[]): StepInput[] {
  const out: StepInput[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) out.push({ ...seg.input });
  return out;
}

export function encodeInputScript(segments: readonly ScriptSegment[]): string {
  return segments
    .map((seg) => {
      const flags = FLAG_ORDER.filter(([, key]) => seg.input[key] === true).map(([ch]) => ch).join("");
      return `${seg.steps}x${flags || "-"} s=${seg.input.steer.toFixed(2)}`;
    })
    .join("\n");
}

export function parseInputScript(text: string): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const line = (lines[n] as string).replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([PBOJG]+|-)\s+s=(-?\d+(?:\.\d+)?)$/.exec(line);
    if (!m) throw new Error(`input script line ${n + 1}: cannot parse "${line}"`);
    const steps = Number(m[1]);
    if (!Number.isInteger(steps) || steps < 1) throw new Error(`input script line ${n + 1}: steps must be a positive integer`);
    const steer = Number(m[3]);
    if (!Number.isFinite(steer) || steer < -1 || steer > 1) throw new Error(`input script line ${n + 1}: steer ${steer} outside [-1, 1]`);
    const flags = m[2] as string;
    if (flags !== "-" && new Set(flags).size !== flags.length) throw new Error(`input script line ${n + 1}: duplicate flag in "${flags}"`);
    const has = (ch: string): boolean => flags.includes(ch);
    out.push({
      steps,
      input: { pedal: has("P"), brake: has("B"), steer: quantizeSteer(steer), boost: has("O"), jump: has("J"), gravity: has("G") }
    });
  }
  return out;
}

export function totalSteps(segments: readonly ScriptSegment[]): number {
  return segments.reduce((sum, seg) => sum + seg.steps, 0);
}

// ---- browser hook: QA flag, frozen rAF ------------------------------------------------

/**
 * Runs before any game script, in every frame. In the sandboxed `about:srcdoc` game
 * frame it (1) makes `new URLSearchParams(location.search)` report `qa`, which turns on
 * the game's own `window.__orbit.{begin,race,advance}` QA hooks (the srcdoc frame has no
 * query string), and (2) wraps `requestAnimationFrame` so the real-time loop can be
 * frozen: with `window.__a3dCap.freeze` set, queued frames never run, so only the
 * harness's fixed 1/60 s `advance` steps move the simulation.
 */
export const HOOK_SOURCE = `(function () {
  if (window.__a3dCap) return;
  var cap = (window.__a3dCap = { freeze: false, dropped: 0 });
  var raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function (cb) {
    return raf(function (t) {
      if (cap.freeze) { cap.dropped++; return; }
      cb(t);
    });
  };
  if (location.protocol === "about:") {
    var Orig = window.URLSearchParams;
    window.URLSearchParams = class extends Orig {
      constructor(init) {
        super(init);
        try { if (typeof init === "string" && init === location.search) this.set("qa", "1"); } catch (e) {}
      }
    };
  }
})()`;

// ---- in-page runner ---------------------------------------------------------------------

export interface RunPayload {
  mode: "policy" | "script";
  params?: PolicyParams;
  segments?: ScriptSegment[];
  leadIn?: number;
  /** Policy mode: the controller sees the state from this many steps ago (models frame latency). */
  observationDelay?: number;
  maxSteps: number;
}

export interface CheckpointEvent {
  step: number;
  t: number;
  lap: number;
  gate: number | null;
  name: string;
}

export interface RunResult {
  outcome: "finished" | "lost" | "timeout" | "error";
  error?: string;
  steps: number;
  finishTime: number | null;
  lapTimes: number[];
  bestLap: number | null;
  checkpoints: CheckpointEvent[];
  routeEvents: { step: number; t: number; lap: number; s: number; text: string }[];
  gatesPassed: number;
  hits: number;
  respawns: number;
  nearMisses: number;
  dust: number;
  tricks: number;
  stunts: number;
  loops: number;
  score: number;
  place: number | null;
  medal: string | null;
  standings: unknown;
  hudFrames: { step: number; t: number; event: string; hud: Record<string, string | null> }[];
  trace: Record<string, number | string | boolean | null>[];
  setup: Record<string, unknown>;
}

export interface RunOutput {
  result: RunResult;
  segments: ScriptSegment[];
}

/**
 * Source of an async IIFE evaluated in the game frame. `policySource` is the text of a
 * function `(state, params) => StepInput`. Returns a JSON string of `RunOutput`.
 */
export function pageRunnerSource(policySource: string, payload: RunPayload): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var policy = (${policySource});
  var o = window.__orbit;
  var fail = function (msg, extra) {
    return JSON.stringify({ result: Object.assign({ outcome: "error", error: msg, steps: 0, finishTime: null, lapTimes: [], bestLap: null, checkpoints: [], routeEvents: [], gatesPassed: 0, hits: 0, respawns: 0, nearMisses: 0, dust: 0, tricks: 0, stunts: 0, loops: 0, score: 0, place: null, medal: null, standings: null, hudFrames: [], trace: [], setup: {} }, extra || {}), segments: [] });
  };
  if (!o || typeof o.advance !== "function" || typeof o.begin !== "function" || !("race" in o)) {
    return fail("qa hooks missing", { setup: { orbitKeys: o ? Object.keys(o) : null } });
  }
  var DT = 1 / 60;
  var round = function (x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; };
  var quant = function (x) { var c = Math.max(-1, Math.min(1, x)); var q = Math.round(c * 20) / 20; return q === 0 ? 0 : round(q, 6); };
  var text = function (id) { var e = document.getElementById(id); return e ? e.textContent : null; };
  var hud = function () { return { place: text("place"), lap: text("lap"), timer: text("timer"), best: text("lap-best"), route: text("route-name") }; };
  try { await o.begin(); } catch (e) { return fail("begin() threw: " + String(e && e.message || e)); }
  var r0 = o.race;
  if (!r0 || r0.phase !== "countdown") return fail("race did not enter countdown", { setup: { phase: r0 && r0.phase } });
  var setup = { mode: r0.mode, difficulty: r0.difficulty, vehicle: r0.vehicle, rider: r0.rider, courseId: r0.courseId, laps: r0.laps, equipment: r0.equipment, rivals: r0.rivals.length, step: DT };
  var script = P.mode === "script" ? P.segments : null;
  var segIndex = 0, segLeft = script && script.length ? script[0].steps : 0;
  var leadIn = P.leadIn || 0;
  var steps = 0, events = [], routeEvents = [], hudFrames = [], trace = [], segments = [];
  var delay = P.observationDelay || 0, hist = [];
  var last = null;
  var outcome = null;
  for (;;) {
    var r = o.race;
    if (r.phase === "finished") { outcome = "finished"; break; }
    if (r.phase === "lost") { outcome = "lost"; break; }
    if (steps >= P.maxSteps) { outcome = "timeout"; break; }
    var inp;
    if (script) {
      if (steps < leadIn) inp = { pedal: false, brake: false, steer: 0, boost: false, jump: false, gravity: false };
      else {
        while (segIndex < script.length && segLeft === 0) { segIndex++; segLeft = segIndex < script.length ? script[segIndex].steps : 0; }
        if (segIndex >= script.length) { outcome = "timeout"; break; }
        inp = script[segIndex].input; segLeft--;
      }
    } else {
      var snap = { s: r.s, route: r.route, lane: r.lane, heading: r.heading || 0, energy: r.energy, edgeWarning: !!r.edgeWarning, gravityCharges: r.gravityCharges, air: !!r.air, loop: !!r.loop, flight: !!r.flight };
      hist.push(snap); if (hist.length > delay + 1) hist.shift();
      var p = policy(hist[0], P.params);
      inp = { pedal: !!p.pedal, brake: !!p.brake, steer: quant(p.steer), boost: !!p.boost, jump: !!p.jump, gravity: !!p.gravity };
    }
    if (last && last.input.pedal === inp.pedal && last.input.brake === inp.brake && last.input.boost === inp.boost && last.input.jump === inp.jump && last.input.gravity === inp.gravity && last.input.steer === inp.steer) last.steps++;
    else { last = { steps: 1, input: { pedal: inp.pedal, brake: inp.brake, steer: inp.steer, boost: inp.boost, jump: inp.jump, gravity: inp.gravity } }; segments.push(last); }
    o.advance(DT, inp);
    steps++;
    r = o.race;
    for (var i = 0; i < r.events.length; i++) {
      var ev = r.events[i];
      if (ev.type === "tick" || ev.type === "countdown") continue;
      if (ev.type === "gate") events.push({ step: steps, t: round(r.time, 4), lap: r.lap, gate: typeof ev.gate === "number" ? ev.gate : null, name: String(ev.text || "").split(" \\u00b7 ")[0] });
      if (ev.type === "route") routeEvents.push({ step: steps, t: round(r.time, 4), lap: r.lap, s: round(r.s, 2), text: String(ev.text || "") });
      if (ev.type === "go" || ev.type === "lap" || ev.type === "finish" || ev.type === "missedGate") hudFrames.push({ step: steps, t: round(r.time, 4), event: ev.type, hud: hud() });
    }
    if (steps % 60 === 0) trace.push({ t: round(r.time, 2), s: round(r.s, 2), lane: round(r.lane, 2), speed: round(r.speed, 2), route: r.route, lap: r.lap, phase: r.phase, heading: round(r.heading || 0, 3), energy: round(r.energy, 1), hits: r.hits, respawns: r.respawns, air: !!r.air, loop: !!r.loop, flight: !!r.flight });
  }
  var rf = o.race;
  var standings = null;
  try { standings = JSON.parse(JSON.stringify(o.state.standings)); } catch (e) { standings = null; }
  var end = rf.end || null;
  var result = {
    outcome: outcome, steps: steps,
    finishTime: end ? end.time : null,
    lapTimes: rf.lapTimes.map(function (x) { return round(x, 6); }),
    bestLap: isFinite(rf.bestLap) ? round(rf.bestLap, 6) : null,
    checkpoints: events, routeEvents: routeEvents, gatesPassed: rf.gatesPassed, hits: rf.hits, respawns: rf.respawns, nearMisses: rf.nearMisses,
    dust: rf.dust, tricks: rf.tricks, stunts: rf.stunts, loops: rf.loops, score: rf.score,
    place: end ? end.place : null, medal: end ? end.medal : null,
    standings: standings, hudFrames: hudFrames, trace: trace, setup: setup
  };
  return JSON.stringify({ result: result, segments: segments });
})()`;
}

// ---- comparison, variance, tolerance -------------------------------------------------

export interface RunComparison {
  identical: boolean;
  outcomeEqual: boolean;
  lapCountEqual: boolean;
  checkpointOrderEqual: boolean;
  finishTimeDelta: number | null;
  maxLapTimeDelta: number | null;
}

const checkpointKey = (c: CheckpointEvent): string => `${c.lap}:${c.gate ?? "?"}:${c.name}`;

export function checkpointOrder(result: Pick<RunResult, "checkpoints">): string[] {
  return result.checkpoints.map(checkpointKey);
}

export function compareRuns(a: RunResult, b: RunResult): RunComparison {
  const outcomeEqual = a.outcome === b.outcome;
  const lapCountEqual = a.lapTimes.length === b.lapTimes.length;
  const orderA = checkpointOrder(a);
  const orderB = checkpointOrder(b);
  const checkpointOrderEqual = orderA.length === orderB.length && orderA.every((k, i) => k === orderB[i]);
  const finishTimeDelta = a.finishTime !== null && b.finishTime !== null ? Math.abs(a.finishTime - b.finishTime) : null;
  let maxLapTimeDelta: number | null = null;
  if (lapCountEqual && a.lapTimes.length > 0) {
    maxLapTimeDelta = a.lapTimes.reduce((m, t, i) => Math.max(m, Math.abs(t - (b.lapTimes[i] as number))), 0);
  }
  const identical =
    outcomeEqual && lapCountEqual && checkpointOrderEqual && finishTimeDelta === 0 && (maxLapTimeDelta === 0 || a.lapTimes.length === 0);
  return { identical, outcomeEqual, lapCountEqual, checkpointOrderEqual, finishTimeDelta, maxLapTimeDelta };
}

export interface VarianceSummary {
  comparisons: number;
  /** Comparisons whose outcome changed (for example finished -> lost); their time deltas are undefined. */
  outcomeMismatches: number;
  exact: boolean;
  allOutcomesEqual: boolean;
  allLapCountsEqual: boolean;
  allCheckpointOrdersEqual: boolean;
  maxFinishTimeDelta: number;
  maxLapTimeDelta: number;
}

export function summarizeVariance(comparisons: readonly RunComparison[]): VarianceSummary {
  return {
    comparisons: comparisons.length,
    outcomeMismatches: comparisons.filter((c) => !c.outcomeEqual).length,
    exact: comparisons.length > 0 && comparisons.every((c) => c.identical),
    allOutcomesEqual: comparisons.every((c) => c.outcomeEqual),
    allLapCountsEqual: comparisons.every((c) => c.lapCountEqual),
    allCheckpointOrdersEqual: comparisons.every((c) => c.checkpointOrderEqual),
    maxFinishTimeDelta: comparisons.reduce((m, c) => Math.max(m, c.finishTimeDelta ?? 0), 0),
    maxLapTimeDelta: comparisons.reduce((m, c) => Math.max(m, c.maxLapTimeDelta ?? 0), 0)
  };
}

export interface Tolerance {
  finishTimeSec: number;
  lapTimeSec: number;
  /**
   * True when a timing perturbation of the replayed script changed the race outcome: the script
   * is only valid replayed step-exactly, and a looser time tolerance would not make it safe.
   */
  openLoopStepExact: boolean;
  basis: string;
}

/** One judgement constant, stated in the output: the observed spread is multiplied by SAFETY. */
export const TOLERANCE_SAFETY = 1.5;

/**
 * Tolerance for comparing another implementation to this reference, from data only:
 * the larger of one sim step (the reference's own time quantum) and SAFETY times the
 * largest finish/lap delta seen across repeat runs and across closed-loop controller-latency
 * perturbations (outcome-preserving ones). Open-loop script shifts are reported separately: if any
 * changed the outcome, the script is only valid replayed step-exactly.
 */
export function toleranceFrom(repeat: VarianceSummary, openLoop: VarianceSummary, closedLoop: VarianceSummary): Tolerance {
  const finish = Math.max(SIM_STEP, TOLERANCE_SAFETY * Math.max(repeat.maxFinishTimeDelta, closedLoop.maxFinishTimeDelta));
  const lap = Math.max(SIM_STEP, TOLERANCE_SAFETY * Math.max(repeat.maxLapTimeDelta, closedLoop.maxLapTimeDelta));
  const stepExact = repeat.outcomeMismatches + openLoop.outcomeMismatches > 0;
  const notes: string[] = [];
  if (stepExact) notes.push(`${repeat.outcomeMismatches + openLoop.outcomeMismatches} open-loop comparison(s) changed outcome: the script is only valid replayed step-exactly`);
  if (closedLoop.outcomeMismatches > 0) notes.push(`${closedLoop.outcomeMismatches} closed-loop latency run(s) changed outcome and are excluded from the time spread`);
  return {
    finishTimeSec: Math.round(finish * 1e4) / 1e4,
    lapTimeSec: Math.round(lap * 1e4) / 1e4,
    openLoopStepExact: stepExact,
    basis: `max(1 sim step = ${SIM_STEP.toFixed(4)} s, ${TOLERANCE_SAFETY} x max observed delta over repeats and closed-loop controller-latency perturbations)` + (notes.length ? `; ${notes.join("; ")}` : "")
  };
}

// ---- report validation -------------------------------------------------------------------

export interface ReferenceReport {
  schema: typeof CAPTURE_SCHEMA;
  game: string;
  url: string;
  capturedAt: string;
  setup: Record<string, unknown>;
  policy: { name: string; params: PolicyParams };
  script: { encoding: string; steps: number; text: string };
  reference: RunResult;
  sessions: unknown[];
  variance: { repeat: VarianceSummary; openLoopShift: VarianceSummary; closedLoopLatency: VarianceSummary };
  tolerance: Tolerance;
}

export function validateReport(report: unknown): string[] {
  const errors: string[] = [];
  const r = report as Partial<ReferenceReport> | null;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== CAPTURE_SCHEMA) errors.push(`schema must be ${CAPTURE_SCHEMA}`);
  if (!r.game) errors.push("missing game");
  if (!r.url) errors.push("missing url");
  if (!r.script || typeof r.script.text !== "string" || !(r.script.steps > 0)) errors.push("missing script");
  else {
    try {
      const segs = parseInputScript(r.script.text);
      if (totalSteps(segs) !== r.script.steps) errors.push(`script steps ${r.script.steps} != parsed ${totalSteps(segs)}`);
    } catch (e) {
      errors.push(`script does not parse: ${String(e instanceof Error ? e.message : e)}`);
    }
  }
  const ref = r.reference;
  if (!ref) errors.push("missing reference run");
  else {
    if (ref.outcome !== "finished") errors.push(`reference outcome is ${ref.outcome}, expected finished`);
    const laps = Number(ref.setup?.laps);
    if (!(laps > 0)) errors.push("reference setup.laps missing");
    else {
      if (ref.lapTimes.length !== laps) errors.push(`lapTimes has ${ref.lapTimes.length} entries, expected ${laps}`);
      if (typeof ref.finishTime !== "number" || !(ref.finishTime > 0)) errors.push("finishTime missing");
      else if (ref.lapTimes.length === laps) {
        const sum = ref.lapTimes.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - ref.finishTime) > 2 * SIM_STEP) errors.push(`lap times sum ${sum.toFixed(3)} != finishTime ${ref.finishTime.toFixed(3)}`);
      }
    }
    if (!Array.isArray(ref.checkpoints) || ref.checkpoints.length === 0) errors.push("no checkpoints recorded");
  }
  if (!r.variance) errors.push("missing variance");
  if (!r.tolerance || !(r.tolerance.finishTimeSec > 0)) errors.push("missing tolerance");
  if (!Array.isArray(r.sessions) || r.sessions.length < 2) errors.push("need at least 2 independent sessions");
  return errors;
}

// ---- assembling session logs into the evidence file ---------------------------------------

export interface SessionRecord {
  schema: "a3d-crayon-capture-session/1";
  session: number;
  startedAt: string;
  url: string;
  browser?: string;
  params: PolicyParams;
  primaryWallMs?: number;
  primary: RunOutput;
  replay: RunResult;
  perturbations: { leadIn: number; result: RunResult }[];
  closedLoop: { delay: number; result: RunResult }[];
  /** Added by the assembler: which log/run the session came from. */
  source?: string;
}

/** Extract the JSON blocks printed between `@@CRAYON_CAPTURE_BEGIN:<n>` / `@@CRAYON_CAPTURE_END:<n>`. */
export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:(\S+)\s*\n([\s\S]*?)\n@@CRAYON_CAPTURE_END:\1/g;
  for (let m = re.exec(log); m; m = re.exec(log)) {
    try {
      out.push(JSON.parse(m[2] as string));
    } catch {
      out.push({ error: `block ${m[1]} is not valid JSON` });
    }
  }
  return out;
}

export interface AssembleMeta {
  game: string;
  url: string;
  capturedAt: string;
  policyName: string;
}

export function assembleReport(sessions: readonly SessionRecord[], meta: AssembleMeta): ReferenceReport {
  const first = sessions[0];
  if (!first) throw new Error("no sessions to assemble");
  const reference = first.primary.result;
  const scriptText = encodeInputScript(first.primary.segments);
  const repeat: RunComparison[] = [];
  const openLoop: RunComparison[] = [];
  const closedLoop: RunComparison[] = [];
  const summaries = sessions.map((s, i) => {
    const vsReference = i === 0 ? null : compareRuns(reference, s.primary.result);
    if (vsReference) repeat.push(vsReference);
    const replayCmp = compareRuns(s.primary.result, s.replay);
    repeat.push(replayCmp);
    const perturbations = s.perturbations.map((p) => {
      const cmp = compareRuns(s.primary.result, p.result);
      openLoop.push(cmp);
      return { leadIn: p.leadIn, finishTime: p.result.finishTime, finishTimeDelta: cmp.finishTimeDelta, maxLapTimeDelta: cmp.maxLapTimeDelta, checkpointOrderEqual: cmp.checkpointOrderEqual };
    });
    const latency = s.closedLoop.map((c) => {
      const cmp = compareRuns(s.primary.result, c.result);
      closedLoop.push(cmp);
      return { delay: c.delay, outcome: c.result.outcome, finishTime: c.result.finishTime, finishTimeDelta: cmp.finishTimeDelta, maxLapTimeDelta: cmp.maxLapTimeDelta, checkpointOrderEqual: cmp.checkpointOrderEqual, hits: c.result.hits, place: c.result.place };
    });
    return {
      source: s.source ?? `session-${s.session}`,
      startedAt: s.startedAt,
      browser: s.browser ?? null,
      finishTime: s.primary.result.finishTime,
      lapTimes: s.primary.result.lapTimes,
      steps: s.primary.result.steps,
      place: s.primary.result.place,
      scriptMatchesReference: encodeInputScript(s.primary.segments) === scriptText,
      vsReference,
      replayIdentical: replayCmp.identical,
      perturbations,
      closedLoopLatency: latency
    };
  });
  const repeatSummary = summarizeVariance(repeat);
  const openLoopSummary = summarizeVariance(openLoop);
  const closedLoopSummary = summarizeVariance(closedLoop);
  return {
    schema: CAPTURE_SCHEMA,
    game: meta.game,
    url: meta.url,
    capturedAt: meta.capturedAt,
    setup: reference.setup,
    policy: { name: meta.policyName, params: first.params },
    script: { encoding: "rle: <steps>x[PBOJG-] s=<steer>; one step = 1/60 s; the script includes the countdown steps", steps: totalSteps(first.primary.segments), text: scriptText },
    reference,
    sessions: summaries,
    variance: { repeat: repeatSummary, openLoopShift: openLoopSummary, closedLoopLatency: closedLoopSummary },
    tolerance: toleranceFrom(repeatSummary, openLoopSummary, closedLoopSummary)
  };
}
