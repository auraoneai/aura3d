# Finish prompt — Lane 13: Agent authoring, skills, templates, quality defaults (A3D_QR_LOOKS)

Copy everything below the line into a fresh coding agent started in the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **finishing agent for Lane 13** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Your
mission: close **every** remaining Lane 13 task in `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`
§4.13 (ids `13-*` below), action the lane's open issues, revert the lane's masks, and get `A3D_QR_LOOKS` to
`standalone-accepted` with evidence. Nothing is "done" until a **passing remote run id** proves it. The owner thinks this
lane is finished; the 2026-10-08 audit (`/tmp/qrfinal/audit-13.json`, auditor + skeptic agree) says **PARTIAL, ~45 %**.

## Status on main `afb475c2` (2026-10-08) — read before you plan

- 19 `[QR-13]` PRs merged (#55, #136, #173, #191, #202, #239, #244, #269, #273, #276, #277, #280, #283, #284, #287, #294,
  #297, #303, #305). Most Phase 1-4 code exists: `agent-api/looks/{lookPresets,looks,lookLint,fakeEffectNames}.ts`,
  `nodes/prompt/{promptPlanV2,promptRecipes,structuralQA,promptPlanMappings}.ts`, `packages/aura3d-cli/src/look/*`,
  `tools/agent-templates/{capture-templates,look-floor}.mjs`, `tools/agent-eval/run.ts`, `tools/agent-skills/craft-ratio.ts`,
  20 templates on `looks.preset` (0 `@aura3d/lean`, 0 `lights.ambient(` in `templates/*/src`).
- **No phase exit is met.** None was ever proven on CI:
  - `qr-prd13-authoring.yml`: about 200 runs, **0 successes**. It fails at repo-wide `pnpm typecheck:raw` (PRD-16 T0-31).
  - `template-lookdev.yml`: 0 successes (3 failures, 13 cancelled). On main (run 37775067948) `capture-templates.mjs`
    crashes in `publish-all.mjs --pack-only` with `Internal package dependency cycle: @aura3d/controls <- @aura3d/input`.
    `continue-on-error: true` at `template-lookdev.yml:83` hides the crash until the outcome test at `:107`.
  - `agent-output-eval.yml` has **never run**: 0 dispatches and no scheduled run yet.
- Missing:
  - template baselines: `benchmarks/agent-eval/baseline/` holds only `README.md`;
  - `round-0.json` (T0.6);
  - `tests/reports/craft-ratio.json`;
  - three browser specs;
  - `docs/project/aura3d-quality-rebuild/evidence/prd-13/`. Notes sit in root `evidence/prd13/` (pr-a..pr-g,
    t7.2), with no CI run ids and a NOT RUN section in each.
- S1-S9: S1/S2/S6/S7/S8 not done; S3/S4/S5/S9 claimed but unproven. 4/61 PRD checklist items ticked.
- Flag: `A3D_QR_LOOKS: "dev"` (`packages/rendering/src/contracts/flags.state.ts:23`). It is gated in
  `createAuraApp.ts:282 → collectGeneratedCodeWarnings` and `promptPlan.ts:25`. The opt-in APIs (`looks.preset`,
  `lookLint`, `compilePromptPlanV2`, `structuralQA`, `aura3d look *`) are ungated by design.
- Program-wide context (PRD-16 §1-§2):
  - With lane flags on (including `looks`), main renders **0/18** benchmark scenes (GitLab 2926601350) and **0/9** games
    (2926540757).
  - Track 0 root causes T0-01..T0-35 sit in lanes 01/02/03/04/05/06/07/08/09/10/11/12/14/15, not yours.
  - Every template you capture runs on that engine. Flag-on template captures stay black until Track 0 lands, so record
    them as expected-red with the issue link and never as passes.

## Read first (rg -n '^#' + offset/limit reads; never whole-file reads of large files)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §1.3 (PR landing, lane-13 row), §2.5
   (all-flags gate), §3 (Track P: P-10, P-24, P-36, P-37, P-55, P-57, P-61, P-64), §4.0 (common rules + promotion),
   §4.13 (your track), §5.3 (blocking list), §7 (verification).
2. `docs/project/aura3d-quality-rebuild/PRD-13-agent-authoring-skills-templates-defaults.md`:
   - §15 phases (`:1061`)
   - §16 checklist (`:1129`)
   - §18.1 S1-S9 (`:1283-1300`)
   - §18.2 I1-I6 (`:1302-1315`)
   - §19 budgets (`:1340`)
   - §22 evidence (`:1393`)
   - §23 completion (`:1409-1431`)
3. `docs/project/aura3d-quality-rebuild/_sections/{process-remediation,issues-triage,integration-findings}.md`
   (lane-13 rows; issues-triage "Lane 13 (12)").
4. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md` (whole file, 147 lines), `CONTRACTS.md` §4-§7 and Appendix B (C-40
   facts; `:2785-2880` has known-bad rows, P-50..P-52).
5. `/tmp/qrfinal/audit-13.json` if present, and the original lane prompt `prompts/LANE-13-agent-authoring-skills-templates-defaults.prompt.md`
   (ownership, contracts and rules still apply).

## Owned paths (single writer; longest prefix in `.github/QR_OWNERSHIP.json` wins)

`packages/create-aura3d/` (templates + skills), root `templates/`, `examples/`, `packages/aura3d-cli/skills/**`,
`packages/aura3d-cli/src/look/`, `packages/engine/src/agent-api/{looks,prompt}/`, `agent-api/nodes/prompt/`,
`packages/engine/src/lanes/prd13.ts`, `benchmarks/agent-eval/`, `tools/agent-*/`, `llms.txt`, `docs/{agents,guides}/`,
`tests/qr/prd13/`, `.github/workflows/{qr-prd13-authoring,template-lookdev,agent-output-eval}.yml`, your PRD file.

These are **not yours**, so use a `qr-request`/`ccr` issue for them:
- `agent-api/nodes/camera.ts` (08)
- `agent-api/index.ts`, `createAuraApp.ts`, `contracts/looks.ts`, `flags.state.ts`, `tools/bundle-size/` (15)
- `.gitlab-ci.yml`, capture tools (12)
- package graph `packages/{controls,input}` (15)

## Remaining tasks (exact ids; do them in this order, parallelise independent ones via subagents)

| ID | Task (file:line) | Done when (remote run id required) | P | Depends |
|---|---|---|---|---|
| 13-LAND | For each stacked PR (#173, #191, #202, #239, #244, #269, #273), whose heads are **not** ancestors of main: `git diff <headRefOid> afb475c2 -- $(gh pr view N --json files -q '.files[].path')`, then classify every hunk as present, intentionally superseded (cite the superseding commit, e.g. #297-#305 or #357's 151-file sweep) or **lost**. Re-land lost hunks in a `[QR-13]` PR. | `evidence/prd-13/landing.md` lists every hunk with a classification; 0 lost | P0 | — |
| 13-CYCLE | Break `@aura3d/controls ↔ @aura3d/input` (file a `qr-request to:prd15` with the exact edge, `publish-all.mjs --pack-only` output and proposed fix; lane 15 owns the package graph). Remove `continue-on-error: true` at `template-lookdev.yml:83` (P-10). Add `pull_request` (paths = owned template/tool paths) + `schedule` triggers. Keep `workflow_dispatch`. | `template-lookdev.yml` green on main, capture step itself `success` | P0 | 15 |
| 13-T031 | Your unit gate runs repo-wide `pnpm typecheck:raw` (`qr-prd13-authoring.yml:30`). Keep it repo-wide (PRD-16 T0-31 forbids scoping it away). Chase each red file's owner through T0-31, and fix any lane-13 file in the error list. Add `push: branches: [main]` + `schedule` to `qr-prd13-authoring.yml`. Rename the step `bundle delta ≤ 12 KB gz` once 13-MASKS lands. | `qr-prd13-authoring.yml` green on a main push | P0 | T0-31 (15 coord.) |
| 13-MASKS | P-24: `tests/qr/prd13/bundle-delta.test.ts:83` `12 * 1024` → `9 * 1024` **and count the carve-out modules** (PRD-13 T1.12, §19). If it then fails, shrink the delta and do not raise the budget. P-36: revert 1065a98e's `navigator.webdriver` downgrade (`packages/create-aura3d/templates/fighting-game/src/main.ts:170-181` and root `templates/fighting-game/src/main.ts`), because capture quality must equal shipped quality. Fix the swiftshader crash by routing the gameplay-smoke spec to a GPU runner (macos-14/GitLab macOS), not by degrading the build. P-37: restore the pre-#357 look-floor expectations (b82d51b01, e64185e23: `templates/*/tests/look-floor.ts` `subjectBounds` "recalibrated to measured values"; arena-shooter specular assert made conditional). Recalibrate only with a signed art-director note in the PR. | All three restored; the affected gates are red or green **honestly** with run ids | P0 | — |
| 13-BASE | Capture template baselines **19 × 3 shots × 2 (desktop+mobile)** against the 3.0.1 tag with `capture-templates.mjs` on `template-lookdev.yml` (macos-14), `qr_flags=none`. Commit them under `benchmarks/agent-eval/baseline/templates/` with `report.json` (`ciProvider`, `browserChannel`, run id). Produce `benchmarks/agent-eval/baseline/round-0.json` (T0.6) from a real `agent-output-eval.yml` run (see 13-S7); never fabricate it. | Baselines + round-0 committed with run ids | P0 | 13-CYCLE, #137 |
| 13-SPECS | Create `tests/browser/looks-expansion.spec.ts` (each of the 15 preset ids expands to the documented node set; C-31 `look` section populated), `tests/browser/template-look-floor.spec.ts` (runtime floor: specular > 0, shadow ≥ 0.8, pixelRatio ≥ min(dpr,2), `look.lint` clean on all 20) and `tests/browser/prompt-plan-render.spec.ts` (S3 frames: 4 recipes × 3 plans, `visualSystems ⊆ census`). Wire them into `qr-prd13-authoring.yml` as a macos-14 browser job, with `forbidOnly` and no self-skip on CI (P-22 pattern). | All three green on macos-14 on main | P1 | 13-CYCLE |
| 13-S3/S4/S5 | S3: automated half is a merge gate (spec above + `prompt-plan-v2.test.ts` census). Judged half = 12 frames, vision + 1 named human. S4: run `aura3d look lint` over 18 game sources + 19 baseline templates + 4 broken controls (ambient-only, `pixelRatio: 1`, solid void, primitive hero). Must give 100 % / 0 errors / 4 of 4; commit the report and a human spot-check of 5. S5: commit `tests/reports/craft-ratio.json` from CI; the art-director read-through of `aura3d-art-direction` is a signed note in the PR. | Reports committed with run ids | P1 | 13-BASE (S4 baselines) |
| 13-S1/S2 | S1: blind A/B, all 20 templates vs their own 3.0.1 baselines (median gain ≥ **+1.5** for game templates + product-viewer; no category drop > 0.5). S2: 6 game templates, median overall ≥ **4.5**, none < 4.0, ibl_reflections ≥ 4.5, environment_world ≥ 4.5, atmospheric ≥ 4.0, shadows ≥ 3.5. Judging goes through the lane 12 panel tooling, vision + ≥ 1 named human. | Judged records under `evidence/prd-13/s1-s2/` | P1 | 13-BASE, 12 panel |
| 13-S6 | `aura3d look capture --runner gh-actions` on product-viewer **and** mini-game returns PNGs + `appliedLook` in ≤ 8 min, **3 consecutive successful runs** (Phase 3 exit). | 3 run ids | P1 | 13-CYCLE |
| 13-S7 | Dispatch `agent-output-eval.yml` pilot: P01, P06, P08, P12 × 1 seed. The LLM leg goes through **Kiro Prism**: read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md` first. `KIRO_PRISM_API_KEY` is an owner action (#137), so record the exact secret name needed. Never print or copy keys. | round-0 + one post-change round; median ≥ round-0 + 1.5, A3 = 0, A4 = 0 | P1 | owner (#137) |
| 13-S8 | 8 three-compat templates captured vs the named three.js r185 examples (captured by `capture-templates.mjs` on macos-14). Each ≥ baseline + 1.5; record the gap to three and **never** claim parity. | Judged | P2 | 13-BASE |
| 13-S9 | Flag-off identity in CI: `compilePromptPlan` outputs, the `index.ts:18256` warning text, the recipe census and the C-36 RenderSource of the 18 base snapshots with `none` are byte/deep-equal to `85aafcd0`. | Run id on main | P1 | T0-31 |
| 13-EVID | Move root `evidence/prd13/*` → `docs/project/aura3d-quality-rebuild/evidence/prd-13/` (P-57) with `git mv`. Add run ids, and keep NOT RUN sections honest. Tick PRD-13 §16 checklist items **only** with `run:<id>`/`capture:<id>` (P-55, checklist-lint by lane 12). Untick nothing that is backed; tick nothing that is not. | Paths consistent; checklist-lint green | P1 | 12-LINT |
| 13-ISSUES | See "Issues" below. | Closed or updated with evidence | P1 | facts verified |
| 13-OWN | Out-of-lane edits (P-61): `agent-api/nodes/camera.ts` (08) in #269/#280/#283/#284/#287/#294/#297/#303/#305; `agent-api/index.ts`, `createAuraApp.ts`, `contracts/looks.ts` (15) in #173/#287; #277 edited `prd07-vfx.yml`, `qr-prd08-camera.yml`, `quality-checkpoint.yml` (+169), `quality-rebuild-capture.yml`, `.github/QR_OWNERSHIP.json`, `AURA3D-VERIFICATION-MATRIX.md`, `benchmarks/production-runtime/**`, `benchmarks/quality-rebuild/**`. For each: get the owning lane's recorded acceptance in the PR thread, or open a revert PR and re-file the change as a `qr-request`. Also review the 151 lane-13 skill/AGENTS files #357 (lane 15) rewrote, and the #350 (lane 09) template edits to `character-controller/src/main.ts`. Accept or re-author each. | `evidence/prd-13/ownership.md`: every file has a sign-off or a revert link | P2 | 08, 09, 15 |
| 13-REQ | P-64: every lane-13 outbound request that exists only in markdown (including Q-13-16 `vite-preview-mount-deadlock`) gets filed with `gh issue create --label qr-request --label to:prdNN`. Write the number back into the ledger within 48 h. gh is already authenticated; do not log in. | Every ledger row has an issue number | P1 | — |
| 13-PROMO | `character-hero` template once an F-06 row is `verified` with a run id. Standalone-accepted (see criteria). I1-I6 at G-PANEL. T7.1 at flag removal. | Promoted by lane 15 | P2 | 06, 12, 15 |

## Issues to action / close (12 to lane 13, plus 1 from 11)

Close each issue only with evidence (a commit + run id) in the comment. Do not close an issue that is unverified.

- **#48** (Q-13-1): drop the `threejs-parity-lab` reference from `tools/agent-examples/index.ts`. Small removal, so do it now
  (related #41).
- **#49** (Q-13-2): quarantine the lane-13 aggregator-only dirs in `CLASSIFICATION.json` (related #44). Verify the dir list first.
- **#105** (QR-11 Q-13-1): archive `templates/production-webgpu-starter` (still present). Check the F-11 fact row is
  `verified` first (related #125).
- **#194** (Q-11-1): `tools/bundle-size` has no `lanes/prd13.ts` entry. The file belongs to lane 15, so comment with the exact
  entry and do not edit it yourself.
- **fact-13 skill/template rewrites:** #50 (evidence-review skill: `quality:*` outputs + panel rounds; needs #39 first),
  #69 (R-14-08 pilot v2 code as template reference), #106 (F-11-01..05), #216 (D-1..D-5 camera rigs/feel), #217 (both
  `aura3d-browser-game/SKILL.md` copies, "Camera and feel" from F-08), #218 (`tests/templates` camera/feel assertions), #264
  (F-10-01..08; no template uses water), #351 (F-09: game templates ride `createGame`).
  - Write skill text **only after** each cited C-40 row is `verified` with a green main run id.
  - F-07-*, F-02-*, F-06-*, F-08-2/-5 and F-03-06..10 are currently wrong or unbacked (P-50..P-52, `CONTRACTS.md:2785-2880`).
  - Until a row is fixed, leave the issue open with a comment naming the blocking row.
- **#137**: the `KIRO_PRISM_API_KEY` Actions secret and the kiro-prism docs are an **owner action**, and the issue blocks
  lane 13 (S7). Comment with the exact secret name and the workflow line that consumes it. Do not set secrets.

## PR content still to land

- Stacked PRs #173, #191, #202, #239, #244, #269 and #273 were merged into `qr/prd13-*` bases. Their heads are not ancestors of
  main, and no file on main is byte-identical to the PR head. 13-LAND decides whether anything was lost. Until then, treat
  their phase-exit titles as **unproven**.
- Never landed at all:
  - the three browser specs (13-SPECS);
  - baselines + round-0 (13-BASE);
  - `tests/reports/craft-ratio.json`;
  - `evidence/prd-13/`;
  - the `character-hero` template (allowed to wait for F-06).
- Phase 5 (looks v1 / provider opt-in, T4.x) and Phase 6 (eval rounds at G-PANEL) are deferred by design. Do not start them
  before 13-BASE and S1-S9 have run ids.

## Red flags to revert (do these first; turning a fake green red is the intended result)

1. `tests/qr/prd13/bundle-delta.test.ts:83`: change `12 * 1024` with carve-outs excluded back to `9 * 1024` with carve-outs
   counted (P-24).
2. `.github/workflows/template-lookdev.yml:83` `continue-on-error: true` on the capture step (P-10). Remove it. The
   `:107` outcome test stays as a belt-and-braces check.
3. 1065a98e: fighting-game `navigator.webdriver` quality downgrade (P-36). Revert it in both template copies.
4. #357 b82d51b01 / e64185e23: look-floor "recalibrated to measured values" and the conditional arena-shooter specular
   assertion (P-37). Restore them.
5. Evidence at the wrong path with no run ids: root `evidence/prd13/` (P-57). Move it, and mark the notes `placeholder`
   until they carry run ids.
6. Out-of-lane edits by #173/#269-#305/#277 (P-61). Get sign-off or revert (13-OWN).
7. Checked and clean (keep it that way): no `.skip`/`.only` in the lane unit tests and no deleted `expect()` in their history.

## Flag-promotion criteria for `A3D_QR_LOOKS` (CONTRACTS §5.3, PRD-16 §4.0)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Lane 13 is also blocked by #137 (owner action: Kiro Prism Actions secret). Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

Only lane 15 changes `flags.state.ts:23`, at a checkpoint. Ask for it with this evidence and nothing less:

- **dev → standalone-accepted**, all of the following:
  - Track 0 exit met (PRD-16 §2.5: Round 5 renders 18/18 base scenes with drawCalls > 0 in both `none` and `$ALL`, 9/9 games
    draw, `$ALL,strict` mounts, and `allflags-smoke` green on main twice).
  - S1-S9 all green/recorded from **one** run set on main (`qr-prd13-authoring.yml` + `template-lookdev.yml` +
    `agent-output-eval.yml`), with `--strict` and no §3 masks.
  - Sentinel identity with `qr_flags=none` (ΔE2000 p99 ≤ IC-0 noise on `benchmarks/quality-rebuild/sentinels.json`).
  - Every lane-owned C-40 fact cited by skills is `verified` with a run id.
  - PRD-13 checklist ticks backed by run ids (checklist-lint green).
  - All outbound requests filed (13-REQ).
  - PRD-13 §23 criteria 1-6 and 8 met, including `tools/qr-ownership/check.mjs` green on every lane-13 PR.
- **standalone-accepted → integrated-accepted**: I1-I6 (PRD-13 `:1310-1315`) pass at a G-PANEL round (IC-4 2026-11-05,
  IC-8 2026-12-03, IC-12 2026-12-31, IC-16 2027-01-28) with `qr_flags=all` and leave-one-out `$ALL,-looks`. Program
  completion needs I4 + I5.
- **integrated-accepted → default-on**: two consecutive checkpoints with no attributed `qr-ic-regression`. **default-on →
  removed**: two more checkpoints, then T7.1 removal PR (legacy deleted, rg check empty, `REMOVED_QR_FLAGS` updated).
- Until I4/I5 pass, no README, skill, `llms.txt` or release note may say templates or agent output reach three.js quality.

## Merge rules (binding; PRD-16 §3.3)

- **Every merge needs a green lane workflow AND the all-flags gate on the PR head.** The lane workflows are
  `qr-prd13-authoring.yml`, plus `template-lookdev.yml` when templates or tools change.
- The all-flags gate is `qr-required / qr-required`, including `allflags-smoke` with `none;$ALL;$ALL,strict`, where
  `ALL=core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler`.
- Until lane 12 lands `qr-required.yml`, run the equivalent by hand: dispatch the GitLab probe/benchmark suite on your head
  with the §2.5 flag sets, and link it.
- While Track 0 is open, the `$ALL` arms are **expected-red with an issue link**. Your PR must not turn a previously green
  arm red.
- No merge with any red, cancelled, queued or in-progress required check. "Pre-existing failure on main" is not an
  exemption.
- No direct pushes to `main`, no local merges of stack branches, and no stacking onto unmerged branches. Each PR targets
  `main` and needs its own green run.
- No edits to another lane's files without an accepted `qr-request`/`ccr` recorded in the PR body.
- Never change repo settings, rulesets or secrets. Those are owner actions: record them and continue.

## Remote-only routing (CI-ROUTING.md; machine policy forbids local Docker/browsers/heavy builds)

- Allowed locally: editing, git, `gh` read and PR operations, `rg`, `tsc --noEmit` on touched packages, single targeted
  vitest files. No local Playwright, captures, `vite build` of templates, or Docker.
- **PR gates** (typecheck, lint, unit, ownership): GitHub ubuntu (`qr-prd13-authoring.yml`). **Template captures, look
  floor, S6 runner, three-compat captures**: GitHub `macos-14` (`template-lookdev.yml`,
  `gh workflow run template-lookdev.yml --ref <branch> -f templates=<dirs> -f qr_flags=none`). Every capture needs a full
  Chromium + `ciProvider` record.
- **Benchmark / all-flags / game evidence**: GitLab macOS through the bridge. Put the tag in your head commit message, for
  example `[qr-gitlab:benchmark]`, or `[qr-gitlab:games games=<ids> viewports=1920x1080 mobile=false]`. You can also
  dispatch: `gh workflow run qr-gitlab-ci.yml --ref <qr/ branch> -f suite=benchmark -f requester=prd13`. Suites are
  `all|games|benchmark|unit|probe`; `flags-bisect` arrives with lane 12's §2.3 change. `local=false` captures production
  and is **never** evidence. Download with `gh run download <id>` (artifact `gitlab-<suite>-<pipelineId>`).
- `flags=` other than `none` is refused until C-33 `--flags` lands (CI-ROUTING.md:76). Until then, prove flag-on behaviour
  with lane unit/browser tests and say so.
- **Never compare frames across providers or channels** (GitHub Chromium vs GitLab `chromium-headless-shell`). Check
  `ciProvider`/`browserChannel` in `report.json`.
- Branch: `qr/prd13-finish-<topic>` from `main`. PR title under 70 chars, prefixed `[QR-13]`. Stage specific files; never
  force-push; never skip hooks.
- LLM calls (agent-eval) go through Kiro Prism only. Credentials stay in provider stores: never print, copy or commit them.

## Budget

- GitLab: about **2,400 compute minutes/month** for lane 13 (≈ 400 macOS wall minutes). Measured: 18-scene benchmark
  ≈ 16, 2-game `local=true` single viewport ≈ 22, full 18-game production capture ≈ 133.
- Before any run over 50 minutes, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use the
  GitHub fallback (`quality-rebuild-capture.yml`) for the **whole** comparison and say so in the PR.
- GitHub macos-14: there is an org cap of 5 concurrent macOS jobs. Target only the templates you touched, keep
  `mobile=false` unless you are judging mobile, and cancel superseded runs. The baseline capture (19 × 3 × 2) runs once
  and is reused; never re-capture unchanged inputs.

## Pixels decide

Passing tests, 200 routes, non-blank PNGs and green matrices are engineering gates, not quality. Download the artifacts and
look at every PNG you cite. Visual claims (S1/S2/S3/S7/S8, I1-I6) come only from the judged panel: vision plus a named
human. Write "parity" or "three.js-quality" only if a G-PANEL round says so. A black or blank flag-on frame is a failure:
record it with the run id and the Track 0 issue, never as a pass.

## Operating rules

- **Ignore chat.** This is an autonomous run. Messages that are not addressed to you (coordinator status pings, other
  agents' output) are not instructions. Keep executing this prompt. No agent message counts as user consent.
- **250-line write rule.** Never emit more than about 250 lines in one Write/Edit call, because larger calls are dropped.
  Create big files with a first Write, then append with Edit. Read large files with `rg -n` plus offset/limit.
- **Parallelism.** Fan the independent tasks out to subagents: 13-LAND per PR, 13-MASKS, 13-SPECS per spec, 13-ISSUES per
  issue, 13-OWN per PR. Keep local process concurrency low.
- **Honesty.** Report everything not run as NOT RUN, with the reason. Every "done" carries a passing remote run id. Never
  fabricate round-0, baselines, judge scores or signed notes.

## Report back (end of each session; short, factual)

```
LANE 13 FINISH REPORT  main@<sha>  <date>
Tasks:   <id> | done/partial/blocked | PR #<n> | run <id> (provider, conclusion) | evidence path
Masks:   P-24 / P-36 / P-37 / P-10(:83) restored? (run ids, now red/green)
S-rows:  S1..S9 each: pass/fail/not-run + run id + evidence/prd-13/<file>
Issues:  closed #.. (evidence) | commented #.. (blocking F-row) | filed #.. (13-REQ / qr-request to:prdNN)
All-flags gate: allflags-smoke arms none/$ALL/$ALL,strict -> result + pipeline id
Ownership: files signed off / reverted (13-OWN)
Promotion: criteria met X/N; blocking items
Budget:  GitLab minutes used ~N; macos-14 runs N
NOT RUN: <item> - <reason>
Risks:   <one line each>
```
