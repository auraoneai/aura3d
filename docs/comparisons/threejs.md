# G3D and Three.js

G3D should be compared to Three.js by evidence category, not by blanket parity language. The current repo has meaningful local proof in benchmark scaffolds, visual parity slices, animation/skinning comparisons, route health, and WebGPU probes. It still does not prove that G3D is a general Three.js replacement.

## Current Classification

| Category | Current classification | Evidence |
|---|---|---|
| Benchmark scaffold | G3D has equivalent checked-in scaffold scenes and smaller generated benchmark bundles on the recorded run. | `tests/reports/comparison-threejs.json`, `tools/compare-engines/index.ts`, `benchmarks/shared/scenes/*.ts` |
| Rendered same-scene parity | Partial but real. V6 and V9 include retained G3D/Three.js/diff artifacts. | `tests/reports/production-runtime-threejs-parity-readiness.json`, `tests/reports/production-runtime-threejs-parity/**`, `tests/reports/v9/*-parity.json` |
| Official example inventory | Partial. 54 examples/categories inventoried, 30 matched, 24 partial, 0 high-priority open in the recorded report. | `tests/reports/v9/threejs-inventory.json`, `tests/reports/v9/official-example-parity.json` |
| Visual review | Partial. 30 accepted, 24 needing review. | `tests/reports/v9/visual-review.json` |
| Animation/skinning | Bounded parity slices exist against actual Three.js AnimationMixer. | `tests/reports/v9/animation-keyframes-parity.json`, `tests/reports/v9/animation-walk-parity.json`, `tests/reports/v9/skinning-additive-parity.json`, `tests/reports/v9/skinning-blending-parity.json`, `tests/reports/v9/skinning-ik-parity.json` |
| glTF loader | Bounded same-asset proof exists for selected assets. | `tests/reports/v9/gltf-parity.json`, `tests/reports/asset-compatibility-threejs.json` |
| Postprocess/effects | Bounded slices exist for bloom, stereo, parallax, decals, shadows, and lights. | `tests/reports/v9/unreal-bloom-parity.json`, `tests/reports/v9/stereo-parity.json`, `tests/reports/v9/parallax-parity.json`, `tests/reports/v9/decals-parity.json`, `tests/reports/v9/shadowmap-parity.json`, `tests/reports/v9/physical-lights-parity.json` |
| WebGPU | G3D has local hardware and readiness evidence, but not broad Three.js WebGPU parity. | `tests/reports/webgpu-hardware-matrix.json`, `tests/reports/production-runtime-webgpu-readiness.json`, `tests/reports/v9/threejs-inventory.json` |
| Ecosystem maturity | Three.js stronger. | Current local evidence cannot match public ecosystem, examples, integrations, docs, Stack Overflow/GitHub history, and production usage. |

## Practical Use Cases Today

Use G3D today for:

- internal product viewers and material/asset labs where the app can use repo-pinned assets and tests;
- browser-first TypeScript demos that need direct control over engine packages and validation artifacts;
- migration experiments where Three.js behavior is compared through local parity reports;
- animation/skinning/material investigations where bounded G3D and Three.js screenshots are retained.

Use Three.js today when the project needs:

- maximum public examples and community support;
- broad loader/material compatibility without custom validation;
- mature controls, postprocessing examples, and third-party ecosystem;
- production confidence without building your own evidence matrix.

## Claim Boundary

Allowed:

- G3D has bounded same-scene and same-asset parity evidence against actual Three.js paths.
- G3D has a local evidence-backed roadmap for Three.js parity.
- G3D generated smaller esbuild browser benchmark bundles for the checked-in scaffold scenes on the recorded comparison run.

Blocked:

- G3D is faster than Three.js.
- G3D is fully compatible with Three.js.
- G3D exceeds Three.js in every sense.
- G3D is production-ready wherever Three.js is production-ready.

Before any stronger claim, update the claim registry and cite fresh reports for browser/device coverage, visual review acceptance, release package bundle size, memory lifecycle, asset corpus breadth, and production app traces.
