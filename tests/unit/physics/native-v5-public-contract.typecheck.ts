// Source declaration consumer checked by tsconfig.check.json. An installed,
// backend-absent consumer is a separate package/acceptance check.
export type {
  CombatAi, CombatAiAggression, CombatFrameAdvantage, CombatFrameData,
  FrameLoopCallback, FrameLoopFrame, FrameLoopOptions, FrameLoopSnapshot, FrameLoopSource,
  AuraClipGroupSnapshot, AuraClipOptions, AuraClipPlane, AuraClipScope, AuraGlobalClipOptions,
  SemanticRegion, VehicleChassis, VehiclePose, DriverRoute, VehicleDriverAi,
  AuraVfxBuiltinSequence, AuraWorldBuilderFlagSource,
  AuraXRDeviceBridge, AuraXREnterResult, AuraXREventMap, AuraXREventName, AuraXRFrameEvent,
  AuraXRMode, AuraXRRuntime, AuraXRSessionInit, AuraXRSessionProvenance,
  AuraXRButtonHandle, AuraXRButtonOptions, AuraXRSceneHelperOptions, AuraXRSceneHelpers, AuraXRVisual,
  ArtDirectionViolation, GameAcceptance, GameBudgets, GameEntryV2, GameGenre, RebuildTier,
  RouteHealthQualityGate, AuraAssetBudget, AuraAssetDecodersOption, AuraAssetLodLevel,
  AuraAssetLodOption, AuraAssetRequiredDecoder, AuraAssetVariants, AuraAssetsOption,
  AuraModelColliderOption, AuraModelLodOption, QrFlagInput, GameAudio, GameAudioContextLike,
  GameAudioOptions, GlbResourceCacheOptions, GlbResourceCacheSnapshot, QaCountedRng,
  FixedStepLoop, FixedStepLoopOptions, InstalledQaHooks, QaHookApp, QaHooks, QaHooksOptions,
  QaPixels, QaStandardHooks, QaParamSchema, QaParamSpec, QaParamValues,
  MeshSurfaceQuery, SurfaceSample, FontAsset, FontAssetMetadata, FontLoadOptions,
  FontLoaderPlatform, LoadedFont, TextDirection, AuraBodyHandle, AuraPhysicsRuntime
} from "@aura3d/engine/v5";

// Contracts reached through existing declaration leaves or neutral effect options.
export type {
  AuraBatchedGeometryInput, AuraBatchedMeshMode, AuraColorGradeOptions, AuraDepthOfFieldOptions,
  AuraDepthOfFieldTiltShift, AuraDiagnosticsOverlay, AuraGradeRgb, AuraGrassBounds, AuraGrassInput, AuraGrassOptions,
  AuraHeightfieldSampler, AuraInstancedBufferView, AuraInstancedGeometryInput, AuraInstancedMeshBoundingSphere,
  AuraInstancedMeshHandle, AuraLutAssetRef, AuraOutlineOptions, AuraOutputDiagnostics, AuraOutputOptions,
  AuraOutputOverlay, AuraOutputSurface, AuraRuntimeNodeHandleParts, AuraScatterAsset, AuraScatterLayer,
  AuraScatterOptions, AuraScatterResult, AuraScreenSpaceReflectionsOptions, AuraTerrainHandle, AuraTerrainOptions,
  AuraToneMappingOperator, AuraVolumetricFogOptions, AuraWaterHandle, AuraWaterOptions, AuraWeatherEffectOptions,
  AuraWindOptions, AuraWorldShape, CameraPresetId, GameFallingBlockAction, GameFallingBlocksEvent,
  GameFallingBlocksSnapshot, GameKitRect, GamePlatformerEvent, GamePlatformerSnapshot, GameRacingKit,
  GameRacingSnapshot, RacketVec3, RuntimeNodeHandleLike, TslCompileResult, TslEvalContext, TslInput,
  TslMaterialNodeOptions, TslType, TypedGLBActor, TypedGLBActorCrossFadeOptions
} from "@aura3d/engine/v5";

import type {
  AuraAssetBudget, AuraBodyHandle, AuraCameraPose, AuraClipPlane, AuraColor, AuraPhysicsRuntime, AuraXRSessionInit,
  CombatFrameData, CreateGameOptions, FontLoadOptions, FrameLoopOptions, GameAudioOptions, MeshSurfaceQuery, VehicleSurface
} from "@aura3d/engine/v5";
import type {
  AuraAssetBudget as LegacyAssetBudget, AuraBodyHandle as LegacyBodyHandle, AuraClipPlane as LegacyClipPlane,
  AuraCameraPose as LegacyCameraPose, AuraColor as LegacyColor, AuraPhysicsRuntime as LegacyPhysicsRuntime,
  AuraXRSessionInit as LegacyXRSessionInit, CombatFrameData as LegacyCombatFrameData,
  CreateGameOptions as LegacyCreateGameOptions, FontLoadOptions as LegacyFontLoadOptions, FrameLoopOptions as LegacyFrameLoopOptions,
  GameAudioOptions as LegacyGameAudioOptions, MeshSurfaceQuery as LegacyMeshSurfaceQuery,
  VehicleSurface as LegacyVehicleSurface
} from "@aura3d/engine";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

