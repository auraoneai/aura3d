import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { RenderDeviceError, type RenderDevice, type RenderTarget } from "./RenderDevice";

export type ToneMappingOperator = "linear" | "reinhard" | "aces" | "filmic" | "uncharted2" | "agx" | "neutral";
export type PostProcessColorSpace = "linear" | "srgb";
export type DepthTextureFormat = "depth24";
export type ToneMappingPresetName = "natural" | "cinematic" | "vibrant" | "realistic" | "stylized";

export interface BloomOptions {
  readonly threshold?: number;
  readonly intensity?: number;
  readonly radius?: number;
}

export interface FXAAOptions {
  readonly edgeThreshold?: number;
  readonly subpixelBlend?: number;
}

export interface ToneMappingOptions {
  readonly exposure?: number;
  readonly whitePoint?: number;
  readonly gamma?: number;
  readonly operator?: ToneMappingOperator;
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly outputColorSpace?: PostProcessColorSpace;
}

export interface ColorGradeOptions {
  readonly contrast?: number;
  readonly temperature?: number;
  readonly tint?: number;
  readonly saturation?: number;
  readonly vibrance?: number;
  readonly vignette?: number;
  readonly sharpening?: number;
}

export interface ColorGradeResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly changedPixels: number;
  readonly vignetteDarkenedPixels: number;
  readonly sharpenedPixels: number;
  readonly settings: Required<ColorGradeOptions>;
}

export interface ToneMappingPreset {
  readonly name: ToneMappingPresetName;
  readonly label: string;
  readonly toneMapping: Required<ToneMappingOptions>;
  readonly colorGrade: Required<ColorGradeOptions>;
  readonly autoExposure: boolean;
  readonly adaptationSpeed: number;
  readonly minExposure: number;
  readonly maxExposure: number;
}

export interface ExposureHistogramOptions {
  readonly inputColorSpace?: PostProcessColorSpace;
  readonly binCount?: number;
  readonly minLuminance?: number;
  readonly maxLuminance?: number;
}

export interface ExposureHistogram {
  readonly bins: readonly number[];
  readonly binCount: number;
  readonly minLuminance: number;
  readonly maxLuminance: number;
  readonly pixelCount: number;
  readonly averageLuminance: number;
  readonly minObservedLuminance: number;
  readonly maxObservedLuminance: number;
}

export interface AutoExposureOptions {
  readonly targetLuminance?: number;
  readonly previousExposure?: number;
  readonly adaptationSpeed?: number;
  readonly deltaTimeSeconds?: number;
  readonly minExposure?: number;
  readonly maxExposure?: number;
}

export interface AutoExposureResult {
  readonly exposure: number;
  readonly targetExposure: number;
  readonly averageLuminance: number;
  readonly adaptationRate: number;
  readonly clamped: boolean;
}

export interface ToneMappingPresetResult {
  readonly width: number;
  readonly height: number;
  readonly preset: ToneMappingPresetName;
  readonly pixels: Uint8Array;
  readonly toneMapped: ToneMappingResult;
  readonly colorGraded: ColorGradeResult;
  readonly histogram: ExposureHistogram;
  readonly autoExposure?: AutoExposureResult;
}

export interface ChromaticAberrationOptions {
  readonly strength?: number;
}

export interface ChromaticAberrationResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly changedPixels: number;
  readonly maxChannelOffsetPixels: number;
}

export interface OutlineOptions {
  readonly color?: readonly [number, number, number, number?];
  readonly width?: number;
  readonly threshold?: number;
  readonly opacity?: number;
}

export interface OutlineResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly outlineMask: Uint8Array;
  readonly outlinedPixels: number;
  readonly changedPixels: number;
  readonly maxGradient: number;
  readonly method: "sobel-luma";
}

export interface FilmGrainOptions {
  readonly intensity?: number;
  readonly seed?: number;
  readonly monochrome?: boolean;
}

export interface FilmGrainResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly changedPixels: number;
  readonly seed: number;
  readonly intensity: number;
  readonly monochrome: boolean;
}

export interface DepthOfFieldOptions {
  readonly depth?: DepthTextureBinding;
  readonly focusDepth?: number;
  readonly focusRange?: number;
  readonly maxRadius?: number;
}

export interface DepthOfFieldResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly blurredPixels: number;
  readonly maxBlurRadius: number;
  readonly focusDepth: number;
  readonly focusRange: number;
}

export interface MotionBlurOptions {
  readonly velocity: Float32Array;
  readonly samples?: number;
  readonly scale?: number;
}

export interface MotionBlurResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly blurredPixels: number;
  readonly samples: number;
  readonly maxVelocityPixels: number;
}

export interface SSAOOptions {
  readonly depth?: DepthTextureBinding;
  readonly radius?: number;
  readonly intensity?: number;
  readonly bias?: number;
}

export interface SSAOResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly occludedPixels: number;
  readonly averageOcclusion: number;
  readonly radius: number;
  readonly intensity: number;
}

export interface ContactShadowPostProcessOptions {
  readonly depth?: DepthTextureBinding;
  readonly radius?: number;
  readonly intensity?: number;
  readonly bias?: number;
  readonly thickness?: number;
  readonly direction?: readonly [number, number];
}

export interface ContactShadowPostProcessResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly contactPixels: number;
  readonly averageContactDarkening: number;
  readonly radius: number;
  readonly intensity: number;
  readonly mode: "screen-space-depth-contact";
}

export interface SSRResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly reflectedPixels: number;
  readonly maxReflectionBoost: number;
  readonly intensity: number;
  readonly maxDistance: number;
}

export interface SSROptions {
  readonly depth?: DepthTextureBinding;
  readonly intensity?: number;
  readonly maxDistance?: number;
}

export interface TAAOptions {
  readonly history: Uint8Array;
  readonly blend?: number;
}

export interface TAAResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly blendedPixels: number;
  readonly blend: number;
}

export interface ToneMappingResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly colorSpace: PostProcessColorSpace;
  readonly calibration: ToneMappingCalibration;
}

export interface HdrToneMappingResult extends ToneMappingResult {
  readonly inputOverbrightPixels: number;
  readonly maxInputValue: number;
}

export interface BloomResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly brightPixels: Uint8Array;
  readonly horizontalBlurPixels: Uint8Array;
  readonly verticalBlurPixels: Uint8Array;
  readonly brightPixelCount: number;
  readonly brightEnergy: number;
  readonly maxNeighborBoost: number;
  readonly changedPixels: number;
  readonly maxChannelDelta: number;
  readonly pipeline: readonly ["bright-extract", "horizontal-blur", "vertical-blur", "composite"];
}

export interface HdrBloomResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Float32Array;
  readonly brightPixels: Float32Array;
  readonly horizontalBlurPixels: Float32Array;
  readonly verticalBlurPixels: Float32Array;
  readonly brightPixelCount: number;
  readonly brightEnergy: number;
  readonly maxNeighborBoost: number;
  readonly changedPixels: number;
  readonly maxChannelDelta: number;
  readonly maxInputValue: number;
  readonly pipeline: readonly ["bright-extract", "horizontal-blur", "vertical-blur", "composite"];
}

export interface FXAAResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly edgeMask: Uint8Array;
}

export type FusedLdrPostProcessPassName = "tone-mapping" | "color-grade" | "fxaa";

export interface FusedLdrPostProcessPass {
  readonly name: FusedLdrPostProcessPassName;
  readonly options: ToneMappingOptions | ColorGradeOptions | FXAAOptions;
}

export interface FusedLdrPostProcessScratch {
  bufferA?: Uint8Array;
  bufferB?: Uint8Array;
  toneMappingLookup?: Uint8Array;
  toneMappingLookupKey?: string;
  vignetteFactors?: Float32Array;
  vignetteFactorsKey?: string;
}

export interface FusedLdrPostProcessOptions {
  readonly scratch?: FusedLdrPostProcessScratch;
  readonly mutateInput?: boolean;
  readonly toneMappingDefaults?: ToneMappingOptions;
}

export interface ToneMappingCalibrationSample {
  readonly inputLinear: number;
  readonly mappedLinear: number;
  readonly encodedByte: number;
}

export interface ToneMappingCalibration {
  readonly operator: ToneMappingOperator;
  readonly exposure: number;
  readonly whitePoint: number;
  readonly gamma: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly outputColorSpace: PostProcessColorSpace;
  readonly samples: readonly ToneMappingCalibrationSample[];
  readonly monotonic: boolean;
}

export interface DepthTextureBinding {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: DepthTextureFormat;
  readonly data: Float32Array;
}

export interface DepthTextureStats {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly format: DepthTextureFormat;
  readonly byteLength: number;
  readonly minDepth: number;
  readonly maxDepth: number;
  readonly centerDepth: number;
  readonly nearSample: number;
  readonly farSample: number;
  readonly edgePixelCount: number;
}

export interface DepthVisualizationResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly stats: DepthTextureStats;
}

export interface ToneMappingPassOptions extends ToneMappingOptions {
  readonly name?: string;
  readonly source: RenderTarget;
  readonly target?: RenderTarget;
  readonly readResource?: string;
  readonly writeResource?: string;
}

export interface BloomPassOptions extends BloomOptions {
  readonly name?: string;
  readonly source: RenderTarget;
  readonly target?: RenderTarget;
  readonly readResource?: string;
  readonly writeResource?: string;
}

export interface FXAAPassOptions extends FXAAOptions {
  readonly name?: string;
  readonly source: RenderTarget;
  readonly target?: RenderTarget;
  readonly readResource?: string;
  readonly writeResource?: string;
}

export interface DepthVisualizationPassOptions {
  readonly name?: string;
  readonly source: DepthTextureBinding;
  readonly target?: RenderTarget;
  readonly edgeThreshold?: number;
  readonly readResource?: string;
  readonly writeResource?: string;
}

export class ToneMappingPass extends BaseRenderPass {
  private readonly exposure: number;
  private readonly whitePoint: number;
  private readonly gamma: number;
  private readonly operator: ToneMappingOperator;
  private readonly inputColorSpace: PostProcessColorSpace;
  private readonly outputColorSpace: PostProcessColorSpace;
  private lastResult: ToneMappingResult | null = null;

  constructor(private readonly options: ToneMappingPassOptions) {
    super(
      options.name ?? "tone-mapping",
      [options.readResource ?? options.source.label],
      [options.writeResource ?? options.target?.label ?? "backbuffer"]
    );
    this.exposure = options.exposure ?? 1;
    this.whitePoint = options.whitePoint ?? 1;
    this.gamma = options.gamma ?? 2.2;
    this.operator = options.operator ?? "reinhard";
    this.inputColorSpace = options.inputColorSpace ?? "linear";
    this.outputColorSpace = options.outputColorSpace ?? "linear";
    if (!Number.isFinite(this.exposure) || this.exposure < 0) {
      throw new Error("ToneMappingPass exposure must be finite and non-negative.");
    }
    if (!Number.isFinite(this.whitePoint) || this.whitePoint <= 0) {
      throw new Error("ToneMappingPass whitePoint must be finite and positive.");
    }
    if (!Number.isFinite(this.gamma) || this.gamma <= 0) {
      throw new Error("ToneMappingPass gamma must be finite and positive.");
    }
  }

  execute(context: RenderPassContext): void {
    context.device.setRenderTarget(this.options.source);
    const mapped = this.options.source.colorTexture.format === "rgba16f" || this.options.source.colorTexture.format === "rgba32f"
      ? toneMapFloatPixels(context.device.readFloatPixels(0, 0, this.options.source.width, this.options.source.height), this.options.source.width, this.options.source.height, {
          exposure: this.exposure,
          whitePoint: this.whitePoint,
          gamma: this.gamma,
          operator: this.operator,
          outputColorSpace: this.outputColorSpace
        })
      : toneMapPixels(context.device.readPixels(0, 0, this.options.source.width, this.options.source.height), this.options.source.width, this.options.source.height, {
          exposure: this.exposure,
          whitePoint: this.whitePoint,
          gamma: this.gamma,
          operator: this.operator,
          inputColorSpace: this.inputColorSpace,
          outputColorSpace: this.outputColorSpace
        });
    writeRenderTarget(context.device, this.options.source, this.options.target, mapped.pixels);
    this.lastResult = mapped;
  }

