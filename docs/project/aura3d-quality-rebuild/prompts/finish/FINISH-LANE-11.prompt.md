# Finish prompt — Lane 11: WebGPU, GPU architecture, performance tiers (A3D_QR_TIERS, A3D_QR_WEBGPU)

Copy everything below this line into a fresh coding agent started in the repo root of `https://github.com/auraoneai/aura3d`.

---

You are the **finish agent for Lane 11** of the Aura3D Quality Rebuild. The lane's 9 PRs (#150, #162, #168, #178, #186, #190,
#197, #199, #342) are merged into `main` and their code is on `main` (base `afb475c2`). **The lane is not done.** About 40-45 %
complete, 0/82 PRD-11 checklist items ticked, `A3D_QR_TIERS` and `A3D_QR_WEBGPU` still `dev`
(`packages/rendering/src/contracts/flags.state.ts:21-22`), and no S-gate except S10's repo checks has ever been proven in CI.
Your mission: finish **every** remaining Lane 11 task in `PRD-16-FINAL-REMAINING-WORK.md` §4.11 (plus the lane-11 rows of
§3 Track P) and the extra rows below, so the lane can be promoted to `standalone-accepted`. Nothing is "done" unless a
**passing remote run id** proves it.

## Read first (use `rg -n '^#'` + offset/limit reads; never read huge files whole)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` — §1 status, §2.5 all-flags gate, §3 Track P
   (P-09, P-22, P-30, P-31 are yours), §4.0 common rules + promotion ladder, **§4.11 your track**, §5.3 blocking list, §6.2
   checkpoints, §7 verification.
2. `docs/project/aura3d-quality-rebuild/PRD-11-webgpu-gpu-architecture-performance-tiers.md` — §14 checklist (`:1039`), §15
   tests (`:1152`), §16 S1-S12 (`:1181-1199`), §17 budgets (`:1240`), §18 browsers, §19 mobile, §20 evidence, §21 completion.
3. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md` (all of it, 147 lines), `CONTRACTS.md` §3, §4.1 ownership, §5 flags,
   §6 merge protocol, C-27/C-28/C-29 entries.
4. `docs/project/aura3d-quality-rebuild/_sections/{integration-findings,issues-triage,process-remediation}.md` (lane-11 rows).
5. The original lane prompt `prompts/LANE-11-webgpu-gpu-architecture-performance-tiers.prompt.md` (owned paths, contracts).

**Owned paths:** `rendering/src/{quality,batching,webgpu}/` (not `WebGPUPostShaders.ts`), `renderer/{CullingBatching,
RendererFactory,DeviceLifecycle}.ts`, `forward/DrawSubmit.ts`, `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`,
`program/UniformLayout.ts`, `resources/{ResourceRegistry,RenderTargetPool}.ts`, `RenderDevice.ts`, `WebGPUDevice.ts`,
`RendererTiming.ts`, `rendering/src/lanes/prd11.ts`, `engine/src/lanes/prd11.ts`, `GameRenderPreset.ts`,
`RootPerformanceQuality.ts`, `app/rendererOptions.ts`, `agent-api/devtools/sceneKitBudgets.ts`, `tools/{perf-gate,
wgsl-validate,bundle-size}/`, `.github/workflows/qr-prd11-perf.yml`, `tests/qr/prd11/**`, `benchmarks/quality-rebuild/
scenes/prd11/**`, `packages/aura3d-cli/src/commands/prd11/`, `scripts/migrations/prd11-*`. Confirm each against
`.github/QR_OWNERSHIP.json` (longest prefix wins) before editing; `performance/{FrustumCuller,BVH,Batcher}.ts` ownership is
disputed (#181 says lane 01) — check CONTRACTS §4.1 first and file a `qr-request` if not yours.

## Current verified state (do not re-audit; act on it)

- **CI never ran its gates.** `qr-prd11-perf.yml` is 0/134 green (115 skipped: PR jobs gated on label `lane:prd11` at
  `:50,68,98,134,160`). Nightlies 37578024718 and 37734120918 failed in both macos-14 jobs at the probe step:
  `tools/quality-rebuild-capture/gpu-probe.mjs:49` calls `writeFileSync(outFile, …)` with no `mkdirSync(dirname(outFile),
  {recursive:true})`, and `tests/qr/prd11/out/` / `benchmarks/quality-rebuild/scenes/prd11/out/` do not exist on a fresh
  checkout (workflow `:83`, `:116`). The probe itself returned ok on all 5 Chromium configs (ANGLE Metal Apple Paravirtual +
  SwiftShader). No browser spec (S1, S3, S6, S7, S9, S11) and no perf-gate (S4, S5) has ever executed.
- Perf-gate captures only `prd11-tier-ladder` (`qr-prd11-perf.yml:101`, dispatch default `:31`) and uploads nothing.
  Naga gate exits 0 with zero twins (`:181-184`, P-09). `webgpu-smoke` is `continue-on-error: true` (`:133`, allowed: non-gating).
- **Combined build is broken** (GitLab pipeline 2926601350, flags `core,…,tiers,…,compiler`): 0/18 benchmark scenes render.
  The black/0-draw scenes are lane 01's T0-01 (`Renderer.ts:1317-1327` MSAA+MRT HDR target). Not yours — but lane-11 code
  adds real flag-on hazards you must fix (rows T11-POOL, T11-TIMING, T11-COUNTERS, T11-RESET below).
- With flags `none`, main is pixel-identical to baseline (IC-0 pass). Keep it that way.

## Hard rules

1. **Remote only, routed per `CI-ROUTING.md`.** Never run local Docker, local Playwright/Chromium, local captures, local
   builds or full local test suites. Allowed locally: editing, git, `rg`, `tsc --noEmit -p` on a touched package, and
   single targeted vitest files under `tests/qr/prd11/unit/`. GitHub is source of truth; never push to or open MRs on the
   GitLab mirror.
   - PR gates (typecheck, lint, unit, contracts, ownership): GitHub ubuntu. Browser conformance + flag-off sentinel identity:
     GitHub macos-14 (PRs touching `packages/rendering/**` or `packages/engine/**`). Lane browser specs + perf-gate:
     `qr-prd11-perf.yml` on macos-14 (add label `lane:prd11` to every lane PR; dispatch with
     `gh workflow run qr-prd11-perf.yml --ref <branch>`).
   - Lane visual / perf / tier captures and game captures: GitLab macOS via the bridge, `local=true`. Put the tag in the
     **head** commit message, e.g. `[qr-gitlab:benchmark]`,
     `[qr-gitlab:games games=showcase-patrol-wing viewports=1920x1080 mobile=false flags=tiers,tiers.batching,tiers.governor]`.
     Re-run without code change: `git commit --allow-empty -m '[qr-gitlab:benchmark]' && git push`. Dispatch alternative:
     `gh workflow run qr-gitlab-ci.yml --ref <qr/ branch> -f suite=benchmark -f requester=prd11 …` (does not attach to the PR).
     Never use `local=false` as evidence. Download with `gh run download <run-id>` (artifact `gitlab-<suite>-<pipelineId>`).
   - Never compare frames or timings across providers (GitHub = full Chromium, GitLab = `chromium-headless-shell`). Every
     report records `ciProvider`, `browserChannel`, run/pipeline ids.
2. **Budget.** Lane 11 gets ≈ 2,400 GitLab compute minutes/month (≈ 400 macOS wall minutes). Benchmark ≈ 16 min, 2-game
   single-viewport `local=true` ≈ 22, full 18-game ≈ 133+. Prefer GitHub macos-14 (`qr-prd11-perf.yml`) for lane specs and
   perf-gate; use GitLab for game captures and checkpoint-comparable frames only. Before any large run:
   `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`; if `1`, use GitHub `quality-rebuild-capture.yml` for the whole
   comparison and say so in the PR. Never run a full 18-game capture for a lane PR.
3. **Every merge needs BOTH:** (a) a green `qr-prd11-perf.yml` run on the PR head (lane-unit, naga, browser specs,
   capture + perf-gate, all with `--strict`, no masks) and (b) a green **all-flags gate** — `qr-required / qr-required`
   including `allflags-smoke` (PRD-16 §2.5: 6 probes × `none;$ALL;$ALL,strict`, drawCalls > 0, non-blank, `errors == []`,
   ready ≤ 30 s). While Track 0 is open, the `$ALL` arms may be expected-red **with an issue link**; your PR must not turn
   any previously green arm red. Plus `CI / Type Check`, `CI / Lint`, `CI / Build`, `Test & Coverage`, `QR contracts /
   unit|browser`, sentinel identity. No merge with any red/cancelled required check ("pre-existing on main" is not an
   exemption); no merge while a lane run is queued/in progress; no direct pushes to `main`; stacked PRs merge bottom-up into
   `main`, each with its own green lane run. Until `qr-required` exists (target 2026-10-10), merge **only** Track 0/Track P
   rows (CI-0, P-09, P-22, P-30, P-31, T11-POOL, T11-TIMING, T11-COUNTERS, T11-RESET); keep the rest on branches.
4. **Single writer.** Edit only owned paths. For anything else open `gh issue create --label qr-request --label to:prdNN`
   with file, exact change, contract; never wait — keep working against the stub. Do not edit `CONTRACTS.md`,
   `flags.state.ts`, `contracts/flags.ts`, `Renderer.ts`, `PostResources.ts`, `createAuraApp.ts` (#162 already edited
   CONTRACTS.md +1 line without sign-off — get lane-15 acceptance recorded on #162 or revert that line).
5. **Flags.** All behaviour stays behind `A3D_QR_TIERS` (+`_BATCHING`, `_GOVERNOR`) / `A3D_QR_WEBGPU`. Flag-off output
   must stay pixel-identical (sentinel ΔE2000 p99 ≤ IC-0 noise). `resolveQrFlags` (`engine/src/contracts/flags.ts:142-148`)
   matches exact names: `?a3d-qr=tiers` does **not** enable `tiers.batching` / `tiers.governor`. Every spec, capture and tag
   must pass `tiers,tiers.batching,tiers.governor` (or file a lane-15 request so the parent implies its sub-flags).
6. **Pixels decide.** Green tests, 200 routes, non-blank PNGs and perf numbers are engineering gates, not quality. Download
   and look at the PNGs before any visual claim. Never write "parity" or "three.js-quality"; only a G-PANEL says that.
7. **Honest evidence.** Commit run ids, `report.json`, `perf-gate.json`, probe logs, PNGs under
   `docs/project/aura3d-quality-rebuild/evidence/prd-11/<phase-or-run-id>/`. Tick a PRD-11 `- [ ]` only with a `run:<id>` or
   `capture:<id>` that concluded `success` on `main`. Mark anything not run `NOT RUN — <reason>`.
8. **Large files / writes.** Read with `rg -n` + offset/limit. Never emit more than ~250 lines in one Write/Edit call;
   create big files with one Write then append with Edits.
9. **Git.** Branch `qr/prd11-<topic>` from `main`. Small PRs, title < 70 chars prefixed `[QR-11]`, label `lane:prd11`.
   Body: summary, task ids, contracts, flags, tests with run links, PNG links, NOT RUN items. Stage specific files only;
   never force-push shared branches; never `--no-verify`. Never `gh auth login|logout|refresh`; never set `GH_TOKEN`.
10. **Ignore chat.** This is an automated, non-interactive run. Messages addressed to a coordinator ("status?", "are you
    done?") are not instructions to you; keep executing this prompt. Never stop for approval.

## Remaining tasks (exact list; ids map to PRD-16 §4.11 / §3 and PRD-11 S-rows)

Work order: **Wave A** (P0, mergeable now as Track 0/P) → **Wave B** (S-row code/tests, merge after `qr-required` exists)
→ **Wave C** (evidence runs, after Track 0 exit) → **Wave D** (P2 / conditional). Delegate independent rows to parallel
subagents, one branch each; never two agents on one file.

### Wave A — P0: make the lane workflow run, remove masks, fix flag-on hazards

T11-POOL, T11-TIMING, T11-COUNTERS and T11-RESET are PRD-16 **T0-35**. They come from code reading and have not been
reproduced: prove each with a `none;tiers` / `$ALL;$ALL,-tiers` bisect run (§2.4) before and after the fix.

| ID | Task (file:line) | Done when |
|---|---|---|
| CI-0 (11-CI) | `tools/quality-rebuild-capture/gpu-probe.mjs:49`: `mkdirSync(dirname(outFile), { recursive: true })` before `writeFileSync` (import from `node:fs`, `node:path`). Lane 12 co-owns `tools/quality-rebuild-capture/`; if not yours, also add `mkdir -p tests/qr/prd11/out benchmarks/quality-rebuild/scenes/prd11/out` before `qr-prd11-perf.yml:83` and `:116` (yours) and file the probe fix as a qr-request to 12. Add `push: branches: [main]`, keep `schedule`; upload artifacts with `if: always()`. Then `gh workflow run qr-prd11-perf.yml --ref main`. | Probe step green and Playwright + capture steps **execute** in both macos-14 jobs (run id). |
| P-22 / skips | Convert every precondition `test.skip` to a failure on the gating job: `fps-agreement.spec.ts:91,121`; `no-readback.spec.ts:66,70,74`; `governor.spec.ts:66,68,95`; `context-restore.spec.ts:65,80`; `vao-leak.spec.ts:57,64,83`; `batching-pixel-identity.spec.ts:158`; `tier-switch-hitch.spec.ts:76,80`; `precompile-hitch.spec.ts:70,74,78`. Use a shared `requireOrSkip()` that fails when `process.env.CI` unless `QR_PRD11_ALLOW_SKIP=1` (set only in `webgpu-smoke`). `tests/qr/prd11/playwright.config.ts`: `forbidOnly: !!process.env.CI` + a reporter that fails the run on any skipped test in CI. | A green run can only come from passing assertions; a deliberately broken precondition makes the job red (run id). |
| P-09 | `qr-prd11-perf.yml:181-184`: naga gate must fail when zero WGSL twins are emitted. | Step red on 0 twins (unit/dry-run), green on main. |
| P-30 | `tools/perf-gate/budgets.json:50,62`: `S3-p50-ratio`, `S3-draw-calls` → `gating: true`. | perf-gate.json shows them gating. |
| P-31 / S7-unit | `tests/qr/prd11/unit/quality.test.ts:226-235` → PRD-11 §14 Phase 4 model: High tier, scale pinned at floor, 1.2× load, steps ±10 %; assert ≤ 2 direction changes over 3,000 frames, none in the last 1,000; `ssr` drop at frame 300±1, `ambientOcclusion` at 600±1, up-step 600±1 after the drop; mobile 120-frame windows; Medium skips `ssr`. | Assertions match §14 text; lane-unit green. |
| T11-POOL (C-28) | `rendering/src/lanes/prd11.ts:95-104` builds a new `RenderTargetPool` and registers it in `sharedResourceRegistry` on **every** factory call; `post/PostResources.ts:44-46` calls the factory per acquire/resize/trim/dispose, so `release()` hits a foreign pool (`RenderTargetPool.ts:68-71` ignores it) → post targets and pools leak (tab-OOM / "Target page closed" candidate). Memoize in `WeakMap<RenderDevice, RenderTargetPool>`, register once, unregister on device dispose. Unit: `factory(d) === factory(d)`; 100 resize cycles → live render targets flat. | Unit green + `vao-leak` / `no-readback` show flat `renderTargets` with `tiers,post` (run id). |
| T11-TIMING | `RendererTiming.ts:288-344`: `beginScope`/`endScope` call `queryCounterEXT(TIMESTAMP_EXT)` without checking `getQuery(TIMESTAMP_EXT, QUERY_COUNTER_BITS_EXT) > 0`; un-issued queries never settle → `pendingScopes` grows per frame, O(n²) polling. Check bits once; fall back to `TIME_ELAPSED` for the whole-frame scope; expire pending scopes after N frames with `deleteQuery`; discard on `GPU_DISJOINT_EXT`. Fake-GL unit (timestamps unsupported): pending list bounded, queries deleted. | Unit green; 600-frame browser run shows bounded pending scopes. |
| T11-COUNTERS | `webgl2/Counters.ts:128-153` wrapped `counters()` calls `WebGL2Device.getDiagnostics()` (`WebGL2Device.ts:1259-1290`: copies/filters all resources + `Math.max(1, ...map())`) every frame via `FrameStatsEndPass` (`rendering lanes/prd11.ts:80`); engine `lanes/prd11.ts:97` does the same per `diagnostics()`. Keep live gauges incrementally in the create/destroy wrappers (or sample every N frames). | Per-frame telemetry O(1) and allocation-free; PRD-11 §15.1 zero-allocation submission test green. |
| T11-RESET | `rendering/src/lanes/prd11.ts:126` calls `ctx.device.resetFrameCounters?.()` inside `collect`, after `Renderer.beginFrame` (`Renderer.ts:723-725`), zeroing lane-01 host `drawCalls`/`readbacks` mid-frame. Snapshot instead of reset, or reset only at frame begin through the C-01 seam. | Unit: host drawCalls for a frame equal flag-off count with `tiers` on. |
| T11-GLOBALFLAGS | `engine/src/lanes/prd11.ts:198` (`prd11SetRendererQrFlags(ctx.flags)`) writes the global last-writer-wins store (`rendering/src/renderer/FrameGraph.ts:30-35`) for every app, after mount (`createAuraApp.ts:724` vs `:448`). Fix is lane 15's T0-28; your part: once T0-28 passes flags into `Renderer.create`, delete the call from the lane-11 extension and stop it running when TIERS is off. Comment on #145. | Two-apps-per-page unit (T0-28) green with the lane-11 call removed. |

### Wave B — S-row code and tests (P1)

| ID | Task (file:line) | Done when |
|---|---|---|
| 11-S4/S5 scope | `qr-prd11-perf.yml:101` and `:31`: scenes `prd11-tier-ladder,prd11-draw-call-stress,prd11-instancing-100k` + base `16-instancing,17-*,18-*` with `--engines aura3d,three` (PRD-11 §15.3). `tools/perf-gate` emits every §17.3 row: draw-call-stress ≤ 110 draws on the legacy path, instancing-100k ≤ 1,600, p50 ratio vs three. | perf-gate.json lists measured draws + p50 ratios for 3 lane scenes and base 16-18. |
| 11-S5 culler | `performance/FrustumCuller.ts` (9 lines, `items.filter` + `new Box3(new Vector3…)` per item) → `cull(bounds: Float32Array, count, planes: Float32Array, out: Uint8Array): number`; delete the Box3 path. Unit spies Box3/Vector3 constructors: 0 allocations. Ownership per #181 / CONTRACTS §4.1 first. | Zero-alloc unit green; S5 microbench row recorded. |
| 11-S5 BVH | `performance/BVH.ts` (18-line re-export of `SceneOptimization`) → real BVH over static bounds at plan time, `refit(dynamicIndices)`, `queryFrustum(planes, out)`; `CullingBatching.ts` uses it above 256 items. Unit: 10,000 random boxes == brute force. Base for #215 `sphereSweep` and #114. | Unit green; queryFrustum 10k ≤ 0.3 ms, planBatches 5k ≤ 15 ms in perf-gate.json. |
| 11-S5 bench | `tests/qr/prd11/bench/*.bench.ts` (or vitest timing cases) in lane-unit: planBatches 5k, BVH.queryFrustum 10k, `QualityGovernor.sample` ≤ 0.01 ms, `FrameStats.end` ≤ 0.02 ms, colour refresh 5k ≤ 0.3 ms, ForwardPass + MockRenderDevice 1,000 items p50 ≤ 2 ms with 0 creations (§17.4). | Thresholds asserted in CI; numbers in evidence. |
| 11-S1/S2 | `fps-agreement.spec` measured vs rAF within 10 %; C-28 counters browser conformance "real". Needs #92 (12) and #89 (15). | Green on macos-14 (run id). |
| 11-S3 | `batching-pixel-identity` (≤ 2/255, SSIM ≥ 0.999) fails, not skips, when no frame renders; run with `tiers,tiers.batching`. | Green (run id). |
| 11-S6 | `no-readback.spec` green; post execution wiring via #91 (03). | Green (run id). |
| 11-S7 | `governor.spec.ts:68,95` fail instead of skip; recovery within 1,500 frames with `tiers,tiers.governor`. | Green (run id). |
| 11-S8 fixture | `tests/qr/prd11/fixtures/renderer-strings.json`: runner string `ANGLE (Apple, ANGLE Metal Renderer: Apple Paravirtual device, Unspecified Version)`, `Apple GPU`, SwiftShader `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)`, a WARP string, ≥ 10 real strings per `DeviceClasses.ts` row; entries `{string, mobile, expectedTier, expectedConfidence}`. `tests/qr/prd11/unit/device-classes.test.ts` asserts every entry + every §17.1 reference device; closes #53. Upload probe log as artifact. | Runner string → Low, source `classified`; unit green. |
| 11-S8 windows | `windows-latest` job in `qr-prd11-perf.yml`: 2 lane scenes, assert `diagnostics().quality.decision` tier `low`, source `classified` (pairs with #98 via 12). | Job green on nightly. |
| 11-S9 | `precompile-hitch.spec.ts`: assert `frame.programsCompiledSinceReady === 0`; skip at `:78` becomes failure. `engine/src/lanes/prd11.ts:101-103` fills it from cumulative `programCompileCount`: add a ready baseline in FrameStats/telemetry. tier-switch-hitch green. Depends T0-06 (01). | Spec asserts S9; green (run id). |
| 11-S10 | Add step to lane-unit: `rg -n "productProp\|u_productColorSmoothing\|rasterizeDraw\|colorPixels" packages/rendering/src/WebGPUDevice.ts` must be empty. | Step present and green. |
| 11-S11/S12 | `context-restore` browser green (≤ 2 s, SSIM ≥ 0.98); remote `tools/bundle-size --splitting` on main → `evidence/prd-11/<final>/bundle.json`: ≤ 19 KB gz critical path, ≤ 10 KB net of deletions. | Run ids + committed bundle.json. |
| RendererOptions | `engine/src/agent-api/app/rendererOptions.ts`: parse `quality`, `adaptive`, `targetFrameRate`, `batching`, `backend`; URL `?aura3d-quality=` / `?aura3d-adaptive=0` in all builds (`decision.source === 'url'`); deprecated `qualityProfile`/`performanceQuality` mappings with one-time warnings; remove `diagnosticOnly.prd11.ts` entries as wired. | rendererOptions unit tests green. |
| Tier propagation | `Renderer.ts:641-647` creates frame hooks without a tier → `FrameContributorContext.tier` always `QUALITY_TIERS.high` (`FrameGraph.ts`); `qualityTier` constructor-only (`Renderer.ts:443-444`). Wire AuraQuality decision → renderer via C-38 seam, or qr-request to 01/15, so DPR cap, render scale and contributor settings follow the tier (also C-36 `SceneCompileContext.quality`). | With `?a3d-qr=tiers,tiers.governor` on the runner, `diagnostics().frame.tier === 'low'` and contributors see low settings (run id). |
| GameRenderPreset | Unit for "one step per over-budget window with both active" in `createPerformanceGovernor`; confirm #111 (09) open. #67: presets honour `probeHdrTargetFormat` (`GameRenderPreset.ts:373,:450`). | Tests green; #67 closed. |
| sceneKitBudgets | `agent-api/devtools/sceneKitBudgets.ts`: rename → `budgetDrawCalls`, `budgetP50FrameMs`; drop `calibrationSource`; `kind: 'aura-scene-kit-budget'`; deprecated getters one release; cityBlock evidence from `diagnostics().world` (#262). | Unit green; #262 closed. |

### Wave C — evidence runs (P0/P1, after CI-0 and Track 0 exit)

| ID | Task | Done when |
|---|---|---|
| S1-S12 / Completion 1 | `qr-prd11-perf.yml` on main with flags `tiers,tiers.batching,tiers.governor`: fps-agreement, no-readback, batching-pixel-identity, tier-switch-hitch, precompile-hitch, governor, context-restore, vao-leak green on macos-14; C-27/C-28/C-29 conformance `real` green; flag-off sentinel green. Store `report.json`, `perf-gate.json`, probe log under `evidence/prd-11/<phase>/` (§20). | **Two consecutive scheduled nightlies conclude `success`** with artifacts uploaded and evidence committed. |
| Phase-0 profiles | `evidence/prd-11/phase-0/` has gallery-shift, aura-clash, gravity-post (substituted). Add `patrol-wing.md`; every profile carries frame p50, scopes, draw calls, triangles, readbacks, top-3 costs with file:line, from the lane workflow on the deployed route with `?a3d-qr=tiers`. Existing Phase-0 data came from GitLab 2919070060, not the lane workflow: re-run and re-cite. | 3 required games (Patrol Wing, Gallery Shift, Aura Clash) with every field + run id. |
| §19 mobile | AWS Device Farm (2 Android, 2 iPhone) via profile `auraone-production-operator` only (read `~/.config/agent-policy/reference/cloud-contexts.md` first), or label every mobile number `unverified`. | Results meet §19, or labels in place. |
| §18 browsers | `tests/qr/prd11/playwright.config.ts`: add `webkit` + `firefox` projects (functional + visual asserts; perf recorded, not gated). | Both run on macos-14 in the nightly. |

### Wave D — P2 / conditional

| ID | Task | Done when |
|---|---|---|
| 11-CODE CLI | `packages/aura3d-cli/src/commands/prd11/index.ts` is `export {}` → `aura3d perf gate --report <file>` wired to `tools/perf-gate`. | Command + unit test. |
| 11-CODE codemod | `scripts/migrations/prd11-batch-optout.mjs` + `registerCodemod('prd11-batch-optout')` (C-39, report mode): lists `apps/` nodes with `setMaterial(` or `material.roughness =` mutations; post report to #121 (Q-14-11). | Report attached to #121. |
| Batcher deprecation | `performance/Batcher.ts` (2 lines): re-export `planBatches` with `@deprecated`. | Present. |
| WgslAssembler | `webgpu/WgslAssembler.ts`: `assembleWgsl(features, registry) → {wgsl, bindGroupLayouts, vertexLayout}`, snapshot tests for 10 keys, naga-validated. Needs #198 `allShaderChunks()` (15/01). Only if G-WGPU is a go. | Snapshots green + naga. |
| Phases 7-8 | `WebGPURenderDevice`, compute, `RendererFactory` auto (`RendererFactory.ts` 20 lines). Record G-WGPU go/no-go at the first G-PANEL (IC-4, 2026-11-05). | Decision recorded, or V10/V11 green. |
| 11-PROMO record | Request/CCR status table (#89-#131, #179-#181, #198: merged/open/fallback) in the IC-1 checkpoint report (via lane 12). | Table present. |

## Issues to action / close (verify on `main` before closing; close with the PR + run id)

| # | Action |
|---|---|
| #271 | Q-11-2 (09→11): `WebGPUDevice.ts` `device.lost` promise → `app.onDeviceLost` listeners; unit with a fake lost promise. **Blocks lane 09.** Do first in Wave B. |
| #262 | sceneKitBudgets cityBlock string → `diagnostics().world` values (sceneKitBudgets row). |
| #261 | QUALITY_TIERS additive CCR not needed — **close** with a comment (PRD-16 §5.2 close-now list). |
| #194 | Add `lanes/prd13.ts` entry to `tools/bundle-size` (small, now). |
| #67 | GameRenderPreset honours `probeHdrTargetFormat` (`GameRenderPreset.ts:373,:450`). |
| #53 | Name one device per tier; closed by the renderer-strings fixture. |
| #215 | Export `sphereSweep` over the real BVH once 11-S5 BVH lands. |
| #260, #214, #233 | WebGPU work (`WebGPUDevice.ts:3179` `a3d_prd10_*` twins; `:2230` cameraFade per-draw fields; WGSL juice overlay). Deferred behind the WebGPU freeze / G-WGPU: comment "deferred to G-WGPU (IC-4)", keep open. |

**Blocked on other lanes (track, never wait; comment status weekly):** #90, #94, #113, #179, #180, #181 (01); #91 (03);
#92, #97, #98 (12); #100, #129, #198 (15); #103 (14); #111 (09); #115 (02). Your other outbound requests #89-#131 are filed
and open — keep each one's ledger row with its issue number (P-64).

## PR content still to land

All 9 `[QR-11]` PRs are merged into `main`; there is **no landing gap** (#169 belongs to lane 15). Everything still to
land is the new work above.

## Red flags to revert / correct

1. Self-skipping specs (P-22 list above) — a green run today would not prove any S-gate.
2. `quality.test.ts:226-235` oscillation test weaker than S7 (P-31).
3. `precompile-hitch.spec.ts` lacks `programsCompiledSinceReady === 0`; field fed by a cumulative count (S9).
4. `qr-prd11-perf.yml:101`/`:31` perf-gate narrowed to `prd11-tier-ladder` (S4/S5 unevaluable).
5. `budgets.json:50,62` S3 rows `gating:false` (P-30); naga `exit 0` on zero twins (P-09).
6. PRs #150-#342 merged while every gating run failed or was label-skipped; Phase-0 evidence from GitLab 2919070060, not
   the lane workflow — do not cite it as S-evidence; re-run.
7. #162 edited custodian-owned `CONTRACTS.md` (+1 line) — record lane-15 acceptance on #162 or revert via qr-request.
8. `webgpu-smoke` `continue-on-error: true` (`:133`) is allowed as non-gating; it must never be cited as a gate.

## Flag-promotion criteria (`dev → standalone-accepted`; lane 15 flips `flags.state.ts:21-22` at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Lane 11 is also blocked by #90, #94, #113, #179, #180, #181 (01); #91 (03); #92, #97, #98 (12); #100, #129, #198 (15); #103 (14); #111 (09); #115 (02). Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

- Track 0 exit met (PRD-16 §2.5: Round 5 18/18 base scenes drawCalls > 0 non-blank in `none` and `$ALL`; 9/9 games draw;
  `allflags-smoke` green on main twice in a row).
- Every PRD-11 S1-S12 row green in **one** `qr-prd11-perf.yml` run on main (`--strict`, no §3 masks), and **two
  consecutive green nightlies** (PRD-11 §21 Completion 1).
- Sentinel identity with `qr_flags=none` recorded (ΔE2000 p99 ≤ IC-0 noise on `benchmarks/quality-rebuild/sentinels.json`).
- Every lane-11 C-40 fact row (F-11-*) `verified` with a run id; checklist ticks backed (checklist-lint green); outbound
  requests filed.
- `A3D_QR_TIERS_GOVERNOR` / `A3D_QR_TIERS_BATCHING` have **no** `flags.state.ts` entries: file a lane-15 request to add
  them (or make the parent imply them) before promotion.
- Then `integrated-accepted` at a G-PANEL (IC-4 2026-11-05 earliest) with `qr_flags=all` + leave-one-out `all,-tiers`: I1-I7
  and V2-V11 (fps agreement on 18 games, §9.3 draw targets, Deep Recovery p50 ≤ 50 → ≤ 33 ms, governor on Patrol Wing /
  Turbo Drift / Gravity Post, context loss on 4 games, mobile backing V9). None can start until Track 0 renders frames.
- `A3D_QR_WEBGPU` promotion additionally requires the G-WGPU decision.

## Report back (end of each session; plain text, short, factual)

```
LANE 11 FINISH REPORT <date> main@<sha>
merged: <PR#> <task ids> <lane run id> <qr-required run id>
open PRs: <PR#> <task ids> <status/blocker>
tasks done (with passing remote run id): <id> run:<id> evidence:<path>
tasks remaining: <id> <next step>
S-rows: S1..S12 each PASS run:<id> | FAIL run:<id> <first error> | NOT RUN <reason>
nightlies: <run id> <conclusion> (consecutive green count: N)
issues closed: <#> ; issues filed: <#> ; blocked on: <#> (<owner>)
GitLab minutes used this session (estimate): N
NOT RUN: <item> — <reason>
risks: <one line each>
```
