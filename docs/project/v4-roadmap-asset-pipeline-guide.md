# V4 Asset Pipeline Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The V4 asset pipeline supports bounded glTF/GLB loading, corpus validation, compatibility diagnostics, and app-level troubleshooting. Developers should use `loadAsset`, `inspectAsset`, `createAssetDiagnostics`, `createRenderDiagnostics`, and `createCompatibilityReport` from `@galileo3d/engine`.

Required implementation surfaces:

- `packages/assets/src/V4Corpus.ts`
- `fixtures/v4/gltf-corpus/manifest.json`
- `apps/asset-studio-pro/`
- `examples/asset-gallery-v4/`
- `templates/v4-asset-gallery/`

Release evidence:

- `tests/reports/v4-gltf-corpus-readiness.json`
- `tests/reports/v4-asset-studio-readiness.json`
- `tests/reports/v4-gallery/assets/asset-gallery-v4.png`
- `tests/reports/v4-gallery/templates/v4-asset-gallery.png`

Boundary: full glTF ecosystem parity, every extension, every decoder path, and every DCC export quirk remain blocked claims.

