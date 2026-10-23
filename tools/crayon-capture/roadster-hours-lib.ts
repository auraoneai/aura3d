// Roadster Hours reference capture: pure helpers (script encoding, comparison, validation, in-page hook source).
// The capture itself runs remotely only (tools/crayon-capture/roadster-hours.ts).

export const RH_CAPTURE_SCHEMA = "a3d-crayon-capture/1";
export const RH_GAME = "roadster-hours";
/** The game's fixed simulation step; one recorded input per step. */
export const RH_SIM_STEP = 1 / 120;

export interface StepInput {
  throttle: number; brake: number; steer: number; thrust: boolean; drift: boolean; nitro: boolean;
  roll: number; spin: number; flip: number; recover: boolean;
}
export interface ScriptSegment { n: number; input: StepInput }

export const IDLE_INPUT: StepInput = {
  throttle: 0, brake: 0, steer: 0, thrust: false, drift: false, nitro: false, roll: 0, spin: 0, flip: 0, recover: false
};

export function normalizeInput(i: Partial<Record<keyof StepInput, unknown>> | null | undefined): StepInput {
  const o = i ?? {};
  return {
    throttle: Number(o.throttle) || 0, brake: Number(o.brake) || 0, steer: Number(o.steer) || 0, thrust: !!o.thrust,
    drift: !!o.drift, nitro: !!o.nitro, roll: Number(o.roll) || 0, spin: Number(o.spin) || 0, flip: Number(o.flip) || 0,
    recover: !!o.recover
  };
}

const keyOf = (i: StepInput): string =>
  [i.throttle, i.brake, i.steer, +i.thrust, +i.drift, +i.nitro, i.roll, i.spin, i.flip, +i.recover].join(",");

