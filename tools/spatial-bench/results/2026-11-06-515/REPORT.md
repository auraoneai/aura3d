# E6-01 baseline: Aura3D vs three.js on high-frequency spatial-data workloads

Generated 2026-11-07T04:59:45.399Z by `tools/spatial-bench/report.mjs` from `runs.jsonl` (57 runs). Raw per-run data: `results.json`. Measurement only: no engine or rendering source was modified, no thresholds are asserted, and no comparative claim follows from these numbers without the evidence rules in `docs/agents/claims-and-boundaries.md`.

## 1. What was and was not run

- Machine: Mac16,6, Apple M4 Max, 16 cores, 128 GB, macOS 26.7.3 (25G416).
- Browser: Chrome/156.0.8078.80, headless=new, loopback CDP, flags `--headless=new --enable-gpu --use-angle=metal --ignore-gpu-blocklist --enable-precise-memory-info --js-flags=--expose-gc`.
- GPU string (UNMASKED_RENDERER): `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max, Unspecified Version)`; vendor `Google Inc. (Apple)`; WebGL 2.0 (OpenGL ES 3.0 Chromium); drawing buffer 1280x720; devicePixelRatio 1; window 1280x720; max aliased point size 511.
- Backend: WebGL2 for both viewers (canvas contexts requested: webgl2). WebGPU was **not** run (`A3D_QR_WEBGPU` is `dev`; E6-00 section 5.1 lists it as optional).
- Libraries: Aura3D workspace@b9416dc8acfe (workspace source through `vite.aliases.generated.ts`, production vite build), three.js r? (pinned in `package.json`/`package-lock.json`).
- Protocol: 3 s warm-up then 20 s measured per run, 3 repetitions per config and viewer, runs interleaved (rep > config > viewer), one fresh tab per run, canvas 1280x720 at DPR 1. Load average at run start is recorded per run (the machine was shared with other agent lanes: median 1-min load over all runs 23.4, max 93.9), so absolute times carry that noise; the repetition range of frame p95 is shown for that reason.
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
- Picking on points (pts-100K-20hz-60fps-typed): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "undefined", hits n/a.
- Picking on points (pts-250K-20hz-60fps-typed): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "undefined", hits n/a.
- Picking on points (pts-1M-20hz-60fps-typed): Aura3D status "raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5)", hits 0, usable=false; three.js status "undefined", hits n/a.

## 4. Tables

### 4.1 Controls (empty scene, static 0 Hz points and instances)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ctl-empty | aura | 0/0 | not run (n/a) |||||||||||||
| ctl-empty | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-100K | aura | 0/0 | not run (n/a) |||||||||||||
| ctl-static-pts-100K | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-250K | aura | 0/0 | not run (n/a) |||||||||||||
| ctl-static-pts-250K | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-1M | aura | 0/0 | not run (n/a) |||||||||||||
| ctl-static-pts-1M | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-inst-5K | aura | 0/0 | not run (n/a) |||||||||||||
| ctl-static-inst-5K | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-100K-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.03 | 2.42 | - | - | 304 | 1.0 | 0.89 | 80.1 | 133 |
| ctl-static-pts-100K-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-250K-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.02 | 2.31 | - | - | 304 | 1.0 | 1.42 | 87.4 | 117 |
| ctl-static-pts-250K-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| ctl-static-pts-1M-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.07 | 2.46 | - | - | 304 | 1.0 | 2.47 | 116.7 | 153 |
| ctl-static-pts-1M-typed | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.2 Points stream: 100K / 250K / 1M x 10/20 Hz x 30/60 FPS

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pts-100K-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-100K-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-100K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-100K-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-100K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-250K-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-250K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-250K-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-250K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-1M-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-1M-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-1M-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| pts-1M-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-10hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 2.22 | 3.52 | 0.84 | 0.00 | 535K | 1.3 | 0.90 | 80.3 | 92 |
| pts-100K-10hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-10hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.02 | 3.34 | 0.91 | 0.00 | 268K | 1.2 | 0.89 | 81.5 | 82 |
| pts-100K-10hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-20hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 3.10 | 3.91 | 1.00 | 0.00 | 1.07M | 1.7 | 0.92 | 95.6 | 114 |
| pts-100K-20hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-100K-20hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.06 | 3.36 | 0.82 | 0.00 | 535K | 1.3 | 0.90 | 94.6 | 108 |
| pts-100K-20hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-10hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 3.20 | 5.84 | 2.39 | 0.00 | 1.34M | 1.3 | 1.47 | 104.2 | 113 |
| pts-250K-10hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-10hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 2.68 | 5.51 | 2.48 | 0.00 | 670K | 1.2 | 1.43 | 113.7 | 123 |
| pts-250K-10hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-20hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 4.57 | 6.09 | 2.52 | 0.00 | 2.67M | 1.7 | 1.43 | 138.3 | 119 |
| pts-250K-20hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-250K-20hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 3.33 | 5.86 | 2.56 | 0.00 | 1.34M | 1.3 | 0.88 | 139.9 | 113 |
| pts-250K-20hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-10hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 5.95 | 13.87 | 10.13 | 0.00 | 5.35M | 1.3 | 2.37 | 140.2 | 136 |
| pts-1M-10hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-10hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 3.92 | 13.35 | 10.18 | 0.00 | 2.68M | 1.2 | 2.48 | 148.4 | 126 |
| pts-1M-10hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-20hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 8.99 | 13.95 | 9.51 | 0.00 | 10.68M | 1.7 | 2.49 | 140.5 | 141 |
| pts-1M-20hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| pts-1M-20hz-60fps-typed | aura | 3/3 | 16.7 | 16.7 (16.7..16.7) | 16.7 | 0 | 60.0 | 5.67 | 13.72 | 10.14 | 0.00 | 5.34M | 1.3 | 2.44 | 147.8 | 130 |
| pts-1M-20hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.3 Instanced boxes re-posed each tick: 1K / 5K / 10K x 10/20 Hz x 30/60 FPS

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| inst-1K-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-1K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-1K-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-1K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-5K-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-5K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-5K-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-5K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-10K-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-10K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-10K-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-10K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-1K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-1K-20hz-60fps-loop | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-5K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-5K-20hz-60fps-loop | three | 0/0 | not run (three-only variant) |||||||||||||
| inst-10K-20hz-60fps-loop | aura | 0/0 | not run (n/a) |||||||||||||
| inst-10K-20hz-60fps-loop | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.4 Trajectories as lines (200 trails, 20K segments)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| trails-20K-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| trails-20K-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| trails-20K-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| trails-20K-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.5 Label overlay (50 DOM labels projected per frame)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| labels-50-empty | aura | 0/0 | not run (n/a) |||||||||||||
| labels-50-empty | three | 0/0 | not run (three-only variant) |||||||||||||
| labels-50-pts-100K-10hz | aura | 0/0 | not run (n/a) |||||||||||||
| labels-50-pts-100K-10hz | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.6 Mixed scene (250K points + 1K instances + 20K segments + 50 labels)

