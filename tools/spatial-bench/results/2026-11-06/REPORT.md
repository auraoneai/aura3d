# E6-01 baseline: Aura3D vs three.js on high-frequency spatial-data workloads

Generated 2026-11-07T02:34:43.971Z by `tools/spatial-bench/report.mjs` from `runs.jsonl` (231 runs). Raw per-run data: `results.json`. Measurement only: no engine or rendering source was modified, no thresholds are asserted, and no comparative claim follows from these numbers without the evidence rules in `docs/agents/claims-and-boundaries.md`.

## 1. What was and was not run

- Machine: Mac16,6, Apple M4 Max, 16 cores, 128 GB, macOS 26.7.3 (25G416).
- Browser: Chrome/156.0.8078.80, headless=new, loopback CDP, flags `--headless=new --enable-gpu --use-angle=metal --ignore-gpu-blocklist --enable-precise-memory-info --js-flags=--expose-gc`.
- GPU string (UNMASKED_RENDERER): `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)`; vendor `Google Inc. (Apple)`; WebGL 2.0 (OpenGL ES 3.0 Chromium); drawing buffer 1280x720; devicePixelRatio 1; window 1280x720; max aliased point size 511.
- Backend: WebGL2 for both viewers (canvas contexts requested: 2d, webgl2). WebGPU was **not** run (`A3D_QR_WEBGPU` is `dev`; E6-00 section 5.1 lists it as optional).
- Libraries: Aura3D workspace@e5387f3b0358 (workspace source through `vite.aliases.generated.ts`, production vite build), three.js r185 (pinned in `package.json`/`package-lock.json`).
- Protocol: 3 s warm-up then 20 s measured per run, 3 repetitions per config and viewer, runs interleaved (rep > config > viewer), one fresh tab per run, canvas 1280x720 at DPR 1. Load average at run start is recorded per run (the machine was shared with other agent lanes: median 1-min load over all runs 9.0, max 97.9), so absolute times carry that noise; the repetition range of frame p95 is shown for that reason.
- Not measured: GC count/pause (not observable from the page), WebGPU, hardware other than this Mac, battery/thermal state, React embedding, `setScene` remount, determinism, DPR 2.
- Timer resolution: the server sends COOP/COEP so `performance.now()` is not clamped to 0.1 ms.

## 2. Equivalence of the two viewers (read before the tables)

Same seed, same generated data (`src/common/data.ts`), same pre-generated ring of 4 sensor frames replayed cyclically, same orbit camera pose per rendered-frame index, same label pass (own 50-anchor projection in `harness.ts`, view-projection taken from each library), same frame loop and measurement code. Only `src/aura/main.ts` and `src/three/main.ts` differ.

| path | Aura3D (public API only) | three.js |
|---|---|---|
| static points | `points({ positions: Float32Array, colors: string[], size, sizeAttenuation: false })`; colors must be one CSS color string per point | `Points` + `PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors })`, Uint8 normalized RGBA attribute |
| streamed points | `geometry.custom(geometry.dynamic({ topology: "points", positions, colors }))` + `handle.updateAttribute("position" and "color")`; the only mutable points path; no point-size option on a primitive (drawn at the default) and colors need Float32 RGBA (Uint8 is converted every tick, cost in `convert`) | write into the same attribute arrays, `needsUpdate = true`, Uint8 colors as-is |
| instances | `instances.box({ transforms })` + `handle.setInstanceMatrices(Float32Array, count)` | `InstancedMesh` + direct `instanceMatrix.array.set` (variant `loop` = `setMatrixAt` per instance) |
| trajectories | `lines.segments({ positions })` + `handle.updateAttribute("position")`, native 1 px lines | `LineSegments` + `LineBasicMaterial`, array write + `needsUpdate` |
| picking | `raycast({ camera, ndc }, { handles, mode: "mesh" })` | `Raycaster.intersectObject` (Points threshold 0.25) |
| lights / look | ambient + directional, default PBR material, Aura3D default renderer settings | ambient + directional, `MeshStandardMaterial`, no antialiasing |

