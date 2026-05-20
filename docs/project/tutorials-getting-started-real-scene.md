# Getting Started: Render A Real Scene

This tutorial uses the current WebGL2 renderer path. It does not require reading test files, and it points at a running example you can open in the browser.

## Run A Known Scene

Start the example dev server through Playwright or your local static server and open:

```text
/examples/01-basic-scene/index.html
```

For a product-style scene, open:

```text
/examples/product-configurator/index.html
```

The committed browser coverage for the product-style examples is:

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts
```

## Minimal Renderer Code

The core shape of a Galileo3D browser scene is:

```ts
import { Geometry, PBRMaterial, Renderer, UnlitMaterial } from "@galileo3d/rendering";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
if (!canvas) throw new Error("Missing #viewport canvas.");

const renderer = await Renderer.create({
  backend: "webgl2",
  canvas,
  preserveDrawingBuffer: true
});

const diagnostics = renderer.render([
  {
    label: "lit-sphere",
    geometry: Geometry.uvSphere(0.45, 32, 16),
    material: new PBRMaterial({
      baseColor: [0.95, 0.35, 0.15, 1],
      roughness: 0.42,
      metallic: 0.15
    })
  },
  {
    label: "ground-line",
    geometry: Geometry.lineSegments([
      [-0.75, -0.65, 0],
      [0.75, -0.65, 0]
    ]),
    material: new UnlitMaterial({
      color: [0.1, 0.75, 1, 1],
      renderState: { depthTest: false, depthWrite: false, cullMode: "none" }
    })
  }
]);

console.log(diagnostics.drawCalls);
```

## What This Proves

- The app creates a real `Renderer` with the `webgl2` backend.
- Scene content is submitted as renderer geometry and materials, not as a static screenshot.
- Diagnostics expose draw calls so browser tests can reject blank or non-renderer-backed demos.

## Current Limits

The getting-started path does not claim production PBR, environment lighting, large-scene culling, WebGPU hardware coverage, or a Unity/Unreal-style editor workflow. Those remain tracked by `docs/project/v2-filename-level-execution-checklist.md`.
