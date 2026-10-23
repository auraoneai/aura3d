/**
 * tools/crayon-capture/splat-rush-lib: pure logic for the Splat Rush reference capture (R-20 / R-25).
 *
 * No Playwright, no I/O. The runner (`splat-rush.ts`) injects `VT_HOOK_SOURCE` before any game script
 * runs in the sandboxed `about:srcdoc` frame and then drives the original game one virtual 1/60 s step
 * at a time. Everything here (PRNG, virtual clock, input script text, steering policy, trace comparison,
 * tolerance and report validation) is unit-tested without a browser.
 *
 * Determinism model (see evidence/crayon-capture/README.md):
 * - `performance.now` is virtual: `1000 + n * (1000 / 60)` after n steps. three's `Clock` is the only
 *   consumer that affects state, so dt = `(now_n - now_(n-1)) / 1000` and the very first `getDelta()`
 *   (called synchronously at module eval) returns 0.
 * - `requestAnimationFrame` is virtual: callbacks run only when the harness steps.
 * - `Math.random` is two seeded mulberry32 streams chosen by the caller's stack frame: draws made from the
 *   game's own `blob:null/` module use the GAME stream (gate colours, power-up type and lane, particles,
 *   camera shake, clouds, canvas textures), everything else (three.js draws 4 numbers per object UUID) uses a
 *   separate LIB stream. The port consumes the game stream in the same order; the lib stream is not modelled.
 * - `AudioContext` is removed: the original builds a 0.4 s noise buffer from `Math.random` on the first
 *   noise sound effect, a draw count that depends on the audio sample rate.
 */

export const SPLAT_RUSH_CAPTURE_SCHEMA = "a3d-crayon-capture/1";
export const STEP_MS = 1000 / 60;
export const BASE_MS = 1000;
export const STEER_GAIN = 0.012 * (10 / 6);
export const LANE_HALF_WIDTH = 3;
export const POINTER_START_X = 240;

export const PHASES = ["splash", "playing", "bursting", "gameOver"] as const;
export type SplatPhase = (typeof PHASES)[number];

/** Virtual `performance.now()` after `n` harness steps. */
export function virtualNow(n: number): number {
  return BASE_MS + n * STEP_MS;
}

/** mulberry32, identical to the in-page hook and to `examples/splat-rush-port/rng.ts`. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- per-step input ---------------------------------------------------------- */

export interface StepInput {
  /** pointerdown while the splash screen is up (starts the run). */
  start: boolean;
  /** pointerdown during play (begins a drag). */
  down: boolean;
  /** pointerup. */
  up: boolean;
  /** pointermove delta in CSS pixels (0 = no event). */
  dx: number;
}

export interface ScriptSegment {
  steps: number;
  input: StepInput;
}

export const IDLE_INPUT: StepInput = { start: false, down: false, up: false, dx: 0 };

const hasFlags = (i: StepInput): boolean => i.start || i.down || i.up;
const sameInput = (a: StepInput, b: StepInput): boolean => a.start === b.start && a.down === b.down && a.up === b.up && a.dx === b.dx;

export function runLengthEncode(inputs: readonly StepInput[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const input of inputs) {
    const last = out[out.length - 1];
    if (last && !hasFlags(input) && sameInput(last.input, input)) last.steps++;
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
      const flags = `${seg.input.start ? "S" : ""}${seg.input.down ? "D" : ""}${seg.input.up ? "U" : ""}`;
      return `${seg.steps}x${flags || "-"} dx=${seg.input.dx}`;
    })
    .join("\n");
}

export function parseInputScript(text: string): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  const lines = text.split("\n");
  for (let n = 0; n < lines.length; n++) {
    const line = (lines[n] as string).replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([SDU]*|-)\s+dx=(-?\d+)$/.exec(line);
    if (!m) throw new Error(`splat-rush script line ${n + 1}: cannot parse "${line}"`);
    const steps = Number(m[1]);
    if (!(steps >= 1)) throw new Error(`splat-rush script line ${n + 1}: step count must be >= 1`);
    const flags = m[2] === "-" ? "" : (m[2] as string);
    out.push({
      steps,
      input: { start: flags.includes("S"), down: flags.includes("D"), up: flags.includes("U"), dx: Number(m[3]) }
    });
  }
  return out;
}

