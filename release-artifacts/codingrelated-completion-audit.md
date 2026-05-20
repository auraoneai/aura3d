# Codingrelated Completion Audit

Generated from the current local checkout after `docs/project/v4-parity-execution-prompt.md` was saved, local V4 readiness reports were refreshed, the Unity/Unreal parity audit was corrected to read current bounded renderer parity evidence, the product/PBR/shadow/HDR visual parity reports were hardened to publish their real render/diff screenshots as top-level evidence paths, and the external handoff package was expanded to carry those local evidence artifacts.

This file is an audit artifact only. It does not claim parity completion.

Latest handoff update:

- `docs/project/v4-parity-execution-prompt.md` now starts with a current audit snapshot, operator strategy, and a real tangible-outcomes table for every goal, so the next agent does not have to infer which work is coding-actionable and which work is external evidence.
- `docs/project/v4-parity-execution-prompt.md` now separates local renderer/product implementation readiness from full parity certification for PBR, HDR/render targets, shadow maps, postprocess, and product visual parity. The prompt explicitly says that green local reports with false parity fields should route work to external baseline generation/ingest instead of more random local feature churn.
- `pnpm preflight:v4-parity` was rerun after the prompt and handoff refresh. It rebuilt the static external demos, reran static-server smoke, refreshed readiness reports, regenerated the external handoff package, and verified the package archive/sidecar.
- Latest completion audit source of truth: `tests/reports/v4-completion-audit.json`; the latest local preflight still reports `achievedCriteria=2` and `totalCriteria=13`.
- Latest external evidence readiness source of truth: `tests/reports/v4-external-evidence-readiness.json`; the latest local preflight still reports `externalEvidenceReady=false`, `readyAreas=4`, `blockedAreas=7`, `readyArtifacts=2`, `blockedArtifacts=30`, `firstBlockedArea=github-remote-external-readiness`, and `firstBlockedArtifact=unity:editor-cli-smoke`.
- Latest report freshness source of truth: `tests/reports/v4-report-freshness.json`; the latest verification run reports `ok=true` and `issues=[]`.
- `docs/project/v4-parity-execution-prompt.md` now includes a per-goal tangible outcome ledger for all 13 criteria and treats `tests/reports/v4-completion-audit.json` as the source of truth for the latest `generatedAt` timestamp to avoid report-freshness churn.
- `docs/project/v4-parity-execution-prompt.md` now includes the full external-gate commit list, including `fixtures/external-engine-baselines/v4`, external host tools, public-demo tooling, package/provenance tooling, both workflow/handoff patch artifacts, the transfer manifest, and the expanded handoff directory.
- `tests/unit/tools/v4-validation.test.ts` restores the intentionally corrupted packaged baseline runbook before later handoff integrity assertions, so the test verifies corruption handling without leaving the fixture package dirty.
- `release-artifacts/v4-current-handoff-supplement.patch` was regenerated from the current handoff set and applies cleanly to a clean archive of current `HEAD`. The older `release-artifacts/v4-parity-external-evidence-workflows.patch` is only for target branches that do not already contain `84bc815`; it correctly fails on current `HEAD` because the workflow files already exist. A two-patch simulation against `HEAD^` also passes: workflow patch first, then current supplement patch.
- `tools/v4-external-evidence-handoff/index.ts` now verifies that the packaged PR body, completion audit, and supplement patch contain the current standalone-operator, current supplement, and two-patch-route markers; `tests/unit/tools/v4-validation.test.ts` covers those markers, and the full file passes with `44` tests after the hardening.
- `.github/workflows/v4-public-demo-deploy.yml` now uploads `tests/reports/public-demo-deployment-runbook.md` with the public deployment report artifact, and `tools/v4-production-readiness/index.ts` requires that upload marker before treating the workflow as valid.
- `examples/portfolio/main.ts` now exposes a `Local Renderer Proofs` section that links directly to product visual, PBR, HDR render-target, shadow-map, postprocess-suite, glTF, and WebGPU proof pages; browser tests assert the five `local-ready` cards and the two achieved guardrails.
- The external handoff package now includes `examples/portfolio`, `tests/browser/example-portfolio.spec.ts`, `tests/browser/example-screenshot-audit-v4.spec.ts`, and `tools/v4-examples`, so the local proof surface is transferred with the parity handoff instead of living only in the working tree.
- `release-artifacts/v4-external-evidence-handoff.tar.gz` verifies against `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`; use the sidecar file as the source of truth for the current archive hash. After the latest external-readiness refresh, the packaged `docs/project/v4-parity-execution-prompt.md` and packaged completion audit are byte-identical to the local files.
- The package README and operator runbook now state that patch-only transfers must copy the patch files into `release-artifacts/` before applying them. This makes the supplement patch boundary explicit: applying it from a temporary path updates checkout content, but `RESTORE_INTO_CHECKOUT.mjs` is the route that materializes the packaged patch artifacts exactly inside a checkout.
- `node release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs --dry-run /Users/gurbakshchahal/G3D` reports `restorePreflight.ok=true` and `verificationScope.packageInternalEntries=true`; this is package integrity evidence only, not external parity evidence.
- `pnpm doctor:v4-external-host` reports `handoffPackageReady=true`, `externalHostReady=false`, `firstMissingCapability=unity-editor-executable`, and `firstBlockedArtifact=unity:editor-cli-smoke`.
- `tools/v4-external-evidence-readiness/index.ts` now emits the correct three-artifact Unity/Unreal ingest commands: Unity baseline evidence, Unreal baseline evidence, and final external baseline audits must be ingested together.
- `tests/unit/tools/v4-validation.test.ts` now rejects the old incomplete Unity-only or Unreal-only ingest command forms and requires the corrected three-artifact dry-run and ingest commands in the generated missing-artifacts runbook.
- `release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs --dry-run /Users/gurbakshchahal/G3D` now lists every tool directory named by `docs/project/v4-parity-execution-prompt.md`, including external engine baselines, report freshness, product/PBR/shadow/HDR/postprocess visual parity tools, Unity/Unreal parity tooling, static demo smoke, package provenance, and compare-engines.
- `tools/v4-product-visual-parity/productScene.ts` now records the shared product visual asset pipeline used by Galileo3D, Three.js, Babylon.js, and future Unity/Unreal baseline renders; `tests/reports/v4-product-visual-parity.json` verifies the generated external descriptor SHA-256 matches the runtime descriptor and no longer carries the local `product-like scene` violation.
- `packages/assets/src/OBJLoader.ts` now provides bounded native OBJ geometry import by parsing OBJ vertices, UVs, normals/faces, triangulating polygons, generating missing normals, and routing the result through the current glTF render-resource path.
- `tests/reports/v4-unity-unreal-parity.json` now reports asset import supported formats as `glb`, `gltf`, and `obj`; conversion-required formats are now `dae`, `fbx`, `usd`, and `usdz`, with Unity/Unreal/DCC parity still blocked until real external editor workflow evidence exists.
- `fixtures/external-engine-baselines/v4` and `release-artifacts/v4-external-evidence-handoff` now carry the updated asset-import boundary, including `nativeSupportedFormats: ["glb", "gltf", "obj"]` and the bounded OBJ loader/test files needed by external operators.
- `pnpm preflight:v4-production-readiness` was rerun after the asset package changes, regenerating `release-artifacts/external-demos/0.1.0-alpha.0` and clearing the local stale static-export blockers; production readiness remains blocked only on durable public HTTPS deployment evidence.

