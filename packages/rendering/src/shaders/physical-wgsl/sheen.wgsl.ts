/**
 * WGSL twin of a3d_prd04_sheen (PRD-04 §8.12): same `a3d_` names, identical
 * math (r185 lights_physical_fragment.glsl.js:111-129,
 * lights_physical_pars_fragment.glsl.js:321-375).
 */
const wgsl = /* wgsl */ `
// Factor resolution (r185 lights_physical_fragment.glsl.js:111-129).
fn a3dPrd04SheenInit(lobes: ptr<function, A3DPrd04Lobes>, sheenColorFactor: vec3f, sheenRoughnessFactor: f32, colorTex: vec4f, roughnessTex: vec4f) {
	(*lobes).sheenColor = sheenColorFactor * colorTex.rgb;
	(*lobes).sheenRoughness = clamp(sheenRoughnessFactor, 0.0001, 1.0) * roughnessTex.a;
}

// Charlie distribution — Estevez and Kulla 2017
// (r185 D_Charlie, lights_physical_pars_fragment.glsl.js:321-332).
fn a3dPrd04DCharlie(roughness: f32, dotNH: f32) -> f32 {
	let alpha = pow2(roughness);

	let invAlpha = 1.0 / alpha;
	let cos2h = dotNH * dotNH;
	let sin2h = max(1.0 - cos2h, 0.0078125); // 2^(-14/2), so sin2h^2 > 0 in fp16

	return (2.0 + invAlpha) * pow(sin2h, invAlpha * 0.5) / (2.0 * PI);
}

// Neubelt visibility — Neubelt and Pettineo 2013
// (r185 V_Neubelt, lights_physical_pars_fragment.glsl.js:335-340).
fn a3dPrd04VNeubelt(dotNV: f32, dotNL: f32) -> f32 {
	return saturate(1.0 / (4.0 * (dotNL + dotNV - dotNL * dotNV)));
}

// BRDF_Sheen = sheenColor * ( D_Charlie * V_Neubelt ) (r185 :342-355).
fn a3dPrd04SheenDirect(lightDir: vec3f, viewDir: vec3f, normal: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> vec3f {
	let halfDir = normalize(lightDir + viewDir);

	let dotNL = saturate(dot(normal, lightDir));
	let dotNV = saturate(dot(normal, viewDir));
	let dotNH = saturate(dot(normal, halfDir));

	let D = a3dPrd04DCharlie(sheenRoughness, dotNH);
	let V = a3dPrd04VNeubelt(dotNV, dotNL);

	return sheenColor * (D * V);
}

// Curve-fit hemisphere integral of the Charlie BRDF — Estevez and Kulla 2017
// (r185 IBLSheenBRDF, lights_physical_pars_fragment.glsl.js:361-375).
fn a3dPrd04IBLSheen(dotNV: f32, roughness: f32) -> f32 {
	let r2 = roughness * roughness;
	let rInv = 1.0 / (roughness + 0.1);

	let a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	let b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;

	let DG = exp(a * dotNV + b);

	return saturate(DG);
}

// Indirect sheen term: irradiance * sheenColor * IBLSheenBRDF / PI
// (r185 :587-589).
fn a3dPrd04SheenIndirect(normal: vec3f, viewDir: vec3f, sheenRoughness: f32, sheenColor: vec3f, irradiance: vec3f) -> vec3f {
	let sheenAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), sheenRoughness);

	return irradiance * sheenColor * sheenAlbedo * RECIPROCAL_PI;
}

// Direct-energy compensation factor: 1 - max3( sheenColor ) * max( V, L )
// (r185 :547-552).
fn a3dPrd04SheenEnergyCompensation(normal: vec3f, viewDir: vec3f, lightDir: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> f32 {
	let sheenAlbedoV = a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), sheenRoughness);
	let sheenAlbedoL = a3dPrd04IBLSheen(saturate(dot(normal, lightDir)), sheenRoughness);

	return 1.0 - max3(sheenColor) * max(sheenAlbedoV, sheenAlbedoL);
}

// Indirect (diffuse) energy compensation (r185 :565-571).
fn a3dPrd04SheenEnergyCompensationIndirect(normal: vec3f, viewDir: vec3f, sheenColor: vec3f, sheenRoughness: f32) -> f32 {
	let sheenAlbedo = a3dPrd04IBLSheen(saturate(dot(normal, viewDir)), sheenRoughness);

	return 1.0 - max3(sheenColor) * sheenAlbedo;
}
`;

export const A3D_PRD04_SHEEN_WGSL = wgsl;
export default wgsl;
