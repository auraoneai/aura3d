import { applyRootParticleQuality, composeModelInstanceMatrices, createCameraProjection, DeferredFrameResources, getRootPerformanceBaseSize, getRootPerformanceQuality, getRootRenderSource, hasRootRenderableContent, includeRootSourceMetadata, initializeRootPerformanceQuality, readRootDiagnosticSnapshot, resolveCameraClipping, resolveRootRenderTime, setRootPerformanceQuality, supportsRootParticleQuality, validateRootPerformanceQuality, type AuraPerformanceQuality } from "./RootRuntimeSupport.js";
export type { AuraPerformanceQuality } from "./RootRuntimeSupport.js";
/*
 * WS-2.2 — module-scope physics values come from the SOLVERLESS entry.
 *
 * `Shape`, `PhysicsStepper`, `ScenePhysicsBridge` and `PhysicsDebugDraw` are solver-free: each
 * imports `PhysicsWorld` as a *type* only. But reaching them through `@aura3d/physics` — a chain of
 * `export *` that includes `PhysicsWorld` — dragged in the physical adapter, so a scene with no
 * bodies still downloaded the solver.
 *
 * This is a different defect from eager construction, which was already fixed (see `:9832`). A lazy
 * `new PhysicsWorld()` still leaves a static `import`, and a bundler keeps the module either way.
 * Deferring the *import* is what removes the bytes. `PhysicsWorld` is now loaded by
 * `await import("@aura3d/physics")` at the points that actually simulate.
 */
import {
  PhysicsDebugDraw,
  PhysicsStepper,
  ScenePhysicsBridge,
  Shape as PhysicsShapeFactory
} from "@aura3d/physics/solverless";
/*
 * WS-2.2 — the solver, from a NARROW entry rather than the physics barrel.
 *
 * Static on purpose. `app.physics` is documented and tested as live synchronously for every app, so
 * `createAuraApp` cannot await a solver, and R7 forbids breaking that to save bytes. What this does
 * avoid is the barrel: `@aura3d/physics` is a chain of `export *` that also carries `HitboxWorld`,
 * `CharacterController`, `KinematicBody`, arcade vehicle telemetry, `NarrowPhase` and six fixture modules, all
 * of which arrived just to reach one class.
 */
import { PhysicsWorld } from "@aura3d/physics/world";
// Types only, so this is not a graph edge. `import type` states that intent explicitly.
import type {
  Collider,
  ColliderDescriptor,
  CollisionEvent,
  Constraint,
  ConstraintDescriptor,
  Contact,
  DebugLine,
  PhysicsBackendSelection,
  PhysicsContinuousCollisionDescriptor,
  PhysicsShape,
  PhysicsSnapshot,
  PhysicsWorldDescriptor,
  RaycastHit,
  RaycastOptions,
  RigidBody,
  RigidBodyDescriptor,
  PhysicsVehicleController,
  PhysicsWheelSpec,
  PhysicsWheelState,
  PhysicsWheelCommand,
  PhysicsWheelTuning,
  PhysicsVehicleAxis,
  PhysicsCharacterController,
  PhysicsCharacterControllerDescriptor,
  PhysicsCharacterMovement,
  RigidBodyType,
  ScenePhysicsNode,
  SphereCastHit
} from "@aura3d/physics";
import {
  createBeamDescriptor,
  createDayNightSky,
  createDualProbeEnvironmentLightingResources,
  createExternalParityEnvironmentLighting,
  createProductionEnvironmentLightingResources,
  createProductionPbrHdrPipelineFromRadiance,
  createSdfFontAtlas,
  createSdfTextQuadMesh,
  createSpotShadowProjection,
  createWaterSurface,
  createWeatherState,
  describeSdfTextPixelBacking,
  describeWetMaterial,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
  resolveFlipbookUv,
  resolveSdfTextFrameOpacity,
  resolveVolumetricFog,
  selectSpotShadowAtlasTier,
  type SdfFontAtlas,
  type SdfTextOcclusionPolicy,
  type SdfTextStyle,
  sampleOceanFixture,
  Geometry,
  IndexBuffer,
  InstancedPBRMaterial,
  PBRMaterial,
  ProductionRuntimeRenderer,
  resolveSamplerAnisotropy,
  Sampler,
  srgbToLinearChannel,
  Texture,
  TexturedPBRMaterial,
  VertexBuffer,
  VertexFormat,
  type CameraLike,
  type CollectedLight,
  type DayNightSkyOptions,
  type EnvironmentLightingOptions,
  type ForwardEnvironmentFogOptions,
  type WaterSurfaceBoat,
  type WaterSurfacePreset,
  type WeatherType,
  type ProductionImportedAssetRenderMetadata,
  type ProductionRendererFeature,
  type ProductionRendererInput,
  type RenderDeviceDiagnostics,
  type RenderItem,
  type RendererPostProcessOptions,
  type RendererPostprocessExecutionMode,
  type RendererShadowOptions,
  type RenderSource
} from "@aura3d/rendering";
import {
  DirectionalLight,
  PointLight,
  SpotLight,
  type Light,
  type Mat4
} from "@aura3d/scene";
import { identityMat4, lookAtMat4, multiplyMat4 } from "@aura3d/scene/math";
/*
 * WS-2.2 — TYPE-ONLY import, plus a dynamic import at the single call site below.
 *
 * `TypedGLBActor` reaches `packages/assets` -> `GLTFRenderResources` -> `GLTFLoader`, and from there
 * into `@aura3d/rendering`'s `advanced-runtime` and so `WebGPUDevice`. Measured with an esbuild
 * metafile: a scene containing **one cube and no model at all** paid 68,664 bytes of `GLTFLoader`,
 * 36,168 of `GLTFRenderResources` and 74,742 of `WebGPUDevice` because of this one static edge.
 *
 * A type-only import erases at compile time, so the graph edge disappears entirely. The value is
 * loaded by `await import(...)` at its one call site, which is already inside an async function on the
 * typed-GLB path — so a scene that uses a typed GLB pays for the loader exactly when it needs it, and
 * a scene that does not never downloads it.
 */
import type { TypedGLBActor, TypedGLBActorEvidence } from "../production-runtime/TypedGLBActor.js";
import {
  AURA_NORMALIZED_MODEL_MAX_DIMENSION,
  boundsFromAsset,
  boundsHeight,
  boundsMaxDimension,
  boundsSize
} from "./SceneGroundingUtils.js";
import {
  collectLabelTelemetry,
  labelTelemetryRoleFor,
  summarizeTextBuckets,
  type LabelTelemetry,
  type TextBucketSummary
} from "./LabelTelemetry.js";
import {
  createWorldLabelLayer,
  type ProjectedLabel,
  type WorldLabel,
  type WorldLabelLayer
} from "./WorldLabelRenderer.js";
import {
  createAuraText3DGeometry,
  defineAuraCustomGeometry,
  selectAuraRootLodLevel,
  type AuraCustomGeometrySpec,
  type AuraText3DGeometry,
  type AuraText3DOptions
} from "./RootGeometry.js";

export * from "./RootGeometry.js";

export * from "./SpatialAnchoring.js";
export * from "./PhysicsRuntime.js";
/**
 * WS-2.4: mesh surface queries on the public surface.
 *
 * Re-exported from `@aura3d/physics` so grounding anything to a mesh is a one-liner for any
 * genre, from `@aura3d/engine` alone. Without this a route wanting real per-point ground
 * height had to either deep-import `@aura3d/physics/src` (banned by the lint rule) or
 * hand-roll an analytic approximation — which is exactly what every racing route did, and
 * why wheels sank through visible road.
 */
/*
 * WS-2.2 — re-exported from the SOLVERLESS entry, not the physics barrel.
 *
 * These are geometry queries: `MeshBVH` and `SurfaceQuery` import only `Shape`'s types. Re-exporting
 * them from `@aura3d/physics` made this barrel a static consumer of the whole solver, so grounding a
 * wheel on a mesh reached the physical solver. Same symbols, same public names.
 */
export {
  buildMeshBVH,
  createMeshSurfaceQuery,
  raycastMesh,
  type MeshBVH,
  type MeshRayHit,
  type MeshSurfaceQuery,
  type MeshSurfaceQueryOptions,
  type SurfaceSample
} from "@aura3d/physics/solverless";
import { createPhysicsRuntime, type AuraCollisionLayers, type AuraPhysicsRuntime } from "./PhysicsRuntime.js";
import { gameCameraRigs } from "./GameCameraRigs.js";
import { gameFeelBuilders } from "./GameFeel.js";
export * from "./FocusSelection.js";
export * from "./WorldLabelRenderer.js";
export * from "./GameCameraRigs.js";
export * from "./GameFeel.js";
export * from "./LabelTelemetry.js";
export * from "./NavigationCrowds.js";
export * from "./FootPlanting.js";
export * from "./Decals.js";
export * from "./Scatter.js";
export * from "./AssetDecoders.js";
export * from "./VehicleChassis.js";
export * from "./VehicleDriverAi.js";
// Published-union surface (PRD-15 T1.4): the names packages/engine/src/index.ts
// exports that were missing from published ".". engineSurface holds the moved
// facade decls; publishedUnion re-exports the contract surface plus the
// @deprecated union names with their §6.6 destinations.
export * from "./engineSurface.js";
export * from "./publishedUnion.js";
/**
 * Deliberate public surface for the shared arcade vehicle core. The racing kit
 * owns the certified circuit path; exporting the bare motion helper lets routes
 * such as showcase-courier-rush prove a different driving personality on their
 * own topology without touching kit internals. Pinned by unit test.
 */
