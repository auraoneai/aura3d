# Aura3D Next — PRD + Autonomous Execution Prompt

## Product Mission

Make Aura3D the default AI-native TypeScript SDK for browser-first 3D applications.

Aura3D should not try to become Unity, Unreal, or a full Babylon.js replacement. That is the wrong battle.

The winning lane is this:

> Aura3D should let an AI coding agent or TypeScript developer go from prompt → typed assets → working 3D route → screenshots → diagnostics → deploy proof faster and more reliably than raw Three.js or Babylon.js.

Aura3D must exceed Three.js and Babylon.js specifically in AI-agent workflow, app scaffolding, typed asset safety, route evidence, repeatable templates, and deployment confidence.

It does not need to exceed them yet in raw renderer depth, ecosystem size, WebXR breadth, physics maturity, shader tooling, or engine-level feature coverage.

## Current Honest Position

Aura3D 1.0.10 is a credible foundation, but not yet a mature web engine.

The correct positioning is:

> Aura3D is an AI-native TypeScript browser-3D SDK that turns prompts and typed assets into deployable, evidence-backed 3D web apps.

Aura3D sits:

- Above Three.js as an application/productivity layer.
- Adjacent to Babylon.js as an agent-native workflow layer, not yet an engine-depth peer.
- Far below Unity/Unreal as a full production game/editor ecosystem.
- Far above raw rendering libraries in AI-agent readiness, typed assets, diagnostics, screenshots, and deployment proof.

## Strategic Goal For The Next Iteration

Build Aura3D Next so that a competent AI coding agent can create, validate, screenshot, and deploy a browser-native 3D app with dramatically less custom glue than Three.js or Babylon.js.

The target benchmark is not:

> “Can Aura3D beat Unreal?”

The target benchmark is:

> “Can an AI agent ship a reliable browser 3D app with Aura3D faster, safer, and with better evidence than it could with raw Three.js or Babylon.js?”

The answer after this iteration should be clearly yes.

## Primary Product Thesis

Three.js gives rendering primitives.

Babylon.js gives a mature web rendering engine.

Aura3D must give an AI-native product workflow:

- typed assets;
- verified GLB/glTF imports;
- prompt-safe templates;
- route scaffolding;
- scene kits;
- game-route helpers;
- cartoon/prompt scene helpers;
- product viewer helpers;
- diagnostics;
- screenshots;
- deploy checks;
- route health;
- agent-readable docs;
- evidence artifacts;
- strict claim boundaries.

Aura3D wins when the user wants a working browser 3D app, not when they want to hand-author a full engine pipeline.

## Must-Win User

The primary user is not a traditional senior graphics engineer.

The primary user is:

1. an AI coding agent working inside Codex, Claude Code, Cursor, or similar;
2. a TypeScript/web developer who wants browser-native 3D without reinventing a stack;
3. a startup/team building product viewers, 3D landing pages, mini-games, prompt scenes, configurators, or evidence-backed demos;
4. a developer who values source-first workflows over heavyweight visual-editor pipelines.

## Product Category

Aura3D should define and own this category:

> AI-native browser 3D application SDK.

Not:

- game engine;
- Unity replacement;
- Unreal replacement;
- Babylon.js clone;
- Three.js replacement for everyone.

## Competitive Positioning

### Versus Three.js

Three.js is lower-level and more mature.

Aura3D must beat Three.js on:

- speed from prompt to working app;
- typed asset workflow;
- CLI asset registration;
- provenance and hashing;
- scaffolded routes;
- reusable templates;
- diagnostics;
- screenshot evidence;
- deploy proof;
- agent guardrails;
- repeatability.

Aura3D should not try to beat Three.js on raw control or ecosystem size.

The product promise:

> Use Three.js when you want maximum low-level rendering control. Use Aura3D when you want an AI agent or TypeScript developer to ship a typed, tested, screenshot-backed, deployable 3D web app without inventing the stack every time.

### Versus Babylon.js

Babylon.js is more mature as an engine.

Aura3D must beat Babylon.js on:

- AI-agent friendliness;
- source-first TypeScript app generation;
- typed assets and provenance;
- route evidence;
- deploy checks;
- prompt-to-app workflows;
- smaller opinionated templates;
- agent-readable docs;
- release gates that prevent overclaims.

Aura3D should not claim Babylon parity in engine depth yet.

The product promise:

> Babylon is the deeper web engine. Aura3D is the faster AI-native browser-3D application workflow.

### Versus Unity / Unreal

Unity and Unreal are heavyweight production ecosystems.

Aura3D should win only where lightweight browser-native source workflows matter:

- no desktop editor requirement;
- npm install;
- Vite/static deploy;
- TypeScript-native;
- AI-agent editable;
- screenshot-backed;
- route-testable;
- fast demos, viewers, mini-games, and prompt scenes.

The product promise:

