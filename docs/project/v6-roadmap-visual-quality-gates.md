# Visual Quality Gates

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 visual proof rejects blank or fake screenshots. A valid visual proof needs real renderer JSON, WebGL2 backend, real asset ids, HDR environment id, draw calls, textures, texture memory, nonblank pixels, and screenshot dimensions.

Gallery proof is generated under `tests/reports/v6-gallery/`. The gallery readiness report is the acceptance gate for visual bundles.

Primary evidence:

- `tests/reports/v6-gallery-readiness.json`
- `tests/reports/v6-gallery/manifest.json`
