
import {
  validatePlatformerMotion,
  type PlatformerMotionReport
} from "./PlatformerMotion.js";
import { createGameArcadeVehicle, createGameKinematicBody, type GameKinematicBody } from "./GameRuntime.js";
export interface GameKitVec2 {
  readonly x: number;
  readonly y: number;
}

export interface GameKitRect extends GameKitVec2 {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface GamePlatformerMovingPlatform extends GameKitRect {
  readonly axis: "x" | "y";
  readonly amplitude: number;
  readonly period: number;
  readonly phase?: number;
}

export interface GamePlatformerCollectible extends GameKitVec2 {
  readonly id: string;
  readonly value?: number;
  readonly radius?: number;
}

export interface GamePlatformerHazard extends GameKitRect {
  readonly damage?: number;
  readonly respawn?: boolean;
}

export interface GamePlatformerCheckpoint extends GameKitVec2 {
  readonly id: string;
  readonly radius?: number;
}

export interface GamePlatformerLevel {
  readonly id?: string;
  readonly gravity?: number;
  readonly lowerBound?: number;
  readonly moveSpeed?: number;
  readonly jumpVelocity?: number;
  readonly dashSpeed?: number;
  readonly coyoteMs?: number;
  readonly jumpBufferMs?: number;
  readonly ledgeGrabTolerance?: number;
  readonly playerSize?: readonly [number, number];
  readonly start?: GameKitVec2;
  readonly finish?: GameKitVec2;
  readonly platforms?: readonly GameKitRect[];
  readonly movingPlatforms?: readonly GamePlatformerMovingPlatform[];
  readonly collectibles?: readonly GamePlatformerCollectible[];
  readonly hazards?: readonly GamePlatformerHazard[];
  readonly checkpoints?: readonly GamePlatformerCheckpoint[];
  readonly lives?: number;
}

export interface GamePlatformerInput {
  readonly moveX?: number;
  readonly jumpPressed?: boolean;
  readonly jumpHeld?: boolean;
  readonly dashPressed?: boolean;
  readonly fastFall?: boolean;
  /**
   * Restart the level from its start.
   *
   * Present because `GameRacingInput` has it and this did not: a clean-room platformer
   * written against the public API had to reach for `kit.reset()` out-of-band while the
   * racing kit accepts `reset` as input. Two kits in the same family disagreeing about
   * where restart lives is an API-consistency defect, not a caller error.
   */
  readonly reset?: boolean;
}

export type GamePlatformerEventType =
  | "jump"
  | "land"
  | "dash"
  | "collect"
  | "checkpoint"
  | "hazard"
  | "fall"
  | "respawn"
  | "complete"
  /** Level restarted. Emitted for `GamePlatformerInput.reset`, matching the racing kit. */
  | "reset";

export interface GamePlatformerEvent {
  readonly type: GamePlatformerEventType;
  readonly id?: string;
  readonly frame: number;
  readonly time: number;
  readonly x: number;
  readonly y: number;
}

export interface GamePlatformerPlayerState extends GameKitVec2 {
  readonly vx: number;
  readonly vy: number;
  readonly facing: 1 | -1;
  readonly grounded: boolean;
  readonly ridingPlatformId?: string;
}

export interface GamePlatformerSnapshot {
  readonly kind: "aura-game-platformer-kit";
  readonly levelId: string;
  readonly status: "playing" | "completed";
  readonly frame: number;
  readonly time: number;
  readonly player: GamePlatformerPlayerState;
  readonly score: number;
  readonly lives: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly collected: readonly string[];
  readonly activatedCheckpoints: readonly string[];
  readonly events: readonly GamePlatformerEvent[];
}

export interface GamePlatformerGroundContact {
  readonly grounded: boolean;
  readonly surfaceId?: string;
  readonly surfaceTop?: number;
}

export interface GamePlatformerSurfaceQuery {
  readonly kind: "aura-game-platformer-surface-query";
  readonly certified: boolean;
  groundContact(input: {
    readonly player: Pick<GamePlatformerPlayerState, "x" | "y" | "vy">;
    readonly previousPlayer: Pick<GamePlatformerPlayerState, "x" | "y">;
    readonly additionalSurfaces?: readonly GameKitRect[];
  }): GamePlatformerGroundContact;
}

export interface GamePlatformerKit {
  readonly kind: "aura-game-platformer-kit";
  readonly surfaceQuery: GamePlatformerSurfaceQuery;
  step(dt: number, input?: GamePlatformerInput): GamePlatformerSnapshot;
  reset(checkpointId?: string): GamePlatformerSnapshot;
  snapshot(): GamePlatformerSnapshot;
  events(): readonly GamePlatformerEvent[];
  consumeEvents(): readonly GamePlatformerEvent[];
}

export type GameLocomotionState = "idle" | "run" | "jump" | "fall" | "land" | "hit";

export interface GameLocomotionClipMap {
  readonly idle: string;
  readonly run: string;
  readonly jump: string;
  readonly fall: string;
  readonly land: string;
  readonly hit: string;
}

export interface GameLocomotionEventInput {
  readonly type: string;
}

export interface GameLocomotionInput {
  readonly speed?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly grounded?: boolean;
  readonly hit?: boolean;
  readonly land?: boolean;
  readonly events?: readonly GameLocomotionEventInput[];
}

export interface GameLocomotionOptions {
  readonly clipMap?: Partial<GameLocomotionClipMap>;
  readonly availableClips?: readonly string[];
  readonly initialState?: GameLocomotionState;
  readonly runSpeedThreshold?: number;
  readonly jumpVelocityThreshold?: number;
  readonly fallVelocityThreshold?: number;
  readonly landDuration?: number;
  readonly hitDuration?: number;
}

export interface GameLocomotionSnapshot {
  readonly kind: "aura-game-locomotion-state";
  readonly frame: number;
  readonly time: number;
  readonly state: GameLocomotionState;
  readonly previousState: GameLocomotionState;
  readonly clip: string;
  readonly loop: boolean;
  readonly restart: boolean;
  readonly oneShot: boolean;
  readonly oneShotRemaining: number;
  readonly stateTime: number;
  readonly speed: number;
  readonly vx: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly missingClips: readonly string[];
  readonly eventTypes: readonly string[];
}

export interface GameLocomotionKit {
  readonly kind: "aura-game-locomotion-kit";
  step(dt: number, input?: GameLocomotionInput): GameLocomotionSnapshot;
  reset(state?: GameLocomotionState): GameLocomotionSnapshot;
  snapshot(): GameLocomotionSnapshot;
  resolveClip(state: GameLocomotionState): string;
}

interface MutablePlatformerState {
  status: "playing" | "completed";
  frame: number;
  time: number;
  player: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: 1 | -1;
    grounded: boolean;
    dashCooldown: number;
    ridingPlatformId?: string;
  };
  score: number;
  lives: number;
  deaths: number;
  respawnControlLock: number;
  respawnAwaitingNeutralInput: boolean;
  checkpointId: string;
  collected: Set<string>;
  activatedCheckpoints: Set<string>;
}

const DEFAULT_LOCOMOTION_CLIP_MAP: GameLocomotionClipMap = {
  idle: "idle",
  run: "run",
  jump: "jump",
  fall: "fall",
  land: "land",
  hit: "hit"
};

export function createGameLocomotionKit(options: GameLocomotionOptions = {}): GameLocomotionKit {
  const clipMap = { ...DEFAULT_LOCOMOTION_CLIP_MAP, ...options.clipMap };
  const availableClips = new Set((options.availableClips ?? []).map((clip) => clip.toLowerCase()));
  const runSpeedThreshold = options.runSpeedThreshold ?? 0.08;
  const jumpVelocityThreshold = options.jumpVelocityThreshold ?? 0.05;
  const fallVelocityThreshold = options.fallVelocityThreshold ?? -0.05;
  const landDuration = Math.max(0.02, options.landDuration ?? 0.16);
  const hitDuration = Math.max(0.02, options.hitDuration ?? 0.28);
  let frame = 0;
  let time = 0;
  let state = options.initialState ?? "idle";
  let previousState: GameLocomotionState = state;
  let stateTime = 0;
  let oneShotRemaining = 0;
  let previousGrounded = true;
  let currentInput: Required<Pick<GameLocomotionInput, "speed" | "vx" | "vy" | "grounded">> = {
    speed: 0,
    vx: 0,
    vy: 0,
    grounded: true
  };
  let eventTypes: string[] = [];
  let restart = true;

  const resolveClip = (nextState: GameLocomotionState): string => clipMap[nextState];
  const missingClips = () => {
    if (availableClips.size === 0) return [];
    return (Object.keys(clipMap) as GameLocomotionState[])
      .map((nextState) => clipMap[nextState])
      .filter((clip, index, all) => all.indexOf(clip) === index && !availableClips.has(clip.toLowerCase()));
  };
  const snapshot = (): GameLocomotionSnapshot => ({
    kind: "aura-game-locomotion-state",
    frame,
    time,
    state,
    previousState,
    clip: resolveClip(state),
    loop: state === "idle" || state === "run" || state === "fall",
    restart,
    oneShot: state === "land" || state === "hit",
    oneShotRemaining,
    stateTime,
    speed: currentInput.speed,
    vx: currentInput.vx,
    vy: currentInput.vy,
    grounded: currentInput.grounded,
    missingClips: missingClips(),
    eventTypes: [...eventTypes]
  });
  const setState = (next: GameLocomotionState, oneShotSeconds = 0) => {
    restart = next !== state;
    previousState = state;
    if (restart) stateTime = 0;
    state = next;
    oneShotRemaining = oneShotSeconds;
  };
  const reset = (nextState: GameLocomotionState = options.initialState ?? "idle") => {
    frame = 0;
    time = 0;
    state = nextState;
    previousState = nextState;
    stateTime = 0;
    oneShotRemaining = 0;
    previousGrounded = true;
    currentInput = { speed: 0, vx: 0, vy: 0, grounded: true };
    eventTypes = [];
    restart = true;
    return snapshot();
  };

  reset(state);

  return {
    kind: "aura-game-locomotion-kit",
    step(dt, input = {}) {
      const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
      frame += 1;
      time += step;
      eventTypes = (input.events ?? []).map((event) => event.type.toLowerCase());
      const vx = input.vx ?? 0;
      const vy = input.vy ?? 0;
      const speed = Math.max(0, input.speed ?? Math.abs(vx));
      const grounded = input.grounded ?? previousGrounded;
      currentInput = { speed, vx, vy, grounded };

      const hitRequested = input.hit === true || eventTypes.some((type) => type === "hit" || type === "hazard" || type === "damage");
      const landRequested = input.land === true || eventTypes.includes("land") || (!previousGrounded && grounded && state !== "hit");
      const continuingOneShot = oneShotRemaining > 0 && (state === "hit" || state === "land");

      if (hitRequested) {
        setState("hit", hitDuration);
      } else if (landRequested) {
        setState("land", landDuration);
      } else if (continuingOneShot && oneShotRemaining > step) {
        restart = false;
        oneShotRemaining = Math.max(0, oneShotRemaining - step);
      } else if (!grounded) {
        if (vy > jumpVelocityThreshold) setState("jump");
        else if (vy < fallVelocityThreshold || state === "jump") setState("fall");
        else setState("fall");
      } else if (speed > runSpeedThreshold) {
        setState("run");
      } else {
        setState("idle");
      }

      stateTime += step;
      if (oneShotRemaining > 0 && !hitRequested && !landRequested) oneShotRemaining = Math.max(0, oneShotRemaining - step);
      previousGrounded = grounded;
      return snapshot();
    },
    reset,
    snapshot,
    resolveClip
  };
}

export interface GameRacingRoute {
  readonly id?: string;
  readonly points: readonly GameKitVec2[];
  readonly width?: number;
  readonly closed?: boolean;
  readonly checkpoints?: readonly number[];
}