  getLastResult(): ToneMappingResult | null {
    return this.lastResult ? { ...this.lastResult, pixels: new Uint8Array(this.lastResult.pixels) } : null;
  }
}

export class DepthVisualizationPass extends BaseRenderPass {
  private readonly edgeThreshold: number;
  private lastResult: DepthVisualizationResult | null = null;

  constructor(private readonly options: DepthVisualizationPassOptions) {
    super(
      options.name ?? "depth-visualization",
      [options.readResource ?? options.source.label],
      [options.writeResource ?? options.target?.label ?? "depth-visualization-output"]
    );
    this.edgeThreshold = options.edgeThreshold ?? 0.08;
    if (!Number.isFinite(this.edgeThreshold) || this.edgeThreshold < 0 || this.edgeThreshold > 1) {
      throw new Error("DepthVisualizationPass edgeThreshold must be finite and in [0, 1].");
    }
  }

  execute(context: RenderPassContext): void {
    const visualized = visualizeDepthTexture(this.options.source, { edgeThreshold: this.edgeThreshold });
    writeDepthTarget(this.options.target, this.options.source.width, this.options.source.height, visualized.pixels);
    context.device.setRenderTarget(this.options.target ?? null);
    this.lastResult = visualized;
  }

  getLastResult(): DepthVisualizationResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          stats: { ...this.lastResult.stats }
        }
      : null;
  }
}

export class BloomPass extends BaseRenderPass {
  private readonly threshold: number;
  private readonly intensity: number;
  private readonly radius: number;
  private lastResult: BloomResult | null = null;

  constructor(private readonly options: BloomPassOptions) {
    super(
      options.name ?? "bloom",
      [options.readResource ?? options.source.label],
      [options.writeResource ?? options.target?.label ?? "bloom-output"]
    );
    this.threshold = options.threshold ?? 0.75;
    this.intensity = options.intensity ?? 0.35;
    this.radius = options.radius ?? 1;
    validateBloomOptions(this.threshold, this.intensity, this.radius);
  }

  execute(context: RenderPassContext): void {
    context.device.setRenderTarget(this.options.source);
    const pixels = context.device.readPixels(0, 0, this.options.source.width, this.options.source.height);
    const bloomed = bloomPixels(pixels, this.options.source.width, this.options.source.height, {
      threshold: this.threshold,
      intensity: this.intensity,
      radius: this.radius
    });
    writeRenderTarget(context.device, this.options.source, this.options.target, bloomed.pixels);
    this.lastResult = bloomed;
  }

  getLastResult(): BloomResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          brightPixels: new Uint8Array(this.lastResult.brightPixels),
          horizontalBlurPixels: new Uint8Array(this.lastResult.horizontalBlurPixels),
          verticalBlurPixels: new Uint8Array(this.lastResult.verticalBlurPixels)
        }
      : null;
  }
}

export class FXAAPass extends BaseRenderPass {
  private readonly edgeThreshold: number;
  private readonly subpixelBlend: number;
  private lastResult: FXAAResult | null = null;

  constructor(private readonly options: FXAAPassOptions) {
    super(
      options.name ?? "fxaa",
      [options.readResource ?? options.source.label],
      [options.writeResource ?? options.target?.label ?? "fxaa-output"]
    );
    this.edgeThreshold = options.edgeThreshold ?? 0.125;
    this.subpixelBlend = options.subpixelBlend ?? 0.75;
    validateFXAAOptions(this.edgeThreshold, this.subpixelBlend);
  }

  execute(context: RenderPassContext): void {
    context.device.setRenderTarget(this.options.source);
    const pixels = context.device.readPixels(0, 0, this.options.source.width, this.options.source.height);
    const smoothed = fxaaPixels(pixels, this.options.source.width, this.options.source.height, {
      edgeThreshold: this.edgeThreshold,
      subpixelBlend: this.subpixelBlend
    });
    writeRenderTarget(context.device, this.options.source, this.options.target, smoothed.pixels);
    this.lastResult = smoothed;
  }

  getLastResult(): FXAAResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          edgeMask: new Uint8Array(this.lastResult.edgeMask)
        }
      : null;
  }
}

export function toneMapPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: ToneMappingOptions = {}
): ToneMappingResult {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Tone mapping dimensions must be positive integers.");
  }
  if (pixels.byteLength !== width * height * 4) {
    throw new Error("Tone mapping input must contain width * height * 4 RGBA bytes.");
  }
  const exposure = options.exposure ?? 1;
  const whitePoint = options.whitePoint ?? 1;
  const gamma = options.gamma ?? 2.2;
  const operator = options.operator ?? "reinhard";
  const inputColorSpace = options.inputColorSpace ?? "linear";
  const outputColorSpace = options.outputColorSpace ?? "linear";
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new Error("Tone mapping exposure must be finite and non-negative.");
  }
  if (!Number.isFinite(whitePoint) || whitePoint <= 0) {
    throw new Error("Tone mapping whitePoint must be finite and positive.");
  }
  if (!Number.isFinite(gamma) || gamma <= 0) {
    throw new Error("Tone mapping gamma must be finite and positive.");
  }
  const output = new Uint8Array(pixels.byteLength);
  for (let index = 0; index < pixels.length; index += 4) {
    output[index] = encodeToneMappedChannel(decodeColorByte(pixels[index]!, inputColorSpace), exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 1] = encodeToneMappedChannel(decodeColorByte(pixels[index + 1]!, inputColorSpace), exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 2] = encodeToneMappedChannel(decodeColorByte(pixels[index + 2]!, inputColorSpace), exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 3] = pixels[index + 3]!;
  }
  return {
    width,
    height,
    pixels: output,
    colorSpace: outputColorSpace,
    calibration: createToneMappingCalibration({ exposure, whitePoint, gamma, operator, inputColorSpace, outputColorSpace })
  };
}

export function toneMapFloatPixels(
  pixels: Float32Array,
  width: number,
  height: number,
  options: ToneMappingOptions = {}
): HdrToneMappingResult {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("HDR tone mapping dimensions must be positive integers.");
  }
  if (pixels.length !== width * height * 4) {
    throw new Error("HDR tone mapping input must contain width * height * 4 RGBA float values.");
  }
  const exposure = options.exposure ?? 1;
  const whitePoint = options.whitePoint ?? 1;
  const gamma = options.gamma ?? 2.2;
  const operator = options.operator ?? "reinhard";
  const outputColorSpace = options.outputColorSpace ?? "linear";
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new Error("HDR tone mapping exposure must be finite and non-negative.");
  }
  if (!Number.isFinite(whitePoint) || whitePoint <= 0) {
    throw new Error("HDR tone mapping whitePoint must be finite and positive.");
  }
  if (!Number.isFinite(gamma) || gamma <= 0) {
    throw new Error("HDR tone mapping gamma must be finite and positive.");
  }
  const output = new Uint8Array(pixels.length);
  let inputOverbrightPixels = 0;
  let maxInputValue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = finiteHdrChannel(pixels[index]!, index);
    const g = finiteHdrChannel(pixels[index + 1]!, index + 1);
    const b = finiteHdrChannel(pixels[index + 2]!, index + 2);
    const a = finiteHdrChannel(pixels[index + 3]!, index + 3);
    if (r > 1 || g > 1 || b > 1) inputOverbrightPixels += 1;
    maxInputValue = Math.max(maxInputValue, r, g, b);
    output[index] = encodeToneMappedChannel(r, exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 1] = encodeToneMappedChannel(g, exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 2] = encodeToneMappedChannel(b, exposure, whitePoint, gamma, operator, outputColorSpace);
    output[index + 3] = clampByte(a * 255);
  }
  return {
    width,
    height,
    pixels: output,
    colorSpace: outputColorSpace,
    calibration: createToneMappingCalibration({ exposure, whitePoint, gamma, operator, inputColorSpace: "linear", outputColorSpace }),
    inputOverbrightPixels,
    maxInputValue: Number(maxInputValue.toFixed(6))
  };
}

export function colorGradePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: ColorGradeOptions = {}
): ColorGradeResult {
  validatePixelBuffer(pixels, width, height, "Color grading");
  const settings = {
    contrast: options.contrast ?? 1,
    temperature: options.temperature ?? 0,
    tint: options.tint ?? 0,
    saturation: options.saturation ?? 1,
    vibrance: options.vibrance ?? 0,
    vignette: options.vignette ?? 0,
    sharpening: options.sharpening ?? 0
  };
  validateRange(settings.contrast, 0, 3, "Color grading contrast");
  validateRange(settings.temperature, -1, 1, "Color grading temperature");
  validateRange(settings.tint, -1, 1, "Color grading tint");
  validateRange(settings.saturation, 0, 3, "Color grading saturation");
  validateRange(settings.vibrance, -1, 1, "Color grading vibrance");
  validateRange(settings.vignette, 0, 1, "Color grading vignette");
  validateRange(settings.sharpening, 0, 2, "Color grading sharpening");

  const graded = new Uint8Array(pixels.byteLength);
  let changedPixels = 0;
  let vignetteDarkenedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      let r = (pixels[index] ?? 0) / 255;
      let g = (pixels[index + 1] ?? 0) / 255;
      let b = (pixels[index + 2] ?? 0) / 255;
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = (r - 0.5) * settings.contrast + 0.5;
      g = (g - 0.5) * settings.contrast + 0.5;
      b = (b - 0.5) * settings.contrast + 0.5;
      r += settings.temperature * 0.08 - settings.tint * 0.02;
      g += settings.tint * 0.06;
      b -= settings.temperature * 0.08 + settings.tint * 0.02;
      const vibranceBoost = settings.vibrance * (1 - Math.min(1, Math.abs(r - luma) + Math.abs(g - luma) + Math.abs(b - luma)));
      const saturation = settings.saturation + vibranceBoost;
      r = luma + (r - luma) * saturation;
      g = luma + (g - luma) * saturation;
      b = luma + (b - luma) * saturation;
      const centerX = width <= 1 ? 0 : (x / (width - 1)) * 2 - 1;
      const centerY = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
      const vignette = 1 - settings.vignette * Math.min(1, Math.max(0, Math.hypot(centerX, centerY) - 0.28) / 1.12);
      if (vignette < 0.98) vignetteDarkenedPixels += 1;
      r *= vignette;
      g *= vignette;
      b *= vignette;
      graded[index] = clampByte(r * 255);
      graded[index + 1] = clampByte(g * 255);
      graded[index + 2] = clampByte(b * 255);
      graded[index + 3] = pixels[index + 3] ?? 255;
      if (Math.abs(graded[index]! - (pixels[index] ?? 0)) + Math.abs(graded[index + 1]! - (pixels[index + 1] ?? 0)) + Math.abs(graded[index + 2]! - (pixels[index + 2] ?? 0)) > 3) {
        changedPixels += 1;
      }
    }
  }

  const sharpened = settings.sharpening > 0 ? sharpenPixels(graded, width, height, settings.sharpening) : { pixels: graded, sharpenedPixels: 0 };
  return {
    width,
    height,
    pixels: sharpened.pixels,
    changedPixels: Math.max(changedPixels, countChangedRgb(pixels, sharpened.pixels)),
    vignetteDarkenedPixels,
    sharpenedPixels: sharpened.sharpenedPixels,
    settings
  };
}

