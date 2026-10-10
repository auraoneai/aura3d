# Finish prompt — Lane 03: Postprocessing, AA, tone mapping, cinematic (A3D_QR_POST)

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the **finish agent for Lane 03** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Finish
**every** remaining Lane 03 task, then take `A3D_QR_POST` to `standalone-accepted`. That covers:

- PRD-16 §4.3, in `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`;
- the Lane 03 Track 0 rows: T0-15, T0-16, T0-17, and T0-07 (with lane 01);
- the Track P rows lane 03 owns: P-08, the lane-03 rows of P-22, P-26, the PRD-03 rows of P-54, P-58 (QR-03-22), and P-64
  (the lane-03 ledgers).

## Where the lane really stands (main afb475c2, 2026-10-08)

The lane is about **50 %** done. Nothing is done until a passing remote run proves it.

- **Code.** Phases 0-7 are on main behind `A3D_QR_POST`, which is still `dev` (`packages/rendering/src/contracts/flags.state.ts:13`).
- **PRs.** #133, #174 and #356 are CLOSED, but their content reached main by direct push: 9e6157b8 + 77e80ba5, fa4d0028, and
  822c19fc itself. **No PR content is left to land.** What remains is fixes, tests and evidence.
- **Proven.** Only S20 (the WGSL compile gate).
- **CI.** `post-quality.yml` has 3 successes ever, all on 2026-10-06. Its last 10 runs are red or cancelled.
  - The unit job dies at the repo-wide `pnpm typecheck:raw` (`:52`, T0-31), so vitest never runs.
  - The browser step globs `post-*.spec.ts`, matches nothing and exits 0 (`:76-84`, P-08).
  - `qr-prd03-phase6.spec.ts:55` fails with `run is not a function` (run 37774324444).
  - `qr-prd03-captures.yml` has never run.
- **All-flags capture.** On main with all lane flags on (GitLab pipeline 2926601350), 0/18 benchmark scenes rendered:
  - 12 timed out.
  - 6 reported ready but had drawCalls 0 and black frames (01, 10, 11, 12, 14, 16).
  - The all-flags games capture (pipeline 2926540757) has 9/9 games crashed or never drawing.
  - With flags `none`, main is pixel-identical to baseline (IC-0 passes).
- **Lane-03 suspects for the black frames.** These come from code reading only and have not been reproduced. Prove or disprove
  each one with pixels:
  - MSAA source not resolved before the v2 HDR stages read it.
  - GL state cache not invalidated after the raw-GL v2 stages.
  - Four per-frame throw paths inside the render loop.

## Read first (use `rg -n '^#'` plus offset/limit reads; never read a big file whole)

1. **`PRD-16-FINAL-REMAINING-WORK.md`**:
   - §2: T0-07, T0-15..T0-17, T0-31, the §2.4 bisection plan, the §2.5 all-flags gate;
   - §3: P-08, P-22, P-26, P-52, P-54, P-58, P-61, P-64;
   - §4.0, §4.3, §5.3, §6.2, §7.
2. **`PRD-03-postprocessing-aa-tonemap-cinematic.md`**:
   - §13 phases (~1606), §14 checklist (~1764), §15 tests (~2073), §16 visual tests (~2143);
   - standalone S1-S20 (~2214-2244), integrated I1-I14 (~2249);
   - §17 budgets (~2275), §21 completion (~2361).
3. **`CONTRACTS.md`**: §4 ownership, §5.3 flag states, §6 merge protocol, C-13/C-14, and the C-40 rows F-03-01..10 (`:2821-2836`).
4. **`CI-ROUTING.md`**: read it in full.
5. **`_sections/{integration-findings,issues-triage,process-remediation}.md`**: the Lane 03 rows.
6. **Ledgers and requests**: `evidence/prd03/phase*/qr-requests.md` and `evidence/prd15/requests/Q-03-*.md`. Q-03-12 covers the
   phase-6 probes.

## Owned paths (single writer; the longest prefix in `.github/QR_OWNERSHIP.json` wins)

