/**
 * Native bloom pyramid planning (muse3jsparity-PRD A1).
 *
 * Pure, unit-tested math for the GPU bloom mip chain: mip sizes,
 * energy-preserving per-mip weights, and target byte accounting. The WebGL2
 * execution lives in `WebGL2Device.executeNativeBloomPyramidPasses`.
 */

export type BloomQualityPreset = "performance" | "balanced" | "cinematic";

export interface BloomPyramidMip {
  readonly width: number;
  readonly height: number;
}

export interface BloomPyramidPlan {
  readonly quality: BloomQualityPreset;
  /** 1 for performance (legacy single-scale path), 3 for balanced, 5 for cinematic. */
  readonly mipCount: number;
  /** mip[0] is half resolution; each subsequent mip halves again (min 1x1). */
  readonly mips: readonly BloomPyramidMip[];
  /** Per-mip composite weights; always sum to exactly 1 (energy-preserving). */
  readonly weights: readonly number[];
  readonly halfFloat: boolean;
  readonly targetBytes: number;
}

const PYRAMID_WEIGHTS: Record<Exclude<BloomQualityPreset, "performance">, readonly number[]> = {
  balanced: [0.55, 0.3, 0.15],
  cinematic: [0.4, 0.25, 0.16, 0.11, 0.08],
};

export function normalizeBloomQualityPreset(value: unknown): BloomQualityPreset {
  if (value === undefined) return "performance";
  if (value === "performance" || value === "balanced" || value === "cinematic") return value;
  throw new Error(`Bloom quality must be one of performance|balanced|cinematic, received ${String(value)}.`);
}

export function resolveBloomPyramidPlan(
  sourceWidth: number,
  sourceHeight: number,
  quality: BloomQualityPreset,
  hdr: boolean
): BloomPyramidPlan {
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0) {
    throw new Error(`Bloom pyramid source width must be a positive integer, received ${String(sourceWidth)}.`);
  }
  if (!Number.isInteger(sourceHeight) || sourceHeight <= 0) {
    throw new Error(`Bloom pyramid source height must be a positive integer, received ${String(sourceHeight)}.`);
  }
  const halfFloat = hdr || quality === "cinematic";
  if (quality === "performance") {
    return {
      quality,
      mipCount: 1,
      mips: [{ width: sourceWidth, height: sourceHeight }],
      weights: [1],
      halfFloat,
      targetBytes: sourceWidth * sourceHeight * 4 * (halfFloat ? 2 : 1),
    };
  }
  const weights = PYRAMID_WEIGHTS[quality];
  const mips: BloomPyramidMip[] = [];
  let width = Math.max(1, Math.ceil(sourceWidth / 2));
  let height = Math.max(1, Math.ceil(sourceHeight / 2));
  for (let index = 0; index < weights.length; index += 1) {
    mips.push({ width, height });
    width = Math.max(1, Math.ceil(width / 2));
    height = Math.max(1, Math.ceil(height / 2));
  }
  const bytesPerChannel = halfFloat ? 2 : 1;
  const targetBytes = mips.reduce((total, mip) => total + mip.width * mip.height * 4 * bytesPerChannel, 0);
  return { quality, mipCount: weights.length, mips, weights, halfFloat, targetBytes };
}

/** Energy-preserving composite gain for evidence: always 1 for pyramid weights. */
export function bloomPyramidCompositeGain(plan: BloomPyramidPlan): number {
  return plan.weights.reduce((total, weight) => total + weight, 0);
}