export const toneMappingPresets: Record<ToneMappingPresetName, ToneMappingPreset> = {
  natural: createToneMappingPreset("natural", "Natural", {
    operator: "neutral",
    exposure: 1,
    autoExposure: false
  }),
  cinematic: createToneMappingPreset("cinematic", "Cinematic", {
    operator: "aces",
    exposure: 1.2,
    autoExposure: true,
    adaptationSpeed: 0.3,
    temperature: -0.1,
    contrast: 1.1,
    saturation: 0.95
  }),
  vibrant: createToneMappingPreset("vibrant", "Vibrant", {
    operator: "uncharted2",
    exposure: 1.3,
    autoExposure: false,
    temperature: 0.1,
    contrast: 1.15,
    saturation: 1.2
  }),
  realistic: createToneMappingPreset("realistic", "Realistic", {
    operator: "agx",
    exposure: 1,
    autoExposure: true,
    adaptationSpeed: 0.5
  }),
  stylized: createToneMappingPreset("stylized", "Stylized", {
    operator: "filmic",
    exposure: 1.4,
    autoExposure: false,
    temperature: 0.2,
    contrast: 1.25,
    saturation: 1.1
  })
};

export function resolveToneMappingPreset(
  name: ToneMappingPresetName,
  overrides: ToneMappingOptions & ColorGradeOptions & Partial<Pick<ToneMappingPreset, "autoExposure" | "adaptationSpeed" | "minExposure" | "maxExposure">> = {}
): ToneMappingPreset {
  const preset = toneMappingPresets[name];
  return {
    ...preset,
    toneMapping: {
      ...preset.toneMapping,
      exposure: overrides.exposure ?? preset.toneMapping.exposure,
      whitePoint: overrides.whitePoint ?? preset.toneMapping.whitePoint,
      gamma: overrides.gamma ?? preset.toneMapping.gamma,
      operator: overrides.operator ?? preset.toneMapping.operator,
      inputColorSpace: overrides.inputColorSpace ?? preset.toneMapping.inputColorSpace,
      outputColorSpace: overrides.outputColorSpace ?? preset.toneMapping.outputColorSpace
    },
    colorGrade: {
      ...preset.colorGrade,
      contrast: overrides.contrast ?? preset.colorGrade.contrast,
      temperature: overrides.temperature ?? preset.colorGrade.temperature,
      tint: overrides.tint ?? preset.colorGrade.tint,
      saturation: overrides.saturation ?? preset.colorGrade.saturation,
      vibrance: overrides.vibrance ?? preset.colorGrade.vibrance,
      vignette: overrides.vignette ?? preset.colorGrade.vignette,
      sharpening: overrides.sharpening ?? preset.colorGrade.sharpening
    },
    autoExposure: overrides.autoExposure ?? preset.autoExposure,
    adaptationSpeed: overrides.adaptationSpeed ?? preset.adaptationSpeed,
    minExposure: overrides.minExposure ?? preset.minExposure,
    maxExposure: overrides.maxExposure ?? preset.maxExposure
  };
}

export function computeExposureHistogramFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: ExposureHistogramOptions = {}
): ExposureHistogram {
  validatePixelBuffer(pixels, width, height, "Exposure histogram");
  const inputColorSpace = options.inputColorSpace ?? "linear";
  const binCount = options.binCount ?? 64;
  const minLuminance = options.minLuminance ?? 0.001;
  const maxLuminance = options.maxLuminance ?? 16;
  validateHistogramOptions(binCount, minLuminance, maxLuminance);
  const bins = Array.from({ length: binCount }, () => 0);
  const logMin = Math.log2(minLuminance);
  const logMax = Math.log2(maxLuminance);
  let luminanceSum = 0;
  let minObservedLuminance = Number.POSITIVE_INFINITY;
  let maxObservedLuminance = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = decodeColorByte(pixels[index] ?? 0, inputColorSpace);
    const g = decodeColorByte(pixels[index + 1] ?? 0, inputColorSpace);
    const b = decodeColorByte(pixels[index + 2] ?? 0, inputColorSpace);
    const luminance = Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b);
    luminanceSum += luminance;
    minObservedLuminance = Math.min(minObservedLuminance, luminance);
    maxObservedLuminance = Math.max(maxObservedLuminance, luminance);
    const safeLuminance = Math.max(minLuminance, Math.min(maxLuminance, luminance));
    const bin = clampInt(Math.round(((Math.log2(safeLuminance) - logMin) / (logMax - logMin)) * (binCount - 1)), 0, binCount - 1);
    bins[bin] += 1;
  }
  const pixelCount = width * height;
  return {
    bins,
    binCount,
    minLuminance,
    maxLuminance,
    pixelCount,
    averageLuminance: Number((luminanceSum / pixelCount).toFixed(6)),
    minObservedLuminance: Number((minObservedLuminance === Number.POSITIVE_INFINITY ? 0 : minObservedLuminance).toFixed(6)),
    maxObservedLuminance: Number(maxObservedLuminance.toFixed(6))
  };
}

export function computeAutoExposureFromHistogram(histogram: ExposureHistogram, options: AutoExposureOptions = {}): AutoExposureResult {
  if (histogram.pixelCount <= 0 || histogram.bins.length !== histogram.binCount) {
    throw new Error("Auto exposure histogram must contain bins and a positive pixel count.");
  }
  const targetLuminance = options.targetLuminance ?? 0.18;
  const previousExposure = options.previousExposure ?? 1;
  const adaptationSpeed = options.adaptationSpeed ?? 1;
  const deltaTimeSeconds = options.deltaTimeSeconds ?? 1 / 60;
  const minExposure = options.minExposure ?? 0.1;
  const maxExposure = options.maxExposure ?? 10;
  validateRange(targetLuminance, 0.001, 4, "Auto exposure targetLuminance");
  validateRange(previousExposure, 0.001, 128, "Auto exposure previousExposure");
  validateRange(adaptationSpeed, 0, 1, "Auto exposure adaptationSpeed");
  validateRange(deltaTimeSeconds, 0, 10, "Auto exposure deltaTimeSeconds");
  validateRange(minExposure, 0.001, 128, "Auto exposure minExposure");
  validateRange(maxExposure, minExposure, 128, "Auto exposure maxExposure");

  const averageLuminance = histogram.averageLuminance > 0 ? histogram.averageLuminance : histogramAverageFromBins(histogram);
  const unclampedTarget = targetLuminance / Math.max(0.001, averageLuminance);
  const targetExposure = Math.max(minExposure, Math.min(maxExposure, unclampedTarget));
  const adaptationRate = 1 - Math.pow(1 - adaptationSpeed, deltaTimeSeconds * 60);
  const exposure = previousExposure + (targetExposure - previousExposure) * adaptationRate;
  return {
    exposure: Number(exposure.toFixed(6)),
    targetExposure: Number(targetExposure.toFixed(6)),
    averageLuminance: Number(averageLuminance.toFixed(6)),
    adaptationRate: Number(adaptationRate.toFixed(6)),
    clamped: targetExposure !== unclampedTarget
  };
}

export function applyToneMappingPreset(
  pixels: Uint8Array,
  width: number,
  height: number,
  presetName: ToneMappingPresetName,
  options: ToneMappingOptions & ColorGradeOptions & AutoExposureOptions & Partial<Pick<ToneMappingPreset, "autoExposure" | "adaptationSpeed" | "minExposure" | "maxExposure">> = {}
): ToneMappingPresetResult {
  const preset = resolveToneMappingPreset(presetName, options);
  const histogram = computeExposureHistogramFromPixels(pixels, width, height, {
    inputColorSpace: preset.toneMapping.inputColorSpace
  });
  const autoExposure = preset.autoExposure
    ? computeAutoExposureFromHistogram(histogram, {
        targetLuminance: options.targetLuminance,
        previousExposure: options.previousExposure ?? preset.toneMapping.exposure,
        adaptationSpeed: options.adaptationSpeed ?? preset.adaptationSpeed,
        deltaTimeSeconds: options.deltaTimeSeconds,
        minExposure: options.minExposure ?? preset.minExposure,
        maxExposure: options.maxExposure ?? preset.maxExposure
      })
    : undefined;
  const toneMapped = toneMapPixels(pixels, width, height, {
    ...preset.toneMapping,
    exposure: autoExposure?.exposure ?? preset.toneMapping.exposure
  });
  const colorGraded = colorGradePixels(toneMapped.pixels, width, height, preset.colorGrade);
  return {
    width,
    height,
    preset: presetName,
    pixels: colorGraded.pixels,
    toneMapped,
    colorGraded,
    histogram,
    autoExposure
  };
}

export function chromaticAberrationPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: ChromaticAberrationOptions = {}
): ChromaticAberrationResult {
  validatePixelBuffer(pixels, width, height, "Chromatic aberration");
  const strength = options.strength ?? 0.35;
  validateRange(strength, 0, 2, "Chromatic aberration strength");
  const output = new Uint8Array(pixels);
  let changedPixels = 0;
  let maxChannelOffsetPixels = 0;
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const directionX = centerX === 0 ? 0 : (x - centerX) / maxDistance;
      const directionY = centerY === 0 ? 0 : (y - centerY) / maxDistance;
      const radial = Math.min(1, Math.hypot(x - centerX, y - centerY) / maxDistance);
      const offset = Math.round(strength * radial * 2);
      maxChannelOffsetPixels = Math.max(maxChannelOffsetPixels, offset);
      const redX = clampInt(Math.round(x + directionX * offset), 0, width - 1);
      const redY = clampInt(Math.round(y + directionY * offset), 0, height - 1);
      const blueX = clampInt(Math.round(x - directionX * offset), 0, width - 1);
      const blueY = clampInt(Math.round(y - directionY * offset), 0, height - 1);
      output[index] = channelAt(pixels, width, height, redX, redY, 0);
      output[index + 1] = pixels[index + 1] ?? 0;
      output[index + 2] = channelAt(pixels, width, height, blueX, blueY, 2);
      output[index + 3] = pixels[index + 3] ?? 255;
      if (Math.abs(output[index]! - (pixels[index] ?? 0)) + Math.abs(output[index + 2]! - (pixels[index + 2] ?? 0)) > 2) {
        changedPixels += 1;
      }
    }
  }
  return { width, height, pixels: output, changedPixels, maxChannelOffsetPixels };
}

export function outlinePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: OutlineOptions = {}
): OutlineResult {
  validatePixelBuffer(pixels, width, height, "Outline");
  const outlineWidth = options.width ?? 1;
  const threshold = options.threshold ?? 0.22;
  const opacity = options.opacity ?? 0.85;
  const color = options.color ?? [255, 188, 64, 255];
  if (!Number.isInteger(outlineWidth) || outlineWidth < 1 || outlineWidth > 6) {
    throw new Error("Outline width must be an integer in [1, 6].");
  }
  validateRange(threshold, 0, 4, "Outline threshold");
  validateRange(opacity, 0, 1, "Outline opacity");
  validateOutlineColor(color);

  const edgeMask = new Uint8Array(width * height);
  let maxGradient = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gradient = sobelLumaGradient(pixels, width, height, x, y);
      maxGradient = Math.max(maxGradient, gradient);
      if (gradient >= threshold) {
        edgeMask[y * width + x] = 255;
      }
    }
  }

  const outlineMask = dilateMask(edgeMask, width, height, outlineWidth);
  const output = new Uint8Array(pixels);
  let outlinedPixels = 0;
  let changedPixels = 0;
  const colorAlpha = (color[3] ?? 255) / 255;
  const alpha = opacity * colorAlpha;
  for (let index = 0; index < outlineMask.length; index += 1) {
    if (outlineMask[index] === 0) continue;
    outlinedPixels += 1;
    const pixelIndex = index * 4;
    const beforeRed = pixels[pixelIndex] ?? 0;
    const beforeGreen = pixels[pixelIndex + 1] ?? 0;
    const beforeBlue = pixels[pixelIndex + 2] ?? 0;
    output[pixelIndex] = clampByte(beforeRed * (1 - alpha) + color[0] * alpha);
    output[pixelIndex + 1] = clampByte(beforeGreen * (1 - alpha) + color[1] * alpha);
    output[pixelIndex + 2] = clampByte(beforeBlue * (1 - alpha) + color[2] * alpha);
    output[pixelIndex + 3] = pixels[pixelIndex + 3] ?? 255;
    if (Math.abs(output[pixelIndex]! - beforeRed) + Math.abs(output[pixelIndex + 1]! - beforeGreen) + Math.abs(output[pixelIndex + 2]! - beforeBlue) > 3) {
      changedPixels += 1;
    }
  }

  return {
    width,
    height,
    pixels: output,
    outlineMask,
    outlinedPixels,
    changedPixels,
    maxGradient: Number(maxGradient.toFixed(6)),
    method: "sobel-luma"
  };
}

