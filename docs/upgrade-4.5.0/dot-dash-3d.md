# Glint Courier (`dot-dash-3d`): upgrading to Aura3D 4.5.0

**Verdict:** Recommended changes. The game compiles and runs unchanged on 4.5.0. Its lighting reads a little brighter (mean luma 25.0 on 4.3.7, 29.5 on 4.5.0 in a remote software-GL capture) because the hemisphere light now contributes. The `neon-arcade` look's fill is dropped here, since the scene authors `lights.ambient`. Capture before and after and tune if needed.

## What this game uses

- Entry: `apps/showcase-dot-dash-3d/src/main.ts`. One `createGame(...)` call from `@aura3d/engine/game` (line 42). No direct `createAuraApp`. Options: `diagnostics`, `scene`, `input`, `hud`, `touch`, `sound`, `juice`, `qualityRebuild: { flags: ["game", "materials"] }`, `evidence`. No `quality`, `renderer`, `output` or `preserveDrawingBuffer` option. `app` is a module-local const (`main.ts:90`) and is not exposed on `window`.
- Scene: `src/game/world.ts` `buildScene()`.
  - Effects: `effects.bloom`, `effects.vignette`, `effects.fog` (lines 105-109).
  - Look: `looks.preset("neon-arcade", { fogDensityScale: 0, exposureEv: 0.05, background: "#0e1a17", accent: "#ffb23e" })` (line 110).
  - Lights: `lights.ambient` 0.92, `lights.hemisphere` 0.85, `lights.directional` 1.25 with `shadow: true` (lines 111-113). No authored `environments.*` node.
  - Materials: `material.pbr` (several with `opacity < 1`, lines 129, 167, 170) and `material.emissive` (lines 128, 179, 180).
  - Geometry: `primitives.box/sphere/cylinder` and 15 `instances.box/cylinder/sphere/polyhedron/torus/cone` pools (lines 142-156), 2 to 900 slots each (`CAP`, line 51). No models, animation, physics or interactions.
- Per-frame instancing: `syncVisuals()` writes `Float32Array` matrices plus 3-float colours and calls `setInstanceTransforms(mat, n, col)` on every pool each frame (`world.ts:416-423`).
- Canvas access: none in game code. `src/main.ts:11-13` installs `installBlackFrameGuard` from `@aura3d/debug`, which samples the canvas.
- Other: `?freeze=<ms>` pauses the app for headless capture (`main.ts:98-102`); `scripts/write-route-health.mjs`; shared CSS `apps/showcase-port-shared/quickbar.css`. Globals: `window.__AURA3D_DOT_DASH__` and `window.__gameEvidence`.
- Package: `package.json` depends on `@aura3d/engine` as `workspace:*`; there is no version pin to bump.

## What changes for this game in 4.5.0

### 1. Lighting: the `neon-arcade` look now brings an environment node (change 3)

- **What happens now:**
  - In 4.3.7 the game had no `environments.*` node. It was lit by the ambient light (0.92, no IBL) plus the directional light (the "authored-ambient" branch in `compiler/environment.ts`).
  - In 4.5.0 the `neon-arcade` look carries an `environments.neutral` fill (`lookPresets.ts` `fill`, `looks.ts` `v0Children`). Because `world.ts:111` authors `lights.ambient`, `scene.toJSON()` drops that fill (`looks/lookFill.ts`), so the scene keeps the ambient-only path. Without that rule the neutral room stacked on the ambient and the capture read 77.
  - The scene has no `environments.*` node, so the lights-only branch sums ambient and hemisphere (`explicitLightFillFree`, `environment.ts`): `lights.hemisphere` (`world.ts:112`) now adds to the ambient. That is the main difference from 4.3.7.
  - Measured (remote software GL, 1280x720, steady state, `tests/browser/game-luma-capture.spec.ts`): 25.0 on 4.3.7, 29.5 on 4.5.0 (+18%); an earlier 4.5.0 build with the baked night probe as fill read 28.2.
