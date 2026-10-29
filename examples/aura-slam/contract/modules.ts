import type { AiController } from "./ai";
import type { PhysicsEventType, SimEvent } from "./events";
import type { InputFrame, InputSample, KeyboardBindings, ControllerBindings, SwipeShot, RawSwipeGesture } from "./input";
import type { ActorState, BallState, Difficulty, MatchState, ShotPreset, Side, StrokeKind, Surface } from "./sim";
import type { Vec3 } from "./units";

/* ---- M-PHYSICS (ports physics.js, 14.6 KB): pure functions over BallState; no clocks, no DOM. ---- */
export interface PhysicsKit {
  sample(ball: BallState, t: number): { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  timeToGround(ball: Pick<BallState, "z" | "vz">): number;
  timeToY(ball: BallState, y: number): number;
  landing(ball: BallState): { x: number; y: number; z: number; vx: number; vy: number; vz: number; time: number };
  speedKph(ball: BallState): number;
  netHeight(x: number): number;
  /** Throws if no playable trajectory exists (same contract as the source). */
  solveShot(ball: BallState, targetX: number, targetY: number, desiredTime: number, clearance?: number): BallState & { flightTime: number };
  serveTrajectory(ball: BallState, targetX: number, targetY: number, requestedKph: number, clearanceMetres?: number, errorXMetres?: number, errorYMetres?: number):
    { vx: number; vy: number; vz: number; flightTime: number; targetX: number; targetY: number; netRisk: boolean; paceLimited: boolean };
  serveTargetNetRisk(ball: BallState, targetX: number, targetY: number, clearanceMetres?: number): boolean;
  /** Integrates one frame with exact event times; emits bounce/net/tape/board. Mutates `ball`. */
  advance(ball: BallState, dt: number, surface: Surface, onEvent: (type: PhysicsEventType, ball: BallState) => void): void;
  advanceLoose(ball: BallState, dt: number, surface: Surface, onBounce?: (ball: BallState) => void): void;
  inSingles(ball: BallState, side: Side): boolean;
  inServiceBox(ball: BallState, side: Side, serverX: number): boolean;
  powerTarget(x: number, y: number, quality: number): { x: number; y: number };
  releaseBall(ball: BallState): void;
}

/* ---- M-STROKES (ports strokes.js, 5.7 KB): stroke selection and pace profiles. ---- */
export interface StrokeModel {
  select(actor: Pick<ActorState, "side" | "x" | "y" | "racketSide">, ball: BallState): { kind: StrokeKind; racketSide: 1 | -1; reachable: boolean; reachScale: number };
  prepare(actor: ActorState, ball: BallState, delay: number, surface: Surface): { kind: StrokeKind; racketSide: 1 | -1; reachable: boolean; reachScale: number; height: number };
  flightTime(kind: StrokeKind, ball: BallState, targetX: number, targetY: number, groundTime: number, quality: number, shotType?: ShotPreset, proAttack?: number): number;
  proAttackOpportunity(actor: ActorState, ball: BallState, kind: StrokeKind, shotType: ShotPreset, spatialQuality: number): number;
  defensiveLateness(swingAge: number, kind: StrokeKind): number;
  defensiveLobPlan(ball: BallState, targetX: number, side: Side, pressure: number, depthDraw: number, heightDraw: number): { targetX: number; targetY: number; time: number; short: boolean };
  highDeepLobPlan(ball: BallState, targetX: number, side: Side): { targetX: number; targetY: number; time: number };
}

/* ---- M-RULES + M-SIM (ports match-engine.js, 147 KB / 2,714 lines): the whole pure simulation behind one factory. ---- */
export interface MatchEngineOptions {
  difficulty?: Difficulty; venue?: string; online?: false; practice?: boolean; allowSwipe?: boolean;
  controlStyle?: "classic" | "swipe";
  roster?: Partial<Record<Side, string>>; appearance?: Partial<Record<Side, Record<string, unknown>>>;
  eventId?: string;
  onEvent?: (event: SimEvent) => void;
  /** Overrides keyboard polling for a side (the source's `readInput`). */
  readInput?: (side: Side) => InputFrame | undefined;
}
export interface MatchEngine {
  readonly state: MatchState;
  resetMatch(options?: MatchEngineOptions): void;
  applyInput(side: Side, input: InputFrame): void;
  step(dt?: number): void;
  snapshot(): MatchState;
  restore(snapshot: MatchState): void;
  selectShot(shot: ShotPreset, side?: Side): void;
  setServeAim(...args: unknown[]): void;
  getServeFeedback(): unknown;
  setControlStyle(style: "classic" | "swipe"): boolean;
  queueSwipeShot(shot: SwipeShot): void;
  cancelSwipeShot(): void;
  getSwipeState(): unknown;
}
export type CreateMatchEngine = (options?: MatchEngineOptions) => MatchEngine;

/* ---- M-AI: lives inside the engine factory; exposed as a seam so difficulty tuning is testable alone. ---- */
export type CreateAiController = (engine: Pick<MatchEngine, "state">) => AiController;

/* ---- M-INPUT (controls.js 8.7 KB, mobile-swipe.js 4.7 KB, the pollers in game.js). ---- */
export interface InputMapper {
  getBindings(device: "keyboard" | "controller"): KeyboardBindings | ControllerBindings;
  applyBindings(device: "keyboard" | "controller", profile: KeyboardBindings | ControllerBindings): { ok: boolean; saved: boolean; errors: Array<{ action: string | null; message: string }> };
  /** Turn one frame of device state into engine input for the human side. */
  frame(sample: InputSample): InputFrame;
  classifyGesture(gesture: RawSwipeGesture): SwipeShot | null;
}

/* ---- M-POSE (player-pose.js 10 KB + athlete rig in main.ts): pure articulated pose, never touches gameplay. ---- */
export interface PoseLeg { hip: Vec3; knee: Vec3; foot: Vec3; planted?: boolean }
export interface PoseResult {
  mode: string; sliding: boolean; legs: readonly [PoseLeg, PoseLeg]; right: Vec3; left: Vec3; racketDirection: Vec3;
  hipY: number; torsoYaw: number; shoulderY: number; headY: number; leanX: number; leanZ: number;
}
export interface AthletePose { pose(actor: ActorState, state: Pick<MatchState, "phase" | "time" | "serveAttempt">): PoseResult }

/* ---- M-RENDER: scene, venues, lighting, post. The only module that imports @aura3d/engine scene nodes. ---- */
export interface SceneRenderer {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  /** Present one sim state; must not mutate it. */
  render(state: Readonly<MatchState>, dt: number): void;
  setVenue(venueId: string): void;
  project(world: Vec3): { x: number; y: number; visible: boolean };
  resize(width: number, height: number, pixelRatio: number): void;
  dispose(): void;
}

/* ---- M-AUDIO: cue bank on the synth kit and recorded impacts; consumes SimEvent only. ---- */
export interface AudioPort { unlock(): void; setEnabled(on: boolean): void; handle(event: SimEvent): void; setVenue?(venue: string): void }

/* ---- M-HUD / M-MENU: DOM/game-kit UI driven purely by MatchState; no gameplay writes except through MatchEngine calls. ---- */
export interface HudPort { update(state: Readonly<MatchState>): void; showResults(state: Readonly<MatchState>): void }
export interface MenuPort {
  onStart(handler: (options: MatchEngineOptions) => void): void;
  onSettingsChange(handler: (settings: { bindings?: KeyboardBindings; controlStyle?: "classic" | "swipe"; venue?: string; difficulty?: Difficulty; muted?: boolean }) => void): void;
}

/** QA hooks every build exposes (existing names in game.js kept for the live harness). */
export interface QaHooks {
  render_game_to_text(): string;
  advanceTime(ms: number): void;
  __TOP_TENNIS_CONTROL__: { getState(): MatchState; getEngine(): MatchEngine; startOffline(): void; togglePause(): void };
}
