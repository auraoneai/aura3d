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
