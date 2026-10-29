/**
 * Pure simulation port of "Cumulus Dash" (`Sp` and its helpers in the original bundle).
 *
 * Scope: the run core: forward speed, lane steering, jump/gravity/landing, log dismount, Power Pole plant /
 * vault / launch, gap and water falls, Sky Pearl and meat pickups, checkpoints, finish, combo + score, and
 * the Flying Glider charge / call / ride / land state machine with its safe-run map. NOT ported: the
 * encounter system (pteranodon dives, boulders, rocks and logs as collisions, T-rex bites, Janken). The
 * original queries it through `state.liveAttack`; this port leaves that hook open (default: attacks live).
 * No randomness and no wall clock: only `dt` and the input drive it.
 */
import { GLIDER, type Chapter, type Creature, type SkyPearl, type Meat, type Span } from "./chapter";

/** The original had stepped this many idle frames before its first recorded snapshot (verified against the reference speed). */
export const SETTLE_FRAMES = 4;
export const CELL = 0.5;
const UP = 1.45;
const GRAVITY = 25;

export interface GliderState {
  charge: number; bank: number; ready: boolean; call: number; active: boolean; time: number; end: number | null;
  from: number; rescue: boolean; grace: number; rides: number; rescues: number; blocked: string | null;
  wait: string | null; nope: number; nopeWhy: string | null;
}
export interface Janken { step: string; t: number; creature?: unknown; kind?: string; hand?: string }
export interface SimState {
  chapter: number; s: number; lane: number; laneVelocity: number; speed: number; jump: number; jumpVelocity: number;
  time: number; score: number; orbs: number; combo: number; maxCombo: number; comboTimer: number; hearts: number;
  /** Heart cap for meat and checkpoint refills; unset means the original's 3 (easy mode sets 4). */
  maxHearts?: number;
  checkpoint: number; pole: Span | null; poleTimer: number; staffRecall: number; strikeTimer: number; invincible: number;
  finished: boolean; dead: boolean; hits: number; falls: number; polesUsed: number; encounters: number;
  checkpointIndex: number; trick: string; trickTimer: number; trickDuration: number; boostTimer: number;
  landingTimer: number; jumpBuffer: number; launchQueued: boolean; launchDist: number; aerialUsed: boolean;
  powerLaunches: number; airSteps: number; vaults: number; flow: number; perfects: number; balls: number[];
  falling: number; glider: GliderState; meat: number; eaten: Set<number>; janken: Janken | null; jankens: number;
  strikeLead: number; grabTimer?: number; stumbleTimer?: number; catchTimer?: number; jankenWindow?: boolean; chased?: boolean;
  crashed: Set<number>; collected: Set<number>;
  /** Encounter-system seam: return false when a creature attack is not live. Default: live. */
  liveAttack?: (creature: Creature, at: number) => boolean;
}
export interface StepInput { steer: number; jump: boolean; pole: boolean; glider: boolean; brake: boolean }
export const IDLE: StepInput = { steer: 0, jump: false, pole: false, glider: false, brake: false };

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export function smooth(a: number, b: number, v: number): number {
  const r = clamp((v - a) / (b - a), 0, 1);
  return r * r * (3 - 2 * r);
}
export function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}
const spanAt = (s: number, spans: readonly Span[]): Span | undefined => spans.find((x) => s >= x.start && s <= x.end);
const poleAhead = (s: number, ch: Chapter): Span | undefined => ch.poles.find((p) => s >= p.start - 42 && s <= p.end);

export function createState(chapter = 0): SimState {
  return {
    chapter, s: 0, lane: 0, laneVelocity: 0, speed: 0, jump: 0, jumpVelocity: 0, time: 0, score: 0, orbs: 0, combo: 0, maxCombo: 0,
    comboTimer: 0, hearts: 3, checkpoint: 0, pole: null, poleTimer: 0, staffRecall: 0, strikeTimer: 0, invincible: 1, finished: false,
    dead: false, hits: 0, falls: 0, polesUsed: 0, encounters: 0, checkpointIndex: 0, trick: "", trickTimer: 0, trickDuration: 1,
    boostTimer: 0, landingTimer: 0, jumpBuffer: 0, launchQueued: false, launchDist: 99, aerialUsed: false, powerLaunches: 0,
    airSteps: 0, vaults: 0, flow: 0, perfects: 0, balls: [], falling: 0,
    glider: { charge: 0, bank: 0, ready: false, call: 0, active: false, time: 0, end: null, from: 0, rescue: false, grace: 0, rides: 0, rescues: 0, blocked: null, wait: null, nope: 0, nopeWhy: null },
    meat: 0, eaten: new Set(), janken: null, jankens: 0, strikeLead: 99,
    crashed: new Set(), collected: new Set()
  };
}