export type GameAssetGeometrySource =
  | "asset-mesh-extracted"
  | "manifest-authored"
  | "manifest-authored-overlay-validated"
  | "compiler-authored"
  | "compiler-authored-overlay-validated";

export interface GameGeometryModelBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface GameRacingTopologyModelAnchor {
  readonly id: string;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: {
    readonly x: number;
    readonly z: number;
  };
}

export interface GameRacingTopologyModelAlignment {
  readonly source: GameAssetGeometrySource;
  readonly modelBounds: GameGeometryModelBounds;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: {
    readonly x: number;
    readonly z: number;
  };
  readonly anchorPairs?: readonly GameRacingTopologyModelAnchor[];
  readonly evidence: {
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export interface GamePlatformerSurfaceModelAnchor {
  readonly id: string;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: GameKitVec2;
}

export interface GamePlatformerSurfaceModelAlignment {
  readonly source: GameAssetGeometrySource;
  readonly modelBounds: GameGeometryModelBounds;
  readonly modelPoint: readonly [number, number, number];
  readonly gamePoint: GameKitVec2;
  readonly anchorPairs?: readonly GamePlatformerSurfaceModelAnchor[];
  readonly evidence: {
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export interface GameRacingTrackTopology {
  readonly assetId: string;
  readonly assetHash: string;
  readonly source: GameAssetGeometrySource;
  readonly roadCenterline: readonly { readonly x: number; readonly z: number; readonly width?: number; readonly surfaceY?: number }[];
  readonly checkpoints: readonly { readonly progress: number; readonly width: number }[];
  /**
   * The drivable road as indexed triangles in model space, when the asset provided them.
   *
   * A centreline is a curve, so it carries one height per point *along* the track and cannot
   * express camber, crowning or banking, which vary across the road's **width**. Four wheels
   * sit at different lateral offsets, so grounding them on a curve gives them all the same
   * height — the flat-plane defect restated. Triangles are what make per-wheel contact real.
   */
  readonly drivableMesh?: {
    readonly positions: readonly number[];
    readonly indices: readonly number[];
    readonly triangleCount: number;
    readonly sourceTriangleCount?: number;
  };
  readonly lapLengthMeters?: number;
  readonly estimatedLapSeconds: number;
  readonly confidence: number;
  readonly modelAlignment: GameRacingTopologyModelAlignment;
  readonly evidence: {
    readonly sourceAsset: string;
    readonly renderedProbe?: string;
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export interface GameRacingSpeedModel {
  readonly kind: "route-length-over-authored-lap-seconds";
  readonly routeLength: number;
  readonly authoredLapSeconds: number;
  readonly certifiedSpeed: number;
  readonly units: "game-units-per-second";
}

export interface GameAssetBoundRacingRouteBinding {
  readonly kind: "aura-game-asset-bound-racing-route";
  readonly layoutContractVersion: "1.0";
  readonly vehicleAsset: string;
  readonly trackAsset: string;
  readonly trackAssetHash?: string;
  readonly topologySource?: GameAssetGeometrySource;
  readonly confidence?: number;
  readonly routeLength: number;
  readonly authoredLapSeconds: number;
  readonly speedModel: GameRacingSpeedModel;
  readonly pointCount: number;
  readonly checkpointCount: number;
}

export interface GameAssetBoundRacingRoute extends GameRacingRoute {
  readonly assetBinding: GameAssetBoundRacingRouteBinding;
}

export interface GameAssetBoundRacingRouteOptions {
  readonly vehicleAsset: string;
  readonly trackAsset: string;
  readonly route: GameRacingRoute;
  readonly authoredLapSeconds: number;
  readonly topology?: GameRacingTrackTopology;
  readonly minLapSeconds?: number;
  readonly minCheckpoints?: number;
  readonly minRouteLength?: number;
}

export interface GameRacingOptions {
  readonly route: GameRacingRoute;
  /** Multiplies the certified baseline pace without changing route geometry or authored evidence duration. */
  readonly paceMultiplier?: number;
  readonly maxSpeed?: number;
  readonly acceleration?: number;
  readonly brakeStrength?: number;
  readonly reverseSpeed?: number;
  readonly drag?: number;
  readonly steerRate?: number;
  readonly boostAcceleration?: number;
  readonly offTrackDrag?: number;
  /**
   * Keeps the vehicle centre this far inside each certified road edge. Use half the
   * rendered vehicle width (converted to route units) so wheels do not hang over the
   * terrain while the centre point still reports on-track.
   */
  readonly boundaryInset?: number;
  /** Maximum heading error from the racing-line tangent during automatic edge recovery. */
  readonly recoveryHeadingLimit?: number;
  readonly checkpointRadius?: number;
  readonly startProgress?: number;
  readonly lapsToWin?: number;
}

export interface GamePlatformerWorldAssetBinding {
  readonly worldAsset: string;
  readonly worldAssetHash?: string;
  readonly surfaceSource?: GameAssetGeometrySource;
  readonly confidence?: number;
  readonly surfaceIds: readonly string[];
}

export interface GamePlatformerPlayableSurfaceMap {
  readonly assetId: string;
  readonly assetHash: string;
  readonly source: GameAssetGeometrySource;
  readonly surfaces: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly kind: "ground" | "platform" | "moving" | "hazard" | "checkpoint" | "finish";
  }[];
  readonly levelLength: number;
  readonly estimatedCompletionSeconds: number;
  readonly characterScaleRatio: number;
  readonly confidence: number;
  readonly modelAlignment: GamePlatformerSurfaceModelAlignment;
  readonly evidence: {
    readonly sourceAsset: string;
    readonly renderedProbe?: string;
    readonly routeOverlay?: string;
    readonly notes: string;
  };
}

export interface GameAssetBoundPlatformerLevelBinding {
  readonly kind: "aura-game-asset-bound-platformer-level";
  readonly layoutContractVersion: "1.0";
  readonly characterAsset: string;
  readonly worldAssets: readonly string[];
  readonly worldAssetHashes?: Readonly<Record<string, string>>;
  readonly surfaceSource?: GameAssetGeometrySource;
  readonly characterScaleRatio?: number;
  readonly confidence?: number;
  readonly authoredPlayableSeconds: number;
  readonly traversalSeconds: number;
  readonly surfaceCount: number;
  readonly checkpointCount: number;
  /**
   * Consistency of the level's motion tuning with its own platform geometry.
   *
   * Published so a floaty or unclearable jump is visible in evidence rather than only
   * discoverable by playing. A level can be perfectly solvable and still feel wrong: an
   * over-powered jump clears every obstacle, so solvability passes while the character
   * visibly floats above the course.
   */
  readonly motionReport: PlatformerMotionReport;
}

export interface GameAssetBoundPlatformerLevel extends GamePlatformerLevel {
  readonly assetBinding: GameAssetBoundPlatformerLevelBinding;
}

export interface GameAssetBoundPlatformerLevelOptions {
  readonly characterAsset: string;
  readonly worldAssetBindings: readonly GamePlatformerWorldAssetBinding[];
  readonly level: GamePlatformerLevel;
  readonly playableSurfaceMap?: GamePlatformerPlayableSurfaceMap;
  /** Authored duration backed by certified level flow, including traversal, jumps, hazards, and checkpoints. */
  readonly authoredPlayableSeconds?: number;
  readonly minPlayableSeconds?: number;
  readonly minCheckpoints?: number;
  readonly minSurfaceCount?: number;
  /**
   * Whether inconsistent motion tuning throws or is only reported.
   *
   * `"enforced"` (the default) refuses to build a public level whose jump overshoots or
   * cannot clear its own geometry. `"reported"` keeps the report without throwing, for a
   * route deliberately mid-migration.
   */
  readonly motionTuning?: "enforced" | "reported";
  /** Overrides for the motion-vs-geometry limits. */
  readonly motionLimits?: Parameters<typeof validatePlatformerMotion>[2];
}

export interface GameRacingInput {
  readonly throttle?: number | boolean;
  readonly brake?: number | boolean;
  readonly steer?: number;
  readonly drift?: boolean;
  readonly boost?: boolean;
  readonly reset?: boolean;
}

export type GameRacingEventType = "checkpoint" | "lap" | "off-track" | "reset" | "finish";

export interface GameRacingEvent {
  readonly type: GameRacingEventType;
  readonly id?: string;
  readonly frame: number;
  readonly time: number;
  readonly lap: number;
  readonly checkpoint: number;
}

export interface GameRacingSnapshot {
  readonly kind: "aura-game-racing-kit";
  readonly routeId: string;
  readonly frame: number;
  readonly time: number;
  readonly lap: number;
  readonly lapsToWin: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly lapTime: number;
  readonly bestTime?: number;
  readonly speed: number;
  readonly drift: number;
  readonly offTrack: boolean;
  readonly progress: number;
  readonly distance: number;
  /** Unsigned distance from the racing line. */
  readonly trackOffset: number;
  /** Lateral offset signed positive to the left of travel; use this to steer back onto the line. */
  readonly signedTrackOffset: number;
  readonly position: GameKitVec2;
  readonly heading: number;
  readonly status: "running" | "finished";
  readonly events: readonly GameRacingEvent[];
}

export interface GameRacingCameraSnapshot {
  readonly kind: "aura-game-racing-camera";
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fov: number;
}

export interface GameRacingSurfaceContact {
  readonly onTrack: boolean;
  readonly progress: number;
  readonly distance: number;
  /** Unsigned distance from the racing line. */
  readonly trackOffset: number;
  /**
   * Lateral offset from the racing line, signed positive to the left of the direction of travel.
   *
   * `trackOffset` is a magnitude, so it cannot be used to steer back onto the line. Controllers and
   * opponent AI should read this field instead.
   */
  readonly signedTrackOffset: number;
  readonly roadHalfWidth: number;
  /**
   * Heading of the racing line itself at the nearest point, radians, in the same convention as
   * the car's own `heading`.
   *
   * Without this a controller can only see *how far* it is from the line, never which way the line
   * is going. That is survivable for a kinematic model, whose heading snaps to the steering input,
   * and not survivable for a force model: the car's heading and its direction of travel diverge
   * under slip, so a pure offset controller has no heading error term and oscillates instead of
   * tracking. `tangentHeading - heading` is the term it needs.
   */
  readonly tangentHeading: number;
  /**
   * Signed curvature of the racing line at the nearest point, 1/radius in route units, positive
   * for a left-hand corner.
   *
   * A force-based car has to slow down *before* a corner, because grip is finite and load transfer
   * takes time. Curvature is what makes the required entry speed computable — `sqrt(gripG * g / |k|)`
   * — rather than guessed. A controller that cannot see curvature can only react after it is already
   * understeering, which is exactly the failure the kinematic model hid.
   */
  readonly curvature: number;
}

export interface GameRacingSurfaceQuery {
  readonly kind: "aura-game-racing-surface-query";
  readonly certified: boolean;
  /** Total centreline length in route units. Needed to convert a lookahead distance to progress. */
  readonly length: number;
  readonly roadHalfWidth: number;
  query(position: GameKitVec2): GameRacingSurfaceContact;
  /**
   * Sample the racing line at a progress value, independent of where any car is.
   *
   * This is the lookahead primitive. Corner entry speed depends on the curvature the car is about
   * to reach, not the curvature under it, so anticipation requires sampling the line ahead of the
   * current position.
   */
  sampleAt(progress: number): GameRacingLineSample;
}

export interface GameRacingLineSample {
  readonly x: number;
  readonly y: number;
  readonly progress: number;
  readonly heading: number;
  /** Signed curvature, 1/radius, positive for a left-hand corner. */
  readonly curvature: number;
}

export interface GameRacingKit {
  readonly kind: "aura-game-racing-kit";
  readonly maxSpeed: number;
  readonly surfaceQuery: GameRacingSurfaceQuery;
  step(dt: number, input?: GameRacingInput): GameRacingSnapshot;
  /**
   * Feed a position resolved by the selected collision solver back into the racing
   * state. This keeps vehicle-to-vehicle and barrier contact authoritative instead
   * of moving only the rendered model while gameplay continues through the obstacle.
   */
  resolveContact(position: GameKitVec2, options?: {
    readonly heading?: number;
    readonly speedMultiplier?: number;
    readonly driftMultiplier?: number;
  }): GameRacingSnapshot;
  reset(progress?: number): GameRacingSnapshot;
  placeAtProgress(progress: number, offset?: number): GameRacingSnapshot;
  snapshot(): GameRacingSnapshot;
  camera(): GameRacingCameraSnapshot;
  events(): readonly GameRacingEvent[];
  consumeEvents(): readonly GameRacingEvent[];
}

interface RaceSegment {
  readonly from: GameKitVec2;
  readonly to: GameKitVec2;
  readonly length: number;
  readonly start: number;
  readonly heading: number;
}

export const GAME_FALLING_BLOCK_PIECES = ["I", "J", "L", "O", "S", "T", "Z"] as const;
export type GameFallingBlockPiece = (typeof GAME_FALLING_BLOCK_PIECES)[number];
export type GameFallingBlockCell = GameFallingBlockPiece | null;
export type GameFallingBlockBoard = readonly (readonly GameFallingBlockCell[])[];
export type GameFallingBlockRotation = 0 | 1 | 2 | 3;

export interface GameFallingBlockActivePiece {
  readonly kind: GameFallingBlockPiece;
  readonly x: number;
  readonly y: number;
  readonly rotation: GameFallingBlockRotation;
}

export type GameFallingBlockAction =
  | { readonly type: "move"; readonly dx: -1 | 1 }
  | { readonly type: "rotate"; readonly direction: -1 | 1 }
  | { readonly type: "softDrop" }
  | { readonly type: "hardDrop" }
  | { readonly type: "hold" }
  | { readonly type: "tick"; readonly frames?: number }
  | { readonly type: "reset"; readonly seed?: number };

export interface GameFallingBlocksOptions {
  readonly width?: number;
  readonly height?: number;
  readonly hiddenRows?: number;
  readonly seed?: number;
  readonly lockDelayFrames?: number;
  readonly gravityFrames?: number;
  readonly board?: GameFallingBlockBoard;
}

export interface GameFallingBlocksEvent {
  readonly type: "spawn" | "move" | "rotate" | "soft-drop" | "hard-drop" | "hold" | "lock" | "line-clear" | "game-over" | "reset";
  readonly frame: number;
  readonly piece?: GameFallingBlockPiece;
  readonly lines?: number;
  readonly score?: number;
}

export interface GameFallingBlocksSnapshot {
  readonly kind: "aura-game-falling-blocks-kit";
  readonly width: number;
  readonly height: number;
  readonly hiddenRows: number;
  readonly frame: number;
  readonly seed: number;
  readonly board: GameFallingBlockBoard;
  readonly active: GameFallingBlockActivePiece | null;
  readonly hold: GameFallingBlockPiece | null;
  readonly holdUsed: boolean;
  readonly queue: readonly GameFallingBlockPiece[];
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly combo: number;
  readonly backToBack: boolean;
  readonly lockDelayFrames: number;
  readonly gravityFrames: number;
  readonly gameOver: boolean;
  readonly checksum: string;
  readonly events: readonly GameFallingBlocksEvent[];
}

export interface GameFallingBlocksKit {
  readonly kind: "aura-game-falling-blocks-kit";
  step(action: GameFallingBlockAction): GameFallingBlocksSnapshot;
  tick(frames?: number): GameFallingBlocksSnapshot;
  move(dx: -1 | 1): GameFallingBlocksSnapshot;
  rotate(direction?: -1 | 1): GameFallingBlocksSnapshot;
  softDrop(): GameFallingBlocksSnapshot;
  hardDrop(): GameFallingBlocksSnapshot;
  hold(): GameFallingBlocksSnapshot;
  reset(seed?: number): GameFallingBlocksSnapshot;
  setBoard(board: GameFallingBlockBoard): GameFallingBlocksSnapshot;
  setActive(piece: GameFallingBlockActivePiece | null): GameFallingBlocksSnapshot;
  snapshot(): GameFallingBlocksSnapshot;
  checksum(): string;
  replay(): readonly { readonly frame: number; readonly action: GameFallingBlockAction }[];
  events(): readonly GameFallingBlocksEvent[];
  consumeEvents(): readonly GameFallingBlocksEvent[];
}

const DEFAULT_PLATFORMER_LEVEL: Required<Omit<GamePlatformerLevel, "id">> & { readonly id: string } = {
  id: "starter-platformer",
  gravity: -22,
  lowerBound: -3,
  moveSpeed: 5.25,
  jumpVelocity: 8.25,
  dashSpeed: 9,
  coyoteMs: 110,
  jumpBufferMs: 130,
  ledgeGrabTolerance: 0.18,
  playerSize: [0.45, 1],
  start: { x: 0, y: 0.35 },
  finish: { x: 8, y: 0.35 },
  platforms: [{ id: "ground", x: -1, y: 0, width: 10.5, height: 0.35 }],
  movingPlatforms: [],
  collectibles: [],
  hazards: [],
  checkpoints: [],
  lives: 3
};

export function createGamePlatformerSurfaceQuery(level: GamePlatformerLevel = {}): GamePlatformerSurfaceQuery {
  const config = { ...DEFAULT_PLATFORMER_LEVEL, ...level };
  const playerWidth = config.playerSize[0];
  return {
    kind: "aura-game-platformer-surface-query",
    certified: isAssetBoundPlatformerLevel(level),
    groundContact(input) {
      const surfaces = [...config.platforms, ...(input.additionalSurfaces ?? [])];
      for (const surface of surfaces) {
        const top = platformTop(surface);
        const wasAbove = input.previousPlayer.y >= top - 0.04;
        const fallingOnto = input.player.vy <= 0 && input.player.y <= top + config.ledgeGrabTolerance;
        if (wasAbove && fallingOnto && platformerHorizontalOverlap(input.player.x, playerWidth, surface, config.ledgeGrabTolerance)) {
          return { grounded: true, surfaceId: surface.id, surfaceTop: top };
        }
      }
      return { grounded: false };
    }
  };
}

export function createGamePlatformerKit(level: GamePlatformerLevel = {}): GamePlatformerKit {
  const config = { ...DEFAULT_PLATFORMER_LEVEL, ...level };
  const playerWidth = config.playerSize[0];
  const playerHeight = config.playerSize[1];
  const surfaceQuery = createGamePlatformerSurfaceQuery(level);
  let state = createPlatformerState(config);
  const createBody = (): GameKinematicBody => createGameKinematicBody({
    id: `${config.id}-player`,
    position: [state.player.x, state.player.y, 0],
    velocity: [state.player.vx, state.player.vy, 0],
    size: [playerWidth, playerHeight, 0.25],
    gravity: config.gravity,
    groundY: -1_000_000,
    friction: 0,
    maxSpeed: Math.max(config.moveSpeed, config.dashSpeed),
    jumpVelocity: config.jumpVelocity,
    coyoteMs: config.coyoteMs,
    jumpBufferMs: config.jumpBufferMs
  });
  let body = createBody();
  let events: GamePlatformerEvent[] = [];

  const syncPlayerFromBody = () => {
    const next = body.snapshot();
    state.player.x = next.position[0];
    state.player.y = next.position[1];
    state.player.vx = next.velocity[0];
    state.player.vy = next.velocity[1];
    state.player.facing = next.facing;
    state.player.grounded = next.grounded;
  };

  const snapshot = (): GamePlatformerSnapshot => ({
    kind: "aura-game-platformer-kit",
    levelId: config.id,
    status: state.status,
    frame: state.frame,
    time: state.time,
    player: {
      x: state.player.x,
      y: state.player.y,
      vx: state.player.vx,
      vy: state.player.vy,
      facing: state.player.facing,
      grounded: state.player.grounded,
      ridingPlatformId: state.player.ridingPlatformId
    },
    score: state.score,
    lives: state.lives,
    deaths: state.deaths,
    checkpointId: state.checkpointId,
    collected: [...state.collected].sort(),
    activatedCheckpoints: [...state.activatedCheckpoints].sort(),
    events: [...events]
  });

  const emit = (type: GamePlatformerEventType, id?: string) => {
    events.push({ type, id, frame: state.frame, time: state.time, x: state.player.x, y: state.player.y });
  };

  const respawn = (reason: "hazard" | "fall", id?: string) => {
    emit(reason, id);
    state.deaths += 1;
    state.lives = Math.max(0, state.lives - 1);
    const spawn = platformerSpawn(config, state.checkpointId);
    state.player = {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: state.player.facing,
      grounded: false,
      dashCooldown: 0,
      ridingPlatformId: undefined
    };
    body = createBody();
    // Ignore held directional input briefly after a death so a key that caused
    // the miss cannot immediately carry the fresh spawn off its supporting
    // surface before the player or an automated driver can react.
    // A released direction unlocks immediately; the bounded fallback keeps
    // continuous-input AI/autoplay controllers from remaining locked forever.
    state.respawnControlLock = 0.75;
    state.respawnAwaitingNeutralInput = true;
    emit("respawn", state.checkpointId);
  };

  return {
    kind: "aura-game-platformer-kit",
    surfaceQuery,
    step(dt, input = {}) {
      const step = Math.min(0.05, Math.max(0, dt || 0));
      events = [];
      // Restart is handled before the completion guard, so a finished level can be
      // restarted. Matching `GameRacingInput`, which handles `reset` the same way.
      if (input.reset === true) {
        events = [];
        state = createPlatformerState(config);
        body = createBody();
        emit("reset");
        return snapshot();
      }
      if (state.status === "completed") return snapshot();
      state.frame += 1;
      const previousTime = state.time;
      state.time += step;
      const previousPlayer = { ...state.player };
      const previousMoving = platformerMovingRectsAt(previousTime, config);
      const moving = platformerMovingRectsAt(state.time, config);
      const carried = state.player.ridingPlatformId
        ? moving.find((platform) => platform.id === state.player.ridingPlatformId)
        : undefined;
      const carriedPrevious = state.player.ridingPlatformId
        ? previousMoving.find((platform) => platform.id === state.player.ridingPlatformId)
        : undefined;
      if (carried && carriedPrevious && state.player.grounded) {
        body.position = [
          body.position[0] + carried.x - carriedPrevious.x,
          body.position[1] + platformTop(carried) - platformTop(carriedPrevious),
          body.position[2]
        ];
        syncPlayerFromBody();
      }

      state.respawnControlLock = Math.max(0, state.respawnControlLock - step);
      const requestedMoveX = clampNumber(input.moveX ?? 0, -1, 1);
      if (state.respawnAwaitingNeutralInput && Math.abs(requestedMoveX) <= 0.01) {
        state.respawnAwaitingNeutralInput = false;
      }
      if (state.respawnControlLock <= 0) state.respawnAwaitingNeutralInput = false;
      const controlsLocked = state.respawnAwaitingNeutralInput;
      const moveX = controlsLocked ? 0 : requestedMoveX;
      body.move(moveX, config.moveSpeed);
      if (input.jumpPressed) body.requestJump();
      state.player.dashCooldown = Math.max(0, state.player.dashCooldown - step);
      if (!controlsLocked && input.dashPressed && state.player.dashCooldown <= 0) {
        body.dash([body.facing, 0, 0], config.dashSpeed);
        state.player.dashCooldown = 0.38;
        emit("dash");
      }
      if (body.consumeJump(config.jumpVelocity)) {
        state.player.ridingPlatformId = undefined;
        emit("jump");
      }
      if (input.fastFall && body.velocity[1] < 0) {
        body.velocity = [body.velocity[0], body.velocity[1] + config.gravity * 0.6 * step, body.velocity[2]];
      }
      body.update(step);
      syncPlayerFromBody();
      state.player.ridingPlatformId = undefined;

      const platforms = [...config.platforms, ...moving];
      const groundContact = surfaceQuery.groundContact({ player: state.player, previousPlayer, additionalSurfaces: moving });
      if (groundContact.grounded && groundContact.surfaceId && groundContact.surfaceTop !== undefined) {
        body.snapToGround(groundContact.surfaceTop);
        syncPlayerFromBody();
        state.player.ridingPlatformId = moving.some((candidate) => candidate.id === groundContact.surfaceId) ? groundContact.surfaceId : undefined;
        if (!previousPlayer.grounded) emit("land", groundContact.surfaceId);
      }

      for (const coin of config.collectibles) {
        if (state.collected.has(coin.id)) continue;
        const radius = coin.radius ?? 0.42;
        if (Math.hypot(state.player.x - coin.x, state.player.y + playerHeight * 0.5 - coin.y) <= radius) {
          state.collected.add(coin.id);
          state.score += coin.value ?? 1;
          emit("collect", coin.id);
        }
      }
      for (const checkpoint of config.checkpoints) {
        if (state.activatedCheckpoints.has(checkpoint.id)) continue;
        if (Math.hypot(state.player.x - checkpoint.x, state.player.y - checkpoint.y) <= (checkpoint.radius ?? 0.7)) {
          state.checkpointId = checkpoint.id;
          state.activatedCheckpoints.add(checkpoint.id);
          emit("checkpoint", checkpoint.id);
        }
      }
      for (const hazard of config.hazards) {
        if (rectsOverlap(platformerPlayerRect(state.player, playerWidth, playerHeight), hazard)) {
          respawn("hazard", hazard.id);
          break;
        }
      }
      if (state.player.y < config.lowerBound) respawn("fall");
      if (config.finish && state.player.x >= config.finish.x && Math.abs(state.player.y - config.finish.y) <= 1.25) {
        state.status = "completed";
        emit("complete");
      }
      return snapshot();
    },
    reset(checkpointId) {
      events = [];
      state = createPlatformerState(config, checkpointId);
      body = createBody();
      return snapshot();
    },
    snapshot,
    events() {
      return [...events];
    },
    consumeEvents() {
      const consumed = [...events];
      events = [];
      return consumed;
    }
  };
}

export function createGameAssetBoundPlatformerLevel(options: GameAssetBoundPlatformerLevelOptions): GameAssetBoundPlatformerLevel {
  assertGameAssetId(options.characterAsset, "characterAsset");
  const level = options.level;
  const platforms = [...(level.platforms ?? [])];
  const checkpoints = [...(level.checkpoints ?? [])];
  const minPlayableSeconds = Math.max(30, options.minPlayableSeconds ?? 30);
  const minCheckpoints = options.minCheckpoints ?? 3;
  const minSurfaceCount = options.minSurfaceCount ?? 4;
  const start = level.start ?? DEFAULT_PLATFORMER_LEVEL.start;
  const finish = level.finish;
  const moveSpeed = Math.max(0.001, level.moveSpeed ?? DEFAULT_PLATFORMER_LEVEL.moveSpeed);
  if (!finish) throw new Error("game.assetBoundPlatformerLevel requires a finish point for public platformer examples.");
  if (finish.x <= start.x) throw new Error("game.assetBoundPlatformerLevel requires finish.x to be ahead of start.x.");
  if (platforms.length < minSurfaceCount) {
    throw new Error(`game.assetBoundPlatformerLevel requires at least ${minSurfaceCount} playable surfaces.`);
  }
  if (checkpoints.length < minCheckpoints) {
    throw new Error(`game.assetBoundPlatformerLevel requires at least ${minCheckpoints} checkpoints.`);
  }
  /*
   * Surface-map validation runs before the duration check.
   *
   * Both can fail for the same underlying cause -- too few real playable surfaces -- and
   * duration is the *derived* quantity. Reporting a duration shortfall for a level that
   * does not have enough surfaces names a symptom rather than the problem, which is what a
   * caller then tries to fix.
   */
  const surfaceIds = new Set(platforms.map((platform) => platform.id));
  const playableSurfaceMap = options.playableSurfaceMap;
  if (playableSurfaceMap) {
    validatePlatformerPlayableSurfaceMap(playableSurfaceMap, options.worldAssetBindings, surfaceIds, minPlayableSeconds);
  }
  const traversalSeconds = roundGameMetric((finish.x - start.x) / moveSpeed);
  const authoredPlayableSeconds = roundGameMetric(options.authoredPlayableSeconds ?? traversalSeconds);
  if (!Number.isFinite(authoredPlayableSeconds) || authoredPlayableSeconds <= 0) {
    throw new Error("game.assetBoundPlatformerLevel authoredPlayableSeconds must be a positive finite duration.");
  }
  if (authoredPlayableSeconds < minPlayableSeconds) {
    throw new Error(
      `game.assetBoundPlatformerLevel requires at least ${minPlayableSeconds}s of authored playable path; ` +
      `traversal at moveSpeed ${moveSpeed} is ${traversalSeconds}s. Suggested fix: state authoredPlayableSeconds explicitly, ` +
      "since raw traversal time is a lower bound on session length rather than an estimate of it."
    );
  }
  const worldAssets = validatePlatformerWorldBindings(options.worldAssetBindings, surfaceIds);
  const worldAssetHashes = Object.fromEntries(options.worldAssetBindings
    .filter((binding) => typeof binding.worldAssetHash === "string")
    .map((binding) => [binding.worldAsset, binding.worldAssetHash as string]));

  /*
   * Motion must be consistent with the geometry the level ships.
   *
   * Nothing previously related jump tuning to platform spacing, so a level could ship a
   * jump that overshoots its own course by several times and every gate still passed:
   * the level is solvable (an over-powered jump clears everything), the screenshots look
   * correct, and no check compared apex height to step height. Skyline shipped
   * `jumpVelocity: 7.4` with the default `gravity: -22` -- a 1.245-unit apex over
   * 0.216-unit steps -- which is the reported floating, the unreliable landings, and the
   * platforms reading as disconnected strips.
   *
   * Public asset-bound levels are therefore validated here. `motionTuning: "reported"`
   * keeps the report without throwing, for a route that is deliberately mid-migration.
   */
  /*
   * The character's height comes from the level itself, so a route does not have to
   * restate it for the check to be character-aware. Without this the floaty ceiling is
   * measured against the tallest step alone, and a mesh-extracted course whose steps are
   * shorter than the character (Skyline: 0.36 steps, 0.52 hero) rejects every jump that
   * is actually visible next to the player.
   */
  const characterHeight = (level.playerSize ?? DEFAULT_PLATFORMER_LEVEL.playerSize)?.[1];
  const motionReport = validatePlatformerMotion(
    platforms,
    {
      gravity: level.gravity ?? DEFAULT_PLATFORMER_LEVEL.gravity,
      jumpVelocity: level.jumpVelocity ?? DEFAULT_PLATFORMER_LEVEL.jumpVelocity,
      moveSpeed
    },
    {
      ...(characterHeight === undefined ? {} : { characterHeight }),
      ...(options.motionLimits ?? {})
    }
  );
  if (!motionReport.passes && (options.motionTuning ?? "enforced") === "enforced") {
    const failures = motionReport.checks.filter((check) => !check.passes);
    throw new Error(
      `game.assetBoundPlatformerLevel motion tuning is inconsistent with the level geometry: ${
        failures.map((check) => `${check.id} (${check.detail})`).join("; ")
      }. Suggested fix: derive gravity, jumpVelocity and moveSpeed with solvePlatformerMotion(level.platforms, { targetSessionSeconds }).`
    );
  }

  return {
    ...level,
    assetBinding: {
      kind: "aura-game-asset-bound-platformer-level",
      layoutContractVersion: "1.0",
      characterAsset: options.characterAsset,
      worldAssets,
      ...(Object.keys(worldAssetHashes).length > 0 ? { worldAssetHashes } : {}),
      ...(playableSurfaceMap ? { surfaceSource: playableSurfaceMap.source, characterScaleRatio: playableSurfaceMap.characterScaleRatio, confidence: playableSurfaceMap.confidence } : {}),
      authoredPlayableSeconds,
      traversalSeconds,
      surfaceCount: platforms.length,
      checkpointCount: checkpoints.length,
      /** Motion-vs-geometry consistency, so a floaty jump is visible in evidence. */
      motionReport
    }
  };
}

export function createGameAssetBoundRacingRoute(options: GameAssetBoundRacingRouteOptions): GameAssetBoundRacingRoute {
  assertGameAssetId(options.vehicleAsset, "vehicleAsset");
  assertGameAssetId(options.trackAsset, "trackAsset");
  const points = [...options.route.points];
  const checkpoints = [...(options.route.checkpoints ?? [])];
  const minLapSeconds = Math.max(30, options.minLapSeconds ?? 30);
  const minCheckpoints = options.minCheckpoints ?? 4;
  const minRouteLength = options.minRouteLength ?? 6;
  if (points.length < 8) throw new Error("game.assetBoundRacingRoute requires at least 8 route points.");
  if (checkpoints.length < minCheckpoints) {
    throw new Error(`game.assetBoundRacingRoute requires at least ${minCheckpoints} checkpoints.`);
  }
  const routeLength = roundGameMetric(measureRacingRouteLength(options.route));
  if (routeLength < minRouteLength) {
    throw new Error(`game.assetBoundRacingRoute requires route length >= ${minRouteLength}.`);
  }
  if (options.authoredLapSeconds < minLapSeconds) {
    throw new Error(`game.assetBoundRacingRoute requires at least ${minLapSeconds}s authored lap duration.`);
  }
  if (options.topology) {
    validateRacingTrackTopology(options.topology, options.trackAsset, points, checkpoints, minLapSeconds);
  }
  const authoredLapSeconds = roundGameMetric(options.authoredLapSeconds);
  const certifiedSpeed = roundGameMetric(routeLength / authoredLapSeconds);
  return {
    ...options.route,
    assetBinding: {
      kind: "aura-game-asset-bound-racing-route",
      layoutContractVersion: "1.0",
      vehicleAsset: options.vehicleAsset,
      trackAsset: options.trackAsset,
      ...(options.topology ? { trackAssetHash: options.topology.assetHash, topologySource: options.topology.source, confidence: options.topology.confidence } : {}),
      routeLength,
      authoredLapSeconds,
      speedModel: {
        kind: "route-length-over-authored-lap-seconds",
        routeLength,
        authoredLapSeconds,
        certifiedSpeed,
        units: "game-units-per-second"
      },
      pointCount: points.length,
      checkpointCount: checkpoints.length
    }
  };
}

export function createGameRacingSurfaceQuery(route: GameRacingRoute): GameRacingSurfaceQuery {
  const segments = createRaceSegments(route);
  const length = segments.at(-1) ? segments[segments.length - 1].start + segments[segments.length - 1].length : 1;
  const roadHalfWidth = (isAssetBoundRacingRoute(route)
    ? Math.max(0.002, route.width ?? 1.2)
    : Math.max(0.25, route.width ?? 1.2)) * 0.5;
  const closed = route.closed !== false;
  function sampleAt(progress: number): GameRacingLineSample {
    const normalized = normalizeProgress(progress);
    const distance = normalized * length;
    let index = segments.findIndex((candidate) => distance >= candidate.start && distance <= candidate.start + candidate.length);
    if (index < 0) index = segments.length - 1;
    const segment = segments[index];
    const t = clampNumber((distance - segment.start) / segment.length, 0, 1);
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
      progress: normalized,
      heading: segment.heading,
      curvature: arcCurvature(segments, length, distance, closed)
    };
  }
  return {
    kind: "aura-game-racing-surface-query",
    certified: isAssetBoundRacingRoute(route),
    length,
    roadHalfWidth,
    query(position) {
      const nearest = nearestRacePoint(segments, length, position);
      const line = sampleAt(nearest.progress);
      return {
        onTrack: nearest.offset <= roadHalfWidth,
        progress: nearest.progress,
        distance: nearest.distance,
        trackOffset: nearest.offset,
        signedTrackOffset: nearest.signedOffset,
        roadHalfWidth,
        tangentHeading: line.heading,
        curvature: line.curvature
      };
    },
    sampleAt
  };
}

export function createGameRacingKit(options: GameRacingOptions): GameRacingKit {
  const routeId = options.route.id ?? "racing-route";
  const segments = createRaceSegments(options.route);
  const length = segments.at(-1) ? segments[segments.length - 1].start + segments[segments.length - 1].length : 1;
  const checkpoints = options.route.checkpoints?.length ? [...options.route.checkpoints] : [0.25, 0.5, 0.75, 0.98];
  const surfaceQuery = createGameRacingSurfaceQuery(options.route);
  const certifiedSpeed = isAssetBoundRacingRoute(options.route) ? options.route.assetBinding.speedModel.certifiedSpeed : undefined;
  const paceMultiplier = clampNumber(options.paceMultiplier ?? 1, 0.5, 4);
  const certifiedGameplaySpeed = certifiedSpeed === undefined ? undefined : certifiedSpeed * paceMultiplier;
  if (certifiedGameplaySpeed !== undefined && options.maxSpeed !== undefined && Math.abs(options.maxSpeed - certifiedGameplaySpeed) > 0.001) {
    throw new Error(`game.racing maxSpeed ${options.maxSpeed} conflicts with certified route speed ${certifiedGameplaySpeed} at gameplay pace ${paceMultiplier}.`);
  }
  const maxSpeed = certifiedGameplaySpeed ?? options.maxSpeed ?? 18;
  const acceleration = options.acceleration ?? 16;
  const brakeStrength = options.brakeStrength ?? 24;
  const reverseSpeed = options.reverseSpeed ?? 4;
  const drag = options.drag ?? 2.4;
  const steerRate = options.steerRate ?? 2.7;
  const boostAcceleration = options.boostAcceleration ?? 9;
  const offTrackDrag = options.offTrackDrag ?? 5.5;
  const boundaryInset = Math.max(0, options.boundaryInset ?? 0);
  const recoveryHeadingLimit = options.recoveryHeadingLimit === undefined
    ? undefined
    // Narrow asset-bound circuits may need a much tighter recovery corridor than
    // 0.1 rad (~5.7°): a long open-wheel chassis can put its outside-front contact
    // beyond the mesh while its centre is already recovered. Preserve the caller's
    // physical footprint decision down to a one-hundredth radian.
    : clampNumber(options.recoveryHeadingLimit, 0.01, Math.PI);
  const checkpointRadius = options.checkpointRadius ?? 0.07;
  const lapsToWin = Math.max(1, options.lapsToWin ?? 1);
  const motion = createGameArcadeVehicle({
    maxSpeed,
    acceleration,
    brakeStrength,
    reverseSpeed,
    drag,
    steerRate,
    boostAcceleration
  });
  let events: GameRacingEvent[] = [];
  let state = createRaceState(options.startProgress ?? 0);

  function createRaceState(progress: number): Omit<GameRacingSnapshot, "kind" | "routeId" | "events" | "checkpointCount" | "lapsToWin"> {
    const sample = sampleRaceRoute(segments, length, progress);
    const vehicle = motion.reset({ x: sample.x, z: sample.y, heading: sample.heading });
    return {
      frame: 0,
      time: 0,
      lap: 1,
      checkpoint: 0,
      lapTime: 0,
      bestTime: undefined,
      speed: vehicle.speed,
      drift: vehicle.drift,
      offTrack: false,
      progress: normalizeProgress(progress),
      distance: normalizeProgress(progress) * length,
      trackOffset: 0,
      signedTrackOffset: 0,
      position: { x: vehicle.x, y: vehicle.z },
      heading: vehicle.heading,
      status: "running"
    };
  }

  const emit = (type: GameRacingEventType, id?: string) => {
    events.push({ type, id, frame: state.frame, time: state.time, lap: state.lap, checkpoint: state.checkpoint });
  };
  const snapshot = (): GameRacingSnapshot => ({
    kind: "aura-game-racing-kit",
    routeId,
    checkpointCount: checkpoints.length,
    lapsToWin,
    events: [...events],
    ...state
  });
  const placeAtProgress = (progress: number, offset = 0) => {
    const sample = sampleRaceRoute(segments, length, progress);
    const normal = { x: -Math.sin(sample.heading), y: Math.cos(sample.heading) };
    const vehicle = motion.reset({
      x: sample.x + normal.x * offset,
      z: sample.y + normal.y * offset,
      heading: sample.heading,
      speed: state.speed,
      drift: state.drift
    });
    state = {
      ...state,
      progress: normalizeProgress(progress),
      distance: normalizeProgress(progress) * length,
      trackOffset: Math.abs(offset),
      signedTrackOffset: offset,
      position: { x: vehicle.x, y: vehicle.z },
      heading: vehicle.heading
    };
    return snapshot();
  };
  const resolveContact = (
    position: GameKitVec2,
    correction: { readonly heading?: number; readonly speedMultiplier?: number; readonly driftMultiplier?: number } = {}
  ) => {
    const contact = surfaceQuery.query(position);
    const vehicle = motion.constrain({
      x: position.x,
      z: position.y,
      heading: correction.heading,
      speedMultiplier: correction.speedMultiplier,
      driftMultiplier: correction.driftMultiplier
    });
    state = {
      ...state,
      speed: vehicle.speed,
      drift: vehicle.drift,
      heading: vehicle.heading,
      position: { x: vehicle.x, y: vehicle.z },
      progress: contact.progress,
      distance: contact.distance,
      trackOffset: contact.trackOffset,
      signedTrackOffset: contact.signedTrackOffset,
      offTrack: !contact.onTrack
    };
    return snapshot();
  };

  return {
    kind: "aura-game-racing-kit",
    maxSpeed,
    surfaceQuery,
    step(dt, input = {}) {
      events = [];
      const step = Math.min(0.05, Math.max(0, dt || 0));
      if (input.reset) {
        state = createRaceState(options.startProgress ?? 0);
        emit("reset");
        return snapshot();
      }
      if (state.status === "finished") return snapshot();
      const previousProgress = state.progress;
      state = { ...state, frame: state.frame + 1, time: state.time + step, lapTime: state.lapTime + step };
      const throttle = typeof input.throttle === "boolean" ? (input.throttle ? 1 : 0) : clampNumber(input.throttle ?? 0, 0, 1);
      const brake = typeof input.brake === "boolean" ? (input.brake ? 1 : 0) : clampNumber(input.brake ?? 0, 0, 1);
      const steer = clampNumber(input.steer ?? 0, -1, 1);
      let vehicle = motion.step(step, {
        throttle,
        brake,
        steer,
        drifting: input.drift,
        boost: input.boost
      });
      let position = {
        x: vehicle.x,
        y: vehicle.z
      };
      let contact = surfaceQuery.query(position);
      const vehicleCenterHalfWidth = boundaryInset > 0
        ? Math.max(0.001, contact.roadHalfWidth - Math.min(boundaryInset, contact.roadHalfWidth * 0.95))
        : contact.roadHalfWidth * 0.98;
      // A certified recovery clamps the centre exactly onto the admissible boundary.
      // Floating-point projection can return that same point a few ulps outside on the
      // next frame, which previously left `offTrack` latched forever after one touch.
      // Keep the tolerance proportional to the sampled road width so it is scale-safe
      // while remaining far smaller than a visible tyre/contact-patch displacement.
      const boundaryTolerance = Math.max(1e-6, contact.roadHalfWidth * 0.002);
      const offTrack = !contact.onTrack || contact.trackOffset > vehicleCenterHalfWidth + boundaryTolerance;
      if (offTrack) {
        if (!state.offTrack) emit("off-track");
        if (surfaceQuery.certified) {
          const center = sampleRaceRoute(segments, length, contact.progress);
          const dx = position.x - center.x;
          const dy = position.y - center.y;
          // Recover slightly inside the admissible centre corridor, not exactly on its
          // mathematical edge. A boundary-only clamp lets an inertial vehicle re-trigger
          // recovery every frame and never reaches a visibly settled "on road" state.
          const recoveryHalfWidth = vehicleCenterHalfWidth * 0.92;
          const scale = contact.trackOffset > 0 ? recoveryHalfWidth / contact.trackOffset : 0;
          position = { x: center.x + dx * scale, y: center.y + dy * scale };
          contact = surfaceQuery.query(position);
        }
        const headingError = normalizeRacingAngle(vehicle.heading - contact.tangentHeading);
        const recoveryHeading = recoveryHeadingLimit === undefined
          ? undefined
          : contact.tangentHeading + clampNumber(headingError, -recoveryHeadingLimit, recoveryHeadingLimit);
        vehicle = motion.constrain({
          x: position.x,
          z: position.y,
          heading: recoveryHeading,
          speedMultiplier: Math.max(0, 1 - offTrackDrag * step),
          driftMultiplier: recoveryHeadingLimit === undefined ? 1 : Math.max(0, 1 - step * 2.5)
        });
      }
      state = {
        ...state,
        speed: vehicle.speed,
        drift: vehicle.drift,
        heading: vehicle.heading,
        position: { x: vehicle.x, y: vehicle.z },
        progress: contact.progress,
        distance: contact.distance,
        trackOffset: contact.trackOffset,
        signedTrackOffset: contact.signedTrackOffset,
        offTrack
      };
      // Once every ordered checkpoint in the lap is credited there is no next
      // checkpoint. Falling back to progress `1` made every frame near the finish
      // line increment the counter again when a noisy nearest-segment projection
      // delayed the lap-wrap transition (Turbo visibly reached "Gate 62" in one
      // stint despite having six gates).
      const target = checkpoints[state.checkpoint];
      if (target !== undefined && progressDistance(state.progress, target) <= checkpointRadius && !offTrack) {
        emit("checkpoint", `checkpoint-${state.checkpoint + 1}`);
        state = { ...state, checkpoint: state.checkpoint + 1 };
      }
      if (state.checkpoint >= checkpoints.length && previousProgress > 0.72 && state.progress < 0.18 && !offTrack) {
        const bestTime = state.bestTime === undefined ? state.lapTime : Math.min(state.bestTime, state.lapTime);
        emit("lap", `lap-${state.lap}`);
        state = {
          ...state,
          lap: state.lap + 1,
          checkpoint: 0,
          bestTime,
          lapTime: 0,
          status: state.lap >= lapsToWin ? "finished" : "running"
        };
        if (state.status === "finished") emit("finish");
      }
      return snapshot();
    },
    resolveContact,
    reset(progress = options.startProgress ?? 0) {
      events = [];
      state = createRaceState(progress);
      return snapshot();
    },
    placeAtProgress,
    snapshot,
    camera() {
      return {
        kind: "aura-game-racing-camera",
        position: [state.position.x - Math.cos(state.heading) * 4, 3.2, state.position.y - Math.sin(state.heading) * 4],
        target: [state.position.x, 0.35, state.position.y],
        fov: 48
      };
    },
    events() {
      return [...events];
    },
    consumeEvents() {
      const consumed = [...events];
      events = [];
      return consumed;
    }
  };
}

function normalizeRacingAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

const FALLING_BLOCK_SHAPES: Record<GameFallingBlockPiece, readonly (readonly GameKitVec2[])[]> = {
  I: [
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
    [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 2, y: 3 }],
    [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]
  ],
  J: [
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }]
  ],
  L: [
    [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }],
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  O: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }]
  ],
  S: [
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }],
    [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }],
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  T: [
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }]
  ],
  Z: [
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    [{ x: 2, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }],
    [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 2 }]
  ]
};

