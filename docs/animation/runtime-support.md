# Animation Runtime Support

This page describes the current animation runtime boundary. Galileo3D has real deterministic animation code, browser-rendered skinning evidence, and v8 animation routes, but it is not yet a production character-animation toolchain.

## Supported Runtime Features

- Track value types: scalar, vector2, vector3, quaternion, object values, and numeric arrays for morph-style weights.
- Keyframe interpolation: step and linear sampling are supported. CUBICSPLINE input is rejected for current runtime tracks until tangent storage and sampling are implemented.
- Clips and actions: `AnimationClip`, `AnimationAction`, and `AnimationMixer` support play, pause, stop, scrubbing, playback speed, looping, weights, crossfades, and deterministic target application.
- Layers and blending: base and additive layer composition are covered for scalar, vector, quaternion, object, and number-array targets.
- State machines and blend trees: deterministic state transitions, exit-time handling, one-dimensional/two-dimensional blend trees, and debug graph snapshots are supported.
- Skeleton data: `Bone`, `Skeleton`, and `buildSkinningPalette` provide hierarchy validation, world matrices, inverse-bind support, and renderer-facing joint matrices.
- Runtime bridges: scene and ECS animation bridges apply sampled values into existing scene nodes or transform-like component stores.
- Root motion: vector root-motion deltas are supported for runtime targets, including loop-wrap displacement.
- glTF animation import: the asset pipeline imports glTF translation, rotation, scale, and morph-weight channels into runtime clips. `tests/assets/gltf-animation-corpus.test.ts` covers an inline skinned fixture plus pinned external Khronos Cesium Man and Fox GLB entries recorded in `tests/assets/corpus/animated-character-corpus.manifest.json`.
- v8 routes exercise keyframe playback, skinning blending, additive blending, IK targets, morph controls, multiple animated agents, and walk-cycle locomotion.

## Unsupported Authoring Features

- Retargeting is future work. The current runtime does not provide humanoid rig mapping, bind-pose normalization across different skeletons, source/target bone-name remapping UI, or constraint-assisted retarget solving.
- Timeline authoring is future work. The editor has an initial timeline inspection panel, but there is no production timeline asset format, curve editor, dopesheet, clip asset browser, or non-linear animation authoring workflow. See `docs/animation/timeline-editor-integration.md`.
- Runtime animation now has an inline skinned glTF animation fixture, two pinned externally authored skinned GLB imports with different rigs and clip structures, and browser renderer playback evidence for the Cesium Man imported GLB. It still does not prove retargeting coverage or renderer-backed visual validation for many imported skinned meshes.
- IK, motion matching, animation compression, animation events authoring UI, avatar masks, and humanoid import presets are not claimed.
- The current docs narrow animation claims to a deterministic browser runtime, not a production character-animation toolchain.
- The v8 visual review accepts animation screenshots as route evidence only. It explicitly does not turn the current characters into final Three.js-level visual quality proof.

## Retargeting Plan

Retargeting should not be claimed until these pieces exist with tests:

1. A rig profile format that maps source joints to target joints and records bind-pose axes.
2. Validation for missing, duplicate, cyclic, or incompatible joint mappings.
3. A deterministic retarget sampler that converts source animation tracks into target-local transforms.
4. Unit fixtures for mismatched proportions, different bone names, missing optional fingers/toes, mirrored axes, and scale compensation.
5. Browser evidence using at least two real externally authored skinned glTF characters.
6. Editor UI for assigning a rig profile, previewing the result, and saving retarget import settings.

## Verification

- `tests/reports/v8-animation-examples.json`
- `tests/reports/v8-visual-review.json`
- `tests/assets/gltf-animation-corpus.test.ts`
- `tests/browser/animation-browser.spec.ts`
- `tests/visual/skinned-animation-pixels.spec.ts`
- `tests/unit/animation/*.test.ts`
