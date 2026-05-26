# Build An Interactive Scene

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use the interactive workflow as the starting point for selection, variants, and realtime scene state.

```ts
import { createA3DApp, workflows } from "@aura3d/engine";

const app = await createA3DApp({ canvas, quality: "production" });
const workflow = await workflows.interactiveScene({ preset: "orbiting-products" });
app.renderer?.render(workflow.source, workflow.camera);

canvas.addEventListener("pointerdown", () => {
  const nextSource = workflow.update(performance.now() / 1000);
  app.renderer?.render(nextSource, workflow.camera);
});
```

Evidence:

- Example: `examples/external-interactive-showcase`
- App: `apps/interactive-showcase-pro`
- Screenshot: `tests/reports/external-gallery/interactive/external-interactive-showcase.png`
- Same-scene Three.js comparison: `tests/reports/external-parity-threejs-visual-parity/interactive-orbit-threejs.png`

Boundary: this tutorial proves a lightweight interactive scene, not a full game engine.
