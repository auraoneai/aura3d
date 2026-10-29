# Lamplight Line: final screenshots

**Retaken 2026-10-29 (audit RH-05, lane g21)** from branch `audit-fix/g21` on the 4.5.0 engine, same file names and sizes, same capture (`tests/browser/finc-lib.ts`, `finc-games.ts` `TRAIN` / `TRAIN_CARD`, wrappers `tests/browser/audit-fix/last-train-port-screens-*.spec.ts`). Runs: `g21w3-scrdesktop-131235` (1280x720 frames), `g21w3-scrmobile-131238` (390x844 frames), `g21w3-scrcard-142538` (card). Software WebGL2 (SwiftShader), not a GPU. The HUD now has the lean meter, streak and lanterns; the results card shows the per-service score, Gold, the grade rule and buttons; in `results` the tram sits parallel to the platform (audit D-11). The 390x844 frames come from a viewport without touch, so the touch bar is not shown (it is in `evidence/last-train-port/audit-fix-g21-wave3/after-phone-*.jpg`).

The original notes from 2026-10-24 follow.

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server, QA hooks). Capture: `tests/browser/finc-lib.ts` + `finc-games.ts` (`TRAIN`, `TRAIN_RESULTS`, `TRAIN_CARD`), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`.
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** the route is the examples page, driven through `window.__AURA_LAST_TRAIN__` at `quality=low`. The route gives no texture diagnostics rows (`none`), so settling could not be measured; the frames show textured buildings, tram and station. Every frame was opened and looked at.
- **Checks:** the title card reads "Lamplight Line"; no old name, "port" or lore term in any visible text; 0 console errors, 0 bad responses. Capture mistakes along the way: the first `key-depart` was still boarding (0 km/h) and the first results step started mid-leg and failed ("stuck waiting for ready"); both were redone.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card with controls |
| `gameplay-early.*` | 2 frames in, tram at the station, "Press E to open the doors" |
| `key-depart.*` | doors, boarding, depart, then 180 autopilot steps: Mango Tide to Folded Gardens, 22 km/h, 4 aboard |
| `mid-leg.1280x720` | 900 more autopilot steps: 29 km/h on the open line |
| `results.1280x720` | "Service complete", grade **Silver**, score 4039, fares 1800, tips 1939, bonuses 300, 0 riders lost: reached from a fresh service by autopilot (`advance(30000)`), a real end card |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame: the tram at the station before the passenger list grows; the 1x image is the 2x frame downscaled in the page |

Mobile (390x844) has title, `gameplay-early` and `key-depart`.

## Problems still visible

1. **Low-medium:** at 720x450 (card) the HUD panels are large and cover about a third of the frame and the bottom bar another sliver; the tram stays fully visible. A later-leg card (the first card attempt) buried the tram under a 7-row passenger list, so the station frame was used.
2. **Low:** on the title card the controls grid and prompt sit over the tram and buildings with modest contrast.
3. **Low:** on mobile the stacked HUD panels take about a third of the screen in `key-depart`.
4. **Low:** in `results` the camera sits at an odd angle with the tram tilted partly through the station canopy.
5. **Low:** the pine trees and the rock are flat-shaded low-poly shapes next to the textured buildings.
