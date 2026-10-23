# Aura Slam native renderer vs the live game

`native-frames/` (1280x720 and `-640`), `live-frames/` (the live page's game canvas, same states), `native-contact-sheet.jpg`
(six venues), `native-vs-live-sheet.jpg` (live | native per venue with metrics), `native-vs-live-metrics.json`.

How it was made (remote, software WebGL2): `tests/browser/aura-slam-native-vs-live.spec.ts` loads the live page per venue, reads its
sim state with `__TOP_TENNIS_CONTROL__.getState()` (fixtures: `tests/fixtures/aura-slam/live-state-<venue>.json`), screenshots only its
canvas, then draws that exact state with the native renderer and M-POSE pose solver. Rebuild the files from a run log with
`node tools/aura-slam/extract-frames.mjs <acr-run.log> evidence/aura-slam`.

Known differences: sun-shadow casting is off for static decor (stands, bench, boards), so the live page's darker shadow bands on the ground
beside the stands are missing; mean luma is about +2 brighter; a dark wedge near the rear stand appears in native only.
