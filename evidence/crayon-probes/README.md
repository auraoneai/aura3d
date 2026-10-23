# evidence/crayon-probes/

Runtime probe evidence for the ten Crayon Arcade candidates, one JSON per
game (`schema: a3d-crayon-probe/2`), produced **remotely only** by
[`tools/crayon-probe/index.ts`](../../tools/crayon-probe/index.ts).

Each file records P-1..P-4 from
[`docs/workflows/threejs-parity-gaps.md`](../../docs/workflows/threejs-parity-gaps.md)
§9 — node-material usage (P-1), `isBatchedMesh` instances (P-2),
EffectComposer vs the r186 node pipeline (P-3), and
`isShaderMaterial`/`isRawShaderMaterial` counts (P-4) — as
`yes` / `no` / `inconclusive`, each with a `basis`:

| basis | meaning |
| --- | --- |
| `live` | counted on the game's own live Scene objects (traversal ran over a populated scene) |
| `module` | the class cannot be constructed: the importmap game never requested the module that defines it |
| `none` | the question was not answered (`inconclusive`) |

`no` is only emitted when the question was actually asked. A heap-snapshot
class name is corroboration only and never decides a verdict (core three
classes such as `BatchedMesh` and `ShaderMaterial` appear in every build).

## How scenes are found (R-01)

`context.addInitScript` installs a hook before any game script runs, in every
frame including the sandboxed `about:srcdoc` game iframe. The hook owns
`window.__THREE_DEVTOOLS__`, the bus three.js dispatches `observe` on from the
`Scene`, `WebGLRenderer` and `WebGPURenderer` constructors, so the probe holds
the game's own live objects whether three came from an importmap or an inlined
bundle. The earlier probe `import("three")`ed in the frame and matched
`Runtime.queryObjects` prototypes against the game's objects, which returns 0
when the module record differs; it also loaded `three/webgpu` and the
EffectComposer addon itself and called `getContext("webgl2")` on the game
canvas. **Files recorded under schema `/1` are superseded.**

Key fields: `liveObjects.scenes`, `liveObjects.sceneTraversal` (object,
instanced, batched, shader and node-material counts, constructor histograms),
`liveObjects.renderers` (render calls and non-null render-target sets),
`frame.clickedStart` / `frame.sceneSettled` / `frame.peakObjects` (whether the
title screen was passed and the scene graph stopped growing), and
`module.resourceSignals` (which three/addon modules the page actually loaded).
A scene with only its root object counts as not populated.

## Running it (remote only)

Serverless ACR Tasks on `az-auraone-gurbaksh` (no agent pool, nothing left
running or billing after the run). Bundle the tool, then run it inside the
Playwright image; `--emit-markers` prints each report between
`@@CRAYON_PROBE_BEGIN:<id>` / `@@CRAYON_PROBE_END:<id>` so the run log can be
split back into these files.

```bash
mkdir -p /tmp/crayon-probe-run && cd /tmp/crayon-probe-run
pnpm --dir <repo> exec esbuild tools/crayon-probe/index.ts --bundle --platform=node \
  --format=esm --external:playwright --outfile=/tmp/crayon-probe-run/probe.mjs
cp <repo>/tools/crayon-probe/games.json .
cat > acr-task.yaml <<'EOF'
version: v1.1.0
steps:
  - cmd: mcr.microsoft.com/playwright:v1.59.1-noble bash -c "cd /workspace && npm init -y >/dev/null 2>&1 && npm i playwright@1.59.1 --no-audit --no-fund >/dev/null 2>&1 && CRAYON_PROBE_ROOT=/workspace node probe.mjs --manifest games.json --out /tmp/out --emit-markers --wait-ms 60000 --launch-arg --enable-unsafe-swiftshader --launch-arg --use-angle=swiftshader --launch-arg --ignore-gpu-blocklist"
EOF
az-auraone-gurbaksh acr run --registry crmmeprodacr --file acr-task.yaml . > run.log 2>&1
# a full roster takes ~10-14 min; if the client is cut off, the run continues:
#   az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > run.log
```

