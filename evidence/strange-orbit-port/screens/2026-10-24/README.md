# Craterline GP: screenshots, 2026-10-24

Retake for the Craterline GP card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-orbit2 (shotsb-orbit was the first pass: its early and boost frames were still in the countdown and its results frame was a lost race).
- **Viewports:** desktop 1280x720; mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

## Frames

- `boost-1280.jpg`
- `boost-390.jpg`
- `boost-card2x.jpg`
- `card.jpg`
- `card@2x.jpg`
- `impact-1280.jpg`
- `impact-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `start-1280.jpg`
- `start-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## What was captured and not reached

- States: title, start (countdown), boost (racing, boost held), mid-action (autopilot, checkpoint 3), impact (rider flown into a gate pillar at 35 m/s: "Crashed into the gate pillar"), results (a full seven-lap autopilot finish: Gold medal, 1 of 6). Mobile and card captured.

## Problems seen (not fixed in this lane)

- Old name: the title screen heading reads "STRANGE ORBIT." and the tagline "Orbital Cycling Club" is still shown (page title is Craterline GP).
- The standings panel overlaps the race-time panel ("Best lap" line) at 1280, and on mobile 390 it covers the lap and race-time panels; "Lap 1 / 7" wraps to two lines.
- The amethyst track section shows a heavily smeared, stretched pink and grey surface texture in mid-action.
- In the impact frame the bike sits on top of the pillar's base (the hit registered, the rebound is not visible in a still).
