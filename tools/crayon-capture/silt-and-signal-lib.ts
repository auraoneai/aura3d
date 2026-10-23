/**
 * tools/crayon-capture/silt-and-signal-lib — pure logic for the Silt & Signal reference capture (R-20 / R-25).
 *
 * No Playwright, no I/O. The driver (`silt-and-signal.ts`) injects `HOOK_SOURCE` before any game
 * script runs and `pageRunnerSource()` into the game frame; everything here is unit-tested without a browser.
 *
 * The original game exposes `window.silt.inspect()` (state `Z`, flight `rn`, target, objective) and,
 * when its frame's `location.search` has `qa`, `window.silt.qa.{chapter,pose,scene,physicalWorld}`.
 * A srcdoc frame has an empty `location.search`, so the hook patches `URLSearchParams` to add `qa`.
 * Its main loop derives dt from the requestAnimationFrame timestamp (`min(0.05, (t - last) / 1000)`),
 * so replacing rAF/performance.now with a manual clock and pumping one frame per step gives an exact
 * 1/60 s fixed step; randomness is seeded.
 */

export const SILT_CAPTURE_SCHEMA = "a3d-crayon-capture/1";
export const SILT_SIM_STEP = 1 / 60;
export const SILT_FRAME_MS = 1000 / 60;

/** Keyboard-only input: the game reads KeyW/KeyS, KeyA/KeyD, KeyE/KeyQ, KeyB, Shift/Space, KeyF. */
export interface SiltInput {
  throttle: -1 | 0 | 1;
  steer: -1 | 0 | 1;
  lift: -1 | 0 | 1;
  brake: boolean;
  boost: boolean;
  interact: boolean;
}

export const IDLE_SILT_INPUT: SiltInput = { throttle: 0, steer: 0, lift: 0, brake: false, boost: false, interact: false };

export interface SiltPolicyParams {
  /** radians of heading error that triggers a steer key */
  steerDeadband: number;
  /** minimum cruise altitude (world y) */
  cruiseAltitude: number;
  /** metres of altitude error before a lift key is pressed */
  liftBand: number;
  boost: boolean;
  /** on a hold objective's last point, brake once this close (m) so the rider stops inside the radius */
  brakeDistance: number;
  /** press interact only when this close (m) and slower than 4 */
  holdDistance: number;
}

export const DEFAULT_SILT_POLICY: SiltPolicyParams = { steerDeadband: 0.06, cruiseAltitude: 9, liftBand: 1.5, boost: false, brakeDistance: 20, holdDistance: 22 };

export interface SiltPolicyView {
  x: number;
  y: number;
  z: number;
  yaw: number;
  target: { x: number; y: number; z: number };
  kind: string;
  speed: number;
  atLastPoint: boolean;
  /** horizontal distance to the target point */
  distance: number;
}

/**
 * Closed-loop keyboard controller. yaw decreases with steer (`yaw -= turn * ...`), the heading vector is
 * `(-sin yaw, -cos yaw)`, so the yaw that points at (tx, tz) is `atan2(-(tx-x), -(tz-z))`.
 * Self-contained so `Function.prototype.toString()` can inject it into the page.
 */
export function siltPolicy(v: SiltPolicyView, p: SiltPolicyParams): SiltInput {
  const desired = Math.atan2(-(v.target.x - v.x), -(v.target.z - v.z));
  let err = desired - v.yaw;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  const steer = err > p.steerDeadband ? -1 : err < -p.steerDeadband ? 1 : 0;
  const goal = Math.max(v.target.y, p.cruiseAltitude);
  const lift = v.y < goal - p.liftBand ? 1 : v.y > goal + p.liftBand ? -1 : 0;
  const hold = (v.kind === "care" || v.kind === "resonate" || v.kind === "relay" || v.kind === "tow" || v.kind === "portal") && v.atLastPoint;
  const near = hold && v.distance < p.brakeDistance;
  const interact = hold && v.distance < p.holdDistance && Math.abs(v.speed) < 4;
  return { throttle: near ? 0 : 1, steer, lift, brake: near, boost: p.boost && !near, interact };
}

// ---- recorded trace -----------------------------------------------------------------------

/** One recorded step, after the game stepped: [x, y, z, yaw, speed, turn, bank, vertical, energy, objective, point, hold, impacts]. */
export type SiltTraceRow = [number, number, number, number, number, number, number, number, number, number, number, number, number];
export const TRACE_COLUMNS = ["x", "y", "z", "yaw", "speed", "turn", "bank", "vertical", "energy", "objective", "point", "hold", "impacts"] as const;

export interface SiltScriptSegment {
  steps: number;
  input: SiltInput;
}

