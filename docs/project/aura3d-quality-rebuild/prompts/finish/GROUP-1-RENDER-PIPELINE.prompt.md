# Group prompt G1 — RENDER-PIPELINE (lanes 01, 02, 03, 04)

G1 owns the core of the renderer: the frame path, colour/HDR/PBR, lighting/IBL/shadows, post/AA/tonemap and
materials/glTF. Its mission is to make the all-flags build mount and draw. Most of PRD-16 Track 0 is G1's: the T0-01 MSAA
mount bug is root cause #1 for 0/18. G1 then takes `A3D_QR_CORE`, `A3D_QR_LIGHTING`, `A3D_QR_POST` and
`A3D_QR_MATERIALS`/`_TRANSMISSION`/`_KTX2` to `standalone-accepted`, and later through G-PANEL. All four lanes start at
hour 0, alongside G2-G5. Nothing is done until a passing remote run id is cited next to it.

Paste everything below the line into a fresh coding agent started at the repo root (`auraoneai/aura3d`, `main` at or after
`afb475c2`). That agent is the **G1 lead**, an orchestrator.

---

You are the **G1 lead (RENDER-PIPELINE)** for the Aura3D Quality Rebuild finish phase. You run one subagent per lane
(01, 02, 03, 04), each in its own git worktree. You hand each subagent its lane brief as its detailed task list. You
serialize merges inside the group and own all cross-lane coordination inside the group. You do not write lane code yourself
unless a subagent is stuck. The lane briefs carry the per-row file:line detail; this prompt carries what applies to the
whole group. Where they conflict, this prompt wins.

Read first (use `rg -n '^#'` plus offset/limit; never read a big file whole):
`docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` §1.2, §2 (all), §3, §4.0-§4.4, §5.2-5.3, §6, §7.1;
`prompts/finish/README.md`; `prompts/finish/briefs/FINISH-LANE-0{1,2,3,4}.prompt.md`;
`prompts/finish/briefs/FINISH-00-integration-recovery.prompt.md` (Step 2 and Step 3 only);
`.github/QR_OWNERSHIP.json`; `CI-ROUTING.md`.

## 1. Starting state (main afb475c2, 2026-10-08; PRD-16 §1)

- **Flags.** Every lane flag is `dev`: `A3D_QR_CORE` at `flags.state.ts:11`, `A3D_QR_LIGHTING` at `:12`, `A3D_QR_POST`
  at `:13`, and `A3D_QR_MATERIALS`/`_TRANSMISSION`/`_KTX2` at `:14`. `REMOVED_QR_FLAGS` is `[]`. With flags `none`, main
  is pixel-identical to IC-0. That is the only acceptance-grade result the program has.
- **All-flags benchmark** (GitLab 2926601350, 13 flags): **0/18** scenes rendered. 12 timed out at 240 s (02-09, 13, 15,
  17, 18); 6 were "ready" with `drawCalls 0` and black frames (01, 10, 11, 12, 14, 16). 10/13 lane scenes failed.
- **Strict and games** (pipeline 2926540757): under `A3D_QR_STRICT` every Aura scene throws `AuraMigrationError` (T0-13,
  G5). **9/9 games** crashed or never drew.
- **Root cause #1 is G1's** *(CI, 6/6 payloads)*. `Renderer.ts:1317-1327` `ensureHdrSceneTarget` asks for
  `colorAttachments` with `sampleCount:4`, and `WebGL2Device.ts:899` then throws `INVALID_RENDER_TARGET_SAMPLE_COUNT` on
  frame 1. At least 12 more *code-read* defects in lanes 01/02/03/04 sit behind it (T0-02..T0-09, T0-15..T0-18,
  T0-24..T0-27).
- **Per lane** (PRD-16 §1.2):

| Lane | % | Proven S-rows | Lane CI on main | Top blocker |
|---|---|---|---|---|
| 01 Core | 38 | 0/14; checklist 0/73 | `qr-prd01-core.yml`: no main trigger; 36/40 fail; unit red (generator-integration); browser run 37559564963 had 15 failures | MSAA HDR target throws; GLSL `binding=`; silent skips |
| 02 Lighting | 40 | S15 (unit only) | `lighting-quality.yml`: browser 2/5 fail, hidden by `continue-on-error` (run 37774324490) | shadow/contact passes unbind the HDR target; C-09 probe never bound |
| 03 Post | 50 | S20 (WGSL compile) | `post-quality.yml`: 35/40 fail; unit dies at repo typecheck; main browser step is a no-op glob | MSAA never resolved for v2 HDR stages; GL state cache not invalidated |
| 04 Materials | 50 | 0/16; checklist 0/47 | `qr-prd04-materials.yml`: 3/~101 green; 16/17 browser fail; captures "green" via `test.fail` | lobe chunks spliced inside `main()`; scene-page hang |

- **PRs.** No PR content is left to land in any G1 lane. All of it is on main via stacks, direct pushes (03) or local
  merges (02 `9a774061`, 04 `d3eb6dc2`/`f4c1b894`). None of it was gated. Never re-open or re-merge those PRs.
- **Process.** `main` has no protection and no required checks. Lanes 01-04 filed **zero** outbound requests on GitHub
  (P-64).

