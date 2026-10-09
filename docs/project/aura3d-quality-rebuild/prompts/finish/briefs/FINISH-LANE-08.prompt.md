# Finish prompt — Lane 08: Camera / Controls / Game Feel (`A3D_QR_CAMERA`)

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the **finish agent for Lane 08** of the Aura3D Quality Rebuild in `https://github.com/auraoneai/aura3d` (local
checkout = repo root, `main` at `afb475c2` or later). Your mission is to finish **every** remaining Lane 08 task in
`docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` §4.8 (rows `08-*`) plus Track 0 row **T0-32** and the
Lane 08 rows in Track P (P-38, P-52, P-54). Then bring `A3D_QR_CAMERA` to `standalone-accepted` with a recorded run id.
Nothing counts as done unless a **passing remote run id** proves it.

## Honest starting state (audit 2026-10-08, verify before you build on it)

- Seven `[QR-08]` PRs merged to `main`, **all with red lane CI**: #132, #152, #166, #175, #185, #201, #235. None was closed
  unmerged or merged into a non-main base, so there is no unlanded PR content to recover. What is left is fixing, testing
  and evidence.
- `.github/workflows/qr-prd08-camera.yml` has **0 green runs out of 34** (29 failed, 5 cancelled) and has **never run on
  `main`**: it triggers on PRs only. The jobs `unit` (`:37`) and `browser` (`:66`) both run on `ubuntu-latest`, but PRD-08
  §15 requires macos-14 `browser-gpu` and `motion-capture` jobs.
  - The last lane-branch runs (for example 37559621318) died at `pnpm install --frozen-lockfile` with
    `ERR_PNPM_OUTDATED_LOCKFILE`.
  - Later qr13 runs (for example 37560374735) died at `pnpm typecheck:raw` with TS1005 errors in
    `tools/threejs-parity-*`. Both breaks are fixed on main (83948647). Lane tests have not executed in CI since then.
- On main, **52/55** tests fail across frame-loop, camera-fromspec-parity and camera-cast-codemod. PRD-16 §4.8 counts
  53/194 lane-wide, including camera-rigs-view R-5.
  - `tests/qr/prd08/unit/frame-loop.test.ts:7` imports `createFrameLoop`, and
    `tests/qr/prd08/unit/camera-fromspec-parity.test.ts:6` imports `resolveCameraFrame`, both from bare
    `@aura3d/engine`. Since QR-15 bf1789b0 that resolves to `packages/engine/src/public/index.ts`, which exports neither.
  - `.gitignore:325 'fixtures/'` hides `tools/camera-cast-codemod/fixtures/style-{a,b}.ts` (confirm with
    `git check-ignore -v`).
- The flag is still `'dev'` at `packages/rendering/src/contracts/flags.state.ts:18`.
- The combined all-flags capture renders **0/18** benchmark scenes and **0/9** games (GitLab pipelines 2926601350 and
  2926540757). With flags `none`, main is pixel-identical to IC-0. Lane 08 has three flag-on suspects for that failure
  (tasks 08-LOOP, 08-RIGCAST and 08-POSE below).
- Ticked without backing:
  - §14 items I-7, C-14 and P-6 cite files that do not exist.
  - Phase 5 is ticked without S9 or S19.
  - F-08-2 and F-08-5 are marked `verified` at `CONTRACTS.md:2869/2872` (duplicated at `:2875/2878`) and at
    `evidence/prd08/facts.md:44/79`, citing `feel-bus.test.ts` and `feel-screenspace.test.ts`, which do not exist.
- No `.skip`, `.only`, `continue-on-error` or loosened thresholds were found in lane tests or the workflow. Keep it that
  way.

## Read first (use `rg -n '^#'` plus offset/limit reads; never read huge files whole)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`. Read these sections:
   - §2 Track 0, especially T0-32 at `:153`;
   - §2.5, the all-flags gate (`:234-252`);
   - §3, Track P: P-38 `:299`, P-52 `:328`, P-54 `:330`;
   - §4.0, common rules and flag promotion (`:349-365`);
   - **§4.8 Lane 08** (`:578-599`);
   - §6, schedule and checkpoints (`:815-845`).
