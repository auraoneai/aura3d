import { existsSync, readFileSync, statSync } from "node:fs";
import { inflateSync } from "node:zlib";

export interface PngVisualStats {
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly meanLuma: number;
  readonly darkPixelRatio: number;
  readonly dominantBucketRatio: number;
  readonly colorBuckets: number;
  readonly edgePixelRatio: number;
  readonly localContrastRatio: number;
}

export interface VisualThresholds {
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly minByteLength?: number;
  readonly minMeanLuma?: number;
  readonly maxDarkPixelRatio?: number;
  readonly maxDominantBucketRatio?: number;
  readonly minColorBuckets?: number;
  readonly minEdgePixelRatio?: number;
  readonly minLocalContrastRatio?: number;
}

export interface PngVisualValidation {
  readonly path: string;
  readonly exists: boolean;
  readonly ok: boolean;
  readonly stats?: PngVisualStats;
  readonly failures: readonly string[];
}

const pngSignature = "89504e470d0a1a0a";

export function validatePngVisual(path: string, thresholds: VisualThresholds = {}): PngVisualValidation {
  if (!existsSync(path)) return { path, exists: false, ok: false, failures: ["missing"] };
  const stats = readPngVisualStats(path);
  const failures = validateStats(stats, thresholds);
  return { path, exists: true, ok: failures.length === 0, stats, failures };
}

export function readPngVisualStats(path: string): PngVisualStats {
  const bytes = readFileSync(path);
  if (bytes.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`${path} is not a PNG file`);
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const dataParts: Buffer[] = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "IDAT") {
      dataParts.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`${path} uses unsupported PNG encoding: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const inflated = inflateSync(Buffer.concat(dataParts));
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++] ?? 0;
    const current = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const raw = inflated[sourceOffset++] ?? 0;
      const left = x >= channels ? current[x - channels] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      current[x] = unfilter(filter, raw, left, up, upLeft);
    }
    for (let x = 0; x < width; x++) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      rgba[target] = current[source] ?? 0;
      rgba[target + 1] = current[source + 1] ?? 0;
      rgba[target + 2] = current[source + 2] ?? 0;
      rgba[target + 3] = channels === 4 ? current[source + 3] ?? 255 : 255;
    }
    previous = current;
  }
  return summarizePixels(path, rgba, width, height);
}

function validateStats(stats: PngVisualStats, thresholds: VisualThresholds): string[] {
  const failures: string[] = [];
  if (stats.width < (thresholds.minWidth ?? 640)) failures.push(`width ${stats.width} < ${thresholds.minWidth ?? 640}`);
  if (stats.height < (thresholds.minHeight ?? 360)) failures.push(`height ${stats.height} < ${thresholds.minHeight ?? 360}`);
  if (stats.byteLength < (thresholds.minByteLength ?? 30000)) failures.push(`byteLength ${stats.byteLength} < ${thresholds.minByteLength ?? 30000}`);
  if (stats.meanLuma < (thresholds.minMeanLuma ?? 30)) failures.push(`meanLuma ${stats.meanLuma} < ${thresholds.minMeanLuma ?? 30}`);
  if (stats.darkPixelRatio > (thresholds.maxDarkPixelRatio ?? 0.72)) failures.push(`darkPixelRatio ${stats.darkPixelRatio} > ${thresholds.maxDarkPixelRatio ?? 0.72}`);
  if (stats.dominantBucketRatio > (thresholds.maxDominantBucketRatio ?? 0.58)) failures.push(`dominantBucketRatio ${stats.dominantBucketRatio} > ${thresholds.maxDominantBucketRatio ?? 0.58}`);
  if (stats.colorBuckets < (thresholds.minColorBuckets ?? 70)) failures.push(`colorBuckets ${stats.colorBuckets} < ${thresholds.minColorBuckets ?? 70}`);
  if (stats.edgePixelRatio < (thresholds.minEdgePixelRatio ?? 0.016)) failures.push(`edgePixelRatio ${stats.edgePixelRatio} < ${thresholds.minEdgePixelRatio ?? 0.016}`);
  if (stats.localContrastRatio < (thresholds.minLocalContrastRatio ?? 0.035)) failures.push(`localContrastRatio ${stats.localContrastRatio} < ${thresholds.minLocalContrastRatio ?? 0.035}`);
  return failures;
}

function summarizePixels(path: string, pixels: Uint8Array, width: number, height: number): PngVisualStats {
  const buckets = new Map<string, number>();
  let lumaSum = 0;
  let darkPixels = 0;
  let edgePixels = 0;
  let localContrastPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 0;
    const g = pixels[index + 1] ?? 0;
    const b = pixels[index + 2] ?? 0;
    const luma = pixelLuma(pixels, index);
    lumaSum += luma;
    if (luma < 18) darkPixels++;
    buckets.set(`${r >> 4},${g >> 4},${b >> 4}`, (buckets.get(`${r >> 4},${g >> 4},${b >> 4}`) ?? 0) + 1);
    const pixel = index / 4;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0 && y > 0) {
      const left = index - 4;
      const up = index - width * 4;
      const delta = Math.abs(luma - pixelLuma(pixels, left)) + Math.abs(luma - pixelLuma(pixels, up));
      if (delta > 32) edgePixels++;
      if (delta > 14) localContrastPixels++;
    }
  }
  const pixelCount = Math.max(1, width * height);
  const dominantBucket = Math.max(...buckets.values());
  return {
    width,
    height,
    byteLength: statSync(path).size,
    meanLuma: Number((lumaSum / pixelCount).toFixed(2)),
    darkPixelRatio: Number((darkPixels / pixelCount).toFixed(4)),
    dominantBucketRatio: Number((dominantBucket / pixelCount).toFixed(4)),
    colorBuckets: buckets.size,
    edgePixelRatio: Number((edgePixels / pixelCount).toFixed(4)),
    localContrastRatio: Number((localContrastPixels / pixelCount).toFixed(4))
  };
}

function unfilter(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 255;
  if (filter === 2) return (raw + up) & 255;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 255;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 255;
  throw new Error(`Unsupported PNG filter ${filter}`);
}

function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function pixelLuma(pixels: Uint8Array, index: number): number {
  return 0.2126 * (pixels[index] ?? 0) + 0.7152 * (pixels[index + 1] ?? 0) + 0.0722 * (pixels[index + 2] ?? 0);
}
