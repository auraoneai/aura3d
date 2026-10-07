# PRD-12 Phase 1 evidence — metrics, masks, strict capture (PR B)

Scope: T1.1–T1.9, T1.11 (partial), T1.13 (skeleton), T1.14, T1.15, T1.16, T1.17. Measures — does not move pixels.

## What this PR contains

| Task | Deliverable | Status |
|------|-------------|--------|
| T1.1 | `masks`/`brokenControls`/`primaryCriterion`/`primaryRegion` on all 18 base scenes — **derived** from spec content in `shared/scenes.ts` (`deriveMasks`, `deriveBrokenControls`, `CRITERIA` table), not hand-declared | DONE |
| T1.2 | `shared/registry.ts`: C-30 registration for base + lane scenes, `import.meta.glob` adapter discovery, quarantine-on-invalid (`REGISTRY`, `ACTIVE_SCENE_IDS`, `getRegisteredScene`) | DONE |
| T1.3 | `three/common.ts`: PCFShadowMap, `fetchOnce` asset dedupe, `RunOptions` (`variant`,`dpr`,`qrFlags`), ReadyPayloadV2 fields incl. real `ShadowReport` | DONE |
| T1.4 | `aura3d/common.ts`: `RendererDiagnosticsShape` (+`lighting.fallbackLightsActive`, `appliedLook`), payload V2 (`appliedExposure`, `lightUnits`, `qrFlags`, nulls stay null), `NotExpressibleVariantError` for unexpressible broken controls | DONE |
| T1.5 | `three/lib/mask.ts`: §8.1 mask passes — object-id (idColor r=(i*37)%251+1, g=i>>8), shadow-receiver (HalfFloat castShadow diff), metal (metalness shader ∩ object), silhouette-edge (r=2 gradient), separate non-AA linear renderer | DONE |
| T1.6 | `capture.mjs`: `--dprs`, `--variants`, `--calibrate` (4 repeats), `--strict` (non-READY / SwiftShader|llvmpipe / mask-misaligned → exit 1), `*.ready.json`, `three.*.mask.png`, `specSummary` | DONE |
| T1.7 | `tools/quality-gate/metrics/requirements.lock` (lpips 0.1.4, torch 2.14.1, numpy 2.5.3, scikit-image 0.26.0, Pillow 12.3.0, flip-evaluator 1.7, scipy 1.17.1) | DONE |
| T1.8 | `tools/quality-gate/metrics/metrics/metrics.py`: flip, ssim, msssim, lpips_alex, delta_e2000 + 11 canonical §6.5 detectors + `mask_alignment` (IoU ≥ 0.98) + `python -m metrics run` CLI → `aura3d-quality-gate-metrics/1.0`. Heavy deps lazy-imported; missing dep → `{"value": null, "status": "unavailable"}` — never fabricated | DONE |
| T1.9 | `test_metrics.py`: 13 unittest cases (identical/degraded/masked metrics, canonical-name + strict-JSON conformance, idColor decode round-trip, dark-bg alignment regression test) | DONE — 11 pass, 2 skipped (flip/lpips pins absent locally) |
| T1.11 | `tools/quality-gate/src/types.ts` (CapturedItem/CaptureRef/MetricId/EvidenceEnvironment) + `verdict.ts` `evaluateGates` + `G_REF_BAR_R3` (FLIP 0.10, ΔE2000 3, shadow ±15%, highlight ±20%) | DONE (golden.ts/calibrate.ts land next PR) |
| T1.13 | `tools/quality-rebuild-capture/games.prd12.json`: 18-game overlay skeleton, `titleDeterministic: null` until the 5×-repeat determinism run measures it | DONE (measurement NOT RUN — needs runner) |
| T1.14 | `packages/engine/src/lanes/prd12.ts`: registers C-31 `appliedLook` (assembled from renderer diagnostics + collected lights; null where source null; never throws on disposed app) and `frameTiming` (120-frame rAF sampler, armed on first collect; `gpuMs` null — no EXT_disjoint_timer path yet) | DONE |
| T1.15 | `tests/unit/contracts/impl/prd12-{registry,rubric,capture,diagnostics}.test.ts` | DONE — 25 tests pass |
| T1.16 | `benchmarks/quality-rebuild/sentinels.json`: six-scene canary set (01, 03, 08, 12, 13, 16), `deltaE2000P99: null` until IC-0 measures it | DONE |
| T1.17 | `.github/workflows/quality-checkpoint.yml` (Thu 00:00 UTC + dispatch; calls capture workflow with qr_flags none/all + G-PANEL leave-one-out + crash re-run; metrics collect; bot PR round record; `qr-ic-regression` issues) + `workflow_call`/`artifact_suffix` on `quality-rebuild-capture.yml` | DONE — needs a live run to dry-run IC-0 (due 2026-10-08) |

## Bugs found and fixed during write

- `metrics.py` `object:N` regions + alignment: `load_mask` converted masks to grayscale, destroying the idColor encoding (idColor(0) has r=1 → L≈0 → the subject vanished). Masks now load RGB; ids decode exactly (`i = 256·g + (((r−1)·95 − 5·g) mod 251)`).
- `mask_alignment` segmented "subject" as anything differing >6 levels from spec background — a `#0d0d0d` scene rendered near-black marked the whole frame (IoU 0.25). Now keys on the *observed* corner-patch median; non-flat backgrounds report `applicable: false`.
- Detector keys split (`highlightEnergyP99`, `roughnessMonotonicity`, …) replaced with the §6.5 canonical eleven; inapplicable detectors emit `null`, never `NaN` (JSON-safe).
- `ms-ssim` weight formula corrected to `∏ cs_i^w_i · ssim_M^w_M` with renormalized weights on short images.

## Verification actually run

- `pnpm vitest run tests/unit/contracts/impl/` → **25/25 pass** (registry, rubric/evaluateGates, capture surface, diagnostics).
- `python3 tools/quality-gate/metrics/test_metrics.py` → **11 pass, 2 skipped** (flip/lpips pins not installed locally; CI installs requirements.lock).
- `python3 -m metrics run` on synthetic 64×64 frames → metrics emitted per region (`object:0` correctly isolates the edited square: ΔE2000 4.84 vs 1.21 frame mean), detectors populated, `alignment.iou = 1.0`, output is strict-JSON.
- `node --check` on `capture.mjs`, `collect-checkpoint.mjs`, `file-regressions.mjs`; `pnpm exec tsc -p benchmarks/quality-rebuild/tsconfig.typecheck.json` → 0 errors on the scoped set (`shared/`, `scenes/`, `three/`, `main.ts`, `tools/quality-gate/src`).
- YAML parse of both workflows OK.

## NOT RUN

- Real captures (`--dprs/--variants/--calibrate/--strict` against a built site) — no local Playwright/captures per lane rules; first execution is the IC-0 dry-run on the macos-14 runner.
- `python -m metrics` with flip/lpips — pins install in CI only.
- `games.prd12.json` `titleDeterministic` measurement — requires the 5×-repeat runner job (T1.13 run).
- `evaluateGates` on real captures — goldens don't exist until a calibrated round lands.
- Engine bundle gzip delta for `lanes/prd12.ts` — `tools/bundle-size` on the PR measures it (§17.2 budget ≤1 KB).

## qr-request filings needed

- `benchmarks/external-parity/shared/threejs-visual-parity-scenes.ts` still carries `a3dSetupLines`/`threeSetupLines` (§7.6 delete) — spec consumer `tests/browser/external-parity-threejs-visual-parity.spec.ts` is owner-15; issue to be filed to prd15 rather than edited across lanes.
