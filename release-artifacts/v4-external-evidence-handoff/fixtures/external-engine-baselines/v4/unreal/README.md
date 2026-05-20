# Unreal External Visual Baselines

This directory contains Unreal baseline scaffolds for the Galileo3D V4 external visual parity slots:

- product visual: `product-visual-parity-scene.json` -> `tests/reports/v4-unreal-product-visual-baseline.json`
- PBR visual: `pbr-visual-parity-scene.json` -> `tests/reports/v4-unreal-pbr-visual-baseline.json`
- shadow visual: `shadow-visual-parity-scene.json` -> `tests/reports/v4-unreal-shadow-visual-baseline.json`
- HDR render target: `hdr-render-target-visual-parity-scene.json` -> `tests/reports/v4-unreal-hdr-render-target-baseline.json`
- postprocess suite: `postprocess-suite-parity-scene.json` -> `tests/reports/v4-unreal-postprocess-suite-baseline.json`

Use `../RUNBOOK.md` for the exact per-slot commands and validation sequence generated from the current descriptors.

1. Open a real Unreal project with Python editor scripting enabled.
2. Run `v4_external_visual_baseline_runner.py <descriptor-path> <screenshot-path>` for any visual slot. `product_visual_parity_baseline.py` is retained only as the explicit product-scene scaffold.
3. For the full Unreal set, run `node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject`; use `--dry-run` first to inspect the exact commands.
4. Capture the screenshot path named by the matching template.
5. Confirm the Unreal runner wrote `<screenshot-path>.evidence.json` next to the screenshot.
6. Run `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal <baseline-kind> <screenshot-path> <target-report-path>`. The writer computes descriptor, screenshot, and runner-evidence SHA-256 values, validates descriptor dimensions, pixel evidence, and runner slot metrics, then writes the JSON report consumed by the V4 parity gates.
7. Run `pnpm audit:v4-unity-unreal-parity` and the relevant parity audit. The report is still rejected if the captured screenshot does not pass the current Galileo diff thresholds.
8. For asset-import workflow evidence, run `v4_external_asset_import_workflow_runner.py <path-to-gltf-or-glb> <repo>/tests/reports/v4-unreal-asset-import-workflow.evidence.json`, then run `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/v4-unreal-asset-import-workflow.evidence.json tests/reports/v4-unreal-asset-import-workflow.json`.

Templates are not parity evidence until a real Unreal editor run produces screenshots and metrics.