export function filmGrainPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: FilmGrainOptions = {}
): FilmGrainResult {
  validatePixelBuffer(pixels, width, height, "Film grain");
  const intensity = options.intensity ?? 0.08;
  const seed = options.seed ?? 1;
  const monochrome = options.monochrome ?? true;
  validateRange(intensity, 0, 1, "Film grain intensity");
  if (!Number.isInteger(seed)) {
    throw new Error("Film grain seed must be an integer.");
  }
  const output = new Uint8Array(pixels);
  let changedPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luma = ((pixels[index] ?? 0) * 0.2126 + (pixels[index + 1] ?? 0) * 0.7152 + (pixels[index + 2] ?? 0) * 0.0722) / 255;
      const grain = (
        noise2d(x, y, seed) +
        noise2d(Math.floor(x / 2), Math.floor(y / 2), seed + 97) +
        noise2d(x + 19, y + 31, seed + 193)
      ) / 3 * 2 - 1;
      const amplitude = intensity * 84 * (0.35 + 0.65 * (1 - luma));
      const redGrain = grain;
      const greenGrain = monochrome ? grain : grain * 0.72 + (noise2d(x, y, seed + 17) * 2 - 1) * 0.28;
      const blueGrain = monochrome ? grain : grain * 0.72 + (noise2d(x, y, seed + 31) * 2 - 1) * 0.28;
      output[index] = clampByte((pixels[index] ?? 0) + redGrain * amplitude);
      output[index + 1] = clampByte((pixels[index + 1] ?? 0) + greenGrain * amplitude);
      output[index + 2] = clampByte((pixels[index + 2] ?? 0) + blueGrain * amplitude);
      output[index + 3] = pixels[index + 3] ?? 255;
      if (Math.abs(output[index]! - (pixels[index] ?? 0)) + Math.abs(output[index + 1]! - (pixels[index + 1] ?? 0)) + Math.abs(output[index + 2]! - (pixels[index + 2] ?? 0)) > 0) {
        changedPixels += 1;
      }
    }
  }
  return { width, height, pixels: output, changedPixels, seed, intensity, monochrome };
}

export function depthOfFieldPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: DepthOfFieldOptions
): DepthOfFieldResult {
  validatePixelBuffer(pixels, width, height, "Depth of field");
  const focusDepth = options.focusDepth ?? 0.5;
  const focusRange = options.focusRange ?? 0.12;
  const maxRadius = options.maxRadius ?? 2;
  validateRange(focusDepth, 0, 1, "Depth of field focusDepth");
  validateRange(focusRange, 0.001, 1, "Depth of field focusRange");
  if (!Number.isInteger(maxRadius) || maxRadius < 0 || maxRadius > 8) {
    throw new Error("Depth of field maxRadius must be an integer in [0, 8].");
  }
  const depthTexture = requireDepthTextureBinding(options.depth, "Depth of field");
  if (depthTexture.width !== width || depthTexture.height !== height) {
    throw new Error("Depth of field depth texture dimensions must match source pixels.");
  }
  const output = new Uint8Array(pixels);
  let blurredPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const depth = depthAt(depthTexture, x, y);
      const radius = Math.min(maxRadius, Math.round(Math.max(0, Math.abs(depth - focusDepth) - focusRange) / Math.max(focusRange, 0.001) * maxRadius));
      if (radius === 0) continue;
      blurredPixels += 1;
      const index = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let samples = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.hypot(offsetX, offsetY) > radius + 0.01) continue;
          const sampleX = clampInt(x + offsetX, 0, width - 1);
          const sampleY = clampInt(y + offsetY, 0, height - 1);
          const sampleIndex = (sampleY * width + sampleX) * 4;
          red += pixels[sampleIndex] ?? 0;
          green += pixels[sampleIndex + 1] ?? 0;
          blue += pixels[sampleIndex + 2] ?? 0;
          samples += 1;
        }
      }
      output[index] = clampByte(red / samples);
      output[index + 1] = clampByte(green / samples);
      output[index + 2] = clampByte(blue / samples);
      output[index + 3] = pixels[index + 3] ?? 255;
    }
  }
  return { width, height, pixels: output, blurredPixels, maxBlurRadius: maxRadius, focusDepth, focusRange };
}

export function motionBlurPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: MotionBlurOptions
): MotionBlurResult {
  validatePixelBuffer(pixels, width, height, "Motion blur");
  const samples = options.samples ?? 5;
  const scale = options.scale ?? 1;
  if (!Number.isInteger(samples) || samples < 2 || samples > 16) {
    throw new Error("Motion blur samples must be an integer in [2, 16].");
  }
  if (!Number.isFinite(scale) || scale < 0 || scale > 8) {
    throw new Error("Motion blur scale must be finite in [0, 8].");
  }
  if (options.velocity.length !== width * height * 2) {
    throw new Error("Motion blur velocity must contain width * height * 2 float samples.");
  }
  const output = new Uint8Array(pixels);
  let blurredPixels = 0;
  let maxVelocityPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const velocityIndex = (y * width + x) * 2;
      const vx = (options.velocity[velocityIndex] ?? 0) * scale;
      const vy = (options.velocity[velocityIndex + 1] ?? 0) * scale;
      const velocityPixels = Math.hypot(vx, vy);
      maxVelocityPixels = Math.max(maxVelocityPixels, velocityPixels);
      if (velocityPixels < 0.01) continue;
      blurredPixels += 1;
      const index = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let sample = 0; sample < samples; sample += 1) {
        const t = samples === 1 ? 0 : sample / (samples - 1) - 0.5;
        const sampleX = clampInt(Math.round(x - vx * t), 0, width - 1);
        const sampleY = clampInt(Math.round(y - vy * t), 0, height - 1);
        const sampleIndex = (sampleY * width + sampleX) * 4;
        red += pixels[sampleIndex] ?? 0;
        green += pixels[sampleIndex + 1] ?? 0;
        blue += pixels[sampleIndex + 2] ?? 0;
      }
      output[index] = clampByte(red / samples);
      output[index + 1] = clampByte(green / samples);
      output[index + 2] = clampByte(blue / samples);
      output[index + 3] = pixels[index + 3] ?? 255;
    }
  }
  return { width, height, pixels: output, blurredPixels, samples, maxVelocityPixels };
}

export function ssaoPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: SSAOOptions
): SSAOResult {
  validatePixelBuffer(pixels, width, height, "SSAO");
  const depthTexture = requireDepthTextureBinding(options.depth, "SSAO");
  if (depthTexture.width !== width || depthTexture.height !== height) {
    throw new Error("SSAO depth texture dimensions must match source pixels.");
  }
  const radius = options.radius ?? 2;
  const intensity = options.intensity ?? 0.38;
  const bias = options.bias ?? 0.015;
  if (!Number.isInteger(radius) || radius < 1 || radius > 8) {
    throw new Error("SSAO radius must be an integer in [1, 8].");
  }
  validateRange(intensity, 0, 2, "SSAO intensity");
  validateRange(bias, 0, 0.25, "SSAO bias");
  const output = new Uint8Array(pixels);
  let occludedPixels = 0;
  let occlusionTotal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const centerDepth = depthAt(depthTexture, x, y);
      let occlusion = 0;
      let samples = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += radius) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += radius) {
          if (offsetX === 0 && offsetY === 0) continue;
          const sampleDepth = depthAt(depthTexture, clampInt(x + offsetX, 0, width - 1), clampInt(y + offsetY, 0, height - 1));
          occlusion += Math.max(0, Math.min(1, (centerDepth - sampleDepth - bias) / (0.14 + radius * 0.04)));
          samples += 1;
        }
      }
      const factor = Math.max(0.18, 1 - (occlusion / Math.max(1, samples)) * intensity * 0.72);
      if (factor < 0.995) occludedPixels += 1;
      occlusionTotal += 1 - factor;
      const index = (y * width + x) * 4;
      output[index] = clampByte((pixels[index] ?? 0) * factor);
      output[index + 1] = clampByte((pixels[index + 1] ?? 0) * factor);
      output[index + 2] = clampByte((pixels[index + 2] ?? 0) * factor);
      output[index + 3] = pixels[index + 3] ?? 255;
    }
  }
  return { width, height, pixels: output, occludedPixels, averageOcclusion: Number((occlusionTotal / (width * height)).toFixed(6)), radius, intensity };
}

export function contactShadowPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: ContactShadowPostProcessOptions
): ContactShadowPostProcessResult {
  validatePixelBuffer(pixels, width, height, "Contact shadow");
  const depthTexture = requireDepthTextureBinding(options.depth, "Contact shadow");
  if (depthTexture.width !== width || depthTexture.height !== height) {
    throw new Error("Contact shadow depth texture dimensions must match source pixels.");
  }
  const radius = options.radius ?? 4;
  const intensity = options.intensity ?? 0.72;
  const bias = options.bias ?? 0.008;
  const thickness = options.thickness ?? 0.12;
  if (!Number.isInteger(radius) || radius < 1 || radius > 16) {
    throw new Error("Contact shadow radius must be an integer in [1, 16].");
  }
  validateRange(intensity, 0, 2, "Contact shadow intensity");
  validateRange(bias, 0, 0.25, "Contact shadow bias");
  validateRange(thickness, 0.005, 1, "Contact shadow thickness");
  const direction = normalizeContactShadowDirection(options.direction ?? [0.35, 0.8]);
  const output = new Uint8Array(pixels);
  let contactPixels = 0;
  let darkeningTotal = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const receiverDepth = depthAt(depthTexture, x, y);
      let contact = 0;
      for (let step = 1; step <= radius; step += 1) {
        const longitudinal = step / radius;
        const lateralRadius = Math.max(1, Math.round(radius * 0.28 * (1 - longitudinal * 0.35)));
        for (let side = -lateralRadius; side <= lateralRadius; side += 1) {
          const offsetX = direction[0] * step + -direction[1] * side;
          const offsetY = direction[1] * step + direction[0] * side;
          const sampleX = clampInt(Math.round(x - offsetX), 0, width - 1);
          const sampleY = clampInt(Math.round(y - offsetY), 0, height - 1);
          const casterDepth = depthAt(depthTexture, sampleX, sampleY);
          const depthGap = receiverDepth - casterDepth - bias;
          if (depthGap <= 0 || depthGap > thickness) continue;
          const spatialFalloff = Math.max(0, 1 - longitudinal);
          const lateralFalloff = Math.max(0, 1 - Math.abs(side) / (lateralRadius + 1));
          const depthFalloff = 1 - depthGap / thickness;
          contact = Math.max(contact, spatialFalloff * lateralFalloff * depthFalloff);
        }
      }
      if (contact <= 0) continue;
      const shadow = Math.min(0.82, contact * intensity * 0.72);
      const factor = 1 - shadow;
      const index = (y * width + x) * 4;
      output[index] = clampByte((pixels[index] ?? 0) * factor);
      output[index + 1] = clampByte((pixels[index + 1] ?? 0) * factor);
      output[index + 2] = clampByte((pixels[index + 2] ?? 0) * factor);
      output[index + 3] = pixels[index + 3] ?? 255;
      contactPixels += 1;
      darkeningTotal += shadow;
    }
  }

  return {
    width,
    height,
    pixels: output,
    contactPixels,
    averageContactDarkening: Number((darkeningTotal / Math.max(1, contactPixels)).toFixed(6)),
    radius,
    intensity,
    mode: "screen-space-depth-contact"
  };
}