Latest prompt check:

- `docs/project/v4-parity-execution-prompt.md` contains 13 explicit goal sections.
- `docs/project/v4-parity-execution-prompt.md` contains the `Per-Goal Tangible Outcome Ledger`.
- `docs/project/v4-parity-execution-prompt.md` contains the `Local Readiness Versus Full Parity Certification` section.
- `Goal 12: Full glTF Parity` and `Goal 13: Full WebGPU Parity` are present as achieved-but-must-not-regress coding guardrails.
- `git diff --check -- docs/project/v4-parity-execution-prompt.md` passes.
- Every `pnpm <script>` command named in `docs/project/v4-parity-execution-prompt.md` exists in `package.json`.
- Every `pnpm <script>` command named in the operator runbook, PR body, completion audit, generated handoff runbook, and package `START_HERE.md` exists in `package.json`.

## Objective

Complete every task listed in `docs/project/v4-parity-execution-prompt.md` in full.

Concrete completion means all 13 V4 parity criteria in `tests/reports/v4-completion-audit.json` are achieved, with fresh reports, passing preflight, and real external evidence where the verifiers require it.

## Current Result

Latest completion audit source of truth: `tests/reports/v4-completion-audit.json`.

`pnpm exec tsx --tsconfig tsconfig.base.json tools/v4-parity-status/index.ts`

