/**
 * a3d_prd04_anisotropy — KHR_materials_anisotropy (PRD-04 §8.6).
 *
 * Ported from three r185:
 *  - Direction resolution: `anisotropyV = mat2(rot) * normalize( 2 *
 *    anisoPolar.rg - 1 ) * anisoPolar.b`; `material.anisotropy =
 *    length(anisotropyV)`; zero → vec2(1,0) else normalize + saturate —
 *    lights_physical_fragment.glsl.js:131-152.
 *  - `alphaT = mix( pow2( roughness ), 1.0, pow2( anisotropy ) )` and the T/B
 *    tangent-frame basis — lights_physical_fragment.glsl.js:154-158.
 *  - `V_GGX_SmithCorrelated_Anisotropic` + `D_GGX_Anisotropic`:
 *    lights_physical_pars_fragment.glsl.js:102-119.
 *  - Direct lobe (anisotropic BRDF_GGX variant):
 *    lights_physical_pars_fragment.glsl.js:176-195.
 *  - IBL bent normal `getIBLAnisotropyRadiance`:
 *    envmap_physical_pars_fragment.glsl.js:38-56.
 *
 * Requires `brdf` (F_Schlick, pow2, pow4, saturate, EPSILON, RECIPROCAL_PI)
 * and `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes).
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_ANISOTROPY_WGSL from "../physical-wgsl/anisotropy.wgsl.js";

const glsl = /* glsl */ `
// Anisotropic visibility — Filament model (r185
// V_GGX_SmithCorrelated_Anisotropic, lights_physical_pars_fragment.glsl.js:102-108).
float a3dPrd04VGGXAnisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {

	float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
	float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );

}

// Anisotropic GGX distribution (r185 D_GGX_Anisotropic,
// lights_physical_pars_fragment.glsl.js:110-119).
float a3dPrd04DGGXAnisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {

	float a2 = alphaT * alphaB;
	highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
	highp float v2 = dot( v, v );
	float w2 = a2 / v2;

	return RECIPROCAL_PI * a2 * ( w2 * w2 );

}

// Direction/frame resolution (r185 lights_physical_fragment.glsl.js:131-158).
// anisotropyVector = strength*dir factor; anisoTex = anisotropyMap texel
// (.rg polar dir, .b strength); pass vec4(0.0) when no map is bound — the
// 2*rg-1 decode makes vec4(0.0) invalid, so useTexMap selects the path.
void a3dPrd04AnisotropyInit( inout A3DPrd04Lobes lobes, const in vec2 anisotropyVector, const in vec4 anisoTex, const in bool useAnisoTex, const in vec3 tangent, const in vec3 bitangent, const in float roughness ) {

	vec2 anisotropyV;
	if ( useAnisoTex ) {

		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = anisoTex.rgb;
		anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;

	} else {

		anisotropyV = anisotropyVector;

	}

	lobes.anisotropy = length( anisotropyV );

	if ( lobes.anisotropy == 0.0 ) {

		anisotropyV = vec2( 1.0, 0.0 );

	} else {

		anisotropyV /= lobes.anisotropy;
		lobes.anisotropy = saturate( lobes.anisotropy );

	}

	// Roughness along the anisotropy bitangent is the material roughness, while
	// the tangent roughness increases with anisotropy.
	lobes.alphaT = mix( pow2( roughness ), 1.0, pow2( lobes.anisotropy ) );

	lobes.anisotropyT = tangent * anisotropyV.x + bitangent * anisotropyV.y;
	lobes.anisotropyB = bitangent * anisotropyV.x - tangent * anisotropyV.y;

}

// Direct anisotropic specular (r185 BRDF_GGX USE_ANISOTROPY arm,
// lights_physical_pars_fragment.glsl.js:176-197).
vec3 a3dPrd04AnisotropyDirect( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 f0, const in float f90, const in float roughness, const in A3DPrd04Lobes lobes ) {

	float alpha = pow2( roughness );

	vec3 halfDir = normalize( lightDir + viewDir );

	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );

	vec3 F = F_Schlick( f0, f90, dotVH );

	float dotTL = dot( lobes.anisotropyT, lightDir );
	float dotTV = dot( lobes.anisotropyT, viewDir );
	float dotTH = dot( lobes.anisotropyT, halfDir );
	float dotBL = dot( lobes.anisotropyB, lightDir );
	float dotBV = dot( lobes.anisotropyB, viewDir );
	float dotBH = dot( lobes.anisotropyB, halfDir );

	float V = a3dPrd04VGGXAnisotropic( lobes.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );

	float D = a3dPrd04DGGXAnisotropic( lobes.alphaT, alpha, dotNH, dotTH, dotBH );

	return F * ( V * D );

}

// IBL bent normal (r185 getIBLAnisotropyRadiance,
// envmap_physical_pars_fragment.glsl.js:38-56) — returns the direction the
// caller reflects through the env map.
vec3 a3dPrd04AnisotropyBentNormal( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {

	vec3 bentNormal = cross( bitangent, viewDir );
	bentNormal = normalize( cross( bentNormal, bitangent ) );
	return normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );

}
`;

export const A3D_PRD04_ANISOTROPY: ShaderChunk = {
	name: "a3d_prd04_anisotropy",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_ANISOTROPY_WGSL,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
