// Aura FC 3D — team AI.
//
// Every CPU player (and every non-controlled player when a human is in the
// match) produces the same `PlayerCommand` shape the keyboard produces, so
// one mechanics path in sim.ts drives both. The model is deliberately
// readable:
//
//   attack  — owner dribbles at goal, decides pass/shoot on a replan
//             cadence scaled by difficulty; teammates shift forward and the
//             striker makes runs in behind.
//   defend  — the closest N (difficulty-scaled) press the carrier while the
//             rest sit goal-side of a marked opponent (man-oriented block).
//   loose   — two nearest contest; everyone else holds a compacted shape.
//   keeper  — tracks the ball across the line, rushes through-balls in the
//             box (or when the user holds sprint off-ball), dives at shots.
//
// No allocation per frame: all scratch math is inlined.

import type {
  MatchState, PlayerCommand, PlayerState
} from "./types";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, BOX_DEPTH, BOX_HALF_W, BALL_R, CIRCLE_R
} from "./dims";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/** The sim passes its internal player record — we only need replanT extra. */
export interface AiPlayer extends PlayerState {
  replanT: number;
}

/** CPU shooting range (m from goal centre) = base + difficulty * diff. */
const SHOOT_RANGE_BASE = 20;
const SHOOT_RANGE_DIFF = 8;
/** Pass-lane risk (passLaneRisk) above which a receiver is not considered, and the score cost of the risk below it. */
const LANE_MAX_RISK = 0.6;
const LANE_RISK_PENALTY = 9;
/** Score handicap on a pass back to the keeper. */
const BACKPASS_PENALTY = 6;

const ZERO: PlayerCommand = { move: [0, 0], sprint: false };

/** Carrier depth (m from the goal we defend) inside which two players press instead of press + cover. */
const PRESS_TWO_DEPTH = 24;
/** How far goal-side of the carrier the covering player screens (m). */
const COVER_DIST = 5.5;
/** A defender holds at least this far goal-side of the carrier's depth (m). */
const LINE_CUSHION = 3;
/** Seconds after (re)start inside which a pass from the centre circle is the kickoff lay-off. */
const KICKOFF_LAYOFF_S = 2.5;
/** Keeper: furthest he comes off his line to narrow the angle (m). */
export const KEEPER_MAX_OFF_LINE = 1.8;

/** Where a keeper stands: on the ball↔goal-centre line, further off his line the closer the ball (narrows the angle). */
export function keeperSpot(state: MatchState, team: 0 | 1): { hx: number; hz: number } {
  const b = state.ball;
  const s = state.attackSign[team];
  const ownGoalX = -s * PITCH_HX;
  const fx = (b.x - ownGoalX) * s;                 // ball depth in front of our goal line
  const dBall = Math.hypot(fx, b.z);
  if (fx < 1.5) {
    // ball level with / behind the line (corner, byline): hug the near post
    return { hx: ownGoalX + s * 0.6, hz: clamp(b.z, -GOAL_HALF_W + 0.5, GOAL_HALF_W - 0.5) };
  }
  // off the line: 0.9 m when play is far away, rising to the max as the ball enters shooting range (6–24 m),
  // then easing back a touch on a very close ball so he is not chipped. Laterally he follows the ball↔centre line plus
  // a small near-post bias (the old 0.35 × ball z shuffle left the far post open to every cut-back)
  const near = clamp((24 - dBall) / 18, 0, 1);
  const off = 0.9 + (KEEPER_MAX_OFF_LINE - 0.9) * near * (dBall < 5 ? dBall / 5 : 1);
  const ux = fx / dBall, uz = b.z / dBall;
  return {
    hx: ownGoalX + s * Math.max(0.6, ux * off),
    hz: clamp(uz * off + b.z * 0.2, -GOAL_HALF_W + 0.5, GOAL_HALF_W - 0.5)
  };
}

/**
 * Pass-lane risk 0..1: can an opponent reach some point of the ground pass from (px,pz) to (mx,mz) before the ball does?
 * Ball time from the weighted-pass launch (sim.ts launchKick: arrive speed + rolling decel); opponent time = reaction +
 * run at sprint speed to within reach. 0 = every point is the passer's, 1 = an opponent gets there well first.
 */
