# Current State

Date: 2026-07-01
Status: release-candidate documentation baseline

Aura3D is a developer SDK, asset workflow, template system, diagnostics surface,
and agent-readable documentation set for browser 3D apps. AI coding agents write
normal TypeScript or JavaScript against public `@aura3d/engine` APIs and use the
Aura3D CLI to register typed assets.

This file is intentionally conservative. It describes what the public root
`createAuraApp` path can prove today and what still requires library work before
showcase or marketing claims can use it.

## Current Public Root API Strengths

The public agent-facing path currently supports these claims when examples use
only `@aura3d/engine`, import generated typed assets, and pass browser evidence:

- typed asset manifests through `aura.assets.json` and generated
  `src/aura-assets.ts`;
- safe asset usage through `model(assets.assetName)`;
- basic route mounting through `createAuraApp`;
- static GLB/glTF mesh loading in the root WebGL2 path;
- base-color material and texture rendering in the root path;
- non-skinned glTF node animation in root screenshots;
- scene composition with `scene()`, `model()`, `camera`, `lights`, `material`,
  `primitives`, `effects`, `labels`, `timeline`, `interactions`, and runtime
  nodes;
- frame updates, app pause/resume/step, and deterministic runtime tests;
- basic game input helpers and fighting-game helper surfaces where the APIs are
  exported from root `@aura3d/engine`;
- screenshots, diagnostics, deployment checks, and route-health style evidence
  when generated from current tests.

## Current Public Root API Gaps

These must not be presented as broadly shipped root `createAuraApp` capability
until library work and browser evidence close the gap:

- default production-runtime renderer bridge for `createAuraApp`;
- full production renderer parity through the public root safe API;
- full PBR material parity, HDR/IBL lighting, PMREM-style filtering, production
  tone mapping, high-quality shadows, and broad postprocess support;
- pixel-backed bloom, SSAO, DOF, FXAA/TAA, color grading, or cinematic effects
  in public examples unless the exact route has screenshot proof;
- skinned GLB animation rendered through root `createAuraApp` screenshots;
- morph target rendering through root `createAuraApp` screenshots;
- production-quality platformer or racing reusable game kits;
- mesh-derived racing road topology extraction that is strong enough for public
  racing examples;
- mesh-derived platformer playable-surface extraction that is strong enough for
  public platformer examples;
- generic gameplay collision/sensor world for browser games;
- public game camera and scene-binding systems that certify a car or character
  is visibly bound to the rendered track or platform world;

## Release Track Reality

Package publication and showcase readiness are separate release tracks.

The package track can be considered for release when package tests, API docs,
packaging, and install smoke checks pass. That does not automatically make any
showcase route public-ready.

The current showcase release-candidate track passes for six public routes and
keeps four non-public routes out of the public release count. The release gate
is `node tools/showcase-library/build-and-check.mjs`.

Current retained result:

- public release candidates: 6/6 passing;
- internal diagnostics: 2 retained and not counted as public failures;
- prototype-blocked game diagnostics: 2 retained and not counted as public
  examples;
- showcase index: handled as an index/catalog route, not a deployable 3D app.

## Showcase Reality

The current showcase slate is split by public release status:

- public release candidates: Product Configurator, Material Asset Inspector,
  Smart City Control, Cinematic Architecture, Digital Twin Operations, and
  Blockfall Reactor;
- internal diagnostics: Data Galaxy and WebGPU Particle Lab;
- prototype-blocked diagnostics: Turbo Drift Circuit and Skyline Runner.

Turbo Drift Circuit and Skyline Runner are intentionally removed from public
examples. The library is not being deleted. The game layer must be rebuilt
before these categories can return to public release.

No route may move to public-ready based only on boot success, nonblank
screenshots, route-local claims, deploy metadata, or gameplay state changes.
Public game routes also require public visual review and retained game-geometry
evidence.

## Canonical Rules

- Read `llms.txt` before authoring apps or docs.
- Use public `@aura3d/engine` APIs for agent-authored examples.
- Do not import `three`, `GLTFLoader`, or renderer internals in public examples.
- Do not invent assets, raw GLB URLs, or string asset IDs.
- Acquire assets with the Aura3D CLI and use generated typed imports.
- Do not use primitives as the main character, vehicle, world, hero product,
  creature, weapon, or primary environment when the example claims a real-world
  or game experience.
- CSS and DOM overlays can be UI, not fake scene content or fake rendering
  evidence.
- Public claims must name the path they apply to: root `createAuraApp`,
  `production-runtime`, rendering internals, CLI asset pipeline, template-only
  scaffold, prototype, or roadmap.

## Durable References

- Claim policy: `docs/project/claim-guidelines.md`
- Product boundary: `docs/project/product-boundaries.md`
- Known limitations: `docs/project/known-limits.md`
- Library gap roadmap: `docs/project/library-gap-roadmap.md`
- Showcase gates: `docs/project/showcase-quality-gates.md`
- Release tracks: `docs/project/release-tracks.md`
- Launch positioning: `docs/project/launch-positioning.md`
- Game layer rebuild plan: `docs/project/aura3d-game-layer-rebuild-plan.md`
- Next release candidate: `docs/project/aura3d-140-release-candidate.md`
