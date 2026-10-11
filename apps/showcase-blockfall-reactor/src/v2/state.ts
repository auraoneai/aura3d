// Mutable sim state — extracted from boot.ts for 14-LOC. One shared object;
// every field keeps its original initial value.
import { DEFAULT_SEED, createInitialState, createOpeningBoard, DEMO_REPLAY_60S,
  type BlockfallAction, type BlockfallState, type BlockfallReplayEvent, type PieceKind } from "../gameplay/rules";
import type { AuraCameraPose } from "@aura3d/engine";
import type { createBlockfallRig } from "./scene/camera";

export interface BlockfallCtx {
  state: BlockfallState;
  queuedActions: BlockfallAction[];
  pendingBurst: BlockfallAction[];
  simAccum: number;
  replayActive: boolean;
  replayIndex: number;
  readonly replayEvents: readonly BlockfallReplayEvent[];
  touchEngaged: boolean;
  clearBeatTimer: number;
  readonly clearBeatDuration: number;
  burstRowY: number;
  lastClearSize: number;
  linesClearedThisRound: number;
  lastActivePoolKind: PieceKind | null;
  readonly boardViewProof: { lastParityMatch: boolean; capacityRespected: boolean };
  readonly beatTimers: { levelUp: number; reset: number; burst: number };
  readonly beatDurations: { levelUp: number; reset: number; burst: number };
  readonly dasTimers: { left: number; right: number; soft: number };
  clearedRowsThisBeat: readonly number[];
  lastHudKey: string;
  frame: number;
  firstFrameAt: number | null;
  lastPose: AuraCameraPose | null;
  rigForEvidence: ReturnType<typeof createBlockfallRig> | null;
}

export function createBlockfallCtx(autorunRequested: boolean): BlockfallCtx {
  return {
    state: createInitialState(DEFAULT_SEED, createOpeningBoard()),
    queuedActions: [],
    pendingBurst: [],
    simAccum: 0,
    replayActive: autorunRequested,
    replayIndex: 0,
    replayEvents: DEMO_REPLAY_60S,
    touchEngaged: false,
    clearBeatTimer: 0,
    clearBeatDuration: 0.9,
    burstRowY: 0,
    lastClearSize: 0,
    linesClearedThisRound: 0,
    lastActivePoolKind: null,
    boardViewProof: { lastParityMatch: true, capacityRespected: true },
    beatTimers: { levelUp: 0, reset: 0, burst: 0 },
    beatDurations: { levelUp: 0.85, reset: 0.7, burst: 0.9 },
    dasTimers: { left: 0, right: 0, soft: 0 },
    clearedRowsThisBeat: [],
    lastHudKey: "",
    frame: 0,
    firstFrameAt: null,
    lastPose: null,
    rigForEvidence: null
  };
}
