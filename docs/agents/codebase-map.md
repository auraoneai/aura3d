# Codebase Map

Read this map with `llms.txt` and `docs/agents/claims-and-boundaries.md`.
Agents normally write against the public root package, not renderer internals.
When a desired example needs production renderer features that the root API does
not expose, the correct next step is a library task, not a primitive workaround.

| Area | Path | Purpose |
|---|---|---|
| Public root API | `packages/engine/src/index.ts` | Public exports from `@aura3d/engine`, including `createAuraApp`, `model`, `scene`, typed assets, materials, effects, timelines, diagnostics, and limited root WebGL rendering |
| Agent API internals | `packages/engine/src/agent-api/` | Implementation for scene descriptors, model/camera/lights/materials/effects/timeline/interactions/diagnostics/screenshots. Public examples may import only exported root APIs. |
| Production runtime | `packages/engine/src/production-runtime/` | Higher-capability renderer/runtime modules, PBR paths, typed GLB actor plumbing, and production presets. These are not proof of root API capability until bridged and browser-tested through `@aura3d/engine`. |
| Rendering internals | `rendering/src/` | PBR/material/postprocess/runtime rendering implementation details. Do not import these in public examples. |
| Asset CLI | `packages/aura3d-cli/src/` | Manifest, add, validate, typegen, thumbnails, doctor, deploy checks, agent onboarding |
| React adapter | `packages/react/src/` | Thin React wrapper over the same core scene concepts |
| Scaffolder | `packages/create-aura3d/` | `product-viewer`, `cinematic-scene`, `mini-game` templates |
| Starter examples | `apps/hello-world-typed-asset/`, `apps/material-lighting/`, `apps/camera-path/` | Live API proof routes |
| Agent docs | `docs/agents/` and `llms.txt` | Agent-readable instructions and anti-hallucination rules |
| Legacy archive | `archive/legacy-ai-runtime/` | Historical pre-cutover work, not active product surface |

## Boundary Checks

- Root capability claims require a browser test that imports only
  `@aura3d/engine`, mounts the route, captures pixels, and verifies the subject.
- Production runtime capability claims require the same proof through a public
  bridge before they can appear in public examples.
- Asset claims require `aura.assets.json`, generated `src/aura-assets.ts`,
  durable provenance, source validation, and typed `model(assets.x)` use.
- Game claims require engine-owned game kits and input tests for the relevant
  genre. Route-local physics/controllers are prototype evidence only.