export type V5LegacyDeclarationContracts = [
  Assert<Equal<AuraAssetBudget, LegacyAssetBudget>>,
  Assert<Equal<AuraBodyHandle, LegacyBodyHandle>>,
  Assert<Equal<AuraCameraPose, LegacyCameraPose>>,
  Assert<Equal<AuraClipPlane, LegacyClipPlane>>,
  Assert<Equal<AuraColor, LegacyColor>>,
  Assert<Equal<AuraPhysicsRuntime, LegacyPhysicsRuntime>>,
  Assert<Equal<AuraXRSessionInit, LegacyXRSessionInit>>,
  Assert<Equal<CombatFrameData, LegacyCombatFrameData>>,
  Assert<Equal<CreateGameOptions<"hit", "damage">, LegacyCreateGameOptions<"hit", "damage">>>,
  Assert<Equal<FontLoadOptions, LegacyFontLoadOptions>>,
  Assert<Equal<FrameLoopOptions, LegacyFrameLoopOptions>>,
  Assert<Equal<GameAudioOptions<"hit">, LegacyGameAudioOptions<"hit">>>,
  Assert<Equal<MeshSurfaceQuery, LegacyMeshSurfaceQuery>>,
  Assert<Equal<VehicleSurface, LegacyVehicleSurface>>,
  Assert<Equal<InstanceType<typeof import("@aura3d/engine/v5").AnimationClip>, InstanceType<typeof import("@aura3d/engine").AnimationClip>>>
];

