/**
 * `normal` chunk — shading-normal helpers for generated programs.
 * `FLAT_SHADING` derives the geometric normal with dFdx/dFdy; normal maps use
 * the tangent frame (a_tangent when present, else the screen-space derivative
 * fallback used by three.js perturbNormal2Arb).
 */

export const NORMAL_CHUNK_GLSL = /* glsl */ `
vec3 a3dFlatNormal(vec3 pos) {
  vec3 fdx = dFdx(pos);
  vec3 fdy = dFdy(pos);
  return normalize(cross(fdx, fdy));
}

#ifdef USE_NORMAL_MAP
uniform sampler2D u_normalMap;
uniform float u_normalScale;
// three r185 perturbNormal2Arb: screen-space derivative tangent frame.
vec3 a3dTangentNormal(vec3 pos, vec3 surfaceNormal, vec2 mapUv) {
  vec3 q0 = dFdx(pos);
  vec3 q1 = dFdy(pos);
  vec2 st0 = dFdx(mapUv);
  vec2 st1 = dFdy(mapUv);
  float scale = sign(st1.t * st0.s - st0.t * st1.s);
  vec3 S = normalize((q0 * st1.t - q1 * st0.t) * scale);
  vec3 T = normalize((-q0 * st1.s + q1 * st0.s) * scale);
  vec3 N = normalize(surfaceNormal);
  mat3 tsn = mat3(S, T, N);
  vec3 mapN = texture(u_normalMap, mapUv).xyz * 2.0 - 1.0;
  mapN.xy *= u_normalScale;
  return normalize(tsn * mapN);
}
#endif
`;
