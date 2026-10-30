// Published-union surface (PRD-15 T1.4): names exported by packages/engine/src/index.ts
// that were missing from the published "." entry (dist/engine/agent-api/index.js).
// tests/qr/prd15/published-union.test.ts asserts the two barrels export identical sets.
// Contract-surface names re-export plain (T5.1 keeps them on "."); the remaining names
// carry @deprecated JSDoc naming their §6.6 destination subpath or "deleted in 4.0.0".

// ── Contract surface (intended "." members per PRD-15 T5.1; not deprecated) ──
export { StubActorAnimationApi } from "../contracts/animation.js";
export type { AuraActorAnimationApi, AuraActorAnimationStateSnapshot, AuraActorPoseApi, AuraAnimationDiagnostics, AuraBoneAttachSpec, AuraBoneMaskSpec, AuraBoneSocket, AuraCreateAppAnimationOptions, AuraPlayLayerOptions, AuraResolvedClipInfo, AuraRootMotionSpec } from "../contracts/animation.js";
export { appExtensionsAll, registerAppExtension } from "../contracts/app.js";
export type { AppExtension, AuraAppExtensionMap } from "../contracts/app.js";
export { auditArtDirection } from "../contracts/art.js";
export type { ArtDirectionViolation, GameAcceptance, GameBudgets, GameEntryV2, GameGenre, RebuildTier, RouteHealthQualityGate } from "../contracts/art.js";
export type { AuraAssetBudget, AuraAssetDecodersOption, AuraAssetLodLevel, AuraAssetLodOption, AuraAssetRequiredDecoder, AuraAssetVariants, AuraAssetsOption, AuraModelColliderOption, AuraModelLodOption } from "../contracts/assets.js";
export { StubAppAtmosphere } from "../contracts/atmosphere.js";
export type { AuraAppAtmosphere, AuraHeightFogSpec, AuraSkyNode, AuraSkySpec, AuraSkySunSpec, AuraVolumetricFogSpec } from "../contracts/atmosphere.js";
export { stubCameraRigFactories } from "../contracts/camera.js";
export type { AuraCameraController, AuraCameraEvidence, AuraCameraLayer, AuraCameraOption, AuraCameraPose, AuraCameraProbe, AuraCameraRailOptions, AuraCameraRig, AuraCameraRigContext, AuraCameraRigFactories, AuraCameraSequence, AuraCameraSequencePlayback, AuraCameraShot, AuraCameraSubject, AuraEaseName, AuraFovKickLayer, AuraPunchLayer, AuraTraumaLayer } from "../contracts/camera.js";
export { DIAGNOSTIC_ONLY_FIELDS, asRuntimeCompiled, bindRuntimeCompiled, compileScene, compilerSlot, nodeHandlerFor, nodeHandlersAll, optionCoverageRows, registerNodeHandler, registerOptionCoverage, setCompilerImpl, updateCompiledScene } from "../contracts/compiler.js";
export type { AnyNodeHandler, AuraCompiledFeature, AuraDegradation, AuraDegradationCode, AuraNodeKindMap, CompiledActor, CompiledScene, CompilerImpl, NodeHandler, OptionCoverageRow, RenderSourceContributions, RuntimeCompiledSceneInternals, SceneCompileContext } from "../contracts/compiler.js";
export { DIAGNOSTICS_SECTION_KEYS, diagnosticsSectionsAll, registerDiagnosticsSection } from "../contracts/diagnostics.js";
export type { AppliedLookReport, AuraDiagnosticsSectionKey, DiagnosticsSection, ShadowReport } from "../contracts/diagnostics.js";
export { StubAppEffects } from "../contracts/effects.js";
export type { AuraAppEffects, AuraDecalOptions, AuraEffectInstanceHandle, AuraEffectsDiagnostics, AuraVfxEffectSpec, AuraVfxKind } from "../contracts/effects.js";
export { registerEnvironmentSource, resolveEnvironment } from "../contracts/environment.js";
export type { AuraEnvironmentSource, AuraEnvironmentSourceKind, AuraEnvironmentSourceResolution } from "../contracts/environment.js";
export { resolveQrFlags } from "../contracts/flags.js";
export type { QrFlagInput } from "../contracts/flags.js";
export { captureFromUrl } from "../contracts/game.js";
export type { CaptureContext, CreateGameOptions, Game, GameBeacon, GameFxKind, GameFxLayer, GameScenario, GameSession, GameSessionState, GameShell, GameShellLayout, Hud, HudMountOptions, HudWidgetSpec, PauseReason, TouchControls, TouchPreset, TransitionSpec } from "../contracts/game.js";
export { StubLightingRuntime } from "../contracts/lighting.js";
export type { AuraDirectionalShadowOptions, AuraLightingDiagnostics, AuraLightingModel, AuraLightingOptions, AuraLightingRuntime, AuraLightsApiAdditions, AuraLocalShadowOptions, AuraShadowOptions } from "../contracts/lighting.js";
export { lookLint, registerLookLintRule } from "../contracts/looks.js";
export type { AuraLookDiagnostics, AuraLookId, AuraLookLintCode, AuraLookLintContext, AuraLookLintFinding, AuraLookLintRule, AuraLookNode, AuraLookOverrides, AuraStudioLookId } from "../contracts/looks.js";
export { StubModelMaterialHandle } from "../contracts/materials.js";
export type { AuraMaterialDiagnostics, AuraMaterialTextureSlot, AuraModelMaterialHandle, AuraModelMaterialOverride, AuraRendererMaterialOptions, AuraResolvedMaterialInfo } from "../contracts/materials.js";
export type { AuraOutputDiagnostics, AuraOutputOptions, AuraOutputOverlay, AuraOutputSurface, AuraToneMappingOperator } from "../contracts/output.js";
export { StubPostSurface, postPresets } from "../contracts/post.js";
export type { AuraAntiAliasMode, AuraAutoExposureOptions, AuraCustomPostPass, AuraPostDiagnostics, AuraPostPreset, AuraPostPresetId, AuraPostSurface } from "../contracts/post.js";
export { nodeHandleExtensionFor, nodeHandleExtensionsAll, registerNodeHandleExtension } from "../contracts/runtimeNodes.js";
export type { AuraNodeHandleExtensionMap, AuraRuntimeNodeRegistryV2, NodeHandleExtension } from "../contracts/runtimeNodes.js";
export { AuraColorParseError, composeWorldMatrix, decomposeMatrix, eulerToQuaternion, parseAuraColor, parseAuraColorSrgb } from "../contracts/sceneGraph.js";
export type { AuraEulerOrder, AuraQuat, AuraWorldTransform } from "../contracts/sceneGraph.js";
export { createGame } from "../contracts/stubs/game.js";
export { SCREEN_FEEL_BLACKBOARD_KEY, StubFeelBus, StubTimeController } from "../contracts/time.js";
export type { AuraFeelBus, AuraFeelEventSpec, AuraLoopOptions, AuraScreenFeelUniforms, AuraTimeController } from "../contracts/time.js";
export { WIND_CHUNK, worldQueriesSlot } from "../contracts/world.js";
export type { AuraBiomeId, AuraBiomeRig, AuraHeightQuery, AuraWindSpec, AuraWorldQualityTier, AuraWorldQueries, GroundRaycaster } from "../contracts/world.js";

