# Cold-start authoring trial: fullgame-436

Generated 2026-10-28T00:06:26.082Z. Harness: `tools/agent-eval`. Runs: 6 (valid 6, invalid 0).

**Read this first.** Fresh model agents (claude-sonnet-5.5 through Kiro Prism) with no repo context and no web access, one isolated sandbox per run. Build and render scoring ran on a remote CPU runner with software WebGL2 (SwiftShader): render and time-to-ready numbers say nothing about a real GPU. Every number is a median with (min-max, n) or a count out of n. With small n the table shows direction and spread, not statistical significance; nothing here is tuned, filtered or averaged into a score. Invalid runs (infrastructure failures) are listed, not hidden.

Aura3D arm docs: entry docs copied from the repo at the 4.3.6 release commit (llms.txt, AGENTS.md, docs/agents/**, skills), set sha256 0e37a99967736867
Library under test: @aura3d/engine 4.3.6 (published, registry install, no tarballs; stock-build patch already); three 0.185.1; vite 7.3.2

## Task 6: complete mobile arcade game

| Metric | Aura3D (docs-only, 40-turn budget), n=3 | three.js (40-turn budget), n=3 |
| --- | --- | --- |
| ended at the turn cap (unfinished) | 0/3 | 0/3 |
| first-try typecheck | 2/3 | 3/3 |
| first-try build (vite, stock) | 3/3 | 3/3 |
| first-try renders non-black | 3/3 | 3/3 |
| final builds | 3/3 | 3/3 |
| final renders non-black | 3/3 | 3/3 |
| probe checks passed (fraction) | 1 (1-1, n=3) | 0.86 (0.86-0.86, n=3) |
| judge checklist passed (fraction, model judge) | 1 (1-1, n=3) | 1 (1-1, n=3) |
| edits to green (typecheck) | 2 (0-4, n=3) | 0 (0-0, n=3) |
| silent no-ops (model judge) | 0 (0-2, n=3) | 0 (0-0, n=3) |
| agent turns | 32 (21-33, n=3) | 7 (7-7, n=3) |
| agent wall time, s | 296.5 (192.7-312.2, n=3) | 134.6 (134.3-144.4, n=3) |
| input tokens processed | 1834816 (944114-2009607, n=3) | 106165 (105542-133199, n=3) |
| output tokens | 14234 (11782-15171, n=3) | 10009 (9973-10221, n=3) |
| final source lines (src/) | 527 (488-605, n=3) | 494 (489-542, n=3) |
| final source tokens (o200k) | 5384 (5241-6108, n=3) | 5266 (4805-5310, n=3) |
| glue lines (model-estimated) | 190 (185-230, n=3) | 250 (230-280, n=3) |
| docs files opened | 6 (5-6, n=3) | 0 (0-0, n=3) |
| package/type files opened | 11 (4-12, n=3) | 0 (0-0, n=3) |
| bundle raw KB (JS) | 3428.1 (3421.3-3429.2, n=3) | 510.3 (507.7-510.7, n=3) |
| time to ready, ms (software GL) | 1483 (1252-1691, n=3) | 218 (175-222, n=3) |

Failed probe checks: Aura3D (docs-only, 40-turn budget): none; three.js (40-turn budget): pauseButton x3.

## Caveats

- Model sampling is not seedable through Prism: seeds fix the run plan order and run ids only, so a rerun gives different transcripts.
- Agents get no shell. Their tools are list/read/search/write/edit, a typecheck, and finish. They cannot run vite build or look at a rendered frame, so first-try build and render are what a cold agent ships without that feedback. Both arms are treated identically.
- The three.js arm is advantaged by pre-training: the model has seen far more three.js than Aura3D. This is the point of a cold-start test, not a fair fight between documentation sets.
- Aura3D arm: published @aura3d/engine 4.3.6 from the registry (no tarballs; the stock-build patch was already in the package, so nothing was applied). Docs are the repo state at the 4.3.6 release commit. The published package ships templates/ inside node_modules, which an agent can read.
- The Aura3D arm's AGENTS.md and llms.txt are the repository ones and still carry owner-machine policy text (paths that do not exist in the sandbox), a known caveat.
- Render checks use software WebGL2 (SwiftShader); time to ready says nothing about a real GPU. Every Aura3D run here reports non-black frames with 0 console errors.
- Judge-derived fields (judge checklist, silent no-ops, glue lines) come from a model judge (claude-sonnet-5.5) reading source plus browser probes. They are estimates, not human review. Probe checks are deterministic.
- n=3 per arm, one model, one task. Medians with min-max are shown; no significance test is claimed. The 40-turn budget is unchanged from the earlier trials.
- Probe defect (harness, not fixed here): the pauseButton probe reads `el.textContent ?? el.getAttribute('aria-label')`. `textContent` is a string, never null, so an icon-only button such as <button aria-label="Pause">⏸</button> is judged on the glyph and fails. All three three.js runs have exactly such a button in their final index.html, so their 0.86 probe fraction is understated; read from source, all three have a visible pause button (see the correction section). The measured numbers in the table are left as scored.

## Per-run detail

| Run | Turns | First-try typecheck | Edits to green | Wall s | Input tok | Output tok | Src lines | Draws (final) | Ready ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| aura r1 | 32 | yes | 4 | 312.2 | 1,834,816 | 15,171 | 605 | 266 | 1483 |
| aura r2 | 33 | yes | 0 | 296.5 | 2,009,607 | 14,234 | 527 | 220 | 1691 |
| aura r3 | 21 | no | 2 | 192.7 | 944,114 | 11,782 | 488 | 70 | 1252 |
| three r1 | 7 | yes | 0 | 134.6 | 105,542 | 10,009 | 494 | 38 | 222 |
| three r2 | 7 | yes | 0 | 134.3 | 106,165 | 10,221 | 542 | 48 | 175 |
| three r3 | 7 | yes | 0 | 144.4 | 133,199 | 9,973 | 489 | 76 | 218 |

Input tokens are cumulative over turns (each turn re-reads the conversation), not unique context. Edits to green is the harness count of file writes between the first typecheck and the last passing typecheck; it is not limited to type-error fixes, so aura r1 shows 4 although its first typecheck passed.

## Correction note on the three.js probe score (source-read, not re-scored)

The table shows probe fraction 0.86 for the three.js arm because the pauseButton probe failed on all three runs. The probe matches the regex /pause/i against `textContent` and falls back to `aria-label` only when `textContent` is null, which it never is. The final `index.html` of all three three.js runs contains a visible button whose text is a glyph and whose accessible name is "Pause":

- r1: `<button class="hbtn" id="pause" type="button" aria-label="Pause">⏸</button>`
- r2: `<button id="btn-pause" class="hbtn" type="button" aria-label="Pause">❚❚</button>`
- r3: `<button id="btn-pause" class="hudbtn" type="button" aria-label="Pause">⏸</button>`

Read from source, the three.js arm passes the pause-button requirement 3 of 3, so the arm's probe fraction would be 1.00, the same as the Aura3D arm. This is a source reading, not a new probe run, and the harness was not changed; the table above is the number as scored. The Aura3D runs' pause buttons carry the word in their text and pass.

## What the numbers say (no more)

- Both arms shipped a complete game that built and rendered non-black in 3 of 3 runs, with deterministic replay (equal hashes) and no horizontal scroll at the phone size in every run.
- three.js needed fewer turns (7 against a median of 32), fewer input tokens (about 0.11 M against 1.83 M, medians) and less wall time (135 s against 297 s). Its first-try typecheck was 3 of 3 against 2 of 3 for Aura3D. None of the three.js runs opened any docs or package files; the Aura3D runs opened 5 to 6 docs files and 4 to 12 package or type files.
- Output tokens and final source size are close between arms (medians 14.2 k against 10.0 k output tokens; 527 against 494 lines). The model judge counted fewer glue lines for Aura3D (median 190 against 250); that is a model estimate.
- The three.js bundle is 510 KB raw (130 KB gzip) and the Aura3D bundle 3,428 KB raw (1,074 KB gzip); time to ready under software GL is 218 ms against 1,483 ms.
- Judge: silent no-ops 0 in five runs and 2 in aura r3. Checklist 1.00 for all six runs.
- This run does not show Aura3D game kits making a fresh agent faster to ship a whole game than three.js under this setup. It shows both ship a working game, with Aura3D taking about 4.6 times the turns. Whether the kits changed anything relative to an Aura3D arm without them was not tested (there is no such arm).

## Deviations and invalid runs

- Invalid runs: 0 of 6. No run was rerun and no rerun cycle was used. Nothing was re-rolled or discarded.
- One harness change, needed to run at all: `tools/agent-eval/lib/base.mjs` hard-coded the Aura3D arm to `@aura3d/engine` 4.1.2 (in both the run and the remote stage manifest) and shared `/tmp/agent-eval-base`. It now reads `AGENT_EVAL_AURA_VERSION` and `AGENT_EVAL_BASE_ROOT` from the environment with the old values as defaults, so earlier behaviour and `tests/unit/agent-eval` expectations are unchanged. This batch ran with `AGENT_EVAL_AURA_VERSION=4.3.6` and a separate base root. The scorer log confirms the engine version it installed was 4.3.6 on every shard.
- The measured pauseButton probe defect (see above) is not fixed.

## Spend

Authoring: input tokens 4,788,537 (Aura3D) + 344,906 (three.js) = 5.13 M cumulative; output tokens 41,187 + 30,203 = 71.4 k, claude-sonnet-5.5 through Kiro Prism. Judge: 6 calls, token usage not recorded by the harness. Remote: one 3-shard serverless ACR scoring job, no standing infrastructure; the staged image tag was deleted by the script. Raw runs, transcripts, snapshots, remote results, all frames and logs are archived outside git at `/tmp/fullgame-436-evidence.tgz` (ephemeral: copy it to keep it). Only the report, metrics, plan, batch file and eight frames are kept here.

Frames kept in `frames/` (software GL, 640x360 and phone size): `*-final-0.jpg` for each run, plus `-final-1.jpg` for aura r1 and three r1.
