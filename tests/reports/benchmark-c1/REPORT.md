# Benchmark C1 report: Aura3D 5.5.1 (npm) vs three.js vs three.js + bridge

Batch `c1-551`, run 2026-11-09/10 (Aura3D 5.5.1 from npm, docs at `v5.5.1` `6ee56fe80`) on `exp/551-c1bench`. Spec: [`SPEC.md`](SPEC.md) (frozen; tasks, rubric and thresholds unchanged). Evidence: `evidence/agent-eval-c1/c1-551/` (run.json, transcripts, snapshots, frames, c1-score.json, c1-judge.json, c1-metrics.json, c1-headline.json). Public numbers: `evidence/vs-threejs/RESULTS-agent-authoring-c1-5.5.1.md`.

## Headline: medians (min-max) per arm, 72 valid runs of 72

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

## Against benchmark 505 (task phase only; 505 had no follow-up)

| measure | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| median turns, task phase | 25 | 14 | 5 | 22 | 5 | 30 |
| median tokens (in+out), task phase | 1.45M | 420K | 63K | 1.15M | 57K | 1.51M |

aura vs 505 docs: turns -12%, tokens -21%; aura vs 505 cheat sheet: turns +57%, tokens +174%; three vs 505 three.js: turns +0%, tokens -9%. The 505 figures are medians over all 24 of its tasks; the per-task 505 turn medians for these 8 tasks are in the batch section below.

## Bridge decision rule (SPEC section 8, thresholds in report.mjs)

**Verdict: native stays the default (bridge does not meet the rule).**

| scope | bridge wall time vs aura | bridge cost vs aura | bridge-vs-aura blind win rate | main all-pass delta (bridge - aura) | rule met |
|---|---|---|---|---|---|
| all 8 tasks | +17% | +28% | 63% | 0 pts | no |
| asset tasks (101, 109, 110) | -19% | +9% | 56% | 0 pts | no |

(Negative = bridge lower than aura.)

## Per task: medians per arm

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

## Source size (lines of code; measured after the run, not part of the frozen spec)

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

## Spend

| item | list $ | Kiro credits |
|---|---|---|
| 72 agent runs | 193.45 | 523.7 |
| judges (visual pairs + checklist) | 5.09 | 46.8 |
| preflight (image check + smoke run) | 7.82 | 22.2 |
| **total** | **206.36** | **592.7** |

## Reading the headline

- **three.js needs far less agent effort on these 8 tasks.** Median 7 turns and 97K input tokens per run (task + follow-up) against 27 turns and 1.51M for native Aura3D, and 35 turns and 1.94M for the bridge. At list price that is $0.28 against $3.11 and $3.98 per run. In Kiro credits, Prism's actual billed unit, the gap is smaller: 2.8 against 7.8 and 9.3 credits per run (about 2.8x, not 11x), because credits follow request count more than tokens.
- **Correctness is equal.** Main-phase all-pass is 88% on every arm (21 of 24). The misses are task 110 on all three arms, explained below, plus one stacker run each for aura and bridge (`dropStacks`). The follow-up all-pass rate is 100% for aura and three.js, and 71% for the bridge.
- **Visual quality is a statistical tie between aura and three.js:** aura wins 13 of 24 blind pairs (54%, Wilson 95% 35-72%). The bridge against three.js is 12-12. The bridge beats aura 15-9 (63%, 43-79%). The mean rubric scores are 3.37 aura, 3.43 three.js and 3.65 bridge.
- **Against 505,** native Aura3D's task phase fell from 25 turns and 1.45M tokens (505 docs) to 22 turns and 1.15M. That is still above 505's cheat-sheet condition (14 turns, 420K), and far above three.js (5 turns, 57K, unchanged from 505). The N1-N8 guidance helped a little and did not close the gap.
- **Where Aura3D's turns go:** the render loop. The aura median is 5 `aura3d render` calls per run, and tool time is 72 s against 1 s for three.js. t109 (product viewer) is the costliest task on both Aura3D arms: 46 turns and $6.53 median for aura, with 11 renders in two of its three runs.
- **Output size and load,** measured on the real GPU, Apple M-series with ANGLE Metal: median emitted JS gzip is 2,230 KB for aura and 2,218 KB for the bridge, against 130 KB for three.js. Fetched at load: 5.9 MB, 7.6 MB and 0.5 MB. Load to ready: 237 ms, 270 ms and 93 ms. Every arm holds 60 fps.

## Bridge verdict

The bridge decision rule (SPEC section 8) is **not met**, so native authoring stays the default. The bridge is not supported for assets only either.

