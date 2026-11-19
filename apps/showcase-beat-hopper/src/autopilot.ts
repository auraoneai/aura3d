/**
 * Closed-loop rhythm driver (`?autopilot=1`, attract mode and the browser spec): reads the next unresolved obstacle's
 * type and crossing time from the sim and acts at the ideal action moment. Taps hop (down then up one frame later,
 * release fires the jump); holds duck (down DUCK_FRAMES-1 steps before the ideal engage moment, release after the
 * crossing has been judged). It steers with whole-lane steps: into a free lane before each wall (the orb lane when
 * there is one), towards the next orb otherwise; a deliberate mistake steers into a blocked lane and does nothing.
 * Deterministic: no clocks, no randomness.
 *
 * Autoplay (`?autoplay=1`, aliases `?autopilot=1` / `?autostart=1`, KeyO in play) uses AUTOPLAY_PARAMS: it also
 * Big-Jumps a hop row when there is room to land before the next row, and on game over it leaves the results up for
 * AUTOPLAY_RESULTS_SECONDS then presses start, so the run loops forever. Every action is an ordinary Input.
 */
import {
  APEX_T, BIG_APEX_T, CONFIG, isHop, IDLE, freeLanes, idealMoment, laneBit, LANES, type BeatHopperSim, type Input, type ObstacleSlot, type OrbSlot
} from "./sim";

const DT = CONFIG.DT;
/** Steps from a down edge until holdT reaches DUCK_HOLD (holdT counts the down step itself). */
export const DUCK_FRAMES = Math.ceil(CONFIG.DUCK_HOLD / DT);

export interface AutopilotParams {
  /** Obstacle ordinals (0-based, per run) the pilot deliberately skips, for death-path tests. */
  readonly mistakeObstacles: readonly number[];
  /** Big-Jump hop rows when the next row leaves room to land first (autoplay). */
  readonly bigJumps?: boolean;
  /** On game over, press start after this many results steps (autoplay loop); unset = stay on the results card. */
  readonly restartAfterSteps?: number;
}
export const DEFAULT_PARAMS: AutopilotParams = { mistakeObstacles: [] };

/** Results card time before autoplay restarts the run. */
export const AUTOPLAY_RESULTS_SECONDS = 3;
export const AUTOPLAY_PARAMS: AutopilotParams = {
  mistakeObstacles: [],
  bigJumps: true,
  restartAfterSteps: Math.round(AUTOPLAY_RESULTS_SECONDS / DT)
};
/** `?autoplay=1` is the canonical flag; `?autopilot=1` and `?autostart=1` are aliases for it. */
export const autoplayRequested = (flags: { readonly autoplay?: boolean; readonly autopilot?: boolean; readonly autostart?: boolean }): boolean =>
  Boolean(flags.autoplay || flags.autopilot || flags.autostart);

/** A Big Jump lands ~BIG_AIR_DURATION after take-off at cross - BIG_APEX_T; the next row needs this much lead after it. */
const BIG_LAND_AFTER_CROSS = CONFIG.BIG_AIR_DURATION - BIG_APEX_T;

export function nextObstacle(sim: BeatHopperSim): ObstacleSlot | null {
  let best: ObstacleSlot | null = null;
  for (const s of sim.o.obstacles) {
    if (!s.active || s.resolved) continue;
    if (!best || s.crossTime < best.crossTime) best = s;
  }
  return best;
}

export function nextOrb(sim: BeatHopperSim, before: number): OrbSlot | null {
  let best: OrbSlot | null = null;
  for (const s of sim.o.orbSlots) {
    if (!s.active || s.resolved || s.crossTime > before + 1e-9) continue;
    if (!best || s.crossTime < best.crossTime) best = s;
  }
  return best;
}

const nearest = (lanes: readonly number[], from: number): number =>
  lanes.reduce((a, b) => (Math.abs(b - from) < Math.abs(a - from) ? b : a), lanes[0] as number);

