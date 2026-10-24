# Live 4.1.2 verification (production aura3d.auraone.ai, software WebGL2 remote runs)

Deployment `aura3d-6mihv3ah7-veerone.vercel.app` (tag `v4.1.2` = `64eebae71`). Remote headless Chromium on SwiftShader (ACR runs `final412-*`, specs `tests/browser/live-index-games.spec.ts` and `tests/browser/live-ports-smoke.spec.ts`, one game or small group per run). Frames prove the pages render lit pixels and respond, not frame rate, feel or real-GPU behaviour. Hero frames are JPEGs in this folder; `results.json` has every field; `contact-sheet.jpg` shows all 26.

## Fifteen index games

| Game | non-black | mean luma | frame changed | draw calls | console errors | bad responses | self-heal lines | final URL |
|---|---|---|---|---|---|---|---|---|
| aura-diamond-3d | 1 | 84.6 | 0.2944 | 488 | 0 | 0 | 0 | `/apps/showcase-aura-diamond-3d/` |
| aura-fc-3d | 1 | 106.1 | 0.7477 | 207 | 0 | 0 | 0 | `/apps/showcase-aura-fc-3d/` |
| aura-hoops-3d | 1 | 93.1 | 0.8053 | 95 | 0 | 0 | 0 | `/apps/showcase-aura-hoops-3d/` |
| aura-links-3d | 1 | 132.1 | 0.4696 | 56 | 0 | 0 | 0 | `/apps/showcase-aura-links-3d/` |
| bunker-zero | 0.952 | 67.7 | 0.4421 | None | 0 | 0 | 0 | `/apps/showcase-bunker-zero/` |
| cross-hop | 0.997 | 106.3 | 0.4079 | 97 | 0 | 0 | 0 | `/apps/showcase-cross-hop/` |
| dot-dash-3d | 0.871 | 24 | 0.0354 | 100 | 0 | 0 | 0 | `/apps/showcase-dot-dash-3d/` |
| heatsink | 1 | 84.9 | 0.5073 | 1281 | 0 | 0 | 0 | `/apps/showcase-heatsink/` |
| iron-crown | 0.887 | 51.5 | 0.9816 | 83 | 0 | 0 | 0 | `/apps/showcase-iron-crown/` |
| pips-big-leap | 1 | 152.4 | 0.9246 | 497 | 0 | 0 | 0 | `/apps/showcase-pips-big-leap/` |
| red-zone-3d | 1 | 110.2 | 0.3889 | 328 | 0 | 0 | 0 | `/apps/showcase-red-zone-3d/` |
| roadster-rush | 0.994 | 69.3 | 0.1517 | 721 | 0 | 0 | 0 | `/apps/showcase-roadster-rush/` |
| slingshot-siege | 0.977 | 107.3 | 0.0902 | 298 | 0 | 0 | 0 | `/apps/showcase-slingshot-siege/` |
| teleoperator | 1 | 96.1 | 0.2281 | 520 | 0 | 0 | 0 | `/apps/showcase-teleoperator/` |
| top-tennis | 0.924 | 51.4 | 0.0561 | 616 | 0 | 0 | 0 | `/apps/showcase-top-tennis/` |

Slingshot Siege was measured at a 360x270 viewport (the test added a per-game viewport map). Bunker Zero reports no draw-call counter (`None`).

## Eleven ports

| Port | canvas non-black | luma std dev | draw calls | fps (play) | console errors | page errors | bad responses | self-heal lines | notes |
|---|---|---|---|---|---|---|---|---|---|
| cloud-runner | 1 | 62.1 | 187 | 0.26 | 0 | 0 | 0 | 0 |  |
| drift-and-deliver | 1 | 49.1 | 107 | 0.33 | 0 | 0 | 0 | 0 |  |
| heatsink | 0.994 | 59.8 | 31 | 0.25 | 0 | 0 | 0 | 0 | state/frames did not advance within the 240x180 window (software GL ~0.25 fps); spec assertion failed on that |
| last-train | 1 | 50.3 | 177 | 0.15 | 0 | 0 | 0 | 0 | canvas-only screenshot blocked >90 s; spec assertion on responsiveness failed; frames lit |
| ninja-runner | 1 | 52.2 | 41 | 0.28 | 0 | 0 | 0 | 0 |  |
| roadster-hours | 1.0 | 47.6 | 71 | 0.37 | 0 | 0 | 0 | 0 |  |
| serpentine-sky-run | 1 | 54.5 | 19 | 0.5 | 0 | 0 | 0 | 0 |  |
| silt-and-signal | 1 | 58.4 | 156 | 0.43 | 0 | 0 | 0 | 0 |  |
| splat-rush | 1 | 52.5 | 103 | 0.85 | 0 | 0 | 0 | 0 |  |
| strange-orbit | 1 | 47.7 | 27 | 0.44 | 0 | 0 | 0 | 0 |  |
| where-the-wind-wanders | 0.999 | 48.5 | 16 | 0.34 | 0 | 0 | 0 | 0 |  |

## What changed against 4.1.1

- **The black-frame guard no longer misfires.** No game logged `SAFETY_COMPAT_MODE`/`AURA3D_COMPAT_MODE`/`SAFETY_BLACK_FRAME`, and every final URL equals the requested URL (no `a3d-qr` rewrite). On 4.1.1 Cross Hop, Iron Crown and Bunker Zero fell two rungs; here they render lit: Cross Hop non-black 0.997 (luma 106.3, 97 draw calls), Iron Crown 0.887 (luma 51.5, 83 draw calls), Bunker Zero 0.952 (luma 67.7).
- **Everything measured has 0 console errors, 0 page errors and 0 bad responses.**
- **HEATSINK (port) and Last Train** are now measured (4.1.1 could not): both boot, accept Start and render lit frames at 240x180. HEATSINK's state and frames did not visibly advance inside the test window (0.25 fps), so its "advances" assertion failed; Last Train's canvas-only screenshot still blocked for more than 90 s (recorded as hung). Neither shows a rendering or error problem; both need a real-GPU run to be judged.
- **Slingshot Siege** is measured for the first time (non-black 0.977, luma 107.3, 298 draw calls).

## Not measured / limits

Frame rate and feel on a real GPU (these runs are 0.15-0.85 fps on the CPU rasteriser), the full Last Train path to speed above 0, Drift & Deliver's world and Silt & Signal's ring beacon on the owner's Apple M4 Max.

## Test tooling changes in this lane

`live-index-games.spec.ts`: run-group tags (`@idx1..3`) so single groups can be selected with `-g` (the runner cannot forward env or shell metacharacters), parallel-safe mode instead of serial (a slow failure no longer skips the games after it), longer screenshot timeout with a plain-screenshot fallback, a 360x270 viewport for Slingshot Siege. `live-ports-smoke.spec.ts`: `@port1..3` tags, every screenshot guarded with a timeout and fallback, 240x180 viewport for HEATSINK and Last Train, 1,500 s test timeout.
