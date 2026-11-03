/**
 * Aura implementation of the tangent frame material operation.
 * Its WGSL companion is tracked separately in physical-wgsl/.
 * Equations: per-pixel tangent frame from UV derivatives (PRD-04 §8.12).
 */
import type { ShaderChunk } from "../../contracts/program";
import WGSL from "../physical-wgsl/tangent_frame.wgsl.js";

const glsl = /* glsl */ `
vec3 a3dPrd04SafeNormalize(vec3 value, vec3 fallback) {
  float magnitudeSquared = dot(value, value);
  return magnitudeSquared > 1e-12 ? value * inversesqrt(magnitudeSquared) : fallback;
}
#ifdef A3D_STAGE_VERTEX
vec4 a3dPrd04TangentWorld(mat3 skinnedModel, vec4 tangent) {
  return vec4(a3dPrd04SafeNormalize(skinnedModel * tangent.xyz, vec3(1.0, 0.0, 0.0)), tangent.w);
}
#else
vec3 a3dPrd04Orthogonal(vec3 n) {
  vec3 axis = abs(n.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  return a3dPrd04SafeNormalize(cross(axis, n), vec3(1.0, 0.0, 0.0));
}
mat3 a3dPrd04TangentFrame(vec3 normal, vec4 tangent, float faceDirection) {
  vec3 n = a3dPrd04SafeNormalize(normal, vec3(0.0, 0.0, 1.0));
  vec3 t = a3dPrd04SafeNormalize(tangent.xyz - n * dot(n, tangent.xyz), a3dPrd04Orthogonal(n));
  float signValue = tangent.w < 0.0 ? -1.0 : 1.0;
  vec3 b = cross(n, t) * signValue;
  return mat3(t * faceDirection, b * faceDirection, n);
}
#ifdef A3D_TANGENT_DERIVATIVE
mat3 a3dPrd04GetTangentFrame(vec3 position, vec3 normal, vec2 uv) {
  vec3 n = a3dPrd04SafeNormalize(normal, vec3(0.0, 0.0, 1.0));
  vec3 px = dFdx(position), py = dFdy(position);
  vec2 ux = dFdx(uv), uy = dFdy(uv);
  float determinant = ux.x * uy.y - ux.y * uy.x;
  if (abs(determinant) < 1e-10) {
    vec3 tangent = a3dPrd04Orthogonal(n);
    return mat3(tangent, cross(n, tangent), n);
  }
  vec3 rawTangent = (px * uy.y - py * ux.y) / determinant;
  vec3 rawBitangent = (py * ux.x - px * uy.x) / determinant;
  vec3 tangent = a3dPrd04SafeNormalize(rawTangent - n * dot(n, rawTangent), a3dPrd04Orthogonal(n));
  float handedness = dot(cross(n, tangent), rawBitangent) < 0.0 ? -1.0 : 1.0;
  return mat3(tangent, cross(n, tangent) * handedness, n);
}
#endif
#endif
`;

export const A3D_PRD04_TANGENT_FRAME: ShaderChunk = {
  name: "a3d_prd04_tangent_frame", owner: "prd04", glsl, wgsl: WGSL,
  stage: "both", requires: []
};
