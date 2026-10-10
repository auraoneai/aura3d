# Finish prompt — Lane 15: API, package and architecture consolidation (A3D_QR_COMPILER, A3D_QR_STRICT; custodian)

Copy everything below this line into a fresh coding agent started in the repo root of `https://github.com/auraoneai/aura3d`.

---

You are the **finish agent for Lane 15** of the Aura3D Quality Rebuild, and the program **custodian** (flags, strict,
required checks, typecheck triage, CCRs, root-manifest batch). All lane PRs (#30, #31, #33, #61, #159, #169, #182, #319,
#330, #335, #336, #357) are on `main` (base `afb475c2`; every head is an ancestor — check with
`git merge-base --is-ancestor`, local `origin/main` may be stale, so `git fetch` first). **The lane is not done.** About
60-65 % complete, 32/81 PRD-15 checklist ticks, `A3D_QR_COMPILER` and `A3D_QR_STRICT` still `dev`
(`packages/rendering/src/contracts/flags.state.ts:24-25`), and every lane gate on `main` is red. Your mission: finish
**every** remaining Lane 15 task in `PRD-16-FINAL-REMAINING-WORK.md` §4.15, your Track 0 rows (T0-19, T0-23, T0-28, T0-31,
T0-32, §2.5 required checks), your Track P rows (P-02, P-10, P-23, P-29, P-37, P-55, P-60, P-61, P-62, P-64), and the
extra rows below, so both flags can be promoted to `standalone-accepted`. Nothing is "done" unless a **passing remote run
id** proves it.

## Read first (use `rg -n '^#'` + offset/limit reads; never read huge files whole)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §1 status, §2.2 Track 0 (rows T0-13, T0-19,
   T0-20, T0-23, T0-28, T0-31, T0-32), §2.5 all-flags gate + required checks, §3 Track P, §4.0 common rules + promotion
   ladder, **§4.15 your track** (`:731-775`), §5.2-5.3 issue actions and blocking list, §6 schedule, §7 verification.
2. `docs/project/aura3d-quality-rebuild/PRD-15-api-package-architecture-consolidation.md`: §11 back-compat (`:1323`),
   §12 contracts (`:1354`), §14 checklist (`:1639`), §15 tests (`:1746`), §16 standalone acceptance (`:1795-1870`), §16A
   (`:1871`), §17 budgets (`:1890`), §20 evidence (`:1948`), §21 completion (`:1967`), Appendix A (`:2068`).
3. `docs/project/aura3d-quality-rebuild/CI-ROUTING.md` (all 147 lines), `CONTRACTS.md` §3, §4.1, §5 flags, §6 merge
   protocol, C-29/C-36/C-37/C-38/C-39 entries.
4. `docs/project/aura3d-quality-rebuild/_sections/integration-findings.md`, `issues-triage.md` (§Lane 15, `:300`, 63 issues),
   `process-remediation.md` (lane-15 rows).
5. The original prompt `prompts/LANE-15-api-package-architecture-consolidation.prompt.md` (owned paths, contracts).
6. `docs/project/aura3d-quality-rebuild/evidence/prd15/requests/*.md` (~80 unfiled request notes).

