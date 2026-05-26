# Animation

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V6 animation proof verifies that imported glTF animation metadata, skinning metadata, and morph-target metadata flow into the render workflow. It does not yet claim a complete animation mixer, retargeting, IK, or production character tooling replacement.

Primary evidence:

- `tests/reports/production-runtime-animation-controls-readiness.json`
- `tests/reports/production-runtime-animation-controls/cesium-man-animation.png`
- `tests/reports/production-runtime-animation-controls/animated-morph-cube.png`
