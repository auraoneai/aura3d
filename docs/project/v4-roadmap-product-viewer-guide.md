# V4 Product Viewer Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The product viewer workflow is the primary commercial app path for V4. It is exposed through `createG3DApp`, `workflows.productConfigurator`, `loadAsset`, `createEnvironment`, `createMaterialVariantController`, `captureScreenshot`, and `createDiagnosticsPanel`.

Required implementation surfaces:

- `packages/engine/src/index.ts`
- `packages/engine/src/G3DApp.ts`
- `packages/workflows/src/workflow-foundation/index.ts`
- `apps/product-studio-pro/`
- `examples/external-product-configurator/`
- `templates/external-parity-product-viewer/`

Release evidence:

- `tests/reports/external-parity-product-readiness.json`
- `tests/reports/v4-public-api-app-browser.json`
- `tests/reports/external-parity-external-consumer.json`
- `tests/reports/external-gallery/product/external-product-configurator.png`

Boundary: this proves the supported product-configurator workflow. It does not claim full Three.js ecosystem replacement.

