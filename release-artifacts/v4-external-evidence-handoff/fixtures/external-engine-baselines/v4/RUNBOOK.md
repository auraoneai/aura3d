# V4 External Engine Baseline Runbook

This plan only makes Unity/Unreal baseline capture reproducible. Parity remains blocked until real Unity and Unreal editor runs produce screenshots and reports that pass the current Galileo diff gates.

## Prerequisites

- Set `G3D_UNITY_EDITOR` to a real Unity editor binary before running Unity CLI smoke checks.
- Set `G3D_UNREAL_EDITOR` to a real Unreal editor binary before running Unreal CLI smoke checks.
- If editor binaries are not in the default macOS locations, set `G3D_UNITY_SEARCH_ROOTS` to colon-separated roots that contain Unity Hub installs, version folders, or `Unity.app` bundles.
- If editor binaries are not in the default macOS locations, set `G3D_UNREAL_SEARCH_ROOTS` to colon-separated roots that contain Epic Games installs, engine version folders, `UnrealEditor-Cmd`, or `UnrealEditor.app`.
- Set `G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true` when you want the parity audit to verify the editor binaries.
- Generate current Galileo reference screenshots first with `pnpm verify:v4`.
- Run `pnpm audit:v4-external-evidence-readiness` and use `tests/reports/v4-external-evidence-missing-artifacts.md` as the authoritative missing-artifact checklist before and after every capture session.
- Cross-check `tests/reports/v4-external-evidence-readiness.json` under `artifactChecklist`; every Unity/Unreal item must have `ready: true` before any Unity/Unreal parity or replacement claim is allowed.
- For CI capture sessions, use `.github/workflows/v4-external-engine-baselines.yml` on self-hosted runners labeled `unity` and/or `unreal`; it runs the same batch helpers and uploads the resulting reports/screenshots without weakening parity gates.
- Write durable CLI smoke reports before render/workflow reports:
  - `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json`
  - `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json`

## Unity Slots

Runner: `fixtures/external-engine-baselines/v4/unity/V4ExternalVisualBaselineRunner.cs`
Batch capture helper: `fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs`

Generic render/workflow baseline template: `fixtures/external-engine-baselines/v4/unity/v4-unity-baseline-render.template.json`
Target report: `tests/reports/v4-unity-baseline-render.json`
CLI smoke report: `tests/reports/v4-unity-editor-cli-smoke.json`
Write report after Unity slot reports pass: `node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unity tests/reports/v4-unity-baseline-render.json`
Asset import workflow template: `fixtures/external-engine-baselines/v4/unity/v4-unity-asset-import-workflow.template.json`
Asset import workflow runner: `fixtures/external-engine-baselines/v4/unity/V4ExternalAssetImportWorkflowRunner.cs`
Asset import workflow evidence sidecar: `tests/reports/v4-unity-asset-import-workflow.evidence.json`
Write asset import workflow report after a real Unity import run: `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unity tests/reports/v4-unity-asset-import-workflow.evidence.json tests/reports/v4-unity-asset-import-workflow.json`
Generate all Unity visual slot captures and reports on a Unity-capable host: `node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/unity-project`
Preview those commands without Unity: `node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --dry-run`

### 1. Unity product-visual

- Descriptor: `fixtures/external-engine-baselines/v4/product-visual-parity-scene.json`
- Capture: Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json" --baseline-kind "product-visual" --screenshot "tests/reports/v4-product-visual/unity-product-visual-baseline.png". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.
- Expected screenshot: `tests/reports/v4-product-visual/unity-product-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-product-visual/unity-product-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":480,"nonBlankPixels":10001,"colorBuckets":2,"drawCalls":18,"materialCount":7,"productParts":18,"turntableHotspots":3,"captureViews":4,"batchTasks":4}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity product-visual tests/reports/v4-product-visual/unity-product-visual-baseline.png tests/reports/v4-unity-product-visual-baseline.json`
- Target report: `tests/reports/v4-unity-product-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-product-visual-parity`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 2. Unity pbr-visual

