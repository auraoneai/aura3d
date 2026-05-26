# V5 Material Authoring Guide

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The material authoring workflow makes PBR a product surface instead of a renderer checkbox. It must let developers inspect, compare, and apply material presets in a way that is useful for real product, asset, automotive, and architecture scenes.

## Required Material Features

The V5 material surface must include:

- A material registry with at least 50 PBR presets.
- At least 25 texture-backed materials sourced from checked-in, license-tracked assets.
- Clear material classes for metal, plastic, glass, fabric, wood, ceramic, emissive, clearcoat, sheen, specular, transmission, and normal-mapped surfaces.
- Material validation that catches missing names, invalid ranges, and incomplete texture sets.
- Browser examples and app surfaces that show materials under HDR environments.

## Developer Entry Points

- `packages/materials`
- `apps/three-compat-material-studio-pro`
- `templates/three-compat-material-authoring`
- `examples/three-compat-examples/materials-physical`

```ts
import { PBRMaterialLibrary, validateMaterialPreset } from "@aura3d/engine/materials";
import { EnvironmentRegistry } from "@aura3d/engine/environments";
```

## Quality Checklist

- Materials must not all read as one color family.
- Roughness and metallic variation must be visible.
- HDR/environment response must be visible for reflective materials.
- Texture-backed presets must retain license/provenance.
- The material app and template must use public imports only.

## Release Evidence

- `tests/reports/three-compat-material-readiness.json`
- `tests/reports/three-compat-gallery/materials/material-library.png`
- `tests/reports/three-compat-threejs-visual-parity/material-library-a3d.png`
