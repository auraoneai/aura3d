/**
 * Aura Hoops 3D rules that do not need the scene: the shot meter, dead-ball possession, the take-back rule, dunk contests,
 * difficulty and tour bookkeeping, squad stats, team kits, athlete separation and the render blend for the fixed step.
 * main.ts calls these; tests/unit/aura-hoops/rules.test.ts pins them.
 */

export type TeamId = "home" | "away";
export type DiffId = "playground" | "pro" | "legend";

/* ------------------------------------------------------------------ *
 *  Shot meter                                                         *
 * ------------------------------------------------------------------ */

/** Seconds for the needle to cross the whole meter. */
export const METER_SECONDS = 0.72;
/** Releases above this are perfect: a swish read and the only window a jumping defender cannot block. */
export const PERFECT_QUALITY = 0.985;
/** Releases above this are green. */
export const GREEN_QUALITY = 0.9;

/** Needle position after `dt` seconds. It stops at 1 (a hold past the end is a late brick); it never wraps back to the start. */
export function advanceMeter(t: number, dt: number): number {
  return Math.min(1, t + dt / METER_SECONDS);
}

/** Release quality 0..1 from the needle position: 1 at the perfect mark, falling off linearly either side, 0 far early or late. */
export function meterQuality(t: number, g0: number, g1: number, perfect: number): number {
  const hw = (g1 - g0) / 2;
  const q = 1 - Math.abs(t - perfect) / Math.max(hw * 2.2, 0.001);
  return Math.max(0, Math.min(1, q));
}

export type ReleaseRead = "perfect" | "green" | "early" | "late";
/** What the player is told about a release: perfect / green, or which side of the window it missed. */
export function releaseRead(t: number, quality: number, perfect: number): ReleaseRead {
  if (quality > PERFECT_QUALITY) return "perfect";
  if (quality > GREEN_QUALITY) return "green";
  return t < perfect ? "early" : "late";
}

/** A jumping defender may block every release except a perfect one. */
export function canBlockRelease(quality: number): boolean {
  return quality <= PERFECT_QUALITY;
}

/** Seconds after the check during which Space does not open the meter (the check press must not also shoot). */
export const CHECK_SHOT_GUARD = 0.25;

/* ------------------------------------------------------------------ *
 *  Dead balls                                                         *
 * ------------------------------------------------------------------ */

export type BallStateLike = "held" | "dribbleAir" | "flight" | "pass" | "loose" | "dunk" | "parked";
export interface DeadBallInput {
  readonly state: BallStateLike;
  /** Seconds since the shot or pass left the hand (reset on every release). */
  readonly flightT: number;
  /** Seconds the ball has been loose on the floor (reset whenever it goes loose). */
  readonly looseT: number;
  readonly x: number;
  readonly z: number;
}
/** Longest a shot or pass may stay in the air, or a loose ball may roll untouched, before play stops. */
export const DEAD_BALL_SECONDS = 4;

/** True when the ball is out of play: a flight or pass that never came down, a loose ball nobody picked up, or out of bounds. */
export function isDeadBall(b: DeadBallInput): boolean {
  const out = Math.abs(b.x) > 24 || b.z < -14 || b.z > 24;
  if (out) return true;
  if (b.state === "flight" || b.state === "pass") return b.flightT > DEAD_BALL_SECONDS;
  if (b.state === "loose") return b.looseT > DEAD_BALL_SECONDS;
  return false;
}

/** Street rule: the team that did not touch the ball last checks it. */
export function deadBallPossession(lastTouch: TeamId): TeamId {
  return lastTouch === "home" ? "away" : "home";
}

/* ------------------------------------------------------------------ *
 *  Take-back                                                          *
 * ------------------------------------------------------------------ */

/** After a defensive rebound the ball must be taken past the arc (plus a small margin) before it can be shot or dunked. */
export function isCleared(x: number, z: number, rim: readonly [number, number, number], arcR: number): boolean {
  return Math.hypot(x - rim[0], z - rim[2]) > arcR + 0.4;
}

