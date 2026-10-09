# Finish prompt — Lane 01: Rendering core, scene graph, colour, HDR, PBR (A3D_QR_CORE, _OUTPUT, _GENERATOR)

Copy everything below this line into a fresh coding agent (Claude Code, Codex, Kiro, etc.) started in the repo root.

---

You are the **finish agent for Lane 01** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Finish
**every** remaining Lane 01 task in `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md` §4.1 (`:366-401`),
then take `A3D_QR_CORE` to `standalone-accepted`. Nothing is done until a passing **remote** run id is cited next to it.

**Split with FINISH-00 (binding; see `prompts/finish/README.md` "Overlaps").** The Track 0 agent (`FINISH-00`) is the
**writer** of the lane-01 halves of T0-01..T0-07 (and the 01 side of the T0-05 co-PR with lane 04, branch
`qr/prd01-t0-05-chunk-splice`). You **review** those PRs as lane-01 owner (record acceptance in the PR thread within one
working day) and you **do not** edit the lines they touch until each one merges (all under `packages/rendering/src/`;
note `Renderer.ts`, `WebGL2Device.ts` and `ForwardPass.ts` sit at the package `src/` root, not in `renderer/`/`webgl2/`):
`Renderer.ts`, `WebGL2Device.ts` (`:542`, `:676-683`, `:899-904`), `ForwardPass.ts`,
`program/ProgramCache.ts`, `program/ProgramGenerator.ts`, `resources/UniformBlock.ts`, `output/OutputPass.ts`,
`renderer/qrSubFlags.ts`. Everything else in §4.1, plus P-07 and the lane-01 rows of P-51/P-55/P-56/P-61/P-64, is yours.
If the FINISH-00 agent is not running, you also write T0-01..T0-07 in the §2.1 order, one PR each, each with a bisect run.
**Task 1 below (T0-01, the MSAA mount fix) is the exception to the wait:** it unblocks every lane, so you claim it yourself
if FINISH-00 has not already opened it.

## Where the lane really stands (main afb475c2, 2026-10-08)

About **38 %** done (PRD-16 §1.2). All of this is unproven until a remote run says otherwise.

- **Flag.** `A3D_QR_CORE` is `dev` (`packages/rendering/src/contracts/flags.state.ts:11`); `REMOVED_QR_FLAGS` is `[]` (`:29`).
- **PRs.** #157, #171, #196, #200, #234, #272, #275, #289 were stacked and merged into each other's branches within ~30 s;
  all heads are ancestors of main (§1.3). **No PR content is left to land.** What remains is fixes, missing specs, evidence.
- **Proven S-rows: 0/14.** Checklist 0/73 ticked (P-55). `evidence/prd01/` holds 3 JSON inventories, `IC-0/README.md`
  with a `TBD` row at `:16` (P-56) and a `pending` `decisions/tonemap-default.md`. No PNGs, no run ids.
- **CI.** `qr-prd01-core.yml` has no `push: main` trigger and its `paths` omit `packages/rendering/**`; 36/40 recent runs
  failed. Last browser run 37559564963 (`qr/prd01-phase5-tonemap-ab`): 15 failures — app-capture (none + core), laneHarness
  renders (scene-graph-hierarchy, tonemap-exposure-ramp, blend-modes, primitive-catalog, draw-throughput),
  program-generator-compile, render-targets, renderer-mount-failure. Unit gate red on main:
  `tests/qr/prd01/unit/generator-integration.test.ts:70,93` expect `burley` + clearcoat, but lane 04's
  `PBRMaterial.ts:379` → `materials/PhysicalFeatures.ts:91-133` returns `lambert` (C-02/C-03 conflict, 01-GENTEST).
- **All-flags capture** (GitLab 2926601350, 13 lane flags): 0/18 base scenes rendered — 12 timed out at 240 s (02-09, 13,
  15, 17, 18), 6 `ready` with `drawCalls 0` and black frames (01, 10, 11, 12, 14, 16). **Root cause #1 is lane 01**
  *(CI, error string in all 6 payloads)*: T0-01 `ensureHdrSceneTarget` (`Renderer.ts:1317-1327`) → `WebGL2Device.ts:899`
  `INVALID_RENDER_TARGET_SAMPLE_COUNT`. Behind it: T0-02 GLSL `binding=` (CI), T0-03 silent skip, T0-04 float readback,
  T0-05 chunk splice, T0-06 warmup, T0-07 dropped post chain (*code-read*). With `strict` every scene throws
  `AuraMigrationError` (T0-13, lane 12). All-flags games: 9/9 crash or never draw. Flags `none`: pixel-identical (IC-0 pass).

