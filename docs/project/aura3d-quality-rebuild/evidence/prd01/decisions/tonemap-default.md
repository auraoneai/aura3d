# Decision record — PRD-01 default tone-mapping operator (Q-12-1)

**Status:** filed — awaiting lane-12 G-PANEL review (A/B capture matrix
pending on the lane browser job). `DEFAULT_TONE_MAPPING` stays `"aces"`
until this record is closed with the panel outcome.

**Question (Q-12-1):** which operator does PRD-01 ship as
`DEFAULT_TONE_MAPPING` — `"aces"` or `"agx"`?

## What the A/B compares

| Side | Operator | Where |
| --- | --- | --- |
| A | `aces` (three.js r185 ACES fitted /0.6, `tonemapping_pars_fragment.glsl.js` verbatim minus the `toneMappingExposure` factor) | `OutputPass`, `TONE_MAP` define |
| B | `agx` (r185 AgX operator, same source rules) | `OutputPass`, `TONE_MAP` define |

- Exposure is upstream in both: `u_exposure = output.exposure ×
  prd03.exposure` (default 1; the lane-03 producer is Q-03-1).
- Both paths run through `a3dLinearToSRGB` + triangular dither
  (`a3dTriangularNoise(gl_FragCoord.xy)/255`) then the in-shader overlay.
- `neutral` rides the same mechanism but is not a default candidate; the
  exposure-ramp scene captures `aces|agx|neutral × 0.5|1|2` for context.

## How the A/B is produced

- `tests/qr/prd01/capture.mjs` — under every `core` flag set, every lane
  scene captures both operators on the aura3d engine (`aura3d.aces.png`,
  `aura3d.agx.png`); `prd01-tonemap-exposure-ramp` captures the full
  tm × exp matrix on aura3d and three.
- Aura adapter: `&tm=`/`&exp=` (or `?aura3d-tonemap=`/`?aura3d-exp=`) →
  `app.setOutput()` through the C-05 surface (in-shader under
  `A3D_QR_CORE_OUTPUT`, recorded intent otherwise).
- Game opt-in: `?a3d-qr=core` + `?aura3d-tonemap=aces|agx` — read in
  `lanes/prd01.ts` (`readAura3dTonemapQuery`), wins over
  `options.output.toneMapping`.
- Artifacts land under `artifacts/prd01/<flags>/<scene>/` for the
  lane-12 panel.

## Decision criteria (for the G-PANEL record)

- HDR→LDR fidelity vs the three r185 baseline on `regionSsim` /
  `deltaE2000` regions, especially mid-tone saturation and highlight
  roll-off on `prd01-tonemap-exposure-ramp`.
- No regression on the flag-off invariant (C-01) or the lane's
  diagnostic sections.
- Operator cost inside `OutputPass` is identical; no perf clause.

## Outstanding

- [ ] Lane browser job artifacts for the A/B matrix (capture runs on CI,
      not locally).
- [ ] G-PANEL verdict integrated here; then `DEFAULT_TONE_MAPPING` PR
      (custodian review) if the panel picks `"agx"`.
