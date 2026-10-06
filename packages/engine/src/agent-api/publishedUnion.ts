// Published-union surface (PRD-15 T1.4): names exported by packages/engine/src/index.ts
// that were missing from the published "." entry (dist/engine/agent-api/index.js).
// tests/qr/prd15/published-union.test.ts asserts the two barrels export identical sets.
// Contract-surface names re-export plain (T5.1 keeps them on "."); the remaining names
// carry @deprecated JSDoc naming their §6.6 destination subpath or "deleted in 4.0.0".

// ── Contract surface (intended "." members per PRD-15 T5.1; not deprecated) ──
export { StubActorAnimationApi } from "../contracts/animation.js";
export type { AuraActorAnimationApi, AuraActorAnimationStateSnapshot, AuraAnimationDiagnostics, AuraBoneMaskSpec, AuraBoneSocket, AuraCreateAppAnimationOptions, AuraResolvedClipInfo, AuraRootMotionSpec } from "../contracts/animation.js";
export { appExtensionsAll, registerAppExtension } from "../contracts/app.js";
export type { AppExtension, AuraAppExtensionMap } from "../contracts/app.js";
export { auditArtDirection } from "../contracts/art.js";
export type { ArtDirectionViolation, GameAcceptance, GameBudgets, GameEntryV2, GameGenre, RebuildTier, RouteHealthQualityGate } from "../contracts/art.js";
export type { AuraAssetBudget, AuraAssetDecodersOption, AuraAssetLodLevel, AuraAssetLodOption, AuraAssetRequiredDecoder, AuraAssetVariants, AuraAssetsOption, AuraModelColliderOption, AuraModelLodOption } from "../contracts/assets.js";
export { StubAppAtmosphere } from "../contracts/atmosphere.js";
export type { AuraAppAtmosphere, AuraHeightFogSpec, AuraSkyNode, AuraSkySpec, AuraSkySunSpec, AuraVolumetricFogSpec } from "../contracts/atmosphere.js";
export { stubCameraRigFactories } from "../contracts/camera.js";
export type { AuraCameraController, AuraCameraEvidence, AuraCameraLayer, AuraCameraOption, AuraCameraPose, AuraCameraProbe, AuraCameraRailOptions, AuraCameraRig, AuraCameraRigContext, AuraCameraRigFactories, AuraCameraSequence, AuraCameraSequencePlayback, AuraCameraShot, AuraCameraSubject, AuraEaseName, AuraFovKickLayer, AuraPunchLayer, AuraTraumaLayer } from "../contracts/camera.js";
export { DIAGNOSTIC_ONLY_FIELDS, compileScene, nodeHandlerFor, nodeHandlersAll, optionCoverageRows, registerNodeHandler, registerOptionCoverage, setCompilerImpl, updateCompiledScene } from "../contracts/compiler.js";
export type { AuraCompiledFeature, AuraDegradation, AuraDegradationCode, AuraNodeKindMap, CompiledActor, CompiledScene, NodeHandler, OptionCoverageRow, RenderSourceContributions, SceneCompileContext } from "../contracts/compiler.js";
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
