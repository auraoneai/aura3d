/** WGSL twin of NATIVE_LIGHTMAP_GLSL; the texture requires no sampler. */
export const NATIVE_LIGHTMAP_WGSL = /* wgsl */ `
fn a3dNativeLightmapIrradiance(source: texture_2d<f32>, uv: vec2f) -> vec4f {
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec4f(0.0); }
  let size = vec2i(textureDimensions(source));
  let position = uv * vec2f(size) - vec2f(0.5);
  let lowRaw = vec2i(floor(position));
  let lo = clamp(lowRaw, vec2i(0), size - vec2i(1));
  let hi = clamp(lowRaw + vec2i(1), vec2i(0), size - vec2i(1));
  let f = fract(position);
  let a = mix(textureLoad(source, vec2i(lo.x, lo.y), 0), textureLoad(source, vec2i(hi.x, lo.y), 0), f.x);
  let b = mix(textureLoad(source, vec2i(lo.x, hi.y), 0), textureLoad(source, vec2i(hi.x, hi.y), 0), f.x);
  let covered = mix(a, b, f.y);
  if (covered.a <= 0.0) { return vec4f(0.0); }
  return vec4f(covered.rgb / covered.a, clamp(covered.a, 0.0, 1.0));
}
`;
