import {
  applyToneMappingPreset,
  bloomPixels,
  chromaticAberrationPixels,
  colorGradePixels,
  depthOfFieldPixels,
  filmGrainPixels,
  fxaaPixels,
  motionBlurPixels,
  outlinePixels,
  ssaoPixels,
  ssrPixels,
  taaPixels,
  toneMapPixels,
  writePostProcessPixels,
  type BloomOptions,
  type ChromaticAberrationOptions,
  type ColorGradeOptions,
  type DepthOfFieldOptions,
  type FXAAOptions,
  type FilmGrainOptions,
  type MotionBlurOptions,
  type OutlineOptions,
  type SSAOOptions,
  type SSROptions,
  type TAAOptions,
  type ToneMappingOptions,
  type ToneMappingPresetName
} from "../PostProcessPass";
import { RenderDeviceError, type RenderDevice, type RenderTarget } from "../RenderDevice";
import { type TextureFormat } from "../Texture";

export type PostProcessComposerPass =
  | { readonly name: "bloom"; readonly options?: BloomOptions }
  | { readonly name: "tone-mapping"; readonly options?: ToneMappingOptions }
  | { readonly name: "tone-mapping-preset"; readonly preset: ToneMappingPresetName; readonly options?: { readonly previousExposure?: number; readonly deltaTimeSeconds?: number } & ToneMappingOptions }
  | { readonly name: "color-grade"; readonly options?: ColorGradeOptions }
  | { readonly name: "chromatic-aberration"; readonly options?: ChromaticAberrationOptions }
  | { readonly name: "film-grain"; readonly options?: FilmGrainOptions }
  | { readonly name: "depth-of-field"; readonly options: DepthOfFieldOptions }
  | { readonly name: "motion-blur"; readonly options: MotionBlurOptions }
  | { readonly name: "ssao"; readonly options: SSAOOptions }
  | { readonly name: "ssr"; readonly options: SSROptions }
  | { readonly name: "taa"; readonly options: TAAOptions }
  | { readonly name: "outline"; readonly options?: OutlineOptions }
  | { readonly name: "fxaa"; readonly options?: FXAAOptions };

export interface PostProcessComposerOptions {
  readonly device: RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly format?: Extract<TextureFormat, "rgba8">;
  readonly label?: string;
}

export interface PostProcessComposerRenderOptions {
  readonly source: RenderTarget;
  readonly target?: RenderTarget;
  readonly passes?: readonly PostProcessComposerPass[];
}

export interface PostProcessComposerDiagnostics {
  readonly width: number;
  readonly height: number;
  readonly passCount: number;
  readonly pingPongTargets: number;
  readonly textureCount: number;
  readonly lastPasses: readonly string[];
  readonly presentedToBackbuffer: boolean;
  readonly outputTargetLabel: string | null;
}

export interface PostProcessUnsupportedEffect {
  readonly name: string;
  readonly reason: string;
  readonly requiredCapability?: string;
}

export interface PostProcessCapabilityReport {
  readonly backend: string;
  readonly supportedEffects: readonly string[];
  readonly unsupportedEffects: readonly PostProcessUnsupportedEffect[];
  readonly supportsRenderTargets: boolean;
  readonly supportsPresentation: boolean;
  readonly supportsPixelReadback: boolean;
  readonly supportsFloatReadback: boolean;
  readonly supportsHdrTargets: boolean;
  readonly supportsRendererOwnedDepthEffects: boolean;
}

export class PostProcessComposer {
  private readonly device: RenderDevice;
  private readonly label: string;
  private width: number;
  private height: number;
  private passes: PostProcessComposerPass[] = [];
  private pingPongTargets: [RenderTarget, RenderTarget];
  private disposed = false;
  private lastDiagnostics: PostProcessComposerDiagnostics;

  constructor(options: PostProcessComposerOptions) {
    this.device = options.device;
    this.label = options.label ?? "postprocess-composer";
    validateComposerSize(options.width, options.height);
    this.width = options.width;
    this.height = options.height;
    this.pingPongTargets = this.createPingPongTargets(options.format ?? "rgba8");
    this.lastDiagnostics = this.createDiagnostics([], false, null);
  }

  addPass(pass: PostProcessComposerPass): this {
    this.assertAlive();
    this.passes.push(pass);
    return this;
  }