- `ok`: false
- `achievedCriteria`: 2
- `totalCriteria`: 13
- Achieved:
  - `full-gltf-parity`
  - `full-webgpu-parity`
- Missing:
  - `threejs-broad-superiority`
  - `babylonjs-broad-superiority`
  - `unity-parity`
  - `unreal-parity`
  - `unity-unreal-replacement`
  - `production-readiness`
  - `full-pbr-parity`
  - `production-hdr-render-target-parity`
  - `production-shadow-map-parity`
  - `full-postprocess-suite-parity`
  - `rendered-product-visual-parity`

First blocked external artifact:

- First blocked external area: `github-remote-external-readiness`
- `unity:editor-cli-smoke`
- Target report: `tests/reports/v4-unity-editor-cli-smoke.json`
- Required command: `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json`
- Missing capability: `unity-editor-executable`

## Local Preflight State

`pnpm preflight:v4-parity` passes locally.

The passing local preflight covers:

- static external demo build
- static server smoke
- external evidence kit validation
- Unity baseline dry-run command inventory
- Unreal baseline dry-run command inventory
- external host runner non-execute readiness report
- readiness report refresh
- V4 report freshness
- external evidence handoff package generation
- external evidence handoff package verification

Important result:

- `pnpm verify:v4-report-freshness`: `ok: true`, `issues: 0`
- `pnpm verify:v4-external-evidence-handoff`: `ok: true`, `checkedFiles: 159`, `violations: []`
- Repo-side handoff verification scope: `packageInternalEntries=true`, `archiveAndSidecar=true`, `externalParityEvidence=false`
- Current handoff archive: `release-artifacts/v4-external-evidence-handoff.tar.gz`
- Current handoff archive checksum source of truth: `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`
- Current handoff transfer metadata source of truth: `release-artifacts/v4-external-evidence-handoff.transfer.json`
- The handoff package includes `docs/project/v4-parity-execution-prompt.md`, the external evidence operator runbook, the PR body, the completion audit, status/readiness/audit tools, workflow files, the portfolio local proof surface, `packages/assets/src/OBJLoader.ts`, the asset import preflight files/tests, and `tests/unit/tools/v4-validation.test.ts`.
- The handoff package includes both patch transfer paths: `release-artifacts/v4-parity-external-evidence-workflows.patch` and `release-artifacts/v4-current-handoff-supplement.patch`.
- `release-artifacts/v4-current-handoff-supplement.patch` applies cleanly against a clean archive of the current committed tree, and the two-patch route applies cleanly against a clean archive of `HEAD^`.
- The supplement patch now includes untracked tool files as new-file patches, including `tools/v4-unity-unreal-parity/index.ts`. Apply both patches only to a target branch that does not already contain `84bc815`; apply the supplement alone when the workflow files are already present.
- Operator simulation passed: preserving the `release-artifacts/` path, `shasum -a 256 -c release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`, `tar -xzf release-artifacts/v4-external-evidence-handoff.tar.gz`, `node VERIFY_PACKAGE_INTEGRITY.mjs`, and `node RESTORE_INTO_CHECKOUT.mjs --dry-run /tmp/clean-checkout` all completed successfully.
- Latest standalone operator package check after the portfolio proof-surface handoff update: `shasum -a 256 -c release-artifacts/v4-external-evidence-handoff.tar.gz.sha256` reports OK, `node VERIFY_PACKAGE_INTEGRITY.mjs` reports `checkedFiles=157` and `violations=[]`, and `node RESTORE_INTO_CHECKOUT.mjs --dry-run /Users/gurbakshchahal/G3D` reports `restorePreflight.ok=true`.
- `node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /Users/gurbakshchahal/G3D` was run from inside the packaged handoff directory. It correctly executes `pnpm doctor:v4-external-host:strict`, reports `handoffPackageReady=true`, and exits nonzero because `externalHostReady=false` with `firstMissingCapability=unity-editor-executable`; this is the expected operator-entrypoint behavior until Unity/Unreal/public deployment capabilities are configured.
- Standalone package verification scope: `packageInternalEntries=true`, `archiveAndSidecar=false`, `externalParityEvidence=false`.
- `RESTORE_INTO_CHECKOUT.mjs` now runs `VERIFY_PACKAGE_INTEGRITY.mjs` before any dry-run or restore copy and refuses to restore a corrupted package.

