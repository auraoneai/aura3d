/** `#include <a3d_toon>`: banded (cel) lighting helpers. */
export const A3D_TOON_GLSL = /* glsl */ `
float a3dToonRamp(float x, float steps, float soft) {
  float s = max(steps, 1.0);
  float t = clamp(x, 0.0, 1.0) * s;
  float f = floor(t);
  return (f + smoothstep(1.0 - clamp(soft, 1e-3, 1.0), 1.0, t - f)) / s;
}
float a3dToonLight(vec3 n, vec3 lightDir, float steps) {
  return a3dToonRamp(max(dot(n, lightDir), 0.0), steps, 0.15);
}
float a3dToonRim(vec3 n, vec3 viewDir, float width) {
  float f = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
  return smoothstep(1.0 - clamp(width, 1e-3, 1.0), 1.0, f);
}
float a3dToonStep(float x, float edge, float soft) {
  float s = max(soft, 1e-4);
  return smoothstep(edge - s, edge + s, x);
}
`;
