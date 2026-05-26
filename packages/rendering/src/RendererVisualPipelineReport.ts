import {
  createExternalParityColorManagementPolicy,
  type A3DColorManagementPolicy,
  type A3DColorSpace,
  type A3DTextureSemantic
} from "./ColorManagement";
import {
  createToneMappingCalibration,
  type BloomOptions,
  type ChromaticAberrationOptions,
  type ColorGradeOptions,
  type ContactShadowPostProcessOptions,
  type DepthOfFieldOptions,
  type FXAAOptions,
  type FilmGrainOptions,
  type MotionBlurOptions,
  type OutlineOptions,
  type PostProcessColorSpace,
  type SSAOOptions,
  type SSROptions,
  type TAAOptions,
  type ToneMappingCalibration,
  type ToneMappingOperator,
  type ToneMappingOptions,
  type ToneMappingPresetName
} from "./PostProcessPass";
import {
  createRendererPostprocessPlanDiagnostics,
  type RendererPostprocessExecutionMode,
  type RendererPostprocessPlanDiagnostics
} from "./RendererPostprocessPlan";
import { listExternalParityToneMappingPresets } from "./ToneMapping";
import type {
  RenderDevice,
  RenderDeviceCapability,
  RenderDeviceDiagnostics,
  RenderTargetDescriptor
} from "./RenderDevice";

export type RendererVisualPipelineStatus = "supported" | "partial" | "unsupported";
export type RendererVisualTargetFormat = Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f">;
export type RendererVisualPostprocessPassName =
  | "tone-mapping"
  | "color-grade"
  | "bloom"
  | "chromatic-aberration"
  | "film-grain"
  | "depth-of-field"
  | "motion-blur"
  | "contact-shadow"
  | "ssao"
  | "ssr"
  | "taa"
  | "outline"
  | "fxaa";

export type RendererUnsupportedVisualCapability =
  | "display-p3-output"
  | "rec2020-output"
  | "hdr-display-swapchain"
  | "automatic-png-color-profile";

export interface RendererVisualPostprocessDescriptor {
  readonly targetFormat?: RendererVisualTargetFormat;
  readonly toneMapping?: ToneMappingOptions | false;
  readonly colorGrade?: ColorGradeOptions | boolean;
  readonly bloom?: BloomOptions | boolean;
  readonly chromaticAberration?: ChromaticAberrationOptions | boolean;
  readonly filmGrain?: FilmGrainOptions | boolean;
  readonly depthOfField?: DepthOfFieldOptions | false;
  readonly motionBlur?: MotionBlurOptions | false;
  readonly contactShadow?: ContactShadowPostProcessOptions | false;
  readonly ssao?: SSAOOptions | false;
  readonly ssr?: SSROptions | false;
  readonly taa?: TAAOptions | false;
  readonly outline?: OutlineOptions | boolean;
  readonly fxaa?: FXAAOptions | boolean;
}

export interface RendererCanvasBackingInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly actualWidth?: number;
  readonly actualHeight?: number;
}

export interface RendererCanvasBackingReport {
  readonly status: RendererVisualPipelineStatus;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly actualWidth?: number;
  readonly actualHeight?: number;
  readonly effectiveDevicePixelRatio?: number;
  readonly backingStoreMatchesDisplay: boolean;
  readonly warnings: readonly string[];
}

export interface RendererScreenshotConsistencyInput {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly expectedByteLength?: number;
  readonly colorSpace?: A3DColorSpace;
}

export interface RendererScreenshotConsistencyReport {
  readonly status: RendererVisualPipelineStatus;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly expectedWidth: number;
  readonly expectedHeight: number;
  readonly expectedByteLength: number;
  readonly colorSpace: A3DColorSpace;
  readonly pixelFormat: "rgba8";
  readonly readbackMatchesBackingStore: boolean;
  readonly colorProfileEmbedded: false;
  readonly warnings: readonly string[];
}

export interface RendererCaptureQualityInput {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
  readonly captureCssWidth?: number;
  readonly captureCssHeight?: number;
  readonly devicePixelRatio?: number;
  readonly minimumEffectiveDpr?: number;
  readonly label?: string;
}

export interface RendererCaptureQualityReport {
  readonly status: RendererVisualPipelineStatus;
  readonly label?: string;
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly backingWidth: number;
  readonly backingHeight: number;
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
  readonly captureCssWidth: number;
  readonly captureCssHeight: number;
  readonly devicePixelRatio?: number;
  readonly minimumEffectiveDpr: number;
  readonly effectiveBackingDprX: number;
  readonly effectiveBackingDprY: number;
  readonly effectiveCaptureDprX: number;
  readonly effectiveCaptureDprY: number;
  readonly captureToBackingScaleX: number;
  readonly captureToBackingScaleY: number;
  readonly capturesFullCanvas: boolean;
  readonly fullCanvasPixelMatch: boolean;
  readonly captureDownsamplesCanvas: boolean;
  readonly captureUpscalesCanvas: boolean;
  readonly meetsMinimumEffectiveDpr: boolean;
  readonly warnings: readonly string[];
}

