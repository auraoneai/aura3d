# Aura Links 3D: final screenshots (2026-11-18)

Route: `/apps/showcase-aura-links-3d/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | `1280-01-title.jpg` | modes menu (loading bar no longer drawn over the menu) |
| 1280 | `1280-02-tee.jpg` | ?autoplay=1 St Auroras hole 1, golfer at address on the tee |
| 1280 | `1280-03-swing.jpg` | backswing, ball at the clubhead, power meter |
| 1280 | `1280-04-flight.jpg` | follow-through with ball-flight telemetry |
| 1280 | `1280-05-green.jpg` | putt on the St Auroras green, lighthouse and gallery |
| 1280 | `1280-06-maple.jpg` | second course: Maple Hollow tee shot |
| 1280 | `1280-07-mare.jpg` | Mare Course (black-sky lunar), bright regolith, drive leaving the tee |
| 1280 | `1280-08-results.jpg` | ROUND COMPLETE scorecard (`?autoplay=1&hole=7`: holes 7-9 played hands-free, -5 on 6 strokes; unplayed holes read "-", the PAR total sums the played holes only: par 11) |
| 390x844 | `390-01-title.jpg` | modes menu on a phone |
| 390x844 | `390-02-tee.jpg` | address on the tee, touch controls |
| 390x844 | `390-03-swing.jpg` | backswing |
| 390x844 | `390-04-flight.jpg` | follow-through with telemetry |
| 390x844 | `390-05-maple.jpg` | Maple Hollow tee |
| 390x844 | `390-06-mare.jpg` | Mare Course, white ball at the clubhead |
| 390x844 | `390-07-results.jpg` | ROUND COMPLETE scorecard on a phone |
| 1440x900 | `card-2x.jpg` | putt on the St Auroras green with caddie, lighthouse, clubhouse and gallery (`card-1x.jpg` = 720x450 LANCZOS downscale) |

## Checked in the frames

- the ball sits at the clubhead on tee and fairway shots on all six courses (QA node dump: golf-ball within 1 cm of golfer-club-head, golfer 0.52 m from the ball); the white dot the owner saw was a dunes wildflower sphere and on Mare the aim line's near tip
- address posture: ~30 deg hip hinge, straight upper back, head up (Idol body follows the solve at address, unit-tested per golfer)
- trees: no floating (procedural conifers/oaks and alpine horizon pines now on the lowest ground under the root spread, all courses tested); the ball hits trunks/canopies and the flagstick
- pond water draws (St Auroras hole 1); Mare exposure: bright grey regolith, black sky, horizon kept in flight frames
- every hole of every course (54) swept hands-free with ?autoplay=1

## Known issues

- Cinder Rim reads flat brown with few landmarks (look, not a defect)
- bunkers on St Auroras hole 1 show green patches inside the sand (grass islands or terrain poking through; not changed)
