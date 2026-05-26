import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export interface ProductionPngStats {
  readonly width: number;
  readonly height: number;
  readonly nonTransparentPixels: number;
  readonly nonBlackPixels: number;
  readonly uniqueColorBuckets: number;
  readonly averageLuma: number;
  readonly foregroundPixels: number;
  readonly foregroundCoverage: number;
  readonly largestForegroundComponentPixels: number;
  readonly largestForegroundComponentCoverage: number;
  readonly centerForegroundCoverage: number;
  readonly foregroundBoundsCoverage: number;
  readonly detailEdgeDensity: number;
  readonly localContrast: number;
}

export function readProductionPngStats(path: string): ProductionPngStats {
  const buffer = readFileSync(path);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG file.`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (width <= 0 || height <= 0 || channels === 0) {
    throw new Error(`${path} uses unsupported PNG color type ${colorType}.`);
  }

  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = new Uint8Array(width * height * channels);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset] ?? 0;
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset++] ?? 0;
      const left = x >= channels ? pixels[y * stride + x - channels] ?? 0 : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] ?? 0 : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] ?? 0 : 0;
      pixels[y * stride + x] = unfilter(filter, raw, left, up, upLeft);
    }
  }

  return analyzePixels(pixels, width, height, channels);
}

function analyzePixels(pixels: Uint8Array, width: number, height: number, channels: number): ProductionPngStats {
  let nonTransparentPixels = 0;
  let nonBlackPixels = 0;
  let lumaTotal = 0;
  let lumaSquareTotal = 0;
  const buckets = new Set<number>();
  const background = estimateBackgroundColor(pixels, width, height, channels);
  const foregroundMask = new Uint8Array(width * height);
  const centerMinX = Math.floor(width * 0.25);
  const centerMaxX = Math.ceil(width * 0.75);
  const centerMinY = Math.floor(height * 0.25);
  const centerMaxY = Math.ceil(height * 0.75);
  let foregroundPixels = 0;
  let centerForegroundPixels = 0;
  let minForegroundX = width;
  let minForegroundY = height;
  let maxForegroundX = -1;
  let maxForegroundY = -1;
  let detailEdges = 0;
  const detailComparisons = Math.max(1, (width - 1) * height + width * (height - 1));

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * channels;
      const red = pixels[offset] ?? 0;
      const green = pixels[offset + 1] ?? 0;
      const blue = pixels[offset + 2] ?? 0;
      const alpha = channels === 4 ? pixels[offset + 3] ?? 255 : 255;
      const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const backgroundDistance = Math.hypot(red - background[0], green - background[1], blue - background[2]);
      const foreground = alpha > 16 && (backgroundDistance > 28 || Math.abs(luma - background[3]) > 18);
      if (foreground) {
        foregroundMask[y * width + x] = 1;
        foregroundPixels += 1;
        minForegroundX = Math.min(minForegroundX, x);
        minForegroundY = Math.min(minForegroundY, y);
        maxForegroundX = Math.max(maxForegroundX, x);
        maxForegroundY = Math.max(maxForegroundY, y);
        if (x >= centerMinX && x < centerMaxX && y >= centerMinY && y < centerMaxY) {
          centerForegroundPixels += 1;
        }
      }
      if (alpha > 0) nonTransparentPixels += 1;
      if (red + green + blue > 12) nonBlackPixels += 1;
      lumaTotal += luma;
      lumaSquareTotal += luma * luma;
      buckets.add(((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4));
      if (x + 1 < width) {
        const rightOffset = offset + channels;
        const rightLuma = 0.2126 * (pixels[rightOffset] ?? 0) + 0.7152 * (pixels[rightOffset + 1] ?? 0) + 0.0722 * (pixels[rightOffset + 2] ?? 0);
        if (Math.abs(luma - rightLuma) > 18) detailEdges += 1;
      }
      if (y + 1 < height) {
        const downOffset = offset + width * channels;
        const downLuma = 0.2126 * (pixels[downOffset] ?? 0) + 0.7152 * (pixels[downOffset + 1] ?? 0) + 0.0722 * (pixels[downOffset + 2] ?? 0);
        if (Math.abs(luma - downLuma) > 18) detailEdges += 1;
      }
    }
  }

  const totalPixels = width * height;
  const averageLuma = totalPixels > 0 ? lumaTotal / totalPixels : 0;
  const lumaVariance = Math.max(0, totalPixels > 0 ? lumaSquareTotal / totalPixels - averageLuma * averageLuma : 0);
  const largestForegroundComponentPixels = largestComponentSize(foregroundMask, width, height);
  const foregroundBoundsArea = maxForegroundX >= minForegroundX && maxForegroundY >= minForegroundY
    ? (maxForegroundX - minForegroundX + 1) * (maxForegroundY - minForegroundY + 1)
    : 0;

  return {
    width,
    height,
    nonTransparentPixels,
    nonBlackPixels,
    uniqueColorBuckets: buckets.size,
    averageLuma: Number(averageLuma.toFixed(6)),
    foregroundPixels,
    foregroundCoverage: Number((foregroundPixels / Math.max(1, totalPixels)).toFixed(6)),
    largestForegroundComponentPixels,
    largestForegroundComponentCoverage: Number((largestForegroundComponentPixels / Math.max(1, totalPixels)).toFixed(6)),
    centerForegroundCoverage: Number((centerForegroundPixels / Math.max(1, (centerMaxX - centerMinX) * (centerMaxY - centerMinY))).toFixed(6)),
    foregroundBoundsCoverage: Number((foregroundBoundsArea / Math.max(1, totalPixels)).toFixed(6)),
    detailEdgeDensity: Number((detailEdges / detailComparisons).toFixed(6)),
    localContrast: Number(Math.sqrt(lumaVariance).toFixed(6))
  };
}

function estimateBackgroundColor(pixels: Uint8Array, width: number, height: number, channels: number): readonly [number, number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let luma = 0;
  let count = 0;
  const sample = (x: number, y: number): void => {
    const offset = (y * width + x) * channels;
    const r = pixels[offset] ?? 0;
    const g = pixels[offset + 1] ?? 0;
    const b = pixels[offset + 2] ?? 0;
    red += r;
    green += g;
    blue += b;
    luma += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    count += 1;
  };
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  return [red / Math.max(1, count), green / Math.max(1, count), blue / Math.max(1, count), luma / Math.max(1, count)];
}

function largestComponentSize(mask: Uint8Array, width: number, height: number): number {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let largest = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1 || visited[index] === 1) continue;
    let head = 0;
    let tail = 0;
    let size = 0;
    queue[tail++] = index;
    visited[index] = 1;
    while (head < tail) {
      const current = queue[head++] ?? 0;
      size += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x + 1 < width ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y + 1 < height ? current + width : -1
      ];
      for (const neighbor of neighbors) {
        if (neighbor >= 0 && mask[neighbor] === 1 && visited[neighbor] !== 1) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

function unfilter(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 255;
    case 2:
      return (raw + up) & 255;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 255;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 255;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const prediction = left + up - upLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upLeftDistance = Math.abs(prediction - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}
