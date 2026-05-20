# Rebuild Progress Summary

This page replaces the old generated rebuild ledger with a compact current-state summary.

## What Changed

The rebuild phase produced the package skeleton, route suite, verification tools, and early subsystem coverage. The current project has moved beyond rebuild planning into V8/V9 parity construction.

The stale build-era documents were collapsed into `docs/project/documentation-index.md`; current work should use the V9 roadmap and reports.

## Current Progress

Completed or materially implemented areas include:

- First-party math, transform, camera, bounds, frustum, ray, and scene hierarchy foundations.
- WebGL2 render paths with shader/material binding, queue sorting, state caching, instancing, diagnostics, and resource disposal.
- WebGPU proof routes for render targets, compute particles, PBR materials, and instanced uniform submission.
- glTF/GLB loading, render-resource conversion, skins, morphs, animations, cameras, lights, material extensions, variants, compressed texture hooks, meshopt/Draco hooks, HDR/EXR, and OBJ support.
- Animation mixer, clips, skeletons, skinning palettes, additive/masked blending, root motion, IK, morph target controls, and motion-quality diagnostics.
- PBR/HDR/IBL foundations including Cook-Torrance-style shading, GGX/Smith/Fresnel helpers, physical material descriptors, environment controls, and BRDF/IBL work.
- Postprocessing foundations including render targets, fullscreen passes, bloom, depth of field, SSAO, outline, and composer-style chains.
- Product, asset, material, character, loader, controls, postprocess, WebGPU, WebXR, and parity routes under `apps/`.

## Still In Progress

- Full Three.js parity.
- Broad visual-quality parity.
- Real WebGPU production maturity.
- Complete WebXR coverage.
- Complete glTF ecosystem coverage.
- Full sprite/fat-line/helper parity.
- Public GTM readiness beyond scoped alpha workflows.

## Current Reports

- `tests/reports/v9/completion-audit.json`
- `tests/reports/v9/threejs-inventory.json`
- `tests/reports/v9/route-health.json`
- `tests/reports/v9/performance.json`
- `tests/reports/v9/same-scene-render.json`
- `tests/reports/v9/visual-review.json`
