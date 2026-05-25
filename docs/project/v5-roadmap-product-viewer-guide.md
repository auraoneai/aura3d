# V5 Product Viewer Guide

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The product viewer is the clearest proof point for G3D V5. It must behave like a developer could ship it as a premium commerce, configurator, or technical product page, not like a rendering smoke test.

## Required Product Features

The V5 product viewer surface must include:

- A real glTF asset from the V5 registry.
- PBR materials with distinguishable metal, plastic, glass, emissive, clearcoat, roughness, and normal behavior.
- HDR environment selection.
- Camera controls suitable for product inspection.
- Part or material selection.
- Postprocess appropriate for a polished public scene.
- Screenshot evidence in the final gallery.
- Public imports only in app and template code.

## Developer API Shape

Developers should be able to start from `templates/three-compat-premium-product-viewer` or `apps/three-compat-product-studio-pro` and then replace asset ids, material presets, and environment presets without rewriting renderer internals.

```ts
import { RendererV5 } from "@galileo3d/engine/rendering";
import { V5AssetRegistry } from "@galileo3d/engine/assets";
import { PBRMaterialLibrary } from "@galileo3d/engine/materials";
import { EnvironmentRegistry } from "@galileo3d/engine/environments";
import { OrbitControlsCompat } from "@galileo3d/engine/controls";
```

## Quality Checklist

- The model must not be a plain primitive stand-in.
- The scene must show material contrast under HDR or IBL.
- The scene must include useful camera framing and controls.
- The viewer must have enough UI depth to be useful as a starting point.
- The same workflow must pass external Vite and package smoke tests.

## Release Evidence

The release evidence is:

- `apps/three-compat-product-studio-pro`
- `templates/three-compat-premium-product-viewer`
- `examples/three-compat-examples/product-configurator`
- `tests/reports/three-compat-gallery/product/premium-product-viewer.png`
- `tests/reports/three-compat-threejs-visual-parity/product-configurator-g3d.png`
- `tests/reports/three-compat-threejs-visual-parity/product-configurator-threejs.png`
- `tests/reports/three-compat-threejs-visual-parity/product-configurator-diff.png`
