# Grid Dispatch (`teleoperator`): final screenshots

**Retaken 2026-10-29 on the audit-fix build** (lane G04, branch `audit-fix/g04`, Aura3D 4.5.0 engine). Same file names and sizes as the 2026-10-25 set. Spec: `tests/browser/audit-fix/teleoperator.spec.ts`; runs `g04c-desktop` (1280x720), `g04d-phone` (390x844, touch), `g04c-card` (1440x900). Frames are decoded from the run log with `tools/teleoperator/decode-gl-log.mjs`.

**Runner:** remote Azure ACR Task, headless Chromium, software WebGL2 (SwiftShader). This shows layout and content, not GPU look or frame rate. The app is paused for each capture (the canvas keeps its last presented frame), because software GL presents about one frame every 10 to 15 s.

## Frames

| Viewport | State | Meaning | Status |
|---|---|---|---|
| 1280 | 01-title | first frame after ready | captured |
| 1280 | 02-early | after 60 s and 6 frames (steady state) | captured |
| 1280 | 03-action | after holding W and D | captured |
| 1280 | 04-mid | after 45 s of manual driving | captured |
| 1280 | 05-modes | AI rivals panel | captured |
| 1280 | 06-results | shift results after five fares | captured |
| 390 | 01-title | first frame, touch pads shown | captured |
| 390 | 02-early | steady state | captured |
| 390 | 03-action | after touch Throttle and Right | captured |
| 390 | 04-mid | after 45 s of self-driving | captured |
| 390 | 05-modes | AI rivals panel | captured |
| 390 | 06-results | shift results | captured |

Card images: `card-2x.jpg` (1440x900, captured) and `card-1x.jpg` (720x450, downscaled from it).

## Capture health

- 1280 and 390: 0 page errors and 0 console errors in the run logs.
- `app.diagnostics()`: `renderPath.path` is `hdr-msaa`, `bloomFusion` is `separable`; GL draw calls 411 in the chase view at steady state (610 on the base build, run `g04b-desktop`).

## Checked in the frames

- The car sits in its lane: in the chase view the car's view-space x is 3.58 m right of the inner yellow line (base build: 1.13 m, the car drawn on the centre line).
- 390: the fare card sits under the earnings row, the dial is centred between the touch pads, and nothing overlaps the speedometer.
- Two nearest AI rivals get a full tag; the others a small chip.
- Results: Fares 5/5, earned $193.12, average 5.0 stars, 0 collisions and 0 red lights, score 218, Retry button.

## Still open

- The hero pod and some traffic models still read as generic shapes with soft, generated textures (art, not code).
- On 390 the rival chips can still touch each other near the horizon.