Known non-equivalences that are part of the result and not corrected for: Aura3D draws points at its default size and tone-maps through its production renderer (screenshots in `frames/` differ in brightness and point size), Aura3D's production renderer may do more work per frame (post, HDR target) than the three.js default, and the Aura3D GPU number comes from its own renderer timing (an external timer query nests with Aura3D's own and raises a GL error: `RenderDeviceError: WebGL texture upload failed`, observed when the harness timer wrapped `app.step`).

## 3. Findings stated as findings (no thresholds)

- No config failed to build or run for either viewer.
- `points()` has no live-update path: every streamed-points config uses `geometry.dynamic` + `updateAttribute` instead (see section 2); static `points()` mount cost is in the controls table (`build ms`).
- Picking on points (ctl-static-pts-250K): Aura3D status "no pickable handle: points() nodes expose no handle path", hits 0, usable=false; three.js status "Raycaster + Points (threshold 0.25, brute force)", hits 319.
- Picking on points (pts-100K-20hz-60fps): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "Raycaster + Points (threshold 0.25, brute force)", hits 111.
- Picking on points (pts-250K-20hz-60fps): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "Raycaster + Points (threshold 0.25, brute force)", hits 310.
- Picking on points (pts-1M-20hz-60fps): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "Raycaster + Points (threshold 0.25, brute force)", hits 1270.

## 4. Tables

### 4.1 Controls (empty scene, static 0 Hz points and instances)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ctl-empty | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.12 | 0.21 | - | - | 0 | 0.0 | n/a | 23.3 | 11 |
| ctl-empty | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.06 | 0.09 | - | - | 0 | 0.0 | 0.08 | 3.2 | 8 |
| ctl-static-pts-100K | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 1.41 | 2.23 | - | - | 304 | 1.0 | 0.97 | 91.5 | 134 |
| ctl-static-pts-100K | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.07 | 0.13 | - | - | 0 | 0.0 | 0.50 | 7.4 | 15 |
| ctl-static-pts-250K | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 1.51 | 2.30 | - | - | 304 | 1.0 | 1.47 | 102.7 | 217 |
| ctl-static-pts-250K | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.07 | 0.13 | - | - | 0 | 0.0 | 1.00 | 13.7 | 16 |
| ctl-static-pts-1M | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.1 | 1.72 | 1.97 | - | - | 304 | 1.0 | 4.29 | 196.3 | 843 |
| ctl-static-pts-1M | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.09 | 0.13 | - | - | 0 | 0.0 | 3.22 | 45.2 | 43 |
| ctl-static-inst-5K | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.75 | 3.18 | - | - | 304 | 1.0 | 0.39 | 69.3 | 115 |
| ctl-static-inst-5K | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.09 | 0.13 | - | - | 0 | 0.0 | 0.26 | 4.9 | 29 |

