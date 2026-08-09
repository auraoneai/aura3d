# Asset Viewer Source Fixture

> The public route entry point was removed for Aura3D 2.0. This lower-level
> loader/inspector source intentionally accepts custom fixture URLs and remains
> available to asset, compression, animation, drag/drop, and renderer contract
> tests through `/tests/fixtures/asset-viewer/`. It is not the typed public asset
> workflow or a release gallery example.

The asset viewer is a renderer-backed browser slice for loading a real external glTF/GLB model through public Aura3D asset and rendering APIs.

## Run

Use the internal browser host:

```text
/tests/fixtures/asset-viewer/index.html
```

The browser tests use checked-in/local fixtures and verify loader metadata plus render-resource creation:

```sh
pnpm exec playwright test tests/browser/asset-viewer-browser.spec.ts
```

## Expected Output

- A WebGL2-backed asset viewer canvas.
- Runtime state published on `window.__AURA3D_ASSET_VIEWER__`.
- Model metadata including mesh/material counts.
- Render-resource diagnostics proving the asset reaches the Aura3D rendering path.

## Current Boundary

This is an internal focused loader contract. It does not claim broad glTF corpus parity, typed public asset authoring, production material import parity, or visual parity against Three.js/Babylon.js loaders.
