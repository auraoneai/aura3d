/**
 * WGSL twin of a3d_prd04_emissive_strength (PRD-04 §8.12): same `a3d_` name,
 * identical math (r185 emissivemap_fragment.glsl.js:1-13 ×
 * KHR_materials_emissive_strength).
 */
const wgsl = /* wgsl */ `
// Emissive term: emissiveFactor * emissiveTex.rgb * emissiveStrength.
// emissiveTex = emissiveMap texel; pass vec4f(1.0) when no map is bound.
fn a3dPrd04EmissiveRadiance(emissiveFactor: vec3f, emissiveTex: vec4f, emissiveStrength: f32) -> vec3f {
	return emissiveFactor * emissiveTex.rgb * emissiveStrength;
}
`;

export const A3D_PRD04_EMISSIVE_STRENGTH_WGSL = wgsl;
export default wgsl;
