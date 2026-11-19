# Shape Shift Sprint: final screens

Route: `/apps/showcase-shape-shift-sprint/` (`?autoplay=1` plays hands-free; O toggles the autopilot).
Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build served on :8790.

| viewport | frame | meaning |
|---|---|---|
| 1280x720 | 1280-01-title.jpg | title card over the live skyway |
| 1280x720 | 1280-02-early.jpg | ?autoplay=1 run start, gel sphere mascot in lane |
| 1280x720 | 1280-03-action.jpg | mascot lining up with the matching hole in a shape wall |
| 1280x720 | 1280-04-venue.jpg | third world (W3 Carousel Sunset label); passed wall already retracted, hero unobstructed |
| 1280x720 | 1280-05-morph.jpg | mascot morphed into the cone form at a gate |
| 1280x720 | 1280-06-results.jpg | SPLAT! results card after a no-input run (3 wall hits) |
| 390x844 | 390-01-title.jpg | title card over the live skyway |
| 390x844 | 390-02-early.jpg | ?autoplay=1 run start, gel sphere mascot in lane |
| 390x844 | 390-03-action.jpg | mascot lining up with the matching hole in a shape wall |
| 390x844 | 390-04-morph-cube.jpg | mascot in cube form |
| 390x844 | 390-05-morph-cone.jpg | mascot in cone form |
| 390x844 | 390-06-results.jpg | SPLAT! results card after a no-input run (3 wall hits) |
| 720x450 | card-1x.jpg | card: most impressive gameplay moment (LANCZOS downscale of card-2x) |
| 1440x900 | card-2x.jpg | card: most impressive gameplay moment |

Checked in the frames: Mascot readable (bright gel, eyes) and animated (squash, gate dive, morph). Walls/holes visible at every distance (fixed: culled after ~420 m). Cleared walls retract into the road so they no longer hide the hero. No pass-through: runner only scores inside the visible hole.

Results: Results card reached (no-input run: SPLAT!, score 880, 210 m). ?autoplay=1 played 6,800 m / 4 min without losing a life, morphing sphere/cube/cone.

Console page errors: none.

Known issues: 390 gameplay frames come from the 21:46 full-run capture (identical build except the wall-retract speed, 1.1 -> 2 m/m).
