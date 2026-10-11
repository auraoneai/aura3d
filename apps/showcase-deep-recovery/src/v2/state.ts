// Run-state context — extracted from boot.ts for 14-LOC.
import type { SubmarineState } from "../gameplay/sub";
import { initialSubmarineState } from "../gameplay/sub";
import { initialOxygenState, type OxygenState } from "../gameplay/oxygen";
import { initialSonarState, type SonarState } from "../gameplay/sonar";
import { initialCrateSpawns, type SalvageCrate } from "../gameplay/salvage";

export type DeepPhase = "playing" | "paused" | "blackout" | "won";

export interface DeepCtx {
  phase: DeepPhase;
  subState: SubmarineState;
  oxygenState: OxygenState;
  sonarState: SonarState;
  crates: SalvageCrate[];
  bankedTotal: number;
  bankedCountTotal: number;
  grappleLatchCount: number;
  sensorEventCount: number;
  standardBanked: boolean;
  heavyBanked: boolean;
  breachCount: number;
  repairCount: number;
  lastTowDrag: number;
  surfaceCuePlayed: boolean;
  oxygenWarningCuePlayed: boolean;
  frame: number;
  missionTime: number;
  thrustBubbleClock: number;
  autopilotEnabled: boolean;
  autopilotGrappleTried: boolean;
}

export function createDeepCtx(autopilotRequested: boolean): DeepCtx {
  return {
    phase: "playing",
    subState: initialSubmarineState(),
    oxygenState: initialOxygenState(),
    sonarState: initialSonarState(),
    crates: initialCrateSpawns(),
    bankedTotal: 0,
    bankedCountTotal: 0,
    grappleLatchCount: 0,
    sensorEventCount: 0,
    standardBanked: false,
    heavyBanked: false,
    breachCount: 0,
    repairCount: 0,
    lastTowDrag: 0,
    surfaceCuePlayed: false,
    oxygenWarningCuePlayed: false,
    frame: 0,
    missionTime: 0,
    thrustBubbleClock: 0,
    autopilotEnabled: autopilotRequested,
    autopilotGrappleTried: false
  };
}
