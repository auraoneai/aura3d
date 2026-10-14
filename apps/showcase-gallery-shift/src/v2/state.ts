// Run-state context — extracted from boot.ts for 14-LOC.
import type { FloorLayout, FloorWorld, Vec2 } from "../gameplay/floor";
import type { GuardAgent } from "../gameplay/guard";
import type { ThiefPlayer, NoiseEvent } from "../gameplay/thief";
import type { DetectionMeterState } from "../gameplay/vision";

export type Phase = "playing" | "caught" | "won";

export interface FloorRuntime {
  readonly layout: FloorLayout;
  readonly world: FloorWorld;
  readonly thief: ThiefPlayer;
  readonly guards: readonly GuardAgent[];
  liftedIds: string[];
  detection: DetectionMeterState;
  ghostRun: boolean;
  timeInFloor: number;
  laserAlertRemaining: number;
  laserAlertPoint: Vec2 | null;
  floorScore: number;
  lastSeen: Vec2 | null;
}


export interface GalleryCtx {
  floorIndex: number;
  runtime: FloorRuntime;
  phase: Phase;
  paused: boolean;
  totalScore: number;
  completedBeforeFloor: number;
  alarmActive: boolean;
  alarmGraceRemaining: number;
  sensorEventCount: number;
  thiefFacingYaw: number;
  thiefYawErrorDeg: number;
  footstepEvents: number;
  losRayCountTotal: number;
  occlusionCountTotal: number;
  thiefClipActive: string | null;
  animationBound: boolean;
  touchMoveX: number;
  touchMoveZ: number;
  touchLiftHeld: boolean;
  touchSprint: boolean;
  touchSneak: boolean;
  activePointer: { id: number; startX: number; startY: number; x: number; y: number; lift: boolean; moved: boolean } | null;
  touchEngaged: boolean;
  autorunActive: boolean;
  autorunClock: number;
  autorunPhase: "seek" | "orbit";
  frameCount: number;
  firstFrameAt: number | null;
  lastCameraSamples: readonly { readonly id: string; readonly yaw: number; readonly seesThief: boolean; readonly occluded: boolean }[];
  lastThreatSamples: readonly { readonly id: string; readonly x: number; readonly z: number; readonly yaw: number; readonly seesThief: boolean }[];
  readonly noiseEvents: NoiseEvent[];
  readonly visionCounters: { losRayCount: number; occlusionCount: number };
  readonly guardClipActive: Map<string, string>;
}

export function createGalleryCtx(runtime: FloorRuntime): GalleryCtx {
  return {
    floorIndex: 0,
    runtime,
    phase: "playing",
    paused: false,
    totalScore: 0,
    completedBeforeFloor: 0,
    alarmActive: false,
    alarmGraceRemaining: 0,
    sensorEventCount: 0,
    thiefFacingYaw: 0,
    thiefYawErrorDeg: 0,
    footstepEvents: 0,
    losRayCountTotal: 0,
    occlusionCountTotal: 0,
    thiefClipActive: null,
    animationBound: false,
    touchMoveX: 0,
    touchMoveZ: 0,
    touchLiftHeld: false,
    touchSprint: false,
    touchSneak: false,
    activePointer: null,
    touchEngaged: false,
    autorunActive: false,
    autorunClock: 0,
    autorunPhase: "seek",
    frameCount: 0,
    firstFrameAt: null,
    lastCameraSamples: [],
    lastThreatSamples: [],
    noiseEvents: [],
    visionCounters: { losRayCount: 0, occlusionCount: 0 },
    guardClipActive: new Map<string, string>()
  };
}