// ── Deprecated union names (§6.6 destinations) ──
/** @deprecated Deleted from "." in 4.0.0. */
export { A3D_APP_WORKFLOW_PRESETS } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DApp } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppDiagnostics } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export { A3DAppLifecycle } from "../advanced-runtime/A3DAppLifecycle.js";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppLifecycleSnapshot } from "../advanced-runtime/A3DAppLifecycle.js";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppOptions } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppQualityPreset } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppQualitySettings } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DAppWorkflowPreset } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export type { A3DDisposable } from "../advanced-runtime/A3DAppLifecycle.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export { A3DRenderer } from "../advanced-runtime/A3DRenderer.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export type { A3DRendererOptions } from "../advanced-runtime/A3DRenderer.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export { A3DScene } from "../advanced-runtime/A3DScene.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export type { A3DSceneMeshOptions } from "../advanced-runtime/A3DScene.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export type { A3DSceneRenderSourceOptions } from "../advanced-runtime/A3DScene.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { assertAuraRouteReady } from "../testing/routeHealth.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { assertAuraScreenshotNotBlank } from "../testing/screenshot.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export type { AuraAssetPanelRow } from "../devtools/AuraAssetPanel.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraAssetPreloader } from "../runtime/AssetPreloader.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraAssetPreloadResult } from "../runtime/AssetPreloader.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export type { AuraDiagnosticsOverlay } from "../devtools/AuraDiagnosticsOverlay.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export type { AuraPerformancePanelSnapshot } from "../devtools/AuraPerformancePanel.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraResourceDescriptor } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraResourceKind } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraResourceManager } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export type { AuraResourceManagerEvidence } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraResourceRecord } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export type { AuraResourceStatus } from "../runtime/ResourceManager.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export type { AuraRouteHealth } from "../testing/routeHealth.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { captureAuraAppScreenshot } from "../testing/screenshot.js";
/** @deprecated Deleted from "." in 4.0.0. */
export { createA3DApp } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export { createAnimationLabWorkflow } from "@aura3d/workflows";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { createAssetCompatibilityReport } from "@aura3d/assets/browser";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { createAssetPreloader } from "../runtime/AssetPreloader.js";
/** @deprecated Deleted from "." in 4.0.0. */
export { createAssetViewerWorkflow } from "@aura3d/workflows";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { createAuraAssetPanelRows } from "../devtools/AuraAssetPanel.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { createAuraDiagnosticsOverlay } from "../devtools/AuraDiagnosticsOverlay.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { createAuraPerformancePanelSnapshot } from "../devtools/AuraPerformancePanel.js";
/** @deprecated Use `@aura3d/engine/devtools`. Deleted from "." in 4.0.0. */
export { createAuraRouteHealth } from "../testing/routeHealth.js";
/** @deprecated Deleted from "." in 4.0.0. */
export { createComparisonWorkflow } from "@aura3d/workflows";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export { createECSRenderSource } from "../ecs/ECSRenderSource.js";
/** @deprecated Deleted from "." in 4.0.0. */
export { createExternalParityEnvironmentPipeline } from "@aura3d/rendering";
/** @deprecated Deleted from "." in 4.0.0. */
export { createInteractiveSceneWorkflow } from "@aura3d/workflows";
/** @deprecated Deleted from "." in 4.0.0. */
export { createMaterialStudioWorkflow } from "@aura3d/workflows";
/** @deprecated Deleted from "." in 4.0.0. */
export { createProductConfiguratorWorkflow } from "@aura3d/workflows";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { createResourceManager } from "../runtime/ResourceManager.js";
/** @deprecated Deleted from "." in 4.0.0. */
export { createSceneShowcaseWorkflow } from "@aura3d/workflows";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export type { ECSRenderLibraries } from "../ecs/ECSRenderSource.js";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export type { ECSRenderSourceOptions } from "../ecs/ECSRenderSource.js";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { GLTFLoader } from "@aura3d/assets/browser";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { inspectGLTFAsset } from "@aura3d/assets/browser";
/** @deprecated Deleted from "." in 4.0.0. */
export { listExternalParityEnvironmentTargets } from "@aura3d/rendering";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { loadProductAsset } from "@aura3d/product-studio";
/** @deprecated Use `@aura3d/engine/assets`. Deleted from "." in 4.0.0. */
export { loadRenderableAsset } from "@aura3d/assets/browser";
/** @deprecated Use `@aura3d/engine/renderer`. Deleted from "." in 4.0.0. */
export { Renderer } from "@aura3d/rendering";
/** @deprecated Deleted from "." in 4.0.0. */
export { resolveA3DAppQualityPreset } from "@aura3d/apps";
/** @deprecated Deleted from "." in 4.0.0. */
export { summarizeExternalParityGLTFCorpus } from "@aura3d/assets/browser";

