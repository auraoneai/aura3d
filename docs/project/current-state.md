# Current A3D State

Version: 1.0.0

This document summarizes the current repository state as of this documentation audit.

## What A3D Is

A3D is a TypeScript-first browser 3D engine and workflow SDK with package-level runtime code for math, scene graphs, rendering, assets, animation, controls, input, physics, workflows, debugging, editor/runtime utilities, and Three.js migration helpers.

## Package Surface

The root package is `@aura3d/engine`. Public subpaths are defined in `package.json` and include:

- `.`, `./engine`, and `./engine-runtime`
- `./core`
- `./math`
- `./scene`
- `./ecs`
- `./rendering`
- `./controls`
- `./environments`
- `./materials`
- `./physics`
- `./product-studio`
- `./animation` and `./animation/browser`
- `./assets` and `./assets/browser`
- `./input`
- `./audio`
- `./apps`
- `./three-compat`
- `./create-aura3d`
- `./scripting`
- `./workflows`, `./workflows/production`, and `./workflows/production-runtime`
- `./editor-runtime`
- `./editor`
- `./debug`
- `./production-runtime`
- `./advanced-runtime`

Versioned compatibility aliases have been removed from the public export map. Use contextual entrypoints such as `./production-runtime`, `./three-compat`, `./advanced-runtime`, `./rendering`, and `./assets`.

## Real Code Areas

Runtime code exists for:

- vectors, matrices, quaternions, colors, rays, bounds, planes, frustums, projection, transforms, cameras, and hierarchy math;
- Object3D-style scene hierarchy, cameras, lights, renderables, instancing, serialization, and renderer traversal;
- WebGL2 and WebGPU-facing renderer/device code, state caching, render queues, materials, shaders, textures, render targets, postprocess, shadows, diagnostics, and disposal;
- glTF/GLB, OBJ/MTL, HDR/EXR, image/texture/KTX2-facing helpers, material extensions, variants, render-resource conversion, and asset diagnostics;
- animation clips, tracks, mixers, layers, skeletons, skinning, root motion, IK, retargeting, crowd animation, morph targets, and motion diagnostics;
- orbit, trackball, transform, drag, map, first-person, fly, pointer-lock, picking, decals, WebXR controller sampling, AR hit-test sampling, and interaction controls;
- rigid bodies, colliders, constraints, broadphase, raycasts, character helpers, and scene sync;
- workflow templates and routes for product, asset, material, scene, architecture, character, WebGPU, WebXR, postprocess, physics, and migration usage.

## Current Evidence Snapshot

The current local report tree contains passing generated Three.js parity and superiority reports after the latest evidence run:

- `tests/reports/threejs-parity/threejs-inventory.json`: passing, 54 tracked rows marked matched.
- `tests/reports/threejs-parity/same-scene-render.json`: passing.
- `tests/reports/threejs-parity/visual-review.json`: passing.
- `tests/reports/threejs-parity/performance.json`: passing.
- `tests/reports/superiority/feature-parity.json`: passing.
- `tests/reports/superiority/visual-quality.json`: passing.
- `tests/reports/superiority/performance.json`: passing.
- `tests/reports/superiority/animation-fidelity.json`: passing.
- `tests/reports/superiority/physics-fidelity.json`: passing.
- `tests/reports/superiority/resource-lifecycle-100-reloads.json`: passing.
- `tests/reports/superiority/memory-lifecycle.json`: passing.
- `tests/reports/superiority/developer-workflow.json`: passing.
- `tests/reports/superiority/claim-defense.json`: passing.
- `tests/reports/superiority/superiority-audit.json`: passing.

`tests/reports/` is ignored by git, so clean checkouts and release jobs must regenerate these reports before reusing the same claim.

## Current Claim Boundary

Use evidence-scoped language. It is accurate to say A3D has first-party packages and passing local generated evidence for the currently measured Three.js parity and superiority categories. Do not broaden that into unqualified claims such as full Three.js replacement, Unity/Unreal replacement, or complete coverage for every browser 3D use case.
