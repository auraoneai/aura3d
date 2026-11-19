# @aura3d/animation

`@aura3d/animation` owns deterministic clip sampling, mixer state, root motion extraction, skeletal hierarchy data, skinning palette generation, blend trees, state machines, and scene/ECS animation bridges.

## Public API

- `AnimationTrack`, `Keyframe`: typed scalar, vector, quaternion, and object keyframe sampling with strict keyframe ordering.
- `AnimationClip`, `AnimationEvent`: clip duration, track grouping, event metadata, and deterministic serialization.
- `AnimationAction`, `AnimationMixer`, `AnimationLayer`: playback state, pause/play controls, scrubbing, playback speed, looping, weights, crossfades, event dispatch, and target value application.
- `Bone`, `Skeleton`, `buildSkinningPalette`: bone hierarchy validation, world matrices, inverse-bind data, and renderer-facing matrix palettes.
- `BlendTree1D`, `BlendTree2D`, `AnimationStateMachine`: deterministic blend weights, priority-ordered state transitions, and graph debug snapshots.
- `extractRootMotion`, `applyRootMotion`: vector root-motion deltas for runtime targets, including loop-wrap displacement.
- `SceneAnimationBridge`, `ECSAnimationBridge`: public adapters that write sampled values into scene nodes and ECS transform-like data.
- Humanoid motion import (5.6.0): `smplMotionToClip`, `smplMotionToFrames`, `isHyMotionDict` (HY-Motion SMPL 22-joint `motion.json`), `skeletalMotionToFrames`, `resampleCanonicalFrames`, `crossfadeLoop`, `detectHumanoidFacing`, `mapHumanoid`, `createHumanoidDriver`, `sampleHumanoidClip` and `bakeHumanoidFramesToGltf`: convert sampled clips to canonical humanoid frames and bake them as glTF channels on a rigged humanoid, with automatic role mapping (including unnamed `bone_N` rigs). This is the engine behind `aura3d animation import` and `aura3d animation generate`; see `docs/api/humanoid-motion.md`.
- Humanoid playback (5.7.0): `createHumanoidAnimator` (alias `createMotionAnimator`) plays canonical `HumanoidClip`s through a `HumanoidDriver` with cross-fades, mirrored clips, code poses and explicit clip time or rate; `humanoidLocomotionTime`, `humanoidLocomotionRate`, `humanoidEventTime`, `humanoidAirTime` sync clip time to game motion; `mirrorHumanoidPose`, `blendHumanoidPoses`, `layerHumanoidPose`, `ARM_ROLES`, `loadIdolHumanoid` and the `quat*` helpers are public. Import from `@aura3d/engine/animation`; see `docs/api/humanoid-motion.md`.

## Verification

Animation sampling, serialization, loop events, browser clip controls, crossfade blending, root motion, state-machine debug graphs, skeleton palettes, scene bridges, inspector evidence, and browser-visible animation pixels are covered by `tests/unit/workstream4.physics-animation.test.ts` and `tests/browser/animation-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.

Runtime support, retargeting limits, and unsupported authoring features are documented in `docs/animation/runtime-support.md`.