- Descriptor: `fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json`
- Capture: Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json" --baseline-kind "pbr-visual" --screenshot "tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.
- Expected screenshot: `tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":960,"height":540,"nonBlankPixels":30001,"colorBuckets":7,"drawCalls":12,"materialCount":11,"featureCount":11}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity pbr-visual tests/reports/v4-pbr-visual/unity-pbr-visual-baseline.png tests/reports/v4-unity-pbr-visual-baseline.json`
- Target report: `tests/reports/v4-unity-pbr-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-pbr-visual-parity`
  - `pnpm audit:v4-pbr-reference-readiness`
  - `pnpm audit:v4-pbr-gltf-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 3. Unity shadow-visual

- Descriptor: `fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json`
- Capture: Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json" --baseline-kind "shadow-visual" --screenshot "tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.
- Expected screenshot: `tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":480,"nonBlankPixels":60001,"colorBuckets":5,"drawCalls":5,"shadowEvidencePixels":701}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity shadow-visual tests/reports/v4-shadow-visual/unity-shadow-visual-baseline.png tests/reports/v4-unity-shadow-visual-baseline.json`
- Target report: `tests/reports/v4-unity-shadow-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-shadow-visual-parity`
  - `pnpm audit:v4-shadow-map-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 4. Unity hdr-render-target

- Descriptor: `fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json`
- Capture: Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json" --baseline-kind "hdr-render-target" --screenshot "tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.
- Expected screenshot: `tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":420,"nonBlankPixels":30001,"colorBuckets":5,"drawCalls":4,"toneMappedPatches":3}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity hdr-render-target tests/reports/v4-hdr-render-target/unity-hdr-render-target-baseline.png tests/reports/v4-unity-hdr-render-target-baseline.json`
- Target report: `tests/reports/v4-unity-hdr-render-target-baseline.json`
- Validate:
  - `pnpm audit:v4-hdr-visual-parity`
  - `pnpm audit:v4-hdr-render-target-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 5. Unity postprocess-suite

- Descriptor: `fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json`
- Capture: Run V4ExternalVisualBaselineRunner.cs in a real Unity editor, preferably in batchmode with -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine --descriptor "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json" --baseline-kind "postprocess-suite" --screenshot "tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png". The component path with SceneDescriptor/BaselineKind/ScreenshotPath is retained for manual editor capture.
- Expected screenshot: `tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png.evidence.json`
- Minimum evidence: `{"width":960,"height":540,"nonBlankPixels":30001,"colorBuckets":8,"drawCalls":4,"implementedEffects":14,"realSceneEffects":14}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unity postprocess-suite tests/reports/v4-postprocess-suite/unity-postprocess-suite-baseline.png tests/reports/v4-unity-postprocess-suite-baseline.json`
- Target report: `tests/reports/v4-unity-postprocess-suite-baseline.json`
- Validate:
  - `pnpm audit:v4-postprocess-suite`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`


## Unreal Slots

Runner: `fixtures/external-engine-baselines/v4/unreal/v4_external_visual_baseline_runner.py`
Batch capture helper: `fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs`

Generic render/workflow baseline template: `fixtures/external-engine-baselines/v4/unreal/v4-unreal-baseline-render.template.json`
Target report: `tests/reports/v4-unreal-baseline-render.json`
CLI smoke report: `tests/reports/v4-unreal-editor-cli-smoke.json`
Write report after Unreal slot reports pass: `node fixtures/external-engine-baselines/v4/write-render-workflow-report.mjs unreal tests/reports/v4-unreal-baseline-render.json`
Asset import workflow template: `fixtures/external-engine-baselines/v4/unreal/v4-unreal-asset-import-workflow.template.json`
Asset import workflow runner: `fixtures/external-engine-baselines/v4/unreal/v4_external_asset_import_workflow_runner.py`
Asset import workflow evidence sidecar: `tests/reports/v4-unreal-asset-import-workflow.evidence.json`
Write asset import workflow report after a real Unreal import run: `node fixtures/external-engine-baselines/v4/write-asset-import-workflow-report.mjs unreal tests/reports/v4-unreal-asset-import-workflow.evidence.json tests/reports/v4-unreal-asset-import-workflow.json`
Generate all Unreal visual slot captures and reports on an Unreal-capable host: `node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject`
Preview those commands without Unreal: `node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --dry-run`

### 1. Unreal product-visual

- Descriptor: `fixtures/external-engine-baselines/v4/product-visual-parity-scene.json`
- Capture: Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "fixtures/external-engine-baselines/v4/product-visual-parity-scene.json" and screenshot path "tests/reports/v4-product-visual/unreal-product-visual-baseline.png". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.
- Expected screenshot: `tests/reports/v4-product-visual/unreal-product-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-product-visual/unreal-product-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":480,"nonBlankPixels":10001,"colorBuckets":2,"drawCalls":18,"materialCount":7,"productParts":18,"turntableHotspots":3,"captureViews":4,"batchTasks":4}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal product-visual tests/reports/v4-product-visual/unreal-product-visual-baseline.png tests/reports/v4-unreal-product-visual-baseline.json`
- Target report: `tests/reports/v4-unreal-product-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-product-visual-parity`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 2. Unreal pbr-visual

