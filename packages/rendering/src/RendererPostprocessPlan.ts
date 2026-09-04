import type {
  BloomOptions,
  ChromaticAberrationOptions,
  ColorGradeOptions,
  ContactShadowPostProcessOptions,
  DepthOfFieldOptions,
  FXAAOptions,
  FilmGrainOptions,
  MotionBlurOptions,
  OutlineOptions,
  SSAOOptions,
  SSROptions,
  TAAOptions,
  ToneMappingOptions,
  VolumetricLightOptions
} from "./PostProcessPass";

export type RendererPostprocessTargetFormat = "rgba8" | "rgba16f" | "rgba32f";

export interface RendererPostprocessPlanOptions {
  /**
   * `cpu-deterministic` keeps the public byte kernels as an explicit reference
   * path for fixtures and reproducible diagnostics. `auto` prefers native GPU
   * presentation when the active device supports every requested pass.
   */
  readonly execution?: "auto" | "cpu-deterministic";
  readonly toneMapping?: ToneMappingOptions | false;
  readonly colorGrade?: ColorGradeOptions | boolean;
  readonly bloom?: BloomOptions | boolean;
  readonly chromaticAberration?: ChromaticAberrationOptions | boolean;
  readonly filmGrain?: FilmGrainOptions | boolean;
  readonly volumetricLight?: VolumetricLightOptions | false;
  readonly depthOfField?: DepthOfFieldOptions | false;
  readonly motionBlur?: MotionBlurOptions | false;
  readonly contactShadow?: ContactShadowPostProcessOptions | false;
  readonly ssao?: SSAOOptions | false;
  readonly ssr?: SSROptions | false;
  readonly taa?: TAAOptions | false;
  readonly outline?: OutlineOptions | boolean;
  readonly fxaa?: FXAAOptions | boolean;
}

export type RendererPostProcessPassName =
  | "tone-mapping"
  | "color-grade"
  | "bloom"
  | "chromatic-aberration"
  | "film-grain"
  | "volumetric-light"
  | "depth-of-field"
  | "motion-blur"
  | "contact-shadow"
  | "ssao"
  | "ssr"
  | "taa"
  | "outline"
  | "fxaa";

export interface RendererPostProcessPassPlan {
  readonly name: RendererPostProcessPassName;
  readonly options:
    | ToneMappingOptions
    | ColorGradeOptions
    | BloomOptions
    | ChromaticAberrationOptions
    | FilmGrainOptions
    | VolumetricLightOptions
    | DepthOfFieldOptions
    | MotionBlurOptions
    | ContactShadowPostProcessOptions
    | SSAOOptions
    | SSROptions
    | TAAOptions
    | OutlineOptions
    | FXAAOptions;
}

export type RendererPostprocessExecutionMode =
  | "none"
  | "renderer-owned-fused-ldr-native"
  | "renderer-owned-fused-ldr-readback"
  | "renderer-owned-pass-chain-readback";

export interface RendererPostprocessPlanContext {
  readonly sourceTargetFormat?: RendererPostprocessTargetFormat;
  readonly targetFormat?: RendererPostprocessTargetFormat;
  readonly rendererDepthAvailable?: boolean;
  readonly nativeLdrPostprocess?: boolean;
  /** Frame width in pixels. Feeds the chain cost estimate; omit when unknown. */
  readonly width?: number;
  /** Frame height in pixels. Feeds the chain cost estimate; omit when unknown. */
  readonly height?: number;
}

export interface RendererPostprocessPassDiagnostics {
  readonly name: RendererPostProcessPassName;
  readonly rendererOwned: true;
  readonly publicPixelKernel: boolean;
  readonly requiresDepth: boolean;
  readonly hasDepthInput: boolean;
  readonly usesRendererOwnedDepth: boolean;
  readonly requiresNormals: boolean;
  readonly hasNormalsInput: boolean;
  readonly requiresHistory: boolean;
  readonly hasHistoryInput: boolean;
  readonly requiresVelocity: boolean;
  readonly hasVelocityInput: boolean;
  /**
   * Fail-closed submission flag: false when this pass has named entries in
   * `missingInputs`. A non-submitted pass contributes no pixels.
   */
  readonly submitted: boolean;
  /** True when the pass is submitted with every required input pixel-backed. */
  readonly pixelBacked: boolean;
  /** Named missing inputs for this pass, e.g. `"ssao:normals"`. */
  readonly missingInputs: readonly string[];
  readonly usesReadback: boolean;
}

