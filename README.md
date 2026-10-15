# Aura3D

[![npm version](https://img.shields.io/npm/v/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![npm downloads](https://img.shields.io/npm/dm/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-browser%203D-3178c6.svg)](https://www.typescriptlang.org/)

Build browser 3D apps from prompts, assets, and TypeScript.

Aura3D is the developer SDK for AI-authored, agent-written browser 3D software: product viewers,
interactive scenes, cinematic pages, prototype game routes, animation tools,
and deployable Vite apps. It gives coding agents and developers a real 3D app
surface instead of a pile of renderer glue: typed GLB/glTF assets, scene kits,
starter templates, route-health checks, screenshots, and static deploy proof.

Describe the scene. Keep the code. Ship the app.

## Start In One Command

```bash
npx create-aura3d@latest my-product --template product-viewer
cd my-product
npm run dev
```

Add a real model and keep it typed:

```bash
npx @aura3d/cli@latest assets add ./assets/sneaker.glb --name sneaker
```

Render it from normal TypeScript:

```ts
import { createAuraApp, environments, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.sneaker)).add(environments.studio())
});
```

## Why Developers Install It

- **Prompt-to-code, not prompt-to-mystery.** Aura3D turns AI-generated 3D work
  into editable TypeScript projects you can inspect, test, and ship.
- **Real assets by default.** The CLI tracks GLB/glTF source, license,
  metadata, hashes, and generated `assets.name` imports.
- **Templates that start as apps.** Product viewers, cinematic scenes,
  mini-games, fighting-game prototypes, animation channels, episode builders,
  character controllers, and Three.js migration starters all scaffold as Vite
  projects.
- **Built-in proof.** Route-health checks, screenshots, package smoke tests,
  and deploy checks are part of the workflow instead of an afterthought.
- **Designed for coding agents.** Codex, Claude, Cursor, and other agents get
  a stable API, typed assets, and guardrails that keep generated scenes in real
  source code.

## What You Can Build

```bash
npx create-aura3d@latest shoe-launch --template product-viewer
npx create-aura3d@latest launch-film --template cinematic-scene
npx create-aura3d@latest arena --template fighting-game
npx create-aura3d@latest episode --template prompt-animation-channel
npx create-aura3d@latest studio --template animation-studio
```

Aura3D is especially useful when the output needs to be more than a demo:
typed assets, browser tests, screenshots, deploy checks, and source code that a
developer can keep owning after the AI has written the first pass.

## Packages

- `@aura3d/engine`: public TypeScript runtime for browser 3D scenes and apps
  (4.0.0 removed the `@aura3d/lean` compatibility package; its `.` entry now
  serves the same core path through code-split internals).
- `create-aura3d`: one-command Vite scaffolds for Aura3D projects.
- `@aura3d/cli`: typed GLB/glTF asset workflow, catalog search, look presets
  and the look-dev loop (`aura3d look capture`), validation, diagnostics, and
  deploy checks.
- Package modules for animation, rendering, scene, physics, materials, React,
  product-studio, workflows, controls, environments, and Three.js migration.

## Proof-Oriented By Design

Aura3D is built for public, inspectable software. Generated projects keep their
TypeScript source, asset manifest, tests, screenshots, and deploy checks in the
repo. The claim-boundary and release evidence docs live under `docs/` for teams
that need strict publication review, but the developer path starts here: create
an app, add typed assets, run it, test it, deploy it.

## Current Release 4.0.0

Aura3D 4.0.0 is published across all **24 active public packages** on npm (all pre-4.0 versions `< 4.0.0` and the 5 retired pre-4.0 compatibility packages `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/materials`, `@aura3d/environments`, and `@aura3d/editor` are deprecated in full on npm in favor of `@aura3d/engine@4.0.0`). See the
[GitHub release](https://github.com/auraoneai/aura3d/releases/tag/v4.0.0) for
release assets and package details, and [`docs/MIGRATION-4.0.md`](docs/MIGRATION-4.0.md)
for the 4.0 consolidation guide.

Aura3D 4.0.0 is the consolidated browser 3D engine release for the agent era — prompt it, prove it, ship it. It unifies the public runtime surface on `@aura3d/engine@4.0.0`, upgrades all 19 browser 3D games and showcases with custom Meshy PBR GLB assets and interactive gameplay loops, ships the full post-processing, atmospheric, particle, weather, ribbon, and game-feel effects suite (`effects.*`), exports the resident WebGPU compute particle pipeline alongside the WebGL2 runtime, and carries forward the 3.0.1 and 2.0.4 evidence foundation. Claims remain scoped to the public API and evidence described in the release documentation.

### What ships in 4.0.0

- **Single Public Entrypoint (`@aura3d/engine@4.0.0`).** Consolidated public runtime surface (`createAuraApp`, `model(assets.x)`, `scene`, `camera`, `lights`, `effects`, `atmosphere`, `environments`, `shadows`, `game.*`, `sceneKits.*`, `prefabs.*`, `primitives.*`, `animation`, `createPhysicsRuntime`) with pre-4.0 versions (`< 4.0.0`) and retired compatibility packages (`@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/materials`, `@aura3d/environments`, `@aura3d/editor`) deprecated in full on npm.
- **Complete Effects, Post-Processing, Atmospherics & VFX Suite (`effects.*`).** Built-in scene-graph effect builders covering HDR bloom (`effects.bloom`, `effects.neonBloom`, `effects.cinematicBloom`), screen-space & contact occlusion (`effects.ambientOcclusion`, `effects.contactOcclusion`, `effects.contactShadows`), screen-space reflections (`effects.screenSpaceReflections`), physical depth of field (`effects.depthOfField`), camera/object motion blur (`effects.motionBlur`), ACES/AgX color grading & finishing (`effects.colorGrade`, `effects.vignette`, `effects.filmGrain`, `effects.chromaticAberration`, `effects.antiAlias`, `effects.outline`), volumetric & height fog (`effects.fog`, `effects.depthFog`, `effects.volumetricFog`, `effects.fogVolume`, `effects.lightCone`, `effects.auroraRibbon`), GPU & CPU particle/weather systems (`effects.particles`, `effects.meshParticles`, `effects.rain`, `effects.snow`, `effects.flipbook`, `effects.trail`), physical sky/wetness (`atmosphere.setSky`, `atmosphere.setWetness`), resident WebGPU compute particles (`ResidentGPUParticleRenderer`), and combat game-feel triggers (`game.feel` / `app.feel`).
- **19 Upgraded 3D Browser Games & Showcases.** Upgraded with 38+ custom Meshy 3D PBR GLB hero vehicles, rigged/posed characters, architectural setpieces, and deep interactive gameplay loops (`Aura Clash Arena` development showcase, `Neon Corridor Strike`, `Turbo Drift Circuit`, `Rooftop Buckets`, `Vault Breakers`, `Mech Hangar`, `Patrol Wing`, `Deep Recovery`, `Aurora Lander`, `Gallery Shift`, `Siege Golf`, `Skyline Runner`, `Gravity Post`, `Neon Swarm`, `Bank Shot`, `Blockfall Reactor`, `Orbital Defense`, `Pulse Tunnel`, `Courier Rush`), backed by same-origin fixture and asset delivery.
- **WebGPU Compute + WebGL2 Parity Runtime.** Resident GPU compute particle simulation (`ResidentGPUParticleRenderer`), physical PBR materials (clearcoat, sheen, transmission, anisotropy, iridescence), HDR/IBL environment lighting, and deterministic fixed-step game simulation.
- **Agent-First Authoring & Typed Asset Pipeline.** `create-aura3d@4.0.0`, `aura3d assets add/resolve/import-meshy/validate/typegen`, and `aura3d check-deploy`.

## Effects, Post-Processing, Atmospherics & VFX (`effects.*`)

Aura3D 4.0.0 ships a unified, declarative `effects.*` builder surface in `@aura3d/engine` that attaches directly to `scene()` alongside `atmosphere.*`, `environments.*`, `shadows.*`, and runtime `game.feel` triggers:

```ts
import {
  atmosphere,
  createAuraApp,
  effects,
  environments,
  lights,
  model,
  scene,
  shadows
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.heroCar))
    .add(environments.night({ intensity: 1.15 }))
    .add(lights.studio())
    .add(shadows.cascaded({ cascades: 3, mapSize: 2048, contactHardening: true }))
    // Post-processing & camera lens pipeline
    .add(effects.bloom({ intensity: 0.32, threshold: 0.72, radius: 0.4, antiBlowout: true }))
    .add(effects.ambientOcclusion({ intensity: 0.45, radius: 0.7, falloff: 0.6, multiBounce: true }))
    .add(effects.contactShadows({ length: 0.25, thickness: 0.05, steps: 16, intensity: 0.9 }))
    .add(effects.screenSpaceReflections({ intensity: 0.65, maxDistance: 18, roughnessCutoff: 0.45 }))
    .add(effects.depthOfField({ focusDistance: 6.5, fStop: 2.8, focalLength: 50, maxBlur: 0.015 }))
    .add(effects.motionBlur({ intensity: 0.35, shutter: 0.5, samples: 12 }))
    .add(effects.colorGrade({ exposure: 1.05, contrast: 1.08, saturation: 1.12 }))
    .add(effects.vignette({ intensity: 0.28, smoothness: 0.65, roundness: 0.8 }))
    .add(effects.chromaticAberration({ intensity: 0.0012 }))
    .add(effects.filmGrain({ intensity: 0.035, size: 1.2, luminanceResponse: 0.8 }))
    .add(effects.antiAlias({ mode: "taa", intensity: 1 }))
    // Atmospherics & volumetric lighting
    .add(effects.volumetricFog({ density: 0.018, color: "#0f172a", heightFalloff: 0.22, inscatterIntensity: 0.65 }))
    .add(effects.fogVolume({ center: [0, 0.8, -4], size: [12, 2.4, 12], density: 0.35, color: "#38bdf8", scatteringAnisotropy: 0.4 }))
    .add(effects.lightCone({ position: [0, 5.5, 0], direction: [0, -1, 0], length: 6, radius: 2.4, color: "#38bdf8", intensity: 0.75 }))
    .add(effects.auroraRibbon({ position: [0, 18, -32], width: 48, height: 10, color: "#22d3ee", secondaryColor: "#a855f7", sway: 0.6, shimmer: 0.8 }))
    // Weather, particles, trails & flipbooks
    .add(effects.rain({ count: 1400, area: 24, speed: 16, streakLength: 0.65, splashes: true, mist: true }))
    .add(effects.particles({
      preset: "sparks",
      count: 240,
      color: "#38bdf8",
      lifetimeColorRamp: ["#ffffff", "#38bdf8", "#a855f7"],
      sizeOverLife: [1, 0.6, 0],
      turbulence: 0.45,
      groundCollision: true,
      groundY: 0,
      groundBounce: 0.45,
      blendMode: "additive",
      softParticles: true
    }))
    .add(effects.meshParticles({
      mesh: "dodecahedron",
      count: 36,
      position: [0, 1.2, 0],
      spread: 2.5,
      gravity: -9.8,
      bounce: 0.45,
      groundY: 0,
      color: "#f59e0b",
      metalness: 0.75,
      roughness: 0.28
    }))
    .add(effects.trail({
      attachTo: "hero-car",
      width: 0.28,
      endWidth: 0.02,
      lifetime: 0.45,
      color: "#22d3ee",
      endColor: "#ec4899",
      blendMode: "additive"
    }))
    .add(effects.flipbook({
      atlasCols: 4,
      atlasRows: 4,
      frameCount: 16,
      fps: 24,
      position: [0, 1.4, -2],
      size: 1.8,
      color: "#fb923c",
      blendMode: "additive",
      softParticles: true
    }))
});

// Physical sky & wet surface response
atmosphere.setSky(app, { mode: "preetham", turbidity: 2.4, rayleigh: 1.8, sunElevation: 14, sunAzimuth: 195 });
atmosphere.setWetness(app, { wetness: 0.65, puddleCoverage: 0.45, puddleRoughness: 0.06, rippleIntensity: 0.5 });
```

### Complete Effects Reference (`@aura3d/engine@4.0.0`)

| Category | Builder / API | Key Options & Capabilities |
| --- | --- | --- |
| **Bloom & Glare** | `effects.bloom(opts)` / `effects.neonBloom(opts)` / `effects.cinematicBloom(opts)` | Multi-mip HDR bloom with `intensity`, `threshold`, `radius`, `color`, `quality`, `softKnee`, `shoulder`, and `antiBlowout` / `maxIntensity` luminance clamping. |
| **Ambient & Contact Occlusion** | `effects.ambientOcclusion(opts)` / `effects.contactOcclusion(opts)` / `effects.contactShadows(opts)` | Screen-space ambient occlusion (`intensity`, `radius`, `density`, `falloff`, `multiBounce`), micro-contact grounding, and ray-marched screen-space `contactShadows` (`length`, `thickness`, `steps`, `lights`). |
| **Reflections & Lens Optics** | `effects.screenSpaceReflections(opts)` / `effects.depthOfField(opts)` / `effects.motionBlur(opts)` | Glossy PBR screen-space reflections (`maxDistance`, `thickness`, `roughnessCutoff`, `steps`), physical circle-of-confusion `depthOfField` (`focusDistance`, `fStop`, `focalLength`, `maxBlur`, `bokehScale`), and shutter `motionBlur` (`shutter`, `samples`, `tileSize`). |
| **Color Grading & Finishing** | `effects.colorGrade(opts)` / `effects.vignette(opts)` / `effects.filmGrain(opts)` / `effects.chromaticAberration(opts)` / `effects.antiAlias(opts)` / `effects.outline(opts)` | Tonemapped grading (`exposure`, `contrast`, `saturation`, `shadows`, `highlights`, `lut`), display `vignette` (`smoothness`, `roundness`, `color`), luminance-weighted `filmGrain`, radial `chromaticAberration`, `antiAlias` (`"auto"`, `"taa"`, `"smaa"`, `"fxaa"`, `"msaa"`), and selection/edge `outline`. |
| **Fog, Volumetrics & Sky** | `effects.fog(opts)` / `effects.depthFog(opts)` / `effects.volumetricFog(opts)` / `effects.fogVolume(opts)` / `effects.lightCone(opts)` / `effects.auroraRibbon(opts)` / `atmosphere.setSky(app, opts)` / `atmosphere.setWetness(app, opts)` | Distance & height-falloff fog, depth-aware volumetric inscatter, localized 3D `fogVolume` boxes with `scatteringAnisotropy`, spotlight `lightCone` shafts, animated shader `auroraRibbon` curtains, Preetham/gradient sky, and rain puddle wetness. |
| **Particles, Weather & VFX** | `effects.particles(opts)` / `effects.meshParticles(opts)` / `effects.rain(opts)` / `effects.snow(opts)` / `effects.flipbook(opts)` / `effects.trail(opts)` / `effects.beam(opts)` / `ResidentGPUParticleRenderer` | Presets (`"fountain"`, `"swirl"`, `"ambient"`, `"additive-glow"`, `"soft-alpha"`, `"smoke"`, `"star"`, `"sparks"`, `"embers"`), `lifetimeColorRamp`, `sizeOverLife`, `alphaOverLife`, `turbulence`, `groundCollision`, instanced 3D debris (`meshParticles`), weather (`rain` with splashes/mist, `snow`), sprite-sheet `flipbook`, node/bone ribbon `trail`, energy `beam`, and WebGPU compute `ResidentGPUParticleRenderer`. |
| **Game-Feel & Combat Juice** | `game.feel` / `gameFeel` / `app.feel` | Frame-accurate `hitStop`, `slowMo`, `damageFlash`, `speedLines`, `landingDust`, trauma-based camera shake, and combat impact triggers (`"hit-spark"`, `"impact-flash"`, `"dash-trail"`, `"ground-dust"`). |

### What shipped in 3.0.1

- **Agent-era API surface.** Prompt→game and prompt→animation builders, game-feel triggers, follow/chase/platformer camera rigs, vehicle chassis + driver AI, GPU particles, SDF text, navmesh crowds, visual-scripting catalog, bounded editor surface — each `createAuraApp`-claimed only where root browser evidence exists.
- **Rendering proofs.** Native fused LDR postprocess, multi-mip bloom with presets, exact sRGB output, anisotropic-GGX, cascaded shadows, GGX PMREM IBL, with shader-reference vectors pinning the math.
- **Bounded three.js comparison.** Repository-locked `three@0.185.1` head-to-head reports only; no universal superiority claim.
- **2.0.4 carried forward.** Candidate-only `assets import-meshy`, fail-closed admission, profile diagnostics, spend/secret controls, and the relic `prototype` pilot, unchanged. See the [3.0.1 release notes](docs/project/aura3d-301-release-notes.md) and [GitHub release](https://github.com/auraoneai/aura3d/releases/tag/v3.0.1).

See [the Meshy CLI guide](docs/meshy-cli.md) for the current asset workflow.

### What shipped in 2.0.4 (history)

- **Candidate-only Meshy import.** `assets import-meshy` reuses Aura3D's existing add, inspect, hash, manifest, and type-generation path. Import cannot certify release quality.
- **Fail-closed admission.** Ambiguous or invalid GLBs, unsafe metadata, missing required rights evidence, out-of-root paths, and attempts to request release quality during import are rejected.
- **Profile diagnostics.** Prop, environment, vehicle, and humanoid candidates receive bounded profile-specific checks and next actions. Missing measurements remain unproven rather than passing.
- **Spend and secret controls.** Repository setup and agent-launcher flows pin `@meshy-ai/cli@0.2.0`, require a dry run and an explicitly approved maximum for documented paid workflows, preserve resumable task state, and keep credentials out of arguments and committed files.
- **Optional MCP setup.** The pinned Meshy MCP server is optional and receives its API key only when its process starts. It is not a browser or engine dependency.
- **Bounded pilot.** The relic pilot proves typed candidate use, visible browser rendering, keyboard collection, score/reset state, and desktop/mobile route evidence. It remains a `prototype`; its route-local distance threshold is not collision-system proof.
- **Claim boundary unchanged.** Meshy is an upstream asset-generation tool, not an Aura3D renderer, Prism model, or game-runtime API. This release does not broaden renderer, PBR, WebGPU, animation, physics, or universal Three.js claims.

See [the Meshy CLI guide](docs/meshy-cli.md).

### Consolidated 2.0 outcomes

Earlier minor-release implementation notes have been consolidated into the 2.0 architecture, migration, API, and evidence documentation. Git history retains the original release narratives.

### Measured

- **149 of 149** source-template checks and **149 of 149** clean exact-tarball
  lifecycle checks pass across all **19** public scaffolds. Each lifecycle proves
  install, typecheck, production build, browser load, meaningful interaction,
  static preview, screenshot, route health, and deploy behavior against the packed
  2.0.0 dependency graph. Source: `tests/reports/agent-templates.json` and
  `tests/reports/installed-template-lifecycle.json`.
- **15 of 15** bounded same-workload comparisons pass from freshly packed and
  installed Aura3D 2.0.0 tarballs against repository-locked `three@0.185.1`.
  Individual visual differences and capability boundaries remain part of the
  result; this is not a universal ecosystem-parity claim. The exact migration
  consumer is recorded in `tests/reports/packed-migration-consumer.json`.
- The retained package, architecture, route-health, parity, superiority, and
  documentation gates pass individually; the two required final serial release
  runs remain pending until the human visual-review gate is recorded.
- Clean-room projects against the public surface only: **137 / 142 / 122 / 99** authored
  lines against budgets of 200 / 200 / 300 / 300; one package imported each; **zero**
  private imports.
- Route-local magic-geometry findings in published routes: **47 → 7**.

### Scoped Three.js comparisons

#### Measured 3.0.1 outcomes

Measured win: the `@aura3d/engine` core primitive critical path compresses to `77458` gzip bytes against its 80,000-byte budget, from `tests/reports/bundle-size.json`.

Measured loss: the compatibility-root observation bundle is over budget at `575343` gzip bytes against the same 80,000-byte budget, from `tests/reports/bundle-size.json`.

Both figures are measured on the exact 3.0.1 packages and bound by SHA-256 to the L01 package receipt `tests/reports/muse3jsparity/l01/f4049f235500c8a98f7bc0a86ecf9f1a9d8cbe68/l01.receipt.json`; they establish bundle-size facts only, not a universal performance ranking.

#### Why Aura3D can beat Three.js in scoped workflows

Aura3D can reduce authoring and packaging work in selected, reproducible
workflows where its typed assets, narrow entries, scaffolds, and integrated
evidence pipeline replace manual renderer glue. That is a scoped result, not a
claim of universal visual, performance, or ecosystem superiority. The current
15-workload comparison records every observed loss and remains incomplete until
the independent same-scene gallery review is approved. See
`tests/reports/superiority/claim-defense.json` and
`docs/project/threejs-superiority-status.md` for the generated verdict and its
claim boundaries.

### What is still not resolved

Stated because a release note that omits this is not useful:

- **Five example routes were unhealthy in the retained tier-12 audit** (`tests/reports/tier12-route-health/report.json`,
  generated 2026-09-03): `custom-material-lab`, `neon-corridor-strike`, `raycast-ccd-lab`, `recast-crowd-lab`, and
  `rendering-large-scene` each stayed status-unknown past the 10 s readiness budget (four by under one second, a
  load-flake signature under the documented host load; two also lacked measurable canvas evidence). They are
  disclosed here rather than left out, and the audit is re-run before release so this list tracks current truth.

- **The recommended narrow entries now meet all three comparative bundle budgets.** Measured
  2026-08-08 by `tools/bundle-scenarios` against real Three.js builds of the same scene, through
  one shared bundler config. The compatibility-heavy root still exists for upgrades and is not
  presented as the smallest new-app import:

  | Scenario | Aura3D | Three.js | Ratio | Budget |
  | --- | --- | --- | --- | --- |
  | Core primitive scene (one cube) | 69,024 B | 118,603 B | **0.582x** | 1.25x |
  | Product viewer (glTF, PBR, orbit, IBL) | 182,144 B | 145,978 B | **1.248x** | 1.25x |
  | Game runtime (input, physics, loop) | 118,765 B | 142,809 B | **0.832x** | 1.50x |

  These historical budgets were derived from the measured `three@0.165.0`
  equivalents. Browser proof executes the core, real-GLB product, and input + shared
  production-physics game paths through `tests/browser/lean-entry-runtime.spec.ts`.
- **Where Aura3D won in the frozen `three@0.165.0` scenarios:** authored lines
  **9 / 14 / 19** against Three.js's **15 / 27 / 40**, and one install instead of two for
  a game runtime. Across seven product workflows the gap is wider — 15 vs 74 lines for a
  product configurator, 10 vs 68 for glTF asset review. TypeScript compile time is
  effectively tied or faster in the current three-process median measurement
  (653 vs 651 ms; 628 vs 676 ms; 642 vs 662 ms). Runtime construction through
  the first verified non-blank browser frame measured **24.1 ms vs 33.8 ms**, excluding download
  and module evaluation. Isolated install-to-verified-cube medians were slower for Aura3D:
  **6,638.6 vs 5,047.9 ms cold** and **3,199.5 vs 2,297.7 ms warm**, across three fresh projects per
  engine and cache state. Full raw samples and methodology:
  `tests/reports/developer-friction.json`.
- `showcase-blockfall-reactor`, `showcase-skyline-runner`, and
  `showcase-turbo-drift-circuit` have materially rebuilt gameplay and current
  automated route evidence, but remain **promotion-blocked pending independent
  review of the exact final artifacts**. None of that review converts Turbo's
  authored-unit arcade contract into physical tyre or vehicle-dynamics proof.
- `aura-clash-showcase` is **not in the route-gate registry**, so showcase-wide gates do
  not cover it. It carries its own 23-spec suite.
- `@aura3d/engine`'s `.` entry re-exports the remaining 64 deprecated union names
  that other lanes still consume (arch-gates `export-budget`; they leave "." in the
  next minor per §6.6 step 3); `unique-ownership` reports 0 exported
  symbol names with more than one owning package.
- The current public `examples/` inventory contains **13 retained routes** after
  duplicate, contract-only, or visually rejected hosts were internalized. The
  clean 2026-08-09 source/canvas/full-page audit passed all 13 with no filtered
  failure list; material, postprocess, and large-scene differences remain
  disclosed rather than being converted into a blanket parity claim.
- The historical `three@0.165.0` comparisons cover **54 selected example-level rows**, all
  matched by the generated inventory with **0 high-priority rows open**. This is a
  bounded compatibility and migration result, not a claim that Aura3D universally
  replaces the Three.js ecosystem or that every feature is exposed through the root
  safe API. See `docs/project/threejs-superiority-status.md` and the generated
  `tests/reports/superiority/claim-defense.json` decision.

### Why Aura3D can beat Three.js in scoped workflows

Aura3D's historical measured advantage is the integrated product workflow: the frozen `three@0.165.0` bundle and
developer-friction scenarios above use fewer authored lines, fewer direct dependencies,
and narrower entry points while retaining browser-rendered evidence. Visual quality,
animation, physics, lifecycle, and migration conclusions remain limited to the named
fixtures, routes, assets, browsers, and thresholds in those reports. Universal engine or
ecosystem superiority is not claimed.

The current product boundary and evidence are documented in
`docs/project/status/current-state.md` and
`docs/project/verification-evidence.md`.

Install the current release:

```bash
npm install @aura3d/engine@4.0.0
# or scaffold an app
npx create-aura3d@4.0.0 my-product --template product-viewer
```

The 4.0.0 release is available from
[GitHub Releases](https://github.com/auraoneai/aura3d/releases/tag/v4.0.0),
with the removal surface in [`docs/MIGRATION-4.0.md`](docs/MIGRATION-4.0.md), the 3.0.1 release at [v3.0.1](https://github.com/auraoneai/aura3d/releases/tag/v3.0.1), and the archived 2.0 guide in [`docs/migration/2.0.md`](docs/migration/2.0.md)
and retained claim boundaries and release evidence under `docs/project/`.

## Aura3D 2.0 asset catalog

Aura3D 2.0 includes the catalog-first asset workflow for AI coding agents. When a prompt names a real object, agents should search the hosted Aura3D catalog before writing scene code:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

The resolver pulls only verified auto-pullable candidates into the existing typed asset pipeline, then scene code uses `model(assets.helmet)`. Unverified or marketplace candidates stay as deep-links until the user approves and supplies the asset.

For game characters, use the catalog profile so the CLI filters toward animated redistributable GLB candidates and preserves catalog provenance when it registers the typed asset:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter --no-placeholders --require-license
```

`--profile fighting-character` requires animated GLB candidates from verified CC0/CC-BY sources, applies a browser-sized triangle budget, and writes source URL, license, author/attribution, and source family into `aura.assets.json` during `assets resolve`.
## Aura3D 2.0 runtime launch track

Aura3D 2.0 introduced the runtime and animation evidence foundation; 4.0.0 (succeeding 3.0.0 and 3.0.1) is
the published package train that carries it forward:

- `game runtime`: mutable runtime nodes, app-owned frame loops, input, kinematic bodies, hitboxes, combat events, camera direction, effects, and evidence for browser-native game prototypes.
- `fighting-game template`: `npx create-aura3d@latest my-fighter --template fighting-game` scaffolds a public-API playable starter using typed assets, `app.input(...)`, `app.onFrame(...)`, `game.kinematicBody(...)`, `game.combatWorld(...)`, and `app.evidence(...)`.
- `prompt animation`: `npx create-aura3d@latest my-episode --template prompt-animation-channel` scaffolds structured episode plans, storyboards, shot timelines, captions, visemes, render queues, and evidence for prompt-authored animation/video workflows. The shorter `animation-channel` template name remains supported.
- `AuraVoice bridge`: AuraVoice owns script/audio/caption/viseme timing; Aura3D owns typed scene generation, character performance, camera choreography, rendering, screenshots, and visual evidence.

Aura Clash remains a development showcase pending exact-artifact approval, not
an automatically approved polished flagship claim.
Historical runtime, screenshot, route, GLB, package-smoke, and deployment
receipts do not replace current gameplay, visual, asset, audio, performance,
and documentation gates.

## Install

Scaffold a browser 3D app:

```bash
npx create-aura3d@latest my-scene --template product-viewer
cd my-scene
npm run dev
```

Install the engine directly:

```bash
npm install @aura3d/engine
```

Add a typed GLB/glTF asset when the prompt includes a real model:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
```

Then use the public developer API:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";
```

## Use Aura3D for

- AI-generated 3D scenes that remain editable TypeScript.
- Browser 3D apps built with a stable SDK instead of improvised renderer glue.
- Typed GLB/glTF product viewers, product configurators, and model showcases.
- Browser-native game prototypes with playable routes, HUDs, input, evidence, tests, and deploy-ready output. Public racing/platformer examples require the certified game-geometry layer described in `docs/project/aura3d-game-layer-rebuild-plan.md`.
- Prompt-to-3D workflows for AI coding agents, Cursor, Claude, Codex, and other assistants.
- WebGL examples plus bounded WebGPU package/diagnostic routes whose backend and
  device evidence is named explicitly.
- Vite 3D starter apps with route health, screenshot tests, and deploy checks.
- Static-deployed 3D websites where proof, screenshots, and reliability matter.

## Aura Clash development showcase

Aura Clash Arena is the active Aura3D game-runtime proof target: a 1v1 browser arena-fighter development showcase built with `@aura3d/engine` public APIs.

The showcase exercises scoped Aura3D runtime, animation, and combat packages on
a deterministic route. Because it imports advanced-runtime,
production-runtime, rendering, scene, and animation subpaths in addition to the
root package, it is not blanket proof of root `createAuraApp` capability.

The showcase currently targets:

- typed or validated stylized fighter assets;
- typed asset members from `src/aura-assets.ts`;
- `model(assets.x)` runtime usage;
- arena composition, lighting, effects, camera framing, and material polish;
- arcade movement, hitboxes, guard state, meter, AI pressure, and results;
- evidence routes, accessibility settings, poster capture, Playwright contracts, sitemap and robots integration, and marketing homepage placement.

Open the source route at `apps/aura-clash-showcase/`. Treat the current route as
a development showcase until the current 2.0 gameplay, visual, asset, audio,
performance, deployment, docs-claim, and independent-review gates pass.

## Animation Studio — prompt → rendered short

The **Animation Studio** turns a natural-language prompt into a deterministic, rendered animated short. Scene intelligence lives in a generated, validated **EpisodeDocument** (cast, set, dialogue, blocking, camera); a generic player renders it with zero per-scene code. The director is **your own coding agent** (Claude Code / Codex / Cursor) driving a validated **Scene-Tool CLI** — no bundled LLM, no API key.

```bash
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio && pnpm install
pnpm scene new --prompt "two office workers arguing about a deadline" --full
AURA_QUALITY=final pnpm episode:render-3d          # → a silent 1080p .webm
```

A prompt drives the whole document: cast (parsed from the prompt, bound to curated A-grade humanoid rigs), set (keyword-routed interiors/outdoors — **never a moon-garden default**), dialogue (agent-authored or synthesized, timed by speech duration), camera, and blocking with velocity-gated locomotion (legs cycle only while actually moving). A web studio (`apps/animation-studio-web`) gives the agent a 3-pane NLE shell + live previews and runs real validated Scene-Tool commands.

Audio boundary (firm): Aura3D renders **silent video by design** and never does TTS — it emits the timed dialogue/caption/viseme track, and **AuraVoice** owns the script, narration, TTS, and voice mux. The commercial wedge is **repeatable family-safe short episodes from a cast + set library**; see `docs/project/go-to-market-strategy.md`.

Built for fast, repeatable, agent-directed shorts — a proven, deterministic pipeline with prompt-specific scenes, a clean stylized look out of the box, and the upgrade path to photoreal characters via your own rigged GLB (`cast add --file`). Integrity is built in: a still image with CSS wobble/pan/subtitles is not Aura3D animation, and the quality suite rejects stiff or lip-only output.

See:

- [`docs/animation-studio/quickstart.md`](docs/animation-studio/quickstart.md) — 5-minute prompt → render → edit
- [`docs/animation-studio/README.md`](docs/animation-studio/README.md) — overview + architecture
- [`docs/animation-studio/guide.md`](docs/animation-studio/guide.md) — CLI, EpisodeDocument, motion, dialogue, rendering
- [`docs/animation-studio/studio-app.md`](docs/animation-studio/studio-app.md) — the web studio app
- [`docs/animation-studio/quality-and-limitations.md`](docs/animation-studio/quality-and-limitations.md) — quality gates + the honest ceiling
- [`docs/api/auravoice-bridge.md`](docs/api/auravoice-bridge.md) — the voice/timing handoff
- `docs/project/go-to-market-strategy.md` — use cases + monetization

## 30-second product viewer

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(model(assets.robot))
    .add(lights.studio()),
  diagnostics: { overlay: true }
});
```

The safe API uses generated refs such as `assets.robot`. Do not write `model("robot")`, hand-written GLB URLs, or invented asset ids.

## Aura3D 2.0 game runtime example

Add typed assets before writing model code:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
npx @aura3d/cli@latest assets add ./assets/opponent.glb --name opponent
```

Then use the public game facade and stage builders:

```ts
import {
  AnimationController,
  createAuraApp,
  game,
  games,
  lights,
  model,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const stage = games.fighting.stagePreset("neon-dojo");
const stageIssues = games.fighting.validateStage(stage);

const fighting = game.fighting({
  playerId: "player",
  opponentId: "opponent",
  stage: { width: stage.combatBounds.maxX - stage.combatBounds.minX },
  autoListen: true
});

const app = createAuraApp("#app", {
  scene: stage.nodes
    .reduce((builder, node) => builder.add(node), scene())
    .add(model(assets.fighter).runtime(game.runtimeNode("player", { tags: ["fighter", "local"] })))
    .add(model(assets.opponent).runtime(game.runtimeNode("opponent", { tags: ["fighter", "ai"] })))
    .add(lights.studio())
});

const player = app.nodes.require("player");
const opponent = app.nodes.require("opponent");
const animation = new AnimationController({
  clipRegistry: assets.fighter,
  requiredClips: ["Idle", "Walk", "LightPunch"],
  suppressRootMotion: true
});

const touchLayout = game.touchControls({
  width: window.innerWidth,
  height: window.innerHeight,
  buttons: [
    { action: "jump", label: "Jump", binding: "TouchJump" },
    { action: "light", label: "Light", binding: "TouchLight" }
  ]
});

const jumpAssist = game.jumpAssist({ coyoteMs: 100, bufferMs: 120 });
const hud = game.hud.bindings([
  game.hud.health({ actorId: "player", label: "Player health" }),
  game.hud.health({ actorId: "opponent", label: "Opponent health" }),
  game.hud.timer({ valuePath: "round.timeRemaining" }),
  game.hud.debugToggle({ action: "debug", statePath: "debug.visible" })
]);
const accessibility = [
  game.accessibility.label({ targetId: "player-health", label: "Player health", live: true }),
  game.accessibility.pauseControls({ actions: ["pause", "Escape"], resumeActions: ["pause", "Enter"], menuId: "pause-menu" })
];

app.onFrame(({ dt }) => {
  const snapshot = fighting.update(dt);
  animation.update(dt);

  jumpAssist.update(dt, {
    grounded: fighting.bodies.player.grounded,
    jumpPressed: fighting.input.pressed("jump")
  });
  if (jumpAssist.consume()) fighting.bodies.player.jump();

  if (fighting.input.pressed("light")) {
    animation.crossFade("LightPunch", 0.08, { restart: true });
  }

  player.setPosition(snapshot.player.position[0], snapshot.player.position[1], snapshot.player.position[2]);
  opponent.setPosition(snapshot.opponent.position[0], snapshot.opponent.position[1], snapshot.opponent.position[2]);
});

const replayPlan = game.inputReplay(fighting.input.recorded(), { fps: 60, label: "round-1" });
const replayInput = game.input({
  actions: fighting.controls.actions,
  axes: fighting.controls.axes,
  autoListen: false
});
const replayDriver = game.inputReplayDriver(replayInput, replayPlan);

const colliders = [
  game.collider.capsule({ id: "player-body", center: fighting.bodies.player.position, radius: 0.34, height: 1.7 }),
  game.collider.capsule({ id: "opponent-body", center: fighting.bodies.opponent.position, radius: 0.34, height: 1.7 })
];
const overlay = game.debug.overlay({
  runtime: app.runtime,
  input: fighting.input,
  bodies: [fighting.bodies.player, fighting.bodies.opponent],
  combat: fighting.combat,
  effects: fighting.effects,
  camera: fighting.camera,
  colliders,
  warnings: stageIssues.map((issue) => issue.message)
});

const evidence = app.evidence({
  input: fighting.input,
  bodies: [fighting.bodies.player, fighting.bodies.opponent],
  combat: fighting.combat,
  effects: fighting.effects,
  camera: fighting.camera,
  hud,
  accessibility,
  stage: { id: stage.id, safeZones: true, bounds: stage.combatBounds, warnings: stageIssues.map((issue) => issue.message) }
});

console.log(touchLayout.controls.length, replayDriver.snapshot(), overlay.sections, evidence.systems);
```

## Aura3D 2.0 prompt-animation and AuraVoice example

Prompt-animation routes use typed assets, contract artifacts, shot playback, captions, visemes, and AuraVoice timing packages.

```ts
import {
  collectPromptAnimationEvidence,
  compilePromptEpisodePlan,
  createAudioStemManifest,
  createAuraApp,
  createAuraVoiceBridgePackage,
  createAuraVoiceVisemeTrack,
  createAnimationRenderOutputPackageMetadata,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  createShotPlaybackPlan,
  evaluatePromptAnimationPublishReadiness,
  game,
  installShotPlayback,
  lights,
  model,
  scene,
  sampleAuraVoiceBridgeAtTime,
  validateAuraVoiceBridgePackage
} from "@aura3d/engine";
import { assets } from "./aura-assets";

const plan = compilePromptEpisodePlan({
  episodeId: "moon-garden",
  title: "Moon Garden Helpers",
  prompt: "Two robots clean a glowing moon garden.",
  language: "en",
  runtime: { duration: 30, frameRate: 30, resolution: { width: 1280, height: 720 }, maxTimingDriftFrames: 1 },
  characters: [
    { id: "miko", name: "Miko", role: "hero", asset: assets.miko },
    { id: "luma", name: "Luma", role: "sidekick", asset: assets.luma }
  ],
  locations: [{ id: "moon-garden", name: "Moon Garden", mood: "soft neon bedtime" }],
  beats: [
    {
      id: "beat-001",
      locationId: "moon-garden",
      summary: "Miko and Luma clean the glowing weeds.",
      visualIntent: "Two readable typed characters, safe captions, and gentle light.",
      duration: 8,
      characters: ["miko", "luma"],
      dialogue: [{ speakerId: "miko", text: "The moon garden is glowing again.", emotion: "curious" }]
    }
  ],
  route: "/episodes/moon-garden"
});

const visemes = createAuraVoiceVisemeTrack({
  episodeId: plan.episodePlan.episodeId,
  language: plan.episodePlan.language,
  frameRate: plan.shotTimeline.frameRate,
  cues: plan.dialogueTrack.lines.flatMap((line) =>
    createPrimitiveMouthVisemeCues({
      characterId: line.speakerId,
      speakerId: line.speakerId,
      lineId: line.lineId,
      startTime: line.startTime,
      endTime: line.endTime
    }).map((cue) => createGlbBlendshapeVisemeCue(cue))
  )
});

const audioStems = createAudioStemManifest({
  episodeId: plan.episodePlan.episodeId,
  duration: plan.dialogueTrack.duration,
  stems: plan.dialogueTrack.lines.map((line) => ({
    id: `audio:${line.lineId}`,
    role: "dialogue",
    path: line.audioFile ?? `assets/audio/${line.language}/${line.lineId}.wav`,
    startTime: line.startTime,
    duration: line.endTime - line.startTime,
    language: line.language
  }))
});

const renderOutputPackage = createAnimationRenderOutputPackageMetadata({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  renderQueue: plan.renderQueue
});

const bridge = createAuraVoiceBridgePackage({
  episodePlan: plan.episodePlan,
  storyboard: plan.storyboard,
  shotTimeline: plan.shotTimeline,
  dialogueTrack: plan.dialogueTrack,
  captionTrack: plan.captionTrack,
  visemes,
  audioStems,
  renderQueue: plan.renderQueue,
  renderOutputPackage
});
const bridgeIssues = validateAuraVoiceBridgePackage(bridge);

const playback = createShotPlaybackPlan({
  timeline: plan.shotTimeline,
  performance: plan.performance,
  captions: plan.captionTrack,
  visemes,
  runtimeNodeByCharacterId: { miko: "miko", luma: "luma" },
  loop: true
});

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.miko).runtime(game.runtimeNode("miko", { tags: ["character"] })))
    .add(model(assets.luma).runtime(game.runtimeNode("luma", { tags: ["character"] })))
    .add(lights.studio())
});
installShotPlayback(app, playback);

const sample = sampleAuraVoiceBridgeAtTime(bridge, 3);
const evidence = collectPromptAnimationEvidence({
  bridgePackage: bridge,
  screenshots: [
    {
      id: "shot-001",
      time: sample.time,
      path: "artifacts/screenshots/shot-001.png",
      hash: "sha256:replace-with-rendered-screenshot-hash",
      width: 1280,
      height: 720
    }
  ],
  routeHealth: { status: "pass" }
});
const readiness = evaluatePromptAnimationPublishReadiness(evidence);

console.log(bridgeIssues, evidence.publishReady, readiness.ready);
```

Do not publish placeholder screenshot hashes. Deterministic render output must replace the placeholder before a prompt-animation or AuraVoice route is called publish-ready.

## Prompt-to-3D scene kits

Use scene kits when an AI prompt asks for generated 3D systems rather than a supplied model.

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.physicsPlayground();
createAuraApp("#app", kit.toAppOptions());
console.log(kit.diagnostics, kit.evidence);
```

Maintained scene-kit families include physics playgrounds, particle fountains, solar systems, neon tunnels, 3D data visualizations, mini golf, material labs, city blocks, humanoid walks, and typed product viewers.

## Why developers use Aura3D

- `AI-native`: prompt-to-code scenes start from maintained systems instead of empty renderer setup.
- `TypeScript-first`: the output is normal source code developers can inspect, edit, and ship.
- `Typed assets`: GLB/glTF files become generated imports, so agents do not invent string asset IDs.
- `Browser-ready`: Vite templates, route health, screenshot tests, and static deploy checks are part of the workflow.
- `Production-oriented`: product viewers, material labs, particles, physics scenes, data worlds, cities, and interactive examples are covered by documented scene kits.
- `Agent-safe`: docs tell coding agents which public APIs to use and which claims not to make.

## Packages

- `@aura3d/engine`: public TypeScript browser 3D SDK for AI-generated scenes, runtime helpers, and typed GLB/glTF assets.
- `@aura3d/cli`: typed GLB/glTF asset workflow, diagnostics, and deploy checks.
- `@aura3d/react`: optional thin React adapter.
- `create-aura3d`: Vite templates for product viewers, cinematic scenes, and mini-games.

## Production browser 3D workflow

Aura3D is built for the AI-assisted browser 3D era. It gives teams a source-code-first TypeScript workflow where agents generate maintainable scenes, game prototypes, product viewers, and deployable interactive websites.

Aura3D combines scene kits, GLB/glTF asset typing, product viewers, browser-game runtime helpers, a believable-motion animation engine, physics scenes, particles, material labs, data worlds, route diagnostics, screenshot workflows, and static deployment into one agent-ready SDK. Route-level game proofs are not public-quality game examples until visual review and game-geometry evidence pass.

## Documentation

- **Build a browser game (end-to-end guide):** [docs/guides/build-a-browser-game.md](docs/guides/build-a-browser-game.md) — ties together scaffolding, typed assets, runtime nodes, input, movement, combat, the full 1.3 animation stack, camera/effects/HUD/audio/a11y, evidence, and deploy in one walkthrough.
- Agent manual: [docs/agents/README.md](docs/agents/README.md)
- Agent quickstart: [docs/agents/agent-quickstart.md](docs/agents/agent-quickstart.md)
- Prompt-to-3D workflow: [docs/agents/prompt-to-3d-workflow.md](docs/agents/prompt-to-3d-workflow.md)
- Asset workflow: [docs/agents/asset-workflow.md](docs/agents/asset-workflow.md)
- Game runtime API reference: [docs/api/game-runtime.md](docs/api/game-runtime.md)
- Believable-motion (1.3) animation runtimes: [docs/animation/believable-motion.md](docs/animation/believable-motion.md)
- Prompt recipes: [docs/agents/benchmark-recipes.md](docs/agents/benchmark-recipes.md)
- Public API: [docs/api/public-api.md](docs/api/public-api.md)

## Verification

```bash
pnpm run check:release
```

Use release checks to confirm package integrity, generated assets, examples, and static deployment output before shipping.

Aura3D 2.0 route-specific readiness commands:

```bash
npx @aura3d/cli@latest assets validate-game
npx @aura3d/cli@latest assets validate-animation
npx @aura3d/cli@latest check-deploy --dist dist
pnpm game-runtime:docs
pnpm game-runtime:template
pnpm game-runtime:package
pnpm game-runtime:release
pnpm prompt-animation:docs
pnpm prompt-animation:template
pnpm prompt-animation:package
pnpm prompt-animation:release
```

Do not mark a game, prompt-animation, or AuraVoice route launch-ready from source evidence alone. Asset readiness, package smoke, browser route health, deterministic screenshots, visual review, accessibility proof, and deployment checks must also pass.

Aura3D 2.0 game-engine/showcase readiness is stricter:

```bash
pnpm aura3d110:readiness
```

Retained 3.0.0 release context — The package train carries the
playable-route, catalog, and documentation corrections described in its release notes. The
historical exact-installed 2.0.0 comparison against
`three@0.185.1` passes its bounded local checks across 15 workloads. That
comparison is not a universal parity claim: clean-machine,
repeated-performance, independent-human, publication, and production-origin
gates remain open. Blockfall Reactor, Turbo Drift Circuit, and
Skyline Runner remain `prototype-blocked`; their typed assets, mounted gameplay,
and bounded route evidence are technical proof, not promotion. Aura Clash is
tracked separately as a development showcase. The former `three@0.165.0`
comparison is historical only; no broad parity or replacement claim is made.

## Contributing

Star the repo if you want AI-native browser 3D tooling for TypeScript, WebGL, WebGPU, GLB/glTF assets, product viewers, prompt-to-3D scenes, and deployable 3D websites. Open issues with the prompt, package version, asset source or license, commands run, route-health output, screenshots, and deploy context.
