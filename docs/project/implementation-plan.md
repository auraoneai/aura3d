# Current Implementation Plan

## Status

G3D is a production TypeScript-first browser 3D engine and workflow SDK with V10 evidence showing parity or better results against Three.js in the measured graphics, animation, asset, physics, performance, and developer-workflow categories.

Latest V10 report snapshot:

- `tests/reports/v10/superiority-audit.json`: pass.
- `tests/reports/v10/feature-parity.json`: pass.
- `tests/reports/v10/visual-quality.json`: pass.
- `tests/reports/v10/performance.json`: pass.
- `tests/reports/v10/animation-fidelity.json`: pass.
- `tests/reports/v10/physics-fidelity.json`: pass.
- `tests/reports/v10/memory-lifecycle.json`: pass.
- `tests/reports/v10/developer-workflow.json`: pass.
- `tests/reports/v10/claim-defense.json`: pass.

## Product Direction

Build G3D around scoped browser 3D workflows where the project can offer stronger defaults than raw Three.js:

- Product viewers and configurators.
- Asset inspection and glTF/GLB validation.
- PBR/HDR/IBL material preview.
- Character animation, skinning, morph targets, and IK diagnostics.
- Interactive scenes with picking, controls, decals, shadows, and postprocessing.
- Migration scaffolding for teams reducing custom Three.js surface area.

## Implementation Tracks

| Track | Current result |
|---|---|
| Runtime and scene | Object3D-style hierarchy, cameras, lights, transforms, renderable ownership, serialization, and query helpers are package-backed. |
| Renderer | WebGL2/WebGPU backends, state caching, render queues, postprocess chains, resource disposal, profiling, and diagnostics are covered by tests and V10 reports. |
| Assets | glTF/GLB, KTX2/Basis, HDR/EXR, OBJ, material extensions, variants, animation, and render-resource conversion move through public APIs. |
| Animation | Public mixer, skinning, morph, root-motion, IK, retargeting, crowd, palette, and motion-quality paths are represented in code and evidence routes. |
| Workflows | Product, asset, material, animation, physics, and migration workflows have package APIs, app routes, templates, docs, and claim-defense links. |
| Verification | V9 route health/inventory and V10 superiority reports are the active release gate. |

## Ongoing Work

1. Keep new features package-level, not route-local.
2. Extend WebGPU/device coverage as browser APIs evolve.
3. Maintain route quality checks for dimensions, color, framing, first meaningful frame, and animation fidelity.
4. Keep benchmarks honest by comparing same-scene workloads and naming exclusions.
5. Keep docs centered on current state, how-to-use, benchmarks, GTM positioning, and claim-defense evidence.

## Verification Commands

Use focused commands while developing:

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm v8:route-health
pnpm v8:threejs-parity
pnpm v9:route-health
pnpm v9:same-scene-render
pnpm v9:completion-audit
pnpm v10:superiority-audit
```

Use broader gates before release claims:

```sh
pnpm build
pnpm verify
pnpm v9
pnpm v10
```
