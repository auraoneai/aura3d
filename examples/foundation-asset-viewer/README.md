# Asset Viewer V3

This example shows the recommended public path for loading and rendering a glTF asset with G3D.

It uses `createAssetViewerWorkflow()` from `@galileo3d/workflows`, which wraps the asset loader, render resource creation, camera framing, lighting, shadows, postprocess, and diagnostics into one app-ready result.

Run it through the repo dev server or browser tests:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-asset-viewer"
```

The example intentionally uses the V3 product-camera fixture rather than the old V1 screenshots.
