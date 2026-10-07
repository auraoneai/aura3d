/**
 * a3d_prd04_alpha_a2c — MASK alpha-test + alpha-to-coverage (PRD-04 §8.10
 * [02], material.alphaToCoverage flag).
 *
 * Ported from three r185:
 *  - MASK path: `if ( alpha < cutoff ) discard` —
 *    alphatest_fragment.glsl.js:9-13.
 *  - Alpha-to-coverage path:
 *    `alpha = smoothstep( cutoff, cutoff + fwidth( alpha ), alpha );
 *    if ( alpha == 0 ) discard` — alphatest_fragment.glsl.js:5-7.
 *    Activation is a pipeline/MSAA decision (renderer.alphaToCoverage alias
 *    plus material.strictness 'spec' acceptance); the shader side is this
 *    smoothing (PRD-04 §8.10 + §11 alphaMode table).
 *
 * Self-contained (no requires). Stage fragment.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_ALPHA_A2C_WGSL from "../physical-wgsl/alpha_a2c.wgsl.js";

const glsl = /* glsl */ `
// MASK without coverage: hard cutoff discard (r185 USE_ALPHATEST arm,
// alphatest_fragment.glsl.js:9-13).
void a3dPrd04AlphaTest( const in float alpha, const in float cutoff ) {

	if ( alpha < cutoff ) discard;

}

// MASK + alpha-to-coverage: screen-space derivative smoothing around the
// cutoff, then discard fully-covered-out texels (r185 ALPHA_TO_COVERAGE arm,
// alphatest_fragment.glsl.js:5-7).
void a3dPrd04AlphaToCoverage( inout float alpha, const in float cutoff ) {

	alpha = smoothstep( cutoff, cutoff + fwidth( alpha ), alpha );
	if ( alpha == 0.0 ) discard;

}
`;

export const A3D_PRD04_ALPHA_A2C: ShaderChunk = {
	name: "a3d_prd04_alpha_a2c",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_ALPHA_A2C_WGSL,
	stage: "fragment",
	requires: []
};
