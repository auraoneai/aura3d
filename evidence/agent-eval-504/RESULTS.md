# Turn-gap experiment (exp/turn-gap-504): results

Question: what cuts the Aura3D arm's turns toward the three.js arm's 4 to 6 on tasks 2 (forest, 10,000 instances), 5 (shader water), 8 (low-poly island, water, day/night) and 9 (procedural robot) without lowering the judged checklist score.

Setup. Same harness, model (`claude-sonnet-5.5` through Prism), 40-turn cap, published `@aura3d/engine` 5.0.2 and seed as the docs503 trial (branch `origin/lane/503-trial`). Aura arm only, n=3 per task per condition. Conditions (implemented in `tools/agent-eval`, flag `--condition`):

- baseline: docs503 aura runs, plus a rerun (`b504-base`) on tasks 2 and 8 to measure noise.
- A: first-screen cheat sheet. `llms.txt` in the sandbox is replaced by `docs/agents/first-screen-cheatsheet.md` (one skeleton plus copy blocks: instancing, custom-shader water, sky and day/night, flat-shaded terrain, procedural robot, skinned GLB), `AGENTS.md` becomes a 4-line pointer. Every block typechecks against the installed engine (`node tools/agent-eval/check-cheatsheet.mjs`).
- B: `aura_lookup(query)` tool (BM25 over the docs, recipe sources, api-signatures and the engine `.d.ts` files, no LLM; `tools/agent-eval/lib/lookup.mjs`). One result carries recipe source, exact signatures and gotchas. Docs otherwise unchanged.
- C: A and B together.
- D: baseline docs plus a sentence telling the agent to batch independent reads and searches into one turn and to write the full solution first.
- Holdout: A on tasks 1, 3, 4 (not in the sheet) against docs503 baseline.

Metrics are computed from `run.json` per run (`tools/agent-eval/report-504.mjs`). Estimated cached cost = new tokens at 1.0 plus the previous turn's whole prompt at 0.1 (docs503 rows marked `*` assume linear prompt growth because only totals were stored). The judged checklist is the trial's model judge (`score.mjs`) on source plus frame statistics; the checklist for B, D and the baseline rerun was judged without frame probes, A and C with probes only for A.

## Result in one paragraph

Condition A (cheat sheet) took the Aura arm from a median 18 to 4 turns on tasks 2, 5, 8 and 9 (three.js: 4 to 5), with first-try typecheck 12/12, finish 12/12 and the same judged checklist score. Median input tokens fell from 544K to 42K (three.js 29K, so 1.4x instead of 15x); estimated cached cost fell 106K to 17K (three.js 13K, 1.3x). The lookup tool alone (B) helps less (median 12 turns) and adds turns when stacked on A (C: 9). The batching hint alone (D) gives 8 turns. On visual quality A is not better than the baseline and both stay below three.js in a single-judge comparison.

## Bug found by the visual probe (not by the checklist judge)

The first version of the cheat sheet said the custom-shader prelude `uTime` advances by itself. It does not in 5.0.2 (`uTime` is only an alias for `u_time` and the frames were identical): all three task-5 runs of the first A batch scored checklist 1.0, 0.86, 1.0 while frame difference between two captures 3 s apart was 0.0 (baseline: about 24). The sheet was fixed (own uniform plus `setUniform`, as in recipe 5) and A and C were rerun in full. The superseded batches are kept as `b504-A-v1` and `b504-C-v1` (A v1 also holds the 9 holdout runs); the frames showing the frozen water are in `frames-A-v1/`. Product follow-up (not done here, out of scope): `uTime` in `material.custom` documentation/prelude should either advance or be removed from the prelude list.

## Tables

