# Renderer Skinning And Morphs

Version: 1.0.5

Skinning and morph support spans animation, assets, and rendering packages.

## Current Code

- `packages/animation/src/Bone.ts`
- `packages/animation/src/Skeleton.ts`
- `packages/animation/src/Skinning.ts`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/SkinningBounds.ts`
- `packages/rendering/src/ShaderLibrary.ts`

## Current Behavior

- Imported glTF `JOINTS_0` and `WEIGHTS_0` attributes can feed skinned vertex formats.
- Skinning palettes are uploaded for skinned renderables.
- Morph targets are composed with skinning in renderer and bounds paths.
- Current animation/skinning routes exercise keyframes, blending, additive blending, IK, morphs, multiple agents, and walking.

## Boundaries

