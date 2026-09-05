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

## Certified hero rigs (selected roster, not arbitrary rigs)

No hero rig is certified yet. Certification requires per-rig clip-playback pixel
proof for five rigs (humanoid ×2, creature, vehicle-driver, face) via
`tests/browser/certified-hero-rigs.spec.ts`. Skinning diagnostics carry
machine-readable CPU-fallback reason codes (`decideSkinningPalettePath` in
`packages/rendering/src/WebGPUSkinningLimits.ts`), and animated bounds stay
culling-correct via unioned per-frame palettes
(`computeAnimatedSkinnedBoundsUnion` in
`packages/rendering/src/SkinningBounds.ts`). The face wrinkle-map hook
(`WrinkleMapHook` / `resolveWrinkleMapStrength` in
`packages/rendering/src/MorphTargetPlan.ts`, tangent-domain texture rows
included) is unit-proven; renderer-side wrinkle wiring needs the engine bridge.

Roster asset findings (GLB-verified): `showcaseWalkAnimatedGirl` (78 joints),
`showcaseAnimatedRunnerHero` (136 joints — data-texture palette path),
`showcaseRunnerRobot` (34 joints), `showcaseKenneyOobiPlatformerHero` (6
joints; "drive" is a static pose, certifies with "walk"), and the runner hero's
"FacialExpressions" clip for the face slot (`showcaseMorphExpression` is a
single-triangle morph unit card, not a face).

Certified 2026-09-03 (`tests/browser/certified-hero-rigs.spec.ts` 6/6, production-runtime
backend, stable camera, per-rig evidence in `tests/reports/certified-hero-rigs/`):

Certified rigs:

- humanoid-a: `showcaseWalkAnimatedGirl` / "Take 001" — 78 joints, 7 skinned items, 24,274 changed px.
- humanoid-b: `showcaseAnimatedRunnerHero` / "OffensiveIdle" — 136 joints (data-texture palette path), 6 skinned items, 55,150 changed px.
- creature: `showcaseRunnerRobot` / "WALK" — 34 joints, 6 skinned items, 64,530 changed px.
- vehicle-driver: `showcaseKenneyOobiPlatformerHero` / "walk" — 6 joints, 1 skinned item, 95,949 changed px.
- face: `showcaseAnimatedRunnerHero` / "FacialExpressions" — 136 joints, 6 skinned items, 10,640 changed px.

Only these rigs may be claimed as certified. The earlier module-load collision
(`AssetDecoders.ts` vs the assets browser barrel) was resolved — both barrels
export `ensureCompressedTextureSupport` — and the proof ran green after the fix.

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

## Superiority (K1 · 2026-09-04)

- No new K1 numbers for skinning/morph paths: the K1 wall-clock covers
  bloom, 4k-instancing, 64-light, and 10k-particle workloads only. The
  skinning/morph parity receipts cited in `animation.md` stand unchanged;
  skinned-morph rendering superiority is unclaimed until measured.
