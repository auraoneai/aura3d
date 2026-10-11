# Lane 01 — IC-0 baseline ledger

Phase-0 exit (PRD-01 §15): IC-0 baselines for the 6 lane scenes + 18 base
scenes, lane capture green under `?a3d-qr=none` and `?a3d-qr=core`.

Captures are remote-only (no local Playwright; CONTRIB rules). The capture
runs are produced by `.github/workflows/qr-prd01-core.yml` (browser job, macos-14,
`node tests/qr/prd01/capture.mjs --flags none,core`) and by the program-wide
IC-0 run owned by PRD-12 (frozen baseline commit `33d02be3`, GitLab macOS
artifacts `gitlab-all-<pipelineId>` — see `../prd15/baselines/phase0.json`).

## Status: placeholder (P-56)

**This ledger is a placeholder. No IC-0 run has been recorded for lane 01.**
Nothing in this directory is evidence until the Runs table cites a remote run
id (GitHub Actions run or GitLab pipeline id) on a main commit. Row 01-IC0
(PRD-16) needs the Track 0 exit first (`core` must draw). It replaces the
placeholder row below with ≥ 48 images, metrics and the run id.

## Runs

| Run | Commit | Provider | Artifact | Status |
|---|---|---|---|---|
| lane capture (flags none+core) | placeholder (no run yet; 01-IC0) | GitHub macos-14 or GitLab macOS | `prd01-capture-<runId>-<attempt>` | placeholder |

## Scenes

Lane scenes (this PR adds specs + adapters): `prd01-scene-graph-hierarchy`,
`prd01-tonemap-exposure-ramp`, `prd01-blend-modes`, `prd01-specular-aa`,
`prd01-primitive-catalog`, `prd01-draw-throughput`.

Base 18: captured by the program IC-0 run (PRD-12 custodian artifact); lane 01
contributes its lane-scene frames from the same commit SHA.

## Metrics produced per scene (report.json)

- hierarchy/catalog/throughput: `maskIoU` (per declared mask region)
- tonemap ramp: `deltaE2000` mean/p95/max per swatch region, per operator×exposure variant
- blend modes: `meanAbsDiff` over the quad region
- specular AA: `temporalSigma` per engine + Aura/three ratio
- throughput: `drawCalls`, `loadMs` in the capture payload

Metric implementations live in `tests/qr/prd01/metrics/` and run in-page
through `window.__QR_TOOLS__`, so the same code path is exercised by unit
tests (`tests/qr/prd01/unit/metrics.test.ts`) and the capture.