export interface RendererFrameCadenceInput {
  readonly targetFrameMs?: number;
  readonly renderMs?: number;
  readonly loopMs?: number;
  readonly frameIntervalMs?: number;
  readonly readbackMs?: number;
  readonly screenshotCaptureOverheadMs?: number;
  readonly sampleCount?: number;
}

export interface RendererFrameCadenceReport {
  readonly status: RendererVisualPipelineStatus;
  readonly targetFrameMs: number;
  readonly renderMs?: number;
  readonly loopMs?: number;
  readonly frameIntervalMs?: number;
  readonly readbackMs?: number;
  readonly screenshotCaptureOverheadMs?: number;
  readonly sampleCount?: number;
  readonly renderBudgetRatio?: number;
  readonly loopBudgetRatio?: number;
  readonly frameIntervalBudgetRatio?: number;
  readonly readbackBudgetRatio?: number;
  readonly captureOverheadFrames?: number;
  readonly loopHeadroomMs?: number;
  readonly stableForCapture: boolean;
  readonly warnings: readonly string[];
}

export interface RendererVisualPipelineReportOptions {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly postprocess?: RendererVisualPostprocessDescriptor | boolean;
  readonly colorManagement?: A3DColorManagementPolicy;
  readonly canvas?: RendererCanvasBackingInput;
  readonly screenshot?: Omit<RendererScreenshotConsistencyInput, "expectedWidth" | "expectedHeight" | "colorSpace"> & {
    readonly colorSpace?: A3DColorSpace;
  };
  readonly capture?: RendererCaptureQualityInput;
  readonly frameCadence?: RendererFrameCadenceInput;
  readonly diagnostics?: RenderDeviceDiagnostics;
}

export interface RendererVisualColorReport {
  readonly lightingColorSpace: "linear";
  readonly outputColorSpace: A3DColorSpace;
  readonly supportedOutputColorSpaces: readonly A3DColorSpace[];
  readonly unsupportedOutputColorSpaces: readonly ["display-p3", "rec2020"];
  readonly texturePolicy: Readonly<Record<A3DTextureSemantic, A3DColorSpace>>;
  readonly ldrFallbackAllowed: boolean;
  readonly fallbackBehavior: string;
}

export interface RendererVisualToneMappingReport {
  readonly status: RendererVisualPipelineStatus;
  readonly enabled: boolean;
  readonly operator?: ToneMappingOperator;
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly gamma?: number;
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly outputColorSpace?: PostProcessColorSpace;
  readonly calibration?: ToneMappingCalibration;
  readonly availablePresets: readonly ToneMappingPresetName[];
  readonly warnings: readonly string[];
}

export interface RendererVisualPostprocessReport {
  readonly status: RendererVisualPipelineStatus;
  readonly enabled: boolean;
  readonly passNames: readonly RendererVisualPostprocessPassName[];
  readonly targetFormat: RendererVisualTargetFormat;
  readonly sourceTargetFormat: RendererVisualTargetFormat;
  readonly executionMode: RendererPostprocessExecutionMode;
  readonly nativePresentation: boolean;
  readonly usesReadback: boolean;
  readonly missingInputs: readonly string[];
  readonly readbackPassNames: readonly RendererVisualPostprocessPassName[];
  readonly rendererOwnedPassNames: readonly RendererVisualPostprocessPassName[];
  readonly clarityWarnings: readonly string[];
  readonly forwardOutputColorSpace: PostProcessColorSpace;
  readonly presentationColorSpace: A3DColorSpace;
  readonly renderTargetWidth: number;
  readonly renderTargetHeight: number;
  readonly plan?: RendererPostprocessPlanDiagnostics;
  readonly warnings: readonly string[];
}

export interface RendererVisualHdrTargetReport {
  readonly status: RendererVisualPipelineStatus;
  readonly requested: boolean;
  readonly supportedByBackend: boolean;
  readonly capabilityAdvertised: boolean;
  readonly targetFormat: RendererVisualTargetFormat;
  readonly fallbackFormat?: "rgba8";
  readonly toneMappingRequired: boolean;
  readonly warnings: readonly string[];
}

