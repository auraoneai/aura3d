# Why Aura3D over three.js

Status: 2026-11-19, Aura3D 5.6.0. For marketing, sales and the site. Every claim below names its source, so copy built from this page holds up when a developer checks it.

## The pitch

Aura3D is a complete engine for browser games and interactive 3D apps; three.js is a rendering library. A three.js project starts with a renderer and assembles the rest from addons, third-party libraries and custom code: loaders, environment lighting, shadows, post-processing, controls, physics, the game loop, the HUD, audio, asset handling, licensing and deploy checks. Aura3D ships all of that as one engine and one toolchain: its own renderer (WebGPU and WebGL2 from the same code), a typed declarative scene, an asset pipeline with AI generation built in, and docs and tooling designed for AI coding agents. Thirty live games on aura3d.auraone.ai prove it.

`@aura3d/engine` has no `three` dependency; it renders through its own `@aura3d/rendering` package. Per-capability status with code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md). Codemod figures are counted from the `mapping:` fields in `packages/aura3d-cli/src/migrate-three/mappings.ts` (245 constructs).

## Headlines

- **Hero:** "A lit 3D product in 10 lines of TypeScript." `tools/bench-vs-threejs/tagline/aura-variants/hero.ts` on a stock `create-aura3d` project; the matched three.js app is 38 lines before orbit controls, 55 with the same post stack (`evidence/vs-threejs/tagline-check/`).
- **Supporting:** "Half the code of three.js for a lit 3D product viewer: 24 lines vs 49, one import vs eight." Small print: "Aura3D benchmark, five scenes." (`evidence/vs-threejs/RESULTS.md` sections 1 and 3).
- **Positioning:** "A complete engine for browser games, not just a renderer."

## Engine vs rendering library