> Unity and Unreal are for full production pipelines. Aura3D is for browser-native 3D software that an AI coding agent can generate, inspect, test, screenshot, and deploy quickly.

## Product Pillars

Aura3D Next must be built around seven product pillars.

### 1. Prompt-To-App Scaffolding

An AI agent should be able to create a useful 3D app from a plain-English instruction.

Required capabilities:

- createAuraApp(...) remains the primary entrypoint.
- Add or improve app templates for:
  - product viewer;
  - configurable product viewer;
  - 3D landing page;
  - GLB showcase;
  - fighting-game route;
  - character controller route;
  - prompt-cartoon scene;
  - interactive story scene;
  - basic showroom/gallery;
  - object inspection route.
- Every template must run with public APIs only.
- Every template must include:
  - route;
  - typed asset usage;
  - screenshot command;
  - route health command;
  - deploy validation command;
  - README snippet;
  - agent usage instructions.

Acceptance standard:

> An agent should be able to generate a new app from a template, add one asset, run validation, capture screenshots, and produce deploy evidence without hand-debugging hidden internals.

### 2. Typed Asset System As The Core Moat

Aura3D’s asset system should become the strongest reason to use it over raw Three.js.

Required capabilities:

- typed asset registry;
- GLB/glTF registration;
- asset hashing;
- provenance metadata;
- generated TypeScript imports;
- asset validation;
- missing asset detection;
- invalid path detection;
- animation clip discovery;
- texture/material metadata extraction;
- asset catalog search;
- asset resolve command;
- agent-safe asset usage examples.

Improve the asset API so agents naturally write:

ts model(assets.character.hero) model(assets.products.sneaker) model(assets.environments.showroom) 

instead of raw URLs or hallucinated paths.

Acceptance standard:

> Aura3D must make it harder for an AI agent to hallucinate a model path than it is in Three.js or Babylon.js.

### 3. Evidence-Backed 3D Routes

Aura3D should make proof a first-class feature.

Required capabilities:

- route health checks;
- scene boot checks;
- asset load checks;
- animation checks;
- input/control checks;
- screenshot capture;
- deployed route parity checks;
- proof JSON artifacts;
- visual proof artifacts;
- marketing image artifact generation;
- CI-friendly commands.

Every serious example should produce:

- local route evidence;
- screenshot evidence;
- asset evidence;
- deployment evidence;
- README proof instructions.

Acceptance standard:

> Every demo must be provable, not just runnable.

### 4. Agent Guardrails And Anti-Hallucination Docs

Aura3D must be easier for AI coding agents to use correctly than Three.js or Babylon.js.

Required capabilities:

- strengthen llms.txt;
- add copy-paste agent recipes;
- document what Aura3D is and is not;
- document public APIs only;
- document forbidden internal imports;
- document asset registration flow;
- document screenshot/evidence flow;
- document deployment checks;
- add “common agent mistakes” section;
- add “do not hallucinate assets” section;
- add “how to prove route works” section;
- add “when to use Aura3D vs Three.js/Babylon/Unity/Unreal” section.

Acceptance standard:

> A coding agent reading the docs should know exactly how to scaffold, add assets, validate, screenshot, and deploy without inventing nonexistent APIs.

### 5. Repeatable Scene Kits

Aura3D should not just provide templates. It should provide reusable scene kits.

Required scene kits:

- product viewer kit;
- showroom kit;
- character/controller kit;
- fighting route kit;
- prompt-cartoon kit;
- landing-page hero kit;
- GLB inspection kit;
- HUD kit;
- input controls kit;
- basic combat kit;
- audio cue kit;
- camera choreography kit.

Each kit should have:

- public API;
- minimal example;
- full route example;
- screenshot test;
- asset validation path;
- docs;
- agent instructions.

Acceptance standard:

> The next Aura Clash-style demo should not require days of one-off fixes. It should be composed from hardened public kits.

### 6. Browser-First Deployment Path

Aura3D should be optimized for browser-native apps.

Required capabilities:

- Vite-first workflow;
- static deploy compatibility;
- route-level deploy checks;
- asset path validation in production builds;
- screenshot capture from built app;
- external package verification;
- npx verification;
- deployed route parity;
- CI recipe;
- clear docs for Vercel/Netlify/static hosts.

Acceptance standard:

> A user should be able to create, build, preview, screenshot, and deploy a 3D route with confidence that local and production assets match.

### 7. Claims Discipline

Aura3D must be ambitious but honest.

Do not claim:

- “better than Unity”;
- “better than Unreal”;
- “Babylon.js replacement”;
- “full game engine”;
- “AAA engine”;
- “complete WebXR engine”;
- “full physics engine”;
- “visual editor platform”;
- “production console/mobile engine.”

Do claim:

- “AI-native TypeScript browser-3D SDK”;
- “typed assets for browser 3D”;
- “prompt-to-deploy 3D web apps”;
- “evidence-backed 3D routes”;
- “faster path from prompt to browser-native 3D app”;
- “source-first alternative to heavyweight editor pipelines for web 3D”;
- “application workflow above raw rendering libraries.”

Acceptance standard:

> Marketing, docs, README, package descriptions, and examples must all describe the real product category without overclaiming.

## Required Deliverables

### Deliverable 1: Public API Hardening

Audit the public API and ensure every demo uses only supported public APIs.

Tasks:

- identify internal imports used by examples;
- replace them with public exports;
- add missing public exports where justified;
- document each public API;
- add tests for key public APIs;
- ensure package consumers can use the same APIs as internal demos.

### Deliverable 2: Template Upgrade

Upgrade templates into serious agent-ready starters.

Minimum required templates:

1. product viewer;
2. configurable product viewer;
3. GLB showcase;
4. 3D landing page hero;
5. fighting-game starter;
6. character controller starter;
7. prompt-cartoon scene;
8. showroom/gallery;
9. interactive story route.

Each template must include:

- typed asset path;
- validation command;
- screenshot command;
- deploy check command;
- README;
- route proof schema;
- agent instruction snippet.

### Deliverable 3: Asset CLI Upgrade

Improve CLI workflow for assets.

Required commands or equivalent:

bash aura3d assets add aura3d assets scan aura3d assets validate aura3d assets list aura3d assets resolve aura3d assets types aura3d route check aura3d route screenshot aura3d deploy check aura3d proof write 

Commands should be agent-safe, deterministic, and CI-friendly.

### Deliverable 4: Proof System

Add or improve route proof artifacts.

Each proof should capture:

- route URL;
- build hash;
- package version;
- asset list;
- missing asset count;
- loaded model count;
- animation clip map;
- screenshot path;
- route health result;
- deployed parity result;
- timestamp;
- command used;
- pass/fail state.

### Deliverable 5: Docs Rewrite

Rewrite docs around the new category.

Docs must include:

- README positioning;
- current state;
- product boundaries;
- competitor positioning;
- quickstart;
- templates;
- typed assets;
- route evidence;
- deployment;
- agent guide;
- troubleshooting;
- release gates;
- claims policy.

### Deliverable 6: Release Gates

Add gates that block regressions and overclaims.

Required gates:

- package builds;
- examples build;
- templates build;
- asset validation passes;
- screenshot capture passes;
- deployed route check passes where applicable;
- docs do not overclaim Unity/Unreal/Babylon parity;
- all demos use public APIs;
- external npx package verification passes;
- generated app can run from clean install.

### Deliverable 7: Competitive Demo

Create a direct comparison demo showing why Aura3D is faster for agents than raw Three.js/Babylon.

The demo should include:

- one product viewer built in Aura3D;
- one GLB route with typed assets;
- one prompt-cartoon scene;
- one mini-game route;
- screenshots;
- proof JSON;
- deploy check;
- README explaining how many steps Aura3D removes.

Do not attack Three.js or Babylon. Frame honestly:

> Three.js and Babylon are powerful. Aura3D removes repeated app workflow glue for AI-generated browser 3D apps.

## Non-Goals

Do not spend this iteration chasing:

- full Unity-style editor;
- Unreal-class rendering;
- complete visual scripting;
- AAA game workflows;
- console deployment;
- native mobile deployment;
- full multiplayer stack;
- full terrain/world authoring;
- complete WebXR parity;
- industrial physics parity;
- marketplace ecosystem.

These may be future directions, but they are not the winning path for Aura3D Next.

## Success Metrics

Aura3D Next succeeds if:

1. An AI coding agent can scaffold a working 3D route from a prompt.
2. The agent can add a GLB/glTF asset without hallucinating paths.
3. The app uses typed assets.
4. The route can be health-checked.
5. Screenshots can be generated automatically.
6. Deploy parity can be verified.
7. The same public APIs used in demos are available to users.
8. Docs tell agents exactly what to do.
9. Marketing claims are sharp but honest.
10. A new app takes hours, not days, to get to proof-backed quality.

## North Star Demo

Build one flagship demo that proves the category.

The demo should show:

> prompt → template → typed assets → working browser 3D route → controls/interactions → screenshot → proof JSON → deploy check → public docs.

This demo should make the product instantly understandable.

The viewer should think:

> “I could use this with Codex or Claude Code to generate a browser 3D app faster than starting from raw Three.js.”

That is the goal.

## Final Instruction To The Agent

Work autonomously through the repository.

First, inspect the current Aura3D package, examples, docs, templates, CLI, release gates, asset system, and proof system.

Then implement the smallest high-leverage changes that move Aura3D toward the product mission:

> the AI-native TypeScript browser-3D SDK for deployable, evidence-backed 3D web apps.

Prioritize reusable public APIs, typed assets, templates, diagnostics, screenshots, deploy proof, agent docs, and release gates.

