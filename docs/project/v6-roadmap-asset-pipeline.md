# Asset Pipeline

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 asset readiness requires license, source URI, local path, SHA-256, byte size, tags, render requirements, real GLB parsing, and rejection of primitive-only proof.

Asset preflight checks provenance and render requirements before workflow use. Animation-only assets can warn when they do not declare HDR IBL, but renderer workflows still must provide HDR proof through scene reports.

Primary evidence:

- `fixtures/v6/assets/manifest.json`
- `tests/reports/v6-asset-readiness.json`
- `tests/reports/v6-workflows-readiness.json`