export {
  createGameArcadeVehicle,
  type GameArcadeVehicle,
  type GameArcadeVehicleInput,
  type GameArcadeVehicleOptions,
  type GameArcadeVehicleState
} from "./GameRuntime.js";
export * from "./PlatformerMotion.js";
export * from "./CombatFrameData.js";
export * from "./SceneQueries.js";
export * from "./ApplicationKits.js";

export * from "./FrameEncoder.js";
export * from "./BrowserFrameCaptureAdapter.js";
export * from "./MediaRecorderFrameEncoder.js";
export * from "./WebCodecsFrameEncoder.js";
/*
 * WS-2.3 — `FfmpegFrameEncoder` is deliberately NOT re-exported here.
 *
 * It is the only file in the 37-file media surface that reaches `node:` builtins (`child_process` to
 * spawn ffmpeg; `fs/promises`/`os`/`path` to stage frames). Re-exporting it put Node builtins in every
 * browser bundle of this entry point, which is why `tools/bundle-size` had to mark four `node:`
 * specifiers external "for every browser bundle measurement" — a workaround for a dependency that
 * should not have been in the browser graph. esbuild resolves `await import()` at build time whether or
 * not the branch can run.
 *
 * Node consumers import `@aura3d/engine/media-node`. Enforced by `tools/browser-entry-purity`, which
 * bundles every browser entry with no `node:` externals so a reachable builtin fails the build.
 */
export {
  GameInspector,
  createGameInspector
} from "./GameInspector.js";
export type {
  GameInspectorRuntimeInput,
  GameInspectorSnapshot
} from "./GameInspector.js";
import {
  createGameInspector
} from "./GameInspector";
import { createPhysicalMaterialSpec } from "../material-physical/PhysicalMaterialSpec.js";
import { createInstancedModelNode, type InstancedModelVec3 } from "../instances-model/InstancedModel.js";
import { resolveWrinkleMapStrength, warnOnInstancingFallback, type WrinkleMapHook } from "@aura3d/rendering";
export {
  createGameAudio
} from "../game/GameAudio.js";
export type {
  GameAudio,
  GameAudioBusDefinition,
  GameAudioBusId,
  GameAudioContextLike,
  GameAudioCueDefinition,
  GameAudioCueEvent,
  GameAudioEvidence,
  GameAudioOptions
} from "../game/GameAudio.js";
export type {
  GameAudioBusLevel,
  GameAudioDuckingOptions,
  GameAudioFootPlant,
  GameAudioFootstepOptions,
  GameAudioPlayingNode,
  GameAudioPositionalOptions,
  GameAudioVec3
} from "../game/GameAudio.js";
export {
  PositionalEmitter,
  FootstepPlayer,
  createGameMixer,
  attachFocusPolicy,
  computeDistanceAttenuation,
  computeDopplerShift,
  resolveOcclusion
} from "@aura3d/audio";
export { ComboDetector, createTouchLayoutPreset, probeHaptics, playHaptic } from "@aura3d/input";
export {
  attachVisualScriptingGraph,
  createVisualScriptingGraph,
  listVisualScriptingNodeCatalog
} from "@aura3d/scripting";
export { createRootEditorSurface } from "@aura3d/editor-runtime";
import {
  attachVisualScriptingGraph as attachVisualScriptingGraphFn,
  createVisualScriptingGraph as createVisualScriptingGraphFn,
  listVisualScriptingNodeCatalog as listVisualScriptingNodeCatalogFn
} from "@aura3d/scripting";
import { createRootEditorSurface as createRootEditorSurfaceFn } from "@aura3d/editor-runtime";
export * from "./RenderProgressTracker.js";
export * from "./AudioVisemeAnalyzer.js";
export * from "./ExternalPhonemeAnalyzer.js";
export * from "./WaveformVisualizer.js";
export * from "./VisemeTimelineTrack.js";
export * from "./EpisodeStructure.js";
export * from "./ShotTransitionEngine.js";
export * from "./SceneSequencer.js";
export * from "./CameraPresetLibrary.js";
export * from "./ShotCompositionRules.js";
export * from "./CameraChoreographer.js";
export * from "./CameraPathEditor.js";
export * from "./ThumbnailGenerator.js";
export * from "./BatchEpisodeRenderer.js";
export * from "./AnimationAssetManifest.js";
export * from "./SceneGroundingUtils.js";
export * from "./SubjectFramingUtils.js";
export * from "./LayeredSceneComposition.js";
export * from "./TouchControlBinding.js";
export * from "./AssetLibraryBrowser.js";
export * from "./DialogueAlignment.js";
export * from "./PerformancePoseEditor.js";
export * from "./PerformanceCaptureSession.js";
export * from "./PerformanceBlender.js";
export * from "./PerformanceScriptParser.js";
export * from "./BodyLanguageLibrary.js";
export * from "./EpisodeTemplates.js";
export * from "./AnimationMotionQuality.js";
export * from "./AnimationRouteProof.js";
export * from "./AnimationEpisodePackage.js";

import type {
  GLTFootPlantingConfig,
  GLTFSceneAnimationRuntime,
  GLTFSceneAnimationRuntimeOptions
} from "@aura3d/assets/browser";
import {
  evaluateDistancePrioritizedMipResidency,
  type TextureStreamingCandidate,
  type TextureStreamingResidency
} from "@aura3d/assets/browser";
import type { AnimationPose } from "@aura3d/animation";
import type {
  GameHudBindingKind,
  GameRuntimeSubsystemOwnership
} from "./GameRuntime";
import { createFrameLoop } from "./FrameLoop";
import {
  createCombatWorld,
  createGameCameraDirector,
  createGameEffects,
  applyGameCombatEventsToRuntime,
  createGameAccessibilityFocus,
  createGameAccessibilityLabel,
  createGameAccessibilityRuntimeSettings,
  createGameEventLog,
  createGameHighContrastSource,
  createGameHudBindings,
  createGameHudComboBinding,
  createGameHudCheckpointBinding,
  createGameHudDebugToggleBinding,
  createGameHudEventLogBinding,
  createGameHudHealthBinding,
  createGameHudLivesBinding,
  createGameHudMeterBinding,
  createGameHudObjectiveBinding,
  createGameHudRoundBinding,
  createGameHudScoreBinding,
  createGameHudSnapshot,
  createGameHudTimerBinding,
  createGameHudValueBinding,
  createGameBoxCollider,
  createGameCapsuleCollider,
  createGameColliderDebugGeometry,
  createGameCombatDebugGeometry,
  createGameCollisionWorld,
  createGamePlanarCollisionWorld,
  createGameDebugOverlayData,
  createGameDebugSceneNodes,
  createGameHitboxDebugGeometry,
  createGameSimulation,
  exportGameInputReplay,
  createGameFighting2DRules,
  createGameInput,
  createGameInputReplay,
  createGameInputReplayDriver,
  importGameInputReplay,
  createGameJumpAssist,
  createGameKinematicBody,
  createGamePauseControlsSource,
  createGameRectCollider,
  createGameReducedFlashSource,
  createGameReducedMotionSource,
  createGameSphereCollider,
  createGameTouchControlLayout,
  gameColliderAabb,
  gameColliders,
  gameEffectPresets,
  gameGuardboxes,
  gameHitboxes,
  gameHurtboxes,
  gameInputReplayEventsAt,
  gamePushboxes,
  runGameSimulation,
  gameTriggerVolumes,
  type GameInputOptions
} from "./GameRuntime";
import {
  collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105,
  type GameRuntimeEvidence,
  type GameRuntimeEvidenceOptions,
  type GameRuntimeSourceEvidence
} from "./GameEvidence";
import {
  calculateRuntimeNodeBounds,
  type AuraRuntimeNodeAnimationPoseBindingMetadata,
  type AuraRuntimeNodeAnimationBindingMetadata,
  type AuraRuntimeNodeBounds,
  type AuraRuntimeNodeEffectAttachment,
  type RuntimeNodeBoundsInput,
  type RuntimeNodeMorphTargetWeights
} from "./RuntimeNodeHandle";
import { createRuntimeNodeSpec } from "./GameSceneBridge";