### 4.2 Points stream: 100K / 250K / 1M x 10/20 Hz x 30/60 FPS

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pts-100K-10hz-30fps | aura | 3/3 | 100.0 | 116.7 (50.0..133.3) | 133.3 | 156 | 10.4 | 95.32 | 113.81 | 30.32 | 0.34 | 3.67M | 1.9 | 1.51 | 173.0 | 285 |
| pts-100K-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.15 | 0.25 | 0.06 | 0.00 | 535K | 0.7 | 0.48 | 11.8 | 18 |
| pts-100K-10hz-60fps | aura | 3/3 | 83.3 | 100.0 (50.0..133.3) | 100.0 | 201 | 15.4 | 64.38 | 97.53 | 26.39 | 0.30 | 2.60M | 1.6 | 1.46 | 179.9 | 230 |
| pts-100K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.10 | 0.21 | 0.05 | 0.00 | 268K | 0.3 | 0.50 | 12.0 | 20 |
| pts-100K-20hz-30fps | aura | 3/3 | 83.3 | 100.0 (66.7..133.3) | 100.0 | 175 | 11.4 | 87.48 | 97.32 | 26.03 | 0.29 | 4.00M | 2.0 | 1.47 | 181.9 | 209 |
| pts-100K-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.18 | 0.25 | 0.05 | 0.00 | 1.07M | 1.3 | 0.49 | 11.8 | 18 |
| pts-100K-20hz-60fps | aura | 3/3 | 83.3 | 100.0 (66.7..133.3) | 100.0 | 232 | 11.6 | 85.58 | 89.13 | 25.46 | 0.29 | 4.00M | 2.0 | 1.43 | 186.2 | 211 |
| pts-100K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.13 | 0.24 | 0.05 | 0.00 | 534K | 0.7 | 0.52 | 12.0 | 18 |
| pts-250K-10hz-30fps | aura | 3/3 | 200.0 | 233.3 (150.0..266.7) | 266.7 | 98 | 4.9 | 202.35 | 241.29 | 62.25 | 0.69 | 10.00M | 2.0 | 3.34 | 215.6 | 418 |
| pts-250K-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.18 | 0.38 | 0.11 | 0.00 | 1.34M | 0.7 | 0.95 | 25.3 | 21 |
| pts-250K-10hz-60fps | aura | 3/3 | 266.7 | 316.7 (150.0..316.7) | 333.3 | 80 | 4.0 | 249.62 | 316.95 | 76.08 | 0.86 | 10.00M | 2.0 | 3.36 | 187.7 | 583 |
| pts-250K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.11 | 0.26 | 0.09 | 0.00 | 669K | 0.3 | 0.97 | 25.2 | 21 |
| pts-250K-20hz-30fps | aura | 3/3 | 250.0 | 316.7 (150.0..333.3) | 316.7 | 73 | 3.7 | 269.58 | 319.54 | 82.09 | 0.92 | 10.00M | 2.0 | 3.38 | 222.3 | 504 |
| pts-250K-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.21 | 0.31 | 0.08 | 0.00 | 2.67M | 1.3 | 0.97 | 24.9 | 19 |
| pts-250K-20hz-60fps | aura | 3/3 | 233.3 | 250.0 (150.0..333.3) | 283.3 | 86 | 4.3 | 231.20 | 255.88 | 70.55 | 0.78 | 10.00M | 2.0 | 3.40 | 203.5 | 406 |
| pts-250K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.12 | 0.25 | 0.08 | 0.00 | 1.34M | 0.7 | 1.00 | 25.2 | 22 |
| pts-1M-10hz-30fps | aura | 3/3 | 733.3 | 850.0 (616.6..1266.6) | 866.6 | 26 | 1.3 | 744.75 | 852.98 | 227.73 | 2.53 | 40.00M | 2.0 | 14.97 | 374.2 | 984 |
| pts-1M-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.43 | 1.12 | 0.46 | 0.00 | 5.35M | 0.7 | 3.24 | 79.8 | 32 |
| pts-1M-10hz-60fps | aura | 3/3 | 916.6 | 1033.3 (583.3..1333.3) | 1050.0 | 21 | 1.1 | 925.49 | 1038.15 | 282.31 | 3.19 | 40.00M | 2.0 | 11.82 | 416.6 | 1487 |
| pts-1M-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.22 | 1.02 | 0.40 | 0.00 | 2.68M | 0.3 | 3.40 | 79.8 | 30 |
| pts-1M-20hz-30fps | aura | 3/3 | 733.3 | 800.0 (600.0..1283.3) | 816.6 | 29 | 1.5 | 678.82 | 795.67 | 209.47 | 2.29 | 40.00M | 2.0 | 15.95 | 374.2 | 1219 |
| pts-1M-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.56 | 0.95 | 0.34 | 0.00 | 10.68M | 1.3 | 3.22 | 79.8 | 25 |
| pts-1M-20hz-60fps | aura | 3/3 | 616.6 | 633.3 (600.0..1383.3) | 766.6 | 32 | 1.6 | 607.94 | 632.12 | 185.82 | 2.01 | 40.00M | 2.0 | 11.87 | 375.3 | 902 |
| pts-1M-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.36 | 1.04 | 0.41 | 0.00 | 5.33M | 0.7 | 3.22 | 79.8 | 26 |

