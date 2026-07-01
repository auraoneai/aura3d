// allow: SIZE_OK - single PNG foreground analysis module for browser evidence; split plan recorded in .omo/evidence/full-showcase-recovery-size-split-plan.md.
import { inflateSync } from "node:zlib";

export interface PngCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PngRelativeCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PngVisualStats {
  readonly width: number;
  readonly height: number;
  readonly crop: PngCrop;
  readonly sampleCount: number;
  readonly opaqueRatio: number;
  readonly nonBackgroundRatio: number;
  readonly colorfulRatio: number;
  readonly lumaMean: number;
  readonly lumaVariance: number;
  readonly uniqueColorBuckets: number;
  readonly signature: string;
}

export interface PngForegroundStats {
  readonly width: number;
  readonly height: number;
  readonly crop: PngCrop;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds?: PngCrop;
  readonly clipped: boolean;
  readonly nonBackgroundRatio: number;
  readonly readabilityScore: number;
}

export interface PngDiffStats {
  readonly width: number;
  readonly height: number;
  readonly crop: PngCrop;
  readonly sampleCount: number;
  readonly meanChannelDelta: number;
  readonly changedRatio: number;
  readonly strongChangedRatio: number;
  readonly signatureBefore: string;
  readonly signatureAfter: string;
}

interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly channels: 3 | 4;
  readonly data: Uint8Array;
}

