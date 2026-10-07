/**
 * WGSL twin of a3d_prd04_anisotropy (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 lights_physical_fragment.glsl.js:131-158,
 * lights_physical_pars_fragment.glsl.js:102-119,176-197,
 * envmap_physical_pars_fragment.glsl.js:38-56).
 */
const wgsl = /* wgsl */ `
// Anisotropic visibility — Filament model (r185
// V_GGX_SmithCorrelated_Anisotropic, lights_physical_pars_fragment.glsl.js:102-108).
fn a3dPrd04VGGXAnisotropic(alphaT: f32, alphaB: f32, dotTV: f32, dotBV: f32, dotTL: f32, dotBL: f32, dotNV: f32, dotNL: f32) -> f32 {
	let gv = dotNL * length(vec3f(alphaT * dotTV, alphaB * dotBV, dotNV));
	let gl = dotNV * length(vec3f(alphaT * dotTL, alphaB * dotBL, dotNL));
	return 0.5 / max(gv + gl, EPSILON);
}

// Anisotropic GGX distribution (r185 D_GGX_Anisotropic,
// lights_physical_pars_fragment.glsl.js:110-119).
fn a3dPrd04DGGXAnisotropic(alphaT: f32, alphaB: f32, dotNH: f32, dotTH: f32, dotBH: f32) -> f32 {
	let a2 = alphaT * alphaB;
	let v = vec3f(alphaB * dotTH, alphaT * dotBH, a2 * dotNH);
	let v2 = dot(v, v);
	let w2 = a2 / v2;

	return RECIPROCAL_PI * a2 * (w2 * w2);
}

// Direction/frame resolution (r185 lights_physical_fragment.glsl.js:131-158).
// anisoTex = anisotropyMap texel (.rg polar dir, .b strength).
fn a3dPrd04AnisotropyInit(lobes: ptr<function, A3DPrd04Lobes>, anisotropyVector: vec2f, anisoTex: vec4f, useAnisoTex: bool, tangent: vec3f, bitangent: vec3f, roughness: f32) {
	var anisotropyV: vec2f;
	if (useAnisoTex) {
		let anisotropyMat = mat2x2f(
			vec2f(anisotropyVector.x, anisotropyVector.y),
			vec2f(-anisotropyVector.y, anisotropyVector.x)
		);
		let anisotropyPolar = anisoTex.rgb;
		anisotropyV = anisotropyMat * normalize(2.0 * anisotropyPolar.rg - vec2f(1.0)) * anisotropyPolar.b;
	} else {
		anisotropyV = anisotropyVector;
	}

	(*lobes).anisotropy = length(anisotropyV);

	if ((*lobes).anisotropy == 0.0) {
		anisotropyV = vec2f(1.0, 0.0);
	} else {
		anisotropyV /= (*lobes).anisotropy;
		(*lobes).anisotropy = saturate((*lobes).anisotropy);
	}

	// Roughness along the anisotropy bitangent is the material roughness, while
	// the tangent roughness increases with anisotropy.
	(*lobes).alphaT = mix(pow2(roughness), 1.0, pow2((*lobes).anisotropy));

	(*lobes).anisotropyT = tangent * anisotropyV.x + bitangent * anisotropyV.y;
	(*lobes).anisotropyB = bitangent * anisotropyV.x - tangent * anisotropyV.y;
}

// Direct anisotropic specular (r185 BRDF_GGX USE_ANISOTROPY arm,
// lights_physical_pars_fragment.glsl.js:176-197).
fn a3dPrd04AnisotropyDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, f0: vec3f, f90: f32, roughness: f32, lobes: A3DPrd04Lobes) -> vec3f {
	let alpha = pow2(roughness);

	let halfDir = normalize(lightDir + viewDir);

	let dotNL = saturate(dot(normal, lightDir));
	let dotNV = saturate(dot(normal, viewDir));
	let dotNH = saturate(dot(normal, halfDir));
	let dotVH = saturate(dot(viewDir, halfDir));

	let F = F_Schlick(f0, f90, dotVH);

	let dotTL = dot(lobes.anisotropyT, lightDir);
	let dotTV = dot(lobes.anisotropyT, viewDir);
	let dotTH = dot(lobes.anisotropyT, halfDir);
	let dotBL = dot(lobes.anisotropyB, lightDir);
	let dotBV = dot(lobes.anisotropyB, viewDir);
	let dotBH = dot(lobes.anisotropyB, halfDir);

	let V = a3dPrd04VGGXAnisotropic(lobes.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL);

	let D = a3dPrd04DGGXAnisotropic(lobes.alphaT, alpha, dotNH, dotTH, dotBH);

	return F * (V * D);
}

// IBL bent normal (r185 getIBLAnisotropyRadiance,
// envmap_physical_pars_fragment.glsl.js:38-56).
fn a3dPrd04AnisotropyBentNormal(viewDir: vec3f, normal: vec3f, roughness: f32, bitangent: vec3f, anisotropy: f32) -> vec3f {
	var bentNormal = cross(bitangent, viewDir);
	bentNormal = normalize(cross(bentNormal, bitangent));
	return normalize(mix(bentNormal, normal, pow2(pow2(1.0 - anisotropy * (1.0 - roughness)))));
}
`;

export const A3D_PRD04_ANISOTROPY_WGSL = wgsl;
export default wgsl;
