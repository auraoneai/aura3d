# bloomMapping calibration — mapThreeUnrealBloom (FROZEN)

PRD-03 §16.1 Phase 2. Calibrated once on `prd03-hdr-bloom`, frozen, reused in
`prd03-scene18-bloom` (holdout — never tuned against).

## Analytic derivation (the calibration)

Halo energy = additive luminance a uniform above-threshold region contributes.

- **three UnrealBloomPass**: 5 fixed mips, composite weights
  `lerpBloomFactor(f) = 0.6f + 0.24` for f ∈ {1.0, 0.8, 0.6, 0.4, 0.2}
  → {0.84, 0.72, 0.60, 0.48, 0.36}, Σ = **3.0**. Its separable Gaussian blurs
  are energy-preserving ⇒ uniform-E contribution `strength × 3.0 × E`.
- **Aura V2 (§6.6)**: `mips` tent mips summed, scaled `bloomNormalization =
  1/mips`, multiplied by `intensity` ⇒ uniform-E contribution `intensity × E`.
- Equality ⇒ **`intensity = 3.0 × strength`** (clamped to the v2 bound 4).
- **threshold**: three high-pass = smoothstep(threshold, threshold + 0.01) on
  linear luma ⇒ Aura `threshold = threshold` with `knee = 0.01/threshold`
  (1%-wide equivalent edge), clamped [0, 1].
- **scatter**: halo-energy-invariant (width, not energy); first-order
  `scatter = radius` — residual listed below.
- **clampLuminance 64** (no three analogue → §6.6 default); **mips 5**
  (three's fixed count — keeps normalization at the calibrated constant).
- **tint [1,1,1]** (three bloom is white-channel only).

## Status

- Constants frozen in
  `benchmarks/quality-rebuild/aura3d/scenes/prd03/bloomMapping.ts`.
- Adapters `prd03-hdr-bloom` / `prd03-scene18-bloom` consume it via a spec
  transform (harness `common.ts` is lane-12-owned; the residual route is
  Q-12-2).
- **Remote verification pending**: ±10% halo-energy check needs the GitLab
  capture lane (no local captures per lane rules). When the `prd03-hdr-bloom`
  DSF capture runs, compare aura-vs-three halo energy; the mapping is frozen
  either way — a mismatch files a qr-issue, not a re-tune.

## Residuals (documented, accepted)

1. `knee` cannot flow through `runAuraScene` (harness bloom block reads only
   strength/radius/threshold) → scenes take §6.6 default knee 0.25 instead of
   the calibrated 0.01-wide edge. Tracked by Q-12-2.
2. `scatter = radius` is first-order; three's per-mip sigma ramp has no exact
   tent equivalent.
3. `clampLuminance`/`mips` likewise ride defaults through the harness.
