# Coding-Related Parity Execution Prompt

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This file is the real handoff prompt. Give the entire file to the coding agent that is responsible for finishing the remaining V3/V4 parity work.

The agent must treat this as an execution contract, not a brainstorming brief. Each goal below has a tangible output, concrete artifacts, commands that must pass, and an audit condition. If the named report or audit field is still false, the goal is still false no matter how much code was written.

## Current Audit Snapshot

Latest verified local status:

- Completion audit timestamp: read `generatedAt` from `tests/reports/external-parity-completion-audit.json` at the start of the run; do not hand-maintain this prompt as the timestamp source of truth.
- Current result: `2/13` achieved.
- Achieved and must be preserved: `full-gltf-parity`, `full-webgpu-parity`.
- Missing: `threejs-broad-superiority`, `babylonjs-broad-superiority`, `unity-parity`, `unreal-parity`, `unity-unreal-replacement`, `production-readiness`, `full-pbr-parity`, `production-hdr-render-target-parity`, `production-shadow-map-parity`, `full-postprocess-suite-parity`, `rendered-product-visual-parity`.
- First missing criterion reported by `pnpm status:v4-parity`: `threejs-broad-superiority`.
- First missing capability reported by `pnpm status:v4-parity`: `unity-editor-executable`.
- First external blocker area: `github-remote-external-readiness`.
- First blocked external artifact: `unity:editor-cli-smoke`.
- First blocked external artifact path: `tests/reports/v4-unity-editor-cli-smoke.json`.

Current local reality:

- The V4 visual-quality gate is currently blocked again, intentionally. `tools/external-parity-visual-quality/index.ts` now rejects primitive/debug-dominated flagship scenes instead of accepting nonblank screenshots. The current blocker is that product, architecture, game, and racing scenes still rely too heavily on unlit/depth-disabled overlays, primitive factories, and evidence scaffolding. Manual review confirms the examples are not visually impressive, high-definition, production-ready, or Unity/Unreal/Three.js/Babylon parity proof.
- Local renderer/product evidence is already strong enough for scoped A3D/Three.js/Babylon checks in several reports, but broad superiority remains false because lower gates and external Unity/Unreal/production gates are not complete.
- Asset import is glTF-first with native `glb`, `gltf`, and bounded geometry-only `obj` support. `dae`, `fbx`, `usd`, and `usdz` remain conversion-required. Do not describe this as Unity/Unreal/DCC import parity.
- Local production static export and static-server smoke are prepared, but production readiness remains false until a durable public HTTPS deployment report exists for the current static export.
- Unity and Unreal parity are not local claims. They require real editor executables, CLI smoke reports, runner sidecars, and same-scene baseline reports.

## Operator Strategy

Use this strategy before writing more code:

1. Run `pnpm status:v4-parity` and inspect `tests/reports/external-parity-completion-audit.json`.
2. If a missing goal has only external blockers, do not add local metadata to make it look closer. Work on the external evidence path, handoff package, runner scripts, ingest validators, or public deployment evidence instead.
3. If a missing goal has a local coding blocker, implement the actual engine/example/test change named by the report, then regenerate the report.
4. If a goal is already achieved, treat it as a regression guardrail, not a place to churn.
5. Stop and report honestly if the next required action is externally visible, such as `git push`, GitHub workflow dispatch, GitHub Pages configuration, self-hosted runner setup, or Unity/Unreal editor execution.

## Real Tangible Outcomes For Each Goal

These are the concrete outcomes the coding agent must create or preserve. A goal is not complete until the named audit marks it achieved.

| Goal | Tangible outcome that must exist | Current completion state |
| --- | --- | --- |
| `threejs-broad-superiority` | Same-scene benchmark/readiness reports prove A3D beats Three.js after PBR, shadow, HDR, postprocess, product visual, production, and Unity/Unreal replacement gates are complete. | Missing. Do not claim while lower gates are false. |
| `babylonjs-broad-superiority` | Same-scene benchmark/readiness reports prove A3D beats Babylon.js after PBR, shadow, HDR, postprocess, product visual, production, and Unity/Unreal replacement gates are complete. | Missing. Do not claim while lower gates are false. |
| `unity-parity` | Real Unity editor CLI smoke, Unity asset-import workflow evidence, Unity runner sidecars, and same-scene Unity baselines for product/PBR/shadow/HDR/postprocess are generated and ingested. | Missing. External evidence blocked by missing Unity executable/runner evidence. |
| `unreal-parity` | Real Unreal editor CLI smoke, Unreal asset-import workflow evidence, Unreal runner sidecars, and same-scene Unreal baselines for product/PBR/shadow/HDR/postprocess are generated and ingested. | Missing. External evidence blocked by missing Unreal executable/runner evidence. |
| `unity-unreal-replacement` | Editor/import/export/runtime/deployment workflow is end-to-end credible and backed by passing Unity and Unreal parity plus production readiness. | Missing. Cannot complete before Unity, Unreal, visual, and production gates pass. |
| `production-readiness` | Build, package, static export, package provenance, report freshness, static-server smoke, and durable public HTTPS deployment smoke all pass for the current artifact set. | Missing. Local export is prepared; durable public deployment evidence is still missing. |
| `full-pbr-parity` | Claimed PBR/glTF material behavior is rendered visibly and validated against local and external physical-reference evidence, including advanced lobes/extensions that remain claimed. | Missing. Local bounded PBR exists; Unity/Unreal/external physical reference parity remains unproven. |
| `production-hdr-render-target-parity` | Real HDR/render-target path and same-scene HDR evidence are validated locally and against required Unity/Unreal baselines. | Missing. External HDR same-scene baseline evidence remains required. |
| `production-shadow-map-parity` | Real shadow-map depth/caster/receiver/sampling behavior is validated locally and against required Unity/Unreal shadow baselines. | Missing. External shadow same-scene baseline evidence remains required. |
| `full-postprocess-suite-parity` | Every claimed postprocess effect runs on real scene buffers with pixel evidence, and required Unity/Unreal same-scene postprocess baselines pass. | Missing. External postprocess baseline evidence remains required. |
| `rendered-product-visual-parity` | A3D, Three.js, Babylon.js, Unity, and Unreal render the deterministic product scene with accepted screenshots, metrics, and visual-diff evidence. | Missing. Local Three.js/Babylon evidence exists; Unity/Unreal product baselines are missing. |
| `full-gltf-parity` | glTF loader/material/texture/animation/morph/skinning corpus and visual parity reports remain fresh and achieved after all later changes. | Achieved. Preserve and revalidate after every major change. |
| `full-webgpu-parity` | WebGPU capability/fallback/blocked compute boundaries remain explicit, tested, and achieved after all later changes. | Achieved. Preserve and revalidate after every major change. |

## Prompt To Run

You are the coding agent responsible for completing the remaining A3D V3/V4 parity work. Work in `/Users/gurbakshchahal/Aura3D`. Your job is not to make the docs sound better; your job is to make the engine, examples, validators, screenshots, benchmarks, and external-evidence handoff strong enough that the parity audits honestly pass.

Start by reading `docs/project/v3-*.md`, `docs/project/v4-*.md`, this file, and the current reports under `tests/reports/`. Then run `pnpm status:v4-parity`. Treat that status report and `tests/reports/external-parity-completion-audit.json` as the source of truth.