export interface RendererVisualPipelineReport {
  readonly status: RendererVisualPipelineStatus;
  readonly backend: RenderDevice["kind"];
  readonly renderer: string;
  readonly width: number;
  readonly height: number;
  readonly capabilities: readonly RenderDeviceCapability[];
  readonly color: RendererVisualColorReport;
  readonly toneMapping: RendererVisualToneMappingReport;
  readonly hdrTarget: RendererVisualHdrTargetReport;
  readonly postprocess: RendererVisualPostprocessReport;
  readonly canvas?: RendererCanvasBackingReport;
  readonly screenshot?: RendererScreenshotConsistencyReport;
  readonly capture?: RendererCaptureQualityReport;
  readonly frameCadence?: RendererFrameCadenceReport;
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly unsupportedCapabilities: Readonly<Record<RendererUnsupportedVisualCapability, string>>;
  readonly warnings: readonly string[];
}

const SUPPORTED_OUTPUT_COLOR_SPACES: readonly A3DColorSpace[] = ["linear", "srgb"];
const UNSUPPORTED_OUTPUT_COLOR_SPACES = ["display-p3", "rec2020"] as const;
const HDR_FORMATS: readonly RendererVisualTargetFormat[] = ["rgba16f", "rgba32f"];

const UNSUPPORTED_CAPABILITIES: Readonly<Record<RendererUnsupportedVisualCapability, string>> = {
  "display-p3-output": "Renderer output color space is limited to linear or sRGB; display-p3 output is not exposed.",
  "rec2020-output": "Renderer output color space is limited to linear or sRGB; Rec.2020 output is not exposed.",
  "hdr-display-swapchain": "HDR render targets can be tone-mapped, but HDR display swapchain output is not exposed.",
  "automatic-png-color-profile": "Screenshot readback is RGBA8 bytes; PNG/ICC profile tagging is owned by the caller."
};

export function createRendererVisualPipelineReport(
  options: RendererVisualPipelineReportOptions
): RendererVisualPipelineReport {
  assertPositiveInteger(options.width, "width");
  assertPositiveInteger(options.height, "height");

  const capabilities = [...(options.device.info.capabilities ?? [])];
  const capabilitySet = new Set<RenderDeviceCapability>(capabilities);
  const colorManagement = options.colorManagement ?? createExternalParityColorManagementPolicy();
  const postprocess = normalizePostprocess(options.postprocess);
  const postprocessEnabled = postprocess !== undefined;
  const passNames = postprocess ? collectPostprocessPassNames(postprocess) : [];
  const targetFormat = postprocess ? resolvePostprocessTargetFormat(capabilitySet, postprocess) : "rgba8";
  const postprocessPlan = postprocess
    ? createRendererPostprocessPlanDiagnostics(postprocess, {
        sourceTargetFormat: targetFormat,
        targetFormat,
        nativeLdrPostprocess: Boolean(options.device.presentLdrPostprocess),
        rendererDepthAvailable: capabilitySet.has("depth-textures")
      })
    : undefined;
  const hdrTarget = createHdrTargetReport(capabilitySet, targetFormat, postprocess?.toneMapping);
  const toneMapping = createToneMappingReport(postprocess, targetFormat);
  const postprocessReport = createPostprocessReport({
    enabled: postprocessEnabled,
    passNames,
    targetFormat,
    plan: postprocessPlan,
    width: options.width,
    height: options.height,
    presentationColorSpace: colorManagement.outputColorSpace,
    hdrTargetStatus: hdrTarget.status,
    toneMappingStatus: toneMapping.status
  });
  const canvas = options.canvas ? evaluateRendererCanvasBacking(options.canvas) : undefined;
  const screenshot = options.screenshot
    ? evaluateRendererScreenshotConsistency({
        ...options.screenshot,
        expectedWidth: options.width,
        expectedHeight: options.height,
        colorSpace: options.screenshot.colorSpace ?? colorManagement.outputColorSpace
      })
    : undefined;
  const capture = options.capture ? evaluateRendererCaptureQuality(options.capture) : undefined;
  const frameCadence = options.frameCadence ? evaluateRendererFrameCadence(options.frameCadence) : undefined;
  const warnings = [
    ...hdrTarget.warnings,
    ...toneMapping.warnings,
    ...postprocessReport.warnings,
    ...(canvas?.warnings ?? []),
    ...(screenshot?.warnings ?? []),
    ...(capture?.warnings ?? []),
    ...(frameCadence?.warnings ?? [])
  ];

  return {
    status: combineStatuses([
      hdrTarget.status,
      toneMapping.status,
      postprocessReport.status,
      canvas?.status,
      screenshot?.status,
      capture?.status,
      frameCadence?.status
    ]),
    backend: options.device.kind,
    renderer: options.device.info.renderer,
    width: options.width,
    height: options.height,
    capabilities,
    color: {
      lightingColorSpace: colorManagement.lightingColorSpace,
      outputColorSpace: colorManagement.outputColorSpace,
      supportedOutputColorSpaces: SUPPORTED_OUTPUT_COLOR_SPACES,
      unsupportedOutputColorSpaces: UNSUPPORTED_OUTPUT_COLOR_SPACES,
      texturePolicy: colorManagement.texturePolicy,
      ldrFallbackAllowed: colorManagement.allowLdrFallback,
      fallbackBehavior: colorManagement.fallbackBehavior
    },
    toneMapping,
    hdrTarget,
    postprocess: postprocessReport,
    ...(canvas ? { canvas } : {}),
    ...(screenshot ? { screenshot } : {}),
    ...(capture ? { capture } : {}),
    ...(frameCadence ? { frameCadence } : {}),
    ...(options.diagnostics ? { diagnostics: options.diagnostics } : {}),
    unsupportedCapabilities: UNSUPPORTED_CAPABILITIES,
    warnings
  };
}

