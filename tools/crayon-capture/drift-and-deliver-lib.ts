/**
 * tools/crayon-capture/drift-and-deliver-lib — pure logic for the Drift & Deliver reference capture.
 *
 * No Playwright, no I/O. The original game exposes `window.__sim(steps, keys, dt)`, which steps its
 * driving model (`zr` car physics + `Cr` camera/shake decay) at a fixed `dt` with a key map. While the
 * game sits on its splash screen its real-time loop does not simulate, so the only thing that moves the
 * car is `__sim`. The runner (`drift-and-deliver.ts`) teleports with `__tp`, drives scripted segments one
 * step at a time and records the full state vector every step; everything below is unit-tested without a
 * browser.
 */
import { CAPTURE_SCHEMA, SIM_STEP } from "./lib.js";

export const GAME_ID = "drift-and-deliver";
export const REFERENCE_SCHEMA = CAPTURE_SCHEMA;
export const STEP = SIM_STEP;

/** Key bitmask used in scripts: the game reads `gr.{w,a,s,d,shift,space}`. */
export const KEY = { W: 1, A: 2, S: 4, D: 8, SHIFT: 16, SPACE: 32 } as const;

export interface KeyState {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  shift: boolean;
  space: boolean;
}

export interface Segment {
  steps: number;
  keys: number;
}

export interface Spawn {
  x: number;
  z: number;
  heading: number;
}

export interface Scenario {
  id: string;
  note: string;
  spawn: Spawn;
  segments: Segment[];
}

export function keysFromMask(mask: number): KeyState {
  return {
    w: (mask & KEY.W) !== 0,
    a: (mask & KEY.A) !== 0,
    s: (mask & KEY.S) !== 0,
    d: (mask & KEY.D) !== 0,
    shift: (mask & KEY.SHIFT) !== 0,
    space: (mask & KEY.SPACE) !== 0
  };
}

export function maskFromKeys(k: Partial<KeyState>): number {
  return (k.w ? KEY.W : 0) | (k.a ? KEY.A : 0) | (k.s ? KEY.S : 0) | (k.d ? KEY.D : 0) | (k.shift ? KEY.SHIFT : 0) | (k.space ? KEY.SPACE : 0);
}

const FLAG_ORDER: readonly (readonly [string, number])[] = [
  ["W", KEY.W],
  ["A", KEY.A],
  ["S", KEY.S],
  ["D", KEY.D],
  ["H", KEY.SHIFT],
  ["P", KEY.SPACE]
];

/** `<steps>x<flags>` per line, flags in W A S D H(shift) P(space) order, `-` for no keys. */
export function encodeScript(segments: readonly Segment[]): string {
  return segments.map((s) => `${s.steps}x${FLAG_ORDER.filter(([, bit]) => (s.keys & bit) !== 0).map(([ch]) => ch).join("") || "-"}`).join("\n");
}

export function parseScript(text: string): Segment[] {
  const out: Segment[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const m = /^(\d+)x([WASDHP-]+)$/.exec(line);
    if (!m) throw new Error(`bad script line: ${raw}`);
    let keys = 0;
    for (const ch of m[2] as string) if (ch !== "-") keys |= (FLAG_ORDER.find(([c]) => c === ch) as readonly [string, number])[1];
    out.push({ steps: Number(m[1]), keys });
  }
  return out;
}

export function totalSteps(segments: readonly Segment[]): number {
  return segments.reduce((n, s) => n + s.steps, 0);
}

/** Per-step key mask list for a segment script. */
export function expandMasks(segments: readonly Segment[]): number[] {
  const out: number[] = [];
  for (const s of segments) for (let i = 0; i < s.steps; i++) out.push(s.keys);
  return out;
}

const W = KEY.W;
const A = KEY.A;
const S = KEY.S;
const D = KEY.D;
const SHIFT = KEY.SHIFT;
const SPACE = KEY.SPACE;

