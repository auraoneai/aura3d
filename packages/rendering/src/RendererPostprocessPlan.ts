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
  ToneMappingOptions
} from "./PostProcessPass";

export type RendererPostprocessTargetFormat = "rgba8" | "rgba16f" | "rgba32f";

export interface RendererPostprocessPlanOptions {
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

export type RendererPostProcessPassName =
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

export interface RendererPostProcessPassPlan {
  readonly name: RendererPostProcessPassName;
  readonly options:
    | ToneMappingOptions
    | ColorGradeOptions
    | BloomOptions
    | ChromaticAberrationOptions
    | FilmGrainOptions
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
}

export interface RendererPostprocessPassDiagnostics {
  readonly name: RendererPostProcessPassName;
  readonly rendererOwned: true;
  readonly publicPixelKernel: boolean;
  readonly requiresDepth: boolean;
  readonly hasDepthInput: boolean;
  readonly usesRendererOwnedDepth: boolean;
  readonly requiresVelocity: boolean;
  readonly hasVelocityInput: boolean;
  readonly usesReadback: boolean;
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
  const canFuseLdr = canFuseLdrPostprocessPlan(sourceTargetFormat, passes);
  const executionMode = passes.length === 0
    ? "none"
    : canFuseLdr
      ? context.nativeLdrPostprocess
        ? "renderer-owned-fused-ldr-native"
        : "renderer-owned-fused-ldr-readback"
      : "renderer-owned-pass-chain-readback";
  const missingInputs = missingPostprocessInputs(passes, context);
  const clarityWarnings = postprocessClarityWarnings(postprocess, passes, executionMode);
  const passDiagnostics = passes.map((pass): RendererPostprocessPassDiagnostics => {
    const requiresDepth = isDepthPostprocessPassName(pass.name);
    const hasDepthInput = requiresDepth && postprocessPassHasDepth(pass.options);
    const usesRendererOwnedDepth = requiresDepth && !hasDepthInput && context.rendererDepthAvailable === true;
    const requiresVelocity = pass.name === "motion-blur";
    const hasVelocityInput = requiresVelocity && postprocessPassHasVelocity(pass.options);
    return {
      name: pass.name,
      rendererOwned: true,
      publicPixelKernel: true,
      requiresDepth,
      hasDepthInput,
      usesRendererOwnedDepth,
      requiresVelocity,
      hasVelocityInput,
      usesReadback: executionMode !== "renderer-owned-fused-ldr-native"
    };
  });
  return {
    source: "Renderer.postprocessPlan",
    passCount: passes.length,
    passNames: passes.map((pass) => pass.name),
    targetFormat,
    sourceTargetFormat,
    executionMode,
    canFuseLdr,
    requiresDepthTexture: passes.some((pass) => isDepthPostprocessPassName(pass.name) && !postprocessPassHasDepth(pass.options)),
    missingInputs,
    readbackPassNames: executionMode === "renderer-owned-fused-ldr-native" ? [] : passes.map((pass) => pass.name),
    rendererOwnedPassNames: passes.map((pass) => pass.name),
    clarityWarnings,
    passes: passDiagnostics,
    claimBoundary: "This plan describes the renderer-owned postprocess pass chain for the current frame. It does not prove EffectComposer parity, LUT/AOV layers, temporal accumulation, or missing depth/velocity inputs unless the report explicitly shows those inputs."
  };
}

function canFuseLdrPostprocessPlan(sourceTargetFormat: RendererPostprocessTargetFormat, passes: readonly RendererPostProcessPassPlan[]): boolean {
  return passes.length > 1
    && (sourceTargetFormat === "rgba8" || passes[0]?.name === "tone-mapping")
    && passes.every((pass) => pass.name === "tone-mapping" || pass.name === "color-grade" || pass.name === "fxaa")
    && passes.every((pass, index) => {
      const previousRank = index === 0 ? -1 : ldrFusionPassRank(passes[index - 1]!.name);
      return ldrFusionPassRank(pass.name) >= previousRank;
    });
}

function ldrFusionPassRank(name: RendererPostProcessPassName): number {
  if (name === "tone-mapping") return 0;
  if (name === "color-grade") return 1;
  if (name === "fxaa") return 2;
  return Number.POSITIVE_INFINITY;
}

function isDepthPostprocessPassName(name: RendererPostProcessPassName): boolean {
  return name === "depth-of-field" || name === "contact-shadow" || name === "ssao" || name === "ssr";
}

function postprocessPassHasDepth(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "depth" in options && Boolean((options as { readonly depth?: unknown }).depth);
}

function postprocessPassHasVelocity(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "velocity" in options && Boolean((options as { readonly velocity?: unknown }).velocity);
}

function missingPostprocessInputs(
  passes: readonly RendererPostProcessPassPlan[],
  context: RendererPostprocessPlanContext
): string[] {
  const missing: string[] = [];
  for (const pass of passes) {
    if (isDepthPostprocessPassName(pass.name) && !postprocessPassHasDepth(pass.options) && context.rendererDepthAvailable !== true) {
      missing.push(`${pass.name}:depth`);
    }
    if (pass.name === "motion-blur" && !postprocessPassHasVelocity(pass.options)) {
      missing.push("motion-blur:velocity");
    }
  }
  return missing;
}

function postprocessClarityWarnings(
  postprocess: RendererPostprocessPlanOptions,
  passes: readonly RendererPostProcessPassPlan[],
  executionMode: RendererPostprocessExecutionMode
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
  return warnings;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
