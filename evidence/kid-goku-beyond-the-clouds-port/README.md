# Kid Goku: Beyond the Clouds: port frames

`start.jpg` and `after-gap.jpg` are 480x270 JPEGs of the Aura3D port rendered on the serverless ACR runner (headless Chromium 147,
software WebGL2), from `tests/browser/kid-goku-beyond-the-clouds-port.spec.ts`, run `kid-goku-20261023T070557Z`.

- `start`: step 0 of the run (road along the original's centerline, meadow, placeholder hero).
- `after-gap`: after the scripted run (jump at s >= 147): s = 180.1, Dragon Ball 1 collected, no fall.

These are stand-in visuals (procedural road, meadow, capsule hero), NOT a match for the original's painterly look; they show the port
renders the original's track layout with correct simulation state. Simulation parity is the claim, verified by replaying the original's
recorded input: worst deltas s 0, lane 0, jump 9.2e-13, speed 2.0e-13 over 160 trace points, in Node (`tests/unit/kid-goku-beyond-the-clouds-port/reference-replay.test.ts`)
and in the browser (the spec's replay case).
