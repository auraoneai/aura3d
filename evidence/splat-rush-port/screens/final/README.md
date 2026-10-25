# Chroma Roll: final screenshots (after the UI and render fixes)

- **Build:** head of `origin/game-rework` at `0d965903c` (fetched at the start of this capture; includes the group B UI fixes, the Gridlock first-frame fix and the athlete repaint). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-chroma.spec.ts` (unchanged from the earlier retake).
- **Runner:** remote Azure ACR task `finb-chroma` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

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
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, early (countdown/start), roll (autopilot, combo), mid-action, results ("SPLAT!" card, new best). Card: roll. Not reached: none.

## Checked against the fixed list (frames opened and read: title 1280 and 390, roll 1280, early 390, mid-action 390, results 1280)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Low-medium:** on the 390 title screen the start card is wider than the viewport, so its border is clipped at both edges.
- **Low:** on 390 the MILESTONE / OUCH / PERFECT popups stack tightly and nearly touch the combo counter.
- **Low:** the results card sits on a flat red background with no 3D view behind it.
- Fixed since the first retake: the title card reads "CHROMA ROLL" (no old name); no popup collides with the score or combo.
