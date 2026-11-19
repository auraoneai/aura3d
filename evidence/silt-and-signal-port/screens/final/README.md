# Duneglide: final screenshots

Route: `/apps/duneglide/`

Runner: headed Chrome on a real GPU (Apple Metal) via REA `capture_browser_scenario`, production build served from http://127.0.0.1:8790 (2026-11-18).

| Viewport | File | State | Meaning |
|---|---|---|---|
| 1280x720 | 1280-01-title.jpg | title | title screen over the chase framing, chapter list |
| 1280x720 | 1280-02-early.jpg | early | ?autoplay=1: through ring 7 in the village, rider balanced with arms low |
| 1280x720 | 1280-03-action.jpg | action | carving along the canal past the banner mast (ring 5) |
| 1280x720 | 1280-04-hold.jpg | hold | stopped in the ring, holding for the passenger (objective 2) |
| 1280x720 | 1280-05-turbo.jpg | turbo | Turbo (speed 50) down the tree-lined road, camera holds 11-12 m behind past the trees |
| 1280x720 | 1280-06-venue2.jpg | venue2 | chapter 5 Orchard of Storms (?chapter=4&start=1&autoplay=1), through ring 3 at altitude 99 |
| 1280x720 | 1280-07-results.jpg | results | Journey complete card (QA jump ?chapter=6&objective=4&start=1&autoplay=1, so 1 of 7 chapters) |
| 390x844 | 390-01-title.jpg | title | title screen, portrait |
| 390x844 | 390-02-early.jpg | early | autoplay through ring 6 in the village, touch Boost/Hold buttons |
| 390x844 | 390-03-scene.jpg | scene | story card after the first objective (autoplay continues it after 3 s) |
| 390x844 | 390-04-turbo.jpg | turbo | Turbo (speed 50) toward the standing arches |
| 390x844 | 390-05-venue2.jpg | venue2 | chapter 5 Orchard of Storms |
| 1440x900 | card-2x.jpg | card | autoplay through ring 7 in the village (rider, skiff, rings, town and strata) |
| 720x450 | card-1x.jpg | card | card-2x.jpg downscaled (LANCZOS, q88) |

## Checked in the frames

- Rider arms stay low at every speed and in hard carves (hands >= 40 deg below the shoulders on the GPU Turbo burst; was level with the shoulders before)
- Chase camera never closer than 8.9 m to the rider over the full journey (was 2.6 m past roadside trees); crowns between camera and rider fade
- ?autoplay=1 flies around piers and trees (1 impact over 7 chapters, was 27), uses Turbo on clear legs, no watchdog restarts
- Rings, trees and buildings grounded; no pass-through

## Known issues

- Fixed 2026-11-19: flying far off a chapter route used to show a flat untextured sand plane and the far dune-ring backdrop as floating ribbons. A soft play boundary (examples/silt-and-signal-port/boundary.ts) now eases in a crosswind 64-100 m from the route that banks the skiff back and bleeds outward motion (no wall snap); verified on the real GPU holding Turbo + steer off the route in chapters 1 and 2 and past the chapter-2 finish (rider never beyond 98 m, only dressed village / hills in frame). Autoplay is bit-identical, so these frames are unchanged.
