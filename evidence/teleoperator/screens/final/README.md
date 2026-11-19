# Grid Dispatch: final screenshots (2026-11-18)

Route: `/apps/showcase-teleoperator/` (app `apps/showcase-teleoperator`).

**Runner:** headed Chrome on a real GPU (Apple Metal) via REA, production build served from the QA snapshot. First frame from the plain URL (the game opens straight into a manual shift, no title card); play frames from `?autoplay=1` (L5 self-driving).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | opening frame: manual shift on California Street, fare offer |
| 1280 | 02-early | L5 self-driving pulls up to the kerb beacon |
| 1280 | 03-pickup | picking up Maya Lin; two sidewalk walkers mid-stride (retaken 2026-11-19: gdWalkerA-D and gdCommuter textures cleaned, zero-length tangents repaired) |
| 1280 | 04-trip | active trip to the Financial District |
| 1280 | 05-fare-results | RIDE COMPLETE fare card (5 stars, $35.74), taxi alongside |
| 1280 | 06-cable-car | Line 59 cable car beside the car |
| 390 | 01-05 | opening, early, trip, drop-off, Sodium Night on a 390 x 844 phone |

Card: `card-2x.jpg` (1440x900 native capture, autoplay at 12 s: pickup beacon, sidewalk walkers; retaken 2026-11-19 with the cleaned walker textures) and `card-1x.jpg` (720x450 LANCZOS).

## Checked in the frames

- Sidewalk walkers (gdWalker set) change leg pose between frames 0.7 s apart (stride vs. passing pose); no torn skin visible at the closest crop available (about 160 px tall).
- Traffic wheels sit in their arches (taxi, coupe), the cable car rides its rails.
- Autoplay: L5 self-driving starts by itself, pulls up to the kerb, boards, drives the trip and completes the fare.
- No blank/frozen frames after load; no page errors.

## Known issues

- Wheel spin and gdWalkerA close-up stretch could not be judged from these stills (no 50 ms burst in this pass).
