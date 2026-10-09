/**
 * scenario-drive.ts — gameplay-only surface the `src/scenarios/` modules use.
 * Bound once from `main.ts` after the game exists; scenario files never reach
 * for route internals directly.
 */
export interface RooftopDrive {
  resetToHeat(heat: number): void;
  applyOutcome(outcome: "swish" | "brick", spotIndex: number, gold?: boolean): void;
  aimSpot(index: number): void;
  stagePressureHoop(spotIndex: number): void;
  stageFlight(power: number, pitch: number, frames: number): void;
  holdPaused(): void;
  cue(name: string, volume?: number): void;
  expireClock(): void;
  hideModal(): void;
  sync(): void;
}

let active: RooftopDrive | undefined;

export function bindRooftopDrive(impl: RooftopDrive): void {
  active = impl;
}

function bound(): RooftopDrive {
  if (active === undefined) {
    throw new Error("Rooftop scenario drive is not bound yet — call createGame first.");
  }
  return active;
}

export const drive: RooftopDrive = {
  resetToHeat: (heat) => bound().resetToHeat(heat),
  applyOutcome: (outcome, spotIndex, gold) => bound().applyOutcome(outcome, spotIndex, gold),
  aimSpot: (index) => bound().aimSpot(index),
  stagePressureHoop: (spotIndex) => bound().stagePressureHoop(spotIndex),
  stageFlight: (power, pitch, frames) => bound().stageFlight(power, pitch, frames),
  holdPaused: () => bound().holdPaused(),
  cue: (name, volume) => bound().cue(name, volume),
  expireClock: () => bound().expireClock(),
  hideModal: () => bound().hideModal(),
  sync: () => bound().sync()
};
