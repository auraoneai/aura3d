/**
 * a3d_prd04_emissive_strength — KHR_materials_emissive_strength
 * (PRD-04 §8.9 [09]).
 *
 * Ported from three r185:
 *  - `totalEmissiveRadiance = emissiveFactor * emissiveMap.rgb *
 *    emissiveStrength` — emissivemap_fragment.glsl.js:1-13 with the
 *    emissive_strength multiplier folded in (ShaderLib/meshphysical uses
 *    material.emissive uniform already multiplied by emissiveStrength on CPU;
 *    the FS contract here keeps the strength explicit so factor edits stay
 *    shader-side).
 *
 * Requires `brdf` (saturate). Declared unconditionally: a strength of 1.0 is
 * the identity.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_EMISSIVE_STRENGTH_WGSL from "../physical-wgsl/emissive_strength.wgsl.js";

const glsl = /* glsl */ `
// Emissive term: emissiveFactor * emissiveTex.rgb * emissiveStrength
// (r185 emissivemap_fragment.glsl.js:1-13 × KHR_materials_emissive_strength).
// emissiveTex = emissiveMap texel; pass vec4(1.0) when no map is bound.
vec3 a3dPrd04EmissiveRadiance( const in vec3 emissiveFactor, const in vec4 emissiveTex, const in float emissiveStrength ) {

	return emissiveFactor * emissiveTex.rgb * emissiveStrength;

}
`;

export const A3D_PRD04_EMISSIVE_STRENGTH: ShaderChunk = {
	name: "a3d_prd04_emissive_strength",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_EMISSIVE_STRENGTH_WGSL,
	stage: "fragment",
	requires: ["brdf"]
};