| task | condition | n | turns median (range) | finished | first-try tsc | doc reads | node_modules reads | search+list | lookups | input tokens (median) | est. cached-cost tokens | checklist median (runs) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | baseline (docs503) | 3 | 5 (5-6) | 3/3 | 3/3 | 3 (3-4) | 0 (0-0) | 2 (2-2) | 0 (0-0) | 75K | 30K* | 1 (1/1/1) |
| 1 | holdout A v1/v2 sheet (tasks 1,3,4) | 3 | 5 (5-5) | 3/3 | 3/3 | 3 (3-3) | 0 (0-0) | 1 (1-2) | 0 (0-0) | 65K | 23K | 1 (1/1/1) |
| 2 | baseline (docs503) | 3 | 21 (8-26) | 3/3 | 3/3 | 5 (3-7) | 7 (2-11) | 17 (5-23) | 0 (0-0) | 735K | 134K* | 0.86 (1/0.86/0.86) |
| 2 | baseline rerun | 3 | 18 (16-23) | 3/3 | 3/3 | 6 (5-7) | 6 (5-8) | 12 (11-21) | 0 (0-0) | 660K | 111K | 0.86 (0.86/0.86/0.86) |
| 2 | three.js (docs503) | 3 | 4 (4-4) | 3/3 | 3/3 | 0 (0-0) | 0 (0-0) | 3 (2-3) | 0 (0-0) | 22K | 10K* | 1 (1/1/1) |
| 2 | A v1 (uTime bug, superseded) | 3 | 3 (3-3) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 0 (0-0) | 0 (0-0) | 29K | 15K | 0.86 (0.86/0.86/0.86) |
| 2 | C v1 (uTime bug, superseded) | 3 | 7 (6-9) | 3/3 | 3/3 | 1 (0-1) | 1 (0-1) | 3 (2-3) | 3 (1-3) | 73K | 25K | 1 (0.86/1/1) |
| 2 | A cheat sheet | 3 | 4 (3-4) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 1 (0-2) | 0 (0-0) | 41K | 16K | 0.86 (0.86/0.86/0.86) |
| 2 | B aura_lookup | 3 | 10 (9-12) | 3/3 | 3/3 | 1 (0-1) | 2 (2-2) | 4 (2-6) | 3 (3-4) | 213K | 48K | 0.86 (1/0.86/0.86) |
| 2 | C A+B | 3 | 8 (5-13) | 3/3 | 3/3 | 0 (0-0) | 1 (0-4) | 4 (2-4) | 2 (2-3) | 99K | 26K | 1 (1/0.86/1) |
| 2 | D batching hint | 3 | 8 (6-9) | 3/3 | 3/3 | 4 (4-5) | 2 (1-2) | 6 (5-7) | 0 (0-0) | 211K | 54K | 0.86 (0.86/0.86/0.86) |
| 3 | baseline (docs503) | 3 | 9 (6-9) | 3/3 | 3/3 | 5 (4-5) | 0 (0-0) | 8 (5-9) | 0 (0-0) | 164K | 46K* | 1 (1/1/1) |
| 3 | holdout A v1/v2 sheet (tasks 1,3,4) | 3 | 5 (5-5) | 3/3 | 3/3 | 3 (3-4) | 0 (0-0) | 2 (2-3) | 0 (0-0) | 62K | 21K | 1 (1/1/1) |
| 4 | baseline (docs503) | 3 | 10 (9-10) | 3/3 | 3/3 | 8 (7-8) | 0 (0-0) | 4 (4-6) | 0 (0-0) | 314K | 88K* | 1 (1/1/1) |
| 4 | holdout A v1/v2 sheet (tasks 1,3,4) | 3 | 5 (4-5) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 1 (1-3) | 0 (0-0) | 59K | 21K | 1 (1/1/1) |
| 5 | baseline (docs503) | 3 | 17 (16-19) | 3/3 | 3/3 | 7 (6-8) | 4 (3-5) | 15 (14-16) | 0 (0-0) | 478K | 96K* | 1 (1/1/1) |
| 5 | three.js (docs503) | 3 | 4 (4-5) | 3/3 | 3/3 | 0 (0-0) | 0 (0-0) | 2 (2-2) | 0 (0-0) | 31K | 13K* | 1 (1/1/1) |
| 5 | A v1 (uTime bug, superseded) | 3 | 7 (6-8) | 3/3 | 3/3 | 2 (2-2) | 0 (0-1) | 3 (1-5) | 0 (0-0) | 97K | 26K | 1 (1/0.86/1) |
| 5 | C v1 (uTime bug, superseded) | 3 | 11 (8-13) | 3/3 | 3/3 | 2 (2-2) | 1 (1-2) | 5 (2-6) | 4 (3-4) | 215K | 52K | 1 (0.86/1/1) |
| 5 | A cheat sheet | 3 | 4 (3-5) | 3/3 | 3/3 | 2 (2-3) | 0 (0-0) | 1 (0-2) | 0 (0-0) | 46K | 19K | 1 (1/1/1) |
| 5 | B aura_lookup | 3 | 13 (12-16) | 3/3 | 3/3 | 2 (2-3) | 3 (2-5) | 6 (4-8) | 3 (2-4) | 300K | 66K | 1 (0.86/1/1) |
| 5 | C A+B | 3 | 9 (9-10) | 3/3 | 2/3 | 2 (2-2) | 1 (1-2) | 3 (3-5) | 3 (3-3) | 173K | 50K | 1 (1/1/1) |
| 5 | D batching hint | 3 | 16 (15-17) | 3/3 | 3/3 | 5 (4-7) | 2 (2-3) | 17 (14-18) | 0 (0-0) | 368K | 72K | 1 (1/1/1) |
| 8 | baseline (docs503) | 3 | 23 (22-28) | 3/3 | 3/3 | 8 (7-8) | 8 (8-10) | 18 (16-20) | 0 (0-0) | 1035K | 184K* | 1 (1/1/1) |
| 8 | baseline rerun | 3 | 24 (20-27) | 3/3 | 3/3 | 8 (8-8) | 10 (5-11) | 20 (17-23) | 0 (0-0) | 1080K | 175K | 1 (1/1/1) |
| 8 | three.js (docs503) | 3 | 5 (4-6) | 3/3 | 2/3 | 0 (0-0) | 0 (0-0) | 2 (2-2) | 0 (0-0) | 62K | 25K* | 1 (1/1/1) |
| 8 | A v1 (uTime bug, superseded) | 3 | 5 (4-5) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 2 (2-2) | 0 (0-0) | 65K | 24K | 1 (1/1/1) |
| 8 | C v1 (uTime bug, superseded) | 3 | 11 (8-12) | 3/3 | 3/3 | 2 (2-3) | 1 (1-1) | 4 (2-6) | 1 (1-4) | 241K | 56K | 1 (1/1/1) |
| 8 | A cheat sheet | 3 | 5 (3-5) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 2 (0-2) | 0 (0-0) | 76K | 30K | 1 (1/1/1) |
| 8 | B aura_lookup | 3 | 21 (14-23) | 3/3 | 3/3 | 2 (2-3) | 4 (2-4) | 14 (10-17) | 5 (5-5) | 644K | 108K | 1 (1/1/1) |
| 8 | C A+B | 3 | 14 (10-14) | 3/3 | 2/3 | 2 (2-4) | 1 (0-1) | 7 (5-9) | 4 (4-5) | 358K | 75K | 1 (1/1/1) |
| 8 | D batching hint | 3 | 8 (6-18) | 3/3 | 3/3 | 6 (6-6) | 2 (0-7) | 8 (7-15) | 0 (0-0) | 200K | 57K | 1 (1/1/1) |
| 9 | baseline (docs503) | 3 | 9 (8-10) | 3/3 | 3/3 | 5 (5-7) | 0 (0-0) | 7 (6-8) | 0 (0-0) | 215K | 60K* | 1 (1/1/1) |
| 9 | three.js (docs503) | 3 | 5 (4-5) | 3/3 | 2/3 | 0 (0-0) | 0 (0-0) | 2 (2-2) | 0 (0-0) | 38K | 15K* | 1 (1/1/1) |
| 9 | A v1 (uTime bug, superseded) | 3 | 3 (3-3) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 0 (0-0) | 0 (0-0) | 31K | 16K | 1 (1/1/1) |
| 9 | C v1 (uTime bug, superseded) | 3 | 7 (6-7) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 1 (1-2) | 1 (1-2) | 72K | 21K | 1 (1/1/1) |
| 9 | A cheat sheet | 3 | 3 (3-4) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 0 (0-1) | 0 (0-0) | 32K | 16K | 1 (1/1/1) |
| 9 | B aura_lookup | 3 | 7 (6-7) | 3/3 | 3/3 | 2 (2-2) | 0 (0-0) | 0 (0-3) | 2 (1-2) | 102K | 30K | 1 (1/1/1) |
| 9 | C A+B | 3 | 6 (6-6) | 3/3 | 3/3 | 2 (1-2) | 0 (0-0) | 1 (0-1) | 2 (1-2) | 73K | 25K | 1 (1/1/1) |
| 9 | D batching hint | 3 | 6 (6-6) | 3/3 | 3/3 | 5 (5-6) | 0 (0-0) | 5 (5-5) | 0 (0-0) | 136K | 45K | 1 (1/1/1) |

