# Rendering

Version: `0.1.0-alpha.0`

The rendering package owns browser graphics resources, materials, textures, render queues, state application, frame submission, postprocessing, diagnostics, and disposal. The public package is `@galileo3d/engine/rendering`.

## Backend Position

WebGL2 is the main externally usable backend today. WebGPU exists as scoped implementation and proof routes for render-to-texture, materials, compute, and instancing work, but Galileo3D does not yet claim complete WebGPU renderer parity.

## Package Surface

Current public exports cover:

- render devices and backend creation;
- WebGL2/WebGPU devices and state/cache helpers;
- geometry, vertex/index buffers, attributes, bounds, morph target bounds, and skinning bounds;
- textures, color management, HDR, tone mapping, exposure, BRDF LUT, PMREM, IBL, and environment resources;
- physical materials, material-extension diagnostics, alpha sorting, transmission helpers;
- shadows, contact shadows, cascaded shadow pipeline, debug views;
- bloom, SSAO, depth of field, color grading, postprocess composer;
- renderer stats, resource budgets, render-item sorting, LOD, BVH, batching, instancing, and frustum helpers;
- V6 production renderer surfaces and V9 renderer wrappers.

## Direct Usage

```ts
import { Geometry, PBRMaterial } from "@galileo3d/engine/rendering";
import { G3DRenderer, G3DScene } from "@galileo3d/engine/v9";

const renderer = await G3DRenderer.create({ backend: "webgl2", canvas });

const scene = new G3DScene();
scene.addGeometry("cube", Geometry.box());
scene.addMaterial("paint", new PBRMaterial({
  baseColor: [0.75, 0.65, 0.48, 1],
  roughness: 0.4,
  metalness: 0.1
}));
scene.createRenderableMesh({ geometry: "cube", material: "paint" });

const diagnostics = renderer.render(scene);
console.log(diagnostics.drawCalls);
```

## Renderer Boundary

The renderer does not own the entire application. It expects the app to provide the current scene, camera, viewport, resources, and timing. It owns GPU-facing resource creation, state management, draw submission, diagnostics, and disposal.

## Current Strengths

- WebGL2 route rendering with diagnostics;
- state caching and render queue sorting work;
- PBR/HDR/IBL foundations;
- postprocess chain foundations;
- instancing and batching evidence;
- bounds, culling, and resource lifecycle APIs;
- V8/V9 routes for materials, decals, cameras, shadows, postprocessing, lines/helpers, picking, and WebGPU proofs.

## Boundaries

Do not claim:

- complete Three.js renderer parity;
- production physically complete IBL;
- every glTF material extension rendered visually correctly;
- broad large-scene performance superiority;
- full WebGPU engine;
- complete shadow/postprocess parity.

Use route reports and same-scene comparisons as scoped evidence only.

