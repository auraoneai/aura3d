/**
 * tools/crayon-capture/heatsink-lib — pure helpers for the HEATSINK fixed-input reference (Phase B, R-20).
 * REMOTE RUN ONLY: the page-side runner is evaluated inside the sandboxed game frame on a serverless ACR
 * Task (recipe in evidence/crayon-capture/README.md). Nothing here executes captured game code.
 *
 * Determinism comes from the game's own exposed hooks, not from virtualising the browser:
 *   - `window.game` (the game object) is stepped by calling `game.frame(1/60)` directly, with the real rAF loop
 *     frozen by the pre-boot hook, so every simulation tick has dt = 1/60 exactly;
 *   - `window.__force` is merged into the player's input every `step()`, so inputs are exact (no key-repeat or
 *     smoothing noise);
 *   - Time Trial mode has no rival drones and no item boxes, so the player depends only on the seeded track;
 *   - `game.render` is replaced by a no-op while stepping (HUD DOM is refreshed by calling the original on demand).
 */

export const HEATSINK_SCHEMA = "a3d-crayon-capture/1";
export const HEATSINK_STEP = 1 / 60;
export const STEER_QUANTUM = 1 / 20;

export interface HsInput {
  throttle: number;
  brake: number;
  steer: number;
  afterburner: boolean;
  ramjet: boolean;
  drift: boolean;
  fire: boolean;
}

export const IDLE_INPUT: HsInput = { throttle: 0, brake: 0, steer: 0, afterburner: false, ramjet: false, drift: false, fire: false };

export interface ScriptSegment {
  n: number;
  input: HsInput;
}

export interface PolicyParams {
  /** lateral gain: desired heading = (target - x) * lateralGain */
  lateralGain: number;
  /** heading gain: steer = (desiredHeading - theta) * headingGain */
  headingGain: number;
  /** curvature-ahead scale for the lane target */
  curveScale: number;
  /** boost whenever the boost meter is above this and the road ahead is straight */
  boostAbove: number;
  /** overdrive window in race seconds [from, to) (heat rises, burning at 0.8) */
  overdriveFrom: number;
  overdriveTo: number;
  /** brake window in race seconds [from, to) used to exercise the brake path */
  brakeFrom: number;
  brakeTo: number;
}

export const DEFAULT_POLICY: PolicyParams = {
  lateralGain: 0.03,
  headingGain: 4,
  curveScale: 260,
  boostAbove: 0.3,
  overdriveFrom: 14,
  overdriveTo: 17,
  brakeFrom: 30,
  brakeTo: 31.5
};

export function quantizeSteer(x: number): number {
  const c = Math.max(-1, Math.min(1, x));
  return Math.round(c / STEER_QUANTUM) * STEER_QUANTUM;
}

const sameInput = (a: HsInput, b: HsInput): boolean =>
  a.throttle === b.throttle && a.brake === b.brake && a.steer === b.steer && a.afterburner === b.afterburner && a.ramjet === b.ramjet && a.drift === b.drift && a.fire === b.fire;

export function runLengthEncode(inputs: readonly HsInput[]): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const input of inputs) {
    const last = out[out.length - 1];
    if (last && sameInput(last.input, input)) last.n += 1;
    else out.push({ n: 1, input: { ...input } });
  }
  return out;
}

export function expandSegments(segments: readonly ScriptSegment[]): HsInput[] {
  const out: HsInput[] = [];
  for (const s of segments) for (let i = 0; i < s.n; i++) out.push({ ...s.input });
  return out;
}

export const totalSteps = (segments: readonly ScriptSegment[]): number => segments.reduce((n, s) => n + s.n, 0);

/** Compact text: `<n>x t<throttle> b<brake> s<steer*20> [A][R][D][F]`, one segment per line. */
export function encodeInputScript(segments: readonly ScriptSegment[]): string {
  return segments
    .map((s) => {
      const i = s.input;
      const flags = `${i.afterburner ? "A" : ""}${i.ramjet ? "R" : ""}${i.drift ? "D" : ""}${i.fire ? "F" : ""}` || "-";
      return `${s.n}x t${i.throttle} b${i.brake} s${Math.round(i.steer / STEER_QUANTUM)} ${flags}`;
    })
    .join("\n");
}