## 2. Scope

**Lanes and flags.** 01 `A3D_QR_CORE` (+`_OUTPUT`, `_GENERATOR`); 02 `A3D_QR_LIGHTING` (+`_CSM`, `_PROBES`, `_CONTACT`
at removal); 03 `A3D_QR_POST`; 04 `A3D_QR_MATERIALS`, `_TRANSMISSION`, `_KTX2`. Only G5 (lane 15) changes
`flags.state.ts`.

**Owned paths** (from `.github/QR_OWNERSHIP.json` `rules`; the longest prefix wins; check every file with
`node tools/qr-ownership/check.mjs`):
- **01.** `packages/rendering/src/{agent-api-compat,contracts,renderer,forward,webgl2,output,program,resources,shaders}/`,
  `production-runtime/shaders/chunks/`, and the `packages/rendering/src/` fallback (`Renderer.ts`, `WebGL2Device.ts`,
  `ForwardPass.ts`). Under `contracts/`, `flags.state.ts` stays lane 15's to change.
- **02.** `rendering/src/{environment,probes,shadows}/`, `passes/ContactShadowPass.ts`,
  `renderer/{ShadowOrchestration,Background}.ts`, `forward/Lighting.ts`, `webgl2/Samplers.ts`,
  `{DepthPass,ShadowPass,ShadowMap,CascadedShadowMaps,LightUniforms,ReflectionProbe,ClusteredForwardLighting}.ts`,
  `Environment{MapResources,Lighting,BackgroundPass,BackgroundResources,Pipeline,Platform}.ts`,
  `ExternalParityRenderPreset.ts`, `production-runtime/environment/`, `production-runtime/PBRHDRPipeline.ts`,
  `engine/src/agent-api/compiler/{environment,lights,shadows}.ts`, `public/aura-environments/`,
  `.github/workflows/lighting-quality.yml`.
- **03.** `rendering/src/{post,postprocess,reference}/`, `renderer/PostprocessExecution.ts`, `forward/Velocity.ts`,
  `webgl2/LegacyPost.ts`, `{RendererPostprocessPlan,PostProcessPass,TemporalHistory}.ts`,
  `engine/src/agent-api/{postBridge,postPresets}.ts`, `compiler/postprocess.ts`, `nodes/effects.post.ts`,
  `apps/postprocessing-*`, `tools/quality-rebuild/codemods/`, `.github/workflows/post-quality.yml`.
- **04.** `rendering/src/materials/`, `forward/Transmission.ts`, `textures/TextureBudget.ts`,
  `production-runtime/materials/`,
  `{PBRMaterial,TexturedPBRMaterial,InstancedPBRMaterial,SkinnedLitMaterial,NormalMappedPBRMaterial,IBL,ProceduralMaterialTextures,TransmissionRenderTarget,Sampler}.ts`,
  `assets/src/{GLTFRenderResources,GLTFExtensionSupport,MikkTSpaceTangents}.ts`,
  `assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts`,
  `engine/src/production-runtime/{TypedGLBActor,ModelMaterialOverrides}.ts`,
  `engine/src/production-runtime/{actor,material-physical}/`,
  `engine/src/agent-api/compiler/{modelMaterials,textures}.ts`, `nodes/material.ts`, `apps/wow-webgpu-product-viewer/`,
  `fixtures/asset-corpus/`.
- **Lane patterns, per NN ∈ {01,02,03,04}.** `packages/{rendering,engine,assets,animation,audio,aura3d-cli}/src/lanes/prdNN.ts`,
  `compiler/diagnosticOnly.prdNN.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prdNN/`,
  `.github/workflows/qr-prdNN-*` (this covers `qr-prd01-core.yml`, `qr-prd03-captures.yml` and `qr-prd04-materials.yml`),
  `tests/qr/prdNN/`, `tests/unit/contracts/impl/prdNN-*`, `evidence/prdNN/`, `evidence/prd-NN/`, `PRD-NN-*`.