- Descriptor: `fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json`
- Capture: Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "fixtures/external-engine-baselines/v4/pbr-visual-parity-scene.json" and screenshot path "tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.
- Expected screenshot: `tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":960,"height":540,"nonBlankPixels":30001,"colorBuckets":7,"drawCalls":12,"materialCount":11,"featureCount":11}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal pbr-visual tests/reports/v4-pbr-visual/unreal-pbr-visual-baseline.png tests/reports/v4-unreal-pbr-visual-baseline.json`
- Target report: `tests/reports/v4-unreal-pbr-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-pbr-visual-parity`
  - `pnpm audit:v4-pbr-reference-readiness`
  - `pnpm audit:v4-pbr-gltf-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 3. Unreal shadow-visual

- Descriptor: `fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json`
- Capture: Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "fixtures/external-engine-baselines/v4/shadow-visual-parity-scene.json" and screenshot path "tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.
- Expected screenshot: `tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":480,"nonBlankPixels":60001,"colorBuckets":5,"drawCalls":5,"shadowEvidencePixels":701}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal shadow-visual tests/reports/v4-shadow-visual/unreal-shadow-visual-baseline.png tests/reports/v4-unreal-shadow-visual-baseline.json`
- Target report: `tests/reports/v4-unreal-shadow-visual-baseline.json`
- Validate:
  - `pnpm audit:v4-shadow-visual-parity`
  - `pnpm audit:v4-shadow-map-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 4. Unreal hdr-render-target

- Descriptor: `fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json`
- Capture: Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "fixtures/external-engine-baselines/v4/hdr-render-target-visual-parity-scene.json" and screenshot path "tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.
- Expected screenshot: `tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png.evidence.json`
- Minimum evidence: `{"width":720,"height":420,"nonBlankPixels":30001,"colorBuckets":5,"drawCalls":4,"toneMappedPatches":3}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal hdr-render-target tests/reports/v4-hdr-render-target/unreal-hdr-render-target-baseline.png tests/reports/v4-unreal-hdr-render-target-baseline.json`
- Target report: `tests/reports/v4-unreal-hdr-render-target-baseline.json`
- Validate:
  - `pnpm audit:v4-hdr-visual-parity`
  - `pnpm audit:v4-hdr-render-target-readiness`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`

### 5. Unreal postprocess-suite

- Descriptor: `fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json`
- Capture: Run v4_external_visual_baseline_runner.py inside a real Unreal editor Python session with descriptor "fixtures/external-engine-baselines/v4/postprocess-suite-parity-scene.json" and screenshot path "tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png". The runner requests a high-res screenshot at the descriptor resolution when the Unreal Python API supports it; otherwise capture the viewport manually to that PNG.
- Expected screenshot: `tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png`
- Expected runner evidence sidecar: `tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png.evidence.json`
- Minimum evidence: `{"width":960,"height":540,"nonBlankPixels":30001,"colorBuckets":8,"drawCalls":4,"implementedEffects":14,"realSceneEffects":14}`
- Write report: `node fixtures/external-engine-baselines/v4/write-baseline-report.mjs unreal postprocess-suite tests/reports/v4-postprocess-suite/unreal-postprocess-suite-baseline.png tests/reports/v4-unreal-postprocess-suite-baseline.json`
- Target report: `tests/reports/v4-unreal-postprocess-suite-baseline.json`
- Validate:
  - `pnpm audit:v4-postprocess-suite`
  - `pnpm audit:v4-unity-unreal-parity`
  - `pnpm audit:v4-broad-parity`


## Final Validation

- `pnpm verify:v4-external-engine-baselines`
- `node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine all`
- `pnpm audit:v4-external-evidence-readiness`
- `pnpm audit:v4-product-visual-parity`
- `pnpm audit:v4-pbr-visual-parity`
- `pnpm audit:v4-pbr-reference-readiness`
- `pnpm audit:v4-pbr-gltf-readiness`
- `pnpm audit:v4-shadow-visual-parity`
- `pnpm audit:v4-shadow-map-readiness`
- `pnpm audit:v4-hdr-visual-parity`
- `pnpm audit:v4-hdr-ibl-readiness`
- `pnpm audit:v4-hdr-render-target-readiness`
- `pnpm audit:v4-postprocess-suite`
- `pnpm audit:v4-unity-unreal-parity`
- `pnpm audit:v4-production-readiness`
- `pnpm audit:v4-broad-parity`
- `pnpm audit:v4-completion`
- `pnpm verify:v4-report-freshness`
- `pnpm verify:v4`

After all screenshots for one or both engines exist, you can write every available baseline report with:

- `node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine unity`
- `node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine unreal`
- `node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --engine all`

Use `node fixtures/external-engine-baselines/v4/write-all-baseline-reports.mjs --dry-run` to list the exact per-slot report writer commands without writing reports.

Before running the final parity audits, validate all written report/sidecar pairs with:

- `node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unity`
- `node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine unreal`
- `node fixtures/external-engine-baselines/v4/verify-baseline-reports.mjs --engine all`

If the captures were produced by `.github/workflows/v4-external-engine-baselines.yml`, download the workflow artifacts and merge them into a checkout with:

- `node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits`

Use `--dry-run` first to list the report and screenshot files that would be restored. The ingester only accepts artifact contents under `tests/reports/` and `fixtures/external-engine-baselines/v4/`.

Do not copy template JSON files into `tests/reports` as evidence. The report writer must consume a real PNG and matching `.evidence.json` sidecar produced by the external editor run, compute the descriptor, screenshot, and runner-evidence SHA-256 values, reject dimension/pixel-evidence/slot-metric mismatches, and the parity audits must diff that PNG against the current Galileo reference screenshot.

The final handoff must include the summary from `tests/reports/v4-external-evidence-missing-artifacts.md`. Completion remains blocked until that generated runbook reports `Blocked artifacts: 0` and `pnpm audit:v4-completion` reports all top-level criteria achieved.
