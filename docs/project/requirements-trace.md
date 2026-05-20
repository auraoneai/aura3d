# Requirements Trace Summary

This file is now a summary, not the large generated trace table. The generated trace table was useful during the rebuild phase, but it made the docs harder to maintain and repeated information that belongs in reports.

## Current Trace Sources

Use these reports for machine-readable state:

- `tests/reports/final-requirements-trace.json`
- `tests/reports/final-release-verification.json`
- `tests/reports/v9/completion-audit.json`
- `tests/reports/v9/threejs-inventory.json`
- `tests/reports/v9/route-health.json`
- `tests/reports/v9/performance.json`

## Current Human Trace

| Requirement area | Current source |
|---|---|
| Project overview and doc map | `README.md`, `docs/project/documentation-index.md` |
| Current claim boundary | `docs/project/v9-roadmap-claim-boundary.md` |
| Three.js parity status | `docs/project/v9-roadmap-parity-matrix.md`, `tests/reports/v9/threejs-inventory.json` |
| V9 execution status | `docs/project/v9-roadmap-status.md`, `tests/reports/v9/completion-audit.json` |
| Code backlog | `docs/project/v9-roadmap-code-backlog.md` |
| Verification summary | `docs/project/verification-evidence.md` |
| Completion audit | `docs/project/completion-audit.md` |

## Trace Policy

- Documentation claims must point to package code, tests, browser routes, visual evidence, or report artifacts.
- Route screenshots are not enough for broad parity claims.
- Generated reports are evidence inputs, not marketing copy.
- Full Three.js parity remains blocked while any V9 parity category is partial.
- Historical rebuild PRDs have been collapsed into `docs/project/documentation-index.md`.

## Current Snapshot

The latest V9 inventory report records 54 inventoried Three.js comparison examples: 30 matched and 24 partial. The V9 completion audit records 784 checked items and 0 unchecked items. These are strong construction signals, but they do not override the V9 claim boundary.
