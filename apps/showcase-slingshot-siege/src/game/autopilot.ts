/**
 * Slingshot Siege autoplay (`?autoplay=1`, alias `?autopilot=1`, `?demo=1`; the O key toggles it in play).
 *
 * The launcher math (draw -> pouch -> launch velocity) lives here so the route, its trajectory preview and the
 * headless autoplay test share one solver. The autopilot drives the normal input path only: it sets the draw the
 * player would drag, "releases" through the route's `fireShot`, taps the ammo power mid-flight, and on the result card
 * waits `RESULT_HOLD_S`, then Next on a clear or Try Again (`RETRIES` times) on a fail, and loops the campaign.
 *
 * Aiming (real-GPU audit 2026-11-19: the old open-loop aim failed level 1 with a raider left and moved on): before
 * every shot the autopilot searches the shot against the live sim's current state. `AimPlanner` reads every standing
 * block (pose and rotation), the decor colliders and the live raiders, then for a sweep of draws (every arc in
 * `PLAN_ARCS` x draw length, plus draws bisected onto and around each raider) marches the ball exactly as the sim's
 * integrator flies it, and models the loaded ammo's power fired at each moment of the flight (egg bomb drop, slate
 * slam, tri-split, squid pierce, fire-egg burst, with the sim's own squash radii). Draws are ranked by raiders
 * squashed, then a hard hit close to a raider, then how near the shot comes. The best draw and its power moment are
 * what it shoots. The search is time-sliced (`step(budgetMs)` per frame) so the route never stalls. Deterministic.
 */

import { SEA_Y, groundTopAt, type SiegeSim } from "./sim";
import { AMMO, type AmmoId } from "./ammo";

export type V3 = readonly [number, number, number];

/** Pouch rest (seated between the prongs). */
export const SLING_REST: V3 = [-7.4, 1.68, 0];
/** Aim pivot in the fork gap: launch direction runs pouch -> pivot. */
export const LAUNCH_PIVOT: V3 = [-7.1, 1.98, 0];
/** World launch speed per unit of draw (full draw = 12.75). */
export const PULL_POWER = 7.5;
/** Full-draw distance in world units. */
export const PULL_MAX = 1.7;
/** Extra fork-plane dip at full draw: a real slingshot pouch sags as it goes back. */
export const DRAW_SAG = 0.16;
/** The pouch never drops below the knoll collider top (0.6) + projectile radius. */
export const POUCH_FLOOR_Y = 1.0;

export interface AimSolution {
  readonly drawT: number;
  readonly pouch: readonly [number, number, number];
  readonly dir: readonly [number, number, number];
  readonly speed: number;
}

/** Pouch world pose for a draw: pulls back and dips below the fork plane. */
export function pouchAt(px: number, py: number): [number, number, number] {
  const t = Math.min(1, Math.hypot(px, py) / PULL_MAX);
  const sag = -DRAW_SAG * Math.pow(t, 1.3);
  return [SLING_REST[0] + px, Math.max(POUCH_FLOOR_Y, SLING_REST[1] + py + sag), 0];
}

/** The one launch solver: the trajectory preview, the fired shot, and the evidence beacon all read from here. */
export function solveDraw(px: number, py: number): AimSolution {
  const pouch = pouchAt(px, py);
  const drawT = Math.min(1, Math.hypot(px, py) / PULL_MAX);
  const dx = LAUNCH_PIVOT[0] - pouch[0];
  const dy = LAUNCH_PIVOT[1] - pouch[1];
  const dl = Math.hypot(dx, dy) || 1;
  return { drawT, pouch, dir: [dx / dl, dy / dl, 0], speed: drawT * PULL_MAX * PULL_POWER };
}

/** Launch velocity of a draw (z stays 0: shots fly in the lane). */
export function launchVelocity(sol: AimSolution): [number, number, number] {
  return [sol.dir[0] * sol.speed, sol.dir[1] * sol.speed, 0];
}

