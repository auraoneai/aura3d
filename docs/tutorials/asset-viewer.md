# Tutorial: Asset Viewer Slice

This tutorial uses the current `examples/06-asset-gltf` validation example as the asset-viewer starting point. It is a real public-API glTF loading path, not a complete production asset-review tool.

## Run The Example

Serve the repository with the same TypeScript-aware example server used by browser tests and open:

```text
/examples/06-asset-gltf/index.html
```

Focused browser verification for the asset browser path is:

```sh
pnpm exec playwright test tests/browser/asset-texture-browser.spec.ts
```

## What It Uses

- `@galileo3d/assets` for glTF loading, validation, cache behavior, and render-resource bridging.
- `@galileo3d/rendering` for the browser-visible WebGL2 texture and material path.
- Public package imports only.

## Implementation Shape

The example keeps loading separate from rendering:

```ts
const asset = await loader.load(gltfInput);
const resources = await createGLTFRenderResources(asset, { renderer });
renderer.render(resources.renderItems);
```

That separation matters because loader diagnostics should explain malformed or unsupported assets before render resources are created.

## Current Limits

- This tutorial points at a validation example, not a full product asset viewer with drag-and-drop, thumbnails, animation controls, or material-inspection panels.
- The pinned glTF corpus is still a starter corpus.
- Multi-UV render resources, decoder-enabled Meshopt corpus validation, and broad KTX2/Basis production corpus coverage remain known limits.
