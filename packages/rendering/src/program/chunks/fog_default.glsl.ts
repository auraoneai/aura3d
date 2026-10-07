/**
 * `fog_default` chunk — default `fragment:fog` body helpers.
 * Legacy linear/exp2 fog plus a simple height falloff; the `"volumetric"`
 * variant and wetness are lane 07's C-21 hook — the default emits the linear
 * form under FOG_LINEAR and exp2 under FOG_EXP2 (height falls back to exp2).
 */

export const FOG_DEFAULT_CHUNK_GLSL = /* glsl */ `
#if defined(FOG_LINEAR) || defined(FOG_EXP2) || defined(FOG_HEIGHT)
uniform vec3 u_fogColor;
uniform vec2 u_fogRange;    // near, far
uniform float u_fogDensity;
uniform float u_fogHeightFalloff;
float a3dFogFactor(float depth, float height) {
#ifdef FOG_LINEAR
  return clamp((depth - u_fogRange.x) / max(u_fogRange.y - u_fogRange.x, 0.0001), 0.0, 1.0);
#else
  float density = u_fogDensity;
#ifdef FOG_HEIGHT
  density *= exp(-max(height, 0.0) * u_fogHeightFalloff);
#endif
  float d = density * depth;
  return clamp(1.0 - exp(-d * d), 0.0, 1.0);
#endif
}
vec3 a3dApplyFog(vec3 color, float depth, float height) {
  float f = a3dFogFactor(depth, height);
  return mix(color, u_fogColor, f);
}
#endif
`;
