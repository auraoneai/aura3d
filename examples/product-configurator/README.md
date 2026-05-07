# Product Configurator Demo

## Purpose

This demo is an early product-app slice for Galileo3D. It renders a configurable product through the public `@galileo3d/rendering` WebGL2 path and exposes runtime evidence for material variants, frame timing, draw calls, and user interaction.

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
- `Geometry`
- `PBRMaterial`
- `UnlitMaterial`
- public package imports only

## Learning Path

Read `main.ts` from top to bottom; it is intentionally a single-file app so a developer can understand the product flow without opening test files.

1. `variants` defines the product material choices and the UI-facing variant ids.
2. `Renderer.create({ backend: "webgl2" })` creates the real engine renderer used by the canvas.
3. `buildProductItems` converts the active variant into render items using `Geometry`, `PBRMaterial`, and `UnlitMaterial`.
4. `setVariant` updates swatch state, calls `renderer.render`, and publishes `window.__GALILEO3D_PRODUCT_DEMO__`.
5. Canvas pointer input and swatch button clicks are both real browser interactions, not synthetic test-only hooks.

Use the displayed JSON status panel or `window.__GALILEO3D_PRODUCT_DEMO__` in DevTools to inspect the same runtime evidence the automated checks read: active variant, interaction count, draw calls, renderer backend, and renderer diagnostics.

## Expected Output

A WebGL2-rendered product object appears with selectable material swatches. Clicking a swatch selects that material, clicking the canvas cycles the active material variant, and both paths update `window.__GALILEO3D_PRODUCT_DEMO__`.

## Acceptance Target

- `window.__GALILEO3D_PRODUCT_DEMO__.status` is `ready`.
- `renderer` is `webgl2`.
- `metrics.rendererBacked` is `true`.
- `diagnostics.drawCalls` is greater than zero.
- `diagnostics.contextLost` is `false` and `diagnostics.lastError` is `null`.
- Pointer input changes the active material variant from `graphite` to `copper`.
- The `ceramic` swatch button selects the `ceramic` variant and updates `aria-pressed`.

## Known Limits

- The product asset is procedural, not an external commercial glTF model.
- Material variants are PBR parameter variants, not texture-compressed production material packs.
- The demo is a product-app proof slice, not evidence for a broad "better than Three.js" claim.
