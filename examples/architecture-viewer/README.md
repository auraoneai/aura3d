# Architecture Viewer Demo

## Purpose

This demo is an early architecture-viewer product slice. It renders a simple floorplate with selected zones through Galileo3D's public WebGL2 renderer, supports pointer selection, and reports measurement and frame diagnostics.

## Run

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts -g architecture-viewer
```

The product demo spec also runs source validation from `tools/demo-validation/product-demo-source-validation.ts`. That guard requires this example to use the public renderer path, expose runtime state, keep this README complete, and avoid 2D-canvas or static-screenshot substitutes.

For browser inspection, serve the repository with the example dev server and open:

```text
/examples/architecture-viewer/index.html
```

## Systems Used

- `Renderer` with the `webgl2` backend
- `Geometry`
- `PBRMaterial`
- `UnlitMaterial`
- pointer interaction through browser public APIs

## Learning Path

Read `main.ts` before reading the tests; the app code contains the complete viewer flow.

1. `zones` defines the selectable floor areas and the measurement metadata shown to users.
2. `Renderer.create({ backend: "webgl2" })` creates the engine-backed viewport.
3. `buildRenderItems` turns the procedural floorplate, zones, and selected-zone overlay into render items.
4. The `pointerdown` handler maps viewport regions to zone selection and updates measurement state.
5. `render` submits the scene through `renderer.render` and publishes `window.__GALILEO3D_ARCHITECTURE_DEMO__` with renderer diagnostics.

Use the visible status panel or `window.__GALILEO3D_ARCHITECTURE_DEMO__` in DevTools to inspect selected zone, area, span, zone count, draw calls, renderer backend, and diagnostics while clicking the viewport.

## Expected Output

A renderer-backed architectural massing scene appears with selectable zones. Clicking a viewport region selects the matching floor area and updates measurement data on `window.__GALILEO3D_ARCHITECTURE_DEMO__`.

## Acceptance Target

- `window.__GALILEO3D_ARCHITECTURE_DEMO__.status` is `ready`.
- `renderer` is `webgl2`.
- `metrics.rendererBacked` is `true`.
- `diagnostics.drawCalls` is greater than zero.
- `diagnostics.contextLost` is `false` and `diagnostics.lastError` is `null`.
- Pointer input selects the `gallery` zone and updates area/span measurements.
- Runtime metrics report the zone count and selected-area metadata.

## Known Limits

- The scene is procedural and intentionally small; it is not yet a heavy BIM/glTF building model.
- Measurement uses demo metadata rather than raycasted CAD/BIM geometry.
- Shadows and large-scene streaming are not claimed by this slice.
