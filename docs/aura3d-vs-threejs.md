# Why Aura3D over three.js

Version: 4.3.7

Every claim on this page names its source, so a developer who checks it finds the same number. Per-capability status (shipped, partial, experimental) with code paths is in [`comparisons/aura3d-capability-audit.md`](comparisons/aura3d-capability-audit.md).

## The pitch

three.js gives you a renderer. Everything after that is your job: loaders, environment lighting, shadows, post-processing, controls, the game loop, the HUD, audio, asset handling, licensing and the deploy checks. Aura3D ships all of that as one engine and one toolchain, with its own renderer, a typed declarative scene and an asset pipeline that will not let an unverified model reach production. It is built from the start to be written by AI coding agents.

Aura3D is a standalone engine. `@aura3d/engine` has no `three` dependency; it renders through its own `@aura3d/rendering` package.

## A lit 3D product in 10 lines

This file builds and renders on a stock `create-aura3d` project (`tools/bench-vs-threejs/tagline/aura-variants/hero.ts`):

```ts
import { camera, createAuraApp, interactions, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(model(assets.product, { name: "product", targetHeight: 1.6, castShadow: true }))
    .add(interactions.orbit({ target: "product" }))
    .camera(camera.frameAsset(assets.product, { targetHeight: 1.6 })),
  ...looks.appOptions("product-studio")
});
```

It loads a GLB, lights it with an HDRI studio look, casts a shadow, frames the camera on the model and enables orbit controls.

The matched three.js app loads the same GLB and HDRI and sets up a PMREM environment, a shadow-casting key light, tone mapping, MSAA, model framing, resize and the render loop. It is 38 lines before orbit controls, and 55 with the same post stack (`tools/bench-vs-threejs/tagline/three-minimal/main.ts` and `three-look/main.ts`).

