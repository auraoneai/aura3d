# Coding-Related Parity Execution Prompt

You are working in `/Users/gurbakshchahal/G3D`.

Your task is to complete the coding-related work required for G3D V4/V3 parity goals. Do not spend the run adding cosmetic report fields, moving checklist text, or claiming broad parity without rendered evidence. Work from blocked parity goals backward into concrete engine, example, benchmark, and verifier changes.

Current strategic truth:

- Only coding-actionable goals should be worked locally.
- Unity, Unreal, and public deployment goals may have coding prerequisites, but final completion requires external evidence.
- If a goal remains externally blocked, leave it blocked and improve only the repo-side code needed for that evidence to pass later.
- Every completed docs row or parity claim must cite a passing command and a real report/screenshot/test artifact.

Before editing code, read:

- `docs/v3/*.md`
- `docs/v4/*.md`
- `docs/v4/old-codebase-port-plan.md` if present
- `tests/reports/v4-completion-audit.json`
- `tests/reports/v4-product-visual-parity.json`
- `tests/reports/v4-pbr-gltf-readiness.json`
- `tests/reports/v4-pbr-reference-readiness.json`
- `tests/reports/v4-hdr-render-target-readiness.json`
- `tests/reports/v4-shadow-map-readiness.json`
- `tests/reports/v4-postprocess-suite.json`
- `tests/reports/v4-broad-parity-readiness.json`
- `tests/reports/v4-unity-unreal-parity.json`
- `tests/reports/v4-production-readiness.json`
- `tests/reports/v4-external-evidence-readiness.json`

Run:

```sh
pnpm status:v4-parity
pnpm status:v4-local-port
pnpm doctor:v4-external-host
```

Then work only on the highest-impact blocked coding goal.

## External Infrastructure Gate

Before attempting to close any goal whose verifier names Unity, Unreal, or durable public deployment evidence, check whether the external execution path exists. As of the latest local audit, the local code and report path are prepared, but the external infrastructure is not present:

- `.github/workflows/v4-external-engine-baselines.yml` exists locally but is not tracked/pushed, so GitHub cannot run it yet.
- `.github/workflows/v4-public-demo-deploy.yml` exists locally but is not tracked/pushed, so GitHub cannot deploy the public demo yet.
- `gh workflow list --repo gchahal1982/G3D2025` did not show the V4 workflows.
- `gh repo view gchahal1982/G3D2025 --json defaultBranchRef` reports `main` as the default branch.
- `git ls-remote --heads origin preserve/g3d-v2-execution-state` returned no branch, so the current local branch is not present on the remote.
- GitHub `workflow_dispatch` workflows must be discoverable from the repository's default branch before they can be triggered normally. Pushing only `preserve/g3d-v2-execution-state` may create a review branch, but it will not by itself make these new workflow files available for normal manual dispatch.
- `gh api repos/gchahal1982/G3D2025/pages` returned `404`, so a GitHub Pages deployment is not currently available for public smoke evidence.
- `gh api repos/gchahal1982/G3D2025/actions/runners` returned zero runners, so no self-hosted `unity` or `unreal` runner is available.
- `gh api repos/gchahal1982/G3D2025/actions/variables` returned zero variables.
- `gh api repos/gchahal1982/G3D2025/actions/secrets` returned zero secrets.
- No local Unity or Unreal executable was found on `PATH`, `/Applications`, or `/Users/Shared`.

Do not keep modifying renderer reports, parity wording, or checklist rows to work around these blockers. The next real actions for external gates are to commit the local files and get them onto the default branch through the repository's normal review path:

```sh
git add codingrelated.md .github/workflows/v4-external-engine-baselines.yml .github/workflows/v4-public-demo-deploy.yml tests/unit/tools/v4-validation.test.ts
git commit -m "Add V4 parity execution and external evidence workflows"
git push origin preserve/g3d-v2-execution-state
```

After that branch is pushed, open and merge a PR into `main` or otherwise land the workflow files on `main`. Only then configure the repo/hosts:

```text
Enable GitHub Pages for the repository.
Provision a self-hosted runner labeled unity.
Provision a self-hosted runner labeled unreal.
Configure G3D_UNITY_EDITOR as an Actions variable or secret.
Configure G3D_UNREAL_EDITOR as an Actions variable or secret.
Set G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true for external baseline runs.
```

Then run or trigger:

```sh
gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main
gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all
```

Only after those workflows upload real reports should the repo ingest artifacts and rerun:

```sh
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits
pnpm preflight:v4-parity:after-external-evidence
```

These commands are externally visible. Do not run `git push`, `gh workflow run`, or repository configuration commands without explicit user permission.

## Hard Rules

1. Do not claim a goal complete unless `tests/reports/v4-completion-audit.json` says that criterion is achieved.
2. Do not treat Unity, Unreal, or public deployment evidence as locally complete unless the real external reports exist and pass.
3. Do not add new evidence metadata unless an existing verifier cannot express a real passing/failing condition.
4. Do not improve screenshots by hiding evidence panels while leaving weak rendering unchanged.
5. Do not port old code wholesale. Mine old code for specific algorithms/assets, then integrate into current architecture with tests.
6. Every implementation slice must include code changes, visual/report evidence, and a clear statement of which parity goal moved.

## Goal 1: Full PBR Parity

Classification: coding-related and locally actionable.

Tangible coding outcome:

- G3D has a real PBR material path that covers the material behavior required by the readiness reports.
- Implement or complete the missing material features shown as blockers in `v4-pbr-gltf-readiness.json` and `v4-pbr-reference-readiness.json`.
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
pnpm audit:v4-pbr-reference-readiness
pnpm audit:v4-pbr-gltf-readiness
pnpm verify:v4-assets
pnpm verify:v4-rendering
```

Completion condition:

- `full-pbr-parity` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 2: Production HDR / Render-Target Parity

Classification: coding-related and locally actionable.

Tangible coding outcome:

- G3D has a real render-target pipeline rather than only backbuffer readback postprocess.
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
pnpm audit:v4-hdr-render-target-readiness
pnpm verify:v4-rendering
pnpm verify:v4-examples
```

Completion condition:

- `production-hdr-render-target-parity` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 3: Production Shadow-Map Parity

Classification: coding-related and locally actionable.

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
pnpm audit:v4-shadow-map-readiness
pnpm verify:v4-rendering
pnpm verify:v4-examples
```

Completion condition:

- `production-shadow-map-parity` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 4: Full Postprocess-Suite Parity

Classification: coding-related and locally actionable.

Tangible coding outcome:

- G3D has a real, tested postprocess suite running on real scene buffers.
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
pnpm audit:v4-postprocess-suite
pnpm verify:v4-rendering
pnpm verify:v4-examples
```

Completion condition:

- `full-postprocess-suite-parity` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 5: Rendered Product Visual Parity

Classification: coding-heavy, but Unity/Unreal final comparison is externally blocked unless real external artifacts exist.

Tangible coding outcome:

- The Galileo product scene looks like a serious product renderer, not a primitive/debug demo.
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
pnpm verify:v4-examples
pnpm audit:v4-product-visual-parity
pnpm verify:v4-benchmarks
```

Completion condition:

- Local product visual parity can move for Three.js/Babylon.
- Full `rendered-product-visual-parity` is complete only when Unity/Unreal artifacts also exist if the audit requires them.

## Goal 6: Three.js Broad Superiority

Classification: coding-heavy and mostly locally actionable, but evidence-backed.

Tangible coding outcome:

- G3D must beat Three.js in the repo's defined broad-superiority criteria, not by assertion.
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
- Reports explain where G3D is better, equal, or worse.
- Screenshots and metrics are fresh for the current commit.
- These commands pass:

```sh
pnpm verify:v4-benchmarks
pnpm audit:v4-broad-parity-readiness
pnpm status:v4-parity
```

Completion condition:

- `threejs-broad-superiority` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 7: Babylon.js Broad Superiority

Classification: coding-heavy and mostly locally actionable, but evidence-backed.

Tangible coding outcome:

- G3D must beat Babylon.js in the repo's defined broad-superiority criteria.
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
pnpm verify:v4-benchmarks
pnpm audit:v4-broad-parity-readiness
pnpm status:v4-parity
```