/* ------------------------------------------------------------ obstacle layout and glider map */

export interface Obstacle { s: number; lane: number; type: "rock" | "log" | "relief"; size: number; id: number }

function inEncounterZone(s: number, ch: Chapter): boolean {
  if (
    ch.poles.some((p) => s > p.start - 42 && s < p.end + 17) ||
    ch.gaps.some((g) => s > g.start - 24 && s < g.end + 18) ||
    ch.boulders.some((b) => Math.abs(s - b.s) < 26) ||
    ch.balls.some((b) => Math.abs(s - b.s) < 10)
  ) return true;
  for (const c of ch.creatures) {
    if (c.type === "trex") {
      if ([...(c.bites ?? []), ...(c.swipes ?? [])].some((t) => Math.abs(s - t) < 16)) return true;
    } else if (Math.abs(s - c.s) < 25) return true;
  }
  return ch.walls.some((w) => s > w.start - 22 && s < w.end + 22)
    ? true
    : ch.waters.some((w) => s > w.start - 4 && s < w.end + 4) && ch.kind === "journey";
}

/** Original `Jf`: the authored rocks plus seeded procedural rocks and logs along the run. */
export function layoutObstacles(ch: Chapter, index = 0): Obstacle[] {
  const rnd = seeded(index + 912);
  const out: Obstacle[] = [];
  for (const r of ch.rocks) out.push({ s: r.s, lane: r.lane, type: "rock", size: 1.2, id: out.length });
  for (let t = ch.log ? ch.log + 20 : 76; t < ch.length - 42; t += 39 + rnd() * 25) {
    if (inEncounterZone(t, ch) || (ch.kind === "journey" && t > ch.length - 120)) continue;
    const lane = (rnd() - 0.5) * 6;
    const type = rnd() > 0.43 ? "rock" : "log";
    const size = 1.1 + rnd() * 0.45;
    out.push({ s: t, lane, type, size, id: out.length });
  }
  return out;
}

export interface GliderMap {
  n: number; fly: string[]; safe: Uint8Array; calm: Uint8Array; land: Uint8Array;
  next: Int32Array; last: Int32Array; ahead: Int32Array; runEnd: Int32Array;
  obs: { s: number; lane: number; top: number }[];
}
const mapCache = new WeakMap<Chapter, GliderMap>();

