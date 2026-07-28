# Fixed-Needed PRD

Status: Draft internal remediation PRD  
Date: 2026-06-18  
Last recovery audit: 2026-06-20  
Scope: Aura3D engine/library gaps, showcase app integrity, and all Markdown/docs guidance that lets agents build weak or misleading examples.  
Source: Six parallel audit passes over renderer/runtime, asset CLI, game runtime, showcase apps, docs boundaries, and PRD synthesis.

## Claim Boundary Audit Update - 2026-07-27

- Root, production-runtime, rendering-internal, CLI, template, prototype, and
  roadmap scopes remain distinct; lower-level Phase 2B renderer/physics proof
  does not broaden root `createAuraApp` claims.
- Native `aura-js` now has bounded adaptive CCD and accumulated Coulomb
  friction, but oriented narrow-phase and angular contact remain blocked.
- Broad root skinned/morph wording remains blocked; only named typed-asset
  routes with root-only pose/morph pixel proof may make the narrower claim.
- Turbo Drift Circuit and Skyline Runner must not be called public-ready while
  the current retained racing visual-QA unit gate is non-passing. Skyline also
  retains its world-level release-probe blocker below.
- Performance parity remains unclaimable while the comparative report is
  missing all six required evidence inputs.

## Decision Summary

The current problem is not only the individual showcase examples. The deeper issue is that the public agent-facing Aura3D path, especially root `@aura3d/engine` through `createAuraApp`, is narrower than the production renderer and the docs do not make that boundary impossible to miss.

The examples are using Aura3D APIs, but too many of them compensate for missing or unexposed engine capability with primitives, local route logic, CSS/DOM overlays, weak visual assertions, and claim text that is stronger than what the rendered output proves.

The practical conclusion:

- We need library fixes before asking agents to create "Three.js quality" games through the public safe API.
- We need docs fixes before more agents touch showcase routes.
- We need hard validation gates that reject primitive-heavy placeholder scenes, raw asset IDs, fake evidence, CSS-rendered scenes, and claims that are not backed by pixel screenshots or runtime evidence.
- We should pause new showcase polishing until the P0 library/docs gates below are implemented.

## Blocker Closure Update - 2026-06-22

