/**
 * Number Surge autopilot (`?autopilot=1`, attract mode and the browser spec):
 * evaluate both ops of the next unresolved gate row and steer to the lane whose
 * result is better for the current number. Deterministic; reads the sim only.
 */
import { CONFIG, IDLE, applyOp, type Input, type NumberSurgeSim } from "./sim";

export interface AutopilotParams {
  /** Maximum steering delta per step (world units). */
  maxDx: number;
  /** When true, steers to the worse gate so browser specs can drive the wall-fail -> gameOver path. */
  reckless?: boolean;
}

export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 0.35 };

/** The lane x the policy wants: the better-result gate of the nearest unresolved row (or worse when `reckless`). */
export function targetLane(sim: NumberSurgeSim, reckless = false): number | null {
  const o = sim.o;
  if (o.phase !== "playing") return null;
  let rowIndex = -1;
  let bestZ = Number.POSITIVE_INFINITY;
  for (let i = 0; i < o.rows.length; i++) {
    const row = o.rows[i]!;
    if (!row.active || row.resolved || row.z < -0.5) continue;
    if (row.z < bestZ) {
      bestZ = row.z;
      rowIndex = i;
    }
  }
  if (rowIndex < 0) return null;
  const a = o.gates[rowIndex * 2]!;
  const b = o.gates[rowIndex * 2 + 1]!;
  const ra = applyOp(o.number, a.kind, a.n);
  const rb = applyOp(o.number, b.kind, b.n);
  if (reckless) {
    if (ra < rb) return a.x;
    if (rb < ra) return b.x;
  } else {
    if (ra > rb) return a.x;
    if (rb > ra) return b.x;
  }
  return Math.abs(o.laneOffset - a.x) <= Math.abs(o.laneOffset - b.x) ? a.x : b.x;
}

export class Autopilot {
  /** Mirrors the sim's private drag target so dx never overshoots it. */
  private ye = 0;

  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}

  reset(): void {
    this.ye = 0;
  }

  next(sim: NumberSurgeSim, stepIndex: number): Input {
    if (stepIndex === 0 || (!this.params.reckless && sim.o.phase === "gameOver") || sim.o.phase === "splash") {
      this.reset();
      return { ...IDLE, start: true };
    }
    const target = targetLane(sim, this.params.reckless === true);
    if (target === null) return { ...IDLE };
    const dx = Math.max(-this.params.maxDx, Math.min(this.params.maxDx, target - this.ye));
    this.ye = Math.max(-CONFIG.LANE_LIMIT, Math.min(CONFIG.LANE_LIMIT, this.ye + dx));
    return { ...IDLE, dx };
  }
}