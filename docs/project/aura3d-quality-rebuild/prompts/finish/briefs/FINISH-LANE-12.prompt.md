# Finish prompt — Lane 12: Visual Benchmark + Regression Infrastructure

Copy everything below the line into a fresh coding agent started in the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **finishing agent for Lane 12** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Main is at
`afb475c2` (2026-10-08). All 7 `[QR-12]` PRs (#58, #144, #341, #345, #352, #353, #355) are merged and 64/68 checklist items are
ticked, but the lane is **~40-45 % done**: no lane-12 workflow has ever completed successfully, none of V1-V20 has passing
evidence, and the harness hides the all-flags failures instead of reporting them. Your mission is to finish **every**
remaining task in PRD-16 §4.12 plus the lane-12 rows of Track 0 (§2.2 T0-10..T0-14, §2.3, §2.5) and Track P (P-01, P-32,
P-54, P-56, §3.3.5 checklist-lint). Nothing is "done" until a **passing remote run id** proves it.

## Read first (rg -n '^#' + offset/limit; never read whole large files)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §2 (Track 0, lines 100-253, esp. T0-10..T0-14
   at :131-135, §2.3 :155-186, §2.4 bisection :188-232, §2.5 all-flags gate :234-253), §3 (Track P :257-344), §4.0 rules
   :350-364, **§4.12 your track :663-684**, §6 :814-869, §7 verification :873-921.
2. `docs/project/aura3d-quality-rebuild/PRD-12-visual-benchmark-regression-infrastructure.md`: §14 checklist (:1535),
   §15 tests (:1643), §16 acceptance (:1707), §21 completion criteria (:1874). §15.3 = OIDC-only for AWS.
3. `CI-ROUTING.md` (GitHub vs GitLab, commit tags, budget), `CONTRACTS.md` §4 ownership, §5.3 flag states, §6 merge protocol.
4. `_sections/integration-findings.md`, `_sections/issues-triage.md`, `_sections/process-remediation.md` (same dir).
5. The original lane prompt `prompts/LANE-12-visual-benchmark-regression-infrastructure.prompt.md` (owned paths, rules).

## Owned paths (unchanged)

`.gitlab-ci.yml`, `.github/workflows/qr-gitlab-ci.yml`, `CI-ROUTING.md`; `benchmarks/quality-rebuild/**` except lane scene
dirs (`aura3d/scenes/prdNN/` for NN≠12) and `motion/`; `tools/quality-rebuild-capture/**` except `games.json`,
`route-composition.mjs`, `steps/burst.mjs`; `tools/quality-gate/**` except `scorecard.ts`, `forms/`; `.github/workflows/`
default (incl. `quality-gate.yml`, `quality-rebuild-capture.yml`, `quality-checkpoint.yml`, `quality-devices.yml`,
`quality-review.yml`, new `qr-required.yml`); `packages/engine/src/lanes/prd12.ts`; `docs/project/aura3d-quality-rebuild/`
default. For anything else (lane scene dirs prd01/04/05/06/07, `createAuraApp.ts`), file a `qr-request` + `to:prdNN` issue
with the exact diff and keep working.

## Fix order (do not batch; one PR per group, each with the run it unblocks)

1. **CI that can complete**: CI-1, CI-2, T1.17-fix, T5.6-CI.
2. **Harness honesty**: HARNESS-1 / T0-10, T0-11 (P-01), T0-12, T0-13, T0-14 / REG-1, T1.14-fix.
3. **Bisection + gate infra**: §2.3 inputs, `flags-bisect` suite, §2.5 `qr-required.yml`, 12-LINT; run Rounds 1+2.
4. **Records**: 12-REC (untick), P-32, P-56, red-flag reverts.
5. **Evidence runs** (after 1-3 are green): IC-0, 3.0.1 detectors, title determinism, calibration, goldens, 10× noise,
   injected regressions, games baselines, release dry-run, devices.
6. **Incoming requests** (12-ISSUES) and panel rounds (operator-blocked items last, never blocking others).

## Remaining tasks (exact; every "Done when" needs a cited remote run id)

### P0 — CI and harness