- **Evidence:** `src/game/world.ts:110-113`; `packages/engine/src/agent-api/looks/lookPresets.ts:356-358`; `packages/engine/src/agent-api/looks/looks.ts:299-302`; `packages/engine/src/agent-api/compiler/environment.ts` (authored-environment branch ~94-165; `prd02AmbientTerm` ~246-290; `prd02.explicit` and `prd02.neutral-room` sources ~534-560); `compiler/renderer.ts:152` and `:188`; `compiler/observations.ts:333`.
- **What to do:** Capture the same frame on 4.3.7 and 4.5.0, then compare. If the board is too dark or the warm amber/cyan balance drifted, raise the intensities in `world.ts` or the `exposureEv` override on `looks.preset(...)` (line 110). If it is too bright, lower them. For example, to push warmth back after a darker result:

```ts
.add(lights.ambient({ color: "#ffe9cc", intensity: 1.1 }))
.add(lights.directional({ position: [8, 22, 12], target: [0, 0, 0], color: "#fff2dc", intensity: 1.4, shadow: true }))
```

  The numbers above are placeholders, not measured values. `lights.hemisphere` now contributes on this scene, so lower it first if the board reads too bright.
- **How to check:** Run `npm run dev` (port 5181) and open `/?capture=1&autostart=1` on both versions, or use the remote runner (`tools/remote-acr/run.sh`) for browser captures. Compare the title and `?maze=classic` play frames. Also run `node tools/game-checks/run.mjs dot-dash-3d`.

### 2. Render path stays HDR; confirm it (change 1)

- **What happens now:** `quality` defaults to `"auto"`. The scene authors bloom, vignette, emissive materials and transparent materials, each of which is a direct-path blocker, so it keeps the HDR chain. Expect no change in pipeline.
- **Evidence:** `src/game/world.ts:105-106, 128-130, 167, 170, 179-180`; `packages/engine/src/agent-api/app/renderPath.ts:103-143` (`renderPathBlockers`).
- **What to do:** Nothing required. To pin the old pipeline byte-for-byte, add `quality: "production"` to the `createGame({...})` options in `main.ts` (the option is forwarded to the app options at `packages/game/src/createGame.ts:105-113`).
- **How to check:** `app` is module-local in `main.ts`, so the console cannot see it. Temporarily add `(window as any).__app = app;` after `main.ts:90` (do not commit it), then in the console `__app.diagnostics().renderPath` should report `path: "hdr-msaa"` and `quality: "auto"`. If it reports `direct`, a blocker was removed.

### 3. Bloom fusion and shadow cascade skipping are automatic (changes 7 and 6)

- **What happens now:** With `auto`, the bloom chain is fused (frames within 1/255 of the separable chain), and shadow cascades no receiver selects are skipped. Both are pixel-neutral by design.
- **Evidence:** `src/game/world.ts:105`; `packages/engine/src/agent-api/app/renderPath.ts:24-43`; `packages/engine/src/agent-api/compiler/renderer.ts:123-126`.
- **Measured (audit lane E1, RP-05):** on the same paused frame, `auto` against the production pass sequence differs by 2.18 and 2.16/255 mean RGB in two runs. Repeating the `auto` frame differs by 1.05 and 1.03/255, so about 1.1/255 of the difference is the fused bloom and cascade skip, and the rest is frame-to-frame motion. The maximum pixel difference (223) is the same in both comparisons, so the largest changes come from animated pixels, not from the bloom.
- **Decision:** keep `quality: "auto"`. A 1.1/255 mean change cannot be seen on this dark board, and pinning `quality: "production"` would also turn off the cascade skip on a route that already presents only about 0.3 frames per second on the software-GL runner.
- **What to do:** Nothing. Option `renderer: { bloomFusion: "fused-2d" }` exists only if you want the other mode.
- **How to check:** With the temporary `__app` global, `__app.diagnostics().renderPath.bloomFusion` should be `"separable"`.

### 4. Instanced pools: dense path and empty-pool skip (change 6)

