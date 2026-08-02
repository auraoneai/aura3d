# Aura3D Current State

Date: 2026-07-27
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
- broad skinned GLB animation support inferred from one fixture; the named
  `createAuraApp` animation-bridge route proves only its tested asset and pose
  deltas;
- broad morph-target support inferred from one fixture; the named root morph
  route proves only its tested asset, influence changes, and pixels;
- production-quality platformer or racing game-engine parity; the public genre kits are bounded deterministic presentation/runtime helpers;
- arbitrary-mesh collision or automatic GLB-to-game conversion; certified racing/platformer geometry applies only to validated assets and retained route evidence;
- generic rigid-body gameplay collision/sensor world for browser games;
- AI opponents, netcode, or production vehicle/character physics;

## Release Track Reality

Package publication and showcase readiness are separate release tracks.

The package track can be considered for release when package tests, API docs,
packaging, and install smoke checks pass. That does not automatically make any
showcase route public-ready.

The retained `node tools/showcase-library/build-and-check.mjs` report predates
the current evidence-truth reset and is not current-worktree approval.
Blockfall Reactor, Turbo Drift Circuit, and Skyline Runner are
`prototype-blocked` while their visual rebuilds and hash-bound independent
reviews are pending. Aura Clash remains a development showcase without a
flagship-quality claim.

Current retained result:

- configured public route-library candidates: four remain eligible for current
  review; no new aggregate pass is claimed until the gate is regenerated;
- internal diagnostics: 2 retained and not counted as public failures;
- game-layer diagnostics: 2 retained as contract/debug harnesses, not public examples;
- prototype-blocked routes: 3;
- showcase index: handled as an index/catalog route.

Current route-library release status: not approved for the current worktree.
The July 19 manual review predates current Turbo, Skyline, and Blockfall source.
Performance/parity promotion is also unavailable while the comparative
performance report lacks six required inputs.

## Showcase Reality

The currently eligible four-route slate includes Product Configurator, Smart
City Control, Cinematic Architecture, and Digital Twin Operations. Blockfall
Reactor, Turbo Drift Circuit, and Skyline Runner are visual-rebuild prototypes.
Aura Clash is tracked separately. Material Asset Inspector and the earlier racing/platformer
presentation proofs remain accessible but unpromoted. Data Galaxy and WebGPU
Particle Lab remain internal diagnostics. Racing Game Layer Proof and
Platformer Game Layer Proof remain diagnostic harnesses.

Turbo Drift and Skyline retain bounded certified asset-geometry, pair,
mounted gameplay, route-local AI/challenge, route-primary, and deploy evidence.
That evidence does not establish current visual approval, arbitrary GLB-to-game
conversion, or production game-engine parity.

No route may move to public-ready based only on boot success, nonblank screenshots, route-local claims, deploy metadata, or gameplay state changes. Public game routes require current certified geometry, pair composition, route-primary, gameplay, automated visual QA, manual downward-only review, and deploy evidence.

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
- Product boundary: `docs/project/status/product-boundaries.md`
- Known limitations: `docs/project/status/known-limits.md`
- Library gap roadmap: `docs/project/roadmaps/library-gap-roadmap.md`
- Showcase gates: `docs/project/showcase/quality-gates.md`
- Release tracks: `docs/project/release-tracks.md`
- Launch positioning: `docs/project/launch-positioning.md`
- Game layer rebuild plan: `docs/project/aura3d-game-layer-rebuild-plan.md`
- Next release candidate: `docs/project/aura3d-140-release-candidate.md`