// PR 0b-1 re-imports for moved carve-out modules (CONTRACTS.md §3.2).
import { rendererColorManagementPreset, sceneExposurePresets } from "./app/colorManagement.js";
import { createAuraApp } from "./app/createAuraApp.js";
import { createGameApp } from "./app/createGameApp.js";
import { normalizeCreateAppRendererOptions, normalizeTextureBudgetBytes, rendererQualityPresets, rendererQualityProfiles, resolveRendererQualityProfile } from "./app/rendererOptions.js";
import { collectRuntimeNodeHandles, createAuraRuntimeNodeRegistry, createRuntimeNodeHandle, type MutableAuraRuntimeNodeRegistry, type MutableAuraRuntimeSceneNode } from "./app/runtimeNodes.js";
import { applyProductionActorAnimation, resolveAnimationSeconds } from "./compiler/animation.js";
import { createProductionRuntimeEnvironment } from "./compiler/environment.js";
import { createProductionRuntimeEnvironmentFog } from "./compiler/fog.js";
import { createProductionRuntimeCollectedLight, createProductionRuntimeFallbackLights, createProductionRuntimeStudioLightDescriptors } from "./compiler/lights.js";
import { createProductionRuntimePostprocess } from "./compiler/postprocess.js";
import { createProductionInstanceColors, createProductionInstanceTransforms, createProductionModelInstanceTransforms, createProductionPrimitiveResources, createProductionRuntimePrimitiveEntries, describeTextureStreamingResidency, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource, upgradeProductionEnvironmentHdri, type TextureStreamingTableEntry } from "./compiler/primitives.js";
import { createProductionRuntimeRendererInput } from "./compiler/renderInput.js";
import { createProductionRuntimeSceneRenderer } from "./compiler/renderer.js";
import { createWebGLParticleModel, createWebGLRainModel } from "./compiler/safeBasic.js";
import { createProductionRuntimeShadowOptions, describeProductionSpotShadow } from "./compiler/shadows.js";
import { ROOT_EXTENSION_TEXTURE_SLOTS, bitmapRgbaPixels, blankProductionPrimitiveTextureState, compositeMetallicRoughnessPixels, createProductionPrimitiveTextureIntent, createSdfTextPrimitiveResource, loadProductionPrimitiveBitmap, mipChainBytesCoarseToFine, productionPrimitiveBitmapPixels, upgradeProductionPrimitiveResource, upgradeProductionPrimitiveTextures, type RootExtensionTextureSlot } from "./compiler/textures.js";
import { auraLazySystemEvidence, collectAuraLazySystemEvidence, ensureAuraLazySystemEvidence, markAuraLazySystemLoaded, markAuraLazySystemRequested, type MutableAuraLazySystemEvidence } from "./devtools/lazySystemEvidence.js";
import { sceneKitPerformanceBudgets } from "./devtools/sceneKitBudgets.js";
import { collectGeneratedCodeWarnings } from "./looks/generatedCodeWarnings.js";
import { validateChartVisualQA, validateCityVisualQA, validateMaterialVisualQA, validateNeonVisualQA, validatePrimitiveHumanoidVisualQA, validateProductVisualQA, validateSolarVisualQA } from "./looks/structuralQA.js";
import { camera } from "./nodes/camera.js";
import { lightingEffectBuilders } from "./nodes/effects.lighting.js";
import { postEffectBuilders } from "./nodes/effects.post.js";
import { DEFAULT_MAX_SUBSTEPS } from "./app/frameLoopDefaults.js";
import { vfxEffectBuilders } from "./nodes/effects.js";
import { envSourceBuilders } from "./nodes/environments.js";
import { worldEnvBuilders } from "./nodes/environments.world.js";
import { createAuraGameRules, gameRules } from "./gameRules.js";
import { collectGameRuntimeEvidence, game } from "./nodes/game/index.js";
import { createGameRacingCameraRig } from "./nodes/game/racingCamera.js";
import { instancedPrimitive, instances } from "./nodes/instances.js";
import { lights } from "./nodes/lights.js";
import { material } from "./nodes/material.js";
import { collectParticleBudgetDiagnostics, particles } from "./nodes/particles.js";
import { cityBlock } from "./nodes/prefabs/cityBlock.js";
import { compilePromptPlan, defaultCameraPreset, defaultLightingPreset, defaultPromptEffects, definePromptPlan, interactionNode, promptPlanWarnings, repairHintsForPromptPlan, requireResolvedPromptSubject, visualSystemsForPromptPlan } from "./nodes/prompt/promptPlan.js";
import { promptRecipes } from "./nodes/prompt/promptRecipes.js";
import { makeSceneKit, sceneKits } from "./nodes/sceneKits.js";
import { shadows } from "./nodes/shadows.js";
import { sky } from "./nodes/sky.js";
import { water } from "./nodes/water.js";
import { weather } from "./nodes/weather.js";

import {
  createFightingGameKit,
  fighting as fightingGameKit
} from "./game-kits/fighting";
import {
  GAME_FALLING_BLOCK_PIECES,
  createGameAssetBoundPlatformerLevel,
  createGameAssetBoundRacingRoute,
  createGameFallingBlocksKit,
  createGameLocomotionKit,
  createGamePlatformerKit,
  createGamePlatformerSurfaceQuery,
  createGameRacingKit,
  createGameRacingSurfaceQuery,
  type GameAssetBoundPlatformerLevel,
  type GameAssetBoundRacingRoute,
  type GameKitRect,
  type GameKitVec2,
  type GamePlatformerCheckpoint
} from "./GameGenreKits";
import {
  createGamePlatformerSceneBinding,
  createGamePlatformerPresentationCamera,
  createGameRacingPresentationCamera,
  createGameRacingSceneBinding,
  type GamePlatformerPresentationCameraOptions,
  type GamePlatformerSceneBinding,
  type GameRacingPresentationCameraOptions,
  type GameRacingCameraRigOptions,
  type GameRacingCameraSelectionEvidence,
  type GameRacingSceneSpeedModel,
  type GameScenePresentationCameraSpec,
  type GameRacingSceneBinding
} from "./GameSceneGeometryBindings";
import {
  certifyPublicPlatformerGeometry,
  certifyPublicRacingGeometry,
  type PublicGameGeometryCertification,
  type PublicPlatformerGeometryContract,
  type PublicRacingGeometryContract
} from "./PublicGameGeometry";
export {
  GAME_FALLING_BLOCK_PIECES,
  createGameAssetBoundPlatformerLevel,
  createGameAssetBoundRacingRoute,
  createGameFallingBlocksKit,
  createGameLocomotionKit,
  createGamePlatformerKit,
  createGamePlatformerSurfaceQuery,
  createGameRacingKit,
  createGameRacingSurfaceQuery
} from "./GameGenreKits";
export {
  createGamePlatformerSceneBinding,
  createGamePlatformerPresentationCamera,
  createGameRacingPresentationCamera,
  createGameRacingSceneBinding
} from "./GameSceneGeometryBindings";
export {
  certifyPublicPlatformerGeometry,
  certifyPublicRacingGeometry
} from "./PublicGameGeometry";
export type {
  GameAssetBoundPlatformerLevel,
  GameAssetBoundPlatformerLevelBinding,
  GameAssetBoundPlatformerLevelOptions,
  GameAssetBoundRacingRoute,
  GameAssetBoundRacingRouteBinding,
  GameAssetBoundRacingRouteOptions,
  GameFallingBlockAction,
  GameFallingBlockActivePiece,
  GameFallingBlockBoard,
  GameFallingBlockCell,
  GameFallingBlockPiece,
  GameFallingBlockRotation,
  GameFallingBlocksEvent,
  GameFallingBlocksKit,
  GameFallingBlocksOptions,
  GameFallingBlocksSnapshot,
  GameKitRect,
  GameKitVec2,
  GameLocomotionClipMap,
  GameLocomotionEventInput,
  GameLocomotionInput,
  GameLocomotionKit,
  GameLocomotionOptions,
  GameLocomotionSnapshot,
  GameLocomotionState,
  GamePlatformerCheckpoint,
  GamePlatformerCollectible,
  GamePlatformerEvent,
  GamePlatformerEventType,
  GamePlatformerHazard,
  GamePlatformerInput,
  GamePlatformerKit,
  GamePlatformerLevel,
  GamePlatformerGroundContact,
  GamePlatformerSurfaceQuery,
  GamePlatformerMovingPlatform,
  GamePlatformerPlayerState,
  GamePlatformerSnapshot,
  GamePlatformerWorldAssetBinding,
  GameRacingCameraSnapshot,
  GameRacingEvent,
  GameRacingEventType,
  GameRacingInput,
  GameRacingKit,
  GameRacingSpeedModel,
  GameRacingSurfaceContact,
  GameRacingSurfaceQuery,
  GameRacingOptions,
  GameRacingRoute,
  GameRacingSnapshot
} from "./GameGenreKits";
export type {
  PublicGameAssetCertification,
  PublicGameBounds2,
  PublicGameGeometryCategory,
  PublicGameGeometryCertification,
  PublicGameGeometrySource,
  PublicGameRetainedProof,
  PublicPlatformerCheckpoint,
  PublicPlatformerGeometryContract,
  PublicPlatformerHazard,
  PublicPlatformerSurface,
  PublicRacingGeometryCheckpoint,
  PublicRacingGeometryContract,
  PublicRacingGeometryPoint
} from "./PublicGameGeometry";
export type {
  GamePlatformerSceneBinding,
  GamePlatformerSceneBindingOptions,
  GamePlatformerPresentationCameraOptions,
  GameRacingSceneBinding,
  GameRacingSceneBindingOptions,
  GameRacingPresentationCameraOptions,
  GameRacingCameraRigOptions,
  GameRacingCameraSelectionEvidence,
  GameRacingSceneSpeedModel,
  GameRacingScenePose,
  GameScenePresentationCameraSpec,
  GameSceneTransform
} from "./GameSceneGeometryBindings";
import {
  createPromptAnimationEpisodePlan,
  createPromptAnimationStoryBible,
  definePromptAnimationStoryboard
} from "./PromptAnimationContract";
import {
  applyShotPlaybackFrame,
  createShotPlaybackPlan,
  createShotTimeline,
  installShotPlayback,
  sampleShotPlaybackPlan
} from "./ShotTimeline";
import {
  captionCueAtTime,
  createCaptionTimingProof,
  deriveCaptionTrackFromDialogue
} from "./DialoguePerformance";
import {
  createAuraVoiceVisemeTrack,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  sampleVisemeTrack
} from "./VisemeController";
import {
  createAuraVoiceBridgePackage,
  createAuraVoiceDubRerenderProof,
  createAuraVoiceRerenderPlan,
  sampleAuraVoiceBridgeAtTime
} from "./AuraVoiceBridge";
import { createAnimationDirectorPlan } from "./AnimationDirector";
import { createAnimationPerformance } from "./AnimationPerformance";
import {
  createAnimationRenderOutputPackageMetadata,
  createAnimationRenderQueue
} from "./AnimationRenderQueue";
import { collectPromptAnimationEvidence } from "./PromptAnimationEvidence";
import {
  createAnimationMotionQualityReport,
  validateAnimationMotionQuality
} from "./AnimationMotionQuality";
import {
  createAnimationRouteProof,
  validateAnimationRouteProof
} from "./AnimationRouteProof";
import {
  createAnimationEpisodePackageManifest,
  validateAnimationEpisodePackage
} from "./AnimationEpisodePackage";
import {
  createGameAppRuntime,
  type GameAppRuntime,
  type GameAppRuntimeOptions
} from "./GameAppRuntime";
import { orbitAnimatedAngle } from "./compiler/actors.js";
import { resolveCameraFrame } from "./compiler/camera.js";
import { colorToClearColor } from "./compiler/color.js";
import type { GltfBounds } from "./compiler/gltfRuntime.js";
import { animatedPosition, flattenSceneNodes, isPositiveFinite, multiply4, primitiveSize, rotationXYZ, scaling, translation } from "./compiler/sceneMath.js";
import { animation } from "./nodes/animation.js";
import { model } from "./nodes/model.js";
import { primitive } from "./nodes/primitives.js";
import type { AuraCameraMode, AuraColor, AuraEffectNode, AuraLabelNode, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraVec3 } from "./nodes/types.js";