export function ssrPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: SSROptions
): SSRResult {
  validatePixelBuffer(pixels, width, height, "SSR");
  const depthTexture = requireDepthTextureBinding(options.depth, "SSR");
  if (depthTexture.width !== width || depthTexture.height !== height) {
    throw new Error("SSR depth texture dimensions must match source pixels.");
  }
  const intensity = options.intensity ?? 0.32;
  const maxDistance = options.maxDistance ?? 16;
  validateRange(intensity, 0, 2, "SSR intensity");
  if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 64) {
    throw new Error("SSR maxDistance must be an integer in [1, 64].");
  }
  const output = new Uint8Array(pixels);
  let reflectedPixels = 0;
  let maxReflectionBoost = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const depth = depthAt(depthTexture, x, y);
      const rayDistance = Math.max(1, Math.round((1 - depth) * maxDistance));
      const sampleX = clampInt(x + (x < width / 2 ? rayDistance : -rayDistance), 0, width - 1);
      const sampleY = clampInt(height - 1 - y, 0, height - 1);
      const sourceIndex = (sampleY * width + sampleX) * 4;
      const targetIndex = (y * width + x) * 4;
      const sourceLuma = ((pixels[sourceIndex] ?? 0) + (pixels[sourceIndex + 1] ?? 0) + (pixels[sourceIndex + 2] ?? 0)) / (3 * 255);
      if (sourceLuma < 0.18 || depth > 0.92) continue;
      const boost = sourceLuma * intensity * (1 - depth);
      maxReflectionBoost = Math.max(maxReflectionBoost, boost);
      reflectedPixels += 1;
      output[targetIndex] = clampByte((pixels[targetIndex] ?? 0) + (pixels[sourceIndex] ?? 0) * boost);
      output[targetIndex + 1] = clampByte((pixels[targetIndex + 1] ?? 0) + (pixels[sourceIndex + 1] ?? 0) * boost);
      output[targetIndex + 2] = clampByte((pixels[targetIndex + 2] ?? 0) + (pixels[sourceIndex + 2] ?? 0) * boost);
      output[targetIndex + 3] = pixels[targetIndex + 3] ?? 255;
    }
  }
  return { width, height, pixels: output, reflectedPixels, maxReflectionBoost: Number(maxReflectionBoost.toFixed(6)), intensity, maxDistance };
}

export function taaPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: TAAOptions
): TAAResult {
  validatePixelBuffer(pixels, width, height, "TAA");
  if (options.history.byteLength !== pixels.byteLength) {
    throw new Error("TAA history must contain width * height * 4 RGBA bytes.");
  }
  const blend = options.blend ?? 0.18;
  validateRange(blend, 0, 0.95, "TAA blend");
  const output = new Uint8Array(pixels.byteLength);
  let blendedPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    output[index] = clampByte((pixels[index] ?? 0) * (1 - blend) + (options.history[index] ?? 0) * blend);
    output[index + 1] = clampByte((pixels[index + 1] ?? 0) * (1 - blend) + (options.history[index + 1] ?? 0) * blend);
    output[index + 2] = clampByte((pixels[index + 2] ?? 0) * (1 - blend) + (options.history[index + 2] ?? 0) * blend);
    output[index + 3] = pixels[index + 3] ?? 255;
    if (Math.abs(output[index]! - (pixels[index] ?? 0)) + Math.abs(output[index + 1]! - (pixels[index + 1] ?? 0)) + Math.abs(output[index + 2]! - (pixels[index + 2] ?? 0)) > 0) {
      blendedPixels += 1;
    }
  }
  return { width, height, pixels: output, blendedPixels, blend };
}

export function bloomPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: BloomOptions = {}
): BloomResult {
  validatePixelBuffer(pixels, width, height, "Bloom");
  const threshold = options.threshold ?? 0.75;
  const intensity = options.intensity ?? 0.35;
  const radius = options.radius ?? 1;
  validateBloomOptions(threshold, intensity, radius);

  const { pixels: brightPixels, brightPixelCount, brightEnergy } = extractBloomBrightPixels(pixels, width, height, threshold);
  const horizontalBlurPixels = blurBloomPixelsHorizontal(brightPixels, width, height, radius);
  const verticalBlurPixels = blurBloomPixelsVertical(horizontalBlurPixels, width, height, radius);
  const composite = compositeBloomPixels(pixels, verticalBlurPixels, width, height, intensity, brightPixels);
  return {
    width,
    height,
    pixels: composite.pixels,
    brightPixels,
    horizontalBlurPixels,
    verticalBlurPixels,
    brightPixelCount,
    brightEnergy,
    maxNeighborBoost: composite.maxNeighborBoost,
    changedPixels: composite.changedPixels,
    maxChannelDelta: composite.maxChannelDelta,
    pipeline: ["bright-extract", "horizontal-blur", "vertical-blur", "composite"]
  };
}

export function extractBloomBrightPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  threshold: number
): { readonly pixels: Uint8Array; readonly brightPixelCount: number; readonly brightEnergy: number } {
  validatePixelBuffer(pixels, width, height, "Bloom bright extraction");
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Bloom threshold must be finite and in [0, 1].");
  }
  const brightPixels = new Uint8Array(pixels.byteLength);
  let brightPixelCount = 0;
  let brightEnergy = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255;
    if (luma >= threshold) {
      brightPixelCount += 1;
      brightEnergy += luma;
      brightPixels[index] = pixels[index]!;
      brightPixels[index + 1] = pixels[index + 1]!;
      brightPixels[index + 2] = pixels[index + 2]!;
      brightPixels[index + 3] = pixels[index + 3]!;
    }
  }
  return { pixels: brightPixels, brightPixelCount, brightEnergy };
}

export function blurBloomPixelsHorizontal(pixels: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  validatePixelBuffer(pixels, width, height, "Bloom horizontal blur");
  validateBloomBlurRadius(radius);
  const kernelSize = radius * 2 + 1;
  const output = new Uint8Array(pixels.byteLength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const sampleX = clampInt(x + offsetX, 0, width - 1);
        const sampleIndex = (y * width + sampleX) * 4;
        red += pixels[sampleIndex]!;
        green += pixels[sampleIndex + 1]!;
        blue += pixels[sampleIndex + 2]!;
        alpha += pixels[sampleIndex + 3]!;
      }
      output[targetIndex] = clampByte(red / kernelSize);
      output[targetIndex + 1] = clampByte(green / kernelSize);
      output[targetIndex + 2] = clampByte(blue / kernelSize);
      output[targetIndex + 3] = clampByte(alpha / kernelSize);
    }
  }
  return output;
}

export function blurBloomPixelsVertical(pixels: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  validatePixelBuffer(pixels, width, height, "Bloom vertical blur");
  validateBloomBlurRadius(radius);
  const kernelSize = radius * 2 + 1;
  const output = new Uint8Array(pixels.byteLength);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = clampInt(y + offsetY, 0, height - 1);
        const sampleIndex = (sampleY * width + x) * 4;
        red += pixels[sampleIndex]!;
        green += pixels[sampleIndex + 1]!;
        blue += pixels[sampleIndex + 2]!;
        alpha += pixels[sampleIndex + 3]!;
      }
      output[targetIndex] = clampByte(red / kernelSize);
      output[targetIndex + 1] = clampByte(green / kernelSize);
      output[targetIndex + 2] = clampByte(blue / kernelSize);
      output[targetIndex + 3] = clampByte(alpha / kernelSize);
    }
  }
  return output;
}

export function compositeBloomPixels(
  sourcePixels: Uint8Array,
  blurredPixels: Uint8Array,
  width: number,
  height: number,
  intensity: number,
  brightPixels?: Uint8Array
): { readonly pixels: Uint8Array; readonly maxNeighborBoost: number; readonly changedPixels: number; readonly maxChannelDelta: number } {
  validatePixelBuffer(sourcePixels, width, height, "Bloom composite source");
  validatePixelBuffer(blurredPixels, width, height, "Bloom composite blur");
  if (brightPixels) validatePixelBuffer(brightPixels, width, height, "Bloom composite bright source");
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new Error("Bloom intensity must be finite and non-negative.");
  }
  const output = new Uint8Array(sourcePixels);
  let maxNeighborBoost = 0;
  let changedPixels = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < sourcePixels.length; index += 4) {
    const previousRed = output[index]!;
    const previousGreen = output[index + 1]!;
    const previousBlue = output[index + 2]!;
    const redBoost = blurredPixels[index]! * intensity;
    const greenBoost = blurredPixels[index + 1]! * intensity;
    const blueBoost = blurredPixels[index + 2]! * intensity;
    output[index] = clampByte(output[index]! + redBoost);
    output[index + 1] = clampByte(output[index + 1]! + greenBoost);
    output[index + 2] = clampByte(output[index + 2]! + blueBoost);
    output[index + 3] = sourcePixels[index + 3]!;
    const redDelta = Math.abs(output[index]! - previousRed);
    const greenDelta = Math.abs(output[index + 1]! - previousGreen);
    const blueDelta = Math.abs(output[index + 2]! - previousBlue);
    const pixelDelta = Math.max(redDelta, greenDelta, blueDelta);
    if (pixelDelta > 0) {
      changedPixels += 1;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    }
    if (!brightPixels || (brightPixels[index] === 0 && brightPixels[index + 1] === 0 && brightPixels[index + 2] === 0)) {
      maxNeighborBoost = Math.max(maxNeighborBoost, redBoost, greenBoost, blueBoost);
    }
  }
  return { pixels: output, maxNeighborBoost, changedPixels, maxChannelDelta };
}

export function bloomFloatPixels(
  pixels: Float32Array,
  width: number,
  height: number,
  options: BloomOptions = {}
): HdrBloomResult {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("HDR bloom dimensions must be positive integers.");
  }
  if (pixels.length !== width * height * 4) {
    throw new Error("HDR bloom input must contain width * height * 4 RGBA float values.");
  }
  const threshold = options.threshold ?? 0.75;
  const intensity = options.intensity ?? 0.35;
  const radius = options.radius ?? 1;
  validateBloomOptions(threshold, intensity, radius);

  const brightPixels = new Float32Array(pixels.length);
  let brightPixelCount = 0;
  let brightEnergy = 0;
  let maxInputValue = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = finiteHdrChannel(pixels[index]!, index);
    const green = finiteHdrChannel(pixels[index + 1]!, index + 1);
    const blue = finiteHdrChannel(pixels[index + 2]!, index + 2);
    const alpha = finiteHdrChannel(pixels[index + 3]!, index + 3);
    maxInputValue = Math.max(maxInputValue, red, green, blue);
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (luma >= threshold) {
      brightPixelCount += 1;
      brightEnergy += luma;
      brightPixels[index] = red;
      brightPixels[index + 1] = green;
      brightPixels[index + 2] = blue;
      brightPixels[index + 3] = alpha;
    }
  }

  const horizontalBlurPixels = blurBloomFloatPixelsHorizontal(brightPixels, width, height, radius);
  const verticalBlurPixels = blurBloomFloatPixelsVertical(horizontalBlurPixels, width, height, radius);
  const composite = compositeBloomFloatPixels(pixels, verticalBlurPixels, width, height, intensity, brightPixels);

  return {
    width,
    height,
    pixels: composite.pixels,
    brightPixels,
    horizontalBlurPixels,
    verticalBlurPixels,
    brightPixelCount,
    brightEnergy: Number(brightEnergy.toFixed(6)),
    maxNeighborBoost: Number(composite.maxNeighborBoost.toFixed(6)),
    changedPixels: composite.changedPixels,
    maxChannelDelta: Number(composite.maxChannelDelta.toFixed(6)),
    maxInputValue: Number(maxInputValue.toFixed(6)),
    pipeline: ["bright-extract", "horizontal-blur", "vertical-blur", "composite"]
  };
}