Medians over reps. `frame` = rendered-frame interval (ms). `cpu` = JS ms per rendered frame (tick + camera + render + labels). `tick` = ms per applied sensor tick (includes data conversion). `up` = bufferData+bufferSubData bytes per rendered frame. `gpu` = p50 GPU ms/frame. `n` = ok runs / runs.

| config | viewer | n | frame p50 | p95 (min..max) | p99 | drops | fps | cpu mean | cpu p95 | tick mean | convert | up/frame | uploads/frame | gpu p50 | heap max MB | build ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mixed-10hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| mixed-10hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-10hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| mixed-10hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-20hz-30fps | aura | 0/0 | not run (n/a) |||||||||||||
| mixed-20hz-30fps | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-20hz-60fps | aura | 0/0 | not run (n/a) |||||||||||||
| mixed-20hz-60fps | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-10hz-30fps-typed | aura | 3/3 | 33.3 | 33.3 (33.3..33.3) | 33.3 | 0 | 30.0 | 15.19 | 40.87 | 6.09 | 0.00 | 1.74M | 2.0 | 1.61 | 151.8 | 215 |
| mixed-10hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-10hz-60fps-typed | aura | 3/3 | 16.7 | 33.3 (16.7..33.3) | 33.3 | 76 | 50.0 | 10.13 | 39.54 | 6.02 | 0.00 | 1.04M | 1.6 | 1.58 | 138.2 | 165 |
| mixed-10hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-20hz-30fps-typed | aura | 3/3 | 33.3 | 50.0 (33.3..50.0) | 50.0 | 0 | 28.3 | 27.03 | 40.46 | 5.76 | 0.00 | 3.66M | 3.1 | 1.62 | 166.2 | 198 |
| mixed-20hz-30fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||
| mixed-20hz-60fps-typed | aura | 3/3 | 16.7 | 33.3 (33.3..50.0) | 50.0 | 154 | 42.2 | 18.50 | 40.57 | 5.61 | 0.00 | 2.46M | 2.4 | 1.58 | 226.0 | 214 |
| mixed-20hz-60fps-typed | three | 0/0 | not run (three-only variant) |||||||||||||

### 4.7 Picking probe (after the measure window; N random NDC points, same points for both viewers)

| config | viewer | N | ms per query | hits | status |
|---|---|---|---|---|---|
| pts-100K-20hz-60fps-typed | aura | 10 | 0.10 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |
| pts-250K-20hz-60fps-typed | aura | 10 | 0.09 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |
| pts-1M-20hz-60fps-typed | aura | 10 | 0.09 | 0 | raycast(mode mesh) over the points primitive: mesh mode returns [] for non-triangle topology (E6-00 K.5) |

### 4.8 Mount cost, Aura3D-only conversions

| config | path | color conversion ms (mount) | builder ms |
|---|---|---|---|
| pts-100K-10hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-100K-10hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-100K-20hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-100K-20hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-250K-10hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-250K-10hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-250K-20hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-250K-20hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-1M-10hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-1M-10hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-1M-20hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| pts-1M-20hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| ctl-static-pts-100K-typed | points() typed (Float32Array + packed u8 colors) | 0.0 | 2.5 |
| ctl-static-pts-250K-typed | points() typed (Float32Array + packed u8 colors) | 0.0 | 3.0 |
| ctl-static-pts-1M-typed | points() typed (Float32Array + packed u8 colors) | 0.0 | 4.2 |
| mixed-10hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| mixed-10hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| mixed-20hz-30fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |
| mixed-20hz-60fps-typed | points.stream + handle.write (u8x4n) | 0.0 | n/a |

## 5. Notes recorded by the Aura3D viewer

- streamed points: points.stream({ capacity, colors: u8x4n }) + handle.write(positions, { colors })
- points() typed: Float32Array positions + packed u8 RGBA, no color-string conversion

## 6. Console errors during runs

- none captured

## 7. Reproduce

See `tools/spatial-bench/README.md`.
