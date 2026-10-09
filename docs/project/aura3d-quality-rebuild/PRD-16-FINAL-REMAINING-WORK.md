# PRD-16 Final remaining work (status as of main afb475c2, 2026-10-08)

Owner: program (custodian lane 15) · Contributors: lanes 01-15 · Supersedes nothing; it is the single remaining-work
ledger for PRD-01..15. Every task here is open until a **passing remote run id** (GitHub Actions macos-14 or GitLab macOS
pipeline) is cited next to it. Local vitest, prose evidence, "NOT RUN" sections and green-by-mask jobs do not count.

Appendices (copied verbatim, binding):
- `_sections/integration-findings.md` — combined-flags root cause, bisection plan (source of Track 0).
- `_sections/process-remediation.md` — every mask / loosened threshold / unbacked tick (source of Track P).
- `_sections/issues-triage.md` — all 195 open issues, per lane, still-needed status, blocking list.

Sources: per-lane audits `/tmp/qrfinal/audit-NN.json` (auditor + skeptic per lane), GitLab pipelines 2926601350 (bench,
13 lane flags) and 2926540757 (flags=all incl. strict, bench + games), `gh run list/view`, `git merge-base --is-ancestor`.
No browser, build or test was run locally for this document. Claims marked *(code-read)* were found by reading code and
have not been reproduced; claims marked *(CI)* cite a failing remote log.

---

## 1. Executive status

### 1.1 Bottom line

- **Nothing from the quality rebuild is live.** All 15 lane flags are `dev` (`packages/rendering/src/contracts/flags.state.ts:11-25`, plus `A3D_QR_COMPILER`/`A3D_QR_STRICT`; `REMOVED_QR_FLAGS` empty),
  so the default `createAuraApp` path still renders 3.0.1 pixels. With flags `none`, main is pixel-identical to the 85aafcd0
  baseline (IC-0 identity pass). That is the *only* acceptance-grade result the program has.
- **The combined build does not render.** With 13 lane flags on (pipeline 2926601350): **0/18** benchmark scenes rendered —
  12 timed out at 240 s (02-09, 13, 15, 17, 18 — the HDRI/`environment:` scenes), 6 reported `ready` after 90-135 s with `drawCalls 0` and pure-black frames
  (01, 10, 11, 12, 14, 16). 10/13 lane scenes failed (6 timeouts; 3× `TypeError: g.color is not a function` in prd05; 1×
  `prd12-ref-06-product-turntable is not active`). With `A3D_QR_STRICT` (pipeline 2926540757) every Aura scene throws
  `AuraMigrationError` in 0.4 s because the harness passes `renderer.mode`; **9/9 games** crashed or never drew
  (`Target page closed`, `ready=no-draw-timeout`).
- **Root cause #1 is a single lane-01 bug** *(CI: the exact error string is in `payload.errors` of all 6 "ready" scenes)*:
  `Renderer.ts:1317-1327` `ensureHdrSceneTarget` requests `colorAttachments:[{format}]` + `sampleCount:4`;
  `WebGL2Device.ts:899` rejects any MSAA descriptor with `colorAttachments` → `RenderDeviceError INVALID_RENDER_TARGET_SAMPLE_COUNT`
  on frame 1, before `beginFrame`. The mount fails, `ready()` still resolves, the canvas is never written. Behind it sit at
  least 12 further *(code-read)* defects in lanes 01/02/03/04, plus lane-found T0-33 (10), T0-34 (07) and T0-35 (11),
  that will surface one by one (Track 0, §2.2).
- **Why it looked done.** ~151 [QR-NN] PRs merged 2026-10-06..08 into an unprotected `main` (no branch protection, no
  required checks, no rulesets). 109/136 PRs merged since 10-05 had ≥1 failing check. Lane browser gates were red at merge
  for every lane; masks (`continue-on-error`, `|| true`, `test.fail`, self-skips, `exit 0` on empty globs, capture tools that
  exit 0 on zero draws) turned many red jobs green. Bundle budgets were raised twice in one day to fit measurements.
  Checklists were bulk-ticked without run ids (03: 54/56, 06: 69/70, 07: 61/62, 08: 100/101, 09: 95/96, 12: 64/68).
- **No lane has a green flag-on browser run on main. No standalone acceptance row (S/V-rows) in any lane is proven by a
  remote run** except: PRD-02 S15 (unit), PRD-03 S20 (WGSL compile), PRD-10 S15 (time-of-day 4/4, run 37497949014), PRD-10
  S11/S12 (engineering-only units), PRD-11 S10 (rg + non-gating webgpu smoke), PRD-12 Phase 0, PRD-15 Phase 1/5/6.
  These are **provisional**: run 37497949014 is the lane-10 run whose job was green only because 2 failures were masked
  (P-04), the webgpu smoke is non-gating, and the other rows have no run id recorded in this ledger. Each must be re-cited
  from a mask-free, `--strict` run on main (run id next to the row) before it counts toward promotion.
- **Every push workflow on afb475c2 is red or cancelled**: Build and Test, CI Type Check, Test & Coverage, QR-15 bundle size
  (vite: `Could not resolve entry module .../dist/animation/pose/retarget.worker.ts`, lane 06), Template lookdev, Agent Skills,
  quality-devices; Quality Gate cancelled.

### 1.2 Per-lane status

`%` for 01-05 is the per-lane inventory figure; for 06-15 it is this document's estimate from the audit + skeptic records
(phase statuses, S-rows, gaps). "Proven" = S/V-rows with a passing remote run id.

| Lane | Flag(s) (all `dev`) | % | PRs | Proven S-rows | Lane CI on main / last | Top blocker |
|---|---|---|---|---|---|---|
| 01 Core | A3D_QR_CORE (+_OUTPUT, _GENERATOR) | 38 | 8 stacked, all on main | 0/14 | qr-prd01-core: no main trigger; 36/40 fail; unit red (generator-integration) | MSAA HDR target throws; GLSL `binding=` invalid; silent skips |
| 02 Lighting | A3D_QR_LIGHTING | 40 | #167 closed, content on main | S15 (unit) | lighting-quality: browser 2/5 fail hidden by continue-on-error | shadow/contact passes unbind HDR target; C-09 probe never bound |
| 03 Post | A3D_QR_POST | 50 | #133/#174/#356 closed, direct-pushed | S20 | post-quality: 35/40 fail; unit dies at repo typecheck; main browser step is a no-op glob | MSAA never resolved for v2 HDR stages; GL state cache not invalidated |
| 04 Materials | A3D_QR_MATERIALS/_TRANSMISSION/_KTX2 | 50 | #286 closed + stack, all on main | 0/16 | qr-prd04: 3/~101 green; 16/17 browser fail; captures "green" via test.fail | lobe/feature chunks splice inside `main()`; scene-page hang |
| 05 Assets | A3D_QR_ASSETS (+_DECODERS/_LOD/_LOOKDEV) | 50 | 6 squash-merged | 0/11 | qr-prd05-assets-browser: 0 green ever | `.wasm` never committed (`.gitignore:273`); `environments.color` |
| 06 Animation | A3D_QR_ANIMATION (+_POSE_MIXER/_GPU_MORPH/_SKINNED_SHADOWS) | ~55 | 6 merged to main | 0/13 | qr-prd06 browser: never green on final branch (chromium 4/webkit 13/firefox 17 fail) | retarget worker URL breaks packed builds; flag-on binding hang |
| 07 VFX | A3D_QR_VFX (+_SKY/_FOG/_VOLUMETRIC/_DECALS) | ~45 | 7 merged | 0/15 | prd07-vfx on main 37561125962: browser 16/17 fail, capture fails at vite build | capture build (`@aura3d/rendering/world` ENOTDIR); no captures |
| 08 Camera | A3D_QR_CAMERA | ~40 | 7 merged | 0/19 | qr-prd08-camera: 0/34 green; 52/55 lane tests fail on main | public alias drops `createFrameLoop`/`resolveCameraFrame`; gitignored fixtures |
| 09 Game | A3D_QR_GAME | ~40 | 10 merged | 0/9 | qr-prd09-game: 0/106 green | no browser specs; 17/18 routes fail ≤10 % evidence gate; patches don't apply |
| 10 World | A3D_QR_WORLD (+_TERRAIN/_WATER/_BIOME) | ~35 | 7 merged | S11/S12 (eng.), S15 | qr-prd10-world: post-10-06 runs fail at install; last green masked 2 fails | `shaderChunk()` undefined for prd10 chunks; no content shipped |
| 11 Tiers/WebGPU | A3D_QR_TIERS, A3D_QR_WEBGPU | ~40 | 9 merged | S10 | qr-prd11-perf: 0/134 green; both nightlies fail | self-skipping specs; BVH/culler not implemented |
| 12 Bench/QA | (no runtime flag) | ~45 | 7 merged | Phase 0 only | quality-gate: 0 completed of last 100; IC-0 runs failed ×2 | harness reports ready on 0 draws; no goldens; no panel |
| 13 Authoring | A3D_QR_LOOKS | ~45 | 20+ (7 stacked, heads not ancestors) | 0/9 | qr-prd13-authoring: 0/200 green; template-lookdev masked | no baselines; publish cycle `controls↔input`; bundle test loosened |
| 14 Games | 18× A3D_QR_ROUTE_<ID> | ~25 | 24 merged | 0/12 | qr-prd14-games: 1/65 green; capture jobs always skipped | Phase 3 kits + Phase 4 content not started |
| 15 API/Arch | A3D_QR_COMPILER, A3D_QR_STRICT | ~65 | 12 (6 stacked, all on main) | Ph 1/5/6 | arch-gates fail (32 enforced); Type Check red; bundle budgets ratcheted | 4.0 removals before 3.1.0 published; §16.1-16.4 never captured |

### 1.3 PR landing problems

No lane PR content was found missing from main, except files PRD-15 deleted on purpose (`LeanWebGL2Device.ts`,
`production-runtime/ProductionRuntimeRenderer.ts`, `ProductionWebGL2Renderer.ts`) and the `.wasm` binaries #347 claims but
`.gitignore:273` excluded. Landing *paths*, however, bypassed every gate:

| PRs | Lane | How content reached main | Consequence |
|---|---|---|---|
| #133, #174, #356 (CLOSED) | 03 | direct pushes 9e6157b8+77e80ba5, fa4d0028, 822c19fc (head itself) | Phases 0-2 never gated by a PR-to-main run |
| #167 (CLOSED, base qr/prd02-math-modules) | 02 | local merge 9a774061 pushed to main; 98/100 sampled files identical | lighting-quality.yml never gated Phases 2-7 |
| #286 (CLOSED) + #301/#317/#321/#328 (merged into stack branches) | 04 | manual merges d3eb6dc2, f4c1b894; #301/#317 head objects gone (branch rewritten), content verified via #321 head b27c30f9 | no PR-to-main CI on combined stack |
| #157, #171, #196, #200, #234, #272, #275, #289 (merged into each other's branches within ~30 s) | 01 | heads are ancestors of main | macos-14 browser job red on every phase branch (run 37559564963: 15 failures) |
| #169, #182, #319, #330, #335, #336 (stacked) | 15 | heads are ancestors of main | arch-gates red at merge |
| #173, #191, #202, #239, #244, #269, #273 (stacked, merged into qr/prd13-* bases) | 13 | heads are **not** ancestors of main; all their files exist on main but none is byte-identical to the PR head (later edits by #297-#305 and #357's 151-file lane-13 sweep) | **verify**: lane 13 must diff each PR head against main and confirm no hunk was lost (task 13-LAND) |
| direct pushes 2ed5c16e (2,670 files), 1f579954 (444 files), fd2e8060, 9ff024f1 | 13/mixed/15/03 | no PR | retro-review required (P-12) |

### 1.4 Open issues

195 open (`_sections/issues-triage.md`): 115 qr-request, 35 handoff-14, 17 removal, 15 ccr, 8 fact-13, 5 other.
Still needed: 62 confirmed (Y), 107 assumed (Y?), 13 partial; 11 done on main (R/R?) + 2 obsolete = 13 closable
(62+107+13+11+2 = 195). **Close now (10):** 8 done #74, #155, #164, #232 (verify vs §8), #236, #247, #251, #339 + 2 obsolete #225,
#261; **#145** is code-done per triage but stays open as a Track 0 blocker and closes with the T0-28 PR; **verify-then-close (2, counted in the 11 done):** #161, #211; duplicates/umbrellas #172, #314, #77/#78/#79.
**53 issues block some lane's standalone acceptance** (lane 15 owns 17 of them). By owner: 15 → 63, 14 → 37, 13 → 12,
01 → 11, 12 → 11, 07 → 10, 09 → 10, 11 → 10, 04 → 9, 02 → 7, 05 → 7, 03 → 4, 10 → 2, 08 → 1, other → 1, 06 → 0.
In the other direction, **≈150 outbound requests exist only in markdown ledgers** (lanes 01, 02, 03, 04, 05, 06 filed none on
GitHub; "gh unauthenticated"). Filing them is task P-64.

---

## 2. Track 0 — Integration recovery (P0)

Must land before **any** flag promotion and before any lane claims standalone acceptance. Owners: **lane 01** (renderer
core), **lane 12** (harness, capture, CI inputs), **lane 15** (custodian: flags, strict, required checks, typecheck triage).
Lanes 02/03/04/05/06/07/08/09/10/11/14 fix their own defects listed below in their own files. Every other lane keeps working in its own files
during Track 0 (§6).

### 2.1 Fix order

The defects are layered: fixing T0-01 exposes the next layer. Fix in this order, re-running the bisection round after each
group (§2.4). Do not batch all fixes into one PR — each PR must show the bisection set it unblocks.

1. Harness honesty first (T0-10..T0-14) so failures cost ~2 s and report as failures, not 240 s "ready".
2. Renderer mount and generated programs (T0-01..T0-07).
3. Render-target / state hygiene in other lanes' passes (T0-08, T0-09, T0-15..T0-19).
4. Build/packaging breakers (T0-20..T0-23).
5. Second-layer lane interactions (T0-24..T0-32), plus the lane-found T0-33 (10), T0-34 (07), T0-35 (11), which
   may be first-layer causes for their flags and should be verified by Round 1 single-flag sets.

### 2.2 Root-cause tasks

