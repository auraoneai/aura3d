# Asset Viewer

The asset viewer is a renderer-backed browser slice for loading a real external glTF/GLB model through public Aura3D asset and rendering APIs.

## Run

Open:

```text
examples/asset-viewer/index.html
```

The browser test pins a public Khronos sample model URL and verifies loader metadata plus render-resource creation:

```sh
pnpm exec playwright test tests/browser/asset-viewer-browser.spec.ts
```

## Expected Output

- A WebGL2-backed asset viewer canvas.
- Runtime state published on `window.__AURA3D_ASSET_VIEWER__`.
- Model metadata including mesh/material counts.
- Render-resource diagnostics proving the asset reaches the Aura3D rendering path.

## Current Boundary

This is a focused external-model loading proof. It does not claim broad glTF corpus parity, compressed texture parity, production material import parity, or visual parity against Three.js/Babylon.js loaders.
