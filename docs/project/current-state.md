# Current G3D State

This document summarizes the current repository state for the V10 superiority gate on May 17, 2026.

## What G3D Is

G3D is a TypeScript browser 3D engine and workflow SDK with package-level runtime code for math, scene graphs, rendering, assets, animation, controls, input, physics, workflows, debugging, editor/runtime utilities, and Three.js migration helpers.

The current release position is evidence-bound: G3D matches or exceeds Three.js in the measured categories covered by the V10 audit reports and by [docs/project/v10-superiority-status.md](/Users/gurbakshchahal/G3D/docs/project/v10-superiority-status.md).

## Package Surface

The root package is `@galileo3d/engine`. Public exports include:

- `.` and `./engine`
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
- `./animation`
- `./animation/browser`
- `./assets`
- `./assets/browser`
- `./input`
- `./audio`
- `./apps`
- `./three-compat`
- `./create-g3d`
- `./scripting`
- `./workflows`
- `./workflows/production-runtime`
- `./editor-runtime`
- `./editor`
- `./debug`
- `./rendering/production-runtime`
- `./rendering/v9`
- `./assets/production-runtime`
- `./assets/v9`
- `./production-runtime`
- `./v9`

Workspace packages include `animation`, `apps`, `assets`, `audio`, `controls`, `core`, `create-g3d`, `debug`, `ecs`, `editor`, `editor-runtime`, `engine`, `environments`, `input`, `materials`, `math`, `physics`, `product-studio`, `rendering`, `scene`, `scripting`, `three-compat`, and `workflows`.

## V9 And V10 Evidence

V9 provides the feature inventory, same-scene comparison routes, visual review, performance report, migration audit, package smoke tests, and route-health evidence.

V10 consumes that evidence and produces the current superiority decision matrix:

- `tests/reports/v10/feature-parity.json`
- `tests/reports/v10/visual-quality.json`
- `tests/reports/v10/performance.json`
- `tests/reports/v10/animation-fidelity.json`
- `tests/reports/v10/physics-fidelity.json`
- `tests/reports/v10/memory-lifecycle.json`
- `tests/reports/v10/developer-workflow.json`
- `tests/reports/v10/claim-defense.json`
- `tests/reports/v10/superiority-audit.json`

`tests/reports/v9/threejs-inventory.json` currently tracks 54 Three.js example/workflow rows with all rows marked `matched`, zero high-priority open rows, and browser/unit/report evidence attached to the inventory entries.

## Real Code Areas

Real runtime code exists for:

- Vectors, matrices, quaternions, colors, rays, bounds, frustums, projection, transforms, cameras, and hierarchy math.
- Object3D-style parent/child transform inheritance, matrix auto-update, cameras, lights, renderables, layers, serialization, and renderer traversal.
- WebGL2 rendering, renderer diagnostics, render targets, shader/material binding, PBR materials, state caching, render queue sorting, culling, instancing, shadows, postprocess, and explicit resource disposal.
- WebGPU render-targets, compute particles, PBR materials, instanced uniform submission, hardware probe reports, texture/readback paths, and fallback diagnostics.
- GLTF, GLB, OBJ/MTL, HDR/EXR, image/texture/KTX2/Basis-facing loading helpers, material extensions, variant selection, renderable-scene conversion, and asset diagnostics.
- Animation clips, tracks, mixers, layers, skinning, skeletons, root motion, IK, locomotion, clone sampling, morph targets, and motion-quality diagnostics.
- Orbit, trackball, transform, drag, map, first-person, fly, pointer-lock, picking, point thresholds, decals, WebXR controller sampling, AR hit-test sampling, and selection controls.
- Debug helpers, GPU/resource diagnostics, report exporters, scene helper line builders, route health, and resource leak detection.
- Workflow templates and routes for product, asset, material, scene, architecture, character, WebGPU, WebXR, postprocess, physics, and migration usage.
- Three.js compatibility and migration-adapter code in `packages/three-compat`.

## How Users Should Interpret The Current State

Use G3D when evaluating:

- Product viewers and configurators.
- Asset ingestion, diagnostics, and GLB/glTF inspection.
- PBR/HDR material review and environment setup.
- Animation, skinning, morph, IK, root-motion, and clone-sampling workflows.
- Physics, picking, controls, decals, postprocess, WebGPU/WebGL2, and WebXR route coverage.
- Migration from selected Three.js patterns into package-owned G3D workflows.

The current claim should stay tied to generated evidence:

> G3D matches or exceeds Three.js in the measured graphics, animation, asset, physics, performance, memory, and developer-workflow categories documented by the V10 superiority audit.

## GTM Framing

The accurate GTM story is workflow-first browser 3D with measurable superiority where the reports cover the claim:

- faster time to product viewer and asset inspector;
- built-in diagnostics for assets, renderer state, route health, animation motion, and resource lifecycle;
- first-party package boundaries across renderer, assets, animation, controls, materials, environments, product-studio, physics, input, and workflows;
- parity and superiority reports that point to source code, tests, browser routes, screenshots, and benchmark evidence.

Lead with developer trust, diagnostics, workflow speed, and reproducible proof. The current evidence files are the source of truth for public claims.