function blurBloomFloatPixelsHorizontal(pixels: Float32Array, width: number, height: number, radius: number): Float32Array {
  validateFloatPixelBuffer(pixels, width, height, "HDR bloom horizontal blur");
  validateBloomBlurRadius(radius);
  const kernelSize = radius * 2 + 1;
  const output = new Float32Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const sampleX = clampInt(x + offsetX, 0, width - 1);
        const sampleIndex = (y * width + sampleX) * 4;
        red += finiteHdrChannel(pixels[sampleIndex]!, sampleIndex);
        green += finiteHdrChannel(pixels[sampleIndex + 1]!, sampleIndex + 1);
        blue += finiteHdrChannel(pixels[sampleIndex + 2]!, sampleIndex + 2);
        alpha += finiteHdrChannel(pixels[sampleIndex + 3]!, sampleIndex + 3);
      }
      output[targetIndex] = red / kernelSize;
      output[targetIndex + 1] = green / kernelSize;
      output[targetIndex + 2] = blue / kernelSize;
      output[targetIndex + 3] = alpha / kernelSize;
    }
  }
  return output;
}

function blurBloomFloatPixelsVertical(pixels: Float32Array, width: number, height: number, radius: number): Float32Array {
  validateFloatPixelBuffer(pixels, width, height, "HDR bloom vertical blur");
  validateBloomBlurRadius(radius);
  const kernelSize = radius * 2 + 1;
  const output = new Float32Array(pixels.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        const sampleY = clampInt(y + offsetY, 0, height - 1);
        const sampleIndex = (sampleY * width + x) * 4;
        red += finiteHdrChannel(pixels[sampleIndex]!, sampleIndex);
        green += finiteHdrChannel(pixels[sampleIndex + 1]!, sampleIndex + 1);
        blue += finiteHdrChannel(pixels[sampleIndex + 2]!, sampleIndex + 2);
        alpha += finiteHdrChannel(pixels[sampleIndex + 3]!, sampleIndex + 3);
      }
      output[targetIndex] = red / kernelSize;
      output[targetIndex + 1] = green / kernelSize;
      output[targetIndex + 2] = blue / kernelSize;
      output[targetIndex + 3] = alpha / kernelSize;
    }
  }
  return output;
}

function compositeBloomFloatPixels(
  sourcePixels: Float32Array,
  blurredPixels: Float32Array,
  width: number,
  height: number,
  intensity: number,
  brightPixels?: Float32Array
): { readonly pixels: Float32Array; readonly maxNeighborBoost: number; readonly changedPixels: number; readonly maxChannelDelta: number } {
  validateFloatPixelBuffer(sourcePixels, width, height, "HDR bloom composite source");
  validateFloatPixelBuffer(blurredPixels, width, height, "HDR bloom composite blur");
  if (brightPixels) validateFloatPixelBuffer(brightPixels, width, height, "HDR bloom composite bright source");
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new Error("Bloom intensity must be finite and non-negative.");
  }
  const output = new Float32Array(sourcePixels);
  let maxNeighborBoost = 0;
  let changedPixels = 0;
  let maxChannelDelta = 0;
  for (let index = 0; index < sourcePixels.length; index += 4) {
    const previousRed = finiteHdrChannel(output[index]!, index);
    const previousGreen = finiteHdrChannel(output[index + 1]!, index + 1);
    const previousBlue = finiteHdrChannel(output[index + 2]!, index + 2);
    const redBoost = finiteHdrChannel(blurredPixels[index]!, index) * intensity;
    const greenBoost = finiteHdrChannel(blurredPixels[index + 1]!, index + 1) * intensity;
    const blueBoost = finiteHdrChannel(blurredPixels[index + 2]!, index + 2) * intensity;
    output[index] = previousRed + redBoost;
    output[index + 1] = previousGreen + greenBoost;
    output[index + 2] = previousBlue + blueBoost;
    output[index + 3] = finiteHdrChannel(output[index + 3]!, index + 3);
    const pixelDelta = Math.max(
      Math.abs(output[index]! - previousRed),
      Math.abs(output[index + 1]! - previousGreen),
      Math.abs(output[index + 2]! - previousBlue)
    );
    if (pixelDelta > 0) {
      changedPixels += 1;
      maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
    }
    if (!brightPixels || (brightPixels[index] === 0 && brightPixels[index + 1] === 0 && brightPixels[index + 2] === 0)) {
      maxNeighborBoost = Math.max(maxNeighborBoost, redBoost, greenBoost, blueBoost);
    }
  }
  return { pixels: output, maxNeighborBoost, changedPixels, maxChannelDelta };
}

export function createDepthTextureBinding(options: {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  readonly data?: Float32Array;
}): DepthTextureBinding {
  const { label, width, height } = options;
  if (!label) throw new Error("Depth texture label is required.");
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error("Depth texture dimensions must be positive integers.");
  }
  const data = options.data ? new Float32Array(options.data) : new Float32Array(width * height);
  if (data.length !== width * height) {
    throw new Error("Depth texture data must contain width * height float samples.");
  }
  for (const value of data) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("Depth texture samples must be finite normalized values in [0, 1].");
    }
  }
  return { label, width, height, format: "depth24", data };
}

export function createToneMappingCalibration(options: Required<ToneMappingOptions>): ToneMappingCalibration {
  const samples = [0, 0.18, 0.5, 1].map((inputLinear) => {
    const mappedLinear = applyToneMapping(inputLinear, options.exposure, options.whitePoint, options.operator);
    return {
      inputLinear,
      mappedLinear,
      encodedByte: encodeColorByte(mappedLinear, options.gamma, options.outputColorSpace)
    };
  });
  return {
    operator: options.operator,
    exposure: options.exposure,
    whitePoint: options.whitePoint,
    gamma: options.gamma,
    inputColorSpace: options.inputColorSpace,
    outputColorSpace: options.outputColorSpace,
    samples,
    monotonic: samples.every((sample, index) => index === 0 || sample.encodedByte >= samples[index - 1]!.encodedByte)
  };
}

export function visualizeDepthTexture(
  texture: DepthTextureBinding,
  options: { readonly edgeThreshold?: number } = {}
): DepthVisualizationResult {
  const edgeThreshold = options.edgeThreshold ?? 0.08;
  if (!Number.isFinite(edgeThreshold) || edgeThreshold < 0 || edgeThreshold > 1) {
    throw new Error("Depth visualization edgeThreshold must be finite and in [0, 1].");
  }
  const stats = depthTextureStats(texture, edgeThreshold);
  const pixels = new Uint8Array(texture.width * texture.height * 4);
  for (let y = 0; y < texture.height; y += 1) {
    for (let x = 0; x < texture.width; x += 1) {
      const pixelIndex = (y * texture.width + x) * 4;
      const depth = depthAt(texture, x, y);
      const edge = isDepthEdge(texture, x, y, edgeThreshold);
      const shade = clampByte((1 - depth) * 255);
      pixels[pixelIndex] = edge ? 255 : shade;
      pixels[pixelIndex + 1] = edge ? 98 : shade;
      pixels[pixelIndex + 2] = edge ? 36 : shade;
      pixels[pixelIndex + 3] = 255;
    }
  }
  return { width: texture.width, height: texture.height, pixels, stats };
}

export function depthTextureStats(texture: DepthTextureBinding, edgeThreshold = 0.08): DepthTextureStats {
  if (texture.data.length !== texture.width * texture.height) {
    throw new Error("Depth texture data length does not match dimensions.");
  }
  let minDepth = Number.POSITIVE_INFINITY;
  let maxDepth = Number.NEGATIVE_INFINITY;
  let edgePixelCount = 0;
  for (let y = 0; y < texture.height; y += 1) {
    for (let x = 0; x < texture.width; x += 1) {
      const depth = depthAt(texture, x, y);
      minDepth = Math.min(minDepth, depth);
      maxDepth = Math.max(maxDepth, depth);
      if (isDepthEdge(texture, x, y, edgeThreshold)) edgePixelCount += 1;
    }
  }
  return {
    label: texture.label,
    width: texture.width,
    height: texture.height,
    format: texture.format,
    byteLength: texture.data.byteLength,
    minDepth,
    maxDepth,
    centerDepth: depthAt(texture, Math.floor(texture.width / 2), Math.floor(texture.height / 2)),
    nearSample: depthAt(texture, Math.floor(texture.width * 0.48), Math.floor(texture.height * 0.44)),
    farSample: depthAt(texture, 1, 1),
    edgePixelCount
  };
}

export function fxaaPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  options: FXAAOptions = {}
): FXAAResult {
  validatePixelBuffer(pixels, width, height, "FXAA");
  const edgeThreshold = options.edgeThreshold ?? 0.125;
  const subpixelBlend = options.subpixelBlend ?? 0.75;
  validateFXAAOptions(edgeThreshold, subpixelBlend);

  const output = new Uint8Array(pixels);
  const edgeMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const centerLuma = lumaAt(pixels, width, height, x, y);
      const northLuma = lumaAt(pixels, width, height, x, y - 1);
      const southLuma = lumaAt(pixels, width, height, x, y + 1);
      const westLuma = lumaAt(pixels, width, height, x - 1, y);
      const eastLuma = lumaAt(pixels, width, height, x + 1, y);
      const minLuma = Math.min(centerLuma, northLuma, southLuma, westLuma, eastLuma);
      const maxLuma = Math.max(centerLuma, northLuma, southLuma, westLuma, eastLuma);
      if (maxLuma - minLuma < edgeThreshold) {
        continue;
      }

      edgeMask[y * width + x] = 255;
      for (let channel = 0; channel < 3; channel += 1) {
        const average = (
          channelAt(pixels, width, height, x, y - 1, channel)
          + channelAt(pixels, width, height, x, y + 1, channel)
          + channelAt(pixels, width, height, x - 1, y, channel)
          + channelAt(pixels, width, height, x + 1, y, channel)
        ) / 4;
        output[index + channel] = clampByte(pixels[index + channel]! * (1 - subpixelBlend) + average * subpixelBlend);
      }
      output[index + 3] = pixels[index + 3]!;
    }
  }

  return { width, height, pixels: output, edgeMask };
}

export function fusedLdrPostprocessPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  passes: readonly FusedLdrPostProcessPass[],
  options: FusedLdrPostProcessOptions = {}
): Uint8Array {
  validatePixelBuffer(pixels, width, height, "Fused LDR postprocess");
  const toneMapping = passes.find((pass) => pass.name === "tone-mapping");
  const colorGrade = passes.find((pass) => pass.name === "color-grade");
  const fxaa = passes.find((pass) => pass.name === "fxaa");
  const toneMappingLookup = toneMapping
    ? getToneMappingLookup(
        {
          ...(options.toneMappingDefaults ?? {}),
          ...(toneMapping.options as ToneMappingOptions)
        },
        options.scratch
      )
    : undefined;
  const colorGradeSettings = colorGrade ? normalizeColorGradeOptions(colorGrade.options as ColorGradeOptions) : undefined;
  const byteLength = pixels.byteLength;
  let current = pixels;

  if (toneMappingLookup || colorGradeSettings) {
    const target = options.mutateInput
      ? pixels
      : acquireFusedLdrBuffer(options.scratch, byteLength, 0);
    const vignetteFactors = colorGradeSettings && colorGradeSettings.vignette > 0
      ? getVignetteFactors(width, height, colorGradeSettings.vignette, options.scratch)
      : undefined;
    applyToneMappingAndColorGrade(pixels, target, width, height, toneMappingLookup, colorGradeSettings, vignetteFactors);
    current = target;
  }

  if (colorGradeSettings && colorGradeSettings.sharpening > 0) {
    const target = acquireFusedLdrBuffer(options.scratch, byteLength, current === options.scratch?.bufferA ? 1 : 0);
    sharpenPixelsInto(current, target, width, height, colorGradeSettings.sharpening);
    current = target;
  }

  if (fxaa) {
    const settings = normalizeFXAAOptions(fxaa.options as FXAAOptions);
    const target = acquireFusedLdrBuffer(options.scratch, byteLength, current === options.scratch?.bufferA ? 1 : 0);
    fxaaPixelsInto(current, target, width, height, settings.edgeThreshold, settings.subpixelBlend);
    current = target;
  }

  return current;
}

