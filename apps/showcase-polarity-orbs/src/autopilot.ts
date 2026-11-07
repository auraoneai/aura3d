/**
 * Deterministic attract-mode policy (PRD WP-5): flip when the next row is uniform-opposite of the current polarity,
 * then steer to the nearest matching orb. Reads only sim state; its own memory never touches the gameplay RNG.
 */
import { CONFIG, IDLE, type Input, type PolarityOrbsSim } from "./sim";

export interface AutopilotOptions {
  readonly maxDx?: number;
  /** Rows (by id) the pilot deliberately does not flip on, for death-path tests. */
  readonly mistakeRows?: readonly number[];
}

export class Autopilot {
  private readonly maxDx: number;
  private readonly mistakeRows: ReadonlySet<number>;
  private readonly flipped = new Set<number>();
  private lastTick = -1;

  constructor(options: AutopilotOptions = {}) {
    this.maxDx = options.maxDx ?? 14;
    this.mistakeRows = new Set(options.mistakeRows ?? []);
  }

  next(sim: PolarityOrbsSim, step: number): Input {
    const o = sim.o;
    if (o.phase === "splash") return { ...IDLE, start: true };
    if (o.phase === "gameOver") return step === 0 ? { ...IDLE, start: true } : IDLE;
    if (o.phase === "bursting") return IDLE;

    const row = sim.rows.find((r) => !r.resolved && r.z < 0);
    if (!row) return { ...IDLE, down: true };

    const mistake = this.mistakeRows.has(row.id);
    if (!this.flipped.has(row.id) && row.z > -20) {
      const hasMatch = sim.orbs.some((orb) => orb.active && orb.row === row.id && orb.polarity === o.polarity);
      const hasWrong = sim.orbs.some((orb) => orb.active && orb.row === row.id && orb.polarity !== o.polarity);
      const shouldFlip = mistake ? !hasWrong : row.uniform && !hasMatch && o.rainbowTimer <= 0;
      if (shouldFlip) {
        this.flipped.add(row.id);
        return { ...IDLE, down: true, tap: true };
      }
    }

    // Steer to the nearest matching orb of the next row (or wrong orb on a mistake row).
    let targetX = o.laneOffset;
    let best = Infinity;
    for (const orb of sim.orbs) {
      if (!orb.active || orb.row !== row.id) continue;
      if (mistake ? orb.polarity === o.polarity : orb.polarity !== o.polarity && o.rainbowTimer <= 0) continue;
      const d = Math.abs(orb.x - o.laneOffset);
      if (d < best) { best = d; targetX = orb.x; }
    }
    const dx = Math.max(-this.maxDx, Math.min(this.maxDx, (targetX - sim.ye) / CONFIG.DRAG_SCALE));
    return { start: false, down: true, up: false, dx, tap: false };
  }

  observe(sim: PolarityOrbsSim): void {
    // A restart rewinds the tick: drop the flip memory so the new run pilots fresh rows.
    if (sim.o.tick < this.lastTick) this.flipped.clear();
    this.lastTick = sim.o.tick;
  }
}