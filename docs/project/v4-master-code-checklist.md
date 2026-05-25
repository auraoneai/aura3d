# V4 Engine Readiness Master Code Checklist

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Truth And Scope

- [x] Failed flagship examples are quarantined under `examples/_quarantine/`.
- [x] `examples/index.html` lists only rebuilt engine-readiness V1 examples.
- [x] Broad parity and replacement claims are blocked in `docs/project/v4-engine-readiness-status.md`.
- [x] Stale V4 visual/parity reports were removed from the engine-readiness evidence path.

## Root Renderer Gate

- [x] `packages/rendering/src/RenderPipeline.ts` exists.
- [x] `packages/rendering/src/CanonicalSceneFixtures.ts` exists.
- [x] `packages/rendering/src/LightingDefaults.ts` exists.
- [x] `Renderer.renderScene`, `Renderer.renderItems`, and `Renderer.captureFrame` exist as public convenience APIs.
- [x] `tests/browser/rendering-canonical-scene.spec.ts` generates canonical, material-variant, shadow-toggle, and postprocess-toggle screenshots.
- [x] `tools/engine-readiness-visual-quality/index.ts` validates canonical screenshots.
- [x] `tools/engine-readiness-root-readiness/index.ts` validates root engine-readiness evidence.

## Asset-To-Render SDK

- [x] `packages/assets/src/loadRenderableAsset.ts` exists.
- [x] `packages/assets/src/createRenderableScene.ts` exists.
- [x] `packages/assets/src/AssetRenderDefaults.ts` exists.
- [x] `packages/assets/src/index.ts` exports the engine-readiness APIs.
- [x] `tools/engine-readiness-gltf-support/index.ts` writes the support matrix.

## Public Examples

- [x] `examples/legacy-product-viewer/`
- [x] `examples/legacy-material-studio/`
- [x] `examples/legacy-asset-viewer/`
- [x] `examples/legacy-rendering-showcase/`
- [x] Browser screenshot specs exist for all four.
- [x] `tools/engine-readiness-examples/index.ts` writes `tests/reports/engine-readiness-examples.json`.

## Package Smoke

- [x] `tools/engine-readiness-package-smoke/index.ts` runs a fresh package install/import/build smoke.
- [x] `tests/reports/engine-readiness-package-smoke.json` is generated.
- [x] `tests/reports/engine-readiness-package-smoke/screenshot.png` is generated.

## Required Commands

```sh
pnpm engine-readiness:truth
pnpm engine-readiness:root
pnpm engine-readiness:assets
pnpm engine-readiness:examples
pnpm engine-readiness:package-smoke
```
