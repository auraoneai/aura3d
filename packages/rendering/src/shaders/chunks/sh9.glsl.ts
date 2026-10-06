/**
 * a3d_prd02_sh9 — SH9 irradiance evaluation (PRD-02 §8).
 * Coefficient order and irradiance basis scale match
 * environment/SphericalHarmonics.ts exactly (c0, -c1y, c1z, -c1x,
 * c2xy, c2yz, c3(3z²−1), c2xz, c4(x²−y²)). The shTexture is a 9×1 RGBA32F
 * strip of RGB radiance coefficients produced by projectCubeToSH9.
 */
export const SH9_CHUNK_GLSL = /* glsl */ `
uniform sampler2D u_sh9Texture;
uniform int u_sh9Bound; // 0 = no SH bound; callers must keep a fallback

// f = per-channel vec3 coefficient texture, index 0..8
vec3 a3d_sh9Coefficient(int i) {
  return texelFetch(u_sh9Texture, ivec2(i, 0), 0).rgb;
}

// SH basis evaluated at n — basis[k] times Ahat_l scale, matching
// foldIrradianceBasis() on the CPU side.
void a3d_sh9IrradianceBasis(vec3 n, out float b[9]) {
  const float c0 = 0.282095 * 0.886227;
  const float c1 = 0.488603 * 1.023328;
  const float c2 = 1.092548 * 0.858086;
  const float c3 = 0.315392 * 0.247708;
  const float c4 = 0.546274 * 0.429043;
  const float c2yz = 1.092548 * 0.858086;
  const float c2xz = 1.092548 * 0.858086;
  b[0] = c0;
  b[1] = -c1 * n.y;
  b[2] = c1 * n.z;
  b[3] = -c1 * n.x;
  b[4] = c2 * (n.x * n.y);
  b[5] = c2yz * (n.y * n.z);
  b[6] = c3 * (3.0 * n.z * n.z - 1.0);
  b[7] = c2xz * (n.x * n.z);
  b[8] = c4 * (n.x * n.x - n.y * n.y);
}

vec3 a3d_sh9Irradiance(vec3 n) {
  float b[9];
  a3d_sh9IrradianceBasis(normalize(n), b);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 9; i += 1) {
    acc += a3d_sh9Coefficient(i) * b[i];
  }
  return max(acc, vec3(0.0));
}
`;