Completion condition:

- `babylonjs-broad-superiority` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 8: Unity Parity

Classification: mixed. Coding prerequisites are local; final completion is externally blocked without a real Unity editor/artifacts.

Tangible coding outcome:

- The repo-side Unity comparison path is ready and honest.
- Required coding work:
  - same-scene export/capture assets prepared
  - Unity CLI runner scripts fail clearly when Unity is missing
  - report validation rejects fake/missing/stale Unity evidence
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

- `unity-parity` is achieved in `tests/reports/v4-completion-audit.json`.
- Do not claim it locally without real Unity evidence.

## Goal 9: Unreal Parity

Classification: mixed. Coding prerequisites are local; final completion is externally blocked without a real Unreal editor/artifacts.

Tangible coding outcome:

- The repo-side Unreal comparison path is ready and honest.
- Required coding work:
  - same-scene export/capture assets prepared
  - Unreal CLI runner scripts fail clearly when Unreal is missing
  - report validation rejects fake/missing/stale Unreal evidence
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

- `unreal-parity` is achieved in `tests/reports/v4-completion-audit.json`.
- Do not claim it locally without real Unreal evidence.

## Goal 10: Unity / Unreal Replacement

Classification: mostly product-level and external-evidence gated, but with major coding prerequisites.

Tangible coding outcome:

- G3D has enough editor/runtime/deployment capability to make the replacement claim plausible.
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

- A user can author/import/build/run a project through G3D's workflow.
- Exported projects run in browser with current assets and renderer features.
- Unity/Unreal evidence is present when required.
- These commands are likely required:

```sh
pnpm verify:v4-editor
pnpm verify:v4-runtime
pnpm verify:v4-examples
pnpm audit:v4-unity-unreal-parity
pnpm audit:v4-production-readiness
pnpm status:v4-parity
```

Completion condition:

- `unity-unreal-replacement` is achieved in `tests/reports/v4-completion-audit.json`.

## Goal 11: Production Readiness

Classification: mixed. Local coding is required; final completion may require public deployment evidence.

Tangible coding outcome:

- G3D builds, packages, serves, and validates demos without dev-only assumptions.
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
pnpm verify:v4-report-freshness
pnpm audit:v4-production-readiness
```

If public URL is available:

```sh
G3D_PUBLIC_DEMO_URL=<url> pnpm verify:public-demo-deployment
pnpm audit:v4-production-readiness
```

Completion condition:

- `production-readiness` is achieved in `tests/reports/v4-completion-audit.json`.

## Work Order

Use this order unless current reports prove a different blocker is higher impact:

1. Full PBR parity.
2. Production shadow-map parity.
3. Production HDR/render-target parity.
4. Full postprocess-suite parity.
5. Rendered product visual parity against local Three.js/Babylon.
6. Three.js broad superiority.
7. Babylon.js broad superiority.
8. Production readiness local prerequisites.
9. Unity parity repo-side readiness.
10. Unreal parity repo-side readiness.
11. Unity/Unreal replacement only after the prerequisites are actually proven.

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
pnpm verify:v4-report-freshness
```

If external evidence was generated:

```sh
pnpm preflight:v4-parity:after-external-evidence
```

Then inspect:

```sh
jq '.criteria[] | {id, achieved, blockers}' tests/reports/v4-completion-audit.json
```

Final answer must state:

- how many of 13 criteria are achieved
- which criteria moved during this run
- which criteria remain blocked by coding
- which criteria remain blocked by external evidence
- exact commands run
- exact reports/screenshots regenerated

If fewer than 13/13 criteria are achieved, do not claim full parity, production readiness, or Unity/Unreal replacement.
