# agent-eval: cold-start authoring trial

Controlled, repeatable replacement for the one-author authoring trial in `evidence/vs-threejs/RESULTS.md` section 13. Fresh model agents with no repo context and no web access build the same tasks in two arms:

- **aura**: published `@aura3d/engine` installed in `node_modules`, plus only the repo's agent entry docs (`llms.txt`, `AGENTS.md`, `docs/agents/**`, skills) copied into the sandbox.
- **three**: `three@0.185.1` and `@types/three`, nothing else.

Both arms get the same tools (list, read, search, write, edit, typecheck, finish; no shell, no network), the same task text with only the library name swapped, the same 40-turn budget and the same scaffold (`index.html`, `tsconfig.json`). `lib/sandbox.mjs` proves per run that no repo source reaches the sandbox (`findRepoSourceLeaks`, unit-tested).

## Run

```sh
node tools/agent-eval/run.mjs --arm aura|three|both --task N|1,2,3|all --runs K [--batch NAME] [--seed S] [--concurrency C] [--aura-tarballs DIR]
tools/agent-eval/score-remote.sh <batch> [shards]      # stock vite build + headless Chromium probes on serverless ACR (software WebGL2)
node tools/agent-eval/score.mjs <batch> [--no-judge]   # merge probes, run the model judge, write metrics.json
node tools/agent-eval/report.mjs <batch>...            # evidence/agent-eval/REPORT.md
```

The LLM loop and file operations run locally (they are network and light file I/O, and the Prism key must not travel to a build context). Builds and rendering run remotely only. Model sampling is not seedable through Prism: seeds fix plan order and run ids.

## Tasks (`tasks/`)

1 PBR cube + orbit; 2 forest of 10,000 instances; 3 skinned character + crossfade; 4 game loop; 5 shader water; 6 complete mobile arcade game; 7 prop on a pedestal (GLB provided to both arms; the Aura3D Meshy generation path needs a shell and is not exercised). `tasks/checklists.json` is what the model judge scores against; browser probes in `remote/score-all.mjs` are deterministic.

## Metrics

First-try typecheck, first-try build, first-try renders non-black (draft = state at the agent's first typecheck, or the final state if it never checked), final build and render, probe checks passed, edits to green, turns, wall time, input/output tokens, final source lines and tokens (o200k), docs and package files opened, bundle size, time to ready. Model-judge fields (checklist, silent no-ops, glue lines) are estimates and labelled as such in the report. See `caveats.json` for what the numbers do not mean.

## Relation to the T0.4 runner

`run.ts` and `agents.ts` in this directory are the earlier PRD-13 agent-output runner (a scaffolded project, a headless agent CLI, one arm). This harness is separate: two arms, restricted tools, remote scoring. The files do not share code.
