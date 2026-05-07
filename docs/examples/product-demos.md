# Product Demo Index

These examples are early product-style proof slices. They are separate from validation examples such as `00-basic-triangle` through `11-showcase-world`.

| Demo | Path | Runtime state | Current proof |
|---|---|---|---|
| Product configurator | `examples/product-configurator` | `window.__GALILEO3D_PRODUCT_DEMO__` | Public `Renderer.create({ backend: "webgl2" })`, `renderer.render(...)`, material swatch buttons, pointer cycling, draw-call diagnostics, and nonblank WebGL pixels. |
| Architecture viewer | `examples/architecture-viewer` | `window.__GALILEO3D_ARCHITECTURE_DEMO__` | Public WebGL2 renderer path, viewport zone selection, measurement metadata, draw-call diagnostics, and nonblank WebGL pixels. |
| Game slice | `examples/game-slice` | `window.__GALILEO3D_GAME_DEMO__` | Public WebGL2 renderer path with physics, animation, input, particles, audio state, pointer and keyboard interactions, draw-call diagnostics, and nonblank WebGL pixels. |

## Learnability Contract

Each product example must be useful before a developer opens the test suite. The README for each example must identify the systems used, the manual run path, the expected output, the acceptance target, known limits, and a `Learning Path` that points to the source-level concepts in `main.ts`.

The app source must expose a runtime state object that can be inspected from the visible status panel or browser DevTools. That state is part of the example API for learners: it connects UI actions to renderer diagnostics, interaction counts, selected app state, and product-specific metrics without requiring a reader to reverse-engineer Playwright assertions.

Use these source entry points when learning from the examples:

- `examples/product-configurator/main.ts`: material variants, swatch UI, render-item construction, and `window.__GALILEO3D_PRODUCT_DEMO__`.
- `examples/architecture-viewer/main.ts`: zone metadata, selection, measurement reporting, and `window.__GALILEO3D_ARCHITECTURE_DEMO__`.
- `examples/game-slice/main.ts`: renderer, physics, animation, particles, input, audio state, and `window.__GALILEO3D_GAME_DEMO__`.

## Verification

Use the committed product demo browser test:

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts
```

Use the committed product demo visual and performance evidence:

```sh
pnpm exec playwright test tests/visual/product-demos.spec.ts --reporter=json
pnpm exec tsx --tsconfig tsconfig.base.json tests/performance/product-demo-baseline.ts
node --experimental-strip-types tools/final-demo-validation/product-demo-validation.ts
```

A valid demo state must include:

- `status: "ready"`
- `renderer: "webgl2"`
- `metrics.rendererBacked: true`
- nonzero draw-call diagnostics
- clean renderer diagnostics with no context loss or last error
- nonblank WebGL pixels from the demo canvas
- demo-specific pointer interaction assertions
- source validation proving each demo imports `@galileo3d/rendering`, creates `Renderer`, calls `renderer.render`, exposes the documented runtime state, has a README, and does not use 2D canvas or static-image shortcuts

The product visual report is written to `tests/reports/product-visual.json`. It records each stable state, canvas dimensions, semantic pixel checks, a same-state screenshot-diff threshold, an interaction-state screenshot-diff threshold, platform-aware tolerance, and a CI retention note for `tests/reports/product-*.json` plus Playwright `test-results`.

The product performance report is written to `tests/reports/product-performance.json`. It records Chromium ready time, 60 frame samples, min/average/p95/max frame time, draw-call count, renderer-backed status, input interactions, budget values, and whether each product demo stayed inside its budget. `tools/final-demo-validation/product-demo-validation.ts` writes `tests/reports/product-demo-validation.json` and fails if any product demo is missing visual screenshot-diff evidence or performance evidence.

## Claim Language

These demos are app-scale proof slices. They must not be described as production-ready applications or as evidence that Galileo3D is broadly better than Three.js, Babylon.js, Unity, or Unreal.

They are local checked-in examples, not externally hosted demos. External demo status is tracked separately in `docs/examples/external-demos.md`.