export function passLaneRisk(state: MatchState, team: 0 | 1, px: number, pz: number, mx: number, mz: number, driven: boolean): number {
  const d = Math.hypot(mx - px, mz - pz);
  if (d < 0.5) return 0;
  const decel = 3.4;
  const arrive = driven ? 7.0 : 5.2;
  const v0 = clamp(Math.sqrt(arrive * arrive + 2 * decel * d), driven ? 11 : 7, driven ? 21 : 15);
  let worst = -Infinity;
  for (const f of LANE_SAMPLES) {
    const x = d * f;
    const disc = Math.max(0, v0 * v0 - 2 * decel * x);
    const tBall = (v0 - Math.sqrt(disc)) / decel + 0.12;           // + the swing before contact
    const qx = px + (mx - px) * f, qz = pz + (mz - pz) * f;
    for (const o of state.players) {
      if (o.team === team) continue;
      const reach = o.isKeeper ? 1.3 : 0.85;
      const tOpp = 0.2 + Math.max(0, Math.hypot(o.x - qx, o.z - qz) - reach) / 6.2;
      worst = Math.max(worst, tBall - tOpp);
    }
  }
  return clamp((worst + 0.15) / 0.45, 0, 1);
}
const LANE_SAMPLES = [0.15, 0.35, 0.55, 0.75, 0.9];

/** Rest-defence / shape spot: compact block behind the ball (used when their keeper has it or will collect it). */
function toShape(state: MatchState, p: AiPlayer, ownGoalX: number, s: number, ballZ: number): PlayerCommand {
  // depth from our goal: DFs hold ~13 m, MF on the halfway, FW stands off the opposing box
  const depth = p.role === "DF" ? 13 : p.role === "MF" ? PITCH_HX - 1 : 2 * PITCH_HX - (BOX_DEPTH + 6);
  const tx = ownGoalX + s * depth;
  const tz = clamp(s * p.anchor[1] * 0.8 + ballZ * 0.3, -PITCH_HZ + 3, PITCH_HZ - 3);
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return ZERO;
  return { move: [dx / d, dz / d], sprint: d > 5 };
}

