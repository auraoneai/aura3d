# V4 External Evidence Execution Prompt

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use this prompt when handing the current repository to an agent or human operator that has access to real external tools that are not available in the local Codex environment: Unity, Unreal, Blender, and a durable public HTTPS deployment target.

This prompt is intentionally evidence-first. Do not create placeholder reports, copy template JSON into `tests/reports`, reuse Aura3D screenshots as Unity/Unreal screenshots, loosen thresholds, or mark parity complete without real external captures that pass the current validators.

## Prompt

You are working in the Aura3D repository. Your task is to close the remaining V4 external evidence blockers for the active parity objective without faking evidence.

Start by reading:

- `docs/project/v4-readme.md`
- `docs/project/v4-decision-gates.md`
- `docs/project/v4-remaining-code-to-write.md`
- `docs/project/v4-old-codebase-port-plan.md`
- `fixtures/external-engine-baselines/external-parity/RUNBOOK.md`
- `fixtures/external-engine-baselines/external-parity/external-baseline-command-plan.json`
- `tools/external-parity-completion-audit/index.ts`
- `tools/external-parity-broad-parity-readiness/index.ts`
- `tools/external-parity-unity-unreal-parity/index.ts`
- `tools/external-parity-production-readiness/index.ts`
- `tools/external-parity-external-evidence-readiness/index.ts`
- `tools/external-parity-pbr-gltf-readiness/index.ts`

Then run the current baseline verifier and external-evidence preflight. The preflight verifies the external baseline kit, enumerates the Unity and Unreal dry-run capture commands, and regenerates the external-evidence readiness checklist without treating dry-run output as external evidence:

```bash
pnpm verify:v4
pnpm preflight:v4-parity
```

`pnpm preflight:v4-parity` runs the local production-readiness preflight, the external-evidence preflight, the broad-parity audit, the completion audit, and the report-freshness gate. It is a status and readiness command, not proof that external evidence exists.

The external-evidence audit writes a machine-readable checklist and a human-readable runbook:

- JSON checklist: `tests/reports/external-parity-external-evidence-readiness.json` under `artifactChecklist`.
- Markdown runbook: `tests/reports/v4-external-evidence-missing-artifacts.md`.
- Completion runbook: `tests/reports/external-parity-completion-audit-runbook.md`.
- Local host preflight: `tests/reports/external-parity-external-evidence-readiness.json.localPreflight`.
- External host doctor: `tests/reports/external-parity-external-host-doctor.json`.

Use the external evidence runbook as the canonical capture/deployment todo list for this handoff. Every blocked item includes the target report path, expected screenshot path, expected runner-evidence sidecar path, scene descriptor, report-writer command, validation commands, and validator blocker text. Inspect `localPreflight` before attempting captures; it records whether `A3D_UNITY_EDITOR`, `A3D_UNREAL_EDITOR`, `A3D_RUN_UNITY_UNREAL_CLI_SMOKE`, and `A3D_PUBLIC_DEMO_URL` are usable on the current host and names the first missing local capability. Also run `pnpm doctor:v4-external-host`; its report mirrors the host preflight and includes `externalReadinessSummary`, `firstBlockedArtifact`, and `missingArtifactRunbookPath` so the external operator can see whether the host is ready and which evidence artifact is still first in line. Run `pnpm run:v4-external-host-evidence` before execute mode and inspect `tests/reports/external-parity-external-host-runner.json.commands[].expectedEvidencePaths` plus `validationCommands`; this is the dry-run execution manifest for the files each external command must create. Use the completion runbook as the top-level map from the original 13 requested criteria to gate reports, required fields, evidence paths, and blockers. If either runbook and this prompt disagree, regenerate with `pnpm audit:external-parity-external-evidence-readiness` and `pnpm audit:v4-completion`, then follow the regenerated artifact paths.

