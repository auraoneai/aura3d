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

## Verification

Animation sampling, serialization, loop events, browser clip controls, crossfade blending, root motion, state-machine debug graphs, skeleton palettes, scene bridges, inspector evidence, and browser-visible animation pixels are covered by `tests/unit/workstream4.physics-animation.test.ts` and `tests/browser/animation-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.

Runtime support, retargeting limits, and unsupported authoring features are documented in `docs/animation/runtime-support.md`.