export function runLengthEncode(inputs: readonly StepInput[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  let last = "";
  for (const input of inputs) {
    const key = keyOf(input);
    if (out.length && key === last) out[out.length - 1]!.n++;
    else { out.push({ n: 1, input }); last = key; }
  }
  return out;
}

export function expandSegments(segments: readonly ScriptSegment[]): StepInput[] {
  const out: StepInput[] = [];
  for (const seg of segments) for (let i = 0; i < seg.n; i++) out.push(seg.input);
  return out;
}

export const totalSteps = (segments: readonly ScriptSegment[]): number => segments.reduce((sum, s) => sum + s.n, 0);

/** Counters whose change is logged as a transition (step, key, from, to). */
export const DISCRETE_KEYS = [
  "phase", "nextGate", "checkpoint", "cells", "crashes", "grounded", "cleanLandings", "airRolls", "airSpins", "airFlips",
  "combos", "lineupsCleared", "vehiclesCleared", "overTops", "nearMisses", "trailerRides", "shortcuts", "nitro"
] as const;
export const TRACE_KEYS = [
  "s", "l", "h", "v", "vy", "theta", "thrust", "heat", "time", "score", "combo", "wheel", "slip", "roll", "spin", "flip"
] as const;
export type Observation = Record<string, number | string | boolean>;

/** Compact observation of a run state: used identically for the original game's state and the port's. */
export function observe(z: {
  phase: string; s: number; l: number; h: number; v: number; vy: number; theta: number; thrust: number; heat: number;
  time: number; score: number; combo: number; wheel: number; slip: number; roll: number; spin: number; flip: number;
  grounded: boolean; nextGate: number; checkpoint: number; cells: { size: number }; crashes: number; cleanLandings: number;
  airRolls: number; airSpins: number; airFlips: number; combos: number; lineupsCleared: number; vehiclesCleared: number;
  overTops: number; nearMisses: number; trailerRides: number; shortcuts: number; nitro: number;
}): Observation {
  return {
    phase: z.phase, s: z.s, l: z.l, h: z.h, v: z.v, vy: z.vy, theta: z.theta, thrust: z.thrust, heat: z.heat, time: z.time,
    score: z.score, combo: z.combo, wheel: z.wheel, slip: z.slip, roll: z.roll, spin: z.spin, flip: z.flip, grounded: z.grounded,
    nextGate: z.nextGate, checkpoint: z.checkpoint, cells: z.cells.size, crashes: z.crashes, cleanLandings: z.cleanLandings,
    airRolls: z.airRolls, airSpins: z.airSpins, airFlips: z.airFlips, combos: z.combos, lineupsCleared: z.lineupsCleared,
    vehiclesCleared: z.vehiclesCleared, overTops: z.overTops, nearMisses: z.nearMisses, trailerRides: z.trailerRides,
    shortcuts: z.shortcuts, nitro: z.nitro
  };
}

export interface Transition { step: number; key: string; from: number | string | boolean; to: number | string | boolean }
export interface TraceSample { step: number; obs: Observation }
export interface FinalState {
  screen: string; phase: string; level: string; time: number; score: number; cells: number; crashes: number;
  cleanLandings: number; airRolls: number; airSpins: number; airFlips: number; combos: number; lineupsCleared: number;
  vehiclesCleared: number; overTops: number; nearMisses: number; trailerRides: number; shortcuts: number;
  results: Record<string, { time: number; score: number; medal: string; cells: number }>;
}
export interface SessionRecord {
  session: string; mode: "policy" | "replay" | "direct" | "ingame"; level: number; steps: number; segments: ScriptSegment[];
  transitions: Transition[]; trace: TraceSample[]; final: FinalState | null; menuTraffic: unknown; vehicles: number | null;
  virtualFrames: number; wallMs: number; error?: string;
}

/** Walks a script the way the page hook does: an observation per step, transitions on counter changes. */
export function diffObservations(step: number, prev: Observation | null, cur: Observation, out: Transition[]): void {
  if (!prev) return;
  for (const key of DISCRETE_KEYS) if (prev[key] !== cur[key]) out.push({ step, key, from: prev[key]!, to: cur[key]! });
}

export interface RunComparison {
  sameSteps: boolean; sameScript: boolean; sameFinal: boolean; sameTransitions: boolean;
  firstTransitionMismatch: number | null; maxTraceDelta: number; worstTraceKey: string | null; traceSamples: number;
}

const nearlyEqual = (a: unknown, b: unknown): boolean => a === b;

export function compareSessions(a: SessionRecord, b: SessionRecord): RunComparison {
  const scriptA = JSON.stringify(a.segments);
  const scriptB = JSON.stringify(b.segments);
  const finalKeys: (keyof FinalState)[] = ["time", "score", "cells", "crashes", "cleanLandings", "airRolls", "airSpins", "airFlips", "combos", "lineupsCleared", "vehiclesCleared", "overTops", "nearMisses", "trailerRides", "shortcuts"];
  const sameFinal = !!a.final && !!b.final && finalKeys.every((k) => nearlyEqual(a.final![k], b.final![k]));
  let first: number | null = null;
  const len = Math.max(a.transitions.length, b.transitions.length);
  for (let i = 0; i < len; i++) {
    const x = a.transitions[i];
    const y = b.transitions[i];
    if (!x || !y || x.step !== y.step || x.key !== y.key || x.to !== y.to) { first = x?.step ?? y?.step ?? i; break; }
  }
  let max = 0;
  let worst: string | null = null;
  const n = Math.min(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i++) {
    for (const key of TRACE_KEYS) {
      const d = Math.abs((a.trace[i]!.obs[key] as number) - (b.trace[i]!.obs[key] as number));
      if (d > max) { max = d; worst = key; }
    }
  }
  return {
    sameSteps: a.steps === b.steps, sameScript: scriptA === scriptB, sameFinal, sameTransitions: first === null,
    firstTransitionMismatch: first, maxTraceDelta: max, worstTraceKey: worst, traceSamples: n
  };
}

/** Compare a partial session (the live-game run stopped after `partial.steps` steps) against the matching prefix of the reference. */
export function comparePrefix(ref: SessionRecord, partial: SessionRecord): RunComparison {
  const steps = partial.steps;
  const refT = ref.transitions.filter((t) => t.step <= steps);
  const partT = partial.transitions.filter((t) => t.step <= steps);
  let first: number | null = null;
  const len = Math.max(refT.length, partT.length);
  for (let i = 0; i < len; i++) {
    const x = refT[i], y = partT[i];
    if (!x || !y || x.step !== y.step || x.key !== y.key || x.to !== y.to) { first = x?.step ?? y?.step ?? i; break; }
  }
  const refTrace = ref.trace.filter((t) => t.step < steps);
  let max = 0;
  let worst: string | null = null;
  const n = Math.min(refTrace.length, partial.trace.length);
  for (let i = 0; i < n; i++) {
    for (const key of TRACE_KEYS) {
      const d = Math.abs((refTrace[i]!.obs[key] as number) - (partial.trace[i]!.obs[key] as number));
      if (d > max) { max = d; worst = key; }
    }
  }
  const expandedRef = JSON.stringify(expandSegments(ref.segments).slice(0, steps));
  const expandedPartial = JSON.stringify(expandSegments(partial.segments).slice(0, steps));
  return {
    sameSteps: partial.steps <= ref.steps, sameScript: expandedRef === expandedPartial, sameFinal: true, sameTransitions: first === null,
    firstTransitionMismatch: first, maxTraceDelta: max, worstTraceKey: worst, traceSamples: n
  };
}

export interface Tolerance { traceDelta: number; basis: string }
export const TOLERANCE_SAFETY = 1.5;
export function toleranceFrom(comparisons: readonly RunComparison[]): Tolerance {
  const worst = Math.max(0, ...comparisons.map((c) => c.maxTraceDelta));
  return { traceDelta: worst === 0 ? 0 : worst * TOLERANCE_SAFETY, basis: worst === 0 ? "all compared sessions bit-identical" : `${TOLERANCE_SAFETY} x worst observed trace delta ${worst}` };
}

export interface ReferenceReport {
  schema: typeof RH_CAPTURE_SCHEMA; game: typeof RH_GAME; capturedAt: string; level: number; levelId: string;
  setup: { simStep: number; viewport: string; virtualFrameMs: number; policy: string; policyParams: unknown; release: string };
  script: ScriptSegment[]; steps: number; reference: SessionRecord; sessions: SessionRecord[];
  variance: { sessions: RunComparison[]; replay: RunComparison[] }; tolerance: Tolerance; status: "CAPTURED" | "LIMIT-RECORDED";
  statusReasons: string[];
}

export function validateReport(report: unknown): string[] {
  const problems: string[] = [];
  const r = report as Partial<ReferenceReport> | null;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== RH_CAPTURE_SCHEMA) problems.push(`schema must be ${RH_CAPTURE_SCHEMA}`);
  if (r.game !== RH_GAME) problems.push(`game must be ${RH_GAME}`);
  if (!Array.isArray(r.script) || !r.script.length) problems.push("script must be a non-empty run-length list");
  else if (totalSteps(r.script) !== r.steps) problems.push("steps must equal the script length");
  const ref = r.reference;
  if (!ref || !ref.final) problems.push("reference has no final state");
  else if (ref.final.phase !== "complete") problems.push(`reference run did not finish (phase ${ref.final.phase})`);
  if (!Array.isArray(r.sessions) || r.sessions.length < 2) problems.push("at least two independent sessions are required");
  return problems;
}

