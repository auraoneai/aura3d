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

The root `createAuraApp` safe path must not be described as release-ready
skinned GLB animation or morph-target rendering unless a browser test imports
only `@aura3d/engine`, mounts a typed GLB route, captures before/after pixels,
and verifies meaningful character-region change.

Source metadata is not enough. The following are source-level evidence until
pixel-backed tests prove otherwise:

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