/* ---- steering policy ---------------------------------------------------------- */

export interface GateView {
  z: number;
  laneX: number;
  colorIndex: number;
  passed: boolean;
}

export interface PolicyView {
  phase: SplatPhase;
  playerColorIndex: number;
  rainbow: boolean;
  laneOffset: number;
  /** replica of the game's private steering target `ye`. */
  ye: number;
  gates: readonly GateView[];
  /** rows (gate groups) already passed this run. */
  rowsPassed: number;
}

export interface PolicyParams {
  /** largest |dx| per step, in pixels. */
  maxDx: number;
  /** deliberately steer to a non-matching lane on these zero-based gate rows (exercises life loss). */
  mistakeRows: readonly number[];
  /** aim this far (lane units) off the gate centre; 0 aims at the centre (perfect window). */
  aimOffset: number;
}

export const DEFAULT_POLICY_PARAMS: PolicyParams = { maxDx: 14, mistakeRows: [], aimOffset: 0 };

/**
 * Closed-loop controller: drag toward the lane whose gate matches the ball colour on the next unpassed
 * gate row, or toward a wrong lane on `mistakeRows`. Self-contained (no outer references) so
 * `Function.prototype.toString()` can inject it into the page.
 */
export function steerPolicy(view: PolicyView, params: PolicyParams): number {
  if (view.phase !== "playing") return 0;
  let row: GateView[] = [];
  let bestZ = -Infinity;
  for (const g of view.gates) {
    if (g.passed || g.z > 1) continue;
    if (g.z > bestZ + 1e-6) {
      bestZ = g.z;
      row = [g];
    } else if (Math.abs(g.z - bestZ) <= 1e-6) row.push(g);
  }
  if (row.length === 0) return 0;
  let target = view.ye;
  const matching = row.find((g) => g.colorIndex === view.playerColorIndex);
  const wrong = row.find((g) => g.colorIndex !== view.playerColorIndex);
  if (params.mistakeRows.indexOf(view.rowsPassed) >= 0 && wrong && !view.rainbow) target = wrong.laneX;
  else if (view.rainbow) {
    let best = row[0] as GateView;
    for (const g of row) if (Math.abs(g.laneX - view.laneOffset) < Math.abs(best.laneX - view.laneOffset)) best = g;
    target = best.laneX;
  } else if (matching) target = matching.laneX + params.aimOffset;
  const gain = 0.012 * (10 / 6);
  const want = (target - view.ye) / gain;
  const dx = Math.round(Math.max(-params.maxDx, Math.min(params.maxDx, want)));
  return dx;
}

/** Replica of the game's pointermove handler: `ye += 0.012 * dx * (STEER_SPEED / 6)`, clamped. */
export function applySteer(ye: number, dx: number): number {
  const next = ye + 0.012 * dx * (10 / 6);
  return Math.max(-LANE_HALF_WIDTH, Math.min(LANE_HALF_WIDTH, next));
}

/* ---- trace ------------------------------------------------------------------- */

/** Column order of every trace row (`reference.trace`). Row 0 is the state right after the start click. */
export const TRACE_FIELDS = [
  "n",
  "score",
  "distance",
  "speed",
  "lives",
  "combo",
  "multiplier",
  "laneOffset",
  "playerColorIndex",
  "ballScale",
  "rainbowTimer",
  "shieldActive",
  "scoreX2Timer",
  "phase",
  "squashT",
  "shakeTimer",
  "milestone",
  "rngCount",
  "px",
  "py",
  "pz",
  "camx",
  "camy",
  "camz",
  "gates",
  "powerups",
  "splatters",
  "segments"
] as const;
export type TraceRow = number[];

export interface TraceDelta {
  /** largest absolute difference per field name. */
  maxAbs: Record<string, number>;
  /** first step at which any field differs, or -1 if the traces are bit-identical. */
  firstDivergence: number;
  exact: boolean;
  comparedRows: number;
}

