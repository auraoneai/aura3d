# Cumulus Dash: final real-GPU frames

Route: `/apps/cumulus-dash/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | title card |
| `1280-02-rolling-log.jpg` | 1280x720 | first seconds | the run begins: kid visible ahead of the textured rolling log |
| `1280-03-canyon.jpg` | 1280x720 | early play | sandstone canyon, pearls and coins |
| `1280-04-tyrant.jpg` | 1280x720 | peak action | the tyrant walking beside the road ('get right or bonk him') |
| `1280-05-vault-the-water.jpg` | 1280x720 | second venue | vaulting the river between shrine bells |
| `1280-06-final-gap.jpg` | 1280x720 | late course | final canyon gap at 96% |
| `1280-07-finish-home.jpg` | 1280x720 | finish | home at last: the kid reaches the shrine house (finish cinematic) |
| `390-01-title.jpg` | 390x844 | title | title orbit, kid readable in portrait |
| `390-02-run-begins.jpg` | 390x844 | first seconds | the run begins, kid framed in portrait |
| `390-03-rolling-log.jpg` | 390x844 | early play | kid running past the textured log |
| `390-04-boulder.jpg` | 390x844 | early play | boulder incoming |
| `390-05-run.jpg` | 390x844 | peak | mid-course run, Idol trees |
| `390-06-steed.jpg` | 390x844 | second venue | riding the steed at 91% |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | the kid running the ridge road between shrine bell gates, Idol trees and cloud sky |

## Checked in the frames

- tyrant legs differ between frames (walks), hawk/flyers flap, kid run cycle
- rolling log is a textured bark log; rocks/logs drawn at hitbox size; rope bridges replaced (no fall-through planks)
- no black see-through shadow sheet, no dark blob canopy near the road (fixed); Idol trees along the whole course
- shrine pillars clear the lanes
- steed ride seen at 91% (390-05); portrait camera now snaps behind the kid at run start (fixed)

## Known issues

- flyer path and title orbit were rebuilt (flyer stays ahead of the kid, never between camera and kid); the specific 50% dive was not re-caught in a capture window, the 52-55% portrait window shows the kid unobstructed
- the portrait frame at ~80% looks down into a real gap (far wall), not camera-in-geometry
