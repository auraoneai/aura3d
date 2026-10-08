# PRD-06 T2.0 — 2d-array texture upload + sampler2DArray texelFetch proof

## What T2.0 requires (PRD-06:1218–1220)

`Texture` `dimension:"2d-array"` + `layers` uploads through
`texStorage3D` + per-layer `texSubImage3D`; `sampler2DArray` binds; a browser
harness proves `texelFetch(u_arr, ivec3(0, 0, 2), 0)` returns the uploaded
layer-2 value (WebKit included, §18).

## Landed surface

- `packages/rendering/src/Texture.ts` — `dimension:"2d-array"`, `layers`,
  `TextureUpdateRegion.layer`, `validateArrayUpdateData` (update payload must be
  a whole number of layer planes). (T0.10a)
- `packages/rendering/src/webgl2/TextureUpload.ts` —
  `uploadTexture` binds `TEXTURE_2D_ARRAY` *before* `texStorage3D`; the
  `2d-array` branch allocates `texStorage3D` once and uploads every layer via
  `texSubImage3D`; the revision path (`texture.update()`) re-uploads in place
  starting at `pendingUpdateRegion.layer` instead of always layer 0.
- `packages/rendering/src/webgl2/TextureFormats.ts` —
  `textureStorageInternalFormat`: `texStorage2D`/`texStorage3D` need a *sized*
  internalformat, so linear `rgba8` resolves to `RGBA8` (the `texImage2D` path
  keeps the unsized `RGBA` the spec accepts).
- `packages/rendering/src/webgl2/Samplers.ts` + `MultiDraw.ts` — `sampler2DArray`
  recognized by declared uniform type (or GL enum `36289`) and bound to
  `TEXTURE_2D_ARRAY`. (T0.10a / Q-01-3)

## Real GL bugs fixed by the browser proof

1. `uploadTexture` bound `TEXTURE_2D` unconditionally; a texture object is
   locked to its first target, so `texStorage3D(TEXTURE_2D_ARRAY, …)` then threw
   `GL_INVALID_OPERATION` (`0x502`).
2. `texStorage3D`/`texStorage2D` were fed the unsized `RGBA` internalformat —
   also `0x502` on real drivers (mock-GL tests couldn't see either bug).
3. `TextureUpdateRegion.layer` was declared but ignored; uploads always started
   at layer 0.

## Evidence

- Unit: `tests/unit/rendering/texture-update.test.ts` — 7 tests: one
  `texStorage3D` + N `texSubImage3D` per upload, `TEXTURE_2D_ARRAY` bound first,
  sized `RGBA8` internalformat, `update({layer:2})` → `zoffset=2, depth=1`.
- Browser: `tests/qr/prd06/browser/texture-array-harness.html` + `texture-array.spec.ts`
  (matrix `tests/qr/prd06/browser/**`). In-page WebGL2Device uploads a 3-layer
  `rgba8` array (L0 `200,10,10`; L1 `10,200,10`; L2 `30,60,190`), a
  `sampler2DArray` fullscreen pass texelFetches `ivec3(0,0,u_layer)` and
  `readPixels` asserts the exact colors; then `texture.update(plane, {layer:2})`
  and layer 2 reads `250,220,40` while layer 0 stays `200,10,10`.
  - chromium: **pass** (4.6 s); firefox: **pass** (5.8 s); webkit: runs on lane
    CI (local VM lacks GTK4 system libraries — install validation blocks launch;
    the spec is registered under every lane project).
- Gates: `vitest run tests/unit/rendering/texture-update.test.ts` 7/7 green;
  `tsc -p tsconfig.check.json --noEmit` shows only the pre-existing `tools/*`
  missing-module noise; eslint clean on all touched files.
