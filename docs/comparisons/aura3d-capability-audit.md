# Aura3D capability audit

Status: 2026-10-28. Internal companion to [`threejs-positioning.md`](threejs-positioning.md): what each capability's marketing can lean on. Labels:

- **shipped**: public export or command, with a named proof (see the Proof column).
- **partial**: shipped in part; the note says which part has evidence.
- **experimental**: exported or present, but without root evidence for a public claim.

Paths are repo-relative. "tagline-check" means `evidence/vs-threejs/tagline-check/` (runs 1 and 2, 2026-10-27, stock `create-aura3d@4.3.5`, software WebGL2).

## Proof column and the gate

Every `shipped` row ends with a **Proof** cell that `node tools/receipts/check.mjs` checks (exit 1 on a missing proof):

- `pixel: <receipt-dir>[, <receipt-dir>]`: a rendered-pixel capability. Needs a valid receipt for the current minor version at `evidence/receipts/<receipt-dir>/<version>.json` (schema in the PRD, section 3.5: frame hashes, mean luma, non-black ratio, renderer, test paths). Receipts are taken on the remote runner on software WebGL2 (SwiftShader), so they prove pixels change as described, not GPU speed. When the minor version moves, the gate lists the receipts to regenerate.
- `api: <path>[, <path>]`, `cli: ...`, `docs: ...`: an API, command or document with no pixels of its own. Needs every named test, gate or document to exist.

Promotion rule (PRD decision 6): a row becomes `shipped` only with (a) a pixel receipt from a remote run, (b) a unit test and (c) a documented example that compiles. Otherwise it stays `partial` or `experimental`, or leaves public copy.

## Engine API (`@aura3d/engine`, source `packages/engine/src/`)

