# Cold-start trial of Aura3D 5.0.2 against three.js (WP-D7), with the 4.1.2 trial as "before"

Run 2026-11-06 on branch `lane/503-trial`. Protocol: `docs/agents/trial-502-protocol.md`. Raw runs: `evidence/agent-eval/docs503/` (run.json, transcripts, snapshots, metrics.json, visual-judge.json). Per-task tables: [`tables.md`](tables.md). Frames: `frames/` (640x360 canvas crop, taken 4 s after load) and `montage-t*.png` (top row Aura3D r1 to r3, bottom row three.js r1 to r3).

## Read this first (what this does and does not show)

- One model (claude-sonnet-5.5 through Kiro Prism), 7 tasks x 2 arms x 3 runs = 42 runs, 40-turn budget, all 42 valid. Aura3D arm: published `@aura3d/engine` 5.0.2 plus the entry docs copied from the repo at `001455903` (`llms.txt`, `AGENTS.md`, `docs/agents/**`, skills; PNG frames, `recipes-src/.dist` and `docs/agents/samples` excluded), docs set sha256 `418133939a1eaf1782d194aecec359daa51fd6bf2f5b5b1ad18d1abe7f7da635` (4.1.2 trial: `d90cca03...`). The published package does not ship `llms.txt` or `docs/agents`, so the copied docs are the only docs the agent sees; this matches the 4.1.2 trial. three arm: `three@0.185.1`, unchanged.
- The "before" columns are `evidence/agent-eval/baseline1` (4.1.2, n=3, tasks 1 to 5). Tasks 8 and 9 are new and have no "before".
- Scoring differs from the 4.1.2 trial and numbers are NOT like-for-like on rendering: the build was a stock `vite build` run locally; frames came from REA `capture_browser_scenario` (Chrome 156, Apple M4 Max, ANGLE/Metal, real GPU, 960x540 viewport) and not from the ACR software-WebGL2 job. No ACR job was run (lane rule: parent only). Consequently: first-try build and first-try render were not measured separately (only final); the page probes that need page evaluation (instancing counters, clip switch, task 4 `__GAME__` state contract) were not measured, so "probe checks passed" is not reported; time to ready is not reported. Render non-black is judged from pixels (non-black fraction and frame difference) and from zero page errors (the only console error on every page is the missing `favicon.ico` 404).
- The 100-turn cap batch was not run: no Aura3D run came near the budget (max 28 turns, 0 of 21 at the cap), so a cap run would repeat the same runs.
- Visual judging: no agent-spawning tool was available to this lane, so the blind judge is one Prism call (same model) per task and run index. It sees the Aura3D and three.js frames of the pair as candidates A and B in seeded random order (`tools/agent-eval/judge-visual.mjs`, seed 20261106), two frames each, task text and rubric only (readability, lighting, materials, fidelity, polish, 1 to 5 each, total of 25), no library names or source. One judgement per pair, single judge, n=3 pairs per task: direction only, and the 4.1.2 trial had no visual judge so there is no "before" for visual quality. The model-judge checklist and silent no-op counts are estimates from source, as in the 4.1.2 report.
- Claims stay inside `docs/agents/claims-and-boundaries.md` (one model, n=3, small scenes, real GPU frames for this lane). No general "faster" or parity claim follows from this.

## Headline (before = 4.1.2 docs-only arm, after = 5.0.2 docs-only arm, same 40-turn budget)

| Task | Aura3D turns before | after | at turn cap before | after | final renders non-black before | after | three.js turns (this trial) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 PBR cube + orbit | 40 (37-40) | 5 (5-6) | 1/3 | 0/3 | 3/3 | 3/3 | 4 (4-4) |
| 2 forest, 10,000 instances | 40 (40-40) | 21 (8-26) | 3/3 | 0/3 | 0/3 | 3/3 | 4 (4-4) |
| 3 skinned character | 35 (34-40) | 9 (6-9) | 1/3 | 0/3 | 1/3 | 3/3 | 5 (4-5) |
| 4 game loop | 23 (20-36) | 10 (9-10) | 0/3 | 0/3 | 2/3 | 3/3 | 4 (4-5) |
| 5 shader water | 40 (38-40) | 17 (16-19) | 2/3 | 0/3 | 2/3 | 3/3 | 4 (4-5) |
| 8 low-poly island, water, day/night (new) | not run | 23 (22-28) | | 0/3 | | 3/3 | 5 (4-6) |
| 9 procedural robot, idle, dramatic light (new) | not run | 9 (8-10) | | 0/3 | | 3/3 | 5 (4-5) |

