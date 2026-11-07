/**
 * Deterministic attract-mode / test driver: steer to the lane of the hole that matches the current
 * shape in the nearest unresolved wall row. Morph tokens are ignored unless they already sit on the
 * target path (the policy never detours for a token, so an aligned token is collected on the way).
 * With a wildcard active the nearest hole of the target row is fine.
 */
import { IDLE, type Input, type ShapeShiftSim, type WallRow } from "./sim";

export interface AutopilotParams {
  maxDx: number;
  /** Rows on which the pilot deliberately aims at a mismatching hole (death-path tests). */
  mistakeRows: readonly number[];
}
export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 14, mistakeRows: [] };

function nextRow(sim: ShapeShiftSim): WallRow | null {
  let best: WallRow | null = null;
  for (const row of sim.rows) {
    if (row.resolved || row.z > 1) continue;
    if (!best || row.z > best.z) best = row;
  }
  return best;
}

export function steerDx(sim: ShapeShiftSim, params: AutopilotParams, rowsPassed: number): number {
  const o = sim.o;
  if (o.phase !== "playing") return 0;
  const row = nextRow(sim);
  if (!row) return 0;
  let target = sim.ye;
  const matching = row.holes.find((h) => h.shapeIndex === o.shapeIndex);
  const wrong = row.holes.find((h) => h.shapeIndex !== o.shapeIndex);
  if (params.mistakeRows.includes(rowsPassed) && wrong && o.wildcardTimer <= 0 && !o.shieldActive) target = wrong.laneX;
  else if (o.wildcardTimer > 0) {
    let nearest = row.holes[0] as (typeof row.holes)[number];
    for (const h of row.holes) if (Math.abs(o.laneOffset - h.laneX) < Math.abs(o.laneOffset - nearest.laneX)) nearest = h;
    target = nearest.laneX;
  } else if (matching) target = matching.laneX;
  return Math.max(-params.maxDx, Math.min(params.maxDx, target - sim.ye));
}

export class Autopilot {
  private rows = 0;
  private readonly seen = new Set<WallRow>();
  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}
  next(sim: ShapeShiftSim, stepIndex: number): Input {
    if (stepIndex === 0) return { ...IDLE, start: true };
    return { ...IDLE, dx: steerDx(sim, this.params, this.rows) };
  }
  /** Call after each advance so mistake rows count resolved wall rows. */
  observe(sim: ShapeShiftSim): void {
    for (const row of sim.rows) {
      if (row.resolved && !this.seen.has(row)) {
        this.seen.add(row);
        this.rows++;
      }
    }
    if (this.seen.size > 256) for (const row of this.seen) if (!sim.rows.includes(row)) this.seen.delete(row);
  }
  get rowsPassed(): number {
    return this.rows;
  }
}