- **Rendering:** `packages/rendering/src/{post,postprocess,reference}/`, `renderer/PostprocessExecution.ts`, `forward/Velocity.ts`,
  `webgl2/LegacyPost.ts`, `cinematic/{Bloom,Vignette,FilmGrain,DepthHaze}Pass.ts`, `RendererPostprocessPlan.ts`,
  `PostProcessPass.ts`, `TemporalHistory.ts`.
- **Engine:** `packages/engine/src/agent-api/{postBridge,postPresets}.ts`, `compiler/postprocess.ts`, `nodes/effects.post.ts`.
- **Apps and tests:** `apps/postprocessing-*`, `tests/browser/qr-prd03-*`, `tests/unit/contracts/impl/prd03-*`.
- **CI and docs:** `.github/workflows/{post-quality,qr-prd03-captures}.yml`, `PRD-03-*.md`, `evidence/prd03/**`.

**Files you don't own.** Change them only through a `qr-request` issue:

```
gh issue create --label qr-request --label to:prdNN
```

This covers:

- lane 01: `webgl2/WebGL2Device.ts`, the `Counters.ts` host registration, `Renderer.ts`;
- lane 15: `tools/bundle-size/**`;
- lane 12: the benchmark harness.

If a co-owned one-liner is unavoidable, record the owner's acceptance in the PR body (§3.3 rule 3).

**Retro sign-off (P-61).** #359 and #361-#364 crossed lanes without sign-off. Get acceptance recorded in those PR threads from:

- lane 07: `effects.ts`, `BloomPass`;
- lane 01: `Renderer.ts`;
- lane 12: `common.ts`;
- lane 11: `WebGPUPostShaders.ts`.

If acceptance doesn't come, revert those edits.

## Remaining tasks (exact IDs, in order)

### Wave A — P0: the combined build must render (Track 0)

Use one PR per row. Each PR needs a bisect run (§2.4, `bench_flag_sets='none;post;$ALL;$ALL,-post'` on the probe scenes)
showing the set it unblocks.