/** Original `np`: per-half-unit maps that decide where the Glider may be called, ridden and left. */
export function gliderMap(ch: Chapter): GliderMap {
  const cached = mapCache.get(ch);
  if (cached) return cached;
  const n = Math.ceil((ch.length + 60) / CELL);
  const fly: string[] = Array<string>(n).fill("");
  const safe = new Uint8Array(n), calm = new Uint8Array(n), land = new Uint8Array(n);
  const mark = (a: number, b: number, label: string): void => {
    for (let i = Math.max(0, Math.floor(a / CELL)); i < Math.min(n, Math.ceil(b / CELL)); i++) fly[i] ||= label;
  };
  if (ch.log) mark(0, ch.log + 12, "log");
  for (const p of ch.poles) mark(p.start - 30, p.end + 14, "pole");
  for (const w of ch.walls) mark(w.start - 20, w.end + 22, "wall");
  if (ch.kind === "journey") for (const w of ch.waters) mark(w.start - 10, w.end + 4, "river");
  if (ch.home) mark(ch.length - 75, ch.length + 60, "home");
  const landBlock: [number, number][] = [...ch.gaps.map((g) => [g.start - 3, g.end + 3] as [number, number]), ...ch.poles.map((p) => [p.start - 2, p.end + 3] as [number, number])];
  const safeBlock: [number, number][] = [...landBlock, ...ch.waters.map((w) => [w.start - 3, w.end + 3] as [number, number])];
  const obs = layoutObstacles(ch, 0).map((o) => ({ s: o.s, lane: o.lane, top: o.type === "log" ? 1.6 : 1.1 * o.size }));
  const obstacleS = obs.map((o) => o.s);
  const boulderS = ch.boulders.map((b) => b.s);
  const pteraS = ch.creatures.filter((c) => c.type === "pteranodon").map((c) => c.s);
  const trexS = ch.creatures.filter((c) => c.type === "trex").flatMap((c) => [...(c.bites ?? []), ...(c.swipes ?? [])]);
  for (let i = 0; i < n; i++) {
    const at = i * CELL;
    safe[i] = +(at < ch.length + 10 && !safeBlock.some(([a, b]) => a < at + 28 && b > at - 2));
    land[i] = +(at < ch.length + 10 && !landBlock.some(([a, b]) => a < at + 20 && b > at - 2));
    let m = safe[i] as number;
    for (let e = Math.max(0, i - 4); m && e <= Math.min(n - 1, i + 40); e++) if (fly[e]) m = 0;
    calm[i] = m && !pteraS.some((e) => e > at - 4 && e < at + 30) && !obstacleS.some((e) => e > at + 12 && e < at + 24) &&
      !boulderS.some((e) => e > at - 17 && e < at + 24) && !trexS.some((e) => e > at + 13 && e < at + 24) ? 1 : 0;
  }
  const next = new Int32Array(n), last = new Int32Array(n), ahead = new Int32Array(n), runEnd = new Int32Array(n);
  for (let e = n - 1, r = n, a = n - 1, o = -1; e >= 0; e--) {
    if (fly[e]) r = e;
    next[e] = r;
    if (calm[e]) { a = e; if (o < 0) o = e; } else o = -1;
    ahead[e] = a;
    runEnd[e] = o;
  }
  for (let e = 0, v = -1; e < n; e++) { if (calm[e]) v = e; last[e] = v; }
  const map: GliderMap = { n, fly, safe, calm, land, next, last, ahead, runEnd, obs };
  mapCache.set(ch, map);
  return map;
}
const cellOf = (m: GliderMap, s: number): number => clamp(Math.round(s / CELL), 0, m.n - 1);

/** Original `ip`: why the Glider cannot be used here (a set-piece), or where the current calm run ends. */
export function gliderWhy(state: SimState, ch: Chapter): { why?: string; end?: number } {
  const m = gliderMap(ch), r = cellOf(m, state.s);
  if (m.fly[r]) return { why: m.fly[r] };
  const i = m.next[r] as number, a = m.last[i - 1] as number;
  return a < 0 || (a - r) * CELL < GLIDER.minRide ? { why: i < m.n ? m.fly[i] : "home" } : { end: a * CELL };
}

/** Original `dp`: the ride/ground height reference the Glider uses (obstacles and boulders lift it). */
export function rideHeight(state: SimState, ch: Chapter): number {
  let lift = 0;
  for (const b of ch.boulders) {
    const t = state.s - b.s;
    lift = Math.max(lift, GLIDER.lift * smooth(-17, -12, t) * (1 - smooth(13, 17, t)));
  }
  for (const o of gliderMap(ch).obs) {
    const t = state.s - o.s;
    if (t > -9 && t < 6 && Math.abs(o.lane - state.lane) < 2.8) {
      lift = Math.max(lift, Math.max(0, o.top + 0.6 + UP - GLIDER.height) * smooth(-9, -5, t) * (1 - smooth(3, 6, t)));
    }
  }
  return GLIDER.height + lift + Math.sin(state.time * 2.4) * 0.06;
}

/* ------------------------------------------------------------------------------ helpers */

