# Why Aura3D over three.js

Status: 2026-10-27, Aura3D 4.3.5 compared with three.js 0.185.1. For marketing, sales and the site. Every claim below is one we can back: each row names its source, so copy built from this page holds up when a developer checks it.

## The pitch

three.js gives you a renderer. Everything after that is your job: loaders, environment lighting, shadows, post-processing, controls, the game loop, the HUD, audio, asset handling, licensing and the deploy checks. Aura3D ships all of that as one engine and one toolchain, with its own renderer, a typed declarative scene and an asset pipeline that will not let an unverified model reach production. It is built from the start to be written by AI coding agents.

Aura3D is a standalone engine. `@aura3d/engine` has no `three` dependency; it renders through its own `@aura3d/rendering` package.

Per-capability status (shipped, partial, experimental) with code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md). Codemod figures in this doc are counted from the `mapping:` fields in `packages/aura3d-cli/src/migrate-three/mappings.ts` (245 constructs: 21 exact, 174 approximate, 47 none, 3 pending).

## Headline

**Supporting line:** "Half the code of three.js for a lit 3D product viewer."

The source is the five-scene benchmark: a GLB with HDR environment lighting, a shadow, bloom and orbit controls takes 24 lines in Aura3D and 49 in three.js, with 1 import against 8 (`evidence/vs-threejs/RESULTS.md` sections 1 and 3). Small print on the page: "Aura3D benchmark, five scenes."

**The current hero**, "Ship a typed 3D scene in 18 lines of TypeScript", holds up: the 18-line scene builds on a stock `create-aura3d@4.3.5` project and renders (`evidence/vs-threejs/tagline-check/`). Its weakness is that the 18 lines draw a single cube, which undersells the product. The 10-line hero below replaces it.

**Verified hero, ready now:** "A lit 3D product in 10 lines of TypeScript." Adding `camera.frameAsset` and `targetHeight` to the hello world gives a framed, shadowed, orbitable product in 10 lines on stock `create-aura3d@4.3.5` (`tools/bench-vs-threejs/tagline/aura-variants/hero.ts`, `evidence/vs-threejs/tagline-check/run2/`). The matched three.js app (HDRI environment, shadowed key light, tone mapping, model loading and framing, resize, render loop) is 38 lines before orbit controls, or 55 with the same post stack (`evidence/vs-threejs/tagline-check/README.md`). The site design update builds the homepage around this line: `docs/design/marketing-site-update.md`.

## Where Aura3D wins