export function createGameFallingBlocksKit(options: GameFallingBlocksOptions = {}): GameFallingBlocksKit {
  const width = options.width ?? 10;
  const height = options.height ?? 22;
  const hiddenRows = options.hiddenRows ?? 2;
  const lockDelayFrames = options.lockDelayFrames ?? 30;
  let seed = options.seed ?? 1;
  let rng = seed;
  let frame = 0;
  let board = cloneBoard(options.board ?? emptyBoard(width, height));
  let queue: GameFallingBlockPiece[] = [];
  let active: GameFallingBlockActivePiece | null = null;
  let hold: GameFallingBlockPiece | null = null;
  let holdUsed = false;
  let score = 0;
  let lines = 0;
  let level = 1;
  let combo = -1;
  let backToBack = false;
  let lockTimer = 0;
  let gravityCounter = 0;
  let gameOver = false;
  let events: GameFallingBlocksEvent[] = [];
  let replay: { frame: number; action: GameFallingBlockAction }[] = [];

  const gravityFrames = () => Math.max(1, options.gravityFrames ?? Math.floor(Math.max(2, 48 - (level - 1) * 5)));
  const emit = (type: GameFallingBlocksEvent["type"], patch: Partial<GameFallingBlocksEvent> = {}) => {
    events.push({ type, frame, ...patch });
  };
  const refillQueue = () => {
    while (queue.length < 7) {
      const shuffled = shuffleBag(rng);
      rng = shuffled.rng;
      queue.push(...shuffled.bag);
    }
  };
  const spawn = () => {
    refillQueue();
    const kind = queue.shift() ?? "I";
    const piece = { kind, x: Math.floor(width / 2) - 2, y: 0, rotation: 0 as GameFallingBlockRotation };
    active = piece;
    holdUsed = false;
    lockTimer = 0;
    emit("spawn", { piece: kind });
    if (!canPlace(board, piece, width, height)) {
      gameOver = true;
      emit("game-over", { piece: kind });
    }
  };
  const snapshot = (): GameFallingBlocksSnapshot => ({
    kind: "aura-game-falling-blocks-kit",
    width,
    height,
    hiddenRows,
    frame,
    seed,
    board: cloneBoard(board),
    active,
    hold,
    holdUsed,
    queue: [...queue],
    score,
    lines,
    level,
    combo,
    backToBack,
    lockDelayFrames,
    gravityFrames: gravityFrames(),
    gameOver,
    checksum: fallingBlocksChecksum({ board, active, hold, queue, score, lines, level, frame, gameOver }),
    events: [...events]
  });
  const lock = () => {
    if (!active) return;
    board = placePiece(board, active);
    emit("lock", { piece: active.kind });
    const cleared = clearLines(board);
    board = cleared.board;
    if (cleared.lines > 0) {
      lines += cleared.lines;
      combo += 1;
      const difficult = cleared.lines === 4;
      score += scoreForLines(cleared.lines, level) + Math.max(0, combo) * 50;
      backToBack = difficult ? backToBack || cleared.lines === 4 : false;
      level = Math.floor(lines / 10) + 1;
      emit("line-clear", { lines: cleared.lines, score });
    } else {
      combo = -1;
    }
    active = null;
    spawn();
  };
  const tryMove = (piece: GameFallingBlockActivePiece) => {
    if (!canPlace(board, piece, width, height)) return false;
    active = piece;
    lockTimer = 0;
    return true;
  };
  const hardDropDistance = () => {
    if (!active) return 0;
    let distance = 0;
    let candidate = { ...active, y: active.y + 1 };
    while (canPlace(board, candidate, width, height)) {
      distance += 1;
      candidate = { ...candidate, y: candidate.y + 1 };
    }
    return distance;
  };
  const reset = (nextSeed = seed) => {
    seed = nextSeed;
    rng = seed;
    frame = 0;
    board = cloneBoard(options.board ?? emptyBoard(width, height));
    queue = [];
    active = null;
    hold = null;
    holdUsed = false;
    score = 0;
    lines = 0;
    level = 1;
    combo = -1;
    backToBack = false;
    lockTimer = 0;
    gravityCounter = 0;
    gameOver = false;
    events = [];
    replay = [];
    emit("reset");
    spawn();
    return snapshot();
  };

  const kit: GameFallingBlocksKit = {
    kind: "aura-game-falling-blocks-kit",
    step(action) {
      if (action.type !== "reset") replay.push({ frame, action });
      if (action.type === "reset") return reset(action.seed);
      if (action.type === "move") return this.move(action.dx);
      if (action.type === "rotate") return this.rotate(action.direction);
      if (action.type === "softDrop") return this.softDrop();
      if (action.type === "hardDrop") return this.hardDrop();
      if (action.type === "hold") return this.hold();
      return this.tick(action.frames);
    },
    tick(framesToAdvance = 1) {
      events = [];
      for (let index = 0; index < Math.max(1, framesToAdvance); index += 1) {
        frame += 1;
        if (gameOver || !active) continue;
        gravityCounter += 1;
        if (gravityCounter >= gravityFrames()) {
          gravityCounter = 0;
          if (!tryMove({ ...active, y: active.y + 1 })) {
            lockTimer += 1;
            if (lockTimer >= lockDelayFrames) lock();
          }
        }
      }
      return snapshot();
    },
    move(dx) {
      events = [];
      if (active && !gameOver && tryMove({ ...active, x: active.x + dx })) emit("move", { piece: active.kind });
      return snapshot();
    },
    rotate(direction = 1) {
      events = [];
      if (!active || gameOver) return snapshot();
      const nextRotation = wrapRotation(active.rotation + direction);
      for (const [kickX, kickY] of [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0, -1]] as const) {
        const candidate = { ...active, x: active.x + kickX, y: active.y + kickY, rotation: nextRotation };
        if (tryMove(candidate)) {
          emit("rotate", { piece: active.kind });
          break;
        }
      }
      return snapshot();
    },
    softDrop() {
      events = [];
      frame += 1;
      if (active && !gameOver) {
        if (tryMove({ ...active, y: active.y + 1 })) {
          score += 1;
          emit("soft-drop", { piece: active.kind, score });
        } else {
          lockTimer = lockDelayFrames;
          lock();
        }
      }
      return snapshot();
    },
    hardDrop() {
      events = [];
      frame += 1;
      if (active && !gameOver) {
        const distance = hardDropDistance();
        active = { ...active, y: active.y + distance };
        score += distance * 2;
        emit("hard-drop", { piece: active.kind, score });
        lock();
      }
      return snapshot();
    },
    hold() {
      events = [];
      if (!active || holdUsed || gameOver) return snapshot();
      const previous = hold;
      hold = active.kind;
      holdUsed = true;
      emit("hold", { piece: hold });
      if (previous) {
        active = { kind: previous, x: Math.floor(width / 2) - 2, y: 0, rotation: 0 };
      } else {
        active = null;
        spawn();
        holdUsed = true;
      }
      return snapshot();
    },
    reset,
    setBoard(nextBoard) {
      events = [];
      board = cloneBoard(nextBoard);
      return snapshot();
    },
    setActive(piece) {
      events = [];
      active = piece;
      return snapshot();
    },
    snapshot,
    checksum() {
      return snapshot().checksum;
    },
    replay() {
      return [...replay];
    },
    events() {
      return [...events];
    },
    consumeEvents() {
      const consumed = [...events];
      events = [];
      return consumed;
    }
  };
  reset(seed);
  return kit;
}

