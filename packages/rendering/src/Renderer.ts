import type { TemporalHistory } from "./TemporalHistory";
import { collectEnvironmentBackground, collectEnvironmentFog, collectEnvironmentLighting } from "./renderer/Background";
import { applyRendererOwnedStaticBatching, applyRendererOwnedStaticMeshConsolidation, cullExplicitRenderItems, explicitCullingFrustum } from "./renderer/CullingBatching";
import { rendererDeviceIsLost, subscribeRendererDeviceLost, subscribeRendererDeviceRestored } from "./renderer/DeviceLifecycle";
import { createRendererFrameHooks, toFrameCamera } from "./renderer/FrameGraph";
import type { FrameCamera } from "./contracts/frameGraph";
import { RendererPostprocessPipeline, collectPostprocess, createPostprocessDiagnostics, defaultPostprocessTargetFormat, postprocessRequiresDepthTexture } from "./renderer/PostprocessExecution";
import type { RendererHost } from "./renderer/RendererHost";
import { createRenderer } from "./renderer/RendererFactory";
import { collectItemBounds, isIterable, renderableWorldBounds, sceneFromSource, toMat4 } from "./renderer/RenderShared";
import { RendererShadowOrchestrator, collectForwardShadowMap, collectRendererShadowOptions } from "./renderer/ShadowOrchestration";
import { type RenderSource } from "./contracts/renderSource";
import { Bounds3 as SceneBounds3, Camera, DirectionalLight, Light, PerspectiveCamera, PointLight, Scene, SpotLight, identityMat4, invertMat4, multiplyMat4, orthographicMat4, perspectiveMat4, transformPoint, toMathMat4, type Mat4, type Vec3, type SceneNode } from "@aura3d/scene";
import { Frustum, type Ray } from "@aura3d/math";
import { createRenderDevice, type RenderBackendOptions } from "./RenderBackend";
import { type LdrPostprocessPassDescriptor, type RenderDevice, RenderDeviceError, type RenderDeviceDiagnostics, type RenderTarget, type RenderTargetDescriptor } from "./RenderDevice";
import { ENVIRONMENT_BACKGROUND_COLOR_RESOURCE, EnvironmentBackgroundPass, type EnvironmentBackgroundOptions } from "./EnvironmentBackgroundPass";
import { ForwardPass, type EnvironmentLightingOptions, type ForwardEnvironmentFogOptions, type ForwardShadowMapOptions, type RenderItem, type RenderMaterial, type SkinningPaletteBinding } from "./ForwardPass";
import { CascadedShadowMaps, CascadedShadowPass, shadowCameraFitViewProjectionMatrix } from "./CascadedShadowMaps";
import { type CollectedLight, LightCollector } from "./LightCollector";
import { Geometry, type Bounds3 } from "./Geometry";
import { type MorphTargetDelta } from "./MorphTarget";
import { computeSkinnedGeometryBounds, computeSkinnedMorphTargetWeightedBounds } from "./SkinningBounds";
import { RenderGraph } from "./RenderGraph";
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
import { MaterialInstance } from "./MaterialInstance";
import { materialUsesGeneratedProgram } from "./program/MaterialFeatures";
import { collectWarmupFeatures, ProgramWarmup, type WarmupInput } from "./program/ProgramWarmup";
import { PRD03_EXPOSURE, rendererQrFlags } from "./renderer/FrameGraph";
import { qrCoreGeneratorOn, qrCoreOutputOn, rendererOutputPass, rendererProgramCache } from "./renderer/qrSubFlags";
import { forwardPassFeatureAxes, splitForwardItems, type ForwardPassOptions } from "./ForwardPass";
import { InterleavedTransparentPass } from "./renderer/InterleavedTransparentPass";
import { ensureSceneDepthCopyTarget, SceneDepthCopyPass } from "./renderer/SceneDepthCopyPass";
import { probeHdrTargetFormat, DEFAULT_TONE_MAPPING, type AuraToneMappingOperatorLike, type OutputOverlayUniforms } from "./contracts/output";
import { resolveForwardClusteredLighting } from "./forward/Lighting";
import { assertRendererFeatures, createRendererFeatureReport, type RendererFeature, type RendererFeatureReport } from "./RendererFeatureGates";
import { batchStaticRenderItems, type StaticBatchOptions, type StaticBatchInput } from "./SceneOptimization";
import { createStaticMeshConsolidationCache, type MeshConsolidationInput, type MeshConsolidationOptions } from "./MeshConsolidation";

/**
 * C-05 (PRD-01 §8.4-§8.6): output configuration applied by the OutputPass
 * under `A3D_QR_CORE_OUTPUT`. Flag-off: recorded but never applied (legacy
 * present path is untouched).
 */
export interface RendererOutputOptions {
  readonly toneMapping?: AuraToneMappingOperatorLike;
  /** Exposure multiplier (default 1); combined with blackboard `"prd03.exposure"` upstream. */
  readonly exposure?: number;
  /** Triangular-dither the 8-bit write (default true). */
  readonly dithering?: boolean;
  /** R8 coverage attachment + unmapped-background mix (§6.5; default false). */
  readonly backgroundCoverage?: boolean;
  /** C-05 juice overlay; absent = disabled, zero-amounts = bit-identical. */
  readonly overlay?: OutputOverlayUniforms;
}

/** What the most recent OutputPass invocation actually applied (diagnostics). */
export interface RendererAppliedOutput {
  readonly toneMapping: AuraToneMappingOperatorLike;
  readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto" };
  readonly dithering: boolean;
  readonly targetFormat: "rgba16f" | "rgba8";
  readonly degraded?: "rgba8-no-float-target" | "hdr-msaa-mrt-unsupported";
}