| ID | Owner | Defect (file:line) | Fix | Done when |
|---|---|---|---|---|
| T0-01 | 01 | `Renderer.ts:1317-1327` `ensureHdrSceneTarget` always passes `colorAttachments:[{format}]` with `sampleCount:4`, `depth:'texture'`; `WebGL2Device.ts:676-683` routes any `colorAttachments` to `createFeatureRenderTarget`, which throws at `:899-904`. Thrown at `Renderer.ts:717` (render) / `:1020` (renderAsync) before `beginFrame`; `frameLoop.ts:222-228` disposes; `createAuraApp.ts:421-441` marks `productionMountFailed` and still resolves `ready()` (commits e7bcafc4 vs 566c4d50). *(CI, 6/6 payloads)* | Omit `colorAttachments` when `coverage` is false **and** treat `colorAttachments?.length === 1` as single-target in the device guard. For coverage + MSAA: either real MSAA MRT (one multisample renderbuffer per attachment + per-attachment blit resolve) or force `sampleCount:1`. Add a real-device browser test (not MockRenderDevice) mounting the v2 output path. | `?a3d-qr=core` on `01-simple-geometry` draws > 0 calls and a non-black lit quad through HDR target + OutputPass on GitLab macOS; `diagnostics().errors` empty. |
| T0-02 | 01 | `resources/UniformBlock.ts:80-84` emits `layout(std140, binding = N)` (via `program/chunks/common.glsl.ts:18`, `AURA_FRAME_BINDING`) inside `#version 300 es` (`ProgramGenerator.ts:183,412`) — invalid in GLSL ES 3.00 (*CI* `program-generator-compile.spec.ts`: `ERROR: 0:16: 'binding' : invalid layout qualifier`). No `gl.uniformBlockBinding` exists in `packages/rendering/src`. Lane 05 found and shimmed it only in `apps/asset-lookdev` (`installGeneratedProgramUboShim`, unfiled Q-05-7). | Emit `layout(std140)` for glsl300es. After link in `WebGL2Device` sync + `compileAsync` (~`:542`) call `gl.uniformBlockBinding(p, gl.getUniformBlockIndex(p,'AuraFrame'), 0)` and `'AuraLights'` → 1 when index ≠ `INVALID_INDEX`. Update `ForwardPass.ts:320` comment + generator snapshots. Delete the asset-lookdev shim. | `tests/qr/prd01/browser/program-generator-compile.spec.ts` green on macos-14; `diagnostics().programs` 0 failed on prd01 scenes with `core`. |
| T0-03 | 01 | Silent skip: `ForwardPass.ts:471-479` returns `undefined` for non-ready handles, `drawItem` returns at `:339`; `ProgramCache.ts:79-83,101-104` caches `failed` forever, error swallowed. | On `failed`: one C-36 degradation `program-compile-failed` {key, error} per key + one `console.error`; under strict throw; otherwise fall back to legacy `shaderKey` module for that draw. Expose `stats().failed` in C-31 `programs`. | Forced chunk compile error → visible degradation + fallback draw (unit + browser); `programs.failed > 0` reported. |
| T0-04 | 01 | `output/OutputPass.ts:127-129` re-binds the rgba16f MSAA HDR input after presenting; `Renderer.captureFrame` (`Renderer.ts:1260-1262`) → `webgl2/Probe.ts:59-84` then `readPixels` RGBA/UNSIGNED_BYTE on a float FBO (INVALID_OPERATION → black captures). | Restore the previous target (`null` = canvas). | `app-capture.spec.ts` with `core` passes, MAD ≤ 1/255 vs `toDataURL`. |
| T0-05 | 01 **+ 04** | `renderer/qrSubFlags.ts:38-44` calls `programCacheSlot.get(flags)(device)` with no options → `ProgramGenerator.ts:72` (`contributingFeatures`) and `:466-468` (`extensionLobeChunks`) splice nothing from lanes 02/04/06/07/10. **Landmine:** once flags flow, lane-04 lobe/feature chunks (function definitions) are pushed **inside `main()`** (`ProgramGenerator.ts:354,372,381,391,406`), `hookSplice` (`:132-153`) emits a chunk before its `requires`, and a `fragment:indirect` contribution replaces `defaultIndirectBody` (`:380`) stripping all IBL. Features define `A3D_PRD04_TRANSMISSION_TARGET` but chunks gate on `A3D_TRANSMISSION`. | One PR, co-owned: (a) pass `{ flags, onDegradation }` through `rendererProgramCache`; (b) split every chunk into a *pars* library (global scope) + call snippet; emit `requires` first (topological); (c) indirect contributions append, never replace; (d) map feature defines to chunk guards. Must land after T0-03 so failures are visible. | C-02 browser conformance "every registered chunk from any lane compiles" green with `qr_flags=all`; clearcoat GLB generated source contains the prd04 clearcoat chunk; `programs.failed == 0`. |
| T0-06 | 01 | Warmup only on `renderAsync` (`Renderer.ts:939`); `warmGeneratedPrograms` (`:1221-1252`) omits item-driven `instancing`, `backgroundCoverage`, `target` added in `ForwardPass.programFeaturesFor` (`:500-516`). Sync rAF path (`frameLoop.ts:133` → `Renderer.render`) never warms → in-frame compile storms on Metal (games firstDraw 13-37 s, desktop no-draw). | Warm with the exact draw feature record on both paths; bound per-frame compiles; record `programsCompiledSinceReady`. | 60 s orbit after ready: 0 compiles (C-28); games firstDraw ≤ 5 s on macos-14 with `core`. |
| T0-07 | 01 / 03 | `Renderer.ts:665-672`, `:968-975`: under `A3D_QR_CORE_OUTPUT` the configured postprocess chain is set to `undefined` every frame (only `POSTPROCESS_V2_UNMIGRATED` warn) → all-flags build loses bloom/SSAO/AA/grade. | Until lane 03 Q-03-2/Q-03-3 (post-hdr contributors) land: report the skip in C-31 `output` section and as a C-36 degradation; once landed, route through PostGraph v2. | `diagnostics().output.postSkipped` reported, then 0 with `core,post`. |
| T0-08 | 02 | `shadows/ShadowSystem.ts:254,266` end with `device.setRenderTarget(null)`; the `prd02.shadows` pass runs inside `graph.execute` (`Renderer.ts:854`) **after** the HDR target is bound and cleared (`Renderer.ts:749-757`); ForwardPass never rebinds → scene draws to canvas, OutputPass reads an empty HDR target. Same pattern: `passes/ContactShadowPass.ts:116,127,144` (auto-on at Ultra via `Prd02ContactShadowsContributor.ts:~64`), `GPUPMREMGenerator.ts:115`, `ReflectionProbeSystem.ts:128`, `IrradianceVolume.ts:109`. | Capture `prev = device.getRenderTarget?.()` (`RenderDevice.ts:475/835`) and restore it. Add a C-01 frame-graph rule: a contributor must leave the bound target unchanged (assert in dev). | Mock-device unit: target after prd02 passes === target before; GitLab bench 01/10/11/12/14/16 with `core,lighting,post` non-black. |
| T0-09 | 02 | `engine/src/lanes/prd02.ts:113-115` `out.addLights([physicalLightDescriptor(...)])` + legacy collection (`compiler/renderInput.ts:297`) concatenated by `compileScene.ts:97` → every light twice; descriptors lack `layerMask`/`castsShadow`/`sourceId` → `LightUniforms.pack` (`LightUniforms.ts:62-75`) writes NaN. `prd02.ts:133` also overrides `environment`. | Single light path: convert descriptors to `CollectedLight` and suppress legacy collection under the flag. | 1 dir + 1 point light → `collectedLights.length === 2`, finite `layerMask`, no NaN in `u_lightData`. |
| T0-10 | 12 | `benchmarks/quality-rebuild/aura3d/common.ts:424-430` (90 s draw wait falls through), `:499-509` (180 s HDRI wait on `iblPixelBacked`, never satisfiable after a failed mount), `:611-616` returns `ReadyPayload{drawCalls:0, errors:[...]}`; `main.ts:83-85` publishes `__QR_READY__`. Same in `aura3d/scenes/prd05/common.ts:155-161` and prd04 common. | Break both loops on `diagnostics().errors.length > 0` or mount-failed; throw `NoDrawError` when the deadline expires with 0 draws → page publishes `__QR_ERROR__` within ~1 s. | A forced mount failure publishes `__QR_ERROR__` in < 2 s (unit with a fake app + one GitLab run). |
| T0-11 | 12 | `capture.mjs:149-157` sets `status="ready"` whenever `__QR_READY__` exists; `:462-464` exits non-zero only if *every* scene lacks metrics; `--strict` (`:416-420`, `:457`) passed by no caller. `tools/quality-rebuild-capture/capture-games.mjs:1057-1059` exits 1 only with `--strict`, ignores `blankShots` and `readiness: no-draw-timeout`. `.gitlab-ci.yml:114` `--build-only \|\| echo` captures *production* builds when the local build fails. | Status `no-draw` / `renderer-error` when `payload.errors.length > 0 \|\| payload.drawCalls === 0`; pixel-variance blank check on every PNG; exit 1 on any non-ready engine arm unless `--report-only`; strict by default when `process.env.CI`; remove the `\|\| echo`. | Re-running pipeline 2926601350's inputs exits non-zero and lists 18 `renderer-error` rows. |
| T0-12 | 12 + 15 | ~90 s pre-first-frame mount cost on non-HDRI scenes (01: `loadMs 118445`) not located by code reading. | `performance.mark` at createAuraApp start, `Renderer.create` resolved, `compileScene` resolved, first `renderFrame`, mount catch; harness copies `getEntriesByType('mark')` into `payload.extra.mountTiming`. | One remote run names the slow phase; follow-up task filed against its owner. |
| T0-13 | 12 (+05, 04) | `aura3d/common.ts:396` passes `renderer:{mode:"production", qualityProfile:"production", fallback:"safe-basic"}` → `createAuraApp.ts:76-82` throws `AuraMigrationError("renderer.mode + renderer.fallback")` under `A3D_QR_STRICT`. Same at `scenes/prd05/common.ts:145-147` and prd04 common. | Pass `renderer:{ qualityProfile:"production" }` only; verify `resolveRendererQualityProfile("production").rendererMode === "production"` (`rendererOptions.ts:118`). | `bench_flag_sets="$ALL,strict"` mounts every Aura scene (no AuraMigrationError). |
| T0-14 | 12 | `scenes/prd12/ref-06-product-turntable-motion.ts:7-8` (aura3d) and `:8-9` (three) look up `prd12-ref-06-product-turntable`; spec id is `…-motion` (`scenes/prd12/ref-scenes.ts:204`), rejected by `ACTIVE_SCENE_IDS` (`shared/registry.ts:151`). From 5e60cd9a. | Use `spec.id` passed by `main.ts`. | Scene active in both engines. |
| T0-15 | 03 | `post/v2Stages.ts:453-498` `runV2HdrStages` samples `colorHandle`/`depthTextureHandle` of the MSAA forward target, which only `WebGL2Device.resolveMultisampleTarget` (`:1180-1195`) writes — called inside `presentLdrPostprocess` (`LegacyPost.ts:224`) on the pooled `workSource`, never on the source. Any frame with AO/god rays/CA/DOF/MB/auto-exposure/HDR custom pass composites black. | Expose `host.resolveMultisampleTarget` on `WebGL2DeviceHost` (Counters.ts registration); call at the top of `runV2HdrStages`. | AO on, sampleCount 4: mean luma > 0.05 (browser spec in CI). |
| T0-16 | 03 | `post/v2Stages.ts:197-217` (`draw`) and `:919-1067` (`runV2LdrTail`, called after present at `LegacyPost.ts:2833-2836`) issue raw `useProgram`/`bindVertexArray(null)`/`bindFramebuffer`/`disable(DEPTH_TEST,BLEND)`/`bindTexture` with no `host.stateCache.invalidate()`; `WebGL2StateCache.ts:68-89` then skips rebinding next frame. Triggers on vignette/filmGrain/lut/smaa/after-tonemap custom pass (`:908-912`). | Invalidate at the end of `runV2LdrTail` and `runV2HdrStages` (or wrap in save/restoreFullscreenPresentationState). | Two-frame spec with vignette+SMAA: frame-2 drawCalls == frame-1, non-black; unit asserts invalidate. |
| T0-17 | 03 | Per-frame throws: `PostprocessExecution.ts:203-206` + `LegacyPost.ts:233-238` (`WEBGL_LDR_POSTPROCESS_FORMAT_UNSUPPORTED` when `output.toneMapping:'none'` keeps `rgba16f`, `compiler/postprocess.ts:129,166-167`); `:220-225` `HDR_BLOOM_TONEMAPPING_REQUIRED`; `:567-579` `POSTPROCESS_PASS_NOT_GPU` in every non-PROD build (`:632-636`, i.e. the harness); `v2Stages.ts:454-466` missing depth/camera. | Inject a linear OutputPass when no tone pass exists (or target rgba8); record-and-skip CPU passes in all builds, or reject once at compile (`ready()` rejects); never throw inside the frame loop. | No per-frame throw path under `post`; unit for `toneMapping:'none'` ± bloom and compat.post `'3.0'` in dev mode. |
| T0-18 | 04 | `assets/src/GLTFRenderResources.ts:1958-1963`: with `A3D_QR_MATERIALS` the missing-material fallback becomes white/metallic 1/roughness 1 → near-black without bound IBL. `:2080-2091` skips the E22 rewrite because `programCacheSlot.provided` is always true. `forward/Transmission.ts:162-186` publishes an uncopied target (reads `FRAME_RESOURCES.sceneColor`, nobody writes it; `FrameGraph.ts:157` publishes `prd01.forwardTarget`); `:173` leaves the transmission target bound; `:217-243` module-global singleton across devices, new pass/VB/program per frame (GPU leak). | Fallback metallic 0 until C-09 probe is bound (or per glTF spec *and* guarantee IBL); keep E22 until real transmission draws; read `PRD01_FORWARD_TARGET`, restore previous target, per-device contributor, cache copy resources. | `05-transmission`/no-material GLB with `all`: non-black subject; heap/GL object counts flat over 600 frames. |
| T0-19 | 15 | `agent-api/compiler/compileScene.ts:448-461` RenderItem reuse cache keyed by `runtimeId`, not item → multi-mesh GLB actors collapse onto mesh 0; stale skinned items returned. | Key by `${runtimeId}:${itemIndex}` + node version; invalidate on skin/morph change. | Multi-mesh GLB (`03-damaged-helmet`, Sponza) with `compiler`: draw count == flag-off. |
| T0-20 | 06 | `packages/animation/src/pose/RetargetWorker.ts:16` `new Worker(new URL("./retarget.worker.ts", import.meta.url))` — dist ships no `.ts` → every packed-engine consumer build fails (*CI* main run 37775068018). | Point at `./retarget.worker.js` (or `?worker` import emitted by the package build); add it to package `files`/`exports`. | `QR-15 bundle size` consumer-product-viewer build passes on main. |
| T0-21 | 05 | `.gitignore:273 '*.wasm'` → `public/aura-decoders/basis/basis_transcoder.wasm`, `draco_decoder.wasm` never committed; `KTX2BasisTextureTranscoder.ts:52` defaults `transcoderUrl` to `/aura-decoders/basis/` for **every** KTX2 decode regardless of flag; `:104-111` waits on `onRuntimeInitialized` with no `onAbort`/timeout; `KTX2TranscodeWorker.ts:13-27,148-153` no `onerror`; `AssetDecoderRegistry.ts:121-129,251-264` no abort/timeout. | Negate in `.gitignore` (`!public/aura-decoders/**/*.wasm`, `!packages/assets/vendor/**/*.wasm`); commit wasm (sha256 per vendor READMEs, from `node_modules/three/examples/jsm/libs/`); add `onAbort = reject` + 30 s timeout + worker error paths → `AssetDecoderUnavailable`. Ship `/aura-decoders/` in app/template builds (F-05-04). | qr-prd05-assets-browser green; 404 wasm rejects within the timeout (unit). |
| T0-22 | 05 | `aura3d/scenes/prd05/common.ts:74` calls `environments.color({color})` (the minified `TypeError: g.color is not a function` in 3 prd05 scenes: damaged-helmet, skinned, game-scene, `scenes/prd05/index.ts:48,84,123`; flag-independent, throws at scene build ~380 ms) — never existed (`environments.composite.ts:9`); `:71` passes a node into `scene().background()`; `:32` derived GLB URLs from `repoPath` not served (`benchmarks/quality-rebuild/vite.config.ts:55-73`, `publicDir:false`); `:174-178` logs a false "decoded via C-16 registry". `as never` casts hide the type error. | `scene(spec.id).background(spec.background.color)`; register prd05 derived assets in the copy plugin, URLs `/qr-assets/<basename>`; gate the log on real registry use; drop the casts and add `aura3d/scenes/**` to `benchmarks/quality-rebuild/tsconfig.typecheck.json`. | prd05 lane scenes with `none`/`assets`/`all`: drawCalls > 0, no TypeError, ready < 30 s. |
| T0-23 | 15 (+10) | prd07 capture build fails: `Could not load .../packages/rendering/src/index.ts/world (imported by packages/engine/src/lanes/prd10.ts): ENOTDIR` (`prd10.ts:14`, run 37561125962). Not re-verified on afb475c2. | Make `@aura3d/rendering/world` resolve in every vite config from `aura.exports.json` generated aliases (`vite.aliases.generated.ts`); add `./world` export (#249). | `pnpm exec vite build --config benchmarks/quality-rebuild/vite.config.ts` green in the lane capture job. |
| T0-24 | 02 | C-09 probe never bound: no production caller of `bindPrd02EnvironmentProbe` (`compiler/environment.ts:270`) or `resolveEnvironment` (`contracts/environment.ts:47`); `createProductionRuntimeFallbackLights` returns `[]` under the flag (`compiler/lights.ts:20`) → unlit scenes get only `DEFAULT_RENDERER_ENVIRONMENT_LIGHTING` (0.42, `Background.ts:188`). | Wire in `compileScene`/`updateCompiledSceneReal` with **one shared `EnvironmentCache` per app** (`:276` builds a new cache per call); set `environmentProbe`, intensities, ambient; swap on `onUpgrade`. | `lights.ambient(0.5)`-only scene: `environmentProbe.source === 'neutral'`; prd02-no-lights subject luma ±25 % of three. |
| T0-25 | 02 | Neutral room CPU GGX prefilter on main thread: `EnvironmentProbeFactory.ts:63-70` + `workers/cpuPrefilter.ts:154-184` (~33M iterations High, ~130M Ultra) + `probeBuild.ts:280-320`; reachable via `SkyCaptureAdapter.ts:48-51`. 240 s timeout risk on slow GPUs/CPUs. | Prebaked `public/aura-environments` neutral preset (RGB9E5 cube) or Worker; cache per tier. | No lighting long task > 50 ms during mount; prd02-no-lights ready < 10 s. |
| T0-26 | 02 | Ultra allocates 4 × 4096² rgba8 colour + depth cascades (~512 MB) + 1024² atlas (`ShadowSystem.ts:206-226`), rebuilt on every `JSON.stringify(config)` change (`Prd02ShadowsContributor.ts:117`), never sampled (no forward program splices `a3d_prd02_shadow_lookup`; lights read via `sceneFromSource(ctx.source)` which is `undefined` for production sources, `:72`). Tab-crash candidate (`Target page closed`). | Allocate only when a forward consumer exists; depth-only targets (Q-01-5); read `ctx.source.collectedLights`; until C-02 real, bridge prd02 cascade into legacy `ForwardShadowMapOptions` (or keep legacy shadows, `ShadowOrchestration.ts:295-301`). | prd02-15 with `lighting`: shadow-region luma drop 40-60 %; GPU memory in C-31 shadows section ≤ tier budget. |
| T0-27 | 02 | 17-32 lights: `forward/Lighting.ts:483` raises clustering threshold to 32; `LightUniforms.pack` clamps to 16 (`:52`); shader `u_lightData[96]` (`ShaderLibraryCore.ts:394`). | Keep 16 until the AuraLights block program exists, or raise both. | 24 point lights: `lightsDroppedByCap === 0`. |
| T0-28 | 15 | Renderer flags live in a global last-writer-wins store (`rendering/src/renderer/FrameGraph.ts:30-35`), bound only by the prd07/prd11 extension factories (`lanes/prd07.ts:78`, `lanes/prd11.ts:197`; engine `prd11.ts:198`, `vfx/effects-api.ts:315`) *after* `mountCurrentScene` (`createAuraApp.ts:448` vs `:724-728`). Engine-side `prd02LightingOn()` (`compiler/lights.ts:414`) reads URL/env only, so engine and renderer can disagree. | `createAuraApp` resolves flags once and passes them to `Renderer.create` (per-renderer, not global) before mount; every engine-side `*On()` reads the app's resolved flags. Close #145 with this. | Unit: two apps with different flags on one page render with their own flags; engine/renderer flag snapshot identical in `diagnostics().flags`. |
| T0-29 | 14 + 15 | Games (flags=all): aura-clash `TypeError: Cannot read properties of undefined (reading 'mode')` at `aura-engine-*.js:79:253782`; other games desktop `no-draw-timeout` then renderer process death. | Build with sourcemaps (`capture-games.mjs --build-only` + `build.sourcemap:true`) and map the frame; re-run one game × one viewport per flag (§2.4 Games). | 9/9 games draw at 1280×720 with `all` in < 15 s. |
| T0-30 | 09 | C-24 beacon must write `state:playing` only after the first *presented* frame (#54); harness waits on it. | Implement + assert in `capture-games.mjs` readiness. | Readiness = `playing` only when drawCalls > 0. |
| T0-31 | 15 (coord) | Repo-wide `pnpm typecheck:raw` red on main, blocking every lane unit job that runs it (03, 04, 13): `tests/browser/production-runtime-production-scene-tools.ts:151`; `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:48` (`licenseName`, lane 05); `tests/unit/agent-api/prd02-lighting-legacy-golden.test.ts:10` (missing `createProductionRuntimeCollectedLights`, lane 02); `tests/unit/contracts/impl/prd12-{gate,variants}.test.ts` (lane 12); `tests/unit/engine/route-cue-maps.test.ts` (missing `apps/showcase-*/src/*-audio`, lane 14); `tests/unit/tools/*` (missing tools modules, lane 15); `tools/_quarantine/external-parity-benchmarks/index.ts:172`; `tools/threejs-parity-animation-*-parity/index.ts` TS1005. | Each owner fixes its file within 48 h; lane 15 deletes or excludes quarantined tools from the typecheck config. Lane typechecks stay repo-wide (do not scope away the gate). | `CI / Type Check` green on main. |
| T0-32 | 08 + 15 | QR-15 bf1789b0 re-pointed `@aura3d/engine` to `public/index.ts`, which no longer exports `createFrameLoop` / `resolveCameraFrame` → 52/55 lane-08 tests fail on main. | Lane-08 tests import from the lane entry (`@aura3d/engine/lanes` or the agent-api leaf), or lane 15 re-exports under the C-22 public surface. | `vitest run tests/qr/prd08` green in CI. |
| T0-33 | 10 | *(code-read, found by the lane-10 finish pass; detail in `prompts/finish/briefs/FINISH-LANE-10.prompt.md` FIX-P0-graph/-tier/-compile-cache)* `production-runtime/world/WorldFramePasses.ts:64-72` adds `terrainBackgroundPass` + `waterTransparentPass` on **every** Path S frame even with no world nodes; both write raw `'color'` and water reads `prd10.water.reflection`/scene copies with no producer → `RenderGraph.compilePlan` (`RenderGraph.ts:39-57`) throws each frame via `Renderer.ts:854/883` → `frameLoop.ts:133`, rAF never rescheduled. `(ctx.tier as {tier?}).tier ?? 'high'` (`WaterRuntime.ts:252,271,288`, `TerrainRuntime.ts:341`, `GrassRuntime.ts:262`) always resolves High; terrain program compiled on first flag-on frame and failures recompiled every frame (`TerrainRuntime.ts:307-320,441`). | Emit passes only when terrain/water exist; unique C-01 resource names chained onto lane-01 resources; reads only when producers exist; `tierForSettings()` everywhere; lazy compile + per-device failure cache + C-36 degradation. Lane 01: a contributor `passes()` throw becomes a C-36 degradation, never kills the frame loop (qr-request). | Unit: real frame graph with prd10 contributor compiles for no-world / terrain / terrain+water at low and high; bisect `none;world` 18/18 drawCalls > 0, no-world scenes pixel-identical to `none`; Round 3 `$ALL,-world` no longer names `world`. |
| T0-34 | 07 | *(code-read; detail in `prompts/finish/briefs/FINISH-LANE-07.prompt.md` Phase B)* `renderer/FrameGraph.ts:156,170-172` publishes the live forward depth attachment as `ctx.sceneDepth.texture`, sampled by `vfx/ParticleBatchPass.ts:231,256` while drawing into the same target (feedback loop, INVALID_OPERATION); `VolumetricFogPass.ts:225,253`, `vfx/contributors.ts:428`, `ParticleGpuSim.ts:268,360`, `SkyBackgroundPass.ts:82` end with `setRenderTarget(null)` (same pattern as T0-08); `TransientLightPool.ts:88-91` returns idle slots and `ProductionEffectSystem.ts:259` hard-codes tier `'high'` → 4 extra point lights per frame. | Copy or separately bind scene depth (lane 01 seam, qr-request for `FrameGraph.ts`); restore the previous target; collect only live transient lights; use the resolved tier. | Unit: target after vfx passes === before; no GL error in `diagnostics().errors` with `vfx`; bisect `none;vfx` on the 6 probes all draw; `14-particles` non-black with `core,vfx`. |
| T0-35 | 11 | *(code-read; detail in `prompts/finish/briefs/FINISH-LANE-11.prompt.md` T11-POOL/-TIMING/-COUNTERS/-RESET)* `rendering/src/lanes/prd11.ts:95-104` builds and registers a new `RenderTargetPool` on every factory call, called per acquire/resize/trim/dispose (`post/PostResources.ts:44-46`) → post targets leak (tab-OOM / `Target page closed` candidate); `RendererTiming.ts:288-344` issues timestamp queries without checking `QUERY_COUNTER_BITS_EXT` → `pendingScopes` grows every frame; `Counters.ts:128-153` calls `WebGL2Device.getDiagnostics()` every frame; `lanes/prd11.ts:126` resets lane-01 frame counters mid-frame. | Memoize the pool per device; check counter bits once, expire pending queries; incremental gauges; snapshot instead of reset. | Unit per defect; 600-frame run with `tiers`: GL object + heap counts flat, `pendingScopes` bounded, host drawCalls == flag-off; Round 3 `$ALL,-tiers` no longer names `tiers`. |

### 2.3 Harness / CI changes required for bisection (lane 12)

`capture.mjs` already supports `--scenes`, `--engines`, `--timeout`, `--flags` (`capture.mjs:10,48-51`; flags fall back to
`QRC_FLAGS`, `:393`). Only `ci.sh` and the pipelines do not forward them.

1. `.gitlab-ci.yml` `spec.inputs` (after `qr_flags`, `:23-26`):
   ```yaml
       bench_scenes:
         description: "Comma-separated benchmark scene ids (empty = all)"
         default: ""
         regex: ^[a-z0-9,-]*$
       bench_engines:
         description: "aura3d | three | aura3d,three"
         default: "aura3d,three"
         regex: ^(aura3d|three)(,(aura3d|three))?$
       bench_flag_sets:
         description: "';'-separated flag sets captured in ONE job (one build, one runner boot)"
         default: ""
         regex: ^[A-Za-z0-9_,.;=-]*$
   ```
   and `variables:` `QR_BENCH_SCENES: "$[[ inputs.bench_scenes ]]"`, `QR_BENCH_ENGINES: "$[[ inputs.bench_engines ]]"`,
   `QR_BENCH_FLAG_SETS: "$[[ inputs.bench_flag_sets ]]"`. Add a `flags-bisect` value to `suite` options (`:6`) that runs
   `qr:benchmark` only, engines `aura3d`, `--timeout 120000`, `--strict`.
2. `benchmarks/quality-rebuild/ci.sh` (last line): forward
   `${QR_BENCH_SCENES:+--scenes "$QR_BENCH_SCENES"} ${QR_BENCH_ENGINES:+--engines "$QR_BENCH_ENGINES"} --timeout 120000 --strict`;
   when `QR_BENCH_FLAG_SETS` is set, `IFS=';'` loop with `--flags "$set" --out "$QR_BENCH_OUT/${set//[^A-Za-z0-9_-]/_}"`,
   build once before the loop, and write `$QR_BENCH_OUT/bisect-summary.json` ({set, scene, status, drawCalls, errors[0],
   mountTiming}). Exit non-zero if `none` fails (control broken), otherwise always upload; the summary is the result.
3. `.github/workflows/qr-gitlab-ci.yml` `workflow_dispatch.inputs` (`:31-61`): add `bench_scenes`, `bench_engines`,
   `bench_flag_sets`, `suite` option `flags-bisect`; validate in the plan step (`:140-175`) with the same regexes; forward in the
   trigger body (`:192-196`) as `bench_scenes:$bs, bench_engines:$be, bench_flag_sets:$bf`.
4. Fail-fast (T0-10/T0-11) and `mountTiming` (T0-12) must be on the bisect branch first.

### 2.4 Bisection plan (exact commands)

Probe scenes (cheap, cover the code paths): `01-simple-geometry` (primitives, no HDRI → T0-01 alone), `16-instancing`
(instancing axis), `12-shadows` (shadows + lights → T0-08/T0-09), `03-damaged-helmet` (GLB + HDRI → T0-18/T0-19),
`08-skinned-character` (skinning), `14-particles` (vfx contributor).

```bash
PROBES=01-simple-geometry,16-instancing,12-shadows,03-damaged-helmet,08-skinned-character,14-particles
ALL=core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler
B=qr/prd12-flags-bisect   # branch carrying §2.3 + T0-10..T0-14

# Round 1 — single flags + control. Expect: none passes; core fails with INVALID_RENDER_TARGET_SAMPLE_COUNT on 6/6.
gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=flags-bisect -f mobile=false -f requester=prd12-bisect \
  -f qr_flags=none -f bench_engines=aura3d -f bench_scenes="$PROBES" \
  -f bench_flag_sets='none;core;lighting;post;materials;assets;animation;vfx;camera;game;world;tiers;looks;compiler'

# Round 2 — core sub-flag attribution (core,-core_output should pass T0-01 and expose T0-02..T0-06).
gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=flags-bisect -f mobile=false -f requester=prd12-bisect \
  -f qr_flags=none -f bench_engines=aura3d -f bench_scenes="$PROBES" \
  -f bench_flag_sets='core,-core_output;core,-core_generator;core,-core_output,-core_generator;core_output;core_generator'

# Round 3 — leave-one-out on the full 13 (after T0-01 lands). First failing set whose "-X" passes names X.
gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=flags-bisect -f mobile=false -f requester=prd12-bisect \
  -f qr_flags=none -f bench_engines=aura3d -f bench_scenes="$PROBES" \
  -f bench_flag_sets="$ALL;$ALL,-core;$ALL,-compiler;$ALL,-lighting;$ALL,-tiers;$ALL,-vfx;$ALL,-looks;$ALL,-post;$ALL,-materials;$ALL,-animation;$ALL,-world;$ALL,-assets;$ALL,-camera;$ALL,-game"
# then pairs: core,compiler ; compiler,lighting ; core,lighting ; core,post ; core,tiers ; core,vfx

# Round 4 — strict (after T0-13 in all three adapters).
gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=flags-bisect -f mobile=false -f requester=prd12-bisect \
  -f qr_flags=none -f bench_engines=aura3d -f bench_scenes="$PROBES" -f bench_flag_sets="$ALL,strict"

# Round 5 — all 18 base scenes + lane scenes, both engines, with $ALL (the IC gate run).
gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=benchmark -f mobile=false -f requester=prd12-ic \
  -f qr_flags="$ALL" -f bench_engines=aura3d,three

# Games (separate, costly): one viewport, two games, per flag.
for f in none core core,-core_output compiler lighting tiers vfx "$ALL"; do
  gh workflow run qr-gitlab-ci.yml --ref "$B" -f suite=games -f local_build=true -f mobile=false \
    -f viewports=1280x720 -f games=showcase-blockfall-reactor,aura-clash-showcase -f requester=prd12-bisect -f qr_flags="$f"
done
```

Negation `-name` is supported by `contracts/flags.ts:65-75` (first source wins: list positives first). Each round's
`bisect-summary.json` is attached to the Track 0 tracking issue; each culprit becomes a `qr-ic-regression` issue labelled
`to:prdNN` with the failing set, scene, first error and mountTiming.

### 2.5 Mandatory all-flags gate (every PR, every main push)

New workflow `.github/workflows/qr-required.yml` (no path filter; lane 12 authors, lane 15 makes it required):

- `paths` job (`dorny/paths-filter`, pinned SHA) decides which lane jobs must run; lane workflows become `workflow_call`.
- `allflags-smoke` job (always): GitLab bridge `suite=flags-bisect`, `bench_scenes=$PROBES`,
  `bench_flag_sets="none;$ALL;$ALL,strict"`, engines `aura3d`, `--strict`. Pass = all 6 probes × 3 sets `ready` with
  drawCalls > 0, non-blank PNG, `errors == []`, ready ≤ 30 s. While Track 0 is open, the `$ALL` and `$ALL,strict` arms are
  reported as **expected-red with an issue link** (not skipped); a PR that turns a previously green arm red fails.
- `qr-required` aggregator: `if: always()`; fails on any `failure|cancelled` in `needs.*.result`.
- Nightly on main: full 18 base + lane scenes, both engines, `none` and `$ALL`; games 9/9 at 1280×720 with `all`.

Required status checks on `main` (ruleset, §3.3):
`CI / Type Check`, `CI / Lint`, `CI / Build`, `Test & Coverage / Test (Node 22)`, `QR contracts / unit`,
`QR contracts / browser`, `QR-15 architecture gates / arch-gates`, `QR-15 pack-check`, `QR-15 bundle size`,
`qr-required / qr-required` (includes `allflags-smoke`, lane unit/browser/capture with `--strict`, ownership check,
checklist-lint). Informational (not required): `webgpu-smoke`, `public-demo-deploy` audits, `mirror-to-gitlab`, `quality-devices`.

**Track 0 exit:** Round 5 renders 18/18 base scenes with drawCalls > 0 and no blank frame in both `none` and `$ALL`, all lane
scenes ready, 9/9 games draw with `all`, `$ALL,strict` mounts every scene, and `allflags-smoke` is green on main twice in a row.

---

## 3. Track P — Process remediation (P0, parallel with Track 0)

Full inventory with fixes: `_sections/process-remediation.md`. Owner per row; lane 15 coordinates; lane 12 owns the
capture tools and checklist-lint. Reverting a mask will turn today's "green" jobs red — that is the intended result.

### 3.1 Masks to remove (CI)

| ID | file:line | Mask | Owner |
|---|---|---|---|
| P-01 | `benchmarks/quality-rebuild/capture.mjs:149-157, 462-464`; `tools/quality-rebuild-capture/capture-games.mjs:1057-1059`; `.gitlab-ci.yml:114` | exit 0 on zero draws / non-ready / blank; `--strict` never passed; build failure falls back to production | 12 (= T0-11) |
| P-02 | `.github/workflows/qr-contracts.yml:48` | `continue-on-error` on C-01..C-40 browser conformance | 15 |
| P-03 | `.github/workflows/prd07-vfx.yml:129,137,175,178` | capture + games `continue-on-error` (run 37561125962 "games: success" while browser/capture/typecheck failed) | 07 |
| P-04 | `.github/workflows/qr-prd10-world.yml:79-80,101,113` | browser `continue-on-error`; only 4 specs invoked; dispatch `\|\| echo`; `gh run list -L 1` race | 10 |
| P-05 | `.github/workflows/qr-prd14-games.yml:146,150,165-166` | art-direction audit outcome never tested; capture gate inert | 14 |
| P-06 | `.github/workflows/lighting-quality.yml:83,102` | lint `\|\| true`; browser `continue-on-error` on pull_request (hid 2/5 lane.spec failures, run 37774324490) | 02 |
| P-07 | `.github/workflows/qr-prd01-core.yml:67,83` | lint `\|\| true`; ownership awk exempts owner 15 | 01 |
| P-08 | `.github/workflows/post-quality.yml:76-84` | empty `post-*.spec.ts` glob → `exit 0` (main lane browser step is a permanent no-op) | 03 |
| P-09 | `.github/workflows/qr-prd11-perf.yml:181-184` | naga gate `exit 0` when zero twins emitted | 11 |
| P-10 | `.github/workflows/ci.yml:37,170,180`; `test.yml:47,54,200`; `quality-devices.yml:65`; `public-demo-deploy.yml:124,127`; `template-lookdev.yml:83` (outcome tested at `:107`, but the capture crash on main still shows as a passing step) | lint/bench/integration masks; `All Checks Passed` skipped counts as pass (use `if: always()` + `needs.*.result`) | 15 / 13 |

### 3.2 Tests that mask failures, loosened thresholds, gates narrowed to pass

| ID | file:line | Now | Restore to | Owner |
|---|---|---|---|---|
| P-20 | `tests/qr/prd04/browser/prd04-scene-capture.spec.ts:53` | `test.fail(true, …)` turns 38/38 timeouts into passes | hard fail; record timeout | 04 |
| P-21 | `tests/qr/prd06/games/{aura-clash-showcase:37,neon-swarm:36,skyline-runner:35,rooftop-buckets:36,gallery-shift:36,mech-hangar:33}.spec.ts` | bare `test.fail()` — any crash passes | assert the specific expected-red gate (e.g. `expect(tracksApplied).toBe(0)`), or `test.fixme` + issue | 06 |
| P-22 | prd11 `context-restore:65,80`, `vao-leak:57,64,83`, `fps-agreement:91,121`, `batching-pixel-identity:158`, `precompile-hitch:70,74,78`, `governor:66,68,95`, `no-readback:66,70,74`, `tier-switch-hitch:76,80`; prd10 `terrain-cracks:241`, `terrain-gpu-cpu:48`, `terrain-splat-bake:125`, `world-pass-depth:98`; `qr-prd03-phase6:103`; `qr-prd03-phase4:89-115` (`!untested` guards); `qr-prd03-wgsl-compile:68`; `prd04 wgsl-twins:39`; `gpu-particle-a4:312`; `prd04 integrated-acceptance:57`, `scene-perf:67`; `prd06 aura-clash-tracks-applied:168`; `prd09 capture-divergence:114`; `gravity-post-playable:589`; `webgpu-hardware-matrix:7`, `webgpu-visual-parity:8`; 22 prd14 `existsSync(v2/boot.ts)` guards | self-skip on CI | shared `requireOrSkip()` (fail when `process.env.CI`); `forbidOnly: !!process.env.CI` + no-skipped-in-CI reporter in every `tests/qr/*/playwright*.config.ts` | each lane |
| P-23 | `tools/bundle-size/index.ts:67,110,123,134` + `BUNDLE_SIZES.md:10,15-17` | engine "." 920,000 B gz; product-viewer 780,000; cinematic 790,000; mini-game 850,000 (raised 250077b5, 80a903d5) | PRD-15 §17: lit-scene initial ≤ 190 KB; product-viewer ≤ 250,000; cinematic ≤ 400,000; mini-game ≤ 480 KB | 15 |
| P-24 | `tests/qr/prd13/bundle-delta.test.ts:83` | `12 * 1024`, carve-outs excluded | `9 * 1024`, carve-outs counted | 13 |
| P-25 | `tests/browser/layout.spec.ts:29` | HUD cap 0.22 desktop (courier, aura-clash) | ≤ 0.15 desktop; add canvas ≥ 95 %, mobile, banned tokens | 09 |
| P-26 | `tests/browser/qr-prd03-phase4.spec.ts:91`; `qr-prd03-phase6.spec.ts:~98-99` | TAA `ghostPixels <= 64`; SMAA `> none × 1.5` | ghost width ≤ 2 px; SMAA ≤ FXAA and within 10 % of three SMAAPass | 03 |
| P-27 | `tests/qr/prd06/browser/deform-light-view.spec.ts:83,86,117,118` (63a0c3f5) | `iouTolerant` radius 2 | strict IoU ≥ 0.98 (tolerant kept as diagnostic) | 06 |
| P-28 | `tests/qr/prd06/browser/character-hero.spec.ts:281` (8603131d, 2 min before #346 merge, after measuring 5.5°/7.2°) | spring gate on last 3 frames | < 1° from 0.6 s after deceleration onwards | 06 |
| P-29 | `tests/qr/prd06/browser/{gallery-shift-thief-gait:110,153,199 (780 s), clip-samples-binding:31,36,46,51 (300 s), aura-clash-tracks-applied:104 (660 s)}`; `tests/qr/prd04/browser/transmission-capture.spec.ts:39` (300 s); #357 repo-wide spec timeouts 90 → 240 s | timeouts inflated to hide hangs | ≤ 180 s / 30 s / 120 s / 90 s; > limit is a perf failure | 06, 04, 15 |
| P-30 | `tools/perf-gate/budgets.json:50,62` | `S3-p50-ratio`, `S3-draw-calls` `gating:false` | `gating:true` | 11 |
| P-31 | `tests/qr/prd11/unit/quality.test.ts` (oscillation) | down + up step exist | ≤ 2 direction changes over 300/600-frame sequences | 11 |
| P-32 | `tests/unit/quality-gate/injected-regressions.test.ts:37` | returns early "pending" → green with 0 assertions | fail when gate output missing | 12 |
| P-33 | `packages/rendering/src/vfx/LowResParticles.ts:24-30` | particle GPU budget 8/6/4/3 ms | PRD-07 §18: ≤ 0.8/1.2/2.0/3.0 ms | 07 |
| P-34 | `tests/qr/prd07 soft-depth.spec` alpha (0.27, 0.30); `sky-background.spec` lacks sun-disc > 10 rgba16f | widened | 0.2857 ± 1/255; add sun-disc assertion | 07 |
| P-35 | `tests/qr/prd04/browser/texture-budget.spec.ts` | forced 0.8× budget control | PRD control: budget disabled exceeds 256 MiB | 04 |
| P-36 | 1065a98e: fighting-game template lowers resolutionScale/particleScale/LOD/shadowSize (0.5/0.5/2/512) when `navigator.webdriver` | captures judge a degraded build | revert; capture-quality must equal shipped quality | 13 |
| P-37 | #357 b82d51b01/e64185e23: look-floor `subjectBounds` "recalibrated to measured values" for ~12 templates; arena-shooter specular assert made conditional | tests rewritten to output | restore pre-#357 expectations; recalibration only with art-director sign-off | 15 → 13 |
| P-38 | `.gitignore:325 'fixtures/'` hides `tools/camera-cast-codemod/fixtures/style-{a,b}.ts`; `.gitignore:273 '*.wasm'` hides decoders | required test inputs uncommitted | negation rules + commit | 08, 05 |

### 3.3 Branch protection, required checks, merge rules (owner action — repo admin)

Current: `GET /repos/auraoneai/aura3d/branches/main` → `protected:false`, `required_status_checks:[]`; rulesets `[]`; all
merge methods enabled. Agents must not change repo settings; Gurbaksh (or the repo admin) applies:

1. Ruleset on `main`: require PR; block force-push and deletion; require branches up to date; **no bypass** for the admin
   role agents use; one merge method (squash) to keep first-parent history auditable.
2. Required checks: the §2.5 list. Path-filtered lane workflows are not required directly; `qr-required` aggregates them.
3. Merge rules (binding on every lane from today):
   - No merge with any red or cancelled required check. "Pre-existing failure on main" is not an exemption — fix main first
     (T0-31) or get the failing check owner to fix it.
   - No direct pushes to `main`. No local merges of stack branches into main. Stacked PRs merge bottom-up **into main**, each
     with a green lane run on its own head.
   - No PR merges while its lane workflow run is queued/in progress (#346, #364 did).
   - A lane PR may not edit another lane's owned files except through an accepted CCR/qr-request recorded in the PR body.
4. Ownership checker: `tools/qr-ownership/check.mjs:24` regex omits `tests/qr/prdNN/` and ignores `lanePatterns`
   (`QR_OWNERSHIP.json:415-430`) → every `tests/qr/prdNN/**` file resolves to owner 15; move the check into `qr-required`
   for every lane PR (today only `qr-prd01-core.yml` runs it).
5. Checklist-lint (lane 12): every `- [x]` in PRD-01..16 must carry `run:<id>` or `capture:<id>`; the job resolves each id via
   `gh api …/actions/runs/<id>` (or the GitLab pipeline API) and requires `conclusion == success` on main.

### 3.4 Records to correct

| ID | Where | Action |
|---|---|---|
| P-50 | `CONTRACTS.md:2790,2794-2798` F-07-01, -05..-09 `verified` citing failed run 37561125962; `:2791-2793` F-07-02..04 cite a PR-branch run | → `proposed` until a green main run |
| P-51 | `CONTRACTS.md:2801-2806` F-02-01..06 (local vitest timestamps); `:2808-2813` F-06-01..06; `:2814` F-01-02 (unit only; S6 needs browser MAD) | → `proposed` or cite CI run ids |
| P-52 | `CONTRACTS.md:2868-2872` F-08-2/F-08-5 cite non-existent `feel-bus.test.ts`, `feel-screenspace.test.ts`; `:2874-2879` duplicate F-08 rows; `:2880` blank line breaks the table (F-05-07..11 render outside it); `:2832-2836` F-03-06..10 status `landed` (not a schema status) | fix; PRD 13 must not write skill text from these rows until fixed |
| P-53 | `PRD-09-…md:1741, 1774` diff3 markers `\|\|\|\|\|\|\| 5f5d6088` duplicate Phase 2/3 checklist blocks | delete markers + stale base rows (`:1741-~1773`); diff vs #158/#240 |
| P-54 | Unbacked ticks: PRD-03 (d4f65a88 bulk-ticked 21 Phase 4-7 rows), PRD-05 `:1348` Day-0 issues + Phase 1 wasm/vendoring/build-copy + Phase 1/3 browser exits + Phase 2 dry-run path, PRD-06 (69/70), PRD-07 (P1-T9/T10/T19, P2-T8, P3-T1/T3/T4, P4-T7, P5-T1/T6, P6-T3, P7-T4), PRD-08 (I-7, C-14, P-6 cite missing files; Phase 5 ticked with S9 skeletons), PRD-09 (`:1701` postPass, `:1802` ≤ 10 % LOC), PRD-12 (T1.16, T1.17, T3.2, T3.3, T3.6, T5.6, T5.7 via #355), PRD-02 (1912, 1926-1953 "spec pending") | untick until the named test is green on remote CI |
| P-55 | Under-reported checklists: PRD-01 0/73, 04 0/47, 10 5/56, 11 0/82, 13 4/61, 14 0/91, 15 32/81 | tick only with run ids (after checklist-lint exists) |
| P-56 | Placeholder evidence cited as evidence: `evidence/prd01/IC-0/README.md:16` "TBD"; `evidence/prd-04/probes/s{3,6,7,9}-*-control.json` stubs; `evidence/prd05/assets/codemod-report.json` (invalid JSON, 9/27 files), `tier-measurements.json` (flag-off, stub controller, no devices); `evidence/prd12/phase-5-devices.md` T5.6 "DENIED" with no AWS call, proposes stored AWS keys (violates PRD-12 §15.3 OIDC-only); `evidence/prd15/baselines/phase0.json` ΔE NOT-RUN | mark `placeholder`, never cite |
| P-57 | Evidence at wrong paths: root `evidence/prd13/` (→ `docs/project/aura3d-quality-rebuild/evidence/prd-13/`), root `evidence/prd05/assets/optimize-dry-run.json`, `evidence/prd02/baseline/` (→ `lighting-baseline/`, `lighting-quality.yml:~134`) | move |
| P-58 | Premature promotion asks: QR-03-22 (A3D_QR_POST standalone-accepted), #313 (VFX) | withdraw until S-rows have run ids |

### 3.5 Retro-review and ownership

| ID | Item | Action |
|---|---|---|
| P-60 | Direct pushes 2ed5c16e (2,670 files, +176,592/−11,858), 1f579954 (444 files), 822c19fc (also edits lane-15 `compiler/errors.ts`, CONTRACTS), fd2e8060, 9ff024f1 | open `audit/retro-2ed5c16e` and `audit/retro-1f579954` (base = `^1`), run the full lane matrix; re-file 822c19fc's lane-15 edits as qr-requests |
| P-61 | Cross-lane edits without recorded sign-off: #350 (09 → 13 templates, root package.json, finalize-dist), #359/#361/#363/#364 (03 → 07 effects.ts/BloomPass, 01 Renderer.ts, 12 common.ts, 11 WebGPUPostShaders.ts), #360/#365/#366/#347 (05 → 01 lod-dither.glsl.ts, contracts/renderItem.ts; 04 GLTFRenderResources.ts; 15 aura.library.json), #346 (06 → 14 AuraClashArenaApp.ts, 05 gltf-runtime.ts, 01/02/03/11/12), #357 (15 → 151 lane-13 skill files), #163/#246/#292/#312 (07 → other lanes' workflows, GameRuntime.ts), #167 (02 → 04 Sampler.ts), #173/#269-#305/#277 (13 → 08 camera.ts, 15 agent-api/index.ts, createAuraApp.ts, other lanes' workflows) | owning lane reviews and records acceptance in the PR thread, or reverts; register files whose owner is wrong in `QR_OWNERSHIP.json` (e.g. `aura.library.json` → 05, `engine/assets/world/**` → 10, `camera-fade.glsl.ts`) |
| P-62 | PRD-15 §11 violated: 4.0 removals (#357: `packages/lean`, 22 subpaths, 85 "." names) on main before 3.1.0 was ever published (root `package.json` 3.0.1) | publish 3.1.0 with deprecations from a pre-#357 tag, or document a signed waiver; no 4.0.0 publish until 4 weeks after 3.1.0 |
| P-63 | §16.3 lean fixtures "closed by deletion" in T8.1 | restore fixture capture as a removal-proof run against the pre-removal commit, or record a signed scope cut |
| P-64 | ≈150 outbound requests/CCRs exist only in markdown ledgers (`qr-requests/qr-prd01-requests.md`, `evidence/prd02/qr-requests.md`, `evidence/prd03/phase*/qr-requests.md`, `evidence/prd05/q-issues.md` "prepared but NOT filed", `evidence/prd06/qr-requests-q14.md`, PRD-04 §12.3, code comments in `rendering/src/lanes/prd04.ts:55`, `engine/src/lanes/prd04.ts:31`) | each lane runs `gh issue create --label qr-request --label to:prdNN` per row and writes the number back into its ledger within 48 h (gh is authenticated through the existing provider store; do not log in) |

---

## 4. Lane tracks 01-15

### 4.0 Rules common to every lane

- **Flag promotion** (CONTRACTS §5.3; state changed only by lane 15 at a checkpoint, `flags.state.ts`):
  - `dev → standalone-accepted`: Track 0 exit met; every S-row of the lane green in **one** run of the lane workflow on main
    (macos-14 or GitLab macOS, `--strict`, no masks from §3), sentinel identity (`qr_flags=none`, ΔE2000 p99 ≤ IC-0 noise on
    `benchmarks/quality-rebuild/sentinels.json`) recorded, every lane-owned C-40 fact row `verified` with a run id, checklist
    ticks backed (checklist-lint green), outbound requests filed.
  - `standalone-accepted → integrated-accepted`: the lane's integrated criteria (§8 of its PRD) pass at a G-PANEL round
    (IC-4 2026-11-05, IC-8 2026-12-03, IC-12 2026-12-31, IC-16 2027-01-28) with `qr_flags=all` and leave-one-out `all,-<lane>`.
  - `integrated-accepted → default-on`: two consecutive checkpoints with no attributed `qr-ic-regression`.
  - `default-on → removed`: two more checkpoints, then one removal PR (legacy deleted, rg check empty, `REMOVED_QR_FLAGS` updated).
- **Lane workflow fixes required in every lane**: add `push: branches: [main]` and `schedule` triggers; widen `paths` to the
  lane's owned source (several exclude it); run on macos-14 GPU (PRD-08 runs ubuntu only); upload artifacts on `always()`;
  commit evidence under `docs/project/aura3d-quality-rebuild/evidence/prdNN/<run-id>/`.
- Every task below is "done" only with a cited passing remote run id. "Depends" lists the blocking lane/issue.

### 4.1 Lane 01 — Rendering core, scene graph, colour, HDR, PBR (A3D_QR_CORE) · 38 %

PR content: all 8 stacked phase PRs on main (ancestors). CI: `qr-prd01-core.yml` unit gate red on main
(`tests/qr/prd01/unit/generator-integration.test.ts:70,93` expect `burley` + clearcoat; lane-04 `PBRMaterial.ts:379` →
`materials/PhysicalFeatures.ts:91-133` returns `lambert`, extensions only from registered lobes); last browser run
37559564963: 15 failures. 0/73 ticks. Track 0 items owned: T0-01..T0-07 (with 04 on T0-05).

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 01-GENTEST | Resolve C-02/C-03 conflict with lane 04: test registers prd04 lobes, asserts Lambert default (PRD §8.3; Burley behind `DIFFUSE_BURLEY`); `physicalFeatureSet` keeps instancing/skinning/vertexColors | qr-prd01-core unit job green on main | P0 | 04 |
| 01-HANG | `laneHarness.spec.ts` aura3d scenes never emit `__QR_READY__` even with `none` (scene-graph-hierarchy, tonemap-exposure-ramp, blend-modes, primitive-catalog, draw-throughput); fix `benchmarks/quality-rebuild/aura3d/scenes/prd01/*.ts`, `tests/qr/prd01/harness/main.ts`; `app.capture` "extension did not resolve" (`engine/src/lanes/prd01.ts` C-38 output extension) | laneHarness + app-capture specs green macos-14 | P0 | — |
| 01-RTARRAY | `render-targets.spec.ts` "array: framebuffer status invalid": per-layer `framebufferTextureLayer` in `WebGL2Device.createFeatureRenderTarget` (~`:930-1010`) | spec green | P1 | — |
| 01-MOUNTERR | `renderer-mount-failure.spec.ts:38` errorsCount 0: record `{code:'renderer-mount-failed'}` in `diagnostics().errors` (`engine/src/lanes/prd01/outputSurface.ts` only forwards) | spec green (S14) | P1 | 15 Q-15-9 |
| 01-DFG | `u_dfgLut` declared (`program/chunks/brdf.glsl.ts:51-52`) never bound; upload r185 DFGLUTData 16×16 RG16F once per device, bind in `MaterialBinding.bindGenerated` | brdf-reference (d) byte-identity vs `three/src/renderers/shaders/DFGLUTData.js` | P1 | — |
| 01-CI | `qr-prd01-core.yml:8-31`: add `packages/rendering/src/**`, `engine/src/agent-api/sceneGraph.ts`, `color.ts`, push:main; add `perf` (§16.3) and `capture` assertions (§16.2); fix P-07 | PR touching `ForwardPass.ts` triggers it; main push runs it | P1 | — |
| 01-IC0 | Commit IC-0: `tests/qr/prd01/capture.mjs --flags none,core`, 6 prd01 + 18 base, both engines → `evidence/prd01/IC-0/`, replace TBD (`README.md:16`) | ≥ 48 images + metrics + run id | P1 | T0 exit |
| 01-S2 | `engine/src/agent-api/compiler/sceneGraph.ts` (missing): C-06 `composeWorldMatrix` under `A3D_QR_CORE=v2`, TRS decompose, lookAt after composition, S(size⊙fit) innermost, dirty-cache counter; tests compiler-scene-graph (flag-off byte-equal on 18 snapshots, 50 random TRS), lookAt, 1000-node cache | IoU ≥ 0.98, centroid ≤ 2 px vs three on prd01-scene-graph-hierarchy | P1 | 15 Q-15-7 |
| 01-T1.5 | rotationOrder/quaternion in compiler/sceneGraph.ts; remove from `diagnosticOnly.prd01.ts`; facts F-01-rotationOrder, F-01-groups | option rows change RenderSource | P2 | 15 Q-15-6/7 |
| 01-S3 | `tests/qr/prd01/browser/primitive-catalog.spec.ts`: IoU ≥ 0.98, cap IoU ≥ 0.97, cap luma ±10 %, cap normal ≤ 10°, sphere radial ≤ 0.5 px; 685 boxes → 1 upload; F-01-tessellation/capsule | green + metrics in `evidence/prd01/phase-1/` | P1 | — |
| 01-S4 | `tests/unit/contracts/impl/prd01-geometry.test.ts` (missing), 3×3 world·instance·geometry grid, 45° non-uniform; browser instance-grid coverage ±5 % of three | green | P1 | 15 Q-15-2 |
| 01-S1 | `tests/unit/contracts/impl/prd01-frame-graph.test.ts` (forwardTarget on blackboard, sceneDepth, flags-off 0 calls, `FRAME_PHASE_SPACE_MISMATCH`, transparent interleave) + browser `frame-graph.spec.ts` | green | P1 | — |
| 01-S5 | `engine/src/agent-api/compiler/color.ts` (missing): 6 helpers in `agent-api/colorUtils.ts` delegate to `parseAuraColor` under flag, warn `COLOR_PARSE_FAILED`; verify 40-row table in prd01-color.test.ts | unit green | P2 | 15 Q-15-7 |
| 01-S6 | `tests/qr/prd01/browser/blend-modes.spec.ts` MAD ≤ 2/255 vs three (4 modes × HDR gradient); C-04 browser conformance 4×3; sort-order unit; F-01-02 back to proposed (P-51) | green + run id on F-01-02 | P1 | — |
| 01-S11 | app-capture (preserveDrawingBuffer true/false, MAD ≤ 1/255); `dpr.spec.ts` DSF 1/2/3; migrate lane-01 class-(b) rows in `readback-triage.json` | green; triage marked | P1 | T0-04 |
| 01-S7 | Generator-only keys on 18 base scenes with `core`; create `tools/shader-lint/index.ts` (§15 forbidden patterns, one fixture each) in `pnpm test:unit`; 5,000-record key uniqueness; KHR_parallel pending→ready browser test | report shows only generator keys | P1 | T0-02, T0-05 |
| 01-S8 | `tests/qr/prd01/unit/brdf-reference.test.ts` (a)-(d) vs CPU port of r185 BRDF_GGX_Multiscatter + RE_IndirectSpecular_Physical; HDR readback white Lambert under ambient 1 = 1/π ± 1 % | green | P1 | 01-DFG |
| 01-S9 | 60-frame dolly on prd01-specular-aa (core/none/three), `tests/qr/prd01/metrics/temporalSigma.ts`: σ ≤ 1.2× three, ≤ 0.5× flag-off | report + run id | P1 | — |
| 01-S12 | `evidence/prd01/phase-3/declared-changes.md` (fudge removal, ambient 1/π, tessellation) + core-vs-none G-REG on 18 base | no undeclared regression | P1 | T0 exit |
| 01-T3 | Unit: depth program w/ deform chunk; exactly one env sampler; empty-registry clearcoat → one `extension-lobe-pending`; flag-off sentinels for accepted legacy patches (02 Q-01-1..4, 04 Q-01-1..4, 07 R-01-2) | green | P2 | — |
| 01-S10 | `tests/qr/prd01/browser/output-pass.spec.ts`: aces/agx/neutral × exposure 0.5/1/2 ΔE2000 ≤ 2 (mean ≤ 1); dither; `#336699` coverage 1-3; overlay zero bit-identity; emissive 4.0 ±1; exposure doubling; C-05 impl conformance (missing); delete `sceneExposurePresets`/`defaultExposure` lies under flag; F-01-output/exposure/capture | green + ΔE table | P1 | 03 Q-03-1 |
| 01-T5 | Tonemap A/B capture (aces vs agx) all prd01 + base; `decisions/tonemap-default.md` stays pending until G-PANEL | captures committed | P2 | 12 G-PANEL |
| 01-S13 | perf job: prd01-draw-throughput 600 frames, 0 pipeline constructions after frame 2, create deltas 0, heap ≤ 16 KB/frame, CPU submit ≤ 40 % flag-off; 10k instances 1 draw; VAO eviction 1000 buffers; 576-box consolidateStatic; 60 s orbit 0 compiles; `instancing-buffers.spec.ts` | perf job green + counters report | P1 | 11 Q-11-3 |
| 01-ISSUES | #36 drop `TerrainTile*` exports (`index.ts:727`) + export `toHeightTexture`; #94 `invalidateGpuObjects()`; #90 `scope('shadow'\|'forward')` in Renderer; #113 GLSL `instancing.emissive`; #179 export `batching/`; #180 real `WEBGL_multi_draw` (`webgl2/MultiDraw.ts` identity loop); #181 DrawSubmit/BVH consume BatchPlan; #245 float readback on RenderDevice (blocks 07); #198 `allShaderChunks()` (with 15); #148 C-01 `canvas?` CCR; #127 provide renderScaleSourceSlot once CCR lands; #112 WGSL via WgslAssembler (P2, conditional); close #232 (done, verify vs §8), #206 (declined §3.7) | each closed with a test | P1 | 11, 07 |
| 01-REQ | File Q-03-1/2/3, Q-04-1/2, Q-07-1, Q-09-1, Q-10-1, Q-11-1..4, Q-12-1/2, Q-13-1/2, Q-14-1, Q-15-1..10 (critical path: Q-15-2, Q-15-7, Q-15-9, Q-03-1..3, Q-11-3, Q-11-4, Q-12-1, Q-14-1) | every ledger row has an issue # | P0 | P-64 |
| 01-PROMO | Tick §15 with run ids; F-01-* verified; custodian moves A3D_QR_CORE (`flags.state.ts:11`) | `standalone-accepted` | P2 | 15 |
| 01-I | G-PANEL I1-I10 with `all` and `all,-core`; tonemap decision; Phase 7 removal (frozen legacy programs, `u_outputColorSpace`) | integrated-accepted → removed | P2 | 12, 02, 03, 04, 14, 15 |

### 4.2 Lane 02 — Lighting, IBL, reflections, shadows (A3D_QR_LIGHTING) · 40 %

PR content: #167 CLOSED but on main (local merge 9a774061). CI: `lighting-quality.yml` — browser `lane.spec.ts:9,27`
`Cannot find module …/@aura3d/rendering/dist/contracts/flags.state.js` (browser job never builds rendering), hidden by
`continue-on-error`; unit job runs only 2 files (`tests/qr/prd02/vitest.config.ts`); no main/schedule trigger; only green
capture artifact is 1.5 KB. Track 0 items owned: T0-08, T0-09, T0-24..T0-27.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 02-CI | Build `@aura3d/rendering` before playwright (or alias contracts to src in `tests/qr/prd02/playwright.prd02.config.ts`); remove P-06 masks; schedule + push:main; widen vitest include to `tests/unit/contracts/impl/prd02-*`, `tests/unit/agent-api/prd02-*` (~25 files) | unit (~200 tests) + browser + capture all success, no masks | P0 | — |
| 02-BASE | Fix baseline commit path (`lighting-quality.yml:~134` → `evidence/prd02/lighting-baseline/`); dispatch `flags=none update_baseline=true`; verify prd02-15 shadow drop ≈ 9 % Aura vs ≈ 50 % three | README with run id | P0 | 02-CI |
| 02-S2S3 | Flag-on production captures prd02-no-lights, -15, -11, -13 vs three: S2 luma ±25 %, unrequested shadow ≤ 0.1 %; S3 drop 40-60 % | report + run id | P0 | T0-08, T0-09, T0-24, T0-26 |
| 02-S14 | `tests/qr/prd02/browser/chunks.spec.ts`: compile 6 chunks at MAX_FRAGMENT_UNIFORM_VECTORS 224 / 16 units; Lambert under ambient 1 = albedo/π ± 1e-4; 32 lights evaluated; C-12 drop order | green (item 1911) | P1 | T0-02 |
| 02-S1 | Legacy golden over 18 base snapshots (now 1, `prd02-lighting-legacy-golden.test.ts`); device-mock uniform uploads byte-identical (1932) | green | P1 | — |
| 02-T1923 | `receive-shadow.spec.ts`: receiveShadow:false luma drop < 2 %, control > 20 % | green | P1 | 15 Q-15-5 / 04 Q-04-2 |
| 02-S10 | Make `ibl-roughness.spec.ts` a pixel test on prd02-06: HF energy ratio ≥ 4×, monotone, flag-off control fails | green | P1 | — |
| 02-S7 | `pmrem.spec.ts`: per-mip mean ±5 %, top/bottom ≥ 1.5; mirror-sphere parity vs three PMREM at r ∈ {0,.25,.5,.75,1} ±10 % | green | P1 | — |
| 02-S8 | `background.spec.ts`: prd02-13 sky-band std ≥ 0.7× three; `background('#123')` + preset keeps colour; `background:false` control | green | P1 | T0-24 |
| 02-S9 | `softbox.spec.ts` highlight aspect within 20 % | green | P1 | — |
| 02-T1936 | ChunkHarness prd02-13 SH: top B/R ≥ 1.05, bottom ≤ top | green | P2 | — |
| 02-S13 | Stall checks prd02-15 + HDRI swap: readPixels Δ 0 after frame 2, compiles Δ 0 frames 2-120, no lighting long task > 50 ms | green | P1 | T0-25 |
| 02-S4 | `casters.spec.ts`: skinned Soldier IoU ≥ 0.75, 9/9 static batch, 16/16 instance, alpha card ±10 % | green | P1 | T0-26 |
| 02-S5 | `shadow-stability.spec.ts` prd02-17: 0.01 m dolly ≤ 1.5/255 edge diff; off-screen pole casts | green | P1 | — |
| 02-S6 | `atlas.spec.ts`: readPixels Δ 0 over 60 frames; tile depth ≤ 1e-3; seam ≤ 1 px | green | P1 | — |
| 02-T1945 | Filter kernel: hard = 2-texel bilinear; Medium penumbra ≥ three PCF | green | P2 | — |
| 02-T1946 | depthOnly shadow targets (`ShadowPass.ts:165-171`, `ShadowSystem.ts:206-226`) | C-31 memory drop asserted | P2 | 01 Q-01-5 |
| 02-S11 | `contact.spec.ts` prd02-contact-cube: ≥ 30 % darkening within 3 cm on, < 5 % off, < 1 % lit face | green | P1 | — |
| 02-S12 | `probes.spec.ts`: box-projected stripe ≤ 2 px vs three CubeCamera+PMREM; red-wall bounce hue ≤ 15° | green | P2 | — |
| 02-DEPTH | DepthPass composes other lanes' registered depth features (`Prd02DepthShaderLibrary.ts:99-161` uses only prd02Features): registry enumeration accessor → `ShadowSystem.depthFeatures` (#252, #115) | prd10.wind feature in variant key | P1 | 01 registry accessor |
| 02-ISSUES | #253 sky-only/spaceBake + `iblPixelBacked`; #96 `POINT_SHADOW_PENDING` instead of `readShadowFacePixels`; #114 optional; #254/#314 delete `createProceduralSkyDome` at removal only | closed | P2 | — |
| 02-S16/S17 | Cite IC-0 sentinel run in `evidence/prd02`; §17 toggle-delta timing + `tests/qr/prd02/performance/lighting-tiers.spec.ts` → `evidence/prd02/lighting-perf/<device>.json`; §21.2 Firefox/WebKit/Windows subsets | run ids | P2 | 11 timer query |
| 02-REC | F-02-01..06 CI run ids (P-51); untick 1912, 1926-1953 (P-54); file md-only requests (SH9 len³, C-11 provider slot, registry enumeration, 2d-array texImage3D, CCR-02-2, light.power, probes export, C-12 spec/slot, `./environment` subpath, codemod dispatch, RGB9_E5 Q-06-1, ivec uniforms, pbr-direct.frag test) | issues exist; checklist matches | P1 | P-64 |
| 02-PROMO | standalone-accepted (`flags.state.ts:12`); IC-k files `evidence/prd02/checkpoints/IC-<k>.md`; G-PANEL §21.6-9; delete `pbr-direct.frag.glsl` (T1964, needs 15) | promoted | P2 | 12, 15 |

### 4.3 Lane 03 — Postprocessing, AA, tone mapping, cinematic (A3D_QR_POST) · 50 %

PR content: #133/#174/#356 CLOSED, direct-pushed (§1.3). CI: `post-quality.yml` 3 successes ever (10-06); unit dies at
repo-wide typecheck (T0-31); main browser step is an empty glob (P-08); `qr-prd03-phase6.spec.ts:55` `run is not a function`;
`qr-prd03-captures.yml` 0 runs ever; `check:bundle-size` still lacks `@aura3d/rendering/contracts` alias (QR-03-3).
Track 0 items owned: T0-15, T0-16, T0-17 (T0-07 with 01).

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 03-ATTR | Re-run GitLab bench with `post`, `all,-post`, `none` on 01/10/11/12/14/16 + 02/03/13; collect `diagnostics().post`; confirm `POST_FIELD_UNSUPPORTED` (`compiler/postprocess.ts:245-250`, `postBridge.ts:484-500,532-559`) rejects no bench scene | per-scene table; regressions filed or fixed | P0 | T0 harness |
| 03-CI1 | Replace glob with explicit `tests/browser/qr-prd03-*.spec.ts` (fxaa, post-banding, post-lut, v2-tone, post-no-readback, phase4, capture-dsf2, wgsl, phase6); empty glob fails | each spec result in a run | P0 | — |
| 03-CI2 | Unit job reaches vitest (T0-31); restrict paths so other lanes' `packages/rendering/**` edits don't trigger the ownership audit (`:55`) | `vitest run tests/unit/contracts/impl` green on main | P0 | 15 |
| 03-S18 | Phase 6 works: (a) `effects.antiAlias({mode:'smaa'})` → `pipeline.antiAliasing` (`compiler/postprocess.ts:99-120,202-206,268`; `post/PostAntiAlias.ts`), wait for lazy textures (`v2Stages.ts:371-402`); (b) auto-exposure reaches `pipeline.autoExposure` (`postBridge.ts`), S8 meter (`v2Stages.ts:~820`) adapts; (c) `addPostPass` reaches `mergedCustomPasses`, drop `POST_GRAPH_V2_PENDING` stub (`PostGraph.ts:366-373,382-383`); (d) harness global race | phase6 spec at PRD thresholds (SMAA ≤ FXAA & within 10 % of three; settle ≤ 1.5 s, 0 readbacks; 5 insertion points ordered; display-before-tonemap rejected `POSTPROCESS_SPACE_INVALID`) | P0 | — |
| 03-P0 | Dispatch `qr-prd03-captures.yml` (`qr_flags=none`, 18 games, 1920×1080/1280×720/mobile, `run_dsf2=true`) after verifying the GitLab bridge; commit `evidence/prd03/phase0/` + measured `bundle.json` | run id + 18×3 + 7 lane scenes | P1 | 12 QR-03-2/15 router, Q-12-1 DSF2 |
| 03-S1..S5,S16 | Record CI runs for C-13/C-14 conformance + sentinel; prd03-post-{bridge,diagnostics,graph-order,exposure-aa,quality-tiers,presets}, v2-codemod; `qr-prd03-v2-tone.spec.ts` single tonemap | run ids per row | P1 | 03-CI2 |
| 03-S6 | ACES tone ramp mean ΔE2000 ≤ 1.0 vs three r185 | artifact | P1 | — |
| 03-S7 | FXAA crawl ≤ three FXAAPass × 1.2 at DSF 1/2 | spec in CI | P1 | 03-CI1 |
| 03-S8 | Banding: equal-run ≤ 1.5× ideal, Sobel contour < 0.5 % | spec in CI | P1 | 03-CI1 |
| 03-S9 | Write `qr-prd03-bloom-energy.spec.ts`: halo ∝ excess ±10 %, ≤ 0.5 % below knee; freeze `mapThreeUnrealBloom` in `phase2/bloom-mapping-calibration.md`; held-out scene 18 ±15 %; Courier van ≤ 2 % pixels at 255 | green | P1 | — |
| 03-S10 | Display LUT ≤ 1 LSB (`qr-prd03-post-lut.spec.ts`) | spec in CI | P1 | — |
| 03-S11 | `qr-prd03-post-no-readback.spec.ts` over 18 game routes, 300 frames, C-28 counters + `readPixels` spy | 18/18 rows readbacks 0 | P1 | — |
| 03-S12 | Deep Recovery median ≤ 50 ms with god rays at 1280×720; 25b shaft ≥ 3 %, occluded ≤ 0.5 % | artifact | P1 | T0-15 |
| 03-S13 | GTAO probe on prd03-ao-grounding: ≥ 15 % darker within 10 cm, open floor ≤ 2 % | green | P1 | T0-15 |
| 03-S14 | TAA thresholds, no vacuous passes (P-26, P-22): static std ≤ 0.01, pan ghost ≤ 2 px, cut ≤ 2 LSB, TAAU ≤ 1.3×, msaa fallback `TAA_VELOCITY_COVERAGE` | green, 0 untested | P1 | 08 QR-03-13 (C-22 pan) |
| 03-S15 | MB 30 vs 60 fps within 10 %; DOF bokeh 12.3 px ± 15 % | metrics committed | P1 | — |
| 03-S17 | 18 unmodified routes with `post` at DSF1/2/mobile vs flags-none: no black/crash/console error, DSF1 median ≤ +10 % | 18/18 in `evidence/prd03/phase5` | P0 | T0 exit |
| 03-S19 | Fix bundle-size alias (`tools/bundle-size/index.ts`, QR-03-3); cinematic starter ≤ 400,000 B (P-23); v2 code only in `import('../post/v2Entry')` chunk | bundle-size green on main | P1 | 15 |
| 03-ISSUES | #91 call `guardPostprocessPlan` (`quality/PostprocessGuard.ts:79`) in `PostprocessExecution.ts`, pool instead of `createRenderTarget` (`:227,257,378,407`), `frameStatsSlot.scope('post')` (blocks 11); #95 `EFFECT_PENDING_GPU_PASS:<name>`; #207 C-13 pass consuming `prd08.screenFeel` → `consumed=true` (blocks 08); #315 at removal | closed with tests | P1 | — |
| 03-REC | Untick d4f65a88 rows (P-54); F-03-01..05 verified with run ids, F-03-06..10 status fix (P-52); withdraw QR-03-22 (P-58); file QR-03-1/2/3/4/5/9/10/11/12/13/14/15/18/19, Q-01-5, Q-15-3/4 (P-64) | records consistent | P1 | — |
| 03-PROMO | standalone-accepted after S1-S20; G-PANEL I1-I14 (needs 01 C-05 AgX/Neutral, Q-01-2 velocity MRT; 07 Q-07-2; 14 Q-14-1; 11 Q-11-2/3; 13 Q-13-1); Phase 8 deletions (`webgl2/LegacyPost.ts` legacy programs, `NativeLdrEffectLuts.ts`, `resolveBloomPyramidResponseGain`, CPU readback branch `PostprocessExecution.ts:486-559`, compat.post, cinematic shims) | promoted → removed | P2 | 01, 07, 11, 12, 14, 15 |

### 4.4 Lane 04 — Materials, textures, glTF fidelity (A3D_QR_MATERIALS, _TRANSMISSION, _KTX2) · 50 %

PR content: #151 direct; #286 CLOSED + #301/#317/#321/#328 stack, all on main via d3eb6dc2/f4c1b894. CI: run 37773104353 —
unit dies at typecheck; browser 16/17 fail; captures job "green" via `test.fail` (P-20) while 38/38 (incl. three.js oracle)
hang → lane page/dev-server boot problem, not engine. 0/47 ticks. Track 0 items owned: T0-05 (with 01), T0-18.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 04-BOOT | Scene-page hang: `tests/qr/prd04/harness/prd04-capture.html` (+ prd04-assets/-perf/-procedural) never publish within 120-300 s; instrument `prd04-capture.ts` with `__QR_STAGE__` per dynamic import; verify `tests/qr/prd04/dev-server.ts:113-152` proxy serves `/benchmarks/quality-rebuild/**` (optimizeDeps stall, missing alias); module-load timeout → `__QR_ERROR__` | captures job: 19 scenes × 2 engines real PNGs, no test.fail | P0 | — |
| 04-S5 | `tests/qr/prd04/browser/lobe-numeric.ts`: `#define A3D_TRANSMISSION` for NEEDS (`:153-157`); `:59` call `a3dPrd04IorToF0f` (`specular_ior.glsl.ts:29`); investigate 12 `brdfGGXMultiscatter` OOB samples (`shims/brdf_r185.glsl.ts` vs r185 + DFG golden); perturbed-constant control (sheen × 0.012 fails) | 20 cases within 1e-3; control JSON fails | P0 | — |
| 04-P6-1 | `tests/qr/prd04/browser/wgsl-twins.ts:85` rename `__a3d_prd04_wgsl_probe` → `a3d_prd04_wgsl_probe` | 15 twins 0 errors on WebGPU runner | P0 | — |
| 04-LOBES | Lobes reach generated programs (= T0-05 part b-d, co-owned with 01): pars/call split, requires first, indirect append, guard mapping; wire `ShaderFeature.select` into the forward feature record (today only `Prd02DepthShaderLibrary.ts:191`) | clearcoat/sheen/transmission GLB with `core,materials`: `programs.failed == 0`; `C-03-lobes-compile.spec.ts` green for real | P0 | 01 |
| 04-S1 | `tests/qr/prd04/browser/sentinel-identity.spec.ts` on `sentinels.json`, ΔE2000 p99 ≤ IC-0 noise | green, run id in phase-2.md | P1 | — |
| 04-S2 | prd04-lobes/prd04-overrides impl tests in CI; C-03 browser for real | run id | P1 | T0-31 |
| 04-S3 | model-material-override (tinted-hero, damaged-helmet): white-tint masked SSIM ≥ 0.999, red-tint Laplacian ≥ 90 %, shadow luma ≤ 1.1×, `inspectMaterials` lists baseColor; measured failing flag-off control; use `model()` colour → baseColorMultiply bridge (`modelMaterials.ts`) since `TypedGLBActor.ts:303-315` lowers setTint to `replaceTextures:true` | green + control numbers | P0 | 04-BOOT |
| 04-S4 | `gltf-material-mapping-spec-exact.test.ts`, `duck-route-materials.test.ts` + flag-off control; CompareTransmission | CI run id | P1 | — |
| 04-S6 | texture-tiling: far-third shimmer ≤ 50 % flag-off; aniso 16 High / 8 Medium; measured control | green | P0 | 04-BOOT |
| 04-S7 | procedural-material-detail: fabric/brushedMetal/blackRubber/frostedGlass Laplacian ≥ 3× flag-off | 4/4 + control | P0 | 04-BOOT |
| 04-S8 | MikkTSpace in production: nothing calls `setMikkTSpaceModule`/`setMikkTSpaceWorkerFactory` → `GLTFRenderResources.ts:607` never takes it; lazy-install vendored module; add timeouts to `MikkTSpaceTangents.ts:138-148` (`runInWorker`, `module_.ready`); control on NormalTangentMirrorTest | diagnostics tangents path `mikktspace` | P1 | 05 lazy chunk (file) |
| 04-S9 | Texture budget wired: `applyTextureBudget` (`GLTFRenderResources.ts:550`) needs `textureBudgetBytes`/`maxTextureSize` from `app.quality` through `model()`; restore PRD control (P-35) | Medium Meshy hero via `model()` green | P1 | 15/11 plumbing (file) |
| 04-S10 | Transmission capture real (= T0-18 part): read `PRD01_FORWARD_TARGET`, declare reads (`Transmission.ts:144-149`), bind blackboard target to `a3d_prd04_transmissionSampler` (`features.ts:199-205`), wire `renderer.transmission` → `setTypedGLBActorQrTransmissionMode` | target active only with transmissive item, full mips, readbacks 0, sourceCopied true | P0 | 01, 15 |
| 04-S11/S12 | Variants + Draco/Meshopt through `model()` (now `loadProductionGLTFRenderPipeline` direct); flag-off variants control | variant ΔE ≥ 10; Draco/Meshopt ΔE ≤ 1.0 | P1 | 15 forwarding, T0-21 |
| 04-S13 | Create `tests/qr/prd04/unit/material-presets-defaults.test.ts` (`resolveMaterialSpecDefaults`, `AURA_PRESET_DEFAULTS` in `nodes/material.ts`, pin-emissive-defaults codemod golden) | green | P1 | — |
| 04-S14/S15 | `generate-extension-matrix --check` runs + hand-edit negative control; C-31 material diagnostics with real ProgramCache stats (`rendererProgramCachePeek`) | run ids | P2 | — |
| 04-S16 | scene-perf on 18-game-scene + gallery-shift-interior: flag-on median ≤ 1.10× off over 300 frames | `perf/<tier>.json` | P1 | 04-BOOT |
| 04-P1-3 | `generate-r185-golden.spec.ts` regenerates `fixtures/bsdf/r185-golden.json` from THREE.ShaderChunk in ChunkHarness (now python/llvmpipe) | oracle ≤ 1e-4 | P2 | — |
| 04-EVID | Phase 1 baselines (10 prd04 scenes × 2 engines, `none`); run ids + §16.1 tables in phase-1..7.md; move to `docs/project/aura3d-quality-rebuild/evidence/prd-04/`; stub control JSON → measured (P-56) | each phase cites a run | P1 | 04-BOOT |
| 04-E34 | Confirm `production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts` deleted (PBRShaderFeatures still exists); file Q-01-7, Q-11-2, Q-05-3, Q-15-4, renderer.transmission (15), model() forwarding (15), aura.scene.color (01) | rg zero imports; issues exist | P2 | P-64 |
| 04-ISSUES | #259 alphaMode/alphaCutoff/a2c/doubleSided on forward (a2c chunk unreached; blocks 10); #258 foliage/terrainLayer/planet aliases; #192 `@deprecated` visualQA (`material.ts:330`); #104 verify `apps/wow-webgpu-product-viewer/src/main.ts:51-67` clamps gone; #78 (umbrella → close), #80, #83, #84, #88 | closed with tests | P2 | 04-LOBES |
| 04-PROMO | Add push:main to `qr-prd04-materials.yml`; S1-S16 in one main run → standalone-accepted (`flags.state.ts:14`); IC-4 integrated `PRD04_FLAGS=all` + `all,-materials`; F-04-01..06 verified | promoted | P1 | 12 |

### 4.5 Lane 05 — Asset pipeline + tech-art toolchain (A3D_QR_ASSETS) · 50 %

PR content: #62, #347, #358, #360, #365, #366 squash-merged to main (wasm missing, `.gitignore:273`). CI:
`qr-prd05-assets-browser.yml` 0 green ever (assets-compressed-glb:63, decoder-failure:35, lod-transition:51 time out 180 s);
`qr-prd05-gates.yml` green; `asset-optimize.yml` dry-run only; `asset-lookdev.yml` 0 runs. Track 0 items owned: T0-13
(prd05 adapter), T0-21, T0-22.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 05-S3S4 | = T0-21 (commit wasm, abort/timeout paths) | assets-compressed-glb (ΔE2000 ≤ 2.0 masked, same-origin, sRGB format), decoder-failure, lod-transition green on macos-14 | P0 | — |
| 05-ADAPT | = T0-22 + T0-13 for `scenes/prd05/common.ts:74,147,155-161,174-178` | lane scenes with none/assets/all: drawCalls > 0, ready < 30 s | P0 | — |
| 05-S2 | `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:44-48` widen credits type; re-run qr-contracts with none/all/assets | qr-contracts green incl. C-16/C-17 stub+real + sentinel | P1 | T0-31 |
| 05-S6 | prd05-optimized-* vs source scenes (02, 03, 08, 09, 15, 18) both engines: masked SSIM ≥ 0.97 (≥ 0.95 for 09), silhouette IoU ≥ 0.98 (08/15), two C-32 vision runs, drop ≤ 0.25 | `evidence/prd05/assets/report.json` | P1 | 05-ADAPT |
| 05-S7 | LOD transition (d) ≤ 1 visible pop (vision × 2 + named human), (e) ≥ 60 % tri reduction at 80 m, (f) ≥ 2 level changes/copy, three with MSFT_lod | strip + log + judgments | P1 | 05-S3S4 |
| 05-BROWSERS | webkit + firefox projects in `tests/qr/prd05/playwright.config.ts`; windows-latest BC-selection job; SwiftShader ⇒ fail guard; `assets-tier-texture-cap.spec.ts` (2048 KTX2 → 1024) | one run all green | P1 | — |
| 05-S5 | Budget report: regenerate `optimize-dry-run.json` at `docs/…/evidence/prd05/assets/` for 226 models + 120-id aggregate; `tests/unit/asset-optimize/determinism.test.ts` in `asset-optimize.yml` | 226 rows + determinism run | P1 | — |
| 05-S8 | `asset-lookdev.yml` on the 10 listed assets; `review-vision.ts` × 2; good ≥ 6.5 G9, known-bad (bankShotTable, skylineArcticRunnerHero, siegeGolfBall, raw mechHeroDecimated) < 6.5; named human on 3 probes; not SwiftShader (#365 used `A3D_LOOKDEV_ALLOW_SWIFTSHADER=1`) | artifacts committed; ≤ 1 human disagreement | P1 | 05-S3S4 |
| 05-S9 | Admit library kits (60 candidates, `aura.library.json`) and 6 HDRIs at release with look-dev records; decide 12 Meshy assets (`meshy-promotion.json`, all hold-prestage) via remote Blender worker; F-05-01..09 published | kit minimums met; every Meshy decided | P1 | 05-S8 |
| 05-S10 | Create `tests/qr/prd05/fixtures/{route-bundle,routes,template-starter}/`; product-viewer + racing-starter pass G1-G11; root `aura.assets.json` → schema 1.1 with derived entries; derived total ≤ 80 MB for 120 ids; codemod `--report` over 18 games, valid JSON (P-56) | fixtures pass; aggregate committed | P1 | — |
| 05-S11 | Bundle-budget test: initial growth ≤ 3 KB gz, meshopt lazy ≤ 20 KB gz, draco not initial, wasm lazy | green in CI | P2 | — |
| 05-TIERS | Re-measure tiers on 6 pilots with `assets`/`all` with device strings + §17 metrics; manual iPhone/Android rows | issue per exceeded budget | P2 | 11 #53 |
| 05-PKG | Copy `packages/assets/vendor/{basis,draco,meshopt}` → `<base>/aura-decoders/` in app builds + templates (F-05-04) | built app + scaffolded template serve them 200 with correct MIME | P1 | 13 Q-13-1 (file) |
| 05-WIRE | Decoder registry on default `model()` path: `TypedGLBActor.ts:261` forwards only if passed; `compileScene.ts:178-187`, `renderer.ts:58` never pass; `attachAppAssetDecoders` (`engine/src/lanes/prd05.ts:26`) has no caller; un-skip `assets-compressed-typed-glb.spec.ts` | typed-GLB spec green | P1 | 04 Q-04-1, 15 Q-15-1 (file) |
| 05-C16 | Consumer for `resolveCompressedTextureFormatSlot` (`rendering/src/lanes/prd05.ts:25`): upload path calls `slot.get(rendererQrFlags())(format, colorSpace, gl)` | `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR` on ANGLE Metal | P1 | 01 (file) |
| 05-ISSUES | #51 HDRIs into `fixtures/environment-corpus/hdri` (blocks 12); #52 ground set + street kit (blocks 12); #68 K1-K7/K9 kits (blocks 14); #126 street lamp ≤ 5k tris; #165 C-25 sfx provenance; #242 `genericAgentText` loads `skills/agent-files/AGENTS.md` (cli `index.ts:3781`); #243 `doctor --look` → `look lint` | closed | P1 | — |
| 05-REQ | File every `q-issues.md` section (Q-02-1/2, Q-04-1/2/3, Q-11-1/2, Q-12-1, Q-13-1/2/3, Q-14-1..4, Q-15-1..9, CCR-05-1) + Q-05-7/8/10 → 01, Q-05-9 → 04; untick Day-0 (P-54) | numbers written back | P0 | P-64 |
| 05-PROMO | Register `A3D_QR_ASSETS_LOOKDEV` (`shaders/debug-view.glsl.ts:183`) in CONTRACTS §5 or remove; standalone-accepted (`flags.state.ts:15`); IC-4 `pilot-review.json` round + leave-one-out | promoted | P2 | 12, 14 |

### 4.6 Lane 06 — Animation, characters, skinning, IK (A3D_QR_ANIMATION) · ~55 %

PR content: #60, #153, #170, #184, #343, #346 merged to main (#346: 248 files, +27k, merged 2026-10-08 while lane run
37774324573 was queued). CI: `qr-prd06-animation-browser.yml` never green on the final branch (8603131d: chromium 4 / webkit
13 / firefox 17 failed; unit passed). 69/70 ticks without run ids; 28 evidence files are prose, no artifacts. 0 open issues
addressed to the lane. Track 0 item owned: T0-20.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 06-WORKER | = T0-20 (`pose/RetargetWorker.ts:16`) | QR-15 bundle size consumer build green | P0 | — |
| 06-HANG | Flag-on binding never settles: `resolveAnimationClipsForNode` resolves only when the `prd06.animation` TypedGLBActor extension `onLoad` calls `registerActorClipInfoSource` (`agent-api/app/actorAnimationHandle.ts:220-235`, `engine/src/lanes/prd06.ts:105-124`); on rejection `AnimationController.ts:933-939` warns and stays pending. Instrument extension activation (`setTypedGLBActorQrFlags`, `createAuraApp.ts:69`), `actor.id === node.runtime.id` (`compileScene.ts:180,316`), typed-manifest path, earlier onLoad throws. Add bounded timeout → resolve `[]`, publish binding with registry durations, warn `ANIMATION_CLIP_RESOLVE_TIMEOUT` | clip-samples-binding + gallery-shift-thief-gait flag-on legs green on 3 browsers | P0 | — |
| 06-S13 | `aura-clash-tracks-applied.spec.ts:103` hangs on both legs incl. `none`; revert lane-06 edit to `apps/aura-clash-showcase/src/legacy/playable/AuraClashArenaApp.ts` (installTestDriver move) or get PRD-14 sign-off; remove `test.skip` at `:168` (serial describe) | both legs + equality, 3 browsers, no skip | P0 | 14 |
| 06-S2 | WebKit `RenderDeviceError: Failed to allocate WebGL texture` in animated-character-browser (`SkinningPaletteTextureCache.ts`, `webgl2/TextureUpload.ts`, 191-joint RGBA32F); firefox `animation-resource-lifecycle.spec.ts:52` 60 s timeout; WebKit `skinned-pbr-parity.spec.ts:38` "missing shader uniform" from `webgl2/MultiDraw.ts:128` | 3 browsers green; run id in `palette-morph-resources.md` | P1 | — |
| 06-S3 | Restore strict IoU (P-27); raw-position control < 0.8; upload GPU/CPU/control masks | 3 browsers; masks in evidence | P1 | — |
| 06-S4 | Write `tests/browser/contracts/C-18-deform.spec.ts` (GPU skin 4/8 + morph 52 = CPU within 1e-3, `a3dDeformPrevious`) and `C-19-tracks-applied.spec.ts` (tracksApplied > 0, bone moves) — PRD-15 owned per §12.1: author with lane-15 sign-off or file request | stub + real green | P1 | 15 |
| 06-S6 | crossfade-filmstrip (aura `:69` webkit/firefox; three `:52` firefox timeouts); C / foot-slide / phase-error JSON + 8-frame strip; human "smooth, no foot skate" | 3 browsers + signed checklist | P1 | — |
| 06-S7 | ik-slope (`:68`, harness never ok at `:71`): penetration ≤ 1 cm, float ≤ 2 cm on 20° slope + 18 cm stairs, depth readback cross-check | artifact + run id in `ik-slope.md` | P1 | — |
| 06-S8 | Retarget locomotion capture on CesiumMan + auraClashPlayerRig via quality-rebuild-capture `qr_flags=animation`; human review (no flips, drift ≤ 1 cm/cycle) | signed review + run id | P2 | — |
| 06-S9 | Restore spring gate (P-28) and tune SpringBones until it passes; character-hero aura `:201` / three `:309` firefox failures; T4.8 burst (`tools/quality-rebuild-capture/steps/burst.mjs`, 240 frames @30 fps) + signed motion checklist | PRD-exact gate 3 browsers + artifacts | P0 | — |
| 06-S10 | Cite unit run id for `tests/qr/prd06/unit/hero-validator.test.ts` | run id in standalone-complete.md | P2 | — |
| 06-S11 | Replace bare `test.fail()` in `tests/qr/prd06/games/*.spec.ts` (P-21) with named-gate failures; fix flag-off legs (rooftop-buckets `:64`, mech-hangar `:52` on webkit); file Q-14-1..8 from `evidence/prd06/qr-requests-q14.md` as `to:prd14` issues | each spec fails only on its gate; 8 issues | P1 | P-64 |
| 06-S12 | Bundle +31,758 B gz vs ≤ +8 KB net (vs 85aafcd0): lazy subpaths for pose/IK/retarget/MotionMetrics behind the flag; `pnpm check:bundle-size` in lane workflow; measure prd06-perf-tier-{low..ultra} CPU/GPU + micro-budgets (PoseMixer ≤ 25/60 µs, palette ≤ 10 µs/65 joints, IK ≤ 2 µs, spring ≤ 3 µs, heap Δ < 64 KB/600 frames) | ≤ +8 KB in CI; JSON with run ids | P1 | — |
| 06-S1 | Fixed gallery-shift timeouts back to ≤ 180 s (P-29) with deterministic pump | green 3 browsers ≤ 180 s | P1 | 06-HANG |
| 06-FIREFOX | texture-array, skinned-shadow-onscreen, taa-skinned-ghosting `page.goto` 60 s timeouts on firefox; mech-hangar / rooftop flag-off legs on webkit | green | P1 | — |
| 06-P5 | Pose-mixer parity rigs at the PRD-named paths (Fox, CesiumMan); T2.7 WebGPU 191-joint mask (E27) evidence; T0.9b (integrated; needs Q-05-2, Q-13-1) | artifacts | P2 | 05, 13 |
| 06-REC | Cite run ids in all 28 evidence files; untick 69/70 → backed rows only (P-54); F-06-01..06 run ids (P-51); file §12.3 requests/CCRs | records consistent | P1 | P-64 |
| 06-ALL | Lane workflow fully green on main (dispatch after fixes): every non-test.fail spec on chromium/webkit/firefox | one green run id | P0 | all above |
| 06-PROMO | standalone-accepted (`flags.state.ts:16`); G-PANEL integrated (games tracksApplied > 0 per PRD-14 adoption) | promoted | P2 | 12, 14 |

### 4.7 Lane 07 — VFX, particles, atmospherics (A3D_QR_VFX + _SKY/_FOG/_VOLUMETRIC/_DECALS) · ~45 %

PR content: #143, #163, #246, #279, #292, #312, #338 merged. CI: only main run 37561125962 failed — browser 16/17 time out
(decal-surface-trail, fog-background-match, fog-chunk-compile, froxel-transmittance, particles-production …), capture fails at
vite build (T0-23), typecheck TS1005 in `tools/threejs-parity-animation-*-parity/index.ts` (T0-31). 0/15 S-rows captured;
`evidence/prd07/` holds 8 markdown files, no run-id dirs. Track 0 item owned: T0-34.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 07-BUILD | Capture job vite build (= T0-23) | capture job produces frames | P0 | 15, 10 |
| 07-TIMEOUTS | Root-cause the 16/17 browser timeouts after #338 (shared mounted-evidence hang, #156); C-20/C-21 browser conformance for real | ≥ 16/17 green in prd07-vfx.yml | P0 | 12 #156 |
| 07-MASKS | P-03, P-33, P-34 | masks removed, budgets restored | P0 | — |
| 07-S1..S12 | Capture + C-32 judge JSON (+ H sign-off where required) for prd07-particles-fountain (S1), flipbook (S2), impact-library (S3), sky-timeofday incl. skyVariance (S4), outdoor-sky (S5), fog-height GPU vs CPU mirror (S6), fog-transition (S7), rain-night (S8), snow (S9), decals (S10), trails-beams (S11), particles-stress + §18 relative perf: GPU ms, rAF p50/p95, readbacks (S12); three r185 comparison frames; `EFFECT_ZERO_PIXELS` absent across prd07-* | `evidence/prd07/<run-id>/` per scene | P1 | 07-BUILD |
| 07-S13..S15 | skyline-runner / neon-swarm / turbo-drift `vfx` vs `none`: judge scores vs baseline, artifacts committed (today GH artifact only) | judged + committed | P1 | 07-BUILD |
| 07-IC0 | IC-0 identity on 18 games + 18 base with `none` | recorded | P1 | — |
| 07-BROWSERS | `qr-prd07-browsers.yml` WebKit/Firefox (§19) and mobile emulation (§20) passing runs | run ids | P2 | — |
| 07-CLI | `commands/registry.ts` imports prd07 (#146, lane 15); `AuraEffectType` append trail/lightCone/auroraRibbon/meshParticles/fogVolume (#237) then drop the `vfxEffect()` casts | CLI registers vfx; casts gone | P1 | 15 |
| 07-ISSUES | #81 auroraRibbon, #87 vision cone (need #237); #82 underwater absorption/caustics/god rays + #187 `setFog({mode:'absorption'})` live from `UnderwaterState` (blocks 10); #85/#257 C-21 gradient `bands` real type + impl; #101/#102 honest particle update cost + scope + resident renderer; #256 `weather.wetGround` `@deprecated`; close #77 umbrella | closed | P1 | 15 |
| 07-OWN | #163/#246/#292/#312 out-of-lane edits (other lanes' workflows, QR_OWNERSHIP, GameRuntime.ts, game-sfx-core pack) → owner sign-off (P-61) | recorded | P2 | — |
| 07-REC | F-07-01..09 → proposed (P-50); untick browser-tested rows (P-54); withdraw #313 | consistent | P0 | — |
| 07-PROMO | S1-S15 + C-20/C-21 custodian conformance real → standalone-accepted (`flags.state.ts:17`); P7-T2 removal after default-on × 2 (removes `createProceduralSkyDome` with 02, cinematic shims with 03, root re-exports with 15 #316) | promoted → removed | P2 | 02, 03, 15 |

### 4.8 Lane 08 — Camera, controls, game feel (A3D_QR_CAMERA) · ~40 %

PR content: #132, #152, #166, #175, #185, #201, #235 merged (all with failing checks). CI: `qr-prd08-camera.yml` 0/34 green;
ubuntu-only (PRD mandates macos-14). On main 53/194 lane tests fail (frame-loop, camera-fromspec-parity, camera-rigs-view
R-5, camera-cast-codemod). Track 0 item owned: T0-32.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 08-ALIAS | = T0-32 (`createFrameLoop`, `resolveCameraFrame` not exported since bf1789b0) | frame-loop (8) + fromspec-parity (40) green | P0 | 15 |
| 08-FIX | Commit `tools/camera-cast-codemod/fixtures/style-{a,b}.ts` (`.gitignore:325`, P-38); fix R-5 shoulder 1e-6 parity | S17 codemod test 5/5; R-5 green | P0 | — |
| 08-CI | Add macos-14 ANGLE Metal browser job; push:main | lane workflow green on main | P0 | — |
| 08-SPEC | Create `tests/qr/prd08/browser/camera-feel.spec.ts`: S7 VP readback 1e-6 from `diagnostics().camera.viewProjection`, S8 scripted 30 s orbit, S14 touch-only end-to-end 390×844 DPR 3, hit-stop, reduced motion; create the cited-but-missing `unit/camera-controller.test.ts`, `unit/platformer-accel.test.ts`, `touch-device-prompts.test.ts`, `feel-bus.test.ts`, `feel-screenspace.test.ts` (or fix the citations) | green; citations resolve | P1 | — |
| 08-S1S3 | frame-pacing.spec + render-interpolation end-to-end; frame-pacing CSV artifact | run id | P1 | 08-CI |
| 08-S5 | Two-fighter + bystander combat harness for scoped hit-stop; shake energy check | green | P1 | — |
| 08-S9 | Motion scenes M1-M6 (`benchmarks/quality-rebuild/motion/scenes.ts:14-16` are skeletons): subjects, strips, WebMs, metrics | committed | P1 | 12 |
| 08-S11/S12 | Spline speed variation ≤ 5 %; bicycle drift: \|slip\| > 0.2 rad ≥ 0.6 s, counter-steer < 0.05 within 1.5 s, unicycle control | unit + CI | P1 | — |
| 08-S15 | ChunkHarness fade pixel coverage 50 % ± 2 % / 100 % | green | P1 | T0-02 |
| 08-S18/S19 | One `setListener` per presented frame test; `tests/qr/prd08/bundle/` fixture + per-tier CPU/GPU/memory | green + measurements | P2 | — |
| 08-ISSUES | #76 rig factories accept `framing.subjectHeightFraction` (blocks 14); inbound needs from 09 (#208, #210, #212 `GameAppRuntime.ts:183` → advance/onTick) and 03 (#207) tracked there; CCRs #222/#223/#224/#226/#228/#229/#230 with lane 15 | closed | P1 | 03, 09, 15 |
| 08-REC | F-08-2/F-08-5 → proposed, delete duplicate F-08 rows (P-52); untick I-7/C-14/P-6/Phase 5 (P-54); evidence per phase with run ids, IC-0 baseline, devices.md | consistent | P0 | — |
| 08-PROMO | S1-S19 in one run → standalone-accepted (`flags.state.ts:18`); I1-I12 at G-PANEL; X-2 removal | promoted | P2 | 12 |

### 4.9 Lane 09 — Shared game runtime, route extraction (A3D_QR_GAME) · ~40 %

PR content: #56, #139, #158, #240, #270, #274, #348, #349, #350, #354 merged. CI: `qr-prd09-game.yml` 0/106 green (no macos-14
browser job); `qr-prd09-routes.yml` divergence job green. `no-route-capture-flags.test.ts` fails on main. Track 0 item owned: T0-30.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 09-CI | macos-14 browser job in `qr-prd09-game.yml`; fix `no-route-capture-flags.test.ts` | lane workflow green on main | P0 | — |
| 09-BEACON | = T0-30 (#54) | readiness only after presented frame | P0 | — |
| 09-SPECS | Create §15 browser specs (none exist): `juice-pixels`, `hitstop` (+ `packages/game/fixtures/fighter`), `fx-instances`, `overlay-identity`, `tests/browser/game-shell/{shell-flow,context-loss}`, `capture-parity`, `audio-dsp` (OfflineAudioContext panning, occlusion, limiter, engine fundamental) | green | P1 | — |
| 09-CONF | Real C-24/C-25 stub+real conformance (now 8-line `typeof` checks); `prd09-sound` impl test; C-25 slot binding (`engine/src/lanes/prd09.ts` binds none) | green | P1 | — |
| 09-LAYOUT | P-25 (`layout.spec.ts:29`) | desktop ≤ 0.15, canvas ≥ 95 %, mobile, banned tokens | P1 | — |
| 09-P0 | postPass data: every `migration/baseline.json` postPass null; commit postpass.json | 18 non-null | P1 | — |
| 09-MIG | Rebase patch sets (all-routes-shadow `git am` fails on aura-clash); clear UNKNOWN branches (aura-clash 2, aurora 4, skyline 6); bring 17/18 routes ≤ 10 % evidence LOC (`after.json`: courier 11.2 %, pulse-tunnel 60.5 %); remove synth cues (pilots bank-shot, courier) | `--fail-on-any` = 0; 18/18 ≤ 10 % | P1 | 14 apply |
| 09-HUMAN | named-human sound_audio ≥ 6, loading_transitions ≥ 7; rAF p50 budgets; `evidence/prd09/<id>/review.md` vision screening | committed | P2 | 12 panel |
| 09-ISSUES | #111 `GameAppRuntime.ts:145` pass `app.quality` (blocks 11); #208 PannerNode + occlusion lowpass, #210 master limiter + jitter + voice limit, #212 `GameAppRuntime.ts:183` advance/onTick (block 08); #209 setPlaybackRate ramp; #213 `bindFeelSound` + reducedMotion; #70 game-sfx-core cues for 18 directions (blocks 14); #66 verify `--fail-on-any` and close; #211 verify 176 Hz cue gone, close | closed | P1 | — |
| 09-OWN | #350 edits to lane-13 templates, root package.json, finalize-dist → re-file as Q-13 handoff (#351) / owner sign-off | recorded | P2 | 13, 15 |
| 09-REC | Delete diff3 markers (P-53); untick `:1701`, `:1802`, CI item (P-54) | consistent | P0 | — |
| 09-PROMO | standalone-accepted (`flags.state.ts:19`); remove deprecated `game.*` after default-on × 2 | promoted → removed | P2 | 14 |

### 4.10 Lane 10 — World building, environment systems (A3D_QR_WORLD + _TERRAIN/_WATER/_BIOME) · ~35 %

PR content: #37, #134, #154, #176, #189, #205, #268 merged. CI: every lane-branch run after 10-06 fails at
`pnpm install --frozen-lockfile`; last green 37497949014 masked 2 failures (P-04): `prd10 registers all 12 chunks in the C-02
registry` (`shaderChunk()` undefined) and Path S background occlusion (left pixel 51 vs > 150). 5/56 ticked. Track 0 items owned:
T0-33, T0-23 (lane side, with 15).

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 10-CI | Fix frozen-lockfile install; remove P-04 masks; invoke all specs (terrain-gpu-cpu, terrain-cracks, terrain-splat-bake added to the `:79` playwright command); P-22 self-skips | lane workflow green on main | P0 | — |
| 10-CHUNKS | `shaderChunk(name)` returns undefined for the 12 prd10 chunks (`rendering/src/lanes/prd10.ts`) in the browser build; ChunkHarness compile tests execute | chunk registry spec green | P0 | T0-05 |
| 10-DEPTH | Path S world-pass depth: background quad occlusion fails; fix and update phase-1.md | spec green | P0 | — |
| 10-S1..S4 | terrain GPU vs CPU, crack-free capture strip (luma p99), S3 terrain layers ≥ 4 with shipped layer textures (ΔE/std), S4 frame timing + draw counts; T2.4 real WGSL terrain (now placeholder) | measured tables with run ids | P1 | 10-CI |
| 10-S5..S8 | Node-vs-browser scatter parity; create `scatter-alloc.spec.ts`, `wind-chunk.spec.ts` (+ foliage motion strip), `impostor.spec.ts` (run the bake, IoU) | green | P1 | — |
| 10-S9/S10 | Create `water-gerstner.spec.ts`; real detail normal/foam/caustic textures; diagnostics run | green | P1 | — |
| 10-S13 | Ship §6.6 content: terrain layers, foliage species, rocks, HDRIs, space cube, LOD1s, KTX2; textured kit GLBs (24 are untextured primitives); `hdri/space-default-512-*.f32` claimed in phase-6.md but absent | content in `packages/engine/assets/world` + LFS rule (#263) | P1 | 05 admission, 12 #263 |
| 10-S14/S16 | Measure "sky node submitted" per scene (now argued); S16 pixel identity on 6 sentinels within IC-0 tolerance (spec now checks gating logic) + rg audit | measured | P1 | — |
| 10-T5.6 | cityBlock for world (owner 15 → 10, #204); T4.7 water deletion (#188 via 14); T6.5 SSIM adoption (#267) | landed | P2 | 15, 14 |
| 10-ISSUES | Inbound #79 (umbrella), #86 `world.water({mode:'ocean'})`; blockers owned elsewhere: #34, #135, #177, #204, #249, #266, #340 (15), #187 (07), #252 (02), #259 (04), #263 (12) | closed | P1 | 15, 07, 02, 04, 12 |
| 10-EVID | phase-N.md S1-S16 tables with run ids (all written on a VM with NOT RUN); `evidence/prd-10/IC-0.md`; biomes-sweep.png, masks, three comparisons | committed | P1 | — |
| 10-PROMO | F-10-01..08 verified; standalone-accepted (`flags.state.ts:20`); parent→sub-flag defaults (#266) first | promoted | P2 | 15 |

### 4.11 Lane 11 — WebGPU, GPU architecture, performance tiers (A3D_QR_TIERS, A3D_QR_WEBGPU) · ~40 %

PR content: #150, #162, #168, #178, #186, #190, #197, #199, #342 merged. CI: `qr-prd11-perf.yml` 0/134 green (115 skipped,
both nightlies 37578024718/37734120918 failed; `gpu-probe.json` ENOENT); perf-gate uploads nothing and only captures
prd11-tier-ladder. 0/82 ticked. Completion needs two consecutive green nightlies. Track 0 item owned: T0-35.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 11-CI | Fix nightly (`gpu-probe.json`), perf-gate captures draw-call-stress + instancing-100k + tier-ladder and uploads report; P-09, P-22, P-30 | two consecutive green nightlies | P0 | T0 harness |
| 11-S1/S2 | fps-agreement.spec (measured vs rAF), C-28 counters browser conformance | green | P1 | 12 #92 |
| 11-S3 | batching-pixel-identity (2/255, SSIM 0.999) must fail, not skip, when no frame renders | green | P1 | T0 exit |
| 11-S4/S5 | Capture report with draw counts; planBatches/BVH microbenchmarks; zero-allocation cull (`FrustumCuller.ts` allocates Box3/Vector3 per item in `items.filter`); real `BVH.queryFrustum` (`performance/BVH.ts` is an 18-line re-export of `SceneOptimization`) | numbers committed | P1 | 01 #180 #181 |
| 11-S6 | no-readback.spec green; post execution wiring (#91 via 03) | green | P1 | 03 |
| 11-S7 | Governor: exact 300/600-frame sequences, ≤ 2 direction changes (P-31); `governor.spec.ts:68,95` fail instead of skip | green | P1 | — |
| 11-S8 | `tests/qr/prd11/fixtures/renderer-strings.json` (≥ 10 strings/class); probe-log artifact; Windows SwiftShader/WARP smoke job (#98 via 12) | green | P1 | 12 |
| 11-S9 | precompile-hitch asserts `programsCompiledSinceReady === 0` (absent); tier-switch-hitch | green | P1 | T0-06 |
| 11-S11/S12 | context-restore browser green; `--splitting` critical-path bundle measurement | run ids | P1 | — |
| 11-CODE | CLI `packages/aura3d-cli/src/commands/prd11/index.ts` is `export {}`: add `perf gate` + `prd11-batch-optout` codemod, `scripts/migrations/prd11-*`; Patrol Wing Phase-0 profile (gravity-post substituted) with scopes/triangles/readbacks; `webgpu/WgslAssembler.ts` (Phase 6, conditional on G-WGPU) | landed | P2 | — |
| 11-ISSUES | #53 name one device per tier; #67 GameRenderPreset honours probeHdrTargetFormat; #194 prd13 entry in `tools/bundle-size`; #214 WebGPUDevice cameraFade per-draw fields; #215 BVH sphereSweep export; #233 WGSL juice overlay; #260 WebGPUDevice consumes `a3d_prd10_*` WGSL twins (`WebGPUDevice.ts:3179`); #262 sceneKitBudgets cityBlock from `diagnostics().world`; #271 verify `device.lost` → `onDeviceLost` listeners (blocks 09); close #261 (obsolete) | closed | P1 | — |
| 11-BLOCKED | Needs from others (blocking S-rows): #90, #94, #113, #179, #180, #181 (01); #91 (03); #92, #97, #98 (12); #100, #129, #198 (15); #103 (14); #111 (09); #115 (02) | each landed | P1 | owners |
| 11-PROMO | §12.3 requests filed; standalone-accepted (`flags.state.ts:21-22`); G-WGPU decision at a G-PANEL gates Phases 7-8 | promoted | P2 | 12 |

### 4.12 Lane 12 — Visual benchmark + regression infrastructure (no runtime flag) · ~45 %

PR content: #58, #144, #341, #345, #352, #353, #355 merged. CI: `quality-gate.yml` 0 completed of last 100 (97 cancelled by
concurrency churn); IC-0 runs 37565849900 (dispatch) and 37707174082 (schedule) failed; capture at c08d8acb (37565971130)
failed. `goldens/manifest.json` `entries: []`. No panel round (PRISM key not provisioned for Actions, no named humans).
Track 0 items owned: T0-10..T0-14, §2.3, §2.5, P-01, checklist-lint.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 12-T0 | T0-10..T0-14 + §2.3 bisect inputs + `flags-bisect` suite + §2.5 `qr-required` | Track 0 exit | P0 | — |
| 12-156 | #156 systemic mounted-evidence timeouts (16/17 browser specs on main across lanes): root-cause on main | Browser Matrix green | P0 | T0-01 |
| 12-CONC | `quality-gate.yml` concurrency: `cancel-in-progress` only for the same PR ref, never main/schedule | ≥ 1 completed run/day | P0 | — |
| 12-IC0 | IC-0 record: `history/rounds/IC-0.json`, noise floor, per-image ΔE2000 p99 tolerance (T1.16, T1.17) | IC-0.json committed with run id | P0 | — |
| 12-V1..V8 | 3.0.1 detector baseline `history/baselines/3.0.1-detectors.json` (reproduce research 22/23 majors on c08d8acb with no human input; if the harness cannot run at that commit, run current harness against the 3.0.1 build); mask IoU ≥ 0.98 between engines (except 16); `titleDeterministic` for every game (T1.12, T1.13) | V1-V8 numbers | P1 | — |
| 12-V9/V10 | Goldens: populate manifest with runnerImage; 10× reruns of an unchanged commit → 0 G-REG failures; injected regressions (shadow ½, IBL 0, DPR 0.5) blocked; fix P-32 | recorded blocks | P1 | 12-CONC |
| 12-V11/V12 | Games baseline metrics; measured rAF fps report | committed | P1 | — |
| 12-PANEL | Panel round 1 before IC-4: 2 named humans + `judge-prism.ts` through Kiro Prism (Actions secret per #137 is owner action); calibration set; admit `prd12-ref-01..06` (0/6 `admittedAsReference`) — needs #51, #52 (05) | `history/rounds/round-1.json`; ≥ 1 ref admitted | P0 | 05, owner |
| 12-DEVICES | Real-device captures (T5.6): actually attempt via OIDC role (`auraone-production-operator` profile, PRD-12 §15.3), never stored keys; remove the stored-key proposal from `phase-5-devices.md` (P-56) | device captures or exact recorded denial | P1 | owner IAM if denied |
| 12-RELEASE | Release-gate dry run on the 3.0.1 commit (not a local empty index); scenario determinism measured | dry-run record | P2 | — |
| 12-ISSUES | #73 `steps/acceptance.mjs` (blocks 14); #75 G-PANEL schedule incl. lane-14 play sessions; #92 engine frame timing + fps agreement; #97 `quality.lock()` before shots + per-tier captures; #98 `perf_gate` input + windows smoke (block 11); #263 LFS rule for `packages/engine/assets/world/**` (blocks 10); #310 checkpoint capture-parity + look-signature jobs (blocks 09); close #74, #164, #236 | closed | P1 | — |
| 12-LINT | checklist-lint job (§3.3.5) + benchmarks typecheck covers `aura3d/scenes/**` | required in `qr-required` | P0 | — |
| 12-REC | Untick T1.16, T1.17, T3.2, T3.3, T3.6, T5.6, T5.7 (P-54) | consistent | P0 | — |

### 4.13 Lane 13 — Agent authoring, skills, templates, defaults (A3D_QR_LOOKS) · ~45 %

PR content: #55, #136, #173, #191, #202, #239, #244, #269, #273, #276, #277, #280, #283, #284, #287, #294, #297, #303, #305
merged (7 stacked heads not ancestors of main, §1.3). CI: `qr-prd13-authoring.yml` 0/200 green (fails at repo typecheck);
`template-lookdev.yml` never green (`publish-all.mjs --pack-only` dependency cycle `@aura3d/controls ↔ @aura3d/input`, masked);
`agent-output-eval.yml` never run. 4/61 ticked.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 13-LAND | For each stacked PR (#173, #191, #202, #239, #244, #269, #273): `git diff <headRefOid> afb475c2 -- $(gh pr view N --json files -q '.files[].path')` and confirm every hunk is present or intentionally superseded (record in `evidence/prd-13/landing.md`) | no lost hunk | P0 | — |
| 13-CYCLE | Break `@aura3d/controls ↔ @aura3d/input` cycle (with 15); remove `continue-on-error` (`template-lookdev.yml:83`) | template-lookdev green | P0 | 15 |
| 13-BASE | Capture template baselines 19 × 3 × 2 against 3.0.1; `benchmarks/agent-eval/baseline/round-0.json` (T0.6) | committed with run id | P0 | 13-CYCLE |
| 13-S1/S2 | Blind A/B of templates vs baselines; judged captures of 6 game templates | judged | P1 | 13-BASE, 12 panel |
| 13-S3/S4/S5 | Lint run over 18 game sources + 19 baseline templates; commit `tests/reports/craft-ratio.json`; signed art-director read | committed | P1 | — |
| 13-S6 | `aura3d look capture --runner gh-actions` returns PNGs for product-viewer 3 consecutive runs (Phase 3 exit) | 3 run ids | P1 | — |
| 13-S7 | Dispatch `agent-output-eval.yml` pilot (Prism key, #137 owner action) | round-0 + post-change round | P1 | owner |
| 13-S8 | three-compat captures vs three.js examples, judged | judged | P2 | — |
| 13-S9 | Flag-off identity in CI (unit assertions exist) | run id | P1 | T0-31 |
| 13-SPECS | Create `tests/browser/looks-expansion.spec.ts`, `template-look-floor.spec.ts`, `prompt-plan-render.spec.ts` | green | P1 | — |
| 13-MASKS | P-24 (9 KB), P-36 (fighting-game webdriver downgrade), P-37 (look-floor recalibration) | restored | P0 | — |
| 13-EVID | Move root `evidence/prd13/` → `docs/project/aura3d-quality-rebuild/evidence/prd-13/` with run ids; tick checklist with run ids | consistent | P1 | 12-LINT |
| 13-ISSUES | #48 drop threejs-parity-lab ref (`tools/agent-examples/index.ts`); #49 quarantine aggregator dirs; #105 archive `templates/production-webgpu-starter`; fact-13 skill rewrites #50, #69, #106, #216, #217, #218, #264, #351 — **only after** the cited F-rows are `verified` (P-50..P-52); #137 owner | closed | P1 | facts verified |
| 13-OWN | Out-of-lane edits: `agent-api/nodes/camera.ts` (08) in #269/#280/#283/#284/#287/#294/#297/#303/#305; `agent-api/index.ts`, `createAuraApp.ts`, `contracts/looks.ts` (15) in #173/#287; #277 other lanes' workflows + QR_OWNERSHIP — sign-off or revert (P-61) | recorded | P2 | 08, 15 |
| 13-PROMO | character-hero template after an F-06 row is verified; standalone-accepted (`flags.state.ts:23`); I1-I6 at G-PANEL; T7.1 at flag removal | promoted | P2 | 06, 12 |

### 4.14 Lane 14 — Eighteen-game rebuild (18 × A3D_QR_ROUTE_<ID>) · ~25 %

PR content: #63, #138, #160, #298, #323, #329 + 18 v2 shells (#183 … #334) merged. CI: `qr-prd14-games.yml` 1/65 green; on
lane PRs the T1.x unit job fails so capture/static-gate jobs (the S1-S9 evidence) were always skipped. No `evidence/prd14/`
artifacts except `review-queue.json` (4 wave-1 entries). `tests/qr/prd14/turbo-drift/car-visuals.test.ts` fails on CI
(`flatVehicleSurface is not a function`). Phase 3 (kits) and Phase 4 (content) **not started**. Track 0 item: T0-29.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 14-CI | Fix T1.x unit job + car-visuals test; P-05; run capture + static gates on every lane PR; delete the 22 `existsSync(v2/boot.ts)` skips (P-22) | lane workflow green on main | P0 | — |
| 14-GAMES0 | = T0-29 (aura-clash `.mode` TypeError, desktop no-draw) | 9/9 draw with `all` | P0 | 15 |
| 14-S1..S9 | Per game (18): boot flag off/on 0 errors 60 s; required conditions; canvas not black × 3 viewports; `auditArtDirection` 0; 0 capture branches + play-view text scan (remove Bank Shot `.evidence-strip` CSS); identical look across scenarios; draws ≤ Medium budget; p95 ≤ 50 ms on canonical runner; dispatch specs 4 → 18 (T1.10), framing specs 4 → 18 (T2.3) | `evidence/prd14/<game>/<run-id>/report.json` per game | P1 | 12 #73 |
| 14-LOC | Phase 2 exit `boot.ts ≤ 400 LOC` fails for 13/18 (Patrol Wing 1070, Aurora 992, Gallery 937, Gravity 903, Deep 784, Blockfall 772, …) | 18/18 ≤ 400 | P1 | — |
| 14-P0FIX | Courier Rush webglcontextlost/restore handler; Bank Shot `.evidence-strip`; Gallery Shift facing fix in legacy; missing §14.1 P0 tests | landed with tests | P1 | — |
| 14-KITS | Phase 3: create `apps/showcase-kits/` with K1-K9 `kit.json`, look-dev page, `kits.test.ts`, K8 cues (needs 05 #68 kits, 09 #70 cues) | S10, S11 measurable | P1 | 05, 09 |
| 14-CONTENT | Phase 4 per-game content in wave order: wave 1 Bank Shot, Turbo Drift, Aura Clash, Orbital Defense → IC-4; wave 2 Vault, Rooftop, Courier, Neon, Pulse, Siege → IC-8; waves 3/4 → IC-12 (asset swaps T4.0, per-game genre targets) | per-wave G-PANEL review | P1 | 14-KITS, 01-04, 07 |
| 14-HANDOFF | Apply inbound handoffs: #46/#308/#344/#103 games.json fields (blocks 12, 11); #47 scorecard consumes C-32; PRD-09 patch sets #278, #281-#302 (×14); PRD-11 #107-#110, #116-#122; PRD-08 #219-#221; PRD-10 #188, #265; #140, #306, #309 | closed | P1 | 09 rebase |
| 14-REC | T1.15/T1.16 Appendix B rows + R-14-xx issue filing verified; tick checklist with run ids (0/91) | consistent | P2 | 12-LINT |
| 14-PROMO | Per route: flag → `DEFAULT_ON=true` only after G-PANEL accepts it (overall ≥ 7, every visual category ≥ 5, "competitive with a well-built three.js game?" = Yes) and two clean checkpoints; then delete `src/legacy` | 18 routes locked or withdrawn | P2 | 12 |

### 4.15 Lane 15 — API, package and architecture consolidation (A3D_QR_COMPILER, A3D_QR_STRICT; custodian) · ~65 %

PR content: #30, #31, #33, #61, #159, #169, #182, #319, #330, #335, #336, #357 on main. CI on main: Type Check red, QR-15 bundle
size red (T0-20), arch-gates 32 enforced errors (layering, SCC-155, single-renderer, glsl-location), #357 merged with arch-gates,
Type Check, unit ×6, Chromium checks failing and all game capture shards cancelled. Track 0 items owned: T0-19, T0-23, T0-28,
T0-31 (coord), T0-32 (with 08), required checks (§2.5/§3.3), flag-state custody.

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| 15-MAIN | Type Check, bundle size, arch-gates green on main (T0-20, T0-31; `qr-prd15-arch-gates.yml:3-5,47` → `--strict`) | three checks green | P0 | owners |
| 15-BUDGET | Revert ratcheted budgets (P-23); reduce lit scene-01 initial chunk 439 KB → ≤ 190 KB, "." critical path 891 KB | bundle-size green at §17 caps | P1 | 06-S12, 03-S19 |
| 15-16.1 | Pixel-neutral gate per phase: 18 scenes + 18 games, flags `none` and `compiler,strict`, ΔE2000 mean ≤ 1.0, p99 ≤ 5.0 vs IC-0, vision + named human | per-phase capture + judgments | P1 | T0 exit, T0-13 |
| 15-16.2 | R18 instancing: `16-instancing-before-after.jpg`, vision ≥ 4.0, create `prd15-instancing-size` lane scene, field-extent rows `equivalent` | committed | P1 | 12 re-baseline |
| 15-16.3 | Lean fixtures (P-63) | captured or signed cut | P2 | — |
| 15-16.4 | `compiledFeatures` artifact beside each of 36 captures | committed | P1 | — |
| 15-SPECS | Create `tests/qr/prd15/browser/{renderer-single-path,lean-shim,pack-consumer-smoke}.spec.ts` | green | P1 | — |
| 15-T4.4 | Delete `createWebGLSceneRenderer` + GLSL after STRICT default-on (by design) | removed | P2 | promotion |
| 15-T8.2 | Strict captures (cancelled on #357), 3.1.0 publish + 4-week window, then 4.0.0 (P-62) | published in order | P1 | owner release |
| 15-FLAGS | Per-renderer flags (T0-28); parent→sub defaults (#266); `flagNameFor` multi-segment route ids (#72, dup #172); custody of `flags.state.ts` state changes only from checkpoint records | unit + IC record | P0 | — |
| 15-OWN | Fix `tools/qr-ownership/check.mjs:24` + `QR_OWNERSHIP.json` rows (#59, #147, #177, #204, #42); ownership job in `qr-required` | violations visible | P0 | — |
| 15-EVID | `evidence/prd15/{bundle-baseline.json,arch-gates.json,requests.json,phase-N/}` (§20); phase0.json ΔE p99 run + GH run ids | committed | P1 | — |
| 15-ISSUES (blocking) | #34 (10), #65 root scripts batch (14), #72 (14), #100 compiler/primitives cache/batch/static (11), #129 C-07 `batch?`/`static?` (11), #135 world node kinds (10), #146 prd07 CLI registry (07), #177 (10), #198 `allShaderChunks()` (11), #204 (10), #237 AuraEffectType (07), #241 InstanceBufferLike accessor (09), #249 `./world` export (10), #266 (10), #313 (07, after S-rows), #340 real C-26 conformance (10), #172 (dup) | closed | P0 | — |
| 15-ISSUES (rest) | Non-blocking (full list in `_sections/issues-triage.md` §Lane 15), e.g. CCRs #38, #71, #127, #128, #130, #131, #148, #228, #229, #230, #255; removals #40, #41, #44, #124, #142, #227, #316; requests #35, #39, #43, #45, #89, #93, #99, #123, #125, #149, #193, #222-#224, #226, #248, #250, #267); close #145 (with T0-28 only), #155, #161 (verify), #225, #247, #251, #339 | closed | P1 | — |
| 15-REC | Tick T3.9-T8.1 with run ids (32/81 now) | consistent | P2 | 12-LINT |

---

## 5. Open issues

Full per-lane tables (title, type, still-needed status, blocks, duplicates, action) are in `_sections/issues-triage.md`.

### 5.1 Summary

| Owner lane | Open | Confirmed still needed (Y) | Assumed (Y?) | Partial | Done → close | Obsolete | Blocks another lane |
|---|---|---|---|---|---|---|---|
| 01 | 11 | 5 | 5 | 0 | 1 | 0 | 7 |
| 02 | 7 | 2 | 3 | 2 | 0 | 0 | 2 |
| 03 | 4 | 1 | 3 | 0 | 0 | 0 | 2 |
| 04 | 9 | 2 | 7 | 0 | 0 | 0 | 1 |
| 05 | 7 | 1 | 6 | 0 | 0 | 0 | 3 |
| 06 | 0 | — | — | — | — | — | — |
| 07 | 10 | 1 | 5 | 4 | 0 | 0 | 1 |
| 08 | 1 | 0 | 1 | 0 | 0 | 0 | 1 |
| 09 | 10 | 2 | 7 | 0 | 1 | 0 | 5 |
| 10 | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| 11 | 10 | 3 | 5 | 1 | 0 | 1 | 1 |
| 12 | 11 | 3 | 5 | 0 | 3 | 0 | 7 |
| 13 | 12 | 2 | 10 | 0 | 0 | 0 | 1 |
| 14 | 37 | 3 | 32 | 2 | 0 | 0 | 5 |
| 15 | 63 | 37 | 15 | 4 | 6 | 1 | 17 |
| other | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| **Total** | **195** | **62** | **107** | **13** | **11** | **2** | **53** |

By type: qr-request 115, handoff-14 35, removal 17, ccr 15, fact-13 8, other 5. The 107 "Y?" rows were not spot-checked;
each owner confirms or closes them in its first Track-0-week PR.

### 5.2 Actions this week

- **Close now** (done on main / obsolete): #74, #155, #164, #225, #232 (verify vs §8 first), #236, #247,
  #251, #261, #339. **Close with T0-28:** #145. **Verify then close:** #161, #211. **Duplicates/umbrellas:** #172 → #72, #314 → #254, #77/#78/#79.
- **Track-0 critical blockers with an issue:** #156 (systemic browser timeouts, 12), #54 (C-24 beacon, 09), #145 (renderer
  flags, 15), #313 (flag promotion — withdraw until S-rows pass).
- **Blockers with no issue yet** (file under Track 0): strict vs `renderer.mode` (T0-13), prd05 `environments.color`
  (T0-22), prd12-ref-06 stale id (T0-14), MSAA HDR target (T0-01), GLSL `binding=` (T0-02), silent skips (T0-03), prd02
  render-target unbind (T0-08), prd03 MSAA resolve / state cache (T0-15/T0-16), retarget worker URL (T0-20), decoder wasm
  (T0-21), repo typecheck (T0-31), alias break for lane 08 (T0-32), world frame-graph throw (T0-33), vfx depth
  feedback / target unbind (T0-34), prd11 RT-pool leak and query growth (T0-35).

### 5.3 Blocking list (an open issue blocks a lane's standalone acceptance)

| Blocked lane | Issues (owner) |
|---|---|
| all | #156 (12) |
| 07 | #146, #237, #313 (15); #245 (01) |
| 08 | #207 (03); #208, #210, #212 (09) |
| 09 | #241 (15); #271 (11); #310 (12) |
| 10 | #34, #135, #177, #204, #249, #266, #340 (15); #187 (07); #252 (02); #259 (04); #263 (12) |
| 11 | #90, #94, #113, #179, #180, #181 (01); #91 (03); #92, #97, #98 (12); #100, #129, #198 (15); #103 (14); #111 (09); #115 (02) |
| 12 | #46, #47, #308, #344 (14); #51, #52 (05) |
| 13 | #137 (owner action: Actions secret for Kiro Prism) |
| 14 | #46, #308 (14); #65, #72, #172 (15); #68 (05); #70 (09); #73 (12); #76 (08) |

---

## 6. Execution plan

### 6.1 Parallelism

Lanes stay parallel; there are still no lane→lane schedule edges, only contract dependencies (CONTRACTS §2). What changes:

- **First 48 h (2026-10-09 → 10-10): Track 0 + Track P by lanes 01, 12, 15.**
  - Lane 12: T0-10..T0-14, §2.3 inputs, `flags-bisect`, `qr-required` skeleton, checklist-lint, P-01. Run Round 1 + 2.
  - Lane 01: T0-01 (one-line either side + real-device test), T0-02, T0-03, T0-04 — each as its own PR, each with a bisect run.
  - Lane 15: T0-31 triage (assign each failing file to its owner, fix 15-owned ones), T0-20 coordination, P-23 budget revert
    (the gate will go red; that is correct), ownership checker fix, prepare the ruleset (owner applies §3.3).
  - Lanes 02, 03, 04, 05, 06, 07, 08, 10, 11 in parallel fix their own Track 0 rows (T0-08/09, T0-15/16/17, T0-18,
    T0-21/22, T0-20, T0-34, T0-32, T0-33, T0-35) in their own files. All other lane work continues in own files but **no lane merges anything that is not Track 0/P
    until `qr-required` exists** (target 10-10).
- **Days 3-7 (to IC-1, 2026-10-15):** Round 3 leave-one-out after T0-01 lands; T0-05 (01+04 co-PR), T0-06, T0-07, T0-24..T0-30;
  every lane removes its own masks (§3.1-3.2), fixes its own lane workflow triggers and files its requests (P-64).
- **After Track 0 exit:** lanes run their S-rows (§4) in their own CI and produce evidence. Lane 12 runs the panel rounds.
- Execution venue: all browser/GPU/capture work runs remotely (GitHub macos-14 or the GitLab macOS mirror pipeline per
  `CI-ROUTING.md`); nothing runs on the Mac except editing and orchestration.

### 6.2 Checkpoints

| Checkpoint | Date | Gate for this PRD |
|---|---|---|
| IC-0 (re-record) | 2026-10-10 | `history/rounds/IC-0.json` + noise floor (12-IC0); flags `none` identity already passes |
| **IC-1** | 2026-10-15 | **Track 0 exit** (§2.5); Track P §3.1-3.4 merged; ruleset live; `qr-no-cross-lane-import` becomes error; requests filed |
| IC-2 | 2026-10-22 | first `standalone-accepted` promotions (lanes whose S-rows are all green in one main run; realistic candidates: 15 compiler/strict, 02, 03, 05) |
| IC-3 | 2026-10-29 | generator keys on base scenes (01 S7); lobes visible (04); remaining standalone promotions |
| **IC-4 G-PANEL 1** | 2026-11-05 | first `integrated-accepted`; wave-1 games (Bank Shot, Turbo Drift, Aura Clash, Orbital Defense) first counted review; panel round 1 must have run (12-PANEL); G-WGPU first evaluable |
| IC-5..IC-7 | 11-12, 11-19, 11-26 | `default-on` after two clean checkpoints |
| **IC-8 G-PANEL 2** | 2026-12-03 | wave-2 games; 12 goldens blocking; 13 templates on looks |
| IC-9..IC-11 | 12-10, 12-17, 12-24 | removals for flags `default-on` × 2 |
| **IC-12 G-PANEL 3** | 2026-12-31 | waves 3 + 4 games |
| **IC-16 G-PANEL final** | 2027-01-28 | final acceptance target |

A checkpoint that finds a regression files a `qr-ic-regression` issue against the lane named by leave-one-out (§2.4 Round 3).

### 6.3 Definition of done for the whole program

The program is done only when **all** hold, each with a cited remote run id and a panel record:

1. **Quality Bar** (`00-AURA3D-AUTOPSY.md` "The Aura3D Quality Bar", `_sections/E-debt-delete-qualitybar.md`) passes on the
   **shipped default path** (no flags, default URL):
   - Renderer R1-R5: every benchmark scene panel score ≥ three − 0.5; no `major-aura3d-deficiency` / `implementation-bug` /
     `missing-capability`; region metrics within tolerance and rejecting broken controls; the 6 well-built reference scenes
     (three ≥ 7) also within 0.5; time to first frame ≤ 1.5× three, draw calls ≤ 1.2× three.
   - Product viewer, character, environment domains at their pass thresholds.
   - Games G1-G6: every game overall **≥ 7.0**, no category < 5, rAF p50 ≥ 58 fps and p95 ≤ 20 ms on its tier hardware,
     desktop + mobile judged, default URL only, sampled/designed audio. Fleet mean ≥ 7.2, no fleet category mean < 6.0.
   - Agent output A1-A4: median ≥ 6.5, no prompt median < 5, zero renderer-knowledge escapes.
2. **Every lane flag promoted** through `standalone-accepted → integrated-accepted → default-on → removed`;
   `REMOVED_QR_FLAGS` lists all 15 + sub-flags; legacy paths deleted; rg checks empty.
3. **G-PANEL pass** (2 named humans + vision via Kiro Prism, median, calibration set scored blind, no mid-round amendment).
4. **18 games ≥ 7** or explicitly withdrawn by the owner (PRD-14 §G).
5. Process: ruleset + required checks active since IC-1 with zero bypasses; every PRD checklist tick carries a run id;
   every C-40 fact `verified` with a run id; 3.1.0 published ≥ 4 weeks before 4.0.0.

---

## 7. Verification protocol

### 7.1 Capture commands (remote only)

```bash
ALL=core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler
REF=<branch-or-main>

# Benchmark: 18 base + lane scenes, both engines, flags none and all (strict capture, fail-fast harness).
gh workflow run qr-gitlab-ci.yml --ref "$REF" -f suite=benchmark -f mobile=false -f requester=ic -f qr_flags=none
gh workflow run qr-gitlab-ci.yml --ref "$REF" -f suite=benchmark -f mobile=false -f requester=ic -f qr_flags="$ALL"
gh workflow run qr-gitlab-ci.yml --ref "$REF" -f suite=benchmark -f mobile=false -f requester=ic -f qr_flags="$ALL,strict"

# Games: all 18 from this commit, desktop + mobile, flags none and all.
gh workflow run qr-gitlab-ci.yml --ref "$REF" -f suite=games -f local_build=true -f mobile=true \
  -f viewports=1920x1080,1280x720 -f requester=ic -f qr_flags=none
gh workflow run qr-gitlab-ci.yml --ref "$REF" -f suite=games -f local_build=true -f mobile=true \
  -f viewports=1920x1080,1280x720 -f requester=ic -f qr_flags=all

# Leave-one-out attribution (after Track 0): §2.4 Round 3 with all 18 scenes (omit bench_scenes).

# GitHub-side capture (G-PANEL frames, quality.lock(), per-tier):
gh workflow run quality-rebuild-capture.yml --ref "$REF" -f qr_flags=all
gh run watch <run-id> --exit-status && gh run download <run-id> -D evidence-tmp/
```

Pass criteria for a run to count as evidence: every engine arm `status: ready` with `drawCalls > 0`, `errors: []`, no blank
PNG (pixel variance > ε), ready ≤ 30 s (bench) / firstDraw ≤ 15 s (games), renderer string not SwiftShader, `--strict`,
run id + SHA + asset hashes recorded in `report.json`. Artifacts are committed under
`docs/project/aura3d-quality-rebuild/evidence/prdNN/<run-id>/` (images as JPEG side-by-sides + `report.slim.json`).

### 7.2 Review

1. Automated: lane S-row specs green; G-REG vs goldens (12-V9) with 0 failures on an unchanged commit; region metrics
   rejecting their broken controls.
2. Vision: C-32 `judgeWithPrism` (claude-opus-5.5 via Kiro Prism, research/21/23 prompt), two independent runs per item.
3. Human: 2 named judges (art director + rendering engineer) at every G-PANEL; median of three; spread > 2 re-scored after
   written reconciliation; vision alone never passes; any admitted visible loss fails the item.

### 7.3 Numbers to beat

| Surface | 3.0.1 baseline (IC-0) | Target |
|---|---|---|
| Benchmark, Aura mean (18 scenes, research/23) | **3.6** (range ~1-6.5; 2/18 within 0.5 of three) | every scene ≥ three − 0.5 (R1) |
| Benchmark, three.js r185 mean | **5.4** | reference scenes three ≥ 7 also matched (R4) |
| Worst scenes | 14 particles 1 vs 4; 16 instancing 2.5 vs 4.5; 05 transmission 3 vs 6; 07 sheen 3 vs 6; 06 roughness 4 vs 7 | ≥ three − 0.5 each |
| Time to first frame | 1.3-13× three (06: 2,892 ms vs 218 ms) | ≤ 1.5× three |
| Games overall (research/21) | **1.5-4, mean/median 3.0**, none at 5; fps mostly 5-15 on macos-14, Deep Recovery 0.5-1 | each ≥ 7.0, fleet ≥ 7.2, p50 ≥ 58 fps |
| All-flags build today | **0/18** bench, **0/9** games, strict 0/18 | 18/18 and 9/9 drawing (Track 0), then the targets above |