interface ForegroundComponent {
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds: PngCrop;
  readonly clipped: boolean;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function analyzePng(buffer: Buffer, crop?: Partial<PngCrop>): PngVisualStats {
  const image = decodePng(buffer);
  const resolvedCrop = resolveCrop(image, crop);
  const first = pixelAt(image, resolvedCrop.x, resolvedCrop.y);
  const background = { r: first.r, g: first.g, b: first.b };
  const uniqueBuckets = new Set<string>();
  let hash = 2166136261;
  let sampleCount = 0;
  let opaqueCount = 0;
  let nonBackgroundCount = 0;
  let colorfulCount = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  const stride = Math.max(1, Math.floor((resolvedCrop.width * resolvedCrop.height) / 40_000));

  for (let offset = 0; offset < resolvedCrop.width * resolvedCrop.height; offset += stride) {
    const x = resolvedCrop.x + (offset % resolvedCrop.width);
    const y = resolvedCrop.y + Math.floor(offset / resolvedCrop.width);
    const pixel = pixelAt(image, x, y);
    const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
    const chroma = Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
    const backgroundDistance = Math.abs(pixel.r - background.r) + Math.abs(pixel.g - background.g) + Math.abs(pixel.b - background.b);

    sampleCount += 1;
    if (pixel.a > 220) opaqueCount += 1;
    if (backgroundDistance > 24) nonBackgroundCount += 1;
    if (chroma > 18) colorfulCount += 1;
    lumaSum += luma;
    lumaSquareSum += luma * luma;
    uniqueBuckets.add(`${pixel.r >> 4}:${pixel.g >> 4}:${pixel.b >> 4}:${pixel.a >> 6}`);
    hash = hashPixel(hash, pixel.r, pixel.g, pixel.b, pixel.a);
  }

  const lumaMean = sampleCount > 0 ? lumaSum / sampleCount : 0;
  const lumaVariance = sampleCount > 0 ? Math.max(0, lumaSquareSum / sampleCount - lumaMean * lumaMean) : 0;

  return {
    width: image.width,
    height: image.height,
    crop: resolvedCrop,
    sampleCount,
    opaqueRatio: ratio(opaqueCount, sampleCount),
    nonBackgroundRatio: ratio(nonBackgroundCount, sampleCount),
    colorfulRatio: ratio(colorfulCount, sampleCount),
    lumaMean: Number(lumaMean.toFixed(2)),
    lumaVariance: Number(lumaVariance.toFixed(2)),
    uniqueColorBuckets: uniqueBuckets.size,
    signature: `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`
  };
}

export function analyzeForegroundPng(buffer: Buffer, crop?: Partial<PngCrop>): PngForegroundStats {
  const image = decodePng(buffer);
  const resolvedCrop = resolveCrop(image, crop);
  const background = averageCornerColor(image, resolvedCrop);
  const mask = new Uint8Array(resolvedCrop.width * resolvedCrop.height);

  for (let y = resolvedCrop.y; y < resolvedCrop.y + resolvedCrop.height; y += 1) {
    for (let x = resolvedCrop.x; x < resolvedCrop.x + resolvedCrop.width; x += 1) {
      const pixel = pixelAt(image, x, y);
      const backgroundDistance = Math.abs(pixel.r - background.r) + Math.abs(pixel.g - background.g) + Math.abs(pixel.b - background.b);
      const luma = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
      if (pixel.a <= 8 || backgroundDistance <= 30 || luma <= 7) continue;
      const localX = x - resolvedCrop.x;
      const localY = y - resolvedCrop.y;
      mask[localY * resolvedCrop.width + localX] = 1;
    }
  }

  const component = selectForegroundComponent(image, resolvedCrop, mask);
  const foregroundBounds = component?.foregroundBounds;
  const nonBlankPixels = component?.nonBlankPixels ?? 0;
  const colorBuckets = component?.colorBuckets ?? 0;
  const clipped = component?.clipped ?? false;
  const nonBackgroundRatio = ratio(nonBlankPixels, resolvedCrop.width * resolvedCrop.height);
  const foregroundAreaRatio = foregroundBounds
    ? ratio(foregroundBounds.width * foregroundBounds.height, resolvedCrop.width * resolvedCrop.height)
    : 0;
  const readabilityScore = Math.round(
    Math.min(35, nonBackgroundRatio * 700) +
    Math.min(25, colorBuckets) +
    Math.min(25, foregroundAreaRatio * 500) +
    (clipped ? 0 : 15)
  );

  return {
    width: image.width,
    height: image.height,
    crop: resolvedCrop,
    nonBlankPixels,
    colorBuckets,
    ...(foregroundBounds ? { foregroundBounds } : {}),
    clipped,
    nonBackgroundRatio,
    readabilityScore
  };
}

function selectForegroundComponent(
  image: DecodedPng,
  crop: PngCrop,
  mask: Uint8Array
): ForegroundComponent | undefined {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const components: ForegroundComponent[] = [];
  const minComponentPixels = Math.max(40, Math.floor(mask.length * 0.00004));

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue;

    let stackLength = 1;
    stack[0] = start;
    visited[start] = 1;
    let nonBlankPixels = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = -1;
    let maxY = -1;
    const buckets = new Set<string>();

    while (stackLength > 0) {
      const index = stack[--stackLength] ?? 0;
      const localX = index % crop.width;
      const localY = Math.floor(index / crop.width);
      const x = crop.x + localX;
      const y = crop.y + localY;
      const pixel = pixelAt(image, x, y);

      nonBlankPixels += 1;
      buckets.add(`${pixel.r >> 4}:${pixel.g >> 4}:${pixel.b >> 4}`);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (localX > 0) stackLength = pushMaskNeighbor(index - 1, mask, visited, stack, stackLength);
      if (localX + 1 < crop.width) stackLength = pushMaskNeighbor(index + 1, mask, visited, stack, stackLength);
      if (localY > 0) stackLength = pushMaskNeighbor(index - crop.width, mask, visited, stack, stackLength);
      if (localY + 1 < crop.height) stackLength = pushMaskNeighbor(index + crop.width, mask, visited, stack, stackLength);
    }

    if (nonBlankPixels < minComponentPixels) continue;
    const foregroundBounds = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    components.push({
      nonBlankPixels,
      colorBuckets: buckets.size,
      foregroundBounds,
      clipped: isBoundsClipped(foregroundBounds, crop)
    });
  }

  if (components.length === 0) return undefined;
  const prominentThreshold = Math.max(500, Math.floor(mask.length * 0.0005));
  const nonClipped = components.filter((component) => !component.clipped && component.nonBlankPixels >= prominentThreshold);
  const pool = nonClipped.length > 0 ? nonClipped : components;
  return pool.sort((left, right) => componentScore(right, crop) - componentScore(left, crop))[0];
}

