# Agent efficiency: changes and the A/B plan

**Outcome (2026-11-10): stopped, docs change reverted.** Pass eff1 finished 7 of 9 runs. Real-GPU frames of its scenes look worse than the 5.5.1 baseline on t101 spider and t109 product viewer and the same on t104 stacker; the cost saving held on t101 only. The `llms.txt` and skills change (`b89ea3183`) was reverted on `main` and the site in `35a0347dc`. The CLI changes below stay on this branch and were never published. Details: `tests/reports/benchmark-c1/EFFICIENCY.md`. The rest of this page is the original plan.

Branch `exp/agent-efficiency`. Goal: fewer turns and input tokens per Aura3D scene. Interim C1 on 5.5.1 (aura arm): median 20 turns and 731K input tokens, against 7 turns and 64K for three.js. Quality and correctness were comparable or better on Aura3D. A tally of the c1-551 transcripts found that most of the spend is retry loops and resent context, not authoring. Nothing here has been measured with a model yet; the A/B below does that.

## What changed

| # | Change | Commit |
|---|---|---|
| 1 | `aura3d render` prints a short text summary by default; `--json` gives the same summary as JSON (`aura3d.render-summary/1`, about 500 bytes, byte-stable for an unchanged static scene). The summary covers framing from the engine's own `measureFrameFill` and `camera.worldBounds` on the live pose and nodes, exposure, shadow, motion, errors, fps, backend, `done` and `next`. The PNG is written only with `--screenshot` / `--image`, and a stale PNG at `--out` is removed. `--full` gives the old report. | `b3142f51e` |
| 2 | Done rule in `llms.txt`, the `aura3d-core` and `aura3d-scene-authoring` skills, `agent-tools.md` and the render `next` line: when `validate` passes and one render says `done`, stop. | `b89ea3183` |
| 3 | `aura3d examples "<query>"` puts a runnable starter first for 8 categories (product viewer, character, effect, outdoor, interior, small game, materials, presentation). It prints the complete `src/main.ts` plus setup lines. `--write` of a template also copies its `./aura-assets` siblings. Adds recipe 17 (material swatches). `llms.txt` step 1 is now "start from `aura3d examples`". | `b3142f51e`, `b89ea3183` |
| 4 | An "Exact signatures" block in `llms.txt` (+5.1 KB, about 1.4K tokens) covers the most looked-up builders and runtime-handle members, each line type-checked in `recipes-src/llms-signatures.check.ts`. Examples: `setScale` takes one argument, there is no `h.materials`, and `app.camera` / `app.time` are optional. | `b89ea3183` |

## A/B: 3 C1 tasks on the aura arm, CLI and docs from this branch

Not run; the parent decides when. Run it only after the C1 batch has finished: both share this Mac's Chrome, Prism quota and `/tmp`.

**Design.** The B arm is a rerun of tasks `101`, `104` and `109`, 3 replicates each (`--runs 3`, so seeds match c1-551), on the `aura` arm. It uses the frozen harness in the C1 worktree, unedited, with the same model (`claude-sonnet-5.5`), turn caps (40 + 15) and condition (`base`). Only two inputs differ from c1-551's aura rows for the same tasks (arm A):

- `@aura3d/cli` comes from a tarball packed on this branch. `@aura3d/engine`, `@aura3d/assets` and `create-aura3d` stay at published 5.5.1, so rendering and scoring are unchanged.
- Docs (`llms.txt`, `AGENTS.md`, `docs/agents/**`, CLI skills) come from `--docs-ref b89ea3183`. That is the last product commit on this branch, before this plan, so the plan doc does not land in the sandbox. A used `6ee56fe80`.

Arm A, from `run.json` (turns are task + follow-up; billed = list $):

| task | turns | input tokens | renders | billed $ |
|---|---|---|---|---|
| 101 | 20, 14, 14 | 731K, 368K, 370K | 3, 4, 3 | 1.52, 0.78, 0.79 |
| 104 | 16, 16, 16 | 500K, 452K, 568K | 2, 1, 3 | 1.05, 0.96, 1.20 |
| 109 | 46, 27, 47 | 3.17M, 1.56M, 4.06M | 11, 6, 11 | 6.53, 3.25, 8.34 |

**Steps.**

