# PRD-03 Phase 3 evidence — GTAO S2, GPU god rays S4, readback removal

Branch: `devin/qr-prd03-phase3-ao-godrays`. Flag `A3D_QR_POST` (+ opt-outs
`A3D_QR_POST_AO`, `A3D_QR_POST_GOD_RAYS`, `A3D_QR_POST_CA`,
`A3D_QR_POST_VIGNETTE`, `A3D_QR_POST_FILM_GRAIN`). Flag-off rendering
byte-identical (all new paths behind `postFlagOn()`/sub-flag selects).

## What landed

- GLSL: `post/shaders/{depthDownsample,gtao,gtaoDenoise,godrays}.glsl.ts`
  per §8.3–8.5; `post/v2Stages.ts` drives S2 (half-res GTAO + 4-dir
  bilateral denoise) and S4 (inverse-square attenuation + height fog,
  depth-tested against S1 miniMaxDepth).
- `post/chunks/indirectFraction.glsl.ts` (`a3dWriteIndirectFraction`)
  registered in `lanes/prd03.ts`; select honours `A3D_QR_POST_AO:false`
  and runs forward-only.
- AO bridge: `radius` interpreted in metres flag-on (§6.3); authored
  `contactOcclusion` → `ambientOcclusion({radius:0.2})`; two AO nodes →
  `POST_DUPLICATE_STAGE`; GTAO allocated only when a native depth target
  exists (`postprocessRequiresDepthTexture` extended for v2 pipelines).
- `effects.volumetricFog` flag-on → S4 god-rays bag (`color` +
  `lightUv`/`lightDirection` from the strongest directional);
  `compiler/postprocess.ts` stops emitting the legacy `volumetric-light`
  pass on the strict route.
- New node factories `vignette`, `filmGrain`, `chromaticAberration`
  (§6.9); bridge maps them to `pipeline.{vignette,filmGrain,
  chromaticAberration}`; executed GPU-side in S10/S10b/S12.
- `POSTPROCESS_PASS_NOT_GPU`: pixel-only plans throw flag-on unless
  `execution:"cpu-deterministic"`; production builds skip instead and
  record `POST_PIXEL_PASS_SKIPPED:<pass>` in `post.skipped`.
- CPU kernels moved to `packages/rendering/src/reference/` (PostProcessPass,
  EffectComposer, SSAOPass, cinematic Bloom/Vignette/FilmGrain/DepthHaze);
  old paths are `@deprecated export *` shims. `prd03-post-bundle-split`
  asserts the v2 chunk never imports `reference/`.
- `RendererPostprocessPlan`: flag-on drops `contact-shadow` +
  `POST_PASS_DEPRECATED:contact-shadow` clarity warning.
- `cameraFrame` bound on both render paths (sync + async) → S4 needs it
  for `lightUv` (CCR-03-9, F-03-18).
- `tests/browser/qr-prd03-post-no-readback.spec.ts` + harness: 300
  flag-on frames on a post-heavy scene asserting 0 device readbacks and
  0 raw `gl.readPixels`.

## Unit results

`tests/unit/contracts/impl/prd03-phase3.test.ts`: 12/12
`tests/unit/contracts/impl/prd03-*` total: 115/115
`renderer-postprocess-plan`: 21/21 · `production-runtime-postprocess`: 1/1
`prd03-post-bundle-split`: 3/3 (incl. reference/-import assertion)

Pre-existing reds on main (verified identical without this diff):
`rendering/renderer.test.ts` 24 WebGPU fails, `runtime-edge-coverage` 2.

## NOT RUN / pending

- Browser specs run remote-only per lane rules; AO/god-ray scene
  acceptance (contact-edge ≤0.75 / open ≥0.97; shaft ≥3% / occluded
  ≤0.5% luma) awaits the remote browser suite — `prd03-*` scene routing
  gap QR-03-2 still open (lane 12).
- `rgba32f`/`rgba8` substitutes for R32F/RG32F/R8/RG16F pending QR-03-11
  (lane 11 TextureFormat extension).
- 18-game 0-readback sweep: local spec proves the invariant on a
  post-heavy scene; the full sweep runs in the remote games suite.

See `qr-requests.md` for the CCR/cross-lane ledger.
