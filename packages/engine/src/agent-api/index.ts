import * as _mt from "./nodes/materialTools.js";
export function proceduralTexture(texture: Parameters<typeof _mt.proceduralTexture>[0], options?: Parameters<typeof _mt.proceduralTexture>[1]): ReturnType<typeof _mt.proceduralTexture> { return _mt.proceduralTexture(texture, options); }
export function createMaterialCapabilityDiagnostics(input?: Parameters<typeof _mt.createMaterialCapabilityDiagnostics>[0]): ReturnType<typeof _mt.createMaterialCapabilityDiagnostics> { return _mt.createMaterialCapabilityDiagnostics(input); }
export function createMaterialInspector(...args: Parameters<typeof _mt.createMaterialInspector>): ReturnType<typeof _mt.createMaterialInspector> { return _mt.createMaterialInspector(...args); }
export function minimumMaterialFeatureDistance(specs: Parameters<typeof _mt.minimumMaterialFeatureDistance>[0]): ReturnType<typeof _mt.minimumMaterialFeatureDistance> { return _mt.minimumMaterialFeatureDistance(specs); }
export { PHYSICAL_SPEC_KEYS } from "./nodes/materialTools.js";

import * as _createAuraGameRuntime from "./nodes/game/runtime.js";
export function createAuraGameRuntime(...args: Parameters<typeof _createAuraGameRuntime.createAuraGameRuntime>): ReturnType<typeof _createAuraGameRuntime.createAuraGameRuntime> { return _createAuraGameRuntime.createAuraGameRuntime(...args); }

import * as _gamePresentation from "./nodes/prefabs/gamePresentation.js";
export function createGamePlatformerPresentationSurfaceNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerPresentationSurfaceNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerPresentationSurfaceNodes> { return _gamePresentation.createGamePlatformerPresentationSurfaceNodes(...args); }
export function createGamePublicPlatformerPresentationNodes(...args: Parameters<typeof _gamePresentation.createGamePublicPlatformerPresentationNodes>): ReturnType<typeof _gamePresentation.createGamePublicPlatformerPresentationNodes> { return _gamePresentation.createGamePublicPlatformerPresentationNodes(...args); }
export function createGamePlatformerGroundMeshNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerGroundMeshNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerGroundMeshNodes> { return _gamePresentation.createGamePlatformerGroundMeshNodes(...args); }
export function createGamePlatformerPlatformMeshNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerPlatformMeshNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerPlatformMeshNodes> { return _gamePresentation.createGamePlatformerPlatformMeshNodes(...args); }
export function createGamePlatformerHazardNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerHazardNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerHazardNodes> { return _gamePresentation.createGamePlatformerHazardNodes(...args); }
export function createGamePlatformerCheckpointNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerCheckpointNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerCheckpointNodes> { return _gamePresentation.createGamePlatformerCheckpointNodes(...args); }
export function createGamePlatformerFinishNodes(...args: Parameters<typeof _gamePresentation.createGamePlatformerFinishNodes>): ReturnType<typeof _gamePresentation.createGamePlatformerFinishNodes> { return _gamePresentation.createGamePlatformerFinishNodes(...args); }
export function createGamePlatformerCameraRig(...args: Parameters<typeof _gamePresentation.createGamePlatformerCameraRig>): ReturnType<typeof _gamePresentation.createGamePlatformerCameraRig> { return _gamePresentation.createGamePlatformerCameraRig(...args); }
export function certifyPublicPlatformerPresentation(...args: Parameters<typeof _gamePresentation.certifyPublicPlatformerPresentation>): ReturnType<typeof _gamePresentation.certifyPublicPlatformerPresentation> { return _gamePresentation.certifyPublicPlatformerPresentation(...args); }
export function createGameRacingRoadMeshNodes(...args: Parameters<typeof _gamePresentation.createGameRacingRoadMeshNodes>): ReturnType<typeof _gamePresentation.createGameRacingRoadMeshNodes> { return _gamePresentation.createGameRacingRoadMeshNodes(...args); }
export function createGameRacingCheckpointGateNodes(...args: Parameters<typeof _gamePresentation.createGameRacingCheckpointGateNodes>): ReturnType<typeof _gamePresentation.createGameRacingCheckpointGateNodes> { return _gamePresentation.createGameRacingCheckpointGateNodes(...args); }
export function createGameRacingStartFinishNodes(...args: Parameters<typeof _gamePresentation.createGameRacingStartFinishNodes>): ReturnType<typeof _gamePresentation.createGameRacingStartFinishNodes> { return _gamePresentation.createGameRacingStartFinishNodes(...args); }
export function createGameRacingPresentationTrackNodes(...args: Parameters<typeof _gamePresentation.createGameRacingPresentationTrackNodes>): ReturnType<typeof _gamePresentation.createGameRacingPresentationTrackNodes> { return _gamePresentation.createGameRacingPresentationTrackNodes(...args); }
export function createGamePublicRacingPresentationNodes(...args: Parameters<typeof _gamePresentation.createGamePublicRacingPresentationNodes>): ReturnType<typeof _gamePresentation.createGamePublicRacingPresentationNodes> { return _gamePresentation.createGamePublicRacingPresentationNodes(...args); }
export function certifyPublicRacingPresentation(...args: Parameters<typeof _gamePresentation.certifyPublicRacingPresentation>): ReturnType<typeof _gamePresentation.certifyPublicRacingPresentation> { return _gamePresentation.certifyPublicRacingPresentation(...args); }
export { neon } from "./nodes/neon.js";
import { createCameraProjection } from "./RootRuntimeSupport.js";
import { lookAtMat4, multiplyMat4 } from "@aura3d/scene/math";
import { AURA_NORMALIZED_MODEL_MAX_DIMENSION } from "./SceneGroundingUtils.js";
import { resolveAnimationSeconds } from "./compiler/animation.js";
import { orbitAnimatedAngle } from "./compiler/actors.js";
import { resolveCameraFrame } from "./compiler/camera.js";
import { colorToClearColor } from "./colorUtils.js";
import type { GltfBounds } from "./compiler/gltfRuntime.js";
import { animatedPosition, flattenSceneNodes, isPositiveFinite, multiply4, primitiveSize, rotationXYZ, scaling, translation } from "./sceneMath.js";
import type { AuraCameraMode, AuraColor, AuraEffectNode, AuraLabelNode, AuraModelNode, AuraPrimitiveNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot, AuraVec3 } from "./nodes/types.js";

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