export { Engine } from "@aura3d/core";
export {
  analyzeRgbaFrameMotionRegions,
  createAnimationMaterialStyle,
  createAnimationRenderPreset,
  createAnimationVisualQualityReport
} from "@aura3d/rendering";
export type {
  AnimationFrameVisualInput,
  AnimationFrameVisualQuality,
  AnimationMaterialStyle,
  AnimationMaterialStyleOptions,
  AnimationRenderPresetEvidence,
  AnimationRenderPresetOptions,
  AnimationVisualQualityOptions,
  AnimationVisualQualityReport,
  FrameMotionRegion,
  FrameMotionRegionMetrics
} from "@aura3d/rendering";
export {
  asAuraAppHandle,
  isAuraAppHandle,
  type AuraAppFrame,
  type AuraAppFrameCallback,
  type AuraAppHandle,
  type AuraAppNodeRegistryLike,
  type AuraAppRuntimeState,
  type AuraAppScreenshot
} from "./AuraAppHandle";
export {
  createGameAppRuntime,
  type GameAppRuntime,
  type GameAppRuntimeEvidence,
  type GameAppRuntimeLoopOptions,
  type GameAppRuntimeOptions,
  type GameAppRuntimeResize,
  type GameAppRuntimeStatus
} from "./GameAppRuntime";
export {
  FrameLoop,
  createFrameLoop,
  type FrameLoopCallback,
  type FrameLoopFrame,
  type FrameLoopOptions,
  type FrameLoopSnapshot,
  type FrameLoopSource
} from "./FrameLoop";
export {
  createCombatWorld,
  createGameCameraDirector,
  createGameEffects,
  applyGameCombatEventsToRuntime,
  createGameAccessibilityFocus,
  createGameAccessibilityLabel,
  createGameAccessibilityRuntimeSettings,
  createGameHighContrastSource,
  createGameHudBindings,
  createGameHudComboBinding,
  createGameHudDebugToggleBinding,
  createGameHudHealthBinding,
  createGameHudMeterBinding,
  createGameHudRoundBinding,
  createGameHudSnapshot,
  createGameHudTimerBinding,
  createGameBoxCollider,
  createGameCapsuleCollider,
  createGameColliderDebugGeometry,
  createGameCombatDebugGeometry,
  createGameDebugOverlayData,
  createGameDebugSceneNodes,
  createGameHitboxDebugGeometry,
  createGameSimulation,
  createGameInput,
  createGameInputReplay,
  createGameInputReplayDriver,
  createGameJumpAssist,
  createGameKinematicBody,
  createGamePauseControlsSource,
  createGameRectCollider,
  createGameReducedFlashSource,
  createGameReducedMotionSource,
  createGameSphereCollider,
  createGameTouchControlLayout,
  gameColliderAabb,
  gameColliders,
  gameInputReplayEventsAt,
  createGameLoopPlan,
  runGameSimulation,
  type GameAccessibilityFocusOptions,
  type GameAccessibilityLabelOptions,
  type GameAccessibilityPauseControlsOptions,
  type GameAccessibilityPreferenceOptions,
  type GameAccessibilityRuntimeSettings,
  type GameAccessibilityRuntimeSettingsOptions,
  type GameAccessibilitySource,
  type GameAccessibilitySourceKind,
  type GameAabb,
  type GameBounds3,
  type GameCameraDirector,
  type GameCameraDirectorOptions,
  type GameCameraSnapshot,
  type GameCameraTarget,
  type GameCollisionAddBodyOptions,
  type GameCollisionBodyHandle,
  type GameCollisionBodyOptions,
  type GameCollisionBodySnapshot,
  type GameCollisionBox,
  type GameCollisionContact,
  type GameCollisionEvent,
  type GameCollisionParticipant,
  type GameCollisionQueryFilter,
  type GameCollisionSweepHit,
  type GameCollisionSweepOptions,
  type GameCollisionWorld,
  type GameCollisionWorldSnapshot,
  type GameCombatActorOptions,
  type GameCombatActorSnapshot,
  type GameCombatActiveAttackSnapshot,
  type GameCombatEvent,
  type GameCombatEventRuntimeBridgeOptions,
  type GameCombatEventRuntimeBridgeResult,
  type GameCombatEventType,
  type GameCombatMove,
  type GameCombatWorld,
  type GameCombatWorldSnapshot,
  type GameBoxCollider,
  type GameBoxColliderOptions,
  type GameCapsuleCollider,
  type GameCapsuleColliderOptions,
  type GameCollider,
  type GameColliderAxis,
  type GameColliderBase,
  type GameColliderDimension,
  type GameColliderFactoryOptions,
  type GameColliderKind,
  type GameColliderPlane,
  type GameDebugGeometryNode,
  type GameDebugGeometryOptions,
  type GameDebugGeometryPrimitive,
  type GameDebugOverlayData,
  type GameDebugOverlayMetric,
  type GameDebugOverlayOptions,
  type GameDebugOverlaySection,
  type GameDebugSceneNode,
  type GameDebugSceneNodeOptions,
  type GameDebugScenePrimitive,
  type GameEffectInstance,
  type GameEffectAttachment,
  type GameEffectKind,
  type GameEffectOptions,
  type GameEffectsController,
  type GameEffectsSnapshot,
  type GameEventInput,
  type GameEventLog,
  type GameEventLogOptions,
  type GameEventLogSnapshot,
  type GameEventRecord,
  type GameEventSeverity,
  type GameHudActorBindingOptions,
  type GameHudBinding,
  type GameHudBindingKind,
  type GameHudComboBindingOptions,
  type GameHudDebugToggleBindingOptions,
  type GameHudEventLogBindingOptions,
  type GameHudObjectiveBindingOptions,
  type GameHudResolvedValue,
  type GameHudRoundBindingOptions,
  type GameHudScoreBindingOptions,
  type GameHudSourceKind,
  type GameHudSnapshot,
  type GameHudSnapshotItem,
  type GameHudSnapshotOptions,
  type GameHudTimerBindingOptions,
  type GameHudValueBindingOptions,
  type GameHudValueFormat,
  type GameInputActionState,
  type GameInputAxisSettings,
  type GameInputAxisBinding,
  type GameInputController,
  type GameInputOptions,
  type GameInputReplayDriver,
  type GameInputReplayDriverSnapshot,
  type GameInputReplayEvent,
  type GameInputReplayOptions,
  type GameInputReplayPlan,
  type GameInputSnapshot,
  type GameJumpAssistController,
  type GameJumpAssistOptions,
  type GameJumpAssistSnapshot,
  type GameJumpAssistUpdate,
  type GameKinematicBody,
  type GameKinematicBodyOptions,
  type GameKinematicBodySnapshot,
  type GameLoopPlan,
  type GamePointerSnapshot,
  type GameRectCollider,
  type GameRectColliderOptions,
  type GameRuntimeSubsystemId,
  type GameRuntimeSubsystemOwnership,
  type GameSimulation,
  type GameSimulationFrame,
  type GameSimulationOptions,
  type GameSimulationResult,
  type GameSimulationStepContext,
  type GameSimulationStepResult,
  type GameSphereCollider,
  type GameSphereColliderOptions,
  type GameSubsystemOwner,
  type GameTouchControlAnchor,
  type GameTouchControlKind,
  type GameTouchControlLayout,
  type GameTouchControlLayoutOptions,
  type GameTouchControlRegion,
  type GameTouchControlRequest,
  type GameVec3,
  type GamepadSnapshot
} from "./GameRuntime";
export {
  collectGameSceneRuntimeNodes,
  createGameSceneBridge,
  createRuntimeNodeSpec,
  type GameSceneBridge,
  type GameSceneBridgeApp,
  type GameSceneBridgeBodyLike,
  type GameSceneBridgeEvidence,
  type GameSceneBridgeNodeHandle,
  type GameSceneRuntimeNode
} from "./GameSceneBridge";
export {
  calculateRuntimeNodeBounds,
  createRuntimeNodeEffectAttachment,
  runtimeNodeHasTag,
  type AuraRuntimeNodeAnimationPoseBindingMetadata,
  type AuraRootMotionBinding,
  type AuraRuntimeNodeAnimationBindingMetadata,
  type AuraRuntimeNodeBounds,
  type AuraRuntimeNodeEffectAttachment,
  type AuraRuntimeNodeEffectKind,
  type RuntimeNodeAnimationSpecLike,
  type RuntimeNodeBoundsInput,
  type RuntimeNodeHandleLike,
  type RuntimeNodeMorphTargetWeights,
  type RuntimeNodeVec3
} from "./RuntimeNodeHandle";
export {
  createFightingGameKit,
  fighting,
  fighterRuntimeNode,
  type FightingActorState,
  type FightingControls,
  type FightingGameKit,
  type FightingGameKitOptions,
  type FightingGameSnapshot,
  type FightingStageOptions
} from "./game-kits/fighting";
export { gameKits } from "./game-kits";
export type {
  GameRuntimeEvidence,
  GameRuntimeEvidenceApp,
  GameRuntimeEvidenceOptions,
  GameRuntimeSourceEvidence
} from "./GameEvidence";
export * from "./GameAssetValidation.js";
export * from "./CharacterAssembly.js";
export * from "./AssetEvidence.js";
export * from "./AnimationController.js";
export * from "./AnimationMixerBuilders.js";
export * from "./AnimationDebugOverlay.js";
export {
  gameAssetValidation,
  quaterniusGameReadyFighterValidationContract,
  validateQuaterniusGameReadyFighterAsset
} from "./GameAssetValidation.js";
export { createAnimationController } from "./AnimationController.js";
export * from "./PromptAnimationContract.js";
export * from "./AuraVoiceBridge.js";
export * from "./ShotTimeline.js";
export * from "./DialoguePerformance.js";
export * from "./VisemeController.js";
export * from "./PromptAnimationEvidence.js";
export * from "./AnimationDirector.js";
export * from "./AnimationPerformance.js";
export * from "./AnimationRenderQueue.js";
export * from "./AnimationAssetManifest.js";
export * from "./SceneGroundingUtils.js";
export * from "./SubjectFramingUtils.js";
export * from "./LayeredSceneComposition.js";
export * from "./TouchControlBinding.js";
export * from "./AssetLibraryBrowser.js";

