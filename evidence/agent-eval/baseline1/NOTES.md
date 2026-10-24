# baseline1 run notes (read with REPORT.md)

- Docs under test: the repo's agent entry docs at commit 04b7726ef (set sha256 d90cca03...), library `@aura3d/engine` 4.1.2 plus the one-line stock-build fix (04b7726ef) applied to the installed dist; three 0.185.1. Model: claude-sonnet-5.5 through Kiro Prism. 3 runs per task per arm, tasks 1-5, 40-turn budget.
- `first-attempt.log`: the first launch. 12 of the 30 runs aborted before their agent started (no model call): I committed the harness scaffold into the repo while the batch was running, and the in-memory leak check then flagged the scaffold files as repo source. That was a harness bug, not eval data. The 12 runs were re-run with identical run ids and plan (`--only`, `plan-rerun-*.json`, `batch-rerun-*.json`) after the check exempted its own scaffold. No run that reached a model was discarded or re-rolled.
- Remote scoring was run three times on the same snapshots while the scorer was being fixed (stale image tag shared by two shards, `locator.screenshot` stalling on heavy scenes, an orbit probe that proved unreliable). Only the last pass is kept in `remote/`; task 1 was re-scored and merged. The orbit probe is no longer scored (see `tools/agent-eval/caveats.json`).
- `baseline1-cap100` re-runs only the Aura3D arm with a 100-turn budget (same docs), to separate "cannot do the task" from "ran out of turns".
- Full transcripts (untruncated tool results) are not committed; `runs/*/transcript.json` keeps assistant turns in full and tool results truncated to 1,500 characters.

## After the docs rewrite (2026-10-24, batches agentevalb-i1, i2, i3, i3b)

This is the "REPORT-after" the docs program asked for. It is a section here, not a separate file, because the repo sits at 14,999 tracked files against the 15,000-file Vercel limit; the raw batches (runs, transcripts, snapshots, remote frames, metrics) are archived outside git at `/tmp/agentevalb-evidence-20261024.tgz` (ephemeral: copy it if you want to keep it). All figures are software WebGL2, claude-sonnet-5.5 through Kiro Prism, one 40-turn budget, **Aura3D arm only** (the three.js baseline was not rerun: harness inputs for that arm did not change). n=3 per task, tasks 1 to 5; tasks 6 and 7 one run each. The model judge was not run (`--no-judge`): silent-no-op and glue-line fields are therefore absent.

### Before and after (Aura3D arm, tasks 1 to 5, n=15)

| Metric | baseline1 (docs at 04b7726ef, published 4.1.2 + patch) | i1 (rewritten docs, no recipes, current-main tarballs) | i3 (recipes + `onFrame` fix + current-main tarballs) | three.js baseline (n=15) |
|---|---|---|---|---|
| First-try typecheck | 8 | 8 | **15** | n/a |
| First-try build | 10 | 9 | **15** | 15 |
| First-try non-black render | 7 | 4 | 10 | 14 |
| Final non-black render | 8 | 4 | 10 | 15 |
| Runs that hit the 40-turn cap | 7 | 8 | **0** | 0 |
| Median turns | 40 | 40 | **12** | 4 |
| Median input tokens (cumulative) | 3.02 M | 2.85 M | **0.35 M** | not recomputed |
| Median agent wall time | 151 s | 186 s | **55 s** | not recomputed |
| Median `.d.ts` / `dist` files opened | 19 | 20 | **2** | 0 |
| Forest task writes a working file | 0 of 3 | 1 of 3 | **3 of 3** | 3 of 3 |

Targets set for this loop: first-try build at least 14 of 15 (met, 15), non-black render at least 14 of 15 (**not met, 10**), no turn cap (met), forest writes a working file in all runs (met). Aura3D is still behind three.js: median 12 turns against 4, and 10 of 15 renders against 14 to 15.

Tasks 6 and 7 (single run each, i3b): the complete mobile arcade game (task 6, 33 turns, 609 source lines) built, rendered non-black (300 draws), replayed deterministically (equal hashes), had a pause button and no horizontal scroll at the mobile size (probe 1.00); the prop-on-pedestal task (task 7, 26 turns, 161 lines) built and rendered (294 draws, animated). n=1: an existence proof, not a rate. The Aura3D Meshy generation path of task 7 is still not exercised (agents have no shell).

