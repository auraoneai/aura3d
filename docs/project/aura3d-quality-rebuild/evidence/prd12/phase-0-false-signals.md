# PRD-12 Phase 0 — false-signals removal (PR A)

Branch `qr/prd12-false-signals`, opened 2026-10-06. Implements T0.1–T0.15.

## Deleted (T0.1–T0.6)

- `benchmarks/three-compat/{aura3d,threejs}/`, `benchmarks/production-runtime/` — `shared/scenes.ts` kept (kept specs import it).
- `tools/three-compat-threejs-{visual,runtime}-parity/` — hard-coded `visualScore >= 0.85` against `THREE_COMPAT_COMPARISON_SCENES` constants.
- `tools/production-runtime-threejs-parity/`, `tools/external-parity-{roadmap-visual-quality,unity-unreal-parity}/`, `tools/threejs-parity-{threejs-inventory,same-scene-render}/`, `docs/project/parity/threejs/parity-matrix.md`, `.github/workflows/external-parity-external-engine-baselines.yml`, all 11 `tools/superiority-*` (incl. `superiority-common`).

## Edited

- `tools/compare-engines/index.ts` — removed the box-grid visual-render machinery (`buildBenchmarkVisualBundles`, `captureBenchmarkVisualRenders`, `benchmarkVisualSharedHelpers`, `aura3d/three/babylonBenchmarkVisualBundleSource`, `createScreenshotDiff(s)`, `browserScreenshotDiffScript`, `pngDataUrl`/`writePngDataUrl`), the `maxChangedPixelRatio: 1` thresholds, the `visualRenders`/`screenshotDiffs`/`benchmarkVisualRenders` output keys, the `productVisualParity`/`gltfLoaderVisualParity` sections (SSIM-proxy evidence), `screenshotDiff` per-scene outcome and `screenshotDiffFor`. `benchmark-screenshot-diffs` and parity dimensions in `broadSuperiorityEvidenceMatrix` remain as honestly-blocked entries. Bundle-size comparisons untouched.
- `tools/three-compat-{broad-replacement-readiness,completion-audit,release-readiness}/index.ts` — removed visual-parity report reads, the `same-scene-comparisons` check + `minimumSameSceneComparisons` threshold, parity-matrix doc requirement, and parity-sourced screenshots.
- `tools/threejs-parity-*-parity/index.ts` (16 tools) — `structuralSimilarityProxy` field/emissions/labels removed; `meanDelta`/`maxDelta`/`changedPixels` remain, ungated (per §10 mapping: real `ssim`/`flip` land with `metrics.py`).
- `tools/muse3jsparity-readiness/acceptance.ts` — `superiorityTargetsMet` field + gate removed (`superiorityClaims` replay comparison kept — it is measured).
- `tools/head-to-head-*/index.ts` (19 tools incl. `current-aggregate`) — `verdict:` prose replaced with `GateVerdict` (`pass`/`capture-failed`); `observedLosses` string lists deleted; aggregate `losses` now reads `verdict === "reference-gap"` entries.
- `tools/production-runtime-report-bridge/shared.ts` — `writeThreeJsParityReports` deleted (no callers).
- `tools/showcase-library/game-visual-qa.mjs` — flat-region status-quo calibration + `flatBudget` thresholds + per-viewport fail blockers removed; check is `report-only` pending T2.8 re-derived thresholds.
- `tools/threejs-parity-runtime-import-audit/index.ts` — `apps/threejs-parity-lab/` removed from `allowed` (app liveness-only pending Q-15-3).
- `docs/project/threejs-superiority-status.md` — "Historical frozen result" marked **withdrawn**; the "54 selected example-level rows" claim removed; only quality-gate regenerated results citable.
- `AURA3D-VERIFICATION-MATRIX.md` — all "Visual QA" relabeled "Liveness"; §Mac GPU section rewritten as liveness; quality-floor notes relocated to `benchmarks/quality-rebuild/history/rounds/round-0.json` (new).

## New files

- `tools/quality-gate/package.json` (T0.15) — `quality:*` scripts per §10.3, private, exact-pinned devDeps.
- `tools/quality-gate/root-manifest-pending.json` (T0.2) — 54 entries under Q-15-1 (issue #39).
- `tools/quality-gate/metrics/legacy_detectors.md` (T0.7) — `clipping`/`replayInstability` formulas copied from the kept specs for T1.9.
- `tests/unit/quality-gate/{scripts,no-verdict-literals,compare-engines-no-visual}.test.ts` (T0.8/T0.12/T0.13) — creator-rule ownership; all 7 tests pass locally.

## Phase-0 `rg` exit

`rg "THREE_COMPAT_COMPARISON_SCENES|structuralSimilarityProxy|superiorityTargetsMet|visualScore >=|maxChangedPixelRatio: 1"` over lane-12-owned paths — remaining hits:

- `benchmarks/three-compat/shared/scenes.ts` — kept: imported by the kept owner-15 specs (T0.7 fallback until Q-15-4, #42).
- `tools/quality-gate/metrics/legacy_detectors.md` — this lane's own doc recording the removed claim names.
- Kept owner-15 spec files (allowed by name, pending Q-15-4): `tests/browser/{muse3jsparity-301-visual,game-visual-superiority,three-compat-threejs-{visual,runtime}-parity,external-parity-threejs-visual-parity,production-runtime-threejs-parity{,.ts},current-routes-threejs-parity,runtime-parity-*,threejs-parity-*-parity}.spec.ts/.ts`, `tests/unit/tools/muse3jsparity-acceptance.test.ts`, and every module they import.
- `docs/project/aura3d-quality-rebuild/**` — the PRD/research corpus itself.

Non-owned hits covered by filed issues: `tools/{production-runtime-threejs-parity-readiness,webgpu-visual-parity,current-routes-threejs-parity,renderer-{animation,lighting-environment-color,pbr-gltf-correctness,postprocessing}}/` → Q-15-6 (#44); `tests/browser/current-routes-route-health.spec.ts` label → Q-15-5 (#43).

## Issues filed (T0.14)

CCR-12-1 #38 · Q-15-1..7 #39–45 · Q-14-1/2 #46–47 · Q-13-1..3 #48–50 · Q-05-1/2 #51–52 · Q-11-1 #53 · Q-09-1 #54 — labels `qr-request` + `to:prdNN` (created where missing).

## NOT RUN

- `pnpm test:unit` full suite — not run (scoped vitest on the 3 new test files instead; 7/7 pass).
- `pnpm lint` / `pnpm typecheck:raw` repo-wide — not run (per-file `tsc --noEmit` on every touched `.ts` instead; clean). Will run on CI (`qr-contracts.yml`).
- Playwright/browser captures — never run locally per lane-12 prompt.
- compare-engines `--write-reports` — not run (needs Playwright + generated input reports; the no-visual test runs the default report which emits no `visual`/`screenshotDiffs`/`benchmarkVisualRenders` keys).
