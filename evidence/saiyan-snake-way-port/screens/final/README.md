# Serpentine Sky Run: final real-GPU frames

Route: `/apps/serpentine-sky-run/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | title card with runner choice and the controls (incl. O autoplay) |
| `1280-02-intro.jpg` | 1280x720 | intro | 1.3 s after Start: intro swing has framed the runner during the countdown |
| `1280-03-early.jpg` | 1280x720 | early play | Check-In stage, torii centred over the road, orbs in lane |
| `1280-04-long-road.jpg` | 1280x720 | second stage | THE LONG ROAD banner, runner mid-stride (autoplay) |
| `1280-05-autoplay-run.jpg` | 1280x720 | peak action | autoplay at speed under the torii, full spark bar |
| `1280-06-fall.jpg` | 1280x720 | fall | idle runner fell through a plate gap |
| `1280-07-results.jpg` | 1280x720 | results | YOU FELL results card |
| `390-01-title.jpg` | 390x844 | title | title card |
| `390-02-intro.jpg` | 390x844 | intro | countdown 2 with the runner framed |
| `390-03-early.jpg` | 390x844 | early play | torii and orbs |
| `390-04-long-road.jpg` | 390x844 | second stage | long road at speed |
| `390-05-run.jpg` | 390x844 | peak action | runner mid-stride under a torii, orb ahead |
| `390-06-results.jpg` | 390x844 | results | results card |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | autoplay run on the serpent's back, torii straddling the road, coils behind |

## Checked in the frames

- runner limbs differ between frames (run cycle), hit/stumble clip seen after a soul pass
- torii now centred: both posts on the parapet/flank, none in the lanes (was shifted 6.3 m right, left post stood in the lanes: the owner's pass-through)
- lanterns stand on the serpent's flank, gatehouse centred
- runner framed by 1.2-1.3 s after Start (intro swing now runs through the countdown)
- no white discs: orbs are jade rings/spheres
- no camera-inside-mesh after the passed-entity cull (a soul used to fill the frame)

## Known issues

- souls are walked through by design (ghosts, -3 days)
- with flight (E power) the runner is a ghost off the road and can pass decor; by design of the original
