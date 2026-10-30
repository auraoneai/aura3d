# Aura3D And Threlte

Version: 4.6.2

## What you get with Aura3D

- Typed, hashed, licensed assets: `model(assets.robot)` is a generated key, and in production a model without a valid hash does not draw.
- `looks.preset(id)`: HDRI lighting, a shadow-casting key light, grade and post effects in one call.
- A game kit (`@aura3d/engine/game`): HUD, touch controls, session flow, an audio cue bank, a fixed-step loop and seeded replay.
- Agent docs in every new project: `llms.txt`, 14 skills and compiled recipes.
- `aura3d check-deploy` for the build output, asset manifest and hashes, with licence and quality gates under `--release`.

Capability status and code paths: [`aura3d-capability-audit.md`](aura3d-capability-audit.md).

Use Aura3D when the agent should write framework-neutral TypeScript against a
stable API and asset CLI.

Use Threlte when Svelte component-native 3D authoring is the primary product
requirement.

Aura3D can sit beside Svelte apps through normal JavaScript integration, but it
does not claim a Svelte-native component layer.