const liveAttack = (state: SimState, c: Creature, at: number): boolean => !state.liveAttack || state.liveAttack(c, at);
function attackingCreature(state: SimState, ch: Chapter): Creature | undefined {
  return ch.creatures.find((c) =>
    (c.type === "pteranodon" && Math.abs(c.s - state.s) < 24 && liveAttack(state, c, c.s)) ||
    (c.type === "trex" && state.s > c.s - 10 && state.s < (c.until ?? 0) &&
      (c.bites ?? []).some((b) => b - state.s < 12 && b - state.s > -3 && liveAttack(state, c, b))));
}
function nextThreat(state: SimState, ch: Chapter): number {
  let best = 99;
  for (const c of ch.creatures) {
    if (c.type === "pteranodon") {
      const t = c.s - state.s;
      if (t > -1.5 && t < 24 && liveAttack(state, c, c.s)) best = Math.min(best, t);
    } else if (c.type === "trex" && state.s > c.s - 10 && state.s < (c.until ?? 0)) {
      for (const b of c.bites ?? []) {
        const t = b - state.s;
        if (t > -1.5 && t < 12 && liveAttack(state, c, b)) best = Math.min(best, t);
      }
    }
  }
  return best;
}
function trick(state: SimState, name: string, duration: number): void {
  state.trick = name; state.trickTimer = duration; state.trickDuration = duration; state.flow = Math.min(1, state.flow + 0.08);
}
export function award(state: SimState, points = 100): void {
  state.combo++;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.comboTimer = 7;
  state.score += Math.round(points * (1 + Math.min(3, state.combo * 0.12)));
}
const EVENT_GAIN: Record<string, string> = { skypearl: "ball", perfect: "perfect", "power-launch": "launch", "flow-land": "flow" };
export function gainGlider(state: SimState, kind: string, ch: Chapter, count = 1): void {
  const n = state.glider, before = n.charge, why = gliderWhy(state, ch).why;
  if (n.active || n.call > 0) return;
  const setPiece = !!why && (before < GLIDER.hold || n.bank > 0);
  let after = before + (GLIDER.gain[kind] || 0) * count * (setPiece ? GLIDER.setPiece : 1);
  if (setPiece && after > GLIDER.hold) {
    n.bank = (n.bank || 0) + after - Math.max(before, GLIDER.hold);
    after = Math.max(before, GLIDER.hold);
  }
  n.charge = Math.min(1, after);
  if (n.charge >= 1 && before < 1) n.blocked = why || null;
}
function strike(state: SimState, ch: Chapter, ev: string[]): void {
  state.strikeTimer = 0.65; state.poleTimer = 0.48; state.strikeLead = nextThreat(state, ch);
  trick(state, "strike", 0.65); ev.push("strike");
}
const ballHit = (state: SimState, b: SkyPearl): boolean =>
  !state.balls.includes(b.star) && Math.abs(state.s - b.s) < 1.8 && Math.abs(state.lane - b.lane) < 1.8 && reachHeight(state, b.height, 1.6);
const meatHit = (state: SimState, m: Meat): boolean =>
  !state.eaten.has(m.s) && Math.abs(state.s - m.s) < 1.8 && Math.abs(state.lane - m.lane) < 1.8 && reachHeight(state, m.height ?? 1.15, 1.7);
const reachHeight = (state: SimState, h: number, tol: number): boolean =>
  state.glider.active ? h < state.jump + 1.15 + tol : Math.abs(h - (state.jump + 1.15)) < tol;

function gliderCall(state: SimState, ch: Chapter, ev: string[]): void {
  const n = state.glider;
  if (n.active || n.call > 0 || state.janken || (state.grabTimer ?? 0) > 0) return;
  const why = gliderWhy(state, ch);
  if (n.charge < 1 || why.why || state.pole) {
    n.nope++;
    n.nopeWhy = n.charge >= GLIDER.hold ? why.why || (state.pole ? "pole" : "charge") : "charge";
    ev.push(n.charge >= GLIDER.hold ? "glider-wait" : "glider-empty");
    return;
  }
  Object.assign(n, { charge: 0, bank: 0, ready: false, call: GLIDER.call, rescue: false, from: 0, end: why.end ?? null });
  ev.push("glider-call");
}
function gliderMount(state: SimState, ch: Chapter, ev: string[]): void {
  const n = state.glider;
  Object.assign(n, { call: 0, active: true, time: n.rescue ? GLIDER.rescueRide : GLIDER.ride });
  n.rides++;
  state.jumpVelocity = Math.max(state.jumpVelocity, Math.sqrt(50 * Math.max(0.05, rideHeight(state, ch) + 0.3 - state.jump)));
  state.jumpBuffer = 0; state.aerialUsed = false; state.launchQueued = false;
  ev.push("glider-mount");
}
function gliderLand(state: SimState, ev: string[]): void {
  const n = state.glider;
  const keep = !n.rescue && n.time > 1 ? Math.min(0.6, (n.time / GLIDER.ride) * 0.7) : 0;
  Object.assign(n, { active: false, time: 0, end: null, rescue: false, from: 0, grace: GLIDER.grace, charge: keep });
  state.jumpVelocity = GLIDER.hop; state.jump = Math.max(state.jump, 0.05);
  ev.push("glider-end");
}

/* ------------------------------------------------------------------------------- the step */

