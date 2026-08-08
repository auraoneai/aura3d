# Three.js Comparison Status

Date: 2026-08-08
Status: historical `three@0.165.0` scoped comparison; current-market comparison incomplete

Aura3D passes the repository's historical Three.js comparison suite for the
selected frozen workloads against `three@0.165.0`. This evidence remains useful
for regression history, but it is not a current-market parity, superiority, or
replacement verdict. The current comparison target is `three@0.185.1`, locked in
`benchmark/context/threejs-r185.1-20260808.json`; its full workload program is
still in progress under `1.6-FINAL-PRD-Finishes.md`.

## Historical frozen result

- The generated Three.js inventory contains 54 example-level rows, all marked
  `matched`, with zero high-priority rows open.
- Same-scene visual, animation, performance, physics, resource-lifecycle,
  developer-workflow, and migration reports pass for their named fixtures and
  thresholds.
- The frozen developer-friction scenarios use fewer authored lines in all three
  bundle scenarios and in all seven product-workflow comparisons.
- The 100-reload resource-lifecycle proof reports no tracked-resource leaks.

The aggregate decision is generated at
`tests/reports/superiority/claim-defense.json`. The underlying inventory is generated
at `tests/reports/threejs-parity/threejs-inventory.json`.

## What this permits

Public copy may cite a specific historical measured result only when it also names
`three@0.165.0`, the workload, date, protocol or report, and relevant boundary. It
may not describe that result as current. For example:

> In the frozen 2026-08-08 developer-friction scenarios against
> `three@0.165.0`, Aura3D required fewer authored lines than the corresponding
> implementations.

## What this does not permit

- No claim that Aura3D universally replaces or outperforms Three.js.
- No inference from renderer-internal evidence to the root `createAuraApp` safe API.
- No physical-device WebXR claim from the injected-session WebXR route.
- No blanket claim covering untested add-ons, assets, browsers, devices, shaders, or
  ecosystem breadth.
- No visual-quality claim beyond the named same-scene captures and thresholds.
- No claim that the 54-row historical inventory covers Three.js r185, current
  WebGPU/TSL/node-material behavior, or the current companion ecosystem.

The canonical wording rules remain
`docs/agents/claims-and-boundaries.md` and
`docs/project/superiority-evidence-workflow.md`. If an evidence artifact becomes
missing, stale, or failing, the corresponding public comparison must be removed or
downgraded.
