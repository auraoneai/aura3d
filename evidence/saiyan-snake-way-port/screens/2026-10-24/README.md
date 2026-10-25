# Serpentine Sky Run: screenshots, 2026-10-24

Retake for the Serpentine Sky Run card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-serpentine.
- **Viewports:** desktop 1280x720; mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `early-1280.jpg`
- `early-390.jpg`
- `jump-1280.jpg`
- `jump-390.jpg`
- `jump-card2x.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `roll-1280.jpg`
- `roll-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## What was captured and not reached

- States: title, early, jump, roll (slide), mid-action, results. Mobile and card captured.
- The results state is the fall phase at the end of the idle run: the runner is out of view above a gap in the road. The results overlay is not shown in manual mode, so a results card was not captured.
- The jump frame is 16 steps after the tap (the state reports the runner airborne, y 3.6) but reads as a mid-stride pose in a still.

## Problems seen (not fixed in this lane)

- Old wording on the title card: "A port of a Crayon browser game on the Aura3D engine." at 1280 and 390.
- Mobile 390: the runner panel overlaps the "OUTBOUND - KM COVERED" bar and its number is clipped ("58,50").
- Mobile 390: the title card runs over the Slide, Fly and Surge touch buttons behind it.