/** Pull angles below horizontal the planner sweeps: flat battering shots through steep drops. */
export const PLAN_ARCS: readonly number[] = [0.22, 0.36, 0.5, 0.64, 0.78, 0.92, 1.06, 1.2];
/** Draw lengths (fractions of `PULL_MAX`) swept per arc, on top of the draws bisected onto each raider. */
const PLAN_DRAWS: readonly number[] = [0.4, 0.48, 0.56, 0.64, 0.72, 0.8, 0.88, 0.94, 1];
/** Aim offsets along x from a raider for the bisected draws: a little short, on it, a little long. */
const PLAN_OFFSETS: readonly number[] = [-0.45, 0, 0.35];
/** Seconds the result card stays up before autoplay moves on. */
export const RESULT_HOLD_S = 3;
/** A shot the sim has not settled after this long is abandoned (never stuck). */
export const FLY_CAP_S = 9;
/** Failed levels are retried this many times (as the result card's Try Again would) before autoplay moves on. */
export const RETRIES = 1;

/** Bisect the draw (at pull angle `phi`) whose arc lands on `target` (x, y), under gravity `g`. */
export function drawFor(target: readonly [number, number], g: number, phi: number): [number, number] {
  const land = (len: number): number => {
    const s = solveDraw(-Math.cos(phi) * len, -Math.sin(phi) * len);
    const vx = s.dir[0] * s.speed;
    const vy = s.dir[1] * s.speed;
    const t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * (s.pouch[1] - target[1])))) / g;
    return s.pouch[0] + vx * t;
  };
  let hi = PULL_MAX;
  if (land(hi) >= target[0]) {
    let lo = 0.3;
    for (let i = 0; i < 22; i += 1) {
      const mid = (lo + hi) / 2;
      if (land(mid) < target[0]) lo = mid; else hi = mid;
    }
  }
  return [-Math.cos(phi) * hi, -Math.sin(phi) * hi];
}

// ------------------------------------------------------------ aim search --

type Q4 = readonly [number, number, number, number];
type P3 = [number, number, number];

/** A solid the search marches shots against: a fort block or a static decor box (centre, half extents, rotation). */
interface Solid { readonly c: V3; readonly h: V3; readonly q: Q4; readonly piece: boolean }
interface World {
  readonly solids: readonly Solid[];
  readonly gulls: readonly { readonly index: number; readonly p: V3 }[];
  readonly g: number;
  /** x range where fort solids live (cheap broad phase: a shot far left of it only checks the ground). */
  readonly fortX0: number;
}

/** v rotated by the inverse of unit quaternion q (world -> body frame). */
function invRotate(q: Q4, v: readonly number[]): P3 {
  const x = -q[0], y = -q[1], z = -q[2], w = q[3];
  const tx = 2 * (y * v[2]! - z * v[1]!), ty = 2 * (z * v[0]! - x * v[2]!), tz = 2 * (x * v[1]! - y * v[0]!);
  return [v[0]! + w * tx + (y * tz - z * ty), v[1]! + w * ty + (z * tx - x * tz), v[2]! + w * tz + (x * ty - y * tx)];
}
function sphereHitsBox(p: readonly number[], r: number, s: Solid): boolean {
  const l = invRotate(s.q, [p[0]! - s.c[0], p[1]! - s.c[1], p[2]! - s.c[2]]);
  const dx = Math.max(0, Math.abs(l[0]) - s.h[0]), dy = Math.max(0, Math.abs(l[1]) - s.h[1]), dz = Math.max(0, Math.abs(l[2]) - s.h[2]);
  return dx * dx + dy * dy + dz * dz < r * r;
}

const KNOLL: Solid = { c: [-7.4, 0.3, 0], h: [1.7, 0.3, 1.7], q: [0, 0, 0, 1], piece: false };
const GULL_R = 0.26;
const STEP = 1 / 60;
const SUB = 4;

interface Contact { readonly kind: "gull" | "solid" | "ground" | "gone"; readonly at: V3; readonly gull?: number; readonly t: number; readonly speed: number }
interface Flight { readonly samples: { readonly p: V3; readonly v: V3; readonly t: number }[]; readonly contact: Contact }

/**
 * March a ball the way the sim's integrator flies it (gravity, then linear damping, in 1/60 s steps with 4 sub-samples
 * for thin planks) until it touches a raider, a solid, the ground or the sea. `skipPieces` passes through that many
 * fort blocks first (the squid's pierce).
 */