/** Where a handler who must clear dribbles to: straight out past the arc on its own side of the floor. */
export function clearTarget(x: number, z: number, rim: readonly [number, number, number], arcR: number): [number, number] {
  const dx = x - rim[0];
  const dz = z - rim[2];
  const d = Math.hypot(dx, dz);
  const ux = d > 0.2 ? dx / d : 0;
  const uz = d > 0.2 ? dz / d : 1;
  const r = arcR + 1.4;
  // keep the clear point on the playable floor in front of the rim
  return [rim[0] + ux * r * 0.85, Math.max(rim[2] + 1.5, rim[2] + uz * r)];
}

/* ------------------------------------------------------------------ *
 *  Difficulty, tour, squads                                           *
 * ------------------------------------------------------------------ */

export const TOUR_LADDER: readonly DiffId[] = ["playground", "pro", "pro", "legend", "legend"];

/** The difficulty a match runs at: the tour round's step in Street Tour, the player's own pick everywhere else. */
export function matchDifficulty(mode: string, tourRound: number, userDiff: DiffId): DiffId {
  if (mode !== "tour") return userDiff;
  return TOUR_LADDER[Math.max(0, Math.min(TOUR_LADDER.length - 1, tourRound))]!;
}

export interface TourLike { readonly active: boolean; readonly champion: boolean; readonly eliminated: boolean }
/** A tour starts fresh when none is running or the last one ended (title or elimination). */
export function tourNeedsReset(t: TourLike): boolean {
  return !t.active || t.champion || t.eliminated;
}

/** How often a CPU drive that reaches the rim goes up for a dunk instead of pulling up. */
export const CPU_DUNK_RATE: Readonly<Record<DiffId, number>> = { playground: 0.35, pro: 0.55, legend: 0.75 };

export interface SquadStats { readonly shoot: number; readonly speed: number; readonly dunk: number; readonly defense: number }
/** Aim skill for `aimError` (higher is tighter) from a squad's 1..10 shooting stat; 7 is the old fixed player value 0.06. */
export function squadAimSkill(s: SquadStats): number {
  return 0.06 + (s.shoot - 7) * 0.025;
}
/** Run speed multiplier from a squad's speed stat (7 = 1). */
export function squadSpeedScale(s: SquadStats): number {
  return 1 + (s.speed - 7) * 0.025;
}
/** Steal success multiplier from a squad's defense stat (7 = 1). */
export function squadStealScale(s: SquadStats): number {
  return 1 + (s.defense - 7) * 0.08;
}

/**
 * Chance a dunk is rejected at take-off. Only a defender within 1.2 m who is not stumbling contests. A defender already in
 * the air (timed jump) contests hardest; the dunker's dunk stat and the defender's defense stat move it either way.
 */
export function dunkRejectChance(o: { readonly defenderDistance: number; readonly defenderAirborne: boolean; readonly defenderStumbling: boolean; readonly dunk: number; readonly defense: number; readonly contestScale: number }): number {
  if (o.defenderStumbling || o.defenderDistance > 1.2) return 0;
  const base = o.defenderAirborne ? 0.5 : 0.18;
  const close = 1 - Math.max(0, o.defenderDistance - 0.5) / 0.7 * 0.4;
  const p = base * close * o.contestScale * (1 + (o.defense - o.dunk) * 0.06);
  return Math.max(0, Math.min(0.85, p));
}

/* ------------------------------------------------------------------ *
 *  Team kits                                                          *
 * ------------------------------------------------------------------ */