export { instances } from "./nodes/instances.js";

export { shadows } from "./nodes/shadows.js";

export { material } from "./nodes/material.js";

export { lights } from "./nodes/lights.js";

export { camera } from "./nodes/camera.js";

/**
 * D3 atmosphere builders (PRD D3 boxes 1-2). ADDITIVE root surface over the
 * pure descriptors in `@aura3d/rendering` (`DayNightSky.ts`,
 * `AtmosphereWetness.ts`, `Weather.ts`).
 *
 * Every builder below composes pre-existing node kinds only (primitive,
 * light, effect); no existing builder is modified. Precipitation pixels in
 * the default production path come from weather-state-driven primitive
 * streaks/flakes, because the production bridge does not pixel-back `rain`,
 * `snow`, or `particles` effect passes (they render only in the safe-basic
 * fallback and the Canvas2D diagnostic path). The matching effect node is
 * still declared so diagnostics report the request.
 */
export { sky } from "./nodes/sky.js";

export { weather } from "./nodes/weather.js";

/**
 * D3 water surface builder (PRD D3 box 3). ADDITIVE root surface over
 * `createWaterSurface` in `@aura3d/rendering`.
 *
 * Rendered material = layered opaque depth-tinted bands (bounded refraction
 * look) + fresnel-baked sky tint + white shore-foam discs mapped from
 * `OceanFoamPatch` + boat + fading wake trail. Buoyancy queries stay on the
 * fixture (`sampleOceanFixture().buoyancy`); this builder creates no planar
 * reflection/refraction targets (B4 dependency, see
 * WATER_SURFACE_PLANAR_DEPENDENCY).
 */
export { water } from "./nodes/water.js";

export { collectGameRuntimeEvidence } from "./nodes/game/index.js";

export { createGameRacingCameraRig } from "./nodes/game/racingCamera.js";

export { game } from "./nodes/game/index.js";

export { particles } from "./nodes/particles.js";

export { markAuraLazySystemRequested } from "./devtools/lazySystemEvidence.js";

export { markAuraLazySystemLoaded } from "./devtools/lazySystemEvidence.js";

export { collectAuraLazySystemEvidence } from "./devtools/lazySystemEvidence.js";

export { sceneKits } from "./nodes/sceneKits.js";

export { definePromptPlan } from "./nodes/prompt/promptPlan.js";

export { compilePromptPlan } from "./nodes/prompt/promptPlan.js";

export { promptRecipes } from "./nodes/prompt/promptRecipes.js";

export { createAuraApp } from "./app/createAuraApp.js";

export { createGameApp } from "./app/createGameApp.js";

/**
 * C1 texture intent classification (pure, unit-tested). Asset refs resolve to
 * fetchable urls; procedural inputs have no rasterizer and are reported so
 * the caller can warn instead of silently dropping them.
 */

export { createProductionPrimitiveTextureIntent } from "./compiler/textures.js";

/**
 * C1 metallic-roughness compositing (pure, unit-tested). glTF convention:
 * R = occlusion (unused here, forced to 255), G = roughness, B = metallic.
 * Missing channels fall back to the scalar spec values.
 */

/**
 * C1 post-mount textured upgrade (muse3jsparity-PRD). Runs fire-and-forget
 * after mount: scalar first frames stay fast and honest, and every outcome —
 * textured, fallback, or skipped — is recorded on the resource with warnings.
 * Procedural inputs have no rasterizer: recorded + warned, never faked.
 */
export { upgradeProductionPrimitiveTextures } from "./compiler/textures.js";

/**
 * B3 post-mount HDRI upgrade (muse3jsparity-PRD). Fetches a Radiance `.hdr`
 * asset, runs the HDR→cubemap→GGX-prefilter→BRDF-LUT chain, and returns the
 * live lighting object plus its disposal. Throws on fetch/parse failure so
 * the caller keeps the honest procedural fallback and warns.
 */
export { upgradeProductionEnvironmentHdri } from "./compiler/primitives.js";

export { compositeMetallicRoughnessPixels } from "./compiler/textures.js";

/**
 * G1 SDF text resource (muse3jsparity-PRD): replays the recorded descriptor
 * through the atlas sampler at mount, uploads the label image as a native
 * texture, and submits atlas-derived quads. Returns null (extruded fallback)
 * with a warning when the sampler cannot run — never a silent mesh swap.
 */

/**
 * M2 mip-chain byte estimate (pure, unit-tested): full chain from the base
 * level, coarse-to-fine, RGBA8. Matches the GPU residency the bridge funds.
 */
