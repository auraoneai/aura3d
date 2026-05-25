# V9 Skinning Limits

G3D has real animation, skeleton, skinning, morph, additive, and IK code. The current V9 reports support scoped parity for tracked character examples, not unlimited character animation parity.

## Real Code

- `packages/animation/src/AnimationMixer.ts`
- `packages/animation/src/AnimationLayer.ts`
- `packages/animation/src/Skeleton.ts`
- `packages/animation/src/Skinning.ts`
- `packages/animation/src/IK.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/SkinningBounds.ts`
- `packages/rendering/src/production-runtime/animation/SkinningRenderer.ts`
- `packages/rendering/src/production-runtime/animation/MorphTargetRenderer.ts`

## Matched V9 Evidence

- `tests/reports/v9/animation-keyframes-parity.json`
- `tests/reports/v9/animation-walk-parity.json`
- `tests/reports/v9/animation-multiple-parity.json`
- `tests/reports/v9/skinning-blending-parity.json`
- `tests/reports/v9/skinning-additive-parity.json`
- `tests/reports/v9/skinning-ik-parity.json`
- `tests/reports/v9/morphtargets-parity.json`

## What Is Supported

- Imported GLTF clip sampling.
- Mixer-driven weighted blending.
- Additive upper-body layer route.
- Multiple cloned animated characters.
- Morph target route with animation evidence.
- Two-bone IK route evidence.
- Skinning palette updates and draw diagnostics.

## Remaining Deltas

- Some animation visuals still need polish when judged by human comparison, not only metrics.
- Data-texture skinning and very high joint-count production cases are not broadly claimed.
- Extra influence sets and every Three.js animation edge case are not complete.
- Current IK evidence shows parity for a scoped endpoint solution, not a full IK system replacement.
