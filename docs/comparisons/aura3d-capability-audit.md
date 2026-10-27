# Aura3D capability audit (4.3.5)

Status: 2026-10-27. Internal companion to [`threejs-positioning.md`](threejs-positioning.md): what each capability's marketing can lean on. Labels:

- **shipped**: public export or command, with tests or a rendered capture behind it.
- **partial**: shipped in part; the note says which part has evidence.
- **experimental**: exported or present, but without root evidence for a public claim.

Paths are repo-relative. "tagline-check" means `evidence/vs-threejs/tagline-check/` (runs 1 and 2, 2026-10-27, stock `create-aura3d@4.3.5`, software WebGL2).

## Engine API (`@aura3d/engine`, source `packages/engine/src/`)

| Capability | Label | Code | Evidence |
|---|---|---|---|
| `createAuraApp(selector, { scene })` | shipped | `agent-api/app/createAuraApp.ts:53` | Built and rendered in tagline-check; template route-health specs |
| `scene()` builder, `group`, runtime node handles | shipped | `agent-api/nodes/` | Bench scenes (`evidence/vs-threejs/RESULTS.md`); tagline-check |
| `looks.preset(id)`, `looks.appOptions(id)`, 15 looks | shipped | `agent-api/looks/looks.ts`, `lookPresets.ts` | Rendered in tagline-check. Note: `product-studio` shows a light backdrop rather than its `#2b2f36` value |
| `model(assets.x)` typed GLB, `targetHeight` | shipped | `agent-api/nodes/`; `defineAuraAssets`, `defineModelAssets` | tagline-check; `tests/unit/agent-api/public-example-boundary.test.ts` |
| `camera.*` incl. `camera.frameAsset`, `cameras.chase/cube/array/stereo` | shipped | `agent-api/nodes/camera.ts:200`, `cameras.ts` | `frameAsset` framed the hero in tagline-check run 2 |
| `interactions.orbit` and pointer/keyboard interactions | shipped | `agent-api/nodes/` | Bench PBR viewer; template route-health asserts orbit |
| `environments.*` (hdri, presets, neutral) | shipped | `agent-api/` environments; neutral embedded in `@aura3d/rendering` | Bench PBR viewer; `evidence/neutral-embedded/` |
| `effects.bloom`, `effects.shaderPass`, `effects.fog`, `effects.toon` | shipped | `agent-api/nodes/effects*.ts` | Bench PBR viewer (bloom), shader water (shader pass), forest (fog); toon since 4.1.3 |
| Other effects (AO, colour grade, vignette, DoF, contact shadows) | partial | `agent-api/nodes/effects*.ts`, `postPresets.ts` | Used by looks and games; no per-effect pixel receipt |
| `material.*` PBR builders, `material.custom` GLSL with chunks | shipped | `agent-api/nodes/material.ts`, `agent-api/compiler/customMaterial.ts` | Bench; `docs/rendering/pbr-gltf-correctness.md`; `tests/unit/custom-shader-precision` |
| `instances.*`, `batched.mesh`, `distanceLod`, `text3D` | shipped | `agent-api/nodes/instances.ts` | `docs/rendering/geometry-instancing-lod-text.md`; forest bench builds |
| Skinned GLB playback, named clips, cross-fade, morphs (root) | shipped | `AnimationController`, typed GLB actors | `docs/rendering/animation.md`; bench skinned character |
| Layers, root motion, retargeting, two-bone IK | partial | `@aura3d/animation` | Package-level only (`claims-and-boundaries.md` §4) |
| `sceneKits.*` (10 kits) | partial | `agent-api/` scene kits | `sceneKits.materialLab()` is the root-proven kit (`llms.txt`); others need per-kit pixels |
| Game kit `@aura3d/engine/game` (HUD, touch, juice, session, sound) | shipped | `packages/game/src/index.ts` | `docs/api/game-kit.md`; used by the shipped games |
| Genre kits: `racketSports`, `arcadeKart`, `carSoccer`, fighting, platformer motion | partial | root exports (`docs/api/root-exports.md`, 27 game-kit exports) | Root-tested building blocks; opponent AI, levels and art are per game (`claims-and-boundaries.md` §6) |
| Root `createGame` | experimental | `packages/engine/src/contracts/stubs/game.ts` | Headless stub; use `@aura3d/engine/game` |
| QA kit: `createFixedStepLoop`, `createCountedRng`, `installQaHooks` | shipped | `packages/engine/src/qa/` | `docs/api/qa-kit.md`; bench game loop |
| Motion kit and render interpolation (120/144 Hz) | shipped | `createRenderInterpolator`, `createFixedStepPresenter` | `docs/api/motion-presenter.md` (50% to 0% stalled frames at 120 Hz) |
| Safety net, frame error boundary | shipped | `packages/debug/src/safety` | `docs/api/safety-net.md`; `tests/unit/agent-api/on-frame-errors.test.ts` |
| Audio synth: cue bank, step sequencer, tone loop | shipped | `packages/audio/src/synth` | `docs/api/audio-synth.md` |
| `physics.*` root namespace | partial | root `physics`; `@aura3d/physics`, `@aura3d/physics-rapier` | Package tests; no generic root collision claim (`claims-and-boundaries.md` §4) |
| `tsl` (62 names), `compute`, WebGPU backend | experimental | `agent-api/nodes/tsl/index.ts`, `compute.ts` | WebGPU is opt-in; no real-GPU runs (`evidence/real-gpu/README.md`) |
| `xr` | experimental | root `xr` | Injected sessions only (`docs/rendering/controls-picking-xr-context.md`) |
| React adapter `@aura3d/react` | experimental | `packages/react/src/index.ts` | Not checked in this audit |