Record the current completion result from `tests/reports/external-parity-completion-audit.json` and the summary from `tests/reports/external-parity-completion-audit-runbook.md`. As of the last local run, V4 code verification passes, report freshness passes, and the completion audit remains blocked at 2 of 13 top-level criteria. The currently achieved criteria are `full-gltf-parity` and `full-webgpu-parity`. The remaining criteria are blocked by real external Unity/Unreal visual baselines, same-scene HDR/shadow/postprocess/PBR parity evidence, durable public deployment validation, production readiness, and broad Three.js/Babylon/Unity/Unreal replacement evidence.

## Success Criteria

The work is complete only when all of these are true:

- `pnpm verify:v4` exits with `failedCommands: []`.
- `pnpm verify:external-parity-report-freshness` reports `issues: 0`.
- `tests/reports/external-parity-completion-audit.json` reports every requested criterion achieved.
- `tests/reports/external-parity-broad-parity-readiness.json` reports `claimReady: true`.
- `tests/reports/external-parity-unity-unreal-parity.json` reports `unityParity: true`, `unrealParity: true`, and `replacement: true`.
- `tests/reports/external-parity-product-visual-parity.json` reports `visualParityReady: true` and `renderedProductVisualParity.unity === true` plus `renderedProductVisualParity.unreal === true`.
- `tests/reports/external-parity-production-readiness.json` reports `productionReady: true`.
- `tests/reports/external-parity-pbr-gltf-readiness.json` reports `pbrParity: true` and `gltfParity: true`.
- `tests/reports/external-parity-hdr-render-target-readiness.json` reports `hdrRenderTargetParity: true`.
- `tests/reports/external-parity-shadow-map-readiness.json` reports `shadowMapParity: true`.
- `tests/reports/external-parity-postprocess-suite.json` reports `postprocessSuiteParity: true`.
- `tests/reports/external-parity-external-evidence-readiness.json` reports `externalEvidenceReady: true`.
- `tests/reports/external-parity-external-evidence-readiness.json.artifactChecklist` has no entries where `ready === false`.
- `tests/reports/v4-external-evidence-missing-artifacts.md` reports `Blocked artifacts: 0`.
- `tests/reports/external-parity-completion-audit-runbook.md` reports `Achieved criteria: 13 / 13` and `Missing criteria: 0`.

If any criterion is not met, do not claim completion. Report the remaining blockers with exact artifact paths and validator messages.

## Unity And Unreal Baselines

You must produce real Unity and Unreal screenshots and reports for every baseline slot in:

- `fixtures/external-engine-baselines/external-parity/external-baseline-command-plan.json`

Required Unity reports:

- `tests/reports/v4-unity-product-visual-baseline.json`
- `tests/reports/v4-unity-pbr-visual-baseline.json`
- `tests/reports/v4-unity-shadow-visual-baseline.json`
- `tests/reports/v4-unity-hdr-render-target-baseline.json`
- `tests/reports/v4-unity-postprocess-suite-baseline.json`

Required Unreal reports:

- `tests/reports/v4-unreal-product-visual-baseline.json`
- `tests/reports/v4-unreal-pbr-visual-baseline.json`
- `tests/reports/v4-unreal-shadow-visual-baseline.json`
- `tests/reports/v4-unreal-hdr-render-target-baseline.json`
- `tests/reports/v4-unreal-postprocess-suite-baseline.json`

Use real editor binaries:

```bash
export A3D_UNITY_EDITOR=/absolute/path/to/Unity
export A3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd
export A3D_RUN_UNITY_UNREAL_CLI_SMOKE=true
```

Before launching editors, inspect the generated commands:

```bash
pnpm dry-run:v4-unity-baselines
pnpm dry-run:v4-unreal-baselines
```