/** Original `Sp(state, input, dt, chapter)`: advance one frame, returning the events it raised. */
export function step(state: SimState, input: StepInput, dtIn: number, ch: Chapter): string[] {
  if (state.finished || state.dead) return [];
  const ev: string[] = [];
  const n = state.glider;
  const dt = Math.min(dtIn, 0.04);
  state.time += dt;
  for (const k of ["staffRecall", "invincible", "strikeTimer", "poleTimer", "comboTimer", "trickTimer", "boostTimer", "landingTimer", "jumpBuffer"] as const) {
    state[k] = Math.max(0, (state[k] || 0) - dt);
  }
  n.grace = Math.max(0, n.grace - dt);
  if (!state.comboTimer) state.combo = 0;
  const pole = spanAt(state.s, ch.poles);
  const water = spanAt(state.s, ch.waters);
  if (input.glider) gliderCall(state, ch, ev);
  if (n.call > 0) {
    n.call = Math.max(0, n.call - dt);
    if (!n.call || (!n.rescue && state.jump < 0.2 && spanAt(state.s, ch.gaps))) gliderMount(state, ch, ev);
  }
  const riding = n.active;
  const inGlider = riding || n.call > 0;
  if (riding) n.time = Math.max(0, n.time - dt);
  const target = ch.speed * (input.brake ? 0.7 : 1) * (1 + Math.min(state.combo, 12) * 0.012) * (riding ? GLIDER.speed : state.boostTimer > 0 ? 1.18 : 1);
  state.speed += (target - state.speed) * Math.min(1, dt * 2.7);
  state.laneVelocity += ((input.steer || 0) * 6.8 - state.laneVelocity) * Math.min(1, dt * 12);
  if (pole && state.pole?.start === pole.start) {
    state.lane *= Math.exp(-dt * 7);
    state.laneVelocity *= 0.65;
  } else {
    const limit = 5.1;
    state.lane = clamp(state.lane + state.laneVelocity * dt, -limit, limit);
  }
  const onPole = !!pole && state.pole?.start === pole.start;
  const groundRef = rideHeight(state, ch);
  if (input.jump) state.jumpBuffer = 0.18;
  if (riding) {
    if (state.jumpBuffer > 0 && state.jump <= groundRef + 0.03 && state.jumpVelocity <= 0) {
      const m = gliderMap(ch);
      if (state.s < (n.end ?? 0) - 25) {
        state.jumpBuffer = 0; state.jumpVelocity = GLIDER.cloudHop; ev.push("jump");
      } else if (!n.rescue && m.calm[cellOf(m, state.s)]) {
        state.jumpBuffer = 0; gliderLand(state, ev);
      }
    }
  } else if (state.jumpBuffer > 0 && onPole && (pole as Span).end - state.s < 17) {
    if (!state.launchQueued) state.launchDist = (pole as Span).end - state.s;
    state.launchQueued = true; state.jumpBuffer = 0; ev.push("launch-ready");
  } else if (state.jumpBuffer > 0 && state.jump < 0.03) {
    state.jumpVelocity = 13.4; state.jump = 0.025; state.jumpBuffer = 0;
    if (spanAt(state.s, ch.walls)) {
      trick(state, "wall-kick", 0.7); state.boostTimer = 0.8; award(state, 150); ev.push("wall-kick");
    } else ev.push("jump");
  }
  state.jumpVelocity -= GRAVITY * dt;
  state.jump += state.jumpVelocity * dt;
  if (riding) {
    if (state.jump <= groundRef && state.jumpVelocity <= 0) {
      state.jump = groundRef; state.jumpVelocity = 0;
      const m = gliderMap(ch), c = cellOf(m, state.s);
      let leave = state.s >= (n.end ?? 0) - 0.5 || (n.time <= 0 && state.s >= n.from && !!m.calm[c]);
      if (!leave && m.calm[c] && !n.rescue && n.time > 0) {
        const reach = state.s + state.speed * n.time, edge = (m.runEnd[c] as number) * CELL;
        leave = state.s >= edge - 0.5 && reach > edge + 0.5 && reach - edge < state.speed * 1.5 && (m.ahead[cellOf(m, reach)] as number) * CELL - reach > reach - edge;
      }
      if (leave) gliderLand(state, ev);
    }
  } else if (!(n.rescue && n.call > 0)) {
    state.jump = Math.max(0, state.jump);
    if (state.jump === 0 && state.jumpVelocity < 0) {
      if (state.jumpVelocity < -4) {
        ev.push(water ? "splash" : "land");
        state.landingTimer = 0.24;
        if (state.aerialUsed) {
          state.boostTimer = 1.3; state.flow = Math.min(1, state.flow + 0.18); award(state, 250); ev.push("flow-land");
        }
      }
      state.jumpVelocity = 0; state.aerialUsed = false;
    }
  }
  if (input.pole && state.poleTimer <= 0) {
    const ahead = poleAhead(state.s, ch), attacker = attackingCreature(state, ch);
    if (inGlider) {
      if (attacker) strike(state, ch, ev);
    } else if (ahead && state.s < ahead.start + 8 && state.pole?.start !== ahead.start) {
      state.pole = ahead; state.poleTimer = 0.5; state.polesUsed++; trick(state, "plant", 0.35); award(state, 300); ev.push("extend");
    } else if (attacker) strike(state, ch, ev);
    else if (onPole) {
      if ((pole as Span).end - state.s < 26) {
        if (!state.launchQueued) state.launchDist = (pole as Span).end - state.s;
        state.launchQueued = true; ev.push("launch-ready");
      } else {
        state.boostTimer = 0.8; trick(state, "pole-kick", 0.45); award(state, 120); ev.push("pole-kick");
      }
      state.poleTimer = 0.55;
    } else if (state.jump > 0.35) {
      if (!state.aerialUsed) {
        state.aerialUsed = true; state.airSteps++; state.jumpVelocity = Math.max(3.5, state.jumpVelocity * 0.45); state.boostTimer = 1;
        state.poleTimer = 0.5; trick(state, "air-step", 0.6); award(state, 300); ev.push("air-step");
      }
    } else if (!(ch.log && state.s < ch.log)) {
      state.jump = 0.05; state.jumpVelocity = 15.8; state.vaults++; state.poleTimer = 0.65; state.boostTimer = 0.65;
      trick(state, water ? "water-vault" : "vault", 0.9); award(state, 180); ev.push("vault");
    }
  }
  const before = state.s;
  state.s += state.speed * dt;
  if (ch.log && before <= ch.log && state.s > ch.log) {
    state.jump += 1.65; state.jumpVelocity = Math.max(7, state.jumpVelocity); ev.push("dismount");
  }
  if (pole && state.pole?.start !== pole.start && !inGlider) { ev.push("fall"); state.falls++; }
  if (state.pole && before <= state.pole.end && state.s > state.pole.end) {
    const power = state.launchQueued;
    state.jumpVelocity = power ? 13.8 : 8.5;
    state.jump = Math.max(state.jump, 0.1);
    award(state, power ? 450 : 200);
    ev.push(power ? "power-launch" : "launch");
    if (power && state.launchDist < 6.5) { award(state, 250); state.perfects++; ev.push("perfect"); }
    state.staffRecall = 0.65; state.pole = null; state.launchQueued = false; state.launchDist = 99; state.aerialUsed = false;
    state.boostTimer = power ? 1.1 : 0;
    if (power) state.powerLaunches++;
    trick(state, power ? "somersault" : "launch", power ? 0.9 : 0.55);
  }
  if (spanAt(state.s, ch.gaps) && state.jump < 0.2 && !inGlider) { ev.push("fall"); state.falls++; }
  for (const b of ch.balls) if (ballHit(state, b)) { state.balls.push(b.star); award(state, 700); ev.push("skypearl"); }
  for (const m of ch.meat) {
    if (meatHit(state, m)) {
      state.eaten.add(m.s); state.meat++;
      if (state.hearts < (state.maxHearts ?? 3)) { state.hearts++; award(state, 200); } else award(state, 800);
      ev.push("meat");
    }
  }
  for (let i = 0; i < ch.checkpoints.length; i++) {
    if (state.s >= (ch.checkpoints[i] as number) && i > state.checkpointIndex) {
      state.checkpoint = ch.checkpoints[i] as number; state.checkpointIndex = i; state.hearts = Math.min(state.maxHearts ?? 3, state.hearts + 1); ev.push("checkpoint");
    }
  }
  if (state.s >= ch.length) {
    if (ch.home && !state.balls.includes(ch.home.star)) state.balls.push(ch.home.star);
    state.finished = true; ev.push("finish");
  }
  for (const e of ev) if (EVENT_GAIN[e]) gainGlider(state, EVENT_GAIN[e] as string, ch);
  if (n.bank > 0 && !inGlider && !gliderWhy(state, ch).why) { n.charge = Math.min(1, n.charge + n.bank); n.bank = 0; }
  const why = inGlider ? null : gliderWhy(state, ch).why || null;
  n.blocked = n.charge >= 1 ? why : null;
  n.wait = n.charge >= GLIDER.hold || n.bank > 0 ? why : null;
  if (n.charge >= 1 && !n.ready && !inGlider && !n.blocked) { n.ready = true; ev.push("glider-ready"); }
  return ev;
}

