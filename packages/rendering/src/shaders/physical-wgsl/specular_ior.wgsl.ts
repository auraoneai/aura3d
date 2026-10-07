/**
 * WGSL twin of a3d_prd04_specular_ior (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 iridescence_fragment.glsl.js:14-33 +
 * lights_physical_fragment.glsl.js:14-54). `pow2`/`pow2v`/`mix` come from the
 * brdf twin shim; `pow2v` is the vec3 overload (WGSL has no overloading).
 */
const wgsl = /* wgsl */ `
// IOR <-> F0 conversion (r185 iridescence_fragment.glsl.js:14-33).
fn a3dPrd04IorToF0(transmittedIor: vec3f, incidentIor: f32) -> vec3f {
	return pow2v((transmittedIor - vec3f(incidentIor)) / (transmittedIor + vec3f(incidentIor)));
}

fn a3dPrd04IorToF0f(transmittedIor: f32, incidentIor: f32) -> f32 {
	return pow2((transmittedIor - incidentIor) / (transmittedIor + incidentIor));
}

fn a3dPrd04F0ToIor(fresnel0: vec3f) -> vec3f {
	let sqrtF0 = sqrt(fresnel0);
	return (vec3f(1.0) + sqrtF0) / (vec3f(1.0) - sqrtF0);
}

// Resolve specular texture factors (r185 lights_physical_fragment.glsl.js:20-33).
// Returns specularColorFactor * texel.rgb; *outSpecIntensity =
// specularIntensity * texel.a.
fn a3dPrd04SpecIorFactors(specularColorFactor: vec3f, specularIntensityFactor: f32, specularColorTexel: vec3f, specularIntensityTexel: f32, outSpecIntensity: ptr<function, f32>) -> vec3f {
	*outSpecIntensity = specularIntensityFactor * specularIntensityTexel;
	return specularColorFactor * specularColorTexel;
}

// Dielectric specularColor from ior (r185 lights_physical_fragment.glsl.js:45).
fn a3dPrd04SpecIorSpecularColor(ior: f32, specularColorFactor: vec3f, specularIntensity: f32) -> vec3f {
	return min(a3dPrd04IorToF0(vec3f(ior), 1.0) * specularColorFactor, vec3f(1.0)) * specularIntensity;
}

// specularF90 = mix( specularIntensity, 1, metalness ) (r185 :35).
fn a3dPrd04SpecIorSpecularF90(specularIntensity: f32, metallic: f32) -> f32 {
	return mix(specularIntensity, 1.0, metallic);
}

// specularColorBlended = mix( specularColor, diffuseColor, metalness ) (r185 :46, :51).
fn a3dPrd04SpecIorSpecularColorBlended(specularColor: vec3f, diffuseColor: vec3f, metallic: f32) -> vec3f {
	return mix(specularColor, diffuseColor, metallic);
}
`;

export const A3D_PRD04_SPECULAR_IOR_WGSL = wgsl;
export default wgsl;
