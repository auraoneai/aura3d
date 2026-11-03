/**
 * WGSL companion to Aura's tangent-frame operations. Attribute and derivative
 * paths use the same guarded normalization, orthogonal fallback and handedness
 * as the GLSL chunk. The derivative helper is used only in fragment stages.
 */
const wgsl = /* wgsl */ `
fn a3dPrd04SafeNormalize(value: vec3f, fallback: vec3f) -> vec3f {
  let magnitudeSquared = dot(value, value);
  if (magnitudeSquared > 1e-12) {
    return value * inverseSqrt(magnitudeSquared);
  }
  return fallback;
}

fn a3dPrd04TangentWorld(skinnedModel: mat3x3f, tangent: vec4f) -> vec4f {
  return vec4f(a3dPrd04SafeNormalize(skinnedModel * tangent.xyz, vec3f(1.0, 0.0, 0.0)), tangent.w);
}

fn a3dPrd04Orthogonal(n: vec3f) -> vec3f {
  let axis = select(vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(n.z) < 0.9);
  return a3dPrd04SafeNormalize(cross(axis, n), vec3f(1.0, 0.0, 0.0));
}

fn a3dPrd04TangentFrame(normal: vec3f, tangent: vec4f, faceDirection: f32) -> mat3x3f {
  let n = a3dPrd04SafeNormalize(normal, vec3f(0.0, 0.0, 1.0));
  let t = a3dPrd04SafeNormalize(tangent.xyz - n * dot(n, tangent.xyz), a3dPrd04Orthogonal(n));
  let signValue = select(1.0, -1.0, tangent.w < 0.0);
  let b = cross(n, t) * signValue;
  return mat3x3f(t * faceDirection, b * faceDirection, n);
}

fn a3dPrd04GetTangentFrame(position: vec3f, normal: vec3f, uv: vec2f) -> mat3x3f {
  let n = a3dPrd04SafeNormalize(normal, vec3f(0.0, 0.0, 1.0));
  let px = dpdx(position);
  let py = dpdy(position);
  let ux = dpdx(uv);
  let uy = dpdy(uv);
  let determinant = ux.x * uy.y - ux.y * uy.x;
  if (abs(determinant) < 1e-10) {
    let tangent = a3dPrd04Orthogonal(n);
    return mat3x3f(tangent, cross(n, tangent), n);
  }
  let rawTangent = (px * uy.y - py * ux.y) / determinant;
  let rawBitangent = (py * ux.x - px * uy.x) / determinant;
  let tangent = a3dPrd04SafeNormalize(rawTangent - n * dot(n, rawTangent), a3dPrd04Orthogonal(n));
  let handedness = select(1.0, -1.0, dot(cross(n, tangent), rawBitangent) < 0.0);
  return mat3x3f(tangent, cross(n, tangent) * handedness, n);
}
`;

export const A3D_PRD04_TANGENT_FRAME_WGSL = wgsl;
export default wgsl;
