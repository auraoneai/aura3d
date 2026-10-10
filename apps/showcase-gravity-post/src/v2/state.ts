// Run-state context — extracted from boot.ts for 14-LOC.
import { CONTRACTS, type ContractSpec } from "../gameplay/contracts";
import { createFlybyState, type FlybyState } from "../gameplay/flyby";
import { createPodRuntime, type PodRuntimeState } from "../gameplay/pod";
import type { ScoreBreakdown } from "../gameplay/scoring";
import { buildStations, type StationWorld } from "../gameplay/stations";
import type { TrajectorySample } from "../gameplay/wells";
import { SPARK_COUNT } from "./scene/world";
import type { LaunchedBy } from "./evidence";

export interface GravityCtx {
  readonly stations: StationWorld[];
  readonly pod: PodRuntimeState;
  readonly flyby: FlybyState;
  contractIndex: number;
  score: number;
  failedContracts: number;
  completedContracts: number;
  shiftOver: boolean;
  campaignComplete: boolean;
  paused: boolean;
  aiming: boolean;
  warpActive: boolean;
  frame: number;
  predictionSteps: number;
  launchPrediction: readonly TrajectorySample[];
  predictionComparedSamples: number;
  predictionMaxDivergence: number;
  launchedBy: LaunchedBy;
  lastDockHash: number | null;
  lastScoreCard: ScoreBreakdown | null;
  lastFailReason: string | null;
  lostCooldownSeconds: number;
  sparkLife: number;
  touchWarp: boolean;
  autopilotEnabled: boolean;
  autopilotFiredAt: number;
  podProxyId: string;
  dockEventCount: number;
  keyboardAimBearing: number;
  keyboardAimPower: number;
  readonly actualPath: Array<readonly [number, number]>;
  readonly sparkDirections: ReadonlyArray<readonly [number, number]>;
  readonly aimStart: { x: number; y: number };
  readonly aimCurrent: { x: number; y: number };
  readonly pendingDocks: string[];
  readonly dockEventLog: Array<{ readonly stationId: string; readonly kind: "capture" | "bounce" }>;
}

export function createGravityCtx(autopilotRequested: boolean): GravityCtx {
  const stations = buildStations();
  return {
    stations,
    pod: createPodRuntime(CONTRACTS[0]!.originStationId, CONTRACTS[0]!.tuning.strengthScale),
    flyby: createFlybyState(),
    contractIndex: 0,
    score: 0,
    failedContracts: 0,
    completedContracts: 0,
    shiftOver: false,
    campaignComplete: false,
    paused: false,
    aiming: false,
    warpActive: false,
    frame: 0,
    predictionSteps: 0,
    launchPrediction: [],
    predictionComparedSamples: 0,
    predictionMaxDivergence: 0,
    launchedBy: null,
    lastDockHash: null,
    lastScoreCard: null,
    lastFailReason: null,
    lostCooldownSeconds: 0,
    sparkLife: 0,
    touchWarp: false,
    autopilotEnabled: autopilotRequested,
    autopilotFiredAt: -1,
    podProxyId: "",
    dockEventCount: 0,
    keyboardAimBearing: 0,
    keyboardAimPower: 0.6,
    actualPath: [],
    sparkDirections: Array.from({ length: SPARK_COUNT }, (_, index) => {
      const angle = (index / SPARK_COUNT) * Math.PI * 2;
      return [Math.cos(angle), Math.sin(angle)] as const;
    }),
    aimStart: { x: 0, y: 0 },
    aimCurrent: { x: 0, y: 0 },
    pendingDocks: [],
    dockEventLog: []
  };
}

export function currentContract(ctx: GravityCtx): ContractSpec {
  return CONTRACTS[ctx.contractIndex]!;
}
