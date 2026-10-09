# Aura3D QR — process remediation inventory (main @ afb475c2, 2026-10-08)

Read-only audit. Every finding has a file:line and a fix. Line numbers are for main @ afb475c2.
Cross-checked against `/tmp/qrfinal/audit-NN.json`, `prs.json`, `issues.json` and live `gh api` reads.

Headline: main has no branch protection, no required checks and no rulesets (`gh api .../branches/main` →
`protected:false`). 109 of 136 PRs merged into main since 2026-10-05 had at least one failing check on the
head commit. Every push workflow on afb475c2 is red or cancelled: Build and Test, CI (Type Check), Test & Coverage,
QR-15 bundle size (vite build error), Template lookdev, Agent Skills, quality-devices. Quality Gate was cancelled.
The capture tools exit 0 when nothing draws, which is why lanes show green while the benchmark produced 0/18 scenes.

---

## 1. CI steps that mask lane browser, perf or capture failures

### 1a. Root cause: the capture tools succeed when the capture fails

| file:line | what it does | fix |
|---|---|---|
| `benchmarks/quality-rebuild/capture.mjs:462-464` | Exits non-zero only when *every* scene lacks metrics ("Capture failures are audit data"). Timeouts, `drawCalls 0` and black frames all exit 0. | Exit 1 when any engine has `status !== "ready"`, `payload.drawCalls === 0`, or mean luma < ε on a non-baseline arm. Keep audit-only behaviour behind an explicit `--report-only`. |
| `benchmarks/quality-rebuild/capture.mjs:457` | `--strict` exists, but no CI caller passes it (`prd07-vfx.yml:131,139`, `benchmarks/quality-rebuild/ci.sh:26`, `.gitlab-ci.yml:134`). | Pass `--strict` in all lane/gate callers. |
| `tools/quality-rebuild-capture/capture-games.mjs:1057-1059` | Exits 1 only with `--strict`. No workflow passes `--strict` (`qr-prd14-games.yml:147`, `prd07-vfx.yml:176,179`, `quality-rebuild-capture.yml:140`, `.gitlab-ci.yml:116`). `failures` also ignores `blankShots` and `readiness: no-draw-timeout`. | Default to strict in CI (`process.env.CI`). Add `r.blankShots?.length`, `pageErrors.length`, and readiness ≠ `ready` to the `failures` filter. This is why 9/9 games crashed ('Target page closed') with a green status. |
| `.gitlab-ci.yml:114` | `capture-games.mjs --build-only \|\| echo "build step failed; captures continue for production routes"`. Local-source games then capture the *production* build. | Remove the `\|\| echo`. A failed build must fail `qr:games`. |

### 1b. Workflow-level masks (`continue-on-error` / `|| true`) with no later outcome gate

