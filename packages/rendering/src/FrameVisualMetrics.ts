export interface FrameVisualMetricsOptions {
  readonly darkLumaThreshold?: number;
  readonly salientLumaThreshold?: number;
  readonly bucketShift?: 4 | 5 | 6;
  readonly edgeLumaThreshold?: number;
}

export interface FrameVisualBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameVisualMetrics {
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
  readonly nonDarkPixels: number;
  readonly nonDarkRatio: number;
  readonly salientPixels: number;
  readonly salientRatio: number;
  readonly occupiedAreaRatio: number;
  readonly occupiedQuadrants: number;
  readonly meanLuma: number;
  readonly averageLuma: number;
  readonly minLuma: number;
  readonly maxLuma: number;
  readonly darkPixelRatio: number;
  readonly colorBuckets: number;
  readonly dominantBucketRatio: number;
  readonly edgePixels: number;
  readonly edgePixelRatio: number;
  readonly flatPixels: number;
  readonly flatPixelRatio: number;
  readonly localContrastPixels: number;
  readonly localContrastRatio: number;
  readonly bounds?: FrameVisualBounds;
}

export interface FrameMotionRegion {
  readonly id: string;
  readonly bounds: FrameVisualBounds;
  readonly changedPixels: number;
  readonly changedRatio: number;
}

export interface FrameMotionRegionMetrics {
  readonly width: number;
  readonly height: number;
  readonly changedPixels: number;
  readonly changedRatio: number;
  readonly regions: readonly FrameMotionRegion[];
  readonly characterVisible: boolean;
  readonly characterMotionRegionCount: number;
}

export interface FrameVisualQualityThresholds {
  readonly minNonDarkRatio?: number;
  readonly minSalientRatio?: number;
  readonly minOccupiedAreaRatio?: number;
  readonly minOccupiedQuadrants?: number;
  readonly minMeanLuma?: number;
  readonly minMaxLuma?: number;
  readonly minColorBuckets?: number;
  readonly maxDarkPixelRatio?: number;
  readonly maxDominantBucketRatio?: number;
  readonly minEdgePixelRatio?: number;
  readonly maxFlatPixelRatio?: number;
  readonly minLocalContrastRatio?: number;
}

export interface FrameVisualQualityResult {
  readonly ok: boolean;
  readonly failures: readonly string[];
}

export function analyzeRgbaFrameVisualMetrics(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: FrameVisualMetricsOptions = {}
): FrameVisualMetrics {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Frame visual metrics require positive integer width and height.");
  }
  if (pixels.length !== width * height * 4) {
    throw new RangeError("Frame visual metrics require RGBA pixels with width * height * 4 bytes.");
  }
  const darkLumaThreshold = options.darkLumaThreshold ?? 18;
  const salientLumaThreshold = options.salientLumaThreshold ?? 24;
  const bucketShift = options.bucketShift ?? 4;
  const edgeLumaThreshold = options.edgeLumaThreshold ?? 42;
  const buckets = new Map<string, number>();
  let nonDarkPixels = 0;
  let salientPixels = 0;
  let darkPixels = 0;
  let lumaSum = 0;
  let minLuma = Number.POSITIVE_INFINITY;
  let maxLuma = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const quadrants = new Set<number>();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const luma = framePixelLuma(r, g, b);
      lumaSum += luma;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      if (luma > darkLumaThreshold) nonDarkPixels += 1;
      else darkPixels += 1;
      if (luma > salientLumaThreshold) {
        salientPixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        quadrants.add((x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0));
      }
      const bucket = `${r >> bucketShift}:${g >> bucketShift}:${b >> bucketShift}`;
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
  }

  let edgePixels = 0;
  let flatPixels = 0;
  let localContrastPixels = 0;
  for (let y = 1; y < height; y += 1) {
    for (let x = 1; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luma = rgbaPixelLuma(pixels, index);
      const left = rgbaPixelLuma(pixels, index - 4);
      const up = rgbaPixelLuma(pixels, index - width * 4);
      const delta = Math.abs(luma - left) + Math.abs(luma - up);
      if (delta > edgeLumaThreshold) {
        edgePixels += 1;
      }
      if (delta <= 2) {
        flatPixels += 1;
      }
      if (delta >= 8) {
        localContrastPixels += 1;
      }
    }
  }

  const pixelCount = width * height;
  const dominantBucket = Math.max(0, ...buckets.values());
  const bounds = maxX >= minX && maxY >= minY
    ? {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      }
    : undefined;
  const occupiedAreaRatio = bounds ? (bounds.width * bounds.height) / pixelCount : 0;
  const meanLuma = lumaSum / pixelCount;
  return {
    width,
    height,
    pixelCount,
    nonDarkPixels,
    nonDarkRatio: nonDarkPixels / pixelCount,
    salientPixels,
    salientRatio: salientPixels / pixelCount,
    occupiedAreaRatio,
    occupiedQuadrants: quadrants.size,
    meanLuma,
    averageLuma: meanLuma,
    minLuma: Number.isFinite(minLuma) ? minLuma : 0,
    maxLuma,
    darkPixelRatio: darkPixels / pixelCount,
    colorBuckets: buckets.size,
    dominantBucketRatio: dominantBucket / pixelCount,
    edgePixels,
    edgePixelRatio: edgePixels / pixelCount,
    flatPixels,
    flatPixelRatio: flatPixels / pixelCount,
    localContrastPixels,
    localContrastRatio: localContrastPixels / pixelCount,
    ...(bounds ? { bounds } : {})
  };
}

