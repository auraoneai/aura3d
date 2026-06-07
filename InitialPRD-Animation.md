# Aura3D Next — PRD + Autonomous Execution Prompt

> **Converted.** This source vision has been turned into a codebase-grounded, filename-level
> Animation Engine PRD with detailed task tables and P0/P1/P2 checklists:
> - PRD: [`docs/project/aura3d-animation-engine-prd.md`](docs/project/aura3d-animation-engine-prd.md)
> - Progress / checklist: [`docs/project/aura3d-animation-engine-progress.md`](docs/project/aura3d-animation-engine-progress.md)
>
> The PRD audits the shipped 1.1.0 animation runtime (real clip playback, mixer/blending,
> state graphs, IK, retargeting, root motion, shot playback, combat world, and the deployed
> Aura Clash arena), marks every item `[x]` done or `[ ]` remaining, and scopes the 1.2
> consolidation/believable-motion/honest-boundary work. Every "current status" line was
> confirmed with file:line evidence via THREE rounds of deep scanning (18 agent lanes) plus
> LIVE test execution — covering the animation/engine packages, the GPU skinning render path,
> the Aura Clash arena, the `three-compat`/`debug`/`workflows`/`editor`/`react` packages, the
> `wow-*`/`world-war-x`/`game-slice` demo surface, git history, and the full gate/report state
> (including which suites are currently RED at HEAD). The strategic vision below is retained as
> the source-of-record context.

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
