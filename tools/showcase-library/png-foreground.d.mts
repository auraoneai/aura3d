export interface PngRenderedProbeMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
}

export interface PngLuminanceAndTruncationMetrics {
  readonly width: number;
  readonly height: number;
  readonly meanLuminance: number;
  readonly luminanceStdDev: number;
  readonly nearWhiteRatio: number;
  readonly hazeRatio: number;
  readonly nearBlackRatio: number;
  readonly topBandBlackRatio: number;
  readonly bottomBandBlackRatio: number;
  readonly leftBandBlackRatio: number;
  readonly notWashedOut: boolean;
  readonly noBlackTruncation: boolean;
}

export function readPngRenderedProbeMetrics(path: string): PngRenderedProbeMetrics;
export function readPngLuminanceAndTruncationMetrics(path: string): PngLuminanceAndTruncationMetrics;

export interface PngPerceptualSignature {
  readonly signature: string;
  readonly grid: number;
  readonly bits: number;
  readonly width: number;
  readonly height: number;
  readonly cells: number;
}

export function readPngPerceptualSignature(
  path: string,
  options?: { readonly grid?: number; readonly bits?: number; readonly crop?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } }
): PngPerceptualSignature;

