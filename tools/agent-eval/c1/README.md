# C1 fixed comparison harness

Plan item C1 in `docs/project/future-engine-work.md` section 4: 8 tasks chosen before results, 3 runs each, arms native
Aura3D (latest guidance), three.js, and three.js + bridge (B1), with every authoring, export and repair step counted.
This directory extends `tools/agent-eval` (same sandbox, tools, Prism client and leak checks).

## Task choice (frozen 2026-11-08, before any C1 result)

One task per benchmark-505 category, chosen so the set covers every engine cause that benchmark attributed losses to,
plus two controls where Aura3D was already competitive, and so every task has requested behaviour a script can check.
Task text is copied verbatim from the 505 lane branches (`origin/bench/505-<category>`); ids 101-108 avoid the lanes'
clashing numbers. The manifest is `tasks.json`; checklists are `tasks/checklists.json`.

| id | 505 task | category | why it is in the set | requested behaviour probed | follow-up edit (one per task) |
|---|---|---|---|---|---|
| 101 | animation-1 walking spider | animation | cause A look, E framing, C shadows (animation lost every pair) | continuous motion without input | Space toggles walking/paused; `walking` in state |
| 102 | effects-2 portal | effects | control: Aura3D competitive in 505 | `portalActive`, live particles, time advances, motion | 'Close portal' / 'Open portal' button |
| 103 | environments-1 canyon | environments | cause H missing helper (strata), B materials, D fog | camera flythrough moves | 'Pause flythrough' button; camera position in state |
| 104 | games-2 stacker | games | cause J (hsl() colours rendered near-black) | drops stack, game ends, HUD score, R restarts | P pauses (drops ignored, slab frozen, HUD 'Paused') |
| 105 | interactive-1 garden | interactive | cause A look, C shadows | click plants on the ground, `__plantAt` exact, growth, sky click ignored, overlay count, Clear | 'Undo' button removes the newest plant |
| 106 | materials-1 glass/metal/fabric | materials | cause B (glass and steel invisible on a uniform environment) | three named spheres, key light drifts | keys 1/2/3 select and spin a sphere |
| 107 | models-1 lighthouse | models | cause H (no beam helper); procedural asset, the bridge's best case | `partCount` >= 12, `bandCount` >= 3, orbit motion | lamp blinks 1 s on / 1 s off; `lampOn` in state |
| 108 | physics-3 plinko | physics | control (Aura3D won 2 of 3 judged pairs) and K physics peer | Drop 20 spawns, all 20 land, bins sum, Reset clears | 'Drop 1 Ball' button |

Turn caps: 40 for the task, 15 for the follow-up (same conversation, appended to the last tool results).

## What one run records

`run.json` (schema `aura3d.agent-eval.c1-run/1`) per run, plus `transcript.json` and source snapshots after each phase:

- wall time (agent session minus harness work between phases), tool time (inside tool calls: typecheck, bridge export,
  file I/O), model time, turns, per phase and in total;
- tokens from provider usage fields: total input, uncached input, cache read, cache write, output; `kiro_credits` or a
  provider USD cost when Prism returns them;
- billed cost (`cost.mjs`): provider USD > provider credits x `AGENT_EVAL_USD_PER_CREDIT` > list price on the token split
  (Sonnet 5.5: $2 in, $0.20 cache read, $2.50 cache write, $10 out per MTok); the source is stored with every number;
- end reason of the task and of the follow-up (finished, max_turns, stopped_without_finish, max_output_tokens, infra_error),
  typecheck after each phase, bridge exports (count, failures, ms).

`score.mjs` adds, per phase: stock `vite build` (ok, ms), dist size (total, JS, JS gzip, assets), real-GPU headless Chrome
(ANGLE Metal, loopback CDP): load ms to the ready flag, runtime fps and p95 frame time over 3 s, page errors, two frames
3 s apart, and the functional probes (`probes.mjs`, scripted key presses, canvas clicks, button clicks, state reads).
The follow-up build runs the follow-up probe and the main probe again (regression check). `judge.mjs` runs blind
pairwise visual judging (aura vs three, bridge vs three, bridge vs aura; 3 calls per pair, majority) and optionally the
checklist judge. `report.mjs` writes `c1-metrics.json` and `REPORT.md`, including the bridge decision rule with
thresholds fixed in code before results (comparable quality = blind win rate 40-60%, clearly better >= 65%, comparable
correctness = full functional pass rate within 10 points, "about 25%" = >= 25% lower median wall time or billed cost).

## The bridge arm

