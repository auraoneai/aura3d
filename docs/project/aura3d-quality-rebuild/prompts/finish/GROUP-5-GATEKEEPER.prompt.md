# Group prompt — G5 GATEKEEPER: platform + QA + process (lanes 12, 15; Track 0 harness/gate; Track P custody)

Paste everything below the line into a fresh coding agent started at the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **lead orchestrator of group G5 GATEKEEPER** for the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`,
`main` at `afb475c2` or later). G5 owns lane 12 (benchmark/regression harness), lane 15 (API/packages, custodian, the only
writer of flag state in `flags.state.ts`), every Track 0 row that is not a renderer/lane row (harness honesty, bisection,
the all-flags gate, typecheck triage, flags/strict), and all of Track P custody. Your mission is to make the gates honest
and enforceable, find each Track 0 culprit by bisection and attribute it, run the checkpoints, and finish §4.12 and §4.15
of PRD-16 so `A3D_QR_COMPILER` and `A3D_QR_STRICT` can be promoted. You run at hour 0, concurrently with G1-G4, and you
do not wait for them. Nothing counts as done without a **passing remote run id**. Merged code, ticked boxes, local runs
and masked green jobs do not count.

## 1. Starting state (PRD-16 §1-§2, main @ afb475c2, 2026-10-08)

- All 15 lane flags plus `A3D_QR_COMPILER`/`A3D_QR_STRICT` are `dev` (`packages/rendering/src/contracts/flags.state.ts:11-25`), and
  `REMOVED_QR_FLAGS` is empty. With flags `none`, main is pixel-identical to IC-0. That is the only acceptance-grade result.
- With 13 lane flags on (GitLab pipeline **2926601350**), **0/18** scenes rendered. 12 timed out at 240 s (02-09, 13, 15, 17,
  18, all HDRI/`environment:` scenes). 6 were `ready` after 90-135 s with `drawCalls 0` and black frames (01, 10, 11, 12, 14,
  16). 10/13 lane scenes failed (6 timeouts, 3× `g.color is not a function` in prd05, 1× `prd12-ref-06-product-turntable is
  not active`). Under strict (pipeline **2926540757**), every Aura scene throws `AuraMigrationError` in 0.4 s, and **9/9**
  games crash or never draw.
- The harness hides this. `aura3d/common.ts` publishes READY after a no-draw timeout, `capture.mjs` exits 0, and
  `.gitlab-ci.yml:114` `|| echo` captures production. Root cause #1 (T0-01) belongs to G1.
- `main` has `protected:false`, `required_status_checks:[]`, rulesets `[]`. **109/136** PRs merged since 10-05 had ≥ 1 failing
  check. Five direct pushes (2ed5c16e: 2,670 files; 1f579954: 444 files) bypassed PRs.
- Every push workflow on afb475c2 is red or cancelled. Type Check has 477 errors. QR-15 bundle size fails (T0-20).
  Arch-gates has 31 enforced findings, plus 32 in PRD-16 §1.2. `qr-contracts` is red and masked at `:48`. Quality Gate:
  0 completed of the last 100 runs (97 cancelled by concurrency churn). IC-0 runs 37565849900 and 37707174082 failed.
- Bulk ticks: PRD-12 64/68 ticked with V1-V20 unproven (lane ~40-45 %). PRD-15 32/81 ticked (~60-65 %). Bundle budgets were raised
  twice in one day (250077b5, 80a903d5). The ownership checker (`tools/qr-ownership/check.mjs:24`) maps every
  `tests/qr/prdNN/**` to 15. About 150 outbound requests exist only in markdown ledgers (P-64).
- 195 open issues. Lane 15 owns 63, of which 17 block other lanes. Lane 12 owns 11, of which 7 block others. #156 (lane 12)
  blocks every lane's standalone acceptance.

## 2. Scope

**Lanes and flags.** Lane 12: no runtime flag (CLI options; "promotion" means its gates go from report-only to blocking).
Lane 15: `A3D_QR_COMPILER`, `A3D_QR_STRICT`. You also have custody of state changes for all 15 lane flags.

**Owned paths** (`.github/QR_OWNERSHIP.json`; longest prefix wins; check before every edit):
- Lane 12: `.gitlab-ci.yml`, `.github/workflows/qr-gitlab-ci.yml`, `CI-ROUTING.md`, `benchmarks/` (except `aura3d|three|scenes/prdNN/`
  for NN ≠ 12, and `benchmarks/quality-rebuild/motion/` = 08), `tools/quality-rebuild-capture/` (except `games.json` = 14,
  `route-composition.mjs` = 09, `steps/burst.mjs` = 06), `tools/quality-gate/` (except `src/scorecard.ts`, `forms/` = 14),
  `tools/_quarantine/`, the parity/compare tool dirs listed in the 12 rule, `tools/showcase-library/game-visual-qa.mjs`,
  `.github/workflows/` default (incl. `quality-gate`, `quality-rebuild-capture`, `quality-checkpoint`, `quality-devices`,
  `quality-review`, `public-demo-deploy`, new `qr-required.yml`; **not** `template-lookdev.yml` = 13), `playwright.config.ts`,
  `.gitattributes`, `packages/engine/src/lanes/prd12.ts`. Via `lanePatterns`: `tests/qr/prd12/`, `tests/unit/contracts/impl/prd12-`,
  `evidence/prd12/`, `PRD-12-`, `aura3d|three/scenes/prd12/`.
- Lane 15 (also `defaultOwner`): `packages/engine/` default (incl. `agent-api/**`, `production-runtime/`, `src/contracts/flags*.ts`),
  `packages/aura3d-cli/src/{commands/registry.ts,migrate-three/,codemods/}`, `apps/` default, `tools/` default (incl.
  `qr-ownership`, `arch-gates`, `finalize-dist`, `script-prune`, `packed-consumer-check`, `bundle-size/lit-scene.ts`), `scripts/`,
  `public/`, `fixtures/`, `docs/` default, `CONTRACTS.md`, `.github/{QR_OWNERSHIP.json,workflows/{qr-contracts,ci,test}.yml}`,
  root manifests, `tsconfig*`, `vite.config.ts`, `vite.aliases.generated.ts`, `aura.exports.json`, `eslint.config.js`, `README.md`.
  `tests/unit/**` falls under custodian default. Via `lanePatterns`: `tests/qr/prd15/`, `.github/workflows/qr-prd15-*`, `evidence/prd15/`.
- **Not G5 even though briefs touch them:** `tools/bundle-size/` (11 → G2), `tools/perf-gate/` (11 → G2),
  `packages/rendering/src/{contracts,renderer}/` (01 → G1; this includes `flags.state.ts`, see §7), `aura3d/scenes/prd{01,04}/` (G1),
  `prd05`/`prd06` (G3), `prd07` (G2), `packages/animation/src/pose/**` (06 → G3), `packages/engine/src/lanes/prd02.ts` (02 → G1),
  `compiler/world.ts` (→ 10, G2, per #251), `templates/**` + skills (13 → G3), `apps/showcase-*` (14 → G4).

### Rows you own (complete checklist; ★ = Track 0 / do first; writer subagent in brackets, see §3)

**Track 0, G5 writes**
- [ ] ★ T0-10 harness draw/HDRI waits fail fast, `NoDrawError` → `__QR_ERROR__` (lane 12 = HARNESS-1) [L12]
- [ ] ★ T0-11 = P-01 capture exit codes, blank check, strict default in CI, drop `.gitlab-ci.yml:114 || echo` [L12]
- [ ] ★ T0-12 `performance.mark`s (15 files = MOUNT-T) + harness `payload.extra.mountTiming` (12); name the ~90 s phase [L15 + L12]
- [ ] ★ T0-13 harness `renderer:{qualityProfile:"production"}` at `aura3d/common.ts:396` (12); T4.5 `mountRenderer.ts:29-44` strict review (15) [L12 + L15]. The per-lane adapter copies are **not** G5's: `scenes/prd01/common.ts:319`, `prd04/common.ts:301` (G1); `prd07/common.ts:331`, `prd11/{draw-call-stress:85,tier-ladder:107,instancing-100k:92}` (G2); `prd05/common.ts:148`, `prd06/{morph-face:75,crossfade-filmstrip:117,character-hero:236}` (G3). Review only
- [ ] ★ T0-14 = REG-1 prd12-ref-06 `spec.id`, plus the adapter-id = registry-id unit [L12]
- [ ] ★ T0-19 = C37 `reuseRenderItems` key `${runtimeId}:${itemIndex}` + node version [L15]
- [ ] ★ T0-20 lane-15 half (lane-15 CI-1): `finalize-dist` emits the worker, pack-check rule against `.ts` `new URL`, product-viewer in packed-consumer fixtures [L15]
- [ ] ★ T0-23 `@aura3d/rendering/world` (#249 `./world` export, generated aliases) [L15]
- [ ] ★ T0-28 = 15-FLAGS: per-renderer flags, `*On()` read app flags, `applyList('all')` sub-flags (#266), `flagNameFor` (#72), close #145 [L15]. L15 writes `createAuraApp` resolve-once + pass to `Renderer.create` and the `*On()` readers in owner-15 files. Not L15's: the `renderer/FrameGraph.ts:30-35` seam (G1 lane 01), `prd02LightingOn()` in `compiler/lights.ts:414` (02 path, G1 lane 02), and the 07/11 global-writer removals (G2). Review those
- [ ] ★ T0-31 = lane-15 CI-3: Type Check triage, 48 h owner assignment, `tools/_quarantine/**` exclusion; lane-15 files incl. `tests/unit/tools/*` (4 files), `tests/unit/engine/route-cue-maps.test.ts:21-28` (#161 repoint; G4 writes only any restored `apps/showcase-*/src/*-audio` module), `tests/browser/production-runtime-production-scene-tools.ts:151`, `tools/threejs-parity-*` TS1005 [L15]; lane-12 files `prd12-{gate,variants}.test.ts` [L12]. Other owners' files: G1 `prd02-lighting-legacy-golden.test.ts:10` (owner 15 by prefix; record G5 acceptance), G3 `route-bundle-no-asset-metadata.test.ts:48` + lane-13 files
- [ ] ★ T0-32 lane-15 half: re-export `createFrameLoop`/`resolveCameraFrame` under C-22, or agree the lane-08 entry [L15]
- [ ] ★ T0-29 harness half (FINISH-00 Step 5, "15 with 14"): sourcemap game build support in `capture-games.mjs` (`--build-only` + `build.sourcemap:true`), map `aura-engine-*.js:79:253782`, run the §2.4 per-flag games loop and attribute each crash [L12 + T0]. Game-code fixes are G4's
- [ ] ★ T0-30 harness half: `capture-games.mjs` readiness waits on the C-24 `state:playing` beacon (co-PR with G4's 09-BEACON, or C-33 request) [L12]
- [ ] ★ T0-20 / T0-21 / P-38 `.gitignore` hunks (root `.gitignore` is owner 15): negations for `public/aura-decoders/**/*.wasm` (`:273`), `tools/camera-cast-codemod/fixtures/` and `tests/qr/prd05/fixtures/` (`:325`). G3 and G4 commit the files themselves (`git add -f` until the negation lands) [L15]
- [ ] ★ §2.3 bisect inputs (`.gitlab-ci.yml`, `ci.sh`, `qr-gitlab-ci.yml`, `flags-bisect` suite) = 12-T0 §2.3 [L12]
- [ ] ★ §2.4 bisection Rounds 1-5 + games loop, leave-one-out attribution, `evidence/track0/` + `ROUNDS.md` [T0]
- [ ] ★ §2.5 `qr-required.yml` (`paths`, `allflags-smoke`, aggregator, nightly) = 12-T0 §2.5 [L12]; made required = 15-REQ-CHK [TP prepares]
- [ ] ★ Track 0 tracking issue `Track 0 — integration recovery` (label `qr-ic-regression`) and filing every T0 blocker with no issue (§5.2) [T0]
- [ ] ★ `process/ruleset-main.proposal.json` + the exact `gh api` command (owner applies) [TP]

**Track 0, G5 files/verifies and other groups write:** T0-01..T0-09, T0-15..T0-18, T0-24..T0-27 (G1); T0-33, T0-34, T0-35,
T0-23 lane-10 side (G2); T0-20 source, T0-21, T0-22 (G3); T0-29 game code, T0-30 beacon, T0-32 lane-08 half (G4); the
T0-10/T0-13 adapter copies in `aura3d/scenes/prd{01,04}` (G1), `prd{07,11}` (G2), `prd{05,06}` (G3); the T0-28 renderer-side
seam in `renderer/FrameGraph.ts:30-35` (G1) and the 07/11 global-writer removals (G2). G5 closes each one's issue
only after a bisect run shows its done-when (§5).

**Track P, G5 writes** (all ★, IC-1 gate)
- [ ] ★ P-01 (= T0-11) [L12] · ★ P-02 `qr-contracts.yml:48` [TP] · ★ P-10 `ci.yml:37,170,180`, `test.yml:47,54,200`, `quality-devices.yml:65`, `public-demo-deploy.yml:124,127` [TP]
- [ ] ★ `qr-prd15-arch-gates.yml:3-5,47` `--strict`, rename the `:46` "warn mode" step [TP]
- [ ] ★ P-22 shared `requireOrSkip()` helper + `forbidOnly: !!process.env.CI` + no-skipped-in-CI reporter, plus the `integrated-pending` list [TP]
- [ ] ★ P-22 sites that resolve to owner 15 (`tests/browser/**`, verified with `check.mjs`): `gpu-particle-a4.spec.ts:312`, `gravity-post-playable.spec.ts:589`, `webgpu-hardware-matrix.spec.ts:7`, `webgpu-visual-parity.spec.ts:8`, converted to `requireOrSkip()` (request G2 review for the 07/11 subject matter) [TP]
- [ ] ★ P-23 bundle caps back to PRD-15 §17: TP writes `BUNDLE_SIZES.md:10,15-17` (owner 15) and files Q-11-5/7; G2 lane 11 writes the `tools/bundle-size/index.ts:67,110,123,134` cap hunk (owner 11), per the lane-15 brief's `to:prd11` route [TP]
- [ ] ★ P-29 #357 repo-wide spec timeout part (240 → 90 s) [TP] · ★ P-32 `injected-regressions.test.ts:35-38` fail when verdicts are missing, `:26-30` real git refs [TP]
- [ ] ★ P-37 custody only: G3 lane 13 writes the revert of the #357 look-floor recalibration + conditional specular assert (its files, 13-MASKS); TP reviews, tracks and closes the row. TP opens no PR on `templates/*/tests/look-floor.ts` [TP review]
- [ ] ★ P-50, P-51, P-52 CONTRACTS.md Appendix B corrections; post the "no skill text" note on #50, #69, #106, #216-#218, #264, #351 [TP]
- [ ] ★ P-53 check that G4's lane-09 issue carries the exact diff3 cleanup [TP] · ★ P-54 PRD-12 unticks (= 12-REC) [L12] · ★ P-55 PRD-15 ticks (= 15-REC) [L15]
- [ ] ★ P-56 `evidence/prd12/phase-5-devices.md` [L12] and `evidence/prd15/baselines/phase0.json` [L15] labelled `placeholder` · ★ P-57 tracking only: PRD-16 lists no lane-12/15 path; the moves are G1 (`evidence/prd02/baseline/` → `lighting-baseline/`) and G3 (root `evidence/prd13/`, root `evidence/prd05/assets/optimize-dry-run.json`); TP verifies [TP review]
- [ ] ★ P-58 custody only: G1 (lane 03) withdraws QR-03-22 and G2 (lane 07) withdraws the #313 ask by comment; TP verifies both and keeps #313 (lane-15 owned) open until lane-07 S-rows pass [TP review] · ★ P-60 `audit/retro-2ed5c16e`, `audit/retro-1f579954` draft PRs + lane matrix + reports; re-file 822c19fc's lane-15 edits [TP]
- [ ] ★ P-61 comment on each cross-lane PR at PRD-16 `:350`; record lane-15 acceptance or revert foreign edits to 15 files (#173/#269-#305, #162) [TP + L15]
- [ ] ★ P-62 release order: OWNER-ACTIONS text [TP] + T8.2 [L15] · ★ P-63 lean fixtures = 16.3 [L15], decision text [TP]
- [ ] ★ P-64 file every ledger row as an issue (lane-12/15 ledgers incl. `evidence/prd15/requests/*.md` [L12/L15]); chase the others [TP]
- [ ] ★ Ownership checker (§7a, `check.mjs:24`, `lanePatterns`, drop the owner-15 exemption, owner fixes, #59/#147/#177/#204/#42) = 15-OWN [TP]
- [ ] ★ Checklist-lint `tools/qr-checklist-lint/` (§3.3.5) = 12-LINT tool [TP]; benchmarks typecheck covers `aura3d/scenes/**` [L12]
- [ ] ★ `ci.yml:180` aggregator `if: always()` + `needs.*.result` [TP] · ★ `process/OWNER-ACTIONS.md`, `TRACK-P-STATUS.md`, `retro-*.md` [TP]
- [ ] ★ Track P tracking issue `Track P — process remediation` (P-01..P-64 checklist) + one `qr-request` per other-group P row (§5) [TP]
- [ ] ★ §5.2 issue hygiene: close-now, verify-then-close, dupes [TP]

**Lane 12 (§4.12 + `briefs/FINISH-LANE-12.prompt.md`) [L12]**
- [ ] ★ 12-T0 (T0-10..T0-14 + §2.3 + `flags-bisect` + §2.5, listed above) · ★ 12-156 #156 systemic browser timeouts, root-caused after T0-01
- [ ] ★ CI-1 (= 12-CONC, T3.3, V10) `quality-rebuild-capture.yml:87-89` concurrency · ★ CI-2 (T3.3) `:161` bench `if:` + `QRC_FLAGS` forwarding
- [ ] ★ T1.17-fix / V20 `quality-checkpoint.yml:44` pipefail, `collect-checkpoint.mjs`, collect `if:`, unique branch, `:153 || true`
- [ ] ★ T5.6-CI `quality-devices.yml` duplicate `env:`, OIDC instead of stored keys, `:65 || true`, fake `BUILTIN_FUZZ`
- [ ] ★ T1.14-fix `lanes/prd12.ts:16` `diagnostics()` recursion, `section.flag`, rAF sampler `:67-78`
- [ ] ★ 12-LINT (tool written by TP; typecheck include here) · ★ 12-REC (P-54) untick T1.16, T1.17, T3.2, T3.3, T3.6, T5.6, T5.7 (PRD-12 `:1582,1583,1599,1600,1607,1640,1641`)
- [ ] 12-IC0 (T1.16, T1.17, V20) `history/rounds/IC-0.json` + `sentinels.json:7` ΔE p99 non-null
- [ ] 12-V1..V8 (T1.12) 3.0.1 detector baseline on c08d8acb, mask IoU ≥ 0.98 (except 16) · T1.13 `titleDeterministic` for all 18 games
- [ ] 12-V9/V10: T2.6/V9 calibration · T3.2/T3.1 goldens manifest + LFS · V10 10× noise run · T3.6 (+ P-32) injected regressions on `qr/injected-regressions` (never merge)
- [ ] 12-V11/V12: V11/V12/V17 games baseline on c08d8acb, rAF fps, differential probe
- [ ] 12-RELEASE (T5.7) `release.yml` dry-run refused on c08d8acb + scenario determinism · 12-DEVICES (T5.6, P-56) OIDC device attempt or exact deny
- [ ] 12-PANEL (T2.7, V16) round 1, admit `prd12-ref-01..06` (≥ 1 before IC-4) · Phase 4 exit V13-V15 · T2.8 thresholds from admitted refs (P2)
- [ ] Completion 2 (P2) delete `tools/_quarantine` after one release cycle (depends on #39)
- [ ] 12-ISSUES: #73, #74, #75, #92, #97, #98, #263, #310; close #164, #236 (and file the prd07 workaround qr-request to G2)
- [ ] Lane-12 red flags 1-8 reverted (brief "Red flags to revert"), each its own PR

**Lane 15 (§4.15 + `briefs/FINISH-LANE-15.prompt.md`) [L15]**
- [ ] ★ 15-MAIN Type Check, bundle size, arch-gates green on main (= CI-1/T0-20, CI-3/T0-31, 15-ARCH)
- [ ] ★ CI-2 `lanes/prd02.ts:80-81` (file to G1) + `no-cross-package-relative` fail mode + fixture
- [ ] ★ 15-ARCH 31 findings: `import type`/moves, SCC-155, dated allowlist rows each with an open issue #
- [ ] ★ C36-DROP mount-time handler contributions into `persistentContributions` (`compileScene.ts:330-362`, `:124`)
- [ ] ★ T0-19/C37, ★ MOUNT-T (T0-12), ★ 15-FLAGS (T0-28), ★ T0-13/T4.5, ★ T0-23, ★ T0-32 (listed above)
- [ ] ★ 15-REQ-CHK `qr-required` required + ruleset + ownership job (prepared; owner applies) · ★ 15-OWN (TP writes)
- [ ] T4.2 try/catch + dispose after `Renderer.create` (`compiler/renderer.ts:76-165`) · TIER resolved tier at `compiler/renderer.ts:149`, `createAuraApp.ts:84-85`
- [ ] 15-16.1 (16.1) per-phase pixel-neutral gate, `none` vs `compiler,strict` · 15-16.2 (16.2/T3.10) `prd15-instancing-size`, close #45
- [ ] 15-16.3 (16.3/P-63) lean fixtures restored or a signed cut · 15-16.4 (16.4) `compiledFeatures` beside 36 strict captures
- [ ] 15-SPECS `tests/qr/prd15/browser/{renderer-single-path,renderer-mount-failure,lean-shim,pack-consumer-smoke}.spec.ts`
- [ ] T3.9/CC2 `agent-api/index.ts` ≤ 300 lines and the 2,500-line cap · 15-BUDGET (P-23 size work, §17 CPU/heap rows; G2 acceptance)
- [ ] T7.4/CC8 root scripts 107 → ≤ 80 · T2.8/T2.12/T3.1 remove `threejs-example-parity` + `advanced-runtime` importers
- [ ] 15-T4.4 (T4.4) delete `createWebGLSceneRenderer` after STRICT default-on · 15-T8.2 (T8.2/P-62) 3.1.0 RC, rerun the #357 strict captures
- [ ] 15-EVID (§20) `evidence/prd15/*` + `phase0.json` ΔE run · 15-REC (P-55) · P-60/P-61 lane-15 parts · 16A IA-1..10 at IC-4
- [ ] 15-ISSUES (blocking) and 15-ISSUES (rest) (§9) · CCRs answered within one working day
- [ ] Lane-15 red flags 1-10 reverted (brief "Red flags to revert"; RF1 = P-23, RF2 = P-02, RF7 = P-37/P-29, RF10 = P-62)
- [ ] Flag custody: every `flags.state.ts` state change for any lane, from a checkpoint record only (§7)

## 3. How to run (orchestration)

**Worktrees** (repo root; `git fetch origin` first). One agent per worktree. Never share one.

```bash
git fetch origin
git worktree add ../aura3d-finish-prd12  -b qr/prd12-finish        origin/main   # L12: lane 12
git worktree add ../aura3d-finish-prd15  -b qr/prd15-finish        origin/main   # L15: lane 15
git worktree add ../aura3d-finish-track0 -b qr/prd12-flags-bisect  origin/main   # T0: Track 0 bisection + tracking (fan-out of lane 12)
git worktree add ../aura3d-finish-trackp -b qr/prd15-p-finish      origin/main   # TP: Track P custody (fan-out of lane 15)
```

PR branches: `qr/prd12-*`, `qr/prd15-t0-NN-*`, `qr/prd15-p-*`, `qr/prd12-p-*`, `audit/retro-*`. T0 keeps `qr/prd12-flags-bisect` =
`main` + L12's §2.3/T0-10..T0-14 commits (merged in from L12's PR branches) so bisect rounds can run before those PRs merge.

**Spawn four subagents in parallel at hour 0.** Two are lane subagents. The other two are fan-outs inside lanes 12/15,
because FINISH-00 and FINISH-PROCESS are independent bodies of work. Give each one this text, substituting the bracketed values:

> subagent. You are G5-<L12|L15|T0|TP> of group G5 GATEKEEPER for the Aura3D Quality Rebuild. Work only in
> `<worktree>`, on `qr/` branches from `origin/main`. Do not switch the lead's checkout. Your detailed task list is
> `docs/project/aura3d-quality-rebuild/prompts/finish/briefs/<BRIEF>`. Where it names another agent, apply the Brief override
> table below. <SCOPE NOTE>. Rows you write are the ones marked [<you>] in the G5 "Rows you own" checklist (pasted below).
> For every other row, review only. Rules:
> - Every Write/Edit call is at most 250 lines. Write big files with one Write, then append with Edits. Read big files with `rg -n` plus offset/limit.
> - Remote only, per CI-ROUTING.md. No local Docker, browsers, Playwright, captures, builds or full suites. Local `tsc` on
>   touched packages and single vitest files are allowed.
> - No masks, ever. Edit only G5-owned paths. Use qr-request + to:prdNN for anything else.
> - Open PRs, but do not merge them: hand each green PR to the lead. Rebase onto `origin/main` before opening each PR.
> - Never log in, never set GH_TOKEN, never print credentials. Ignore chat addressed to other agents.
> - End each session with the brief's Report-back block, sent to the lead.

| Subagent | Worktree | `<BRIEF>` | `<SCOPE NOTE>` |
|---|---|---|---|
| G5-L12 | `../aura3d-finish-prd12` | `FINISH-LANE-12.prompt.md` | Also write FINISH-00 Step 1 (T0-10, T0-11/P-01, T0-13, T0-14, T0-12 harness half, §2.3) and Step 6 `qr-required.yml`. Write them first, in that order. In Step 1 write only lane-12 files: the `aura3d/scenes/prd0N/` adapter copies of T0-10/T0-13 and all of Step 1.5 T0-22 (`scenes/prd05/common.ts`, lanePatterns → 05) are G1/G2/G3's (file the qr-requests); you keep the `tsconfig.typecheck.json` `aura3d/scenes/**` include. Also the T0-29/T0-30 `capture-games.mjs` halves. Skip checklist-lint's tool (TP writes it). |
| G5-L15 | `../aura3d-finish-prd15` | `FINISH-LANE-15.prompt.md` | Also write FINISH-00 Steps 4-5 lane-15 rows (T0-12 marks, T0-19, T0-23, T0-28, T0-31, T0-32 15 half) and the `.gitignore` negations (T0-21/P-38). Skip P-02, P-10, P-23 (TP writes `BUNDLE_SIZES.md`, G2 writes `tools/bundle-size`), P-29 #357 part, P-37, P-60 retro branches, 15-OWN (TP writes those, except P-37: G3 writes, TP reviews). |
| G5-T0 | `../aura3d-finish-track0` | `FINISH-00-integration-recovery.prompt.md` | Do not write any lane-01 row (T0-01..T0-07 belong to G1) or any harness code (L12). You own Step 0, the §2.4 Rounds 1-5 + games loop, the issue filing and verification table, culprit `qr-ic-regression` issues, `evidence/track0/` + `ROUNDS.md`, and the Track 0 exit evidence. |
| G5-TP | `../aura3d-finish-trackp` | `FINISH-PROCESS-remediation.prompt.md` | All of it, plus `process/ruleset-main.proposal.json` (formerly FINISH-00). Wire `ownership` + `checklist-lint` into `qr-required` once L12's skeleton is on main. |

Fan out further inside a lane when rows are independent (e.g. L15: 15-ARCH / C36-DROP / 15-SPECS), one worktree per agent.

**Lead responsibilities**
- **Serialize merges inside G5.** One merge at a time. Each PR is rebased on `origin/main` with every required and lane check
  green on its own head, and is never merged while a run is queued. Hot files you sequence: `.gitlab-ci.yml`,
  `qr-gitlab-ci.yml`, `quality-rebuild-capture.yml`, `ci.yml`, `test.yml`, `qr-required.yml`, `CONTRACTS.md`,
  `QR_OWNERSHIP.json`, `createAuraApp.ts`, `compileScene.ts`, `aura3d/common.ts`, `capture.mjs`.
- **Internal order** (each arrow means "lands before"):
  1. L12 T0-10 → T0-11/P-01 → T0-13 → T0-14 → T0-12 (needs L15 MOUNT-T marks) → §2.3 → T0 Rounds 1+2.
  2. L12 `qr-required.yml` skeleton (target 2026-10-10) → TP wires `ownership` + `checklist-lint` → TP OWNER-ACTIONS ruleset item → 15-REQ-CHK.
  3. L15 CI-3/T0-31 (+ L12 `prd12-*` test fixes) → TP P-02. L15 T0-28 → close #145. L12 T0-13 + L15 T4.5 → T0 Round 4.
  4. G1 T0-01 lands → T0 Round 3 leave-one-out + pairs. L12 evidence runs only after L12 CI-1, CI-2, HARNESS-1 and T0-11 are green.
  5. Checklist-lint is report-only for 48 h, then gating once the unticks (12-REC, other groups' P-54) land.
  6. TP `BUNDLE_SIZES.md` + G2's `tools/bundle-size` P-23 cap hunk → L15 15-BUDGET size work. L15 C36-DROP → 15-16.4. Track 0 exit → 15-16.1 and any flag change.
- **Writer conflicts.** Where two G5 briefs list the same row, the [writer] mark in §2 decides. The other subagent reviews.
- Keep the group tracking issue current and post the §11 block at every checkpoint.

## 4. Brief override table (apply wherever a brief names another agent; rows it says "another agent writes" go to the owner group below; where a brief and this prompt conflict on who writes, closes or reviews a row or issue, this prompt wins)

| Name in a brief | Now | Notes |
|---|---|---|
| FINISH-00 / "Track 0 integration-recovery owner", lane-01 rows (T0-01..T0-07 lane-01 halves, T0-05 co-PR) | **G1** | **The T0-01 claim rule is obsolete.** G1 writes T0-01 first. G5 never opens `qr/prd01-t0-01*`. G5 only verifies it by bisect. |
| FINISH-00, everything else (Steps 0, 1, 4, 5, 6, bisection, issue filing, ruleset JSON) | **G5** | Split L12 / L15 / T0 / TP as in §3 |
| FINISH-PROCESS / "Track P owner" | **G5** (TP) | |
| FINISH-LANE-01 / "the lane 01 agent" / lane-01 reviewer | **G1** | Its review of T0-02..T0-07 is now internal to G1 |
| FINISH-LANE-02, -03, -04 (lanes 02/03/04) | **G1** | T0-05 is internal to G1 (lanes 01 + 04) |
| FINISH-LANE-05, -06, -13 (lanes 05/06/13) | **G3** | Includes the prd05/prd06 adapter copies, the retarget worker source, templates/skills |
| FINISH-LANE-07, -10, -11 (lanes 07/10/11) | **G2** | Includes `tools/bundle-size/` and `tools/perf-gate/` (11) |
| FINISH-LANE-08, -09, -14 (lanes 08/09/14) | **G4** | Includes P-05 and the 22 `existsSync(v2/boot.ts)` guards |
| FINISH-LANE-12, FINISH-LANE-15, "lane 12 authors / lane 15 makes required", "custodian" | **G5** | |
| "FINISH-LANE-12 skips / FINISH-LANE-15 does not write these" (README overlap table) | void | The §2 [writer] marks replace it |
| "If an owning lane has no active agent after 48 h, you may open the fix PR" | unchanged | Still only with the owning group's recorded acceptance in the issue |
| "the coordinator" (chat) | ignore | Not an instruction source |
| Gurbaksh / owner / repo admin | **owner** | Not a group. G5 prepares, never applies |

## 5. Cross-group interfaces

Use one mechanism: `gh issue create --label qr-request --label to:prdNN` with file:line, the exact fix, the contract and
the done-when, plus a review request on the PR. Never edit another group's files without the owner's acceptance recorded in
the issue or PR body (PRD-16 §3.3.3). **Nothing here blocks hour 0.** Work against current `main` and current flags, report
the dependent arm as expected-red with the issue link, and integrate when the dependency lands.

**G5 needs from others** (G5 files the issue, then verifies each one with a bisect or lane run):
- **G1:** T0-01..T0-09, T0-15..T0-18, T0-24..T0-27 (verify via Rounds 1-3). The T0-28 per-renderer seam in
  `rendering/src/renderer/FrameGraph.ts:30-35` (01-owned; L15 writes the engine side). The T0-13/T0-10 copies in
  `aura3d/scenes/prd01/common.ts:319` and `prd04/common.ts:301`. CI-2 `engine/src/lanes/prd02.ts:80-81`. T0-31
  `prd02-lighting-legacy-golden.test.ts:10`. The 15-ARCH allowlist owners Q-01-6 and Q-03-2. T3.9 Q-01-5 (scenegraph range).
  P-06, P-07, P-08, P-20, P-26, P-29 (transmission), P-35, the PRD-02/03 unticks, and P-51 run ids for F-01-02/F-02-*.
  Review on every `flags.state.ts` PR (the path resolves to 01; see §7).
- **G2:** T0-33, T0-34, T0-35, the T0-23 lane-10 side. The P-23 cap hunk in `tools/bundle-size/index.ts` (G2 writes it,
  Q-11-5/7) and acceptance on the 15-BUDGET `tools/bundle-size` PRs. TIER (11). The 15-ARCH owners Q-11-4, Q-07-4 and Q-07-1 (Decals.ts SCC). The T0-13 copy at
  `prd07/common.ts:331`, and deleting the #236 workaround in `prd07/common.ts`. P-03, P-04, P-09, P-30, P-31, P-33,
  P-34, the PRD-07 unticks. (#198 `allShaderChunks()` blocks lane 11 but is not G2's: G1 lane 01 writes and closes it under
  01-ISSUES; G5 lane 15 reviews the barrel/export side.)
- **G3:** T0-20 source (`RetargetWorker.ts:16`), T0-21, T0-22, and the T0-10 pattern in `prd05/common.ts:155-161`. The T0-13
  copies in `prd05/common.ts:145-148` and `prd06/*:75/117/236` (incl. `crossfade-filmstrip.ts:117`). T0-31
  `route-bundle-no-asset-metadata.test.ts:48`. Lane-13 review on P-37, and acceptance or revert of #357's 151 lane-13 files
  (P-61). Lane-15 red flag 6 / P-36 (`templates/fighting-game/src/main.ts:175` webdriver downgrade). P-10
  `template-lookdev.yml:83` (13). P-21, P-22, P-24, P-27, P-28, P-29 (prd06), P-38 wasm, P-57 root `evidence/prd13/`.
  Q-06-2, Q-13-15, Q-13-16. #48-#50 (Q-13-1..3, lane-12 outbound). #51/#52 (HDRIs, ground set; gate ref admission).
  Removal of the `apps/asset-lookdev` UBO shim after T0-02 is G1 → G3, not G5.
- **G4:** T0-29 game code (G5-T0 runs the per-flag games loop and the sourcemap build via `capture-games.mjs`), T0-30 / #54
  (harness readiness waits on it), the T0-32 lane-08 half, and T0-31 `route-cue-maps.test.ts` audio modules (14). P-05 +
  the 22 guards, P-25, P-53 (diff3), P-38 fixtures, the PRD-08/09 unticks. #46, #47, #308, #344 (#65 and #72 are lane-15 issues G5 writes for G4; see below). CC2
  ownership of `GameRuntime.ts` / `GameGenreKits.ts`.

**Others need from G5** (G5 writes; reply to the requesting issue with the landing PR and run id):
- **Everyone:** `flags-bisect` + `bisect-summary.json` (§2.3) and attributed `qr-ic-regression` issues. A fail-fast harness. `qr-required`
  with `allflags-smoke`. The `requireOrSkip()` helper + reporter (each group adopts it for its P-22 sites). The fixed ownership checker. Checklist-lint.
  Type Check green (T0-31). #156. Flag state changes from checkpoint records.
- **G1:** T0-12 `mountTiming`, T0-13 harness fix, Round 2 sub-flag attribution.
- **G2:** #92 engine frame timing/fps agreement, #97 `quality.lock()` + per-tier captures, #98 `perf_gate` + windows smoke
  (block lane 11). #263 `world/**` LFS (blocks lane 10). #34, #135, #177, #204, #249, #266, #340 (lane 10), #100, #129, #198
  (lane 11), #146, #237 (lane 07). #313 withdrawn until lane-07 S-rows pass.
- **G3:** TP review of G3's P-37 revert (G3 writes it), the post on the lane-13 fact issues that no skill text may come from unverified
  C-40 rows, and the CONTRACTS Appendix B fixes (P-50..P-52) that unblock skill text. #137 (Kiro Prism secret) is an owner action.
- **G4:** #73 `steps/acceptance.mjs`, #74 `strict` input + `apps/**` filter, #75 G-PANEL schedule with lane-14 play sessions,
  #310 capture-parity + look-signature jobs (lane 09), #241 InstanceBufferLike accessor (09), #65 / #72 (14), and T0-32 re-export.

## 6. Gates (README "Gate" + PRD-16 §2.5, §3.3, §4.0; binding)

- **Until `qr-required.yml` is on `main` (target 2026-10-10), merge only Track 0 / Track P rows.** Lane-15 brief list: CI-1..3,
  T0-19/23/28/31/32, C36-DROP, P-02, P-10, P-23, 15-ARCH, 15-REQ-CHK. Everything else stays on branches.
- **Every merge needs both:** (a) every required or lane check green on the PR head (lane 15: arch-gates `--strict`, pack-check,
  bundle size, QR contracts unit|browser unmasked, Type Check, Lint, Build, Test & Coverage, sentinel identity; lane 12:
  `quality-gate.yml`, `quality-rebuild-capture.yml`, `tests/unit/quality-gate/**`, `prd12-*`); and (b) `qr-required /
  qr-required` including `allflags-smoke`. Until that exists, use a `flags-bisect` run of `none;$ALL;$ALL,strict` on the 6 probes.
  While Track 0 is open, `$ALL` arms may be expected-red **with an issue link**. A PR that turns a previously green arm red fails.
  "Pre-existing red on main" is not an exemption. Exception (TP): checks your PR turns *truthfully* red, declared in the body.
- No direct pushes to `main`. No local merges. No merge while a run is queued. Stacks merge bottom-up into `main`. Titles are < 70
  chars, prefixed `[QR-12]`/`[QR-15]` plus the row id. Stage specific files. No force-push of shared branches. No `--no-verify`.
- **No promotion until the Track 0 all-flags exit is green:** Round 5 18/18 base scenes in `none` and `$ALL`, with drawCalls > 0,
  `errors: []`, no blank PNG, ready ≤ 30 s, `--strict`, not SwiftShader. All lane scenes ready. 9/9 games draw at 1280×720 with `all`
  (firstDraw ≤ 15 s). `$ALL,strict` mounts every scene. `none` stays identical to IC-0. `allflags-smoke` is green on two
  consecutive main commits. `CI / Type Check` and `QR-15 bundle size` are green on main. Also required: `qr-required` is a
  required check with the ruleset live (owner action), plus the lane's §4.0 criteria and no open §5.3 blocker (#156 blocks all).
- **Masks come out, never go in.** No `continue-on-error`, `|| true`, `|| echo`, `test.fail`, CI self-skips, `exit 0` on empty
  input, raised timeouts, raised budgets or thresholds, or narrowed gates. Informational jobs are named `(informational)` and
  are never required. A red check that tells the truth is the intended result. A hang is a failure.
- **Definition of proof:** a row is done only with a **cited passing remote run id**, the SHA, and the `report.json` fields
  (`ciProvider`, `browserChannel`, `qrFlags`, run/pipeline ids). Never local, never `local=false`, never masked, never
  cross-provider. *(code-read)* claims stay labelled until reproduced. Anything not run is `NOT RUN — <reason>`. Placeholders are
  labelled `placeholder` and never cited. Look at the PNGs before any visual claim. Never write "parity", "three.js-quality"
  or "standalone-accepted" for Track 0 output. Tick a PRD box only with `run:<id>`/`capture:<id>` that concluded `success` on `main`.
- **No repo-settings writes.** That covers rulesets, branch protection, secrets, variables, labels, branch deletion and IAM.
  Write the exact command to `process/OWNER-ACTIONS.md` and continue.

## 7. Flag custody (only G5 / lane 15 changes `flags.state.ts`)

- No flag changes state during Track 0. After that, each change for any lane is applied by G5-L15 alone, in its own PR, from a
  cited checkpoint record (`evidence/prdNN/checkpoints/IC-<k>.md`), and it cites the run that met the criteria.
  `flags.state.ts` sits under `packages/rendering/src/contracts/` (01 in `QR_OWNERSHIP.json`). Request G1 review on each such
  PR and record it. G1 never edits the state values.
- Ladder (PRD-16 §4.0): `dev → standalone-accepted → integrated-accepted` (G-PANEL, `qr_flags=all` + leave-one-out
  `all,-<lane>`) `→ default-on` (two clean checkpoints) `→ removed` (two more, one removal PR, `REMOVED_QR_FLAGS`, rg empty). A
  promoted lane with an attributed regression goes back one state, and the default-on clock restarts.
- Lane-15 targets: `A3D_QR_COMPILER`/`A3D_QR_STRICT` standalone at IC-2 2026-10-22 (realistic), integrated via PRD-15 §16A with
  `all,-compiler`, `all,-strict`. Then T4.4. Lane 12 has no flag: its gates go blocking after goldens + the 10× noise test
  (target IC-8: "12 goldens blocking").
- Every renderer/engine change stays behind `A3D_QR_COMPILER`/`A3D_QR_STRICT`, except declared flag-independent fixes (T0-12
  marks, T0-13/T0-14 harness). Prove flag-off identity with a `qr_flags=none` run (sentinels ΔE2000 p99 ≤ IC-0 noise).

## 8. Routing and budget

- **Remote only.** Locally you may edit, use `git`, `rg`, `gh` reads and `actionlint`, run `tsc --noEmit -p` on touched
  packages, and run single targeted vitest files. Never local Docker, Playwright, browsers, captures, builds or full suites.
- PR gates run on GitHub ubuntu. Browser conformance, the sentinel identity check and `tests/qr/prd15/browser/*` run on GitHub
  **macos-14** (`gh workflow run <wf>.yml --ref <branch>`).
- Bench, bisect, lane-scene and game captures go to **GitLab macOS** via the bridge: a head-commit tag
  `[qr-gitlab:benchmark flags=…]`, `[qr-gitlab:games games=<ids> viewports=1280x720 mobile=false flags=<set>]` or
  `[qr-gitlab:all]` (keys: `games= viewports= local= mobile= flags=`; unknown keys fail), or `gh workflow run qr-gitlab-ci.yml
  --ref <qr/ branch> -f suite=<benchmark|games|flags-bisect> -f requester=prd12|prd15 …`. Use `local=true`. Download with `gh run
  download <id>` (artifact `gitlab-<suite>-<pipelineId>`).
- GitLab macOS runs `chromium-headless-shell`. GitHub runs full Chromium. **Never compare frames or timings across
  providers or channels.** Goldens, noise floors and before/after pairs come from one provider. Never push to, commit on or open
  MRs on the GitLab mirror, and never re-enable `mirror-to-gitlab`.
- **Budget:** 50,000 GitLab compute min/month **shared by all 5 groups**, with a macOS cost factor of **6** (≈ 8,300 macOS wall min).
  G5's lane envelope is lanes 12 + 15 at 2,400 each = ≈ 4,800. G5 also spends the shared 6,000 checkpoint/G-PANEL pool. The
  8,000 reserve covers IC-0 noise runs, re-baselines and incidents. Measured costs: 18-scene bench ≈ 16 min, 2-game local
  single-viewport ≈ 22, full 18-game ≈ 133+. Prefer the 6-probe `flags-bisect` (one build, many sets). Run full 18 + games
  only for IC-0, Round 5, 15-16.1 phases and checkpoints. Use GitHub macos-14 for the 10× noise test and the 3.0.1 baseline
  if GitLab is short. Before any large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use
  `quality-rebuild-capture.yml` for the whole comparison and say so in the PR.

## 9. Issues to action and close (verify on main first; cite file:line or run id in each close comment)

- **Week-1 close (TP, §5.2), G5-owned only:** #74 (once L12's `strict` input lands; G4 lane 14 confirms the inputs), #155, #164, #225, #236, #247, #251, #339. Verify then close:
  #161, #248, #250. Close #145 **only** with the T0-28 PR. Dupe: #172 → #72 (G5 closes). **Not G5's to close (track only):**
  #232 (G1 lane 01, after the §8 check), #261 (G2 lane 11), #211 (G4 lane 09), #314 → #254 (G1 lane 02), umbrellas #77/#79 (G2) and #78 (G1).
- **Track 0 blockers:** #156 (12), #54 (09 → G4), #145 (15), #313 (withdraw the promotion ask). Link #156, #54, #145, #313 from
  the Track 0 tracking issue. File the no-issue blockers at hour 0: T0-01, T0-02, T0-03, T0-08, T0-13, T0-14, T0-15/16,
  T0-20, T0-21, T0-22, T0-31, T0-32, T0-33, T0-34, T0-35.
- **Lane 12 implement, then close:** #73, #74, #75, #92, #97, #98, #263, #310. Owned blocker: #156. Chase outbound: #38
  (CCR-12-1), #39-#45 (Q-15-1..7, internal to G5), #46/#47, #48-#50, #51/#52, #53, #54, #142, #344.
- **Lane 15 blocking (P0):** #34, #65, #72, #100, #129, #135, #146, #177, #198 (G1 writes + closes; G5 reviews), #204, #237, #241, #249, #266, #313, #340.
  **CCRs (decide each):** #38, #71, #127, #128, #130, #131, #148, #228, #229, #230, #255. **Requests/removals:** #35, #39, #40,
  #41, #42, #43, #44, #45, #59, #89, #93, #99, #123, #124, #125, #142, #147, #149, #193, #222, #223, #224, #226, #227, #267;
  #316 later (at A3D_QR_VFX removal).
- **Outbound to file (P-64):** every `evidence/prd15/requests/*.md` (write the number back into the note and
  `requests.json`). First: Q-07-1, Q-01-5, Q-12-6/Q-12-8 (internal: L15 → L12), Q-13-16, Q-13-15, Q-11-5/Q-11-7, Q-01-6,
  Q-03-2, Q-06-2, Q-11-4, Q-07-4, CI-1 (06), CI-2 (02). Batch at most 30 creations per minute.

## 10. Checkpoint duties (Thursdays; PRD-16 §6.2)

| Checkpoint | Date | G5 delivers |
|---|---|---|
| IC-0 re-record | 2026-10-10 | `history/rounds/IC-0.json` + noise floor (12-IC0); `qr-required.yml` skeleton on main |
| **IC-1** | 2026-10-15 | Track 0 exit evidence; Track P §3.1-3.4 merged; ruleset prepared (live = owner); `qr-no-cross-lane-import` = error; requests filed |
| IC-2 | 2026-10-22 | first `standalone-accepted` state changes (candidates: 15 compiler/strict, 02, 03, 05) |
| IC-3 | 2026-10-29 | remaining standalone promotions |
| **IC-4 G-PANEL 1** | 2026-11-05 | panel round 1 run (12-PANEL); ≥ 1 ref admitted; first `integrated-accepted`; 16A IA-1..10 |
| IC-5..IC-7 | 11-12, 11-19, 11-26 | `default-on` after two clean checkpoints |
| **IC-8 G-PANEL 2** | 2026-12-03 | 12 goldens blocking |
| IC-9..IC-11 | 12-10, 12-17, 12-24 | removals for flags `default-on` × 2 |
| **IC-12 G-PANEL 3** / **IC-16 final** | 2026-12-31 / 2027-01-28 | panel rounds; final acceptance (PRD-16 §6.3) |

Each Thursday G5:
1. Runs the nightly-on-main capture (18 base + lane scenes, both engines, `none` and `$ALL`; games 9/9 with `all`). From IC-1,
   it also runs leave-one-out `all,-<lane>` (§2.4 Round 3).
2. Files one `qr-ic-regression` + `to:prdNN` issue per regression, against the lane leave-one-out names.
3. Writes the checkpoint record and applies flag changes or demotions from it (§7).
4. Posts the §11 block, and collects G1-G4's blocks from their group tracking issues.

## 11. Report-back block (lead posts per checkpoint to the issue "Group G5 — finish")

```
GROUP G5 GATEKEEPER — <IC-k / date> — main <sha>
Lanes: 12 <n>% (<rows done>/<rows total>) | 15 <n>% (…) | Track 0 <done>/<35> | Track P <done>/<64 incl. filed>
Rows closed (id → PR → run id): T0-10 → #… → <run> | P-02 → … | 12-CONC → … | C36-DROP → …
Bisect rounds: R<n> → run/pipeline <id> @ <sha> → sets → pass/fail per set × scene; culprits filed #… to:prdNN
Current failing layer: <first error> — culprit flag <x> — owner group G<n>
Gates on main: TypeCheck <run> | arch-gates <n findings, run> | pack-check | bundle-size | qr-contracts | qr-required | allflags-smoke <none/$ALL/$ALL,strict>
Flag states: <flag → state, checkpoint record path>; changes this checkpoint: <none | PR #…>
Issues: closed #… | filed #… | CCRs decided #… | outbound chased #…
Blockers (row → blocking group/issue): …
Owner actions pending: ruleset NOT APPLIED (owner action) | #137 secret | P-62 | P-63 | IAM deny <action/resource/role>
GitLab minutes used (approx.): <n> / ≈ 4,800 lane + checkpoint pool
Images reviewed: <paths> — what I saw
NOT RUN: <item — reason>   (mark unreproduced claims *(code-read)*)
```

Facts only. The ruleset is "done" only when `gh api repos/auraoneai/aura3d/branches/main` shows `protected: true` + contexts.
