# PRD-03 Phase 7 evidence — WGSL twins (§8.18, Q-11-2 inputs)

Branch `devin/qr-prd03-phase7-wgsl`, flag `A3D_QR_POST` (flag-off
byte-identical — the `.wgsl.ts` files are unreferenced twin sources; the
`WebGPUPostShaders` edits are flag-gated).

## Checklist (§14 "Phase 7")

- A WGSL mirror for each `post/shaders/*.glsl.ts` in `post/shaders/*.wgsl.ts`
  — 16 files, 34 entry modules + shared `POST_COMMON_WGSL`:
  - `depthDownsample` S1: `DEPTH_LINEARIZE_WGSL`, `DEPTH_MINMAX_HALF_WGSL`,
    `CAMERA_VELOCITY_WGSL` (jittered/unjittered reprojection velocity).
  - `gtao` S2 main pass; `gtaoDenoise` H/V 5-tap gaussian×exp-depth
    (`BILATERAL` chunk) + `GTAO_APPLY_WGSL` fused joint-bilateral upsample +
    §6.3 multiply (`ao_indirect_fraction` uniform replaces the GL twin's
    `AURA_AO_INDIRECT_FRACTION` define — one module, runtime select).
  - `godrays` S4 half-res light-shaft march (`override
    AURA_GODRAY_SAMPLES = 32` — GL's `#define` → pipeline-overridable
    constant; same pattern for `DOF_RINGS=3`, `MB_TILE_SIZE=16`,
    `AURA_GTAO_DIRECTIONS=4`, `AURA_GTAO_STEPS=4`).
  - `taa` S5 resolve (closest-depth 3×3 reprojection, Catmull-Rom history,
    YCoCg μ±γσ clip, 0.1·z disocclusion, reactive-mask/luma-delta proxy,
    Karis HDR weights) + `TAA_UPSCALE_WGSL` 9-tap Blackman-Harris.
  - `dof` S6: half-res prefilter (thin-lens CoC, sky pin), 8px near-field
    tile-max, Vogel-disc gather (`override DOF_RINGS`), smoothstep composite.
  - `motionBlur` S7: MB_TILE_MAX/NEIGHBOR/RECONSTRUCT (IGN jitter, 0.05 m
    depth compare); `velocityDilate` closest-depth 3×3 dilate.
  - `exposure` S8: `EXPOSURE_LUMA_LOG_WGSL` (4×4 block, centre-weighted),
    `EXPOSURE_REDUCE_WGSL` (box to 1×1), `EXPOSURE_ADAPT_WGSL` (EV ping-pong,
    `has_prev` boot-to-target; WGSL-reserved `target` → `target_ev`),
    `EXPOSURE_MUL_WGSL`.
  - `composite` S10 (`c = hdr · exposure · autoExposure` + radial CA + bloom
    + Bradford/LGG/SMH grade) + `CA_PASS_WGSL` transitional 3-tap.
  - `displayGrade` S10b (`apply_display_grade` shared in
    `POST_COMMON_WGSL`) + `LUT_BAKE_WGSL` (`disp = vec3(uv, slice)` grid
    colour; contrast-pivot-0.5 + vibrance→sat fold + optional user `.cube`
    mix, verbatim).
  - `fxaa` r185 verbatim (`FXAA_185_FNS_WGSL` shared fn set). GLSL macro
    hooks become consumer items: `AURA_FXAA_SAMPLE` → consumer-defined
    `fn fxaa_sample(...)`; `AURA_LUMA_ALPHA` → `override FXAA_LUMA_ALPHA`
    (0 standalone, 1 fused — luma in `.a` written by S10b grade);
    `AURA_FXAA_NO_DITHER` → `override FXAA_NO_DITHER: bool`.
  - `finalize` S12 (luma-gated grain + FSR1 RCAS ≤0.25 + triangular dither)
    + `FINALIZE_FXAA_FUSED_WGSL` (§6.1 fuse: FXAA taps sample through the
    module's `fxaa_sample` = graded fetch — LUT + vignette inline).
  - `smaa` S11: `SMAA_EDGES_WGSL`/`SMAA_WEIGHTS_WGSL`/`SMAA_BLEND_WGSL` —
    verbatim r185 (three's vertex-varyings recomputed fragment-side; the
    AreaTex/SearchTex PNGs are shared with the GL tail — `post/smaa/textures.ts`
    decodes once per backend).
- `webgpu/WebGPUPostShaders.ts` (§Phase 7 assigns it to lane 03; the
  ownership map still reports 11 — the audit prints owners, non-blocking):
  - `webgpuColorGradeFragment` flag-on emits `color * u_grade.exposure`
    (linear multiplier = three `toneMappingExposure`, §6.4); flag-off keeps
    `exp2(u_grade.exposure)` byte-for-byte.
  - `normalizeWebGPUColorGradeOptions` flag-on defaults `exposure ?? 1`
    (linear identity); flag-off `?? 0` (EV identity).
  - `webgpuFxaaFragment` + `webgpuSoftKneeWeight` flag-on throw
    `POST_WGSL_LEGACY_REMOVED:<symbol>` — the §8.18 deletion error until
    Q-11-2 execution lands (`WebGPUDevice.executeWebGPUFxaa` propagates it
    to the app).

## Tests / gates

- `tests/browser/qr-prd03-wgsl-compile.spec.ts` +
  `qr-prd03-wgsl-harness.{ts,html}` — the §8.18 exit gate:
  `createShaderModule().getCompilationInfo()` for all 35 assembled modules,
  zero `type === "error"`. PRD names `tests/qr/prd03/wgsl-compile.spec.ts`;
  `tests/qr/` resolves to lane 15 under the ownership map, so the spec sits
  beside the other `qr-prd03-*` lane specs and runs in post-quality.yml's
  browser job (added this PR: `qr-prd03-wgsl-compile.spec.ts` step +
  `qr-prd03-*harness.*` path filter).
- `tests/unit/contracts/impl/prd03-post-wgsl-compile.test.ts` — naga
  30.0.1 wasm-twin parse gate (`naga <module>.wgsl`): **all 35 modules
  validate clean** (also exercised in-session: `naga` on every assembled
  module → `Validation successful`). Skips the naga leg when the binary is
  absent; the structural assertions (35 modules, `@fragment`/`fn fs_` per
  entry) always run.
- `tests/browser/qr-prd03-phase6-{harness,spec}` + a `taauProbe` appended to
  `qr-prd03-phase4-{harness,spec}` — backfills the unshipped browser-test
  obligations of the Phase-4 TAAU row (§8.6, renderScale 0.67 edge error
  ≤ 1.3× full-res) and the Phase-6 rows (§8.14 SMAA edge metric, §8.9
  bright→dark EV convergence ≤ 1.5 s + zero engine `readPixels`, §6.12
  `before-tonemap` HDR gate + `after-tonemap` invert readback). PRD
  checklist items for Phases 4–7 are now all ticked.
- `tests/unit/contracts/impl/prd03-post-webgpu-wgsl.test.ts` — 3 tests:
  flag-off byte-for-byte (`exp2`, `fs_fxaa`, `exposure ?? 0`); flag-on
  linear multiplier (`color * u_grade.exposure`, `?? 1`); flag-on deletion
  errors (`POST_WGSL_LEGACY_REMOVED:webgpuFxaaFragment|webgpuSoftKneeWeight`).
- `prd03-post-bundle-split.test.ts` — all 16 `post/shaders/*.wgsl.ts` pinned
  in `DEFERRED_ONLY_INPUTS` (never on the flag-off critical path; lane-11
  imports them via its own Q-11-2 chunk).
- Typecheck clean, eslint 0 errors on touched files, unit suite green.
