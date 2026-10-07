# PRD-03 Phase 2 evidence — PostGraph, HDR ordering, bloom V2, display LUT

Branch `qr/prd03-phase2-graph` · flag `A3D_QR_POST` · flag-off byte-identical.

## Landed

- `post/PostGraph.ts` §6.1 stage descriptors (`POST_STAGE_DESCRIPTORS` —
  S1/S2/S3/S4 ph3, S5/S6/S7 ph4, S8 ph6, S9/S10/OUT/S10b/S11/S12 ph2),
  `planPostGraph` (`post-v2-deferred:phase-N` / `disabled` reasons),
  `validatePostPassSpace` → `POSTPROCESS_SPACE_INVALID:<id>`.
- `post/PostResources.ts` — `(w,h,format,samples)` pool over the C-28 slot.
- `post/CubeLut.ts` `parseCubeLut` (LUT_3D_SIZE/DOMAIN_MIN/MAX/comments;
  throws `CUBE_LUT_1D_UNSUPPORTED`/`CUBE_LUT_SIZE_INVALID`/`CUBE_LUT_MALFORMED`)
  + `tests/qr/prd03/fixtures/luts/teal-orange-33.cube` (33³).
- `post/shaders/` — `bloom.glsl.ts` (§6.6 prefilter/down/up),
  `composite.glsl.ts` (S10), `displayGrade.glsl.ts` (+`LUT_BAKE_GLSL` S10b
  33³ RGBA8 TEXTURE_3D), `finalize.glsl.ts` (S12 grain+RCAS+dither;
  `FINALIZE_FXAA_FUSED_GLSL` reads luma from `.a`).
- `postprocess/NativeBloomPyramid.ts` `bloomNormalization(mips,scatter) =
  1/mips` (additive energy-conserving; flag-off `resolveBloomPyramidResponseGain`
  untouched).
- `webgl2/LegacyPost.ts` — `normalizeNativeBloomOptions` §7.2 carve
  (threshold [0,64], knee [0,1] → `softKnee=min(0.5,threshold*knee)`, radius→
  scatter, `softKnee ≤ 0.5` throw dropped flag-on only); `createLegacyOutputPass`
  (C-05 OutputPass adapter); `executePostGraphWebGL2` (CCR-03-5 transitional —
  delegates to `presentLdrPostprocess`, fused passes only).
- `renderer/PostprocessExecution.ts` `tryExecutePostGraphV2` — v2 + webgl2 +
  pipeline + fused-guard; the ONLY `import("../post/v2Entry.js")` edge
  (async path passes the deferred module bag; sync path runs without it).
- `agent-api/postBridge.ts` — `POST_EFFECT_FIELDS` / `POST_EFFECT_DEPRECATED_FIELDS`
  / `validatePostEffectNode` (§7.1, `postAuthored`-keyed), `mapBloomOptionsV2`
  (§6.6 + `BLOOM_THRESHOLD_BELOW_HDR_WHITE`), `createRootPostPipeline` (CCR-03-5;
  `AuraRuntimeError("POST_FIELD_UNSUPPORTED")` inside compile → `app.ready()`
  rejects; flag-off `option-ignored:<effect>.<field>` warnings). `compat.post ===
  "3.0"` → legacy pipeline.
- `agent-api/index.ts` — additive `"POST_FIELD_UNSUPPORTED"` on the
  `AuraRuntimeError` code union (CCR-03-8, lane-15 boundary declared).
- `compiler/postprocess.ts` — flag-on calls `createRootPostPipeline`,
  `options.v2 = true`, strict-field throw.
- `post/v2Entry.ts` — deferred module barrel (bundle gate).
- `post/DisplayLutCache.ts` — §6.7 rebake-once-per-grade-key cache.
- `benchmarks/.../prd03/bloomMapping.ts` `mapThreeUnrealBloom` (FROZEN:
  intensity = 3×strength, knee = 0.01/threshold, scatter = radius, mips 5) +
  `bloom-mapping-calibration.md`; wired into `prd03-hdr-bloom` +
  `prd03-scene18-bloom` adapters.

## Gates (local)

- `pnpm typecheck:raw`: clean (only pre-existing `tools/threejs-parity-*` baseline errors).
- Unit: 102/102 in `tests/unit/contracts/impl/prd03-*.test.ts` — incl.
  `prd03-post-graph-order` (2^10 stage enumerations), `prd03-post-bundle-split`
  (real esbuild metafile: `post/shaders/*` + `v2Entry` in deferred chunks only),
  `prd03-post-bridge` (12: allowlist coverage, deprecated mappings, throw-rejects-
  ready, flag-off warn, v2 assembly), `prd03-display-lut` (rebake 1/60),
  `prd03-bloom-v2-normalize` (8: one per §7.2 mapping), `prd03-post-authored`
  (9: snapshot + byte-equal bridge), `prd03-bloom-normalization` (3).
- `node tools/qr-ownership/check.mjs`: all new files resolve to lane 03;
  `agent-api/index.ts` is lane-15 (CCR-03-8 declared).
- `pnpm check:bundle-size`: NOT RUN — broken on main since PR 0a (missing
  `@aura3d/rendering/contracts` esbuild alias — QR-03-3, lane-15's). The
  metafile assertion above runs the same esbuild+splitting+metafile machinery
  the gate uses.

## NOT RUN (remote-only per lane rules)

- `tests/browser/qr-prd03-post-lut.spec.ts` — 4096-step ramp LUT vs analytic
  grade ≤1 LSB + rebake count 1/60 (harness `qr-prd03-phase2-harness.ts`).
- `tests/browser/qr-prd03-v2-tone.spec.ts` — HDR ladder through the v2 route,
  `post.pipeline === "v2"`, `ToneOperators.aces` ≤1 LSB (proves single eval).
- Bloom halo browser check (constant HDR quad → bloom 1.0 ±3%) — deferred to
  the phase-3 GTAO captures lane; the ±2% TS-mirror unit check covers the math.
- ±10% halo-energy verification of `mapThreeUnrealBloom` — needs the GitLab
  capture lane (documented in `bloom-mapping-calibration.md`).

## qr-requests

- Q-12-2 — harness `aura3d/common.ts` bloom block can't carry v2 authored
  fields (knee/scatter/clampLuminance) → spec-transform workaround in the
  prd03 adapters (`qr-requests.md`).

## Appendix B

F-03-11 … F-03-17 (proposed, PR C) — stage table, CCR-03-5 pipeline bridge,
§7.1 allowlist + CCR-03-8 error code, compat.post, bundle gate, LUT bake,
frozen bloom mapping.
