/**
 * WGSL twin of a3d_prd04_volume (PRD-04 §8.12): same `a3d_` names, identical
 * math (r185 transmission_pars_fragment.glsl.js:152-168,
 * transmission_fragment.glsl.js:3-18). WGSL has no `isinf`; +∞ is detected by
 * comparison against the f32 maximum.
 */
const wgsl = /* wgsl */ `
// Beer-Lambert attenuation (r185 volumeAttenuation,
// transmission_pars_fragment.glsl.js:152-168).
fn a3dVolumeAttenuation(transmissionDistance: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec3f {
	if (attenuationDistance >= 3.4028235e38) {
		// Attenuation distance is +∞ (WGSL lacks an infinity test; only +inf exceeds f32 max).
		return vec3f(1.0);
	} else {
		// Compute light attenuation using Beer's law.
		let attenuationCoefficient = -log(attenuationColor) / attenuationDistance;
		let transmittance = exp(-attenuationCoefficient * transmissionDistance); // Beer's law
		return transmittance;
	}
}

// Factor resolution (r185 transmission_fragment.glsl.js:3-18).
fn a3dPrd04VolumeInit(lobes: ptr<function, A3DPrd04Lobes>, transmissionFactor: f32, thicknessFactor: f32, attenuationDistanceFactor: f32, attenuationColorFactor: vec3f, transmissionTex: vec4f, thicknessTex: vec4f) {
	(*lobes).transmission = transmissionFactor * transmissionTex.r;
	(*lobes).thickness = thicknessFactor * thicknessTex.g;
	(*lobes).attenuationDistance = attenuationDistanceFactor;
	(*lobes).attenuationColor = attenuationColorFactor;
}
`;

export const A3D_PRD04_VOLUME_WGSL = wgsl;
export default wgsl;
