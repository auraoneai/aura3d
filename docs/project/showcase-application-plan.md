# Showcase Application Plan

Date: 2026-07-19
Status: release-candidate showcase plan

The showcase slate is an evidence artifact, not a list of marketing promises.
Every route must prove its category through typed assets, route-health,
screenshots, interaction tests, and claim review before it can be promoted.

## Non-Negotiable Rules

- Use public `@aura3d/engine` APIs in agent-facing showcase code.
- Do not import `three`, `GLTFLoader`, raw renderer internals, raw GLB URLs, or
  string asset IDs.
- Use the Aura3D CLI to add or resolve real assets, then import `assets` from
  `src/aura-assets.ts` and call `model(assets.x)`.
- Primitives may be set dressing, board cells, collision guides, debug markers,
  abstract visualization, and HUD anchors. They may not be the main character,
  vehicle, world, hero product, creature, weapon, or primary environment for a
  real-world/game claim.
- CSS and DOM overlays may be UI. They may not be fake particles, fake 3D
  labels, fake scene effects, or fake rendering evidence.
- A route is not acceptable as public showcase material unless the main subject
  is readable at first load on desktop and mobile screenshots.
- A game route is not acceptable unless keyboard input visibly changes game
  state and tests prove movement, reset, and at least one scoring/fail/objective
  loop.

## Current Route Classification

| App | Current classification | Required action |
| --- | --- | --- |
| `apps/showcase-product-configurator` | release-ready candidate | Keep bounded public product/configuration claims and retained visual review evidence. |
| `apps/showcase-material-asset-inspector` | release-ready candidate | Keep inspection metadata readable and bounded to root material evidence. |
| `apps/showcase-smart-city-control` | release-ready candidate | Keep the typed vehicle/control scene readable; do not claim real city simulation. |
| `apps/showcase-cinematic-architecture` | release-ready candidate | Keep architecture presentation bounded; do not claim HDR/shadows/postprocess/PBR parity. |
| `apps/showcase-digital-twin-ops` | release-ready candidate | Keep visual ops/dashboard claims bounded; do not claim real facility integration. |
| `apps/showcase-blockfall-reactor` | release-ready candidate | Preserve retained falling-block gameplay proof and public visual review. |
| `apps/showcase-data-galaxy` | internal diagnostic | Keep as retained diagnostic unless public visual/data evidence is rebuilt. |
| `apps/showcase-webgpu-particle-lab` | internal diagnostic | Keep native WebGPU demoted until adapter/dispatch/render/pixel proof exists. |
| `apps/showcase-skyline-runner` | release-ready candidate | Preserve certified surface extraction, character/world binding, category pacing, contact/camera evidence, and visual QA. |
| `apps/showcase-turbo-drift-circuit` | release-ready candidate | Preserve certified racing topology, car/road binding, category pacing, camera evidence, gameplay, and visual QA. |

## Promotion Ladder

| Status | Meaning |
| --- | --- |
| `prototype` | Source exists for exploration, but claims are internal only. |
| `diagnostic` | Useful for inspection/debug/evidence, not a polished showcase. |
| `release-ready candidate` | Passed current public showcase gates and visual review with bounded claims. |
| `internal diagnostic` | Retained route that provides evidence or diagnostics, not public showcase copy. |
| `prototype-blocked` | Retained prototype with exact blockers; not public showcase copy. |
| `blocked` | Must not be promoted until named blockers are fixed. |

## Per-App Definition Of Done

Every app promoted beyond prototype must have:

- typed primary assets or an explicit abstract-visualization exception;
- route-health JSON with category, claims, primary assets, primitive count,
  renderer backend, fallback state, and evidence paths;
- desktop and mobile screenshots;
- source scan for unsafe asset/rendering patterns;
- primitive budget and justification;
- README/source/evidence consistency;
- public copy reviewed against `docs/project/claim-guidelines.md`.

Game apps additionally need:

- keyboard input test;
- visible state change after input;
- objective/scoring/fail/reset loop;
- genre-specific mechanic tests;
- HUD state matching gameplay state;
- accessibility and pause/restart path.

## Build Order

1. Implement shared route-health and source validation gates.
2. Repair or demote current route claims.
3. Preserve all 9 current accepted public candidates and do not widen their claims beyond retained evidence.
4. Keep Data Galaxy and WebGPU Particle Lab as internal diagnostics until their
   visual/capability blockers close.
5. Keep the two game-layer proof routes diagnostic-only; Turbo Drift and Skyline remain public only while their complete certified evidence chain passes.

## Related Docs

- Quality gates: `docs/project/showcase/quality-gates.md`
- App classification: `docs/project/showcase/apps-classification.md`
- Launch positioning: `docs/project/launch-positioning.md`
- Evidence policy: `docs/project/verification-evidence.md`
