/**
 * a3d_prd04_dispersion — KHR_materials_dispersion (PRD-04 §8.7, §12.8).
 *
 * Ported from three r185:
 *  - `halfSpread = ( ior - 1 ) * 0.025 * dispersion`;
 *    `iors = vec3( ior - halfSpread, ior, ior + halfSpread )`; three refraction
 *    samples, one per band — transmission_pars_fragment.glsl.js:178-204.
 *
 * Sits inside `#ifdef A3D_TRANSMISSION` + `#ifdef A3D_DISPERSION` mirroring
 * r185's USE_TRANSMISSION + USE_DISPERSION guards.
 *
 * Requires `a3d_prd04_transmission` (a3dVolumeTransmissionRay,
 * a3dTransmissionCoords, a3dTransmissionSample) and `a3d_prd04_volume`
 * (a3dVolumeAttenuation).
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_DISPERSION_WGSL from "../physical-wgsl/dispersion.wgsl.js";

const glsl = /* glsl */ `
#if defined( A3D_TRANSMISSION ) && defined( A3D_DISPERSION )

// Per-band IOR spread (r185 transmission_pars_fragment.glsl.js:180-182):
// halfSpread = ( ior - 1 ) * 0.025 * dispersion.
vec3 a3dPrd04DispersionIors( const in float ior, const in float dispersion ) {

	float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
	return vec3( ior - halfSpread, ior, ior + halfSpread );

}

// Dispersive volume refraction — three rays at ior ± halfSpread, channel i
// keeps band i of the transmission sample and the full alpha averaged
// (r185 getIBLVolumeRefraction USE_DISPERSION arm,
// transmission_pars_fragment.glsl.js:178-204,222-231).
vec4 a3dGetIBLVolumeRefractionDispersion( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor, const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix, const in float dispersion, const in float ior, const in float thickness, const in vec3 attenuationColor, const in float attenuationDistance ) {

	vec4 transmittedLight = vec4( 0.0 );
	vec3 transmittance = vec3( 0.0 );

	vec3 iors = a3dPrd04DispersionIors( ior, dispersion );

	for ( int i = 0; i < 3; i ++ ) {

		vec3 transmissionRay = a3dVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
		vec3 refractedRayExit = position + transmissionRay;

		// Project refracted vector on the framebuffer, while mapping to normalized device coordinates.
		vec2 refractionCoords = a3dTransmissionCoords( refractedRayExit, a3d_prd04_viewMatrix, a3d_prd04_projectionMatrix );

		// Sample framebuffer to get pixel the refracted ray hits.
		vec4 transmissionSample = a3dTransmissionSample( refractionCoords, roughness, iors[ i ] );
		transmittedLight[ i ] = transmissionSample[ i ];
		transmittedLight.a += transmissionSample.a;

		transmittance[ i ] = diffuseColor[ i ] * a3dVolumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];

	}

	transmittedLight.a /= 3.0;

	vec3 attenuatedColor = transmittance * transmittedLight.rgb;

	// Get the specular component.
	vec3 F = a3dPrd04EnvironmentBRDF( n, v, specularColor, specularF90, roughness );

	float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;

	return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );

}

#endif // A3D_TRANSMISSION && A3D_DISPERSION
`;

export const A3D_PRD04_DISPERSION: ShaderChunk = {
	name: "a3d_prd04_dispersion",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_DISPERSION_WGSL,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common", "a3d_prd04_volume", "a3d_prd04_transmission"]
};
