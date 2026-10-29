---
name: aura3d-performance
description: Measures and reduces Aura3D frame cost, draw calls, and bundle size with diagnostics, scene-kit budgets, instancing, distance LOD, frustum culling, and KTX2 textures, without turning counters into visual claims. Use when a route is slow, draw calls or bundle size exceed budget, or the task mentions `diagnostics: { overlay: true }`, `scene kit budgets`, `instances.*`, `distanceLod`, `text3D`, KTX2 texture compression, BUNDLE_SIZES, `doctor`, or `check-deploy`.
---

# Aura3D performance

Measure first, change one thing, measure again. Diagnostics counters are
evidence for performance claims only; they never prove a scene looks right.
Shared rules (claim labels, forbidden patterns, typed assets, benchmark mode)
are in [boundaries](../aura3d-core/references/boundaries.md).

## Look target

Measure with the final look active: the look sets the DPR cap, the post grade
(bloom, AO, vignette) and shadow map size — most of the frame cost you are
optimizing. `looks.appOptions(<id>)` already applies `quality: "auto"`; a
manual quality override invalidates every measurement that follows.

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and `npx @aura3d/cli@latest doctor`.
   Fix doctor failures before profiling; warnings are listed separately.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Note each asset's
   `sizeBytes`, texture list, and bounds; heavy GLBs and uncompressed textures
   are usually the first cost.
3. Check which entry the app imports. `@aura3d/lean` was retired in 4.0.0
   (the package is a deprecated shim), so import from `@aura3d/engine` and its
   subpaths (`@aura3d/engine/game`, `@aura3d/engine/devtools`). Size is a known
   weak spot: a one-cube app built from 4.1.2 measured 3,841 KB raw JS (1,089 KB
   gzip) over about 25 requests, against 496 KB / 125 KB for the equivalent
   three.js app (`evidence/vs-threejs/RESULTS-4.5.0.md`, section 4), and
   `BUNDLE_SIZES.md` records the engine critical path failing its budget.
   Import only what the route uses and keep devtools and cinematic helpers out
   of the critical path.
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
2. Compare against the budget for the kit you started from. Each scene kit
   reports its own budget in its `diagnostics`:

   ```ts
   import { sceneKits } from "@aura3d/engine";

   console.log(sceneKits.miniGolf().diagnostics);
   ```

   Budgets carry `maxDrawCalls`, `estimatedDrawCalls`, `maxGzipBytes`, and
   `targetP50Fps`. FPS targets require calibration on the measuring machine.
   (There is no root `sceneKitPerformanceBudget` export; do not import one.)
3. Many repeated objects: replace per-node primitives with one `instances.box`
   (or `instances.sphere`, `instances.plane`, `instances.cylinder`,
   `instances.capsule`, `instances.torus`) node with a transform list. Advanced
   PBR extensions can fall back to expanded draws, so confirm native instanced
   submissions in diagnostics before claiming one draw.
   Repeated `model()` nodes of one asset share decoded textures (4.1) but still
   upload geometry per node: use `instances.model` for repeats. `instances.mesh` and
   `batched.mesh` apply texture maps since 4.1; older builds drew them white.
   An empty instance array is a no-op with an `INSTANCES_EMPTY` diagnostic, not a
   crash, so plan for zero placements instead of special-casing them.
4. Scattered props (trees, rocks, lamps, houses): plan placements with
   `scatterAlongPath` or `scatterInArea` (seeded, exclusion zones, `minDistance`,
   slope and height filters), split them by distance with `splitScatterByDistance`
   (detailed model near, cheap instance far), and feed `scatterTransforms` into
   `instances.model` / `instances.*`. Bake static sets that share a material with
   `mergeStatic` / `mergeStaticByKey` (one draw per material). Turn off shadow
   casting on small props and actors: the ports went from 1,249, 1,980 and 677
   draw calls to 133, about 100 and 137 this way, with the look unchanged.
   Distant detail: use `distanceLod` with increasing `maxDistance` levels and a
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
9. Bundle: avoid pulling devtools or cinematic helpers into the critical path
   and measure with a production `vite build`. In the Aura3D monorepo,
   `pnpm check:bundle-size` regenerates BUNDLE_SIZES; never raise a budget to
   manufacture a pass.
10. Ship check: `npm run build`, then
    `npx @aura3d/cli@latest check-deploy --dist dist`. Browser frame-time and
    screenshot runs (`npm run test`, Playwright) go to a remote runner, never
    local Playwright or GitHub Actions (`tools/remote-acr/run.sh` in the Aura3D
    repository).

## Stop and report

- `doctor` or `check-deploy` fails: stop and fix that first; label `blocked`.
- A win is measured on one machine only: call it directional, name the
  machine and workload, and do not generalize it to a frame-time guarantee.
- A performance change alters the rendered scene: rerun screenshot review
  through `aura3d-evidence-review` before shipping.
- GPU timing is unavailable or noisy on the device: say so; do not fill in.
- Numbers came from a software renderer (SwiftShader): they prove draw-call
  counts and correctness, not frame rate. Say "software GL" and ask for a real GPU run.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Profiling and diagnostics](https://github.com/auraoneai/aura3d/blob/main/docs/debug/profiling-and-diagnostics.md)
- [Bundle sizes](https://github.com/auraoneai/aura3d/blob/main/BUNDLE_SIZES.md)
- [Texture compression](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/texture-compression.md)
- [Geometry, instancing, LOD, text](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/geometry-instancing-lod-text.md)
- [Scatter and merge](https://github.com/auraoneai/aura3d/blob/main/docs/api/scatter-merge.md)
- [Deployment](https://aura3d.auraone.ai/docs/deployment.html)