- [x] Smart City Control is now a bounded public candidate, not a demoted
  prototype. The route renders one typed `assets.showcaseCityVehicle` primary
  hero, route-primary evidence passes, and release/deploy validation for that
  asset passes with retained root-rendered probe and hash-bound orientation
  override evidence. Proof:
  `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  passed;
  `pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line`
  passed;
  `node --import tsx -e "checkDeploy({ distDir: 'apps/showcase-smart-city-control/dist', release: true, source: 'apps/showcase-smart-city-control/src', assetIds: ['showcaseCityVehicle'] })"`
  returned `ok: true`;
  `node tools/showcase-library/build-and-check.mjs` regenerated launch evidence
  with `showcase-smart-city-control` passing. The route remains bounded: no GIS,
  traffic-simulation, production digital-twin, or city-scale asset-backed
  flagship claim is allowed.
- [ ] Skyline Runner remains blocked despite route-primary and gameplay pass:
  the platformer spec compiler now generates a bounded `game-platformer`
  artifact set for Skyline and `showcaseSideScrollerWorld` has release
  quality/role/suitability, a hash-bound world-view orientation override, and
  retained root release-probe evidence. Skyline is still not public-ready
  because `showcasePlatformerWorldLevel` cannot be certified: its retained root
  release probe renders draw calls but no readable foreground
  (`non-background:0`, `color-buckets:0`, `foreground-width:0`,
  `foreground-height:0`), so deploy/release validation still fails on that
  asset. Do not mark Skyline public-ready until `showcasePlatformerWorldLevel`
  is replaced through the resolver/ranking pipeline or proven through a
  nonblank retained root-rendered release probe.

## Implementation Reality Update - 2026-06-19

The earlier checklist marked several items complete while the screenshots still showed real failures. This update records the specific root-cause fixes from the follow-up implementation pass.

- [x] Added render-normalized asset placement helpers (`groundedRenderedAssetPlacement`, `normalizedRenderScaleForTargetHeight`, `normalizedRenderScaleForTargetMaxDimension`) so normal public `model(assets.x)` scenes stop mixing raw GLB bounds with Aura3D's normalized model renderer.
- [x] Fixed `camera.follow` target resolution to use live runtime nodes by id, name, or tag, and to search flattened scene graphs instead of only top-level snapshot nodes.
- [x] Passed runtime node access through production and fallback renderers so production fallback cannot silently mis-frame moving scenes.
- [x] Added production-bridge primitive render items so mixed typed-GLB + Aura primitive scenes do not automatically drop to the old fallback path only because they contain gameplay markers.
- [x] Migrated `showcase-turbo-drift-circuit` away from route-local locator rings, checkpoint sticks, speed trails, and broken asset scale math. It now uses typed car, ghost, and beach race map GLBs plus `camera.follow`.
- [x] Migrated `showcase-skyline-runner` away from raw-bounds placement to render-normalized placement for the runner, stage, and backdrop.
- [ ] Capture fresh Playwright screenshots for Turbo and Skyline and reject the pass if the primary subject is not readable on first load and after keyboard input.
- [ ] Re-run the full 10-showcase visual pass and demote or rebuild any route whose primary subject/world is still primitive-dominant, visually unreadable, or not materially changed from the failed screenshots.
- [ ] Update every public docs/readme claim touched by this pass to name the exact path: root safe API, production runtime bridge, CLI asset pipeline, or prototype.

## Authoritative Recovery Reopen - 2026-06-20

This section supersedes any older broad `[x]` checkboxes below that imply the
public root API, asset release gates, game kits, renderer quality, showcase
routes, or docs are complete. Earlier checkboxes are historical implementation
notes until the reopened tasks below have current proof.

Evidence:

- Audit synthesis: `docs/project/aura3d-recovery-audit-2026-06-20.md`
- Baseline report: `tests/reports/aura3d-recovery-baseline/summary.json`
- Baseline visual verdict: `tests/reports/aura3d-recovery-baseline/visual-verdict.md`
- Baseline screenshots: `tests/reports/aura3d-recovery-baseline/*.png`

Current conclusion:

- Aura3D is not being abandoned.
- The showcase examples remain unacceptable as public proof.
- The recovery must fix root library behavior, diagnostics, asset gates, game
  runtime gates, and docs claims before another showcase rebuild pass.

Reopened P0 tasks:

- [ ] Reopen root production rendering claims until browser tests import only
  `@aura3d/engine`, mount typed assets, and prove material textures, lighting,
  shadows, postprocess, and fallback state in pixels.
- [ ] Reopen PBR/HDR/WebGPU claims until the evidence separates
  `createAuraApp` root safe API, `production-runtime`, `packages/rendering`
  internals, and WebGPU-native compute/render paths.
- [ ] Reopen public sizing/placement claims until public target sizing,
  route diagnostics, and asset-category readability are all proven in pixels.
  `targetHeight`, `targetMaxDimension`, and `targetLength` now have root-only
  browser proof:
  `tests/reports/createAuraApp-model-sizing/model-sizing.json`,
  `tests/reports/createAuraApp-model-sizing/model-sizing.png`, command
  `pnpm exec playwright test tests/browser/createAuraApp-model-sizing.spec.ts --reporter=line`.
  Route diagnostics and readable car/humanoid/product/world screenshots remain
  open.
- [ ] Reopen public camera/grounding claims until all referenced APIs have
  root-only browser proof. `camera.frameAsset(assets.x, ...)` is now public and
  has typed-GLB framing proof:
  `tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.json`,
  `tests/reports/createAuraApp-camera-frame-asset/camera-frame-asset.png`,
  command
  `pnpm exec playwright test tests/browser/createAuraApp-camera-frame-asset.spec.ts --reporter=line`.
  `model(..., { grounding })`, semantic contact points, route diagnostics, and
  readable car/humanoid/product/world screenshots remain open.
- [ ] Reopen asset provenance and quality claims until release validation blocks
  temp provenance, missing durable source/license fields, ungraded primary
  assets, duplicate hashes without allowlists, no-texture hero assets where
  texture is expected, and primitive-primary substitutions.
- [x] Added structured release asset metadata and blocking validation for
  `quality`, `role`, `suitabilityReason`, and `renderedProbe` on typed assets.
  `assets add` accepts `--quality`, `--role`, `--suitability`, and
  `--rendered-probe`; generated `src/aura-assets.ts` includes this metadata;
  `assets validate --release` blocks any model asset not explicitly graded
  `quality: "release"`, plus missing roles, missing suitability notes, and
  missing probe artifacts for model assets.
  Proof: `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts --reporter=dot`
  passed 21/21; `pnpm typecheck:raw` passed.
- [x] Added source validation for missing typed manifest assets and primitive
  primary-role substitutions. `assets validate --source`/`--release` now rejects
  references such as `assets.missingHero` when the id is absent from
  `aura.assets.json`, and release mode blocks primitive variables named as
  primary characters, vehicles, worlds, tracks, products, or weapons even when a
  typed asset appears elsewhere in the file.
  Proof: `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts --reporter=dot`
  passed 21/21; `pnpm typecheck:raw` passed.
- [ ] Reopen showcase screenshot/readability gates until tests detect subject
  screen bounds, clipping, first-load readability, UI occlusion, mobile crop, and
  manual visual inspection result, not only PNG size/statistics.
- [ ] Reopen game-kit readiness claims until platformer, racing, and falling
  block routes prove real user input, fail/retry, scoring/timing, progression,
  and at least 60 seconds of meaningful playable content.
- [ ] Reopen Turbo route readiness. Current baseline still shows a short
  prototype with weak camera/playability proof; route-health and evidence must
  be regenerated from mounted runtime diagnostics.
- [ ] Reopen Skyline route readiness. Current baseline still shows cropping and
  a non-credible game proof; completion state remains review/prototype.
- [ ] Reopen WebGPU Particle Lab readiness. The route may prove Aura3D/WebGL2
  fallback particles, but cannot keep native WebGPU wording without adapter,
  backend, dispatch, and rendered-pixel proof.
- [ ] Reopen docs/release status until README, llms, AGENTS, route-health,
  launch evidence, app READMEs, `docs/project`, `docs/api`, `docs/guides`,
  `docs/rendering`, and `docs/templates` agree with actual proof.
- [ ] Expand the docs matrix beyond the first PRD pass. `prompt.md`,
  `.claude/CLAUDE.md`, remaining `docs/agents`, `docs/api`, `docs/rendering`,
  `docs/animation-studio`, `docs/examples`, template READMEs, generated-template
  READMEs, package READMEs, and benchmark Markdown are active behavior docs and
  must either be audited or explicitly marked out of current public scope.
- [x] Created the missing Phase 7 guardrail docs required by `prompt.md`:
  `docs/agents/asset-selection.md`, `docs/agents/no-hackjob-rules.md`,
  `docs/agents/game-example-standards.md`, and
  `docs/agents/rendering-proof-required.md`. This is a guardrail-doc creation
  proof only; it does not close the full docs/release reopen task.
~~- [x] Regenerate or demote `docs/project/showcase-launch-evidence.json`; the
  current file is generated from `tools/showcase-library/build-and-check.mjs`,
  includes the canonical route-gate config hash, carries per-route
  route-health summaries, and is explicitly `ok: false` because strict release
  deploy checks fail for all 10 non-index routes. This closes stale launch
  evidence masquerading as proof; it does not make any route release-ready.
  Proof: `node tools/showcase-library/build-and-check.mjs` regenerated
  `docs/project/showcase-launch-evidence.json` and
  `tests/reports/showcase-library-build-deploy.json`, exited 1 with every
  non-index route listed as failed, and
  `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
  passed 5/5.~~

## Current Six-Workstream P0 Task Matrix - 2026-06-20

This matrix is the current actionable audit output. It supersedes older
historical completion language unless the same item is repeated above with
current root-only proof. These tasks are recovery work for Aura3D, not a plan to
abandon or replace the project.

### Renderer, Materials, HDR, Shadows, Postprocess

Status: root typed-GLB rendering is partially proven; full public root renderer
quality is not.

~~- [x] Root material/PBR contract audited and constrained. Browser evidence now
  proves root `createAuraApp` base color, limited metallic/roughness material
  contrast, and emissive color/intensity from root-only imports, while
  base-color texture inventory, alpha/glass, `material.physical`,
  `material.chrome`, and `material.glass` are marked partial, and normal-map,
  double-sided, and clearcoat rendered-feature claims remain unsupported in the
  retained root material contract. This does not prove HDR/IBL, shadows, or
  postprocess. Proof:
  `pnpm exec playwright test tests/browser/createAuraApp-material-pbr-contract.spec.ts --reporter=line`
  passed;
  `pnpm exec vitest run tests/unit/docs/material-claims.test.ts --reporter=dot`
  passed;
  `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=dot`
  passed;
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts tests/unit/asset-index/cli-pull-bridge.test.ts tests/unit/package-dist --reporter=dot`
  passed;
  `pnpm typecheck:raw` passed;
  `git diff --check -- packages/engine/src/agent-api/index.ts tests/browser/createAuraApp-material-pbr-contract.spec.ts tests/browser/createAuraApp-material-pbr-contract-harness.ts tests/browser/createAuraApp-material-pbr-contract-harness.html tests/unit/docs docs/rendering/material-matrix.md docs/concepts/rendering.md docs/project/createAuraApp-production-bridge-architecture.md README.md llms.txt prompt.md Fixed-Needed-PRD.md tests/reports/createAuraApp-material-pbr-contract`
  passed.~~
- [ ] Add controlled root texture on/off proof for base-color textures and
  texture-enabled material variants; the current root material contract records
  texture metadata and a rendered textured asset as partial only.
- [ ] Add `tests/browser/createAuraApp-hdr-ibl-contract.spec.ts` to prove or
  keep blocked root environment-lighting/HDR/IBL claims with before/after
  screenshots and runtime backend/fallback evidence.
- [ ] Add `tests/browser/createAuraApp-shadow-contract.spec.ts` to prove or keep
  blocked actual shadow-map/contact-shadow pixels, not just configured
  `shadows.enabled` diagnostics.
- [ ] Add `tests/browser/createAuraApp-postprocess-contract.spec.ts` to prove or
  keep blocked bloom/AO/DOF/fog/FXAA/TAA/color-grade pass names and pixel deltas.
- [ ] Audit `packages/engine/src/agent-api/index.ts` material helpers and
  capability catalog so `material.pbr`, `material.physical`, `material.glass`,
  `material.clearcoat`, `material.chrome`, and similar names cannot imply
  stronger public support than root pixels prove.
- [ ] Update `docs/project/createAuraApp-production-bridge-architecture.md`,
  `docs/rendering/material-matrix.md`, `docs/rendering/environment-lighting.md`,
  `docs/rendering/postprocess.md`, `README.md`, and `llms.txt` so every renderer
  claim is labeled as `createAuraApp` root proof, `production-runtime`,
  rendering internals, prototype, or roadmap.
- [ ] Add a docs guard test that fails public docs/examples claiming root
  PBR/HDR/WebGPU/postprocess/shadow parity when the cited evidence is only a
  lower-level `packages/rendering` or production-runtime test.

### Asset CLI, Provenance, Probes, Release Gates

Status: release metadata exists, but public publishing can still bypass it.

~~- [x] Update `packages/aura3d-cli/src/index.ts` `checkDeploy` to accept and
  pass `release`, `source`, and `assetIds`, and to call
  `validateAssets({ release: true, source, assetIds })` for public/example
  deploy gates. Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/deployment.test.ts tests/unit/aura3d-cli/assets.test.ts --reporter=dot`
  passed 24/24; `pnpm typecheck:raw` passed.~~
~~- [x] Update `packages/aura3d-cli/src/cli.ts` so `check-deploy --release
  --source <path> --asset <id>` is parsed and documented. Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/deployment.test.ts tests/unit/aura3d-cli/assets.test.ts --reporter=dot`
  passed 24/24; `pnpm typecheck:raw` passed.~~
- [ ] Finish `tools/showcase-library/build-and-check.mjs` strict release/source
  validation for public routes. Local strict CLI invocation and generated
  launch evidence are now wired, but this remains open until current primary
  assets pass release validation and mounted route-health agrees with source,
  screenshots, README, and docs.
  - [x] Partial: launch evidence is regenerated from the strict build/deploy
    checker with the canonical route-gate hash, per-route route-health
    summaries, strict deploy commands, and full deploy warning/failure arrays
    parsed before stdout truncation. Current generated evidence is correctly
    `ok: false`: all 10 non-index routes build, but strict deploy checks fail.
    Blocking categories include missing release quality grades, intended roles,
    suitability reasons, rendered probes, orientation metadata, durable
    provenance on some assets, no-texture/material readability warnings,
    excessive scale mismatch, oversized assets, and duplicate hashes without
    duplicate-ok provenance. Proof:
    `docs/project/showcase-launch-evidence.json`,
    `tests/reports/showcase-library-build-deploy.json`,
    `tools/showcase-library/build-and-check.mjs`, and
    `tests/unit/tools/showcase-route-gates.test.ts`; command
    `node tools/showcase-library/build-and-check.mjs` exited 1 with failed
    routes listed, `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
    passed 5/5, `node --check tools/showcase-library/build-and-check.mjs`, and
    `pnpm typecheck:raw` passed.
~~- [x] Preserve hosted catalog semantic/quality ranking through
  `packages/asset-index/src/CanonicalAsset.ts`,
  `packages/asset-index/src/adapters/aura-index.ts`,
  `packages/asset-index/src/ranking.ts`, and
  `packages/aura3d-cli/src/pull-bridge.ts`; do not discard worker score,
  source-page, license, author, download URL, bounds/dimensions, triangle,
  mesh/material/texture counts, animation clips, skin/skeleton, morph, role,
  quality warning, duplicate-hash, raw catalog, or post-download inspection
  metadata. `assets resolve` now ranks candidates, preserves score
  reasons/penalties and provenance/inspection/quality metadata, rejects
  duplicate-hash candidates without an allowlist, rejects blocking
  post-download inspection contradictions, falls through to the next candidate,
  and records resolved assets as `candidate` rather than `release`.
  Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/asset-index --reporter=dot`
  passed 156/156;
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts --reporter=dot`
  passed 48/48;
  `pnpm typecheck:raw` passed; and
  `git diff --check -- packages/aura3d-cli/src/index.ts packages/aura3d-cli/src/cli.ts packages/aura3d-cli/src/pull-bridge.ts packages/aura3d-cli/package.json pnpm-lock.yaml packages/asset-index/src/CanonicalAsset.ts packages/asset-index/src/adapters/aura-index.ts packages/asset-index/src/federate.ts tests/unit/aura3d-cli/assets.test.ts prompt.md Fixed-Needed-PRD.md`
  passed. This does not fix showcase route assets or mark Phase 3 complete.~~
~~- [x] Package/dist parity for CLI and root gates is proven from built package
  artifacts, not only workspace source imports. The authoritative repo build
  (`pnpm build:raw`, also reached by `pnpm --filter @aura3d/engine build`)
  emits finalized package-local dist outputs; the leaf `@aura3d/assets`,
  `@aura3d/asset-index`, and `@aura3d/cli` package manifests currently have no
  local `build` scripts. Built-artifact tests prove
  `readRenderedProbeMetadata`, `validateAssets`, rendered-probe rejection,
  role-aware release validation, AST source validation, pull-bridge scoring
  exports, compiled extracted modules, asset-index metadata preservation, root
  engine exports, and built CLI bin help surface. Proof:
  `pnpm build:raw` passed; `pnpm --filter @aura3d/engine build` passed;
  `pnpm exec vitest run tests/unit/package-dist --reporter=dot` passed 4/4;
  `node packages/aura3d-cli/dist/cli.js --help` passed;
  `node packages/aura3d-cli/dist/cli.js assets add --help` passed;
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts tests/unit/asset-index/cli-pull-bridge.test.ts --reporter=dot`
  passed 95/95; `pnpm typecheck:raw` passed; and
  `git diff --check -- packages/aura3d-cli packages/asset-index packages/engine packages/assets tests/unit/package-dist tests/unit/aura3d-cli tests/unit/asset-index prompt.md Fixed-Needed-PRD.md`
  passed. This does not fix showcase route assets, route-primary probe
  generation, or mark Phase 3 complete.~~
~~- [x] Add route-primary probe generation and strict evidence gating for
  published typed showcase routes. Browser tests now load routes from the
  canonical route-gates config, capture retained per-route screenshots and JSON
  evidence under `tests/reports/showcase-route-primary-probes/`, record
  source/config/route-health hashes, primary asset ids, route-gate roles,
  expected typed refs, manifest hashes, renderer diagnostics, foreground bounds,
  UI occlusion, primitive-primary candidates, screenshot hashes, and pass/fail
  reasons. `tools/showcase-library/build-and-check.mjs` now requires current
  route-primary probe evidence for strict release checks and fails missing,
  stale, mismatched, or failing route evidence with specific reasons in launch
  evidence. Probe validation recomputes screenshot metrics from retained PNGs,
  and generated launch evidence redacts local absolute/temp paths. This does
  not make showcase routes release-ready; current non-index routes remain
  blocked by retained route-primary probe and deploy evidence. Proof:
  `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
  passed 10/10;
  `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  passed as an evidence-generation run and wrote retained `pass:false` route
  probe artifacts for current failing routes;
  `node tools/showcase-library/build-and-check.mjs` regenerated strict
  `ok:false` build/launch evidence with route-primary probe blockers for all
  non-index showcase routes;
  `pnpm typecheck:raw` passed; and
  `git diff --check -- tools/showcase-library tests/browser tests/unit/tools packages/engine/src/testing packages/aura3d-cli/src prompt.md Fixed-Needed-PRD.md docs/project/showcase-launch-evidence.json tests/reports/showcase-route-primary-probes`
  passed.~~
~~- [x] Full showcase recovery batch updated shared route-primary evidence and
  route status without fake-green results. `showcase-product-configurator` and
  `showcase-material-asset-inspector` now pass route-primary, build, and
  release/deploy evidence and are classified as bounded candidate public
  showcase routes. `showcase-data-galaxy`, `showcase-smart-city-control`,
  `showcase-cinematic-architecture`, `showcase-digital-twin-ops`,
  `showcase-webgpu-particle-lab`, `showcase-blockfall-reactor`,
  `showcase-skyline-runner`, and `showcase-turbo-drift-circuit` remain
  non-public prototype/blocked/rebuild-required routes with retained blockers.
  Route-primary proof now uses unobstructed canvas analysis crops and
  component foreground selection so UI panels/stage planes do not masquerade as
  primary-asset proof; `showcase-material-asset-inspector` was repaired by
  removing decorative foreground planes from the default evidence view. Proof:
  `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  passed and regenerated retained route evidence;
  `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
  passed 11/11;
  `node tools/showcase-library/build-and-check.mjs || true` regenerated
  `ok:false` launch/build evidence because eight routes remain blocked;
  `pnpm typecheck:raw` passed. This fixes two public showcase route candidates,
  keeps the rest honestly blocked, and does not complete Phase 8.~~
~~- [x] Batch closure moved the current public showcase green count from three
  to five without fake-green status. `showcase-turbo-drift-circuit` now uses
  release-validated `showcaseTexturedSportsCar` instances plus
  `showcaseTsukubaCircuit`; the unsuitable `showcaseRaceCar` is no longer part
  of the public primary route contract. `showcase-blockfall-reactor` now has a
  readable, unclipped retained route-primary cabinet foreground and release
  validation for the declared arcade assets. Current green routes are
  `showcase-product-configurator`, `showcase-material-asset-inspector`,
  `showcase-smart-city-control`, `showcase-turbo-drift-circuit`, and
  `showcase-blockfall-reactor`. `showcase-data-galaxy`,
  `showcase-cinematic-architecture`, `showcase-digital-twin-ops`,
  `showcase-webgpu-particle-lab`, and `showcase-skyline-runner` remain blocked
  by retained route-primary and/or deploy evidence. Proof:
  `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  passed;
  `pnpm exec playwright test tests/browser/showcase-gameplay-proof.spec.ts --reporter=line`
  passed;
  `pnpm exec playwright test tests/browser/showcase-release-asset-probes.spec.ts --reporter=line`
  passed;
  `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
  passed 12/12;
  `node tools/showcase-library/build-and-check.mjs || true` now fails only the
  five blocked routes listed above;
  `pnpm typecheck:raw` passed; root regression Vitest and the root material
  contract Playwright test passed.~~
~~- [x] Single-route repair for `showcase-product-configurator` completed
  without fake-green status. The route passes retained route-primary probe
  evidence for `assets.showcaseHeadphones`, and `showcaseHeadphones` now has
  release quality, product role, suitability reason, renderedProbe metadata,
  and a hash-bound product-view manifest orientation override tied to the
  current retained product PNG and current asset hash. Release/deploy validation
  accepts that durable override without claiming the source GLB embeds
  `aura3d.orientation.forwardAxis`. Proof:
  `pnpm exec playwright test tests/browser/showcase-route-primary-probes.spec.ts --reporter=line`
  passed and generated `tests/reports/showcase-route-primary-probes/showcase-product-configurator.json`
  with `pass:true`;
  `pnpm exec tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts check-deploy --dist apps/showcase-product-configurator/dist --release --source apps/showcase-product-configurator/src --asset showcaseHeadphones`
  passed;
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts --reporter=dot`
  passed 47/47;
  `node tools/showcase-library/build-and-check.mjs || true` regenerated product
  launch evidence with route-primary, build, and deploy passing while other
  routes remain blocked. This does not fix other routes and does not complete
  Phase 8.~~
~~- [x] Strengthen `renderedProbe` in `packages/aura3d-cli/src/index.ts` from
  file existence to decoded image proof: dimensions, nonblank pixels, image
  hash, asset hash, route/renderer metadata, and stale-probe detection. Release
  validation now rejects fake placeholder buffers and accepts only decoded PNG
  probes with matching metadata. This does not close the separate `assets
  probe` command or route-primary probe regeneration tasks. Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts --reporter=dot`
  passed 29/29, including fake-buffer, corrupt-PNG, stale image-hash,
  stale asset-hash, stale dimension, stale nonblank, and stale color-bucket
  rejection coverage; `pnpm typecheck:raw` passed; and
  `git diff --check -- packages/aura3d-cli/src/index.ts tests/unit/aura3d-cli/assets.test.ts`
  passed.~~
~~- [x] Add an `assets probe --asset <id> --out ...` command or equivalent
  browser fixture that renders the selected typed asset through root
  `createAuraApp`, captures retained screenshot artifacts, writes
  `renderedProbe` metadata, and feeds release validation. Proof:
  `tests/browser/createAuraApp-asset-probe.spec.ts`,
  `tests/browser/createAuraApp-asset-probe-harness.ts`,
  `tests/reports/createAuraApp-asset-probe/robotcand.probe.json`,
  `tests/reports/createAuraApp-asset-probe/robotcand.probe.png`;
  `pnpm exec playwright test tests/browser/createAuraApp-asset-probe.spec.ts --reporter=line`
  passed; `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts --reporter=dot`
  passed 29/29.~~
~~- [x] Replace regex-only source validation with TypeScript AST coverage for
  typed asset aliases/destructuring/wrappers and inline primitive primary
  substitutions. The release/source validator now detects raw model strings,
  raw GLB/GLTF URLs, unsafe model URLs, forbidden Three.js/GLTFLoader imports,
  direct typed assets, typed aliases, destructured typed assets,
  wrapper-returned typed models, primitive-primary declarations, and mixed
  typed+primitive-primary scenes. Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts --reporter=dot`
  passed 48/48; `pnpm typecheck:raw` passed; and
  `git diff --check -- packages/aura3d-cli/src/index.ts packages/aura3d-cli/src/cli.ts tests/unit/aura3d-cli/assets.test.ts prompt.md Fixed-Needed-PRD.md`
  passed. This does not fix showcase route assets or mark Phase 3 complete.~~
~~- [x] Make release asset quality role-aware: character height/readability,
  vehicle footprint/orientation, product readability, track/world extent,
  orientation, textures/materials, foreground bounds, abstract/debug primary
  misuse, and explicit normalization evidence for intentionally large worlds.
  Proof:
  `pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts --reporter=dot`
  passed 36/36; `pnpm typecheck:raw` passed; and
  `git diff --check -- packages/aura3d-cli/src/index.ts packages/aura3d-cli/src/cli.ts tests/unit/aura3d-cli/assets.test.ts prompt.md Fixed-Needed-PRD.md`
  passed. This does not fix showcase route assets or mark Phase 3 complete.~~
- [ ] Create one shared showcase route gate config consumed by
  `tests/browser/showcase-library.spec.ts` and
  `tools/showcase-library/build-and-check.mjs` so primary assets cannot diverge
  between browser tests, deploy checks, route-health, launch evidence, and docs.
  - [x] Partial: canonical JSON is now consumed by build checks, Vite, and
    browser tests; generated browser reports include config path/schema/hash;
    and unit coverage proves declared primary assets are in `aura.assets.json`,
    `src/aura-assets.ts`, and route source. This does not close mounted
    runtime route-health, launch-evidence, or docs consumers yet. Proof:
    `tools/showcase-library/route-gates.json`,
    `tools/showcase-library/route-gates.mjs`,
    `tools/showcase-library/vite.config.ts`,
    `tests/browser/showcase-library.spec.ts`, and
    `tests/unit/tools/showcase-route-gates.test.ts`; command
    `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
    passed 3/3, `pnpm typecheck:raw` passed, and `git diff --check -- prompt.md Fixed-Needed-PRD.md tools/showcase-library/route-gates.mjs tools/showcase-library/build-and-check.mjs tools/showcase-library/vite.config.ts tests/browser/showcase-library.spec.ts tests/unit/tools/showcase-route-gates.test.ts`
    passed.
  - [x] Partial: static route-health and showcase-index metadata now consume the
    canonical route gate contract for published routes. `build-and-check.mjs`
    fails route-health drift for app id, route, evidence global, source-review
    path, and primary asset refs; the unit gate covers published route-health
    files, showcase-index entries, and blocked unpublished route-health files.
    Stale Turbo/Skyline route-health asset refs were corrected. This does not
    close mounted runtime route-health, launch evidence, README agreement,
    screenshots, or docs consumers. Proof:
    `tools/showcase-library/build-and-check.mjs`,
    `tests/unit/tools/showcase-route-gates.test.ts`,
    `apps/showcase-turbo-drift-circuit/route-health.json`,
    `apps/showcase-skyline-runner/route-health.json`; command
    `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
    passed 4/4; `node --check tools/showcase-library/build-and-check.mjs`,
    `pnpm typecheck:raw`, and `git diff --check -- tests/unit/tools/showcase-route-gates.test.ts tools/showcase-library/build-and-check.mjs apps/showcase-turbo-drift-circuit/route-health.json apps/showcase-skyline-runner/route-health.json`
    passed.
  - [x] Partial: generated launch evidence is now bound to the same route-gate
    config hash, route ids, route paths, globals, primary assets, primitive
    budgets, route-health primary asset refs, and route-health globals. The unit
    guard fails if deploy checks fail without retained warning/failure details.
    Proof: `tests/unit/tools/showcase-route-gates.test.ts` and
    `docs/project/showcase-launch-evidence.json`; command
    `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`
    passed 5/5.
- [ ] Update `docs/api/assets.md`, `docs/agents/asset-workflow.md`,
  `docs/agents/asset-selection.md`, `docs/project/showcase-quality-gates.md`,
  `README.md`, and `llms.txt` to state that `assets resolve` creates a typed
  candidate only; public examples require `assets validate --release --source`
  plus rendered probe proof.

### Game Runtime And Playable Routes

Status: public game kits exist; current game routes are not release-proof games.

- [ ] Add a built-package root smoke test proving `@aura3d/engine` exports and
  can call `game.platformer`, `game.racing`, `game.fallingBlocks`,
  `game.inputReplay`, and `game.collisionWorld`.
- [ ] Add independent browser progression tests that do not trust route-local
  toy proof methods or autoplay completion.
- [ ] Turbo gate: drive ordered checkpoints, at least one full lap/race
  completion, reset after completion, off-track penalty behavior, readable
  start/mid/finish screenshots, and an explicit fail/no-fail classification.
- [ ] Skyline gate: drive the current level to completion, prove respawn/reset
  after hazard/fall, capture mid-route and finish screenshots, and remove any
  zero-death/completion copy unless current live proof passes.
- [ ] Blockfall gate: run a deterministic 60-second browser replay through
  public input or public kit actions, proving move, rotate, hold, line clear,
  scoring, level progression, game-over, and reset.
- [ ] Add route-health consistency tests comparing source asset keys, renderer
  mode, route-health, README, launch evidence, screenshots, and mounted runtime
  evidence for Turbo, Skyline, Blockfall, and every public game route.
  - [x] Partial: static published-route metadata is now guarded against route
    gate drift for route-health primary assets/globals and showcase-index route
    entries. Mounted runtime route-health, README, launch evidence, screenshots,
    renderer-mode assertions, and long-play game evidence remain open.
    Proof: `tests/unit/tools/showcase-route-gates.test.ts` passed 4/4 with
    `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot`.
- [ ] Update `docs/api/game-runtime.md` and `docs/guides/build-a-browser-game.md`
  to distinguish real root genre APIs from route-specific level content, art
  sync, HUDs, proof replays, and long-play validation.

### Particles, Effects, And WebGPU Claims

Status: Aura3D/WebGL2 particles can be proven; native WebGPU claims remain
blocked for public root routes.

- [ ] Fix `tests/browser/showcase-library.spec.ts` evidence waits so
  route-health and particle claim reports capture after `frameCount > 0`,
  `drawCalls > 0`, and nonzero render size.
- [ ] Split the particle route test into a mode matrix: `vortex`, `fountain`,
  and `field` at the same density, plus density changes inside one mode; persist
  screenshots and pairwise pixel deltas.
- [ ] Add public mounted particle diagnostics in
  `packages/engine/src/agent-api/index.ts` if current `app.diagnostics()` does
  not expose actual effect count, rendered particle count, mode, backend, draw
  calls, and explicit non-WebGPU fallback state.
- [ ] Regenerate `tests/reports/showcase-particle-claim-guards.json` only after
  mounted runtime wait conditions are fixed.
- [ ] Keep `apps/showcase-webgpu-particle-lab/route-health.json` classified as
  prototype/non-native-WebGPU unless adapter/backend/dispatch/render/pixel proof
  exists.
- [ ] Fix or demote every blocker in `tools/effects-vfx-visual-audit/index.ts`;
  `pnpm check:effects-vfx` cannot be used as release proof while its report has
  blocker failures.
- [ ] Reconcile `tools/webgpu-completion-audit/index.ts`,
  `docs/rendering/webgpu-route-and-report-evidence.md`, `index.html`, and the
  actual route registry. Missing WebGPU reports mean WebGPU stays conditional
  and non-public for root examples.

### Docs, Claims, Tutorials, Templates, PRD Cleanup

Status: canonical guardrail docs exist, but stale broad claims still remain.

- [ ] README P0 pass: rewrite current-release, use-case, Aura Clash, WebGPU,
  animation, game, and example sections so every capability is labeled by
  actual implementation path and evidence. This includes the current-release
  bullets around README lines 107-117 and npm/latest/all-packages/deployed-host
  wording; every claim must cite root proof, package-internal proof,
  CLI-pipeline proof, template-only scope, prototype scope, or roadmap scope.
- [ ] Demote `docs/examples/world-war-x-showcase.md` to legacy/archive context
  and prevent its copy from re-entering public marketing or agent docs.
- [ ] Correct `apps/aura-clash-showcase/README.md` so it says development
  showcase/runtime proof target, not flagship/deploy-ready, until its visual,
  gameplay, asset, performance, deployment, accessibility, and docs gates pass.
- [ ] Rewrite `docs/project/tutorials-getting-started-real-scene.md` to use CLI
  asset add/resolve, generated `src/aura-assets.ts`, `model(assets.x)`, and
  `createAuraApp`; move `loadRenderableAsset`/advanced-runtime fixture examples
  to an internal renderer-development section.
- [ ] Split `docs/api/public-api.md` into agent-safe root API,
  package/internal diagnostics, and migration/Three-compat sections. Add
  warnings next to `GLTFLoader`, `loadRenderableAsset`, `Renderer`,
  `advanced-runtime`, `unsafeModelUrl`, and Three-compat exports.
- [ ] Correct `docs/api/assets.md` so it distinguishes current validator scope
  from still-open release gaps: route-primary probe generation,
  package/dist parity, shared route gate config, strict launch evidence, and
  current primary asset failures.
- [ ] Add package README boundaries to `packages/rendering/README.md` and
  `packages/assets/README.md`: package APIs are library internals, not public
  agent-safe example APIs unless root-only browser evidence is linked.
- [ ] Clamp animation template READMEs so primitive character fallbacks are
  internal placeholders only, never public screenshot or publish evidence. This
  includes `packages/create-aura3d/templates/character-controller/README.md`
  and any generated-template copies.
- [ ] Clamp production/cinematic template READMEs so HDR/IBL/postprocess/bloom
  language is template/runtime intent until typed assets, route-health,
  desktop/mobile screenshots, and pixel-backed evidence pass. Review at least
  `templates/production-material-studio/README.md`,
  `templates/production-product-configurator/README.md`,
  `templates/production-product-viewer/README.md`,
  `templates/production-architecture-viewer/README.md`,
  `templates/production-asset-inspector/README.md`,
  `templates/cinematic-scene/README.md`, and
  `packages/create-aura3d/templates/cinematic-scene/README.md`.
- [ ] Clamp product-viewer template README claims for contact shadows, softbox
  lighting, PBR, and asset-inspection proof in `templates/product-viewer/README.md`,
  `packages/create-aura3d/templates/product-viewer/README.md`,
  `templates/external-parity-product-viewer/README.md`, and generated-template
  copies until root-only browser evidence exists.
- [ ] Demote WebGPU docs wording from first-class public product surface to
  conditional report-backed surface until the current checkout has required
  route, hardware, fallback, dispatch, render, screenshot, and completion
  evidence.
- [ ] Fix `docs/agents/cinematic-scene-quality.md` so named robots,
  characters, products, vehicles, worlds, weapons, and hero props require
  CLI-registered typed assets before public/demo claims.
- [ ] Tighten `docs/examples/advanced-gallery.md` and
  `apps/advanced-examples-gallery/README.md`; advanced-gallery routes are
  retained engine evidence, not root `createAuraApp` public proof by default.
- [ ] Correct `apps/showcase-skyline-runner/README.md` and
  `apps/showcase-turbo-drift-circuit/README.md` so completion/lap/gameplay
  proof wording is removed or marked prototype until current browser route
  reports prove long-play progression, fail/retry, reset, screenshots, and
  mounted runtime evidence.
- [ ] PRD historical-checkbox cleanup: mark Workstream C/D/E checked acceptance
  lists as historical unless repeated in this reopened section with current
  evidence.

### Route Health, Launch Evidence, Showcase Consistency

Status: showcase source is less hacky than the screenshots implied, but the
evidence system is too weak and stale.

- [ ] Extend `packages/engine/src/testing/routeHealth.ts` and route-health
  generation to report source hash, route hash, renderer mode, fallback state,
  draw calls, primary assets, asset roles, primitive counts, primitive roles,
  screenshots, claims, provenance, game evidence, and stale-source detection.
- [ ] Update `tools/current-routes-route-health/index.ts` and
  `tests/browser/current-routes-route-health.spec.ts` to include public showcase
  routes, not only starter routes.
- [ ] Add consistency checks across `src/main.ts`, `route-health.json`, README,
  showcase index data, `docs/project/showcase-launch-evidence.json`,
  `aura.assets.json`, and generated reports. Skyline and Turbo should fail
  until their stale asset and renderer-mode references are corrected.
- [ ] Replace stale launch evidence containing `/var/folders/...` provenance or
  old asset names. Public launch evidence must be regenerated from current
  source, strict asset gates, mounted route-health, and screenshot reports.
- [ ] Add route-local hack diagnostics for procedural city/data/world systems,
  exploded proxy internals, deterministic telemetry simulators, HUD-only
  evidence, route-local proof bots, and abstract primitives. Stronger claims are
  blocked unless diagnostics prove the actual Aura scene supports them.

Legacy checkbox rule:

Any older checked item below is historical unless it is repeated in this
reopened section with current root-only proof. In particular, broad checked
claims about root production PBR/HDR/shadows/postprocess/WebGPU parity, current
asset release quality, production-quality game kits, screenshot/readability
gates, and docs/release completion remain reopened until the tasks above pass.

## Honest Current Boundary

### What Aura3D currently does well

- Typed asset manifest workflow through `aura.assets.json` and generated `src/aura-assets.ts`.
- Safe model usage through `model(assets.assetName)` when examples follow the intended API.
- Basic browser route mounting through `createAuraApp`.
- GLB loading for static mesh rendering in the root agent API path.
- Root-proven base-color material rendering; typed texture metadata and rendered
  textured assets remain partial until controlled texture on/off root pixels are
  retained.
- Non-skinned glTF node animation in the root WebGL2 path.
- Runtime nodes, frame updates, transforms, basic primitives, backdrop, labels, and simple effects.
- Internal production-runtime packages contain stronger renderer and typed actor concepts than the root app path currently exposes.

### What Aura3D does not yet deliver through the public root path

- A root `createAuraApp` renderer that uses the full production renderer by default.
- Unsupported: full PBR material parity across public examples.
- HDR/IBL/environment lighting, PMREM-style filtering, production tone mapping, and high-quality shadows.
- Pixel-backed bloom, SSAO, DOF, FXAA/TAA, color grading, or real postprocess evidence through the public safe route.
- Skinned GLB animation in root `createAuraApp` screenshots.
- Morph target rendering in root `createAuraApp` screenshots.
- A production-quality character controller exposed as a public game kit.
- A production-quality racing controller/track-following kit exposed as a public game kit.
- A production-quality platformer kit exposed as a public game kit.
- A generic gameplay collision/sensor world for browser games.
- Asset quality validation is partially strengthened for structured quality
  metadata, rendered probes, missing typed-manifest references, and source-level
  primitive-primary substitutions, but still needs richer material readability
  proof and route-level screenshot gates before showcase release claims are
  allowed.

### Required public claim rule

Any public claim must name the actual path it applies to:

- `createAuraApp` root safe API
- `production-runtime`
- `rendering` package internals
- CLI asset pipeline
- template-only scaffolds
- roadmap or prototype

No doc may imply that root `createAuraApp` supports a production renderer capability unless a browser test imports only `@aura3d/engine`, mounts the route, captures a screenshot, and verifies the rendered pixels.

## Non-Negotiable Product Rules

- Use `llms.txt` as the first agent instruction source.
- Use the public `@aura3d/engine` API unless a task explicitly targets engine internals.
- Do not import `three`, `GLTFLoader`, or raw renderer internals in examples intended to prove the agent-facing Aura3D API.
- Do not invent assets.
- Acquire real GLB/glTF assets through the Aura3D CLI:

```bash
npx @aura3d/cli@latest assets add ./assets/model.glb --name model
```

- Import generated typed assets from `./src/aura-assets`.
- Use `model(assets.modelName)`, never string asset IDs, in safe examples.
- Primitives are allowed for set dressing, collision guides, debug markers, HUD anchors, and simple abstract visualization only.
- Primitives are not allowed to stand in for the main character, vehicle, world, hero product, creature, weapon, or primary environment when the example claims a real-world or game experience.
- CSS, DOM, and canvas overlays cannot be the scene. They can be UI, but not fake particles, fake 3D effects, fake labels, or fake rendering evidence.
- A showcase route is not acceptable unless screenshots prove that the main subject is readable at first load.
- A game route is not acceptable unless keyboard input visibly changes game state and automated tests prove movement, restart, and at least one win/fail/scoring loop.
- A WebGPU claim is not acceptable unless capability state, renderer backend, compute dispatches, and pixels are all verified.
- A skinned-character claim is not acceptable unless a real skinned GLB animation is pixel-backed in a screenshot or video capture.

## Workstream A: Aura3D Library Fixes

### A1. Root `createAuraApp` Production Renderer Bridge

Priority: P0  
Owner area: `packages/engine`, `packages/rendering`

Problem:

The public root `@aura3d/engine` path used by agents does not currently expose the full production renderer. It uses a custom WebGL2 scene renderer that supports typed GLBs and basic rendering, but not the production renderer feature set implied by some docs and desired examples.

Primary files to inspect or change:

- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/production-runtime/TypedGLBActor.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/index.ts`

Required tasks:

- [x] Create a root safe API adapter that converts `createAuraApp` scene descriptors into production-runtime render sources.
- [x] Decide whether `createAuraApp` should default to production runtime or expose an explicit `renderer: "production"` option.
- [x] Ensure the adapter still preserves typed asset safety and does not allow raw string asset IDs.
- [x] Support typed GLB actors as first-class public route objects.
- [x] Remove duplicated renderer behavior from the monolithic agent API once the production bridge is stable.
- [x] Add browser tests that import only `@aura3d/engine` and prove production renderer features from the public API.
- [x] Document exact fallback behavior when production runtime is unavailable.

Acceptance checks:

- [x] `createAuraApp` can render a typed GLB through the production bridge.
- [x] The same route can be screenshot-tested without importing renderer internals.
- [x] A root safe API route can opt into documented quality profiles.
- [x] No public example imports renderer internals to get production visuals.

### A2. Animation, Skinning, and Morph Rendering

Priority: P0/P1  
Owner area: `packages/animation`, `packages/engine`, `packages/rendering`

Problem:

Root examples can show simple node TRS animation, but the visible showcase failures show that character/game examples need real skinned animation and animation state machines. Existing animation modules are not fully connected to the public root renderer path.

Primary files to inspect or change:

- `packages/animation/src/index.ts`
- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/production-runtime/TypedGLBActor.ts`
- `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts`
- `docs/animation/runtime-support.md`
- `docs/rendering/skinning-and-morphs.md`

Required tasks:

- [x] Expose a public typed animation API for `model(assets.character)` instances.
- [x] Bind glTF skins to renderable actor state in the production bridge.
- [x] Bind glTF animation clips to actor transforms and skeletal pose.
- [x] Support clip playback controls: play, pause, loop, crossfade, speed, seek.
- [x] Support basic locomotion state: idle, run, jump, fall, land, hit.
- [x] Support morph targets where advertised. Evidence: `pnpm exec playwright test tests/browser/createAuraApp-morph-targets.spec.ts --reporter=line` and `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` pass after wiring typed GLB morph target names through `TypedGLBActor.applyMorphTargets(...)`, production runtime node snapshots, imported asset evidence, and a CLI-added typed `assets.showcaseMorphExpression` pixel proof.
- [x] Add screenshot tests proving a skinned model changes pose over time.
- [x] Add keyboard-driven animation tests for a public game route.

Acceptance checks:

- [x] A skinned GLB character visibly animates in a root `createAuraApp` route.
- [x] A screenshot pair at frame N and frame N+X has meaningful pixel difference on the character, not only camera/UI movement.
- [x] Docs state exactly which animation features are public, experimental, and internal.

### A3. Asset CLI Provenance and Quality Gates

Priority: P0/P1  
Owner area: CLI, asset pipeline, generated typed assets

Problem:

The asset workflow is typed, but current validation does not hard-block enough bad behavior. It does not scan source for unsafe model strings or primitive stand-ins, and local manifests can contain temp-path provenance that is not durable evidence.

Primary files to inspect or change:

- `packages/cli`
- `packages/assets/src/AssetInspection.ts`
- `packages/assets/src/ProductionAssetCorpus.ts`
- `packages/asset-index/src/adapters/aura-index.ts`
- `aura.assets.json`
- `src/aura-assets.ts`
- `docs/api/assets.md`
- `docs/agents/asset-workflow.md`

Required tasks:

- [x] Add `assets validate --source` to scan app source for `model("...")`, raw GLB URLs, `unsafeModelUrl`, `GLTFLoader`, and direct renderer asset hacks.
- [x] Add `assets validate --release` to turn warnings into blocking failures for showcase/release builds.
- [x] Reject temp-path provenance such as `/var/folders/.../T/aura3d-resolve-*` unless explicitly marked local-only.
- [x] Store durable source page, download URL, license name, license URL, author, and acquisition timestamp for catalog assets.
- [x] Preserve exact license variants from the hosted catalog.
- [x] Reject duplicate asset hashes unless an allowlist explains why duplication is intentional.
- [x] Reject placeholder-like assets for primary roles: tiny bounds, no material, unreadable material, excessive scale mismatch, or no texture where texture is expected.
- [x] Use loader-backed inspection for bounds, node counts, material counts, texture counts, animation clips, skins, morphs, and scene hierarchy.
- [x] Render asset thumbnails/probes for release validation.
- [x] Fix any unsafe model warning ID mismatch so diagnostics catch the actual unsafe path.
- [x] Reformat generated `src/aura-assets.ts` to be reviewable.

Acceptance checks:

- [x] A public showcase build fails if it uses a raw string asset ID.
- [x] A public showcase build fails if primary world/character/vehicle is only primitives.
- [x] A public showcase build reports exact source/license evidence for every primary asset.
- [x] A reviewer can tell which files use which typed assets from generated metadata.

### A4. Game Runtime Kits and Playability

Priority: P0/P1  
Owner area: `packages/engine`, game runtime, templates, examples

Problem:

The original game story was mostly route-local logic. Aura3D now has source-level platformer, racing, falling-block, and collision kits; remaining work is browser starter coverage, route migration, and genre-specific visual/gameplay proof.

Primary files to inspect or change:

- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/game`
- `packages/physics`
- `templates/mini-game`
- `docs/api/game-runtime.md`
- `docs/guides/build-a-browser-game.md`
- `docs/project/game-runtime-release.md`
- `apps/showcase-blockfall-reactor/src/main.ts`
- `apps/showcase-skyline-runner/src/main.ts`
- `apps/showcase-turbo-drift-circuit/src/main.ts`

Required tasks:

- [x] Add a generic `game.collisionWorld` or equivalent public API.
- [x] Add overlap, sweep, resolution, sensor enter/stay/exit, and tag/layer filtering.
- [x] Add a platformer kit with gravity, coyote time, jump buffer, slopes or ledges, moving platforms, checkpoints, hazards, coins, and completion.
- [x] Add a racing kit with route spline, car controller, steering, throttle/brake, drift/boost, checkpoint timing, lap validation, camera follow, reset, and off-track behavior.
- [x] Add a falling-blocks kit with board state, tetromino rotation, wall kicks, hold, bag randomizer, line clears, lock delay, gravity levels, scoring, and deterministic replay.
- [x] Add generic HUD/event/evidence bindings that are not fighting-game-specific.
- [x] Replace or rebuild the `mini-game` template so it is playable on first boot.
- [x] Fix docs that reference non-existent or invalid runtime methods.

Acceptance checks:

- [x] Platformer starter is playable with keyboard and passes automated input tests.
- [x] Racing starter is playable with keyboard and passes automated checkpoint/lap tests.
- [x] Falling-block starter is playable with keyboard and passes movement/rotation/line-clear tests.
- [x] Routes do not need custom ad hoc collision engines for basic game behavior. Evidence: Skyline, Turbo, and Blockfall now route live gameplay through public `game.platformer`, `game.racing`, and `game.fallingBlocks` kits; `tests/unit/game-runtime/game-runtime-source-gates.test.ts` blocks route-local engine regressions; `pnpm exec playwright test tests/browser/showcase-library.spec.ts --grep "game routes respond" --reporter=line`, `pnpm exec vitest run tests/unit/game-runtime/game-runtime-source-gates.test.ts --reporter=dot`, and `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false` pass.

### A5. Materials, Lighting, Effects, and WebGPU Truth

Priority: P0/P1  
Owner area: rendering, examples, docs

Problem:

Some docs and examples imply high-end rendering or WebGPU behavior without hard evidence. The public examples need either real support or explicit demotion.

Primary files to inspect or change:

- `packages/rendering/src`
- `packages/engine/src/agent-api/index.ts`
- `docs/rendering/material-matrix.md`
- `docs/rendering/postprocess.md`
- `docs/concepts/rendering.md`
- `docs/project/known-limits.md`
- `apps/showcase-webgpu-particle-lab/src/main.ts`
- `apps/showcase-data-galaxy/src/main.ts`

Required tasks:

- [x] Define public quality profiles: `safe-basic`, `production`, `cinematic`, and `experimental-webgpu` or similar.
- [x] Expose material capability diagnostics from the public API.
- [x] Add explicit material support matrix for base color, metallic-roughness, normal maps, emissive maps, alpha, double-sided, transmission, clearcoat, sheen, and variants.
- [x] Add environment lighting and shadows only when pixel-backed tests exist. Evidence: `tests/browser/rendering-canonical-scene.spec.ts` captures `tests/reports/engine-readiness-canonical-scene/canonical.png`, `material-variant.png`, and `shadow-toggle.png`; it requires `environment-lighting` and `directional-shadow` in rendered diagnostics and asserts the lighting/shadow variants change screenshot hashes. `pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line` passes.
- [x] Add postprocess only when screenshot tests prove it affects pixels. Evidence: `tests/browser/rendering-canonical-scene.spec.ts` captures `tests/reports/engine-readiness-canonical-scene/postprocess-toggle.png` and asserts the postprocess toggle changes real screenshot pixels; `tests/browser/rendering-root-quality-gate.spec.ts` proves the full postprocess suite on real renderer pixels and writes `tests/reports/external-parity-root-rendering-quality/postprocess-suite-integrated.png`. `pnpm exec playwright test tests/browser/rendering-canonical-scene.spec.ts --reporter=line` and `pnpm exec playwright test tests/browser/rendering-root-quality-gate.spec.ts --grep "full postprocess suite" --reporter=line` pass.
- [x] Rename or demote WebGPU examples unless actual WebGPU compute/rendering is verified.
- [x] Ensure particle examples use Aura3D particle/runtime APIs, not CSS or DOM particle stand-ins.
- [x] Add capability UI that distinguishes native WebGPU, WebGL fallback, and simulated/fallback particle rendering.

Acceptance checks:

- [x] A WebGPU route cannot say native WebGPU unless adapter/backend/dispatch/render evidence all pass.
- [x] Particle controls visibly change pixel output and telemetry.
- [x] Material examples show real material inputs from asset metadata. Evidence: `tests/browser/product-configurator-material-matrix.spec.ts` renders 28 variants of the same `car-concept` GLB, persists `tests/reports/advanced-examples-gallery/product-material-matrix/product-material-matrix.json`, verifies final cloned material records include node/material binding ownership from asset metadata, checks required material role coverage has no missing roles, and proves selected material mutations change pixels. `tests/unit/tools/advanced-gallery-report-audit.test.ts` also blocks Product material-variant evidence without metadata-backed material-control bindings. `pnpm exec playwright test tests/browser/product-configurator-material-matrix.spec.ts --reporter=line` and `pnpm exec vitest run tests/unit/tools/advanced-gallery-report-audit.test.ts -t "metadata-backed material-control bindings" --reporter=dot` pass.

### A6. Diagnostics and Browser Quality Gates

Priority: P0/P1  
Owner area: tests, diagnostics, CI

Problem:

Current showcase tests mostly prove that routes load. They do not prove that examples are beautiful, readable, playable, animated, or honest.

Primary files to inspect or change:

- `tests/browser/showcase-library.spec.ts`
- `tests/browser`
- `packages/engine/src/agent-api/index.ts`
- `docs/project/verification-evidence.md`
- `docs/project/release-checklist.md`

Required tasks:

- [x] Add screenshot difference checks after keyboard input.
- [x] Add pixel visibility checks for hero model, world model, and UI occlusion.
- [x] Add primitive budget checks per route.
- [x] Add typed primary asset checks per route.
- [x] Add screenshot crop/readability checks for desktop and mobile.
- [x] Add animation proof checks using pixel delta in the model region, not only frame counters.
- [x] Add per-route route-health JSON that declares primary assets, fallback status, primitive count, renderer backend, and claims.
- [x] Fail release if route-health claims exceed detected capability.

Acceptance checks:

- [x] A route can no longer pass only because a screenshot file is large.
- [x] A game can no longer pass if input does not visibly affect gameplay.
- [x] A showcase can no longer pass if the main subject is tiny, hidden, clipped, or primitive-only.

## Workstream B: Markdown and Docs Fix Matrix

Every file below needs either a rewrite, a boundary correction, or a direct reference to the new canonical rules. The output should make it hard for future agents or developers to repeat primitive-heavy, overclaimed showcase work.

### Root and Agent Instruction Files

| File | Priority | Required fix |
| --- | --- | --- |
| `AGENTS.md` | P0 | Expand beyond "read llms.txt". Add hard rules for typed assets, CLI acquisition, no invented assets, no Three.js/GLTFLoader in public examples, no CSS scene effects, primitive limits, one Aura app per route, and renderer boundary. |
| `llms.txt` | P0 | Keep as first-read canonical instruction. Add a short "claims must match public root API evidence" section and link to the new PRD or successor docs. |
| `.github/copilot-instructions.md` | P0 | Mirror compact hard rules from `AGENTS.md` so Copilot-style agents do not generate primitive slop or raw asset IDs. |
| `README.md` | P0 | Promote the existing renderer boundary into a top-level source of truth. Add "what public root API can prove today" versus "production-runtime/internal capability". |
| `QuickFixes.md` | P1 | Remove any quick fixes that encourage local hacks over library fixes. Add links to validation gates. |
| `CONTRIBUTING.md` | P1 | Require typed assets, route-health evidence, browser screenshots, and docs claim review for showcase PRs. |
| `BUNDLE_SIZES.md` | P2 | Add note that production renderer bridge may change bundle size and needs explicit tracking. |

### Agent Docs

| File | Priority | Required fix |
| --- | --- | --- |
| `docs/agents/claims-and-boundaries.md` | P0 | Rewrite as canonical claim boundary. The current file is broken/truncated and must define root API, production runtime, CLI, rendering, game runtime, and roadmap labels. |
| `docs/agents/prompt-to-3d-workflow.md` | P0 | Remove stale version assumptions and overclaims. Add required CLI asset search/add flow, typed imports, screenshot verification, and renderer boundary. |
| `docs/agents/asset-workflow.md` | P0 | Add source scanning, release validation, provenance requirements, and no raw string asset IDs. |
| `docs/agents/agent-quickstart.md` | P1 | Start with `llms.txt`, typed assets, and a minimal real asset route. Avoid primitive-first examples for object-focused apps. |
| `docs/agents/api-surface.md` | P1 | Mark which APIs are public root, internal, experimental, or production-runtime only. |
| `docs/agents/templates.md` | P1 | Demote non-playable templates. Require template screenshots and route-health output. |
| `docs/agents/codebase-map.md` | P1 | Add map from root API to production-runtime/rendering internals so agents know when a library fix is needed. |
| `docs/agents/README.md` | P1 | Add a short "do not build around missing engine features with primitives" warning. |

### API Docs

| File | Priority | Required fix |
| --- | --- | --- |
| `docs/api/game-runtime.md` | P0 | Fix invalid examples such as `game.createRuntime`, `runtime.events.emit`, and `runtime.update` if those do not exist. Add real platformer/racing/falling-block APIs only after they exist. |
| `docs/guides/build-a-browser-game.md` | P0 | Fix imports and wrapper confusion. Remove claims that root route supports skinned GLB animation until pixel-backed. Replace with real starter once game kits exist. |
| `docs/api/assets.md` | P0 | Add source validation and release gate details. Clarify `assets add`, generated `aura-assets.ts`, and banned string IDs. |
| `docs/api/app-api.md` | P1 | Document `createAuraApp` renderer modes and fallback behavior. |
| `docs/api/readme.md` | P1 | Add a public API contract index and capability status labels. |
| `docs/api/animation-runtime-events.md` | P1 | Align with actual animation runtime support and event names. |
| `docs/project/public-api-contract.md` | P1 | Define stable, experimental, and internal exports. Add root `@aura3d/engine` acceptance tests as contract proof. |

### Rendering and Animation Docs

| File | Priority | Required fix |
| --- | --- | --- |
| `docs/concepts/rendering.md` | P0 | State current root renderer boundary and production-runtime distinction. |
| `docs/rendering/skinning-and-morphs.md` | P0 | Mark current public support honestly. Add acceptance criteria for claiming skinned/morph rendering. |
| `docs/rendering/material-matrix.md` | P0 | Convert to exact supported/partial/unsupported table for root API and production renderer separately. |
| `docs/rendering/postprocess.md` | P0 | Remove or demote claims not proven by screenshots. |
| `docs/animation/runtime-support.md` | P0 | Rewrite stale language. State what is implemented, what is public, and what is renderer-backed. |
| `docs/rendering/animation-render-preset.md` | P1 | Tie presets to actual renderer modes and tests. |
| `docs/concepts/engine-lifecycle.md` | P1 | Clarify route lifecycle, frame loop, runtime nodes, and renderer fallback behavior. |

### Project and Release Docs

| File | Priority | Required fix |
| --- | --- | --- |
| `docs/project/current-state.md` | P0 | Remove contradictory shipped/planned language. Add honest capability status and known blockers. |
| `docs/project/claim-guidelines.md` | P0 | Add claim labels: proven, partial, prototype, internal, planned. Require evidence path for each claim. |
| `docs/project/release-tracks.md` | P0 | Split package/runtime release from showcase/marketing release. Do not allow showcase claims to ride on package stability alone. |
| `docs/project/release-checklist.md` | P0 | Add asset validation, screenshot checks, route-health, claim boundary, and game input tests. |
| `docs/project/release-process.md` | P0 | Add docs and showcase evidence gates before public release. |
| `docs/project/verification-evidence.md` | P0 | Replace stale evidence with current browser screenshot and route-health requirements. |
| `docs/project/showcase-application-plan.md` | P0 | Remove Aura Clash from new ideas, demote overclaimed statuses, and add per-app rebuild gates. |
| `docs/project/known-limits.md` | P0 | Keep as canonical limitations doc and link it from all guides. |
| `docs/project/product-boundaries.md` | P0 | Preserve and strengthen boundaries for public claims. |
| `docs/project/game-runtime-release.md` | P1 | Update only after game kits exist. Until then mark route-local showcase logic as not a reusable runtime. |
| `docs/project/aura3d-109-release-gates.md` | P1 | Align gates with new route-health and public API contract. |
| `docs/project/documentation-index.md` | P1 | Add missing docs and remove links to non-existent files. |
| `docs/project/requirements-trace.md` | P1 | Map requirements to tests and docs. Remove stale missing references. |
| `docs/project/apps-classification.md` | P1 | Reclassify examples as library demo, prototype, playable game, or marketing-ready. |
| `docs/project/site-map.md` | P1 | Add showcase status and capability pages. |
| `docs/project/completion-audit.md` | P1 | Replace skeletal completion notes with gate-by-gate status. |
| `docs/project/getting-started.md` | P2 | Make the first path asset-first and claim-safe. |

### Missing Docs to Create

| File | Priority | Purpose |
| --- | --- | --- |
| `docs/project/frozen-benchmark-release-gates.md` | P0 | Define frozen visual/gameplay benchmark gates referenced by existing docs. |
| `docs/project/launch-positioning.md` | P0 | Define what can be publicly said today versus after renderer/game/runtime fixes. |
| `docs/project/showcase-quality-gates.md` | P0 | Single source for screenshot, input, asset, primitive, and claim gates. |
| `docs/project/library-gap-roadmap.md` | P0 | Durable successor to the library section of this PRD. |
| `docs/project/marketing-site.md` | P1 | Define site claims and evidence requirements. |
| `docs/project/superiority-evidence-workflow.md` | P1 | Define how to compare Aura3D examples to Three.js/Babylon-style quality honestly. |

### Template and Example Docs

| File | Priority | Required fix |
| --- | --- | --- |
| `docs/templates/create-aura3d-templates.md` | P0 | Document mini-game as a playable starter with typed asset, keyboard, reset, scoring, screenshot, and production-claim boundaries. |
| `docs/examples/animation-studio.md` | P1 | Align shipped/planned status and renderer-backed animation evidence. |
| `examples/*/README.md` | P1 | Audit for primitive-first or overclaimed wording. Add route-health/evidence expectations. |
| `apps/*/README.md` | P1 | Every showcase README must match source, typed assets, actual renderer, and actual gameplay. |

## Workstream C: Showcase Slate Remediation

The showcase apps should be treated as evidence artifacts, not demos that can pass with route boot and a nice title. Each route must declare whether it is production-quality, prototype, internal diagnostic, or blocked.

### Current Showcase Classification

| App | Current classification | Required action |
| --- | --- | --- |
| `apps/showcase-blockfall-reactor` | Keep as flagship candidate after fixes | Preserve the playable falling-block premise, fix boot-state clutter, strengthen Tetris controls, place controls where expected, prove movement/rotation/hold/line clears with tests. |
| `apps/showcase-product-configurator` | Keep as asset/commerce candidate after fixes | Replace fake exploded internals with real asset/material metadata or label as conceptual proxy. Add material proof screenshots. |
| `apps/showcase-material-asset-inspector` | Keep as diagnostic candidate after fixes | Make inspection data real and useful. Add material/texture/animation/mesh counts from asset pipeline. |
| `apps/showcase-cinematic-architecture` | Rebuild or demote | Use stronger real architectural assets, reduce primitive filler, improve first viewport and mobile crop. |
| `apps/showcase-data-galaxy` | Rebuild | Define what data is being explored, reduce visual noise, use meaningful data mapping, avoid random boxes, use Aura particles only where appropriate. |
| `apps/showcase-smart-city-control` | Rebuild or demote | Make city control interactions meaningful and asset-backed. Fix README/source mismatch. |
| `apps/showcase-digital-twin-ops` | Rebuild | Use asset-backed zones and visible motion. Telemetry must correspond to scene state. |
| `apps/showcase-webgpu-particle-lab` | Rename/demote until WebGPU proof | If WebGPU is real, prove it. If fallback is active, call it Aura particle lab or WebGL particle lab. Fix particle modes and persistence. |
| `apps/showcase-skyline-runner` | Rebuild before game claim | Need real side-scroller/game world, real playable character, readable camera, meaningful level length, and genre kit support. |
| `apps/showcase-turbo-drift-circuit` | Rebuild before game claim | Need real race track asset or quality circuit builder, chase/top-down camera options, collision, laps, checkpoints, opponents/ghost, and a readable play loop. |
| `apps/showcase-orbital-defense` | Remove from public showcase until rebuilt | Primitive-only route should not count as a public flagship. Rebuild with typed assets and actual defense gameplay. |

### Showcase-Specific Acceptance Gates

- [x] Each app has a route-health declaration with claimed category, primary assets, renderer mode, fallback mode, primitive count, and evidence screenshots.
- [x] Each app has at least one desktop screenshot and one mobile screenshot checked into evidence or generated by CI.
- [x] Each game app has keyboard input tests that prove state changes.
- [x] Each game app has a clear objective, scoring/fail condition, reset, and completion or loop.
- [x] Each non-game app has meaningful interaction that changes scene state and telemetry.
- [x] Each app README matches the source and generated typed asset manifest.
- [x] No app README claims WebGPU, PBR, skinned animation, production runtime, or real-time simulation unless tests prove it.
- [x] Primitive count is justified and below a route-specific budget.
- [x] Primary subject is typed GLB/glTF unless the app is explicitly abstract visualization.

## Workstream D: Test and Evidence Requirements

### Browser Test Requirements

- [x] Every showcase route loads without console errors.
- [x] Every showcase route captures a desktop screenshot.
- [x] Every showcase route captures a mobile screenshot.
- [x] Screenshot tests assert nonblank pixels and subject visibility, not just file size.
- [x] Screenshot tests detect major UI overlap and clipping.
- [x] Animation routes compare two frames and verify meaningful pixel deltas in the animated subject area.
- [x] Particle routes compare mode changes and verify visible pixel differences.
- [x] Game routes send keyboard input and verify movement, scoring, reset, and at least one genre-specific mechanic.
- [x] Racing routes verify throttle changes speed, steering changes heading, checkpoint order matters, and lap validation works.
- [x] Platformer routes verify move, jump, land, collect, hazard, respawn, and finish/checkpoint.
- [x] Falling-block routes verify left/right, rotate, soft drop, hard drop, hold, lock, line clear, and replay/checksum.

### Static Source Requirements

- [x] No `model("string-id")` in public examples.
- [x] No raw `.glb` or `.gltf` URLs in public examples unless explicitly in unsafe diagnostics docs.
- [x] No `GLTFLoader` import in public examples.
- [x] No `three` import in public examples.
- [x] No CSS/DOM particle implementation for examples claiming Aura particle rendering.
- [x] No primary character/vehicle/world made only from primitives in game examples.
- [x] All primary assets appear in `aura.assets.json` and `src/aura-assets.ts`.
- [x] All primary assets have durable license/provenance metadata.

## Workstream E: Release Blocking Gates

| Gate | Blocks release when |
| --- | --- |
| Public API contract | Docs reference APIs not exported from root `@aura3d/engine` or not tested from root import. |
| Renderer boundary | Docs imply production rendering through root path without pixel-backed proof. |
| Asset safety | Source contains raw string asset IDs, raw GLB URLs, unsafe model paths, temp provenance, or unlicensed assets. |
| Primitive integrity | Primary subject in a public showcase is primitive-only without being explicitly abstract. |
| Screenshot quality | Main subject is unreadable, hidden, tiny, clipped, or UI-overlapped. |
| Gameplay | Game route cannot be played with keyboard or lacks objective/fail/reset/progression. |
| Animation | Claimed animation is not visible in pixel deltas. |
| WebGPU | WebGPU claim lacks adapter/backend/dispatch/render proof. |
| Docs consistency | README/docs/route evidence disagree about shipped status or capabilities. |
| Showcase status | Prototype routes are presented as flagship public examples. |

## Immediate P0 Task List

### P0.1 Create Durable Claim Boundary

- [x] Rewrite `docs/agents/claims-and-boundaries.md`.
- [x] Update `README.md` with the same boundary.
- [x] Update `AGENTS.md`, `llms.txt`, and `.github/copilot-instructions.md`.
- [x] Add "public root API evidence only" wording to all agent-facing docs.

### P0.2 Stop Unsafe Showcase Generation

- [x] Add static validation for raw asset strings, unsafe URLs, Three.js imports, GLTFLoader imports, and CSS particle stand-ins.
- [x] Add primitive budget diagnostics.
- [x] Add route-health declarations.
- [x] Fail showcase tests on mismatched claims.

### P0.3 Fix Public Game Runtime Docs

- [x] Rewrite `docs/api/game-runtime.md` to match actual exports only.
- [x] Rewrite `docs/guides/build-a-browser-game.md` so the starter compiles and is honest.
- [x] Document `mini-game` as rebuilt into a real playable starter with production-claim boundaries.

### P0.4 Decide Renderer Bridge Plan

- [x] Write `docs/project/library-gap-roadmap.md`.
- [x] Decide root `createAuraApp` production bridge architecture.
- [x] Add browser acceptance test targets before implementation.
- [x] Do not claim Three.js-level visual quality until this bridge and tests exist.

### P0.5 Demote Current Showcase Claims

- [x] Update `docs/project/showcase-application-plan.md`.
- [x] Update `docs/project/apps-classification.md`.
- [x] Update each app README with honest status.
- [x] Remove or hide `showcase-orbital-defense` from public flagship lists until rebuilt.
- [x] Rename or demote `showcase-webgpu-particle-lab` unless native WebGPU proof passes.

## PRD Done Definition

This PRD is done when:

- [ ] The root docs tell agents exactly what Aura3D can and cannot prove today,
  and this has been checked against `llms.txt`, `AGENTS.md`, README, route-health,
  launch evidence, and the current browser screenshots.
- [ ] Every Markdown file listed in the docs matrix is either fixed or has a
  tracked issue with owner, priority, evidence requirement, and contradiction
  check.
- [ ] The library roadmap names exact packages/files needed for production-quality
  root rendering, animation, game runtime, asset validation, grounding, camera,
  particles, and route diagnostics.
- [ ] Showcase routes cannot pass tests with primitive-primary visuals, fake
  particles, fake WebGPU, stale route-health, stale launch evidence, or
  route-local proof that does not reflect mounted runtime diagnostics.
- [ ] The public examples are classified honestly as flagship, prototype,
  diagnostic, or blocked, and that classification matches current screenshots.
- [ ] Future agents have a repeatable checklist that prevents weak examples from
  being merged, including proof paths and screenshot inspection requirements.
- [ ] The reopened P0 tasks in `Authoritative Recovery Reopen - 2026-06-20` are
  complete with current browser reports and manually inspected screenshots.

## PRD Split-Out Rule

This file is a temporary remediation PRD for organizing recovery work. It does
not sunset, abandon, replace, or kill Aura3D. Once accepted, split this PRD into
durable docs:

- `docs/project/library-gap-roadmap.md`
- `docs/project/showcase-quality-gates.md`
- `docs/project/launch-positioning.md`
- `docs/project/frozen-benchmark-release-gates.md`
- `docs/agents/claims-and-boundaries.md`

After those files exist and are linked from `README.md`, `AGENTS.md`, and
`llms.txt`, this PRD can be archived as historical process evidence. Aura3D
continues as the project being repaired.