function createPlatformerState(config: Required<Omit<GamePlatformerLevel, "id">> & { readonly id: string }, checkpointId = "start"): MutablePlatformerState {
  const spawn = platformerSpawn(config, checkpointId);
  return {
    status: "playing",
    frame: 0,
    time: 0,
    player: {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      dashCooldown: 0
    },
    score: 0,
    lives: config.lives,
    deaths: 0,
    respawnControlLock: 0,
    respawnAwaitingNeutralInput: false,
    checkpointId,
    collected: new Set<string>(),
    activatedCheckpoints: checkpointId === "start" ? new Set<string>() : new Set([checkpointId])
  };
}

function platformerSpawn(config: Required<Omit<GamePlatformerLevel, "id">> & { readonly id: string }, checkpointId: string): GameKitVec2 {
  if (checkpointId !== "start") {
    const checkpoint = config.checkpoints.find((candidate) => candidate.id === checkpointId);
    if (checkpoint) {
      const supportingSurface = platformerSpawnSurface(config.platforms, checkpoint.x);
      if (supportingSurface) {
        const minX = supportingSurface.x + Math.min(config.playerSize[0] * 0.5, supportingSurface.width * 0.25);
        const maxX = supportingSurface.x + supportingSurface.width - Math.min(config.playerSize[0] * 0.5, supportingSurface.width * 0.25);
        return {
          x: clampNumber(checkpoint.x, Math.min(minX, maxX), Math.max(minX, maxX)),
          y: platformTop(supportingSurface)
        };
      }
      return checkpoint;
    }
  }
  return config.start;
}

