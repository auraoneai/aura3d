/**
 * WGSL twin of a3d_prd04_alpha_a2c (PRD-04 §8.10/§8.12): same `a3d_` names,
 * identical math (r185 alphatest_fragment.glsl.js:5-13).
 */
const wgsl = /* wgsl */ `
// MASK without coverage: hard cutoff discard (r185 USE_ALPHATEST arm,
// alphatest_fragment.glsl.js:9-13).
fn a3dPrd04AlphaTest(alpha: f32, cutoff: f32) {
	if (alpha < cutoff) {
		discard;
	}
}

// MASK + alpha-to-coverage: screen-space derivative smoothing around the
// cutoff, then discard fully-covered-out texels (r185 ALPHA_TO_COVERAGE arm,
// alphatest_fragment.glsl.js:5-7).
fn a3dPrd04AlphaToCoverage(alpha: ptr<function, f32>, cutoff: f32) {
	*alpha = smoothstep(cutoff, cutoff + fwidth(*alpha), *alpha);
	if (*alpha == 0.0) {
		discard;
	}
}
`;

export const A3D_PRD04_ALPHA_A2C_WGSL = wgsl;
export default wgsl;