| Capability | Aura3D (engine) | three.js (rendering library) | Source |
|---|---|---|---|
| A good-looking scene on first run | A bare scene keeps authored colours (neutral output), reflects a built-in studio room, gets a `lights.key` shadow and `camera.auto` framing. `looks.preset(id)` adds HDRI lighting, background, grade and post effects in one call. 15 genre looks | No environment, tone mapping or shadows by default. PBR metals render dark until you wire an environment | CHANGELOG 5.3.0 N1 to N4; `evidence/n4-frame/README.md`; `packages/engine/src/agent-api/looks/lookPresets.ts`; `RESULTS.md` §11 |
| WebGPU | `renderer: { backend: "auto" }`: WebGPU first, WebGL2 fallback on the same canvas, same scene code. Default in all 30 showcase games (`?backend=webgl2` opts out) | A separate `WebGPURenderer` from `three/webgpu` that you choose and wire yourself | CHANGELOG 5.3.0 to 5.6.0; `docs/upgrade-5.0.0/README.md` |
| Rendering off the main thread | `worker: { createWorker }` with node patches, frame callbacks and host-side picking; all 30 showcase games run with `?worker=1` | `OffscreenCanvas` plumbing and a message protocol of your own | CHANGELOG 5.3.0 to 5.6.0 |
| Scene code | Shorter in 4 of 5 benchmark scenes, 26% to 51% fewer lines of scene code (five small scenes, one author): viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82 | Longer | `RESULTS.md` §1 |
| Imports and concepts | 1 import module; fewer API symbols in every benchmark scene | Up to 8 modules (core plus addons) | `RESULTS.md` §3 |
| Bloom, shadows, custom post pass | One call each: `effects.bloom()`, `shadow: true`, `effects.shaderPass()` | `EffectComposer` plus 3 or 4 addon passes; shadow flags on every mesh | `RESULTS.md` §11 |
| Post-processing and VFX | 28+ `effects.*` builders as scene nodes: bloom, SSAO/GTAO, screen-space reflections, depth of field, god rays, motion blur, grade, particles, flipbooks, trails and beams | `EffectComposer` plus one addon pass per effect; particles from a third-party library | `docs/api/vfx-presets.md` |
| Sky, water and weather | `sky.preetham`, `sky.dayNight`, `water` and `weather` nodes; `app.atmosphere.setSky` moves the sun live | Example shaders to copy and adapt | `@aura3d/engine` root exports |
| AI generation | `assets generate` (fal.ai Idol: lifelike, optionally rigged GLBs, admitted as typed candidates); `animation generate` (text to motion); `animation import` (BVH, FBX, glTF, HY-Motion retargeting) | Nothing comparable | CHANGELOG 5.6.0; `docs/api/cli-reference.md` |
| Physics and navigation | Rapier through `@aura3d/physics-rapier`, the built-in `@aura3d/physics` runtime, Recast through `@aura3d/navigation-recast` | Third-party libraries integrated by hand | `packages/physics-rapier/`; `packages/navigation-recast/` |
| 10,000 instances with per-instance colour | Declarative `instances.*({ transforms, colors })` | Hand-written `InstancedMesh` matrix code | `RESULTS.md` §11 |
| Character animation | Switch clips by name with cross-fade (`handle.play("Run", { crossFade })`) and fit the character to a height with one `targetHeight` option | `AnimationMixer`, `clipAction`, manual fitting with `Box3` | `RESULTS.md` §11 |
| Type-safe assets | `model(assets.robot)`: a generated typed key, so a missing asset is a compile error | Asset paths are plain strings, checked at run time | `templates/product-viewer/src/aura-assets.ts`; `tests/unit/agent-api/public-example-boundary.test.ts` |
| Asset licence and integrity | Every admitted model records source, licence, author and sha256. In production, a model without a valid hash and same-origin URL does not draw | Loads any file from any URL | `docs/agents/claims-and-boundaries.md` §5 and §6; `docs/api/model-loader.md` |
| Asset pipeline | `aura3d assets search` and `resolve` pull licence-tagged open models (CC0, CC-BY) and type them; `convert` (FBX, OBJ, DAE, USD, PLY, STL, 3MF, VOX, BVH), `optimize`, `normalize`, `slim`, `preview`, `validate` (including `--skin`) and `admit` from the same CLI | Bring your own files and tools | `packages/aura3d-cli/src/cli-help.ts` |
| A deploy gate | `aura3d check-deploy --dist dist` fails the build on a missing hashed asset, stray files and asset-validation errors; `--browser` loads every route in headless Chromium; `--release` adds licence and quality gates | Assemble it yourself | `packages/aura3d-cli/src/index.ts:1097` |
| Game shell | HUD, touch controls, juice and session flow (`@aura3d/engine/game`); genre kits for racket sports, karting, car soccer, fighting and platformer motion | Assemble it yourself | `docs/api/root-exports.md` (27 exports in the game kit); `docs/api/game-kit.md` |
| Fixed timestep, replay and QA | `createFixedStepLoop`, seeded `createCountedRng`, `installQaHooks` for scripted, repeatable test runs | Write your own | `packages/engine/src/qa/`; `docs/api/qa-kit.md` |
| Smooth motion on 120 and 144 Hz screens | `createRenderInterpolator` and `createFixedStepPresenter`: a 60 Hz simulation no longer freezes on every second frame at 120 Hz (50% stalled frames before, 0% after) | Write your own | `docs/api/motion-presenter.md` |
| Blank-screen protection | `installSafetyNet` detects black frames and recovers; `createFrameErrorBoundary` keeps rendering after a throwing frame callback; `?diag=1` diagnostics panel | Assemble it yourself | `packages/debug/src/safety`; `docs/api/safety-net.md` |
| Game audio | Procedural cue bank, step sequencer and tone loops on one shared audio context | Positional audio primitives | `packages/audio/src/synth`; `docs/api/audio-synth.md` |
| Shader safety | `material.custom` GLSL with a chunk library (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) and loud compile errors | `ShaderMaterial` with uniforms and varyings declared by hand | `docs/api/glsl-chunks.md`; `RESULTS.md` §11 |
| Working with AI coding agents | `llms.txt`, 14 agent skills, compiled recipes and a type-traps table, written into every new project by `create-aura3d`; `aura3d info`, `examples`, `validate` and `render`; guessed three.js names resolve or throw an error naming the Aura3D call | No official agent docs | `packages/aura3d-cli/skills/`; `docs/agents/agent-tools.md`; `docs/agents/guessable-api.md` |
| Coming from three.js | `aura3d import-three` turns a three.js scene factory into a typed asset and an editable Aura3D scene; `aura3d migrate three` maps 245 three.js constructs and writes an annotated port worklist | n/a | `docs/agents/three-bridge.md`; `docs/aura3d-vs-threejs.md`; `packages/aura3d-cli/src/migrate-three/` |
| Starting a project | 26 `create-aura3d` templates (product viewer, mini-game, racing, falling blocks, fighting, arena shooter, character controller, animation studio and more), each with route-health and screenshot tests | Generic Vite templates | `packages/create-aura3d/templates/` |
| Proof it ships | 30 playable games built on Aura3D, all on WebGPU by default | n/a | `docs/workflows/game-inventory.json`; showcase at https://aura3d.auraone.ai/apps/showcase-index/ |