export function evaluateRendererCanvasBacking(input: RendererCanvasBackingInput): RendererCanvasBackingReport {
  assertPositiveFinite(input.cssWidth, "cssWidth");
  assertPositiveFinite(input.cssHeight, "cssHeight");
  assertPositiveFinite(input.devicePixelRatio, "devicePixelRatio");
  const expectedWidth = Math.max(1, Math.round(input.cssWidth * input.devicePixelRatio));
  const expectedHeight = Math.max(1, Math.round(input.cssHeight * input.devicePixelRatio));
  const hasActualDimensions = input.actualWidth !== undefined && input.actualHeight !== undefined;
  const matches = hasActualDimensions
    ? input.actualWidth === expectedWidth && input.actualHeight === expectedHeight
    : false;
  const warnings = createCanvasBackingWarnings(input, expectedWidth, expectedHeight, hasActualDimensions, matches);

  return {
    status: matches ? "supported" : "partial",
    cssWidth: input.cssWidth,
    cssHeight: input.cssHeight,
    devicePixelRatio: input.devicePixelRatio,
    expectedWidth,
    expectedHeight,
    ...(input.actualWidth !== undefined ? { actualWidth: input.actualWidth } : {}),
    ...(input.actualHeight !== undefined ? { actualHeight: input.actualHeight } : {}),
    ...(hasActualDimensions ? { effectiveDevicePixelRatio: round(input.actualWidth! / input.cssWidth) } : {}),
    backingStoreMatchesDisplay: matches,
    warnings
  };
}

export function evaluateRendererScreenshotConsistency(
  input: RendererScreenshotConsistencyInput
): RendererScreenshotConsistencyReport {
  assertPositiveInteger(input.width, "width");
  assertPositiveInteger(input.height, "height");
  assertPositiveInteger(input.expectedWidth, "expectedWidth");
  assertPositiveInteger(input.expectedHeight, "expectedHeight");
  assertPositiveInteger(input.byteLength, "byteLength");
  if (input.expectedByteLength !== undefined) assertPositiveInteger(input.expectedByteLength, "expectedByteLength");
  const expectedByteLength = input.expectedByteLength ?? input.expectedWidth * input.expectedHeight * 4;
  const dimensionsMatch = input.width === input.expectedWidth && input.height === input.expectedHeight;
  const bytesMatch = input.byteLength === expectedByteLength;
  const warnings: string[] = [];
  if (!dimensionsMatch) {
    warnings.push(`Screenshot readback ${input.width}x${input.height} does not match renderer backing store ${input.expectedWidth}x${input.expectedHeight}.`);
  }
  if (!bytesMatch) {
    warnings.push(`Screenshot byte length ${input.byteLength} does not match expected RGBA8 byte length ${expectedByteLength}.`);
  }
  warnings.push("Screenshot readback reports RGBA8 pixels; embedded PNG/ICC color profiles are not guaranteed by the renderer.");

  return {
    status: dimensionsMatch && bytesMatch ? "supported" : "partial",
    width: input.width,
    height: input.height,
    byteLength: input.byteLength,
    expectedWidth: input.expectedWidth,
    expectedHeight: input.expectedHeight,
    expectedByteLength,
    colorSpace: input.colorSpace ?? "srgb",
    pixelFormat: "rgba8",
    readbackMatchesBackingStore: dimensionsMatch && bytesMatch,
    colorProfileEmbedded: false,
    warnings
  };
}