Additional local proof commands run successfully:

- `pnpm build`
- `pnpm verify:v4-examples`
- `pnpm verify:package-install-smoke`
- `pnpm verify:package-provenance`
- `pnpm audit:v4-production-readiness`
- `pnpm audit:v4-broad-parity`
- `pnpm typecheck`
- `pnpm exec vitest run tests/unit/tools/v4-validation.test.ts` (`44` passed)
- `pnpm exec vitest run tests/unit/tools/v4-validation.test.ts -t "external evidence handoff" --reporter=dot`
- `pnpm exec vitest run tests/unit/tools/v4-validation.test.ts -t "external evidence readiness" --reporter=dot`
- `pnpm exec vitest run tests/unit/assets/asset-import-preflight.test.ts tests/unit/tools/v4-validation.test.ts -t "asset import|unity/unreal|handoff inventory|external baseline" --reporter=dot`
- `pnpm --filter @galileo3d/assets test`

Latest audit correction:

- `tools/v4-unity-unreal-parity/index.ts` now treats bounded PBR, shadow, and HDR visual parity reports as current object-shaped evidence (`{ threejs: true, babylon: true }`) instead of requiring obsolete boolean fields.
- `pnpm status:v4-parity` now reports `Bounded renderer parity flags: PBR=true, shadows=true, HDR targets=true, real-scene postprocess=true, forward shadow sampling=true.`
- This correction does not complete any additional criterion; it removes a stale local-evidence false negative while preserving the Unity/Unreal and public-deployment blockers.
- `tools/compare-engines/index.ts` now treats benchmark wins as broad enough only when every compared scene has at least one real win and there are no losses/unavailable dimensions, instead of requiring wins on dimensions that intentionally tie for equivalent same-scene workloads.
- `pnpm verify:v4-benchmarks` regenerated the comparison reports and removed the stale `benchmark win count is not broad enough` blocker from the broad-superiority status. Broad superiority remains blocked by the lower PBR, shadow/HDR/postprocess, Unity/Unreal, and production deployment gates.
- `tools/v4-product-visual-parity/index.ts` now populates top-level `screenshotPaths` with the real Galileo/Three.js/Babylon product renders and local diff PNGs, so artifact packaging no longer has to infer product visual evidence from nested `renders` and `diffs`.
- `tools/v4-pbr-visual-parity/index.ts`, `tools/v4-shadow-visual-parity/index.ts`, and `tools/v4-hdr-visual-parity/index.ts` now populate top-level `screenshotPaths` with their real Galileo/Three.js/Babylon renders and local diff PNGs.
- `tools/v4-external-evidence-handoff/index.ts` now packages key local parity reports and top-level screenshot evidence as `local-evidence`, including product, PBR, shadow, and HDR visual reports plus their Three.js/Babylon render/diff PNGs.
- `tests/unit/tools/v4-validation.test.ts` now includes regression tests for product/PBR/shadow/HDR visual evidence path collection and status summaries; the full suite reports `44` passing tests.

Boundary check:

- `git diff --check -- docs/project/v4-parity-execution-prompt.md release-artifacts/codingrelated-completion-audit.md .github/workflows/v4-external-engine-baselines.yml .github/workflows/v4-public-demo-deploy.yml tests/unit/tools/v4-validation.test.ts` passes with no whitespace errors.
- The workflow YAML files parse structurally.
- `pnpm doctor:v4-external-host:strict` exits nonzero as expected because `externalHostReady` is false; the report still shows `handoffPackageReady: true`, `firstBlockedArea: github-remote-external-readiness`, `firstMissingCapability: unity-editor-executable`, and `firstBlockedArtifact: unity:editor-cli-smoke`.
- `pnpm run:v4-external-host-evidence:execute` refuses to execute and exits nonzero as expected because `readyToExecute` is false; it records `failedCommands: []` and the same first blocker.
- `pnpm preflight:v4-parity:after-external-evidence` runs the post-external local path, validates the external kit and dry-runs Unity/Unreal capture commands, refreshes reports, and verifies the handoff package. It still reports `achievedCriteria: 2` because no real external artifacts have been ingested.
- The old-codebase mining references from `docs/project/v4-parity-execution-prompt.md` all resolve on `master`: racing car builder, procedural texture generator, space environment, procedural texture library, architecture scene/material/postprocess files, and PBR/shadow shader chunks. `pnpm status:v4-local-port` reports `localDocsComplete: true` and `oldCodebasePortPlanComplete: true`.