| ID | Task (file:line) | Done when |
|---|---|---|
| T0-15 / FLAG-ON-1 | **Resolve the MSAA source.** `runV2HdrStages` (`post/v2Stages.ts:453-498`) samples `asGlTarget(source).colorHandle` and `depthTextureHandle`. These are written only by `WebGL2Device.resolveMultisampleTarget` (`:1180-1195`). That call happens inside `presentLdrPostprocess` (`LegacyPost.ts:224`), on the pooled `workSource`, never on the source. The default sampleCount is 4 (`Renderer.ts:703/1006`). Expose `host.resolveMultisampleTarget` on `WebGL2DeviceHost` (`Counters.ts`; lane 01 request or co-signed one-liner) and call it at the top of `runV2HdrStages`. Add a mock-host unit test and a browser case. | AO on, sampleCount 4: mean luma > 0.05 in a CI browser run |
| T0-16 / FLAG-ON-2 | **Invalidate the GL state cache.** Call `host.stateCache.invalidate()` at the end of `runV2LdrTail` (`v2Stages.ts:919-1067`, called at `LegacyPost.ts:2833-2836`) and of `runV2HdrStages`. Alternatively, wrap both in save/restoreFullscreenPresentationState. `draw()` (`:197-217`) issues raw useProgram, bindVertexArray(null), bindFramebuffer, disable(DEPTH_TEST/BLEND) and bindTexture calls, and `WebGL2StateCache.ts:68-89` caches all of that state. The tail runs whenever `v2NeedsLdrTail` (`:908-912`) is set. | unit test asserts invalidate is called; two-frame spec with vignette + SMAA has frame-2 drawCalls == frame-1 and a non-black frame |
| T0-17 / FLAG-ON-3 | **Fix the HDR present on tone-mapping-off frames.** `output.toneMapping:'none'` keeps `rgba16f` (`compiler/postprocess.ts:129, 166-167`). That throws `WEBGL_LDR_POSTPROCESS_FORMAT_UNSUPPORTED` (`PostprocessExecution.ts:203-206`, `LegacyPost.ts:233-238`), and bloom without tone mapping throws `HDR_BLOOM_TONEMAPPING_REQUIRED` (`:220-225`). Inject a linear OutputPass when there is no tone pass, or target `rgba8`. | unit: `'none'` with and without bloom does not throw; browser frame is non-black |
| T0-17 / FLAG-ON-4 | **Remove the per-frame throws.** `assertPostPassOnGpu` (`PostprocessExecution.ts:567-579`) throws `POSTPROCESS_PASS_NOT_GPU` on every frame in non-PROD builds (`:632-636`), and the harness is non-PROD. It is reached when the v2 seam declines (`:170-171`) and the CPU loop runs (`:285`, `:433`). Examples: compat.post `'3.0'` volumetric-light (`compiler/postprocess.ts:222`), and dof/ssao/ssr without depth (`:309`). Record-and-skip in all builds, or make `ready()` reject once at compile time. The depth and camera throws at `v2Stages.ts:454-466` become compile-time or C-36 degradations. | no per-frame throw path under `post`; test covers compat.post `'3.0'` in dev mode |
| T0-07 (with 01) | **Report the dropped post chain.** `Renderer.ts:665-672` and `:968-975` drop the post chain under `A3D_QR_CORE_OUTPUT`. Report the drop as C-31 `output.postSkipped` plus a C-36 degradation, then route the chain through PostGraph v2. Lane 03 provides the post-hdr contributor; lane 01 edits the Renderer. | `postSkipped` is reported, then reaches 0 with `core,post` |
| 03-ATTR / FLAG-ON-5 | **Attribute the black frames.** Run the GitLab bench with `none`, `post`, `$ALL` and `$ALL,-post` on 01/10/11/12/14/16 plus 02/03/13. Collect `diagnostics().post` (submittedPasses, skipped), errors and console output. Confirm `POST_FIELD_UNSUPPORTED` (`compiler/postprocess.ts:245-250`; `postBridge.ts:484-500, 532-559, 651-653`) rejects no bench scene. This needs lane 12's T0-10/T0-11 fail-fast and the §2.3 inputs; until then, use the lane-12 bisect branch. | per-scene table in `evidence/prd03/track0/<run-id>.md`; each lane-03 regression fixed or filed as `qr-ic-regression` `to:prd03` |

### Wave B — P0: CI that tells the truth (Track P)

| ID | Task | Done when |
|---|---|---|
| 03-CI1 / P-08 | Replace the glob at `post-quality.yml:76-84` with an explicit list of `tests/browser/qr-prd03-*.spec.ts`: fxaa, post-banding, post-lut, v2-tone, post-no-readback, phase4, capture-dsf2, wgsl-compile, phase6. An empty match must `exit 1`. Upload artifacts on `always()`. Add `push: branches:[main]` and `schedule` triggers (§4.0). | a post-quality run records each qr-prd03 spec's result |
| 03-CI2 | Get the unit job to reach vitest. Typecheck **stays repo-wide**: T0-31 says do not scope the gate away. Fix the lane-03 files that fail it, and get the other owners to fix theirs through the T0-31 issue. Narrow `paths` (`:9-31`) to the lane-03 owned paths so other lanes' `packages/rendering/**` edits stop triggering the ownership audit (`:55`). | `vitest run tests/unit/contracts/impl` (prd03-*) green in post-quality on main |
| 03-S18d | Fix the harness race. Register `window.runQrPrd03Phase6` before the spec calls it, and gate the call on a published ready symbol rather than a timeout. | `qr-prd03-phase6.spec.ts:55` no longer throws `run is not a function` |
| P-22 / P-26 | Remove the masks in the lane's specs (see "Red flags to revert"). | the specs fail when a feature is broken |

### Wave C — P0/P1: make the features work, then prove S1-S19

