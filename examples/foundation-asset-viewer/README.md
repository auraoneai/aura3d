# Asset Viewer Foundation

This example shows the recommended public path for loading and rendering a glTF asset with A3D.

It uses `createAssetViewerWorkflow()` from `@aura3d/workflows`, which wraps the asset loader, render resource creation, camera framing, lighting, shadows, postprocess, and diagnostics into one app-ready result.

Run it through the repo dev server or browser tests:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-asset-viewer"
```

The example intentionally uses the Foundation product-camera fixture rather than the old Legacy screenshots.
