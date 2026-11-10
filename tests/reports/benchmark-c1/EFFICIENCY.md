# Agent-efficiency A/B on the C1 aura arm (tasks 101, 104, 109)

**Partial: eff1 agent phase only (7 of 9 runs, not scored or judged); eff2 and eff3 not run. See Status below.**

Baseline = the c1-551 aura runs of the same tasks (Aura3D 5.5.1 CLI and docs at v5.5.1 `6ee56fe80`). `c1-551-eff1`: same frozen harness, model (`claude-sonnet-5.5` via Kiro Prism), caps (40 + 15 turns), condition and seeds; `@aura3d/cli` from `exp/agent-efficiency` (`93c069d82`: compact render summary, PNG only with `--screenshot`, category starters in `examples`), docs at `b89ea3183` (done rule, exact signatures in `llms.txt`). Planned passes: eff1 = CLI and docs only (harness tool description unchanged, so agents still request screenshots); eff2 = eff1 plus the render tool description matching the new CLI (`AGENT_EVAL_RENDER_DESC=summary`, wording from the branch's `aura3d --help` and `llms.txt`); eff3 = eff2 plus `AGENT_EVAL_IMAGE_TURN=1` (earlier tool results never rewritten; a requested screenshot follows the tool results in its own block). 3 runs per task: report ranges, not just medians. Turns and tokens include the follow-up edit. Cost is list price (Prism reports Kiro credits only, and no cache fields).

## Overall

| measure | baseline (c1-551) | eff1 |
|---|---|---|
| turns, median (range) | 16 (14-47) | 17 (11-42) |
| input tokens | 568K (368K-4.06M) | 464K (278K-2.37M) |
| output tokens | 6K (4K-22K) | 5K (4K-18K) |
| wall s | 202 (121-746) | 245 (123-546) |
| list $ per run | 1.20 (0.78-8.34) | 0.98 (0.60-4.92) |
| list $ total | 24.42 | 10.30 |
| Kiro credits total | 67.2 | 31.7 |
| runs (scored) | 9 (9) | 7 (0) |
| main all-pass | 8/9 | not scored |
| follow-up all-pass | 9/9 | not scored |
| regressions | 0 | not scored |
| blind rubric score (1-5) | - | - |
| render calls | 3 (1-11) | 3 (2-10) |
| render calls with --screenshot (total) | 0 | 22 |
| info / examples / validate (medians) | 2 / 1 / 0 | 2 / 1 / 1 |
| read_file / edit_file / search (medians) | 6 / 11 / 6 | 4 / 12 / 3 |

## Per task

| task | column | turns | input tokens | output tokens | wall s | list $ | main checks | follow-up checks | rubric score | renders (with --screenshot) | info / examples / validate |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 spider | baseline (c1-551) | 20, 14, 14 | 731K, 368K, 370K | 6K, 4K, 4K | 202, 186, 256 | 1.52, 0.78, 0.79 | 1/1, 1/1, 1/1 | 4/4, 4/4, 4/4 | -, -, - | 3 (0), 4 (0), 3 (0) | 1 / 1 / 0 |
| 101 spider | eff1 | 13, 11, 11 | 351K, 278K, 313K | 4K, 4K, 4K | 245, 179, 123 | 0.75, 0.60, 0.67 | -, -, - | -, -, - | -, -, - | 3 (2), 3 (2), 2 (2) | 1 / 1 / 1 |
| 104 stacker | baseline (c1-551) | 16, 16, 16 | 500K, 452K, 568K | 5K, 5K, 6K | 161, 121, 164 | 1.05, 0.96, 1.20 | 5/5, 4/5, 5/5 | 5/5, 5/5, 5/5 | -, -, - | 2 (0), 1 (0), 3 (0) | 2 / 1 / 0 |
| 104 stacker | eff1 | 18, 19, 17 | 565K, 572K, 464K | 6K, 6K, 5K | 265, 245, 154 | 1.18, 1.20, 0.98 | -, -, - | -, -, - | -, -, - | 3 (3), 2 (2), 3 (2) | 3 / 1 / 1 |
| 109 product | baseline (c1-551) | 46, 27, 47 | 3.17M, 1.56M, 4.06M | 19K, 13K, 22K | 746, 328, 640 | 6.53, 3.25, 8.34 | 4/4, 4/4, 4/4 | 5/5, 5/5, 5/5 | -, -, - | 11 (0), 6 (0), 11 (0) | 6 / 1 / 0 |
| 109 product | eff1 | 42 | 2.37M | 18K | 546 | 4.92 | - | - | - | 10 (9) | 10 / 1 / 1 |

## Blind A/B visual pairs (main-phase frames, frozen C1 rubric, majority of 3 calls)

| pass vs baseline | pass wins | baseline wins | ties | no frame | pass win rate (ties half) | judge list $ |
|---|---|---|---|---|---|---|

Decision rule from the plan (`docs/agents/agent-efficiency.md` on `exp/agent-efficiency`): a pass is better only if input tokens and turns drop on at least 2 of 3 tasks with no loss in functional all-pass.

- **eff1**: not scored, so the rule cannot be applied (it needs functional all-pass). Turns and input tokens both lower on 2/3 tasks (101, 109) on the runs that finished.

## Status: partial, eff1 agent phase only

- **eff1 finished 7 of 9 agent runs.** The owner then ordered no local Chrome on this Mac. t109 r1 and r3 ended in Prism "overloaded, no healthy keys" infra errors and were not re-run.
- **None of the 7 runs was scored** (functional checks, real-GPU frames) or **blind-judged**, so the plan's decision rule cannot be applied.
- **eff2 and eff3 were not run.** The A/B is to be rerun on a cloud runner. The harness options are committed and off by default:
  - `AGENT_EVAL_RENDER_DESC=summary` gives eff2: the render tool description and loop prompt line in the wording of the branch's own `aura3d --help` and `llms.txt` step 3.
  - `AGENT_EVAL_IMAGE_TURN=1` adds the eff3 change: no rewriting of earlier tool results, and a screenshot in its own block.
- **What eff1 changed:** only the CLI (`@aura3d/cli` from `exp/agent-efficiency` `93c069d82`) and the docs (`b89ea3183`). The harness tool description was unchanged, and agents still requested screenshots. Engine, assets, model, caps, condition and seeds match the baseline.
- **How the CLI was built.** The four changed CLI source files (`agent-tools/render.ts`, `agent-tools/examples.ts`, `cli-help.ts`, `verify/cdp.ts`) were transpiled with TypeScript 5.9.3 into a copy of the published `@aura3d/cli@5.5.1` tarball, and the branch's `skills/` were swapped in. This avoids a full monorepo build on a throttled machine.
  - The same transpile of the `v5.5.1` sources reproduces the published 5.5.1 JS byte for byte.
  - Every eff1 `run.json` records CLI 5.5.1 and docs `b89ea3183`, and the first render result is `aura3d.render-summary/1`, so the patched CLI was in use.

## What the 7 finished runs show (agent-side numbers only)

- **Screenshots are the confound.** eff1 agents passed `--screenshot` on 22 of 23 renders; baseline agents, whose CLI always returned an image, on 0. The harness tool description still says render "returns the JSON report and the screenshot image". Agents asked for the image, so most of the summary-by-default saving did not happen in eff1. This is what eff2 tests.
- **t101 spider:** lower on all three seeds. 11-13 turns against 14-20; 278-351K input against 368-731K; $0.60-0.75 against $0.78-1.52.
- **t104 stacker:** not lower. 17-19 turns against 16 x3; 464-572K input against 452-568K. eff1 added a `validate` call and a few more `info` calls per run.
- **t109 product viewer:** one finished run (r2), so no median comparison is possible. Against the same seed's baseline (r2: 27 turns, 1.56M input, $3.25), eff1 r2 used **more**: 42 turns, 2.37M input, $4.92, with 9 of its 10 renders requesting screenshots. The other two baseline t109 runs (46-47 turns, 3.17-4.06M) were costlier than eff1 r2.
- **Fewer lookups:** median `search` calls fell from 6 to 3 and `read_file` from 6 to 4 per run. This is consistent with the exact-signatures block in `llms.txt`, and with the `api-signatures.md` reads it was meant to replace.
- **Wall time** is higher in eff1 (median 245 s against 202 s). eff1 ran at concurrency 2 while the C1 rescore and judges shared the machine and Prism, so wall time here is not a clean comparison.

## Which change gave which effect

Not separable from this data. eff1 bundles the CLI summary, the examples starters and the docs (done rule, signatures). With the harness still advertising screenshots, its only measured effects are:

- fewer doc lookups (`search`, `read_file`);
- lower turns and tokens on t101;
- no gain on t104;
- a worse result on the one comparable t109 seed.

The per-change attribution (description fix in eff2, prefix-stable images in eff3) needs the cloud rerun.

## Spend

eff1: $10.30 at list price / 31.7 Kiro credits for the 7 finished runs. The two infra-error runs' partial requests are unrecorded.