- **What happens now:**
  - `setInstanceTransforms` copies your `Float32Array` into a node-owned dense store, so reusing and mutating `POOL[k].mat` in place each frame is safe.
  - A pool with `n === 0` (markers outside school mode, eyes, the courier shell during the death blink, sentry pools while hidden) is now skipped and records an `INSTANCES_EMPTY` runtime warning. In 4.3.7 the empty slots were zero-scaled and still drawn. `INSTANCES_EMPTY` itself existed in 4.3.7 for empty instance arrays; what is new is that `n === 0` now reaches it.
  - The 3-float colour input is converted to linear RGBA and quantised to 8 bits, the same as the old hex round trip, so per-instance colours should be unchanged.
  - Pool sizes (max 900) are below the 1024 shadow-proxy and dense-depth thresholds, so those features do not engage.
- **Evidence:** `src/game/world.ts:416-423`; `packages/engine/src/agent-api/app/runtimeNodes.ts:450-478`; `packages/engine/src/agent-api/compiler/renderInput.ts:324-327`; `packages/engine/src/agent-api/nodes/game/instanceTransforms.ts` (`stubSetInstanceTransforms`, `rgbToLinearRgba`).
- **What to do:** Nothing in game code. If a QA step fails on any diagnostics warning, filter `INSTANCES_EMPTY` for these pools.
- **How to check:** `__app.diagnostics()` during play and during a death; confirm walls, rails, shards and sentries still render and colours match 4.3.7.

## Changes that do not affect this game

- Change 2 (`preserveDrawingBuffer` default false): no `readPixels`, `drawImage(canvas)`, `toDataURL`, `toBlob` or `app.screenshot()` in the game; `installBlackFrameGuard` samples in the same task as the draw (`packages/debug/src/safety/frameTap.ts`); `tests/browser/dot-dash-page-error.spec.ts` and `hf432-live-d1.spec.ts` use `page.screenshot`. Use `?capture=1` (or `?qa=1`) for any readback tooling, including captures taken after `?freeze=` if they ever come back blank.
- Change 4 (`OPTION_IGNORED`): every option the game passes (`name`, `size`, `material`, `castShadow`, `receiveShadow`, `transforms`, `params`) is read (`nodes/primitives.ts:58-64`).
- Change 5 (`interactions.orbit`): no interactions; the camera is `camera.perspective` driven by `app.camera.setPose`.
- Change 8 (`effects.contactShadows`): not used.
- Change 9 (RGBA32F effect targets): AO, depth of field, god rays, TAA, motion blur and auto exposure are not used.
- Change 10 (animation layers/masks, physics colliders): no models, animation or physics.
- Change 11 (`Clock`, step tracks, `ShapeGeometry`, `SphericalHarmonics3`, `@aura3d/math/three`): not used; the only engine math import is `createCountedRng` (`src/game/grid.ts:1`).
- Change 12 (scene kits, humanoid provenance): not used.
- Change 13 (getError sampling, allocation, warm programs): automatic; add `?diag=1` to restore per-frame GL error checks.
- Change 14 (version pins): the app uses `workspace:*`, nothing to bump.

## Checklist

- [ ] Capture the same frames (title, classic maze play, surge active) on 4.3.7 (`main`) and 4.5.0 with `?capture=1`, and compare brightness and colour (the direction of the change is not predicted).
- [ ] If the board is darker or brighter than intended, adjust `lights.ambient`, `lights.directional` or the `exposureEv` override in `src/game/world.ts:110-113`. Do not count on `lights.hemisphere` for brightness.
- [ ] Temporarily expose `app` on `window` (not committed) and confirm `diagnostics().renderPath` reports `path: "hdr-msaa"`, `quality: "auto"`, `bloomFusion: "separable"`.
- [x] Decide whether to pin `quality: "production"` in `src/main.ts`: not pinned (RP-05 measurement above).
- [ ] Check `diagnostics()` for warnings: expect `INSTANCES_EMPTY` for empty pools, and no `OPTION_IGNORED`.
- [ ] Play all six mazes: wall, rail, shard, sentry and gem pools draw correctly and per-instance colours are unchanged.
- [ ] Confirm the black-frame guard does not reload the page (`window.__AURA3D_HEAL__.rung` stays 0).
- [ ] Run `node tools/game-checks/run.mjs dot-dash-3d`.
- [ ] Run `pnpm --filter @aura3d/showcase-dot-dash-3d typecheck` and `build`, then `npm run evidence:route-health` in the app folder (build/browser runs go through the remote runner, not local).