export function parseInputScript(text: string): ScriptSegment[] {
  const out: ScriptSegment[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = /^(\d+)x t(-?[\d.]+) b(-?[\d.]+) s(-?\d+) (-|[ARDF]+)$/.exec(line);
    if (!m) throw new Error(`bad script line: ${line}`);
    const flags = m[5] as string;
    out.push({
      n: Number(m[1]),
      input: {
        throttle: Number(m[2]),
        brake: Number(m[3]),
        steer: Number(m[4]) * STEER_QUANTUM,
        afterburner: flags.includes("A"),
        ramjet: flags.includes("R"),
        drift: flags.includes("D"),
        fire: flags.includes("F")
      }
    });
  }
  return out;
}

/**
 * Pre-boot hook, installed with `context.addInitScript` so it runs before any game script in every frame.
 * In the game frame it picks the map (the game reads `window.name`), exposes a seedable `Math.random`, and
 * lets the harness freeze the real requestAnimationFrame loop.
 */
export function hookSource(map: string): string {
  return `(function () {
  if (window.__a3dHs) return;
  var isGame = location.href === "about:srcdoc";
  var state = (window.__a3dHs = { freeze: false, held: [], dropped: 0 });
  if (isGame) {
    try { if (!String(window.name).startsWith("heatsink:")) window.name = "heatsink:" + JSON.stringify({ map: ${JSON.stringify(map)}, ev: null }); } catch (e) {}
    window.__a3dSeed = function (seed) {
      var a = seed >>> 0;
      Math.random = function () {
        a = (a + 0x6d2b79f5) | 0;
        var t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    var realRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function (cb) {
      if (state.freeze) { state.held.push(cb); state.dropped++; return 0; }
      return realRaf(cb);
    };
  }
})();`;
}

export interface RunPayload {
  mode: "policy" | "script";
  map: string;
  maxSteps: number;
  snapEvery: number;
  hudEvery: number;
  seed: number;
  params?: PolicyParams;
  segments?: ScriptSegment[];
  /** stop when the player has completed this many laps (0 = never) */
  stopAfterLaps?: number;
}

export interface PlayerSnapshot {
  s: number;
  x: number;
  dist: number;
  v: number;
  ab: number;
  heat: number;
  shield: number;
  gunHeat: number;
  theta: number;
  phi: number;
  yW: number;
  vyW: number;
  steerVal: number;
  crashed: boolean;
  crashes: number;
  airborne: boolean;
  burning: number;
  invuln: number;
  onLava: boolean;
  abActive: boolean;
  rjActive: boolean;
  drifting: boolean;
  burstT: number;
  landT: number;
  crashT: number;
}

export interface GameSnapshot {
  state: string;
  raceTime: number;
  countdown: number;
  lapIdx: number;
  lapStart: number;
  bestLap: number;
}

export interface Snapshot {
  step: number;
  game: GameSnapshot;
  player: PlayerSnapshot;
  hud?: Record<string, string>;
}

export interface TrackFingerprint {
  length: number;
  n: number;
  step: number;
  map: string;
  samples: { s: number; x: number; y: number; z: number; tx: number; tz: number; hw: number; kappa: number; psi: number; sec: string }[];
  obstacles: { count: number; first: { s: number; x: number; hx: number; hs: number; h: number; kind?: string }[] };
  lavaPools: { count: number };
  boostPads: { s: number; x: number }[];
  pickups: { s: number; x: number; kind: string }[];
  barrels: { s: number; x: number }[];
  checkpoints: number[];
  sections: { start: number; end: number; type: string }[];
}

export interface RunResult {
  mode: "policy" | "script";
  steps: number;
  outcome: "finished" | "max-steps" | "error";
  error?: string;
  snapshots: Snapshot[];
  events: { step: number; type: string; detail?: unknown }[];
  wallMs: number;
}

export interface RunOutput {
  result: RunResult;
  segments: ScriptSegment[];
  track: TrackFingerprint;
  hudIds: string[];
}