function march(world: World, p0: V3, v0: V3, r: number, damping: number, maxT: number, skipPieces = 0): Flight {
  const p: P3 = [p0[0], p0[1], p0[2]];
  const v: P3 = [v0[0], v0[1], v0[2]];
  const samples: { p: V3; v: V3; t: number }[] = [];
  let pierced = 0;
  let ignore: Solid | null = null;
  const damp = 1 / (1 + STEP * damping);
  for (let t = 0; t < maxT; t += STEP) {
    v[1] -= world.g * STEP;
    v[0] *= damp; v[1] *= damp; v[2] *= damp;
    for (let k = 0; k < SUB; k += 1) {
      p[0] += (v[0] * STEP) / SUB; p[1] += (v[1] * STEP) / SUB; p[2] += (v[2] * STEP) / SUB;
      const at: V3 = [p[0], p[1], p[2]];
      const speed = Math.hypot(v[0], v[1], v[2]);
      for (const g of world.gulls) {
        if (Math.hypot(p[0] - g.p[0], p[1] - g.p[1], p[2] - g.p[2]) < r + GULL_R) return { samples, contact: { kind: "gull", at, gull: g.index, t, speed } };
      }
      const ground = groundTopAt(p[0], p[2]);
      if (ground !== null && p[1] - r < ground) return { samples, contact: { kind: "ground", at, t, speed } };
      if (p[1] < SEA_Y || p[0] > 19.75 || p[0] < -17.75 || Math.abs(p[2]) > 9.75) return { samples, contact: { kind: "gone", at, t, speed } };
      if (sphereHitsBox(p, r, KNOLL) && t > 0.1) return { samples, contact: { kind: "solid", at, t, speed } };
      if (p[0] + r < world.fortX0 && p[1] > 6) continue;
      for (const s of world.solids) {
        if (s === ignore || !sphereHitsBox(p, r, s)) continue;
        if (s.piece && pierced < skipPieces) { pierced += 1; ignore = s; continue; }
        return { samples, contact: { kind: "solid", at, t, speed } };
      }
    }
    samples.push({ p: [p[0], p[1], p[2]], v: [v[0], v[1], v[2]], t: t + STEP });
  }
  return { samples, contact: { kind: "gone", at: [p[0], p[1], p[2]], t: maxT, speed: 0 } };
}

/** Raiders a flare burst at `at` with this radius squashes (sim `flareBurst`: core = 0.45 r, raiders inside 0.9 core). */
function burstKills(world: World, at: V3, radius: number): number[] {
  const core = radius * 0.45 * 0.9;
  return world.gulls.filter((g) => Math.hypot(g.p[0] - at[0], g.p[1] - at[1], g.p[2] - at[2]) < core).map((g) => g.index);
}

export interface ShotPlan {
  readonly pull: [number, number];
  /** Sim seconds after launch to fire the ammo power (null = never; the fire-egg still bursts on contact). */
  readonly abilityT: number | null;
  /** Raiders the search expects the shot to squash. */
  readonly kills: number;
  readonly score: number;
}