function validatePixelBuffer(pixels: Uint8Array, width: number, height: number, label: string): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`${label} dimensions must be positive integers.`);
  }
  if (pixels.byteLength !== width * height * 4) {
    throw new Error(`${label} input must contain width * height * 4 RGBA bytes.`);
  }
}

function validateFloatPixelBuffer(pixels: Float32Array, width: number, height: number, label: string): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`${label} dimensions must be positive integers.`);
  }
  if (pixels.length !== width * height * 4) {
    throw new Error(`${label} input must contain width * height * 4 RGBA float values.`);
  }
}

function requireDepthTextureBinding(depth: DepthTextureBinding | undefined, label: string): DepthTextureBinding {
  if (!depth) {
    throw new Error(`${label} requires a depth texture binding. Renderer-owned postprocess passes inject this automatically when the backend exposes depth readback.`);
  }
  return depth;
}

function validateFXAAOptions(edgeThreshold: number, subpixelBlend: number): void {
  if (!Number.isFinite(edgeThreshold) || edgeThreshold < 0 || edgeThreshold > 1) {
    throw new Error("FXAA edgeThreshold must be finite and in [0, 1].");
  }
  if (!Number.isFinite(subpixelBlend) || subpixelBlend < 0 || subpixelBlend > 1) {
    throw new Error("FXAA subpixelBlend must be finite and in [0, 1].");
  }
}

function normalizeColorGradeOptions(options: ColorGradeOptions): Required<ColorGradeOptions> {
  const settings = {
    contrast: options.contrast ?? 1,
    temperature: options.temperature ?? 0,
    tint: options.tint ?? 0,
    saturation: options.saturation ?? 1,
    vibrance: options.vibrance ?? 0,
    vignette: options.vignette ?? 0,
    sharpening: options.sharpening ?? 0
  };
  validateRange(settings.contrast, 0, 3, "Color grading contrast");
  validateRange(settings.temperature, -1, 1, "Color grading temperature");
  validateRange(settings.tint, -1, 1, "Color grading tint");
  validateRange(settings.saturation, 0, 3, "Color grading saturation");
  validateRange(settings.vibrance, -1, 1, "Color grading vibrance");
  validateRange(settings.vignette, 0, 1, "Color grading vignette");
  validateRange(settings.sharpening, 0, 2, "Color grading sharpening");
  return settings;
}

function normalizeFXAAOptions(options: FXAAOptions): Required<FXAAOptions> {
  const settings = {
    edgeThreshold: options.edgeThreshold ?? 0.125,
    subpixelBlend: options.subpixelBlend ?? 0.75
  };
  validateFXAAOptions(settings.edgeThreshold, settings.subpixelBlend);
  return settings;
}

function acquireFusedLdrBuffer(scratch: FusedLdrPostProcessScratch | undefined, byteLength: number, slot: 0 | 1): Uint8Array {
  if (!scratch) return new Uint8Array(byteLength);
  if (slot === 0) {
    if (!scratch.bufferA || scratch.bufferA.byteLength !== byteLength) {
      scratch.bufferA = new Uint8Array(byteLength);
    }
    return scratch.bufferA;
  }
  if (!scratch.bufferB || scratch.bufferB.byteLength !== byteLength) {
    scratch.bufferB = new Uint8Array(byteLength);
  }
  return scratch.bufferB;
}

function getToneMappingLookup(options: ToneMappingOptions, scratch: FusedLdrPostProcessScratch | undefined): Uint8Array {
  const exposure = options.exposure ?? 1;
  const whitePoint = options.whitePoint ?? 1;
  const gamma = options.gamma ?? 2.2;
  const operator = options.operator ?? "reinhard";
  const inputColorSpace = options.inputColorSpace ?? "linear";
  const outputColorSpace = options.outputColorSpace ?? "linear";
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new Error("Tone mapping exposure must be finite and non-negative.");
  }
  if (!Number.isFinite(whitePoint) || whitePoint <= 0) {
    throw new Error("Tone mapping whitePoint must be finite and positive.");
  }
  if (!Number.isFinite(gamma) || gamma <= 0) {
    throw new Error("Tone mapping gamma must be finite and positive.");
  }
  const key = `${exposure}|${whitePoint}|${gamma}|${operator}|${inputColorSpace}|${outputColorSpace}`;
  if (scratch?.toneMappingLookup && scratch.toneMappingLookupKey === key) {
    return scratch.toneMappingLookup;
  }
  const lookup = scratch?.toneMappingLookup ?? new Uint8Array(256);
  for (let value = 0; value < 256; value += 1) {
    lookup[value] = encodeToneMappedChannel(decodeColorByte(value, inputColorSpace), exposure, whitePoint, gamma, operator, outputColorSpace);
  }
  if (scratch) {
    scratch.toneMappingLookup = lookup;
    scratch.toneMappingLookupKey = key;
  }
  return lookup;
}

function getVignetteFactors(
  width: number,
  height: number,
  vignette: number,
  scratch: FusedLdrPostProcessScratch | undefined
): Float32Array {
  const key = `${width}x${height}|${vignette}`;
  if (scratch?.vignetteFactors && scratch.vignetteFactorsKey === key) {
    return scratch.vignetteFactors;
  }
  const factors = scratch?.vignetteFactors && scratch.vignetteFactors.length === width * height
    ? scratch.vignetteFactors
    : new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const centerY = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
    for (let x = 0; x < width; x += 1) {
      const centerX = width <= 1 ? 0 : (x / (width - 1)) * 2 - 1;
      factors[y * width + x] = 1 - vignette * Math.min(1, Math.max(0, Math.sqrt(centerX * centerX + centerY * centerY) - 0.28) / 1.12);
    }
  }
  if (scratch) {
    scratch.vignetteFactors = factors;
    scratch.vignetteFactorsKey = key;
  }
  return factors;
}

function applyToneMappingAndColorGrade(
  input: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  toneMappingLookup: Uint8Array | undefined,
  colorGradeSettings: Required<ColorGradeOptions> | undefined,
  vignetteFactors: Float32Array | undefined
): void {
  const contrast = colorGradeSettings?.contrast ?? 1;
  const contrastOffset = 0.5 - 0.5 * contrast;
  const temperature = colorGradeSettings?.temperature ?? 0;
  const tint = colorGradeSettings?.tint ?? 0;
  const redShift = temperature * 0.08 - tint * 0.02;
  const greenShift = tint * 0.06;
  const blueShift = -temperature * 0.08 - tint * 0.02;
  const saturationBase = colorGradeSettings?.saturation ?? 1;
  const vibrance = colorGradeSettings?.vibrance ?? 0;
  const applyColorGrade = colorGradeSettings !== undefined;

  for (let pixel = 0, index = 0; pixel < width * height; pixel += 1, index += 4) {
    const toneRed = toneMappingLookup ? toneMappingLookup[input[index]!]! : input[index]!;
    const toneGreen = toneMappingLookup ? toneMappingLookup[input[index + 1]!]! : input[index + 1]!;
    const toneBlue = toneMappingLookup ? toneMappingLookup[input[index + 2]!]! : input[index + 2]!;
    if (!applyColorGrade) {
      output[index] = toneRed;
      output[index + 1] = toneGreen;
      output[index + 2] = toneBlue;
      output[index + 3] = input[index + 3] ?? 255;
      continue;
    }

    let red = toneRed / 255;
    let green = toneGreen / 255;
    let blue = toneBlue / 255;
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    red = red * contrast + contrastOffset + redShift;
    green = green * contrast + contrastOffset + greenShift;
    blue = blue * contrast + contrastOffset + blueShift;
    const vibranceBoost = vibrance === 0
      ? 0
      : vibrance * (1 - Math.min(1, Math.abs(red - luma) + Math.abs(green - luma) + Math.abs(blue - luma)));
    const saturation = saturationBase + vibranceBoost;
    red = luma + (red - luma) * saturation;
    green = luma + (green - luma) * saturation;
    blue = luma + (blue - luma) * saturation;
    const vignette = vignetteFactors ? vignetteFactors[pixel]! : 1;
    output[index] = clampByteFast(red * vignette * 255);
    output[index + 1] = clampByteFast(green * vignette * 255);
    output[index + 2] = clampByteFast(blue * vignette * 255);
    output[index + 3] = input[index + 3] ?? 255;
  }
}

function sharpenPixelsInto(input: Uint8Array, output: Uint8Array, width: number, height: number, amount: number): void {
  output.set(input);
  const rowStride = width * 4;
  for (let y = 1; y < height - 1; y += 1) {
    const rowOffset = y * rowStride;
    for (let x = 1; x < width - 1; x += 1) {
      const index = rowOffset + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = input[index + channel] ?? 0;
        const blur = (
          (input[index - 4 + channel] ?? 0) +
          (input[index + 4 + channel] ?? 0) +
          (input[index - rowStride + channel] ?? 0) +
          (input[index + rowStride + channel] ?? 0)
        ) / 4;
        output[index + channel] = clampByteFast(center + (center - blur) * amount);
      }
    }
  }
}

function fxaaPixelsInto(
  input: Uint8Array,
  output: Uint8Array,
  width: number,
  height: number,
  edgeThreshold: number,
  subpixelBlend: number
): void {
  output.set(input);
  const rowStride = width * 4;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * rowStride;
    const northOffset = y > 0 ? rowOffset - rowStride : rowOffset;
    const southOffset = y < height - 1 ? rowOffset + rowStride : rowOffset;
    for (let x = 0; x < width; x += 1) {
      const index = rowOffset + x * 4;
      const westIndex = x > 0 ? index - 4 : index;
      const eastIndex = x < width - 1 ? index + 4 : index;
      const northIndex = northOffset + x * 4;
      const southIndex = southOffset + x * 4;
      const centerLuma = lumaAtIndex(input, index);
      const northLuma = lumaAtIndex(input, northIndex);
      const southLuma = lumaAtIndex(input, southIndex);
      const westLuma = lumaAtIndex(input, westIndex);
      const eastLuma = lumaAtIndex(input, eastIndex);
      const minLuma = Math.min(centerLuma, northLuma, southLuma, westLuma, eastLuma);
      const maxLuma = Math.max(centerLuma, northLuma, southLuma, westLuma, eastLuma);
      if (maxLuma - minLuma < edgeThreshold) continue;

      for (let channel = 0; channel < 3; channel += 1) {
        const average = (
          (input[northIndex + channel] ?? 0) +
          (input[southIndex + channel] ?? 0) +
          (input[westIndex + channel] ?? 0) +
          (input[eastIndex + channel] ?? 0)
        ) / 4;
        output[index + channel] = clampByteFast(input[index + channel]! * (1 - subpixelBlend) + average * subpixelBlend);
      }
      output[index + 3] = input[index + 3]!;
    }
  }
}

function lumaAtIndex(pixels: Uint8Array, index: number): number {
  return (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255;
}

function clampByteFast(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

function validateBloomOptions(threshold: number, intensity: number, radius: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Bloom threshold must be finite and in [0, 1].");
  }
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new Error("Bloom intensity must be finite and non-negative.");
  }
  validateBloomBlurRadius(radius);
}

function validateBloomBlurRadius(radius: number): void {
  if (!Number.isInteger(radius) || radius < 0 || radius > 16) {
    throw new Error("Bloom radius must be an integer in [0, 16].");
  }
}

function validateOutlineColor(color: readonly [number, number, number, number?]): void {
  for (let index = 0; index < color.length; index += 1) {
    const channel = color[index] ?? 0;
    if (!Number.isFinite(channel) || channel < 0 || channel > 255) {
      throw new Error(`Outline color channel ${index} must be finite and within [0, 255].`);
    }
  }
}

