# V4 Supported Workflows

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Product Configurator

- API: `workflows.productConfigurator`
- App: `apps/product-studio-pro`
- Example: `examples/external-product-configurator`
- Evidence: `tests/reports/external-parity-product-readiness.json`

## Asset Review

- API: `workflows.assetViewer`, `loadAsset`, `createAssetDiagnostics`
- App: `apps/asset-studio-pro`
- Example: `examples/external-asset-gallery`
- Evidence: `tests/reports/external-parity-asset-studio-readiness.json`

## Material Studio

- API: `workflows.materialStudio`
- App: `apps/material-studio-pro`
- Example: `examples/external-material-studio`
- Evidence: `tests/reports/external-parity-material-studio-readiness.json`

## Interior / Scene Review

- API: `workflows.sceneShowcase`
- App: `apps/scene-studio-pro`
- Example: `examples/external-interior-scene`
- Evidence: `tests/reports/external-parity-scene-readiness.json`

## Character / Animation Preview

- App: `apps/animation-studio-pro`
- Example: `examples/external-character-viewer`
- Evidence: `tests/reports/external-parity-character-readiness.json`

## Lightweight Interactive Scene

- API: `workflows.interactiveScene`
- App: `apps/interactive-showcase-pro`
- Example: `examples/external-interactive-showcase`
- Evidence: `tests/reports/external-parity-interactive-readiness.json`

## Install And Ship

- API/runtime package: `@galileo3d/engine`
- Template: `templates/external-parity-product-viewer`
- Scaffolder: `@galileo3d/engine/create-g3d`
- Evidence: `tests/reports/external-parity-package-smoke.json`, `tests/reports/external-parity-external-consumer.json`
