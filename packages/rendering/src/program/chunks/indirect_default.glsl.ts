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
 *
 * #1140: the equirect sampler is the renderer's `environmentMapTexture` — the
 * same texture the flag-off path samples — bound by ForwardPass
 * `applyGeneratedEnvironmentMapUniforms`. Its UV convention (v = 0 at +Y, plus
 * `u_environmentMapRotation` turns) and decode (`u_environmentMapEncoding`:
 * 0 srgb (hardware-decoded at upload), 1 rgbe, 2 linear) match that texture's
 * flag-off sampling. Callers pass `lod` on a normalized 0..8 roughness scale
 * (`roughness * 8.0`; lane-04 lobe calls use the same scale); it is remapped
 * onto the bound texture's real mip range (`u_environmentMapMaxLod`).
 */

export const INDIRECT_DEFAULT_CHUNK_GLSL = /* glsl */ `
uniform vec3 u_environmentColor;
uniform float u_environmentIntensity;
#ifdef ENVMAP_TYPE_EQUIRECT
uniform sampler2D u_environmentMap;
uniform float u_environmentMapIntensity;
uniform float u_environmentMapRotation;
uniform float u_environmentMapMaxLod;
uniform float u_environmentMapEncoding;
vec2 a3dEquirectUv(vec3 direction) {
  vec3 d = normalize(direction);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5 + u_environmentMapRotation;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2(fract(u), clamp(v, 0.0, 1.0));
}
vec3 a3dDecodeEnvironment(vec4 texel) {
  if (u_environmentMapEncoding > 0.5 && u_environmentMapEncoding < 1.5) {
    float exponent = texel.a * 255.0;
    float scale = exponent <= 0.0 ? 0.0 : exp2(exponent - 128.0) * (255.0 / 256.0);
    return max(texel.rgb * scale, vec3(0.0));
  }
  return max(texel.rgb, vec3(0.0));
}
vec3 a3dSampleEnvironment(vec3 direction, float lod) {
  float mip = clamp(lod, 0.0, 8.0) * (u_environmentMapMaxLod / 8.0);
  return a3dDecodeEnvironment(textureLod(u_environmentMap, a3dEquirectUv(direction), mip)) * u_environmentMapIntensity;
}
#endif

// Ambient-only path (§6.6): irradiance · BRDF_Lambert(diffuseColor) — the 1/pi ambient.
vec3 a3dAmbientDiffuse(vec3 diffuseContribution) {
  vec3 irradiance = u_environmentColor * u_environmentIntensity;
  return irradiance * BRDF_Lambert(diffuseContribution);
}
`;