**Owned paths:** every `contracts/` folder, `src/lanes/index.ts`, `packages/engine/src/agent-api/**` default (incl.
`compiler/`, `app/`, `index.ts`), `production-runtime/` default, every unlisted package, root manifests, `tsconfig*`,
`vite.config.ts`, `aura.exports.json`, `eslint.config.js`, `README.md`, `docs/` default, `CONTRACTS.md`, `tools/{arch-gates,
finalize-dist,script-prune,qr-ownership,packed-consumer-check}/`, `tests/unit/**` (custodian), `tests/qr/prd15/**`,
`.github/{QR_OWNERSHIP.json,workflows/{qr-contracts,ci,test,qr-prd15-*}.yml}`. Confirm each against
`.github/QR_OWNERSHIP.json` (longest prefix wins) before editing. **Not yours:** `packages/animation/src/pose/**` (06),
`packages/engine/src/lanes/prd02.ts` (02), `compiler/world.ts` (→ 10 per #251), `benchmarks/quality-rebuild/**` (12),
`tools/bundle-size/` (11, Q-11-5/7), `templates/**` + skills (13), `apps/showcase-*` (14). For those, file a `qr-request`.

## Current verified state (do not re-audit; act on it)

- **Red on main `afb475c2`:**
  - `qr-prd15-bundle-size` run 37775068018: `[commonjs--resolver] Could not resolve entry module
    .../@aura3d/engine/dist/animation/pose/retarget.worker.ts` from `dist/animation/pose/RetargetWorker.js`. Source:
    `packages/animation/src/pose/RetargetWorker.ts:16` `new URL("./retarget.worker.ts", import.meta.url)` (#346, lane 06).
    Green on #357 head `1065a98e` before #346 merged.
  - `qr-prd15-pack-check` run 37774324513 (prd06 head `8603131d`, now main; no main-push run exists): animation-channel /
    animation-studio `Cannot find module '../../../rendering/src/RenderDevice.js'`; arena-shooter `Could not resolve
    ../../../rendering/src/LightUniforms.js from @aura3d/engine/dist/engine/lanes/prd02.js`. Cause:
    `packages/engine/src/lanes/prd02.ts:80-81` (lane 02). Your T1.8 no-cross-package-relative rule missed it.
  - `qr-prd15-arch-gates` run 37773104712: 31 enforced findings. 20 glsl-location (GrassRuntime.ts, atmosphere/vfx shaders,
    ProgramGenerator.ts, SceneDepthCopyPass.ts, Transmission.ts, …); 3 layering (`agent-api/compiler/animation.ts`
    value-imports `app/actorAnimationHandle.ts`; `nodes/prompt/promptPlanV2.ts` value-imports `@aura3d/rendering/contracts`);
    1 no-cycles (SCC 155 rooted at `agent-api/AnimationAssetManifest.ts`); 2 single-renderer (`lanes/prd01/outputSurface.ts`,
    `rendering/src/renderer/PixelRatio.ts` call `getContext("webgl2")`). `qr-prd15-arch-gates.yml:46` is labelled "warn
    mode" but enforces.
  - `ci.yml` Type Check run 37775068000: 477 TS errors (first: `tests/browser/production-runtime-production-scene-tools.ts
    (151,29)`; `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts(48,39)` licenseName; `tests/unit/contracts/impl/
    prd12-variants.test.ts(73,14)`; `tests/unit/engine/route-cue-maps.test.ts:21-28` missing `apps/showcase-*/src/*-audio`;
    `tests/unit/tools/{muse3jsparity-docs-audit,muse3jsparity-document-invariants,external-parity-hdr-ibl-readiness,
    head-to-head-measured-outcomes}.test.ts` import tools quarantined in c92db932).
  - `qr-contracts.yml`: every recent run red (37779363728, 37773104536); browser job masked by `continue-on-error: true` at
    `:48`.
  - `qr-prd15-captures.yml` was **deleted** in T8.1; you have no lane capture workflow.
- **Combined build is broken.** GitLab pipeline 2926601350 (flags `core,lighting,post,materials,assets,animation,vfx,camera,
  game,world,tiers,looks,compiler`): 0/18 base scenes render (12 time out at 240 s; 01/10/11/12/14/16 `ready` with
  `drawCalls 0`, pure black); 10/13 lane scenes fail. With `strict` added, **every** Aura scene throws `AuraMigrationError`
  (`createAuraApp.ts:76-83`) because the harness passes `renderer.mode`/`renderer.fallback`. All-flags games (pipeline
  2926540757): 9/9 crash or never draw. With flags `none`, main is pixel-identical to IC-0. **Keep it that way.**
- **Your own flag-on defects found by code read (fix first, they plausibly cause black frames):**
  - `agent-api/compiler/compileScene.ts:330-362`: mount-time `handler.compile()` output goes into a local `contributions`;
    only `.features` is kept (`:362`); `CompiledSceneImpl` starts with a fresh `persistentContributions` (`:124`). Every
    `out.addItems/addLights/set` from compile is dropped: prd02 lights/environment/probe (`lanes/prd02.ts:94-145`), prd10
    terrain items and biome/time-of-day sun lights (`compiler/world.ts:174-370`), prd13 look. `compiledFeatures` still
    claims `environment.ibl`, `world.terrain`.
  - `compileScene.ts:432-464` `reuseRenderItems` keyed by `runtimeId` only → multi-mesh actors (`actor-N:mesh-i`) collapse
    to the last mesh from frame 2; time/animation/skinned items freeze at frame 1 (= T0-19).
  - `compileScene.ts:309-326,352`: mount awaits all GLB loads then each lane `handler.compile` sequentially, no timeout, no
    progressive first frame (candidate for 240 s timeouts; confirm with T0-12 `performance.mark`s).
  - `compiler/renderer.ts:76-165`: `Renderer.create` acquires the WebGL2 context, then `compileScene` (`:165`) with no
    try/catch; non-strict `mountRenderer.ts:56` then calls `createWebGLSceneRenderer` on the same canvas, leaking the first
    Renderer, HDRI promise and texture upgrades (doubled GPU memory; `Target page closed` candidate).
  - `compiler/renderer.ts:149` and `createAuraApp.ts:84-85`: tier hard-coded `{ tier: 'high' }`, `resolveTierSettings`
    voided → tier governor ignored with `A3D_QR_TIERS`.
  - `mountRenderer.ts:29-44`: under strict, non-`production` selections are forced onto the bridge and
    `analyzeProductionBridgeEligibility` failures throw `backend-fallback`; page never reaches ready.
  - `engine/src/contracts/compiler.ts:146-150`: `updateCompiledScene` resolves impl with `resolveQrFlags({ options: 'all' })`,
    ignoring app flags (fragile).
  - `engine/src/contracts/flags.ts` `applyList('all')` sets only `LANE_FLAGS`, never sub-flags (`A3D_QR_WORLD_TERRAIN`,
    `A3D_QR_VFX_SKY`, …) (#266); `flagNameFor` `:37-47` needs exactly 2 segments (#72/#172).
  - Renderer flags are a global last-writer-wins store (`rendering/src/renderer/FrameGraph.ts:30-35`) bound only by prd07/
    prd11 factories after mount (`createAuraApp.ts:448` vs `:724-728`); engine `prd02LightingOn()` (`compiler/lights.ts:414`)
    reads URL/env only (= T0-28, #145).

## Remaining tasks (exact list; work P0 top-down, open one small PR per row or tight group)

| ID | Task (file:line) | Done when | P | Depends |
|---|---|---|---|---|
| CI-1 / T0-20 | Retarget worker not in dist. File `qr-request to:prd06`: `RetargetWorker.ts:16` → `./retarget.worker.js` (or `?worker` emitted by the package build), add to `files`/`exports`. Lane 15: make `tools/finalize-dist` emit + keep the worker; add a pack-check rule rejecting `.ts` `new URL(...)` refs in dist; add product-viewer to the `packed-consumer-check` fixture list so pack:check fails too | `qr-prd15-bundle-size` + `qr-prd15-pack-check` green on a **main push** run | P0 | 06 (source) |
| CI-2 | Cross-package relative imports `engine/src/lanes/prd02.ts:80-81` → `@aura3d/rendering` subpath (file `to:prd02`); arch-gates `no-cross-package-relative` in fail mode on `packages/engine/src/lanes/**` + fixture with `../../../rendering/src` | pack:check green for animation-channel, animation-studio, arena-shooter on main; fixture fails the gate | P0 | 02 (file edit) |
| CI-3 / T0-31 | Type Check (477 errors): delete/repoint `tests/unit/tools/{muse3jsparity-docs-audit,muse3jsparity-document-invariants,external-parity-hdr-ibl-readiness,head-to-head-measured-outcomes}.test.ts`; fix `tests/unit/engine/route-cue-maps.test.ts:21-28` (#161 legacy/gameplay repoint); exclude `tools/_quarantine/**` (`external-parity-benchmarks/index.ts:172`) and fix `tools/threejs-parity-animation-*-parity/index.ts` TS1005 in the check config — do **not** scope the gate away. File owners: `tests/browser/production-runtime-production-scene-tools.ts:151`, `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:48` (05), `tests/unit/contracts/impl/prd12-{gate,variants}.test.ts:73` (12), `tests/unit/agent-api/prd02-lighting-legacy-golden.test.ts:10` (02) | `CI / Type Check` green on main push | P0 | 02, 05, 12, 14 |
| T0-32 | `@aura3d/engine` → `public/index.ts` (bf1789b0) dropped `createFrameLoop`/`resolveCameraFrame`: re-export under C-22 or agree lane-08 entry | `vitest run tests/qr/prd08` green in CI | P0 | 08 |
| P-02 | Remove `continue-on-error` at `qr-contracts.yml:48` once browser conformance is green; fix the unit job | qr-contracts unit + browser green, no mask | P0 | CI-3 |
| P-10 | Unmask `ci.yml:37,170,180`, `test.yml:47,54,200`; `All Checks Passed` uses `if: always()` + `needs.*.result` | aggregator fails on any skipped/failed need | P0 | — |
| 15-ARCH | 31 findings: `compiler/animation.ts` → `import type` or move handle into `compiler/`; `promptPlanV2.ts` type-only import; break SCC-155 at `AnimationAssetManifest.ts` (`evidence/prd15/requests/Q-15-1-agent-api-scc-unwinding.md`, file Q-07-1 Decals.ts); single-renderer + 20 glsl-location: dated allowlist entries each citing an **open issue #** to 01/02/03/07/10 (Q-01-6, Q-03-2, Q-06-2, Q-11-4, Q-07-4) or move code; rename step `qr-prd15-arch-gates.yml:46`; `:3-5,47` → `--strict` | arch-gates green on main push; every allowlist row dated + issue #; per-rule fixture tests pass | P0 | 01/02/03/07/10 |
| C36-DROP | Merge mount-time handler contributions into `compiled.persistentContributions` before the t=0 `updateCompiledSceneReal` (`compileScene.ts:330-362`, `:124`); unit test: registered handler's compile-time `addItems/addLights/set` reaches `compiled.source` | `tests/qr/prd15/unit/compiler-contributions.test.ts` green in CI; all-flags scene with lighting/world nodes draws the items (GitLab run) | P0 | — |
| T0-19 / C37 | `reuseRenderItems` (`compileScene.ts:432-464`) key `${runtimeId}:${itemIndex}` + node version; skip reuse for animated/time-dependent/skinned/morph nodes | unit: 3-mesh actor → 3 items on frame 2; animated actor modelMatrix/skin changes; `03-damaged-helmet` + Sponza draw count == flag-off (GitLab) | P0 | — |
| T4.2 | try/catch after `Renderer.create` (`compiler/renderer.ts:76-165`): `productionRenderer.dispose()` + `disposeHdriEnvironment()` then rethrow | unit with throwing handler: dispose called, one live context | P1 | — |
| MOUNT-T | Per-handler compile timeout + `performance.mark`s (T0-12: createAuraApp start, Renderer.create, compileScene, first renderFrame, mount catch) into `payload.extra.mountTiming` (harness copy = lane 12) | one remote run names the slow phase; follow-up issue filed | P0 | 12 |
| TIER | Pass resolved tier (not `'high'`) at `compiler/renderer.ts:149`, `createAuraApp.ts:84-85` | unit: tier governor value reaches compile ctx | P1 | 11 |
| 15-FLAGS / T0-28 | `createAuraApp` resolves flags once → `Renderer.create` (per renderer, not global `FrameGraph.ts:30-35`); engine `*On()` read app flags; `contracts/compiler.ts:146-150` use app flags; `applyList('all')` sets sub-flags (#266); `flagNameFor` multi-segment (#72, close #172 dup) | unit: two apps with different flags on one page; `diagnostics().flags` engine == renderer; close #145 | P0 | — |
| T0-13 / T4.5 | Strict vs harness: file `to:prd12` (Q-12-6/Q-12-8) to drop `renderer.mode`/`fallback` at `benchmarks/quality-rebuild/aura3d/common.ts:396`, `scenes/prd01/common.ts:319`, `prd04/common.ts:301`, `prd05/common.ts:148`, `prd06/crossfade-filmstrip.ts:117`, attaching the `packages/aura3d-cli/src/codemods/renderer-mode.ts` diff; review `mountRenderer.ts:29-44` strict bridge forcing (throw a typed, overlayed error, never hang) | `compiler,strict` capture of 18 scenes mounts with 0 `AuraMigrationError` | P0 | 12 |
| T0-23 | `@aura3d/rendering/world` ENOTDIR (`engine/src/lanes/prd10.ts:14`): `./world` export (#249) + aliases from `aura.exports.json` (`vite.aliases.generated.ts`) | `vite build --config benchmarks/quality-rebuild/vite.config.ts` green in a remote job | P0 | 10 |
| 15-REQ-CHK | `qr-required.yml` (lane 12 authors) made required; ruleset on `main` with the §2.5 check list; ownership job (`tools/qr-ownership/check.mjs:24`, #59/#147/#177/#204/#42) inside `qr-required` | ruleset live; a red PR cannot merge | P0 | 12 |
| 16.1 | Per phase (1,2,3,5,6,7,8): 18 scenes + 18 games, `none` and `compiler,strict`, ΔE2000 mean ≤ 1.0, p99 ≤ 5.0 vs IC-0; game pairwise C-32 vision + named human; 0 lane-15 degradations; no `u_lightDirection` fallback-marker program → `evidence/prd15/phase-N/*.json` (runId, qrFlags) + contact sheets | every scene in tolerance, no "worse", human sign-off recorded | P0 | T0 exit, T0-13 |
| 16.2 / T3.10 | Lane scene `benchmarks/quality-rebuild/aura3d/scenes/prd15/prd15-instancing-size` (non-unit size + per-instance scale; file to 12 if path is theirs); scene-16 before/after; research/23 vision ≥ 4.0, field-extent rows `equivalent`, human confirm; `evidence/prd15/16-instancing-before-after.jpg`; close #45 with re-baseline label | committed with run id | P1 | 12 re-baseline |
| 16.3 / P-63 | Restore `tests/qr/prd15/fixtures/lean-templates`, `tools/lean-fixture-capture`, a lane capture workflow; `prd15-lean-{product,minigame}` built from the packed tarball; 1920×1080 + 390×844; judge key-light gradient, contact/cast shadow, specular/IBL, rotated primitives; product gap ≤ 2.5 vs scene 02 three r185 | `fixtures/prd15-lean-*-{before,after}-{desktop,mobile}.jpg` + judgments, or a signed cut | P1 | — |
| 16.4 | `app.diagnostics().compiledFeatures` JSON beside each of the 36 strict captures + reviewer packet; fail frames with an authored env node but no `environment.ibl` | 36 JSONs; env→ibl check passes | P1 | C36-DROP |
| 15-SPECS | `tests/qr/prd15/browser/{renderer-single-path,renderer-mount-failure,lean-shim,pack-consumer-smoke}.spec.ts` (webgl2, empty degradations, no `u_lightDirection`; overlay + axe + flag-off identity; lit vs shadow luma ≥ 40/255; packed product-viewer via vite preview non-blank, 0 console errors); Chromium + WebKit + Firefox on macos-14; `error-overlay-{desktop,mobile}.png` | specs pass in a recorded GH run | P1 | — |
| T3.9 / CC2 | `agent-api/index.ts` 419 → ≤ 300 (or list pending Q-01-5 range by line in the gate config); 2,500-line cap: `GameRuntime.ts` 4463, `AnimationController.ts` 3571, `GameGenreKits.ts` 2763 (verify ownership) | max-file-lines gate green in fail mode | P2 | 01 (Q-01-5) |
| 15-BUDGET / P-23 / §17 | Restore `tools/bundle-size/index.ts:67,110,123,134` to §17 caps (lit-scene initial ≤ 190 KB, product-viewer ≤ 250,000, cinematic ≤ 400,000, mini-game ≤ 480 KB) via `to:prd11` (Q-11-5/7); let `BUNDLE_SIZES.md` show the fail; do the size work (lazy chunks, tree-shake `.`; lit scene-01 439,154 B, `.` 891 KB); measure compileScene/updateCompiledScene CPU (500 nodes) and 2k-item heap | BUNDLE_SIZES.md generated by a workflow at §17 caps; CPU/heap rows measured | P1 | 11, 06-S12, 03-S19 |
| T7.4 / CC8 | Root scripts 107 → ≤ 80 (`tools/script-prune --report/--apply`); `script-prune --check` in `ci.yml`; reconcile #65 | count ≤ 80, check in CI | P2 | 14 (#65) |
| T2.8/T2.12/T3.1 | Remove `engine/src/threejs-example-parity/{environments,FlagshipFoundation}.ts`; 4 apps importing `@aura3d/engine/advanced-runtime` (Q-ALL-1); confirm CCR-15-2 closed | `rg` 0 hits or allowlisted with issue # | P2 | apps owners |
| T4.4 | Delete `compiler/webglRuntime.ts` `createWebGLSceneRenderer` + safe-basic branches `mountRenderer.ts:33-35,:56` | after STRICT default-on (2 checkpoints); allowlist row removed | P2 | promotion |
| T8.2 / P-62 | Publish 3.1.0 RC (with deprecations, from a pre-#357 tag) via the release workflow and `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md` runbook; ≥ 4 weeks, then 4.0.0; or a signed waiver in `MIGRATION-4.0.md`. Rerun the cancelled #357 strict captures (36, identical to Phase 7) + full arch gates | published in order or waiver recorded; capture run id | P1 | owner |
| 15-EVID / §20 | `evidence/prd15/{bundle-baseline,arch-gates,bundle-sizes,requests}.json`, `phase-N/`; `baselines/phase0.json` ΔE p99 from a real run (now NOT-RUN, P-56); C-36 8/8 + C-37 4/4 conformance from a GH run | committed with SHA, run id, qrFlags | P2 | — |
| 15-REC / P-55 | Tick T3.9-T8.1 only with run ids; correct `evidence/prd15/phase7-process-pruning.md:32` (claims 70 scripts) | checklist-lint green | P2 | 12-LINT |
| P-60/P-61 | Retro-review branches `audit/retro-2ed5c16e`, `audit/retro-1f579954` (base `^1`); re-file 822c19fc's lane-15 edits; record lane-15 acceptance or revert foreign edits to 15 files (#173/#269-#305 on `agent-api/index.ts`, `createAuraApp.ts`; #162 CONTRACTS +1 line); fix wrong owners in `QR_OWNERSHIP.json` (`aura.library.json` → 05, `engine/assets/world/**` → 10, `camera-fade.glsl.ts`) | sign-off or revert recorded per PR | P1 | — |
| 16A IA-1..10 | Integrated acceptance at G-PANEL (IC-4 2026-11-05); needs the all-flags build to draw | IC-4 record shows IA rows passing | P2 | all lanes |

## Issues to action / close (verify each against main before closing; cite the commit or run in the close comment)

- **Close now (done/moot):** #145 (after T0-28 lands), #155, #225 (`packages/lean` deleted), #247 (size fix at
  `compiler/primitives.ts:94`), #251 (ownership → 10), #339 (record, ack). **Verify then close:** #161, #248, #250
  (materials package deleted). **Duplicate:** #172 → #72.
- **Blocking other lanes (P0):** #34 (10), #65 (14, reconcile with ≤ 80 scripts), #72 (14), #100 (11; size done, cache/batch/
  static open), #129 C-07 `batch?`/`static?` (11), #135 world node kinds (10), #146 add `commands/prd07` to
  `commands/registry.ts` (07, one line), #177 (10), #198 `allShaderChunks()` (11, with 01), #204 (10), #237 AuraEffectType
  append (07), #241 InstanceBufferLike accessor on `app/runtimeNodes.ts` (09), #249 `./world` export (10), #266 sub-flag
  propagation (10), #313 A3D_QR_VFX* transition (07; **withdraw until lane-07 S-rows pass**), #340 real C-26 conformance (10).
- **CCRs (one-working-day rule already violated; decide each):** #38, #71 C-35 `transferToPlayableMBByTier`, #127, #128,
  #130, #131, #148 C-01 `FrameContributorContext.canvas`, #228, #229, #230, #255.
- **Requests / removals:** #35 de-aliased HDRI ids, #39, #40, #41, #42, #43, #44, #45, #59 `check.mjs` lane pattern, #89,
  #93, #99, #123, #124, #125, #142 `setupLines` metric, #147 ownership row 07, #149, #193 `@deprecated` on visualQA, #222,
  #223, #224, #226, #227, #267 environment-preset-pack adoption; future: #316 (at A3D_QR_VFX removal).
- **File outbound (none of lane 15's §12.4 requests exist as issues; P-64):** for every `evidence/prd15/requests/*.md`
  run `gh issue create --label qr-request --label to:prdNN` and write the number back into the note and into
  `evidence/prd15/requests.json`. First: Q-07-1 (Decals.ts, SCC), Q-01-5 (scenegraph range, T3.9), Q-12-6/Q-12-8 (strict
  harness), Q-13-16 (vite-preview mount deadlock), Q-13-15 (look-floor recalibration), Q-11-5/Q-11-7 (bundle-size),
  Q-01-6, Q-03-2, Q-06-2, Q-11-4, Q-07-4 (allowlist owners), plus CI-1 (06) and CI-2 (02).

## PR content still to land

All lane-15 PR heads are on main; nothing is missing. Content still to land is new work: the rows above plus files deleted
in T8.1 without acceptance (lean fixtures, `tools/lean-fixture-capture`, a lane capture workflow), the
`tests/qr/prd15/browser/*` specs, and `evidence/prd15/**` artifacts. Note that #357 also edited 151 lane-13 files without
sign-off (P-61): get lane 13 acceptance on #357 or revert those hunks.

## Red flags to revert (open the revert PRs in week 1)

1. `tools/bundle-size/index.ts:58-67, :107-110, :130-134` budgets raised to 920,000 / 780,000 / 850,000 to fit measured
   891K / 740K / 809K (80a903d5, 250077b5). Restore §17 caps; report the honest fail (owner 11; file it, or co-PR).
2. `.github/workflows/qr-contracts.yml:48` `continue-on-error: true`.
3. `.github/workflows/qr-prd15-arch-gates.yml:46` "warn mode" label on an enforcing step; the 31 findings were called
   "pre-existing" and merged anyway.
4. #357 merged 2026-10-08T12:10:54Z with 21 failing + 6 cancelled checks. Never again; record it in `evidence/prd15/`.
5. §16.3 "closed by deletion" (T8.1 removed fixtures, capture tool, `qr-prd15-captures.yml`). Restore and run.
6. `templates/fighting-game/src/main.ts:175` and `packages/create-aura3d/templates/fighting-game/src/main.ts:175`:
   `evidenceMode = navigator.webdriver` lowers resolution, particles, LOD and shadows under automation (1065a98e, lane-13
   file). Revert, or make it explicit opt-in with a disclosed flag. File to 13.
7. #357 b82d51b01 / e64185e23: look-floor `subjectBounds` recalibrated to measured values, arena-shooter specular assert
   made conditional (P-37), spec timeouts 90 s → 240 s repo-wide (e.g. `tests/browser/gallery-shift-playable.spec.ts:305`,
   `showcase-asset-screening.spec.ts:17`; P-29). Restore pre-#357 expectations; recalibration only with art-director sign-off.
8. Tests deleted/weakened with removed code: `lean-game-surface.test.ts` deleted; `lean-entry-runtime.spec.ts` rewritten
   to `typeof` checks. Restore real assertions against the replacement surface.
9. `evidence/prd15/phase7-process-pruning.md:32` claims 70 scripts; `package.json` has 107. Correct it.
10. 4.0 removals on main before any 3.1.0 release (root version 3.0.1), §11 violated (P-62).

## Flag promotion criteria (A3D_QR_COMPILER, A3D_QR_STRICT; you are the only writer of `flags.state.ts`)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

- `dev → standalone-accepted`: Track 0 exit met (PRD-16 §2.5: Round 5 18/18 draw in `none` and `$ALL`, 9/9 games draw,
  `$ALL,strict` mounts every scene, `allflags-smoke` green on main twice in a row); §16.1-16.5 all green in **one** set of
  main runs with `--strict` and no §3 masks; sentinel identity (`qr_flags=none`, ΔE2000 p99 ≤ IC-0 noise on
  `benchmarks/quality-rebuild/sentinels.json`) recorded; lane-15 C-40 fact rows `verified` with run ids; checklist ticks
  backed (checklist-lint green); outbound requests filed. Realistic target: IC-2 2026-10-22.
- `standalone-accepted → integrated-accepted`: PRD-15 §16A at a G-PANEL (IC-4 2026-11-05, IC-8, IC-12, IC-16) with
  `qr_flags=all` and leave-one-out `all,-compiler`, `all,-strict`.
- `integrated-accepted → default-on`: two consecutive checkpoints with no attributed `qr-ic-regression`. Then T4.4.
- `default-on → removed`: two more checkpoints, one removal PR, `REMOVED_QR_FLAGS` updated, rg checks empty.
- Every state change for any lane (e.g. #313) is made only from a cited checkpoint record, in its own PR.

## Hard rules

1. **Remote only, routed per `CI-ROUTING.md`.** Never run local Docker, local Playwright/Chromium, local captures, local
   builds or full local test suites. Allowed locally: editing, git, `rg`, `tsc --noEmit -p` on a touched package, single
   targeted vitest files (`tests/qr/prd15/unit/*`, one `tests/unit/**` file). GitHub is source of truth; never push to or
   open MRs on the GitLab mirror.
   - PR gates (typecheck, lint, unit, contracts, ownership, arch-gates, pack-check, bundle-size): GitHub ubuntu. Browser
     conformance + flag-off sentinel identity + `tests/qr/prd15/browser/*`: GitHub macos-14 (dispatch
     `gh workflow run <wf>.yml --ref <branch>`).
   - Benchmark / lane-scene / game captures: GitLab macOS via the bridge, `local=true`. Tag the **head** commit message,
     e.g. `[qr-gitlab:benchmark flags=compiler,strict]` or
     `[qr-gitlab:games games=showcase-siege-golf viewports=1920x1080 mobile=false flags=compiler,strict]` (keys: `games=`,
     `viewports=`, `local=`, `mobile=`, `flags=`; an unknown key fails the run). Re-run without code change:
     `git commit --allow-empty -m '[qr-gitlab:benchmark flags=none]' && git push`. Dispatch alternative (does not attach
     to the PR): `gh workflow run qr-gitlab-ci.yml --ref <qr/ branch> -f suite=benchmark -f requester=prd15 …`. Never use
     `local=false` as evidence (it captures production). Download with `gh run download <run-id>` (artifact
     `gitlab-<suite>-<pipelineId>`).
   - Never compare frames or timings across providers (GitHub = full Chromium, GitLab = `chromium-headless-shell`). Every
     report records `ciProvider`, `browserChannel`, run/pipeline ids, `qrFlags`.
2. **Budget.** ≈ 2,400 GitLab compute minutes/month for lane 15. Benchmark ≈ 16 min, 2-game single-viewport `local=true`
   ≈ 22, full 18-game ≈ 133+. Prefer targeted runs (touched scenes/games, one desktop viewport, `mobile=false`). The
   per-phase §16.1 18-game runs are the only full-fleet runs you may launch; batch phases where the code is unchanged.
   Before any large run: `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`; if `1`, use GitHub
   `quality-rebuild-capture.yml` for the whole comparison and say so in the PR.
3. **Every merge needs BOTH:** (a) green lane-15 gates on the PR head — `QR-15 architecture gates / arch-gates` (`--strict`),
   `QR-15 pack-check`, `QR-15 bundle size`, `QR contracts / unit|browser` (no `continue-on-error`), `CI / Type Check`,
   `CI / Lint`, `CI / Build`, `Test & Coverage`, sentinel identity — and (b) a green **all-flags gate**
   `qr-required / qr-required` including `allflags-smoke` (PRD-16 §2.5: 6 probes × `none;$ALL;$ALL,strict`, drawCalls > 0,
   non-blank, `errors == []`, ready ≤ 30 s). While Track 0 is open the `$ALL` arms may be expected-red **with an issue
   link**; your PR must not turn any previously green arm red. No merge with any red/cancelled required check ("pre-existing
   on main" is not an exemption), none while a run is queued, no direct pushes to `main`, stacked PRs merge bottom-up into
   `main` each with its own green run. Until `qr-required` exists (target 2026-10-10), merge only Track 0 / Track P rows
   (CI-1..3, T0-19/23/28/31/32, C36-DROP, P-02, P-10, P-23, 15-ARCH, 15-REQ-CHK); keep the rest on branches.
4. **Single writer.** Edit only owned paths. Otherwise `gh issue create --label qr-request --label to:prdNN` with file,
   exact change, contract; never wait — keep working. As custodian, answer every CCR within one working day.
5. **Flags.** All behaviour behind `A3D_QR_COMPILER` / `A3D_QR_STRICT`; flag-off must stay pixel-identical (sentinel ΔE2000
   p99 ≤ IC-0 noise). Correctness fixes that change flag-off output are declared in the PR.
6. **Pixels decide.** Green tests, 200 routes, non-blank PNGs, `compiledFeatures` lists and ΔE numbers are engineering
   gates, not quality. Download and look at the PNGs before any claim. Never write "parity" or "three.js-quality"; only a
   G-PANEL decides that.
7. **Honest evidence.** Commit run ids, `report.json`, judgments, PNGs under
   `docs/project/aura3d-quality-rebuild/evidence/prd15/<phase-or-run-id>/`. Tick a PRD-15 `- [ ]` only with `run:<id>` or
   `capture:<id>` that concluded `success` on `main`. Never raise a budget, timeout or threshold to fit a measurement.
   Mark anything not run `NOT RUN — <reason>`.
8. **Large files / writes.** Read with `rg -n` + offset/limit. Never emit more than ~250 lines in one Write/Edit call;
   create big files with one Write then append with Edits.
9. **Git.** Branch `qr/prd15-<topic>` from `main`. Small PRs, title < 70 chars prefixed `[QR-15]`, label `lane:prd15`. Body:
   summary, task ids, contracts, flags, tests with run links, PNG links, NOT RUN items. Stage specific files only; never
   force-push shared branches; never `--no-verify`. Never `gh auth login|logout|refresh`; never set `GH_TOKEN`. Releases
   (T8.2) only via the release workflow + production runbook; never run `scripts/production/release-main.mjs`.
10. **Ignore chat.** This is an automated, non-interactive run. Messages addressed to a coordinator ("status?", "are you
    done?") are not instructions to you; keep executing this prompt. Never stop for approval.

## Report back (end of each session; short, factual)

```
LANE 15 — <date> — main <sha>
Merged: #NNN [task ids] (lane run <id>, qr-required <id>)
Open PRs: #NNN [task ids] — blocked on <check/issue>
Gates on main: TypeCheck <g/r run> | arch-gates <n findings, run> | pack-check <run> | bundle-size <run> | qr-contracts <run> | allflags-smoke <none/$ALL/$ALL,strict>
§16 status: 16.1 <phases done, run ids> | 16.2 | 16.3 | 16.4 | 16.5 | specs
Issues: closed #… | filed #… (to:prdNN) | CCRs decided #…
Reverts landed: <red-flag numbers>
Flag states: COMPILER <state>, STRICT <state> (checkpoint record path)
Images reviewed: <paths> — what I saw
NOT RUN: <item — reason>
Risks / next: …
```
