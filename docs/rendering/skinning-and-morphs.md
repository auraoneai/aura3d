# Renderer Skinning And Morphs

The renderer has bounded validation for GPU-facing skinning and morph draw paths:

- `SkinnedUnlitMaterial` binds `u_jointCount` and `u_jointMatrices` from animation skinning palettes.
- The skinned vertex format carries `a_joints` and `a_weights`.
- `MorphUnlitMaterial` uses uniform-packed morph target position deltas for compatible meshes.
- CPU-side morph application remains available for materials that do not expose the GPU morph uniforms.

## Stress Coverage

`tests/unit/rendering/renderer.test.ts` includes a non-toy stress case with:

- 24 skinned vertices
- 12 joints in the palette
- 32 morph vertices
- 4 GPU morph targets, matching the current uniform target limit

## Limits

- This is not yet a large character-crowd benchmark.
- The GPU morph path has a documented uniform limit of `MAX_GPU_MORPH_VERTICES` and `MAX_GPU_MORPH_TARGETS`.
- Full external glTF animated character corpus validation remains outside this renderer slice.