## Prompt-To-Artifact Checklist

| Goal from `docs/project/v4-parity-execution-prompt.md` | Required artifact/gate | Current evidence | Current status |
| --- | --- | --- | --- |
| Full PBR parity | `tests/reports/v4-pbr-gltf-readiness.json`, `tests/reports/v4-pbr-reference-readiness.json`, `tests/reports/v4-pbr-visual-parity.json`, completion criterion `full-pbr-parity` | Local PBR material/browser/reference evidence exists, including bounded Three.js/Babylon visual lineup and prepared external baseline slot. | Blocked. Full physical PBR parity still requires actual Unity/Unreal PBR runner sidecars, same-scene reference BRDF pixel parity against Unity/Unreal, and Unity/Unreal production caustics/transmission/refraction parity. |
| Production HDR/render-target parity | `tests/reports/v4-hdr-render-target-readiness.json`, `tests/reports/v4-hdr-visual-parity.json`, completion criterion `production-hdr-render-target-parity` | Local WebGL2/WebGPU HDR render-target, float readback, tone mapping, HDR IBL, and Three.js/Babylon bounded evidence exists. | Blocked. Requires actual Unity/Unreal HDR runner sidecars, same-scene HDR IBL comparison against Unity/Unreal, and same-scene HDR render-target comparison against Unity/Unreal. |
| Production shadow-map parity | `tests/reports/v4-shadow-map-readiness.json`, `tests/reports/v4-shadow-visual-parity.json`, completion criterion `production-shadow-map-parity` | Local directional/cascaded/PCF/point/spot shadow evidence, lit-vs-shadowed pixels, forward-pass shadow sampling, atlas/cascade selection, and Three.js/Babylon bounded evidence exists. | Blocked. Requires actual Unity/Unreal shadow runner sidecars, same-scene shadow pixel parity against Unity/Unreal, and Unity/Unreal shadow atlas/cascade selection parity. |
| Full postprocess-suite parity | `tests/reports/v4-postprocess-suite.json`, `tests/reports/v4-rendering.json`, completion criterion `full-postprocess-suite-parity` | Local real-scene postprocess suite has 17 implemented effects and 17 real-scene effects, including color controls and HDR/WebGPU evidence. | Blocked. Requires actual Unity/Unreal postprocess runner sidecars, Unity/Unreal same-scene HDR image-based lighting parity, and Unity/Unreal same-scene postprocess parity. |
| Rendered product visual parity | `tests/reports/v4-product-visual-parity.json`, `tests/reports/v4-unity-product-visual-baseline.json`, `tests/reports/v4-unreal-product-visual-baseline.json`, completion criterion `rendered-product-visual-parity` | Local Galileo/Three.js/Babylon product renders pass same-scene local checks. | Blocked. `renderedProductVisualParity.unity` and `renderedProductVisualParity.unreal` are false because Unity/Unreal baseline reports and screenshots are missing. |
| Three.js broad superiority | `tests/reports/v4-broad-parity-readiness.json`, `tests/reports/v4-engine-comparison.json`, completion criterion `threejs-broad-superiority` | Same-scene benchmark scaffolds, local screenshots, bundle metrics, product visual parity, glTF parity, WebGPU parity, ecosystem/docs/device matrix signals exist. | Blocked. Broad matrix is 7/11 dimensions; full PBR, shadow/HDR/postprocess, Unity/Unreal workflow parity, production readiness, package install, and provenance gates must all pass. |
| Babylon.js broad superiority | `tests/reports/v4-broad-parity-readiness.json`, `tests/reports/v4-engine-comparison.json`, completion criterion `babylonjs-broad-superiority` | Same-scene benchmark scaffolds, local screenshots, bundle metrics, product visual parity, glTF parity, WebGPU parity, ecosystem/docs/device matrix signals exist. | Blocked. Broad matrix is 7/11 dimensions; same lower gates as Three.js broad superiority must all pass. |
| Unity parity | `tests/reports/v4-unity-unreal-parity.json`, `tests/reports/v4-external-engine-baselines.json`, completion criterion `unity-parity` | Repo-side Unity baseline scripts, descriptors, dry-run command inventory, validators, and handoff package are prepared. | Blocked. No Unity executable is available, Unity CLI smoke was not run, and Unity render/product/PBR/shadow/HDR/postprocess baseline reports are missing. |
| Unreal parity | `tests/reports/v4-unity-unreal-parity.json`, `tests/reports/v4-external-engine-baselines.json`, completion criterion `unreal-parity` | Repo-side Unreal baseline scripts, descriptors, dry-run command inventory, validators, and handoff package are prepared. | Blocked. No Unreal executable is available, Unreal CLI smoke was not run, and Unreal render/product/PBR/shadow/HDR/postprocess baseline reports are missing. |
| Unity/Unreal replacement | `tests/reports/v4-unity-unreal-parity.json`, `tests/reports/v4-production-readiness.json`, completion criterion `unity-unreal-replacement` | Local editor/runtime/static export evidence exists. | Blocked. Requires Unity parity, Unreal parity, replacement readiness, production readiness, and external rendered-output evidence. |
| Production readiness | `tests/reports/v4-production-readiness.json`, `tests/reports/public-demo-deployment-smoke.json`, package/provenance reports, completion criterion `production-readiness` | Static external demo export and local static server smoke pass. | Blocked. Durable public HTTPS deployment evidence is missing; every required public deployment file check is absent. |
| Full glTF parity | `tests/reports/v4-pbr-gltf-readiness.json`, `tests/reports/v4-gltf-loader-visual-parity.json`, `tests/reports/v4-khronos-gltf-visuals.json`, completion criterion `full-gltf-parity` | Local and external-corpus glTF visual parity reports pass. | Achieved. Keep fresh and do not regress. |
| Full WebGPU parity | `tests/reports/v4-webgpu-parity.json`, `tests/reports/webgpu-hardware-matrix.json`, completion criterion `full-webgpu-parity` | Real WebGPU capability/parity reports pass where hardware is available and unsupported paths are explicitly bounded. | Achieved. Keep fresh and do not regress. |

