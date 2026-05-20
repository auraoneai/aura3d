# Build A Product Viewer

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use the public SDK root. Do not import monorepo paths.

```ts
import { createEnvironment, createG3DApp, workflows } from "@galileo3d/engine";

const app = await createG3DApp({ canvas, quality: "production" });
const environment = createEnvironment({ target: "studio-softbox-hdr" });
const workflow = await workflows.productConfigurator({
  asset: {
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/BoomBox/glTF-Binary/BoomBox.glb",
    manifestUrl: "/product/manifest.json"
  },
  materialMode: "asset",
  lighting: "catalog-softbox",
  camera: "front-three-quarter"
});

app.renderer?.render(workflow.source, workflow.camera);
```

Evidence:

- Example: `examples/product-configurator-v4`
- App: `apps/product-studio-pro`
- Screenshot: `tests/reports/v4-gallery/product/product-configurator-v4.png`
- Same-scene Three.js comparison: `tests/reports/v4-threejs-visual-parity/product-configurator-threejs.png`

Boundary: this is a supported product-visualization workflow, not a full Three.js API replacement.
