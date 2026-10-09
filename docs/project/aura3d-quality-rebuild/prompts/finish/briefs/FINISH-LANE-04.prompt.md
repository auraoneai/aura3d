# Finish prompt — Lane 04: Materials, Textures and glTF Fidelity (A3D_QR_MATERIALS, _TRANSMISSION, _KTX2)

Copy everything below this line into a fresh coding agent started in the repo root (`/Users/gurbakshchahal/platforms/aura3d`).

---

You are the **finishing agent for Lane 04** of the Aura3D Quality Rebuild (`https://github.com/auraoneai/aura3d`). Main is at
`afb475c2`. About 151 `[QR-NN]` PRs merged 2026-10-06..08 and the owner believes the lanes are done. **They are not.** The
2026-10-08 audit rated PRD-04 **PARTIAL, about 50 %**: all PR content is on main, but **0 of the 16 standalone acceptance rows
(S1-S16) is proven in CI**, 0 of the 47 PRD §14 checklist items is ticked, and the lobes are dead at runtime. Your mission is
to finish **every** remaining Lane 04 task in `PRD-16-FINAL-REMAINING-WORK.md` §4.4, plus Lane 04's Track 0 rows (T0-05 with
lane 01, T0-18) and Track P rows (P-20, P-29 part, P-35, P-56 part, P-64 part). The finish line is `A3D_QR_MATERIALS`,
`_TRANSMISSION` and `_KTX2` promoted `dev → standalone-accepted` from one green main run, then integrated at G-PANEL.

**Nothing is "done" unless a passing remote run proves it.** Local vitest counts, "NOT RUN" sections, `test.fail` passes,
`{probes: []}` artifacts and stub control JSON are not evidence.

## Read first (rg -n '^#' + offset/limit; never read huge files whole)

1. `docs/project/aura3d-quality-rebuild/PRD-16-FINAL-REMAINING-WORK.md`: §2 Track 0 (T0-05 `:126`, T0-13 `:134`, T0-18 `:139`,
   gate `:236-254`), §3 Track P (P-20 `:281`, P-29 `:290`, P-35 `:296`, P-56 `:332`, P-64 `:344`), §4.0 promotion rules
   (`:350-362`), **§4.4 Lane 04 (`:468-497`)**, §6 schedule/checkpoints (`:816-845`).
2. `docs/project/aura3d-quality-rebuild/PRD-04-materials-textures-gltf-fidelity.md`: §8 shaders (`:839`), §12.3 requests,
   §13 phases (`:1358`), §14 checklist (`:1409`), §15 tests (`:1477`), §16 acceptance S1-S16 (`:1538-1555`), §20 evidence (`:1712`).
3. `CONTRACTS.md` (§3 extension points, §4.1 ownership, §5.3 promotion, §6 merge protocol), `CI-ROUTING.md` (whole file),
   `_sections/integration-findings.md`, `_sections/process-remediation.md`, `_sections/issues-triage.md`.
4. The original lane prompt `prompts/LANE-04-materials-textures-gltf-fidelity.prompt.md` (ownership, rules). Its rules still
   apply; this prompt overrides it where they differ.
5. Prior audit data if present: `/tmp/qrfinal/audit-04.json`, `/tmp/qrfinal/prs.json`, `/tmp/qrfinal/issues.json`.

## State of the lane (verified 2026-10-08)

- **PR content: all on main, none still to land.** #151 merged directly. #286 was CLOSED, and #301/#317/#321/#328 merged into
  stack branches. All of it reached main via manual merges `d3eb6dc2` and `f4c1b894` (ancestry checked: heads 06828859,
  b27c30f9 and 6be6789e are ancestors of main; #301/#317 head objects are gone, but their content was verified via `adf46706`
  and `3444586d`). **Process deviation:** no PR-to-main CI gate ever ran on the combined stack. Every task below is new work
  or a fix on main. Do not re-land the old PRs.