Do not overclaim engine maturity.

Do not chase Unity/Unreal parity.

Do not build private demo-only hacks.

Every improvement should make the next generated browser 3D app faster, safer, and more repeatable than building directly on raw Three.js or Babylon.js.

When complete, produce:

1. a concise changelog;
2. files changed;
3. commands run;
4. tests/gates passed;
5. remaining gaps;
6. honest comparison versus Three.js, Babylon.js, Unity, and Unreal;
7. recommended next iteration.


PRD: Aura3D Cartoon Studio

Feature Name

Aura3D Cartoon Studio

One-Line Product Definition

Aura3D Cartoon Studio is a browser-native, TypeScript-first cartoon production pipeline that turns a show bible, typed 3D assets, dialogue, shot timelines, voice timing, captions, visemes, and render evidence into repeatable animated cartoon episodes.

Product Thesis

The most commercially interesting direction for Aura3D is not “AI magically creates Pixar.”

The winning product is:

A repeatable AI-agent cartoon production pipeline for YouTube-style animated episodes.

Aura3D should let a creator define a show once — characters, sets, tone, structure, voices, safety rules, captions, thumbnail style — and then repeatedly generate structured cartoon episodes with browser playback, screenshots, render artifacts, captions, and publish-readiness evidence.

The product should be built around consistency, not randomness.

The value is not one-off AI video generation.

The value is:

Define a cartoon show bible once, register typed characters and sets, then generate consistent browser-rendered episodes with voice timing, captions, shot timelines, thumbnails, and publish evidence.

Current Foundation

Aura3D already has the early source-level foundation:

* prompt-cartoon-channel template;
* cartoon-channel template;
* cartoon-studio template;
* episode-builder template;
* compilePromptEpisodePlan(...);
* storyboard contracts;
* shot timeline contracts;
* dialogue track contracts;
* caption track contracts;
* viseme track contracts;
* AuraVoice bridge package contracts;
* audio stem manifests;
* render queue metadata;
* render output package metadata;
* prompt animation evidence;
* publish-readiness evaluation;
* typed asset registration;
* cartoon asset search profiles;
* route/test scaffolds.

This is not yet a finished autonomous YouTube studio.

It is a serious production scaffold.

The next iteration should harden this into a working vertical slice:

Generate one upload-ready 60-second cartoon episode package.

Strategic Goal

Build the first credible version of Aura3D Cartoon Studio by making one complete, repeatable cartoon episode pipeline work end-to-end.

The goal is not to support every cartoon style, every animation workflow, or every export target.

The goal is to prove that Aura3D can repeatedly produce short, structured cartoon episodes from reusable characters and sets.

Target User

Primary users:

1. AI coding agents building cartoon episodes from prompts.
2. Creators launching YouTube-style animated channels.
3. Small studios that need fast, repeatable animated shorts.
4. Developers building branded character shows, educational cartoons, kids content, product explainers, or social video series.
5. AuraOne/Aura3D internal teams proving a commercial AI-native media pipeline.

Secondary users:

1. Indie animators.
2. Game developers making narrative shorts.
3. EdTech companies.
4. Toy/brand/IP owners.
5. Agencies producing short-form character content.

Product Category

Aura3D Cartoon Studio should define this product category:

AI-native browser cartoon production pipeline.

Not:

* generic AI video generator;
* Pixar replacement;
* full animation studio;
* Blender replacement;
* Unreal/Unity cinematic pipeline;
* one-click magic episode generator.

Product Promise

A creator should be able to run:

npx create-aura3d@latest moon-garden --template cartoon-studio
cd moon-garden
npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma
npx @aura3d/cli@latest assets add ./assets/moon-garden.glb --name moonGarden
npm run episode:new -- "Miko and Luma clean the glowing moon weeds"
npm run episode:voice
npm run episode:preview
npm run episode:render
npm run episode:review
npm run episode:package

And receive:

dist/episodes/moon-garden-001/
  episode.mp4 or episode.webm
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  prompt-animation-evidence.json
  route-proof.json
  asset-provenance.json

Core Workflow

The Cartoon Studio pipeline should support this flow:

Show bible
→ typed character/set assets
→ prompt/story idea
→ episode plan
→ storyboard
→ shot timeline
→ dialogue/captions
→ voice timing
→ visemes/lip sync
→ browser playback route
→ screenshots/evidence
→ render queue
→ video export
→ thumbnail/captions/metadata package
→ human review
→ publish-ready package

MVP Scope

The MVP should be a 60-second repeatable cartoon episode factory.

Required MVP Constraints

The first production vertical slice should intentionally stay narrow:

* 2 recurring characters;
* 1 recurring set;
* 1 episode format;
* 60-second runtime;
* 720p output minimum;
* 30 FPS target;
* 5 camera shot types;
* 5 character gestures;
* captions;
* primitive mouth-card fallback;
* optional GLB blendshape viseme path;
* audio stem manifest;
* browser playback route;
* render queue;
* screenshot evidence;
* thumbnail capture;
* MP4 or WebM export;
* packaged episode artifact.

