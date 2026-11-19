# Gridlock Courier: final screenshots (2026-11-19)

Route: `/apps/gridlock-courier/` (app `apps/showcase-drift-and-deliver-port`, source `examples/drift-and-deliver-port`).

**Runner:** headed Chrome on a real GPU (Apple Metal), production build from the QA snapshot. Play frames via REA `capture_browser_scenario` from `?autoplay=1`; the two title frames and the 390 side-shot frame via a raw-CDP headed Chrome on the same GPU (the REA window was occluded by other agents' windows, so its rAF paused on the splash).

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | Start Shift card |
| 1280 | 02-early | bird's-eye chase, ticket #1 |
| 1280 | 03-avenue | 110 km/h toward an intersection |
| 1280 | 04-intersection | 55 m to the drop-off beacon |
| 1280 | 05-park | turning by the park on ticket #2 |
| 1280 | 06-at-speed | 135 km/h down an avenue |
| 1280 | 07-tree-fade | (2026-11-19) the courier parked just past a kerb palm via the QA teleport hook: the palm between the chase eye and the car is a faint ghost, the car fully visible |
| 390 | 01-title | Start Shift card on a phone |
| 390 | 02-early | bird's-eye chase |
| 390 | 03-intersection | crossing a box junction |
| 390 | 04-delivered | ticket #1 delivered, x2 streak |
| 390 | 05-park | turning by the park |
| 390 | 06-side-shot | first-delivery side shot, now aspect-aware (whole car in frame) |

Card: `card-2x.jpg` (1440x900 native, drifting through a box junction) and `card-1x.jpg` (720x450 LANCZOS).

## Checked in the frames

- Courier: glass roof with the seated driver (orange jacket, cap, hands on the wheel) under it and a smaller strapped parcel at the back of the rack, readable from the bird's-eye chase (owner: the big roof parcel hid the driver).
- Wheels: hub-centred (unit test: <= 2 mm bounds-centre drift over a revolution), spin capped at 18 rad/s / 0.3 rad a frame, real tyre always drawn; close-cam screencast bursts show no wobble.
- Autoplay full shifts at 1280 and 390: 10-13 deliveries, no stall after the cross-street fix; walkers and traffic in place; no page errors.
- 390 side shot frames the whole car (was too close).

## Known issues

- None open for occlusion. Occluder fade (2026-11-19): lamp masts, Idol trees and Idol palms between the chase eye and the courier step into translucent ghost draws. The tree/palm ghosts are the code-built tree/palm shapes: a GLB `material` override keeps the glTF's opaque blend state (opacity alone is ignored), so the earlier Idol-model ghosts drew solid and trees looked as if they never faded (engine follow-up: lower `alphaMode` in model material overrides). Verified on the GPU at three teleport spots (behind a park tree, a kerb palm, three park trees) and a 40 s autoplay run; frames 01-06 were captured before the fix and contain no tree in front of the car.
