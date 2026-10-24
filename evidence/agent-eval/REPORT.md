# Cold-start authoring trial: baseline1, baseline1-cap100

Generated 2026-10-24T17:59:29.655Z. Harness: `tools/agent-eval`. Runs: 45 (valid 45, invalid 0).

**Read this first.** Fresh model agents (claude-sonnet-5.5 through Kiro Prism) with no repo context and no web access, one isolated sandbox per run. Build and render scoring ran on a remote CPU runner with software WebGL2 (SwiftShader): render and time-to-ready numbers say nothing about a real GPU. Every number is a median with (min-max, n) or a count out of n. With small n the table shows direction and spread, not statistical significance; nothing here is tuned, filtered or averaged into a score. Invalid runs (infrastructure failures) are listed, not hidden.

Aura3D arm docs: entry docs copied from the repo (llms.txt, AGENTS.md, docs/agents/**, skills), set sha256 d90cca032286e58e
Library under test: @aura3d/engine 4.1.2; three 0.185.1; vite 7.3.2

## Task 1: PBR cube with orbit

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 | Aura3D (docs-only, 100-turn budget), n=3 |
| --- | --- | --- | --- |
| ended at the turn cap (unfinished) | 1/3 | 0/3 | 0/3 |
| first-try typecheck | 2/3 | 3/3 | 3/3 |
| first-try build (vite, stock) | 2/3 | 3/3 | 3/3 |
| first-try renders non-black | 2/3 | 3/3 | 3/3 |
| final builds | 3/3 | 3/3 | 3/3 |
| final renders non-black | 3/3 | 3/3 | 3/3 |
| probe checks passed (fraction) | 1 (1-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| judge checklist passed (fraction, model judge) | 1 (0.80-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| edits to green (typecheck) | 0 (0-1, n=3) | 0 (0-0, n=3) | 0 (0-1, n=3) |
| silent no-ops (model judge) | 2 (2-2, n=3) | 0 (0-0, n=3) | 2 (2-3, n=3) |
| agent turns | 40 (37-40, n=3) | 4 (4-6, n=3) | 34 (29-42, n=3) |
| agent wall time, s | 152.7 (144.7-184, n=3) | 14.3 (13.1-18.7, n=3) | 151.1 (117.7-199.2, n=3) |
| input tokens processed | 3013898 (2854148-3020983, n=3) | 36908 (36677-56389, n=3) | 2733880 (1789213-3756141, n=3) |
| output tokens | 4527 (3472-5286, n=3) | 857 (796-924, n=3) | 4379 (3939-5030, n=3) |
| final source lines (src/) | 93 (60-129, n=3) | 58 (51-58, n=3) | 112 (98-139, n=3) |
| final source tokens (o200k) | 931 (645-1160, n=3) | 526 (498-546, n=3) | 1045 (953-1053, n=3) |
| glue lines (model-estimated) | 62 (28-90, n=3) | 27 (24-29, n=3) | 75 (70-80, n=3) |
| docs files opened | 5 (4-7, n=3) | 0 (0-0, n=3) | 6 (4-6, n=3) |
| package/type files opened | 19 (18-24, n=3) | 0 (0-0, n=3) | 22 (20-22, n=3) |
| bundle raw KB (JS) | 3255.7 (3254.9-3256.4, n=3) | 525.3 (525.3-525.4, n=3) | 3255.6 (3255.5-3255.7, n=3) |
| time to ready, ms (software GL) | 1441 (1386-1736, n=3) | 252 (214-261, n=3) | 1674 (1439-1993, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): none; three.js (40-turn budget): none; Aura3D (docs-only, 100-turn budget): none.

## Task 2: forest of 10,000 instances

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 | Aura3D (docs-only, 100-turn budget), n=3 |
| --- | --- | --- | --- |
| ended at the turn cap (unfinished) | 3/3 | 0/3 | 0/3 |
| first-try typecheck | 0/3 | 3/3 | 1/3 |
| first-try build (vite, stock) | 0/3 | 3/3 | 3/3 |
| first-try renders non-black | 0/3 | 3/3 | 2/3 |
| final builds | 0/3 | 3/3 | 3/3 |
| final renders non-black | 0/3 | 3/3 | 2/3 |
| probe checks passed (fraction) | 0.20 (0.20-0.20, n=3) | 1 (1-1, n=3) | 1 (0.40-1, n=3) |
| judge checklist passed (fraction, model judge) | 0 (0-0, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| edits to green (typecheck) | n/a | 0 (0-0, n=3) | 1 (0-2, n=3) |
| silent no-ops (model judge) | 1 (0-1, n=3) | 0 (0-0, n=3) | 1 (0-2, n=3) |
| agent turns | 40 (40-40, n=3) | 4 (4-4, n=3) | 58 (48-72, n=3) |
| agent wall time, s | 151.3 (139.1-185.6, n=3) | 29 (28.5-29, n=3) | 298.4 (247.6-391.7, n=3) |
| input tokens processed | 3364234 (3335976-4275490, n=3) | 41562 (41265-41699, n=3) | 5625844 (5064157-8100295, n=3) |
| output tokens | 3062 (2995-3489, n=3) | 2309 (2117-2316, n=3) | 8252 (6707-9299, n=3) |
| final source lines (src/) | 0 (0-0, n=3) | 131 (124-134, n=3) | 189 (189-204, n=3) |
| final source tokens (o200k) | 0 (0-0, n=3) | 1582 (1580-1615, n=3) | 1863 (1785-2012, n=3) |
| glue lines (model-estimated) | 0 (0-0, n=3) | 35 (35-42, n=3) | 55 (50-80, n=3) |
| docs files opened | 5 (5-7, n=3) | 0 (0-0, n=3) | 6 (5-6, n=3) |
| package/type files opened | 20 (20-24, n=3) | 0 (0-0, n=3) | 27 (26-30, n=3) |
| bundle raw KB (JS) | n/a | 507 (507-507.8, n=3) | 3256.6 (3256.5-3256.7, n=3) |
| time to ready, ms (software GL) | n/a | 257 (250-258, n=3) | 3265 (2183-3383, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): builds x3, rendersNonBlank x3, animated x3, instanced x3; three.js (40-turn budget): none; Aura3D (docs-only, 100-turn budget): rendersNonBlank x1, animated x1, instanced x1.

## Task 3: skinned character with crossfade

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 | Aura3D (docs-only, 100-turn budget), n=3 |
| --- | --- | --- | --- |
| ended at the turn cap (unfinished) | 1/3 | 0/3 | 0/3 |
| first-try typecheck | 2/3 | 3/3 | 2/3 |
| first-try build (vite, stock) | 3/3 | 3/3 | 3/3 |
| first-try renders non-black | 1/3 | 3/3 | 2/3 |
| final builds | 3/3 | 3/3 | 3/3 |
| final renders non-black | 1/3 | 3/3 | 2/3 |
| probe checks passed (fraction) | 0.40 (0.40-1, n=3) | 1 (1-1, n=3) | 1 (0.60-1, n=3) |
| judge checklist passed (fraction, model judge) | 1 (1-1, n=3) | 1 (1-1, n=3) | 1 (0.20-1, n=3) |
| edits to green (typecheck) | 0 (0-0, n=2) | 0 (0-0, n=3) | 0 (0-2, n=3) |
| silent no-ops (model judge) | 1 (0-1, n=3) | 1 (1-2, n=3) | 3 (2-4, n=3) |
| agent turns | 35 (34-40, n=3) | 5 (5-6, n=3) | 48 (46-49, n=3) |
| agent wall time, s | 145.7 (117.7-149.6, n=3) | 25.7 (23.2-28.2, n=3) | 187.1 (172.3-200, n=3) |
| input tokens processed | 2596999 (2170133-3102972, n=3) | 51398 (48933-58156, n=3) | 3912882 (3807840-4091457, n=3) |
| output tokens | 4118 (3660-4392, n=3) | 1711 (1710-1757, n=3) | 4847 (4611-5090, n=3) |
| final source lines (src/) | 87 (85-90, n=3) | 118 (117-125, n=3) | 98 (85-106, n=3) |
| final source tokens (o200k) | 817 (817-857, n=3) | 1080 (1057-1140, n=3) | 870 (805-958, n=3) |
| glue lines (model-estimated) | 35 (20-42, n=3) | 55 (50-60, n=3) | 30 (27-30, n=3) |
| docs files opened | 5 (4-6, n=3) | 0 (0-0, n=3) | 6 (4-6, n=3) |
| package/type files opened | 21 (14-24, n=3) | 0 (0-0, n=3) | 26 (24-27, n=3) |
| bundle raw KB (JS) | 3256.1 (3255.5-3256.3, n=3) | 608.7 (608.7-608.8, n=3) | 3255.6 (3255.5-3256.2, n=3) |
| time to ready, ms (software GL) | 2245 (2245-2245, n=1) | 425 (384-427, n=3) | 2134 (2005-15273, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): rendersNonBlank x2, animated x2, clipSwitchWorks x2; three.js (40-turn budget): none; Aura3D (docs-only, 100-turn budget): rendersNonBlank x1, animated x1.

## Task 4: game loop (fixed step, score, restart)

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 | Aura3D (docs-only, 100-turn budget), n=3 |
| --- | --- | --- | --- |
| ended at the turn cap (unfinished) | 0/3 | 0/3 | 0/3 |
| first-try typecheck | 3/3 | 3/3 | 2/3 |
| first-try build (vite, stock) | 3/3 | 3/3 | 3/3 |
| first-try renders non-black | 2/3 | 3/3 | 2/3 |
| final builds | 3/3 | 3/3 | 3/3 |
| final renders non-black | 2/3 | 3/3 | 3/3 |
| probe checks passed (fraction) | 1 (0.90-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| judge checklist passed (fraction, model judge) | 1 (1-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| edits to green (typecheck) | 1 (0-1, n=3) | 0 (0-0, n=3) | 0 (0-1, n=3) |
| silent no-ops (model judge) | 2 (1-3, n=3) | 0 (0-1, n=3) | 2 (2-3, n=3) |
| agent turns | 23 (20-36, n=3) | 4 (4-4, n=3) | 19 (19-26, n=3) |
| agent wall time, s | 127.5 (117.4-172.1, n=3) | 30.2 (29.9-34.8, n=3) | 119 (96.5-135.9, n=3) |
| input tokens processed | 1316803 (1097699-2650877, n=3) | 44139 (43901-44783, n=3) | 863391 (831030-1367731, n=3) |
| output tokens | 5991 (5632-6662, n=3) | 2963 (2951-3191, n=3) | 5166 (4648-5959, n=3) |
| final source lines (src/) | 263 (239-307, n=3) | 216 (207-224, n=3) | 251 (239-266, n=3) |
| final source tokens (o200k) | 2826 (2731-3047, n=3) | 2178 (2148-2221, n=3) | 2641 (2383-2811, n=3) |
| glue lines (model-estimated) | 120 (85-140, n=3) | 85 (75-90, n=3) | 110 (85-115, n=3) |
| docs files opened | 5 (4-12, n=3) | 0 (0-0, n=3) | 5 (5-6, n=3) |
| package/type files opened | 11 (11-14, n=3) | 0 (0-0, n=3) | 6 (5-12, n=3) |
| bundle raw KB (JS) | 3258.5 (3258.5-3415.3, n=3) | 507 (506.4-507.1, n=3) | 3414.1 (3413.4-3415.1, n=3) |
| time to ready, ms (software GL) | 1527 (1524-1606, n=3) | 138 (129-145, n=3) | 1894 (1785-2000, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): rendersNonBlank x1; three.js (40-turn budget): none; Aura3D (docs-only, 100-turn budget): none.

## Task 5: shader water

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 | Aura3D (docs-only, 100-turn budget), n=3 |
| --- | --- | --- | --- |
| ended at the turn cap (unfinished) | 2/3 | 0/3 | 0/3 |
| first-try typecheck | 1/3 | 3/3 | 3/3 |
| first-try build (vite, stock) | 2/3 | 3/3 | 3/3 |
| first-try renders non-black | 2/3 | 3/3 | 3/3 |
| final builds | 2/3 | 3/3 | 3/3 |
| final renders non-black | 2/3 | 3/3 | 3/3 |
| probe checks passed (fraction) | 1 (0.25-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| judge checklist passed (fraction, model judge) | 1 (0-1, n=3) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| edits to green (typecheck) | 1 (0-2, n=2) | 3 (1-3, n=3) | 0 (0-0, n=3) |
| silent no-ops (model judge) | 0 (0-5, n=3) | 0 (0-0, n=3) | 0 (0-3, n=3) |
| agent turns | 40 (38-40, n=3) | 5 (5-5, n=3) | 34 (33-39, n=3) |
| agent wall time, s | 323 (244.2-328, n=3) | 53.8 (42.5-54.9, n=3) | 302.8 (261.4-353.8, n=3) |
| input tokens processed | 3424747 (3301312-3516697, n=3) | 63536 (58845-63800, n=3) | 2565807 (2394025-3694078, n=3) |
| output tokens | 9780 (5212-10724, n=3) | 3738 (3442-3812, n=3) | 8642 (8322-8805, n=3) |
| final source lines (src/) | 277 (0-321, n=3) | 185 (183-202, n=3) | 242 (233-278, n=3) |
| final source tokens (o200k) | 3532 (0-3893, n=3) | 2378 (2342-2479, n=3) | 2968 (2803-3314, n=3) |
| glue lines (model-estimated) | 30 (0-115, n=3) | 30 (28-32, n=3) | 58 (55-115, n=3) |
| docs files opened | 6 (6-8, n=3) | 0 (0-0, n=3) | 7 (7-7, n=3) |
| package/type files opened | 19 (17-20, n=3) | 0 (0-0, n=3) | 17 (13-18, n=3) |
| bundle raw KB (JS) | 3278.1 (3278-3278.1, n=2) | 499.1 (499-499.4, n=3) | 3276.9 (3276.3-3277.1, n=3) |
| time to ready, ms (software GL) | 1707 (1490-1923, n=2) | 235 (220-246, n=3) | 2154 (451-2177, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): builds x1, rendersNonBlank x1, animated x1; three.js (40-turn budget): none; Aura3D (docs-only, 100-turn budget): none.

## Caveats

- Model sampling is not seedable through Prism: seeds fix the run plan order and run ids only, so a rerun gives different transcripts.
- Agents get no shell. Their tools are list/read/search/write/edit, a typecheck, and finish. They cannot run vite build or look at a rendered frame, so first-try build and render are what a cold agent actually ships without that feedback. Both arms are treated identically.
- The three.js arm is advantaged by pre-training: the model has seen far more three.js than Aura3D. This is the point of a cold-start test, and it is why the arm is only a reference, not a fair fight between documentation sets.
- The Aura3D arm uses published @aura3d/engine 4.1.2 plus the one-line stock-build fix (04b7726ef) applied to the installed dist, because the published package fails a stock vite build. The published package also ships templates/ inside node_modules, which an agent can read.
- The Aura3D arm's AGENTS.md is the repository one, which still carries AuraOne policy text (machine paths that do not exist in the sandbox). That is the current doc state and is part of what the docs rewrite should fix.
- Render checks use software WebGL2: slow scenes (forest) can time out where a GPU would not. A readyTimeout is counted as not rendering and is reported separately.
- Judge-derived fields (judge checklist, silent no-ops, glue lines) come from a model judge (claude-sonnet-5.5) reading source plus browser probes. They are estimates, not human review. Probe checks are deterministic.
- n is small. Medians with min-max are shown; no significance test is claimed.
- Task 7 (prop asset) is harness-ready with a provided GLB for both arms; the Aura3D Meshy-generation path is not exercised because agents have no shell. Task 6 probes exist but were not part of the baseline.
- Task 1 orbit control is judged from source by the model judge, not by a browser probe: with an auto-rotating subject a drag probe was unreliable (the same code scored differently across two passes), so orbitResponds is recorded in the raw remote results as informational only.
- The agent turn budget is 40. Aura3D-arm agents often spent most of it reading docs and packages, and some wrote nothing before the cap; the cap100 batch re-runs the Aura3D arm with 100 turns to separate 'cannot do it' from 'ran out of turns'.
- A screenshot that times out on a heavy scene under software GL (seen on the 10,000-instance forest) is scored as not rendering and flagged captureFailed, not as a black frame.
