# V6 Renderer Architecture

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


G3D V6 is a proof-backed WebGL2 renderer path for imported glTF assets, HDR environments, PBR materials, runtime diagnostics, examples, templates, and external package consumption.

The production path starts at `ProductionWebGL2Renderer`, which wraps the shared `Renderer` with strict proof requirements: real WebGL2 backend, no Canvas 2D proof, no mock backend, imported glTF render source, draw-call diagnostics, texture diagnostics, HDR IBL capability, and pixel readback.

The current V6 product boundary is not "full Three.js replacement." The current boundary is: render real pinned GLB assets through WebGL2 with HDR IBL and produce reports that prove backend, asset ids, textures, draw calls, screenshot pixels, and package consumption.

Key evidence:

- `tests/reports/v6-webgl2-readiness.json`
- `tests/reports/v6-gallery-readiness.json`
- `tests/reports/v6-threejs-parity-readiness.json`
- `tests/reports/v6-external-consumer.json`