## Read first (use `rg -n '^#'` plus offset/limit reads; never read a big file whole)

1. `PRD-16-FINAL-REMAINING-WORK.md`: §1.1-1.3, §2 (T0-01..T0-07 `:122-128`, T0-05 co-PR, §2.4 bisection, §2.5 gate),
   §3 (P-07 `:272`, P-51 `:327`, P-55 `:331`, P-56 `:332`, P-61 `:341`, P-64 `:344`), §4.0, **§4.1**, §5.3, §6, §7.
2. `PRD-01-rendering-core-color-hdr-pbr.md`: §13 contracts (`:860`), §14 phases (`:995`), §15 checklist (`:1048`),
   §16 tests (`:1157`), §17.1 standalone S1-S14 (`:1190`), §17.2 integrated I1-I10 (`:1213`), §19 budgets (`:1302`),
   §21 evidence (`:1336`), §22 completion (`:1350`), §25 out of scope.
3. `CONTRACTS.md`: §4 ownership, §5.3 flag states, §6 merge protocol, C-01/C-02/C-04..C-08, Appendix B F-01-* (`:2814`).
4. `CI-ROUTING.md` (whole file).
5. `_sections/{integration-findings,issues-triage,process-remediation}.md`: the lane-01 rows.
6. `qr-requests/qr-prd01-requests.md` (the outbound ledger; none filed on GitHub yet), `evidence/prd01/readback-triage.json`.

## Owned paths (single writer; longest prefix in `.github/QR_OWNERSHIP.json` wins)

- `packages/rendering/src/{agent-api-compat,contracts,renderer,forward,webgl2,output,program,resources,shaders}/`,
  `production-runtime/shaders/chunks/`, and the `packages/rendering/src/` fallback (only where no longer prefix matches).
- Lane patterns: `packages/{rendering,engine}/src/lanes/prd01.ts` (+ `engine/src/lanes/prd01/**`),
  `engine/src/agent-api/compiler/diagnosticOnly.prd01.ts`, `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd01/`,
  `.github/workflows/qr-prd01-core.yml`, `tests/qr/prd01/`, `tests/unit/contracts/impl/prd01-*`,
  `docs/project/aura3d-quality-rebuild/{evidence/prd01/,PRD-01-*}`.
- Engine `compiler/sceneGraph.ts` and `compiler/color.ts` are yours by PRD-01 §25 / Q-15-7 once lane 15 moves them; until
  then write `agent-api/{sceneGraph,color}.ts` replacements and track Q-15-7.

**Not yours** (qr-request only, `gh issue create --label qr-request --label to:prdNN`): `contracts/` *custodian* files
(`flags.state.ts` is lane 15's to change), lane 02 `shadows/**`, `passes/**`, lane 03 `post/**`, `PostprocessExecution.ts`,
`webgl2/LegacyPost.ts` (lane 03 by longest prefix), lane 04 `materials/**` + `assets/src/GLTFRenderResources.ts`, lane 12
`benchmarks/quality-rebuild/{aura3d/common.ts,capture.mjs,ci.sh}`, lane 15 `agent-api/index.ts`, `createAuraApp.ts`,
`tools/**`. A co-signed one-liner needs the owner's acceptance recorded in the PR body (§3.3 rule 3).

**Retro sign-off (P-61).** Review and accept (or revert) foreign edits to lane-01 files: #359/#361/#363/#364 (lane 03 →
`Renderer.ts`), #360/#365/#366/#347 (lane 05 → `lod-dither.glsl.ts`, `contracts/renderItem.ts`), #346 (lane 06 → 01 files).
Record the outcome in each PR thread.

## Remaining tasks (exact ids from PRD-16 §4.1; done = passing remote run id next to each)

### Task 1 — T0-01: the MSAA HDR target must mount (P0, hour 0; unblocks every lane)

Under `A3D_QR_CORE` (sub-flag `A3D_QR_CORE_OUTPUT`) the production renderer never mounts: black frames, `drawCalls 0`,
error `INVALID_RENDER_TARGET_SAMPLE_COUNT` in 6/6 all-flags payloads *(CI)*. Verified on main afb475c2 *(code-read)*:

- `packages/rendering/src/Renderer.ts:1309` `ensureHdrSceneTarget(format, coverage)`; `:1317-1327` always calls
  `createRenderTarget({ colorAttachments: coverage ? [{format},{format:'rgba8'}] : [{format}], depth:'texture', sampleCount:4 })`.
  Called at `:717` (`render`) and `:1020` (`renderAsync`) before `beginFrame`.
- `packages/rendering/src/WebGL2Device.ts:676-683` routes any `colorAttachments` to `createFeatureRenderTarget`, whose guard
  at `:899` throws when `sampleCount > 1 && (depthOnly || depthCompare || colorAttachments !== undefined || layerCount > 1)`.
- Then `frameLoop.ts:222-228` disposes and `createAuraApp.ts:421-441` sets `productionMountFailed` but still resolves
  `ready()` — that is why the harness waits 240 s on a dead app.

**Claim protocol (avoid two writers).** `gh pr list -R auraoneai/aura3d --state open --search 'T0-01 in:title'` and
`git ls-remote origin 'qr/prd01-t0-01*'`. If either exists, review it (insist on everything below) and go to Wave A. If
neither exists, push branch `qr/prd01-t0-01-msaa-mount` and open a **draft** PR titled `[QR-01] T0-01 MSAA HDR target mount`
within your first 15 minutes; that PR is the claim. Note the claim in the PR body so FINISH-00 reviews instead of writing.

**Fix (one PR, nothing else in it):**
1. `Renderer.ts:1317-1327`: omit `colorAttachments` when `coverage` is false (single-target MSAA path, which the device
   supports and resolves via `resolveMultisampleTarget`, `WebGL2Device.ts:1180`).
2. `WebGL2Device.ts:899`: treat `colorAttachments?.length === 1` with no layers/compare as single-target, not MRT.
3. Coverage + MSAA (`backgroundCoverage === true`): either real MSAA MRT (one multisample renderbuffer per attachment,
   per-attachment `blitFramebuffer` resolve with `readBuffer`/`drawBuffers` per attachment) or force `sampleCount:1` for
   that descriptor and record a C-36 degradation `hdr-msaa-mrt-unsupported`. Pick one; declare it in the PR body.