/* ------------------------------------------------------------- world layout, damage, pickups */

export interface Orb { s: number; lane: number; id: number }
/** Original world constructor: an orb every 7.5 units from s=35, skipping gaps; lane weaves, or +-0.6 on poles. */
export function layoutOrbs(ch: Chapter): Orb[] {
  const out: Orb[] = [];
  for (let t = 35; t < ch.length - 15; t += 7.5) {
    if (spanAt(t, ch.gaps)) continue;
    const lane = spanAt(t, ch.poles) ? (Math.round(t / 7.5) % 2 ? 0.6 : -0.6) : Math.sin(t * 0.035) * 2.4;
    out.push({ s: t, lane, id: out.length });
  }
  return out;
}
/** Original `HE`: bank an orb (score, Glider charge, every fifth a combo award). */
export function collectOrb(state: SimState, orb: Orb, ch: Chapter): void {
  state.collected.add(orb.id); state.orbs++;
  state.score += 25 + Math.min(state.combo, 10) * 3;
  gainGlider(state, "orb", ch);
  if (state.orbs % 5 === 0) award(state, 50);
}
export interface WorldLayout { obstacles: Obstacle[]; orbs: Orb[] }
const worldCache = new WeakMap<Chapter, WorldLayout>();
export function worldLayout(ch: Chapter): WorldLayout {
  let w = worldCache.get(ch);
  if (!w) worldCache.set(ch, (w = { obstacles: layoutObstacles(ch, 0), orbs: layoutOrbs(ch) }));
  return w;
}

