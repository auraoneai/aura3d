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
3. **Library defect: a throwing `onFrame` callback silently stopped the frame loop (4.1.3 and earlier).** The exception unwound the render loop; nothing was drawn again and the page stayed blank, with no page error in the probe. Reproduced with two 5-variant matrices (every variant with a per-frame `setRotation` on a non-runtime node drew 0; every variant without drew), reproduced on the build from before the frame-cost commit (so not that change). Fixed in `createAuraApp.ts` (callback errors are caught per callback, reported once to `console.error` and `diagnostics().errors`, rendering continues) with `tests/unit/agent-api/on-frame-errors.test.ts`. Remote check: the old broken scene now renders (6 draws).
4. **Harness validity bugs found and fixed.** The remote scorer installed the published 4.1.2 from npm even when agents were given current-main tarballs (it now stages and installs the same tarballs; `tests/unit/agent-eval/score-report.test.ts`); the sandbox leak check flagged the scaffold `index.html` against committed eval snapshots (it now ignores `evidence/agent-eval/`). Iteration 2's remote scoring ran across a mid-run `pkill` of the remote client and its shard logs show two completion markers and no base-source line: **its render numbers are untrusted** and are not reported above (its authoring numbers are valid: median 13 turns, 0 caps, 13 of 15 first-try builds).

### Remaining failure causes (ranked) and what to fix next

1. **Game-loop task, 2 of 3 runs black (draws 139 to 243, frame mean 0) in i3.** The probe plays the round to the 30 s "lost" state before capturing; the canvas reads as zeros although GL draws were issued. Not diagnosed: either a capture race on software GL (the frame-tap black-frame class) or the agents' end-of-round state clears the scene. Next: capture before and after the round and compare with the library's `installFrameTap`.
2. **Forest task: 3 of 3 captures never completed.** Builds pass and the agents wrote working files, but the 10,000-instance scene takes about 6 s per frame on software GL, so the remote capture stalls. This is the scorer's time budget, not an authoring failure. Next: a smaller frame plan for task 2, or a per-task timeout.
3. **Package defect, every app: `GET /aura-environments/neutral.manifest.json` returns 404** (one console error per run); one run also fetched `/hdri/studio_small_08_1k.hdr` (404). The baked environment files (2 MB for `neutral`) live only in the repo `public/aura-environments/`, not in the published package. Not fixed here: shipping assets with the package needs a URL-resolution decision. Next: ship them in the engine tarball and resolve with `new URL(..., import.meta.url)`, or inline the small probe.
4. **three.js still wins authoring speed.** Median 4 turns against 12, and 15 of 15 renders. Remaining Aura3D cost is mostly API discovery (2 `.d.ts` files opened per run now, down from 20) and the rule set an agent must hold (runtime ids, typed assets, node-name orbit target). Next: a recipe-shaped template generator in `create-aura3d` and a `llms.txt` "common tasks" table with the same five examples.
5. **Unverified:** the forest recipe and the loop recipe were compiled but not rendered through the scorer individually; recipes 1 and 3 and the shader scene were (3 of 3 cube, 3 of 3 character, 3 of 3 shader in i3).

### Spend

49 model runs across i1, i2, i3, i2b, i3b: about 55.3 M cumulative input tokens (each turn re-reads the conversation) and 0.20 M output tokens, no judge calls. Remote: about 14 ACR scoring jobs (4 shards each for the three main batches, 2 for the small ones), no GPU, no standing infrastructure; all image tags deleted. Local: three `tsc` builds of the packages (about 21 s each) in throwaway worktrees.


## evalfix2: the three open items, and a rerun (2026-10-24, batch evalfix2-r1)

Tarballs of main at `2cf49ccf6` (all fixes below included), docs `origin/main`, Aura3D arm, tasks 1 to 5, n=3, 40-turn budget, scored remotely on software WebGL2.

| Aura3D arm, n=15 | i3 (before) | evalfix2-r1 |
|---|---|---|
| First-try typecheck | 15 | 12 |
| First-try build | 15 | 15 |
| First-try non-black render | 10 | 14 |
| Final non-black render | 10 | **14** (target 14: met) |
| Turn-cap hits | 0 | 0 |
| Median turns | 12 | 11 |
| Forest writes a working file and is scored | 3 and 0 scored | 3 and **3 scored** |
| Console errors across final snapshots | 1 per run (the 404) | 0 `aura-environments` 404s; 2 errors in one run (below) |

The one run not counted: task 5 run 3 drew a flat near-white frame (mean 238.7, std 0.3) because its custom water shader failed with `CUSTOM_SHADER_COMPILE_FAILED: No precision specified for (float)`. The failure was loud, but the cause was an engine bug (below), fixed after this batch; that snapshot was not rescored. Typecheck dropped from 15 to 12 first-try; this is run-to-run variance, not tied to a change (turns and builds are unchanged).

### 1. The game-loop black frames: root cause found and fixed (library)

