# Examples

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 examples live under `examples/production-runtime-examples/` and are indexed by `examples/production-runtime-examples/catalog.json`.

Every V6 example imports public package APIs, loads real GLB assets, loads real HDR environments, renders through WebGL2, exposes runtime proof, and saves a browser screenshot in `tests/reports/production-runtime-examples/`.

Primary evidence:

- `tests/reports/production-runtime-examples-readiness.json`