export { createGameAudio } from "../game/GameAudio.js";
export type { GameAudio, GameAudioBusDefinition, GameAudioBusId, GameAudioContextLike, GameAudioCueDefinition, GameAudioCueEvent, GameAudioEvidence, GameAudioOptions, GameAudioBusLevel, GameAudioDuckingOptions, GameAudioFootPlant, GameAudioFootstepOptions, GameAudioPlayingNode, GameAudioPositionalOptions, GameAudioVec3 } from "../game/GameAudio.js";
export { createAnimationAssetManifestReadiness, defineAnimationAssetManifest, validateAnimationAssetManifest } from "./AnimationAssetManifest.js";
export type { AnimationAssetManifest, AnimationAssetManifestEntry, AnimationAssetManifestKind, AnimationAssetManifestReadiness, AnimationAssetProfile } from "./AnimationAssetManifest.js";
export { AnimationController, auraAnimationRetargetDocumentedConstraints, auraAnimationRuntimeMitigationContract, createAnimationController, createEmbeddedGLBAnimationClipRegistryMetadata, createSourceTestGLBAnimationSwitchHarness } from "./AnimationController.js";
export type { AnimationClipEvent, AnimationClipEventInvocation, AnimationClipEventUnsubscribe, AnimationLoopMode, AnimationPlaybackDirection, AnimationPose, AnimationPoseTransform, AnimationQuaternion, AnimationRootMotion, AnimationVector3, RegisteredAnimationClip } from "./AnimationController.js";
export type { AuraAnimationAssetLike, AuraAnimationAssetMetadataLike, AuraAnimationBoneMetadata, AuraAnimationBoneMetadataInput, AuraAnimationClipEventSourceKind, AuraAnimationClipEventSourceMetadata, AuraAnimationClipLoopEvent, AuraAnimationClipMetadata, AuraAnimationClipPlaybackState, AuraAnimationClipSampleContext, AuraAnimationControllerClipEventInvocation, AuraAnimationControllerEventMap, AuraAnimationControllerOptions, AuraAnimationControllerSnapshot, AuraAnimationCrossFadeEvent, AuraAnimationCrossFadeOptions, AuraAnimationDiagnostic, AuraAnimationDiagnosticSeverity, AuraAnimationDiagnosticsOptions, AuraAnimationFadeState, AuraAnimationImportedRuntimeApplySnapshot, AuraAnimationImportedRuntimeClipSample, AuraAnimationImportedRuntimeLike, AuraAnimationLayerBodyMask, AuraAnimationLayerMetadata, AuraAnimationLayerRole, AuraAnimationPlayOptions, AuraAnimationPlaybackStatus, AuraAnimationPoseCaptureOptions, AuraAnimationPoseSnapshot, AuraAnimationRetargetBindingMetadata, AuraAnimationRetargetConstraint, AuraAnimationRetargetConstraintCode, AuraAnimationRetargetSnapshot, AuraAnimationRootMotionMetadata, AuraAnimationRuntimeClipSample, AuraAnimationRuntimeNodeBinding, AuraAnimationRuntimeNodeBindingOptions, AuraAnimationRuntimeNodeBindingSnapshot, AuraAnimationScrubEvent, AuraAnimationScrubOptions, AuraAnimationSkeletonMetadata, AuraAnimationStopOptions, AuraEmbeddedGLBClipMetadata, AuraEmbeddedGLBClipRegistryMetadata, AuraExternalHumanoidAnimationLibraryBindingMetadata, AuraHumanoidBoneBinding, AuraHumanoidBoneMap, AuraNamedAnimationClipDefinition, AuraPoseBakedFallbackMetadata, AuraPoseBakedFallbackRuntimeMetadata, AuraRegisteredAnimationClip, AuraSourceTestGLBAnimationClipId, AuraSourceTestGLBAnimationSwitchHarnessOptions, AuraSourceTestGLBAnimationSwitchHarnessResult, AuraSourceTestGLBAnimationSwitchStep } from "./AnimationController.js";
export { createAnimationDebugOverlay } from "./AnimationDebugOverlay.js";
export type { AnimationDebugOverlay, AnimationDebugOverlayEventRow, AnimationDebugOverlayMount, AnimationDebugOverlayOptions, AnimationDebugOverlaySnapshot, AnimationDebugOverlayStateRow } from "./AnimationDebugOverlay.js";
export { animationEpisodePackageSchemaVersion, createAnimationEpisodePackageManifest, requiredAnimationEpisodePackageRoles, validateAnimationEpisodePackage } from "./AnimationEpisodePackage.js";
export type { AnimationEpisodePackageFile, AnimationEpisodePackageFileRole, AnimationEpisodePackageManifest, AnimationEpisodePackageStatus, AnimationEpisodePackageValidationReport, CreateAnimationEpisodePackageManifestInput } from "./AnimationEpisodePackage.js";
export { AnimationAction, AnimationClip, AnimationLayer, AnimationMixer, AnimationTrack, assignActionToAnimationLayer, attachAnimationLayer, createAnimationAction, createAnimationClip, createAnimationEventMarker, createAnimationLayer, createAnimationMixer, createAnimationTrack, crossFadeAnimations, setAnimationTimeScale, subscribeAnimationEvents } from "./AnimationMixerBuilders.js";
export type { AnimationClipDescriptor, AnimationEvent, AnimationEventMarker, AnimationLayerOptions, AnimationMixerOptions, AnimationMixerSnapshot, AnimationTrackDescriptor, AnimationValue, LoopMode } from "./AnimationMixerBuilders.js";
export type { RootAnimationActionOptions, RootAnimationCrossFadeOptions, RootAnimationEventMarkerOptions, RootAnimationMixerOptions } from "./AnimationMixerBuilders.js";
export { animationMotionQualitySchemaVersion, createAnimationMotionQualityReport, defaultAnimationMotionQualityThresholds, validateAnimationMotionQuality } from "./AnimationMotionQuality.js";
export type { AnimationMotionFrameRegionSample, AnimationMotionFrameSample, AnimationMotionQualityReport, AnimationMotionQualityStatus, AnimationMotionQualityThresholds, AnimationMotionRegionKind, AnimationMotionSegmentInput, AnimationMotionSegmentKind, AnimationMotionSegmentReport, CreateAnimationMotionQualityReportInput } from "./AnimationMotionQuality.js";
export { captionAnimationRenderOutputKinds, collectAnimationRenderPackageOutputs, createAnimationRenderOutputPackageMetadata, createAnimationRenderQueue, createAnimationRenderReviewPackagePaths, defaultAnimationEvidenceTargets, defaultAnimationRenderOutputs, defaultAnimationViewport, defineAnimationRenderQueue, normalizeRenderCaptureTimes, requiredAnimationRenderPackageOutputKinds, validateAnimationRenderOutputPackageMetadata, validateAnimationRenderOutputs, validateAnimationRenderQueue } from "./AnimationRenderQueue.js";
export type { AnimationEvidenceTarget, AnimationRenderOutput, AnimationRenderOutputKind, AnimationRenderOutputPackageMetadata, AnimationRenderOutputTarget, AnimationRenderPackageOutputs, AnimationRenderQueueArtifact, AnimationRenderQueueItem, AnimationRenderReviewPackagePaths, AnimationRenderSceneStateSource, AnimationThumbnailSceneStateCapture, AnimationViewport, CreateAnimationRenderOutputPackageMetadataOptions, CreateAnimationRenderQueueOptions } from "./AnimationRenderQueue.js";
export { animationRouteProofSchemaVersion, createAnimationRouteProof, validateAnimationRouteProof } from "./AnimationRouteProof.js";
export type { AnimationRouteProof, AnimationRouteProofAsset, AnimationRouteProofCaption, AnimationRouteProofGesture, AnimationRouteProofPlaybackState, AnimationRouteProofRenderState, AnimationRouteProofShot, AnimationRouteProofStatus, AnimationRouteProofViseme, AnimationRouteReadinessCheck, CreateAnimationRouteProofInput } from "./AnimationRouteProof.js";
export { resolveCanvas, configureCanvas } from "./app/canvas.js";