Bisected with six variants of the black run (r2 of i3) on the remote scorer. Only the variant with `resize: false` rendered. Cause: `createAuraApp` sizes the canvas to its parent's box. When the parent is an auto-height `<body>` or wrapper that also holds a HUD `<div>`, every resize grows the parent and so the canvas again, until the backing store passes GPU limits and the frame is black although draws are issued (frame mean 0, draws 133 to 243). Fix: `createParentFit` (`packages/engine/src/agent-api/app/parentFit.ts`) detects a write that moves the parent and keeps the mounted size on that axis; definite-size parents are followed as before. Direct proof: the exact black app, rescored against tarballs with the fix, went from mean 0 to mean 111 (std 61.9), 0 console errors. All three game-loop runs in evalfix2-r1 render. Tests: `tests/unit/parent-fit` (a content-driven parent no longer grows; a definite parent is still followed; an only-child wrapper is not frozen). Docs: black frame checklist in `docs/agents/troubleshooting.md`, sized-wrapper advice in `docs/agents/recipes.md`.

### 2. The 404 on `/aura-environments/neutral.manifest.json`: fixed (library)

The baked neutral environment is embedded in `@aura3d/rendering` (gzip + base64, lazily loaded chunk, 498 KB gzip, decoded with `DecompressionStream`). Bytes are identical to the baked files (sha256 checked). Frames are pixel-identical to the file-served look: with `/aura-environments/**` blocked, a published-style page made 0 environment requests and logged 0 problems; against clean main served from files, 0.00% of pixels differ (Ninja Runner run120 and Silt rings, 480x270, software GL). Zero `aura-environments` 404s in the 15 evalfix2 runs. Cost: the cube app's total JS grew from 3,266 KB to 3,914 KB raw (965 KB to 1,447 KB gzip) because the chunk is part of the build output; it loads asynchronously and the floor draws until it lands. This works against the bundle-size goal: follow-up is a smaller encoding (a lower-resolution level 0 changes mirror reflections, measured relative RMS 0.44 against the baked level 0, so it is not free) or a hashed asset file resolved by URL.

### 3. Forest capture: fixed (harness)

Task 2 is scored on a 320x180 canvas and a 2-frame plan (`HEAVY` in `tools/agent-eval/remote/score-all.mjs`). 3 of 3 forest snapshots completed (mean luma about 195).

### New engine bug found by the rerun, fixed

An author-written `precision highp float;` in a `material.custom` fragment disabled the engine's own default precision, and the engine prelude (`uniform float ...`) sits before the author's line, so the shader failed to compile with "No precision specified for (float)". The default is now always declared first (a later author declaration still governs their code). Test: `tests/unit/custom-shader-precision` (fails on the old code). Not re-run through the scorer.

### Still open