export interface RendererOptions extends RenderBackendOptions {
  readonly width?: number;
  readonly height?: number;
  readonly clearColor?: readonly [number, number, number, number];
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

export interface RendererInput {
  readonly source: RenderSource | Iterable<RenderItem> | Scene;
  readonly camera?: CameraLike;
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
export class Renderer {
  public readonly device: RenderDevice;
  private readonly graph = new RenderGraph();
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
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  private width: number;
  private height: number;
  private clearColor: readonly [number, number, number, number];
  private disposed = false;
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
  private sceneDepthCopyTarget: RenderTarget | null = null;
  private lastAppliedOutput: RendererAppliedOutput | null = null;
  private warnedV2Postprocess = false;
  private resolutionGovernor?: ResolutionGovernor;
  private renderScaleCeiling = 1;
  private readonly unsubscribeDprWatch?: () => void;
  /** C-28 FrameStats feeding the governor (intervalMs until lane 11's gpuMs lands). */
  private readonly frameStatsMonitor?: FrameStatsLike;
  constructor(device: RenderDevice, options: RendererOptions & { readonly shaderLibrary: ShaderLibrary }, temporalHistory: TemporalHistory) {
    this.device = device;
    this.temporalHistory = temporalHistory;
    this.unsubscribeTemporalDeviceLoss = (device as RenderDevice & {onDeviceLost?: (listener: () => void) => () => void}).onDeviceLost?.(() => this.temporalHistory.dispose());
    this.canvas = options.canvas;
    this.width = options.width ?? inferInitialCanvasDimension(options.canvas, "width");
    this.height = options.height ?? inferInitialCanvasDimension(options.canvas, "height");
    this.clearColor = options.clearColor ?? [0, 0, 0, 1];
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
  }
  static create(options: RendererOptions = {}): Promise<Renderer> {
    return createRenderer(options);
  }

  /** C-28 monitor (PRD-01 Phase 6): lane capture reads cpuSubmitMs percentiles. */
  get frameStats(): FrameStatsLike | undefined {
    return this.frameStatsMonitor;
  }

  /** C-05: current output configuration (`app.setOutput` / `renderer.output` seam). */
  get output(): RendererOutputOptions {
    return this.outputOptions;
  }

  /** C-05: merge output options; takes effect on the next frame under `A3D_QR_CORE_OUTPUT`. */
  setOutput(options: Partial<RendererOutputOptions>): void {
    this.outputOptions = { ...this.outputOptions, ...options };
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
    if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
      throw new RenderDeviceError("Renderer dimensions must be positive integers", "INVALID_FRAME_SIZE", { width, height });
    }
    if (this.width !== width || this.height !== height) this.temporalHistory.dispose();
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
      tier: this.qualityTier ?? { maxPixelRatio: Number.POSITIVE_INFINITY },
      explicit: options.devicePixelRatio,
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
  /** PRD-03 Phase 4: camera position at the last temporal frame — the >5 m
   * auto-cut detector. */
  private lastTemporalCameraPosition?: [number, number, number];
  private readonly unsubscribeTemporalDeviceLoss?: () => void;

