# WebGL2 Backend

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 WebGL2 setup uses the public renderer path:

```ts
import { ProductionWebGL2Renderer } from "@aura3d/engine/rendering";

const renderer = await ProductionWebGL2Renderer.create({
  canvas,
  width: canvas.width,
  height: canvas.height,
  preserveDrawingBuffer: true,
  clearColor: [0.01, 0.012, 0.016, 1]
});
```

The renderer proof includes backend kind, draw calls, buffers, shaders, textures, texture bytes, render targets, WebGL errors, context loss, and pixel readback. A screenshot is not accepted unless the report says the backend is `webgl2`, the renderer is not mock, the proof is not Canvas 2D, and the pixels are nonblank.

Primary evidence:

- `tests/reports/production-runtime-webgl2-readiness.json`
- `tests/reports/production-runtime-performance-readiness.json`
