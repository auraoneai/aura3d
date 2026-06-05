# Getting Started

Version: 1.0.5

## Install

```sh
pnpm install
```

## Run The Local App Registry

```sh
pnpm exec vite --host 127.0.0.1 --port 5181 --strictPort
```

Open:

```text
http://127.0.0.1:5181/
```

## Useful Routes

Use the root registry at `http://127.0.0.1:5181/`. It is the single allowlist for local browser examples.

Current route groups:

- ten advanced gallery demos under `/apps/advanced-examples-gallery/#...`;
- four focused Aura3D library examples under `/apps/wow-*`;
- three standard Aura3D examples under `/apps/wow-*`;
- four simple graphics examples under `/apps/wow-*`;
- three additional Aura3D examples under `/apps/wow-*`;
- six WebGPU examples under `/apps/wow-webgpu-*`;
- eight authored showcase apps under `/apps/wow-*`.

The legacy `examples/` tree and older standalone app route folders are pruned from the current checkout.

## Run The Marketing Site

The local marketing app embeds real routes from the root registry. Start the registry on port `5181`, then run:

```sh
cd marketing
npm run dev
```

Marketing route embeds use `data-route`, `data-demo`, and `data-quality="marketing"` attributes. The loader only starts the hero eagerly, lazy-loads below-fold stages, and limits concurrent iframe startup so heavy GLB/HDR routes do not compete with every other embedded route. See [Marketing Site](marketing-site.md).

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

WebGL2 remains the default quick-start backend. WebGPU examples are available from the root registry on browsers/devices that expose WebGPU; unsupported browsers should show an explicit unsupported panel instead of a blank route.

## Verify

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
```

Run parity/report generators when evaluating claims:

```sh
pnpm webgpu
```
