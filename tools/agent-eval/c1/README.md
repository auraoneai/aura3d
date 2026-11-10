# C1 fixed comparison harness

Plan item C1 in `docs/project/future-engine-work.md` (section 4 and the 5.5.1 task list): 8 tasks chosen before results,
3 runs each, arms native Aura3D, three.js, and three.js + the B1 bridge, with every authoring, export, CLI and repair
step counted. The frozen spec (tasks, arms, measurements, probe checks, visual rubric, decision rule) is
`tests/reports/benchmark-c1/SPEC.md`; read it first. This directory extends `tools/agent-eval` (same sandbox, base
tools, Prism client and leak checks).

## Tasks (frozen 2026-11-09, before any model run)

Text copied verbatim from the benchmark-505 lane branches (`origin/bench/505-<category>`); manifest `tasks.json`,
checklists `tasks/checklists.json`, probes `probes.mjs`.

| id | covers | 505 task | requested behaviour probed | follow-up edit |
|---|---|---|---|---|
| 101 | character / animation | animation-1 walking spider | continuous motion | Space toggles walking/paused |
| 102 | shader / effect | effects-2 portal | `portalActive`, live particles, time, motion | 'Close portal' / 'Open portal' |
| 103 | outdoor | environments-1 canyon | flythrough moves | 'Pause flythrough' / 'Resume flythrough' |
| 104 | small game | games-2 stacker | drops stack, game ends, HUD, R restarts | P pauses |
| 106 | materials (metal, glass) | materials-1 spheres | three named spheres, key light drifts | keys 1/2/3 select and spin |
| 109 | product viewer | materials-2 car paint on a turntable | clearcoat state, 10-30 deg/s turntable, motion | 'Red' / 'Blue' / 'Black' paint |
| 110 | interior | animation-2 pendulum clock | pendulum moves | 'Lights off' / 'Lights on', pendulum angle |
| 111 | animated presentation | interactive-2 solar system | orbits, focus API, panel, follow cam, Escape, Pause/Play | 'Tour' innermost-out, 'Stop tour' |

Turn caps: 40 for the task, 15 for the follow-up (same conversation). `assetHeavy` (101, 109, 110) marks the
procedural-asset subset the bridge rule is also applied to.

## Arms and tools

All arms: `list_dir`, `read_file`, `write_file`, `edit_file`, `search`, `typecheck`, `finish`; no shell, no network.
`typecheck` runs the TypeScript API of the sandbox's own `typescript` in-process (`tsc.mjs`; same diagnostics as
`tsc --noEmit`), because this Mac's process governor throttles `tsc` subprocesses and would put its waits into tool time.