- On all 8 tasks the bridge is 17% slower and 28% more expensive than aura, so the time/cost leg fails outright. Its 63% blind win rate over aura falls between the frozen "comparable" band (0.40-0.60) and the "clearly better" line (0.65). The frozen thresholds leave that gap undefined, but with the bridge slower and costlier, no reading of it meets the rule.
- On the asset tasks (101, 109, 110) the bridge is 19% faster, short of the 25% bar, and 9% more expensive. Its win rate is 56%, which counts as comparable quality, and correctness is equal. The rule needs at least 25%, so it fails.
- The bridge's weak spot is the follow-up edit. It hit the 15-turn follow-up cap in 7 of 24 runs (aura 1, three.js 0), and its follow-up all-pass is 71%. On t109, all three bridge runs failed `frameShiftsBlue` (the paint change did not show in the frame).

## Honest notes

- **Versions.** The aura and bridge arms ran on Aura3D **5.5.1** from npm, with docs exported from tag `v5.5.1` = `6ee56fe80`. The brief named 5.5.0; the owner switched to 5.5.1 mid-run.
  - The first `c1-550` batch (5.5.0) was killed about 2 minutes in and discarded. One three.js run had finished ($0.19). Six runs were in flight, and their spend is unrecorded (estimated under $2).
  - The three.js arm does not depend on the Aura3D version. It ran first, 21:12-22:00 PST. The aura and bridge arms ran 23:26-00:13.
  - The preflight smoke run (aura t109, 5.5.0, $7.62) is a separate batch and not counted in C1.
- **Cost basis.** Prism returned **no cache fields on any request**, so the list-price dollars price every input token as uncached. They are a counterfactual, not an invoice. Prism bills Kiro credits; no USD-per-credit rate is defined, so credits are reported beside dollars.
- **Probe defect, task 110, frozen and unchanged.** The `pendulumMoves` check diffs two frames 1 s apart. The task asks for a 2 s pendulum period, so a correct pendulum is near its mirror pose 1 s later. Its frame diff (0.08-0.15) then falls under the 0.2 motion threshold. All three.js runs and 4 of 6 Aura3D runs fail it. The follow-up probe confirms the pendulum swings (`pendulumSwings` 5/5 on every run). Without that check, main all-pass would be 96% / 100% / 96% for aura / three / bridge (the remaining aura and bridge misses are one `dropStacks` each on t104 r2).
- **Timing-sensitive checks.** The canonical scores come from one serial rescore of all 72 runs after the agent runs finished. Against the interim scores taken while agents were running, 3 checks flipped: t104 bridge r2 `dropStacks` now fails, t110 aura r2 `pendulumMoves` now fails, and t110 bridge r2 `pendulumMoves` now passes. Treat single-check differences in the stacker and clock probes as noise.
- **Load during scoring.** This Mac was shared. The rescore started at 1-min load about 20. The load sampler covered only the last part of the rescore (20 samples, mean 13, 13 above 12). Four t111 runs (aura r3, bridge r1-r3) were rescored and gave identical checks. fps is vsync-capped at 60 on every run, so load mainly moves load-ms and timing probes. The owner then banned local Chrome, so no further rescoring is possible here.
- **Blank flag on t111.** The solar-system frames of 7 runs (all three arms) are flagged `blank` by the scorer's luma heuristic: a mostly black space background. Per the spec they were judged like any other frame. All 21 t111 runs passed every functional check.
- **Infrastructure re-runs (spec section 7, infra errors only).**
  - t103 three.js r1-r3 hung over 20 minutes on open Prism requests; r1 then hit CloudFront 504s.
  - t106 aura r3 hit a Prism "overloaded, no healthy keys" error.
  - All four were re-run with `--only`. No valid run was re-run.
- **Harness fixes made during the run, recorded in commits on `exp/551-c1bench`:**
  - Scorer Chrome-profile cleanup: an ENOTEMPTY error had crashed the scorer.
  - Prism request timeout, then 15 minutes.
  - Streamed Prism responses. Transport only, so token counts are unaffected. Runs before the change (three.js tasks other than 103) were non-streamed.
  - The judge's JSON extraction. A greedy regex had failed on 13 of 216 visual-judge calls whose answers had trailing text; those 13 calls were re-issued with the same candidate order ($0.13). After the repair, t103 r1 bridge-vs-aura went from unjudged to bridge, and t109 r2 from tie to bridge.
  - `git add -f` in the interim watcher, because `tests/reports` is gitignored.
  - None of these changed the frozen tasks, rubric or thresholds.
- **Cost lever for future runs (not applied here, so the three.js arm stays comparable).** The harness sends one stable `X-Prism-Session` per run, and the system prompt and tool list never change. Kiro implicitly caches a byte-identical request prefix, worth about 27% of cold credits when warm. But `pruneOldImages` rewrites the previous screenshot's `tool_result` on every `aura3d render`, so on the Aura3D arms the stable prefix ends at the previous render each time.
  - The fix: stop rewriting history, deliver a requested screenshot in its own block after the tool results, and keep turns within 300 s. It is committed as opt-in `AGENT_EVAL_IMAGE_TURN=1`; the default is unchanged.
  - Prism would also need to return cache fields to make the effect measurable.