MVP Acceptance Bar

The following command must work:

npm run episode:render

It must produce:

episode.webm or episode.mp4
thumbnail.png
captions.vtt
prompt-animation-evidence.json
asset-provenance.json
route-proof.json

The evidence must prove:

* no missing assets;
* route health passes;
* captions exist;
* captions align to dialogue timing;
* viseme cues exist for speaking lines;
* screenshots are nonblank;
* render package files exist;
* duration matches expected runtime;
* frame count is within tolerance;
* asset provenance exists;
* accessibility metadata exists;
* child-safety metadata exists if the show targets children.

Product Requirements

1. Show Bible System

Objective

Create a reusable show-level contract that keeps episodes consistent.

Required Fields

A show bible should include:

* show id;
* show title;
* target audience;
* episode length;
* tone;
* genre;
* visual style;
* character roster;
* location library;
* recurring props;
* episode structure;
* allowed themes;
* blocked themes;
* safety rules;
* caption style;
* thumbnail style;
* voice map;
* music/SFX identity;
* language;
* publish metadata defaults.

Example

const showBible = defineCartoonShowBible({
  showId: "moon-garden",
  title: "Moon Garden Helpers",
  audience: "preschool-family",
  runtime: {
    targetDuration: 60,
    frameRate: 30,
    resolution: { width: 1280, height: 720 }
  },
  tone: ["gentle", "curious", "warm", "safe"],
  visualStyle: "soft neon bedtime sci-fi",
  characters: ["miko", "luma"],
  locations: ["moonGarden"],
  episodeStructure: [
    "intro",
    "problem",
    "helper idea",
    "gentle action",
    "resolution",
    "outro"
  ],
  safetyRules: {
    noViolence: true,
    noScaryContent: true,
    noFlashing: true,
    childSafeLanguage: true
  }
});

Acceptance Criteria

* Show bible can be saved as JSON.
* Show bible can be passed into episode generation.
* Episode plans inherit show-level constraints.
* Validation fails if required show assets are missing.
* Agent docs explain how to create and modify a show bible.

2. Typed Character And Set Assets

Objective

Make reusable cartoon assets the foundation of the channel.

Required Capabilities

The asset system must support:

* character assets;
* set/environment assets;
* prop assets;
* animation clips;
* mouth/viseme metadata;
* gesture metadata;
* license metadata;
* style tags;
* scale metadata;
* preview thumbnail;
* provenance hash.

Required CLI Flow

npx @aura3d/cli@latest assets add ./assets/miko.glb --name miko --type character --profile cartoon-character
npx @aura3d/cli@latest assets add ./assets/luma.glb --name luma --type character --profile cartoon-character
npx @aura3d/cli@latest assets add ./assets/moon-garden.glb --name moonGarden --type set --profile cartoon-set

Required Generated Usage

import { assets } from "./aura-assets";
model(assets.characters.miko)
model(assets.characters.luma)
model(assets.sets.moonGarden)

Acceptance Criteria

* Characters and sets are typed.
* Missing assets fail validation.
* Agents do not need to use raw GLB paths.
* Asset provenance is included in the final episode package.
* License metadata is included or explicitly marked unknown.
* Character assets expose available animations, gestures, and viseme support.

3. Episode Plan Compiler

Objective

Convert a prompt into a structured production plan.

Required API

const plan = compilePromptEpisodePlan({
  showBible,
  episodeId: "moon-garden-001",
  title: "Moon Garden Helpers",
  prompt: "Miko and Luma clean glowing moon weeds before bedtime.",
  runtime: {
    duration: 60,
    frameRate: 30,
    resolution: { width: 1280, height: 720 }
  },
  characters: [
    { id: "miko", asset: assets.characters.miko, voiceId: "auravoice:miko" },
    { id: "luma", asset: assets.characters.luma, voiceId: "auravoice:luma" }
  ],
  locations: [
    { id: "moonGarden", asset: assets.sets.moonGarden }
  ]
});

Required Outputs

The compiler must generate:

episode.plan.json
storyboard.json
shot-timeline.json
dialogue-track.json
caption-track.json
visemes.pending.json
audio-stems.pending.json
render-queue.json
prompt-animation-evidence.pending.json

Acceptance Criteria

* Episode plan is deterministic from the same input.
* Episode plan respects show bible constraints.
* Dialogue references valid character IDs.
* Locations reference valid set IDs.
* Runtime duration is within target range.
* Plan can be validated before rendering.

4. Storyboard System

Objective

Prevent generated episodes from becoming static two-character scenes.

Required Capabilities

Storyboard should define:

* scenes;
* shots;
* visual intent;
* character placement;
* camera framing;
* suggested duration;
* dialogue linkage;
* caption linkage;
* emotion/gesture hints.