| file:line | step | fix |
|---|---|---|
| `.github/workflows/qr-contracts.yml:48` | `Browser conformance specs` (`tests/browser/contracts`). The C-01..C-40 browser conformance never gates. | Remove `continue-on-error`. |
| `.github/workflows/prd07-vfx.yml:129,137` | `Capture (flags vfx)` / `Capture (flags none)` | Remove, or add an `if: always()` step that runs `test "${{ steps.X.outcome }}" = success`. |
| `.github/workflows/prd07-vfx.yml:175,178` | `Games (flags vfx/none)`. Run 37561125962 (cited as F-07 evidence) shows `games: success` while browser, capture and typecheck failed. | Same as above, plus `--strict`. |
| `.github/workflows/qr-prd10-world.yml:80` | All four prd10 browser specs | Remove `continue-on-error`. |
| `.github/workflows/qr-prd10-world.yml:101,113` | `gh workflow run ... \|\| echo "dispatch not authorized"`, then `gh run list -L 1` picks *any* latest run (race). | Fail on dispatch error. Resolve the run id by headSha + createdAt (the pattern already used in `qr-prd03-captures.yml:79-94`), then `gh run watch --exit-status`. |
| `.github/workflows/qr-prd14-games.yml:150` | `Runtime art-direction audit`. Its outcome is printed at `:165` but never tested (`:166` tests only `capture`). | Add `test "${{ steps.audit.outcome }}" = "success"`. |
| `.github/workflows/qr-prd14-games.yml:146` | `Build + capture changed games`. Gated at `:166`, but the tool exits 0 (1a), so the gate is inert. | Fix 1a and pass `--strict`. |
| `.github/workflows/lighting-quality.yml:102` | `continue-on-error: ${{ github.event_name == 'pull_request' }}`. prd02 browser specs never gate on PRs, the only event that blocks a merge. | Remove it. Use a lane label to opt out if needed. |
| `.github/workflows/lighting-quality.yml:83` | lane eslint `\|\| true` | Remove `\|\| true`. |
| `.github/workflows/qr-prd01-core.yml:83` | lane eslint `\|\| true` | Remove `\|\| true`. |
| `.github/workflows/qr-prd11-perf.yml:133` | whole `webgpu-smoke` job non-gating | Acceptable while F-11-02 says WebGPU is experimental. Label it `(informational)` in the required-check list (§8). |
| `.github/workflows/qr-prd11-perf.yml:181-184` | naga gate `exit 0` when `emit-twins` emits nothing, "non-fatal pre-G-WGPU". PRD-03 Phase 7 now ships 34 WGSL entry modules. | Fail when zero twins are emitted (`exit 1`), or assert the expected count. |
| `.github/workflows/post-quality.yml:80-83` | `exit 0` when there are no `post-*.spec.ts` ("Phase 0"). | Change to `exit 1`. Phase 0 is long past. |
| `.github/workflows/ci.yml:37` | `Run ESLint` `continue-on-error` (repo-wide lint never gates) | Remove. |
| `.github/workflows/ci.yml:170` | `pnpm test:bench \|\| true` | Remove `\|\| true`, or move to a non-required informational job. |
| `.github/workflows/test.yml:47,54` | prettier / eslint `continue-on-error` | Remove. |
| `.github/workflows/test.yml:200` | integration tests `continue-on-error` | Remove. |
| `.github/workflows/quality-devices.yml:65` | Device Farm schedule-run `\|\| true` | Remove. A failed schedule must surface. |
| `.github/workflows/public-demo-deploy.yml:124,127` | parity audits `\|\| true` (not lane, but release-adjacent) | Remove, or mark informational. |

Already correct (masked, then gated by an outcome test): `template-lookdev.yml:83→107`,
`agent-output-eval.yml:111→130, 160→179`, `qr-prd09-routes.yml:81,86→107`. The `|| true` in
`qr-prd01-core.yml:64,67`, `qr-prd14-games.yml:78,101`, `qr-gitlab-ci.yml:103-159` and `mirror-to-gitlab.yml:30`
are benign (empty grep, optional fetch). `qr-prd03-captures.yml:113` is benign (download after a gated watch).

---

## 2. Tests that self-skip or use `test.fail` to mask failures

### 2a. `test.fail` masking timeouts and crashes

