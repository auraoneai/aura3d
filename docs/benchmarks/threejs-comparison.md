# A3D vs Three.js Benchmark Evidence

Version: `1.0.0`

Three.js comparison evidence is split across benchmark scenes, same-scene browser reports, route screenshots, and generated parity reports.

## Current Sources

- Three.js benchmark project: `benchmarks/threejs/`
- A3D benchmark project: `benchmarks/aura3d/`
- Comparison tool: `tools/compare-engines/`
- Current parity reports: `tests/reports/threejs-parity/`
- Three.js superiority performance aggregation: `tools/superiority-performance/index.ts`

## Current Generated Snapshot In This Worktree

- `tests/reports/threejs-parity/threejs-inventory.json`: `pass: true`, 54 tracked rows, all currently marked `matched`.
- `tests/reports/threejs-parity/same-scene-render.json`: `pass: true`.
- `tests/reports/threejs-parity/visual-review.json`: `pass: true`.
- `tests/reports/threejs-parity/performance.json`: currently `pass: false` because several performance evidence reports are missing from the local report tree.
- `tests/reports/superiority/performance.json`: currently `pass: false` for the same performance-report gap.

## Boundary

A3D can be compared to Three.js only through named benchmark scenes, same-scene routes, and report outputs. Do not describe all of A3D as faster, visually identical, or broadly superior unless the current Three.js superiority report set proves that exact wording.