- **Agent-efficiency A/B: stopped, change reverted, see `EFFICIENCY.md`.** Pass eff1 (CLI and docs from `exp/agent-efficiency`) finished 7 of 9 agent runs. Their frames, rendered on 2026-11-10 the same way as the baseline, look worse on 101 spider and 109 product and the same on 104 stacker. The docs half of the change (`b89ea3183`, already on `main` and the site) was reverted in `35a0347dc`; the CLI half was never published. Passes eff2 and eff3 were not run.

## Spend

- C1 itself: **$206.36 at list price / 592.7 Kiro credits** (72 runs $193.45, judges $5.09, preflight image check and 5.5.0 smoke run $7.82).
- Plus the unrecorded spend of the aborted 5.5.0 batch, estimated under $2.
- Plus eff1, $10.30 / 31.7 credits.
- Total about **$218.66 list / 624.4 credits**, under the $300 combined stop line.

## Batch report (report.mjs output)

Tasks (frozen 2026-11-09, before results): 101 spider (animation), 102 portal (effects), 103 canyon (environments), 104 stacker (games), 106 materials (materials), 109 product (materials), 110 clock (animation), 111 solar (interactive). Runs per arm per task: 3. Turn caps: task 40, follow-up 15.

### Per arm

| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 24 (24) | 96% | 1 | 96% | 88% | 88% (91%) | 100% | 0 | 27 (22 + 4) | 300.8 | 72.0 | 1510609.50 (0%) | 9009.50 | 3.1113 | 77.9686 | list-price-estimate | 2230.2 | 5918.9 | 236.50 | 60 |
| three | 24 (24) | 96% | 0 | 100% | 88% | 88% (88%) | 100% | 0 | 7 (5 + 2) | 125.3 | 0.9 | 97028.50 (0%) | 7877.50 | 0.2833 | 9.9953 | list-price-estimate | 129.6 | 510.6 | 92.50 | 60 |
| bridge | 24 (24) | 92% | 2 | 71% | 96% | 88% (91%) | 71% | 1 | 34.50 (29.50 + 7.50) | 351.1 | 72.7 | 1937596.50 (0%) | 11338 | 3.9808 | 105.4812 | list-price-estimate | 2218.3 | 7564.8 | 270 | 60 |

### Blind visual pairs (main phase, majority of judge calls)

Judge: claude-sonnet-5.5; calls per pair: 3; judge cost: $5.092390000000001 (list-price-estimate).

| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |
|---|---|---|---|---|---|---|
| aura-vs-three | 13 | 11 | 0 | 0 | 54% | 35%-72% |
| bridge-vs-three | 12 | 12 | 0 | 0 | 50% | 31%-69% |
| bridge-vs-aura | 15 | 9 | 0 | 0 | 63% | 43%-79% |

### Ranges per arm (min-max over valid runs)

| arm | turns | task turns | task tokens (in+out) | tokens in | tokens out | wall s | tool s | billed $ | aura3d CLI calls median (renders) |
|---|---|---|---|---|---|---|---|---|---|
| aura | 14-47 | 11-40 | 265733-3152678 | 367717-4058817 | 4265-22141 | 121.3-746.2 | 16.1-150.3 | 0.7781-8.3390 | 11.50 (5) |
| three | 6-21 | 4-19 | 30226-826209 | 55198-947230 | 3882-21559 | 59-827.8 | 0.6-4.2 | 0.1531-2.0903 | 0 (0) |
| bridge | 15-55 | 12-40 | 291100-2574660 | 402916-3995412 | 5736-17643 | 162.3-474.6 | 32-119 | 0.8632-8.1422 | 9.50 (5) |

### Against benchmark 505 (task phase only; 505 had no follow-up)

505 medians over all 24 tasks: turns 25 docs / 14 cheat sheet / 5 three.js; tokens 1.45M / 420K / 63K.

C1 task-phase medians: aura 22 turns, 1149604 tokens; three 5 turns, 57385 tokens; bridge 29.50 turns, 1508030 tokens.

| task | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| 101 spider | 13 | 5 | 5 | 11 | 5 | 13 |
| 102 portal | 25 | 11 | 5 | 24 | 4 | 32 |
| 103 canyon | 25 | 23 | 8 | 22 | 9 | 31 |
| 104 stacker | 19 | 11 | 4 | 13 | 5 | 22 |
| 106 materials | 20 | 16 | 6 | 24 | 5 | 37 |
| 109 product | 33 | 13 | 6 | 39 | 6 | 40 |
| 110 clock | 13 | 7 | 4 | 15 | 4 | 18 |
| 111 solar | 37 | 24 | 4 | 28 | 4 | 34 |

