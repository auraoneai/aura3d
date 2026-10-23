/**
 * tools/crayon-capture/ninja-runner-lib — pure helpers for the Ninja Runner reference capture
 * (Phase C, R-20). The in-page runner drives the ORIGINAL game through its own `window.__konoha`
 * hooks (`start`, `restart`, `action`, `simulate`); the sim is a pure fixed-step function
 * (`pf(state, 1/120)`) with a seeded course (xorshift, seed 17), so the run depends only on the
 * action script. REMOTE RUN ONLY; see tools/crayon-capture/ninja-runner.ts.
 */
import { CAPTURE_SCHEMA } from "./lib.js";

export const NINJA_SCHEMA = CAPTURE_SCHEMA;
/** One sim step of the original (`pf(z, 1/120)`). */
export const NINJA_STEP = 1 / 120;

export type NinjaAction =
  | "left"
  | "right"
  | "jump"
  | "slide"
  | "rasengan"
  | "dash"
  | "clones"
  | "rasenshuriken"
  | "cycleForm";

export const NINJA_ACTIONS: readonly NinjaAction[] = ["left", "right", "jump", "slide", "rasengan", "dash", "clones", "rasenshuriken", "cycleForm"];

export interface ScriptEntry {
  /** 0-based sim step at whose START the actions are applied (before `pf`). */
  readonly step: number;
  readonly actions: readonly NinjaAction[];
}

/** `120:jump+rasengan;240:left` — sparse, step-indexed, order-preserving. */
export function encodeActionScript(entries: readonly ScriptEntry[]): string {
  return entries.map((e) => `${e.step}:${e.actions.join("+")}`).join(";");
}

export function decodeActionScript(text: string): ScriptEntry[] {
  if (text.trim() === "") return [];
  return text.split(";").map((chunk) => {
    const m = /^(\d+):([a-zA-Z+]+)$/.exec(chunk.trim());
    if (!m) throw new Error(`bad script entry "${chunk}"`);
    const actions = m[2]!.split("+").map((a) => {
      if (!NINJA_ACTIONS.includes(a as NinjaAction)) throw new Error(`unknown action "${a}"`);
      return a as NinjaAction;
    });
    return { step: Number(m[1]), actions };
  });
}

export function scriptActionCount(entries: readonly ScriptEntry[]): number {
  return entries.reduce((n, e) => n + e.actions.length, 0);
}

export interface PolicyParams {
  /** Switch form (Space) as soon as Sage Mode unlocks (600 m). */
  useForm: boolean;
  /** Switch Sage -> Kurama (Space) once Kurama unlocks (1620 m) and chakra is at least `kuramaChakra`. */
  useKurama: boolean;
  kuramaChakra: number;
  /** Shadow clones (key 1) when chakra is high and an enemy is close. */
  useClones: boolean;
  /** Rasenshuriken (key 3) against clusters of enemies. */
  useShuriken: boolean;
  /** Chakra dash (Shift) when an enemy is close and chakra is nearly full. */
  useDash: boolean;
  cloneChakra: number;
  cloneRange: number;
  shurikenChakra: number;
  shurikenCluster: number;
  shurikenRange: number;
  dashChakra: number;
  dashRange: number;
}

/** The game's own QA autopilot only (no extras). */
export const QA_ONLY_POLICY: PolicyParams = {
  useForm: false, useKurama: false, kuramaChakra: 150, useClones: false, useShuriken: false, useDash: false,
  cloneChakra: 200, cloneRange: 22, shurikenChakra: 150, shurikenCluster: 2, shurikenRange: 30, dashChakra: 280, dashRange: 14
};

export const DEFAULT_POLICY: PolicyParams = { ...QA_ONLY_POLICY, useForm: true, useKurama: true, useClones: true, useShuriken: true, useDash: true };

/** Sweep order: richest first (covers every ability), then progressively simpler until a run wins. */
export const SWEEP_POLICIES: readonly PolicyParams[] = [
  DEFAULT_POLICY,
  { ...DEFAULT_POLICY, useKurama: false },
  { ...DEFAULT_POLICY, useDash: false },
  { ...DEFAULT_POLICY, useDash: false, useShuriken: false },
  { ...DEFAULT_POLICY, useDash: false, useShuriken: false, useClones: false },
  { ...QA_ONLY_POLICY, useForm: true },
  QA_ONLY_POLICY
];

