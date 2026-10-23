# evidence/crayon-capture/

Reference captures of the **original** Crayon games, used as the target for the
Aura3D ports (PRD `docs/workflows/threejs-parity-gaps.md` §7.2 phase exits).
Produced **remotely only** by [`tools/crayon-capture/`](../../tools/crayon-capture/).

## strange-orbit-reference.json (`schema: a3d-crayon-capture/1`)

Phase A exit: a 7-lap race that matches on lap count, checkpoint order and finish
time within tolerance.

| field | meaning |
| --- | --- |
| `setup` | the race as launched: mode `cup`, difficulty, vehicle, rider, course, laps, rivals, sim step |
| `policy`, `script` | the closed-loop controller and the **run-length input script it produced** (`<steps>x[PBOJG-] s=<steer>`, one step = 1/60 s, countdown steps included). Replaying the script reproduces the race bit-for-bit |
| `reference` | the recorded run: `lapTimes`, `finishTime`, `checkpoints` (lap, gate position, name, sim time), `place`, `standings`, `hudFrames` (HUD text at go / each lap / finish), 1 Hz `trace` |
| `sessions` | each independent browser session: finish time, whether its script/result equal the reference, whether its own replay was identical, and its timing-perturbation results |
| `variance` | `repeat` = run-to-run (other sessions and replays); `perturbed` = replays delayed by 1/3/6 steps |
| `tolerance` | `max(1 sim step, 1.5 x worst observed delta)`, derived from `variance` |

## How the playthrough is made repeatable

The game's simulation is a pure `pp(state, input, 1/60)`; `Math.random` and wall-clock
time only touch visuals and audio. A hook injected before game boot
(`context.addInitScript`, which reaches the sandboxed `about:srcdoc` frame):

1. makes `new URLSearchParams(location.search)` report `qa`, enabling the game's own
   `window.__orbit.{begin, race, advance}` QA hooks (the srcdoc frame has no query string);
2. wraps `requestAnimationFrame` and freezes it, so the real-time loop cannot add steps.

The runner then calls `__orbit.advance(1/60, input)` once per step. Nothing in the sim
depends on frame timing, so the result depends only on the input sequence.

## Running it (remote only)

Same serverless ACR Task recipe as [`../crayon-probes/README.md`](../crayon-probes/README.md).

```bash
mkdir -p /tmp/crayon-capture-run && cd /tmp/crayon-capture-run
pnpm --dir <repo> exec esbuild tools/crayon-capture/strange-orbit.ts --bundle --platform=node \
  --format=esm --external:playwright --outfile=/tmp/crayon-capture-run/capture.mjs
cp <repo>/tools/crayon-probe/games.json .
cat > acr-task.yaml <<'EOF'
version: v1.1.0
stepTimeout: 1800
steps:
  - cmd: mcr.microsoft.com/playwright:v1.59.1-noble bash -c "cd /workspace && npm init -y >/dev/null 2>&1 && npm i playwright@1.59.1 --no-audit --no-fund >/dev/null 2>&1 && CRAYON_PROBE_ROOT=/workspace node capture.mjs --manifest games.json --sessions 2 --emit-markers --out /tmp/out --wait-ms 90000 --launch-arg --enable-unsafe-swiftshader --launch-arg --use-angle=swiftshader --launch-arg --ignore-gpu-blocklist"
    timeout: 1800
EOF
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-task.yaml . > run.log 2>&1
pnpm --dir <repo> exec tsx tools/crayon-capture/assemble.ts --log run.log --log <other-run>.log \
  --out evidence/crayon-capture/strange-orbit-reference.json
```

Add `--sweep` to try the controller parameter sets and print each outcome, and
`--params '{"laneGain":0.06,...}'` to choose the controller. `assemble.ts` exits non-zero
and writes nothing unless the report validates: a finished 7-lap reference, a parseable
script and at least two independent sessions.

## Six-game fixed-input captures (`<game>-reference.json`, R-25)