The agent gets the Aura3D docs, `@aura3d/engine`, three.js 0.185.1, `BRIDGE.md` (`bridge.mjs`) and a `bridge_export`
tool. The tool runs the B1 command on a factory under `src/bridge/`; the command is a template
(`AGENT_EVAL_BRIDGE_CMD` or `--bridge-cmd`, placeholders `{factory} {out} {name} {seed}`, no shell), default
`node_modules/.bin/aura3d bridge three {factory} --out {out} --name {name} --seed {seed} --json`. When B1 lands, point the
template at its command, install it in the bridge base (`AGENT_EVAL_EXTRA_BRIDGE_DEPS=@aura3d/cli@<ver>` or a CLI tarball
in `--aura-tarballs`) and update `BRIDGE_GUIDE` if B1's factory contract or output paths differ. Until then
`stub/mock-bridge.mjs` implements the contract at minimum fidelity (runs the factory with a fixed seed, bakes meshes into
a GLB, writes the report and `src/bridge/assets.ts`).

## Dry run (done, stub model, no Prism traffic)

```sh
export AGENT_EVAL_BASE_ROOT=/tmp/c1-bench-base AGENT_EVAL_AURA_VERSION=5.2.0 AGENT_EVAL_WORK=/tmp/c1-work
export AGENT_EVAL_BRIDGE_CMD="node $PWD/tools/agent-eval/c1/stub/mock-bridge.mjs three {factory} --out {out} --name {name} --seed {seed} --json"
node tools/agent-eval/c1/run-c1.mjs --stub --arm all --task 105,107 --runs 1 --batch c1-dryrun \
  --only c1-dryrun-t107-aura-r1,c1-dryrun-t107-three-r1,c1-dryrun-t107-bridge-r1,c1-dryrun-t105-three-r1
node tools/agent-eval/c1/score.mjs c1-dryrun          # ports 10681 (CDP) and 10682 (HTTP) by default
node tools/agent-eval/c1/judge.mjs c1-dryrun --stub
node tools/agent-eval/c1/report.mjs c1-dryrun
```

Output: `evidence/agent-eval-c1/c1-dryrun/` (`REPORT.md`, `c1-metrics.json`, `c1-score.json`, `c1-judge.json`, frames,
run records). Task 107 ran on all three arms (one per arm); 105 ran on three.js to exercise the click, button and
`__plantAt` probes. The stub solutions are in `stub/<task>/<arm>/`; tokens and cost there are synthetic.

## Launching the real run

1. Freeze the engine under test: pack the release candidate (`--aura-tarballs DIR` with the engine, assets and, for the
   bridge arm, CLI tarballs) and pin the docs to the same commit (`--docs-ref <sha>`). All arms use the same Aura3D version.
2. Install B1's command in the bridge base and set `AGENT_EVAL_BRIDGE_CMD` (see above). Set
   `AGENT_EVAL_EXTRA_AURA_DEPS=@dimforge/rapier3d-compat@0.20.0` if the release still needs the physics peer, so 108 is
   not lost to the sandbox (505 cause K was partly a harness artifact).
3. Check the plan and spend: `node tools/agent-eval/c1/run-c1.mjs --estimate --runs 3`.
4. Run (Prism key from `PRISM_API_KEY` or the Kiro key file):

```sh
export AGENT_EVAL_BASE_ROOT=/tmp/c1-base AGENT_EVAL_WORK=/tmp/c1-work AGENT_EVAL_BRIDGE_CMD="..."
node tools/agent-eval/c1/run-c1.mjs --arm all --task all --runs 3 --batch c1-<date> --concurrency 6 \
  --aura-tarballs /path/to/tarballs --docs-ref <sha>
node tools/agent-eval/c1/score.mjs c1-<date>
node tools/agent-eval/c1/judge.mjs c1-<date> --checklist
node tools/agent-eval/c1/report.mjs c1-<date>
```

Re-run infra failures only with `--only <runId,...>` (writes `plan-rerun-*.json`); never re-run a valid run because its
result is bad.

## Expected cost and time

72 agent runs (8 tasks x 3 arms x 3 runs) plus 216 visual judge calls (72 pairs x 3) and 72 checklist calls.
`--estimate` with the 505 medians (aura-sheet 420K tokens per run, three 63K, bridge assumed equal to aura, follow-up +35%):

| | cached profile | every input token uncached (Prism omits cache fields) |
|---|---|---|
| aura arm (24 runs) | $14.35 | $33.70 |
| three arm (24 runs) | $3.69 | $5.90 |
| bridge arm (24 runs) | $14.35 | $33.70 |
| visual judge (216 calls) | $3.46 | $3.46 |
| checklist judge (72 calls, about 20K in / 2K out each, not in `--estimate`) | about $4 | about $4 |
| total | about $40 | about $81 |

High bound: if native authoring regresses to the 505 docs-only median (1.45M tokens per run) the aura and bridge arms
cost about 3.5x the table. The run is above the $10 per-task line, so the owner launches it. Wall time at concurrency 6:
about 1.5 h of agent sessions (505 medians, about 25 s per turn), about 2 h of serial real-GPU scoring (two builds and
two page sessions per run, plinko probes up to 35 s), about 20 min of judging.
