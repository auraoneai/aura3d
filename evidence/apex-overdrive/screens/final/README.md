# Apex Overdrive: final screenshots (retaken after the 2026-10-29 audit fixes)

- **Build:** `audit-fix/g02` (4.5.0 engine), served by the examples dev server with `apps/showcase-roadster-rush` and the game's two `public/aura-assets` models staged. Capture: `tests/browser/audit-fix/roadster-rush.spec.ts`, decoder `evidence/apex-overdrive/audit-2026-10-29/decode.mjs`; numbers in `metrics.jsonl`. Remote runs `g02c-20261029T140227Z-dm` (desktop), `-pm` (phone), `-x` (card).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** seed 42, driven through `window.__GAME__.game` (manual stepping). Each state is drawn a few more frames before the shot. Every frame was opened and looked at. The card 1x image is the 2x frame downscaled in the page.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | page ready, title card (goal, controls for the current input, best score) |
| `gameplay-early.*` | run started, 60 sim steps |
| `key-ramp.*` | shield pickup plus the "Carrier Ramp" scenario, 30 steps: the carriers drive away from the camera with their ramps at the rear |
| `mid-drive.1280x720` | 480 more steps |
| `results.1280x720` | "Wrecked!" card after a crash. The run used a scenario button, so it shows "Assisted run: the best score is not saved" |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame, ramp scenario, 90 sim steps |

## What changed against the 2026-10-25 set

- Traffic faces its travel direction; the carrier ramps sit at the rear (they sat under the cabs).
- A title card replaces the instant start; the HUD shows speed and the next-kilometre bar.
- Draw calls fell from 875-909 to 150-173 at 1280x720 (instanced pools).

## Problems still visible

1. **Low:** in `card.2x` the player car overlaps the rear of the carrier it is about to climb. It reads as the ramp launch, but a cleaner card would be taken a few steps earlier.
2. **Low:** on the phone the score panel covers part of the left lane (unchanged).