Splat Rush, Saiyan Snake Way, Drift & Deliver, Roadster Hours, Where the Wind Wanders and Silt & Signal have no QA
hook like Strange Orbit's `__orbit.advance`, so determinism comes from a **virtual-time hook** injected before any game
script into the sandboxed `about:srcdoc` frame (`tools/crayon-capture/six-common.ts`, `VT_HOOK_SOURCE`):

- `requestAnimationFrame`, `performance.now`, `Date.now`, `Math.random` (seeded) and, after boot, `setTimeout`/`setInterval`
  are virtual. The game advances only when the harness calls `__a3dVt.step()` (one step = 1/60 s of virtual time).
- Keys are dispatched as synthetic `KeyboardEvent`s on the largest canvas (so canvas, `document` and `window` listeners
  each see them once); pointer input as `pointer*` + `mouse*` events at fractions of the canvas rect.
- Real asset loading, wasm init and audio are **not** virtualised, so the number of steps before the game becomes
  ready (`readyFrame`) can differ between sessions. The script clock starts when the game's ready predicate becomes true,
  and `repeatability.maxReadyFrameDelta` records how much the pre-script phase varied.

| field | meaning |
| --- | --- |
| `status` | `CAPTURED`: every input session reached ready, >= 2 independent input sessions, the input script changes an observable relative to an idle control, repeatability is stated. `LIMIT-RECORDED`: anything less, with `statusReasons` and a `routeHealthLimit` string a port can carry |
| `startFlow`, `script` | the start actions and the input script (`tools/crayon-capture/<game>.ts`; grammar in `six-common.ts#parseSixScript`) |
| `reference.snapshots` | at step 0 and every `snapEvery` steps: HUD text, the game's own primitive state fields (from `window.game`/`window.__game`), camera position if exposed, and the canvas readback (FNV-1a hash of the frame plus a 16x9 luma grid) |
| `idleReference` | the same virtual steps with every input removed; `inputEffect` counts the snapshots where the input run differs |
| `repeatability` | `withinRun` (sessions of the run with the most input sessions) and `acrossRuns`: exactness, max numeric state delta, max luma delta, minimum canvas-hash match fraction |
| `tolerance` | `1.5 x` the largest observed state/luma delta, 0 when every comparison is bit-identical |
| `engineSurfaces` | what a port needs, derived from the game's live probe (`evidence/crayon-probes/<game>.json`) |

A pixel diff against an Aura3D port is **not** part of these six: none has a port. They are the fixed-input references a
future port is compared against.

### Running it (remote only)

Same serverless ACR Task recipe as above; one task per game and plan (`--plan input,idle` for run A, `--plan input,input`
for run B; keep a task under the 1800 s step limit), bundled per game, with `CRAYON_SIX_RUN=1` so the spec file runs:

```bash
pnpm --dir <repo> exec esbuild tools/crayon-capture/<game>.ts --bundle --platform=node --format=esm \
  --external:playwright --outfile=<dir>/<game>.mjs
# step command: CRAYON_SIX_RUN=1 CRAYON_PROBE_ROOT=/workspace node <game>.mjs --manifest games.json \
#   --plan input,idle --run-id A --emit-markers --out /tmp/out --wait-ms 240000 --launch-arg --enable-unsafe-swiftshader ...
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-<game>-A.yaml --no-wait .
az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > <game>-A.log   # the client often drops
pnpm --dir <repo> exec tsx tools/crayon-capture/six-assemble.ts --game <game> --log <game>-A.log --log <game>-B.log \
  --probe evidence/crayon-probes/<game>.json --out evidence/crayon-capture/<game>-reference.json
```

Software GL costs about 0.2-0.6 s per frame at 480x270, so the capture uses short scripts (240-360 steps).
`six-assemble.ts` exits non-zero and writes nothing unless the report validates.

## Saiyan Snake Way (`saiyan-snake-way-reference.json`)

Reference for the outbound run of "Saiyan through the Snake way!", recorded by
`tools/crayon-capture/saiyan-snake-way.ts` on serverless ACR Tasks (module capture run `cc1df`; policy and
replay runs on registry `crmmeprodacr`) and assembled offline by `saiyan-snake-way-assemble.ts`.

