# Aura3D

[![npm version](https://img.shields.io/npm/v/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![npm downloads](https://img.shields.io/npm/dm/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-browser%203D-3178c6.svg)](https://www.typescriptlang.org/)

Build browser 3D apps from prompts, assets, and TypeScript.

Aura3D is the developer SDK for AI-authored 3D software: product viewers,
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
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.sneaker)).add(lights.studio())
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

- `@aura3d/engine`: public TypeScript runtime for browser 3D scenes and apps.
- `create-aura3d`: one-command Vite scaffolds for Aura3D projects.
- `@aura3d/cli`: typed GLB/glTF asset workflow, catalog search, validation,
  diagnostics, and deploy checks.
- Package modules for animation, rendering, scene, physics, materials, React,
  product-studio, workflows, controls, environments, and Three.js migration.

## Proof-Oriented By Design

Aura3D is built for public, inspectable software. Generated projects keep their
TypeScript source, asset manifest, tests, screenshots, and deploy checks in the
repo. The claim-boundary and release evidence docs live under `docs/` for teams
that need strict publication review, but the developer path starts here: create
an app, add typed assets, run it, test it, deploy it.

## Current Release

`@aura3d/engine@1.4.3` is the current package release across the 26 public
Aura3D packages. It is a developer-positioning and npm-discoverability patch:
the root README, `create-aura3d`, and `@aura3d/cli` now lead with the install
path, typed asset workflow, templates, and developer outcomes that make Aura3D
worth trying.

The runtime baseline remains the 1.4.x package family: public
`createAuraApp` scene composition, typed GLB/glTF assets, prompt-oriented
templates, asset validation, route-health checks, screenshots, deploy checks,
game prototype helpers, animation workflow packages, and the package smoke
tests used for release.

Registry target: npm `latest` resolves to `1.4.3` across all 26 public packages
(`@aura3d/engine`, `@aura3d/asset-index`, `@aura3d/cli`, `create-aura3d`, and
the rest of the package family). Release evidence and detailed claim boundaries
live under `docs/project/` and `docs/agents/` so the README can stay focused on
why developers should install the SDK.

## Aura3D 1.1.0 asset catalog

Aura3D 1.1.0 includes the catalog-first asset workflow for AI coding agents. When a prompt names a real object, agents should search the hosted Aura3D catalog before writing scene code:

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
## Aura3D 1.1.0 runtime launch track

Aura3D 1.1.0 introduced the runtime and animation evidence foundation; 1.4.3 is
the current package release that carries it forward:

- `game runtime`: mutable runtime nodes, app-owned frame loops, input, kinematic bodies, hitboxes, combat events, camera direction, effects, and evidence for browser-native game prototypes.
- `fighting-game template`: `npx create-aura3d@latest my-fighter --template fighting-game` scaffolds a public-API playable starter using typed assets, `app.input(...)`, `app.onFrame(...)`, `game.kinematicBody(...)`, `game.combatWorld(...)`, and `app.evidence(...)`.
- `prompt animation`: `npx create-aura3d@latest my-episode --template prompt-animation-channel` scaffolds structured episode plans, storyboards, shot timelines, captions, visemes, render queues, and evidence for prompt-authored animation/video workflows. The shorter `animation-channel` template name remains supported.
- `AuraVoice bridge`: AuraVoice owns script/audio/caption/viseme timing; Aura3D owns typed scene generation, character performance, camera choreography, rendering, screenshots, and visual evidence.

Aura Clash requires Aura3D 1.1.0 runtime and animation evidence before it should be marketed as a polished public game showcase. Until the runtime, screenshot, route, GLB, package-smoke, and visual approval gates pass, Aura Clash remains a development showcase proving the direction of the public API.

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
- WebGL/WebGPU-ready examples with maintained scene kits and diagnostics.
- Vite 3D starter apps with route health, screenshot tests, and deploy checks.
- Static-deployed 3D websites where proof, screenshots, and reliability matter.

## Aura Clash development showcase

Aura Clash Arena is the active Aura3D game-runtime proof target: a 1v1 browser arena-fighter development showcase built with `@aura3d/engine` public APIs.

The showcase proves Aura3D's runtime, animation, and combat systems end to end on a live, deterministic route — built with starter-grade fighter assets so it stays focused on the engine rather than the art.

The showcase currently targets:

- typed or validated stylized fighter assets;
- typed asset members from `src/aura-assets.ts`;
- `model(assets.x)` runtime usage;
- arena composition, lighting, effects, camera framing, and material polish;
- arcade movement, hitboxes, guard state, meter, AI pressure, and results;
- evidence routes, accessibility settings, poster capture, Playwright contracts, sitemap and robots integration, and marketing homepage placement.

Open the source route at `apps/aura-clash-showcase/`. Treat the current route as a development showcase until the 1.1.0 gameplay, visual, asset, audio, performance, deployment, and docs-claim gates pass.

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

## Aura3D 1.1.0 game runtime example

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

## Aura3D 1.1.0 prompt-animation and AuraVoice example

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
- `@aura3d/three-compat`: optional migration compatibility package, installed separately when a Three.js migration workflow needs it.

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

Aura3D 1.1.0 route-specific readiness commands:

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

Aura3D 1.1.0 game-engine/showcase readiness is stricter:

```bash
pnpm aura3d110:readiness
```

Expected current state — The scoped package gates pass for the published 1.4.3
baseline, and the release-candidate showcase gate passes for six public examples
while retaining two internal diagnostics and two prototype-blocked game routes
outside the public path.

## Contributing

Star the repo if you want AI-native browser 3D tooling for TypeScript, WebGL, WebGPU, GLB/glTF assets, product viewers, prompt-to-3D scenes, and deployable 3D websites. Open issues with the prompt, package version, asset source or license, commands run, route-health output, screenshots, and deploy context.