export function evaluateFrameVisualQuality(
  metrics: FrameVisualMetrics,
  thresholds: FrameVisualQualityThresholds
): FrameVisualQualityResult {
  const failures = [
    thresholdFailure("nonDarkRatio", metrics.nonDarkRatio, thresholds.minNonDarkRatio, "min"),
    thresholdFailure("salientRatio", metrics.salientRatio, thresholds.minSalientRatio, "min"),
    thresholdFailure("occupiedAreaRatio", metrics.occupiedAreaRatio, thresholds.minOccupiedAreaRatio, "min"),
    thresholdFailure("occupiedQuadrants", metrics.occupiedQuadrants, thresholds.minOccupiedQuadrants, "min"),
    thresholdFailure("meanLuma", metrics.meanLuma, thresholds.minMeanLuma, "min"),
    thresholdFailure("maxLuma", metrics.maxLuma, thresholds.minMaxLuma, "min"),
    thresholdFailure("colorBuckets", metrics.colorBuckets, thresholds.minColorBuckets, "min"),
    thresholdFailure("darkPixelRatio", metrics.darkPixelRatio, thresholds.maxDarkPixelRatio, "max"),
    thresholdFailure("dominantBucketRatio", metrics.dominantBucketRatio, thresholds.maxDominantBucketRatio, "max"),
    thresholdFailure("edgePixelRatio", metrics.edgePixelRatio, thresholds.minEdgePixelRatio, "min"),
    thresholdFailure("flatPixelRatio", metrics.flatPixelRatio, thresholds.maxFlatPixelRatio, "max"),
    thresholdFailure("localContrastRatio", metrics.localContrastRatio, thresholds.minLocalContrastRatio, "min")
  ].filter((failure): failure is string => Boolean(failure));
  return { ok: failures.length === 0, failures };
}

export function analyzeRgbaFrameMotionRegions(
  previous: Uint8Array | Uint8ClampedArray,
  next: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: { readonly deltaThreshold?: number | undefined; readonly minRegionPixels?: number | undefined } = {}
): FrameMotionRegionMetrics {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError("Frame motion metrics require positive integer width and height.");
  }
  if (previous.length !== width * height * 4 || next.length !== width * height * 4) {
    throw new RangeError("Frame motion metrics require two RGBA frames with width * height * 4 bytes.");
  }
  const deltaThreshold = options.deltaThreshold ?? 18;
  const minRegionPixels = options.minRegionPixels ?? Math.max(4, Math.round(width * height * 0.002));
  let changedPixels = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const delta =
        Math.abs((next[index] ?? 0) - (previous[index] ?? 0)) +
        Math.abs((next[index + 1] ?? 0) - (previous[index + 1] ?? 0)) +
        Math.abs((next[index + 2] ?? 0) - (previous[index + 2] ?? 0));
      if (delta <= deltaThreshold) continue;
      changedPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const bounds = maxX >= minX && maxY >= minY
    ? {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      }
    : undefined;
  const regions = bounds && changedPixels >= minRegionPixels
    ? [{
        id: "motion-region-1",
        bounds,
        changedPixels,
        changedRatio: changedPixels / (width * height)
      }]
    : [];
  return {
    width,
    height,
    changedPixels,
    changedRatio: changedPixels / (width * height),
    regions,
    characterVisible: regions.length > 0,
    characterMotionRegionCount: regions.length
  };
}

function thresholdFailure(name: string, actual: number, expected: number | undefined, direction: "min" | "max"): string | undefined {
  if (expected === undefined) return undefined;
  if (direction === "min" && actual < expected) return `${name} ${roundMetric(actual)} < ${expected}`;
  if (direction === "max" && actual > expected) return `${name} ${roundMetric(actual)} > ${expected}`;
  return undefined;
}

function rgbaPixelLuma(pixels: Uint8Array | Uint8ClampedArray, index: number): number {
  return framePixelLuma(pixels[index] ?? 0, pixels[index + 1] ?? 0, pixels[index + 2] ?? 0);
}

function framePixelLuma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

function roundMetric(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
