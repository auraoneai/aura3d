/**
 * WGSL twin of a3d_prd04_clearcoat (PRD-04 §8.12): same `a3d_` names,
 * identical math (r185 lights_physical_fragment.glsl.js:56-80,
 * lights_physical_pars_fragment.glsl.js:126-149, meshphysical.glsl.js:205-212).
 */
const wgsl = /* wgsl */ `
// Factor resolution (r185 lights_physical_fragment.glsl.js:56-80).
fn a3dPrd04ClearcoatInit(lobes: ptr<function, A3DPrd04Lobes>, clearcoatFactor: f32, clearcoatRoughnessFactor: f32, clearcoatTex: vec4f, roughnessTex: vec4f, clearcoatNormal: vec3f, geometryRoughness: f32) {
	var clearcoat = clearcoatFactor * clearcoatTex.x;
	var clearcoatRoughness = clearcoatRoughnessFactor * roughnessTex.y;

	clearcoat = saturate(clearcoat); // Burley clearcoat model

	(*lobes).clearcoat = clearcoat;
	(*lobes).clearcoatRoughness = a3dPrd04ResolveRoughness(clearcoatRoughness, geometryRoughness);
	(*lobes).clearcoatNormal = clearcoatNormal;
}

// Direct GGX lobe at F0 0.04 / F90 1.0 (r185 BRDF_GGX_Clearcoat,
// lights_physical_pars_fragment.glsl.js:126-149).
fn a3dPrd04ClearcoatDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, clearcoatRoughness: f32) -> vec3f {
	let alpha = pow2(clearcoatRoughness); // UE4's roughness

	let halfDir = normalize(lightDir + viewDir);

	let dotNL = saturate(dot(normal, lightDir));
	let dotNV = saturate(dot(normal, viewDir));
	let dotNH = saturate(dot(normal, halfDir));
	let dotVH = saturate(dot(viewDir, halfDir));

	let F = F_Schlick(vec3f(0.04), 1.0, dotVH);

	let V = V_GGX_SmithCorrelated(alpha, dotNL, dotNV);

	let D = D_GGX(alpha, dotNH);

	return F * (V * D);
}

// Indirect: clearcoatRadiance * EnvironmentBRDF( Ncc, V, 0.04, 1.0, ccR )
// (r185 lights_physical_pars_fragment.glsl.js:581-585).
fn a3dPrd04ClearcoatIndirect(normal: vec3f, viewDir: vec3f, clearcoatRoughness: f32, clearcoatRadiance: vec3f) -> vec3f {
	return clearcoatRadiance * a3dPrd04EnvironmentBRDF(normal, viewDir, vec3f(0.04), 1.0, clearcoatRoughness);
}

// Layering composition (r185 meshphysical.glsl.js:205-212).
fn a3dPrd04ComposeClearcoat(outgoing: vec3f, clearcoat: f32, clearcoatNormal: vec3f, viewDir: vec3f, clearcoatDirect: vec3f, clearcoatIndirect: vec3f) -> vec3f {
	let dotNVcc = saturate(dot(clearcoatNormal, viewDir));
	let Fcc = F_Schlick(vec3f(0.04), 1.0, dotNVcc);

	return outgoing * (1.0 - clearcoat * Fcc) + (clearcoatDirect + clearcoatIndirect) * clearcoat;
}
`;

export const A3D_PRD04_CLEARCOAT_WGSL = wgsl;
export default wgsl;
