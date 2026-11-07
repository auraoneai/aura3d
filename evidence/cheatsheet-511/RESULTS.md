# lane/511 general first-screen sheet: results

Source: `docs/agents/first-screen.md` (11 pattern blocks), inlined as the first screen of `llms.txt` by `marketing/scripts/gen-seo.mjs`. Gate: `tools/docs/check-cheatsheet-render.mjs` (typecheck against the published `@aura3d/engine` 5.0.2, then two frames 3 s apart on the real GPU over loopback CDP, `evidence/cheatsheet-511/report.json` and `frames/`), verified by `tools/agent-docs` against the block hashes.

## 1. Render gate (measured)

11 of 11 blocks typecheck and render non-black on `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`; the 8 animated blocks differ between frames by 0.27 to 16.2 (mean absolute RGB, 0 to 255; threshold 0.2), the 3 static blocks are lit and non-flat. Longest block is 17 lines. Defects the gate found and the fixes made in the sheet before it went in:

- `material.custom` time: `uTime` does not advance on 5.0.x; the block uses its own uniform plus `setUniform` (diff 16.2).
- Physics: throws `@aura3d/engine physics requires the optional peer @dimforge/rapier3d-compat`; the gotcha line says so. The eval base installs it for both arms.
- Instancing: `setInstances(transforms)` without the colours argument resets every instance to the base colour (the frame was plain white tiles); the block passes colours each call.
- `hsl(...)` colour strings are not parsed on 5.0.2 (grey balls); blocks use hex.
- Bright looks wash out (`product-studio`, `outdoor-day`): blocks use `looks.preset(id, { exposureEv: -1 })`.
- Animated blocks whose period aliased with the 3 s gap (diff 0.05) or moved too few pixels (0.1) were retimed.
- The sky block's `app.atmosphere?.setSky` alone changed nothing (no flag on 5.0.2 builds); the block moves a runtime directional light as well.

Remaining visual weakness: with the bright looks the instancing tiles are still pale and the sea/sky block has a white horizon; the gate proves "renders, animates", not "looks good".

## 2. Size (measured with `tools/agent-eval/count-tokens.mjs`, Prism, calibrated against a 2-character file that costs 1,905 tokens)

| file | tokens (net of the 1,905 overhead) |
|---|---|
| `docs/agents/first-screen.md` | about 7,300 |
| `llms.txt` before (origin/main) | about 5,730 |
| `llms.txt` after | about 11,840 |

Net growth of the first screen about +6,100 tokens: the 4,000-token net target is NOT met. Code-heavy text costs about 2.15 characters per token, so 11 blocks of 8 to 17 lines cost about 600 tokens each. `llms.txt` is 24,928 bytes (budget 25,000); to fit, three marketing paragraphs and the pitfalls list in `llms-core.txt` were shortened (the pitfalls are now covered by the block gotchas).

## 3. Unseen-task trial (6 tasks of my own design, n=3, Aura arm, docs only, claude-sonnet-5.5 through Prism, engine 5.0.2, seed 20261107)

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
