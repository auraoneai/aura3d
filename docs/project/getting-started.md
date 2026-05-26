# Getting Started

Version: 1.0.0

## Install

```sh
pnpm install
```

## Run The Local App Registry

```sh
pnpm exec vite --host 127.0.0.1 --port 5180 --strictPort
```

Open:

```text
http://127.0.0.1:5180/
```

## Useful Routes

Use the root registry at `http://127.0.0.1:5180/`. It is the single allowlist for local browser examples.

Current route groups:

- ten advanced gallery demos under `/apps/advanced-examples-gallery/#...`;
- four focused Aura3D library examples under `/apps/wow-*`;
- three standard Aura3D examples under `/apps/wow-*`;
- four simple graphics examples under `/apps/wow-*`;
- three additional Aura3D examples under `/apps/wow-*`;
- eight authored showcase apps under `/apps/wow-*`.

The legacy `examples/` tree and older standalone app route folders are pruned from the current checkout.

## Minimal SDK Example

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

## Verify

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
```

Run parity/report generators when evaluating claims:

```sh
pnpm threejs-parity
pnpm superiority
```