- **CI-1 (12-CONC, T3.3, V10)** — `quality-rebuild-capture.yml:87-89` workflow-level `concurrency` keyed on caller's
  `github.ref` makes the 4 sibling `workflow_call`s in `quality-gate.yml:21-55` cancel each other within 1 s (run
  37775068433: 3 cancelled at 12:12:27-28, metrics+gate skipped). Remove that block or key it
  `quality-rebuild-capture-${{ github.ref }}-${{ inputs.artifact_suffix || 'dispatch' }}-${{ inputs.qr_flags || 'none' }}`;
  keep caller concurrency (`quality-gate.yml:17-19`), and set `cancel-in-progress` only for the same PR ref, never for main or
  schedule. **Done:** a `quality-gate.yml` run on main with capture-bench, capture-games-1/2/3, metrics, gate all
  non-cancelled/non-skipped; ≥ 1 completed run/day; run id in `evidence/prd12/`.
- **CI-2 (T3.3)** — `quality-rebuild-capture.yml:161` `if: inputs.bench || github.event_name != 'workflow_call' && …` is
  always true under `workflow_call` (event_name is the caller's), so every games shard also runs bench (shard-1 bench hit
  90-min timeout). Use `if: ${{ inputs.bench != false || github.event_name == 'push' }}`. Forward flags: add
  `QRC_FLAGS: ${{ inputs.qr_flags || 'none' }}` to the threejs-benchmark job env or `--flags` in `benchmarks/quality-rebuild/ci.sh:27`.
  **Done:** games shards show bench skipped; bench `ready.json` records `qrFlags` equal to the requested list.
- **T1.17-fix / V20 (12-IC0 prerequisite)** — `quality-checkpoint.yml:44` `ls …/IC-*.json | wc -l` exits 2 under pipefail
  on an empty dir (runs 37565849900, 37707174082). (1) `find benchmarks/quality-rebuild/history/rounds -maxdepth 1 -name 'IC-*.json' | wc -l`;
  (2) `tools/quality-gate/bin/collect-checkpoint.mjs` exits non-zero on non-integer `--k`, 0 artifacts or 0 items (no
  `IC-NaN.json`); (3) collect job requires capture-none/capture-all success or records the failure explicitly (not bare
  `if: always()` at `:98-100`); (4) unique branch `qr/ic-<k>-record-<run_id>` or `--force-with-lease`; drop `|| true` on
  `gh pr create` (`:153`); (5) ask the owner to delete stale remote branch `qr/ic--record` (remote write, not yours).
- **T5.6-CI** — `quality-devices.yml`: merge duplicate `env:` (`:52`, `:68`; actionlint `68:9 key "env" is duplicated`),
  replace stored `AWS_ACCESS_KEY_ID/SECRET` (`:32-33`, `:71-72`) with OIDC (`aws-actions/configure-aws-credentials`, pinned
  SHA, `id-token: write`), remove `|| true` (`:65`), replace the fake `BUILTIN_FUZZ` with `--app-arn`=project ARN by a real
  web/Appium test loading the 03-mid URL, or delete the step. **Done:** `actionlint` clean; no failed quality-devices runs on push.
- **HARNESS-1 / T0-10** — `benchmarks/quality-rebuild/aura3d/common.ts:424-430` 90 s draw-wait falls through silently;
  `:499-506` HDRI wait adds 180 s → 270 s > `capture.mjs:37` 240 s timeout. This maps exactly to pipeline 2926601350: the 12
  scenes with `environment:` (02-09, 13, 15, 17, 18) timed out; the 6 without (01, 10, 11, 12, 14, 16) published READY with
  drawCalls 0 (`:611-616`, `main.ts:83-85`). Fix: break both loops on `diagnostics().errors.length > 0` or mount-failed; throw
  `NoDrawError('no-draw-timeout: drawCalls=0 after <n>s; errors=…; degradations=…')` → `__QR_ERROR__`; cap adapter time at
  0.8 × capture timeout (pass via URL). Same pattern in `aura3d/scenes/prd05/common.ts:155-161` and prd04 common (qr-request
  to 05/04). **Done:** forced mount failure publishes `__QR_ERROR__` in < 2 s (unit with fake app + one GitLab run).
