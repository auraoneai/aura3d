/**
 * Patrol Wing cannon (PRD PW-07): cooldown, shot/hit accounting, accuracy.
 * Hit RESOLUTION lives in the combatWorld (drones.ts); this module owns the
 * trigger discipline and the accuracy math surfaced in evidence.
 */
import type { FlightInput } from "./flight";

export const CANNON_COOLDOWN_SECONDS = 0.15;

export interface CannonSnapshot {
  readonly cooling: boolean;
  readonly cooldownRemaining: number;
  readonly shotsFired: number;
  readonly shotsHit: number;
  readonly accuracy: number;
}

export class Cannon {
  private cooldownValue = 0;
  private shotsFiredValue = 0;
  private shotsHitValue = 0;

  resetCounters(): void {
    this.shotsFiredValue = 0;
    this.shotsHitValue = 0;
    this.cooldownValue = 0;
  }

  get shotsFired(): number {
    return this.shotsFiredValue;
  }

  get shotsHit(): number {
    return this.shotsHitValue;
  }

  get accuracy(): number {
    if (this.shotsFiredValue === 0) return 0;
    return this.shotsHitValue / this.shotsFiredValue;
  }

  /** Fire edge when Space is held/tapped; returns true when a burst starts. */
  tryFire(fireHeld: boolean, dt: number): boolean {
    this.cooldownValue = Math.max(0, this.cooldownValue - dt);
    if (!fireHeld || this.cooldownValue > 0) return false;
    this.cooldownValue = CANNON_COOLDOWN_SECONDS;
    this.shotsFiredValue += 1;
    return true;
  }

  registerHit(): void {
    this.shotsHitValue += 1;
  }

  snapshot(): CannonSnapshot {
    return {
      cooling: this.cooldownValue > 0,
      cooldownRemaining: this.cooldownValue,
      shotsFired: this.shotsFiredValue,
      shotsHit: this.shotsHitValue,
      accuracy: this.accuracy
    };
  }
}

/** Total input frame (flight bits + fire bit) used by the ghost recorder. */
export function encodeControlFrame(input: FlightInput, fire: boolean): number {
  return (
    (input.pitchUp ? 1 << 0 : 0) |
    (input.pitchDown ? 1 << 1 : 0) |
    (input.rollLeft ? 1 << 2 : 0) |
    (input.rollRight ? 1 << 3 : 0) |
    (input.yawLeft ? 1 << 4 : 0) |
    (input.yawRight ? 1 << 5 : 0) |
    (input.throttleUp ? 1 << 6 : 0) |
    (input.throttleDown ? 1 << 7 : 0) |
    (fire ? 1 << 8 : 0)
  );
}

export function decodeControlFrame(code: number): { input: FlightInput; fire: boolean } {
  return {
    fire: (code & (1 << 8)) !== 0,
    input: {
      pitchUp: (code & (1 << 0)) !== 0,
      pitchDown: (code & (1 << 1)) !== 0,
      rollLeft: (code & (1 << 2)) !== 0,
      rollRight: (code & (1 << 3)) !== 0,
      yawLeft: (code & (1 << 4)) !== 0,
      yawRight: (code & (1 << 5)) !== 0,
      throttleUp: (code & (1 << 6)) !== 0,
      throttleDown: (code & (1 << 7)) !== 0
    }
  };
}
