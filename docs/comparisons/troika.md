# Aura3D And Troika

Version: 4.3.7

## What you get with Aura3D

- Typed, hashed, licensed assets: `model(assets.robot)` is a generated key, and in production a model without a valid hash does not draw.
- `looks.preset(id)`: HDRI lighting, a shadow-casting key light, grade and post effects in one call.
- A game kit (`@aura3d/engine/game`): HUD, touch controls, session flow, an audio cue bank, a fixed-step loop and seeded replay.
- Agent docs in every new project: `llms.txt`, 14 skills and compiled recipes.
- `aura3d check-deploy` for the build output, asset manifest and hashes, with licence and quality gates under `--release`.

Capability status and code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md).

Use Aura3D when the main need is a stable scene API and asset/deploy workflow
for AI coding agents.

Use Troika when the project specifically needs focused helpers such as
high-quality text rendering inside an existing renderer or framework.

Aura3D keeps the public surface small while still allowing focused helper
libraries where they are useful.
