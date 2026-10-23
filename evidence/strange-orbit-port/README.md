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