function platformerSpawnSurface(platforms: readonly GameKitRect[], checkpointX: number): GameKitRect | undefined {
  const containing = platforms
    .filter((surface) => checkpointX >= surface.x && checkpointX <= surface.x + surface.width)
    .sort((left, right) => platformTop(right) - platformTop(left));
  if (containing[0]) return containing[0];
  return [...platforms].sort((left, right) => {
    const leftDistance = Math.abs(checkpointX - clampNumber(checkpointX, left.x, left.x + left.width));
    const rightDistance = Math.abs(checkpointX - clampNumber(checkpointX, right.x, right.x + right.width));
    return leftDistance - rightDistance;
  })[0];
}

function platformerMovingRectsAt(time: number, config: Required<Omit<GamePlatformerLevel, "id">> & { readonly id: string }): readonly GameKitRect[] {
  return config.movingPlatforms.map((platform) => {
    const phase = ((time / Math.max(0.001, platform.period)) + (platform.phase ?? 0)) * Math.PI * 2;
    const offset = Math.sin(phase) * platform.amplitude;
    return {
      id: platform.id,
      x: platform.axis === "x" ? platform.x + offset : platform.x,
      y: platform.axis === "y" ? platform.y + offset : platform.y,
      width: platform.width,
      height: platform.height
    };
  });
}

