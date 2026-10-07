/**
 * a3d_prd04_volume — KHR_materials_volume attenuation (PRD-04 §8.8).
 *
 * Ported from three r185:
 *  - `volumeAttenuation` Beer-Lambert:
 *    transmission_pars_fragment.glsl.js:152-168.
 *  - Thickness/attenuation factor resolution:
 *    transmission_fragment.glsl.js:3-18 (thickness *= thicknessMap.g;
 *    attenuationColor/attenuationDistance factors).
 *
 * The volume lobe rides the transmission sub-flag: all declarations sit inside
 * `#ifdef A3D_TRANSMISSION` exactly like r185's USE_TRANSMISSION blocks.
 *
 * Requires `brdf` (saturate); A3DPrd04Lobes from
 * `a3d_prd04_bsdf_lobes_common`.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_VOLUME_WGSL from "../physical-wgsl/volume.wgsl.js";

const glsl = /* glsl */ `
#ifdef A3D_TRANSMISSION

// Beer-Lambert attenuation (r185 volumeAttenuation,
// transmission_pars_fragment.glsl.js:152-168).
vec3 a3dVolumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {

	if ( isinf( attenuationDistance ) ) {

		// Attenuation distance is +∞, i.e. the transmitted color is not attenuated at all.
		return vec3( 1.0 );

	} else {

		// Compute light attenuation using Beer's law.
		vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
		vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance ); // Beer's law
		return transmittance;

	}

}

// Factor resolution (r185 transmission_fragment.glsl.js:3-18).
// transmissionTex = transmissionMap texel (.r), thicknessTex = thicknessMap
// texel (.g); pass vec4(1.0) when no map is bound.
void a3dPrd04VolumeInit( inout A3DPrd04Lobes lobes, const in float transmissionFactor, const in float thicknessFactor, const in float attenuationDistanceFactor, const in vec3 attenuationColorFactor, const in vec4 transmissionTex, const in vec4 thicknessTex ) {

	lobes.transmission = transmissionFactor * transmissionTex.r;
	lobes.thickness = thicknessFactor * thicknessTex.g;
	lobes.attenuationDistance = attenuationDistanceFactor;
	lobes.attenuationColor = attenuationColorFactor;

}

#endif
`;

export const A3D_PRD04_VOLUME: ShaderChunk = {
	name: "a3d_prd04_volume",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_VOLUME_WGSL,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
