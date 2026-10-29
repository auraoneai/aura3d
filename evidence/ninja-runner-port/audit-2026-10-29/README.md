# Shadowstep Gauntlet: lane G20 audit evidence (2026-10-29)

Remote SwiftShader (software WebGL2) runs of `tests/browser/audit-fix/ninja-runner-port.spec.ts` (`tools/remote-acr/run.sh`, registry `picassostagingacr`). Not real-GPU evidence. Each folder holds the decoded JPEG frames (`<shot>-page.jpg` with the HUD, `<shot>-canvas.jpg` 3D only), `meta.jsonl` (per-shot canvas luma: mean, lower-half mean, centre-third mean, p5/p50/p95, dark and clipped share; engine diagnostics: render path, bloom fusion, draw calls, shadows, warnings, environment; sim phase, distance, form, kills; HUD rects) and `log-summary.txt`.

States are driven through `window.__AURA_NINJA_RUNNER__` with `?manual=1` and the game's frame loop stopped after a 15 s warm-up, so each shot is a fixed sim state rendered through the hook (repeat shots match to 0.01 luma). Mean is canvas-only luma, 0-255.

- `before/`: the unmodified base (`audit-fix/integration` b2dba3713 = origin/main 31f8945ad plus audit docs), in a temporary detached worktree.
- `v4.3.7/`: the `v4.3.7` tag, render variants only.
- `branch-intermediate/`: this branch with the shadow-fit opt-in removed (commits 2bf1ae759 to a986d1e4a). These runs are the measurement that put the opt-in back (85e1458f4).
- `after/`: this branch after 85e1458f4 (final screens). `screens/final/` holds the same frames under the inventory's file names.

## Run state (s = 45 m, 1280x720)

| Build | Query | Mean | p5 / p95 | Draw calls |
|---|---|---|---|---|
| v4.3.7 | default | 111.98 | 41 / 162 | 98 |
| v4.3.7 | `aura3d-render=production` | 111.27 | 41 / 162 | 98 |
| v4.3.7 | `quality=low` (no AO) | 118.71 | 52 / 170 | 98 |
| base 4.5.0 | default (auto, separable bloom) | 118.22 | 52 / 169 | 98 |
| base 4.5.0 | `aura3d-render=production` | 117.64 | 52 / 168 | 98 |
| base 4.5.0 | `quality=low` | 119.61 | 54 / 171 | 98 |
| base 4.5.0 | `shadow=0` | 118.57 | 48 / 170 | 46 |
| base 4.5.0 | `shadowfit=legacy` (4.2.0 fit) | 112.62 | n/a | 132 |
| base 4.5.0 | `shadowfit=current` | 118.22 | n/a | 98 |
| branch, opt-in removed | default (4.2.0 fit under auto) | 118.45 | 52 / 168 | 131 |
| branch, opt-in removed | `aura3d-render=production` | 112.92 | 49 / 160 | 131 |
| branch, opt-in removed | `ibl=hdri` | 111.50 | 39 / 162 | n/a |
| branch, final (opt-in kept) | default | 118.07 | 52 / 168 | 99 |
| branch, final | `aura3d-render=production` | 118.08 | 52 / 168 | 99 |
| branch, final | `quality=low` | 119.46 | 53 / 170 | 99 |
| branch, final | `shadow=0` | 118.42 | 52 / 169 | 47 |
| branch, final | `shadowfit=legacy` (auto skips the cascades: no shadows drawn) | 118.43 | 52 / 169 | 131 |

Reading: the 4.3.7 to 4.5.0 lift (+6.2) is the AO change (no-AO frames differ by 0.9). Bloom fusion moves the frame 0.58 on the base and 0.01 on the final branch. The 4.2.0 shadow fit darkens the frame about 6 levels with no shadow shapes because the instanced scenery spans the whole course (under `auto` the 4.5.0 cascade skip hides this on the run frame; the production path and the action frame show it).

## Before and after, same states

| Shot | Before mean | After mean | Note |
|---|---|---|---|
| title-1280 | 121.14 | 121.15 | |
| early-1280 | 122.15 | 122.15 | |
| run-1280 | 118.13 | 117.99 | |
| action-1280 | 121.60 | 121.56 | |
| gate-hit-1280 | 110.70 | 114.22 | the near house that filled the right edge now keeps 3 m from the camera path |
| mid-action-1280 | 110.46 | 110.74 | |
| results-1280 | 120.08 | 120.08 | |
| title-390 | 148.62 | 148.65 | |
| early-390 | 148.44 | 148.47 | |
| run-390 | 140.88 | 140.40 | phone HUD: two bottom rows (65 + 63 px) and a 26 px Sound button become one 54 px row with 44 px Pause and Sound |
| Sunfire, hero crop, shadow on minus off | -4.03 | -4.01 | S-06: the same; the darkening is the hero's own sun shadow, no aura shadow is visible on either |
