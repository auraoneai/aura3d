# V4 Benchmarks And Validation Plan

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Benchmarks must stop being generic scaffolds. They must compare real supported behavior.

## Same-Scene Requirements

- [x] Every comparison scene uses a shared descriptor.
- [x] Every comparison scene records asset id, camera, viewport, DPR, lighting, material features, postprocess state, animation state, and unsupported features.
- [x] Aura3D, Three.js, and Babylon scenes must load the same asset class and use equivalent feature settings where the feature is supported.
- [x] Unsupported features must be listed as unsupported, not silently disabled.

## Required Comparison Scenes

- [x] Product configurator.
- [x] Architecture viewer.
- [x] Asset render.
- [x] PBR material scene.
- [x] Postprocess scene if Aura3D supports matching effects.
- [x] Large scene with LOD/culling if implemented. Evidence: `benchmarks/shared/scenes/large-scene.ts` defines the shared large-scene comparison, the Aura3D wrapper publishes LOD/batching/camera timing evidence, and `tools/external-parity-benchmarks/index.ts` requires `large-scene`.
- [x] Skinned character scene.
- [x] Morph character scene if implemented.
- [x] Particles scene.
- [x] Editor-authored startup scene.

## Artifacts

- [x] `tests/reports/v4-engine-comparison.json`.
- [x] `tests/reports/comparison-screenshots/aura3d-*.png`.
- [x] `tests/reports/comparison-screenshots/threejs-*.png`.
- [x] `tests/reports/comparison-screenshots/babylon-*.png`.
- [x] `tests/reports/comparison-diffs/*.png`.
- [x] `tests/reports/v4-example-screenshots/*.png`.
- [x] `tests/reports/external-parity-visual-quality.json`.

## Visual Quality Gate

- [x] Add a browser screenshot auditor that fails blank canvases.
- [x] Fail scenes where the primary asset occupies too little screen space.
- [x] Fail scenes where claimed real assets are missing.
- [x] Fail scenes where claimed shadows are not visible.
- [x] Fail scenes where claimed postprocess does not change pixels.
- [x] Fail scenes where the portfolio screenshot is stale.
- [x] Add manual-review notes field, but do not allow manual notes to override failed automated gates.

## Final Commands

- [x] `pnpm verify:external-parity-code` passes.
- [x] `pnpm verify:external-parity-rendering` passes.
- [x] `pnpm verify:external-parity-assets` passes.
- [x] `pnpm verify:external-parity-editor` passes.
- [x] `pnpm verify:external-parity-runtime` passes.
- [x] `pnpm verify:external-parity-examples` passes.
- [x] `pnpm verify:external-parity-benchmarks` passes.
- [ ] `pnpm verify:external-parity-visual-quality` passes. Current blocker: `tests/reports/external-parity-visual-quality.json` is `ok: false`.
- [ ] `pnpm verify:external-parity-report-freshness` passes. Current blocker: full V4 freshness must be rerun after visual-quality repair; do not rely on stale 2026-05-08 evidence.
- [ ] `pnpm verify:v4` passes. Current blocker: visual-quality and final completion gates remain blocked.