The current result is only `2/13` achieved: `full-gltf-parity` and `full-webgpu-parity`. Do not claim the overall objective is complete until all 13 criteria are achieved by the completion audit. The missing goals are `threejs-broad-superiority`, `babylonjs-broad-superiority`, `unity-parity`, `unreal-parity`, `unity-unreal-replacement`, `production-readiness`, `full-pbr-parity`, `production-hdr-render-target-parity`, `production-shadow-map-parity`, `full-postprocess-suite-parity`, and `rendered-product-visual-parity`.

For every implementation slice:

- Pick the highest-leverage missing goal from the tangible outcome ledger below.
- If `pnpm verify:external-parity-visual-quality` fails, treat that as the first local coding blocker for product/PBR/HDR/shadow/postprocess visual claims. Fix the examples and renderer output before marking any of those goals ready.
- Implement the real engine/example/verifier changes needed for that goal.
- Regenerate the relevant reports and screenshots.
- Run the listed proof commands for that goal.
- Update docs only after the code and reports prove the claim.
- Leave external Unity, Unreal, and public deployment gates blocked unless real external artifacts exist.
- Preserve `full-gltf-parity` and `full-webgpu-parity` after every shared renderer or asset change.

The final answer from any agent using this prompt must report: criteria achieved out of 13, criteria moved during the run, criteria still coding-blocked, criteria still external-evidence-blocked, exact commands run, exact reports and screenshots regenerated, and the first remaining blocker from `pnpm status:v4-parity`.

## Real Outcome Standard

A goal has a real tangible outcome only when all of these are true:

- The engine or example behavior exists in code.
- A browser, unit, or verifier test exercises that behavior.
- A report under `tests/reports/` records the behavior with fresh evidence.
- Any screenshot artifact is real, current, nonblank, and tied to the current scenario.
- The relevant audit command passes without weakening its checks.
- `tests/reports/external-parity-completion-audit.json` marks the specific goal `achieved: true`, except for guardrail goals that were already achieved and must remain achieved.

The following do not count as outcomes:

- metadata-only flags
- docs-only checkmarks
- stale screenshots
- synthetic-only lab evidence for a real-scene claim
- fallback/proxy rendering used to satisfy a production parity claim
- fake Unity/Unreal/public deployment reports
- broad superiority claims while lower renderer/product/external gates remain false

You are working in `/Users/gurbakshchahal/Aura3D`.

Your task is to complete the coding-related work required for A3D V4/V3 parity goals. Do not spend the run adding cosmetic report fields, moving checklist text, or claiming broad parity without rendered evidence. Work from blocked parity goals backward into concrete engine, example, benchmark, and verifier changes.

Current audit snapshot from `tests/reports/external-parity-completion-audit.json` at its latest `generatedAt` value:

- Total goals: 13.
- Achieved goals: 2.
- Missing goals: 11.
- Achieved now: `full-gltf-parity`, `full-webgpu-parity`.
- Not achieved now: `threejs-broad-superiority`, `babylonjs-broad-superiority`, `unity-parity`, `unreal-parity`, `unity-unreal-replacement`, `production-readiness`, `full-pbr-parity`, `production-hdr-render-target-parity`, `production-shadow-map-parity`, `full-postprocess-suite-parity`, `rendered-product-visual-parity`.
- Treat `tests/reports/external-parity-completion-audit.json` as the source of truth for the latest `generatedAt` timestamp before each run.

Current strategic truth:

- Only coding-actionable goals should be worked locally.
- Unity, Unreal, and public deployment goals may have coding prerequisites, but final completion requires external evidence.
- If a goal remains externally blocked, leave it blocked and improve only the repo-side code needed for that evidence to pass later.
- Every completed docs row or parity claim must cite a passing command and a real report/screenshot/test artifact.

Before editing code, read:

- `docs/project/v3-*.md`
- `docs/project/v4-*.md`
- `docs/project/v4-old-codebase-port-plan.md` if present
- `tests/reports/external-parity-completion-audit.json`
- `tests/reports/external-parity-product-visual-parity.json`
- `tests/reports/external-parity-pbr-gltf-readiness.json`
- `tests/reports/external-parity-pbr-reference-readiness.json`
- `tests/reports/external-parity-hdr-render-target-readiness.json`
- `tests/reports/external-parity-shadow-map-readiness.json`
- `tests/reports/external-parity-postprocess-suite.json`
- `tests/reports/external-parity-broad-parity-readiness.json`
- `tests/reports/external-parity-unity-unreal-parity.json`
- `tests/reports/external-parity-production-readiness.json`
- `tests/reports/external-parity-external-evidence-readiness.json`

Run:

```sh
pnpm status:v4-parity
pnpm status:v4-local-port
pnpm doctor:v4-external-host
pnpm audit:external-parity-github-external-readiness
```

Then work only on the highest-impact blocked coding goal.

## External Infrastructure Gate

Before attempting to close any goal whose verifier names Unity, Unreal, or durable public deployment evidence, check whether the external execution path exists. As of the latest local audit, the local code and report path are prepared, but the external infrastructure is not present:

- `pnpm audit:external-parity-github-external-readiness` writes `tests/reports/external-parity-github-external-readiness.json` and checks these prerequisites read-only.
- `.github/workflows/external-parity-external-engine-baselines.yml` exists locally but is not tracked/pushed, so GitHub cannot run it yet.
- `.github/workflows/v4-public-demo-deploy.yml` exists locally but is not tracked/pushed, so GitHub cannot deploy the public demo yet.
- `gh workflow list --repo gchahal1982/Aura3D` did not show the V4 workflows.
- `gh repo view gchahal1982/Aura3D --json defaultBranchRef` reports `main` as the default branch.
- `git ls-remote --heads origin preserve/a3d-v2-execution-state` returned no branch, so the current local branch is not present on the remote.
- GitHub `workflow_dispatch` workflows must be discoverable from the repository's default branch before they can be triggered normally. Pushing only `preserve/a3d-v2-execution-state` may create a review branch, but it will not by itself make these new workflow files available for normal manual dispatch.
- `gh api repos/gchahal1982/Aura3D/pages` returned `404`, so a GitHub Pages deployment is not currently available for public smoke evidence.
- `gh api repos/gchahal1982/Aura3D/actions/runners` returned zero runners, so no self-hosted `unity` or `unreal` runner is available.
- `gh api repos/gchahal1982/Aura3D/actions/variables` returned zero variables.
- `gh api repos/gchahal1982/Aura3D/actions/secrets` returned zero secrets.
- No local Unity or Unreal executable was found on `PATH`, `/Applications`, or `/Users/Shared`.

Do not keep modifying renderer reports, parity wording, or checklist rows to work around these blockers. The next real actions for external gates are to commit the local files and get them onto the default branch through the repository's normal review path:

```sh
git add \
  docs/project/v4-parity-execution-prompt.md package.json docs/project/deployment-rollback.md \
  .github/workflows/external-parity-external-engine-baselines.yml \
  .github/workflows/v4-public-demo-deploy.yml \
  examples/portfolio \
  packages/assets/src/AssetImportPreflight.ts \
  packages/assets/src/OBJLoader.ts \
  packages/assets/src/index.ts \
  packages/assets/tests/assets.test.ts \
  fixtures/external-engine-baselines/external-parity \
  tests/unit/assets/asset-import-preflight.test.ts \
  tests/browser/example-portfolio.spec.ts \
  tests/browser/example-screenshot-audit-external-parity.spec.ts \
  tests/unit/tools/external-parity-validation.test.ts \
  tools/external-demo-export tools/external-demo-validation \
  tools/external-parity-examples \
  tools/external-parity-claim-gates tools/external-parity-assets tools/external-parity-current-capability \
  tools/external-parity-pbr-reference-readiness tools/external-parity-shadow-map-readiness \
  tools/external-parity-hdr-render-target-readiness tools/external-parity-production-readiness \
  tools/external-parity-pbr-gltf-readiness tools/external-parity-ecosystem-readiness \
  tools/external-parity-broad-parity-readiness tools/external-parity-completion-audit \
  tools/external-parity-parity-status tools/external-parity-local-port-status tools/external-parity-reporting \
  tools/external-parity-external-engine-baselines tools/external-parity-external-host-doctor \
  tools/external-parity-external-host-runner tools/external-parity-report-freshness \
  tools/external-parity-github-external-readiness tools/external-parity-external-evidence-readiness \
  tools/external-parity-external-evidence-handoff tools/external-parity-product-visual-parity \
  tools/external-parity-pbr-visual-parity tools/external-parity-shadow-visual-parity \
  tools/external-parity-hdr-visual-parity tools/external-parity-postprocess-suite \
  tools/external-parity-unity-unreal-parity tools/compare-engines \
  tools/public-demo-deployment-artifacts tools/public-demo-deployment-smoke \
  tools/static-demo-server-smoke tools/package-provenance \
  release-artifacts/v4-current-handoff-supplement.patch \
  release-artifacts/v4-parity-external-evidence-workflows.patch \
  release-artifacts/external-parity-external-evidence-handoff.tar.gz \
  release-artifacts/external-parity-external-evidence-handoff.tar.gz.sha256 \
  release-artifacts/external-parity-external-evidence-handoff.transfer.json \
  release-artifacts/external-parity-external-evidence-handoff \
  release-artifacts/v4-external-evidence-operator-runbook.md \
  release-artifacts/v4-parity-external-evidence-pr.md \
  release-artifacts/codingrelated-completion-audit.md
git commit -m "Add V4 parity execution and external evidence workflows"
git push origin preserve/a3d-v2-execution-state
```

After that branch is pushed, open and merge a PR into `main` or otherwise land the workflow files on `main`. Only then configure the repo/hosts:

```text
Enable GitHub Pages for the repository.
Provision a self-hosted runner labeled unity.
Provision a self-hosted runner labeled unreal.
Configure A3D_UNITY_EDITOR as an Actions variable or secret.
Configure A3D_UNREAL_EDITOR as an Actions variable or secret.
Use the checked-in external baseline workflow's built-in `A3D_RUN_UNITY_UNREAL_CLI_SMOKE: "true"` setting for external baseline runs.
```

Then run or trigger:

```sh
gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/Aura3D --ref main
gh workflow run external-parity-external-engine-baselines.yml --repo gchahal1982/Aura3D --ref main -f engine=all
```

Only after those workflows upload real reports should the repo ingest artifacts and rerun:

```sh
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits
pnpm preflight:v4-parity:after-external-evidence
```

These commands are externally visible. Do not run `git push`, `gh workflow run`, or repository configuration commands without explicit user permission.

## Hard Rules

1. Do not claim a goal complete unless `tests/reports/external-parity-completion-audit.json` says that criterion is achieved.
2. Do not treat Unity, Unreal, or public deployment evidence as locally complete unless the real external reports exist and pass.
3. Do not add new evidence metadata unless an existing verifier cannot express a real passing/failing condition.
4. Do not improve screenshots by hiding evidence panels while leaving weak rendering unchanged.
5. Do not port old code wholesale. Mine old code for specific algorithms/assets, then integrate into current architecture with tests.
6. Every implementation slice must include code changes, visual/report evidence, and a clear statement of which parity goal moved.
7. When a goal is externally blocked, the tangible coding outcome is "repo-side readiness complete and verifier correctly blocks on external artifacts." Do not turn an external blocker into a fake local pass.
8. Keep `full-gltf-parity` and `full-webgpu-parity` green while working. A regression in either achieved goal must be fixed before taking another feature slice.

## Per-Goal Tangible Outcome Ledger

Use this table as the concrete backlog. Each row names the real deliverables that must exist before the goal can honestly move. "Local deliverables" are coding tasks inside this repo. "External deliverables" are evidence that cannot be fabricated locally.