| What you need | With Aura3D | With three.js | Source |
|---|---|---|---|
| A good-looking scene on first run | `looks.preset(id)` supplies HDRI lighting, a shadow-casting key light, background, grade and post effects in one call. 15 genre looks | No environment, tone mapping or shadows by default. PBR metals render dark until you wire an environment | `packages/engine/src/agent-api/looks/lookPresets.ts`; `RESULTS.md` §11 |
| Scene code | Shorter in 4 of 5 benchmark scenes, 26% to 51% fewer lines: viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82 | Longer | `RESULTS.md` §1 |
| Imports and concepts | 1 import module; fewer API symbols in every benchmark scene | Up to 8 modules (core plus addons) | `RESULTS.md` §3 |
| Bloom, shadows, custom post pass | One call each: `effects.bloom()`, `shadow: true`, `effects.shaderPass()` | `EffectComposer` plus 3 or 4 addon passes; shadow flags on every mesh | `RESULTS.md` §11 |
| 10,000 instances with per-instance colour | Declarative `instances.*({ transforms, colors })` | Hand-written `InstancedMesh` matrix code | `RESULTS.md` §11 |
| Character animation | Switch clips by name with cross-fade (`handle.play("Run", { crossFade })`) and fit the character to a height with one `targetHeight` option | `AnimationMixer`, `clipAction`, manual fitting with `Box3` | `RESULTS.md` §11 |
| Type-safe assets | `model(assets.robot)`: a generated typed key, so a missing asset is a compile error | Asset paths are plain strings, checked only at run time | `templates/product-viewer/src/aura-assets.ts`; `tests/unit/agent-api/public-example-boundary.test.ts` |
| Asset licence and integrity | Every admitted model records source, licence, author and sha256. In production, a model without a valid hash and same-origin URL does not draw | Loads any file from any URL | `docs/agents/claims-and-boundaries.md` §5 and §6; `docs/api/model-loader.md` |
| Getting assets | `aura3d assets search` and `resolve` pull licence-tagged open models (CC0, CC-BY) and type them; Meshy generation, optimization, inspection and thumbnails from the same CLI | Bring your own files and tools | `packages/aura3d-cli/src/cli-help.ts` |
| A deploy gate | `aura3d check-deploy --dist dist` fails the build on a missing hashed asset, stray files and asset-validation errors; `--release` adds licence and quality gates | None | `packages/aura3d-cli/src/index.ts:1097` |
| Game shell | HUD, touch controls, juice and session flow (`@aura3d/engine/game`); genre kits for racket sports, karting, car soccer, fighting and platformer motion | Not included | `docs/api/root-exports.md` (27 exports in the game kit); `docs/api/game-kit.md` |
| Fixed timestep, replay and QA | `createFixedStepLoop`, seeded `createCountedRng`, `installQaHooks` for scripted, repeatable test runs | Write your own | `packages/engine/src/qa/`; `docs/api/qa-kit.md` |
| Smooth motion on 120 and 144 Hz screens | `createRenderInterpolator` and `createFixedStepPresenter`: a 60 Hz simulation no longer freezes on every second frame at 120 Hz (50% stalled frames before, 0% after) | Write your own | `docs/api/motion-presenter.md` |
| Blank-screen protection | `installSafetyNet` detects black frames and recovers; `createFrameErrorBoundary` keeps rendering after a throwing frame callback; `?diag=1` diagnostics panel | Not included | `packages/debug/src/safety`; `docs/api/safety-net.md` |
| Game audio | Procedural cue bank, step sequencer and tone loops on one shared audio context | Positional audio primitives only | `packages/audio/src/synth`; `docs/api/audio-synth.md` |
| Shader safety | `material.custom` GLSL with a chunk library (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) and loud compile errors | `ShaderMaterial` with uniforms and varyings declared by hand | `docs/api/glsl-chunks.md`; `RESULTS.md` §11 |
| Working with AI coding agents | `llms.txt`, 14 agent skills, compiled recipes and a type-traps table, written into every new project by `create-aura3d` | No official agent docs | `packages/aura3d-cli/skills/`; `create-aura3d --help` |
| Coming from three.js | `aura3d migrate three` maps 245 three.js constructs and writes an annotated port worklist | n/a | `docs/aura3d-vs-threejs.md`; `packages/aura3d-cli/src/migrate-three/` |
| Starting a project | 20 `create-aura3d` templates (product viewer, mini-game, racing, falling blocks, fighting, arena shooter, character controller, animation studio and more), each with route-health and screenshot tests | Generic Vite templates | `packages/create-aura3d/templates/` |
| Proof it ships | 25 playable games built on Aura3D | n/a | `docs/workflows/game-inventory.json`; showcase at https://aura3d.auraone.ai/apps/showcase-index/ |

## The moat, ranked

What a three.js team cannot rebuild by adding a library or two:

1. **Assets that are typed, hashed and licensed end to end, enforced at run time.** The CLI admits each model with provenance and a hash, generates the typed key, `check-deploy` fails the build when a hashed file is missing, and the renderer refuses to draw an unverified model. Copying this takes a loader policy, a build step, a manifest format and a CLI that all agree with each other. For anyone shipping AI-generated or third-party art, this is the licensing and supply-chain answer.
2. **An engine designed to be written by AI agents, and tuned by measurement.** The API, docs, recipes and skills ship together and are improved by a repeatable cold-start trial (`tools/agent-eval`). In that trial, fresh agents working from the Aura3D docs alone went from 8 to 14 working scenes out of 15, and from 40 to 10 median turns, and every first build compiled (15 of 15). A library whose docs, engine and tooling have different owners cannot run that loop.
3. **The whole game stack in one install.** Fixed-step loop, seeded replay, QA hooks, safety net, high-refresh interpolation, HUD, touch, audio and genre kits, proven across 25 shipped games. Pieces exist separately around three.js; the integration and the shipped games are what take time.
4. **Quality gates built into the product.** The public-example boundary test, route-health specs in all 20 templates, `assets validate --release` and `check-deploy`. Teams adopting Aura3D get the release process along with the code.

