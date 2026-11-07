# Lane 515 re-review: 5-game no-regression check (2026-11-07)

Base: `origin/main` e5387f3b0 (Vite dev server :8611). Branch: `lane/515-mutable-buffers-clean` (tree identical to `lane/515-mutable-buffers` de8eed931; Vite dev server :8612). Both worktrees had every Git LFS object smudged (0 pointer files) before the captures used here.

Method: `../tools/capture-games.mjs` (headless Chrome, ANGLE/Metal on Apple M4 Max, 1280x720, DPR 1, virtual-clock shim `../tools/shim.js` from `origin/lane/504-bellkeeper`, 240 frames at 60 Hz after asset load). Two captures per side (`base`, `base2`, `branch`, `branch2`) so both sides have a noise floor. `../tools/compare-frames4.mjs` writes `comparison.json`: mean absolute RGB difference (0-255) for every pair.

All 20 frames pass the real-frame check (game URL, canvas >= 600x300, centre 40% x 40% not black, no `RENDERER_MOUNT_FAILED`) and were viewed: each shows the named game with its 3D scene, not the marketing page, not black, not another game.

| game | base vs base2 | branch vs branch2 | base-side vs branch-side (4 pairs, min..max) | within noise |
|---|---|---|---|---|
| showcase-aurora-lander | 0.000 | 0.000 | 0.000..0.000 | yes (identical) |
| showcase-bank-shot | 0.001 | 0.014 | 0.000..0.014 | yes |
| showcase-smart-city-control | 0.430 | 0.344 | 0.342..0.412 | yes |
| showcase-top-tennis | 0.367 | 0.368 | 0.367..0.370 | yes |
| showcase-data-galaxy | 6.754 | 6.732 | 2.084..6.970 | yes (see note) |

Data Galaxy is animated and its in-game frame counter at capture differs run to run on either side (604 or 612). Cross pairs with the same counter differ by about 2.09 MAD (base vs branch2, base2 vs branch); pairs with different counters differ by about 6.5-7.0, as base vs base2 does (6.754). The 6.970 maximum is 0.2 above the base noise floor and comes from a mismatched counter pair, not from a rendering change.

Not a test of the new APIs: none of these games calls `points()` with typed arrays, `points.stream` or dense `instances.model` writes. It checks that the shared-path edits (points handler, actor runtime state, renderer input, handle creation) leave existing games unchanged.

An earlier `branch` pass in this folder failed with `AssetIntegrityError` because the branch worktree still held LFS pointer files under `public/aura-assets/`. After `git lfs pull` those frames were captured again; the files here are the re-captured ones.
