# Unity External Visual Baselines

This directory contains Unity baseline scaffolds for the Galileo3D V4 external visual parity slots:

- product visual: `product-visual-parity-scene.json` -> `tests/reports/v4-unity-product-visual-baseline.json`
- PBR visual: `pbr-visual-parity-scene.json` -> `tests/reports/v4-unity-pbr-visual-baseline.json`
- shadow visual: `shadow-visual-parity-scene.json` -> `tests/reports/v4-unity-shadow-visual-baseline.json`
- HDR render target: `hdr-render-target-visual-parity-scene.json` -> `tests/reports/v4-unity-hdr-render-target-baseline.json`
- postprocess suite: `postprocess-suite-parity-scene.json` -> `tests/reports/v4-unity-postprocess-suite-baseline.json`

Use `../RUNBOOK.md` for the exact per-slot commands and validation sequence generated from the current descriptors.

1. Create or open a Unity project.
2. Add the relevant `*-scene.json` descriptor as a TextAsset.
3. Add `V4ExternalVisualBaselineRunner.cs` for any visual slot and `V4ExternalAssetImportWorkflowRunner.cs` for asset-import workflow evidence. `ProductVisualParityBaseline.cs` is retained only as the explicit product-scene scaffold.
4. Preferred automation: run Unity in batchmode with `-executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor <descriptor-path> --baseline-kind <baseline-kind> --screenshot <screenshot-path>`.
5. For the full Unity set, run `node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/unity-project`; use `--dry-run` first to inspect the exact commands.
6. Manual fallback: run the component in a real Unity editor with `SceneDescriptor`, `BaselineKind`, and `ScreenshotPath` assigned from the template.
7. Confirm the Unity runner wrote `<screenshot-path>.evidence.json` next to the screenshot.
8. Run `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity <baseline-kind> <screenshot-path> <target-report-path>`. The writer computes descriptor, screenshot, and runner-evidence SHA-256 values, validates descriptor dimensions, pixel evidence, and runner slot metrics, then writes the JSON report consumed by the V4 parity gates.
9. Run `pnpm audit:v4-unity-unreal-parity` and the relevant parity audit. The report is still rejected if the captured screenshot does not pass the current Galileo diff thresholds.
10. For asset-import workflow evidence, run `V4ExternalAssetImportWorkflowRunner.CaptureFromCommandLine --asset <path-to-gltf-or-glb> --evidence <repo>/tests/reports/v4-unity-asset-import-workflow.evidence.json`, then run `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json`.

Templates are not parity evidence until a real Unity editor run produces screenshots and metrics.
