# Lamplight Line: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** 1280x720 and 390x844 (mobile subset), plus 720x450 card images at 1x and 2x device scale. (The 4.1.x notes say this game never finishes on software GL; at these sizes it loaded and ran.)

## States

| File | State |
|---|---|
| `title.*` | title screen with controls (default load) |
| `gameplay-early.*` | docked at Mango Tide |
| `key-depart.*` | doors opened, 300 steps of boarding ("Boarding: Wait for Ready, then hold W"); the tram has not left |
| `mid-leg.1280x720` | autopilot, 900 steps into the first leg |
| `mid-late-leg.1280x720` | autopilot, leg 4 (Monsoon Exchange), 10 aboard |
| `results.1280x720` | service complete: grade Silver, score 4039 |
| `card.1x`, `card.2x` | 720x450 frame from `key-depart` |

## Problems seen (not fixed in this lane)

1. **Title overlay clutter (1280x720):** the controls hint block sits on top of the tram, so "accelerate" and "balance" labels overlap the model.
2. **Mobile overlaps (390x844):** the top-left station panel and the top-right speed panel overlap, and "Next: Folded Gar..." is truncated.
3. At 640x360 (earlier attempt, not kept) the title overlay collided with the controls panel; not re-checked.
4. No old game name in the UI; the title shows "Lamplight Line".
