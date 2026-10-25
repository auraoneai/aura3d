# Gridlock Courier: screenshots, 2026-10-24

Retake for the Gridlock Courier card and README per `docs/workflows/game-rework-prompt.md` section 5.

- **Commit:** `06cf4f7eb` (head of `origin/game-rework` when captured). Capture code: `tests/browser/shotsb-lib.ts` and the per-game `shotsb-*.spec.ts`.
- **Runner:** remote Azure ACR task (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Run ids:** shotsb-courier (first pass) and shotsb-courier2 (final: key names fixed, pickup retry, straight-road mid-action).
- **Viewports:** desktop 1280x720; mobile 390x844 (touch emulation, scale 1); card 1440x900 captured as `card@2x.jpg` and downscaled to `card.jpg` (720x450, the index card aspect).
- **Method:** each state is driven through the game's QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal (non-manual) page. `capture-log.txt` has the per-frame state, the overlays visible, and console and page errors (none in any pass).

## Frames

- `card.jpg`
- `card@2x.jpg`
- `drift-1280.jpg`
- `drift-390.jpg`
- `drift-card2x.jpg`
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

## What was captured and not reached

- States: title, early (spawn), drive (240 steps), drift (W+D+Space), pickup (retries up to 30 pickups until one registers; score 10, 1 of 174 collected), mid-action (200 steps with nitro). Mobile 390x844 captured.
- CARD IS A FALLBACK: the 1440x900 capture (drift-card2x.jpg, kept as evidence) renders the road without asphalt or markings (see problems), so card.jpg and card@2x.jpg are a centred 16:10 crop of drift-1280.jpg (1152x720); card@2x.jpg is therefore upscaled 1.25x and softer than the other games' 2x cards.

## Problems seen (not fixed in this lane)

- Rendering bug that depends on canvas size: at 1440x900 the same drift state draws no asphalt or road markings (flat grey-green ground fill under the car), while 1280x720 and 390x844 draw the road correctly (compare drift-card2x.jpg with drift-1280.jpg). Not investigated here.
- The player car body renders translucent: interior geometry shows through the roof and body in every driving frame, with grey and blue patches in the paint.
- The edge of the city shows a flat grey-green ground fill meeting tan hills (pickup frame).