## Toolchain (`@aura3d/cli`, source `packages/aura3d-cli/src/`)

| Capability | Label | Code | Evidence |
|---|---|---|---|
| `assets add`, `assets typegen` (manifest + `src/aura-assets.ts`) | shipped | `asset-manifest.ts`, `cli.ts` | Template `aura.assets.json` and generated `src/aura-assets.ts`; tagline-check |
| `assets search`, `assets resolve` (project, open sources, Meshy, primitives) | shipped | `resolve-ladder.ts` | `tests/unit/aura3d-cli/resolve-ladder.test.ts`. There is no hosted catalog (`docs/audit/asset-catalog-claim.md`) |
| `assets inspect`, `optimize`, `merge-clips`, `thumbnail`, `repair-skin` | shipped | `cli-help.ts`, `commands/assets/` | `aura3d --help` |
| `assets validate --release`, licence and provenance gates | shipped | `asset-source-validation.ts`, `index.ts` | `tests/unit/aura3d-cli/asset-provenance-license-coherence.test.ts` |
| `assets import-meshy` and `meshy ledger` | shipped | `meshy/`, `commands/meshyLedger.ts` | `meshy-cli` skill; local candidate ingestion only |
| `check-deploy --dist [--release]` | shipped (static checks) | `index.ts:1097` | `tests/unit/aura3d-cli/deployment.test.ts`. Checks hashed assets, unreferenced files and validation; it does not load routes or read the console |
| `doctor` | shipped | `index.ts` (manifest checks); `doctor --look` forwards to `look lint` | `cli.ts:390` |
| `look capture`, `look judge`, `look lint`, `look rubric`, `evidence judge` | shipped | `commands/` registry | `aura3d --help` lane commands |
| `migrate three` codemod | partial | `migrate-three/mappings.ts` (245 rows: 21 exact, 174 approximate, 47 none, 3 pending) | `tests/unit/aura3d-cli/migrate-three*.test.ts`; output is a worklist, not a drop-in port |
| `init --agent` (skills + `llms.txt` into a project) | shipped | `cli.ts` | `create-aura3d --help` (`--agent`, `--skills`) |

## Templates, skills, docs

| Capability | Label | Code | Evidence |
|---|---|---|---|
| `create-aura3d`, 20 templates | shipped | `packages/create-aura3d/templates/` | Every template has route-health and screenshot specs. Stock build smoke: hello world plus 4 templates (`evidence/stock-build/`); product-viewer built and rendered in tagline-check |
| 14 agent skills, `pnpm check:skills`, `pnpm skills:sync` | shipped | `packages/aura3d-cli/skills/`; root `package.json` scripts | Gate script `tools/agent-skills/check.ts` |
| `llms.txt`, `llms-full.txt`, recipes, type-traps table | shipped | `llms.txt`, `docs/agents/recipes.md` | Cold-start trial: 8 to 14 of 15 renders, 40 to 10 median turns (`evidence/agent-eval/baseline1/NOTES.md`) |

## Framing note

The audit brief described Aura3D as built on three.js. The code says otherwise, and the owner confirmed Aura3D is a competitor: `@aura3d/engine` has no `three` dependency, no runtime package imports `three` (only the codemod's `parse.ts` and `emit.ts` do), and rendering runs through `@aura3d/rendering`. Sixteen renderer shader files carry three r185 code under MIT and say so in their headers. Claims in the positioning doc are framed engine against engine.
