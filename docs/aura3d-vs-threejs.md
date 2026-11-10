# Why Aura3D over three.js

Version: 5.5.1

Every claim on this page names its source, so a developer who checks it finds the same number. Per-capability status (shipped, partial, experimental) with code paths is in [`comparisons/aura3d-capability-audit.md`](comparisons/aura3d-capability-audit.md).

## The pitch

three.js gives you a renderer. Everything after that is your job: loaders, environment lighting, shadows, post-processing, controls, the game loop, the HUD, audio, asset handling, licensing and the deploy checks. Aura3D ships all of that as one engine and one toolchain, with its own renderer (WebGPU with a WebGL2 fallback, optionally in a worker), a typed declarative scene and an asset pipeline that will not let an unverified model reach production. It is built from the start to be written by AI coding agents.

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

Beyond the hero, the five-scene benchmark has a PBR viewer with HDR lighting, shadow, bloom and orbit controls in 24 lines instead of 49, with 1 import instead of 8. Across the benchmark (five small scenes, one author, lines of scene code), Aura3D scene code is up to 51% shorter in 4 of 5 scenes ([`RESULTS.md`](../evidence/vs-threejs/RESULTS.md) sections 1 and 3). Aura3D benchmark, five scenes.

## Eight reasons, each with the code or evidence behind it

Everything below shipped through 5.5.1 ([`CHANGELOG.md`](../CHANGELOG.md), sections 5.5.1, 5.5.0 and 5.3.0). Each reason names its source and the scope of the check behind it.

### 1. A typed, declarative scene with typed assets

You describe the scene; `createAuraApp` owns the renderer, the loop, resize and disposal. Assets come in through the CLI, which records source, licence, author and sha256 and generates a typed key:

```bash
npx @aura3d/cli@latest assets search "robot"
npx @aura3d/cli@latest assets resolve "robot" --name robot   # writes aura.assets.json and src/aura-assets.ts
```

<!-- aura3d-docs-example: exempt Excerpt: needs the src/aura-assets.ts module the resolve command above generates. -->
```ts
import { camera, createAuraApp, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(looks.preset("product-studio"))
    .add(model(assets.robot, { name: "robot", targetHeight: 1.8 }))
    .camera(camera.auto({ subject: "robot" })),
  ...looks.appOptions("product-studio")
});
```

`assets.robot` is a generated key, so a misspelt or missing asset is a TypeScript error, not a 404 at run time. In production, a model without a valid hash and same-origin URL does not draw. Sources: `templates/product-viewer/src/aura-assets.ts`, `tests/unit/agent-api/public-example-boundary.test.ts`, [`docs/api/model-loader.md`](api/model-loader.md), [`agents/claims-and-boundaries.md`](agents/claims-and-boundaries.md) sections 5 and 6.

### 2. WebGPU with a WebGL2 fallback, one option

```ts
import { createAuraApp, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene().add(primitives.box({ name: "crate" })),
  renderer: { backend: "auto" } // WebGPU first; WebGL2 on the same canvas if WebGPU cannot start
});
void app.ready().then(() => console.log(app.diagnostics().renderer?.backendSelection));
```

The same scene code runs on both backends: post effects (SSAO/GTAO, screen-space reflections, depth of field, god rays, motion blur, volumetric light, bloom, grade), sky, fog, particles and generated PBR have native WGSL paths. All 30 showcase games ship with `backend: "auto"` and run on WebGPU by default; `?backend=webgl2` opts any of them out. A game was switched only after a real-GPU check showed the same frame as WebGL2 with 0 errors.

Scope: the switch checks ran on one Apple GPU (M4 Max, headless Chrome, Dawn for WebGPU, ANGLE Metal for WebGL2). The frame-rate ratios used to decide each switch are recorded per game and are not performance claims. Without the option, `createAuraApp` uses WebGL2. Sources: CHANGELOG 5.3.0 ("WebGPU parity"), 5.5.0 and 5.5.1 ("WebGPU draw path"); per-game tables in [`upgrade-5.0.0/README.md`](upgrade-5.0.0/README.md); selection rules in [`rendering/native-backends.md`](rendering/native-backends.md).

### 3. Worker rendering, opt-in

Move rendering off the main thread with one option. Game code keeps running on the main thread:

```ts
import { createAuraApp, primitives, scene } from "@aura3d/engine";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

const app = createAuraApp("#app", {
  scene: scene().add(primitives.box({ name: "crate" }).runtime({ id: "crate", mutable: true })),
  worker: { createWorker: createWorkerRendererWorker, fallback: "main-thread" }
});
app.onFrame((f) => app.nodes.require("crate").setRotation(0, f.time, 0)); // patches cross to the worker
```