function sobelLumaGradient(pixels: Uint8Array, width: number, height: number, x: number, y: number): number {
  const nw = lumaAt(pixels, width, height, x - 1, y - 1);
  const n = lumaAt(pixels, width, height, x, y - 1);
  const ne = lumaAt(pixels, width, height, x + 1, y - 1);
  const w = lumaAt(pixels, width, height, x - 1, y);
  const e = lumaAt(pixels, width, height, x + 1, y);
  const sw = lumaAt(pixels, width, height, x - 1, y + 1);
  const s = lumaAt(pixels, width, height, x, y + 1);
  const se = lumaAt(pixels, width, height, x + 1, y + 1);
  const gx = -nw - 2 * w - sw + ne + 2 * e + se;
  const gy = -nw - 2 * n - ne + sw + 2 * s + se;
  return Math.hypot(gx, gy);
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let outlined = false;
      for (let offsetY = -radius; offsetY <= radius && !outlined; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.hypot(offsetX, offsetY) > radius + 0.01) continue;
          const sampleX = clampInt(x + offsetX, 0, width - 1);
          const sampleY = clampInt(y + offsetY, 0, height - 1);
          if (mask[sampleY * width + sampleX] !== 0) {
            outlined = true;
            break;
          }
        }
      }
      if (outlined) output[y * width + x] = 255;
    }
  }
  return output;
}

export function writePostProcessPixels(device: RenderDevice, source: RenderTarget, target: RenderTarget | undefined, pixels: Uint8Array): void {
  if (!target) {
    if (!device.presentRenderTarget) {
      throw new RenderDeviceError("Post-process presentation requires a render device with presentRenderTarget support", "POSTPROCESS_PRESENT_UNSUPPORTED", {
        source: source.label
      });
    }
    const presentationTarget = device.createRenderTarget({
      width: source.width,
      height: source.height,
      label: `${source.label}-postprocess-present`,
      format: "rgba8",
      depth: false
    });
    try {
      if (!device.writeRenderTargetPixels) {
        throw new RenderDeviceError("Post-process presentation requires a render device with writeRenderTargetPixels support", "POSTPROCESS_WRITE_UNSUPPORTED", {
          source: source.label
        });
      }
      device.writeRenderTargetPixels(presentationTarget, pixels);
      device.presentRenderTarget(presentationTarget);
    } finally {
      presentationTarget.dispose();
    }
    return;
  }
  if (target.width !== source.width || target.height !== source.height) {
    throw new Error("Post-process source and target dimensions must match.");
  }
  if (device.writeRenderTargetPixels) {
    device.writeRenderTargetPixels(target, pixels);
  } else {
    const writable = target as RenderTarget & { readonly colorPixels?: Uint8Array };
    if (writable.colorPixels) {
      writable.colorPixels.set(pixels);
    } else {
      throw new RenderDeviceError("Post-process target does not support byte pixel writes", "POSTPROCESS_WRITE_UNSUPPORTED", {
        target: target.label
      });
    }
  }
  device.setRenderTarget(target);
}

function writeDepthTarget(target: RenderTarget | undefined, width: number, height: number, pixels: Uint8Array): void {
  if (!target) return;
  if (target.width !== width || target.height !== height) {
    throw new Error("Depth visualization target dimensions must match source depth texture.");
  }
  const writable = target as RenderTarget & { readonly colorPixels?: Uint8Array };
  if (writable.colorPixels) {
    writable.colorPixels.set(pixels);
  }
}

function writeRenderTarget(device: RenderDevice, source: RenderTarget, target: RenderTarget | undefined, pixels: Uint8Array): void {
  writePostProcessPixels(device, source, target, pixels);
}

function encodeToneMappedChannel(
  value: number,
  exposure: number,
  whitePoint: number,
  gamma: number,
  operator: ToneMappingOperator,
  outputColorSpace: PostProcessColorSpace
): number {
  return encodeColorByte(applyToneMapping(value, exposure, whitePoint, operator), gamma, outputColorSpace);
}

function finiteHdrChannel(value: number, index: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`HDR tone mapping input contains non-finite float value at channel ${index}.`);
  }
  return Math.max(0, value);
}

function applyToneMapping(value: number, exposure: number, whitePoint: number, operator: ToneMappingOperator): number {
  const exposed = Math.max(0, value * exposure) / whitePoint;
  return operator === "linear"
    ? Math.min(1, exposed)
    : operator === "reinhard"
      ? exposed / (1 + exposed)
      : operator === "aces"
        ? aces(exposed)
        : operator === "filmic"
          ? filmic(exposed)
          : operator === "uncharted2"
            ? uncharted2(exposed)
            : operator === "agx"
              ? agx(exposed)
              : neutral(exposed);
}

function decodeColorByte(value: number, colorSpace: PostProcessColorSpace): number {
  const normalized = Math.max(0, Math.min(1, value / 255));
  if (colorSpace === "linear") return normalized;
  if (normalized <= 0.04045) return normalized / 12.92;
  return Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function encodeColorByte(value: number, gamma: number, colorSpace: PostProcessColorSpace): number {
  const linear = Math.max(0, Math.min(1, value));
  if (colorSpace === "linear") {
    return clampByte(linear * 255);
  }
  const encoded = linear <= 0.0031308
    ? linear * 12.92
    : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  return clampByte(encoded * 255);
}

function aces(value: number): number {
  return (value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14);
}

function filmic(value: number): number {
  const x = Math.max(0, value);
  const toe = Math.max(0, x - 0.004);
  const curve = (toe * (6.2 * toe + 0.5)) / (toe * (6.2 * toe + 1.7) + 0.06);
  return Math.min(curve, x * 1.08);
}

function uncharted2(value: number): number {
  const a = 0.15;
  const b = 0.5;
  const c = 0.1;
  const d = 0.2;
  const e = 0.02;
  const f = 0.3;
  const w = 11.2;
  const curve = (x: number) => ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
  return Math.max(0, Math.min(1, curve(value * 2) / curve(w)));
}

function agx(value: number): number {
  const x = Math.max(0, value);
  const logEncoded = Math.log2(1 + x) / Math.log2(1 + 16);
  const shaped = logEncoded * logEncoded * (3 - 2 * logEncoded);
  return Math.max(0, Math.min(1, shaped));
}

function neutral(value: number): number {
  const x = Math.max(0, value);
  return Math.min(1, (x * (1 + x / 7.5)) / (1 + x));
}

function createToneMappingPreset(
  name: ToneMappingPresetName,
  label: string,
  options: Partial<ToneMappingOptions & ColorGradeOptions> & {
    readonly autoExposure: boolean;
    readonly adaptationSpeed?: number;
    readonly minExposure?: number;
    readonly maxExposure?: number;
  }
): ToneMappingPreset {
  return {
    name,
    label,
    toneMapping: {
      exposure: options.exposure ?? 1,
      whitePoint: options.whitePoint ?? 1,
      gamma: options.gamma ?? 2.2,
      operator: options.operator ?? "reinhard",
      inputColorSpace: options.inputColorSpace ?? "linear",
      outputColorSpace: options.outputColorSpace ?? "linear"
    },
    colorGrade: {
      contrast: options.contrast ?? 1,
      temperature: options.temperature ?? 0,
      tint: options.tint ?? 0,
      saturation: options.saturation ?? 1,
      vibrance: options.vibrance ?? 0,
      vignette: options.vignette ?? 0,
      sharpening: options.sharpening ?? 0
    },
    autoExposure: options.autoExposure,
    adaptationSpeed: options.adaptationSpeed ?? 0.5,
    minExposure: options.minExposure ?? 0.1,
    maxExposure: options.maxExposure ?? 10
  };
}

function validateHistogramOptions(binCount: number, minLuminance: number, maxLuminance: number): void {
  if (!Number.isInteger(binCount) || binCount < 4 || binCount > 1024) {
    throw new Error("Exposure histogram binCount must be an integer in [4, 1024].");
  }
  validateRange(minLuminance, 0.000001, 128, "Exposure histogram minLuminance");
  validateRange(maxLuminance, minLuminance, 1024, "Exposure histogram maxLuminance");
}

function histogramAverageFromBins(histogram: ExposureHistogram): number {
  const logMin = Math.log2(histogram.minLuminance);
  const logMax = Math.log2(histogram.maxLuminance);
  let weighted = 0;
  let count = 0;
  for (let index = 0; index < histogram.binCount; index += 1) {
    const binValue = histogram.bins[index] ?? 0;
    const t = histogram.binCount <= 1 ? 0 : index / (histogram.binCount - 1);
    const luminance = Math.pow(2, logMin + (logMax - logMin) * t);
    weighted += luminance * binValue;
    count += binValue;
  }
  return count > 0 ? weighted / count : 0.18;
}

function noise2d(x: number, y: number, seed: number): number {
  let value = (x + 1) * 374761393 + (y + 1) * 668265263 + seed * 2147483647;
  value = (value ^ (value >>> 13)) * 1274126177;
  return ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
}

function sharpenPixels(pixels: Uint8Array, width: number, height: number, amount: number): { readonly pixels: Uint8Array; readonly sharpenedPixels: number } {
  const output = new Uint8Array(pixels);
  let sharpenedPixels = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const center = pixels[index + channel] ?? 0;
        const blur = (
          (pixels[index - 4 + channel] ?? 0) +
          (pixels[index + 4 + channel] ?? 0) +
          (pixels[index - width * 4 + channel] ?? 0) +
          (pixels[index + width * 4 + channel] ?? 0)
        ) / 4;
        output[index + channel] = clampByte(center + (center - blur) * amount);
      }
      if (Math.abs(output[index]! - (pixels[index] ?? 0)) + Math.abs(output[index + 1]! - (pixels[index + 1] ?? 0)) + Math.abs(output[index + 2]! - (pixels[index + 2] ?? 0)) > 3) {
        sharpenedPixels += 1;
      }
    }
  }
  return { pixels: output, sharpenedPixels };
}

function countChangedRgb(before: Uint8Array, after: Uint8Array): number {
  let count = 0;
  for (let index = 0; index < before.length; index += 4) {
    if (Math.abs((before[index] ?? 0) - (after[index] ?? 0)) + Math.abs((before[index + 1] ?? 0) - (after[index + 1] ?? 0)) + Math.abs((before[index + 2] ?? 0) - (after[index + 2] ?? 0)) > 3) count += 1;
  }
  return count;
}

function validateRange(value: number, min: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be finite and within [${min}, ${max}].`);
  }
}

function clampByte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lumaAt(pixels: Uint8Array, width: number, height: number, x: number, y: number): number {
  const sampleX = clampInt(x, 0, width - 1);
  const sampleY = clampInt(y, 0, height - 1);
  const index = (sampleY * width + sampleX) * 4;
  return (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255;
}

function channelAt(pixels: Uint8Array, width: number, height: number, x: number, y: number, channel: number): number {
  const sampleX = clampInt(x, 0, width - 1);
  const sampleY = clampInt(y, 0, height - 1);
  return pixels[(sampleY * width + sampleX) * 4 + channel]!;
}

function normalizeContactShadowDirection(direction: readonly [number, number]): readonly [number, number] {
  const [x, y] = direction;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new Error("Contact shadow direction must contain finite x/y values.");
  }
  const length = Math.hypot(x, y);
  if (length < 0.0001) {
    throw new Error("Contact shadow direction must not be zero length.");
  }
  return [x / length, y / length];
}

function depthAt(texture: DepthTextureBinding, x: number, y: number): number {
  const sampleX = clampInt(x, 0, texture.width - 1);
  const sampleY = clampInt(y, 0, texture.height - 1);
  return texture.data[sampleY * texture.width + sampleX]!;
}

function isDepthEdge(texture: DepthTextureBinding, x: number, y: number, edgeThreshold: number): boolean {
  const center = depthAt(texture, x, y);
  const delta = Math.max(
    Math.abs(center - depthAt(texture, x + 1, y)),
    Math.abs(center - depthAt(texture, x - 1, y)),
    Math.abs(center - depthAt(texture, x, y + 1)),
    Math.abs(center - depthAt(texture, x, y - 1))
  );
  return delta >= edgeThreshold;
}