// ── Lane & contract union growth (CONTRACTS.md §3.8 / T5.1) ──
// The lane barrels (`src/lanes/prdNN.ts`) are intended "." members — engine's
// in-repo index re-exports them via `export * from "./lanes/index.js"`, and
// these names reach "." through that path. They are mirrored here so the
// published barrel stays the union of the in-repo index (T1.4). Names are
// grouped by declaring module; re-exports stay plain (contract/lane surface,
// not deprecated).

// C-16 asset decoders (lane 05) — registry builders + typed-actor options.
export { WEBGPU_COMPRESSED_CAPS, createAppAssetDecoders, prepareModelDecoders, sniffGLBRequiredDecoders, typedGLBActorDecoderOptions } from "./AssetDecoders.js";
export type { AppAssetDecoders, TypedGLBActorDecoderOptions } from "./AssetDecoders.js";
export type { FrameLoopTick, FrameLoopTickCallback } from "./FrameLoop.js";
export { AuraClipMapMissingError, characterAnimation, setCharacterAnimationAppTimeScale, validateClipMap } from "./GameCharacterAnimation.js";
export type { AnimationHandleLike, AuraCharacterAnimationBinding, AuraCharacterAnimationSnapshot, AuraCharacterAnimationSpec, AuraCharacterAnimationWeight, AuraCharacterControllerLike, AuraCharacterControllerSnapshot, AuraClipMapEntry, AuraClipMapMissingEntry, AuraClipMapValidationOptions, AuraClipMapValidationReport, AuraLocomotionClipEntry } from "./GameCharacterAnimation.js";
// Lane 08 camera surface — controller, probe, spline/spring math, collision,
// framing, layers, quat helpers, and the rig factories.
export { createCameraController, presentedViewProjection } from "./camera/CameraController.js";
export type { AuraCameraControllerDeps, AuraCameraControllerImpl } from "./camera/CameraController.js";
export { createOccluderFade, createOccluderFadeContributor } from "./camera/OccluderFade.js";
export type { AuraOccluderFade, AuraOccluderFadeOptions } from "./camera/OccluderFade.js";
export { CAMERA_PROBE_TIER_BUDGETS, cameraProbeBudgetForTier, createCameraProbe } from "./camera/Probe.js";
export type { AuraBudgetedCameraProbe, AuraCameraProbeBudget, AuraCameraProbeDeps, AuraCameraProbeFrameStats, AuraCameraProbeTier, ProbeBoundsEntry, ProbePhysicsEntry } from "./camera/Probe.js";
export { AuraCameraSpline, catmullRom, catmullRomDerivative, createSpline } from "./camera/Spline.js";
export type { AuraSplineOptions } from "./camera/Spline.js";
export { smoothingToHalflife, springDamp, springDampVec3, springStep, springStepVec3 } from "./camera/Spring.js";
export type { AuraSpringState, AuraSpringVec3State } from "./camera/Spring.js";
export { createCollisionDamper } from "./camera/collision.js";
export type { CollisionDamper, CollisionDamperOptions } from "./camera/collision.js";
export { ease } from "./camera/ease.js";
export { createAuraCameraController } from "./camera/extension.js";
export { distanceForFraction, distanceForFractionInContext, effectiveAxisFov, fractionForDistance, fractionForDistanceInContext } from "./camera/framing.js";
export type { AuraFramingContext } from "./camera/framing.js";
export { LETTERBOX_BLACKBOARD_KEY, createCinematicBarsLayer, createLetterboxContributor } from "./camera/layers/cinematicBars.js";
export type { AuraCinematicBarsLayer, AuraCinematicBarsOptions } from "./camera/layers/cinematicBars.js";
export { createFovKickLayer } from "./camera/layers/fovKick.js";
export { createLookAtLayer } from "./camera/layers/lookAt.js";
export type { AuraLookAtLayer } from "./camera/layers/lookAt.js";
export { createPunchLayer } from "./camera/layers/punch.js";
export { createTraumaLayer } from "./camera/layers/trauma.js";
export { createLeanCameraRigAdapter, createLeanGameFeelAdapter } from "./camera/leanAdapters.js";
export type { LeanCameraRigAdapter, LeanCameraRigAdapterOptions, LeanGameFeelAdapter, LeanGameFeelAdapterOptions } from "./camera/leanAdapters.js";
export {
  quatFromAxisAngle as cameraQuatFromAxisAngle,
  quatFromEulerXYZ as cameraQuatFromEulerXYZ,
  quatMultiply as cameraQuatMultiply,
  quatNormalize as cameraQuatNormalize,
  quatRotateVec3 as cameraQuatRotateVec3,
  quatSlerp as cameraQuatSlerp,
  quatToEulerXYZ as cameraQuatToEulerXYZ
} from "./camera/quat.js";
export { createAltitudeRig } from "./camera/rigs/altitude.js";
export type { AltitudeRigOptions } from "./camera/rigs/altitude.js";
export { createChaseRig } from "./camera/rigs/chase.js";
export type { ChaseRigOptions } from "./camera/rigs/chase.js";
export { createFightingRig } from "./camera/rigs/fighting.js";
export type { FightingRigOptions } from "./camera/rigs/fighting.js";
export { createFlightRig } from "./camera/rigs/flight.js";
export type { FlightRigOptions } from "./camera/rigs/flight.js";
export { createFollow2dRig } from "./camera/rigs/follow2d.js";
export type { Follow2dRigOptions } from "./camera/rigs/follow2d.js";
export { LegacySpecRig, createFromSpecRig } from "./camera/rigs/fromSpec.js";
export type { LegacyCameraSpec, LegacySpecRigDeps, LegacyTargetSource } from "./camera/rigs/fromSpec.js";
export { bindOrbitPointer, createOrbitRig } from "./camera/rigs/orbit.js";
export type { AuraOrbitRig, OrbitRigOptions } from "./camera/rigs/orbit.js";
export { createRailRig } from "./camera/rigs/rail.js";
export { createShoulderRig } from "./camera/rigs/shoulder.js";
export type { ShoulderRigOptions } from "./camera/rigs/shoulder.js";
export { DEFAULT_POSE as CAMERA_DEFAULT_POSE, staticRig } from "./camera/rigs/static.js";
export { createTopDownRig } from "./camera/rigs/topDown.js";
export type { TopDownRigOptions } from "./camera/rigs/topDown.js";
// Lane 02/03/04/07 compiler plumbing — lighting/shadow resolvers, env probes,
// post surfaces, diagnostic-only field tables, sky node handler.
export { PRD03_DIAGNOSTIC_ONLY_FIELDS, PRD03_OPTION_COVERAGE } from "./compiler/diagnosticOnly.prd03.js";
export { DIAGNOSTIC_ONLY_PRD04_FIELDS, registerPrd04OptionCoverage } from "./compiler/diagnosticOnly.prd04.js";
export { PRD07_DIAGNOSTIC_ONLY_FIELDS } from "./compiler/diagnosticOnly.prd07.js";
export { bindPrd02EnvironmentProbe, explicitEnvironmentResolution, prd02AmbientTerm, registerPrd02EnvironmentSources } from "./compiler/environment.js";
export type { Prd02EnvironmentBindOptions, Prd02EnvironmentBinding } from "./compiler/environment.js";
export { collectPrd02Lights, descriptorToAuraLightData, physicalLightDescriptor, prd02LightingOn, readLightingKillSwitches, readLightingModelFromUrl, resolveLightingModel, resolveLightingTier, selectShadowedLights } from "./compiler/lights.js";
export type { HemisphereIrradiance, PhysicalLightDescriptor, Prd02CollectedLights, Prd02LightingKillSwitches, ShadowedLightSelection } from "./compiler/lights.js";
export { createProductionRuntimePostprocess } from "./compiler/postprocess.js";
export { createPrd02ShadowOptions, prd02ResolveTier, resolveShadowSystemConfig, sceneShadowRadius } from "./compiler/shadows.js";
export type { Prd02ShadowOptions, ShadowSystemConfig } from "./compiler/shadows.js";
export { skyNodeHandler } from "./compiler/sky.js";
// Lane 08 feel bus — noise, screen overlay, combat feel, presets, sound binding.
export { createFeelBus } from "./feel/FeelBus.js";
export type { AuraFeelBusDeps, AuraFeelBusImpl, FeelChannel } from "./feel/FeelBus.js";
export { createNoise1D, perlin1 } from "./feel/Noise.js";
export { createScreenOverlay } from "./feel/ScreenOverlay.js";
export type { AuraScreenOverlay } from "./feel/ScreenOverlay.js";
export { bindFeelSound } from "./feel/bindFeelSound.js";
export type { FeelSoundListener } from "./feel/bindFeelSound.js";
export { combatFeelEvent, emitCombatFeel } from "./feel/combatFeel.js";
export type { CombatFeelEvent, CombatFeelMove } from "./feel/combatFeel.js";
export { SCREEN_FEEL_KEY, createAuraFeelBus, screenFeelTier } from "./feel/extension.js";
export type { AuraFeelExtensionOptions } from "./feel/extension.js";
export { FEEL_PRESETS, FEEL_PRESET_EVENTS, feelPresets } from "./feel/presets.js";
export type { AuraFeelPresetName } from "./feel/presets.js";
// Lane 07/13 look surface — fake-effect detection, presets, lint wiring,
// structural QA, look node handler + expansion resolvers.
export { FAKE_EFFECT_NAMES, FAKE_EFFECT_PATTERN, FAKE_EFFECT_STEMS, isFakeEffectName } from "./looks/fakeEffectNames.js";
export { collectGeneratedCodeWarnings } from "./looks/generatedCodeWarnings.js";
export type { GeneratedCodeWarningsContext } from "./looks/generatedCodeWarnings.js";
export { lookDiagnosticsSection } from "./looks/lookDiagnostics.js";
export { authoredLookIds, installLookLintDefaults } from "./looks/lookLint.js";
export { lookNodeHandler } from "./looks/lookNodeHandler.js";
export { lookPresetIds, lookPresets } from "./looks/lookPresets.js";
export type { AuraLookPreset, AuraLookV0Expansion } from "./looks/lookPresets.js";
export { clampLookOverrides, resolveLookExpansion, stubLookContractRequirements } from "./looks/looks.js";
export type { AuraLookBuildOptions, LooksApi, ResolvedLookExpansion } from "./looks/looks.js";
export { structuralQA } from "./looks/structuralQA.js";
export type { AuraDeprecatedVisualQA, AuraStructuralQAResult } from "./looks/structuralQA.js";
// Node builders — env v2 presets, irradiance/reflection probes, prompt-plan
// mapping tables, kit lighting.
export { prd02EnvironmentBuilders } from "./nodes/environments.js";
export type { AuraEnvironmentNodeV2, AuraEnvironmentPresetName } from "./nodes/environments.js";
export { probes } from "./nodes/probes.js";
export type { AuraIrradianceVolumeOptions, AuraProbeNode, AuraReflectionProbeOptions } from "./nodes/probes.js";
export { PROMPT_PLAN_CAMERA_TO_RIG, PROMPT_PLAN_EFFECT_MAP, PROMPT_PLAN_ENVIRONMENT_KEYWORDS, PROMPT_PLAN_LIGHTING_TO_LOOK, PROMPT_PLAN_SCENE_DEFAULT_LOOK, PROMPT_PLAN_STYLE_TO_GRADE } from "./nodes/prompt/promptPlanMappings.js";
export type { PromptPlanCameraMapping, PromptPlanEffectKind, PromptPlanEffectMapping, PromptPlanEnvironmentKeywordRow, PromptPlanLightingMapping, PromptPlanStyleGrade, PromptPlanStyleRow } from "./nodes/prompt/promptPlanMappings.js";
export { prd02KitLighting } from "./nodes/sceneKits.js";
// Lane 03 post bridge — field tables, authored-context recording, submission
// ledger, root post pipeline.
export { POST_EFFECT_COMMON_FIELDS, POST_EFFECT_DEPRECATED_FIELDS, POST_EFFECT_FIELDS, Prd03PostSurface, collectExposureSection, collectPostSection, createPrd03PostSurface, createRootPostPipeline, latestAuthoredPostContext, latestSubmittedPostprocess, mapBloomOptionsV2, recordAuthoredPostContext, recordSubmittedPostprocess, resetAuthoredPostContext, resetSubmittedPostprocess, validatePostEffectNode } from "./postBridge.js";
export type { PostFieldDiagnostic } from "./postBridge.js";
// Lane 08 time surface — fixed-step driver, interpolation store, time controller.
export { FixedStepDriver, createFixedStepDriver } from "./time/FixedStepDriver.js";
export type { AuraRenderCallback, AuraRenderFrame, FixedStepDriverApp, FixedStepDriverOptions } from "./time/FixedStepDriver.js";
export { InterpolationStore, createInterpolationStore } from "./time/Interpolation.js";
export type { AuraInterpolableHandle, AuraInterpolationTransform } from "./time/Interpolation.js";
export { TimeController, createTimeController } from "./time/TimeController.js";
export type { TimeControllerOptions, TimeControllerScopeEntry } from "./time/TimeController.js";
// Lane 08 vehicle — arcade bicycle model.
export { BicycleModel, createBicycleModel } from "./vehicle/BicycleModel.js";
export type { BicycleModelInput, BicycleModelOptions, BicycleModelState, BicycleTyreParams } from "./vehicle/BicycleModel.js";
// Lane 07/12 vfx — atlas manifest, bridge, atmosphere/effects extensions,
// diagnostics sections, look-lint rules.
export { AURA_VFX_BUILTIN_SEQUENCES, validateVfxAtlasManifest, vfxAtlasPageForTier } from "./vfx/atlas.js";
export type { AuraVfxAtlasManifest, AuraVfxAtlasPage, AuraVfxAtlasSequenceEntry, AuraVfxBuiltinSequence } from "./vfx/atlas.js";
export { atmosphere, createAtmosphereExtension } from "./vfx/atmosphere-api.js";
export { attachVfxBridge } from "./vfx/bridge.js";
export type { VfxBridge } from "./vfx/bridge.js";
export { collectAtmosphereSection, collectEffectsSection } from "./vfx/diagnostics.js";
export { createAppEffects, createEffectsExtension, prd07SystemFor, registerPrd07System } from "./vfx/effects-api.js";
export { registerPrd07LookLintRules } from "./vfx/lookLint.js";
// Contract-surface names that grew in contracts/ after T1.4.
export type { AuraSetFogOptions, AuraSetFogSpec, AuraSkyBand, AuraSkyCloudsOptions, AuraSkyStarsLegacySpec, AuraSkyStarsOptions } from "../contracts/atmosphere.js";
export type { AuraBurstOptions, AuraColorRamp, AuraCurve, AuraLegacyParticleFields, AuraParticleEmitterOptions, AuraRange, AuraTrailHandle, AuraTrailOptions, AuraVfxGenreVariant, AuraVfxShading, AuraVfxSpriteSource } from "../contracts/effects.js";
// GU47 (4.7.0): runtime environment swap options (E-B) and the look HDRI catalogue id (E-A).
export type { AuraEnvironmentSwapOptions } from "../contracts/lighting.js";
export type { AuraHdriId } from "../contracts/looks.js";
export { qrFlagsWithAnimationMixer } from "../contracts/flags.js";
export type { GameJuice } from "../contracts/game.js";
export { lookLintRegisteredCodes, registerLookLintDefaults, setLookLintDefaultsProvider } from "../contracts/looks.js";
export type { AuraPostPassOrder } from "../contracts/post.js";
// Lane 04/05/06 production-runtime — material overrides, QR flags,
// shader-warmup + decoder hooks.
export { applyMaterialOverrides, lowerModelMaterialOverrides, snapshotMaterials } from "../production-runtime/ModelMaterialOverrides.js";
export type { AuthoredMaterialSnapshot, TypedGLBActorMaterialOverride } from "../production-runtime/ModelMaterialOverrides.js";
export { setTypedGLBActorQrTransmissionMode, typedGLBActorQrTransmissionMode } from "../production-runtime/TypedGLBActor.js";
export { setPrd06ShaderWarmupCompiler } from "../production-runtime/actor/TypedGLBActorAnimation.js";
export type { Prd06ShaderWarmupCompiler } from "../production-runtime/actor/TypedGLBActorAnimation.js";
export { registerPrd04TypedGLBActorMaterials, registeredTypedGLBActors, typedGLBActorForNode } from "../production-runtime/actor/TypedGLBActorMaterials.js";
export { setTypedGLBActorQrFlags } from "../production-runtime/actor/extensions.js";
export { collectPrd04MaterialDiagnostics, registerPrd04MaterialDiagnostics } from "../production-runtime/actor/materialDiagnostics.js";
// Lane 09 game surface — audio listener pose type.
export type { GameAudioListenerPose } from "../game/GameAudio.js";
// Names declared in the lane barrels themselves (CONTRACTS.md §3.8 leaves).
export { readAura3dTonemapQuery } from "../lanes/prd01/outputSurface.js";
export { Prd02LightingRuntime, RUNTIME_ENVIRONMENT_NODE_ID } from "../lanes/prd02.js";
export type { Prd02LightingApp } from "../lanes/prd02.js";
export { PRD05_DEBUG_VIEW_CHANNELS, applyPrd05DebugViewToMaterialLibrary, attachAppAssetDecoders, getAppAssetDecoders, setPrd05DebugView } from "../lanes/prd05.js";
export type { Prd05DebugViewName } from "../lanes/prd05.js";
export { installPrd06ShaderWarmup, prd06RenderingLaneReady } from "../lanes/prd06.js";
export type { AuraBatchPlanReport, AuraFrameTimingReport, AuraQualityDiagnosticsReport } from "../lanes/prd11.js";
export { appliedLookSection, frameTimingSection } from "../lanes/prd12.js";
export { providePrd13Contracts } from "../lanes/prd13.js";
// C-16 decoder error — re-exported through lanes/prd05 from @aura3d/assets.
export { AssetDecoderUnavailable } from "@aura3d/assets/browser";
