# V3 API Stability

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V3 uses explicit stability labels so the project can grow without pretending every export is final.

## Stability Labels

- `stable-foundation`: core API should remain compatible unless there is a deliberate major change.
- `evolving-public`: intended for users, but still allowed to change during V3 before release gates.
- `unstable-facade`: publicly exported today, but the final shape is not settled.
- `internal`: must not be exported from package entrypoints.
- `test-private`: only for tests and private packages.

## Current Stability Map

| Package | Stability | Notes |
| --- | --- | --- |
| `@galileo3d/math` | stable-foundation | Math types and primitives are foundational. |
| `@galileo3d/core` | stable-foundation | Engine loop, diagnostics, scheduling, and resource lifecycle. |
| `@galileo3d/scene` | stable-foundation | Scene graph and camera/light/renderable types. |
| `@galileo3d/ecs` | evolving-public | Runtime ECS is public but still needs workflow-level validation. |
| `@galileo3d/rendering` | evolving-public | Core renderer API is public; advanced features remain under V3 validation. |
| `@galileo3d/assets` | evolving-public | Asset loading is public; supported glTF matrix must be kept honest. |
| `@galileo3d/animation` | evolving-public | Public animation runtime, still needs app-level proof. |
| `@galileo3d/input` | evolving-public | Public input/control runtime, still needs Game Lab proof. |
| `@galileo3d/audio` | evolving-public | Public audio runtime, still needs Game Lab proof. |
| `@galileo3d/physics` | evolving-public | Public physics runtime, still needs Game Lab proof. |
| `@galileo3d/scripting` | evolving-public | Public scripting helpers, still needs interactive workflow proof. |
| `@galileo3d/debug` | evolving-public | Public diagnostics helpers for developer tooling. |
| `@galileo3d/product-studio` | evolving-public | Real workflow seed from V2. |
| `@galileo3d/workflows` | evolving-public | High-level V3 workflow SDK for supported Three.js-competitor use cases. |
| `@galileo3d/editor-runtime` | evolving-public | Editor/runtime bridge for authored scenes. |
| `@galileo3d/editor` | unstable-facade | Facade package needs a final product decision later. |
| `@galileo3d/test-utils` | test-private | Private and not part of public product API. |

## API Change Rules During V3

- Do not remove public exports without updating this document and `docs/api/public-api.md`.
- Do not expose app-only code from public package entrypoints.
- Do not expose test-only helpers from public package entrypoints.
- Fixture/evidence helpers already exposed are tolerated during Milestone 1 but must be reviewed before release.
- New workflow APIs must be exported from `@galileo3d/workflows` once Milestone 4 creates the package.
- Public docs must use package entrypoints, not deep private source imports.

## Release Gate Requirement

Before `pnpm v3:release` can pass, the API audit must show:

- Public packages have entrypoints and docs coverage.
- Private packages remain private.
- Root exports and package subpath exports match the documented public packages.
- Public examples/apps import public package entrypoints.
