# Trial protocol for the 5.0.2 docs release (WP-D7 and WP-D8)

Status: run 2026-11-06 (see "Result of the run" at the end). Original note: WP-D7 needs one shared capture and one paid job, so it is launched once by the coordinator (parent) only, never by a lane. Do not run it from a lane or in parallel.

## Question

Did the 5.0.2 docs (three.js to Aura3D table, recipes 8 to 15, pitfalls in `llms.txt`, generated signatures, procedural starter) cut the turns and failures of a docs-only agent, and did the judged quality gap to three.js narrow? Baseline: `evidence/agent-eval/REPORT.md` (4.1.2, claude-sonnet-5.5 through Kiro Prism, n=3 per cell).

## Fixed inputs (do not change between arms)

- Harness: `tools/agent-eval` (`run.mjs`, `score-remote.sh`, `score.mjs`, `report.mjs`). Same model, same tool set, same task text with only the library name swapped, same scaffold, blind judging.
- Library under test: published `@aura3d/engine` 5.0.2 (or the release candidate tarballs through `--aura-tarballs DIR`); three arm unchanged (`three@0.185.1`).
- Aura arm docs: the entry docs the harness copies (`llms.txt`, `AGENTS.md`, `docs/agents/**`, skills). Exclude from the copy: `docs/agents/recipes-src/**/*.png`, `docs/agents/recipes-src/.dist`, `docs/agents/samples`, so the sandbox carries text only. Record the docs set sha256 as the baseline does.
- Turn budgets: 40 (primary) and 100 (cap run), as in the baseline.
- Tasks 1 to 5 as in `tools/agent-eval/tasks/` (PBR cube, 10,000-instance forest, skinned character, game loop, shader water) plus two new procedural, no-admitted-model tasks added as `tasks/8-*.md` and `tasks/9-*.md` for both arms:
  - Task 8: "a stylized low-poly island with water and a day/night sky" (probe: non-black, a land mass and a water surface visible, sky changes with time).
  - Task 9: "a procedural robot character with idle animation under dramatic lighting" (probe: non-black, a figure of at least five joints, frames differ over time, key and rim light visible).
  Task 7 (GLB provided) is skipped: it measures asset admission, not this docs work.

## Runs

```sh
node tools/agent-eval/run.mjs --arm both --task 1,2,3,4,5,8,9 --runs 3 --batch docs502 --concurrency 3
node tools/agent-eval/run.mjs --arm aura --task 1,2,3,4,5,8,9 --runs 3 --batch docs502-cap100   # 100-turn budget
tools/agent-eval/score-remote.sh docs502        # ONE serverless ACR job, software WebGL2, parent only
node tools/agent-eval/score.mjs docs502
node tools/agent-eval/report.mjs docs502 docs502-cap100   # writes evidence/agent-eval/docs502/REPORT.md
```

Cost: one scoring job, expected about 3 to 5 USD gross; stop and report if the cost-guard preflight says more than 5 USD. Tear down every ephemeral resource afterwards and verify zero remnants. Launch the recipes' captures in the same job window if they must be repeated on software GL (the 2026-11-06 recipe frames were taken on a real GPU through REA, see `recipes-src/*/frame.png`).

## Metrics to record (same definitions as the baseline report)

Turns, finish rate (not ended at the cap), first-try typecheck, first-try build, first-try renders non-black, final render, probe checks passed, judge checklist fraction, silent no-ops, docs files opened, package/type files opened, wall time, tokens, bundle KB. Add for tasks 8 and 9 the blind visual judgment from the existing judge.

## Table to publish

One table per task with the 4.1.2 numbers as the "before" column, the 5.0.2 numbers as "after", the three.js arm unchanged, and the delta. Claims stay inside `docs/agents/claims-and-boundaries.md`: software WebGL2, one model, n=3, small scenes; no general "faster" or parity claim.

## WP-D8 decision rule

- Turns and finish rate improve materially (for example task 1 from about 40 turns toward single digits, task 2 finishing at the 40-turn budget) and the judged gap narrows: publish the 5.0.2 docs release (standard release steps: deprecate prior versions, deploy the site) and stop.
- Agents still open many `node_modules` type files or fail tasks 8 and 9: open API-surface work from the findings (missing helpers, confusing options, defaults that give dark or flat frames) as a separate PRD, not as part of this work stream.

## Known defects found while writing the recipes (inputs for a decision, not fixed here)

- `material.custom` docs named a prelude uniform `eyePos` that does not exist; the real prelude is `cameraPosition`, `uTime`, `modelMatrix`, `modelViewProjectionMatrix`, `position`, `normal`, `uv` (fixed in `recipes.md`).
- On headless Chrome 156 (Apple M4 Max, ANGLE/Metal) a scene with `effects.bloom` plus the `character.primitiveHumanoid` prefab drew only the background (4 KB PNG), while the same scene without bloom drew. Bloom with other content (recipe 15) is fine. Cause not isolated.

## Result of the run (WP-D7, 2026-11-06, branch `lane/503-trial`) and WP-D8 decision

Status change: the run happened. Full tables, caveats and frames: `evidence/agent-eval-503/RESULTS.md` (raw runs in `evidence/agent-eval/docs503/`). Deviations from the protocol above, all forced by the lane rules: scoring ran locally (stock `vite build`, REA `capture_browser_scenario` on Chrome 156 with a real GPU) instead of the ACR software-WebGL2 job; first-try build/render, page probes that need page evaluation and time to ready were not measured; no 100-turn cap batch (no run exceeded 28 turns); visual judging is one Prism judge call per task and run index with seeded A/B order (no agent-spawning tool), single judge, n=3 pairs per task.

Aura3D 5.0.2 docs-only arm against the 4.1.2 arm, 40-turn budget, n=3 per cell, claude-sonnet-5.5:

- Turns (median): task 1 40 to 5, task 2 40 to 21, task 3 35 to 9, task 4 23 to 10, task 5 40 to 17; new task 8 23, task 9 9; three.js 4 to 5.
- Ended at the cap: 7 of 15 before, 0 of 21 after. Final renders non-black: 8 of 15 before, 21 of 21 after. First-try typecheck: 8 of 15 before, 21 of 21 after.
- Package/type files opened: median 0 after (9 of 21 runs opened any, max 10), against 19 to 21 on tasks 1, 2, 3, 5 before.
- Blind visual judgement: three.js won 14 of 21 pairs, Aura3D 7 (tasks 4 and 5 favour Aura3D; tasks 1, 2, 8, 9 favour three.js). No "before" exists for this metric.

Decision: first branch of the WP-D8 rule holds (turns and finish rate improved materially; task 1 reached single digits; task 2 finishes inside the budget; tasks 8 and 9 do not fail and agents do not dig through `node_modules` types). The 5.0.2 docs release is already published, so there is nothing further to publish from this. Do not make claims from this trial outside `docs/agents/claims-and-boundaries.md`.

Findings for a separate API-surface PRD (not worked here):

- Look defaults and recipe values give weak frames: a `material.pbr({ metallic: 0.9, roughness: 0.38 })` cube under `environments.neutral` reads as flat grey and small (task 1, 3 of 3 runs); the forest is hazy and low contrast under the fog the agents chose (task 2); the procedural robot sits on a very large flat floor with a visible edge and a small figure (task 9).
- Bundle size: a one-cube scene builds to about 6.5 MB of JS with a stock Vite build (4.1.2: 3.2 MB, three.js: 0.5 MB). Not caused by agents (same imports in all runs); not isolated here.
- Aura3D arm still reads about 15 times the input tokens of the three.js arm in total, because it re-reads docs.