function platformTop(rect: GameKitRect): number {
  return rect.y + rect.height;
}

function platformerHorizontalOverlap(playerX: number, playerWidth: number, rect: GameKitRect, tolerance = 0): boolean {
  return playerX + playerWidth / 2 >= rect.x - tolerance && playerX - playerWidth / 2 <= rect.x + rect.width + tolerance;
}

function platformerPlayerRect(player: { readonly x: number; readonly y: number }, width: number, height: number): GameKitRect {
  return { id: "player", x: player.x - width / 2, y: player.y, width, height };
}

function rectsOverlap(a: GameKitRect, b: GameKitRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Shortest signed angle from `from` to `to`, radians, in (-pi, pi].
 *
 * Steering toward a heading requires the *shortest* way round. Subtracting raw headings makes a car
 * whose target is just across the +/-pi wrap take the long way and spin.
 */
function signedAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta <= -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Signed curvature of the racing line, as 1/radius in route units, measured over an arc window.
 *
 * A polyline has no curvature within a segment and an undefined spike at each vertex. Attributing
 * the whole heading change at a vertex to that vertex — the obvious approach, and the one this
 * previously used — makes curvature a function of where the author happened to place vertices
 * rather than of the shape of the road. On a 33-point circuit that produced an impulse train:
 * curvature read 0 along a segment then spiked, so the radius reported for one continuous corner
 * swung 0.69 -> 3.01 -> 6.03 -> 16.17 -> 7.24 within 60 frames. Adjacent samples 0.094 units apart
 * differed by 2.068 in curvature — larger than the p99 curvature of the whole track, so the signal
 * was mostly discretisation artefact.
 *
 * Both consumers of curvature are harmed by that, and neither can defend itself:
 *
 * - A speed profile solves corner entry speed as `sqrt(lateralLimit * radius)`. Fed a spike, it
 *   demands a near-stop at an arbitrary vertex and full speed one sample later.
 * - A steering feedforward sets `atan(wheelbase * curvature)`. Fed a spike, it commands full lock
 *   for a few frames and zero for the rest, so the car saws through corners and runs wide — the
 *   "car will not turn / slides off on turns" symptom, from the geometry layer rather than the tyre
 *   model that usually gets blamed for it.
 *
 * The fix is to measure curvature the way it is defined — over an arc, not at a point. Three points
 * spaced `window` along the line give the Menger curvature, which is the signed reciprocal radius
 * of the circle through them. The window is `CURVATURE_WINDOW_SEGMENTS` times the mean segment
 * length, so it adapts to how finely the route is authored instead of assuming a vertex density.
 *
 * Widening the window trades resolution for smoothness, and the trade has a floor and a ceiling:
 * too narrow and the artefact survives, too wide and a real hairpin is averaged away into a corner
 * the car takes far too fast. On the certified circuit, 2x cuts the adjacent-sample jump 21x
 * (2.068 -> 0.098) while *preserving* corner magnitude (p90 |k| 0.736 -> 0.808); 3x smooths further
 * but understates the tightest corner by 19% (max |k| 0.808 -> 0.565, i.e. minimum radius 1.00 ->
 * 1.51), which would have the profile carry ~23% too much speed into the hairpin. Hence 2x.
 */
const CURVATURE_WINDOW_SEGMENTS = 2;

function positionAtDistance(
  segments: readonly RaceSegment[],
  totalLength: number,
  distance: number,
  closed: boolean
): { readonly x: number; readonly y: number } {
  const along = closed
    ? ((distance % totalLength) + totalLength) % totalLength
    : clampNumber(distance, 0, totalLength);
  let index = segments.findIndex((candidate) => along >= candidate.start && along <= candidate.start + candidate.length);
  if (index < 0) index = segments.length - 1;
  const segment = segments[index];
  const t = clampNumber((along - segment.start) / segment.length, 0, 1);
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t
  };
}

