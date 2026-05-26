# Product Configurator Demo

## Purpose

This demo is a foundation product-app slice for Aura3D. It loads a generated local over-ear headphone glTF fixture, renders the model geometry through the public `@aura3d/rendering` WebGL2 path, and exposes runtime evidence for material variants, camera controls, environment controls, frame timing, draw calls, screenshot export state, and user interaction.

## Run

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts -g product-configurator
```

The product demo spec also runs source validation from `tools/demo-validation/product-demo-source-validation.ts`. That guard requires this example to use the public renderer path, expose runtime state, keep this README complete, and avoid 2D-canvas or static-screenshot substitutes.

For manual inspection, serve the repository with the example dev server used by browser tests and open:

```text
/examples/product-configurator/index.html
```

## Systems Used

- `Renderer` with the `webgl2` backend
- `GLTFLoader`, `createGLTFRenderResources`, and `inspectGLTFAsset`
- `Geometry`
- `PBRMaterial`
- `TexturedPBRMaterial`
- `UnlitMaterial`
- public package imports only

## Learning Path

Read `main.ts` from top to bottom; it is intentionally a single-file app so a developer can understand the product flow without opening test files.

1. `variants` defines the product material choices and the UI-facing variant ids.
2. `loadProductModel` fetches `fixtures/workflow-assets/assets/product-camera/product-camera.gltf`, its manifest, and its source-generation evidence.
3. `Renderer.create({ backend: "webgl2" })` creates the real engine renderer used by the canvas.
4. `buildRenderItems` converts loaded glTF geometry resources and active material slot variants into render items using `PBRMaterial`, `TexturedPBRMaterial`, and `UnlitMaterial`.
5. Swatch, camera, light, orbit/zoom, and export controls update page state through helpers including `setVariant` before `renderer.render` publishes `window.__AURA3D_PRODUCT_DEMO__`.
6. Canvas pointer input, wheel input, swatch buttons, camera buttons, environment buttons, and screenshot export are real browser interactions, not synthetic test-only hooks.

Use the displayed JSON status panel or `window.__AURA3D_PRODUCT_DEMO__` in DevTools to inspect the same runtime evidence the automated checks read: active variant, material slots, camera/environment presets, interaction count, export state, draw calls, renderer backend, generated glTF source evidence, known limits, and renderer diagnostics.

## Expected Output

A WebGL2-rendered generated headphone configurator appears with selectable material swatches, visible PBR finish changes, generated cushion texture detail, procedural environment reflection evidence, model-backed contact-shadow receiver geometry, camera presets, environment presets, orbit/zoom input, and a PNG export button. Clicking a swatch selects that material, clicking the canvas cycles the active material variant, and both paths update `window.__AURA3D_PRODUCT_DEMO__`.

## Acceptance Target

- `window.__AURA3D_PRODUCT_DEMO__.status` is `ready`.
- `renderer` is `webgl2`.
- `metrics.rendererBacked` is `true`.
- `diagnostics.drawCalls` is greater than zero.
- `diagnostics.contextLost` is `false` and `diagnostics.lastError` is `null`.
- `visualClaim` and `knownLimits` are present in `window.__AURA3D_PRODUCT_DEMO__`.
- Runtime asset metadata lists material slots and generated part counts.
- `metrics.modelBacked` is `true`, `asset.source` is `generated-local-gltf`, and `asset.commercialImportedAsset` is `false`.
- Runtime evidence lists glTF mesh/material/node counts loaded from `fixtures/workflow-assets/assets/product-camera`.
- Pointer input changes the active material variant from `graphite` to `copper`.
- The `ceramic` swatch button selects the `ceramic` variant and updates `aria-pressed`.

## Known Limits

- The product model is a generated local multi-part glTF asset, not an imported commercial glTF model.
- Material variants are slot-level PBR parameters and one generated grip texture, not texture-compressed production material packs.
- Environment lighting is procedural and bounded; HDR image-based-lighting parity is not claimed.
- Contact shadows are model-backed translucent receiver geometry in this example; product shadow-map evidence remains bounded to renderer/shadow labs unless a real product shadow pass is added.
- The demo is a product-app slice, not evidence for a broad "better than Three.js" claim.