Split `run.log` into per-game files by extracting the marker blocks and
`JSON.parse`-ing each one. Use `--only <id[,id]>` to re-probe single games.
A missing file or an `inconclusive` answer keeps the parity gate red; nothing
here is fabricated.

## Getting past the title screen and deciding a scene has settled (R-25)

`waitForPopulatedScene` no longer relies on a fixed label list. Each cycle it lists the visible
interactive controls in every frame (`LIST_CONTROLS_SOURCE`, tagged `data-a3d-ctl=<n>`), ranks them with
`chooseStartControl` (`tools/crayon-probe/startControl.ts`: exact "Tap to start" 100, a leading action verb such as
"Drive Sunbreak Coast" or "Begin the journey" 80, a contains-match 50; menu-only entries such as
Sound/Records/Upgrades/Settings never qualify) and clicks the best one with a **real pointer click** through a
Playwright locator (retry with `force`, one retry per control). Start flows are multi-step: it keeps clicking
follow-up start controls for up to 4 steps, spaced 6 s apart, and records `frame.clickSequence`.

Settle criteria (`settleStatus`), recorded as `frame.settleCriterion` / `frame.settleDetail`:

| criterion | rule |
| --- | --- |
| `strict` | object count within 3% of the latest for `--settle-ms` (default 4000) |
| `plateau` | for streaming/churning worlds: within `--plateau-pct` (default 8%) of the max over `--plateau-ms` (default 15000) **while the renderer is still drawing** (a stalled page cannot plateau-settle) |

New fields: `frame.objectSamples` (downsampled time series of object count and render calls),
`frame.controlsFirstSeen` / `controlsLastSeen` / `controlsAfterStart`, `frame.hudTextAfterStart`,
`frame.gameStateAfterStart` / `gameStateFiveSecondsLater` (the harness' `__getGameState` and `window.__*` hooks),
`frame.evalMs` (median/max page-evaluate latency) and `frame.viewport`.

### Why "start click timed out" and "child-frame eval timed out" happened

Not a cross-origin or frame-loss problem. On the software-GL ACR runner a heavy game blocks the page's main
thread while it loads: a single `frame.evaluate` stalled **62-75 s** on Roadster Hours and **4-21 s** on Silt &
Signal (median under 10 ms). Prism's short evaluate/click timeouts fail inside that window; Playwright locator
clicks with an 8 s actionability timeout and the 240 s overall wait do not. Use `--viewport 800x450` for heavy games
(fewer pixels to software-render); `--wait-ms 240000` leaves room for the stall.

### Remote recipe changes

Add `--viewport 800x450 --wait-ms 240000` for the two heavy games. The local `az acr run` client can stop
streaming after the first game even though the run keeps going; when that happens do not re-run, fetch the log:

```bash
az-auraone-gurbaksh acr task list-runs --registry crmmeprodacr --top 6 -o table   # find the run, wait for Succeeded
az-auraone-gurbaksh acr task logs --registry crmmeprodacr --run-id <id> > run.log
```

### Roadster Hours and Silt & Signal re-recorded (ACR run `cc1ch`)

| Game | Start flow | Settled | Scenes / objects | BatchedMesh | ShaderMaterial | Instanced |
| --- | --- | --- | --- | --- | --- | --- |
| `roadster-hours` | `Drive Sunbreak Coast` (pointer click); gameplay HUD text present after the click | strict, 494..494 | 1 / 494 | **68** | 29 | 121 |
| `silt-and-signal` | `Free ride & racing` (pointer click, force) | strict, 10724..10724 | 1 / 10724 | 0 | 14 | 10 |

Counts equal the earlier lower-bound runs, so those numbers stand. Silt & Signal shows no DOM gameplay HUD and no
`__getGameState`, and its object count is the same before and after the click, so its post-start phase is inferred
from the click sequence, not from game state; this is recorded as a limitation in
`evidence/crayon-runtime/silt-and-signal/session.json`. Diagnostic runs: `cc1c9` (800x450), `cc1ca` (1440x1000),
`cc1cf` (first full recording).