4. Make the device error reach `diagnostics().errors` (`renderer-mount-failed`) rather than a silent dispose (the
   `createAuraApp` half is lane 15's Q-15-9; file or link it, do not edit `createAuraApp.ts`).
5. Tests: unit (descriptor shape for coverage on/off; guard accepts length-1); a **real-device** browser spec (not
   `MockRenderDevice`) mounting `?a3d-qr=core` on `01-simple-geometry` and asserting `drawCalls > 0`, non-black centre luma,
   `diagnostics().errors` empty. Flag-off must stay byte-identical (sentinel).

**Done when** (PRD-16 §2.2 T0-01): `?a3d-qr=core` on `01-simple-geometry` draws > 0 calls and a non-black lit quad through the
HDR target + OutputPass on **GitLab macOS** (`[qr-gitlab:benchmark flags=core]` in the head commit), `diagnostics().errors`
empty, plus the §2.4 Round 2 bisect (`core;core,-core_output;core,-core_generator`) on the 6 probes attached to the PR showing
the next layer (T0-02 `binding=` compile failures, T0-03 silent skip at `ForwardPass.ts:339`/`:471-478` via
`ProgramCache.ts:79-104`, T0-06 warmup only on `renderAsync` at `Renderer.ts:939`). Post the bisect table in the PR and in
the T0 tracking issue so every lane can rebase onto a mounting renderer.

### Wave A — P0, start at hour 0 (no overlap with FINISH-00's lines)

| ID | Task (file:line) | Done when |
|---|---|---|
| T0 review | Review each FINISH-00 lane-01 PR (T0-02..T0-07) for correctness against PRD-01 §6-§9: T0-02 `UniformBlock.ts:80-84` `binding=` + `gl.uniformBlockBinding`; T0-03 C-36 `program-compile-failed` degradation + legacy fallback (`ProgramCache.ts:79-104`, `ForwardPass.ts:339,471-478`); T0-04 `OutputPass.ts:129` restores the previous target, not `input`; T0-05 `qrSubFlags.ts:38-44` passes `{flags}` to the cache (co-PR with 04); T0-06 warm on the sync `render` path too (`Renderer.ts:939`, `:1221-1252`); T0-07 `postSkipped` (`Renderer.ts:665-672,968-975`). Insist on real-device browser tests. | acceptance recorded per PR; each merged PR cites its bisect run |
| 01-GENTEST | Resolve the C-02/C-03 conflict with lane 04: `generator-integration.test.ts:70,93` registers the prd04 lobes and asserts **Lambert** default (PRD-01 §8.3; Burley only behind `DIFFUSE_BURLEY`); `physicalFeatureSet` keeps instancing/skinning/vertexColors. Agree the expectation with lane 04 on the T0-05 issue. | qr-prd01-core unit job green on main |
| 01-HANG | `tests/qr/prd01/browser/laneHarness.spec.ts`: aura3d lane scenes never publish `__QR_READY__` even with `none` (scene-graph-hierarchy, tonemap-exposure-ramp, blend-modes, primitive-catalog, draw-throughput). Fix `benchmarks/quality-rebuild/aura3d/scenes/prd01/*.ts` and `tests/qr/prd01/harness/main.ts`; fix `app.capture` "extension did not resolve" (`engine/src/lanes/prd01.ts` C-38 output extension). Adopt lane 12's fail-fast (`__QR_ERROR__`, T0-10) in the lane harness. | laneHarness + app-capture specs green on macos-14 |
| 01-CI / P-07 | `qr-prd01-core.yml:8-31`: add `packages/rendering/src/**` (owned dirs), `engine/src/agent-api/{sceneGraph,color}.ts`, `push: branches:[main]` (today `:20-21` is `qr/**` only), nightly `schedule`; artifacts on `always()`; remove `\|\| true` on lint (`:83`); ownership awk (`:67`) must not exempt owner 15; add the `perf` (§16.3) and `capture` (§16.2) jobs; make it `workflow_call` for `qr-required` (§2.5). | a PR touching `ForwardPass.ts` triggers it; a main push runs it; lint failure fails the job |
| 01-REQ / P-64 | File every row of `qr-requests/qr-prd01-requests.md` as a GitHub issue: Q-03-1/2/3, Q-04-1/2, Q-07-1, Q-09-1, Q-10-1, Q-11-1..4, Q-12-1/2, Q-13-1/2, Q-14-1, Q-15-1..10, QR-OWN-1. Critical path first: Q-15-2, Q-15-7, Q-15-9, Q-03-1..3, Q-11-3, Q-11-4, Q-12-1, Q-14-1. Write each number back into the ledger. Accept or decline inbound Q-05-7/8/10 (lane 05 → 01; Q-05-7 is the asset-lookdev UBO shim that T0-02 deletes). gh is already authenticated; never log in. | every ledger row has an issue # |
| 01-REC | F-01-02 back to `proposed` until S6 has a browser MAD run (P-51, `CONTRACTS.md:2814`); mark `evidence/prd01/IC-0/README.md:16` `placeholder` (P-56); keep the checklist at 0/73 until checklist-lint exists, then tick only with `run:<id>` (P-55). | records match runs |

### Wave B — P1 core correctness (after the T0 PR touching the same file merges; rebase first)

| ID | Task (file:line) | Done when |
|---|---|---|
| 01-RTARRAY | `render-targets.spec.ts` "array: framebuffer status invalid": per-layer `framebufferTextureLayer` in `WebGL2Device.createFeatureRenderTarget` (~`:930-1010`). After T0-01 merges. | spec green on macos-14 |
| 01-MOUNTERR | `renderer-mount-failure.spec.ts:38` errorsCount 0: record `{code:'renderer-mount-failed'}` in `diagnostics().errors` (`engine/src/lanes/prd01/outputSurface.ts` only forwards). Needs Q-15-9 (lane 15, `createAuraApp` catch). | spec green (S14) |
| 01-DFG | `u_dfgLut` is declared (`program/chunks/brdf.glsl.ts:51-52`) but never bound: upload the r185 DFGLUTData 16×16 RG16F once per device and bind it in `MaterialBinding.bindGenerated`. | brdf-reference (d) byte-identity vs `three/src/renderers/shaders/DFGLUTData.js` |
| 01-S1 | Create `tests/unit/contracts/impl/prd01-frame-graph.test.ts` (forwardTarget on blackboard, sceneDepth, flags-off 0 calls, `FRAME_PHASE_SPACE_MISMATCH`, transparent interleave) + browser `frame-graph.spec.ts`; also the missing C-05 impl conformance (audit: no C-01/C-05 impl tests exist). | green; S1 conformance real = stub for C-01/02/04/05/06/07/08 |
| 01-S2 | Create `engine/src/agent-api/compiler/sceneGraph.ts`: C-06 `composeWorldMatrix` under `A3D_QR_CORE=v2`, TRS decompose, lookAt after composition, S(size⊙fit) innermost, dirty-cache counter. Tests: compiler-scene-graph (flag-off byte-equal on 18 snapshots, 50 random TRS), lookAt, 1000-node cache. Depends on Q-15-7. | `prd01-scene-graph-hierarchy` IoU ≥ 0.98, centroid ≤ 2 px vs three; six Euler orders 1e-5 |
| 01-T1.5 | rotationOrder/quaternion in `compiler/sceneGraph.ts`; remove them from `diagnosticOnly.prd01.ts`; facts F-01-rotationOrder, F-01-groups. Depends on Q-15-6/7. | option rows change RenderSource (unit) |
| 01-S3 | Create `tests/qr/prd01/browser/primitive-catalog.spec.ts`: IoU ≥ 0.98, cap IoU ≥ 0.97, cap luma ±10 %, cap normal ≤ 10°, sphere radial ≤ 0.5 px; 685 boxes → 1 upload; F-01-tessellation/capsule. | green + metrics in `evidence/prd01/phase-1/` |
| 01-S4 | Create `tests/unit/contracts/impl/prd01-geometry.test.ts`: 3×3 world·instance·geometry grid, 45° non-uniform; browser instance-grid coverage ±5 % of three. Depends on Q-15-2. | green |
| 01-S5 | Create `engine/src/agent-api/compiler/color.ts`: the 6 helpers in `agent-api/colorUtils.ts` delegate to `parseAuraColor` under the flag and warn `COLOR_PARSE_FAILED`; verify the 40-row table in `prd01-color.test.ts`. Depends on Q-15-7. | unit green |
| 01-S6 | Create `tests/qr/prd01/browser/blend-modes.spec.ts`: MAD ≤ 2/255 vs three (4 modes × HDR gradient); C-04 browser conformance 4×3; sort-order unit. Then F-01-02 → `verified` with this run id. | green + run id on F-01-02 |
| 01-S11 | app-capture (`preserveDrawingBuffer` true/false, MAD ≤ 1/255 vs `toDataURL`); `dpr.spec.ts` DSF 1/2/3; migrate lane-01 class-(b) rows in `evidence/prd01/readback-triage.json`. Needs T0-04. | green; triage rows marked |

### Wave C — P1 generator, BRDF, output, perf (after T0-02/T0-03/T0-05 merge)

| ID | Task (file:line) | Done when |
|---|---|---|
| 01-S7 | Generator-only keys on the 18 base scenes with `core`; create `tools/shader-lint/index.ts` (PRD-01 §15 forbidden patterns, one fixture each) wired into `pnpm test:unit` (`tools/**` is lane 15: file the request or get a co-sign); 5,000-record key-uniqueness unit; KHR_parallel_shader_compile pending→ready browser test. | `diagnostics().programs` report shows only generator keys; `program-generator-compile.spec.ts` + C-02 browser "every registered chunk from any lane compiles" green with `qr_flags=all` |
| 01-S8 | `tests/qr/prd01/unit/brdf-reference.test.ts` (a)-(d) vs a CPU port of r185 `BRDF_GGX_Multiscatter` + `RE_IndirectSpecular_Physical`; HDR readback of white Lambert under ambient 1 = 1/π ± 1 %. Needs 01-DFG. | green |
| 01-S9 | 60-frame dolly on `prd01-specular-aa` (core / none / three); `tests/qr/prd01/metrics/temporalSigma.ts`. | σ ≤ 1.2× three and ≤ 0.5× flag-off; report + run id |
| 01-S10 | `tests/qr/prd01/browser/output-pass.spec.ts`: aces/agx/neutral × exposure 0.5/1/2 ΔE2000 ≤ 2 (mean ≤ 1); dither; `#336699` coverage 1-3; overlay-zero bit identity; emissive 4.0 ± 1; exposure doubling; C-05 impl conformance; delete the `sceneExposurePresets`/`defaultExposure` lies under the flag; F-01-output/exposure/capture. Depends on 03 Q-03-1. | green + ΔE table committed |
| 01-S12 | `evidence/prd01/phase-3/declared-changes.md` (fudge removal, ambient 1/π, tessellation) + core-vs-none G-REG on the 18 base scenes. Needs Track 0 exit. | no undeclared regression |
| 01-S13 | perf job: `prd01-draw-throughput` 600 frames, 0 pipeline constructions after frame 2, create deltas 0, heap ≤ 16 KB/frame, CPU submit ≤ 40 % of flag-off; 10k instances = 1 draw; VAO eviction at 1,000 buffers; 576-box `consolidateStatic`; 60 s orbit 0 compiles (pairs with T0-06); `instancing-buffers.spec.ts`. Depends on 11 Q-11-3. | perf job green + counters report |
| 01-T3 | Units: depth program with a deform chunk; exactly one env sampler; empty-registry clearcoat → one `extension-lobe-pending`; flag-off sentinels for accepted legacy patches (02 Q-01-1..4, 04 Q-01-1..4, 07 R-01-2). | green |
| 01-IC0 | IC-0 for lane 01: `tests/qr/prd01/capture.mjs --flags none,core`, 6 prd01 + 18 base scenes, both engines → `evidence/prd01/IC-0/`, replacing the TBD at `README.md:16`. Needs Track 0 exit (core must draw). | ≥ 48 images + metrics + run id |

### Wave D — issues, promotion, integrated (P1/P2)

| ID | Task | Done when |
|---|---|---|
| 01-ISSUES | #36 drop `TerrainTile*` exports (`index.ts:727`) + export `toHeightTexture`; #94 `invalidateGpuObjects()`; #90 `scope('shadow'\|'forward')` in Renderer; #113 GLSL `instancing.emissive`; #179 export `batching/`; #180 real `WEBGL_multi_draw` (`webgl2/MultiDraw.ts` is an identity loop); #181 DrawSubmit/BVH consume BatchPlan; #245 float readback on RenderDevice; #198 `allShaderChunks()` (with 15); #148 C-01 `canvas?` CCR; #127 provide `renderScaleSourceSlot` once the CCR lands; #112 WGSL via WgslAssembler (P2, conditional). **#90, #94, #113, #179, #180, #181 block lane 11; #245 blocks lane 07** (§5.3) — do these first. Close #232 only after verifying `OutputPass` matches the §8 reference GLSL; #206 declined (§3.7). Spot-check every "Y?" lane-01 row in `_sections/issues-triage.md` in your first PR. | each closed with a test + run id |
| 01-PROMO | Request `standalone-accepted` only when every criterion below holds. | lane 15 moves `flags.state.ts:11` at a checkpoint |
| 01-T5 | Tonemap A/B capture (aces vs agx) on all prd01 + base scenes; `decisions/tonemap-default.md` stays pending until a G-PANEL decides. Depends on 12 G-PANEL. | captures committed |
| 01-I | G-PANEL I1-I10 (PRD-01 §17.2) with `qr_flags=all` and `all,-core`; tonemap decision; Phase 7 removal (frozen legacy programs, `u_outputColorSpace`). Depends on 02, 03, 04, 12, 14, 15. | integrated-accepted → default-on → removed |

## Issues to action / close (inbound to lane 01; close each only with a test + run id)

| Issue | State on main afb475c2 | Action |
|---|---|---|
| #90 | no `scope('shadow'\|'forward')` in `Renderer.ts` | add FrameStats scopes (blocks 11) |
| #94 | `liveVertexArrays` exposed (`WebGL2Device.ts:531`); no `invalidateGpuObjects()` | implement + unit (blocks 11) |
| #113 | generated path skips 64-instance chunking (`ForwardPass.ts:347-356`); no GLSL `instancing.emissive` | add GLSL chunk (blocks 11) |
| #179 / #180 / #181 | `batching/` not exported; `webgl2/MultiDraw.ts` identity loop; BatchPlan unconsumed | export, real `WEBGL_multi_draw`, consume (block 11) |
| #245 | no float readback on RenderDevice | add with T0-04 follow-up (blocks 07) |
| #198 | no `allShaderChunks()` in `contracts/program.ts` | additive export, co-sign with 15 |
| #148 | no `canvas?` on `contracts/frameGraph.ts` | CCR with lane 15 |
| #127 | `renderScaleSourceSlot` not yet in contracts | provide from `ResolutionGovernor` once 15 lands it |
| #36 | `index.ts:727` still exports `TerrainTile*`; no `toHeightTexture` | drop + export |
| #112 | WGSL target via WgslAssembler — conditional Phase 6 | P2, leave open with a note |
| #232 | overlay uniforms exist (`OutputPass.ts:64-69,101-103`) | verify vs PRD-01 §8 reference GLSL with a browser test, then close |
| #206 | declined in ledger §3.7 | close as declined, quote the reason |

Outbound: lane 01 has **zero** filed requests; 01-REQ files all ~30 ledger rows. #156 (lane 12) blocks promotion.

## PR content still to land

None. #157, #171, #196, #200, #234, #272, #275, #289 heads are all ancestors of main (`git merge-base --is-ancestor`); the
only deliberate loss is `LeanWebGL2Device.ts` (deleted by lane 15's lean collapse 0a5214bd). Do **not** re-open or re-merge
them. Treat their phase-exit claims as unproven: every phase exit is re-earned by the S-row runs above.

## Red flags to revert / never repeat

- Stacked phase PRs merged into each other's branches with a red macos-14 browser job (run 37559564963). Never again: each
  PR merges into `main` with its own green lane run.
- PR titles claimed phases complete while the phase exits require browser and capture evidence that does not exist.
- `IC-0/README.md:16` "TBD" and `tonemap-default.md` "pending" are placeholders; never cite them as evidence (P-56).
- F-01-02 `verified` on unit tests alone (S6 needs browser MAD) — revert to `proposed` (P-51).
- `qr-prd01-core.yml:83` lint `|| true` and the `:67` owner-15 ownership exemption (P-07).
- The audit found **no** loosened thresholds in `tests/qr/prd01` or `impl/prd01-*`. Keep it that way: fix failing tests by
  fixing code, never by loosening, skipping or `test.fail`.

## Flag-promotion criteria for `A3D_QR_CORE` (PRD-16 §4.0, PRD-01 §22; only lane 15 changes `flags.state.ts:11`, at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Do not ask lane 15 for a promotion while it is open; cite its closing PR + passing run id.

- **`dev → standalone-accepted`** (realistic: IC-3 2026-10-29 at the earliest). All must hold:
  - Track 0 exit met (§2.5 `:252-253`), with T0-01..T0-07 each merged with a cited bisect run.
  - S1-S14 green in **one** `qr-prd01-core.yml` run on main (macos-14 or GitLab macOS, `--strict`, no §3 masks, 0 skipped).
  - Sentinel identity with `qr_flags=none` (ΔE2000 p99 ≤ IC-0 noise on `benchmarks/quality-rebuild/sentinels.json`) recorded.
  - C-01, C-02, C-04, C-05, C-06, C-07, C-08 real implementations provided from lane barrels and passing the stub suites.
  - Every F-01-* fact `verified` with a run id; checklist-lint green; all §13.4 requests filed (01-REQ).
  - Then file the promotion request as a `qr-request` `to:prd15` listing the run ids.
- **`→ integrated-accepted`**: I1-I10 at a G-PANEL round (IC-4 2026-11-05 or later) with `all` and `all,-core`.
- **`→ default-on`**: two consecutive checkpoints with no attributed `qr-ic-regression`.
- **`→ removed`**: two more clean checkpoints, then the Phase 7 removal PR updating `REMOVED_QR_FLAGS`.

## Merge rules (binding; PRD-16 §3.3)

- **Every merge needs both of these green on the PR head (green lane workflow + all-flags gate):**
  1. the lane workflow `qr-prd01-core.yml` (unit **and** macos-14 browser jobs; after 01-CI it triggers on every owned path);
  2. the all-flags gate `qr-required / allflags-smoke` (§2.5: `none;$ALL;$ALL,strict` on the 6 probes). While Track 0 is
     open the `$ALL` arms may be expected-red **with an issue link**; a PR that turns a previously green arm red fails. Until
     `qr-required` exists (target 10-10), attach a `flags-bisect` run on your head SHA.
- The other §2.5 required checks must also be green.
- Days 1-2 (to 2026-10-10): merge only Track 0 / Track P rows (§6.1 `:825-827`).
- "Pre-existing failure on main" is not an exemption. No merge while a check is queued or running.
- No direct pushes to `main`, no local merges into main, no force-push. Stacked PRs merge bottom-up into main.

## Remote-only routing (CI-ROUTING.md; never local)

- Locally: editing, `git`, `gh` reads, `rg`, `tsc` on touched packages, targeted single-file vitest. No local Playwright,
  Chromium, captures, full suites, heavy builds or Docker.
- PR gates: typecheck/lint/unit/ownership on GitHub ubuntu; browser conformance + sentinel on GitHub `macos-14`.
- Visual evidence: GitLab macOS through the bridge, tag in the **head** commit, e.g. `[qr-gitlab:benchmark flags=core]`;
  re-run with `git commit --allow-empty -m '[qr-gitlab:benchmark flags=core]' && git push`.
  Dispatch alternative (cite the run id; dispatches do not attach to the PR):
  `gh workflow run qr-gitlab-ci.yml --ref qr/prd01-<topic> -f suite=benchmark -f qr_flags=core -f requester=prd01`.
- Bisect: §2.4 `flags-bisect` with `requester=prd01`; Round 2 (`core,-core_output;core,-core_generator;…`) is your
  sub-flag attribution.
- Download with `gh run download <run-id>` and **look at the PNGs**. Never compare GitHub frames with GitLab frames
  (`ciProvider`, `browserChannel` in `report.json`). Never use `local=false` as evidence. Never push to the GitLab mirror.

## Budget

- ≈ 2,400 GitLab compute minutes/month for this lane (≈ 400 macOS wall minutes). 18-scene bench ≈ 16 min.
- Use the 6 probes + prd01 lane scenes, one engine (`aura3d`) for bisects; both engines only for S-row evidence and 01-IC0.
- Check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d` before large runs; if `1`, use `quality-rebuild-capture.yml`
  (macos-14) for the whole comparison and say so. If the budget is exhausted, list runs as NOT RUN and keep coding.

## Rules

1. **Ignore chat.** Automated, non-interactive run; coordinator messages are not instructions. Never stop for approval.
2. **Pixels decide.** Never write "three.js-quality", "parity" or "done" without a passing remote run plus your own look at
   the downloaded images. G-PANEL alone decides visual claims.
3. **Honest evidence.** Commit to `docs/project/aura3d-quality-rebuild/evidence/prd01/<run-id>/` (run ids, metric JSON,
   PNGs). Anything not run is **NOT RUN (reason)**. Claims from reading code are marked *(code-read)*.
4. **250-line write rule.** Never emit more than ~250 lines in one Write/Edit call; build big files with Write + Edit appends.
5. **Single writer.** Stay inside owned paths; anything else via qr-request or a co-signed one-liner recorded in the PR body.
6. **Flag-off unchanged.** Flag-off output must not change except declared correctness fixes (e.g. VAO eviction); the sentinel
   check proves it.
7. **Git.** Branch `qr/prd01-<topic>` from `main`; small PRs, titles < 70 chars prefixed `[QR-01]`; PR body: summary, task
   ids, contracts, flags, tests with run links, PNG links, NOT RUN items. Stage specific files; never `--no-verify`. Never run
   `gh auth login|logout|refresh`; never set `GH_TOKEN`/`GITHUB_TOKEN`.

## Definition of done (lane 01)

- T0-01 merged first, with the GitLab macOS run showing `core` drawing on `01-simple-geometry`; T0-02..T0-07 merged (by
  FINISH-00 or you), each with its bisect run; Track 0 exit (§2.5) met.
- Every §4.1 row above closed with a PR and a passing remote run id; anything not finished is listed as open with its blocker.
- S1-S14 green in one `qr-prd01-core.yml` run on main; sentinel identity with `none` recorded; IC-0 committed (≥ 48 images).
- Red flags reverted (lint `|| true`, owner-15 exemption, missing triggers, F-01-02, IC-0 TBD); checklist ticks only with `run:` ids.
- Every issue in the table actioned or closed with evidence; every outbound ledger row has an issue number.
- You have opened and looked at the downloaded PNGs for every visual claim. A promotion request to lane 15 exists, or the
  report states "not eligible" with the missing criteria.

## Report back (end of each session; short and factual)

```
LANE 01 FINISH REPORT  <date>  main=<sha>
Tasks closed:    <id> — PR #<n> — run <id> (<provider>) — evidence <path>
Tasks open:      <id> — state — blocker (lane/issue)
Track 0 review:  T0-01 (written|reviewed) — PR #<n> — GitLab run id — drawCalls/luma on 01-simple-geometry
                 T0-02..07 — PR #<n> — accepted y/n — bisect run id — none/core/$ALL result
S-rows green:    S1..S14 with run id each; others = FAILING|NOT RUN (reason)
Issues:          closed #… ; opened qr-request #… (to:prdNN) ; qr-ic-regression #…
Records:         F-01 status changes, IC-0 README, checklist ticks with run ids
Flag state:      A3D_QR_CORE=<state>; promotion request #<n> or "not eligible: <missing criteria>"
GitLab minutes:  used this session ≈ <n>; QR_GITLAB_PAUSED=<0|1>
NOT RUN:         <item> — <reason>
Risks:           <one line each>
```
