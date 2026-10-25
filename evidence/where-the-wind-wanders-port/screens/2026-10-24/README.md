# The Bellkeeper's Walk: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** 1280x720 and 390x844 (mobile subset), plus 720x450 card images at 1x and 2x device scale.

## States

| File | State |
|---|---|
| `title.*` | title card (default load) |
| `gameplay-early.*` | 60 frames after start |
| `key-walk.*` | 120 frames walking right (`D`) |
| `mid-walk.1280x720` | 300 frames walking right |
| `results.1280x720` | the voyage epilogue, forced with `epilogue(6)` (not reached by play; counter still shows 0 / 3) |
| `card.1x`, `card.2x` | 720x450 frame from `key-walk` |

## Problems seen (not fixed in this lane)

1. **Old game name in the UI:** the title card heading reads **"Where the Wind Wanders"** at both 1280x720 and 390x844. The rename to The Bellkeeper's Walk did not reach this card.
2. **Mobile overlap (390x844):** the "0 / 3 discovered" counter is covered by the controls hint at the top.
3. The hero's legs are hidden by grass and the cloak in most frames, so locomotion cannot be judged from stills (see `evidence/where-the-wind-wanders-port/rework/`).