/** Best outcome of one draw for this ammo: no power, or the power fired at each of a set of moments in flight. */
function evaluateDraw(world: World, ammo: AmmoId, pull: [number, number]): ShotPlan {
  const def = AMMO[ammo];
  const sol = solveDraw(pull[0], pull[1]);
  const v0 = launchVelocity(sol);
  const flight = march(world, sol.pouch, v0, def.radius, 0.015, 6);
  const nearest = (at: V3): number => Math.min(9, ...world.gulls.map((g) => Math.hypot(g.p[0] - at[0], g.p[1] - at[1], g.p[2] - at[2])));
  const base = (c: Contact): Set<number> => {
    const kills = new Set<number>();
    if (c.kind === "gull") kills.add(c.gull!);
    if (ammo === "ember" && (c.kind === "solid" || c.kind === "ground")) for (const k of burstKills(world, c.at, 3.1)) kills.add(k);
    return kills;
  };
  const rate = (kills: Set<number>, c: Contact): number =>
    // raiders first; then a hard hit close to a raider (it topples the perch), never a shot lost to the sea
    kills.size * 10_000 + (c.kind === "gone" ? -500 : 0) + (c.kind === "solid" ? Math.min(14, c.speed) * 12 : 0) - nearest(c.at) * 120;
  let best: ShotPlan = { pull, abilityT: null, kills: base(flight.contact).size, score: rate(base(flight.contact), flight.contact) };
  const consider = (abilityT: number, kills: Set<number>, c: Contact): void => {
    const score = rate(kills, c) + 1; // a planned power that matches the no-power outcome still fires (it never hurts)
    if (score > best.score) best = { pull, abilityT, kills: kills.size, score };
  };
  for (let i = 0; i < flight.samples.length; i += 3) {
    const { p, v, t } = flight.samples[i]!;
    if (p[0] < -3) continue;
    switch (ammo) {
      case "ember": {
        const kills = new Set(burstKills(world, p, 4.1));
        consider(t, kills, { kind: "solid", at: p, t, speed: 0 });
        break;
      }
      case "pebble": {
        // Yolk Drop: a dense bomb drops from under the egg and pops on what it meets; the shell flies on.
        const bomb = march(world, [p[0], Math.max(0.4, p[1] - 0.35), p[2]], [v[0] * 0.3, Math.min(-7, v[1] - 6), v[2] * 0.3], 0.2, 0, 3);
        const kills = new Set(base(flight.contact));
        if (bomb.contact.kind === "gull") kills.add(bomb.contact.gull!);
        if (bomb.contact.kind !== "gone") for (const k of burstKills(world, bomb.contact.at, 2.5)) kills.add(k);
        consider(t, kills, bomb.contact.kind === "gone" ? flight.contact : bomb.contact);
        break;
      }
      case "stone": {
        const slam = march(world, p, [v[0] * 0.7, Math.min(-17, v[1] - 15), v[2] * 0.7], def.radius, 0.015, 3);
        consider(t, base(slam.contact), slam.contact);
        break;
      }
      case "triple": {
        const kills = new Set(base(flight.contact));
        let worst = flight.contact;
        for (const sgn of [-1, 1]) {
          const a = sgn * 0.24, ca = Math.cos(a), sa = Math.sin(a);
          const chick = march(world, [p[0], p[1], p[2] + sgn * 0.3], [v[0] * ca - v[1] * sa, v[0] * sa + v[1] * ca, v[2]], 0.17, 0, 4);
          for (const k of base(chick.contact)) kills.add(k);
          if (chick.contact.kind === "solid") worst = chick.contact;
        }
        consider(t, kills, worst);
        break;
      }
      case "squid": {
        const pierce = march(world, p, v, def.radius, 0.015, 4, 2);
        consider(t, base(pierce.contact), pierce.contact);
        break;
      }
    }
  }
  return best;
}

/** The draws the search tries: every arc x draw length, plus draws bisected onto (and around) each live raider. */
export function candidateDraws(sim: SiegeSim): [number, number][] {
  const g = Math.max(1, Math.abs(sim.level.gravity?.[1] ?? 9.81));
  const out: [number, number][] = [];
  for (const gm of sim.gullList()) {
    if (!gm.alive) continue;
    const at = gm.body.position;
    for (const phi of PLAN_ARCS) for (const off of PLAN_OFFSETS) out.push(drawFor([at[0]! + off, at[1]!], g, phi));
  }
  for (const phi of PLAN_ARCS) for (const k of PLAN_DRAWS) out.push([-Math.cos(phi) * PULL_MAX * k, -Math.sin(phi) * PULL_MAX * k]);
  return out.filter((d) => solveDraw(d[0], d[1]).speed > 0.5);
}

