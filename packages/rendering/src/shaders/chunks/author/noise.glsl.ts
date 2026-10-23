/** `#include <a3d_noise>`: sin-free hashes, value/simplex noise, fbm and ridged noise (2D and 3D). */
export const A3D_NOISE_GLSL = /* glsl */ `
float a3dHash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float a3dHash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 a3dHash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float a3dHash31(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 a3dHash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float a3dValueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a3dHash21(i), a3dHash21(i + vec2(1.0, 0.0)), u.x),
             mix(a3dHash21(i + vec2(0.0, 1.0)), a3dHash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float a3dValueNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = a3dHash31(i), n100 = a3dHash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = a3dHash31(i + vec3(0.0, 1.0, 0.0)), n110 = a3dHash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = a3dHash31(i + vec3(0.0, 0.0, 1.0)), n101 = a3dHash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = a3dHash31(i + vec3(0.0, 1.0, 1.0)), n111 = a3dHash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}
float a3dSimplex2(vec2 p) {
  const float F2 = 0.3660254038;
  const float G2 = 0.2113248654;
  vec2 s = floor(p + (p.x + p.y) * F2);
  vec2 x0 = p - s + (s.x + s.y) * G2;
  vec2 o = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 x1 = x0 - o + G2;
  vec2 x2 = x0 - 1.0 + 2.0 * G2;
  vec3 t = max(0.5 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
  vec3 t2 = t * t;
  vec3 t4 = t2 * t2;
  vec2 g0 = a3dHash22(s) * 2.0 - 1.0;
  vec2 g1 = a3dHash22(s + o) * 2.0 - 1.0;
  vec2 g2 = a3dHash22(s + 1.0) * 2.0 - 1.0;
  vec3 v = vec3(dot(g0, x0), dot(g1, x1), dot(g2, x2));
  return clamp(70.0 * dot(t4, v), -1.0, 1.0);
}
float a3dFbm(vec2 p, int octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * a3dValueNoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float a3dFbm(vec3 p, int octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    s += a * a3dValueNoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float a3dRidged(vec2 p, int octaves) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= octaves) break;
    float n = 1.0 - abs(a3dValueNoise(p) * 2.0 - 1.0);
    s += a * n * n;
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
`;
