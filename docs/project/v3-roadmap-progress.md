# V3 Progress

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current status: complete
Current milestone: complete
Last verified command: `pnpm v3:release`
Last verified at: `2026-05-14T09:53:40Z`

## Completed Milestones

- [x] Milestone 0 - V3 Contract And Progress Tracking
- [x] Milestone 1 - Public API Audit And Stabilization
- [x] Milestone 2 - Renderer Foundation
- [x] Milestone 3 - Asset Pipeline Foundation
- [x] Milestone 4 - Workflow SDK Package
- [x] Milestone 5 - Real App Suite
- [x] Milestone 6 - Example And Tutorial System
- [x] Milestone 7 - External Package Consumer Proof
- [x] Milestone 8 - Same-Scene Three.js Comparison
- [x] Milestone 9 - Documentation And Public Narrative
- [x] Milestone 10 - Release Gates

## Completed Milestone 4 Evidence

- [x] `packages/workflows/package.json`
- [x] `packages/workflows/src/index.ts`
- [x] `packages/workflows/src/WorkflowTypes.ts`
- [x] `packages/workflows/src/WorkflowDiagnostics.ts`
- [x] `packages/workflows/src/AssetViewerWorkflow.ts`
- [x] `packages/workflows/src/ProductConfiguratorWorkflow.ts`
- [x] `packages/workflows/src/MaterialStudioWorkflow.ts`
- [x] `packages/workflows/src/SceneShowcaseWorkflow.ts`
- [x] `packages/workflows/src/InteractiveSceneWorkflow.ts`
- [x] Workspace/root/package/tsconfig/browser/vitest aliases for `@galileo3d/workflows`
- [x] `tests/unit/workflows/asset-viewer-workflow.test.ts`
- [x] `tests/unit/workflows/product-configurator-workflow.test.ts`
- [x] `tests/unit/workflows/material-studio-workflow.test.ts`
- [x] `tests/unit/workflows/scene-showcase-workflow.test.ts`
- [x] `tests/unit/workflows/interactive-scene-workflow.test.ts`
- [x] `tools/foundation-workflows-readiness/index.ts`
- [x] Verify Milestone 4 exit command.

## Completed Milestone 5 Evidence

- [x] `apps/asset-lab` real app using `@galileo3d/workflows` asset-viewer workflow.
- [x] `apps/material-lab` real app using material-studio workflow.
- [x] `apps/scene-lab` real app using scene-showcase workflow.
- [x] `apps/game-lab` real app using interactive-scene workflow.
- [x] Shared app shell/navigation and dense product UI, not marketing pages.
- [x] Browser tests that render each app and assert non-empty UI/canvas evidence.
- [x] Readiness report for app-suite source files, tests, screenshots, and workflow usage.
- [x] Verify Milestone 5 exit command.

## Completed Milestone 6 Evidence

- [x] `examples/foundation-asset-viewer/index.html`, `main.ts`, and `README.md`.
- [x] `examples/foundation-material-studio/index.html`, `main.ts`, and `README.md`.
- [x] `examples/foundation-product-configurator/index.html`, `main.ts`, and `README.md`.
- [x] `examples/foundation-interactive-scene/index.html`, `main.ts`, and `README.md`.
- [x] `examples/foundation-game-slice/index.html`, `main.ts`, and `README.md`.
- [x] `examples/index.html` promotes V3 examples, not failed V1 output.
- [x] Tutorial docs for basic app, asset viewer, product configurator, material studio, and interactive scene.
- [x] Browser tests capture current V3 examples.
- [x] Readiness report validates public API usage, README coverage, screenshots, and no V1 proof reuse.
- [x] Verify Milestone 6 exit command.

## Completed Milestone 7 Evidence

- [x] `tools/foundation-package-smoke/index.ts`
- [x] `tools/foundation-external-consumer/index.ts`
- [x] `tests/reports/foundation-package-smoke.json`
- [x] `tests/reports/foundation-external-consumer.json`
- [x] `pnpm build` succeeds.
- [x] Packed package installs into a temp app.
- [x] Temp app imports root and subpath exports.
- [x] Temp app renders one scene.
- [x] Temp app loads one product/asset.
- [x] Temp app captures one PNG.
- [x] Temp app writes a manifest proving package import paths.
- [x] Verify Milestone 7 exit command.

## Completed Milestone 8 Evidence

- [x] Shared scene descriptors for product, material, asset, and interactive workflows.
- [x] G3D implementations for all four scenes.
- [x] Three.js implementations for all four scenes.
- [x] Browser comparison captures G3D, Three.js, and diff image for every scene.
- [x] Comparison report includes line counts, bundle estimate, runtime diagnostics, wins, and gaps.
- [x] Verify Milestone 8 exit command.

## Completed Milestone 9 Evidence

- [x] `README.md` explains supported-workflow competitor status without broad replacement claims.
- [x] `docs/project/v3-roadmap-product-positioning.md`
- [x] `docs/project/v3-roadmap-threejs-competitor-status.md`
- [x] `docs/project/v3-roadmap-supported-workflows.md`
- [x] `docs/project/v3-roadmap-known-gaps.md`
- [x] Docs link to real apps, V3 examples, package proof, and comparison reports.
- [x] Docs do not claim Unity, Unreal, or broad Three.js replacement.
- [x] Verify Milestone 9 exit command.

## Completed Milestone 10 Evidence

Milestone 10 - Release Gates

- [x] `tools/foundation-release-readiness/index.ts`
- [x] `tools/foundation-completion-audit/index.ts`
- [x] `tests/reports/foundation-release-readiness.json`
- [x] `tests/reports/foundation-completion-audit.json`
- [x] `v3:release` script runs every milestone gate in order.
- [x] Release Gate 1 supported-workflow Three.js competitor claim is validated.
- [x] Release Gate 2 limited replacement-for-supported-workflows claim is validated only if evidence supports it.
- [x] Completion audit confirms every V3 milestone and report.

## Known Gaps

- V3 remains scoped to supported workflows only.
- Public registry publishing and independent third-party reproduction are not yet proven.

## Blocked Claims

- Unity replacement.
- Unreal replacement.
- Full game engine replacement.
- Full Three.js API replacement.
- Broad Three.js replacement.
- Full glTF parity.
- Full WebGPU parity.
- Broad performance superiority.
