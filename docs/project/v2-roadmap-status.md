# V2 Status

> Historical note: This V2 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V2 is build-first. The rejected V1 screenshots are not baselines and are not reused:

- `tests/reports/legacy-product-viewer/product-viewer.png`
- `tests/reports/legacy-material-studio/material-studio.png`
- `tests/reports/legacy-asset-viewer/asset-viewer.png`
- `tests/reports/legacy-rendering-showcase/rendering-showcase.png`

The product target is `G3D Product Studio V1`: a local ecommerce/catalog product-rendering studio backed by generated glTF product assets, a public `@galileo3d/product-studio` package, and a usable browser app in `apps/product-studio`.

Current status: historical baseline. V2 established the product-asset-pipeline direction and claim-control discipline, but current renderer, parity, and go-to-market decisions now live in the V9 roadmap set under `docs/project/v9-roadmap-*.md`.

Build outputs:

- Product fixtures: `fixtures/v2/products/{camera-kit,speaker,watch}`
- SDK package: `packages/product-studio`
- Browser app: `apps/product-studio`
- Asset tests: `tests/assets/product-studio-product-assets.test.ts`
- SDK tests: `tests/unit/product-studio`
- Browser evidence: `tests/browser/product-studio-app.spec.ts`
- Reports: `tests/reports/v2-*`
