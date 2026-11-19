# Lamplight Line: final real-GPU frames

Route: `/apps/lamplight-line/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA, production build (http://127.0.0.1:8790).

| frame | viewport | state | meaning |
|---|---|---|---|
| `1280-01-title.jpg` | 1280x720 | title | title card with controls incl. P autoplay |
| `1280-02-doors-open.jpg` | 1280x720 | platform | doors opening at Mango Tide, crowd on the platform |
| `1280-03-boarding.jpg` | 1280x720 | boarding | steps out, riders boarding (walkers move between frames) |
| `1280-04-departing.jpg` | 1280x720 | departing | tram leaving the town at 17 km/h, 4/12 aboard |
| `1280-05-viaduct.jpg` | 1280x720 | peak | cruising on the viaduct over the cloud sea |
| `1280-06-island-approach.jpg` | 1280x720 | second venue | approaching the Folded Gardens island |
| `390-01-title.jpg` | 390x844 | title | title card |
| `390-02-departing.jpg` | 390x844 | departing | leaving the platform |
| `390-03-viaduct.jpg` | 390x844 | peak | viaduct |
| `390-04-island-approach.jpg` | 390x844 | second venue | island approach |
| `card-2x.jpg` / `card-1x.jpg` | 1440x900 (1x: 720x450) | card | the tram leaving Mango Tide over the cloud sea, riders aboard, the next island town ahead |

## Checked in the frames

- motorman visible in the cab and riders seated; platform walkers change position between frames 0.7 s apart
- tram on the rails, pantograph on the wire; clock not in view at this camera
- no floating props; walkers no longer cross crates/stalls (pass-through fix)

## Known issues

- wheels are hidden by the body skirt at the chase camera, so wheel roll is not verified in these frames
- results card not captured (service too long for the capture window)
- 390 loads slower: first ~10 s is the 'Lighting the first view' card
