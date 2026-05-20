import type { StereoLayout } from "./StereoCameraRig";

export type StereoEffectMode = "side-by-side" | "anaglyph" | "parallax-barrier";

export interface StereoEffectPlanOptions {
  readonly mode: StereoEffectMode;
  readonly width: number;
  readonly height: number;
  readonly eyeSeparation: number;
  readonly convergenceDistance: number;
  readonly parallaxStrength?: number;
  readonly parallaxBarrierAxis?: "x" | "y";
  readonly stripPitchPx?: number;
  readonly layout?: StereoLayout;
}

export interface StereoEffectPlan {
  readonly mode: StereoEffectMode;
  readonly layout: StereoLayout;
  readonly width: number;
  readonly height: number;
  readonly eyeCount: 2;
  readonly eyeSeparation: number;
  readonly convergenceDistance: number;
  readonly parallaxStrength: number;
  readonly parallaxSignal: number;
  readonly composition: "dual-canvas" | "channel-composite" | "interleaved-mask";
  readonly anaglyph?: AnaglyphCompositePlan;
  readonly parallaxBarrier?: ParallaxBarrierInterleavePlan;
}

export interface AnaglyphCompositePlan {
  readonly leftChannel: "red";
  readonly rightChannels: readonly ["green", "blue"];
  readonly leftCssFilter: string;
  readonly rightCssFilter: string;
  readonly blendMode: "screen";
}

export interface AnaglyphPixelCompositeOptions {
  readonly width: number;
  readonly height: number;
  readonly leftPixels: Uint8Array | Uint8ClampedArray;
  readonly rightPixels: Uint8Array | Uint8ClampedArray;
  readonly flipY?: boolean;
}

export interface AnaglyphPixelComposite {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly composition: "renderer-owned-anaglyph-pixels";
  readonly leftChannel: "red";
  readonly rightChannels: readonly ["green", "blue"];
}

export interface ParallaxBarrierInterleavePlan {
  readonly axis: "x" | "y";
  readonly stripPitchPx: number;
  readonly dutyCycle: number;
  readonly leftMaskImage: string;
  readonly rightMaskImage: string;
  readonly overlayBackground: string;
  readonly rightOpacity: number;
}

export interface ParallaxBarrierPixelCompositeOptions {
  readonly width: number;
  readonly height: number;
  readonly leftPixels: Uint8Array | Uint8ClampedArray;
  readonly rightPixels: Uint8Array | Uint8ClampedArray;
  readonly axis?: "x" | "y";
  readonly stripPitchPx?: number;
  readonly dutyCycle?: number;
  readonly flipY?: boolean;
}

export interface ParallaxBarrierPixelComposite {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly axis: "x" | "y";
  readonly stripPitchPx: number;
  readonly dutyCycle: number;
  readonly leftPixelCount: number;
  readonly rightPixelCount: number;
  readonly composition: "renderer-owned-interleaved-pixels";
}

export function createStereoEffectPlan(options: StereoEffectPlanOptions): StereoEffectPlan {
  validatePositiveFinite(options.width, "Stereo effect width");
  validatePositiveFinite(options.height, "Stereo effect height");
  validatePositiveFinite(options.eyeSeparation, "Stereo effect eyeSeparation");
  validatePositiveFinite(options.convergenceDistance, "Stereo effect convergenceDistance");
  const parallaxStrength = options.parallaxStrength ?? 1;
  validatePositiveFinite(parallaxStrength, "Stereo effect parallaxStrength");
  const layout = options.layout ?? "side-by-side";
  const base = {
    mode: options.mode,
    layout,
    width: options.width,
    height: options.height,
    eyeCount: 2 as const,
    eyeSeparation: options.eyeSeparation,
    convergenceDistance: options.convergenceDistance,
    parallaxStrength,
    parallaxSignal: options.eyeSeparation * parallaxStrength / options.convergenceDistance
  };
  if (options.mode === "anaglyph") {
    return {
      ...base,
      composition: "channel-composite",
      anaglyph: createAnaglyphCompositePlan()
    };
  }
  if (options.mode === "parallax-barrier") {
    return {
      ...base,
      composition: "interleaved-mask",
      parallaxBarrier: createParallaxBarrierInterleavePlan({
        axis: options.parallaxBarrierAxis,
        stripPitchPx: options.stripPitchPx
      })
    };
  }
  return {
    ...base,
    composition: "dual-canvas"
  };
}

export function createAnaglyphCompositePlan(): AnaglyphCompositePlan {
  return {
    leftChannel: "red",
    rightChannels: ["green", "blue"],
    leftCssFilter: "sepia(1) saturate(5) hue-rotate(-50deg)",
    rightCssFilter: "sepia(1) saturate(4) hue-rotate(135deg)",
    blendMode: "screen"
  };
}

