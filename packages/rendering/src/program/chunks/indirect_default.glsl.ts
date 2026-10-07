/**
 * `indirect_default` chunk — default `fragment:indirect` body helpers.
 *
 * Ambient irradiance is `u_environmentColor * u_environmentIntensity` applied
 * as `irradiance · BRDF_Lambert(diffuseColor)` — the PRD-01 §6.6 1/π ambient
 * (no hemisphere factor). A single environment sampler is declared by feature:
 * `ENVMAP_TYPE_EQUIRECT` (lane-01 default equirect) or `ENVMAP_TYPE_CUBE_UV`
 * (lane 02's C-09 chunk — absent until lane 02 registers; the default body
 * falls back to equirect when that feature bit is set without the cube chunk).
 * Inputs are unit-normalized so the BRDF math is testable alone.
 */

export const INDIRECT_DEFAULT_CHUNK_GLSL = /* glsl */ `
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
#ifdef ENVMAP_TYPE_EQUIRECT
uniform sampler2D u_environmentMap;
uniform float u_environmentMapIntensity;
vec2 a3dEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dSampleEnvironment(vec3 direction, float lod) {
  // Equirect HDR sample; mip by roughness once lane 02's probe chunk exists.
  return textureLod(u_environmentMap, a3dEquirectUv(direction), lod).rgb * u_environmentMapIntensity;
}
#endif

// Ambient-only path (§6.6): irradiance · BRDF_Lambert(diffuseColor) — the 1/pi ambient.
vec3 a3dAmbientDiffuse(vec3 diffuseContribution) {
  vec3 irradiance = u_environmentColor * u_environmentIntensity;
  return irradiance * BRDF_Lambert(diffuseContribution);
}
`;
