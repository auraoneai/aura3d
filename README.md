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

Aura3D 4.0.0 is the consolidated browser 3D engine release for the agent era — prompt it, prove it, ship it. It unifies the public runtime surface on `@aura3d/engine@4.0.0`, upgrades all 19 browser 3D games and showcases with custom Meshy PBR GLB assets and interactive gameplay loops, ships the full post-processing, atmospheric, particle, weather, ribbon, and game-feel effects suite (`effects.*`), and exports the resident WebGPU compute particle pipeline alongside the WebGL2 runtime. Claims remain scoped to the public API and evidence described in the release documentation.

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

## 24 Active Public Packages (`4.0.0`)

All 24 active Aura3D packages are published at `4.0.0` on npm (with all `< 4.0.0` versions and the 5 retired pre-4.0 compatibility packages `@aura3d/lean`, `@aura3d/three-compat`, `@aura3d/materials`, `@aura3d/environments`, and `@aura3d/editor` deprecated in full on npm in favor of `@aura3d/engine@4.0.0`):

| Package | Version | Role |
| --- | --- | --- |
| `@aura3d/engine` | `4.0.0` | Unified public TypeScript runtime: `createAuraApp`, `scene`, `model(assets.x)`, `camera`, `lights`, `effects.*`, `looks.*`, `atmosphere`, `environments`, `shadows`, `game.*`, `games.*`, `sceneKits.*`, `prefabs.*`, `primitives.*`, `animation`, `createPhysicsRuntime`, `ResidentGPUParticleRenderer`. |
| `create-aura3d` | `4.0.0` | One-command Vite project scaffolder (`npx create-aura3d@4.0.0 <dir> --template <name>`). |
| `@aura3d/cli` | `4.0.0` | Typed GLB/glTF asset workflow (`assets add`, `assets search`, `assets resolve`, `assets import-meshy`, `assets validate`, `assets typegen`), `look capture`, and `check-deploy`. |
| `@aura3d/core` | `4.0.0` | Core math, transforms, colors, events, and lifecycle primitives. |
| `@aura3d/scene` | `4.0.0` | Scene graph, spatial hierarchy, cameras, lights, and bounds. |
| `@aura3d/rendering` | `4.0.0` | WebGL2 + WebGPU rendering backend, PBR materials, IBL, cascaded shadows, and multi-pass post-processing. |
| `@aura3d/animation` | `4.0.0` | Skeletal clip playback, cross-fades, procedural locomotion, and AuraVoice viseme/caption synchronization. |
| `@aura3d/physics` | `4.0.0` | Rigid-body, collider, raycast, and Rapier-backed deterministic simulation. |
| `@aura3d/navigation` | `4.0.0` | NavMesh pathfinding, crowd steering, and Recast navigation helpers. |
| `@aura3d/character` | `4.0.0` | Kinematic character controller, grounded step/slope response, and camera rigs. |
| `@aura3d/ecs` | `4.0.0` | Entity-component-system queries, archetypes, and deterministic system scheduling. |
| `@aura3d/scripting` | `4.0.0` | Runtime behavior graphs and node scripting catalog. |
| `@aura3d/controls` | `4.0.0` | Orbit, trackball, fly, pointer-lock, and touch camera controls. |
| `@aura3d/loaders` | `4.0.0` | GLB/glTF 2.0, KHR material variants, Draco/Meshopt, OBJ, and HDR environment loaders. |
| `@aura3d/postprocessing` | `4.0.0` | Modular HDR bloom, SSAO, SSR, DOF, motion blur, outline, and tonemapping pass graph. |
| `@aura3d/particles` | `4.0.0` | CPU & WebGPU compute particle emitters, weather, trails, and sprite-sheet flipbooks. |
| `@aura3d/terrain` | `4.0.0` | Heightfield terrain generation, LOD tiling, and material splatting. |
| `@aura3d/audio` | `4.0.0` | Spatial 3D WebAudio synthesis, cues, and procedural game soundscapes. |
| `@aura3d/xr` | `4.0.0` | WebXR session management, controller rays, and hand/pose tracking. |
| `@aura3d/devtools` | `4.0.0` | Frame-timing diagnostics, route-health telemetry, and debug overlays. |
| `@aura3d/testing` | `4.0.0` | Deterministic frame stepping, input replay, and visual/evidence assertions. |
| `@aura3d/react` | `4.0.0` | Declarative React host and hooks for `@aura3d/engine` apps. |
| `@aura3d/product-studio` | `4.0.0` | Studio turntables, variant switchers, dimension callouts, and hero lighting rigs. |
| `@aura3d/workflows` | `4.0.0` | Prompt-to-scene, prompt-to-game, and prompt-to-animation compilation pipelines. |

Install the current 4.0.0 release:

```bash
npm install @aura3d/engine@4.0.0
# or scaffold a new app
npx create-aura3d@4.0.0 my-product --template product-viewer
```

## Typed Asset Catalog & Meshy CLI (`4.0.0`)

Aura3D 4.0.0 includes a catalog-first and Meshy-assisted asset workflow for AI coding agents. When a prompt names a real 3D object, vehicle, character, or architectural prop, search the catalog or import a validated Meshy GLB before writing scene code:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

The resolver pulls verified redistributable candidates into the typed asset pipeline (`aura.assets.json` + `src/aura-assets.ts`), and scene code uses `model(assets.helmet)`.

For game characters and genre kits:

```bash
npx @aura3d/cli@latest assets search "animated humanoid fighting character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid fighting character" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter --no-placeholders --require-license
```

When the catalog has no matching model, generate or refine a 3D PBR GLB with the Meshy workflow and admit it through `assets import-meshy` (see [`docs/meshy-cli.md`](docs/meshy-cli.md)).

## 30-Second Product Viewer

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

The public API uses generated references such as `assets.robot`. Never pass raw string IDs or unvalidated paths to `model(...)`.

## Browser Game Runtime & 19 Playable Showcases (`4.0.0`)

Aura3D 4.0.0 ships a complete browser game runtime (`game.*`, `games.*`, `looks.*`, `effects.*`, `app.feel`) powering 19 playable 3D games and showcases with custom Meshy PBR 3D characters, vehicles, and architectural props:

- **Fighting & Arena Combat**: `Aura Clash Arena` (`apps/aura-clash-showcase`), `Mech Hangar` (`apps/showcase-mech-hangar`), `Neon Swarm` (`apps/showcase-neon-swarm`), `Neon Corridor Strike` (`examples/neon-corridor-strike`)
- **Racing, Flight & Vehicular Action**: `Turbo Drift Circuit` (`apps/showcase-turbo-drift-circuit`), `Courier Rush` (`apps/showcase-courier-rush`), `Patrol Wing` (`apps/showcase-patrol-wing`), `Pulse Tunnel` (`apps/showcase-pulse-tunnel`), `Aurora Lander` (`apps/showcase-aurora-lander`), `Deep Recovery` (`apps/showcase-deep-recovery`)
- **Sports, Pinball & Precision Physics**: `Rooftop Buckets` (`apps/showcase-rooftop-buckets`), `Bank Shot Billiards` (`apps/showcase-bank-shot`), `Siege Golf` (`apps/showcase-siege-golf`), `Vault Breakers Pinball` (`apps/showcase-vault-breakers`)
- **Platformer, Stealth, Puzzle & Strategy**: `Skyline Runner` (`apps/showcase-skyline-runner`), `Gallery Shift` (`apps/showcase-gallery-shift`), `Blockfall Reactor` (`apps/showcase-blockfall-reactor`), `Gravity Post` (`apps/showcase-gravity-post`), `Orbital Defense` (`apps/showcase-orbital-defense`)

Add typed assets before writing game code:

```bash
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
npx @aura3d/cli@latest assets add ./assets/opponent.glb --name opponent
```

Then use the public `game` and `games` facades:

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

## Animation Studio & AuraVoice Bridge (`4.0.0`)

The **Animation Studio** turns a natural-language prompt into a deterministic, rendered animated short. Scene structure lives in a validated **EpisodeDocument** (cast, set, dialogue, blocking, camera) driven by your coding agent:

```bash
npx create-aura3d@latest my-studio --template animation-studio
cd my-studio && pnpm install
pnpm scene new --prompt "two office workers arguing about a deadline" --full
AURA_QUALITY=final pnpm episode:render-3d
```

Aura3D emits the timed dialogue, caption, and viseme tracks while **AuraVoice** owns TTS narration and audio muxing:

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

## Prompt-to-3D Scene Kits

Use scene kits when an AI prompt asks for generated 3D systems alongside or instead of a supplied model:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.physicsPlayground();
createAuraApp("#app", kit.toAppOptions());
console.log(kit.diagnostics, kit.evidence);
```

Maintained scene-kit families include physics playgrounds, particle fountains, solar systems, neon tunnels, 3D data visualizations, mini golf, material labs, city blocks, humanoid walks, and typed product viewers.

## Documentation

- **4.0.0 Migration & Consolidation Guide:** [`docs/MIGRATION-4.0.md`](docs/MIGRATION-4.0.md)
- **4.0.0 Release Notes:** [`docs/project/aura3d-400-release-notes.md`](docs/project/aura3d-400-release-notes.md)
- **Build a Browser Game (End-to-End Guide):** [`docs/guides/build-a-browser-game.md`](docs/guides/build-a-browser-game.md)
- **Public API Reference:** [`docs/api/public-api.md`](docs/api/public-api.md)
- **Game Runtime API Reference:** [`docs/api/game-runtime.md`](docs/api/game-runtime.md)
- **Believable-Motion Animation Runtime:** [`docs/animation/believable-motion.md`](docs/animation/believable-motion.md)
- **Animation Studio Quickstart:** [`docs/animation-studio/quickstart.md`](docs/animation-studio/quickstart.md)
- **AuraVoice Bridge Reference:** [`docs/api/auravoice-bridge.md`](docs/api/auravoice-bridge.md)
- **Meshy CLI Asset Guide:** [`docs/meshy-cli.md`](docs/meshy-cli.md)
- **Agent Manual & Quickstart:** [`docs/agents/README.md`](docs/agents/README.md), [`docs/agents/agent-quickstart.md`](docs/agents/agent-quickstart.md)

## Verification

```bash
pnpm run check:release
npx @aura3d/cli@latest assets validate-game
npx @aura3d/cli@latest assets validate-animation
npx @aura3d/cli@latest check-deploy --dist dist
```

## Contributing

Star the repo if you build AI-native browser 3D software in TypeScript across WebGL2 and WebGPU. Open issues with the prompt, package version (`4.0.0`), asset source or license, commands run, route-health output, screenshots, and deploy context.

