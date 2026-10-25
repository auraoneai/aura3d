# Ion Circuit: screenshots, 2026-10-24

Retake for the Ion Circuit card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-circuit (first pass) and shotsb-circuit2 (stuck GO hidden).
- **Viewports:** desktop 640x360 (reduced canvas, labelled: this game never finishes under software GL at 1280x720; low quality); mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

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
- `strike-card2x.jpg`
- `title-390.jpg`
- `title-640.jpg`

## What was captured and not reached

- REDUCED CAPTURE: low-quality build, desktop canvas 640x360 (files named *-640), mobile 390x844, card 1440x900. Frames come from the deterministic strike replay (gun held down) used by tests/browser/heatsink-strike.spec.ts: early (countdown), start (step 120), strike (first kill, step 323), mid-action (step 1148), results (end of the 6000-step recorded script).
- The replay ends in lap 2 of the race, so the finished results overlay is not shown; the results frame is the HUD at the end of the script.
- After replay stepping the HUD's "GO" text stayed on screen (the replay does not advance the race countdown past -0.017, so the HUD keeps showing GO). The final captures hide that element; the first pass kept it.
- Not reached: a real-time (non-replay) run and the finished-race results card.

## Problems seen (not fixed in this lane)

- Real bug on the title screen: the menu text overlaps the objective line, the countdown "3" is drawn over the menu and the Start button, and the HUD blocks sit behind the menu (1280-wide reduced and 390).
- Mobile 390: the top HUD row overflows the right edge (Score, Multiplier and Targets are visible; Lap, Time, Best lap and Takedowns are off screen).
- Mobile 390: a hard black band with a thin white seam crosses the horizon between the sky and the road.
- At 640x360 the last HUD block is clipped at the right edge.
