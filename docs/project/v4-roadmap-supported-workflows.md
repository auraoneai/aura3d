# V4 Supported Workflows

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Product Configurator

- API: `workflows.productConfigurator`
- App: `apps/product-studio-pro`
- Example: `examples/product-configurator-v4`
- Evidence: `tests/reports/v4-product-readiness.json`

## Asset Review

- API: `workflows.assetViewer`, `loadAsset`, `createAssetDiagnostics`
- App: `apps/asset-studio-pro`
- Example: `examples/asset-gallery-v4`
- Evidence: `tests/reports/v4-asset-studio-readiness.json`

## Material Studio

- API: `workflows.materialStudio`
- App: `apps/material-studio-pro`
- Example: `examples/material-studio-v4`
- Evidence: `tests/reports/v4-material-studio-readiness.json`

## Interior / Scene Review

- API: `workflows.sceneShowcase`
- App: `apps/scene-studio-pro`
- Example: `examples/interior-scene-v4`
- Evidence: `tests/reports/v4-scene-readiness.json`

## Character / Animation Preview

- App: `apps/animation-studio-pro`
- Example: `examples/character-viewer-v4`
- Evidence: `tests/reports/v4-character-readiness.json`

## Lightweight Interactive Scene

- API: `workflows.interactiveScene`
- App: `apps/interactive-showcase-pro`
- Example: `examples/interactive-showcase-v4`
- Evidence: `tests/reports/v4-interactive-readiness.json`

## Install And Ship

- API/runtime package: `@galileo3d/engine`
- Template: `templates/v4-product-viewer`
- Scaffolder: `@galileo3d/engine/create-g3d`
- Evidence: `tests/reports/v4-package-smoke.json`, `tests/reports/v4-external-consumer.json`