**Ownership traps.** By longest prefix, these paths belong to another group even though a brief assigns the edit to a G1
lane:
- **Lane 11 (G2):** `program/chunks/` (T0-02 `common.glsl.ts:18`; 01-DFG `brdf.glsl.ts`), `webgl2/Counters.ts` (T0-15
  host registration), `webgl2/Probe.ts` (T0-04 capture), `webgl2/MultiDraw.ts` (#180), `forward/DrawSubmit.ts` (#181),
  `batching/` (#179), `RenderDevice.ts` (#245), `resources/RenderTargetPool.ts` and `tools/bundle-size/` (03-S19).
- **Lane 07 (G2):** `cinematic/` (the 03 brief lists `cinematic/{Bloom,Vignette,FilmGrain,DepthHaze}Pass.ts`; #315).
- **Lane 15 (G5):** `engine/src/agent-api/compiler/compileScene.ts` (T0-09/T0-24), `createAuraApp.ts` and `tools/**`
  (shader-lint).
- **Lane 12 (G5):** `benchmarks/quality-rebuild/{aura3d/common.ts,capture.mjs,ci.sh}`.

For each of these, send a co-signed one-liner or a qr-request to the owning group (§5). Never edit silently.

### Rows you own (complete checklist; ★ = Track 0 / do first; ☆ = Track P)

**Lane 01** (PRD-16 §4.1; brief `FINISH-LANE-01`; Step 2/3 of `FINISH-00`)
- ★ T0-01 MSAA HDR target mount (G1 writes it at hour 0; no claim needed) · ★ T0-02 GLSL `binding=` → `uniformBlockBinding`
  · ★ T0-03 silent skip → C-36 `program-compile-failed` + legacy fallback · ★ T0-04 OutputPass restores the previous target
  · ★ T0-05 chunk splice, flags into the program cache (01 half; co-PR with 04, now internal) · ★ T0-06 warmup on both
  paths · ★ T0-07 `postSkipped` (01 half; Renderer.ts)
- ★ T0-28 renderer half: the per-renderer flag seam replacing the global store in `renderer/FrameGraph.ts:30-35` (01-owned);
  G5 lane 15 writes the engine side in `createAuraApp`/`Renderer.create` callers · ★ T0-10/T0-13 adapter copy in
  `benchmarks/quality-rebuild/aura3d/scenes/prd01/common.ts:319` (drop `mode`/`fallback`; fail fast on mount error). G5 writes
  the shared harness `aura3d/common.ts`
- ☆ P-07 `qr-prd01-core.yml` lint `|| true` and the owner-15 exemption · ☆ P-51 F-01-02: supply the status and run id; G5
  edits `CONTRACTS.md` · ☆ P-55 PRD-01 0/73
  ticks only with run ids · ☆ P-56 `IC-0/README.md:16` TBD → placeholder · ☆ P-61 retro sign-off on
  #359/#361/#363/#364, #360/#365/#366/#347, #346 · ☆ P-64 / 01-REQ: file the ledger (Q-03-1/2/3, Q-04-1/2, Q-07-1,
  Q-09-1, Q-10-1, Q-11-1..4, Q-12-1/2, Q-13-1/2, Q-14-1, Q-15-1..10, QR-OWN-1); accept or decline inbound Q-05-7/8/10
- 01-GENTEST · 01-HANG · 01-CI · 01-REC · 01-RTARRAY · 01-MOUNTERR · 01-DFG · 01-S1 · 01-S2 · 01-T1.5 · 01-S3 · 01-S4 ·
  01-S5 · 01-S6 · 01-S11 · 01-S7 · 01-S8 · 01-S9 · 01-S10 · 01-S12 · 01-S13 · 01-T3 · 01-IC0 · 01-ISSUES · 01-T5 ·
  01-PROMO · 01-I

**Lane 02** (§4.2; brief `FINISH-LANE-02`)
- ★ T0-08 restore the bound target in shadow/contact/PMREM/probe/irradiance passes · ★ T0-09 single light path, no NaN ·
  ★ T0-24 bind the C-09 probe, one `EnvironmentCache` per app · ★ T0-25 no main-thread CPU GGX prefilter · ★ T0-26
  shadow allocation and consumer · ★ T0-27 16-light cap consistency · T0-28 (support: review G5's fix, then make
  `prd02LightingOn` read the app flags) · T0-31 (02 file: `prd02-lighting-legacy-golden.test.ts:10`; it resolves to owner 15
  by prefix, so record G5's acceptance in the PR body)
- ☆ P-06 `lighting-quality.yml:83,102` masks · ☆ P-51 F-02-01..06 (supply run ids; G5 edits `CONTRACTS.md`) · ☆ P-54 PRD-02 items 1912, 1926-1953 · ☆ P-57
  `evidence/prd02/baseline/` → `lighting-baseline/` (02-BASE) · ☆ P-61 #167 Sampler.ts edit (lane-04 acceptance, now
  internal) · ☆ P-64 / 02-REC filing
- 02-CI · 02-BASE · 02-S2S3 · 02-S14 · 02-S1 · 02-T1923 · 02-S10 · 02-S7 · 02-S8 · 02-S9 · 02-T1936 · 02-S13 · 02-S4 ·
  02-S5 · 02-S6 · 02-T1945 · 02-T1946 · 02-S11 · 02-S12 · 02-DEPTH · 02-ISSUES · 02-S16 · 02-S17 · 02-§21.2 · 02-IC ·
  02-§21.6-9 · 02-REC · 02-PROMO

**Lane 03** (§4.3; brief `FINISH-LANE-03`)
- ★ T0-15 resolve the MSAA source in `runV2HdrStages` · ★ T0-16 invalidate the GL state cache · ★ T0-17 no per-frame
  throws (FLAG-ON-3 HDR present with tonemap off; FLAG-ON-4 `POSTPROCESS_PASS_NOT_GPU`) · ★ T0-07 (PostGraph v2 half) ·
  ★ 03-ATTR black-frame attribution
- ☆ P-08 empty glob → `exit 0` · ☆ P-22 (lane-03 rows: `qr-prd03-phase6:103`, `phase4:89-115`, `wgsl-compile:68`) ·
  ☆ P-26 TAA/SMAA thresholds · ☆ P-52 F-03-06..10 `landed` status (send G5 the exact diff; G5 edits `CONTRACTS.md`) · ☆ P-54 the 21 d4f65a88 rows · ☆ P-58 withdraw
  QR-03-22 by comment (G1 writes; G5 verifies) · ☆ P-61 retro sign-off on #359, #361-#364 · ☆ P-64 / 03-REQ
- 03-CI1 · 03-CI2 · 03-S18 (a SMAA, b auto-exposure, c custom passes, d harness race) · 03-P0 · 03-S1..S5,S16 · 03-S6 ·
  03-S7 · 03-S8 · 03-S9 · 03-S10 · 03-S11 · 03-S12 · 03-S13 · 03-S14 · 03-S15 · 03-S17 · 03-S19 · 03-ISSUES (#91, #95,
  #207, #315) · Q-03-12 · 03-REC · 03-PROMO · 03-I · Phase 8 removals

**Lane 04** (§4.4; brief `FINISH-LANE-04`)
- ★ T0-18 (a-f) fallback metallic, E22, transmission target, singleton leak, MikkTSpace timeouts · ★ T0-05 / 04-LOBES
  (pars/call split, `requires` first, indirect append, guard mapping, `ShaderFeature.select`) · ★ T0-10/T0-13 adapter copy
  in `aura3d/scenes/prd04/common.ts:301` (drop `mode`/`fallback`, same fail-fast draw/HDRI wait as G5's harness; lanePatterns
  → 04, so G1 writes it) and check the prd04 pages pass no deprecated renderer options · T0-31 / CI-0 (file the breakers; repo gate stays)
- ☆ P-20 `test.fail` at `prd04-scene-capture.spec.ts:53` · ☆ P-22 (prd04 rows: `wgsl-twins:39`,
  `integrated-acceptance:57`, `scene-perf:67`) · ☆ P-29 (04 part: `transmission-capture.spec.ts:39`) · ☆ P-35
  texture-budget control · ☆ P-56 `probes/s{3,6,7,9}-*-control.json` stubs · ☆ P-55 PRD-04 0/47 (CHECKLIST) · ☆ P-64
  requests
- 04-BOOT · 04-S5 · 04-P6-1 · 04-S1 · 04-S2 · 04-S3 · 04-S4 · 04-S6 · 04-S7 · 04-S8 · 04-S9 · 04-S10 · 04-S11/S12 ·
  04-S13 · 04-S14/S15 · 04-S16 · 04-P1-3 · 04-EVID · CHECKLIST · 04-E34 · 04-ISSUES · 04-PROMO (workflow part first)

**Group rows.** The Track 0 bisect table after T0-01, posted to G5's Track 0 tracking issue. The group tracking issue
`Group G1 — finish`. Spot-checking every lane-01..04 "Y?" issue row in each lane's first PR.

## 3. How to run (orchestration)

### 3.1 Worktrees (hour 0, from the repo root)

```bash
git fetch origin
git worktree add ../aura3d-finish-prd01 -b qr/prd01-finish origin/main
git worktree add ../aura3d-finish-prd02 -b qr/prd02-finish origin/main
git worktree add ../aura3d-finish-prd03 -b qr/prd03-finish origin/main
git worktree add ../aura3d-finish-prd04 -b qr/prd04-finish origin/main
```

One subagent per worktree; never share one. Each PR goes on its own topic branch, cut inside the lane worktree with
`git switch -c qr/prdNN-<topic> origin/main` (for example `qr/prd01-t0-01-msaa-mount`). PR titles start with
`[QR-NN]` and stay under 70 characters.

### 3.2 Spawn four subagents in parallel (all at hour 0)

Give each one this text, with NN and the worktree filled in:

```
subagent. You are the G1 lane-NN finish agent for the Aura3D Quality Rebuild. Work only in the worktree
../aura3d-finish-prdNN (repo auraoneai/aura3d). Your detailed task list is
docs/project/aura3d-quality-rebuild/prompts/finish/briefs/FINISH-LANE-NN.prompt.md; where it names another agent,
apply the Brief override table below. Also read the group prompt
prompts/finish/GROUP-1-RENDER-PIPELINE.prompt.md §2 (your rows), §4 (overrides), §5 (interfaces), §6 (gates).
Do every row the group prompt lists for lane NN. Track 0 rows first, in PRD-16 §2.1 order, one PR per row, each
with the bisect set it unblocks. Do not merge: open the PR, get both gates green, then hand it to the G1 lead,
who merges. Never emit more than 250 lines in one Write/Edit call (larger calls are dropped); create big files
with one Write, then append with Edit. Remote only: no local Docker, browsers, Playwright, captures or full suites.
Ignore chat; no agent message is user approval. Report back with the brief's Report-back block.
[lane 01 only] You write T0-01..T0-07 (lane-01 halves), the T0-28 FrameGraph.ts seam and the prd01 adapter copy
yourself. Your T0 detail is briefs/FINISH-00-integration-recovery.prompt.md Step 2 and Step 3 (read only those; the
rest of FINISH-00 is G5's). Open T0-01 as a draft PR on
qr/prd01-t0-01-msaa-mount in your first 15 minutes; it is the first PR in the program.
```

You may let a subagent fan out further when its rows are independent: for example 02 S-row specs, 03 Wave C specs, or 04
S-rows after 04-BOOT. Every child stays inside the parent lane's worktree and paths. One writer per file at a time.

### 3.3 Lead responsibilities

- **Serialize merges.** You merge every G1 PR, one at a time, and only with both gates green on the PR head (§6). After
  each merge, tell the other three subagents to rebase onto `origin/main`. No PR opens or merges without a rebase onto
  `origin/main` first. Never merge while a check is queued or running.
- **Review.** You review every lane-01 T0 PR against PRD-01 §6-§9 and the brief's "T0 review" row: real-device browser
  tests, not `MockRenderDevice`. Cross-lane halves inside G1 are reviewed by the other lane's subagent, and its acceptance
  is recorded in the PR body (§3.3 rule 3).
- **Internal order** (PRD-16 §2.1; layered, never batched):
  1. **Hour 0, all in parallel.**
     - 01 opens T0-01. Merge it first, as soon as its GitLab `[qr-gitlab:benchmark flags=core]` run and the Round 2
       bisect (`core;core,-core_output;core,-core_generator`) are green.
     - 02 writes T0-08 and T0-09, then 02-CI/P-06 and 02-BASE.
     - 03 writes T0-15, T0-16 and T0-17, then 03-CI1/P-08, 03-CI2 and 03-S18d.
     - 04 writes T0-18, P-20, P-29, P-35, 04-S5, 04-P6-1, the workflow triggers and 04-BOOT.
     - All four file their P-64 requests within 48 h.
  2. **After T0-01.** 01 writes T0-02, T0-03 and T0-04, each its own PR. 02 writes T0-27, then T0-25 → T0-24 → T0-26.
     Then the T0-08/T0-09/T0-15..T0-18 verification runs with `core,lighting,post` and `core,materials`.
  3. **After T0-03.** T0-05 lands as one PR on `qr/prd01-t0-05-chunk-splice`:
     - lane 01 writes (a), passing `{flags, onDegradation}` through `rendererProgramCache`, plus the `hookSplice` ordering;
     - lane 04 writes (b-e), the pars/call chunk split, guard mapping and `ShaderFeature.select`, on
       `qr/prd04-t0-05-chunks`;
     - you cherry-pick the lane-04 commits onto the lane-01 branch, and both acceptances go in the PR body;
     - 01-GENTEST (Lambert default) is agreed in the same thread.
  4. **Next.** T0-06, then T0-07 (01 reports `postSkipped` in Renderer; 03 provides the post-hdr contributor and routes the
     chain through PostGraph v2).
  5. **Wave B for lane 01** starts once the T0 PR touching the same file has merged: 01-RTARRAY after T0-01, 01-S11 after
     T0-04. **Wave C** (01-S7, S8, S10, S13) starts after T0-02/T0-03/T0-05.
  6. **After Track 0 exit.** The S-row programs of every lane, then promotion, then G-PANEL (§9).
- **Same-file collisions.** Lanes 01 and 03 both touch `Renderer.ts` (T0-07); lanes 01 and 04 both touch
  `ProgramGenerator.ts` (T0-05). Only the owning lane edits its file, and the other lane supplies a co-signed hunk.

## 4. Brief override table (old names → new groups)

| Name used in a brief | Now | Notes |
|---|---|---|
| `FINISH-00` / "Track 0 agent" (lane-01 halves T0-01..T0-07, Step 2 renderer mount, Step 3 generator/output, T0-05 01 side) | **G1** (lane-01 subagent) | G1 writes these rows. Brief text saying lane 01 "reviews only", "does not edit those lines until FINISH-00 merges" or "writes only if FINISH-00 is not running" is void |
| T0-01 claim rule / claim protocol | **obsolete** | G1 writes T0-01 first, at hour 0. Still open the draft PR on `qr/prd01-t0-01-msaa-mount` early, so other groups can see it |
| `prompts/finish/README.md` "Overlaps" (cited by `FINISH-LANE-01` line 11) | **void** | That section no longer exists; the §2 checklist and this table replace it |
| `FINISH-00` (harness T0-10..T0-14 in the shared `aura3d/common.ts`, §2.3, §2.4 bisection rounds, §2.5 `qr-required.yml`, P-01, T0-19, T0-23, T0-28 engine side, T0-31 coordination, T0-32 15 half, ruleset proposal, Track 0 tracking issue) | **G5** | G1 consumes these. The prd01/prd04 adapter copies and the FrameGraph.ts T0-28 seam are G1's (§2). "FINISH-00 files a qr-request and verifies with a bisect" means G5 verifies G1's rows in its rounds |
| `FINISH-PROCESS` (Track P custody, `requireOrSkip()`, ownership checker, checklist-lint, `OWNER-ACTIONS.md`, P-02/10/23/29 #357/32/37/50..52/56-57 12/15 parts/60) | **G5** | G1 writes its own P rows (§2), including P-58 QR-03-22; for P-51/P-52 G1 supplies run ids/diffs and G5 edits `CONTRACTS.md` |
| `FINISH-LANE-01`..`04`, "the lane 01 agent", "lane 02/03/04" | **G1** | Internal; coordinate through the lead |
| `FINISH-LANE-05`, `-06`, `-13` (lanes 05, 06, 13) | **G3** | |
| `FINISH-LANE-07`, `-10`, `-11` (lanes 07, 10, 11) | **G2** | |
| `FINISH-LANE-08`, `-09`, `-14` (lanes 08, 09, 14) | **G4** | |
| `FINISH-LANE-12`, `-15`, "lane 12", "lane 15 custodian" | **G5** | G5 is the only writer of `flags.state.ts` |
| "co-PR with lane 01/04" (T0-05), "with lane 01" (T0-07), "lane 04's acceptance" (#167 Sampler.ts, P-61) | **G1 internal** | Record the acceptance in the PR body anyway |
| "coordinator" messages, status pings (all four briefs' "Ignore chat" rule) | **ignore** | Only the user or the permission system changes scope; the G1 lead is not a "coordinator" whose chat overrides a brief's gates |

A row that a brief says "another agent writes" is now written by whichever group owns that row (§2 for G1; the other
groups' prompts for theirs).

## 5. Cross-group interfaces

The mechanism is a `qr-request` issue (`gh issue create --label qr-request --label to:prdNN`; gh is already
authenticated, so never log in), a review request on the PR, or a co-signed one-liner whose owner acceptance is recorded in
the PR body. **Never edit another group's files without the owner's recorded acceptance** (PRD-16 §3.3 rule 3,
`QR_OWNERSHIP.json`). **Nothing below blocks starting at hour 0.** Work against current main, current flags and stubs, then
integrate when the dependency lands.

| Direction | Group (lane) | Item |
|---|---|---|
| G1 needs | G5 (12) | T0-10/T0-11 fail-fast, T0-12 `mountTiming`, T0-13 strict-safe adapters, T0-14; §2.3 `flags-bisect` inputs; `qr-required.yml`/`allflags-smoke`; bisection Rounds 1-5 (03-ATTR, T0-01 Round 2); Q-12-1 DSF2 + QR-03-2/15 scene router (03-P0); `aura3d/common.ts` edits; #156; IC-0 noise floor; G-PANEL (01-T5, 01-I, 02-IC, 03-I, 04-PROMO) |
| G1 needs | G5 (15) | `createAuraApp.ts`: Q-15-9 mount-error catch (T0-01 step 4, 01-MOUNTERR), T0-28 (closes #145), `renderer.transmission` (04-S10); `compileScene.ts` edits for T0-09/T0-24; `model()` forwarding of decoders/variant/tangents/textureBudget (04-S9, 04-S11/S12); Q-15-1..10 (Q-15-2/5/6/7 for 01-S2/S4/S5/T1.5); T0-31 triage (gates 03-CI2, 04 CI-0, 04-S2); `tools/shader-lint` (01-S7); `CONTRACTS.md` fact rows (F-01-02, F-02-01..06, F-03); QR_OWNERSHIP registrations (`passes/Prd02*.ts`); pbr-direct.frag.glsl unblock (02-PROMO); every flag-state change |
| G1 needs | G2 (11) | co-signs on the §2 lane-11 trap paths; Q-11-1..4 (Q-11-3 for 01-S13); timer query (02-S17); RGB9_E5 + ivec uniforms; QR-03-11 formats; `tools/bundle-size` (03-S19) |
| G1 needs | G2 (07, 10) | 07: Q-07-1, Q-07-2 DOF/MB nodes (03-I), R-01-2, `cinematic/` (#315), sign-off on #359. 10: prd10.wind depth feature (02-DEPTH) |
| G1 needs | G3 (05, 06, 13) | 05: Q-05-3, MikkTSpace lazy chunk (04-S8), T0-21 (04-S11/S12), delete the asset-lookdev UBO shim after T0-02, sign-off on #360/#365/#366/#347. 06: prd06.deform depth feature, #346 sign-off. 13: Q-13-1/2, QR-03-18 |
| G1 needs | G4 (08, 09, 14) | 08: QR-03-12/13 timeScale + C-22 pan (03-S14). 09: Q-09-1. 14: Q-14-1 codemod `--write` + emissive retune (03-I) |
| Others need | all groups | T0-01 merged; post its bisect table to G5's Track 0 tracking issue the moment it lands so everyone rebases onto a mounting renderer |
| Others need | G2 | 07: #245 float readback, T0-34 `FrameGraph.ts` scene-depth seam, C-01 "contributor leaves the bound target unchanged" dev assertion (T0-08). 10: #252, #259, registry enumeration accessor, T0-33 rule (a contributor `passes()` throw becomes a C-36 degradation, never kills the frame loop). 11: #90, #94, #113, #179, #180, #181, #91, #115 |
| Others need | G3 / G4 / G5 | G3: accept or decline Q-05-7/8/10. G4: #207 (lane 08). G5: G1 reviews of T0-19/T0-28 and the evidence behind every promotion |

## 6. Gates (README "Gate", PRD-16 §2.5, §3.3, §4.0, §7.1; binding)

- **Two green gates on every merge.**
  1. The lane workflow on the PR head: `qr-prd01-core.yml`, `lighting-quality.yml`, `post-quality.yml` or
     `qr-prd04-materials.yml`, with unit + browser (+ capture) all `success` and no masks.
  2. `qr-required / qr-required` with `allflags-smoke`: 6 probes × `none;$ALL;$ALL,strict`, engines `aura3d`, `--strict`,
     ready ≤ 30 s, drawCalls > 0, non-blank PNG, `errors == []`.
  While Track 0 is open, the `$ALL` arms may be **expected-red with an issue link**. A PR that turns a previously green arm
  red fails, and `none` must stay green. The other §2.5 required checks must be green too. "Pre-existing failure on main"
  is not an exemption.
- **Track 0/P only.** Until `qr-required.yml` is on `main` (target 2026-10-10), merge **only Track 0 or Track P rows**,
  each with a manual `flags-bisect` run on its head SHA attached.
- **No promotion before the Track 0 exit.** That exit is: Round 5 renders 18/18 base scenes in `none` and `$ALL`
  (drawCalls > 0, no blank frame, ready ≤ 30 s); every lane scene is ready; 9/9 games draw with `all`; `$ALL,strict`
  mounts every scene; `allflags-smoke` is green on two consecutive main commits.
- **Lane promotion criteria (§4.0).** No lane opens a promotion request until both of these hold:
  - the ruleset is live and `qr-required` is required;
  - its own `dev → standalone-accepted` criteria hold: every S-row green in **one** lane-workflow run on main with
    `--strict` and 0 skipped; sentinel identity with `qr_flags=none` (ΔE2000 p99 ≤ IC-0 noise on `sentinels.json`); every
    F-0N fact `verified` with a run id; checklist-lint green; requests filed; no open §5.3 blocker (#156 blocks every lane).
  Never ask for a promotion early (P-58).
- **Flag state.** Only G5 (lane 15) changes `flags.state.ts`, at a checkpoint, from the checkpoint record. No flag
  changes state during Track 0.
- **Masks come out, and no new masks go in.** That means no `continue-on-error`, `|| true`, `|| echo`, `test.fail`, CI
  self-skips (use `requireOrSkip()`, which fails under CI), `exit 0` on empty globs, raised timeouts, raised budgets or
  loosened thresholds. A truthful red check is the intended result. Fix code, never tests.
- **Flag-off identity.** `qr_flags=none` stays pixel-identical, except for correctness fixes declared in the PR.
- **Merge discipline.** No direct pushes to `main`, no local merges, no force-push, no `--no-verify`. Stacks merge
  bottom-up into main, each with its own green run.
- **Proof** (§7.1). A row is done only with a cited **remote** run id (GitHub macos-14 or GitLab macOS) that meets all of
  these: every engine arm `ready` with drawCalls > 0; `errors: []`; no blank PNG; ready ≤ 30 s (bench) or firstDraw
  ≤ 15 s (games); renderer not SwiftShader; `--strict`; run id + SHA + asset hashes in `report.json`.
  - Evidence is committed under `evidence/prdNN/<run-id>/` (JPEG side-by-sides + `report.slim.json`).
  - These are never proof: local runs, `local=false` captures, masked jobs, stub controls, ticks without a run id.
  - Look at the PNGs. Label unreproduced claims *(code-read)*, and report anything not run as **NOT RUN (reason)**.
  - Never write "parity" or "three.js-quality"; only G-PANEL decides those.

## 7. Routing and budget (CI-ROUTING.md)

- **Remote only.** Locally: edit, git, `gh` reads, `rg`, `tsc` on touched packages, single targeted vitest files. Never
  local Docker, Playwright, browsers, captures, heavy builds or full suites.
- **Where runs go.**
  - PR gates: GitHub ubuntu.
  - Browser conformance and the sentinel: GitHub `macos-14`.
  - Lane visual evidence, bench, bisect and perf: GitLab macOS through the bridge, with a head-commit tag such as
    `[qr-gitlab:benchmark flags=core,lighting,post]`, or
    `gh workflow run qr-gitlab-ci.yml --ref <branch> -f suite=… -f requester=prdNN`.
  - Re-run with `git commit --allow-empty -m '[qr-gitlab:…]'`. Download with `gh run download <id>`.
  - GitLab macOS runs `chromium-headless-shell`. **Never compare frames across providers or channels** (check
    `ciProvider` and `browserChannel`).
- **Never** push to, commit in or open MRs on the GitLab mirror, and never cancel a GitLab pipeline.
- **Budget.** GitLab has 50,000 compute min/month, shared by **all 5 groups**, with a macOS factor of ×6 (≈ 8,300 macOS
  wall min).
  - G1's share is its four lane allocations of ≈ 2,400 each, so **≈ 9,600 compute min (≈ 1,600 macOS wall min)**.
  - Measured costs: 18-scene bench ≈ 16; 2-game single-viewport `local=true` ≈ 22; full 18-game ≥ 133.
  - Use the 6 probes and lane scenes, engine `aura3d` for bisects, one viewport and `mobile=false`. Full 18-game captures
    only for 03-P0, 03-S11 and 03-S17.
  - Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before large runs. If it is `1`, run the whole
    comparison on `quality-rebuild-capture.yml` and say so.
  - GitHub has 5 org-wide macOS slots shared by every group, so keep G1's queued macOS jobs low.

## 8. Issues to action and close (G1 lanes; close each only with a test + run id)

- **01:**
  - #90, #94, #113, #179, #180, #181 block lane 11: do these first (#179/#180/#181 sit on lane-11 paths, so G1 writes
    them with G2's co-sign; G2 reviews only).
  - #245 (blocks lane 07; PRD-16 01-ISSUES): the 07 brief finds `readFloatPixels` already at `RenderDevice.ts:483` (a
    lane-11 path). G1 proves it on WebGL2 with a test in its T0-04 follow-up and **G1 closes #245**; G2 (07) consumes it in
    its GPU Preetham spec and comments only.
  - #36; #198 `allShaderChunks()` (a CCR on `contracts/program.ts`, a lane-01 path: G5 records the CCR decision, then G1
    writes the export and closes it; G5 lane 15 reviews the barrel and lists it as a blocker);
    #148 and #127 are CCRs: **G5 decides** each CCR, then G1 writes the implementation; #112 stays open as P2
    (conditional).
  - #232: verify it against the PRD-01 §8 GLSL, then close it in week 1. #206: close as declined (§3.7).
- **02:**
  - #252 (blocks 10) and #115 (blocks 11) close together via 02-DEPTH. Then #253, then #96.
  - #114: defer and leave open. #254: close only in the removal PR.
  - #314: G1 (02) closes it now as a duplicate of #254 (PRD-16 §5.2). G2 and G5 do not close it.
  - #195 (`lights.ambient()` census; triage lane "other", no owner): 02 consumes it for the PRD-02 ambient lint, comments
    the per-owner rewrite list, and closes it once the lint lands. It is the only writer.
  - #145: comment the dependency. G5 closes it with T0-28.
- **03:** #91 (blocks 11), #95, #207 (blocks 08), Q-03-12. #315 stays open until the VFX removal.
- **04:**
  - #259 (blocks 10), #258, #192, #104, #80, #83; #84 and #88 after 04-LOBES.
  - #78 is an umbrella: G1 (04) closes it last, after #80/#83/#84/#88 (G4 and G5 only track it).
  - Comment the dependency on #145.
- **Blockers on G1 promotion:** #156 (G5). Every G1 lane spot-checks its "Y?" rows in `_sections/issues-triage.md` in its
  first PR.

## 9. Checkpoint duties (Thursdays; PRD-16 §6.2)

| Checkpoint | Date | G1 reports or delivers |
|---|---|---|
| IC-0 | 2026-10-10 | T0-01 merged with GitLab run; T0-02..04, T0-08/09, T0-15..18 PRs open; masks P-06/07/08/20 out; P-64 filed; 02-IC IC-0 file + 02-S16 sentinel cited |
| **IC-1** | 2026-10-15 | every G1 T0 row merged with its done-when run (Track 0 exit with G5); §3.1-3.4 G1 rows merged; lane workflows on `push: main` + schedule |
| IC-2 | 2026-10-22 | 02 and 03 standalone-accepted candidates (S-rows in one main run) |
| IC-3 | 2026-10-29 | 01 S7 generator-only keys on base scenes; 04 lobes visible; 01/04 standalone |
| **IC-4 G-PANEL 1** | 2026-11-05 | integrated runs `all` + `all,-core/-lighting/-post/-materials` (01-I, 02-§21.6-9, 03-I, 04 IC-4.md) |
| IC-5..IC-7 | 11-12, 11-19, 11-26 | no attributed `qr-ic-regression` → default-on |
| **IC-8 G-PANEL 2** | 2026-12-03 | integrated re-judgement |
| IC-9..IC-11 | 12-10, 12-17, 12-24 | removals: 01 Phase 7, 02 legacy + #254, 03 Phase 8 + #315, 04 removal PR |
| **IC-12 / IC-16** | 2026-12-31 / 2027-01-28 | G-PANEL 3 / final acceptance |

Every Thursday, post the Report-back block (§10) to `Group G1 — finish`. Attach each lane's
`evidence/prdNN/checkpoints/IC-<k>.md`. Answer every `qr-ic-regression` that leave-one-out attributes to a G1 lane within
the week. A promoted flag that gets an attributed regression goes back one state.

## 10. Report-back block (lead posts it per checkpoint to issue `Group G1 — finish`)

```
G1 RENDER-PIPELINE REPORT <date> IC-<k> main=<sha>
Lane %: 01=<n>% 02=<n>% 03=<n>% 04=<n>% (rows closed / rows owned per §2)
Track 0: T0-01..09, 15..18, 24..27 -> <merged PR # + done-when run id | open: reason>
Rows closed (id -> PR # -> run id -> provider -> evidence path): ...
S-rows proven: 01 S1-S14, 02 S1-S18, 03 S1-S20, 04 S1-S16 -> run id each; others NOT PROVEN
Masks removed: P-06, P-07, P-08, P-20, P-22 (03/04), P-26, P-29, P-35 -> commit
Records: P-51/52/54/55/56/57/58 changes; checklist ticks with run ids
all-flags: allflags-smoke none/$ALL/$ALL,strict -> <state>; bisect culprits in G1
Issues: closed #...; filed qr-request #... (to:prdNN); qr-ic-regression #...
Flags: CORE/LIGHTING/POST/MATERIALS=<state>; promotion request # or "not eligible: <missing>"
GitLab minutes (est.): <n> / 9,600; QR_GITLAB_PAUSED=<0|1>
Blockers (row -> group -> issue #): ...
NOT RUN: <item -> reason>
```