- Finish rate (not ended at the cap): Aura3D 21/21 after, against 8/15 (tasks 1 to 5, 4.1.2 arm; 7 of 15 hit the cap). three.js 21/21.
- First-try typecheck: Aura3D 21/21 after (4.1.2: 8/15 on tasks 1 to 5); three.js 19/21.
- Package/type files opened by the Aura3D arm (`node_modules/@aura3d/**`): median 0 after (9 of 21 runs opened any, max 10), against 19 to 21 on tasks 1, 2, 3, 5 before. Docs files opened: median 5 (3 to 8 across tasks), about the same as before. three.js arm opens none.
- Input tokens processed over all runs: Aura3D 9.24 M, three.js 0.62 M (the Aura3D arm re-sends the docs it reads, about 15 times the three.js total; 4.1.2 tasks 1 to 5 were 1.1 M to 3.4 M tokens per run, now 0.07 M to 1.0 M).
- Turns, tokens and wall time are still higher than three.js on every task (Aura3D 5 to 23 turns against 4 to 5); the docs release removed the 40-turn failures, it did not reach three.js parity. The three.js arm needs no docs at all.
- Judged checklist (source, model judge): Aura3D after 1.0 on tasks 1, 3, 4, 5, 8, 9 and 0.86 on task 2 (the shadow item: two runs set `shadow: true` on the sun with no receiver or frustum evidence); before: 0 on task 2 (nothing built).
- Silent no-ops (model judge, median per run): Aura3D after 0 to 1 per task (4.1.2: 0 to 2); a sky dome hiding `scene({ background })` and a normals array the custom shader never reads in task 5; `shadow: true` with no receiver in task 1.

## Blind visual judgement (new in this trial; same-index pairs, aura vs three, total of 25)

| Task | Aura3D | three.js | pairs won aura / three |
| --- | --- | --- | --- |
| 1 PBR cube | 16 (16-16) | 20 (18-20) | 0 / 3 |
| 2 forest | 13 (12-13) | 17 (16-18) | 0 / 3 |
| 3 skinned character | 17 (16-20) | 18 (17-18) | 1 / 2 |
| 4 game loop | 18 (17-19) | 13 (12-14) | 3 / 0 |
| 5 shader water | 22 (5-22) | 17 (8-20) | 2 / 1 |
| 8 island (new) | 16 (14-19) | 20 (16-21) | 1 / 2 |
| 9 robot (new) | 14 (13-15) | 19 (18-21) | 0 / 3 |

Over 21 pairs: Aura3D wins 7, three.js 14, no ties. What the frames show (montages): task 1 the Aura3D cube is small and reads as flat grey although the source sets `metallic: 0.9, roughness: 0.38` under `environments.neutral` (the three.js cubes are larger and warm-coloured); task 2 the Aura3D forest is a hazy, low-contrast disc under heavy fog while the three.js forests have stronger form; task 9 the Aura3D robot stands on a large flat pink and blue floor with a visible edge and a small dim figure, the three.js robots are larger with a lit pool of coloured rim light; task 5 one three.js run (r1) is nearly white (a three.js defect) while the Aura3D water frames read well; the pair (r3) where the judge gave Aura3D 5 of 25 looks like a readable water frame in the montage, so that score is judge noise and the 22 (5-22) spread should not be read as a defect; tasks 4 and 5 favour Aura3D.

## Before and after against the two decision-rule thresholds

- Task 1 about 40 turns toward single digits: yes, 5 turns (5 to 6), 3 of 3 finish, 3 of 3 first-try typecheck.
- Task 2 finishing at the 40-turn budget: yes, 3 of 3 finish (8, 21 and 26 turns) and render a non-black forest; before: 3 of 3 at the cap, 0 of 3 builds.
- Tasks 8 and 9: no failures. Both arms finish 3 of 3 in 22 to 28 turns (task 8) and 8 to 10 turns (task 9), all render non-black, Aura3D opens 4 to 6 type files on task 8 and 0 on task 9.
- Judged gap to three.js: not measurable against 4.1.2 (no visual judge then); in this trial three.js still wins 14 of 21 pairs, and Aura3D wins on tasks 4 and 5.

## Decision (WP-D8)

Turns and finish rate improved materially and agents no longer dig through `node_modules` types for most tasks (median 0 files), so the first branch of the rule holds: the 5.0.2 docs release did what it was built for (5.0.2 is already published). The judged gap to three.js did not close on four of seven tasks (1, 2, 8, 9), which is look quality of what the model builds from the documented recipes, not docs failures. Per the rule's second branch spirit, these go to a separate API-surface PRD and are not worked here: see the Findings in `docs/agents/trial-502-protocol.md` (defaults and recipes that give small, hazy or flat frames; the 6.4 MB JS bundle for a one-cube scene, up from 3.2 MB in 4.1.2 and 0.5 MB for three.js).

## Reproduce

```sh
export AGENT_EVAL_AURA_VERSION=5.0.2
node tools/agent-eval/run.mjs --arm both --task 1,2,3,4,5,8,9 --runs 3 --batch docs503 --concurrency 5
node tools/agent-eval/score-local.mjs build docs503     # stock vite build per sandbox
node tools/agent-eval/score-local.mjs serve docs503     # 127.0.0.1:47000+; frames through REA capture_browser_scenario (serialized with /tmp/a3d-rea.lock)
node tools/agent-eval/score-local-merge.mjs docs503 <framestats.json>
node tools/agent-eval/score.mjs docs503                 # model judge on source
node tools/agent-eval/judge-visual.mjs docs503 <framesDir>
node tools/agent-eval/report-503.mjs                    # tables.md
```

Cost: 42 agent runs plus 42 source judgements plus 21 visual judgements through Prism; no cloud resources were created, so there is nothing to tear down.
