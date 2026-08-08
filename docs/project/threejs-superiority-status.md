# Three.js Comparison Status

Date: 2026-08-08
Status: scoped comparison gates passing

Aura3D passes the repository's current Three.js comparison suite for the selected,
frozen workloads. This status is deliberately narrower than universal engine or
ecosystem superiority.

## Current result

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

Public copy may cite a specific measured win or parity result when it also names the
workload, date, protocol or report, and relevant boundary. For example:

> In the frozen 2026-08-08 developer-friction scenarios, Aura3D required fewer
> authored lines than the corresponding Three.js implementations.

## What this does not permit

- No claim that Aura3D universally replaces or outperforms Three.js.
- No inference from renderer-internal evidence to the root `createAuraApp` safe API.
- No physical-device WebXR claim from the injected-session WebXR route.
- No blanket claim covering untested add-ons, assets, browsers, devices, shaders, or
  ecosystem breadth.
- No visual-quality claim beyond the named same-scene captures and thresholds.

The canonical wording rules remain
`docs/agents/claims-and-boundaries.md` and
`docs/project/superiority-evidence-workflow.md`. If an evidence artifact becomes
missing, stale, or failing, the corresponding public comparison must be removed or
downgraded.
