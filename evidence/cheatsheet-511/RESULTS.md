# lane/511 general first-screen sheet: results

Source: `docs/agents/first-screen.md` (8 pattern blocks after the 5.0.3 review fix: the lights, materials and sky/sun/water blocks were removed), inlined as the first screen of `llms.txt` by `marketing/scripts/gen-seo.mjs`. Gate: `tools/docs/check-cheatsheet-render.mjs` (typecheck against the published `@aura3d/engine` 5.0.2, then two frames 3 s apart on the real GPU over loopback CDP, `evidence/cheatsheet-511/report.json` and `frames/`), verified by `tools/agent-docs` against the block hashes.

## 1. Render gate (measured)

8 of 8 blocks typecheck (re-run after the cut) and render non-black on `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`; the 6 animated blocks differ between frames by 0.25 to 16.3 (mean absolute RGB, 0 to 255; threshold 0.2), the 2 static blocks are lit and non-flat. Longest block is 17 lines. Defects the gate found and the fixes made in the sheet before it went in:

- `material.custom` time: `uTime` does not advance on 5.0.x; the block uses its own uniform plus `setUniform` (diff 16.2).
- Physics: throws `@aura3d/engine physics requires the optional peer @dimforge/rapier3d-compat`; the gotcha line says so. The eval base installs it for both arms.
- Instancing: `setInstances(transforms)` without the colours argument resets every instance to the base colour (the frame was plain white tiles); the block passes colours each call.
- `hsl(...)` colour strings are not parsed on 5.0.2 (grey balls); blocks use hex.
- Bright looks wash out (`product-studio`, `outdoor-day`): blocks use `looks.preset(id, { exposureEv: -1 })`.
- Animated blocks whose period aliased with the 3 s gap (diff 0.05) or moved too few pixels (0.1) were retimed.
- The sky block's `app.atmosphere?.setSky` alone changed nothing (no flag on 5.0.2 builds); the block moves a runtime directional light as well.

Remaining visual weakness: with the bright looks the instancing tiles are still pale and the sea/sky block has a white horizon; the gate proves "renders, animates", not "looks good".

## 2. Size (review fix; `tools/agent-eval/count-tokens.mjs` through Prism, whole-file input tokens, repeat counts vary by about 40)

| file | tokens |
|---|---|
| `llms.txt` origin/main | 7,537 |
| `llms.txt` before the fix (11 blocks) | 13,464 |
| `llms.txt` after the fix (8 blocks) | about 11,460 to 11,500 |