export { mipChainBytesCoarseToFine } from "./compiler/textures.js";

/** M2 streaming budget normalization (pure, unit-tested): default 256 MiB, fail-closed. */
export { normalizeTextureBudgetBytes } from "./app/rendererOptions.js";

export type { TextureStreamingTableEntry } from "./compiler/primitives.js";

/**
 * M2 streaming residency from the post-upgrade texture table (pure,
 * unit-tested): distance-prioritized mip funding against the budget with
 * over-budget telemetry for the unfunded tail.
 */
export { describeTextureStreamingResidency } from "./compiler/primitives.js";

/**
 * N1 spot shadow observation (pure, unit-tested): cone + atlas tier from the
 * authored spot, pixel-backing gated on the device-observed map signals with
 * the spot as caster. No signal, no claim.
 */
export { describeProductionSpotShadow } from "./compiler/shadows.js";

function transformNormals(normals: Float32Array, matrix: Float32Array): Float32Array {
  const output = new Float32Array(normals.length);
  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index]!;
    const y = normals[index + 1]!;
    const z = normals[index + 2]!;
    const nx = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z;
    const ny = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z;
    const nz = matrix[2]! * x + matrix[6]! * y + matrix[10]! * z;
    const length = Math.hypot(nx, ny, nz) || 1;
    output[index] = nx / length;
    output[index + 1] = ny / length;
    output[index + 2] = nz / length;
  }
  return output;
}

export function createViewProjection(snapshot: AuraSceneSnapshot, aspect: number, time: number, runtimeNodes?: AuraRuntimeNodeRegistry): Float32Array {
  const cameraSpec = snapshot.camera;
  const { target, eye } = resolveCameraFrame(snapshot, cameraSpec, time, runtimeNodes);
  const view = lookAtMat4([...eye], [...target], [0, 1, 0]);
  const projection = createCameraProjection(cameraSpec, aspect);
  return new Float32Array(multiplyMat4(projection, view));
}

export function createModelMatrix(node: AuraModelNode | AuraPrimitiveNode | AuraEffectNode | undefined, bounds: GltfBounds, normalizeToUnit: boolean, time = 0): Float32Array {
  const extent = [
    Math.max(0.001, bounds.max[0] - bounds.min[0]),
    Math.max(0.001, bounds.max[1] - bounds.min[1]),
    Math.max(0.001, bounds.max[2] - bounds.min[2])
  ] as const;
  const fitScale = resolveModelFitScale(node, extent, normalizeToUnit);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const baseSize = node?.kind === "primitive" ? primitiveSize(node) : [1, 1, 1] as const;
  const nodeScale = typeof node?.scale === "number" ? [node.scale, node.scale, node.scale] as const : node?.scale ?? [1, 1, 1] as const;
  const position = animatedPosition(node, time);
  const rotation = animatedRotation(node, time);
  return multiply4(
    translation(position[0], position[1], position[2]),
    multiply4(
      rotationXYZ(rotation),
      multiply4(
        scaling(nodeScale[0] * baseSize[0] * fitScale, nodeScale[1] * baseSize[1] * fitScale, nodeScale[2] * baseSize[2] * fitScale),
        normalizeToUnit ? translation(-centerX, -bounds.min[1], -centerZ) : identity4()
      )
    )
  );
}

function resolveModelFitScale(
  node: AuraModelNode | AuraPrimitiveNode | AuraEffectNode | undefined,
  extent: readonly [number, number, number],
  normalizeToUnit: boolean
): number {
  if (node?.kind === "model") {
    if (isPositiveFinite(node.targetHeight)) return node.targetHeight / extent[1];
    if (isPositiveFinite(node.targetLength)) return node.targetLength / Math.max(extent[0], extent[2]);
    if (isPositiveFinite(node.targetMaxDimension)) return node.targetMaxDimension / Math.max(extent[0], extent[1], extent[2]);
  }
  return normalizeToUnit ? AURA_NORMALIZED_MODEL_MAX_DIMENSION / Math.max(extent[0], extent[1], extent[2]) : 1;
}

export function shouldNormalizeModelNode(node: AuraModelNode | undefined): boolean {
  return node?.scaleMode !== "world";
}

function animatedRotation(node: AuraModelNode | AuraPrimitiveNode | AuraEffectNode | AuraLabelNode | undefined, time: number): AuraVec3 {
  const baseRotation = node?.rotation ?? [0, 0, 0];
  if (!node?.animation) return baseRotation;
  if (node.kind === "model" && !isModelTransformAnimationClip(node.animation.clip)) return baseRotation;
  const speed = Math.max(0.05, node.animation.speed ?? 1);
  const seconds = resolveAnimationSeconds(node.animation, time);
  if (node.animation.clip === "turntable") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.72, baseRotation[2]];
  }
  if (node.animation.clip === "float") {
    return [baseRotation[0], baseRotation[1] + seconds * speed * 0.28, baseRotation[2]];
  }
  if (node.animation.clip === "orbit") {
    return [baseRotation[0], baseRotation[1] + orbitAnimatedAngle(seconds, speed), baseRotation[2]];
  }
  if (node.animation.clip === "pulse" || node.animation.clip === "walk") return baseRotation;
  return [baseRotation[0], baseRotation[1] + seconds * speed, baseRotation[2]];
}

export function isModelTransformAnimationClip(clip: string | undefined): boolean {
  return clip === "turntable" || clip === "float" || clip === "orbit";
}

export function isOrthographicCameraMode(mode: AuraCameraMode): boolean {
  return mode === "orthographic" || mode === "isometric";
}

export function identity4(): Float32Array {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]);
}

