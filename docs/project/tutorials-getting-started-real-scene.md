# Getting Started: Render A Real Scene

Version: 1.0.0

This tutorial uses the current asset and renderer APIs with a local GLB fixture.

## Run The Route Registry

```sh
pnpm install
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open a related running example:

```text
http://127.0.0.1:5180/apps/advanced-examples-gallery/#product-configurator
```

## Minimal Code

```ts
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const asset = await loadRenderableAsset("/fixtures/asset-corpus/damaged-helmet.glb");
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

renderer.render(scene.source);
scene.dispose();
renderer.dispose();
```

For a procedural renderer smoke path, create `Geometry.uvSphere`, shade it with `PBRMaterial`, render with `Renderer.create({ backend: "webgl2" })`, and inspect `diagnostics.drawCalls`. This does not require reading test files.

## Verify

```sh
pnpm advanced-gallery
```

## Boundary

This tutorial proves one local fixture workflow. It is not a broad glTF ecosystem or visual parity claim.