### Bridge decision rule

Verdict: **native stays the default (bridge does not meet the rule)**.

All tasks and the procedural-asset subset:

```json
{
 "all": {
  "verdict": "native stays the default (bridge does not meet the rule)",
  "detail": {
   "timeGain": -0.16722074468085132,
   "costGain": -0.27946520344780373,
   "bridgeVsAuraWinRate": 0.625,
   "correctnessDelta": 0,
   "comparableQuality": false,
   "clearlyBetter": false,
   "comparableCorrect": true
  }
 },
 "assets": {
  "tasks": [
   101,
   109,
   110
  ],
  "verdict": "native stays the default (bridge does not meet the rule)",
  "detail": {
   "timeGain": 0.18777848504137493,
   "costGain": -0.08826842377905585,
   "bridgeVsAuraWinRate": 0.556,
   "correctnessDelta": 0,
   "comparableQuality": true,
   "clearlyBetter": false,
   "comparableCorrect": true
  }
 }
}
```

### Per task

| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |
|---|---|---|---|---|---|---|---|---|
| 101 spider | aura | 3/3 | 3/3 | 3/3 | 14 | 0.7858 | 1999 | 60 |
| 101 spider | three | 3/3 | 3/3 | 3/3 | 7 | 0.1963 | 54 | 60 |
| 101 spider | bridge | 3/3 | 3/3 | 2/3 | 28 | 2.6676 | 201 | 60 |
| 102 portal | aura | 3/3 | 3/3 | 3/3 | 29 | 3.1631 | 220 | 60 |
| 102 portal | three | 3/3 | 3/3 | 3/3 | 7 | 0.3834 | 90 | 60 |
| 102 portal | bridge | 3/3 | 3/3 | 3/3 | 37 | 5.1362 | 278 | 60 |
| 103 canyon | aura | 3/3 | 3/3 | 3/3 | 25 | 3.0799 | 310 | 60 |
| 103 canyon | three | 3/3 | 3/3 | 3/3 | 11 | 1.0820 | 170 | 60 |
| 103 canyon | bridge | 3/3 | 3/3 | 3/3 | 35 | 4.0471 | 306 | 60 |
| 104 stacker | aura | 3/3 | 2/3 | 3/3 | 16 | 1.0536 | 164 | 60 |
| 104 stacker | three | 3/3 | 3/3 | 3/3 | 7 | 0.1676 | 53 | 60 |
| 104 stacker | bridge | 3/3 | 2/3 | 1/3 | 24 | 2.1529 | 228 | 60 |
| 106 materials | aura | 3/3 | 3/3 | 3/3 | 27 | 3.0419 | 178 | 60 |
| 106 materials | three | 3/3 | 3/3 | 3/3 | 7 | 0.3194 | 124 | 60 |
| 106 materials | bridge | 2/3 | 3/3 | 2/3 | 49 | 6.1796 | 230 | 60 |
| 109 product | aura | 2/3 | 3/3 | 3/3 | 46 | 6.5289 | 249 | 60 |
| 109 product | three | 3/3 | 3/3 | 3/3 | 9 | 0.3951 | 95 | 60 |
| 109 product | bridge | 2/3 | 3/3 | 0/3 | 55 | 8.1014 | 247 | 60 |
| 110 clock | aura | 3/3 | 1/3 | 3/3 | 30 | 3.1427 | 223 | 60 |
| 110 clock | three | 3/3 | 0/3 | 3/3 | 6 | 0.2050 | 55 | 60 |
| 110 clock | bridge | 3/3 | 1/3 | 3/3 | 30 | 2.8838 | 177 | 60 |
| 111 solar | aura | 3/3 | 3/3 | 3/3 | 31 | 4.0659 | 260 | 60 |
| 111 solar | three | 2/3 | 3/3 | 3/3 | 7 | 0.3029 | 149 | 60 |
| 111 solar | bridge | 3/3 | 3/3 | 3/3 | 38 | 4.4783 | 423 | 60 |

### Failed, capped and errored runs

- c1-551-t101-bridge-r1: follow-up hit turn cap
- c1-551-t101-bridge-r3: follow-up hit turn cap
- c1-551-t106-bridge-r2: task hit turn cap; follow-up hit turn cap
- c1-551-t109-aura-r3: task hit turn cap
- c1-551-t109-bridge-r1: task hit turn cap; follow-up hit turn cap
- c1-551-t109-bridge-r2: follow-up hit turn cap
- c1-551-t109-bridge-r3: follow-up hit turn cap
- c1-551-t110-aura-r2: follow-up hit turn cap
- c1-551-t110-bridge-r2: follow-up hit turn cap

Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, aura3d CLI incl. render builds, bridge import, file I/O); wall = whole agent session incl. model latency.