## External Infrastructure Checklist

Read-only GitHub checks show the external execution path is not yet available:

- Rechecked at `2026-05-12T07:27:10Z` with read-only `git ls-remote`, `gh pr list`, `gh workflow list`, `gh repo view`, and `gh api` calls.
- Remote default branch: `main`
- Remote `preserve/g3d-v2-execution-state` branch: missing
- Open/closed pull requests for this handoff branch: none found by `gh pr list --repo gchahal1982/G3D2025 --state all`
- V4 workflows on GitHub: not listed
- GitHub Pages: `404`
- Self-hosted runners: `0`
- Actions variables: `0`
- Actions secrets: `0`

The local commit that prepares the repo-side path is:

`84bc815 Add V4 parity execution and external evidence workflows`

It contains:

- `.github/workflows/v4-external-engine-baselines.yml`
- `.github/workflows/v4-public-demo-deploy.yml`
- `docs/project/v4-parity-execution-prompt.md`
- `tests/unit/tools/v4-validation.test.ts`

## Next Required External Actions

These are externally visible and were not run without explicit user approval:

```sh
git push origin preserve/g3d-v2-execution-state
```

Then open/merge a PR into `main` so GitHub can discover the new workflows.

Configure:

- GitHub Pages
- self-hosted runner labeled `unity`
- self-hosted runner labeled `unreal`
- `G3D_UNITY_EDITOR`
- `G3D_UNREAL_EDITOR`
- use the checked-in workflow's built-in `G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true` setting for external baseline runs

Trigger after the workflow files are on `main`:

```sh
gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main
gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all
```

Ingest artifacts:

```sh
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits
pnpm preflight:v4-parity:after-external-evidence
pnpm status:v4-parity
```

## Completion Decision

Do not call the goal complete yet.

The local repo-side preflight is clean, but the objective is not achieved because `tests/reports/v4-completion-audit.json` still reports only `2 / 13` criteria achieved.