- **Lane CI is `qr-prd04-materials.yml`, latest run 37773104353 (3 green in about 101 runs).**
  - The `unit` job dies at `pnpm typecheck:raw` on non-PRD-04 files, so the lane vitest and `generate-extension-matrix --check`
    never run.
  - The browser job is 16/17 red. Only the chunk-conformance harness passes.
  - The "Lane captures (flags=none)" job is fake-green: all 38 captures, the three.js oracle included, time out at 2 min and
    are turned into passes by `test.fail`.
  - The workflow triggers only on `pull_request` to main and `push` to `qr/**`. **Main never runs it**, so promotion is
    impossible as wired.
- **Integrated:** with lane flags on, 0/18 bench scenes and 0/9 games draw (GitLab pipelines 2926601350, 2926540757). With
  flags `none`, main is pixel-identical to baseline (IC-0 pass); keep it that way.
- **Flags:** all three are `"dev"` in `packages/rendering/src/contracts/flags.state.ts:14`. Lane 15 changes them at a
  checkpoint; you supply the evidence.

## Remaining task list (exact IDs; do all of them)

### P0: Track 0 (first; nothing non-Track-0/P merges until `qr-required` exists, target 2026-10-10)

| ID | Task (file:line) | Done when |
|---|---|---|
| **T0-18** | **(a)** `packages/assets/src/GLTFRenderResources.ts:1958-1963`: with `A3D_QR_MATERIALS` on, the missing-material fallback becomes white / metallic 1 / roughness 1, which renders near-black without bound IBL. Use metallic 0 until a C-09 probe is bound, or follow the glTF spec *and* guarantee IBL. **(b)** `:2080-2091`: the E22 unbacked-scalar-transmission rewrite is skipped because `programCacheSlot.provided` is always true (`rendering/src/lanes/prd01.ts:22`). Keep E22 until real transmission actually draws. **(c)** `forward/Transmission.ts:162-186`: read `PRD01_FORWARD_TARGET` (`FrameGraph.ts:157`) instead of `FRAME_RESOURCES.sceneColor`, which nobody writes. **(d)** `:173`: restore the previous render target after the copy. **(e)** `:217-243`: make the contributor per-device instead of a module-global singleton, cache the copy VB/program in `ensureCopyResources` (`:200-207`), stop creating a pass per frame, and drop the per-frame `JSON.stringify` (`:52`). **(f)** `MikkTSpaceTangents.ts:138-148`: add timeouts to `runInWorker` and `await module_.ready`. | With `all`, `05-transmission` and a no-material GLB render a non-black subject. Heap and GL object counts stay flat over 600 frames. Proven by a remote run (bisect or bench) with the run id recorded. |
| **T0-05 / 04-LOBES** (co-PR with lane 01; lane 01 owns `qrSubFlags.ts` and `ProgramGenerator.ts`, you own the chunks and features) | `renderer/qrSubFlags.ts:38-44` calls the ProgramCache without `{flags, onDegradation}`, so `ProgramGenerator.ts:466-468` returns early and no lobe is spliced. **Landmine:** once flags flow, PRD-04 chunks that are function libraries get spliced inside `main()` (`ProgramGenerator.ts:354,372,381,391,406`), which fails the program and makes `ForwardPass.ts:478` skip the draw (0 draws). Required fixes: **(b)** split every prd04 chunk (`materials/lobes.ts:53`, `materials/features.ts:120,159,185,219`, `shaders/physical/*`) into a *pars* library (global scope) and a call snippet; **(b')** have `hookSplice` (`:132-153`) emit `requires` first, in topological order; **(c)** make `fragment:indirect` contributions append, never replace `defaultIndirectBody` (`:380`); **(d)** map `A3D_PRD04_TRANSMISSION_TARGET` and the other feature defines to the chunk guards (`A3D_TRANSMISSION`); **(e)** wire `ShaderFeature.select` into the forward feature record (today only `Prd02DepthShaderLibrary.ts:191` calls it; `MaterialFeatures.ts:130` sets only `prd06.deform`). Lands **after T0-03** so failures are visible. Also resolve 01-GENTEST (`:375`): the C-02/C-03 conflict, Lambert default. | With `core,materials`, a clearcoat/sheen/transmission GLB compiles a generated program that contains the prd04 chunk, with `programs.failed == 0`. `C-03-lobes-compile.spec.ts` is green for **real**. C-02 "every registered chunk compiles" is green with `qr_flags=all`. |
| T0-13 (assist) | Harness passes `renderer.mode` and throws `AuraMigrationError` under strict. Lane 12 owns the fix. Check that the prd04 scenes and harness pages do not pass deprecated renderer options. | prd04 lane scenes mount under `$ALL,strict` |

### P0: lane harness, CI and masks (Track P)

| ID | Task | Done when |
|---|---|---|
| **CI-0 / T0-31** | The unit job fails `pnpm typecheck:raw` on files owned by other lanes: `tests/browser/production-runtime-production-scene-tools.ts:151` (TS2345), `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:48` (TS2339 `licenseName`), `tests/unit/contracts/impl/prd12-variants.test.ts:73` (TS18048), `tests/unit/engine/route-cue-maps.test.ts:21-28` (TS2307), and `tests/unit/tools/{external-parity-hdr-ibl-readiness,head-to-head-measured-outcomes,muse3jsparity-docs-audit}.test.ts`. Do not edit them. File `qr-request` issues to prd05/prd12/prd15 (lane 15 runs T0-31 triage). Meanwhile, scope the lane typecheck to a lane tsconfig **without dropping the repo gate** (the repo-wide `CI / Type Check` stays required). | The unit job is green on a PR-to-main run, and the `vitest run tests/qr/prd04 tests/unit/contracts/impl/prd04-*` and `node tools/generate-extension-matrix.mjs --check` steps actually executed |
| **04-BOOT / CI-1** | Scene-page hang: `tests/qr/prd04/harness/prd04-capture.html` and the `prd04-assets`, `prd04-perf` and `prd04-procedural` pages never set `__QR_READY__`/`__QR_ERROR__` within 120-300 s, even for the three.js oracle (transmission is stuck at stage `pre-adapter`). Steps: (1) take `error-context.md` and the trace from a run with `trace:on`; (2) add `window.__QR_STAGE__` markers around each dynamic import in `prd04-capture.ts`; (3) verify that the `tests/qr/prd04/dev-server.ts:113-152` proxy serves `/benchmarks/quality-rebuild/**` (look for an optimizeDeps stall or a missing alias); (4) add a module-load timeout that publishes `__QR_ERROR__`. | The captures job produces 19 scenes × 2 engines of real PNGs, without hitting any `test.fail` path |
| **P-20** | Delete `test.fail(true, 'harness did not publish …')` at `tests/qr/prd04/browser/prd04-scene-capture.spec.ts:53`. A hang must fail and record the timeout. | No `test.fail` or `continue-on-error` left in the lane |
| **P-29 (04 part)** | `transmission-capture.spec.ts:39` uses a 300 s timeout. Restore the PRD timeout after 04-BOOT. | Spec meets the ≤ 30 s ready budget |
| **04-S5 / CI-2** | `tests/qr/prd04/browser/lobe-numeric.ts`: (1) prepend `#define A3D_TRANSMISSION` for the NEEDS cases (`:153-157`: applyIorToRoughness, volumeAttenuation, volumeTransmissionRay); (2) at `:59`, call `a3dPrd04IorToF0f` (defined in `specular_ior.glsl.ts:29`), not `a3dPrd04IorToFresnel0f`; (3) find the cause of the 12 `brdfGGXMultiscatter` out-of-bound samples by comparing `shims/brdf_r185.glsl.ts` with r185 `BRDF_GGX_Multiscatter` and the DFG LUT golden, and fix the shim or the golden, never the tolerance; (4) add the §15.4 perturbed control (sheen × 0.012 must fail) and write `evidence/prd-04/probes/s5-lobes-control.json`. | `physical-lobes-numeric.spec.ts` compiles all 20 cases, each within 1e-3, and the control JSON shows the perturbed run failing |
| **04-P6-1 / CI-3** | `tests/qr/prd04/browser/wgsl-twins.ts:85`: rename `__a3d_prd04_wgsl_probe` to `a3d_prd04_wgsl_probe` (WGSL forbids a leading `__`) | All 15 twins report 0 errors in `getCompilationInfo` on a WebGPU runner |
| **04-PROMO (workflow part)** | Add `push: branches: [main]`, `schedule` and `workflow_dispatch` to `qr-prd04-materials.yml`. Widen `paths` to all lane-owned source, upload artifacts on `always()`, and run browser jobs on macos-14 with a GPU. Convert the workflow to `workflow_call` when lane 12's `qr-required.yml` lands. | A run on main exists |

### P0/P1: standalone acceptance rows (after 04-BOOT; each needs a measured, failing flag-off control)

| ID | Task | Done when | P |
|---|---|---|---|
| **04-S3** | `model-material-override.spec.ts` on `prd04-tinted-hero` and `damaged-helmet`. Thresholds: white-tint masked SSIM ≥ 0.999; red-tint Laplacian ≥ 90 %; shadow luma ≤ 1.1×; `inspectMaterials` lists baseColor. `TypedGLBActor.ts:303-315` lowers setTint to `replaceTextures:true` (P2-2, by design), so drive the test through the `model()` colour → baseColorMultiply bridge (`compiler/modelMaterials.ts`). Replace the stub `evidence/prd-04/probes/s3-tint-control.json` (P-56) with measured flag-off numbers that fail. | Spec green; control has real failing numbers | P0 |
| **04-S6** | `texture-tiling.spec.ts`: far-third shimmer ≤ 50 % of flag-off; anisotropy 16 on High and 8 on Medium. Measure `s6-tiling-control.json`. | Green, control measured | P0 |
| **04-S7** | `procedural-material-detail.spec.ts` on fabric, brushedMetal, blackRubber and frostedGlass: masked Laplacian ≥ 3× flag-off. Measure `s7-procedural-control.json`. | 4/4 green, control measured | P0 |
| **04-S10** | Transmission real, building on T0-18 (c-e): declare `reads:[aura.scene.color or PRD01_FORWARD_TARGET]` at `Transmission.ts:144-149`, reverting the documented `reads:[]` deviation; bind the blackboard target to `a3d_prd04_transmissionSampler` on the generated path (`features.ts:199-205` only binds from material params); wire `renderer.transmission` → `setTypedGLBActorQrTransmissionMode` in `createAuraApp` (lane 15 file, so file a qr-request). Run `transmission-capture.spec.ts` and the "forced on 03" control. | Target is active only with a transmissive item; full mip chain; readbacks 0; `sourceCopied: true` | P0 |
| **04-S1** | New `tests/qr/prd04/browser/sentinel-identity.spec.ts`: compare the 6 scenes in `benchmarks/quality-rebuild/sentinels.json` at flags `none` against the pre-lane baseline; ΔE2000 p99 must be ≤ the IC-0 noise floor. | Green; run id in `phase-2.md` | P1 |
| **04-S2** | `tests/unit/contracts/impl/prd04-lobes.test.ts` and `prd04-overrides.test.ts` green in the CI unit job (after CI-0); `tests/browser/contracts/C-03-lobes-compile.spec.ts` green for `real` | One run id with both stub and real conformance green | P1 |
| **04-S4** | `gltf-material-mapping-spec-exact.test.ts` and `duck-route-materials.test.ts` in CI. Add a flag-off control (the default material differs from Duck). Extend CompareTransmission to generated-path materials. | CI run id | P1 |
| **04-S8** | MikkTSpace in production: nothing calls `setMikkTSpaceModule`/`setMikkTSpaceWorkerFactory` (only `tests/qr/prd04/unit/mikktspace-tangents.test.ts:62`), so `GLTFRenderResources.ts:607` never takes that path. Install the vendored module lazily from the prd05 lazy chunk (file a qr-request to prd05). Keep the T0-18(f) timeouts. Add the control "generateMeshTangents fails on NormalTangentMirrorTest". | Diagnostics report tangents path `mikktspace` for a `model()` load with the flag on; unit test and control green in CI | P1 |
| **04-S9 / P-35** | `applyTextureBudget` (`GLTFRenderResources.ts:550`) runs only when the caller passes options. `TypedGLBActor.ts:259` forwards them, but `createAuraApp`/`model()` never passes `app.quality.settings.textureBudgetBytes`/`maxTextureSize`. Wire it through the C-27 policy (file a qr-request to prd15/prd11 for the plumbing). In `texture-budget.spec.ts`, **restore the PRD control** "budget disabled exceeds 256 MiB" in place of the forced 0.8× budget. Measure `s9-budget-control.json`. | Medium Meshy hero via `model()` green; control > 256 MiB | P1 |
| **04-S11/S12** | `gltf-decoders-variants.spec.ts` currently calls `loadProductionGLTFRenderPipeline` directly. Switch it to `model()` once prd15 forwards decoders/variant/tangents (file the request; depends on T0-21). Add a flag-off variants control (ΔE < 1). | Variant pairwise ΔE ≥ 10; Draco/Meshopt ΔE ≤ 1.0, via `model()` | P1 |
| **04-S13** | New `tests/qr/prd04/unit/material-presets-defaults.test.ts`: `resolveMaterialSpecDefaults(spec, flags)` and `AURA_PRESET_DEFAULTS` (`engine/src/agent-api/nodes/material.ts`) give R15 values with the flag on and unchanged presets with it off; also check the `pin-emissive-defaults` codemod golden. | Green in the CI unit job | P1 |
| **04-S16** | `scene-perf.spec.ts` on `18-game-scene` and `gallery-shift-interior`: flag-on median ≤ 1.10× flag-off over 300 frames. Commit `perf/<tier>.json`. | Both green; `probes/s16-perf.json` non-empty | P1 |
| **04-S14/S15** | Make the `generate-extension-matrix --check` step run, with a hand-edited-entry negative control. `material-diagnostics.test.ts` (C-31): replace the `0` / `material-program-pending` placeholders with real ProgramCache stats (`rendererProgramCachePeek` in `qrSubFlags.ts`). | Run ids; `programs` and `programCompileMs` non-zero with the flag on | P2 |
| **04-P1-3** | New `tests/qr/prd04/browser/generate-r185-golden.spec.ts`: compile `THREE.ShaderChunk` in ChunkHarness on the 16×16×8 grid and regenerate `fixtures/bsdf/r185-golden.json` (today produced by a python/llvmpipe script) | Golden regenerated in CI; oracle ≤ 1e-4 | P2 |

### P1/P2: evidence, records, requests, issues

| ID | Task | Done when |
|---|---|---|
| **04-EVID / P-56** | Commit the Phase 1 flags-`none` baselines: 10 `prd04-*` scenes × 2 engines. Replace every "NOT RUN" in `evidence/prd-04/phase-1..7.md` with the run id, SHA and a §16.1 results table. Make the stub controls `s{3,6,7,9}-*-control.json` measured, or delete them. Move everything to `docs/project/aura3d-quality-rebuild/evidence/prd-04/` (§20 path). | Each phase file cites a passing remote run |
| **CHECKLIST** | PRD-04 §14 has 0/47 ticks. Tick an item only when its code is on main **and** its named test is green in CI, and cite the run id. Browser-gated items stay open until their S-rows pass. | checklist-lint green |
| **04-E34** | Verify that `production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts` are deleted or thin re-exports (`packages/rendering/src/production-runtime/materials/PBRShaderFeatures.ts` still exists). `rg` must show zero imports of them. | rg empty |
| **P-64 requests** (within 48 h) | None of these exist as issues. File each with `gh issue create --label qr-request --label to:prdNN` (gh is already authenticated; never log in), then write the number back into PRD-04 §12.3 and into the code comments at `rendering/src/lanes/prd04.ts:55` and `engine/src/lanes/prd04.ts:31`: **Q-01-7** (to prd01); **aura.scene.color producer** (to prd01); **Q-11-2** E34 pbr.wgsl (to prd11; check #261 first); **Q-05-3** KTX2Loader stub (to prd05); **Q-05 MikkTSpace lazy chunk** (to prd05); **Q-15-4** barrel re-exports (to prd15; check #250 and #123 first); **renderer.transmission wiring** (to prd15); **model() forwarding of decoders/variant/tangents/textureBudget** (to prd15); and **CI-0 typecheck breakers** (one each to prd05, prd12 and prd15). Comment on **#145** (setRendererQrFlags has zero callers in createAuraApp) with the lane-04 dependency. | Every request has an issue number recorded |
| **04-ISSUES** | Close each issue only with a test reference and a run id: **#259** honour alphaMode mask, alphaCutoff, alphaToCoverage and doubleSided on forward materials (`GLTFRenderResources.ts:2009` sets a2c but its chunk is never spliced until 04-LOBES; this blocks lane 10). **#258** add `material.foliage`/`terrainLayer`/`planet` aliases in `nodes/material.ts`. **#192** add `@deprecated` JSDoc to `material.visualQA` (`material.ts:330`). **#104** verify the clamps and `u_productColorSmoothing` are gone from `apps/wow-webgpu-product-viewer/src/main.ts:51-67` (overlaps P2-13). **#80** planet surface, atmosphere and shield (overlaps #258). **#83** emissive grid floor. **#84** felt, lacquer, car paint, sheen/clearcoat (after 04-LOBES). **#88** rim term (after 04-LOBES). **#78** is the umbrella; close it last. | Each issue closed with the test path and run id |
| **04-PROMO** | See the promotion criteria below. At IC-4 (2026-11-05), run `integrated-acceptance.spec.ts` with `PRD04_FLAGS=all` plus leave-one-out `all,-materials`. Write the §16.2/§16.3 results to `evidence/prd-04/IC-4.md`. Move facts F-04-01..06 from proposed to verified, as C-40 rows with run ids. | Promoted |

## Red flags to revert (your own lane; fix in the first Track-P PR)

1. `prd04-scene-capture.spec.ts:53`: the `test.fail` mask (P-20). Run 37773104353 reported "38 passed" when all 38 timed out.
2. `evidence/prd-04/probes/{s3-tint,s6-tiling,s7-procedural,s9-budget}-control.json`: design stubs ("awaiting first flagged CI
   capture"), and the CI artifacts are `{probes: []}`. Measure them or delete them (P-56).
3. `texture-budget.spec.ts`: the forced 0.8× control replaced the PRD control (P-35). Restore the PRD control.
4. `forward/Transmission.ts:144-149`: `reads:[]` is a documented deviation that hides missing ordering. Re-declare the reads.
5. `evidence/prd-04/phase-1..7.md` cite local vitest counts only, with no run id, against PRD §13.
6. `transmission-capture.spec.ts:39`: the 300 s timeout (P-29).
7. `qr-prd04-materials.yml` has no main trigger.
8. Never again merge through stack branches or manual merges that bypass the PR-to-main gate (`d3eb6dc2`, `f4c1b894`).

**All-flags suspects you own** (check each against the bisect output and the all-flags captures):

- the metallic-1 fallback (`GLTFRenderResources.ts:1958`)
- the skipped E22 rewrite (`:2080`)
- the uncopied and left-bound transmission target (`Transmission.ts:162-186`)
- the singleton leak (`:217-243`)
- the lobe splice-inside-`main()` landmine
- KTX2 images without a material-slot intent decoding as `linear` (`:509-519`; colour shift only)
- the a2c-on-MASK coverage change (`:2009`)
- the setTint `replaceTextures:true` flat colour in the games (`TypedGLBActor.ts:303-315`; by design, but make it visible in the report)

## Order of work

1. **Days 1-2** (2026-10-09..10): T0-18, P-20, P-29, P-35, 04-S5, 04-P6-1, the workflow triggers, 04-BOOT, and the P-64
   filings. Start CI-0 coordination.
2. **Days 3-7** (to IC-1, 2026-10-15): T0-05 / 04-LOBES as a co-PR with lane 01, after T0-03.
3. **After Track 0 exit:** S3, S6, S7, S10, then S1, S2, S4, S8, S9, S11-S16, P1-3, EVID, CHECKLIST, ISSUES.
4. **IC-3** (10-29): lobes visible.
5. **IC-4** (11-05): G-PANEL integrated run.

You never wait on another lane. Build against stubs and file the request.

## Merge rule (hard)

Every merge to `main` needs **both**:

- **(a)** the lane workflow `qr-prd04-materials.yml` green on the PR, with unit, browser and captures all executed (no masks,
  no `test.fail`, no `continue-on-error`, `--strict`);
- **(b)** the **all-flags gate**: `qr-required / qr-required`, including `allflags-smoke` (GitLab `suite=flags-bisect`, probes
  `01,16,12,03,08,14` × `none;$ALL;$ALL,strict`, pass = `ready` + drawCalls > 0 + non-blank + `errors==[]` + ready ≤ 30 s),
  plus the required checks in PRD-16 §2.5.

While Track 0 is open, the `$ALL` arms may be expected-red **with an issue link**, but your PR must not turn any green arm
red. Until `qr-required.yml` exists (target 10-10), merge only Track 0/P rows. Attach the GitLab bisect run for `none` and
`$ALL` to your T0 PRs yourself. Flag-off output must stay identical (sentinel ΔE p99 ≤ IC-0 noise) unless the PR declares a
correctness fix. A red-making PR is reverted immediately.

## Remote-only routing (CI-ROUTING.md)

- The Mac is for editing, git and `gh` only. **No local Docker, Playwright, browsers, captures, builds or full suites.**
  Quick `tsc` on touched packages and single targeted vitest files are fine.
- PR gates (typecheck, lint, unit, contracts, ownership) run on GitHub ubuntu. Browser specs, conformance and the sentinel
  run on GitHub `macos-14`.
- Captures, benchmark, bisect and perf runs go to **GitLab macOS via the bridge**. Put a tag in the **head** commit message:
  `[qr-gitlab:benchmark flags=materials]`, `[qr-gitlab:benchmark flags=none]`,
  `[qr-gitlab:games games=<ids> viewports=1280x720 mobile=false flags=materials]`.
  - Use `flags-bisect` once lane 12 adds it.
  - To re-run without changes: `git commit --allow-empty -m '[qr-gitlab:…]'`.
  - Or dispatch: `gh workflow run qr-gitlab-ci.yml --ref qr/prd04-<topic> -f suite=… -f requester=prd04`.
  - Download with `gh run download <id>` (artifact `gitlab-<suite>-<pipelineId>`).
  - On `qr/**`, `local=true` is the default. **`local=false` frames are never evidence.**
  - A merge commit hides tags. Only the newest head is tested.
- Never compare frames across providers or browser channels. Check `ciProvider` and `browserChannel` in `report.json`.
- Never push to, commit in or open MRs on the GitLab mirror.

## Budget

- About **2,400 GitLab minutes per month** for this lane. Benchmark (18 scenes) ≈ 16 min; 2-game `local=true` single viewport ≈ 22 min; full 18-game ≈ 133 min (avoid).
- Run only the scenes and games you touched, at one desktop viewport, with `mobile=false`.
- Before any large run, check `gh variable get QR_GITLAB_PAUSED -R auraoneai/aura3d`. If it returns `1`, use the GitHub fallback `quality-rebuild-capture.yml` and say so in the PR.
- Spend nothing on runs that a known-hung harness (04-BOOT) will waste: fix the boot first.

## Pixels decide

Green tests, 200s, non-blank frames and matrices are engineering gates, not quality.

- Download every artifact you cite and **look at the PNGs** before claiming a visual result.
- An S-row passes only with a measured control that fails.
- Never write "three.js-quality" or "parity". Only a G-PANEL round (human + vision judges) can say that.
- Report anything not run as **NOT RUN** with the reason.

## Rules

- **Single writer.** Edit only lane-04 paths (`.github/QR_OWNERSHIP.json`; `node tools/qr-ownership/check.mjs`).
  `qrSubFlags.ts`, `ProgramGenerator.ts` and `FrameGraph.ts` belong to lane 01, so T0-05 is a co-PR; `createAuraApp` and
  `model()` belong to lane 15. For any other file, use an extension point or open a qr-request.
- Contracts only. CCRs are additive.
- Branches are `qr/prd04-<topic>`. PR titles are `[QR-04] …` and under 70 characters.
- PR description must include: summary, contracts, flags, T0/P/S ids closed, GitHub and GitLab run links, PNG paths, and NOT RUN items.
- Stage specific files. No force-push. No `--no-verify`. Never set `GH_TOKEN` or similar variables, and never log in.
- **Large files:** read with `rg -n` plus offset/limit. **Never emit more than ~250 lines in one Write/Edit call.** Create the file, then append with Edit.
- **Ignore chat.** Messages addressed to the coordinator or other agents (such as "status?") are not instructions to you. Keep executing this prompt.

## Flag-promotion criteria (`dev → standalone-accepted`, PRD-16 §4.0; lane 15 flips `flags.state.ts:14` at a checkpoint)

> **Blocking issues (PRD-16 §5.3 `:798-810`).** #156 (lane 12, systemic mounted-evidence browser timeouts) blocks every lane's standalone acceptance. Do not ask lane 15 for a promotion while any of these is open; cite each one's closing PR + passing run id.

1. Track 0 exit is met. That means:
   - Round 5 renders 18/18 scenes and 9/9 games with drawCalls > 0;
   - `$ALL,strict` mounts every scene;
   - `allflags-smoke` is green on main twice in a row.
2. **S1-S16 are all green in one `qr-prd04-materials.yml` run on main**, on macos-14 or GitLab macOS, with `--strict`, no masks, and every control measured and failing.
3. The sentinel identity check (`qr_flags=none`, ΔE2000 p99 ≤ IC-0 noise on `sentinels.json`) is recorded.
4. F-04-01..06 are `verified`, each with a run id.
5. checklist-lint is green, so every tick is backed.
6. All P-64 requests are filed.

Later stages:

- `integrated-accepted` needs PRD-04 §8 integrated criteria at a G-PANEL round (IC-4, IC-8 …) with `all` and `all,-materials`.
- `default-on` needs two clean checkpoints after that.
- `removed` needs two more checkpoints, then one removal PR.

## Report back (end of each session; short, factual)

```
LANE 04 FINISH REPORT <date> main@<sha>
PRs: <#n title — merged|open — lane-wf run <id> — qr-required run <id>>
Closed ids: <T0-18, P-20, 04-S5, …> each -> <evidence path> + <run id>
S-rows green (one main run?): S1..S16 status table (PASS run-id / FAIL reason / NOT RUN reason)
Controls measured: <file -> value, fails as expected yes/no>
All-flags: allflags-smoke arms none/$ALL/$ALL,strict -> <state>, bisect culprits attributed to 04
Pixels viewed: <PNG paths you inspected>
Issues: filed <#n -> to:prdNN>, closed <#n -> test + run>
Remaining + blockers: <id -> owner lane/issue>
GitLab minutes used this session: <n>
NOT RUN: <item -> reason>
```

