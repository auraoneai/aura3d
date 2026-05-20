# Tutorial: Asset Viewer V3

This tutorial maps to `examples/asset-viewer-v3`. It is the current public API path for loading a glTF asset and rendering it inside a browser app.

## Core API

```ts
import { createAssetViewerWorkflow } from "@galileo3d/workflows";

const workflow = await createAssetViewerWorkflow({
  url: `${location.origin}/fixtures/v3/assets/product-camera/product-camera.gltf`,
  camera: "auto-frame",
  lighting: "studioProduct",
  shadows: true,
  postprocess: "product-default"
});
```

Render `workflow.source` with `Renderer.render(workflow.source, workflow.camera)`.

## What The Workflow Covers

- glTF loading and diagnostics.
- Render-resource creation for meshes, materials, and textures.
- Auto-framed camera policy.
- Studio lighting, shadows, and postprocess.
- Disposal through `workflow.dispose()`.

## Verification

```sh
pnpm exec playwright test tests/browser/v3-examples.spec.ts -g "asset-viewer-v3"
```

The screenshot proof is written under `tests/reports/v3-examples/`.
