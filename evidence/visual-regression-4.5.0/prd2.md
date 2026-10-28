# Visual-regression verification of PRD-2 (4.5.0 candidate, second pass)

Run: 2026-10-28. Candidate = `beat3js2/integration` at `544b73bd4` (PRD-1, release/4.5.0 prep, PRD-2 WP-1..7 and 9; versions 4.5.0). Baseline = clean `main` (`1b89fe28b`). Same method as `README.md` in this directory (the PRD-1 run): software WebGL2 (SwiftShader) on Azure ACR Tasks through `tools/remote-acr/run.sh`, `CONTEXT_PROFILE=full`, `EXTRA_DIRS=apps`, reporter `line,json`, the same 177-spec list (the 221 found minus the 44 that fail to load identically on both trees). Nothing was pushed, tagged, published or deployed.

## How the comparison was made

- Candidate: one new image built from the candidate tree (`run-vis2-c-pre`, tag deleted after the run). The 177 specs ran as 9 twelve-spec chunks plus 72 single-spec runs with `--timeout=60000`, the same split as PRD-1 (the six chunks that hit the 1 h ACR cap on `main` are run spec by spec).
- Baseline: the `main` results recorded in the PRD-1 run (same commit `1b89fe28b`, same image recipe, same spec list and context profile). They were not re-run, and the candidate context deliberately has the same ignored-fixture set as PRD-1 (none cloned), so both sides see equal inputs. Reruns of single `main` specs used the existing `main` image (`run-vis-m-pre`).
- A test is compared by `file::title`. Error texts are compared with numbers, hex values and `/repo/...` paths normalised. Tests registered by shared lib files (`post-luma-games-lib.ts`, `port-sun-shadows-lib.ts`, `gridflip-lib.ts`, one production-runtime helper) are included; they belong to the listed specs.
- The runner log interleaves ACR's own timestamp lines into the base64 attachments of the JSON report, which breaks `JSON.parse`; the parser strips those lines first.
- Process note: the first candidate run was discarded. The agent worktree had been created without Git LFS smudging, so 824 `*.glb`/`*.wav` files were 131-byte pointer files and the Aura Clash, diamond and postprocess routes failed with `Unexpected token 'v', "version ht"...`. After `git lfs checkout` (824 objects, local store) the image was rebuilt and everything re-run. No result from the pointer-file run is used.

## Result

359 tests produced a `main` result. 337 produced a result on both trees; 22 have none on the candidate.

| Outcome | Tests |
| --- | --- |
| pass-both | 161 |
| fail-both-same (same normalised error) | 165 |
| fail-both-diff (both fail, error text differs) | 5 |
| candidate-only-pass | 3 |
| candidate-only-fail | 1 (nondeterministic, below) |
| skipped on both | 2 |
| no candidate result | 22 (`showcase-route-interaction-audit`, see "Not verified") |

The 165 identical failures are runner limits, as in PRD-1: 62 `waitForFunction` timeouts, 18 test timeouts, 11 `toBe` assertions, 10 screenshot timeouts, 6 `toBeGreaterThan`, 5 `ENOENT` (generated evidence absent in the image), and a tail of `toBeNull`, destroyed execution contexts and similar. They fail the same way on `main`.

## candidate-only-fail: 1, nondeterministic route

