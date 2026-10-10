/**
 * brdf_r185 — test-only `brdf` chunk (PRD-04 §14 P1-2).
 *
 * Stands in for PRD 01's production `brdf` chunk inside ChunkHarness until
 * Q-01-5 lands. Every PRD 04 lobe chunk compiles against this shim; once the
 * real `brdf` chunk registers, the shim stops registering and lobes must
 * keep compiling unchanged — that is the contract the Q-01-5 header comment
 * records.
 *
 * Contents are verbatim three r185 math:
 *  - helpers `saturate`, `pow2`, `pow3`, `pow4`, `max3`, `max4` + constants
 *    (common.glsl.js:5-20,105-135);
 *  - `F_Schlick` (vec3 + float), `Schlick_to_F0` (common.glsl.js:109-135,
 *    lights_physical_pars_fragment.glsl.js:66-72);
 *  - `BRDF_Lambert` (common.glsl.js);
 *  - `V_GGX_SmithCorrelated`, `D_GGX`
 *    (lights_physical_pars_fragment.glsl.js:76-97);
 *  - `PhysicalMaterial` struct (:5-58) — includes the PRD 04 lobe fields so
 *    the shim is a superset of what PRD 01 will ship;
 *  - `BRDF_GGX` + `BRDF_GGX_Multiscatter` (:153-199,424-461);
 *  - `EnvironmentBRDF` (:377-384);
 *  - `a3dDFG(roughness, dotNX)` — THE single DFG-LUT accessor; r185 samples
 *    `texture( dfgLUT, vec2( roughness, NdotX ) ).rg` and lobes must never
 *    sample `u_dfgLut` directly (PRD-04 §8.2 axis-order contract);
 *  - `a3dDirectSpecular` — irradiance * BRDF_GGX_Multiscatter
 *    (:556); `a3dDirectLight` — specular + Lambert diffuse (:556-558).
 */
import type { ShaderChunk } from "../../../../packages/rendering/src/contracts/program";

const glsl = /* glsl */ `
// --- r185 common.glsl.js helpers -------------------------------------------
#define PI 3.141592653589793
#define RECIPROCAL_PI 0.3183098861837907
#define EPSILON 1e-6

float saturate( const in float a ) { return clamp( a, 0.0, 1.0 ); }
vec3 saturate( const in vec3 a ) { return clamp( a, 0.0, 1.0 ); }
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float max4( const in vec4 v ) { return max( max( v.x, v.y ), max( v.z, v.w ) ); }

vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {

	// Optimized variant (presented in Epic's SIGGRAPH course notes)
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );

	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );

}

float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {

	// Optimized variant (presented in Epic's SIGGRAPH course notes)
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );

	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );

}

vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );

    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}

vec3 BRDF_Lambert( const in vec3 diffuseColor ) {

	return RECIPROCAL_PI * diffuseColor;

}

// --- r185 lights_physical_pars_fragment.glsl.js -----------------------------
uniform sampler2D u_dfgLut;

// The single DFG-LUT accessor (PRD-04 §8.2): lookup at
// (roughness, NdotX).rg. Every r185 LUT fetch in the lobes' ported code goes
// through this wrapper so the axis convention is decided once.
vec2 a3dDFG( const in float roughness, const in float dotNX ) {

	return texture( u_dfgLut, vec2( roughness, dotNX ) ).rg;

}

struct PhysicalMaterial {

	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;

	float roughness;
	float metalness;
	float specularF90;
	float dispersion;

	float clearcoat;
	float clearcoatRoughness;
	vec3 clearcoatF0;
	float clearcoatF90;

	float iridescence;
	float iridescenceIOR;
	float iridescenceThickness;
	vec3 iridescenceFresnel;
	vec3 iridescenceF0;
	vec3 iridescenceFresnelDielectric;
	vec3 iridescenceFresnelMetallic;

	vec3 sheenColor;
	float sheenRoughness;

	float ior;

	float transmission;
	float transmissionAlpha;
	float thickness;
	float attenuationDistance;
	vec3 attenuationColor;

	float anisotropy;
	float alphaT;
	vec3 anisotropyT;
	vec3 anisotropyB;

};

// Moving Frostbite to Physically Based Rendering 3.0 - page 12, listing 2
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {

	float a2 = alpha * alpha;
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * dotNV * dotNV );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * dotNL * dotNL );

	return 0.5 / max( gv + gl, EPSILON );

}

// Microfacet Models for Refraction through Rough Surfaces - equation (33)
float D_GGX( const in float alpha, const in float dotNH ) {

	float a2 = alpha * alpha;

	float denom = dotNH * dotNH * ( a2 - 1.0 ) + 1.0; // avoid alpha = 0 with dotNH = 1

	return RECIPROCAL_PI * a2 / ( denom * denom );

}

vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColorBlended, const in float specularF90, const in float roughness ) {

	float alpha = roughness * roughness;

	vec3 halfDir = normalize( lightDir + viewDir );

	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );

	vec3 F = F_Schlick( specularColorBlended, specularF90, dotVH );

	float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );

	float D = D_GGX( alpha, dotNH );

	return F * ( V * D );

}

vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {

	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = a3dDFG( roughness, dotNV );

	return specularColor * fab.x + specularF90 * fab.y;

}

// Turquin multi-scattering compensation for direct lighting
// (r185 BRDF_GGX_Multiscatter, lights_physical_pars_fragment.glsl.js:424-461).
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColorBlended, const in float specularF90, const in float roughness ) {

	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, specularColorBlended, specularF90, roughness );

	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );

	vec2 dfgV = a3dDFG( roughness, dotNV );
	vec2 dfgL = a3dDFG( roughness, dotNL );

	vec3 FssEss_V = specularColorBlended * dfgV.x + specularF90 * dfgV.y;
	vec3 FssEss_L = specularColorBlended * dfgL.x + specularF90 * dfgL.y;

	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;

	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;

	vec3 Favg = specularColorBlended + ( 1.0 - specularColorBlended ) * 0.047619; // 1/21

	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );

	float compensationFactor = Ems_V * Ems_L;

	vec3 multiScatter = Fms * compensationFactor;

	return singleScatter + multiScatter;

}

// Direct specular: irradiance * BRDF_GGX_Multiscatter
// (r185 lights_physical_pars_fragment.glsl.js:556).
vec3 a3dDirectSpecular( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 irradiance, const in vec3 specularColorBlended, const in float specularF90, const in float roughness ) {

	return irradiance * BRDF_GGX_Multiscatter( lightDir, viewDir, normal, specularColorBlended, specularF90, roughness );

}

// Direct lighting bundle: multiscatter specular + Lambert diffuse on the
// metallic-attenuated diffuseContribution (r185 :556-558).
vec3 a3dDirectLight( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 irradiance, const in vec3 diffuseContribution, const in vec3 specularColorBlended, const in float specularF90, const in float roughness ) {

	return irradiance * BRDF_GGX_Multiscatter( lightDir, viewDir, normal, specularColorBlended, specularF90, roughness ) +
		irradiance * BRDF_Lambert( diffuseContribution );

}
`;

export const BRDF_R185_SHIM_CHUNK: ShaderChunk = {
	name: "brdf",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: []
};
