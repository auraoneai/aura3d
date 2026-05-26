# V3 Public API Map

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This document maps the current public package surface for the V3 platform build.

V3 treats every non-private package under `packages/*` as intentional public surface if it has:

- `package.json` with `"private": true` absent.
- `src/index.ts`.
- package-level `exports["."]`.
- a TypeScript path alias in `tsconfig.base.json`.
- generated coverage in `docs/api/public-api.md`.

`@aura3d/test-utils` is private and must not be treated as public product API.

## Foundation Packages

| Package | Role | Stability |
| --- | --- | --- |
| `@aura3d/math` | Vectors, matrices, rays, bounds, interpolation, random helpers. | stable-foundation |
| `@aura3d/core` | Engine loop, scheduler, diagnostics, errors, resource lifecycle. | stable-foundation |
| `@aura3d/scene` | Scene graph, transforms, cameras, lights, renderables, serialization. | stable-foundation |
| `@aura3d/ecs` | Entity/component runtime, systems, queries, serialization. | evolving-public |

## Runtime Subsystems

| Package | Role | Stability |
| --- | --- | --- |
| `@aura3d/rendering` | Render device, renderer, materials, geometry, lighting, shadows, postprocess, diagnostics. | evolving-public |
| `@aura3d/controls` | Orbit, trackball, transform, pointer-lock, map, and interaction control helpers. | evolving-public |
| `@aura3d/environments` | Environment map descriptors, HDR readiness helpers, and renderer environment presets. | evolving-public |
| `@aura3d/materials` | Material presets, variant helpers, PBR material descriptors, and material workflow utilities. | evolving-public |
| `@aura3d/assets` | Asset manager, glTF loader, render resources, import preflight, compatibility, texture pipeline. | evolving-public |
| `@aura3d/animation` | Clips, tracks, mixers, skeletons, state machines, IK, runtime bridges. | evolving-public |
| `@aura3d/input` | Keyboard, pointer, gamepad, controls, picking rays, input playback. | evolving-public |
| `@aura3d/audio` | Audio context, clips, mixer, spatial audio, scene audio bridge, effects. | evolving-public |
| `@aura3d/physics` | Rigid bodies, shapes, collisions, world stepping, scene/ECS bridges, character/navigation helpers. | evolving-public |
| `@aura3d/scripting` | Behaviors, decision systems, AI helpers, behavior host/registry/runtime. | evolving-public |
| `@aura3d/debug` | Runtime diagnostics, inspectors, resource tracking, report export. | evolving-public |

## Workflow And Editor Packages

| Package | Role | Stability |
| --- | --- | --- |
| `@aura3d/product-studio` | Product rendering workflow SDK created by V2 and carried into V3. | evolving-public |
| `@aura3d/apps` | Public app/workflow entrypoints for asset viewer, material studio, product configurator, scene showcase, and interactive scenes. | evolving-public |
| `@aura3d/create-aura3d` | Project scaffolding CLI and template manifest helpers. | evolving-public |
| `@aura3d/engine-runtime` | Engine runtime package consumed by the root `@aura3d/engine` facade. | evolving-public |
| `@aura3d/three-compat` | Three.js compatibility adapters, migration helpers, and compatibility reports. | evolving-public |
| `@aura3d/editor-runtime` | Editor runtime models, gizmos, picking, plugins, prefab/timeline/state helpers. | evolving-public |
| `@aura3d/editor` | Editor package facade over editor runtime. | unstable-facade |

## Required Future Package

| Package | Role | Status |
| --- | --- | --- |
| `@aura3d/workflows` | High-level asset viewer, product configurator, material studio, scene showcase, and interactive scene workflows. | created-milestone-4 |

## Public API Audit Rules

The V3 API audit must verify:

- Every non-private package has `src/index.ts`.
- Every non-private package exposes `exports["."]` with `types` and `import`.
- Every non-private package is documented in `docs/api/public-api.md`.
- Every non-private package has a TypeScript path alias.
- Root package subpath exports exist for public packages that ship through `@aura3d/engine`.
- `@aura3d/test-utils` remains private.
- `@aura3d/product-studio` is part of the public surface.
- `@aura3d/workflows` exists after Milestone 4 and is required for release.

## Current Gaps

- Several packages expose fixture/evidence helpers publicly; Milestone 1 records this as an intentional current risk to revisit after workflow APIs are in place.
- `@aura3d/editor` is currently a facade over `@aura3d/editor-runtime`; its long-term public shape is not settled.
