/**
 * WGSL companion of Aura's `a3d_prd04_emissive_strength` chunk
 * (shaders/physical/emissive_strength.glsl.ts), kept operation-for-operation
 * equal to it. glTF 2.0 emission is emissiveFactor x emissiveTexture.rgb in
 * linear light; KHR_materials_emissive_strength multiplies it by a
 * nonnegative scalar strength. Negative inputs are clamped to zero.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04EmissiveRadiance(factor: vec3f, texel: vec4f, strength: f32) -> vec3f {
  return max(factor, vec3f(0.0)) * max(texel.rgb, vec3f(0.0)) * max(strength, 0.0);
}
`;

export const A3D_PRD04_EMISSIVE_STRENGTH_WGSL = wgsl;
export default wgsl;
