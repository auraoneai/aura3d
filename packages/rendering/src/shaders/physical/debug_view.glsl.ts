/**
 * a3d_prd04_debug_view — material-channel debug visualization
 * (PRD-04 §8.2 [14], C-15 renderer.debugView).
 *
 * Contract: the debug feature emits exactly one
 * `A3D_PRD04_DEBUG_VIEW_<NAME>` define; `a3dPrd04DebugView` returns that
 * channel as linear RGB. Channels (C-15 debugView option): baseColor,
 * normal, roughness, metallic, clearcoat, clearcoatRoughness,
 * clearcoatRoughnessEffective, sheen, F0, tangent, anisotropyDirection.
 *
 * Inputs arrive via `A3DPrd04DebugInput` so a lobe not present in the
 * program passes zeros — the debug value for an inactive channel is black,
 * not a compile failure (PRD-04 §14.4 debug contract).
 *
 * Requires `a3d_prd04_bsdf_lobes_common` (A3DPrd04Lobes) and `brdf`.
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_DEBUG_VIEW_WGSL from "../physical-wgsl/debug_view.wgsl.js";

const glsl = /* glsl */ `
struct A3DPrd04DebugInput {
	vec3 baseColor;
	vec3 normal;
	float roughness;
	float metallic;
	vec3 specularF0;
	vec3 tangent;
	// T0-05: the remaining prd04.debugView channels (materials/features.ts
	// PRD04_DEBUG_VIEW_CHANNELS); each <NAME> also has a <NAME>EFFECTIVE define.
	float roughnessEffective;
	vec3 emissive;
	float occlusion;
	float alpha;
	vec2 uv0;
	vec2 uv1;
};

vec3 a3dPrd04DebugView( const in A3DPrd04DebugInput dbg, const in A3DPrd04Lobes lobes ) {

	#if defined( A3D_PRD04_DEBUG_VIEW_BASECOLOR ) || defined( A3D_PRD04_DEBUG_VIEW_BASECOLOREFFECTIVE )
		return dbg.baseColor;
	#elif defined( A3D_PRD04_DEBUG_VIEW_NORMAL ) || defined( A3D_PRD04_DEBUG_VIEW_NORMALEFFECTIVE )
		return dbg.normal * 0.5 + 0.5;
	#elif defined( A3D_PRD04_DEBUG_VIEW_ROUGHNESS )
		return vec3( dbg.roughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_ROUGHNESSEFFECTIVE )
		return vec3( dbg.roughnessEffective );
	#elif defined( A3D_PRD04_DEBUG_VIEW_METALLIC ) || defined( A3D_PRD04_DEBUG_VIEW_METALLICEFFECTIVE )
		return vec3( dbg.metallic );
	#elif defined( A3D_PRD04_DEBUG_VIEW_EMISSIVE ) || defined( A3D_PRD04_DEBUG_VIEW_EMISSIVEEFFECTIVE )
		return dbg.emissive;
	#elif defined( A3D_PRD04_DEBUG_VIEW_OCCLUSION ) || defined( A3D_PRD04_DEBUG_VIEW_OCCLUSIONEFFECTIVE )
		return vec3( dbg.occlusion );
	#elif defined( A3D_PRD04_DEBUG_VIEW_ALPHA ) || defined( A3D_PRD04_DEBUG_VIEW_ALPHAEFFECTIVE )
		return vec3( dbg.alpha );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT ) || defined( A3D_PRD04_DEBUG_VIEW_CLEARCOATEFFECTIVE )
		return vec3( lobes.clearcoat );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS )
		return vec3( lobes.clearcoatRoughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS_EFFECTIVE )
		return vec3( lobes.clearcoatRoughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_SHEEN ) || defined( A3D_PRD04_DEBUG_VIEW_SHEENCOLOR ) || defined( A3D_PRD04_DEBUG_VIEW_SHEENCOLOREFFECTIVE )
		return lobes.sheenColor;
	#elif defined( A3D_PRD04_DEBUG_VIEW_IRIDESCENCE ) || defined( A3D_PRD04_DEBUG_VIEW_IRIDESCENCEEFFECTIVE )
		return vec3( lobes.iridescence );
	#elif defined( A3D_PRD04_DEBUG_VIEW_ANISOTROPY ) || defined( A3D_PRD04_DEBUG_VIEW_ANISOTROPYEFFECTIVE )
		return vec3( lobes.anisotropy );
	#elif defined( A3D_PRD04_DEBUG_VIEW_TRANSMISSION ) || defined( A3D_PRD04_DEBUG_VIEW_TRANSMISSIONEFFECTIVE )
		return vec3( lobes.transmission );
	#elif defined( A3D_PRD04_DEBUG_VIEW_F0 )
		return dbg.specularF0;
	#elif defined( A3D_PRD04_DEBUG_VIEW_TANGENT ) || defined( A3D_PRD04_DEBUG_VIEW_TANGENTEFFECTIVE )
		return dbg.tangent * 0.5 + 0.5;
	#elif defined( A3D_PRD04_DEBUG_VIEW_ANISOTROPY_DIRECTION )
		return lobes.anisotropyT * 0.5 + 0.5;
	#elif defined( A3D_PRD04_DEBUG_VIEW_UV0 ) || defined( A3D_PRD04_DEBUG_VIEW_UV0EFFECTIVE )
		return vec3( fract( dbg.uv0 ), 0.0 );
	#elif defined( A3D_PRD04_DEBUG_VIEW_UV1 ) || defined( A3D_PRD04_DEBUG_VIEW_UV1EFFECTIVE )
		return vec3( fract( dbg.uv1 ), 0.0 );
	#else
		return vec3( 0.0 );
	#endif

}
`;

export const A3D_PRD04_DEBUG_VIEW: ShaderChunk = {
	name: "a3d_prd04_debug_view",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_DEBUG_VIEW_WGSL,
	stage: "fragment",
	requires: ["brdf", "a3d_prd04_bsdf_lobes_common"]
};
