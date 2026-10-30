/**
 * @aura3d/game — real C-24 entry (PRD-09 day-0).
 *
 * The C-24 contract slot is DEFINED here (CONTRACTS.md §3.8: no slot exists
 * in `contracts/game.ts` — the stub is exported directly). The entry calls
 * `slot.provide(realCreateGame)` once at module load; `createGame` resolves
 * `slot.get(resolveQrFlags(...))` so callers get the real impl iff
 * `A3D_QR_GAME` is on and the stub otherwise.
 */

import { defineContractSlot } from "@aura3d/rendering/contracts";
import {
  createGame as stubCreateGame,
  resolveQrFlags,
  type CreateGameOptions,
  type Game,
  type QrFlagInput
} from "@aura3d/engine";
import { createGameImpl, type Prd09CreateGameOptions, type Prd09Game } from "./createGame";
import { withGameFlagDefault } from "./flagDefault";

export const C24_GAME_SLOT = defineContractSlot<typeof stubCreateGame>(
  "C-24",
  "prd09",
  "A3D_QR_GAME",
  stubCreateGame
);

C24_GAME_SLOT.provide(createGameImpl as typeof stubCreateGame);

const envFlags = (): Readonly<Record<string, string | undefined>> | undefined => {
  try {
    const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (viteEnv !== undefined) return viteEnv;
  } catch {
    /* non-Vite context */
  }
  return typeof process !== "undefined" ? process.env : undefined;
};

const currentUrl = (): string | undefined =>
  typeof location !== "undefined" ? location.href : undefined;

export function createGame<TCue extends string, TEvent extends string>(
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  // This entry point is the explicit opt-in to the real kit, so the `game` lane defaults on; explicit
  // `-game`/`none`, the URL and env sources still turn it off.
  const gameFlags = withGameFlagDefault(options.qualityRebuild?.flags as QrFlagInput | undefined);
  const flags = resolveQrFlags({
    options: gameFlags,
    url: currentUrl(),
    env: envFlags()
  });
  const effective = { ...options, qualityRebuild: { ...options.qualityRebuild, flags: gameFlags } };
  // Public types describe the impl surface (Prd09CreateGameOptions → Prd09Game);
  // the slot's declared signature stays contract-shaped for the flag-off stub.
  return C24_GAME_SLOT.get(flags)(
    effective as unknown as CreateGameOptions<TCue, TEvent>
  ) as Prd09Game<TCue, TEvent>;
}

export { captureFromUrl, lookSignature, lookManifest, type LookSource } from "./capture/index";
export { createGameImpl, type Prd09Game } from "./createGame";
export { GameSessionImpl } from "./session/GameSession";
export { attachSessionLifecycle } from "./session/lifecycle";
export { createAccessibility } from "./session/accessibility";
export { warmPrograms, type WarmableApp, type WarmProgramsOptions, type WarmProgramsResult } from "./session/warmPrograms";
export { installGameBeacon } from "./evidence/beacon";
export { summarizeTextureUpgrade, texturedNodesReady } from "./evidence/textureStatus";
export type { TexturedMaterialRow, TextureUpgradeSummary } from "./evidence/textureStatus";
export {
  smoothDamp, createSmoothFollow3, lerpAngle, createRenderInterpolator, secondDifferenceRms, jitterReport,
  createLocomotion, proceduralLegSwing, createFootSlideMeter,
  createImpactWorld, createHitStop, createCameraShake, createImpactFeedback,
  attachToBone, resolveBone, boneAliases, boneWorldPosition, attachmentDistance,
  checkDoubleFrame, detectSharedSkeleton, detectCoincidentModels, detectDoubleBlend,
  createFixedStepPresenter, createRecordBlend, runMotionGate,
  clearCameraEye, createCameraClearance,
  createHandBounce, resolveHandBounceConfig, handBounceCycle, handBounceBallY, handBounceContactWeight, handBounceBallXZ,
  clampPalmReach, handBounceOverlayAngles, measureHandBall, DEFAULT_HAND_BOUNCE_LIMITS, RUNNING_HAND_BOUNCE_LIMITS,
  createTwoHandGrip, solveTwoHandGrip, calibrateGripSocket, mirrorTwoHandGripBodyRig, twoHandGripBonesForEngine, relaxedTopHand,
  measureGrip, handCentroid, DEFAULT_GRIP_LIMITS, DEFAULT_GRIP_BONE_NAMES,
  solveGripTwoBone, orbitGripElbow, gripAzimuthTwist, gripQNorm, gripQMul, gripQConj, gripQAxis, gripQRot, gripQFromTo,
  gripQToEulerXYZ, gripQToEulerZYX, gripUnit, gripRotY, GRIP_Q_ID,
  wrapAngle, yawToFace, visualHeading, facingError, faceTowards
} from "./motion/index";
export type {
  DampResult, SmoothFollow3, RenderInterpolator, JitterReport,
  LocomotionGait, LocomotionOptions, LocomotionFrame, Locomotion, LegPose, ProceduralGait,
  FootSlideOptions, FootSlideReport, FootSlideMeter,
  ImpactBoxCollider, ImpactSphereCollider, ImpactCollider, ImpactBody, Impact, ImpactWorldOptions, ImpactWorld,
  HitStop, CameraShake, ParticleBurst, ImpactFeedbackOptions, ImpactFeedbackResult,
  BoneRole, SocketLike, AttachableActor, AttachToBoneOptions, BoneAttachment,
  DrawEntry, ModelInstance, AnimLayer, DoubleFrameFinding, DoubleFrameReport,
  AlphaSource, FixedStepPresenterOptions, FixedStepPresenter, RecordBlendOptions, MotionGateOptions, MotionGateReport,
  CameraVec3, ClearEyeOptions, ClearEye, CameraClearanceOptions, CameraClearance,
  HandBounceVec3, HandBounceGait, HandBounceOptions, HandBouncePhases, HandBounceConfig, HandBounceCycle, HandBounceOverlayBone,
  HandBounceOverlay, HandBounceInput, HandBounceFrame, HandBounceState, HandBounceRelease, HandBounce, HandBounceSample,
  HandBounceReport, HandBounceLimits,
  GripVec3, GripQuat, TwoHandGripBoneNames, TwoHandGripBodyRig, TwoHandGripRig, TwoHandGripTarget, TwoHandGripPrev, TwoHandGripBone,
  TwoHandGripPose, SolveTwoHandGripOptions, TwoHandGripState, TwoHandGrip, GripSample, GripLimits, GripPhaseReport, GripReport,
  ForwardAxis, FacingTarget, FaceTowardsOptions
} from "./motion/index";
export { installEvidenceChannel, createPerfRing, type EvidenceChannelContract } from "./evidence/channel";
export type { Prd09CreateGameOptions } from "./createGame";
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
} from "@aura3d/engine";

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
export { audioReactive } from "./juice/audioReactive.js";
export type { AudioReactive, AudioReactiveOptions, AudioReactiveSource } from "./juice/audioReactive.js";
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

