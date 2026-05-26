# Agent Context Pack

Version: 1.0.0

This is the first file an AI coding agent should read when dropped into the A3D repo.

## One-Minute Summary

Aura3D / A3D is a TypeScript-first browser 3D engine and workflow SDK. It has first-party packages for engine lifecycle, math, scene graph, ECS, rendering, assets, animation, physics, controls, input, audio, scripting, product workflows, editor runtime, diagnostics, and Three.js compatibility. The root published package is `@aura3d/engine`; workspace packages also exist under `packages/*`.

A3D is not a Three.js wrapper. Three.js appears in this repo as a reference target, compatibility surface, benchmark baseline, and migration aid.

## First Commands

```sh
pnpm install
pnpm typecheck
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open the local registry:

```text
http://127.0.0.1:5180/
```

If the port is busy, use another local Vite port and keep links rooted at `/`.

## Current Route Surface

Only these local browser examples are allowed:

- root `index.html`
- `/apps/advanced-examples-gallery/#water-lab`
- `/apps/advanced-examples-gallery/#ocean-observatory`
- `/apps/advanced-examples-gallery/#reactor-post`
- `/apps/advanced-examples-gallery/#smart-city`
- `/apps/advanced-examples-gallery/#data-galaxy`
- `/apps/advanced-examples-gallery/#product-configurator`
- `/apps/advanced-examples-gallery/#robotics-lab`
- `/apps/advanced-examples-gallery/#physics-playground`
- `/apps/advanced-examples-gallery/#fog-cathedral`
- `/apps/advanced-examples-gallery/#digital-twin`
- `/apps/wow-tokyo-keyframes/`
- `/apps/wow-kira-ik-room/`
- `/apps/wow-neon-city/`
- `/apps/wow-orbital-fleet/`
- `/apps/wow-crystal-cavern/`
- `/apps/wow-robot-parade/`
- `/apps/wow-particle-vortex/`
- `/apps/wow-ocean-temple/`
- `/apps/wow-physics-arena/`
- `/apps/wow-material-cathedral/`
- `/apps/wow-astral-garden/`
- `/apps/wow-quantum-stage/`
- `/apps/wow-boombox-texture-lab/`
- `/apps/wow-avocado-pbr-study/`
- `/apps/wow-clearcoat-material-sample/`
- `/apps/wow-sheen-material-grid/`

`apps/wow-common/` is shared support code, not a standalone route. The old `examples/` tree is pruned.

## High-Value Entry Points

| Area | Public import | Source |
|---|---|---|
| Root app helpers | `@aura3d/engine` | `packages/engine/src/index.ts` |
| Direct renderer scene control | `@aura3d/engine/advanced-runtime` | `packages/engine/src/advanced-runtime/` |
| Production runtime | `@aura3d/engine/production-runtime` | `packages/engine/src/production-runtime/` |
| Rendering | `@aura3d/engine/rendering` or `@aura3d/rendering` | `packages/rendering/src/` |
| Assets | `@aura3d/engine/assets` or `@aura3d/assets` | `packages/assets/src/` |
| Animation | `@aura3d/engine/animation` or `@aura3d/animation` | `packages/animation/src/` |
| Physics | `@aura3d/engine/physics` or `@aura3d/physics` | `packages/physics/src/` |
| Controls | `@aura3d/engine/controls` or `@aura3d/controls` | `packages/controls/src/` |
| Workflows | `@aura3d/engine/workflows` or `@aura3d/workflows` | `packages/workflows/src/` |
| Three.js compatibility | `@aura3d/engine/three-compat` or `@aura3d/three-compat` | `packages/three-compat/src/` |

Check `package.json` exports and `tsconfig.base.json` paths before adding imports.

## Common Build Pattern

For most feature work:

1. Find the owning package in `packages/*/src`.
2. Read the matching docs under `docs/concepts`, `docs/rendering`, `docs/assets`, `docs/animation`, or `docs/project`.
3. Add or adjust package code.
4. Export public API through the package `src/index.ts` only if needed.
5. Add focused unit coverage under `tests/unit/<area>/`.
6. Add or update browser coverage only for canvas, route, asset, or DOM behavior.
7. Run focused tests first, then `pnpm typecheck`.
8. Update docs and evidence wording if public behavior changed.

## Evidence Rule

`tests/reports/` contains local generated evidence and is not durable source. Do not claim current parity, superiority, accepted screenshots, or production readiness from report names alone. Regenerate the relevant lane and cite the exact command or report.

## Things To Avoid

- Do not re-add `examples/` or non-allowlisted local app routes.
- Do not present A3D as a full Three.js, Unity, or Unreal replacement.
- Do not treat a screenshot or a single route as broad engine proof.
- Do not deep-import private package files from consumers unless there is an established local test-only pattern.
- Do not update generated public API docs by hand; use `pnpm verify:api-docs -- --write` when export surfaces change.