For reproducible CI capture sessions, use `.github/workflows/external-parity-external-engine-baselines.yml`. The workflow is manual (`workflow_dispatch`) and expects self-hosted runners labeled `unity` and/or `unreal`. It regenerates the external baseline kit, runs the editor CLI smoke checks, invokes `fixtures/external-engine-baselines/external-parity/unity/run-unity-baseline-captures.mjs` and/or `fixtures/external-engine-baselines/external-parity/unreal/run-unreal-baseline-captures.mjs`, runs the parity/readiness audits in non-forcing mode, and uploads the generated screenshots, sidecars, JSON reports, and runbooks. Its `final-audits` job downloads the Unity/Unreal evidence artifacts that exist, restores them into the checkout, reruns the top-level readiness/parity/completion audits, and uploads a merged `v4-external-baseline-final-audits` artifact. This workflow is only evidence plumbing; it does not make Unity/Unreal parity true unless the real editor captures pass the existing validators.

If you download those workflow artifacts locally, merge them into a checkout with the generated ingester:

```bash
pnpm ingest:v4-external-baseline-artifacts \
  path/to/v4-unity-baseline-evidence \
  path/to/v4-unreal-baseline-evidence \
  path/to/v4-external-baseline-final-audits
```

Run it with `--dry-run` first. The ingester only restores files below `tests/reports/` and `fixtures/external-engine-baselines/external-parity/`, then reruns the external readiness, visual parity, Unity/Unreal parity, production, broad parity, completion, and freshness audits unless `--no-audit` is passed.

On macOS, `A3D_UNITY_EDITOR` may also point at a Unity `.app` bundle such as `/Applications/Unity/Hub/Editor/<version>/Unity.app`; the validators and CLI smoke helper resolve it to `Contents/MacOS/Unity`. `A3D_UNREAL_EDITOR` may similarly point at `UnrealEditor.app`, which resolves to `Contents/MacOS/UnrealEditor`. Standard Unity Hub and Epic Games install locations are also auto-discovered when the binaries are not on `PATH`.

If the editors are installed outside the default macOS locations, provide colon-separated search roots instead of hard-coding a binary path:

```bash
export A3D_UNITY_SEARCH_ROOTS="/Applications:/Users/Shared/Unity:/Volumes/Tools/Unity"
export A3D_UNREAL_SEARCH_ROOTS="/Applications:/Users/Shared/Epic Games:/Volumes/Tools/Epic Games"
```

The validators and CLI smoke helper scan those roots for Unity Hub editor folders, `Unity.app`, Epic Games engine folders, `UnrealEditor-Cmd`, and `UnrealEditor.app`.

Write durable editor CLI smoke reports before writing render/workflow baseline reports:

```bash
node fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json
node fixtures/external-engine-baselines/external-parity/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json
```

For each capture:

1. Use the matching descriptor from `fixtures/external-engine-baselines/external-parity/*.json`.
2. Render the same scene in the real external editor.
3. Save a PNG at the screenshot path listed in the command plan.
4. Confirm the editor runner wrote the matching `<screenshot-path>.evidence.json` sidecar.
5. Generate the report with:

```bash
node fixtures/external-engine-baselines/external-parity/write-baseline-report.mjs <unity|unreal> <baseline-kind> <screenshot-path> <target-report-path>
```

6. Run the relevant validator commands from the command plan.

For Unity, prefer the generated batchmode entry point instead of a hand-wired scene component:

```bash
"$A3D_UNITY_EDITOR" -batchmode -quit -projectPath /absolute/path/to/unity-project \
  -executeMethod V4ExternalVisualBaselineRunner.CaptureFromCommandLine \
  --descriptor fixtures/external-engine-baselines/external-parity/<descriptor>.json \
  --baseline-kind <baseline-kind> \
  --screenshot tests/reports/v4-<slot>/<unity-screenshot>.png
```

The manual Unity component path is still available, but the batchmode method is the preferred way to keep descriptor path, baseline kind, screenshot path, and sidecar evidence reproducible.

For Unreal, prefer the generated all-slot batch helper when `A3D_UNREAL_EDITOR` points at a real `UnrealEditor-Cmd` or `UnrealEditor` binary:

```bash
node fixtures/external-engine-baselines/external-parity/unreal/run-unreal-baseline-captures.mjs \
  --project /absolute/path/to/project.uproject
```