### 4.3 Instanced boxes re-posed each tick: 1K / 5K / 10K x 10/20 Hz x 30/60 FPS

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inst-1K-10hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 1.22 | 1.63 | 0.06 | 0.00 | 22K | 1.3 | 0.22 | 64.9 | 58 |
| inst-1K-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.11 | 0.15 | 0.01 | 0.00 | 21K | 0.3 | 0.16 | 4.5 | 16 |
| inst-1K-10hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 1.01 | 1.22 | 0.05 | 0.00 | 11K | 1.2 | 0.22 | 70.4 | 55 |
| inst-1K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.10 | 0.13 | 0.01 | 0.00 | 11K | 0.2 | 0.16 | 4.6 | 16 |
| inst-1K-20hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 1.39 | 1.88 | 0.06 | 0.00 | 43K | 1.7 | 0.22 | 63.9 | 58 |
| inst-1K-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.12 | 0.16 | 0.01 | 0.00 | 43K | 0.7 | 0.16 | 4.5 | 16 |
| inst-1K-20hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 1.38 | 1.74 | 0.06 | 0.00 | 22K | 1.3 | 0.22 | 73.0 | 56 |
| inst-1K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.11 | 0.15 | 0.01 | 0.00 | 21K | 0.3 | 0.16 | 4.6 | 16 |
| inst-5K-10hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 2.44 | 3.75 | 0.07 | 0.00 | 107K | 1.3 | 0.40 | 69.9 | 61 |
| inst-5K-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.10 | 0.13 | 0.01 | 0.00 | 107K | 0.3 | 0.25 | 5.7 | 17 |
| inst-5K-10hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.11 | 2.72 | 0.06 | 0.00 | 54K | 1.2 | 0.40 | 79.1 | 65 |
| inst-5K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.08 | 0.16 | 0.02 | 0.00 | 54K | 0.2 | 0.25 | 5.9 | 16 |
| inst-5K-20hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 2.03 | 3.14 | 0.06 | 0.00 | 214K | 1.7 | 0.40 | 68.9 | 63 |
| inst-5K-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.11 | 0.16 | 0.01 | 0.00 | 214K | 0.7 | 0.25 | 5.7 | 17 |
| inst-5K-20hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.04 | 2.63 | 0.06 | 0.00 | 107K | 1.3 | 0.39 | 69.7 | 61 |
| inst-5K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.11 | 0.16 | 0.02 | 0.00 | 107K | 0.3 | 0.26 | 5.8 | 17 |
| inst-10K-10hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 3.68 | 5.23 | 0.07 | 0.00 | 214K | 1.3 | 0.57 | 71.6 | 69 |
| inst-10K-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.15 | 0.20 | 0.03 | 0.00 | 214K | 0.3 | 0.37 | 7.3 | 17 |
| inst-10K-10hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 3.09 | 4.06 | 0.06 | 0.00 | 107K | 1.2 | 0.55 | 78.1 | 78 |
| inst-10K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.09 | 0.19 | 0.03 | 0.00 | 107K | 0.2 | 0.38 | 7.4 | 17 |
| inst-10K-20hz-30fps | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 4.06 | 5.53 | 0.07 | 0.00 | 427K | 1.7 | 0.58 | 76.0 | 68 |
| inst-10K-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.21 | 0.45 | 0.04 | 0.00 | 426K | 0.7 | 0.38 | 7.3 | 17 |
| inst-10K-20hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 3.00 | 3.84 | 0.05 | 0.00 | 214K | 1.3 | 0.55 | 82.0 | 64 |
| inst-10K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.08 | 0.12 | 0.02 | 0.00 | 214K | 0.3 | 0.37 | 7.4 | 18 |
| inst-1K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-20hz-60fps-loop | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.11 | 0.18 | 0.03 | 0.00 | 21K | 0.3 | 0.15 | 4.6 | 17 |
| inst-5K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-20hz-60fps-loop | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.11 | 0.27 | 0.11 | 0.00 | 107K | 0.3 | 0.26 | 5.9 | 16 |
| inst-10K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-20hz-60fps-loop | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.17 | 0.36 | 0.20 | 0.00 | 214K | 0.3 | 0.36 | 7.5 | 17 |

