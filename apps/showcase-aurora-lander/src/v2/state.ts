// Run-state context — extracted from boot.ts for 14-LOC.
import type { Controls, LanderState } from "../gameplay/lander";
import { createLanderState } from "../gameplay/lander";
import { LANDER_MAX_HULL, type LandingGrade } from "../gameplay/touchdown";
import type { LandingPrediction } from "../gameplay/prediction";
import type { GhostSample } from "../gameplay/ghost";
import type { TerrainField } from "../gameplay/terrain";
import { SITES, type LanderSite } from "../gameplay/sites";
import type { MeshSurfaceQuery } from "@aura3d/engine";

export type Phase = "flying" | "landed" | "crashed" | "campaign-clear";

export interface AuroraCtx {
  siteIndex: number;
  phase: Phase;
  paused: boolean;
  state: LanderState;
  previousControls: Controls;
  siteScores: number[];
  campaignHull: number;
  lastGrade: LandingGrade | null;
  crashReason: string;
  ghostVisible: boolean;
  ghostActive: boolean;
  ghostReplayHash: string | null;
  attemptSamples: GhostSample[];
  accumulator: number;
  frame: number;
  simSeconds: number;
  contactEventsSeen: number;
  contactQueryAgreement: boolean | null;
  padSensorArmed: boolean;
  fuelLowCueFired: boolean;
  gustWarnCueFiredForCycle: boolean;
  thrustLoopActive: boolean;
  rcsPuffArmed: boolean;
  advanceTimer: number;
  bestScoreThisSite: number;
  crashDebris: { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }[];
  shockwaveAge: number;
  latestPrediction: LandingPrediction | null;
  autopilotEnabled: boolean;
  approachSpawnEnabled: boolean;
  collisions: CollisionHandles | undefined;
  surfaceQuery: MeshSurfaceQuery | undefined;
  field: TerrainField | undefined;
  currentSite: LanderSite;
  lastHudSignature: string;
  lastHudWrite: number;
  audioUnlocked: boolean;
}

export interface CollisionHandles {
  terrainId: string;
  sensorIds: string[];
  proxyId: string;
}

export function createAuroraCtx(opts: { autopilotEnabled: boolean; approachSpawnEnabled: boolean; field: TerrainField | undefined }): AuroraCtx {
  return {
    siteIndex: 0,
    phase: "flying",
    paused: false,
    state: createLanderState(SITES[0]!.spawn, SITES[0]!.fuelBudget),
    previousControls: { thrust: 0, rotate: 0 },
    siteScores: [],
    campaignHull: LANDER_MAX_HULL,
    lastGrade: null,
    crashReason: "",
    ghostVisible: true,
    ghostActive: false,
    ghostReplayHash: null,
    attemptSamples: [],
    accumulator: 0,
    frame: 0,
    simSeconds: 0,
    contactEventsSeen: 0,
    contactQueryAgreement: null,
    padSensorArmed: false,
    fuelLowCueFired: false,
    gustWarnCueFiredForCycle: false,
    thrustLoopActive: false,
    rcsPuffArmed: true,
    advanceTimer: -1,
    bestScoreThisSite: 0,
    crashDebris: [],
    shockwaveAge: -1,
    latestPrediction: null,
    autopilotEnabled: opts.autopilotEnabled,
    approachSpawnEnabled: opts.approachSpawnEnabled,
    collisions: undefined,
    surfaceQuery: undefined,
    field: opts.field,
    currentSite: SITES[0]!,
    lastHudSignature: "",
    lastHudWrite: 0,
    audioUnlocked: false
  };
}
