/**
 * PRD-01 metric: windowed SSIM over a region, plus mean-absolute-difference
 * (the blend-modes scene's MAD <= 2/255 gate). Luma is Rec.709.
 */

import type { ImageLike, MaskRect } from "./maskIoU";

export interface RegionSsimResult {
  readonly ssim: number;
  readonly meanAbsDiff: number;
  readonly maxAbsDiff: number;
  readonly pixels: number;
}

const C1 = 6.5025; // (0.01 * 255)^2
const C2 = 58.5225; // (0.03 * 255)^2
const WINDOW = 8;

function luma(data: Uint8ClampedArray | Uint8Array, offset: number): number {
  return 0.2126 * data[offset]! + 0.7152 * data[offset + 1]! + 0.0722 * data[offset + 2]!;
}

function bounds(img: ImageLike, region?: MaskRect): { x0: number; y0: number; x1: number; y1: number } {
  if (!region) return { x0: 0, y0: 0, x1: img.width, y1: img.height };
  return {
    x0: Math.max(0, Math.floor(region.x * img.width)),
    y0: Math.max(0, Math.floor(region.y * img.height)),
    x1: Math.min(img.width, Math.ceil((region.x + region.w) * img.width)),
    y1: Math.min(img.height, Math.ceil((region.y + region.h) * img.height))
  };
}

/** Mean |rgb difference| over a region, 0..255. */
export function meanAbsDiff(a: ImageLike, b: ImageLike, region?: MaskRect): { mad: number; maxDiff: number; pixels: number } {
  const { x0, y0, x1, y1 } = bounds(a, region);
  let sum = 0;
  let maxDiff = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const o = (y * a.width + x) * 4;
      const diff = (Math.abs(a.data[o]! - b.data[o]!) + Math.abs(a.data[o + 1]! - b.data[o + 1]!) + Math.abs(a.data[o + 2]! - b.data[o + 2]!)) / 3;
      sum += diff;
      if (diff > maxDiff) maxDiff = diff;
      count += 1;
    }
  }
  return { mad: count === 0 ? 0 : sum / count, maxDiff, pixels: count };
}

/**
 * SSIM over 8x8 non-overlapping windows of the region (means/vars per window,
 * averaged). Identical frames score 1.
 */
export function regionSsim(a: ImageLike, b: ImageLike, region?: MaskRect): RegionSsimResult {
  const { x0, y0, x1, y1 } = bounds(a, region);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return { ssim: 1, meanAbsDiff: 0, maxAbsDiff: 0, pixels: 0 };

  let ssimSum = 0;
  let windows = 0;
  for (let wy = y0; wy + WINDOW <= y1; wy += WINDOW) {
    for (let wx = x0; wx + WINDOW <= x1; wx += WINDOW) {
      let sumA = 0;
      let sumB = 0;
      let sumA2 = 0;
      let sumB2 = 0;
      let sumAB = 0;
      for (let y = wy; y < wy + WINDOW; y += 1) {
        for (let x = wx; x < wx + WINDOW; x += 1) {
          const o = (y * a.width + x) * 4;
          const la = luma(a.data, o);
          const lb = luma(b.data, o);
          sumA += la;
          sumB += lb;
          sumA2 += la * la;
          sumB2 += lb * lb;
          sumAB += la * lb;
        }
      }
      const n = WINDOW * WINDOW;
      const muA = sumA / n;
      const muB = sumB / n;
      const varA = sumA2 / n - muA * muA;
      const varB = sumB2 / n - muB * muB;
      const cov = sumAB / n - muA * muB;
      ssimSum += ((2 * muA * muB + C1) * (2 * cov + C2)) / ((muA * muA + muB * muB + C1) * (varA + varB + C2));
      windows += 1;
    }
  }
  const { mad, maxDiff, pixels } = meanAbsDiff(a, b, region);
  return {
    ssim: windows === 0 ? (mad === 0 ? 1 : 0) : ssimSum / windows,
    meanAbsDiff: mad,
    maxAbsDiff: maxDiff,
    pixels
  };
}