- **How it is repeatable.** The game's simulation (`qB(dt)`) has no randomness and no clock reads. A
  pre-boot hook sets `window.__HARNESS` (the page otherwise stubs `window.__TEST` to a no-op) and freezes
  `requestAnimationFrame`; the tool steps `__TEST.sim` / `__TEST.tap` at exactly 1/60 s and reads the raw
  state from `window.__PROBE.S`.
- **Reference run.** A closed-loop autopilot (jump the road gaps, change lanes or jump/slide around hazards,
  toggle Kaio-ken on spare ki and drop it before the strain bar fills) drives the real game from the start
  to the end of the road: 5,433 steps (90.55 s), 8 stages, 36 Kaio-ken rung changes, 1 hit, 47 key taps,
  ending with 267.5 of 365 days left. Its per-step inputs are recorded as a run-length script.
- **Variance.** Two fresh browser sessions replayed that script and matched the policy run bit for bit
  (8,967 fields each, 0 mismatches, max abs diff 0). The recorded tolerance is 1e-6, which only absorbs the
  9-decimal rounding of snapshot values.
- **Limits.** The finish state depends on the autopilot's parameters (a different controller reaches the end
  with a different day count). The script is only valid replayed step-exactly. No pixels are recorded: the
  reference is simulation state; the port's frames are in `evidence/saiyan-snake-way-port/`.
- **Port check.** `tests/unit/saiyan-snake-way-port/reference-replay.test.ts` replays the script through
  `examples/saiyan-snake-way-port/sim.ts` and matches all 183 snapshots.


## Splat Rush (`splat-rush-reference.json`, `splat-rush-reference-death.json`; Phase-A-style exit for a second game)

Splat Rush is a single 43 KB inline module (`tests/fixtures/crayon/splat-rush/`), so the whole game can be read and ported. Its
gameplay and its visual effects draw from the same `Math.random` stream, and three.js itself draws four numbers per object UUID, so
the capture splits the stream by caller (`tools/crayon-capture/splat-rush-lib.ts`, `VT_HOOK_SOURCE`):

- **Game stream**: draws made from the game's own `blob:null/...` module (gate colours, power-up type and lane, particles, camera
  shake, cloud and rain seeds, canvas textures). Seeded mulberry32. Recorded as `rngCount` in every trace row. The port consumes it
  in the same order, so equal `rngCount` at every step is the proof that gameplay and visual randomness line up.
- **Library stream**: every other caller (three.js UUIDs, the boot runtime). Separate seed, not modelled.
- `performance.now` and `requestAnimationFrame` are virtual (one step = 1/60 s of `1000 + n * (1000 / 60)` ms); `AudioContext` is
  removed (the original fills a 0.4 s noise buffer from `Math.random` on its first noise effect, a sample-rate-dependent count).

| field | meaning |
| --- | --- |
| `script` | the input script the closed-loop steering policy produced (`<steps>x[SDU-] dx=<n>`: S pointerdown on the splash, D pointerdown in play, U pointerup, dx pointermove pixels) |
| `reference.trace` | one row per step (`traceFields`): score, distance, speed, lives, combo, multiplier, lane offset, colour, ball scale, timers, milestone, `rngCount`, player and camera position, visible gates/power-ups/splatters/segments. Row 0 is the state after 30 idle splash frames |
| `reference.events` | events derived from consecutive rows: start, gate-match, hit, shield-block, pick-ups, colour switch, milestone, burst, game-over |
| `reference.gates`, `reference.hud` | gate rows (z, lane, colour, passed) and HUD text every 30 steps |
| `sessions` | each independent browser session; `traceEqualsReference` is whether its trace equals the reference bit for bit |
| `variance`, `tolerance` | derived from the sessions: `1.5 x` the largest observed delta, 0 when bit-identical |

`splat-rush-reference.json`: 1500 steps, mistakes injected on gate rows 4 and 10 (loses lives, resets combo). `...-death.json`: 700
steps, mistakes on rows 1-3 until all lives are lost (burst, then game over). An idle control (start, never steer) is recorded in
`variance.idleControl`.

### Running it (remote only)

