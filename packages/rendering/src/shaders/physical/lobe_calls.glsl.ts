/**
 * PRD-04 pars/call split for the generated-program path (T0-05 / 04-LOBES,
 * PRD-04 §8, P3-2/P3-3; layer order of the Khronos KHR_materials_*
 * extension specifications).
 *
 * The fifteen `a3d_prd04_*` chunks in this directory are *declaration*
 * chunks: functions, structs and guarded uniforms. The C-02 generator emits
 * them at global scope. These chunks are the matching *call* chunks (statement
 * bodies spliced inside `main`) plus the small pars chunks that declare the
 * uniforms the calls read. Each call `requires` its pars, so the generator
 * resolves the whole closure requires-first.
 *
 * Splice points (ProgramGenerator):
 *   - C-03 lobe `chunks.fragment` -> `fragment:material` (after
 *     `PhysicalMaterial material`; N, V, geometryNormal in scope);
 *   - C-03 lobe `chunks.ibl` -> appended to `fragment:indirect`, after the
 *     default ambient/env body, over the final direct + indirect accumulators;
 *   - ShaderFeature body hooks per `materials/features.ts`.
 * Guards come from generator defines: A3D_LOBE_<ID>, A3D_LIT,
 * A3D_NUM_DIRECT_LIGHTS, A3D_STAGE_VERTEX, plus the feature defines.
 *
 * Coverage (what is wired into energy today):
 *   - per light (C-03 `chunks.direct`, spliced inside BOTH the bucketed and
 *     the clustered light loops): clearcoat and sheen accumulate their direct
 *     lobes; iridescence mixes the single-scatter Fresnel toward the thin
 *     film; anisotropy swaps isotropic for anisotropic GGX (KHR_materials_anisotropy);
 *   - ibl: iridescence thin-film multiscatter and the anisotropy bent normal
 *     replace the base env specular (order 5), then sheen (20) and clearcoat
 *     (30) compose over the final accumulators (KHR_materials_sheen and
 *     KHR_materials_clearcoat layering);
 *   - lobe textures use independently selected UV sets and transforms;
 *     clearcoat normal maps perturb the coat's own shading normal;
 *   - transmission/volume/dispersion: screen-space refraction replaces the
 *     diffuse term under A3D_TRANSMISSION (the transmission target feature);
 *   - ior/specular/emissive-strength/unlit: the base PhysicalMaterial and
 *     emissive path already consume u_ior, u_specularIntensity,
 *     u_specularColorFactor, u_emissiveStrength; the calls only record state.
 */
import type { ShaderChunk } from "../../contracts/program";
import { AUTHORED_TANGENT_GLSL } from "../../materials/authoredTangent";

function chunk(name: string, glsl: string, requires: readonly string[], stage: ShaderChunk["stage"] = "fragment"): ShaderChunk {
	return { name, owner: "prd04", glsl, stage, requires };
}

const ENSURE = "a3dPrd04LobesEnsure( material.ior, material.roughness, geometryNormal );";

/** Global lobe state + one-time defaults; every lobe call `ensure`s it first. */
export const A3D_PRD04_LOBES_STATE = chunk("a3d_prd04_lobes_state", /* glsl */ `
A3DPrd04Lobes a3dLobes;
bool a3dPrd04LobesReady = false;
void a3dPrd04LobesEnsure( const in float ior, const in float roughness, const in vec3 normal ) {
	if ( a3dPrd04LobesReady ) return;
	a3dPrd04LobesReady = true;
	a3dLobes.ior = ior;
	a3dLobes.clearcoat = 0.0;
	a3dLobes.clearcoatRoughness = 0.0;
	a3dLobes.clearcoatNormal = normal;
	a3dLobes.sheenColor = vec3( 0.0 );
	a3dLobes.sheenRoughness = 0.0;
	a3dLobes.iridescence = 0.0;
	a3dLobes.iridescenceIOR = 1.3;
	a3dLobes.iridescenceThickness = 0.0;
	a3dLobes.iridescenceFresnel = vec3( 0.0 );
	a3dLobes.iridescenceF0 = vec3( 0.0 );
	a3dLobes.anisotropy = 0.0;
	a3dLobes.anisotropyT = vec3( 0.0 );
	a3dLobes.anisotropyB = vec3( 0.0 );
	a3dLobes.alphaT = pow2( roughness );
	a3dLobes.transmission = 0.0;
	a3dLobes.thickness = 0.0;
	a3dLobes.attenuationDistance = 1.0e30;
	a3dLobes.attenuationColor = vec3( 1.0 );
	a3dLobes.dispersion = 0.0;
}
`, ["brdf", "a3d_prd04_bsdf_lobes_common"]);

// ── thin diffuse transmission ──────────────────────────────────────────────
// Opposite-hemisphere illumination replaces the corresponding share of the
// dielectric diffuse reflection, below the existing Fresnel/specular layer.
export const A3D_PRD04_DIFFUSE_TRANSMISSION_PARS = chunk("a3d_prd04_diffuse_transmission_pars", /* glsl */ `
uniform float u_diffuseTransmissionFactor;
uniform vec3 u_diffuseTransmissionColorFactor;
#ifdef A3D_LOBE_DIFFUSE_TRANSMISSION_MAP
uniform sampler2D u_diffuseTransmissionTexture;
#endif
#ifdef A3D_LOBE_DIFFUSE_TRANSMISSION_COLOR_MAP
uniform sampler2D u_diffuseTransmissionColorTexture;
#endif
float a3dDiffuseTransmissionFactor;
vec3 a3dDiffuseTransmissionColor;
vec3 a3dDiffuseTransmissionDirect = vec3(0.0);
`, ["brdf"]);