## The moat, ranked

What a three.js team cannot rebuild by adding a library or two:

1. **Assets that are typed, hashed and licensed end to end, enforced at run time.** The CLI admits each model with provenance and a hash, generates the typed key, `check-deploy` fails the build when a hashed file is missing, and the renderer refuses to draw an unverified model. Copying this takes a loader policy, a build step, a manifest format and a CLI that all agree with each other. For anyone shipping AI-generated or third-party art, this is the licensing and supply-chain answer.
2. **An engine designed to be written by AI agents, and tuned by measurement.** The API, docs, recipes and skills ship together and are improved by a repeatable cold-start trial (`tools/agent-eval`). In that trial, fresh agents working from the Aura3D docs alone went from 8 to 14 working scenes out of 15, and from 40 to 10 median turns, and every first build compiled (15 of 15). A library whose docs, engine and tooling have different owners cannot run that loop.
3. **The whole game stack in one install.** Fixed-step loop, seeded replay, QA hooks, safety net, high-refresh interpolation, HUD, touch, audio and genre kits, proven across 30 shipped games. The integration and the shipped games are the moat.
4. **Quality gates built into the product.** The public-example boundary test, route-health specs in all 26 templates, `assets validate --release` and `check-deploy`. Teams adopting Aura3D get the release process along with the code.
5. **AI generation in the asset pipeline.** `assets generate` and `animation generate` produce rigged models and motion clips that land as typed, hashed, licensed assets, ready for `model(assets.x)`.

Strong features that support the moat: the declarative typed scene, look presets, one-call effects, instancing, scatter, sky, water and weather nodes, and the migration codemod.

## Ad-ready claims

Use these as written. The sourced numbers carry the small print shown.