export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:([^\n]*)\n([\s\S]*?)\n@@CRAYON_CAPTURE_END:\1/g;
  for (let m = re.exec(log); m; m = re.exec(log)) {
    try { out.push(JSON.parse(m[2]!)); } catch { /* truncated block */ }
  }
  return out;
}

/**
 * Pre-boot hook (runs in every frame, including the sandboxed about:srcdoc game frame).
 * - `window.__a3dVT`: switchable virtual rAF/performance.now so the harness decides how much game time each frame covers.
 * - `window.skybreakDemo.input(z)`: the game's own per-simulation-step input hook. In `policy` mode it asks the injected
 *   closed-loop policy and records the (normalised) input; in `replay` mode it feeds a recorded script.
 */
export const HOOK_SOURCE = `(function () {
  if (window.__a3dVT) return;
  var realRaf = window.requestAnimationFrame.bind(window), realNow = performance.now.bind(performance);
  var vt = (window.__a3dVT = { active: false, now: 0, queue: [], frames: 0 });
  window.requestAnimationFrame = function (cb) { if (!vt.active) return realRaf(cb); vt.queue.push(cb); return vt.queue.length; };
  performance.now = function () { return vt.active ? vt.now : realNow(); };
  vt.enable = function () { vt.now = realNow(); vt.active = true; };
  vt.step = function (n, ms) {
    for (var i = 0; i < n; i++) {
      vt.now += ms; var q = vt.queue; vt.queue = [];
      for (var j = 0; j < q.length; j++) q[j](vt.now);
      vt.frames++;
    }
    return vt.frames;
  };
  var DISCRETE = ${JSON.stringify(DISCRETE_KEYS)};
  var TRACE = ${JSON.stringify(TRACE_KEYS)};
  function observe(z) {
    return { phase: z.phase, s: z.s, l: z.l, h: z.h, v: z.v, vy: z.vy, theta: z.theta, thrust: z.thrust, heat: z.heat, time: z.time,
      score: z.score, combo: z.combo, wheel: z.wheel, slip: z.slip, roll: z.roll, spin: z.spin, flip: z.flip, grounded: z.grounded,
      nextGate: z.nextGate, checkpoint: z.checkpoint, cells: z.cells.size, crashes: z.crashes, cleanLandings: z.cleanLandings,
      airRolls: z.airRolls, airSpins: z.airSpins, airFlips: z.airFlips, combos: z.combos, lineupsCleared: z.lineupsCleared,
      vehiclesCleared: z.vehiclesCleared, overTops: z.overTops, nearMisses: z.nearMisses, trailerRides: z.trailerRides,
      shortcuts: z.shortcuts, nitro: z.nitro };
  }
  function normalize(i) {
    i = i || {};
    return { throttle: +i.throttle || 0, brake: +i.brake || 0, steer: +i.steer || 0, thrust: !!i.thrust, drift: !!i.drift, nitro: !!i.nitro,
      roll: +i.roll || 0, spin: +i.spin || 0, flip: +i.flip || 0, recover: !!i.recover };
  }
  function key(i) { return [i.throttle, i.brake, i.steer, +i.thrust, +i.drift, +i.nitro, i.roll, i.spin, i.flip, +i.recover].join(","); }
  var cap = (window.__rhCap = { mode: "idle", policy: null, script: null, steps: 0, segments: [], lastKey: "", transitions: [], trace: [], traceEvery: 60, prev: null });
  var IDLE = normalize(null);
  window.skybreakDemo = { input: function (z) {
    var c = window.__rhCap;
    if (c.mode === "idle") return IDLE;
    var obs = observe(z);
    if (c.prev) for (var k = 0; k < DISCRETE.length; k++) { var d = DISCRETE[k]; if (c.prev[d] !== obs[d]) c.transitions.push({ step: c.steps, key: d, from: c.prev[d], to: obs[d] }); }
    c.prev = obs;
    if (c.steps % c.traceEvery === 0) c.trace.push({ step: c.steps, obs: obs });
    var inp = normalize(c.mode === "policy" ? c.policy(z) : (c.script[c.steps] || IDLE));
    var kk = key(inp);
    if (c.segments.length && kk === c.lastKey) c.segments[c.segments.length - 1].n++; else { c.segments.push({ n: 1, input: inp }); c.lastKey = kk; }
    c.steps++;
    return inp;
  } };
})()`;

