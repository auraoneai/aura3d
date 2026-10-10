/**
 * PRD-04 pars/call split for the generated-program path (T0-05 / 04-LOBES,
 * PRD-04 §8, P3-2/P3-3; three r185 lights_physical_fragment.glsl.js and
 * meshphysical.glsl.js composition order).
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
 *   - clearcoat: direct (bucketed lights) + indirect (equirect env) coat, base
 *     attenuation by `1 - clearcoat * Fcc` (r185 meshphysical.glsl.js:205-212);
 *   - sheen: direct + indirect sheen, view-dependent energy compensation;
 *   - transmission/volume/dispersion: screen-space refraction replaces the
 *     diffuse term under A3D_TRANSMISSION (the transmission target feature);
 *   - ior/specular/emissive-strength/unlit: the base PhysicalMaterial and
 *     emissive path already consume u_ior, u_specularIntensity,
 *     u_specularColorFactor, u_emissiveStrength; the calls only record state;
 *   - iridescence, anisotropy: lobe state is resolved (debug views read it);
 *     their Fresnel / anisotropic-GGX energy terms need a per-light lobe hook
 *     and are pending (04-LOBES follow-up). Clustered lights are not looped by
 *     lobe direct terms (A3D_NUM_DIRECT_LIGHTS is 0 there).
 */
import type { ShaderChunk } from "../../contracts/program";

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

// ── ior + specular (base PhysicalMaterial already consumes the factors) ─────

export const A3D_PRD04_SPECULAR_IOR_CALL = chunk("a3d_prd04_specular_ior_call", /* glsl */ `{
	${ENSURE}
	// u_ior / u_specularIntensity (renamed from u_specularFactor) /
	// u_specularColorFactor already built material.specularColor in a3dMakeMaterial.
	a3dLobes.ior = material.ior;
}`, ["a3d_prd04_specular_ior", "a3d_prd04_lobes_state"]);

// ── clearcoat ────────────────────────────────────────────────────────────────