Counting rule: non-blank, non-comment lines, imports included, the same rule as `tools/bench-vs-threejs/harness/static-metrics.mjs`. Evidence and frames: [`evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/README.md) and [run 2](../evidence/vs-threejs/tagline-check/run2/README.md). The three.js apps were written to match the look's documented values; they are not pixel-matched to the Aura3D frame. Software WebGL2 on a CPU runner.

Beyond the hero, the five-scene benchmark has a PBR viewer with HDR lighting, shadow, bloom and orbit controls in 24 lines instead of 49, with 1 import instead of 8. Across the benchmark, Aura3D scene code is up to 51% shorter in 4 of 5 scenes ([`RESULTS.md`](../evidence/vs-threejs/RESULTS.md) sections 1 and 3). Aura3D benchmark, five scenes.

## Where Aura3D wins

| What you need | With Aura3D | With three.js | Source |
|---|---|---|---|
| A good-looking scene on first run | `looks.preset(id)` supplies HDRI lighting, a shadow-casting key light, background, grade and post effects in one call. 15 genre looks | Environment, tone mapping and shadows are set up by hand | `packages/engine/src/agent-api/looks/lookPresets.ts`; `RESULTS.md` section 11 |
| Scene code | 4 of 5 benchmark scenes are shorter, by 26% to 51%: viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82 | Longer in those scenes | `RESULTS.md` section 1 |
| Imports and concepts | 1 import module; fewer API symbols in every benchmark scene | Up to 8 modules (core plus addons) | `RESULTS.md` section 3 |
| Bloom, shadows, custom post pass | One call each: `effects.bloom()`, `shadow: true`, `effects.shaderPass()` | `EffectComposer` plus 3 or 4 addon passes; shadow flags on every mesh | `RESULTS.md` section 11 |
| 10,000 instances with per-instance colour | Declarative `instances.*({ transforms, colors })` | Hand-written `InstancedMesh` matrix code | `RESULTS.md` section 11 |
| Character animation | Switch clips by name with cross-fade (`handle.play("Run", { crossFade })`) and fit the character to a height with one `targetHeight` option | `AnimationMixer`, `clipAction`, manual fitting with `Box3` | `RESULTS.md` section 11 |
| Type-safe assets | `model(assets.robot)`: a generated typed key, so a missing asset is a compile error | Asset paths are plain strings, checked at run time | `templates/product-viewer/src/aura-assets.ts`; `tests/unit/agent-api/public-example-boundary.test.ts` |
| Asset licence and integrity | Every admitted model records source, licence, author and sha256. In production, a model without a valid hash and same-origin URL does not draw | Loads any file from any URL | `docs/agents/claims-and-boundaries.md` sections 5 and 6; `docs/api/model-loader.md` |
| Getting assets | `aura3d assets search` and `resolve` pull licence-tagged open models (CC0, CC-BY) and type them; Meshy generation, optimization, inspection and thumbnails from the same CLI | Bring your own files and tools | `packages/aura3d-cli/src/cli-help.ts` |
| A deploy gate | `aura3d check-deploy --dist dist` fails the build on a missing hashed asset, unreferenced files and asset-validation errors; `--release` adds licence and quality gates | Not included | `packages/aura3d-cli/src/index.ts:1097` |
| Game shell | HUD, touch controls, juice and session flow (`@aura3d/engine/game`); genre kits for racket sports, karting, car soccer, fighting and platformer motion | Not included | `docs/api/root-exports.md` (27 exports in the game kit); `docs/api/game-kit.md` |
| Fixed timestep, replay and QA | `createFixedStepLoop`, seeded `createCountedRng`, `installQaHooks` for scripted, repeatable test runs | Write your own | `packages/engine/src/qa/`; `docs/api/qa-kit.md` |
| Smooth motion on 120 and 144 Hz screens | `createRenderInterpolator` and `createFixedStepPresenter`: a 60 Hz simulation no longer freezes on every second frame at 120 Hz (50% stalled frames before, 0% after) | Write your own | `docs/api/motion-presenter.md` |
| Blank-screen protection | `installSafetyNet` detects black frames and recovers; `createFrameErrorBoundary` keeps rendering after a throwing frame callback; `?diag=1` diagnostics panel | Not included | `packages/debug/src/safety`; `docs/api/safety-net.md` |
| Game audio | Procedural cue bank, step sequencer and tone loops on one shared audio context | Positional audio primitives | `packages/audio/src/synth`; `docs/api/audio-synth.md` |
| Shader safety | `material.custom` GLSL with a chunk library (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) and loud compile errors | `ShaderMaterial` with uniforms and varyings declared by hand | `docs/api/glsl-chunks.md`; `RESULTS.md` section 11 |
| Working with AI coding agents | `llms.txt`, 14 agent skills, compiled recipes and a type-traps table, written into every new project by `create-aura3d` | No official agent docs | `packages/aura3d-cli/skills/`; `create-aura3d --help` |
| Coming from three.js | `aura3d migrate three` maps 245 three.js constructs and writes an annotated port worklist | n/a | `packages/aura3d-cli/src/migrate-three/mappings.ts`; [`migration/from-threejs.md`](migration/from-threejs.md) |
| Starting a project | 20 `create-aura3d` templates (product viewer, mini-game, racing, falling blocks, fighting, arena shooter, character controller, animation studio and more), each with route-health and screenshot tests | Generic Vite templates | `packages/create-aura3d/templates/` |
| Proof it ships | 25 playable games built on Aura3D | n/a | `docs/workflows/game-inventory.json`; showcase at https://aura3d.auraone.ai/apps/showcase-index/ |

## The moat

What a team cannot rebuild by adding a library or two:

1. **Assets that are typed, hashed and licensed end to end, enforced at run time.** The CLI admits each model with provenance and a hash and generates the typed key. `check-deploy` fails the build when a hashed file is missing, and the renderer refuses to draw an unverified model. If you ship AI-generated or third-party art, this is the licensing and supply-chain answer.
2. **An engine designed to be written by AI agents, and tuned by measurement.** The API, docs, recipes and skills ship together and are improved by a repeatable cold-start trial (`tools/agent-eval`). In that trial, fresh agents working from the Aura3D docs alone went from 8 to 14 working scenes out of 15, and from 40 to 10 median turns, and every first build compiled (15 of 15). One model, five small tasks, 40-turn budget, software WebGL2 (`evidence/agent-eval/baseline1/NOTES.md`).
3. **The whole game stack in one install.** Fixed-step loop, seeded replay, QA hooks, safety net, high-refresh interpolation, HUD, touch, audio and genre kits, proven across 25 shipped games.
4. **Quality gates built into the product.** The public-example boundary test, route-health specs in all 20 templates, `assets validate --release` and `check-deploy`. Teams adopting Aura3D get the release process along with the code.

## Migrating from three.js

`aura3d migrate three` classifies 245 three.js constructs (21 exact, 174 approximate, 47 none, 3 pending, counted from `packages/aura3d-cli/src/migrate-three/mappings.ts`) and writes an annotated worklist for the port. The codemod is a helper for porting, not a compatibility layer: the port itself is a rewrite against `@aura3d/engine`. The verified mapping for the 40 most common APIs, the steps and a measured before and after are in [`migration/from-threejs.md`](migration/from-threejs.md).

## What we measured and how

- **Benchmark** (`tools/bench-vs-threejs/`): five scenes plus a one-cube baseline, each built twice (three.js, Aura3D) as a standalone Vite app. Metrics: scene lines and tokens, imports, draw calls and correctness. Method and qualifiers: [`tools/bench-vs-threejs/README.md`](../tools/bench-vs-threejs/README.md); results: [`evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md). Aura3D benchmark, five scenes, software WebGL2 at 640x360, one author.
- **Hero line count** (`tools/bench-vs-threejs/tagline/`): a stock `create-aura3d` product-viewer scaffold and two matched three.js apps, built with a stock `vite build` and rendered on a remote runner with software WebGL2. Results: [`evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/README.md).
- **Cold-start trial** (`tools/agent-eval/`): fresh agents with no repo context in isolated sandboxes, the Aura3D arm with the packed library and entry docs only, scored remotely on first-try typecheck, first-try build, non-black render and turns. Results: [`evidence/agent-eval/baseline1/NOTES.md`](../evidence/agent-eval/baseline1/NOTES.md).
- **Motion on high-refresh screens**: stalled-frame figures are in [`api/motion-presenter.md`](api/motion-presenter.md).

All timings and render checks come from a CPU-only remote runner with software WebGL2. Line counts are static counts of the source files and do not depend on the renderer.

## Reproduce

```sh
RUN_ID=tagline-$(date -u +%H%M%S) SPECS="tests/browser/tagline-check.spec.ts" tools/remote-acr/run.sh
```

`tools/bench-vs-threejs/tagline/build.mjs` scaffolds `create-aura3d@latest`, builds the Aura3D scenes and the two three.js apps with a stock `vite build`, and the spec renders each one. The extracted results and frames are in `evidence/vs-threejs/tagline-check/`. To get the hero locally:

```sh
npx create-aura3d@latest my-scene --template product-viewer
```