const PROTECTED_KINDS = new Set(["obstacle", "boulder", "bite", "swipe"]);
/** Original `mp`: is this hit shrugged off (janken, glider call/ride, post-glider grace)? */
function shrugsOff(state: SimState, kind: string): boolean {
  const n = state.glider;
  return state.janken || n.call > 0 ? true : n.active ? kind !== "grab" && kind !== "bite" : PROTECTED_KINDS.has(kind) && n.grace > 0;
}
/** Original `Dp`: take a hit (or a forced respawn). Returns whether damage landed. */
export function damage(state: SimState, force = false, kind = "hit"): boolean {
  if (!force && (state.invincible > 0 || shrugsOff(state, kind))) return false;
  state.hearts--; state.hits++; state.combo = 0; state.comboTimer = 0; state.invincible = 2.5; state.flow = 0; state.boostTimer = 0;
  state.launchQueued = false; state.aerialUsed = false; state.trickTimer = 0;
  if (force) {
    state.s = state.checkpoint; state.lane = 0; state.speed = 0; state.jump = 0; state.jumpVelocity = 0; state.pole = null; state.poleTimer = 0; state.staffRecall = 0;
    Object.assign(state.glider, { call: 0, active: false, rescue: false, time: 0, end: null, grace: 0 });
    state.janken = null;
  }
  if (state.hearts <= 0) state.dead = true;
  return true;
}

/**
 * Original `VE`: obstacle crash / clean-pass and orb pickup, run after `Sp` each frame. Not ported: the orb magnet while on the Glider
 * (`UE`/`GE`), creature and boulder encounters (`FT.update` and its `PE` events).
 */
export function worldPass(state: SimState, ch: Chapter, world: WorldLayout = worldLayout(ch)): string[] {
  const ev: string[] = [];
  for (const o of world.obstacles) {
    if (state.crashed.has(o.id) || Math.abs(state.s - o.s) > 1.2) continue;
    const reach = o.type === "log" ? 2.15 : 1.3;
    if (Math.abs(state.lane - o.lane) < reach && state.jump < 1.3) {
      state.crashed.add(o.id);
      if (damage(state, false, "obstacle")) { state.stumbleTimer = 0.55; ev.push("hit"); }
    } else if (state.s >= o.s && !state.crashed.has(o.id)) {
      state.crashed.add(o.id);
      if (!state.glider.active) { award(state, 100); ev.push("obstacle-pass"); }
    }
  }
  if (!(state.glider.active || state.glider.call > 0)) {
    for (const orb of world.orbs) {
      if (state.collected.has(orb.id)) continue;
      if (Math.abs(orb.s - state.s) > 1.5 || Math.abs(state.lane - orb.lane) > 1.6 || state.jump > 1.9) continue;
      collectOrb(state, orb, ch);
      ev.push("orb");
    }
  }
  return ev;
}