export interface NinjaEvent {
  step: number;
  type: string;
  [key: string]: unknown;
}

export interface TracePoint {
  step: number;
  time: number;
  s: number;
  x: number;
  lane: number;
  y: number;
  vy: number;
  speed: number;
  health: number;
  chakra: number;
  kills: number;
  score: number;
  combo: number;
  form: string;
  phase: string;
  attack: number;
  dash: number;
  slide: number;
  invulnerable: number;
  clones: number;
  cloneStrikes: number;
  shurikens: number;
  deflections: number;
  damageTaken: number;
  falling: boolean;
  vaults: number;
  projectiles: number;
  aliveEnemies: number;
}

export interface RunSummary {
  outcome: "won" | "lost" | "timeout" | "error";
  error?: string;
  steps: number;
  endPhase: string;
  lostBy: "gap" | "health" | null;
  distance: number;
  time: number;
  kills: number;
  score: number;
  health: number;
  chakra: number;
  bestCombo: number;
  form: string;
  vaults: number;
  deflections: number;
  interrupts: number;
  damageTaken: number;
  attacksFired: number;
  cloneStrikes: number;
  eventCounts: Record<string, number>;
  events: NinjaEvent[];
  trace: TracePoint[];
  script: ScriptEntry[];
}

export interface CourseDigest {
  entities: number;
  byType: Record<string, number>;
  fnv1a: string;
  first: { id: number; s: number; lane: number; type: string; hp: number }[];
}

export interface NinjaPayload {
  mode: "policy" | "script" | "idle" | "qa-check";
  params?: PolicyParams;
  script?: ScriptEntry[];
  maxSteps: number;
  /** qa-check: number of sim steps both drivers run. */
  checkSteps?: number;
}

export interface NinjaSession {
  schema: "a3d-crayon-capture-session/1";
  session: number;
  startedAt: string;
  url: string;
  browser: string;
  error?: string;
  courseDigest?: CourseDigest;
  sweep?: { params: PolicyParams; outcome: string; distance: number; kills: number; steps: number; time: number }[];
  params?: PolicyParams;
  primary?: RunSummary;
  replay?: RunSummary;
  idle?: RunSummary;
  qaCheck?: { steps: number; qa: Record<string, unknown>; mine: Record<string, unknown>; equal: boolean };
  restartCheck?: { restarted: boolean; phaseAfterRestart: string; sAfterRestart: number; eventsAfterRestart: string[] };
}

// ---- in-page runner ----------------------------------------------------------------------

/**
 * Source of an async IIFE evaluated in the game frame. Returns a JSON string:
 * `{ courseDigest, run }` (or `{ error }`). Policy actions are applied through the game's own
 * `__konoha.action` (the same entry point the keyboard handler uses) and the sim is stepped with
 * `__konoha.simulate(1/120 + 1e-6)`, which runs exactly one `pf(z, 1/120)`. Events are recorded by
 * intercepting `state.events.push` (the game drains the array after every step).
 */