export function colorToRgb(color: AuraColor): readonly [number, number, number] {
  const clear = colorToClearColor(color);
  return [clear[0], clear[1], clear[2]];
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalize3(value: AuraVec3): AuraVec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

export function flattenSceneSnapshot(snapshot: AuraSceneSnapshot): AuraSceneSnapshot {
  return {
    ...snapshot,
    nodes: flattenSceneNodes(snapshot.nodes)
  };
}

export { resolveCanvas, configureCanvas } from "./app/canvas.js";
export { createAuraGameRuntime } from "./app/createAuraGameRuntime.js";
export { AuraRuntimeError, createAuraAssetLoadError } from "./app/errors.js";
export { startProductionRender } from "./app/frameLoop.js";
export { registerAuraApp, unregisterAuraApp, auraAppRegistry } from "./app/liveApps.js";
export { devicePixelRatioSafe, performanceNow } from "./app/platform.js";
export { markRouteReady, markRouteError } from "./app/routeState.js";
export { captureAuraScreenshot } from "./app/screenshot.js";
export { resolveProductionActorRuntimeState, applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createProductionRuntimeMetadata, productionActorModelBounds, auraProductionBoundsProbes, resolveProductionActorAnimationSeconds } from "./compiler/actors.js";
export { resolveCameraFrame } from "./compiler/camera.js";
export { multiplyRgb, colorToRgba, colorToLinearRgba, colorToAcesInputClearColor, colorToLinearRgb } from "./compiler/color.js";
export { getParticleLife, writeParticlePosition, seededRange } from "./compiler/effects.js";
export { createSceneLabelOcclusionTest } from "./compiler/labels.js";
export { isRenderableModelNode, isWebGLRenderableNode, resolveNativeBloomRadius, resolveProductionRuntimeShadowTuning, createProductionRuntimeShadowObservation, createProductionTexturesObservation, createProductionRuntimePostprocessObservation, createProductionRuntimeCollectedLights, resolveProductionShadowCasterIndex, productionRuntimeLightDirection, quaternionFromForwardDirection, normalizedDirection, nonNegativeFinite, clampNumber, productionRenderErrorMessage, normalizeSceneSnapshot } from "./compiler/observations.js";
export { resolveProductionPrimitiveScalars, createProductionPrimitiveMaterial, createProductionPrimitiveGeometry, primitiveGeometryBounds } from "./compiler/primitives.js";
export { createProductionTextObservation } from "./compiler/text.js";
export { createBuffer } from "./compiler/webglRuntime.js";
export { renderDiagnosticPreviewToCanvas, shouldRenderOverlay, createDiagnosticsOverlay } from "./devtools/diagnosticPreview.js";
export { validateSceneAssets, createAssetProvenance, createInitialDiagnostics, snapshotDiagnostics } from "./devtools/diagnostics.js";
export { lazySystems } from "./devtools/lazySystems.js";
export { performance } from "./devtools/performanceEvidence.js";
export { renderer, createRendererDiagnosticReport, resolveRendererSceneCategory } from "./devtools/rendererDiagnostics.js";
export { createAuraRouteHealthSnapshot } from "./devtools/routeHealth.js";
export { createRuntimeNodeImportedAssetEvidence, cloneRuntimeAnimationPose, cloneRuntimeImportedAssetEvidence, sanitizeRuntimeMorphWeight } from "./devtools/runtimeEvidence.js";
export { collectAuraSceneEvidence } from "./devtools/sceneEvidence.js";
export { sceneKitPerformanceBudget, createSceneKitPerformanceDiagnostics, buildSceneKit } from "./devtools/sceneKitDiagnostics.js";
export { animation, animationStudio } from "./nodes/animation.js";
export { defineAuraAssets } from "./nodes/assets.js";
export { AuraNodeBuilder } from "./nodes/builder.js";
export { distance3, character } from "./nodes/character.js";
export { charts } from "./nodes/charts.js";
export { makeCityCrosswalk, makeCityRoadMarkings, makeBuildingWindowRows, makeBuildingDetails, makeCityVehicle, makeCityProps, collectCityInstancingPlan, city } from "./nodes/city.js";
export { editor } from "./nodes/editor.js";
export { effects } from "./nodes/effects.composite.js";
export { environments, environmentMapPresets } from "./nodes/environments.composite.js";
export { gameFeel } from "./nodes/gameFeel.js";
export { games } from "./nodes/games.js";
export { geometry } from "./nodes/geometry.js";
export { group, distanceLod, groups, findGroupNode } from "./nodes/groups.js";
export { interactions } from "./nodes/interactions.js";
export { labels } from "./nodes/labels.js";
export { proceduralTexture, PHYSICAL_SPEC_KEYS, createMaterialCapabilityDiagnostics, createMaterialInspector, minimumMaterialFeatureDistance } from "./nodes/materialTools.js";
export { model, unsafeModelUrl, builtInCharacterAssets } from "./nodes/model.js";
export { neon } from "./nodes/neon.js";
export { physics, createRuntimeScenePhysics, eulerToQuat, resolveNodePhysicsShape } from "./nodes/physics.js";
export { createGameRacingRoadMeshNodes, createGameRacingCheckpointGateNodes, createGameRacingStartFinishNodes, createGamePublicRacingPresentationNodes, createGameRacingTopDownCamera, certifyPublicRacingPresentation, createGameRacingPresentationTrackNodes, createGamePublicPlatformerPresentationNodes, createGamePlatformerGroundMeshNodes, createGamePlatformerPlatformMeshNodes, createGamePlatformerHazardNodes, createGamePlatformerCheckpointNodes, createGamePlatformerFinishNodes, createGamePlatformerCameraRig, certifyPublicPlatformerPresentation, createGamePlatformerPresentationSurfaceNodes } from "./nodes/prefabs/gamePresentation.js";
export { prefabs } from "./nodes/prefabs/index.js";
export { primitive, primitives } from "./nodes/primitives.js";
export { product } from "./nodes/product.js";
export { promptSubjectIsResolved, resolvePromptPlanSubject, promptPlanToScene } from "./nodes/promptPlans.js";
export { resolveFrameAssetRenderScale, AuraSceneBuilder, scene } from "./nodes/scene.js";
export { solarMaterialPresetsInNodes, solar } from "./nodes/solar.js";
export { rootSdfFontAtlas, text3D } from "./nodes/text3d.js";
export { timeline } from "./nodes/timeline.js";
export type { AuraVec3 } from "./nodes/types.js";
export type { AuraColor } from "./nodes/types.js";
export type { AuraAssetType } from "./nodes/types.js";
export type { AuraModelFormat } from "./nodes/types.js";
export type { AuraTextureFormat } from "./nodes/types.js";
export type { AuraProceduralTextureKind } from "./nodes/types.js";
export type { AuraProceduralTextureSpec } from "./nodes/types.js";
export type { AuraMaterialTextureInput } from "./nodes/types.js";
export type { AuraTextureTransform } from "./nodes/types.js";
export type { AuraAssetDefinition } from "./nodes/types.js";
export type { AuraAssetMetadata } from "./nodes/types.js";
export type { AuraAssetRef } from "./nodes/types.js";
export type { AuraAssetMap } from "./nodes/types.js";
export type { AuraTransformSpec } from "./nodes/types.js";
export type { AuraMaterialSpec } from "./nodes/types.js";
export type { AuraEditableMaterialParameters } from "./nodes/types.js";
export type { AuraMaterialInspectorParameter } from "./nodes/types.js";
export type { AuraMaterialInspectorPanel } from "./nodes/types.js";
export type { AuraMaterialVisualQAResult } from "./nodes/types.js";
export type { AuraMaterialCapabilityFeatureId } from "./nodes/types.js";
export type { AuraMaterialCapabilitySupport } from "./nodes/types.js";
export type { AuraMaterialCapabilityFeature } from "./nodes/types.js";
export type { AuraMaterialCapabilityDiagnostics } from "./nodes/types.js";
export type { AuraMaterialCapabilityInput } from "./nodes/types.js";
export type { AuraModelRole } from "./nodes/types.js";
export type { AuraModelScaleMode } from "./nodes/types.js";
export type { AuraModelOptions } from "./nodes/types.js";
export type { AuraPrimitiveOptions } from "./nodes/types.js";
export type { AuraBuiltinPrimitive } from "./nodes/types.js";
export type { AuraRootLodLevelSpec } from "./nodes/types.js";
export type { AuraRootLodSpec } from "./nodes/types.js";
export type { AuraAnimationSpec } from "./nodes/types.js";
export type { AuraRuntimeNodeSpec } from "./nodes/types.js";
export type { AuraInteractionSpec } from "./nodes/types.js";
export type { AuraCharacterClipName } from "./nodes/types.js";
export type { AuraCharacterStyle } from "./nodes/types.js";
export type { AuraCharacterPose } from "./nodes/types.js";
export type { AuraCharacterJointName } from "./nodes/types.js";
export type { AuraCharacterJoint } from "./nodes/types.js";
export type { AuraCharacterClip } from "./nodes/types.js";
export type { AuraCharacterSkeleton } from "./nodes/types.js";
export type { AuraCharacterRigSpec } from "./nodes/types.js";
export type { AuraCharacterFootPlantingSpec } from "./nodes/types.js";
export type { AuraCharacterRootMotionSpec } from "./nodes/types.js";
export type { AuraCharacterConstraintCorrectionSpec } from "./nodes/types.js";
export type { AuraCharacterVisualQAGap } from "./nodes/types.js";
export type { AuraCharacterVisualQAResult } from "./nodes/types.js";
export type { AuraProceduralHumanMeshPartName } from "./nodes/types.js";
export type { AuraProceduralHumanMeshPart } from "./nodes/types.js";
export type { AuraProceduralHumanMeshDescriptor } from "./nodes/types.js";
export type { AuraHelperBudgetId } from "./nodes/types.js";
export type { AuraHelperPerformanceBudget } from "./nodes/types.js";
export type { AuraSceneNode } from "./nodes/types.js";
export type { AuraModelNode } from "./nodes/types.js";
export type { AuraPrimitiveNode } from "./nodes/types.js";
export type { AuraGroupNode } from "./nodes/types.js";
export type { AuraLightType } from "./nodes/types.js";
export type { AuraLightNode } from "./nodes/types.js";
export type { AuraEffectType } from "./nodes/types.js";
export type { AuraParticleMaterialMode } from "./nodes/types.js";
export type { AuraEffectNode } from "./nodes/types.js";
export type { AuraParticleBudgetDiagnostics } from "./nodes/types.js";
export type { AuraLabelNode } from "./nodes/types.js";
export type { AuraEnvironmentNode } from "./nodes/types.js";
export type { AuraSceneCategory } from "./nodes/types.js";
export type { AuraRendererColorManagementPreset } from "./nodes/types.js";
export type { AuraSceneExposurePreset } from "./nodes/types.js";
export type { AuraEnvironmentMapPreset } from "./nodes/types.js";
export type { AuraRendererQualityPreset } from "./nodes/types.js";
export type { AuraRendererQualityProfileId } from "./nodes/types.js";
export type { AuraRendererMode } from "./nodes/types.js";
export type { AuraRendererFallbackMode } from "./nodes/types.js";
export type { AuraRendererQualityProfile } from "./nodes/types.js";
export type { AuraCreateAppRendererOptions } from "./nodes/types.js";
export type { AuraRendererDiagnosticReport } from "./nodes/types.js";
export type { AuraInteractionNode } from "./nodes/types.js";
export type { AuraPhysicsShapeKind } from "./nodes/types.js";
export type { AuraNodePhysicsSpec } from "./nodes/types.js";
export type { AuraPhysicsStepOptions } from "./nodes/types.js";
export type { AuraPhysicsDebugSnapshot } from "./nodes/types.js";
export type { AuraPhysicsSceneSummary } from "./nodes/types.js";
export type { AuraPhysicsWheelSpec } from "./nodes/types.js";
export type { AuraPhysicsWheelTuning } from "./nodes/types.js";
export type { AuraPhysicsWheelCommand } from "./nodes/types.js";
export type { AuraPhysicsWheelState } from "./nodes/types.js";
export type { AuraPhysicsVehicleAxis } from "./nodes/types.js";
export type { AuraPhysicsVehicleController } from "./nodes/types.js";
export type { AuraPhysicsCharacterDescriptor } from "./nodes/types.js";
export type { AuraPhysicsCharacterMovement } from "./nodes/types.js";
export type { AuraPhysicsCharacterController } from "./nodes/types.js";
export type { AuraPhysicsWorldController } from "./nodes/types.js";
export type { AuraNodeInput } from "./nodes/types.js";
export type { AuraCameraMode } from "./nodes/types.js";
export type { AuraCameraSpec } from "./nodes/types.js";
export type { AuraBoundsSpec } from "./nodes/types.js";
export type { AuraCameraFrameAssetOptions } from "./nodes/types.js";
export type { AuraTimelineSpec } from "./nodes/types.js";
export type { AuraEnvironmentOptions } from "./nodes/types.js";
export type { AuraRendererRuntimeObservation } from "./nodes/types.js";
export type { AuraSceneSnapshot } from "./nodes/types.js";
export type { CityBlockTimeOfDay } from "./nodes/types.js";
export type { AuraCityCameraPreset } from "./nodes/types.js";
export type { AuraCityBlockOptions } from "./nodes/types.js";
export type { AuraCityStateChangeEvidence } from "./nodes/types.js";
export type { AuraCityInstancingPlan } from "./nodes/types.js";
export type { AuraCityVisualQAResult } from "./nodes/types.js";
export type { AuraCityStateController } from "./nodes/types.js";
export type { AuraSolarSystemPrefabOptions } from "./nodes/types.js";
export type { AuraSolarPlanetMaterialPreset } from "./nodes/types.js";
export type { AuraSolarVisualQAResult } from "./nodes/types.js";
export type { AuraNeonPalettePreset } from "./nodes/types.js";
export type { AuraNeonTunnelOptions } from "./nodes/types.js";
export type { AuraNeonVisualQAResult } from "./nodes/types.js";
export type { AuraPrimitiveHumanoidPrefabOptions } from "./nodes/types.js";
export type { AuraDataBars3DPrefabOptions } from "./nodes/types.js";
export type { AuraChartTheme } from "./nodes/types.js";
export type { AuraChartVisualQAResult } from "./nodes/types.js";
export type { AuraProductStageStyle } from "./nodes/types.js";
export type { AuraProductViewerOptions } from "./nodes/types.js";
export type { AuraProductPlacement } from "./nodes/types.js";
export type { AuraProductDiagnostics } from "./nodes/types.js";
export type { AuraProductVisualQAResult } from "./nodes/types.js";
export type { AuraMiniGolfMetrics } from "./nodes/types.js";
export type { AuraMiniGolfStateController } from "./nodes/types.js";
export type { AuraMiniGolfPointerPoint } from "./nodes/types.js";
export type { AuraMiniGolfShotInput } from "./nodes/types.js";
export type { AuraGameLoopPlan } from "./nodes/types.js";
export type { AuraGameInputPlan } from "./nodes/types.js";
export type { AuraGameInputAxisBinding } from "./nodes/types.js";
export type { AuraGameInputActionState } from "./nodes/types.js";
export type { AuraGameInputReplayEvent } from "./nodes/types.js";
export type { AuraGameInputSnapshot } from "./nodes/types.js";
export type { AuraGameInputController } from "./nodes/types.js";
export type { AuraGameRuntimeEvidence } from "./nodes/types.js";
export type { AuraGameRules } from "./nodes/types.js";
export type { AuraGameRuntimeOptions } from "./nodes/types.js";
export type { AuraGameRuntime } from "./nodes/types.js";
export type { AuraRacingPresentationTrackOptions } from "./nodes/types.js";
export type { AuraRacingRoadMeshOptions } from "./nodes/types.js";
export type { AuraRacingCheckpointGateOptions } from "./nodes/types.js";
export type { AuraRacingStartFinishOptions } from "./nodes/types.js";
export type { AuraPublicRacingPresentationOptions } from "./nodes/types.js";
export type { AuraRacingPresentationCertificationInput } from "./nodes/types.js";
export type { AuraPlatformerPresentationSurfaceOptions } from "./nodes/types.js";
export type { AuraPlatformerPublicSurfaceMode } from "./nodes/types.js";
export type { AuraPublicPlatformerPresentationOptions } from "./nodes/types.js";
export type { AuraPlatformerSurfaceMeshOptions } from "./nodes/types.js";
export type { AuraPlatformerHazardOptions } from "./nodes/types.js";
export type { AuraPlatformerCheckpointOptions } from "./nodes/types.js";
export type { AuraPlatformerFinishOptions } from "./nodes/types.js";
export type { AuraPlatformerPresentationCertificationInput } from "./nodes/types.js";
export type { AuraCityBrowserRuntimeState } from "./nodes/types.js";
export type { AuraCityDayNightToggleOptions } from "./nodes/types.js";
export type { AuraSceneKitId } from "./nodes/types.js";
export type { AuraSceneKitCustomizeOptions } from "./nodes/types.js";
export type { AuraSceneKitDiagnostics } from "./nodes/types.js";
export type { AuraSceneKitPerformanceDiagnostics } from "./nodes/types.js";
export type { AuraSceneKitDrawCallBudget } from "./nodes/types.js";
export type { AuraSceneKitBundleBudget } from "./nodes/types.js";
export type { AuraSceneKitFpsBudget } from "./nodes/types.js";
export type { AuraSceneKitInstancingFamilyEvidence } from "./nodes/types.js";
export type { AuraSceneKitInstancingEvidence } from "./nodes/types.js";
export type { AuraSceneKitLodEvidence } from "./nodes/types.js";
export type { AuraSceneKitLazySystemId } from "./nodes/types.js";
export type { AuraSceneKitLazyLoadingEntry } from "./nodes/types.js";
export type { AuraSceneKitLazyLoadingPlan } from "./nodes/types.js";
export type { AuraLazySystemEvidence } from "./nodes/types.js";
export type { AuraSceneKit } from "./nodes/types.js";
export type { AuraSceneKitBudgetDefaults } from "./nodes/types.js";
export type { AuraPromptSceneType } from "./nodes/types.js";
export type { AuraPromptEffectId } from "./nodes/types.js";
export type { AuraPromptCameraPreset } from "./nodes/types.js";
export type { AuraPromptLightingPreset } from "./nodes/types.js";
export type { AuraPromptInteractionMode } from "./nodes/types.js";
export type { AuraPromptResolvedSubject } from "./nodes/types.js";
export type { AuraPromptIntentSubject } from "./nodes/types.js";
export type { AuraPromptPlanSubject } from "./nodes/types.js";
export type { AuraPromptSubjectResolver } from "./nodes/types.js";
export type { AuraPromptPlan } from "./nodes/types.js";
export type { AuraPromptPlanReport } from "./nodes/types.js";
export type { AuraCompiledPromptPlan } from "./nodes/types.js";
export type { AuraBackend } from "./nodes/types.js";
export type { AuraDiagnostics } from "./nodes/types.js";
export type { AuraAssetProvenance } from "./nodes/types.js";
export type { AuraAssetLoadState } from "./nodes/types.js";
export type { AuraSceneEvidence } from "./nodes/types.js";
export type { AuraFrameInfo } from "./nodes/types.js";
export type { AuraFrameCallback } from "./nodes/types.js";
export type { AuraRuntimeNodeSnapshot } from "./nodes/types.js";
export type { AuraRuntimeNodeHandle } from "./nodes/types.js";
export type { AuraRuntimeNodeImportedAssetEvidence } from "./nodes/types.js";
export type { AuraRuntimeNodeImportedAssetDiagnostic } from "./nodes/types.js";
export type { AuraRuntimeNodeImportedAssetEvidenceInput } from "./nodes/types.js";
export type { AuraRuntimeNodeRegistry } from "./nodes/types.js";
export type { AuraRuntimeState } from "./nodes/types.js";
export type { AuraApp } from "./nodes/types.js";
export type { AuraCreateAppOptions } from "./nodes/types.js";
export type { AuraCreateGameAppOptions } from "./nodes/types.js";
export type { AuraDiagnosticsOptions } from "./nodes/types.js";
export type { AuraScreenshot } from "./nodes/types.js";
export type { AuraAppTarget } from "./nodes/types.js";
export type { AuraAppRegistry } from "./nodes/types.js";
export type { WebGLRenderController } from "./nodes/types.js";
export type { ProductionRuntimeActorEntry } from "./nodes/types.js";
export type { ProductionRuntimePrimitiveEntry } from "./nodes/types.js";
export type { ProductionRuntimePrimitiveResource } from "./nodes/types.js";
export type { ProductionRuntimePrimitiveState } from "./nodes/types.js";
export type { ProductionRuntimeLightDescriptor } from "./nodes/types.js";
export type { AuraFountainParticleLayer } from "./nodes/types.js";
export type { WebGLSceneRenderer } from "./nodes/types.js";
export type { WebGLModel } from "./nodes/types.js";
export { ui } from "./nodes/ui.js";
export { visualScripting } from "./nodes/visualScripting.js";
