# Gridlock Courier: final screenshots (after the UI and render fixes)

- **Build:** head of `origin/game-rework` at `0d965903c` (fetched at the start of this capture; includes the group B UI fixes, the Gridlock first-frame fix and the athlete repaint). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-courier.spec.ts` (unchanged from the earlier retake).
- **Runner:** remote Azure ACR task `finb-courier` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1); card 1440x900 (the size that showed no road before the fix). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `drift-1280.jpg`
- `drift-390.jpg`
- `drive-1280.jpg`
- `drive-390.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `pickup-1280.jpg`
- `pickup-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, early, drive, drift, pickup, mid-action. Card: drift. Not reached: results (this capture spec has no results state).

## Checked against the fixed list (frames opened and read: title 1280, early 1280, drive 1280, drift 390, pickup 1280, drift card (1440x900))

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Medium:** at 390 wide the minimap covers the speedometer, so it reads a cut-off "10" instead of the speed.
- **Low-medium:** the car body is mottled: dark patches show through the blue paint in some frames (pickup 1280), and there are red patches at the tail lights. It is opaque now, but not clean.
- **Open:** the road that could vanish after a long jump was not reproduced in this capture; the cause is still not established (see the render-fix README).
- Fixed since the first retake: the road is drawn in every frame including the 1440x900 card frame.
