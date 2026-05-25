# V3 Status

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Historical status: superseded by V9.

V3 was the long-running plan to turn G3D into a credible high-end Three.js competitor for supported browser 3D workflows. It is now retained as history; current parity execution is tracked by `docs/project/v9-roadmap-status.md` and `docs/project/v9-roadmap-parity-matrix.md`.

G3D is **not** currently a Unity replacement, Unreal replacement, full game engine replacement, full Three.js API replacement, full glTF parity implementation, or full WebGPU parity implementation.

The target product is:

**G3D Web: a TypeScript-first browser 3D SDK and toolchain for product visualization, asset viewers, configurators, interactive scenes, material workflows, and lightweight web games.**

V3 is not complete until `pnpm v3:release` passes. Passing one app, one renderer test, one package smoke, one report, or one screenshot is progress only.

## Historical Execution Rule

Work starts at the first incomplete milestone in `docs/project/v3-roadmap-product-workflow-plan.md`, updates `docs/project/v3-roadmap-progress.md`, and continues until the release gate passes or a real blocker is recorded.

## Current Product Shape

- Renderer foundation: existing `packages/rendering`.
- Asset pipeline: existing `packages/assets`.
- Product workflow seed: existing `packages/product-studio` and `apps/product-studio`.
- Required next platform package: `packages/workflows`.
- Required next apps: `apps/asset-lab`, `apps/material-lab`, `apps/scene-lab`, `apps/game-lab`.
- Required final comparison: same-scene G3D vs Three.js under `benchmarks/foundation`.

## Completion Standard

V3 requires code, tests, reports, screenshots/artifacts, external package proof, docs, and same-scene Three.js comparisons. Any missing row in the artifact matrix means the project is still in progress.