### What the loop found (root causes, ranked by runs affected)

1. **Missing task-shaped docs (docs, 8 of 15 runs in i1).** Agents never wrote a file in 40 turns and opened 40 to 67 `dist` / `.d.ts` files. Fix: `docs/agents/recipes.md` (five compiled scenes), linked from `llms.txt`, `AGENTS.md`, the quickstart and the scene-authoring skill. Effect: median turns 40 to 12, no cap, cube in 5 to 7 turns.
2. **A wrong doc fact I introduced (docs, 3 of 3 cube runs in i2).** The first cube recipe called `app.nodes.require("cube")` on a node with no `.runtime({ id, mutable: true })`, then agents copied it. The compile check cannot see this. Fixed in the recipe and the quickstart mistakes table. Confirmed remotely: the corrected recipe renders (12 draws), where the broken form drew 0.
3. **Library defect: a throwing `onFrame` callback silently stopped the frame loop (4.1.3 and earlier).** The exception unwound the render loop; nothing was drawn again and the page stayed blank, with no page error in the probe. Reproduced with a 5-variant and a 5-variant matrix (every variant with a per-frame `setRotation` on a non-runtime node drew 0; every variant without drew), reproduced on the build from before the frame-cost commit (so not that change). Fixed in `createAuraApp.ts` (callback errors are caught per callback, reported once to `console.error` and `diagnostics().errors`, rendering continues) with `tests/unit/agent-api/on-frame-errors.test.ts`. Remote check: the old broken scene now renders (6 draws).
4. **Harness validity bugs found and fixed.** The remote scorer installed the published 4.1.2 from npm even when agents were given current-main tarballs (it now stages and installs the same tarballs; `tests/unit/agent-eval/score-report.test.ts`); the sandbox leak check flagged the scaffold `index.html` against committed eval snapshots (it now ignores `evidence/agent-eval/`). Iteration 2's remote scoring ran across a mid-run `pkill` of the remote client and its shard logs show two completion markers and no base-source line: **its render numbers are untrusted** and are not reported above (its authoring numbers are valid: median 13 turns, 0 caps, 13 of 15 first-try builds).

### Remaining failure causes (ranked) and what to fix next

1. **Game-loop task, 2 of 3 runs black (draws 139 to 243, frame mean 0) in i3.** The probe plays the round to the 30 s "lost" state before capturing; the canvas reads as zeros although GL draws were issued. Not diagnosed: either a capture race on software GL (the frame-tap black-frame class) or the agents' end-of-round state clears the scene. Next: capture before and after the round and compare with the library's `installFrameTap`.
2. **Forest task: 3 of 3 captures never completed.** Builds pass and the agents wrote working files, but the 10,000-instance scene takes about 6 s per frame on software GL, so the remote capture stalls. This is the scorer's time budget, not an authoring failure. Next: a smaller frame plan for task 2, or a per-task timeout.
3. **Package defect, every app: `GET /aura-environments/neutral.manifest.json` returns 404** (one console error per run); one run also fetched `/hdri/studio_small_08_1k.hdr` (404). The baked environment files (2 MB for `neutral`) live only in the repo `public/aura-environments/`, not in the published package. Not fixed here: shipping assets with the package needs a URL-resolution decision. Next: ship them in the engine tarball and resolve with `new URL(..., import.meta.url)`, or inline the small probe.
4. **three.js still wins authoring speed.** Median 4 turns against 12, and 15 of 15 renders. Remaining Aura3D cost is mostly API discovery (2 `.d.ts` files opened per run now, down from 20) and the rule set an agent must hold (runtime ids, typed assets, node-name orbit target). Next: a recipe-shaped template generator in `create-aura3d` and a `llms.txt` "common tasks" table with the same five examples.
5. **Unverified:** the forest recipe and the loop recipe were compiled but not rendered through the scorer individually; recipes 1 and 3 and the shader scene were (3 of 3 cube, 3 of 3 character, 3 of 3 shader in i3).

### Spend

49 model runs across i1, i2, i3, i2b, i3b: about 55.3 M cumulative input tokens (each turn re-reads the conversation) and 0.20 M output tokens, no judge calls. Remote: about 14 ACR scoring jobs (4 shards each for the three main batches, 2 for the small ones), no GPU, no standing infrastructure; all image tags deleted. Local: three `tsc` builds of the packages (about 21 s each) in throwaway worktrees.
