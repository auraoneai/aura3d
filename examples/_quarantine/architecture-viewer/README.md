# Architecture Viewer Demo

## Purpose

This demo is a v3 architecture-viewer product slice. It renders a generated production-like civic gallery room fixture through Galileo3D's public WebGL2 renderer, supports room-element selection, camera modes, section-view toggling, projected contact-shadow receiver decals, and reports hierarchy, measurement, known-limit, and frame diagnostics.

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

1. `zones` defines the selectable room areas, hierarchy metadata, and measurement metadata shown to users.
2. `Renderer.create({ backend: "webgl2" })` creates the engine-backed viewport.
3. `buildRenderItems` turns the generated floor slabs, rooms, curtain-wall bays, mullions, entry doors, stair treads, railings, structural columns, benches, measurement guides, projected contact-shadow decals, and selected-element outline into render items.
4. The `pointerdown`, wheel, zone button, camera button, and section toggle handlers update selection and viewer state.
5. `render` submits the scene through `renderer.render` and publishes `window.__GALILEO3D_ARCHITECTURE_DEMO__` with renderer diagnostics.

Use the visible status panel or `window.__GALILEO3D_ARCHITECTURE_DEMO__` in DevTools to inspect selected zone, selected model element, area, span, hierarchy, camera mode, section state, known limits, architecture element count, contact-shadow evidence, draw calls, renderer backend, and diagnostics while interacting with the viewport.

## Expected Output

A renderer-backed generated civic gallery scene appears with recognizable room zones, curtain wall, mullions, doors, stairs, columns, furniture, contact-shadow decals, a selection outline, measurement guides, camera modes, and section-view state. Clicking a viewport region selects the matching room element and updates measurement data on `window.__GALILEO3D_ARCHITECTURE_DEMO__`.

## Acceptance Target

- `window.__GALILEO3D_ARCHITECTURE_DEMO__.status` is `ready`.
- `renderer` is `webgl2`.
- `metrics.rendererBacked` is `true`.
- `diagnostics.drawCalls` is greater than zero.
- `diagnostics.contextLost` is `false` and `diagnostics.lastError` is `null`.
- `visualClaim` and `knownLimits` are present in `window.__GALILEO3D_ARCHITECTURE_DEMO__`.
- Runtime model metadata lists hierarchy nodes and selectable zones.
- Pointer input selects the `gallery` room element and updates area/span measurements.
- Runtime metrics report the zone count, selected-element metadata, architecture element count, contact-shadow decal count, and selected-area metadata.

## Known Limits

- The viewer renders a generated local civic-gallery fixture and matching procedural render descriptor; it is not an IFC/BIM import workflow.
- Selection targets authored model element metadata and viewport hit regions; it is not triangle-accurate ray picking against CAD geometry.
- Measurements are authored room and element metadata with guide lines, not computed CAD dimension annotations.
- Contact shadows are projected receiver decals under authored casters; shadow maps and arbitrary clipping planes are not implemented here.
- The section view hides generated facade pieces; arbitrary BIM layers are not implemented.
