# Marketing Site

Date: 2026-07-01
Status: marketing release-candidate copy requirements

The marketing site must be claim-safe. It can sell Aura3D's current strengths,
but it cannot imply unsupported root renderer, animation, game, or WebGPU
capability.

## Current Showcase Gallery State

The release-candidate website gallery presents only six public showcase cards:

- Product Configurator
- Material Asset Inspector
- Smart City Control
- Cinematic Architecture
- Digital Twin Operations
- Blockfall Reactor

Data Galaxy and WebGPU Particle Lab are shown only as Labs diagnostics. Turbo
Drift Circuit and Skyline Runner are intentionally absent from public examples
until the game layer has certified racing topology, platformer playable
surfaces, game-to-scene transform validation, and visual review evidence.

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
- limitations page or prominent link to `docs/project/known-limits.md`;
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
- verify the gallery still matches the six-public, two-diagnostic, two
  prototype-blocked classification in
  `docs/project/aura3d-140-release-candidate.md`.