export { AuraRuntimeError, createAuraAssetLoadError } from "./app/errors.js";
export { startProductionRender } from "./app/frameLoop.js";
export { registerAuraApp, unregisterAuraApp, auraAppRegistry } from "./app/liveApps.js";
export { devicePixelRatioSafe, performanceNow } from "./platform.js";
export { markRouteReady, markRouteError } from "./app/routeState.js";
export { captureAuraScreenshot } from "./app/screenshot.js";
export { assets, ensureAssetDecoders } from "./AssetDecoders.js";
export type { CompressedTextureDecoderProbes, CompressedTextureSupportDiagnostics, CompressedTextureSupportRequest, KTX2BasisTargetFormat } from "./AssetDecoders.js";
export { AssetLibraryBrowser } from "./AssetLibraryBrowser.js";
export type { AssetLibraryAssetDetail, AssetLibraryBrowserFilter, AssetLibraryBrowserSnapshot, AssetLibraryEditorReference, AssetLibraryMarketplaceSnapshot, AssetLibraryMarketplaceSource } from "./AssetLibraryBrowser.js";
export { analyzeAudioVisemes, createAudioDrivenVisemeTrack, mergeAudioVisemeFrames } from "./AudioVisemeAnalyzer.js";
export type { AnalyzeAudioVisemesOptions, AudioVisemeAnalysis, AudioVisemeAnalysisFrame } from "./AudioVisemeAnalyzer.js";
export { asAuraAppHandle, isAuraAppHandle, type AuraAppFrame, type AuraAppFrameCallback, type AuraAppHandle, type AuraAppNodeRegistryLike, type AuraAppRuntimeState, type AuraAppScreenshot } from "./AuraAppHandle";
export { createAuraVoiceBridgePackage, createAuraVoiceDubRerenderProof, createAuraVoiceMasterClock, createAuraVoiceRerenderPlan, sampleAuraVoiceBridgeAtTime, validateAuraVoiceAssetCoverage, validateAuraVoiceAudioCoverage, validateAuraVoiceBridgeContractIds, validateAuraVoiceBridgePackage, validateAuraVoiceDubMap, validateAuraVoiceTimingDrift, validateAuraVoiceVisemeCoverage } from "./AuraVoiceBridge.js";
export type { AuraVoiceBridgeArtifacts, AuraVoiceBridgeOptions, AuraVoiceBridgePackage, AuraVoiceDubRerenderProof, AuraVoiceMasterClock, AuraVoicePlaybackSample, AuraVoiceRerenderPlan } from "./AuraVoiceBridge.js";
export { createBatchEpisodeRenderPlan } from "./BatchEpisodeRenderer.js";
export type { AnimationShowBibleBatch, BatchEpisodeDefinition, BatchEpisodeRenderJob, BatchEpisodeRenderPlan } from "./BatchEpisodeRenderer.js";
export { bodyLanguageLibrary, resolveBodyLanguageGesture } from "./BodyLanguageLibrary.js";
export { createBrowserFrameCaptureAdapter, routeWithFrameTime } from "./BrowserFrameCaptureAdapter.js";
export type { BrowserFrameCaptureAdapter, BrowserFrameCapturePageLike, BrowserFrameCaptureRequest, BrowserFrameCaptureResult, CreateBrowserFrameCaptureAdapterOptions } from "./BrowserFrameCaptureAdapter.js";
export { combatFrameAdvantage, createCombatAi, solveCombatFrameData, validateCombatFrameData } from "./CombatFrameData.js";
export type { CombatAi, CombatAiAggression, CombatAiConfig, CombatAiDecision, CombatAiObservation, CombatFrameAdvantage, CombatFrameCheck, CombatFrameData, CombatFrameLimits, CombatFrameReport, CombatMoveRequest, CombatMoveRole } from "./CombatFrameData.js";
export { resolveProductionActorRuntimeState, applyProductionActorFootPlanting, applyProductionActorMorphTargets, attachProductionActorEvidence, createProductionRuntimeMetadata, productionActorModelBounds, auraProductionBoundsProbes, resolveProductionActorAnimationSeconds } from "./compiler/actors.js";
export { resolveCameraFrame } from "./compiler/camera.js";
export { multiplyRgb, colorToRgba, colorToLinearRgba, colorToAcesInputClearColor, colorToLinearRgb } from "./colorUtils.js";
export { getParticleLife, writeParticlePosition } from "./compiler/effects.js";
export { seededRange } from "./sceneMath.js";
export { createSceneLabelOcclusionTest } from "./compiler/labels.js";
export { isRenderableModelNode, isWebGLRenderableNode, resolveNativeBloomRadius, resolveProductionRuntimeShadowTuning, createProductionRuntimeShadowObservation, createProductionTexturesObservation, createProductionRuntimePostprocessObservation, createProductionRuntimeCollectedLights, resolveProductionShadowCasterIndex, productionRuntimeLightDirection, quaternionFromForwardDirection, normalizedDirection, nonNegativeFinite, clampNumber, productionRenderErrorMessage } from "./compiler/observations.js";
export { normalizeSceneSnapshot } from "./sceneMath.js";
export { createProductionTextObservation } from "./compiler/text.js";
export { createBuffer } from "./compiler/webglRuntime.js";
export { renderDiagnosticPreviewToCanvas, shouldRenderOverlay, createDiagnosticsOverlay } from "./public/devtools.js";
export { validateSceneAssets, createAssetProvenance, createInitialDiagnostics, snapshotDiagnostics } from "./diagnostics.js";
export { lazySystems } from "./public/devtools.js";
export { performance } from "./performanceEvidence.js";
export { renderer, createRendererDiagnosticReport, resolveRendererSceneCategory } from "./rendererDiagnostics.js";
export { createAuraRouteHealthSnapshot } from "./public/devtools.js";
export { createRuntimeNodeImportedAssetEvidence } from "./RuntimeNodeHandle.js";
export { cloneRuntimeAnimationPose, cloneRuntimeImportedAssetEvidence, sanitizeRuntimeMorphWeight } from "./runtimeEvidence.js";
export { collectAuraSceneEvidence } from "./sceneEvidence.js";
export { sceneKitPerformanceBudget, createSceneKitPerformanceDiagnostics, buildSceneKit } from "./sceneKitDiagnostics.js";
export { alignDialogueToAudio } from "./DialogueAlignment.js";
export type { DialogueAlignmentCue, DialogueAlignmentReport } from "./DialogueAlignment.js";
export { captionCueAtTime, captionCuesForShot, createAudioStemManifest, createCaptionTimingProof, createDialogueTimingReport, createDialogueTrack, defineAudioStemManifest, defineCaptionTrack, defineDialogueTrack, defineDubMap, deriveCaptionTrackFromDialogue, dialogueLineAtTime, lineSafeCaptionText, validateAudioStemManifest, validateCaptionTrack, validateDialogueTrack } from "./DialoguePerformance.js";
export type { AudioStem, AudioStemManifestArtifact, AudioStemRole, CaptionCue, CaptionTimingProof, CaptionTimingProofLine, CaptionTrackArtifact, DialogueDeliveryDirection, DialogueEmotion, DialogueLine, DialogueTimingReport, DialogueTrackArtifact, DialogueWordTiming, DubMapArtifact, DubMapEntry } from "./DialoguePerformance.js";
export { captureScreenshot, createAssetDiagnostics, createCompatibilityReport, createDiagnosticsPanel, createEnvironment, createMaterialVariantController, createPostProcessComposerLazy, createRenderDiagnostics, inspectAsset, loadAsset, loadProductAssetLazy, workflows } from "./engineSurface.js";
export type { A3DAssetDiagnostics, A3DDiagnosticsPanel, A3DEnvironment, A3DEnvironmentOptions, A3DMaterialVariantController, A3DRenderDiagnostics, A3DScreenshotCapture, A3DWorkflowApi } from "./engineSurface.js";
export { createEpisodeStructure, flattenEpisodeShotRefs, sceneStructureAtTime, validateEpisodeStructure } from "./EpisodeStructure.js";
export type { CreateEpisodeStructureInput, EpisodeActStructure, EpisodeSceneStructure, EpisodeShotRef, EpisodeStructure, EpisodeStructureArtifact, EpisodeStructureMetadata, LegacyEpisodeAct, LegacyEpisodeScene, LegacyEpisodeShotReference, LegacyEpisodeStructureInput } from "./EpisodeStructure.js";
export { episodeTemplate, episodeTemplates } from "./EpisodeTemplates.js";
export type { EpisodeTemplate, EpisodeTemplateId } from "./EpisodeTemplates.js";
export { createExternalPhonemeAnalyzerAdapter, probeExternalPhonemeAnalyzer } from "./ExternalPhonemeAnalyzer.js";
export type { CreateExternalPhonemeAnalyzerAdapterOptions, ExternalPhonemeAlignment, ExternalPhonemeAnalyzerAdapter, ExternalPhonemeAnalyzerCapability, ExternalPhonemeAnalyzerInput, ExternalPhonemeAnalyzerProvider, ExternalPhonemeAnalyzerResult, ExternalPhonemeAnalyzerStatus, ExternalPhonemeTiming } from "./ExternalPhonemeAnalyzer.js";
export { footPlanting, resolveFootPlanting } from "./FootPlanting.js";
export type { AuraFootPlantingGround, AuraFootPlantingGroundLike, AuraFootPlantingLegOptions, AuraFootPlantingOptions, AuraFootSide, AuraFootVec3, AuraHeightfieldSpec, AuraMovingPlatformSpec, AuraResolvedFootPlanting } from "./FootPlanting.js";
export { createFrameEncoder, createInMemoryFrameEncoderAdapter, defaultContainerForCodec, defaultFrameEncoderMimeType, supportsFrameEncoderCodec } from "./FrameEncoder.js";
export type { CreateFrameEncoderOptions, EncodedVideoArtifact, EncodedVideoChunk, FrameEncoder, FrameEncoderAdapter, FrameEncoderCapability, FrameEncoderCodec, FrameEncoderContainer, FrameEncoderFrame, FrameEncoderOutputMode, FrameEncoderStatus } from "./FrameEncoder.js";
export { FrameLoop, createFrameLoop, type FrameLoopCallback, type FrameLoopFrame, type FrameLoopOptions, type FrameLoopSnapshot, type FrameLoopSource } from "./FrameLoop";
export { gameKits } from "./game-kits";
export { createFightingGameKit, fighting, fighterRuntimeNode, type FightingActorState, type FightingControls, type FightingGameKit, type FightingGameKitOptions, type FightingGameSnapshot, type FightingStageOptions } from "./game-kits/fighting";
export { createGameAppRuntime, type GameAppRuntime, type GameAppRuntimeEvidence, type GameAppRuntimeLoopOptions, type GameAppRuntimeOptions, type GameAppRuntimeResize, type GameAppRuntimeStatus } from "./GameAppRuntime";
export { FOLLOW_DAMPING_CONTRACT, createCollisionAwareOrbit, createFollowRig, createGameCameraRig, createPunchIn, createShoulderCamera, createTraumaShake, gameCameraRigs } from "./GameCameraRigs.js";
export type { CollisionAwareOrbit, CollisionAwareOrbitOptions, CollisionOrbitProbe, CollisionOrbitProbeHit, FollowRig, FollowRigOptions, GameCameraEvidence, GameCameraRig, GameCameraRigOptions, GameCameraRigSnapshot, GameCameraRigTarget, GameCameraRigVec3, PunchIn, PunchInOptions, PunchInSnapshot, ShoulderCamera, ShoulderCameraOptions, TraumaShake, TraumaShakeOptions, TraumaShakeSnapshot } from "./GameCameraRigs.js";
export type { GameRuntimeEvidence, GameRuntimeEvidenceApp, GameRuntimeEvidenceOptions, GameRuntimeSourceEvidence } from "./GameEvidence";
export { GAME_FEEL_HIT_STOP_DEFAULT_S, GAME_FEEL_HIT_STOP_HEAVY_S, GAME_FEEL_HIT_STOP_LIGHT_S, GAME_FEEL_HIT_STOP_SPECIAL_S, createGameFeel, gameFeelBuilders } from "./GameFeel.js";
export type { GameFeel, GameFeelBudgetTelemetry, GameFeelEffectKind, GameFeelEffectsPort, GameFeelOptions, GameFeelReceipt, GameFeelSnapshot } from "./GameFeel.js";
export { GAME_FALLING_BLOCK_PIECES, createGameAssetBoundPlatformerLevel, createGameAssetBoundRacingRoute, createGameFallingBlocksKit, createGameLocomotionKit, createGamePlatformerKit, createGamePlatformerSurfaceQuery, createGameRacingKit, createGameRacingSurfaceQuery } from "./GameGenreKits";
export type { GameAssetBoundPlatformerLevel, GameAssetBoundPlatformerLevelBinding, GameAssetBoundPlatformerLevelOptions, GameAssetBoundRacingRoute, GameAssetBoundRacingRouteBinding, GameAssetBoundRacingRouteOptions, GameFallingBlockAction, GameFallingBlockActivePiece, GameFallingBlockBoard, GameFallingBlockCell, GameFallingBlockPiece, GameFallingBlockRotation, GameFallingBlocksEvent, GameFallingBlocksKit, GameFallingBlocksOptions, GameFallingBlocksSnapshot, GameKitRect, GameKitVec2, GameLocomotionClipMap, GameLocomotionEventInput, GameLocomotionInput, GameLocomotionKit, GameLocomotionOptions, GameLocomotionSnapshot, GameLocomotionState, GamePlatformerCheckpoint, GamePlatformerCollectible, GamePlatformerEvent, GamePlatformerEventType, GamePlatformerHazard, GamePlatformerInput, GamePlatformerKit, GamePlatformerLevel, GamePlatformerGroundContact, GamePlatformerSurfaceQuery, GamePlatformerMovingPlatform, GamePlatformerPlayerState, GamePlatformerSnapshot, GamePlatformerWorldAssetBinding, GameRacingCameraSnapshot, GameRacingEvent, GameRacingEventType, GameRacingInput, GameRacingKit, GameRacingSpeedModel, GameRacingSurfaceContact, GameRacingSurfaceQuery, GameRacingOptions, GameRacingRoute, GameRacingSnapshot } from "./GameGenreKits";
export { GameInspector, createGameInspector } from "./GameInspector.js";
export type { GameInspectorRuntimeInput, GameInspectorSnapshot } from "./GameInspector.js";
export { createCombatWorld, createGameCameraDirector, createGameEffects, applyGameCombatEventsToRuntime, createGameAccessibilityFocus, createGameAccessibilityLabel, createGameAccessibilityRuntimeSettings, createGameHighContrastSource, createGameHudBindings, createGameHudComboBinding, createGameHudDebugToggleBinding, createGameHudHealthBinding, createGameHudMeterBinding, createGameHudRoundBinding, createGameHudSnapshot, createGameHudTimerBinding, createGameBoxCollider, createGameCapsuleCollider, createGameColliderDebugGeometry, createGameCombatDebugGeometry, createGameDebugOverlayData, createGameDebugSceneNodes, createGameHitboxDebugGeometry, createGameSimulation, createGameInput, createGameInputReplay, createGameInputReplayDriver, createGameJumpAssist, createGameKinematicBody, createGamePauseControlsSource, createGameRectCollider, createGameReducedFlashSource, createGameReducedMotionSource, createGameSphereCollider, createGameTouchControlLayout, gameColliderAabb, gameColliders, gameInputReplayEventsAt, createGameLoopPlan, runGameSimulation, type GameAccessibilityFocusOptions, type GameAccessibilityLabelOptions, type GameAccessibilityPauseControlsOptions, type GameAccessibilityPreferenceOptions, type GameAccessibilityRuntimeSettings, type GameAccessibilityRuntimeSettingsOptions, type GameAccessibilitySource, type GameAccessibilitySourceKind, type GameAabb, type GameBounds3, type GameCameraDirector, type GameCameraDirectorOptions, type GameCameraSnapshot, type GameCameraTarget, type GameCollisionAddBodyOptions, type GameCollisionBodyHandle, type GameCollisionBodyOptions, type GameCollisionBodySnapshot, type GameCollisionBox, type GameCollisionContact, type GameCollisionEvent, type GameCollisionParticipant, type GameCollisionQueryFilter, type GameCollisionSweepHit, type GameCollisionSweepOptions, type GameCollisionWorld, type GameCollisionWorldSnapshot, type GameCombatActorOptions, type GameCombatActorSnapshot, type GameCombatActiveAttackSnapshot, type GameCombatEvent, type GameCombatEventRuntimeBridgeOptions, type GameCombatEventRuntimeBridgeResult, type GameCombatEventType, type GameCombatMove, type GameCombatWorld, type GameCombatWorldSnapshot, type GameBoxCollider, type GameBoxColliderOptions, type GameCapsuleCollider, type GameCapsuleColliderOptions, type GameCollider, type GameColliderAxis, type GameColliderBase, type GameColliderDimension, type GameColliderFactoryOptions, type GameColliderKind, type GameColliderPlane, type GameDebugGeometryNode, type GameDebugGeometryOptions, type GameDebugGeometryPrimitive, type GameDebugOverlayData, type GameDebugOverlayMetric, type GameDebugOverlayOptions, type GameDebugOverlaySection, type GameDebugSceneNode, type GameDebugSceneNodeOptions, type GameDebugScenePrimitive, type GameEffectInstance, type GameEffectAttachment, type GameEffectKind, type GameEffectOptions, type GameEffectsController, type GameEffectsSnapshot, type GameEventInput, type GameEventLog, type GameEventLogOptions, type GameEventLogSnapshot, type GameEventRecord, type GameEventSeverity, type GameHudActorBindingOptions, type GameHudBinding, type GameHudBindingKind, type GameHudComboBindingOptions, type GameHudDebugToggleBindingOptions, type GameHudEventLogBindingOptions, type GameHudObjectiveBindingOptions, type GameHudResolvedValue, type GameHudRoundBindingOptions, type GameHudScoreBindingOptions, type GameHudSourceKind, type GameHudSnapshot, type GameHudSnapshotItem, type GameHudSnapshotOptions, type GameHudTimerBindingOptions, type GameHudValueBindingOptions, type GameHudValueFormat, type GameInputActionState, type GameInputAxisSettings, type GameInputAxisBinding, type GameInputController, type GameInputOptions, type GameInputReplayDriver, type GameInputReplayDriverSnapshot, type GameInputReplayEvent, type GameInputReplayOptions, type GameInputReplayPlan, type GameInputSnapshot, type GameJumpAssistController, type GameJumpAssistOptions, type GameJumpAssistSnapshot, type GameJumpAssistUpdate, type GameKinematicBody, type GameKinematicBodyOptions, type GameKinematicBodySnapshot, type GameLoopPlan, type GamePointerSnapshot, type GameRectCollider, type GameRectColliderOptions, type GameRuntimeSubsystemId, type GameRuntimeSubsystemOwnership, type GameSimulation, type GameSimulationFrame, type GameSimulationOptions, type GameSimulationResult, type GameSimulationStepContext, type GameSimulationStepResult, type GameSphereCollider, type GameSphereColliderOptions, type GameSubsystemOwner, type GameTouchControlAnchor, type GameTouchControlKind, type GameTouchControlLayout, type GameTouchControlLayoutOptions, type GameTouchControlRegion, type GameTouchControlRequest, type GameVec3, type GamepadSnapshot } from "./GameRuntime";
export { createGameArcadeVehicle } from "./GameRuntime.js";
export type { GameArcadeVehicle, GameArcadeVehicleInput, GameArcadeVehicleOptions, GameArcadeVehicleState } from "./GameRuntime.js";
export { collectGameSceneRuntimeNodes, createGameSceneBridge, createRuntimeNodeSpec, type GameSceneBridge, type GameSceneBridgeApp, type GameSceneBridgeBodyLike, type GameSceneBridgeEvidence, type GameSceneBridgeNodeHandle, type GameSceneRuntimeNode } from "./GameSceneBridge";
export { createGamePlatformerSceneBinding, createGamePlatformerPresentationCamera, createGameRacingPresentationCamera, createGameRacingSceneBinding } from "./GameSceneGeometryBindings";
export type { GamePlatformerSceneBinding, GamePlatformerSceneBindingOptions, GamePlatformerPresentationCameraOptions, GameRacingSceneBinding, GameRacingSceneBindingOptions, GameRacingPresentationCameraOptions, GameRacingCameraRigOptions, GameRacingCameraSelectionEvidence, GameRacingSceneSpeedModel, GameRacingScenePose, GameScenePresentationCameraSpec, GameSceneTransform } from "./GameSceneGeometryBindings";
export { blendSkyBandColor, measureFlatRegionFraction, planLayeredSceneComposition, planSkyBackdrop, platformerCompositionSpec, skyBandCountForRamp } from "./LayeredSceneComposition.js";
export type { LayeredSceneComposition, LayeredSceneCompositionSpec, PlatformerCompositionPresetOptions, SceneCompositionLayerReport, SceneCompositionPropKind, SceneDepthLayerRole, SceneDepthLayerSpec, ScenePropPlacement, SceneProtectedZone, SkyBackdropBand, SkyBackdropPlan, SkyBackdropSpec } from "./LayeredSceneComposition.js";
export { createMediaRecorderFrameEncoderAdapter, probeMediaRecorderFrameEncoder } from "./MediaRecorderFrameEncoder.js";
export type { CreateMediaRecorderFrameEncoderAdapterOptions, MediaRecorderFrameEncoderCapability } from "./MediaRecorderFrameEncoder.js";
export { bindCrowdRepresentations, crowds, describeCrowd, navigation } from "./NavigationCrowds.js";
export type { AuraCrowdAgentLod, AuraCrowdCreateOptions, AuraCrowdDiagnostics, AuraCrowdHandle, AuraCrowdLodOptions, AuraCrowdLodTier, AuraCrowdRepresentation, AuraCrowdRepresentationOptions, AuraNavMeshBakeOptions, AuraNavMeshHandle, AuraNavigationPeer, AuraNavigationPeerLoaders } from "./NavigationCrowds.js";
export { animation, animationStudio } from "./nodes/animation.js";
export { defineAuraAssets } from "./nodes/assets.js";
export { AuraNodeBuilder } from "./nodes/builder.js";
export { distance3, character } from "./nodes/character.js";
export { charts } from "./nodes/charts.js";
export { makeCityCrosswalk, makeCityRoadMarkings, makeBuildingWindowRows, makeBuildingDetails, makeCityVehicle, makeCityProps, collectCityInstancingPlan, city } from "./nodes/city.js";
export { editor } from "./nodes/editor.js";
export { effects } from "./nodes/effects.composite.js";
export { environments, environmentMapPresets } from "./nodes/environments.composite.js";
export { collectGameRuntimeEvidence, game } from "./nodes/game/index.js";
export { createAuraGameRules, gameRules } from "./gameRules.js";
export { createGameRacingCameraRig } from "./nodes/game/racingCamera.js";
export { gameFeel } from "./nodes/gameFeel.js";
export { games } from "./nodes/games.js";
export { geometry } from "./nodes/geometry.js";
export { group, distanceLod, groups, findGroupNode } from "./nodes/groups.js";
export { interactions } from "./nodes/interactions.js";
export { labels } from "./nodes/labels.js";
export { model, unsafeModelUrl, builtInCharacterAssets } from "./nodes/model.js";
export { physics, createRuntimeScenePhysics, eulerToQuat, resolveNodePhysicsShape } from "./nodes/physics.js";
export { createGameRacingTopDownCamera } from "./nodes/prefabs/gamePresentation.js";
export { prefabs } from "./nodes/prefabs/index.js";
export { primitive, primitives } from "./nodes/primitives.js";
export { product } from "./nodes/product.js";
export { definePromptPlan, compilePromptPlan, promptPlanToScene } from "./nodes/prompt/promptPlan.js";
export { promptRecipes } from "./nodes/prompt/promptRecipes.js";
export { promptSubjectIsResolved, resolvePromptPlanSubject } from "./nodes/promptPlans.js";
export { resolveFrameAssetRenderScale, AuraSceneBuilder, scene } from "./nodes/scene.js";
export { solarMaterialPresetsInNodes, solar } from "./nodes/solar.js";
export { rootSdfFontAtlas, text3D } from "./nodes/text3d.js";
export { timeline } from "./nodes/timeline.js";
export type { AuraVec3, AuraColor, AuraAssetType, AuraModelFormat, AuraTextureFormat, AuraProceduralTextureKind, AuraProceduralTextureSpec, AuraMaterialTextureInput, AuraTextureTransform, AuraAssetDefinition, AuraAssetMetadata, AuraAssetRef, AuraAssetMap, AuraTransformSpec, AuraMaterialSpec, AuraEditableMaterialParameters, AuraMaterialInspectorParameter, AuraMaterialInspectorPanel, AuraMaterialVisualQAResult, AuraMaterialCapabilityFeatureId, AuraMaterialCapabilitySupport, AuraMaterialCapabilityFeature, AuraMaterialCapabilityDiagnostics, AuraMaterialCapabilityInput, AuraModelRole, AuraModelScaleMode, AuraModelOptions, AuraPrimitiveOptions, AuraBuiltinPrimitive, AuraRootLodLevelSpec, AuraRootLodSpec, AuraAnimationSpec, AuraRuntimeNodeSpec, AuraInteractionSpec, AuraCharacterClipName, AuraCharacterStyle, AuraCharacterPose, AuraCharacterJointName, AuraCharacterJoint, AuraCharacterClip, AuraCharacterSkeleton, AuraCharacterRigSpec, AuraCharacterFootPlantingSpec, AuraCharacterRootMotionSpec, AuraCharacterConstraintCorrectionSpec, AuraCharacterVisualQAGap, AuraCharacterVisualQAResult, AuraProceduralHumanMeshPartName, AuraProceduralHumanMeshPart, AuraProceduralHumanMeshDescriptor, AuraHelperBudgetId, AuraHelperPerformanceBudget, AuraSceneNode, AuraModelNode, AuraPrimitiveNode, AuraGroupNode, AuraLightType, AuraLightNode, AuraEffectType, AuraParticleMaterialMode, AuraEffectNode, AuraParticleBudgetDiagnostics, AuraLabelNode, AuraEnvironmentNode, AuraSceneCategory, AuraRendererColorManagementPreset, AuraSceneExposurePreset, AuraEnvironmentMapPreset, AuraRendererQualityPreset, AuraRendererQualityProfileId, AuraRendererMode, AuraRendererFallbackMode, AuraRendererQualityProfile, AuraCreateAppRendererOptions, AuraRendererDiagnosticReport, AuraInteractionNode, AuraPhysicsShapeKind, AuraNodePhysicsSpec, AuraPhysicsStepOptions, AuraPhysicsDebugSnapshot, AuraPhysicsSceneSummary, AuraPhysicsWheelSpec, AuraPhysicsWheelTuning, AuraPhysicsWheelCommand, AuraPhysicsWheelState, AuraPhysicsVehicleAxis, AuraPhysicsVehicleController, AuraPhysicsCharacterDescriptor, AuraPhysicsCharacterMovement, AuraPhysicsCharacterController, AuraPhysicsWorldController, AuraNodeInput, AuraCameraMode, AuraCameraSpec, AuraBoundsSpec, AuraCameraFrameAssetOptions, AuraTimelineSpec, AuraEnvironmentOptions, AuraRendererRuntimeObservation, AuraSceneSnapshot, CityBlockTimeOfDay, AuraCityCameraPreset, AuraCityBlockOptions, AuraCityStateChangeEvidence, AuraCityInstancingPlan, AuraCityVisualQAResult, AuraCityStateController, AuraSolarSystemPrefabOptions, AuraSolarPlanetMaterialPreset, AuraSolarVisualQAResult, AuraNeonPalettePreset, AuraNeonTunnelOptions, AuraNeonVisualQAResult, AuraPrimitiveHumanoidPrefabOptions, AuraDataBars3DPrefabOptions, AuraChartTheme, AuraChartVisualQAResult, AuraProductStageStyle, AuraProductViewerOptions, AuraProductPlacement, AuraProductDiagnostics, AuraProductVisualQAResult, AuraMiniGolfMetrics, AuraMiniGolfStateController, AuraMiniGolfPointerPoint, AuraMiniGolfShotInput, AuraGameLoopPlan, AuraGameInputPlan, AuraGameInputAxisBinding, AuraGameInputActionState, AuraGameInputReplayEvent, AuraGameInputSnapshot, AuraGameInputController, AuraGameRuntimeEvidence, AuraGameRules, AuraGameRuntimeOptions, AuraGameRuntime, AuraRacingPresentationTrackOptions, AuraRacingRoadMeshOptions, AuraRacingCheckpointGateOptions, AuraRacingStartFinishOptions, AuraPublicRacingPresentationOptions, AuraRacingPresentationCertificationInput, AuraPlatformerPresentationSurfaceOptions, AuraPlatformerPublicSurfaceMode, AuraPublicPlatformerPresentationOptions, AuraPlatformerSurfaceMeshOptions, AuraPlatformerHazardOptions, AuraPlatformerCheckpointOptions, AuraPlatformerFinishOptions, AuraPlatformerPresentationCertificationInput, AuraCityBrowserRuntimeState, AuraCityDayNightToggleOptions, AuraSceneKitId, AuraSceneKitCustomizeOptions, AuraSceneKitDiagnostics, AuraSceneKitPerformanceDiagnostics, AuraSceneKitDrawCallBudget, AuraSceneKitBundleBudget, AuraSceneKitFpsBudget, AuraSceneKitInstancingFamilyEvidence, AuraSceneKitInstancingEvidence, AuraSceneKitLodEvidence, AuraSceneKitLazySystemId, AuraSceneKitLazyLoadingEntry, AuraSceneKitLazyLoadingPlan, AuraLazySystemEvidence, AuraSceneKit, AuraSceneKitBudgetDefaults, AuraPromptSceneType, AuraPromptEffectId, AuraPromptCameraPreset, AuraPromptLightingPreset, AuraPromptInteractionMode, AuraPromptResolvedSubject, AuraPromptIntentSubject, AuraPromptPlanSubject, AuraPromptSubjectResolver, AuraPromptPlan, AuraPromptPlanReport, AuraCompiledPromptPlan, AuraBackend, AuraDiagnostics, AuraAssetProvenance, AuraAssetLoadState, AuraSceneEvidence, AuraFrameInfo, AuraFrameCallback, AuraRuntimeNodeSnapshot, AuraRuntimeNodeHandle, AuraRuntimeNodeImportedAssetEvidence, AuraRuntimeNodeImportedAssetDiagnostic, AuraRuntimeNodeImportedAssetEvidenceInput, AuraRuntimeNodeRegistry, AuraRuntimeState, AuraApp, AuraCreateAppOptions, AuraCreateGameAppOptions, AuraDiagnosticsOptions, AuraScreenshot, AuraAppTarget, AuraAppRegistry, WebGLRenderController, ProductionRuntimeActorEntry, ProductionRuntimePrimitiveEntry, ProductionRuntimePrimitiveResource, ProductionRuntimePrimitiveState, ProductionRuntimeLightDescriptor, AuraFountainParticleLayer, WebGLSceneRenderer, WebGLModel } from "./nodes/types.js";
export { ui } from "./nodes/ui.js";
export { visualScripting } from "./nodes/visualScripting.js";
export { water } from "./nodes/water.js";
export { weather } from "./nodes/weather.js";
export { blendPerformancePoses, createPerformanceTransitionPlan } from "./PerformanceBlender.js";
export type { PerformanceBlendResult, PerformanceTransitionPlan, PerformanceTransitionSample } from "./PerformanceBlender.js";
export { PerformanceCaptureRecordingSession, createPerformanceCaptureSession, validatePerformanceCaptureCapability } from "./PerformanceCaptureSession.js";
export type { PerformanceCaptureCapability, PerformanceCapturePermissionState, PerformanceCaptureRecordingSample, PerformanceCaptureRecordingSessionOptions, PerformanceCaptureRecordingSessionSnapshot, PerformanceCaptureRecordingSessionStatus, PerformanceCaptureSignal, PerformanceCaptureSourceKind } from "./PerformanceCaptureSession.js";
export { PerformancePoseEditor } from "./PerformancePoseEditor.js";
export type { PerformancePoseEditorSnapshot } from "./PerformancePoseEditor.js";
export { parsePerformanceScriptCue } from "./PerformanceScriptParser.js";
export type { PerformanceScriptCue } from "./PerformanceScriptParser.js";
export { AURA_DYNAMIC_CAPABLE_SHAPES, AURA_SPEC_CONSTRUCTIBLE_SHAPES, AURA_STATIC_ONLY_SHAPES, assertShapeSupported, collisionMaskFor, contactRelativeSpeed, createBodyHandle, createCollisionLayers, createPhysicsRuntime, layerMask, layersCollide, toAuraCollisionEvent, toAuraRaycastResult, validateJointSpec } from "./PhysicsRuntime.js";
export type { AuraBodyHandle, AuraBodyRegistry, AuraBodySpec, AuraColliderShape, AuraCollisionEvent, AuraCollisionHandler, AuraCollisionLayers, AuraDebugBudgetTelemetry, AuraDebugLine, AuraJointHandle, AuraJointKind, AuraJointSpec, AuraPhysicsDebugOptions, AuraPhysicsQueries, AuraPhysicsRuntime, AuraPhysicsRuntimeOptions, AuraRaycastOptions, AuraRaycastResult, AuraUnsubscribe, PhysicsVec3 } from "./PhysicsRuntime.js";
export { measurePlatformerGeometry, platformerFeelProfile, solvePlatformerMotion, validatePlatformerMotion } from "./PlatformerMotion.js";
export type { PlatformerFeel, PlatformerGeometryFacts, PlatformerMotionCheck, PlatformerMotionReport, PlatformerMotionRequest, PlatformerMotionSolution, PlatformerPlatformLike } from "./PlatformerMotion.js";
export { createPromptAnimationAccessibilityProofMetadata, createPromptAnimationEpisodePlan, createPromptAnimationEpisodeReadiness, createPromptAnimationIssue, createPromptAnimationStoryBible, createPromptEpisodePlan, definePromptAnimationEpisode, definePromptAnimationStoryBible, definePromptAnimationStoryboard, definePromptEpisodePlan, normalizePromptAnimationTime, promptAnimationChildSafeDefaults, promptAnimationContractCompatibilityAdapters, promptAnimationContractVersion, promptAnimationDriftFrames, promptAnimationFrameAtTime, promptAnimationLegacyContractVersion, promptAnimationTimeAtFrame, resolvePromptAnimationContractCompatibility, storyboard, validatePromptAnimationArtifactContract, validatePromptAnimationEpisodeReadiness, validatePromptAnimationStableIds } from "./PromptAnimationContract.js";
export type { PromptAnimationAccessibilityProofMetadata, PromptAnimationAccessibilityProofStatus, PromptAnimationArtifactBase, PromptAnimationArtifactKind, PromptAnimationAssetMode, PromptAnimationCaptionAccessibilityProof, PromptAnimationCharacter, PromptAnimationCharacterRig, PromptAnimationCharacterRole, PromptAnimationContractCompatibilityResult, PromptAnimationContractVersion, PromptAnimationEpisodePlan, PromptAnimationEpisodePlanInput, PromptAnimationEpisodeReadiness, PromptAnimationFrameRate, PromptAnimationHighContrastAccessibilityProof, PromptAnimationId, PromptAnimationIssueSeverity, PromptAnimationLanguageCode, PromptAnimationLocation, PromptAnimationMotionMode, PromptAnimationMouthFallback, PromptAnimationProductionMetadata, PromptAnimationProp, PromptAnimationPropRole, PromptAnimationPublishTarget, PromptAnimationReadinessStatus, PromptAnimationReducedMotionAccessibilityProof, PromptAnimationRenderOutputMode, PromptAnimationResolution, PromptAnimationReviewStatus, PromptAnimationRuntimeSpec, PromptAnimationSafetyMetadata, PromptAnimationSeconds, PromptAnimationShotListItem, PromptAnimationStoryBible, PromptAnimationStoryBibleInput, PromptAnimationStoryboard, PromptAnimationStoryboardScene, PromptAnimationStoryboardShot, PromptAnimationStyleGuide, PromptAnimationValidationIssue, PromptAnimationYouTubeDraftMetadata } from "./PromptAnimationContract.js";
export { collectPromptAnimationEvidence, createPromptAnimationDeterministicScreenshotFixtureMetadata, definePromptAnimationEvidence, evaluatePromptAnimationPublishReadiness } from "./PromptAnimationEvidence.js";
export type { CollectPromptAnimationEvidenceInput, PromptAnimationAccessibilityEvidence, PromptAnimationArtifactMetadataEvidence, PromptAnimationAssetStatusEvidence, PromptAnimationAudioEvidence, PromptAnimationConsumedAuraVoiceArtifactMetadata, PromptAnimationCoverageEvidence, PromptAnimationDeterministicCaptureEvidence, PromptAnimationDeterministicCaptureSummary, PromptAnimationEvidenceArtifact, PromptAnimationEvidenceStatus, PromptAnimationRenderedArtifactMetadata, PromptAnimationRenderedArtifactRole, PromptAnimationRouteHealthEvidence, PromptAnimationScreenshotEvidence, PromptAnimationScreenshotFixtureMetadata, PromptAnimationTimingDriftEvidence, PromptAnimationTrackEvidence } from "./PromptAnimationEvidence.js";
export { certifyPublicPlatformerGeometry, certifyPublicRacingGeometry } from "./PublicGameGeometry";
export type { PublicGameAssetCertification, PublicGameBounds2, PublicGameGeometryCategory, PublicGameGeometryCertification, PublicGameGeometrySource, PublicGameRetainedProof, PublicPlatformerCheckpoint, PublicPlatformerGeometryContract, PublicPlatformerHazard, PublicPlatformerSurface, PublicRacingGeometryCheckpoint, PublicRacingGeometryContract, PublicRacingGeometryPoint } from "./PublicGameGeometry";
export { A3DAppLifecycle, A3DRenderer, A3DScene, A3D_APP_WORKFLOW_PRESETS, AuraColorParseError, DIAGNOSTICS_SECTION_KEYS, DIAGNOSTIC_ONLY_FIELDS, GLTFLoader, Renderer, SCREEN_FEEL_BLACKBOARD_KEY, StubActorAnimationApi, StubAppAtmosphere, StubAppEffects, StubFeelBus, StubLightingRuntime, StubModelMaterialHandle, StubPostSurface, StubTimeController, WIND_CHUNK, appExtensionsAll, assertAuraRouteReady, assertAuraScreenshotNotBlank, auditArtDirection, captureAuraAppScreenshot, asRuntimeCompiled, bindRuntimeCompiled, captureFromUrl, compileScene, compilerSlot, composeWorldMatrix, createA3DApp, createAnimationLabWorkflow, createAssetCompatibilityReport, createAssetPreloader, createAssetViewerWorkflow, createAuraAssetPanelRows, createAuraDiagnosticsOverlay, createAuraPerformancePanelSnapshot, createAuraRouteHealth, createComparisonWorkflow, createECSRenderSource, createExternalParityEnvironmentPipeline, createGame, createInteractiveSceneWorkflow, createMaterialStudioWorkflow, createProductConfiguratorWorkflow, createResourceManager, createSceneShowcaseWorkflow, decomposeMatrix, diagnosticsSectionsAll, eulerToQuaternion, inspectGLTFAsset, listExternalParityEnvironmentTargets, loadProductAsset, loadRenderableAsset, lookLint, nodeHandleExtensionFor, nodeHandleExtensionsAll, nodeHandlerFor, nodeHandlersAll, optionCoverageRows, parseAuraColor, parseAuraColorSrgb, postPresets, registerAppExtension, registerDiagnosticsSection, registerEnvironmentSource, registerLookLintRule, registerNodeHandleExtension, registerNodeHandler, registerOptionCoverage, resolveA3DAppQualityPreset, resolveEnvironment, resolveQrFlags, setCompilerImpl, stubCameraRigFactories, summarizeExternalParityGLTFCorpus, updateCompiledScene, worldQueriesSlot } from "./publishedUnion.js";
export type { A3DApp, A3DAppDiagnostics, A3DAppLifecycleSnapshot, A3DAppOptions, A3DAppQualityPreset, A3DAppQualitySettings, A3DAppWorkflowPreset, A3DDisposable, A3DRendererOptions, A3DSceneMeshOptions, A3DSceneRenderSourceOptions, AppExtension, AnyNodeHandler, AppliedLookReport, ArtDirectionViolation, AuraActorAnimationApi, AuraActorAnimationStateSnapshot, AuraAnimationDiagnostics, AuraAntiAliasMode, AuraAppAtmosphere, AuraAppEffects, AuraAppExtensionMap, AuraAssetBudget, AuraAssetDecodersOption, AuraAssetLodLevel, AuraAssetLodOption, AuraAssetPanelRow, AuraAssetPreloadResult, AuraAssetPreloader, AuraAssetRequiredDecoder, AuraAssetVariants, AuraAssetsOption, AuraAutoExposureOptions, AuraBiomeId, AuraBiomeRig, AuraBoneMaskSpec, AuraBoneSocket, AuraCameraController, AuraCameraEvidence, AuraCameraLayer, AuraCameraOption, AuraCameraPose, AuraCameraProbe, AuraCameraRailOptions, AuraCameraRig, AuraCameraRigContext, AuraCameraRigFactories, AuraCameraSequence, AuraCameraSequencePlayback, AuraCameraShot, AuraCameraSubject, AuraCompiledFeature, AuraCreateAppAnimationOptions, AuraCustomPostPass, AuraDecalOptions, AuraDegradation, AuraDegradationCode, AuraDiagnosticsOverlay, AuraDiagnosticsSectionKey, AuraDirectionalShadowOptions, AuraEaseName, AuraEffectInstanceHandle, AuraEffectsDiagnostics, AuraEnvironmentSource, AuraEnvironmentSourceKind, AuraEnvironmentSourceResolution, AuraEulerOrder, AuraFeelBus, AuraFeelEventSpec, AuraFovKickLayer, AuraHeightFogSpec, AuraHeightQuery, AuraLightingDiagnostics, AuraLightingModel, AuraLightingOptions, AuraLightingRuntime, AuraLightsApiAdditions, AuraLocalShadowOptions, AuraLookDiagnostics, AuraLookId, AuraLookLintCode, AuraLookLintContext, AuraLookLintFinding, AuraLookLintRule, AuraLookNode, AuraLookOverrides, AuraLoopOptions, AuraMaterialDiagnostics, AuraMaterialTextureSlot, AuraModelColliderOption, AuraModelLodOption, AuraModelMaterialHandle, AuraModelMaterialOverride, AuraNodeHandleExtensionMap, AuraNodeKindMap, AuraOutputDiagnostics, AuraOutputOptions, AuraOutputOverlay, AuraOutputSurface, AuraPerformancePanelSnapshot, AuraPostDiagnostics, AuraPostPreset, AuraPostPresetId, AuraPostSurface, AuraPunchLayer, AuraQuat, AuraRendererMaterialOptions, AuraResolvedClipInfo, AuraResolvedMaterialInfo, AuraResourceDescriptor, AuraResourceKind, AuraResourceManager, AuraResourceManagerEvidence, AuraResourceRecord, AuraResourceStatus, AuraRootMotionSpec, AuraRouteHealth, AuraRuntimeNodeRegistryV2, AuraScreenFeelUniforms, AuraShadowOptions, AuraSkyNode, AuraSkySpec, AuraSkySunSpec, AuraStudioLookId, AuraTimeController, AuraToneMappingOperator, AuraTraumaLayer, AuraVfxEffectSpec, AuraVfxKind, AuraVolumetricFogSpec, AuraWindSpec, AuraWorldQualityTier, AuraWorldQueries, AuraWorldTransform, CaptureContext, CompiledActor, CompiledScene, CompilerImpl, CreateGameOptions, DiagnosticsSection, ECSRenderLibraries, ECSRenderSourceOptions, Game, GameAcceptance, GameBeacon, GameBudgets, GameEntryV2, GameFxKind, GameFxLayer, GameGenre, GameScenario, GameSession, GameSessionState, GameShell, GameShellLayout, GroundRaycaster, Hud, HudMountOptions, HudWidgetSpec, NodeHandleExtension, NodeHandler, OptionCoverageRow, PauseReason, QrFlagInput, RebuildTier, RenderSourceContributions, RouteHealthQualityGate, RuntimeCompiledSceneInternals, SceneCompileContext, ShadowReport, TouchControls, TouchPreset, TransitionSpec } from "./publishedUnion.js";
export { createProgressSnapshot, createRenderProgressTracker } from "./RenderProgressTracker.js";
export type { CreateRenderProgressTrackerOptions, RenderProgressAdvanceInput, RenderProgressSnapshot, RenderProgressStatus, RenderProgressTracker } from "./RenderProgressTracker.js";
export { createAuraText3DGeometry, defineAuraCustomGeometry, selectAuraRootLodLevel } from "./RootGeometry.js";
export type { AuraCustomGeometrySpec, AuraRootLodSelection, AuraRootLodThreshold, AuraRootVec3, AuraText3DGeometry, AuraText3DOptions } from "./RootGeometry.js";
export type { AuraPerformanceQuality } from "./RootRuntimeSupport.js";
export { calculateRuntimeNodeBounds, createRuntimeNodeEffectAttachment, runtimeNodeHasTag, type AuraRuntimeNodeAnimationPoseBindingMetadata, type AuraRootMotionBinding, type AuraRuntimeNodeAnimationBindingMetadata, type AuraRuntimeNodeBounds, type AuraRuntimeNodeEffectAttachment, type AuraRuntimeNodeEffectKind, type RuntimeNodeAnimationSpecLike, type RuntimeNodeBoundsInput, type RuntimeNodeHandleLike, type RuntimeNodeMorphTargetWeights, type RuntimeNodeVec3 } from "./RuntimeNodeHandle";
export { enforceFrameBudget, planScatterInstances, scatterWindOffset } from "./Scatter.js";
export type { FrameBudgetDecision, FrameBudgetInput, ScatterPlan, ScatterPlanOptions } from "./Scatter.js";
export { AURA_NORMALIZED_MODEL_MAX_DIMENSION, boundsFromAsset, boundsFromSize, boundsHeight, boundsMaxDimension, boundsSize, groundedAssetPlacement, groundedPlacement, groundedRenderedAssetPlacement, groundedYOffset, normalizedRenderScaleForTargetHeight, normalizedRenderScaleForTargetMaxDimension, normalizedScaleForTargetHeight, normalizedScaleForTargetMaxDimension, resolveSubjectPlacementFacts } from "./SceneGroundingUtils.js";
export type { AssetGroundedPlacement, GroundedPlacement, GroundedPlacementOptions, RenderGroundedAssetPlacement, RenderGroundedPlacementOptions, SceneAssetBoundsMetadata, SceneAssetLike, SceneBounds, SubjectPlacementFacts, SubjectPlacementRequest, Vec3 } from "./SceneGroundingUtils.js";
export { groundProbe, raycastPhysicsWorld, raycastSceneTargets, raycastSceneTargetsAll, sceneQueryTargets, sphereCastPhysicsWorld, sphereCastSceneTargets } from "./SceneQueries.js";
export type { PhysicsQueryWorld, SceneQueryHit, SceneQueryTarget, SceneRay } from "./SceneQueries.js";
export { createSceneSequencer, createSceneSequencerPlayback, sampleSceneSequencer } from "./SceneSequencer.js";
export type { LegacySceneSequencer, LegacySceneSequencerSnapshot, SceneSequencer, SceneSequencerPlan, SceneSequencerPlaybackController, SceneSequencerPlaybackSnapshot, SceneSequencerSample, SceneSequencerSceneBinding } from "./SceneSequencer.js";
export { createShotCompositionGuide, evaluateShotComposition } from "./ShotCompositionRules.js";
export type { ShotCompositionGuide, ShotCompositionOverlay, ShotCompositionReport, ShotCompositionRule, ShotCompositionRuleOptions, ShotSubjectFrameBox } from "./ShotCompositionRules.js";
export { applyShotPlaybackFrame, createShotPlaybackPlan, createShotTimeline, createShotTimelineDiagnostics, defineShotTimeline, getShotAtTime, getShotTimelineCaptureTimes, installShotPlayback, sampleShotPlaybackPlan, shotDuration, shotTimeline, validateShotTimeline } from "./ShotTimeline.js";
export type { ApplyShotPlaybackFrameOptions, InstallShotPlaybackOptions, ShotBlockingAction, ShotCameraInstruction, ShotCameraMove, ShotCharacterBlocking, ShotHoldTrimInstruction, ShotPlaybackCharacterMouthState, ShotPlaybackFramePlan, ShotPlaybackNodeUpdate, ShotPlaybackPlan, ShotPlaybackPlanInput, ShotPlaybackRuntimeApp, ShotPlaybackRuntimeNodeHandle, ShotPropBlocking, ShotTimelineArtifact, ShotTimelineDiagnostics, ShotTimelineInput, ShotTimelineShot, ShotTransition } from "./ShotTimeline.js";
export { createShotTransitionDescriptor, createShotTransitionPlan, sampleShotTransition } from "./ShotTransitionEngine.js";
export type { LegacyShotTransitionSample, ShotTransitionDescriptor, ShotTransitionKind, ShotTransitionPlan, ShotTransitionSample, WipeDirection } from "./ShotTransitionEngine.js";
export { checkSpatialInvariants, containsPoint, distanceOutsideBounds, distanceToBoundsSurface, distributeAroundBounds, distributeInRegion, fitSizeToRegion, placedBounds, placedBoundsFromAsset, placedBoundsFromWorldBounds, resolveBoundsAnchor, resolveSemanticRegion, validateSpacing } from "./SpatialAnchoring.js";
export type { AnchorOptions, BoundsAnchor, DistributedPlacement, DistributionOptions, HelperPlacementClaim, PlacedBounds, RadialPlacementOptions, RegionFittedSize, RegionFittedSizeOptions, ResolvedAnchor, ResolvedSemanticRegion, SemanticRegion, SpatialInvariantReport } from "./SpatialAnchoring.js";
export { resolveChaseFraming, resolveChaseFramingFromBounds, resolveSubjectRenderedSize, resolveSubjectRenderedSizeFromBounds } from "./SubjectFramingUtils.js";
export type { ChaseFraming, ChaseFramingIntent, SubjectFitRequest, SubjectRenderedSize } from "./SubjectFramingUtils.js";
export { createThumbnailArtifact, createThumbnailGenerationPlan, generateThumbnailArtifact } from "./ThumbnailGenerator.js";
export type { ThumbnailArtifact, ThumbnailCaptureRuntime, ThumbnailGenerationPlan } from "./ThumbnailGenerator.js";
export { GAME_TOUCH_LAYOUT_GENRES, bindGameTouchControls, bindGameTouchLayoutPreset, touchLayoutBindingsForGenre } from "./TouchControlBinding.js";
export type { GameControlBindingResult, GameControlBindingSpec, GameTouchLayoutBindings, GameTouchLayoutGenre, GameTouchLayoutPresetSpec, HoldControlBinding, PulseControlBinding, TouchControlElement, TouchControlHost } from "./TouchControlBinding.js";
export { createVehicleChassis, flatVehicleSurface, groundedFittedModelPosition, meshVehicleSurface, vehicleChassisSpecFromBounds } from "./VehicleChassis.js";
export type { VehicleChassis, VehicleChassisSpec, VehicleChassisTelemetry, VehiclePlanarState, VehiclePose, VehicleSurface, VehicleSurfaceSample, VehicleVec3, VehicleWheelId, VehicleWheelPose } from "./VehicleChassis.js";
export { angleDelta, createVehicleDriverAi } from "./VehicleDriverAi.js";
export type { DriverAggression, DriverConfig, DriverInput, DriverRoute, DriverRoutePoint, DriverTelemetry, DriverVehicleState, VehicleDriverAi } from "./VehicleDriverAi.js";
export { applyVisemeMorphInfluences, createAuraVoiceVisemeTrack, createGlbBlendshapeVisemeCue, createPrimitiveMouthVisemeCues, createVisemeController, defineAuraVoiceVisemes, glbVisemeBlendshapeExample, primitiveMouthCardForViseme, primitiveMouthVisemeExample, sampleVisemeTrack, validateVisemeTrack, visemeSampleToMorphInfluences } from "./VisemeController.js";
export type { AuraVoiceVisemeCue, AuraVoiceVisemeFormat, AuraVoiceVisemeId, AuraVoiceVisemeTrack, GlbVisemeBlendshapeExample, PrimitiveMouthCard, PrimitiveMouthExample, PrimitiveMouthVisemeCueInput, VisemeController, VisemeSample } from "./VisemeController.js";
export { applyManualVisemeEdits, createVisemeTimelineTrack, sampleVisemeTimelineTrack } from "./VisemeTimelineTrack.js";
export type { VisemeTimelineManualEdit, VisemeTimelineTrackArtifact } from "./VisemeTimelineTrack.js";
export { createAudioWaveformData, createWaveformVisualization, drawWaveformToCanvas, waveformPeakAtTime } from "./WaveformVisualizer.js";
export type { AudioWaveformData, AudioWaveformPeak, CreateAudioWaveformDataOptions, WaveformDrawOptions, WaveformVisualization, WaveformVisualizerOptions, WaveformVisualizerPeak, WaveformVisualizerPoint } from "./WaveformVisualizer.js";
export { createWebCodecsFrameEncoderAdapter, probeWebCodecsFrameEncoder } from "./WebCodecsFrameEncoder.js";
export type { CreateWebCodecsFrameEncoderAdapterOptions, WebCodecsFrameEncoderCapability } from "./WebCodecsFrameEncoder.js";
export { createWorldLabelLayer, ndcToScreen, projectWorldLabels, projectWorldPoint, resolveLabelCollisions } from "./WorldLabelRenderer.js";
export type { LabelOcclusionTest, LabelVec3, LabelViewport, OffscreenPolicy, ProjectedLabel, WorldLabel, WorldLabelLayer, WorldLabelLayerHost } from "./WorldLabelRenderer.js";
export { PositionalEmitter, FootstepPlayer, createGameMixer, attachFocusPolicy, computeDistanceAttenuation, computeDopplerShift, resolveOcclusion } from "@aura3d/audio";
export { Engine } from "@aura3d/core";
export { createRootEditorSurface } from "@aura3d/editor-runtime";
export { ComboDetector, createTouchLayoutPreset, probeHaptics, playHaptic } from "@aura3d/input";
export { buildMeshBVH, createMeshSurfaceQuery, raycastMesh, type MeshBVH, type MeshRayHit, type MeshSurfaceQuery, type MeshSurfaceQueryOptions, type SurfaceSample } from "@aura3d/physics/solverless";
export { analyzeRgbaFrameMotionRegions, createAnimationMaterialStyle, createAnimationRenderPreset, createAnimationVisualQualityReport } from "@aura3d/rendering";
export type { AnimationFrameVisualInput, AnimationFrameVisualQuality, AnimationMaterialStyle, AnimationMaterialStyleOptions, AnimationRenderPresetEvidence, AnimationRenderPresetOptions, AnimationVisualQualityOptions, AnimationVisualQualityReport, FrameMotionRegion, FrameMotionRegionMetrics } from "@aura3d/rendering";
export { attachVisualScriptingGraph, createVisualScriptingGraph, listVisualScriptingNodeCatalog } from "@aura3d/scripting";
export { animationDirector, compilePromptEpisodePlan, createAnimationDirectorPlan, defineAnimationDirectorPlan } from "./AnimationDirector.js";
export type { AnimationDirectorAssetSlot, AnimationDirectorBeatInput, AnimationDirectorCharacterInput, AnimationDirectorDialogueInput, AnimationDirectorInput, AnimationDirectorLocationInput, AnimationDirectorMotionRequirement, AnimationDirectorPlan, AnimationDirectorPropInput, AnimationDirectorReviewGate } from "./AnimationDirector.js";
export { animationEmotionPoseLibrary, animationGestureLibrary, animationPerformanceCuesAtTime, createAnimationPerformance, createAnimationPerformanceCoverage, createDialogueAnimationPerformance, defineAnimationPerformance, resolveAnimationEmotionPose, resolveAnimationGesture, sampleAnimationCharacterPerformance, validateAnimationPerformance } from "./AnimationPerformance.js";
export type { AnimationCharacterPerformanceState, AnimationEmotionPose, AnimationFacialBrow, AnimationFacialEyeShape, AnimationFacialMouthShape, AnimationGazeMode, AnimationGesture, AnimationPerformanceAction, AnimationPerformanceArtifact, AnimationPerformanceBlockingState, AnimationPerformanceBodyState, AnimationPerformanceCoverage, AnimationPerformanceCue, AnimationPerformanceFacialState, AnimationPerformanceGazeState, AnimationPerformanceGestureState, AnimationPerformancePosture } from "./AnimationPerformance.js";
export { createAuraApp } from "./app/createAuraApp.js";
export { createGameApp } from "./app/createGameApp.js";
export { normalizeTextureBudgetBytes } from "./app/rendererOptions.js";
export { createArchitectureKit, createCinematicKit, createDigitalTwinKit, createProductConfiguratorKit, createSmartCityKit } from "./ApplicationKits.js";
export type { ArchitectureFrame, ArchitectureKit, ArchitectureKitOptions, ArchitectureSpace, CinematicFrame, CinematicKit, CinematicKitOptions, CinematicShot, CityDataLayer, CityDistrict, ConfiguratorCameraPreset, ConfiguratorFinish, ConfiguratorPart, ConfiguratorVariant, DigitalTwinFrame, DigitalTwinKit, DigitalTwinKitOptions, KitCapabilityReport, ProductConfiguratorFrame, ProductConfiguratorKit, ProductConfiguratorKitOptions, ProductConfiguratorState, SmartCityFrame, SmartCityKit, SmartCityKitOptions, TwinAlarm, TwinEquipment } from "./ApplicationKits.js";
export { assetEvidence, collectAssetEvidence, collectGameAssetEvidence, createAssetEvidenceReport, defineAssetEvidenceReport, evaluateAssetEvidencePublishReadiness } from "./AssetEvidence.js";
export type { AssetEvidenceAssetSummary, AssetEvidenceReport, AssetEvidenceRouteUsage, AssetEvidenceScreenshot, CollectAssetEvidenceInput } from "./AssetEvidence.js";
export { cameraInstructionFromSample, cameraKeyframeFromPreset, createCameraChoreography, createCameraPathFromPreset, sampleCameraChoreography, sampleCameraPath, shotReverseShotCameraPaths } from "./CameraChoreographer.js";
export type { CameraChoreographyArtifact, CameraKeyframe, CameraPath, CameraPathInterpolation, CameraSample, LegacyCameraChoreography } from "./CameraChoreographer.js";
export { addCameraKeyframe, createCameraPathEditorState, moveCameraKeyframe, removeCameraKeyframe, sampleCameraPathEditorPreview } from "./CameraPathEditor.js";
export type { CameraPathEditorState, CameraPathMarker } from "./CameraPathEditor.js";
export { applyCameraPreset, cameraPreset, cameraPresetLibrary, getCameraPreset } from "./CameraPresetLibrary.js";
export type { CameraPreset, CameraPresetId } from "./CameraPresetLibrary.js";
export { characterAssembly, characterAssemblyPart, collectCharacterAssemblyAssets, createCharacterAssemblyPlan, defineCharacterAssemblyPlan, validateCharacterAssemblyPlan } from "./CharacterAssembly.js";
export type { CharacterAssemblyAttachmentRule, CharacterAssemblyGameplayIntent, CharacterAssemblyMaterialOverride, CharacterAssemblyPalette, CharacterAssemblyPart, CharacterAssemblyPartInput, CharacterAssemblyPartRole, CharacterAssemblyPlan, CharacterAssemblySocket, CharacterAssemblyTransform, CharacterAssemblyValidationPolicy, CharacterAssemblyValidationReport, CreateCharacterAssemblyPlanInput } from "./CharacterAssembly.js";
export { upgradeProductionEnvironmentHdri, describeTextureStreamingResidency, resolveProductionPrimitiveScalars, createProductionPrimitiveMaterial, createProductionPrimitiveGeometry, primitiveGeometryBounds } from "./compiler/primitives.js";
export type { TextureStreamingTableEntry } from "./compiler/primitives.js";
export { describeProductionSpotShadow } from "./compiler/shadows.js";
export { createProductionPrimitiveTextureIntent, upgradeProductionPrimitiveTextures, compositeMetallicRoughnessPixels, mipChainBytesCoarseToFine } from "./compiler/textures.js";
export { AURA_DECAL_BUDGET_NOTE, AURA_DECAL_MAX_DECALS, collectDecalBudgetTelemetry, decals, projectDecal, projectDecalIntoBox, projectDecalOntoMesh, resetDecalTelemetry, resolveDecalFadeOpacity } from "./Decals.js";
export type { AuraDecalBudgetTelemetry, AuraDecalDescriptor, AuraDecalFadeOptions, AuraDecalFadeSample, AuraDecalNode, AuraDecalPolygonOffset, AuraDecalProjectOntoMeshOptions, AuraDecalProjectOptions } from "./Decals.js";
export { markAuraLazySystemRequested, markAuraLazySystemLoaded, collectAuraLazySystemEvidence } from "./lazySystemEvidence.js";
export { AURA_PRIMITIVE_AXES, clearFocus, focusCameraIntent, focusObject, focusSemanticRegion } from "./FocusSelection.js";
export type { FocusCameraIntent, FocusIndicator, FocusInvariantReport, FocusOptions, FocusResult, FocusTarget, FocusTargetBounds } from "./FocusSelection.js";
export { createGameAssetReadinessManifest, createGameAssetValidationIssue, createPrimaryGameAssetValidationPolicy, createQuaterniusGameReadyFighterValidationPolicy, defineGameAssetReadinessManifest, evaluateGameAssetAnimationClips, evaluateGameAssetBounds, evaluateGameAssetOrientation, fightingGameAnimationRoles, gameAssetBoundsFromSize, gameAssetValidation, gameAssetValidationContractVersion, isAuraGameModelAssetRef, quaterniusGameReadyFighterValidationContract, validateGameAssetReadiness, validatePrimaryGameAsset, validateQuaterniusGameReadyFighterAsset } from "./GameAssetValidation.js";
export type { CreateGameAssetReadinessManifestOptions, GameAssetAnimationClipReadiness, GameAssetAnimationEvent, GameAssetAnimationPolicy, GameAssetAnimationRole, GameAssetApprovalStatus, GameAssetAxis, GameAssetBounds, GameAssetBoundsPolicy, GameAssetBoundsSource, GameAssetClipRequirement, GameAssetIntendedUse, GameAssetMaterialReadiness, GameAssetModelFormat, GameAssetOrientation, GameAssetOrientationPolicy, GameAssetProvenance, GameAssetReadinessManifest, GameAssetSkeletonReadiness, GameAssetTextureReadiness, GameAssetThumbnail, GameAssetUsageKind, GameAssetValidationCheck, GameAssetValidationContractVersion, GameAssetValidationIssue, GameAssetValidationPolicy, GameAssetValidationReport, GameAssetValidationSeverity, GameAssetValidationStatus, GamePrimaryAssetRole, QuaterniusGameReadyFighterSourceFamily, QuaterniusGameReadyFighterValidationContract } from "./GameAssetValidation.js";
export { CSS2D_OUT_OF_SCOPE, collectLabelTelemetry, labelTelemetryRoleFor, summarizeTextBuckets, tuneLabelCollision } from "./LabelTelemetry.js";
export type { LabelCollisionTuning, LabelTelemetry, LabelTelemetryByRole, LabelTelemetryRole, TextBucketSummary } from "./LabelTelemetry.js";
export { camera } from "./nodes/camera.js";
export { instances } from "./nodes/instances.js";
export { lights } from "./nodes/lights.js";
export { material } from "./nodes/material.js";
export { particles } from "./nodes/particles.js";
export { sceneKits } from "./nodes/sceneKits.js";
export { shadows } from "./nodes/shadows.js";
export { sky } from "./nodes/sky.js";
