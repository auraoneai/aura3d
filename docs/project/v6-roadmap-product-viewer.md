# G3D V6 Product Viewer

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The V6 product viewer is the current flagship app for the G3D renderer product. It is not a screenshot harness. It is a browser app that imports the public V6 SDK, loads a real GLB, loads a real HDR environment, renders through the G3D WebGL2 renderer, exposes runtime diagnostics, and provides interaction controls.

## Public API Used

```ts
import {
  createProductViewer,
  loadGltfScene,
  loadHdrEnvironment
} from "@galileo3d/engine/v6";
```

The app path is:

```text
apps/v6-product-configurator/
```

It uses:

- `loadGltfScene()` for the imported product GLB.
- `loadHdrEnvironment()` for the Radiance HDR environment.
- `createProductViewer()` for renderer, controls, postprocess settings, diagnostics, and screenshot capture.

The flagship app must keep using this public import path. If it needs private EngineReadiness-only runtime helpers to render, it is not product proof.

## Current Workflow

The default viewer loads:

- Asset: `fixtures/v7/assets/flagship/chronograph-watch.glb`
- Environment: `fixtures/v7/environments/hdri/studio_small_08_4k.hdr`
- Backend: G3D WebGL2

The UI exposes:

- Orbit left/right.
- Pan left/right.
- Zoom in/out.
- Reset camera.
- Asset selection through `?asset=` and the in-app asset picker.
- Environment selection.
- Exposure control.
- IBL intensity control.
- Specular intensity control.
- Environment rotation control.
- Background visibility toggle.
- Background blur/softness control.
- Grounding/stage toggle.
- Bloom toggle.
- FXAA toggle.
- Material diagnostics.
- Screenshot capture.

The runtime publishes:

```ts
window.__g3dV6Runtime
```

Browser verification writes:

```text
tests/reports/v6-app-suite/v6-product-configurator.png
tests/reports/v6-app-suite/v6-product-configurator.json
```

V7 also writes the actual high-resolution canvas export:

```text
tests/reports/v7/product-viewer/flagship-product-viewer-2560.png
tests/reports/v7/product-viewer/flagship-product-viewer-2560.json
```

The flagship app now uses a 2560x2560 internal render target for the product-viewer canvas and exposes `runtime.renderResolution` so low-resolution regressions can be caught by browser tests.

V7 changed the default flagship asset away from the old low-complexity helmet proof. The app now ships with a stronger imported asset set:

- `chronograph-watch`: 100,002 triangles, 29 materials, 8 textures, transmission/variants/texture-transform metadata.
- `car-concept`: higher-end product/car paint stress asset.
- `toy-car`: smaller product configurator stress asset.
- `materials-variants-shoe`: material variant workflow asset.
- legacy comparison assets: damaged helmet, boom box, antique camera.

These are still not a claim of full Three.js parity. They are a better flagship content baseline for exposing renderer quality honestly.

## V7 Comparison Artifact

V7 requires a same-scene comparison against Three.js. Three.js is used only as a competitor baseline, not as the G3D implementation.

The comparison artifact writes:

```text
tests/reports/v7/product-viewer/g3d-product-viewer.png
tests/reports/v7/product-viewer/threejs-product-viewer.png
tests/reports/v7/product-viewer/comparison.png
tests/reports/v7/product-viewer/product-viewer-report.json
```

The comparison uses:

- Same GLB: `damaged-helmet.glb`
- Same HDRI: `studio_small_08_1k.hdr`
- Same screenshot resolution
- Same product-scene harness

The report must not claim exact parity. It records the G3D output, the Three.js output, and diff metrics so visual gaps remain visible.

## Product Viewer SDK Controls

`createProductViewer()` now owns the viewer workflow instead of only rendering a static frame:

- `viewer.controls.rotate()` changes the camera yaw/pitch used for the next render.
- `viewer.controls.pan()` changes the framed target offset used for the next render.
- `viewer.controls.dolly()` changes camera zoom/padding used for the next render.
- `viewer.setEnvironment()` swaps the active HDR environment.
- `viewer.setSettings()` updates exposure, IBL intensity, specular intensity, environment rotation, background visibility, background blur/softness, grounding, bloom, FXAA, and color grade settings.
- `viewer.captureScreenshot()` returns a PNG/JPEG data URL when the canvas supports capture.

The viewer also creates renderer-owned product-scene render items:

- grounding items: floor and contact-grounding proxy
- background items: a subdued product-stage backdrop

The contact-grounding proxy is now produced by `packages/rendering/src/v6/passes/ContactShadowPass.ts` rather than being hidden as one-off app geometry. Its diagnostics are explicit:

- `mode: layered-elliptical-receiver-proxy`
- `parity: not-full-contact-shadow`
- `layerCount: 4`

The visible softbox strips were removed from the product viewer stage because they made the flagship output look like a debug scene instead of a renderer product. The background visibility and blur controls affect visible renderer input and diagnostics. This is product-stage backdrop behavior, not a completed equirect/cubemap skybox pass. The distinction matters because V7 must not pretend a product backdrop is the same as full Three.js-style skybox/PMREM/background blur parity.

## Known Gaps

The product viewer is now a real SDK consumer, but it is not a completed Three.js replacement yet.

Open gaps:

- True cubemap PMREM parity is still not proven against Three.js.
- Cubemap PMREM resource generation and WebGL2 `samplerCube` binding now exist for the GLTF textured PBR product-viewer path. Full parity is still not proven because every PBR shader variant, skybox/background path, transmission/refraction path, and same-scene Three.js PMREM comparison still need audit coverage.
- The current grounding combines renderer-owned directional shadow-map settings, renderer-owned depth-aware SSAO, and the V6 `ContactShadowPass` layered elliptical receiver proxy. It is reusable renderer code now, but it is still not a completed high-end screen-space or ray/contact-shadow solution.
- Material extension coverage needs broader visual proof for transmission, anisotropy, iridescence, and variants.
- The current visible background is a product-stage backdrop. Background blur, equirect/cubemap skybox rendering, rotation, and skybox controls are not yet equivalent to mature Three.js workflows.
- WebGPU is still explicit coverage/gap reporting, not the primary production backend.

These gaps must stay visible in reports and docs until the renderer proves otherwise.