export function createAnaglyphPixelComposite(options: AnaglyphPixelCompositeOptions): AnaglyphPixelComposite {
  validatePositiveInteger(options.width, "Anaglyph composite width");
  validatePositiveInteger(options.height, "Anaglyph composite height");
  const expectedLength = options.width * options.height * 4;
  if (options.leftPixels.length !== expectedLength || options.rightPixels.length !== expectedLength) {
    throw new RangeError("Anaglyph composite requires leftPixels and rightPixels to be width * height * 4 bytes.");
  }

  const output = new Uint8ClampedArray(expectedLength);
  for (let y = 0; y < options.height; y += 1) {
    const sourceY = options.flipY ? options.height - y - 1 : y;
    for (let x = 0; x < options.width; x += 1) {
      const sourceOffset = (sourceY * options.width + x) * 4;
      const outputOffset = (y * options.width + x) * 4;
      output[outputOffset] = options.leftPixels[sourceOffset] ?? 0;
      output[outputOffset + 1] = options.rightPixels[sourceOffset + 1] ?? 0;
      output[outputOffset + 2] = options.rightPixels[sourceOffset + 2] ?? 0;
      output[outputOffset + 3] = Math.max(options.leftPixels[sourceOffset + 3] ?? 255, options.rightPixels[sourceOffset + 3] ?? 255);
    }
  }

  return {
    width: options.width,
    height: options.height,
    pixels: output,
    composition: "renderer-owned-anaglyph-pixels",
    leftChannel: "red",
    rightChannels: ["green", "blue"]
  };
}

export function createParallaxBarrierInterleavePlan(options: {
  readonly axis?: "x" | "y";
  readonly stripPitchPx?: number;
  readonly dutyCycle?: number;
  readonly rightOpacity?: number;
} = {}): ParallaxBarrierInterleavePlan {
  const axis = options.axis ?? "x";
  validateAxis(axis);
  const stripPitchPx = options.stripPitchPx ?? 12;
  const dutyCycle = options.dutyCycle ?? 0.5;
  const rightOpacity = options.rightOpacity ?? 0.82;
  validatePositiveFinite(stripPitchPx, "Parallax barrier stripPitchPx");
  if (!Number.isFinite(dutyCycle) || dutyCycle <= 0 || dutyCycle >= 1) {
    throw new RangeError("Parallax barrier dutyCycle must be finite and in (0, 1).");
  }
  if (!Number.isFinite(rightOpacity) || rightOpacity < 0 || rightOpacity > 1) {
    throw new RangeError("Parallax barrier rightOpacity must be finite and in [0, 1].");
  }
  const leftStop = stripPitchPx * dutyCycle;
  const gradientAxis = axis === "x" ? "90deg" : "0deg";
  return {
    axis,
    stripPitchPx,
    dutyCycle,
    leftMaskImage: `repeating-linear-gradient(${gradientAxis}, black 0 ${formatPx(leftStop)}, transparent ${formatPx(leftStop)} ${formatPx(stripPitchPx)})`,
    rightMaskImage: `repeating-linear-gradient(${gradientAxis}, transparent 0 ${formatPx(leftStop)}, black ${formatPx(leftStop)} ${formatPx(stripPitchPx)})`,
    overlayBackground: `repeating-linear-gradient(${gradientAxis}, rgba(255,255,255,0.06) 0 1px, transparent 1px ${formatPx(stripPitchPx)})`,
    rightOpacity
  };
}

export function createParallaxBarrierPixelComposite(options: ParallaxBarrierPixelCompositeOptions): ParallaxBarrierPixelComposite {
  validatePositiveInteger(options.width, "Parallax barrier composite width");
  validatePositiveInteger(options.height, "Parallax barrier composite height");
  const stripPitchPx = options.stripPitchPx ?? 12;
  const dutyCycle = options.dutyCycle ?? 0.5;
  const axis = options.axis ?? "x";
  validateAxis(axis);
  validatePositiveFinite(stripPitchPx, "Parallax barrier stripPitchPx");
  if (!Number.isFinite(dutyCycle) || dutyCycle <= 0 || dutyCycle >= 1) {
    throw new RangeError("Parallax barrier dutyCycle must be finite and in (0, 1).");
  }
  const expectedLength = options.width * options.height * 4;
  if (options.leftPixels.length !== expectedLength || options.rightPixels.length !== expectedLength) {
    throw new RangeError("Parallax barrier composite requires leftPixels and rightPixels to be width * height * 4 bytes.");
  }

  const output = new Uint8ClampedArray(expectedLength);
  let leftPixelCount = 0;
  let rightPixelCount = 0;
  const leftStripWidth = stripPitchPx * dutyCycle;
  for (let y = 0; y < options.height; y += 1) {
    const sourceY = options.flipY ? options.height - y - 1 : y;
    for (let x = 0; x < options.width; x += 1) {
      const coordinate = axis === "x" ? x : y;
      const useLeft = (coordinate % stripPitchPx) < leftStripWidth;
      const source = useLeft ? options.leftPixels : options.rightPixels;
      const sourceOffset = (sourceY * options.width + x) * 4;
      const outputOffset = (y * options.width + x) * 4;
      output[outputOffset] = source[sourceOffset] ?? 0;
      output[outputOffset + 1] = source[sourceOffset + 1] ?? 0;
      output[outputOffset + 2] = source[sourceOffset + 2] ?? 0;
      output[outputOffset + 3] = source[sourceOffset + 3] ?? 255;
      if (useLeft) leftPixelCount += 1;
      else rightPixelCount += 1;
    }
  }

  return {
    width: options.width,
    height: options.height,
    pixels: output,
    axis,
    stripPitchPx,
    dutyCycle,
    leftPixelCount,
    rightPixelCount,
    composition: "renderer-owned-interleaved-pixels"
  };
}

function validateAxis(value: unknown): asserts value is "x" | "y" {
  if (value !== "x" && value !== "y") {
    throw new RangeError("Parallax barrier axis must be x or y.");
  }
}

function validatePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be finite and positive.`);
  }
}

function validatePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive integer.`);
  }
}

function formatPx(value: number): string {
  return `${Number(value.toFixed(3))}px`;
}