export function evaluateRendererCaptureQuality(input: RendererCaptureQualityInput): RendererCaptureQualityReport {
  assertPositiveFinite(input.cssWidth, "cssWidth");
  assertPositiveFinite(input.cssHeight, "cssHeight");
  assertPositiveInteger(input.backingWidth, "backingWidth");
  assertPositiveInteger(input.backingHeight, "backingHeight");
  assertPositiveInteger(input.screenshotWidth, "screenshotWidth");
  assertPositiveInteger(input.screenshotHeight, "screenshotHeight");
  if (input.captureCssWidth !== undefined) assertPositiveFinite(input.captureCssWidth, "captureCssWidth");
  if (input.captureCssHeight !== undefined) assertPositiveFinite(input.captureCssHeight, "captureCssHeight");
  if (input.devicePixelRatio !== undefined) assertPositiveFinite(input.devicePixelRatio, "devicePixelRatio");
  if (input.minimumEffectiveDpr !== undefined) assertPositiveFinite(input.minimumEffectiveDpr, "minimumEffectiveDpr");

  const captureCssWidth = input.captureCssWidth ?? input.cssWidth;
  const captureCssHeight = input.captureCssHeight ?? input.cssHeight;
  const minimumEffectiveDpr = input.minimumEffectiveDpr ?? 1;
  const effectiveBackingDprX = input.backingWidth / input.cssWidth;
  const effectiveBackingDprY = input.backingHeight / input.cssHeight;
  const effectiveCaptureDprX = input.screenshotWidth / captureCssWidth;
  const effectiveCaptureDprY = input.screenshotHeight / captureCssHeight;
  const captureToBackingScaleX = effectiveCaptureDprX / effectiveBackingDprX;
  const captureToBackingScaleY = effectiveCaptureDprY / effectiveBackingDprY;
  const capturesFullCanvas = nearlyEqual(captureCssWidth, input.cssWidth) && nearlyEqual(captureCssHeight, input.cssHeight);
  const fullCanvasPixelMatch = capturesFullCanvas
    && input.screenshotWidth === input.backingWidth
    && input.screenshotHeight === input.backingHeight;
  const captureDownsamplesCanvas = captureToBackingScaleX < 0.98 || captureToBackingScaleY < 0.98;
  const captureUpscalesCanvas = captureToBackingScaleX > 1.02 || captureToBackingScaleY > 1.02;
  const meetsMinimumEffectiveDpr = effectiveBackingDprX >= minimumEffectiveDpr && effectiveBackingDprY >= minimumEffectiveDpr;
  const warnings = createCaptureQualityWarnings({
    ...input,
    captureCssWidth,
    captureCssHeight,
    minimumEffectiveDpr,
    effectiveBackingDprX,
    effectiveBackingDprY,
    effectiveCaptureDprX,
    effectiveCaptureDprY,
    captureDownsamplesCanvas,
    captureUpscalesCanvas,
    fullCanvasPixelMatch,
    capturesFullCanvas,
    meetsMinimumEffectiveDpr
  });

  return {
    status: warnings.length > 0 ? "partial" : "supported",
    ...(input.label ? { label: input.label } : {}),
    cssWidth: input.cssWidth,
    cssHeight: input.cssHeight,
    backingWidth: input.backingWidth,
    backingHeight: input.backingHeight,
    screenshotWidth: input.screenshotWidth,
    screenshotHeight: input.screenshotHeight,
    captureCssWidth,
    captureCssHeight,
    ...(input.devicePixelRatio !== undefined ? { devicePixelRatio: input.devicePixelRatio } : {}),
    minimumEffectiveDpr,
    effectiveBackingDprX: round(effectiveBackingDprX),
    effectiveBackingDprY: round(effectiveBackingDprY),
    effectiveCaptureDprX: round(effectiveCaptureDprX),
    effectiveCaptureDprY: round(effectiveCaptureDprY),
    captureToBackingScaleX: round(captureToBackingScaleX),
    captureToBackingScaleY: round(captureToBackingScaleY),
    capturesFullCanvas,
    fullCanvasPixelMatch,
    captureDownsamplesCanvas,
    captureUpscalesCanvas,
    meetsMinimumEffectiveDpr,
    warnings
  };
}

