# V4 Material Authoring Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Material authoring in V4 is built around physical material inspection, environment comparison, and deterministic readiness reports. Use `workflows.materialStudio` from `@aura3d/engine` for application code and `apps/material-studio-pro/` for the pro app surface.

Required implementation surfaces:

- `packages/rendering/src/materials/PhysicalMaterial.ts`
- `packages/rendering/src/materials/MaterialExtensions.ts`
- `apps/material-studio-pro/`
- `examples/external-material-studio/`
- `templates/external-parity-material-studio/`

Release evidence:

- `tests/reports/external-parity-material-studio-readiness.json`
- `tests/reports/external-parity-material-readiness.json`
- `tests/reports/external-gallery/materials/external-material-studio.png`
- `tests/reports/external-gallery/templates/external-parity-material-studio.png`

Boundary: scan-texture realism and full DCC material round-tripping remain outside the V4 release claim.

