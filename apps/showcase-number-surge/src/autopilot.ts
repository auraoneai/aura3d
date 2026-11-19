/**
 * Number Surge autopilot (`?autoplay=1` / `?autopilot=1` / `?autostart=1`, attract mode and the browser spec):
 * evaluate both ops of the next unresolved gate row and steer to the lane whose result is better for the current
 * number; in autoplay mode also swing through a power-up that lies before the next gate row, and hold the results
 * screen for a few seconds before restarting. Deterministic; reads the sim only and drives it through `Input`.
 */
import { CONFIG, IDLE, applyOp, type Input, type NumberSurgeSim } from "./sim";

export interface AutopilotParams {
  /** Maximum steering delta per step (world units). */
  maxDx: number;
  /** When true, steers to the worse gate so browser specs can drive the wall-fail -> gameOver path. */
  reckless?: boolean;
  /** Steer through a power-up that sits before the next gate row when there is time to get back to the gate. */
  collectPowerups?: boolean;
  /** Fixed steps to hold the results screen before restarting (0 = restart on the first game-over step). */
  restartHoldSteps?: number;
}

export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 0.35 };

/** Seconds the results screen stays up in autoplay before the next run starts. */
export const AUTOPLAY_RESULTS_SECONDS = 3;

/** `?autoplay=1`: the default gate policy plus power-up pickups and a ~3 s results hold before each restart. */
export const AUTOPLAY_PILOT: AutopilotParams = {
  maxDx: 0.35,
  collectPowerups: true,
  restartHoldSteps: Math.round(AUTOPLAY_RESULTS_SECONDS / CONFIG.DT)
};

/** Seconds needed to swing from a power-up lane back to a gate lane before the row resolves. */
const POWERUP_SWING_SECONDS = 0.26;

/** The lane x the policy wants: the better-result gate of the nearest unresolved row (or worse when `reckless`). */
export function targetLane(sim: NumberSurgeSim, reckless = false, collectPowerups = false): number | null {
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
  if (collectPowerups && !reckless) {
    let pick: { x: number; z: number } | null = null;
    for (const p of o.powerups) {
      if (!p.active || p.z <= 0) continue;
      if (rowIndex >= 0 && (bestZ - p.z) / Math.max(1, o.speed) < POWERUP_SWING_SECONDS) continue;
      if (rowIndex >= 0 && p.z >= bestZ) continue;
      if (!pick || p.z < pick.z) pick = { x: p.x, z: p.z };
    }
    if (pick) return pick.x;
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
  /** Fixed steps spent on the results screen so far (autoplay restart hold). */
  private overSteps = 0;

  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}

  reset(): void {
    this.ye = 0;
    this.overSteps = 0;
  }

  /** Take over a run already in progress: start from the sim's real steering target. */
  sync(sim: NumberSurgeSim): void {
    this.ye = sim.steerTarget;
    this.overSteps = 0;
  }

  next(sim: NumberSurgeSim, stepIndex: number): Input {
    const phase = sim.o.phase;
    if (!this.params.reckless && phase === "gameOver" && stepIndex !== 0 && this.overSteps < (this.params.restartHoldSteps ?? 0)) {
      this.overSteps += 1;
      return { ...IDLE };
    }
    if (stepIndex === 0 || (!this.params.reckless && phase === "gameOver") || phase === "splash") {
      this.reset();
      return { ...IDLE, start: true };
    }
    const target = targetLane(sim, this.params.reckless === true, this.params.collectPowerups === true);
    if (target === null) return { ...IDLE };
    const dx = Math.max(-this.params.maxDx, Math.min(this.params.maxDx, target - this.ye));
    this.ye = Math.max(-CONFIG.LANE_LIMIT, Math.min(CONFIG.LANE_LIMIT, this.ye + dx));
    return { ...IDLE, dx };
  }
}
