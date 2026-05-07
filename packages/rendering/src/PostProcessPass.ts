import { BaseRenderPass, type RenderPassContext } from "./RenderPass";
import { type RenderTarget } from "./RenderDevice";

export type ToneMappingOperator = "linear" | "reinhard" | "aces";

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
  readonly gamma?: number;
  readonly operator?: ToneMappingOperator;
}

export interface ToneMappingResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface BloomResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly brightPixels: Uint8Array;
}

export interface FXAAResult {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly edgeMask: Uint8Array;
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

export class ToneMappingPass extends BaseRenderPass {
  private readonly exposure: number;
  private readonly gamma: number;
  private readonly operator: ToneMappingOperator;
  private lastResult: ToneMappingResult | null = null;

  constructor(private readonly options: ToneMappingPassOptions) {
    super(
      options.name ?? "tone-mapping",
      [options.readResource ?? options.source.label],
      [options.writeResource ?? options.target?.label ?? "backbuffer"]
    );
    this.exposure = options.exposure ?? 1;
    this.gamma = options.gamma ?? 2.2;
    this.operator = options.operator ?? "reinhard";
    if (!Number.isFinite(this.exposure) || this.exposure < 0) {
      throw new Error("ToneMappingPass exposure must be finite and non-negative.");
    }
    if (!Number.isFinite(this.gamma) || this.gamma <= 0) {
      throw new Error("ToneMappingPass gamma must be finite and positive.");
    }
  }

  execute(context: RenderPassContext): void {
    context.device.setRenderTarget(this.options.source);
    const pixels = context.device.readPixels(0, 0, this.options.source.width, this.options.source.height);
    const mapped = toneMapPixels(pixels, this.options.source.width, this.options.source.height, {
      exposure: this.exposure,
      gamma: this.gamma,
      operator: this.operator
    });
    this.writeTarget(mapped.pixels);
    context.device.setRenderTarget(this.options.target ?? null);
    this.lastResult = mapped;
  }

  getLastResult(): ToneMappingResult | null {
    return this.lastResult ? { ...this.lastResult, pixels: new Uint8Array(this.lastResult.pixels) } : null;
  }

  private writeTarget(pixels: Uint8Array): void {
    const target = this.options.target;
    if (!target) return;
    if (target.width !== this.options.source.width || target.height !== this.options.source.height) {
      throw new Error("ToneMappingPass source and target dimensions must match.");
    }
    const writable = target as RenderTarget & { readonly colorPixels?: Uint8Array };
    if (writable.colorPixels) {
      writable.colorPixels.set(pixels);
    }
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
    writeRenderTarget(this.options.source, this.options.target, bloomed.pixels);
    context.device.setRenderTarget(this.options.target ?? null);
    this.lastResult = bloomed;
  }

