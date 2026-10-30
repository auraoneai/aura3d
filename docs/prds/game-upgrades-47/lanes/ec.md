# Lane ec (E-C, WP-3 post) report

- Branch: `gu47/ec` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ec`)
- Base commit: `f797808be` (`gu47/integration` = main 4.6.1 + swarm plan)
- Wave: 1 (phase 1, code only; no browsers, no remote runs)
- Contract: PRD lines 179-200; checklist 397-407; owned files PRD §4.1 E-C row (line 319)

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EC-1 HDR grade writer | M | done | 42fa9a48d | `resolveHdrGradeUniforms` + `HDR_GRADE_GLSL` (`post/shaders/hdrGrade.glsl.ts`); folded into the S8 exposure draw when auto-exposure runs, else one S10 draw; identity grade adds no draw. `tests/unit/gu47/ec/hdr-grade-and-stage-trace.test.ts` (17 pass). Receipt `effects-white-balance` is phase 2. |
| EC-2 LUT + `--type lut` | M | done | 8cbd585d7 | `colorGrade({ lut })` takes `AuraLutAssetRef` (local stand-in for `AuraAssetRef<"lut">`) or a URL; `pipeline.lut` → `parseCubeLut` → `DisplayLutCache` (LRU) → `u_hasLut = 1` in S10b and the fused FXAA finalize. CLI `assets add <file.cube> --type lut` (`admission/cubeLut.ts`), help lists `lut` and E-A's `--hdri` line. `tests/unit/gu47/ec/lut.test.ts` (15 pass). |
| EC-3 AgX/neutral degrade removal | M | done (phase-2 capture confirms) | ea03b77fb | Own commit (default change; revert alone if the phase-2 capture does not show AgX). `presetCapabilityDegraded` kept, always false, `@deprecated`. The v2 OUT stage takes its operator from `pipeline.toneMapping` (`LegacyPost.createLegacyOutputPass`), so presets now render agx/neutral. `prd03-post-presets.test.ts` (14 pass). |
| EC-4 stage trace | M | done | 42fa9a48d | `recordPostStage` for S1, S4, CA, S6, S7, S8, S9, S10, S10b, S11, S12 in `v2Stages.ts` (same test file as EC-1). |
| EC-5 runtime post control | M | in progress | | |
| EC-6 S3 SSR | M | pending | | |
| EC-7 selective bloom | M | pending | | |
| EC-8 tilt-shift DOF, godRayDensity | M | pending | | |
| EC-9 tests, receipt specs, bundle delta | M | pending | | |

## Handoffs

(filled as the rows land)

## Verification

Base suites (before the first edit, `f797808be`):

- 54 post/render files (`tests/unit/contracts/impl/prd03-*`, `tests/unit/rendering/{native-bloom-pyramid,bloom-fusion-select,bloom-pass-fusion,e2-ssao-stage-trace,contact-shadow-mask}`, `tests/unit/agent-api/{e2-wave3-post-handoffs,prd02-builders}`, `tests/qr/prd01/unit/t0-07-post-skipped`, `tests/qr/prd15/compiler/optionCoverage`, `tests/unit/parity/{shader-pass-order,webgpu-custom-pass}`, `tests/unit/contracts/impl/prd10-{underwater-post,ready-attribution}`): 513 passed, 3 skipped, 0 failed.
- 5 CLI files (`tests/unit/aura3d-cli/{assets,asset-manifest-schema,release-gates-no-waiver,asset-provenance-license-coherence,deployment}`): 77 passed, 0 failed.