Same serverless ACR Task recipe as above, bundled with esbuild. Policy flags are plain (`--mistake-rows 4,10`) because JSON does not
survive the task YAML quoting; sessions are emitted as `@@SPLAT_CHUNK <id> <i> <n> <base64>` lines because ACR truncates log lines near
4 KB, and the assembler repairs a chunk line that the runtime split with an injected progress line.

```bash
pnpm exec esbuild tools/crayon-capture/splat-rush.ts --bundle --platform=node --format=esm --external:playwright --outfile=capture.mjs
# step command (in the playwright image, after `npm i playwright@1.59.1`):
#   CRAYON_PROBE_ROOT=/workspace node capture.mjs --manifest games.json --plan input,replay --steps 1500 --warmup 30 \
#     --run-id A --mistake-rows 4,10 --emit-markers --out /tmp/out --wait-ms 240000 \
#     --launch-arg --enable-unsafe-swiftshader --launch-arg --use-angle=swiftshader --launch-arg --ignore-gpu-blocklist
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-runA.yaml --no-wait .
az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > runA.log   # blocks until the run ends
pnpm exec tsx tools/crayon-capture/splat-rush-assemble.ts --log runA.log --log runB.log --log runI.log \
  --probe evidence/crayon-probes/splat-rush.json --out evidence/crayon-capture/splat-rush-reference.json \
  --fixture tests/browser/data/splat-rush-reference-replay.json
```

Software GL costs about 0.3-0.4 s per step at 480x270: 1500 steps is about 10 minutes per session, so keep two sessions of 1500 steps
to one task (the ACR step limit is 30 minutes) or split them across runs.

## last-train-reference.json (`schema: a3d-crayon-capture/1`, Last Train to the Sea, Phase D)

The original has no QA hooks, so a pre-boot hook patches the game's module text as it becomes a `Blob`
(`tools/crayon-capture/last-train-lib.ts`, `blobPatchSource`) and exposes the module's pure functions as `window.__a3d`
(`WM` fixed-step update, `GM` doors / depart / new-service / time-of-day, `FM` state constructor, the route sampler `Cu`, the
economy helpers). The runner steps them headlessly at exactly 1/60 s from a closed-loop controller (PD balance on roll, cruise at the
`brisk` pace, brake on remaining distance) over three full circuits of the six towns: day, night, day. No rendering is involved.

| field | meaning |
| --- | --- |
| `setup` | fixed step, controller parameters, difficulty, start station, loops, the day / night / day schedule |
| `constants` | driving constants, garage stats, the `low` difficulty table, towns and sky palettes, leg lengths, temperament thresholds, driving gates |
| `inputs` | run-length script `<steps>x[ABRLP]/<pace>` for all three circuits (doors / depart actions are in `events`) |
| `events` | every phase change with step, time, leg, aboard, fares, tips, bonuses, lost, comfort, streak; `ready` events list each passenger with tip and comfort |
| `trace` | one row per 30 steps: time, leg, distance, speed, roll, roll velocity, aboard, score, fares, tips, lost, comfort, catches |
| `loops` | per circuit: steps, seconds, per-leg stats, score, wallet, JS heap, simulation state-size counters |
| `repeatability`, `memory` | two fresh sessions were bit-identical; state-size counters are flat; JS heap moves with GC and is recorded, not asserted |

The route (2 m samples) and the station passenger tables are written to `examples/last-train-port/data/` by the same assembler.

```bash
pnpm --dir <repo> exec esbuild tools/crayon-capture/last-train.ts --bundle --platform=node --format=esm --external:playwright --outfile=capture.mjs
# ACR task: node capture.mjs --manifest games.json --sessions 2 --loops 3 --emit-markers --out /tmp/out --wait-ms 150000 ...
pnpm --dir <repo> exec tsx tools/crayon-capture/last-train-assemble.ts --log run.log \
  --out evidence/crayon-capture/last-train-reference.json --data examples/last-train-port/data
```

A run takes about 50 s on ACR (no rendering). `assemble` exits non-zero and writes nothing unless at least two sessions finished all loops
with identical inputs, events and trace.