export const A3D_PRD04_CLEARCOAT_PARS = chunk("a3d_prd04_clearcoat_pars", /* glsl */ `
uniform float u_clearcoatFactor;
uniform float u_clearcoatRoughnessFactor;
`, ["a3d_prd04_clearcoat", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_CLEARCOAT_CALL = chunk("a3d_prd04_clearcoat_call", /* glsl */ `{
	${ENSURE}
	a3dPrd04ClearcoatInit( a3dLobes, u_clearcoatFactor, u_clearcoatRoughnessFactor, vec4( 1.0 ), vec4( 1.0 ), geometryNormal, a3dPrd04GeometryRoughness( geometryNormal ) );
}`, ["a3d_prd04_clearcoat_pars"]);

export const A3D_PRD04_CLEARCOAT_IBL_CALL = chunk("a3d_prd04_clearcoat_ibl_call", /* glsl */ `if ( a3dLobes.clearcoat > 0.0 ) {
	vec3 a3dCcN = a3dLobes.clearcoatNormal;
	vec3 a3dCcDirect = vec3( 0.0 );
	for ( int a3dCcI = 0; a3dCcI < A3D_NUM_DIRECT_LIGHTS; ++a3dCcI ) {
		vec3 a3dCcL;
		vec3 a3dCcRadiance = a3dLegacyLightRadiance( a3dCcI * 6, v_worldPosition, a3dCcL );
		a3dCcDirect += a3dCcRadiance * saturate( dot( a3dCcN, a3dCcL ) ) * a3dPrd04ClearcoatDirect( a3dCcL, V, a3dCcN, a3dLobes.clearcoatRoughness );
	}
	vec3 a3dCcEnv = vec3( 0.0 );
#ifdef ENVMAP_TYPE_EQUIRECT
	a3dCcEnv = a3dSampleEnvironment( reflect( -V, a3dCcN ), a3dLobes.clearcoatRoughness * 8.0 );
#endif
	vec3 a3dCcIndirect = a3dPrd04ClearcoatIndirect( a3dCcN, V, a3dLobes.clearcoatRoughness, a3dCcEnv );
	vec3 a3dCcFresnel = F_Schlick( vec3( 0.04 ), 1.0, saturate( dot( a3dCcN, V ) ) );
	vec3 a3dCcBase = vec3( 1.0 ) - a3dLobes.clearcoat * a3dCcFresnel;
	directDiffuse *= a3dCcBase;
	directSpecular *= a3dCcBase;
	indirectDiffuse *= a3dCcBase;
	indirectSpecular *= a3dCcBase;
	directSpecular += a3dCcDirect * a3dLobes.clearcoat;
	indirectSpecular += a3dCcIndirect * a3dLobes.clearcoat;
}`, ["a3d_prd04_clearcoat_pars"]);

// ── sheen ────────────────────────────────────────────────────────────────────

export const A3D_PRD04_SHEEN_PARS = chunk("a3d_prd04_sheen_pars", /* glsl */ `
uniform vec3 u_sheenColorFactor;
uniform float u_sheenRoughnessFactor;
`, ["a3d_prd04_sheen", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_SHEEN_CALL = chunk("a3d_prd04_sheen_call", /* glsl */ `{
	${ENSURE}
	a3dPrd04SheenInit( a3dLobes, u_sheenColorFactor, u_sheenRoughnessFactor, vec4( 1.0 ), vec4( 1.0 ) );
}`, ["a3d_prd04_sheen_pars"]);

export const A3D_PRD04_SHEEN_IBL_CALL = chunk("a3d_prd04_sheen_ibl_call", /* glsl */ `if ( max3( a3dLobes.sheenColor ) > 0.0 ) {
	vec3 a3dShDirect = vec3( 0.0 );
	for ( int a3dShI = 0; a3dShI < A3D_NUM_DIRECT_LIGHTS; ++a3dShI ) {
		vec3 a3dShL;
		vec3 a3dShRadiance = a3dLegacyLightRadiance( a3dShI * 6, v_worldPosition, a3dShL );
		a3dShDirect += a3dShRadiance * saturate( dot( N, a3dShL ) ) * a3dPrd04SheenDirect( a3dShL, V, N, a3dLobes.sheenColor, a3dLobes.sheenRoughness );
	}
	vec3 a3dShIrradiance = u_environmentColor * u_environmentIntensity;
#ifdef ENVMAP_TYPE_EQUIRECT
	a3dShIrradiance += a3dSampleEnvironment( N, 8.0 );
#endif
	vec3 a3dShIndirect = a3dPrd04SheenIndirect( N, V, a3dLobes.sheenRoughness, a3dLobes.sheenColor, a3dShIrradiance );
	float a3dShComp = a3dPrd04SheenEnergyCompensationIndirect( N, V, a3dLobes.sheenColor, a3dLobes.sheenRoughness );
	directDiffuse *= a3dShComp;
	directSpecular *= a3dShComp;
	indirectDiffuse *= a3dShComp;
	indirectSpecular *= a3dShComp;
	directSpecular += a3dShDirect;
	indirectSpecular += a3dShIndirect;
}`, ["a3d_prd04_sheen_pars"]);

// ── iridescence / anisotropy (state only; energy terms pending) ─────────────

export const A3D_PRD04_IRIDESCENCE_PARS = chunk("a3d_prd04_iridescence_pars", /* glsl */ `
uniform float u_iridescenceFactor;
uniform float u_iridescenceIor;
uniform float u_iridescenceThicknessMinimum;
uniform float u_iridescenceThicknessMaximum;
`, ["a3d_prd04_iridescence", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_IRIDESCENCE_CALL = chunk("a3d_prd04_iridescence_call", /* glsl */ `{
	${ENSURE}
	a3dPrd04IridescenceInit( a3dLobes, u_iridescenceFactor, u_iridescenceIor, vec4( 1.0 ), vec4( 1.0 ), u_iridescenceThicknessMinimum, u_iridescenceThicknessMaximum, material.specularColor, material.baseColor, material.metallic, saturate( dot( N, V ) ) );
}`, ["a3d_prd04_iridescence_pars"]);

export const A3D_PRD04_ANISOTROPY_PARS = chunk("a3d_prd04_anisotropy_pars", /* glsl */ `
uniform float u_anisotropyStrength;
uniform float u_anisotropyRotation;
`, ["a3d_prd04_anisotropy", "a3d_prd04_lobes_state"]);

// Needs the prd04.tangentFrame feature (A3D_PRD04_TANGENT_FRAME) for T/B.
export const A3D_PRD04_ANISOTROPY_CALL = chunk("a3d_prd04_anisotropy_call", /* glsl */ `{
	${ENSURE}
#ifdef A3D_PRD04_TANGENT_FRAME
	if ( dot( a3dPrd04TangentT, a3dPrd04TangentT ) > 0.0 ) {
		vec2 a3dAnisoVector = vec2( cos( u_anisotropyRotation ), sin( u_anisotropyRotation ) ) * u_anisotropyStrength;
		a3dPrd04AnisotropyInit( a3dLobes, a3dAnisoVector, vec4( 0.0 ), false, a3dPrd04TangentT, a3dPrd04TangentB, material.roughness );
	}
#endif
}`, ["a3d_prd04_anisotropy_pars"]);

// ── transmission / volume / dispersion ──────────────────────────────────────

export const A3D_PRD04_VOLUME_PARS = chunk("a3d_prd04_volume_pars", /* glsl */ `
uniform float u_volumeThicknessFactor;
uniform float u_volumeAttenuationDistance;
uniform vec3 u_volumeAttenuationColor;
`, ["a3d_prd04_volume", "a3d_prd04_lobes_state"]);

export const A3D_PRD04_VOLUME_CALL = chunk("a3d_prd04_volume_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.thickness = u_volumeThicknessFactor;
	a3dLobes.attenuationDistance = u_volumeAttenuationDistance;
	a3dLobes.attenuationColor = u_volumeAttenuationColor;
}`, ["a3d_prd04_volume_pars"]);

export const A3D_PRD04_TRANSMISSION_PARS = chunk("a3d_prd04_transmission_pars", /* glsl */ `
uniform float u_transmissionFactor;
uniform mat4 u_modelMatrix;
`, ["a3d_prd04_transmission", "a3d_prd04_lobes_state"]);

// Thin-walled by default: thickness / attenuation stay at the
// a3dPrd04LobesEnsure defaults (0, 1e30, white) unless the volume lobe's call
// sets them. Copying the volume uniforms here read them as 0 on materials
// without KHR_materials_volume, and a3dVolumeAttenuation(0, 0) is NaN
// (lane-04 review on #877).
export const A3D_PRD04_TRANSMISSION_CALL = chunk("a3d_prd04_transmission_call", /* glsl */ `{
	${ENSURE}
	a3dLobes.transmission = saturate( u_transmissionFactor );
}`, ["a3d_prd04_transmission_pars"]);

// r185 transmission_fragment.glsl.js: totalDiffuse = mix( totalDiffuse,
// transmitted.rgb, transmission ). Needs the opaque-scene target
// (prd04.transmissionTarget feature → A3D_TRANSMISSION).
export const A3D_PRD04_TRANSMISSION_IBL_CALL = chunk("a3d_prd04_transmission_ibl_call", /* glsl */ `#ifdef A3D_TRANSMISSION
if ( a3dLobes.transmission > 0.0 ) {
#ifdef A3D_LOBE_DISPERSION
	vec4 a3dTr = a3dGetIBLVolumeRefractionDispersion( N, V, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90, v_worldPosition, u_modelMatrix, a3dLobes.dispersion, a3dLobes.ior, a3dLobes.thickness, a3dLobes.attenuationColor, a3dLobes.attenuationDistance );
#else
	vec4 a3dTr = a3dGetIBLVolumeRefraction( N, V, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90, v_worldPosition, u_modelMatrix, a3dLobes.ior, a3dLobes.thickness, a3dLobes.attenuationColor, a3dLobes.attenuationDistance );
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
	// u_emissiveColor * u_emissiveStrength (r185 emissivemap_fragment.glsl.js).
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
#endif
`, ["a3d_prd04_tangent_frame"], "both");

/** vertex:world — world tangent from the (deformed) object tangent; zero when absent. */
export const A3D_PRD04_TANGENT_FRAME_VERTEX_CALL = chunk("a3d_prd04_tangent_frame_vertex_call", /* glsl */ `v_prd04Tangent = dot( objectTangent.xyz, objectTangent.xyz ) > 0.0
		? a3dPrd04TangentWorld( mat3( u_modelMatrix ) * mat3( instanceMatrix ), objectTangent )
		: vec4( 0.0 );`, ["a3d_prd04_tangent_frame_state"], "vertex");

/** fragment:normal — re-orthogonalized T/B for lobes (anisotropy) and debug views. */
export const A3D_PRD04_TANGENT_FRAME_CALL = chunk("a3d_prd04_tangent_frame_call", /* glsl */ `if ( dot( v_prd04Tangent.xyz, v_prd04Tangent.xyz ) > 0.0 ) {
	mat3 a3dPrd04Tbn = a3dPrd04TangentFrame( geometryNormal, v_prd04Tangent, 1.0 );
	a3dPrd04TangentT = a3dPrd04Tbn[ 0 ];
	a3dPrd04TangentB = a3dPrd04Tbn[ 1 ];
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
export const PRD04_CALL_CHUNKS: readonly ShaderChunk[] = [
	A3D_PRD04_LOBES_STATE,
	A3D_PRD04_SPECULAR_IOR_CALL,
	A3D_PRD04_CLEARCOAT_PARS,
	A3D_PRD04_CLEARCOAT_CALL,
	A3D_PRD04_CLEARCOAT_IBL_CALL,
	A3D_PRD04_SHEEN_PARS,
	A3D_PRD04_SHEEN_CALL,
	A3D_PRD04_SHEEN_IBL_CALL,
	A3D_PRD04_IRIDESCENCE_PARS,
	A3D_PRD04_IRIDESCENCE_CALL,
	A3D_PRD04_ANISOTROPY_PARS,
	A3D_PRD04_ANISOTROPY_CALL,
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
	A3D_PRD04_DEBUG_VIEW_CALL
];
