# Gridlock Courier: final screenshots (audit lane G18 retake, 2026-10-29)

- **Build:** branch `audit-fix/g18` at `7a570744d` (4.5.0 engine plus the lane G18 fixes: courier shift and results, touch controls, engine-owned resize, furniture colliders, traffic rules, instanced traffic, lights-only neutral fill). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-courier.spec.ts` (unchanged).
- **Runner:** remote Azure ACR task `g18w3-final` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1); card 1440x900. `card@2x.jpg` is the 1440x900 drift frame; `card.jpg` is it downscaled to 720x450. File names and sizes match the earlier set.
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page, after the full warm-up (`ready()` now waits for the HDRI and textures; Start itself unlocks earlier). `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

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

## What changed against the previous set (build `0d965903c`)

- The hero car is the teal hatchback (was the blue hypercar), and the HUD now shows the shift clock, the delivery line (distance and job clock), the drift meter and the drop-off ring on the minimap.
- The 390x844 frames show the touch controls (steering pad, GAS, BRAKE, DRIFT, NITRO, PAUSE, SOUND) and the touch hints on the splash; the minimap no longer covers the speed readout or the pickup counter.
- Not in this set: the results screen. It is captured in `evidence/audit-fix/g18/wave3/after-play/g18x-play-1280-results-ui.jpg` and `after-splash-shift/g18x-shift-end-results-timer-ui.jpg`.
