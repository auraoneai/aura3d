# Lamplight Line audit fixes, wave 3: before and after

Frames and numbers from `tests/browser/audit-fix/last-train-port.spec.ts` (tests named `wave3 ...`) on the remote runner (`tools/remote-acr/run.sh`, Azure ACR Task, headless Chromium, SwiftShader software WebGL2, not a GPU). The run has no artifact egress, so the spec logs `GL_META` lines and chunked `GL_JPG` frames, decoded with a small script into this folder.

- `before-*`: run `g21w3-before-115656`, base `audit-fix/integration` (`b2dba3713`, origin/main `31f8945ad` plus the audit docs) with the new spec copied in.
- `after1-*`: run `g21w3-after-115952`, branch at `aec4b9188` (first after run; the R confirmation still used a wall-clock window, see D-05).
- `after-*`: run `g21w3-after2` (ACR `ch5fv`, branch at `1e52498d1`, every test in the spec, log fetched with `az acr task logs`; `after2-meta.json`); the `after-phone-*` frames and `after-phone-meta.json` are from `g21w3-phone2-130506` (branch at `d1a617de3`, with the phone HUD fix).
- `v437-*`: run `g21w3-v437` (ACR `ch5g5`) on a `v4.3.7` worktree with the same spec: the 4.3.7 steady-state luma baseline. Its game-logic assertions fail, as on the base.
- `*-meta.json`: every `GL_META` line of the run (state, card text, luma stats, renderer diagnostics, memory).

Frames are canvas-only (`frame()` hook) unless the name ends in `-hud` or starts with `phone-` (page screenshots with the HUD). Steady state: the spec waits 30 s after ready (about 7 to 10 software-GL frames) before the first judged frame and 20 to 25 s after each state change.

## Numbers (mean luma of the 1280x720 canvas; memory from `app.info`)

| State | 4.3.7 | 4.5.0 base | after |
|---|---|---|---|
| Dock, day (30 s after ready) | 78.22 | 79.01 | 79.30 |
| Mid-leg, day (84 m into leg 0) | 122.85 | 124.16 | 126.10 |
| Night, docked after a service | 38.58 | 39.05 | 41.96 |
| GPU memory at the first station | 336,325,190 B | 406,311,360 B | 277,541,436 B |
| Render targets / textures | - | 11 / 64 | 6 / 59 |
| Post: dropped passes | ssao | ssao (`ssao:normals`) | none (AO not requested) |

Night and mid-leg after differ from the base by the camera sway and cloud phase (the after night shot follows two services, the base one); compare `before-night.jpg` and `after-night.jpg`.

Game logic, desktop (base -> after): R R mid-service left the tram enroute at 84.2 m -> docked at Mango Tide; Enter + 600 steps of W: 0 m/s -> 12.1 m/s, 57.6 m; second-service card "Score 8078 · new best" -> "Score 4039 · best 4039"; grade Silver -> Gold; "Riders lost" -> "Tips lost". Phone 390x844 with touch: 0 touch buttons -> 4 (56 px high), Go opened the doors and drove to 10.5 m/s, Lean left trim -1.0, Brake slowed 6.9 -> 4.1 m/s.
