/**
 * WGSL twin of a3d_prd04_tangent_frame (PRD-04 §8.11/§8.12): same `a3d_`
 * names, identical math (r185 normal_fragment_begin.glsl.js:24-48,
 * normalmap_pars_fragment.glsl.js:20-39). §8.12: `dpdx`/`dpdy` for the
 * derivative frame. The GLSL `A3D_STAGE_VERTEX`/`A3D_TANGENT_DERIVATIVE` guards
 * are generator-time defines; the twin emits both arms.
 */
const wgsl = /* wgsl */ `
// Vertex arm: world-space tangent + preserved bitangent sign
// (r185 defaultnormal_vertex path).
fn a3dPrd04TangentWorld(skinnedModel: mat3x3f, tangent: vec4f) -> vec4f {
	return vec4f(normalize(skinnedModel * tangent.xyz), tangent.w);
}

// Re-orthogonalized TBN from interpolated attributes (r185
// normal_fragment_begin.glsl.js:24-28 + Gram-Schmidt; faceDirection applies
// the double-sided flip to both axes, :42-47).
fn a3dPrd04TangentFrame(normal: vec3f, tangent: vec4f, faceDirection: f32) -> mat3x3f {
	var T = normalize(tangent.xyz);
	T = normalize(T - normal * dot(normal, T));
	let B = cross(normal, T) * tangent.w;

	var tbn = mat3x3f(T, B, normal);

	tbn[0] = tbn[0] * faceDirection;
	tbn[1] = tbn[1] * faceDirection;

	return tbn;
}

// Derivative fallback frame — Normal Mapping Without Precomputed Tangents
// (r185 getTangentFrame, normalmap_pars_fragment.glsl.js:20-39;
// A3D_TANGENT_DERIVATIVE arm — the generator selects it only when the mesh
// lacks a TANGENT attribute).
fn a3dPrd04GetTangentFrame(eye_pos: vec3f, surf_norm: vec3f, uv: vec2f) -> mat3x3f {
	let q0 = dpdx(eye_pos);
	let q1 = dpdy(eye_pos);
	let st0 = dpdx(uv);
	let st1 = dpdy(uv);

	let N = surf_norm; // normalized

	let q1perp = cross(q1, N);
	let q0perp = cross(N, q0);

	let T = q1perp * st0.x + q0perp * st1.x;
	let B = q1perp * st0.y + q0perp * st1.y;

	let det = max(dot(T, T), dot(B, B));
	let scale = select(inverseSqrt(det), 0.0, det == 0.0);

	return mat3x3f(T * scale, B * scale, N);
}
`;

export const A3D_PRD04_TANGENT_FRAME_WGSL = wgsl;
export default wgsl;
