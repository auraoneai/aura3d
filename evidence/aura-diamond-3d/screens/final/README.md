# Aura Diamond 3D: final screenshots (2026-11-18)

Route: `/apps/showcase-aura-diamond-3d/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | modes menu: ballparks, clubs, difficulty |
| 1280 | `1280-02-early.jpg` | ?autoplay=1 Harbor Sandlot, pitch on the way, fielders set |
| 1280 | `1280-03-batter.jpg` | batter cam at Ivy Classic, stance and timing rings |
| 1280 | `1280-04-contact.jpg` | contact read-out (exit velo / launch), batter after the swing |
| 1280 | `1280-05-ivy.jpg` | Ivy Classic, runner on first |
| 1280 | `1280-06-canyon.jpg` | Canyon Rim, walk, runner jogging to first |
| 1280 | `1280-07-midtown.jpg` | Midtown Skyline under the floodlights after the look fix: green grass, red-brown clay, lit players |
| 1280 | `1280-08-results.jpg` | results: DERBY COMPLETE card (Midtown, 3 HR, longest 365 ft) |
| 390x844 | `390-01-title.jpg` | modes menu on a phone |
| 390x844 | `390-02-early.jpg` | portrait pitch, touch zone and swing button |
| 390x844 | `390-03-play.jpg` | later pitch, runner on second |
| 390x844 | `390-04-ivy.jpg` | Ivy Classic, walk, runner to first |
| 390x844 | `390-05-midtown.jpg` | Midtown Skyline, ball in play to the outfield |
| 390x844 | `390-06-results.jpg` | results: DERBY COMPLETE card on a phone |
| 1440x900 | `card-2x.jpg` | Ivy Classic: batter, catcher, runner jogging to first, all fielders (`card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- batter, pitcher, catcher and fielders animate (stance shifts, swing, runner jog); 33 ms screencast: smooth
- ball scale realistic (~1/3 of a head)
- pass-through: fielders stop at the warning track / foul line (never through the wall, dugouts or coaches), foul poles are solid, wall collider matches the drawn +-45 deg wall, fielders and runners keep 0.9 m apart, landing ball sits on the mound
- all six parks run hands-free with ?autoplay=1

## Midtown Skyline look fix (2026-11-19)

Field region (x 20-80 %, y 45-88 % of a 1280x720 autoplay frame), mean HSV saturation / Lab C*: Midtown before 0.10 / 9.2
(lavender clay, pale teal grass), after 0.40 / 22.8; day parks 0.44-0.49 / 30, Dome 0.06 / 3.8, Lunar 0.18-0.21 / 8.9.
Cause: 4.8x combined exposure, a bright blue IBL fill and a blue 9000 K backlit key. Now 2.5x exposure, IBL 0.35, a
near-white 6500 K floodlight key from the camera side, and a blue-hour gradient sky (the drawn HDRI's street lamps,
luminance up to 27 000, bloomed the low walk-up shot white).

## Known issues

- Black foreground grass for a frame right after a 117.9 mph contact at Harbor (one earlier 1280 frame,
  /tmp/gpu-shots/Q6-dia-1-06-a5.png): not reproduced in about 10 more contacts (derby bursts at 120-300 ms, high and
  medium tier, Harbor and Midtown). The frame looks like the `field-grass` plane was not drawn (the preetham sky's
  dark lower hemisphere shows through; clay and players drawn), which points at an engine draw/program transient, not game code.
- Harbor Sandlot batter cam occasionally catches strong low-sun glare
