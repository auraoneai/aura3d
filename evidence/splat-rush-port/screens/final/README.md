# Splat: final real-GPU frames

Route: `/apps/chroma-roll/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | splash with controls incl. O autoplay |
| `1280-02-early-run.jpg` | 1280x720 | early play | autoplay rolling the red ball under a gate gantry |
| `1280-03-streak.jpg` | 1280x720 | peak action | ball through a gantry, paint splash, 2x pickup |
| `1280-04-shield-perfect.jpg` | 1280x720 | power-up | shield + PERFECT/MILESTONE at 54,412 |
| `1280-05-results.jpg` | 1280x720 | results | SPLAT! game-over card |
| `390-01-title.jpg` | 390x844 | title | splash |
| `390-02-early-run.jpg` | 390x844 | early play | red ball under a gantry |
| `390-03-streak.jpg` | 390x844 | peak action | splash through a gate, 2x |
| `390-04-shield-streak.jpg` | 390x844 | power-up | shield streak x5 |
| `390-05-results.jpg` | 390x844 | results | SPLAT! card |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | the runner pushing the paint ball under a gate gantry, x5 streak, floating islands |

## Checked in the frames

- runner visible behind the ball and animated, ball rolls; gates and pickups readable
- finish arch feet moved outside the ball path (pass-through fix)
- streak flashes toned down: the frame no longer washes out in the ball colour (was 0.22-0.42 screen flash every gate)
- gate rows are now one gantry: posts only outside the road (inner edge 4.0 m > ball reach 3.88 m), bar underside 1.88 m above the 1.76 m ball, so no ball rolls through a post (was: posts at +-0.85 inside the sim's 1.2 m window)

## Known issues

- bunting can sweep close to the camera at the top of the frame