| ID | Task (file:line) | Done when |
|---|---|---|
| 03-S18a | **SMAA.** `effects.antiAlias({mode:'smaa'})` must produce `pipeline.antiAliasing='smaa'`. Today `compiler/postprocess.ts:99-120` resolves AA only when `authoredAntiAlias` is set, and `:202-206` and `:268` submit no pass (see also `post/PostAntiAlias.ts`). Once that is fixed, `v2NeedsLdrTail` fires and S11 runs (`v2Stages.ts:1002-1030`) after `smaaTexturesReady` loads (`:371-402`). The probe must wait for the lazy textures to load. | SMAA edge error ≤ FXAA and within 10 % of three SMAAPass |
| 03-S18b | **Auto-exposure.** The value must flow `output.autoExposure` → `createRootPostPipeline` (`postBridge.ts`) → `pipeline.autoExposure`, and the S8 meter (`v2Stages.ts:~820`) must adapt. Today `settleSeconds` is 0. | settle ≤ 1.5 s with 0 readbacks |
| 03-S18c | **Custom passes.** `Prd03PostSurface.addPostPass` must feed `mergedCustomPasses(pipeline)`. Delete the `post-graph-v2-pending` stub (`PostGraph.ts:366-373`) and the `POST_GRAPH_V2_PENDING` throw (`:382-383`). | all 5 insertion points run in order; a display pass placed before tonemap is rejected with `POSTPROCESS_SPACE_INVALID` |
| 03-S1..S5, S16 | Record CI runs for: C-13/C-14 conformance; the flag-off sentinel; `prd03-post-{bridge,diagnostics,graph-order,exposure-aa,quality-tiers,presets}`; `prd03-v2-codemod`; and the `qr-prd03-v2-tone.spec.ts` single-tonemap browser run. | one run id per row (needs 03-CI2) |
| 03-S6 | ACES tone ramp on `prd03-tone-ramp` vs three@0.185.1, on macos-14. | mean ΔE2000 ≤ 1.0; metrics JSON and side-by-side image in `evidence/prd03/phase1/` |
| 03-S7 | Run `qr-prd03-fxaa.spec.ts` on `prd03-thin-aa` at DSF 1 and 2. | crawl ≤ three FXAAPass × 1.2 for cases (a)-(c), in CI |
| 03-S8 | Run `qr-prd03-post-banding.spec.ts` on `prd03-night-fog-banding`. | equal-run ≤ 1.5× ideal; Sobel contour < 0.5 % |
| 03-S9 | **Write** `tests/browser/qr-prd03-bloom-energy.spec.ts` on `prd03-hdr-bloom`. Fit `mapThreeUnrealBloom` and freeze the fit in `evidence/prd03/phase2/bloom-mapping-calibration.md`. Check the held-out `prd03-scene18-bloom` against the frozen fit. Check the Courier Rush van with `?a3d-qr=post`. | strengths 2/4/8 give halo ∝ excess ±10 %; ≤ 0.5 % added luma below the knee; scene 18 within ±15 % of three; van ≤ 2 % of pixels at 255 |
| 03-S10 | Run `qr-prd03-post-lut.spec.ts` (NOT RUN so far). | ≤ 1 LSB, in CI |
| 03-S11 | Extend `qr-prd03-post-no-readback.spec.ts` to all 18 game routes, 300 frames each. Count readbacks with C-28 `counters().readbacks` plus a spy on `WebGL2RenderingContext.prototype.readPixels`. | 18/18 rows with readbacks == 0, committed |
| 03-S12 | Deep Recovery with `qr_flags=post`, 1280×720, god rays on. Then run 25b on `prd03-night-fog-banding`. Needs T0-15. | median frame ≤ 50 ms; shafts add ≥ 3 % luma, occluded region ≤ 0.5 %, 0 readPixels |
| 03-S13 | GTAO on `prd03-ao-grounding`, fallback path. Needs T0-15. | ≥ 15 % darker within 10 cm of contact; open floor changes ≤ 2 % |
| 03-S14 | TAA. Measure the ghost as a width in px (longest pixel run), not a pixel count. Treat `untested` as a failure for every standalone case. Only the pan adapter waits on lane 08's QR-03-13 (C-22). | static std ≤ 0.01; pan ghost ≤ 2 px; cut within 2 LSB; TAAU ≤ 1.3×; MSAA fallback emits `TAA_VELOCITY_COVERAGE` |
| 03-S15 | Motion blur and DOF through `RendererPostProcessOptions.v2`. | MB at 30 vs 60 fps within 10 %; DOF bokeh 12.3 px ± 15 %; metrics committed |
| 03-P0 | Dispatch `qr-prd03-captures.yml` with `qr_flags=none`, all 18 games, 1920×1080, 1280×720 and mobile, `run_dsf2=true`. It has never run, so verify its bridge dispatch (`:79-94`) first. Commit the contact sheets and `report.slim.json` under `evidence/prd03/phase0/`, and put measured sizes in `bundle.json`. Depends on lane 12 for the QR-03-2/15 scene router and Q-12-1 DSF2. | run id; 18×3 games plus 7 lane scenes committed; PRD line ~1813 ticked with the run id |
| 03-S17 / P5-exit | Run `qr-prd03-captures.yml` with `qr_flags=post` on the 18 unmodified routes at DSF1, DSF2 and mobile, and compare against 03-P0. Report newly enabled GTAO and TAA separately. Needs Track 0 exit. | 18/18 with no black frame, crash or console error; DSF1 median ≤ +10 %; results in `evidence/prd03/phase5/` |
| 03-S19 | `tools/bundle-size/index.ts` (lane 15 owns it; file QR-03-3) lacks the `@aura3d/rendering/contracts` and `/contracts/flags.state` aliases. Once they exist, run `pnpm check:bundle-size` **remotely**. | cinematic starter ≤ 400,000 B (the P-23 restored budget); v2 code only in the `import('../post/v2Entry')` chunk; green on main |