- `aura`: `@aura3d/engine`, `@aura3d/assets`, `@aura3d/cli` at the version under test; docs `llms.txt` (the cheat sheet
  in 5.5.0), `AGENTS.md`, `docs/agents/**`, `.agents/skills/**`; the `aura3d` tool (`cli-tools.mjs`): `info`, `examples`,
  `validate`, `render`. `render` returns the JSON report and the screenshot as an image block; only the newest
  screenshot stays in the conversation (`pruneOldImages`, Prism's Kiro route caps a request at 1.5 MB).
  `AGENT_EVAL_RENDER_IMAGE=0` drops the image if the route rejects images in tool results.
- `three`: three.js 0.185.1, no docs, no extra tools (as in 505).
- `bridge`: the `aura` packages, docs and `aura3d` tool, plus three.js for authoring, `BRIDGE.md` (`bridge.mjs`) and
  `import_three`: `aura3d import-three recipes/<name>.mjs [--name] [--seed] [--params] --json`. Recipes under
  `recipes/` are writable; the CLI writes the typed asset and `src/three-bridge/<name>.{bridge,scene}.ts`.

Aura3D sandboxes also get what `create-aura3d` ships in `public/` for looks (`public/hdri`, `public/aura-environments`,
from the installed `create-aura3d` of the same version): without them every `looks.preset` 404s its HDRI in a bare
scaffold, a page error the official scaffold never has. The scorer reports their size apart (`scaffoldKB`).

## One command per arm/task/replicate

```sh
export AGENT_EVAL_BASE_ROOT=/tmp/c1-551-base AGENT_EVAL_AURA_VERSION=5.5.0 AGENT_EVAL_WORK=/tmp/c1-551-work
node tools/agent-eval/c1/run-c1.mjs --arm aura --task 109 --idx 2 --batch c1-551 --docs-ref <5.5.0 commit> --score
```

That runs `c1-551-t109-aura-r2` (task, then follow-up), writes `evidence/agent-eval-c1/c1-551/runs/<runId>/`
(`run.json`, `transcript.json`, snapshots), then scores it: stock `vite build`, real-GPU headless Chrome (ANGLE Metal)
over a loopback CDP socket (no Playwright), load ms, fetched bytes, fps, p95 frame time, page errors, two frames 3 s
apart, functional probes, follow-up probe and regression probe (`c1-score.json`, `frames/`). Batch-level steps:
`judge.mjs <batch>` (blind pairs, needs every arm of a task/replicate; `--checklist` adds the checklist judge) and
`report.mjs <batch>` (`c1-metrics.json`, `REPORT.md`, bridge verdict on all tasks and on the asset subset).

## Dry run (2026-11-09, stub model, no Prism traffic, $0)

```sh
export AGENT_EVAL_BASE_ROOT=/tmp/c1-551-base AGENT_EVAL_AURA_VERSION=5.3.0 AGENT_EVAL_WORK=/tmp/c1-551-work
node tools/agent-eval/c1/run-c1.mjs --stub --arm all --task 109 --runs 1 --batch c1-dryrun-551 --concurrency 3 --score
node tools/agent-eval/c1/judge.mjs c1-dryrun-551 --stub
node tools/agent-eval/c1/report.mjs c1-dryrun-551
```

5.5.0 is not on npm yet; 5.3.0 is the newest published version that has both `import-three` and the N6 tools, so the
dry run installs it (docs from this branch). Task 109 ran on all three arms through the real loop, toolbox, `aura3d`
(info, validate, render with image), `import_three`, snapshots, scoring, stub judge and report: 126 s end to end. All
three finished both phases, built, rendered on the real GPU with no page errors and passed every check (main 4/4,
follow-up 5/5, no regression). The stub solutions are `stub/109/<arm>/`; their tokens and cost are synthetic.
Output: `evidence/agent-eval-c1/c1-dryrun-551/`. Found and fixed on the way: DOM buttons below the 640x360 canvas were
off-screen for CDP clicks (the driver now scrolls them into view), and the bare scaffold's missing HDRIs (above).

## Launching the paid run (phase 2, after 5.5.0 is on npm)

1. `AGENT_EVAL_AURA_VERSION=5.5.0`, `--docs-ref` = the 5.5.0 release commit. All Aura3D arms then install
   `@aura3d/{engine,assets,cli}@5.5.0`.
2. `node tools/agent-eval/c1/run-c1.mjs --estimate --runs 3` and record the plan.
3. Run, score, judge, report (Prism key from `PRISM_API_KEY` or the Kiro key file):

```sh
node tools/agent-eval/c1/run-c1.mjs --arm all --task all --runs 3 --batch c1-551 --concurrency 6 --docs-ref <sha>
node tools/agent-eval/c1/score.mjs c1-551
node tools/agent-eval/c1/judge.mjs c1-551 --checklist
node tools/agent-eval/c1/report.mjs c1-551
```

Re-run infra failures only with `--only <runId,...>`; never re-run a valid run because its result is bad. Each run
executes in its own worker thread so one run's tool calls do not inflate another's clock. The scorer recycles its
Chrome every 20 minutes (the machine reaper kills headless Chrome older than 30).

## Expected cost and time

72 agent runs, 216 visual judge calls (72 pairs x 3) and 72 checklist calls, all on `claude-sonnet-5.5` through Prism.
`--estimate` prices the 505 medians (aura cheat sheet 420K tokens per run, three 63K, bridge assumed equal to aura,
follow-up +35%) at the list prices in `cost.mjs`. 505's run records carry no cache fields from Prism (uncached input
equals total input), so the uncached column is the expected one:

| | cached profile | every input token uncached (expected) |
|---|---|---|
| aura arm (24 runs) | $14.35 | $33.70 |
| three arm (24 runs) | $3.69 | $5.90 |
| bridge arm (24 runs) | $14.35 | $33.70 |
| visual judge (216 calls) | $3.46 | $3.46 |
| checklist judge (72 calls, not in `--estimate`) | about $4 | about $4 |
| total | about $40 | about $81 |

High bound: if native authoring falls back to the 505 docs-only median (1.45M tokens per run), the aura and bridge
arms cost about 3.5x the table (total about $240). Render screenshots add about 1-2K input tokens per later turn while
they are the newest. Wall time at concurrency 6: about 1.5 h of agent sessions (about 25 s per turn, plus about 10-15 s
per `render`), about 1-1.5 h of serial real-GPU scoring (about 40 s per run in the dry run, longer for the solar and
stacker probes), about 45 min of judging: about 3.5-4 h in total.