1. Pack the CLI from a non-symlinked install of this branch (`pnpm pack` needs the real install; see `docs/project/release-4.2.0-runbook.md`). Build per the runbook. If the local governor throttles `tsc`, use the remote runner.

   ```sh
   git checkout exp/agent-efficiency && pnpm install
   node_modules/.bin/tsc -p tsconfig.build.json && node --experimental-strip-types tools/finalize-dist/index.ts
   mkdir -p /tmp/c1-eff-tarballs && (cd packages/aura3d-cli && pnpm pack --pack-destination /tmp/c1-eff-tarballs)
   ls /tmp/c1-eff-tarballs                      # exactly one file: aura3d-cli-5.5.1.tgz
   tar -xOf /tmp/c1-eff-tarballs/aura3d-cli-5.5.1.tgz package/dist/agent-tools/render.js | grep -c render-summary   # > 0
   tar -xOf /tmp/c1-eff-tarballs/aura3d-cli-5.5.1.tgz package/skills/agent-docs/recipes.md | grep -c "## 17\."       # 1
   ```

   The harness maps `aura3d-<name>-<ver>.tgz` to an npm `overrides` entry for `@aura3d/<name>` (`tools/agent-eval/lib/base.mjs`). With only the CLI tarball in the folder, only `@aura3d/cli` changes. `pnpm pack` rewrites the CLI's `workspace:*` dependencies to `5.5.1`, which npm then installs.

2. Use a fresh base root, work dir and batch name. Never reuse `/tmp/c1-551-base`: `ensureBase` rewrites the base `package.json` (adding the overrides) and reruns `npm install` there whenever it differs, which would change C1's base.

   ```sh
   export AGENT_EVAL_BASE_ROOT=/tmp/c1-eff-base AGENT_EVAL_AURA_VERSION=5.5.1 AGENT_EVAL_WORK=/tmp/c1-eff-work
   cd /Users/gurbakshchahal/platforms/aura3d-c1run
   node tools/agent-eval/c1/run-c1.mjs --arm aura --task 101,104,109 --runs 3 --batch c1-eff551 \
     --model claude-sonnet-5.5 --docs-ref b89ea3183 --aura-tarballs /tmp/c1-eff-tarballs --estimate   # planned spend first
   node tools/agent-eval/c1/run-c1.mjs --arm aura --task 101,104,109 --runs 3 --batch c1-eff551 \
     --model claude-sonnet-5.5 --docs-ref b89ea3183 --aura-tarballs /tmp/c1-eff-tarballs --concurrency 3 --score
   node tools/agent-eval/c1/report.mjs c1-eff551
   ```

   Check that `run.json` `base.versions.cli` reads 5.5.1, and that the first render result in a transcript is `aura3d.render-summary/1`. If it is not, the tarball did not take.

3. Compare B with A per task: median and range of turns, input tokens, billed $, and per-run counts of `render`, `info`, `examples`, `validate`, `edit_file` and `read_file`. Also count renders with `--screenshot`, functional all-pass (main and follow-up), regressions, and `renderMain`. Optionally run a blind visual pair A vs B on `frames/` (`judge.mjs` expects every arm of a task/replicate, so this needs a small two-arm wrapper or a manual panel).

**Reading it.** n = 3 per task and 109 ranged 27 to 47 turns, so report ranges, not just medians. Treat B as better only if input tokens and turns drop on at least 2 of 3 tasks with no loss in functional all-pass.

**Known confounds** (the harness is frozen, so they stay):

- The harness tool description (`c1/cli-tools.mjs`) and loop prompt (`lib/loop.mjs`) still say render "returns the JSON report and the screenshot image". Agents may pass `--screenshot` to get it, so count those calls. The harness always appends `--json --out .aura3d/render.png`; with the new CLI that yields the summary and no PNG unless `--screenshot` is present.
- `llms.txt` grew by about 1.4K tokens. It is read once early and then resent every turn (about +35K input over a 25-turn run). The bet is that it replaces `api-signatures.md` reads (62 KB, opened 34 times across the c1-551 aura and bridge runs), `.d.ts` searches and `info` calls.
- The c1-551 Prism route reported `cacheRead: 0` on every run, so prompt caching does not apply there. Any cache benefit from not rewriting history cannot be seen on this route; only raw input tokens can.

**Cost.** The same 9 runs billed about $24 list in c1-551. That is over the $10 per-task line in the cost policy, so the owner approves it. `--estimate` prints the planned figure.

## Harness follow-up (after C1, not part of this A/B)

`pruneOldImages` (`tools/agent-eval/lib/loop.mjs`) rewrites earlier `tool_result` blocks to drop old screenshots. That changes bytes inside the conversation prefix after every render, which defeats implicit prefix caching (Kiro) from that point on. Recommended for the next harness revision:

- Stop rewriting earlier tool results.
- When an agent asks for `--screenshot`, deliver the image in a fresh user turn after the tool result, not inside it, so earlier bytes stay a stable cacheable prefix. With text-by-default render, most runs then carry no image at all.
- Update the tool description to "render returns a text summary; pass `--screenshot` for an image".
