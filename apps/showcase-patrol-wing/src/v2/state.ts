import { FlightModel } from "../gameplay/flight";
import { RingTracker, type PatrolGrade } from "../gameplay/patrol";
import { createDroneSwarm } from "../gameplay/drones";
import { Cannon } from "../gameplay/weapons";
import { GhostPlayer, GhostRecorder } from "../gameplay/ghost";
import { PAD_CENTER, PAD_HEADING_YAW, PAD_Y } from "../legacy/sky";
import type { AuraCameraPose } from "@aura3d/engine";
import type { PatrolRouteState } from "./evidence";

export interface OrbRuntime {
  readonly id: string;
  readonly bodyId: string;
  active: boolean;
  direction: [number, number, number];
  age: number;
}

export interface PatrolCtx {
  flight: FlightModel;
  ghostPlayer: GhostPlayer | null;
  stateValue: PatrolRouteState;
  patrolValue: number;
  hullValue: number;
  timeInPatrol: number;
  failTimer: number;
  gradeTimer: number;
  currentWave: number;
  padSensorLatched: boolean;
  padSensorEntries: number;
  outOfCombatFrames: number;
  hitsThisSortie: number;
  lastGrade: PatrolGrade | null;
  bestRun: { grade: PatrolGrade; script: readonly number[] } | null;
  paused: boolean;
  frame: number;
  combatEventTotal: number;
  sensorEventTotal: number;
  ringsInFrameNow: number;
  lastCueAt: Map<string, number>;
  autopilotEnabled: boolean;
  scenarioTakeoff: boolean;
  scenarioFireOnce: boolean;
  touchDrive: { roll: number; pitch: number } | null;
  touchThrottle: 0 | 1 | -1;
  touchFire: boolean;
  touchEngaged: boolean;
  lastPose: AuraCameraPose | null;
  playerProxyId: string;
  sensorCountValue: number;
  audioBedsStarted: boolean;
  rings: RingTracker;
  cannon: Cannon;
  swarm: ReturnType<typeof createDroneSwarm>["swarm"];
  ghostRecorder: GhostRecorder;
  orbs: OrbRuntime[];
  spawnedWaves: Set<number>;
  droneSlotById: Map<string, number>;
  freeDroneSlots: number[];
}

export function createPatrolCtx(autopilotRequested: boolean): PatrolCtx {
  return {
    flight: new FlightModel({
      position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]],
      headingYaw: PAD_HEADING_YAW,
      grounded: "preflight"
    }),
    ghostPlayer: null,
    stateValue: "preflight",
    patrolValue: 1,
    hullValue: 100,
    timeInPatrol: 0,
    failTimer: 0,
    gradeTimer: 0,
    currentWave: -1,
    padSensorLatched: false,
    padSensorEntries: 0,
    outOfCombatFrames: 0,
    hitsThisSortie: 0,
    lastGrade: null,
    bestRun: null,
    paused: false,
    frame: 0,
    combatEventTotal: 0,
    sensorEventTotal: 0,
    ringsInFrameNow: 0,
    lastCueAt: new Map<string, number>(),
    autopilotEnabled: autopilotRequested,
    scenarioTakeoff: false,
    scenarioFireOnce: false,
    touchDrive: null,
    touchThrottle: 0,
    touchFire: false,
    touchEngaged: false,
    lastPose: null,
    playerProxyId: "",
    sensorCountValue: 0,
    audioBedsStarted: false,
    rings: new RingTracker(),
    cannon: new Cannon(),
    swarm: createDroneSwarm().swarm,
    ghostRecorder: new GhostRecorder(),
    orbs: [],
    spawnedWaves: new Set<number>(),
    droneSlotById: new Map<string, number>(),
    freeDroneSlots: []
  };
}