function arcCurvature(
  segments: readonly RaceSegment[],
  totalLength: number,
  distance: number,
  closed: boolean
): number {
  if (segments.length < 2 || totalLength <= 1e-9) return 0;
  const meanSegment = totalLength / segments.length;
  /*
   * On an open path the window has to shrink near the ends rather than clamp: clamping would
   * collapse two of the three samples onto the same point and report 0 curvature exactly where a
   * track often turns most.
   */
  const room = closed ? totalLength / 3 : Math.min(distance, totalLength - distance);
  const window = Math.min(meanSegment * CURVATURE_WINDOW_SEGMENTS, Math.max(1e-6, room));
  if (window <= 1e-6) return 0;
  const a = positionAtDistance(segments, totalLength, distance - window, closed);
  const b = positionAtDistance(segments, totalLength, distance, closed);
  const c = positionAtDistance(segments, totalLength, distance + window, closed);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  /*
   * Menger curvature: 4 * area / (|ab| |bc| |ca|), signed by the cross product so a left-hand
   * corner is positive. The cross product is twice the triangle area, hence the factor 2 here.
   */
  const cross = abx * bcy - aby * bcx;
  const denominator = Math.hypot(abx, aby) * Math.hypot(bcx, bcy) * Math.hypot(acx, acy);
  if (denominator <= 1e-12) return 0;
  return (2 * cross) / denominator;
}

function createRaceSegments(route: GameRacingRoute): readonly RaceSegment[] {
  const points = [...route.points];
  if (points.length < 2) throw new Error("game.racing route needs at least two points.");
  if (route.closed !== false) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.x !== last.x || first.y !== last.y) points.push(first);
  }
  let cursor = 0;
  return points.slice(0, -1).map((from, index) => {
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(0.0001, Math.hypot(dx, dy));
    const segment = { from, to, length, start: cursor, heading: Math.atan2(dy, dx) };
    cursor += length;
    return segment;
  });
}

function measureRacingRouteLength(route: GameRacingRoute): number {
  const segments = createRaceSegments(route);
  return segments.at(-1) ? segments[segments.length - 1].start + segments[segments.length - 1].length : 0;
}

function isAssetBoundRacingRoute(route: GameRacingRoute): route is GameAssetBoundRacingRoute {
  const candidate = route as Partial<GameAssetBoundRacingRoute>;
  return candidate.assetBinding?.kind === "aura-game-asset-bound-racing-route";
}

function isAssetBoundPlatformerLevel(level: GamePlatformerLevel): level is GameAssetBoundPlatformerLevel {
  const candidate = level as Partial<GameAssetBoundPlatformerLevel>;
  return candidate.assetBinding?.kind === "aura-game-asset-bound-platformer-level";
}

function validatePlatformerWorldBindings(
  bindings: readonly GamePlatformerWorldAssetBinding[],
  surfaceIds: ReadonlySet<string>
): readonly string[] {
  if (bindings.length === 0) throw new Error("game.assetBoundPlatformerLevel requires at least one world asset binding.");
  const covered = new Set<string>();
  const worldAssets: string[] = [];
  for (const binding of bindings) {
    assertGameAssetId(binding.worldAsset, "worldAsset");
    if (binding.surfaceIds.length === 0) {
      throw new Error(`game.assetBoundPlatformerLevel world asset ${binding.worldAsset} has no bound playable surfaces.`);
    }
    worldAssets.push(binding.worldAsset);
    for (const surfaceId of binding.surfaceIds) {
      if (!surfaceIds.has(surfaceId)) {
        throw new Error(`game.assetBoundPlatformerLevel binding references unknown surface ${surfaceId}.`);
      }
      covered.add(surfaceId);
    }
  }
  for (const surfaceId of surfaceIds) {
    if (!covered.has(surfaceId)) throw new Error(`game.assetBoundPlatformerLevel surface ${surfaceId} is not bound to a world asset.`);
  }
  return [...new Set(worldAssets)];
}

function validateRacingTrackTopology(
  topology: GameRacingTrackTopology,
  trackAsset: string,
  points: readonly GameKitVec2[],
  checkpoints: readonly number[],
  minLapSeconds: number
): void {
  assertGameAssetId(topology.assetId, "topology.assetId");
  if (topology.assetId !== trackAsset) {
    throw new Error(`game.assetBoundRacingRoute topology asset ${topology.assetId} does not match track asset ${trackAsset}.`);
  }
  assertSha256Hash(topology.assetHash, "topology.assetHash");
  if (!isPublicGameGeometrySource(topology.source)) {
    throw new Error("game.assetBoundRacingRoute requires asset-mesh-extracted or overlay-validated topology for public racing examples.");
  }
  if (topology.source !== "asset-mesh-extracted" && !topology.evidence.routeOverlay) {
    throw new Error("game.assetBoundRacingRoute requires retained route overlay evidence for authored topology.");
  }
  if (topology.roadCenterline.length < points.length) {
    throw new Error("game.assetBoundRacingRoute topology must include at least the generated route point count.");
  }
  if (topology.checkpoints.length < checkpoints.length) {
    throw new Error("game.assetBoundRacingRoute topology must include every generated checkpoint.");
  }
  if (topology.estimatedLapSeconds < minLapSeconds) {
    throw new Error(`game.assetBoundRacingRoute topology requires at least ${minLapSeconds}s estimated lap duration.`);
  }
  if (topology.confidence < 0.65) {
    throw new Error("game.assetBoundRacingRoute topology confidence is too low for a public racing example.");
  }
  validateRacingModelAlignment(topology.modelAlignment, "game.assetBoundRacingRoute");
}

function validatePlatformerPlayableSurfaceMap(
  playableSurfaceMap: GamePlatformerPlayableSurfaceMap,
  bindings: readonly GamePlatformerWorldAssetBinding[],
  surfaceIds: ReadonlySet<string>,
  minPlayableSeconds: number
): void {
  assertGameAssetId(playableSurfaceMap.assetId, "playableSurfaceMap.assetId");
  assertSha256Hash(playableSurfaceMap.assetHash, "playableSurfaceMap.assetHash");
  if (!isPublicGameGeometrySource(playableSurfaceMap.source)) {
    throw new Error("game.assetBoundPlatformerLevel requires asset-mesh-extracted or overlay-validated playable surfaces for public platformer examples.");
  }
  if (playableSurfaceMap.source !== "asset-mesh-extracted" && !playableSurfaceMap.evidence.routeOverlay) {
    throw new Error("game.assetBoundPlatformerLevel requires retained surface overlay evidence for authored playable surfaces.");
  }
  if (playableSurfaceMap.estimatedCompletionSeconds < minPlayableSeconds) {
    throw new Error(`game.assetBoundPlatformerLevel playable surface map requires at least ${minPlayableSeconds}s estimated completion time.`);
  }
  if (playableSurfaceMap.characterScaleRatio <= 0 || playableSurfaceMap.characterScaleRatio > 1.25) {
    throw new Error("game.assetBoundPlatformerLevel playable surface map character scale ratio is invalid.");
  }
  if (playableSurfaceMap.confidence < 0.65) {
    throw new Error("game.assetBoundPlatformerLevel playable surface confidence is too low for a public platformer example.");
  }
  validatePlatformerModelAlignment(playableSurfaceMap.modelAlignment, "game.assetBoundPlatformerLevel");
  const publicPlayableSurfaceIds = new Set(playableSurfaceMap.surfaces
    .filter(isPublicPlatformerPlayableSurface)
    .map((surface) => surface.id));
  if (publicPlayableSurfaceIds.size < 5) {
    throw new Error("game.assetBoundPlatformerLevel playableSurfaceMap requires at least five ground/platform/moving surfaces.");
  }
  for (const surfaceId of surfaceIds) {
    if (!publicPlayableSurfaceIds.has(surfaceId)) {
      throw new Error(`game.assetBoundPlatformerLevel surface ${surfaceId} is missing from playableSurfaceMap.`);
    }
  }
  const binding = bindings.find((candidate) => candidate.worldAsset === playableSurfaceMap.assetId);
  if (!binding) {
    throw new Error(`game.assetBoundPlatformerLevel playableSurfaceMap asset ${playableSurfaceMap.assetId} is not bound to this level.`);
  }
  if (binding.worldAssetHash !== playableSurfaceMap.assetHash) {
    throw new Error(`game.assetBoundPlatformerLevel playableSurfaceMap hash does not match ${playableSurfaceMap.assetId}.`);
  }
}

function isPublicPlatformerPlayableSurface(surface: GamePlatformerPlayableSurfaceMap["surfaces"][number]): boolean {
  return surface.kind === "ground" || surface.kind === "platform" || surface.kind === "moving" || surface.kind === "finish";
}

function assertFiniteNumber(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`game asset-bound helper requires ${field} to be finite.`);
}

function assertNonEmptyString(value: string | undefined, field: string): void {
  if (!value?.trim()) throw new Error(`game asset-bound helper requires ${field}.`);
}

function assertVec3(value: readonly [number, number, number], field: string): void {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`game asset-bound helper requires ${field} to be a 3D tuple.`);
  }
  assertFiniteNumber(value[0], `${field}.x`);
  assertFiniteNumber(value[1], `${field}.y`);
  assertFiniteNumber(value[2], `${field}.z`);
}

