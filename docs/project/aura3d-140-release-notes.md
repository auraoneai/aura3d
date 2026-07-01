# Aura3D 1.4.0 Release Notes

Date: 2026-07-01
Status: published

These notes summarize the release published after `@aura3d/engine@1.3.3`.
npm `latest` now resolves to `1.4.0` across the 26 public Aura3D packages.

Package manifests, package/dist checks, and publish verification are aligned at
`1.4.0`.

## Headline

Aura3D 1.4.0 is a hardening release for agent-authored browser 3D. It tightens
public claims, asset validation, generated showcase evidence, package/dist
parity, and release classification so demos cannot be called public-ready from
technical render proof alone.

## Showcase Position

The public showcase now contains six release candidates:

- Product Configurator
- Material Asset Inspector
- Smart City Control
- Cinematic Architecture
- Digital Twin Operations
- Blockfall Reactor

Two routes remain retained diagnostics, not public release candidates:

- Data Galaxy
- WebGPU Particle Lab

Two game routes are intentionally removed from public examples:

- Turbo Drift Circuit
- Skyline Runner

Turbo Drift Circuit and Skyline Runner are not deleted. They remain retained
prototype diagnostics until Aura3D has certified racing topology, platformer
playable-surface evidence, game-to-scene transform validation, and visual review
that proves public-quality game presentation.

## What Changed Since 1.3.3

- Added stricter showcase release classification for public candidates,
  internal diagnostics, prototype-blocked routes, and the non-deployable
  showcase index route.
- Added route-primary screenshot evidence, release asset probe evidence,
  gameplay proof, and visual review as separate release gates.
- Added role-aware release asset validation, rendered-probe validation, source
  validation, package/dist parity checks, and safer resolver-backed replacement
  decisions.
- Added a showcase spec compiler path that can generate bounded artifacts,
  replacement decisions, evidence checklists, and honest blocked/demoted status.
- Moved the website showcase gallery to the six public examples and separated
  Data Galaxy / WebGPU Particle Lab into Labs diagnostics.
- Removed Turbo Drift Circuit and Skyline Runner from public showcase and
  release-candidate paths until the game layer is rebuilt.
- Documented the game-layer rebuild requirements in
  `docs/project/aura3d-game-layer-rebuild-plan.md`.

## What This Release Does Not Claim

- No production-quality public racing game generation.
- No production-quality public platformer game generation.
- No native WebGPU public route readiness.
- No full PBR, HDR, shadow, or postprocess parity from root `createAuraApp`.
- No generic production game-kit claim from route-local prototypes.

## Release Verification

These gates passed before publication:

```sh
pnpm build:raw
pnpm typecheck:raw
node tools/showcase-library/build-and-check.mjs
pnpm exec vitest run tests/unit/package-dist --reporter=dot
NPM_CONFIG_USERCONFIG=/path/outside/repo/.npmrc node tools/release/publish-all.mjs --dry-run
```

The publish step used an npm token outside the repository. Do not commit
`.npmrc` or print tokens in release logs.
