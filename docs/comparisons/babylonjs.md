# Aura3D And Babylon.js

Version: 4.6.1

## What you get with Aura3D

- Typed, hashed, licensed assets: `model(assets.robot)` is a generated key, and in production a model without a valid hash does not draw.
- `looks.preset(id)`: HDRI lighting, a shadow-casting key light, grade and post effects in one call.
- A game kit (`@aura3d/engine/game`): HUD, touch controls, session flow, an audio cue bank, a fixed-step loop and seeded replay.
- Agent docs in every new project: `llms.txt`, 14 skills and compiled recipes.
- `aura3d check-deploy` for the build output, asset manifest and hashes, with licence and quality gates under `--release`.

Capability status and code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md).

Aura3D is a standalone TypeScript 3D engine for the browser with its own renderer. Comparison coverage against Babylon.js is limited to local benchmark and report slices.

## Current sources

- `benchmarks/babylon/`
- `benchmarks/aura3d/`
- `tools/compare-engines/`
- `tests/reports/comparison-babylon.json`