### Wave D — P1/P2: issues, records, requests

| ID | Task | Done when |
|---|---|---|
| #91 | Call `guardPostprocessPlan` (`quality/PostprocessGuard.ts:79`) from `renderer/PostprocessExecution.ts`. Replace `createRenderTarget` (`:227`, `:257`, `:378`, `:407`) with `renderTargetPoolSlot` acquire/release. Add `frameStatsSlot.scope('post')`. All of this sits behind `A3D_QR_TIERS`. This blocks lane 11. | landed with a unit test; close #91 with the run id |
| #95 | Emit `EFFECT_PENDING_GPU_PASS:<name>` from `compiler/postprocess.ts`; volumetricLight is already skipped at `:222`. Confirm the gating for contactShadow, filmGrain and CA. | the diagnostic is tested; close #95 |
| #207 | Register a C-13 post pass that reads blackboard `prd08.screenFeel` (`AuraScreenFeelUniforms`) and sets `prd08.screenFeel.consumed=true`. The Low tier applies flash + vignette only. The engine side reads the flag at `engine/src/agent-api/feel/extension.ts:158`. Needs 03-S18c. This blocks lane 08 (§5.3). | a test shows `consumed=true` and changed pixels; close #207 |
| #315 | Remove `cinematic/{BloomPass,FilmGrainPass,VignettePass,DepthHazePass}` at A3D_QR_VFX removal. | leave open; it is gated on default-on ×2 |
| Q-03-12 | Resolve the phase-6 probe failures by fixing the features (03-S18a-d). **Do not** mark the specs untested or skipped. | the repo doc is marked resolved, with the run id |
| 03-REC | Untick the PRD-03 rows bulk-ticked by d4f65a88 that have no browser evidence (P-54; 21 Phase 4-7 rows). F-03-01..05 (`CONTRACTS.md:2821-2825`) become `verified` only with run ids; for example F-03-02 via the S5 run and F-03-03 via S9. Fix the non-schema `landed` status on F-03-06..10 (`:2832-2836`, P-52). Withdraw QR-03-22 (P-58) in `evidence/prd03/phase7` and `phase8` `qr-requests.md`. | records match the runs |
| 03-REQ | File each still-needed ledger row as a GitHub `qr-request` issue labelled `to:prdNN` (P-64), and write the issue number back into the ledger. Rows: QR-03-1 (15, ownership slots), QR-03-2/15 (12, scene router), QR-03-3 (15, bundle-size alias), QR-03-4 (12, Q-12-1 DSF2), QR-03-5 (15, codemod verb), QR-03-9/10 (15, AuraEffectType union, `POST_DUPLICATE_STAGE`), QR-03-11 (11, R32F/RG32F/R8/RG16F), QR-03-12/13 (08, timeScale, C-22 camera), QR-03-14 (01, Q-01-2 velocity MRT), QR-03-18 (13) and QR-03-19 (15) for `apps/postprocessing-custom`, Q-01-5 (01), Q-15-3/4 (15). Today `gh issue list --search from-prd03` returns none. | every row has an issue number or a recorded "landed" |
| 03-PROMO | Request `standalone-accepted` only once every promotion criterion below holds. | the lane-15 custodian moves `flags.state.ts:13` |
| 03-I | G-PANEL I1-I14 at IC-4 (2026-11-05) or later, with `qr_flags=all` and `all,-post`. Depends on: 01 (C-05 real AgX/Neutral, Q-01-2), 07 (Q-07-2 DOF/MB nodes), 14 (Q-14-1 codemod `--write` + emissive retune), 11 (Q-11-2/3), 13 (Q-13-1), 12 (C-32 G-PANEL). | integrated-accepted |
| Phase 8 | Only after default-on ×2. Delete the legacy programs in `webgl2/LegacyPost.ts`, the LDR bloom LUTs, `postprocess/NativeLdrEffectLuts.ts`, `resolveBloomPyramidResponseGain`, the CPU readback branch (`PostprocessExecution.ts:486-559`), compat.post, and the cinematic shims (#315). | `rg 'subpixelBlend|ResponseGain'` in lane-03 paths returns nothing; every gated bundle target ≤ its Phase 0 baseline |

## Red flags to revert (do these in Wave B; no exceptions)

- `.github/workflows/post-quality.yml:76-84`: the empty `post-*.spec.ts` glob exits 0. Fix it in 03-CI1.
- `post-quality.yml:9-31` together with `:55`: the paths filter covers all of `packages/rendering/**` and the ownership audit
  runs on every lane's PR, so the lane check is red on every other lane's PR. That makes red normal. Fix it in 03-CI2.
- `tests/browser/qr-prd03-phase4.spec.ts`:
  - `:91`: the TAA threshold is `ghostPixels <= 64`. Restore ghost width ≤ 2 px.
  - `:89-115` (also `:96`, `:101`, `:115`): the `!untested` guards make cases pass vacuously. Make `untested` a failure.
- `tests/browser/qr-prd03-phase6.spec.ts`:
  - `:~98-99`: the SMAA check is only `> none × 1.5`. Restore "≤ FXAA and within 10 % of three SMAAPass".
  - `:103`: `if (r.untested) test.skip()` on auto-exposure. Remove it.
- `tests/browser/qr-prd03-wgsl-compile.spec.ts:68`: skips when there is no WebGPU. Keep the skip only if CI first asserts that
  the runner has a WebGPU adapter. Otherwise the job must fail under `process.env.CI` (P-22 `requireOrSkip()`).
- Q-03-12's suggestion to mark the failing phase-6 specs untested or skipped "rather than shipping a red lane": **refuse it.**
- PRD-03 checklist rows bulk-ticked by d4f65a88 (21 Phase 4-7 rows): untick them (03-REC).
- QR-03-22 asks for standalone-accepted on the basis of "instruments landed": retract it.
- Process, not a code revert: #359 and #361-#364 merged with red Lane 03 unit, bundle-size, arch-gates and pack-check checks.
  #364 merged 23 s after post-quality started. Phases 0-2 bypassed PRs via direct push. None of this may happen again (merge
  rules below).