Required Shot Types

MVP must support at least:

1. wide establishing shot;
2. medium two-character shot;
3. close-up;
4. reaction shot;
5. action/object shot.

Acceptance Criteria

* Every episode has multiple shots.
* Every shot has a duration.
* Every shot references characters and/or props.
* Every dialogue line is linked to at least one shot.
* Screenshot capture times are generated from the storyboard.

5. Shot Timeline Runtime

Objective

Turn the storyboard into a browser-playable directed sequence.

Required API

const playback = createShotPlaybackPlan({
  timeline: plan.shotTimeline,
  performance: plan.performance,
  captions: plan.captionTrack,
  visemes,
  runtimeNodeByCharacterId: {
    miko: "miko",
    luma: "luma"
  },
  loop: false
});
installShotPlayback(app, playback);

Required Timeline Controls

The timeline must support:

* play;
* pause;
* seek;
* sample at time;
* frame stepping;
* deterministic capture mode;
* loop mode for preview;
* render mode for export.

Acceptance Criteria

* Browser route can play the episode.
* Route can seek to any timestamp.
* Render system can sample frames deterministically.
* Captions update according to time.
* Characters update according to shot timeline.
* Camera changes according to shot timeline.

6. Dialogue, Captions, And AuraVoice Bridge

Objective

Make voice timing the authority for captions, visemes, and performance timing.

Required Bridge Package

const bridgePackage = createAuraVoiceBridgePackage({
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

Required Sampling API

const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, 3.0);

The sample should return:

* active shot;
* active speaker;
* active dialogue line;
* active caption;
* active viseme;
* active audio stem;
* expected frame.

Acceptance Criteria

* Dialogue track can be exported.
* Captions can be exported as VTT.
* Captions can be exported as SRT.
* Voice/audio stem manifest can be attached.
* Timing drift can be measured.
* Route playback uses timing from the bridge package.

7. Visemes And Lip Sync

Objective

Support acceptable mouth animation for cartoon characters.

Required Paths

MVP must support two paths:

Path A: Primitive Mouth Card Fallback

For characters without facial rigs:

createPrimitiveMouthVisemeCues({
  characterId: "miko",
  speakerId: "miko",
  lineId: "line-1",
  startTime: 0,
  endTime: 2.4
});

Path B: GLB Blendshape Visemes

For characters with morph targets:

createGlbBlendshapeVisemeCue({
  characterId: "miko",
  blendshapeMap: {
    aa: "Mouth_AA",
    iy: "Mouth_EE",
    oh: "Mouth_OH",
    sil: "Mouth_Rest"
  }
});

Acceptance Criteria

* Every spoken line has viseme coverage.
* If blendshapes are unavailable, fallback mouth cards are used.
* Evidence records which lip sync mode was used.
* Validation warns if a character has no mouth strategy.
* Timing drift is included in evidence.

8. Gesture And Performance Library

Objective

Give characters enough physical performance to avoid dead scenes.

MVP Gesture Set

Support at least:

1. idle;
2. wave;
3. nod;
4. point;
5. happy reaction;
6. surprised reaction;
7. walk;
8. look at;
9. hold/pickup prop if possible;
10. gentle bounce/emphasis gesture.

Required Metadata

Each character should expose:

* supported gestures;
* animation clips;
* fallback gestures;
* incompatible gestures;
* gesture duration;
* loopability.

Acceptance Criteria

* Episode plan can request gestures.
* Runtime can map gestures to available clips.
* Missing gestures fall back gracefully.
* Evidence lists gesture coverage.

9. Browser Playback Route

Objective

Every cartoon episode should be inspectable as a browser route.

Required Route Shape

Example:

/episodes/moon-garden-001

Route must include:

* Aura3D canvas;
* characters;
* set;
* camera;
* lights;
* caption overlay;
* playback controls in preview mode;
* deterministic render mode;
* debug/evidence panel in dev mode.

Example Runtime

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.characters.miko).runtime(game.runtimeNode("miko")))
    .add(model(assets.characters.luma).runtime(game.runtimeNode("luma")))
    .add(model(assets.sets.moonGarden))
    .add(lights.studio())
});
installShotPlayback(app, playback);

Acceptance Criteria

* Route boots locally.
* Route boots in production build.
* Route health can be checked.
* Screenshots can be captured.
* Captions are visible.
* Route can run in preview and render mode.

10. Render Queue And Frame Capture

Objective

Turn browser playback into exportable media.

Required API

const renderQueue = createCartoonRenderQueue({
  episodePlan: plan.episodePlan,
  shotTimeline: plan.shotTimeline,
  route: "/episodes/moon-garden-001",
  captureTimes: plan.shotTimeline.shots.flatMap((shot) => shot.captureTimes)
});

Required Render Modes

MVP should support:

1. screenshot still capture;
2. thumbnail capture;
3. frame sequence capture;
4. WebM or MP4 export;
5. caption export;
6. render evidence export.

Acceptance Criteria

* Render queue can be generated.
* Thumbnail can be captured.
* At least one final video format is produced.
* Captions are exported.
* Render package contains metadata.
* Render failures are captured in evidence.

11. Episode Package

Objective

Produce a publish-ready folder for one episode.

Required Output

dist/episodes/{episodeId}/
  episode.webm or episode.mp4
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  episode.plan.json
  storyboard.json
  shot-timeline.json
  dialogue-track.json
  caption-track.json
  visemes.json
  audio-stems.json
  render-queue.json
  prompt-animation-evidence.json
  route-proof.json
  asset-provenance.json

Required Metadata

metadata.json should include:

* title;
* description;
* episode id;
* show id;
* duration;
* language;
* target audience;
* made-for-kids flag if applicable;
* tags;
* thumbnail path;
* captions path;
* video path;
* evidence path;
* asset provenance path.

Acceptance Criteria

* Package validates successfully.
* Missing required files fail validation.
* Package is ready for human review.
* Package can later be handed to a YouTube uploader.

12. Evidence And Publish Readiness

Objective

Make quality gates first-class.

Required Evidence API

const evidence = collectPromptAnimationEvidence({
  bridgePackage,
  screenshots,
  routeHealth,
  renderPackage,
  assetProvenance,
  accessibility,
  safety
});
const readiness = evaluatePromptAnimationPublishReadiness(evidence);

Required Evidence Checks

Evidence must include:

* route health;
* missing asset count;
* loaded model count;
* screenshot existence;
* screenshot nonblank check;
* caption timing;
* viseme timing;
* audio timing drift;
* render package existence;
* video file existence;
* duration check;
* frame count check;
* accessibility metadata;
* reduced motion metadata;
* high contrast metadata;
* flash safety metadata;
* child-safety metadata;
* asset provenance;
* license metadata;
* publish package validation.

Acceptance Criteria

* Publish readiness returns pass/fail.
* Failures are specific and actionable.
* Evidence is saved as JSON.
* Human reviewer can inspect all artifacts.
* No episode should be marked publish-ready without evidence.

13. Human Review Workflow

Objective

Keep human approval in the loop before publishing.

Required Review Checklist

The review screen or CLI should check:

* story makes sense;
* characters are on model;
* captions are readable;
* audio is clean;
* lip sync is acceptable;
* visuals are not broken;
* thumbnail is acceptable;
* content is safe for target audience;
* no unsafe flashing;
* licenses are known;
* metadata is complete.

Required Commands

npm run episode:review
npm run episode:approve
npm run episode:reject

Acceptance Criteria

* Review status is stored.
* Approved episodes can be packaged.
* Rejected episodes include reasons.
* Publish package records reviewer approval.

14. CLI Commands

Required Commands

npm run episode:new -- "story prompt"
npm run episode:plan
npm run episode:voice
npm run episode:preview
npm run episode:screenshot
npm run episode:render
npm run episode:review
npm run episode:package
npm run episode:validate

Aura3D CLI Commands

aura3d cartoon init
aura3d cartoon show-bible validate
aura3d cartoon episode new
aura3d cartoon episode plan
aura3d cartoon episode preview
aura3d cartoon episode render
aura3d cartoon episode package
aura3d cartoon episode validate
aura3d cartoon evidence collect
aura3d cartoon publish-readiness

Acceptance Criteria

* Commands are deterministic.
* Commands work in CI.
* Commands emit clear errors.
* Commands write artifacts to predictable paths.
* Commands are documented for AI agents.

15. Templates

Required Templates

Upgrade or create:

1. cartoon-channel
2. prompt-cartoon-channel
3. cartoon-studio
4. episode-builder
5. cartoon-youtube-short
6. cartoon-show-bible
7. cartoon-asset-pack

Template Requirements

Each template must include:

* sample show bible;
* sample episode prompt;
* typed asset slots;
* browser playback route;
* screenshot command;
* render command;
* package command;
* evidence command;
* README;
* agent instructions;
* public API usage only.

Acceptance Criteria

* Each template builds from clean install.
* Each template has one working route.
* Each template has proof artifacts.
* No template uses private/internal APIs.

16. Docs

Required Docs

Create or update:

* docs/api/prompt-animation.md
* docs/examples/cartoon-channel.md
* docs/templates/create-aura3d-templates.md
* docs/cartoon-studio/show-bible.md
* docs/cartoon-studio/episode-plan.md
* docs/cartoon-studio/storyboard.md
* docs/cartoon-studio/shot-timeline.md
* docs/cartoon-studio/voice-bridge.md
* docs/cartoon-studio/visemes.md
* docs/cartoon-studio/render-export.md
* docs/cartoon-studio/publish-readiness.md
* docs/cartoon-studio/youtube-package.md
* docs/cartoon-studio/agent-guide.md