const sameInput = (a: SiltInput, b: SiltInput): boolean =>
  a.throttle === b.throttle && a.steer === b.steer && a.lift === b.lift && a.brake === b.brake && a.boost === b.boost && a.interact === b.interact;

export function runLengthEncode(inputs: readonly SiltInput[]): SiltScriptSegment[] {
  const out: SiltScriptSegment[] = [];
  for (const input of inputs) {
    const last = out[out.length - 1];
    if (last && sameInput(last.input, input)) last.steps++;
    else out.push({ steps: 1, input: { ...input } });
  }
  return out;
}

export function expandSegments(segments: readonly SiltScriptSegment[]): SiltInput[] {
  const out: SiltInput[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) out.push({ ...seg.input });
  return out;
}

export function keysFor(input: SiltInput): string[] {
  const keys: string[] = [];
  if (input.throttle > 0) keys.push("KeyW");
  else if (input.throttle < 0) keys.push("KeyS");
  if (input.steer > 0) keys.push("KeyD");
  else if (input.steer < 0) keys.push("KeyA");
  if (input.lift > 0) keys.push("KeyE");
  else if (input.lift < 0) keys.push("KeyQ");
  if (input.brake) keys.push("KeyB");
  if (input.boost) keys.push("ShiftLeft");
  if (input.interact) keys.push("KeyF");
  return keys;
}

// ---- comparison and tolerance -------------------------------------------------------------

export interface SiltRunSummary {
  steps: number;
  completed: boolean;
  completedAtStep: number | null;
  finalObjective: number;
  finalPoint: number;
  impacts: number;
  final: SiltTraceRow;
}

export function summarizeTrace(trace: readonly SiltTraceRow[], startObjective: number): SiltRunSummary {
  const final = trace[trace.length - 1] as SiltTraceRow;
  let completedAtStep: number | null = null;
  for (let i = 0; i < trace.length; i++) {
    if ((trace[i] as SiltTraceRow)[9] > startObjective) { completedAtStep = i + 1; break; }
  }
  return {
    steps: trace.length,
    completed: completedAtStep !== null,
    completedAtStep,
    finalObjective: final[9],
    finalPoint: final[10],
    impacts: final[12],
    final
  };
}

/** Largest absolute difference per column over the common prefix, and the first step that differs by more than `tol`. */
export function compareTraces(a: readonly SiltTraceRow[], b: readonly SiltTraceRow[], tol = 1e-6): { maxAbs: number[]; firstDivergence: number | null; lengthMatch: boolean } {
  const n = Math.min(a.length, b.length);
  const maxAbs = new Array(TRACE_COLUMNS.length).fill(0) as number[];
  let firstDivergence: number | null = null;
  for (let i = 0; i < n; i++) {
    const ra = a[i] as SiltTraceRow, rb = b[i] as SiltTraceRow;
    for (let c = 0; c < TRACE_COLUMNS.length; c++) {
      const d = Math.abs((ra[c] as number) - (rb[c] as number));
      if (d > (maxAbs[c] as number)) maxAbs[c] = d;
      if (d > tol && firstDivergence === null) firstDivergence = i;
    }
  }
  return { maxAbs, firstDivergence, lengthMatch: a.length === b.length };
}

export interface SiltTolerance {
  /** metres on x, y, z */
  position: number;
  /** radians on yaw */
  yaw: number;
  /** steps either side of the recorded completion step */
  completionSteps: number;
  basis: string;
}

/** Tolerance from measured session-to-session variance: ten times the worst observed delta, floored at 1e-6 (float32 rounding in the page). */
export function deriveTolerance(deltas: { position: number; yaw: number; completionSteps: number }[]): SiltTolerance {
  const worst = deltas.reduce((m, d) => ({ position: Math.max(m.position, d.position), yaw: Math.max(m.yaw, d.yaw), completionSteps: Math.max(m.completionSteps, d.completionSteps) }), { position: 0, yaw: 0, completionSteps: 0 });
  return {
    position: Math.max(1e-6, worst.position * 10),
    yaw: Math.max(1e-6, worst.yaw * 10),
    completionSteps: Math.max(1, worst.completionSteps),
    basis: `10x the largest observed session-to-session delta over ${deltas.length} comparison(s), floored at 1e-6 m / 1e-6 rad and 1 step`
  };
}

export interface SiltCaptureReport {
  schema: typeof SILT_CAPTURE_SCHEMA;
  game: "silt-and-signal";
  [key: string]: unknown;
}

