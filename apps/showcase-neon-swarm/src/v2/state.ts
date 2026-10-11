// Mutable run state — extracted from boot.ts for 14-LOC. Every field keeps
// its original initial value; modules and boot share this one object.
import type { SpawnEvent } from "../gameplay/waves";
import type { RiskPickup } from "../gameplay/pickups";
import { riskPickupForWave } from "../gameplay/pickups";

export type RunState = "booting" | "intermission" | "wave-active" | "dead" | "complete";
export const SEED_DEFAULT = 20260821;
export const COMBO_WINDOW_SECONDS = 2;
export const INTERMISSION_FIRST_SECONDS = 3.2;

export interface SwarmRunCtx {
  runState: RunState;
  seed: number;
  wave: number;
  score: number;
  kills: number;
  killsThisWave: number;
  combo: number;
  maxCombo: number;
  comboDecayRemaining: number;
  burstCharge: number;
  intermissionRemaining: number;
  waveElapsed: number;
  schedule: readonly SpawnEvent[];
  spawnedCount: number;
  chosenDoor: string | null;
  pickupActive: boolean;
  pickupPosition: RiskPickup;
  grazeAccumulator: number;
  burstFxRemaining: number;
  pulseFxRemaining: number;
  burstFxOrigin: { x: number; z: number };
  frame: number;
  mouseAim: { x: number; z: number };
  lastMoveDir: { x: number; z: number };
}

export function createSwarmRunCtx(): SwarmRunCtx {
  return {
    runState: "booting",
    seed: SEED_DEFAULT,
    wave: 0,
    score: 0,
    kills: 0,
    killsThisWave: 0,
    combo: 0,
    maxCombo: 0,
    comboDecayRemaining: 0,
    burstCharge: 0,
    intermissionRemaining: 0,
    waveElapsed: 0,
    schedule: [],
    spawnedCount: 0,
    chosenDoor: null,
    pickupActive: false,
    pickupPosition: riskPickupForWave(1),
    grazeAccumulator: 0,
    burstFxRemaining: 0,
    pulseFxRemaining: 0,
    burstFxOrigin: { x: 0, z: 0 },
    frame: 0,
    mouseAim: { x: 0, z: -1 },
    lastMoveDir: { x: 0, z: -1 }
  };
}
