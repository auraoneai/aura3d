# Shadowstep Gauntlet: final screenshots (after the UI and render fixes)

- **Build:** head of `origin/game-rework` at `0d965903c` (fetched at the start of this capture; includes the group B UI fixes, the Gridlock first-frame fix and the athlete repaint). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-gauntlet.spec.ts` (unchanged from the earlier retake).
- **Runner:** remote Azure ACR task `finb-gauntlet` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

## Frames

- `action-1280.jpg`
- `action-390.jpg`
- `card.jpg`
- `card@2x.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `gate-hit-1280.jpg`
- `gate-hit-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `run-1280.jpg`
- `run-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, early, run, action, gate-hit (a crate ram with debris), mid-action, results ("The village is safe."). Card: run. Not reached: none.

## Checked against the fixed list (frames opened and read: title 1280, run 1280, gate-hit 1280 and 390, mid-action 390, results 1280, run card)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Medium:** foreground trees and houses still show torn, faceted polygons and smeared texture (right-hand house at 404 m, left tree at 45 m). The house mesh itself needs new art.
- **Low:** the valley cliffs on the results screen are huge flat planes.
- **Low:** on 390 the ability bar and form selector take about 130 px at the bottom of the screen.
- Fixed since the first retake: no old name in the UI; the controls stack and the progress bar sits under the cards on phones.