### 4.4 Trajectories as lines (200 trails, 20K segments)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| trails-20K-10hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 4.08 | 20.46 | 2.09 | 0.00 | 188K | 1.2 | 0.63 | 78.2 | 74 |
| trails-20K-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.08 | 0.13 | 0.02 | 0.00 | 80K | 0.2 | 0.16 | 5.8 | 12 |
| trails-20K-20hz-60fps | aura | 3/3 | 16.7 | 16.7 (16.7..33.3) | 16.7 | 0 | 60.0 | 6.28 | 17.60 | 1.78 | 0.00 | 374K | 1.3 | 0.62 | 94.0 | 73 |
| trails-20K-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.08 | 0.15 | 0.02 | 0.00 | 160K | 0.3 | 0.16 | 5.8 | 12 |

### 4.5 Label overlay (50 DOM labels projected per frame)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| labels-50-empty | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.14 | 0.17 | - | - | 0 | 0.0 | n/a | 24.1 | 14 |
| labels-50-empty | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.07 | 0.09 | - | - | 0 | 0.0 | 0.07 | 3.3 | 8 |
| labels-50-pts-100K-10hz | aura | 3/3 | 16.7 | 50.0 (50.0..133.3) | 66.7 | 200 | 39.0 | 24.74 | 60.91 | 17.49 | 0.21 | 1.03M | 1.3 | 1.44 | 241.1 | 165 |
| labels-50-pts-100K-10hz | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.10 | 0.19 | 0.04 | 0.00 | 268K | 0.3 | 0.48 | 12.1 | 12 |

### 4.6 Mixed scene (250K points + 1K instances + 20K segments + 50 labels)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mixed-10hz-30fps | aura | 3/3 | 166.7 | 166.7 (166.7..350.0) | 183.3 | 121 | 6.1 | 164.18 | 169.97 | 46.46 | 0.50 | 11.18M | 4.0 | 3.04 | 312.0 | 315 |
| mixed-10hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.21 | 0.43 | 0.11 | 0.00 | 1.52M | 1.3 | 1.01 | 28.7 | 25 |
| mixed-10hz-60fps | aura | 3/3 | 166.7 | 166.7 (166.7..300.0) | 183.3 | 122 | 6.1 | 162.46 | 167.25 | 46.19 | 0.51 | 11.18M | 4.0 | 3.21 | 340.2 | 315 |
| mixed-10hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.14 | 0.31 | 0.09 | 0.00 | 760K | 0.7 | 1.03 | 28.8 | 25 |
| mixed-20hz-30fps | aura | 3/3 | 166.7 | 183.3 (166.7..300.0) | 183.3 | 119 | 6.0 | 167.17 | 172.58 | 47.47 | 0.51 | 11.18M | 4.0 | 4.07 | 312.2 | 317 |
| mixed-20hz-30fps | three | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 0.23 | 0.33 | 0.08 | 0.00 | 3.03M | 2.7 | 1.00 | 28.7 | 26 |
| mixed-20hz-60fps | aura | 3/3 | 200.0 | 200.0 (183.3..300.0) | 233.3 | 103 | 5.2 | 192.66 | 201.67 | 54.67 | 0.57 | 11.18M | 4.0 | 3.19 | 312.1 | 347 |
| mixed-20hz-60fps | three | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 0.17 | 0.31 | 0.08 | 0.00 | 1.52M | 1.3 | 0.99 | 28.8 | 29 |

### 4.7 Picking probe (after the measure window; N random NDC points, same points for both viewers)

