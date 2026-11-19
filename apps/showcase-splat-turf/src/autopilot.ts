/**
 * Deterministic closed-loop steering for attract mode and the browser specs: aim at unpainted road
 * (any lane not under solvent), grab paint cans on the way, and keep clear of eraser bots. `reckless`
 * inverts the policy (chases hazards) so specs can drive the bursting → gameOver path deterministically.
 */
import { CONFIG, IDLE, type Input, type SplatTurfSim } from "./sim";

export interface AutopilotParams {
  maxDx: number;
  reckless: boolean;
}
export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 0.5, reckless: false };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const colX = (col: number): number => col - CONFIG.LANE_LIMIT;

/** Eraser kart lateral position `t` seconds ahead (the sim's slide at ERASER_SPEED, bouncing off ±LANE_LIMIT). */
function botXAt(x: number, dir: number, t: number): number {
  const L = CONFIG.LANE_LIMIT, span = 4 * L;
  let u = (((x + L + dir * CONFIG.ERASER_SPEED * t) % span) + span) % span;
  if (u > 2 * L) u = span - u;
  return u - L;
}

export function steerDx(sim: SplatTurfSim, params: AutopilotParams = DEFAULT_AUTOPILOT): number {
  const o = sim.o;
  if (o.phase !== "playing") return 0;
  const horizon = o.distance + 30;
  const danger = [0, 0, 0, 0, 0, 0];
  const bait = [0, 0, 0, 0, 0, 0];
  for (const s of o.strips) {
    if (!s.active || s.row > horizon || s.row + CONFIG.SOLVENT_LENGTH < o.distance) continue;
    danger[s.col] = (danger[s.col] as number) + 3;
  }
  // Eraser karts: mark every lane the kart's footprint (summed with the rover's) sweeps between now and the moment
  // the footprints meet, predicting its lateral slide (bouncing off the lane limits) plus a 0.35 m margin.
  const clear = CONFIG.ROVER_HALF_WIDTH + CONFIG.ERASER_HALF_WIDTH + 0.35;
  for (const b of o.bots) {
    if (!b.active || b.hit) continue;
    const gap = b.row - CONFIG.ERASER_REACH_FRONT - CONFIG.ROVER_REACH_FRONT - o.distance;
    if (gap > 22 || b.row + CONFIG.ERASER_REACH_BACK + CONFIG.ROVER_REACH_BACK < o.distance) continue;
    const tMeet = Math.max(0, gap) / Math.max(1, o.speed);
    const tLeave = (b.row + CONFIG.ERASER_REACH_BACK + CONFIG.ROVER_REACH_BACK - o.distance) / Math.max(1, o.speed);
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
      for (let k = 0; k <= 4; k++) {
        const x = botXAt(b.x, b.dir, tMeet + ((tLeave - tMeet) * k) / 4);
        if (Math.abs(colX(c) - x) < clear) { danger[c] = (danger[c] as number) + 4; break; }
      }
    }
  }
  let nearestCan: { row: number; col: number } | null = null;
  for (const c of o.cans) {
    if (!c.active || c.row < o.distance || c.row > o.distance + 45) continue;
    if (!nearestCan || c.row < nearestCan.row) nearestCan = c;
  }
  if (nearestCan) bait[nearestCan.col] = 2;

  // Unpainted-cell preference: count fresh (unpainted) cells in the next 20 rows per column.
  const fresh = [0, 0, 0, 0, 0, 0];
  const rowStart = Math.min(CONFIG.RUN_LENGTH - 1, Math.floor(o.distance));
  const rowEnd = Math.min(CONFIG.RUN_LENGTH, rowStart + 20);
  for (let r = rowStart; r < rowEnd; r++) {
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
      if (sim.grid[r * CONFIG.GRID_COLS + c] === 0) fresh[c] = (fresh[c] as number) + 1;
    }
  }

  let bestCol = clamp(Math.floor(sim.steerTarget + CONFIG.LANE_LIMIT + 0.5), 0, CONFIG.GRID_COLS - 1);
  let bestScore = -Infinity;
  for (let c = 0; c < CONFIG.GRID_COLS; c++) {
    const d = danger[c] as number;
    const score = params.reckless
      ? d * 10 - Math.abs(colX(c) - o.laneOffset) * 0.2
      : -d * 10 + (bait[c] as number) * 3 + (fresh[c] as number) * 0.05 - Math.abs(colX(c) - o.laneOffset) * 0.3;
    if (score > bestScore) { bestScore = score; bestCol = c; }
  }
  return clamp(colX(bestCol) - sim.steerTarget, -params.maxDx, params.maxDx);
}

/** Stateful driver: start, then drag, then steer every step. */
export class TurfAutopilot {
  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}

  next(sim: SplatTurfSim, stepIndex: number): Input {
    if (stepIndex === 0 && sim.o.phase !== "playing") return { ...IDLE, start: true };
    if (stepIndex === 1) return { ...IDLE, down: true };
    return { ...IDLE, dx: steerDx(sim, this.params) };
  }
}
/** Seconds the results card stays up before autoplay starts the next run. */
export const RESULTS_HOLD_SECONDS = 3;

/**
 * `?autoplay=1` driver (also `?autopilot=1` / `?autostart=1`): the TurfAutopilot plays each run through the normal
 * `Input` path (start, then steering dx), and at gameOver / finished it holds the results for RESULTS_HOLD_SECONDS
 * of sim time, then presses start again, looping forever. Until the first run ends its inputs are exactly
 * `TurfAutopilot.next(sim, stepIndex)` with a 0-based step counter, so the first run replays the previous autopilot.
 */
export class AutoplayDriver {
  private runStep = 0;
  private hold = 0;

  constructor(readonly pilot: TurfAutopilot = new TurfAutopilot()) {}

  next(sim: SplatTurfSim): Input {
    const phase = sim.o.phase;
    if (phase === "gameOver" || phase === "finished") {
      this.hold += CONFIG.DT;
      if (this.hold < RESULTS_HOLD_SECONDS - 1e-9) return { ...IDLE };
      this.hold = 0;
      this.runStep = 0;
    } else {
      this.hold = 0;
    }
    return this.pilot.next(sim, this.runStep++);
  }
}
