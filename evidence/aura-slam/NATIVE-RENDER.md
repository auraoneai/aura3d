# Aura Slam native renderer vs the live game

`native-frames/` (1280x720 and `-640`), `live-frames/` (the live page's game canvas, same states), `native-contact-sheet.jpg`
(six venues), `native-vs-live-sheet.jpg` (live | native per venue with metrics), `native-vs-live-metrics.json`.

How it was made (remote, software WebGL2): `tests/browser/aura-slam-native-vs-live.spec.ts` loads the live page per venue, reads its
sim state with `__TOP_TENNIS_CONTROL__.getState()` (fixtures: `tests/fixtures/aura-slam/live-state-<venue>.json`), screenshots only its
canvas, then draws that exact state with the native renderer and M-POSE pose solver. Rebuild the files from a run log with
`node tools/aura-slam/extract-frames.mjs <acr-run.log> evidence/aura-slam`.

## G3 results (remote, software WebGL2, vs the current live page, post-processing ON)

Thresholds: luma JSD <= 0.05, RGB JSD <= 0.05, edge ratio 0.9-1.1, |mean luma delta| <= 4, draw calls <= 150. All pass.
Line mask = bright low-saturation pixels (court lines); recall/precision allow 2px. Per venue, worst of the six: 1280x720 luma JSD 0.0003,
RGB JSD 0.0039, edge ratio 1.02-1.04, luma delta 0.33-0.38, line recall >= 0.99, precision >= 0.97 (`native-vs-live-metrics.json`, `venues`).

| size | luma JSD | RGB JSD | edge ratio | luma delta | line recall/precision (2px) | draw calls (strict spec, <=150) |
|---|---|---|---|---|---|---|
| 1280x720 | <= 0.0003 | <= 0.0039 | 1.02-1.04 | 0.33-0.38 | 0.99-1.00 / 0.97-1.00 | 111-125 |
| 640x360 | <= 0.0002 | <= 0.0038 | 1.006-1.02 | 0.32-0.36 | 0.998-1.00 / 0.996-1.00 | 111-125 |
| mobile 390x844 | 0 | 0.0001 | 0.997-1.006 | 0.01 | 0.999-1.00 / 0.998-1.00 | n/a (79-93 in the sizes run) |

`sizes/<size>-<venue>-{live,native}.jpg` are the frames. Mobile note: the live page lays its HUD out above the canvas on portrait, so its
canvas sits 156px lower and the bottom 156px of the canvas (where the near player stands) is clipped; the comparison covers the 688 rows
the live page shows. The native renderer draws the whole canvas.

What closed the earlier gaps: the reference moved (live now runs with post-processing on, about 25-40% darker) so native uses the `game`
flags; statics (stands, bench, boards) now cast sun shadows, which restores the live shadow bands beside the stands; the dark wedge near the
rear stand came from the old post-off look and is gone in every venue; draw calls dropped from 187-209 to 111-127 with one shadow cascade
(`?cascades=auto` restores three), one instanced draw for the spectators, and small rig parts not casting (`?rigshadows=full` restores them).

Rebuild: `PUBLIC_ASSETS="showcaseStadiumSeats.afb44897.glb rooftopScoreboardRigMeshy.866123b7.glb rooftopFloodlightTowerMeshy.1bfcdd0b.glb"
SPECS="@headed-xvfb tests/browser/aura-slam-native-vs-live.spec.ts" tools/remote-acr/run.sh` (1280 and `native-vs-live-sheet.jpg`), and the same with
`aura-slam-render-sizes.spec.ts` (640 and mobile). `aura-slam-render.spec.ts` enforces the 150 draw-call budget unconditionally.
