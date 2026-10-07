/**
 * WGSL twin of a3d_prd04_bsdf_lobes_common (PRD-04 §8.12): same `a3d_` names,
 * identical math. `saturate`, `dpdx`/`dpdy`, `mat3x3f` are WGSL builtins; the
 * `brdf`-shim helpers (`pow2`, `pow2v`, `EPSILON`, `a3dDFG`, `PI`) resolve the
 * same names the GLSL chunk requires — overloading is impossible in WGSL, so
 * the vec3 overloads use `pow2v`/`F_Schlick` stays vec3-only.
 */
const wgsl = /* wgsl */ `
struct A3DPrd04Lobes {
	ior: f32,
	clearcoat: f32,
	clearcoatRoughness: f32,
	clearcoatNormal: vec3f,
	sheenColor: vec3f,
	sheenRoughness: f32,
	iridescence: f32,
	iridescenceIOR: f32,
	iridescenceThickness: f32,
	iridescenceFresnel: vec3f,
	iridescenceF0: vec3f,
	anisotropy: f32,
	anisotropyT: vec3f,
	anisotropyB: vec3f,
	alphaT: f32,
	transmission: f32,
	thickness: f32,
	attenuationDistance: f32,
	attenuationColor: vec3f,
	dispersion: f32,
}

// Geometric specular AA (r185 lights_physical_fragment.glsl.js:7-12).
fn a3dPrd04GeometryRoughness(nonPerturbedNormal: vec3f) -> f32 {
	let dxy = max(abs(dpdx(nonPerturbedNormal)), abs(dpdy(nonPerturbedNormal)));
	return max(max(dxy.x, dxy.y), dxy.z);
}

// r185 roughness floor (base mip of a 256 cubemap), then spec-AA clamp to 1.
fn a3dPrd04ResolveRoughness(roughnessFactor: f32, geometryRoughness: f32) -> f32 {
	var roughness = max(roughnessFactor, 0.0525);
	roughness += geometryRoughness;
	return min(roughness, 1.0);
}

// Specular occlusion (r185 computeSpecularOcclusion,
// lights_physical_pars_fragment.glsl.js:651-656).
fn a3dPrd04SpecularOcclusion(dotNV: f32, ambientOcclusion: f32, roughness: f32) -> f32 {
	return saturate(pow(dotNV + ambientOcclusion, exp2(-16.0 * roughness - 1.0)) - 1.0 + ambientOcclusion);
}

// Environment BRDF (r185 EnvironmentBRDF,
// lights_physical_pars_fragment.glsl.js:377-384) over a3dDFG.
fn a3dPrd04EnvironmentBRDF(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, roughness: f32) -> vec3f {
	let dotNV = saturate(dot(normal, viewDir));
	let fab = a3dDFG(roughness, dotNV);
	return specularColor * fab.x + specularF90 * fab.y;
}

// IBL multiscattering (r185 computeMultiscattering,
// lights_physical_pars_fragment.glsl.js:390-419).
fn a3dPrd04ComputeMultiscattering(normal: vec3f, viewDir: vec3f, specularColor: vec3f, specularF90: f32, roughness: f32, singleScatter: ptr<function, vec3f>, multiScatter: ptr<function, vec3f>) {
	let dotNV = saturate(dot(normal, viewDir));
	let fab = a3dDFG(roughness, dotNV);
	let Fr = specularColor;
	let FssEss = Fr * fab.x + specularF90 * fab.y;
	let Ess = fab.x + fab.y;
	let Ems = 1.0 - Ess;
	let Favg = Fr + (1.0 - Fr) * 0.047619; // 1/21
	let Fms = FssEss * Favg / (1.0 - Ems * Favg);
	*singleScatter += FssEss;
	*multiScatter += Fms * Ems;
}
`;

export const A3D_PRD04_BSDF_LOBES_COMMON_WGSL = wgsl;
export default wgsl;
