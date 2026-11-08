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
  for (const b of o.bots) {
    if (!b.active || b.hit || b.row < o.distance - 1 || b.row > o.distance + 14) continue;
    for (let c = 0; c < CONFIG.GRID_COLS; c++) {
      if (Math.abs(colX(c) - b.x) < 1.5) danger[c] = (danger[c] as number) + 4;
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