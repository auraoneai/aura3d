export type AuraClashGamePhase =
  | "intro"
  | "ready"
  | "active"
  | "paused"
  | "hitstop"
  | "round-over";

export type AuraClashInputAction =
  | "moveLeft"
  | "moveRight"
  | "jump"
  | "crouch"
  | "dash"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "pause"
  | "reset";

export type AuraClashAnimationName =
  | "idle"
  | "walkForward"
  | "walkBack"
  | "jump"
  | "crouch"
  | "land"
  | "dash"
  | "guard"
  | "light"
  | "heavy"
  | "special"
  | "hit"
  | "stun"
  | "knockdown"
  | "victory"
  | "defeat";

export type AuraClashAIState =
  | "idle"
  | "approach"
  | "retreat"
  | "guard"
  | "poke"
  | "punish"
  | "jump"
  | "special";

export interface AuraClashVec2 {
  x: number;
  y: number;
}

export interface AuraClashBufferedInput {
  action: AuraClashInputAction;
  atMs: number;
  sequence: number;
}

export interface AuraClashBufferedInputEvidence extends AuraClashBufferedInput {
  ageMs: number;
}

export interface AuraClashInputBufferEvidence {
  bufferWindowMs: number;
  queued: readonly AuraClashBufferedInputEvidence[];
  lastBufferedAction: AuraClashInputAction | null;
  lastConsumedAction: AuraClashInputAction | null;
  lastConsumedSequence: number | null;
  lastConsumedAgeMs: number | null;
}

export interface AuraClashAIEvidence {
  currentState: AuraClashAIState;
  lastAction: AuraClashInputAction;
  reason: string;
  distance: number;
  states: readonly AuraClashAIState[];
}

export interface AuraClashFighterRuntimeEvidence {
  id: string;
  position: AuraClashVec2;
  velocity: AuraClashVec2;
  facing: -1 | 1;
  grounded: boolean;
  crouching: boolean;
  animation: AuraClashAnimationName;
  health: number;
  guard: number;
  meter: number;
  combo: number;
}

export interface AuraClashCameraRuntimeEvidence {
  active: boolean;
  tracks: readonly ["player", "opponent"];
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  fov: number;
  zoom: number;
  shake: number;
  reducedMotion: boolean;
  stageBounds: { minX: number; maxX: number };
  unclampedCenterX: number;
  clampedCenterX: number;
  clampedToStage: boolean;
}

export interface AuraClashCollisionHitboxEvidence {
  inputEventCount: number;
  collisionEventCount: number;
  hitboxEventCount: number;
  hitEventCount: number;
  guardEventCount: number;
  missEventCount: number;
  producedFromGameplayInput: boolean;
  lastInputEventId: string | undefined;
  lastCollisionEventId: string | undefined;
  lastHitboxEventId: string | undefined;
}

export interface AuraClashRuntimeResponsivenessEvidence {
  targetFps: 60;
  fixedStepDt: number;
  fixedStepMs: number;
  frame: number;
  actionReceived: AuraClashInputAction | null;
  actionApplied: AuraClashInputAction | null;
  actionAppliedOnInputFrame: boolean;
  bufferedInputDeferred: boolean;
  inputUpdatedBeforeGameplay: boolean;
  inputBufferWindowMs: number;
  maxExpectedInputToSimulationMs: number;
  observedInputToSimulationMs: number;
  queuedInputCountAfterFrame: number;
  lastBufferedAction: AuraClashInputAction | null;
  lastConsumedAction: AuraClashInputAction | null;
  lastConsumedSequence: number | null;
  playerLockRemainingMs: number;
}

export interface AuraClashRuntimeEvent {
  id: string;
  type:
    | "ai"
    | "collision"
    | "input"
    | "movement"
    | "attack"
    | "hit"
    | "guard"
    | "miss"
    | "camera"
    | "effect"
    | "round";
  atMs: number;
  side?: "player" | "opponent";
  label: string;
  payload?: Record<string, unknown>;
}

export interface AuraClashRuntimeEvidence {
  runtime: "aura-clash-local-runtime";
  version: "1.0.5-target";
  phase: AuraClashGamePhase;
  playerId: string;
  opponentId: string;
  actionsProcessed: number;
  frameCount: number;
  eventCount: number;
  systems: {
    loop: boolean;
    input: boolean;
    kinematicMovement: boolean;
    hitboxes: boolean;
    cameraDirector: boolean;
    effectsDirector: boolean;
    accessibility: boolean;
    aiDirector?: boolean;
  };
  ai?: AuraClashAIEvidence;
  fighters: {
    player: AuraClashFighterRuntimeEvidence;
    opponent: AuraClashFighterRuntimeEvidence;
  };
  camera: AuraClashCameraRuntimeEvidence;
  collisionHitbox: AuraClashCollisionHitboxEvidence;
  inputBuffer?: AuraClashInputBufferEvidence;
  responsiveness: AuraClashRuntimeResponsivenessEvidence;
  lastEvents: AuraClashRuntimeEvent[];
}
