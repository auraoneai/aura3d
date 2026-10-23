/**
 * `#include <colorspace_decode>`: `a3dSrgbToLinear`. A custom shader's output is linear light and the output stage
 * sRGB-encodes it, so a display-referred colour (a hex, a three.js ShaderMaterial colour) must be decoded in the
 * shader to show as authored (with `output.toneMapping: "none"`). `#include <colorspace_encode>`: `a3dLinearToSrgb`.
 */
export const COLORSPACE_DECODE_GLSL = /* glsl */ `vec3 a3dSrgbToLinear(vec3 srgb) {
  vec3 c = max(srgb, vec3(0.0));
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec4 a3dSrgbToLinear(vec4 srgba) {
  return vec4(a3dSrgbToLinear(srgba.rgb), srgba.a);
}`;

export const COLORSPACE_ENCODE_GLSL = /* glsl */ `vec3 a3dLinearToSrgb(vec3 lin) {
  vec3 c = max(lin, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec4 a3dLinearToSrgb(vec4 lina) {
  return vec4(a3dLinearToSrgb(lina.rgb), lina.a);
}`;
