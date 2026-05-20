# V4 Material Authoring Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Material authoring in V4 is built around physical material inspection, environment comparison, and deterministic readiness reports. Use `workflows.materialStudio` from `@galileo3d/engine` for application code and `apps/material-studio-pro/` for the pro app surface.

Required implementation surfaces:

- `packages/rendering/src/materials/PhysicalMaterial.ts`
- `packages/rendering/src/materials/MaterialExtensions.ts`
- `apps/material-studio-pro/`
- `examples/material-studio-v4/`
- `templates/v4-material-studio/`

Release evidence:

- `tests/reports/v4-material-studio-readiness.json`
- `tests/reports/v4-material-readiness.json`
- `tests/reports/v4-gallery/materials/material-studio-v4.png`
- `tests/reports/v4-gallery/templates/v4-material-studio.png`

Boundary: scan-texture realism and full DCC material round-tripping remain outside the V4 release claim.

