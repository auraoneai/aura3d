# Marketing Site

Date: 2026-08-08
Status: Aura3D 2.0.0 marketing release-candidate requirements

The marketing site must be claim-safe. It can sell Aura3D's current strengths,
but it cannot imply unsupported root renderer, animation, game, or WebGPU
capability.

## Current Showcase Gallery State

The 2.0 website build publishes four non-game route-library candidates awaiting
current human review:

- Product Configurator
- Smart City Control
- Cinematic Architecture
- Digital Twin Operations

It also publishes three clearly labeled visual-rebuild prototypes that cannot
be promoted in this release:

- Blockfall Reactor
- Turbo Drift Circuit
- Skyline Runner

Aura Clash remains a development showcase. Data Galaxy and WebGPU Particle Lab
remain Labs diagnostics. Superseded public proofs and the duplicate Material
Asset Inspector are excluded from the current website build.

Nine separately labeled evidence routes cover glTF variants, OBJ import,
anisotropy, depth/outline postprocessing, trackball controls, draw ranges,
picking, multiple camera views, and injected WebXR interaction semantics. Their
claims stay bound to the exact route and renderer path.

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
- verify the gallery matches current `tools/showcase-library/route-gates.json`
  and `docs/project/showcase-launch-evidence.json`: four review-eligible
  candidates, two Labs diagnostics, three visibly prototype-blocked games, and
  no superseded or duplicate public routes.
