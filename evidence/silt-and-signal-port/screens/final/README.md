# Duneglide: final screenshots (after the UI and render fixes)

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server, QA hooks). Capture: `tests/browser/finc-lib.ts` + `finc-games.ts` (`SILT`), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl` (luma stats, visible text, canvas sizes, texture settle, errors).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU; these frames are not real-GPU evidence.
- **Method:** the route is the examples page (no quick bar or credit link), driven through `window.__AURA_SILT__`. Texture upgrade waited until 0 materials pending (18 rows, 8 textured; 439 s on desktop). Every frame was opened and looked at.
- **Checks:** no old name, "port" or lore term in any visible text; 0 console errors, 0 bad responses; the canvas fills the viewport at every size.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card (default load) |
| `gameplay-early.*` | chapter 1 start, objective 1, throttle 0: Speed 0 is expected here |
| `key-boost.*` | 120 frames of throttle, steer and boost: HUD reads Speed 6, Mode Turbo |
| `mid-fly.1280x720` | 360 frames of throttle: Speed 3, Cruise, 93 m |
| `results.1280x720` | the results card, **forced** with `setMode("done")`, not reached by play: Time in flight 0:07, Lamps restored 1, Field notes 0, Impacts 2, Rating "Steady hand" |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame from `key-boost`; the 1x image is the 2x frame downscaled in the page |

## Fixed since the first retake (confirmed in frames)

- The HUD reads the real speed (6, 57) instead of 0 while flying.
- On mobile the compass no longer covers the objective text, and the controls box no longer sits on the speed meter.
- The camera is no longer inside trees and walls in flight.
- The results card has real stats and a rating instead of a bare "Journey complete".

## Problems still visible

1. **Medium (art):** large untextured cream slabs (building blocks) dominate `key-boost`, `mid-fly` and the card and read as placeholder boxes.
2. **Low-medium:** a big flat green shard polygon (a tree-leaf plane) sits in the lower left of `mid-fly`.
3. **Low:** in `key-boost.1280x720` a cream wall fills the left third close to the camera; it is clear of clipping but heavily occludes the view.
4. **Low:** on mobile the chapter buttons truncate long names ("2. The Broken Wat…").
5. **Low:** the rider is small on a flat white disc with two cyan ovals in every frame.
