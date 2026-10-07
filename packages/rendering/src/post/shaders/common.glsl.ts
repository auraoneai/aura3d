/**
 * PRD-03 — shared v2/legacy post GLSL chunks.
 *
 * `linearizeDepth` is the §6.11 shared formula (view-space metres).
 * `triangularDither(fragCoord, frame)` is the §1096 dither: a PCG2D integer
 * hash (replacing `fract(sin(dot(...)))`) produces two uniform samples whose
 * sum minus 1 gives the triangular distribution, scaled by 1/255 — ±1 LSB of
 * the 8-bit output, applied at the last write (S12).
 */

export const POST_COMMON_GLSL = /* glsl */ `
float linearizeDepth(float d, float n, float f, bool ortho) {
  float z = d * 2.0 - 1.0;
  return ortho ? mix(n, f, d) : (2.0 * n * f) / (f + n - z * (f - n));
}

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}

// Triangular-PDF dither: (rand0 + rand1 - 1) / 255 → ±1 LSB of 8-bit output.
float triangularDither(vec2 fragCoord, float frame) {
  uvec2 seed = uvec2(fragCoord) + uvec2(uint(frame) * 747796405u);
  vec2 rand = vec2(pcg2d(seed)) / 4294967296.0;
  return (rand.x + rand.y - 1.0) / 255.0;
}
`;
