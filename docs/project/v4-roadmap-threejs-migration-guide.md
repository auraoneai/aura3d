# V4 Three.js Migration Guide

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 provides product workflows that reduce boilerplate for supported scenes. It is not a drop-in Three.js API replacement.

## Typical Migration Shape

Three.js application code usually assembles renderer, scene, camera, loaders, controls, lights, environment maps, postprocess passes, diagnostics, and screenshots directly. V4 moves those concerns behind public workflow APIs:

```ts
import { createG3DApp, workflows } from "@galileo3d/engine";

const app = await createG3DApp({ canvas, quality: "production" });
const scene = await workflows.productConfigurator({
  asset: "/assets/product.glb",
  environment: "studio-softbox-hdr",
  shadows: "contact"
});
```

## Evidence

- Same-scene comparison report: `tests/reports/v4-threejs-visual-parity.json`
- Large-scene comparison images: `tests/reports/v4-threejs-visual-parity/large-scene-performance-g3d.png`, `tests/reports/v4-threejs-visual-parity/large-scene-performance-threejs.png`
- Bounded status: `docs/project/v4-roadmap-threejs-parity-status.md`

Boundary: full Three.js API compatibility remains blocked. Migrate supported product, material, asset, scene, character, and interactive workflows first.

