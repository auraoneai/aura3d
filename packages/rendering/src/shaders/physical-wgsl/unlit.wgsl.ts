/**
 * WGSL twin of a3d_prd04_unlit (PRD-04 §8.12): same `a3d_` name, identical
 * math (r185 unlit arm — baseColor straight through).
 */
const wgsl = /* wgsl */ `
// Unlit output: baseColor straight through (r185 unlit arm).
fn a3dPrd04UnlitColor(diffuseColor: vec4f) -> vec4f {
	return diffuseColor;
}
`;

export const A3D_PRD04_UNLIT_WGSL = wgsl;
export default wgsl;