export function planCommand(
  state: MatchState,
  p: AiPlayer,
  dt: number,
  keeperRushHeld: boolean,
  difficulty: number,
  rand: () => number = Math.random
): PlayerCommand {
  const b = state.ball;
  const s = state.attackSign[p.team];
  const goalX = s * PITCH_HX;              // goal we attack
  const ownGoalX = -s * PITCH_HX;          // goal we defend
  const owner = b.ownerId !== null
    ? state.players.find((q) => q.id === b.ownerId) ?? null
    : null;
  const weHaveBall = owner !== null && owner.team === p.team;
  const ballLive = b.mode === "loose" || b.mode === "flight";

  p.replanT = Math.max(0, p.replanT - dt);

  /* ------------------------------ keeper ------------------------------ */
  if (p.isKeeper) {
    // ball at his feet (a slow ball or back-pass he trapped, not a catch): play it out at once. Without this the
    // positioning branch below parked him on the line with the ball for the rest of the half (19 of 24 CPU matches
    // stalled 15-80 s, tests/unit/aura-fc-3d/stall-probe.test.ts)
    if (owner !== null && owner.id === p.id && (b.mode === "dribble" || b.mode === "controlled")) {
      const mate = bestPassLane(state, p);
      if (mate) {
        const dx = mate.x - p.x, dz = mate.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        return { move: [dx / d, dz / d], sprint: false, pass: "driven", passTo: mate.id };
      }
      return { move: [s, 0], sprint: false, shoot: 0.7, shootAim: { lateral: 0, lift: 1 } };
    }

    // user-initiated keeper rush (hold sprint off-ball): charge the ball
    if (keeperRushHeld && p.team === state.userTeam) {
      if (ballLive) {
        const dx = b.x - p.x, dz = b.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        return { move: [dx / d, dz / d], sprint: true };
      }
    }

    // dive at a shot that will cross our line inside the frame
    // (a shot that has bounced is "loose" but still a shot: a skidding strike used to roll past a keeper who ignored it)
    if ((b.mode === "flight" || b.mode === "loose") && b.lastShot === "shot" && Math.sign(b.vx) === -s) {
      const tLine = (ownGoalX - b.x) / (b.vx || -0.001);
      if (tLine > 0 && tLine < 0.75) {
        // Magnus curl shifts the intercept a touch
        const predZ = b.z + b.vz * tLine;
        const predY = Math.max(0.2, b.y + b.vy * tLine - 4.9 * tLine * tLine);
        if (Math.abs(predZ) < GOAL_HALF_W + 0.6 && predY < GOAL_H + 0.4) {
          const side = Math.abs(predZ - p.z) < 0.55 ? 0 : Math.sign(predZ - p.z);
          if (side !== 0 && p.diveT <= 0 && tLine < 0.45) {
            return { move: [0, 0], sprint: false, dive: side as -1 | 1 };
          }
          // shuffle across the face of goal to meet it
          const wantZ = clamp(predZ, -GOAL_HALF_W + 0.3, GOAL_HALF_W - 0.3);
          const dz = wantZ - p.z;
          if (Math.abs(dz) > 0.25) return { move: [0, Math.sign(dz)], sprint: true };
        }
      }
    }

    // rush loose balls dropped in the box that nobody else reaches first
    if (ballLive && Math.abs(b.x - ownGoalX) < BOX_DEPTH && Math.abs(b.z) < BOX_HALF_W) {
      let iAmClosest = true;
      // he comes only for a ball he can reach first: no team-mate well ahead of him, and no attacker either (rushing an
      // attacker's first touch left the striker's runs into the box all claimed by the keeper)
      const myD = dist(p.x, p.z, b.x, b.z);
      for (const q of state.players) {
        if (q.id === p.id || q.isKeeper) continue;
        const margin = q.team === p.team ? 1.2 : -0.6;
        if (dist(q.x, q.z, b.x, b.z) < myD - margin) { iAmClosest = false; break; }
      }
      const deep = Math.abs(b.x - ownGoalX) < BOX_DEPTH * 0.7;
      if (iAmClosest && (deep || difficulty > 0.55)) {
        const dx = b.x - p.x, dz = b.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        return { move: [dx / d, dz / d], sprint: true };
      }
    }

    // standard positioning: on the line between the ball and the centre of goal, coming off the line to narrow the
    // angle as the ball approaches (0.9 m when it is far, up to KEEPER_MAX_OFF_LINE inside shooting range)
    const { hx, hz } = keeperSpot(state, p.team);
    const dx = hx - p.x, dz = hz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) return ZERO;
    const moveScale = Math.min(1, d * 0.85);
    return { move: [(dx / d) * moveScale, (dz / d) * moveScale], sprint: d > 2.4 };
  }

  /* --------------------------- not-live phases ------------------------ */
  if (state.phase !== "live" && state.phase !== "extratime" && state.phase !== "kickoff") {
    return ZERO;
  }

  // The two ends must play alike. Players are right-footed (the dribble and every kick sit on the right boot) and the
  // weave below is a function of world position, both symmetric under the half-turn x→-x, z→-z; so every team-relative
  // z (formation anchors, run wobbles) is multiplied by the attack sign too. Mirroring only x (a reflection) made the
  // end attacking -X take ~1.7x the shots and ~3x the goals (tests/unit/aura-fc-3d/side-balance.test.ts).
  const runCycle = state.clock * 1.1 + p.anchor[0] * 0.25 + p.anchor[1] * 0.35;

  /* ------------------------------ attack ------------------------------ */
  if (weHaveBall) {
    if (owner!.id === p.id) return attackOwner(state, p, dt, difficulty, goalX, rand);

    // off-ball: shift with the attack so teammates make forward/overlapping runs
    const prog = clamp((b.x * s + PITCH_HX) / (2 * PITCH_HX), 0, 1);   // 0 own end → 1 their end
    const push = (prog - 0.12) * 18 + Math.sin(runCycle) * 3.2;
    let tx = s * clamp(p.anchor[0] + push, -PITCH_HX + 4, PITCH_HX - 4.5);
    let tz = clamp(s * (p.anchor[1] + Math.cos(runCycle * 0.7) * 2.4), -PITCH_HZ + 2, PITCH_HZ - 2);

    if (p.role === "FW") {
      // run beyond the last defender, drifting across open lanes
      let lane = s * Math.sin(runCycle * 0.6) * 5.5;
      let bestOpen = -Infinity;
      for (const zc of [-6.5, 0, 6.5]) {
        let open = Infinity;
        for (const o of state.players) {
          if (o.team === p.team) continue;
          open = Math.min(open, dist(goalX - 6, zc, o.x, o.z));
        }
        if (open > bestOpen) { bestOpen = open; lane = zc + s * Math.sin(runCycle) * 1.8; }
      }
      tx = s * (PITCH_HX - 6.5 + Math.cos(runCycle) * 2.0);
      tz = lane;
    } else if (p.role === "MF") {
      tx = s * clamp(b.x * s + 9 + Math.sin(runCycle) * 3.2, -8, PITCH_HX - 8);
      tz = clamp(-b.z * 0.55 + s * Math.cos(runCycle * 0.8) * 4.0, -PITCH_HZ + 2.5, PITCH_HZ - 2.5);
    }

    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.48) return ZERO;
    return { move: [dx / d, dz / d], sprint: d > 3.2 };
  }

  /* ------------------------------ defend ------------------------------ */
  if (owner && owner.team !== p.team) {
    const o = owner;

    // their keeper has it (held or at his feet): nobody camps on him — drop into a rest-defence shape so his
    // distribution has open lanes instead of being blocked straight back into the box for a free shot
    if (o.isKeeper) return toShape(state, p, ownGoalX, s, b.z);

    // carrier depth from the goal we defend: one presser + one screen while he is far out, two pressers once he
    // nears shooting range (a kickoff carrier is met by a press + cover, not a two-man lunge that leaves the middle)
    const carrierDepth = Math.abs(o.x - ownGoalX);
    const pressCount = carrierDepth < PRESS_TWO_DEPTH ? 2 : 1;

    // rank my team's outfielders by distance to the carrier
    let rank = 0;
    const myD = dist(p.x, p.z, o.x, o.z);
    for (const q of state.players) {
      if (q.team !== p.team || q.isKeeper || q.id === p.id) continue;
      if (dist(q.x, q.z, o.x, o.z) < myD - 0.01) rank++;
    }

    if (rank < pressCount) {
      // press: run at a point just goal-side of the carrier
      const gx = ownGoalX, gz = 0;
      const toGoalX = gx - o.x, toGoalZ = gz - o.z;
      const gl = Math.hypot(toGoalX, toGoalZ) || 1;
      const txp = o.x + (toGoalX / gl) * -0.55;   // step ahead on the ball side…
      const tzp = o.z + (toGoalZ / gl) * -0.55;
      const dx = txp - p.x, dz = tzp - p.z;
      const d = Math.hypot(dx, dz) || 1;

      const cmd: PlayerCommand = { move: [dx / d, dz / d], sprint: d > 1.8 };
      // slide when the touch gets away from them
      const ownerSpeed = Math.hypot(o.vx, o.vz);
      if (myD < 1.7 && ownerSpeed > 2.6 && p.slideCooldown <= 0 && p.stunT <= 0) {
        const chance = (0.55 + difficulty * 0.45) * dt * 6;
        if (rand() < chance) cmd.slide = true;
      }
      return cmd;
    }

    // cover: the next man screens the central lane, goal-side of the carrier, ready to step in if the press is beaten
    if (rank === pressCount && pressCount === 1) {
      const gx = ownGoalX - o.x, gz = -o.z;
      const gl = Math.hypot(gx, gz) || 1;
      const back = Math.min(COVER_DIST, Math.max(1.5, gl - BOX_DEPTH));
      const cx = o.x + (gx / gl) * back, cz = o.z * 0.6 + (gz / gl) * back * 0.4;
      const dx = cx - p.x, dz = cz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.45) return ZERO;
      return { move: [dx / d, dz / d], sprint: d > 2.4 };
    }

    // mark: actively track goal-side of the most threatening opponent and cut passing lanes
    const mark = pickMark(state, p, ownGoalX);
    if (mark) {
      const gx = ownGoalX - mark.x, gz = -mark.z;
      const gl = Math.hypot(gx, gz) || 1;
      let mx = mark.x + mark.vx * 0.45 + (gx / gl) * 2.2;
      const mz = mark.z + mark.vz * 0.45 + (gz / gl) * 1.5;
      // the back line holds: a defender never steps past the carrier's depth (minus a cushion), so a ball over the
      // top or a carrier who beats the press still meets a defender goal-side
      if (p.role === "DF") {
        const maxDepth = Math.max(BOX_DEPTH - 1, carrierDepth - LINE_CUSHION);
        if (Math.abs(mx - ownGoalX) > maxDepth) mx = ownGoalX + s * maxDepth;
      }
      const dx = mx - p.x, dz = mz - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.45) return { move: [dx / d, dz / d], sprint: d > 3.0 };
      return ZERO;
    }

    // fallback: recover toward the box
    const bx = ownGoalX + s * (BOX_DEPTH + 2);
    const dx = bx - p.x, dz = -p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.48) return ZERO;
    return { move: [dx / d, dz / d], sprint: d > 3.0 };
  }

  /* ------------------------------- loose ------------------------------ */
  if (ballLive) {
    // receiver runs to meet a pass aimed at them
    if (b.intendedTargetId === p.id) {
      const t = clamp(dist(p.x, p.z, b.x, b.z) / 9, 0, 0.9);
      const ix = b.x + b.vx * t * 0.8, iz = b.z + b.vz * t * 0.8;
      const dx = ix - p.x, dz = iz - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return { move: [dx / d, dz / d], sprint: true };
    }

    // two nearest per team contest; the rest compact at run speed
    let rank = 0;
    const myD = dist(p.x, p.z, b.x, b.z);
    for (const q of state.players) {
      if (q.team !== p.team || q.isKeeper || q.id === p.id) continue;
      if (dist(q.x, q.z, b.x, b.z) < myD - 0.01) rank++;
    }
    if (rank < 2 && b.y < 2.2) {
      // a ball running into the opposing box that their keeper will reach first is his: the chasers peel off
      // to the edge of the box (no camping on the keeper, who would otherwise distribute straight into them)
      if (Math.abs(b.x - goalX) < BOX_DEPTH + 1 && Math.abs(b.z) < BOX_HALF_W) {
        const gk = state.players.find((q) => q.isKeeper && q.team !== p.team);
        if (gk && dist(gk.x, gk.z, b.x, b.z) + 0.8 < myD) return toShape(state, p, ownGoalX, s, b.z);
      }
      const dx = b.x - p.x, dz = b.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return { move: [dx / d, dz / d], sprint: true };
    }
    // compact the block: shift between anchor and the ball
    const tx = s * p.anchor[0] * 0.55 + b.x * 0.45 + s * Math.sin(runCycle) * 2.5;
    const tz = s * (p.anchor[1] * 0.55 + Math.cos(runCycle) * 2.0) + b.z * 0.45;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) return { move: [s, 0], sprint: false };
    return { move: [dx / d, dz / d], sprint: true };
  }

  // dead / held — shift into open space
  const tx = s * (p.anchor[0] + Math.sin(runCycle) * 2.0), tz = s * (p.anchor[1] + Math.cos(runCycle) * 1.5);
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.5) return ZERO;
  return { move: [dx / d, dz / d], sprint: false };
}

