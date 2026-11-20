<!-- Generated from the repository README.md by tools/docs/sync-engine-readme.mjs; edit the root README instead. -->

# Aura3D

[![npm version](https://img.shields.io/npm/v/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![npm downloads](https://img.shields.io/npm/dm/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-browser%203D-3178c6.svg)](https://www.typescriptlang.org/)

**The complete TypeScript engine for browser games and 3D apps.** three.js gives you a renderer. Aura3D gives you the whole engine around it: its own WebGPU and WebGL2 renderer, typed and licensed assets, AI model and motion generation, lighting looks, a game kit, physics, worker rendering and deploy checks, all in one package. It is built for agent-written browser 3D, and people who write it by hand use the same API.

[Play the 30 games](https://aura3d.auraone.ai/apps/showcase-index/) · [Docs](https://aura3d.auraone.ai/docs/) · [`llms.txt`](https://github.com/auraoneai/aura3d/blob/main/llms.txt) · [Changelog](https://github.com/auraoneai/aura3d/blob/main/CHANGELOG.md)

A lit, shadowed, framed product with orbit controls, in 10 lines:

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

`looks.preset` supplies image-based light, a shadow-casting key, fog, background and a post grade as one unit. `model(assets.product)` is a typed asset the CLI generated, never a raw URL. The same scene in three.js is 38 lines before orbit controls ([tagline check](https://github.com/auraoneai/aura3d/blob/main/evidence/vs-threejs/tagline-check/)).

## Start in five commands

```bash
npx create-aura3d@latest my-scene --template mini-game       # also writes llms.txt and the Aura3D agent skills
cd my-scene && npm install
npm run dev                                                  # Vite on 127.0.0.1
npx @aura3d/cli@latest assets resolve "robot" --name robot   # or assets add ./robot.glb; then model(assets.robot)
npm run build && npx @aura3d/cli@latest check-deploy --dist dist
```

26 templates, including `product-viewer` (default), `cinematic-scene`, `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `character-controller` and `animation-studio` (`npx create-aura3d@latest --help`).

## Aura3D and three.js

three.js is a rendering library: you assemble loaders, controls, post-processing, physics, audio, a game loop and asset handling from separate packages and your own code. Aura3D ships those parts as one engine with one typed API.

| You need | three.js | Aura3D |
| --- | --- | --- |
| A good first frame | Lights, environment map, tone mapping and shadow setup by hand | `looks.preset(...)`: image-based light, key shadow, fog, background and grade in one call |
| Models | `GLTFLoader` and a URL string; a typo fails at runtime | `model(assets.robot)`: a typo is a compile error, and every model is hashed and licensed |
| WebGPU | A separate renderer with its own node materials | `renderer: { backend: "auto" }`: WebGPU with WebGL2 fallback, same scene code |
| Off-main-thread rendering | Build it yourself with OffscreenCanvas | `worker: { createWorker }`: game code keeps `app.nodes`, frame callbacks and picking |
| 3D models and motion from a prompt | Not included | `assets generate` (rigged GLBs on fal.ai) and `animation generate` (text to motion) |
| Other file formats | A loader per format | `assets convert`: FBX, OBJ, DAE, USD, PLY, STL, 3MF, VOX and BVH to GLB |
| A game | Your own loop, HUD, input, physics and audio | `createGame`, fixed-step loop, touch controls, Rapier physics, audio cue banks, autoplay, hit feel and VFX kits |
| Shipping | Your own checks | `check-deploy` fails the build on missing hashed assets; `--browser` loads every route headless |
| An AI coding agent | General web knowledge | `llms.txt`, agent skills and recipes in every new project; `aura3d info`, `validate` and `render` |
| Existing three.js code | | `aura3d migrate three` writes a port worklist; `aura3d import-three` brings a scene across as an editable Aura3D scene |

**Measured, not claimed:**

- **Less code.** In the five-scene benchmark, Aura3D scene code is shorter in 4 of 5 scenes (PBR viewer 24 vs 49 lines, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82), with 1 import module instead of up to 8 ([results](https://github.com/auraoneai/aura3d/blob/main/evidence/vs-threejs/RESULTS.md)).
- **Agents write it well.** The same AI model built the same eight scenes three times with each engine (measured on Aura3D 5.5.1 against three.js 0.185.1). The Aura3D apps came out 17% shorter (median 270 lines against 326), passed the same functional checks, and a blind visual judge picked the Aura3D frame in 13 of 24 pairs ([results](https://github.com/auraoneai/aura3d/blob/main/evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md)).
- **30 playable games** run on it, all on WebGPU by default with WebGL2 fallback and worker rendering ([showcase](https://aura3d.auraone.ai/apps/showcase-index/)).

Full comparison with sources: [`docs/aura3d-vs-threejs.md`](https://github.com/auraoneai/aura3d/blob/main/docs/aura3d-vs-threejs.md). Porting a three.js project: [`docs/migration/from-threejs.md`](https://github.com/auraoneai/aura3d/blob/main/docs/migration/from-threejs.md).

## What's in the engine

**Rendering and look**
- Its own WebGPU and WebGL2 renderer: PBR materials (`material.clearcoatPaint`, glass, metal and more), image-based lighting, shadows, instancing with wind sway, and 28+ `effects.*` post and VFX builders.
- `sky.gradient(...)` paints a stylised game sky; `sky`, `water` and `weather` are scene nodes.
- Key-light shadows with adjustable softness and a fixed shadow box (`shadow: { softness, fit }`) for arenas and tracks.
- Transparent canvas output, so a scene can sit on top of a web page.
- `RuntimeQualityGovernor` steps resolution, post, shadows and particles up and down at runtime, across desktop and mobile GPUs.

**Assets**
- `assets search`, `resolve`, `add`, `convert`, `normalize`, `slim`, `optimize` and `validate`, plus PNG thumbnails. In production a model needs a same-origin URL, a sha256 and provenance, or it draws nothing.
- `assets generate` makes rigged or static GLBs on fal.ai, with a `--dry-run` cost check and a spend ledger; `assets inspect --pbr` reports metalness, roughness and normal-map statistics per material.

**Animation and characters**
- Animation controller with clips, state machines, layers, root motion, retargeting and two-bone IK.
- `animation generate` turns text into a motion clip; `animation import` retargets BVH, FBX, glTF or HY-Motion clips onto your rig and checks them for limb flips and frozen T-poses.
- `createHumanoidAnimator` plays those clips with cross-fades, and its distance-driven timing keeps planted feet from sliding.

**Game kit (`@aura3d/engine/game`)**
- `createGame` (lifecycle, pause, results, DOM HUD, touch), `createFixedStepLoop`, seeded replay and QA hooks, Rapier physics, audio cue banks.
- Kits taken from the 30 live games: `?autoplay=1` (the computer plays to the results screen, then loops), render interpolation between fixed steps, hit-stop and camera shake, procedural sound effects, and flipbook VFX sheets with no image files.

**Tooling**
- `aura3d help --json` lists every command and flag; `doctor`, `validate`, `render`, `look capture` and `look lint` for checking a scene; `check-deploy` before you ship.
- `installSafetyNet` from `@aura3d/debug`: a `?diag=1` panel, quality switches and black-frame self-heal.

Kit docs: [game kit](https://github.com/auraoneai/aura3d/blob/main/docs/api/game-kit.md), [QA kit](https://github.com/auraoneai/aura3d/blob/main/docs/api/qa-kit.md), [safety net](https://github.com/auraoneai/aura3d/blob/main/docs/api/safety-net.md), [audio synth](https://github.com/auraoneai/aura3d/blob/main/docs/api/audio-synth.md), [model loader](https://github.com/auraoneai/aura3d/blob/main/docs/api/model-loader.md), [CLI asset tools](https://github.com/auraoneai/aura3d/blob/main/docs/api/cli-asset-tools.md), [sculpt](https://github.com/auraoneai/aura3d/blob/main/docs/api/sculpt.md), [quality governor](https://github.com/auraoneai/aura3d/blob/main/docs/api/quality-governor.md).

## If you are an AI agent

Read [`llms.txt`](https://github.com/auraoneai/aura3d/blob/main/llms.txt) first (one screen, the fast path), then [`docs/agents/agent-quickstart.md`](https://github.com/auraoneai/aura3d/blob/main/docs/agents/agent-quickstart.md) and [`docs/agents/claims-and-boundaries.md`](https://github.com/auraoneai/aura3d/blob/main/docs/agents/claims-and-boundaries.md). The index of every agent doc is [`docs/agents/README.md`](https://github.com/auraoneai/aura3d/blob/main/docs/agents/README.md); skills live in [`packages/aura3d-cli/skills/`](https://github.com/auraoneai/aura3d/blob/main/packages/aura3d-cli/skills/). `npx create-aura3d@latest` and `npx @aura3d/cli@latest init --agent all` write the instruction files into your project.

One trap to know: never `await app.ready()` at module top level. It deadlocks a Vite production build and leaves a black page with no error. Wait inside a function or chain on it:

```ts
import { createAuraApp, scene } from "@aura3d/engine";

const app = createAuraApp("#app", { scene: scene(), autoStart: false });
void app.ready().then(() => {
  app.step(1 / 60);
});
```

`aura3d validate` reports it as `LINT_TOP_LEVEL_AWAIT_READY` ([details](https://github.com/auraoneai/aura3d/blob/main/evidence/n4-frame/integration/README.md)).

## Packages

All public packages share one version. `@aura3d/engine` is the root of this repository.

| Package | Purpose |
| --- | --- |
| `@aura3d/engine` | Public runtime: `createAuraApp`, scene nodes, looks, effects, game kits, subpaths such as `/game`, `/animation` and `/audio` |
| `@aura3d/cli` | Typed assets, asset search, fal.ai generation, format conversion, motion import, look-dev, `check-deploy`, `init`, `migrate three` |
| `create-aura3d` | Vite project scaffolder with 26 templates, agent skills and `llms.txt` |
| `@aura3d/core`, `@aura3d/math`, `@aura3d/scene` | Lifecycle and deterministic stepping, math, scene graph |
| `@aura3d/rendering` | Render device, WebGPU and WebGL2 backends, RuntimeQualityGovernor, materials, passes |
| `@aura3d/assets`, `@aura3d/asset-index` | Asset loading and caching; asset search across public sources |
| `@aura3d/animation`, `@aura3d/audio`, `@aura3d/input`, `@aura3d/controls` | Clips, state machines and humanoid retargeting, audio buses, input, camera controls |
| `@aura3d/physics`, `@aura3d/physics-rapier`, `@aura3d/navigation-recast` | Physics, with optional Rapier and navigation adapters |
| `@aura3d/ecs`, `@aura3d/scripting` | ECS and behaviour graphs |
| `@aura3d/debug` | Diagnostics and the runtime safety net |
| `@aura3d/product-studio`, `@aura3d/apps`, `@aura3d/workflows`, `@aura3d/react`, `@aura3d/editor-runtime` | Product viewers, app presets, workflows, React host, editor runtime |

## Documentation

- [`docs/index.md`](https://github.com/auraoneai/aura3d/blob/main/docs/index.md): hub for humans and agents
- [`docs/agents/README.md`](https://github.com/auraoneai/aura3d/blob/main/docs/agents/README.md): agent docs index
- [`docs/api/public-api.md`](https://github.com/auraoneai/aura3d/blob/main/docs/api/public-api.md): public API
- [`docs/api/cli-reference.md`](https://github.com/auraoneai/aura3d/blob/main/docs/api/cli-reference.md): every CLI command and flag (generated from `aura3d help --json`)
- [`docs/aura3d-vs-threejs.md`](https://github.com/auraoneai/aura3d/blob/main/docs/aura3d-vs-threejs.md) and [`docs/migration/from-threejs.md`](https://github.com/auraoneai/aura3d/blob/main/docs/migration/from-threejs.md): Aura3D next to three.js, and how to port
- Upgrading from an earlier version: [`CHANGELOG.md`](https://github.com/auraoneai/aura3d/blob/main/CHANGELOG.md)
- Site: https://aura3d.auraone.ai

## Contributing

Open issues with the prompt, package version, asset source and a screenshot or route-health output. Licensed under MIT.