function worldOf(sim: SiegeSim): World {
  const solids: Solid[] = [];
  let fortX0 = Infinity;
  for (const p of sim.pieceList()) {
    if (!p.alive) continue;
    const pos = p.body.position;
    solids.push({ c: [pos[0]!, pos[1]!, pos[2]!], h: [p.spec.hx, p.spec.hy, p.spec.hz], q: p.body.rotation as unknown as Q4, piece: true });
    fortX0 = Math.min(fortX0, pos[0]! - Math.max(p.spec.hx, p.spec.hy, p.spec.hz) - 0.5);
  }
  for (const d of sim.decorColliders()) {
    const s = Math.sin(d.yaw / 2);
    solids.push({ c: d.center, h: d.half, q: [0, s, 0, Math.cos(d.yaw / 2)], piece: false });
    fortX0 = Math.min(fortX0, d.center[0] - Math.max(...d.half) - 0.5);
  }
  const gulls = sim.gullList().filter((g) => g.alive).map((g) => ({ index: g.index, p: [g.body.position[0]!, g.body.position[1]!, g.body.position[2]!] as V3 }));
  return { solids, gulls, g: Math.abs(sim.level.gravity?.[1] ?? 9.81), fortX0 };
}

/**
 * Time-sliced aim search over the live sim's current state (read-only): `step(budgetMs)` evaluates draws until the
 * budget is spent; `done` once all are scored; `best()` is the plan to shoot.
 */
export class AimPlanner {
  private readonly world: World;
  private readonly draws: [number, number][];
  private next = 0;
  private bestPlan: ShotPlan | null = null;
  constructor(sim: SiegeSim, private readonly ammo: AmmoId) {
    this.world = worldOf(sim);
    this.draws = candidateDraws(sim);
  }
  get done(): boolean { return this.next >= this.draws.length; }
  /** Evaluates draws until `budgetMs` has passed (at least one per call); true when the search is finished. */
  step(budgetMs = Infinity): boolean {
    const t0 = now();
    while (!this.done) {
      const plan = evaluateDraw(this.world, this.ammo, this.draws[this.next]!);
      this.next += 1;
      // Ties keep the earlier draw (raider-aimed draws come first).
      if (!this.bestPlan || plan.score > this.bestPlan.score) this.bestPlan = plan;
      // A draw that squashes every raider left cannot be beaten on what matters: stop searching.
      if (plan.kills >= this.world.gulls.length && this.world.gulls.length > 0) this.next = this.draws.length;
      if (now() - t0 >= budgetMs) break;
    }
    return this.done;
  }
  best(): ShotPlan {
    return this.bestPlan ?? { pull: [-1.3, -0.9], abilityT: null, kills: 0, score: -Infinity };
  }
}

