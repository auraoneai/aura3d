# Lane ec (E-C, WP-3 post) report

- Branch: `gu47/ec` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ec`)
- Base commit: `f797808be` (`gu47/integration` = main 4.6.1 + swarm plan)
- Wave: 1 (phase 1, code only; no browsers, no remote runs)
- Contract: PRD lines 179-200; checklist 397-407; owned files PRD §4.1 E-C row (line 319) plus `packages/aura3d-cli/src/cli-help.ts`

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| EC-1 HDR grade writer | M | done | 42fa9a48d | `resolveHdrGradeUniforms` + `HDR_GRADE_GLSL` (`post/shaders/hdrGrade.glsl.ts`) write `u_whiteBalance, u_lift, u_gamma, u_gain, u_shadows, u_midtones, u_highlights` from `pipeline.grade`; folded into the S8 exposure draw when auto-exposure runs, else one S10 draw; an identity grade adds no draw. `tests/unit/gu47/ec/hdr-grade-and-stage-trace.test.ts` (17 pass). Receipt `effects-white-balance`: phase 2. |
| EC-2 LUT + `--type lut` | M | done | 8cbd585d7 | `colorGrade({ lut })` takes `AuraLutAssetRef` (local stand-in for `AuraAssetRef<"lut">`) or a URL; `pipeline.lut` → `parseCubeLut` → `DisplayLutCache` (LRU) → `u_hasLut = 1` in S10b and the fused FXAA finalize. CLI `assets add <file.cube> --type lut` (`admission/cubeLut.ts`); help lists `lut` and E-A's `assets optimize --hdri <1k|2k> [--rgb9e5-cube]`. `tests/unit/gu47/ec/lut.test.ts` (15 pass). Receipt `effects-lut`: phase 2. |
| EC-3 AgX/neutral degrade removal | M | done (phase-2 capture confirms) | ea03b77fb | Own commit (default change; revert it alone if the phase-2 capture does not show AgX). The v2 OUT stage takes its operator from `pipeline.toneMapping` (`LegacyPost.createLegacyOutputPass`), so agx/neutral presets now render what they declare. `presetCapabilityDegraded` kept, always false, `@deprecated`. `prd03-post-presets.test.ts` (14 pass). |
| EC-4 stage trace | M | done | 42fa9a48d (+6a75c8efe, a9bcb27a5) | `recordPostStage` for S1, S3 (new), S4, CA, S6 (incl. `S6:dof-tilt-shift-rings3`), S7, S8, S9, S10, S10b, S11, S12 in `v2Stages.ts`. The all-effects check is in `effects-god-rays.spec.ts` (phase 2). |
| EC-5 runtime post control | M | done-interim (E-G) | e3fefb2ae | `app.post.setEffect` / `setEffectEnabled` for bloom, colorGrade, depthOfField, motionBlur, chromaticAberration, volumetricFog, vignette; per-app store applied by `createRootPostPipeline` on every derivation (the compiler derives each frame): no scene or shader rebuild. Grade, LUT, exposure, S4, S6, S7, CA, vignette, grain react today; bloom pass params and dropping the compiler-bag twins of bloom/DOF/MB need E-G's one-line hook (handoff 1). `tests/unit/gu47/ec/runtime-post-control.test.ts` (12 pass). |
| EC-6 S3 SSR | M | done (per-pixel roughness: blocked (E-D)) | 6a75c8efe | NEW `post/shaders/ssr.glsl.ts`: half-res trace on the S1 linear depth (normal from depth, 16/24/32-step view-space march + 4 binary steps, thickness test), TAA history reprojected through prevViewProj·inv(view) when valid, confidence = fresnel × edge/distance/facing fades × roughness gate (cutoff 0.5); zero confidence leaves the forward result, which carries the nearest probe's IBL. Runs between S2 and S4 only for an authored `screenSpaceReflections` node on a tier with S3 (no live app authors one). The forward pass has no roughness output, so the node's `roughness` applies frame-wide until E-D writes an MRT channel (handoff 5). `tests/unit/gu47/ec/ssr.test.ts` (11 pass, incl. glslang). Receipt `effects-ssr`: phase 2. |
| EC-7 selective bloom | M | partial; blocked (E-D) + unowned file | 3263f5684 | Done: weight math, `BLOOM_WEIGHT_GLSL` prefilter helper and CPU mirror in `NativeBloomPyramid.ts`; bridge sets `pipeline.bloom.selective` only when a material declares `bloom` ≠ 1 (all-default scenes unchanged). Not done: the HDR-alpha write (E-D forward shader, handoff 4) and the live prefilter read, which is `BLOOM_BRIGHT_EXTRACT_GLSL` in `webgl2/LegacyPost.ts`, a file no lane owns (PRD §4.1 placed the prefilter in `NativeBloomPyramid.ts`, which holds only planning math); handoff 6. `tests/unit/gu47/ec/selective-bloom.test.ts` (7 pass, incl. glslang). |
| EC-8 tilt-shift DOF, godRayDensity | M | done-interim (E-F) | a9bcb27a5 | S6 screen-space band CoC (`u_tiltShift`, w = 0 keeps the thin-lens path), S4 `u_density` from `godRayDensity` only (the fog density no longer rides in `pipeline.godRays`; S4 never read it); bridge, allowlist and runtime patch (`tiltShift` as `[bandCenter, bandWidth, angleDeg]`). Factory forwarding of the two options is E-F's (handoff 2); `app.post.setEffect` drives both today. `tests/unit/gu47/ec/tilt-shift-god-ray-density.test.ts` (13 pass, incl. glslang). |
| EC-9 tests, receipt specs, bundle delta | M | done (receipts: phase 2) | a5a7f425d | Unit tests per item (above). Receipt specs `tests/browser/gu47/effects-{white-balance,lut,god-rays,ssr,motion-blur,selective-bloom}.spec.ts` + harness `post-receipts.{html,ts}` + `post-receipts-lib.ts`, not run. Bundle delta below. |

## Decisions

- EC-3 shipped without the PRD's "after one capture" precondition (phase 1 has no captures); it is isolated in commit ea03b77fb so phase 2 can revert it alone.
- EC-5 semantics: `setEffect` merges field patches (validated against the effect's v2 allowlist; colour strings become RGB triples); `setEffectEnabled(false)` drops the effect, `true` restores it (authored node + patches, or defaults); a patch on an undeclared effect adds it. The authored `enabled` field on effect nodes is still not honoured (unchanged 4.6 behaviour). Without a canvas the bridge uses the most recently created-or-written app's store (exact for one app per page); E-G's hook passes the canvas.
- EC-8: `godRayDensity` is the GPU Gems 3 march fraction in (0, 1] (lower = shorter shafts); omitted = 1, today's full march. Tilt-shift `bandCenter` is measured from the top edge (0) to the bottom edge (1). WGSL DOF/god-ray twins are unchanged (WebGPU is out of scope, PRD §8).
- EC-6: S3 only for an authored node; the compiler-bag legacy `ssr` pass is depth-skipped (`WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED:ssr`) once S3 produced a pooled target, so it never double-runs.
- EC-7: the bridge duplicates the 3-line weight clamp instead of importing it because `@aura3d/rendering`'s index (unowned) does not export the new helpers.
- Ownership: no file outside the E-C row (plus `cli-help.ts` and the lane's tests) was edited.

## Handoffs

| # | to lane | file:symbol | change | why |
|---|---|---|---|---|
| 1 | E-G | `packages/engine/src/agent-api/compiler/postprocess.ts:createProductionRuntimePostprocess` | line 41 `const nodes = groups.flatten(snapshot.nodes);` → `const nodes = applyRuntimePostOverrides(groups.flatten(snapshot.nodes), attach?.canvas);` (import from `../postBridge.js`); pass `attach?.canvas` as the 7th argument of `createRootPostPipeline(...)` (line 306) | EC-5: bloom pass params, tone exposure and the legacy DOF/MB/SSR twins come from this bag; without it `setEffect("bloom", …)` and disabling bloom/DOF/MB do not reach pixels, and two apps on one page share overrides. Idempotent with the bridge. |
| 2 | E-F | `packages/engine/src/agent-api/nodes/effects.ts:depthOfField`, `volumetricFog`, `screenSpaceReflections` | forward `tiltShift`, `godRayDensity`, and for SSR `maxDistance`/`roughness`/`thickness` into the node bag (`...(options.x !== undefined ? { x: options.x } : {})`) | EC-8/EC-6: the factories copy fields explicitly; bridge, allowlist and shaders already read them. |
| 3 | E-D | `packages/engine/src/agent-api/nodes/types.ts:AuraAssetType` | add `"lut"`; then alias `AuraLutAssetRef` in `effects.post.ts` to `AuraAssetRef<"lut">` | EC-2 local stand-in. |
| 4 | E-D | `packages/rendering/src/ShaderLibrary.ts` forward fragment + material lowering (`compiler/customMaterial.ts` / `ModelMaterialOverrides.ts`) | for opaque (blend-off) materials output `alpha = u_bloomWeight` with `u_bloomWeight = resolveBloomWeight(material.bloom)` (`NativeBloomPyramid.ts`, default 1.0 so alpha stays 1 for every existing material) | EC-7 weight write. |
| 5 | E-D | forward pass MRT | optional roughness channel when `pipeline.ssr` is set; S3 then reads per-pixel roughness instead of `u_roughness` | EC-6 per-pixel cutoff. |
| 6 | integration (unowned file) | `packages/rendering/src/webgl2/LegacyPost.ts`: `BLOOM_BRIGHT_EXTRACT_GLSL` and the second prefilter (~line 2038), uniform writes at ~971/1085/1156/1170, bloom option stamping at ~3120/3161 | include `BLOOM_WEIGHT_GLSL`; in the `u_excess` path multiply `excessWeight` by `auraBloomWeight(source.a, u_bloomSelective)`; set `u_bloomSelective` from `options.selective === true`; stamp `selective: pipeline.bloom?.selective === true` next to `v2: true`; optionally filter the legacy `ssr` descriptor when `pipeline.ssr` (like DOF) | EC-7 live prefilter read (no lane owns LegacyPost.ts; E-C is the natural owner if integration assigns it). |
| 7 | E-G (optional) | `packages/engine/src/public/index.ts` | export `POST_RUNTIME_EFFECTS`, `applyRuntimePostOverrides`, `preloadPostLut`, `postLutsSettled` if wanted public | games use `app.post.*` / `colorGrade({ lut })`, which need no export |

## API as shipped

- `AuraPostSurface.setEffect(name: string, patch: Record<string, number | string | boolean | number[]>): void` (`contracts/post.ts`; `StubPostSurface` no-op; `Prd03PostSurface` real).
- `AuraPostSurface.setEffectEnabled(name: string, enabled: boolean): void`.
- `POST_RUNTIME_EFFECTS: Readonly<Record<string, string>>` = `{ bloom, colorGrade: "color-grade", depthOfField: "depth-of-field", motionBlur: "motion-blur", chromaticAberration: "chromatic-aberration", volumetricFog: "volumetric-fog", vignette }` (`postBridge.ts`).
- `applyRuntimePostOverrides<TNode extends AuraSceneNode>(nodes: readonly TNode[], canvas?: HTMLCanvasElement): readonly TNode[]`; `resetRuntimePostOverrides(): void`; `type RuntimePostOverrides`.
- `createRootPostPipeline(snapshot, camera, output, tierSettings, lights?, tierResolution?, canvas?: HTMLCanvasElement)` (new optional 7th parameter).
- `colorGrade({ lut?: AuraLutAssetRef | string, lutIntensity?: number, temperature, tint, lift, gamma, gain, shadows, midtones, highlights })`; `AuraLutAssetRef { kind: "aura-asset-ref"; id; type: "lut"; url; format?; hash?; sha256? }`; `AuraGradeRgb = number | [r, g, b] | { r, g, b }` (`effects.post.ts`).
- `postLutUrl(lut: unknown): string | null`, `preloadPostLut(url: string, cube: string): void`, `postLutsSettled(): Promise<void>`, `resetPostLuts(): void`, `PostPipelineLutBag` (`postBridge.ts`).
- Effect node fields (v2 allowlist): depth-of-field `tiltShift { bandCenter: number; bandWidth: number; angleDeg?: number }`; volumetric-fog `godRayDensity: number` (0.05..1); screen-space-reflections `roughness`, `thickness`.
- Rendering: `DofOptions.tiltShift?`, `GodRayOptions.density?`, `BloomOptionsV2.selective?` (`post/PostGraph.ts`); `godRayDensity(density: unknown): number`, `dofTiltShiftUniform(tilt): [number, number, number, number]`, `resolveSsrOptions(ssr: unknown): { intensity; maxDistance; roughness; thickness; steps: 16 | 24 | 32 }` (`post/v2Stages.ts`); `SSR_TRACE_GLSL`, `SSR_COMPOSITE_GLSL`, `SSR_ROUGHNESS_CUTOFF`, `SSR_DEFAULT_STEPS`, `SSR_DEFAULT_THICKNESS` (`post/shaders/ssr.glsl.ts`); `BLOOM_WEIGHT_DEFAULT`, `BLOOM_WEIGHT_MAX`, `resolveBloomWeight(value: unknown): number`, `selectiveBloomActive(weights: Iterable<unknown>): boolean`, `BLOOM_WEIGHT_GLSL`, `bloomPrefilterExcess(rgb, alpha, threshold, softKnee, selective)` (`postprocess/NativeBloomPyramid.ts`); `resolveHdrGradeUniforms`, `resolveWhiteBalance`, `applyHdrGrade`, `HDR_GRADE_GLSL` (`post/shaders/hdrGrade.glsl.ts`); `DisplayLutCache` LRU bound.
- Stage names: `S3:ssr-<16|24|32>[:history]`, `S6:dof-tilt-shift-rings3`, plus EC-4's set.
- CLI: `AuraCliAssetType` gains `"lut"`; `aura3d assets add <file.cube> [--type lut]`; `validateCubeLut` (`packages/aura3d-cli/src/admission/cubeLut.ts`).
- Deprecated: `presetCapabilityDegraded` (always false).

## CHANGELOG text for WP-38

- Post: `effects.colorGrade` temperature/tint/lift/gamma/gain/shadows/midtones/highlights now reach pixels through a linear HDR grade folded into an existing draw; `colorGrade({ lut })` binds a `.cube` LUT (`aura3d assets add grade.cube --type lut`).
- Post: presets that declare AgX or Khronos PBR Neutral tone mapping now render that operator instead of ACES.
- Post: `app.post.setEffect(name, patch)` and `app.post.setEffectEnabled(name, enabled)` change bloom, colour grade, depth of field, motion blur, chromatic aberration, volumetric fog and vignette at runtime without rebuilding the scene.
- Post: screen-space reflections run as a real v2 stage (half-resolution depth march, history reprojection, fade to the reflection probe, roughness cutoff 0.5) for scenes that add `effects.screenSpaceReflections()`.
- Post: depth of field gains a tilt-shift band mode (`tiltShift: { bandCenter, bandWidth, angleDeg }`); volumetric fog gains `godRayDensity`, separate from the fog density.
- Post: `diagnostics().post.stagesRan` lists every v2 stage that ran (S1, S3, S4, chromatic aberration, S6, S7, S8, S9, S10, S10b, S11, S12).
- Selective bloom (per-material `bloom` weight) ships its weight math and pipeline flag; the shading-side write lands with the materials work. All numbers in the receipts are software WebGL2.

## Phase-2 capture plan

Remote runner only: `RUN_ID=gu47-ec-receipts SPECS='tests/browser/gu47/effects-*.spec.ts' tools/remote-acr/run.sh`, then `node tools/receipts/extract-from-acr-log.mjs <acr-run.log>` to write `evidence/receipts/<name>/` (PNG pair or triple + `<version>.json`).

| Receipt | Frames | Acceptance |
|---|---|---|
| effects-white-balance | wb-neutral, wb-warm | mean R/B shift ≥ 0.08; `S10:hdr-grade*` traced |
| effects-lut | lut-off, lut-teal-orange | mean \|dRGB\| ≥ 6; no `LUT_*` skip reason |
| effects-god-rays | god-off, god-on, god-density-half, all-effects | S4 traced; mean luma up; density pair differs; all-effects `stagesRan` has S1, S3, S4, CA, S6, S7, S9, S10, S10b, S12 |
| effects-ssr | ssr-off, ssr-on | S3 traced only when on; floor-under-crate mean \|dRGB\| ≥ 1 |
| effects-motion-blur | mb-off, mb-on | S7 traced; changed fraction ≥ 0.002 |
| effects-selective-bloom | bloom-off, bloom-selective | lamp region mean luma +2; wall region p95 ≤ 3 (after handoffs 4 and 6) |
| AgX (EC-3) | any `daylight-outdoor` / `cinematic-film` preset scene before/after ea03b77fb | highlights roll off as AgX (not ACES); revert ea03b77fb alone if not |

Thresholds may be tuned once against the first software-WebGL2 run; never loosened to pass a broken effect.

## Verification

- Base suites (before the first edit, `f797808be`): 54 post/render files: 513 passed, 3 skipped, 0 failed; 5 CLI files: 77 passed, 0 failed (predecessor run).
- Branch (this lane, after the last commit): `tests/unit/gu47/ec/*` 6 files, 75 tests pass (hdr-grade 17, lut 15, runtime 12, tilt-shift/god-ray 13, selective-bloom 7, ssr 11); touched-code regression files all pass: prd03-post-presets (14), prd03-post-bridge (14), prd03-post-diagnostics (7), prd03-phase3 (12), prd03-s18c-custom-passes (7), e2-wave3-post-handoffs (12), shader-pass-order (19), prd03-s15-dof-shader (4), prd03-v2-glsl-compile (70, 1 skipped; glslang installed), prd03-t0-15/16/17, pcpost-post-graph-migration (21), prd03-screen-feel (8), prd10-underwater-post (4), prd03-post-quality-tiers (15), prd03-post-graph (7), prd03-post-graph-order (3), production-runtime-postprocess (1), e2-ssao-stage-trace (2), native-bloom-pyramid (9), bloom-fusion-select (17), bloom-pass-fusion (3). No test that passes on the base fails on the branch.
- Final run after the last product commit: the 6 ec files + 13 touched suites = 19 files, 250 passed, 1 skipped; plus optionCoverage (2), t0-07-post-skipped (2), webgpu-custom-pass (12), prd10-ready-attribution (4), prd02-builders (20), contact-shadow-mask (37): all pass.
- Lint: `eslint` clean on every touched file (product, unit tests, browser specs).
- Typecheck delta (`bin/typecheck-delta.mjs`, final): 58 errors (baseline 58), `NEW_ERRORS 0`. (The mid-lane run flagged 32 errors, all in the new tests reading the `unknown`-typed v2 bag; fixed in a3ddd1c46.)
- Bundle size (`tools/bundle-size/index.ts`, base `f797808be` vs branch head; every budget already failed on the base, none raised): core critical path 4,187,080 → 4,192,397 bytes (+5,317), gzip 1,229,214 → 1,230,925 (+1,711); deferred v2 chunk gzip 1,623,940 → 1,628,443 (+4,503); product-viewer gzip +1,716; cinematic-scene gzip +1,718; mini-game gzip +1,729. `BUNDLE_SIZES.md` was regenerated by the check and restored (not this lane's file).
