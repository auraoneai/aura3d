# Group prompt G2 — GPU-WORLD-FX: lanes 07 (VFX/sky/fog/volumetric/decals), 10 (world/terrain/water/biome), 11 (WebGPU/tiers/perf)

Mission: you are the **lead orchestrator for group G2** of the Aura3D Quality Rebuild finish phase. G2 owns lanes 07, 10
and 11. Each lane has three jobs: fix its own Track 0 defects (T0-34, T0-33, T0-35), remove its own masks (Track P), and
take its flags from `dev` to `standalone-accepted` with every claim proven by a passing **remote** run id. You do not write
the lane code yourself. You run one subagent per lane in parallel, each working from its lane brief. You also serialize
G2's merges, sequence the dependencies between the three lanes, and talk to G1, G3, G4 and G5 through issues. All five
groups start at hour 0. Nothing in this prompt waits for another group.

Paste everything below the line into a fresh coding agent started at the repo root of `https://github.com/auraoneai/aura3d`.

---

## 1. Starting state (main `afb475c2`, 2026-10-08; source PRD-16 §1)

- **Nothing is live.** Every lane flag is `dev`: `A3D_QR_VFX` at `packages/rendering/src/contracts/flags.state.ts:17`,
  `A3D_QR_WORLD` at `:20`, and `A3D_QR_TIERS`/`A3D_QR_WEBGPU` at `:21-22`. With flags `none`, main is pixel-identical to the
  85aafcd0 baseline (IC-0 pass). Keep it that way.
- **The combined build does not render.** Pipeline 2926601350 (13 lane flags, no VFX sub-flag) rendered **0/18** base scenes
  and failed 10/13 lane scenes. In pipeline 2926540757 (all flags plus strict), **9/9** games crashed or never drew. Lane 01's
  T0-01 is root cause #1. Behind it sit three defects G2 found by reading code: **T0-33** (10), **T0-34** (07) and
  **T0-35** (11). None has been reproduced. Each one may be a first-layer cause for its own flag.
