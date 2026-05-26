# Build A Material Studio

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Use the workflow preset when the application is a material comparison or review surface.

```ts
import { createDiagnosticsPanel, createA3DApp, workflows } from "@aura3d/engine";

const app = await createA3DApp({ canvas, quality: "production" });
const workflow = await workflows.materialStudio({ mode: "metals" });
const render = app.renderer?.render(workflow.source, workflow.camera);
const diagnostics = createDiagnosticsPanel({ render });
```

Evidence:

- Example: `examples/external-material-studio`
- App: `apps/material-studio-pro`
- Screenshot: `tests/reports/external-gallery/materials/external-material-studio.png`
- Same-scene Three.js comparison: `tests/reports/external-parity-threejs-visual-parity/material-metals-threejs.png`

Boundary: scanned material libraries and full DCC material parity remain outside this bounded tutorial.