| Capability | Label | Code | Evidence | Proof |
|---|---|---|---|---|
| `createAuraApp(selector, { scene })` | shipped | `agent-api/app/createAuraApp.ts:53` | Built and rendered in tagline-check; template route-health specs | api: tests/unit/agent-api/aura-app-handle.test.ts |
| `createAuraApp` `quality` option and render path (`auto` direct path, `production` HDR chain) | shipped | `agent-api/app/rendererOptions.ts`, `packages/rendering/src/quality/DirectPath.ts` | `app.diagnostics().renderPath` reports the path and the reason; `auto` and `production` frames compared on the remote runner | api: tests/unit/rendering/render-path-selection.test.ts, tests/browser/frame-cost.spec.ts |
| `scene()` builder, `group`, runtime node handles | shipped | `agent-api/nodes/` | Bench scenes (`evidence/vs-threejs/RESULTS.md`); tagline-check | api: tests/unit/agent-api/runtime-node-handle.test.ts |
| Option diagnostics: an option that is accepted but not applied raises `OPTION_IGNORED` | shipped | `agent-api/nodes/optionDiagnostics.ts`, `compiler/optionCoverage.ts` | Every option in `docs/api/*.md` and `docs/agents/recipes.md` code blocks is applied or diagnosed | api: tests/unit/agent-api/option-coverage.test.ts |
| `looks.preset(id)`, `looks.appOptions(id)`, 15 looks | shipped | `agent-api/looks/looks.ts`, `lookPresets.ts` | Rendered in tagline-check. Note: `product-studio` shows a light backdrop rather than its `#2b2f36` value. Five looks without an HDRI carry a procedural fill so they keep their brightness | api: tests/unit/agent-api/looks.test.ts, tests/unit/rendering/look-presets-environment.test.ts |
| `model(assets.x)` typed GLB, `targetHeight` | shipped | `agent-api/nodes/`; `defineAuraAssets`, `defineModelAssets` | tagline-check | api: tests/unit/agent-api/public-example-boundary.test.ts |
| `camera.*` incl. `camera.frameAsset`, `cameras.chase/cube/array/stereo` | shipped | `agent-api/nodes/camera.ts:200`, `cameras.ts` | `frameAsset` framed the hero in tagline-check run 2 | api: tests/unit/agent-api/camera-clipping.test.ts, tests/unit/engine/game-camera-rigs.test.ts |
| `interactions.orbit` (node name or world point, `position`, `autoRotate`) and pointer/keyboard interactions | shipped | `agent-api/nodes/interactions.ts`, `orbitInteraction.ts` | Bench PBR viewer; template route-health asserts orbit. `position` and `autoRotate` apply when the scene camera is `camera.orbit` | api: tests/unit/agent-api/option-coverage.test.ts |
| `environments.*` (hdri, presets, neutral) | shipped | `agent-api/` environments; neutral embedded in `@aura3d/rendering` | Bench PBR viewer; `evidence/neutral-embedded/`. A scene with authored lights and no `environments.*` node gets no implicit fill (add any `environments.*` to restore it) | api: tests/unit/environments/production-runtime-hdr-environment-corpus.test.ts, tests/unit/rendering/exposure-parity.test.ts |
| `effects.bloom`, `effects.shaderPass`, `effects.fog`, `effects.toon` | shipped | `agent-api/nodes/effects*.ts` | Bench PBR viewer (bloom), shader water (shader pass), forest (fog); toon since 4.1.3. Bloom passes are fused on the `auto` path (24 draws against 33 on the PBR viewer, frames within 1/255) | api: tests/unit/rendering/native-bloom-pyramid.test.ts, tests/unit/rendering/bloom-pass-fusion.test.ts, tests/unit/parity/shader-pass-order.test.ts, tests/unit/rendering/volumetric-fog.test.ts, tests/unit/toon/toon.test.ts |
| `effects.ambientOcclusion` | shipped | `agent-api/nodes/effects*.ts`, `postPresets.ts` | Receipt `effects-ambient-occlusion`: the `ssao` pass ran and the frame darkened where surfaces meet. Example in `docs/agents/effects-and-scene-kits.md` | pixel: effects-ambient-occlusion |
| `effects.colorGrade` (`contrast`, `saturation`) | shipped | `agent-api/nodes/effects*.ts` | Receipt `effects-color-grade`: saturation 0 removes chroma, contrast 1.7 widens the luma spread. Other grade fields are recorded and warned about, not applied. Example in `docs/agents/effects-and-scene-kits.md` | pixel: effects-color-grade |
| `effects.vignette` | shipped | `agent-api/nodes/effects*.ts` | Receipt `effects-vignette`: corners darken, centre keeps its value. Example in `docs/agents/effects-and-scene-kits.md` | pixel: effects-vignette |
| `effects.depthOfField` | shipped | `agent-api/nodes/effects*.ts` | Receipt `effects-depth-of-field`: edge energy drops away from the focus distance. Example in `docs/agents/effects-and-scene-kits.md` | pixel: effects-depth-of-field |
| `effects.contactShadows` | partial | `agent-api/nodes/effects.lighting.ts`, `postBridge.ts`, `compiler/postprocess.ts` | SSAO-backed approximation at reduced strength: on the receipt room it lowers mean luma by about 1.2 but changes no pixel past the receipt threshold, so there is no current receipt (the 4.3.7 receipt was measured against an untonemapped baseline and is withdrawn; `evidence/receipts/README.md`). It is not a dedicated contact-shadow pass and its mask is not read by shading; make no public claim for it | — |
| `material.*` PBR builders, `material.custom` GLSL with chunks | shipped | `agent-api/nodes/material.ts`, `agent-api/compiler/customMaterial.ts` | Bench; `docs/rendering/pbr-gltf-correctness.md`. The `material.custom` prelude names are listed in the `AuraCustomMaterialSpec` JSDoc | api: tests/unit/engine/material-physical-p3.test.ts, tests/unit/custom-shader-precision/precision-order.test.ts |
| `instances.*`, `batched.mesh`, `distanceLod`, `text3D` | shipped | `agent-api/nodes/instances.ts` | `docs/rendering/geometry-instancing-lod-text.md`; `setInstanceTransforms(typedArray)` costs about 0.3 ms of CPU per frame for 18,000 instances. Dense shadow-casting instanced nodes (1,024 or more instances) use coarser shadow geometry; opt out with `shadowproxy=off` | api: tests/unit/agent-api/root-geometry-lod-instancing.test.ts, tests/unit/engine/instance-matrices-dense.test.ts, tests/unit/engine/instanced-shadow-proxy.test.ts |
| Skinned GLB playback, named clips, cross-fade, morphs (root) | shipped | `AnimationController`, typed GLB actors | `docs/rendering/animation.md`; bench skinned character | api: tests/unit/agent-api/animation-mixer-root-e3.test.ts |
| Animation layers with a mask (`playLayer`, `mask: { humanoid, exclude }`) | shipped | `packages/animation/src`, `agent-api/animationMask.ts` | Receipt `animation-layers`: a masked Run layer swings the hand (range 0.46 m) while the foot stays put. Example in `docs/api/animation-root.md` (checked by `animation-root-examples.test.ts`) | pixel: animation-layers |
| Root motion (apply and extract-only) | shipped | `packages/animation/src`, `AnimationController` | Receipt `animation-root-motion`: apply mode travels 5.5 m, extract-only and no spec travel 0 | pixel: animation-root-motion |
| Retargeting (`addClipsFrom(handle or id)`) | shipped | `packages/animation/src`, `AnimationController` | Receipt `animation-retargeting`: Soldier clips drive the Robot. The retarget worker falls back to an in-process bake when it cannot start | pixel: animation-retargeting |
| Two-bone IK | shipped | `packages/animation/src` | Receipt `animation-two-bone-ik`: the hand reaches two targets with zero error and releases on dispose | pixel: animation-two-bone-ik |
| `sceneKits.*` (10 kits) | shipped | `agent-api/` scene kits | Nine kits have receipts (physicsPlayground, particleFountain, solarSystem, neonTunnel, dataViz, miniGolf, cityBlock, humanoidWalk, productViewer: two frames each, animated kits change between them); `materialLab` is the original root-proven kit (`llms.txt`). Every kit reports no problems on its defaults. Examples in `docs/agents/effects-and-scene-kits.md`. A kit gives scene content, not a finished product | pixel: scenekits-physicsPlayground, scenekits-particleFountain, scenekits-solarSystem, scenekits-neonTunnel, scenekits-dataViz, scenekits-miniGolf, scenekits-cityBlock, scenekits-humanoidWalk, scenekits-productViewer |
| Game kit `@aura3d/engine/game` (HUD, touch, juice, session, sound) | shipped | `packages/game/src/index.ts` | `docs/api/game-kit.md`; used by the shipped games | api: tests/unit/game/juice.test.ts, tests/unit/game/overlay.test.ts |
| Genre kits: `racketSports`, `arcadeKart`, `carSoccer`, fighting, platformer motion | partial | root exports (`docs/api/root-exports.md`, 27 game-kit exports) | Root-tested building blocks with one compiling example per kit (`docs/agents/genre-kits.md`); opponent AI, levels and art are per game (`claims-and-boundaries.md` §6) | — |
| Root `createGame` | experimental | `packages/engine/src/contracts/stubs/game.ts` | Headless, inert stub (`touch` is `null`, `sound` is `undefined`); `@aura3d/game` imports it as a fallback. Use `@aura3d/engine/game` | — |
| QA kit: `createFixedStepLoop`, `createCountedRng`, `installQaHooks` | shipped | `packages/engine/src/qa/` | `docs/api/qa-kit.md`; bench game loop | api: tests/unit/qa/qa-kit.test.ts |
| Motion kit and render interpolation (120/144 Hz) | shipped | `createRenderInterpolator`, `createFixedStepPresenter` | `docs/api/motion-presenter.md` (50% to 0% stalled frames at 120 Hz) | api: tests/unit/rework-kit/presenter.test.ts |
| Safety net, frame error boundary | shipped | `packages/debug/src/safety` | `docs/api/safety-net.md` | api: tests/unit/debug-safety/safety.test.ts, tests/unit/agent-api/on-frame-errors.test.ts |
| Audio synth: cue bank, step sequencer, tone loop | shipped | `packages/audio/src/synth` | `docs/api/audio-synth.md` | api: tests/unit/audio-synth/synth.test.ts |
| `physics.*` root: box, sphere and capsule bodies against static and dynamic bodies | shipped | `agent-api/nodes/physics.ts`; `@aura3d/physics`, `@aura3d/physics-rapier` | Receipt `physics-root-collision`: six bodies rest within 0.001 m of the expected height and the visible nodes follow their bodies (`app.physics` with `physics: { bindNodes: true }`). Example in `docs/concepts/physics.md` (collision matrix) | pixel: physics-root-collision |
| `physics.*` root: mesh and heightfield colliders, joints, vehicles | partial | `@aura3d/physics`, `@aura3d/physics-rapier` | Package tests only; no root receipt and no solver-parity claim (`claims-and-boundaries.md` §4) | — |
| `tsl` (62 names), `compute`, WebGPU backend | experimental | `agent-api/nodes/tsl/index.ts`, `compute.ts` | WebGPU is opt-in. The evidence classifier (`tools/receipts/webgpu-evidence.mjs`) returns `none`, `software-webgpu` or `real-gpu`; no real-GPU run exists (`evidence/real-gpu/README.md`) | — |
| `xr` | experimental | root `xr` | Injected sessions only (`docs/rendering/controls-picking-xr-context.md`) | — |
| React adapter `@aura3d/react` | experimental | `packages/react/src/index.ts` | Unit-tested after two fixes (`AuraCanvas` now renders its children and no longer recreates the app on every parent render). Mount, cleanup and StrictMode have not run in a browser; reason in `packages/react/README.md` | — |

