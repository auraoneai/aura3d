/** `#include <a3d_fog>`: fog helpers for custom shaders (custom materials do not receive scene fog automatically). */
export const A3D_FOG_GLSL = /* glsl */ `
vec3 a3dFogLinear(vec3 color, vec3 fogColor, float dist, float nearD, float farD) {
  float span = max(farD - nearD, 1e-4);
  return mix(color, fogColor, clamp((dist - nearD) / span, 0.0, 1.0));
}
vec3 a3dFogExp2(vec3 color, vec3 fogColor, float dist, float density) {
  float x = max(density, 0.0) * max(dist, 0.0);
  return mix(color, fogColor, 1.0 - exp(-x * x));
}
vec3 a3dFogHeight(vec3 color, vec3 fogColor, float dist, float worldY, float density, float heightDensity, float heightBase, float heightFalloff, float maxFog) {
  float d = max(dist, 0.0);
  float height = max(0.0, worldY - heightBase);
  float amount = 1.0 - exp(-(density * d + heightDensity * d * exp(-heightFalloff * height)));
  return mix(color, fogColor, clamp(amount, 0.0, clamp(maxFog, 0.0, 1.0)));
}
`;
