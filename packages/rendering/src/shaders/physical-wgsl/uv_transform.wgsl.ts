/**
 * WGSL twin of a3d_prd04_uv_transform (PRD-04 §8.10/§8.12): same `a3d_`
 * names, identical math. §8.12: per-slot `mat3x3<f32>` in a material uniform
 * struct is the caller-side contract; the transform itself is the same
 * T·R·S affine application.
 */
const wgsl = /* wgsl */ `
// Apply a KHR_texture_transform matrix to the requested UV set.
// m is the CPU-computed T·R·S affine (column-major, z=1 point transform).
// texCoord selects uv0 or uv1 exactly like r185 getUvChannel.
fn a3dPrd04UvTransform(m: mat3x3f, texCoord: i32, uv0: vec2f, uv1: vec2f) -> vec2f {
	let uv = select(uv0, uv1, texCoord == 1);
	return (m * vec3f(uv, 1.0)).xy;
}

// Identity-transform fast path: uvN untransformed when the caller already
// knows the transform is identity.
fn a3dPrd04UvSelect(texCoord: i32, uv0: vec2f, uv1: vec2f) -> vec2f {
	return select(uv0, uv1, texCoord == 1);
}
`;

export const A3D_PRD04_UV_TRANSFORM_WGSL = wgsl;
export default wgsl;