  setPasses(passes: readonly PostProcessComposerPass[]): this {
    this.assertAlive();
    this.passes = [...passes];
    return this;
  }

  clearPasses(): this {
    this.assertAlive();
    this.passes = [];
    return this;
  }

  resize(width: number, height: number): void {
    this.assertAlive();
    validateComposerSize(width, height);
    if (width === this.width && height === this.height) return;
    for (const target of this.pingPongTargets) target.dispose();
    this.width = width;
    this.height = height;
    this.pingPongTargets = this.createPingPongTargets("rgba8");
    this.lastDiagnostics = this.createDiagnostics([], false, null);
  }

  render(options: PostProcessComposerRenderOptions): PostProcessComposerDiagnostics {
    this.assertAlive();
    this.validateSource(options.source);
    if (options.target) this.validateTarget(options.target);
    const passes = options.passes ? [...options.passes] : [...this.passes];
    let current = options.source;

    if (passes.length === 0) {
      this.device.setRenderTarget(current);
      writePostProcessPixels(this.device, current, options.target, this.device.readPixels(0, 0, current.width, current.height));
      this.lastDiagnostics = this.createDiagnostics([], !options.target, options.target?.label ?? null);
      return this.lastDiagnostics;
    }

    for (let index = 0; index < passes.length; index += 1) {
      const pass = passes[index]!;
      const target = index === passes.length - 1 ? options.target : this.pingPongTargets[index % 2];
      this.device.setRenderTarget(current);
      const pixels = this.device.readPixels(0, 0, current.width, current.height);
      const output = executeComposerPass(pass, pixels, current.width, current.height);
      writePostProcessPixels(this.device, current, target, output);
      if (target) current = target;
    }

    this.lastDiagnostics = this.createDiagnostics(passes.map((pass) => pass.name), !options.target, options.target?.label ?? null);
    return this.lastDiagnostics;
  }

  getDiagnostics(): PostProcessComposerDiagnostics {
    return this.lastDiagnostics;
  }

  dispose(): void {
    if (this.disposed) return;
    for (const target of this.pingPongTargets) target.dispose();
    this.disposed = true;
  }

  private createPingPongTargets(format: Extract<TextureFormat, "rgba8">): [RenderTarget, RenderTarget] {
    return [
      this.device.createRenderTarget({ width: this.width, height: this.height, label: `${this.label}-ping`, format, depth: false }),
      this.device.createRenderTarget({ width: this.width, height: this.height, label: `${this.label}-pong`, format, depth: false })
    ];
  }

  private validateSource(source: RenderTarget): void {
    if (source.width !== this.width || source.height !== this.height) {
      throw new RenderDeviceError("PostProcessComposer source dimensions must match composer dimensions.", "POSTPROCESS_COMPOSER_SIZE_MISMATCH", {
        source: source.label,
        sourceWidth: source.width,
        sourceHeight: source.height,
        width: this.width,
        height: this.height
      });
    }
  }

  private validateTarget(target: RenderTarget): void {
    if (target.width !== this.width || target.height !== this.height) {
      throw new RenderDeviceError("PostProcessComposer target dimensions must match composer dimensions.", "POSTPROCESS_COMPOSER_SIZE_MISMATCH", {
        target: target.label,
        targetWidth: target.width,
        targetHeight: target.height,
        width: this.width,
        height: this.height
      });
    }
  }

  private createDiagnostics(lastPasses: readonly string[], presentedToBackbuffer: boolean, outputTargetLabel: string | null): PostProcessComposerDiagnostics {
    return {
      width: this.width,
      height: this.height,
      passCount: lastPasses.length,
      pingPongTargets: this.disposed ? 0 : 2,
      textureCount: this.disposed ? 0 : 2,
      lastPasses,
      presentedToBackbuffer,
      outputTargetLabel
    };
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("PostProcessComposer is disposed.", "DISPOSED_RESOURCE", { label: this.label });
    }
  }
}

