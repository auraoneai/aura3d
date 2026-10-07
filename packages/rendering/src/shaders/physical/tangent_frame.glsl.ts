/**
 * a3d_prd04_tangent_frame — TANGENT attribute TBN construction (PRD-04 §8.11,
 * tangents requirement R2).
 *
 * Ported from three r185:
 *  - Vertex: `v_tangent = vec4( normalize( mat3( skinnedModel ) *
 *    a_tangent.xyz ), a_tangent.w )` —
 *    ShaderChunk/defaultnormal_vertex + skinnormal path (tangent transformed
 *    by the same skinning matrix as the normal, w bitangent sign preserved).
 *  - Fragment: TBN assembly + re-orthogonalization
 *    `T = normalize( T - N * dot( N, T ) ); B = cross( N, T ) * w` —
 *    normal_fragment_begin.glsl.js:24-48; double-sided face-direction flip on
 *    both axes (:42-47).
 *  - `getTangentFrame` derivative fallback (Normal Mapping Without
 *    Precomputed Tangents, thetenthplanet.de/archives/1180):
 *    normalmap_pars_fragment.glsl.js:15-40 — active only under
 *    `A3D_TANGENT_DERIVATIVE` when the mesh lacks a TANGENT attribute
 *    (PRD-04 §8.11 decision: authored TANGENT wins; derivative frame is the
 *    documented fallback, never silently substituted on meshes that carry
 *    tangents).
 *
 * Stage "both": the vertex arm computes the varying, the fragment arm builds
 * the frame. Self-contained (no requires).
 */
import type { ShaderChunk } from "../../contracts/program";
import A3D_PRD04_TANGENT_FRAME_WGSL from "../physical-wgsl/tangent_frame.wgsl.js";

const glsl = /* glsl */ `
#ifdef A3D_STAGE_VERTEX

// v_tangent payload: xyz = world-space tangent, w = bitangent sign
// (r185 defaultnormal_vertex path).
vec4 a3dPrd04TangentWorld( const in mat3 skinnedModel, const in vec4 tangent ) {

	return vec4( normalize( skinnedModel * tangent.xyz ), tangent.w );

}

#else

// Re-orthogonalized TBN from interpolated attributes (r185
// normal_fragment_begin.glsl.js:24-28 + Gram-Schmidt; faceDirection applies
// the double-sided flip to both axes, :42-47).
mat3 a3dPrd04TangentFrame( const in vec3 normal, const in vec4 tangent, const in float faceDirection ) {

	vec3 T = normalize( tangent.xyz );
	T = normalize( T - normal * dot( normal, T ) );
	vec3 B = cross( normal, T ) * tangent.w;

	mat3 tbn = mat3( T, B, normal );

	tbn[ 0 ] *= faceDirection;
	tbn[ 1 ] *= faceDirection;

	return tbn;

}

#ifdef A3D_TANGENT_DERIVATIVE

// Derivative fallback frame — Normal Mapping Without Precomputed Tangents
// (r185 getTangentFrame, normalmap_pars_fragment.glsl.js:20-39).
mat3 a3dPrd04GetTangentFrame( const in vec3 eye_pos, const in vec3 surf_norm, const in vec2 uv ) {

	vec3 q0 = dFdx( eye_pos.xyz );
	vec3 q1 = dFdy( eye_pos.xyz );
	vec2 st0 = dFdx( uv.st );
	vec2 st1 = dFdy( uv.st );

	vec3 N = surf_norm; // normalized

	vec3 q1perp = cross( q1, N );
	vec3 q0perp = cross( N, q0 );

	vec3 T = q1perp * st0.x + q0perp * st1.x;
	vec3 B = q1perp * st0.y + q0perp * st1.y;

	float det = max( dot( T, T ), dot( B, B ) );
	float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );

	return mat3( T * scale, B * scale, N );

}

#endif // A3D_TANGENT_DERIVATIVE

#endif // A3D_STAGE_VERTEX
`;

export const A3D_PRD04_TANGENT_FRAME: ShaderChunk = {
	name: "a3d_prd04_tangent_frame",
	owner: "prd04",
	glsl,
	wgsl: A3D_PRD04_TANGENT_FRAME_WGSL,
	stage: "both",
	requires: []
};
