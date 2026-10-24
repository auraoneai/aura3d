# Live 4.1.1 verification (production aura3d.auraone.ai, software WebGL2 remote runs)

Deployment aura3d-nea0xsxv1-veerone.vercel.app (tag v4.1.1 = cf2d6d5ee). Software WebGL2 (SwiftShader) on ACR, headless: frames prove the pages render, not how they perform or how a real GPU behaves. Runs `final411-*` (one game or small group per run so the heavy ones can finish). Specs: narrowed copies of `tests/browser/live-index-games.spec.ts` and `tests/browser/live-ports-smoke.spec.ts` (viewport 360x270 for Ninja Runner, Drift, Silt & Signal, Cloud Runner; 240x180 for HEATSINK (port) and Last Train). Raw rows: `results.json`; hero frames and `contact-sheet.jpg` in this folder.

## Index games

| Game | non-black | mean luma | frame changed | draw calls | console errors | bad responses | self-heal rungs fired | final URL |
|---|---|---|---|---|---|---|---|---|
| aura-diamond-3d | 1 | 84.9 | 0.2893 | 488 | 0 | 0 | 0 | `/apps/showcase-aura-diamond-3d/` |
| aura-fc-3d | 1 | 106 | 0.7472 | 207 | 0 | 0 | 0 | `/apps/showcase-aura-fc-3d/` |
| aura-hoops-3d | 1 | 93.1 | 0.806 | 95 | 0 | 0 | 0 | `/apps/showcase-aura-hoops-3d/` |
| aura-links-3d | 1 | 132.1 | 0.4697 | 56 | 0 | 0 | 0 | `/apps/showcase-aura-links-3d/` |
| bunker-zero | 0 | 6.8 | 0.9757 | None | 0 | 0 | 2 | `/apps/showcase-bunker-zero/?a3d-qr=game%2C-vfxFog%2C-post%2C-compiler` |
| cross-hop | 0 | 0 | -1 | None | 0 | 0 | 2 | `/apps/showcase-cross-hop/?a3d-qr=game%2C-vfxFog%2C-post%2C-compiler` |
| dot-dash-3d | 0.871 | 24 | 0.0353 | 100 | 0 | 0 | 0 | `/apps/showcase-dot-dash-3d/` |
| heatsink | 1 | 84.9 | 0.5073 | 1281 | 0 | 0 | 0 | `/apps/showcase-heatsink/` |
| iron-crown | 0.909 | 77.4 | 0.5749 | 83 | 0 | 0 | 2 | `/apps/showcase-iron-crown/?a3d-qr=game%2C-vfxFog%2C-post` |
| pips-big-leap | 1 | 152.4 | 0.9244 | 497 | 0 | 0 | 0 | `/apps/showcase-pips-big-leap/` |
| red-zone-3d | 1 | 110.2 | 0.388 | 328 | 0 | 0 | 0 | `/apps/showcase-red-zone-3d/` |
| roadster-rush | 0.991 | 67.6 | 0.7994 | 721 | 0 | 0 | 0 | `/apps/showcase-roadster-rush/` |
| teleoperator | 1 | 95.3 | 0.26 | 520 | 0 | 0 | 0 | `/apps/showcase-teleoperator/` |
| top-tennis | 0.924 | 51.4 | 0.0564 | 616 | 0 | 0 | 0 | `/apps/showcase-top-tennis/` |

Slingshot Siege: not measured (the test timed out at 480 s on a page.evaluate under software rendering).

## Ports

| Port | canvas non-black | luma std dev | draw calls | console errors | page errors | bad responses | self-heal lines | notes |
|---|---|---|---|---|---|---|---|---|
| cloud-runner | 1 | 35.3 | 187 | 0 | 0 | 0 | 0 |  |
| drift-and-deliver | 1 | 32.2 | 107 | 0 | 0 | 0 | 0 |  |
| heatsink | 1 | 53.1 | 43 | 0 | 0 | 0 | 0 | hung: canvasOnlyShot blocked >90s |
| last-train | 1 | 46.1 | 177 | 0 | 0 | 0 | 0 | hung: canvasOnlyShot blocked >90s |
| ninja-runner | 1 | 26.8 | 41 | 0 | 0 | 0 | 0 |  |
| roadster-hours | 1.0 | 44.5 | 71 | 0 | 0 | 0 | 0 |  |
| serpentine-sky-run | 1 | 32.9 | 19 | 0 | 0 | 0 | 0 |  |
| silt-and-signal | 0.998 | 43.1 | 156 | 0 | 0 | 0 | 0 |  |
| splat-rush | 1 | 42.1 | 107 | 0 | 0 | 0 | 0 |  |
| strange-orbit | 1 | 39.9 | 27 | 0 | 0 | 0 | 0 |  |
| where-the-wind-wanders | 0.999 | 35.9 | 16 | 0 | 0 | 0 | 0 |  |

HEATSINK (port) and Last Train booted, accepted Start and played on the 240x180 runs; their final canvas-only screenshot stalled for more than 90 s under software rendering (recorded as `hung`, so the strict spec assertion on a responsive main thread still fails), but the pixel stats above were captured before the stall.

## Self-heal finding (not fixed in this lane)

The 4.1.1 black-frame guard (`02292fb23`, shipped in `cf2d6d5ee`) fired on three index games on the deployed build, logging `SAFETY_BLACK_FRAME ... (lit 0/1536, max channel 0, median frame 0 ms, drawCalls n/a)` after 76-96 'ready' frames each time:
- **Bunker Zero:** two rungs, final URL `?a3d-qr=game,-vfxFog,-post,-compiler`; final frame black (non-black 0, luma 6.8). On 4.1.0 it ran with no rung and non-black 0.952.
- **Cross Hop:** two rungs plus the compile pin, final frame unmeasurable (screenshot failed, canvas blank).
- **Iron Crown:** two rungs (final `?a3d-qr=game,-vfxFog,-post`), final frame lit (non-black 0.909, luma 77.4, 83 draw calls). A page that renders fine was reloaded to a lower quality.
What these three share that the passing games do not is not established (all fifteen use the game lane). The guard reads the canvas through a 2D probe right after each `requestAnimationFrame` callback; the max channel of 0 on pages that do render suggests that for these games the frame may not yet be in the drawing buffer at sample time (asynchronous frame submission on the production renderer, `preserveDrawingBuffer` false). This is a hypothesis from reading `packages/debug/src/safety/guard.ts` and `blackFrame.ts`, not a verified cause. Healthy pages did not fire (all other games and all eleven ports: no rung).

Aura Slam live (`top-tennis`): no rung, non-black 0.924, mean luma 51.4, 616 draw calls, 0 errors (the 4.1.0 false positive did not recur).

Reproduce: copy `tests/browser/live-index-games.spec.ts` (edit the `APPS` array) or `tests/browser/live-ports-smoke.spec.ts` (set `LIVE_SLUGS` via the optional `tests/browser/live-slugs.txt`), then run `RUN_ID=<id> SPECS=<spec> tools/remote-acr/run.sh`; one game or a small group per run lets the heavy ones finish. The throwaway narrowed copies used here are not committed.