export const A3D_PRD04_DIFFUSE_TRANSMISSION_CALL = chunk("a3d_prd04_diffuse_transmission_call", /* glsl */ `
a3dDiffuseTransmissionFactor = clamp(u_diffuseTransmissionFactor, 0.0, 1.0);
a3dDiffuseTransmissionColor = clamp(u_diffuseTransmissionColorFactor, 0.0, 1.0);
#ifdef A3D_LOBE_DIFFUSE_TRANSMISSION_MAP
a3dDiffuseTransmissionFactor *= texture(u_diffuseTransmissionTexture, A3D_LOBE_UV_DIFFUSE_TRANSMISSION).a;
#endif
#ifdef A3D_LOBE_DIFFUSE_TRANSMISSION_COLOR_MAP
a3dDiffuseTransmissionColor *= texture(u_diffuseTransmissionColorTexture, A3D_LOBE_UV_DIFFUSE_TRANSMISSION_COLOR).rgb;
#endif
a3dDiffuseTransmissionFactor = clamp(a3dDiffuseTransmissionFactor, 0.0, 1.0);
a3dDiffuseTransmissionColor = clamp(a3dDiffuseTransmissionColor, 0.0, 1.0);
`, ["a3d_prd04_diffuse_transmission_pars"]);

export const A3D_PRD04_DIFFUSE_TRANSMISSION_DIRECT_CALL = chunk("a3d_prd04_diffuse_transmission_direct_call", /* glsl */ `{
  float backNl = max(-dot(N, L), 0.0);
  float viewNl = max(dot(N, V), 0.0);
  if (backNl > 0.0 && viewNl > 0.0) {
    vec3 viewF = F_Schlick(material.specularColor, material.specularIntensity, viewNl);
    vec3 lightF = F_Schlick(material.specularColor, material.specularIntensity, backNl);
    vec3 available = vec3(1.0) - saturate(max(viewF, lightF));
    a3dDiffuseTransmissionDirect += max(radiance, vec3(0.0)) * backNl * RECIPROCAL_PI
      * (1.0 - material.metallic) * a3dDiffuseTransmissionFactor * a3dDiffuseTransmissionColor * available;
  }
}`, ["a3d_prd04_diffuse_transmission_pars"]);

export const A3D_PRD04_DIFFUSE_TRANSMISSION_IBL_CALL = chunk("a3d_prd04_diffuse_transmission_ibl_call", /* glsl */ `{
  PhysicalMaterial backMaterial = material;
  backMaterial.diffuseContribution = (1.0 - material.metallic) * a3dDiffuseTransmissionFactor * a3dDiffuseTransmissionColor;
  vec3 transmittedIndirect = a3dIndirectDiffuse(a3dBackEnvIrradiance, V, N, backMaterial)
    + a3dBackAmbientExitRadiance * backMaterial.diffuseContribution;
#ifdef USE_OCCLUSION_MAP
  transmittedIndirect *= a3dAo;
#endif
  directDiffuse = directDiffuse * (1.0 - a3dDiffuseTransmissionFactor) + a3dDiffuseTransmissionDirect;
  indirectDiffuse = indirectDiffuse * (1.0 - a3dDiffuseTransmissionFactor) + transmittedIndirect;
}`, ["a3d_prd04_diffuse_transmission_pars"]);

// ── ior + specular (base PhysicalMaterial already consumes the factors) ─────

