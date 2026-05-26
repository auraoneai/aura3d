# V5 Architecture Guide

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The architecture workflow proves that A3D V5 can handle composed scenes with scale, lighting variation, materials, controls, and screenshot evidence. It is not enough to render an isolated cube or a single imported chair.

## Required Architecture Features

Architecture examples and templates must include:

- A composed interior or exterior layout.
- Daylight and night lighting variants.
- HDR environment contribution.
- Multiple material classes, including wall, floor, glass, metal, textile, and wood-like surfaces where available.
- Camera controls suitable for walkthrough or orbit inspection.
- Postprocess where it improves the scene.
- Final screenshot evidence for day and night.

## Developer Entry Points

- `templates/three-compat-architecture-interior`
- `examples/three-compat-examples/architecture-interior`
- `apps/three-compat-scene-studio-pro`

These entry points must use public package imports and must not depend on monorepo-only fixture imports when copied outside the repository.

## Quality Checklist

- The daylight scene must communicate room shape, depth, and material differences.
- The night scene must visibly change the lighting story instead of only tinting the image.
- The camera must frame enough scene context to prove composition.
- The scene must remain compatible with the external consumer and package smoke gates.

## Release Evidence

- `tests/reports/three-compat-gallery/architecture-day/interior-daylight.png`
- `tests/reports/three-compat-gallery/architecture-night/interior-night.png`
- `tests/reports/three-compat-threejs-visual-parity/architecture-daylight-a3d.png`
- `tests/reports/three-compat-threejs-visual-parity/architecture-night-a3d.png`
