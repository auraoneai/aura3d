# A3D And Three.js

Version: `1.0.0`

Three.js is the primary comparison target for A3D. The current codebase has first-party renderer, scene, asset, animation, controls, physics, input, workflow, diagnostics, and compatibility packages; Three.js is used as a reference implementation in tests and comparisons, not as the A3D runtime renderer.

## Current Evidence

| Area | Current source |
|---|---|
| Inventory | `tests/reports/threejs-parity/threejs-inventory.json` |
| Same-scene rendering | `tests/reports/threejs-parity/same-scene-render.json` |
| Visual review | `tests/reports/threejs-parity/visual-review.json` |
| Performance | `tests/reports/threejs-parity/performance.json`, `tests/reports/superiority/performance.json` |
| Package compatibility | `packages/three-compat/src/index.ts` |
| Browser parity slices | `tests/browser/threejs-parity-*.spec.ts` |

## Current Local Snapshot

The generated report tree currently records the inventory, same-scene, and visual-review reports as passing. The local performance aggregate is not passing because several performance evidence files are missing from the current report tree.

## Accurate Claim Shape

Use evidence-scoped wording: A3D matches selected measured Three.js workflows where current package code, routes, tests, and reports prove the match.

Avoid unqualified claims such as "better than Three.js" or "full Three.js replacement" unless the current claim-defense and superiority reports pass for that exact wording.