/** Page-side runner. Evaluated inside the game frame; returns JSON text. */
export function pageRunnerSource(payload: RunPayload): string {
  return `(async function () {
  var P = ${JSON.stringify(payload)};
  var DT = ${HEATSINK_STEP};
  var STEER_Q = ${STEER_QUANTUM};
  var game = window.game;
  var HUD_IDS = ["h-pos", "h-posof", "h-lap", "h-time", "h-best", "h-speed", "h-ab-p", "h-heat-p", "h-shield-p", "h-gun-p", "h-td"];
  var t0 = Date.now();
  var events = [], snapshots = [], inputs = [];
  var out = { result: null, segments: [], track: null, hudIds: HUD_IDS };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function q(x) { return Math.round(clamp(x, -1, 1) / STEER_Q) * STEER_Q; }
  function fingerprint() {
    var tr = game.track, f = {}, samples = [], N = 48;
    for (var i = 0; i < N; i++) {
      var s = (i / N) * tr.length; var fr = tr.frame(s, f);
      samples.push({ s: s, x: fr.x, y: fr.y, z: fr.z, tx: fr.tx, tz: fr.tz, hw: fr.hw, kappa: fr.kappa, psi: fr.psi, sec: String((fr.sec && (fr.sec.key || fr.sec.name)) || "") });
    }
    var obs = tr.obstacles || [];
    return {
      length: tr.length, n: tr.n, step: tr.step, map: P.map, samples: samples,
      obstacles: { count: obs.length, first: obs.slice(0, 40).map(function (o) { return { s: o.s, x: o.x, hx: o.hx, hs: o.hs, h: o.h, kind: o.kind }; }) },
      lavaPools: { count: (tr.lavaPools || []).length },
      boostPads: (tr.boostPads || []).map(function (p) { return { s: p.s, x: p.x }; }),
      pickups: (tr.pickups || []).map(function (p) { return { s: p.s, x: p.x, kind: p.kind }; }),
      barrels: (tr.barrels || []).map(function (b) { return { s: b.s, x: b.x }; }),
      checkpoints: (tr.checkpoints || []).slice(0, 60),
      sections: (tr.sections || []).map(function (s) { return { start: s.start, end: s.end, type: String((s.type && (s.type.key || s.type.name)) || "") }; })
    };
  }
  function snap(step, withHud) {
    var p = game.player;
    var sn = {
      step: step,
      game: { state: game.state, raceTime: game.raceTime, countdown: game.countdown, lapIdx: game.lapIdx, lapStart: game.lapStart, bestLap: game.bestLap },
      player: {
        s: p.s, x: p.x, dist: p.dist, v: p.v, ab: p.ab, heat: p.heat, shield: p.shield, gunHeat: p.gunHeat, theta: p.theta, phi: p.phi,
        yW: p.yW, vyW: p.vyW, steerVal: p.steerVal, crashed: !!p.crashed, crashes: p.crashes, airborne: !!p.airborne, burning: p.burning, invuln: p.invuln,
        onLava: !!p.onLava, abActive: !!p.abActive, rjActive: !!p.rjActive, drifting: !!p.drifting, burstT: p.burstT, landT: p.landT, crashT: p.crashT
      }
    };
    if (withHud) {
      try {
        origRender.call(game, DT, DT);
        var hud = {};
        for (var i = 0; i < HUD_IDS.length; i++) { var el = document.getElementById(HUD_IDS[i]); hud[HUD_IDS[i]] = el ? (el.textContent || "").trim() : ""; }
        sn.hud = hud;
      } catch (e) { sn.hud = { error: String(e).slice(0, 160) }; }
    }
    return sn;
  }
  function policy(p, step) {
    var pr = P.params, tr = game.track, f = {};
    var fr = tr.frame(p.s, f);
    var a = tr.curvAhead(p.s + 20, 160);
    var u = fr.hw - 3.5;
    var target = Math.sign(a) * Math.min(1, Math.abs(a) * pr.curveScale) * 0.6 * u;
    var obs = tr.obstacles || [], best = null;
    for (var i = 0; i < obs.length; i++) {
      var d = tr.wrapDelta(obs[i].s, p.s);
      if (d > -obs[i].hs - 6 && d < 70 + p.v * 0.8 && (best === null || d < best.d)) best = { o: obs[i], d: d };
    }
    if (best) {
      var o = best.o, pad = o.hx + 5.5;
      var left = o.x - pad, right = o.x + pad;
      var cand = Math.abs(target - left) < Math.abs(target - right) ? left : right;
      if (cand < -u || cand > u) cand = cand < 0 ? right : left;
      if (Math.abs(target - o.x) < pad) target = clamp(cand, -u, u);
    }
    var sps = tr.splits || [];
    for (var k = 0; k < sps.length; k++) {
      var rel = tr.wrapDelta(p.s, sps[k].s0);
      if (rel > -220 && rel < sps[k].len + 80) { target = (k % 2 === 0 ? 1 : -1) * (sps[k].dw + 9); }
    }
    var desired = clamp((target - p.x) * pr.lateralGain, -0.3, 0.3);
    var steer = q((desired - p.theta) * pr.headingGain);
    var rt = game.raceTime;
    var raceOn = game.state === "race";
    return {
      throttle: 1,
      brake: raceOn && rt >= pr.brakeFrom && rt < pr.brakeTo ? 1 : 0,
      steer: steer,
      afterburner: raceOn && p.ab > pr.boostAbove && Math.abs(a) < 0.0015 && !(rt >= pr.brakeFrom && rt < pr.brakeTo),
      ramjet: raceOn && rt >= pr.overdriveFrom && rt < pr.overdriveTo,
      drift: false,
      fire: false
    };
  }
  var origRender = game.render;
  try {
    out.track = fingerprint();
    game.render = function () {};
    window.__a3dSeed(P.seed);
    game.mode = "trial";
    await window.__heatsinkSwitch(P.map);
    game.mode = "trial";
    game.setEvent(game.event);
    game.paused = false;
    try { game.ui.close(); } catch (e) {}
    // startRace()/resetRace() do not reset these, so reset them for run-to-run exactness (pickups/barrels keep
    // respawn timers; ckPrevS drives checkpoint crossing; time drives the hover bob that barrel distance uses).
    var pk = game.pickupObjs || [], bl = game.barrelObjs || [];
    for (var pi = 0; pi < pk.length; pi++) { pk[pi].respawn = 0; try { pk[pi].obj.visible = true; } catch (e) {} }
    for (var bi = 0; bi < bl.length; bi++) { bl[bi].alive = true; bl[bi].respawn = 0; try { bl[bi].obj.visible = true; } catch (e) {} }
    game.time = 0; game.timeScale = 1; game.slowT = 0; game.resultsT = 0; game.paused = false;
    game.player.ckPrevS = undefined; game.player.nearCd = 0; game.player.nearO = null; game.player.lane = 0; game.player.turboT = 0;
    game.startRace();
    events.push({ step: 0, type: "startRace", detail: { state: game.state, laps: game.laps, ais: (game.ais || []).length, mode: game.mode } });
    var script = P.mode === "script" ? expandScript(P.segments) : null;
    var maxSteps = P.mode === "script" ? script.length : P.maxSteps;
    var outcome = "max-steps", last = -1;
    snapshots.push(snap(0, true));
    for (var step = 1; step <= maxSteps; step++) {
      var inp = script ? script[step - 1] : policy(game.player, step);
      window.__force = { throttle: inp.throttle, brake: inp.brake, steer: inp.steer, afterburner: inp.afterburner, ramjet: inp.ramjet, drift: inp.drift, fire: inp.fire };
      inputs.push(inp);
      game.frame(DT);
      try { game.player.updateVisual(game.time); } catch (e) {}
      if (game.state !== last) { events.push({ step: step, type: "state", detail: game.state }); last = game.state; }
      if (step % P.snapEvery === 0) snapshots.push(snap(step, P.hudEvery > 0 && step % P.hudEvery === 0));
      if (game.state === "finished") { outcome = "finished"; break; }
      if (P.stopAfterLaps > 0 && game.lapIdx >= P.stopAfterLaps) { outcome = "finished"; break; }
    }
    snapshots.push(snap(step > maxSteps ? maxSteps : step, true));
    out.result = { mode: P.mode, steps: inputs.length, outcome: outcome, snapshots: snapshots, events: events, wallMs: Date.now() - t0 };
  } catch (e) {
    out.result = { mode: P.mode, steps: inputs.length, outcome: "error", error: String(e && e.stack || e).slice(0, 600), snapshots: snapshots, events: events, wallMs: Date.now() - t0 };
  } finally {
    window.__force = undefined;
    game.render = origRender;
  }
  out.segments = rle(inputs);
  return JSON.stringify(out);
  function expandScript(segs) { var a = []; for (var i = 0; i < segs.length; i++) for (var k = 0; k < segs[i].n; k++) a.push(segs[i].input); return a; }
  function same(a, b) { return a.throttle === b.throttle && a.brake === b.brake && a.steer === b.steer && a.afterburner === b.afterburner && a.ramjet === b.ramjet && a.drift === b.drift && a.fire === b.fire; }
  function rle(list) { var o = []; for (var i = 0; i < list.length; i++) { var l = o[o.length - 1]; if (l && same(l.input, list[i])) l.n++; else o.push({ n: 1, input: { throttle: list[i].throttle, brake: list[i].brake, steer: list[i].steer, afterburner: list[i].afterburner, ramjet: list[i].ramjet, drift: list[i].drift, fire: list[i].fire } }); } return o; }
})()`;
}

