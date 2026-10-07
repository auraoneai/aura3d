# PRD-06 T2.6 — `skinnedItemLocalBounds` per-joint AABBs

## What changed

Under `A3D_QR_ANIMATION`, `skinnedItemLocalBounds` (`packages/rendering/src/renderer/SkinnedBounds.ts`)
replaces the per-vertex exact skinned bound with a union of per-joint bind-space
AABBs transformed by the joint palette:

- `packages/rendering/src/SkinningBounds.ts` — new `computeGeometryJointLocalBounds(geometry, jointCount)`
  computes each joint's bind-space AABB from the vertices it influences with **weight > 0.01**
  (same cutoff as the legacy skinned-unlit path). `bindSkeleton` carries no vertex data, so the
  computation is keyed on `Geometry` and cached in a `WeakMap` — computed once per geometry,
  recomputed only if the same geometry binds a different joint count. New
  `computeSkinnedGeometryBoundsFromJointBoxes(geometry, skinning)` transforms each joint box's
  8 corners by that joint's palette matrix and unions them.
- `packages/rendering/src/renderer/SkinnedBounds.ts` — flag-on path keys the per-frame bound
  cache on `paletteKeyOf(skinning)` (the structural object stamped by `GLTFAnimationRuntime`),
  falling back to a geometry-keyed bucket. **E26**: two actors sharing one geometry no longer
  evict each other's cached bounds. The joint-box cache is a separate `WeakMap` from the legacy
  geometry cache so a joint-box bound never answers a legacy lookup (catches flag flips mid-session).
- Flag-off path is byte-identical to the legacy implementation (exact per-vertex bound cached on
  Geometry).
- `prd06SkinnedBounds` (the C-11 `SkinnedBoundsProvider`) already routes through
  `skinnedItemLocalBounds` — it now serves joint-box bounds automatically under the flag.

## Why it's correct

Conservative: a skinned vertex position is `Σ w_j·M_j·v`; for each joint with `w_j > 0.01` the
vertex lives inside `box_j` in bind space, so `M_j·v` lies inside `M_j(box_j)`'s axis-aligned hull,
and the convex blend lands inside the union's enclosing AABB. Contributions from joints at
`w ≤ 0.01` can drift a vertex at most ~4·0.01·|v| — the 50-pose containment sweep below confirms
zero violations on the lane's real rig.

Tightness: for a humanoid with mostly single-joint vertices, the union of transformed joint boxes
tracks the posed silhouette closely — on CesiumMan's clip-0 poses the union bound volume is
**1.0000×** the exact bound (max over 50 poses; well under the PRD's ≤1.3× bar).

## Verification

`tests/unit/rendering/skinned-joint-bounds.test.ts` (new, 3 tests, all green):

1. Loads `tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb` via `GLTFLoader`, rebuilds a
   `VertexFormat.P3J4W4` geometry, drives `createGLTFSceneAnimationRuntime.applyClip(clip0, t)`
   at 50 evenly-spread times → 50 coherent skeletal palettes.
2. Per pose: `expectContains(jointBoxes, exact)` — joint-box union contains the exact CPU-skinned
   bound on all axes — and `volume(jointBoxes)/volume(exact) ≤ 1.3` (observed max 1.0000).
3. `paletteKey` caching: two bindings (`keyA`/`keyB`) sharing one geometry interleave lookups —
   each returns its own cached bound (E26 regression).
4. Flag-off identity: `skinnedItemLocalBounds` output equals `computeSkinnedGeometryBounds`
   verbatim, and the flag-on bound is a conservative superset of it.

Existing coverage: `tests/unit/rendering/skinning-fallback-and-bounds.test.ts` (17 tests) still
green — legacy path untouched.

## Gates

- `pnpm exec vitest run tests/unit/rendering/skinned-joint-bounds.test.ts tests/unit/rendering/skinning-fallback-and-bounds.test.ts` — 20/20 pass.
- `pnpm exec tsc -p tsconfig.check.json --noEmit` — no new errors (repo-wide pre-existing `prd12`/`agent-api` noise unchanged).
- `pnpm exec eslint` on touched files — clean.

## Remaining

- The ≤0.01-weight stray contribution is bounded but nonzero; if a future rig shows marginal
  containment violations, pad each joint box by `eps ≈ 0.04·maxSpan` and re-run this spec.
