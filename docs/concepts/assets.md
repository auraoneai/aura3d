# Assets

Version: `0.1.0-alpha.0`

The asset system loads, validates, inspects, caches, and converts external files into renderable Aura3D resources. The primary package is `@aura3d/engine/assets`.

## Package Surface

Core public exports include:

- `GLTFLoader`, `OBJLoader`, texture loaders, image/audio/shader/material loaders;
- `AssetManager`, `AssetRegistry`, `AssetCache`, `AssetHandle`;
- `LoadContext`, `ImportPipeline`, import preflight utilities;
- glTF inspection and compatibility reports;
- Draco/Meshopt decoder hooks and KTX2/Basis transcode helpers;
- `createGLTFRenderResources`, `loadRenderableAsset`, and `createRenderableScene`;
- V4/V5/V6/V8/V9 asset corpus and diagnostics helpers.

## Loading Path

For a developer-facing app, prefer the high-level helpers first:

```ts
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";

const asset = await loadRenderableAsset("/assets/product.glb", { type: "gltf" });
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});
```

Use `GLTFLoader` directly when you need lower-level parsing, diagnostics, or custom render-resource conversion.

## Render-Resource Boundary

Asset loading and rendering are intentionally separate:

- asset loaders parse, validate, and inspect external data;
- render-resource conversion creates geometry, material, texture, animation, and camera inputs;
- renderers submit those resources to WebGL2/WebGPU-facing backends.

This separation keeps import diagnostics testable without requiring a live GPU context.

## Current Strengths

- checked glTF/GLB loading and inspection;
- product-scene and canonical-scene render-resource conversion;
- material extension diagnostics;
- texture metadata and bounded compressed texture paths;
- HDR/EXR/KTX2 loader hooks;
- OBJ and MTL loader coverage;
- route evidence for variants, compression, material extensions, KTX2, instancing, and animation.

## Boundaries

The checked asset corpus is not the entire glTF ecosystem. Do not imply:

- complete Khronos corpus parity;
- complete Blender/exporter round-trip support;
- production texture-compression coverage across all GPUs;
- full material-extension visual parity;
- broad commercial asset compatibility without per-asset validation.

When documenting an asset claim, cite the fixture, route, test, or report that proves it.

## Boundary

The asset boundary is parsing, validation, inspection, caching, and conversion into renderable resources; rendering quality is proven separately.

## Current Limits

Current limits include full Khronos corpus parity, all exporter round trips, every compressed texture path, and broad commercial asset compatibility.
