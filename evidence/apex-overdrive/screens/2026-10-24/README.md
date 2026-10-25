# Apex Overdrive: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** 1280x720 and 390x844 (mobile subset), plus 720x450 card images at 1x and 2x device scale. Served from `apps/showcase-roadster-rush` through the examples dev server with the two vehicle and building GLBs staged.

## States

| File | State |
|---|---|
| `title.*` | page ready, game in `title` mode (this route has no title card; the run is already drawn behind the HUD) |
| `gameplay-early.*` | run restarted, 60 sim steps |
| `key-ramp.*` | shield pickup plus the "ramp" scenario, 30 steps |
| `mid-drive.1280x720` | 480 more steps |
| `results.1280x720` | "Wrecked!" card, forced with the game's `gameOver()` (score 1,460) |
| `card.1x`, `card.2x` | 720x450 frame, 45 steps into a fresh run |

## Problems seen (not fixed in this lane)

1. **Outdated version in the HUD:** the top pill reads "AURA3D 4.0 · APEX OVERDRIVE".
2. **Mobile layout (390x844):** the 3D view fills only the top ~245 px; the rest of the screen is empty dark space with the mode switcher floating in it.
3. **Card (720x450):** the mode switcher wraps to four rows and covers the player car, so the card frame is not clean.
4. **Overlapping traffic:** in `key-ramp.1280x720` two box trucks sit in the same spot, side by side and interpenetrating.
5. The first capture attempt (before staging the two GLBs) showed a black canvas under the HUD; the delivered frames are from the staged run.