export { sfx, SFX_IDS, sfxUrl } from "./sfx";
export type { SfxId, SfxPack } from "./sfx";

// PRD-09 Phase 4 — HUD surface (§7.7, §17).
export { mountHud } from "./hud/HudKit.js";
export { HUD_THEMES, HUD_FONT_FACES, hudThemeFontFaces } from "./hud/themes.js";
export { screenFraction } from "./hud/screenFraction.js";
export { compassBearing, compassRotationDeg, updateCompass } from "./hud/compass.js";
export type { CompassPoint, CompassNeedle } from "./hud/compass.js";
export { drawCanvasMinimap } from "./hud/canvasMinimap.js";
export type { CanvasMinimapBounds, CanvasMinimapContext, CanvasMinimapLayer, CanvasMinimapMarker, CanvasMinimapSpec } from "./hud/canvasMinimap.js";
export type {
  Hud as GameHud,
  HudMountOptions as GameHudMountOptions,
  HudSnapshot,
  HudWidgetSnapshot,
  HudBannerOptions,
  HudKitDeps,
  Vec3Like as HudVec3Like
} from "./hud/HudKit.js";
export type { HudThemePreset, HudThemeVars, HudFontFace } from "./hud/themes.js";
export type {
  HudAnchor,
  HudWidgetBase,
  HudWidgetSpec as GameHudWidgetSpec,
  HudWidgetInstance,
  HudValue
} from "./hud/widgets/index.js";
export { createWidget } from "./hud/widgets/index.js";
export type { HudDocument, HudElement, HudRect, HudScheduler, HudClassList } from "./hud/dom.js";

// PRD-09 Phase 4 — shell, transitions, context loss, touch (§6.2, §6.11, §7.2).
export { createGameShell } from "./shell/GameShell.js";
export type {
  GameShell as GameShellHandle,
  GameShellDeps,
  GameShellOptions,
  GameSessionState as ShellSessionState,
  ShellStringKey
} from "./shell/GameShell.js";
export { runTransition, domTransitionDriver } from "./shell/transition.js";
export type { TransitionSpec as ShellTransitionSpec, TransitionDriver } from "./shell/transition.js";
export { wireContextLoss } from "./shell/contextLoss.js";
export type { DeviceLossApp, ContextLossSink, ContextLossController } from "./shell/contextLoss.js";
export { createMenu } from "./shell/screens/menu.js";
export type { MenuHandle, MenuItemSpec, MenuKeyEvent, ShellScreen } from "./shell/screens/menu.js";
export { createLoadingScreen } from "./shell/screens/Loading.js";
export { createTitleScreen } from "./shell/screens/Title.js";
export { createPauseMenu, DEFAULT_PAUSE_ITEMS } from "./shell/screens/Pause.js";
export {
  createSettingsMenu,
  loadSettings,
  saveSettings,
  settingsKey,
  AUDIO_BUSES
} from "./shell/screens/Settings.js";
export type { GameSettings, SettingsActions, SettingsStorage, AudioBus } from "./shell/screens/Settings.js";
export { createResultsMenu } from "./shell/screens/Results.js";
export type { ResultsSpec as ShellResultsSpec, ResultsFieldSpec } from "./shell/screens/Results.js";
export { createAboutMenu } from "./shell/screens/About.js";
export { createContextLostScreen } from "./shell/screens/ContextLost.js";
export { mountTouchControls, TOUCH_PRESET_GENRE } from "./touch/TouchControls.js";
export type {
  TouchPreset,
  TouchControlsOptions,
  TouchControls as GameTouchControls,
  TouchInputSink,
  TouchControlsDeps
} from "./touch/TouchControls.js";
export { registerGameFonts } from "./fonts/register.js";

// Rebindable input bindings: validated, persisted, with reserved keys and conflict detection (extracted from Aura Slam 3D).
export { createBindingStore } from "./input/bindingStore.js";
export type {
  BindingStore, BindingStoreOptions, BindingDeviceConfig, BindingActionDefinition, BindingProfile, BindingError,
  BindingValidation, BindingApplyResult, BindingListener, BindingStorage, KeyBinding, ButtonBinding
} from "./input/bindingStore.js";
