/**
 * Patrol Wing patrol logic (PRD PW-06 / PW-08): ordered ring validation,
 * drone wave scheduling, patrol grading, and 3-patrol escalation.
 *
 * Pure state — unit-tested directly by tests/unit/apps/patrol-wing-flight.test.ts.
 */
import { RING_COUNT, RING_GATES } from "./sky";

// ---- ring ordering / validation ----------------------------------------------

export type RingEntryResult = "advanced" | "skipped-invalid" | "restored" | "ignored";

export interface RingTrackerSnapshot {
  readonly nextRing: number;
  readonly passedCount: number;
  readonly validity: boolean;
  readonly complete: boolean;
  readonly invalidAt: number | null;
}

/**
 * Ordered ring course. Rings must be flown in order; entering ring N+1 while
 * N is unflown marks progress INVALID until N is re-flown (the PRD's skipped-
 * ring rule, surfaced as evidence `ringValidity`).
 */
export class RingTracker {
  private nextRingValue = 0;
  private validityValue = true;
  private invalidAtValue: number | null = null;

  reset(): void {
    this.nextRingValue = 0;
    this.validityValue = true;
    this.invalidAtValue = null;
  }

  get nextRing(): number {
    return this.nextRingValue;
  }

  get validity(): boolean {
    return this.validityValue;
  }

  get passedCount(): number {
    return this.nextRingValue;
  }

  get complete(): boolean {
    return this.nextRingValue >= RING_COUNT && this.validityValue;
  }

  registerEntry(index: number): RingEntryResult {
    if (index < 0 || index >= RING_COUNT) return "ignored";
    if (index < this.nextRingValue) return "ignored";
    if (index === this.nextRingValue) {
      this.nextRingValue += 1;
      // Flying the expected ring always restores validity.
      this.validityValue = true;
      this.invalidAtValue = null;
      return "advanced";
    }
    // index > nextRing: a skipped ring invalidates progress until re-flown.
    this.validityValue = false;
    this.invalidAtValue = this.nextRingValue;
    return "skipped-invalid";
  }

  snapshot(): RingTrackerSnapshot {
    return {
      nextRing: this.nextRingValue,
      passedCount: this.passedCount,
      validity: this.validityValue,
      complete: this.complete,
      invalidAt: this.invalidAtValue
    };
  }
}

// ---- waves --------------------------------------------------------------------

export const WAVES_PER_PATROL = 3;

/** Ring milestone (passedCount) that triggers each wave. */
export const WAVE_TRIGGERS: readonly number[] = [1, 3, 5];

export interface DroneSpawn {
  readonly id: string;
  readonly variant: "A" | "B";
  readonly position: readonly [number, number, number];
  readonly seed: number;
}

/**
 * A close, forward combat wedge derived from the aircraft's live authored
 * transform. This is shared by deterministic evidence and the route's wave
 * topology: targets enter the player's nose corridor at dogfight distance,
 * rather than being teleported toward a capture camera.
 */
export function interceptSpawns(
  patrol: number,
  wave: number,
  playerPosition: readonly [number, number, number],
  playerForward: readonly [number, number, number]
): readonly DroneSpawn[] {
  const count = dronesPerWave(patrol);
  const horizontalLength = Math.hypot(playerForward[0], playerForward[2]) || 1;
  const forwardX = playerForward[0] / horizontalLength;
  const forwardZ = playerForward[2] / horizontalLength;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  return Array.from({ length: count }, (_, index) => {
    const pair = Math.floor((index + 1) / 2);
    const side = index === 0 ? 0 : index % 2 === 1 ? -1 : 1;
    const forwardDistance = 5.8 + pair * 0.85;
    const lateralDistance = side * (1.75 + pair * 0.62);
    return {
      id: `drone-p${patrol}-w${wave}-${index}`,
      variant: index % 2 === 0 ? "A" as const : "B" as const,
      position: [
        playerPosition[0] + forwardX * forwardDistance + rightX * lateralDistance,
        playerPosition[1] - 0.35 + (index === 0 ? 0 : pair * 0.48),
        playerPosition[2] + forwardZ * forwardDistance + rightZ * lateralDistance
      ],
      seed: 1013 * patrol + 611 * wave + 97 * index + 7
    };
  });
}

