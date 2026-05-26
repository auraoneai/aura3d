# Postprocess

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 postprocess proof covers tone mapping, color grade, bloom, FXAA, and renderer-owned presentation for real renderer pixels.

Examples and templates expose postprocess chains in runtime metrics:

```ts
expectedPostprocessChain: ["tone-mapping", "color-grade", "bloom", "fxaa"]
```

Postprocess screenshots are accepted only when WebGL2 diagnostics, imported asset metadata, nonblank pixels, and the postprocess report agree.

Primary evidence:

- `tests/reports/production-runtime-effects-readiness.json`
- `tests/reports/production-runtime-examples-readiness.json`