const NUMERIC_PLAYER: (keyof PlayerSnapshot)[] = ["s", "x", "dist", "v", "ab", "heat", "shield", "gunHeat", "theta", "phi", "yW", "vyW", "steerVal", "burning", "invuln", "burstT", "landT", "crashT"];

export interface RunComparison {
  exact: boolean;
  snapshotCount: number;
  maxPlayerDelta: number;
  maxGameDelta: number;
  firstDivergenceStep: number | null;
  flagMismatches: number;
}

/** Compares two runs snapshot by snapshot (same step indices). */
export function compareRuns(a: RunResult, b: RunResult): RunComparison {
  const n = Math.min(a.snapshots.length, b.snapshots.length);
  let maxPlayer = 0, maxGame = 0, first: number | null = null, flags = 0, exact = a.snapshots.length === b.snapshots.length;
  for (let i = 0; i < n; i++) {
    const x = a.snapshots[i] as Snapshot, y = b.snapshots[i] as Snapshot;
    let diverged = x.step !== y.step;
    for (const k of NUMERIC_PLAYER) {
      const d = Math.abs((x.player[k] as number) - (y.player[k] as number));
      if (d > maxPlayer) maxPlayer = d;
      if (d !== 0) diverged = true;
    }
    for (const k of ["crashed", "airborne", "onLava", "abActive", "rjActive", "drifting"] as const) if (x.player[k] !== y.player[k]) { flags++; diverged = true; }
    if (x.player.crashes !== y.player.crashes) { flags++; diverged = true; }
    const gd = Math.max(Math.abs(x.game.raceTime - y.game.raceTime), Math.abs(x.game.countdown - y.game.countdown), Math.abs(x.game.lapIdx - y.game.lapIdx), Math.abs(x.game.bestLap - y.game.bestLap));
    if (gd > maxGame) maxGame = gd;
    if (gd !== 0 || x.game.state !== y.game.state) diverged = true;
    if (diverged) { exact = false; if (first === null) first = x.step; }
  }
  return { exact, snapshotCount: n, maxPlayerDelta: maxPlayer, maxGameDelta: maxGame, firstDivergenceStep: first, flagMismatches: flags };
}

