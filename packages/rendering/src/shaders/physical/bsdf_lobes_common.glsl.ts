/**
 * a3d_prd04_bsdf_lobes_common — shared PRD 04 lobe infrastructure (PRD-04 §8.2).
 *
 * Ported from three r185:
 *  - `A3DPrd04Lobes` mirrors the PRD 04-owned fields of `PhysicalMaterial`,
 *    src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js:5-58.
 *    Any field PRD 01's `brdf` chunk struct lacks lives here until request
 *    Q-01-5 lands (PRD-04 §8.2 comment block).
 *  - `a3dPrd04GeometryRoughness` — geometric specular antialiasing,
 *    lights_physical_fragment.glsl.js:7-12.
 *  - `a3dPrd04SpecularOcclusion` — computeSpecularOcclusion,
 *    lights_physical_pars_fragment.glsl.js:651-656.
 *  - `a3dPrd04EnvironmentBRDF` — EnvironmentBRDF over the PRD 01 `brdf` chunk's
 *    `a3dDFG` accessor (lights_physical_pars_fragment.glsl.js:377-384). Lobes
 *    never sample `u_dfgLut` directly so the (roughness, NdotV) axis order is
 *    decided in one place (PRD-04 §8.2).
 *  - `a3dPrd04ComputeMultiscattering` — computeMultiscattering,
 *    lights_physical_pars_fragment.glsl.js:390-419.
 *
 * Requires the `brdf` chunk (PRD 01 / test shim): saturate, pow2, EPSILON,
 * a3dDFG.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_BSDF_LOBES_COMMON_WGSL from "../physical-wgsl/bsdf_lobes_common.wgsl.js";

const glsl = /* glsl */ `
struct A3DPrd04Lobes {
	float ior;
	float clearcoat;
	float clearcoatRoughness;
	vec3 clearcoatNormal;
	vec3 sheenColor;
	float sheenRoughness;
	float iridescence;
	float iridescenceIOR;
	float iridescenceThickness;
	vec3 iridescenceFresnel;
	vec3 iridescenceF0;
	float anisotropy;
	vec3 anisotropyT;
	vec3 anisotropyB;
	float alphaT;
	float transmission;
	float thickness;
	float attenuationDistance;
	vec3 attenuationColor;
	float dispersion;
};

// Geometric specular AA (r185 lights_physical_fragment.glsl.js:7-12).
// Returns the roughness increment from screen-space normal divergence.
float a3dPrd04GeometryRoughness( const in vec3 nonPerturbedNormal ) {

	vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
	return max( max( dxy.x, dxy.y ), dxy.z );

}

// r185 roughness floor (base mip of a 256 cubemap), then spec-AA clamp to 1.
float a3dPrd04ResolveRoughness( const in float roughnessFactor, const in float geometryRoughness ) {

	float roughness = max( roughnessFactor, 0.0525 );
	roughness += geometryRoughness;
	return min( roughness, 1.0 );

}

// Specular occlusion (r185 computeSpecularOcclusion,
// lights_physical_pars_fragment.glsl.js:651-656). Multiplies indirect specular;
// the ao term itself multiplies indirect diffuse (PRD-04 §8.2 [02] row).
float a3dPrd04SpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {

	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );

}

// Environment BRDF (r185 EnvironmentBRDF,
// lights_physical_pars_fragment.glsl.js:377-384) over a3dDFG. f90 is scalar in
// r185 (specularF90); F = f0 * ab.x + f90 * ab.y.
vec3 a3dPrd04EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {

	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = a3dDFG( roughness, dotNV );

	return specularColor * fab.x + specularF90 * fab.y;

}

// IBL multiscattering (r185 computeMultiscattering,
// lights_physical_pars_fragment.glsl.js:390-419; single LUT fetch at NdotV).
void a3dPrd04ComputeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {

	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = a3dDFG( roughness, dotNV );

	vec3 Fr = specularColor;

	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;

	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;

	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619; // 1/21
	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );

	singleScatter += FssEss;
	multiScatter += Fms * Ems;

}
`;

export const A3D_PRD04_BSDF_LOBES_COMMON: ShaderChunk = {
	name: "a3d_prd04_bsdf_lobes_common",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_BSDF_LOBES_COMMON_WGSL,
	stage: "fragment",
	requires: ["brdf"]
};
