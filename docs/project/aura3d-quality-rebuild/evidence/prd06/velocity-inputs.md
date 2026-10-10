# T2.5 — velocity inputs (PRD-06 §8.5)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## What landed

- **`prd06.velocity-inputs` TypedGLBActor extension** (`packages/engine/src/lanes/prd06.ts`,
  flag `A3D_QR_ANIMATION`). `collectRenderItems` runs at the head of each actor's
  render-item collection — after the previously presented frame's passes — so it is
  the §8.5 "once per presented frame" call site for
  `skinningPaletteCache.beginFrame()` (rotates every key touched since the last
  call `current`→`previous`; a no-op when nothing bound).
- Items leaving `collectRenderItems` now carry the inert C-14 fields:
  - `previousJointTexture` = the palette pair's `previous` `Texture`, for skinned
    items whose `skinning` carries a stamped `paletteKey`
    (`paletteUniformSet(key, jointCount).previous`)
  - `previousMorphWeights` = the item's `morphWeights` snapshotted at the prior
    collect (`WeakMap<Geometry, Float32Array>` — renderables reassign
    `morphWeights` each apply, so a stable copy is required)
  Both fields stay unread until the post lane's velocity pass (C-14 /
  `TemporalHistory.ts:73-74` admission is Q-03-1) — flag-off nothing is stamped.
- New item objects are only allocated for items that actually get stamped;
  static items pass through by identity.

## GPU numerics — `a3dDeformPrevious` vs CPU

`tests/qr/prd06/browser/deform-light-view-harness.ts` gained a position
readback: each vertex's previous-frame local position is rasterized into an
RGBA32F point-grid target (`gl_VertexID` → grid cell, `gl_PointSize = 1`) and
read back with `readPixels(RGBA, FLOAT)`, then compared component-wise against
`cpuSkin(positions, joints, weights, prevPalette)`. The bind pose stands in for
the previous frame; a second capture runs the *current* `a3dDeform` path
through the same machinery as a self-test.

Transform feedback was tried first and abandoned: ANGLE's default transform-
feedback object captures nothing, and with an explicit object the draw
rejected `INVALID_OPERATION` (output buffer bound at another target). The
point-grid FBO is deterministic and uses machinery the harness already
requires (`EXT_color_buffer_float`).

**Results (chromium, CesiumMan 19 joints / 3,273 vertices):**
- `previousDelta.maxDelta` = **2.38e-7** (bar: ≤ 1e-3), `exceeding` = 0
- `selftestDelta.maxDelta` = 2.38e-7 — current-path capture agrees
- Synthetic 191-joint rig: same bound (`deform-light-view.spec.ts` asserts
  `previousDelta.maxDelta ≤ 1e-3` on both rigs)

## Unit evidence — `tests/unit/prd06/actor-velocity-inputs.test.ts` (4 tests)

- Extension is flag-gated (absent when `A3D_QR_ANIMATION` off, present when on)
- Two collects rotate the pair: frame 2's `previousJointTexture` is frame 1's
  `current` texture object
- `previousMorphWeights` carries the prior collect's weights as a stable copy
- Static items (no skinning/morph) pass through unmodified

## Gotcha worth keeping

`deform-light-view-harness` binds vertex attribute 0 only inside `draw()` — any
capture that runs before the first `draw()` sees the disabled-attribute
constant `(0,0,0,1)`, which reads back as ~1e-8 skinned positions (matrix ×
(0,0,0,1) = the translation column). Probe of `a_weights`/`a_joints`/`a3dBone`
all read correctly, which is what made this confusing.

## Remaining (not lane-06)

- `TemporalHistory.ts:73-74` skinned/morph admission — **Q-03-1** (post lane)
- `taa-skinned-ghosting.spec.ts` — checkpoint once C-14 is real
- `previousModelMatrix` / `previousInstanceTransforms` — stamped by the
  instancing/post lanes per C-14; actor extension covers the animation-owned
  fields (`previousJointTexture`, `previousMorphWeights`)
