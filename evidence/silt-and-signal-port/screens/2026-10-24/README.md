# Duneglide: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** 1280x720 and 390x844 (mobile subset), plus 720x450 card images at 1x and 2x device scale.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title screen (default load) |
| `gameplay-early.*` | chapter 1 start, objective 1 ("land and hold steady"; throttle is held at 0 here) |
| `key-start.*` | chapter 1 start, flight objective ("follow the road past the standing arches"): the card source |
| `flight-boost.*` | 200 frames of throttle, steer and boost |
| `mid-flight.1280x720` | 500 frames of throttle |
| `results.1280x720` | the results card, forced with `setMode("done")` (not reached by play) |
| `card.1x`, `card.2x` | 720x450 card frame from `key-start` |

## Problems seen (not fixed in this lane)

1. **Mobile overlaps (390x844):** the compass circle covers the end of the objective text ("...your p"), and the controls box sits on top of the Speed meter.
2. **Camera clips scenery in flight:** in `flight-boost` a tan building slab fills the left third of the frame, and in `mid-flight` the camera sits inside trees and walls.
3. **HUD reads Speed 0 and Altitude 4 while the rider is flying** under forced input (manual stepping). May be a manual-mode HUD refresh gap only; not checked in live play.
4. **Results card is bare:** "Journey complete" and "Fly again", no stats (state is forced, so this may be empty by construction).
5. No old game name appears in the UI; the title shows "Duneglide".