export interface Kit { readonly jersey: string; readonly shorts: string; readonly socks: string }
const rgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
/** Relative luminance (WCAG) of a hex colour. */
export function luminance(hex: string): number {
  const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
/** WCAG contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export const AWAY_ALT_JERSEY = "#f2f0e2";
export const HOME_ALT_JERSEY = "#22262e";

/**
 * Home and away kits from the squad colours. The away side switches to a light alternate jersey when the two primaries are
 * too close in brightness to tell apart without hue (contrast under 2:1), so the teams also differ for colour-blind players;
 * if the home primary is itself light, the home side takes the dark alternate instead.
 */
export function teamKits(home: { readonly color: string; readonly alt: string }, away: { readonly color: string; readonly alt: string }): { home: Kit; away: Kit } {
  const homeKit: Kit = { jersey: home.color, shorts: home.alt, socks: home.color };
  let awayKit: Kit = { jersey: away.color, shorts: away.alt, socks: away.color };
  if (contrastRatio(homeKit.jersey, awayKit.jersey) < 2) {
    if (contrastRatio(homeKit.jersey, AWAY_ALT_JERSEY) >= 2) awayKit = { jersey: AWAY_ALT_JERSEY, shorts: away.color, socks: AWAY_ALT_JERSEY };
    else return { home: { jersey: HOME_ALT_JERSEY, shorts: home.color, socks: HOME_ALT_JERSEY }, away: awayKit };
  }
  return { home: homeKit, away: awayKit };
}

/* ------------------------------------------------------------------ *
 *  Separation                                                         *
 * ------------------------------------------------------------------ */

export interface Body { x: number; z: number; readonly pinned?: boolean }
/** Minimum centre distance between two athletes (shoulder width). */
export const MIN_SEPARATION = 0.55;
/**
 * One pairwise push-apart pass: any two bodies closer than `min` move apart along their line of centres, half each (a pinned
 * body, for example a dunker in the air, does not move and the other takes the whole correction). Returns the pairs fixed.
 */
export function separate(bodies: readonly Body[], min = MIN_SEPARATION): number {
  let fixed = 0;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!, b = bodies[j]!;
      if (a.pinned && b.pinned) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let d = Math.hypot(dx, dz);
      if (d >= min) continue;
      if (d < 1e-6) { dx = 1; dz = 0; d = 1e-6; }
      const push = min - d;
      const ux = dx / d, uz = dz / d;
      const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5;
      const wb = 1 - wa;
      a.x -= ux * push * wa; a.z -= uz * push * wa;
      b.x += ux * push * wb; b.z += uz * push * wb;
      fixed++;
    }
  }
  return fixed;
}

/* ------------------------------------------------------------------ *
 *  Fixed step + render blend                                          *
 * ------------------------------------------------------------------ */

export const SIM_STEP = 1 / 60;
/** A drawn position more than this far from the previous step is a teleport (a check reset): draw it, do not blend through it. */
export const BLEND_SNAP = 1.5;
export interface Pose { x: number; y: number; z: number; yaw: number }
/** Draw pose between the last two simulation steps; angles take the short arc and a teleport snaps. */
export function blendPose(prev: Pose, cur: Pose, alpha: number, out: Pose = { x: 0, y: 0, z: 0, yaw: 0 }): Pose {
  const a = Math.max(0, Math.min(1, alpha));
  if (Math.hypot(cur.x - prev.x, cur.y - prev.y, cur.z - prev.z) > BLEND_SNAP) {
    out.x = cur.x; out.y = cur.y; out.z = cur.z; out.yaw = cur.yaw;
    return out;
  }
  out.x = prev.x + (cur.x - prev.x) * a;
  out.y = prev.y + (cur.y - prev.y) * a;
  out.z = prev.z + (cur.z - prev.z) * a;
  const dy = Math.atan2(Math.sin(cur.yaw - prev.yaw), Math.cos(cur.yaw - prev.yaw));
  out.yaw = prev.yaw + dy * a;
  return out;
}

/** A second LCG for cosmetic jitter (rim shake) so drawing never draws from the gameplay RNG. */
export function makeCosmeticRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) >>> 0;
    return s / 0xffffffff;
  };
}

/** Rim shake decays to exactly 0 and never goes negative. */
export function decayRimShake(v: number, dt: number): number {
  return Math.max(0, v - dt * 4);
}