export function compareTraces(a: readonly TraceRow[], b: readonly TraceRow[]): TraceDelta {
  const rows = Math.min(a.length, b.length);
  const maxAbs: Record<string, number> = {};
  for (const f of TRACE_FIELDS) maxAbs[f] = 0;
  let first = -1;
  for (let i = 0; i < rows; i++) {
    const ra = a[i] as TraceRow;
    const rb = b[i] as TraceRow;
    for (let c = 0; c < TRACE_FIELDS.length; c++) {
      const d = Math.abs((ra[c] as number) - (rb[c] as number));
      const name = TRACE_FIELDS[c] as string;
      if (d > (maxAbs[name] as number)) maxAbs[name] = d;
      if (d > 0 && first < 0) first = i;
    }
  }
  if (a.length !== b.length && first < 0) first = rows;
  return { maxAbs, firstDivergence: first, exact: first < 0, comparedRows: rows };
}

/** `1.5 x` the largest observed numeric delta (0 when every comparison is bit-identical). */
export function deriveTolerance(deltas: readonly TraceDelta[]): number {
  let worst = 0;
  for (const d of deltas) for (const f of TRACE_FIELDS) worst = Math.max(worst, d.maxAbs[f] ?? 0);
  return worst === 0 ? 0 : worst * 1.5;
}

/* ---- events derived from a trace ----------------------------------------------- */

export interface TraceEvent {
  /** trace row index (script step) at which the event is first visible. */
  n: number;
  kind: "start" | "gate-match" | "hit" | "shield-block" | "pickup-rainbow" | "pickup-shield" | "pickup-x2" | "colour-switch" | "milestone" | "burst" | "game-over";
  detail?: number;
}

const COL = (name: (typeof TRACE_FIELDS)[number]): number => TRACE_FIELDS.indexOf(name);

/** Events inferred from consecutive trace rows (no instrumentation of the game is needed). */
export function deriveEvents(trace: readonly TraceRow[]): TraceEvent[] {
  const out: TraceEvent[] = [];
  const get = (r: TraceRow, name: (typeof TRACE_FIELDS)[number]): number => r[COL(name)] as number;
  for (let i = 1; i < trace.length; i++) {
    const a = trace[i - 1] as TraceRow;
    const b = trace[i] as TraceRow;
    if (get(a, "phase") === 0 && get(b, "phase") === 1) out.push({ n: i, kind: "start" });
    if (get(b, "combo") > get(a, "combo")) out.push({ n: i, kind: "gate-match", detail: get(b, "combo") });
    if (get(b, "lives") < get(a, "lives")) out.push({ n: i, kind: "hit", detail: get(b, "lives") });
    if (get(a, "shieldActive") === 1 && get(b, "shieldActive") === 0 && get(b, "lives") === get(a, "lives")) out.push({ n: i, kind: "shield-block" });
    if (get(b, "rainbowTimer") > get(a, "rainbowTimer") + 1) out.push({ n: i, kind: "pickup-rainbow" });
    if (get(a, "shieldActive") === 0 && get(b, "shieldActive") === 1) out.push({ n: i, kind: "pickup-shield" });
    if (get(b, "scoreX2Timer") > get(a, "scoreX2Timer") + 1) out.push({ n: i, kind: "pickup-x2" });
    if (get(b, "playerColorIndex") !== get(a, "playerColorIndex")) out.push({ n: i, kind: "colour-switch", detail: get(b, "playerColorIndex") });
    if (get(b, "milestone") > get(a, "milestone")) out.push({ n: i, kind: "milestone", detail: get(b, "milestone") });
    if (get(a, "phase") === 1 && get(b, "phase") === 2) out.push({ n: i, kind: "burst" });
    if (get(a, "phase") === 2 && get(b, "phase") === 3) out.push({ n: i, kind: "game-over" });
  }
  return out;
}

/* ---- virtual-time hook (injected before any game script) ----------------------- */

