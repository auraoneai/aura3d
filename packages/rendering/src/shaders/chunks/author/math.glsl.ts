/** `#include <a3d_math>`: total (never NaN/Inf) math helpers for author shaders. No `pow`, so it composes with the safe-pow define. */
export const A3D_MATH_GLSL = /* glsl */ `
float a3dSaturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 a3dSaturate(vec2 x) { return clamp(x, vec2(0.0), vec2(1.0)); }
vec3 a3dSaturate(vec3 x) { return clamp(x, vec3(0.0), vec3(1.0)); }
vec4 a3dSaturate(vec4 x) { return clamp(x, vec4(0.0), vec4(1.0)); }
float a3dSq(float x) { return x * x; }
float a3dLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float a3dSafeDiv(float a, float b) {
  float d = abs(b) < 1e-20 ? (b < 0.0 ? -1e-20 : 1e-20) : b;
  return a / d;
}
vec3 a3dSafeDiv(vec3 a, float b) {
  float d = abs(b) < 1e-20 ? (b < 0.0 ? -1e-20 : 1e-20) : b;
  return a / d;
}
float a3dSafeSqrt(float x) { return sqrt(max(x, 0.0)); }
float a3dSafeAcos(float x) { return acos(clamp(x, -1.0, 1.0)); }
float a3dSafeAsin(float x) { return asin(clamp(x, -1.0, 1.0)); }
vec2 a3dSafeNormalize(vec2 v, vec2 fallback) {
  float l2 = dot(v, v);
  return l2 > 1e-20 ? v * inversesqrt(l2) : fallback;
}
vec3 a3dSafeNormalize(vec3 v, vec3 fallback) {
  float l2 = dot(v, v);
  return l2 > 1e-20 ? v * inversesqrt(l2) : fallback;
}
vec2 a3dSafeNormalize(vec2 v) { return a3dSafeNormalize(v, vec2(1.0, 0.0)); }
vec3 a3dSafeNormalize(vec3 v) { return a3dSafeNormalize(v, vec3(0.0, 1.0, 0.0)); }
float a3dRemap(float x, float inLo, float inHi, float outLo, float outHi) {
  float d = inHi - inLo;
  d = abs(d) < 1e-20 ? (d < 0.0 ? -1e-20 : 1e-20) : d;
  return outLo + (x - inLo) / d * (outHi - outLo);
}
float a3dFinite(float x) { return (isnan(x) || isinf(x)) ? 0.0 : x; }
vec3 a3dFinite(vec3 v) { return vec3(a3dFinite(v.x), a3dFinite(v.y), a3dFinite(v.z)); }
vec4 a3dFinite(vec4 v) { return vec4(a3dFinite(v.x), a3dFinite(v.y), a3dFinite(v.z), a3dFinite(v.w)); }
mat2 a3dRot2(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat2(c, s, -s, c);
}
`;