export function evaluateRendererFrameCadence(input: RendererFrameCadenceInput): RendererFrameCadenceReport {
  const targetFrameMs = input.targetFrameMs ?? 16.667;
  assertPositiveFinite(targetFrameMs, "targetFrameMs");
  if (input.renderMs !== undefined) assertNonNegativeFinite(input.renderMs, "renderMs");
  if (input.loopMs !== undefined) assertNonNegativeFinite(input.loopMs, "loopMs");
  if (input.frameIntervalMs !== undefined) assertNonNegativeFinite(input.frameIntervalMs, "frameIntervalMs");
  if (input.readbackMs !== undefined) assertNonNegativeFinite(input.readbackMs, "readbackMs");
  if (input.screenshotCaptureOverheadMs !== undefined) assertNonNegativeFinite(input.screenshotCaptureOverheadMs, "screenshotCaptureOverheadMs");
  if (input.sampleCount !== undefined) assertPositiveInteger(input.sampleCount, "sampleCount");

  const renderBudgetRatio = input.renderMs !== undefined ? input.renderMs / targetFrameMs : undefined;
  const loopBudgetRatio = input.loopMs !== undefined ? input.loopMs / targetFrameMs : undefined;
  const frameIntervalBudgetRatio = input.frameIntervalMs !== undefined ? input.frameIntervalMs / targetFrameMs : undefined;
  const readbackBudgetRatio = input.readbackMs !== undefined ? input.readbackMs / targetFrameMs : undefined;
  const captureOverheadFrames = input.screenshotCaptureOverheadMs !== undefined ? input.screenshotCaptureOverheadMs / targetFrameMs : undefined;
  const loopHeadroomMs = input.loopMs !== undefined ? targetFrameMs - input.loopMs : undefined;
  const warnings = createFrameCadenceWarnings({
    ...input,
    targetFrameMs,
    renderBudgetRatio,
    loopBudgetRatio,
    frameIntervalBudgetRatio,
    readbackBudgetRatio,
    captureOverheadFrames
  });

  return {
    status: warnings.length > 0 ? "partial" : "supported",
    targetFrameMs: round(targetFrameMs),
    ...(input.renderMs !== undefined ? { renderMs: round(input.renderMs) } : {}),
    ...(input.loopMs !== undefined ? { loopMs: round(input.loopMs) } : {}),
    ...(input.frameIntervalMs !== undefined ? { frameIntervalMs: round(input.frameIntervalMs) } : {}),
    ...(input.readbackMs !== undefined ? { readbackMs: round(input.readbackMs) } : {}),
    ...(input.screenshotCaptureOverheadMs !== undefined ? { screenshotCaptureOverheadMs: round(input.screenshotCaptureOverheadMs) } : {}),
    ...(input.sampleCount !== undefined ? { sampleCount: input.sampleCount } : {}),
    ...(renderBudgetRatio !== undefined ? { renderBudgetRatio: round(renderBudgetRatio) } : {}),
    ...(loopBudgetRatio !== undefined ? { loopBudgetRatio: round(loopBudgetRatio) } : {}),
    ...(frameIntervalBudgetRatio !== undefined ? { frameIntervalBudgetRatio: round(frameIntervalBudgetRatio) } : {}),
    ...(readbackBudgetRatio !== undefined ? { readbackBudgetRatio: round(readbackBudgetRatio) } : {}),
    ...(captureOverheadFrames !== undefined ? { captureOverheadFrames: round(captureOverheadFrames) } : {}),
    ...(loopHeadroomMs !== undefined ? { loopHeadroomMs: round(loopHeadroomMs) } : {}),
    stableForCapture: warnings.length === 0,
    warnings
  };
}

function normalizePostprocess(
  postprocess: RendererVisualPipelineReportOptions["postprocess"]
): RendererVisualPostprocessDescriptor | undefined {
  if (postprocess === undefined || postprocess === false) return undefined;
  if (postprocess === true) return {};
  return postprocess;
}

function collectPostprocessPassNames(postprocess: RendererVisualPostprocessDescriptor): readonly RendererVisualPostprocessPassName[] {
  const passes: RendererVisualPostprocessPassName[] = [];
  if (postprocess.bloom) passes.push("bloom");
  if (postprocess.toneMapping !== false) passes.push("tone-mapping");
  if (postprocess.colorGrade) passes.push("color-grade");
  if (postprocess.chromaticAberration) passes.push("chromatic-aberration");
  if (postprocess.filmGrain) passes.push("film-grain");
  if (postprocess.depthOfField) passes.push("depth-of-field");
  if (postprocess.motionBlur) passes.push("motion-blur");
  if (postprocess.contactShadow) passes.push("contact-shadow");
  if (postprocess.ssao) passes.push("ssao");
  if (postprocess.ssr) passes.push("ssr");
  if (postprocess.taa) passes.push("taa");
  if (postprocess.outline) passes.push("outline");
  if (postprocess.fxaa) passes.push("fxaa");
  return passes;
}

function resolvePostprocessTargetFormat(
  capabilities: ReadonlySet<RenderDeviceCapability>,
  postprocess: RendererVisualPostprocessDescriptor
): RendererVisualTargetFormat {
  if (postprocess.targetFormat) return postprocess.targetFormat;
  if (postprocess.toneMapping === false) return "rgba8";
  return capabilities.has("hdr-render-targets") ? "rgba16f" : "rgba8";
}

function createHdrTargetReport(
  capabilities: ReadonlySet<RenderDeviceCapability>,
  targetFormat: RendererVisualTargetFormat,
  toneMapping: ToneMappingOptions | false | undefined
): RendererVisualHdrTargetReport {
  const requested = HDR_FORMATS.includes(targetFormat);
  const capabilityAdvertised = capabilities.has("hdr-render-targets");
  const warnings: string[] = [];
  if (requested && !capabilityAdvertised) {
    warnings.push(`HDR postprocess target ${targetFormat} was requested, but the backend does not advertise hdr-render-targets.`);
  }
  if (requested && toneMapping === false) {
    warnings.push(`HDR postprocess target ${targetFormat} requires tone mapping before RGBA8 presentation.`);
  }

  return {
    status: warnings.length > 0 ? "unsupported" : "supported",
    requested,
    supportedByBackend: !requested || capabilityAdvertised,
    capabilityAdvertised,
    targetFormat,
    ...(requested && !capabilityAdvertised ? { fallbackFormat: "rgba8" } : {}),
    toneMappingRequired: requested,
    warnings
  };
}

