/**
 * a3d_prd04_uv_transform — KHR_texture_transform UV evaluation
 * (PRD-04 §8.10).
 *
 * Ported from three r185:
 *  - Fragment-side UV selection + transform:
 *    `( uvTransform * vec3( texCoord == 1 ? uv1 : uv0, 1 ) ).xy` —
 *    ShaderChunk/uv_pars_fragment + map_fragment convention; the transform
 *    matrix itself is the CPU-built T·R·S 2D affine (uvTransformMatrix in
 *    features.ts Phase 3, matching r185 WebGLUniforms uvTransform path).
 *  - Channel order: the extension's texCoord override picks which UV set a
 *    texture samples; default is set 0 (r185 getUvChannel).
 *
 * Self-contained (no requires). Stage fragment.
 */
import type { ShaderChunk } from "../../contracts/program";

const glsl = /* glsl */ `
// Apply a KHR_texture_transform matrix to the requested UV set.
// m is the CPU-computed T·R·S affine (column-major, z=1 point transform).
// texCoord selects uv0 or uv1 exactly like r185 getUvChannel.
vec2 a3dPrd04UvTransform( const in mat3 m, const in int texCoord, const in vec2 uv0, const in vec2 uv1 ) {

	vec2 uv = ( texCoord == 1 ) ? uv1 : uv0;
	return ( m * vec3( uv, 1.0 ) ).xy;

}

// Identity-transform fast path helper: returns uvN untransformed when the
// caller already knows the transform is identity (avoids a needless mat3
// multiply — r185 skips binding the uniform entirely in that case).
vec2 a3dPrd04UvSelect( const in int texCoord, const in vec2 uv0, const in vec2 uv1 ) {

	return ( texCoord == 1 ) ? uv1 : uv0;

}
`;

export const A3D_PRD04_UV_TRANSFORM: ShaderChunk = {
	name: "a3d_prd04_uv_transform",
	owner: "prd04",
	glsl,
	stage: "fragment",
	requires: []
};
