# Animation

Version: `0.1.0-alpha.0`

Aura3D animation is a runtime playback system for clips, tracks, skeletal data, morph target weights, and scene-node transforms. It is exposed through `@aura3d/engine/animation` and is also exercised by the V8/V9 animation proof routes.

## Package Surface

Primary exports include:

- `AnimationClip`, `AnimationTrack`, `Keyframe`;
- `AnimationAction`, `AnimationMixer`, `AnimationLayer`;
- `Bone`, `Skeleton`, skinning helpers, and palette data;
- blend trees, animation state machines, root motion, IK helpers;
- scene and ECS bridges for applying sampled animation state;
- motion-quality and fixture helpers used by evidence routes.

Browser-specific animation helpers are exposed through `@aura3d/engine/animation/browser`.

## Runtime Flow

Animation normally follows this order:

1. Load or create clips and tracks.
2. Bind tracks to scene nodes, skeletons, morph weights, or app state.
3. Advance the mixer with elapsed time.
4. Apply sampled values to scene transforms, skeleton palettes, morph weights, or renderer inputs.
5. Render the updated scene.

The renderer should consume already-sampled transforms and palettes. The animation package does not own the whole render loop.

## glTF And Character Work

The current repo includes glTF animation runtime work in `@aura3d/engine/assets`, including imported animation mixers, clone sampling, morph target control, skeleton import, and bounded IK support. V8 routes exercise keyframes, multiple animated agents, walking, additive layers, blending, IK, and morph targets.

This is meaningful animation infrastructure, but it is not a DCC-grade animation authoring tool.

## Strong Use Cases

- product/character preview animation;
- imported GLB clip playback;
- route-level animation parity tests;
- skeletal palette diagnostics;
- morph target previews;
- internal tools that need repeatable animation sampling.

## Boundaries

Do not claim:

- broad retargeting parity with mature animation engines;
- complete IK authoring;
- motion matching production readiness;
- full timeline authoring workflow;
- visual parity with every official Three.js animation example.

Claims should name the exact route, package export, fixture, or report behind them.

## Boundary

The animation boundary is clip/action sampling, skeletal palette data, morph weights, and runtime bindings; renderer and authoring workflow ownership stay separate.

## Current Limits

Current limits include broad retargeting parity, complete IK authoring, motion matching production readiness, full timeline authoring, and every official Three.js animation example.
