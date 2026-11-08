/**
 * Closed-loop rhythm driver (`?autopilot=1`, attract mode and the browser spec): reads the next unresolved obstacle's
 * type and crossing time from the sim and acts at the ideal action moment. Taps hop (down then up one frame later,
 * release fires the jump); holds duck (down DUCK_FRAMES-1 steps before the ideal engage moment, release after the
 * crossing has been judged). Deterministic: no clocks, no randomness.
 */
import { APEX_T, CONFIG, IDLE, idealMoment, type BeatHopperSim, type Input, type ObstacleSlot } from "./sim";

const DT = CONFIG.DT;
/** Steps from a down edge until holdT reaches DUCK_HOLD (holdT counts the down step itself). */
export const DUCK_FRAMES = Math.ceil(CONFIG.DUCK_HOLD / DT);

export interface AutopilotParams {
  /** Obstacle ordinals (0-based, per run) the pilot deliberately skips, for death-path tests. */
  readonly mistakeObstacles: readonly number[];
}
export const DEFAULT_PARAMS: AutopilotParams = { mistakeObstacles: [] };

export function nextObstacle(sim: BeatHopperSim): ObstacleSlot | null {
  let best: ObstacleSlot | null = null;
  for (const s of sim.o.obstacles) {
    if (!s.active || s.resolved) continue;
    if (!best || s.crossTime < best.crossTime) best = s;
  }
  return best;
}

export class Autopilot {
  private resolved = 0;
  private seen = new Set<number>();
  private holding = false;
  constructor(readonly params: AutopilotParams = DEFAULT_PARAMS) {}

  get obstaclesResolved(): number {
    return this.resolved;
  }

  next(sim: BeatHopperSim, stepIndex: number): Input {
    const o = sim.o;
    if (o.phase === "splash") {
      this.holding = false;
      this.resolved = 0;
      this.seen.clear();
      return { ...IDLE, start: true };
    }
    if (o.phase !== "playing") return this.release();
    for (const s of o.obstacles) {
      if (s.resolved && !this.seen.has(s.beat)) {
        this.seen.add(s.beat);
        this.resolved++;
      }
    }
    const slot = nextObstacle(sim);
    if (!slot) return this.release();
    const ordinal = this.ordinalOf(slot);
    if (this.params.mistakeObstacles.includes(ordinal)) return this.release();
    const tNext = o.t + DT;
    const ideal = idealMoment(slot.type, slot.crossTime);
    if (slot.type === "bar") {
      // Release only after the crossing step has judged the duck.
      if (o.t + 1e-9 >= slot.crossTime) return this.release();
      // A duck kept from the previous bar is stale for this one: drop it and re-press on the grid.
      if (this.holding && o.pose === "duck" && o.duckStart < ideal - CONFIG.GOOD_WINDOW) return this.release();
      const downAt = ideal - (DUCK_FRAMES - 1) * DT;
      if (!this.holding && tNext >= downAt - DT / 2) return this.press();
      return IDLE;
    }
    // Hop: a tap whose release lands on the ideal moment (apex exactly on the crossing).
    if (this.holding) {
      if (tNext >= ideal - DT / 2) return this.release();
      return IDLE;
    }
    if (o.pose === "grounded" && tNext >= ideal - DT && tNext <= ideal + APEX_T) return this.press();
    return IDLE;
  }

  /** Ordinal of an obstacle within the run: resolved count plus unresolved obstacles ahead of it. */
  private ordinalOf(slot: ObstacleSlot): number {
    let ahead = 0;
    for (const s of this.simObstacles ?? []) {
      if (s.active && !s.resolved && s.crossTime < slot.crossTime) ahead++;
    }
    return this.resolved + ahead;
  }

  private simObstacles: readonly ObstacleSlot[] | null = null;
  observe(sim: BeatHopperSim): void {
    this.simObstacles = sim.o.obstacles;
    for (const s of sim.o.obstacles) {
      if (s.resolved && !this.seen.has(s.beat)) {
        this.seen.add(s.beat);
        this.resolved++;
      }
    }
  }

  private press(): Input {
    this.holding = true;
    return { ...IDLE, down: true };
  }
  private release(): Input {
    if (!this.holding) return IDLE;
    this.holding = false;
    return { ...IDLE, up: true };
  }
}