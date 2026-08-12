# Three.js Comparison Status

Date: 2026-08-11
Status: 15 current installed-package correctness workloads pass; clean Linux reproduction retained; independent human review pending

Aura3D passes all 15 selected correctness workloads from 29 freshly packed and
npm-installed 2.0.0 tarballs against repository-locked `three@0.185.1`. Every
workload retains its public entry, exact inputs, explicit verdict, visual losses,
and claim boundary in `tests/reports/current-head-to-head/aggregate.json`.
`tests/reports/current-head-to-head-installed/report.json` binds that result to
the source commit, lock hash, tarball hashes, isolated consumer, and browser
specs. The aggregate deliberately reports `comparisonComplete: false` until
the independent gallery review is recorded. The broad repeated-performance
matrix is not a 2.0 release claim: directional timings cannot establish a
performance win or non-inferiority verdict.

The historical suite against `three@0.165.0` remains useful only for regression
history. It is not a current-market parity, superiority, or replacement verdict.

## Current r185.1 result

- 15/15 selected installed-package correctness workloads pass.
- One bounded build-output-size win is recorded for the selected scaffold
  workload; three deterministic adapter traces record parity.
- Every workload publishes losses. Aura remains visibly different in several
  material, lighting, bloom, and output-treatment pairs and often submits more
  draws in the selected asset-heavy scenes.
- Performance non-inferiority is not claimed. The proposed
  120-warmup/600-frame/five-session universal protocol was removed from the 2.0
  release scope with the corresponding public performance claim.
- Clean Linux reproduction is retained in
  `docs/project/status/2.0-clean-environment-reproduction.md`: 23/24 browser
  assertions pass without GPU passthrough, and the native WebGPU row passes on
  the host hardware profile. Independent human gallery review remains open.
- Ecosystem breadth, general TSL/node-material ergonomics, and real-device XR
  remain explicitly unproven.

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
