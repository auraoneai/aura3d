# Legacy detector formulas (spec for T1.9)

Copied verbatim from the pre-rebuild visual matrix specs on 2026-10-06 so the
metrics port in `tools/quality-gate/metrics/metrics.py` can re-implement them
against real captures. These files are owned by lane 15 until Q-15-4 lands and
are kept (with every module they import) for that reason:

- `tests/browser/muse3jsparity-301-visual.spec.ts` (lines 25–44)
- `tests/browser/muse3jsparity-301-visual-cases.ts` (metric contracts, lines ~28–36)
- `tests/browser/game-visual-superiority.spec.ts` (same formulas, same thresholds)

`pixels` is a flat RGBA byte array (4 bytes per pixel, 0–255 per channel).

## clipping

Fraction of pixels whose R, G and B channels are all >= 250 (near-white clip):

```ts
function clipped(pixels: readonly number[]): number {
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4)
    if (pixels[i]! >= 250 && pixels[i + 1]! >= 250 && pixels[i + 2]! >= 250) count++;
  return count / (pixels.length / 4);
}
```

Contract (`muse3jsparity-301-visual-cases.ts`): `direction: "lower"`,
`maximum: 0.05`, `tieTolerance: 0.005`. Applied to the feature-**enabled**
capture of each engine. Caveat noted in the source spec: a soft-shoulder bloom
implementation can correctly resist white clipping, so a borderline value is a
review signal, not an automatic failure.

## replayInstability

Mean absolute per-channel delta between a repeated capture of the same
(family, engine, enabled=true) workload and its first capture, normalized to
`[0, 1]` over all RGB channels (alpha ignored):

```ts
function difference(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) throw new Error('Mismatched capture dimensions');
  let delta = 0;
  for (let i = 0; i < a.length; i += 4) for (let c = 0; c < 3; c++) delta += Math.abs(a[i + c]! - b[i + c]!);
  return delta / (a.length / 4 * 3 * 255);
}
```

Contract: `direction: "lower"`, `maximum: 0.001`, `tieTolerance: 0.0001`.
Captures must share `(width, height, settings)`; the repeat happens after all
four enabled/disabled captures of the family so any time-dependent nondeterminism
is included.

## T1.9 port notes

- Re-implement in `metrics.py` as `clipping(px) -> float` and
  `replay_instability(px_a, px_b) -> float`; keep the 250 clip threshold and the
  RGB-only normalization exactly so old and new numbers are comparable.
- Thresholds are advisory until the calibration phase (T2.x) re-derives them
  against real scene captures; do not hard-fail on them before then.
- These detectors are scene-agnostic pixel statistics — they stay legal. What
  was removed is the *claim surface* built on them (`superiorityTargetsMet`,
  parity verdicts), not the measurements.