| Goal ID | Current status | Local tangible deliverables | External tangible deliverables | Done when |
| --- | --- | --- | --- | --- |
| `full-pbr-parity` | Missing | Current renderer imports and renders all claimed glTF PBR fields/extensions; browser material scenes visibly prove metallic/roughness, normal, occlusion, emissive, alpha, double-sided, texture transforms, IBL response, and every claimed advanced lobe; reports reject metadata-only PBR. | Unity/Unreal or other physical-reference evidence required by the audit for remaining advanced parity claims. | `pnpm audit:external-parity-pbr-reference-readiness`, `pnpm audit:external-parity-pbr-gltf-readiness`, `pnpm verify:external-parity-assets`, and `pnpm verify:external-parity-rendering` pass, then `full-pbr-parity` is `achieved: true` in `external-parity-completion-audit.json`. |
| `production-hdr-render-target-parity` | Missing | Real render-target pipeline with color/depth attachments, resize lifecycle, HDR-capable target where supported, tone-map/exposure pass to LDR, fallback diagnostics, and browser pixel validation. | Unity/Unreal HDR same-scene baseline reports if required by the audit. | `pnpm audit:external-parity-hdr-render-target-readiness`, `pnpm verify:external-parity-rendering`, and `pnpm verify:external-parity-examples` pass, then the completion audit marks it achieved. |
| `production-shadow-map-parity` | Missing | Real shadow-map depth pass, caster/receiver routing, light projection, PCF/bias controls, DPR/resize-safe tests, and product/architecture/game/shadow-lab using real sampled shadows where claimed. | Unity/Unreal shadow same-scene baseline reports if required by the audit. | `pnpm audit:external-parity-shadow-map-readiness`, `pnpm verify:external-parity-rendering`, and `pnpm verify:external-parity-examples` pass, then the completion audit marks it achieved. |
| `full-postprocess-suite-parity` | Missing | Every claimed effect runs on real scene buffers and has toggle/pixel evidence: tone map, exposure, bloom, FXAA, color grading, saturation/vibrance, temperature/tint, vignette, sharpening, and any depth/history effects only when the real inputs exist. | Unity/Unreal postprocess same-scene baseline reports if required by the audit. | `pnpm audit:external-parity-postprocess-suite`, `pnpm verify:external-parity-rendering`, and `pnpm verify:external-parity-examples` pass, then the completion audit marks it achieved. |
| `rendered-product-visual-parity` | Missing | Product scene is visually credible and deterministic; same camera/product intent is rendered in A3D, Three.js, and Babylon; screenshots are nonblank, material-rich, and diffed by verifier. | Real Unity and Unreal product visual baseline screenshots/reports with runner evidence sidecars. | `pnpm verify:external-parity-examples`, `pnpm audit:external-parity-product-visual-parity`, and `pnpm verify:external-parity-benchmarks` pass with all four engines accepted, then the completion audit marks it achieved. |
| `threejs-broad-superiority` | Missing | Local broad-readiness matrix proves A3D beats Three.js across the defined dimensions after lower renderer/product gates pass; comparison harnesses are same-scene and fresh. | None by itself, but the audit currently depends on Unity/Unreal/replacement/production gates being achieved first. | `pnpm verify:external-parity-benchmarks`, `pnpm audit:v4-broad-parity`, and `pnpm status:v4-parity` show `broadSuperiority.threejs=true` and the completion audit marks it achieved. |
| `babylonjs-broad-superiority` | Missing | Local broad-readiness matrix proves A3D beats Babylon.js across the defined dimensions after lower renderer/product gates pass; comparison harnesses are same-scene and fresh. | None by itself, but the audit currently depends on Unity/Unreal/replacement/production gates being achieved first. | `pnpm verify:external-parity-benchmarks`, `pnpm audit:v4-broad-parity`, and `pnpm status:v4-parity` show `broadSuperiority.babylonjs=true` and the completion audit marks it achieved. |
| `unity-parity` | Missing | Repo-side Unity export/capture kit, asset-import workflow runner, report validators, workflow files, ingest path, and same-scene descriptors are complete and fail clearly when Unity is unavailable. | Unity editor executable, CLI smoke, Unity runner evidence, Unity asset-import workflow sidecar/report, and same-scene Unity baseline reports for product/PBR/shadow/HDR/postprocess. | `pnpm doctor:v4-external-host`, `pnpm run:v4-external-host-evidence:execute`, and `pnpm preflight:v4-parity:after-external-evidence` pass with Unity evidence, then the completion audit marks it achieved. |
| `unreal-parity` | Missing | Repo-side Unreal export/capture kit, asset-import workflow runner, report validators, workflow files, ingest path, and same-scene descriptors are complete and fail clearly when Unreal is unavailable. | Unreal editor executable, CLI smoke, Unreal runner evidence, Unreal asset-import workflow sidecar/report, and same-scene Unreal baseline reports for product/PBR/shadow/HDR/postprocess. | `pnpm doctor:v4-external-host`, `pnpm run:v4-external-host-evidence:execute`, and `pnpm preflight:v4-parity:after-external-evidence` pass with Unreal evidence, then the completion audit marks it achieved. |
| `unity-unreal-replacement` | Missing | Editor/runtime/import/export workflow is end-to-end credible; generated projects build/run; visual examples are production-grade; deployment path is ready; replacement audit rejects shallow editor demos. | Unity and Unreal parity evidence, plus public/deployment/reproduction evidence required by production readiness. | `pnpm verify:external-parity-editor`, `pnpm verify:external-parity-runtime`, `pnpm audit:external-parity-unity-unreal-parity`, `pnpm audit:external-parity-production-readiness`, and `pnpm status:v4-parity` all support replacement, then the completion audit marks it achieved. |
| `production-readiness` | Missing | Build/package/install/static-export/report-freshness/provenance checks pass; public demo smoke tooling exists; release artifacts are reproducible and restorable. | Durable public HTTPS deployment report for the current static export, plus external engine evidence if the production audit requires it. | `pnpm build`, `pnpm verify:external-parity-report-freshness`, `pnpm audit:external-parity-production-readiness`, and public deployment smoke pass, then the completion audit marks it achieved. |
| `full-gltf-parity` | Achieved | Preserve loader/material/animation/morph/skinning/corpus coverage while other renderer changes land; fix regressions immediately. | None unless future audit criteria add external conformance evidence. | It remains `achieved: true` after every major slice and after `pnpm verify:external-parity-assets`, `pnpm audit:external-parity-gltf-loader-visual-parity`, `pnpm audit:external-parity-pbr-gltf-readiness`, and `pnpm verify:external-parity-report-freshness`. |
| `full-webgpu-parity` | Achieved | Preserve capability detection, fallback behavior, explicit compute claim blocking, and browser evidence boundaries; only add compute if real hardware/browser evidence exists. | Real WebGPU hardware compute evidence only if new compute claims are introduced. | It remains `achieved: true` after every major slice and after `pnpm verify:external-parity-rendering`, `pnpm verify:external-parity-report-freshness`, and `pnpm status:v4-parity`. |

## Local Readiness Versus Full Parity Certification

Do not confuse a green local readiness report with a completed full-parity criterion. The current reports intentionally expose both layers:

- `ok: true` means the local verifier ran successfully and the repo-side checks are internally consistent.
- A parity field such as `pbrParity`, `hdrRenderTargetParity`, `shadowMapParity`, `postprocessSuiteParity`, or `renderedProductVisualParity.unity/unreal` is the actual completion gate for that claim.
- If the local report is `ok: true` but the parity field is `false`, do not add random local metadata or more synthetic examples. Read the blockers and work only on the missing evidence path.

Current split from the latest local audit:

| Goal | Local implementation/readiness state | Full parity certification state | Next useful work |
| --- | --- | --- | --- |
| `full-pbr-parity` | `pnpm audit:external-parity-pbr-reference-readiness` and `pnpm audit:external-parity-pbr-gltf-readiness` run cleanly; local bounded PBR/glTF evidence exists. | `pbrParity=false` and `fullPhysicalPbrParity=false` because Unity/Unreal/external physical-reference parity is not proven. | Generate and ingest real Unity/Unreal PBR baseline reports or add only verifier-required local physical-reference evidence if a future report names a local blocker. |
| `production-hdr-render-target-parity` | `pnpm audit:external-parity-hdr-render-target-readiness` runs cleanly; local HDR/render-target evidence exists. | `hdrRenderTargetParity=false` because Unity/Unreal HDR runner sidecars and same-scene baselines are missing. | Run the external HDR baseline path on real Unity/Unreal editors and ingest the reports. |
| `production-shadow-map-parity` | `pnpm audit:external-parity-shadow-map-readiness` runs cleanly; local shadow-map evidence exists. | `shadowMapParity=false` because Unity/Unreal shadow runner sidecars and same-scene/cascade parity reports are missing. | Run the external shadow baseline path on real Unity/Unreal editors and ingest the reports. |
| `full-postprocess-suite-parity` | `pnpm audit:external-parity-postprocess-suite` runs cleanly and reports 17 implemented real-scene effects. | `postprocessSuiteParity=false` because Unity/Unreal postprocess runner sidecars and same-scene postprocess/HDR evidence are missing. | Run the external postprocess baseline path on real Unity/Unreal editors and ingest the reports. |
| `rendered-product-visual-parity` | Local Aura3D/Three.js/Babylon same-scene product visual evidence is present. | Unity and Unreal product visual parity are false because their same-scene baseline reports/screenshots are missing. | Run the external product visual baselines and ingest Unity/Unreal reports. |
| `full-gltf-parity` | Achieved and green. | Achieved. | Preserve as a regression guardrail. |
| `full-webgpu-parity` | Achieved and green. | Achieved. | Preserve as a regression guardrail; do not claim compute unless real hardware evidence exists. |

When continuing locally, the highest-value repo-side work is external-evidence readiness: workflow packaging, ingest validators, baseline descriptors, report freshness, and operator runbooks. Renderer feature work should resume only if a current report names a concrete local blocker.

## Tangible Outcomes Matrix

Use this as the non-negotiable target list. A goal is not done because the docs sound better; it is done only when the named local or external evidence exists and the completion audit marks the criterion achieved.

