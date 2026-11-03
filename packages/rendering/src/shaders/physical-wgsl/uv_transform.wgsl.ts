/**
 * WGSL companion of Aura's `a3d_prd04_uv_transform` chunk
 * (shaders/physical/uv_transform.glsl.ts), kept operation-for-operation equal
 * to it. KHR_texture_transform applies the affine point transform
 * T * R * S to the texture coordinate set named by `texCoord`; the caller
 * supplies that product as a column-major 3x3 matrix (per-slot `mat3x3f` in
 * the material uniform struct), so uv' = M * (u, v, 1).
 */
const wgsl = /* wgsl */ `
fn a3dPrd04UvSelect(texCoord: i32, uv0: vec2f, uv1: vec2f) -> vec2f {
  return select(uv0, uv1, texCoord == 1);
}

fn a3dPrd04UvTransform(transform: mat3x3f, texCoord: i32, uv0: vec2f, uv1: vec2f) -> vec2f {
  let uv = a3dPrd04UvSelect(texCoord, uv0, uv1);
  let transformed = transform[0] * uv.x + transform[1] * uv.y + transform[2];
  return transformed.xy;
}
`;

export const A3D_PRD04_UV_TRANSFORM_WGSL = wgsl;
export default wgsl;
