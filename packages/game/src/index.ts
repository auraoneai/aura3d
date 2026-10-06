/**
 * @aura3d/game skeleton (CONTRACTS.md §3.8). Re-exports the C-24 stubs until
 * PRD 09 lands the real package.
 */

export {
  createGame,
  captureFromUrl
} from "@aura3d/engine-runtime/contracts";
export type {
  Game,
  CreateGameOptions,
  GameSession,
  GameSessionState,
  GameShell,
  Hud,
  TouchControls,
  GameFxLayer,
  CaptureContext,
  GameBeacon
} from "@aura3d/engine-runtime/contracts";

// PRD-09 juice surface (§7.6): tween engine, Juice facade, overlay driver,
// fx pools (instanced backend A / particle-pass backend B), rumble adapter.
export { createJuice } from "./juice/Juice.js";
export type {
  Juice,
  JuiceDeps,
  JuiceEventMap,
  JuicePreset,
  JuiceCamera,
  JuiceCameraLayerEvidence,
  JuiceSession,
  JuiceOverlayDriver,
  JuiceRumble,
  JuiceSnapshot,
  JuiceSnapshotEvent,
  GameFxKind,
  GameFxLayerLike,
  Vec3Like
} from "./juice/Juice.js";
export { createTweenEngine, TWEEN_POOL_CAPACITY } from "./juice/tween.js";
export type {
  TweenEngine,
  TweenHandle,
  TweenOptions,
  TweenEase,
  TweenableNode
} from "./juice/tween.js";
export { createOverlayDriver } from "./juice/overlay.js";
export type { OverlayDriverDeps } from "./juice/overlay.js";
export { createRumbleDriver } from "./juice/rumble.js";
export type { RumbleDriverDeps } from "./juice/rumble.js";
export { createFxParticlePass } from "./juice/fxParticlePass.js";
export type { FxPassEffects, FxParticlePass } from "./juice/fxParticlePass.js";
export {
  FX_TIER_LIVE_CAP,
  FX_PRESETS,
  FxPrimitivePool,
  fxKindCapacity,
  fxPoolSceneNodes
} from "./juice/fx.js";
export type {
  FxQualityTier,
  FxPreset,
  FxShape,
  FxNodeSink,
  FxPrimitivePoolOptions
} from "./juice/fx.js";
export { ease } from "./util/ease.js";
export type { EaseName } from "./util/ease.js";