## Toolchain (`@aura3d/cli`, source `packages/aura3d-cli/src/`)

| Capability | Label | Code | Evidence | Proof |
|---|---|---|---|---|
| `assets add`, `assets typegen` (manifest + `src/aura-assets.ts`) | shipped | `asset-manifest.ts`, `cli.ts` | Template `aura.assets.json` and generated `src/aura-assets.ts`; tagline-check | cli: tests/unit/aura3d-cli/assets.test.ts, tests/unit/aura3d-cli/asset-manifest-schema.test.ts |
| `assets search`, `assets resolve` (project, open sources, Meshy, primitives) | shipped | `resolve-ladder.ts` | There is no hosted catalog (`docs/audit/asset-catalog-claim.md`) | cli: tests/unit/aura3d-cli/resolve-ladder.test.ts |
| `assets inspect`, `optimize`, `merge-clips`, `thumbnail`, `repair-skin` | shipped | `cli-help.ts`, `commands/assets/` | `aura3d --help`. Skin-weight sums within 5% of 1 are a debug-level note, not a warning | cli: tests/unit/aura3d-cli/asset-inspection-animation.test.ts, tests/unit/aura3d-cli/skin/skin-validate.test.ts |
| `assets validate --release`, licence and provenance gates | shipped | `asset-source-validation.ts`, `index.ts` | — | cli: tests/unit/aura3d-cli/asset-provenance-license-coherence.test.ts |
| `assets import-meshy` and `meshy ledger` | shipped | `meshy/`, `commands/meshyLedger.ts` | `meshy-cli` skill; local candidate ingestion only | cli: tests/unit/aura3d-cli/meshy-import.test.ts |
| `check-deploy --dist [--release]` | shipped (static checks) | `index.ts:1097` | Checks hashed assets, unreferenced files and validation; it does not load routes or read the console | cli: tests/unit/aura3d-cli/deployment.test.ts |
| `doctor` | shipped | `index.ts` (manifest checks); `doctor --look` forwards to `look lint` | `cli.ts:390` | cli: tests/unit/cli/look-lint.test.ts |
| `look capture`, `look judge`, `look lint`, `look rubric`, `evidence judge` | shipped | `commands/` registry | `aura3d --help` lane commands | cli: tests/unit/cli/look-capture.test.ts, tests/unit/cli/look-judge.test.ts, tests/unit/aura3d-cli/judge/evidence-judge.test.ts |
| `migrate three` codemod | partial | `migrate-three/mappings.ts` (245 rows: 34 exact, 164 approximate, 47 none, 0 pending) | Every `exact` row names a fixture that runs against real three.js (`tests/unit/aura3d-cli/migrate-three-fidelity.test.ts`). Of the 47 `none` rows, 26 are deliberate loader and exporter exclusions. Aura3D's math classes are immutable values while three's mutate in place, so those rows stay approximate. Output is a worklist, not a drop-in port | — |
| `init --agent` (skills + `llms.txt` into a project) | shipped | `cli.ts` | `create-aura3d --help` (`--agent`, `--skills`) | cli: tests/unit/create-aura3d/agent-skills.test.ts |

