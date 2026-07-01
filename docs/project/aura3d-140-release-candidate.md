# Aura3D 1.4.0 Release Candidate And Publish Record

Date: 2026-07-01
Status: published

This document summarizes the release-candidate state after the post-1.3.3
showcase, asset, compiler, and evidence work. The candidate was published as
1.4.0 after the build, typecheck, showcase, package-dist, tarball, and npm
publish verification gates passed.

## Published Baseline

- Previous npm baseline: `@aura3d/engine@1.3.3`.
- Published npm baseline: `@aura3d/engine@1.4.0`.
- Published package family version: `1.4.0` across the 26 public Aura3D
  packages.
- Release notes: `docs/project/aura3d-140-release-notes.md`.

## Release-Candidate Scope

The release candidate focuses on making public claims evidence-bound:

- role-aware release asset validation;
- rendered-probe validation that rejects fake or stale probe evidence;
- AST source validation for public examples and showcase routes;
- resolver/ranking preservation for replacement assets;
- hash-bound orientation override support where embedded GLB orientation is
  missing but inspected evidence exists;
- package/dist parity checks;
- route-primary screenshot probes;
- release asset probes;
- gameplay proof for routes that claim game behavior;
- visual review as a hard public-release gate;
- showcase spec compiler support for generated artifacts, replacement decisions,
  and bounded route classifications;
- public release classification that separates release-ready candidates,
  internal diagnostics, prototype-blocked routes, and the showcase index.

The website showcase gallery has been aligned to this scope: it links the six
public candidates, keeps Data Galaxy and WebGPU Particle Lab as Labs
diagnostics, and excludes Turbo Drift Circuit and Skyline Runner from public
examples until the game layer is rebuilt.

## Public Showcase Status

Current public release candidates:

| Route | Public status | Claim boundary |
| --- | --- | --- |
| Product Configurator | release-ready candidate | Product configurator with typed headphones and bounded material/configuration claims. |
| Material Asset Inspector | release-ready candidate | Public inspection tool with bounded material/asset metadata claims. |
| Smart City Control | release-ready candidate | Visual operations/control demo; not a real city simulation. |
| Cinematic Architecture | release-ready candidate | Architecture presentation with bounded rendering claims. |
| Digital Twin Operations | release-ready candidate | Visual ops/dashboard demo; not a real digital-twin integration. |
| Blockfall Reactor | release-ready candidate | Bounded falling-block route with retained gameplay proof. |

Retained non-public routes:

| Route | Status | Reason |
| --- | --- | --- |
| Data Galaxy | internal diagnostic | Abstract/data route retained for diagnostics; not a public release claim. |
| WebGPU Particle Lab | internal diagnostic | Native WebGPU proof is absent; no native WebGPU public claim. |
| Turbo Drift Circuit | prototype-blocked | Public racing quality requires certified topology, car-to-road binding, camera composition, and visual review. |
| Skyline Runner | prototype-blocked | Public platformer quality requires certified playable surfaces, character/world contact, scale, camera framing, and visual review. |

`showcase-index` is an index/catalog route. It is not a deployable 3D showcase
app and must not require primary assets, deploy asset validation, or a
route-primary probe.

## Game Example Boundary

Turbo Drift Circuit and Skyline Runner are intentionally removed from public
examples. The library is not being deleted. The game layer must be rebuilt
before these categories can return.

The missing game layer is documented in
`docs/project/aura3d-game-layer-rebuild-plan.md` and includes:

- mesh-derived racing topology extraction from real track GLBs;
- certified racing track catalog entries with road width, lap length, scene
  bounds, and car scale compatibility;
- mesh-derived platformer playable-surface extraction from real world GLBs;
- certified platformer world catalog entries with surfaces, hazards,
  checkpoints, finish zones, and character scale compatibility;
- game-to-scene transform validation against retained screenshots;
- category-level camera and gameplay framing that produces public-quality
  screenshots.

## Verification For This Candidate

Run these before publishing:

```sh
pnpm build:raw
pnpm typecheck:raw
node tools/showcase-library/build-and-check.mjs
pnpm exec vitest run tests/unit/package-dist --reporter=dot
pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts --reporter=dot
pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts tests/unit/asset-index/cli-pull-bridge.test.ts tests/unit/docs/material-claims.test.ts --reporter=dot
```

Run package dry-run through the repository release helper:

```sh
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs --dry-run
```

Do not publish with a token stored in the repository.

## Out Of Scope

This release candidate does not claim:

- production-quality public racing game generation;
- production-quality public platformer game generation;
- native WebGPU route readiness;
- full PBR/HDR/shadow/postprocess parity from root `createAuraApp`;
- skinned animation or morph target rendering from every root screenshot.

Those claims require separate retained browser evidence and must remain
prototype, internal, production-runtime, or roadmap wording until proven.
