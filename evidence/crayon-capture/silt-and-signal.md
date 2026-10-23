# Silt & Signal: reference capture of the original (R-20 / R-25)

Recorded **remotely** (serverless ACR Tasks, registry `crmmeprodacr`) from the live original by
[`tools/crayon-capture/silt-and-signal.ts`](../../tools/crayon-capture/silt-and-signal.ts); assembled into
[`silt-and-signal-reference.json`](./silt-and-signal-reference.json) (schema `a3d-crayon-capture/1`) by
[`silt-and-signal-assemble.ts`](../../tools/crayon-capture/silt-and-signal-assemble.ts). Never run on the Mac.

## Method

- The game defines `window.silt.inspect()` (live state `Z`, flight state `rn`, target, objective, clock) and, only when its frame has
  `?qa`, `window.silt.qa.{chapter,pose,scene,physicalWorld}`. A srcdoc frame has an empty `location.search`, so a pre-boot hook patches
  `URLSearchParams` in that frame (the outer Crayon app is left untouched: it validates sessions against the real clock).
- The hook replaces `requestAnimationFrame`, `performance.now` and `Date.now` in the game frame with a manual clock. The game derives dt from the
  rAF timestamp (`min(0.05, (t2 - t1) / 1000)`), so one pump per step is an exact 1/60 s step. `Math.random` is seeded. GL draw calls are skipped
  while stepping (the simulation reads no pixels; a software-GL frame otherwise costs hundreds of milliseconds).
- A closed-loop keyboard policy (W/S/A/D/E/Q/B/Shift/F KeyboardEvents) rides one objective from `qa.chapter(c, o)`; the per-step state is recorded
  as 13 columns (x, y, z, yaw, speed, turn, bank, vertical, energy, objective, point, hold, impacts) together with a run-length input script. The bike is brought to rest and the yaw reset before
  each ride, and the manual clock value at the first recorded step is stored (`start.clockMs`) so the port can reproduce the original's float dt.
- Every ride is replayed in the same page from its recorded script, and the whole capture runs in independent browser sessions.

## Rides used as parity references (collision-free, completed)

| Ride (chapter:objective) | Steps | Duration | Ends in | Sessions | Comparisons | Largest position delta between sessions / replay and primary |
| --- | --- | --- | --- | --- | --- | --- |
| 0:1 | 236 | 3.93 s | scene | 2 | 3 | 4.4e-12 |
| 0:2 | 820 | 13.67 s | play | 4 | 7 | 2.5e-10 |
| 0:3 | 158 | 2.63 s | scene | 2 | 1 | 0.0e+0 |

The original is bit-reproducible on these rides (the largest delta is float noise, below 1e-9 m); the tolerance derived from that measurement is
1e-6 m / 1e-6 rad and one completion step, floored for float32 rounding.

## Limit rides (recorded, not parity references)

| Ride | Steps | Collision impacts | Lowest y | Largest delta between sessions | Largest delta replay vs primary |
| --- | --- | --- | --- | --- | --- |
| 0:0 | 2460 | 13 | 1.41 | 1.4e-11 | 1 |

The clinic ride threads the village and is hit by 13 world colliders (and the terrain-floor clamp engages: y falls to 1.41 against a normal
cruise of 4 to 9). The port has no colliders and no terrain floor, so it is not claimed as parity; the 1,400 chapter-0 colliders and the floor
heights at the objective points are stored in the report (`rides[0].world`) for a future port of `Bx`/`St.floor`. The in-page replay of this ride
differs from its primary because moving colliders depend on the game clock, which differs between the two.

## Not covered

Chapters 1 to 6 (other worlds, creatures and timed gates), voiced scenes, the arcade "Free ride & racing" mode, pointer and gamepad axes.
Steering and lift are keyboard-only (discrete), which is also all the port needs.

## Re-running

```bash
pnpm exec esbuild tools/crayon-capture/silt-and-signal.ts --bundle --platform=node --format=esm --external:playwright --outfile=/tmp/silt/silt.mjs
cp tools/crayon-probe/games.json /tmp/silt/
# acr-task.yaml: one step with "timeout: 2400" running the Playwright image (see evidence/crayon-probes/README.md):
#   node silt.mjs --manifest games.json --sessions 1 --runs 0:1,0:2,0:3 --max-steps 5400 --viewport 640x360 --wait-ms 300000 --emit-markers --out /tmp/out
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-task.yaml /tmp/silt   # two of these in parallel give two sessions
pnpm exec tsx tools/crayon-capture/silt-and-signal-assemble.ts runA.log runB.log     # writes this report and the browser replay fixture
```

Use `az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id>` if the local client is cut off. The default 600 s step timeout is too short.