/**
 * Settings seed for the game's saved career (localStorage `skybreak.career.v1`): the cheaper graphics tier, no sound,
 * no camera shake, no slow motion. None of these touch the simulation (`R(state, input, 1/120)`); they only cut the
 * software-GL cost per frame and the number of frames a scripted run needs.
 */
export const STORAGE_SEED_SOURCE = `(function () {
  try {
    localStorage.setItem("skybreak.career.v1", JSON.stringify({ version: 1, unlocked: 0, credits: 0,
      upgrades: { reservoir: 0, cooling: 0, aero: 0 }, results: {}, awards: [], resume: null,
      settings: { sound: false, quality: "balanced", shake: false, slowmo: false, controls: "auto", touchHelpSeen: true } }));
  } catch (e) {}
})()`;

/**
 * Once the route is running, make GL draw calls no-ops. The simulation never reads GL results, so the scripted run
 * costs JS time only. Screenshots are taken by a separate run that does not use this.
 */
export const NO_DRAW_SOURCE = `(function () {
  var names = ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements"];
  [window.WebGL2RenderingContext, window.WebGLRenderingContext].forEach(function (C) {
    if (!C) return;
    names.forEach(function (n) { if (C.prototype[n]) C.prototype[n] = function () {}; });
  });
  // The game also publishes its three.js namespace; skipping WebGLRenderer.render removes shadow, scene and post passes.
  var T = window.__THREE__ || window.__playlabsTHREE;
  if (T && T.WebGLRenderer && T.WebGLRenderer.prototype) T.WebGLRenderer.prototype.render = function () {};
  return !!(T && T.WebGLRenderer);
})()`;
