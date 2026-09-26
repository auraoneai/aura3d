---
name: aura3d-performance
description: Measures and reduces Aura3D frame cost, draw calls, and bundle size with diagnostics, scene-kit budgets, instancing, distance LOD, frustum culling, and KTX2 textures, without turning counters into visual claims. Use when a route is slow, draw calls or bundle size exceed budget, or the task mentions `diagnostics: { overlay: true }`, `sceneKitPerformanceBudget`, `instances.*`, `distanceLod`, `text3D`, KTX2 texture compression, BUNDLE_SIZES, `doctor`, or `check-deploy`.
---

# Aura3D performance

Measure first, change one thing, measure again. Diagnostics counters are
evidence for performance claims only; they never prove a scene looks right.
Shared rules (claim labels, forbidden patterns, typed assets, benchmark mode)
are in [boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and `npx @aura3d/cli@latest doctor`.
   Fix doctor failures before profiling; warnings are listed separately.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Note each asset's
   `sizeBytes`, texture list, and bounds; heavy GLBs and uncompressed textures
   are usually the first cost.
3. Check which entry the app imports. New product and game apps should use
   `@aura3d/lean`, `@aura3d/lean/product`, or `@aura3d/lean/game`. The
   `@aura3d/engine` root is a compatibility entry and is far over the new-app
   gzip budget.
4. Decide the mode. Benchmark mode: `npm install && npm run build`, then stop.
   No profiling, dev server, or browser capture from the agent.

## Procedure

1. Turn diagnostics on while measuring and off for release screenshots:

   ```ts
   createAuraApp("#app", { scene, diagnostics: { overlay: true, performancePanel: true } });
   ```

   The app's diagnostics report `backend`, `fps`, `drawCalls`, `renderSize`,
   asset load states, `warnings`, and `errors`. Record them with the viewport,
   device, and route so the finding reproduces.
2. Compare against the budget for the kit you started from:

   ```ts
   import { sceneKitPerformanceBudget, sceneKits } from "@aura3d/engine";

   console.log(sceneKitPerformanceBudget("miniGolf"));
   console.log(sceneKits.miniGolf().diagnostics);
   ```

   Budgets carry `maxDrawCalls`, `estimatedDrawCalls`, `maxGzipBytes`, and
   `targetP50Fps`. FPS targets require calibration on the measuring machine.
3. Many repeated objects: replace per-node primitives with one `instances.box`
   (or `instances.sphere`, `instances.plane`, `instances.cylinder`,
   `instances.capsule`, `instances.torus`) node with a transform list. Advanced
   PBR extensions can fall back to expanded draws, so confirm native instanced
   submissions in diagnostics before claiming one draw.
4. Distant detail: use `distanceLod` with increasing `maxDistance` levels and a
   `hysteresis` band so the camera cannot flap between levels.
5. Large scenes: rely on CPU frustum culling plus the static-bounds BVH. Give
   custom geometry explicit bounds via `geometry.custom`. There is no GPU
   occlusion culling; do not claim it.
6. Text: `text3D` is extruded mesh text (A-Z, 0-9, space, dash, period);
   `labels.billboard` is DOM UI. Pick by need, not to save draws.
7. Particles: check `particles.diagnostics` for total particles and
   estimated update cost before raising counts.
8. Textures: prefer KTX2/Basis-compressed textures supplied through typed
   assets. Compression support is bounded to the tested decoder paths; verify
   in the browser before claiming a memory or load-time win.
9. Bundle: keep new imports on the lean entry and avoid pulling devtools or
   cinematic helpers into the critical path. In the Aura3D monorepo,
   `pnpm check:bundle-size` regenerates BUNDLE_SIZES; never raise a budget to
   manufacture a pass.
10. Ship check: `npm run build`, then
    `npx @aura3d/cli@latest check-deploy --dist dist`. Browser frame-time and
    screenshot runs (`npm run test`, Playwright) go to CI or a remote runner.

## Stop and report

- `doctor` or `check-deploy` fails: stop and fix that first; label `blocked`.
- A win is measured on one machine only: call it directional, name the
  machine and workload, and do not generalize it to a frame-time guarantee.
- A performance change alters the rendered scene: rerun screenshot review
  through `aura3d-evidence-review` before shipping.
- GPU timing is unavailable or noisy on the device: say so; do not fill in.
- Benchmark mode: stop after the build and report the runner-owned command.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Profiling and diagnostics](https://github.com/auraoneai/aura3d/blob/main/docs/debug/profiling-and-diagnostics.md)
- [Bundle sizes](https://github.com/auraoneai/aura3d/blob/main/BUNDLE_SIZES.md)
- [Texture compression](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/texture-compression.md)
- [Geometry, instancing, LOD, text](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/geometry-instancing-lod-text.md)
- [Deployment](https://aura3d.auraone.ai/docs/deployment.html)