Net growth about +3,950 tokens, inside the 4,000 target (margin under 2% and inside counter noise: treat as "at the budget", not comfortably under). To get there: blocks "Lights and environment", "Materials" and "Sky, sun and a water plane" were removed (their gotchas that matter, environment light, plane size, bloom, are folded into the skeleton block's gotchas; full signatures are already in `docs/agents/api-signatures.md`, scenes in `recipes.md`), several gotcha sentences were trimmed, and three redundant lines in `llms-core.txt` were cut. The Hello world snippet stays because `tools/agent-docs/simulation.ts` reads it.

No remaining block is a solution of any benchmark task: the blocks are minimal API patterns (skeleton, instancing, shader uniform, revolve geometry, rigged clip crossfade, fixed-step input, bound physics, built-in particles). I did not read the benchmark prompts, so "resembles no task" is by construction from the category list only, not checked against the prompts.

## 3. Unseen-task trial, final 8-block sheet (tasks 31-36, n=3, Aura arm docs only, claude-sonnet-5.5 through Prism, engine 5.0.2, seed 20261107, harness of exp/turn-gap-504)

Baseline = the earlier `b511-base` batch (docs of origin/main, not re-run; same harness, model and seed). Sheet = batch `b511-sheet2` plus `b511-sheet2r34`, merged as `b511-sheet2-final`. The first `b511-sheet2` task 34 runs executed with the rapier peer accidentally pruned from the eval base (the runner reinstalls the base from package.json; `AGENT_EVAL_EXTRA_AURA_DEPS=@dimforge/rapier3d-compat@0.20.0` is required): they all threw at runtime, are kept in `agent-eval/superseded-b511-sheet2-t34-no-rapier/` and are not counted. Task 34 was rerun as `b511-sheet2r34` with the peer installed, as in the baseline. Full tables: `agent-eval/REPORT-5.0.3-fix.md`.

| | baseline | final sheet |
|---|---|---|
| runs finished / hit 40-turn cap | 16/18, 2 | 18/18, 0 |
| turns median (range) | 16 (8-40) | 10.5 (7-36) |
| input tokens, median | 656K | 255K |
| first-try typecheck | 14/18 | 17/18 |
| judged checklist, mean | 0.94 | 1.00 |
| docs files opened, median | 6 | 4 |
| build and render probe clean | 16/18 | 17/18 |
| agent wall median | 79s | 46s |

Per task median turns (baseline then sheet): 31 16 / 10, 32 29 / 12, 33 13 / 7, 34 40 / 28, 35 16 / 18, 36 15 / 9.

Honest reading: turns fall on 5 of 6 tasks (32, 33, 36 by 40 to 60%); task 35 (crystals + particles) is flat to slightly worse (18 vs 16, tokens equal) and task 34 (physics) is better than baseline (28 vs 40 median, no cap hits) but much worse than the 11-block sheet's 22: the sheet's bound-bodies physics pattern is not what every run takes, and one run needed 36 turns. The checklist judge scored 1.0 almost everywhere and cannot separate quality. Probe pixel checks are heuristics (they flag dark scenes), identical across arms. n=3 per cell, one model, one seed, a single baseline batch: directional, not a claim. Overall input tokens are lower than the 11-block sheet's (255K vs 472K median) with turns lower too, but the two sheet runs are different samples and the difference is not attributable to the cut alone.

## 4. Earlier trial with the 11-block sheet (superseded by section 3)

### Superseded: unseen-task trial (6 tasks of my own design, n=3, Aura arm, docs only, claude-sonnet-5.5 through Prism, engine 5.0.2, seed 20261107)

Tasks 31 orrery, 32 64-bar instanced ring, 33 hologram shader, 34 pyramid with physics, 35 crystal cluster in custom geometry plus particles, 36 soldier walking a circle (`tools/agent-eval/tasks/31-36`). They were written without reading the 505 prompts and are not tasks 1-9. Baseline docs = `origin/main`; sheet docs = commit 907a25413. Full tables: `agent-eval/REPORT.md`; per-run records, transcripts, snapshots and frames are under `agent-eval/`.

| | baseline | sheet |
|---|---|---|
| runs finished / hit the 40-turn cap | 16/18, 2 | 18/18, 0 |
| turns median (range), mean | 16 (8-40), 20.3 | 15.5 (5-37), 15.6 |
| input tokens, median / total | 656K / 18.5M | 472K / 9.7M |
| first-try typecheck | 14/18 | 12/18 |
| judged checklist, mean | 0.94 | 1.00 |
| docs files opened, median | 6 | 3 |
| build and render probe clean | 16/18 | 16/18 |

Per task median turns (baseline then sheet): 31 16 / 17, 32 29 / 16, 33 13 / 6, 34 40 / 22, 35 16 / 19, 36 15 / 15.

Honest reading:

- The gain is concentrated where a block matches the task's pattern (32 instancing, 33 shader, 34 physics: 3 of 6 tasks, median turns down 45% to 54%). On 31, 35 and 36 it is neutral, and first-try typecheck was worse (sheet 12/18 versus 14/18; task 35 sheet 0/3). The pooled median turns (16 versus 15.5) is almost unchanged; the pooled mean and tokens move because the baseline's long tails (tasks 32 and 34) shrink.
- Task 34 baseline hit the cap twice and one of its three runs finished; the sheet arm finished all three. Both arms had the rapier peer installed (the first baseline attempt without it is kept in `agent-eval/superseded-b511-base-t34-no-rapier/` and is not counted).
- The checklist judge is a single model judge on source plus frame statistics: it scored 1.0 almost everywhere, so it cannot separate the arms on quality. "Build and render probe clean" is a pixel heuristic (lit fraction above 0.2) that flags dark scenes (31 and 35) as blank; it is a measurement artifact, not a defect, and identical in both arms. Tasks 34 and 36 also lack task-specific page probes.
- Visual quality: frames of the same task are diverse across runs and arms (contact sheets in `agent-eval/b511-*/frames`); no run in the sheet arm is a copy of a block, and nothing suggests the sheet changed the look. I did not run a blind panel, so no claim of better or worse visual quality is made.
- n=3 per cell, one model, one seed, local agent loop; ranges overlap on most per-task cells. This is a directional result, not a claim.
