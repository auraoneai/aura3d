// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraApp, AuraGameLoopPlan, AuraGameRuntimeEvidence } from "../../index.js";
import { DEFAULT_MAX_SUBSTEPS } from "../../app/frameLoopDefaults.js";
import { certifyPublicPlatformerPresentation, certifyPublicRacingPresentation, createAuraGameRuntime, createGamePlatformerCameraRig, createGamePlatformerCheckpointNodes, createGamePlatformerFinishNodes, createGamePlatformerGroundMeshNodes, createGamePlatformerHazardNodes, createGamePlatformerPlatformMeshNodes, createGamePlatformerPresentationSurfaceNodes, createGamePublicPlatformerPresentationNodes, createGamePublicRacingPresentationNodes, createGameRacingCheckpointGateNodes, createGameRacingPresentationTrackNodes, createGameRacingRoadMeshNodes, createGameRacingStartFinishNodes, effects, gameRules } from "../../index.js";
import { createFrameLoop } from "../../FrameLoop.js";
import { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105, type GameRuntimeEvidenceOptions } from "../../GameEvidence.js";
import { GAME_FALLING_BLOCK_PIECES, createGameAssetBoundPlatformerLevel, createGameAssetBoundRacingRoute, createGameFallingBlocksKit, createGameLocomotionKit, createGamePlatformerKit, createGamePlatformerSurfaceQuery, createGameRacingKit, createGameRacingSurfaceQuery } from "../../GameGenreKits.js";
import { createGameInspector } from "../../GameInspector.js";
import { applyGameCombatEventsToRuntime, createCombatWorld, createGameAccessibilityFocus, createGameAccessibilityLabel, createGameAccessibilityRuntimeSettings, createGameBoxCollider, createGameCameraDirector, createGameCapsuleCollider, createGameColliderDebugGeometry, createGameCollisionWorld, createGameCombatDebugGeometry, createGameDebugOverlayData, createGameDebugSceneNodes, createGameEffects, createGameEventLog, createGameHighContrastSource, createGameHitboxDebugGeometry, createGameHudBindings, createGameHudCheckpointBinding, createGameHudComboBinding, createGameHudDebugToggleBinding, createGameHudEventLogBinding, createGameHudHealthBinding, createGameHudLivesBinding, createGameHudMeterBinding, createGameHudObjectiveBinding, createGameHudRoundBinding, createGameHudScoreBinding, createGameHudSnapshot, createGameHudTimerBinding, createGameHudValueBinding, createGameInput, createGameInputReplay, createGameInputReplayDriver, createGameJumpAssist, createGameKinematicBody, createGamePauseControlsSource, createGamePlanarCollisionWorld, createGameRectCollider, createGameReducedFlashSource, createGameReducedMotionSource, createGameSimulation, createGameSphereCollider, createGameTouchControlLayout, exportGameInputReplay, gameColliderAabb, gameColliders, gameEffectPresets, gameGuardboxes, gameHitboxes, gameHurtboxes, gameInputReplayEventsAt, gamePushboxes, gameTriggerVolumes, importGameInputReplay, runGameSimulation } from "../../GameRuntime.js";
import { createRuntimeNodeSpec } from "../../GameSceneBridge.js";
import { createGamePlatformerPresentationCamera, createGamePlatformerSceneBinding, createGameRacingPresentationCamera, createGameRacingSceneBinding } from "../../GameSceneGeometryBindings.js";
import { certifyPublicPlatformerGeometry, certifyPublicRacingGeometry } from "../../PublicGameGeometry.js";
import { createFightingGameKit, fighting } from "../../game-kits/fighting.js";
import { createGameRacingCameraRig } from "./racingCamera.js";