function validateModelBounds(bounds: GameGeometryModelBounds, field: string): void {
  assertVec3(bounds.min, `${field}.min`);
  assertVec3(bounds.max, `${field}.max`);
  const width = bounds.max[0] - bounds.min[0];
  const height = bounds.max[1] - bounds.min[1];
  const depth = bounds.max[2] - bounds.min[2];
  if (width <= 0 || height <= 0 || depth <= 0) {
    throw new Error(`game asset-bound helper requires ${field} to describe nonzero model bounds.`);
  }
}

function assertPointInsideModelBounds(
  point: readonly [number, number, number],
  bounds: GameGeometryModelBounds,
  field: string
): void {
  const epsilon = 0.001;
  const axis = ["x", "y", "z"] as const;
  for (let index = 0; index < 3; index += 1) {
    const value = point[index];
    if (value < bounds.min[index] - epsilon || value > bounds.max[index] + epsilon) {
      throw new Error(`game asset-bound helper requires ${field}.${axis[index]} to be inside model bounds.`);
    }
  }
}

function validateModelAlignmentSource(
  source: GameAssetGeometrySource,
  evidence: { readonly routeOverlay?: string; readonly notes: string },
  field: string
): void {
  if (!isPublicGameGeometrySource(source)) {
    throw new Error(`game asset-bound helper requires ${field}.source to be mesh-extracted or overlay-validated.`);
  }
  assertNonEmptyString(evidence.notes, `${field}.evidence.notes`);
  if (source !== "asset-mesh-extracted") {
    assertNonEmptyString(evidence.routeOverlay, `${field}.evidence.routeOverlay`);
  }
}

function validateRacingModelAlignment(alignment: GameRacingTopologyModelAlignment, context: string): void {
  if (!alignment) {
    throw new Error(`${context} requires modelAlignment for scene-bound racing topology.`);
  }
  validateModelBounds(alignment.modelBounds, `${context}.modelAlignment.modelBounds`);
  assertVec3(alignment.modelPoint, `${context}.modelAlignment.modelPoint`);
  assertPointInsideModelBounds(
    alignment.modelPoint,
    alignment.modelBounds,
    `${context}.modelAlignment.modelPoint`
  );
  assertFiniteNumber(alignment.gamePoint.x, `${context}.modelAlignment.gamePoint.x`);
  assertFiniteNumber(alignment.gamePoint.z, `${context}.modelAlignment.gamePoint.z`);
  validateRacingModelAnchors(alignment, context);
  validateModelAlignmentSource(alignment.source, alignment.evidence, `${context}.modelAlignment`);
}

function validatePlatformerModelAlignment(alignment: GamePlatformerSurfaceModelAlignment, context: string): void {
  if (!alignment) {
    throw new Error(`${context} requires modelAlignment for scene-bound platformer surfaces.`);
  }
  validateModelBounds(alignment.modelBounds, `${context}.modelAlignment.modelBounds`);
  assertVec3(alignment.modelPoint, `${context}.modelAlignment.modelPoint`);
  assertPointInsideModelBounds(
    alignment.modelPoint,
    alignment.modelBounds,
    `${context}.modelAlignment.modelPoint`
  );
  assertFiniteNumber(alignment.gamePoint.x, `${context}.modelAlignment.gamePoint.x`);
  assertFiniteNumber(alignment.gamePoint.y, `${context}.modelAlignment.gamePoint.y`);
  validatePlatformerModelAnchors(alignment, context);
  validateModelAlignmentSource(alignment.source, alignment.evidence, `${context}.modelAlignment`);
}

function validateRacingModelAnchors(alignment: GameRacingTopologyModelAlignment, context: string): void {
  if (!alignment.anchorPairs) return;
  if (alignment.anchorPairs.length < 2) {
    throw new Error(`${context}.modelAlignment.anchorPairs requires at least two anchors when provided.`);
  }
  for (const [index, anchor] of alignment.anchorPairs.entries()) {
    assertNonEmptyString(anchor.id, `${context}.modelAlignment.anchorPairs[${index}].id`);
    assertVec3(anchor.modelPoint, `${context}.modelAlignment.anchorPairs[${index}].modelPoint`);
    assertPointInsideModelBounds(
      anchor.modelPoint,
      alignment.modelBounds,
      `${context}.modelAlignment.anchorPairs[${index}].modelPoint`
    );
    assertFiniteNumber(anchor.gamePoint.x, `${context}.modelAlignment.anchorPairs[${index}].gamePoint.x`);
    assertFiniteNumber(anchor.gamePoint.z, `${context}.modelAlignment.anchorPairs[${index}].gamePoint.z`);
  }
}

function validatePlatformerModelAnchors(alignment: GamePlatformerSurfaceModelAlignment, context: string): void {
  if (!alignment.anchorPairs) return;
  if (alignment.anchorPairs.length < 2) {
    throw new Error(`${context}.modelAlignment.anchorPairs requires at least two anchors when provided.`);
  }
  for (const [index, anchor] of alignment.anchorPairs.entries()) {
    assertNonEmptyString(anchor.id, `${context}.modelAlignment.anchorPairs[${index}].id`);
    assertVec3(anchor.modelPoint, `${context}.modelAlignment.anchorPairs[${index}].modelPoint`);
    assertPointInsideModelBounds(
      anchor.modelPoint,
      alignment.modelBounds,
      `${context}.modelAlignment.anchorPairs[${index}].modelPoint`
    );
    assertFiniteNumber(anchor.gamePoint.x, `${context}.modelAlignment.anchorPairs[${index}].gamePoint.x`);
    assertFiniteNumber(anchor.gamePoint.y, `${context}.modelAlignment.anchorPairs[${index}].gamePoint.y`);
  }
}

function assertGameAssetId(value: string, field: string): void {
  if (!value.trim()) throw new Error(`game asset-bound helper requires ${field}.`);
}

function assertSha256Hash(value: string, field: string): void {
  if (!/^sha256-[a-f0-9]{64}$/.test(value)) throw new Error(`game asset-bound helper requires ${field} to be a sha256- hash.`);
}

function isPublicGameGeometrySource(source: GameAssetGeometrySource): boolean {
  return source === "asset-mesh-extracted" || source === "manifest-authored-overlay-validated" || source === "compiler-authored-overlay-validated";
}

function roundGameMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sampleRaceRoute(segments: readonly RaceSegment[], length: number, progress: number): GameKitVec2 & { readonly heading: number } {
  const distance = normalizeProgress(progress) * length;
  const segment = segments.find((candidate) => distance >= candidate.start && distance <= candidate.start + candidate.length) ?? segments[segments.length - 1];
  const t = clampNumber((distance - segment.start) / segment.length, 0, 1);
  return {
    x: segment.from.x + (segment.to.x - segment.from.x) * t,
    y: segment.from.y + (segment.to.y - segment.from.y) * t,
    heading: segment.heading
  };
}

function nearestRacePoint(segments: readonly RaceSegment[], length: number, point: GameKitVec2): { readonly distance: number; readonly progress: number; readonly offset: number; readonly signedOffset: number } {
  let best = { distance: 0, offset: Number.POSITIVE_INFINITY, signedOffset: 0 };
  for (const segment of segments) {
    const dx = segment.to.x - segment.from.x;
    const dy = segment.to.y - segment.from.y;
    const t = clampNumber(((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / (segment.length * segment.length), 0, 1);
    const x = segment.from.x + dx * t;
    const y = segment.from.y + dy * t;
    const offset = Math.hypot(point.x - x, point.y - y);
    if (offset < best.offset) {
      // Signed lateral offset, positive to the left of travel direction. The magnitude alone cannot
      // tell a controller which way to steer back, so a route or AI that only sees `trackOffset`
      // has no way to correct its line: full opposite lock is a coin flip. The sign comes from the
      // 2D cross product of the segment direction with the vector to the car.
      const cross = dx * (point.y - segment.from.y) - dy * (point.x - segment.from.x);
      best = {
        distance: segment.start + segment.length * t,
        offset,
        signedOffset: cross >= 0 ? offset : -offset
      };
    }
  }
  return {
    distance: best.distance,
    progress: normalizeProgress(best.distance / length),
    offset: best.offset,
    signedOffset: best.signedOffset
  };
}

function progressDistance(a: number, b: number): number {
  const direct = Math.abs(normalizeProgress(a) - normalizeProgress(b));
  return Math.min(direct, 1 - direct);
}

function normalizeProgress(value: number): number {
  return ((value % 1) + 1) % 1;
}

function emptyBoard(width: number, height: number): GameFallingBlockBoard {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => null));
}

function cloneBoard(board: GameFallingBlockBoard): GameFallingBlockCell[][] {
  return board.map((row) => [...row]);
}

function pieceCells(piece: GameFallingBlockActivePiece): readonly GameKitVec2[] {
  return FALLING_BLOCK_SHAPES[piece.kind][piece.rotation].map((cell) => ({ x: piece.x + cell.x, y: piece.y + cell.y }));
}

function canPlace(board: GameFallingBlockBoard, piece: GameFallingBlockActivePiece, width: number, height: number): boolean {
  return pieceCells(piece).every((cell) => {
    if (cell.x < 0 || cell.x >= width || cell.y >= height) return false;
    if (cell.y < 0) return true;
    return board[cell.y]?.[cell.x] === null;
  });
}

function placePiece(board: GameFallingBlockBoard, piece: GameFallingBlockActivePiece): GameFallingBlockCell[][] {
  const next = cloneBoard(board);
  for (const cell of pieceCells(piece)) {
    if (cell.y >= 0 && cell.y < next.length && cell.x >= 0 && cell.x < next[cell.y].length) next[cell.y][cell.x] = piece.kind;
  }
  return next;
}

function clearLines(board: GameFallingBlockBoard): { readonly board: GameFallingBlockCell[][]; readonly lines: number } {
  const width = board[0]?.length ?? 10;
  const remaining = board.filter((row) => row.some((cell) => cell === null)).map((row) => [...row]);
  const lines = board.length - remaining.length;
  const empty = Array.from({ length: lines }, () => Array.from({ length: width }, () => null));
  return { board: [...empty, ...remaining], lines };
}

function scoreForLines(lines: number, level: number): number {
  if (lines === 1) return 100 * level;
  if (lines === 2) return 300 * level;
  if (lines === 3) return 500 * level;
  if (lines === 4) return 800 * level;
  return 0;
}

function shuffleBag(seed: number): { readonly bag: readonly GameFallingBlockPiece[]; readonly rng: number } {
  const bag = [...GAME_FALLING_BLOCK_PIECES];
  let rng = seed || 1;
  for (let index = bag.length - 1; index > 0; index -= 1) {
    rng = lcg(rng);
    const swap = rng % (index + 1);
    [bag[index], bag[swap]] = [bag[swap], bag[index]];
  }
  return { bag, rng };
}

function lcg(value: number): number {
  return (Math.imul(value || 1, 1664525) + 1013904223) >>> 0;
}

function wrapRotation(value: number): GameFallingBlockRotation {
  return (((value % 4) + 4) % 4) as GameFallingBlockRotation;
}

function fallingBlocksChecksum(input: {
  readonly board: GameFallingBlockBoard;
  readonly active: GameFallingBlockActivePiece | null;
  readonly hold: GameFallingBlockPiece | null;
  readonly queue: readonly GameFallingBlockPiece[];
  readonly score: number;
  readonly lines: number;
  readonly level: number;
  readonly frame: number;
  readonly gameOver: boolean;
}): string {
  const payload = JSON.stringify({
    board: input.board,
    active: input.active,
    hold: input.hold,
    queue: input.queue.slice(0, 7),
    score: input.score,
    lines: input.lines,
    level: input.level,
    frame: input.frame,
    gameOver: input.gameOver
  });
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}
