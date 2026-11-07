# 5.1 look defaults (lane 511)

Real GPU: headless Chrome 156, Apple M4 Max, ANGLE/Metal, 960x540, loopback CDP, Vite dev server on this branch.

- `trial/before-t*.png`: the three trial scenes (docs503 r1 snapshots, `trial/src/before`) on the current engine. `trial/after-t*.png`: same scenes with `looks.heroStage` / `looks.fogForExtent` (`trial/src/after`).
- `blind-judge-after.json`: 3 blind pairwise Prism judge calls (claude-sonnet-5.5, trial rubric, seeded order), after-frame vs the original three.js r1 frame. Result: three.js still wins all 3 (cube 15 vs 19, forest 12 vs 16, robot 17 vs 18). Trial r1 baseline totals were 16/20, 13/17, 14/19 (different judge calls, n=1 each: direction only, not a significant change). Only the robot gap narrowed clearly.
- `games/`: six games with and without the lookStage wiring in `looks.ts`; `diffs.json` has mean abs pixel diff. Caveat: in this headless harness the game canvases render black or sit behind menus for most routes (also in the baseline), and duneglide/bellkeepers-walk resolve to the marketing page, so these frames prove little. The real identity argument is structural: the change only adds new exports and no existing code path is edited (see `tests/unit/looks/look-stage-511.test.ts`).
