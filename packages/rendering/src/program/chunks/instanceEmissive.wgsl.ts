/**
 * PRD 11 Phase 6 groundwork — WGSL twins of
 * `a3d_prd11_instance_emissive_{vtx,frag}` (`batching/shaders/
 * instanceEmissive.glsl.ts`). The instanced attribute arrives through the
 * vertex buffer layout the Phase-6 device builds; these twins carry the
 * varying declaration + helper both stages share.
 */

export const PRD11_INSTANCE_EMISSIVE_VTX_WGSL = /* wgsl */ `
// vertex stage — @location input arrives via the instance-rate vertex buffer
// (location 14, reserved for a_instanceEmissive by the bind layout builder)
fn a3dInstanceEmissiveIn(input: vec3<f32>) -> vec3<f32> {
  return input;
}
`;

export const PRD11_INSTANCE_EMISSIVE_FRAG_WGSL = /* wgsl */ `
// fragment stage — consumed through the interpolated varying
struct A3dPrd11InstanceEmissiveFrag {
  @location(14) v_a3dInstanceEmissive: vec3<f32>,
};
`;
