# Thermal Drift: final screenshots

**Retaken 2026-10-31 (GU47 phase 3, lane g03, 4.7.1)** on the GU47 foundry look (now the default; `?look=original` is the
4.6.2 look). Remote Azure ACR Task, headless Chromium, **software WebGL2**. Tool: `tests/browser/audit-fix/heatsink.spec.ts`,
decoded with `evidence/thermal-drift/audit-fix/decode.mjs`. 1280 set from run `g03p3-r9-4`, 390 set from run `g03p3-r6-6`
(same look; r9 adds only denser MEGACITY/VESPER fog and grain), card from run `g03p3-r8-1` shot `card-2x-b` (2.5 s after
the default card moment, where the chase camera sat inside a span over the road), `card-1x` resized from it. The older
notes below describe the 2026-10-29 set.


Retaken on 2026-10-29 for audit row RH-05 (lane G03) from the rebuilt game on branch `audit-fix/g03`, which runs on the
4.5.0 engine. Same file names and sizes as the 2026-10-25 set they replace.

**Runner:** remote Azure ACR Task, headless Chromium, **software WebGL2 (SwiftShader)**, about 0.22 frames per second. This
is not real-GPU evidence: it shows layout, content and relative brightness, not GPU look or frame rate.

**Tool:** `tests/browser/audit-fix/heatsink.spec.ts` (`@base` tests), decoded with
`evidence/thermal-drift/audit-fix/decode.mjs`. Desktop and card from run `g03w3-final-desk`, phone from run
`g03w3-final-phone`. The race is driven by the in-game demo pilot (`?autoplay=1`) and the fixed-step sim is advanced
through the page's QA hook between shots, so later shots are deeper into the race. The phone run starts with a tap on
the start prompt and uses `reducedMotion: "reduce"`, `hasTouch` and `isMobile`.

## Frames

| Viewport | State | What it shows |
|---|---|---|
| 1280 | 01-title | countdown at the start line, P6/12, no invented stats |
| 1280 | 02-early | early in lap 1 |
| 1280 | 03-action | manual input: fire, boost and steer held |
| 1280 | 04-mid | lap 2, steady state |
| 1280 | 05-modes | after choosing the VOLT drone and ELIMINATION |
| 390 | 01-title | tap-to-start prompt over the countdown |
| 390 | 02-early | touch controls (steer pad, FIRE, BOOST, ROLL, ITEM, AUTO, SOUND) |
| 390 | 03-action | after holding FIRE and steering right on the pad |
| 390 | 04-mid | lap 2, steady state |
| 390 | 05-modes | TIME TRIAL: no rivals, field of one |

The results screen is reached in both runs (`06-results` frames in `evidence/thermal-drift/audit-fix/final-g03w3/`); it
is not part of this inventory set.

Card images: `card-2x.jpg` (720x450 viewport at device scale 2, so 1440x900) and `card-1x.jpg` (720x450, downscaled
from the 2x capture).

## Capture health

- 1280: ready in 22.4 s, no page errors; the only failed request is `/fonts/aura-fonts.css` (404 on the dev server, the
  licensed font CSS is served by the deployed site).
- 390: ready in 16.4 s, same single 404.
- card: ready in 24.1 s, same single 404.
- Mean canvas luma (HUD hidden) at 1280: 31.5 to 46.8 across the racing shots. The game now uses the `night-city` look,
  so it is meant to be darker than the old `outdoor-day` frames (about 84).
