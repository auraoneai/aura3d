# Serpentine Sky Run: final screenshots (after the UI and render fixes)

- **Build:** head of `origin/game-rework` at `0d965903c` (fetched at the start of this capture; includes the group B UI fixes, the Gridlock first-frame fix and the athlete repaint). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-serp.spec.ts` (unchanged from the earlier retake).
- **Runner:** remote Azure ACR task `finb-serp` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `jump-1280.jpg`
- `jump-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `roll-1280.jpg`
- `roll-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, early (check-in banner), jump, roll, mid-action. Card: jump. Not reached: results. The run ends in the fall phase, so the `results` frames (`results-1280`, `results-390`) show the run still in progress, not a results card.

## Checked against the fixed list (frames opened and read: title 1280 and 390, early 1280 and 390, jump 390, mid-action 1280 and 390, results 390, jump card)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Medium:** in the jump frames (and the jump card, `card.jpg` / `card@2x.jpg`) the runner looks washed out and semi-transparent against the road. Pick another card state before wiring the index card.
- **Medium (likeness review):** the Ember runner reads as an orange suit with dark wristbands and sash and a topknot; worth a review next to the likeness audit.
- **Low:** the Slide and Fly touch buttons on 390 are almost invisible (very low contrast); only Surge is clearly a button.
- **Low:** the `results` frames are not results (see above).
- Fixed since the first retake: the title and tagline show no "port of a Crayon browser game" sentence; the HUD no longer overlaps; the distance bar sits at the bottom on phones.