Worker apps get `app.nodes` patches, frame callbacks, step and advance, and host-side picking; a node method whose effect cannot be replayed in the worker throws a typed `AuraWorkerError` instead of failing silently. From 5.5.1, `app.diagnostics().fps` counts the frames the worker presents. All 30 showcase games render in a worker with `?worker=1` (13 from 5.3.0, the other 17 from 5.5.0). On the 2026-11-08 real-GPU check of those 17, each title frame matched the main-thread frame (mean absolute difference 0.1 to 5.7 of 255 over two runs; the high end is animated scenes) and each game started and played with no errors.

Scope: opt-in, checked on one Apple GPU; no claim is made that the worker path is faster than the main thread. Physics (`app.physics` and scene bodies), DOM labels and the diagnostics overlay stay with main-thread apps; the worker app tells you so with `AuraWorkerError`. Sources: CHANGELOG 5.3.0, 5.5.0 and 5.5.1 ("Worker rendering"); [`agents/native-capability-recipes.md`](agents/native-capability-recipes.md) (`worker-render`).

### 4. A good-looking frame with no setup

A bare scene no longer needs a lighting rig to read well:

```ts
import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

createAuraApp("#app", {
  scene: scene()
    .add(lights.key({ target: [0, 0.8, 0] })) // casts a shadow by default, with an acne-free bias
    .add(primitives.plane({ name: "floor", size: [8, 1, 8] })) // primitives receive shadows by default
    .add(primitives.sphere({ name: "steel", size: 1.6, material: material.pbr({ color: "#c9ccd1", metallic: 1, roughness: 0.2 }) }).position(0, 0.8, 0))
    .camera(camera.auto({ subject: "steel", fill: 0.6 })) // framed from the subject's drawn bounds
});
```

- **Plain look.** A lit scene with no authored look, output or post effect renders through a neutral output that keeps your authored colours (`looks.preset("plain")` asks for it; `plainLook: false` opts out).
- **Built-in reflection environment.** With no environment authored, metal and glass reflect a structured studio room generated in code (no file fetch).
- **Framing and shadows.** `camera.auto({ subject, angle, fill })`, `camera.framePose` and `measureFrameFill` place the camera from what the scene draws; `lights.key` casts a shadow by default.
- **Colours.** Every CSS colour form parses wherever a colour is accepted; an invalid one throws `COLOR_INVALID` naming the value and option.

Sources: CHANGELOG 5.3.0, "Agent-authoring baseline" N1 to N4; [`evidence/n4-frame/README.md`](../evidence/n4-frame/README.md) (a requested fill of 0.8 measured 0.800 on a real GPU); `evidence/n2-env/`. For a finished art direction, `looks.preset(id)` still supplies HDRI lighting, a key, background, grade and post effects in one call (15 genre looks).

### 5. Tooling built for AI coding agents

Every `create-aura3d` project gets `llms.txt`, 14 Aura3D skills and compiled recipes. The CLI lets an agent author, check and look at its own work without leaving the terminal:

```bash
npx @aura3d/cli@latest info --name material.pbr        # installed signature and option keys
npx @aura3d/cli@latest examples "gold product on a pedestal"   # nearest working recipe or template
npx @aura3d/cli@latest validate                        # lint, colour grammar, unknown names, framing, lighting
npx @aura3d/cli@latest render --json                   # build, screenshot, luma, saturation and subject fill
```

Names that models carry over from three.js resolve instead of failing: `handle.setColor`, `setIntensity`, `setOpacity` and `setEmissive`; `material.standard` (the same as `material.pbr`); tone-mapping spellings such as `"aces-filmic"`, `ACESFilmicToneMapping` and `AgX`. A name with different meaning throws an error that names the Aura3D call (`TONE_MAPPING_UNKNOWN`, `HANDLE_METHOD_UNSUPPORTED`). The aliases came from 1,884 benchmark transcripts.

Sources: CHANGELOG 5.3.0 N6 and N7; [`agents/agent-tools.md`](agents/agent-tools.md); [`agents/guessable-api.md`](agents/guessable-api.md); `evidence/guessed-names-n7/`; `packages/aura3d-cli/skills/`.

### 6. Bring existing three.js work with you

Two routes, depending on what you have:

- **Procedural content** (a function that builds a three.js scene): `aura3d import-three` runs it headless at build time, exports a GLB, admits it as a typed asset and writes an editable Aura3D scene plus a report of what was carried, approximated or left out. Clips, simple `ShaderMaterial`s, lights, the camera and renderer output come across. `three` stays a dev dependency; the shipped route imports only `@aura3d/engine`. Regenerating keeps your edits, because node ids are stable.

  ```bash
  npm i -D three
  npx @aura3d/cli@latest import-three recipes/windmill.mjs
  ```

- **Hand-written app code**: `aura3d migrate three` classifies 245 three.js constructs (48 exact, 150 approximate, 47 none) and writes an annotated worklist for the rewrite.

Scope: the bridge is labelled `prototype` and every run writes its report; the codemod helps port and is not a compatibility layer. Sources: [`agents/three-bridge.md`](agents/three-bridge.md); CHANGELOG 5.3.0 and 5.5.0; `packages/aura3d-cli/src/migrate-three/mappings.ts`; [`migration/from-threejs.md`](migration/from-threejs.md).

### 7. A deploy gate

```bash
npm run build
npx @aura3d/cli@latest check-deploy --dist dist             # missing hashed assets, unreferenced files, asset validation
npx @aura3d/cli@latest check-deploy --dist dist --browser   # also loads every route in headless Chromium: failed requests, console errors
npx @aura3d/cli@latest check-deploy --dist dist --release   # adds licence and quality gates
```

Source: `packages/aura3d-cli/src/cli-help.ts` and `packages/aura3d-cli/src/index.ts` (check-deploy).

### 8. 30 playable games as proof

