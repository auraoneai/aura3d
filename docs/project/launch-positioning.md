# Launch Positioning

Date: 2026-07-01
Status: public copy boundary

Use this file to decide what can be said publicly today and what must wait for
library or showcase gates.

## Safe Positioning Today

Aura3D can be positioned as:

- an agent-friendly TypeScript browser 3D SDK;
- a public `@aura3d/engine` API for scene composition, typed assets, runtime
  nodes, frame updates, basic rendering, and diagnostics;
- a CLI-backed typed GLB/glTF asset workflow;
- a template and docs system for AI coding agents building browser 3D apps;
- a project with explicit evidence gates for screenshots, route health, asset
  provenance, release checks, and deployment checks.

## Required Qualifiers

Use qualifiers when discussing advanced areas:

- "root `createAuraApp` path" for public agent API claims;
- "production-runtime/internal" for internal renderer capability;
- "prototype" for route-local showcase logic;
- "roadmap" for planned game kits, production renderer bridge, and expanded
  asset validation;
- "route-specific" for material, postprocess, animation, WebGPU, or game claims.
- "prototype-blocked" for retained routes that have evidence but cannot be
  public release candidates yet.

## Blocked Public Positioning

Do not say:

- Aura3D is a complete Three.js/Babylon/Unity/Unreal replacement.
- Aura3D root `createAuraApp` defaults to the production renderer.
- Aura3D examples prove full PBR/HDR/postprocess/WebGPU/skinning/morph support
  unless the exact route evidence exists.
- Showcase routes are public release candidates before the showcase gates pass.
- Route-local game logic proves reusable game-engine kits.
- Catalog search returns production-ready game art automatically.
- Turbo Drift Circuit or Skyline Runner are public examples before retained
  game-geometry evidence proves racing topology or platformer surface binding.

## Showcase Copy

Showcase copy must include:

- route classification;
- exact capability claims;
- evidence status;
- fallback state;
- limitations when the route is a prototype or diagnostic.

## Upgrade Path

Public positioning can widen only after:

1. the library feature lands in public API;
2. docs describe fallback behavior;
3. browser tests import only public root APIs for root claims;
4. screenshots or route evidence prove the pixels/behavior;
5. visual review passes for public showcase examples;
6. claim review updates this file or the route-specific copy.
