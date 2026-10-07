/**
 * a3d_prd04_sheen — KHR_materials_sheen (PRD-04 §8.4).
 *
 * Ported from three r185:
 *  - Factor resolution: sheenColor = factor * tex.rgb,
 *    sheenRoughness = clamp( factor, 0.0001, 1 ) * tex.a —
 *    lights_physical_fragment.glsl.js:111-129.
 *  - `D_Charlie`, `V_Neubelt`, `BRDF_Sheen` (Estevez & Kulla 2017 /
 *    Neubelt & Pettineo 2013):
 *    lights_physical_pars_fragment.glsl.js:321-355.
 *  - `IBLSheenBRDF` curve-fit hemisphere integral:
 *    lights_physical_pars_fragment.glsl.js:361-375.
 *  - Energy compensation: direct
 *    `1 - max3( sheenColor ) * max( sheenAlbedoV, sheenAlbedoL )`
 *    (lights_physical_pars_fragment.glsl.js:543-554) and indirect
 *    `1 - max3( sheenColor ) * sheenAlbedo` (:563-571); indirect term
 *    `irradiance * sheenColor * IBLSheenBRDF / PI` (:587-589).
 *
 * Requires `brdf` (saturate, max3, RECIPROCAL_PI) and
 * `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes).
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
// Factor resolution (r185 lights_physical_fragment.glsl.js:111-129).
// colorTex = sheenColorMap texel (.rgb), roughnessTex = sheenRoughnessMap
// texel (.a); pass vec4(1.0) when no map is bound.
void a3dPrd04SheenInit( inout A3DPrd04Lobes lobes, const in vec3 sheenColorFactor, const in float sheenRoughnessFactor, const in vec4 colorTex, const in vec4 roughnessTex ) {

	lobes.sheenColor = sheenColorFactor * colorTex.rgb;
	lobes.sheenRoughness = clamp( sheenRoughnessFactor, 0.0001, 1.0 ) * roughnessTex.a;

}

// Charlie distribution — Estevez and Kulla 2017
// (r185 D_Charlie, lights_physical_pars_fragment.glsl.js:321-332).
float a3dPrd04DCharlie( const in float roughness, const in float dotNH ) {

	float alpha = pow2( roughness );

	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 ); // 2^(-14/2), so sin2h^2 > 0 in fp16

	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );

}

// Neubelt visibility — Neubelt and Pettineo 2013
// (r185 V_Neubelt, lights_physical_pars_fragment.glsl.js:335-340).
float a3dPrd04VNeubelt( const in float dotNV, const in float dotNL ) {

	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );

}

// BRDF_Sheen = sheenColor * ( D_Charlie * V_Neubelt )
// (r185 :342-355).
vec3 a3dPrd04SheenDirect( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 sheenColor, const in float sheenRoughness ) {

	vec3 halfDir = normalize( lightDir + viewDir );

	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );

	float D = a3dPrd04DCharlie( sheenRoughness, dotNH );
	float V = a3dPrd04VNeubelt( dotNV, dotNL );

	return sheenColor * ( D * V );

}

// Curve-fit hemisphere integral of the Charlie BRDF — Estevez and Kulla 2017
// (r185 IBLSheenBRDF, lights_physical_pars_fragment.glsl.js:361-375).
float a3dPrd04IBLSheen( const in float dotNV, const in float roughness ) {

	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );

	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;

	float DG = exp( a * dotNV + b );

	return saturate( DG );

}

// Indirect sheen term: irradiance * sheenColor * IBLSheenBRDF / PI
// (r185 :587-589).
vec3 a3dPrd04SheenIndirect( const in vec3 normal, const in vec3 viewDir, const in float sheenRoughness, const in vec3 sheenColor, const in vec3 irradiance ) {

	float sheenAlbedo = a3dPrd04IBLSheen( saturate( dot( normal, viewDir ) ), sheenRoughness );

	return irradiance * sheenColor * sheenAlbedo * RECIPROCAL_PI;

}

// Direct-energy compensation factor multiplied into the material irradiance:
// 1 - max3( sheenColor ) * max( sheenAlbedoV, sheenAlbedoL )
// (r185 :547-552).
float a3dPrd04SheenEnergyCompensation( const in vec3 normal, const in vec3 viewDir, const in vec3 lightDir, const in vec3 sheenColor, const in float sheenRoughness ) {

	float sheenAlbedoV = a3dPrd04IBLSheen( saturate( dot( normal, viewDir ) ), sheenRoughness );
	float sheenAlbedoL = a3dPrd04IBLSheen( saturate( dot( normal, lightDir ) ), sheenRoughness );

	return 1.0 - max3( sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );

}

// Indirect (diffuse) energy compensation: 1 - max3( sheenColor ) * sheenAlbedo
// (r185 :565-571).
float a3dPrd04SheenEnergyCompensationIndirect( const in vec3 normal, const in vec3 viewDir, const in vec3 sheenColor, const in float sheenRoughness ) {

	float sheenAlbedo = a3dPrd04IBLSheen( saturate( dot( normal, viewDir ) ), sheenRoughness );

	return 1.0 - max3( sheenColor ) * sheenAlbedo;

}
`;

export const A3D_PRD04_SHEEN: ShaderChunk = {
	name: "a3d_prd04_sheen",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
