/**
 * Cross Hop autoplay planner (owner, 2026-11-19: "autoplay dies often in dense traffic").
 *
 * The movers are pure functions of time (world.ts), so the planner looks ahead exactly: it replays the game's own
 * per-frame rules (hop timing, the mid-hop hit test on the lane being left and the lane being entered, the standing
 * hit test, platform carry and snapping, the screen-edge sweep and the hawk's idle timer) over a time-expanded search
 * of "wait a moment" and "hop" choices, and returns the earliest schedule that reaches the next meadow. It waits at
 * the kerb for a real gap, steps aside to a column with a better gap, rides logs and hops off before the edge, and
 * steps back when the cell it stands on is about to be hit. A first pass keeps a human-sized safety cushion and stays
 * off lit rail crossings; a second pass without them is the fallback, and a survival search the last resort.
 */
import { laneMovers, moverHalf, railWarning, type Lane } from "./world";

export type ApAction = "fwd" | "back" | "left" | "right";

export interface ApRules {
  readonly dt: number;
  readonly hopDur: number;
  readonly hitHalf: number;
  readonly midHopSwitch: number;
  readonly platformSnap: number;
  readonly fieldHalf: number;
  readonly colMin: number;
  readonly colMax: number;
  readonly hawkKill: number;
}

export interface ApNow {
  readonly time: number;
  readonly row: number;
  /** Player x in world units (column * COL_W; COL_W is 1). Already carried by a platform this frame. */
  readonly x: number;
  readonly idle: number;
}

export interface ApStep {
  /** Sim time the hop starts. */
  readonly at: number;
  readonly action: ApAction;
  /** Row and x the player stands on when the hop starts (used to detect a stale plan). */
  readonly row: number;
  readonly x: number;
}

export interface ApPlan {
  readonly steps: readonly ApStep[];
  /** True: ends on a meadow ahead. False: a survival plan (no safe route found within the horizon). */
  readonly reachesGoal: boolean;
  /** Sim time the plan ends (last landing, or the end of a survival wait). */
  readonly endsAt: number;
}

interface Pass {
  readonly cushion: number;
  readonly railCaution: boolean;
  readonly edgeMargin: number;
  readonly horizon: number;
}

/** Human-looking pass: a 0.15 m cushion on every hit test and no standing on a lit rail crossing. */
const CAREFUL: Pass = { cushion: 0.15, railCaution: true, edgeMargin: 1.6, horizon: 3.5 };
/** Exact pass: only the game's own hit sizes (plus a hair). */
const EXACT: Pass = { cushion: 0.03, railCaution: false, edgeMargin: 0.9, horizon: 5 };
/** From a meadow, plans only consider leaving the starting row within this many seconds (see `search`). */
export const DEPART_WINDOW = 0.6;
/** Node expansions per search (caps one planning call at a few milliseconds; a miss is retried a moment later). */
const EXPAND_BUDGET = 3000;
/** Frames one "wait" choice lasts. */
const WAIT_FRAMES = 3;
/** The hawk takes an idle critter at `hawkKill`; the planner never lets idle get within this of it. */
const HAWK_SLACK = 0.9;

const XS = new Float32Array(32);

/** Mover positions per lane and frame offset, shared by every pass of one planning call (the search asks for the same
 *  frame of the same lane many times). Frame k is sim time `cacheBase + k * cacheDt`. */
let moverCache = new Map<Lane, (Float32Array | undefined)[]>();
let cacheBase = 0, cacheDt = 1 / 60;
function frameTime(k: number): number { return cacheBase + k * cacheDt; }
function movers(l: Lane, k: number): Float32Array {
  let byK = moverCache.get(l);
  if (!byK) moverCache.set(l, (byK = []));
  let xs = byK[k];
  if (!xs) {
    const n = laneMovers(l, frameTime(k), XS);
    xs = byK[k] = XS.slice(0, n);
  }
  return xs;
}
function freshCache(now: ApNow, rules: ApRules): void { moverCache = new Map(); cacheBase = now.time; cacheDt = rules.dt; }

interface Node {
  readonly d: number;
  readonly row: number;
  readonly x: number;
  readonly idle: number;
  readonly parent: Node | null;
  readonly action: ApAction | null;
}

function isHazard(l: Lane): boolean {
  return l.type === "road" || l.type === "tram" || l.type === "rail";
}
function isPlatformLane(l: Lane): boolean {
  return l.type === "river" || l.type === "lava";
}

/** core.ts `platformUnder`: the first platform within its half-length + 0.25 of x, or NaN. */
function platformUnder(l: Lane, x: number, k: number): number {
  const xs = movers(l, k), h = moverHalf(l) + 0.25;
  for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]! - x) < h) return xs[i]!;
  return Number.NaN;
}

