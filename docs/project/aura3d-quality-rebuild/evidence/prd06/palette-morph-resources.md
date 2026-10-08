# PRD-06 evidence — palette + morph resources (PR B)

Scope: T0.10a `Texture.update`, T0.10 palette texture cache + cached uniform
bind, T0.11 in-place runtime palettes + `paletteKey`, C-18 chunk registration +
`buildMorphTargetTexture`, T0.14 deform light-view spec.

## Ran locally (this session's VM)

| Check | Result |
|---|---|
| `pnpm typecheck:raw` (`tsconfig.build.json --noEmit`) | PASS |
| `npx eslint` on all touched files | PASS |
| `tests/unit/rendering/texture-update.test.ts` | PASS 5/5 — 100 updates → 1 `texStorage2D`, 100 `texSubImage2D`, 0 `texImage2D`, 0 new handles; region rects forwarded; 2d-array `texStorage3D` once + per-layer `texSubImage3D`; legacy path unchanged |
| `tests/unit/rendering/skinning-palette-cache.test.ts` | PASS 6/6 — 100 frames × 2 skins × 191 joints → one texture pair per key, `createdThisFrame` 0 after frame 10, all disposed after release; swap rotates without alloc |
| `tests/unit/contracts/impl/prd06-deform.test.ts` | PASS 5/5 — C-18 slot returns stub flag-off / real flag-on; real cache conforms to `SkinningPaletteTextureCacheLike`; morph texture buckets {4,8,16,32}, stride 1–3, cpu fallback |
| `tests/unit/assets/gltf-skinning-palette-identity.test.ts` | PASS 3/3 — paletteKey + matrices identity stable across 10 frames, distinct per actor, joint world × IBM written in place |

## Flag-off safety

- `applySkinningUniforms` is a verbatim move out of `forward/Deform.ts` into
  `SkinningUniforms.ts`; the legacy path is selected whenever the binding has no
  `paletteKey` or `A3D_QR_ANIMATION` is off (`prd06FlagsOn` check in
  `SkinningPaletteUploadManager.bind`).
- `renderable.skinning` gains `paletteKey` as extra metadata on the same
  `{jointCount, matrices}` shape; flag-off consumers read only the two fields.
- `Texture.update` on a non-dynamic texture keeps the legacy whole-level
  `texImage2D` re-upload; only `dynamic`/`2d-array` textures take the
  `texSubImage*` path. Legacy `SourceTexture`/compressed/mip paths untouched.
- Registered chunks are inert until a feature selects them (none yet — T0.12
  lands the feature).

## NOT RUN here (remote-only per lane rules)

- `tests/qr/prd06/browser/deform-light-view.spec.ts` (T0.14) — needs real WebGL2
  + `EXT_color_buffer_float`; runs in the lane browser workflow on
  `qr/prd06-**` pushes (chromium/webkit/firefox on macos-14). IoU targets:
  deform-vs-CPU ≥ 0.98, bind-pose GPU-vs-CPU ≥ 0.98, raw `a_position` control
  < 0.8, animated-vs-bind < 0.8. Mask PNGs upload as `test-results/` artifacts.

  **Post-merge follow-up (chromium lane red root-caused + fixed):** the first
  remote run scored raw IoU ≈ 0.86. In-harness probes (`posedDelta`/`ndcDelta`/
  `row3`/`paletteRow3`) showed per-vertex skinned positions bit-exact between
  GPU and CPU (`maxDelta` 2.4e-7) but `clip.w = localPos.w` deviating up to
  0.41 — every palette slot's bottom row carries per-joint `(dir, dist)`-style
  data (`|dir| ≈ 1`, dist 0.5–1.4) instead of `(0,0,0,1)`, so
  `localPos = s * vec4(p,1)` fed a non-unit w into `gl_Position` and the
  perspective divide projectively warped the silhouette ~14% while positions
  stayed identical. `a3dDeform`/`a3dDeformPrevious` now pin `w = 1`
  (three.js `transformed` semantics — skinned output is affine): rerun scores
  `deformVsCpu = bindPoseGpuVsCpu = 1.0`. The probes remain as
  `selftestDelta`/`posedDelta` ≤ 1e-3 gates plus diag fields on the IoU asserts.
- Aura Clash `tracksApplied` A/B (S13) — `tests/qr/prd06/browser/aura-clash-tracks-applied.spec.ts`
  written (drives the live route via `__AURA_CLASH_ARENA_TEST_DRIVER__` + keyboard;
  all 11 `AURA_CLASH_REQUIRED_CLIP_KEYS` sampled under `?a3d-qr=none` and
  `?a3d-qr=animation`, `tracksApplied` equality asserted per key). Remote
  browser run pending on this branch.
- Whole-repo jest lane — repo CI.

## Requests filed (pending, non-blocking)

- Q-15-4: engine must install resolved QR flags via `setRendererQrFlags` so
  renderer internals see them; until then `lanes/prd06.ts` resolves
  env/URL itself (`prd06QrFlags` fallback).
- Q-01-CCR-06-6: `contracts/deform.ts` PR 0a surface should carry the real C-18
  shapes (`SkinningPaletteTextureCacheLike`, `buildMorphTargetTexture`,
  DEFORM_CHUNKS tuple order); lane keeps its own `deformResources` slot.
- Q-15-2 / Q-11-3: LeanWebGL2 / WebGPU sub-image upload parity (until then they
  keep whole-re-upload semantics).
- Harness conformance util (`tests/unit/contracts/harness.ts`) bug:
  `conformance(slot, suite)` passes `slot.provided` (a boolean) as the real
  impl — cannot be used for provided slots; PRD-06 impl tests call
  `slot.get(flags)` directly instead. Owner: 01.