export interface RendererPostprocessPlannedVsActual {
  /** Every pass requested by the caller, in plan order. */
  readonly requested: readonly RendererPostProcessPassName[];
  /** Requested passes with all required inputs bound (fail-closed remainder). */
  readonly submitted: readonly RendererPostProcessPassName[];
  /** Submitted passes whose inputs are pixel-backed this frame. */
  readonly pixelBacked: readonly RendererPostProcessPassName[];
  /** Requested passes withheld for missing inputs. */
  readonly dropped: readonly RendererPostProcessPassName[];
  readonly missingInputs: readonly string[];
}

export interface RendererPostprocessChainCostEstimate {
  readonly bytesPerPixel: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameBytes: number;
  readonly requestedPasses: number;
  readonly submittedPasses: number;
  /** Upper-bound owned targets for the readback chain (one per submitted pass). */
  readonly estimatedTargets: number;
  /** Upper-bound chain bytes: targets x frame bytes (targets x bytes x passes). */
  readonly estimatedBytes: number;
  /** True when the cinematic chain should warn before it ships. */
  readonly warns: boolean;
  readonly warning: string | null;
}

export interface RendererPostprocessPlanDiagnostics {
  readonly source: "Renderer.postprocessPlan";
  readonly passCount: number;
  readonly passNames: readonly RendererPostProcessPassName[];
  readonly targetFormat: RendererPostprocessTargetFormat;
  readonly sourceTargetFormat: RendererPostprocessTargetFormat;
  readonly executionMode: RendererPostprocessExecutionMode;
  readonly canFuseLdr: boolean;
  readonly requiresDepthTexture: boolean;
  readonly missingInputs: readonly string[];
  readonly readbackPassNames: readonly RendererPostProcessPassName[];
  readonly rendererOwnedPassNames: readonly RendererPostProcessPassName[];
  readonly requestedPassNames: readonly RendererPostProcessPassName[];
  readonly submittedPassNames: readonly RendererPostProcessPassName[];
  readonly pixelBackedPassNames: readonly RendererPostProcessPassName[];
  readonly plannedVsActual: RendererPostprocessPlannedVsActual;
  readonly costEstimate: RendererPostprocessChainCostEstimate;
  readonly clarityWarnings: readonly string[];
  readonly passes: readonly RendererPostprocessPassDiagnostics[];
  readonly claimBoundary: string;
}

export function createRendererPostprocessPasses(postprocess: RendererPostprocessPlanOptions): readonly RendererPostProcessPassPlan[] {
  const passes: RendererPostProcessPassPlan[] = [];
  if (postprocess.bloom) {
    passes.push({ name: "bloom", options: postprocess.bloom === true ? {} : postprocess.bloom });
  }
  if (postprocess.toneMapping !== false) {
    passes.push({ name: "tone-mapping", options: postprocess.toneMapping ?? {} });
  }
  if (postprocess.volumetricLight) {
    passes.push({ name: "volumetric-light", options: postprocess.volumetricLight });
  }
  if (postprocess.colorGrade) {
    passes.push({ name: "color-grade", options: postprocess.colorGrade === true ? {} : postprocess.colorGrade });
  }
  if (postprocess.chromaticAberration) {
    passes.push({ name: "chromatic-aberration", options: postprocess.chromaticAberration === true ? {} : postprocess.chromaticAberration });
  }
  if (postprocess.filmGrain) {
    passes.push({ name: "film-grain", options: postprocess.filmGrain === true ? {} : postprocess.filmGrain });
  }
  if (postprocess.depthOfField) {
    passes.push({ name: "depth-of-field", options: postprocess.depthOfField });
  }
  if (postprocess.motionBlur) {
    passes.push({ name: "motion-blur", options: postprocess.motionBlur });
  }
  if (postprocess.contactShadow) {
    passes.push({ name: "contact-shadow", options: postprocess.contactShadow });
  }
  if (postprocess.ssao) {
    passes.push({ name: "ssao", options: postprocess.ssao });
  }
  if (postprocess.ssr) {
    passes.push({ name: "ssr", options: postprocess.ssr });
  }
  if (postprocess.taa) {
    passes.push({ name: "taa", options: postprocess.taa });
  }
  if (postprocess.outline) {
    passes.push({ name: "outline", options: postprocess.outline === true ? {} : postprocess.outline });
  }
  if (postprocess.fxaa) {
    passes.push({ name: "fxaa", options: postprocess.fxaa === true ? {} : postprocess.fxaa });
  }
  return passes;
}