| file:line | issue | fix |
|---|---|---|
| `tests/qr/prd04/browser/prd04-scene-capture.spec.ts:53` | `test.fail(true, "harness did not publish ready/error within 120s")`, then a deliberately failing `expect`. A **timeout becomes an expected failure and reports green**. This is the prd04 lane-capture path (`qr-prd04-materials.yml:133`). | Delete the `test.fail`. Record the timeout in `results`, then fail hard. |
| `tests/qr/prd06/games/aura-clash-showcase.spec.ts:37`, `neon-swarm.spec.ts:36`, `skyline-runner.spec.ts:35`, `rooftop-buckets.spec.ts:36`, `gallery-shift.spec.ts:36`, `mech-hangar.spec.ts:33` | Bare `test.fail()` "failing control until Q-14-1". *Any* failure passes, including page crash, timeout or harness break. The control proves nothing, and Q-14-1 is still open (#278, #285, #290, #296, #300). | Assert the specific expected-red condition (`expect(tracksApplied).toBe(0)` etc.) without `test.fail`. Or use `test.fixme` plus a tracked issue, and flip when Q-14-1 lands. |

### 2b. Self-skips on unmet preconditions (pass as "skipped" on a broken host)

Remote macos-14 lanes are required to have a real GPU (CI-ROUTING). On CI these must fail, not skip. A single
helper fixes all of them: `requireOrSkip(cond, msg)`, which calls `expect(cond, msg).toBe(true)` when
`process.env.CI` and `test.skip` locally.

| file:line | skip reason |
|---|---|
| `tests/qr/prd11/browser/context-restore.spec.ts:65,80` | no frames / no WEBGL_lose_context |
| `tests/qr/prd11/browser/vao-leak.spec.ts:57,64,83` | no frame progress / counter absent / too few frames |
| `tests/qr/prd11/browser/fps-agreement.spec.ts:91,121` | no frame telemetry |
| `tests/qr/prd11/browser/batching-pixel-identity.spec.ts:158` | no usable frame |
| `tests/qr/prd11/browser/precompile-hitch.spec.ts:70,74,78` | `:78` skips when "late nodes never landed": this skips **the behaviour under test** |
| `tests/qr/prd11/browser/governor.spec.ts:66,68,95` | `:68` skips if the adaptive controller is not mounted. `:95` skips if scale never reaches the floor. Both are the behaviour under test. |
| `tests/qr/prd11/browser/no-readback.spec.ts:66,70,74` | `:74` skips when the `readbacksThisFrame` counter is absent |
| `tests/qr/prd11/browser/tier-switch-hitch.spec.ts:76,80` | too few frames |
| `tests/browser/qr-prd10-terrain-cracks.spec.ts:241`, `qr-prd10-terrain-gpu-cpu.spec.ts:48`, `qr-prd10-terrain-splat-bake.spec.ts:125`, `qr-prd10-world-pass-depth.spec.ts:98` | webgl2 unavailable |
| `tests/browser/qr-prd03-phase6.spec.ts:103` | `if (r.untested) test.skip()` (auto-exposure gate) |
| `tests/browser/qr-prd03-phase4.spec.ts:91,96,101,115` | `if (!result.X.untested) expect(...)`: **vacuous pass** when the probe reports `untested` |
| `tests/browser/qr-prd03-wgsl-compile.spec.ts:68`, `tests/qr/prd04/browser/wgsl-twins.spec.ts:39`, `tests/browser/gpu-particle-a4.spec.ts:312` | no WebGPU adapter. This is the PRD-03 §8.18 gate itself. |
| `tests/qr/prd04/browser/integrated-acceptance.spec.ts:57`, `scene-perf.spec.ts:67` | skip unless `PRD04_FLAGS` contains `all`. It is set only on `workflow_dispatch` (`qr-prd04-materials.yml:130`), and **there have been zero dispatch runs**, so these have never executed. Add a scheduled `flags=all` job and report it as integrated-pending, not skipped. |
| `tests/qr/prd06/browser/aura-clash-tracks-applied.spec.ts:168` | skips if the serial sibling run didn't populate state. Make the dependency explicit (`test.describe.serial`) and fail. |
| `tests/qr/prd09/capture-divergence.spec.ts:114` | skips when baseline.json has no capture-flag routes. Fail instead: the baseline is required input. |
| `tests/browser/gravity-post-playable.spec.ts:589` | nondeterministic ("launch vector did not cross a flyby zone this run"). Seed the launch. |
| `tests/browser/webgpu-hardware-matrix.spec.ts:7`, `webgpu-visual-parity.spec.ts:8` | skip when the report file is missing. Fail under CI. |
| `tests/qr/prd14/browser/*-v2.spec.ts`, `*-framing.spec.ts`, `*-dispatch.spec.ts` (22 sites, e.g. `showcase-neon-swarm-v2.spec.ts:65`) | `skip(!existsSync(src/v2/boot.ts))`. Inert today (all 18 v2 trees exist). Delete the guard so a missing tree fails. |
| `tests/qr/prd05/browser/assets-compressed-typed-glb.spec.ts:20` | unconditional integrated skip (PRD-sanctioned). Keep, but list it in the integrated-pending report. |

Also add `forbidOnly: !!process.env.CI` and a `failOnFlakyTests`/"no skipped in CI" reporter check to every
`tests/qr/*/playwright*.config.ts`. None of them set this today.

---

## 3. Thresholds and budgets loosened since 2026-10-05 vs PRD values

| file:line | now | PRD / prior | commit | fix |
|---|---|---|---|---|
| `tools/bundle-size/index.ts:67` (+ `BUNDLE_SIZES.md:10`) | engine "." critical path budget **920,000** B gz | 80,000 → 600,000 (`250077b5`) → 920,000 (`80a903d5`). PRD-15 §17 (`PRD-15:1906`): lit scene initial **≤ 190 KB** | 250077b5, 80a903d5 | Reset to the §17 caps (190 KB initial / 220-340 KB with lazy chunks) and let the gate fail. The doc's own rule (`BUNDLE_SIZES.md`, "Do not raise either set of budgets to manufacture a pass") was violated twice in one day. |
| `tools/bundle-size/index.ts:110` (`BUNDLE_SIZES.md:15`) | product-viewer **780,000** | 250,000 → 600,000 → 780,000 | same | Reset to ≤ 250,000, or the §17 lit-scene cap |
| `tools/bundle-size/index.ts:123` (`:16`) | cinematic-scene **790,000** | 400,000 → 600,000 → 790,000 | same | Reset to ≤ 400,000 |
| `tools/bundle-size/index.ts:134` (`:17`) | mini-game **850,000** | 250,000 → 650,000 → 850,000. PRD-15 §17 game route ≤ 380-480 KB | same | Reset to ≤ 480 KB (§17 Low cap) |
| `tests/qr/prd13/bundle-delta.test.ts:83` | `12 * 1024` | PRD-13 T1.12/§19: **9 KB**, no exception | lane 13 | Restore `9 * 1024`. Count the carve-out modules. |
| `tests/browser/layout.spec.ts:29` | HUD cap courier/aura-clash **0.22** @1280×720 | PRD-09: desktop **≤ 0.15** (0.22 is the mobile cap) | lane 09 | Set 0.15 for every fixture on desktop. Add the missing canvas ≥ 95 %, mobile and banned-token assertions. |
| `tests/browser/qr-prd03-phase4.spec.ts:91` | TAA ghost `<= 64` pixels | PRD-03: **≤ 2 px** | lane 03 | Measure ghost width in px (max run length), assert ≤ 2. Remove the `untested` bypass. |
| `tests/browser/qr-prd03-phase6.spec.ts:~98` | SMAA `ratio > none × 1.5` | PRD-03 §8.14: ≤ FXAA and within 10 % of three SMAAPass | lane 03 | Implement the comparative metric. |
| `tests/qr/prd06/browser/deform-light-view.spec.ts:83,86` | `iouTolerant` (2-px dilation) ≥ 0.98 | PRD-06: strict IoU ≥ 0.98 | 63a0c3f5 | Restore strict IoU, or have the PRD owner amend it with rationale and keep both values. |
| `tests/qr/prd06/browser/gallery-shift-thief-gait.spec.ts:110,153,199` | test 780 s / wait 300 s | 120-180 s → 420 → 540 → 780 s | 63a0c3f5, 47ca6385, 3efd229c | These timeouts hide starved-rAF performance. Pin a deterministic pump and restore ≤ 180 s. Treat > 180 s as a perf failure. |
| `tests/qr/prd06/browser/clip-samples-binding.spec.ts:31,36,46,51` | waits 30 s → **300 s** | | 3efd229c | Restore 30 s. Fix mount latency instead. |
| `tests/qr/prd06/browser/aura-clash-tracks-applied.spec.ts:104` (+ stability polls 4 → 3) | 480 s → 660 s | | 3efd229c, 63a0c3f5 | Restore. |
| `tests/qr/prd04/browser/transmission-capture.spec.ts:39` | wait 120 s → 300 s | | 63b5a77c | Restore 120 s. A hang is a failure. |
| `tools/perf-gate/budgets.json:50,62` | `S3-p50-ratio` and `S3-draw-calls ≤ 40` both `gating: false` | PRD-11 §17.3 | c031be64 | Flip to `gating: true` now that phases 3-4 are claimed done (PRD-11 has 0/82 ticks, so the code claims and the gate disagree). |
| `tests/qr/prd11/unit/quality.test.ts` (oscillation case) | checks that a down step and an up step exist | PRD-11: ≤ 2 direction changes | lane 11 | Count direction changes and assert ≤ 2. |

The automated diff scan (`git log -p --since=2026-10-05` over `tests/qr`, `tests/browser`, `tools/bundle-size`,
`BUNDLE_SIZES.md`, `budgets.json`) found no other numeric comparator edits. Most of the loosened values above were
loose when first written (lanes 03, 09, 13), not edited later.

---

## 4. Checklist ticks without evidence, and C-40 "verified" without a passing run

### 4a. CONTRACTS.md Appendix B (rule at `CONTRACTS.md:2785-2786`: `verified` requires a *passing* test or capture run id)

| line(s) | rows | problem | fix |
|---|---|---|---|
| `CONTRACTS.md:2790,2794-2798` | F-07-01, F-07-05..09 | `verified`, but evidence is "run 37561125962 **pending**". That run on main **failed** (browser, capture and typecheck jobs failed; unit passed). | Set to `proposed`, or cite a green run. The unit job passing in a failed run does not meet the rule. |
| `CONTRACTS.md:2791-2793` | F-07-02..04 | Cite run 37503078850. That run passed, but on PR branch `qr/prd07-lane-core`, not main. | Re-verify on main. |
| `CONTRACTS.md:2801-2806` | F-02-01..06 | `verified` on "vitest 2026-10-06T16:55Z" (a local run, no CI id) | Cite a CI run id, or set to `proposed`. |
| `CONTRACTS.md:2808-2813` | F-06-01..06 | test file path only, no run id. The prd06 browser lane has never passed on the final branch (audit-06). | Cite a CI run id. |
| `CONTRACTS.md:2814` | F-01-02 | test path only | Cite a CI run id. |
| `CONTRACTS.md:2868-2872` | F-08-1..5 | test paths only. **F-08-2 cites `feel-bus.test.ts` and F-08-5 cites `feel-screenspace.test.ts`. Neither file exists in the repo.** | Set F-08-2 and F-08-5 to `proposed`. Cite run ids for the rest. |
| `CONTRACTS.md:2874-2879` | F-08-1..6 | **duplicate rows** (an exact copy of 2868-2873) | Delete the duplicates (append-only allows fixing a copy error with a note). |
| `CONTRACTS.md:2880` | — | A blank line breaks the table, so rows 2881-2885 (F-05-07..11) render outside it, with no header | Remove the blank line. |
| `CONTRACTS.md:2832-2836` | F-03-06..10 | status `landed` is not a schema status (`proposed`/`verified`) | Use `proposed` until a run id is cited. |

PRD 13 must not write skill text from any of these rows until fixed (`CONTRACTS.md:2785`).

### 4b. PRD checklist ticks (detail in audit-NN.json `checklistTicked`)

Over-claiming lanes (ticks without the PRD-required "named test green on remote CI"):
- PRD-03: 54/56. `d4f65a88` (part of PR #364, rebase-merged) bulk-ticked 21 Phase 4-7 rows. The Phase 6 probes fail on main (Q-03-12). Untick until a qr-prd03 macos-14 run passes.
- PRD-06: 69/70. `qr-prd06-animation-browser.yml` has never passed on the final branch (37 failures, 65 cancelled; last run 37756716182 failed on chromium, webkit and firefox).
- PRD-07: 61/62. P1-T9/T10/T19, P2-T8, P3-T1/T3/T4, P4-T7, P5-T1/T6 and P6-T3 name browser tests that have never passed on main.
- PRD-08: 100/101. Ticks cite missing files: `PRD-08:1392` (`tests/qr/prd08/unit/camera-controller.test.ts`), `PRD-08:1578` (`platformer-accel.test.ts`), I-7 (`camera-feel.spec.ts`, `touch-device-prompts.test.ts`).
- PRD-09: 95/96. `PRD-09:1701`: postPass is ticked, but every `baseline.json` postPass is `null`. `PRD-09:1802`: "≤ 10 % evidence LOC" is ticked, but `after.json` shows 17/18 fail.
- PRD-12: 64/68. T1.17 (`PRD-12:1583`) is ticked, but IC-0 runs 37565849900 and 37707174082 failed. T1.16, T3.2, T3.3, T3.6, T5.6 and T5.7 are also unbacked (PR #355 "checkbox ticks").
- PRD-05: `PRD-05:1348`: "Day 0: open issues Q-02-1..Q-15-4" is ticked, but no such issues were filed. Phase 1/3 browser exit specs are ticked but have never passed.
- PRD-02: 45/54. Many rows carry inline "browser spec pending" / "capture pending" notes and are still ticked.

Under-reporting lanes (code merged, boxes unticked, which matches the missing CI evidence): PRD-01 (0/73),
04 (0/47), 10 (5/56), 11 (0/82), 13 (4/61), 14 (0/91), 15 (32/81).

Fix: add a checklist-lint job (lane 12) that requires every `- [x]` row to carry `run:<id>` or `capture:<id>`,
and resolves each id with `gh api .../actions/runs/<id>` to `conclusion == success` on main.

---

## 5. Unresolved merge-conflict markers

| file:line | marker | fix |
|---|---|---|
| `docs/project/aura3d-quality-rebuild/PRD-09-shared-game-runtime-route-extraction.md:1741` | `\|\|\|\|\|\|\| 5f5d6088` (diff3 base marker; `<<<<<<<`/`=======`/`>>>>>>>` were removed) | The text between this marker and the next block is the *base* copy, so checklist rows are duplicated. Delete the marker and the stale base rows (`:1741-~1773`). Diff against PR #158/#240 to keep the merged rows. |
| same file `:1774` | same | same |

No markers elsewhere (rg over all tracked files, excluding node_modules and .git).


---

## 6. Direct pushes to main that bypassed PRs (first-parent, since 2026-10-06)

`git log --first-parent origin/main --since=2026-10-06` returns 45 commits. Each was mapped with
`gh api repos/auraoneai/aura3d/commits/<sha>/pulls`. QR-03 Phase 3-7 (eb71b6aa..e093c34d) were rebase-merged through
PRs #359/#361/#362/#363/#364, so they count as PR merges. Five commits are not associated with any PR:

| sha | date (UTC) | what | size |
|---|---|---|---|
| `fd2e8060` | 10-07 02:06 | fix(engine): restore deprecated union exports in `packages/engine/src/public/index.ts` (lane-15 file) | 1 file, +6 |
| `2ed5c16e` | 10-07 02:40 | merge(origin/main): "lane-13 QR-13 push into lane-15 stack merge" | **2,670 files, +176,592/−11,858** across lanes 01-15 |
| `1f579954` | 10-07 02:45 | merge(origin/main): "second wave — lanes 07/11/12/14 + typecheck repairs" | 444 files, +55,979/−34,989 |
| `822c19fc` | 10-07 03:19 | [QR-03] Phase 2: PostGraph stages, bloom V2, display LUT, v2 bridge. It also edits lane-15 `compiler/errors.ts` and `CONTRACTS.md` | 44 files, +3,017/−140 |
| `9ff024f1` | 10-07 08:51 | evidence(prd03): phase 8 gate record + "QR-03-22 standalone-accepted ask" | 3 files, +45 |

Fix: (1) branch protection (§8) so this cannot recur. (2) Retro-review `2ed5c16e` and `1f579954` as PRs. Open
`audit/retro-2ed5c16e` with the base `2ed5c16e^1` and run the full lane matrix against it, because these two merges carried
most of the lane code onto main without any CI gate. (3) Re-file 822c19fc's lane-15 edits as qr-requests.

---

## 7. Cross-lane ownership violations (spot-check against `.github/QR_OWNERSHIP.json`)

### 7a. The checker itself is wrong, so lane gates can't see violations
- `tools/qr-ownership/check.mjs:24`: the lane regex omits `tests/qr/prdNN/`, and `check.mjs` never reads
  `lanePatterns` (`QR_OWNERSHIP.json:415-430`, which lists `tests/qr/prdNN/`). Every `tests/qr/prdNN/**` file therefore resolves
  to owner **15** (confirmed: all `tests/qr/prd14/**` in PRs #304-#334 report owner 15). This is a known gap
  (`qr-prd01-core.yml:61-63`, Q-15-1). Fix: add `tests\/qr\/(prd\d{2})\/` to the regex, or evaluate `lanePatterns` with NN substitution.
- `.github/workflows/qr-prd01-core.yml:67`: `awk '$1 != "01" && $1 != "15"'` exempts lane-15 files. Every lane can
  write lane-15 files (index.ts, contracts, public surface) without failing. Fix: only exempt paths on the R-table allowlist.
- Lanes other than 01 have no ownership step at all (only `qr-prd01-core.yml` calls `check.mjs`). Fix: move the step into
  `qr-contracts.yml` as one required job that runs for every PR with lane = branch `qr/prdNN-*`.

### 7b. Real violations found (owner per `check.mjs` / `QR_OWNERSHIP.json`, excluding the tests/qr false-positives)
| commit / PR | lane | writes into | fix |
|---|---|---|---|
| `444cbf2c` (#350) | 09 | lane-13 `packages/create-aura3d/templates/character-controller/src/main.ts` (+4 template files). R20 says PRD 13 is the only template writer. | Re-file as a C-40 or template request to 13. Have lane 13 re-author. |
| `90e242cb` (#361), `eb71b6aa` (#359) | 03 | lane-07 `agent-api/nodes/effects.ts`, `rendering/src/cinematic/BloomPass.ts` (+3); lane-01 `rendering/src/Renderer.ts`; lane-12 `benchmarks/quality-rebuild/aura3d/common.ts` | CCR-03-x claim "additive" in F-03 rows. Needs the owning lane's review on record (CONTRACTS §change-control). |
| `038982a1` (#363) | 03 | lane-01 `Renderer.ts` (CCR-03-12) | same |
| `74ef37c1` (#364) | 03 | lane-11 `rendering/src/webgpu/WebGPUPostShaders.ts` (the F-03-33 row admits "ownership map reports 11") | Lane-11 sign-off, or move the file to 03 in `QR_OWNERSHIP.json`. |
| `45316e60` (#366), `f7ab6880` (#360) | 05 | lane-01 `rendering/src/shaders/lod-dither.glsl.ts`; lane-15 `aura.library.json` | Lane-01 review for the shader. Register `aura.library.json` to 05. |
| `7758a271` (#365) | 05 | lane-01 `rendering/src/contracts/renderItem.ts` | Contract file: needs a CCR with lane-01 sign-off. |
| `f29b1da4` (#347) | 05 | lane-04 `assets/src/GLTFRenderResources.ts` | Lane-04 review |
| `374c7ac2` (#346) | 06 | lane-14 `apps/aura-clash-showcase/src/legacy/...`, lane-05 `assets/src/gltf-runtime.ts`, lane-01/02/03/11/12 files | Split per owner, or record sign-offs |
| `afb475c2` (#357) | 15 | 151 lane-13 files (`.agents/skills/**`, skills, AGENTS.md), 10 lane-03, 4 lane-09, 3 lane-12 | The removal sweep is lane-15 scope, but skill text is R20/lane-13. Get lane-13 review of the skill edits. |
| PR #277 (audit-13) | 13 | other lanes' workflows and benchmarks, plus repeated PRD-08/PRD-15 file edits | Revert or re-file through the owners |
| `2ed5c16e`, `1f579954` | 13 / mixed | everything (see §6) | retro-review |

---

## 8. Required-check configuration

Current state: `GET /repos/auraoneai/aura3d/branches/main` → `protected: false`, `required_status_checks: []`,
`enforcement_level: off`. `GET .../rulesets` → `[]`. All three merge methods are enabled. The repo is public. Nothing stops a
red merge or a direct push, and 109/136 PRs merged since 10-05 had failing checks (top: `unit` ×242 check-runs,
`Test (Node 22)` ×193, `Type Check` ×134, `browser` ×110, Chromium Browser And Visual Checks ×~400, `bundle-size` ×30,
`Lane gate (lint + ownership + unit)` ×22, `arch-gates` ×22, `pack-check` ×20).

Also, `ci.yml:180` `All Checks Passed` is `skipped` on main (its `needs` failed). A required check that is skipped counts as
passing in GitHub. Use `if: always()` plus an explicit `needs.*.result` test.

Recommended (owner action; agents may not change it. This is a repo-settings write, outside the read-only scope):
1. A ruleset on `main`: require a PR, block force-push and deletion, require linear history or merge commits (pick one),
   no bypass for the admin role used by agents, require branches to be up to date.
2. **One aggregator check per concern, always reporting.** Path-filtered workflows never report on unrelated PRs, so they
   cannot be required directly. Add `qr-required.yml` (pull_request, no path filter). It uses `dorny/paths-filter`
   (pinned SHA) to decide which lane jobs must run, calls them via `workflow_call`, and ends in a `qr-required` job with
   `if: always()` that fails on any `failure|cancelled` result.
3. Required contexts:
   - `CI / Type Check`, `CI / Lint` (after removing `ci.yml:37` continue-on-error), `CI / Build`, `Test & Coverage / Test (Node 22)`
   - `QR contracts / unit`, `QR contracts / browser` (after removing `qr-contracts.yml:48`)
   - `QR-15 architecture gates / arch-gates` (flip to `--strict`, `qr-prd15-arch-gates.yml:3-5,47`), `QR-15 pack-check`, `QR-15 bundle size` (with the §3 caps restored)
   - `qr-required` (lane unit + lane browser + lane capture with `--strict`, ownership check from §7a, checklist-lint from §4b)
   - Informational only (not required): `webgpu-smoke`, `public-demo-deploy` audits, `mirror-to-gitlab`, quality-devices.
4. Default-on gate: no lane flag leaves `dev` until the all-flags benchmark capture (GitLab `qr:benchmark` with `--strict`)
   renders 18/18 with drawCalls > 0, and all-flags games render 9/9. The last captures were 0/18 and 0/9
   (pipelines 2926601350 and 2926540757), and `A3D_QR_STRICT` throws `AuraMigrationError` on `renderer.mode` in the harness.

---

## Priority order
1. Branch protection plus the `qr-required` aggregator (§8). Without it, the other fixes can be bypassed.
2. Make the capture tools fail on non-ready, zero-draw or black output, and pass `--strict` (§1a). This alone turns today's "green" lanes red, which is correct.
3. Remove `continue-on-error` from qr-contracts, prd07, prd10 and lighting PRs, and gate the prd14 audit (§1b).
4. Remove `test.fail` from prd04 capture and the prd06 games. Replace CI self-skips with hard failures (§2).
5. Restore the bundle and test thresholds (§3). Demote unbacked C-40 rows and ticks (§4). Fix the PRD-09 conflict block (§5).
6. Fix the ownership checker. Retro-review the 2ed5c16e and 1f579954 direct merges (§6-7).
