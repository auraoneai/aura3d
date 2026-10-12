/**
 * PRD-01 metric: temporal sigma — per-pixel luma standard deviation across a
 * capture strip (the specular-aa scene's `sigma <= 1.2x three` gate). Frames
 * must share dimensions; the strip is the N screenshots of the same live scene.
 */

import type { ImageLike, MaskRect } from "./maskIoU";

export interface TemporalSigmaResult {
  /** Mean per-pixel sigma across the evaluated pixels. */
  readonly meanSigma: number;
  /** 95th-percentile sigma. */
  readonly p95Sigma: number;
  /** Worst per-pixel sigma. */
  readonly maxSigma: number;
  readonly pixels: number;
  readonly frames: number;
}

function lumaAt(img: ImageLike, x: number, y: number): number {
  const o = (y * img.width + x) * 4;
  return 0.2126 * img.data[o]! + 0.7152 * img.data[o + 1]! + 0.0722 * img.data[o + 2]!;
}

export function temporalSigma(frames: readonly ImageLike[], region?: MaskRect): TemporalSigmaResult {
  if (frames.length < 2) return { meanSigma: 0, p95Sigma: 0, maxSigma: 0, pixels: 0, frames: frames.length };
  const first = frames[0]!;
  const x0 = region ? Math.max(0, Math.floor(region.x * first.width)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y * first.height)) : 0;
  const x1 = region ? Math.min(first.width, Math.ceil((region.x + region.w) * first.width)) : first.width;
  const y1 = region ? Math.min(first.height, Math.ceil((region.y + region.h) * first.height)) : first.height;

  const sigmas: number[] = [];
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      let sum = 0;
      let sumSq = 0;
      for (const frame of frames) {
        const l = lumaAt(frame, x, y);
        sum += l;
        sumSq += l * l;
      }
      const n = frames.length;
      const variance = Math.max(0, sumSq / n - (sum / n) * (sum / n));
      sigmas.push(Math.sqrt(variance));
    }
  }
  if (sigmas.length === 0) return { meanSigma: 0, p95Sigma: 0, maxSigma: 0, pixels: 0, frames: frames.length };
  sigmas.sort((a, b) => a - b);
  const meanSigma = sigmas.reduce((s, v) => s + v, 0) / sigmas.length;
  return {
    meanSigma,
    p95Sigma: sigmas[Math.floor(0.95 * (sigmas.length - 1))]!,
    maxSigma: sigmas[sigmas.length - 1]!,
    pixels: sigmas.length,
    frames: frames.length
  };
}

export interface HighlightFrameSigmaResult {
  /** RMS frame-to-frame luma change over the highlight pixels (PRD-01 S9 "frame-to-frame σ"). */
  readonly sigma: number;
  /** Pixels whose peak luma over the strip reaches `threshold` (the highlight region). */
  readonly highlightPixels: number;
  readonly frames: number;
  readonly threshold: number;
}

/**
 * PRD-01 §15 `prd01-specular-aa`: temporal luminance variance in highlight
 * regions. The highlight region is every pixel whose peak luma over the strip
 * reaches `threshold`; sigma is the RMS of consecutive-frame luma deltas there,
 * so a still pixel scores 0 and specular sparkle (on/off between frames) dominates.
 */
export function highlightFrameSigma(frames: readonly ImageLike[], threshold = 96): HighlightFrameSigmaResult {
  if (frames.length < 2) return { sigma: 0, highlightPixels: 0, frames: frames.length, threshold };
  const { width, height } = frames[0]!;
  let highlightPixels = 0;
  let sumSq = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let peak = 0;
      for (const frame of frames) peak = Math.max(peak, lumaAt(frame, x, y));
      if (peak < threshold) continue;
      highlightPixels += 1;
      let previous = lumaAt(frames[0]!, x, y);
      for (let t = 1; t < frames.length; t += 1) {
        const current = lumaAt(frames[t]!, x, y);
        sumSq += (current - previous) * (current - previous);
        previous = current;
      }
    }
  }
  const samples = highlightPixels * (frames.length - 1);
  return { sigma: samples > 0 ? Math.sqrt(sumSq / samples) : 0, highlightPixels, frames: frames.length, threshold };
}
