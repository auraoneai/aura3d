# Why Aura3D

Version: 5.6.0

Aura3D is a complete engine for browser games and interactive 3D apps. three.js is a rendering library. A three.js project starts with a renderer and then assembles the rest from addons, third-party libraries and custom code: loaders, environment lighting, shadows, post-processing, controls, physics, the game loop, the HUD, audio, asset handling, licensing and deploy checks. Aura3D ships all of it as one engine and one toolchain, with its own renderer (WebGPU and WebGL2 from the same code, optionally in a worker), a typed declarative scene, an asset pipeline with AI generation built in, and docs and tooling designed for AI coding agents. Thirty live games on [aura3d.auraone.ai](https://aura3d.auraone.ai/apps/showcase-index/) are built on it.

`@aura3d/engine` is a standalone engine: it has no `three` dependency and renders through its own `@aura3d/rendering` package. Every row below names its source. Per-capability status with code paths: [`comparisons/aura3d-capability-audit.md`](comparisons/aura3d-capability-audit.md).

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

It loads a GLB, lights it with an HDRI studio look, casts a shadow, frames the camera on the model and enables orbit controls. The matched three.js app loads the same GLB and HDRI and wires a PMREM environment, a shadow-casting key light, tone mapping, MSAA, model framing, resize and the render loop by hand: 38 lines before orbit controls, 55 with the same post stack (`tools/bench-vs-threejs/tagline/three-minimal/main.ts`, `three-look/main.ts`; evidence in [`evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/README.md)).

## Engine vs rendering library

| Capability | Aura3D (engine) | three.js (rendering library) | Source |
|---|---|---|---|
| App and scene API | One `createAuraApp` + `scene()` API from one import, `@aura3d/engine`. The app owns renderer, loop, resize, context loss and disposal | Renderer, scene, camera, loop, resize and disposal wired by hand from core plus addon modules (up to 8 in one benchmark scene) | `RESULTS.md` section 3 |
| Rendering backends | WebGPU and WebGL2 from the same scene code: `renderer: { backend: "auto" }` picks WebGPU and falls back to WebGL2 on the same canvas | `WebGLRenderer`, or a separate `WebGPURenderer` from `three/webgpu` that you choose and wire | [`rendering/native-backends.md`](rendering/native-backends.md); CHANGELOG 5.3.0 |
| Lighting and looks | PBR materials, image-based lighting, shadows and 15 genre `looks.preset(id)` bundles (HDRI, key light, background, grade, post). A bare scene reflects a built-in studio room and keeps authored colours | PMREM environment, tone mapping and shadow flags set up per project | `packages/engine/src/agent-api/looks/lookPresets.ts`; CHANGELOG 5.3.0 N1 to N4 |
| Post-processing and VFX | 28+ `effects.*` builders as scene nodes: bloom, SSAO/GTAO, screen-space reflections, depth of field, god rays, motion blur, volumetric light, grade, particles, flipbooks, trails and beams | `EffectComposer` plus one addon pass per effect; particles from a third-party library or custom code | [`api/vfx-presets.md`](api/vfx-presets.md); `RESULTS.md` section 11 |
| Sky, water and weather | `sky.preetham`, `sky.dayNight`, `water` and `weather` nodes; `app.atmosphere.setSky` moves the sun live | Example shaders to copy and adapt | `@aura3d/engine` root exports |
| Typed, provenance-checked assets | `model(assets.x)`: a generated typed key with source, licence, author and sha256. A misspelt asset is a compile error; in production an unverified model does not draw | String URLs, checked at run time | [`api/model-loader.md`](api/model-loader.md); `tests/unit/agent-api/public-example-boundary.test.ts` |
| Asset pipeline | One CLI: `assets search`, `resolve`, `add`, `convert` (FBX, OBJ, DAE, USD, PLY, STL, 3MF, VOX, BVH to GLB), `optimize`, `normalize`, `slim`, `preview`, `validate` (including `--skin`), `admit` | Separate tools you choose and script | [`api/cli-reference.md`](api/cli-reference.md) |
| AI generation | `assets generate` makes lifelike, optionally rigged GLBs on fal.ai (Idol) and admits them; `animation generate` turns text into motion clips; `animation import` retargets BVH, FBX, glTF and HY-Motion clips onto your rig | Nothing comparable | CHANGELOG 5.6.0; [`api/cli-reference.md`](api/cli-reference.md) |
| Game kit | `createGame` (lifecycle, pause, results, DOM HUD, touch controls, juice, sound), `createFixedStepLoop`, input, audio cue banks, and genre kits for platformers, racing, falling blocks, fighting and racket sports | Not included | [`api/game-kit.md`](api/game-kit.md); [`api/audio-synth.md`](api/audio-synth.md) |
| Physics and navigation | Rapier through `@aura3d/physics-rapier`, the built-in `@aura3d/physics` runtime, and Recast navigation through `@aura3d/navigation-recast` | Third-party libraries integrated by hand | `packages/physics-rapier/`; `packages/navigation-recast/` |
| Character animation | `AnimationController`: play clips by name with cross-fade, clip events, morphs and visemes; humanoid retargeting; `targetHeight` fits a character in one option | `AnimationMixer`, `clipAction` and manual fitting with `Box3` | `RESULTS.md` section 11; `packages/animation/` |
| Determinism and QA | Seeded `createCountedRng`, `installQaHooks`, replay, `?autoplay=1` on every showcase game, `installSafetyNet` black-frame recovery, high-refresh interpolation | Write your own | [`api/qa-kit.md`](api/qa-kit.md); [`api/safety-net.md`](api/safety-net.md); [`api/motion-presenter.md`](api/motion-presenter.md) |
| Rendering off the main thread | `worker: { createWorker }` keeps `app.nodes`, frame callbacks and picking on the main thread | `OffscreenCanvas` plumbing and a message protocol of your own | CHANGELOG 5.3.0, 5.5.0, 5.6.0 |
| AI coding agents | `llms.txt`, 14 skills and compiled recipes in every new project; `aura3d help --json`, `info`, `examples`, `validate`, `render`; three.js names that models guess resolve or name the Aura3D call | No official agent docs | `packages/aura3d-cli/skills/`; [`agents/agent-tools.md`](agents/agent-tools.md); [`agents/guessable-api.md`](agents/guessable-api.md) |
| Deploy gate | `check-deploy --dist dist` fails on missing hashed assets, stray files and asset errors; `--browser` loads every route in headless Chromium and fails on failed requests and console errors; `--release` adds licence and quality gates | Not included | `packages/aura3d-cli/src/index.ts` (check-deploy) |
| Starting a project | 26 `create-aura3d` templates, each with route-health and screenshot tests | Generic Vite templates | `packages/create-aura3d/templates/` |
| Proof it ships | 30 live games, real-GPU QA'd, all on WebGPU by default and all able to render in a worker | n/a | `docs/workflows/game-inventory.json` |

## Measured: less code, fewer APIs

The same scenes written in both, counted with one rule (non-blank, non-comment lines, imports included; `tools/bench-vs-threejs/harness/static-metrics.mjs`):

| Scene | Aura3D lines | three.js lines | Aura3D API symbols | three.js API symbols |
|---|---|---|---|---|
| Lit, framed product with orbit controls (hero) | 10 | 38 (before orbit controls) | | |
| PBR viewer: HDR lighting, shadow, bloom, orbit | 24 | 49 | 11 | 21 |
| Forest, 10,000 coloured instances | 49 | 71 | 9 | 20 |
| Skinned character with cross-fade | 45 | 62 | 8 | 17 |
| Game loop | 61 | 82 | 9 | 14 |

Aura3D scene code is shorter in 4 of the 5 benchmark scenes and uses fewer distinct API symbols in every one, from a single import module against up to 8 ([`evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md) sections 1 and 3).

**Agent-authoring benchmark (C1).** The same AI model (`claude-sonnet-5.5`) built the same eight scenes three times with Aura3D 5.5.1 (from npm) and three times with three.js 0.185.1, each run a task plus one follow-up edit, with tasks, functional checks and the visual rubric frozen before the first run (`tests/reports/benchmark-c1/SPEC.md`). 72 runs, frames from headless Chrome on a real GPU.

<!-- C1-RESULTS: filled 2026-11-10 from evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md -->

| | Aura3D 5.5.1 | three.js 0.185.1 |
|---|---|---|
| App code per scene, median lines | 270 | 326 |
| After the follow-up edit | 289 | 352 |
| Tasks where the app is shorter | 6 of 8 | 2 of 8 |
| Runs passing every functional check (task / follow-up) | 88% / 100% | 88% / 100% |
| Blind visual pairs won | 13 of 24 | 11 of 24 |

Lines are non-blank, non-comment lines in the app's `src/`, without generated asset typings ([`RESULTS-agent-authoring-c1-5.5.1.md`](../evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md); full report: [`tests/reports/benchmark-c1/REPORT.md`](../tests/reports/benchmark-c1/REPORT.md)).

**Cold-start trial.** Fresh agents working from the Aura3D docs alone went from 8 to 14 working scenes out of 15 and from 40 to 10 median turns as the docs improved, and every first build compiled (15 of 15) ([`evidence/agent-eval/baseline1/NOTES.md`](../evidence/agent-eval/baseline1/NOTES.md)).

## What ships in the box, with the code

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

`assets.robot` is a generated key, so a misspelt or missing asset is a TypeScript error, not a 404 at run time. In production, a model without a valid hash and same-origin URL does not draw: licensing and supply-chain integrity are enforced by the engine, not by convention.

### 2. AI generation and a full asset pipeline

```bash
npx @aura3d/cli@latest assets generate "armored knight" --name knight --kind character --rig --dry-run   # prints the fal.ai cost
npx @aura3d/cli@latest animation generate "a confident victory dance" --onto knight.glb --out knight-dance.glb
npx @aura3d/cli@latest assets convert ship.fbx --out ship.glb
npx @aura3d/cli@latest assets validate --skin
```

`assets generate` produces a lifelike, game-ready GLB (Idol on fal.ai), rigs it on request and admits it as a typed candidate. `animation generate` turns a text prompt into a clip and `animation import` retargets BVH, FBX, glTF or HY-Motion clips onto your rig. `assets convert`, `normalize`, `slim`, `optimize`, `preview` and `validate` take any model from source file to shipped asset. fal.ai spend is logged in `.aura3d/fal/ledger.jsonl` and a rerun never pays twice. Sources: CHANGELOG 5.6.0; [`api/cli-reference.md`](api/cli-reference.md).

### 3. WebGPU and WebGL2 from the same code

```ts
import { createAuraApp, primitives, scene } from "@aura3d/engine";

const app = createAuraApp("#app", {
  scene: scene().add(primitives.box({ name: "crate" })),
  renderer: { backend: "auto" } // WebGPU first; WebGL2 on the same canvas if WebGPU cannot start
});
void app.ready().then(() => console.log(app.diagnostics().renderer?.backendSelection));
```

Post effects (SSAO/GTAO, screen-space reflections, depth of field, god rays, motion blur, volumetric light, bloom, grade), sky, fog, particles and generated PBR all have native WGSL paths. All 30 showcase games ship with `backend: "auto"` and run on WebGPU by default, each switched after a real-GPU check showed the same frame as WebGL2 with 0 errors; `?backend=webgl2` selects WebGL2. Without the option, `createAuraApp` uses WebGL2. Sources: CHANGELOG 5.3.0, 5.5.0 and 5.6.0; per-game tables in [`upgrade-5.0.0/README.md`](upgrade-5.0.0/README.md).

### 4. Worker rendering in one option

```ts
import { createAuraApp, primitives, scene } from "@aura3d/engine";
import { createWorkerRendererWorker } from "@aura3d/engine/worker";

const app = createAuraApp("#app", {
  scene: scene().add(primitives.box({ name: "crate" }).runtime({ id: "crate", mutable: true })),
  worker: { createWorker: createWorkerRendererWorker, fallback: "main-thread" }
});
app.onFrame((f) => app.nodes.require("crate").setRotation(0, f.time, 0)); // patches cross to the worker
```

Worker apps keep `app.nodes` patches, frame callbacks, step and advance, and host-side picking, and `app.diagnostics().fps` counts the frames the worker presents. All 30 showcase games render in a worker with `?worker=1`; on the real-GPU check each title frame matched the main-thread frame and each game played with no errors. Physics, DOM labels and the diagnostics overlay run with main-thread apps, and a worker app reports any of them with a typed `AuraWorkerError`. Sources: CHANGELOG 5.3.0, 5.5.0 and 5.6.0; [`agents/native-capability-recipes.md`](agents/native-capability-recipes.md) (`worker-render`).

### 5. A good-looking frame with no setup

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

A bare scene renders through a neutral output that keeps your authored colours, metal and glass reflect a studio room generated in code, `lights.key` casts a shadow and `camera.auto({ subject, angle, fill })` frames what the scene draws (a requested fill of 0.8 measured 0.800 on a real GPU, [`evidence/n4-frame/README.md`](../evidence/n4-frame/README.md)). Every CSS colour form parses wherever a colour is accepted. For a finished art direction, `looks.preset(id)` adds HDRI lighting, a key, background, grade and post effects in one call.

### 6. The whole game stack

`@aura3d/engine/game` gives you `createGame` (lifecycle, pause, results, DOM HUD, touch controls, first-gesture audio unlock, juice and sound). Around it: `createFixedStepLoop`, seeded replay with `createCountedRng`, `installQaHooks` for scripted test runs, `createRenderInterpolator` for smooth motion on 120 and 144 Hz screens (50% stalled frames before, 0% after), `installSafetyNet` black-frame recovery, the `createCueBank` audio synth, Rapier physics, Recast navigation and genre kits (`game.platformer`, `game.racing`, `game.fallingBlocks`, `game.fighting`, `game.racketSports`). Sources: [`api/game-kit.md`](api/game-kit.md), [`api/qa-kit.md`](api/qa-kit.md), [`api/motion-presenter.md`](api/motion-presenter.md), [`api/safety-net.md`](api/safety-net.md).

### 7. Designed for AI coding agents

Every `create-aura3d` project gets `llms.txt`, 14 Aura3D skills and compiled recipes. The CLI lets an agent author, check and look at its own work without leaving the terminal:

```bash
npx @aura3d/cli@latest info --name material.pbr        # installed signature and option keys
npx @aura3d/cli@latest examples "gold product on a pedestal"   # nearest working recipe or template
npx @aura3d/cli@latest validate                        # lint, colour grammar, unknown names, framing, lighting
npx @aura3d/cli@latest render --json                   # build, screenshot, luma, saturation and subject fill
```

Names models carry over from three.js resolve instead of failing: `handle.setColor`, `setIntensity`, `setOpacity`, `setEmissive`, `material.standard` and tone-mapping spellings such as `"aces-filmic"`, `ACESFilmicToneMapping` and `AgX`. A name with a different meaning throws an error that names the Aura3D call. The aliases came from 1,884 benchmark transcripts. Sources: [`agents/agent-tools.md`](agents/agent-tools.md); [`agents/guessable-api.md`](agents/guessable-api.md).

### 8. A deploy gate

```bash
npm run build
npx @aura3d/cli@latest check-deploy --dist dist             # missing hashed assets, unreferenced files, asset validation
npx @aura3d/cli@latest check-deploy --dist dist --browser   # also loads every route in headless Chromium: failed requests, console errors
npx @aura3d/cli@latest check-deploy --dist dist --release   # adds licence and quality gates
```

Every claim ships with its evidence: route-health specs in all 26 templates, `assets validate --release` and `check-deploy` come with the engine, so teams adopting Aura3D get the release process along with the code.

## Bring your three.js work

- **Procedural content** (a function that builds a three.js scene): `aura3d import-three` runs it headless at build time, exports a GLB, admits it as a typed asset and writes an editable Aura3D scene plus a report of what was carried and approximated. Clips, simple `ShaderMaterial`s, lights, the camera and renderer output come across; `three` stays a dev dependency and the shipped route imports only `@aura3d/engine`. Regenerating keeps your edits, because node ids are stable ([`agents/three-bridge.md`](agents/three-bridge.md)).

  ```bash
  npm i -D three
  npx @aura3d/cli@latest import-three recipes/windmill.mjs
  ```

- **Hand-written app code**: `aura3d migrate three` maps 245 three.js constructs and writes an annotated worklist, so the port to `@aura3d/engine` starts from a list of changes instead of a blank file. The mapping for the 40 most common APIs, the steps and a measured before and after are in [`migration/from-threejs.md`](migration/from-threejs.md).

## How we measured

- **Code-size benchmark** (`tools/bench-vs-threejs/`): five scenes plus a one-cube baseline, each built as a standalone Vite app in both, by one author. Metrics: scene lines and tokens, import modules, API symbols, draw calls and correctness. Method: [`tools/bench-vs-threejs/README.md`](../tools/bench-vs-threejs/README.md); results: [`evidence/vs-threejs/RESULTS.md`](../evidence/vs-threejs/RESULTS.md). Line and symbol counts are static counts of the source files and do not depend on the renderer.
- **Hero line count** (`tools/bench-vs-threejs/tagline/`): a stock `create-aura3d` product-viewer scaffold and two matched three.js apps, built with a stock `vite build` and rendered on a remote runner ([`evidence/vs-threejs/tagline-check/`](../evidence/vs-threejs/tagline-check/README.md)).
- **Agent-authoring benchmark (C1)** and **cold-start trial** (`tools/agent-eval/`): fresh agents in isolated sandboxes, scored on typecheck, build, functional checks, render and turns.
- **WebGPU and worker defaults**: paired real-GPU runs per showcase game (Apple M4 Max, headless Chrome), the default page against `?backend=webgl2` or the main-thread page, frame difference and errors recorded ([`upgrade-5.0.0/README.md`](upgrade-5.0.0/README.md)).

## Reproduce

```sh
RUN_ID=tagline-$(date -u +%H%M%S) SPECS="tests/browser/tagline-check.spec.ts" tools/remote-acr/run.sh
```

`tools/bench-vs-threejs/tagline/build.mjs` scaffolds `create-aura3d@latest`, builds the Aura3D scenes and the two three.js apps with a stock `vite build`, and the spec renders each one. To get the hero locally:

```sh
npx create-aura3d@latest my-scene --template product-viewer
```