All tasks pooled (per condition):

| condition | n | turns median (range) | finished | first-try tsc | doc reads | search+list | input (median) | est. cached | checklist |
|---|---|---|---|---|---|---|---|---|---|
| baseline (docs503) | 21 | 10 (5-28) | 21/21 | 21/21 | 6 (3-8) | 8 (2-23) | 313K | 83K* | 1 (1/1/1/1/0.86/0.86/1/1/1/1/1/1/1/1/1/1/1/1/1/1/1) |
| baseline rerun | 6 | 22 (16-27) | 6/6 | 6/6 | 8 (5-8) | 19 (11-23) | 877K | 150K | 0.93 (0.86/0.86/0.86/1/1/1) |
| three.js (docs503) | 12 | 4 (4-6) | 12/12 | 10/12 | 0 (0-0) | 2 (2-3) | 29K | 13K* | 1 (1/1/1/1/1/1/1/1/1/1/1/1) |
| A v1 (uTime bug, superseded) | 12 | 4 (3-8) | 12/12 | 12/12 | 2 (2-2) | 1 (0-5) | 43K | 19K | 1 (0.86/0.86/0.86/1/0.86/1/1/1/1/1/1/1) |
| C v1 (uTime bug, superseded) | 12 | 8 (6-13) | 12/12 | 12/12 | 2 (0-3) | 3 (1-6) | 149K | 38K | 1 (0.86/1/1/0.86/1/1/1/1/1/1/1/1) |
| A cheat sheet | 12 | 4 (3-5) | 12/12 | 12/12 | 2 (2-3) | 1 (0-2) | 42K | 17K | 1 (0.86/0.86/0.86/1/1/1/1/1/1/1/1/1) |
| B aura_lookup | 12 | 12 (6-23) | 12/12 | 12/12 | 2 (0-3) | 5 (0-17) | 292K | 64K | 1 (1/0.86/0.86/0.86/1/1/1/1/1/1/1/1) |
| C A+B | 12 | 9 (5-14) | 12/12 | 10/12 | 2 (0-4) | 4 (0-9) | 172K | 44K | 1 (1/0.86/1/1/1/1/1/1/1/1/1/1) |
| holdout A v1/v2 sheet (tasks 1,3,4) | 9 | 5 (4-5) | 9/9 | 9/9 | 3 (2-4) | 2 (1-3) | 62K | 21K | 1 (1/1/1/1/1/1/1/1/1) |
| D batching hint | 12 | 8 (6-18) | 12/12 | 12/12 | 5 (4-7) | 7 (5-18) | 205K | 56K | 1 (0.86/0.86/0.86/1/1/1/1/1/1/1/1/1) |

