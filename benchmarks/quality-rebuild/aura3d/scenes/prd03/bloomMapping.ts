/**
 * PRD-03 §16.1 / Phase 2 — frozen three.js UnrealBloomPass → Aura bloom V2
 * mapping. Calibrated analytically on `prd03-hdr-bloom` (halo-energy parity
 * argument below); the remote ±10% halo-energy capture check is recorded in
 * `evidence/prd03/phase2/bloom-mapping-calibration.md`. FROZEN — do not tune.
 *
 * Derivation:
 *  - three `UnrealBloomPass` composites 5 fixed mips with weights
 *    `lerpBloomFactor(f) = mix(f, 1.2 − f, radius)` at f ∈ {1, .8, .6, .4, .2}
 *    (Σ = 3.0 for every radius), and r185's composite multiplies the sum by
 *    a further `3.0 * bloomStrength` ("3.0 for backwards compatibility with
 *    previous alpha-based intensity", UnrealBloomPass.js `_getCompositeMaterial`).
 *    Its separable Gaussian blurs are energy-preserving, so a uniform-E input
 *    contributes `strength × 9.0 × E` of additive halo.
 *  - Aura V2 (§6.6) sums `mips` mips with weights normalised to 1, then
 *    multiplies `intensity` → uniform-E contribution `intensity × E`.
 *  - Halo-energy equality ⇒ `intensity = 9.0 × strength`, clamped to the
 *    §6.6 range [0, 4]. (Correction, promote run 38200176281: the first
 *    derivation omitted r185's 3.0 composite factor and under-mapped by 3×.)
 *  - `threshold`: three's luminosity high-pass is smoothstep(threshold,
 *    threshold + 0.01) on linear luma → Aura HDR edge `threshold` with the
 *    equivalent knee ratio `0.01 / threshold` (hard edge ≈ three's 1%-wide
 *    smoothstep), clamped to [0, 1].
 *  - `scatter` (halo width) is halo-energy-invariant; first-order map is
 *    `scatter = radius` (both normalized reach parameters) — the residual is
 *    flagged in the calibration log for the remote capture.
 *  - `clampLuminance` has no three analogue → §6.6 default 64. `mips = 5`
 *    keeps the normalization constant at three's fixed mip count (the tier
 *    mip sweep is a separate comparison, not this calibration).
 */
export interface BloomOptionsV2 {
  readonly threshold: number;
  readonly knee: number;
  readonly intensity: number;
  readonly scatter: number;
  readonly tint: readonly [number, number, number];
  readonly clampLuminance: number;
  readonly mips: number;
}

export const THREE_UNREAL_BLOOM_ENERGY = 9.0; // r185 composite 3.0 × Σ lerpBloomFactor (3.0) over 5 mips

export function mapThreeUnrealBloom(strength: number, radius: number, threshold: number): BloomOptionsV2 {
  if (!(strength >= 0) || !(radius >= 0) || !(threshold >= 0)) {
    throw new Error(`mapThreeUnrealBloom expects finite non-negative inputs, got (${strength}, ${radius}, ${threshold}).`);
  }
  return {
    threshold,
    knee: Math.min(1, 0.01 / Math.max(threshold, 0.01)),
    intensity: Math.min(4, strength * THREE_UNREAL_BLOOM_ENERGY),
    scatter: Math.min(1, radius),
    tint: [1, 1, 1],
    clampLuminance: 64,
    mips: 5
  };
}
