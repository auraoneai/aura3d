# Tutorial: Build A V3 Browser App

This tutorial shows the current V3 app pattern: create a public workflow, render its `RenderSource`, expose diagnostics, and verify the page in a browser. It maps to `examples/index.html` and the V3 examples.

## Minimal Shape

```ts
import { Renderer } from "@galileo3d/rendering";
import { createSceneShowcaseWorkflow } from "@galileo3d/workflows";

const canvas = document.querySelector<HTMLCanvasElement>("canvas");
if (!canvas) throw new Error("Missing canvas.");

const renderer = await Renderer.create({
  backend: "webgl2",
  canvas,
  width: 1280,
  height: 760,
  clearColor: [0.025, 0.028, 0.032, 1],
  preserveDrawingBuffer: true
});

const workflow = createSceneShowcaseWorkflow({ preset: "studio" });
renderer.resizeToDisplay({ devicePixelRatio: Math.min(devicePixelRatio || 1, 2) });
const diagnostics = renderer.render(workflow.source, workflow.camera);
```

## What The App Must Expose

- A real canvas rendered by `Renderer`.
- A public workflow result from `@galileo3d/workflows`.
- Runtime diagnostics such as draw calls, frame count, rendered item count, and `lastError`.
- A README or tutorial that explains the public API path without relying on test-only helpers.

## Verification

Use the V3 examples gate:

```sh
pnpm v3:examples
```

That command captures browser screenshots and writes `tests/reports/v3-examples-readiness.json`.
