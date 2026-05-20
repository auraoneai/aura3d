# Getting Started

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Create a V6 app by importing the V6 workflow runtime from the packed package:

```ts
import { runV6Example } from "@galileo3d/engine/workflows/v6";

void runV6Example({
  appId: "my-v6-app",
  sceneId: "damaged-helmet",
  title: "My V6 App",
  workflow: "real renderer setup with imported GLB and HDR IBL",
  assets: [{ id: "damaged-helmet", label: "Damaged Helmet", file: "damaged-helmet.glb", role: "primary" }],
  environment: { id: "studio-small-08", label: "Studio Small 08", file: "studio_small_08_1k.hdr", exposure: 1, intensity: 1.15, rotation: 0.15 },
  postprocess: true,
  webgpuReport: false,
  expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
});
```

Serve the fixture assets at `/fixtures/v6` or copy equivalent assets with matching checksums.

Primary evidence:

- `tests/reports/v6-external-consumer.json`
