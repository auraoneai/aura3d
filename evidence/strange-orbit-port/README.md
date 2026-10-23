# evidence/strange-orbit-port/

Frames rendered by `examples/strange-orbit-port` on the serverless ACR GPU runner (headless
Chromium 147, WebGL2) by `tests/browser/strange-orbit-port.spec.ts`. 480 x 270 JPEG, taken from
the log of run `so-c-20261022T225313Z`; the final-code confirmation run
`so-d-20261022T230635Z` passed with the same assertions.

| file | moment |
| --- | --- |
| `menu.jpg` | menu beauty shot (riders at s = 35, planet and overhead course ribbon) |
| `race-start.jpg` | just after "go": chase camera, five rivals ahead, checkpoint pillars and veil in the distance |
| `race-6s.jpg` | six seconds in: leaning into a curve beside a moon rock, the painted split rising on the right |
| `finish.jpg` | after a full autopilot race, back at the start line |

These prove the port renders its world; they make no pixel-parity claim against the original.
The simulation parity claim is carried by `tests/unit/strange-orbit-port/reference-replay.test.ts`
and the in-browser replay in the same spec.

## Art pass (runs `so-art5`..`so-art7`, final `so-art7-20261023T105422Z`)

Same runner, 640 x 360 canvas frames (`art-*.jpg`) and 960 x 540 full-page screenshots including the HTML UI
(`art-ui-menu.jpg`, `art-ui-race.jpg`). `compare-before-after.jpg` puts the frames above beside the new ones.
`art-metrics.json` holds structural metrics (luma/RGB histogram JSD, palette distance, edge density) against the
original's title screen, which is the only original frame captured so far (local-only, not committed): title-screen
luma JSD 0.378 to 0.290 (0.248 with the HTML overlay), RGB JSD 0.457 to 0.289 (0.215), palette distance 53.7 to 31.3
(22.3). The race-start rows compare against the title screen too, so they only show palette drift, not matched states.
No in-race original frames exist, so no matched-pair judge could be run; a model judge would not be a human anyway.

## Meshy art pass (2026-10-23)

Riders, bikes, gate pylons, rim boulders and the horizon lander and observatories are now Meshy-generated models (provenance table in `examples/strange-orbit-port/PORTING-NOTES.md`, files and rights under `examples/strange-orbit-port/assets/`).

- Before: `art-menu.jpg`, `art-race-*.jpg` (primitive riders). After: `meshy-after/` (menu, race-start, race-6s, race-20s, race-45s, finish, replay-finish, plus the skate mode frames `skate-menu`, `skate-race-start`, `skate-race-10s`). Sheet: `compare-meshy-before-after.jpg`. Frames are port-only; the original's frames stay local and are not committed. The repo ignores `*.jpg`, so only this README and `meshy-metrics.json` are tracked unless the images are force-added.
- Remote runs: `so-meshy-1-20261023T174127Z` (found the node-count assertion, since a rider is now one node instead of 19), `so-meshy-2-20261023T180011Z` (2 of 2 specs passed: bike race with the 7-lap replay still exact, and skate mode).
- Perf (software WebGL2, low quality): 51 draw calls on the bike run (52 on skate), 22 scene nodes, 121 geometries, 42 programs, 0 engine errors; the engine reports no triangle count here. New asset bytes: 12.4 MB across eight GLBs (riders 2.3 + 2.4 + 1.8, pylon 1.1, props 1.0 + 1.2 + 1.6 + 1.8).
- Judge: not run. The only original frames captured for this game are title screens, so there are no matched in-race pairs and a blind A/B would not be a fair test. A model judge is not a human anyway.
- Metrics against the original's title screen, menu state (`meshy-metrics.json`): luma JSD 0.290 -> 0.300, RGB JSD 0.289 -> 0.300, palette distance 31.3 -> 31.3. Unchanged within noise: the reference has no riders, so this measures the backdrop, not the models. The visible change is the riders (see the sheet).