| Goal | Tangible done outcome | Primary proof |
| --- | --- | --- |
| Full PBR parity | Claimed glTF/PBR material features render visibly and correctly across real browser scenes, including maps, alpha modes, double-sided behavior, texture transforms, environment response, and any claimed extensions. | `pnpm audit:external-parity-pbr-reference-readiness`, `pnpm audit:external-parity-pbr-gltf-readiness`, `pnpm verify:external-parity-assets`, `pnpm verify:external-parity-rendering` |
| Production HDR/render-target parity | Real scenes render through resize-safe color/depth render targets with HDR-capable buffers where supported, then tone-map/expose to LDR output with fallback diagnostics. | `pnpm audit:external-parity-hdr-render-target-readiness`, `pnpm verify:external-parity-rendering`, `pnpm verify:external-parity-examples` |
| Production shadow-map parity | Product, architecture, game, and shadow lab use real shadow-map caster/receiver/depth-pass sampling where shadow-map parity is claimed; proxy/contact shadows no longer satisfy this goal. | `pnpm audit:external-parity-shadow-map-readiness`, `pnpm verify:external-parity-rendering`, `pnpm verify:external-parity-examples` |
| Full postprocess-suite parity | Every claimed postprocess effect runs on real scene buffers, changes pixels when enabled, survives runtime toggles/resizes, and keeps unimplemented effects blocked. | `pnpm audit:external-parity-postprocess-suite`, `pnpm verify:external-parity-rendering`, `pnpm verify:external-parity-examples` |
| Rendered product visual parity | The product scene is visually credible, materially rich, deterministic, and compared against same-scene Three.js/Babylon baselines, with Unity/Unreal artifacts added when externally available. | `pnpm verify:external-parity-examples`, `pnpm audit:external-parity-product-visual-parity`, `pnpm verify:external-parity-benchmarks` |
| Three.js broad superiority | Same-scene local benchmarks and screenshots prove A3D beats Three.js under the repo's defined criteria after renderer/material/postprocess/product blockers are resolved. | `pnpm verify:external-parity-benchmarks`, `pnpm audit:v4-broad-parity`, `pnpm status:v4-parity` |
| Babylon.js broad superiority | Same-scene local benchmarks and screenshots prove A3D beats Babylon.js under the repo's defined criteria after renderer/material/postprocess/product blockers are resolved. | `pnpm verify:external-parity-benchmarks`, `pnpm audit:v4-broad-parity`, `pnpm status:v4-parity` |
| Unity parity | Repo-side Unity export/capture validation is ready, and real Unity editor evidence has been generated and ingested; missing Unity executable remains an external blocker, not a local claim. | `pnpm doctor:v4-external-host`, `pnpm run:v4-external-host-evidence:execute`, `pnpm preflight:v4-parity:after-external-evidence` |
| Unreal parity | Repo-side Unreal export/capture validation is ready, and real Unreal editor evidence has been generated and ingested; missing Unreal executable remains an external blocker, not a local claim. | `pnpm doctor:v4-external-host`, `pnpm run:v4-external-host-evidence:execute`, `pnpm preflight:v4-parity:after-external-evidence` |
| Unity/Unreal replacement | Editor/import/build/runtime workflow is end-to-end credible, visually competitive, publicly deployable, and backed by Unity/Unreal comparison evidence where required. | `pnpm verify:external-parity-editor`, `pnpm verify:external-parity-runtime`, `pnpm audit:external-parity-unity-unreal-parity`, `pnpm audit:external-parity-production-readiness`, `pnpm status:v4-parity` |
| Production readiness | Static builds, package/install smoke tests, report freshness, reproducible release artifacts, and public deployment smoke evidence pass without dev-only assumptions. | `pnpm build`, `pnpm verify:external-parity-report-freshness`, `pnpm audit:external-parity-production-readiness`, optional `A3D_PUBLIC_DEMO_URL=<url> pnpm verify:public-demo-deployment` |
| Full glTF parity | The already-achieved glTF criterion stays achieved after all changes; loader/material/animation/morph/skinning/corpus reports stay fresh and honest. | `pnpm verify:external-parity-assets`, `pnpm audit:external-parity-gltf-loader-visual-parity`, `pnpm audit:external-parity-pbr-gltf-readiness`, `pnpm verify:external-parity-report-freshness`, `pnpm status:v4-parity` |
| Full WebGPU parity | The already-achieved WebGPU criterion stays achieved; capability/fallback/blocked compute boundaries remain explicit and tested. | `pnpm verify:external-parity-rendering`, `pnpm verify:external-parity-report-freshness`, `pnpm status:v4-parity` |

## Per-Goal Acceptance Artifacts

Use this table to keep work tangible. If the artifact listed here does not exist, is stale, or contains a blocker for that goal, the goal is not done.

| Goal ID | Required code artifacts | Required report/screenshot artifacts | Acceptance result |
| --- | --- | --- | --- |
| `full-pbr-parity` | Renderer material/shader code for every claimed glTF PBR field and extension; asset-viewer/material-showroom/product scenes wired to those paths; tests that fail on missing map response or metadata-only extension support. | `tests/reports/external-parity-pbr-gltf-readiness.json`, `tests/reports/external-parity-pbr-reference-readiness.json`, `tests/reports/v4-asset-material-fidelity.json` or equivalent current asset/material report, current material screenshots under `tests/reports/v4-example-screenshots/`. | Completion audit marks `full-pbr-parity` achieved. |
| `production-hdr-render-target-parity` | Render-target abstraction with color/depth attachments, HDR-capable format negotiation, resize/dispose lifecycle, tone-map pass, fallback path, and browser validation tests. | `tests/reports/external-parity-hdr-render-target-readiness.json`, rendering verifier report, screenshots proving target-backed render output and fallback diagnostics. | Completion audit marks `production-hdr-render-target-parity` achieved. |
| `production-shadow-map-parity` | Depth shadow pass, light-space matrices, caster/receiver routing, sampled shadow shader path, PCF/bias controls, product/architecture/game/shadow-lab integration, resize/DPR tests. | `tests/reports/external-parity-shadow-map-readiness.json`, real shadow screenshots for lab and flagship scenes, verifier entries proving lit/shadow pixel separation from real geometry. | Completion audit marks `production-shadow-map-parity` achieved. |
| `full-postprocess-suite-parity` | Real scene-buffer postprocess graph for all claimed effects; toggle controls; pixel-diff tests for each effect; depth/history effects implemented only when real inputs exist. | `tests/reports/external-parity-postprocess-suite.json`, rendering/examples reports, before/after screenshots or metrics for every claimed effect. | Completion audit marks `full-postprocess-suite-parity` achieved. |
| `rendered-product-visual-parity` | Product scene upgraded to a credible modeled object with materials, lighting, camera presets, shadows/postprocess where claimed; same-scene Three.js/Babylon harnesses; Unity/Unreal descriptors and ingest path. | `tests/reports/external-parity-product-visual-parity.json`, `tests/reports/v4-engine-comparison.json`, A3D/Three/Babylon screenshots, and Unity/Unreal screenshots/reports when external baselines are available. | Completion audit marks `rendered-product-visual-parity` achieved. |
| `threejs-broad-superiority` | Same-scene comparison harnesses and scoring logic that reflect real lower-gate outcomes, not hand-entered superiority flags. | `tests/reports/external-parity-broad-parity-readiness.json`, `tests/reports/v4-engine-comparison.json`, fresh benchmark/screenshot outputs against Three.js. | Completion audit marks `threejs-broad-superiority` achieved. |
| `babylonjs-broad-superiority` | Same-scene comparison harnesses and scoring logic that reflect real lower-gate outcomes, not hand-entered superiority flags. | `tests/reports/external-parity-broad-parity-readiness.json`, `tests/reports/v4-engine-comparison.json`, fresh benchmark/screenshot outputs against Babylon.js. | Completion audit marks `babylonjs-broad-superiority` achieved. |
| `unity-parity` | Unity runner scripts, generated Unity scene descriptors, asset-import workflow runner, report validators, ingest command, and GitHub workflow/readiness tooling. | `tests/reports/v4-unity-editor-cli-smoke.json`, `tests/reports/v4-unity-asset-import-workflow.json`, Unity visual baseline reports/screenshots, Unity sidecar evidence files. | Completion audit marks `unity-parity` achieved only after real Unity evidence is ingested. |
| `unreal-parity` | Unreal runner scripts, generated Unreal scene descriptors, asset-import workflow runner, report validators, ingest command, and GitHub workflow/readiness tooling. | `tests/reports/v4-unreal-editor-cli-smoke.json`, `tests/reports/v4-unreal-asset-import-workflow.json`, Unreal visual baseline reports/screenshots, Unreal sidecar evidence files. | Completion audit marks `unreal-parity` achieved only after real Unreal evidence is ingested. |
| `unity-unreal-replacement` | Editor/import/export/runtime workflows that can author, import, build, and run a project; replacement audit that rejects shallow demos; visual quality gates tied to renderer/product goals. | `tests/reports/external-parity-unity-unreal-parity.json`, editor/runtime reports, production readiness report, Unity/Unreal evidence reports, current completion audit. | Completion audit marks `unity-unreal-replacement` achieved. |
| `production-readiness` | Production build/static export/package install smoke, public demo verification tooling, release artifact generation, report freshness/provenance checks. | `tests/reports/external-parity-production-readiness.json`, public deployment smoke report when a URL exists, release artifacts under `release-artifacts/`, freshness reports. | Completion audit marks `production-readiness` achieved. |
| `full-gltf-parity` | Existing glTF loader/material/texture/animation/morph/skinning code remains working; any renderer changes preserve corpus behavior. | `tests/reports/external-parity-gltf-loader-visual-parity.json`, `tests/reports/external-parity-pbr-gltf-readiness.json`, V4 asset reports/screenshots, report freshness output. | Completion audit continues to mark `full-gltf-parity` achieved after every slice. |
| `full-webgpu-parity` | Existing WebGPU capability/fallback/blocked-claim code remains honest; compute paths are added only with real hardware evidence. | `tests/reports/external-parity-rendering.json`, WebGPU capability screenshot/report entries, report freshness output. | Completion audit continues to mark `full-webgpu-parity` achieved after every slice. |