export const game = {
  createRuntime: createAuraGameRuntime,
  rules: gameRules,
  loop: (options: Partial<Omit<AuraGameLoopPlan, "kind">> = {}): AuraGameLoopPlan => ({
    kind: "aura-game-loop-plan",
    fixedDt: options.fixedDt ?? 1 / 60,
    maxSubSteps: options.maxSubSteps ?? DEFAULT_MAX_SUBSTEPS,
    timeScale: options.timeScale ?? 1
  }),
  frameLoop: createFrameLoop,
  runtimeNode: createRuntimeNodeSpec,
  input: createGameInput,
  inputReplay: createGameInputReplay,
  exportReplay: exportGameInputReplay,
  importReplay: importGameInputReplay,
  inputReplayDriver: createGameInputReplayDriver,
  inputReplayEventsAt: gameInputReplayEventsAt,
  simulation: createGameSimulation,
  runSimulation: runGameSimulation,
  inspector: createGameInspector,
  locomotion: createGameLocomotionKit,
  assetBoundPlatformerLevel: createGameAssetBoundPlatformerLevel,
  platformerSurfaceQuery: createGamePlatformerSurfaceQuery,
  platformerSceneBinding: createGamePlatformerSceneBinding,
  platformerPresentationCamera: createGamePlatformerPresentationCamera,
  platformerPresentationSurfaces: createGamePlatformerPresentationSurfaceNodes,
  publicPlatformerPresentation: createGamePublicPlatformerPresentationNodes,
  platformerGroundMesh: createGamePlatformerGroundMeshNodes,
  platformerPlatformMesh: createGamePlatformerPlatformMeshNodes,
  platformerHazard: createGamePlatformerHazardNodes,
  platformerCheckpoint: createGamePlatformerCheckpointNodes,
  platformerFinish: createGamePlatformerFinishNodes,
  platformerCameraRig: createGamePlatformerCameraRig,
  certifyPlatformerGeometry: certifyPublicPlatformerGeometry,
  certifyPlatformerPresentation: certifyPublicPlatformerPresentation,
  platformer: createGamePlatformerKit,
  assetBoundRacingRoute: createGameAssetBoundRacingRoute,
  racingSurfaceQuery: createGameRacingSurfaceQuery,
  racingSceneBinding: createGameRacingSceneBinding,
  racingPresentationCamera: createGameRacingPresentationCamera,
  racingCameraRig: createGameRacingCameraRig,
  racingRoadMesh: createGameRacingRoadMeshNodes,
  racingCheckpointGate: createGameRacingCheckpointGateNodes,
  racingStartFinish: createGameRacingStartFinishNodes,
  racingPresentationTrack: createGameRacingPresentationTrackNodes,
  publicRacingPresentation: createGamePublicRacingPresentationNodes,
  certifyRacingGeometry: certifyPublicRacingGeometry,
  certifyRacingPresentation: certifyPublicRacingPresentation,
  racing: createGameRacingKit,
  fallingBlocks: createGameFallingBlocksKit,
  fallingBlockPieces: GAME_FALLING_BLOCK_PIECES,
  eventLog: createGameEventLog,
  touchControls: createGameTouchControlLayout,
  kinematicBody: createGameKinematicBody,
  collisionWorld: createGameCollisionWorld,
  planarCollisionWorld: createGamePlanarCollisionWorld,
  jumpAssist: createGameJumpAssist,
  collider: {
    box: createGameBoxCollider,
    sphere: createGameSphereCollider,
    capsule: createGameCapsuleCollider,
    rect: createGameRectCollider,
    aabb: gameColliderAabb,
    factories: gameColliders
  },
  hitbox: gameHitboxes,
  hurtbox: gameHurtboxes,
  guardbox: gameGuardboxes,
  pushbox: gamePushboxes,
  trigger: gameTriggerVolumes,
  combatWorld: createCombatWorld,
  combatEvents: applyGameCombatEventsToRuntime,
  cameraDirector: createGameCameraDirector,
  effects: createGameEffects,
  effectPresets: gameEffectPresets,
  debug: {
    colliders: createGameColliderDebugGeometry,
    hitboxes: createGameHitboxDebugGeometry,
    combat: createGameCombatDebugGeometry,
    overlay: createGameDebugOverlayData,
    sceneNodes: createGameDebugSceneNodes
  },
  hud: {
    health: createGameHudHealthBinding,
    meter: createGameHudMeterBinding,
    timer: createGameHudTimerBinding,
    combo: createGameHudComboBinding,
    round: createGameHudRoundBinding,
    score: createGameHudScoreBinding,
    lives: createGameHudLivesBinding,
    objective: createGameHudObjectiveBinding,
    checkpoint: createGameHudCheckpointBinding,
    value: createGameHudValueBinding,
    eventLog: createGameHudEventLogBinding,
    debugToggle: createGameHudDebugToggleBinding,
    bindings: createGameHudBindings,
    snapshot: createGameHudSnapshot
  },
  accessibility: {
    label: createGameAccessibilityLabel,
    focus: createGameAccessibilityFocus,
    reducedMotion: createGameReducedMotionSource,
    reducedFlash: createGameReducedFlashSource,
    highContrast: createGameHighContrastSource,
    pauseControls: createGamePauseControlsSource,
    settings: createGameAccessibilityRuntimeSettings
  },
  fighting: createFightingGameKit,
  evidence: collectGameRuntimeEvidence
} as const;

export function collectGameRuntimeEvidence(
  app: Pick<AuraApp, "runtime" | "nodes">,
  options: GameRuntimeEvidenceOptions = {}
): AuraGameRuntimeEvidence {
  return collectGameRuntimeEvidenceV105(app, options);
}
