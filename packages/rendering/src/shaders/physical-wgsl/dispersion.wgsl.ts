/**
 * WGSL twin of a3d_prd04_dispersion (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 transmission_pars_fragment.glsl.js:178-204,222-231).
 * Dispersion selection is a generator-time define (C-29); the twin emits the
 * function unconditionally.
 */
const wgsl = /* wgsl */ `
// Per-band IOR spread (r185 transmission_pars_fragment.glsl.js:180-182):
// halfSpread = ( ior - 1 ) * 0.025 * dispersion.
fn a3dPrd04DispersionIors(ior: f32, dispersion: f32) -> vec3f {
	let halfSpread = (ior - 1.0) * 0.025 * dispersion;
	return vec3f(ior - halfSpread, ior, ior + halfSpread);
}

// Dispersive volume refraction — three rays at ior ± halfSpread, channel i
// keeps band i of the transmission sample and the full alpha averaged
// (r185 getIBLVolumeRefraction USE_DISPERSION arm,
// transmission_pars_fragment.glsl.js:178-204,222-231).
fn a3dGetIBLVolumeRefractionDispersion(n: vec3f, v: vec3f, roughness: f32, diffuseColor: vec3f, specularColor: vec3f, specularF90: f32, position: vec3f, modelMatrix: mat4x4f, dispersion: f32, ior: f32, thickness: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec4f {
	var transmittedLight = vec4f(0.0);
	var transmittance = vec3f(0.0);

	let iors = a3dPrd04DispersionIors(ior, dispersion);

	for (var i = 0; i < 3; i++) {
		let transmissionRay = a3dVolumeTransmissionRay(n, v, thickness, iors[i], modelMatrix);
		let refractedRayExit = position + transmissionRay;

		let refractionCoords = a3dTransmissionCoords(refractedRayExit, a3d_prd04_transmission.viewMatrix, a3d_prd04_transmission.projectionMatrix);

		let transmissionSample = a3dTransmissionSample(refractionCoords, roughness, iors[i]);
		transmittedLight[i] = transmissionSample[i];
		transmittedLight.a += transmissionSample.a;

		transmittance[i] = diffuseColor[i] * a3dVolumeAttenuation(length(transmissionRay), attenuationColor, attenuationDistance)[i];
	}

	transmittedLight.a /= 3.0;

	let attenuatedColor = transmittance * transmittedLight.rgb;

	let F = a3dPrd04EnvironmentBRDF(n, v, specularColor, specularF90, roughness);

	let transmittanceFactor = (transmittance.r + transmittance.g + transmittance.b) / 3.0;

	return vec4f((1.0 - F) * attenuatedColor, 1.0 - (1.0 - transmittedLight.a) * transmittanceFactor);
}
`;

export const A3D_PRD04_DISPERSION_WGSL = wgsl;
export default wgsl;