/**
 * Deterministic course spawns. The drones occupy a compact wedge around the
 * upcoming gate, so a player following the ordered route enters the same
 * close-encounter topology used by interceptSpawns instead of discovering a
 * loose, distant orbit scattered across the island.
 */
export function waveSpawns(patrol: number, wave: number): readonly DroneSpawn[] {
  const count = dronesPerWave(patrol);
  const triggerRing = WAVE_TRIGGERS[wave] ?? RING_COUNT - 1;
  const gate = RING_GATES[Math.min(triggerRing, RING_COUNT - 1)]!;
  const spawns: DroneSpawn[] = [];
  for (let index = 0; index < count; index += 1) {
    const offsetAngle = (index / count) * Math.PI * 2;
    const pair = Math.floor((index + 1) / 2);
    const side = index === 0 ? 0 : index % 2 === 1 ? -1 : 1;
    const spread = side * (2.4 + pair * 0.7);
    spawns.push({
      id: `drone-p${patrol}-w${wave}-${index}`,
      variant: index % 2 === 0 ? "A" : "B",
      position: [
        gate.position[0] + Math.cos(offsetAngle) * spread,
        gate.position[1] + 1.1 + pair * 0.5,
        gate.position[2] + Math.sin(offsetAngle) * spread + 5.8 + pair * 0.75
      ],
      seed: 1013 * patrol + 611 * wave + 97 * index + 7
    });
  }
  return spawns;
}

export function dronesPerWave(patrol: number): number {
  return Math.min(5, 3 + (patrol - 1));
}

export function droneSpeed(patrol: number): number {
  return 9 + (patrol - 1) * 1.25;
}

/** Ring sensor half-extent shrinks per patrol (tighter gates). */
export function ringHalfExtent(patrol: number): number {
  if (patrol <= 1) return 3.0;
  if (patrol === 2) return 2.5;
  return 2.1;
}

export const PATROL_COUNT = 3;

// ---- grading ------------------------------------------------------------------

export type PatrolGrade = "A" | "B" | "C";

export interface GradeBreakdown {
  readonly timeScore: number;
  readonly accuracyScore: number;
  readonly hullScore: number;
  readonly total: number;
  readonly grade: PatrolGrade;
}

export const PATROL_PAR_SECONDS = 105;

/**
 * Patrol grade at landing: time + accuracy + hull. Total is 0..120; A >= 85,
 * B >= 60, C otherwise. Only called for complete patrols (all rings valid,
 * all waves cleared, pad touchdown).
 */
export function gradePatrol(timeSeconds: number, accuracy: number, hullFraction: number): GradeBreakdown {
  const clampedTime = Math.max(0, timeSeconds);
  const timeScore = Math.max(0, Math.min(60, (PATROL_PAR_SECONDS + 30 - clampedTime) / (PATROL_PAR_SECONDS + 30 - 60) * 60));
  const accuracyScore = Math.max(0, Math.min(1, accuracy)) * 30;
  const hullScore = Math.max(0, Math.min(1, hullFraction)) * 30;
  const total = Math.round((timeScore + accuracyScore + hullScore) * 10) / 10;
  const grade: PatrolGrade = total >= 85 ? "A" : total >= 60 ? "B" : "C";
  return {
    timeScore: Math.round(timeScore * 10) / 10,
    accuracyScore: Math.round(accuracyScore * 10) / 10,
    hullScore: Math.round(hullScore * 10) / 10,
    total,
    grade
  };
}

/** Grade rank for best-run comparison (higher is better). */
export function gradeRank(grade: PatrolGrade): number {
  return grade === "A" ? 3 : grade === "B" ? 2 : 1;
}
