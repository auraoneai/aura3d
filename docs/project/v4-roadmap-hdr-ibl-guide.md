# V4 HDR And IBL Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 HDR and IBL support is implemented through the renderer color-management, HDR target, tone-mapping, BRDF LUT, PMREM, and environment-pipeline modules. Product apps should select public environment presets through `createEnvironment` and workflow options rather than importing renderer internals.

Required implementation surfaces:

- `packages/rendering/src/ColorManagement.ts`
- `packages/rendering/src/HDRRenderPipeline.ts`
- `packages/rendering/src/ToneMapping.ts`
- `packages/rendering/src/EnvironmentPipeline.ts`
- `packages/rendering/src/IBL.ts`
- `packages/rendering/src/PMREM.ts`

Release evidence:

- `tests/reports/external-parity-hdr-readiness.json`
- `tests/reports/external-parity-ibl-readiness.json`
- `tests/reports/external-parity-visual-quality.json`
- `tests/reports/external-parity-screenshot-gallery.json`

Boundary: V4 proves bounded browser HDR/IBL behavior for supported workflows, not offline-renderer parity.