function createToneMappingReport(
  postprocess: RendererVisualPostprocessDescriptor | undefined,
  targetFormat: RendererVisualTargetFormat
): RendererVisualToneMappingReport {
  const availablePresets = listExternalParityToneMappingPresets().map((preset) => preset.name);
  if (!postprocess || postprocess.toneMapping === false) {
    const warnings = HDR_FORMATS.includes(targetFormat)
      ? [`HDR target ${targetFormat} cannot be presented honestly without tone mapping.`]
      : [];
    return {
      status: warnings.length > 0 ? "unsupported" : "supported",
      enabled: false,
      availablePresets,
      warnings
    };
  }

  const options = postprocess.toneMapping ?? {};
  const resolved = {
    exposure: options.exposure ?? 1,
    whitePoint: options.whitePoint ?? 1,
    gamma: options.gamma ?? 2.2,
    operator: options.operator ?? "reinhard",
    inputColorSpace: options.inputColorSpace ?? "linear",
    outputColorSpace: options.outputColorSpace ?? "srgb"
  } satisfies Required<ToneMappingOptions>;
  const warnings: string[] = [];
  if (resolved.outputColorSpace !== "srgb") {
    warnings.push(`Tone mapping outputColorSpace is ${resolved.outputColorSpace}; screenshot and browser presentation consistency is strongest with srgb.`);
  }

  return {
    status: warnings.length > 0 ? "partial" : "supported",
    enabled: true,
    operator: resolved.operator,
    exposure: resolved.exposure,
    whitePoint: resolved.whitePoint,
    gamma: resolved.gamma,
    inputColorSpace: resolved.inputColorSpace,
    outputColorSpace: resolved.outputColorSpace,
    calibration: createToneMappingCalibration(resolved),
    availablePresets,
    warnings
  };
}

function createPostprocessReport(options: {
  readonly enabled: boolean;
  readonly passNames: readonly RendererVisualPostprocessPassName[];
  readonly targetFormat: RendererVisualTargetFormat;
  readonly plan?: RendererPostprocessPlanDiagnostics;
  readonly width: number;
  readonly height: number;
  readonly presentationColorSpace: A3DColorSpace;
  readonly hdrTargetStatus: RendererVisualPipelineStatus;
  readonly toneMappingStatus: RendererVisualPipelineStatus;
}): RendererVisualPostprocessReport {
  const warnings: string[] = [];
  if (options.enabled && options.passNames.length === 0) {
    warnings.push("Postprocess is enabled with no passes; renderer will copy/present the forward target without color changes.");
  }
  if (options.plan && options.plan.missingInputs.length > 0) {
    warnings.push(`Postprocess plan is missing required inputs: ${options.plan.missingInputs.join(", ")}.`);
  }
  if (options.hdrTargetStatus === "unsupported" || options.toneMappingStatus === "unsupported") {
    warnings.push("Postprocess plan is not executable as requested; renderer guards will reject unsupported HDR presentation.");
  }
  const executionMode = options.plan?.executionMode ?? "none";

  return {
    status: combineStatuses([
      options.hdrTargetStatus,
      options.toneMappingStatus,
      warnings.length > 0 ? "partial" : "supported"
    ]),
    enabled: options.enabled,
    passNames: options.passNames,
    targetFormat: options.targetFormat,
    sourceTargetFormat: options.plan?.sourceTargetFormat ?? options.targetFormat,
    executionMode,
    nativePresentation: executionMode === "renderer-owned-fused-ldr-native",
    usesReadback: (options.plan?.readbackPassNames.length ?? 0) > 0,
    missingInputs: options.plan?.missingInputs ?? [],
    readbackPassNames: options.plan?.readbackPassNames ?? [],
    rendererOwnedPassNames: options.plan?.rendererOwnedPassNames ?? [],
    clarityWarnings: options.plan?.clarityWarnings ?? [],
    forwardOutputColorSpace: options.enabled ? "linear" : "srgb",
    presentationColorSpace: options.presentationColorSpace,
    renderTargetWidth: options.width,
    renderTargetHeight: options.height,
    ...(options.plan ? { plan: options.plan } : {}),
    warnings
  };
}

function combineStatuses(statuses: readonly (RendererVisualPipelineStatus | undefined)[]): RendererVisualPipelineStatus {
  if (statuses.includes("unsupported")) return "unsupported";
  if (statuses.includes("partial")) return "partial";
  return "supported";
}

