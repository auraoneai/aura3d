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
