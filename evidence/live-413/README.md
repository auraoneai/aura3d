# Live 4.1.3 verification (production aura3d.auraone.ai, software WebGL2 remote runs)

Deployment `aura3d-pxdy76h8m-veerone.vercel.app` (tag `v4.1.3` = `973d3fe1a`). Remote headless Chromium on SwiftShader (ACR runs `live413-idx1|idx2|idx3|port1|port2|port3|slam`, specs `tests/browser/live-index-games.spec.ts`, `live-ports-smoke.spec.ts`, `liveslam.spec.ts` and the new `live413-slam-ui.spec.ts`). **Software GL only: none of this is real-GPU evidence.** Results are in `results.json`; hero frames are in `frames/`. Port slugs are the current main slugs (`/apps/showcase-<slug>-port/`).

## Site-level checks

- `/llms.txt` 200 (one intentional 4.1.2 mention: the stock-build note), `/llms-full.txt` 200 (4.1.3 only), `/apps/showcase-index/` 36 mentions of 4.1.3 and none of 4.1.2.
- Aura Slam route: one `showcase-top-tennis` bundle, no `toptennis` scripts, and `toptennis/renderer.bundle.js`, `toptennis/game.js`, `toptennis-v2/renderer.bundle.js` all return 404 (no three.js bundle served).
- All 26 pages return 200.
- Independent Prism check (own new session, closed): Aura Slam page ready, canvas present, quick bar and menu present, single bundle.

## Fifteen index games

| Game | non-black | mean luma | frame changed | draw calls | console errors | bad responses | self-heal lines |
|---|---|---|---|---|---|---|---|
| iron-crown | 0.887 | 51.6 | 0.978 | 83 | 0 | 0 | 0 |
| bunker-zero | 0.952 | 67.7 | 0.4408 | None | 0 | 0 | 0 |
| cross-hop | 0.997 | 104.2 | 0.4081 | 97 | 0 | 0 | 0 |
| top-tennis | 0.924 | 51.4 | 0.0545 | 119 | 0 | 0 | 0 |
| slingshot-siege | 0.977 | 107.3 | 0.0882 | 298 | 0 | 0 | 0 |
| roadster-rush | 0.99 | 67.5 | 0.2562 | 721 | 0 | 0 | 0 |
| heatsink | 1 | 84.9 | 0.5073 | 1281 | 0 | 0 | 0 |
| teleoperator | 1 | 96.1 | 0.2281 | 520 | 0 | 0 | 0 |
| pips-big-leap | 1 | 152.5 | 0.9592 | 497 | 0 | 0 | 0 |
| aura-hoops-3d | 1 | 93.2 | 0.8057 | 95 | 0 | 0 | 0 |
| aura-diamond-3d | 1 | 84.6 | 0.298 | 488 | 0 | 0 | 0 |
| aura-fc-3d | 1 | 106.2 | 0.7437 | 207 | 0 | 0 | 0 |
| red-zone-3d | 1 | 110.1 | 0.3088 | 328 | 0 | 0 | 0 |
| aura-links-3d | 1 | 132.2 | 0.4733 | 56 | 0 | 0 | 0 |
| dot-dash-3d | 0.871 | 24 | 0.0369 | 100 | 0 | 0 | 0 |

All 15 passed (HTTP 200, canvas drawing non-black, frame changes over time, 0 console errors, 0 bad responses, no black-frame guard activity). Bunker Zero reports no draw-call counter. Aura Slam draw calls are 119 (the 4.1.2 page measured 616 on the old renderer).

## Eleven ports

| Port | canvas non-black | distinct colours | draw calls | fps (play) | console errors | page errors | bad responses | self-heal lines | notes |
|---|---|---|---|---|---|---|---|---|---|
| heatsink | 1 | 858 | 31 | 0.25 | 0 | 0 | 0 | 0 | spec assertion failed: frames and hook state did not advance within the 240x180 window (software GL about 0.25 fps), same as 4.1.2; page booted and drew |
| last-train | 1 | 1122 | 177 | 0.22 | 0 | 0 | 0 | 0 | passed this run (it failed the responsiveness assertion at 4.1.2); about 0.2 fps |
| strange-orbit | 1 | 1823 | 27 | 0.62 | 0 | 0 | 0 | 0 |  |
| splat-rush | 1 | 3398 | 92 | 1.27 | 0 | 0 | 0 | 0 |  |
| serpentine-sky-run | 1 | 1704 | 19 | 0.82 | 0 | 0 | 0 | 0 |  |
| drift-and-deliver | 1 | 1030 | 107 | 0.37 | 0 | 0 | 0 | 0 |  |
| ninja-runner | 1 | 1602 | 41 | 0.31 | 0 | 0 | 0 | 0 |  |
| roadster-hours | 1 | 1048 | 71 | 0.46 | 0 | 0 | 0 | 0 |  |
| where-the-wind-wanders | 0.999 | 6546 | 16 | 0.47 | 0 | 0 | 0 | 0 |  |
| silt-and-signal | 0.997 | 1122 | 156 | 0.49 | 0 | 0 | 0 | 0 |  |
| cloud-runner | 1 | 1787 | 187 | 0.26 | 0 | 0 | 0 | 0 |  |

Ten of eleven ports passed their spec. The HEATSINK port failed the same liveness assertion as 4.1.2 (software GL is too slow to advance the sim in the window); it loaded, drew a lit frame and reported no errors. Treat it as unverified for gameplay.

## Aura Slam route

All 25 checks in `liveslam.spec.ts` passed: boot ready, no legacy scripts, no "Busted" text, serve and keys advance the game, pause and resume, Modes menu with Tournament and Online disabled ("Coming soon"), mobile HIT and LOB buttons, `?diag=1` panel clean (rung 0, black 0), guard did not fire, 6 of 6 asset requests 200, 0 console errors, 0 bad responses. Draw calls 119 at boot and 119 at the end (budget 150).

Layout (the 4.1.3 fix for the menu tokens and the portrait quick bar), measured on the live page:

| Viewport | horizontal scroll | quick bar / scoreboard overlap | quick bar / pause overlap | menu padding | menu heading |
|---|---|---|---|---|---|
| 1280 | none | 0 px2 | 0 px2 | 24px 50px | 56px |
| 390 | none | 0 px2 | 0 px2 | 54px 24px 16px | 38px |

Frames: `frames/slam-FRAME_*.jpg` (boot, rally, pause, menu, Smash Lab, mobile) and `frames/ui-live-{play,menu,setup}-{1280,390}.jpg`.

## Defects and limits

- No new defect found in the 26 games or the Aura Slam route.
- The portrait court is still cropped on the left at 390x844 (fixed 15 degree camera FOV pinned by the G3 gate); not a regression.
- HEATSINK port gameplay is unverified on software GL.
- The CPU rasteriser runs most ports below 1 fps, so frame-to-frame checks are liveness checks, not performance measurements.

## Needs the owner on real hardware (M4 Max)

Aura Slam feel and the Modes menu look; Drift and Deliver, Silt and Signal, Last Train (Enter, E, W path), HEATSINK port, Cloud Runner; 120 Hz smoothness (see `docs/audit/motion-audit.md` on the rework branch).
