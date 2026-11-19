/**
 * Deterministic attract-mode / test driver: steer to the lane of the hole that matches the current
 * shape in the nearest unresolved wall row. With a wildcard that outlasts the row, its nearest hole is fine.
 *
 * Morph crystals: when a morph token lies before the next row, the pilot detours to its lane only if the
 * steering model (laneOffset closes `STEER_SPEED * DT` of the gap per step) proves it reaches the token AND then
 * any lane of the next row with the runner's centre deep inside the narrowest opening, so a crystal never costs
 * a gate. Off while scripted mistakes are pending (death-path tests).
 *
 * Autoplay (`restartAfterSteps`): leaves the title by itself and, after a game over, holds the results for that
 * many steps and then restarts; every input still goes through the sim's normal `Input` path.
 */
import { CONFIG, DT, IDLE, gateHalfWidth, type Input, type ShapeShiftSim, type Token, type WallRow } from "./sim";

export interface AutopilotParams {
  maxDx: number;
  /** Rows on which the pilot deliberately aims at a mismatching hole (death-path tests). */
  mistakeRows: readonly number[];
  /** Detour for a reachable morph crystal when it can never cost the next gate (default on). */
  collectMorphs?: boolean;
  /** Autoplay loop: start from the title, and restart this many steps after a game over (off when undefined). */
  restartAfterSteps?: number;
}
export const DEFAULT_AUTOPILOT: AutopilotParams = { maxDx: 14, mistakeRows: [] };
/** `?autoplay=1`: results stay up about 3 s, then the next run starts. */
export const AUTOPLAY_PILOT: AutopilotParams = { maxDx: 14, mistakeRows: [], restartAfterSteps: Math.round(3 / DT) };

/** Fraction of the steering gap left after one step (`laneOffset += gap * STEER_SPEED * DT`). */
const STEER_KEEP = 1 - Math.min(1, CONFIG.STEER_SPEED * DT);
/** After a detour the centre must end inside this fraction of the new hole's opening (its perfect band). */
const SAFE_FRACTION = CONFIG.PERFECT_FRACTION;
/** Token pickup must land well inside the reach, not on its edge. */
const SAFE_PICKUP = CONFIG.HIT_WINDOW * 0.6;

function nextRow(sim: ShapeShiftSim): WallRow | null {
  let best: WallRow | null = null;
  for (const row of sim.rows) {
    if (row.resolved || row.z > 1) continue;
    if (!best || row.z > best.z) best = row;
  }
  return best;
}

/** Steps until something at `z` (negative = ahead) reaches the runner's plane, a little pessimistic about speed-ups. */
function stepsUntil(sim: ShapeShiftSim, z: number): number {
  return Math.floor(-z / ((sim.o.speed + 0.6) * DT));
}

/** A morph crystal before `row` that the pilot can grab without risking that row, or null. */
export function safeMorphDetour(sim: ShapeShiftSim, row: WallRow): Token | null {
  const o = sim.o;
  let best: Token | null = null;
  for (const t of sim.tokens) {
    if (t.type !== "morph" || t.taken || t.z >= 0 || t.z <= row.z) continue;
    const toToken = stepsUntil(sim, t.z);
    const tokenToRow = stepsUntil(sim, row.z) - toToken - 1;
    if (toToken < 1 || tokenToRow < 1) continue;
    // Where the centre is when the crystal is judged, with the target switched to its lane now (maxDx covers any jump).
    const atPickup = t.laneX + (o.laneOffset - t.laneX) * STEER_KEEP ** toToken;
    if (Math.abs(atPickup - t.laneX) > SAFE_PICKUP) continue;
    // The morph re-rolls to one of the two other shapes: both of their holes in this row must stay reachable, with
    // the centre ending in the perfect band of that hole's opening.
    const safe = row.holes.every((h) =>
      h.shapeIndex === o.shapeIndex ||
      Math.abs(h.laneX - atPickup) * STEER_KEEP ** tokenToRow < gateHalfWidth(h.shapeIndex) * SAFE_FRACTION
    );
    if (!safe) continue;
    if (!best || t.z > best.z) best = t;
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
  const detour = params.collectMorphs !== false && params.mistakeRows.length === 0 ? safeMorphDetour(sim, row) : null;
  if (params.mistakeRows.includes(rowsPassed) && wrong && o.wildcardTimer <= 0 && !o.shieldActive) target = wrong.laneX;
  else if (detour) target = detour.laneX;
  // Wildcard: any hole fits, but only if it is still running when this row resolves (else steer for the real match).
  else if (o.wildcardTimer > (stepsUntil(sim, row.z) + 2) * DT) {
    let nearest = row.holes[0] as (typeof row.holes)[number];
    for (const h of row.holes) if (Math.abs(o.laneOffset - h.laneX) < Math.abs(o.laneOffset - nearest.laneX)) nearest = h;
    target = nearest.laneX;
  } else if (matching) target = matching.laneX;
  return Math.max(-params.maxDx, Math.min(params.maxDx, target - sim.ye));
}

export class Autopilot {
  private rows = 0;
  private readonly seen = new Set<WallRow>();
  private overSteps = 0;
  constructor(readonly params: AutopilotParams = DEFAULT_AUTOPILOT) {}
  next(sim: ShapeShiftSim, stepIndex: number): Input {
    if (stepIndex === 0) return { ...IDLE, start: true };
    const loop = this.params.restartAfterSteps;
    if (loop !== undefined) {
      if (sim.o.phase === "splash") return { ...IDLE, start: true };
      if (sim.o.phase === "gameOver") {
        if (++this.overSteps >= loop) {
          this.overSteps = 0;
          return { ...IDLE, start: true };
        }
        return { ...IDLE };
      }
      this.overSteps = 0;
    }
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