Use `node fixtures/external-engine-baselines/external-parity/unreal/run-unreal-baseline-captures.mjs --dry-run` first to inspect the exact `-ExecutePythonScript` commands without launching Unreal.

Before writing render/workflow baseline reports, verify every report/sidecar pair for the engine:

```bash
node fixtures/external-engine-baselines/external-parity/verify-baseline-reports.mjs --engine unity
node fixtures/external-engine-baselines/external-parity/verify-baseline-reports.mjs --engine unreal
```

The package-level equivalent for verifying all available external visual baseline reports is:

```bash
pnpm verify:v4-external-baseline-reports
```

After all five visual slot reports for an engine pass, write the render/workflow baseline report:

```bash
node fixtures/external-engine-baselines/external-parity/write-render-workflow-report.mjs unity tests/reports/v4-unity-baseline-render.json
node fixtures/external-engine-baselines/external-parity/write-render-workflow-report.mjs unreal tests/reports/v4-unreal-baseline-render.json
```

The package-level visual report writer for all engines is:

```bash
pnpm write:v4-external-baseline-reports
```

The render/workflow writer rejects missing or failing editor CLI smoke reports, missing visual slot reports, wrong engines, wrong baseline kinds, and reports that do not set `visualDiffAgainstAura3D: true`.

Do not edit validators to accept bad external screenshots. The reports must pass because the screenshots satisfy pixel richness, metrics, descriptor identity, and diff thresholds against the current Aura3D reference screenshots.

## Public Deployment Evidence

Production readiness remains blocked until a durable public HTTPS origin serves the static demo export and passes the public deployment smoke test.

Build/export local static demo artifacts first:

```bash
pnpm preflight:external-parity-production-readiness
```

This rebuilds the external demo export, runs the local static-server smoke gate, and refreshes the production-readiness audit. It does not satisfy production readiness by itself; the durable public HTTPS smoke below is still required.

Deploy the generated static artifact to a durable public HTTPS origin. Then run:

```bash
A3D_PUBLIC_DEMO_URL=https://demo.your-real-domain.com/ pnpm verify:public-demo-deployment
pnpm audit:external-parity-production-readiness
```

The URL must not be localhost, private IP space, reserved domains, placeholder hosts, or a temporary tunnel. The verifier must fetch every required public demo file, validate content markers, and match the static integrity manifest.

The production-readiness audit now revalidates the public deployment smoke report. A hand-written `ok: true` report is not enough. `tests/reports/public-demo-deployment-smoke.json` must include all of the following for the current static export:

- `deploymentUrl` set to a durable public HTTPS origin.
- `sourceManifestPath` matching `tests/reports/external-demo-static-export.json.integrityManifestPath`.
- `publicDeploymentManifestPath` matching `tests/reports/external-demo-static-export.json.publicDeploymentManifestPath`.
- `requiredDemos` containing `product-configurator`, `architecture-viewer`, `game-slice`, `racing-showcase`, and `large-world-streaming`.
- One `checks[]` entry for every file in `release-artifacts/external-demos/1.0.0/public-deployment-manifest.json`.
- For every check: exact public URL, HTTP `200`, byte count above the manifest minimum, `sha256` matching both the static integrity manifest and deployment manifest, `matchedStaticIntegrity: true`, `contentOk: true`, and content-marker evidence matching the deployment manifest.
- Empty `violations`.

After running the public smoke command, inspect:

```bash
jq '.deploymentRunbookPath, .deploymentExecutionPlan.filesToDeploy' tests/reports/public-demo-deployment-smoke.json
jq '.releaseAreas[] | select(.id=="deployment")' tests/reports/external-parity-production-readiness.json
jq '.areas[] | select(.id=="durable-public-demo-deployment")' tests/reports/external-parity-external-evidence-readiness.json
jq '.artifactChecklist[] | select(.areaId=="durable-public-demo-deployment" and .ready==false)' tests/reports/external-parity-external-evidence-readiness.json
```