export class Autopilot {
  private resolved = 0;
  private seen = new Set<number>();
  private holding = false;
  private overSteps = 0;
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
    if (o.phase === "gameOver" && this.params.restartAfterSteps !== undefined) {
      if (++this.overSteps >= this.params.restartAfterSteps) {
        this.overSteps = 0;
        this.holding = false;
        this.resolved = 0;
        this.seen.clear();
        return { ...IDLE, start: true };
      }
      return this.release();
    }
    this.overSteps = 0;
    if (o.phase !== "playing") return this.release();
    for (const s of o.obstacles) {
      if (s.resolved && !this.seen.has(s.beat)) {
        this.seen.add(s.beat);
        this.resolved++;
      }
    }
    const slot = nextObstacle(sim);
    if (!slot) return this.steer(o.lane, this.release());
    const ordinal = this.ordinalOf(slot);
    if (this.params.mistakeObstacles.includes(ordinal)) {
      const blocked = LANES.filter((l) => (slot.lanes & laneBit(l)) !== 0);
      return this.steer(nearest(blocked, o.lane), this.release(), o.lane);
    }
    const target = this.targetLane(sim, slot);
    return this.steer(target, this.act(sim, slot), o.lane);
  }

  /** Lane to be in: a free lane at the next wall (prefer its orb), else the next orb's lane before the obstacle. */
  private targetLane(sim: BeatHopperSim, slot: ObstacleSlot): number {
    const o = sim.o;
    const orb = nextOrb(sim, slot.crossTime);
    if (slot.type === "wall") {
      const open = freeLanes(slot.lanes);
      if (orb && orb.beat === slot.beat && open.includes(orb.lane)) return orb.lane;
      return nearest(open, o.lane);
    }
    return orb ? orb.lane : o.lane;
  }

  private steer(target: number, input: Input, lane = target): Input {
    return target === lane ? input : { ...input, lane: Math.sign(target - lane) };
  }

  private act(sim: BeatHopperSim, slot: ObstacleSlot): Input {
    const o = sim.o;
    if (slot.type === "wall") return this.release();
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
    // Big Jump (autoplay): one boost press at the Big-Jump ideal (its apex on the crossing), when grounded and the
    // next row leaves room to land; otherwise fall through to the normal tap, which comes later (ideal > bigIdeal).
    const bigIdeal = slot.crossTime - BIG_APEX_T;
    if (this.params.bigJumps && !this.holding && o.pose === "grounded" && tNext >= bigIdeal - DT / 2 && tNext < ideal - DT && this.roomForBig(sim, slot)) {
      return { ...IDLE, boostJump: true };
    }
    // Hop: a tap whose release lands on the ideal moment (apex exactly on the crossing).
    if (this.holding) {
      if (tNext >= ideal - DT / 2) return this.release();
      return IDLE;
    }
    if (o.pose === "grounded" && tNext >= ideal - DT && tNext <= ideal + APEX_T) return this.press();
    return IDLE;
  }

  /** The row after `slot` crosses late enough that a Big Jump has landed before it needs an action. */
  private roomForBig(sim: BeatHopperSim, slot: ObstacleSlot): boolean {
    let after: ObstacleSlot | null = null;
    for (const s of sim.o.obstacles) {
      if (!s.active || s.resolved || s.crossTime <= slot.crossTime + 1e-9) continue;
      if (!after || s.crossTime < after.crossTime) after = s;
    }
    if (!after) return true;
    const gap = after.crossTime - slot.crossTime;
    // A hop row needs its tap at cross - APEX_T; a bar's duck press comes ~DUCK_HOLD + DUCK_LEAD before its crossing.
    const lead = after.type === "wall" ? 0 : isHop(after.type) ? APEX_T + 2 * DT : CONFIG.DUCK_HOLD + CONFIG.DUCK_LEAD + 2 * DT;
    return gap >= BIG_LAND_AFTER_CROSS + lead + 4 * DT;
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