# Build An Asset Gallery

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use public asset loading and diagnostics helpers for asset review workflows.

```ts
import { createAssetDiagnostics, createDiagnosticsPanel, createA3DApp, loadAsset, workflows } from "@aura3d/engine";

const app = await createA3DApp({ canvas, quality: "production" });
const asset = await loadAsset("/assets/model.glb", { type: "gltf" });
const workflow = await workflows.assetViewer({ url: "/assets/model.glb", type: "gltf" });
const render = app.renderer?.render(workflow.source, workflow.camera);
const diagnostics = createDiagnosticsPanel({
  render,
  asset: createAssetDiagnostics(asset)
});
```

Evidence:

- Example: `examples/external-asset-gallery`
- App: `apps/asset-studio-pro`
- Screenshot: `tests/reports/external-gallery/assets/external-asset-gallery.png`
- Same-scene Three.js comparison: `tests/reports/external-parity-threejs-visual-parity/asset-review-threejs.png`

Boundary: full glTF ecosystem parity remains blocked until the broader corpus and external loader gates are green.
