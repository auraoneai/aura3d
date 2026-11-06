# Trial protocol for the 5.0.2 docs release (WP-D7 and WP-D8)

Status: written, not run. WP-D7 needs one shared capture and one paid job, so it is launched once by the coordinator (parent) only, never by a lane. Do not run it from a lane or in parallel.

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
