# Aura3D 5.5.1 vs three.js 0.185.1: agent authoring (benchmark C1)

Generated 2026-11-10T09:52:23.046Z from `agent-authoring-c1-5.5.1/results.json` (batch `evidence/agent-eval-c1/c1-551/`). Method: `tests/reports/benchmark-c1/SPEC.md` (frozen before any run); full report: `tests/reports/benchmark-c1/REPORT.md`.

**Read this first.** One model (`claude-sonnet-5.5` through Kiro Prism), 8 fixed tasks x 3 runs x 3 arms, each run a task plus one follow-up edit, no shell or network. `aura` = Aura3D 5.5.1 from npm with its docs and CLI agent tools; `three` = three.js 0.185.1 with no docs (as in benchmark 505); `bridge` = three.js content imported with `aura3d import-three` plus native Aura3D behaviour. Frames and fps are from headless Chrome on an Apple M-series GPU (ANGLE Metal), not a CI runner. Cost is list price on the token split (Prism reports Kiro credits only and no cache fields). Three runs per task is a small sample; ranges are given beside medians. These are agent-effort and correctness numbers for these tasks, not engine performance numbers.

### Headline: medians (min-max) per arm, 72 valid runs of 72

Every valid run counts, including capped and failed ones. Turns, tokens, wall time and cost cover the task plus the follow-up edit. Cost is list price (`claude-sonnet-5.5`: $2/M input, $10/M output) because Prism reports Kiro credits, not USD, and returned no cache fields, so every input token is priced uncached. Functional = scripted probe checks on the real-GPU build (main / follow-up), shown as the median fraction passed and the share of runs passing every check. Visual = mean blind-rubric score (1-5, five dimensions) a run received over all its judge calls. Checklist = share of the task checklist items the source judge marked as met.

| arm | turns | input tokens | output tokens | wall s | list $ | Kiro credits | main checks passed | main all-pass | follow-up checks passed | follow-up all-pass | visual score (1-5) | checklist |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 27 (14-47) | 1.51M (368K-4.06M) | 9K (4K-22K) | 301 (121-746) | 3.11 (0.78-8.34) | 7.8 (2.7-19.8) | 100% (0%-100%) | 88% | 100% (100%-100%) | 100% | 3.37 (2.57-4) | 100% (88%-100%) |
| three | 7 (6-21) | 97K (55K-947K) | 8K (4K-22K) | 125 (59-828) | 0.28 (0.15-2.09) | 2.8 (1.3-11) | 100% (0%-100%) | 88% | 100% (100%-100%) | 100% | 3.43 (1.77-4) | 100% (88%-100%) |
| bridge | 35 (15-55) | 1.94M (403K-4.00M) | 11K (6K-18K) | 351 (162-475) | 3.98 (0.86-8.14) | 9.3 (3.1-16.8) | 100% (0%-100%) | 88% | 100% (0%-100%) | 71% | 3.65 (2.53-4.2) | 100% (88%-100%) |

Blind visual pairs (main-phase frames, majority of 3 calls, ties count half):

| pairing | wins | losses | ties | no frame | win rate | Wilson 95% |
|---|---|---|---|---|---|---|
| aura-vs-three | 13 | 11 | 0 | 0 | 54% | 35%-72% |
| bridge-vs-three | 12 | 12 | 0 | 0 | 50% | 31%-69% |
| bridge-vs-aura | 15 | 9 | 0 | 0 | 63% | 43%-79% |

### Against benchmark 505 (task phase only; 505 had no follow-up)

| measure | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| median turns, task phase | 25 | 14 | 5 | 22 | 5 | 30 |
| median tokens (in+out), task phase | 1.45M | 420K | 63K | 1.15M | 57K | 1.51M |

aura vs 505 docs: turns -12%, tokens -21%; aura vs 505 cheat sheet: turns +57%, tokens +174%; three vs 505 three.js: turns +0%, tokens -9%. The 505 figures are medians over all 24 of its tasks; the per-task 505 turn medians for these 8 tasks are in the batch section below.

### Bridge decision rule (SPEC section 8, thresholds in report.mjs)

**Verdict: native stays the default (bridge does not meet the rule).**

| scope | bridge wall time vs aura | bridge cost vs aura | bridge-vs-aura blind win rate | main all-pass delta (bridge - aura) | rule met |
|---|---|---|---|---|---|
| all 8 tasks | +17% | +28% | 63% | 0 pts | no |
| asset tasks (101, 109, 110) | -19% | +9% | 56% | 0 pts | no |

(Negative = bridge lower than aura.)

### Per task: medians per arm