function moverHits(l: Lane, x: number, k: number, rules: ApRules, pass: Pass): boolean {
  if (!isHazard(l)) return false;
  if (pass.railCaution && l.type === "rail" && railWarning(l, frameTime(k)) > 0) return true;
  const xs = movers(l, k);
  const r = moverHalf(l) + rules.hitHalf + pass.cushion;
  for (let i = 0; i < xs.length; i++) if (Math.abs(xs[i]! - x) < r) return true;
  return false;
}

/** Frames until a hop lands, with the game's own float accumulation (`hop.t += dt / HOP_DUR`). */
function hopFrames(rules: ApRules): number[] {
  const us: number[] = [];
  let t = 0;
  for (;;) {
    t += rules.dt / rules.hopDur;
    us.push(t);
    if (t >= 1) return us;
  }
}

/**
 * Plans from a decision point (the player stands, not mid-hop). `lane` is the game's lane accessor.
 * `goalRow`: the meadow row to reach; rows explored stay within [row - 2, goalRow].
 */
export function planAutopilot(lane: (row: number) => Lane, rules: ApRules, now: ApNow, goalRow: number): ApPlan | null {
  freshCache(now, rules);
  for (const pass of [CAREFUL, EXACT]) {
    const r = search(lane, rules, now, goalRow, pass, true);
    if (r) return r;
  }
  return null;
}

/**
 * A lane with no gap the critter can stand in for the length of a hop in and out (late-game roads at top speed) has
 * no safe route at all; a human would wait a while and then go for the best-looking gap. This is that try: the plan
 * with the hit sizes shrunk by `shave` metres (it may well end in a squash, which restarts the loop).
 */
export function planGamble(lane: (row: number) => Lane, rules: ApRules, now: ApNow, goalRow: number, shave: number): ApPlan | null {
  freshCache(now, rules);
  return search(lane, rules, now, goalRow, { ...EXACT, cushion: -shave }, true);
}

/** No route to a meadow: the schedule that stays alive longest (only its first move is used before re-planning). */
export function planSurvival(lane: (row: number) => Lane, rules: ApRules, now: ApNow, goalRow: number): ApPlan {
  freshCache(now, rules);
  return search(lane, rules, now, goalRow, EXACT, false)!;
}

function search(lane: (row: number) => Lane, rules: ApRules, now: ApNow, goalRow: number, pass: Pass, wantGoal: boolean): ApPlan | null {
  const dt = rules.dt;
  // Roads, trams and rails are crossed in well under 2.5 s once a gap comes; rivers and lava need time to ride.
  let riding = false;
  for (let r = now.row; r <= goalRow; r++) if (isPlatformLane(lane(r))) riding = true;
  const H = Math.round((riding ? pass.horizon : Math.min(pass.horizon, 2.5)) / dt);
  let budget = wantGoal ? EXPAND_BUDGET : EXPAND_BUDGET * 4;
  const us = hopFrames(rules);
  const L = us.length; // landing frame offset
  const DEPART_FRAMES = Math.round(DEPART_WINDOW / dt);
  const T = (k: number): number => now.time + k * dt;
  const minRow = Math.max(0, now.row - 2);
  const buckets: Node[][] = [];
  const seen = new Set<number>();
  const key = (d: number, row: number, x: number): number => ((d * 64 + (row - minRow)) * 4096) + Math.round(x * 8) + 2048;
  const push = (n: Node): void => {
    if (n.d > H) return;
    const k = key(n.d, n.row, n.x);
    if (seen.has(k)) return;
    seen.add(k);
    (buckets[n.d] ??= []).push(n);
  };
  const edgeOk = (x: number): boolean => Math.abs(x) <= rules.fieldHalf - pass.edgeMargin;

  /** Carry at the start of frame k for a player standing at x on lane l (NaN: fell in). */
  const carry = (l: Lane, x: number, k: number): number => (isPlatformLane(l) ? platformUnder(l, x, k) : x);

  const startOnMeadow = lane(now.row).type === "meadow";
  let deepest: Node | null = null;
  const start: Node = { d: 0, row: now.row, x: now.x, idle: now.idle, parent: null, action: null };
  push(start);
  for (let d = 0; d <= H; d++) {
    const bucket = buckets[d];
    if (!bucket) continue;
    for (const n of bucket) {
      if (--budget < 0) break;
      const here = lane(n.row);
      // Waiting on the starting meadow is always safe, so a later departure is found by a later call: from a meadow
      // the search only plans departures within DEPART_WINDOW (keeps one call to a few milliseconds).
      if (startOnMeadow && n.row === now.row && n.d > DEPART_FRAMES && wantGoal) continue;
      if (!deepest || n.d > deepest.d || (n.d === deepest.d && here.type === "meadow" && lane(deepest.row).type !== "meadow")) deepest = n;
      if (wantGoal && n.row >= goalRow && here.type === "meadow" && n !== start) return toPlan(n, true, T(n.d), now, rules);
      // Hops, forward first, then toward the centre, then back.
      const inward: ApAction = n.x <= 0 ? "right" : "left";
      const outward: ApAction = inward === "right" ? "left" : "right";
      for (const action of ["fwd", inward, outward, "back"] as const) {
        const nx = tryHopFrom(lane, rules, pass, n, action, us, L, T, carry, minRow, goalRow);
        if (nx && edgeOk(nx.x)) push(nx);
      }
      // Wait WAIT_FRAMES frames: standing checks on frames d .. d+W-1, carry into frame d+W.
      let x = n.x, idle = n.idle, ok = true;
      for (let k = d; k < d + WAIT_FRAMES; k++) {
        if (k > d) {
          x = carry(here, x, k);
          if (Number.isNaN(x)) { ok = false; break; }
          if (isPlatformLane(here)) idle = 0;
        }
        idle += dt;
        if (idle > rules.hawkKill - HAWK_SLACK || moverHits(here, x, k, rules, pass) || Math.abs(x) > rules.fieldHalf) { ok = false; break; }
      }
      if (ok) {
        x = carry(here, x, d + WAIT_FRAMES);
        if (!Number.isNaN(x) && edgeOk(x)) push({ d: d + WAIT_FRAMES, row: n.row, x, idle: isPlatformLane(here) ? 0 : idle, parent: n, action: null });
      }
    }
  }
  if (wantGoal || !deepest) return null;
  return toPlan(deepest, false, T(deepest.d), now, rules);
}

