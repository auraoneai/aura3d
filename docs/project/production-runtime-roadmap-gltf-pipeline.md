# glTF Pipeline

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 loads real pinned GLB assets from `fixtures/asset-corpus/manifest.json`. The browser-safe public package path is:

```ts
import { loadV6GLTFRenderPipeline } from "@aura3d/engine/assets/browser";
```

The glTF pipeline extracts render resources and metadata for mesh count, primitive count, materials, textures, images, animations, skins, morph targets, material features, texture slots, and extensions used. The renderer proof must include the asset id and source URI so a screenshot can be traced back to a real imported file.

Primary evidence:

- `tests/reports/production-runtime-gltf-render-readiness.json`
- `tests/reports/production-runtime-asset-readiness.json`