export function createRendererPostprocessPlanDiagnostics(
  postprocess: RendererPostprocessPlanOptions,
  context: RendererPostprocessPlanContext = {}
): RendererPostprocessPlanDiagnostics {
  const passes = createRendererPostprocessPasses(postprocess);
  const sourceTargetFormat = context.sourceTargetFormat ?? context.targetFormat ?? "rgba8";
  const targetFormat = context.targetFormat ?? sourceTargetFormat;
  const forceCpuDeterministic = postprocess.execution === "cpu-deterministic";
  const requiresNativeSpatialPass = passes.some((pass) => pass.name === "volumetric-light" || pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa");
  const canFuseLdr = canFuseLdrPostprocessPlan(sourceTargetFormat, passes, context.nativeLdrPostprocess === true)
    && (forceCpuDeterministic || context.nativeLdrPostprocess === true || !requiresNativeSpatialPass);
  const executionMode = passes.length === 0
    ? "none"
    : canFuseLdr
      ? context.nativeLdrPostprocess && !forceCpuDeterministic
        ? "renderer-owned-fused-ldr-native"
        : "renderer-owned-fused-ldr-readback"
      : "renderer-owned-pass-chain-readback";
  const missingInputs = missingPostprocessInputs(passes, context);
  const passDiagnostics = passes.map((pass): RendererPostprocessPassDiagnostics => {
    const requiresDepth = isDepthPostprocessPassName(pass.name);
    const hasDepthInput = requiresDepth && postprocessPassHasDepth(pass.options);
    const usesRendererOwnedDepth = requiresDepth && !hasDepthInput && context.rendererDepthAvailable === true;
    const requiresNormals = isNormalsPostprocessPassName(pass.name);
    const hasNormalsInput = requiresNormals && postprocessPassHasNormals(pass.options);
    const requiresHistory = isHistoryPostprocessPassName(pass.name);
    const hasHistoryInput = requiresHistory && postprocessPassHasHistory(pass.options);
    const requiresVelocity = isVelocityPostprocessPassName(pass.name);
    const hasVelocityInput = requiresVelocity && postprocessPassHasVelocity(pass.options);
    const passMissingInputs = missingPostprocessPassInputs(pass, context);
    const submitted = passMissingInputs.length === 0;
    return {
      name: pass.name,
      rendererOwned: true,
      publicPixelKernel: true,
      requiresDepth,
      hasDepthInput,
      usesRendererOwnedDepth,
      requiresNormals,
      hasNormalsInput,
      requiresHistory,
      hasHistoryInput,
      requiresVelocity,
      hasVelocityInput,
      submitted,
      pixelBacked: submitted,
      missingInputs: passMissingInputs,
      usesReadback: executionMode !== "renderer-owned-fused-ldr-native"
    };
  });
  const requestedPassNames = passes.map((pass) => pass.name);
  const submittedPassNames = passDiagnostics.filter((pass) => pass.submitted).map((pass) => pass.name);
  const pixelBackedPassNames = passDiagnostics.filter((pass) => pass.pixelBacked).map((pass) => pass.name);
  const plannedVsActual: RendererPostprocessPlannedVsActual = {
    requested: requestedPassNames,
    submitted: submittedPassNames,
    pixelBacked: pixelBackedPassNames,
    dropped: passDiagnostics.filter((pass) => !pass.submitted).map((pass) => pass.name),
    missingInputs
  };
  const costEstimate = estimatePostprocessChainCost(targetFormat, context, passes.length, submittedPassNames.length);
  const clarityWarnings = postprocessClarityWarnings(postprocess, passes, executionMode, costEstimate);
  return {
    source: "Renderer.postprocessPlan",
    passCount: passes.length,
    passNames: requestedPassNames,
    targetFormat,
    sourceTargetFormat,
    executionMode,
    canFuseLdr,
    requiresDepthTexture: passes.some((pass) => isDepthPostprocessPassName(pass.name) && !postprocessPassHasDepth(pass.options)),
    missingInputs,
    readbackPassNames: executionMode === "renderer-owned-fused-ldr-native" ? [] : passes.map((pass) => pass.name),
    rendererOwnedPassNames: passes.map((pass) => pass.name),
    requestedPassNames,
    submittedPassNames,
    pixelBackedPassNames,
    plannedVsActual,
    costEstimate,
    clarityWarnings,
    passes: passDiagnostics,
    claimBoundary: "This plan describes the renderer-owned postprocess pass chain for the current frame. It does not prove EffectComposer parity, LUT/AOV layers, temporal accumulation, or missing depth/velocity/normals/history inputs unless the report explicitly shows those inputs."
  };
}

function canFuseLdrPostprocessPlan(sourceTargetFormat: RendererPostprocessTargetFormat, passes: readonly RendererPostProcessPassPlan[], nativePostprocess: boolean): boolean {
  return passes.length > 0
    && (sourceTargetFormat === "rgba8" || passes[0]?.name === "tone-mapping" || (nativePostprocess && passes[0]?.name === "bloom" && passes[1]?.name === "tone-mapping"))
    && passes.every((pass) => pass.name === "bloom" || pass.name === "tone-mapping" || pass.name === "color-grade" || pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa" || pass.name === "outline" || pass.name === "fxaa")
    && passes.every((pass, index) => {
      const previousRank = index === 0 ? -1 : ldrFusionPassRank(passes[index - 1]!.name);
      return ldrFusionPassRank(pass.name) >= previousRank;
    });
}

function ldrFusionPassRank(name: RendererPostProcessPassName): number {
  if (name === "bloom") return -1;
  if (name === "tone-mapping") return 0;
  if (name === "color-grade") return 1;
  if (name === "depth-of-field") return 2;
  if (name === "motion-blur") return 3;
  if (name === "ssao") return 4;
  if (name === "ssr") return 5;
  if (name === "taa") return 6;
  if (name === "outline") return 7;
  if (name === "fxaa") return 8;
  return Number.POSITIVE_INFINITY;
}

function isDepthPostprocessPassName(name: RendererPostProcessPassName): boolean {
  return name === "volumetric-light" || name === "depth-of-field" || name === "contact-shadow" || name === "ssao" || name === "ssr";
}

function isNormalsPostprocessPassName(name: RendererPostProcessPassName): boolean {
  return name === "ssao" || name === "ssr";
}

function isHistoryPostprocessPassName(name: RendererPostProcessPassName): boolean {
  return name === "taa";
}

function isVelocityPostprocessPassName(name: RendererPostProcessPassName): boolean {
  return name === "motion-blur" || name === "taa";
}

function postprocessPassHasDepth(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "depth" in options && Boolean((options as { readonly depth?: unknown }).depth);
}

function postprocessPassHasNormals(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "normals" in options && Boolean((options as { readonly normals?: unknown }).normals);
}

function postprocessPassHasHistory(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "history" in options && Boolean((options as { readonly history?: unknown }).history);
}

function postprocessPassHasVelocity(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "velocity" in options && Boolean((options as { readonly velocity?: unknown }).velocity);
}

function missingPostprocessPassInputs(
  pass: RendererPostProcessPassPlan,
  context: RendererPostprocessPlanContext
): string[] {
  const missing: string[] = [];
  if (isDepthPostprocessPassName(pass.name) && !postprocessPassHasDepth(pass.options) && context.rendererDepthAvailable !== true) {
    missing.push(`${pass.name}:depth`);
  }
  if (isNormalsPostprocessPassName(pass.name) && !postprocessPassHasNormals(pass.options)) {
    missing.push(`${pass.name}:normals`);
  }
  if (isHistoryPostprocessPassName(pass.name) && !postprocessPassHasHistory(pass.options)) {
    missing.push(`${pass.name}:history`);
  }
  if (isVelocityPostprocessPassName(pass.name) && !postprocessPassHasVelocity(pass.options)) {
    missing.push(`${pass.name}:velocity`);
  }
  return missing;
}

function missingPostprocessInputs(
  passes: readonly RendererPostProcessPassPlan[],
  context: RendererPostprocessPlanContext
): string[] {
  const missing: string[] = [];
  for (const pass of passes) {
    missing.push(...missingPostprocessPassInputs(pass, context));
  }
  return missing;
}

function postprocessTargetBytesPerPixel(targetFormat: RendererPostprocessTargetFormat): number {
  if (targetFormat === "rgba32f") return 16;
  if (targetFormat === "rgba16f") return 8;
  return 4;
}

/** Warn above 16 MiB of upper-bound chain bytes so cinematic chains warn before they ship. */
const POSTPROCESS_CHAIN_COST_WARN_BYTES = 16 * 1024 * 1024;

function estimatePostprocessChainCost(
  targetFormat: RendererPostprocessTargetFormat,
  context: RendererPostprocessPlanContext,
  requestedPasses: number,
  submittedPasses: number
): RendererPostprocessChainCostEstimate {
  const bytesPerPixel = postprocessTargetBytesPerPixel(targetFormat);
  const frameWidth = context.width ?? 0;
  const frameHeight = context.height ?? 0;
  const frameBytes = frameWidth * frameHeight * bytesPerPixel;
  const estimatedTargets = submittedPasses;
  const estimatedBytes = estimatedTargets * frameBytes;
  const warns = estimatedBytes > POSTPROCESS_CHAIN_COST_WARN_BYTES;
  return {
    bytesPerPixel,
    frameWidth,
    frameHeight,
    frameBytes,
    requestedPasses,
    submittedPasses,
    estimatedTargets,
    estimatedBytes,
    warns,
    warning: warns
      ? `chain-cost-risk estimatedBytes=${estimatedBytes} targets=${estimatedTargets} passes=${submittedPasses}/${requestedPasses}`
      : null
  };
}

function postprocessClarityWarnings(
  postprocess: RendererPostprocessPlanOptions,
  passes: readonly RendererPostProcessPassPlan[],
  executionMode: RendererPostprocessExecutionMode,
  costEstimate: RendererPostprocessChainCostEstimate
): string[] {
  const warnings: string[] = [];
  const bloom = typeof postprocess.bloom === "object" && postprocess.bloom !== null ? postprocess.bloom : undefined;
  if (bloom) {
    const threshold = bloom.threshold ?? 0.75;
    const intensity = bloom.intensity ?? 0.35;
    const radius = bloom.radius ?? 1;
    if (threshold < 0.48 || intensity > 0.62 || radius > 3) {
      warnings.push(`bloom-noise-risk threshold=${round3(threshold)} intensity=${round3(intensity)} radius=${round3(radius)}`);
    }
  }
  const filmGrain = typeof postprocess.filmGrain === "object" && postprocess.filmGrain !== null ? postprocess.filmGrain : undefined;
  if (filmGrain && (filmGrain.intensity ?? 0.08) >= 0.06) {
    warnings.push(`film-grain-noise-risk intensity=${round3(filmGrain.intensity ?? 0.08)}`);
  }
  if (executionMode === "renderer-owned-pass-chain-readback" && passes.length > 2) {
    warnings.push("multi-pass-readback-cost");
  }
  if (costEstimate.warns && costEstimate.warning) {
    warnings.push(costEstimate.warning);
  }
  return warnings;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
