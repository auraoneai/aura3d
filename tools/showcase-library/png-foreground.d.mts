export interface PngRenderedProbeMetrics {
  readonly width: number;
  readonly height: number;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
}

export function readPngRenderedProbeMetrics(path: string): PngRenderedProbeMetrics;
