# Chroma Roll: screenshots, 2026-10-24

Retake for the Chroma Roll card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-chroma.
- **Viewports:** desktop 1280x720; mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `roll-1280.jpg`
- `roll-390.jpg`
- `roll-card2x.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## What was captured and not reached

- States: title, early (run start), roll (autopilot through colour gates), mid-action (power-ups and a life lost), results (game over via the original's idle run). Mobile 390x844 and the card were captured too.
- Results frame is the game-over card on a solid red background (the world is hidden by design).

## Problems seen (not fixed in this lane)

- Old name: the title card heading reads "SPLAT RUSH" at 1280 and 390, although the page title is Chroma Roll.
- Mobile 390: the milestone, OUCH and PERFECT popups stack over the SCORE and combo text at the top of the HUD.