/* ------------------------------------------------------------------ */
/*  On-ball decisions                                                  */
/* ------------------------------------------------------------------ */

function attackOwner(
  state: MatchState,
  p: AiPlayer,
  dt: number,
  difficulty: number,
  goalX: number,
  rand: () => number
): PlayerCommand {
  const s = state.attackSign[p.team];
  const dGoal = dist(p.x, p.z, goalX, 0);

  // find nearest pressing defender
  let nd = Infinity;
  let nz = 0;
  for (const o of state.players) {
    if (o.team === p.team) continue;
    const d = dist(o.x, o.z, p.x, p.z);
    if (d < nd) { nd = d; nz = o.z; }
  }

  if (p.replanT <= 0) {
    p.replanT = 0.14 + (1 - difficulty) * 0.24 + rand() * 0.08;

    // shoot? in range with a sight of goal
    const shootRange = SHOOT_RANGE_BASE + difficulty * SHOOT_RANGE_DIFF;
    if (dGoal < shootRange) {
      const keeper = state.players.find((q) => q.isKeeper && q.team !== p.team);
      const side = keeper ? -Math.sign(keeper.z || (rand() - 0.5)) : (rand() < 0.5 ? -1 : 1);
      const closeness = 1 - clamp(dGoal / shootRange, 0, 1);
      const want = 0.45 + closeness * 0.35;
      if (rand() < 0.55 + difficulty * 0.4) {
        return {
          move: [Math.sign(goalX - p.x) || s, 0], sprint: false,
          shoot: want,
          shootAim: { lateral: side * (0.45 + rand() * 0.5), lift: rand() * 0.5 }
        };
      }
    }

    // pass? pressed or a teammate is clearly better placed
    if (nd < 2.1 || (dGoal > 15 && rand() < 0.3)) {
      const mate = bestPassLane(state, p);
      if (mate) {
        const dx = mate.x - p.x, dz = mate.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        const driven = d > 10 || mate.role === "FW" && (mate.x - p.x) * s > 4;
        // the kickoff lay-off names its receiver: otherwise the sim re-picks from the aim cone, where the keeper (wide
        // open 28 m behind) out-scores the midfielder and the lay-off became a driven ball back to the keeper that ran
        // into the pressing striker. Open play keeps the sim's aim-cone pick (naming every receiver turned midfield
        // into 2 passes a second of pinball).
        const layOff = state.phaseT < KICKOFF_LAYOFF_S && Math.abs(p.x) < CIRCLE_R + 3 && !mate.isKeeper;
        return {
          move: [dx / d, dz / d], sprint: false,
          pass: driven && !layOff ? "driven" : "short", ...(layOff ? { passTo: mate.id } : {})
        };
      }
    }

    // skill move when a defender is square in front
    if (nd < 1.5 && rand() < 0.12 + difficulty * 0.2) {
      const side = Math.sign(p.z - nz) || 1;
      return { move: [Math.sign(goalX - p.x) || s, side * 0.7], sprint: false, skill: rand() < 0.5 ? "chop" : "stepover" };
    }
  }

  // default: dribble at goal, weaving around pressure
  const tx = goalX, tz = clamp(-p.z * 0.15 + Math.sin(p.x * 0.35) * 1.2, -GOAL_HALF_W, GOAL_HALF_W);
  const dx = tx - p.x, dz = tz - p.z;
  const d = Math.hypot(dx, dz) || 1;
  const sprint = dGoal > 12 && nd > 2.6;
  return { move: [dx / d, dz / d], sprint };
}

