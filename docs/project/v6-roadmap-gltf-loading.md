# GLTF Loading In V6

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The public V6 asset entrypoint is:

```ts
import { loadGltfScene } from "@galileo3d/engine/v6";

const scene = await loadGltfScene({
  url: "/fixtures/v6/assets/corpus/damaged-helmet.glb",
  assetId: "damaged-helmet",
  assetName: "Damaged Helmet",
  materialVariant: "optional-variant-name",
  sceneIndex: 0
});
```

`loadGltfScene()` returns a renderable scene object with:

- imported GLTF asset data
- render resources
- metadata
- renderer input generation
- disposal

## Metadata

V6 GLTF metadata includes:

- meshes, primitives, vertices, and indices
- materials, textures, and images
- animations, skins, and morph targets
- texture slots and material features
- extensions used and required
- unsupported optional extensions
- actionable warnings

Unsupported required extensions fail load. Unsupported optional extensions are surfaced as metadata warnings so product code can show the gap instead of hiding it.

## Selection Support

The V6 pipeline threads through:

- `materialVariant`
- `sceneIndex`
- `sceneName`

This allows developer apps to choose GLTF material variants and scenes through the public SDK.

## Known Gaps

Material and animation data may be imported before a workflow fully exercises it visually. Do not claim animation, skinning, morph, transmission, or volume parity without a browser artifact proving that workflow.