function pushMaskNeighbor(
  index: number,
  mask: Uint8Array,
  visited: Uint8Array,
  stack: Int32Array,
  stackLength: number
): number {
  if (mask[index] === 1 && visited[index] !== 1) {
    visited[index] = 1;
    stack[stackLength] = index;
    return stackLength + 1;
  }
  return stackLength;
}

function isBoundsClipped(bounds: PngCrop, crop: PngCrop): boolean {
  return bounds.x <= crop.x + 2 ||
    bounds.y <= crop.y + 2 ||
    bounds.x + bounds.width >= crop.x + crop.width - 2 ||
    bounds.y + bounds.height >= crop.y + crop.height - 2;
}

function componentScore(component: ForegroundComponent, crop: PngCrop): number {
  const cropArea = Math.max(1, crop.width * crop.height);
  const bounds = component.foregroundBounds;
  const boundsArea = Math.max(1, bounds.width * bounds.height);
  const cropCenterX = crop.x + crop.width / 2;
  const cropCenterY = crop.y + crop.height / 2;
  const componentCenterX = bounds.x + bounds.width / 2;
  const componentCenterY = bounds.y + bounds.height / 2;
  const maxDistance = Math.max(1, Math.hypot(crop.width / 2, crop.height / 2));
  const distance = Math.hypot(componentCenterX - cropCenterX, componentCenterY - cropCenterY);
  const centrality = 1 - Math.min(1, distance / maxDistance);
  const size = Math.min(1, component.nonBlankPixels / Math.max(2_500, cropArea * 0.05));
  const color = Math.min(1, component.colorBuckets / 32);
  const boundsPresence = Math.min(1, (boundsArea / cropArea) * 12);
  const compactness = Math.min(1, component.nonBlankPixels / boundsArea);
  return size * 3 + color + centrality * 2 + boundsPresence + compactness * 0.5 - (component.clipped ? 2 : 0);
}

export function comparePngBuffers(before: Buffer, after: Buffer, crop?: Partial<PngCrop>): PngDiffStats {
  const first = decodePng(before);
  const second = decodePng(after);
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error(`PNG dimensions differ: ${first.width}x${first.height} vs ${second.width}x${second.height}`);
  }

  const resolvedCrop = resolveCrop(first, crop);
  const stride = Math.max(1, Math.floor((resolvedCrop.width * resolvedCrop.height) / 40_000));
  let sampleCount = 0;
  let deltaSum = 0;
  let changedCount = 0;
  let strongChangedCount = 0;
  let hashBefore = 2166136261;
  let hashAfter = 2166136261;

  for (let offset = 0; offset < resolvedCrop.width * resolvedCrop.height; offset += stride) {
    const x = resolvedCrop.x + (offset % resolvedCrop.width);
    const y = resolvedCrop.y + Math.floor(offset / resolvedCrop.width);
    const a = pixelAt(first, x, y);
    const b = pixelAt(second, x, y);
    const delta = (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)) / 3;

    sampleCount += 1;
    deltaSum += delta;
    if (delta > 8) changedCount += 1;
    if (delta > 28) strongChangedCount += 1;
    hashBefore = hashPixel(hashBefore, a.r, a.g, a.b, a.a);
    hashAfter = hashPixel(hashAfter, b.r, b.g, b.b, b.a);
  }

  return {
    width: first.width,
    height: first.height,
    crop: resolvedCrop,
    sampleCount,
    meanChannelDelta: Number((sampleCount > 0 ? deltaSum / sampleCount : 0).toFixed(2)),
    changedRatio: ratio(changedCount, sampleCount),
    strongChangedRatio: ratio(strongChangedCount, sampleCount),
    signatureBefore: `fnv1a-${(hashBefore >>> 0).toString(16).padStart(8, "0")}`,
    signatureAfter: `fnv1a-${(hashAfter >>> 0).toString(16).padStart(8, "0")}`
  };
}

export function cropFromRelative(parent: PngCrop, crop: PngRelativeCrop): PngCrop {
  const parentRight = parent.x + parent.width;
  const parentBottom = parent.y + parent.height;
  const x = clamp(parent.x + Math.round(parent.width * clamp(crop.x, 0, 0.999)), parent.x, parentRight - 1);
  const y = clamp(parent.y + Math.round(parent.height * clamp(crop.y, 0, 0.999)), parent.y, parentBottom - 1);
  const width = clamp(Math.round(parent.width * clamp(crop.width, 0.001, 1)), 1, Math.max(1, parentRight - x));
  const height = clamp(Math.round(parent.height * clamp(crop.height, 0.001, 1)), 1, Math.max(1, parentBottom - y));
  return { x, y, width, height };
}

