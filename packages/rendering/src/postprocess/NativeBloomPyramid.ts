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


/**
 * Resolve a widening Gaussian radius for each mip while preserving the
 * authored radius as the quality control. The cinematic reference profile at
 * authored radius 4 follows [6, 10, 14, 16, 16]; smaller authored radii scale
 * the same profile instead of applying one narrow box kernel to every mip.
 */
export function resolveBloomPyramidBlurRadii(plan: BloomPyramidPlan, authoredRadius: number): number[] {
  if (!Number.isInteger(authoredRadius) || authoredRadius < 0 || authoredRadius > 16) {
    throw new Error(`Bloom pyramid radius must be an integer in [0, 16], received ${String(authoredRadius)}.`);
  }
  if (plan.quality === "performance") return [authoredRadius];
  const reference = plan.quality === "balanced" ? [6, 10, 14] : [6, 10, 14, 18, 22];
  if (authoredRadius === 0) return reference.map(() => 0);
  return reference.map((radius) => Math.max(1, Math.min(16, Math.round(radius * authoredRadius / 4))));
}

/** Energy-preserving mip gain: normalized per-mip weights always sum to 1. */
export function bloomPyramidCompositeGain(plan: BloomPyramidPlan): number {
  return plan.weights.reduce((total, weight) => total + weight, 0);
}

/**
 * Global multiscale response applied after the normalized mip composite.
 * This is deliberately separate from the energy-preserving weights: authored
 * strength remains one control, while balanced/cinematic recover the visual
 * response of a multi-mip bloom stack instead of becoming weaker as mips are
 * normalized. The cinematic response is calibrated against the frozen r185
 * ACES/sRGB workload; keeping it explicit makes the measured response auditable.
 */
export function resolveBloomPyramidResponseGain(plan: BloomPyramidPlan): number {
  if (plan.quality === "performance") return 1;
  return plan.quality === "balanced" ? 7 : 17;
}

/**
 * PRD-03 §6.6 — v2 analytic bloom normalisation `k(N)`.
 *
 * The v2 pyramid is additive: `up_i = down_i + tent(up_{i+1})`, and both the
 * 13-tap downsample and the 9-tap tent are energy-conserving (their kernels
 * sum to 1). A constant above-threshold signal of excess `E` therefore
 * contributes `E` once per mip level: `bloom = N · E`. Normalising by `1/N`
 * makes the composite `hdr + bloom · intensity` produce exactly `E · intensity`
 * for that input — there is no other gain.
 *
 * `scatter` is the tent radius in texels; it widens the halo but does not
 * change the response to a constant signal, so it does not enter the factor.
 * The flag-off `resolveBloomPyramidResponseGain` heuristic stays for the
 * legacy path only and is deleted at flag removal (Phase 8).
 */
export function bloomNormalization(mips: number, scatter: number): number {
  if (!Number.isInteger(mips) || mips < 1) {
    throw new Error(`Bloom mip count must be a positive integer, received ${String(mips)}.`);
  }
  if (!(scatter >= 0) || scatter > 1) {
    throw new Error(`Bloom scatter must be finite and in [0, 1], received ${String(scatter)}.`);
  }
  return 1 / mips;
}

/**
 * GU47 E-C (EC-7) selective bloom: per-material `bloom` weight in [0, 2]
 * (`AuraMaterialSpec.bloom`, default 1). Opaque surfaces write the weight
 * into the HDR target's alpha (blend is off for them, so RGB is untouched)
 * and the bloom prefilter multiplies its above-threshold excess by
 * `auraBloomWeight(alpha, selective)`. `selective` is on only when a scene
 * material declares a weight other than 1; off, the factor is exactly 1.0,
 * so weight 1 everywhere reproduces today's bloom bit for bit.
 */
export const BLOOM_WEIGHT_DEFAULT = 1;
export const BLOOM_WEIGHT_MAX = 2;

/** A material `bloom` value as the prefilter sees it: clamped to [0, 2]; missing or non-finite = 1. */
export function resolveBloomWeight(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(BLOOM_WEIGHT_MAX, Math.max(0, value)) : BLOOM_WEIGHT_DEFAULT;
}