| # | Claim | Label | Small print | Source |
|---|---|---|---|---|
| 1 | "A lit 3D product in 10 lines of TypeScript." | safe | none | `tools/bench-vs-threejs/tagline/aura-variants/hero.ts`; `tagline-check/run2/` |
| 2 | "Half the code of three.js for a lit 3D product viewer: 24 lines vs 49, one import vs eight." | needs-qualifier | "Aura3D benchmark, five scenes." | `RESULTS.md` §1, §3 |
| 3 | "Up to 51% less scene code than three.js, in 4 of 5 benchmark scenes (five small scenes, one author, lines of scene code)." | needs-qualifier | The qualifier is part of the claim: "4 of 5 benchmark scenes", "five small scenes, one author", "lines of scene code". | `RESULTS.md` §1 |
| 4 | "Every model typed, hashed and licensed. In production, unverified assets don't draw." | safe | none | `claims-and-boundaries.md` §6 |
| 5 | "Find, license, optimize, type and check your 3D assets with one CLI." | safe | none | `cli-help.ts` |
| 6 | "Game batteries included: HUD, touch, audio, fixed-step loop, seeded replay and a safety net, in one install." | safe | none | `root-exports.md`, `game-kit.md` |
| 7 | "Smooth on 120 and 144 Hz displays, out of the box." | safe | none | `motion-presenter.md` |
| 8 | "Built for AI coding agents: llms.txt, 14 skills and recipes in every new project." | safe | none | `packages/aura3d-cli/skills/` |
| 9 | "30 playable games built on Aura3D." | safe | none | `game-inventory.json` |
| 10 | "A one-cube scene in 12 lines of TypeScript." | safe | none | `tagline-check/run-4.5.0/`; gate line D1 |
| 11 | "A one-cube scene reaches its first frame in about 420 ms." | needs-qualifier | "Published 4.5.0 bundle, median of 3 cold loads, software WebGL2, one run." | `RESULTS-4.5.0.md` section 0, gate line P3 |
| 12 | "A one-cube scene draws in 1 call; a PBR viewer scene with a shadow and bloom draws in 25." | needs-qualifier | "Software WebGL2, benchmark scenes, one run." | `RESULTS-4.5.0.md` section 0, gate line P4 |
| 13 | "The five benchmark scenes log no console warnings or errors." | needs-qualifier | "Software WebGL2, one run." | gate line Q2 |
| 14 | "Every option covered by the option-coverage test either takes effect or raises OPTION_IGNORED: 16 of 16 tests pass." | safe | none | gate line D3; `tests/unit/agent-api/option-coverage.test.ts` |
| 15 | "A one-cube scene is 12 lines of scene code; the shader-water scene is 71." | needs-qualifier | "Hand-tuned single source per scene." | gate lines D1, D2 |
| 16 | "WebGPU with a WebGL2 fallback, from one option." | safe | none | `docs/rendering/native-backends.md`; CHANGELOG 5.3.0 |
| 17 | "All 30 showcase games run on WebGPU by default." | needs-qualifier | "WebGL2 fallback kept; checked on one Apple GPU." | CHANGELOG 5.5.1; `docs/upgrade-5.0.0/README.md` |
| 18 | "Render in a worker with one option; game code keeps its node handles." | safe | none | CHANGELOG 5.3.0, 5.5.0 |
| 19 | "A bare scene keeps your colours, reflects a studio room and casts a shadow, with no setup." | safe | none | CHANGELOG 5.3.0 N1 to N4; `evidence/n4-frame/` |
| 20 | "Your agent can validate and screenshot its own scene: `aura3d validate`, `aura3d render`." | safe | none | `docs/agents/agent-tools.md` |
| 21 | "Bring a three.js scene factory across as a typed asset and an editable Aura3D scene." | safe | "Every run writes a carried / approximated report." | `docs/agents/three-bridge.md` |
| 22 | "The same AI model wrote 17% less app code with Aura3D (median 270 vs 326 lines over eight tasks), passed the same functional checks, and won 13 of 24 blind visual pairs." | safe | "Aura3D 5.5.1 vs three.js 0.185.1, one model, 72 runs; lines measured after the run." <!-- C1-RESULTS --> | `evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md` |
| 23 | "Generate a lifelike, rigged 3D character and its motion from a prompt, admitted as a typed asset." | safe | none | CHANGELOG 5.6.0; `aura3d help --json` (`assets generate`, `animation generate`) |
| 24 | "A complete engine for browser games, not just a renderer." | safe | none | this page, "Engine vs rendering library" |
| 25 | "Fewer distinct APIs in every benchmark scene, from one import." | needs-qualifier | "Aura3D benchmark, five scenes." | `RESULTS.md` §3 |

## Wording rules

Compare scope, workflow and code: that is where Aura3D wins, and every row above is sourced. Keep "faster", "lighter", "smaller bundle" and "better performance" off every surface: the one head-to-head runtime measurement (software WebGL2, `evidence/vs-threejs/RESULTS.md`) favours three.js on bundle and frame cost. Plain `check-deploy` is the static asset check; only `check-deploy --browser` catches failed requests and console errors. The full gate history is in `evidence/vs-threejs/RESULTS-4.5.0.md` and `evidence/vs-threejs/4.5.0/gate.txt`.

## Next claims to measure

1. **"A whole game in less code."** The coin-dash game measured 271 lines on Aura3D against 373 on three.js, 27% fewer, with 32 of 32 behavioural checks passing and equal replay hashes (`RESULTS-4.5.0.md` section 11). Make it a gate target to publish it.
2. **"AI agents ship a game faster on Aura3D."** Run the cold-start trial on a full-game task, where the game kits matter most.
3. **Real-device showcase numbers.** Capture the 30 games on real GPUs (`REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all`) for showcase performance and screenshots.

## Reproduce the tagline numbers

```sh
RUN_ID=tagline-$(date -u +%H%M%S) SPECS="tests/browser/tagline-check.spec.ts" tools/remote-acr/run.sh
```

`tools/bench-vs-threejs/tagline/build.mjs` scaffolds `create-aura3d`, builds the Aura3D scenes and the two three.js apps with a stock `vite build`, and the spec renders each one. The extracted results and frames are in `evidence/vs-threejs/tagline-check/`.
