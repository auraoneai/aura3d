# Lane 515 evidence: typed mutable-buffer path (additive)

Branch `lane/515-mutable-buffers`, base `origin/main` e5387f3b0. Scope and API: `docs/agents/streaming-buffers.md`. Benchmarks: `tools/spatial-bench/results/2026-11-06-515/` (`REPORT.md`, `COMPARISON.md`, `runs.jsonl`, `frames/`).

## 1. No regression in live games (real GPU, deterministic virtual clock)

Method: `tools/capture-games.mjs` loads `/apps/<game>/` from two Vite dev servers (origin/main worktree on :8601, this branch on :8602) in headless Chrome (Apple M4 Max, ANGLE/Metal, 1280x720, DPR 1), with the virtual-clock shim `tools/shim.js` (copied from `origin/lane/504-bellkeeper`) replacing `requestAnimationFrame`, `performance.now` and `Date.now`; assets load in real time while the clock advances, then exactly 240 frames at 60 Hz are stepped and a PNG is captured. `tools/compare-frames.mjs` computes the mean absolute difference over RGB (0-255). Each game was captured twice on base (`base`, `base2`) and once on the branch, so base-vs-base is the noise floor.

A frame counts as a verified real game frame only if: the URL is the game route, a visible canvas is at least 600x300, the central 40% x 40% of the screenshot is not black (mean luma over 4 and stddev over 6), and the page logged no `RENDERER_MOUNT_FAILED`. (An early pass accepted HUD-only frames; the center test and the console check were added after one branch capture failed an LFS pointer asset, which was fixed with `git lfs pull` and re-captured.)

| game | base vs base MAD | base vs branch MAD | verified real frame |
|---|---|---|---|
| showcase-aurora-lander | 0.000 | 0.000 | yes |
| showcase-bank-shot | 0.011 | 0.011 | yes |
| showcase-blockfall-reactor | 7.447 | 9.914 | yes (animation differs run to run on base itself) |
| showcase-data-galaxy | 8.081 | 8.435 | yes (animation differs run to run on base itself) |
| showcase-smart-city-control | 0.455 / 0.769 | 0.307 | yes |
| showcase-top-tennis | 0.378 | 0.375 | yes |

Result: for all six verified games the branch differs from base by no more than base differs from itself. Where base-vs-base is nonzero (two animated games, smart-city, tennis) the games are not bit-deterministic, so "identical" cannot be claimed there, only "within the base noise".

Excluded, not counted as evidence (frames and JSON are kept in `frames/`): showcase-aura-hoops-3d, showcase-bunker-zero, showcase-dot-dash-3d (RENDERER_MOUNT_FAILED on both base and branch: glTF assets unavailable through the dev server in this environment; the center test passed only on HUD), showcase-aura-diamond-3d, showcase-aura-links-3d, showcase-pips-big-leap, showcase-teleoperator, showcase-turbo-ball, showcase-cross-hop (black or mount failure on both base and branch). Their base-vs-branch MAD is 0.000-0.29 but means nothing because there is no 3D frame.

Limits: six games, not the 25; none of them calls `points()` with typed arrays, `points.stream` or dense writes on `instances.model`, so this proves the shared-path edits (`resolveProductionActorRuntimeState`, `createProductionRuntimeRendererInput`, the points handler and handle creation) did not change existing rendering, not that the new paths render correctly in games. The new paths were rendered and looked at on a real GPU in the benchmark frames (below) and the dpr probe.

## 2. P-05 point size at dpr 2 (WebGL2, real GPU)

`dpr-probe/` page + `tools/dpr-probe.mjs`: five points on a 640x360 CSS canvas at dpr 1 and dpr 2. Lit footprint in CSS pixels, dpr 2 relative to dpr 1 (a 1/dpr defect would give 0.25): attenuated default 0.885 (478 vs 423), fixed size 0.955 (352 vs 336), `points.stream` 0.955. Conclusion: the suspected 1/dpr size defect is not present on WebGL2; no code change; the 5-12% residual is small-point rasterization at the lit threshold. WebGPU not probed. Frames and JSON: `dpr/`.

## 3. Typed path on the benchmark harness

See `tools/spatial-bench/results/2026-11-06-515/COMPARISON.md` and the summary in `docs/agents/streaming-buffers.md`. Frames `results/2026-11-06-515/frames/pts-*-20hz-60fps-typed.aura.jpg` are real GPU frames of the typed stream; the 100K frame matches the baseline three.js frame in layout, color and point size.

## Not done in this lane

Instance `dirty` sub-range uploads and `InstanceBuffer` skip-compare removal (I-02 remainder), `instances.mesh` per-compile allocation, `nodes.batch` (U-06 remainder), WebGPU native point-list (P-03), stream ring/frame swap (P-04), picking on points (K-03), per-point size/scalar (P-06). The diagnosis branch `origin/lane/512-points-diagnosis` did not appear while this lane worked; the typed path bypasses the legacy `updateAttribute` route entirely, so its cost model was taken from E6-00 findings P.4 and measured end to end, not from a CPU profile of the legacy path.
