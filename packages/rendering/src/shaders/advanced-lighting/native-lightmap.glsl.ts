/**
 * NativeLightmapBake.createRenderData() uses bottom-left atlas UVs and stores
 * linear irradiance in RGB and chart coverage in alpha. The caller must supply
 * the exact baked UV channel and validate bake provenance before composing
 * it with other lighting. This function returns an unpremultiplied irradiance
 * and its separate bilinearly interpolated coverage. A consumer can blend a
 * replacement as mix(global, local.rgb, local.a), or explicitly add an
 * independent bake as global + local.rgb * local.a. Clamp-to-edge applies
 * inside [0,1], while outside has no influence.
 */
export const NATIVE_LIGHTMAP_GLSL = /* glsl */ `
vec4 a3dNativeLightmapIrradiance(sampler2D source, vec2 uv) {
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
  ivec2 size = textureSize(source, 0);
  vec2 position = uv * vec2(size) - vec2(0.5);
  ivec2 lowRaw = ivec2(floor(position));
  ivec2 lo = clamp(lowRaw, ivec2(0), size - 1);
  ivec2 hi = clamp(lowRaw + ivec2(1), ivec2(0), size - 1);
  vec2 f = fract(position);
  vec4 a = mix(texelFetch(source, ivec2(lo.x, lo.y), 0), texelFetch(source, ivec2(hi.x, lo.y), 0), f.x);
  vec4 b = mix(texelFetch(source, ivec2(lo.x, hi.y), 0), texelFetch(source, ivec2(hi.x, hi.y), 0), f.x);
  vec4 covered = mix(a, b, f.y);
  if (covered.a <= 0.0) return vec4(0.0);
  return vec4(covered.rgb / covered.a, clamp(covered.a, 0.0, 1.0));
}
`;