## Flag-promotion criteria for `A3D_QR_POST` (PRD-16 §4.0; only lane 15 changes `flags.state.ts:13`, at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

- **`dev → standalone-accepted`.** Earliest checkpoint is IC-2 (2026-10-22). All of the following must hold:
  - Track 0 exit is met (§2.5).
  - S1-S20 are green in **one** post-quality run on main: macos-14 or GitLab macOS, `--strict`, none of the §3 masks, and
    0 untested or skipped cases.
  - The sentinel identity check passes with `qr_flags=none` (ΔE2000 p99 ≤ the IC-0 noise floor on `sentinels.json`), with
    its run id recorded.
  - F-03-01..05 are `verified` with run ids.
  - checklist-lint is green, i.e. every `[x]` in PRD-03 carries a `run:` or `capture:` id.
  - Every outbound request is filed (03-REQ).
  - #91, #95 and #207 are closed.
  - Then file the promotion request as a GitHub `qr-request` issue `to:prd15` that lists the run ids.
- **`→ integrated-accepted`.** I1-I14 pass at a G-PANEL round with `qr_flags=all` and the leave-one-out `all,-post`.
- **`→ default-on`.** Two consecutive checkpoints with no attributed `qr-ic-regression`.
- **`→ removed`.** Two more clean checkpoints, then one Phase 8 removal PR that updates `REMOVED_QR_FLAGS`.

