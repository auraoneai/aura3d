# Renderer Skinning And Morphs

Skinning and morph support spans animation, assets, engine runtime nodes, and
renderer packages. Keep those layers separate when writing public claims.

## What Exists Today

- `packages/animation` contains skeleton, bone, clip, pose, event, layer, and
  controller primitives.
- `packages/assets` can inspect glTF animation, skeleton, skin, and morph
  metadata for asset readiness.
- `@aura3d/engine` runtime node handles expose `setAnimationPose(...)`,
  `setMorphTarget(...)`, `setMorphTargets(...)`, `morphTargets()`, and imported
  asset evidence snapshots.
- `packages/rendering` contains renderer and bounds code paths for skinned and
  morph-target data.

## Public Root Boundary

The root `createAuraApp` safe path now has bounded browser proof for a typed
skinned GLB, named clip controls, and named morph targets. Root-only tests import
`@aura3d/engine`, mount typed GLBs, keep the camera stable, and verify meaningful
subject-region pixel changes. See `docs/rendering/animation.md` and
`tests/reports/animation-complete/report.json`.

Source metadata alone is still not enough. The following remain source-level
evidence for an asset or behavior not covered by the bounded browser fixtures:

- typed asset lists of clips, bones, skins, or morph names;
- `AnimationController` active clip state;
- runtime-node `animationPose()` or `morphTargets()` snapshots;
- imported asset evidence with `skinnedRenderItemCount` or
  `morphRenderItemCount`.

## Acceptance Criteria For Public Claims

To claim visible root-path skinning or morph support, provide:

- typed asset provenance and inspection output for the GLB;
- named clip, skeleton, skin, and morph metadata from that asset;
- a route importing only `@aura3d/engine`;
- screenshot or video frame pairs at deterministic times;
- pixel delta measured in the character or face region, not only camera, HUD, or
  whole-frame movement;
- route-health or evidence JSON that names the renderer backend and fallback
  state.
