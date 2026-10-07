/**
 * `colorspace` chunk — sRGB encode/decode helpers for generated programs.
 * Texture samplers rely on hardware sRGB decode (SRGB8_ALPHA8); these helpers
 * exist for authored uniform colors (already linear at parse, C-06) and any
 * chunk needing an explicit transfer.
 */

export const COLORSPACE_CHUNK_GLSL = /* glsl */ `
vec3 a3dLinearToSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
vec3 a3dSRGBToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float a3dLuminanceRec709(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;