## Merge rules (binding; PRD-16 §3.3)

- **Every merge needs both of these green on the PR head:**
  1. the lane workflow (`post-quality.yml`, both unit and browser jobs);
  2. the all-flags gate. That is `qr-required / allflags-smoke` (§2.5), which runs `none;$ALL;$ALL,strict` on the 6 probes.
     While Track 0 is open, the `$ALL` arms may be expected-red **with an issue link**, but a PR that turns a previously green
     arm red fails. Until `qr-required` exists (lane 12 targets 10-10), attach an equivalent `flags-bisect` run on your head SHA
     to the PR.
- The other required checks (§2.5 list) must also be green.
- "Pre-existing failure on main" is not an exemption.
- No merge while any check is queued or running.
- **No direct pushes to `main`**, no local merges into main, and no force-push. Stacked PRs merge bottom-up into main, and each
  one needs its own green run.
- Until the lane-03 workflow is green on main, the only lane-03 merges allowed are Track 0, Track P and Wave B work (§6.1).

## Remote-only routing (CI-ROUTING.md; never local)

- **Local machine.** The only things you run locally are editing, `git`, `gh` reads, `rg`, `tsc` on touched packages, and
  targeted single-file vitest. Nothing else runs here: no local Playwright or Chromium, no captures, no full test suites, no
  heavy builds, no Docker.
- **PR gates.** Typecheck, lint, unit and ownership run on GitHub ubuntu. Browser conformance and the flag-off sentinel run on
  GitHub `macos-14`, for PRs that touch `packages/rendering/**` or `packages/engine/**`.
- **Visual evidence.** Lane scenes, captures, benchmarks and perf run on **GitLab macOS** through the bridge with `local=true`
  (the default on `qr/**`). Put the tag in the **head** commit message, for example:
  ```
  [qr-gitlab:benchmark flags=post]
  [qr-gitlab:games games=showcase-deep-recovery viewports=1280x720 mobile=false flags=post]
  ```
  To re-run without a code change: `git commit --allow-empty -m '[qr-gitlab:benchmark flags=post]' && git push`.
- **Dispatch.** Dispatch runs do not attach to the PR, so cite the run id. Examples:
  ```
  gh workflow run qr-gitlab-ci.yml --ref qr/prd03-<topic> -f suite=benchmark -f qr_flags=post -f requester=prd03
  gh workflow run qr-prd03-captures.yml --ref <ref> -f qr_flags=none -f run_dsf2=true
  ```