export interface Tolerance {
  /** per-field numeric tolerance a port is held to (1.5x the largest observed delta, floor set by float32 track tables) */
  player: number;
  game: number;
  basis: string;
}

export const TOLERANCE_SAFETY = 1.5;
/** The game stores track tables in Float32Array; a port that uses Float64 differs at about this scale per sample. */
export const FLOAT32_FLOOR = 1e-3;

export function toleranceFrom(comparisons: readonly RunComparison[]): Tolerance {
  const worstPlayer = comparisons.reduce((m, c) => Math.max(m, c.maxPlayerDelta), 0);
  const worstGame = comparisons.reduce((m, c) => Math.max(m, c.maxGameDelta), 0);
  return {
    player: Math.max(worstPlayer * TOLERANCE_SAFETY, FLOAT32_FLOOR),
    game: Math.max(worstGame * TOLERANCE_SAFETY, 1e-6),
    basis: `max(${TOLERANCE_SAFETY} x largest observed run-to-run delta, ${FLOAT32_FLOOR} float32 table floor)`
  };
}

export interface SessionRecord {
  schema: "a3d-crayon-capture-session/1";
  session: number;
  startedAt: string;
  url: string;
  browser: string;
  error?: string;
  frames?: string[];
  params?: PolicyParams;
  primary?: RunOutput;
  replays?: RunResult[];
}

export interface ReferenceReport {
  schema: typeof HEATSINK_SCHEMA;
  game: "heatsink";
  generatedAt: string;
  source: { url: string; moduleBytes: number; map: string; mode: "trial" };
  determinism: { method: string; step: number; steerQuantum: number };
  track: TrackFingerprint;
  params: PolicyParams;
  script: { totalSteps: number; segments: ScriptSegment[]; text: string };
  reference: { outcome: string; steps: number; snapshots: Snapshot[]; events: RunResult["events"] };
  hudIds: string[];
  repeatability: { sessions: number; replays: number; allExact: boolean; comparisons: RunComparison[]; trackIdentical: boolean };
  tolerance: Tolerance;
  notes: string[];
}