Docs Must Explain

* what the cartoon system is;
* what it is not;
* how to create a show bible;
* how to register characters;
* how to register sets;
* how to generate an episode;
* how to preview;
* how to render;
* how to export captions;
* how to collect evidence;
* how to package for review;
* how to avoid hallucinated assets;
* what still requires human review.

Acceptance Criteria

* AI agents can follow docs without inventing APIs.
* Docs do not claim full Pixar/YouTube automation.
* Docs clearly state current capabilities and limits.
* Docs include one complete working example.

Non-Goals

Do not spend this iteration on:

* full Blender replacement;
* full animation editor;
* full nonlinear video editor;
* Pixar-quality generation;
* arbitrary multi-scene cinematic generation;
* native mobile export;
* Unreal/Unity cinematic parity;
* fully autonomous YouTube upload;
* complex physics;
* realistic human animation;
* multiplayer;
* live streaming;
* marketplace;
* advanced facial rigging authoring tools.

The MVP should stay focused on:

one repeatable 60-second cartoon episode package.

Commercial Use Cases

Aura3D Cartoon Studio can eventually support:

1. YouTube kids/family cartoon channels.
2. Educational animated shorts.
3. Brand mascots and product explainers.
4. AI-generated bedtime stories.
5. Character-based social media shorts.
6. Language-learning cartoons.
7. Toy/IP companion videos.
8. Storybook-to-cartoon conversion.
9. Internal training animations.
10. Personalized children’s stories.

The strongest first wedge is:

repeatable family-safe short cartoon episodes using a fixed cast and fixed set library.

Monetization Direction

Possible future product packages:

Open Source / Developer SDK

* templates;
* typed assets;
* episode contracts;
* browser playback;
* render evidence.

Paid Studio Layer

* curated character packs;
* curated set packs;
* voice integrations;
* render cloud;
* batch episode generation;
* review dashboard;
* export/publish workflow.

Enterprise / Brand Layer

* custom characters;
* branded show bible;
* brand safety gates;
* localization;
* approval workflows;
* evidence archive;
* publishing integrations.

Success Metrics

MVP success is measured by:

1. Time from prompt to previewable episode.
2. Time from prompt to packaged video.
3. Percentage of generated episodes passing validation.
4. Number of manual fixes required per episode.
5. Caption timing accuracy.
6. Viseme timing coverage.
7. Screenshot nonblank pass rate.
8. Render success rate.
9. Asset hallucination rate.
10. Human reviewer approval rate.

The target for the first vertical slice:

* one episode generated from prompt;
* under 60 seconds runtime;
* two characters;
* one set;
* working captions;
* working mouth fallback;
* screenshot evidence;
* thumbnail;
* video export;
* package validation;
* human review checklist.

Release Gates

A release cannot pass unless:

* cartoon templates build;
* sample episode route boots;
* typed assets validate;
* episode plan validates;
* storyboard validates;
* shot timeline validates;
* captions export;
* visemes validate;
* screenshot capture passes;
* thumbnail capture passes;
* video export produces a file;
* evidence JSON is written;
* publish readiness returns accurate status;
* package folder contains required files;
* docs match actual commands;
* no claims overstate current capability.

Flagship Demo

Build one flagship demo:

Show

Moon Garden Helpers

Format

60-second family-safe cartoon short.

Characters

* Miko
* Luma

Set

* Moon Garden

Episode

“The Glowing Moon Weeds”

Story

Miko and Luma discover glowing weeds in the moon garden, work together to clean them up, and make the garden sparkle before bedtime.

Required Output

dist/episodes/moon-garden-001/
  episode.webm or episode.mp4
  thumbnail.png
  captions.vtt
  captions.srt
  metadata.json
  prompt-animation-evidence.json
  route-proof.json
  asset-provenance.json

Demo Goal

The viewer should understand:

Aura3D can turn a reusable character/set library and a story prompt into a structured, previewable, evidence-backed cartoon episode package.

Final Agent Instruction

Work autonomously through the Aura3D repository.

Inspect the current cartoon templates, prompt animation APIs, asset system, route proof system, render queue contracts, evidence contracts, docs, and CLI.

Then implement the smallest complete vertical slice that proves Aura3D Cartoon Studio:

one 60-second browser-rendered cartoon episode package with typed assets, shot timeline, captions, visemes, screenshot evidence, thumbnail, video export, and publish-readiness JSON.

Do not chase Pixar quality.

Do not claim full YouTube automation.

Do not build private demo hacks.

Do not hallucinate assets.

Use public APIs only.

Prioritize repeatability, typed assets, evidence, render package output, and agent-readable docs.

When complete, produce:

1. changelog;
2. files changed;
3. commands run;
4. tests passed;
5. generated artifacts;
6. remaining gaps;
7. honest current capability statement;
8. next iteration plan.
