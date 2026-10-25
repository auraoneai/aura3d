# Ion Circuit: final screenshots (after the UI and render fixes)

- **Build:** head of `origin/game-rework` at `0d965903c` (fetched at the start of this capture; includes the group B UI fixes, the Gridlock first-frame fix and the athlete repaint). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-circuit.spec.ts` (unchanged from the earlier retake).
- **Runner:** remote Azure ACR task `finb-circuit` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 640x360 reduced low-quality canvas and 390x844 (HEATSINK never finishes under software GL at 1280x720; labelled reduced). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `early-390.jpg`
- `early-640.jpg`
- `mid-action-390.jpg`
- `mid-action-640.jpg`
- `results-390.jpg`
- `results-640.jpg`
- `start-390.jpg`
- `start-640.jpg`
- `strike-390.jpg`
- `strike-640.jpg`
- `title-390.jpg`
- `title-640.jpg`

## States reached and not reached

Reached: title, start (countdown), early, strike (deterministic strike replay, gun held), mid-action. Card: strike (1440x900 at the reduced quality setting). Not reached: a finished-race results card. The strike replay has no finish, so the `results` frames (`results-640`, `results-390`) show the race in progress.

## Checked against the fixed list (frames opened and read: title 640 and 390, early 640, strike 640, mid-action 390 and 640, strike card)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Low:** in the countdown frame the large "3" overlaps the objective text and the drone.
- **Low:** the `results` frames are not results (see above).
- **Note (not a defect):** the dark bar across the top of the 390 frames is a checkpoint gate crossbar seen close in a narrow view.
- Fixed since the first retake: the title menu no longer overlaps the objective text; the top HUD row wraps inside the viewport on 390.
