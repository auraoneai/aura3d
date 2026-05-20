# Supported V3 Workflows

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This document lists the workflow surfaces that V3 currently builds and verifies.

## Asset Viewing

Public API:

- `createAssetViewerWorkflow()` from `@galileo3d/workflows`.

Evidence:

- App: `apps/asset-lab`.
- Example: `examples/asset-viewer-v3`.
- Screenshots: `tests/reports/v3-app-suite/asset-lab-default.png`, `tests/reports/v3-examples/asset-viewer-v3.png`.

## Product Configuration

Public API:

- `createProductConfiguratorWorkflow()` from `@galileo3d/workflows`.
- Product Studio APIs from `@galileo3d/product-studio`.

Evidence:

- App: `apps/product-studio`.
- Example: `examples/product-configurator-v3`.
- Package consumer proof: `tests/reports/v3-external-consumer.json`.

## Material Review

Public API:

- `createMaterialStudioWorkflow()` from `@galileo3d/workflows`.

Evidence:

- App: `apps/material-lab`.
- Example: `examples/material-studio-v3`.
- Screenshots: `tests/reports/v3-app-suite/material-lab-default.png`, `tests/reports/v3-examples/material-studio-v3.png`.

## Scene Showcase

Public API:

- `createSceneShowcaseWorkflow()` from `@galileo3d/workflows`.

Evidence:

- App: `apps/scene-lab`.
- Workflow unit tests: `tests/unit/workflows/scene-showcase-workflow.test.ts`.
- Same-scene comparison: `tests/reports/v3-threejs-comparison/scene` is represented by product/material procedural scenes and the report JSON.

## Interactive Viewport Slice

Public API:

- `createInteractiveSceneWorkflow()` from `@galileo3d/workflows`.

Evidence:

- App: `apps/game-lab`.
- Examples: `examples/interactive-scene-v3`, `examples/game-slice-v3`.
- Same-scene comparison: `tests/reports/v3-threejs-comparison/interactive-g3d.png`.

## Required Gates

```sh
pnpm v3:workflows
pnpm v3:apps
pnpm v3:examples
pnpm v3:package
pnpm v3:compare-threejs
```