export function createPostProcessCapabilityReport(device: RenderDevice): PostProcessCapabilityReport {
  const capabilities = new Set(device.info.capabilities ?? []);
  const supportsRenderTargets = capabilities.has("render-targets");
  const supportsPresentation = capabilities.has("postprocess-presentation");
  const supportsPixelReadback = capabilities.has("pixel-readback");
  const supportsFloatReadback = capabilities.has("float-readback");
  const supportsHdrTargets = capabilities.has("hdr-render-targets");
  const supportsRendererOwnedDepthEffects = capabilities.has("depth-textures");
  const unsupportedEffects: PostProcessUnsupportedEffect[] = [];
  if (!supportsRenderTargets) {
    unsupportedEffects.push({
      name: "composer-render-target-chain",
      reason: "Postprocess composer requires backend render-target support.",
      requiredCapability: "render-targets"
    });
  }
  if (!supportsPresentation) {
    unsupportedEffects.push({
      name: "backbuffer-presentation",
      reason: "Final postprocess presentation requires a backend presentation path.",
      requiredCapability: "postprocess-presentation"
    });
  }
  if (!supportsPixelReadback) {
    unsupportedEffects.push({
      name: "cpu-pixel-postprocess",
      reason: "Current public composer kernels require byte pixel readback.",
      requiredCapability: "pixel-readback"
    });
  }
  if (!supportsRendererOwnedDepthEffects) {
    unsupportedEffects.push({
      name: "renderer-owned-depth-postprocess",
      reason: "Renderer-owned depth of field, SSAO, contact shadow, and SSR require sampleable depth render targets.",
      requiredCapability: "depth-textures"
    });
  }
  if (!supportsHdrTargets) {
    unsupportedEffects.push({
      name: "hdr-render-target-postprocess",
      reason: "HDR postprocess targets require backend HDR render-target support.",
      requiredCapability: "hdr-render-targets"
    });
  }
  if (!supportsFloatReadback) {
    unsupportedEffects.push({
      name: "hdr-float-readback-postprocess",
      reason: "HDR bloom and tone-map readback require float render-target readback.",
      requiredCapability: "float-readback"
    });
  }
  unsupportedEffects.push({
    name: "smaa",
    reason: "SMAA is not implemented in the public A3D postprocess pass catalog; use FXAA or TAA."
  });

  return {
    backend: device.info.backend,
    supportedEffects: [
      "bloom",
      "tone-mapping",
      "tone-mapping-preset",
      "color-grade",
      "chromatic-aberration",
      "film-grain",
      "depth-of-field-with-depth-binding",
      "motion-blur",
      "ssao-with-depth-binding",
      "ssr-with-depth-binding",
      "taa",
      "outline",
      "fxaa",
      "stereo-anaglyph",
      "stereo-parallax-barrier"
    ],
    unsupportedEffects,
    supportsRenderTargets,
    supportsPresentation,
    supportsPixelReadback,
    supportsFloatReadback,
    supportsHdrTargets,
    supportsRendererOwnedDepthEffects
  };
}

function executeComposerPass(pass: PostProcessComposerPass, pixels: Uint8Array, width: number, height: number): Uint8Array {
  switch (pass.name) {
    case "bloom":
      return bloomPixels(pixels, width, height, pass.options).pixels;
    case "tone-mapping":
      return toneMapPixels(pixels, width, height, pass.options).pixels;
    case "tone-mapping-preset":
      return applyToneMappingPreset(pixels, width, height, pass.preset, pass.options).pixels;
    case "color-grade":
      return colorGradePixels(pixels, width, height, pass.options).pixels;
    case "chromatic-aberration":
      return chromaticAberrationPixels(pixels, width, height, pass.options).pixels;
    case "film-grain":
      return filmGrainPixels(pixels, width, height, pass.options).pixels;
    case "depth-of-field":
      return depthOfFieldPixels(pixels, width, height, pass.options).pixels;
    case "motion-blur":
      return motionBlurPixels(pixels, width, height, pass.options).pixels;
    case "ssao":
      return ssaoPixels(pixels, width, height, pass.options).pixels;
    case "ssr":
      return ssrPixels(pixels, width, height, pass.options).pixels;
    case "taa":
      return taaPixels(pixels, width, height, pass.options).pixels;
    case "outline":
      return outlinePixels(pixels, width, height, pass.options).pixels;
    case "fxaa":
      return fxaaPixels(pixels, width, height, pass.options).pixels;
  }
}

function validateComposerSize(width: number, height: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RenderDeviceError("PostProcessComposer dimensions must be positive integers.", "INVALID_RENDER_TARGET_SIZE", { width, height });
  }
}
