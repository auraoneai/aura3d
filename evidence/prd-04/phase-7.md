# PRD-04 — Phase 7 (integrated acceptance)

Session: https://app.devin.ai/sessions/48f1f948d56b4b8b9f2742c17f159bc4
Branch: `qr/prd04-materials-p6-wgsl` (stacked on PR #321)

## P7-1 — CONTRACTS Appendix B (done)

Appended F-04-01..F-04-06, all `proposed` (append-only edit, the §6.4
exception): override semantics, preset defaults, anisotropy table, procedural
kinds, `alphaMode`/`alphaToCoverage` semantics, `inspectMaterials()` shape. Each
row cites the spec that will verify it; rows flip to `verified` when the
flagged CI run's artifacts land.

## §16.1 standalone probes (new specs, macos-14 CI only)

| PRD row | Spec | Harness |
|---|---|---|
| S3 override | `model-material-override.spec.ts` — white SSIM ≥ 0.999; red Laplacian ≥ 90%, R/G rises, shadow ≤ 1.1×; `inspectMaterials` lists `baseColor` | `prd04-capture.html` `prd04-tinted-hero` + new `prd04-damaged-helmet` scene |
| S6 tiling shimmer | `texture-tiling.spec.ts` — far-third temporal luma σ ≤ 50% flag-off; aniso 16@High / 8@Medium; freq spike ≤ 3 | `?strip=1&quality=` |
| S7 procedural | `procedural-material-detail.spec.ts` — Laplacian ≥ 3× per preset at 1280×720 | new `prd04-procedural` driver |
| S9 budget | `texture-budget.spec.ts` — Medium ledger ≤ 256 MiB, dims ≤ 2048, no context loss | new `prd04-assets` driver |
| S16 perf | `scene-perf.spec.ts` — median frame ≤ 1.10× flag-off, 300 frames, `18-game-scene` + Gallery Shift interior GLB | new `prd04-perf` driver |

## §16.2 / §16.3 integrated probes (gated on `PRD04_FLAGS=all`)

`integrated-acceptance.spec.ts` — six probes under `all,materials.ktx2,materials.transmission`:
tinted-hero vs three.js (Laplacian ≥ 90%, shadow ≤ 1.1× three's own values),
normal-tangent mirrored halves ≤ 2 ΔE00, KTX2 uastc/etc1s within 2 ΔE00 of the
PNG GLB + inverted-colour-space control > 5 ΔE, alpha-to-coverage edge gradient
≥ 2 px, 24-point-light clearcoat GLB (`lightsDroppedByMaterial == 0`, dropping
`pt-19` changes pixels), transmission target active under the union flag set.

§17 ratios live inside `scene-perf.spec.ts`'s integrated block: `all` ≤ 1.10×
`all,-materials`, `all,transmission` ≤ 1.15× `all`.

## §15.4 controls

`evidence/prd-04/probes/*-control.json` — one design stub per probe; the specs
write real values to `tests/reports/prd04/probes/` (uploaded as the
`prd04-material-conformance` artifact) and the first flagged CI run's values
get mirrored here.

## P7-2 — G-PANEL attachment (deferred, not skipped)

IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31) are future-dated;
`PanelRoundRecord`s don't exist yet. The harness pieces the rounds consume are
landed (capture driver, metrics module, integrated spec). Outstanding: attach
§16.2/§16.3 results per round, then `integrated-accepted` → `default-on` after
two clean checkpoints.

## qr-requests added this phase

- `resolveQrFlags`/`applyList` cannot express `all,-materials` — the `all`
  token inside a comma list is skipped (`flagNameFor` has no `all` row), so
  §17 leave-one-out runs resolve wrong. Lane-04 shim:
  `benchmarks/quality-rebuild/scenes/prd04/flags.ts` expands mid-list `all`/
  `none`/`-x`/`x=v` into the object input. to:prd15.
- `PRD04_FLAGS=all` does not enable lane sub-flags (`materials.ktx2`,
  `materials.transmission`) — integrated runs must spell them out. Expected per
  C-27 flag registry, but §17 prose says `qr_flags=all`; flagging ambiguity.
  to:prd15.

## NOT RUN

- Every spec in this PR — macos-14 ANGLE Metal only (PRD §15 forbids local
  Playwright; llvmpipe GLSL evaluation only). First evidence arrives on the
  `flags=all` workflow-dispatch run.
- G-PANEL round attachment (P7-2) — rounds are future-dated.