function tryHopFrom(
  lane: (row: number) => Lane, rules: ApRules, pass: Pass, n: Node, action: ApAction, us: readonly number[], L: number,
  T: (k: number) => number, carry: (l: Lane, x: number, k: number) => number, minRow: number, goalRow: number
): Node | null {
  // core.ts tryHop
  let nr = n.row, nc = Math.round(n.x);
  if (action === "fwd") nr++;
  else if (action === "back") nr = Math.max(0, nr - 1);
  else if (action === "left") nc = Math.max(rules.colMin, nc - 1);
  else nc = Math.min(rules.colMax, nc + 1);
  if (nr === n.row && nc === Math.round(n.x) && action !== "fwd") {
    // A clamped side hop or a back hop on row 0 only resets the hawk timer; keep it for that.
    if (lane(n.row).type !== "meadow") return null;
  }
  if (nr < minRow || nr > goalRow) return null;
  const tl = lane(nr);
  const t0 = T(n.d);
  if (isPlatformLane(tl)) {
    const m = laneMovers(tl, t0 + rules.hopDur, XS);
    const targetX = nc;
    let under = false, bestX = targetX, bestDist = Infinity;
    for (let i = 0; i < m; i++) {
      const dd = Math.abs(XS[i]! - targetX);
      if (dd < moverHalf(tl) - 0.08) { under = true; break; }
      if (dd < bestDist && Math.abs(XS[i]!) <= rules.fieldHalf - 0.5) { bestDist = dd; bestX = XS[i]!; }
    }
    if (!under && bestDist <= rules.platformSnap) nc = bestX;
  }
  const fromX = n.x, toX = nc;
  const origin = lane(n.row);
  for (let j = 1; j < L; j++) {
    const u = us[j - 1]!;
    const l = u < rules.midHopSwitch ? origin : tl;
    if (moverHits(l, fromX + (toX - fromX) * u, n.d + j, rules, pass)) return null;
  }
  // Landing frame: platform check, then the standing test at the target x.
  const land = n.d + L;
  let x = toX;
  if (isPlatformLane(tl)) {
    x = platformUnder(tl, toX, land);
    if (Number.isNaN(x)) return null;
  }
  if (Math.abs(toX) > rules.fieldHalf || moverHits(tl, toX, land, rules, pass)) return null;
  // Next decision frame (the frame after landing), carried there.
  x = carry(tl, x, land + 1);
  if (Number.isNaN(x)) return null;
  const idle = isPlatformLane(tl) ? 0 : (L + 1) * rules.dt;
  return { d: land + 1, row: nr, x, idle, parent: n, action };
}

function toPlan(end: Node, reachesGoal: boolean, endsAt: number, now: ApNow, rules: ApRules): ApPlan {
  const steps: ApStep[] = [];
  for (let n: Node | null = end; n?.parent; n = n.parent) {
    if (n.action) steps.push({ at: now.time + n.parent.d * rules.dt, action: n.action, row: n.parent.row, x: n.parent.x });
  }
  steps.reverse();
  return { steps, reachesGoal, endsAt };
}
