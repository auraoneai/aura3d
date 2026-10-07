/**
 * a3d_prd04_unlit — KHR_materials_unlit (PRD-04 §8.2 [11]).
 *
 * Ported from three r185:
 *  - Unlit path emits `diffuseColor` directly: no lighting accumulation, no
 *    specular/diffuse evaluation (ShaderLib/meshbasic + the unlit arm of
 *    WebGLPrograms; the lobe contract is `outgoingLight = diffuseColor`,
 *    premultiplied alpha handled by the opaque_fragment stage downstream).
 *
 * Self-contained — no requires. Selected when `lighting: "unlit"` in
 * ProgramFeatures (replaces brdf evaluation entirely; a materialStrictness
 * 'spec' import reports `extension-lobe-pending` if it arrives before this
 * lobe, PRD-04 §11).
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
// Unlit output: baseColor straight through (r185 unlit arm).
// postAlpha keeps a single call site for opacity multiplication.
vec4 a3dPrd04UnlitColor( const in vec4 diffuseColor ) {

	return diffuseColor;

}
`;

export const A3D_PRD04_UNLIT: ShaderChunk = {
	name: "a3d_prd04_unlit",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: []
};