/** True when any weight differs from 1, i.e. the prefilter must read the alpha weight. */
export function selectiveBloomActive(weights: Iterable<unknown>): boolean {
  for (const weight of weights) if (resolveBloomWeight(weight) !== BLOOM_WEIGHT_DEFAULT) return true;
  return false;
}

/** GLSL ES 3.00 prefilter helper (include before `main`): the bloom weight carried in HDR alpha, or 1.0 when selective bloom is off. */
export const BLOOM_WEIGHT_GLSL = /* glsl */ `
float auraBloomWeight(float alpha, int selective) {
  return selective == 1 ? clamp(alpha, 0.0, ${BLOOM_WEIGHT_MAX.toFixed(1)}) : 1.0;
}
`;

/** CPU mirror of the weighted soft-knee prefilter excess (u_excess path) for one HDR texel. */
export function bloomPrefilterExcess(rgb: readonly [number, number, number], alpha: number, threshold: number, softKnee: number, selective: boolean): [number, number, number] {
  const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const knee = Math.max(softKnee, 0);
  let soft = Math.min(2 * knee, Math.max(0, luma - threshold + knee));
  soft = (soft * soft) / (4 * knee + 1e-5);
  const excessWeight = (Math.max(soft, luma - threshold) / Math.max(luma, 1e-5)) * (selective ? Math.min(BLOOM_WEIGHT_MAX, Math.max(0, alpha)) : 1);
  return [rgb[0] * excessWeight, rgb[1] * excessWeight, rgb[2] * excessWeight];
}

/** PRD-03 §6.6 flag-on: per-mip Gaussian kernel radii of the UnrealBloomPass-class halo (three r185 `kernelSizeArray`). */
export const BLOOM_V2_BLUR_RADII: readonly number[] = [6, 10, 14, 18, 22];
/** PRD-03 §6.6 flag-on: base per-mip factors mirrored by `spread` (three r185 `bloomFactors`). */
const BLOOM_V2_MIP_FACTORS: readonly number[] = [1, 0.8, 0.6, 0.4, 0.2];

/**
 * PRD-03 §6.6 flag-on pyramid response for the native (fused) bloom.
 *
 * The legacy cinematic weights `[0.4, 0.25, 0.16, 0.11, 0.08]` concentrate the
 * energy in the two finest mips and its kernels scale with the integer
 * radius, which only looked right behind the ×17 response gain. Flag-on has
 * no hidden gain, so the halo shape has to come from the pyramid itself:
 * fixed widening kernels and per-mip weights `mix(f, 1.2 − f, spread)`
 * normalised to sum to 1 — a constant above-threshold excess E still blooms
 * exactly E · intensity (`bloomNormalization`), while `spread` (the authored
 * 0..1 radius) moves energy from the fine mips to the wide ones.
 */
export function resolveBloomPyramidV2Response(plan: BloomPyramidPlan, spread: number): { readonly weights: readonly number[]; readonly blurRadii: readonly number[] } {
  if (!(spread >= 0) || spread > 1) {
    throw new Error(`Bloom spread must be finite and in [0, 1], received ${String(spread)}.`);
  }
  if (plan.quality === "performance") return { weights: [1], blurRadii: [BLOOM_V2_BLUR_RADII[0]!] };
  const count = plan.mips.length;
  const raw = Array.from({ length: count }, (_, index) => {
    const factor = BLOOM_V2_MIP_FACTORS[Math.min(index, BLOOM_V2_MIP_FACTORS.length - 1)]!;
    return factor + (1.2 - 2 * factor) * spread;
  });
  const total = raw.reduce((sum, weight) => sum + weight, 0);
  return {
    weights: raw.map((weight) => weight / total),
    blurRadii: Array.from({ length: count }, (_, index) => BLOOM_V2_BLUR_RADII[Math.min(index, BLOOM_V2_BLUR_RADII.length - 1)]!)
  };
}