`*` cached-cost for docs503 rows assumes linear prompt growth (only totals were recorded); rows from this experiment use the exact per-turn prompt sizes. Cached cost = new tokens at 1.0 + previous turn's prompt at 0.1.

## Visual quality (frames from REA capture_browser_scenario, Chrome with real GPU, serialised with the /tmp/a3d-rea.lock)

Frames: `frames-A/` (A, rerun with the fixed sheet, two frames 3 s apart per run) and `frames-A-v1/`. Frame statistics: `frames-A/framestats.json` (water animates in all three task-5 runs, diff 16 to 24; the three task-2 runs are pixel-identical in statistics, mean 169.2 std 22.1, because every agent copied the same forest block). Blind pairwise judge (`judge-visual.mjs`, one Prism judge call per task and run index, seeded A/B order, one frame (the later one) per candidate, three.js frames from docs503), 5 criteria each 1 to 5, max 25:

| comparison | pairs | aura mean | three.js mean | aura wins | three.js wins |
|---|---|---|---|---|---|
| baseline aura (docs503) vs three.js | 12 | 16.8 | 17.7 | 3 | 9 |
| A (cheat sheet) vs three.js | 12 | 16.2 | 18.1 | 1 | 11 |

Raw: `vis-A/visual-judge.json`, `vis-base/visual-judge.json`. The A versus baseline difference (16.2 against 16.8) is inside the judge noise; the cheat sheet neither helped nor clearly hurt looks. The visual gap to three.js is unchanged and not a turns problem.

## What is unproven

- n=3 per cell, one model (Sonnet 5.5 through Prism), one judge for checklist and visuals, one three.js reference run set (docs503, not rerun). Differences of 1 turn are noise; the baseline rerun on tasks 2 and 8 shows medians within 3 turns of docs503.
- The cheat sheet blocks are near-solutions for tasks 2, 5, 8 and 9, which is the point of the intervention but also contamination: it measures "what happens when the doc contains your task", not general discovery. The holdout (tasks 1, 3, 4, not in the sheet) went from 5, 9, 10 to 5, 5, 5 turns with the same checklist, which says replacing the entry docs does not hurt other tasks and may help; it does not prove a sheet can cover arbitrary tasks. The holdout used the sheet before and after the water fix (docs hash is recorded per run).
- Sheet size: about 3.6K tokens by chars/3.6, 4.0K by chars/3.3, but 7.2K measured on the trial model's own tokenizer through Prism (`count-tokens.mjs`, net of the 1.9K fixed overhead). It replaces `llms.txt` (5.7K measured) and `AGENTS.md` (4.3K measured), so first-screen load fell, but the 4,000-token budget is met only under a conventional token count.
- Frame probes: the checklist judge works from source plus probes; it did not catch the frozen water. Page probes that need page evaluation (instance counter, draw calls) and real task-4 behaviour were not measured; builds were stock `vite build` locally.
- Task 2 checklist stays 0.86 in every condition including baseline: the judge flags that `castShadow` / `receiveShadow` flags are not set on instances. Not changed by any intervention.
- Not run: ACR remote scoring, three.js arm under any condition, MCP packaging of `aura_lookup` (a harness-tool prototype only), prompt caching in the harness (cached cost is computed, not measured).