2. `docs/project/aura3d-quality-rebuild/PRD-08-camera-controls-game-feel.md`. Read these sections:
   - §14 task checklist (`:1266`);
   - §15 test requirements (`:1665`);
   - §16 standalone acceptance S1-S19 (`:1718`);
   - §16A integrated acceptance I1-I12 (`:1762`);
   - §17 budgets (`:1815`);
   - §19-§21 (`:1851-1895`).
3. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`, the whole file: routing, commit tags and budget.
4. `CONTRACTS.md`: §4 ownership, §5.3 flag states, §6 merge protocol, and Appendix B C-40 fact rows (F-08-*).
5. `docs/project/aura3d-quality-rebuild/_sections/integration-findings.md`, `issues-triage.md` and
   `process-remediation.md`, for the Lane 08 rows.
6. The original lane prompt `prompts/LANE-08-camera-controls-game-feel.prompt.md`: owned paths and contracts C-22/C-23.

## Owned paths (single writer; edit nothing else)

You own these paths:
- `packages/engine/src/agent-api/{camera,feel,time,controls,vehicle}/`
- `FrameLoop.ts`, `GameRuntime.ts`, `GameFeel.ts`, `GameCameraRigs.ts`, `CameraChoreographer.ts`, `VehicleChassis.ts` and
  `nodes/camera.ts`
- `packages/engine/src/lanes/prd08.ts`, `packages/rendering/src/lanes/prd08.ts`
- `packages/input/`, except `TouchLayouts.ts` and `controls/`
- `physics/src/{Raycast,ScenePhysicsBridge}.ts`
- `benchmarks/quality-rebuild/motion/`, `tools/camera-cast-codemod/`
- `tests/qr/prd08/**`, `.github/workflows/qr-prd08-camera.yml`
- `docs/.../evidence/prd08/**` and the PRD-08 checklist

Check every path against `.github/QR_OWNERSHIP.json` (longest prefix wins) and `node tools/qr-ownership/check.mjs`.

You do **not** own the following, so file `qr-request` issues for them:
- `createAuraApp.ts`, `packages/engine/src/public/index.ts` and the `agent-api/index.ts` wrapper types belong to lane 15;
- `.gitignore` is a custodian file;
- `GameAppRuntime.ts` belongs to lane 09;
- `GameSceneGeometryBindings.ts` and `nodes/game/racingCamera.ts`: check the owner in `QR_OWNERSHIP.json` first. If lane
  08 does not own them, request the change from the owner.

Use this format:
`gh issue create --label qr-request --label to:prdNN --title "Q-08-x: ..." --body "<file:line, exact change, contract>"`.
gh is already authenticated. Never log in, and never set `GH_TOKEN`.

## Remaining task list (do all of them; IDs are PRD-16 §4.8 IDs or audit IDs)

### P0: Track 0 and unblock CI (first 48 h, 2026-10-09 → 10-10)

**T0-32 / 08-ALIAS: fix the lane test imports broken by the QR-15 barrel**
- Do not ask for the symbols back on the public surface. Add `createFrameLoop` (from `agent-api/FrameLoop.ts`) and
  `resolveCameraFrame` (from its agent-api camera module; find it with `rg -n "export function resolveCameraFrame"`) to
  `packages/engine/src/lanes/prd08.ts`.
- Change `frame-loop.test.ts:7` and `camera-fromspec-parity.test.ts:6` to import from `@aura3d/engine/lanes` or the leaf
  module.
- File a prd15 request only if C-22 requires them to be public.
- Done when: frame-loop is 8/8 and fromspec-parity is 40/40 in the remote lane unit job.

**08-FIX (S17, P-38): commit the codemod fixtures, then fix R-5**
- `.gitignore:325 'fixtures/'` hides the codemod fixtures. `git add -f tools/camera-cast-codemod/fixtures/style-a.ts
  tools/camera-cast-codemod/fixtures/style-b.ts`. Also file a custodian request for the negation
  `!tools/camera-cast-codemod/fixtures/**`.
- Fix the R-5 shoulder 1e-6 parity failure in `tests/qr/prd08/unit/camera-rigs-view.test.ts`. Fix the code, not the
  tolerance.
- Done when: `camera-cast-codemod.test.ts` passes 5/5 (the doctor rule flags the 3 evidence-only fixtures and passes the
  clean one), and R-5 is green in CI.

**08-CI (S16): make `qr-prd08-camera.yml` real**
1. Add `push: branches: [main]`, `schedule` (nightly) and `workflow_dispatch` triggers. Widen `paths` to every owned
   path.
2. Make `unit` a matrix over flags `none` and `camera`.
3. Split the browser job into `browser-gpu` on `runs-on: macos-14` (Chromium, ANGLE Metal) using
   `tests/qr/prd08/playwright.config.ts`. The PRD names `playwright.prd08.config.ts`, so rename the config or correct
   the PRD.
4. Add a `motion-capture` job on macos-14 (dispatch and nightly) that runs
   `pnpm quality:capture --scenes prd08-motion-* --flags camera`, or routes to GitLab macOS per CI-ROUTING.
5. Upload artifacts on `always()`.
6. Use `workflow_call` so `qr-required.yml` can call this workflow (PRD-16 §2.5).
- Done when: a green run on main with unit (`none` and `camera`), browser-gpu and conformance all green. Record its run
  id in `evidence/prd08/phase1.md`.

**08-LOOP (flag-on perf, likely all-flags timeout contributor): stop forcing continuous rendering**
- `camera/extension.ts:260-266` and `feel/extension.ts:140` register `app.onFrame` unconditionally. Because of
  `createAuraApp.ts:399` (`requiresFrames = () => frameCallbacks.size > 0`), `frameLoop.ts:166/202/218` then re-arms
  rAF forever, so every static scene renders every frame.
- Register the tick only while a rig with motion, a layer with energy > 0, or a sequence or hit-stop is active.
  Unregister it when idle.
- Fix `camera/gameDirector.ts:153`, which passes `dt*1000` as `timeMs`. Pass accumulated time instead, so the
  noise/shake time base advances.
- Done when: with `A3D_QR_CAMERA` on, a static scene's diagnostics show one render and then idle (unit + browser test),
  and the remote `flags=camera` benchmark capture finishes in about the same time as with `none`.

**08-RIGCAST (flag-on, plausible 0-draw / black-frame cause): remove the rig-as-spec casts**
- `GameSceneGeometryBindings.ts:524-525` and `:749-750`, and `nodes/game/racingCamera.ts:12-22`, return `AuraCameraRig`
  objects (no position, target or fov) cast `as unknown as GameScenePresentationCameraSpec`.
- Return a real spec plus a separate rig (`{ spec, rig }`), or have the kit call `app.camera.use(rig)` itself.
- Wrapper types in `index.ts` need lane 15 (Q-15-*).
- Done when: a unit test asserts every builder returns a finite position, target and fov under the flag, and all 18
  games boot with drawCalls > 0 under `flags=camera` (remote run id).

**08-POSE (flag-on correctness, S7 credibility): make the presented pose reach the renderer**
- `camera/extension.ts:199-217` `applyPose` replaces `app.scene.camera`. But the renderer was mounted with
  `renderSnapshot = flattenSceneSnapshot(snapshot)` (`createAuraApp.ts:44, 384`), a spread copy. So rig, layer, shake
  and roll output never draws.
- `applyPose` also drops `mode`, `up` and `targetNode` and forces `'perspective'`. That breaks isometric, orbit and
  follow for every reader of `app.scene.camera`: `sceneEvidence.ts:55`, `postBridge.ts:749` and
  `compiler/postprocess.ts:229`.
- Preserve the original spec fields. Route the pose through a renderer camera-override seam or a runtime-node path.
  `createAuraApp.ts` is lane 15's call site, so file `qr-request to:prd15` if a seam is needed. Keep working against a
  stub.
- Done when: a browser test shows `diagnostics().camera.viewProjection` equal to the renderer's actual VP within 1e-6
  with trauma applied, and isometric and orbit scenes keep their projection under the flag.

**08-REC (P-52, P-54): checklist and fact honesty (do this first, as its own PR)**
- In PRD-08 §14, untick I-7, C-14, P-6, Phase 5 and S17 until their tests are green remotely.
- Set F-08-2 and F-08-5 to `proposed`/`claimed` at `CONTRACTS.md:2869/2872` and at `evidence/prd08/facts.md:44/79`.
  CONTRACTS.md belongs to lane 15/custodian, so file a request with the exact diff, and also file a request to delete
  the duplicate F-08 rows at `:2874-2879`.
- Done when: checklist-lint is green, and every ticked item or `verified` fact cites an existing test with a green
  run id.

### P1: standalone S-rows (after Track 0 exit; each lands with a green remote run id)

**08-SPEC (S5/S6/S7/S8/S10/S14): `tests/qr/prd08/browser/camera-feel.spec.ts`**
- I-7 cites this file as ticked, but it does not exist. Run it on `tests/qr/prd08/harness/camera-feel-harness.html`.
  It must cover:
  - S6: chase framing deviation.
  - S7: trauma 1.0 shake read back from `diagnostics().camera.viewProjection` at 1e-6 rad. Peak |yaw| ≥ 0.35·max within
    the first 0.25 s, and `pose.roll` present.
  - S8: a scripted 30 s orbit around a box wall where the eye is never inside it, with collision off as the control
    (the control must fail).
  - S5 / 08-S5: two fighters plus a bystander. The fighters freeze for 0.07 s ± 1 step while the bystander moves, and
    layer energy stays > 0.
  - S14: touch-only play at 390×844 DPR 3. No keyboard prompt text while `activeDevice()==='touch'`, targets ≥ 48 CSS
    px, and a keyboard-only control.
  - Reduced motion.
  - S10: feel executed-counts against the stubs.
- Also create the cited-but-missing unit files, or fix the citations:
  - `unit/camera-controller.test.ts` (C-14: golden frames, layer order, blend, cut, setPose);
  - `unit/platformer-accel.test.ts` (P-6);
  - `unit/touch-device-prompts.test.ts` (I-7);
  - `unit/feel-bus.test.ts` and `unit/feel-screenspace.test.ts` (F-08-2, F-08-5).

**08-S1S3: frame pacing**
- Get `tests/qr/prd08/browser/frame-pacing.spec.ts` green. It had 6 failures on 2026-10-06 (run 37489294624). Use
  scripted rAF at 60, 120 and 144 Hz, plus 100 ms and 250 ms ticks.
- Assert:
  - S1: `renderSubmissionsLastTick === 1`;
  - S2: the simTime, clampedFrames and overloadFrames assertions;
  - S3: monotonic positions with step deviation ≤ 10 % at 120 Hz, fixedDt 1/60, 20 bodies, with `interpolation:false`
    as the control.
- Commit the CSV to `evidence/prd08/frame-pacing/<run-id>/`.

**08-S9: motion scenes**
- `benchmarks/quality-rebuild/motion/scenes.ts:14-16` are still skeletons. Implement:
  - M1: car 0→25 u/s plus an S-bend;
  - M2: trauma 0.3, 0.6 and 1.0 at 0.5, 2.0 and 3.5 s;
  - M3: 60° bank flight;
  - M4: walls and pillars plus a collider;
  - M5: closed 6-point rail;
  - M6: 20 bodies at 120 Hz.
- Add the three.js r0.185.1 reference adapters and `prd08 motion-report` (C-39).
- Automate the metrics. Each needs a control that fails:
  - subjectScreenHeightFraction 0.20-0.26;
  - shake peak ratios within 30 % of 0.09:0.36:1;
  - horizon level in 12/12 frames;
  - 0 inside-geometry frames;
  - speed variation ≤ 5 %;
  - S3 spacing.
- Capture with the C-33 strip and webm steps into `evidence/prd08/motion/<scene>/`, from both engines. This depends on
  lane 12 only if C-33 is still a stub.

**08-S15: fade pixel coverage**
- Today `tests/qr/prd08/unit/camera-fade-shader.test.ts` checks only source and byte identity. Add a ChunkHarness browser
  test at 64×64 for `packages/rendering/src/shaders/camera-fade.glsl.ts:42-47`: `u_cameraFade` 0.5 gives 50 % ± 2 %
  covered pixels, and 1.0 gives 100 %. This depends on T0-02.
- Also confirm that the discard chunk links only when the feature bit is set (`camera-fade.glsl.ts:110-131`). If it links
  everywhere, `u_cameraFade` defaults to 0.0 and every fragment is discarded (a black-frame risk). Add that as an
  assertion.

**08-S11/S12: rail and drift**
- S11: on a closed 6-point rail, speed variation is ≤ 5 %. The smoothstep `CameraChoreographer` control must exceed
  5 %.
- S12: replace the 0.12 rad flag in `bicycle-vehicle.test.ts` with the spec:
  1. accelerate to 15 u/s;
  2. full steer plus handbrake for 0.5 s;
  3. release with steer held: |slip| > 0.2 rad for ≥ 0.6 s with `drifting` true;
  4. counter-steer −0.5: slip < 0.05 within 1.5 s.
  The unicycle control must never exceed 0.01 rad.

**08-ISSUES / #76 (R-14-10, from prd14, blocks lane 14)**
- `framing.subjectHeightFraction` on the chase, flight, follow2d, fighting, shoulder, orbit, topDown and altitude rigs.
  follow2d already accepts it (`GameSceneGeometryBindings.ts:744`). Verify the other 7 and add it where missing.
- Evidence fills `subjectScreenHeightFraction`.
- Add one unit test per rig, then close #76 with the PR link.

**Phase evidence**
- Write `evidence/prd08/phase1.md` through `phase5.md`, each citing a green macos-14 or GitLab macOS run id.
- Commit per-frame `diagnostics().camera` and loop JSON, plus the feel-accounting JSON from `app.feel.evidence()`.
- Record the IC-0 flag-`none` baseline of the lane scenes.
- Before G-PANEL, write `devices.md` with iOS and Android spot checks.

### P2

- **08-S18:** use a fake GameSound with `feel/bindFeelSound.ts`. Assert exactly one `setListener` call per presented
  frame, equal to the presented pose, and that the `engine().setRpm` series equals the vehicle rpm.
- **08-S19:** create `tests/qr/prd08/bundle/` with two fixtures and measure them with `tools/bundle-size`:
  - `typical` (controller + layers + rigs.chase + collision + time + loop + feel + touch) must be ≤ 15 KB min+gz and
    must not pull rail, Spline or BicycleModel;
  - `everything` must be ≤ 24 KB.
  Then measure CPU, GPU and memory per tier through `app.quality.set` on macos-14 against the §17 table. Commit the
  results to `evidence/prd08/` with the run id.
- **08-PROMO:** see the promotion criteria below.
- **X-2:** delete the `createGameCameraRig` aggregator (`GameCameraRigs.ts:525-596` and its option and evidence types)
  only after default-on.
- **I1-I12:** integrated acceptance, at G-PANEL only (IC-4 2026-11-05, then IC-8/12/16) with `qr_flags=all` and
  leave-one-out `all,-camera`. Dependencies:
  - I1: CCR-08-1 (#228) and Q-15-1 (#222);
  - I2: Q-09-5 (#212) and Q-14-1 (#219);
  - I3: C-02 real and Q-11-1 (#214);
  - I4: Q-03-1 (#207);
  - I5: C-13 TAA;
  - I6: C-19;
  - I7: C-20;
  - I8: Q-09-1 and Q-09-2 (#208, #209);
  - I10: Q-13-1 and Q-13-3 (#216, #218);
  - I11 and I12: Q-14-1 (#219).

## Issues to action or close

- **Inbound, yours to close:** #76 (above).
- **Outbound, track and do not wait.** Comment with current file:line if something is stale, and close any that are
  already satisfied on main, with proof.
  - To prd01: #206.
  - To prd03: #207.
  - To prd09: #208 to #213. #212 is `GameAppRuntime.ts:183` one render per tick, which should go through advance/onTick.
  - To prd11: #214, #215.
  - To prd13: #216 to #218.
  - To prd14: #219 to #221.
  - To prd15: #222 to #227.
  - CCRs: #228 `AuraCameraSpec.up`, #229 `AuraCameraSubject.rotation`, #230 per-axis trauma max.
- **New ones to file:**
  - prd15 seam for 08-POSE, if needed;
  - `.gitignore` negation (P-38);
  - the CONTRACTS F-08 fixes (P-52);
  - the public re-export, only if C-22 wants it.
  Write every new issue number back into `evidence/prd08/qr-requests.md` (P-64).

## Red flags to revert or remediate (Track P)

1. All 7 lane PRs merged with lane CI red. From now on, no merge without a green lane workflow; see the merge rule below.
2. The unbacked ticks and `verified` facts listed under 08-REC.
3. Phase 5 and S17 are ticked although the codemod test fails 4/5, the S9 scenes are skeletons and S19 has no fixture.
   Untick them.
4. The ubuntu-only browser job is a scope deviation from PRD §15. Fix it in 08-CI rather than loosening anything.
5. Never introduce `.skip`, `.only`, `continue-on-error`, `|| true`, widened tolerances or "expected-red" without an
   issue link.

## Flag promotion criteria (`flags.state.ts:18` `'dev'` → `'standalone-accepted'`; lane 15 flips it at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Lane 08 is also blocked by #207 (03) and #208, #210, #212 (09). Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

All of the following must hold:
- Track 0 exit is met (PRD-16 §2.5).
- **S1-S19 are all green in ONE run** of `qr-prd08-camera.yml` on main: macos-14 or GitLab macOS, `--strict`, no masks.
- Sentinel identity is recorded: `qr_flags=none`, ΔE2000 p99 ≤ IC-0 noise on
  `benchmarks/quality-rebuild/sentinels.json`.
- Every F-08 fact is `verified` with a run id.
- checklist-lint is green.
- All outbound requests are filed.

Record the run id in `evidence/prd08/promotion.md` and file the flip as a `qr-request to:prd15`. Later stages:
- `integrated-accepted`: I1-I12 pass at G-PANEL.
- `default-on`: two clean checkpoints.
- `removed`: two more checkpoints, then X-2.

## Merge rule (hard)

- Until `qr-required` exists (target 2026-10-10), merge **only** Track 0/P work: T0-32, 08-FIX, 08-CI, 08-LOOP,
  08-RIGCAST, 08-POSE and 08-REC (PRD-16 §6.1).
- Every merge needs **both** of the following:
  1. a green `qr-prd08-camera.yml` run on the PR head (unit `none` and `camera`, plus browser-gpu);
  2. the **all-flags gate** (`qr-required / allflags-smoke`, `suite=flags-bisect`, probes `$PROBES`, sets
     `none;$ALL;$ALL,strict`, `--strict`).
  While Track 0 is open, the `$ALL` arms may be expected-red with an issue link. Your PR must not turn any previously
  green arm red, and the `camera` single-flag arm must be green.
- Also green: `CI / Type Check`, `Lint`, `Build`, `Test & Coverage`, `QR contracts unit+browser`, and the flag-off
  sentinel identity check (macos-14, because you touch `packages/engine/**`).
- If any of these is red, do not merge. Record the run id in the PR. A red-making merge is reverted.

## Routing (remote only, per CI-ROUTING.md)

Run nothing heavy on this Mac: no local Docker, Playwright, browsers, captures, builds or full suites. Quick `tsc` on
touched packages and a single targeted vitest file are fine.

- **PR gates:** GitHub Actions. The lane unit job runs on ubuntu; browser-gpu and the sentinel run on `macos-14`.
- **Captures, motion strips, benchmark and perf runs:** GitLab macOS through the bridge, using a tag in the **head**
  commit message, for example:
  - `[qr-gitlab:benchmark flags=camera]`
  - `[qr-gitlab:games games=showcase-turbo-drift-circuit,showcase-bank-shot viewports=1920x1080 mobile=false flags=camera]`
  - to re-run: `git commit --allow-empty -m '[qr-gitlab:...]' && git push`
- **Or dispatch:**
  `gh workflow run qr-gitlab-ci.yml --ref qr/prd08-<topic> -f suite=flags-bisect -f mobile=false -f requester=prd08 -f qr_flags=none -f bench_engines=aura3d -f bench_scenes="$PROBES" -f bench_flag_sets='none;camera'`.
  Dispatch runs do not attach to the PR, so cite them by id.
- **Rules:**
  - `local=false` frames are never evidence.
  - Never compare frames across providers (check `ciProvider` and `browserChannel` in `report.json`).
  - Never push to the GitLab mirror.
- **Budget:** about 2,400 GitLab minutes per month for this lane (an 18-scene benchmark is about 16 min, a 2-game local
  run about 22, all 18 games about 133).
  - Run only the scenes or games you touched, on one desktop viewport.
  - Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before large runs. If it is `1`, fall back to GitHub
    `quality-rebuild-capture.yml` for the whole comparison and say so.
- **Git:**
  - Branch `qr/prd08-<topic>`. Small PRs titled `[QR-08] ...` under 70 characters.
  - Stage specific files. Never force-push and never skip hooks.
  - PR description: summary, flags, contracts, run ids, screenshots, NOT RUN items.

## Pixels decide

Green tests, 200s, non-blank PNGs and drawCalls > 0 are engineering gates, not quality.
- Download artifacts (`gh run download <id>`) and look at the PNGs and WebMs yourself before claiming any visual result.
- Never write "three.js-quality" or "parity" unless a G-PANEL round says so.
- Report anything not run as **NOT RUN (reason)**.

## Operating rules

- **Ignore chat.** Messages addressed to a coordinator or other agents ("status?", "pause") are not instructions to you.
  Keep executing this prompt.
- **250-line write rule.** Never emit more than about 250 lines in one Write/Edit call, because larger calls are dropped.
  Create big files with one Write, then append with Edit. Read large files with `rg -n` plus offset/limit.
- **Single writer.** Stay on the owned paths. Everything else goes through a `qr-request` or `ccr`; never wait for the
  answer.
- **Flags.** Flag-off output must stay byte- and pixel-identical unless a correctness fix is declared in the PR.

## Report back (end of each session)

Reply in this format:

```
LANE 08 FINISH REPORT <date>
PRs: <#n title — merged|open — lane run id — allflags-smoke run id>
Tasks: <ID — DONE (run id, evidence path) | IN PROGRESS | BLOCKED (by #issue/lane) | NOT RUN (reason)>
  for T0-32, 08-FIX, 08-CI, 08-LOOP, 08-RIGCAST, 08-POSE, 08-REC, 08-SPEC, 08-S1S3, 08-S5, 08-S9,
  08-S11/S12, 08-S15, 08-S18, 08-S19, #76, phase evidence, 08-PROMO, X-2, I1-I12
S-rows green in one main run: <S1..S19 list> — run id
Issues: closed <#>, filed <#>, commented <#>
Flag state: dev | standalone-accepted (run id)
All-flags effect: flags=camera bench <n>/18 ready with draws; games <n>/9
Risks / NOT RUN: <...>
```