## Templates, skills, docs

| Capability | Label | Code | Evidence | Proof |
|---|---|---|---|---|
| `create-aura3d`, 20 templates | shipped | `packages/create-aura3d/templates/` | Every template has route-health and screenshot specs. Stock build smoke: hello world plus 4 templates (`evidence/stock-build/`); product-viewer built and rendered in tagline-check | cli: tests/unit/create-aura3d/templates.test.ts |
| 14 agent skills, `pnpm check:skills`, `pnpm skills:sync` | shipped | `packages/aura3d-cli/skills/`; root `package.json` scripts | Gate script `tools/agent-skills/check.ts` | cli: tests/unit/tools/agent-skills-check.test.ts |
| `llms.txt`, `llms-full.txt`, recipes, type-traps table | shipped | `llms.txt`, `docs/agents/recipes.md` | Cold-start trial: 8 to 14 of 15 renders, 40 to 10 median turns (`evidence/agent-eval/baseline1/NOTES.md`) | docs: llms.txt, llms-full.txt, docs/agents/recipes.md, tools/agent-docs |

## Framing note

The audit brief described Aura3D as built on three.js. The code says otherwise, and the owner confirmed Aura3D is a competitor: `@aura3d/engine` has no `three` dependency, no runtime package imports `three` (only the codemod's `parse.ts` and `emit.ts` do), and rendering runs through `@aura3d/rendering`. Sixteen renderer shader files carry three r185 code under MIT and say so in their headers. Claims in the positioning doc are framed engine against engine.