export function validateReport(report: unknown): string[] {
  const errors: string[] = [];
  const r = report as Record<string, unknown>;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== SILT_CAPTURE_SCHEMA) errors.push(`schema must be ${SILT_CAPTURE_SCHEMA}`);
  if (r.game !== "silt-and-signal") errors.push("game must be silt-and-signal");
  const ref = r.reference as Record<string, unknown> | undefined;
  if (!ref || typeof ref !== "object") errors.push("reference missing");
  else {
    if (!Array.isArray(ref.segments)) errors.push("reference.segments missing");
    if (!Array.isArray(ref.trace) || (ref.trace as unknown[]).length === 0) errors.push("reference.trace missing");
    if (!ref.tolerance) errors.push("reference.tolerance missing");
  }
  return errors;
}

// ---- pre-boot hook ------------------------------------------------------------------------

/**
 * Installed with `context.addInitScript` so it runs before any game script in every frame (including the
 * sandboxed about:srcdoc game frame). It (1) turns on the game's own QA API by adding `qa` to
 * URLSearchParams, (2) seeds Math.random, (3) replaces requestAnimationFrame / performance.now / Date.now
 * with a manual clock. The clock free-runs on a 16 ms interval while the world loads (the game awaits
 * rAF during chapter loads) and is stopped for exact stepping.
 */
export const HOOK_SOURCE = `(function () {
  if (window.__a3dSilt) return;
  // Only the sandboxed game frame gets the manual clock: the outer Crayon app validates sessions against
  // the real clock and does not start the game if it is skewed.
  if (location.href !== "about:srcdoc") return;
  var S = (window.__a3dSilt = { t: 0, queue: [], ids: 0, frame: 0, timer: 0, base: Date.now() });
  var seed = 0x5117;
  Math.random = function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  performance.now = function () { return S.t; };
  Date.now = function () { return S.base + S.t; };
  window.requestAnimationFrame = function (cb) { var id = ++S.ids; S.queue.push([id, cb]); return id; };
  window.cancelAnimationFrame = function (id) { S.queue = S.queue.filter(function (e) { return e[0] !== id; }); };
  S.pump = function () {
    var q = S.queue; S.queue = []; S.t += ${SILT_FRAME_MS}; S.frame++;
    for (var i = 0; i < q.length; i++) { try { q[i][1](S.t); } catch (e) { (S.errors = S.errors || []).push(String(e && e.message || e).slice(0, 200)); } }
  };
  // The simulation does not read pixels back, so while stepping (S.noDraw) every GL draw is a no-op;
  // a software-GL frame otherwise costs hundreds of milliseconds and a run takes tens of minutes.
  S.noDraw = false;
  ["WebGL2RenderingContext", "WebGLRenderingContext"].forEach(function (name) {
    var C = window[name];
    if (!C) return;
    ["drawElements", "drawArrays", "drawElementsInstanced", "drawArraysInstanced", "drawRangeElements", "multiDrawElementsInstancedWEBGL"].forEach(function (fn) {
      var orig = C.prototype[fn];
      if (!orig) return;
      C.prototype[fn] = function () { if (S.noDraw) return; return orig.apply(this, arguments); };
    });
  });
  S.startFree = function () { if (!S.timer) S.timer = setInterval(S.pump, 16); };
  S.stopFree = function () { clearInterval(S.timer); S.timer = 0; };
  var Orig = window.URLSearchParams;
  window.URLSearchParams = class extends Orig {
    constructor(init) { super(init); if (init === "" || init === location.search) { if (!this.has("qa")) this.set("qa", "1"); } }
  };
  S.startFree();
})()`;

/** True once the game frame exposes the inspection and QA APIs. */
export const HAS_SILT_QA = `!!(window.silt && typeof window.silt.inspect === "function" && window.silt.qa && typeof window.silt.qa.chapter === "function")`;

export interface SiltRunPayload {
  mode: "policy" | "script";
  chapter: number;
  objective: number;
  params?: SiltPolicyParams;
  segments?: SiltScriptSegment[];
  maxSteps: number;
  /** also return the collider list and the floor heights at the objective points (once per session) */
  world?: boolean;
}

export interface SiltRunOutput {
  segments: SiltScriptSegment[];
  trace: SiltTraceRow[];
  summary: SiltRunSummary;
  start: { x: number; y: number; z: number; yaw: number; mode: string; time: number; clockMs: number };
  mode: string;
  errors: string[];
  world?: unknown;
}

/**
 * Source of an async expression evaluated inside the game frame. `policySource` is `siltPolicy.toString()`.
 * Returns a JSON string (SiltRunOutput).
 */
