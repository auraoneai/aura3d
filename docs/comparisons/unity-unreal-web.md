# Aura3D And Unity/Unreal Web Workflows

Version: 4.6.2

## What you get with Aura3D

- Typed, hashed, licensed assets: `model(assets.robot)` is a generated key, and in production a model without a valid hash does not draw.
- `looks.preset(id)`: HDRI lighting, a shadow-casting key light, grade and post effects in one call.
- A game kit (`@aura3d/engine/game`): HUD, touch controls, session flow, an audio cue bank, a fixed-step loop and seeded replay.
- Agent docs in every new project: `llms.txt`, 14 skills and compiled recipes.
- `aura3d check-deploy` for the build output, asset manifest and hashes, with licence and quality gates under `--release`.

Capability status and code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md).

Use Aura3D for browser-native scenes that an AI coding agent can edit as
TypeScript source with typed asset refs and static deployment checks.

Use Unity or Unreal when the project needs a full editor, native runtime,
large-scale game tooling, marketplace integrations, or an established studio
pipeline.

Aura3D is not positioned as a Unity or Unreal replacement.