| task | arm | turns (task+fu) | input tokens | output tokens | wall s | list $ | main checks | follow-up checks | main all-pass | visual | checklist |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 spider | aura | 14 | 370K | 4K | 202 | 0.79 | 1/1, 1/1, 1/1 | 4/4, 4/4, 4/4 | 3/3 | 3.9 | 100% |
| 101 spider | three | 7 | 73K | 5K | 81 | 0.2 | 1/1, 1/1, 1/1 | 4/4, 4/4, 4/4 | 3/3 | 3.9 | 100% |
| 101 spider | bridge | 28 | 1.30M | 7K | 235 | 2.67 | 1/1, 1/1, 1/1 | 0/4, 4/4, 4/4 | 3/3 | 3.3 | 89% |
| 102 portal | aura | 29 | 1.53M | 11K | 346 | 3.16 | 4/4, 4/4, 4/4 | 4/4, 4/4, 4/4 | 3/3 | 3.33 | 100% |
| 102 portal | three | 7 | 132K | 12K | 472 | 0.38 | 4/4, 4/4, 4/4 | 4/4, 4/4, 4/4 | 3/3 | 2.37 | 100% |
| 102 portal | bridge | 37 | 2.50M | 14K | 324 | 5.14 | 4/4, 4/4, 4/4 | 4/4, 4/4, 4/4 | 3/3 | 4.13 | 100% |
| 103 canyon | aura | 25 | 1.49M | 9K | 280 | 3.08 | 1/1, 1/1, 1/1 | 3/3, 3/3, 3/3 | 3/3 | 3.27 | 88% |
| 103 canyon | three | 11 | 433K | 20K | 495 | 1.08 | 1/1, 1/1, 1/1 | 3/3, 3/3, 3/3 | 3/3 | 3.3 | 88% |
| 103 canyon | bridge | 35 | 1.97M | 11K | 346 | 4.05 | 1/1, 1/1, 1/1 | 3/3, 3/3, 3/3 | 3/3 | 3.87 | 88% |
| 104 stacker | aura | 16 | 500K | 5K | 161 | 1.05 | 5/5, 4/5, 5/5 | 5/5, 5/5, 5/5 | 2/3 | 3.2 | 100% |
| 104 stacker | three | 7 | 64K | 4K | 59 | 0.17 | 5/5, 5/5, 5/5 | 5/5, 5/5, 5/5 | 3/3 | 2.53 | 100% |
| 104 stacker | bridge | 24 | 1.03M | 8K | 251 | 2.15 | 5/5, 4/5, 5/5 | 5/5, 4/5, 4/5 | 2/3 | 3.5 | 100% |
| 106 materials | aura | 27 | 1.48M | 7K | 217 | 3.04 | 2/2, 2/2, 2/2 | 4/4, 4/4, 4/4 | 3/3 | 3.7 | 100% |
| 106 materials | three | 7 | 121K | 7K | 127 | 0.32 | 2/2, 2/2, 2/2 | 4/4, 4/4, 4/4 | 3/3 | 3.4 | 100% |
| 106 materials | bridge | 49 | 3.03M | 12K | 387 | 6.18 | 2/2, 2/2, 2/2 | 4/4, 3/4, 4/4 | 3/3 | 3.63 | 100% |
| 109 product | aura | 46 | 3.17M | 19K | 640 | 6.53 | 4/4, 4/4, 4/4 | 5/5, 5/5, 5/5 | 3/3 | 3.67 | 100% |
| 109 product | three | 9 | 157K | 8K | 319 | 0.4 | 4/4, 4/4, 4/4 | 5/5, 5/5, 5/5 | 3/3 | 3.23 | 100% |
| 109 product | bridge | 55 | 3.98M | 14K | 410 | 8.1 | 4/4, 4/4, 4/4 | 4/5, 3/5, 3/5 | 3/3 | 3.8 | 100% |
| 110 clock | aura | 30 | 1.53M | 9K | 314 | 3.14 | 1/1, 0/1, 0/1 | 5/5, 5/5, 5/5 | 1/3 | 3.27 | 89% |
| 110 clock | three | 6 | 69K | 7K | 106 | 0.21 | 0/1, 0/1, 0/1 | 5/5, 5/5, 5/5 | 0/3 | 3.87 | 89% |
| 110 clock | bridge | 30 | 1.39M | 10K | 252 | 2.88 | 0/1, 1/1, 0/1 | 5/5, 5/5, 5/5 | 1/3 | 3.73 | 89% |
| 111 solar | aura | 31 | 1.96M | 14K | 369 | 4.07 | 8/8, 8/8, 8/8 | 3/3, 3/3, 3/3 | 3/3 | 3.3 | 100% |
| 111 solar | three | 7 | 106K | 9K | 117 | 0.3 | 8/8, 8/8, 8/8 | 3/3, 3/3, 3/3 | 3/3 | 3.9 | 100% |
| 111 solar | bridge | 38 | 2.17M | 14K | 356 | 4.48 | 8/8, 8/8, 8/8 | 3/3, 3/3, 3/3 | 3/3 | 3.43 | 100% |

### Source size (lines of code; measured after the run, not part of the frozen spec)

Non-blank, non-comment lines in the app's `src/` (`.ts`/`.js`) after the task (main) and after the follow-up edit. Generated asset typings (`aura-assets.ts`, `aura-catalog.ts`) are not counted. The bridge arm is left out: most of its scene lives in the imported `three-bridge/` content, so its own line count is not comparable. Computed from `evidence/agent-eval-c1/c1-551/runs/*/snapshots/{main,followup}/src`.

| arm | main, median (min-max) | follow-up, median (min-max) |
|---|---|---|
| aura | 270 (105-616) | 289 (116-678) |
| three | 325.5 (203-794) | 352 (213-816) |

aura vs three: -17% lines after the task, -18% after the follow-up; aura is shorter on 6 of 8 tasks (longer on 109 product and 111 solar).

| task | aura main | three main | aura follow-up | three follow-up |
|---|---|---|---|---|
| 101 spider | 145 | 226 | 155 | 243 |
| 102 portal | 318 | 645 | 346 | 668 |
| 103 canyon | 280 | 598 | 294 | 625 |
| 104 stacker | 213 | 234 | 225 | 244 |
| 106 materials | 269 | 313 | 288 | 330 |
| 109 product | 382 | 326 | 424 | 357 |
| 110 clock | 140 | 262 | 168 | 308 |
| 111 solar | 541 | 507 | 598 | 566 |

### Spend

| item | list $ | Kiro credits |
|---|---|---|
| 72 agent runs | 193.45 | 523.7 |
| judges (visual pairs + checklist) | 5.09 | 46.8 |
| preflight (image check + smoke run) | 7.82 | 22.2 |
| **total** | **206.36** | **592.7** |
