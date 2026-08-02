# Marketing Site

Date: 2026-07-19
Status: marketing release-candidate copy requirements

The marketing site must be claim-safe. It can sell Aura3D's current strengths,
but it cannot imply unsupported root renderer, animation, game, or WebGPU
capability.

## Current Showcase Gallery State

The production website publishes 10 release-ready showcase routes:

- Product Configurator
- Material Asset Inspector
- Smart City Control
- Cinematic Architecture
- Digital Twin Operations
- Blockfall Reactor
- Public Racing Presentation Proof
- Public Platformer Presentation Proof
- Turbo Drift Circuit
- Skyline Runner

Data Galaxy and WebGPU Particle Lab remain Labs diagnostics. Racing Game Layer Proof and Platformer Game Layer Proof remain internal diagnostic harnesses and are not published as marketing cards. The three current public racing/platformer routes keep bounded stylized-presentation claims and require current certified geometry, pair composition, gameplay, automated visual QA, manual review, and deploy evidence.

## Allowed Site Message

- Agent-friendly TypeScript browser 3D SDK.
- Public `@aura3d/engine` scene composition.
- Typed GLB/glTF asset workflow through the CLI.
- Templates, diagnostics, screenshots, and deployment checks.
- Honest route evidence and known limitations.

## Required Pages Or Sections

- product overview;
- agent quickstart that starts from `llms.txt`;
- typed asset workflow;
- public API overview with status labels;
- showcase page with route classifications;
- evidence page explaining route-health, screenshots, asset validation, and
  release gates;
- limitations page or prominent link to `docs/project/status/known-limits.md`;
- claims/release notes page tied to `docs/project/release-tracks.md`.

## Blocked Site Copy

- "production renderer quality" without root screenshot evidence;
- "native WebGPU" without WebGPU proof;
- "full PBR/HDR/postprocess" without route-specific proof;
- "skinned character animation" without root-public pixel evidence;
- "playable production games" without game gates;
- "beats Three.js/Babylon/Unity/Unreal" without frozen benchmark gates.

## Showcase Cards

Each card must include:

- classification;
- route status;
- exact claim;
- evidence status;
- limitation or fallback state when relevant.

Prototype and blocked routes may appear only in internal/staging pages or in a
clearly labeled "work in progress" section.

## Release Review

Before publication:

- run link checks;
- review copy against `docs/project/claim-guidelines.md`;
- verify every promoted route has current evidence;
- ensure screenshots come from the current build;
- ensure app READMEs and marketing copy agree.
- verify the gallery matches current `tools/showcase-library/route-gates.json` and `docs/project/showcase-launch-evidence.json`: 9 current public release candidates, two Labs diagnostics, two internal game-layer diagnostics, and no prototype-blocked routes.