## Goal 1: Full PBR Parity

Classification: coding-related, but currently external-certification-blocked for the full criterion.

Current local state:

- Local bounded PBR/glTF implementation evidence is present.
- `pnpm audit:external-parity-pbr-reference-readiness` reports `ok=true` and `fullPhysicalPbrParity=false`.
- `pnpm audit:external-parity-pbr-gltf-readiness` reports `ok=true`, `gltfParity=true`, and `pbrParity=false`.
- The remaining blockers are Unity/Unreal or external physical-reference parity reports, not generic local PBR feature metadata.

Tangible coding outcome:

- A3D has a real PBR material path that covers the material behavior required by the readiness reports.
- Implement or complete the missing material features shown as blockers in `external-parity-pbr-gltf-readiness.json` and `external-parity-pbr-reference-readiness.json`.
- Expected feature areas include:
  - metallic/roughness response
  - normal maps
  - occlusion maps
  - emissive maps
  - alpha blend/mask
  - double-sided rendering
  - texture transforms
  - clearcoat if claimed
  - sheen if claimed
  - transmission/volume if claimed
  - anisotropy if claimed
  - specular color/intensity if claimed
  - iridescence if claimed
  - environment reflection response
  - glTF material extension import and render behavior where claimed
- Use the old branch shader/material code only as reference, especially:
  - `master:src/shaders/chunks/pbr.glsl`
  - old procedural material/texture utilities

Tangible proof outcome:

- Material tests fail on missing textures, stale screenshots, non-visible material response, or fake metadata.
- Browser screenshots show visibly distinct material states.
- These commands pass:

```sh
pnpm audit:external-parity-pbr-reference-readiness
pnpm audit:external-parity-pbr-gltf-readiness
pnpm verify:external-parity-assets
pnpm verify:external-parity-rendering
```

Completion condition:

- `full-pbr-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If the local readiness reports remain `ok=true` and list only Unity/Unreal/external physical-reference blockers, do not spend another slice adding unrelated local PBR demos. Move to the external baseline generation/ingest path.

## Goal 2: Production HDR / Render-Target Parity

Classification: coding-related, but currently external-certification-blocked for the full criterion.

Current local state:

- Local HDR/render-target implementation evidence is present.
- `pnpm audit:external-parity-hdr-render-target-readiness` reports `ok=true` and `hdrRenderTargetParity=false`.
- The remaining blockers are actual Unity/Unreal HDR runner evidence sidecars and same-scene HDR/IBL comparison reports.

Tangible coding outcome:

- A3D has a real render-target pipeline rather than only backbuffer readback postprocess.
- Implement or complete:
  - render target creation/destruction
  - resize-safe render target lifecycle
  - color and depth attachments
  - floating point or HDR-capable targets where supported
  - HDR scene buffer
  - tone mapping from HDR target to LDR output
  - exposure and white point controls
  - render-target readback validation
  - browser fallback behavior when HDR formats are unsupported
- Examples must use the real path where they claim HDR/render-target behavior.

Tangible proof outcome:

- A browser example renders through the HDR/render-target path and publishes real target diagnostics.
- Tests reject backbuffer-only evidence for this goal.
- These commands pass:

```sh
pnpm audit:external-parity-hdr-render-target-readiness
pnpm verify:external-parity-rendering
pnpm verify:external-parity-examples
```

Completion condition:

- `production-hdr-render-target-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If the local readiness report remains `ok=true` and lists only Unity/Unreal baseline blockers, move to external evidence execution/ingest instead of adding unrelated local HDR metadata.

## Goal 3: Production Shadow-Map Parity

Classification: coding-related, but currently external-certification-blocked for the full criterion.

Current local state:

- Local directional/cascaded/PCF/point/spot/forward-pass shadow-map evidence is present.
- `pnpm audit:external-parity-shadow-map-readiness` reports `ok=true` and `shadowMapParity=false`.
- The remaining blockers are actual Unity/Unreal shadow runner evidence sidecars, same-scene shadow pixel parity, and Unity/Unreal atlas/cascade selection parity.

Tangible coding outcome:

- Replace proxy/contact-shadow claims with real shadow-map rendering where shadow-map parity is claimed.
- Implement or complete:
  - directional shadow maps
  - caster/receiver selection
  - depth pass integration
  - stable light view/projection
  - PCF or equivalent filtering
  - bias and slope-bias controls
  - resize and DPR stability
  - multi-light, point, spot, cascade, or atlas support if required by readiness blockers
- Use the old branch shadow code only as reference:
  - `master:src/shaders/chunks/shadow.glsl`
- Product, architecture, game, and shadow lab scenes must use real shadow maps where claimed.

Tangible proof outcome:

- Browser tests compare lit and shadowed pixels on real caster/receiver geometry.
- Tests fail if shadows are replaced by simple dark quads, stale screenshots, or metadata-only evidence.
- These commands pass:

```sh
pnpm audit:external-parity-shadow-map-readiness
pnpm verify:external-parity-rendering
pnpm verify:external-parity-examples
```

Completion condition:

- `production-shadow-map-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If the local readiness report remains `ok=true` and lists only Unity/Unreal baseline blockers, move to external evidence execution/ingest instead of adding proxy shadow scenes.

## Goal 4: Full Postprocess-Suite Parity

Classification: coding-related, but currently external-certification-blocked for the full criterion.

Current local state:

- Local real-scene postprocess suite evidence is present.
- `pnpm audit:external-parity-postprocess-suite` reports `ok=true`, `implementedEffects=17`, `realSceneEffects=17`, and `postprocessSuiteParity=false`.
- The remaining blockers are actual Unity/Unreal postprocess runner evidence sidecars and same-scene postprocess/HDR image-based-lighting parity.

Tangible coding outcome:

- A3D has a real, tested postprocess suite running on real scene buffers.
- Implement only effects that have real render input and can be pixel-tested.
- Required/likely effect areas:
  - bloom
  - FXAA
  - tone mapping
  - exposure
  - color grading
  - saturation/vibrance
  - temperature/tint
  - vignette
  - sharpening
  - film grain
  - chromatic aberration
  - depth of field only if real depth input exists
  - outline only if real depth/normal/edge input exists
  - SSAO only if real depth/normal input exists
  - SSR only if real scene/color/depth buffers exist
  - TAA/motion blur only if history/motion-vector infrastructure exists
- Port the useful settings model from:
  - `master:examples/arch-viz/src/PostProcessing.ts`
- Do not claim effects that are UI-only, synthetic-only, or metadata-only.

Tangible proof outcome:

- Each claimed effect has real-scene before/after screenshot or pixel metrics.
- Tests fail when toggles do not change pixels or when layout/resolution breaks.
- These commands pass:

```sh
pnpm audit:external-parity-postprocess-suite
pnpm verify:external-parity-rendering
pnpm verify:external-parity-examples
```

Completion condition:

- `full-postprocess-suite-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If the local suite report remains `ok=true` and lists only Unity/Unreal baseline blockers, move to external evidence execution/ingest instead of adding unrequested effects.

## Goal 5: Rendered Product Visual Parity

Classification: coding-heavy, with local Three.js/Babylon evidence present and Unity/Unreal final comparison externally blocked unless real external artifacts exist.

Current local state:

- Local Aura3D/Three.js/Babylon same-scene product visual evidence is present.
- `tests/reports/external-parity-product-visual-parity.json` reports local Three.js/Babylon parity but Unity/Unreal parity remains false.
- The remaining blockers are real Unity and Unreal product visual baseline reports, screenshots, visual-diff evidence, and runner sidecars.

Tangible coding outcome:

- The Aura3D product scene looks like a serious product renderer, not a primitive/debug demo.
- Improve `examples/product-configurator` and related benchmark scenes.
- Required local coding improvements:
  - credible product model or procedural object with recognizable structure
  - high-quality materials
  - real environment lighting
  - real shadows if the shadow goal is claimed
  - postprocess through the shared render path
  - stable camera presets
  - turntable/comparison capture path
  - deterministic screenshot output
  - same-scene Three.js and Babylon baselines
- Prefer porting high-value old branch content:
  - `master:examples/racing-game/src/ProceduralCarBuilder.ts`
  - `master:examples/racing-game/src/ProceduralTextureGenerator.ts`
  - `master:examples/racing-game/src/Track.ts`
  - `master:examples/racing-game/src/Vehicle.ts`
  - `master:examples/racing-game/src/RaceManager.ts`
- Add current-engine geometry helpers if needed:
  - cylinder
  - capsule
  - wheel/tire forms
  - bevel-like approximations
  - curved panels

Tangible proof outcome:

- Product screenshots are visibly coherent and materially rich.
- Tests reject blank, tiny, stale, or debug-dominated screenshots.
- Local Three.js and Babylon comparison screenshots use the same scene/camera intent.
- These commands pass:

```sh
pnpm verify:external-parity-examples
pnpm audit:external-parity-product-visual-parity
pnpm verify:external-parity-benchmarks
```

Completion condition:

- Local product visual parity can move for Three.js/Babylon.
- Full `rendered-product-visual-parity` is complete only when Unity/Unreal artifacts also exist if the audit requires them.

## Goal 6: Three.js Broad Superiority

Classification: coding-heavy and mostly locally actionable, but evidence-backed.

Tangible coding outcome:

- A3D must beat Three.js in the repo's defined broad-superiority criteria, not by assertion.
- Coding prerequisites likely include:
  - product visual parity
  - PBR parity
  - shadow-map parity
  - HDR/render-target parity
  - postprocess-suite parity
  - glTF parity already achieved unless regressed
  - WebGPU parity already achieved unless regressed
  - better diagnostics and examples
  - comparable benchmark scenes
- Improve Three.js comparison harnesses only when they are unfair, stale, or unable to validate real output.

Tangible proof outcome:

- Same-scene Three.js comparisons run locally.
- Reports explain where A3D is better, equal, or worse.
- Screenshots and metrics are fresh for the current commit.
- These commands pass:

```sh
pnpm verify:external-parity-benchmarks
pnpm audit:v4-broad-parity
pnpm status:v4-parity
```

Completion condition:

- `threejs-broad-superiority` is achieved in `tests/reports/external-parity-completion-audit.json`.

## Goal 7: Babylon.js Broad Superiority

Classification: coding-heavy and mostly locally actionable, but evidence-backed.

Tangible coding outcome:

- A3D must beat Babylon.js in the repo's defined broad-superiority criteria.
- Coding prerequisites are similar to Three.js:
  - product visual parity
  - PBR parity
  - shadow-map parity
  - HDR/render-target parity
  - postprocess-suite parity
  - asset loading parity
  - benchmark scene parity
- Improve Babylon comparison scenes only when they are stale, broken, or not same-scene.

Tangible proof outcome:

- Same-scene Babylon comparisons run locally.
- Reports distinguish real superiority from unsupported/fake claims.
- These commands pass:

```sh
pnpm verify:external-parity-benchmarks
pnpm audit:v4-broad-parity
pnpm status:v4-parity
```

Completion condition:

- `babylonjs-broad-superiority` is achieved in `tests/reports/external-parity-completion-audit.json`.

## Goal 8: Unity Parity

Classification: mixed. Coding prerequisites are local; final completion is externally blocked without a real Unity editor/artifacts.

Tangible coding outcome:

- The repo-side Unity comparison path is ready and honest.
- Required coding work:
  - same-scene export/capture assets prepared
  - Unity asset-import workflow runner and report writer prepared
  - Unity CLI runner scripts fail clearly when Unity is missing
  - report validation rejects fake/missing/stale Unity evidence
  - `tests/reports/v4-unity-asset-import-workflow.json` remains blocked until a real Unity editor writes `tests/reports/v4-unity-asset-import-workflow.evidence.json`
  - product/material/shadow/postprocess scenes have Unity-comparable data
  - local code gaps exposed by Unity comparison reports are fixed

Tangible proof outcome:

- If Unity is unavailable, the blocker is only the missing external executable/artifact, not repo code.
- If Unity is available, these commands run and produce passing reports:

```sh
pnpm doctor:v4-external-host
pnpm run:v4-external-host-evidence:execute
pnpm preflight:v4-parity:after-external-evidence
```

Completion condition:

- `unity-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- Do not claim it locally without real Unity evidence.

## Goal 9: Unreal Parity

Classification: mixed. Coding prerequisites are local; final completion is externally blocked without a real Unreal editor/artifacts.

Tangible coding outcome:

- The repo-side Unreal comparison path is ready and honest.
- Required coding work:
  - same-scene export/capture assets prepared
  - Unreal asset-import workflow runner and report writer prepared
  - Unreal CLI runner scripts fail clearly when Unreal is missing
  - report validation rejects fake/missing/stale Unreal evidence
  - `tests/reports/v4-unreal-asset-import-workflow.json` remains blocked until a real Unreal editor writes `tests/reports/v4-unreal-asset-import-workflow.evidence.json`
  - product/material/shadow/postprocess scenes have Unreal-comparable data
  - local code gaps exposed by Unreal comparison reports are fixed

Tangible proof outcome:

- If Unreal is unavailable, the blocker is only the missing external executable/artifact, not repo code.
- If Unreal is available, these commands run and produce passing reports:

```sh
pnpm doctor:v4-external-host
pnpm run:v4-external-host-evidence:execute
pnpm preflight:v4-parity:after-external-evidence
```

Completion condition:

- `unreal-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- Do not claim it locally without real Unreal evidence.

