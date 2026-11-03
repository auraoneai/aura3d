import type { TemporalHistory } from "./TemporalHistory";
import type { VelocityCoverage } from "./forward/Velocity";
import { collectEnvironmentBackground, collectEnvironmentFog, collectEnvironmentLighting } from "./renderer/Background";
import { applyRendererOwnedStaticBatching, applyRendererOwnedStaticMeshConsolidation, cullExplicitRenderItems, culledCastersReachingView, disposeBatchPlanCacheFor, explicitCullingFrustum, hasNoBatchSensitiveHooks } from "./renderer/CullingBatching";
import { isTrustedBatchExecutionDevice } from "./renderer/BatchExecutionTrust";
import { GaussianSplatColorComposite } from "./GaussianSplatColorComposite";
import { WeightedTransparency, weightedTransparencyState } from "./transparency/WeightedTransparency";
import { rendererDeviceIsLost, subscribeRendererDeviceLost, subscribeRendererDeviceRestored } from "./renderer/DeviceLifecycle";
import { createRendererFrameHooks, toFrameCamera } from "./renderer/FrameGraph";
import type { FrameProjectionMetadata } from "./renderer/FrameGraph";
import type { DepthConvention } from "./DepthConvention";
import { frameContributors, potentiallyActiveFrameContributors, type FrameCamera, type FrameContributorContext, type TransparentQueueItem } from "./contracts/frameGraph";
import {
  assertPrd07RendererOperation, beginPrd07RendererOperation, beginPrd07RendererView,
  disposePrd07RendererAuthority, endPrd07RendererOperation, endPrd07RendererView, preparePrd07RendererView,
  prd07RendererContextSnapshot, prd07RendererLegacyFog, producePrd07RendererContext, registerPrd07RendererContext, takePrd07RendererOperation,
  type Prd07RendererOperation, type Prd07RendererView
} from "./vfx/Prd07RendererBridge";
import { prd07WetnessState } from "./atmosphere/shaders/wetness.glsl";
import { disposePrd07GpuSimsForOwner } from "./vfx/contributors";
import { isTrustedQrFlags, type QrFlags } from "./contracts/core";
import { RendererPostprocessPipeline, collectPostprocess, createPostprocessDiagnostics, defaultPostprocessTargetFormat, postprocessRequiresDepthTexture, validateNativeDofRoute, webgpuAutoExposureRequested, webgpuDepthOfFieldRequested } from "./renderer/PostprocessExecution";
import type { RendererHost } from "./renderer/RendererHost";
import { createRenderer } from "./renderer/RendererFactory";
import { collectItemBounds, isIterable, renderableWorldBounds, sceneFromSource, toMat4 } from "./renderer/RenderShared";
import { RendererShadowOrchestrator, collectForwardShadowMap, collectRendererShadowOptions } from "./renderer/ShadowOrchestration";
import { shadowFrameCamera, type Prd02BridgeFrameCamera } from "./shadows/Prd02ShadowBridge";
import { type RenderSource } from "./contracts/renderSource";
import { createClippingBinding, validateClippingGroup, type ClippingGroupInput, type ClippingScope } from "./ClippingPlanes";
import { assertDepthClippingSupported } from "./DepthPass";
import { beginPackedLoopFrame, createEngineBatchInstanceItem, createEnginePackedBatchItem, expandLogicalBatchItems, hasCombinedDrawIntent, isEngineBatchInstanceItem, isEnginePackedBatchItem, packedLoopMemberFor, transferBatchMembers, transferPackedLoopMember, type PackedLoopFrame } from "./batching/BatchMembers";
import { Bounds3 as SceneBounds3, Camera, DirectionalLight, Light, PerspectiveCamera, PointLight, Scene, SpotLight, TransformNode, identityMat4, invertMat4, multiplyMat4, orthographicMat4, perspectiveMat4, transformPoint, toMathMat4, type Mat4, type Vec3, type SceneNode } from "@aura3d/scene";
import { Frustum, type Ray } from "@aura3d/math";
import { createRenderDevice, type RenderBackendOptions } from "./RenderBackend";
import { type LdrPostprocessPassDescriptor, type NativeWebGPUDofFrame, type RenderDevice, RenderDeviceError, type RenderDeviceDiagnostics, type RenderTarget, type RenderTargetDescriptor, type UniformValue } from "./RenderDevice";
import { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, EnvironmentBackgroundPass, type EnvironmentBackgroundOptions } from "./EnvironmentBackgroundPass";
import { authorizeRendererStaticUnlitPairs, ForwardPass, type EnvironmentLightingOptions, type ForwardEnvironmentFogOptions, type ForwardShadowMapOptions, type RenderItem, type RenderMaterial, type SkinningPaletteBinding, type SelectiveBloomFrame } from "./ForwardPass";
import { CascadedShadowMaps, CascadedShadowPass, shadowCameraFitViewProjectionMatrix } from "./CascadedShadowMaps";
import { type CollectedLight, LightCollector } from "./LightCollector";
import { Geometry, type Bounds3 } from "./Geometry";
import { type MorphTargetDelta } from "./MorphTarget";
import { computeSkinnedGeometryBounds, computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
import { RenderGraph } from "./RenderGraph";
import { resourceDisposalPending } from "./ResourceLifecycle";
import { PostStageTrace, type PostStageTraceSession, type PostStageTraceEvent } from "./renderer/PostStageTrace";
import {
  FrameInspectionTiming, bindFrameInspectionView, closeFrameInspectionView,
  type InspectionGpuTimingSnapshot, type InspectionTimingCapture
} from "./quality/FrameInspectionTiming";
import { RenderPipeline } from "./RenderPipeline";
import { ShaderModule } from "./ShaderModule";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat } from "./VertexFormat";
import { BloomPass, FXAAPass, ToneMappingPass, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, createDepthTextureBinding, depthOfFieldPixels, filmGrainPixels, fusedLdrPostprocessPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, volumetricLightPixels, writePostProcessPixels, type BloomOptions, type ChromaticAberrationOptions, type ColorGradeOptions, type ContactShadowPostProcessOptions, type DepthTextureBinding, type DepthOfFieldOptions, type FXAAOptions, type FilmGrainOptions, type FusedLdrPostProcessPass, type FusedLdrPostProcessScratch, type MotionBlurOptions, type OutlineOptions, type SSAOOptions, type SSROptions, type TAAOptions, type ToneMappingOptions, type VolumetricLightOptions } from "./PostProcessPass";
import { bindRendererSsrProjection, createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics, type RendererPostProcessPassName, type RendererPostProcessPassPlan, type RendererPostprocessPlanDiagnostics, type RendererPostprocessPlanOptions, type RendererPostprocessTargetFormat } from "./RendererPostprocessPlan";
import type { ShaderLibrary } from "./ShaderLibraryCore";
import { ShadowMap, type ShadowFilterKernel, type ShadowMapOptions } from "./ShadowMap";
import { ShadowPass } from "./ShadowPass";
import { Sampler } from "./Sampler";
import { type Texture, type TextureFormat } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import { computeOrthographicCameraFrame, computePerspectiveCameraFrame, type OrthographicCameraFrameOptions, type PerspectiveCameraFrameOptions } from "./CameraFraming";
import { ResolutionGovernor } from "./ResolutionGovernor";
import { frameStatsSlot, type FrameStatsLike } from "./contracts/device";
import { resolveCanvasPixelRatio, watchDevicePixelRatio, type AuraResolutionOptions } from "./renderer/PixelRatio";
import type { AuraQualityTier, AuraQualityTierSettings } from "./contracts/quality";
import { QUALITY_TIERS } from "./contracts/quality";
import { prd11LiveQualityTier, type LiveQualityTierSource } from "./quality/liveTier";
import { MaterialInstance } from "./MaterialInstance";
import { UnlitMaterial } from "./UnlitMaterial";
import { linearizeWebGPUDepthSample, type WebGPULinearDepthProjection } from "./post/WebGPULinearDepth";
import { nativeDofVertexColorSupported, validateWebGPUDepthOfFieldOptions } from "./post/WebGPUDepthOfField";
import type { DofOptions } from "./post/PostGraph";
import type { PostPipelineOptions } from "./contracts/post";
import { materialLobes } from "./contracts/materialLobes";
import { shaderFeaturesFor } from "./contracts/program";
import { featuresForGeometry, materialRoutesToGeneratedProgram, withLiveAlphaCutoff } from "./program/MaterialFeatures";
import { selectShaderFeatureBits } from "./program/FeatureSelect";
import { DEPTH_COVERAGE_FEATURE, PROGRAM_OUTPUT_SRGB_FEATURE } from "./program/ProgramFeatures";
import type { ProgramFeatures } from "./contracts/program";
import { collectWarmupFeatures, ProgramWarmup, type WarmupInput } from "./program/ProgramWarmup";
import { PRD01_FORWARD_TARGET, PRD03_EXPOSURE, beginRendererQrFlagBinding, rendererQrFlags, setRendererQrFlags, withRendererQrFlags, withRendererQrFrameBegin, withRendererQrProofAccess,
  installRendererPostOwner, removeRendererPostOwner, withRendererPostAccess } from "./renderer/FrameGraph";
import { clearTaaHistoryWrites, consumePostV2Presented, consumeTaaHistoryWritten, setSelectiveBloomSkipped } from "./renderer/postSkipped";
import { createSelectiveBloomTarget, selectiveBloomDecline, selectiveBloomRequested, selectiveContributorContract, setSelectiveSignalDrawBuffer, transferUnmergedBloomWeights, type SelectiveBloomTarget } from "./renderer/SelectiveBloom";
import { webgl2DeviceHost } from "./webgl2/Counters";
import { postDiagnostics, type PostDiagnosticSnapshot, type PostDiagnosticToken } from "./renderer/PostDiagnosticsScope";
import { disposeRendererProgramCaches, qrCoreGeneratorOn, qrCoreOutputOn, qrGeneratedProgramsOn, qrMaterialsLobeProgramsOn, rendererOutputPass, rendererProgramCache } from "./renderer/qrSubFlags";
import { resolveCoreOutputPostRoute, withCoreOutputOff, type CoreOutputPostSkipped } from "./renderer/coreOutputPostRoute";
import { applyPrd02EnvironmentUniforms, assertForwardClippingSupported, forwardDrawReplaySafe, forwardPassFeatureAxes, hasForwardDrawHooks, nativeUnlitPrimitiveForGeometry, physicalVertexColorsForGeometry, prd02IblEnvironmentAvailable, selectiveItemsDecline, sortForwardRenderItems, splitForwardItems, type ForwardPassOptions } from "./ForwardPass";
import { PRD02_IBL_FEATURE } from "./contracts/environment";
import { prd02ItemIrradianceBindings, prd02ItemProbeBindings } from "./probes/ProbeBoxProjection";
import { inheritProbeSourceOwner } from "./probes/ProbeSourceOwner";
import { advancedLightingFeatures, advancedLightingItemBinding, type AdvancedLightingFrame } from "./lighting/AdvancedLightingBindings";
import { PhotometricFrameResources, type PhotometricFrameIdentity, type PhotometricFrameLease, type PhotometricProfileIssue } from "./lighting/PhotometricFrameResources";
import type { ProjectedSpotFrameLease, ProjectedSpotResource } from "./lighting/ProjectedSpotBindings";
import type { ProjectedSpotIssue } from "./ForwardPass";
import { withLivePhysicalMapFeatures } from "./materials/PhysicalFeatures";
import { isUnmodifiedDefaultShaderLibrary } from "./renderer/TrustedShaderLibrary";
import { InterleavedTransparentPass } from "./renderer/InterleavedTransparentPass";
import { assertScalarVolumeFrameCurrent, assertScalarVolumeRoute, scalarVolumeTransparentItems, snapshotScalarVolumeDraws, type ScalarVolumeDrawRecord } from "./renderer/ScalarVolumeFrame";
import { drawScalarVolumeOnWebGL2 } from "./webgl2/ScalarVolumeHost";
import { drawScalarVolumeOnWebGPU } from "./webgpu/ScalarVolumePass";
import { isTrustedTransmissionCapturePass, itemReportsTransmissionLobe, prd04TransmissionDiagnostics, releaseTransmissionFrame, releaseTransmissionScope, releaseTransmissionView, type Prd04TransmissionDiagnostics } from "./forward/transmissionTargetStore";
import { setContactShadowMask } from "./forward/contactShadowMaskStore";
import { ensureSceneDepthCopyTarget, SceneDepthCopyPass } from "./renderer/SceneDepthCopyPass";
import { probeHdrTargetFormat, DEFAULT_TONE_MAPPING, type AuraToneMappingOperatorLike, type OutputOverlayUniforms } from "./contracts/output";
import { resolveForwardClusteredLighting } from "./forward/Lighting";
import { assertRendererFeatures, createRendererFeatureReport, type RendererFeature, type RendererFeatureReport } from "./RendererFeatureGates";
import { armFirstFrameGate, notifyFirstFramePresented } from "./environment/FirstFrameGate";
import { batchStaticRenderItems, type StaticBatchOptions, type StaticBatchInput } from "./SceneOptimization";
import { createStaticMeshConsolidationCache, type MeshConsolidationInput, type MeshConsolidationOptions } from "./MeshConsolidation";
import type { DeferredPipeline, NativeDeferredAttachments, NativeDrawingDiagnostics, NativeDrawingOwner, NativeDrawingScene } from "./webgpu/DeferredPipeline";
import type { DeferredProbeLease } from "./webgpu/DeferredProbe";
import type { RenderPass, RenderPassContext } from "./RenderPass";
import type { MeshletPipeline } from "./webgpu/MeshletPipeline";
import type { VisibilityBufferPipeline } from "./webgpu/VisibilityBufferPipeline";
import { assertWarmupActive, waitForWarmup } from "./webgpu/NativePipelineWarmup";
import type { GaussianSplatRenderer } from "./GaussianSplatRenderer";

// A device passed to more than one Renderer remains live until its last owner
// disposes. Per-renderer targets and histories are still released immediately.
const rendererDeviceOwners = new WeakMap<RenderDevice, Set<object>>();
// The newest last owner retains retry responsibility, including for native
// work that becomes pending after an earlier close appeared to complete.
const rendererDeviceDisposalOwners = new WeakMap<RenderDevice, object>();
const rendererDeviceDisposalsInProgress = new WeakSet<RenderDevice>();

// A history's view IDs and authored frame IDs are local to one renderer, not
// globally unique. Claim the whole history, including during construction and
// teardown, without changing standalone TemporalHistory use.
const rendererTemporalHistoryOwners = new WeakMap<TemporalHistory, object>();

function addRendererDeviceOwner(device: RenderDevice, renderer: object): void {
  let owners = rendererDeviceOwners.get(device);
  if (!owners) { owners = new Set(); rendererDeviceOwners.set(device, owners); }
  owners.add(renderer);
}

function removeRendererDeviceOwner(device: RenderDevice, renderer: object): boolean {
  const owners = rendererDeviceOwners.get(device);
  if (!owners || !owners.delete(renderer)) return false;
  if (owners.size > 0) return false;
  rendererDeviceOwners.delete(device);
  return true;
}

function throwRendererFrameCleanupFailures(frameFailure: { readonly error: unknown } | undefined, errors: readonly unknown[]): void {
  if (errors.length === 0) return;
  if (frameFailure) {
    throw new AggregateError([frameFailure.error, ...errors], "Renderer frame and cleanup failed", { cause: frameFailure.error });
  }
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, "Renderer frame cleanup failed", { cause: errors[0] });
}

function withRendererFrameCleanup<T>(action: () => T, cleanup: () => void): T {
  let failure: { readonly error: unknown } | undefined;
  try {
    return action();
  } catch (error) {
    failure = { error };
    throw error;
  } finally {
    try { cleanup(); } catch (error) { throwRendererFrameCleanupFailures(failure, [error]); }
  }
}

function finishRendererFrameCleanup(failure: { readonly error: unknown } | undefined, cleanup: () => void): void {
  // Called from the original async finally blocks, without adding an await turn.
  try { cleanup(); } catch (error) { throwRendererFrameCleanupFailures(failure, [error]); }
}

/** Recover the 90-degree cube-face camera from its supplied view-projection. */
function prd07ProbeCamera(viewProjection: Mat4): FrameCamera {
  // Cube captures use a 90-degree, unit-aspect perspective matrix. Its first
  // two rows equal the view's first two rows and its fourth row is minus the
  // view's third row. Keep those exact rows instead of using the app camera.
  const view = toMat4([
    viewProjection[0], viewProjection[1], -viewProjection[3], 0,
    viewProjection[4], viewProjection[5], -viewProjection[7], 0,
    viewProjection[8], viewProjection[9], -viewProjection[11], 0,
    viewProjection[12], viewProjection[13], -viewProjection[15], 1
  ], "viewMatrix", "PRD07 probe camera");
  const rows = [[view[0], view[4], view[8]], [view[1], view[5], view[9]], [view[2], view[6], view[10]]];
  if (rows.some((row) => Math.abs(Math.hypot(...row) - 1) > 1e-4) ||
      rows.some((row, index) => rows.slice(index + 1).some((other) =>
        Math.abs(row[0]! * other[0]! + row[1]! * other[1]! + row[2]! * other[2]!) > 1e-4))) {
    throw new RenderDeviceError("Managed VFX probe capture requires a 90-degree cube-face camera", "PRD07_PROBE_CAMERA_UNSUPPORTED");
  }
  const inverse = invertMat4(view);
  const position: [number, number, number] = [inverse[12], inverse[13], inverse[14]];
  const camera = toFrameCamera({ viewProjectionMatrix: viewProjection, viewMatrix: view }, viewProjection, position);
  if (!camera) throw new RenderDeviceError("Managed VFX probe camera is unavailable", "PRD07_PROBE_CAMERA_UNSUPPORTED");
  return camera;
}

/**
 * C-05 (PRD-01 §8.4-§8.6): output configuration applied by the OutputPass
 * under `A3D_QR_CORE_OUTPUT`. Flag-off records legacy opaque settings without
 * applying them; an explicit alpha-preserving request fails if no route can
 * honor it.
 */
/** #1140: OutputPass dithering default (three.js parity); `output.dithering` overrides. */
export const DEFAULT_OUTPUT_DITHERING = false;

export interface RendererOutputOptions {
  readonly toneMapping?: AuraToneMappingOperatorLike;
  /** Exposure multiplier (default 1); combined with blackboard `"prd03.exposure"` upstream. */
  readonly exposure?: number;
  readonly outputColorSpace?: "srgb" | "display-p3";
  readonly alphaMode?: "opaque" | "straight" | "premultiplied";
  /**
   * Required for alpha-preserving output. The caller warrants that the
   * OutputPass input is scene-linear, premultiplied RGB with opacity in alpha,
   * including the clear, contributing draws and intermediate stages. A
   * coverage-tagged clear, or the requested output alpha mode, does not
   * establish that warranty.
   */
  readonly inputAlphaMode?: "premultiplied";
  /**
   * Triangular-dither the 8-bit write. Default false (#1140): three.js does not
   * dither by default, and the dither noise alone regressed LPIPS vs three on
   * every promotion scene (L4 run 38156934612). Opt in for banding-prone gradients.
   */
  readonly dithering?: boolean;
  /** R8 coverage attachment + unmapped-background mix (§6.5; default false). */
  readonly backgroundCoverage?: boolean;
  /** C-05 juice overlay; absent = disabled, zero-amounts = bit-identical. */
  readonly overlay?: OutputOverlayUniforms;
}

function validateRendererOutputAlpha(options: RendererOutputOptions): void {
  const { alphaMode, inputAlphaMode } = options;
  if (alphaMode !== undefined && alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
    throw new RenderDeviceError("OUTPUT_ALPHA_MODE_UNSUPPORTED: unsupported output alpha mode", "OUTPUT_ALPHA_MODE_UNSUPPORTED", { alphaMode });
  }
  if (inputAlphaMode !== undefined && inputAlphaMode !== "premultiplied") {
    throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: expected premultiplied scene-linear opacity", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED", { inputAlphaMode });
  }
  if (alphaMode === "straight" || alphaMode === "premultiplied") {
    if (inputAlphaMode !== "premultiplied") {
      throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE: alpha-preserving output requires a premultiplied scene-linear source", "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE");
    }
  } else if (inputAlphaMode !== undefined) {
    throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: opaque output uses the legacy coverage contract", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
  }
}

interface RendererGaussianSplatDraw {
  readonly renderer: GaussianSplatRenderer;
  readonly modelMatrix: Float32Array;
  readonly colorSpace: "srgb_rec709_display" | "lin_rec709_display";
  readonly layerMask?: number;
  readonly frustumCulled?: boolean;
  readonly renderOrder?: number;
  readonly worldBounds?: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
}

function collectGaussianSplatDraws(source: RenderSource | Iterable<RenderItem> | Scene): readonly RendererGaussianSplatDraw[] {
  if (source instanceof Scene || isIterable(source)) return [];
  const draws = (source as RenderSource & { readonly gaussianSplats?: readonly RendererGaussianSplatDraw[] }).gaussianSplats;
  return draws ?? [];
}

/** What the most recent OutputPass invocation actually applied (diagnostics). */
export interface RendererAppliedOutput {
  readonly toneMapping: AuraToneMappingOperatorLike;
  readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto" };
  readonly dithering: boolean;
  readonly targetFormat: "rgba16f" | "rgba8";
  readonly degraded?: "rgba8-no-float-target" | "hdr-msaa-mrt-unsupported" | "hdr-msaa-depth-unsupported";
}

export type RendererDrawingPath = "forward" | "deferred" | "meshlet" | "visibility";
/** Loaded only for an explicitly requested advanced WebGPU path. */
export interface RendererNativeDrawingPipelines {
  readonly DeferredPipeline: typeof import("./webgpu/DeferredPipeline").DeferredPipeline;
  readonly MeshletPipeline: typeof import("./webgpu/MeshletPipeline").MeshletPipeline;
  readonly VisibilityBufferPipeline: typeof import("./webgpu/VisibilityBufferPipeline").VisibilityBufferPipeline;
  readonly nativeDrawingSceneFromRenderItems: typeof import("./webgpu/DeferredPipeline").nativeDrawingSceneFromRenderItems;
  readonly admitNativeDeferredFeatures: typeof import("./renderer/NativeDeferredAdmission").admitNativeDeferredFeatures;
  readonly deferredProbeFromUniforms: typeof import("./webgpu/DeferredProbe").deferredProbeFromUniforms;
}
export interface RendererDrawingPathOptions {
  readonly mode: RendererDrawingPath;
  /** Permit the full forward renderer when the requested path cannot preserve the frame. */
  readonly allowFallback?: boolean;
}
export interface RendererDrawingPathDiagnostics {
  readonly requested: RendererDrawingPath;
  readonly active: RendererDrawingPath;
  readonly fallbackReason?: string;
  readonly drawCalls?: number;
  readonly triangles?: number;
  readonly trianglesAreUpperBound?: boolean;
  readonly computeDispatches?: number;
  readonly submittedMeshlets?: number;
  readonly culledMeshlets?: number;
}

/** Borrowed object-mask inputs from one completed frame, or its unsupported reason. */
export type RendererBenchmarkMaskFrame =
  | { readonly items: readonly RenderItem[]; readonly viewProjectionMatrix: readonly number[]; readonly layerMask?: number }
  | { readonly unsupported: string };

type AdvancedLightingPrepareFrame = (items: readonly RenderItem[], frame: AdvancedLightingFrame, stage: "before-batching" | "after-collect", beforeCollect?: readonly RenderItem[]) => readonly RenderItem[];
const ADVANCED_LIGHTING_PREPARE_FRAME = Symbol.for("a3d.advancedLighting.prepareFrame");

function advancedLightingPrepare(source: RenderSource | Iterable<RenderItem> | Scene): AdvancedLightingPrepareFrame | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  const value = (source as RenderSource & { readonly [ADVANCED_LIGHTING_PREPARE_FRAME]?: unknown })[ADVANCED_LIGHTING_PREPARE_FRAME];
  if (value === undefined) return undefined;
  if (typeof value !== "function") throw new RenderDeviceError("Advanced lighting frame carrier must be callable", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
  return value as AdvancedLightingPrepareFrame;
}

function benchmarkValuesEqual(a: unknown, b: unknown): boolean {
  const aArray = Array.isArray(a) || ArrayBuffer.isView(a);
  const bArray = Array.isArray(b) || ArrayBuffer.isView(b);
  if (!aArray || !bArray) return Object.is(a, b);
  const left = a as ArrayLike<number>, right = b as ArrayLike<number>;
  return left.length === right.length && Array.from(left).every((value, index) => Object.is(value, right[index]));
}

/** Add explicit phase dependencies while retaining the contributor's full pass contract. */
function withGraphDependencies(pass: RenderPass, reads: readonly string[] = [], writes: readonly string[] = []): RenderPass {
  return { name: pass.name, reads: [...pass.reads, ...reads], writes: [...pass.writes, ...writes],
    ...(pass.space ? { space: pass.space } : {}),
    ...(pass.allowReadWriteHazards ? { allowReadWriteHazards: pass.allowReadWriteHazards } : {}),
    execute: context => pass.execute(context),
    ...(pass.executeAsync ? { executeAsync: (context: RenderPassContext) => pass.executeAsync!(context) } : {}) };
}

/** Recheck retained volume records before the graph copies or consumes depth. */
function withScalarVolumeDepthGuard(pass: RenderPass, draws: readonly ScalarVolumeDrawRecord[], device: RenderDevice,
  generation: number | undefined, revoke: () => void): RenderPass {
  return { name: pass.name, reads: pass.reads, writes: pass.writes,
    ...(pass.space ? { space: pass.space } : {}),
    ...(pass.allowReadWriteHazards ? { allowReadWriteHazards: pass.allowReadWriteHazards } : {}),
    execute(context) {
      try { assertScalarVolumeFrameCurrent(draws, device, generation); pass.execute(context); }
      catch (error) { revoke(); throw error; }
    } };
}

/** The compiler's default post bag is one final tone-map/encode pass. Other
 *  effects need their own volume/depth integration and remain unsupported. */
function supportsWebGPUVolumeToneMap(device: RenderDevice, post: RendererPostProcessOptions | undefined): boolean {
  return device.kind === "webgpu" && !!post && Object.keys(post).every(key => key === "targetFormat" || key === "toneMapping" || key === "sampleCount") &&
    (post.targetFormat === undefined || post.targetFormat === "rgba8" || post.targetFormat === "rgba16f") &&
    (post.sampleCount === undefined || post.sampleCount === 1) && !!post.toneMapping && typeof post.toneMapping === "object";
}

/** Freeze the actual submitted bytes, and reject even unmarked CPU-view mutations. */
function benchmarkResourceGuard(items: readonly RenderItem[], device: RenderDevice): () => boolean {
  const generation = device.generation;
  const resources = items.map(item => {
    const geometry = item.geometry;
    const streams = [geometry.vertexBuffer, ...geometry.additionalVertexBuffers].map(buffer => ({ buffer, revision: buffer.revision, bytes: buffer.readBytes() }));
    const index = geometry.indexBuffer;
    const indices = index ? { buffer: index, revision: index.revision, values: index.data.slice() } : null;
    const drawRange = geometry.drawRange ? { ...geometry.drawRange } : undefined;
    const material = item.material;
    const base = material instanceof MaterialInstance ? material.baseMaterial : material;
    const materialState = base ? JSON.stringify(base.renderState) : undefined;
    const shaderKey = base?.shaderKey;
    const parameters = material?.getParameters();
    return { geometry, topology: geometry.topology, streams, indices, drawRange, material, base, materialState, shaderKey, parameters };
  });
  return () => {
    if (device.disposed || device.contextLost || device.generation !== generation) return false;
    try {
      return resources.every(({ geometry, topology, streams, indices, drawRange, material, base, materialState, shaderKey, parameters }) => {
        if (geometry.topology !== topology || geometry.getVertexBuffer(0) !== streams[0]?.buffer || geometry.additionalVertexBuffers.length !== streams.length - 1 ||
            geometry.indexBuffer !== (indices?.buffer ?? null) || geometry.drawRange?.start !== drawRange?.start || geometry.drawRange?.count !== drawRange?.count) return false;
        if (!streams.every(({ buffer, revision, bytes }, index) => {
          if ((index ? geometry.additionalVertexBuffers[index - 1] : geometry.vertexBuffer) !== buffer || buffer.revision !== revision) return false;
          buffer.readBytes(0, 0); // Checks disposal without copying the buffer again.
          return benchmarkValuesEqual(new Uint8Array(buffer.data), bytes);
        })) return false;
        if (indices && (indices.buffer.revision !== indices.revision || !benchmarkValuesEqual(indices.buffer.data, indices.values))) return false;
        if (material && parameters) {
          if (!base || base.disposed || base.shaderKey !== shaderKey || JSON.stringify(base.renderState) !== materialState) return false;
          const current = material.getParameters();
          if (current.size !== parameters.size || [...parameters].some(([name, value]) => !current.has(name) || !benchmarkValuesEqual(value, current.get(name)))) return false;
        }
        return true;
      });
    } catch {
      return false;
    }
  };
}

export interface RendererOptions extends RenderBackendOptions {
  /** Optional WebGPU drawing path; advanced paths fail closed unless fallback is allowed. */
  readonly drawingPath?: RendererDrawingPathOptions;
  readonly width?: number;
  readonly height?: number;
  readonly clearColor?: readonly [number, number, number, number];
  /**
   * C-05 (`A3D_QR_CORE_OUTPUT`): the HDR-target clear — the linear background;
   * in the legacy opaque contract alpha is OutputPass coverage (1 = tone-mapped
   * with the scene, 0 = passed through untouched). For preserving alpha, the
   * caller's `inputAlphaMode` warranty also covers this clear; a compiler's
   * coverage-tagged clear is not proof of premultiplied opacity.
   * Absent → `clearColor` (legacy behaviour).
   */
  readonly outputClearColor?: readonly [number, number, number, number];
  /** C-05 output options (`A3D_QR_CORE_OUTPUT`); see `RendererOutputOptions`. */
  readonly output?: RendererOutputOptions;
  /**
   * §6.9 resolution policy (C-27 consumer surface): pixel-ratio request and
   * the resolution-governor knobs. Absent → legacy DPR behaviour, bit-identical.
   */
  readonly resolution?: AuraResolutionOptions;
  /** Quality tier settings that cap the canvas pixel ratio and floor the governor. */
  readonly qualityTier?: Pick<AuraQualityTierSettings, "maxPixelRatio" | "minRenderScale">;
  /** C-02 warm-then-block tier (default "high") for the generated-program warmup under A3D_QR_CORE. */
  readonly qualityTierName?: AuraQualityTier;
  readonly shaderLibrary?: ShaderLibrary;
  readonly requiredFeatures?: readonly RendererFeature[];
  /**
   * T0-28: this renderer's resolved QR flags (`createAuraApp` passes the app's
   * flags). Bound to the device so two renderers on one page never share
   * state; absent → the module-level `setRendererQrFlags` default (back-compat).
   */
  readonly qrFlags?: QrFlags;
  /** Request measured profile lighting; unsupported draws are reported before fallback. */
  readonly photometricProfiles?: { readonly onUnsupported: (issue: PhotometricProfileIssue) => void };
  /** Optional app-owned projected image resources and unsupported-draw diagnostics. */
  readonly projectedSpotImages?: {
    readonly resolveResource: (asset: unknown) => ProjectedSpotResource<unknown> | undefined;
    readonly onUnsupported: (issue: ProjectedSpotIssue) => void;
  };
}

export interface ResizeToDisplayOptions {
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly devicePixelRatio?: number;
}

export interface ResizeToDisplayResult {
  readonly resized: boolean;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly width: number;
  readonly height: number;
}

export interface RendererAnimationLoop {
  readonly running: boolean;
  stop(): void;
}

export interface RendererFrameInspection {
  readonly frameNumber: number;
  readonly passes: readonly PostStageTraceEvent[];
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly cpuTimeMs: number | null;
  readonly gpuTimeMs: number | null;
  /** Measured per-view intervals; these do not cover the entire render call. */
  readonly gpuViewTiming?: InspectionGpuTimingSnapshot | null;
  /** False until direct, graph, post and backend-specific phases are fully observed. */
  readonly complete: boolean;
}

export interface RendererFrameCapture {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly diagnostics: RenderDeviceDiagnostics;
  readonly capturedAt?: string;
  readonly renderSize?: RendererFrameCaptureRenderSize;
  readonly pixelHash?: string;
  readonly pixelDigest?: RendererFrameCapturePixelDigest;
  readonly pixelStats?: RendererFrameCapturePixelStats;
  readonly diagnosticsSummary?: RendererFrameCaptureDiagnosticsSummary;
  readonly metadata?: RendererFrameCaptureMetadata;
}

export interface RendererFrameCaptureWithMetadata extends RendererFrameCapture {
  readonly capturedAt: string;
  readonly renderSize: RendererFrameCaptureRenderSize;
  readonly pixelHash: string;
  readonly pixelDigest: RendererFrameCapturePixelDigest;
  readonly pixelStats: RendererFrameCapturePixelStats;
  readonly diagnosticsSummary: RendererFrameCaptureDiagnosticsSummary;
  readonly metadata: RendererFrameCaptureMetadata;
}

export interface RendererFrameCaptureRenderSize {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly byteLength: number;
  readonly aspectRatio: number;
}

export interface RendererFrameCapturePixelDigest {
  readonly algorithm: "sha256";
  readonly encoding: "hex";
  readonly source: "rgba8";
  readonly value: string;
  readonly byteLength: number;
}

export interface RendererFrameCapturePixelStats {
  readonly totalPixels: number;
  readonly opaquePixels: number;
  readonly opaqueRatio: number;
  readonly transparentPixels: number;
  readonly transparentRatio: number;
  readonly nonBlankPixels: number;
  readonly nonBlankRatio: number;
  readonly underexposedPixels: number;
  readonly underexposedRatio: number;
  readonly overexposedPixels: number;
  readonly overexposedRatio: number;
  readonly clippedChannelPixels: number;
  readonly clippedChannelRatio: number;
  readonly averageLuminance: number;
  readonly minLuminance: number;
  readonly maxLuminance: number;
  readonly averageAlpha: number;
  readonly averageRgb: readonly [number, number, number];
  readonly thresholds: {
    readonly nonBlankLuminance: number;
    readonly underexposedLuminance: number;
    readonly overexposedLuminance: number;
    readonly clippedChannel: number;
  };
}

export interface RendererFrameCaptureDiagnosticsSummary {
  readonly backend: RenderDevice["kind"];
  readonly renderer: string;
  readonly vendor: string;
  readonly capabilities: readonly string[];
  readonly limitations: readonly string[];
  readonly drawCalls: number;
  readonly resources: {
    readonly buffers: number;
    readonly shaders: number;
    readonly renderTargets?: number;
    readonly textures?: number;
  };
  readonly memoryBytes?: {
    readonly buffers?: number;
    readonly textures?: number;
    readonly approximateGpu?: number;
  };
  readonly scene?: {
    readonly submittedObjects?: number;
    readonly visibleObjects?: number;
    readonly culledObjects?: number;
    readonly frustumTestedObjects?: number;
  };
  readonly postprocess?: {
    readonly passes?: number;
    readonly passNames?: readonly string[];
    readonly targetFormat?: "rgba8" | "rgba16f" | "rgba32f";
    readonly renderTargets?: number;
    readonly textures?: number;
    readonly targetWidth?: number;
    readonly targetHeight?: number;
  };
  readonly contextLost: boolean;
  readonly lastError: string | null;
}

export interface RendererFrameCaptureMetadata {
  readonly capturedAt: string;
  readonly renderSize: RendererFrameCaptureRenderSize;
  readonly pixelHash: string;
  readonly pixelDigest: RendererFrameCapturePixelDigest;
  readonly pixelStats: RendererFrameCapturePixelStats;
  readonly diagnosticsSummary: RendererFrameCaptureDiagnosticsSummary;
}

export type { RenderSource };

type TemporalRenderItem = RenderItem & { readonly temporalObjectKey?: object | string | number | symbol };

interface PendingTemporalView {
  prepared: boolean;
  eligible: boolean;
}

interface PendingAuthoredFrame {
  readonly id: number;
  readonly explicit: boolean;
  readonly generation: number | undefined;
  readonly views: Map<string | number, PendingTemporalView>;
  readonly activeViewIds: Set<string | number>;
  readonly initialViewIds: Set<string | number>;
  completedPasses: number;
  cancelled: boolean;
}

interface RendererNativePostTransactions {
  registerNativePostRenderer(scopeId: object): void;
  unregisterNativePostRenderer(scopeId: object): void;
  beginNativePostAuthoredFrame(scopeId: object, frameId: number): void;
  beginNativePostRendererPass(scopeId: object, frameId: number, viewId: string | number, token: PostDiagnosticToken): void;
  endNativePostRendererPass(scopeId: object, frameId: number): void;
  finishNativePostAuthoredFrame(scopeId: object, frameId: number, completed: boolean): void;
}

export interface RendererInput {
  readonly source: RenderSource | Iterable<RenderItem> | Scene;
  readonly camera?: CameraLike;
  /**
   * threejs-parity L7/SH-06: render into `target` instead of the canvas
   * (three's `setRenderTarget` + `render`). The frame executes at the
   * target's own dimensions; the viewport is restored afterwards.
   */
  readonly target?: RenderTarget;
  /**
   * threejs-parity L7/SC-01: raster viewport in target pixels (three's
   * `setViewport`; origin bottom-left). Defaults to the whole target.
   */
  readonly viewport?: RendererRect;
  /** threejs-parity L7/SC-01: scissor rect (three's `setScissor` + `setScissorTest(true)`); defaults to `viewport` when `viewport` is set. */
  readonly scissor?: RendererRect;
  /**
   * Render independent views into viewport-sized targets, then composite them
   * in order. Later views cover earlier ones where their scissors overlap.
   * Each view has its own depth, camera culling and postprocess history.
   */
  readonly views?: readonly RendererView[];
  /** Reuse the same integer for multiple passes of one authored frame. */
  readonly frameId?: number;
}

export interface RendererPrecompileOptions {
  /** Stop waiting and prevent further native warmup work; already issued GPU compilation cannot be cancelled. */
  readonly signal?: AbortSignal;
}

/** Pixel rect, origin bottom-left (three/WebGL convention); WebGPU converts internally. */
export interface RendererRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RendererView {
  /** Stable across frames; defaults to the view's ordinal. */
  readonly id?: string | number;
  readonly camera: CameraLike;
  readonly viewport: RendererRect;
  readonly scissor?: RendererRect;
  /** Inherit source postprocessing when absent; false disables it for this view. */
  readonly postprocess?: RendererPostProcessOptions | boolean;
  /** Discard this view's temporal history after a deliberate camera cut. */
  readonly cameraCut?: boolean;
  /** World-space eye position for this view's specular/lighting terms. */
  readonly cameraPosition?: readonly [number, number, number];
}

export type RendererCameraPolicy = "identity" | "auto-frame" | "require";

export type RendererCameraProjection = "perspective" | "orthographic";

/**
 * Framing options accepted by auto-frame, spanning both projections.
 *
 * The two projections share every placement option (padding, yaw, pitch,
 * near/far padding) and differ only in how they establish scale: perspective
 * through `fovYRadians`, orthographic through `fitMode`. Keeping them in one
 * type means switching `cameraProjection` does not force the caller to
 * restructure the options object, and the projection-specific key is simply
 * ignored by the projection that has no use for it.
 */
export interface RendererCameraFrameOptions extends PerspectiveCameraFrameOptions, OrthographicCameraFrameOptions {}

export const DEFAULT_RENDERER_AUTO_FRAME_OPTIONS: PerspectiveCameraFrameOptions = {
  paddingRatio: 0.14,
  yawRadians: -0.38,
  pitchRadians: -0.18,
  nearPadding: 0.2,
  farPadding: 2.4
};

export const DEFAULT_RENDERER_DIRECT_LIGHTING = {
  key: {
    color: [1, 0.92, 0.78] as const,
    intensity: 2.25,
    direction: [0.42, -0.58, -0.7] as const
  },
  fill: {
    color: [0.48, 0.62, 0.9] as const,
    intensity: 0.55,
    direction: [-0.35, -0.22, -0.91] as const
  }
} as const;

export interface RendererShadowOptions extends ShadowMapOptions {
  readonly enabled?: boolean;
  readonly light?: Light;
  readonly lightMatrix?: Float32Array | readonly number[];
  readonly strength?: number;
  readonly slopeBias?: number;
  readonly texelSize?: readonly [number, number];
  readonly filterKernel?: ShadowFilterKernel;
  readonly cascadeCount?: number;
  readonly cascadeLambda?: number;
  readonly cascadePadding?: number;
  /** Disable only for stability negative controls; defaults to texel snapping. */
  readonly stabilize?: boolean;
}

export interface RendererPostProcessOptions extends RendererPostprocessPlanOptions {
  readonly targetFormat?: RendererPostprocessTargetFormat;
  readonly sampleCount?: number;
  /**
   * CCR-03-1 (additive): real camera depth range for the legacy chain's
   * depth-gated passes. Forwarded into `presentLdrPostprocess`; when C-08 is
   * real the frame camera's near/far takes precedence.
   */
  readonly depthRange?: { readonly near: number; readonly far: number; readonly projection?: "perspective" | "orthographic" };
  /** C-13 (PR 0a): post pipeline descriptor for the graph path. */
  readonly pipeline?: unknown;
  /** C-13 (PR 0a): post graph v2 opt-in. */
  readonly v2?: boolean;
  /**
   * PRD-03 Phase 3 (additive): the frame camera the v2 HDR stages need
   * (projection + viewProjection + near/far). Bound by the Renderer at
   * submit time; ignored flag-off.
   */
  readonly cameraFrame?: FrameCamera | null;
  /**
   * CCR-03-12 (PRD-03 Phase 6, additive): the pieces of the
   * `FrameContributorContext` a C-13 custom post pass's `enabled()`/
   * `uniforms()` callback may read — `source`, `items`, `sceneDepth`. Bound
   * by the Renderer at submit time alongside `cameraFrame`; ignored
   * flag-off.
   */
  readonly postFrameContext?: {
    readonly source: unknown;
    readonly items: readonly RenderItem[];
    readonly scopeId?: object;
    readonly viewId?: string | number;
    readonly frameId?: number;
    readonly timeSeconds?: number;
    /** Internal renderer/view/frame attribution for post diagnostics. */
    readonly diagnosticToken?: PostDiagnosticToken;
    readonly cameraCut?: boolean;
    /** Device-issued, frame-local depth and coverage proof for native WebGPU DoF. */
    readonly nativeDepthOfFieldFrame?: NativeWebGPUDofFrame;
    readonly sceneDepth: {
      readonly texture: Texture | null;
      readonly available: boolean;
      readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
    };
  } | null;
}

export type RenderResourceLookup<T> = ReadonlyMap<string, T> | Readonly<Record<string, T>>;

export interface RenderCollectionDiagnostics {
  submittedObjects: number;
  visibleObjects: number;
  culledObjects: number;
  frustumTestedObjects: number;
}

export interface RendererPostprocessDiagnostics {
  readonly postprocessPasses: number;
  readonly postprocessPassNames: readonly RendererPostProcessPassName[];
  readonly postprocessTargetFormat: RendererPostprocessTargetFormat;
  readonly postprocessRenderTargets: number;
  readonly postprocessTextures: number;
  readonly postprocessTargetWidth: number;
  readonly postprocessTargetHeight: number;
  readonly postprocessPlan: RendererPostprocessPlanDiagnostics;
}

export interface CameraLike {
  readonly projectionMatrix?: Float32Array | readonly number[];
  readonly viewMatrix?: Float32Array | readonly number[];
  readonly viewProjectionMatrix?: Float32Array | readonly number[];
  readonly projectionMatrixInverse?: Float32Array | readonly number[];
  readonly projectionMetadata?: FrameProjectionMetadata;
  readonly depthConvention?: DepthConvention;
  /**
   * Real view and projection matrices for `material.custom` programs only (their `viewMatrix` /
   * `projectionMatrix` built-ins). A camera that exposes just `viewProjectionMatrix` (the engine app
   * path) would otherwise leave those built-ins at identity, drawing custom vertex stages in NDC.
   * Deliberately NOT used for frame uniforms or shadow selection, so existing scenes are unchanged.
   */
  readonly shaderViewMatrix?: Float32Array | readonly number[];
  readonly shaderProjectionMatrix?: Float32Array | readonly number[];
  /** threejs-parity SR-04: three's `camera.layers` — nodes whose layers do not intersect this mask are absent from the frame. */
  readonly layerMask?: number;
  resize?(width: number, height: number): void;
  updateCameraMatrices?(): void;
}

export interface ScenePickHit {
  readonly node: SceneNode;
  readonly geometry: Geometry;
  readonly distance: number;
  readonly bounds: SceneBounds3;
  readonly hitPoint?: readonly [number, number, number];
  readonly pointIndex?: number;
  readonly instanceIndex?: number;
}

export interface ScenePickOptions {
  readonly pointRadius?: number;
  readonly lineRadius?: number;
}

export { DEFAULT_RENDERER_ENVIRONMENT_LIGHTING } from "./renderer/Background";
// A failed endFrame can leave a lease ineligible for release until a later
// frame on the same device ends. Share the retry queue across device owners.
const pendingProjectedSpotLeases = new WeakMap<RenderDevice, Set<ProjectedSpotFrameLease>>();

// The scene compiler has already materialized these items for this frame. A
// weak association preserves its existing collector API without treating an
// arbitrary user-supplied collector as a replay-safe array. A copied or
// wrapped source is unregistered unless the compiler explicitly transfers it.
const staticBatchFrameItems = new WeakMap<RenderSource, {
  readonly items: readonly RenderItem[];
  readonly collect: () => readonly RenderItem[];
}>();

export class Renderer {
  /** @internal Bind a materialized, compiler-owned frame to the existing collector contract. */
  static bindCompilerFrameItems(source: RenderSource, items: readonly RenderItem[]): void {
    const collect = () => items;
    source.collectRenderItems = collect;
    staticBatchFrameItems.set(source, { items, collect });
  }

  /** @internal Preserve that contract only across the compiler's item-reuse copy. */
  static inheritCompilerFrameItems(source: RenderSource, copy: RenderSource, items: readonly RenderItem[]): void {
    const owned = staticBatchFrameItems.get(source);
    if (owned && source.collectRenderItems === owned.collect && source.renderItems == null && source.scene == null) {
      Renderer.bindCompilerFrameItems(copy, items);
    }
  }

  public readonly device: RenderDevice;
  private readonly ownedQrFlags: QrFlags | undefined;
  private readonly graph = new RenderGraph();
  private weightedTransparency?: WeightedTransparency;
  private lastTransparency: { readonly mode: "weighted" | "sorted" | "failed"; readonly reason?: string } | null = null;
  /** The most recent explicit weighted request; a declined group reports sorted. */
  get transparencyDiagnostics(): Readonly<{ readonly mode: "weighted" | "sorted" | "failed"; readonly reason?: string }> | null {
    return this.lastTransparency;
  }
  private readonly frameTrace = new PostStageTrace();
  private readonly inspectionTiming = new FrameInspectionTiming();
  private readonly inspectionTimingByTrace = new WeakMap<PostStageTraceSession, InspectionTimingCapture>();
  private readonly inspectionHistory: { readonly inspection: RendererFrameInspection; readonly timing: InspectionTimingCapture }[] = [];
  private activeFrameTrace: PostStageTraceSession | null = null;
  private lastFrameInspection: RendererFrameInspection | null = null;
  private lastInspectionTiming: InspectionTimingCapture | null = null;
  private readonly shaderLibrary: ShaderLibrary;
  private readonly host: RendererHost;
  /**
   * Depth target reused by the renderer-owned shadow pass across frames.
   *
   * A new `ShadowPass` is constructed per frame, so letting the pass own its target reallocated
   * textures and re-ran `checkFramebufferStatus` every frame. Keyed by size so a shadow-size change
   * still reallocates exactly once.
   */
  private shadowDepthTarget: RenderTarget | null = null;
  private lastShadowEvidence: Record<string, unknown> | null = null;
  private submittedShadowFrameId = 0;
  /** Actual shadow resources selected for the most recent submitted forward pass. */
  getShadowEvidence(): Readonly<Record<string, unknown>> | null { return this.lastShadowEvidence; }
  /**
   * Forward-color target reused by the postprocess path across frames.
   *
   * This was allocated fresh inside every `render()` call and pushed onto `ownedTargets`, which
   * disposes it at end of frame. Creating a render target allocates textures and runs
   * `checkFramebufferStatus` — both synchronous GPU operations — so an animating postprocess route
   * paid a full target build-and-teardown every frame.
   */
  private forwardColorTarget: { readonly target: RenderTarget; readonly key: string } | null = null;
  private selectiveBloomTarget: (SelectiveBloomTarget & { readonly key: string }) | null = null;
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  private width: number;
  private height: number;
  private clearColor: readonly [number, number, number, number];
  private readonly outputClearColor: readonly [number, number, number, number] | undefined;
  private directLinearClearValid = true;
  private disposed = false;
  private disposalInProgress = false;
  private retiredDeviceCleanupOwner = false;
  private readonly deviceDisposalOwner = {};
  private deviceDisposalVersion = 0;
  private deviceCompletionFailed = false;
  private deviceCompletionPending = false;
  private particleCleanupPending = false;
  private particleCleanupInProgress = false;
  private readonly drawingPathOptions: RendererDrawingPathOptions;
  private readonly nativeDrawingPipelines?: RendererNativeDrawingPipelines;
  private lastDrawingPath: RendererDrawingPathDiagnostics | null = null;
  private lastBenchmarkMaskFrame: RendererBenchmarkMaskFrame | null = null;
  private readonly transmissionViews = new Map<string | number, { readonly frameId: number; readonly diagnostics: Prd04TransmissionDiagnostics }>();
  transmissionDiagnostics(): readonly Prd04TransmissionDiagnostics[] {
    return [...this.transmissionViews.values()].filter(entry => entry.frameId === this.authoredFrameId)
      .map(({ diagnostics }) => ({ ...diagnostics, issues: [...diagnostics.issues] }));
  }
  private failTransmissionDiagnostics(): void {
    for (const [view, entry] of this.transmissionViews) {
      this.transmissionViews.set(view, { ...entry, diagnostics: { ...entry.diagnostics, targetActive: false, mipCount: 0 } });
    }
  }
  private benchmarkMaskArmed = false;
  private benchmarkMaskResourcesValid: (() => boolean) | null = null;
  /** Internal benchmark observation; geometry and materials remain renderer-owned. */
  benchmarkMaskFrame(): RendererBenchmarkMaskFrame | null {
    if (this.disposed || this.device.disposed || this.device.contextLost || (this.benchmarkMaskResourcesValid && !this.benchmarkMaskResourcesValid())) {
      this.lastBenchmarkMaskFrame = null;
      this.benchmarkMaskResourcesValid = null;
    }
    return this.lastBenchmarkMaskFrame;
  }
  /** Snapshot collection is opt-in because it copies the submitted geometry. */
  armBenchmarkMaskFrame(): () => void {
    this.assertAlive();
    if (this.benchmarkMaskArmed) throw new Error("BENCHMARK_FRAME_BUSY");
    this.benchmarkMaskArmed = true;
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
    let armed = true;
    return () => {
      if (!armed) return;
      armed = false;
      this.benchmarkMaskArmed = false;
      this.lastBenchmarkMaskFrame = null;
      this.benchmarkMaskResourcesValid = null;
    };
  }
  invalidateBenchmarkMaskFrame(): void {
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
  }
  private nativeDrawingPipeline: { readonly key: string; readonly generation: number; readonly pipeline: DeferredPipeline | MeshletPipeline | VisibilityBufferPipeline } | null = null;
  private readonly retiredNativeDrawingOwners = new Map<NativeDrawingOwner, () => void>();
  private readonly nativeDrawingRetirementWaiters = new Set<() => void>();
  private readonly nativeDrawingLossCleanupFailures: unknown[] = [];
  private readonly precompileControllers = new Set<AbortController>();
  private nativeDrawingWarmup: Promise<void> | null = null;
  /** Actual path used by the most recently submitted frame. */
  get drawingPathDiagnostics(): RendererDrawingPathDiagnostics | null { return this.lastDrawingPath; }
  private animationLoop: RendererAnimationLoopImpl | null = null;
  private readonly fusedLdrPostprocessScratch: FusedLdrPostProcessScratch = {};
  // §6.9 resolution policy state (present only when `options.resolution` is set).
  private readonly resolutionOptions?: AuraResolutionOptions;
  private readonly qualityTier?: Pick<AuraQualityTierSettings, "maxPixelRatio" | "minRenderScale">;
  private readonly qualityTierName?: AuraQualityTier;
  private programWarmup?: ProgramWarmup;
  /** C-05 state: requested output options, the resolved HDR scene target, and the depth copy. */
  private outputOptions: RendererOutputOptions;
  private hdrSceneTarget: { readonly target: RenderTarget; readonly key: string } | null = null;
  private hdrMsaaMrtDegraded = false;
  private hdrMsaaDepthDegraded = false;
  private sceneDepthCopyTarget: RenderTarget | null = null;
  private lastAppliedOutput: RendererAppliedOutput | null = null;
  /** T0-07: C-36-shaped record of the last legacy postprocess chain skipped
   *  under A3D_QR_CORE_OUTPUT (`null` when nothing was skipped). Read by the
   *  engine's C-31 `output.postSkipped` section; routing through PostGraph v2
   *  is lane 03's Q-03-2/Q-03-3. */
  private lastPostSkipped: CoreOutputPostSkipped | null = null;
  get postSkipped(): CoreOutputPostSkipped | null {
    return this.lastPostSkipped;
  }
  /** False when this renderer's flags pin the HDR-target/OutputPass route off (the direct canvas path). */
  get outputPathActive(): boolean {
    return qrCoreOutputOn(rendererQrFlags(this.device));
  }
  private resolutionGovernor?: ResolutionGovernor;
  private renderScaleCeiling = 1;
  private readonly unsubscribeDprWatch?: () => void;
  /** C-28 FrameStats feeding the governor (intervalMs until lane 11's gpuMs lands). */
  private readonly frameStatsMonitor?: FrameStatsLike;
  /** PRD-02 S12: private graph for `renderProbeFace` (never the main frame graph). */
  private probeGraph?: RenderGraph;
  private readonly photometricProfiles?: RendererOptions["photometricProfiles"];
  private photometricResources?: PhotometricFrameResources;
  private readonly projectedSpotImages?: RendererOptions["projectedSpotImages"];
  /**
   * Takes exclusive renderer ownership of `temporalHistory` until disposal and
   * any in-flight frame cleanup finish. Use a separate history per renderer.
   */
  constructor(device: RenderDevice, options: RendererOptions & { readonly shaderLibrary: ShaderLibrary; readonly nativeDrawingPipelines?: RendererNativeDrawingPipelines }, temporalHistory: TemporalHistory) {
    if (rendererTemporalHistoryOwners.has(temporalHistory)) {
      throw new RenderDeviceError("TemporalHistory is already owned by another renderer", "TEMPORAL_HISTORY_IN_USE");
    }
    rendererTemporalHistoryOwners.set(temporalHistory, this.viewScopeId);
    let constructionComplete = false;
    let lossDuringConstruction = false;
    let nativePost: RendererNativePostTransactions | undefined;
    let nativePostOwnerInstalled = false;
    let deviceOwnerAdded = false;
    try {
    this.device = device;
    validateRendererOutputAlpha(options.output ?? {});
    if (rendererDeviceDisposalsInProgress.has(device)) {
      throw new RenderDeviceError("Cannot attach a renderer during device disposal", "RENDERER_DEVICE_DISPOSAL_BUSY");
    }
    if (options.photometricProfiles !== undefined && (!options.photometricProfiles || typeof options.photometricProfiles.onUnsupported !== "function")) {
      throw new TypeError("Photometric profiles require an unsupported-draw diagnostic callback");
    }
    this.photometricProfiles = options.photometricProfiles;
    if (options.projectedSpotImages !== undefined && (!options.projectedSpotImages ||
        typeof options.projectedSpotImages.resolveResource !== "function" || typeof options.projectedSpotImages.onUnsupported !== "function")) {
      throw new TypeError("Projected spot images require a resource resolver and unsupported-draw diagnostic callback");
    }
    this.projectedSpotImages = options.projectedSpotImages;
    this.ownedQrFlags = options.qrFlags;
    this.drawingPathOptions = options.drawingPath ?? { mode: "forward" };
    if (!["forward", "deferred", "meshlet", "visibility"].includes(this.drawingPathOptions.mode)) {
      throw new RenderDeviceError("Unknown renderer drawing path.", "INVALID_DRAWING_PATH", { mode: this.drawingPathOptions.mode });
    }
    if (this.drawingPathOptions.allowFallback !== undefined && typeof this.drawingPathOptions.allowFallback !== "boolean") {
      throw new RenderDeviceError("Renderer drawing-path allowFallback must be boolean.", "INVALID_DRAWING_PATH");
    }
    this.nativeDrawingPipelines = options.nativeDrawingPipelines;
    if (this.drawingPathOptions.mode !== "forward" && !this.nativeDrawingPipelines) {
      throw new RenderDeviceError("Advanced drawing pipelines have not been loaded; construct the renderer through Renderer.create.", "NATIVE_DRAW_PATH_NOT_LOADED");
    }
    armFirstFrameGate();
    if (options.qrFlags) setRendererQrFlags(options.qrFlags, device);
    this.temporalHistory = temporalHistory;
    this.unsubscribeTemporalDeviceLoss = (device as RenderDevice & {onDeviceLost?: (listener: () => void) => () => void}).onDeviceLost?.(() => {
      if (this.disposed || rendererTemporalHistoryOwners.get(temporalHistory) !== this.viewScopeId) return;
      if (!constructionComplete) { lossDuringConstruction = true; return; }
      this.releaseLostDeviceResources();
    });
    this.canvas = options.canvas;
    this.width = options.width ?? inferInitialCanvasDimension(options.canvas, "width");
    this.height = options.height ?? inferInitialCanvasDimension(options.canvas, "height");
    this.clearColor = options.clearColor ?? [0, 0, 0, 1];
    this.outputClearColor = options.outputClearColor;
    this.outputOptions = options.output ?? {};
    this.shaderLibrary = options.shaderLibrary;
    this.host = {
      device,
      shaderLibrary: options.shaderLibrary,
      fusedLdrPostprocessScratch: this.fusedLdrPostprocessScratch,
      frameIndex: 0
    } as unknown as RendererHost;
    const host = this.host;
    Object.defineProperty(host, "width", { enumerable: true, get: () => this.width, set: (value: number) => { this.width = value; } });
    Object.defineProperty(host, "height", { enumerable: true, get: () => this.height, set: (value: number) => { this.height = value; } });
    Object.defineProperty(host, "shadowDepthTarget", { enumerable: true, get: () => this.shadowDepthTarget, set: (value: RenderTarget | null) => { this.shadowDepthTarget = value; } });
    this.host.post = new RendererPostprocessPipeline(this.host);
    this.host.shadows = new RendererShadowOrchestrator(this.host);
    this.resolutionOptions = options.resolution;
    this.qualityTier = options.qualityTier;
    this.qualityTierName = options.qualityTierName;
    if (options.resolution !== undefined && options.resolution.dynamic !== false) {
      this.resolutionGovernor = new ResolutionGovernor({
        targetFrameMs: options.resolution.targetFrameMs ?? 16.7,
        minRenderScale: options.resolution.minRenderScale ?? options.qualityTier?.minRenderScale ?? 0.5,
        maxRenderScale: 1,
        devicePixelRatio: typeof globalThis !== "undefined" ? globalThis.devicePixelRatio : undefined,
        allowSubCssResolution: options.resolution.allowSubCssResolution
      });
      // C-28 slot: the default impl is a real FrameStats (gpuMs stays null
      // until prd11's timer queries land); flags would pick prd11's provider.
      this.frameStatsMonitor = frameStatsSlot.get({ values: {}, on: () => false })(240);
    }
    // §6.9: re-evaluate the canvas pixel ratio when the display DPR changes.
    this.unsubscribeDprWatch = options.resolution !== undefined && this.canvas
      ? watchDevicePixelRatio(() => {
          if (this.disposed) return;
          try { this.resizeToDisplay(); } catch { /* keep the current backing size on transient reads */ }
        })
      : undefined;
    this.resizeCanvas(this.width, this.height);
    if (device.kind === "mock" || device.kind === "webgl2") this.releaseTemporalTransferTracker = temporalHistory.retainRendererDevice(device);
    nativePost = this.nativePostTransactions();
    if (nativePost) {
      installRendererPostOwner(device, this.viewScopeId, this.#nativePostOwner);
      nativePostOwnerInstalled = true;
      const post = nativePost;
      withRendererPostAccess(device, this.viewScopeId, this.#nativePostOwner, "register", undefined, undefined, undefined,
        () => post.registerNativePostRenderer(this.viewScopeId));
      this.#nativePostRegistered = true;
    }
    addRendererDeviceOwner(device, this);
    deviceOwnerAdded = true;
    constructionComplete = true;
    if (lossDuringConstruction) this.releaseLostDeviceResources();
    } catch (error) {
      // No failed constructor may leave a callback able to retire a later
      // owner's history, even if the underlying unsubscribe itself fails.
      this.disposed = true;
      try { this.unsubscribeTemporalDeviceLoss?.(); } catch { /* Preserve the construction error. */ }
      try { this.unsubscribeDprWatch?.(); } catch { /* Preserve the construction error. */ }
      try { this.releaseTemporalTransferTracker?.(); } catch { /* Preserve the construction error. */ }
      if (nativePostOwnerInstalled) {
        const post = nativePost;
        try {
          if (post) withRendererPostAccess(device, this.viewScopeId, this.#nativePostOwner, "unregister", undefined, undefined, undefined,
            () => post.unregisterNativePostRenderer(this.viewScopeId));
        } catch { /* Registration may have failed before installing its scope. */ }
        this.#nativePostRegistered = false;
        removeRendererPostOwner(device, this.viewScopeId, this.#nativePostOwner);
      }
      if (deviceOwnerAdded) removeRendererDeviceOwner(device, this);
      if (rendererTemporalHistoryOwners.get(temporalHistory) === this.viewScopeId) rendererTemporalHistoryOwners.delete(temporalHistory);
      throw error;
    }
  }
  static create(options: RendererOptions = {}): Promise<Renderer> {
    return createRenderer(options);
  }

  /** C-28 monitor (PRD-01 Phase 6): lane capture reads cpuSubmitMs percentiles. */
  get frameStats(): FrameStatsLike | undefined {
    return this.frameStatsMonitor;
  }

  /**
   * PRD-02 S12 (lane-01 half): render `source` into one reflection-probe face.
   * Signature matches `ReflectionFaceRenderer` (probes/ReflectionProbeSystem.ts)
   * so it can be passed straight to the probe system:
   *   new ReflectionProbeSystem(..., (face, target, vp) => renderer.renderProbeFace(scene, face, target, vp))
   * - `target` may be any size (128/256 px faces): the probe frame is sized to
   *   it, so RENDER_TARGET_VIEWPORT_MISMATCH does not apply.
   * - Call it OUTSIDE a frame (before `render`): it opens and closes its own
   *   device frame and throws FRAME_ALREADY_ACTIVE if one is open (no nesting).
   * - It uses a private RenderGraph, so the main frame's graph is not cleared.
   * - Linear output, scene lights + environment, no shadows / post / output
   *   encode / frame contributors (a probe is radiance input to shading).
   * Flag-independent; nothing calls it unless a probe system does.
   */
  renderProbeFace(source: RenderSource | Iterable<RenderItem> | Scene, face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Float32Array | readonly number[]): RenderDeviceDiagnostics {
    const { operation, owned } = takePrd07RendererOperation(this);
    const restoreFlags = this.bindPrd07OperationFlags(operation, owned, true);
    let prd07View: Prd07RendererView | undefined;
    try {
    prd07View = beginPrd07RendererView(operation, `probe:${face}`, this.authoredFrameId);
    if (target.disposed) {
      throw new RenderDeviceError("Probe face target is disposed", "RENDER_TARGET_DISPOSED", { face });
    }
    const vp = toMat4(viewProjection, "viewProjection", `probe face ${face}`);
    sceneFromSource(source)?.updateWorldTransforms();
    const items = collectRenderItems(source, vp).filter((item) => !item.environmentCube);
    const frameCamera = prd07View ? prd07ProbeCamera(vp) : null;
    preparePrd07RendererView(prd07View, frameCamera, rendererQrFlags(this.device));
    const hooks = prd07View ? createRendererFrameHooks({ device: this.device, source, camera: frameCamera,
      width: target.width, height: target.height, frameIndex: this.authoredFrameId, viewId: `probe:${face}`,
      postScopeId: this.viewScopeId, onContext: (context) => registerPrd07RendererContext(prd07View, context) }) : undefined;
    const frameContext = hooks?.frameContext(items);
    if (frameContext) producePrd07RendererContext(prd07View, frameContext);
    const photometricFrame = this.photometricFrame(`probe:${face}`);
    const projectedSpotFrame = this.projectedSpotFrame(`probe:${face}`);
    const shared: ForwardPassOptions = {
      items,
      photometricFrame,
      projectedSpotFrame,
      lights: collectRenderLights(source),
      environmentLighting: withRendererQrFlags(this.device, () => collectEnvironmentLighting(source)),
      environmentFog: prd07View && rendererQrFlags(this.device).on("A3D_QR_VFX_FOG")
        ? prd07RendererLegacyFog(prd07View, frameCamera) : collectEnvironmentFog(source),
      cameraViewProjectionMatrix: vp,
      ...(frameContext ? { frameContext, cameraPosition: frameCamera?.position } : {}),
      outputColorSpace: "linear",
      qualityTier: this.liveQualityTier()?.settings
    };
    const graph = (this.probeGraph ??= new RenderGraph());
    graph.clear();
    // Probe faces have no transmission capture or opaque-phase consumers, so
    // one forward queue preserves renderOrder without a phase barrier.
    graph.addPass(new ForwardPass({ ...shared, framePass: { name: "prd01.probe.opaque", writes: ["aura.probe.color"] } }));
    const previous = this.device.getRenderTarget?.() ?? null;
    this.device.beginFrame(target.width, target.height);
    const packedLoopFrame = beginPackedLoopFrame(this.device);
    try {
      this.device.setRenderTarget(target);
      this.device.clear(this.clearColor);
      graph.execute({ device: this.device, width: target.width, height: target.height });
    } finally {
      try {
        try { this.device.setRenderTarget(previous); } finally { this.device.endFrame(); }
      } finally {
        try { this.finishPhotometricFrame(photometricFrame); }
        finally { try { this.finishProjectedSpotFrame(projectedSpotFrame); } finally { this.finishPackedLoopFrame(packedLoopFrame); } }
        graph.clear();
      }
    }
    return this.device.getDiagnostics();
    } finally {
      endPrd07RendererView(prd07View);
      restoreFlags();
      if (owned) endPrd07RendererOperation(operation);
    }
  }

  /**
   * threejs-parity L7/SR-07: `renderer.precompile` — compiles (and awaits) the
   * generated programs a source needs before first render, without submitting
   * a frame. Returns the number of programs this call compiled and wall time.
   */
  async precompile(
    sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
    camera?: CameraLike,
    options: RendererPrecompileOptions = {}
  ): Promise<{ readonly compiledPrograms: number; readonly durationMs: number }> {
    this.assertAlive();
    assertWarmupActive([options.signal]);
    const controller = new AbortController();
    const abort = (): void => controller.abort(options.signal?.reason);
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    this.precompileControllers.add(controller);
    let operation: Prd07RendererOperation | undefined;
    let restoreFlags: (() => void) | undefined;
    try {
      assertWarmupActive([controller.signal]);
      operation = beginPrd07RendererOperation(this);
      restoreFlags = this.bindPrd07OperationFlags(operation, true, true);
      return await this.precompileWithPrd07Operation(sourceOrInput, camera, operation, controller.signal);
    } finally {
      options.signal?.removeEventListener("abort", abort);
      this.precompileControllers.delete(controller);
      restoreFlags?.();
      endPrd07RendererOperation(operation);
    }
  }

  private async precompileWithPrd07Operation(
    sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
    camera: CameraLike | undefined,
    operation: Prd07RendererOperation | undefined,
    signal: AbortSignal
  ): Promise<{ readonly compiledPrograms: number; readonly durationMs: number }> {
    assertWarmupActive([signal]);
    const generation = this.device.generation;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    const beforeDiagnostics = this.device.getDiagnostics();
    // Some backends expose a cumulative compile counter; others expose the
    // number of live shader programs. Both can measure this warmup, unlike a
    // missing counter defaulted to zero before and after compilation.
    const before = beforeDiagnostics.programCompileCount ?? beforeDiagnostics.shaders;
    const views = collectRendererViews(sourceOrInput);
    const normalized = normalizeRendererInput(sourceOrInput, camera);
    if (advancedLightingPrepare(normalized.source)) {
      throw new RenderDeviceError("Advanced lighting precompile requires a live frame and view", "ADVANCED_LIGHTING_PRECOMPILE_UNAVAILABLE");
    }
    // Preflight every view before invoking a source collector or warming any
    // program. A later unsupported view must not leave an earlier view partly
    // compiled. Capture the updated camera and its culling frustum now because
    // multiple views may reuse the same mutable camera with different sizes.
    const checkedViews = views?.map((view) => {
      assertWarmupActive([signal]);
      sceneFromSource(normalized.source)?.updateWorldTransforms();
      const resolved = resolveCamera(normalized.source, view.camera, view.viewport, { allowSceneCamera: true });
      this.assertSupportedCameraDepth(resolved);
      return {
        resolved,
        frameCamera: toFrameCamera(resolved, resolved?.viewProjectionMatrix, resolved?.cameraPosition),
        frustum: resolved?.camera?.frustum.clone()
      };
    });
    // A generator or collecting callback may produce a one-shot iterable.
    // Snapshot it once so later cameras warm their own visible materials too.
    const sharedSource = views ? snapshotRendererSource(normalized.source) : normalized.source;
    const cullingFrustums = checkedViews?.map(({ resolved, frustum }) =>
      frustum ?? matrixViewSceneFrustum(sharedSource, resolved));
    const inputs = views ? views.map((view) => viewFrameInput({ source: sharedSource }, camera, view)) : [normalized];
    for (let index = 0; index < inputs.length; index += 1) {
      assertWarmupActive([signal]);
      const viewId = views ? viewHistoryId(views[index]?.id ?? index) : "single";
      const prd07View = beginPrd07RendererView(operation, viewId, this.authoredFrameId);
      try {
      const { source, camera: inputCamera } = inputs[index]!;
      sceneFromSource(source)?.updateWorldTransforms();
      const viewport = views?.[index]?.viewport;
      const checkedView = checkedViews?.[index];
      const resolvedCamera = checkedView ? checkedView.resolved : resolveCamera(source, inputCamera, viewport ?? { width: this.width, height: this.height }, { allowSceneCamera: true });
      this.assertSupportedCameraDepth(resolvedCamera);
      const cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
      const collected = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera, false, resolvedCamera?.layerMask, this, undefined, rendererQrFlags(this.device), this.device, cullingFrustums?.[index]);
      assertWarmupActive([signal]);
      const frameCamera = checkedView
        ? checkedView.frameCamera && { ...checkedView.frameCamera, position: collectSourceCameraPosition(source) ?? checkedView.frameCamera.position }
        : toFrameCamera(resolvedCamera, cameraViewProjection, collectSourceCameraPosition(source) ?? resolvedCamera?.cameraPosition);
      preparePrd07RendererView(prd07View, frameCamera, rendererQrFlags(this.device));
      const hooks = prd07View ? createRendererFrameHooks({ device: this.device, source, camera: frameCamera,
        width: viewport?.width ?? this.width, height: viewport?.height ?? this.height,
        frameIndex: this.authoredFrameId, viewId, postScopeId: this.viewScopeId,
        onContext: (context) => registerPrd07RendererContext(prd07View, context) }) : undefined;
      const frameContext = hooks?.frameContext(collected.items);
      if (frameContext) producePrd07RendererContext(prd07View, frameContext);
      this.warmOutputSrgb = this.frameOutputsSrgb(source);
      await waitForWarmup(this.warmGeneratedPrograms(
        collected.items,
        collectRenderLights(source),
        withRendererQrFlags(this.device, () => collectEnvironmentLighting(source)),
        prd07View && rendererQrFlags(this.device).on("A3D_QR_VFX_FOG")
          ? prd07RendererLegacyFog(prd07View, frameCamera) : collectEnvironmentFog(source),
        collectForwardShadowMap(source),
        cameraViewProjection,
        collectRendererShadowOptions(source),
        sourceMayClip(source),
        frameContext,
        false,
        signal
      ), [signal]);
      if (operation) assertPrd07RendererOperation(operation);
      } finally { endPrd07RendererView(prd07View); }
    }
    assertWarmupActive([signal]);
    if (this.device.contextLost || this.device.generation !== generation) throw new RenderDeviceError("Device changed during precompile", "DEVICE_LOST");
    // App-managed frames need contributor collection before native admission;
    // do not speculate about their native pipeline identity here.
    if (!operation) await this.warmNativeDrawingForPrecompile(sourceOrInput, normalized.source, views, generation, signal);
    assertWarmupActive([signal]);
    if (operation) assertPrd07RendererOperation(operation);
    const afterDiagnostics = this.device.getDiagnostics();
    const after = beforeDiagnostics.programCompileCount === undefined
      ? afterDiagnostics.shaders
      : afterDiagnostics.programCompileCount ?? before;
    return {
      compiledPrograms: Math.max(0, after - before),
      durationMs: (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt
    };
  }

  /** C-28 (#91): run `fn` under the frameStats "post" scope when a monitor exists. */
  private scopePost<T>(fn: () => T): T {
    return this.frameStatsMonitor ? this.frameStatsMonitor.scope("post", fn) : fn();
  }

  /** C-05: current output configuration (`app.setOutput` / `renderer.output` seam). */
  get output(): RendererOutputOptions {
    return this.outputOptions;
  }

  /** C-05: merge output options; takes effect on the next frame under `A3D_QR_CORE_OUTPUT`. */
  setOutput(options: Partial<RendererOutputOptions>): void {
    if (options.outputColorSpace !== undefined && options.outputColorSpace !== "srgb" && options.outputColorSpace !== "display-p3") {
      throw new RenderDeviceError("Unsupported output color space", "OUTPUT_COLOR_SPACE_UNSUPPORTED", { outputColorSpace: options.outputColorSpace });
    }
    const next = { ...this.outputOptions, ...options };
    validateRendererOutputAlpha(next);
    if (options.alphaMode !== undefined) {
      const active = this.device.getPresentationAlphaMode?.();
      if (active !== undefined && active !== options.alphaMode) {
        throw new RenderDeviceError("Output alpha mode differs from the existing canvas", "OUTPUT_ALPHA_MODE_UNAVAILABLE", { requested: options.alphaMode, active });
      }
    }
    this.outputOptions = next;
  }

  /** Do not silently discard a renderer-level alpha warranty on a different output route. */
  private assertOutputAlphaRoute(postprocess: RendererPostProcessOptions | undefined, qrOutput: boolean): void {
    validateRendererOutputAlpha(this.outputOptions);
    const alphaMode = this.outputOptions.alphaMode;
    if (alphaMode !== "straight" && alphaMode !== "premultiplied") return;
    if (!postprocess) {
      if (!qrOutput) throw new RenderDeviceError("OUTPUT_ALPHA_MODE_UNAVAILABLE: alpha-preserving renderer output requires OutputPass", "OUTPUT_ALPHA_MODE_UNAVAILABLE");
      return;
    }
    const pipeline = postprocess.pipeline && typeof postprocess.pipeline === "object"
      ? postprocess.pipeline as Partial<PostPipelineOptions> : undefined;
    if (postprocess.v2 !== true || !pipeline || pipeline.alphaMode !== alphaMode || pipeline.inputAlphaMode !== this.outputOptions.inputAlphaMode) {
      throw new RenderDeviceError("POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE: the post chain must explicitly declare the renderer's alpha policy and input warranty", "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE");
    }
  }

  /** C-05: install/replace the juice overlay (pass `null` to clear). */
  setOutputOverlay(overlay: OutputOverlayUniforms | null): void {
    this.outputOptions = { ...this.outputOptions, overlay: overlay ?? undefined };
  }

  /** What the last OutputPass call actually applied (C-05 diagnostics; null flag-off). */
  get appliedOutput(): RendererAppliedOutput | null {
    return this.lastAppliedOutput;
  }

  getFeatureReport(): RendererFeatureReport {
    return createRendererFeatureReport(this.device);
  }

  /** C-29 seam (PR 0b): renderer-side device-lifecycle delegates. */
  onDeviceLost(listener: () => void): () => void {
    return subscribeRendererDeviceLost(this.device, listener);
  }

  onDeviceRestored(listener: () => void): () => void {
    return subscribeRendererDeviceRestored(this.device, listener);
  }

  isDeviceLost(): boolean {
    return rendererDeviceIsLost(this.device);
  }

  resize(width: number, height: number): void {
    this.assertAlive();
    this.transmissionViews.clear();
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
    if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RenderDeviceError("Renderer dimensions must be positive integers", "INVALID_FRAME_SIZE", { width, height });
    }
    if (this.width !== width || this.height !== height) {
      this.disposeNativeDrawingPipeline();
      this.lastDrawingPath = null;
      this.selectiveBloomTarget?.dispose();
      this.selectiveBloomTarget = null;
    }
    this.width = width;
    this.height = height;
    this.resizeCanvas(width, height);
  }
  resizeToDisplay(options: ResizeToDisplayOptions = {}): ResizeToDisplayResult {
    this.assertAlive();
    if (!this.canvas) {
      throw new RenderDeviceError("resizeToDisplay requires a canvas-backed renderer", "CANVAS_REQUIRED");
    }
    const cssWidth = options.cssWidth ?? readCanvasCssSize(this.canvas, "width");
    const cssHeight = options.cssHeight ?? readCanvasCssSize(this.canvas, "height");
    // §6.9: explicit override ?? resolution.pixelRatio ?? min(dpr, tier cap) —
    // identical to `globalThis.devicePixelRatio` while `resolution`/`tier` are unset.
    const devicePixelRatio = resolveCanvasPixelRatio({
      devicePixelRatio: globalThis.devicePixelRatio ?? 1,
      tier: this.qualityTier ?? this.liveQualityTier()?.settings ?? { maxPixelRatio: Number.POSITIVE_INFINITY },
      explicit: options.devicePixelRatio ?? this.pixelRatioOverride,
      resolution: this.resolutionOptions
    });
    if (![cssWidth, cssHeight, devicePixelRatio].every(Number.isFinite) || cssWidth <= 0 || cssHeight <= 0 || devicePixelRatio <= 0) {
      throw new RenderDeviceError("Display size and DPR must be finite positive values", "INVALID_DISPLAY_SIZE", {
        cssWidth,
        cssHeight,
        devicePixelRatio
      });
    }
    const width = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const height = Math.max(1, Math.round(cssHeight * devicePixelRatio));
    const resized = width !== this.width || height !== this.height;
    if (resized) {
      this.resize(width, height);
    }
    return { resized, cssWidth, cssHeight, devicePixelRatio, width, height };
  }

  /**
   * §6.9 manual render-scale ceiling (AuraPerformanceQuality.resolutionScale,
   * request Q-15-1). Caps the scene target only; the canvas backing size is
   * untouched. `renderScale` reports `min(ceiling, governor)`.
   */
  setRenderScaleCeiling(scale: number): void {
    this.assertAlive();
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RenderDeviceError("Render-scale ceiling must be a positive finite value", "INVALID_RENDER_SCALE", { scale });
    }
    this.renderScaleCeiling = Math.min(scale, 1);
  }

  get renderScaleCeilingValue(): number {
    return this.renderScaleCeiling;
  }

  /** Effective render scale: `min(setRenderScaleCeiling, ResolutionGovernor)`. */
  get renderScale(): number {
    return Math.min(this.renderScaleCeiling, this.resolutionGovernor?.scale ?? 1);
  }

  /** C-31 `resolution` section values observed by the renderer. */
  get resolutionReport(): { readonly pixelRatio: number; readonly renderScale: number; readonly renderScaleCeiling: number; readonly backingWidth: number; readonly backingHeight: number } {
    const cssWidth = this.canvas ? readCanvasCssSize(this.canvas, "width") : this.width;
    return {
      pixelRatio: cssWidth > 0 ? this.width / cssWidth : 1,
      renderScale: this.renderScale,
      renderScaleCeiling: this.renderScaleCeiling,
      backingWidth: this.width,
      backingHeight: this.height
    };
  }

  /**
   * threejs-parity L7/SH-05: `setPixelRatio` — overrides the device pixel
   * ratio used by `resizeToDisplay` (a `devicePixelRatio` option there still
   * wins for that call). Applies immediately on a canvas-backed renderer;
   * stored for the next resize otherwise.
   */
  private pixelRatioOverride?: number;
  setPixelRatio(ratio: number): void {
    this.assertAlive();
    if (!Number.isFinite(ratio) || ratio <= 0) {
      throw new RenderDeviceError("Pixel ratio must be a positive finite number", "INVALID_PIXEL_RATIO", { ratio });
    }
    this.pixelRatioOverride = ratio;
    if (this.canvas) this.resizeToDisplay();
  }

  get pixelRatio(): number {
    return this.pixelRatioOverride ?? this.resolutionReport.pixelRatio;
  }

  /**
   * threejs-parity L7/SH-05: `setClearColor` — the default clear used when the
   * scene has no background (three's `setClearColor(color, alpha)`).
   */
  setClearColor(color: readonly [number, number, number] | readonly [number, number, number, number], alpha?: number): void {
    this.assertAlive();
    const [r, g, b, a] = color;
    const resolved: readonly [number, number, number, number] = [r ?? 0, g ?? 0, b ?? 0, alpha ?? a ?? 1];
    if (!resolved.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) {
      throw new RenderDeviceError("Clear color channels must be finite numbers in [0, 1]", "INVALID_CLEAR_COLOR", { color: [...color], alpha });
    }
    if (resolved.slice(0, 3).some((value, index) => value !== this.clearColor[index])) this.directLinearClearValid = false;
    this.clearColor = resolved;
  }

  get clearColorValue(): readonly [number, number, number, number] {
    return this.clearColor;
  }

  /**
   * threejs-parity L7/SR-05: three's `WebGLRenderer.info` — per-frame render
   * counters plus live resource gauges from the device diagnostics.
   */
  private submittedFrames = 0;
  get info(): {
    readonly render: {
      readonly calls: number;
      readonly triangles: number;
      readonly points: number;
      readonly lines: number;
      readonly frame: number;
    };
    readonly memory: {
      readonly geometries: number;
      readonly textures: number;
      readonly renderTargets?: number;
      readonly programs?: number;
    };
    readonly approximateGpuMemoryBytes?: number;
  } {
    const d = this.device.getDiagnostics();
    const memoryBytes = (d.bufferBytes ?? 0) + (d.textureBytes ?? 0);
    return {
      render: {
        calls: d.drawCalls,
        triangles: (d as { readonly triangles?: number }).triangles ?? 0,
        points: (d as { readonly points?: number }).points ?? 0,
        lines: (d as { readonly lines?: number }).lines ?? 0,
        frame: this.submittedFrames
      },
      memory: {
        geometries: d.buffers,
        textures: d.textures ?? 0,
        ...(d.renderTargets !== undefined ? { renderTargets: d.renderTargets } : {}),
        programs: d.shaders
      },
      ...(d.approximateGpuMemoryBytes !== undefined || memoryBytes > 0
        ? { approximateGpuMemoryBytes: d.approximateGpuMemoryBytes ?? memoryBytes }
        : {})
    };
  }

  /**
   * Feeds one frame's timings to the resolution governor (C-28 `gpuMs` wins
   * over the CPU interval when lane 11's timer queries provide it).
   */
  sampleResolutionGovernor(frameMs: number, gpuMs?: number | null): number {
    return this.resolutionGovernor?.sample(frameMs, gpuMs) ?? this.renderScale;
  }

  startAnimationLoop(callback: (timeMs: number, renderer: Renderer) => void): RendererAnimationLoop {
    this.assertAlive();
    this.animationLoop?.stop();
    const loop = new RendererAnimationLoopImpl(this, callback);
    this.animationLoop = loop;
    loop.start();
    return loop;
  }
  private readonly temporalHistory: TemporalHistory;
  private releasingLostDeviceResources = false;
  private temporalOperationDepth = 0;
  private temporalCleanupPending = false;
  private readonly temporalLossCleanupFailures: unknown[] = [];
  private releaseTemporalHistoryOwnership(): void {
    if (this.disposed && !this.temporalCleanupPending && !this.disposalInProgress && !this.renderingAuthoredPass && !this.releasingLostDeviceResources && !this.temporalOperationDepth
        && rendererTemporalHistoryOwners.get(this.temporalHistory) === this.viewScopeId) {
      rendererTemporalHistoryOwners.delete(this.temporalHistory);
    }
  }
  private disposeTemporalHistory(): void {
    // An old renderer's later retry must never touch a successor's history.
    if (!this.temporalCleanupPending || rendererTemporalHistoryOwners.get(this.temporalHistory) !== this.viewScopeId) return;
    this.temporalHistory.dispose();
    this.temporalCleanupPending = false;
  }
  private withTemporalHistoryOperation<T>(action: () => T): T {
    this.temporalOperationDepth++;
    try { return action(); }
    finally { this.temporalOperationDepth--; this.releaseTemporalHistoryOwnership(); }
  }
  /** PRD-03 Phase 4: camera position at the last temporal frame — the >5 m
   * auto-cut detector. */
  private readonly lastTemporalCameraPosition = new Map<string | number, { readonly frameId: number; readonly position: readonly [number, number, number]; readonly cameraCut: boolean }>();
  private readonly unsubscribeTemporalDeviceLoss?: () => void;
  private releaseTemporalTransferTracker?: () => void;
  private readonly viewTargets = new Map<string | number, RenderTarget>();
  private readonly targetTemporalIds = new Map<RenderTarget, string>();
  private nextTargetTemporalId = 0;
  private viewComposite?: { readonly geometry: Geometry; readonly shader: ShaderModule; readonly pipeline: RenderPipeline };
  private readonly viewScopeId = {};
  #rendererFlagOwner = {};
  #nativePostOwner = {};
  #nativePostRegistered = false;
  private activePrd07Operation: Prd07RendererOperation | undefined;

  private nativePostTransactions(): RendererNativePostTransactions | undefined {
    const candidate = this.device as RenderDevice & Partial<RendererNativePostTransactions>;
    return candidate.kind === "webgpu" && typeof candidate.registerNativePostRenderer === "function" &&
      typeof candidate.beginNativePostAuthoredFrame === "function" && typeof candidate.beginNativePostRendererPass === "function" &&
      typeof candidate.endNativePostRendererPass === "function" && typeof candidate.finishNativePostAuthoredFrame === "function" &&
      typeof candidate.unregisterNativePostRenderer === "function" ? candidate as RenderDevice & RendererNativePostTransactions : undefined;
  }

  private withNativePostRendererPass<T>(token: PostDiagnosticToken, fn: () => T): T {
    const native = this.nativePostTransactions();
    if (!native) return fn();
    const frame = this.pendingAuthoredFrame;
    this.assertAuthoredFrameCurrent(frame);
    withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "begin-pass", frame.id, this.activeViewId, token,
      () => native.beginNativePostRendererPass(this.viewScopeId, frame.id, this.activeViewId, token));
    try { return fn(); }
    finally { if (this.#nativePostRegistered) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "end-pass", frame.id, undefined, undefined,
      () => native.endNativePostRendererPass(this.viewScopeId, frame.id)); }
  }

  private async withNativePostRendererPassAsync<T>(token: PostDiagnosticToken, fn: () => Promise<T>): Promise<T> {
    const native = this.nativePostTransactions();
    if (!native) return fn();
    const frame = this.pendingAuthoredFrame;
    this.assertAuthoredFrameCurrent(frame);
    withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "begin-pass", frame.id, this.activeViewId, token,
      () => native.beginNativePostRendererPass(this.viewScopeId, frame.id, this.activeViewId, token));
    try { return await fn(); }
    finally { if (this.#nativePostRegistered) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "end-pass", frame.id, undefined, undefined,
      () => native.endNativePostRendererPass(this.viewScopeId, frame.id)); }
  }

  private bindPrd07OperationFlags(operation: Prd07RendererOperation | undefined, endOnFailure = false, auxiliary = false): () => void {
    try {
      return beginRendererQrFlagBinding(this.device, auxiliary ? {} : this.#rendererFlagOwner,
        operation ? this.ownedQrFlags : undefined);
    } catch (error) {
      if (endOnFailure) endPrd07RendererOperation(operation);
      throw error;
    }
  }

  private beginRendererDeviceFrame(width: number, height: number): void {
    withRendererQrFrameBegin(this.device, this.#rendererFlagOwner, () => this.device.beginFrame(width, height));
  }
  private readonly activePostEffectSignatures = new Map<string | number, string>();
  private authoredFrameId = 0;
  private authoredTimeSeconds = 0;
  private hasAuthoredFrame = false;
  private frameSerial = 0;
  private pendingAuthoredFrame: PendingAuthoredFrame | undefined;
  private lastFinishedExplicitFrame: number | undefined;
  private renderingAuthoredPass = false;
  private activeViewId: string | number = "single";
  private activeTemporalReportId: string | number = "single";
  private readonly temporalViews = new Map<string | number, { readonly motionSource: "camera" | "object"; readonly unsupportedMotion: readonly string[]; readonly coverage: VelocityCoverage }>();
  private temporalDiagnostics() {
    return this.temporalViews.size ? { temporalViews: [...this.temporalViews].map(([viewId, value]) => ({ viewId, ...value })) } : {};
  }
  /** Detached per-view reports for this renderer's last authored frames. */
  postDiagnosticViews(): readonly PostDiagnosticSnapshot[] {
    return postDiagnostics.snapshotScope(this.viewScopeId);
  }
  /** Stable owner identity for app-scoped post pass registration. */
  postScopeId(): object { return this.viewScopeId; }

  /** Whether this renderer has an app-owned profile admission/diagnostic sink. */
  photometricProfileAdmissionEnabled(): boolean {
    return !this.disposed && typeof this.photometricProfiles?.onUnsupported === "function";
  }
  /** Whether app-owned projected images can request this renderer's bounded route. */
  projectedSpotImageAdmissionEnabled(): boolean {
    return !this.disposed && !this.device.disposed && !this.device.contextLost && this.device.kind === "webgl2" && typeof this.projectedSpotImages?.resolveResource === "function" &&
      typeof this.projectedSpotImages.onUnsupported === "function";
  }
  private activeCameraCut = false;
  private renderingViews = false;
  private staticUnlitCaptureDepth = 0;

  /**
   * PRD-03 §8.6 (flag-on): the v2 S5/S7 stages own the history ping-pong.
   * When a frame was served by another chain (v2 modules still loading, an
   * unfusable pass list), the legacy native TAA wrote its own bytes (alpha =
   * depth, presentation-tuned) into the history target; promoting that seeded
   * the v2 resolve with garbage. Such frames — and TAA frames on which S5
   * did not resolve (`markTaaHistoryWritten`) — reset the history instead.
   */
  private commitTemporalHistory(taa: boolean, viewId = this.activeViewId, frameId = this.authoredFrameId, eligible?: boolean): void {
    const written = consumeTaaHistoryWritten(this.viewScopeId, viewId, frameId);
    const presented = consumePostV2Presented(this.viewScopeId, viewId, frameId);
    if (!(eligible ?? (!rendererQrFlags(this.device).on("A3D_QR_POST") || (taa ? written : presented)))) {
      this.temporalHistory.reset("camera-cut", viewId);
      this.lastTemporalCameraPosition.delete(viewId);
      return;
    }
    withRendererQrProofAccess(this.device, this.#rendererFlagOwner, this.temporalHistory, viewId, frameId, "commit",
      () => this.temporalHistory.commit(viewId, frameId));
  }
  private assertAuthoredFrameCurrent(frame = this.pendingAuthoredFrame): asserts frame is PendingAuthoredFrame {
    if (!frame || frame !== this.pendingAuthoredFrame || frame.cancelled || this.disposed || this.device.disposed
      || this.device.contextLost || this.device.generation !== frame.generation) {
      throw new RenderDeviceError("The authored frame was cancelled or its device became unavailable", "TEMPORAL_FRAME_CANCELLED");
    }
  }
  private beginTemporalView(active: boolean): void {
    const frame = this.pendingAuthoredFrame;
    this.assertAuthoredFrameCurrent(frame);
    const prior = frame.views.get(this.activeViewId);
    if (!active) {
      if (prior) prior.eligible = false;
      else frame.views.set(this.activeViewId, { prepared: false, eligible: false });
      return;
    }
    if (prior) prior.prepared = true;
    else frame.views.set(this.activeViewId, { prepared: true, eligible: true });
  }
  private stageTemporalHistory(taa: boolean): void {
    const frame = this.pendingAuthoredFrame;
    this.assertAuthoredFrameCurrent(frame);
    const view = frame.views.get(this.activeViewId);
    if (!view?.prepared) throw new RenderDeviceError("Temporal view was not prepared", "TEMPORAL_FRAME_CANCELLED");
    const written = consumeTaaHistoryWritten(this.viewScopeId, this.activeViewId, frame.id);
    const presented = consumePostV2Presented(this.viewScopeId, this.activeViewId, frame.id);
    view.eligible &&= !rendererQrFlags(this.device).on("A3D_QR_POST") || (taa ? written : presented);
  }
  private abortAuthoredFrame(frame: PendingAuthoredFrame, finishingPass = false): void {
    frame.cancelled = true;
    try {
      const native = this.nativePostTransactions();
      if (native) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "abort", frame.id, undefined, undefined,
        () => native.finishNativePostAuthoredFrame(this.viewScopeId, frame.id, false));
    } catch {}
    for (const viewId of frame.views.keys()) {
      clearTaaHistoryWrites(this.viewScopeId, viewId);
      try { this.temporalHistory.reset("explicit-reset", viewId); } catch {}
      this.lastTemporalCameraPosition.delete(viewId);
      try { this.releasePostEffectView(viewId); } catch {}
    }
    if (!this.renderingAuthoredPass || finishingPass) {
      try { this.retireViewTargets(frame.initialViewIds); } catch {}
      if (this.pendingAuthoredFrame === frame) this.pendingAuthoredFrame = undefined;
    }
  }
  private finishAuthoredFrame(frame: PendingAuthoredFrame): void {
    try {
      this.assertAuthoredFrameCurrent(frame);
      this.retireViewTargets(frame.activeViewIds);
      for (const [viewId, view] of frame.views) {
        if (view.prepared) this.commitTemporalHistory(false, viewId, frame.id, view.eligible);
      }
      const native = this.nativePostTransactions();
      if (native) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "finish", frame.id, undefined, undefined,
        () => native.finishNativePostAuthoredFrame(this.viewScopeId, frame.id, true));
    } catch (error) {
      this.abortAuthoredFrame(frame);
      throw error;
    }
    if (frame.explicit) this.lastFinishedExplicitFrame = frame.id;
    if (this.pendingAuthoredFrame === frame) this.pendingAuthoredFrame = undefined;
  }
  finishTemporalFrame(frameId?: number): boolean {
    return this.withTemporalHistoryOperation(() => {
      this.assertAlive();
      if (this.renderingAuthoredPass) throw new RenderDeviceError("Cannot finish a frame during rendering", "TEMPORAL_FRAME_BUSY");
      const frame = this.pendingAuthoredFrame;
      if (!frame) return false;
      if (frameId !== undefined && frameId !== frame.id) throw new RenderDeviceError("Temporal frame ID does not match the pending frame", "TEMPORAL_FRAME_CONFLICT");
      if (!frame.completedPasses) return false;
      this.finishAuthoredFrame(frame);
      return true;
    });
  }
  cancelTemporalFrame(frameId?: number): boolean {
    return this.withTemporalHistoryOperation(() => {
      if (this.disposed) return false;
      const frame = this.pendingAuthoredFrame;
      if (!frame || frame.cancelled) return false;
      if (frameId !== undefined && frameId !== frame.id) throw new RenderDeviceError("Temporal frame ID does not match the pending frame", "TEMPORAL_FRAME_CONFLICT");
      this.abortAuthoredFrame(frame);
      return true;
    });
  }
  resetTemporalHistory(_reason = "explicit-reset"): void {
    this.withTemporalHistoryOperation(() => {
      if (this.disposed) throw new RenderDeviceError("Renderer is disposed", "DISPOSED_DEVICE");
      if (this.pendingAuthoredFrame) this.abortAuthoredFrame(this.pendingAuthoredFrame);
      this.temporalHistory.reset();
      this.lastTemporalCameraPosition.clear();
      this.releasePostEffectScope();
    });
  }
  private finishTemporalPassCleanup(): void {
    // Keep the claim while cancellation callbacks run: they can reenter
    // dispose or try to construct another renderer with the same history.
    try {
      if (this.pendingAuthoredFrame?.cancelled) this.abortAuthoredFrame(this.pendingAuthoredFrame, true);
    } finally {
      this.renderingAuthoredPass = false;
      this.releaseTemporalHistoryOwnership();
    }
  }
  /** Predict the existing cut decision without committing a camera position. */
  private previewTemporalCameraCut(position: readonly [number, number, number]): boolean {
    const previous = this.lastTemporalCameraPosition.get(this.activeViewId);
    if (previous?.frameId === this.authoredFrameId) return previous.cameraCut;
    const dx = previous ? position[0] - previous.position[0] : 0;
    const dy = previous ? position[1] - previous.position[1] : 0;
    const dz = previous ? position[2] - previous.position[2] : 0;
    return dx * dx + dy * dy + dz * dz > 25;
  }
  private temporalCameraCut(position: readonly [number, number, number]): boolean {
    const previous = this.lastTemporalCameraPosition.get(this.activeViewId);
    const cameraCut = this.previewTemporalCameraCut(position);
    if (previous?.frameId === this.authoredFrameId) return cameraCut;
    this.lastTemporalCameraPosition.set(this.activeViewId, { frameId: this.authoredFrameId, position: [position[0], position[1], position[2]], cameraCut });
    return cameraCut;
  }
  /**
   * threejs-parity L7/SH-06: a `{ target }` (or `source.renderTarget`) frame
   * executes at the target's own dimensions — three's `setRenderTarget` +
   * `render` semantics. Viewport state restores when the frame exits.
   */
  private adoptExplicitTargetSize<T>(source: RenderSource | Iterable<RenderItem> | Scene, run: () => T): T {
    const target = collectRenderTarget(source);
    if (!target || (target.width === this.width && target.height === this.height)) return run();
    const prevWidth = this.width;
    const prevHeight = this.height;
    this.width = target.width;
    this.height = target.height;
    // TemporalHistory manages dimensions per view and invalidates only the
    // resources affected by this target when it prepares the next frame.
    try {
      return run();
    } finally {
      this.width = prevWidth;
      this.height = prevHeight;
    }
  }

  private async adoptExplicitTargetSizeAsync<T>(source: RenderSource | Iterable<RenderItem> | Scene, run: () => Promise<T>): Promise<T> {
    const target = collectRenderTarget(source);
    if (!target || (target.width === this.width && target.height === this.height)) return run();
    const prevWidth = this.width;
    const prevHeight = this.height;
    this.width = target.width;
    this.height = target.height;
    try {
      return await run();
    } finally {
      this.width = prevWidth;
      this.height = prevHeight;
    }
  }

  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    this.assertAlive();
    if (this.renderingAuthoredPass) throw new RenderDeviceError("Renderer is already rendering a frame", "TEMPORAL_FRAME_BUSY");
    this.renderingAuthoredPass = true;
    let completedFrame: PendingAuthoredFrame | undefined;
    return withRendererFrameCleanup(() => {
      try {
        let diagnostics: RenderDeviceDiagnostics | undefined;
        const { operation, owned } = takePrd07RendererOperation(this);
        const restoreFlags = this.bindPrd07OperationFlags(operation, owned);
        withRendererFrameCleanup(() => {
          this.activePrd07Operation = operation;
          withRendererFrameCleanup(() => {
            const trace = this.beginFrameInspection();
            withRendererFrameCleanup(() => {
              diagnostics = this.renderWithInspection(sourceOrInput, camera);
              completedFrame = this.pendingAuthoredFrame;
            }, () => this.finishFrameInspection(trace, diagnostics));
          }, () => {
            this.activePrd07Operation = undefined;
            if (owned) endPrd07RendererOperation(operation);
          });
          // Restore the other renderer's flags only after the sealed proof is consumed.
          this.assertAuthoredFrameCurrent(completedFrame);
          this.completeAuthoredPass(completedFrame);
        }, restoreFlags);
        return diagnostics!;
      } catch (error) {
        const cleanupErrors: unknown[] = [];
        try { if (completedFrame) this.abortAuthoredFrame(completedFrame); } catch (cleanup) { cleanupErrors.push(cleanup); }
        try { this.failTransmissionDiagnostics(); } catch (cleanup) { cleanupErrors.push(cleanup); }
        throwRendererFrameCleanupFailures({ error }, cleanupErrors);
        throw error;
      }
    }, () => this.finishTemporalPassCleanup());
  }

  private renderWithInspection(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    this.trackBatchSource(isRendererInput(sourceOrInput) ? sourceOrInput.source : sourceOrInput);
    const views = collectRendererViews(sourceOrInput);
    const frame = this.beginAuthoredFrame(sourceOrInput);
    try {
    this.lastDrawingPath = null;
    this.temporalViews.clear();
    const selected = withRendererQrFlags(this.device, () => this.selectDrawingPath(sourceOrInput, camera, views));
    if (selected.rendered) {
      this.assertAuthoredFrameCurrent(frame);
      return selected.rendered;
    }
    sourceOrInput = selected.input;
    let diagnostics: RenderDeviceDiagnostics;
    if (views) {
      diagnostics = withRendererQrFlags(this.device, () => this.renderViews(sourceOrInput, camera, views));
    } else {
      this.pendingViewState = collectSingleViewState(sourceOrInput);
      this.activeViewId = this.singleViewHistoryId(normalizeRendererInput(sourceOrInput, camera).source);
      try {
        diagnostics = withRendererQrFlags(this.device, () =>
          this.adoptExplicitTargetSize(normalizeRendererInput(sourceOrInput, camera).source, () => this.renderFrame(sourceOrInput, camera, selected.deferredInFrame))
        );
      } finally {
        this.pendingViewState = null;
        this.activeViewId = "single";
      }
    }
    const drawingPath = this.lastDrawingPath ?? selected.diagnostics;
    this.lastDrawingPath = drawingPath;
    const result = { ...diagnostics, drawingPath, ...this.temporalDiagnostics() };
    this.assertAuthoredFrameCurrent(frame);
    return result;
    } catch (error) {
      try { this.abortAuthoredFrame(frame); } catch (cleanup) { throwRendererFrameCleanupFailures({ error }, [cleanup]); }
      throw error;
    }
  }

  private beginFrameInspection(): PostStageTraceSession {
    this.transmissionViews.clear();
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
    const previousTiming = this.activeFrameTrace && this.inspectionTimingByTrace.get(this.activeFrameTrace);
    if (previousTiming) this.inspectionTiming.end(previousTiming);
    this.lastFrameInspection = null;
    this.lastInspectionTiming = null;
    const frameNumber = this.submittedFrames + 1;
    const session = this.frameTrace.beginFrame(frameNumber);
    this.inspectionTimingByTrace.set(session, this.inspectionTiming.begin(frameNumber));
    this.activeFrameTrace = session;
    // Shadow, contributor, post and native-device phases are not all observed.
    session.markIncomplete();
    return session;
  }

  private finishFrameInspection(session: PostStageTraceSession, diagnostics?: RenderDeviceDiagnostics): void {
    if (this.activeFrameTrace !== session || this.disposed) return;
    this.activeFrameTrace = null;
    const timing = this.inspectionTimingByTrace.get(session) ?? null;
    if (timing) this.inspectionTiming.end(timing);
    session.finish();
    const trace = session.snapshot();
    this.lastFrameInspection = { frameNumber: trace.frameNumber, passes: trace.passes, complete: trace.complete,
      diagnostics: diagnostics ?? this.getDiagnostics(), cpuTimeMs: null, gpuTimeMs: null,
      gpuViewTiming: timing ? this.inspectionTiming.snapshot(timing) : null };
    this.lastInspectionTiming = timing;
    if (timing) {
      this.inspectionHistory.push({ inspection: this.lastFrameInspection, timing });
      if (this.inspectionHistory.length > 120) this.inspectionHistory.shift();
    }
  }

  /** Actual measured graph passes from the latest frame; unobserved phases are marked partial. */
  getFrameInspection(): RendererFrameInspection | null {
    if (!this.lastFrameInspection) return null;
    return { ...this.lastFrameInspection,
      gpuViewTiming: this.lastInspectionTiming ? this.inspectionTiming.snapshot(this.lastInspectionTiming) : null };
  }

  /** Bounded inspection history, including delayed, explicitly partial view GPU timings. */
  getFrameInspectionHistory(): readonly RendererFrameInspection[] {
    const timings = this.inspectionTiming.snapshots(this.inspectionHistory.map((entry) => entry.timing));
    return this.inspectionHistory.map((entry, index) => ({ ...entry.inspection, gpuViewTiming: timings[index] ?? null }));
  }

  private executeInspectedGraph(): void {
    withRendererQrFlags(this.device, () => this.executeInspectedGraphScoped());
  }

  private executeInspectedGraphScoped(): void {
    const context = { device: this.device, width: this.width, height: this.height };
    if (!this.activeFrameTrace) return this.graph.execute(context);
    for (const pass of this.graph.compile()) {
      this.activeFrameTrace.measure({ name: pass.name, reads: pass.reads, writes: pass.writes,
        readDrawCalls: () => this.device.getDiagnostics().drawCalls }, () => {
        const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
        const assertTarget = !meta.env?.PROD && (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } }).process?.env?.NODE_ENV !== "production";
        const before = assertTarget ? this.device.getRenderTarget?.() : undefined;
        pass.execute(context);
        if (before !== undefined && this.device.getRenderTarget?.() !== before) throw new Error(`Render pass "${pass.name}" left a different render target bound`);
      });
    }
  }

  /** Reject conventions until the entire forward/shadow/post pipeline agrees. */
  private assertSupportedCameraDepth(camera: Pick<CameraLike, "projectionMetadata" | "depthConvention"> | undefined): void {
    const metadata = camera?.projectionMetadata;
    const convention = camera?.depthConvention;
    if (metadata && convention && (metadata.mode !== convention.mode || metadata.clipRange !== convention.clipRange)) {
      throw new RenderDeviceError("Camera projection and depth convention do not match.", "FRAME_DEPTH_CONVENTION_MISMATCH", { projection: metadata, depth: convention });
    }
    const mode = metadata?.mode ?? convention?.mode ?? "standard";
    const clipRange = metadata?.clipRange ?? convention?.clipRange ?? "minus-one-to-one";
    const active = this.device.getDepthConvention?.();
    if (active && (active.mode !== "standard" || active.clearValue !== 1 || active.compare !== "less-equal" || active.biasSign !== 1)) {
      throw new RenderDeviceError("The active device depth convention is not supported by the renderer.", "DEPTH_MODE_UNSUPPORTED", { mode: active.mode, backend: this.device.kind });
    }
    if (mode !== "standard" || clipRange !== "minus-one-to-one") {
      throw new RenderDeviceError("The active renderer requires standard depth and a minus-one-to-one camera projection.", "DEPTH_MODE_UNSUPPORTED", { mode, clipRange, backend: this.device.kind });
    }
  }

  private planNativeDepthOfField(postprocess: RendererPostProcessOptions | undefined,
    camera: { readonly projectionMetadata?: FrameProjectionMetadata } | undefined,
    forward: { readonly projection?: Mat4; readonly consistent: boolean },
    options: { readonly environmentBackground: unknown; readonly environmentFog: unknown; readonly advanced: unknown;
      readonly explicitTarget: RenderTarget | undefined; readonly deferred: boolean }): ReturnType<typeof nativeDofProjection> | undefined {
    if (!nativeWebGPUDofRequested(this.device, postprocess)) return undefined;
    const device = this.device;
    const pipeline = postprocess!.pipeline as PostPipelineOptions;
    validateNativeDofRoute(postprocess!, pipeline, this.viewScopeId);
    const flags = rendererQrFlags(device);
    if (device.canPresentNativeDepthOfField?.() !== true || !device.beginNativeDepthOfFieldFrame || !device.sealNativeDepthOfFieldFrame
      || !device.cancelNativeDepthOfFieldFrame || !device.validateNativeDepthOfFieldFrame || !device.clearRenderTarget
      || !device.presentLdrPostprocess || !device.getRenderTarget || postprocess!.execution === "cpu-deterministic"
      || pipeline.backgroundPassthrough || potentiallyActiveFrameContributors(flags).length > 0
      || !isTrustedQrFlags(flags) || !qrCoreGeneratorOn(flags) || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
      || this.renderingViews || this.pendingViewState || !this.rasterViewportIsFull() || options.explicitTarget || options.deferred
      || options.environmentBackground || options.environmentFog || options.advanced
      || this.clearColor[3] !== 1 || this.clearColor.slice(0, 3).some(value => !Number.isFinite(value) || value < 0 || value > 1)) {
      throw new RenderDeviceError("Native depth of field requires a supported opaque full-view frame with no extra contributors", "NATIVE_DOF_FRAME_UNSUPPORTED");
    }
    const plan = nativeDofProjection(camera, forward);
    validateWebGPUDepthOfFieldOptions(pipeline.dof as Partial<DofOptions>, plan.maxGeometryDepthMeters, plan.skyDepthMeters);
    return plan;
  }

  private beginNativeDofFrame(plan: ReturnType<typeof nativeDofProjection>, source: RenderTarget, items: readonly RenderItem[],
    projection: Mat4 | undefined, viewProjection: Mat4 | undefined): { readonly frame: NativeWebGPUDofFrame; readonly assertCurrent: () => void } {
    const flags = rendererQrFlags(this.device);
    assertNativeDofItems(items, flags);
    if (!projection || !viewProjection || !source.depthTexture || !source.colorTextures || source.colorTextures.length !== 2
      || source.colorTextures[0] !== source.colorTexture || source.colorTextures[1]?.format !== "rgba8"
      || source.colorTextures[1].disposed || source.depthTexture.disposed || source.sampleCount !== 1) {
      throw new RenderDeviceError("Native depth of field requires a live single-sample HDR/depth/coverage target", "NATIVE_DOF_TARGET_UNSUPPORTED");
    }
    const snapshotProjection = Array.from(projection), snapshotViewProjection = Array.from(viewProjection);
    const participants = items.map(item => {
      const material = item.material as UnlitMaterial | undefined;
      return { item, material, revision: material?.getRevision() };
    });
    const scopeId = this.viewScopeId, viewId = this.activeViewId, frameId = this.authoredFrameId;
    const generation = this.device.generation;
    const clear = Array.from(this.clearColor);
    const frame = this.device.beginNativeDepthOfFieldFrame!({ source, coverage: { target: source, colorAttachment: 1, encoding: "depth-coverage-red8" },
      ...plan, alpha: "opaque", depthModel: "single-surface", scopeId, viewId, frameId });
    const assertCurrent = (): void => {
      if (this.disposed || this.device.disposed || this.device.generation !== generation || this.activeViewId !== viewId
        || this.authoredFrameId !== frameId || this.device.getRenderTarget?.() !== source || !frame.isCurrent()
        || this.clearColor.some((value, i) => value !== clear[i])
        || projection.some((value, i) => value !== snapshotProjection[i]) || viewProjection.some((value, i) => value !== snapshotViewProjection[i])
        || items.length !== participants.length || participants.some((snapshot, i) => items[i] !== snapshot.item
          || snapshot.item.material !== snapshot.material || snapshot.material?.getRevision() !== snapshot.revision)
        || potentiallyActiveFrameContributors(rendererQrFlags(this.device)).length > 0 || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)) {
        throw new RenderDeviceError("Native depth-of-field frame or participants changed during submission", "NATIVE_DOF_FRAME_STALE");
      }
      assertNativeDofItems(items, rendererQrFlags(this.device));
    };
    return { frame, assertCurrent };
  }

  private releasePostEffectView(viewId: string | number): void {
    this.transmissionViews.delete(viewId);
    this.activePostEffectSignatures.delete(viewId);
    clearTaaHistoryWrites(this.viewScopeId, viewId);
    const errors: unknown[] = [];
    try { this.device.releaseNativePostEffectView?.(this.viewScopeId, viewId); } catch (error) { errors.push(error); }
    try { releaseTransmissionView(this.device, this.viewScopeId, viewId); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "View post-resource cleanup failed");
  }

  private releasePostEffectScope(): void {
    this.transmissionViews.clear();
    this.activePostEffectSignatures.clear();
    clearTaaHistoryWrites(this.viewScopeId);
    const errors: unknown[] = [];
    try { this.device.releaseNativePostEffectScope?.(this.viewScopeId); } catch (error) { errors.push(error); }
    try { releaseTransmissionScope(this.device, this.viewScopeId); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, "Renderer post-resource cleanup failed");
  }

  /** Removed or reordered temporal post effects cannot reuse old frames. */
  private updatePostEffectActivity(postprocess: RendererPostProcessOptions | undefined): void {
    const pipeline = postprocess?.pipeline;
    const nativeEffects = postprocess?.v2 && postprocess.execution !== "cpu-deterministic" && pipeline && typeof pipeline === "object"
      ? (pipeline as { readonly nativeEffects?: readonly { readonly kind?: unknown }[] }).nativeEffects
      : undefined;
    const indices = Array.isArray(nativeEffects)
      ? nativeEffects.flatMap((effect, index) => effect?.kind === "afterimage" ? [index] : [])
      : [];
    const exposure = postprocess?.v2 && postprocess.execution !== "cpu-deterministic" && pipeline && typeof pipeline === "object"
      && (pipeline as { readonly autoExposure?: unknown }).autoExposure !== undefined
      && (pipeline as { readonly autoExposure?: unknown }).autoExposure !== false;
    const next = indices.length || exposure ? `afterimage:${indices.join(",")};exposure:${String(exposure)}` : undefined;
    const previous = this.activePostEffectSignatures.get(this.activeViewId);
    if (previous !== undefined && previous !== next) this.releasePostEffectView(this.activeViewId);
    if (next !== undefined) this.activePostEffectSignatures.set(this.activeViewId, next);
  }

  private hasNativePostEffects(postprocess: RendererPostProcessOptions): boolean {
    const pipeline = postprocess.pipeline;
    return postprocess.v2 === true && pipeline !== null && typeof pipeline === "object"
      && Array.isArray((pipeline as { readonly nativeEffects?: unknown }).nativeEffects)
      && ((pipeline as { readonly nativeEffects: readonly unknown[] }).nativeEffects.length > 0);
  }

  private gaussianSplatRuns(
    draws: readonly RendererGaussianSplatDraw[],
    source: RenderSource | Iterable<RenderItem> | Scene,
    resolvedCamera: ReturnType<typeof resolveCamera>,
    postprocess: RendererPostProcessOptions | undefined,
    qrOutput: boolean,
    transparent: readonly { readonly item: RenderItem; readonly sortDepth: number }[],
    queues: readonly TransparentQueueItem[]
  ): readonly TransparentQueueItem[] {
    if (!draws.length) return [];
    const frustum = source instanceof Scene || isIterable(source) ? undefined
      : explicitCullingFrustum(source, resolvedCamera?.viewProjectionMatrix, resolvedCamera?.camera);
    const visible = draws.filter(draw => {
      if (resolvedCamera?.layerMask !== undefined && ((draw.layerMask ?? 1) & resolvedCamera.layerMask) === 0) return false;
      if (frustum && draw.frustumCulled !== false && draw.worldBounds) {
        const { min, max } = draw.worldBounds;
        if (!frustum.intersectsBox(new SceneBounds3([...min], [...max]).toMathBox())) return false;
      }
      return true;
    });
    if (!visible.length) return [];
    if (postprocess?.temporal && (postprocess.taa || postprocess.motionBlur)) {
      throw new RenderDeviceError("Gaussian splats do not yet supply temporal motion and jitter", "GAUSSIAN_SPLAT_TEMPORAL_UNSUPPORTED");
    }
    const view = resolvedCamera?.viewMatrix ?? resolvedCamera?.shaderViewMatrix;
    const projection = resolvedCamera?.projectionMatrix ?? resolvedCamera?.shaderProjectionMatrix;
    if (!view || !projection) throw new RenderDeviceError("Gaussian splats require the active view and projection matrices", "GAUSSIAN_SPLAT_CAMERA_REQUIRED");
    const cameraPosition = cameraPositionFromViewMatrix(view);
    const expectedColorSpace = postprocess || qrOutput ? "lin_rec709_display" : "srgb_rec709_display";
    const prepared = visible.map(({ renderer, modelMatrix, colorSpace, renderOrder }) => {
      if (!renderer.belongsToDevice(this.device)) throw new RenderDeviceError("Gaussian splat renderer belongs to another device", "FOREIGN_RESOURCE");
      const frame = renderer.prepare({ viewMatrix: view, projectionMatrix: projection, modelMatrix,
        viewport: [this.activeRasterViewport?.width ?? this.width, this.activeRasterViewport?.height ?? this.height], cameraPosition });
      if (frame.colorSpace !== colorSpace) {
        throw new RenderDeviceError("Gaussian splat source color space differs from the prepared cloud", "GAUSSIAN_SPLAT_COLOR_SPACE_UNSUPPORTED", { colorSpace, actualColorSpace: frame.colorSpace });
      }
      return { renderer, frame, renderOrder: renderOrder ?? 0 };
    });
    if (!this.splatColorCompositor) {
      this.splatColorCompositor = new GaussianSplatColorComposite(this.device);
      this.splatColorCompositor.beginFrame();
    }
    const compositor = this.splatColorCompositor;
    const orders = new Set(prepared.map(entry => entry.renderOrder));
    return [...orders].flatMap(renderOrder => {
      const group = prepared.filter(entry => entry.renderOrder === renderOrder);
      const boundaries = [
        ...transparent.filter(({ item }) => (item.renderOrder ?? 0) === renderOrder).map(item => item.sortDepth),
        ...queues.filter(item => (item.renderOrder ?? 0) === renderOrder).map(item => item.sortDepth)
      ];
      return group[0]!.renderer.transparentRuns(group, boundaries)
        .map(run => ({ ...run, renderOrder, draw: () => compositor.draw(run, expectedColorSpace, "independent") }));
    });
  }

  private scalarVolumeRuns(
    draws: readonly ScalarVolumeDrawRecord[],
    source: RenderSource | Iterable<RenderItem> | Scene,
    resolvedCamera: ReturnType<typeof resolveCamera>,
    cameraPosition: readonly [number, number, number] | undefined,
    generation: number | undefined
  ): readonly TransparentQueueItem[] {
    if (!draws.length) return [];
    if (!cameraPosition || generation === undefined) {
      throw new RenderDeviceError("Scalar volumes require a current camera and device", "SCALAR_VOLUME_FRAME_STALE");
    }
    const frustum = source instanceof Scene || isIterable(source) ? undefined
      : explicitCullingFrustum(source, resolvedCamera?.viewProjectionMatrix, resolvedCamera?.camera);
    const frame = { deviceGeneration: generation, assertCurrent: () => {
      if (this.disposed || this.device.disposed || this.device.contextLost || this.device.generation !== generation) {
        throw new RenderDeviceError("Scalar volume frame became stale", "SCALAR_VOLUME_FRAME_STALE");
      }
    } };
    return scalarVolumeTransparentItems(draws, cameraPosition, resolvedCamera?.layerMask,
      frustum ? bounds => frustum.intersectsBox(new SceneBounds3([...bounds.min], [...bounds.max]).toMathBox()) : undefined,
      (record, context) => {
        if (this.device.kind === "webgpu") drawScalarVolumeOnWebGPU(context, record, frame);
        else drawScalarVolumeOnWebGL2(context, record, frame);
      });
  }

  private singleViewHistoryId(source: RenderSource | Iterable<RenderItem> | Scene): string {
    for (const [target, id] of this.targetTemporalIds) {
      if (target.disposed) {
        this.temporalHistory.disposeView(id);
        postDiagnostics.resetView(this.viewScopeId, id);
        this.releasePostEffectView(id);
        this.weightedTransparency?.releaseView(id);
        this.lastTemporalCameraPosition.delete(id);
        this.targetTemporalIds.delete(target);
      }
    }
    const target = collectRenderTarget(source);
    if (!target) return "single";
    let id = this.targetTemporalIds.get(target);
    if (!id) {
      id = `target:${++this.nextTargetTemporalId}`;
      this.targetTemporalIds.set(target, id);
    }
    return id;
  }

  private disposeNativeDrawingPipeline(): void {
    const current = this.nativeDrawingPipeline;
    this.nativeDrawingPipeline = null;
    current?.pipeline.visitNativeRetirementOwners((owner) => this.trackNativeDrawingRetirement(owner));
    current?.pipeline.dispose();
  }

  private trackNativeDrawingRetirement(owner: NativeDrawingOwner): void {
    if (this.retiredNativeDrawingOwners.has(owner)) return;
    // A pending queue fence may outlive the renderer's last external owner.
    // Do not keep the renderer alive merely through its observer callback.
    const renderer = new WeakRef(this);
    const unsubscribe = owner.observeNativeRetirement(() => renderer.deref()?.refreshNativeDrawingRetirement(owner));
    this.retiredNativeDrawingOwners.set(owner, unsubscribe);
    this.refreshNativeDrawingRetirement(owner);
  }

  private refreshNativeDrawingRetirement(owner: NativeDrawingOwner): void {
    const unsubscribe = this.retiredNativeDrawingOwners.get(owner);
    if (!unsubscribe) return;
    if (owner.nativeRetirementComplete) {
      this.retiredNativeDrawingOwners.delete(owner);
      unsubscribe();
    }
    this.notifyNativeDrawingRetirementWaiters();
  }

  private notifyNativeDrawingRetirementWaiters(): void {
    for (const notify of [...this.nativeDrawingRetirementWaiters]) notify();
  }

  private nativeDrawingRetirementFailures(): unknown[] {
    const failures = [...this.nativeDrawingLossCleanupFailures];
    for (const owner of this.retiredNativeDrawingOwners.keys()) {
      failures.push(...owner.retirementDestructionErrors);
      const fence = owner.nativeRetirementFenceFailure;
      if (fence) failures.push(fence.error);
    }
    return failures;
  }

  private retryNativeDrawingRetirements(): void {
    const errors: unknown[] = [];
    for (const owner of [...this.retiredNativeDrawingOwners.keys()]) {
      if (owner.nativeRetirementComplete) {
        this.refreshNativeDrawingRetirement(owner);
        continue;
      }
      if (!owner.retirementDestructionErrors.length && !owner.nativeRetirementFenceFailure) continue;
      let failed = false;
      try { owner.retryNativeRetirement(); } catch (error) { failed = true; errors.push(error); }
      if (!failed) {
        const remaining = owner.retirementDestructionErrors;
        if (remaining.length) errors.push(new AggregateError(remaining, "Native drawing destruction remains incomplete"));
        else if (owner.nativeRetirementFenceFailure) errors.push(owner.nativeRetirementFenceFailure.error);
      }
      this.refreshNativeDrawingRetirement(owner);
    }
    if (errors.length) throw new AggregateError(errors, "Native drawing retirement failed", { cause: errors[0] });
  }

  private whenNativeDrawingRetired(): Promise<void> {
    // A reentrant receipt must retain failures visible at its creation even if
    // the surrounding disposal subsequently retries and releases the handle.
    const observedFailures = this.nativeDrawingRetirementFailures();
    return new Promise<void>((resolve, reject) => {
      const check = (): void => {
        if (this.disposalInProgress || this.releasingLostDeviceResources) return;
        const failures = [...new Set([...observedFailures, ...this.nativeDrawingRetirementFailures()])];
        if (failures.length) {
          this.nativeDrawingRetirementWaiters.delete(check);
          reject(new AggregateError(failures, "Native drawing retirement failed", { cause: failures[0] }));
        } else if (!this.retiredNativeDrawingOwners.size) {
          this.nativeDrawingRetirementWaiters.delete(check);
          resolve();
        }
      };
      this.nativeDrawingRetirementWaiters.add(check);
      check();
    });
  }

  private abortPrecompiles(reason: Error): void {
    for (const controller of this.precompileControllers) controller.abort(reason);
  }

  /**
   * Only warm targets whose eventual identity is knowable without acquiring a
   * frame surface. Unknown/mutable routes retain the ordinary draw fallback.
   */
  private nativePrecompilePlan(
    input: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
    source: RenderSource | Iterable<RenderItem> | Scene,
    views: readonly RendererView[] | undefined,
    generation: number | undefined
  ): { readonly path: "deferred" | "meshlet" | "visibility"; readonly key: string; readonly format: string; readonly sampleCount: 1 | 4; readonly sharedPhysical: boolean } | undefined {
    if (this.device.kind !== "webgpu" || !this.nativeDrawingPipelines || generation === undefined || views) return undefined;
    const path = this.drawingPathOptions.mode;
    if (path !== "deferred" && path !== "meshlet" && path !== "visibility") return undefined;
    if (!(input instanceof Scene) && !isIterable(input) && isRendererInput(input) && (input.target || input.viewport || input.scissor)) return undefined;
    const state = this.device.captureState();
    if (state.get("frameActive") !== false) return undefined;
    const native = this.device as RenderDevice & { getNativeRenderSurface?: unknown; getNativeDeferredSurface?: unknown; markNativeRenderSurfaceWritten?: unknown; hasNativeSurfaceViewOverride?: unknown };
    if (typeof native.hasNativeSurfaceViewOverride !== "function") return undefined;
    const object = source instanceof Scene || isIterable(source) ? undefined : source;
    if (object && "renderTarget" in object) {
      const target = Object.getOwnPropertyDescriptor(object, "renderTarget");
      if (!target || !("value" in target) || target.value) return undefined;
    }
    const post = object && "postprocess" in object ? Object.getOwnPropertyDescriptor(object, "postprocess") : undefined;
    if (object && "postprocess" in object && (!post || !("value" in post))) return undefined;
    if (post?.value) {
      if (typeof native.getNativeDeferredSurface !== "function" || typeof post.value !== "object") return undefined;
      // Only the explicit root HDR target is predictable outside a frame.
      const format = Object.getOwnPropertyDescriptor(post.value, "targetFormat");
      const samples = Object.getOwnPropertyDescriptor(post.value, "sampleCount");
      if (!format || !("value" in format) || format.value !== "rgba16f" ||
          !samples || !("value" in samples) || (samples.value !== 1 && samples.value !== 4)) return undefined;
      if (path === "visibility" && samples.value !== 1) return undefined;
      return { path, key: `${path}-shared:${generation}:rgba16float:${this.width}x${this.height}:${samples.value}`,
        format: "rgba16float", sampleCount: samples.value, sharedPhysical: true };
    }
    const flags = rendererQrFlags(this.device);
    if (!isTrustedQrFlags(flags) || qrCoreOutputOn(flags) || qrGeneratedProgramsOn(flags) || frameContributors(flags).length ||
        typeof native.getNativeRenderSurface !== "function" || typeof native.markNativeRenderSurfaceWritten !== "function") return undefined;
    const format = state.get("presentationFormat");
    if (typeof format !== "string" || !["rgba8unorm", "rgba8unorm-srgb", "bgra8unorm", "bgra8unorm-srgb"].includes(format)) return undefined;
    return { path, key: `${path}:${generation}:${format}:${this.width}x${this.height}`,
      format, sampleCount: 1, sharedPhysical: false };
  }

  private async warmNativeDrawingForPrecompile(
    input: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
    source: RenderSource | Iterable<RenderItem> | Scene,
    views: readonly RendererView[] | undefined,
    generation: number | undefined,
    signal: AbortSignal
  ): Promise<void> {
    // One renderer publishes at most one native drawing pipeline. Other
    // precompile callers wait for this attempt and then reassess its identity.
    while (this.nativeDrawingWarmup) await waitForWarmup(this.nativeDrawingWarmup, [signal]);
    assertWarmupActive([signal]);
    const plan = this.nativePrecompilePlan(input, source, views, generation);
    if (!plan || this.nativeDrawingPipeline?.key === plan.key) return;
    let finish!: () => void;
    const barrier = new Promise<void>((resolve) => { finish = resolve; });
    this.nativeDrawingWarmup = barrier;
    const previous = this.nativeDrawingPipeline;
    let candidate: DeferredPipeline | MeshletPipeline | VisibilityBufferPipeline | undefined;
    let failure: unknown;
    let failed = false;
    try {
      const native = this.device as RenderDevice & { readonly nativeGpuDevice?: unknown };
      if (this.device.captureState().get("frameActive") !== false) return;
      const device = native.nativeGpuDevice;
      if (!device) return;
      try {
        candidate = plan.path === "meshlet"
          ? await this.nativeDrawingPipelines!.MeshletPipeline.createWarmed(device, { outputFormat: plan.format, allowFallback: false }, signal,
              plan.sharedPhysical ? { sampleCount: plan.sampleCount } : undefined)
          : plan.path === "visibility"
            ? plan.sharedPhysical
              ? await this.nativeDrawingPipelines!.VisibilityBufferPipeline.createWarmed(device, { outputFormat: plan.format, allowFallback: false }, signal, { physical: true })
              : await this.nativeDrawingPipelines!.VisibilityBufferPipeline.createWarmed(device, { outputFormat: plan.format, allowFallback: false }, signal)
            : await this.nativeDrawingPipelines!.DeferredPipeline.createWarmed(device, { outputFormat: plan.format, sampleCount: plan.sampleCount, allowFallback: false },
              { signal, sharedPhysical: plan.sharedPhysical });
      } catch {
        // This is speculative: preserve the existing draw-time capability
        // fallback and its errors instead of rejecting an otherwise valid scene.
        assertWarmupActive([signal]);
        if (this.device.contextLost || this.device.generation !== generation) throw new RenderDeviceError("Device changed during precompile", "DEVICE_LOST");
        return;
      }
      assertWarmupActive([signal]);
      this.assertAlive();
      if (this.device.contextLost || this.device.generation !== generation) throw new RenderDeviceError("Device changed during precompile", "DEVICE_LOST");
      // A resize, another frame or a source edit may have changed the target
      // while asynchronous compilation was in flight. Never overwrite it.
      if (this.nativeDrawingPipeline !== previous || this.nativePrecompilePlan(input, source, views, generation)?.key !== plan.key ||
          this.device.captureState().get("frameActive") !== false || native.nativeGpuDevice !== device) return;
      this.disposeNativeDrawingPipeline();
      assertWarmupActive([signal]);
      this.assertAlive();
      if (this.device.contextLost || this.device.generation !== generation) throw new RenderDeviceError("Device changed during precompile", "DEVICE_LOST");
      if (this.nativeDrawingPipeline !== null || this.nativePrecompilePlan(input, source, views, generation)?.key !== plan.key ||
          this.device.captureState().get("frameActive") !== false || native.nativeGpuDevice !== device) return;
      this.nativeDrawingPipeline = { key: plan.key, generation: generation!, pipeline: candidate };
      candidate = undefined;
    } catch (error) {
      failed = true;
      failure = error;
      throw error;
    } finally {
      try {
        candidate?.dispose();
      } catch (error) {
        if (failed) throw new AggregateError([failure, error], "Native drawing warmup and cleanup failed");
        throw error;
      } finally {
        if (this.nativeDrawingWarmup === barrier) this.nativeDrawingWarmup = null;
        finish();
      }
    }
  }

  /** Renderer-owned GPU objects are recreated lazily after context restoration. */
  private releaseLostDeviceResources(): void {
    if (this.disposed || this.releasingLostDeviceResources) return;
    this.abortPrecompiles(new RenderDeviceError("Device lost during precompile", "DEVICE_LOST"));
    this.releasingLostDeviceResources = true;
    try {
    if (this.pendingAuthoredFrame) this.abortAuthoredFrame(this.pendingAuthoredFrame);
    this.photometricResources?.dispose();
    this.photometricResources = undefined;
    this.finishProjectedSpotFrame();
    this.transmissionViews.clear();
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
    const release = (action: () => void): void => { try { action(); } catch { /* loss must not prevent other owners from retiring */ } };
    if (!this.disposed) {
      try {
        this.temporalHistory.dispose();
        // A disposer may have reentered renderer.dispose() while this loss
        // cleanup held the history. Its attempted cleanup was busy, but this
        // outer successful disposal is now the receipt for that same history.
        if (this.disposed) this.temporalCleanupPending = false;
      } catch (error) {
        this.temporalLossCleanupFailures.push(error);
        if (this.disposed) this.temporalCleanupPending = true;
      }
    }
    postDiagnostics.resetScope(this.viewScopeId);
    release(() => this.splatColorCompositor?.dispose());
    this.splatColorCompositor = undefined;
    release(() => this.weightedTransparency?.dispose());
    this.weightedTransparency = undefined;
    release(() => this.releasePostEffectScope());
    try { this.disposeNativeDrawingPipeline(); }
    catch (error) { this.nativeDrawingLossCleanupFailures.push(error); }
    release(() => this.shadowDepthTarget?.dispose());
    release(() => this.forwardColorTarget?.target.dispose());
    release(() => this.selectiveBloomTarget?.dispose());
    release(() => this.hdrSceneTarget?.target.dispose());
    release(() => this.sceneDepthCopyTarget?.dispose());
    this.shadowDepthTarget = null;
    this.forwardColorTarget = null;
    this.selectiveBloomTarget = null;
    this.hdrSceneTarget = null;
    this.sceneDepthCopyTarget = null;
    for (const target of this.viewTargets.values()) release(() => target.dispose());
    this.viewTargets.clear();
    release(() => this.viewComposite?.pipeline.dispose());
    release(() => this.viewComposite?.geometry.dispose());
    release(() => this.viewComposite?.shader.dispose());
    this.viewComposite = undefined;
    this.lastTemporalCameraPosition.clear();
    this.targetTemporalIds.clear();
    this.temporalViews.clear();
    this.lastDrawingPath = null;
    } finally {
      this.releasingLostDeviceResources = false;
      try { this.releaseTemporalHistoryOwnership(); }
      finally { this.notifyNativeDrawingRetirementWaiters(); }
    }
  }

  private photometricFrame(viewId: string | number): ForwardPassOptions["photometricFrame"] {
    if (!this.photometricProfiles) return undefined;
    const resources = this.photometricResources ??= new PhotometricFrameResources(this.viewScopeId, this.device);
    const identity: PhotometricFrameIdentity = { device: this.device, owner: this.viewScopeId, viewId, frameIndex: this.authoredFrameId };
    return { identity, resources, leases: [], onUnsupported: this.photometricProfiles.onUnsupported };
  }

  private finishPhotometricFrame(frame: ForwardPassOptions["photometricFrame"]): void {
    for (const lease of frame?.leases ?? []) lease.finish();
  }

  private projectedSpotFrame(viewId: string | number): ForwardPassOptions["projectedSpotFrame"] {
    if (!this.projectedSpotImages) return undefined;
    return { identity: { device: this.device, owner: this.viewScopeId, viewId, frameIndex: this.authoredFrameId },
      resolveResource: this.projectedSpotImages.resolveResource, onUnsupported: this.projectedSpotImages.onUnsupported, leases: new Set() };
  }

  /** Retain unsuccessful releases and retry after the next device frame or loss. */
  private finishProjectedSpotFrame(frame?: ForwardPassOptions["projectedSpotFrame"]): void {
    let pending = pendingProjectedSpotLeases.get(this.device);
    if (frame?.leases.size) {
      if (!pending) { pending = new Set(); pendingProjectedSpotLeases.set(this.device, pending); }
      for (const lease of frame.leases) pending.add(lease);
      frame.leases.clear();
    }
    if (!pending) return;
    for (const lease of [...pending]) {
      try { if (lease.release()) pending.delete(lease); } catch { /* Keep it until a later frame or device loss. */ }
    }
    if (pending.size === 0) pendingProjectedSpotLeases.delete(this.device);
  }

  /** Attempt the bounded native path without dropping unsupported frame features. */
  private selectDrawingPath(
    input: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
    camera: CameraLike | undefined,
    views: readonly RendererView[] | undefined
  ): { readonly input: RendererInput | RenderSource | Iterable<RenderItem> | Scene; readonly diagnostics: RendererDrawingPathDiagnostics; readonly rendered?: RenderDeviceDiagnostics; readonly deferredInFrame?: boolean } {
    this.assertAlive();
    const requested = this.drawingPathOptions.mode;
    const forward: RendererDrawingPathDiagnostics = { requested, active: "forward" };
    if (requested === "forward") return { input, diagnostics: forward };
    let refreshFallbackLights: (() => RendererInput | RenderSource | Iterable<RenderItem> | Scene | undefined) | undefined;
    const fallback = (reason: string, fallbackInput = input) => {
      if (!this.drawingPathOptions.allowFallback) {
        throw new RenderDeviceError(`Renderer ${requested} path cannot render this frame: ${reason}`, "NATIVE_DRAW_INCOMPATIBLE", { requested, reason });
      }
      return { input: refreshFallbackLights?.() ?? fallbackInput, diagnostics: { ...forward, fallbackReason: reason } };
    };
    // These optional admission checks iterate lights. For the opaque native
    // paths, leave a one-shot or getter-backed collection untouched when the
    // forward fallback is available.
    if ((requested === "meshlet" || requested === "visibility") &&
        this.drawingPathOptions.allowFallback && (this.projectedSpotImages || this.photometricProfiles)) {
      const candidate = normalizeRendererInput(input, camera).source;
      if (!(candidate instanceof Scene) && !isIterable(candidate) && "collectedLights" in candidate) {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, "collectedLights");
        if (!descriptor || !("value" in descriptor) || (descriptor.value !== undefined && !isOrdinaryLightArray(descriptor.value))) {
          return fallback("lights or renderer-owned batching require the full forward renderer");
        }
      }
    }
    if (this.projectedSpotImages) {
      const source = normalizeRendererInput(input, camera).source;
      if (collectRenderLights(source).some((light) => light.projectedImage !== undefined)) {
        if (this.drawingPathOptions.allowFallback) return fallback("projected spot images require the full forward renderer");
        const issueViews = views?.map((view, index) => viewHistoryId(view.id ?? index)) ?? ["single"];
        for (const viewId of issueViews) this.projectedSpotImages.onUnsupported({ reason: "drawing-path-unsupported",
          message: "The selected drawing path cannot apply projected spot images and forward fallback is disabled; the frame was stopped.",
          viewId, frameIndex: this.authoredFrameId });
        throw new RenderDeviceError("Projected spot images require the forward renderer", "PROJECTED_SPOT_DRAWING_PATH_UNSUPPORTED");
      }
    }
    if (this.photometricProfiles) {
      const source = normalizeRendererInput(input, camera).source;
      if (collectRenderLights(source).some((light) => light.photometricProfile !== undefined)) {
        if (this.drawingPathOptions.allowFallback) return fallback("photometric profiles require the full forward renderer");
        const issueViews = views?.map((view, index) => viewHistoryId(view.id ?? index)) ?? ["single"];
        for (const viewId of issueViews) this.photometricProfiles.onUnsupported({ reason: "drawing-path-unsupported",
          message: "The selected drawing path cannot apply photometric profiles and forward fallback is disabled; the frame was stopped.",
          viewId, frameIndex: this.authoredFrameId });
        throw new RenderDeviceError("Photometric profiles require the forward renderer", "PHOTOMETRIC_DRAWING_PATH_UNSUPPORTED");
      }
    }
    const native = this.device as RenderDevice & {
      readonly nativeGpuDevice?: unknown;
      readonly generation?: number;
      readonly depthConvention?: DepthConvention;
      getNativeRenderSurface?(target: RenderTarget | null): { readonly view: unknown; readonly width: number; readonly height: number; readonly format: string; readonly generation: number; readonly sampleCount: number };
      getNativeDeferredSurface?: unknown;
      markNativeRenderSurfaceWritten?(target: RenderTarget | null): void;
      hasNativeSurfaceViewOverride?(target: RenderTarget | null): boolean;
    };
    if (native.generation !== undefined && this.nativeDrawingPipeline && native.generation !== this.nativeDrawingPipeline.generation) this.disposeNativeDrawingPipeline();
    if (this.device.kind !== "webgpu" || !native.nativeGpuDevice || !native.getNativeRenderSurface || !native.markNativeRenderSurfaceWritten || !native.hasNativeSurfaceViewOverride) return fallback("a native WebGPU device and frame surface are required");
    if (views) return fallback("multiple views require the full forward renderer");
    if (isRendererInput(input) && (input.viewport || input.scissor)) return fallback("viewport or scissor requires the full forward renderer");
    const normalized = normalizeRendererInput(input, camera);
    const source = normalized.source;
    if (!(source instanceof Scene) && !isIterable(source) && ADVANCED_LIGHTING_PREPARE_FRAME in source) return fallback("advanced lighting requires the full forward renderer");
    if (!(source instanceof Scene) && !isIterable(source)) {
      for (const key of ["globalClipping", "materialClippingFor"] as const) {
        if (!(key in source)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(source, key);
        if (!descriptor || !("value" in descriptor) || descriptor.value != null) return fallback("clipping requires the full forward renderer");
      }
    }
    // The native opaque pipelines do not composite splat draws. Avoid reading a
    // getter here: the forward frame may be the only permitted consumer of it.
    if (!(source instanceof Scene) && !isIterable(source) && "gaussianSplats" in source) {
      const splats = Object.getOwnPropertyDescriptor(source, "gaussianSplats");
      if (!splats || !("value" in splats) || (splats.value != null && (!Array.isArray(splats.value) || splats.value.length > 0))) {
        return fallback("Gaussian splats require the full forward renderer");
      }
    }
    // Native opaque paths do not composite volumes. A getter is left for the
    // forward route to consume once, rather than being evaluated speculatively.
    if (!(source instanceof Scene) && !isIterable(source) && "scalarVolumes" in source) {
      const volumes = Object.getOwnPropertyDescriptor(source, "scalarVolumes");
      if (!volumes || !("value" in volumes) || (volumes.value != null && (!Array.isArray(volumes.value) || volumes.value.length > 0))) {
        return fallback("Scalar volumes require the full forward renderer");
      }
    }
    // HDR-backed native frames use the ordinary graph and its ordered
    // contributor hooks; physical admission runs on the collected items.
    // Getter-backed inputs stay on the existing fallback without speculative reads.
    const post = !(source instanceof Scene) && !isIterable(source) ? Object.getOwnPropertyDescriptor(source, "postprocess") : undefined;
    const hasPostProperty = !(source instanceof Scene) && !isIterable(source) && "postprocess" in source;
    const knownPost = !hasPostProperty || (post && "value" in post);
    if ((requested === "deferred" || requested === "meshlet" || requested === "visibility") && typeof native.getNativeDeferredSurface === "function" && knownPost &&
        ((post && "value" in post && post.value) || qrCoreOutputOn(rendererQrFlags(this.device)))) {
      return { input, diagnostics: forward, deferredInFrame: true };
    }
    if (this.activePrd07Operation) return fallback("app-managed VFX requires the full forward renderer");
    if (qrCoreOutputOn(rendererQrFlags(this.device)) || qrGeneratedProgramsOn(rendererQrFlags(this.device))) return fallback("the configured output or generated shader route requires the full forward renderer");
    if (frameContributors(rendererQrFlags(this.device)).length) return fallback("active frame contributors require the full forward renderer");
    const explicitTarget = collectRenderTarget(source);
    const shadow = collectRendererShadowOptions(source);
    if (collectPostprocess(source)) return fallback("postprocessing requires the full forward renderer");
    if (collectForwardShadowMap(source) || (shadow && shadow.enabled !== false)) return fallback("shadows require the full forward renderer");
    if (explicitTarget) return fallback("offscreen targets require the full forward renderer until native depth attachments are shared");
    if (collectEnvironmentBackground(source) || collectEnvironmentFog(source) || (!(source instanceof Scene) && !isIterable(source) && source.environmentLighting)) return fallback("the environment requires the full forward renderer");
    const sourceOptions = !(source instanceof Scene) && !isIterable(source) ? source : undefined;
    const opaqueNative = requested === "meshlet" || requested === "visibility";
    if (!opaqueNative && sourceOptions && (sourceOptions.collectedLights !== undefined || sourceOptions.staticBatching || sourceOptions.staticMeshConsolidation)) return fallback("lights or renderer-owned batching require the full forward renderer");
    const hasLightField = opaqueNative && sourceOptions !== undefined && "collectedLights" in sourceOptions;
    const lightField = hasLightField ? Object.getOwnPropertyDescriptor(sourceOptions, "collectedLights") : undefined;
    if (hasLightField && (!lightField || !("value" in lightField) || !lightField.enumerable)) return fallback("lights or renderer-owned batching require the full forward renderer");
    const lights = lightField?.value as Iterable<CollectedLight> | undefined;
    // An explicit empty array suppresses the forward renderer's default light
    // rig. Do not consume other iterables here: a fallback may need a one-shot
    // collection, and nonempty lighting is not represented by this path.
    if (lights !== undefined && (!isOrdinaryLightArray(lights) || lights.length !== 0)) return fallback("lights or renderer-owned batching require the full forward renderer");
    const batching = opaqueNative ? sourceOptions?.staticBatching : undefined;
    if (opaqueNative && (sourceOptions?.staticMeshConsolidation || (batching && batching !== true))) return fallback("lights or renderer-owned batching require the full forward renderer");
    if (sceneFromSource(source)?.collectLights().length) return fallback("scene lights require the full forward renderer");
    if (native.depthConvention?.mode && native.depthConvention.mode !== "standard") return fallback("nonstandard depth requires the full forward renderer");

    // Snapshot before inspecting items: a later fallback must retain one-shot sources.
    const snapshot = { ...snapshotRendererSource(source), cameraPolicy: collectCameraPolicy(source) };
    const fallbackInput = isRendererInput(input) ? { ...input, source: snapshot } : snapshot;
    const lightsUnchanged = (): boolean => {
      if (!opaqueNative || !sourceOptions) return true;
      if (("collectedLights" in sourceOptions) !== hasLightField) return false;
      if (!hasLightField) return true;
      const current = Object.getOwnPropertyDescriptor(sourceOptions, "collectedLights");
      return !!current && "value" in current && current.value === lights &&
        (lights === undefined || (isOrdinaryLightArray(lights) && lights.length === 0));
    };
    refreshFallbackLights = () => {
      if (lightsUnchanged()) return undefined;
      const current = { ...snapshot, collectedLights: sourceOptions?.collectedLights };
      return isRendererInput(input) ? { ...input, source: current } : current;
    };
    if (!lightsUnchanged()) return fallback("lights or renderer-owned batching require the full forward renderer", fallbackInput);
    const explicit = snapshot.renderItems ? [...snapshot.renderItems] : [];
    // Root frames request automatic batching even when there is only one
    // explicit draw. No batch can form in that case; leave the fallback source
    // unchanged and collect the native attempt without the optimization.
    if (batching && (snapshot.scene || explicit.length > 1)) return fallback("lights or renderer-owned batching require the full forward renderer", fallbackInput);
    const nativeSource = batching ? { ...snapshot, staticBatching: false } : snapshot;
    if (explicit.some((item) => item.modelViewProjectionMatrix || item.normalMatrix)) return fallback("authored model-view-projection or normal matrices require the full forward renderer", fallbackInput);
    sceneFromSource(snapshot)?.updateWorldTransforms();
    const target = collectRenderTarget(snapshot) ?? null;
    validateExplicitRenderTarget(target ?? undefined);
    const width = target?.width ?? this.width, height = target?.height ?? this.height;
    const policy = collectCameraPolicy(snapshot);
    let resolved = resolveCamera(snapshot, normalized.camera, { width, height }, {
      allowSceneCamera: !(normalized.camera === undefined && (policy === "identity" || hasExplicitAutoFrameCameraPolicy(snapshot)))
    });
    if (!resolved && policy === "require") throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    this.assertSupportedCameraDepth(resolved);
    const collection = collectRenderItemsWithDiagnostics(nativeSource, resolved?.viewProjectionMatrix, resolved?.camera, false, resolved?.layerMask, this, undefined, rendererQrFlags(this.device), this.device);
    if (collection.items.some(itemMayClip)) return fallback("clipping requires the full forward renderer", fallbackInput);
    if (collection.items.some((item) => hasNegativeHandedness(toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label)))) return fallback("reflected object winding requires the full forward renderer", fallbackInput);
    if (!resolved && policy === "auto-frame") resolved = createAutoFrameCamera(snapshot, collection.items, width, height);
    let scene: NativeDrawingScene;
    try {
      // These matrices were synthesized by collection. Authored overrides were
      // rejected above, and the native adapter derives both from modelMatrix.
      const ordered = sortForwardRenderItems(collection.items, collectSourceCameraPosition(snapshot) ?? resolved?.cameraPosition);
      scene = this.nativeDrawingPipelines!.nativeDrawingSceneFromRenderItems(ordered.map(({ normalMatrix: _normal, modelViewProjectionMatrix: _mvp, ...item }) => item));
    } catch (error) {
      if (error instanceof RenderDeviceError && error.code === "NATIVE_DRAW_INVALID_INPUT") return fallback(error.message, fallbackInput);
      throw error;
    }
    if (!lightsUnchanged()) return fallback("lights or renderer-owned batching require the full forward renderer", fallbackInput);
    if (opaqueNative && sceneFromSource(source)?.collectLights().length) return fallback("scene lights require the full forward renderer", fallbackInput);
    if (!target) this.ensureWebGPUCanvasSrgb();
    this.device.setRenderTarget(target);
    this.beginRendererDeviceFrame(width, height);
    let submission: NativeDrawingDiagnostics | undefined;
    let incompatible: string | undefined;
    try {
      let surface: ReturnType<NonNullable<typeof native.getNativeRenderSurface>>;
      try {
        surface = native.getNativeRenderSurface(target);
        if (native.hasNativeSurfaceViewOverride(target)) return fallback("a retained viewport or scissor requires the full forward renderer", fallbackInput);
        if (surface.width !== width || surface.height !== height || surface.sampleCount !== 1) return fallback("native surface dimensions or sample count are incompatible", fallbackInput);
        const key = `${requested}:${surface.generation}:${surface.format}:${surface.width}x${surface.height}`;
        if (this.nativeDrawingPipeline?.key !== key) {
          this.disposeNativeDrawingPipeline();
          const options = { outputFormat: surface.format, allowFallback: false };
          const pipeline = requested === "deferred" ? new this.nativeDrawingPipelines!.DeferredPipeline(native.nativeGpuDevice, options)
            : requested === "meshlet" ? new this.nativeDrawingPipelines!.MeshletPipeline(native.nativeGpuDevice, options)
              : new this.nativeDrawingPipelines!.VisibilityBufferPipeline(native.nativeGpuDevice, options);
          this.nativeDrawingPipeline = { key, generation: surface.generation, pipeline };
        }
      } catch (error) {
        if (error instanceof RenderDeviceError && (error.code.startsWith("NATIVE_DRAW_") || error.code === "WEBGPU_SURFACE_UNAVAILABLE" || error.code === "WEBGPU_SURFACE_MULTISAMPLED")) return fallback(error.message, fallbackInput);
        throw error;
      }
      try {
        if (!lightsUnchanged()) return fallback("lights or renderer-owned batching require the full forward renderer", fallbackInput);
        submission = this.nativeDrawingPipeline!.pipeline.render({ scene, viewProjection: resolved?.viewProjectionMatrix ?? identityMat4(), surface, clearColor: this.clearColor });
      } catch (error) {
        // These capability errors are raised before queue submission by the
        // native pipelines. Other failures may occur after submission and must
        // propagate rather than replay the frame silently.
        if (error instanceof RenderDeviceError && (error.code === "NATIVE_DRAW_CAPABILITY_UNAVAILABLE" || error.code === "NATIVE_DRAW_INVALID_INPUT")) incompatible = error.message;
        else throw error;
      }
      if (submission) native.markNativeRenderSurfaceWritten(target);
    } finally {
      try { this.device.endFrame(); } finally { this.finishProjectedSpotFrame(); }
    }
    if (incompatible) return fallback(incompatible, fallbackInput);
    const diagnostics = submission!;
    this.lastDrawingPath = diagnostics;
    this.markFrameSubmitted();
    const result = withRendererFrameDiagnostics({ ...this.device.getDiagnostics(), drawCalls: diagnostics.drawCalls, triangles: diagnostics.triangles, drawingPath: diagnostics }, collection.diagnostics);
    return { input: fallbackInput, diagnostics, rendered: result };
  }

  /** Keep unsupported native frames in this already-collected forward frame. */
  private deferredFrameFallback(reason: string): undefined {
    const requested = this.drawingPathOptions.mode === "meshlet" ? "meshlet" : this.drawingPathOptions.mode === "visibility" ? "visibility" : "deferred";
    if (!this.drawingPathOptions.allowFallback) {
      throw new RenderDeviceError(`Renderer ${requested} path cannot render this frame: ${reason}`, "NATIVE_DRAW_INCOMPATIBLE", { requested, reason });
    }
    this.lastDrawingPath = { requested, active: "forward", fallbackReason: reason };
    return undefined;
  }

  private makeBenchmarkMaskFrame(options: {
    readonly items: readonly RenderItem[];
    readonly viewProjection: Float32Array | readonly number[] | undefined;
    readonly layerMask: number | undefined;
    readonly cameraPosition: readonly [number, number, number] | undefined;
    readonly postprocess: RendererPostProcessOptions | undefined;
    readonly output: RenderTarget | undefined;
    readonly mergedIdentities: boolean;
    readonly hasExtraSceneGeometry: boolean;
    readonly hasSplats: boolean;
  }): RendererBenchmarkMaskFrame {
    const unsupported = (reason: string): RendererBenchmarkMaskFrame => ({ unsupported: reason });
    if (this.renderingViews || this.activeRasterViewport || options.output) return unsupported("multi-view, viewport and offscreen frames are unsupported");
    if (options.postprocess?.temporal) return unsupported("temporal frames are unsupported");
    if (options.mergedIdentities || options.hasSplats || options.hasExtraSceneGeometry) return unsupported("merged objects or additional contributor geometry are unsupported");
    if (!options.viewProjection || options.viewProjection.length !== 16 || !Array.from(options.viewProjection).every(Number.isFinite)) return unsupported("a finite submitted camera matrix is required");
    const split = splitForwardItems(options.items, options.cameraPosition);
    if (split.transmission.length || split.transparent.length || options.items.some(item => item.instanceTransforms || item.instanceAttributes?.length || (item.instanceCount !== undefined && item.instanceCount !== 1))) return unsupported("transparent, transmissive and instanced draws are unsupported");
    if (options.items.some(item => item.onBeforeRender)) return unsupported("per-draw callbacks are unsupported");
    const vp = toMat4(options.viewProjection, "viewProjection");
    for (const item of options.items) {
      const expected = multiplyMat4(vp, toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label));
      if (item.modelViewProjectionMatrix && (item.modelViewProjectionMatrix.length !== 16 || !Array.from(item.modelViewProjectionMatrix).every((value, index) => value === expected[index]))) {
        return unsupported("custom per-item projection matrices are unsupported");
      }
    }
    const matrix = Object.freeze(Array.from(options.viewProjection));
    const items = sortForwardRenderItems(split.opaque, options.cameraPosition).map(item => {
      const copy = { ...item } as RenderItem;
      for (const key of ["modelMatrix", "geometryMatrix", "normalMatrix", "modelViewProjectionMatrix"] as const) {
        const value = item[key];
        if (value) Object.assign(copy, { [key]: Object.freeze(Array.from(value)) });
      }
      if (item.drawRange) Object.assign(copy, { drawRange: Object.freeze({ ...item.drawRange }) });
      return Object.freeze(copy);
    });
    return { items: Object.freeze(items), viewProjectionMatrix: matrix, ...(options.layerMask !== undefined ? { layerMask: options.layerMask } : {}) };
  }

  private directTransmissionPrepass(target: RenderTarget, shared: ForwardPassOptions, background: EnvironmentBackgroundOptions | undefined, viewProjection: Float32Array | readonly number[] | undefined, reads: readonly string[]): RenderPass {
    const clear = this.directLinearClearValid ? this.outputClearColor ?? this.clearColor : this.clearColor;
    const opaque = new ForwardPass({ ...shared, outputColorSpace: "linear", inputColorResource: undefined });
    const sky = background ? new EnvironmentBackgroundPass({ ...background, outputColorSpace: "linear",
      inverseViewProjectionMatrix: background.inverseViewProjectionMatrix ?? invertMat4(toMat4(viewProjection ?? identityMat4(), "viewProjection")), shaderLibrary: this.shaderLibrary }) : undefined;
    return { name: "prd04.direct-linear-opaque", reads, writes: ["prd04.direct-linear-opaque"], execute: context => {
      if (!this.directTransmissionReplaySafe(shared.items, rendererQrFlags(this.device))) {
        throw new RenderDeviceError("Direct transmission replay state changed before the prepass", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
      const previous = this.device.getRenderTarget?.();
      if (previous === undefined) throw new RenderDeviceError("Direct transmission requires target state restoration", "TRANSMISSION_TARGET_STATE_UNAVAILABLE");
      try {
        this.device.setRenderTarget(target);
        this.device.clear([clear[0], clear[1], clear[2], this.clearColor[3]]);
        sky?.execute(context);
        opaque.execute(context);
      } finally { this.device.setRenderTarget(previous); }
    } };
  }

  private directTransmissionReplaySafe(items: readonly RenderItem[], flags: QrFlags): boolean {
    return isUnmodifiedDefaultShaderLibrary(this.shaderLibrary) && forwardDrawReplaySafe(items, flags);
  }

  private assertTrustedTransmissionFlags(items: readonly RenderItem[], flags: QrFlags): void {
    // A stateful `on` callback could report transmission disabled to the
    // preflight and enabled to material selection a moment later.
    if (!isTrustedQrFlags(flags) && items.some(itemReportsTransmissionLobe)) {
      throw new RenderDeviceError("Transmission requires stable renderer feature flags", "TRANSMISSION_FLAGS_UNTRUSTED");
    }
  }

  private checkedDirectReplayPass(pass: RenderPass, items: readonly RenderItem[]): RenderPass {
    return { name: pass.name, reads: pass.reads, writes: pass.writes, allowReadWriteHazards: pass.allowReadWriteHazards,
      execute: context => {
        if (!this.directTransmissionReplaySafe(items, rendererQrFlags(this.device))) {
          throw new RenderDeviceError("Direct transmission replay state changed before the final draw", "TRANSMISSION_REPLAY_UNSUPPORTED");
        }
        pass.execute(context);
      } };
  }

  private bindTransmissionPassTarget(pass: RenderPass, target: RenderTarget, blackboard: Map<string, unknown>): RenderPass {
    if (!isTrustedTransmissionCapturePass(pass)) throw new RenderDeviceError("Direct transmission cannot replay an untrusted contributor pass", "TRANSMISSION_REPLAY_UNSUPPORTED");
    return { name: pass.name, reads: pass.reads, writes: pass.writes, execute: context => {
      const previous = this.device.getRenderTarget?.();
      if (previous === undefined) throw new RenderDeviceError("Direct transmission requires target state restoration", "TRANSMISSION_TARGET_STATE_UNAVAILABLE");
      const previousTarget = blackboard.get(PRD01_FORWARD_TARGET), previousSpace = blackboard.get("prd01.outputColorSpace");
      const hadTarget = blackboard.has(PRD01_FORWARD_TARGET), hadSpace = blackboard.has("prd01.outputColorSpace");
      try {
        blackboard.set(PRD01_FORWARD_TARGET, target);
        blackboard.set("prd01.outputColorSpace", "linear");
        this.device.setRenderTarget(target);
        pass.execute(context);
      } finally {
        try { this.device.setRenderTarget(previous); } finally {
          if (hadTarget) blackboard.set(PRD01_FORWARD_TARGET, previousTarget); else blackboard.delete(PRD01_FORWARD_TARGET);
          if (hadSpace) blackboard.set("prd01.outputColorSpace", previousSpace); else blackboard.delete("prd01.outputColorSpace");
        }
      }
    } };
  }

  private deferredOpaquePass(options: {
    readonly forward: ForwardPass;
    readonly items: readonly RenderItem[];
    readonly target: RenderTarget | undefined;
    readonly postprocess: RendererPostProcessOptions | undefined;
    readonly qrOutput: boolean;
    readonly frameContext: FrameContributorContext;
    readonly lights: readonly CollectedLight[];
    readonly environment: EnvironmentLightingOptions | undefined;
    readonly fog: ForwardEnvironmentFogOptions | false | undefined;
    readonly shadow: ForwardShadowMapOptions | undefined;
    readonly background: EnvironmentBackgroundOptions | undefined;
    readonly cameraPosition: readonly [number, number, number] | undefined;
    readonly viewProjection: Float32Array | readonly number[] | undefined;
  }): RenderPass | undefined {
    const { forward, items, target, postprocess, qrOutput, frameContext, lights, environment, fog, shadow, background, cameraPosition, viewProjection } = options;
    prd07RendererContextSnapshot(frameContext);
    const native = this.device as RenderDevice & {
      readonly nativeGpuDevice?: unknown;
      readonly generation?: number;
      readonly depthConvention?: DepthConvention;
      getNativeDeferredSurface?(target: RenderTarget): NativeDeferredAttachments & { readonly generation: number };
      getNativeDeferredProbe?(texture: Texture): DeferredProbeLease;
      hasNativeSurfaceViewOverride?(target: RenderTarget | null): boolean;
    };
    if (!native.nativeGpuDevice || !native.getNativeDeferredSurface || !native.getNativeDeferredProbe || !native.hasNativeSurfaceViewOverride) return this.deferredFrameFallback("deferred borrowed attachments and probe support are unavailable");
    if (!target || (!postprocess && !qrOutput) || target.width !== this.width || target.height !== this.height || (target.colorTexture.format !== "rgba16f" && target.colorTexture.format !== "rgba32f") || (target.sampleCount !== 1 && target.sampleCount !== 4)) return this.deferredFrameFallback("a full-size HDR target with one or four samples is required");
    if (this.drawingPathOptions.mode === "visibility" && (target.sampleCount !== 1 || target.colorTexture.format !== "rgba16f")) return this.deferredFrameFallback("physical visibility requires a single-sample rgba16f target");
    if (native.depthConvention?.mode && native.depthConvention.mode !== "standard") return this.deferredFrameFallback("nonstandard depth requires the full forward renderer");
    if (postprocess?.temporal || postprocess?.execution === "cpu-deterministic") return this.deferredFrameFallback("temporal or CPU postprocessing requires the full forward renderer");
    if (fog || shadow || background) return this.deferredFrameFallback("fog, shadows or an environment background require the full forward renderer");
    if (!cameraPosition || !viewProjection || !cameraPosition.every(Number.isFinite)) return this.deferredFrameFallback("a finite resolved camera is required");
    if (lights.length > 1 || lights.some(light => light.kind !== "directional")) return this.deferredFrameFallback("the deferred physical path supports at most one directional light");
    const probe = environment?.environmentProbe;
    if (!probe || !prd02IblEnvironmentAvailable(environment)) return this.deferredFrameFallback("a resolved global PRD-02 environment probe is required");
    if (environment?.proceduralMap || !items.length) return this.deferredFrameFallback("procedural environments and empty frames require the full forward renderer");
    const pipeline = postprocess?.pipeline && typeof postprocess.pipeline === "object" ? postprocess.pipeline as { readonly alphaMode?: unknown; readonly backgroundCoverage?: unknown } : undefined;
    if (this.outputOptions.backgroundCoverage || (this.outputOptions.alphaMode && this.outputOptions.alphaMode !== "opaque") || pipeline?.backgroundCoverage || (pipeline?.alphaMode !== undefined && pipeline.alphaMode !== "opaque")) return this.deferredFrameFallback("background coverage or preserved alpha requires the full forward renderer");
    const flags = rendererQrFlags(this.device);
    if (flags.on("A3D_QR_VFX")) {
      // Deferred does not implement the wetness material response; check the
      // authenticated view packet before choosing the native opaque path.
      const wetness = prd07WetnessState(frameContext);
      if (wetness.wetness > 0 || wetness.rainRipples > 0 || wetness.snowCover > 0) return this.deferredFrameFallback("live PRD-07 wetness requires the full forward renderer");
    }
    const tier = this.liveQualityTier()?.settings ?? QUALITY_TIERS.high;
    const materialContext = { flags, tier };
    const selectedFeatures = shaderFeaturesFor(flags), selectedLobes = materialLobes(flags);
    let indirectFraction: boolean | undefined;
    const vp = Array.from(viewProjection) as Mat4;
    const sameMatrix = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((value, index) => value === b[index]);
    for (const item of items) {
      if (itemHasActiveClipping(item)) return this.deferredFrameFallback("clipping requires the full forward renderer");
      if (Symbol.for("@aura3d/rendering/advanced-lighting-bindings") in item) return this.deferredFrameFallback("advanced lighting requires the full forward renderer");
      const material = item.material;
      if (material && "baseMaterial" in material && !(material instanceof MaterialInstance)) return this.deferredFrameFallback("foreign material wrappers require the full forward renderer");
      const base = material instanceof MaterialInstance ? material.baseMaterial : material;
      if (!material || !base || base.shaderKey !== "aura3d/pbr-direct" || !materialRoutesToGeneratedProgram(base, { core: qrCoreGeneratorOn(flags), lobes: qrMaterialsLobeProgramsOn(flags) }, materialContext)) return this.deferredFrameFallback("each item needs the generated physical material");
      if (prd02ItemProbeBindings(item) || prd02ItemIrradianceBindings(item)) return this.deferredFrameFallback("local probes or irradiance volumes require the full forward renderer");
      const model = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
      if ((item.normalMatrix && !sameMatrix(item.normalMatrix, normalMatrixFromModel(model))) || (item.modelViewProjectionMatrix && !sameMatrix(item.modelViewProjectionMatrix, multiplyMat4(vp, model)))) return this.deferredFrameFallback("custom per-item matrices require the full forward renderer");
      const materialFeatures = base.programFeatures(materialContext);
      const selected = { ...materialFeatures.features, ...selectShaderFeatureBits({ item, pass: "forward", tier, flags, frameContext }) };
      const admission = this.nativeDrawingPipelines!.admitNativeDeferredFeatures(selected, selectedFeatures, materialFeatures.extensions, selectedLobes);
      if (admission.reason || !admission.ibl) return this.deferredFrameFallback(admission.reason ?? "the physical probe feature is unavailable");
      if (indirectFraction !== undefined && indirectFraction !== admission.indirectFraction) return this.deferredFrameFallback("mixed indirect-fraction variants require the full forward renderer");
      indirectFraction = admission.indirectFraction;
    }
    if (indirectFraction && target.colorTexture.format !== "rgba16f") return this.deferredFrameFallback("the indirect-fraction tag requires rgba16f");
    let scene: NativeDrawingScene;
    try {
      const ordered = sortForwardRenderItems(items, cameraPosition);
      scene = this.nativeDrawingPipelines!.nativeDrawingSceneFromRenderItems(ordered.map(({ normalMatrix: _normal, modelViewProjectionMatrix: _mvp, ...item }) => item), { physicalModel: "generated-metallic-roughness" });
    } catch (error) {
      if (error instanceof RenderDeviceError && error.code === "NATIVE_DRAW_INVALID_INPUT") return this.deferredFrameFallback(error.message);
      throw error;
    }
    const firstMaterial = items[0]!.material!;
    const uniforms = new Map<string, UniformValue>();
    applyPrd02EnvironmentUniforms(environment, items[0]!, firstMaterial, uniforms);
    const directional = lights[0];
    const light = {
      direction: directional ? [-directional.direction[0], -directional.direction[1], -directional.direction[2]] as const : [0, 0, 1] as const,
      color: directional ? directional.color.map(value => value * directional.intensity) as [number, number, number] : [0, 0, 0] as const,
      ambient: [0, 0, 0] as const
    };
    const execute = (context: RenderPassContext): void => {
      prd07RendererContextSnapshot(frameContext);
      const previousTarget = this.device.getRenderTarget?.() ?? null;
      this.device.setRenderTarget(target);
      try {
        if (native.hasNativeSurfaceViewOverride!(target)) {
          this.deferredFrameFallback("a retained viewport or scissor requires the full forward renderer");
          forward.execute(context);
          return;
        }
        // Probe upload can submit work; acquire the single-use attachment lease
        // only after that upload and immediately before the native submission.
        const probeLease = native.getNativeDeferredProbe!(probe.specularCube);
        const physicalProbe = this.nativeDrawingPipelines!.deferredProbeFromUniforms(uniforms, probeLease);
        const attachments = native.getNativeDeferredSurface!(target);
        if (attachments.sampleCount !== 1 && attachments.sampleCount !== 4) throw new RenderDeviceError("Deferred target sample count is unsupported", "NATIVE_DRAW_CAPABILITY_UNAVAILABLE");
        const requested = this.drawingPathOptions.mode === "meshlet" ? "meshlet" : this.drawingPathOptions.mode === "visibility" ? "visibility" : "deferred";
        const key = `${requested}-shared:${attachments.generation}:${attachments.colorFormat}:${attachments.width}x${attachments.height}:${attachments.sampleCount}`;
        if (this.nativeDrawingPipeline?.key !== key) {
          this.disposeNativeDrawingPipeline();
          const pipeline = requested === "meshlet"
            ? new this.nativeDrawingPipelines!.MeshletPipeline(native.nativeGpuDevice, { outputFormat: attachments.colorFormat, allowFallback: false })
            : requested === "visibility"
              ? new this.nativeDrawingPipelines!.VisibilityBufferPipeline(native.nativeGpuDevice, { outputFormat: attachments.colorFormat, allowFallback: false })
              : new this.nativeDrawingPipelines!.DeferredPipeline(native.nativeGpuDevice, { outputFormat: attachments.colorFormat, sampleCount: attachments.sampleCount, allowFallback: false });
          this.nativeDrawingPipeline = { key, generation: attachments.generation, pipeline };
        }
        const surface = { view: attachments.resolveView ?? attachments.colorView, width: attachments.width, height: attachments.height };
        prd07RendererContextSnapshot(frameContext);
        const result = this.nativeDrawingPipeline!.pipeline.render({ scene, viewProjection: vp, surface, deferredAttachments: attachments,
          light, physical: { cameraPosition, probe: physicalProbe, indirectFraction } });
        this.lastDrawingPath = result;
      } catch (error) {
        if (error instanceof RenderDeviceError && (error.code === "NATIVE_DRAW_INVALID_INPUT" || error.code === "NATIVE_DRAW_CAPABILITY_UNAVAILABLE" || error.code === "WEBGPU_DEFERRED_SURFACE_UNAVAILABLE" || error.code === "WEBGPU_DEFERRED_PROBE_UNAVAILABLE" || error.code === "WEBGPU_FLOAT32_FILTERABLE_REQUIRED")) {
          this.deferredFrameFallback(error.message);
          forward.execute(context);
          return;
        }
        throw error;
      } finally {
        this.device.setRenderTarget(previousTarget);
      }
    };
    return { name: forward.name, reads: forward.reads, writes: forward.writes, execute };
  }

  /**
   * Contributor factories run while the interleaved graph is being built.
   * Recheck the complete opaque partition and its live inputs only after that
   * planning, so a contributor cannot make a prebuilt native scene stale.
   */
  private deferredInterleavedOpaquePass(
    options: Parameters<Renderer["deferredOpaquePass"]>[0],
    opaqueItems: readonly RenderItem[]
  ): RenderPass {
    const { forward, items } = options;
    return { name: forward.name, reads: forward.reads, writes: forward.writes, execute: context => {
      prd07RendererContextSnapshot(options.frameContext);
      if (items.length !== opaqueItems.length || items.some((item, index) => item !== opaqueItems[index])) {
        this.deferredFrameFallback("transparent or filtered draws require the full forward renderer");
        forward.execute(context);
        return;
      }
      (this.deferredOpaquePass(options) ?? forward).execute(context);
    } };
  }

  /** SC-01: viewport/scissor requested for the frame about to bind its main target; consumed by `clearAndApplyView`. */
  private pendingViewState: PendingViewState | null = null;
  private activeRasterViewport: RendererRect | null = null;
  private splatColorCompositor: GaussianSplatColorComposite | undefined;
  private batchSource: object | undefined;
  private readonly pendingPackedLoopReleases = new Set<() => void>();

  private finishPackedLoopFrame(frame: PackedLoopFrame | undefined): void {
    frame?.finish((release) => {
      this.pendingPackedLoopReleases.add(release);
      return () => this.pendingPackedLoopReleases.delete(release);
    });
  }

  private rasterViewportIsFull(): boolean {
    if (!this.device.hasDefaultOutputOverride || this.device.hasDefaultOutputOverride()) return false;
    const full = (rect: RendererRect | undefined): boolean => !rect ||
      (rect.x === 0 && rect.y === 0 && rect.width === this.width && rect.height === this.height);
    return full(this.pendingViewState?.viewport) && full(this.pendingViewState?.scissor);
  }

  private trackBatchSource(source: RenderSource | Iterable<RenderItem> | Scene): void {
    const next = source instanceof Scene || isIterable(source) ? undefined : source;
    if (next === this.batchSource) return;
    disposeBatchPlanCacheFor(this);
    this.batchSource = next;
  }

  private releaseBatchSource(): void {
    this.batchSource = undefined;
    disposeBatchPlanCacheFor(this);
  }

  private beginAuthoredFrame(input: RendererInput | RenderSource | Iterable<RenderItem> | Scene): PendingAuthoredFrame {
    this.splatColorCompositor?.beginFrame();
    const requested = isRendererInput(input) ? input.frameId : undefined;
    if (requested !== undefined && (!Number.isSafeInteger(requested) || requested < 0)) {
      throw new RenderDeviceError("Renderer frameId must be a non-negative safe integer.", "INVALID_FRAME_ID", { frameId: requested });
    }
    const frameId = requested ?? ++this.frameSerial;
    const prior = this.pendingAuthoredFrame;
    if (prior && (prior.id !== frameId || requested === undefined)) this.finishAuthoredFrame(prior);
    if (!this.pendingAuthoredFrame && requested !== undefined && this.hasAuthoredFrame
      && this.authoredFrameId === requested && this.lastFinishedExplicitFrame === requested) {
      throw new RenderDeviceError("An explicitly finished frame cannot be resumed", "TEMPORAL_FRAME_CLOSED");
    }
    const isNewFrame = !this.pendingAuthoredFrame;
    const frame = this.pendingAuthoredFrame ?? {
      id: frameId, explicit: requested !== undefined, generation: this.device.generation,
      views: new Map(), activeViewIds: new Set(), initialViewIds: new Set(this.viewTargets.keys()),
      completedPasses: 0, cancelled: false
    };
    this.pendingAuthoredFrame = frame;
    try {
    const native = this.nativePostTransactions();
    if (isNewFrame && native) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "begin", frame.id, undefined, undefined,
      () => native.beginNativePostAuthoredFrame(this.viewScopeId, frame.id));
    this.assertAuthoredFrameCurrent(frame);
    if (!this.hasAuthoredFrame || frameId !== this.authoredFrameId) {
      let sample = typeof performance !== "undefined" ? performance.now() / 1000 : Date.now() / 1000;
      if (!Number.isFinite(sample)) sample = Date.now() / 1000;
      if (!Number.isFinite(sample)) throw new RenderDeviceError("Renderer frame clock must be finite", "INVALID_FRAME_TIME");
      this.authoredTimeSeconds = sample;
      this.hasAuthoredFrame = true;
    }
    this.authoredFrameId = frameId;
    if (requested !== undefined) this.frameSerial = Math.max(this.frameSerial, requested);
    return frame;
    } catch (error) {
      this.abortAuthoredFrame(frame);
      throw error;
    }
  }

  private completeAuthoredPass(frame: PendingAuthoredFrame): void {
    this.assertAuthoredFrameCurrent(frame);
    frame.completedPasses += 1;
    if (!frame.explicit) this.finishAuthoredFrame(frame);
  }

  private markFrameSubmitted(): void {
    this.submittedFrames += 1;
    notifyFirstFramePresented();
    this.submittedShadowFrameId += 1;
    if (this.lastShadowEvidence) this.lastShadowEvidence = { ...this.lastShadowEvidence, submissionFrameId: this.submittedShadowFrameId };
  }

  private prepareViews(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera: CameraLike | undefined, views: readonly RendererView[]) {
    this.assertAlive();
    const input = normalizeRendererInput(sourceOrInput, camera);
    // Each view is first written offscreen, then compositeViews clears and
    // presents independently of OutputPass. It neither verifies canvas alpha
    // nor establishes a common alpha association for its clear and views.
    // Do not claim the per-view warranty applies to that final composition.
    const sourcePost = collectPostprocess(input.source);
    const preservingViewPost = views.some((view) => {
      const post = view.postprocess === undefined ? sourcePost : view.postprocess;
      if (!post || typeof post !== "object" || !post.pipeline || typeof post.pipeline !== "object") return false;
      const policy = post.pipeline as Partial<PostPipelineOptions>;
      return policy.alphaMode === "straight" || policy.alphaMode === "premultiplied" || policy.inputAlphaMode !== undefined;
    });
    validateRendererOutputAlpha(this.outputOptions);
    if (this.outputOptions.alphaMode === "straight" || this.outputOptions.alphaMode === "premultiplied" || preservingViewPost) {
      throw new RenderDeviceError("OUTPUT_ALPHA_MODE_UNAVAILABLE: multi-view composition does not establish an output alpha policy", "OUTPUT_ALPHA_MODE_UNAVAILABLE");
    }
    const output = collectRenderTarget(input.source);
    validateExplicitRenderTarget(output);
    const width = output?.width ?? this.width;
    const height = output?.height ?? this.height;
    const ids = new Set<string | number>();
    const cameras: PreparedViewCamera[] = [];
    views.forEach((view, index) => {
      const id = view.id ?? index;
      if ((typeof id !== "string" && typeof id !== "number") || (typeof id === "string" && id.length === 0) || (typeof id === "number" && !Number.isFinite(id)) || ids.has(id)) {
        throw new RenderDeviceError("Renderer view IDs must be unique non-empty strings or finite numbers.", "INVALID_VIEW_ID", { id });
      }
      ids.add(id);
      validateViewRect("viewport", view.viewport, width, height);
      validateViewRect("scissor", view.scissor ?? view.viewport, width, height);
      // Check the projection produced for this viewport, not metadata from a
      // previous camera update. Check all views before any target is drawn.
      sceneFromSource(input.source)?.updateWorldTransforms();
      const resolved = resolveCamera(input.source, view.camera, view.viewport, { allowSceneCamera: true });
      this.assertSupportedCameraDepth(resolved);
      cameras.push({ resolved: snapshotResolvedViewCamera(resolved) });
    });
    const authoredFrame = this.pendingAuthoredFrame;
    this.assertAuthoredFrameCurrent(authoredFrame);
    for (const id of ids) authoredFrame.activeViewIds.add(id);
    // Snapshot explicit iterables once per authored frame, then cull independently
    // for each camera. One-shot iterators must not disappear after the first view.
    const base = snapshotRendererSource(input.source);
    const preparedCameras = cameras.map((entry) => {
      const cullingFrustum = matrixViewSceneFrustum(base, entry.resolved);
      return cullingFrustum ? { ...entry, cullingFrustum } : entry;
    });
    return { source: base, output, width, height, cameras: preparedCameras };
  }

  private retireViewTargets(active: ReadonlySet<string | number>): void {
    for (const [id, target] of this.viewTargets) {
      if (active.has(id)) continue;
      target.dispose();
      this.viewTargets.delete(id);
      this.temporalHistory.disposeView(viewHistoryId(id));
      postDiagnostics.resetView(this.viewScopeId, viewHistoryId(id));
      this.releasePostEffectView(viewHistoryId(id));
      this.lastTemporalCameraPosition.delete(viewHistoryId(id));
    }
  }

  private ensureViewTarget(id: string | number, viewport: RendererRect): RenderTarget {
    const previous = this.viewTargets.get(id);
    if (previous && !previous.disposed && previous.width === viewport.width && previous.height === viewport.height) return previous;
    previous?.dispose();
    const target = this.device.createRenderTarget({ width: viewport.width, height: viewport.height, label: `renderer-view-${String(id)}`, format: "rgba8", depth: true, sampleCount: 1 });
    this.viewTargets.set(id, target);
    return target;
  }

  private renderViews(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera: CameraLike | undefined, views: readonly RendererView[]): RenderDeviceDiagnostics {
    const frame = this.prepareViews(sourceOrInput, camera, views);
    const originalWidth = this.width, originalHeight = this.height;
    let last!: RenderDeviceDiagnostics;
    this.renderingViews = true;
    try {
      views.forEach((view, index) => {
        const viewId = view.id ?? index;
        this.activeViewId = viewHistoryId(viewId);
        this.activeTemporalReportId = viewId;
        this.activeCameraCut = view.cameraCut === true;
        const target = this.ensureViewTarget(viewId, view.viewport);
        this.width = target.width;
        this.height = target.height;
        last = this.renderFrame(viewFrameInput({ source: frame.source }, camera, view, target), undefined, false, frame.cameras[index]);
      });
      this.width = frame.width;
      this.height = frame.height;
      this.compositeViews(views, frame.output);
      this.markFrameSubmitted();
      return last;
    } finally {
      this.width = originalWidth;
      this.height = originalHeight;
      this.activeViewId = "single";
      this.activeTemporalReportId = "single";
      this.activeCameraCut = false;
      this.pendingViewState = null;
      this.renderingViews = false;
    }
  }

  private async renderViewsAsync(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera: CameraLike | undefined, views: readonly RendererView[]): Promise<RenderDeviceDiagnostics> {
    const frame = this.prepareViews(sourceOrInput, camera, views);
    const originalWidth = this.width, originalHeight = this.height;
    let last!: RenderDeviceDiagnostics;
    this.renderingViews = true;
    try {
      for (let index = 0; index < views.length; index += 1) {
        const view = views[index]!;
        const viewId = view.id ?? index;
        this.activeViewId = viewHistoryId(viewId);
        this.activeTemporalReportId = viewId;
        this.activeCameraCut = view.cameraCut === true;
        const target = this.ensureViewTarget(viewId, view.viewport);
        this.width = target.width;
        this.height = target.height;
        last = await this.renderAsyncFrame(viewFrameInput({ source: frame.source }, camera, view, target), undefined, false, frame.cameras[index]);
      }
      this.width = frame.width;
      this.height = frame.height;
      this.compositeViews(views, frame.output);
      this.markFrameSubmitted();
      return last;
    } finally {
      this.width = originalWidth;
      this.height = originalHeight;
      this.activeViewId = "single";
      this.activeTemporalReportId = "single";
      this.activeCameraCut = false;
      this.pendingViewState = null;
      this.renderingViews = false;
    }
  }

  private compositeViews(views: readonly RendererView[], output?: RenderTarget): void {
    const device = this.device;
    if (!device.setViewport || !device.setScissor || !device.setScissorTest) {
      throw new RenderDeviceError("This render device does not support viewport/scissor rendering.", "VIEWPORT_UNSUPPORTED", { backend: device.kind });
    }
    const composite = this.ensureViewComposite();
    const vertexBuffer = composite.geometry.vertexBuffer.upload(device);
    if (!output) this.ensureWebGPUCanvasSrgb();
    device.setRenderTarget(output ?? null);
    this.beginRendererDeviceFrame(this.width, this.height);
    try {
      device.clear(this.clearColor);
      for (let index = 0; index < views.length; index += 1) {
        const view = views[index]!;
        const target = this.viewTargets.get(view.id ?? index)!;
        const { viewport, scissor = viewport } = view;
        device.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
        device.setScissor(scissor.x, scissor.y, scissor.width, scissor.height);
        device.setScissorTest(true);
        device.draw(composite.pipeline.createDrawCommand({
          label: "renderer-view-composite",
          vertexBuffer,
          vertexCount: 3,
          uniforms: new Map<string, UniformValue>([["u_view", new TextureBinding({ name: "u_view", texture: target.colorTexture, required: true })], ["u_opacity", 1]])
        }));
      }
    } finally {
      device.setScissorTest(false);
      try { device.endFrame(); } finally { this.finishProjectedSpotFrame(); }
    }
  }

  private ensureViewComposite(): { readonly geometry: Geometry; readonly shader: ShaderModule; readonly pipeline: RenderPipeline } {
    if (this.viewComposite) return this.viewComposite;
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [-1, -1, 0]);
    vertices.setAttribute(1, "position", [3, -1, 0]);
    vertices.setAttribute(2, "position", [-1, 3, 0]);
    const geometry = new Geometry(vertices);
    const shader = new ShaderModule({
      label: "renderer-view-composite", marker: "aura3d.view-composite",
      vertex: `#version 300 es\n// aura3d.view-composite\nin vec3 a_position;\nout vec2 v_uv;\nvoid main(){v_uv=a_position.xy*0.5+0.5;gl_Position=vec4(a_position,1.0);}`,
      fragment: `#version 300 es\n// aura3d.view-composite\nprecision highp float;\nin vec2 v_uv;\nuniform sampler2D u_view;\nuniform float u_opacity;\nout vec4 o_color;\nvoid main(){o_color=texture(u_view,v_uv)*u_opacity;}`,
      portableBindings: [{ name: "u_opacity", kind: "float" }, { name: "u_view", kind: "texture2d", required: true }],
      webgpu: {
        vertex: `/* @aura3d-bindings */\nstruct Out { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32> };\n@vertex fn main(@location(0) position: vec3<f32>) -> Out { var out: Out; out.position=vec4<f32>(position,1.0); out.uv=vec2<f32>(position.x*0.5+0.5,0.5-position.y*0.5); return out; }`,
        fragment: `/* @aura3d-bindings */\n@fragment fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> { return textureSample(u_viewTexture,u_viewSampler,uv)*aura.u_opacity; }`
      }
    });
    const pipeline = new RenderPipeline({ label: "renderer-view-composite", shader: shader.compile(this.device), vertexFormat: vertices.format, topology: "triangles", renderState: { depthTest: false, depthWrite: false, cullMode: "none", blend: false } });
    this.viewComposite = { geometry, shader, pipeline };
    return this.viewComposite;
  }

  private clearAndApplyView(clearColor: readonly [number, number, number, number]): void {
    const state = this.pendingViewState;
    this.pendingViewState = null;
    this.activeRasterViewport = state?.viewport ?? null;
    if (!state) {
      this.device.clear(clearColor);
      return;
    }
    if (!this.device.setViewport || !this.device.setScissor || !this.device.setScissorTest) {
      throw new RenderDeviceError("This render device does not support viewport/scissor rendering.", "VIEWPORT_UNSUPPORTED", { backend: this.device.kind });
    }
    // The clear runs before the viewport/scissor apply so it covers the whole
    // target (a WebGPU clear is a full-attachment load op and cannot be scissored).
    if (!state.skipClear) this.device.clear(clearColor);
    validateViewRect("viewport", state.viewport, this.width, this.height);
    this.device.setViewport(state.viewport.x, state.viewport.y, state.viewport.width, state.viewport.height);
    if (state.scissor) {
      validateViewRect("scissor", state.scissor, this.width, this.height);
      this.device.setScissor(state.scissor.x, state.scissor.y, state.scissor.width, state.scissor.height);
      this.device.setScissorTest(true);
    }
  }

  /** Permit the pair path only for this renderer's simple, explicit-item frame. */
  private authorizeStaticUnlitPairFrame(forward: ForwardPass, source: RenderSource | Iterable<RenderItem> | Scene, incompatible: boolean): void {
    if (incompatible) return;
    const sourceItems = staticUnlitPairSourceItems(source);
    if (!sourceItems) return;
    const current = (): boolean => {
      const flags = rendererQrFlags(this.device);
      return !this.disposed && this.staticUnlitCaptureDepth === 0 && !this.renderingViews && !this.pendingViewState && !this.activeRasterViewport
        && !this.benchmarkMaskArmed && staticUnlitPairSourceItems(source) === sourceItems
        && isTrustedQrFlags(flags) && !potentiallyActiveFrameContributors(flags).length
        && isUnmodifiedDefaultShaderLibrary(this.shaderLibrary);
    };
    if (current()) authorizeRendererStaticUnlitPairs(forward, current);
  }

  /** A bounded opt-in path; a declined group leaves the original graph intact. */
  private prepareWeightedTransparency(
    source: RenderSource | Iterable<RenderItem> | Scene,
    items: readonly RenderItem[], target: RenderTarget | undefined,
    shared: ForwardPassOptions, blocked: boolean
  ): RenderPass | undefined {
    if (source instanceof Scene || isIterable(source) || source.transparencyMode !== "weighted" || blocked
      || (this.device.kind !== "webgl2" && this.device.kind !== "mock")
      || !this.device.info.capabilities?.includes("float-blending") || !target || target.disposed
      || target.width !== this.width || target.height !== this.height || (target.sampleCount ?? 1) !== 1
      || !target.depthTexture || target.depthTexture.disposed || target.depthTexture.format !== "depth24"
      || !this.device.getRenderTarget || this.device.getRenderTarget() !== target
      || !this.device.setViewport || !this.device.setScissor || !this.device.setScissorTest) return undefined;
    const flags = rendererQrFlags(this.device);
    if (!qrCoreGeneratorOn(flags) || potentiallyActiveFrameContributors(flags).length > 0
      || !forwardDrawReplaySafe(items, flags) || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)) return undefined;
    const split = splitForwardItems(items, shared.cameraPosition);
    if (split.transmission.length || !split.transparent.length) return undefined;
    let earliestTransparent = Infinity;
    for (const { item } of split.transparent) earliestTransparent = Math.min(earliestTransparent, item.renderOrder ?? 0);
    if (split.opaque.some((item) => (item.renderOrder ?? 0) > earliestTransparent)) return undefined;
    const transparent = split.transparent.map(({ item }) => item);
    let maxFragments = 0;
    for (const item of transparent) {
      const count = item.geometry.indexBuffer?.count ?? item.geometry.vertexBuffer.vertexCount;
      if (!Number.isSafeInteger(count) || count < 0) return undefined;
      maxFragments += Math.ceil(count / 3);
      if (maxFragments > 1024) return undefined;
    }
    const depth = new TextureBinding({ name: "u_a3dOpaqueDepth", texture: target.depthTexture,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }), required: true });
    for (const phase of ["accumulation", "revealage"] as const) {
      const bindings = { state: weightedTransparencyState(phase), depth, depthOrigin: [0, 0] as const, reversedDepth: 0 as const };
      if (!new ForwardPass({ ...shared, items: transparent, disableCombinedDraw: true,
        weightedTransparency: { phase, bindings } }).canDrawWeighted(this.device)) return undefined;
    }
    const owner = (this.weightedTransparency ??= new WeightedTransparency(this.device));
    if (!owner.prepare(this.activeViewId, this.width, this.height, this.device.generation)) return undefined;
    return {
      name: "prd01.transparent",
      reads: ["color"],
      writes: ["aura.scene.color"],
      execute: (context) => {
        try {
          const result = owner.execute({ viewId: this.activeViewId, width: this.width, height: this.height,
            sceneTarget: target, opaqueDepth: target.depthTexture!, depthConvention: "standard", sampleCount: 1,
            maxFragmentsPerPixel: maxFragments, deviceGeneration: this.device.generation,
            support: { floatBlend: true, depthTexture: true, shaderVariants: true }, items: transparent,
            drawWeighted: (phase, drawItems, bindings) => new ForwardPass({ ...shared, items: drawItems,
              disableCombinedDraw: true, weightedTransparency: { phase, bindings } }).execute(context),
            drawSorted: (drawItems) => new ForwardPass({ ...shared, items: drawItems }).execute(context) });
          this.lastTransparency = result.mode === "weighted" ? { mode: "weighted" } : { mode: "sorted", reason: result.reason };
        } catch (error) {
          this.lastTransparency = { mode: "failed", reason: error instanceof Error ? error.message : String(error) };
          throw error;
        }
      }
    };
  }

  private renderFrame(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike, deferredInFrame = false,
    preparedCamera?: PreparedViewCamera): RenderDeviceDiagnostics {
    const view = beginPrd07RendererView(this.activePrd07Operation, this.activeViewId, this.authoredFrameId);
    return withRendererFrameCleanup(
      () => this.renderFrameWithPrd07View(sourceOrInput, camera, deferredInFrame, view, preparedCamera),
      () => endPrd07RendererView(view)
    );
  }

  private renderFrameWithPrd07View(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera: CameraLike | undefined,
    deferredInFrame: boolean, prd07View: Prd07RendererView | undefined, preparedCamera?: PreparedViewCamera): RenderDeviceDiagnostics {
    this.assertAlive();
    this.transmissionViews.delete(this.activeViewId);
    const diagnosticToken = postDiagnostics.begin(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    // §6.9: FrameStats samples every render while a governor exists (resolution opt-in).
    this.frameStatsMonitor?.begin(typeof performance !== "undefined" ? performance.now() : Date.now());
    // T0-06: reset the per-frame sync-compile bound for this render.
    {
      const flags = rendererQrFlags(this.device);
      if (qrGeneratedProgramsOn(flags)) rendererProgramCache(this.device, flags).beginFrame?.();
    }
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    const scalarVolumes = snapshotScalarVolumeDraws(source);
    const scalarVolumeGeneration = this.device.generation;
    preflightClippedShadowSource(source, rendererQrFlags(this.device));
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    let resolvedCamera = preparedCamera ? preparedCamera.resolved : resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    this.assertSupportedCameraDepth(resolvedCamera);
    const prepareAdvanced = advancedLightingPrepare(source);
    const advancedFrame: AdvancedLightingFrame = { device: this.device, postScopeId: this.viewScopeId, viewId: this.activeViewId, frameIndex: this.authoredFrameId };
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera, rendererQrFlags(this.device).on("A3D_QR_LIGHTING"), resolvedCamera?.layerMask, this,
      prepareAdvanced ? raw => prepareAdvanced(raw, advancedFrame, "before-batching") : undefined, rendererQrFlags(this.device), this.device, preparedCamera?.cullingFrustum);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    let logicalItems = collectedItems.logicalItems;
    let mergedIdentities = collectedItems.mergedIdentities;
    this.assertTrustedTransmissionFlags(items, rendererQrFlags(this.device));
    const clippingFrame = createFrameClippingSnapshot(source, this.device, this.shaderLibrary);
    assertBatchClippingResolver(clippingFrame.hasMaterialResolver, items, collectedItems.culledShadowCasters);
    const lights = collectRenderLights(source);
    const environmentBackground = withRendererQrFlags(this.device, () => collectEnvironmentBackground(source));
    const environmentLighting = withRendererQrFlags(this.device, () => collectEnvironmentLighting(source));
    let environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    assertClippedShadowContributors(shadowOptions, explicitShadowMap,
      clippingFrame.hasActiveGlobal() || clippingFrame.hasMaterialResolver || items.some(itemHasActiveClipping), rendererQrFlags(this.device));
    // C-02/T0-06: sync-path warm — kick generated-program compiles for the
    // exact draw feature records before the pass runs (bounded per frame).
    this.warmOutputSrgb = this.frameOutputsSrgb(source);
    // The warm itself runs after the shadow step below: with renderer-owned shadows the program key's shadow axis only exists once the map does.
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    // C-05/T0-07: decide the frame's output route before the hooks exist, so
    // contributors see the same v2/legacy resource names the graph writes.
    const routePost = collectPostprocess(source);
    const route = resolveCoreOutputPostRoute(qrCoreOutputOn(rendererQrFlags(this.device)), routePost, routePost ? this.host.post.v2SeamDeclineFor(routePost) : null);
    this.assertOutputAlphaRoute(routePost, route.qrOutput);
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        resolvedCamera = autoFrame;
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        const previousItems = items;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        // 4.7.x: auto-framing clones items; keep the private bloom weights in step.
        transferBloomWeightReferences(previousItems, items, collectedItems.bloomWeightAssignments);
        if (mergedIdentities) logicalItems = applyViewProjection(logicalItems, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    const forwardCamera = resolveForwardCameraMatrices(resolvedCamera, cameraViewProjection);
    const prd07Camera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
    preparePrd07RendererView(prd07View, prd07Camera, rendererQrFlags(this.device));
    if (prd07View && rendererQrFlags(this.device).on("A3D_QR_VFX_FOG")) environmentFog = prd07RendererLegacyFog(prd07View, prd07Camera);
    if (deferredInFrame && (this.drawingPathOptions.mode === "meshlet" || this.drawingPathOptions.mode === "visibility") && nativeWebGPUDofRequested(this.device, routePost)) {
      this.deferredFrameFallback("native depth of field requires the full forward renderer");
      deferredInFrame = false;
    }
    const nativeDofPlan = this.planNativeDepthOfField(routePost, resolvedCamera, forwardCamera,
      { environmentBackground, environmentFog, advanced: prepareAdvanced, explicitTarget: explicitRenderTarget, deferred: deferredInFrame });
    if (nativeDofPlan) assertNativeDofItems(items, rendererQrFlags(this.device));
    const frameHooks = createRendererFrameHooks({
      device: this.device,
      width: this.width,
      height: this.height,
      source,
      frameIndex: this.authoredFrameId,
      postScopeId: this.viewScopeId,
      viewId: this.activeViewId,
      rasterViewportIsFull: this.rasterViewportIsFull(),
      temporalAntialiasing: Boolean(routePost?.taa && routePost.temporal),
      timeSeconds: this.authoredTimeSeconds,
      camera: prd07Camera,
      ...(prd07View ? { onContext: (context: FrameContributorContext) => registerPrd07RendererContext(prd07View, context),
        assertCurrent: () => assertPrd07RendererOperation(prd07View.operation) } : {}),
      // PRD 11: the app's live C-27 tier (A3D_QR_TIERS); undefined → high.
      tier: this.liveQualityTier()?.settings,
      ...(route.legacyGraph ? { flags: withCoreOutputOff(rendererQrFlags(this.device)) } : {})
    });
    const prd07WarmupContext = prd07View ? frameHooks.frameContext(items) : undefined;
    if (prd07WarmupContext) producePrd07RendererContext(prd07View, prd07WarmupContext);
    const cleanupFrameContext = frameHooks.frameContext(items);
    const inspectionTiming = this.activeFrameTrace && this.inspectionTimingByTrace.get(this.activeFrameTrace);
    if (inspectionTiming) bindFrameInspectionView(cleanupFrameContext.blackboard, this.inspectionTiming, inspectionTiming, this.activeTemporalReportId);
    let postprocess = collectPostprocess(source);
    this.assertOutputAlphaRoute(postprocess, route.qrOutput);
    consumeTaaHistoryWritten(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    consumePostV2Presented(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    this.updatePostEffectActivity(postprocess);
    this.beginTemporalView(Boolean(postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)));
    if (!postprocess?.temporal || (!postprocess.motionBlur && !postprocess.taa)) { this.temporalHistory.reset("camera-cut", this.activeViewId); this.lastTemporalCameraPosition.delete(this.activeViewId); }
    const ownedTargets: RenderTarget[] = [];
    const selectiveFrame: SelectiveBloomFrame = { enabled: false, valid: true, weights: collectedItems.bloomWeightAssignments };
    // A contributor can retain the target/depth during collect or even draw
    // immediately.  Select the frame's target before calling any contributor,
    // and never replace it if a later signal check declines.
    let selectiveRequested = Boolean(postprocess?.bloom) &&
      (Boolean(collectedItems.bloomRequestedBeforeBatching) || selectiveBloomRequested(postprocess, items));
    let selectiveCandidate = false;
    let selectiveEarlyReason: string | null = collectedItems.bloomMetadataUnsafe ? "batching" : null;
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    let nativeDofFrame: NativeWebGPUDofFrame | undefined;
    let assertNativeDofCurrent: (() => void) | undefined;
    this.graph.clear();
    // C-05 (§8.4): under A3D_QR_CORE_OUTPUT encode happens once, in OutputPass.
    // A configured legacy post chain still encodes itself (lane 03 migrates it
    // into post-hdr contributors, Q-03-2/Q-03-3), so the frame takes the legacy
    // chain and bypasses OutputPass: encode stays single, and the authored
    // effects (bloom) are kept instead of dropped. The bypass is reported.
    const qrOutput = route.qrOutput;
    const transmissionFlags = rendererQrFlags(this.device);
    const transmissionMaterialContext = { flags: transmissionFlags, tier: this.liveQualityTier()?.settings ?? QUALITY_TIERS.high };
    const generatedRoute = { core: qrCoreGeneratorOn(transmissionFlags), lobes: qrMaterialsLobeProgramsOn(transmissionFlags) };
    const needsTransmission = (item: RenderItem): boolean => {
      if (!transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") || !item.material || !itemReportsTransmissionLobe(item)) return false;
      const material = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      const features = withLivePhysicalMapFeatures(material.programFeatures(transmissionMaterialContext), item.material, transmissionMaterialContext);
      return materialRoutesToGeneratedProgram(material, generatedRoute, transmissionMaterialContext, features.extensions) && features.lighting === "lit";
    };
    if (!postprocess && !qrOutput && transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") && items.some(itemReportsTransmissionLobe) &&
        !this.directTransmissionReplaySafe([], transmissionFlags)) {
      throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
    }
    const transmissionRequested = items.some(needsTransmission);
    const scalarVolumeView = resolvedCamera?.viewMatrix ?? resolvedCamera?.shaderViewMatrix;
    const scalarVolumeCameraPosition = scalarVolumes.length
      ? (scalarVolumeView ? cameraPositionFromViewMatrix(scalarVolumeView) : cameraPosition) : undefined;
    if (scalarVolumes.length && !scalarVolumeCameraPosition) {
      throw new RenderDeviceError("Scalar volumes require an active camera position", "SCALAR_VOLUME_CAMERA_REQUIRED");
    }
    const scalarVolumeToneMap = supportsWebGPUVolumeToneMap(this.device, postprocess);
    assertScalarVolumeRoute(scalarVolumes, { device: this.device, deviceGeneration: scalarVolumeGeneration, camera: prd07Camera,
      coreOutput: qrOutput || scalarVolumeToneMap, postprocess: postprocess !== undefined && !scalarVolumeToneMap, backgroundCoverage: this.outputOptions.backgroundCoverage === true,
      explicitTarget: Boolean(explicitRenderTarget), multiView: this.renderingViews, fullViewport: this.rasterViewportIsFull(),
      renderScale: this.renderScale, globalClipping: clippingFrame.hasActiveGlobal(), transmission: transmissionRequested, deferred: deferredInFrame });
    const directTransmission = transmissionRequested && !postprocess && !qrOutput;
    frameHooks.frameContext(items).blackboard.set("prd01.transmissionCapturePlanned", transmissionRequested);
    if (directTransmission && (!this.device.getRenderTarget || ((!this.directLinearClearValid || !this.outputClearColor) && this.clearColor.slice(0, 3).some(value => value !== 0)))) {
      throw new RenderDeviceError("Direct transmission requires a restorable target and a known linear clear color", "TRANSMISSION_LINEAR_TARGET_REQUIRED");
    }
    if (directTransmission && this.device.kind !== "mock" && !this.device.info.capabilities?.includes("hdr-render-targets")) {
      throw new RenderDeviceError("Direct transmission requires a linear HDR capture target", "TRANSMISSION_HDR_TARGET_REQUIRED");
    }
    // §6.2.7: lane passes encode in-shader only on the legacy LDR path.
    frameHooks.setOutputColorSpace(postprocess || qrOutput ? "linear" : "srgb");
    this.lastPostSkipped = route.skipped;
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    let directCaptureTarget: RenderTarget | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false && !nativeDofPlan && !webgpuAutoExposureRequested(this.device, postprocess)) {
        throw new RenderDeviceError("Renderer HDR postprocess requires tone mapping before presentation or LDR postprocess passes", "HDR_POSTPROCESS_TONEMAPPING_REQUIRED", {
          backend: this.device.kind,
          format
        });
      }
      if (!this.device.presentRenderTarget) {
        throw new RenderDeviceError("Renderer postprocess requires a backend presentation path", "POSTPROCESS_PRESENT_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const requiresPostDepthTexture = postprocessRequiresDepthTexture(postprocess, this.viewScopeId);
      const requiresDepthTexture = requiresPostDepthTexture || (scalarVolumes.length > 0 && scalarVolumeToneMap);
      if (requiresPostDepthTexture && !nativeDofPlan && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      // Temporal AA owns subpixel coverage. Pre-resolving MSAA before tone
      // mapping gives it nonlinear mixed-coverage colors while velocity remains
      // single-sample, biasing moving silhouettes and filtering them twice.
      const sampleCount = postprocess.sampleCount ?? (postprocess.taa && postprocess.temporal ? 1 : this.device.kind === "webgpu" && (requiresDepthTexture || this.hasNativePostEffects(postprocess) || webgpuAutoExposureRequested(this.device, postprocess)) ? 1 : 4);
      // Reused across frames. It still occupies `ownedTargets[0]`, because the postprocess chain and
      // the diagnostics builder both read the forward target from that slot; the end-of-frame
      // disposal loop skips it via `isReusedTarget` so the reuse is safe.
      if (nativeDofPlan && (sampleCount !== 1 || (format !== "rgba16f" && format !== "rgba32f"))) {
        throw new RenderDeviceError("Native depth of field requires single-sample HDR color and depth", "NATIVE_DOF_TARGET_UNSUPPORTED");
      }
      let forwardTarget = this.ensureForwardColorTarget(format, requiresDepthTexture, sampleCount, Boolean(nativeDofPlan));
      // Native depth of field (5.0) owns colour attachment 1 for coverage, so
      // the 4.7.x selective signal (also attachment 1) declines on those frames.
      if (selectiveRequested && !selectiveEarlyReason && nativeDofPlan) selectiveEarlyReason = "native-depth-of-field";
      let targetBound = false;
      if (selectiveRequested && !selectiveEarlyReason) {
        this.device.setRenderTarget(forwardTarget);
        targetBound = true;
        const flags = route.legacyGraph ? withCoreOutputOff(rendererQrFlags(this.device)) : rendererQrFlags(this.device);
        selectiveEarlyReason = selectiveBloomDecline(this.device, postprocess, forwardTarget, flags, Boolean(environmentBackground), this.host.post.v2SeamDeclineFor(postprocess), source);
        // Draw-level declines (instanced, skinned, transparent, non-stock) are data checks the forward pass would reach later:
        // take them before the frame commits to the second-attachment target, so a request that cannot be served never pays for it.
        if (!selectiveEarlyReason) selectiveEarlyReason = selectiveItemsDecline(items);
        if (!selectiveEarlyReason) {
          const candidate = this.selectiveBloomCandidate(forwardTarget);
          if (candidate) {
            forwardTarget = candidate;
            selectiveCandidate = true;
            // Both draw buffers on while the frame clears; the frame turns the signal buffer off if it declines (see setSelectiveSignalDrawBuffer).
            selectiveFrame.setSignalWrite = (enabled) => setSelectiveSignalDrawBuffer(this.device, candidate, enabled);
            selectiveFrame.setSignalWrite(true);
            frameHooks.observeSelectiveBloom(selectiveFrame, (contributor) => selectiveContributorContract(contributor, this.device));
          } else {
            selectiveEarlyReason = sampleCount > 1 ? "signal-msaa-target-unavailable" : "signal-target-unavailable";
          }
        }
      }
      ownedTargets.push(forwardTarget);
      if (!targetBound || selectiveCandidate) this.device.setRenderTarget(forwardTarget);
      frameHooks.setForwardTarget(forwardTarget);
    } else if (qrOutput) {
      // C-05: the v2 scene always renders into the HDR target — also on the
      // no-effects route (§8.4: encode once, in OutputPass). The governor's
      // renderScale applies to this target only; OutputPass upsamples.
      const probed = probeHdrTargetFormat(this.device);
      const format = probed === "rgba8" ? "rgba8" : "rgba16f";
      const hdrTarget = this.ensureHdrSceneTarget(format, this.outputOptions.backgroundCoverage === true, scalarVolumes.length > 0 || (transmissionRequested && this.device.kind === "webgpu"));
      ownedTargets.push(hdrTarget);
      this.device.setRenderTarget(hdrTarget);
      frameHooks.setForwardTarget(hdrTarget);
    } else if (directTransmission) {
      directCaptureTarget = this.ensureForwardColorTarget("rgba16f", false, 1);
      ownedTargets.push(directCaptureTarget);
    }
    let frameCompleted = false;
    let benchmarkFrame: RendererBenchmarkMaskFrame | null = null;
    let benchmarkResourcesValid: (() => boolean) | null = null;
    const rasterTarget = ownedTargets[0] ?? explicitRenderTarget;
    if (rasterTarget && (rasterTarget.width !== this.width || rasterTarget.height !== this.height)) frameHooks.setRasterViewportIsFull(false);
    const photometricFrame = this.photometricFrame(this.activeViewId);
    const projectedSpotFrame = this.projectedSpotFrame(this.activeViewId);
    if (!postprocess && !qrOutput && !explicitRenderTarget) this.ensureWebGPUCanvasSrgb();
    this.beginRendererDeviceFrame(this.width, this.height);
    const packedLoopFrame = beginPackedLoopFrame(this.device);
    let frameFailure: { readonly error: unknown } | undefined;
    const cleanupErrors: unknown[] = [];
    const cleanup = (action: () => void): void => {
      try { action(); } catch (error) { cleanupErrors.push(error); }
    };
    try {
      this.lastShadowEvidence = null;
      if (mergedIdentities && (!isTrustedBatchExecutionDevice(this.device) || hasForwardDrawHooks() || !hasNoBatchSensitiveHooks(rendererQrFlags(this.device)))) {
        items = logicalItems;
        mergedIdentities = false;
      }
      const beforeAdvancedCollect = prepareAdvanced ? items.map(item => ({ ...item })) : undefined;
      items = withRendererQrFlags(this.device, () => frameHooks.collect(items, collected => {
        assertPackedLoopLogicalItems(collected);
        if (clippingFrame.hasMaterialResolver) assertBatchClippingResolver(true, collected, []);
      }));
      if (prepareAdvanced) {
        const prepared = prepareAdvanced(items, advancedFrame, "after-collect", beforeAdvancedCollect);
        if (!Array.isArray(prepared)) throw new RenderDeviceError("Advanced lighting must return an item list", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
        items = prepared;
      }
      assertPackedLoopLogicalItems(items);
      // Retain the ordered logical casters before clipping and shadow checks.
      // Provenance is fallback data, not permission to draw a physical batch.
      items = expandLogicalBatchItems(items);
      assertSpriteFrameCamera(items, forwardCamera.consistent, routePost, rendererQrFlags(this.device));
      this.assertTrustedTransmissionFlags(items, transmissionFlags);
      if (!postprocess && !qrOutput && transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") && items.some(itemReportsTransmissionLobe) &&
          !this.directTransmissionReplaySafe([], transmissionFlags)) {
        throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
      if (!transmissionRequested && items.some(needsTransmission)) {
        throw new RenderDeviceError("Contributor-added transmission requires a planned linear scene target", "TRANSMISSION_TARGET_PLANNING_REQUIRED");
      }
      if (directTransmission && !this.directTransmissionReplaySafe(splitForwardItems(items, cameraPosition).opaque, transmissionFlags)) {
        throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
      selectiveRequested = selectiveRequested || (Boolean(postprocess?.bloom) && selectiveBloomRequested(postprocess, items));
      setSelectiveBloomSkipped(this.canvas ?? this.device, selectiveRequested ? "not-prepared" : undefined);
      // C-28 (#90): scope the shadow-phase CPU submission for frameStats.
      // 02-S5: under A3D_QR_LIGHTING casters come from the pre-cull set
      // (frustum-culled casters rejoin); flag-off keeps the visible items only.
      const unsnapshottedShadowCasters = rendererQrFlags(this.device).on("A3D_QR_LIGHTING")
        ? [
            ...items,
            ...culledCastersReachingView(collectedItems.culledShadowCasters, items, collectedItems.cullingFrustum, shadowSunTravel(lights))
          ].filter((item) => item.castShadow !== false)
        : items.filter((item) => item.castShadow !== false);
      assertBatchClippingResolver(clippingFrame.hasMaterialResolver, items, unsnapshottedShadowCasters);
      clippingFrame.setCameraViewMatrix(forwardCamera.view);
      items = items.map(clippingFrame.snapshot);
      const shadowCasterItems = unsnapshottedShadowCasters.map(clippingFrame.snapshot);
      if (!explicitShadowMap && shadowOptions && shadowOptions.enabled !== false) {
        for (const caster of shadowCasterItems) clippingFrame.assertShadow(caster);
      }
      const preflightSplats = (clippingFrame.hasActiveGlobal() || nativeDofPlan) ? collectGaussianSplatDraws(source) : undefined;
      if (preflightSplats?.length) throw new RenderDeviceError("Gaussian splats do not yet support scene clipping", "GAUSSIAN_SPLAT_CLIPPING_UNSUPPORTED");
      assertClippedShadowContributors(shadowOptions, explicitShadowMap,
        clippingFrame.hasActiveGlobal() || items.some(itemHasActiveClipping), rendererQrFlags(this.device));
      const rendererShadowMap = this.frameStatsMonitor?.scope("shadow", () =>
        explicitShadowMap ?? this.executeRendererShadowMap({
          shadowOptions,
          timeSeconds: frameHooks.timeSeconds,
          source,
          items: shadowCasterItems,
          lights,
          ownedTargets,
          ownedShadowPasses,
          camera: resolvedCamera?.camera,
          cameraPosition,
          frameCamera: shadowFrameCamera(cameraViewProjection, cameraPosition, forwardCamera.view),
          receivers: items
        })) ?? explicitShadowMap ?? this.executeRendererShadowMap({
          shadowOptions,
          timeSeconds: frameHooks.timeSeconds,
          source,
          items: shadowCasterItems,
          lights,
          ownedTargets,
          ownedShadowPasses,
          camera: resolvedCamera?.camera,
          cameraPosition,
          frameCamera: shadowFrameCamera(cameraViewProjection, cameraPosition, forwardCamera.view),
          receivers: items
        });
      const shadowWrites = frameHooks.addPasses(this.graph, "shadows", items);
      const contactReads = shadowWrites.includes("prd02.contactShadowMask") ? ["prd02.contactShadowMask"] : [];
      // C-02/T0-06 sync-path warm, keyed on the shadow map this frame actually draws with (warming before it existed compiled no-shadow
      // variants nothing draws: 2 dead programs on a one-material scene, 4 with a skinned model).
      this.warmGeneratedProgramsSync(items, lights, environmentLighting, environmentFog, rendererShadowMap, cameraViewProjection, shadowOptions, false, prd07WarmupContext, nativeWebGPUDofRequested(this.device, postprocess));
      this.lastShadowEvidence = rendererShadowMap ? {
        lightMatrix: Array.from(rendererShadowMap.lightMatrix),
        cascades: rendererShadowMap.cascades?.map(c => ({ index: c.index, near: c.near, far: c.far, lightMatrix: Array.from(c.shadowMap.lightMatrix) })) ?? [],
        pointFaceMatrices: rendererShadowMap.pointLight ? Array.from(rendererShadowMap.pointLight.faceMatrices) : [],
        pointFaceRects: rendererShadowMap.pointLight ? Array.from(rendererShadowMap.pointLight.faceRects) : [],
        stabilize: shadowOptions?.stabilize !== false,
        shadowRenderTargetsAllocated: this.device.getDiagnostics().shadowRenderTargetsAllocated ?? null,
      } : null;
      if (postprocess) {
        const forwardTarget = ownedTargets[0];
        if (!forwardTarget) {
          throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
        }
        this.device.setRenderTarget(forwardTarget);
      } else if (qrOutput) {
        // §9.1: clear the HDR target to the linear background color (no ACES
        // pre-inversion — OutputPass owns the whole encode).
        this.device.setRenderTarget(ownedTargets[0] ?? null);
      } else {
        this.device.setRenderTarget(explicitRenderTarget ?? null);
      }
      if (nativeDofPlan) {
        if (postprocess !== routePost || !postprocess || !nativeWebGPUDofRequested(this.device, postprocess)) {
          throw new RenderDeviceError("Native depth-of-field configuration changed during frame setup", "NATIVE_DOF_FRAME_STALE");
        }
        validateNativeDofRoute(postprocess, postprocess.pipeline as PostPipelineOptions, this.viewScopeId);
        validateWebGPUDepthOfFieldOptions((postprocess.pipeline as PostPipelineOptions).dof as Partial<DofOptions>,
          nativeDofPlan.maxGeometryDepthMeters, nativeDofPlan.skyDepthMeters);
        if (transmissionRequested || preflightSplats?.length || clippingFrame.mayClip || frameHooks.hasExtraSceneGeometry()) {
          throw new RenderDeviceError("Native depth of field does not support extra geometry or clipping", "NATIVE_DOF_SCENE_UNSUPPORTED");
        }
        const target = ownedTargets[0];
        if (!target) throw new RenderDeviceError("Native depth of field is missing its forward target", "NATIVE_DOF_TARGET_UNSUPPORTED");
        const lease = this.beginNativeDofFrame(nativeDofPlan, target, items, forwardCamera.projection, cameraViewProjection);
        nativeDofFrame = lease.frame;
        assertNativeDofCurrent = lease.assertCurrent;
      }
      this.clearAndApplyView(qrOutput && !postprocess ? this.outputClearColor ?? this.clearColor : this.clearColor);
      if (nativeDofFrame) {
        // The normal color/depth clear does not clear the independent coverage plane.
        this.device.clearRenderTarget!([0, 0, 0, 0], 1);
        frameHooks.setSceneDepthCoverage(nativeDofFrame.source.colorTextures![1]!);
        assertNativeDofCurrent!();
      }
      if (selectiveCandidate) {
        // Clear the signal immediately after the ordinary clear, before even
        // pass-planning callbacks can touch the selected target.
        const format = ownedTargets[0]!.colorTexture.format;
        const maxRadiance = format === "rgba16f" ? 65504 : 3.402823466e38;
        const gl = webgl2DeviceHost(this.device)?.gl;
        const clear = gl?.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array | undefined;
        if (!clear || clear.length < 3) {
          selectiveEarlyReason = "signal-target-unavailable";
        } else {
          const half = (value: number): number => Math.max(-maxRadiance, Math.min(maxRadiance, value)) * 0.5;
          this.device.clearRenderTarget!([half(clear[0]!), half(clear[1]!), half(clear[2]!), 1], 1);
          selectiveFrame.maxRadiance = maxRadiance;
        }
      }
      if (environmentBackground) {
        this.graph.addPass(new EnvironmentBackgroundPass({
          ...environmentBackground,
          outputColorSpace: postprocess || qrOutput ? "linear" : environmentBackground.outputColorSpace,
          inverseViewProjectionMatrix: environmentBackground.inverseViewProjectionMatrix ?? invertMat4(cameraViewProjection ?? identityMat4()),
          shaderLibrary: this.shaderLibrary
        }));
        frameHooks.addPasses(this.graph, "background", items);
      }
      // PRD-03 Phase 4 (flag-on): >5 m of camera translation within one frame
      // is a cut — reprojection would smear everything, so seed fresh history.
      let temporalPrevVp: Float32Array | undefined;
      let rasterViewProjection: Float32Array | readonly number[] | undefined = cameraViewProjection;
      let rasterProjection: Float32Array | readonly number[] | undefined = forwardCamera.projection;
      let temporalAutoReset = false;
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa) && cameraPosition && rendererQrFlags(this.device).on("A3D_QR_POST")) {
        temporalAutoReset = this.temporalCameraCut(cameraPosition);
      }
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)) {
        if (postprocess.execution === "cpu-deterministic" || !this.device.presentLdrPostprocess) throw new RenderDeviceError("Renderer temporal effects require native GPU presentation", "TEMPORAL_NATIVE_REQUIRED");
        const temporal = withRendererQrProofAccess(this.device, this.#rendererFlagOwner, this.temporalHistory, this.activeViewId, this.authoredFrameId, "prepare",
          () => this.temporalHistory.prepare(this.device, this.width, this.height, items, cameraViewProjection, { ...postprocess!.temporal, depthNear: postprocess!.temporal!.depthNear ?? toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition)?.near ?? 0, viewId: this.activeViewId, frameId: this.authoredFrameId, jitter: Boolean(postprocess!.taa), ...((temporalAutoReset || this.activeCameraCut) ? { reset: true } : {}) }));
        temporalPrevVp = temporal.v2?.previous;
        if (temporal.v2) this.temporalViews.set(this.activeTemporalReportId, { motionSource: temporal.v2.motionSource, unsupportedMotion: [...temporal.v2.unsupportedMotion], coverage: { ...temporal.v2.coverage } });
        // PRD-03 §8.6 (flag-on): generated programs project through the
        // AuraFrame `u_viewProjection`, not the per-item MVP, so the TAA
        // sub-pixel jitter has to ride the camera matrix too — otherwise the
        // raster never moves and S5 has nothing to resolve.
        if (temporal.v2) {
          rasterViewProjection = temporal.v2.jittered;
          rasterProjection = temporalForwardProjection(forwardCamera, temporal.v2.jittered, temporal.v2.jitterClip);
        }
        items = temporal.renderItems;
        postprocess = { ...postprocess, ...(postprocess.motionBlur ? {motionBlur: { ...postprocess.motionBlur, temporal }} : {}), ...(postprocess.taa ? {taa: { ...postprocess.taa, temporal }} : {}) };
        this.device.setRenderTarget(ownedTargets[0]!);
      }
      frameHooks.setRasterViewProjectionMatrix(rasterViewProjection);
      const gaussianSplats = preflightSplats ?? collectGaussianSplatDraws(source);
      if (transmissionRequested && (!this.device.hasDefaultOutputOverride || this.device.hasDefaultOutputOverride())) {
        throw new RenderDeviceError("Transmission requires a verified default output without a persistent viewport or external framebuffer", "TRANSMISSION_VIEWPORT_UNSUPPORTED");
      }
      if (transmissionRequested && this.activeRasterViewport && (this.activeRasterViewport.x !== 0 || this.activeRasterViewport.y !== 0 || this.activeRasterViewport.width !== this.width || this.activeRasterViewport.height !== this.height)) {
        throw new RenderDeviceError("Transmission does not support partial viewports", "TRANSMISSION_VIEWPORT_UNSUPPORTED");
      }
      const contributorFlags = route.legacyGraph ? withCoreOutputOff(transmissionFlags) : transmissionFlags;
      const hasTransparentQueues = frameContributors(contributorFlags).some((contributor) =>
        contributor.phases.includes("transparent") && contributor.transparentItems !== undefined);
      const deferredOpaqueEligible = deferredInFrame && !gaussianSplats.length && !scalarVolumes.length && !transmissionRequested;
      if (deferredInFrame && !deferredOpaqueEligible) this.deferredFrameFallback("transmission, splat or volume routes require the full forward renderer");
      const weightedRequested = !(source instanceof Scene) && !isIterable(source) && source.transparencyMode === "weighted";
      this.lastTransparency = weightedRequested ? { mode: "sorted", reason: "The frame or transparent group is not eligible for weighted rendering." } : null;
      const weightedPass = weightedRequested ? this.prepareWeightedTransparency(source, items, ownedTargets[0], {
        items: [], frameContext: frameHooks.frameContext(items), lights, environmentLighting, environmentFog,
        shadowMap: rendererShadowMap, cameraPosition, cameraViewMatrix: forwardCamera.view,
        cameraViewProjectionMatrix: rasterViewProjection,
        auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
        customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
        timeSeconds: frameHooks.timeSeconds, outputColorSpace: "linear", shaderLibrary: this.shaderLibrary,
        qualityTier: this.liveQualityTier()?.settings
      }, !postprocess || qrOutput || Boolean(postprocess.temporal || postprocess.motionBlur || postprocess.taa)
        || deferredInFrame || Boolean(nativeDofPlan || transmissionRequested || gaussianSplats.length || scalarVolumes.length
          || environmentBackground || environmentFog || rendererShadowMap || shadowOptions || explicitShadowMap || prepareAdvanced
          || clippingFrame.mayClip || clippingFrame.hasMaterialResolver || contactReads.length || photometricFrame || projectedSpotFrame
          || this.renderingViews || this.pendingViewState || this.activeRasterViewport || this.benchmarkMaskArmed || this.staticUnlitCaptureDepth
          || frameHooks.hasExtraSceneGeometry())) : undefined;
      if (qrOutput || gaussianSplats.length > 0 || scalarVolumes.length > 0 || transmissionRequested || weightedPass || hasTransparentQueues) {
        // §9.1 v2 frame order: opaque → after-opaque (scene-depth copy,
        // contributors) → transmission → transmissive → transparent (engine
        // items + contributor TransparentQueueItems interleaved by sortDepth)
        // → after-transparent.
        const hdrTarget = ownedTargets[0] ?? null;
        const coverage = qrOutput && this.outputOptions.backgroundCoverage === true;
        const splatView = resolvedCamera?.viewMatrix ?? resolvedCamera?.shaderViewMatrix;
        const splitCamera = gaussianSplats.length && splatView ? cameraPositionFromViewMatrix(splatView) : cameraPosition;
        const split = splitForwardItems(items, splitCamera ?? undefined);
        const phaseOrder = planForwardPhaseOrder(items, split, transmissionRequested);
        const forwardContext = frameHooks.frameContext(items);
        const shared: ForwardPassOptions = {
          items: phaseOrder.opaque,
          sortCameraPosition: splitCamera ?? undefined,
          photometricFrame,
          projectedSpotFrame,
          disableCombinedDraw: clippingFrame.hasMaterialResolver,
          frameContext: forwardContext,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: forwardCamera.view,
          cameraViewProjectionMatrix: rasterViewProjection,
          // SH-02: `material.custom` frame built-ins (u_projectionMatrix, u_time).
          auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
          customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
          timeSeconds: frameHooks.timeSeconds,
          outputColorSpace: postprocess || qrOutput ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary,
          backgroundCoverage: coverage,
          qualityTier: this.liveQualityTier()?.settings
        };
        // The graph enforces unique names + single-producer writes; per-phase
        // resources chain the order, and `aura.scene.color` is written once —
        // by the final interleaved transparent pass.
        const opaqueColorResource = qrOutput ? "aura.scene.color.opaque" : "color";
        let captureReads: string[];
        if (directTransmission && directCaptureTarget) {
          if (!this.directTransmissionReplaySafe(split.opaque, transmissionFlags) || frameHooks.hasExtraSceneGeometry()) throw new RenderDeviceError("Direct transmission cannot replay these opaque draws or contributor passes", "TRANSMISSION_REPLAY_UNSUPPORTED");
          if (this.activeRasterViewport || split.opaque.some(item => item.onBeforeRender)) {
            throw new RenderDeviceError("Direct transmission cannot replay viewport or per-draw callbacks", "TRANSMISSION_REPLAY_UNSUPPORTED");
          }
          this.graph.addPass(this.directTransmissionPrepass(directCaptureTarget, shared, environmentBackground, rasterViewProjection, contactReads));
          const opaque = new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", reads: ["prd04.transmission.color", ...contactReads], writes: [opaqueColorResource] } });
          this.graph.addPass(this.checkedDirectReplayPass(opaque, split.opaque));
          frameHooks.addPasses(this.graph, "after-opaque", items);
          if (frameHooks.hasPasses("background") || frameHooks.hasPasses("after-opaque")) {
            throw new RenderDeviceError("Direct transmission cannot replay contributor color passes", "TRANSMISSION_REPLAY_UNSUPPORTED");
          }
          frameHooks.setForwardTarget(directCaptureTarget);
          frameHooks.setOutputColorSpace("linear");
          const blackboard = frameHooks.frameContext(items).blackboard;
          blackboard.set("prd01.opaqueColorResource", "prd04.direct-linear-opaque");
          let writes: readonly string[];
          try {
            writes = frameHooks.addPasses(this.graph, "transmission", items, pass => this.bindTransmissionPassTarget(pass, directCaptureTarget!, blackboard));
          } finally {
            frameHooks.setForwardTarget(null);
            frameHooks.setOutputColorSpace("srgb");
            blackboard.set("prd01.opaqueColorResource", opaqueColorResource);
          }
          captureReads = writes.includes("prd04.transmission.color") ? ["prd04.transmission.color"] : [];
          if (!captureReads.length) throw new RenderDeviceError("Direct transmission capture is unavailable", "TRANSMISSION_CAPTURE_UNAVAILABLE");
        } else {
          const forward = new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", reads: contactReads, writes: [opaqueColorResource] } });
          // Admit all collected engine items, not just the opaque partition:
          // unsupported alpha/depth still falls back for the entire frame.
          const deferred = deferredOpaqueEligible ? this.deferredInterleavedOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,
            environment: environmentLighting, fog: environmentFog, shadow: rendererShadowMap, background: environmentBackground,
            cameraPosition, viewProjection: rasterViewProjection }, phaseOrder.opaque) : undefined;
          this.graph.addPass(deferred ?? forward);
          if (hdrTarget?.depthTexture || hdrTarget?.multisampledDepthTexture) {
            const depthCopy = this.ensureSceneDepthCopy(hdrTarget.width, hdrTarget.height);
            frameHooks.setSceneDepthCopy(depthCopy);
            const copyPass = new SceneDepthCopyPass(hdrTarget, depthCopy, [opaqueColorResource], () => frameHooks.setSceneDepthCopy(null));
            this.graph.addPass(scalarVolumes.length ? withScalarVolumeDepthGuard(copyPass, scalarVolumes, this.device,
              scalarVolumeGeneration, () => frameHooks.setSceneDepthCopy(null)) : copyPass);
          } else if (scalarVolumes.length) {
            throw new RenderDeviceError("Scalar volumes require an opaque-depth copy", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
          }
          const afterOpaqueBarriers: string[] = [];
          frameHooks.addPasses(this.graph, "after-opaque", items, transmissionRequested ? pass => {
            const barrier = `a3d.internal.transmission.after-opaque.${afterOpaqueBarriers.length}`;
            afterOpaqueBarriers.push(barrier);
            return withGraphDependencies(pass, [], [barrier]);
          } : undefined);
          frameHooks.frameContext(items).blackboard.set("prd01.opaqueColorResource", opaqueColorResource);
          const writes = frameHooks.addPasses(this.graph, "transmission", items, transmissionRequested ? pass =>
            pass.writes.includes("prd04.transmission.color") ? withGraphDependencies(pass, afterOpaqueBarriers) : pass : undefined);
          captureReads = writes.includes("prd04.transmission.color") ? ["prd04.transmission.color"] : [];
        }
        let lastColorResource = opaqueColorResource;
        if (split.transmission.length > 0) {
          lastColorResource = "aura.scene.color.transmission";
          this.graph.addPass(new ForwardPass({
            ...shared,
            items: split.transmission,
            framePass: { name: "prd01.transmission", reads: [opaqueColorResource, ...captureReads], writes: [lastColorResource] }
          }));
        }
        frameHooks.addTransparentContributorPasses(this.graph, items);
        const { ctx: contributorCtx, queues } = frameHooks.transparentQueues(items);
        const volumeRuns = this.scalarVolumeRuns(scalarVolumes, source, resolvedCamera, scalarVolumeCameraPosition, scalarVolumeGeneration);
        const transparentQueues = [...queues, ...volumeRuns];
        const splatRuns = this.gaussianSplatRuns(gaussianSplats, source, resolvedCamera, postprocess, qrOutput, phaseOrder.transparent, transparentQueues);
        assertForwardPhaseOrder(phaseOrder, frameHooks, contributorFlags, queues, [...transparentQueues, ...splatRuns]);
        this.graph.addPass(weightedPass ?? new InterleavedTransparentPass({ ...shared, items: [] }, phaseOrder.transparent, [...transparentQueues, ...splatRuns], contributorCtx,
          [lastColorResource, ...captureReads, ...(scalarVolumes.length ? ["aura.scene.depth.copy"] : [])]));
        frameHooks.addPasses(this.graph, "after-transparent", items);
      } else {
        const forwardContext = frameHooks.frameContext(items);
        const forward = new ForwardPass({
          items,
          ...(assertNativeDofCurrent ? { nativeDepthCoverage: { assertCurrent: assertNativeDofCurrent } } : {}),
          photometricFrame,
          projectedSpotFrame,
          disableCombinedDraw: clippingFrame.hasMaterialResolver,
          framePass: contactReads.length ? { name: "forward", reads: contactReads, writes: ["color"] } : undefined,
          frameContext: forwardContext,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: forwardCamera.view,
          cameraViewProjectionMatrix: rasterViewProjection,
          // SH-02: `material.custom` frame built-ins (u_projectionMatrix, u_time).
          auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
          customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
          timeSeconds: frameHooks.timeSeconds,
          outputColorSpace: postprocess ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary,
          ...(selectiveRequested ? { selectiveBloom: selectiveFrame } : {})
        });
        this.authorizeStaticUnlitPairFrame(forward, source, Boolean(postprocess || deferredInFrame || nativeDofPlan
          || environmentBackground || environmentFog || explicitRenderTarget || (shadowOptions && !compilerFrameShadowDisabled(source, shadowOptions)) || explicitShadowMap || rendererShadowMap
          || clippingFrame.mayClip || clippingFrame.hasMaterialResolver || prepareAdvanced || contactReads.length
          || photometricFrame || projectedSpotFrame));
        const deferred = deferredInFrame ? this.deferredOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,
          environment: environmentLighting, fog: environmentFog, shadow: rendererShadowMap, background: environmentBackground,
          cameraPosition, viewProjection: rasterViewProjection }) : undefined;
        if (selectiveRequested && postprocess && ownedTargets[0]) {
          const flags = route.legacyGraph ? withCoreOutputOff(rendererQrFlags(this.device)) : rendererQrFlags(this.device);
          // The native deferred opaque pass (5.0) does not draw through ForwardPass's signal checks.
          const reason = selectiveEarlyReason ?? (deferredInFrame ? "deferred-drawing-path" : !selectiveCandidate ? "target-not-selected" :
            this.prepareSelectiveBloom(forward, selectiveFrame, postprocess, flags, Boolean(environmentBackground), ownedTargets[0], source));
          // A late decline keeps the chosen target but its draws are ordinary programs: signal buffer off before any of them runs.
          if (selectiveCandidate && reason !== null) selectiveFrame.setSignalWrite?.(false);
          setSelectiveBloomSkipped(this.canvas ?? this.device, reason ?? undefined);
        }
        this.graph.addPass(deferred ?? forward);
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.frameContext(items).blackboard.set("prd01.opaqueColorResource", "color");
        frameHooks.addPasses(this.graph, "transmission", items);
        frameHooks.addPasses(this.graph, "transparent", items);
        frameHooks.addPasses(this.graph, "after-transparent", items);
      }
      if (clippingFrame.hasActiveGlobal() && frameHooks.hasExtraSceneGeometry()) {
        throw new RenderDeviceError("Scene clipping cannot yet cover contributor-owned geometry", "SCENE_CLIPPING_CONTRIBUTOR_UNSUPPORTED");
      }
      if (contactReads.length && (!frameHooks.contactGraphIsSafe() || gaussianSplats.length > 0 || scalarVolumes.length > 0 || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
        || !forwardDrawReplaySafe(items, rendererQrFlags(this.device)))) {
        setContactShadowMask(this.device, undefined);
        frameHooks.frameContext(items).blackboard.delete("prd02.contactShadowMask");
        throw new RenderDeviceError("Contact shadows require verified graph passes and depth participants", "CONTACT_SHADOW_DEPTH_UNSUPPORTED");
      }
      if (this.benchmarkMaskArmed) {
        benchmarkFrame = this.makeBenchmarkMaskFrame({ items, viewProjection: rasterViewProjection, layerMask: resolvedCamera?.layerMask, cameraPosition, postprocess, output: explicitRenderTarget, mergedIdentities, hasExtraSceneGeometry: frameHooks.hasExtraSceneGeometry() || scalarVolumes.length > 0, hasSplats: gaussianSplats.length > 0 });
        if ("items" in benchmarkFrame) {
          try { benchmarkResourcesValid = benchmarkResourceGuard(items, this.device); }
          catch { benchmarkFrame = { unsupported: "submitted geometry or materials cannot be snapshotted" }; }
        }
      }
      // C-28 (#90): scope the forward-phase CPU submission for frameStats.
      if (this.frameStatsMonitor) {
        this.frameStatsMonitor.scope("forward", () =>
          this.executeInspectedGraph());
      } else {
        this.executeInspectedGraph();
      }
      if (nativeDofFrame) {
        assertNativeDofCurrent!();
        this.device.sealNativeDepthOfFieldFrame!(nativeDofFrame);
        if (!this.device.validateNativeDepthOfFieldFrame!(nativeDofFrame, nativeDofFrame.source)) {
          throw new RenderDeviceError("Native depth-of-field coverage proof is unavailable", "NATIVE_DOF_FRAME_STALE");
        }
      }
      if (postprocess) {
        postprocess = bindRendererSsrProjection(postprocess, cameraViewProjection ?? identityMat4());
        const frameCamera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
        postprocess = {
          ...postprocess,
          cameraFrame: frameCamera && temporalPrevVp ? { ...frameCamera, previousViewProjectionMatrix: temporalPrevVp } : frameCamera,
          postFrameContext: {
            source,
            items,
            scopeId: this.viewScopeId,
            viewId: this.activeViewId,
            frameId: this.authoredFrameId,
            timeSeconds: frameHooks.timeSeconds,
            diagnosticToken,
            cameraCut: this.activeCameraCut || temporalAutoReset,
            ...(nativeDofFrame ? { nativeDepthOfFieldFrame: nativeDofFrame } : {}),
            sceneDepth: {
              texture: ownedTargets[0]?.depthTexture ?? null,
              available: (ownedTargets[0]?.depthTexture ?? null) !== null,
              linearize: {
                near: frameCamera?.near ?? 0.1,
                far: frameCamera?.far ?? 1000,
                orthographic: frameCamera?.projection === "orthographic"
              }
            }
          }
        };
        // C-28 (#91): the post-hdr contributors and the postprocess chain report
        // under the "post" scope (lane 03 owns the chain internals).
        this.scopePost(() => {
          frameHooks.runPhase("post-hdr", items, postprocess !== undefined);
          if (nativeDofFrame) assertNativeDofCurrent!();
          assertScalarVolumeFrameCurrent(scalarVolumes, this.device, scalarVolumeGeneration);
          postprocess = this.finishSelectiveBloom(postprocess!, selectiveFrame, selectiveRequested, route.legacyGraph ? withCoreOutputOff(rendererQrFlags(this.device)) : rendererQrFlags(this.device), Boolean(environmentBackground), ownedTargets[0], source);
          this.withNativePostRendererPass(diagnosticToken, () => this.executePostprocess(postprocess!, ownedTargets, explicitRenderTarget));
        });
        if (postprocess.temporal && (postprocess.motionBlur || postprocess.taa)) this.stageTemporalHistory(Boolean(postprocess.taa));
      } else if (qrOutput) {
        this.scopePost(() => frameHooks.runPhase("post-hdr", items, true));
        assertScalarVolumeFrameCurrent(scalarVolumes, this.device, scalarVolumeGeneration);
        this.executeOutputPass(frameHooks, items, ownedTargets[0] ?? null, explicitRenderTarget);
      }
      frameHooks.runPhase("after-output", items);
      if (benchmarkFrame && frameHooks.hasExtraSceneGeometry()) benchmarkFrame = { unsupported: "additional contributor geometry is unsupported" };
      frameCompleted = true;
    } catch (error) {
      frameFailure = { error };
      this.lastShadowEvidence = null;
      cleanup(() => consumeTaaHistoryWritten(this.viewScopeId, this.activeViewId, this.authoredFrameId));
      cleanup(() => consumePostV2Presented(this.viewScopeId, this.activeViewId, this.authoredFrameId));
      if (this.activePostEffectSignatures.has(this.activeViewId)) {
        cleanup(() => this.releasePostEffectView(this.activeViewId));
      }
      if (postprocess?.temporal) {
        cleanup(() => this.temporalHistory.reset("camera-cut", this.activeViewId));
        this.lastTemporalCameraPosition.delete(this.activeViewId);
      }
      throw error;
    } finally {
      const frameContext = cleanupFrameContext;
      const transmission: { value?: ReturnType<typeof prd04TransmissionDiagnostics> } = {};
      cleanup(() => closeFrameInspectionView(frameContext.blackboard));
      cleanup(() => { transmission.value = prd04TransmissionDiagnostics(frameContext); });
      cleanup(() => frameHooks.setSceneDepthCopy(null));
      cleanup(() => frameHooks.setSceneDepthCoverage(null));
      cleanup(() => { if (nativeDofFrame) this.device.cancelNativeDepthOfFieldFrame?.(nativeDofFrame); });
      cleanup(() => releaseTransmissionFrame(frameContext));
      cleanup(() => {
        if (transmission.value) this.transmissionViews.set(this.activeViewId, { frameId: this.authoredFrameId, diagnostics: frameCompleted ? transmission.value : { ...transmission.value, targetActive: false, mipCount: 0 } });
      });
      cleanup(() => this.temporalHistory.endDeviceFrame(this.device, this.activeViewId, this.authoredFrameId, frameCompleted));
      cleanup(() => this.finishPhotometricFrame(photometricFrame));
      cleanup(() => this.finishProjectedSpotFrame(projectedSpotFrame));
      cleanup(() => this.finishPackedLoopFrame(packedLoopFrame));
      cleanup(() => {
        if (this.resolutionGovernor && this.frameStatsMonitor) {
          const frameSample = this.frameStatsMonitor.end();
          this.resolutionGovernor.sample(frameSample.intervalMs, frameSample.gpuMs);
        }
      });
      for (const shadowPass of ownedShadowPasses) {
        cleanup(() => shadowPass.dispose());
      }
      for (const target of ownedTargets) {
        // The reused forward-color target outlives the frame; disposing it here would reintroduce a
        // per-frame allocation.
        cleanup(() => { if (!this.isReusedTarget(target)) target.dispose(); });
      }
      throwRendererFrameCleanupFailures(frameFailure, cleanupErrors);
    }
    if (this.benchmarkMaskArmed && benchmarkFrame) {
      this.lastBenchmarkMaskFrame = benchmarkResourcesValid && !benchmarkResourcesValid() ? { unsupported: "submitted resources changed during the frame" } : benchmarkFrame;
      this.benchmarkMaskResourcesValid = benchmarkResourcesValid;
    }
    if (!this.renderingViews) this.markFrameSubmitted();
    const nativeDofSubmission = nativeDofFrame ? this.device.getNativeDepthOfFieldFrameSubmission?.(nativeDofFrame) : undefined;
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      ...(nativeDofFrame && nativeDofSubmission ? { nativeDepthOfFieldSubmission: { frame: nativeDofFrame, ...nativeDofSubmission } } : {}),
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess, this.viewScopeId) && this.device.info.capabilities?.includes("depth-textures"))
    }));
  }
  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  async renderAsync(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    this.assertAlive();
    if (this.renderingAuthoredPass) throw new RenderDeviceError("Renderer is already rendering a frame", "TEMPORAL_FRAME_BUSY");
    this.renderingAuthoredPass = true;
    let completedFrame: PendingAuthoredFrame | undefined;
    let renderFailure: { readonly error: unknown } | undefined;
    try {
      let diagnostics: RenderDeviceDiagnostics | undefined;
      const { operation, owned } = takePrd07RendererOperation(this);
      const restoreFlags = this.bindPrd07OperationFlags(operation, owned);
      let flagFailure: { readonly error: unknown } | undefined;
      try {
        this.activePrd07Operation = operation;
        let operationFailure: { readonly error: unknown } | undefined;
        try {
          const trace = this.beginFrameInspection();
          let inspectionFailure: { readonly error: unknown } | undefined;
          try {
            diagnostics = await this.renderAsyncWithInspection(sourceOrInput, camera);
            completedFrame = this.pendingAuthoredFrame;
          } catch (error) {
            inspectionFailure = { error };
            throw error;
          } finally {
            finishRendererFrameCleanup(inspectionFailure, () => this.finishFrameInspection(trace, diagnostics));
          }
        } catch (error) {
          operationFailure = { error };
          throw error;
        } finally {
          this.activePrd07Operation = undefined;
          finishRendererFrameCleanup(operationFailure, () => { if (owned) endPrd07RendererOperation(operation); });
        }
        // Keep the frame's flags bound until its sealed proof is consumed.
        this.assertAuthoredFrameCurrent(completedFrame);
        this.completeAuthoredPass(completedFrame);
      } catch (error) {
        flagFailure = { error };
        throw error;
      } finally {
        finishRendererFrameCleanup(flagFailure, restoreFlags);
      }
      return diagnostics!;
    } catch (error) {
      const cleanupErrors: unknown[] = [];
      try { if (completedFrame) this.abortAuthoredFrame(completedFrame); } catch (cleanup) { cleanupErrors.push(cleanup); }
      try { this.failTransmissionDiagnostics(); } catch (cleanup) { cleanupErrors.push(cleanup); }
      const failure = cleanupErrors.length
        ? new AggregateError([error, ...cleanupErrors], "Renderer frame and cleanup failed", { cause: error })
        : error;
      renderFailure = { error: failure };
      throw failure;
    } finally {
      finishRendererFrameCleanup(renderFailure, () => this.finishTemporalPassCleanup());
    }
  }

  private async renderAsyncWithInspection(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    this.trackBatchSource(isRendererInput(sourceOrInput) ? sourceOrInput.source : sourceOrInput);
    const views = collectRendererViews(sourceOrInput);
    const frame = this.beginAuthoredFrame(sourceOrInput);
    try {
    this.lastDrawingPath = null;
    this.temporalViews.clear();
    const selected = withRendererQrFlags(this.device, () => this.selectDrawingPath(sourceOrInput, camera, views));
    if (selected.rendered) {
      this.assertAuthoredFrameCurrent(frame);
      return selected.rendered;
    }
    sourceOrInput = selected.input;
    let diagnostics: RenderDeviceDiagnostics;
    if (views) {
      diagnostics = await this.renderViewsAsync(sourceOrInput, camera, views);
    } else {
      this.pendingViewState = collectSingleViewState(sourceOrInput);
      this.activeViewId = this.singleViewHistoryId(normalizeRendererInput(sourceOrInput, camera).source);
      try {
        diagnostics = await this.adoptExplicitTargetSizeAsync(
          normalizeRendererInput(sourceOrInput, camera).source,
          () => this.renderAsyncFrame(sourceOrInput, camera, selected.deferredInFrame)
        );
      } finally {
        this.pendingViewState = null;
        this.activeViewId = "single";
      }
    }
    const drawingPath = this.lastDrawingPath ?? selected.diagnostics;
    this.lastDrawingPath = drawingPath;
    const result = { ...diagnostics, drawingPath, ...this.temporalDiagnostics() };
    this.assertAuthoredFrameCurrent(frame);
    return result;
    } catch (error) {
      try { this.abortAuthoredFrame(frame); } catch (cleanup) { throwRendererFrameCleanupFailures({ error }, [cleanup]); }
      throw error;
    }
  }

  private async renderAsyncFrame(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike, deferredInFrame = false,
    preparedCamera?: PreparedViewCamera): Promise<RenderDeviceDiagnostics> {
    const view = beginPrd07RendererView(this.activePrd07Operation, this.activeViewId, this.authoredFrameId);
    let failure: { readonly error: unknown } | undefined;
    try {
      return await this.renderAsyncFrameWithPrd07View(sourceOrInput, camera, deferredInFrame, view, preparedCamera);
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      finishRendererFrameCleanup(failure, () => endPrd07RendererView(view));
    }
  }

  private async renderAsyncFrameWithPrd07View(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera: CameraLike | undefined,
    deferredInFrame: boolean, prd07View: Prd07RendererView | undefined, preparedCamera?: PreparedViewCamera): Promise<RenderDeviceDiagnostics> {
    this.assertAlive();
    this.transmissionViews.delete(this.activeViewId);
    const diagnosticToken = postDiagnostics.begin(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    this.frameStatsMonitor?.begin(typeof performance !== "undefined" ? performance.now() : Date.now());
    // T0-06: reset the per-frame sync-compile bound for this render.
    {
      const flags = rendererQrFlags(this.device);
      if (qrGeneratedProgramsOn(flags)) rendererProgramCache(this.device, flags).beginFrame?.();
    }
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    const scalarVolumes = snapshotScalarVolumeDraws(source);
    const scalarVolumeGeneration = this.device.generation;
    preflightClippedShadowSource(source, rendererQrFlags(this.device));
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    let resolvedCamera = preparedCamera ? preparedCamera.resolved : resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    this.assertSupportedCameraDepth(resolvedCamera);
    const prepareAdvanced = advancedLightingPrepare(source);
    const advancedFrame: AdvancedLightingFrame = { device: this.device, postScopeId: this.viewScopeId, viewId: this.activeViewId, frameIndex: this.authoredFrameId };
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera, rendererQrFlags(this.device).on("A3D_QR_LIGHTING"), resolvedCamera?.layerMask, this,
      prepareAdvanced ? raw => prepareAdvanced(raw, advancedFrame, "before-batching") : undefined, rendererQrFlags(this.device), this.device, preparedCamera?.cullingFrustum);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    let logicalItems = collectedItems.logicalItems;
    let mergedIdentities = collectedItems.mergedIdentities;
    this.assertTrustedTransmissionFlags(items, rendererQrFlags(this.device));
    const clippingFrame = createFrameClippingSnapshot(source, this.device, this.shaderLibrary);
    assertBatchClippingResolver(clippingFrame.hasMaterialResolver, items, collectedItems.culledShadowCasters);
    const lights = collectRenderLights(source);
    const environmentBackground = withRendererQrFlags(this.device, () => collectEnvironmentBackground(source));
    const environmentLighting = withRendererQrFlags(this.device, () => collectEnvironmentLighting(source));
    let environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    assertClippedShadowContributors(shadowOptions, explicitShadowMap,
      clippingFrame.hasActiveGlobal() || clippingFrame.hasMaterialResolver || items.some(itemHasActiveClipping), rendererQrFlags(this.device));
    const routePost = collectPostprocess(source);
    const route = resolveCoreOutputPostRoute(qrCoreOutputOn(rendererQrFlags(this.device)), routePost, routePost ? this.host.post.v2SeamDeclineFor(routePost) : null);
    this.assertOutputAlphaRoute(routePost, route.qrOutput);
    const earlyFlags = rendererQrFlags(this.device);
    if (!routePost && !route.qrOutput && earlyFlags.on("A3D_QR_MATERIALS_TRANSMISSION") && items.some(itemReportsTransmissionLobe)) {
      // Bucket selection can itself consult material lobes. Validate provider
      // identities before asking any material for its program features.
      if (!this.directTransmissionReplaySafe([], earlyFlags) || !this.directTransmissionReplaySafe(splitForwardItems(items).opaque, earlyFlags)) {
        throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
    }
    // C-02 (PRD-01 §403): pre-render warm-then-block compile of the generated
    // programs this scene needs. Flag-off: nothing (sync path untouched).
    this.warmOutputSrgb = this.frameOutputsSrgb(source);
    const clippingWasPrewarmed = clippingFrame.mayClip || items.some(itemMayClip);
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    // C-05/T0-07: decide the frame's output route before the hooks exist, so
    // contributors see the same v2/legacy resource names the graph writes.
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        resolvedCamera = autoFrame;
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        const previousItems = items;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        // 4.7.x: auto-framing clones items; keep the private bloom weights in step.
        transferBloomWeightReferences(previousItems, items, collectedItems.bloomWeightAssignments);
        if (mergedIdentities) logicalItems = applyViewProjection(logicalItems, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    const forwardCamera = resolveForwardCameraMatrices(resolvedCamera, cameraViewProjection);
    const prd07Camera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
    preparePrd07RendererView(prd07View, prd07Camera, rendererQrFlags(this.device));
    if (prd07View && rendererQrFlags(this.device).on("A3D_QR_VFX_FOG")) environmentFog = prd07RendererLegacyFog(prd07View, prd07Camera);
    if (deferredInFrame && (this.drawingPathOptions.mode === "meshlet" || this.drawingPathOptions.mode === "visibility") && nativeWebGPUDofRequested(this.device, routePost)) {
      this.deferredFrameFallback("native depth of field requires the full forward renderer");
      deferredInFrame = false;
    }
    const nativeDofPlan = this.planNativeDepthOfField(routePost, resolvedCamera, forwardCamera,
      { environmentBackground, environmentFog, advanced: prepareAdvanced, explicitTarget: explicitRenderTarget, deferred: deferredInFrame });
    if (nativeDofPlan) assertNativeDofItems(items, rendererQrFlags(this.device));
    const frameHooks = createRendererFrameHooks({
      device: this.device,
      width: this.width,
      height: this.height,
      source,
      frameIndex: this.authoredFrameId,
      postScopeId: this.viewScopeId,
      viewId: this.activeViewId,
      rasterViewportIsFull: this.rasterViewportIsFull(),
      temporalAntialiasing: Boolean(routePost?.taa && routePost.temporal),
      timeSeconds: this.authoredTimeSeconds,
      camera: prd07Camera,
      ...(prd07View ? { onContext: (context: FrameContributorContext) => registerPrd07RendererContext(prd07View, context),
        assertCurrent: () => assertPrd07RendererOperation(prd07View.operation) } : {}),
      // PRD 11: the app's live C-27 tier (A3D_QR_TIERS); undefined → high.
      tier: this.liveQualityTier()?.settings,
      ...(route.legacyGraph ? { flags: withCoreOutputOff(rendererQrFlags(this.device)) } : {})
    });
    const prd07WarmupContext = prd07View ? frameHooks.frameContext(items) : undefined;
    if (prd07WarmupContext) producePrd07RendererContext(prd07View, prd07WarmupContext);
    const cleanupFrameContext = frameHooks.frameContext(items);
    const inspectionTiming = this.activeFrameTrace && this.inspectionTimingByTrace.get(this.activeFrameTrace);
    if (inspectionTiming) bindFrameInspectionView(cleanupFrameContext.blackboard, this.inspectionTiming, inspectionTiming, this.activeTemporalReportId);
    await this.warmGeneratedPrograms(items, lights, environmentLighting, environmentFog, explicitShadowMap, cameraViewProjection,
      shadowOptions, clippingWasPrewarmed, prd07WarmupContext, nativeWebGPUDofRequested(this.device, routePost));
    if (prd07View) assertPrd07RendererOperation(prd07View.operation);
    this.assertAuthoredFrameCurrent();
    if (this.disposed || this.device.disposed) {
      return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics);
    }
    let postprocess = collectPostprocess(source);
    this.assertOutputAlphaRoute(postprocess, route.qrOutput);
    consumeTaaHistoryWritten(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    consumePostV2Presented(this.viewScopeId, this.activeViewId, this.authoredFrameId);
    this.updatePostEffectActivity(postprocess);
    this.beginTemporalView(Boolean(postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)));
    if (!postprocess?.temporal || (!postprocess.motionBlur && !postprocess.taa)) { this.temporalHistory.reset("camera-cut", this.activeViewId); this.lastTemporalCameraPosition.delete(this.activeViewId); }
    const ownedTargets: RenderTarget[] = [];
    const selectiveFrame: SelectiveBloomFrame = { enabled: false, valid: true, weights: collectedItems.bloomWeightAssignments };
    let selectiveRequested = false;
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    let nativeDofFrame: NativeWebGPUDofFrame | undefined;
    let assertNativeDofCurrent: (() => void) | undefined;
    this.graph.clear();
    // C-05 (§8.4): under A3D_QR_CORE_OUTPUT encode happens once, in OutputPass.
    // A configured legacy post chain still encodes itself (lane 03 migrates it
    // into post-hdr contributors, Q-03-2/Q-03-3), so the frame takes the legacy
    // chain and bypasses OutputPass: encode stays single, and the authored
    // effects (bloom) are kept instead of dropped. The bypass is reported.
    const qrOutput = route.qrOutput;
    const transmissionFlags = rendererQrFlags(this.device);
    const transmissionMaterialContext = { flags: transmissionFlags, tier: this.liveQualityTier()?.settings ?? QUALITY_TIERS.high };
    const generatedRoute = { core: qrCoreGeneratorOn(transmissionFlags), lobes: qrMaterialsLobeProgramsOn(transmissionFlags) };
    const needsTransmission = (item: RenderItem): boolean => {
      if (!transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") || !item.material || !itemReportsTransmissionLobe(item)) return false;
      const material = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      const features = withLivePhysicalMapFeatures(material.programFeatures(transmissionMaterialContext), item.material, transmissionMaterialContext);
      return materialRoutesToGeneratedProgram(material, generatedRoute, transmissionMaterialContext, features.extensions) && features.lighting === "lit";
    };
    if (!postprocess && !qrOutput && transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") && items.some(itemReportsTransmissionLobe) &&
        !this.directTransmissionReplaySafe([], transmissionFlags)) {
      throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
    }
    const transmissionRequested = items.some(needsTransmission);
    const scalarVolumeView = resolvedCamera?.viewMatrix ?? resolvedCamera?.shaderViewMatrix;
    const scalarVolumeCameraPosition = scalarVolumes.length
      ? (scalarVolumeView ? cameraPositionFromViewMatrix(scalarVolumeView) : cameraPosition) : undefined;
    if (scalarVolumes.length && !scalarVolumeCameraPosition) {
      throw new RenderDeviceError("Scalar volumes require an active camera position", "SCALAR_VOLUME_CAMERA_REQUIRED");
    }
    const scalarVolumeToneMap = supportsWebGPUVolumeToneMap(this.device, postprocess);
    assertScalarVolumeRoute(scalarVolumes, { device: this.device, deviceGeneration: scalarVolumeGeneration, camera: prd07Camera,
      coreOutput: qrOutput || scalarVolumeToneMap, postprocess: postprocess !== undefined && !scalarVolumeToneMap, backgroundCoverage: this.outputOptions.backgroundCoverage === true,
      explicitTarget: Boolean(explicitRenderTarget), multiView: this.renderingViews, fullViewport: this.rasterViewportIsFull(),
      renderScale: this.renderScale, globalClipping: clippingFrame.hasActiveGlobal(), transmission: transmissionRequested, deferred: deferredInFrame });
    const directTransmission = transmissionRequested && !postprocess && !qrOutput;
    frameHooks.frameContext(items).blackboard.set("prd01.transmissionCapturePlanned", transmissionRequested);
    if (directTransmission && (!this.device.getRenderTarget || ((!this.directLinearClearValid || !this.outputClearColor) && this.clearColor.slice(0, 3).some(value => value !== 0)))) {
      throw new RenderDeviceError("Direct transmission requires a restorable target and a known linear clear color", "TRANSMISSION_LINEAR_TARGET_REQUIRED");
    }
    if (directTransmission && this.device.kind !== "mock" && !this.device.info.capabilities?.includes("hdr-render-targets")) {
      throw new RenderDeviceError("Direct transmission requires a linear HDR capture target", "TRANSMISSION_HDR_TARGET_REQUIRED");
    }
    // §6.2.7: lane passes encode in-shader only on the legacy LDR path.
    frameHooks.setOutputColorSpace(postprocess || qrOutput ? "linear" : "srgb");
    this.lastPostSkipped = route.skipped;
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    let directCaptureTarget: RenderTarget | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false && !nativeDofPlan && !webgpuAutoExposureRequested(this.device, postprocess)) {
        throw new RenderDeviceError("Renderer HDR postprocess requires tone mapping before presentation or LDR postprocess passes", "HDR_POSTPROCESS_TONEMAPPING_REQUIRED", {
          backend: this.device.kind,
          format
        });
      }
      if (!this.device.presentRenderTarget) {
        throw new RenderDeviceError("Renderer postprocess requires a backend presentation path", "POSTPROCESS_PRESENT_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      const requiresPostDepthTexture = postprocessRequiresDepthTexture(postprocess, this.viewScopeId);
      const requiresDepthTexture = requiresPostDepthTexture || (scalarVolumes.length > 0 && scalarVolumeToneMap);
      if (requiresPostDepthTexture && !nativeDofPlan && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      // Temporal AA owns subpixel coverage. Pre-resolving MSAA before tone
      // mapping gives it nonlinear mixed-coverage colors while velocity remains
      // single-sample, biasing moving silhouettes and filtering them twice.
      const sampleCount = postprocess.sampleCount ?? (postprocess.taa && postprocess.temporal ? 1 : this.device.kind === "webgpu" && (requiresDepthTexture || this.hasNativePostEffects(postprocess) || webgpuAutoExposureRequested(this.device, postprocess)) ? 1 : 4);
      // Reused across frames. It still occupies `ownedTargets[0]`, because the postprocess chain and
      // the diagnostics builder both read the forward target from that slot; the end-of-frame
      // disposal loop skips it via `isReusedTarget` so the reuse is safe.
      if (nativeDofPlan && (sampleCount !== 1 || (format !== "rgba16f" && format !== "rgba32f"))) {
        throw new RenderDeviceError("Native depth of field requires single-sample HDR color and depth", "NATIVE_DOF_TARGET_UNSUPPORTED");
      }
      const forwardTarget = this.ensureForwardColorTarget(format, requiresDepthTexture, sampleCount, Boolean(nativeDofPlan));
      ownedTargets.push(forwardTarget);
      this.device.setRenderTarget(forwardTarget);
      frameHooks.setForwardTarget(forwardTarget);
    } else if (qrOutput) {
      // C-05: the v2 scene always renders into the HDR target — also on the
      // no-effects route (§8.4: encode once, in OutputPass). The governor's
      // renderScale applies to this target only; OutputPass upsamples.
      const probed = probeHdrTargetFormat(this.device);
      const format = probed === "rgba8" ? "rgba8" : "rgba16f";
      const hdrTarget = this.ensureHdrSceneTarget(format, this.outputOptions.backgroundCoverage === true, scalarVolumes.length > 0 || (transmissionRequested && this.device.kind === "webgpu"));
      ownedTargets.push(hdrTarget);
      this.device.setRenderTarget(hdrTarget);
      frameHooks.setForwardTarget(hdrTarget);
    } else if (directTransmission) {
      directCaptureTarget = this.ensureForwardColorTarget("rgba16f", false, 1);
      ownedTargets.push(directCaptureTarget);
    }
    let frameCompleted = false;
    let benchmarkFrame: RendererBenchmarkMaskFrame | null = null;
    let benchmarkResourcesValid: (() => boolean) | null = null;
    const rasterTarget = ownedTargets[0] ?? explicitRenderTarget;
    if (rasterTarget && (rasterTarget.width !== this.width || rasterTarget.height !== this.height)) frameHooks.setRasterViewportIsFull(false);
    const photometricFrame = this.photometricFrame(this.activeViewId);
    const projectedSpotFrame = this.projectedSpotFrame(this.activeViewId);
    if (!postprocess && !qrOutput && !explicitRenderTarget) this.ensureWebGPUCanvasSrgb();
    this.beginRendererDeviceFrame(this.width, this.height);
    const packedLoopFrame = beginPackedLoopFrame(this.device);
    let frameFailure: { readonly error: unknown } | undefined;
    const cleanupErrors: unknown[] = [];
    const cleanup = (action: () => void): void => {
      try { action(); } catch (error) { cleanupErrors.push(error); }
    };
    try {
      this.lastShadowEvidence = null;
      if (mergedIdentities && (!isTrustedBatchExecutionDevice(this.device) || hasForwardDrawHooks() || !hasNoBatchSensitiveHooks(rendererQrFlags(this.device)))) {
        items = logicalItems;
        mergedIdentities = false;
      }
      const beforeAdvancedCollect = prepareAdvanced ? items.map(item => ({ ...item })) : undefined;
      items = withRendererQrFlags(this.device, () => frameHooks.collect(items, collected => {
        assertPackedLoopLogicalItems(collected);
        if (clippingFrame.hasMaterialResolver) assertBatchClippingResolver(true, collected, []);
      }));
      if (prepareAdvanced) {
        const prepared = prepareAdvanced(items, advancedFrame, "after-collect", beforeAdvancedCollect);
        if (!Array.isArray(prepared)) throw new RenderDeviceError("Advanced lighting must return an item list", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
        items = prepared;
      }
      assertPackedLoopLogicalItems(items);
      items = expandLogicalBatchItems(items);
      assertSpriteFrameCamera(items, forwardCamera.consistent, routePost, rendererQrFlags(this.device));
      this.assertTrustedTransmissionFlags(items, transmissionFlags);
      if (!postprocess && !qrOutput && transmissionFlags.on("A3D_QR_MATERIALS_TRANSMISSION") && items.some(itemReportsTransmissionLobe) &&
          !this.directTransmissionReplaySafe([], transmissionFlags)) {
        throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
      if (!transmissionRequested && items.some(needsTransmission)) {
        throw new RenderDeviceError("Contributor-added transmission requires a planned linear scene target", "TRANSMISSION_TARGET_PLANNING_REQUIRED");
      }
      if (directTransmission && !this.directTransmissionReplaySafe(splitForwardItems(items, cameraPosition).opaque, transmissionFlags)) {
        throw new RenderDeviceError("Direct transmission cannot replay these opaque draws", "TRANSMISSION_REPLAY_UNSUPPORTED");
      }
      selectiveRequested = Boolean(postprocess?.bloom) && (collectedItems.bloomRequestedBeforeBatching || selectiveBloomRequested(postprocess, items));
      setSelectiveBloomSkipped(this.canvas ?? this.device, selectiveRequested ? "not-prepared" : undefined);
      // C-28 (#90): scope the shadow-phase CPU submission for frameStats.
      // 02-S5: under A3D_QR_LIGHTING casters come from the pre-cull set
      // (frustum-culled casters rejoin); flag-off keeps the visible items only.
      const unsnapshottedShadowCasters = rendererQrFlags(this.device).on("A3D_QR_LIGHTING")
        ? [
            ...items,
            ...culledCastersReachingView(collectedItems.culledShadowCasters, items, collectedItems.cullingFrustum, shadowSunTravel(lights))
          ].filter((item) => item.castShadow !== false)
        : items.filter((item) => item.castShadow !== false);
      assertBatchClippingResolver(clippingFrame.hasMaterialResolver, items, unsnapshottedShadowCasters);
      clippingFrame.setCameraViewMatrix(forwardCamera.view);
      items = items.map(clippingFrame.snapshot);
      const shadowCasterItems = unsnapshottedShadowCasters.map(clippingFrame.snapshot);
      if (!explicitShadowMap && shadowOptions && shadowOptions.enabled !== false) {
        for (const caster of shadowCasterItems) clippingFrame.assertShadow(caster);
      }
      const preflightSplats = (clippingFrame.hasActiveGlobal() || nativeDofPlan) ? collectGaussianSplatDraws(source) : undefined;
      if (preflightSplats?.length) throw new RenderDeviceError("Gaussian splats do not yet support scene clipping", "GAUSSIAN_SPLAT_CLIPPING_UNSUPPORTED");
      assertClippedShadowContributors(shadowOptions, explicitShadowMap,
        clippingFrame.hasActiveGlobal() || items.some(itemHasActiveClipping), rendererQrFlags(this.device));
      const rendererShadowMap = this.frameStatsMonitor?.scope("shadow", () =>
        explicitShadowMap ?? this.executeRendererShadowMap({
          shadowOptions,
          timeSeconds: frameHooks.timeSeconds,
          source,
          items: shadowCasterItems,
          lights,
          ownedTargets,
          ownedShadowPasses,
          camera: resolvedCamera?.camera,
          cameraPosition,
          frameCamera: shadowFrameCamera(cameraViewProjection, cameraPosition, forwardCamera.view),
          receivers: items
        })) ?? explicitShadowMap ?? this.executeRendererShadowMap({
          shadowOptions,
          timeSeconds: frameHooks.timeSeconds,
          source,
          items: shadowCasterItems,
          lights,
          ownedTargets,
          ownedShadowPasses,
          camera: resolvedCamera?.camera,
          cameraPosition,
          frameCamera: shadowFrameCamera(cameraViewProjection, cameraPosition, forwardCamera.view),
          receivers: items
        });
      const shadowWrites = frameHooks.addPasses(this.graph, "shadows", items);
      const contactReads = shadowWrites.includes("prd02.contactShadowMask") ? ["prd02.contactShadowMask"] : [];
      if (!clippingWasPrewarmed && items.some(itemHasActiveClipping)) {
        // A collect contributor introduced clipping after async warmup. Start
        // the matching programs now; a pending draw retries when readiness
        // invalidates the owning static frame.
        this.warmGeneratedProgramsSync(items, lights, environmentLighting, environmentFog, rendererShadowMap, cameraViewProjection, shadowOptions, true, prd07WarmupContext, nativeWebGPUDofRequested(this.device, postprocess));
      }
      this.lastShadowEvidence = rendererShadowMap ? {
        lightMatrix: Array.from(rendererShadowMap.lightMatrix),
        cascades: rendererShadowMap.cascades?.map(c => ({ index: c.index, near: c.near, far: c.far, lightMatrix: Array.from(c.shadowMap.lightMatrix) })) ?? [],
        pointFaceMatrices: rendererShadowMap.pointLight ? Array.from(rendererShadowMap.pointLight.faceMatrices) : [],
        pointFaceRects: rendererShadowMap.pointLight ? Array.from(rendererShadowMap.pointLight.faceRects) : [],
        stabilize: shadowOptions?.stabilize !== false,
        shadowRenderTargetsAllocated: this.device.getDiagnostics().shadowRenderTargetsAllocated ?? null,
      } : null;
      if (postprocess) {
        const forwardTarget = ownedTargets[0];
        if (!forwardTarget) {
          throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
        }
        this.device.setRenderTarget(forwardTarget);
      } else if (qrOutput) {
        // §9.1: clear the HDR target to the linear background color (no ACES
        // pre-inversion — OutputPass owns the whole encode).
        this.device.setRenderTarget(ownedTargets[0] ?? null);
      } else {
        this.device.setRenderTarget(explicitRenderTarget ?? null);
      }
      if (nativeDofPlan) {
        if (postprocess !== routePost || !postprocess || !nativeWebGPUDofRequested(this.device, postprocess)) {
          throw new RenderDeviceError("Native depth-of-field configuration changed during frame setup", "NATIVE_DOF_FRAME_STALE");
        }
        validateNativeDofRoute(postprocess, postprocess.pipeline as PostPipelineOptions, this.viewScopeId);
        validateWebGPUDepthOfFieldOptions((postprocess.pipeline as PostPipelineOptions).dof as Partial<DofOptions>,
          nativeDofPlan.maxGeometryDepthMeters, nativeDofPlan.skyDepthMeters);
        if (transmissionRequested || preflightSplats?.length || clippingFrame.mayClip || frameHooks.hasExtraSceneGeometry()) {
          throw new RenderDeviceError("Native depth of field does not support extra geometry or clipping", "NATIVE_DOF_SCENE_UNSUPPORTED");
        }
        const target = ownedTargets[0];
        if (!target) throw new RenderDeviceError("Native depth of field is missing its forward target", "NATIVE_DOF_TARGET_UNSUPPORTED");
        const lease = this.beginNativeDofFrame(nativeDofPlan, target, items, forwardCamera.projection, cameraViewProjection);
        nativeDofFrame = lease.frame;
        assertNativeDofCurrent = lease.assertCurrent;
      }
      this.clearAndApplyView(qrOutput && !postprocess ? this.outputClearColor ?? this.clearColor : this.clearColor);
      if (nativeDofFrame) {
        // The normal color/depth clear does not clear the independent coverage plane.
        this.device.clearRenderTarget!([0, 0, 0, 0], 1);
        frameHooks.setSceneDepthCoverage(nativeDofFrame.source.colorTextures![1]!);
        assertNativeDofCurrent!();
      }
      if (environmentBackground) {
        this.graph.addPass(new EnvironmentBackgroundPass({
          ...environmentBackground,
          outputColorSpace: postprocess || qrOutput ? "linear" : environmentBackground.outputColorSpace,
          inverseViewProjectionMatrix: environmentBackground.inverseViewProjectionMatrix ?? invertMat4(cameraViewProjection ?? identityMat4()),
          shaderLibrary: this.shaderLibrary
        }));
        frameHooks.addPasses(this.graph, "background", items);
      }
      // PRD-03 Phase 4 (flag-on): >5 m of camera translation within one frame
      // is a cut — reprojection would smear everything, so seed fresh history.
      let temporalPrevVp: Float32Array | undefined;
      let rasterViewProjection: Float32Array | readonly number[] | undefined = cameraViewProjection;
      let rasterProjection: Float32Array | readonly number[] | undefined = forwardCamera.projection;
      let temporalAutoReset = false;
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa) && cameraPosition && rendererQrFlags(this.device).on("A3D_QR_POST")) {
        temporalAutoReset = this.temporalCameraCut(cameraPosition);
      }
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)) {
        if (postprocess.execution === "cpu-deterministic" || !this.device.presentLdrPostprocess) throw new RenderDeviceError("Renderer temporal effects require native GPU presentation", "TEMPORAL_NATIVE_REQUIRED");
        const temporal = withRendererQrProofAccess(this.device, this.#rendererFlagOwner, this.temporalHistory, this.activeViewId, this.authoredFrameId, "prepare",
          () => this.temporalHistory.prepare(this.device, this.width, this.height, items, cameraViewProjection, { ...postprocess!.temporal, depthNear: postprocess!.temporal!.depthNear ?? toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition)?.near ?? 0, viewId: this.activeViewId, frameId: this.authoredFrameId, jitter: Boolean(postprocess!.taa), ...((temporalAutoReset || this.activeCameraCut) ? { reset: true } : {}) }));
        temporalPrevVp = temporal.v2?.previous;
        if (temporal.v2) this.temporalViews.set(this.activeTemporalReportId, { motionSource: temporal.v2.motionSource, unsupportedMotion: [...temporal.v2.unsupportedMotion], coverage: { ...temporal.v2.coverage } });
        // PRD-03 §8.6 (flag-on): generated programs project through the
        // AuraFrame `u_viewProjection`, not the per-item MVP, so the TAA
        // sub-pixel jitter has to ride the camera matrix too — otherwise the
        // raster never moves and S5 has nothing to resolve.
        if (temporal.v2) {
          rasterViewProjection = temporal.v2.jittered;
          rasterProjection = temporalForwardProjection(forwardCamera, temporal.v2.jittered, temporal.v2.jitterClip);
        }
        items = temporal.renderItems;
        postprocess = { ...postprocess, ...(postprocess.motionBlur ? {motionBlur: { ...postprocess.motionBlur, temporal }} : {}), ...(postprocess.taa ? {taa: { ...postprocess.taa, temporal }} : {}) };
        this.device.setRenderTarget(ownedTargets[0]!);
      }
      frameHooks.setRasterViewProjectionMatrix(rasterViewProjection);
      const gaussianSplats = preflightSplats ?? collectGaussianSplatDraws(source);
      if (transmissionRequested && (!this.device.hasDefaultOutputOverride || this.device.hasDefaultOutputOverride())) {
        throw new RenderDeviceError("Transmission requires a verified default output without a persistent viewport or external framebuffer", "TRANSMISSION_VIEWPORT_UNSUPPORTED");
      }
      if (transmissionRequested && this.activeRasterViewport && (this.activeRasterViewport.x !== 0 || this.activeRasterViewport.y !== 0 || this.activeRasterViewport.width !== this.width || this.activeRasterViewport.height !== this.height)) {
        throw new RenderDeviceError("Transmission does not support partial viewports", "TRANSMISSION_VIEWPORT_UNSUPPORTED");
      }
      const contributorFlags = route.legacyGraph ? withCoreOutputOff(transmissionFlags) : transmissionFlags;
      const hasTransparentQueues = frameContributors(contributorFlags).some((contributor) =>
        contributor.phases.includes("transparent") && contributor.transparentItems !== undefined);
      const deferredOpaqueEligible = deferredInFrame && !gaussianSplats.length && !scalarVolumes.length && !transmissionRequested;
      if (deferredInFrame && !deferredOpaqueEligible) this.deferredFrameFallback("transmission, splat or volume routes require the full forward renderer");
      const weightedRequested = !(source instanceof Scene) && !isIterable(source) && source.transparencyMode === "weighted";
      this.lastTransparency = weightedRequested ? { mode: "sorted", reason: "The frame or transparent group is not eligible for weighted rendering." } : null;
      const weightedPass = weightedRequested ? this.prepareWeightedTransparency(source, items, ownedTargets[0], {
        items: [], frameContext: frameHooks.frameContext(items), lights, environmentLighting, environmentFog,
        shadowMap: rendererShadowMap, cameraPosition, cameraViewMatrix: forwardCamera.view,
        cameraViewProjectionMatrix: rasterViewProjection,
        auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
        customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
        timeSeconds: frameHooks.timeSeconds, outputColorSpace: "linear", shaderLibrary: this.shaderLibrary,
        qualityTier: this.liveQualityTier()?.settings
      }, !postprocess || qrOutput || Boolean(postprocess.temporal || postprocess.motionBlur || postprocess.taa)
        || deferredInFrame || Boolean(nativeDofPlan || transmissionRequested || gaussianSplats.length || scalarVolumes.length
          || environmentBackground || environmentFog || rendererShadowMap || shadowOptions || explicitShadowMap || prepareAdvanced
          || clippingFrame.mayClip || clippingFrame.hasMaterialResolver || contactReads.length || photometricFrame || projectedSpotFrame
          || this.renderingViews || this.pendingViewState || this.activeRasterViewport || this.benchmarkMaskArmed || this.staticUnlitCaptureDepth
          || frameHooks.hasExtraSceneGeometry())) : undefined;
      if (qrOutput || gaussianSplats.length > 0 || scalarVolumes.length > 0 || transmissionRequested || weightedPass || hasTransparentQueues) {
        // §9.1 v2 frame order: opaque → after-opaque (scene-depth copy,
        // contributors) → transmission → transmissive → transparent (engine
        // items + contributor TransparentQueueItems interleaved by sortDepth)
        // → after-transparent.
        const hdrTarget = ownedTargets[0] ?? null;
        const coverage = qrOutput && this.outputOptions.backgroundCoverage === true;
        const splatView = resolvedCamera?.viewMatrix ?? resolvedCamera?.shaderViewMatrix;
        const splitCamera = gaussianSplats.length && splatView ? cameraPositionFromViewMatrix(splatView) : cameraPosition;
        const split = splitForwardItems(items, splitCamera ?? undefined);
        const phaseOrder = planForwardPhaseOrder(items, split, transmissionRequested);
        const forwardContext = frameHooks.frameContext(items);
        const shared: ForwardPassOptions = {
          items: phaseOrder.opaque,
          sortCameraPosition: splitCamera ?? undefined,
          photometricFrame,
          projectedSpotFrame,
          disableCombinedDraw: clippingFrame.hasMaterialResolver,
          frameContext: forwardContext,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: forwardCamera.view,
          cameraViewProjectionMatrix: rasterViewProjection,
          // SH-02: `material.custom` frame built-ins (u_projectionMatrix, u_time).
          auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
          customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
          timeSeconds: frameHooks.timeSeconds,
          outputColorSpace: postprocess || qrOutput ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary,
          backgroundCoverage: coverage,
          qualityTier: this.liveQualityTier()?.settings
        };
        // The graph enforces unique names + single-producer writes; per-phase
        // resources chain the order, and `aura.scene.color` is written once —
        // by the final interleaved transparent pass.
        const opaqueColorResource = qrOutput ? "aura.scene.color.opaque" : "color";
        let captureReads: string[];
        if (directTransmission && directCaptureTarget) {
          if (!this.directTransmissionReplaySafe(split.opaque, transmissionFlags) || frameHooks.hasExtraSceneGeometry()) throw new RenderDeviceError("Direct transmission cannot replay these opaque draws or contributor passes", "TRANSMISSION_REPLAY_UNSUPPORTED");
          if (this.activeRasterViewport || split.opaque.some(item => item.onBeforeRender)) {
            throw new RenderDeviceError("Direct transmission cannot replay viewport or per-draw callbacks", "TRANSMISSION_REPLAY_UNSUPPORTED");
          }
          this.graph.addPass(this.directTransmissionPrepass(directCaptureTarget, shared, environmentBackground, rasterViewProjection, contactReads));
          const opaque = new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", reads: ["prd04.transmission.color", ...contactReads], writes: [opaqueColorResource] } });
          this.graph.addPass(this.checkedDirectReplayPass(opaque, split.opaque));
          frameHooks.addPasses(this.graph, "after-opaque", items);
          if (frameHooks.hasPasses("background") || frameHooks.hasPasses("after-opaque")) {
            throw new RenderDeviceError("Direct transmission cannot replay contributor color passes", "TRANSMISSION_REPLAY_UNSUPPORTED");
          }
          frameHooks.setForwardTarget(directCaptureTarget);
          frameHooks.setOutputColorSpace("linear");
          const blackboard = frameHooks.frameContext(items).blackboard;
          blackboard.set("prd01.opaqueColorResource", "prd04.direct-linear-opaque");
          let writes: readonly string[];
          try {
            writes = frameHooks.addPasses(this.graph, "transmission", items, pass => this.bindTransmissionPassTarget(pass, directCaptureTarget!, blackboard));
          } finally {
            frameHooks.setForwardTarget(null);
            frameHooks.setOutputColorSpace("srgb");
            blackboard.set("prd01.opaqueColorResource", opaqueColorResource);
          }
          captureReads = writes.includes("prd04.transmission.color") ? ["prd04.transmission.color"] : [];
          if (!captureReads.length) throw new RenderDeviceError("Direct transmission capture is unavailable", "TRANSMISSION_CAPTURE_UNAVAILABLE");
        } else {
          const forward = new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", reads: contactReads, writes: [opaqueColorResource] } });
          // Validate the complete engine list before using the native opaque pass.
          const deferred = deferredOpaqueEligible ? this.deferredInterleavedOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,
            environment: environmentLighting, fog: environmentFog, shadow: rendererShadowMap, background: environmentBackground,
            cameraPosition, viewProjection: rasterViewProjection }, phaseOrder.opaque) : undefined;
          this.graph.addPass(deferred ?? forward);
          if (hdrTarget?.depthTexture || hdrTarget?.multisampledDepthTexture) {
            const depthCopy = this.ensureSceneDepthCopy(hdrTarget.width, hdrTarget.height);
            frameHooks.setSceneDepthCopy(depthCopy);
            const copyPass = new SceneDepthCopyPass(hdrTarget, depthCopy, [opaqueColorResource], () => frameHooks.setSceneDepthCopy(null));
            this.graph.addPass(scalarVolumes.length ? withScalarVolumeDepthGuard(copyPass, scalarVolumes, this.device,
              scalarVolumeGeneration, () => frameHooks.setSceneDepthCopy(null)) : copyPass);
          } else if (scalarVolumes.length) {
            throw new RenderDeviceError("Scalar volumes require an opaque-depth copy", "SCALAR_VOLUME_DEPTH_COPY_UNAVAILABLE");
          }
          const afterOpaqueBarriers: string[] = [];
          frameHooks.addPasses(this.graph, "after-opaque", items, transmissionRequested ? pass => {
            const barrier = `a3d.internal.transmission.after-opaque.${afterOpaqueBarriers.length}`;
            afterOpaqueBarriers.push(barrier);
            return withGraphDependencies(pass, [], [barrier]);
          } : undefined);
          frameHooks.frameContext(items).blackboard.set("prd01.opaqueColorResource", opaqueColorResource);
          const writes = frameHooks.addPasses(this.graph, "transmission", items, transmissionRequested ? pass =>
            pass.writes.includes("prd04.transmission.color") ? withGraphDependencies(pass, afterOpaqueBarriers) : pass : undefined);
          captureReads = writes.includes("prd04.transmission.color") ? ["prd04.transmission.color"] : [];
        }
        let lastColorResource = opaqueColorResource;
        if (split.transmission.length > 0) {
          lastColorResource = "aura.scene.color.transmission";
          this.graph.addPass(new ForwardPass({
            ...shared,
            items: split.transmission,
            framePass: { name: "prd01.transmission", reads: [opaqueColorResource, ...captureReads], writes: [lastColorResource] }
          }));
        }
        frameHooks.addTransparentContributorPasses(this.graph, items);
        const { ctx: contributorCtx, queues } = frameHooks.transparentQueues(items);
        const volumeRuns = this.scalarVolumeRuns(scalarVolumes, source, resolvedCamera, scalarVolumeCameraPosition, scalarVolumeGeneration);
        const transparentQueues = [...queues, ...volumeRuns];
        const splatRuns = this.gaussianSplatRuns(gaussianSplats, source, resolvedCamera, postprocess, qrOutput, phaseOrder.transparent, transparentQueues);
        assertForwardPhaseOrder(phaseOrder, frameHooks, contributorFlags, queues, [...transparentQueues, ...splatRuns]);
        this.graph.addPass(weightedPass ?? new InterleavedTransparentPass({ ...shared, items: [] }, phaseOrder.transparent, [...transparentQueues, ...splatRuns], contributorCtx,
          [lastColorResource, ...captureReads, ...(scalarVolumes.length ? ["aura.scene.depth.copy"] : [])]));
        frameHooks.addPasses(this.graph, "after-transparent", items);
      } else {
        const forwardContext = frameHooks.frameContext(items);
        const forward = new ForwardPass({
          items,
          ...(assertNativeDofCurrent ? { nativeDepthCoverage: { assertCurrent: assertNativeDofCurrent } } : {}),
          photometricFrame,
          projectedSpotFrame,
          disableCombinedDraw: clippingFrame.hasMaterialResolver,
          framePass: contactReads.length ? { name: "forward", reads: contactReads, writes: ["color"] } : undefined,
          frameContext: forwardContext,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: forwardCamera.view,
          cameraViewProjectionMatrix: rasterViewProjection,
          // SH-02: `material.custom` frame built-ins (u_projectionMatrix, u_time).
          auraFrameCamera: rasterProjection ? { projectionMatrix: rasterProjection } : undefined,
          customFrameCamera: resolvedCamera?.shaderViewMatrix || resolvedCamera?.shaderProjectionMatrix ? { viewMatrix: resolvedCamera.shaderViewMatrix, projectionMatrix: resolvedCamera.shaderProjectionMatrix } : undefined,
          timeSeconds: frameHooks.timeSeconds,
          outputColorSpace: postprocess ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary,
          ...(selectiveRequested ? { selectiveBloom: selectiveFrame } : {})
        });
        this.authorizeStaticUnlitPairFrame(forward, source, Boolean(postprocess || deferredInFrame || nativeDofPlan
          || environmentBackground || environmentFog || explicitRenderTarget || (shadowOptions && !compilerFrameShadowDisabled(source, shadowOptions)) || explicitShadowMap || rendererShadowMap
          || clippingFrame.mayClip || clippingFrame.hasMaterialResolver || prepareAdvanced || contactReads.length
          || photometricFrame || projectedSpotFrame));
        const deferred = deferredInFrame ? this.deferredOpaquePass({ forward, items, target: ownedTargets[0], postprocess, qrOutput, frameContext: forwardContext, lights,
          environment: environmentLighting, fog: environmentFog, shadow: rendererShadowMap, background: environmentBackground,
          cameraPosition, viewProjection: rasterViewProjection }) : undefined;
        if (selectiveRequested && postprocess && ownedTargets[0]) {
          // Async frames yield between forward and bloom (post-hdr hooks and
          // the deferred v2 import). Another submission could overwrite a
          // reused signal target during that gap, so keep the ordinary path.
          setSelectiveBloomSkipped(this.canvas ?? this.device, collectedItems.bloomMetadataUnsafe ? "batching" : "async-frame");
        }
        this.graph.addPass(deferred ?? forward);
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.frameContext(items).blackboard.set("prd01.opaqueColorResource", "color");
        frameHooks.addPasses(this.graph, "transmission", items);
        frameHooks.addPasses(this.graph, "transparent", items);
        frameHooks.addPasses(this.graph, "after-transparent", items);
      }
      if (clippingFrame.hasActiveGlobal() && frameHooks.hasExtraSceneGeometry()) {
        throw new RenderDeviceError("Scene clipping cannot yet cover contributor-owned geometry", "SCENE_CLIPPING_CONTRIBUTOR_UNSUPPORTED");
      }
      if (contactReads.length && (!frameHooks.contactGraphIsSafe() || gaussianSplats.length > 0 || scalarVolumes.length > 0 || !isUnmodifiedDefaultShaderLibrary(this.shaderLibrary)
        || !forwardDrawReplaySafe(items, rendererQrFlags(this.device)))) {
        setContactShadowMask(this.device, undefined);
        frameHooks.frameContext(items).blackboard.delete("prd02.contactShadowMask");
        throw new RenderDeviceError("Contact shadows require verified graph passes and depth participants", "CONTACT_SHADOW_DEPTH_UNSUPPORTED");
      }
      if (this.benchmarkMaskArmed) {
        benchmarkFrame = this.makeBenchmarkMaskFrame({ items, viewProjection: rasterViewProjection, layerMask: resolvedCamera?.layerMask, cameraPosition, postprocess, output: explicitRenderTarget, mergedIdentities, hasExtraSceneGeometry: frameHooks.hasExtraSceneGeometry() || scalarVolumes.length > 0, hasSplats: gaussianSplats.length > 0 });
        if ("items" in benchmarkFrame) {
          try { benchmarkResourcesValid = benchmarkResourceGuard(items, this.device); }
          catch { benchmarkFrame = { unsupported: "submitted geometry or materials cannot be snapshotted" }; }
        }
      }
      // C-28 (#90): scope the forward-phase CPU submission for frameStats.
      if (this.frameStatsMonitor) {
        this.frameStatsMonitor.scope("forward", () =>
          this.executeInspectedGraph());
      } else {
        this.executeInspectedGraph();
      }
      if (nativeDofFrame) {
        assertNativeDofCurrent!();
        this.device.sealNativeDepthOfFieldFrame!(nativeDofFrame);
        if (!this.device.validateNativeDepthOfFieldFrame!(nativeDofFrame, nativeDofFrame.source)) {
          throw new RenderDeviceError("Native depth-of-field coverage proof is unavailable", "NATIVE_DOF_FRAME_STALE");
        }
      }
      if (postprocess) {
        postprocess = bindRendererSsrProjection(postprocess, cameraViewProjection ?? identityMat4());
        const frameCamera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
        postprocess = {
          ...postprocess,
          cameraFrame: frameCamera && temporalPrevVp ? { ...frameCamera, previousViewProjectionMatrix: temporalPrevVp } : frameCamera,
          postFrameContext: {
            source,
            items,
            scopeId: this.viewScopeId,
            viewId: this.activeViewId,
            frameId: this.authoredFrameId,
            timeSeconds: frameHooks.timeSeconds,
            diagnosticToken,
            cameraCut: this.activeCameraCut || temporalAutoReset,
            ...(nativeDofFrame ? { nativeDepthOfFieldFrame: nativeDofFrame } : {}),
            sceneDepth: {
              texture: ownedTargets[0]?.depthTexture ?? null,
              available: (ownedTargets[0]?.depthTexture ?? null) !== null,
              linearize: {
                near: frameCamera?.near ?? 0.1,
                far: frameCamera?.far ?? 1000,
                orthographic: frameCamera?.projection === "orthographic"
              }
            }
          }
        };
        // C-28 (#91): "post" scope. FrameStats.scope is synchronous, so on the
        // async path it times the CPU submission up to the first await.
        await this.scopePost(async () => {
          await frameHooks.runPhaseAsync("post-hdr", items, postprocess !== undefined);
          this.assertAuthoredFrameCurrent();
          if (nativeDofFrame) assertNativeDofCurrent!();
          if (prd07View) assertPrd07RendererOperation(prd07View.operation);
          if (this.disposed || this.device.disposed) return;
          postprocess = this.finishSelectiveBloom(postprocess!, selectiveFrame, selectiveRequested, route.legacyGraph ? withCoreOutputOff(rendererQrFlags(this.device)) : rendererQrFlags(this.device), Boolean(environmentBackground), ownedTargets[0], source);
          assertScalarVolumeFrameCurrent(scalarVolumes, this.device, scalarVolumeGeneration);
          await this.withNativePostRendererPassAsync(diagnosticToken, () => this.executePostprocessAsync(postprocess!, ownedTargets, explicitRenderTarget));
          if (prd07View) assertPrd07RendererOperation(prd07View.operation);
          this.assertAuthoredFrameCurrent();
        });
        if (!this.disposed && !this.device.disposed && postprocess.temporal && (postprocess.motionBlur || postprocess.taa)) this.stageTemporalHistory(Boolean(postprocess.taa));
      } else if (qrOutput) {
        await this.scopePost(() => frameHooks.runPhaseAsync("post-hdr", items, true));
        this.assertAuthoredFrameCurrent();
        if (prd07View) assertPrd07RendererOperation(prd07View.operation);
        if (!this.disposed && !this.device.disposed) {
          assertScalarVolumeFrameCurrent(scalarVolumes, this.device, scalarVolumeGeneration);
          this.executeOutputPass(frameHooks, items, ownedTargets[0] ?? null, explicitRenderTarget);
        }
      }
      if (!this.disposed && !this.device.disposed) {
        await frameHooks.runPhaseAsync("after-output", items);
        if (prd07View) assertPrd07RendererOperation(prd07View.operation);
        this.assertAuthoredFrameCurrent();
        if (benchmarkFrame && frameHooks.hasExtraSceneGeometry()) benchmarkFrame = { unsupported: "additional contributor geometry is unsupported" };
        frameCompleted = true;
      }
    } catch (error) {
      frameFailure = { error };
      this.lastShadowEvidence = null;
      cleanup(() => consumeTaaHistoryWritten(this.viewScopeId, this.activeViewId, this.authoredFrameId));
      cleanup(() => consumePostV2Presented(this.viewScopeId, this.activeViewId, this.authoredFrameId));
      if (this.activePostEffectSignatures.has(this.activeViewId)) {
        cleanup(() => this.releasePostEffectView(this.activeViewId));
      }
      if (postprocess?.temporal) {
        cleanup(() => this.temporalHistory.reset("camera-cut", this.activeViewId));
        this.lastTemporalCameraPosition.delete(this.activeViewId);
      }
      throw error;
    } finally {
      const frameContext = cleanupFrameContext;
      const transmission: { value?: ReturnType<typeof prd04TransmissionDiagnostics> } = {};
      cleanup(() => closeFrameInspectionView(frameContext.blackboard));
      cleanup(() => { transmission.value = prd04TransmissionDiagnostics(frameContext); });
      cleanup(() => frameHooks.setSceneDepthCopy(null));
      cleanup(() => frameHooks.setSceneDepthCoverage(null));
      cleanup(() => { if (nativeDofFrame) this.device.cancelNativeDepthOfFieldFrame?.(nativeDofFrame); });
      cleanup(() => releaseTransmissionFrame(frameContext));
      cleanup(() => {
        if (transmission.value && !this.disposed && !this.device.disposed) this.transmissionViews.set(this.activeViewId, { frameId: this.authoredFrameId, diagnostics: frameCompleted ? transmission.value : { ...transmission.value, targetActive: false, mipCount: 0 } });
      });
      cleanup(() => { if (!this.device.disposed) this.temporalHistory.endDeviceFrame(this.device, this.activeViewId, this.authoredFrameId, frameCompleted); });
      cleanup(() => this.finishPhotometricFrame(photometricFrame));
      cleanup(() => this.finishProjectedSpotFrame(projectedSpotFrame));
      cleanup(() => this.finishPackedLoopFrame(packedLoopFrame));
      cleanup(() => {
        if (this.resolutionGovernor && this.frameStatsMonitor) {
          const frameSample = this.frameStatsMonitor.end();
          this.resolutionGovernor.sample(frameSample.intervalMs, frameSample.gpuMs);
        }
      });
      for (const shadowPass of ownedShadowPasses) {
        cleanup(() => shadowPass.dispose());
      }
      for (const target of ownedTargets) {
        // The reused forward-color target outlives the frame; disposing it here would reintroduce a
        // per-frame allocation.
        cleanup(() => { if (!this.isReusedTarget(target)) target.dispose(); });
      }
      throwRendererFrameCleanupFailures(frameFailure, cleanupErrors);
    }
    if (!this.disposed && !this.device.disposed && this.benchmarkMaskArmed && benchmarkFrame) {
      this.lastBenchmarkMaskFrame = benchmarkResourcesValid && !benchmarkResourcesValid() ? { unsupported: "submitted resources changed during the frame" } : benchmarkFrame;
      this.benchmarkMaskResourcesValid = benchmarkResourcesValid;
    }
    if (!this.renderingViews) this.markFrameSubmitted();
    const nativeDofSubmission = nativeDofFrame ? this.device.getNativeDepthOfFieldFrameSubmission?.(nativeDofFrame) : undefined;
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      ...(nativeDofFrame && nativeDofSubmission ? { nativeDepthOfFieldSubmission: { frame: nativeDofFrame, ...nativeDofSubmission } } : {}),
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess, this.viewScopeId) && this.device.info.capabilities?.includes("depth-textures"))
    }));
  }
  /**
   * C-02 (PRD-01 §8.2/§403): warm-then-block. Under `A3D_QR_CORE_GENERATOR`
   * (default-on under `A3D_QR_CORE`), precompiles the generated programs for
   * every allow-listed material in the frame — at the current tier and the
   * next-lower one — before the first draw, so the pass never async-skips in
   * steady state. Flag-off and non-generated materials are no-ops.
   */
  /**
   * Shared T0-06 warm input: the exact draw feature records the frame's
   * generated-program materials need (lights/shadow/environment axes at the
   * current tier). Returns `materials: []` early when nothing generated.
   */
  /**
   * Whether the frame being warmed writes straight to the canvas (no postprocess, no OutputPass): its generated programs
   * carry the sRGB-encode feature bit, so the warmed keys match the draw keys. Set right before each warm call.
   */
  private warmOutputSrgb = false;

  /** Direct WebGPU draws encode sRGB and must not inherit a previous P3 canvas. */
  private ensureWebGPUCanvasSrgb(): void {
    if (this.device.kind !== "webgpu") return;
    const result = this.device.negotiateOutputColorSpace?.("srgb");
    if (!result || result.active !== "srgb") {
      throw new RenderDeviceError("Direct WebGPU output requires an sRGB canvas", "WEBGPU_OUTPUT_COLOR_SPACE_UNAVAILABLE");
    }
  }

  private frameOutputsSrgb(source: RenderSource | Iterable<RenderItem> | Scene): boolean {
    return !collectPostprocess(source) && !qrCoreOutputOn(rendererQrFlags(this.device));
  }

  private collectWarmupInput(
    items: readonly RenderItem[],
    lights: readonly CollectedLight[],
    environmentLighting: EnvironmentLightingOptions | undefined,
    environmentFog: ForwardEnvironmentFogOptions | false | undefined,
    shadowMap: ForwardShadowMapOptions | undefined,
    cameraViewProjection: Float32Array | readonly number[] | undefined,
    flags: ReturnType<typeof rendererQrFlags>,
    tier: AuraQualityTier,
    shadowOptions?: RendererShadowOptions,
    prewarmClipping = false,
    frameContext?: FrameContributorContext,
    nativeDepthCoverage = false
  ): WarmupInput {
    const ctx = { flags, tier: QUALITY_TIERS[tier] };
    // T0-05: one record per (material revision, selected feature bits) — the
    // draw key carries `ShaderFeature.select` bits per item, so the warm list
    // must too or warmed keys never match draw keys.
    const records = new Map<string, Partial<ProgramFeatures>>();
    const route = { core: qrCoreGeneratorOn(flags), lobes: qrMaterialsLobeProgramsOn(flags) };
    for (const item of items) {
      const material = item.material ?? (nativeDepthCoverage ? new UnlitMaterial() : undefined);
      const m = material instanceof MaterialInstance ? material.baseMaterial : material;
      if (!m || !material) continue;
      const mf = withLiveAlphaCutoff(withLivePhysicalMapFeatures(m.programFeatures(ctx), material, ctx), material);
      if (!materialRoutesToGeneratedProgram(m, route, ctx, mf.extensions)) continue;
      const selected = selectShaderFeatureBits({ item, pass: "forward", tier: ctx.tier, flags, frameContext });
      if (nativeDepthCoverage) selected[DEPTH_COVERAGE_FEATURE] = true;
      const advanced = advancedLightingItemBinding(item, { device: this.device, postScopeId: this.viewScopeId, viewId: this.activeViewId, frameIndex: this.authoredFrameId }, { deferLightmapContentCheck: true });
      if (advanced) {
        if (mf.lighting !== "lit") throw new RenderDeviceError("Advanced lighting requires a lit physical material", "ADVANCED_LIGHTING_PROGRAM_UNSUPPORTED", { material: m.name });
        Object.assign(selected, advancedLightingFeatures(advanced));
      }
      // E3 stage-2b: same probe-availability gate ForwardPass applies, so
      // warmed keys match draw keys for the `prd02.ibl` bit.
      if (selected[PRD02_IBL_FEATURE] !== undefined && !prd02IblEnvironmentAvailable(environmentLighting, item)) {
        delete selected[PRD02_IBL_FEATURE];
      }
      if (this.warmOutputSrgb) selected[PROGRAM_OUTPUT_SRGB_FEATURE] = true;
      // #867 (games): same geometry-driven feature mask ForwardPass applies.
      const attrs = item.geometry.vertexBuffer.format.attributes;
      const has = (name: string) => attrs.some((a) => a.semantic === name || a.shaderName === name);
      const selectedFeatures = { ...mf.features, ...selected };
      delete selectedFeatures["a3d.nativePrimitive"];
      const nativePrimitive = nativeUnlitPrimitiveForGeometry(item.geometry, this.device, mf.lighting);
      if (nativePrimitive) selectedFeatures["a3d.nativePrimitive"] = nativePrimitive;
      let record = featuresForGeometry({ ...mf, features: selectedFeatures }, has);
      if (record.lighting === "lit" && physicalVertexColorsForGeometry(item.geometry, this.device)) record = { ...record, vertexColors: true };
      const geometryMask = ["a_uv", "a_uv1", "a_color", "a_joints", "a_weights", "a_joints1", "a_weights1"].map((n) => (has(n) ? 1 : 0)).join("");
      const variants = prewarmClipping || itemMayClip(item)
        ? [record, { ...record, features: { ...record.features, "a3d.clipping": true } }]
        : [record];
      for (const variant of variants) {
        const key = `${m.shaderKey}:${m.getRevision()}:${geometryMask}:${variant.vertexColors ? 1 : 0}:${variant.alphaMode ?? "opaque"}:${JSON.stringify(Object.entries(variant.features).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))}`;
        if (!records.has(key)) records.set(key, variant);
      }
    }
    if (records.size === 0) return { materials: [] };
    const clustered = resolveForwardClusteredLighting(lights, this.width, this.height, cameraViewProjection);
    const axes = forwardPassFeatureAxes({ lights, shadowMap, environmentLighting, environmentFog }, clustered !== null);
    clustered?.dispose();
    const shadows = axes.shadows ? [axes.shadows] : [];
    const contactOptIn = (shadowOptions as (RendererShadowOptions & { readonly prd02Contact?: unknown }) | undefined)?.prd02Contact;
    if (axes.shadows && flags.on("A3D_QR_LIGHTING") && (flags.on("A3D_QR_LIGHTING_CONTACT") || contactOptIn != null) &&
        lights.some(light => light.kind === "directional" && light.castsShadow)) {
      // The producer publishes after warmup. Warm both the ordinary key and
      // contact keys, including item-specific disabled shadow-map axes.
      for (const cascades of new Set([axes.shadows.cascades, 0 as const])) {
        for (const localShadows of new Set([axes.shadows.localShadows, 0 as const])) {
          shadows.push({ ...axes.shadows, cascades, localShadows, contact: true });
        }
      }
    }
    return {
      materials: [...records.values()],
      lights: [axes.lights],
      shadows,
      environments: [axes.environment],
      // Nothing draws a generated `pass: "depth"` program: shadow casters render through the PRD-02 depth shaders.
      includeDepth: false
    };
  }

  private async warmGeneratedPrograms(
    items: readonly RenderItem[],
    lights: readonly CollectedLight[],
    environmentLighting: EnvironmentLightingOptions | undefined,
    environmentFog: ForwardEnvironmentFogOptions | false | undefined,
    shadowMap: ForwardShadowMapOptions | undefined,
    cameraViewProjection: Float32Array | readonly number[] | undefined,
    shadowOptions?: RendererShadowOptions,
    prewarmClipping = false,
    frameContext?: FrameContributorContext,
    nativeDepthCoverage = false,
    signal?: AbortSignal
  ): Promise<void> {
    const flags = rendererQrFlags(this.device);
    if (!qrGeneratedProgramsOn(flags)) return;
    const tier: AuraQualityTier = this.qualityTierName ?? prd11LiveQualityTier(flags)?.tier ?? "high";
    const cache = rendererProgramCache(this.device, flags);
    const input = this.collectWarmupInput(items, lights, environmentLighting, environmentFog, shadowMap, cameraViewProjection, flags, tier, shadowOptions, prewarmClipping, frameContext, nativeDepthCoverage);
    if (input.materials.length > 0) {
      const warmup = (this.programWarmup ??= new ProgramWarmup(cache));
      await warmup.warm(input, tier);
    }
    assertWarmupActive([signal]);
    // T0-06: the ready barrier for `programsCompiledSinceReady` — compiles
    // completing after the first warm count as steady-state leaks.
    cache.markReady?.();
  }

  /**
   * T0-06: the sync `render` half of warm-then-block. Kicks `acquire` for the
   * exact draw feature records — async-compile devices start pending entries
   * (`precompile`/`app.ready` settle them); sync-compile devices compile under
   * the per-frame bound and converge over the next frames.
   */
  private warmGeneratedProgramsSync(
    items: readonly RenderItem[],
    lights: readonly CollectedLight[],
    environmentLighting: EnvironmentLightingOptions | undefined,
    environmentFog: ForwardEnvironmentFogOptions | false | undefined,
    shadowMap: ForwardShadowMapOptions | undefined,
    cameraViewProjection: Float32Array | readonly number[] | undefined,
    shadowOptions?: RendererShadowOptions,
    prewarmClipping = false,
    frameContext?: FrameContributorContext,
    nativeDepthCoverage = false
  ): void {
    const flags = rendererQrFlags(this.device);
    if (!qrGeneratedProgramsOn(flags)) return;
    const tier: AuraQualityTier = this.qualityTierName ?? prd11LiveQualityTier(flags)?.tier ?? "high";
    const cache = rendererProgramCache(this.device, flags);
    const input = this.collectWarmupInput(items, lights, environmentLighting, environmentFog, shadowMap, cameraViewProjection, flags, tier, shadowOptions, prewarmClipping, frameContext, nativeDepthCoverage);
    for (const features of collectWarmupFeatures(input, tier)) cache.acquire(features);
    cache.markReady?.();
  }

  renderScene(scene: RenderSource | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    return this.render(scene, camera);
  }
  renderItems(items: Iterable<RenderItem>, camera?: CameraLike, options: Omit<RenderSource, "renderItems"> = {}): RenderDeviceDiagnostics {
    return this.render({ ...options, renderItems: items }, camera);
  }
  captureFrame(source?: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RendererFrameCaptureWithMetadata {
    let diagnostics: RenderDeviceDiagnostics;
    if (source) {
      this.staticUnlitCaptureDepth += 1;
      try { diagnostics = this.render(source, camera); }
      finally { this.staticUnlitCaptureDepth -= 1; }
    } else diagnostics = this.device.getDiagnostics();
    const pixels = this.device.readPixels(0, 0, this.width, this.height);
    const metadata = createRendererFrameCaptureMetadata(this.device, this.width, this.height, pixels, diagnostics);
    return {
      width: this.width,
      height: this.height,
      pixels,
      diagnostics,
      capturedAt: metadata.capturedAt,
      renderSize: metadata.renderSize,
      pixelHash: metadata.pixelHash,
      pixelDigest: metadata.pixelDigest,
      pixelStats: metadata.pixelStats,
      diagnosticsSummary: metadata.diagnosticsSummary,
      metadata
    };
  }
  getDiagnostics(): RenderDeviceDiagnostics {
    const diagnostics = this.device.getDiagnostics();
    const cleanupIssues = [
      ...(this.temporalLossCleanupFailures.length ? ["Temporal history cleanup failed during device loss"] : []),
      ...(this.nativeDrawingRetirementFailures().length ? ["Native drawing retirement failed"] : [])
    ];
    return { ...diagnostics,
      ...(cleanupIssues.length ? { lastError: [diagnostics.lastError, ...cleanupIssues].filter(Boolean).join("; ") } : {}),
      ...(this.lastDrawingPath ? { drawingPath: this.lastDrawingPath } : {}), ...this.temporalDiagnostics() };
  }
  private disposeParticleSimulations(): void {
    if (this.particleCleanupInProgress) return;
    this.particleCleanupPending = true;
    this.particleCleanupInProgress = true;
    try {
      disposePrd07GpuSimsForOwner(this.device, this.viewScopeId);
      this.particleCleanupPending = false;
    } finally {
      this.particleCleanupInProgress = false;
    }
  }
  private ownsDeviceRetirement(): boolean {
    return this.retiredDeviceCleanupOwner
      && rendererDeviceDisposalOwners.get(this.device) === this.deviceDisposalOwner
      && !rendererDeviceOwners.has(this.device);
  }

  /**
   * Observe this renderer's drawing retirements and its final device release.
   * A renderer handing a shared device to a peer does not wait for that peer.
   */
  async whenOwnedDeviceDisposed(): Promise<void> {
    // Native drawing allocations are renderer-owned, even when a live peer
    // owns the shared device. Their queue fences must not be mistaken for
    // completed teardown merely because this renderer handed off the device.
    const drawing = this.disposed || this.disposalInProgress ? this.whenNativeDrawingRetired() : Promise.resolve();
    // Start the existing device receipt before yielding, so a later retry
    // cannot change which device disposal attempt this caller observes.
    const device = this.observeOwnedDeviceDisposal();
    await Promise.all([drawing, device]);
  }

  private async observeOwnedDeviceDisposal(): Promise<void> {
    const device = this.device;
    let version = this.deviceDisposalVersion;
    try {
      if (!this.ownsDeviceRetirement()) return;
      if (!device.disposed) {
        throw new RenderDeviceError("Render device disposal did not complete", "RENDERER_DEVICE_DISPOSAL_INCOMPLETE");
      }
      const whenDisposed = device.whenDisposed;
      if (!this.ownsDeviceRetirement()) return;
      if (whenDisposed) {
        const completion = whenDisposed.call(device);
        if (!this.ownsDeviceRetirement()) {
          void Promise.resolve(completion).catch(() => {});
          return;
        }
        await completion;
      }
      if (!this.ownsDeviceRetirement()) return;
      const pending = (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true;
      this.deviceCompletionPending = pending;
      if (this.deviceCompletionPending) {
        if (!whenDisposed) {
          throw new RenderDeviceError("Render device disposal did not complete", "RENDERER_DEVICE_DISPOSAL_INCOMPLETE");
        }
        // A lane wrapper can have observed native retirement still in flight.
        // Once it succeeds, give that retryable wrapper a chance to record its
        // completed native phase; its own already-completed phases stay closed.
        this.disposeOwnedDevice();
        version = this.deviceDisposalVersion;
        if (!this.ownsDeviceRetirement()) return;
        await device.whenDisposed?.();
      }
      if (this.ownsDeviceRetirement() && (!device.disposed
          || (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true)) {
        throw new RenderDeviceError("Render device disposal did not complete", "RENDERER_DEVICE_DISPOSAL_INCOMPLETE");
      }
      this.deviceCompletionPending = false;
      if (this.deviceDisposalVersion === version) this.deviceCompletionFailed = false;
    } catch (error) {
      if (this.deviceDisposalVersion === version && this.ownsDeviceRetirement()) this.deviceCompletionFailed = true;
      throw error;
    }
  }

  private disposeOwnedDevice(): void {
    const device = this.device;
    if (rendererDeviceDisposalOwners.get(device) !== this.deviceDisposalOwner || rendererDeviceOwners.has(device)) return;
    if (rendererDeviceDisposalsInProgress.has(device)) {
      throw new RenderDeviceError("Render device disposal is already in progress", "RENDERER_DEVICE_DISPOSAL_BUSY");
    }
    // Native devices can close before their cleanup completes; backends without
    // the optional receipt use `disposed` as their completion contract.
    if (device.disposed && !this.deviceCompletionFailed
        && (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] !== true) return;
    // A completion getter can run user code; ownership may have changed while
    // querying it, just as it can during the other cleanup callbacks.
    if (rendererDeviceDisposalOwners.get(device) !== this.deviceDisposalOwner || rendererDeviceOwners.has(device)) return;
    rendererDeviceDisposalsInProgress.add(device);
    try {
      this.deviceDisposalVersion += 1;
      device.dispose();
      if (!device.disposed) {
        throw new RenderDeviceError("Render device disposal did not complete", "RENDERER_DEVICE_DISPOSAL_INCOMPLETE");
      }
      const pending = (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true;
      if (rendererDeviceDisposalOwners.get(device) !== this.deviceDisposalOwner || rendererDeviceOwners.has(device)) return;
      // Keep the last-owner token even when a void disposer returned before
      // its receipt. whenOwnedDeviceDisposed() reports an incomplete backend
      // which cannot provide an asynchronous completion.
      this.deviceCompletionPending = pending;
      this.deviceCompletionFailed = false;
    } catch (error) {
      // An asynchronous backend retains an attempt receipt even when its
      // synchronous close failed after setting disposed. A later explicit
      // retry must refresh that receipt without repeating native destruction.
      try {
        if (device.disposed && device.whenDisposed
            && (device as RenderDevice & { readonly [resourceDisposalPending]?: boolean })[resourceDisposalPending] === true) {
          this.deviceCompletionFailed = true;
        }
      } catch { /* Preserve the disposal failure. */ }
      throw error;
    } finally {
      rendererDeviceDisposalsInProgress.delete(device);
    }
  }

  private retireRendererDevice(release: (action: () => void) => void): void {
    // The device's own sweep may visit the same targets. Keep this renderer
    // registered until its failed temporal cleanup no longer owns resources,
    // including when another renderer on the device disposes in the meantime.
    if (this.temporalCleanupPending && rendererTemporalHistoryOwners.get(this.temporalHistory) === this.viewScopeId
        && this.temporalHistory[resourceDisposalPending]) return;
    if (!removeRendererDeviceOwner(this.device, this)) return;
    this.retiredDeviceCleanupOwner = true;
    rendererDeviceDisposalOwners.set(this.device, this.deviceDisposalOwner);
    // Own leases were already attempted above; do not retry failures twice in
    // this dispose call. Retired peers survive until the final device owner.
    release(() => this.host.post.drainRetiredChainTargets(false));
    if (rendererDeviceDisposalOwners.get(this.device) === this.deviceDisposalOwner
        && !rendererDeviceOwners.has(this.device)) release(() => disposeBatchPlanCacheFor(this.device));
    // A cleanup callback can construct another renderer on this device.
    // Never dispose its shared caches or device after ownership returns.
    if (rendererDeviceDisposalOwners.get(this.device) === this.deviceDisposalOwner && !rendererDeviceOwners.has(this.device)) {
      release(() => disposeRendererProgramCaches(this.device));
      if (!rendererDeviceOwners.has(this.device)) release(() => this.disposeOwnedDevice());
    }
    release(() => this.photometricResources?.dispose());
    release(() => this.finishProjectedSpotFrame());
  }

  dispose(): void {
    if (this.disposalInProgress) return;
    this.disposalInProgress = true;
    try {
    const errors: unknown[] = [];
    const release = (action: () => void): void => {
      try { action(); } catch (error) { errors.push(error); }
    };
    errors.push(...this.temporalLossCleanupFailures.splice(0));
    errors.push(...this.nativeDrawingLossCleanupFailures.splice(0));
    if (this.disposed) {
      release(() => this.retryNativeDrawingRetirements());
      if (this.temporalCleanupPending) release(() => this.disposeTemporalHistory());
      const retainedDeviceOwner = rendererDeviceOwners.get(this.device)?.has(this) === true;
      // In-flight frames/builds may have left new failures after the first
      // teardown. Both owners retain only unfinished resources themselves.
      // Another renderer may since have become the new last device owner.
      const lastDeviceOwner = !retainedDeviceOwner && this.retiredDeviceCleanupOwner
        && rendererDeviceDisposalOwners.get(this.device) === this.deviceDisposalOwner
        && !rendererDeviceOwners.has(this.device);
      if (lastDeviceOwner) release(() => this.host.post.drainRetiredChainTargets(true));
      else release(() => this.host.post.drainRetainedChainTargets());
      release(() => this.releaseBatchSource());
      if (retainedDeviceOwner) release(() => this.retireRendererDevice(release));
      if (lastDeviceOwner && rendererDeviceDisposalOwners.get(this.device) === this.deviceDisposalOwner
          && !rendererDeviceOwners.has(this.device)) {
        release(() => disposeBatchPlanCacheFor(this.device));
        release(() => this.disposeOwnedDevice());
      }
      if (this.particleCleanupPending && !this.particleCleanupInProgress) {
        release(() => this.disposeParticleSimulations());
      }
      if (errors.length) throw new AggregateError(errors, "Renderer disposal failed.", { cause: errors[0] });
      return;
    }
    this.disposed = true;
    this.abortPrecompiles(new RenderDeviceError("Renderer disposed during precompile", "DISPOSED_DEVICE"));
    release(() => this.retryNativeDrawingRetirements());
    this.temporalCleanupPending = true;
    release(() => this.host.post.retireChainOwner());
    release(() => { if (this.pendingAuthoredFrame) this.abortAuthoredFrame(this.pendingAuthoredFrame); });
    this.transmissionViews.clear();
    this.benchmarkMaskArmed = false;
    this.lastBenchmarkMaskFrame = null;
    this.benchmarkMaskResourcesValid = null;
    this.lastShadowEvidence = null;
    this.lastDrawingPath = null;
    this.lastTransparency = null;
    this.lastFrameInspection = null;
    this.lastInspectionTiming = null;
    this.inspectionHistory.length = 0;
    release(() => this.inspectionTiming.dispose());
    this.activeFrameTrace = null;
    release(() => this.frameTrace.dispose());
    this.temporalViews.clear();
    release(() => postDiagnostics.resetScope(this.viewScopeId));
    this.lastTemporalCameraPosition.clear();
    this.targetTemporalIds.clear();
    release(() => this.host.post.drainRetainedChainTargets());
    release(() => this.photometricResources?.dispose());
    release(() => this.finishProjectedSpotFrame());
    release(() => disposePrd07RendererAuthority(this));
    release(() => this.disposeParticleSimulations());
    release(() => this.animationLoop?.stop());
    this.animationLoop = null;
    release(() => this.shadowDepthTarget?.dispose());
    this.shadowDepthTarget = null;
    release(() => this.forwardColorTarget?.target.dispose());
    this.forwardColorTarget = null;
    release(() => this.selectiveBloomTarget?.dispose());
    this.selectiveBloomTarget = null;
    release(() => this.hdrSceneTarget?.target.dispose());
    this.hdrSceneTarget = null;
    release(() => this.sceneDepthCopyTarget?.dispose());
    this.sceneDepthCopyTarget = null;
    release(() => this.disposeNativeDrawingPipeline());
    release(() => this.unsubscribeTemporalDeviceLoss?.());
    release(() => this.unsubscribeDprWatch?.());
    release(() => this.disposeTemporalHistory());
    release(() => this.releaseTemporalTransferTracker?.());
    this.releaseTemporalTransferTracker = undefined;
    release(() => this.splatColorCompositor?.dispose());
    this.splatColorCompositor = undefined;
    release(() => this.weightedTransparency?.dispose());
    this.weightedTransparency = undefined;
    release(() => this.releasePostEffectScope());
    release(() => {
      const native = this.nativePostTransactions();
      try {
        if (native) withRendererPostAccess(this.device, this.viewScopeId, this.#nativePostOwner, "unregister", undefined, undefined, undefined,
          () => native.unregisterNativePostRenderer(this.viewScopeId));
      } finally { this.#nativePostRegistered = false; removeRendererPostOwner(this.device, this.viewScopeId, this.#nativePostOwner); }
    });
    for (const target of this.viewTargets.values()) release(() => target.dispose());
    this.viewTargets.clear();
    release(() => this.viewComposite?.pipeline.dispose());
    release(() => this.viewComposite?.geometry.dispose());
    release(() => this.viewComposite?.shader.dispose());
    this.viewComposite = undefined;
    release(() => this.releaseBatchSource());
    // Native WebGPU buffers retire through the device's own queue tracker if
    // a completion fence is still pending at renderer disposal.
    for (const finish of [...this.pendingPackedLoopReleases]) release(finish);
    release(() => this.retireRendererDevice(release));
    if (errors.length) throw new AggregateError(errors, "Renderer disposal failed.", { cause: errors[0] });
    } finally {
      this.disposalInProgress = false;
      try { this.releaseTemporalHistoryOwnership(); }
      finally { this.notifyNativeDrawingRetirementWaiters(); }
    }
  }

  /** True for renderer-lifetime targets that must survive end-of-frame disposal. */
  private isReusedTarget(target: RenderTarget): boolean {
    return target === this.forwardColorTarget?.target || target === this.selectiveBloomTarget?.target || target === this.shadowDepthTarget || target === this.hdrSceneTarget?.target || target === this.sceneDepthCopyTarget || [...this.viewTargets.values()].includes(target);
  }

  /**
   * C-05 HDR scene target under `A3D_QR_CORE_OUTPUT` — renderScale-sized,
   * with a sampleable depth texture and optional BACKGROUND_COVERAGE attachment.
   */
  private ensureHdrSceneTarget(format: "rgba8" | "rgba16f", coverage: boolean, forceSingleSample = false): RenderTarget {
    const scale = Math.min(Math.max(this.renderScale, 0.01), 1);
    const width = Math.max(1, Math.round(this.width * scale));
    const height = Math.max(1, Math.round(this.height * scale));
    // C-36: WebGL2 does not support multisample MRT — coverage forces a
    // non-MSAA target and is declared via `hdr-msaa-mrt-unsupported`.
    // The 4x WebGPU depth resolve exists, but contributors can still require
    // the live single-sample sceneDepth. Until that requirement is declared,
    // keep it available and report the loss of MSAA explicitly.
    const sampleCount = coverage || forceSingleSample || this.device.kind === "webgpu" ? 1 : 4;
    const key = `${width}x${height}:${format}:depth-texture:${sampleCount}:${coverage ? "cov" : "std"}`;
    const cached = this.hdrSceneTarget;
    if (cached && cached.key === key && !cached.target.disposed) return cached.target;
    cached?.target.dispose();
    const target = this.device.createRenderTarget({
      width,
      height,
      label: "renderer-hdr-scene",
      format,
      ...(coverage ? { colorAttachments: [{ format }, { format: "rgba8" }] as const } : {}),
      depth: "texture",
      sampleCount
    });
    this.hdrMsaaMrtDegraded = coverage;
    this.hdrMsaaDepthDegraded = this.device.kind === "webgpu" && !coverage;
    this.hdrSceneTarget = { target, key };
    return target;
  }

  private ensureSceneDepthCopy(width: number, height: number): RenderTarget {
    this.sceneDepthCopyTarget = ensureSceneDepthCopyTarget(this.device, this.sceneDepthCopyTarget, width, height);
    return this.sceneDepthCopyTarget;
  }

  /**
   * C-05 OutputPass invocation (§8.4 step "output"): `u_exposure` =
   * `output.exposure × blackboard["prd03.exposure"]` (upstream defaults to 1
   * until lane 03 publishes it — Q-03-1).
   */
  private executeOutputPass(
    frameHooks: { blackboardValue<T>(key: string): T | undefined },
    _items: readonly RenderItem[],
    hdrTarget: RenderTarget | null,
    explicitRenderTarget?: RenderTarget | null
  ): void {
    if (!hdrTarget) return;
    const o = this.outputOptions;
    const upstream = frameHooks.blackboardValue<number>(PRD03_EXPOSURE);
    const appliedExposure = (o.exposure ?? 1) * (typeof upstream === "number" && Number.isFinite(upstream) ? upstream : 1);
    const format = probeHdrTargetFormat(this.device);
    const targetFormat: "rgba16f" | "rgba8" = format === "rgba8" ? "rgba8" : "rgba16f";
    const coverage = o.backgroundCoverage === true;
    this.device.setRenderTarget(explicitRenderTarget ?? null);
    rendererOutputPass(this.device).execute(hdrTarget, coverage ? hdrTarget : null, {
      toneMapping: o.toneMapping ?? DEFAULT_TONE_MAPPING,
      exposure: appliedExposure,
      dithering: o.dithering ?? DEFAULT_OUTPUT_DITHERING,
      backgroundCoverage: coverage,
      outputColorSpace: o.outputColorSpace ?? "srgb",
      alphaMode: o.alphaMode ?? "opaque",
      ...(o.inputAlphaMode !== undefined ? { inputAlphaMode: o.inputAlphaMode } : {}),
      overlay: o.overlay
    }, explicitRenderTarget ?? "canvas");
    this.lastAppliedOutput = {
      toneMapping: o.toneMapping ?? DEFAULT_TONE_MAPPING,
      exposure: { applied: appliedExposure, source: upstream !== undefined ? "grade" : "output" },
      dithering: o.dithering ?? DEFAULT_OUTPUT_DITHERING,
      targetFormat,
      degraded: targetFormat === "rgba8" ? "rgba8-no-float-target" : this.hdrMsaaMrtDegraded ? "hdr-msaa-mrt-unsupported" : this.hdrMsaaDepthDegraded ? "hdr-msaa-depth-unsupported" : undefined
    };
  }
  /** Allocates the shared forward-color target once per distinct configuration. */
  private ensureForwardColorTarget(format: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">, requiresDepthTexture: boolean, sampleCount: number, nativeDepthCoverage = false): RenderTarget {
    const key = `${this.width}x${this.height}:${format}:${requiresDepthTexture ? "depth-texture" : "depth"}:${sampleCount}:${nativeDepthCoverage ? "coverage" : "color"}`;
    const cached = this.forwardColorTarget;
    if (cached && cached.key === key && !cached.target.disposed) return cached.target;
    cached?.target.dispose();
    const target = this.device.createRenderTarget({
      width: this.width,
      height: this.height,
      label: "renderer-forward-color",
      format,
      depth: requiresDepthTexture ? "texture" : true,
      sampleCount,
      ...(nativeDepthCoverage ? { colorAttachments: [{ format }, { format: "rgba8" as const }] } : {})
    });
    this.forwardColorTarget = { target, key };
    return target;
  }

  /** Select a candidate before contributors see the target or scene depth. */
  private selectiveBloomCandidate(original: RenderTarget): RenderTarget | null {
    const format = original.colorTexture.format;
    if (format !== "rgba16f" && format !== "rgba32f") return null;
    const samples = original.sampleCount ?? 1;
    const key = `${this.width}x${this.height}:${format}:${original.depthTexture ? "texture" : "renderbuffer"}:${samples}`;
    let target = this.selectiveBloomTarget?.key === key && !this.selectiveBloomTarget.target.disposed
      ? this.selectiveBloomTarget.target : undefined;
    if (!target) {
      const created = createSelectiveBloomTarget(this.device, this.width, this.height, format, Boolean(original.depthTexture), samples);
      if (!created) return null;
      this.selectiveBloomTarget?.dispose();
      this.selectiveBloomTarget = { ...created, key };
      target = created.target;
    }
    return target.colorTextures?.[1] ? target : null;
  }

  /** A late decline never changes the chosen target or replays callbacks. */
  private prepareSelectiveBloom(
    pass: ForwardPass,
    frame: SelectiveBloomFrame,
    post: RendererPostProcessOptions,
    flags: QrFlags,
    hasBackground: boolean,
    target: RenderTarget,
    source: unknown
  ): string | null {
    if (!frame.valid) return frame.invalidReason ?? "frame-contributor-output";
    const reason = selectiveBloomDecline(this.device, post, target, flags, hasBackground, this.host.post.v2SeamDeclineFor(post), source);
    if (reason) return reason;
    const programReason = pass.prepareSelectiveBloom(this.device);
    if (programReason) return programReason;
    frame.enabled = true;
    return null;
  }

  /** Only the signal from this successfully completed frame may reach bloom. */
  private finishSelectiveBloom(
    post: RendererPostProcessOptions,
    frame: SelectiveBloomFrame,
    requested: boolean,
    flags: QrFlags,
    hasBackground: boolean,
    target: RenderTarget | undefined,
    source: unknown
  ): RendererPostProcessOptions {
    // Neither public bloom bag may smuggle an unverified alpha/texture signal
    // into the legacy chain. Preserve every other option on fallback. A frame
    // without any selective key returns `post` itself (no copy).
    const signalKeys = (bag: object): boolean =>
      "selective" in bag || "signalTexture" in bag || "selectiveRequested" in bag || "selectiveUnsupportedSource" in bag;
    let sanitized = post;
    if (post.bloom && typeof post.bloom === "object" && signalKeys(post.bloom)) {
      const { selective, signalTexture, selectiveRequested, selectiveUnsupportedSource, ...rest } = post.bloom as unknown as Record<string, unknown>;
      if (selective !== undefined || signalTexture !== undefined || selectiveRequested !== undefined || selectiveUnsupportedSource !== undefined) {
        sanitized = { ...post, bloom: rest as unknown as RendererPostProcessOptions["bloom"] };
      }
    }
    const pipeline = sanitized.pipeline as Record<string, unknown> | undefined;
    const bloom = pipeline?.bloom;
    if (!pipeline || !bloom || typeof bloom !== "object") return sanitized;
    if (!requested && !signalKeys(bloom)) return sanitized;
    const {
      selective: _selective,
      signalTexture: _signalTexture,
      selectiveRequested: _selectiveRequested,
      selectiveUnsupportedSource: _selectiveUnsupportedSource,
      ...rest
    } = bloom as Record<string, unknown>;
    let signal: Texture | undefined;
    if (requested && frame.enabled && target) {
      const reason = !frame.valid ? frame.invalidReason ?? "forward-program-fallback" :
        selectiveBloomDecline(this.device, post, target, flags, hasBackground, this.host.post.v2SeamDeclineFor(post), source);
      signal = reason ? undefined : target.colorTextures?.[1];
      setSelectiveBloomSkipped(this.canvas ?? this.device, reason ?? (signal ? undefined : "signal-target-unavailable"));
    }
    if (!signal && _selective === undefined && _signalTexture === undefined &&
        _selectiveRequested === undefined && _selectiveUnsupportedSource === undefined) return sanitized;
    return { ...sanitized, pipeline: { ...pipeline, bloom: { ...rest, ...(signal ? { selective: true, signalTexture: signal } : {}) } } };
  }

  /** PRD 11: this device's app-bound live C-27 tier (A3D_QR_TIERS on), else undefined. */
  private liveQualityTier(): LiveQualityTierSource | undefined {
    return prd11LiveQualityTier(rendererQrFlags(this.device));
  }

  private assertAlive(): void {
    if (this.disposed || this.device.disposed) {
      throw new RenderDeviceError("Renderer is disposed", "DISPOSED_DEVICE");
    }
  }
  private resizeCanvas(width: number, height: number): void {
    if (!this.canvas) return;
    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
  }
  private executePostprocess(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): void {
    return this.host.post.executePostprocess(postprocess, ownedTargets, outputTarget);
  }
  private async executePostprocessAsync(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): Promise<void> {
    return this.host.post.executePostprocessAsync(postprocess, ownedTargets, outputTarget);
  }
  private executeRendererShadowMap(options: {
    readonly shadowOptions: RendererShadowOptions | undefined;
    readonly timeSeconds?: number;
    readonly source: RenderSource | Iterable<RenderItem> | Scene;
    readonly items: readonly RenderItem[];
    readonly lights: readonly CollectedLight[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: Array<{ dispose(): void }>;
    readonly camera?: Camera;
    readonly cameraPosition?: readonly [number, number, number];
    readonly frameCamera?: Prd02BridgeFrameCamera;
    /** Every visible item of the frame (shadow receivers); lets the sun cascades skip a cascade no item selects. */
    readonly receivers?: readonly RenderItem[];
  }): ForwardShadowMapOptions | undefined {
    return withRendererQrFlags(this.device, () => this.host.shadows.executeRendererShadowMap(options));
  }
}
export function pickSceneRenderables(
  source: Pick<RenderSource, "geometryLibrary" | "morphTargetLibrary" | "scene">,
  ray: Ray,
  options: ScenePickOptions = {}
): ScenePickHit | undefined {
  return pickSceneRenderableHits(source, ray, options)[0];
}
export function pickSceneRenderableHits(
  source: Pick<RenderSource, "geometryLibrary" | "morphTargetLibrary" | "scene">,
  ray: Ray,
  options: ScenePickOptions = {}
): readonly ScenePickHit[] {
  const pointRadius = options.pointRadius;
  const lineRadius = options.lineRadius;
  if (pointRadius !== undefined && (!Number.isFinite(pointRadius) || pointRadius <= 0)) {
    throw new RenderDeviceError("Scene point picking radius must be a finite positive number", "SCENE_PICK_RADIUS_INVALID", { pointRadius });
  }
  if (lineRadius !== undefined && (!Number.isFinite(lineRadius) || lineRadius <= 0)) {
    throw new RenderDeviceError("Scene line picking radius must be a finite positive number", "SCENE_PICK_RADIUS_INVALID", { lineRadius });
  }
  const scene = source.scene;
  if (!scene) {
    throw new RenderDeviceError("Scene picking requires a scene", "SCENE_PICKING_SCENE_MISSING");
  }
  if (!source.geometryLibrary) {
    throw new RenderDeviceError("Scene picking requires a geometryLibrary resource lookup", "SCENE_PICKING_RESOURCES_MISSING");
  }

  scene.updateWorldTransforms();
  const hits: ScenePickHit[] = [];
  for (const { node, renderable } of scene.collectRenderables()) {
    const geometry = lookupRenderResource(source.geometryLibrary, renderable.geometry);
    if (!geometry) {
      throw new RenderDeviceError("Scene pick target references missing geometry", "SCENE_PICK_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    const morphTargets = source.morphTargetLibrary ? lookupRenderResource(source.morphTargetLibrary, renderable.geometry) : undefined;
    if (renderable.morphWeights.length > 0 && !morphTargets) {
      throw new RenderDeviceError("Scene pick target has morph weights but no morph target resource entry", "SCENE_PICK_MORPH_TARGETS_MISSING", {
        node: node.name,
        geometry: renderable.geometry,
        morphWeights: renderable.morphWeights.length
      });
    }
    const bounds = renderableWorldBounds(geometry, node.transform.worldMatrix, renderable.instanceTransforms, morphTargets, renderable.morphWeights, renderable.skinning);
    if (geometry.topology === "points" && options.pointRadius !== undefined) {
      hits.push(...pickPoints(node, geometry, ray, node.transform.worldMatrix, renderable.instanceTransforms, options.pointRadius));
      continue;
    }
    const pickBounds = geometry.topology === "lines" && options.lineRadius !== undefined
      ? expandSceneBounds(bounds, options.lineRadius)
      : bounds;
    const hitPoint = ray.intersectBox(pickBounds.toMathBox());
    if (hitPoint) {
      hits.push({ node, geometry, bounds: pickBounds, distance: hitPoint.distanceTo(ray.origin), hitPoint: hitPoint.toArray() });
    }
  }
  return hits.sort((left, right) => left.distance - right.distance);
}
function pickPoints(
  node: SceneNode,
  geometry: Geometry,
  ray: Ray,
  modelMatrix: Mat4,
  instanceTransforms: Float32Array | readonly number[] | undefined,
  pointRadius: number
): readonly ScenePickHit[] {
  const hits: ScenePickHit[] = [];
  const radiusSquared = pointRadius * pointRadius;
  const transforms = instanceTransforms ? collectInstanceWorldMatrices(modelMatrix, instanceTransforms) : [modelMatrix];
  const positions = geometry.getAttributeBuffer("position");
  for (let instanceIndex = 0; instanceIndex < transforms.length; instanceIndex += 1) {
    const transform = transforms[instanceIndex]!;
    for (let pointIndex = 0; pointIndex < geometry.vertexBuffer.vertexCount; pointIndex += 1) {
      const position = positions.getDecodedAttribute(pointIndex, "position");
      const worldPoint = transformPoint(transform, [position[0] ?? 0, position[1] ?? 0, position[2] ?? 0]);
      const distance = distanceAlongRay(ray, worldPoint);
      if (distance < 0) continue;
      const radialDistanceSquared = squaredDistanceToRayAt(ray, worldPoint, distance);
      if (radialDistanceSquared <= radiusSquared) {
        hits.push({
          node,
          geometry,
          bounds: expandPointBounds(worldPoint, pointRadius),
          distance,
          hitPoint: worldPoint,
          pointIndex,
          instanceIndex: instanceTransforms ? instanceIndex : undefined
        });
      }
    }
  }
  return hits;
}
function collectInstanceWorldMatrices(modelMatrix: Mat4, instanceTransforms: Float32Array | readonly number[]): readonly Mat4[] {
  const matrices: Mat4[] = [];
  for (let offset = 0; offset < instanceTransforms.length; offset += 16) {
    matrices.push(multiplyMat4(modelMatrix, toMat4(instanceTransforms.slice(offset, offset + 16), "instanceTransforms")));
  }
  return matrices;
}
function distanceAlongRay(ray: Ray, point: readonly [number, number, number]): number {
  return (
    (point[0] - ray.origin.x) * ray.direction.x +
    (point[1] - ray.origin.y) * ray.direction.y +
    (point[2] - ray.origin.z) * ray.direction.z
  );
}
function squaredDistanceToRayAt(ray: Ray, point: readonly [number, number, number], distance: number): number {
  const closestX = ray.origin.x + ray.direction.x * distance;
  const closestY = ray.origin.y + ray.direction.y * distance;
  const closestZ = ray.origin.z + ray.direction.z * distance;
  const dx = point[0] - closestX;
  const dy = point[1] - closestY;
  const dz = point[2] - closestZ;
  return dx * dx + dy * dy + dz * dz;
}
function expandPointBounds(center: readonly [number, number, number], radius: number): SceneBounds3 {
  return new SceneBounds3(
    [center[0] - radius, center[1] - radius, center[2] - radius],
    [center[0] + radius, center[1] + radius, center[2] + radius]
  );
}
function expandSceneBounds(bounds: SceneBounds3, radius: number): SceneBounds3 {
  return new SceneBounds3(
    [bounds.min[0] - radius, bounds.min[1] - radius, bounds.min[2] - radius],
    [bounds.max[0] + radius, bounds.max[1] + radius, bounds.max[2] + radius]
  );
}
class RendererAnimationLoopImpl implements RendererAnimationLoop {
  private requestId: number | null = null;
  public running = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly callback: (timeMs: number, renderer: Renderer) => void
  ) {}

  start(): void {
    if (typeof requestAnimationFrame !== "function" || typeof cancelAnimationFrame !== "function") {
      throw new RenderDeviceError("Renderer animation loops require requestAnimationFrame", "ANIMATION_LOOP_UNAVAILABLE");
    }
    this.running = true;
    this.requestId = requestAnimationFrame((timeMs) => this.tick(timeMs));
  }

  stop(): void {
    this.running = false;
    if (this.requestId !== null) {
      cancelAnimationFrame(this.requestId);
      this.requestId = null;
    }
  }

  private tick(timeMs: number): void {
    if (!this.running) {
      return;
    }
    this.callback(timeMs, this.renderer);
    if (this.running) {
      this.requestId = requestAnimationFrame((nextTimeMs) => this.tick(nextTimeMs));
    }
  }
}
function readCanvasCssSize(canvas: HTMLCanvasElement | OffscreenCanvas, axis: "width" | "height"): number {
  if ("getBoundingClientRect" in canvas) {
    const bounds = canvas.getBoundingClientRect();
    const value = axis === "width" ? bounds.width : bounds.height;
    if (value > 0) {
      return value;
    }
  }
  return axis === "width" ? canvas.width : canvas.height;
}
function inferInitialCanvasDimension(canvas: HTMLCanvasElement | OffscreenCanvas | undefined, axis: "width" | "height"): number {
  if (!canvas) return 1;
  const cssSize = readCanvasCssSize(canvas, axis);
  const dpr = Number.isFinite(globalThis.devicePixelRatio) && globalThis.devicePixelRatio > 0 ? globalThis.devicePixelRatio : 1;
  const displaySize = Math.round(cssSize * dpr);
  return Math.max(1, displaySize || (axis === "width" ? canvas.width : canvas.height) || 1);
}
function collectRenderTarget(source: RenderSource | Iterable<RenderItem> | Scene): RenderTarget | undefined {
  return source instanceof Scene || isIterable(source) ? undefined : source.renderTarget;
}
function validateExplicitRenderTarget(target: RenderTarget | undefined): void {
  if (!target) return;
  if (target.disposed) {
    throw new RenderDeviceError("Renderer renderTarget must be a live render target.", "RENDER_TARGET_DISPOSED", {
      renderTarget: target.label
    });
  }
  // threejs-parity L7/SH-06: no viewport-dimensions check — a `{ target }`
  // frame executes at the target's own size (`adoptExplicitTargetSize`).
}
function normalizeRendererInput(
  sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike
): RendererInput {
  if (isRendererInput(sourceOrInput)) {
    const target = sourceOrInput.target;
    const source = target ? withExplicitRenderTarget(sourceOrInput.source, target) : sourceOrInput.source;
    return { source, camera: camera ?? sourceOrInput.camera };
  }
  return { source: sourceOrInput, ...(camera ? { camera } : {}) };
}
interface PendingViewState {
  readonly viewport: RendererRect;
  readonly scissor: RendererRect | undefined;
  readonly skipClear: boolean;
}
function collectRendererViews(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene): readonly RendererView[] | undefined {
  if (sourceOrInput instanceof Scene || isIterable(sourceOrInput)) return undefined;
  const views = isRendererInput(sourceOrInput)
    ? sourceOrInput.views ?? (sourceOrInput.source instanceof Scene || isIterable(sourceOrInput.source) ? undefined : sourceOrInput.source.views)
    : sourceOrInput.views;
  if (!views) return undefined;
  if (views.length === 0) {
    throw new RenderDeviceError("Renderer views must contain at least one view.", "INVALID_VIEWPORT", { views: 0 });
  }
  return views;
}
/** Capture one authored collection for reuse by each independent view. */
function snapshotRendererSource(source: RenderSource | Iterable<RenderItem> | Scene): RenderSource {
  if (source instanceof Scene) return inheritProbeSourceOwner(source, { scene: source });
  if (isIterable(source)) return inheritProbeSourceOwner(source, { renderItems: [...source] });
  return inheritProbeSourceOwner(source, {
    ...source,
    ...(source.collectRenderItems
      ? { collectRenderItems: undefined, renderItems: [...source.collectRenderItems(), ...(source.renderItems ?? [])] }
      : source.renderItems ? { renderItems: [...source.renderItems] } : {})
  });
}
function viewHistoryId(id: string | number): string { return `view:${typeof id}:${String(id)}`; }
function collectSingleViewState(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene): PendingViewState | null {
  if (sourceOrInput instanceof Scene || isIterable(sourceOrInput) || !isRendererInput(sourceOrInput)) return null;
  if (!sourceOrInput.viewport && !sourceOrInput.scissor) return null;
  const viewport = sourceOrInput.viewport;
  const scissor = sourceOrInput.scissor ?? viewport;
  return {
    viewport: viewport ?? scissor!,
    scissor,
    skipClear: false
  };
}
function viewFrameInput(
  sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
  camera: CameraLike | undefined,
  view: RendererView,
  target?: RenderTarget
): RendererInput {
  const normalized = normalizeRendererInput(sourceOrInput, camera);
  const base: RenderSource = normalized.source instanceof Scene
    ? inheritProbeSourceOwner(normalized.source, { scene: normalized.source })
    : isIterable(normalized.source) ? inheritProbeSourceOwner(normalized.source, { renderItems: normalized.source }) : normalized.source;
  const { views: _views, ...rest } = base;
  return {
    source: inheritProbeSourceOwner(base, { ...rest, ...(target ? { renderTarget: target } : {}), ...(view.cameraPosition ? { cameraPosition: view.cameraPosition } : {}), ...(view.postprocess !== undefined ? { postprocess: view.postprocess } : {}) }),
    camera: view.camera
  };
}
function validateViewRect(label: "viewport" | "scissor", rect: RendererRect, targetWidth: number, targetHeight: number): void {
  const values = [rect.x, rect.y, rect.width, rect.height];
  if (values.some((value) => !Number.isInteger(value))) {
    throw new RenderDeviceError(`Renderer ${label} values must be finite integer pixels.`, "INVALID_VIEWPORT", { label, rect });
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new RenderDeviceError(`Renderer ${label} dimensions must be positive.`, "INVALID_VIEWPORT", { label, rect });
  }
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > targetWidth || rect.y + rect.height > targetHeight) {
    throw new RenderDeviceError(`Renderer ${label} must lie inside the ${targetWidth}x${targetHeight} target.`, "INVALID_VIEWPORT", { label, rect, targetWidth, targetHeight });
  }
}
function isRendererInput(value: RendererInput | RenderSource | Iterable<RenderItem> | Scene): value is RendererInput {
  return !(value instanceof Scene) && !isIterable(value) && isRecord(value) && "source" in value;
}
/**
 * threejs-parity L7/SH-06: fold a `{ target }` render input into the source's
 * `renderTarget` carry — Scene wraps as `{ scene }`, iterables as
 * `{ renderItems }`, a RenderSource keeps every other authored field.
 */
function withExplicitRenderTarget(
  source: RenderSource | Iterable<RenderItem> | Scene,
  target: RenderTarget
): RenderSource | Iterable<RenderItem> | Scene {
  if (source instanceof Scene) return inheritProbeSourceOwner(source, { scene: source, renderTarget: target });
  if (isIterable(source)) return inheritProbeSourceOwner(source, { renderItems: source, renderTarget: target });
  return inheritProbeSourceOwner(source, { ...source, renderTarget: target });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Native DoF needs the current frame's raster projection, never inferred camera defaults. */
function nativeDofProjection(camera: { readonly projectionMetadata?: FrameProjectionMetadata } | undefined,
  forward: { readonly projection?: Mat4; readonly consistent: boolean }): {
    readonly projection: WebGPULinearDepthProjection; readonly maxGeometryDepthMeters: number; readonly skyDepthMeters: number;
  } {
  const metadata = camera?.projectionMetadata;
  const matrix = forward.projection;
  if (!forward.consistent || !matrix || !metadata || (metadata.kind !== "perspective" && metadata.kind !== "orthographic")
    || metadata.mode !== "standard" || metadata.clipRange !== "minus-one-to-one"
    || typeof metadata.near !== "number" || typeof metadata.far !== "number" || matrix.length !== 16
    || !Array.from(matrix).every(Number.isFinite)) {
    throw new RenderDeviceError("Native depth of field requires the exact raster projection and explicit camera depth metadata", "NATIVE_DOF_PROJECTION_UNSUPPORTED");
  }
  try {
    const inverse = invertMat4(matrix);
    const product = multiplyMat4(matrix, inverse);
    if (!Array.from(product).every((v, i) => Number.isFinite(v) && Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-4)) throw new Error("singular projection");
    const projection: WebGPULinearDepthProjection = { kind: metadata.kind, mode: "standard", clipRange: "minus-one-to-one",
      inverseProjection: Array.from(inverse), nearMeters: metadata.near, farMeters: metadata.far, viewportDepthRange: [0, 1], clearValue: 1 };
    // The distance helper reserves an f32 margin above the far plane. Keep a
    // separate, representable sky value, and reject cameras without room.
    const maxGeometryDepthMeters = Math.fround(metadata.far * (1 + 2 ** -15));
    const skyDepthMeters = 100000;
    linearizeWebGPUDepthSample(1, projection, maxGeometryDepthMeters, skyDepthMeters, 1);
    return { projection, maxGeometryDepthMeters, skyDepthMeters };
  } catch (error) {
    throw new RenderDeviceError("Native depth of field cannot reconstruct this raster projection", "NATIVE_DOF_PROJECTION_UNSUPPORTED", { cause: String(error) });
  }
}

function nativeWebGPUDofRequested(device: RenderDevice, postprocess: RendererPostProcessOptions | undefined): boolean {
  return postprocess !== undefined && webgpuDepthOfFieldRequested(device, postprocess);
}

/** Generated unlit primitives with bounded color and depth-matched coverage. */
function assertNativeDofItems(items: readonly RenderItem[], flags: QrFlags): void {
  if (!qrCoreGeneratorOn(flags) || !forwardDrawReplaySafe(items, flags)) {
    throw new RenderDeviceError("Native depth of field requires trusted generated forward draws", "NATIVE_DOF_SCENE_UNSUPPORTED");
  }
  const defaults = new Set(["u_baseColor", "u_pointSize", "u_roundPoints", "u_pointSizeAttenuation", "u_alphaCutoff",
    "u_spriteMode", "u_spriteRotation", "u_spriteCenter", "u_spriteSizeAttenuation", "u_modelViewProjection",
    "u_instanceMatrices", "u_instanceCount", "u_instanceAttributeMode"]);
  for (const item of items) {
    if ((item.geometry.topology !== "triangles" && item.geometry.topology !== "lines") || item.skinning || item.morphTargets || item.morphWeights || item.instanceTransforms
      || item.instanceCount !== undefined || item.instanceColors || item.instanceAttributes || item.instanceEmissive
      || item.environmentCube || item.cubeCameraEnvMap || item.globalClipping || item.materialClipping
      || item.lodFade !== undefined || item.cameraFade !== undefined || item.userData || hasCombinedDrawIntent(item)) {
      throw new RenderDeviceError("Native depth of field requires opaque unlit triangles or lines without deformation or instancing", "NATIVE_DOF_SCENE_UNSUPPORTED", { label: item.label });
    }
    const material = item.material;
    if (!material) continue;
    if (!(material instanceof UnlitMaterial) || Object.getPrototypeOf(material) !== UnlitMaterial.prototype || material.disposed || material.shaderVariant !== undefined) {
      throw new RenderDeviceError("Native depth of field currently requires built-in unlit materials", "NATIVE_DOF_SCENE_UNSUPPORTED", { label: item.label });
    }
    const state = material.renderState;
    const parameters = material.getParameters();
    const color = parameters.get("u_baseColor");
    const alphaCutoff = parameters.get("u_alphaCutoff");
    const vertexColors = material.requiredAttributes.includes("a_color");
    if ((!Array.isArray(color) && !(color instanceof Float32Array)) || color.length !== 4
      || !Array.from(color).every((value, i) => Number.isFinite(value) && value >= 0 && value <= 1 && (i !== 3 || value === 1))
      || [...parameters.keys()].some(name => !defaults.has(name)) || typeof alphaCutoff !== "number" || !Number.isFinite(alphaCutoff) || alphaCutoff < 0 || alphaCutoff > 1
      || parameters.get("u_spriteMode") !== 0 || parameters.get("u_instanceCount") !== 0
      || material.requiredAttributes.some(name => name !== "a_position" && name !== "a_color")
      || (vertexColors && !nativeDofVertexColorSupported(item.geometry.vertexBuffer.format))
      || !state.depthTest || !state.depthWrite || state.depthCompare !== "less-equal"
      || (state.depthCompareV2 !== undefined && state.depthCompareV2 !== "less-equal")
      || state.blend || (state.blendMode !== undefined && state.blendMode !== "opaque")
      || state.alphaToCoverage || state.scissor || state.polygonOffset || state.stencil || !state.colorWrite.every(Boolean)) {
      throw new RenderDeviceError("Native depth of field requires bounded opaque color and matching color/depth writes", "NATIVE_DOF_SCENE_UNSUPPORTED", { label: item.label });
    }
  }
}
function collectCameraPolicy(source: RenderSource | Iterable<RenderItem> | Scene): RendererCameraPolicy {
  if (source instanceof Scene || isIterable(source)) return "identity";
  if (source.cameraPolicy) return source.cameraPolicy;
  if (source.scene && !source.renderItems && !source.collectRenderItems) return "auto-frame";
  if ((source.renderItems || source.collectRenderItems) && !source.renderTarget) return "auto-frame";
  return "identity";
}
function collectSourceCameraPosition(source: RenderSource | Iterable<RenderItem> | Scene): readonly [number, number, number] | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  const position = source.cameraPosition;
  if (position === undefined) return undefined;
  if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
    throw new RenderDeviceError("RenderSource cameraPosition must contain three finite numbers", "CAMERA_POSITION_INVALID", {
      cameraPosition: [...position]
    });
  }
  return position;
}

/** Copy clipping once per view frame so forward, camera depth and every
 * shadow caster see the same planes even if an authored group changes later. */
/**
 * Until contributor lifetimes are attested, a clipped renderer-owned shadow
 * cannot safely precede arbitrary collect or later scene-pass callbacks. This
 * registry query uses captured activation metadata and never reads a provider.
 */
function resolveForwardCameraMatrices(camera: {
  readonly viewMatrix?: Mat4; readonly projectionMatrix?: Mat4;
  readonly shaderViewMatrix?: Mat4; readonly shaderProjectionMatrix?: Mat4;
} | undefined, viewProjection: Mat4 | undefined): { readonly view?: Mat4; readonly projection?: Mat4; readonly consistent: boolean } {
  if (!camera) return { consistent: viewProjection === undefined };
  const view = camera.viewMatrix ?? camera.shaderViewMatrix;
  const projection = camera.projectionMatrix ?? camera.shaderProjectionMatrix;
  if (view && projection && viewProjection) {
    const composed = multiplyMat4(projection, view);
    const consistent = composed.every((value, index) => Math.abs(value - viewProjection[index]!) <=
      1e-5 * Math.max(1, Math.abs(value), Math.abs(viewProjection[index]!)));
    if (consistent) return { view, projection, consistent: true };
  }
  // A shader-only pair can deliberately describe a custom material camera.
  // Do not silently promote an inconsistent pair to the generated frame.
  return { view: camera.viewMatrix, projection: camera.projectionMatrix, consistent: false };
}

function assertSpriteFrameCamera(items: readonly RenderItem[], consistent: boolean,
  postprocess: RendererPostProcessOptions | undefined, flags: QrFlags): void {
  if (!qrCoreGeneratorOn(flags) || !flags.on("A3D_PARITY_LINES") ||
      !items.some(item => item.material?.getParameter("u_spriteMode") === 1)) return;
  if (!consistent || (postprocess?.taa && postprocess.temporal && !flags.on("A3D_QR_POST"))) {
    throw new RenderDeviceError("Generated sprites require matching scene view, projection and raster matrices", "SPRITE_CAMERA_MATRIX_UNSUPPORTED");
  }
}

function jitterForwardProjection(projection: Float32Array | readonly number[], jitter: readonly [number, number]): Float32Array {
  const result = Float32Array.from(projection);
  for (let column = 0; column < 4; column++) {
    result[column * 4] = result[column * 4]! + jitter[0] * result[column * 4 + 3]!;
    result[column * 4 + 1] = result[column * 4 + 1]! + jitter[1] * result[column * 4 + 3]!;
  }
  return result;
}

function temporalForwardProjection(camera: { readonly view?: Mat4; readonly projection?: Mat4; readonly consistent: boolean },
  rasterViewProjection: Float32Array | readonly number[], jitter: readonly [number, number] | undefined): Float32Array | undefined {
  if (jitter && Number.isFinite(jitter[0]) && Number.isFinite(jitter[1])) {
    return jitterForwardProjection(camera.projection ?? identityMat4(), jitter);
  }
  // A provider can supply a final raster matrix without a separate jitter
  // vector. Recover its projection only from a verified scene view, and keep
  // it absent if that relationship cannot be established.
  if (!camera.consistent || !camera.view) return undefined;
  try {
    const raster = toMat4(rasterViewProjection, "temporal raster viewProjection");
    const projection = multiplyMat4(raster, invertMat4(camera.view));
    const composed = multiplyMat4(projection, camera.view);
    if (!composed.every((value, index) => Number.isFinite(value) && Math.abs(value - raster[index]!) <=
      1e-5 * Math.max(1, Math.abs(value), Math.abs(raster[index]!)))) return undefined;
    return Float32Array.from(projection);
  } catch { return undefined; }
}

function assertBatchClippingResolver(hasResolver: boolean, items: readonly RenderItem[], casters: readonly RenderItem[]): void {
  if (hasResolver && (items.some(isEngineBatchInstanceItem) || casters.some(isEngineBatchInstanceItem))) {
    throw new RenderDeviceError("Per-member materialClippingFor is unavailable for batched instances", "BATCH_MATERIAL_CLIPPING_CALLBACK_UNSUPPORTED");
  }
}

/** Source and contributors must expose logical members before culling and observation. */
function assertPackedLoopLogicalItems(items: readonly RenderItem[]): void {
  for (const item of items) {
    const packet = packedLoopMemberFor(item);
    if (packet && packet.logicalItem !== item) {
      throw new RenderDeviceError("Packed loop carriers cannot enter logical item collection", "BATCH_LOOP_CARRIER_UNSUPPORTED");
    }
  }
}

/** Recover only the frozen engine source wrappers before culling and hooks. */
function recoverCombinedSourceItems(items: readonly RenderItem[]): readonly RenderItem[] {
  return items.map((item) => {
    const packet = packedLoopMemberFor(item);
    return packet && packet.logicalItem !== item && isEnginePackedBatchItem(item)
      && hasCombinedDrawIntent(item) && Object.isFrozen(item) ? packet.logicalItem : item;
  });
}

function assertClippedShadowContributors(shadow: RendererShadowOptions | undefined, explicit: ForwardShadowMapOptions | undefined,
  mayClip: boolean, flags: QrFlags): void {
  if (!mayClip || explicit || !shadow || shadow.enabled === false) return;
  if (!isTrustedQrFlags(flags) || potentiallyActiveFrameContributors(flags).length > 0) {
    throw new RenderDeviceError("Scene clipping cannot yet cover contributor-owned geometry", "SCENE_CLIPPING_CONTRIBUTOR_UNSUPPORTED");
  }
}

/**
 * Recognize ordinary source-owned clipping/shadow configuration before the
 * source collector runs, without invoking source accessors or contributors.
 * Dynamic item/collector clipping is checked again after collection and after
 * the clipping resolver runs, before the first renderer-owned shadow draw.
 */
function preflightClippedShadowSource(source: RenderSource | Iterable<RenderItem> | Scene, flags: QrFlags): void {
  if (source instanceof Scene || isIterable(source)) return;
  const shadow = Object.getOwnPropertyDescriptor(source, "shadow");
  if (!shadow || ("value" in shadow && !shadow.value)) return;
  if ("value" in shadow && typeof shadow.value === "object" && shadow.value !== null) {
    const enabled = Object.getOwnPropertyDescriptor(shadow.value, "enabled");
    if (enabled && "value" in enabled && enabled.value === false) return;
  }
  const explicit = Object.getOwnPropertyDescriptor(source, "shadowMap");
  if (explicit && "value" in explicit && explicit.value) return;
  const global = Object.getOwnPropertyDescriptor(source, "globalClipping");
  const material = Object.getOwnPropertyDescriptor(source, "materialClippingFor");
  const hasValue = (descriptor: PropertyDescriptor | undefined): boolean => Boolean(descriptor && (!("value" in descriptor) || descriptor.value != null));
  const potentiallyActiveGroup = (descriptor: PropertyDescriptor | undefined): boolean => {
    if (!hasValue(descriptor) || !descriptor) return false;
    if (!("value" in descriptor) || typeof descriptor.value !== "object" || descriptor.value === null) return true;
    const enabled = Object.getOwnPropertyDescriptor(descriptor.value, "enabled");
    const disposed = Object.getOwnPropertyDescriptor(descriptor.value, "disposed");
    const planes = Object.getOwnPropertyDescriptor(descriptor.value, "planes");
    return !(enabled && "value" in enabled && enabled.value === false)
      && !(disposed && "value" in disposed && disposed.value === true)
      && !(planes && "value" in planes && Array.isArray(planes.value) && planes.value.length === 0);
  };
  const itemMayClip = (item: unknown): boolean => {
    if (!item || typeof item !== "object") return false;
    if (potentiallyActiveGroup(Object.getOwnPropertyDescriptor(item, "globalClipping")) ||
        potentiallyActiveGroup(Object.getOwnPropertyDescriptor(item, "materialClipping"))) return true;
    const materialProperty = Object.getOwnPropertyDescriptor(item, "material");
    if (!materialProperty) return false;
    if (!("value" in materialProperty)) return true;
    const value: unknown = materialProperty.value;
    if (!value || typeof value !== "object") return false;
    const baseProperty = Object.getOwnPropertyDescriptor(value, "baseMaterial");
    if (baseProperty && !("value" in baseProperty)) return true;
    const base: unknown = baseProperty && "value" in baseProperty ? baseProperty.value : value;
    return !!base && typeof base === "object" && potentiallyActiveGroup(Object.getOwnPropertyDescriptor(base, "clipping"));
  };
  const renderItems = Object.getOwnPropertyDescriptor(source, "renderItems");
  let itemClipping = false;
  if (renderItems && "value" in renderItems && Array.isArray(renderItems.value)) {
    const entries = renderItems.value;
    const length = Object.getOwnPropertyDescriptor(entries, "length");
    if (!length || !("value" in length) || !Number.isSafeInteger(length.value) || length.value < 0) itemClipping = true;
    else for (let index = 0; index < length.value && !itemClipping; index++) {
      const entry = Object.getOwnPropertyDescriptor(entries, String(index));
      itemClipping = !entry || !("value" in entry) || itemMayClip(entry.value);
    }
  }
  if (potentiallyActiveGroup(global) || hasValue(material) || itemClipping) assertClippedShadowContributors({}, undefined, true, flags);
}

function createFrameClippingSnapshot(source: RenderSource | Iterable<RenderItem> | Scene, device: RenderDevice, shaderLibrary: ShaderLibrary): {
  readonly mayClip: boolean;
  readonly hasMaterialResolver: boolean;
  readonly snapshot: (item: RenderItem) => RenderItem;
  readonly assertShadow: (item: RenderItem) => void;
  readonly setCameraViewMatrix: (matrix: Float32Array | readonly number[] | undefined) => void;
  readonly hasActiveGlobal: () => boolean;
} {
  const options = source instanceof Scene || isIterable(source) ? undefined : source;
  const sourceGlobal = options?.globalClipping;
  const materialFor = options?.materialClippingFor;
  const planeLimit = options?.clippingPlaneLimit;
  let cameraViewMatrix: Float32Array | readonly number[] | undefined;
  const items = new WeakMap<RenderItem, RenderItem>();
  const globals = new WeakMap<object, ClippingGroupInput>();
  const materials = new WeakMap<object, ClippingGroupInput>();
  const snapshot = (group: ClippingGroupInput | undefined, scope: ClippingScope): ClippingGroupInput | undefined => {
    if (group == null) return undefined;
    const cache = scope === "global" ? globals : materials;
    if (typeof group === "object") {
      const previous = cache.get(group);
      if (previous) return previous;
    }
    const value = validateClippingGroup(group, scope);
    const frozen = Object.freeze({ ...value, planes: Object.freeze(value.planes.map(plane =>
      Object.freeze([plane[0], plane[1], plane[2], plane[3]] as const))) });
    if (typeof group === "object") cache.set(group, frozen);
    return frozen;
  };
  const snapshotItem = (item: RenderItem): RenderItem => {
    const previous = items.get(item);
    if (previous) return previous;
    const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
    const global = snapshot(item.globalClipping ?? sourceGlobal, "global");
    const material = snapshot(materialFor?.call(options, item) ?? item.materialClipping
      ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping, "material");
    if (!global && !material && planeLimit === undefined) { items.set(item, item); return item; }
    // Validate the stricter scene budget before either forward or shadow
    // submits; shadow can safely use the same snapshots with its default cap.
    const binding = createClippingBinding({ global, material, backend: device.kind, pass: "forward",
      primitive: item.geometry.topology === "lines" ? "line" : item.geometry.topology === "points" ? "point" : "mesh",
      maxPlanes: planeLimit });
    assertForwardClippingSupported(item, binding, { flags: rendererQrFlags(device), cameraViewMatrix, shaderLibrary });
    const fields = { ...item, ...(global ? { globalClipping: global } : {}), ...(material ? { materialClipping: material } : {}) };
    const result = isEnginePackedBatchItem(item) ? createEnginePackedBatchItem(fields)
      : isEngineBatchInstanceItem(item) ? createEngineBatchInstanceItem(fields) : fields;
    // The map is fallback provenance only; its presence never authorizes an
    // optimized draw. Physical clipping remains disabled until the ordered
    // logical-member fallback can be planned before contributor callbacks.
    transferBatchMembers(item, result);
    transferPackedLoopMember(item, result);
    items.set(item, result);
    return result;
  };
  return { mayClip: sourceGlobal != null || materialFor != null, hasMaterialResolver: materialFor != null, snapshot: snapshotItem,
    setCameraViewMatrix: matrix => { cameraViewMatrix = matrix; },
    assertShadow: item => assertDepthClippingSupported(item, createClippingBinding({
      global: item.globalClipping, material: item.materialClipping, backend: device.kind, pass: "shadow", maxPlanes: planeLimit
    }), device),
    hasActiveGlobal: () => sourceGlobal == null ? false : createClippingBinding({ global: snapshot(sourceGlobal, "global"), backend: device.kind, maxPlanes: planeLimit }).groups.length > 0 };
}

type ForwardPhaseSplit = ReturnType<typeof splitForwardItems>;

interface ForwardPhaseOrder {
  readonly opaque: readonly RenderItem[];
  readonly transparent: ForwardPhaseSplit["transparent"];
  readonly latestPriorOrder: number;
  readonly promoted: boolean;
}

/** Preserve explicit order without moving opaque depth past its consumers. */
function planForwardPhaseOrder(
  items: readonly RenderItem[], split: ForwardPhaseSplit, transmissionRequested: boolean
): ForwardPhaseOrder {
  const order = (item: RenderItem): number => {
    const value = item.renderOrder ?? 0;
    if (!Number.isFinite(value)) throw new RangeError("Render queue item renderOrder must be finite.");
    return value;
  };
  let latestOpaque = -Infinity;
  let earliestTransmission = Infinity;
  let latestTransmission = -Infinity;
  let earliestTransparent = Infinity;
  for (const item of split.opaque) latestOpaque = Math.max(latestOpaque, order(item));
  for (const item of split.transmission) {
    const value = order(item);
    earliestTransmission = Math.min(earliestTransmission, value);
    latestTransmission = Math.max(latestTransmission, value);
  }
  for (const { item } of split.transparent) earliestTransparent = Math.min(earliestTransparent, order(item));
  if (latestOpaque > earliestTransmission || latestTransmission > earliestTransparent) {
    throw new RenderDeviceError("renderOrder crosses the transmission capture phase", "RENDER_ORDER_PHASE_CONFLICT");
  }

  const early = split.transparent.filter(({ item }) => order(item) < latestOpaque);
  if (early.length && (transmissionRequested || split.transmission.length)) {
    throw new RenderDeviceError("renderOrder requires transparent color before the opaque transmission capture", "RENDER_ORDER_PHASE_CONFLICT");
  }
  for (const { item } of early) {
    const material = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
    if (material?.renderState.depthWrite !== false) {
      throw new RenderDeviceError("Early transparent draws must not write the opaque depth snapshot", "RENDER_ORDER_PHASE_CONFLICT");
    }
  }
  if (!early.length) {
    return { opaque: split.opaque, transparent: split.transparent, latestPriorOrder: Math.max(latestOpaque, latestTransmission), promoted: false };
  }
  const preOpaqueItems = new Set([...split.opaque, ...early.map(({ item }) => item)]);
  return {
    // Retain submission order for equal sort keys; ForwardPass does the sort.
    opaque: items.filter((item) => preOpaqueItems.has(item)),
    transparent: split.transparent.filter(({ item }) => order(item) >= latestOpaque),
    latestPriorOrder: latestOpaque,
    promoted: true
  };
}

function assertForwardPhaseOrder(
  plan: ForwardPhaseOrder,
  hooks: ReturnType<typeof createRendererFrameHooks>,
  flags: QrFlags,
  contributorQueues: readonly TransparentQueueItem[],
  queues: readonly TransparentQueueItem[]
): void {
  if (plan.promoted && (hooks.hasPasses("after-opaque") || hooks.hasPasses("transmission") || contributorQueues.length > 0
    || frameContributors(flags).some((contributor) => contributor.phases.includes("transparent") && contributor.passes))) {
    throw new RenderDeviceError("renderOrder conflicts with an opaque-only contributor phase", "RENDER_ORDER_PHASE_CONFLICT");
  }
  for (const queue of queues) {
    const order = queue.renderOrder ?? 0;
    if (!Number.isFinite(order)) throw new RangeError("Transparent queue renderOrder must be finite.");
    if (order < plan.latestPriorOrder) {
      throw new RenderDeviceError("renderOrder places a contributor before the completed opaque or transmission phase", "RENDER_ORDER_PHASE_CONFLICT");
    }
  }
}

function itemMayClip(item: RenderItem): boolean {
  const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  return item.globalClipping != null || item.materialClipping != null ||
    (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping != null;
}

function sourceMayClip(source: RenderSource | Iterable<RenderItem> | Scene): boolean {
  return !(source instanceof Scene) && !isIterable(source) && (source.globalClipping != null || source.materialClippingFor != null);
}

function itemHasActiveClipping(item: RenderItem): boolean {
  const active = (group: ClippingGroupInput | undefined): boolean => Boolean(group && group.enabled !== false && !group.disposed && group.planes.length);
  const base = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
  return active(item.globalClipping) || active(item.materialClipping ?? (base as (typeof base & { readonly clipping?: ClippingGroupInput }))?.clipping);
}
export function collectRenderItems(
  source: RenderSource | Iterable<RenderItem> | Scene,
  cameraViewProjection?: Mat4,
  camera?: Camera
): readonly RenderItem[] {
  return collectRenderItemsWithDiagnostics(source, cameraViewProjection, camera).items;
}
function collectRenderItemsWithDiagnostics(
  source: RenderSource | Iterable<RenderItem> | Scene,
  cameraViewProjection?: Mat4,
  camera?: Camera,
  keepCulledShadowCasters = false,
  cameraLayerMask?: number,
  batchCacheKey?: object,
  prepareAdvancedItems?: (items: readonly RenderItem[]) => readonly RenderItem[],
  batchFlags?: QrFlags,
  batchDevice?: RenderDevice,
  cameraFrustum?: Frustum
): { readonly items: readonly RenderItem[]; readonly logicalItems: readonly RenderItem[]; readonly diagnostics: RenderCollectionDiagnostics; readonly culledShadowCasters: readonly RenderItem[]; readonly mergedIdentities: boolean; readonly cullingFrustum?: Frustum; readonly bloomRequestedBeforeBatching?: boolean; readonly bloomMetadataUnsafe?: boolean; readonly bloomWeightAssignments?: WeakMap<RenderItem, number> } {
  const diagnostics = createRenderCollectionDiagnostics();
  // 02-S5 (A3D_QR_LIGHTING): frustum-culled items that still cast. A caster
  // outside the view (a pole behind the camera under a low sun) must reach
  // the shadow pass. Flag-off collects nothing extra.
  const culledShadowCasters: RenderItem[] | undefined = keepCulledShadowCasters ? [] : undefined;
  if (isIterable(source)) {
    const logical = recoverCombinedSourceItems([...source]);
    assertPackedLoopLogicalItems(logical);
    const items = applyViewProjection(logical, cameraViewProjection);
    diagnostics.submittedObjects += items.length;
    diagnostics.visibleObjects += items.length;
    return { items, logicalItems: items, diagnostics, culledShadowCasters: culledShadowCasters ?? [], mergedIdentities: false };
  }
  if (source instanceof Scene) {
    const cullingFrustum = cameraFrustum ?? camera?.frustum.clone();
    const items = collectSceneRenderItems(source, {}, cameraViewProjection, camera, diagnostics, culledShadowCasters, cameraLayerMask, cullingFrustum);
    return { items, logicalItems: items, diagnostics, culledShadowCasters: culledShadowCasters ?? [], mergedIdentities: false, ...(cullingFrustum ? { cullingFrustum } : {}) };
  }
  const items: RenderItem[] = [];
  const logicalItems: RenderItem[] = [];
  let mergedIdentities = false;
  let cullingFrustum: Frustum | undefined;
  // Collection can update the live camera; keep culling aligned with the
  // camera matrices already captured for this frame.
  const frameFrustum = (source.frustumCulling === true || (source.scene && source.frustumCulling !== false))
    ? cameraFrustum ?? camera?.frustum.clone() : undefined;
  const explicitFrustum = source.frustumCulling === true
    ? frameFrustum ?? explicitCullingFrustum(source, cameraViewProjection, undefined) : undefined;
  if (source.scene) {
    if (prepareAdvancedItems) throw new RenderDeviceError("Advanced lighting requires explicit source items", "ADVANCED_LIGHTING_SOURCE_UNSUPPORTED");
    cullingFrustum = frameFrustum;
    const sceneItems = collectSceneRenderItems(source.scene, source, cameraViewProjection, source.frustumCulling === false ? undefined : camera, diagnostics, culledShadowCasters, cameraLayerMask, cullingFrustum);
    items.push(...sceneItems);
    logicalItems.push(...sceneItems);
  }
  const explicitItems: RenderItem[] = [];
  let bloomRequestedBeforeBatching = false;
  let bloomMetadataUnsafe = false;
  let bloomWeightAssignments: WeakMap<RenderItem, number> | undefined;
  if (source.collectRenderItems) {
    explicitItems.push(...source.collectRenderItems());
  }
  if (source.renderItems) {
    explicitItems.push(...source.renderItems);
  }
  const recoveredItems = recoverCombinedSourceItems(explicitItems);
  assertPackedLoopLogicalItems(recoveredItems);
  const preparedItems = prepareAdvancedItems ? prepareAdvancedItems(recoveredItems) : recoveredItems;
  if (!Array.isArray(preparedItems)) throw new RenderDeviceError("Advanced lighting must return an item list", "ADVANCED_LIGHTING_FRAME_UNAVAILABLE");
  assertPackedLoopLogicalItems(preparedItems);
  if (preparedItems.length > 0) {
    cullingFrustum ??= explicitFrustum;
    const visibleItems = cullExplicitRenderItems(preparedItems, explicitFrustum, diagnostics, culledShadowCasters, cameraLayerMask ?? camera?.layerMask);
    // A scene item, untrusted backend or draw hook may register an observer
    // after an explicit item was merged. Keep the entire frame logical until
    // execution trust and per-member fallback are available.
    const mayOptimize = !prepareAdvancedItems && items.length === 0 && batchDevice !== undefined &&
      isTrustedBatchExecutionDevice(batchDevice) && !hasForwardDrawHooks() && !sourceMayClip(source) && !visibleItems.some(itemMayClip);
    const consolidatedItems = mayOptimize ? applyRendererOwnedStaticMeshConsolidation(source, visibleItems, batchCacheKey, batchFlags) : visibleItems;
    const optimizedItems = mayOptimize ? applyRendererOwnedStaticBatching(source, consolidatedItems, batchCacheKey, batchFlags) : consolidatedItems;
    mergedIdentities = consolidatedItems.length < visibleItems.length || optimizedItems.length < consolidatedItems.length;
    const transferred = mayOptimize && (source.staticBatching || source.staticMeshConsolidation) && collectPostprocess(source)?.bloom
      ? transferUnmergedBloomWeights(visibleItems, optimizedItems)
      : { weights: undefined, requested: false, unsafe: false };
    bloomRequestedBeforeBatching = transferred.requested;
    bloomMetadataUnsafe = transferred.unsafe;
    const projectedItems = applyViewProjection(optimizedItems, cameraViewProjection);
    if (transferred.weights) {
      bloomWeightAssignments = new WeakMap<RenderItem, number>();
      projectedItems.forEach((item, index) => bloomWeightAssignments!.set(item, transferred.weights![index]!));
    }
    items.push(...projectedItems);
    logicalItems.push(...(mergedIdentities ? applyViewProjection(visibleItems, cameraViewProjection) : projectedItems));
  }
  return {
    items, logicalItems, diagnostics, culledShadowCasters: culledShadowCasters ?? [], mergedIdentities,
    ...(bloomRequestedBeforeBatching ? { bloomRequestedBeforeBatching: true } : {}),
    ...(bloomMetadataUnsafe ? { bloomMetadataUnsafe: true } : {}),
    ...(bloomWeightAssignments ? { bloomWeightAssignments } : {}),
    ...(cullingFrustum ? { cullingFrustum } : {})
  };
}

/** Auto-framing clones items; keep only the private bloom metadata in step. */
function transferBloomWeightReferences(before: readonly RenderItem[], after: readonly RenderItem[], weights?: WeakMap<RenderItem, number>): void {
  if (!weights) return;
  before.forEach((item, index) => {
    const weight = weights.get(item);
    if (weight !== undefined && after[index]) weights.set(after[index]!, weight);
  });
}
function collectSceneRenderItems(
  scene: Scene,
  source: Pick<RenderSource, "geometryLibrary" | "materialLibrary" | "morphTargetLibrary">,
  cameraViewProjection?: Mat4,
  camera?: Camera,
  diagnostics?: RenderCollectionDiagnostics,
  culledShadowCasters?: RenderItem[],
  explicitCameraLayerMask?: number,
  cameraFrustum?: Frustum
): readonly RenderItem[] {
  scene.updateWorldTransforms();
  const renderables = scene.collectRenderables();
  if (renderables.length === 0) {
    return [];
  }
  if (!source.geometryLibrary || !source.materialLibrary) {
    throw new RenderDeviceError("Scene rendering requires geometryLibrary and materialLibrary resource lookups", "SCENE_RENDER_RESOURCES_MISSING", {
      renderables: renderables.length
    });
  }
  const items: RenderItem[] = [];
  const cameraLayerMask = explicitCameraLayerMask ?? camera?.layerMask;
  const cullingFrustum = cameraFrustum ?? camera?.frustum;
  for (const { node, renderable } of renderables) {
    // threejs-parity L7/SG-10: three's camera.layers test — a node whose
    // layers do not intersect the camera mask is absent from the frame.
    if (cameraLayerMask !== undefined && (node.layerMask & cameraLayerMask) === 0) continue;
    const geometry = lookupRenderResource(source.geometryLibrary!, renderable.geometry);
    const material = lookupRenderResource(source.materialLibrary!, renderable.material);
    if (!geometry) {
      throw new RenderDeviceError("Scene renderable references missing geometry", "SCENE_GEOMETRY_MISSING", {
        node: node.name,
        geometry: renderable.geometry
      });
    }
    if (!material) {
      throw new RenderDeviceError("Scene renderable references missing material", "SCENE_MATERIAL_MISSING", {
        node: node.name,
        material: renderable.material
      });
    }
    const morphTargets = source.morphTargetLibrary ? lookupRenderResource(source.morphTargetLibrary, renderable.geometry) : undefined;
    if (renderable.morphWeights.length > 0 && !morphTargets) {
      throw new RenderDeviceError("Scene renderable has morph weights but no morph target resource entry", "SCENE_MORPH_TARGETS_MISSING", {
        node: node.name,
        geometry: renderable.geometry,
        morphWeights: renderable.morphWeights.length
      });
    }
    const modelMatrix = node.transform.worldMatrix;
    const bounds = renderableWorldBounds(geometry, modelMatrix, renderable.instanceTransforms, morphTargets, renderable.morphWeights, renderable.skinning);
    if (diagnostics) {
      diagnostics.submittedObjects += 1;
      if (cullingFrustum) diagnostics.frustumTestedObjects += 1;
    }
    // threejs-parity L7/SG-09: `node.frustumCulled === false` skips the test
    // (three.js `object.frustumCulled` semantics).
    const culled = cullingFrustum !== undefined && node.frustumCulled !== false && !cullingFrustum.intersectsBox(bounds.toMathBox());
    if (culled && diagnostics) diagnostics.culledObjects += 1;
    if (culled && !culledShadowCasters) continue;
    if (!culled && diagnostics) diagnostics.visibleObjects += 1;
    (culled ? culledShadowCasters! : items).push({
      geometry,
      material,
      temporalObjectKey: node,
      label: node.name,
      modelMatrix,
      // threejs-parity L7/SG-09: carry the node's parity fields onto the item
      // so sort/cull/onBeforeRender behave like three's Object3D.
      renderOrder: node.renderOrder,
      layerMask: node.layerMask,
      frustumCulled: node.frustumCulled,
      userData: node.userData,
      ...(node.onBeforeRender
        ? { onBeforeRender: () => node.onBeforeRender!(undefined, node) }
        : {}),
      normalMatrix: normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: multiplyMat4(cameraViewProjection ?? identityMat4(), modelMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    } as TemporalRenderItem);
  }
  return items;
}
/** Travel direction of the first shadow-casting directional light (02-S5). */
function shadowSunTravel(lights: readonly CollectedLight[]): readonly [number, number, number] | undefined {
  const sun = lights.find((light) => light.kind === "directional" && light.castsShadow);
  return sun ? [sun.direction[0], sun.direction[1], sun.direction[2]] : undefined;
}
export function createRenderCollectionDiagnostics(): RenderCollectionDiagnostics {
  return {
    submittedObjects: 0,
    visibleObjects: 0,
    culledObjects: 0,
    frustumTestedObjects: 0
  };
}
const CAPTURE_NON_BLANK_LUMINANCE_THRESHOLD = 1 / 255;
const CAPTURE_UNDEREXPOSED_LUMINANCE_THRESHOLD = 5 / 255;
const CAPTURE_OVEREXPOSED_LUMINANCE_THRESHOLD = 250 / 255;
const CAPTURE_CLIPPED_CHANNEL_THRESHOLD = 254;
function createRendererFrameCaptureMetadata(
  device: RenderDevice,
  width: number,
  height: number,
  pixels: Uint8Array,
  diagnostics: RenderDeviceDiagnostics
): RendererFrameCaptureMetadata {
  const pixelDigest = createRendererFramePixelDigest(pixels);
  return {
    capturedAt: new Date().toISOString(),
    renderSize: {
      width,
      height,
      pixelCount: width * height,
      byteLength: pixels.byteLength,
      aspectRatio: roundCaptureMetric(height > 0 ? width / height : 0)
    },
    pixelHash: pixelDigest.value,
    pixelDigest,
    pixelStats: createRendererFramePixelStats(pixels, width, height),
    diagnosticsSummary: createRendererFrameDiagnosticsSummary(device, diagnostics)
  };
}
function createRendererFramePixelDigest(pixels: Uint8Array): RendererFrameCapturePixelDigest {
  return {
    algorithm: "sha256",
    encoding: "hex",
    source: "rgba8",
    value: sha256Hex(pixels),
    byteLength: pixels.byteLength
  };
}
function createRendererFramePixelStats(pixels: Uint8Array, width: number, height: number): RendererFrameCapturePixelStats {
  const totalPixels = Math.max(0, width * height);
  const divisor = totalPixels > 0 ? totalPixels : 1;
  let opaquePixels = 0;
  let transparentPixels = 0;
  let nonBlankPixels = 0;
  let underexposedPixels = 0;
  let overexposedPixels = 0;
  let clippedChannelPixels = 0;
  let luminanceSum = 0;
  let alphaSum = 0;
  let redSum = 0;
  let greenSum = 0;
  let blueSum = 0;
  let minLuminance = totalPixels > 0 ? Number.POSITIVE_INFINITY : 0;
  let maxLuminance = 0;

  for (let pixel = 0; pixel < totalPixels; pixel += 1) {
    const offset = pixel * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const alpha = pixels[offset + 3] ?? 0;
    const luminance = ((0.2126 * red) + (0.7152 * green) + (0.0722 * blue)) / 255;

    redSum += red;
    greenSum += green;
    blueSum += blue;
    alphaSum += alpha;
    luminanceSum += luminance;
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);

    if (alpha === 255) opaquePixels += 1;
    if (alpha === 0) transparentPixels += 1;
    if (alpha > 0 && luminance > CAPTURE_NON_BLANK_LUMINANCE_THRESHOLD) nonBlankPixels += 1;
    if (alpha > 0 && luminance <= CAPTURE_UNDEREXPOSED_LUMINANCE_THRESHOLD) underexposedPixels += 1;
    if (alpha > 0 && luminance >= CAPTURE_OVEREXPOSED_LUMINANCE_THRESHOLD) overexposedPixels += 1;
    if (
      alpha > 0 &&
      (red >= CAPTURE_CLIPPED_CHANNEL_THRESHOLD ||
        green >= CAPTURE_CLIPPED_CHANNEL_THRESHOLD ||
        blue >= CAPTURE_CLIPPED_CHANNEL_THRESHOLD)
    ) {
      clippedChannelPixels += 1;
    }
  }

  return {
    totalPixels,
    opaquePixels,
    opaqueRatio: captureRatio(opaquePixels, totalPixels),
    transparentPixels,
    transparentRatio: captureRatio(transparentPixels, totalPixels),
    nonBlankPixels,
    nonBlankRatio: captureRatio(nonBlankPixels, totalPixels),
    underexposedPixels,
    underexposedRatio: captureRatio(underexposedPixels, totalPixels),
    overexposedPixels,
    overexposedRatio: captureRatio(overexposedPixels, totalPixels),
    clippedChannelPixels,
    clippedChannelRatio: captureRatio(clippedChannelPixels, totalPixels),
    averageLuminance: roundCaptureMetric(luminanceSum / divisor),
    minLuminance: roundCaptureMetric(minLuminance),
    maxLuminance: roundCaptureMetric(maxLuminance),
    averageAlpha: roundCaptureMetric((alphaSum / divisor) / 255),
    averageRgb: [
      roundCaptureMetric((redSum / divisor) / 255),
      roundCaptureMetric((greenSum / divisor) / 255),
      roundCaptureMetric((blueSum / divisor) / 255)
    ],
    thresholds: {
      nonBlankLuminance: roundCaptureMetric(CAPTURE_NON_BLANK_LUMINANCE_THRESHOLD),
      underexposedLuminance: roundCaptureMetric(CAPTURE_UNDEREXPOSED_LUMINANCE_THRESHOLD),
      overexposedLuminance: roundCaptureMetric(CAPTURE_OVEREXPOSED_LUMINANCE_THRESHOLD),
      clippedChannel: roundCaptureMetric(CAPTURE_CLIPPED_CHANNEL_THRESHOLD / 255)
    }
  };
}
function createRendererFrameDiagnosticsSummary(device: RenderDevice, diagnostics: RenderDeviceDiagnostics): RendererFrameCaptureDiagnosticsSummary {
  const resources = {
    buffers: diagnostics.buffers,
    shaders: diagnostics.shaders,
    ...(diagnostics.renderTargets !== undefined ? { renderTargets: diagnostics.renderTargets } : {}),
    ...(diagnostics.textures !== undefined ? { textures: diagnostics.textures } : {})
  };
  const memoryBytes = {
    ...(diagnostics.bufferBytes !== undefined ? { buffers: diagnostics.bufferBytes } : {}),
    ...(diagnostics.textureBytes !== undefined ? { textures: diagnostics.textureBytes } : {}),
    ...(diagnostics.approximateGpuMemoryBytes !== undefined ? { approximateGpu: diagnostics.approximateGpuMemoryBytes } : {})
  };
  const scene = {
    ...(diagnostics.submittedObjects !== undefined ? { submittedObjects: diagnostics.submittedObjects } : {}),
    ...(diagnostics.visibleObjects !== undefined ? { visibleObjects: diagnostics.visibleObjects } : {}),
    ...(diagnostics.culledObjects !== undefined ? { culledObjects: diagnostics.culledObjects } : {}),
    ...(diagnostics.frustumTestedObjects !== undefined ? { frustumTestedObjects: diagnostics.frustumTestedObjects } : {})
  };
  const postprocess = {
    ...(diagnostics.postprocessPasses !== undefined ? { passes: diagnostics.postprocessPasses } : {}),
    ...(diagnostics.postprocessPassNames !== undefined ? { passNames: diagnostics.postprocessPassNames } : {}),
    ...(diagnostics.postprocessTargetFormat !== undefined ? { targetFormat: diagnostics.postprocessTargetFormat } : {}),
    ...(diagnostics.postprocessRenderTargets !== undefined ? { renderTargets: diagnostics.postprocessRenderTargets } : {}),
    ...(diagnostics.postprocessTextures !== undefined ? { textures: diagnostics.postprocessTextures } : {}),
    ...(diagnostics.postprocessTargetWidth !== undefined ? { targetWidth: diagnostics.postprocessTargetWidth } : {}),
    ...(diagnostics.postprocessTargetHeight !== undefined ? { targetHeight: diagnostics.postprocessTargetHeight } : {})
  };

  return {
    backend: device.kind,
    renderer: device.info.renderer,
    vendor: device.info.vendor,
    capabilities: device.info.capabilities ?? [],
    limitations: device.info.limitations ?? [],
    drawCalls: diagnostics.drawCalls,
    resources,
    ...(Object.keys(memoryBytes).length > 0 ? { memoryBytes } : {}),
    ...(Object.keys(scene).length > 0 ? { scene } : {}),
    ...(Object.keys(postprocess).length > 0 ? { postprocess } : {}),
    contextLost: diagnostics.contextLost,
    lastError: diagnostics.lastError
  };
}
function captureRatio(count: number, total: number): number {
  return roundCaptureMetric(total > 0 ? count / total : 0);
}
function roundCaptureMetric(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000000) / 1000000;
}
const SHA256_INITIAL_HASH = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
] as const;
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
] as const;
function sha256Hex(bytes: Uint8Array): string {
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const bitLengthHigh = Math.floor(bytes.length / 0x20000000);
  const bitLengthLow = (bytes.length % 0x20000000) * 8;
  const hash: number[] = [...SHA256_INITIAL_HASH];
  const words = new Uint32Array(64);

  for (let block = 0; block < paddedLength; block += 64) {
    for (let index = 0; index < 16; index += 1) {
      const offset = block + index * 4;
      words[index] = (
        (sha256PaddedByte(bytes, offset, paddedLength, bitLengthHigh, bitLengthLow) << 24) |
        (sha256PaddedByte(bytes, offset + 1, paddedLength, bitLengthHigh, bitLengthLow) << 16) |
        (sha256PaddedByte(bytes, offset + 2, paddedLength, bitLengthHigh, bitLengthLow) << 8) |
        sha256PaddedByte(bytes, offset + 3, paddedLength, bitLengthHigh, bitLengthLow)
      ) >>> 0;
    }

    for (let index = 16; index < 64; index += 1) {
      const first = words[index - 15]!;
      const second = words[index - 2]!;
      const sigma0 = rightRotate32(first, 7) ^ rightRotate32(first, 18) ^ (first >>> 3);
      const sigma1 = rightRotate32(second, 17) ^ rightRotate32(second, 19) ^ (second >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let a = hash[0]!;
    let b = hash[1]!;
    let c = hash[2]!;
    let d = hash[3]!;
    let e = hash[4]!;
    let f = hash[5]!;
    let g = hash[6]!;
    let h = hash[7]!;

    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rightRotate32(e, 6) ^ rightRotate32(e, 11) ^ rightRotate32(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choice + SHA256_ROUND_CONSTANTS[index]! + words[index]!) >>> 0;
      const sigma0 = rightRotate32(a, 2) ^ rightRotate32(a, 13) ^ rightRotate32(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0]! + a) >>> 0;
    hash[1] = (hash[1]! + b) >>> 0;
    hash[2] = (hash[2]! + c) >>> 0;
    hash[3] = (hash[3]! + d) >>> 0;
    hash[4] = (hash[4]! + e) >>> 0;
    hash[5] = (hash[5]! + f) >>> 0;
    hash[6] = (hash[6]! + g) >>> 0;
    hash[7] = (hash[7]! + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}
function sha256PaddedByte(bytes: Uint8Array, index: number, paddedLength: number, bitLengthHigh: number, bitLengthLow: number): number {
  if (index < bytes.length) return bytes[index]!;
  if (index === bytes.length) return 0x80;
  const lengthOffset = index - (paddedLength - 8);
  if (lengthOffset < 0) return 0;
  if (lengthOffset < 4) return (bitLengthHigh >>> ((3 - lengthOffset) * 8)) & 0xff;
  return (bitLengthLow >>> ((7 - lengthOffset) * 8)) & 0xff;
}
function rightRotate32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}
function withRendererFrameDiagnostics(
  diagnostics: RenderDeviceDiagnostics,
  collection: RenderCollectionDiagnostics,
  postprocess?: RendererPostprocessDiagnostics
): RenderDeviceDiagnostics {
  return {
    ...diagnostics,
    submittedObjects: collection.submittedObjects,
    visibleObjects: collection.visibleObjects,
    culledObjects: collection.culledObjects,
    frustumTestedObjects: collection.frustumTestedObjects,
    ...(postprocess ?? {})
  };
}
/** Only a plain, compiler-owned disabled shadow record changes the prior guard. */
function compilerFrameShadowDisabled(source: RenderSource | Iterable<RenderItem> | Scene, shadow: RendererShadowOptions): boolean {
  try {
    if (typeof source !== "object" || source === null || !staticBatchFrameItems.has(source as RenderSource)
      || Object.getPrototypeOf(shadow) !== Object.prototype) return false;
    const enabled = Object.getOwnPropertyDescriptor(shadow, "enabled");
    return !!enabled && "value" in enabled && enabled.value === false;
  } catch { return false; }
}

/** Explicit arrays and compiler-owned materialized frame collectors may opt in. */
function staticUnlitPairSourceItems(source: RenderSource | Iterable<RenderItem> | Scene): readonly RenderItem[] | undefined {
  try {
    if (typeof source !== "object" || source === null || Object.getPrototypeOf(source) !== Object.prototype) return undefined;
    const frame = staticBatchFrameItems.get(source as RenderSource);
    const descriptors = Object.getOwnPropertyDescriptors(source);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = Reflect.get(descriptors, key) as PropertyDescriptor;
      if (typeof key !== "string" || !("value" in descriptor)) return undefined;
      if (typeof descriptor.value === "function" && !(key === "collectRenderItems" && frame?.collect === descriptor.value)) return undefined;
    }
    const collector = descriptors.collectRenderItems?.value;
    const items: unknown = frame && collector === frame.collect && descriptors.renderItems?.value == null
      ? frame.items : descriptors.renderItems?.value;
    if (descriptors.staticBatching?.value !== true || descriptors.scene?.value != null
      || (collector != null && (!frame || collector !== frame.collect || descriptors.renderItems?.value != null)) || descriptors.staticMeshConsolidation?.value
      || !Array.isArray(items) || Object.getPrototypeOf(items) !== Array.prototype
      || Object.getOwnPropertyDescriptor(items, Symbol.iterator)) return undefined;
    return items as readonly RenderItem[];
  } catch { return undefined; }
}

function applyViewProjection(items: readonly RenderItem[], cameraViewProjection?: Mat4): readonly RenderItem[] {
  const hasCameraViewProjection = cameraViewProjection !== undefined;
  const viewProjection = cameraViewProjection ?? identityMat4();
  const project = (item: RenderItem): RenderItem => {
    const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
    const explicitModelViewProjection = item.modelViewProjectionMatrix
      ? toMat4(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label)
      : undefined;
    const fields = {
      ...item,
      temporalObjectKey: (item as TemporalRenderItem).temporalObjectKey ?? item,
      modelMatrix,
      normalMatrix: item.normalMatrix ? toMat4(item.normalMatrix, "normalMatrix", item.label) : normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: hasCameraViewProjection || !explicitModelViewProjection
        ? multiplyMat4(viewProjection, modelMatrix)
        : explicitModelViewProjection
    };
    const projected = isEnginePackedBatchItem(item) ? createEnginePackedBatchItem(fields)
      : isEngineBatchInstanceItem(item) ? createEngineBatchInstanceItem(fields) : fields;
    // A packed carrier's fallback member is projected first. Preserve the
    // same projected identity in both provenance maps rather than pairing a
    // projected carrier with its original, unprojected logical item.
    const packet = packedLoopMemberFor(item);
    let projectedLogical: RenderItem | undefined;
    transferBatchMembers(item, projected, member => {
      const result = project(member);
      if (packet?.logicalItem === member) projectedLogical = result;
      return result;
    });
    transferPackedLoopMember(item, projected, projectedLogical);
    return projected;
  };
  return items.map(project);
}
function createAutoFrameCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  items: readonly RenderItem[],
  width: number,
  height: number
): { readonly viewProjectionMatrix: Mat4; readonly viewMatrix: Mat4; readonly projectionMatrix: Mat4; readonly cameraPosition: readonly [number, number, number]; readonly projectionMetadata: FrameProjectionMetadata } | undefined {
  const bounds = collectCameraFrameBounds(source) ?? collectRenderItemBounds(items);
  if (!bounds || bounds.isEmpty()) {
    return undefined;
  }
  const frameOptions = {
    ...DEFAULT_RENDERER_AUTO_FRAME_OPTIONS,
    ...collectCameraFrameOptions(source)
  };
  const frame = collectCameraProjection(source) === "orthographic"
    ? computeOrthographicCameraFrame(bounds, { width, height }, frameOptions)
    : computePerspectiveCameraFrame(bounds, { width, height }, frameOptions);
  return {
    viewProjectionMatrix: frame.viewProjectionMatrix,
    viewMatrix: frame.viewMatrix,
    projectionMatrix: frame.projectionMatrix,
    cameraPosition: frame.cameraPosition,
    projectionMetadata: { kind: collectCameraProjection(source), near: frame.near, far: frame.far, mode: "standard", clipRange: "minus-one-to-one" }
  };
}
function collectRenderItemBounds(items: readonly RenderItem[]): SceneBounds3 | undefined {
  return collectItemBounds(items, true);
}
function collectCameraFrameOptions(source: RenderSource | Iterable<RenderItem> | Scene): RendererCameraFrameOptions {
  if (source instanceof Scene || isIterable(source) || !source.cameraFrameOptions) return {};
  return source.cameraFrameOptions;
}
function collectCameraProjection(source: RenderSource | Iterable<RenderItem> | Scene): RendererCameraProjection {
  if (source instanceof Scene || isIterable(source)) return "perspective";
  return source.cameraProjection ?? "perspective";
}
function collectCameraFrameBounds(source: RenderSource | Iterable<RenderItem> | Scene): SceneBounds3 | undefined {
  if (source instanceof Scene || isIterable(source) || !source.cameraFrameBounds) return undefined;
  const bounds = source.cameraFrameBounds;
  const min = bounds.min;
  const max = bounds.max;
  const values = [...min, ...max];
  if (values.length !== 6 || values.some((value) => !Number.isFinite(value))) {
    throw new RenderDeviceError("RenderSource cameraFrameBounds must contain finite min/max vectors.", "CAMERA_FRAME_BOUNDS_INVALID", {
      min: [...min],
      max: [...max]
    });
  }
  if (max[0] < min[0] || max[1] < min[1] || max[2] < min[2]) {
    throw new RenderDeviceError("RenderSource cameraFrameBounds max must be greater than or equal to min.", "CAMERA_FRAME_BOUNDS_INVALID", {
      min: [...min],
      max: [...max]
    });
  }
  return new SceneBounds3([min[0], min[1], min[2]], [max[0], max[1], max[2]]);
}
type PreparedViewCamera = {
  readonly resolved: ReturnType<typeof resolveCamera>;
  readonly cullingFrustum?: Frustum;
};

/**
 * Authored array/stereo views carry matrices rather than a scene Camera.
 * Derive a frustum only for view-based scene culling; non-view matrix cameras
 * and explicit-item sources retain their existing fallback/opt-in behavior.
 */
function matrixViewSceneFrustum(
  source: RenderSource | Iterable<RenderItem> | Scene,
  resolved: ReturnType<typeof resolveCamera>
): Frustum | undefined {
  if (!resolved || resolved.camera || !sceneFromSource(source)) return undefined;
  if (!(source instanceof Scene) && !isIterable(source) && source.frustumCulling === false) return undefined;
  const metadata = resolved.projectionMetadata;
  const convention = resolved.depthConvention;
  try {
    const frustum = Frustum.setFromProjectionMatrix(
      toMathMat4(resolved.viewProjectionMatrix),
      (metadata?.clipRange ?? convention?.clipRange ?? "minus-one-to-one") === "zero-to-one" ? "webgpu" : "webgl",
      (metadata?.mode ?? convention?.mode ?? "standard") === "reversed",
      metadata?.far === Infinity
    );
    // A custom finite matrix can still overflow or collapse a clip plane.
    // Keep the previous unculled scene fallback rather than discard geometry.
    return frustum.activePlanes.every(({ normal, constant }) =>
      Number.isFinite(normal.x) && Number.isFinite(normal.y) && Number.isFinite(normal.z) &&
      (normal.x !== 0 || normal.y !== 0 || normal.z !== 0) && Number.isFinite(constant))
      ? frustum : undefined;
  } catch (error) {
    // Frustum extraction rejects zero-normal planes. Other failures still propagate.
    if (error instanceof RangeError) return undefined;
    throw error;
  }
}

/**
 * A scene camera can be shared by views and updated for the next viewport
 * before the previous one draws. Preserve its concrete camera shape for the
 * shadow paths, but detach the matrices, frustum and world transform they use.
 */
function snapshotResolvedViewCamera(resolved: ReturnType<typeof resolveCamera>): ReturnType<typeof resolveCamera> {
  const camera = resolved?.camera;
  if (!resolved || !camera) return resolved;
  const value = (entry: unknown): PropertyDescriptor => ({ value: entry, writable: true, configurable: true, enumerable: true });
  const descriptors: PropertyDescriptorMap = Object.getOwnPropertyDescriptors(camera);
  const transform = new TransformNode();
  transform.setLocalMatrix(toMat4(camera.transform.worldMatrix, "cameraWorldMatrix"), { decompose: false, matrixAutoUpdate: false });
  transform.updateWorld(undefined, true);
  descriptors.transform = value(transform);
  descriptors.frustum = value(camera.frustum.clone());
  descriptors.viewProjectionMatrix = value(resolved.viewProjectionMatrix);
  if (resolved.viewMatrix) descriptors.viewMatrix = value(resolved.viewMatrix);
  if (resolved.projectionMatrix) descriptors.projectionMatrix = value(resolved.projectionMatrix);
  if (resolved.projectionMatrixInverse) descriptors.projectionMatrixInverse = value(resolved.projectionMatrixInverse);
  if (resolved.projectionMetadata) descriptors.projectionMetadata = value(resolved.projectionMetadata);
  if (resolved.layerMask !== undefined) descriptors.layerMask = value(resolved.layerMask);
  if (camera instanceof PerspectiveCamera) {
    descriptors.near = value(camera.near);
    descriptors.far = value(camera.far);
    descriptors.aspect = value(camera.aspect);
    descriptors.fovYRadians = value(camera.fovYRadians);
  }
  return { ...resolved, camera: Object.create(Object.getPrototypeOf(camera), descriptors) as Camera };
}

function resolveCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike,
  viewport?: { readonly width: number; readonly height: number },
  options: { readonly allowSceneCamera?: boolean } = {}
): { readonly viewProjectionMatrix: Mat4; readonly viewMatrix?: Mat4; readonly projectionMatrix?: Mat4; readonly projectionMatrixInverse?: Mat4; readonly projectionMetadata?: FrameProjectionMetadata; readonly depthConvention?: DepthConvention; readonly shaderViewMatrix?: Mat4; readonly shaderProjectionMatrix?: Mat4; readonly camera?: Camera; readonly cameraPosition?: readonly [number, number, number]; readonly layerMask?: number } | undefined {
  const resolved = camera ?? (options.allowSceneCamera === false ? undefined : resolveSceneCamera(source));
  if (!resolved) {
    return undefined;
  }
  const resize = maybeCameraResize(resolved);
  if (viewport && resize) {
    resize(viewport.width, viewport.height);
  }
  resolved.updateCameraMatrices?.();
  // Matrix updates may replace or mutate every camera field. Capture the
  // convention, inverse and layer together with the matrices they describe.
  const resolvedLayerMask = typeof resolved.layerMask === "number" ? { layerMask: resolved.layerMask } : {};
  const cameraMetadata = resolved as CameraLike;
  const projectionMetadata = cameraMetadata.projectionMetadata;
  const projectionMatrixInverse = cameraMetadata.projectionMatrixInverse;
  const depthConvention = cameraMetadata.depthConvention;
  const metadata = {
    ...(projectionMetadata ? { projectionMetadata: { ...projectionMetadata } } : {}),
    ...(projectionMatrixInverse ? { projectionMatrixInverse: toMat4(projectionMatrixInverse, "projectionMatrixInverse") } : {}),
    ...(depthConvention ? { depthConvention: { ...depthConvention } } : {})
  };
  if (resolved.viewProjectionMatrix) {
    const viewMatrix = resolved.viewMatrix ? toMat4(resolved.viewMatrix, "viewMatrix") : undefined;
    const { shaderViewMatrix: shaderView, shaderProjectionMatrix: shaderProjection } = resolved as CameraLike;
    return {
      viewProjectionMatrix: toMat4(resolved.viewProjectionMatrix, "viewProjectionMatrix"),
      ...resolvedLayerMask,
      ...metadata,
      ...(viewMatrix ? { viewMatrix } : {}),
      ...(shaderView ? { shaderViewMatrix: toMat4(shaderView, "shaderViewMatrix") } : {}),
      ...(shaderProjection ? { shaderProjectionMatrix: toMat4(shaderProjection, "shaderProjectionMatrix") } : {}),
      // threejs-parity SH-02: custom-shader `u_projectionMatrix` source.
      ...(resolved.projectionMatrix ? { projectionMatrix: toMat4(resolved.projectionMatrix, "projectionMatrix") } : {}),
      ...(resolved instanceof Camera
        ? { camera: resolved, cameraPosition: cameraWorldPosition(resolved) }
        : viewMatrix
          ? { cameraPosition: cameraPositionFromViewMatrix(viewMatrix) }
          : {})
    };
  }
  if (resolved.projectionMatrix && resolved.viewMatrix) {
    const viewMatrix = toMat4(resolved.viewMatrix, "viewMatrix");
    const projectionMatrix = toMat4(resolved.projectionMatrix, "projectionMatrix");
    return {
      viewProjectionMatrix: multiplyMat4(projectionMatrix, viewMatrix),
      ...resolvedLayerMask,
      ...metadata,
      viewMatrix,
      projectionMatrix,
      ...(resolved instanceof Camera
        ? { camera: resolved, cameraPosition: cameraWorldPosition(resolved) }
        : { cameraPosition: cameraPositionFromViewMatrix(viewMatrix) })
    };
  }
  throw new RenderDeviceError(
    "Renderer camera must expose a viewProjectionMatrix or projectionMatrix plus viewMatrix",
    "CAMERA_VIEW_PROJECTION_MISSING"
  );
}
function hasExplicitAutoFrameCameraPolicy(source: RenderSource | Iterable<RenderItem> | Scene): boolean {
  return !(source instanceof Scene) && !isIterable(source) && source.cameraPolicy === "auto-frame";
}
export function cameraWorldPosition(camera: Camera): readonly [number, number, number] {
  const matrix = camera.transform.worldMatrix;
  return [matrix[12] ?? 0, matrix[13] ?? 0, matrix[14] ?? 0];
}
function cameraPositionFromViewMatrix(viewMatrix: Mat4): readonly [number, number, number] {
  const inverseView = invertMat4(viewMatrix);
  return [inverseView[12] ?? 0, inverseView[13] ?? 0, inverseView[14] ?? 0];
}
function maybeCameraResize(camera: Camera | CameraLike): ((width: number, height: number) => void) | undefined {
  const candidate = (camera as { readonly resize?: unknown }).resize;
  return typeof candidate === "function" ? candidate.bind(camera) as (width: number, height: number) => void : undefined;
}
function resolveSceneCamera(source: RenderSource | Iterable<RenderItem> | Scene): Camera | undefined {
  return sceneFromSource(source)?.collectCameras()[0];
}
function normalMatrixFromModel(modelMatrix: Mat4): Mat4 {
  let matrix: Mat4;
  try {
    matrix = transposeMat4(invertMat4(modelMatrix));
  } catch {
    matrix = identityMat4();
  }
  const handedness = hasNegativeHandedness(modelMatrix) ? -1 : 1;
  return [
    matrix[0] * handedness, matrix[1] * handedness, matrix[2] * handedness, 0,
    matrix[4] * handedness, matrix[5] * handedness, matrix[6] * handedness, 0,
    matrix[8] * handedness, matrix[9] * handedness, matrix[10] * handedness, 0,
    0, 0, 0, 1
  ];
}
function hasNegativeHandedness(matrix: Mat4): boolean {
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  return Number.isFinite(determinant) && determinant < -1e-8;
}
function transposeMat4(matrix: Mat4): Mat4 {
  return [
    matrix[0], matrix[4], matrix[8], matrix[12],
    matrix[1], matrix[5], matrix[9], matrix[13],
    matrix[2], matrix[6], matrix[10], matrix[14],
    matrix[3], matrix[7], matrix[11], matrix[15]
  ];
}
function lookupRenderResource<T>(lookup: RenderResourceLookup<T>, key: string): T | undefined {
  if (isReadonlyMap(lookup)) {
    return lookup.get(key);
  }
  return lookup[key];
}
function isReadonlyMap<T>(lookup: RenderResourceLookup<T>): lookup is ReadonlyMap<string, T> {
  return typeof (lookup as ReadonlyMap<string, T>).get === "function";
}
/** Check a normal array without consuming a potentially one-shot iterable. */
function isOrdinaryLightArray(value: unknown): value is readonly CollectedLight[] {
  try {
    return Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype &&
      !Object.prototype.hasOwnProperty.call(value, Symbol.iterator) &&
      Array.prototype[Symbol.iterator] === Array.prototype.values;
  } catch {
    return false;
  }
}
function collectRenderLights(source: RenderSource | Iterable<RenderItem> | Scene): readonly CollectedLight[] {
  if (source instanceof Scene) {
    return new LightCollector().collect(source);
  }
  if (isIterable(source)) {
    return [];
  }
  if (source.collectedLights !== undefined) {
    return [...source.collectedLights];
  }
  if (source.scene) {
    const collected = new LightCollector().collect(source.scene);
    if (collected.length > 0 || source.environmentLighting === false) {
      return collected;
    }
    return createDefaultRendererDirectLights();
  }
  if (source.environmentLighting !== false && (source.renderItems || source.collectRenderItems)) {
    return createDefaultRendererDirectLights();
  }
  return [];
}
function createDefaultRendererDirectLights(): readonly CollectedLight[] {
  const key = new DirectionalLight("default-renderer-key-light");
  const fill = new DirectionalLight("default-renderer-fill-light");
  const lights = [
    { source: key, ...DEFAULT_RENDERER_DIRECT_LIGHTING.key },
    { source: fill, ...DEFAULT_RENDERER_DIRECT_LIGHTING.fill }
  ] as const;
  return lights.map((light) => {
    light.source.color = [...light.color] as [number, number, number];
    light.source.intensity = light.intensity;
    return {
      kind: "directional" as const,
      color: [...light.color] as [number, number, number],
      intensity: light.intensity,
      position: [0, 0, 0] as [number, number, number],
      direction: normalizeDefaultLightDirection(light.direction),
      right: [1, 0, 0] as [number, number, number],
      up: [0, 1, 0] as [number, number, number],
      range: 0,
      width: 0,
      height: 0,
      spotAngle: 0,
      penumbra: 0,
      castsShadow: false,
      layerMask: 0xffffffff,
      source: light.source
    };
  });
}
function normalizeDefaultLightDirection(direction: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (length <= 0 || !Number.isFinite(length)) {
    return [0, 0, -1];
  }
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}