1. Task 5 (shader water) first-try checks: 1 of 2 probe items in most runs (not a black frame; the probe items are the harness's own heuristics).
2. First-try typecheck 12 of 15 (down from 15 in i3; variance or doc wording, unexamined). **Update:** classified in evalfix3 below.
3. The bundle growth from the embedded environment (see section 2). **Update:** reduced from +648 KB to +137 KB in evalfix3 below.
4. The unrelated tests that fail on clean main (`prd03-s18c-custom-passes`, `prd03-t0-16-statecache-invalidate` x2, `prd12-variants`): the two LDR-tail tests may be a regression from the frame-cost commit (`a816facf6`); not investigated here.

## evalfix3: smaller embedded environment, typecheck causes, the two LDR-tail tests (2026-10-24, batch evalfix3-r1)

Tarballs built from the working tree (`tsc` + finalize + `npm pack`), docs at the commit under test, Aura3D arm, tasks 1 to 5, n=3, 40-turn budget, scored remotely on software WebGL2. Raw metrics: `evidence/agent-eval/evalfix3-r1/metrics.json`.

| Aura3D arm, n=15 | baseline1 | i3 | evalfix2-r1 | evalfix3-r1 |
|---|---|---|---|---|
| First-try typecheck | 8 | 15 | 12 | 13 |
| First-try build | 10 | 15 | 15 | 15 |
| First-try renders non-black | 8 | n/a | n/a | 14 |
| Final render non-black | 8 | 10 | 14 | 14 |
| Turn-cap hits | 7 | 0 | 0 | 0 |
| Median turns | 40 | 12 | 11 | 10 |
| Median input tokens | 3.0M | 0.35M | n/a | 0.27M |

three.js median remains 4 turns with 15 of 15 renders, so it is still faster to author with.

The one final render scored blank (task 4 run 3) is a dark night arena that does render (coins and player visible in `remote/frames/evalfix3-r1-t4-aura-r3-final-0.jpg`, mean luma 3.1, std 9.3); the probe's blank threshold counts it as blank. No console or page errors.

### 1. The embedded environment is 5x smaller

The cube is Monte-Carlo baked (128 samples per texel, 1.7% mean relative difference between neighbouring texels), so lossless packing barely helps (498 KB gzip as is, 490 KB with a predictor filter, 329 KB with brotli, which `DecompressionStream` cannot decode). The embedded copy now keeps 5 significant mantissa bits on mip 0 and 4 on the blurred mips: 100 KB gzip, 141 KB of source. Stock cube app: 3,395 kB raw / 1,062 kB gzip (4.1.3: 3,258 / 963; the first embed: 3,914 raw). The stock build smoke still passes (hello-world and mini-game, Vite 7.3.2). Frames: Silt rings 0.074/255 mean absolute difference, Ninja Runner at the run-to-run noise floor; details and the tolerance in `evidence/neutral-embedded/README.md`. The chunk is fetched by every app that uses the default neutral environment (about 100 KB over the wire).

### 2. First-try typecheck: causes (from the archived i2 runs and the evalfix3 runs)

| Error | Task | Cause | Fix |
|---|---|---|---|
| `app.camera` possibly undefined | forest | optional app extension | recipes type-traps table |
| `translate` not on `AuraNodeBuilder` | game loop | it is on the runtime handle | type-traps table; builders now accept `.position([x, y, z])` |
| `'kind' does not exist in type ... AuraCustomGeometrySpec` | water (r2) | invented field; `geometry.define` adds it | type-traps table |
| `Cannot invoke an object which is possibly 'undefined'` on `setUniform` | water (r3) | optional on the handle | type-traps table (`?.setUniform?.(...)`) |

Both evalfix3 failures are the water task and both agents had opened `recipes.md`, which already showed the right pattern; the two traps are now explicit rows in the table. Not rerun after that doc change.

### 3. The two LDR-tail tests: stale test doubles, not a regression

`prd03-s18c-custom-passes` (1 case) and `prd03-t0-16-statecache-invalidate` (2 cases) call `runV2LdrTail`, which calls `host.lifecycle.bindOutput(null, w, h)` since 4.0.4 (SC-01/XR). Their fake host has no `lifecycle`. They fail identically on `a816facf6~1` (the commit before the frame-cost change), and `a816facf6` does not touch `v2Stages.ts`. The fake hosts now provide it.

### Still open

1. `prd12-variants` ("covers every game"): the overlay lists 8 games and `games.json` lists 18, a data drift in the quality-rebuild capture tool; not touched.
2. The first-try typecheck for the water task after the doc change.
3. Real-GPU frames for the quantized environment on glossy metals close to the brightest light patch.


## Full game task (fullgame-436)

Task 6 (complete mobile arcade game "Dodge"), both arms, n=3 per arm, 40-turn budget unchanged, claude-sonnet-5.5 through Kiro Prism, software WebGL2 scoring on serverless ACR (3 shards). Aura3D arm: published `@aura3d/engine` 4.3.6 from the registry (stock-build patch already in the package), docs at the 4.3.6 release commit; three arm: `three@0.185.1`. 0 of 6 runs invalid, no reruns. Full table: `evidence/agent-eval/fullgame-436/REPORT.md`; metrics in `metrics.json`; raw runs archived outside git at `/tmp/fullgame-436-evidence.tgz` (ephemeral).

| Median (min-max), n=3 | Aura3D 4.3.6 | three.js 0.185.1 |
|---|---|---|
| First-try typecheck / build / non-black render | 2 / 3 / 3 of 3 | 3 / 3 / 3 of 3 |
| Final build / non-black render | 3 / 3 of 3 | 3 / 3 of 3 |
| Probe checks passed (as scored) | 1.00 | 0.86 (see below) |
| Agent turns | 32 (21-33) | 7 (7-7) |
| Agent wall time, s | 296.5 (193-312) | 134.6 (134-144) |
| Input tokens (cumulative) | 1.83 M | 0.11 M |
| Output tokens | 14.2 k | 10.0 k |
| Source lines | 527 | 494 |
| Bundle raw KB | 3,428 | 510 |
| Time to ready, ms (software GL) | 1,483 | 218 |

Both arms shipped a complete, building, rendering, deterministic-replay game in every run. three.js took fewer turns, tokens and wall time and was 3 of 3 on first-try typecheck against 2 of 3. Aura3D agents opened 5 to 6 docs files and 4 to 12 package files; three.js agents opened none. No claim that the game kits make a whole game faster to ship than three.js is supported by this run.

Caveats: n=3 per arm, one model, software GL; the model has seen far more three.js; llms.txt and AGENTS.md still carry owner-machine policy text. The pauseButton probe has a defect (`textContent ?? aria-label` never falls back, so icon-only buttons fail): all three three.js runs have `<button aria-label="Pause">` with a glyph, so their 0.86 probe fraction is understated and reads as 1.00 from source (not re-scored; the as-scored number is the one in the table). Harness change: `tools/agent-eval/lib/base.mjs` now takes `AGENT_EVAL_AURA_VERSION` and `AGENT_EVAL_BASE_ROOT` from the environment (defaults unchanged at 4.1.2 and `/tmp/agent-eval-base`); the old code pinned the Aura3D arm to 4.1.2 in both the run and the remote stage manifest. Spend: 5.13 M cumulative input and 71 k output tokens for the six runs, plus six judge calls (usage not recorded).