- **T0-11 / P-01** — `capture.mjs:149-157` (ready whenever `__QR_READY__`), `:462-464` (exit non-zero only if every scene
  lacks metrics), `--strict` `:416-422` fails only on not-ready/software GPU and is passed by no caller;
  `capture-games.mjs:1057-1059` ignores `blankShots` and `readiness: no-draw-timeout`; `.gitlab-ci.yml:114`
  `--build-only || echo` captures production on build failure. Fix: status `no-draw`/`renderer-error` when
  `errors.length > 0 || drawCalls === 0`; pixel-variance blank check per PNG; exit 1 on any non-ready arm unless
  `--report-only`; strict default when `process.env.CI`; remove `|| echo`. **Done:** re-running 2926601350's inputs exits
  non-zero listing 18 `renderer-error` rows.
- **T0-12** — `performance.mark` at createAuraApp start, `Renderer.create` resolved, `compileScene` resolved, first
  `renderFrame`, mount catch (marks in 15-owned files via qr-request); harness copies `getEntriesByType('mark')` into
  `payload.extra.mountTiming`. **Done:** one remote run names the ~90 s phase (01 `loadMs 118445`); follow-up filed to owner.
- **T0-13** — `aura3d/common.ts:396` passes `renderer:{mode, qualityProfile, fallback}` → `createAuraApp.ts:76-82` throws
  `AuraMigrationError` under `A3D_QR_STRICT`. Use `renderer:{ qualityProfile:"production" }`; verify
  `resolveRendererQualityProfile("production").rendererMode === "production"` (`rendererOptions.ts:118`). qr-requests for
  lane copies: prd01/common.ts:319, prd04:301, prd05:145-148, prd06/*:75/117/236, prd07/common.ts:331. **Done:**
  `bench_flag_sets="$ALL,strict"` mounts every Aura scene.
- **T0-14 / REG-1** — `aura3d/scenes/prd12/ref-06-product-turntable-motion.ts:7-8` and `three/…:8-9` look up
  `prd12-ref-06-product-turntable`; registry id is `…-motion` (`scenes/prd12/ref-scenes.ts:204`, `shared/registry.ts:151`).
  Use `spec.id` from `main.ts`; add a unit asserting every lane adapter id equals its registry id. **Done:** scene READY in
  both engines.
- **T1.14-fix** — `packages/engine/src/lanes/prd12.ts:16` calls `app.diagnostics()` inside a C-31 section that
  `createAuraApp.ts:670-671` runs on every `diagnostics()` (no flag filter; `contracts/diagnostics.ts:52` →
  `rendering/src/contracts/core.ts:114` `all()`): unbounded recursion to RangeError, swallowed at `:46-48`, in every build.
  Bench polls every 50-100 ms (`common.ts:427,:502`), `capture-games.mjs:384,:776-788` every 100 ms → plausible contributor to
  240 s hangs and `Target page closed`. Build `appliedLook` from a passed renderer snapshot or a module store (as
  `postBridge.ts:8-10` warns); honour `section.flag`; cancel/flag-gate the global rAF sampler (`prd12.ts:67-78`). **Done:**
  `tests/unit/contracts/impl/prd12-diagnostics.test.ts` asserts one `diagnostics()` per collect; bench `diagnostics()` < 1 ms.
- **12-T0 §2.3** — `.gitlab-ci.yml` inputs `bench_scenes`, `bench_engines`, `bench_flag_sets` (regexes in PRD-16 :160-175),
  `suite: flags-bisect`; `ci.sh` forwards `--scenes/--engines/--timeout 120000 --strict`, loops `QR_BENCH_FLAG_SETS` after
  one build, writes `bisect-summary.json` {set, scene, status, drawCalls, errors[0], mountTiming}; `qr-gitlab-ci.yml`
  dispatch inputs + plan-step validation (`:140-175`) + trigger body (`:192-196`). Run §2.4 Rounds 1+2, later 3-5; attach each
  summary to the Track 0 tracking issue; file each culprit as `qr-ic-regression` + `to:prdNN`.
- **12-T0 §2.5** — author `.github/workflows/qr-required.yml` (no path filter; `dorny/paths-filter` pinned SHA;
  `allflags-smoke` via GitLab bridge, `bench_flag_sets="none;$ALL;$ALL,strict"`, 6 probes; `qr-required` aggregator
  `if: always()` failing on any `failure|cancelled`; nightly main full run). While Track 0 is open, `$ALL` arms are
  **expected-red with an issue link**, never skipped; a PR turning a green arm red fails. Lane 15 makes it required.
- **12-LINT** — checklist-lint job: every `- [x]` in PRD-01..16 must carry `run:<id>` or `capture:<id>` resolved via
  `gh api …/actions/runs/<id>` (or GitLab pipeline API) with `conclusion == success` on main; add `aura3d/scenes/**` to
  `benchmarks/quality-rebuild/tsconfig.typecheck.json`. **Done:** job runs inside `qr-required`.
- **12-156** — #156 systemic mounted-evidence timeouts (16/17 browser specs across lanes): root-cause on main after T0-01.
  **Done:** Browser Matrix green.
- **12-REC (P-54)** — untick T1.16, T1.17, T3.2, T3.3, T3.6, T5.6, T5.7 in PRD-12 (lines 1582, 1583, 1599, 1600, 1607, 1640,
  1641) until each has a linked successful run; re-tick with `run:<id>`.

### P0/P1 — evidence runs (only after CI-1, CI-2, HARNESS-1, T0-11 are green)

- **12-IC0 (T1.16, T1.17, V20)** — dispatch `quality-checkpoint.yml` (flags `none`; add `all` only once it no longer hangs).
  **Done:** `benchmarks/quality-rebuild/history/rounds/IC-0.json` on main is a valid PanelRoundRecord with 18 scenes + 18
  games, and `sentinels.json:7` `identityCheck.deltaE2000P99` is non-null (per-image ΔE2000 p99 tolerance).
- **T1.12 / V1-V8** — dispatch `quality-rebuild-capture.yml` with `ref=c08d8acb`, bench=true, `--strict`; if the harness does
  not exist there, run the main harness against the c08d8acb engine build (worktree overlay step). `python -m metrics run`;
  commit `history/baselines/3.0.1-detectors.json` (numbers only). Check V1 shadowContrast flags 01/02/08/12/17/18, V2
  skyVariance 09/13, V3 subjectPresence 14, V4 IoU < 0.5 on 16, V5 ΔE > 10 on 05, V6 07, V7 06, V8 03/11 ≤ 1 minor flag;
  mask IoU ≥ 0.98 between engines on every contract scene except 16; research 22/23 majors with no human input.
- **T1.13** — `title_repeats=4` on main; set `titleDeterministic` for all 18 games in
  `tools/quality-rebuild-capture/games.prd12.json` (all null today). **Done:** no null; run id cited.
- **T2.6 / V9** — `capture.mjs --variants all --calibrate` in CI, then `calibrate.ts` → `calibration.json`; self-test rejects
  every applicable broken control on all active scenes, exits 0; list non-discriminating pairs.
- **T3.2 / T3.1** — `goldens/manifest.json` has `entries: []`, empty `runnerImage`/`gpuRenderer`. After the first completed
  gate run + a panel record, `proposeGoldenUpdate` adds LFS goldens for the 18 contract scenes, admitted ref-* scenes and
  deterministic scenario stills. **Done:** entries resolve in LFS; same provider/channel as the gate.
- **V10 noise** — 10 × `quality-gate.yml` on one unchanged commit → 0/10 G-REG failures; run ids in `evidence/prd12/`.
- **T3.6 + P-32** — run `quality-gate.yml` on `qr/injected-regressions` (f0c0c8d4; test branch by design, never merge it);
  commit each `injected-<id>/verdicts.json`. Blocks expected: shadow ½ on 01/12, IBL 0 on 03/06/13, DPR 0.5 on all.
  `tests/unit/quality-gate/injected-regressions.test.ts:35-38` must fail (or `it.todo` with reason) when verdicts are
  missing; `:26-30` must check git refs, not a constant against itself.
- **V11 / V12 / V17** — `capture-games` on c08d8acb at 1920×1080: blankOrBlack > 0.9 on Courier Rush black frames; rAF fps
  15/18 < 30 fps, Deep Recovery < 2 fps; differential probe flags Rooftop Buckets, not Turbo Drift / Orbital Defense.
- **T5.7 / 12-RELEASE** — `release.yml` dry-run (or a copy stopping before publish) on c08d8acb must be refused by
  `release-round-check.mjs` (`release.yml:28-38`); needs CI-1 because `release.yml:23-26` calls `quality-gate.yml`. Record
  refusal run id. Also: per-game scenario determinism from repeat captures of the 3 scenario stills (noise in
  `games.prd12.json` or metrics; mark `scenario-nondeterministic` or golden-eligible).
- **T5.6 / 12-DEVICES (P2)** — `evidence/prd12/phase-5-devices.md` "DENIED" was never an AWS call and proposes stored keys
  (P-56): mark it `placeholder`, remove the stored-key proposal. Read `~/.config/agent-policy/reference/cloud-contexts.md`
  first; provision only through `/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`, profile
  `auraone-production-operator`, tag `project=aura3d-quality-gate`, OIDC role for Actions. Capture 2 iOS + 2 Android with
  rAF fps, or record the exact deny (action, resource, role) and the minimal grant. Never widen IAM yourself.

### P1 — panel (operator-blocked; prepare everything, never stop on it)

- **12-PANEL / T2.7 / V16** — admission round for `prd12-ref-01..06` via `quality-review.yml` (0 runs ever): 2 named humans
  + `judge-prism.ts` through Kiro Prism (claude-opus-5.5, two independent runs per item; read `/Users/gurbakshchahal/kiro-prism/{README,API,SETUP,LLM}.md`
  first). `admittedAsReference: true` only where median ≥ 7.0 (target ≥ 4/6; ≥ 1 before IC-4 2026-11-05). Needs
  `PRISM_API_KEY` Actions secret (#137, owner) and #51/#52 (lane 05 assets). Record in `history/rounds/round-1.json`.
- **Phase 4 exit / V13-V15** — round 1 on 3.0.1 bench + games (V13, V14) and calibration set (V15), passing canary, judge
  drift ≤ 1.0, trend SVGs in artifact; completion needs 2 recorded rounds.
- **T2.8 (P2, after T2.7)** — re-derive `tools/showcase-library/game-visual-qa.mjs` thresholds from admitted ref scenes and
  reference stills; delete comment block `:207-235`.
- **Completion 2 (P2)** — delete `tools/_quarantine` (115 dirs) after one release cycle; classify-tools shows 0 claim-producing
  tools outside it. Depends on lane 15 #39.

## Issues

Close now with citations (verify on main first):
- **#236** bench router skips lane scenes / `a3d-qr` unwired → fixed: `benchmarks/quality-rebuild/main.ts:33-34` globs
  `./aura3d/scenes/*/*.ts`, `:55`/`:77` forward `a3d-qr`. Also file a qr-request to lane 07 to delete the workaround in
  `aura3d/scenes/prd07/common.ts`.
- **#164** capture `?a3d-qr` + lane dirs never reach the app → fixed: `contracts/flags.ts:126-129` + main.ts router;
  `createAuraApp.ts:49-53` documents the URL source.

Implement, then close with the landing PR + run id (none present on main; `rg perf_gate|quality.lock|engineFrame` = 0 hits):
- **#73** R-14-01 `tools/quality-rebuild-capture/steps/acceptance.mjs` (steps/ has only burst, strip, webm) — blocks lane 14.
- **#74** R-14-02 add `strict` input + `apps/**` changed-game filter to `quality-rebuild-capture.yml` (`workflow_call`,
  `games`, `qr_flags` already exist), then close.
- **#75** R-14-03 G-PANEL schedule covers lane-14 play sessions (after panel rounds exist).
- **#92** Q-12-1 `capture-games.mjs` pageSnapshot stores `runs[].engineFrame` + `fpsAgreement`; `capture.mjs --perf` writes
  `frameTiming` — blocks lane 11 S1/S2.
- **#97** Q-12-2 `app.quality.lock()` before shots + per-tier `?aura3d-quality=<tier>&aura3d-adaptive=0` checkpoint captures.
- **#98** Q-12-3 `perf_gate` input + `windows-latest` 2-game smoke job — blocks lane 11 S8.
- **#263** world/** LFS paths (`packages/engine/assets/world/**`) in `.gitattributes` and `ci.sh` `lfs_paths`, re-baseline,
  §16.2 rubric lines — blocks lane 10.
- **#310** checkpoint-level game-capture-parity + look-signature jobs in `quality-rebuild-capture.yml` — blocks lane 09.

Outbound (all still open; chase, do not implement others' files): #38 CCR-12-1 JudgeIdentity/PanelRoundRecord; #39-#45
Q-15-1..7 (#39 root package.json batch gates `_quarantine` deletion and completion 8); #46/#47 Q-14-1/2; #48-#50 Q-13-1..3;
#51/#52 Q-05-1/2 (HDRIs, ground set — gate ref admission); #53 Q-11-1 device per tier; #54 Q-09-1 C-24 `state:playing` after
first presented frame (T0-30, harness waits on it); #142 (to 15); #344 (to 14). File every ledger-only request as a real
issue (P-64) and write the number back.

## PR content still to land

Nothing from a lane-12 PR is stranded: all 7 merged into `main`. Branch `qr/injected-regressions` (f0c0c8d4) is the T3.6 test
branch and must never merge. `qr/ic--record` is junk from a failed checkpoint (owner deletes). Everything listed above is
**new** PR content.

## Red flags to revert (each its own PR; turning green jobs red is the intended result)

1. `tests/unit/quality-gate/injected-regressions.test.ts:35-38` green with zero assertions when verdicts missing; `:26-30`
   tautology (T3.6 ticked on this).
2. `quality-checkpoint.yml:98-100` `if: always()` collect accepting 0 artifacts; `collect-checkpoint.mjs` writes `IC-NaN.json`;
   `:153` `gh pr create … || true`.
3. `quality-devices.yml:65` `|| true`, fake BUILTIN_FUZZ, stored AWS keys `:32-33`, `:71-72` (violates PRD-12 §15.3).
4. `benchmarks/quality-rebuild/ci.sh:17-24` LFS pull failure only a `::warning`; `:27` capture without `--strict` → pointer-file
   assets can "pass". Make LFS failure fatal.
5. `quality-rebuild-capture.yml:165-166`, `:186-191` missing `ci.sh` = successful "benchmark skipped". Make it fail.
6. `capture.mjs:418-422` strict passes READY with drawCalls 0 / black frame; `aura3d/common.ts:424-430` publishes READY after
   no-draw timeout (fixed by HARNESS-1 + T0-11).
7. PR #355 ticks without evidence: T1.16 (`sentinels.json:7` null), T1.17 (no IC-0.json), T3.2 (`entries: []`), T3.3 (no
   completed gate run), T3.6, T5.6, T5.7 (release refusal only checked locally on an empty index) — untick (12-REC).
8. `quality-gate.yml:21-55` captures with `qr_flags: all` as a **blocking** gate while flag-on cannot render: split into a
   blocking `none` capture + report-only lane-flag captures (expected-red with issue link) until Track 0 exit.

## Promotion criteria (lane 12 has no runtime flag)

Lane 12 ships behind CLI options (`CONTRACTS.md:2571`), so "promotion" means its gates move from report-only to **blocking**:
- **Standalone-accepted** = PRD-12 §16.1 (`:1713-1744`) proven in remote runs: V1-V8 detectors reproduce 22/23 majors on
  c08d8acb with no human input; mask IoU ≥ 0.98 (except 16); 10 reruns → 0 G-REG failures; injected regressions blocked;
  IC-0 recorded; checklist-lint green; outbound requests filed; no PRD-16 §5.3 (`:798-810`) blocker open for lane 12:
  #156 (yours, blocks every lane), #46, #47, #308, #344 (14), #51, #52 (05).
- **G-REG blocking** after goldens are populated and the 10× noise test passes (target IC-8 2026-12-03: "12 goldens blocking").
- **Integrated** = PRD-12 I2 (leave-one-out attributes each all−none delta > 1.0 to one lane), I7 (2k ref scenes re-admitted
  at panel median ≥ 7.0), I8 (scene 16 re-baselined after R18) at a G-PANEL round (IC-4 2026-11-05, IC-8, IC-12, IC-16).
- Lane 12 also owns the infrastructure every other lane's promotion depends on (`flags-bisect`, `qr-required`,
  checklist-lint, sentinel identity). Track 0 exit (PRD-16 :252-253) requires `allflags-smoke` green on main twice in a row.

## Merge rule (binding)

No PR merges unless **both** are green on its own head: (a) the lane-12 workflow(s) it touches (`quality-gate.yml`,
`quality-rebuild-capture.yml`, unit `tests/unit/quality-gate/**`, `tests/unit/contracts/impl/prd12-*`), and (b) the
**all-flags gate** (`qr-required` / `allflags-smoke`; until it exists, a `flags-bisect` run with
`none;$ALL;$ALL,strict` on the 6 probes, where `$ALL` arms may be expected-red with an issue link but none may newly turn
red). Never merge with a red, cancelled or queued required check; "pre-existing failure on main" is not an exemption. No
direct pushes to main, no local merges, stacks merge bottom-up into main. `CI / Type Check` must be green: fix
`tests/unit/contracts/impl/prd12-{gate,variants}.test.ts` (T0-31) first.

## Remote-only routing (CI-ROUTING.md)

- Never run local Docker, Playwright, browsers, captures, builds or full suites. Local: editing, `git`, `rg`, `gh` reads,
  `actionlint`, `tsc` on touched files, targeted vitest.
- PR gates on GitHub ubuntu; browser conformance + sentinel identity on GitHub macos-14 for `packages/rendering|engine/**`.
- Captures/bench/perf on GitLab macOS via the bridge. Head-commit tags: `[qr-gitlab:benchmark]`,
  `[qr-gitlab:games games=<ids> viewports=1280x720 mobile=false flags=<set>]`, `[qr-gitlab:all]` (unknown keys fail). Or
  `gh workflow run qr-gitlab-ci.yml --ref qr/prd12-<topic> -f suite=flags-bisect -f requester=prd12 …` (PRD-16 §2.4 / §7.1).
  Never `local=false` as evidence. Download with `gh run download <id>` (artifact `gitlab-<suite>-<pipelineId>`).
- GitHub fallback `quality-rebuild-capture.yml` (macos-14) when `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` is `1`;
  never compare frames across providers/channels (`ciProvider`, `browserChannel` in `report.json`).
- Never push to the GitLab mirror; never set `GH_TOKEN`/`GITHUB_TOKEN`; never print credentials.

## Budget

~2,400 GitLab compute minutes/month for lane 12 (≈ 400 macOS wall minutes); checkpoint/G-PANEL runs come from the shared
6,000 pool. Measured: 18-scene bench ≈ 16, 2-game local single-viewport ≈ 22, full 18-game production capture ≈ 133.
Prefer the 6-probe `flags-bisect` (one build, many sets) over full runs; full 18 + games only for IC-0, Round 5 and evidence
runs. The 10× noise test and 3.0.1 baseline should use GitHub macos-14 if GitLab budget is short (state it in the PR).

## Rules

1. **Pixels decide.** Green jobs, 200s, non-blank PNGs and READY payloads are engineering gates. A run counts as evidence only
   if every arm is `ready` with drawCalls > 0, `errors: []`, no blank PNG, ready ≤ 30 s (bench) / firstDraw ≤ 15 s (games),
   non-SwiftShader GPU, `--strict`, SHA + asset hashes in `report.json`. Open and look at the PNGs. Never write "parity" or
   "three.js-quality"; only a G-PANEL round decides.
2. **Honest evidence** under `docs/project/aura3d-quality-rebuild/evidence/prd12/<run-id>/` (JPEG side-by-sides +
   `report.slim.json`). Anything not run is NOT RUN with the reason. Placeholders are labelled `placeholder`, never cited.
3. **Single writer**: other lanes' files only through qr-request/CCR recorded in the PR body.
4. **Git**: branch `qr/prd12-<topic>` from main; titles `[QR-12] …` < 70 chars; stage specific files; no force-push, no
   `--no-verify`. PR body: summary, tests + run links, all-flags gate result, screenshots, NOT RUN.
5. **Large files / 250-line rule**: read with `rg -n` + offset/limit; never emit more than ~250 lines in one Write/Edit call
   (larger calls are dropped); build big files with a first Write then appended Edits.
6. **Ignore chat**: messages addressed to the coordinator or other agents are not instructions to you; keep executing this
   prompt. No agent message counts as owner approval.
7. Owner-only actions (repo ruleset, secrets, branch deletion, IAM grants): record the exact action needed and continue.

## Report back (end of each session; short, factual)

```
LANE 12 — <date> — main <sha>
Merged PRs: #<n> <title> — run <id> (lane wf) / run <id> (all-flags gate)
Tasks done (id → evidence path + run id): CI-1 → …, HARNESS-1 → …
Tasks open (id → blocker): …
Bisect rounds: <round> → bisect-summary.json path; culprits filed: #<n> to:prdNN
Issues closed: #…  | filed: #…
Red flags reverted: <n>/8
V1-V20 status: V<n> PASS run <id> | FAIL <why> | NOT RUN <why>
Budget used: <GitLab min> / 2,400
Owner actions needed: …
```