## Goal 10: Unity / Unreal Replacement

Classification: mostly product-level and external-evidence gated, but with major coding prerequisites.

Tangible coding outcome:

- A3D has enough editor/runtime/deployment capability to make the replacement claim plausible.
- Required coding prerequisites:
  - production-quality renderer goals above are complete
  - editor workflow works end-to-end
  - asset import workflow works end-to-end
  - runtime project export works
  - examples are visually credible
  - public deployment path works
  - Unity and Unreal comparison evidence exists if required
- Improve editor/runtime code only when it blocks actual replacement evidence.

Tangible proof outcome:

- A user can author/import/build/run a project through A3D's workflow.
- Exported projects run in browser with current assets and renderer features.
- Unity/Unreal evidence is present when required.
- These commands are likely required:

```sh
pnpm verify:external-parity-editor
pnpm verify:external-parity-runtime
pnpm verify:external-parity-examples
pnpm audit:external-parity-unity-unreal-parity
pnpm audit:external-parity-production-readiness
pnpm status:v4-parity
```

Completion condition:

- `unity-unreal-replacement` is achieved in `tests/reports/external-parity-completion-audit.json`.

## Goal 11: Production Readiness

Classification: mixed. Local coding is required; final completion may require public deployment evidence.

Tangible coding outcome:

- A3D builds, packages, serves, and validates demos without dev-only assumptions.
- Required coding work:
  - static demo build works
  - asset paths are production-safe
  - examples do not rely on local-only side effects
  - package/install smoke tests pass
  - reports are fresh
  - public demo smoke tooling is ready
  - release artifacts are reproducible
  - failures are actionable

Tangible proof outcome:

- Local production smoke tests pass.
- If a public URL is available, public deployment smoke passes.
- These commands pass:

```sh
pnpm build
pnpm verify:external-parity-report-freshness
pnpm audit:external-parity-production-readiness
```

If public URL is available:

```sh
A3D_PUBLIC_DEMO_URL=<url> pnpm verify:public-demo-deployment
pnpm audit:external-parity-production-readiness
```

Completion condition:

- `production-readiness` is achieved in `tests/reports/external-parity-completion-audit.json`.

## Goal 12: Full glTF Parity

Classification: achieved locally unless regressed; coding-related guardrail.

Tangible coding outcome:

- Keep the current glTF parity path passing while the renderer, material, animation, examples, and external baseline work changes underneath it.
- Do not regress:
  - glTF loader coverage
  - material import coverage
  - texture transform import
  - animation clip import
  - morph target import and playback where supported
  - skinning/skinned character evidence where supported
  - asset-viewer diagnostics
  - corpus report freshness
- If a later renderer/material change exposes a glTF blocker, fix the engine behavior first rather than weakening the audit.
- If the old branch has useful loader/material code, mine it only for specific behavior and add current tests before claiming the import path still works.

Tangible proof outcome:

- The achieved `full-gltf-parity` criterion remains achieved in the completion audit.
- glTF reports are fresh for the current commit.
- Browser/corpus tests fail on stale assets, missing screenshots, fake diagnostics, or unsupported features being claimed as rendered.
- These commands pass:

```sh
pnpm verify:external-parity-assets
pnpm audit:external-parity-gltf-loader-visual-parity
pnpm audit:external-parity-pbr-gltf-readiness
pnpm verify:external-parity-report-freshness
pnpm status:v4-parity
```

Completion condition:

- `full-gltf-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If it was already achieved at the start of a run, the tangible outcome is no regression after all other parity changes.

## Goal 13: Full WebGPU Parity

Classification: achieved locally unless regressed; coding-related guardrail with strict claim boundary.

Tangible coding outcome:

- Keep the current WebGPU parity criterion achieved while preserving honest WebGPU claim boundaries.
- Do not regress:
  - WebGPU capability detection
  - unsupported/no-adapter fallback behavior
  - report validation for supported and blocked WebGPU states
  - explicit blocking of compute particles or broad WebGPU renderer claims unless real hardware compute evidence exists
  - browser evidence that distinguishes actual WebGPU support from WebGL2/CPU fallback
- If future work adds WebGPU compute, it must be a real browser/hardware path with screenshots/reports, not a metadata toggle.
- If no real WebGPU compute path exists, keep compute claims blocked and keep fallback behavior tested.

Tangible proof outcome:

- The achieved `full-webgpu-parity` criterion remains achieved in the completion audit.
- WebGPU reports are fresh for the current commit.
- Tests fail if WebGPU support, fallback, or compute claim boundaries become ambiguous.
- These commands pass:

```sh
pnpm verify:external-parity-rendering
pnpm status:v4-parity
pnpm verify:external-parity-report-freshness
```

Completion condition:

- `full-webgpu-parity` is achieved in `tests/reports/external-parity-completion-audit.json`.
- If it was already achieved at the start of a run, the tangible outcome is no regression after all other parity changes.

## Work Order

Use this order unless current reports prove a different blocker is higher impact:

1. Confirm full glTF parity and full WebGPU parity are still achieved before changing shared renderer/asset code.
2. Full PBR parity.
3. Production shadow-map parity.
4. Production HDR/render-target parity.
5. Full postprocess-suite parity.
6. Rendered product visual parity against local Three.js/Babylon.
7. Three.js broad superiority.
8. Babylon.js broad superiority.
9. Production readiness local prerequisites.
10. Unity parity repo-side readiness.
11. Unreal parity repo-side readiness.
12. Unity/Unreal replacement only after the prerequisites are actually proven.
13. Reconfirm full glTF parity and full WebGPU parity after every major implementation slice.

## Old Codebase Mining Plan

Inspect the old branch read-only:

```sh
git show master:examples/racing-game/src/ProceduralCarBuilder.ts
git show master:examples/racing-game/src/ProceduralTextureGenerator.ts
git show master:examples/space-shooter/src/SpaceEnvironment.ts
git show master:src/assets/ProceduralTextures.ts
git show master:examples/arch-viz/src/ArchVizScene.ts
git show master:examples/arch-viz/src/MaterialLibrary.ts
git show master:examples/arch-viz/src/PostProcessing.ts
git show master:src/shaders/chunks/pbr.glsl
git show master:src/shaders/chunks/shadow.glsl
```

Bring forward only specific, testable value:

- procedural racing/product geometry
- deterministic procedural textures
- starfield/nebula/background generation
- richer architecture composition
- postprocess setting model
- shader math references

Do not port backup/corrupt renderer files wholesale.

## Required Final Audit Before Any Completion Claim

Run:

```sh
pnpm status:v4-parity
pnpm preflight:v4-parity
pnpm verify:external-parity-report-freshness
```

If external evidence was generated:

```sh
pnpm preflight:v4-parity:after-external-evidence
```

Then inspect:

```sh
jq '.criteria[] | {id, achieved, blockers}' tests/reports/external-parity-completion-audit.json
```

Final answer must state:

- how many of 13 criteria are achieved
- which criteria moved during this run
- which criteria remain blocked by coding
- which criteria remain blocked by external evidence
- exact commands run
- exact reports/screenshots regenerated

If fewer than 13/13 criteria are achieved, do not claim full parity, production readiness, or Unity/Unreal replacement.
