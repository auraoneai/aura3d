# Current Implementation Plan

Version: 1.0.0

## Status

A3D has broad first-party package coverage and current generated report evidence for tracked feature, visual, performance, animation, physics, lifecycle, developer-workflow, and claim-defense slices. The local Three.js superiority gate is passing after regenerating the contextual superiority report set.

## Product Direction

Keep A3D focused on browser 3D workflows where package-owned defaults and diagnostics are stronger than hand-assembled route code:

- product viewers and configurators;
- asset inspection and glTF/GLB validation;
- PBR/HDR/IBL material preview;
- character animation, skinning, morph, and IK diagnostics;
- interactive scenes with picking, controls, decals, shadows, and postprocess;
- migration scaffolding for selected Three.js workflows.

## Implementation Tracks

| Track | Current result |
|---|---|
| Runtime and scene | Object3D-style hierarchy, cameras, lights, transforms, renderables, serialization, and query helpers are package-backed. |
| Renderer | WebGL2/WebGPU-facing devices, render queues, postprocess, resource disposal, profiling, diagnostics, and routes exist. |
| Assets | glTF/GLB, OBJ/MTL, HDR/EXR, KTX2/Basis-facing hooks, material extensions, variants, animation, and render-resource conversion exist. |
| Animation | Mixer, skinning, morph, root-motion, IK, retargeting, crowd, palette, and motion-quality paths are represented in code and routes. |
| Workflows | Product, asset, material, animation, physics, scene, and migration workflows have package APIs and route/template coverage. |
| Verification | Current report generators live under `tools/threejs-parity-*` and `tools/superiority-*`. |

## Ongoing Work

1. Keep new features package-level, not route-local.
2. Regenerate reports before making public claims.
3. Keep benchmark claims tied to same-scene workloads and environment details.
4. Keep docs centered on current state, how-to-use, evidence, and claim boundaries.

## Verification Commands

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
pnpm threejs-parity
pnpm superiority
```
