/**
 * PRD-01 metric: alpha/coverage mask IoU + object centroid (PRD-01 §17.3).
 * Pure functions over decoded RGBA frames — used by the lane capture script and
 * by unit tests. A pixel counts as "covered" when its RGB differs from the
 * declared background by more than `tolerance` per channel (captures are
 * opaque, so alpha-coverage reduces to background-difference coverage).
 */

export interface ImageLike {
  readonly data: Uint8ClampedArray | Uint8Array;
  readonly width: number;
  readonly height: number;
}

export interface MaskRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface MaskOptions {
  /** Normalized 0..1 rect limiting the mask; whole image when omitted. */
  readonly region?: MaskRect;
  /** Reference background rgb; default black. */
  readonly background?: readonly [number, number, number];
  /** Per-channel difference that counts as covered; default 8/255. */
  readonly tolerance?: number;
}

export interface MaskIoUResult {
  readonly iou: number;
  readonly coverageA: number;
  readonly coverageB: number;
  readonly intersection: number;
  readonly union: number;
  readonly centroidA: readonly [number, number];
  readonly centroidB: readonly [number, number];
  /** Centroid distance in pixels. */
  readonly centroidDeltaPx: number;
  readonly pixels: number;
}

function regionPixels(img: ImageLike, region?: MaskRect): { x0: number; y0: number; x1: number; y1: number } {
  if (!region) return { x0: 0, y0: 0, x1: img.width, y1: img.height };
  const x0 = Math.max(0, Math.floor(region.x * img.width));
  const y0 = Math.max(0, Math.floor(region.y * img.height));
  const x1 = Math.min(img.width, Math.ceil((region.x + region.w) * img.width));
  const y1 = Math.min(img.height, Math.ceil((region.y + region.h) * img.height));
  return { x0, y0, x1, y1 };
}

/** Coverage mask (1 = covered) over the requested region or the whole frame. */
export function coverageMask(img: ImageLike, options: MaskOptions = {}): { mask: Uint8Array; width: number; height: number } {
  const { x0, y0, x1, y1 } = regionPixels(img, options.region);
  const w = x1 - x0;
  const h = y1 - y0;
  const mask = new Uint8Array(w * h);
  const bg = options.background ?? [0, 0, 0];
  const tol = options.tolerance ?? 8;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = ((y + y0) * img.width + (x + x0)) * 4;
      const covered =
        Math.abs(img.data[o]! - bg[0]) > tol ||
        Math.abs(img.data[o + 1]! - bg[1]) > tol ||
        Math.abs(img.data[o + 2]! - bg[2]) > tol;
      mask[y * w + x] = covered ? 1 : 0;
    }
  }
  return { mask, width: w, height: h };
}

function centroidOf(mask: Uint8Array, width: number, height: number): readonly [number, number] {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        sx += x;
        sy += y;
        n += 1;
      }
    }
  }
  return n === 0 ? [0, 0] : [sx / n, sy / n];
}

export function maskIoU(a: ImageLike, b: ImageLike, options: MaskOptions = {}): MaskIoUResult {
  const maskA = coverageMask(a, options);
  const maskB = coverageMask(b, options);
  const pixels = maskA.mask.length;
  let intersection = 0;
  let coveredA = 0;
  let coveredB = 0;
  for (let i = 0; i < pixels; i += 1) {
    const ma = maskA.mask[i]!;
    const mb = maskB.mask[i]!;
    if (ma) coveredA += 1;
    if (mb) coveredB += 1;
    if (ma && mb) intersection += 1;
  }
  const union = coveredA + coveredB - intersection;
  const centroidA = centroidOf(maskA.mask, maskA.width, maskA.height);
  const centroidB = centroidOf(maskB.mask, maskB.width, maskB.height);
  const centroidDeltaPx = Math.hypot(centroidA[0] - centroidB[0], centroidA[1] - centroidB[1]);
  return {
    iou: union === 0 ? 1 : intersection / union,
    coverageA: pixels === 0 ? 0 : coveredA / pixels,
    coverageB: pixels === 0 ? 0 : coveredB / pixels,
    intersection,
    union,
    centroidA,
    centroidB,
    centroidDeltaPx,
    pixels
  };
}
