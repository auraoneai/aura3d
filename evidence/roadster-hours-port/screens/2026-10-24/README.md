# Saltwind Highway: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** 1280x720 and 390x844 (mobile subset), plus 720x450 card images at 1x and 2x device scale.

## States

| File | State |
|---|---|
| `title.*` | title screen with route picker (default load) |
| `gameplay-early.*` | run started (`begin()`) |
| `key-drive.*` | 240 autopilot steps in: still inside the start countdown ("1", 0 km/h), so this is the launch moment, not driving |
| `mid-drive.1280x720` | 1680 autopilot steps in (0:11, 199 km/h, relay 2 of 5) |
| `results.1280x720` | run to completion: "Silver Medal" results card |
| `card.1x`, `card.2x` | 720x450 frame after the countdown (autopilot, 700 steps) |

## Problems seen (not fixed in this lane)

1. **The player car and the roadside trees render pure white** in every state (no visible paint or texture; the car reads as a white blob). Looks like untextured or over-exposed materials on the vehicle and tree models.
2. **Mobile overlap (390x844):** the "Sound on" button covers the Heat meter and part of the speed readout at the bottom.
3. Title card is clean at 1280x720: "Saltwind Highway", no old names.