/**
 * Open-street scenarios. The city is a 60 m grid of 43 m blocks centred on multiples of 60, so streets are the
 * 17 m gaps centred on 60k + 30 (original constants `Wt`, `Yt`, `Lt`). Heading h faces (sin h, cos h): +z is 0,
 * +x is pi/2. Scenarios run in order in a fresh page and share the hidden steering, lean, stuck and boost state,
 * because `__tp` only resets position, heading and velocity; the port must replay the whole sequence the same
 * way. Each scenario was simulated with the ported physics first to stay within about 5.5 m of its street centre
 * line; the capture records any building/prop contact it still sees.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: "street-z-weave-drift",
    note: "x=30 street along +z: launch, weave, two short drifts, boost, brake, reverse, coast",
    spawn: { x: 30, z: -300, heading: 0 },
    segments: [
      { steps: 240, keys: W },
      { steps: 6, keys: W | A },
      { steps: 6, keys: W | D },
      { steps: 10, keys: W | D | SPACE },
      { steps: 10, keys: W | A | SPACE },
      { steps: 120, keys: W | SHIFT },
      { steps: 90, keys: S },
      { steps: 150, keys: S },
      { steps: 40, keys: 0 }
    ]
  },
  {
    id: "street-x-weave-drift",
    note: "z=30 street along +x from a new spawn: launch, weave, longer drifts, boost, brake, coast (carries steering, lean and boost from the first scenario)",
    spawn: { x: -300, z: 30, heading: Math.PI / 2 },
    segments: [
      { steps: 200, keys: W },
      { steps: 6, keys: W | A },
      { steps: 6, keys: W | D },
      { steps: 14, keys: W | A | SPACE },
      { steps: 14, keys: W | D | SPACE },
      { steps: 100, keys: W | SHIFT },
      { steps: 80, keys: S },
      { steps: 60, keys: 0 }
    ]
  },
  {
    id: "street-z-drain-boost",
    note: "x=90 street along +z: hold boost until the tank is nearly empty, then recover",
    spawn: { x: 90, z: -300, heading: 0 },
    segments: [
      { steps: 60, keys: W },
      { steps: 260, keys: W | SHIFT },
      { steps: 40, keys: W },
      { steps: 80, keys: 0 }
    ]
  },
  {
    id: "street-x-low-boost",
    note: "z=90 street along +x: start with the boost left over from the previous scenario and boost again",
    spawn: { x: -300, z: 90, heading: Math.PI / 2 },
    segments: [
      { steps: 50, keys: W },
      { steps: 120, keys: W | SHIFT },
      { steps: 60, keys: S },
      { steps: 60, keys: 0 }
    ]
  }
];

/**
 * 32-bit FNV-1a over the bytes of the given doubles (little endian), returned as 8 hex digits.
 * Self-contained so `Function.prototype.toString()` can inject it into the page unchanged.
 */