| config | viewer | N | ms per query | hits | status |
|---|---|---|---|---|---|
| ctl-static-pts-250K | aura | 10 | 0.01 | 0 | no pickable handle: points() nodes expose no handle path |
| ctl-static-pts-250K | three | 10 | 3.30 | 319 | Raycaster + Points (threshold 0.25, brute force) |
| pts-100K-20hz-60fps | aura | 10 | 10.96 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |
| pts-100K-20hz-60fps | three | 10 | 1.39 | 111 | Raycaster + Points (threshold 0.25, brute force) |
| pts-250K-20hz-60fps | aura | 10 | 31.17 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |
| pts-250K-20hz-60fps | three | 10 | 2.01 | 310 | Raycaster + Points (threshold 0.25, brute force) |
| pts-1M-20hz-60fps | aura | 10 | 81.55 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |
| pts-1M-20hz-60fps | three | 10 | 6.77 | 1270 | Raycaster + Points (threshold 0.25, brute force) |
| inst-1K-20hz-60fps | aura | 50 | 7.25 | 27 | raycast(mode mesh) over instances.box (per-instance triangle scan) |
| inst-1K-20hz-60fps | three | 50 | 0.16 | 27 | Raycaster + InstancedMesh (per-instance triangle test) |
| inst-5K-20hz-60fps | aura | 50 | 35.12 | 99 | raycast(mode mesh) over instances.box (per-instance triangle scan) |
| inst-5K-20hz-60fps | three | 50 | 0.46 | 96 | Raycaster + InstancedMesh (per-instance triangle test) |
| inst-10K-20hz-60fps | aura | 50 | 69.87 | 184 | raycast(mode mesh) over instances.box (per-instance triangle scan) |
| inst-10K-20hz-60fps | three | 50 | 0.53 | 186 | Raycaster + InstancedMesh (per-instance triangle test) |

### 4.8 Mount cost, Aura3D-only conversions

| config | path | color conversion ms (mount) | builder ms |
|---|---|---|---|
| ctl-static-pts-100K | points() | 6.0 | 3.7 |
| ctl-static-pts-250K | points() | 15.5 | 5.1 |
| ctl-static-pts-1M | points() | 62.8 | 15.8 |
| pts-100K-10hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.0 | n/a |
| pts-100K-10hz-60fps | geometry.dynamic(topology points) + updateAttribute | 1.0 | n/a |
| pts-100K-20hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.0 | n/a |
| pts-100K-20hz-60fps | geometry.dynamic(topology points) + updateAttribute | 0.9 | n/a |
| pts-250K-10hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.4 | n/a |
| pts-250K-10hz-60fps | geometry.dynamic(topology points) + updateAttribute | 1.5 | n/a |
| pts-250K-20hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.6 | n/a |
| pts-250K-20hz-60fps | geometry.dynamic(topology points) + updateAttribute | 1.5 | n/a |
| pts-1M-10hz-30fps | geometry.dynamic(topology points) + updateAttribute | 4.1 | n/a |
| pts-1M-10hz-60fps | geometry.dynamic(topology points) + updateAttribute | 4.1 | n/a |
| pts-1M-20hz-30fps | geometry.dynamic(topology points) + updateAttribute | 4.0 | n/a |
| pts-1M-20hz-60fps | geometry.dynamic(topology points) + updateAttribute | 3.9 | n/a |
| labels-50-pts-100K-10hz | geometry.dynamic(topology points) + updateAttribute | 1.0 | n/a |
| mixed-10hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.5 | n/a |
| mixed-10hz-60fps | geometry.dynamic(topology points) + updateAttribute | 1.4 | n/a |
| mixed-20hz-30fps | geometry.dynamic(topology points) + updateAttribute | 1.6 | n/a |
| mixed-20hz-60fps | geometry.dynamic(topology points) + updateAttribute | 1.5 | n/a |

## 5. Notes recorded by the Aura3D viewer

- points(): static after mount, colors via per-point CSS color strings
- streamed points: geometry.dynamic points + updateAttribute (position, color); colors need float RGBA

## 6. Console errors during runs

- none captured

## 7. Reproduce

See `tools/spatial-bench/README.md`.
