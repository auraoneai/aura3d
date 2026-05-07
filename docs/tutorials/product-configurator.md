# Tutorial: Product Configurator Slice

This tutorial explains the current `examples/product-configurator` demo. It is a renderer-backed browser app slice, not a commercial product pipeline.

## Run The Demo

Serve the repo with the same development server used by browser tests and open:

```text
/examples/product-configurator/index.html
```

The demo publishes runtime state on:

```ts
window.__GALILEO3D_PRODUCT_DEMO__
```

## What It Uses

- `Renderer.create({ backend: "webgl2", canvas })`
- `Geometry.uvSphere`, `Geometry.cube`, and `Geometry.lineSegments`
- `PBRMaterial` and `UnlitMaterial`
- pointer/click interaction for material variants

## Implementation Shape

The demo creates a WebGL2 renderer, builds a small set of render items from public APIs, and updates the active `PBRMaterial` variant when the user clicks the viewport or a swatch button.

The important product-app pattern is:

```ts
const renderer = await Renderer.create({ backend: "webgl2", canvas });
const diagnostics = renderer.render(renderItems);
```

Diagnostics are exposed in the window state so browser checks can prove the demo uses the renderer path and does not rely only on static screenshots.

The committed browser verification for this running example is:

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts
```

## Current Limits

- The product model is procedural.
- Material variants are PBR parameter variants, not production texture packs.
- This tutorial does not enable a public competitive claim.