export function hashDoubles(values: readonly number[]): string {
  const buf = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  for (let i = 0; i < values.length; i++) {
    buf.setFloat64(0, values[i] as number, true);
    for (let b = 0; b < 8; b++) {
      h ^= buf.getUint8(b);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, "0");
}

/** Per-step state vector recorded from the original and compared by the port. */
export const STATE_FIELDS = ["x", "z", "heading", "speed", "boost", "drifting", "boosting", "shake"] as const;
export type StateField = (typeof STATE_FIELDS)[number];
export type StateVector = readonly [number, number, number, number, number, number, number, number];

export interface ScenarioResult {
  id: string;
  spawn: Spawn;
  steps: number;
  /** Hash of every step's full state vector, in step order. */
  hash: string;
  /** Every `sampleEvery`-th step (step index, then the state vector). */
  sampleEvery: number;
  samples: { step: number; state: StateVector }[];
  final: Record<StateField, number> & { y: number };
  /** Steps where a probe point overlapped a nearby solid (the port has no building solids). */
  contacts: number;
  firstContactStep: number | null;
  maxSpeed: number;
  minBoost: number;
}

export interface SessionResult {
  schema: "a3d-crayon-capture-session/1";
  session: number;
  startedAt: string;
  url: string;
  browser?: string;
  world: WorldCensus;
  scenarios: ScenarioResult[];
  error?: string;
}

export interface WorldCensus {
  config: Record<string, number | string[]>;
  footprint: { halfW: number; halfD: number };
  diag: Record<string, unknown>;
  renderer: Record<string, unknown>;
  stateKeys: string[];
}

export function stateVector(s: Record<StateField, number>): StateVector {
  return [s.x, s.z, s.heading, s.speed, s.boost, s.drifting, s.boosting, s.shake];
}

export function flatten(vectors: readonly StateVector[]): number[] {
  const out: number[] = [];
  for (const v of vectors) for (const n of v) out.push(n);
  return out;
}

export interface ScenarioComparison {
  id: string;
  identical: boolean;
  hashEqual: boolean;
  maxAbsDelta: number;
  worstField: StateField | null;
}

/** Compare the recorded samples of two runs of the same scenario (hash equality is the exactness test). */
export function compareScenario(a: ScenarioResult, b: ScenarioResult): ScenarioComparison {
  const hashEqual = a.hash === b.hash;
  let max = 0;
  let worst: StateField | null = null;
  const n = Math.min(a.samples.length, b.samples.length);
  for (let i = 0; i < n; i++) {
    const va = (a.samples[i] as { state: StateVector }).state;
    const vb = (b.samples[i] as { state: StateVector }).state;
    for (let f = 0; f < va.length; f++) {
      const d = Math.abs((va[f] as number) - (vb[f] as number));
      if (d > max) {
        max = d;
        worst = STATE_FIELDS[f] as StateField;
      }
    }
  }
  return { id: a.id, identical: hashEqual && a.steps === b.steps && max === 0, hashEqual, maxAbsDelta: max, worstField: worst };
}

export interface Tolerance {
  /** Max absolute difference allowed per state field when the port replays the script. */
  perField: number;
  basis: string;
}

/** Run-to-run variance was measured; the allowed port difference is bounded by float rounding, not by the game. */
export function toleranceFrom(maxObservedDelta: number): Tolerance {
  const floor = 1e-9;
  return {
    perField: Math.max(floor, maxObservedDelta * 1.5),
    basis: maxObservedDelta === 0 ? "sessions were bit-identical; 1e-9 allows only libm/rounding differences between engines" : "1.5 x the worst observed session-to-session delta"
  };
}

export interface ReferenceReport {
  schema: typeof REFERENCE_SCHEMA;
  game: typeof GAME_ID;
  url: string;
  capturedAt: string;
  method: Record<string, string>;
  world: WorldCensus;
  script: { encoding: string; scenarios: { id: string; spawn: Spawn; steps: number; text: string }[] };
  reference: { scenarios: ScenarioResult[] };
  sessions: { source: string; startedAt: string; browser: string | null; hashes: Record<string, string>; vsReference: ScenarioComparison[] | null }[];
  variance: { sessions: number; allHashesEqual: boolean; maxAbsDelta: number };
  tolerance: Tolerance;
  limits: string[];
}

export function validateReport(report: unknown): string[] {
  const errors: string[] = [];
  const r = report as Partial<ReferenceReport> | null;
  if (!r || typeof r !== "object") return ["report is not an object"];
  if (r.schema !== REFERENCE_SCHEMA) errors.push(`schema must be ${REFERENCE_SCHEMA}`);
  if (r.game !== GAME_ID) errors.push(`game must be ${GAME_ID}`);
  const scenarios = r.reference?.scenarios ?? [];
  if (scenarios.length !== SCENARIOS.length) errors.push(`expected ${SCENARIOS.length} scenarios, found ${scenarios.length}`);
  for (const sc of scenarios) {
    const def = SCENARIOS.find((s) => s.id === sc.id);
    if (!def) {
      errors.push(`unknown scenario ${sc.id}`);
      continue;
    }
    if (sc.steps !== totalSteps(def.segments)) errors.push(`${sc.id}: steps ${sc.steps} != script ${totalSteps(def.segments)}`);
    if (!/^[0-9a-f]{8}$/.test(sc.hash)) errors.push(`${sc.id}: bad hash`);
    if (sc.samples.length === 0) errors.push(`${sc.id}: no samples`);
  }
  if ((r.sessions?.length ?? 0) < 2) errors.push("need at least two independent sessions");
  if (r.variance && !r.variance.allHashesEqual) errors.push("sessions disagree: the capture is not repeatable (variance.allHashesEqual is false)");
  return errors;
}

/** True once the page exposes the original's QA surface (also true on the Aura3D port, which mirrors it). */
export const READY_EXPRESSION = `!!(typeof window.__sim === "function" && typeof window.__tp === "function" && window.__game && window.__game.state && window.__gameEntities && window.__gameEntities.player && window.__dbg && typeof window.__dbg.nearSolids === "function")`;

/**
 * Source of the in-page runner: teleports with `__tp`, steps `__sim(1, keys, dt)` one step at a time, records the
 * state vector every step and hashes it. It runs unchanged against the original and against the Aura3D port.
 */
export function pageRunnerSource(scenarios: readonly Scenario[], sampleEvery: number): string {
  const payload = JSON.stringify({
    scenarios: scenarios.map((s) => ({ id: s.id, spawn: s.spawn, segments: s.segments.map((g) => ({ steps: g.steps, keys: keysFromMask(g.keys) })) })),
    sampleEvery,
    dt: STEP
  });
  return `(function () {
  var hashDoubles = ${hashDoubles.toString()};
  var cfg = ${payload};
  var g = window.__game, S = g.state, P = window.__gameEntities.player;
  var fp = P.userData.footprint;
  var g2 = fp.halfD - 0.55 * fp.halfW, x2 = 1.06 * fp.halfW;
  var results = [];
  for (var si = 0; si < cfg.scenarios.length; si++) {
    var sc = cfg.scenarios[si];
    window.__tp(sc.spawn.x, sc.spawn.z, sc.spawn.heading);
    var flat = [], samples = [], step = 0, contacts = 0, first = null, maxSpeed = 0, minBoost = 1;
    for (var gi = 0; gi < sc.segments.length; gi++) {
      var seg = sc.segments[gi];
      for (var i = 0; i < seg.steps; i++) {
        window.__sim(1, seg.keys, cfg.dt);
        step++;
        var h = S.heading, sn = Math.sin(h), cs = Math.cos(h);
        var v = [P.position.x, P.position.z, h, S.speed, S.boost, S.drifting ? 1 : 0, S.boosting ? 1 : 0, S.shake];
        for (var k = 0; k < v.length; k++) flat.push(v[k]);
        if (step % cfg.sampleEvery === 0) samples.push({ step: step, state: v });
        if (Math.abs(S.speed) > maxSpeed) maxSpeed = Math.abs(S.speed);
        if (S.boost < minBoost) minBoost = S.boost;
        var hit = false;
        var probes = [g2, -g2];
        for (var pi = 0; pi < probes.length && !hit; pi++) {
          var bx = P.position.x + sn * probes[pi], bz = P.position.z + cs * probes[pi];
          var near = window.__dbg.nearSolids(bx, bz);
          for (var ni = 0; ni < near.length; ni++) {
            var o = near[ni], dx = bx - o.x, dz = bz - o.z, w = o.hw + x2, d = o.hd + x2;
            if (dx > -w && dx < w && dz > -d && dz < d) { hit = true; break; }
          }
        }
        if (hit) { contacts++; if (first === null) first = step; }
      }
    }
    results.push({
      id: sc.id, spawn: sc.spawn, steps: step, hash: hashDoubles(flat), sampleEvery: cfg.sampleEvery, samples: samples,
      final: { x: P.position.x, z: P.position.z, heading: S.heading, speed: S.speed, boost: S.boost, drifting: S.drifting ? 1 : 0, boosting: S.boosting ? 1 : 0, shake: S.shake, y: P.position.y },
      contacts: contacts, firstContactStep: first, maxSpeed: maxSpeed, minBoost: minBoost
    });
  }
  var diag = {};
  try { diag = window.__diag ? window.__diag() : {}; } catch (e) { diag = { error: String(e) }; }
  var cam = window.__dbg.camera, r = g.renderer;
  var config = {};
  for (var key in g.CONFIG) config[key] = g.CONFIG[key];
  return JSON.stringify({
    world: {
      config: config,
      footprint: { halfW: fp.halfW, halfD: fp.halfD },
      diag: diag,
      renderer: { three: window.__dbg.THREE.REVISION, toneMapping: r.toneMapping, toneMappingExposure: r.toneMappingExposure, fov: cam.fov, near: cam.near, far: cam.far, crayonGfx: window.__crayonGfx || null },
      stateKeys: Object.keys(S)
    },
    scenarios: results
  });
})()`;
}

export function parseMarkerBlocks(log: string): unknown[] {
  const out: unknown[] = [];
  const re = /@@DRIFT_CAPTURE_BEGIN:(\S+)\s*\n([\s\S]*?)\n@@DRIFT_CAPTURE_END:\1/g;
  for (let m = re.exec(log); m; m = re.exec(log)) {
    try {
      out.push(JSON.parse(m[2] as string));
    } catch {
      out.push({ error: `block ${m[1]} is not valid JSON` });
    }
  }
  return out;
}

export function assembleReport(sessions: readonly (SessionResult & { source?: string })[], meta: { url: string; capturedAt: string }): ReferenceReport {
  const first = sessions[0];
  if (!first) throw new Error("no sessions to assemble");
  const reference = first.scenarios;
  let maxDelta = 0;
  let allEqual = true;
  const summaries = sessions.map((s, i) => {
    const hashes: Record<string, string> = {};
    for (const sc of s.scenarios) hashes[sc.id] = sc.hash;
    let vs: ScenarioComparison[] | null = null;
    if (i > 0) {
      vs = reference.map((ref) => {
        const other = s.scenarios.find((x) => x.id === ref.id);
        return other ? compareScenario(ref, other) : { id: ref.id, identical: false, hashEqual: false, maxAbsDelta: Number.POSITIVE_INFINITY, worstField: null };
      });
      for (const c of vs) {
        if (!c.identical) allEqual = false;
        if (c.maxAbsDelta > maxDelta) maxDelta = c.maxAbsDelta;
      }
    }
    return { source: s.source ?? `session-${s.session}`, startedAt: s.startedAt, browser: s.browser ?? null, hashes, vsReference: vs };
  });
  return {
    schema: REFERENCE_SCHEMA,
    game: GAME_ID,
    url: meta.url,
    capturedAt: meta.capturedAt,
    method: {
      stepping: "window.__sim(1, keys, 1/60) per step after window.__tp(x, z, heading); the game stays on its splash screen so its real-time loop does not simulate",
      recorded: STATE_FIELDS.join(", "),
      hash: "32-bit FNV-1a over the little-endian bytes of every step's state vector, in step order",
      order: "scenarios run in order in a fresh page; __tp resets position, heading and velocity only, so steering smoothing, boost and the stuck timer carry over"
    },
    world: first.world,
    script: {
      encoding: "<steps>x<flags>; flags W A S D H(shift) P(space); one step = 1/60 s",
      scenarios: SCENARIOS.map((s) => ({ id: s.id, spawn: s.spawn, steps: totalSteps(s.segments), text: encodeScript(s.segments) }))
    },
    reference: { scenarios: reference },
    sessions: summaries,
    variance: { sessions: sessions.length, allHashesEqual: allEqual, maxAbsDelta: maxDelta },
    tolerance: toleranceFrom(maxDelta),
    limits: [
      "Only the driving model is covered: collectibles, traffic, police, missions and the story are not part of this reference.",
      "Scenarios are open-street runs with no building contact (see each scenario's contacts count); the port has no building solids, so a scenario with contacts would diverge.",
      "The original's real-time loop is not exercised; __sim steps the same physics function the loop calls."
    ]
  };
}

/* ------------------------------------------------------------------ look-reference frames */

export interface FrameShot {
  readonly name: string;
  /** teleport target; absent = leave the car where it is */
  readonly spawn?: Spawn;
  /** key script stepped through the sim after the teleport */
  readonly drive?: readonly Segment[];
  /** real-time settle (ms) with the original's live loop running before the screenshot */
  readonly settleMs?: number;
  /** also take a variant with the DOM overlays visible (the original only; the port canvas has none) */
  readonly hud?: boolean;
  /** take the shot on the original's splash screen (before starting) */
  readonly splash?: boolean;
}

/** The states photographed in both games. Streets run at 30 + 60k on both axes. */
export const FRAME_SHOTS: readonly FrameShot[] = [
  { name: "title", splash: true, hud: true, settleMs: 2500 },
  { name: "z-idle", spawn: { x: 30, z: -300, heading: 0 }, hud: true, settleMs: 3500 },
  { name: "z-drive", spawn: { x: 30, z: -300, heading: 0 }, drive: [{ steps: 150, keys: KEY.W }], settleMs: 2000 },
  { name: "z-drift", spawn: { x: 30, z: -300, heading: 0 }, drive: [{ steps: 120, keys: KEY.W }, { steps: 40, keys: KEY.W | KEY.D | KEY.SPACE }], settleMs: 1200, hud: true },
  { name: "z-boost", spawn: { x: 90, z: -300, heading: 0 }, drive: [{ steps: 90, keys: KEY.W }, { steps: 70, keys: KEY.W | KEY.SHIFT }], settleMs: 1200, hud: true },
  { name: "x-idle", spawn: { x: -300, z: 30, heading: Math.PI / 2 }, settleMs: 3500 },
  { name: "x-drive", spawn: { x: -300, z: 30, heading: Math.PI / 2 }, drive: [{ steps: 170, keys: KEY.W | KEY.A }], settleMs: 1800 },
  { name: "origin", spawn: { x: 30, z: 30, heading: 0 }, settleMs: 3500, hud: true },
  { name: "downtown-ne", spawn: { x: 150, z: 150, heading: Math.PI / 4 }, settleMs: 3500 },
  { name: "downtown-sw", spawn: { x: -150, z: -150, heading: Math.PI }, settleMs: 3500 },
  { name: "outer-e", spawn: { x: 330, z: 90, heading: -Math.PI / 2 }, settleMs: 3500 },
  { name: "outer-n", spawn: { x: -90, z: 330, heading: Math.PI }, settleMs: 3500 }
];