/** Replaced by `vtHookSource(seed)`. Written as plain ES5 so it can be evaluated in any frame. */
const VT_HOOK_TEMPLATE = `(function (SEED, BASE, STEP) {
  if (window.__a3dVt) return;
  if (location.protocol !== "about:") return;
  var n = 0;
  var nowFn = function () { return BASE + n * STEP; };
  try { performance.now = nowFn; } catch (e) {}
  // Two seeded streams. three.js draws 4 numbers per object UUID (every mesh, material, texture and lazily
  // created render internal), so a single stream would be perturbed by library internals the port cannot
  // model. A draw whose caller frame is the game's own blob module uses the GAME stream; every other
  // caller (three, the boot runtime) uses the LIB stream. Only the game stream is part of the contract.
  var ga = SEED >>> 0, gcount = 0, la = (SEED ^ 0x9E3779B9) >>> 0, lcount = 0;
  function next(s) {
    s = (s + 0x6D2B79F5) >>> 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [s, ((t ^ (t >>> 14)) >>> 0) / 4294967296];
  }
  Math.random = function () {
    var old = Error.stackTraceLimit;
    Error.stackTraceLimit = 3;
    var line = "";
    try { line = String(new Error().stack).split("\\n")[2] || ""; } catch (e) {}
    Error.stackTraceLimit = old;
    var r;
    if (line.indexOf("blob:null/") >= 0) { gcount++; r = next(ga); ga = r[0]; } else { lcount++; r = next(la); la = r[0]; }
    return r[1];
  };
  var queue = [], nextId = 1;
  window.requestAnimationFrame = function (cb) { var id = nextId++; queue.push([id, cb]); return id; };
  window.cancelAnimationFrame = function (id) {
    for (var i = 0; i < queue.length; i++) if (queue[i][0] === id) { queue.splice(i, 1); return; }
  };
  window.AudioContext = undefined;
  window.webkitAudioContext = undefined;
  var K = -1, gs;
  try {
    Object.defineProperty(window, "__getGameState", {
      configurable: true,
      get: function () { return gs; },
      set: function (v) { if (K < 0) K = gcount; gs = v; }
    });
  } catch (e) {}
  window.__a3dVt = {
    step: function () {
      n++;
      var q = queue; queue = [];
      var t = nowFn();
      for (var i = 0; i < q.length; i++) { try { q[i][1](t); } catch (err) { (window.__a3dVtErrors = window.__a3dVtErrors || []).push(String(err && err.stack || err).slice(0, 400)); } }
      return n;
    },
    n: function () { return n; },
    rngCount: function () { return gcount; },
    libDraws: function () { return lcount; },
    preGameDraws: function () { return K; },
    queued: function () { return queue.length; }
  };
})`;

export function vtHookSource(seed: number): string {
  return `${VT_HOOK_TEMPLATE}(${seed >>> 0}, ${BASE_MS}, ${STEP_MS});`;
}

/* ---- report ------------------------------------------------------------------- */

export interface SessionReport {
  id: string;
  kind: "input" | "replay" | "idle";
  ok: boolean;
  error?: string;
  trace: TraceRow[];
  preGameDraws: number;
  readyFrame: number;
  scriptRepr: string;
  endPhase: SplatPhase;
  endScore: number;
  endDistance: number;
  endLives: number;
}

export interface CaptureReport {
  schema: string;
  game: "splat-rush";
  capturedAt: string;
  url: string;
  setup: Record<string, unknown>;
  script: string;
  traceFields: readonly string[];
  reference: { trace: TraceRow[]; events: Record<string, unknown>[]; gates: unknown[]; hud: Record<string, unknown>[] };
  sessions: Record<string, unknown>[];
  variance: Record<string, unknown>;
  tolerance: number;
  limitations: string[];
}

/** Throws unless the report is a finished, repeatable reference. */
export function validateReport(report: CaptureReport): void {
  const problems: string[] = [];
  if (report.schema !== SPLAT_RUSH_CAPTURE_SCHEMA) problems.push("bad schema");
  if (report.game !== "splat-rush") problems.push("bad game");
  const trace = report.reference?.trace ?? [];
  if (trace.length < 60) problems.push(`trace too short (${trace.length})`);
  if (trace.some((r) => r.length !== TRACE_FIELDS.length)) problems.push("trace row width mismatch");
  try {
    if (parseInputScript(report.script).length === 0) problems.push("empty script");
  } catch (e) {
    problems.push(`unparseable script: ${(e as Error).message}`);
  }
  const independent = (report.sessions ?? []).filter((s) => s.ok === true);
  if (independent.length < 2) problems.push(`needs >= 2 independent sessions, has ${independent.length}`);
  if (typeof report.tolerance !== "number" || !(report.tolerance >= 0)) problems.push("tolerance missing");
  const last = trace[trace.length - 1];
  if (last && last[TRACE_FIELDS.indexOf("score")] === 0) problems.push("score never moved");
  if (problems.length) throw new Error(`splat-rush report invalid: ${problems.join("; ")}`);
}