Strong features that support the moat: the declarative typed scene, look presets, one-call effects, instancing, scatter, sky, water and weather nodes, and the migration codemod.

## Ad-ready claims

Use these as written. The sourced numbers carry the small print shown.

| # | Claim | Label | Small print | Source |
|---|---|---|---|---|
| 1 | "A lit 3D product in 10 lines of TypeScript." | safe | none | `tools/bench-vs-threejs/tagline/aura-variants/hero.ts`; `tagline-check/run2/` |
| 2 | "Half the code of three.js for a lit 3D product viewer: 24 lines vs 49, one import vs eight." | needs-qualifier | "Aura3D benchmark, five scenes." | `RESULTS.md` §1, §3 |
| 3 | "Up to 51% less scene code than three.js." | needs-qualifier | "4 of 5 benchmark scenes." | `RESULTS.md` §1 |
| 4 | "Every model typed, hashed and licensed. In production, unverified assets don't draw." | safe | none | `claims-and-boundaries.md` §6 |
| 5 | "Find, license, optimize, type and check your 3D assets with one CLI." | safe | none | `cli-help.ts` |
| 6 | "Game batteries included: HUD, touch, audio, fixed-step loop, seeded replay and a safety net, in one install." | safe | none | `root-exports.md`, `game-kit.md` |
| 7 | "Smooth on 120 and 144 Hz displays, out of the box." | safe | none | `motion-presenter.md` |
| 8 | "Built for AI coding agents: llms.txt, 14 skills and recipes in every new project." | safe | none | `packages/aura3d-cli/skills/` |
| 9 | "25 playable games built on Aura3D." | safe | none | `game-inventory.json` |
| 10 | "Ship a typed 3D scene in 18 lines of TypeScript." (current hero) | safe | none | `tagline-check/` |

Claims to keep off the site (they don't hold today): "check-deploy catches failed requests and console errors" (the command is static, `packages/aura3d-cli/src/index.ts:1097`), and any "faster" or "smaller than three.js" wording. Item 2 in "Claims to unlock next" turns the first one into a usable claim.

## Claims to unlock next

Each of these turns into a bigger headline once it is done.

1. **A darker studio hero frame.** The 10-line hero renders on the light studio backdrop in every Aura3D variant, including the shipped template; the `product-studio` look's `#2b2f36` background value does not show above the horizon (`evidence/vs-threejs/tagline-check/run2/README.md`). Fixing that gives a more premium hero frame without an extra floor line.
2. **"Ship-check catches broken requests and console errors."** The homepage (`marketing/index.html` lines 108 and 716 to 717) already says this about `check-deploy`, but today the command checks the build output and asset manifest only. Adding a browser pass that loads each route and fails on 4xx/5xx responses and console errors makes that copy true. Until then, change those lines to "checks every shipped asset's hash, licence and typed reference".
3. **"A whole game in a fraction of the code."** Compare one complete game (HUD, audio, touch, replay) line for line against three.js plus the usual libraries. This is where Aura3D's built-in kits should show the widest gap.
4. **"AI agents ship a game faster on Aura3D."** Run the cold-start trial on a full-game task with 4.3.5. The game kits should matter most there.
5. **Real-device showcase numbers.** Capture the 25 games on real GPUs (`REAL_GPU_HEADLESS=false tools/real-gpu/run.sh all`) for showcase performance and screenshots.

## Reproduce the new tagline numbers

```sh
RUN_ID=tagline-$(date -u +%H%M%S) SPECS="tests/browser/tagline-check.spec.ts" tools/remote-acr/run.sh
```

`tools/bench-vs-threejs/tagline/build.mjs` scaffolds `create-aura3d@4.3.5`, builds the 6-line and 18-line scenes and the two three.js apps with a stock `vite build`, and the spec renders each one. The extracted results and frames are in `evidence/vs-threejs/tagline-check/`.