export function pageRunnerSource(policySource: string, payload: SiltRunPayload): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var policy = (${policySource});
  var S = window.__a3dSilt, silt = window.silt;
  var down = {};
  function setKey(code, on) {
    if (!!down[code] === on) return;
    down[code] = on;
    window.dispatchEvent(new KeyboardEvent(on ? "keydown" : "keyup", { code: code, key: code, bubbles: true, cancelable: true }));
  }
  function applyInput(inp) {
    var want = {};
    if (inp.throttle > 0) want.KeyW = 1; else if (inp.throttle < 0) want.KeyS = 1;
    if (inp.steer > 0) want.KeyD = 1; else if (inp.steer < 0) want.KeyA = 1;
    if (inp.lift > 0) want.KeyE = 1; else if (inp.lift < 0) want.KeyQ = 1;
    if (inp.brake) want.KeyB = 1;
    if (inp.boost) want.ShiftLeft = 1;
    if (inp.interact) want.KeyF = 1;
    ["KeyW","KeyS","KeyD","KeyA","KeyE","KeyQ","KeyB","ShiftLeft","KeyF"].forEach(function (k) { setKey(k, !!want[k]); });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var errors = [];
  // free-run while the chapter loads (the game awaits rAF), then freeze
  S.startFree();
  await silt.qa.chapter(P.chapter, P.objective);
  for (var w = 0; w < 120; w++) { await sleep(20); var m0 = silt.inspect().mode; if (m0 === "play") break; }
  await sleep(300);
  S.stopFree();
  S.noDraw = true;
  // The game keeps its flight state (rn) across chapter jumps: reset yaw/hold and let the bike come to rest
  // with idle input (speed decays by exp(-1.9 t); 600 steps leave < 1e-8) so every run starts from the same state.
  await sleep(50);
  applyInput({ throttle: 0, steer: 0, lift: 0, brake: false, boost: false, interact: false });
  silt.qa.pose({ yaw: 0, hold: 0 });
  for (var s0 = 0; s0 < 600; s0++) S.pump();
  var snap = silt.inspect();
  if (snap.mode !== "play") errors.push("mode is " + snap.mode + " after chapter jump");
  var out = { segments: [], trace: [], mode: snap.mode, errors: errors };
  out.start = { x: snap.state.x, y: snap.state.y, z: snap.state.z, yaw: snap.state.yaw, mode: snap.mode, time: snap.time, clockMs: S.t };
  if (P.world) {
    var pw = silt.qa.physicalWorld();
    out.world = { colliders: pw.colliders, targets: pw.targets, neriWorld: pw.neriWorld };
  }
  var script = P.mode === "script" ? [] : null;
  if (script) for (var si = 0; si < P.segments.length; si++) for (var k = 0; k < P.segments[si].steps; k++) script.push(P.segments[si].input);
  var inputs = [];
  var done = false;
  var cur = snap;
  for (var step = 0; step < P.maxSteps && !done; step++) {
    var inp;
    if (script) { if (step >= script.length) break; inp = script[step]; }
    else {
      var Z = cur.state, tg = cur.target;
      var last = Z.point === cur.objective.points.length - 1;
      inp = policy({ x: Z.x, y: Z.y, z: Z.z, yaw: Z.yaw, target: tg, kind: cur.objective.kind, speed: cur.flight.speed, atLastPoint: last, distance: Math.hypot(tg.x - Z.x, tg.z - Z.z) }, P.params);
    }
    inputs.push(inp);
    applyInput(inp);
    S.pump();
    var a = silt.inspect(), Zs = a.state, f = a.flight;
    cur = a;
    out.trace.push([Zs.x, Zs.y, Zs.z, Zs.yaw, f.speed, f.turn, f.bank, f.vertical, f.energy, Zs.objective, Zs.point, Zs.hold || 0, f.impacts || 0]);
    if (Zs.chapter !== P.chapter || Zs.objective > P.objective || Zs.scene) { if (!script) done = true; }
    if (S.errors && S.errors.length) { errors = errors.concat(S.errors.splice(0)); }
  }
  applyInput({ throttle: 0, steer: 0, lift: 0, brake: false, boost: false, interact: false });
  out.mode = silt.inspect().mode;
  out.segments = [];
  var segs = [];
  for (var i = 0; i < inputs.length; i++) {
    var inpt = inputs[i], lastSeg = segs[segs.length - 1];
    var same = lastSeg && lastSeg.input.throttle === inpt.throttle && lastSeg.input.steer === inpt.steer && lastSeg.input.lift === inpt.lift && lastSeg.input.brake === inpt.brake && lastSeg.input.boost === inpt.boost && lastSeg.input.interact === inpt.interact;
    if (same) lastSeg.steps++; else segs.push({ steps: 1, input: { throttle: inpt.throttle, steer: inpt.steer, lift: inpt.lift, brake: !!inpt.brake, boost: !!inpt.boost, interact: !!inpt.interact } });
  }
  out.segments = segs;
  out.errors = errors;
  return JSON.stringify(out);
})()`;
}
