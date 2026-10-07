/**
 * a3d_prd04_specular_ior — KHR_materials_specular + KHR_materials_ior
 * (PRD-04 §8.2 [08]/[09]).
 *
 * Ported from three r185:
 *  - `IorToFresnel0` / `Fresnel0ToIor`,
 *    ShaderChunk/iridescence_fragment.glsl.js:14-33.
 *  - specular factor resolution,
 *    lights_physical_fragment.glsl.js:14-54: ior drives the dielectric F0 as
 *    `min( pow2( ( ior - 1 ) / ( ior + 1 ) ) * specularColorFactor, 1 ) *
 *    specularIntensity`; specularF90 = `mix( specularIntensity, 1, metalness )`;
 *    specularColorBlended = `mix( specularColor, diffuse, metalness )`.
 *  - `a3dPrd04SpecIorMaterialFactors` resolves the sampled texture factors
 *    (specularColorMap.rgb, specularIntensityMap.a) per r185 :20-33.
 *
 * Requires `brdf` (pow2) and `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes).
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_SPECULAR_IOR_WGSL from "../physical-wgsl/specular_ior.wgsl.js";

const glsl = /* glsl */ `
// IOR <-> F0 conversion (r185 iridescence_fragment.glsl.js:14-33).
vec3 a3dPrd04IorToF0( const in vec3 transmittedIor, const in float incidentIor ) {

	return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );

}

float a3dPrd04IorToF0f( const in float transmittedIor, const in float incidentIor ) {

	return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ) );

}

vec3 a3dPrd04F0ToIor( const in vec3 fresnel0 ) {

	vec3 sqrtF0 = sqrt( fresnel0 );
	return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );

}

// Resolve specular texture factors (r185 lights_physical_fragment.glsl.js:20-33).
// Returns specularColorFactor = specularColor * texel.rgb;
// outSpecIntensity = specularIntensity * texel.a.
vec3 a3dPrd04SpecIorFactors( const in vec3 specularColorFactor, const in float specularIntensityFactor, const in vec3 specularColorTexel, const in float specularIntensityTexel, out float outSpecIntensity ) {

	outSpecIntensity = specularIntensityFactor * specularIntensityTexel;
	return specularColorFactor * specularColorTexel;

}

// Dielectric specularColor from ior (r185 lights_physical_fragment.glsl.js:45).
// min( pow2( ( ior - 1 ) / ( ior + 1 ) ) * specularColorFactor, 1 ) * specularIntensity
vec3 a3dPrd04SpecIorSpecularColor( const in float ior, const in vec3 specularColorFactor, const in float specularIntensity ) {

	return min( a3dPrd04IorToF0( vec3( ior ), 1.0 ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensity;

}

// specularF90 = mix( specularIntensity, 1, metalness ) (r185 :35);
// default path uses 1.0 (:41).
float a3dPrd04SpecIorSpecularF90( const in float specularIntensity, const in float metallic ) {

	return mix( specularIntensity, 1.0, metallic );

}

// specularColorBlended = mix( specularColor, diffuseColor, metalness ) (r185 :46, :51).
vec3 a3dPrd04SpecIorSpecularColorBlended( const in vec3 specularColor, const in vec3 diffuseColor, const in float metallic ) {

	return mix( specularColor, diffuseColor, metallic );

}
`;

export const A3D_PRD04_SPECULAR_IOR: ShaderChunk = {
	name: "a3d_prd04_specular_ior",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_SPECULAR_IOR_WGSL,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
