/**
 * PRD-06 T2.7 — WGSL twin of `a3d_prd06_skinning_common`
 * (`shaders/deform/skinning.glsl.ts`). Same palette semantics, WGSL idiom:
 *
 *   - `u_boneTexture` (RGBA32F sampler, 4 texels per mat4) →
 *     `a3dBones: var<storage> array<mat4x4<f32>>` — a storage buffer sized to
 *     the rig (`jointCount * 64` bytes), matching §8.1's "bones sized to the
 *     rig" shape instead of a texel-width lookup. `u_boneTextureWidth`
 *     disappears with the addressing math.
 *   - `u_prevBoneTexture` → `a3dPrevBones` — declared unconditionally; WebGPU
 *     only requires bindings a program statically reads, so non-velocity
 *     programs never bind it.
 *   - GLSL `in` attributes (`a_joints`, `a_weights`, `a_joints1`, `a_weights1`)
 *     become function parameters — WGSL vertex inputs live in the generated
 *     entry-point struct, not in chunks. Joints arrive as `vec4<u32>`; the
 *     generated program converts the float vertex attributes at the call site.
 *   - `A3D_SKINNING == 8` (preprocessor fork) becomes two functions,
 *     `a3dSkin4`/`a3dSkin8` (+ `Prev` twins); the generator emits the call its
 *     features select.
 *
 * Group/binding numbers are placeholders for the WebGPU generator (Q-11-1
 * owns device-side binding) — group 3 matches the lane-11 per-draw-resource
 * convention.
 */

export const A3D_PRD06_SKINNING_COMMON_WGSL = /* wgsl */ `
// §8.1 — storage-buffer bones sized to the rig (jointCount mat4s).
@group(3) @binding(10) var<storage, read> a3dBones: array<mat4x4<f32>>;
// §8.5 — previous-frame palette for velocity programs. Declared
// unconditionally: WebGPU only requires bindings the entry point
// transitively reads, so forward programs never bind it.
@group(3) @binding(11) var<storage, read> a3dPrevBones: array<mat4x4<f32>>;

fn a3dBone(j: u32) -> mat4x4<f32> {
  return a3dBones[j];
}
fn a3dBonePrev(j: u32) -> mat4x4<f32> {
  return a3dPrevBones[j];
}
fn a3dSkin4(joints: vec4<u32>, weights: vec4<f32>) -> mat4x4<f32> {
  return a3dBone(joints.x) * weights.x + a3dBone(joints.y) * weights.y
       + a3dBone(joints.z) * weights.z + a3dBone(joints.w) * weights.w;
}
fn a3dSkin8(joints: vec4<u32>, weights: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>) -> mat4x4<f32> {
  return a3dSkin4(joints, weights)
       + a3dBone(joints1.x) * weights1.x + a3dBone(joints1.y) * weights1.y
       + a3dBone(joints1.z) * weights1.z + a3dBone(joints1.w) * weights1.w;
}
fn a3dSkinPrev4(joints: vec4<u32>, weights: vec4<f32>) -> mat4x4<f32> {
  return a3dBonePrev(joints.x) * weights.x + a3dBonePrev(joints.y) * weights.y
       + a3dBonePrev(joints.z) * weights.z + a3dBonePrev(joints.w) * weights.w;
}
fn a3dSkinPrev8(joints: vec4<u32>, weights: vec4<f32>, joints1: vec4<u32>, weights1: vec4<f32>) -> mat4x4<f32> {
  return a3dSkinPrev4(joints, weights)
       + a3dBonePrev(joints1.x) * weights1.x + a3dBonePrev(joints1.y) * weights1.y
       + a3dBonePrev(joints1.z) * weights1.z + a3dBonePrev(joints1.w) * weights1.w;
}
`;
