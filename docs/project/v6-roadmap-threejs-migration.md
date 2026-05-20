# Three.js Migration And Comparison

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


G3D V6 is being built as a competitor to Three.js, not a wrapper around Three.js.

```text
G3D product path = G3D renderer, G3D loader, G3D controls, G3D viewer.
Three.js path = external baseline for comparison and migration documentation.
```

Three.js must not be used to render G3D product output.

## Comparison Artifact

V7 writes the flagship comparison here:

```text
tests/reports/v7/product-viewer/g3d-product-viewer.png
tests/reports/v7/product-viewer/threejs-product-viewer.png
tests/reports/v7/product-viewer/comparison.png
tests/reports/v7/product-viewer/product-viewer-report.json
```

The artifact uses the same product GLB and HDRI. It records deltas instead of claiming exact equality.

## Migration Shape

The intended developer migration flow is:

```ts
// Three.js-style app responsibility: create renderer, load asset, set environment, add controls.
// G3D V6 product flow:
const viewer = await createProductViewer({
  canvas,
  asset: await loadGltfScene("/assets/product.glb"),
  environment: await loadHdrEnvironment("/hdr/studio.hdr"),
  camera: { preset: "product-hero", orbit: true },
  lighting: { ibl: true, shadows: true },
  postprocess: { toneMapping: "filmic", bloom: true, fxaa: true }
});

viewer.render();
```

## Known Gaps

Do not claim broad Three.js replacement yet. Current known gaps include full contact shadows, exact PMREM parity, broader material-extension visual parity, and production WebGPU parity.