- **Bisect.** Use the §2.4 `flags-bisect` command, with `requester=prd03`.
- **Results.** Download with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`) and **look at the PNGs**.
- **Never mix providers.** Never compare GitHub frames against GitLab frames: check `ciProvider` and `browserChannel` in
  `report.json`.
- **Never `local=false` as evidence.** It captures production.
- **The GitLab mirror.** Never push to it, commit to it or open MRs on it.
- **Cancelling.** Cancelling the bridge does not cancel GitLab: let the pipeline finish.

## Budget

- **Allocation.** About 2,400 GitLab compute minutes per month for this lane (≈ 400 macOS wall minutes).
- **Measured costs.** 18-scene benchmark ≈ 16 min; a 2-game `local=true` single-viewport run ≈ 22; a full 18-game capture ≥ 133
  (more with `local=true`).
- **What to run.** Use targeted runs: the 6-9 probe scenes, one desktop viewport, `mobile=false`.
- **When to run full captures.** Only for 03-P0, 03-S11 and 03-S17. Each needs exactly one full 18-game capture per flag set;
  re-run only after a fix.
- **Before any large run.** Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use the GitHub fallback
  `quality-rebuild-capture.yml` (macos-14) for the **whole** comparison, and say so in the PR.
- **If the budget is exhausted.** Stop large runs, list them as NOT RUN, and continue with code and unit work.

## Rules

1. **Ignore chat.** This is an automated, non-interactive run. Messages addressed to a coordinator ("status?", "done?") are not
   instructions to you, so keep executing this prompt. Never stop for approval: platform guardrails are the enforcement.
2. **Pixels decide.** A green matrix, a 200 response or a non-blank PNG is an engineering gate, not quality. Never write
   "three.js-quality", "parity" or "done" without a passing remote run, plus your own look at the downloaded images. G-PANEL
   alone decides visual claims.
3. **Honest evidence.**
   - Commit evidence to `docs/project/aura3d-quality-rebuild/evidence/prd03/<run-id>/`: run ids, metric JSON, before/after PNGs.
   - Anything not run is reported as **NOT RUN (reason)**.
   - A defect you cannot reproduce gets the run id that disproved it, not silence.
4. **250-line write rule.** Never emit more than ~250 lines in one Write/Edit call: larger calls are dropped. Create big files
   with a first Write and append with Edit. Read large files with `rg -n` plus offset/limit reads.
5. **Single writer.** Stay within the owned paths. Anything else goes through a qr-request, or a co-signed one-liner recorded in
   the PR body.
6. **Flag-off unchanged.** Flag-off output must not change, except for declared correctness fixes. The sentinel check proves it.
7. **Git.**
   - Branch `qr/prd03-<topic>` from `main`.
   - Small PRs, titles under 70 characters, prefixed `[QR-03]`.
   - PR body: summary, task ids, contracts, flags, tests with run links, PNG links, NOT RUN items.
   - Stage specific files only; never `--no-verify`.
   - Never run `gh auth login|logout|refresh`, and never set `GH_TOKEN` or `GITHUB_TOKEN`.

## Report back (end of each session; short and factual)

```
LANE 03 FINISH REPORT  <date>  main=<sha>
Tasks closed:    <id> — PR #<n> — run <id> (<provider>) — evidence <path>
Tasks open:      <id> — state — blocker (lane/issue)
S-rows green:    S1..S20 with run id each; others = FAILING|NOT RUN (reason)
Track 0 rows:    T0-07/15/16/17 — status — bisect run id — none/post/$ALL/$ALL,-post result
Issues:          closed #… ; opened qr-request #… (to:prdNN) ; qr-ic-regression #…
Records:         unticked rows, F-03 status changes, QR-03-22 withdrawn (y/n)
Red flags:       each reverted (commit) or still present
Flag state:      A3D_QR_POST=<state>; promotion request #<n> or "not eligible: <missing criteria>"
GitLab minutes:  used this session ≈ <n>; QR_GITLAB_PAUSED=<0|1>
NOT RUN:         <item> — <reason>
Risks:           <one line each>
```