`shadow-stability-301` "60 seconds of rendered spot point directional shadows discriminate instability" fails on the candidate with `P02 snappingDisabled negative control does not discriminate` (the control's temporal mean shimmer must exceed the stabilised directional mean). `main` fails the same assertion with the same message when loaded again; two further loads of each build:

| Build | Load 1 | Load 2 | Load 3 |
| --- | --- | --- | --- |
| `main` `1b89fe28b` | pass (PRD-1 run) | pass | fail, same message |
| candidate `544b73bd4` | fail (this run) | pass | fail, same message |

Each build both passes and fails with identical code, so the verdict comes from the 60 s wall-clock sampling on software GL, not from the PRD-2 shadow changes (tap-tier cap, cascade skipping). The cause of the flip was not isolated. No product change was made.

## candidate-only-pass: 3

- `agent-api-visual-smoke` "renders local Aura helper versus raw Three.js comparison app" and `post-luma` "mean luma with effects on stays within a few percent of effects off": the same two the PRD-1 run documented (direct-path look change and the stale post-luma threshold, see `README.md` and `evidence/exposure-parity/README.md`). Unchanged by PRD-2.
- `examples-route-health` "route health and screenshot report": passed once on the candidate. `main` and the PRD-1 candidate fail it with `Timeout 5000ms exceeded while waiting on the predicate`. Two more loads of each build all fail with that error (candidate 0/2 pass, `main` 0/2 pass), so the single pass is a runner fluke on the 5 s predicate, not a behaviour change.

## fail-both-diff: 5 (unchanged from PRD-1)

`bank-shot-shot-visual` (main: flat first frame, candidate: 420 s test timeout), `portable-custom-materials` (native WebGPU: context lost vs `waitForFunction` timeout), `crowd-instancing-adoption-301` I03 and `spotlight-route-adoption-301` 1280 and 390 (main: `0x502` LDR postprocess presentation failure in SwiftShader; candidate: pixel-oracle assertion). Same explanations as in `README.md`; the pixel oracles need a real GPU.

## Differences from the PRD-1 candidate run

Four verdicts differ between the PRD-1 candidate run and this run:

- `createAuraApp-postprocess-contract` passes (the harness pin from the PRD-1 fix commit is in this tree).
- `examples-route-health` and `shadow-stability-301`: see above.
- `hf432-live-d2` "dot-dash dpr2" fails with the 120 s screenshot timeout. It fails on `main` as well (so it is not candidate-only) and passed in the PRD-1 candidate run; the cause was not isolated.

## Not verified

- `showcase-route-interaction-audit` (22 tests): `main` took about 57 min and the candidate produced no report (ACR cap or wrapper terminated). Same as PRD-1.
- `hf432-live-d1`, `live-index-games`, `shadow-banding`: no report on either tree (live production hosts and the 1 h cap). Same as PRD-1.
- Assertion-only comparison: ACR ad-hoc runs have no artifact egress, so spec screenshots were not diffed per pixel between trees.

## Regressions fixed

None needed. No product or test change was made on `beat3js2/vis-fixes`; the branch carries only this file.

## Per-spec results

| Spec | Tests | Outcome (pb pass-both, fs fail-both-same, fd fail-both-diff, cp candidate-only-pass, cf candidate-only-fail, sk skipped, nc no candidate result) |
| --- | --- | --- |
| agent-api-visual-smoke.spec.ts | 2 | fs 1, cp 1 |
| animated-character-browser.spec.ts | 2 | pb 2 |
| animation-pointer-material.spec.ts | 2 | pb 1, fs 1 |
| animation-studio-route.spec.ts | 1 | fs 1 |
| animation-studio-visual-regression.spec.ts | 1 | fs 1 |
| asset-material-fidelity-external-parity.spec.ts | 1 | fs 1 |
| asset-material-fidelity.spec.ts | 2 | fs 2 |
| aura-slam-pose-parity.spec.ts | 2 | pb 2 |
| bank-shot-shot-visual.spec.ts | 1 | fd 1 |
| camera-grid-browser.spec.ts | 1 | pb 1 |
| character-animation-viewer.spec.ts | 1 | fs 1 |
| character-foot-ik.spec.ts | 1 | pb 1 |
| createAuraApp-camera-frame-asset.spec.ts | 1 | fs 1 |
| createAuraApp-material-pbr-contract.spec.ts | 1 | fs 1 |
| createAuraApp-postprocess-contract.spec.ts | 1 | pb 1 |
| createAuraApp-shadow-contract.spec.ts | 1 | fs 1 |
| crowd-instancing-adoption-301.spec.ts | 2 | fd 1, fs 1 |
| cube-camera-reflections.spec.ts | 1 | pb 1 |
| cubemap-six-face-gallery.spec.ts | 1 | pb 1 |
| current-routes-parity-evidence.spec.ts | 9 | pb 7, fs 2 |
| custom-shader-post-colour.spec.ts | 1 | pb 1 |
| diamond-live-432-hold.spec.ts | 1 | pb 1 |
| diamond-live-432-multi.spec.ts | 1 | pb 1 |
| diamond-live-432-swing.spec.ts | 1 | pb 1 |
| editor-authoring-external-parity.spec.ts | 2 | fs 2 |
| equirect-panorama-gallery.spec.ts | 1 | pb 1 |
| examples-route-health.spec.ts | 1 | cp 1 |
| external-parity-animation-studio-pro.spec.ts | 1 | fs 1 |
| external-parity-asset-studio-pro.spec.ts | 1 | fs 1 |
| external-parity-character-viewer.spec.ts | 1 | fs 1 |
| external-parity-gltf-visual-corpus.spec.ts | 1 | fs 1 |
| external-parity-hdr-pipeline.spec.ts | 1 | fs 1 |
| external-parity-ibl-evidence.spec.ts | 1 | pb 1 |
| external-parity-ibl-visual.spec.ts | 1 | pb 1 |
| external-parity-interactive-showcase-pro.spec.ts | 1 | fs 1 |
| external-parity-interactive-showcase.spec.ts | 1 | fs 1 |
| external-parity-interior-scene.spec.ts | 1 | fs 1 |
| external-parity-material-matrix.spec.ts | 1 | fs 1 |
| external-parity-material-studio-pro.spec.ts | 1 | fs 1 |
| external-parity-material-studio.spec.ts | 1 | fs 1 |
| external-parity-postprocess-suite.spec.ts | 1 | fs 1 |
| external-parity-product-configurator.spec.ts | 1 | fs 1 |
| external-parity-product-studio-pro.spec.ts | 1 | fs 1 |
| external-parity-public-api-app.spec.ts | 1 | pb 1 |
| external-parity-scene-studio-pro.spec.ts | 1 | fs 1 |
| external-parity-shadow-cascade-evidence.spec.ts | 1 | pb 1 |
| external-parity-shadow-quality.spec.ts | 1 | fs 1 |
| fighting-game-runtime.spec.ts | 1 | pb 1 |
| flagship-ibl-states.spec.ts | 1 | pb 1 |
| full-example-visual-audit.spec.ts | 1 | fs 1 |
| gallery-shift-mobile-touch.spec.ts | 1 | fs 1 |
| gallery-shift-playable.spec.ts | 2 | fs 2 |
| gallery-shift-scene.spec.ts | 1 | fs 1 |
| game-ready-material-probes.spec.ts | 1 | pb 1 |
| game-runtime-mutability.spec.ts | 1 | fs 1 |
| game-runtime-visible-node-movement.spec.ts | 1 | fs 1 |
| game-runtime-visual.spec.ts | 1 | fs 1 |
| gamefeel-camera-rigs.spec.ts | 1 | pb 1 |
| gravity-post-playable.spec.ts | 7 | fs 7 |
| gravity-post-scene.spec.ts | 1 | fs 1 |
| gravity-post-typed-planets-301.spec.ts | 1 | fs 1 |
| gridflip-lib.ts | 1 | pb 1 |
| guard-real-games.spec.ts | 4 | pb 4 |
| hdr-render-target-external-parity.spec.ts | 1 | pb 1 |
| head-to-head-custom-material-shader.spec.ts | 2 | fs 2 |
| head-to-head-instancing-lod.spec.ts | 1 | fs 1 |
| head-to-head-material-laboratory.spec.ts | 1 | fs 1 |
| head-to-head-physical-character.spec.ts | 2 | fs 2 |
| head-to-head-postprocessed-scene.spec.ts | 2 | fs 2 |
| head-to-head-skinned-morph-animation.spec.ts | 1 | fs 1 |
| hf432-live-d2.spec.ts | 9 | fs 9 |
| instanced-model-p2.spec.ts | 2 | fs 1, pb 1 |
| instanced-texture.spec.ts | 1 | pb 1 |
| library-parity-superiority.spec.ts | 3 | pb 1, fs 2 |
| live-cumulus-gait.spec.ts | 1 | fs 1 |
| live-pinfix-ab.spec.ts | 14 | pb 14 |
| live-ports-gl-limits.spec.ts | 11 | pb 11 |
| live-ports-hidpi.spec.ts | 3 | fs 1, pb 2 |
| live-ports-smoke.spec.ts | 11 | pb 9, fs 2 |
| live-showcase-g2.spec.ts | 6 | pb 6 |
| live-showcases-g1.spec.ts | 7 | pb 4, fs 1, sk 2 |
| live-teleoperator-black.spec.ts | 1 | fs 1 |
| loader-instancing-evidence.spec.ts | 1 | fs 1 |
| marketing-visual.spec.ts | 1 | fs 1 |
| muse3jsparity-301-engine-perf.spec.ts | 6 | fs 3, pb 3 |
| muse3jsparity-301-root-governor.spec.ts | 1 | fs 1 |
| neon-corridor-strike-shot-visual.spec.ts | 1 | fs 1 |
| neon-swarm-instancing.spec.ts | 1 | fs 1 |
| parity-animation.spec.ts | 1 | pb 1 |
| parity-custom-attributes.spec.ts | 1 | pb 1 |
| parity-disposal.spec.ts | 1 | pb 1 |
| parity-geometry.spec.ts | 1 | pb 1 |
| parity-instancing.spec.ts | 1 | pb 1 |
| parity-lines.spec.ts | 1 | fs 1 |
| parity-post.spec.ts | 2 | pb 2 |
| parity-runtime.spec.ts | 1 | pb 1 |
| parity-shader.spec.ts | 3 | pb 3 |
| parity-texture.spec.ts | 1 | fs 1 |
| part-o2-visual-scripting.spec.ts | 1 | fs 1 |
| port-sun-shadows-lib.ts | 5 | fs 2, pb 3 |
| portable-custom-materials.spec.ts | 3 | pb 1, fs 1, fd 1 |
| post-luma-games-lib.ts | 25 | pb 25 |
| post-luma.spec.ts | 1 | cp 1 |
| product-configurator-material-matrix.spec.ts | 1 | fs 1 |
| production-catalog-audit.spec.ts | 1 | fs 1 |
| production-runtime-pbr-hdr-real-renderer.spec.ts | 1 | fs 1 |
| production-runtime-production-runtime-app-test.ts | 1 | fs 1 |
| production-runtime-templates.spec.ts | 5 | fs 5 |
| production-runtime-threejs-parity.spec.ts | 1 | fs 1 |
| public-hdr-file-loader.spec.ts | 1 | pb 1 |
| qr-prd03-post-banding.spec.ts | 2 | fs 2 |
| qr-prd03-post-lut.spec.ts | 2 | pb 2 |
| qr-prd03-post-no-readback.spec.ts | 13 | fs 8, pb 5 |
| qr-prd10-impostor.spec.ts | 1 | fs 1 |
| rapier-character-lab.spec.ts | 1 | fs 1 |
| renderer-postprocess-plan-a2.spec.ts | 2 | fs 2 |
| rendering-camera-scene.spec.ts | 1 | pb 1 |
| rendering-external-parity-visuals.spec.ts | 10 | pb 5, fs 5 |
| rooftop-buckets-shot-visual.spec.ts | 2 | fs 2 |
| root-extension-instancing-301.spec.ts | 1 | fs 1 |
| root-ibl-b3.spec.ts | 1 | fs 1 |
| root-renderer-integration-route.spec.ts | 1 | fs 1 |
| root-spot-hdri-n1m3.spec.ts | 1 | fs 1 |
| root-spot-shadow-n1.spec.ts | 1 | fs 1 |
| route-gamefeel-adoption.spec.ts | 4 | pb 1, fs 3 |
| runtime-character-controller.spec.ts | 4 | fs 4 |
| runtime-external-parity.spec.ts | 2 | fs 2 |
| shadow-browser.spec.ts | 1 | pb 1 |
| shadow-footprint.spec.ts | 1 | pb 1 |
| shadow-large-scene.spec.ts | 1 | pb 1 |
| shadow-receive-repro.spec.ts | 1 | pb 1 |
| shadow-stability-301.spec.ts | 1 | cf 1 |
| showcase-asset-screening.spec.ts | 1 | fs 1 |
| showcase-cinematic-architecture-rendering.spec.ts | 1 | fs 1 |
| showcase-digital-twin-operations.spec.ts | 1 | fs 1 |
| showcase-game-thumbnails.spec.ts | 1 | fs 1 |
| showcase-games-input-proof.spec.ts | 2 | fs 2 |
| showcase-route-interaction-audit.spec.ts | 22 | nc 22 |
| showcase-smart-city-optimization.spec.ts | 1 | fs 1 |
| showcase-touch-controls.spec.ts | 2 | fs 2 |
| siege-golf-shot-visual.spec.ts | 1 | fs 1 |
| skinning-over-cap.spec.ts | 1 | pb 1 |
| skyline-camera-readability.spec.ts | 2 | fs 2 |
| spotlight-route-adoption-301.spec.ts | 4 | fd 2, fs 2 |
| template-routes.spec.ts | 6 | fs 6 |
| templates-105.spec.ts | 3 | fs 3 |
| three-compat-loader-corpus.spec.ts | 1 | fs 1 |
| three-compat-material-library.spec.ts | 1 | pb 1 |
| three-compat-templates.spec.ts | 8 | pb 8 |
| threejs-parity-fat-lines.spec.ts | 1 | pb 1 |
| threejs-parity-interactive-cubes.spec.ts | 1 | fs 1 |
| threejs-parity-orbit-controls.spec.ts | 1 | pb 1 |
| threejs-parity-public-scene.spec.ts | 2 | fs 2 |
| threejs-parity-transform-controls.spec.ts | 1 | pb 1 |
| vault-breakers-table-visual.spec.ts | 1 | fs 1 |
| visual-scripting-105.spec.ts | 1 | pb 1 |
| wow-concept-car-cinema-car-stability.spec.ts | 1 | fs 1 |
| wow-robot-production-audit.spec.ts | 1 | fs 1 |