export function pageRunnerSource(payload: NinjaPayload): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var K = window.__konoha;
  if (!K || typeof K.simulate !== "function" || typeof K.action !== "function") return JSON.stringify({ error: "__konoha hooks missing", keys: K ? Object.keys(K) : null });
  for (var w = 0; w < 600 && !K.ready; w++) await new Promise(function (r) { setTimeout(r, 100); });
  if (!K.ready) return JSON.stringify({ error: "__konoha not ready" });
  var EPS = 1e-6;
  var GAPS = [[594, 600], [644, 651], [704, 711], [759, 766], [822, 829], [877, 884], [937, 944], [980, 986], [1815, 1822], [1987, 1994]];
  var gapAhead = function (s, d) { for (var i = 0; i < GAPS.length; i++) { if (GAPS[i][0] >= s && GAPS[i][0] - s <= d) return GAPS[i]; } return null; };
  var round = function (x, d) { var f = Math.pow(10, d); return Math.round(x * f) / f; };
  var fnv = function (text) { var h = 0x811c9dc5; for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return ("00000000" + h.toString(16)).slice(-8); };

  var digest = function (z) {
    var byType = {}, rows = [];
    z.entities.forEach(function (e) { byType[e.type] = (byType[e.type] || 0) + 1; rows.push(e.id + "," + e.s.toFixed(6) + "," + e.lane + "," + e.type + "," + e.hp); });
    return { entities: z.entities.length, byType: byType, fnv1a: fnv(rows.join("|")), first: z.entities.slice(0, 12).map(function (e) { return { id: e.id, s: round(e.s, 6), lane: e.lane, type: e.type, hp: e.hp }; }) };
  };

  var log, stepNo;
  var instrument = function (z) {
    var cur = z.events;
    var wrap = function (arr) {
      var push = Array.prototype.push;
      arr.push = function () {
        for (var i = 0; i < arguments.length; i++) { var ev = {}; ev.step = stepNo; for (var k in arguments[i]) ev[k] = arguments[i][k]; log.push(ev); }
        return push.apply(arr, arguments);
      };
      return arr;
    };
    for (var q = 0; q < cur.length; q++) { var pre = { step: 0 }; for (var pk in cur[q]) pre[pk] = cur[q][pk]; log.push(pre); }
    wrap(cur);
    Object.defineProperty(z, "events", { configurable: true, get: function () { return cur; }, set: function (v) { cur = wrap(v); } });
  };
  var begin = function () {
    log = []; stepNo = 0;
    var z = K.state; instrument(z);
    if (z.phase === "intro") K.start();
    return z;
  };

  var trace = function (z, n) {
    var alive = 0; for (var i = 0; i < z.entities.length; i++) { var e = z.entities[i]; if (e.alive && e.type !== "chakra") alive++; }
    return { step: n, time: round(z.time, 6), s: round(z.s, 6), x: round(z.x, 6), lane: z.lane, y: round(z.y, 6), vy: round(z.vy, 6), speed: round(z.speed, 6), health: z.health, chakra: round(z.chakra, 6), kills: z.kills, score: z.score, combo: z.combo, form: z.form, phase: z.phase, attack: round(z.attack, 6), dash: round(z.dash, 6), slide: round(z.slide, 6), invulnerable: round(z.invulnerable, 6), clones: round(z.clones, 6), cloneStrikes: z.cloneStrikes, shurikens: z.shurikens.length, deflections: z.deflections, damageTaken: z.damageTaken, falling: !!z.falling, vaults: z.vaults, projectiles: z.projectiles.length, aliveEnemies: alive };
  };

  // The game's own QA autopilot (__konoha.simulate(t, true) -> JS()), transcribed.
  var qaPolicy = function (z, acts) {
    if (gapAhead(z.s, z.speed * 0.24) && z.y === 0) acts.push("jump");
    var next = z.entities.filter(function (t) { return t.alive && t.type !== "chakra" && t.s > z.s - 1; }).sort(function (a, b) { return a.s - b.s; })[0];
    if (!next) return;
    var e = next.s - z.s;
    if (e < 26 && e > 5) { if (z.lane < next.lane) acts.push("right"); else if (z.lane > next.lane) acts.push("left"); }
    if (e < 12) { if (next.type === "beam") acts.push("slide"); else if (next.type === "barrier") acts.push("jump"); else if (e < 10) acts.push("rasengan"); }
  };
  var extras = function (z, p, acts) {
    var fighters = z.entities.filter(function (t) { return t.alive && t.type !== "chakra" && t.type !== "beam" && t.type !== "barrier" && t.s > z.s; });
    var nearest = fighters.reduce(function (m, t) { return m === null || t.s < m.s ? t : m; }, null);
    var dist = nearest ? nearest.s - z.s : 1e9;
    if (p.useForm && z.s >= 612 && z.form === "base") acts.push("cycleForm");
    if (p.useKurama && z.s >= 1630 && z.form === "sage" && z.chakra >= p.kuramaChakra) acts.push("cycleForm");
    if (p.useClones && z.chakra >= p.cloneChakra && z.clones <= 0 && z.cloneCooldown <= 0 && dist < p.cloneRange) acts.push("clones");
    if (p.useShuriken && z.chakra >= p.shurikenChakra && z.shurikenCooldown <= 0 && z.attack <= 0 && fighters.filter(function (t) { return t.s - z.s < p.shurikenRange; }).length >= p.shurikenCluster) acts.push("rasenshuriken");
    if (p.useDash && z.chakra >= p.dashChakra && z.dashCooldown <= 0 && z.dash <= 0 && dist < p.dashRange) acts.push("dash");
  };

  var stepOnce = function () { K.simulate(1 / 120 + EPS); };

  var runLoop = function (z, decide, maxSteps) {
    var script = [], tr = [], n = 0;
    tr.push(trace(z, 0));
    while (z.phase === "running" && n < maxSteps) {
      var acts = decide(z, n);
      stepNo = n + 1;
      if (acts.length) { script.push({ step: n, actions: acts.slice() }); }
      for (var i = 0; i < acts.length; i++) K.action(acts[i]);
      stepOnce();
      n++;
      if (n % 60 === 0) tr.push(trace(z, n));
    }
    if (n % 60 !== 0) tr.push(trace(z, n));
    var counts = {}; log.forEach(function (e) { counts[e.type] = (counts[e.type] || 0) + 1; });
    var lostBy = z.phase === "lost" ? (z.falling ? "gap" : "health") : null;
    return { outcome: z.phase === "won" ? "won" : z.phase === "lost" ? "lost" : "timeout", steps: n, endPhase: z.phase, lostBy: lostBy, distance: round(z.s, 6), time: round(z.time, 6), kills: z.kills, score: z.score, health: z.health, chakra: round(z.chakra, 6), bestCombo: z.bestCombo, form: z.form, vaults: z.vaults, deflections: z.deflections, interrupts: z.interrupts, damageTaken: z.damageTaken, attacksFired: z.attacksFired, cloneStrikes: z.cloneStrikes, eventCounts: counts, events: log.slice(), trace: tr, script: script };
  };

  var out = {};
  try {
    if (P.mode === "policy") {
      K.restart();
      var z0 = begin();
      out.courseDigest = digest(z0);
      out.run = runLoop(z0, function (z) { var a = []; qaPolicy(z, a); extras(z, P.params, a); return a; }, P.maxSteps);
    } else if (P.mode === "script") {
      K.restart();
      var z1 = begin();
      out.courseDigest = digest(z1);
      var byStep = {}; P.script.forEach(function (e) { byStep[e.step] = e.actions; });
      out.run = runLoop(z1, function (z, n) { return byStep[n] ? byStep[n].slice() : []; }, P.maxSteps);
    } else if (P.mode === "idle") {
      K.restart();
      var z2 = begin();
      out.courseDigest = digest(z2);
      out.run = runLoop(z2, function () { return []; }, P.maxSteps);
    } else if (P.mode === "qa-check") {
      // the game's own autopilot vs the transcribed policy, same step count
      var fields = function (z) { return { s: round(z.s, 6), x: round(z.x, 6), lane: z.lane, y: round(z.y, 6), health: z.health, chakra: round(z.chakra, 6), kills: z.kills, score: z.score, combo: z.combo, time: round(z.time, 6), phase: z.phase, attacksFired: z.attacksFired, deflections: z.deflections, vaults: z.vaults, damageTaken: z.damageTaken }; };
      K.restart();
      var za = K.state; if (za.phase === "intro") K.start();
      K.simulate(P.checkSteps / 120 + EPS, true);
      var qa = fields(K.state);
      K.restart();
      var zb = begin();
      var mine = P.checkSteps;
      runLoop(zb, function (z) { var a = []; qaPolicy(z, a); return a; }, mine);
      out.qaCheck = { steps: P.checkSteps, qa: qa, mine: fields(K.state), equal: JSON.stringify(qa) === JSON.stringify(fields(K.state)) };
    }
  } catch (e) { out.error = String(e && e.stack || e); }
  return JSON.stringify(out);
})()`;
}

// ---- comparison, variance, tolerance --------------------------------------------------------

export interface RunComparison {
  identical: boolean;
  outcomeEqual: boolean;
  eventsEqual: boolean;
  scriptEqual: boolean;
  /** Largest |delta| over numeric trace fields at equal steps. */
  maxTraceDelta: number;
  finishDistanceDelta: number;
  finishTimeDelta: number;
}

const TRACE_NUMBER_KEYS: (keyof TracePoint)[] = ["time", "s", "x", "y", "vy", "speed", "chakra", "attack", "dash", "slide", "invulnerable", "clones"];

export function eventKey(e: NinjaEvent): string {
  return JSON.stringify(e, Object.keys(e).sort());
}

export function compareRuns(a: RunSummary, b: RunSummary): RunComparison {
  const eventsEqual = a.events.length === b.events.length && a.events.every((e, i) => eventKey(e) === eventKey(b.events[i]!));
  const scriptEqual = encodeActionScript(a.script) === encodeActionScript(b.script);
  let maxTraceDelta = 0;
  const n = Math.min(a.trace.length, b.trace.length);
  for (let i = 0; i < n; i++) {
    for (const k of TRACE_NUMBER_KEYS) {
      const d = Math.abs((a.trace[i]![k] as number) - (b.trace[i]![k] as number));
      if (d > maxTraceDelta) maxTraceDelta = d;
    }
  }
  if (a.trace.length !== b.trace.length) maxTraceDelta = Number.POSITIVE_INFINITY;
  const outcomeEqual = a.outcome === b.outcome && a.steps === b.steps && a.kills === b.kills && a.score === b.score && a.health === b.health;
  return {
    identical: eventsEqual && scriptEqual && outcomeEqual && maxTraceDelta === 0,
    outcomeEqual,
    eventsEqual,
    scriptEqual,
    maxTraceDelta,
    finishDistanceDelta: Math.abs(a.distance - b.distance),
    finishTimeDelta: Math.abs(a.time - b.time)
  };
}

export interface VarianceSummary {
  comparisons: number;
  allIdentical: boolean;
  maxTraceDelta: number;
  maxDistanceDelta: number;
  maxTimeDelta: number;
}

export function summarizeVariance(comparisons: readonly RunComparison[]): VarianceSummary {
  return {
    comparisons: comparisons.length,
    allIdentical: comparisons.every((c) => c.identical),
    maxTraceDelta: comparisons.reduce((m, c) => Math.max(m, c.maxTraceDelta), 0),
    maxDistanceDelta: comparisons.reduce((m, c) => Math.max(m, c.finishDistanceDelta), 0),
    maxTimeDelta: comparisons.reduce((m, c) => Math.max(m, c.finishTimeDelta), 0)
  };
}

export interface NinjaTolerance {
  /** Numeric trace tolerance the port must meet against the reference (metres / seconds / chakra units). */
  numeric: number;
  /** Event step slack (sim steps). Zero when every observed repeat was bit-exact. */
  eventSteps: number;
  derivedFrom: string;
}

/** Floor of 1e-9 so a bit-exact capture still allows for float formatting; otherwise 1.5x the worst observed delta. */
export const NINJA_TOLERANCE_SAFETY = 1.5;
export const NINJA_TOLERANCE_FLOOR = 1e-9;

export function toleranceFrom(variance: VarianceSummary): NinjaTolerance {
  const numeric = Math.max(NINJA_TOLERANCE_FLOOR, variance.maxTraceDelta * NINJA_TOLERANCE_SAFETY);
  return {
    numeric,
    eventSteps: variance.allIdentical ? 0 : 1,
    derivedFrom: variance.allIdentical
      ? `${variance.comparisons} repeats were bit-identical; floor ${NINJA_TOLERANCE_FLOOR}`
      : `${NINJA_TOLERANCE_SAFETY}x worst observed delta over ${variance.comparisons} repeats`
  };
}

// ---- report ------------------------------------------------------------------------------

export interface NinjaReference {
  schema: typeof NINJA_SCHEMA;
  game: "ninja-runner";
  url: string;
  capturedAt: string;
  browser: string;
  step: number;
  setup: { seed: number; courseLength: number; courseDigest: CourseDigest; hooks: string };
  policy: PolicyParams;
  script: string;
  scriptActions: number;
  reference: RunSummary;
  idle: RunSummary;
  restart: NonNullable<NinjaSession["restartCheck"]>;
  qaAutopilotCheck: NonNullable<NinjaSession["qaCheck"]>;
  sessions: {
    session: number;
    outcome: string;
    steps: number;
    courseDigest: string;
    scriptEqualsReference: boolean;
    resultEqualsReference: boolean;
    replayIdentical: boolean;
    idleIdentical: boolean;
  }[];
  variance: { repeat: VarianceSummary };
  tolerance: NinjaTolerance;
}

export function validateReport(report: unknown): string[] {
  const problems: string[] = [];
  const r = report as Partial<NinjaReference> | null;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== NINJA_SCHEMA) problems.push(`schema ${String(r.schema)} != ${NINJA_SCHEMA}`);
  if (!r.reference) problems.push("reference run missing");
  else {
    if (r.reference.steps < 60 * 120) problems.push(`reference ran ${r.reference.steps} steps (< 60 s of sim = 7200)`);
    if (r.reference.kills <= 0) problems.push("reference has no kills (combat not covered)");
    const types = new Set(r.reference.events.map((e) => e.type));
    for (const need of ["start", "jump", "rasengan"]) if (!types.has(need)) problems.push(`reference has no ${need} event`);
  }
  if (!r.idle || r.idle.outcome !== "lost") problems.push("idle run did not end in a loss (fail state not covered)");
  if (!r.restart?.restarted) problems.push("restart not exercised");
  if (!r.sessions || r.sessions.length < 2) problems.push("fewer than 2 independent sessions");
  if (r.script !== undefined) { try { decodeActionScript(r.script); } catch (e) { problems.push(`script does not parse: ${String(e)}`); } }
  return problems;
}

export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\n([\s\S]*?)\n@@CRAYON_CAPTURE_END:\1/g;
  // `az acr run` logs use CRLF line endings.
  for (const m of log.replace(/\r/g, "").matchAll(re)) {
    try { out.push(JSON.parse(m[2]!)); } catch { /* truncated block */ }
  }
  return out;
}

export interface AssembleMeta {
  capturedAt: string;
  runs: string[];
}

/** Builds the reference from raw sessions. The reference is the first session's primary run; every other session is compared to it. */
export function assembleReport(sessions: readonly NinjaSession[], meta: AssembleMeta): NinjaReference {
  const ok = sessions.filter((s) => !s.error && s.primary && s.replay && s.idle && s.courseDigest);
  if (ok.length === 0) throw new Error("no usable sessions");
  const first = ok[0]!;
  const reference = first.primary!;
  const referenceScript = encodeActionScript(reference.script);
  const comparisons: RunComparison[] = [];
  const rows: NinjaReference["sessions"] = ok.map((s) => {
    const cmpPrimary = compareRuns(reference, s.primary!);
    const cmpReplay = compareRuns(s.primary!, s.replay!);
    const cmpIdle = compareRuns(first.idle!, s.idle!);
    if (s !== first) comparisons.push(cmpPrimary);
    comparisons.push(cmpReplay, cmpIdle);
    return {
      session: s.session,
      outcome: s.primary!.outcome,
      steps: s.primary!.steps,
      courseDigest: s.courseDigest!.fnv1a,
      scriptEqualsReference: encodeActionScript(s.primary!.script) === referenceScript,
      resultEqualsReference: cmpPrimary.identical,
      replayIdentical: cmpReplay.identical,
      idleIdentical: cmpIdle.identical
    };
  });
  const repeat = summarizeVariance(comparisons);
  return {
    schema: NINJA_SCHEMA,
    game: "ninja-runner",
    url: first.url,
    capturedAt: meta.capturedAt,
    browser: first.browser,
    step: NINJA_STEP,
    setup: { seed: 17, courseLength: 2640, courseDigest: first.courseDigest!, hooks: "window.__konoha.{start,restart,action,simulate,state}" },
    policy: first.params ?? DEFAULT_POLICY,
    script: referenceScript,
    scriptActions: scriptActionCount(reference.script),
    reference,
    idle: first.idle!,
    restart: first.restartCheck ?? { restarted: false, phaseAfterRestart: "", sAfterRestart: 0, eventsAfterRestart: [] },
    qaAutopilotCheck: first.qaCheck ?? { steps: 0, qa: {}, mine: {}, equal: false },
    sessions: rows,
    variance: { repeat },
    tolerance: toleranceFrom(repeat)
  };
}