function createCanvasBackingWarnings(
  input: RendererCanvasBackingInput,
  expectedWidth: number,
  expectedHeight: number,
  hasActualDimensions: boolean,
  matches: boolean
): readonly string[] {
  if (!hasActualDimensions) {
    return [`Canvas backing store dimensions were not provided; expected ${expectedWidth}x${expectedHeight} for CSS ${input.cssWidth}x${input.cssHeight} at DPR ${input.devicePixelRatio}.`];
  }
  if (!matches) {
    return [`Canvas backing store ${input.actualWidth}x${input.actualHeight} does not match CSS ${input.cssWidth}x${input.cssHeight} at DPR ${input.devicePixelRatio}; expected ${expectedWidth}x${expectedHeight}.`];
  }
  return [];
}

function createCaptureQualityWarnings(input: RendererCaptureQualityInput & {
  readonly captureCssWidth: number;
  readonly captureCssHeight: number;
  readonly minimumEffectiveDpr: number;
  readonly effectiveBackingDprX: number;
  readonly effectiveBackingDprY: number;
  readonly effectiveCaptureDprX: number;
  readonly effectiveCaptureDprY: number;
  readonly captureDownsamplesCanvas: boolean;
  readonly captureUpscalesCanvas: boolean;
  readonly fullCanvasPixelMatch: boolean;
  readonly capturesFullCanvas: boolean;
  readonly meetsMinimumEffectiveDpr: boolean;
}): readonly string[] {
  const warnings: string[] = [];
  if (!input.meetsMinimumEffectiveDpr) {
    warnings.push(`Canvas backing DPR ${round(input.effectiveBackingDprX)}x${round(input.effectiveBackingDprY)} is below the requested minimum ${input.minimumEffectiveDpr}.`);
  }
  if (input.devicePixelRatio !== undefined && (input.effectiveBackingDprX < input.devicePixelRatio * 0.98 || input.effectiveBackingDprY < input.devicePixelRatio * 0.98)) {
    warnings.push(`Canvas backing DPR ${round(input.effectiveBackingDprX)}x${round(input.effectiveBackingDprY)} is below devicePixelRatio ${input.devicePixelRatio}; a max-edge clamp or resize mismatch may be reducing effective capture detail.`);
  }
  if (input.captureDownsamplesCanvas) {
    warnings.push(`Screenshot capture DPR ${round(input.effectiveCaptureDprX)}x${round(input.effectiveCaptureDprY)} is below canvas backing DPR ${round(input.effectiveBackingDprX)}x${round(input.effectiveBackingDprY)}; browser capture is downsampling renderer detail.`);
  }
  if (input.captureUpscalesCanvas) {
    warnings.push(`Screenshot capture DPR ${round(input.effectiveCaptureDprX)}x${round(input.effectiveCaptureDprY)} is above canvas backing DPR ${round(input.effectiveBackingDprX)}x${round(input.effectiveBackingDprY)}; screenshot pixels may be upscaled from renderer output.`);
  }
  if (input.capturesFullCanvas && !input.fullCanvasPixelMatch) {
    warnings.push(`Full-canvas screenshot ${input.screenshotWidth}x${input.screenshotHeight} does not match canvas backing ${input.backingWidth}x${input.backingHeight}.`);
  }
  return warnings;
}

function createFrameCadenceWarnings(input: RendererFrameCadenceInput & {
  readonly targetFrameMs: number;
  readonly renderBudgetRatio?: number;
  readonly loopBudgetRatio?: number;
  readonly frameIntervalBudgetRatio?: number;
  readonly readbackBudgetRatio?: number;
  readonly captureOverheadFrames?: number;
}): readonly string[] {
  const warnings: string[] = [];
  if (input.renderBudgetRatio !== undefined && input.renderBudgetRatio > 1) {
    warnings.push(`Render work ${round(input.renderBudgetRatio)}x exceeds the ${round(input.targetFrameMs)}ms frame budget.`);
  }
  if (input.loopBudgetRatio !== undefined && input.loopBudgetRatio > 1) {
    warnings.push(`Total loop work ${round(input.loopBudgetRatio)}x exceeds the ${round(input.targetFrameMs)}ms frame budget.`);
  }
  if (input.frameIntervalBudgetRatio !== undefined && input.frameIntervalBudgetRatio > 1.25) {
    warnings.push(`Observed frame interval ${round(input.frameIntervalBudgetRatio)}x exceeds the target cadence; capture may land on a stalled frame.`);
  }
  if (input.readbackBudgetRatio !== undefined && input.readbackBudgetRatio > 0.5) {
    warnings.push(`Readback cost ${round(input.readbackBudgetRatio)}x of the frame budget can affect capture cadence.`);
  }
  if (input.captureOverheadFrames !== undefined && input.captureOverheadFrames > 1) {
    warnings.push(`Screenshot capture overhead spans ${round(input.captureOverheadFrames)} frame budgets; visual review captures may include stall artifacts.`);
  }
  return warnings;
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.001;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