export const A3D_PRD04_SPECULAR_IOR_PARS = chunk("a3d_prd04_specular_ior_pars", /* glsl */ `
#ifdef A3D_LOBE_SPECULAR_SPECULAR_MAP
uniform sampler2D u_specularTexture;
#endif
#ifdef A3D_LOBE_SPECULAR_SPECULAR_COLOR_MAP
uniform sampler2D u_specularColorTexture;
#endif
`, ["a3d_prd04_specular_ior", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_SPECULAR_IOR_CALL = chunk("a3d_prd04_specular_ior_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.ior = material.ior;
#if defined(A3D_LOBE_SPECULAR_SPECULAR_MAP) || defined(A3D_LOBE_SPECULAR_SPECULAR_COLOR_MAP)
	float strengthTexel = 1.0;
	vec3 colorTexel = vec3( 1.0 );
#ifdef A3D_LOBE_SPECULAR_SPECULAR_MAP
	strengthTexel = texture( u_specularTexture, A3D_LOBE_UV_SPECULAR ).a;
#endif
#ifdef A3D_LOBE_SPECULAR_SPECULAR_COLOR_MAP
	colorTexel = texture( u_specularColorTexture, A3D_LOBE_UV_SPECULAR_COLOR ).rgb;
#endif
	vec3 specColor = a3dPrd04SpecIorFactors( u_specularColorFactor, u_specularIntensity, colorTexel, strengthTexel, material.specularIntensity );
	material.specularColor = a3dPrd04SpecIorSpecularColor( material.ior, specColor, material.specularIntensity );
	material.specularColorBlended = a3dPrd04SpecIorSpecularColorBlended( material.specularColor, min( material.baseColor, vec3( 1.0 ) ), material.metallic );
	material.specularF90 = a3dPrd04SpecIorSpecularF90( material.specularIntensity, material.metallic );
#endif
}`, ["a3d_prd04_specular_ior_pars"]);

// ── clearcoat ────────────────────────────────────────────────────────────────
// Textures (KHR_materials_clearcoat): `.x` of the coat
// map scales the factor, `.y` of the coat-roughness map scales roughness.
// The per-light coat term accumulates in `a3dPrd04CoatDirect` (direct call,
// every light incl. clustered); the ibl call composes coat over the base.

export const A3D_PRD04_CLEARCOAT_PARS = chunk("a3d_prd04_clearcoat_pars", /* glsl */ `
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
#ifdef A3D_LOBE_CLEARCOAT_MAP
uniform sampler2D u_clearcoatTexture;
#endif
#ifdef A3D_LOBE_CLEARCOAT_ROUGHNESS_MAP
uniform sampler2D u_clearcoatRoughnessTexture;
#endif
#ifdef A3D_LOBE_CLEARCOAT_NORMAL_MAP
uniform sampler2D u_clearcoatNormalTexture;
uniform float u_clearcoatNormalScale;
vec3 a3dPrd04CoatNormal( vec3 position, vec3 normal, vec2 uv ) {
	vec3 dx = dFdx( position ), dy = dFdy( position );
	vec2 ux = dFdx( uv ), uy = dFdy( uv );
	float determinant = ux.x * uy.y - ux.y * uy.x;
	if ( abs( determinant ) < 1e-8 ) return normal;
	vec3 tangent = ( dx * uy.y - dy * ux.y ) / determinant;
	vec3 bitangent = ( dy * ux.x - dx * uy.x ) / determinant;
	tangent -= normal * dot( tangent, normal );
	bitangent -= normal * dot( bitangent, normal );
	if ( dot( tangent, tangent ) < 1e-12 || dot( bitangent, bitangent ) < 1e-12 ) return normal;
	vec3 mapNormal = texture( u_clearcoatNormalTexture, uv ).xyz * 2.0 - 1.0;
	mapNormal.xy *= u_clearcoatNormalScale;
	vec3 result = normalize( tangent ) * mapNormal.x + normalize( bitangent ) * mapNormal.y + normal * mapNormal.z;
	return dot( result, result ) > 1e-12 ? normalize( result ) : normal;
}
#endif
vec3 a3dPrd04CoatDirect = vec3( 0.0 );
`, ["a3d_prd04_clearcoat", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_CLEARCOAT_CALL = chunk("a3d_prd04_clearcoat_call", /* glsl */ `{
	${ENSURE}
	vec4 a3dCcTex = vec4( 1.0 );
	vec4 a3dCcRoughTex = vec4( 1.0 );
#ifdef A3D_LOBE_CLEARCOAT_MAP
	a3dCcTex = texture( u_clearcoatTexture, A3D_LOBE_UV_CLEARCOAT );
#endif
#ifdef A3D_LOBE_CLEARCOAT_ROUGHNESS_MAP
	a3dCcRoughTex = texture( u_clearcoatRoughnessTexture, A3D_LOBE_UV_CLEARCOAT_ROUGHNESS );
#endif
	vec3 a3dCoatNormal = geometryNormal;
#ifdef A3D_LOBE_CLEARCOAT_NORMAL_MAP
	a3dCoatNormal = a3dPrd04CoatNormal( v_worldPosition, geometryNormal, A3D_LOBE_UV_CLEARCOAT_NORMAL );
#ifdef A3D_PRD04_TANGENT_FRAME
	// Sampled outside the branch (implicit LOD); the authored frame wins.
	vec3 a3dCoatTexel = texture( u_clearcoatNormalTexture, A3D_LOBE_UV_CLEARCOAT_NORMAL ).xyz * 2.0 - 1.0;
	if ( a3dPrd04TangentAuthored ) a3dCoatNormal = a3dAuthoredMapNormal( mat3( a3dPrd04TangentT, a3dPrd04TangentB, geometryNormal ), a3dCoatTexel, u_clearcoatNormalScale );
#endif
#endif
	a3dPrd04ClearcoatInit( a3dLobes, u_clearcoatFactor, u_clearcoatRoughnessFactor, a3dCcTex, a3dCcRoughTex, a3dCoatNormal, a3dPrd04GeometryRoughness( geometryNormal ) );
}`, ["a3d_prd04_clearcoat_pars"]);

export const A3D_PRD04_CLEARCOAT_DIRECT_CALL = chunk("a3d_prd04_clearcoat_direct_call", /* glsl */ `if ( a3dLobes.clearcoat > 0.0 ) {
	vec3 a3dCcN = a3dLobes.clearcoatNormal;
	a3dPrd04CoatDirect += radiance * saturate( dot( a3dCcN, L ) ) * a3dPrd04ClearcoatDirect( L, V, a3dCcN, a3dLobes.clearcoatRoughness );
}`, ["a3d_prd04_clearcoat_pars"]);

export const A3D_PRD04_CLEARCOAT_IBL_CALL = chunk("a3d_prd04_clearcoat_ibl_call", /* glsl */ `if ( a3dLobes.clearcoat > 0.0 ) {
	vec3 a3dCcN = a3dLobes.clearcoatNormal;
	vec3 a3dCcEnv = a3dLobeEnvironment( reflect( -V, a3dCcN ), a3dLobes.clearcoatRoughness );
	vec3 a3dCcIndirect = a3dPrd04ClearcoatIndirect( a3dCcN, V, a3dLobes.clearcoatRoughness, a3dCcEnv );
	vec3 a3dCcFresnel = F_Schlick( vec3( 0.04 ), 1.0, saturate( dot( a3dCcN, V ) ) );
	vec3 a3dCcBase = vec3( 1.0 ) - a3dLobes.clearcoat * a3dCcFresnel;
	directDiffuse *= a3dCcBase;
	directSpecular *= a3dCcBase;
	indirectDiffuse *= a3dCcBase;
	indirectSpecular *= a3dCcBase;
	directSpecular += a3dPrd04CoatDirect * a3dLobes.clearcoat;
	indirectSpecular += a3dCcIndirect * a3dLobes.clearcoat;
}`, ["a3d_prd04_clearcoat_pars"]);

// ── sheen ────────────────────────────────────────────────────────────────────
// Textures: sheen colour map `.rgb`, sheen roughness map `.a` (KHR_materials_sheen).

export const A3D_PRD04_SHEEN_PARS = chunk("a3d_prd04_sheen_pars", /* glsl */ `
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
#ifdef A3D_LOBE_SHEEN_COLOR_MAP
uniform sampler2D u_sheenColorTexture;
#endif
#ifdef A3D_LOBE_SHEEN_ROUGHNESS_MAP
uniform sampler2D u_sheenRoughnessTexture;
#endif
vec3 a3dPrd04SheenDirectSum = vec3( 0.0 );
`, ["a3d_prd04_sheen", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_SHEEN_CALL = chunk("a3d_prd04_sheen_call", /* glsl */ `{
	${ENSURE}
	vec4 a3dShColorTex = vec4( 1.0 );
	vec4 a3dShRoughTex = vec4( 1.0 );
#ifdef A3D_LOBE_SHEEN_COLOR_MAP
	a3dShColorTex = texture( u_sheenColorTexture, A3D_LOBE_UV_SHEEN_COLOR );
#endif
#ifdef A3D_LOBE_SHEEN_ROUGHNESS_MAP
	a3dShRoughTex = texture( u_sheenRoughnessTexture, A3D_LOBE_UV_SHEEN_ROUGHNESS );
#endif
	a3dPrd04SheenInit( a3dLobes, u_sheenColorFactor, u_sheenRoughnessFactor, a3dShColorTex, a3dShRoughTex );
}`, ["a3d_prd04_sheen_pars"]);

export const A3D_PRD04_SHEEN_DIRECT_CALL = chunk("a3d_prd04_sheen_direct_call", /* glsl */ `if ( max3( a3dLobes.sheenColor ) > 0.0 ) {
	a3dPrd04SheenDirectSum += radiance * saturate( dot( N, L ) ) * a3dPrd04SheenDirect( L, V, N, a3dLobes.sheenColor, a3dLobes.sheenRoughness );
}`, ["a3d_prd04_sheen_pars"]);

export const A3D_PRD04_SHEEN_IBL_CALL = chunk("a3d_prd04_sheen_ibl_call", /* glsl */ `if ( max3( a3dLobes.sheenColor ) > 0.0 ) {
	vec3 a3dShIrradiance = u_environmentColor * u_environmentIntensity;
	a3dShIrradiance += a3dLobeIrradiance * RECIPROCAL_PI;
	vec3 a3dShIndirect = a3dPrd04SheenIndirect( N, V, a3dLobes.sheenRoughness, a3dLobes.sheenColor, a3dShIrradiance );
	float a3dShComp = a3dPrd04SheenEnergyCompensationIndirect( N, V, a3dLobes.sheenColor, a3dLobes.sheenRoughness );
	directDiffuse *= a3dShComp;
	directSpecular *= a3dShComp;
	indirectDiffuse *= a3dShComp;
	indirectSpecular *= a3dShComp;
	directSpecular += a3dPrd04SheenDirectSum;
	indirectSpecular += a3dShIndirect;
}`, ["a3d_prd04_sheen_pars"]);

// ── iridescence ──────────────────────────────────────────────────────────────
// Textures: iridescence map `.r`, thickness map `.g` (KHR_materials_iridescence).
// Energy (thin-film Fresnel in the single- and multiple-scatter terms): per light the single-scatter
// Fresnel is mixed toward the thin-film Fresnel (delta over the base GGX the
// default loop already added); the ibl call replaces the base env specular
// with the thin-film multiscatter. Runs before sheen/clearcoat (order 5).

export const A3D_PRD04_IRIDESCENCE_PARS = chunk("a3d_prd04_iridescence_pars", /* glsl */ `
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
#ifdef A3D_LOBE_IRIDESCENCE_MAP
uniform sampler2D u_iridescenceTexture;
#endif
#ifdef A3D_LOBE_IRIDESCENCE_THICKNESS_MAP
uniform sampler2D u_iridescenceThicknessTexture;
#endif
`, ["a3d_prd04_iridescence", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_IRIDESCENCE_CALL = chunk("a3d_prd04_iridescence_call", /* glsl */ `{
	${ENSURE}
	vec4 a3dIrTex = vec4( 1.0 );
	vec4 a3dIrThickTex = vec4( 1.0 );
#ifdef A3D_LOBE_IRIDESCENCE_MAP
	a3dIrTex = texture( u_iridescenceTexture, A3D_LOBE_UV_IRIDESCENCE );
#endif
#ifdef A3D_LOBE_IRIDESCENCE_THICKNESS_MAP
	a3dIrThickTex = texture( u_iridescenceThicknessTexture, A3D_LOBE_UV_IRIDESCENCE_THICKNESS );
#endif
	a3dPrd04IridescenceInit( a3dLobes, u_iridescenceFactor, u_iridescenceIor, a3dIrTex, a3dIrThickTex, u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, material.specularColor, material.baseColor, material.metallic, saturate( dot( N, V ) ) );
}`, ["a3d_prd04_iridescence_pars"]);

export const A3D_PRD04_IRIDESCENCE_DIRECT_CALL = chunk("a3d_prd04_iridescence_direct_call", /* glsl */ `if ( a3dLobes.iridescence > 0.0 ) {
	vec3 a3dIrH = normalize( L + V );
	float a3dIrNL = saturate( dot( N, L ) );
	float a3dIrNV = saturate( dot( N, V ) );
	float a3dIrA = pow2( material.roughness );
	vec3 a3dIrF = F_Schlick( material.specularColorBlended, material.specularF90, saturate( dot( V, a3dIrH ) ) );
	vec3 a3dIrFilm = a3dPrd04IridescenceFresnelMix( a3dIrF, a3dLobes.iridescenceFresnel, a3dLobes.iridescence );
	float a3dIrVD = V_GGX_SmithCorrelated( a3dIrA, a3dIrNL, a3dIrNV ) * D_GGX( a3dIrA, saturate( dot( N, a3dIrH ) ) );
	directSpecular += radiance * a3dIrNL * ( a3dIrFilm - a3dIrF ) * a3dIrVD;
}`, ["a3d_prd04_iridescence_pars"]);

export const A3D_PRD04_IRIDESCENCE_IBL_CALL = chunk("a3d_prd04_iridescence_ibl_call", /* glsl */ `#if defined(A3D_ENV_SAMPLE) || defined(A3D_LOCAL_PROBE) || defined(LIGHT_HEMISPHERE) || defined(A3D_LOCAL_DIFFUSE_IRRADIANCE)
if ( a3dLobes.iridescence > 0.0 ) {
	vec3 a3dIrEnv = a3dLobeEnvironment( reflect( -V, N ), material.roughness );
	vec3 a3dIrSingle = vec3( 0.0 );
	vec3 a3dIrMulti = vec3( 0.0 );
	a3dPrd04ComputeMultiscatteringIridescence( N, V, material.specularColorBlended, material.specularF90, a3dLobes.iridescence, a3dLobes.iridescenceF0, material.roughness, a3dIrSingle, a3dIrMulti );
	// Split-sum indirect specular: radiance * single + multi * irradiance / PI
	// (a3dEnvIrradiance comes from the default indirect body, same #ifdef).
	indirectSpecular += a3dIrEnv * a3dIrSingle + a3dIrMulti * ( a3dLobeIrradiance * RECIPROCAL_PI ) - a3dIndirectSpecular( a3dIrEnv, a3dLobeIrradiance, V, N, material );
}
#endif`, ["a3d_prd04_iridescence_pars"]);

// ── anisotropy ───────────────────────────────────────────────────────────────
// Texture: anisotropy map `.rgb` (direction rg, strength b; KHR_materials_anisotropy). Needs the
// prd04.tangentFrame feature (A3D_PRD04_TANGENT_FRAME) for T/B. Energy: per
// light the isotropic single-scatter GGX is swapped for the anisotropic GGX
// (KHR_materials_anisotropy); the ibl call reflects through the bent normal.

export const A3D_PRD04_ANISOTROPY_PARS = chunk("a3d_prd04_anisotropy_pars", /* glsl */ `
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
#ifdef A3D_LOBE_ANISOTROPY_MAP
uniform sampler2D u_anisotropyTexture;
#endif
`, ["a3d_prd04_anisotropy", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_ANISOTROPY_CALL = chunk("a3d_prd04_anisotropy_call", /* glsl */ `{
	${ENSURE}
#ifdef A3D_PRD04_TANGENT_FRAME
	// Recover the basis from the selected, transformed anisotropy UV when
	// available. It also handles geometry without an authored tangent.
#ifdef A3D_LOBE_ANISOTROPY_MAP
	// An authored TANGENT always defines the anisotropy frame; the transformed
	// anisotropy-UV derivative frame is only the fallback without one.
	vec2 a3dAnUv = A3D_LOBE_UV_ANISOTROPY;
	vec3 a3dAnDx = dFdx( v_worldPosition ), a3dAnDy = dFdy( v_worldPosition );
	vec2 a3dAnUx = dFdx( a3dAnUv ), a3dAnUy = dFdy( a3dAnUv );
	float a3dAnDet = a3dAnUx.x * a3dAnUy.y - a3dAnUx.y * a3dAnUy.x;
	if ( !a3dPrd04TangentAuthored && abs( a3dAnDet ) > 1e-8 ) {
		vec3 tangent = ( a3dAnDx * a3dAnUy.y - a3dAnDy * a3dAnUx.y ) / a3dAnDet;
		vec3 bitangent = ( a3dAnDy * a3dAnUx.x - a3dAnDx * a3dAnUy.x ) / a3dAnDet;
		tangent -= N * dot( tangent, N );
		bitangent -= N * dot( bitangent, N );
		if ( dot( tangent, tangent ) > 1e-12 && dot( bitangent, bitangent ) > 1e-12 ) {
			a3dPrd04TangentT = normalize( tangent );
			a3dPrd04TangentB = normalize( bitangent );
		}
	}
#endif
	if ( dot( a3dPrd04TangentT, a3dPrd04TangentT ) < 1e-12 ) {
		vec3 axis = abs( N.z ) < 0.9 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
		a3dPrd04TangentT = normalize( cross( axis, N ) );
		a3dPrd04TangentB = cross( N, a3dPrd04TangentT );
	}
	if ( dot( a3dPrd04TangentT, a3dPrd04TangentT ) > 0.0 ) {
		vec2 a3dAnisoVector = vec2( cos( u_anisotropyRotation ), sin( u_anisotropyRotation ) ) * u_anisotropyStrength;
		vec4 a3dAnisoTex = vec4( 0.0 );
		bool a3dAnisoUseTex = false;
#ifdef A3D_LOBE_ANISOTROPY_MAP
		a3dAnisoTex = texture( u_anisotropyTexture, A3D_LOBE_UV_ANISOTROPY );
		a3dAnisoUseTex = true;
#endif
		a3dPrd04AnisotropyInit( a3dLobes, a3dAnisoVector, a3dAnisoTex, a3dAnisoUseTex, a3dPrd04TangentT, a3dPrd04TangentB, material.roughness );
	}
#endif
}`, ["a3d_prd04_anisotropy_pars"]);

export const A3D_PRD04_ANISOTROPY_DIRECT_CALL = chunk("a3d_prd04_anisotropy_direct_call", /* glsl */ `if ( a3dLobes.anisotropy > 0.0 ) {
	vec3 a3dAnH = normalize( L + V );
	float a3dAnNL = saturate( dot( N, L ) );
	float a3dAnNV = saturate( dot( N, V ) );
	float a3dAnA = pow2( material.roughness );
	vec3 a3dAnF = F_Schlick( material.specularColorBlended, material.specularF90, saturate( dot( V, a3dAnH ) ) );
	vec3 a3dAnIso = a3dAnF * ( V_GGX_SmithCorrelated( a3dAnA, a3dAnNL, a3dAnNV ) * D_GGX( a3dAnA, saturate( dot( N, a3dAnH ) ) ) );
	vec3 a3dAnAniso = a3dPrd04AnisotropyDirect( L, V, N, material.specularColorBlended, material.specularF90, material.roughness, a3dLobes );
	directSpecular += radiance * a3dAnNL * ( a3dAnAniso - a3dAnIso );
}`, ["a3d_prd04_anisotropy_pars"]);

export const A3D_PRD04_ANISOTROPY_IBL_CALL = chunk("a3d_prd04_anisotropy_ibl_call", /* glsl */ `#if defined(A3D_ENV_SAMPLE) || defined(A3D_LOCAL_PROBE) || defined(LIGHT_HEMISPHERE)
if ( a3dLobes.anisotropy > 0.0 ) {
	vec3 a3dAnBent = a3dPrd04AnisotropyBentNormal( V, N, material.roughness, a3dLobes.anisotropyB, a3dLobes.anisotropy );
	vec3 a3dAnEnvBent = a3dLobeEnvironment( reflect( -V, a3dAnBent ), material.roughness );
	vec3 a3dAnEnvIso = a3dLobeEnvironment( reflect( -V, N ), material.roughness );
	indirectSpecular += a3dIndirectSpecular( a3dAnEnvBent, a3dLobeIrradiance, V, N, material ) - a3dIndirectSpecular( a3dAnEnvIso, a3dLobeIrradiance, V, N, material );
}
#endif`, ["a3d_prd04_anisotropy_pars"]);

// ── transmission / volume / dispersion ──────────────────────────────────────

export const A3D_PRD04_VOLUME_PARS = chunk("a3d_prd04_volume_pars", /* glsl */ `
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
#ifdef A3D_LOBE_VOLUME_THICKNESS_MAP
uniform sampler2D u_volumeThicknessTexture;
#endif
`, ["a3d_prd04_volume", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_VOLUME_CALL = chunk("a3d_prd04_volume_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.thickness = u_volumeThicknessFactor;
#ifdef A3D_LOBE_VOLUME_THICKNESS_MAP
	a3dLobes.thickness *= texture( u_volumeThicknessTexture, A3D_LOBE_UV_VOLUME_THICKNESS ).g;
#endif
	a3dLobes.attenuationDistance = u_volumeAttenuationDistance;
	a3dLobes.attenuationColor = u_volumeAttenuationColor;
}`, ["a3d_prd04_volume_pars"]);

export const A3D_PRD04_TRANSMISSION_PARS = chunk("a3d_prd04_transmission_pars", /* glsl */ `
uniform float u_transmissionFactor;
uniform mat4 u_modelMatrix;
uniform mat4 u_geometryMatrix;
#ifdef A3D_LOBE_TRANSMISSION_MAP
uniform sampler2D u_transmissionTexture;
#endif
`, ["a3d_prd04_transmission", "a3d_prd04_lobes_state"]);

// Thin-walled by default: thickness / attenuation stay at the
// a3dPrd04LobesEnsure defaults (0, 1e30, white) unless the volume lobe's call
// sets them. Copying the volume uniforms here read them as 0 on materials
// without KHR_materials_volume, and a3dVolumeAttenuation(0, 0) is NaN
// (lane-04 review on #877).
export const A3D_PRD04_TRANSMISSION_CALL = chunk("a3d_prd04_transmission_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.transmission = saturate( u_transmissionFactor );
#ifdef A3D_LOBE_TRANSMISSION_MAP
	a3dLobes.transmission *= texture( u_transmissionTexture, A3D_LOBE_UV_TRANSMISSION ).r;
#endif
}`, ["a3d_prd04_transmission_pars"]);

// KHR_materials_transmission: totalDiffuse = mix( totalDiffuse,
// transmitted.rgb, transmission ). Needs the opaque-scene target
// (prd04.transmissionTarget feature → A3D_TRANSMISSION).
export const A3D_PRD04_TRANSMISSION_IBL_CALL = chunk("a3d_prd04_transmission_ibl_call", /* glsl */ `#ifdef A3D_TRANSMISSION
if ( a3dLobes.transmission > 0.0 ) {
#ifdef A3D_INSTANCE_VOLUME_TRANSFORM
	mat4 a3dTransmissionModel = mat4( vec4( v_a3dVolumeColumn0, 0.0 ), vec4( v_a3dVolumeColumn1, 0.0 ), vec4( v_a3dVolumeColumn2, 0.0 ), vec4( 0.0, 0.0, 0.0, 1.0 ) );
#else
	mat4 a3dTransmissionModel = u_modelMatrix * u_geometryMatrix;
#endif
#ifdef A3D_LOBE_DISPERSION
	vec4 a3dTr = a3dGetIBLVolumeRefractionDispersion( N, V, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90, v_worldPosition, a3dTransmissionModel, a3dLobes.dispersion, a3dLobes.ior, a3dLobes.thickness, a3dLobes.attenuationColor, a3dLobes.attenuationDistance );
#else
	vec4 a3dTr = a3dGetIBLVolumeRefraction( N, V, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90, v_worldPosition, a3dTransmissionModel, a3dLobes.ior, a3dLobes.thickness, a3dLobes.attenuationColor, a3dLobes.attenuationDistance );
#endif
	vec3 a3dTotalDiffuse = directDiffuse + indirectDiffuse;
	directDiffuse = vec3( 0.0 );
	indirectDiffuse = mix( a3dTotalDiffuse, a3dTr.rgb, a3dLobes.transmission );
}
#endif`, ["a3d_prd04_transmission_pars"]);

export const A3D_PRD04_DISPERSION_PARS = chunk("a3d_prd04_dispersion_pars", /* glsl */ `
uniform float u_dispersion;
`, ["a3d_prd04_dispersion", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_DISPERSION_CALL = chunk("a3d_prd04_dispersion_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.dispersion = u_dispersion;
}`, ["a3d_prd04_dispersion_pars"]);

// ── emissive strength / unlit (consumed by the base path) ───────────────────

export const A3D_PRD04_EMISSIVE_STRENGTH_CALL = chunk("a3d_prd04_emissive_strength_call", /* glsl */ `{
	// KHR_materials_emissive_strength: the base emissive path already applies
	// u_emissiveColor * u_emissiveStrength (KHR_materials_emissive_strength).
}`, ["a3d_prd04_emissive_strength"]);

export const A3D_PRD04_UNLIT_CALL = chunk("a3d_prd04_unlit_call", /* glsl */ `{
	// KHR_materials_unlit: the record's lighting is "unlit", so lit programs
	// never splice this lobe; kept so the lobe has a call chunk like every other.
}`, ["a3d_prd04_unlit"]);

// ── ShaderFeature call chunks (materials/features.ts) ───────────────────────

/** Tangent varying + fragment T/B globals (prd04.tangentFrame). */
export const A3D_PRD04_TANGENT_FRAME_STATE = chunk("a3d_prd04_tangent_frame_state", /* glsl */ `
#ifdef A3D_STAGE_VERTEX
out vec4 v_prd04Tangent;
#else
in vec4 v_prd04Tangent;
vec3 a3dPrd04TangentT = vec3( 0.0 );
vec3 a3dPrd04TangentB = vec3( 0.0 );
// True when T/B come from the authored TANGENT attribute (WP-04 identity).
bool a3dPrd04TangentAuthored = false;
${AUTHORED_TANGENT_GLSL}
#endif
`, ["a3d_prd04_tangent_frame"], "both");

/** vertex:world — world tangent from the (deformed) object tangent; zero when absent. */
export const A3D_PRD04_TANGENT_FRAME_VERTEX_CALL = chunk("a3d_prd04_tangent_frame_vertex_call", /* glsl */ `mat3 a3dTangentTransform = mat3( u_modelMatrix ) * mat3( instanceMatrix ) * mat3( u_geometryMatrix );
v_prd04Tangent = dot( objectTangent.xyz, objectTangent.xyz ) > 0.0
		? a3dPrd04TangentWorld( a3dTangentTransform, objectTangent )
		: vec4( 0.0 );
if ( determinant( a3dTangentTransform ) < 0.0 ) v_prd04Tangent.w *= -1.0;`, ["a3d_prd04_tangent_frame_state"], "vertex");

/** fragment:normal — re-orthogonalized T/B for lobes (anisotropy) and debug views. */
export const A3D_PRD04_TANGENT_FRAME_CALL = chunk("a3d_prd04_tangent_frame_call", /* glsl */ `if ( dot( v_prd04Tangent.xyz, v_prd04Tangent.xyz ) > 0.0 ) {
	// Authored frame: B = sign(w) * cross(N, T), back faces negate the frame.
	mat3 a3dPrd04Tbn = a3dAuthoredTangentFrame( geometryNormal, v_prd04Tangent, a3dPrd04FaceDirection() );
	a3dPrd04TangentT = a3dPrd04Tbn[ 0 ];
	a3dPrd04TangentB = a3dPrd04Tbn[ 1 ];
	a3dPrd04TangentAuthored = true;
}`, ["a3d_prd04_tangent_frame_state"]);

/** fragment:alpha — MASK + alpha-to-coverage (ALPHA_TO_COVERAGE skips the hard cutoff). */
export const A3D_PRD04_ALPHA_A2C_CALL = chunk("a3d_prd04_alpha_a2c_call", /* glsl */ `a3dPrd04AlphaToCoverage( a3dAlpha, u_alphaCutoff );`, ["a3d_prd04_alpha_a2c"]);

/** fragment:end — replaces the output color with the selected debug channel. */
export const A3D_PRD04_DEBUG_VIEW_CALL = chunk("a3d_prd04_debug_view_call", /* glsl */ `{
	A3DPrd04DebugInput a3dDbg;
	a3dDbg.baseColor = a3dBaseColor.rgb;
	a3dDbg.alpha = a3dAlpha;
	a3dDbg.emissive = a3dEmissive;
	a3dDbg.occlusion = 1.0;
#if defined( USE_OCCLUSION_MAP ) && defined( A3D_LIT )
	a3dDbg.occlusion = a3dAo;
#endif
	a3dDbg.uv0 = vec2( 0.0 );
	a3dDbg.uv1 = vec2( 0.0 );
#ifdef A3D_NEED_UV0
	a3dDbg.uv0 = v_uv;
#endif
#ifdef A3D_NEED_UV1
	a3dDbg.uv1 = v_uv1;
#endif
	a3dDbg.tangent = vec3( 0.0 );
#ifdef A3D_PRD04_TANGENT_FRAME
	a3dDbg.tangent = a3dPrd04TangentT;
#endif
#ifdef A3D_LIT
	${ENSURE}
	a3dDbg.normal = N;
	a3dDbg.roughness = a3dRoughness;
	a3dDbg.roughnessEffective = material.roughness;
	a3dDbg.metallic = material.metallic;
	a3dDbg.specularF0 = material.specularColor;
#else
	a3dPrd04LobesEnsure( 1.5, 1.0, vec3( 0.0, 0.0, 1.0 ) );
	a3dDbg.normal = vec3( 0.0, 0.0, 1.0 );
	a3dDbg.roughness = 1.0;
	a3dDbg.roughnessEffective = 1.0;
	a3dDbg.metallic = 0.0;
	a3dDbg.specularF0 = vec3( 0.04 );
#endif
	a3dColor = a3dPrd04DebugView( a3dDbg, a3dLobes );
}`, ["a3d_prd04_debug_view", "a3d_prd04_lobes_state"]);

/** Every pars/call chunk above, registered with the fifteen declaration chunks. */
// ── rim (#88, R-14-14 §8.10) ────────────────────────────────────────────────
// Lane-original: a view-dependent Fresnel-style rim added
// to the emissive term, so it survives tone mapping like other emission and is
// not attenuated by the coat/sheen energy terms. Lit programs only (N, V).

export const A3D_PRD04_RIM_PARS = chunk("a3d_prd04_rim_pars", /* glsl */ `
uniform vec3 u_prd04RimColor;
uniform float u_prd04RimStrength;
uniform float u_prd04RimPower;
`, ["common"]);

export const A3D_PRD04_RIM_CALL = chunk("a3d_prd04_rim_call", /* glsl */ `#ifdef A3D_LIT
{
	float a3dRim = pow( 1.0 - saturate( dot( N, V ) ), max( u_prd04RimPower, 0.01 ) );
	a3dEmissive += u_prd04RimColor * ( u_prd04RimStrength * a3dRim );
}
#endif`, ["a3d_prd04_rim_pars"]);

export const PRD04_CALL_CHUNKS: readonly ShaderChunk[] = [
	A3D_PRD04_LOBES_STATE,
	A3D_PRD04_DIFFUSE_TRANSMISSION_PARS,
	A3D_PRD04_DIFFUSE_TRANSMISSION_CALL,
	A3D_PRD04_DIFFUSE_TRANSMISSION_DIRECT_CALL,
	A3D_PRD04_DIFFUSE_TRANSMISSION_IBL_CALL,
	A3D_PRD04_SPECULAR_IOR_PARS,
	A3D_PRD04_SPECULAR_IOR_CALL,
	A3D_PRD04_CLEARCOAT_PARS,
	A3D_PRD04_CLEARCOAT_CALL,
	A3D_PRD04_CLEARCOAT_IBL_CALL,
	A3D_PRD04_CLEARCOAT_DIRECT_CALL,
	A3D_PRD04_SHEEN_PARS,
	A3D_PRD04_SHEEN_CALL,
	A3D_PRD04_SHEEN_IBL_CALL,
	A3D_PRD04_SHEEN_DIRECT_CALL,
	A3D_PRD04_IRIDESCENCE_PARS,
	A3D_PRD04_IRIDESCENCE_CALL,
	A3D_PRD04_IRIDESCENCE_DIRECT_CALL,
	A3D_PRD04_IRIDESCENCE_IBL_CALL,
	A3D_PRD04_ANISOTROPY_PARS,
	A3D_PRD04_ANISOTROPY_CALL,
	A3D_PRD04_ANISOTROPY_DIRECT_CALL,
	A3D_PRD04_ANISOTROPY_IBL_CALL,
	A3D_PRD04_VOLUME_PARS,
	A3D_PRD04_VOLUME_CALL,
	A3D_PRD04_TRANSMISSION_PARS,
	A3D_PRD04_TRANSMISSION_CALL,
	A3D_PRD04_TRANSMISSION_IBL_CALL,
	A3D_PRD04_DISPERSION_PARS,
	A3D_PRD04_DISPERSION_CALL,
	A3D_PRD04_EMISSIVE_STRENGTH_CALL,
	A3D_PRD04_UNLIT_CALL,
	A3D_PRD04_TANGENT_FRAME_STATE,
	A3D_PRD04_TANGENT_FRAME_VERTEX_CALL,
	A3D_PRD04_TANGENT_FRAME_CALL,
	A3D_PRD04_ALPHA_A2C_CALL,
	A3D_PRD04_DEBUG_VIEW_CALL,
	A3D_PRD04_RIM_PARS,
	A3D_PRD04_RIM_CALL
];