export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@CRAYON_CAPTURE_BEGIN:(\d+)\r?\n([\s\S]*?)\r?\n@@CRAYON_CAPTURE_END:\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(log))) {
    try { out.push(JSON.parse(m[2] as string)); } catch { /* truncated block */ }
  }
  return out;
}

export function validateReport(report: unknown): string[] {
  const errors: string[] = [];
  const r = report as Partial<ReferenceReport> | null;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== HEATSINK_SCHEMA) errors.push(`schema must be ${HEATSINK_SCHEMA}`);
  if (r.game !== "heatsink") errors.push("game must be heatsink");
  if (!r.track || !(r.track.length > 0) || !Array.isArray(r.track.samples) || r.track.samples.length < 16) errors.push("track fingerprint missing or too small");
  if (!r.reference || !Array.isArray(r.reference.snapshots) || r.reference.snapshots.length < 20) errors.push("reference needs at least 20 snapshots");
  if (r.reference && r.reference.outcome === "error") errors.push("reference run errored");
  if (!r.script || !(r.script.totalSteps > 0) || !Array.isArray(r.script.segments)) errors.push("input script missing");
  else {
    try {
      const parsed = parseInputScript(r.script.text ?? "");
      if (totalSteps(parsed) !== r.script.totalSteps) errors.push("script text does not round-trip to totalSteps");
    } catch (e) { errors.push(`script text does not parse: ${String(e)}`); }
  }
  if (!r.repeatability || !(r.repeatability.sessions >= 2)) errors.push("need at least two independent browser sessions");
  if (r.repeatability && (r.repeatability.replays ?? 0) < 1) errors.push("need at least one replay");
  if (!r.tolerance || !(r.tolerance.player > 0)) errors.push("tolerance missing");
  return errors;
}

export function assembleReport(sessions: readonly SessionRecord[], meta: { url: string; moduleBytes: number; map: string }): ReferenceReport {
  const good = sessions.filter((s) => s.primary && s.primary.result.outcome !== "error");
  if (good.length === 0) throw new Error("no usable sessions");
  const first = good[0] as SessionRecord;
  const primary = first.primary as RunOutput;
  const comparisons: RunComparison[] = [];
  let replays = 0;
  for (const s of good) {
    const own = s.primary as RunOutput;
    if (s !== first) comparisons.push(compareRuns(primary.result, own.result));
    for (const rp of s.replays ?? []) { comparisons.push(compareRuns(primary.result, rp)); replays++; }
  }
  const sameTrack = (a: TrackFingerprint, b: TrackFingerprint): boolean => a.length === b.length && a.n === b.n && a.samples.every((p, i) => { const q = b.samples[i] as TrackFingerprint["samples"][number]; return p.x === q.x && p.z === q.z && p.hw === q.hw && p.y === q.y; });
  const trackIdentical = good.every((s) => sameTrack(primary.track, (s.primary as RunOutput).track));
  const segments = primary.segments;
  return {
    schema: HEATSINK_SCHEMA,
    game: "heatsink",
    generatedAt: new Date().toISOString(),
    source: { url: meta.url, moduleBytes: meta.moduleBytes, map: meta.map, mode: "trial" },
    determinism: {
      method: "pre-boot hook freezes the game's rAF loop; game.frame(1/60) is called directly; window.__force sets the player's input each step; Time Trial removes rivals and items; render is a no-op while stepping",
      step: HEATSINK_STEP,
      steerQuantum: STEER_QUANTUM
    },
    track: primary.track,
    params: first.params ?? DEFAULT_POLICY,
    script: { totalSteps: totalSteps(segments), segments, text: encodeInputScript(segments) },
    reference: { outcome: primary.result.outcome, steps: primary.result.steps, snapshots: primary.result.snapshots, events: primary.result.events },
    hudIds: primary.hudIds,
    repeatability: { sessions: good.length, replays, allExact: comparisons.every((c) => c.exact), comparisons, trackIdentical },
    tolerance: toleranceFrom(comparisons),
    notes: []
  };
}
