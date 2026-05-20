# V3 Public API Map

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This document maps the current public package surface for the V3 platform build.

V3 treats every non-private package under `packages/*` as intentional public surface if it has:

- `package.json` with `"private": true` absent.
- `src/index.ts`.
- package-level `exports["."]`.
- a TypeScript path alias in `tsconfig.base.json`.
- generated coverage in `docs/api/public-api.md`.

`@galileo3d/test-utils` is private and must not be treated as public product API.

## Foundation Packages

| Package | Role | Stability |
| --- | --- | --- |
| `@galileo3d/math` | Vectors, matrices, rays, bounds, interpolation, random helpers. | stable-foundation |
| `@galileo3d/core` | Engine loop, scheduler, diagnostics, errors, resource lifecycle. | stable-foundation |
| `@galileo3d/scene` | Scene graph, transforms, cameras, lights, renderables, serialization. | stable-foundation |
| `@galileo3d/ecs` | Entity/component runtime, systems, queries, serialization. | evolving-public |

## Runtime Subsystems

| Package | Role | Stability |
| --- | --- | --- |
| `@galileo3d/rendering` | Render device, renderer, materials, geometry, lighting, shadows, postprocess, diagnostics. | evolving-public |
| `@galileo3d/assets` | Asset manager, glTF loader, render resources, import preflight, compatibility, texture pipeline. | evolving-public |
| `@galileo3d/animation` | Clips, tracks, mixers, skeletons, state machines, IK, runtime bridges. | evolving-public |
| `@galileo3d/input` | Keyboard, pointer, gamepad, controls, picking rays, input playback. | evolving-public |
| `@galileo3d/audio` | Audio context, clips, mixer, spatial audio, scene audio bridge, effects. | evolving-public |
| `@galileo3d/physics` | Rigid bodies, shapes, collisions, world stepping, scene/ECS bridges, character/navigation helpers. | evolving-public |
| `@galileo3d/scripting` | Behaviors, decision systems, AI helpers, behavior host/registry/runtime. | evolving-public |
| `@galileo3d/debug` | Runtime diagnostics, inspectors, resource tracking, report export. | evolving-public |

## Workflow And Editor Packages

| Package | Role | Stability |
| --- | --- | --- |
| `@galileo3d/product-studio` | Product rendering workflow SDK created by V2 and carried into V3. | evolving-public |
| `@galileo3d/editor-runtime` | Editor runtime models, gizmos, picking, plugins, prefab/timeline/state helpers. | evolving-public |
| `@galileo3d/editor` | Editor package facade over editor runtime. | unstable-facade |

## Required Future Package

| Package | Role | Status |
| --- | --- | --- |
| `@galileo3d/workflows` | High-level asset viewer, product configurator, material studio, scene showcase, and interactive scene workflows. | created-milestone-4 |

## Public API Audit Rules

The V3 API audit must verify:

- Every non-private package has `src/index.ts`.
- Every non-private package exposes `exports["."]` with `types` and `import`.
- Every non-private package is documented in `docs/api/public-api.md`.
- Every non-private package has a TypeScript path alias.
- Root package subpath exports exist for public packages that ship through `@galileo3d/engine`.
- `@galileo3d/test-utils` remains private.
- `@galileo3d/product-studio` is part of the public surface.
- `@galileo3d/workflows` exists after Milestone 4 and is required for release.

## Current Gaps

- Several packages expose fixture/evidence helpers publicly; Milestone 1 records this as an intentional current risk to revisit after workflow APIs are in place.
- `@galileo3d/editor` is currently a facade over `@galileo3d/editor-runtime`; its long-term public shape is not settled.