The command also writes `tests/reports/public-demo-deployment-runbook.md`. Include that runbook in the handoff when deployment is still blocked; it lists every file to deploy, expected SHA-256, content marker, public path, and validator command.

If `v4-public-demo-deploy.yml` ran in GitHub Actions and you downloaded its `v4-public-demo-deployment-reports` artifact, restore the reports locally with:

```bash
pnpm ingest:public-demo-deployment-reports --dry-run path/to/v4-public-demo-deployment-reports
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
```

The ingester only restores the public deployment and downstream readiness/completion reports that the workflow uploads, then reruns the production, external-evidence, broad-parity, completion, and freshness audits unless `--no-audit` is passed.

Both must be ready before production readiness can pass.

## Blender Same-Corpus Coverage

`tests/reports/external-parity-pbr-gltf-readiness.json` currently reports `gltfParity: true` when same-corpus Blender-export coverage is present. If this regresses or if a future run reports not-run entries, do not claim full glTF parity from the three existing checked-in Blender fixtures alone.

To clear a future Blender same-corpus blocker, create or run a real Blender export round-trip for the same pinned glTF compatibility corpus used by the current glTF parity reports, then add a report that the readiness audit accepts as same-corpus coverage.

Expected behavior:

- Every same-corpus asset is exported or explicitly fails with a real Blender error.
- No `not-run` entries remain.
- Exported outputs are validated by the Aura3D glTF loader.
- Any visual/rendering claim is backed by browser screenshots, not metadata alone.

If Blender is not installed, stop and report this blocker. Do not fabricate exported assets.

## Final Validation Sequence

After all external captures, deployment smoke, and Blender coverage are present, run:

```bash
pnpm verify:external-parity-external-engine-baselines
pnpm audit:external-parity-external-evidence-readiness
pnpm audit:external-parity-product-visual-parity
pnpm audit:external-parity-pbr-visual-parity
pnpm audit:external-parity-pbr-reference-readiness
pnpm audit:external-parity-shadow-visual-parity
pnpm audit:external-parity-shadow-map-readiness
pnpm audit:external-parity-hdr-visual-parity
pnpm audit:external-parity-hdr-ibl-readiness
pnpm audit:external-parity-hdr-render-target-readiness
pnpm audit:external-parity-postprocess-suite
pnpm audit:external-parity-unity-unreal-parity
pnpm audit:external-parity-production-readiness
pnpm audit:external-parity-pbr-gltf-readiness
pnpm audit:external-parity-external-evidence-readiness
pnpm audit:v4-broad-parity
pnpm audit:v4-completion
pnpm verify:external-parity-report-freshness
pnpm verify:v4
```

If any command fails, fix the real underlying issue or leave the claim blocked. Do not weaken thresholds or delete blockers to force a pass.

## Final Report Requirements

Your final response must include:

- The exact Unity editor version and Unreal editor version used.
- The exact Blender version used.
- The public deployment URL tested.
- The list of created screenshot files and JSON reports.
- The final `tests/reports/v4-external-evidence-missing-artifacts.md` summary, including ready artifact count and blocked artifact count.
- The final `external-parity-completion-audit` achieved/total count.
- The exact commands run and their pass/fail status.
- Any remaining blockers, including paths and validator messages.

Only state that Three.js broad superiority, Babylon.js broad superiority, Unity parity, Unreal parity, Unity/Unreal replacement, production readiness, full PBR parity, full glTF parity, full WebGPU parity, production HDR/render-target parity, production shadow-map parity, full postprocess-suite parity, and rendered product visual parity are achieved if the final completion audit proves those exact criteria. The full WebGPU criterion is not satisfied by a bare `fullWebGPUParity: true` field; `tools/external-parity-completion-audit` and `tools/external-parity-broad-parity-readiness` require the real hardware/device/readback/PBR/shadow/HDR/compute evidence matrix and passing validations.
