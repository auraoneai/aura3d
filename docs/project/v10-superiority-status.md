# V10 Superiority Status

Generated status target: V10 claim defense and superiority audit.

## Current Public Claim

G3D matches or exceeds Three.js in the measured graphics, animation, asset, physics, performance, memory, and developer-workflow categories documented by the V10 superiority audit.

This status is evidence-bound. Public wording should cite the reports below instead of relying on slogans.

## Decision Matrix

| Category | Decision | Primary evidence |
|---|---|---|
| Feature coverage | Parity | `tests/reports/v10/feature-parity.json`, `tests/reports/v9/threejs-inventory.json` |
| Graphics and visual quality | Parity | `tests/reports/v10/visual-quality.json`, `tests/reports/v9/visual-review.json`, `tests/reports/v9/same-scene-render.json` |
| Animation fidelity | Parity | `tests/reports/v10/animation-fidelity.json`, V9 animation/skinning/morph parity reports |
| Physics and interaction | Parity with workflow advantage | `tests/reports/v10/physics-fidelity.json`, `tests/reports/v10/physics-comparison-baseline.json`, `apps/v8-physics-showcase/` |
| Performance | Parity or better on measured set | `tests/reports/v10/performance.json`, `tests/reports/v9/performance.json`, `tests/reports/comparison-threejs.json`, `tests/reports/v9/instancing-parity.json` |
| Asset pipeline | Parity | `tests/reports/v9/threejs-inventory.json`, asset loader tests, glTF/material/compression route reports |
| WebGPU/WebGL2 | Parity for measured routes | `tests/reports/webgpu-hardware-matrix.json`, V8 WebGPU route screenshots, renderer tests |
| Stability and memory | Exceeds | `tests/reports/v10/memory-lifecycle.json`, `tests/reports/v10/resource-lifecycle-100-reloads.json` |
| Developer workflow | Exceeds | `tests/reports/v10/developer-workflow.json`, package smoke, external consumer, migration, and API docs reports |
| Documentation and GTM | Exceeds when claim-defense passes | `tests/reports/v10/claim-defense.json`, README, current-state, competitive positioning, GTM docs |

## Feature Coverage

`tests/reports/v9/threejs-inventory.json` tracks 54 Three.js example/workflow rows. The current inventory records all rows as `matched`, zero unsupported rows, zero open high-priority rows, and evidence links to package code, unit tests, browser tests, and screenshots.

Covered areas include:

- animation and skinning;
- glTF/GLB, OBJ/MTL, KTX2/Basis, Draco, Meshopt, HDR/EXR, material extensions, variants, and render resources;
- materials, PBR, transmission, clearcoat, sheen, anisotropy, shadows, and postprocess;
- controls, picking, decals, cameras, helpers, lines, points, sprites, instancing, stereo effects, WebGPU, and WebXR.

## Visual Quality

Visual quality is measured through:

- `tests/reports/v9/visual-review.json`
- `tests/reports/v9/same-scene-render.json`
- V9 same-scene side-by-side reports for glTF, material grid, lights, shadows, bloom, animation, skinning, morphs, decals, stereo, parallax, and interactive examples.

The V10 visual gate requires accepted visual status for the inventory and passing same-scene reports before the public claim advances.

## Animation

Animation evidence covers:

- imported GLB clip playback;
- AnimationMixer-style sampling;
- skinning palette updates;
- additive layers;
- blend weights;
- IK;
- morph targets;
- root-motion and clone sampling;
- side-by-side G3D and Three.js routes for keyframes, multiple animation, walk, skinning blend, skinning additive, skinning IK, and morph targets.

Primary reports:

- `tests/reports/v9/animation-keyframes-parity.json`
- `tests/reports/v9/animation-multiple-parity.json`
- `tests/reports/v9/animation-walk-parity.json`
- `tests/reports/v9/skinning-additive-parity.json`
- `tests/reports/v9/skinning-blending-parity.json`
- `tests/reports/v9/skinning-ik-parity.json`
- `tests/reports/v9/morphtargets-parity.json`
- `tests/reports/v10/animation-fidelity.json`

## Physics And Interaction

Physics and interaction evidence covers:

- rigid bodies;
- colliders;
- constraints;
- raycasts;
- character controller helpers;
- rendered physics route diagnostics;
- picking and point thresholds;
- decals;
- controls;
- WebXR controller target-ray/grip pose sampling, haptics, trigger/squeeze input, and AR hit-test sampling.

Primary evidence:

- `packages/physics/src/PhysicsWorld.ts`
- `packages/physics/src/RigidBody.ts`
- `packages/physics/src/Collider.ts`
- `packages/physics/src/Constraints.ts`
- `packages/physics/src/CharacterController.ts`
- `packages/physics/src/Raycast.ts`
- `apps/v8-physics-showcase/src/main.ts`
- `packages/input/src/WebXRSessionController.ts`
- `tests/reports/v10/physics-fidelity.json`
- `tests/reports/v10/physics-comparison-baseline.json`

## Performance

Performance evidence includes:

- equivalent 11-scene benchmark scaffolds versus Three.js;
- tied frame-time and draw-call outcomes in the current comparison report set;
- smaller generated benchmark bundles than Three.js;
- one-draw instancing route parity;
- culling, instancing, and accelerated raycast baselines;
- browser large-scene route timing;
- 100-reload resource lifecycle gate.

Primary reports:

- `tests/reports/v10/performance.json`
- `tests/reports/v9/performance.json`
- `tests/reports/comparison-threejs.json`
- `tests/reports/v9/instancing-parity.json`
- `tests/reports/v6-performance-baselines.json`
- `tests/reports/v6-large-scene-performance.json`
- `tests/reports/v5-performance-baselines.json`
- `tests/reports/v10/resource-lifecycle-100-reloads.json`

## Stability And Memory

Stability and memory claims use explicit lifecycle reports, not garbage-collection assumptions.

Evidence includes:

- renderer/device/material/render-target disposal tests;
- WebGL delete-call accounting;
- WebGPU resource accounting;
- repeated renderer load/unload checks;
- 100 route reload resource-lifecycle evidence.

Primary reports:

- `tests/reports/v10/memory-lifecycle.json`
- `tests/reports/v10/resource-lifecycle-100-reloads.json`

## Developer Workflow

G3D’s developer workflow advantage is measured through:

- package smoke tests;
- external consumer install/build tests;
- migration audit;
- API docs generation;
- create-g3d templates;
- route registry;
- workflow-oriented packages for product, asset, material, animation, physics, WebGPU, and migration use cases.

Primary reports:

- `tests/reports/v10/developer-workflow.json`
- `tests/reports/v9/package-smoke.json`
- `tests/reports/v9/external-consumer.json`
- `tests/reports/v9/migration-audit.json`
- `tests/reports/v9/api-surface.json`
- `tests/reports/api-docs.json`

## Claim Defense

The public claim is valid only when these commands pass:

```sh
pnpm v10:claim-defense
pnpm v10:superiority-audit
```

The claim-defense report scans README and current public project docs for outdated current-state language, checks required report pass states, and requires README to link the current V10 evidence.

Primary files:

- `README.md`
- `docs/project/current-state.md`
- `docs/project/competitive-positioning.md`
- `docs/project/go-to-market-strategy.md`
- `docs/project/v10-superiority-status.md`
- `tests/reports/v10/claim-defense.json`
- `tests/reports/v10/superiority-audit.json`
