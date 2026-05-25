# G3D Renderer V6

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


`@galileo3d/engine/production-runtime` is the public V6 renderer SDK surface. It is the product API used by the flagship product viewer and the V6 product viewer template.

```ts
import {
  G3DRenderer,
  createProductViewer,
  loadGltfScene,
  loadHdrEnvironment
} from "@galileo3d/engine/production-runtime";
```

## Current Product Scope

The production backend for the documented workflow is WebGL2. WebGPU remains explicit capability/gap reporting until the backend reaches the same GLTF/HDR/PBR coverage.

The product viewer path renders through:

- `G3DRenderer`
- `loadGltfScene()`
- `loadHdrEnvironment()`
- `createProductViewer()`

Three.js is not used by the G3D renderer path. Three.js is allowed only for comparison output and migration documentation.

## Viewer Controller

`createProductViewer()` returns a controller with:

- `render()`
- `setSettings()`
- `setEnvironment()`
- `getSettings()`
- `captureScreenshot()`
- `controls.rotate()`
- `controls.pan()`
- `controls.dolly()`
- `controls.reset()`
- `diagnostics()`

The viewer creates camera frames from asset bounds and control state. It also injects product-stage render items for floor/backdrop/contact-style grounding when grounding is enabled, and passes a renderer-owned directional shadow-map configuration with PCF filtering for the flagship product-viewer workflow.

## Known Gaps

- Contact grounding still uses a product-stage proxy in addition to renderer-owned directional shadows; this is not a full contact-shadow implementation.
- True cube PMREM parity against Three.js is not proven.
- WebGPU is not yet the primary production renderer for this workflow.