- **Lane 07 (~45 %).** 7 PRs merged (#143, #163, #246, #279, #292, #312, #338), all on main. Its only main run,
  37561125962, failed: browser 16/17 timed out, capture died at the vite build (T0-23), typecheck hit TS1005 (T0-31), and
  games was green only through `continue-on-error`. S-rows 0/15. Checklist 61/62 bulk-ticked. `evidence/prd07/` holds 8
  markdown notes and no run-id dirs.
- **Lane 10 (~35 %).** 7 PRs merged (#37, #134, #154, #176, #189, #205, #268). Every lane-branch run after 10-06 fails at
  `pnpm install --frozen-lockfile`. The last green run, 37497949014, masked 2 failures (P-04). Checklist 5/56 ticked.
  S11/S12 (engineering only) and S15 are provisional. Turning `world` on throws in the frame graph every frame (T0-33).
- **Lane 11 (~40 %).** 9 PRs merged (#150, #162, #168, #178, #186, #190, #197, #199, #342). `qr-prd11-perf.yml` is 0/134
  green (115 skipped behind a label). Both nightlies, 37578024718 and 37734120918, failed at the `gpu-probe.json` write.
  Checklist 0/82. Only S10 is (provisionally) proven.
- **Process.** `main` is unprotected and has no required checks. Of 136 PRs merged since 10-05, 109 had at least one failing
  check. All three G2 lane workflows lack `push: main`, `schedule` or a correct `paths` filter, or hide failures behind masks.
- **Landing gap: none.** Every `[QR-07]`, `[QR-10]` and `[QR-11]` PR is on main. Everything remaining is new work.

## 2. Scope

**Flags:** `A3D_QR_VFX` (+`_SKY`, `_FOG`, `_VOLUMETRIC`, `_DECALS`), `A3D_QR_WORLD` (+`_TERRAIN`, `_WATER`, `_BIOME`),
`A3D_QR_TIERS` (+`_BATCHING`, `_GOVERNOR`) and `A3D_QR_WEBGPU`. Only G5 (lane 15) writes `flags.state.ts`.

**Owned paths** (`.github/QR_OWNERSHIP.json` `rules`, longest prefix wins; confirm before every edit):
- **07:** `packages/rendering/src/{vfx,atmosphere,effects,cinematic}/`, `DayNightSky.ts`, `Weather.ts`;
  `packages/engine/src/agent-api/atmosphere/`, `agent-api/compiler/atmosphere.ts`, `agent-api/nodes/{effects,atmosphere}.ts`.
  The brief also claims `VolumetricFog.ts`, `SpriteFlipbook.ts`, `agent-api/vfx/`, `Decals.ts`,
  `compiler/{fog,effects,sky}.ts`, `nodes/{sky,weather,particles}.ts`, `production-runtime/effects/`,
  `tools/{vfx-atlas-bake,effects-vfx-visual-audit}/` and `.github/workflows/prd07-vfx.yml`. Verify each of these against
  QR_OWNERSHIP (#147 says the JSON diverges from CONTRACTS §4.1 row 07). Where it does not resolve to 07, ask G5 to fix the
  JSON.
- **10:** `packages/rendering/src/{world/,Terrain*,EnvironmentPreset.ts,EnvironmentPresetPack.ts,OceanSurface.ts,
  SpaceEnvironment.ts,VegetationScatter.ts,WaterSurface.ts}`; `engine/src/agent-api/{world/,Scatter.ts,
  LayeredSceneComposition.ts,compiler/world.ts,nodes/instances.ts,nodes/water.ts,nodes/environments.world.ts}`;
  `engine/src/production-runtime/world/`; `environments/src/BiomeEnvironmentRegistry.ts`;
  `physics-rapier/src/HeightfieldLayout.ts`; `fixtures/three-compat/environments/`; `tools/{impostor-bake,
  world-content-bake}/`; `tests/browser/qr-prd10-*.spec.ts`. `packages/engine/assets/world/**` is disputed (#177; P-61 asks
  for it to be reassigned to 10).
- **11:** `packages/rendering/src/{quality,batching,webgpu}/` (except `WebGPUPostShaders.ts`);
  `renderer/{CullingBatching,RendererFactory,DeviceLifecycle}.ts`; `forward/DrawSubmit.ts`;
  `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`; `program/UniformLayout.ts`; `program/chunks/`;
  `resources/{ResourceRegistry,RenderTargetPool}.ts`; `performance/{BVH,Batcher,FrustumCuller}.ts` (#181 disputes this:
  check CONTRACTS §4.1 first); `production-runtime/{backends/,shaders/wgsl/,ProductionWebGPURenderer.ts}`;
  `{RenderDevice,WebGPUDevice,RenderBackend,RendererTiming,MockRenderDevice}.ts`;
  `engine/src/production-runtime/GameRenderPreset.ts`; `agent-api/{RootPerformanceQuality.ts,app/rendererOptions.ts,
  devtools/sceneKitBudgets.ts}`; `apps/{webgpu-lab,wow-webgpu-instancing}/`; `tools/{perf-gate,wgsl-validate,bundle-size,
  production-runtime-template-readiness,production-runtime-package-surface-readiness}/`; `scripts/migrations/prd11-`;
  `docs/rendering/webgpu-`.
- **Per-lane patterns** (`lanePatterns`, NN = 07/10/11): `packages/{rendering,engine,assets,animation,audio,aura3d-cli}/src/
  lanes/prdNN.ts`, `agent-api/compiler/diagnosticOnly.prdNN.ts`, `aura3d-cli/src/commands/prdNN/`,
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prdNN/`, `.github/workflows/qr-prdNN-`, `tests/qr/prdNN/`,
  `tests/unit/contracts/impl/prdNN-`, `evidence/prdNN/`, `evidence/prd-NN/` and `PRD-NN-*`.
- **Not yours, whatever a brief says:** `CONTRACTS.md`, `flags.state.ts`, `contracts/flags.ts`, `Renderer.ts`,
  `renderer/FrameGraph.ts`, `ForwardPass.ts`, `RenderGraph.ts`, `PostResources.ts`, `createAuraApp.ts`,
  `RootRuntimeSupport.ts`, `packages/rendering/package.json`, `tools/quality-rebuild-capture/`, `.gitlab-ci.yml` and
  `qr-gitlab-ci.yml`. Change these only through a qr-request/CCR (§5).

### Rows you own (completeness checklist; ★ = Track 0 / Track P, do first, mergeable before `qr-required`)

Each row's detail (file:line, fix, "done when") is in the lane brief. Tick a row here only next to a passing remote run id.

**Lane 07** (`briefs/FINISH-LANE-07.prompt.md`; PRD-16 §4.7)
- [ ] ★ T0-34 = FIX-softdepth-feedback, FIX-volumetric-target, FIX-transient-lights (bisect `none;vfx` and `$ALL;$ALL,-vfx`
  before and after each fix)
- [ ] ★ 07-MASKS = P-03 (`prd07-vfx.yml:129,137,175,178`, strict reports, sub-flags, `paths` self-glob `:17`, push/schedule,
  `always()` artifacts), P-33 (`LowResParticles.ts:24-30` budgets), P-34(a) soft-depth window, P-34(b) sun-disc assert
- [ ] ★ 07-REC = P-50 (F-07-01..09 → `proposed`, written by G5 in CONTRACTS.md), P-54 (untick the 12 PRD-07 rows + P7-T4
  `:1985`), P-58 (withdraw the #313 promotion ask by comment; G2 writes it, G5 verifies)
- [ ] ★ CI-rerun (`gh workflow run prd07-vfx.yml --ref main` after the mask PR; `triage.md`)
- [ ] ★ 07-BUILD / T0-23 (verify that the capture build resolves `@aura3d/rendering/world`)
- [ ] ★ 07-TIMEOUTS (16/17 browser timeouts, #156, `performance.mark` mount timing)
- [ ] ★ T0-28 coordination (delete the `setRendererQrFlags` callers in `lanes/prd07.ts:77-78`, `vfx/effects-api.ts:315`
  and `atmosphere-api.ts:19` once T0-28 lands)
- [ ] wetness landmine (`lanes/prd07.ts:47-63`) · FIX-froxel-cost (P1) · FIX-bridge-exclusive (P1) · grouped-effects walk (P2)
- [ ] Phase C: P5-T1 integration (`prd07.gpuSims` producer) · P3-T6 integration (SkyCaptureAdapter) · P4/P5 generator
  (pars + call snippet for T0-05) · 07-CLI (#146, #237, drop the `vfxEffect()` casts)
- [ ] Phase D: 07-S1..S12 · 07-S13..S15 · 07-IC0 · §22.5 C-20/C-21 real-provider specs
- [ ] Phase E: the 16 lane browser specs green (P1-T19/P2-T8/P3-T3/P3-T4/P4-T7/P5-T1/P5-T6/P6-T3/P1-T10) · P3-T1/P3-T3 GPU
  Preetham spec · §16 context-loss spec · 07-BROWSERS (`qr-prd07-browsers.yml`, §19) · §20 mobile emulation job
- [ ] Phase F / 07-ISSUES: #101 · #102 · #256 · #257 + #85 · #187 + #82 · #81 + #87 · #77 · #245 (consume `readFloatPixels` and comment; G1 closes)
- [ ] Phase G: 07-OWN / P-61 (#163, #246, #292, #312, #338 sign-offs) · P7-T1 / 07-PROMO · P7-T2 removal · I1–I14
- [ ] P-64 (file the ledger requests on GitHub) · P-22 `tests/browser/gpu-particle-a4.spec.ts:312`: **review only**; it
  resolves to owner 15 (`check.mjs`, `tests/browser/**`), so G5 converts it to `requireOrSkip()` and requests your review
- [ ] ★ T0-10/T0-13 adapter copy in `benchmarks/quality-rebuild/aura3d/scenes/prd07/common.ts:331` (drop
  `renderer.mode`/`fallback`) and delete the #236 workaround there (lanePatterns → 07; G5 writes the shared harness)

**Lane 10** (`briefs/FINISH-LANE-10.prompt.md`; PRD-16 §4.10)
- [ ] ★ T0-33 = FIX-P0-graph (a)-(d) + FIX-P0-tier + FIX-compile-cache (bisect `none;world` and `$ALL;$ALL,-world`)
- [ ] ★ FIX-chunks / 10-CHUNKS (`registerPrd10Chunks()`; `sideEffects` request to 15; depends on T0-05)
- [ ] ★ T1.11 / FIX-depth / 10-DEPTH (pass-depth spec; correct `phase-1.md`)
- [ ] ★ T0-23 lane side (with 15, #249)
- [ ] ★ T1.14 / 10-CI / P-04 (8 workflow changes in `qr-prd10-world.yml`, incl. `workflow_call` for `qr-required`)
- [ ] ★ P-22 lane-10 rows (`world-pass-depth:98`, `terrain-cracks:241`, `terrain-gpu-cpu:48`, `terrain-splat-bake:125`)
- [ ] ★ CI blockers owned elsewhere (frozen lockfile, T0-31 `typecheck:raw` files, TS4023 `effects.composite.ts:9`):
  comment with run 37581210392 and rebase as each fix lands
- [ ] P1: Q-15-6 risk (must land **before** #266) · S1/S2 · S3 · S4 · S5 · S6 (scatter Path S draw + alloc spec) · S7 ·
  S8 · S9 · S10 · S13 / T5.7 · S14 · S16 · IC-0 · §20 evidence / 10-EVID · T1.6-T6.10 ticks (51/56 unticked)
- [ ] §4.10 ids: 10-S1..S4 · 10-S5..S8 · 10-S9/S10 · 10-S13 · 10-S14/S16 · 10-EVID · 10-ISSUES (#79, #86 inbound)
- [ ] P2: T2.4 (WGSL terrain, needs #260) · T6.9 (F-10-01..08 verified, written by G5) · T4.7 / T5.6 / T6.5 = 10-T5.6
  (#188, #204, #267) · §17.4 bundle · UnderwaterState post · Phase 7 / §16.2 I1-I7 · 10-PROMO
- [ ] File now: the 3 requests (to 15 `sideEffects`; to 01 contributor-throw + ForwardPass depth; to 12/15 the T0-33 row)
- [ ] P-55 (PRD-10 ticks only with run ids) · P-61 (`engine/assets/world/**` → 10, #177) · P-64

**Lane 11** (`briefs/FINISH-LANE-11.prompt.md`; PRD-16 §4.11)
- [ ] ★ T0-35 = T11-POOL, T11-TIMING, T11-COUNTERS, T11-RESET (bisect `none;tiers` and `$ALL;$ALL,-tiers`)
- [ ] ★ CI-0 / 11-CI (`gpu-probe.mjs:49` mkdir, through G5 because lane 12 co-owns it; the `mkdir -p` in
  `qr-prd11-perf.yml:83,116`; push trigger; `always()` uploads; two consecutive green nightlies)
- [ ] ★ P-22 / skips (8 specs, `requireOrSkip()`, `forbidOnly`, no-skip reporter) · ★ P-09 · ★ P-30 · ★ P-31 / S7-unit
- [ ] ★ T11-GLOBALFLAGS (your half of T0-28: remove `prd11SetRendererQrFlags` at `engine/src/lanes/prd11.ts:198`; comment
  on #145)
- [ ] Wave B: 11-S4/S5 scope · 11-S5 culler · 11-S5 BVH · 11-S5 bench · 11-S1/S2 · 11-S3 · 11-S6 · 11-S7 · 11-S8 fixture ·
  11-S8 windows · 11-S9 · 11-S10 · 11-S11/S12 · RendererOptions · Tier propagation · GameRenderPreset · sceneKitBudgets
- [ ] Wave C: S1-S12 / Completion 1 (two consecutive green nightlies) · Phase-0 profiles (+ `patrol-wing.md`) · §19 mobile
  (AWS Device Farm or `unverified` labels) · §18 browsers (webkit + firefox)
- [ ] Wave D: 11-CODE CLI · 11-CODE codemod (#121) · Batcher deprecation · WgslAssembler (only if G-WGPU is a go) ·
  Phases 7-8 (G-WGPU go/no-go at IC-4) · 11-PROMO record (request/CCR table in the IC-1 report)
- [ ] §4.11 ids: 11-CODE · 11-ISSUES · 11-BLOCKED · 11-PROMO
- [ ] Issues: #271 (do first in Wave B; blocks G4) · #262 · #261 close · #194 · #67 · #53 · #215 · #260/#214/#233 comment
  "deferred to G-WGPU (IC-4)"
- [ ] Red flag 7: #162's +1 line in CONTRACTS.md gets G5 acceptance recorded on #162, or a qr-request revert
- [ ] Flag-state request: `A3D_QR_TIERS_GOVERNOR`/`_BATCHING` entries, or parent implies sub-flags (G5)
- [ ] P-55 (PRD-11 0/82) · P-64 · P-22 `webgpu-hardware-matrix.spec.ts:7`, `webgpu-visual-parity.spec.ts:8`: **review
  only**; both resolve to owner 15, so G5 writes them
- [ ] ★ P-23 lane-11 hunk: on G5's Q-11-5/7 request, restore `tools/bundle-size/index.ts:67,110,123,134` to the PRD-15 §17
  caps (owner 11 → you write it; G5 writes `BUNDLE_SIZES.md` and owns the row). The gate turns red; that is correct
- [ ] ★ T0-13 adapter copies in `aura3d/scenes/prd11/{draw-call-stress.ts:85,tier-ladder.ts:107,instancing-100k.ts:92}`
  (drop `renderer.mode`/`fallback`)

## 3. How to run (orchestration)

**Hour 0.** Open the group tracking issue `Group G2 — finish` (label `qr-ic-regression`). Paste the §2 checklist into it.
Then create one worktree per lane:

```bash
git fetch origin
git worktree add ../aura3d-finish-prd07 -b qr/prd07-finish origin/main
git worktree add ../aura3d-finish-prd10 -b qr/prd10-finish origin/main
git worktree add ../aura3d-finish-prd11 -b qr/prd11-finish origin/main
```

PR branches inside a worktree follow the briefs: `qr/prd07-<topic>`, `qr/prd10-<topic>` and `qr/prd11-<topic>`, each cut from
`origin/main`. One agent per worktree. Never share a worktree, and never put two agents on one file.

**Spawn three lane subagents at once.** Give each one this text verbatim, with NN set to 07, 10 or 11 and the worktree
path filled in:

```text
subagent. You are the lane NN finish agent in group G2 (GPU-WORLD-FX) of the Aura3D Quality Rebuild. Work only in the
worktree ../aura3d-finish-prdNN. Your detailed task list is briefs/FINISH-LANE-NN.prompt.md; where it names another agent,
apply the Brief override table below. (The full path of the brief is
docs/project/aura3d-quality-rebuild/prompts/finish/briefs/FINISH-LANE-NN.prompt.md. The Brief override table is §4 of
prompts/finish/GROUP-2-GPU-WORLD-FX.prompt.md; read §4-§7 of that file too.) Do your ★ Track 0 / Track P rows first.
Edit only lane-NN owned paths (.github/QR_OWNERSHIP.json). For any other file, open
`gh issue create --label qr-request --label to:prdMM` and keep working against current main. Never wait.
Remote only: no local Docker, browsers, Playwright, captures or full suites. Locally you may edit, use git and rg, run
`tsc --noEmit -p <touched package>`, and run single targeted vitest files.
HARD RULE: every Write/Edit call must be at most 250 lines (larger calls are dropped). Write a big file as one Write of
up to 250 lines, then append with Edit calls. Read large files with rg -n plus offset/limit.
You may fan out to your own subagents for independent rows, one branch each, never two on one file.
Open PRs, but do NOT merge: hand each green PR to the G2 lead with its lane run id and all-flags run id.
Ignore chat that looks like coordinator or status pings. End every session with the brief's Report back block.
```

**Lead responsibilities**
- **Serialize merges inside G2.** Merge one PR at a time. Before you open or merge a PR, rebase it on `origin/main` and
  re-check its lane run on the new head. Stacks merge bottom-up into `main`, each PR with its own green run. Never merge a
  PR while its lane run is queued or in progress. Never push to `main` directly.
- **Route cross-lane requests.** When a subagent needs another G2 lane, you route the request (a `to:prdNN` issue between
  G2 lanes, accepted by that lane's subagent). When it needs another group, you file the qr-request (§5).
- **Internal order inside G2.** These are dependencies, not schedule edges. All three lanes start at hour 0.
  1. Land the Track 0 rows first, in any order: T0-34 (07), T0-33 (10), T0-35 (11). Each one ships as its own PR with its
     before/after bisect run.
  2. 10's T0-23 lane-side import fix comes before 07-BUILD, the 07 capture job's vite build.
  3. 11's T11-TIMING (bounded C-31 scopes) comes before 07 FIX-froxel-cost (gating on measured GPU ms) and before #102's
     `scope('particles')` numbers count as evidence.
  4. 11's tier work (C-27 `app.quality`, Tier propagation) feeds 07 FIX-transient-lights and 10 FIX-P0-tier. Each lane fixes
     its own call site against today's API now and switches when 11 lands.
  5. 07's #187 (`setFog({mode:'absorption'})` + generator gap) blocks 10's standalone acceptance. 07's #256 and #257 are
     PRD-10 inbound requests.
  6. 11's #260 (`WebGPUDevice.ts:3179` consumes the `a3d_prd10_*` twins) comes before 10's T2.4 WGSL terrain. 10's
     `diagnostics().world` comes before 11's #262 sceneKitBudgets cityBlock. #261 is closed once, by 11.
  7. 07 and 11 both remove their global renderer-flag writes after G5 lands T0-28. Until then, every 07/11 PR records that
     `vfx`/`tiers` arm other lanes' renderer paths.

## 4. Brief override table

The briefs were written for the old 17-prompt run. Where a brief names an agent, a lane or a claim rule, read it as follows.
A row that a brief says "another agent writes" is written by the group that owns it. Where a brief and this prompt
conflict (writer, closer or reviewer of a row or issue; e.g. brief 07 says 07 closes #164/#236/#339/#245), this prompt wins.

| Name in a brief | Now | Notes |
|---|---|---|
| FINISH-LANE-07 / -10 / -11, "lane 07/10/11", prd07/prd10/prd11 | **G2** (you) | Requests between these three lanes are internal G2 issues |
| FINISH-00 (lane-01 halves T0-01..T0-07) | **G1** | **The T0-01 claim rule is obsolete: G1 writes T0-01 first.** No claim race, no draft-PR claim |
| FINISH-00 (everything else: T0-10..14, T0-19, T0-23, T0-28, T0-31, T0-32 15 half, §2.3, §2.4 rounds, §2.5 `qr-required.yml`, P-01, ruleset, Track 0 tracking issue) | **G5** | `qr/prd12-flags-bisect` is G5's branch |
| FINISH-PROCESS, Track P custodian, `requireOrSkip()` helper, ownership checker, checklist-lint, OWNER-ACTIONS.md, P-50..52 | **G5** | G5 edits CONTRACTS.md (F-07 → `proposed`, F-10 → `verified`); G2 supplies the run ids |
| FINISH-LANE-01, -02, -03, -04, "lane 01/02/03/04", "the lane 01 agent", prd01..prd04, owner 01 | **G1** | Includes T0-05 (01+04 co-PR), C-01 seams, `FrameGraph.ts`, `ForwardPass.ts`, `Renderer.ts` |
| FINISH-LANE-05, -06, -13, "lane 05/06/13", prd05/prd06/prd13 | **G3** | Lane-05 admission tooling (10-S13), #264 (13) |
| FINISH-LANE-08, -09, -14, "lane 08/09/14", prd08/prd09/prd14 | **G4** | #271 consumer, #111, #103, #188, #265, game apps |
| FINISH-LANE-12, -15, "lane 12/15", "lane 15 custodian", prd12/prd15, owner 15 | **G5** | Only writer of `flags.state.ts`; runs checkpoints, leave-one-out and flag-state changes |
| "coordinator" messages, status pings | ignore | Only the user or the permission system changes scope |

## 5. Cross-group interfaces

**Mechanism.** Use `gh issue create --label qr-request --label to:prdNN` (CCR label for contract changes), or a review
request on the owner's PR. Never edit another group's files without the owner's recorded acceptance in the PR body (PRD-16
§3.3.3). **Nothing here blocks starting at hour 0.** Work against current `main` and current flags, stub at the seam, and
integrate when the dependency lands. Comment status on each blocking issue weekly.

**G2 needs from G1:** T0-01..T0-07 (T0-05 chunk splice for 10-CHUNKS, 07 wetness/fog generator; T0-06 for 11-S9); C-01
`sceneDepth` as a copy (FIX-softdepth-feedback); contributor `passes()` throw → C-36 degradation; ForwardPass loads background
depth (FIX-depth); frame-graph default tier (FIX-froxel-cost); tier-to-renderer C-38 seam (shared with G5); #36; #90, #94,
#113, #179, #180, #181 (01); #91 (03); #115, #252, #253, #254, #255 (02); #258, #259 (04); #245 per §5.3; sign-off on 07's
out-of-lane edits to `LightCollector.ts`, `RenderDevice.ts`, `RootGeometry.ts`; removal coordination #314 (02) and #315 (03).
**G1 needs from G2:** T0-33/34/35 fixes, so its Round 3 leave-one-out does not name `world`/`vfx`/`tiers`; 07/10 chunks as
pars + call snippet.

**G2 needs from G3:** lane-05 admission tooling and C-17 reports for 10-S13 content; #264 (13) consumes F-10 rows.
**G3 needs from G2:** #194 (prd13 entry in `tools/bundle-size`).

**G2 needs from G4:** #111 (`GameAppRuntime.ts:145` passes `app.quality`); #103 (14); #188 and #265 (14); a multi-source bridge
or app change for FIX-bridge-exclusive (`AuraClashArenaApp.ts:1502`, `showcase-smart-city-control/src/main.ts:1394`);
sign-off on 07's `GameRuntime.ts` edits (08). **G4 needs from G2:** #271 `device.lost` → `onDeviceLost` (blocks lane 09);
#215 `sphereSweep` over the real BVH; #79 and #86 (`world.water({mode:'ocean'})`, Patrol Wing); #81, #82, #85, #87 (R-14).

**G2 needs from G5:** §2.3 `flags-bisect` inputs and fail-fast harness (T0-10..14); `qr-required.yml` with `allflags-smoke`;
T0-28 (#145); T0-23 / #249 `./world` export; T0-31; the frozen-lockfile fix; `requireOrSkip()`; checklist-lint; #156; #92,
#97, #98, #263 (12); #34, #35, #100, #129, #135, #146, #147, #148, #155, #177, #198, #204, #237, #247-#251, #266, #267, #340
(15); `sideEffects` for `./src/lanes/**`; `gpu-probe.mjs:49` mkdir; CONTRACTS.md edits (P-50, F-10, #162); `flags.state.ts`
sub-flag entries; promotions. **G5 needs from G2:** each T0-33/34/35 PR with its bisect run ids; lane workflows exposed as
`workflow_call`; 07/10/11 report blocks at each checkpoint; promotion asks only once the criteria hold (P-58).

## 6. Gates (binding; PRD-16 §2.5, §3.3, §4.0, README run order)

1. **Until `qr-required.yml` is on `main`** (target 2026-10-10), merge **only** Track 0/Track P rows (★ above). Keep
   everything else on branches.
2. **Every merge needs both:** a green lane workflow run on the PR head (`prd07-vfx.yml`, `qr-prd10-world.yml`,
   `qr-prd11-perf.yml` with label `lane:prd11`; all `--strict`, no masks) **and** a green all-flags gate:
   `qr-required / allflags-smoke`, which is 6 probes × `none;$ALL;$ALL,strict`, drawCalls > 0, non-blank, `errors == []`
   and ready ≤ 30 s. Also `CI / Type Check`, `CI / Lint`, `CI / Build`, `Test & Coverage`, `QR contracts / unit|browser` and
   sentinel identity. While Track 0 is open, the `$ALL` arms may be expected-red **with an issue link**. A PR that turns a
   previously green arm red fails. Until `qr-required` exists, attach your own `flags-bisect` run id. "Pre-existing on
   main" is not an exemption.
3. **No promotion until the Track 0 all-flags exit is green.** Round 5 renders 18/18 base scenes with drawCalls > 0 and no
   blank frame in `none` and `$ALL`, every lane scene is ready, 9/9 games draw with `all`, `$ALL,strict` mounts every scene,
   and `allflags-smoke` is green on main twice in a row. On top of that, each lane needs its §4.0 criteria (S-rows green in
   one main run, sentinel identity, C-40 facts verified, checklist-lint green, requests filed) and no open §5.3 blocker.
   #156 blocks every lane.
4. **Only G5 (lane 15) changes `flags.state.ts`,** at a checkpoint, citing the run that met the criteria.
5. **Masks come out.** No `continue-on-error`, `|| true`, `|| echo`, `test.fail`, self-skip, `exit 0` on empty sets,
   loosened thresholds or inflated timeouts. Fix the code, never the threshold. Removing a mask turns jobs red; that is the
   intended result.
6. **Definition of proof.** A row is done only with a cited **remote** run id (GitHub macos-14 or GitLab macOS
   `local=true`) that concluded `success` on a commit at or after `main`, unmasked. Local runs, prose, `local=false` frames,
   placeholder files and masked green jobs never count. Look at the PNGs before any visual claim. Never write "parity" or
   "three.js-quality" without a G-PANEL. Mark anything not run `NOT RUN — <reason>`, and mark unreproduced claims
   *(code-read)*.
7. **Flags-off is sacred.** `none` output stays pixel-identical (sentinel ΔE2000 p99 ≤ IC-0 noise) unless a PR declares a
   correctness fix.

## 7. Routing and budget

- **Remote only** (CI-ROUTING.md). PR gates run on GitHub ubuntu. Browser conformance and sentinel identity run on GitHub
  macos-14 (PRs touching `packages/rendering/**` or `packages/engine/**`; 5 macOS slots org-wide, so keep jobs short). Lane
  scenes, captures, perf/tier measurements, IC-0 and games run on **GitLab macOS** via a `[qr-gitlab:...]` tag in the
  **head** commit (for example `[qr-gitlab:benchmark flags=world]`; re-run with `git commit --allow-empty -m '<tag>' && git
  push`) or via `gh workflow run qr-gitlab-ci.yml --ref <qr/ branch> -f suite=... -f requester=prdNN` (dispatch does not
  attach to the PR). GitLab runs `chromium-headless-shell` and GitHub runs full Chromium, so **never compare frames or
  timings across providers**. Check `ciProvider` and `browserChannel` in `report.json`. Download results with
  `gh run download <id>` (artifact `gitlab-<suite>-<pipelineId>`).
- **Never** run local Docker, browsers, Playwright, captures or full suites. Never push to or open MRs on the GitLab mirror.
  Never log in or set `GH_TOKEN`/`GITHUB_TOKEN`.
- **Budget.** 50,000 GitLab compute minutes/month are **shared by all 5 groups**. The macOS factor is 6, so this is about
  8,300 macOS wall minutes. The old split gave each lane about 2,400 compute minutes, about 7,200 for G2's three lanes;
  treat that as guidance, not a reservation. Measured costs: 18-scene benchmark ≈ 16, 2-game single-viewport `local=true` ≈
  22, full 18-game ≈ 133+. Prefer probes or lane scenes, one desktop viewport and `mobile=false`. Run full 18-game captures
  only for 07-IC0 and checkpoints. Do not re-run unchanged code. Before any large run, check
  `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it is `1`, use GitHub `quality-rebuild-capture.yml` for the
  **whole** comparison and say so in the PR.

## 8. Issues to action and close (verify on main; close with PR + run id)

- **Close in week 1 (README / §5.2):** #261 (obsolete; 11 closes it, 10 references it). #164, #236 and #339 are on the
  week-1 list and are 07 outbound: verify and comment only; G5 (owner lanes 12/15) closes them. #77 umbrella closes after #81, #82, #85 and #87; #79 umbrella (10)
  closes with its inbound items. #313: withdraw (P-58).
- **07 inbound:** #101, #102, #256, #257, #85, #187, #82, #81, #87, #77, #245 (G2 consumes `readFloatPixels` in its GPU spec and comments; G1 closes #245 under 01-ISSUES; README closer list). **Chase:** #145, #146, #147, #148, #237; keep #315 and #316 deferred. #314 is
  not G2's: G1 (lane 02) closes it as a duplicate of #254 (PRD-16 §5.2); 07 only coordinates the `createProceduralSkyDome`
  removal on #254.
- **10 inbound:** #79, #86 (both blocked by FIX-P0-graph). **Chase:** #34, #35, #135, #155, #177, #204, #247-#251, #266,
  #340, #267 (15); #36 (01); #187, #256, #257 (07, internal); #188, #265 (14); #252-#255 (02); #258, #259 (04); #260, #262
  (11, internal); #263 (12); #264 (13).
- **11:** #271 (first in Wave B), #262, #194, #67, #53, #215. Comment "deferred to G-WGPU (IC-4)" on #260, #214 and #233 and
  keep them open. **Chase:** the 11-BLOCKED list and outbound #89-#131 (P-64 ledger rows).
- **Every lane:** confirm or close its "Y?" triage rows in its first Track-0-week PR, and file every markdown-only request
  on GitHub within 48 h (P-64).

## 9. Checkpoint duties (Thursdays; PRD-16 §6.2)

| Checkpoint | Date | What G2 must have |
|---|---|---|
| IC-0 re-record | 2026-10-10 | 10 IC-0 baseline of `prd10-*` scenes (`none`, `world`); 07-IC0 queued on the same provider |
| **IC-1** | 2026-10-15 | T0-33/34/35 merged with bisect ids; all G2 masks out; lane workflows on push/schedule; requests filed; 11-PROMO request table |
| IC-2 / IC-3 | 10-22, 10-29 | S-row evidence runs under way; no promotion ask until §6.3 holds |
| **IC-4 G-PANEL 1** | 2026-11-05 | G-WGPU go/no-go recorded; 07 I1/I2/I5 and 10 I1-I7 at the earliest; `all,-vfx`, `all,-world`, `all,-tiers` leave-one-out |
| IC-5..7 / **IC-8** / IC-9..11 / **IC-12** / **IC-16** | 11-12..11-26 / 12-03 / 12-10..12-24 / 12-31 / 2027-01-28 | default-on after two clean checkpoints; removal PRs (07 P7-T2) after two more |

Each Thursday, the lead collects the three lane Report back blocks, posts the group block below to `Group G2 — finish`, and
answers every `qr-ic-regression` that G5's leave-one-out attributes to `vfx`, `world` or `tiers`.

## 10. Report back (lead posts per checkpoint to `Group G2 — finish`)

```
G2 GPU-WORLD-FX — <IC-k> <date> — main@<sha>
lane 07: <n>% done | flag A3D_QR_VFX=<state> | S1..S15: <PASS run:id / FAIL run:id / NR reason>
lane 10: <n>% done | flag A3D_QR_WORLD=<state> | S1..S16: ... | §14 ticked <n>/56
lane 11: <n>% done | flags TIERS/WEBGPU=<state> | S1..S12: ... | nightlies green in a row: <n>
Track 0: T0-33 <state> bisect <before id>/<after id>; T0-34 ...; T0-35 ...
rows closed: <row id> — run <id> — evidence <path>   (one line each)
PRs merged: #<n> <lane> <row ids> lane-run <id> allflags <id>
open PRs: #<n> <row ids> <status/blocker>
blockers: <row id> — <issue #> (<group>) — filed <date>, last chased <date>
issues closed / filed: #...
GitLab compute minutes this period (estimate): <n>
NOT RUN: <item> — <reason>; code-read claims not yet reproduced: <list>
risks: <one line each>
```