The [showcase](https://aura3d.auraone.ai/apps/showcase-index/) has 30 playable games across racing, sports, action, platformers and arcade, built on the same public API and kits, all on WebGPU by default and all able to render in a worker. Source: `docs/workflows/game-inventory.json`.

## Agent-authoring benchmark (C1)

A fixed comparison of an AI agent building the same eight scenes in Aura3D and in three.js (turns, tokens, wall time, cost, visual quality and correctness per arm), frozen before any run in `tests/reports/benchmark-c1/SPEC.md`, is running against the published 5.5.x packages.

<!-- C1-RESULTS: turns, tokens and time per arm (Aura3D vs three.js), with the run date and method line, go here. -->

Results pending.

## Where Aura3D wins

| What you need | With Aura3D | With three.js | Source |
|---|---|---|---|
| A good-looking scene on first run | A bare scene gets a neutral output that keeps authored colours, a built-in studio reflection environment, a shadow-casting `lights.key` and `camera.auto` framing. `looks.preset(id)` adds HDRI lighting, background, grade and post effects in one call (15 genre looks) | Environment, tone mapping, shadows and camera placement are set up by hand | CHANGELOG 5.3.0 N1 to N4; `packages/engine/src/agent-api/looks/lookPresets.ts`; `RESULTS.md` section 11 |
| WebGPU | `renderer: { backend: "auto" }`: WebGPU first, WebGL2 fallback on the same canvas, same scene code. All 30 showcase games run on WebGPU by default (`?backend=webgl2` opts out) | A separate `WebGPURenderer` from `three/webgpu` that you choose and wire yourself | CHANGELOG 5.3.0 to 5.5.1; `docs/upgrade-5.0.0/README.md` |
| Rendering off the main thread | `worker: { createWorker }`, with node patches, frame callbacks and picking from the main thread; all 30 showcase games run with `?worker=1` | `OffscreenCanvas` plumbing and a message protocol of your own | CHANGELOG 5.3.0, 5.5.0, 5.5.1 |
| Scene code | 4 of 5 benchmark scenes are shorter, by 26% to 51%: viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82 | Longer in those scenes | `RESULTS.md` section 1 |
| Imports and concepts | 1 import module; fewer API symbols in every benchmark scene | Up to 8 modules (core plus addons) | `RESULTS.md` section 3 |
| Bloom, shadows, custom post pass | One call each: `effects.bloom()`, `shadow: true`, `effects.shaderPass()` | `EffectComposer` plus 3 or 4 addon passes; shadow flags on every mesh | `RESULTS.md` section 11 |
| 10,000 instances with per-instance colour | Declarative `instances.*({ transforms, colors })` | Hand-written `InstancedMesh` matrix code | `RESULTS.md` section 11 |
| Character animation | Switch clips by name with cross-fade (`handle.play("Run", { crossFade })`) and fit the character to a height with one `targetHeight` option | `AnimationMixer`, `clipAction`, manual fitting with `Box3` | `RESULTS.md` section 11 |
| Type-safe assets | `model(assets.robot)`: a generated typed key, so a missing asset is a compile error | Asset paths are plain strings, checked at run time | `templates/product-viewer/src/aura-assets.ts`; `tests/unit/agent-api/public-example-boundary.test.ts` |
| Asset licence and integrity | Every admitted model records source, licence, author and sha256. In production, a model without a valid hash and same-origin URL does not draw | Loads any file from any URL | `docs/agents/claims-and-boundaries.md` sections 5 and 6; `docs/api/model-loader.md` |
| Getting assets | `aura3d assets search` and `resolve` pull licence-tagged open models (CC0, CC-BY) and type them; Meshy generation, optimization, inspection and thumbnails from the same CLI | Bring your own files and tools | `packages/aura3d-cli/src/cli-help.ts` |
| A deploy gate | `aura3d check-deploy --dist dist` fails the build on a missing hashed asset, unreferenced files and asset-validation errors; `--browser` loads every route in headless Chromium and fails on failed requests and console errors; `--release` adds licence and quality gates | Not included | `packages/aura3d-cli/src/index.ts:1097` |
| Game shell | HUD, touch controls, juice and session flow (`@aura3d/engine/game`); genre kits for racket sports, karting, car soccer, fighting and platformer motion | Not included | `docs/api/root-exports.md` (27 exports in the game kit); `docs/api/game-kit.md` |
| Fixed timestep, replay and QA | `createFixedStepLoop`, seeded `createCountedRng`, `installQaHooks` for scripted, repeatable test runs | Write your own | `packages/engine/src/qa/`; `docs/api/qa-kit.md` |
| Smooth motion on 120 and 144 Hz screens | `createRenderInterpolator` and `createFixedStepPresenter`: a 60 Hz simulation no longer freezes on every second frame at 120 Hz (50% stalled frames before, 0% after) | Write your own | `docs/api/motion-presenter.md` |
| Blank-screen protection | `installSafetyNet` detects black frames and recovers; `createFrameErrorBoundary` keeps rendering after a throwing frame callback; `?diag=1` diagnostics panel | Not included | `packages/debug/src/safety`; `docs/api/safety-net.md` |
| Game audio | Procedural cue bank, step sequencer and tone loops on one shared audio context | Positional audio primitives | `packages/audio/src/synth`; `docs/api/audio-synth.md` |
| Shader safety | `material.custom` GLSL with a chunk library (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) and loud compile errors | `ShaderMaterial` with uniforms and varyings declared by hand | `docs/api/glsl-chunks.md`; `RESULTS.md` section 11 |
| Working with AI coding agents | `llms.txt`, 14 agent skills, compiled recipes and a type-traps table, written into every new project by `create-aura3d`; `aura3d info`, `examples`, `validate` and `render`; three.js names that models guess resolve or throw an error naming the Aura3D call | No official agent docs | `packages/aura3d-cli/skills/`; `docs/agents/agent-tools.md`; `docs/agents/guessable-api.md` |
| Coming from three.js | `aura3d import-three` turns a three.js scene factory into a typed asset plus an editable Aura3D scene (prototype); `aura3d migrate three` maps 245 three.js constructs and writes an annotated port worklist | n/a | `docs/agents/three-bridge.md`; `packages/aura3d-cli/src/migrate-three/mappings.ts`; [`migration/from-threejs.md`](migration/from-threejs.md) |
| Starting a project | 26 `create-aura3d` templates (product viewer, mini-game, racing, falling blocks, fighting, arena shooter, character controller, animation studio, five GPU-checked starters and more), each with route-health and screenshot tests | Generic Vite templates | `packages/create-aura3d/templates/` |
| Proof it ships | 30 playable games built on Aura3D | n/a | `docs/workflows/game-inventory.json`; showcase at https://aura3d.auraone.ai/apps/showcase-index/ |

## The moat

What a team cannot rebuild by adding a library or two:

1. **Assets that are typed, hashed and licensed end to end, enforced at run time.** The CLI admits each model with provenance and a hash and generates the typed key. `check-deploy` fails the build when a hashed file is missing, and the renderer refuses to draw an unverified model. If you ship AI-generated or third-party art, this is the licensing and supply-chain answer.
2. **An engine designed to be written by AI agents, and tuned by measurement.** The API, docs, recipes and skills ship together and are improved by a repeatable cold-start trial (`tools/agent-eval`). In that trial, fresh agents working from the Aura3D docs alone went from 8 to 14 working scenes out of 15, and from 40 to 10 median turns, and every first build compiled (15 of 15). One model, five small tasks, 40-turn budget, software WebGL2 (`evidence/agent-eval/baseline1/NOTES.md`).
3. **The whole game stack in one install.** Fixed-step loop, seeded replay, QA hooks, safety net, high-refresh interpolation, HUD, touch, audio and genre kits, proven across 30 shipped games.
4. **Quality gates built into the product.** The public-example boundary test, route-health specs in all 26 templates, `assets validate --release` and `check-deploy`. Teams adopting Aura3D get the release process along with the code.

## Measured on the published 4.5.0 package

These are facts about Aura3D alone, each from a line that passes in `evidence/vs-threejs/4.5.0/gate.txt`:

- A one-cube scene reaches its first frame in about 420 ms (median of 3 cold loads).
- A one-cube scene draws in 1 call. A PBR viewer scene with a shadow and bloom draws in 25 (33 on 4.3.7).
- The five benchmark scenes log no console warnings or errors.
- Every option covered by `tests/unit/agent-api/option-coverage.test.ts` either takes effect or raises `OPTION_IGNORED`: 16 of 16 tests pass.
- A one-cube scene is 12 lines of scene code and the shader-water scene is 71 (hand-tuned single sources, not independent authors).

Method: published `@aura3d/engine@4.5.0` installed from the registry, stock `vite build`, 640x360, software WebGL2 on a remote CPU runner, one run. These are not GPU numbers. Targets that did not pass carry no claim and are listed with their causes in [`evidence/vs-threejs/RESULTS-4.5.0.md`](../evidence/vs-threejs/RESULTS-4.5.0.md).

## Migrating from three.js

`aura3d migrate three` classifies 245 three.js constructs (48 exact, 150 approximate, 47 none, 0 pending, counted from `packages/aura3d-cli/src/migrate-three/mappings.ts`) and writes an annotated worklist for the port. For procedural content, `aura3d import-three` runs a three.js scene factory at build time and hands you a typed asset, an editable Aura3D scene and a carried / approximated / unsupported report ([`agents/three-bridge.md`](agents/three-bridge.md), prototype). The codemod is a helper for porting, not a compatibility layer: the port itself is a rewrite against `@aura3d/engine`. The verified mapping for the 40 most common APIs, the steps and a measured before and after are in [`migration/from-threejs.md`](migration/from-threejs.md).

## What we measured and how

- **Benchmark** (`tools/bench-vs-threejs/`): five scenes plus a one-cube baseline, each built twice (three.js, Aura3D) as a standalone Vite app. Metrics: scene lines and tokens, imports, draw calls and correctness. Method and qualifiers: [`tools/bench-vs-threejs/README.md`](../tools/bench-vs-threejs/README.md); results: [`evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md). Aura3D benchmark, five scenes, software WebGL2 at 640x360, one author.
- **Hero line count** (`tools/bench-vs-threejs/tagline/`): a stock `create-aura3d` product-viewer scaffold and two matched three.js apps, built with a stock `vite build` and rendered on a remote runner with software WebGL2. Results: [`evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/README.md).
- **Cold-start trial** (`tools/agent-eval/`): fresh agents with no repo context in isolated sandboxes, the Aura3D arm with the packed library and entry docs only, scored remotely on first-try typecheck, first-try build, non-black render and turns. Results: [`evidence/agent-eval/baseline1/NOTES.md`](../evidence/agent-eval/baseline1/NOTES.md).
- **Motion on high-refresh screens**: stalled-frame figures are in [`api/motion-presenter.md`](api/motion-presenter.md).
- **WebGPU and worker defaults in the showcase games**: paired real-GPU runs per game (Apple M4 Max, headless Chrome, title screen), the default page against `?backend=webgl2` or the main-thread page, frame difference and errors recorded. Tables and method: [`upgrade-5.0.0/README.md`](upgrade-5.0.0/README.md). The frame-rate ratios decided each switch and are not performance claims.

The benchmark, hero and cold-start timings and render checks come from a CPU-only remote runner with software WebGL2; the WebGPU and worker checks are the real-GPU runs above. Line counts are static counts of the source files and do not depend on the renderer.

## Reproduce

```sh
RUN_ID=tagline-$(date -u +%H%M%S) SPECS="tests/browser/tagline-check.spec.ts" tools/remote-acr/run.sh
```

`tools/bench-vs-threejs/tagline/build.mjs` scaffolds `create-aura3d@latest`, builds the Aura3D scenes and the two three.js apps with a stock `vite build`, and the spec renders each one. The extracted results and frames are in `evidence/vs-threejs/tagline-check/`. To get the hero locally:

```sh
npx create-aura3d@latest my-scene --template product-viewer
```