// Compile every added type through the versioned entry.
export type {
  A3DEnvironment, AnyNodeHandler, AppExtension, ArcadeKartGameKit, ArcadeKartGameKitOptions, ArcadeKartPlayerState,
  ArcadeKartRivalSpec, ArcadeKartStepControls, ArcadeKartStepResult, AuraActorAnimationApi, AuraActorAnimationStateSnapshot, AuraActorPoseApi,
  AuraAnimationAssetLike, AuraAnimationDiagnostics, AuraAntiAliasMode, AuraAppAtmosphere, AuraAppEffects, AuraAppExtensionMap,
  AuraAutoExposureOptions, AuraBatchedMeshHandle, AuraBatchedMeshOptions, AuraBatchedNode, AuraBiomeId, AuraBiomeRig,
  AuraBoneAttachSpec, AuraBoneMaskSpec, AuraBoneSocket, AuraBurstOptions, AuraCameraController, AuraCameraLayer,
  AuraCameraOption, AuraCameraPose, AuraCameraRailOptions, AuraCameraRig, AuraCameraRigContext, AuraCameraRigFactories,
  AuraCameraSequence, AuraCameraSequencePlayback, AuraCameraShot, AuraCameraSubject, AuraCinematicBarsLayer, AuraCinematicBarsOptions,
  AuraColor, AuraCompiledFeature, AuraComputeBuffer, AuraComputeBufferSpec, AuraComputeDeviceSource, AuraComputeDispatchInput,
  AuraComputeDispatchResult, AuraComputePipeline, AuraComputePipelineSpec, AuraComputeSurface, AuraCreateAppAnimationOptions, AuraCrowd,
  AuraCrowdAsset, AuraCrowdBakeActor, AuraCrowdBakeOptions, AuraCrowdBakePoseFrame, AuraCrowdBakePrimitive, AuraCrowdDrawPlan,
  AuraCrowdLoadOptions, AuraCrowdNodeHandle, AuraCrowdOptions, AuraCrowdPoseSet, AuraCrowdSampleOptions, AuraCrowdSpectator,
  AuraCrowdTarget, AuraCustomGeometrySpec, AuraCustomMaterialSpec, AuraCustomPostPass, AuraDecalOptions, AuraDegradation,
  AuraDegradationCode, AuraDiagnostics, AuraDiagnosticsSectionKey, AuraDirectionalShadowOptions, AuraDynamicHelper, AuraDynamicHelperOptions,
  AuraEaseName, AuraEffectInstanceHandle, AuraEffectNode, AuraEffectsDiagnostics, AuraEnvironmentSource, AuraEnvironmentSourceKind,
  AuraEnvironmentSourceResolution, AuraEnvironmentSwapOptions, AuraEulerOrder, AuraFatLineOptions, AuraFeelBus, AuraFeelEventSpec,
  AuraFovKickLayer, AuraHdriId, AuraHeightFogSpec, AuraHeightQuery, AuraHelperBaseOptions, AuraInstanceColorTarget,
  AuraInstanceLightsOptions, AuraInstanceWind, AuraInstanceWindOption, AuraInstancedModelOptions, AuraInstancedPrimitiveOptions, AuraInstancesModelBuilder,
  AuraLightNode, AuraLightPatch, AuraLightTransitionOptions, AuraLightingDiagnostics, AuraLightingModel, AuraLightingOptions,
  AuraLightingRuntime, AuraLightsApiAdditions, AuraLineNode, AuraLineOptions, AuraLinePositionsInput, AuraLocalShadowOptions,
  AuraLookDiagnostics, AuraLookId, AuraLookLintCode, AuraLookLintContext, AuraLookLintFinding, AuraLookLintRule,
  AuraLookNode, AuraLookOverrides, AuraLoopOptions, AuraMaterialDiagnostics, AuraMaterialRimSpec, AuraMaterialTextureSlot,
  AuraMergeStaticOptions, AuraModelMaterialHandle, AuraModelMaterialOverride, AuraModelOptions, AuraNamedAnimationClipDefinition, AuraNodeHandleExtensionMap,
  AuraNodeKindMap, AuraPerformanceQuality, AuraPlayLayerOptions, AuraPointsNode, AuraPointsOptions, AuraPostDiagnostics,
  AuraPostPreset, AuraPostPresetId, AuraPostSurface, AuraPunchLayer, AuraQuat, AuraRendererMaterialOptions,
  AuraResolvedClipInfo, AuraResolvedMaterialInfo, AuraRootLodLevelSpec, AuraRootMotionSpec, AuraRootVec3, AuraRuntimeNodeRegistryV2,
  AuraScatterAlongPathOptions, AuraScatterArea, AuraScatterExclusion, AuraScatterInAreaOptions, AuraScatterPoint, AuraScatterRange,
  AuraScatterSide, AuraScreenFeelUniforms, AuraSetFogOptions, AuraSetFogSpec, AuraShadowOptions, AuraSkyCloudsOptions,
  AuraSkyGradientOptions, AuraSkyNode, AuraSkyNodeOptions, AuraSkyPreethamOptions, AuraSkySpec, AuraSkyStarsOptions,
  AuraSkySunSpec, AuraSpriteNode, AuraSpriteOptions, AuraStaticPart, AuraStudioLookId, AuraTextureCanvasOptions,
  AuraTextureColorSpace, AuraTextureCompressedOptions, AuraTextureCubeOptions, AuraTextureDataArrayOptions, AuraTextureDataOptions, AuraTextureDepthOptions,
  AuraTextureLoadOptions, AuraTextureMagFilter, AuraTextureMinFilter, AuraTextureRef, AuraTextureVideoOptions, AuraTextureWrapMode,
  AuraTimeController, AuraToonMaterialOptions, AuraTrailHandle, AuraTrailOptions, AuraTraumaLayer, AuraVfxEffectSpec,
  AuraVfxGenreVariant, AuraVfxKind, AuraVfxSpriteSource, AuraVolumetricFogSpec, AuraWindSpec, AuraWorldQualityTier,
  AuraWorldQueries, AuraWorldTextOptions, AuraWorldTransform, AuthoredPostContext, AuthoredPostSummary, CameraPath,
  CaptureContext, CarSoccerBallState, CarSoccerBallStepEvents, CarSoccerControls, CarSoccerGameKit, CarSoccerGameKitOptions,
  CarSoccerPitchOptions, CarSoccerVehicleActor, CharacterAssemblyPlan, CharacterAssemblyValidationReport, CloneSkinnedModelInput, CloneSkinnedOptions,
  ClonedSkinnedModel, CompiledActor, CompiledScene, CompilerImpl, CreateGameOptions, DiagnosticsSection,
  FightingGameSnapshot, FocusResult, Game, GameArcadeVehicle, GameArcadeVehicleInput, GameArcadeVehicleState,
  GameBeacon, GameCombatEvent, GameCombatMove, GameCombatWorld, GameCombatWorldSnapshot, GameEffectsController,
  GameFxKind, GameFxLayer, GameInputController, GameInputReplayEvent, GameInputReplayPlan, GameScenario,
  GameSession, GameSessionState, GameShell, GameShellLayout, GrandPrixRoadwayOptions, GroundRaycaster,
  Hud, HudMountOptions, HudWidgetSpec, NodeHandleExtension, NodeHandler, OptionCoverageRow,
  PauseReason, RacketBallState, RacketBallStepEvents, RacketSportsGameKit, RacketSurfacePhysicsOptions, RenderSourceContributions,
  RootRenderSourceBridge, RuntimeCompiledSceneInternals, SceneCompileContext, SceneQueryHit, SceneQueryTarget, SceneRay,
  SceneRaycastCamera, SceneRaycastInput, SceneRaycastOptions, SubmittedPostprocessRecord, TouchControls, TouchPreset,
  TransitionSpec, TslUniformKind, TslUniformOptions
} from "@aura3d/engine/v5";
