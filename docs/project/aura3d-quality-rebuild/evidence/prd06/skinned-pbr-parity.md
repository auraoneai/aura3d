# T2.4 — unified skinned PBR parity (browser evidence)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


**Spec:** `tests/qr/prd06/browser/skinned-pbr-parity.spec.ts`
**Harness:** `tests/qr/prd06/browser/skinned-pbr-parity-harness.ts`

## What it proves

CesiumMan's skinned mesh (bind pose, 19 joints, 3273 verts, `P3N3J4W4` interleaved)
renders through the **generated-program** path twice under
`A3D_QR_CORE=v2` + `A3D_QR_ANIMATION`:

- **deform**: lit PBR feature record + `skinning:{influences:4,palette:"texture"}`
  + `features["prd06.deform"]="skin4"` — the key `selectPrd06DeformValue` emits
  for a 4-influence texture-palette skin. The emitted vertex shader carries the
  `a3d_prd06_*` chunk stack (skinning_common → morph_texture → deform via the
  feature's `chunks[i]↔hooks[i]` pairing) and the draw binds the real
  `SkinningPaletteTextureCache` upload (`bindBoneTextureForSkinning`).
- **static twin**: the same lit PBR record minus skinning/deform.
- **static-2 redraw**: determinism control (pixel-identical redraw).

At bind pose the joint palette is identity ⇒ deform output must equal the
static output modulo float rounding.

## Result (chromium, headless SwiftShader)

- both generated programs compile+link (distinct `programKey`s)
- `u_boneTexture` declared + bound on the deform program
- no unbound uniforms (UBO members fed by `bindUniformBuffer(…,0)` excluded)
- `identicalRedraw === true`
- covered pixels > 2000
- **ΔE2000 ≤ 2 on ≥ 99% of covered pixels** — spec asserts `passRate >= 0.99`

## Cross-lane notes

- `features:{}` gap on `physicalFeatureSet` (SkinnedLitMaterial path) is
  qr-request **Q-01-2**; the per-item select/bindUniforms consumer is **Q-01-4**.
  The harness stamps the deform key directly for exactly those records.
- Lane-01 `uniformBlockGlsl` emits `layout(std140, binding = 0)` — illegal
  WebGL2 GLSL (`binding` on uniform blocks is spec-removed). Blocks default to
  binding 0, matching `bindUniformBuffer(…,0)`, so the harness strips the
  qualifier before compile. Filed as **Q-01-6**.
- `dev-server` has no `@aura3d/rendering/lanes/*` alias — harnesses deep-import
  repo paths, and `buffer-shim.ts` must be the first import (HdrEquirect
  evaluates `Buffer.from` at module load).

## deform-light-view (T0.14) — now actually green on main

The merged spec never ran: the harness imported the unpublished
`@aura3d/rendering/lanes/prd06` subpath (dev-server 404) and then hit
`Buffer is not defined` at `HdrEquirect.ts` module eval — both masked the
content failures. Fixed by this branch:

- relative deep import + first-position `buffer-shim.ts` import
- `u_boneTextureWidth` uploaded via `uniform1f` (was `uniform1i` — type
  mismatch left it 0.0, sending `a3dBone` texel math to `/0`)
- synthetic-191 rig: curl pivot moved to the ribbon base (per-row pivot only
  squeezed width by cosθ, leaving the control-below-0.8 guard untested)

Both tests pass on chromium: real-rig IoU ≥ 0.98 (deform vs CPU, bind GPU vs
CPU), controls < 0.8; synthetic-191 rig same bounds.
