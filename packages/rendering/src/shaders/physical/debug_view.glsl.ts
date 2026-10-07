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
};

vec3 a3dPrd04DebugView( const in A3DPrd04DebugInput dbg, const in A3DPrd04Lobes lobes ) {

	#ifdef A3D_PRD04_DEBUG_VIEW_BASECOLOR
		return dbg.baseColor;
	#elif defined( A3D_PRD04_DEBUG_VIEW_NORMAL )
		return dbg.normal * 0.5 + 0.5;
	#elif defined( A3D_PRD04_DEBUG_VIEW_ROUGHNESS )
		return vec3( dbg.roughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_METALLIC )
		return vec3( dbg.metallic );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT )
		return vec3( lobes.clearcoat );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS )
		return vec3( lobes.clearcoatRoughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_CLEARCOAT_ROUGHNESS_EFFECTIVE )
		return vec3( lobes.clearcoatRoughness );
	#elif defined( A3D_PRD04_DEBUG_VIEW_SHEEN )
		return lobes.sheenColor;
	#elif defined( A3D_PRD04_DEBUG_VIEW_F0 )
		return dbg.specularF0;
	#elif defined( A3D_PRD04_DEBUG_VIEW_TANGENT )
		return dbg.tangent * 0.5 + 0.5;
	#elif defined( A3D_PRD04_DEBUG_VIEW_ANISOTROPY_DIRECTION )
		return lobes.anisotropyT * 0.5 + 0.5;
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
