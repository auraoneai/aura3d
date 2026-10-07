/**
 * a3d_prd04_clearcoat — KHR_materials_clearcoat (PRD-04 §8.3).
 *
 * Ported from three r185:
 *  - Factor resolution with spec-AA floor:
 *    lights_physical_fragment.glsl.js:56-80 (clearcoat *= tex.r,
 *    clearcoatRoughness *= tex.g, saturate(), 0.0525 floor + geometryRoughness,
 *    clamp to 1).
 *  - `BRDF_GGX_Clearcoat` (F0 = 0.04, F90 = 1.0):
 *    lights_physical_pars_fragment.glsl.js:126-149.
 *  - Indirect: `clearcoatRadiance * EnvironmentBRDF` over the DFG LUT:
 *    lights_physical_pars_fragment.glsl.js:581-585.
 *  - Layering composition `out = out * (1 - clearcoat * Fcc) +
 *    (ccDirect + ccIndirect) * clearcoat`:
 *    ShaderLib/meshphysical.glsl.js:205-212.
 *
 * Requires `brdf` (F_Schlick, V_GGX_SmithCorrelated, D_GGX, pow2, saturate)
 * and `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes,
 * a3dPrd04ResolveRoughness, a3dPrd04EnvironmentBRDF).
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
// Factor resolution (r185 lights_physical_fragment.glsl.js:56-80).
// clearcoatTex = clearcoatMap texel (.x), roughnessTex = clearcoatRoughnessMap
// texel (.y); pass vec4(1.0) when no map is bound.
void a3dPrd04ClearcoatInit( inout A3DPrd04Lobes lobes, const in float clearcoatFactor, const in float clearcoatRoughnessFactor, const in vec4 clearcoatTex, const in vec4 roughnessTex, const in vec3 clearcoatNormal, const in float geometryRoughness ) {

	float clearcoat = clearcoatFactor * clearcoatTex.x;
	float clearcoatRoughness = clearcoatRoughnessFactor * roughnessTex.y;

	clearcoat = saturate( clearcoat ); // Burley clearcoat model

	lobes.clearcoat = clearcoat;
	lobes.clearcoatRoughness = a3dPrd04ResolveRoughness( clearcoatRoughness, geometryRoughness );
	lobes.clearcoatNormal = clearcoatNormal;

}

// Direct GGX lobe at F0 0.04 / F90 1.0 (r185 BRDF_GGX_Clearcoat,
// lights_physical_pars_fragment.glsl.js:126-149).
vec3 a3dPrd04ClearcoatDirect( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in float clearcoatRoughness ) {

	float alpha = pow2( clearcoatRoughness ); // UE4's roughness

	vec3 halfDir = normalize( lightDir + viewDir );

	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );

	vec3 F = F_Schlick( vec3( 0.04 ), 1.0, dotVH );

	float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( V * D );

}

// Indirect: clearcoatRadiance * EnvironmentBRDF( Ncc, V, 0.04, 1.0, ccR )
// (r185 lights_physical_pars_fragment.glsl.js:581-585).
vec3 a3dPrd04ClearcoatIndirect( const in vec3 normal, const in vec3 viewDir, const in float clearcoatRoughness, const in vec3 clearcoatRadiance ) {

	return clearcoatRadiance * a3dPrd04EnvironmentBRDF( normal, viewDir, vec3( 0.04 ), 1.0, clearcoatRoughness );

}

// Layering composition (r185 meshphysical.glsl.js:205-212):
// dotNVcc = saturate( dot( ccN, V ) ); Fcc = F_Schlick( 0.04, 1.0, dotNVcc );
// out = out * ( 1 - clearcoat * Fcc ) + ( ccDirect + ccIndirect ) * clearcoat.
vec3 a3dPrd04ComposeClearcoat( const in vec3 outgoing, const in float clearcoat, const in vec3 clearcoatNormal, const in vec3 viewDir, const in vec3 clearcoatDirect, const in vec3 clearcoatIndirect ) {

	float dotNVcc = saturate( dot( clearcoatNormal, viewDir ) );
	vec3 Fcc = F_Schlick( vec3( 0.04 ), 1.0, dotNVcc );

	return outgoing * ( 1.0 - clearcoat * Fcc ) + ( clearcoatDirect + clearcoatIndirect ) * clearcoat;

}
`;

export const A3D_PRD04_CLEARCOAT: ShaderChunk = {
	name: "a3d_prd04_clearcoat",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
