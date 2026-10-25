# Shadowstep Gauntlet: screenshots, 2026-10-24

Retake for the Shadowstep Gauntlet card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-gauntlet.
- **Viewports:** desktop 1280x720; mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

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
- `run-card2x.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## What was captured and not reached

- States: title, early, run, action (jump then rasengan), gate-hit (runner placed 9 m before a barrier, stepped into it: health 5 to 4, planks fly), mid-action (autopilot), results ("RUN COMPLETE: The village is safe." 2640 m, 102 defeated). Mobile and card captured.

## Problems seen (not fixed in this lane)

- Mobile 390: the "Sound on" pill sits over the stats panel and the ability stack covers the form buttons (Sunfire, Ember) and part of the runner.
- Scenery: foreground houses and trees in the Backstreets show torn, melted-looking polygons and stretched textures (gate-hit frame, right side).
- Scenery: near the end of the course the background is made of huge flat grey polygons (results frame).
