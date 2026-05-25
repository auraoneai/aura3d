# V4 Asset Pipeline Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The V4 asset pipeline supports bounded glTF/GLB loading, corpus validation, compatibility diagnostics, and app-level troubleshooting. Developers should use `loadAsset`, `inspectAsset`, `createAssetDiagnostics`, `createRenderDiagnostics`, and `createCompatibilityReport` from `@galileo3d/engine`.

Required implementation surfaces:

- `packages/assets/src/V4Corpus.ts`
- `fixtures/v4/gltf-corpus/manifest.json`
- `apps/asset-studio-pro/`
- `examples/external-asset-gallery/`
- `templates/external-parity-asset-gallery/`

Release evidence:

- `tests/reports/external-parity-gltf-corpus-readiness.json`
- `tests/reports/external-parity-asset-studio-readiness.json`
- `tests/reports/external-gallery/assets/external-asset-gallery.png`
- `tests/reports/external-gallery/templates/external-parity-asset-gallery.png`

Boundary: full glTF ecosystem parity, every extension, every decoder path, and every DCC export quirk remain blocked claims.