  getLastResult(): BloomResult | null {
    return this.lastResult
      ? {
          ...this.lastResult,
          pixels: new Uint8Array(this.lastResult.pixels),
          brightPixels: new Uint8Array(this.lastResult.brightPixels)
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
    writeRenderTarget(this.options.source, this.options.target, smoothed.pixels);
    context.device.setRenderTarget(this.options.target ?? null);
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
  const gamma = options.gamma ?? 2.2;
  const operator = options.operator ?? "reinhard";
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new Error("Tone mapping exposure must be finite and non-negative.");
  }
  if (!Number.isFinite(gamma) || gamma <= 0) {
    throw new Error("Tone mapping gamma must be finite and positive.");
  }
  const output = new Uint8Array(pixels.byteLength);
  for (let index = 0; index < pixels.length; index += 4) {
    output[index] = encodeToneMappedChannel(pixels[index]! / 255, exposure, gamma, operator);
    output[index + 1] = encodeToneMappedChannel(pixels[index + 1]! / 255, exposure, gamma, operator);
    output[index + 2] = encodeToneMappedChannel(pixels[index + 2]! / 255, exposure, gamma, operator);
    output[index + 3] = pixels[index + 3]!;
  }
  return { width, height, pixels: output };
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

  const brightPixels = new Uint8Array(pixels.byteLength);
  for (let index = 0; index < pixels.length; index += 4) {
    const luma = (0.2126 * pixels[index]! + 0.7152 * pixels[index + 1]! + 0.0722 * pixels[index + 2]!) / 255;
    if (luma >= threshold) {
      brightPixels[index] = pixels[index]!;
      brightPixels[index + 1] = pixels[index + 1]!;
      brightPixels[index + 2] = pixels[index + 2]!;
      brightPixels[index + 3] = pixels[index + 3]!;
    }
  }

  const output = new Uint8Array(pixels);
  const kernelSize = radius * 2 + 1;
  const kernelArea = kernelSize * kernelSize;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetIndex = (y * width + x) * 4;
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          const sampleX = clampInt(x + offsetX, 0, width - 1);
          const sampleY = clampInt(y + offsetY, 0, height - 1);
          const sampleIndex = (sampleY * width + sampleX) * 4;
          red += brightPixels[sampleIndex]!;
          green += brightPixels[sampleIndex + 1]!;
          blue += brightPixels[sampleIndex + 2]!;
        }
      }
      output[targetIndex] = clampByte(output[targetIndex]! + (red / kernelArea) * intensity);
      output[targetIndex + 1] = clampByte(output[targetIndex + 1]! + (green / kernelArea) * intensity);
      output[targetIndex + 2] = clampByte(output[targetIndex + 2]! + (blue / kernelArea) * intensity);
      output[targetIndex + 3] = pixels[targetIndex + 3]!;
    }
  }

  return { width, height, pixels: output, brightPixels };
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

function validatePixelBuffer(pixels: Uint8Array, width: number, height: number, label: string): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`${label} dimensions must be positive integers.`);
  }
  if (pixels.byteLength !== width * height * 4) {
    throw new Error(`${label} input must contain width * height * 4 RGBA bytes.`);
  }
}

function validateFXAAOptions(edgeThreshold: number, subpixelBlend: number): void {
  if (!Number.isFinite(edgeThreshold) || edgeThreshold < 0 || edgeThreshold > 1) {
    throw new Error("FXAA edgeThreshold must be finite and in [0, 1].");
  }
  if (!Number.isFinite(subpixelBlend) || subpixelBlend < 0 || subpixelBlend > 1) {
    throw new Error("FXAA subpixelBlend must be finite and in [0, 1].");
  }
}

function validateBloomOptions(threshold: number, intensity: number, radius: number): void {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new Error("Bloom threshold must be finite and in [0, 1].");
  }
  if (!Number.isFinite(intensity) || intensity < 0) {
    throw new Error("Bloom intensity must be finite and non-negative.");
  }
  if (!Number.isInteger(radius) || radius < 0 || radius > 16) {
    throw new Error("Bloom radius must be an integer in [0, 16].");
  }
}

function writeRenderTarget(source: RenderTarget, target: RenderTarget | undefined, pixels: Uint8Array): void {
  if (!target) return;
  if (target.width !== source.width || target.height !== source.height) {
    throw new Error("Post-process source and target dimensions must match.");
  }
  const writable = target as RenderTarget & { readonly colorPixels?: Uint8Array };
  if (writable.colorPixels) {
    writable.colorPixels.set(pixels);
  }
}

function encodeToneMappedChannel(value: number, exposure: number, gamma: number, operator: ToneMappingOperator): number {
  const exposed = Math.max(0, value * exposure);
  const mapped = operator === "linear"
    ? Math.min(1, exposed)
    : operator === "reinhard"
      ? exposed / (1 + exposed)
      : aces(exposed);
  return Math.round(Math.pow(Math.max(0, Math.min(1, mapped)), 1 / gamma) * 255);
}

function aces(value: number): number {
  return (value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14);
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