/** One animation frame of the original's `playing` phase: input (already built) -> `step` -> score accrual. */
export function stepFrame(state: SimState, input: StepInput, dt: number, ch: Chapter): string[] {
  const scaled = Math.min(0.04, Math.max(1e-3, dt));
  const events = step(state, input, scaled, ch);
  if (state.stumbleTimer) state.stumbleTimer = Math.max(0, state.stumbleTimer - scaled);
  events.push(...worldPass(state, ch));
  state.score += state.speed * scaled * 0.6;
  return events;
}

/* ------------------------------------------------------------- encounter-layer helpers (additive) */

/** Original `sp`: a charged Glider catches a fall (rescue call). Returns whether it was called. */
export function rescue(state: SimState, ch: Chapter): boolean {
  const n = state.glider;
  if (n.charge < 1 || n.active || n.call > 0) return false;
  const m = gliderMap(ch);
  let i = cellOf(m, state.s + 4);
  while (i < m.n - 1 && !m.land[i]) i++;
  const a = m.fly[i] ? -1 : (m.last[(m.next[i] as number) - 1] as number);
  Object.assign(n, { charge: 0, bank: 0, ready: false, call: GLIDER.rescueCall, rescue: true, from: i * CELL, end: Math.max(i, a) * CELL });
  n.rescues++;
  state.falls = Math.max(0, state.falls - 1);
  return true;
}

/** Original `fp`: a bite knocks the rider off the Glider when it lands over a safe stretch. Returns whether it did. */
export function knockOff(state: SimState, ch: Chapter): boolean {
  const n = state.glider, m = gliderMap(ch);
  if (!n.active || state.jump > rideHeight(state, ch) + 1.1 || !m.safe[cellOf(m, state.s)]) return false;
  Object.assign(n, { active: false, time: 0, end: null, rescue: false, from: 0, grace: GLIDER.grace, charge: 0 });
  state.jumpVelocity = 3; state.aerialUsed = false; state.combo = 0; state.comboTimer = 0;
  return true;
}

/** Original `Zf`/`gp` reads and `yp` (the Janken beat clock) as used by the encounter layer. */
export const JANKEN = { late: 7, ken: 0.36, hit: 0.74, impact: 0.1, end: 1.2, hands: ["guu", "paa", "choki"] } as const;
export function startJanken(state: SimState, creature: Creature, kind: string): string[] {
  state.janken = { step: "jan", t: 0, creature, kind, hand: JANKEN.hands[state.jankens % JANKEN.hands.length] as string };
  state.jankens++;
  return ["jan"];
}
export function tickJanken(state: SimState, dt: number): { events: string[]; scale: number } {
  const j = state.janken;
  if (!j) return { events: [], scale: 1 };
  const events: string[] = [], before = j.t;
  j.t += dt;
  if (before < JANKEN.ken && j.t >= JANKEN.ken) { j.step = "ken"; events.push("ken"); }
  if (before < JANKEN.hit && j.t >= JANKEN.hit) { j.step = j.hand as string; events.push(j.hand as string, "janken-hit"); }
  if (j.t >= JANKEN.end) { state.janken = null; return { events, scale: 1 }; }
  const a = JANKEN.hit + JANKEN.impact;
  return { events, scale: j.t < JANKEN.hit ? 0.06 : j.t < a ? 1e-4 : 0.15 + 0.85 * smooth(a, JANKEN.end, j.t) };
}
/** Original `gp`: distance to the nearest live creature attack ahead (99 when none). */
export function threatDistance(state: SimState, ch: Chapter): number { return nextThreat(state, ch); }
/** Original `_p`: no set piece (gap, pole, wall, boulder) near enough to make a Janken duel unfair. */
export function jankenAllowed(state: SimState, ch: Chapter): boolean {
  const s = state.s;
  return !ch.gaps.some((g) => g.end > s - 2 && g.start < s + 18) && !ch.poles.some((p) => s > p.start - 50 && s < p.end + 4) &&
    !ch.walls.some((w) => s > w.start - 20 && s < w.end + 20) && !ch.boulders.some((b) => b.s > s - 3 && b.s < s + 22);
}
