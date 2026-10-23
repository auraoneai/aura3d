/** `#include <a3d_sky>`: cheap procedural sky pieces. `dir` and `sunDir` are normalised world directions. */
export const A3D_SKY_GLSL = /* glsl */ `
vec3 a3dSkyGradient(vec3 dir, vec3 horizon, vec3 zenith, vec3 ground) {
  float h = clamp(dir.y, -1.0, 1.0);
  float up = smoothstep(0.0, 0.65, h);
  float down = smoothstep(0.0, 0.35, -h);
  return mix(mix(horizon, zenith, up), ground, down);
}
float a3dSunDisc(vec3 dir, vec3 sunDir, float angularRadius) {
  float ang = acos(clamp(dot(dir, sunDir), -1.0, 1.0));
  float r = max(angularRadius, 1e-4);
  return 1.0 - smoothstep(r * 0.9, r * 1.05, ang);
}
float a3dSunGlow(vec3 dir, vec3 sunDir, float falloff) {
  float c = clamp(dot(dir, sunDir), -1.0, 1.0);
  return exp((c - 1.0) * max(falloff, 1e-3));
}
vec3 a3dHorizonHaze(vec3 dir, vec3 color, float thickness) {
  float t = max(thickness, 1e-3);
  return color * (1.0 - smoothstep(0.0, t, abs(dir.y)));
}
float a3dStars(vec3 dir, float density) {
  vec3 cell = floor(dir * 180.0);
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  return step(1.0 - clamp(density, 0.0, 1.0), h) * smoothstep(0.0, 0.3, dir.y);
}
`;