/** pick the best teammate to receive: open + forward + in a reasonable lane. */
function bestPassLane(state: MatchState, p: PlayerState): PlayerState | null {
  const s = state.attackSign[p.team];
  let best: PlayerState | null = null;
  let bestScore = -Infinity;
  for (const m of state.players) {
    if (m.team !== p.team || m.id === p.id) continue;
    const d = dist(m.x, m.z, p.x, p.z);
    if (d < 2 || d > 24) continue;
    let open = Infinity;
    for (const o of state.players) {
      if (o.team === p.team) continue;
      open = Math.min(open, dist(m.x, m.z, o.x, o.z));
    }
    const forward = (m.x - p.x) * s;
    // lane: an opponent who can reach the line of the pass before the ball will cut it out
    const risk = passLaneRisk(state, p.team, p.x, p.z, m.x, m.z, d > 10);
    // a lane an opponent will cut out is not an option at all (with the back line holding and a cover screening,
    // risky balls were intercepted 1 time in 3)
    if (risk > LANE_MAX_RISK) continue;
    // a back-pass to the keeper is the last resort: he holds it a second and boots it upfield, and when he was just
    // another open lane half of all CPU passes recycled through him and matches stalled at 0-0
    const score = open * 1.3 + forward * 0.5 - Math.abs(d - 8) * 0.18 + (m.role === "FW" ? 1.4 : 0) - (m.isKeeper ? BACKPASS_PENALTY : 0) - risk * LANE_RISK_PENALTY;
    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

/** most dangerous opponent for me to mark — near me and near my goal. */
function pickMark(state: MatchState, p: PlayerState, ownGoalX: number): PlayerState | null {
  let best: PlayerState | null = null;
  let bd = Infinity;
  for (const o of state.players) {
    if (o.team === p.team || o.isKeeper) continue;
    // prefer marking opponents nearer our goal / nearer us
    const dMe = dist(p.x, p.z, o.x, o.z);
    const dGoal = Math.abs(o.x - ownGoalX);
    const score = dMe + dGoal * 0.35;
    if (score < bd) { bd = score; best = o; }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  Public helpers for modes/hud                                        */
/* ------------------------------------------------------------------ */

export function describePhase(state: MatchState): string {
  switch (state.phase) {
    case "idle": return "idle";
    case "kickoff": return "kickoff";
    case "live": return state.half === 3 ? "golden goal" : `live — half ${state.half}`;
    case "extratime": return "extra time";
    case "goal": return "goal";
    case "restart": return state.restartKind ?? "restart";
    case "halftime": return "half-time";
    case "shootout": return "penalties";
    case "ended": return "full time";
    default: return state.phase;
  }
}
