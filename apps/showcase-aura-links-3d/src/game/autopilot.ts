/**
 * autopilot.ts — shot sizing for the demo autopilot (?autoplay=1 / ?demo=1)
 * and the putter range shown to players.
 *
 * The autopilot does not guess power from a formula. It runs the same
 * `launchBall`/`stepBall` the live shot uses over a small grid of clubs,
 * powers and aim offsets, and picks the candidate that finishes closest to
 * the cup without finding water or out of bounds. Pure TypeScript, no DOM,
 * deterministic for a given input.
 */

import { CLUBS, CLUB_ORDER, launchBall, liePenalty, stepBall, suggestClub } from "./sim";
import type { BallState, ClubId, ClubSpec, HoleTerrain, LieKind, ShotEnv, Vec3, WindState } from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** shortest and longest full-power putter roll (m) */
export const PUTT_RANGE_MIN = 6;
export const PUTT_RANGE_MAX = CLUBS.putter.carry;

/**
 * Full-power roll of the putter for a putt of `cupDist` metres: about 1.6x the
 * distance, in 3 m steps, so a good putt sits near 60% on the power meter
 * instead of in the bottom tenth of it.
 */
export function puttRange(cupDist: number): number {
  return clamp(Math.ceil((Math.max(0, cupDist) * 1.6) / 3) * 3, PUTT_RANGE_MIN, PUTT_RANGE_MAX);
}

/** the club spec a shot launches with: the putter is scaled to the putt */
export function clubForShot(id: ClubId, cupDist: number): ClubSpec {
  const club = CLUBS[id];
  return club.putter ? { ...club, carry: puttRange(cupDist) } : club;
}

export interface ShotSituation {
  readonly terrain: HoleTerrain;
  readonly gravity: number;
  readonly airDensity: number;
  readonly wind: WindState;
  readonly ballPos: Vec3;
  /** lie the ball is struck from (`tee` on the first stroke) */
  readonly lie: LieKind;
}

export interface ShotPlan {
  readonly club: ClubId;
  readonly power: number;
  readonly aimYaw: number;
  /** where the simulated shot finished */
  readonly finish: { readonly pos: Vec3; readonly status: BallState["status"]; readonly cupDist: number };
}

const MAX_SIM_S = 40;
const SIM_DT = 1 / 30;

/** play one shot to its end with the live sim (the autopilot plans with no accuracy error and no spin) */
export function simulateShot(sit: ShotSituation, club: ClubSpec, power: number, aimYaw: number, accuracy = 0, spin = 0): BallState {
  const env: ShotEnv = {
    terrain: sit.terrain,
    gravity: sit.gravity,
    airDensity: sit.airDensity,
    wind: sit.wind,
    lie: sit.lie,
    liePenalty: liePenalty(sit.lie),
  };
  let ball: BallState = { ...launchBall({ club, power, accuracy, spin, aimYaw }, env), pos: sit.ballPos };
  for (let t = 0; t < MAX_SIM_S; t += SIM_DT) {
    ball = stepBall(ball, env, SIM_DT).ball;
    if (ball.status !== "flight" && ball.status !== "roll") break;
  }
  return ball;
}

const LIE_COST: Partial<Record<LieKind, number>> = { sand: 12, rough: 5, rock: 8 };

function cost(sit: ShotSituation, ball: BallState): number {
  if (ball.status === "holed") return -1;
  if (ball.status === "water" || ball.status === "oob") return 1e6;
  const d = sit.terrain.cupDistance(ball.pos[0], ball.pos[2]);
  const zone = sit.terrain.zone(ball.pos[0], ball.pos[2]);
  if (zone === "water" || zone === "oob") return 1e6;
  return d + (LIE_COST[zone] ?? 0);
}

function candidateClubs(sit: ShotSituation, dist: number): ClubId[] {
  const suggested = suggestClub(sit.lie, dist);
  if (suggested === "putter") return ["putter"];
  const i = CLUB_ORDER.indexOf(suggested);
  const out = new Set<ClubId>([suggested]);
  const longer = CLUB_ORDER[i - 1];
  const shorter = CLUB_ORDER[i + 1];
  if (longer) out.add(longer);
  if (shorter && shorter !== "putter") out.add(shorter);
  // a bump-and-run with the putter from short grass near the green
  if (dist < 30 && (sit.lie === "fairway" || sit.lie === "fringe" || sit.lie === "tee")) out.add("putter");
  return [...out];
}

/**
 * Choose club, power and aim for the autopilot. Coarse pass over clubs and
 * power along the pin line, then a fine pass over power and aim around the
 * best coarse candidate.
 */
export function planShot(sit: ShotSituation): ShotPlan {
  const t = sit.terrain;
  const bx = sit.ballPos[0];
  const bz = sit.ballPos[2];
  const dist = t.cupDistance(bx, bz);
  const pinYaw = Math.atan2(t.cup[0] - bx, t.cup[2] - bz);
  let best: { club: ClubId; power: number; aim: number; ball: BallState; c: number } | null = null;
  const consider = (id: ClubId, power: number, aim: number) => {
    const club = clubForShot(id, dist);
    const ball = simulateShot(sit, club, power, aim);
    const c = cost(sit, ball);
    if (!best || c < best.c) best = { club: id, power, aim, ball, c };
  };

  for (const id of candidateClubs(sit, dist)) {
    const step = CLUBS[id].putter ? 0.05 : 0.1;
    for (let p = step; p <= 1.0001; p += step) consider(id, Math.min(1, p), pinYaw);
  }
  const coarse = best!;
  const putt = CLUBS[coarse.club].putter === true;
  const fine = putt ? 0.0125 : 0.025;
  const span = putt ? 0.05 : 0.1;
  const aims = putt ? [0, -0.02, 0.02, -0.05, 0.05, -0.09, 0.09, -0.14, 0.14] : [0, -0.04, 0.04, -0.09, 0.09, -0.16, 0.16];
  for (const da of aims) {
    for (let p = coarse.power - span; p <= coarse.power + span + 1e-6; p += fine) {
      if (p <= 0.02 || p > 1) continue;
      consider(coarse.club, p, pinYaw + da);
    }
  }
  const b = best!;
  return {
    club: b.club,
    power: b.power,
    aimYaw: b.aim,
    finish: { pos: b.ball.pos, status: b.ball.status, cupDist: t.cupDistance(b.ball.pos[0], b.ball.pos[2]) },
  };
}
