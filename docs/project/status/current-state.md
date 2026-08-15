# Aura3D Current State

Date: 2026-08-15
Status: Aura3D 2.0.2 current package version; independent exact-artifact review remains a separate gate

Aura3D is a developer SDK, asset workflow, template system, diagnostics surface,
and agent-readable documentation set for browser 3D apps. AI coding agents write
normal TypeScript or JavaScript against public `@aura3d/engine` APIs and use the
Aura3D CLI to register typed assets.

This file is intentionally conservative. It describes what the public root
`createAuraApp` path can prove today and what still requires library work before
showcase or marketing claims can use it.

Aura3D is not currently a Unity or Unreal replacement. Version 2.0.2 is the
current coordinated package version. The immutable `v2.0.0` and `v2.0.1` tags
remain historical. Subsequent game, lighting, and website changes still require
exact-artifact review before they can be promoted as independently approved
showcase artifacts.

## Current Public Root API Strengths

The public agent-facing path currently supports these claims when examples use
only `@aura3d/engine`, import generated typed assets, and pass browser evidence:

- typed asset manifests through `aura.assets.json` and generated
  `src/aura-assets.ts`;
- safe asset usage through `model(assets.assetName)`;
- basic route mounting through `createAuraApp`;
- production-runtime rendering by default for safe authored primitives and
  generated typed GLB assets, with backend identity published in diagnostics and
  route-health markers;
- static GLB/glTF mesh loading in the root WebGL2 path;
- base-color material and texture rendering in the root path;
- non-skinned glTF node animation in root screenshots;
- scene composition with `scene()`, `model()`, `camera`, `lights`, `material`,
  `primitives`, `effects`, `labels`, `timeline`, `interactions`, and runtime
  nodes;
- frame updates, app pause/resume/step, and deterministic runtime tests;
- basic game input helpers and fighting-game helper surfaces where the APIs are
  exported from root `@aura3d/engine`;
- recommended `@aura3d/lean`, `@aura3d/lean/product`, and
  `@aura3d/lean/game` public entries for new applications that do not need the
  compatibility-heavy `@aura3d/engine` root barrel;
- screenshots, diagnostics, deployment checks, and route-health style evidence
  when generated from current tests.

## Current Public Root API Gaps

These must not be presented as broadly shipped root `createAuraApp` capability
until library work and browser evidence close the gap:

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

The current public `examples/` inventory contains 13 retained routes after
duplicate, contract-only, misleading, or visually rejected hosts were archived
or moved to internal fixtures. Each retained route has been inspected at source,
canvas, and full-page level and assigned a bounded disposition. The final clean
unfiltered audit after the last presentation fixes passed in 1.3 minutes on
2026-08-09 with exactly 13 routes, zero failures, and fresh canvas/full-page
captures. The material, postprocess, and large-scene pairs were personally
reopened from that run before the audit disposition was closed.

Current retained result:

- public `examples/` routes: 13 retained, with real-asset workflows and bounded
  diagnostics distinguished explicitly;
- internalized hosts: still executable where useful for browser contracts, but
  excluded from the public route inventory and visual-parity claims;
- removed public game/racing hosts: not counted as release games or parity
  evidence;
- current same-workload Three.js comparison: all 15 bounded workloads pass from
  freshly packed and installed 2.0.0 tarballs, while visual differences remain
  disclosed and the result does not support a universal ecosystem-parity claim.

Current route-library release status: per-route repairs, human dispositions,
and the clean unfiltered audit are recorded in retained release evidence. The exact
installed-package same-workload run and internal per-file visual ledger are
current; clean-machine reproduction is retained with an explicit container
WebGPU hardware boundary, broad performance superiority is not claimed, and
independent human review plus the remaining release tracks are still open.
The former comparison suite is frozen
against `three@0.165.0` and is historical only. The current target is
`three@0.185.1`; no current broad parity, performance, head-to-head, replacement,
or ecosystem claim is permitted without current, workload-specific evidence.

## Showcase Reality

The non-game candidate slate includes Product Configurator, Smart City Control,
Cinematic Architecture, and Digital Twin Operations. Blockfall Reactor, Turbo
Drift Circuit, and Skyline Runner now have materially rebuilt gameplay and
current automated evidence; they remain promotion-blocked until an independent
reviewer approves the exact final artifacts. Aura Clash is tracked separately
and remains a development showcase under the same exact-artifact rule.
Superseded and duplicate public routes are excluded from the website build.
Data Galaxy and WebGPU Particle Lab remain internal diagnostics.

Turbo Drift and Skyline retain bounded certified asset-geometry, pair,
mounted gameplay, route-local AI/challenge, route-primary, full-level or race
progression, and deploy evidence. That evidence does not establish independent
visual approval, arbitrary GLB-to-game conversion, physical vehicle simulation,
or production game-engine parity.

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
- Showcase gates: `docs/project/showcase/quality-gates.md`
- Release tracks: `docs/project/release-tracks.md`
- Launch positioning: `docs/project/launch-positioning.md`
- Aura3D 2.0.0 release notes: `docs/project/aura3d-200-release-notes.md`