  resetTemporalHistory(_reason = "explicit-reset"): void { this.temporalHistory.reset(); this.lastTemporalCameraPosition = undefined; }
  render(input: RendererInput): RenderDeviceDiagnostics;
  render(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics;
  render(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): RenderDeviceDiagnostics {
    this.assertAlive();
    // §6.9: FrameStats samples every render while a governor exists (resolution opt-in).
    this.frameStatsMonitor?.begin(typeof performance !== "undefined" ? performance.now() : Date.now());
    // T0-06: reset the per-frame sync-compile bound for this render.
    {
      const flags = rendererQrFlags();
      if (qrCoreGeneratorOn(flags)) rendererProgramCache(this.device, flags).beginFrame?.();
    }
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    const resolvedCamera = resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    const lights = collectRenderLights(source);
    const environmentBackground = collectEnvironmentBackground(source);
    const environmentLighting = collectEnvironmentLighting(source);
    const environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    // C-02/T0-06: sync-path warm — kick generated-program compiles for the
    // exact draw feature records before the pass runs (bounded per frame).
    this.warmGeneratedProgramsSync(items, lights, environmentLighting, environmentFog, explicitShadowMap, cameraViewProjection);
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget, this.width, this.height);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    const frameHooks = createRendererFrameHooks({
      device: this.device,
      width: this.width,
      height: this.height,
      source,
      camera: toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition)
    });
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    let postprocess = collectPostprocess(source);
    if (!postprocess?.temporal || (!postprocess.motionBlur && !postprocess.taa)) { this.temporalHistory.reset(); this.lastTemporalCameraPosition = undefined; }
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    this.graph.clear();
    // C-05 (§8.4): under A3D_QR_CORE_OUTPUT encode happens once, in OutputPass.
    // The legacy post chain's own encode/present is lane 03's to migrate into
    // post-hdr contributors (Q-03-2/Q-03-3); until then a configured chain is
    // reported once and skipped rather than double-encoded.
    const qrOutput = qrCoreOutputOn(rendererQrFlags(this.device));
    if (qrOutput && postprocess !== undefined) {
      if (!this.warnedV2Postprocess) {
        this.warnedV2Postprocess = true;
        if (typeof console !== "undefined") console.warn("POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain skipped under A3D_QR_CORE_OUTPUT; encode handled by OutputPass");
      }
      postprocess = undefined;
    }
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false) {
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
      const requiresDepthTexture = postprocessRequiresDepthTexture(postprocess);
      if (requiresDepthTexture && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      // Temporal AA owns subpixel coverage. Pre-resolving MSAA before tone
      // mapping gives it nonlinear mixed-coverage colors while velocity remains
      // single-sample, biasing moving silhouettes and filtering them twice.
      const sampleCount = postprocess.sampleCount ?? (postprocess.taa && postprocess.temporal ? 1 : this.device.kind === "webgpu" && requiresDepthTexture ? 1 : 4);
      // Reused across frames. It still occupies `ownedTargets[0]`, because the postprocess chain and
      // the diagnostics builder both read the forward target from that slot; the end-of-frame
      // disposal loop skips it via `isReusedTarget` so the reuse is safe.
      const forwardTarget = this.ensureForwardColorTarget(format, requiresDepthTexture, sampleCount);
      ownedTargets.push(forwardTarget);
      this.device.setRenderTarget(forwardTarget);
      frameHooks.setForwardTarget(forwardTarget);
    } else if (qrOutput) {
      // C-05: the v2 scene always renders into the HDR target — also on the
      // no-effects route (§8.4: encode once, in OutputPass). The governor's
      // renderScale applies to this target only; OutputPass upsamples.
      const probed = probeHdrTargetFormat(this.device);
      const format = probed === "rgba8" ? "rgba8" : "rgba16f";
      const hdrTarget = this.ensureHdrSceneTarget(format, this.outputOptions.backgroundCoverage === true);
      ownedTargets.push(hdrTarget);
      this.device.setRenderTarget(hdrTarget);
      frameHooks.setForwardTarget(hdrTarget);
    }
    this.device.beginFrame(this.width, this.height);
    try {
      this.lastShadowEvidence = null;
      items = frameHooks.collect(items);
      const rendererShadowMap = explicitShadowMap ?? this.executeRendererShadowMap({
        shadowOptions,
        source,
        items: items.filter((item) => item.castShadow !== false),
        lights,
        ownedTargets,
        ownedShadowPasses,
        camera: resolvedCamera?.camera
      });
      frameHooks.addPasses(this.graph, "shadows", items);
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
      this.device.clear(this.clearColor);
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
      let temporalAutoReset = false;
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa) && cameraPosition && rendererQrFlags(this.device).on("A3D_QR_POST")) {
        const prev = this.lastTemporalCameraPosition;
        if (prev) {
          const dx = (cameraPosition as readonly number[])[0]! - prev[0];
          const dy = (cameraPosition as readonly number[])[1]! - prev[1];
          const dz = (cameraPosition as readonly number[])[2]! - prev[2];
          temporalAutoReset = dx * dx + dy * dy + dz * dz > 25;
        }
        this.lastTemporalCameraPosition = [(cameraPosition as readonly number[])[0]!, (cameraPosition as readonly number[])[1]!, (cameraPosition as readonly number[])[2]!];
      }
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)) {
        if (postprocess.execution === "cpu-deterministic" || !this.device.presentLdrPostprocess) throw new RenderDeviceError("Renderer temporal effects require native GPU presentation", "TEMPORAL_NATIVE_REQUIRED");
        const temporal = this.temporalHistory.prepare(this.device, this.width, this.height, items, cameraViewProjection, { ...postprocess.temporal, jitter: Boolean(postprocess.taa), ...(temporalAutoReset ? { reset: true } : {}) });
        temporalPrevVp = temporal.v2?.previous;
        items = this.temporalHistory.renderItems;
        postprocess = { ...postprocess, ...(postprocess.motionBlur ? {motionBlur: { ...postprocess.motionBlur, temporal }} : {}), ...(postprocess.taa ? {taa: { ...postprocess.taa, temporal }} : {}) };
        this.device.setRenderTarget(ownedTargets[0]!);
      }
      if (qrOutput) {
        // §9.1 v2 frame order: opaque → after-opaque (scene-depth copy,
        // contributors) → transmission → transmissive → transparent (engine
        // items + contributor TransparentQueueItems interleaved by sortDepth)
        // → after-transparent.
        const hdrTarget = ownedTargets[0] ?? null;
        const coverage = this.outputOptions.backgroundCoverage === true;
        const split = splitForwardItems(items, cameraPosition ?? undefined);
        const shared: ForwardPassOptions = {
          items: split.opaque,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: resolvedCamera?.viewMatrix,
          cameraViewProjectionMatrix: cameraViewProjection,
          outputColorSpace: "linear",
          shaderLibrary: this.shaderLibrary,
          backgroundCoverage: coverage
        };
        // The graph enforces unique names + single-producer writes; per-phase
        // resources chain the order, and `aura.scene.color` is written once —
        // by the final interleaved transparent pass.
        this.graph.addPass(new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", writes: ["aura.scene.color.opaque"] } }));
        if (hdrTarget?.depthTexture) {
          const depthCopy = this.ensureSceneDepthCopy();
          frameHooks.setSceneDepthCopy(depthCopy);
          this.graph.addPass(new SceneDepthCopyPass(hdrTarget, depthCopy));
        }
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.addPasses(this.graph, "transmission", items);
        let lastColorResource = "aura.scene.color.opaque";
        if (split.transmission.length > 0) {
          lastColorResource = "aura.scene.color.transmission";
          this.graph.addPass(new ForwardPass({
            ...shared,
            items: split.transmission,
            framePass: { name: "prd01.transmission", reads: ["aura.scene.color.opaque"], writes: [lastColorResource] }
          }));
        }
        frameHooks.addTransparentContributorPasses(this.graph, items);
        const { ctx: contributorCtx, queues } = frameHooks.transparentQueues(items);
        this.graph.addPass(new InterleavedTransparentPass({ ...shared, items: [] }, split.transparent, queues, contributorCtx, [lastColorResource]));
        frameHooks.addPasses(this.graph, "after-transparent", items);
      } else {
        this.graph.addPass(new ForwardPass({
          items,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: resolvedCamera?.viewMatrix,
          cameraViewProjectionMatrix: cameraViewProjection,
          outputColorSpace: postprocess ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary
        }));
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.addPasses(this.graph, "transmission", items);
        frameHooks.addPasses(this.graph, "transparent", items);
        frameHooks.addPasses(this.graph, "after-transparent", items);
      }
      this.graph.execute({ device: this.device, width: this.width, height: this.height });
      if (postprocess) {
        postprocess = bindRendererSsrProjection(postprocess, cameraViewProjection ?? identityMat4());
        const frameCamera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
        postprocess = {
          ...postprocess,
          cameraFrame: frameCamera && temporalPrevVp ? { ...frameCamera, previousViewProjectionMatrix: temporalPrevVp } : frameCamera,
          postFrameContext: {
            source,
            items,
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
        frameHooks.runPhase("post-hdr", items, postprocess !== undefined);
        this.executePostprocess(postprocess, ownedTargets, explicitRenderTarget);
        if (postprocess.temporal && (postprocess.motionBlur || postprocess.taa)) this.temporalHistory.commit();
      } else if (qrOutput) {
        frameHooks.runPhase("post-hdr", items, true);
        this.executeOutputPass(frameHooks, items, ownedTargets[0] ?? null, explicitRenderTarget);
      }
      frameHooks.runPhase("after-output", items);
    } catch (error) {
      this.lastShadowEvidence = null;
      if (postprocess?.temporal) this.temporalHistory.reset();
      throw error;
    } finally {
      this.device.endFrame();
      if (this.resolutionGovernor && this.frameStatsMonitor) {
        const frameSample = this.frameStatsMonitor.end();
        this.resolutionGovernor.sample(frameSample.intervalMs, frameSample.gpuMs);
      }
      for (const shadowPass of ownedShadowPasses) {
        shadowPass.dispose();
      }
      for (const target of ownedTargets) {
        // The reused forward-color target outlives the frame; disposing it here would reintroduce a
        // per-frame allocation.
        if (this.isReusedTarget(target)) continue;
        target.dispose();
      }
    }
    this.submittedShadowFrameId += 1;
    if (this.lastShadowEvidence) this.lastShadowEvidence = { ...this.lastShadowEvidence, submissionFrameId: this.submittedShadowFrameId };
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess) && this.device.info.capabilities?.includes("depth-textures"))
    }));
  }
  renderAsync(input: RendererInput): Promise<RenderDeviceDiagnostics>;
  renderAsync(source: RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics>;
  async renderAsync(sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene, camera?: CameraLike): Promise<RenderDeviceDiagnostics> {
    this.assertAlive();
    this.frameStatsMonitor?.begin(typeof performance !== "undefined" ? performance.now() : Date.now());
    // T0-06: reset the per-frame sync-compile bound for this render.
    {
      const flags = rendererQrFlags();
      if (qrCoreGeneratorOn(flags)) rendererProgramCache(this.device, flags).beginFrame?.();
    }
    const { source, camera: inputCamera } = normalizeRendererInput(sourceOrInput, camera);
    sceneFromSource(source)?.updateWorldTransforms();
    const cameraPolicy = collectCameraPolicy(source);
    const identityPolicyIgnoresSceneCamera = inputCamera === undefined && cameraPolicy === "identity";
    const autoFrameOverridesSceneCamera = inputCamera === undefined && hasExplicitAutoFrameCameraPolicy(source);
    const resolvedCamera = resolveCamera(source, inputCamera, { width: this.width, height: this.height }, {
      allowSceneCamera: !identityPolicyIgnoresSceneCamera && !autoFrameOverridesSceneCamera
    });
    if (!resolvedCamera && cameraPolicy === "require") {
      throw new RenderDeviceError("RenderSource requires an explicit camera but none was supplied or found in the scene.", "CAMERA_REQUIRED");
    }
    let cameraViewProjection = resolvedCamera?.viewProjectionMatrix;
    const collectedItems = collectRenderItemsWithDiagnostics(source, cameraViewProjection, resolvedCamera?.camera);
    const collectionDiagnostics = collectedItems.diagnostics;
    let items = collectedItems.items;
    const lights = collectRenderLights(source);
    const environmentBackground = collectEnvironmentBackground(source);
    const environmentLighting = collectEnvironmentLighting(source);
    const environmentFog = collectEnvironmentFog(source);
    const explicitShadowMap = collectForwardShadowMap(source);
    const shadowOptions = collectRendererShadowOptions(source);
    // C-02 (PRD-01 §403): pre-render warm-then-block compile of the generated
    // programs this scene needs. Flag-off: nothing (sync path untouched).
    await this.warmGeneratedPrograms(items, lights, environmentLighting, environmentFog, explicitShadowMap, cameraViewProjection);
    const sourceCameraPosition = collectSourceCameraPosition(source);
    const explicitRenderTarget = collectRenderTarget(source);
    validateExplicitRenderTarget(explicitRenderTarget, this.width, this.height);
    let cameraPosition = sourceCameraPosition ?? resolvedCamera?.cameraPosition;
    const frameHooks = createRendererFrameHooks({
      device: this.device,
      width: this.width,
      height: this.height,
      source,
      camera: toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition)
    });
    if (!resolvedCamera && cameraPolicy === "auto-frame") {
      const autoFrame = createAutoFrameCamera(source, items, this.width, this.height);
      if (autoFrame) {
        cameraViewProjection = autoFrame.viewProjectionMatrix;
        items = applyViewProjection(items, autoFrame.viewProjectionMatrix);
        cameraPosition = sourceCameraPosition ?? autoFrame.cameraPosition;
      }
    }
    let postprocess = collectPostprocess(source);
    if (!postprocess?.temporal || (!postprocess.motionBlur && !postprocess.taa)) { this.temporalHistory.reset(); this.lastTemporalCameraPosition = undefined; }
    const ownedTargets: RenderTarget[] = [];
    const ownedShadowPasses: Array<{ dispose(): void }> = [];
    this.graph.clear();
    // C-05 (§8.4): under A3D_QR_CORE_OUTPUT encode happens once, in OutputPass.
    // The legacy post chain's own encode/present is lane 03's to migrate into
    // post-hdr contributors (Q-03-2/Q-03-3); until then a configured chain is
    // reported once and skipped rather than double-encoded.
    const qrOutput = qrCoreOutputOn(rendererQrFlags(this.device));
    if (qrOutput && postprocess !== undefined) {
      if (!this.warnedV2Postprocess) {
        this.warnedV2Postprocess = true;
        if (typeof console !== "undefined") console.warn("POSTPROCESS_V2_UNMIGRATED: legacy postprocess chain skipped under A3D_QR_CORE_OUTPUT; encode handled by OutputPass");
      }
      postprocess = undefined;
    }
    let postprocessTargetFormat: Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> | undefined;
    if (postprocess) {
      const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.device, postprocess);
      postprocessTargetFormat = format;
      if ((format === "rgba16f" || format === "rgba32f") && !this.device.info.capabilities?.includes("hdr-render-targets")) {
        throw new RenderDeviceError("Renderer HDR postprocess requires an HDR-capable backend", "HDR_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind,
          format
        });
      }
      if ((format === "rgba16f" || format === "rgba32f") && postprocess.toneMapping === false) {
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
      const requiresDepthTexture = postprocessRequiresDepthTexture(postprocess);
      if (requiresDepthTexture && !this.device.info.capabilities?.includes("depth-textures")) {
        throw new RenderDeviceError("Depth-aware renderer postprocess requires a backend with sampleable depth texture render targets.", "DEPTH_POSTPROCESS_UNSUPPORTED", {
          backend: this.device.kind
        });
      }
      // Temporal AA owns subpixel coverage. Pre-resolving MSAA before tone
      // mapping gives it nonlinear mixed-coverage colors while velocity remains
      // single-sample, biasing moving silhouettes and filtering them twice.
      const sampleCount = postprocess.sampleCount ?? (postprocess.taa && postprocess.temporal ? 1 : this.device.kind === "webgpu" && requiresDepthTexture ? 1 : 4);
      // Reused across frames. It still occupies `ownedTargets[0]`, because the postprocess chain and
      // the diagnostics builder both read the forward target from that slot; the end-of-frame
      // disposal loop skips it via `isReusedTarget` so the reuse is safe.
      const forwardTarget = this.ensureForwardColorTarget(format, requiresDepthTexture, sampleCount);
      ownedTargets.push(forwardTarget);
      this.device.setRenderTarget(forwardTarget);
      frameHooks.setForwardTarget(forwardTarget);
    } else if (qrOutput) {
      // C-05: the v2 scene always renders into the HDR target — also on the
      // no-effects route (§8.4: encode once, in OutputPass). The governor's
      // renderScale applies to this target only; OutputPass upsamples.
      const probed = probeHdrTargetFormat(this.device);
      const format = probed === "rgba8" ? "rgba8" : "rgba16f";
      const hdrTarget = this.ensureHdrSceneTarget(format, this.outputOptions.backgroundCoverage === true);
      ownedTargets.push(hdrTarget);
      this.device.setRenderTarget(hdrTarget);
      frameHooks.setForwardTarget(hdrTarget);
    }
    this.device.beginFrame(this.width, this.height);
    try {
      this.lastShadowEvidence = null;
      items = frameHooks.collect(items);
      const rendererShadowMap = explicitShadowMap ?? this.executeRendererShadowMap({
        shadowOptions,
        source,
        items: items.filter((item) => item.castShadow !== false),
        lights,
        ownedTargets,
        ownedShadowPasses,
        camera: resolvedCamera?.camera
      });
      frameHooks.addPasses(this.graph, "shadows", items);
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
      this.device.clear(this.clearColor);
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
      let temporalAutoReset = false;
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa) && cameraPosition && rendererQrFlags(this.device).on("A3D_QR_POST")) {
        const prev = this.lastTemporalCameraPosition;
        if (prev) {
          const dx = (cameraPosition as readonly number[])[0]! - prev[0];
          const dy = (cameraPosition as readonly number[])[1]! - prev[1];
          const dz = (cameraPosition as readonly number[])[2]! - prev[2];
          temporalAutoReset = dx * dx + dy * dy + dz * dz > 25;
        }
        this.lastTemporalCameraPosition = [(cameraPosition as readonly number[])[0]!, (cameraPosition as readonly number[])[1]!, (cameraPosition as readonly number[])[2]!];
      }
      if (postprocess?.temporal && (postprocess.motionBlur || postprocess.taa)) {
        if (postprocess.execution === "cpu-deterministic" || !this.device.presentLdrPostprocess) throw new RenderDeviceError("Renderer temporal effects require native GPU presentation", "TEMPORAL_NATIVE_REQUIRED");
        const temporal = this.temporalHistory.prepare(this.device, this.width, this.height, items, cameraViewProjection, { ...postprocess.temporal, jitter: Boolean(postprocess.taa), ...(temporalAutoReset ? { reset: true } : {}) });
        temporalPrevVp = temporal.v2?.previous;
        items = this.temporalHistory.renderItems;
        postprocess = { ...postprocess, ...(postprocess.motionBlur ? {motionBlur: { ...postprocess.motionBlur, temporal }} : {}), ...(postprocess.taa ? {taa: { ...postprocess.taa, temporal }} : {}) };
        this.device.setRenderTarget(ownedTargets[0]!);
      }
      if (qrOutput) {
        // §9.1 v2 frame order: opaque → after-opaque (scene-depth copy,
        // contributors) → transmission → transmissive → transparent (engine
        // items + contributor TransparentQueueItems interleaved by sortDepth)
        // → after-transparent.
        const hdrTarget = ownedTargets[0] ?? null;
        const coverage = this.outputOptions.backgroundCoverage === true;
        const split = splitForwardItems(items, cameraPosition ?? undefined);
        const shared: ForwardPassOptions = {
          items: split.opaque,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: resolvedCamera?.viewMatrix,
          cameraViewProjectionMatrix: cameraViewProjection,
          outputColorSpace: "linear",
          shaderLibrary: this.shaderLibrary,
          backgroundCoverage: coverage
        };
        // The graph enforces unique names + single-producer writes; per-phase
        // resources chain the order, and `aura.scene.color` is written once —
        // by the final interleaved transparent pass.
        this.graph.addPass(new ForwardPass({ ...shared, framePass: { name: "prd01.opaque", writes: ["aura.scene.color.opaque"] } }));
        if (hdrTarget?.depthTexture) {
          const depthCopy = this.ensureSceneDepthCopy();
          frameHooks.setSceneDepthCopy(depthCopy);
          this.graph.addPass(new SceneDepthCopyPass(hdrTarget, depthCopy));
        }
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.addPasses(this.graph, "transmission", items);
        let lastColorResource = "aura.scene.color.opaque";
        if (split.transmission.length > 0) {
          lastColorResource = "aura.scene.color.transmission";
          this.graph.addPass(new ForwardPass({
            ...shared,
            items: split.transmission,
            framePass: { name: "prd01.transmission", reads: ["aura.scene.color.opaque"], writes: [lastColorResource] }
          }));
        }
        frameHooks.addTransparentContributorPasses(this.graph, items);
        const { ctx: contributorCtx, queues } = frameHooks.transparentQueues(items);
        this.graph.addPass(new InterleavedTransparentPass({ ...shared, items: [] }, split.transparent, queues, contributorCtx, [lastColorResource]));
        frameHooks.addPasses(this.graph, "after-transparent", items);
      } else {
        this.graph.addPass(new ForwardPass({
          items,
          lights,
          environmentLighting,
          environmentFog,
          inputColorResource: environmentBackground ? ENVIRONMENT_BACKGROUND_COLOR_RESOURCE : undefined,
          shadowMap: rendererShadowMap,
          cameraPosition,
          cameraViewMatrix: resolvedCamera?.viewMatrix,
          cameraViewProjectionMatrix: cameraViewProjection,
          outputColorSpace: postprocess ? "linear" : "srgb",
          shaderLibrary: this.shaderLibrary
        }));
        frameHooks.addPasses(this.graph, "after-opaque", items);
        frameHooks.addPasses(this.graph, "transmission", items);
        frameHooks.addPasses(this.graph, "transparent", items);
        frameHooks.addPasses(this.graph, "after-transparent", items);
      }
      this.graph.execute({ device: this.device, width: this.width, height: this.height });
      if (postprocess) {
        postprocess = bindRendererSsrProjection(postprocess, cameraViewProjection ?? identityMat4());
        const frameCamera = toFrameCamera(resolvedCamera, cameraViewProjection, cameraPosition);
        postprocess = {
          ...postprocess,
          cameraFrame: frameCamera && temporalPrevVp ? { ...frameCamera, previousViewProjectionMatrix: temporalPrevVp } : frameCamera,
          postFrameContext: {
            source,
            items,
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
        await frameHooks.runPhaseAsync("post-hdr", items, postprocess !== undefined);
        await this.executePostprocessAsync(postprocess, ownedTargets, explicitRenderTarget);
        if (postprocess.temporal && (postprocess.motionBlur || postprocess.taa)) this.temporalHistory.commit();
      } else if (qrOutput) {
        await frameHooks.runPhaseAsync("post-hdr", items, true);
        this.executeOutputPass(frameHooks, items, ownedTargets[0] ?? null, explicitRenderTarget);
      }
      await frameHooks.runPhaseAsync("after-output", items);
    } catch (error) {
      this.lastShadowEvidence = null;
      if (postprocess?.temporal) this.temporalHistory.reset();
      throw error;
    } finally {
      this.device.endFrame();
      if (this.resolutionGovernor && this.frameStatsMonitor) {
        const frameSample = this.frameStatsMonitor.end();
        this.resolutionGovernor.sample(frameSample.intervalMs, frameSample.gpuMs);
      }
      for (const shadowPass of ownedShadowPasses) {
        shadowPass.dispose();
      }
      for (const target of ownedTargets) {
        // The reused forward-color target outlives the frame; disposing it here would reintroduce a
        // per-frame allocation.
        if (this.isReusedTarget(target)) continue;
        target.dispose();
      }
    }
    this.submittedShadowFrameId += 1;
    if (this.lastShadowEvidence) this.lastShadowEvidence = { ...this.lastShadowEvidence, submissionFrameId: this.submittedShadowFrameId };
    return withRendererFrameDiagnostics(this.device.getDiagnostics(), collectionDiagnostics, createPostprocessDiagnostics(postprocess, ownedTargets, this.width, this.height, {
      targetFormat: postprocessTargetFormat,
      nativeLdrPostprocess: Boolean(this.device.presentLdrPostprocess),
      rendererDepthAvailable: Boolean(postprocess && postprocessRequiresDepthTexture(postprocess) && this.device.info.capabilities?.includes("depth-textures"))
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
  private collectWarmupInput(
    items: readonly RenderItem[],
    lights: readonly CollectedLight[],
    environmentLighting: EnvironmentLightingOptions | undefined,
    environmentFog: ForwardEnvironmentFogOptions | false | undefined,
    shadowMap: ForwardShadowMapOptions | undefined,
    cameraViewProjection: Float32Array | readonly number[] | undefined,
    flags: ReturnType<typeof rendererQrFlags>,
    tier: AuraQualityTier
  ): WarmupInput {
    const materials = new Map<string, import("./Material").Material>();
    for (const item of items) {
      const m = item.material instanceof MaterialInstance ? item.material.baseMaterial : item.material;
      if (m && materialUsesGeneratedProgram(m)) materials.set(`${m.shaderKey}:${m.getRevision()}`, m);
    }
    if (materials.size === 0) return { materials: [] };
    const clustered = resolveForwardClusteredLighting(lights, this.width, this.height, cameraViewProjection);
    const axes = forwardPassFeatureAxes({ lights, shadowMap, environmentLighting, environmentFog }, clustered !== null);
    clustered?.dispose();
    const ctx = { flags, tier: QUALITY_TIERS[tier] };
    return {
      materials: [...materials.values()].map((m) => m.programFeatures(ctx)),
      lights: [axes.lights],
      shadows: axes.shadows ? [axes.shadows] : [],
      environments: [axes.environment]
    };
  }

  private async warmGeneratedPrograms(
    items: readonly RenderItem[],
    lights: readonly CollectedLight[],
    environmentLighting: EnvironmentLightingOptions | undefined,
    environmentFog: ForwardEnvironmentFogOptions | false | undefined,
    shadowMap: ForwardShadowMapOptions | undefined,
    cameraViewProjection: Float32Array | readonly number[] | undefined
  ): Promise<void> {
    const flags = rendererQrFlags(this.device);
    if (!qrCoreGeneratorOn(flags)) return;
    const tier: AuraQualityTier = this.qualityTierName ?? "high";
    const cache = rendererProgramCache(this.device, flags);
    const input = this.collectWarmupInput(items, lights, environmentLighting, environmentFog, shadowMap, cameraViewProjection, flags, tier);
    if (input.materials.length > 0) {
      const warmup = (this.programWarmup ??= new ProgramWarmup(cache));
      await warmup.warm(input, tier);
    }
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
    cameraViewProjection: Float32Array | readonly number[] | undefined
  ): void {
    const flags = rendererQrFlags();
    if (!qrCoreGeneratorOn(flags)) return;
    const tier: AuraQualityTier = this.qualityTierName ?? "high";
    const cache = rendererProgramCache(this.device, flags);
    const input = this.collectWarmupInput(items, lights, environmentLighting, environmentFog, shadowMap, cameraViewProjection, flags, tier);
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
    const diagnostics = source ? this.render(source, camera) : this.device.getDiagnostics();
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
    return this.device.getDiagnostics();
  }
  dispose(): void {
    this.lastShadowEvidence = null;
    this.animationLoop?.stop();
    this.animationLoop = null;
    this.shadowDepthTarget?.dispose();
    this.shadowDepthTarget = null;
    this.forwardColorTarget?.target.dispose();
    this.forwardColorTarget = null;
    this.hdrSceneTarget?.target.dispose();
    this.hdrSceneTarget = null;
    this.sceneDepthCopyTarget?.dispose();
    this.sceneDepthCopyTarget = null;
    this.unsubscribeTemporalDeviceLoss?.();
    this.unsubscribeDprWatch?.();
    this.temporalHistory.dispose();
    this.device.dispose();
    this.disposed = true;
  }
  /** True for renderer-lifetime targets that must survive end-of-frame disposal. */
  private isReusedTarget(target: RenderTarget): boolean {
    return target === this.forwardColorTarget?.target || target === this.shadowDepthTarget || target === this.hdrSceneTarget?.target || target === this.sceneDepthCopyTarget;
  }

  /**
   * C-05 HDR scene target under `A3D_QR_CORE_OUTPUT` — always a sampleable
   * depth texture (sceneDepth / after-opaque copy), renderScale-sized, MSAA 4x,
   * plus the BACKGROUND_COVERAGE rgba8 attachment when the option is on.
   */
  private ensureHdrSceneTarget(format: "rgba8" | "rgba16f", coverage: boolean): RenderTarget {
    const scale = Math.min(Math.max(this.renderScale, 0.01), 1);
    const width = Math.max(1, Math.round(this.width * scale));
    const height = Math.max(1, Math.round(this.height * scale));
    // C-36: WebGL2 does not support multisample MRT — coverage forces a
    // non-MSAA target and is declared via `hdr-msaa-mrt-unsupported`.
    const sampleCount = coverage ? 1 : 4;
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
    this.hdrSceneTarget = { target, key };
    return target;
  }

  private ensureSceneDepthCopy(): RenderTarget {
    this.sceneDepthCopyTarget = ensureSceneDepthCopyTarget(this.device, this.sceneDepthCopyTarget, this.width, this.height);
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
    rendererOutputPass(this.device).execute(hdrTarget, coverage ? hdrTarget : null, {
      toneMapping: o.toneMapping ?? DEFAULT_TONE_MAPPING,
      exposure: appliedExposure,
      dithering: o.dithering ?? true,
      backgroundCoverage: coverage,
      overlay: o.overlay
    }, explicitRenderTarget ?? "canvas");
    this.lastAppliedOutput = {
      toneMapping: o.toneMapping ?? DEFAULT_TONE_MAPPING,
      exposure: { applied: appliedExposure, source: upstream !== undefined ? "grade" : "output" },
      dithering: o.dithering ?? true,
      targetFormat,
      degraded: targetFormat === "rgba8" ? "rgba8-no-float-target" : this.hdrMsaaMrtDegraded ? "hdr-msaa-mrt-unsupported" : undefined
    };
  }
  /** Allocates the shared forward-color target once per distinct configuration. */
  private ensureForwardColorTarget(format: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">, requiresDepthTexture: boolean, sampleCount: number): RenderTarget {
    const key = `${this.width}x${this.height}:${format}:${requiresDepthTexture ? "depth-texture" : "depth"}:${sampleCount}`;
    const cached = this.forwardColorTarget;
    if (cached && cached.key === key && !cached.target.disposed) return cached.target;
    cached?.target.dispose();
    const target = this.device.createRenderTarget({
      width: this.width,
      height: this.height,
      label: "renderer-forward-color",
      format,
      depth: requiresDepthTexture ? "texture" : true,
      sampleCount
    });
    this.forwardColorTarget = { target, key };
    return target;
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
    readonly source: RenderSource | Iterable<RenderItem> | Scene;
    readonly items: readonly RenderItem[];
    readonly lights: readonly CollectedLight[];
    readonly ownedTargets: RenderTarget[];
    readonly ownedShadowPasses: Array<{ dispose(): void }>;
    readonly camera?: Camera;
  }): ForwardShadowMapOptions | undefined {
    return this.host.shadows.executeRendererShadowMap(options);
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
  for (let instanceIndex = 0; instanceIndex < transforms.length; instanceIndex += 1) {
    const transform = transforms[instanceIndex]!;
    for (let pointIndex = 0; pointIndex < geometry.vertexBuffer.vertexCount; pointIndex += 1) {
      const position = geometry.vertexBuffer.getAttribute(pointIndex, "position");
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
function validateExplicitRenderTarget(target: RenderTarget | undefined, width: number, height: number): void {
  if (!target) return;
  if (target.disposed) {
    throw new RenderDeviceError("Renderer renderTarget must be a live render target.", "RENDER_TARGET_DISPOSED", {
      renderTarget: target.label
    });
  }
  if (target.width !== width || target.height !== height) {
    throw new RenderDeviceError("Renderer renderTarget dimensions must match the renderer viewport.", "RENDER_TARGET_VIEWPORT_MISMATCH", {
      renderTarget: target.label,
      targetWidth: target.width,
      targetHeight: target.height,
      rendererWidth: width,
      rendererHeight: height
    });
  }
}
function normalizeRendererInput(
  sourceOrInput: RendererInput | RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike
): RendererInput {
  if (isRendererInput(sourceOrInput)) {
    return { source: sourceOrInput.source, camera: camera ?? sourceOrInput.camera };
  }
  return { source: sourceOrInput, ...(camera ? { camera } : {}) };
}
function isRendererInput(value: RendererInput | RenderSource | Iterable<RenderItem> | Scene): value is RendererInput {
  return !(value instanceof Scene) && !isIterable(value) && isRecord(value) && "source" in value;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
  camera?: Camera
): { readonly items: readonly RenderItem[]; readonly diagnostics: RenderCollectionDiagnostics } {
  const diagnostics = createRenderCollectionDiagnostics();
  if (isIterable(source)) {
    const items = applyViewProjection([...source], cameraViewProjection);
    diagnostics.submittedObjects += items.length;
    diagnostics.visibleObjects += items.length;
    return { items, diagnostics };
  }
  if (source instanceof Scene) {
    const items = collectSceneRenderItems(source, {}, cameraViewProjection, camera, diagnostics);
    return { items, diagnostics };
  }
  const items: RenderItem[] = [];
  if (source.scene) {
    items.push(...collectSceneRenderItems(source.scene, source, cameraViewProjection, source.frustumCulling === false ? undefined : camera, diagnostics));
  }
  const explicitItems: RenderItem[] = [];
  if (source.collectRenderItems) {
    explicitItems.push(...source.collectRenderItems());
  }
  if (source.renderItems) {
    explicitItems.push(...source.renderItems);
  }
  if (explicitItems.length > 0) {
    const cullingFrustum = explicitCullingFrustum(source, cameraViewProjection, camera);
    const visibleItems = cullExplicitRenderItems(explicitItems, cullingFrustum, diagnostics);
    const optimizedItems = applyRendererOwnedStaticBatching(source, applyRendererOwnedStaticMeshConsolidation(source, visibleItems));
    const projectedItems = applyViewProjection(optimizedItems, cameraViewProjection);
    items.push(...projectedItems);
  }
  return { items, diagnostics };
}
function collectSceneRenderItems(
  scene: Scene,
  source: Pick<RenderSource, "geometryLibrary" | "materialLibrary" | "morphTargetLibrary">,
  cameraViewProjection?: Mat4,
  camera?: Camera,
  diagnostics?: RenderCollectionDiagnostics
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
  for (const { node, renderable } of renderables) {
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
      if (camera) diagnostics.frustumTestedObjects += 1;
    }
    if (camera && !camera.frustum.intersectsBox(bounds.toMathBox())) {
      if (diagnostics) diagnostics.culledObjects += 1;
      continue;
    }
    if (diagnostics) diagnostics.visibleObjects += 1;
    items.push({
      geometry,
      material,
      label: node.name,
      modelMatrix,
      normalMatrix: normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: multiplyMat4(cameraViewProjection ?? identityMat4(), modelMatrix),
      ...(renderable.skinning ? { skinning: renderable.skinning } : {}),
      ...(renderable.instanceTransforms ? { instanceTransforms: renderable.instanceTransforms } : {}),
      ...(renderable.instanceColors ? { instanceColors: renderable.instanceColors } : {}),
      ...(morphTargets && renderable.morphWeights.length > 0 ? { morphTargets, morphWeights: renderable.morphWeights } : {})
    });
  }
  return items;
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
function applyViewProjection(items: readonly RenderItem[], cameraViewProjection?: Mat4): readonly RenderItem[] {
  const hasCameraViewProjection = cameraViewProjection !== undefined;
  const viewProjection = cameraViewProjection ?? identityMat4();
  return items.map((item) => {
    const modelMatrix = toMat4(item.modelMatrix ?? identityMat4(), "modelMatrix", item.label);
    const explicitModelViewProjection = item.modelViewProjectionMatrix
      ? toMat4(item.modelViewProjectionMatrix, "modelViewProjectionMatrix", item.label)
      : undefined;
    return {
      ...item,
      modelMatrix,
      normalMatrix: item.normalMatrix ? toMat4(item.normalMatrix, "normalMatrix", item.label) : normalMatrixFromModel(modelMatrix),
      modelViewProjectionMatrix: hasCameraViewProjection || !explicitModelViewProjection
        ? multiplyMat4(viewProjection, modelMatrix)
        : explicitModelViewProjection
    };
  });
}
function createAutoFrameCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  items: readonly RenderItem[],
  width: number,
  height: number
): { readonly viewProjectionMatrix: Mat4; readonly cameraPosition: readonly [number, number, number] } | undefined {
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
    cameraPosition: frame.cameraPosition
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
function resolveCamera(
  source: RenderSource | Iterable<RenderItem> | Scene,
  camera?: CameraLike,
  viewport?: { readonly width: number; readonly height: number },
  options: { readonly allowSceneCamera?: boolean } = {}
): { readonly viewProjectionMatrix: Mat4; readonly viewMatrix?: Mat4; readonly camera?: Camera; readonly cameraPosition?: readonly [number, number, number] } | undefined {
  const resolved = camera ?? (options.allowSceneCamera === false ? undefined : resolveSceneCamera(source));
  if (!resolved) {
    return undefined;
  }
  const resize = maybeCameraResize(resolved);
  if (viewport && resize) {
    resize(viewport.width, viewport.height);
  }
  resolved.updateCameraMatrices?.();
  if (resolved.viewProjectionMatrix) {
    const viewMatrix = resolved.viewMatrix ? toMat4(resolved.viewMatrix, "viewMatrix") : undefined;
    return {
      viewProjectionMatrix: toMat4(resolved.viewProjectionMatrix, "viewProjectionMatrix"),
      ...(viewMatrix ? { viewMatrix } : {}),
      ...(resolved instanceof Camera
        ? { camera: resolved, cameraPosition: cameraWorldPosition(resolved) }
        : viewMatrix
          ? { cameraPosition: cameraPositionFromViewMatrix(viewMatrix) }
          : {})
    };
  }
  if (resolved.projectionMatrix && resolved.viewMatrix) {
    const viewMatrix = toMat4(resolved.viewMatrix, "viewMatrix");
    return {
      viewProjectionMatrix: multiplyMat4(toMat4(resolved.projectionMatrix, "projectionMatrix"), viewMatrix),
      viewMatrix,
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
