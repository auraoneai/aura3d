import {
  computeAutoExposureFromHistogram,
  computeExposureHistogramFromPixels,
  type AutoExposureOptions,
  type AutoExposureResult,
  type ExposureHistogram,
  type ExposureHistogramOptions,
  type PostProcessColorSpace
} from "./PostProcessPass";

export interface ExternalParityExposurePolicy {
  readonly targetLuminance: number;
  readonly minExposure: number;
  readonly maxExposure: number;
  readonly adaptationSpeed: number;
  readonly inputColorSpace: PostProcessColorSpace;
  readonly histogramBins: number;
}

export interface ExternalParityExposureAnalysis {
  readonly histogram: ExposureHistogram;
  readonly autoExposure: AutoExposureResult;
  readonly underExposed: boolean;
  readonly overExposed: boolean;
  readonly exposureStable: boolean;
}

export function createExternalParityExposurePolicy(options: Partial<ExternalParityExposurePolicy> = {}): ExternalParityExposurePolicy {
  return {
    targetLuminance: options.targetLuminance ?? 0.18,
    minExposure: options.minExposure ?? 0.25,
    maxExposure: options.maxExposure ?? 4,
    adaptationSpeed: options.adaptationSpeed ?? 0.2,
    inputColorSpace: options.inputColorSpace ?? "srgb",
    histogramBins: options.histogramBins ?? 32
  };
}

export function analyzeExternalParityExposure(
  pixels: Uint8Array,
  width: number,
  height: number,
  policy: ExternalParityExposurePolicy = createExternalParityExposurePolicy(),
  options: Pick<AutoExposureOptions, "previousExposure" | "deltaTimeSeconds"> = {}
): ExternalParityExposureAnalysis {
  const histogramOptions: ExposureHistogramOptions = {
    inputColorSpace: policy.inputColorSpace,
    binCount: policy.histogramBins
  };
  const histogram = computeExposureHistogramFromPixels(pixels, width, height, histogramOptions);
  const autoExposure = computeAutoExposureFromHistogram(histogram, {
    targetLuminance: policy.targetLuminance,
    previousExposure: options.previousExposure ?? 1,
    adaptationSpeed: policy.adaptationSpeed,
    deltaTimeSeconds: options.deltaTimeSeconds ?? 1 / 60,
    minExposure: policy.minExposure,
    maxExposure: policy.maxExposure
  });
  return {
    histogram,
    autoExposure,
    underExposed: histogram.averageLuminance < policy.targetLuminance * 0.35,
    overExposed: histogram.averageLuminance > policy.targetLuminance * 4,
    exposureStable: !autoExposure.clamped && autoExposure.exposure >= policy.minExposure && autoExposure.exposure <= policy.maxExposure
  };
}