export function comparePngBuffersInRelativeCrop(
  before: Buffer,
  after: Buffer,
  parentCrop: PngCrop,
  relativeCrop: PngRelativeCrop
): PngDiffStats {
  return comparePngBuffers(before, after, cropFromRelative(parentCrop, relativeCrop));
}

function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.length < pngSignature.length || !buffer.subarray(0, pngSignature.length).equals(pngSignature)) {
    throw new Error("Expected a PNG buffer.");
  }

  let offset = pngSignature.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      const interlace = data[12] ?? 0;
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
      if (interlace !== 0) throw new Error("Interlaced PNG screenshots are not supported by this lightweight decoder.");
      if (colorType !== 2 && colorType !== 6) throw new Error(`Unsupported PNG color type ${colorType}.`);
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0) {
    throw new Error("PNG is missing IHDR or IDAT data.");
  }

  const channels = colorType === 6 ? 4 : 3;
  const scanlineBytes = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const data = new Uint8Array(width * height * channels);
  let inputOffset = 0;
  let outputOffset = 0;
  const previous = new Uint8Array(scanlineBytes);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const current = new Uint8Array(scanlineBytes);
    for (let x = 0; x < scanlineBytes; x += 1) {
      const raw = inflated[inputOffset + x] ?? 0;
      const left = x >= channels ? current[x - channels] ?? 0 : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= channels ? previous[x - channels] ?? 0 : 0;
      current[x] = unfilterByte(filter ?? 0, raw, left, up, upLeft);
    }
    inputOffset += scanlineBytes;
    data.set(current, outputOffset);
    previous.set(current);
    outputOffset += scanlineBytes;
  }

  return { width, height, channels: channels as 3 | 4, data };
}

function unfilterByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function resolveCrop(image: DecodedPng, crop?: Partial<PngCrop>): PngCrop {
  const x = clamp(Math.floor(crop?.x ?? 0), 0, image.width - 1);
  const y = clamp(Math.floor(crop?.y ?? 0), 0, image.height - 1);
  const width = clamp(Math.floor(crop?.width ?? image.width), 1, image.width - x);
  const height = clamp(Math.floor(crop?.height ?? image.height), 1, image.height - y);
  return { x, y, width, height };
}

function pixelAt(image: DecodedPng, x: number, y: number): { readonly r: number; readonly g: number; readonly b: number; readonly a: number } {
  const index = (y * image.width + x) * image.channels;
  return {
    r: image.data[index] ?? 0,
    g: image.data[index + 1] ?? 0,
    b: image.data[index + 2] ?? 0,
    a: image.channels === 4 ? image.data[index + 3] ?? 255 : 255
  };
}

function averageCornerColor(image: DecodedPng, crop: PngCrop): { readonly r: number; readonly g: number; readonly b: number } {
  const points = [
    pixelAt(image, crop.x, crop.y),
    pixelAt(image, crop.x + crop.width - 1, crop.y),
    pixelAt(image, crop.x, crop.y + crop.height - 1),
    pixelAt(image, crop.x + crop.width - 1, crop.y + crop.height - 1)
  ];
  return {
    r: Math.round(points.reduce((sum, pixel) => sum + pixel.r, 0) / points.length),
    g: Math.round(points.reduce((sum, pixel) => sum + pixel.g, 0) / points.length),
    b: Math.round(points.reduce((sum, pixel) => sum + pixel.b, 0) / points.length)
  };
}

function hashPixel(hash: number, r: number, g: number, b: number, a: number): number {
  hash ^= r;
  hash = Math.imul(hash, 16777619);
  hash ^= g;
  hash = Math.imul(hash, 16777619);
  hash ^= b;
  hash = Math.imul(hash, 16777619);
  hash ^= a;
  return Math.imul(hash, 16777619);
}

function ratio(count: number, total: number): number {
  return total > 0 ? Number((count / total).toFixed(4)) : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
