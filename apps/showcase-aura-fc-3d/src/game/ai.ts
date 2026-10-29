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
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, BOX_DEPTH, BOX_HALF_W, BALL_R
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
/** Score handicap on a pass back to the keeper. */
const BACKPASS_PENALTY = 6;

const ZERO: PlayerCommand = { move: [0, 0], sprint: false };

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
    // user-initiated keeper rush (hold sprint off-ball): charge the ball
    if (keeperRushHeld && p.team === state.userTeam) {
      if (ballLive) {
        const dx = b.x - p.x, dz = b.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        return { move: [dx / d, dz / d], sprint: true };
      }
    }

    // dive at a shot that will cross our line inside the frame
    if (b.mode === "flight" && b.lastShot === "shot" && Math.sign(b.vx) === -s) {
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

    // standard positioning: on the line, tracking ball Z across the goal mouth
    const hx = ownGoalX + s * 0.9;
    const hz = clamp(b.z * 0.35, -GOAL_HALF_W + 0.5, GOAL_HALF_W - 0.5);
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

  const runCycle = state.clock * 1.1 + p.anchor[0] * 0.25 + p.anchor[1] * 0.35;

  /* ------------------------------ attack ------------------------------ */
  if (weHaveBall) {
    if (owner!.id === p.id) return attackOwner(state, p, dt, difficulty, goalX, rand);

    // off-ball: shift with the attack so teammates make forward/overlapping runs
    const prog = clamp((b.x * s + PITCH_HX) / (2 * PITCH_HX), 0, 1);   // 0 own end → 1 their end
    const push = (prog - 0.12) * 18 + Math.sin(runCycle) * 3.2;
    let tx = s * clamp(p.anchor[0] + push, -PITCH_HX + 4, PITCH_HX - 4.5);
    let tz = clamp(p.anchor[1] + Math.cos(runCycle * 0.7) * 2.4, -PITCH_HZ + 2, PITCH_HZ - 2);

    if (p.role === "FW") {
      // run beyond the last defender, drifting across open lanes
      let lane = Math.sin(runCycle * 0.6) * 5.5;
      let bestOpen = -Infinity;
      for (const zc of [-6.5, 0, 6.5]) {
        let open = Infinity;
        for (const o of state.players) {
          if (o.team === p.team) continue;
          open = Math.min(open, dist(goalX - 6, zc, o.x, o.z));
        }
        if (open > bestOpen) { bestOpen = open; lane = zc + Math.sin(runCycle) * 1.8; }
      }
      tx = s * (PITCH_HX - 6.5 + Math.cos(runCycle) * 2.0);
      tz = lane;
    } else if (p.role === "MF") {
      tx = s * clamp(b.x * s + 9 + Math.sin(runCycle) * 3.2, -8, PITCH_HX - 8);
      tz = clamp(-b.z * 0.55 + Math.cos(runCycle * 0.8) * 4.0, -PITCH_HZ + 2.5, PITCH_HZ - 2.5);
    }

    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.48) return ZERO;
    return { move: [dx / d, dz / d], sprint: d > 3.2 };
  }

  /* ------------------------------ defend ------------------------------ */
  if (owner && owner.team !== p.team) {
    const o = owner;
    const pressCount = 2;

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

    // mark: actively track goal-side of the most threatening opponent and cut passing lanes
    const mark = pickMark(state, p, ownGoalX);
    if (mark) {
      const gx = ownGoalX - mark.x, gz = -mark.z;
      const gl = Math.hypot(gx, gz) || 1;
      const mx = mark.x + mark.vx * 0.45 + (gx / gl) * 2.2;
      const mz = mark.z + mark.vz * 0.45 + (gz / gl) * 1.5;
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
      const dx = b.x - p.x, dz = b.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      return { move: [dx / d, dz / d], sprint: true };
    }
    // compact the block: shift between anchor and the ball
    const tx = s * p.anchor[0] * 0.55 + b.x * 0.45 + Math.sin(runCycle) * 2.5;
    const tz = p.anchor[1] * 0.55 + b.z * 0.45 + Math.cos(runCycle) * 2.0;
    const dx = tx - p.x, dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.35) return { move: [s, 0], sprint: false };
    return { move: [dx / d, dz / d], sprint: true };
  }

  // dead / held — shift into open space
  const tx = s * p.anchor[0] + Math.sin(runCycle) * 2.0, tz = p.anchor[1] + Math.cos(runCycle) * 1.5;
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
        return {
          move: [dx / d, dz / d], sprint: false,
          pass: driven ? "driven" : "short"
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
    // a back-pass to the keeper is the last resort: he holds it a second and boots it upfield, and when he was just
    // another open lane half of all CPU passes recycled through him and matches stalled at 0-0
    const score = open * 1.3 + forward * 0.5 - Math.abs(d - 8) * 0.18 + (m.role === "FW" ? 1.4 : 0) - (m.isKeeper ? BACKPASS_PENALTY : 0);
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
