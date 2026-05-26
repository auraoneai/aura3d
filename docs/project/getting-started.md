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

- `/apps/product-configurator/`
- `/apps/asset-inspector/`
- `/apps/material-studio/`
- `/apps/architecture-viewer/`
- `/apps/character-viewer/`
- `/apps/cinematic-postprocess/`
- `/apps/threejs-parity-lab/`
- `/apps/webgpu-lab/`
- `/apps/flagship-viewer/`
- `/apps/postprocessing-bloom/`
- `/apps/postprocessing-depth-outline/`
- `/apps/webxr-interactions/`

## Minimal SDK Example

```ts
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const asset = await loadRenderableAsset("/fixtures/asset-corpus/damaged-helmet.glb");
const scene = createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

renderer.render(scene.source, scene.camera);
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
