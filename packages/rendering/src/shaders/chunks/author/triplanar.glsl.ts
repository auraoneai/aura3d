/** `#include <a3d_triplanar>` (fragment stage only): triplanar texture projection. */
export const A3D_TRIPLANAR_GLSL = /* glsl */ `
vec3 a3dTriplanarWeights(vec3 n, float blendBias) {
  vec3 w = max(abs(n) - vec3(clamp(blendBias, 0.0, 0.95)), vec3(0.0));
  float sum = w.x + w.y + w.z;
  return sum > 1e-5 ? w / sum : vec3(0.0, 1.0, 0.0);
}
vec4 a3dTriplanar(sampler2D tex, vec3 p, vec3 n, float scale, float blendBias) {
  vec3 w = a3dTriplanarWeights(n, blendBias);
  vec3 q = p * scale;
  return texture(tex, q.zy) * w.x + texture(tex, q.xz) * w.y + texture(tex, q.xy) * w.z;
}
`;
