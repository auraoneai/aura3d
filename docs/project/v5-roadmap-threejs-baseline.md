# V5 Three.js Baseline

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V5 targets the installed Three.js baseline from the root package.

- Package: `three`
- Declared version range at V5 start: `^0.165.0`
- Inventory report: `tests/reports/v5-threejs-inventory.json`
- Compatibility matrix: `tests/reports/v5-threejs-compatibility-matrix.json`

The compatibility inventory must be regenerated before claiming any broad Three.js replacement progress. If the Three.js package version changes, the inventory and matrix must be regenerated before any release gate can pass.

V5 does not target full Three.js API parity. It targets broad documented replacement for common production browser 3D use cases, with unsupported categories marked as partial, planned, blocked, or out-of-scope.

