# Product Configurator

## Purpose

This public workflow example renders the typed, provenance-backed `showcaseHeadphones` GLB through `createProductConfiguratorWorkflow`. It demonstrates three materially distinct finish modes, three visibly distinct lighting presets, three exposure levels, three bounds-derived camera frames, keyboard camera selection, and PNG capture without a second proxy product or manually assembled renderer stand-in.

## Run

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts -g "product configurator"
pnpm exec playwright test tests/visual/product-demos.spec.ts -g product-configurator
```

For manual inspection, serve the repository with the browser-test development server and open:

```text
/examples/product-configurator/index.html
```

## Systems Used

- `createProductConfiguratorWorkflow` from `@aura3d/workflows`
- `Renderer` from `@aura3d/rendering` with the `webgl2` backend
- typed `assets.showcaseHeadphones` from the CLI-generated asset map
- the product-studio package's material, lighting, floor, and bounds-derived camera owners
- browser PNG capture through the rendered WebGL canvas

## Learning Path

1. `assets.showcaseHeadphones` supplies the immutable URL, content hash, license, author, and bounds.
2. `createProductConfiguratorWorkflow` owns GLB loading, render-source construction, material modes, lighting presets, and camera framing.
3. `Renderer.create({ backend: "webgl2" })` creates the visible renderer.
4. Finish, lighting, camera, and exposure controls rebuild or resubmit the public workflow with explicit supported options through `renderer.render`.
5. Canvas click cycles finishes; focused Left/Right/Home keys move between camera frames.
6. `window.__AURA3D_PRODUCT_DEMO__` publishes only capabilities the route actually exercises.

## Expected Output

A complete over-ear headphone model is centered on a grounded studio floor. Graphite preserves the asset materials, Copper activates the metal-check workflow, and Ceramic activates the contrast workflow. Studio, Softbox, and Inspection produce visibly different subject-region lighting, while Low, Neutral, and High change tone-mapping exposure. Hero, Profile, and Detail reframe the asset from its measured bounds. No speaker, procedural headphone assembly, debug grid, tiled technical wall, or unrelated corpus object appears in the scene.

## Acceptance Target

- `window.__AURA3D_PRODUCT_DEMO__.status` is `ready`.
- `renderer` is `webgl2`, `metrics.rendererBacked` is `true`, and draw calls are nonzero.
- The state identifies `showcaseHeadphones` as a typed, provenance-backed asset and exposes its hash, license, author, and GLB counts.
- All three finish, lighting, exposure, and camera controls change the workflow state; finish, lighting, and exposure changes alter rendered subject pixels.
- The canvas keyboard path selects bounds-derived camera frames.
- PNG capture returns a nontrivial data URL.
- Browser, visual stability, interaction-diff, and exhaustive visual-audit checks pass.

## Known Limits

- The three finishes map to the public workflow's `asset`, `metal-check`, and `contrast` modes; this route does not mutate or author new glTF texture packs.
- Export is PNG capture. Native USDZ and commerce/backend integration are not claimed.
- This is one bounded product workflow and does not by itself prove universal visual, performance, or ecosystem parity with Three.js.