/** Plans one shot to the end (tests and tools; the route slices the same search over frames). */
export function planShot(sim: SiegeSim, ammo: AmmoId): ShotPlan {
  const planner = new AimPlanner(sim, ammo);
  planner.step();
  return planner.best();
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

/** Route hooks: everything the autopilot does goes through the game's normal input path. */
export interface AutopilotHooks {
  canAim(): boolean;
  resultOpen(): boolean;
  /** The result card says the level was cleared. */
  resultWon(): boolean;
  shotActive(): boolean;
  abilityUsed(): boolean;
  /** The ammo loaded in the sling (null = out of shots). */
  currentAmmo(): AmmoId | null;
  /** Show the draw (the pouch pulled back by px, py), as a dragging player would. */
  setDraw(px: number, py: number): void;
  /** Release: the route's own fireShot. */
  release(): void;
  ability(): void;
  /** Load the level after the current one (wrapping), as the result card's Next would. */
  nextLevel(): void;
  /** Reload the current level, as the result card's Try Again would. */
  retryLevel(): void;
}

export type AutopilotPhase = "wait" | "plan" | "draw" | "hold" | "fly";

export interface Autopilot {
  phase: AutopilotPhase;
  t: number;
  /** Shots fired on the current level (resets on every level load). */
  shots: number;
  pull: [number, number];
  /** The plan of the shot being drawn or flown (null before the first). */
  plan: ShotPlan | null;
  /** Milliseconds of planning per tick (the route keeps a frame responsive; tests may pass Infinity). */
  planBudgetMs: number;
  tick(dt: number, sim: SiegeSim, hooks: AutopilotHooks): void;
  reset(): void;
}

export function createAutopilot(options: { planBudgetMs?: number } = {}): Autopilot {
  // A level load (Next, the map, R) swaps `sim.level`: the shot counter restarts with it.
  let onLevel: unknown = null;
  let planner: AimPlanner | null = null;
  let retriesLeft = RETRIES;
  let retryOf: unknown = null;
  /** Seconds the current result card has been up (-1 = no card). */
  let resultT = -1;
  const ap: Autopilot = {
    phase: "wait",
    t: 0,
    shots: 0,
    pull: [-1.3, -0.9],
    plan: null,
    planBudgetMs: options.planBudgetMs ?? 8,
    reset() { ap.phase = "wait"; ap.t = 0; ap.shots = 0; planner = null; },
    tick(dt, sim, hooks) {
      if (sim.level !== onLevel) { onLevel = sim.level; ap.shots = 0; planner = null; if (ap.phase !== "wait") { ap.phase = "wait"; ap.t = 0; } }
      ap.t += dt;
      if (hooks.resultOpen()) {
        // The result card stays up `RESULT_HOLD_S`, then Next on a clear; a failed level is retried `RETRIES` times.
        // Its own timer: the phase timer kept running from the last shot, so the old autopilot moved on the very
        // frame the card opened (the audit saw no result card in ~7 minutes).
        resultT = resultT < 0 ? 0 : resultT + dt;
        if (resultT >= RESULT_HOLD_S) {
          resultT = -1;
          const won = hooks.resultWon();
          if (retryOf !== sim.level.id) { retryOf = sim.level.id; retriesLeft = RETRIES; }
          ap.reset();
          if (!won && retriesLeft > 0) { retriesLeft -= 1; hooks.retryLevel(); }
          else { retryOf = null; hooks.nextLevel(); }
        }
        return;
      }
      resultT = -1;
      switch (ap.phase) {
        case "wait":
          // Every raider down: no more shots, the level's clear (result card) is on its way.
          if (ap.t > 0.35 && hooks.canAim() && sim.gullsAlive() > 0) {
            const ammo = hooks.currentAmmo();
            if (!ammo) break;
            planner = new AimPlanner(sim, ammo);
            ap.phase = "plan";
            ap.t = 0;
          }
          break;
        case "plan": {
          // Think while the pouch eases back a little, so the viewer sees the computer lining up a shot.
          const k = Math.min(1, ap.t / 1.2);
          hooks.setDraw(-0.35 * k, -0.2 * k);
          if (!planner || planner.step(ap.planBudgetMs)) {
            ap.plan = planner?.best() ?? null;
            ap.pull = ap.plan ? [...ap.plan.pull] as [number, number] : [-1.3, -0.9];
            planner = null;
            ap.phase = "draw";
            ap.t = 0;
          }
          break;
        }
        case "draw": {
          // visible ~1 s draw: the pouch pulls back-and-down with the preview arc growing
          const k = Math.min(1, ap.t / 1.0);
          const ramp = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          hooks.setDraw(-0.35 + (ap.pull[0] + 0.35) * ramp, -0.2 + (ap.pull[1] + 0.2) * ramp);
          if (ap.t >= 1.0) { ap.phase = "hold"; ap.t = 0; }
          break;
        }
        case "hold": {
          // ~0.5 s hold at full draw, a tiny sway for life; the release is the exact planned draw
          const wob = 1 + Math.sin(ap.t * 9) * 0.02;
          hooks.setDraw(ap.pull[0] * wob, ap.pull[1] * wob);
          if (ap.t >= 0.5) {
            hooks.setDraw(ap.pull[0], ap.pull[1]);
            hooks.release();
            ap.phase = "fly";
            ap.t = 0;
          }
          break;
        }
        case "fly": {
          // The power fires at the planned moment of the flight (sim time since launch, so Moon Roost's slow time
          // and the last-raider slow-mo keep it on the same spot of the arc).
          const p = sim.activeProjectile();
          const at = ap.plan?.abilityT;
          if (p && at != null && hooks.shotActive() && !hooks.abilityUsed() && sim.simTime() - p.launchedAt >= at) hooks.ability();
          if ((!hooks.shotActive() && ap.t > 0.4) || ap.t > FLY_CAP_S) { ap.phase = "wait"; ap.t = 0; ap.shots += 1; }
          break;
        }
      }
    }
  };
  return ap;
}
